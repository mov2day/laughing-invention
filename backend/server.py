"""
TestCapture AI — Backend API (Team & License server)

This backend is OPTIONAL. The Chrome extension and hosted web demo
work fully standalone (all AI calls happen client-side — Copilot / Anthropic / OpenAI / offline).

Purpose of this server:
  - Activation-key-gated paid features for teams:
    * POST /api/license/activate   → validate an activation key
    * GET  /api/license/status     → check an issued token
    * POST /api/team/sessions      → share a recorded session with your team
    * GET  /api/team/sessions      → list team sessions (LicenseRequired)
    * GET  /api/team/sessions/{id} → fetch one
    * DELETE /api/team/sessions/{id}
    * POST /api/team/invite        → create an invite token
    * POST /api/team/join          → redeem an invite token
  - Backward-compat:
    * POST /api/generate-script    → LEGACY. Kept so older clients still work.

Activation keys are seeded in `licenses` collection on startup:
    TC-DEMO-TEAM-2026 → free "team" plan (5 seats)
    TC-PRO-2026       → "pro" plan (25 seats)
    TC-ENT-2026       → "enterprise" plan (unlimited)

Seats are soft-counted per team_id. A seat is consumed when a new member joins.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
LICENSE_SIGNING_SECRET = os.environ.get("LICENSE_SIGNING_SECRET", "testcapture-dev-secret-rotate-me")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI(title="TestCapture AI — Team Backend", version="1.1.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("testcapture")

# --------------------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------------------
class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    project: Optional[str] = "default"
    status: str = "saved"
    startTime: int
    targetOrigin: Optional[str] = None
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    selectedFramework: str = "playwright"
    generatedCode: Dict[str, str] = Field(default_factory=dict)
    team_id: Optional[str] = None
    shared_by: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionCreate(BaseModel):
    name: str
    project: Optional[str] = "default"
    startTime: int
    targetOrigin: Optional[str] = None
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    selectedFramework: str = "playwright"
    generatedCode: Dict[str, str] = Field(default_factory=dict)


class ActivateRequest(BaseModel):
    key: str
    device_id: Optional[str] = None  # optional marker for tracking which device activated


class ActivateResponse(BaseModel):
    valid: bool
    plan: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    team_id: Optional[str] = None
    seats_used: Optional[int] = None
    seats_total: Optional[int] = None
    token: Optional[str] = None  # opaque license token, pass as X-License-Token
    message: Optional[str] = None


class InviteRequest(BaseModel):
    email: Optional[str] = None  # optional metadata; not used for auth


class InviteResponse(BaseModel):
    invite_token: str
    expires_at: datetime
    team_id: str


class JoinRequest(BaseModel):
    invite_token: str


class LicenseStatus(BaseModel):
    valid: bool
    plan: Optional[str] = None
    team_id: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    seats_used: Optional[int] = None
    seats_total: Optional[int] = None


# --------------------------------------------------------------------------------------
# License seeding
# --------------------------------------------------------------------------------------
SEED_LICENSES = [
    {"key": "TC-DEMO-TEAM-2026", "plan": "team", "seats_total": 5,
     "features": ["team_sessions", "invites"]},
    {"key": "TC-PRO-2026", "plan": "pro", "seats_total": 25,
     "features": ["team_sessions", "invites", "sso"]},
    {"key": "TC-ENT-2026", "plan": "enterprise", "seats_total": 10_000,
     "features": ["team_sessions", "invites", "sso", "audit_log"]},
]


@app.on_event("startup")
async def seed_licenses():
    for lic in SEED_LICENSES:
        await db.licenses.update_one(
            {"key": lic["key"]},
            {"$setOnInsert": {**lic, "team_id": f"team-{lic['key'].lower()}", "seats_used": 0,
                              "createdAt": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    logger.info("License seed ensured: %d entries", len(SEED_LICENSES))


# --------------------------------------------------------------------------------------
# Token minting
# --------------------------------------------------------------------------------------
def mint_license_token(key: str, team_id: str, plan: str) -> str:
    payload = f"{key}|{team_id}|{plan}|{secrets.token_hex(8)}"
    sig = hmac.new(LICENSE_SIGNING_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return f"tctk_{sig}.{payload.replace('|', '.')}"


async def _license_doc_from_token(token: str) -> Optional[Dict[str, Any]]:
    if not token or not token.startswith("tctk_"):
        return None
    try:
        _sig, rest = token.split(".", 1)
        key, team_id, plan, _nonce = rest.split(".", 3)
    except Exception:
        return None
    doc = await db.licenses.find_one({"key": key}, {"_id": 0})
    if not doc:
        return None
    if doc.get("team_id") != team_id or doc.get("plan") != plan:
        return None
    return doc


async def require_license(x_license_token: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    doc = await _license_doc_from_token(x_license_token or "")
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid or missing license token")
    return doc


# --------------------------------------------------------------------------------------
# Public health
# --------------------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "TestCapture AI Team Backend", "status": "ok", "version": "1.1.0"}


@api_router.get("/health")
async def health():
    return {"status": "healthy", "time": datetime.now(timezone.utc).isoformat()}


# --------------------------------------------------------------------------------------
# License activation
# --------------------------------------------------------------------------------------
@api_router.post("/license/activate", response_model=ActivateResponse)
async def activate(req: ActivateRequest):
    key = (req.key or "").strip().upper()
    doc = await db.licenses.find_one({"key": key}, {"_id": 0})
    if not doc:
        return ActivateResponse(valid=False, message="Unknown activation key")
    token = mint_license_token(doc["key"], doc["team_id"], doc["plan"])
    return ActivateResponse(
        valid=True,
        plan=doc["plan"],
        features=doc.get("features", []),
        team_id=doc["team_id"],
        seats_used=doc.get("seats_used", 0),
        seats_total=doc.get("seats_total"),
        token=token,
        message=f"Activated under the {doc['plan']} plan",
    )


@api_router.get("/license/status", response_model=LicenseStatus)
async def license_status(lic: Dict[str, Any] = Depends(require_license)):
    return LicenseStatus(
        valid=True,
        plan=lic["plan"],
        team_id=lic["team_id"],
        features=lic.get("features", []),
        seats_used=lic.get("seats_used", 0),
        seats_total=lic.get("seats_total"),
    )


# --------------------------------------------------------------------------------------
# Team sessions (shared)
# --------------------------------------------------------------------------------------
@api_router.post("/team/sessions", response_model=Session)
async def create_team_session(payload: SessionCreate, lic: Dict[str, Any] = Depends(require_license)):
    if "team_sessions" not in lic.get("features", []):
        raise HTTPException(status_code=403, detail="Team sessions not included in this plan")
    session = Session(
        name=payload.name,
        project=payload.project or "default",
        startTime=payload.startTime,
        targetOrigin=payload.targetOrigin,
        steps=payload.steps,
        selectedFramework=payload.selectedFramework,
        generatedCode=payload.generatedCode or {},
        team_id=lic["team_id"],
        shared_by="extension",
    )
    doc = session.model_dump()
    doc["createdAt"] = doc["createdAt"].isoformat()
    await db.team_sessions.insert_one(doc)
    return session


@api_router.get("/team/sessions", response_model=List[Session])
async def list_team_sessions(lic: Dict[str, Any] = Depends(require_license)):
    cursor = db.team_sessions.find({"team_id": lic["team_id"]}, {"_id": 0}).sort("createdAt", -1)
    out: List[Session] = []
    async for d in cursor:
        if isinstance(d.get("createdAt"), str):
            d["createdAt"] = datetime.fromisoformat(d["createdAt"])
        out.append(Session(**d))
    return out


@api_router.get("/team/sessions/{session_id}", response_model=Session)
async def get_team_session(session_id: str, lic: Dict[str, Any] = Depends(require_license)):
    d = await db.team_sessions.find_one({"id": session_id, "team_id": lic["team_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Team session not found")
    if isinstance(d.get("createdAt"), str):
        d["createdAt"] = datetime.fromisoformat(d["createdAt"])
    return Session(**d)


@api_router.delete("/team/sessions/{session_id}")
async def delete_team_session(session_id: str, lic: Dict[str, Any] = Depends(require_license)):
    r = await db.team_sessions.delete_one({"id": session_id, "team_id": lic["team_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Team session not found")
    return {"deleted": True}


# --------------------------------------------------------------------------------------
# Invites
# --------------------------------------------------------------------------------------
@api_router.post("/team/invite", response_model=InviteResponse)
async def team_invite(req: InviteRequest, lic: Dict[str, Any] = Depends(require_license)):
    if "invites" not in lic.get("features", []):
        raise HTTPException(status_code=403, detail="Invites not included in this plan")
    invite_token = f"tci_{secrets.token_urlsafe(16)}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.invites.insert_one({
        "token": invite_token,
        "team_id": lic["team_id"],
        "email": req.email,
        "expires_at": expires_at.isoformat(),
        "used": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    return InviteResponse(invite_token=invite_token, expires_at=expires_at, team_id=lic["team_id"])


@api_router.post("/team/join", response_model=ActivateResponse)
async def team_join(req: JoinRequest):
    inv = await db.invites.find_one({"token": req.invite_token}, {"_id": 0})
    if not inv or inv.get("used"):
        return ActivateResponse(valid=False, message="Invalid or already-used invite")
    try:
        exp = datetime.fromisoformat(inv["expires_at"])
    except Exception:
        exp = datetime.now(timezone.utc)
    if exp < datetime.now(timezone.utc):
        return ActivateResponse(valid=False, message="Invite expired")

    lic = await db.licenses.find_one({"team_id": inv["team_id"]}, {"_id": 0})
    if not lic:
        return ActivateResponse(valid=False, message="License for team not found")
    seats_total = lic.get("seats_total") or 0
    seats_used = lic.get("seats_used", 0)
    if seats_total and seats_used >= seats_total:
        return ActivateResponse(valid=False, message="No seats available on this plan")

    await db.licenses.update_one({"key": lic["key"]}, {"$inc": {"seats_used": 1}})
    await db.invites.update_one({"token": req.invite_token}, {"$set": {"used": True}})
    token = mint_license_token(lic["key"], lic["team_id"], lic["plan"])
    return ActivateResponse(
        valid=True, plan=lic["plan"], features=lic.get("features", []),
        team_id=lic["team_id"], seats_used=seats_used + 1, seats_total=seats_total,
        token=token, message="Joined team",
    )


# --------------------------------------------------------------------------------------
# LEGACY: generate-script proxy (deprecated — extension now calls AI directly)
# --------------------------------------------------------------------------------------
class GenerateScriptRequest(BaseModel):
    session: Dict[str, Any]
    framework: str = "playwright"
    model: Optional[str] = None
    apiKey: Optional[str] = None
    provider: Optional[str] = "anthropic"


class GenerateScriptResponse(BaseModel):
    framework: str
    code: str
    model: str
    provider: str


def _offline_generate(session: Dict[str, Any], framework: str) -> str:
    # Minimal server-side fallback for legacy clients; matches extension/ai.js offline output shape.
    steps = session.get("steps", [])
    name = session.get("name", "Recorded test")
    origin = session.get("targetOrigin") or "https://example.com"
    if framework == "playwright":
        lines = ["import { test, expect } from '@playwright/test';", "",
                 f"test('{name}', async ({{ page }}) => {{", f"  await page.goto('{origin}');"]
        for s in steps:
            sv = (s.get("selector") or {}).get("value", "")
            if s.get("type") == "click":
                lines.append(f"  await page.locator('{sv}').click();")
            elif s.get("type") == "type":
                lines.append(f"  await page.locator('{sv}').fill('{s.get('value','')}');")
            elif s.get("type") == "navigate":
                lines.append(f"  await page.goto('{s.get('value','')}');")
            elif s.get("type") == "validate":
                lines.append(f"  await expect(page.locator('{sv}')).toContainText('{s.get('value','')}');")
        lines.append("});")
        return "\n".join(lines)
    return f"// legacy fallback for {framework}\n// {len(steps)} steps captured"


@api_router.post("/generate-script", response_model=GenerateScriptResponse)
async def legacy_generate_script(req: GenerateScriptRequest):
    framework = (req.framework or "playwright").lower()
    code = _offline_generate(req.session, framework)
    return GenerateScriptResponse(
        framework=framework,
        code=f"// [LEGACY] Extension now calls providers directly. Upgrade to v1.1+ to use Copilot/Anthropic/OpenAI from the client.\n{code}",
        model="legacy-offline",
        provider="local",
    )


# --------------------------------------------------------------------------------------
# Wire up
# --------------------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*", "X-License-Token"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
