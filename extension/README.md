# TestCapture AI — Chrome Extension (MV3)

A dual-mode browser extension that records user interactions on any web page and generates clean automation scripts in **Playwright, Cypress, Selenium, or Karate** — powered by Claude.

## Features

- **Popup Recorder** (380×560px): start/stop/pause, live step counter + timer, framework picker, one-click copy/export.
- **Full-tab Dashboard**: scrollable Action Timeline, syntax-highlighted code editor, Element Inspector with selector stability scoring.
- **Multi-priority selector engine**: `data-testid` → `aria-label` → `role+text` → `id` → CSS path → XPath.
- **Shift+Click** on any element during recording to capture it as an **assertion** instead of a click.
- **Password redaction** (values in `<input type="password">` become `********` before any AI call).
- **Local-first**: all sessions persisted to `chrome.storage.local`. No cloud required.
- **Bring your own Claude key**, or point the extension at your self-hosted FastAPI proxy.

## Install (Load Unpacked)

1. Clone / copy this `extension/` folder to your machine.
2. Open **chrome://extensions** in Chrome or Edge.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `extension/` folder.
5. Pin the TestCapture AI icon to your toolbar. That's it.

## Configure

Click the **⚙ Settings** icon in the popup (or the **SETTINGS** button in the full-tab dashboard):

- **Anthropic API Key** — optional; used only if you provide a **Proxy URL**. Obtain one from https://console.anthropic.com/.
- **Model** — `claude-sonnet-4-5-20250929` (default), opus, or haiku.
- **Proxy URL** — your backend's `/api` base URL (e.g. `https://your-app.example.com/api`). The bundled FastAPI backend in `/app/backend/` already exposes `POST /api/generate-script` which accepts `{ session, framework, apiKey?, model? }`. If you leave this blank, the extension falls back to a clean deterministic offline template.

## Record a Test

1. Navigate to the page you want to test.
2. Click the TestCapture icon → enter a test name → **RECORD**.
3. Interact with the page as you normally would.
4. **Shift+Click** an element to add an **assertion** step.
5. Click **STOP** when done.
6. Pick a framework (Playwright/Cypress/Selenium/Karate) and hit **COPY** or **EXPORT**.
7. For deeper review/editing, click **DASHBOARD →** to open the full-tab view.

## File Layout

```
extension/
├── manifest.json        # MV3 manifest
├── background.js        # Service worker (state, session storage, messaging)
├── content.js           # Injected capture script (clicks, input, navigate, select)
├── lib/selector.js      # Multi-priority selector resolver
├── popup.html/.css/.js  # 380×560 popup recorder
├── dashboard.html/.css/.js  # Full-tab review/editor surface
└── icons/               # 16/32/48/128 PNG icons
```

## Troubleshooting

- **Nothing is captured**: ensure the page you're recording wasn't opened before you started recording — or simply refresh it once recording starts. Some very strict CSP contexts (banking sites, chrome:// pages) block content scripts.
- **Paused recording**: the red `● REC` indicator in the bottom-right of the page disappears while paused.
- **Reset**: in DevTools → Application → Storage, clear extension local storage. Or uninstall / reinstall the extension.

## Safari / Edge

- **Edge** is MV3-compatible out-of-the-box — use the same folder with "Load unpacked" in `edge://extensions`.
- **Safari** requires wrapping with Xcode (`safari-web-extension-converter`) and an Apple Developer account — this is a build-pipeline step, not a code change.
