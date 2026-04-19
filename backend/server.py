"""
TestCapture AI — Backend API
Serves:
  - /api/generate-script  : Proxies session data to Claude and returns generated test code
  - /api/sessions         : CRUD for demo/shared sessions (MongoDB)
  - /api/health           : health check
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --------------------------------------------------------------------------------------
# Infrastructure
# --------------------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="TestCapture AI API", version="1.0.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("testcapture")


# --------------------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------------------
class SelectorResult(BaseModel):
    model_config = ConfigDict(extra="allow")
    strategy: str
    value: str
    stability: str = "medium"  # high | medium | low
    alternatives: List[Dict[str, str]] = Field(default_factory=list)


class Assertion(BaseModel):
    type: str
    target: Optional[str] = None
    expected: Optional[str] = None


class RecordedStep(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    stepNumber: int
    type: str
    label: str
    timestamp: int
    selector: Optional[SelectorResult] = None
    value: Optional[str] = None
    assertions: List[Assertion] = Field(default_factory=list)
    screenshot: Optional[str] = None
    elementProps: Dict[str, Any] = Field(default_factory=dict)
    annotation: Optional[str] = None
    url: Optional[str] = None


class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    project: Optional[str] = "default"
    status: str = "saved"
    startTime: int
    targetOrigin: Optional[str] = None
    steps: List[RecordedStep] = Field(default_factory=list)
    selectedFramework: str = "playwright"
    generatedCode: Dict[str, str] = Field(default_factory=dict)
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionCreate(BaseModel):
    name: str
    project: Optional[str] = "default"
    startTime: int
    targetOrigin: Optional[str] = None
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    selectedFramework: str = "playwright"


class GenerateScriptRequest(BaseModel):
    session: Dict[str, Any]
    framework: str = "playwright"
    model: Optional[str] = None
    apiKey: Optional[str] = None  # If provided, use user's own Anthropic key
    provider: Optional[str] = "anthropic"


class GenerateScriptResponse(BaseModel):
    framework: str
    code: str
    model: str
    provider: str


# --------------------------------------------------------------------------------------
# Routes: meta
# --------------------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "TestCapture AI", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "healthy", "time": datetime.now(timezone.utc).isoformat()}


# --------------------------------------------------------------------------------------
# Routes: sessions
# --------------------------------------------------------------------------------------
@api_router.post("/sessions", response_model=Session)
async def create_session(payload: SessionCreate):
    session = Session(
        name=payload.name,
        project=payload.project or "default",
        startTime=payload.startTime,
        targetOrigin=payload.targetOrigin,
        steps=[RecordedStep(**s) for s in payload.steps],
        selectedFramework=payload.selectedFramework,
    )
    doc = session.model_dump()
    doc["createdAt"] = doc["createdAt"].isoformat()
    await db.sessions.insert_one(doc)
    return session


@api_router.get("/sessions", response_model=List[Session])
async def list_sessions():
    docs = await db.sessions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(200)
    result = []
    for d in docs:
        if isinstance(d.get("createdAt"), str):
            d["createdAt"] = datetime.fromisoformat(d["createdAt"])
        result.append(Session(**d))
    return result


@api_router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str):
    doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    if isinstance(doc.get("createdAt"), str):
        doc["createdAt"] = datetime.fromisoformat(doc["createdAt"])
    return Session(**doc)


@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    r = await db.sessions.delete_one({"id": session_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


# --------------------------------------------------------------------------------------
# Claude proxy
# --------------------------------------------------------------------------------------
SYSTEM_PROMPT = """You are an expert Test Automation Engineer. Given a recorded browser session (JSON of user steps including selectors, values, and assertions), you produce a single, clean, runnable automation script in the requested framework.

Rules:
- Output ONLY the code. No markdown fences, no commentary, no explanations.
- Use the highest-priority selector available per step (prefer data-testid > aria-label > role > id > CSS > XPath).
- Add concise inline comments matching the step labels.
- Preserve the order of steps exactly.
- For password fields, values will already be redacted as "********" — keep a placeholder variable instead.
- Ensure the script is production-shaped: waits on navigation, appropriate asserts, proper imports, and a single test function.
- Target the latest stable version of the framework."""


FRAMEWORK_TEMPLATES = {
    "playwright": "Language: TypeScript. Use @playwright/test. Export one test().",
    "cypress": "Language: JavaScript. Use describe/it. Cypress 13+. Use cy.* chain.",
    "selenium": "Language: Python. Use selenium 4, webdriver-manager, pytest-style function.",
    "karate": "Language: Karate DSL (.feature). Use Feature/Scenario/Given/When/Then.",
}


def _fallback_generate(session: Dict[str, Any], framework: str) -> str:
    """Offline deterministic template used when no LLM key is available."""
    steps = session.get("steps", [])
    name = session.get("name", "Recorded test")
    origin = session.get("targetOrigin") or "https://example.com"
    lines: List[str] = []

    if framework == "playwright":
        lines.append("import { test, expect } from '@playwright/test';")
        lines.append("")
        lines.append(f"test('{name}', async ({{ page }}) => {{")
        lines.append(f"  await page.goto('{origin}');")
        for s in steps:
            label = s.get("label", s.get("type", "step"))
            sel = (s.get("selector") or {}).get("value") or ""
            strategy = (s.get("selector") or {}).get("strategy") or "css"
            locator = (
                f"page.getByTestId('{sel}')" if strategy == "data-testid"
                else f"page.getByRole('{sel}')" if strategy == "role"
                else f"page.getByLabel('{sel}')" if strategy == "aria-label"
                else f"page.locator('{sel}')"
            )
            if s["type"] == "click":
                lines.append(f"  // {label}")
                lines.append(f"  await {locator}.click();")
            elif s["type"] == "type":
                val = s.get("value", "")
                lines.append(f"  // {label}")
                lines.append(f"  await {locator}.fill('{val}');")
            elif s["type"] == "navigate":
                lines.append(f"  await page.goto('{s.get('value','')}');")
            elif s["type"] == "validate":
                exp = s.get("value", "")
                lines.append(f"  // Assert: {label}")
                lines.append(f"  await expect({locator}).toContainText('{exp}');")
            elif s["type"] == "select":
                lines.append(f"  await {locator}.selectOption('{s.get('value','')}');")
        lines.append("});")
        return "\n".join(lines)

    if framework == "cypress":
        lines.append(f"describe('{name}', () => {{")
        lines.append(f"  it('runs the captured flow', () => {{")
        lines.append(f"    cy.visit('{origin}');")
        for s in steps:
            sel = (s.get("selector") or {}).get("value") or ""
            strategy = (s.get("selector") or {}).get("strategy") or "css"
            get = f"cy.get('[data-testid=\"{sel}\"]')" if strategy == "data-testid" else f"cy.get('{sel}')"
            if s["type"] == "click":
                lines.append(f"    {get}.click();")
            elif s["type"] == "type":
                lines.append(f"    {get}.type('{s.get('value','')}');")
            elif s["type"] == "navigate":
                lines.append(f"    cy.visit('{s.get('value','')}');")
            elif s["type"] == "validate":
                lines.append(f"    {get}.should('contain.text', '{s.get('value','')}');")
        lines.append("  });")
        lines.append("});")
        return "\n".join(lines)

    if framework == "selenium":
        lines.append("from selenium import webdriver")
        lines.append("from selenium.webdriver.common.by import By")
        lines.append("from selenium.webdriver.support.ui import WebDriverWait")
        lines.append("from selenium.webdriver.support import expected_conditions as EC")
        lines.append("")
        fn_name = name.lower().replace(" ", "_")
        lines.append(f"def test_{fn_name}():")
        lines.append("    driver = webdriver.Chrome()")
        lines.append(f"    driver.get('{origin}')")
        lines.append("    wait = WebDriverWait(driver, 10)")
        for s in steps:
            sel = (s.get("selector") or {}).get("value") or ""
            strategy = (s.get("selector") or {}).get("strategy") or "css"
            by = "By.CSS_SELECTOR" if strategy != "xpath" else "By.XPATH"
            if s["type"] == "click":
                lines.append(f"    wait.until(EC.element_to_be_clickable(({by}, '{sel}'))).click()")
            elif s["type"] == "type":
                lines.append(f"    driver.find_element({by}, '{sel}').send_keys('{s.get('value','')}')")
            elif s["type"] == "navigate":
                lines.append(f"    driver.get('{s.get('value','')}')")
            elif s["type"] == "validate":
                lines.append(f"    assert '{s.get('value','')}' in driver.find_element({by}, '{sel}').text")
        lines.append("    driver.quit()")
        return "\n".join(lines)

    # karate
    lines.append(f"Feature: {name}")
    lines.append("")
    lines.append("  Scenario: Captured flow")
    lines.append("    * configure driver = { type: 'chrome' }")
    lines.append(f"    * driver '{origin}'")
    for s in steps:
        sel = (s.get("selector") or {}).get("value") or ""
        if s["type"] == "click":
            lines.append(f"    * click(\"{sel}\")")
        elif s["type"] == "type":
            lines.append(f"    * input(\"{sel}\", \"{s.get('value','')}\")")
        elif s["type"] == "navigate":
            lines.append(f"    * driver '{s.get('value','')}'")
        elif s["type"] == "validate":
            lines.append(f"    * match text(\"{sel}\") contains \"{s.get('value','')}\"")
    return "\n".join(lines)


@api_router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script(req: GenerateScriptRequest):
    framework = (req.framework or "playwright").lower()
    if framework not in FRAMEWORK_TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unsupported framework: {framework}")

    # Determine key + provider
    user_key = (req.apiKey or "").strip()
    provider = (req.provider or "anthropic").lower()
    model = req.model or ("claude-sonnet-4-5-20250929" if provider == "anthropic" else "gpt-5.1")

    # If user didn't supply a key, fall back to Emergent universal key (works via emergentintegrations)
    emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")
    api_key = user_key or emergent_key

    # Strip screenshots from the payload to keep prompt small
    sanitized = dict(req.session)
    sanitized["steps"] = [
        {k: v for k, v in s.items() if k != "screenshot"} for s in sanitized.get("steps", [])
    ]

    import json as _json

    user_text = (
        f"Framework: {framework}\n"
        f"{FRAMEWORK_TEMPLATES[framework]}\n\n"
        f"Session JSON:\n```json\n{_json.dumps(sanitized, indent=2)}\n```\n\n"
        "Produce the single clean script now."
    )

    if not api_key:
        # No key available — return deterministic offline template.
        code = _fallback_generate(sanitized, framework)
        return GenerateScriptResponse(
            framework=framework, code=code, model="offline-template", provider="local"
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        chat = LlmChat(
            api_key=api_key,
            session_id=f"tc-{uuid.uuid4().hex[:8]}",
            system_message=SYSTEM_PROMPT,
        ).with_model(provider, model)
        response = await chat.send_message(UserMessage(text=user_text))
        # Strip code fences if model wraps them
        code = (response or "").strip()
        if code.startswith("```"):
            parts = code.split("```")
            # ['', 'lang\ncode', ''] or ['', 'code', '']
            if len(parts) >= 2:
                body = parts[1]
                if "\n" in body:
                    body = body.split("\n", 1)[1]
                code = body.strip()
        return GenerateScriptResponse(
            framework=framework, code=code, model=model, provider=provider
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("LLM generation failed: %s", exc)
        # Fall back to offline template so the UI never breaks.
        code = _fallback_generate(sanitized, framework)
        return GenerateScriptResponse(
            framework=framework,
            code=f"// LLM call failed ({exc.__class__.__name__}). Offline template below.\n" + code,
            model="offline-template",
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
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
