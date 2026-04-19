# TestCapture AI — PRD

## Original Problem Statement
User uploaded `TestCaptureAI_Technical_Design_v4.docx` and asked for a complete, production-ready implementation.

The design describes a **dual-mode Chrome extension (MV3)** for QA engineers:
- **Popup (380×560)**: quick record/stop/export flow
- **Full-tab Dashboard**: scrollable Action Timeline, syntax-highlighted Code Editor, Element Inspector with selector stability scoring
- **AI-generated scripts** in Playwright, Cypress, Selenium, or Karate (via Claude)
- **Local-first** persistence using `chrome.storage.local`, selector ladder (data-testid → aria → role+text → id → CSS → XPath), Shift+Click assertions, password redaction

User choices (2026-01): **1b** — user supplies own Anthropic API key (backend falls back to Emergent universal key); **2b** — Chrome Extension + hosted web demo dashboard.

## Architecture

### 1. Chrome Extension — `/app/extension/`  (vanilla MV3, no build step)
- `manifest.json` (MV3, Alt+Shift+T shortcut, `<all_urls>` with `activeTab`, `storage`, `scripting`)
- `background.js` — service worker, owns recording state, persists to `chrome.storage.local`, re-injects content script on navigation, routes all messages
- `content.js` — event capture (click/input/change/pushState/popstate), Shift+Click = assertion, coalesces keystrokes into single `type` step, password redaction at source
- `lib/selector.js` — multi-priority selector resolver returning `{ strategy, value, stability, alternatives }`
- `popup.html/.css/.js` — 380×560 compact recorder (timer, step counter, framework picker, copy/export/open-dashboard)
- `dashboard.html/.css/.js` — full-tab review with sidebar history, Action Timeline, Code Editor (hand-rolled syntax highlighter), Element Inspector
- `icons/` — 16/32/48/128 PNG (generated with PIL)
- `README.md` — install-unpacked instructions

### 2. Backend — `/app/backend/server.py` (FastAPI)
- `POST /api/generate-script` — accepts `{ session, framework, apiKey?, model?, provider? }`, proxies to Claude via `emergentintegrations.llm.chat.LlmChat`, falls back to **deterministic offline template** if no key or call fails
- `POST/GET/DELETE /api/sessions[/{id}]` — MongoDB-backed CRUD for saved sessions (`motor`)
- `GET /api/health`, `GET /api/`
- EMERGENT_LLM_KEY pre-wired in `/app/backend/.env`

### 3. Hosted Web Demo — `/app/frontend/` (React 19 + CRA + Tailwind + Framer Motion + prism-react-renderer)
- `/` — Landing page (hero, dual-mode diagram, feature bento grid, comparison table, CTA)
- `/dashboard` — fully interactive dashboard demo with 2 pre-seeded sessions, live framework-switching, real AI regeneration via backend
- `/popup` — interactive 380×560 popup simulator (steps auto-advance to show capture flow)
- `SettingsModal` — API key, model, default framework; persisted to `localStorage` (`tc_web_settings`)
- Extension ZIP served from `/public/testcapture-extension.zip`

### Design System (see `/app/design_guidelines.json`)
"Engineered Obsidian" — dark (#0A0A0A), 1px borders, Outfit + Geist + JetBrains Mono, red record accent, grid-skeleton marketing + control-room dashboard.

## Implemented (2026-01-19)
- [x] Chrome Extension (MV3): popup, dashboard, content script, background worker, multi-priority selector resolver, Shift+Click assertions, password redaction, offline code generator fallback
- [x] Backend: `/api/generate-script` (Claude via emergentintegrations, user-key or universal-key), `/api/sessions` CRUD (MongoDB), health endpoint
- [x] Frontend: Landing, Dashboard (3-column control room, syntax-highlighted code, element inspector), Popup simulator, Settings modal
- [x] 4 framework generators wired end-to-end (Playwright/Cypress/Selenium/Karate)
- [x] Extension ZIP downloadable from landing page
- [x] Testing agent: 14/14 backend, all frontend flows verified

## Prioritised Backlog
- **P1** Screenshot capture per step (`chrome.tabs.captureVisibleTab`) + show in Inspector tabs
- **P1** Step editing in Dashboard (reorder, delete, annotate, override selector)
- **P1** Incremental AI generation while recording (cost-aware batching)
- **P2** Assertion authoring UI beyond Shift+Click (value/visibility/count)
- **P2** Safari build pipeline (`safari-web-extension-converter`)
- **P2** Enterprise sideload packaging (`.crx`, MDM-friendly .mobileconfig)
- **P3** Team cloud sync (opt-in) with E2E encryption of session payloads

## Personas
- **SDET / QA engineer** — primary user; wants clean, reviewable code they can commit without a vendor runner
- **Full-stack dev** — needs basic coverage for a PR without writing boilerplate
- **Engineering manager** — cares about selector stability and script maintainability
