# TestCapture AI

> Record web interactions, pick assertions in-page, and generate automated tests (Playwright / Cypress / Selenium / Karate) with GitHub Copilot, Claude, or GPT — all from inside your browser.

TestCapture AI is a **local-first** Chrome / Edge extension and hosted web demo that turns manual QA runs into committable automation code. No SaaS lock-in, no vendor runner, no cloud required.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  chrome://extensions ── Load unpacked ── /app/extension                   │
│                                                                           │
│   🞑 Popup (380×640)          🞑 Full-tab Dashboard                       │
│      ├─ Record / Pause / Stop    ├─ Action Timeline (multi-step edit)    │
│      ├─ Assert Mode toggle       ├─ Code Editor (syntax highlighted)     │
│      ├─ Pick Assertion mode      ├─ Element Inspector (3-tab)            │
│      └─ Provider picker          └─ Team sidebar (if license activated)   │
│                                                                           │
│   ⇒  AI call goes DIRECT from the extension:                             │
│         GitHub Copilot │ Anthropic │ OpenAI │ Offline templates           │
└───────────────────────────────────────────────────────────────────────────┘
```

## What's in this repo

| Path              | What                                                                       |
|-------------------|----------------------------------------------------------------------------|
| `/app/extension/` | **Chrome MV3 extension** — the real product. Load-unpacked and go.        |
| `/app/frontend/`  | React web demo — marketing site + interactive `/dashboard` + `/popup`.    |
| `/app/backend/`   | **Optional** FastAPI team backend (license-gated shared sessions, invites).|
| `/app/docs/`      | Architecture / Providers / Copilot setup / Team / Testing.                 |

## Quick start (2 minutes)

### Install the extension
1. Clone the repo; the extension source is in `/app/extension/` (or download `testcapture-extension.zip` from the web demo's landing page).
2. Open `chrome://extensions` → toggle **Developer mode** (top right) → click **Load unpacked** → pick `/app/extension`.
3. Pin the TestCapture icon. Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> to open the popup any time.

### Connect an AI provider (pick one)
- **GitHub Copilot** (recommended if you already pay for it). Click ⚙ → Provider → GitHub Copilot → **Connect**. A tab opens with the device code. Paste it at github.com/login/device. Done.
- **Anthropic** or **OpenAI** — paste your API key in Settings.
- **Offline** — zero setup, deterministic templates. Always works as a fallback.

### Record a test
1. Navigate to the page under test → click the TestCapture icon → name your test → **RECORD**.
2. Click / type / navigate like a user.
3. Optional assertions:
   - <kbd>Shift</kbd>+<kbd>Click</kbd> — instant `containsText` assertion.
   - **ASSERT MODE** — every click becomes a validate.
   - **PICK ASSERTION** or <kbd>Alt</kbd>+<kbd>Click</kbd> — opens an in-page picker so you can choose the assertion type, the expected value, and the selector strategy.
4. Hit **STOP**, pick a framework (Playwright / Cypress / Selenium / Karate), and press **COPY** or **EXPORT**.

## Architecture highlights

- **Standalone by default.** Extension talks directly to AI providers — no server in the loop.
- **Shadow-DOM picker** — the in-page assertion picker can't be broken by host-page CSS or CSP.
- **Multi-priority selectors** — `data-testid > aria-label > role+text > id > CSS > XPath`, with a stability score shown in the Inspector.
- **Password redaction at source** — `type=password` values are replaced with `********` in the content script before anything is stored.
- **Local-first storage** — `chrome.storage.local` for sessions, Copilot OAuth tokens, and all settings.
- **Team backend is opt-in** — activate a key (free `TC-DEMO-TEAM-2026`) to unlock shared sessions, invites, and seat-counted plans.

## Tests

```bash
# Backend (13 tests — pytest)
cd /app/backend && pytest tests/ -v

# Frontend (16 unit tests — jest)
cd /app/frontend && CI=true yarn test --watchAll=false --testPathPattern='lib/__tests__'
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — AI providers, model selection, CORS notes
- [`docs/GITHUB_COPILOT_SETUP.md`](docs/GITHUB_COPILOT_SETUP.md) — device-flow walkthrough & troubleshooting
- [`docs/TEAM_FEATURES.md`](docs/TEAM_FEATURES.md) — license activation, team sessions, invites, seats
- [`docs/TESTING.md`](docs/TESTING.md) — running the backend + frontend test suites

## License

MIT. See `LICENSE`.
