"""
Unit + integration tests for the TestCapture AI team backend.
Run with:  cd /app/backend && pytest -v
"""
from __future__ import annotations
import os
import pytest
import httpx
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

from server import app, db  # noqa: E402


@pytest.fixture(scope="session")
async def client():
    # Trigger startup (seed_licenses is idempotent)
    await app.router.startup()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(scope="session")
async def team_token(client: AsyncClient):
    r = await client.post("/api/license/activate", json={"key": "TC-DEMO-TEAM-2026"})
    assert r.status_code == 200
    return r.json()["token"]


class TestPublic:
    async def test_health(self, client):
        r = await client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    async def test_root(self, client):
        r = await client.get("/api/")
        assert r.status_code == 200
        assert "TestCapture" in r.json()["service"]


class TestLicense:
    async def test_activate_demo(self, client):
        r = await client.post("/api/license/activate", json={"key": "TC-DEMO-TEAM-2026"})
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["plan"] == "team"
        assert data["token"].startswith("tctk_")
        assert "team_sessions" in data["features"]

    async def test_activate_case_insensitive(self, client):
        r = await client.post("/api/license/activate", json={"key": "tc-demo-team-2026"})
        assert r.json()["valid"] is True

    async def test_activate_unknown(self, client):
        r = await client.post("/api/license/activate", json={"key": "NOPE-XXXX"})
        assert r.status_code == 200
        assert r.json()["valid"] is False

    async def test_status_requires_token(self, client):
        r = await client.get("/api/license/status")
        assert r.status_code == 401

    async def test_status_with_token(self, client, team_token):
        r = await client.get("/api/license/status", headers={"X-License-Token": team_token})
        assert r.status_code == 200
        assert r.json()["valid"] is True

    async def test_status_with_bad_token(self, client):
        r = await client.get("/api/license/status", headers={"X-License-Token": "tctk_abc.DEF"})
        assert r.status_code == 401


class TestTeamSessions:
    async def test_create_and_list(self, client, team_token):
        payload = {
            "name": "unit-test session",
            "startTime": 1700000000000,
            "targetOrigin": "https://ut.test",
            "steps": [{"id": "1", "type": "click", "label": "x", "selector": {"strategy": "css", "value": "button"}}],
            "selectedFramework": "playwright",
        }
        r = await client.post("/api/team/sessions", json=payload, headers={"X-License-Token": team_token})
        assert r.status_code == 200
        sid = r.json()["id"]

        r = await client.get("/api/team/sessions", headers={"X-License-Token": team_token})
        assert r.status_code == 200
        assert any(s["id"] == sid for s in r.json())

        r = await client.get(f"/api/team/sessions/{sid}", headers={"X-License-Token": team_token})
        assert r.json()["name"] == "unit-test session"

        r = await client.delete(f"/api/team/sessions/{sid}", headers={"X-License-Token": team_token})
        assert r.status_code == 200
        assert r.json()["deleted"] is True

        r = await client.get(f"/api/team/sessions/{sid}", headers={"X-License-Token": team_token})
        assert r.status_code == 404

    async def test_team_sessions_require_license(self, client):
        r = await client.get("/api/team/sessions")
        assert r.status_code == 401


class TestInvites:
    async def test_invite_and_join(self, client, team_token):
        r = await client.post("/api/team/invite", json={"email": "teammate@example.com"},
                              headers={"X-License-Token": team_token})
        assert r.status_code == 200
        invite = r.json()
        assert invite["invite_token"].startswith("tci_")

        r = await client.post("/api/team/join", json={"invite_token": invite["invite_token"]})
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["token"].startswith("tctk_")

        # Re-use should fail
        r = await client.post("/api/team/join", json={"invite_token": invite["invite_token"]})
        assert r.json()["valid"] is False

    async def test_join_bad_token(self, client):
        r = await client.post("/api/team/join", json={"invite_token": "tci_doesnotexist"})
        assert r.json()["valid"] is False


class TestLegacyEndpoint:
    async def test_legacy_generate_script(self, client):
        payload = {
            "session": {
                "name": "legacy",
                "targetOrigin": "https://x.io",
                "steps": [{"id": "1", "type": "click", "label": "btn", "selector": {"strategy": "css", "value": "button"}}],
            },
            "framework": "playwright",
        }
        r = await client.post("/api/generate-script", json=payload)
        assert r.status_code == 200
        out = r.json()
        assert out["provider"] == "local"
        assert "LEGACY" in out["code"]
        assert "test(" in out["code"]
