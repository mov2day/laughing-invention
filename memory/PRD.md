# TestCapture AI — PRD

## Original Problem Statement
User uploaded `TestCaptureAI_Technical_Design_v4.docx` and asked for a complete, production-ready implementation of the dual-mode Chrome extension plus hosted web demo. User choices: **1b** (bring-your-own Anthropic key with Emergent universal-key fallback) and **2b** (Chrome Extension + hosted web demo dashboard).

## Architecture

### 1. Chrome Extension — `/app/extension/` (vanilla MV3, no build step)
- `manifest.json` (MV3, `Alt+Shift+T` shortcut, permissions: `activeTab`, `tabs`, `storage`, `scripting`, `downloads`)
- `background.js` — service worker; owns recording + assert-mode state, full CRUD over sessions, steps, and assertions in `chrome.storage.local`
- `content.js` — event capture with coalesced typing, Shift+Click OR Assert Mode toggle → assertions, password redaction, animated REC/ASSERT indicator
- `lib/selector.js` — multi-priority selector resolver (data-testid → aria-label → role+text → id → CSS path → XPath) + stability scoring
- `popup.html/.css/.js` — 380×560 recorder: timer, step counter, framework picker, **ASSERT MODE** toggle, copy/export (uses chrome.downloads), open-dashboard
- `dashboard.html/.css/.js` — full-tab review: session history sidebar, Action Timeline, syntax-highlighted Code Editor, Element Inspector with **Add Assertion** button, per-assertion remove, step delete
- `icons/` — 16/32/48/128 PNG (generated)
- `README.md` — install-unpacked guide

### 2. Backend — `/app/backend/server.py` (FastAPI)
- `POST /api/generate-script` — Claude via `emergentintegrations.llm.chat.LlmChat`, user-key-or-universal-key, deterministic offline fallback. `_assert_lines()` emits framework-specific assertion code (toBeVisible / should('be.visible') / driver.current_url / match text contains) for all 4 frameworks.
- `POST/GET/DELETE /api/sessions[/{id}]` — MongoDB CRUD via motor
- `GET /api/health`, `GET /api/`

### 3. Hosted Web Demo — `/app/frontend/` (React 19 + CRA + Tailwind + Framer Motion + prism-react-renderer)
- `/` — Landing (hero, dual-mode diagram, bento grid, comparison table)
- `/dashboard` — interactive 3-column control room with 2 pre-seeded sessions
  - **3-tab Inspector**: Selectors / **Assertions** / Properties
  - **AddAssertionModal** with 6 assertion types: containsText, visible, exists, valueEquals, countEquals, urlContains
  - Hover-revealed **Add Assertion** + **Delete** buttons on every step
  - Live-updating code editor as assertions/steps change
  - Inspector collapse toggle for narrow viewports
  - Real AI regeneration button wired to `/api/generate-script`
- `/popup` — 380×560 simulated recorder that auto-advances
- `SettingsModal` — Anthropic key + model + default framework (localStorage `tc_web_settings`)
- Extension ZIP served from `/public/testcapture-extension.zip`

## Implemented

### 2026-01-19 · Iteration 1 (MVP)
- [x] Chrome Extension (MV3) core
- [x] Backend generate-script + sessions CRUD
- [x] Frontend landing + dashboard + popup simulator
- [x] 14/14 backend tests, all frontend flows

### 2026-01-19 · Iteration 2 (bug fixes + assertion authoring)
- [x] **Fix**: `.tc-modal { display:flex }` overriding `[hidden]` attribute in extension → settings overlay covered dashboard. Added `[hidden] { display: none !important; }` to popup.css + dashboard.css.
- [x] **Fix**: Popup export silently failed → added `"downloads"` permission; popup uses `chrome.downloads.download` with `<a>`-click fallback; proper blob lifecycle.
- [x] **Fix**: No assertion UI beyond Shift+Click → added **ASSERT MODE** toggle in popup; **Add Assertion** button + per-step hover actions in dashboard; **Assertions** tab in Inspector.
- [x] Assertion types (6): containsText, visible, exists, valueEquals, countEquals, urlContains — emitted per framework by backend `_assert_lines` and frontend `offlineGenerate`.
- [x] Step deletion + reordering support in background.js (`TC_DELETE_STEP`, `TC_UPDATE_STEP`, `TC_ADD_ASSERTION`, `TC_REMOVE_ASSERTION`).
- [x] Responsive dashboard layout — Inspector collapse toggle for narrow viewports.
- [x] 18/18 backend tests, all frontend flows.

## Prioritised Backlog
- **P1** Screenshot capture per step (`chrome.tabs.captureVisibleTab`) in Inspector
- **P1** Step editing beyond delete (rename label, override selector, annotate)
- **P1** Incremental AI generation during recording (cost-aware batching)
- **P2** Safari build pipeline (`safari-web-extension-converter`)
- **P2** Enterprise sideload packaging (.crx + MDM .mobileconfig)
- **P3** Team cloud sync with E2E encryption

## Personas
- **SDET / QA engineer** — primary user; wants clean, committable code, no vendor runner
- **Full-stack dev** — basic PR coverage without boilerplate
- **Engineering manager** — cares about selector stability and script maintainability

### 2026-01-19 · Iteration 3 (granular assertion control)
- [x] **PICK MODE** — in-page Shadow-DOM-isolated assertion picker (`/app/extension/lib/picker.js`) that opens on click during recording. User chooses assertion type (6 options), tunes the expected value (smart defaults per type), and overrides the selector strategy from a radio-list of priority-ranked alternatives.
- [x] **Alt+Click** shortcut — opens the picker for one click without toggling mode.
- [x] Mutual exclusivity between **ASSERT MODE** (instant) and **PICK MODE** (picker) in background state machine.
- [x] New popup UI — two toggles (green ASSERT MODE + blue PICK ASSERTION) + a kbd shortcut hint row. Popup height bumped to 640px to accommodate.
- [x] Re-inject content script and replay mode state on navigation so picker survives SPAs.
- [x] Live web sandbox on `/popup` so visitors can try the picker flow without installing.
- [x] Landing page feature tile "Granular assertion control" replaces old Shift+Click tile.
- [x] 18/18 backend regression, all frontend flows verified.

