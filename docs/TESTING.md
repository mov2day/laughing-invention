# Testing

Three test layers cover the system end-to-end:

| Layer                 | Runner  | Scope                                                  | Count |
|-----------------------|---------|--------------------------------------------------------|-------|
| Backend API           | pytest  | License, team sessions, invites, legacy compat         | 13    |
| Frontend unit / lib   | jest    | Offline generator + AI dispatch + settings persistence | 16    |
| Frontend end-to-end   | testing_agent_v3 (Playwright) | Dashboard / popup / landing flows      | Full  |

## Backend (pytest)

Located in `/app/backend/tests/`. Uses `pytest-asyncio` with a session-scoped event loop so Motor (async MongoDB client) is properly bound to the same loop across tests.

```bash
cd /app/backend
pip install -r requirements.txt            # first time
pytest tests/ -v
```

Expected output:
```
tests/test_api.py::TestPublic::test_health PASSED
tests/test_api.py::TestPublic::test_root PASSED
tests/test_api.py::TestLicense::test_activate_demo PASSED
tests/test_api.py::TestLicense::test_activate_case_insensitive PASSED
tests/test_api.py::TestLicense::test_activate_unknown PASSED
tests/test_api.py::TestLicense::test_status_requires_token PASSED
tests/test_api.py::TestLicense::test_status_with_token PASSED
tests/test_api.py::TestLicense::test_status_with_bad_token PASSED
tests/test_api.py::TestTeamSessions::test_create_and_list PASSED
tests/test_api.py::TestTeamSessions::test_team_sessions_require_license PASSED
tests/test_api.py::TestInvites::test_invite_and_join PASSED
tests/test_api.py::TestInvites::test_join_bad_token PASSED
tests/test_api.py::TestLegacyEndpoint::test_legacy_generate_script PASSED
============================== 13 passed ==============================
```

### What's covered
- `/api/health` and `/api/` return expected shape
- `POST /api/license/activate` — valid key (case-insensitive), unknown key, seat-count exposure
- `GET /api/license/status` — 401 without token, 401 with bad token, 200 with good token
- Full CRUD on `/api/team/sessions` — create, list, get, delete, 404 after delete
- Invite lifecycle — mint, redeem once, redeem-twice rejected, bad-token rejected
- Legacy `/api/generate-script` still returns playwright code with a clear LEGACY notice

## Frontend unit (jest)

Located in `/app/frontend/src/lib/__tests__/`.

```bash
cd /app/frontend
CI=true yarn test --watchAll=false --testPathPattern='lib/__tests__'
```

### What's covered

**`generate.test.js`** (8 tests) — the offline deterministic generator
- playwright: imports + `test()` + `page.goto`, `getByTestId`, structured assertions (`toBeVisible` / `toHaveValue`)
- cypress: `describe` / `it`, `cy.get('[data-testid=…]')`, `should('be.visible')` / `should('have.value', …)`
- selenium: imports + pytest function, `By.CSS_SELECTOR`, `is_displayed()` assertion
- karate: `Feature:` / `Scenario:` headers, `* driver`, `match text contains`
- empty session still produces a valid skeleton
- `role+text` strategy produces `page.getByRole('heading', { name: 'Welcome' })`

**`ai.test.js`** (8 tests) — the AI provider dispatch
- Default provider is `offline`
- `setSettings` persists to localStorage
- `listModels` returns provider defaults and falls back to `deterministic` for unknowns
- Offline dispatch returns valid playwright code
- Copilot in the web demo returns `ok:false` with CORS explanation + offline fallback code
- Anthropic / OpenAI missing-key return offline-fallback code for each framework

## Frontend end-to-end

Invoked via the `testing_agent_v3` tool — drives the live hosted demo with Playwright. Prior iterations produced `iteration_1.json` (14/14 backend, full frontend), `iteration_2.json` (18/18 backend, full frontend), and `iteration_3.json` (18/18 backend, full frontend). The new set covers the provider selector, team activation UI, and team session sharing.

## Extension

The Chrome extension is not driven by automated tests in this environment (no `chrome-extension://` URL under test). Verification is:
1. **File-level grep** — every ship checks that expected symbols exist in `content.js`, `background.js`, `lib/ai.js`, `manifest.json`.
2. **Manual QA** per release — see `/docs/PROVIDERS.md` and `/docs/GITHUB_COPILOT_SETUP.md` for the manual flow walkthrough.

## Linting

```bash
# JS (extension + frontend) — eslint / react-scripts
cd /app/frontend && yarn lint       # optional

# Python — ruff via `mcp_lint_python`
cd /app/backend && ruff check .
```

CI should run: backend pytest → frontend jest → lint — in that order. The extension zip is re-generated on each main-branch merge so the web demo download always matches.
