# Architecture

## Topology

```
┌─────────────────────────┐   direct HTTPS    ┌────────────────────────┐
│ Chrome Extension (MV3)  │ ────────────────▶ │ api.githubcopilot.com  │
│  popup / dashboard      │ ────────────────▶ │ api.anthropic.com      │
│  content.js / picker    │ ────────────────▶ │ api.openai.com         │
└─────────────────────────┘                   └────────────────────────┘
          │  chrome.storage.local
          │    ├─ sessions
          │    ├─ settings (provider, model, keys)
          │    ├─ Copilot tokens (refreshed automatically)
          │    └─ team license (if activated)
          ▼
   ┌─────────────────┐
   │ extension state │
   └─────────────────┘

┌─────────────────────────┐   optional        ┌────────────────────────┐
│ Web Demo (React)        │ ────────────────▶ │ FastAPI Team Backend   │
│  /  /dashboard  /popup  │                   │ (license-gated)        │
└─────────────────────────┘                   │ MongoDB sessions/licenses│
                                               └────────────────────────┘
```

## Key components

### Extension (`/app/extension`)
- **`background.js`** — MV3 service worker, single source of truth for recording state, session persistence, mutually-exclusive assert / pick modes, re-injects content script on navigation.
- **`content.js`** — event capture (click/input/change/pushState), coalesced typing, Shift/Alt/Assert-Mode routing, password redaction.
- **`lib/selector.js`** — multi-priority selector resolver.
- **`lib/picker.js`** — Shadow-DOM-isolated assertion picker.
- **`lib/ai.js`** — unified provider dispatch (Copilot device flow, Anthropic, OpenAI, offline), auto-refreshing Copilot tokens, model listing.
- **`popup.html/js/css`** — 380×640 recorder UI with provider/model selector + assert/pick toggles.
- **`dashboard.html/js/css`** — full-tab review UI mirroring the web demo, with settings, assertions, team license input.
- **`auth.html/js/css`** — dedicated tab for GitHub device-code flow (popups close on focus loss, so this must be a tab).
- **`manifest.json`** — MV3, `downloads` permission for real file exports, host permissions for GitHub / Anthropic / OpenAI endpoints.

### Backend (`/app/backend`) — optional, paid team features
- `POST /api/license/activate` — validates an activation key, mints an opaque `tctk_…` license token (HMAC-signed with `LICENSE_SIGNING_SECRET`).
- `GET /api/license/status` — introspection on the token.
- `POST/GET/DELETE /api/team/sessions` — shared session CRUD, scoped to the license's `team_id`.
- `POST /api/team/invite` / `POST /api/team/join` — seat-counted invite flow.
- `POST /api/generate-script` — legacy; kept so v1.0 clients don't break, but current extensions call AI providers themselves.
- MongoDB collections: `licenses`, `team_sessions`, `invites`.

### Web Demo (`/app/frontend`) — showcase + sandbox
- `/` landing, `/dashboard` interactive demo (pre-seeded sessions), `/popup` embedded popup preview with a live assertion-picker sandbox.
- `lib/ai.js` — browser variant of the AI module (Copilot is CORS-blocked in the browser, so it falls back to offline with a clear error).
- `lib/generate.js` — deterministic offline template (same output shape as extension).
- Includes the `/public/testcapture-extension.zip` for one-click install on the landing page.

## State boundaries

| Source of truth   | Owner                    | Notes                                                    |
|-------------------|--------------------------|----------------------------------------------------------|
| Recording state   | `background.js`          | Broadcast to popup and dashboard via message events      |
| Sessions          | `chrome.storage.local`   | Keyed `tc_session_<uuid>`                                |
| Provider settings | `chrome.storage.local`   | `tc_ai_settings` — provider, model, apiKey, openaiKey   |
| Copilot tokens    | `chrome.storage.local`   | Never transmitted anywhere other than GitHub APIs        |
| Web demo settings | `localStorage`           | Mirrors the extension schema for parity                  |
| Team sessions     | MongoDB (backend only)   | Scoped to `team_id` derived from license                 |

## Data flow: record → AI → output

1. User clicks **RECORD**. `popup.js` sends `TC_START` to `background.js`, which creates a session in storage and injects the content script into the active tab.
2. Every interaction (`click`, `input`, `change`, history push) fires a message `TC_CAPTURE_STEP` from content script to background. Background appends to the active session.
3. User stops recording and clicks **COPY** / **EXPORT** / opens the dashboard. The caller invokes `TCAI.generate({ session, framework })`.
4. `lib/ai.js` dispatches based on the saved provider:
   - **copilot** → ensures a fresh Copilot token (re-exchanges from the `gho_` OAuth token if expired), calls `api.githubcopilot.com/chat/completions`.
   - **anthropic** → `api.anthropic.com/v1/messages`.
   - **openai** → `api.openai.com/v1/chat/completions`.
   - **offline** → deterministic per-framework template, always works.
5. The returned code is handed back to the UI for display, copy, or download.

## Security properties

- All credentials stay in `chrome.storage.local`, which is sandboxed per-extension and never transmitted except to the provider's API.
- Content-script strips `screenshot` from session payloads and redacts `type=password` values at capture time — before storage or any AI call.
- License tokens are HMAC-signed (rotation: change `LICENSE_SIGNING_SECRET` in backend `.env`).
- `anthropic-dangerous-direct-browser-access: true` header is set intentionally because the extension context *is* a safe direct-browser access boundary (no third-party JavaScript can read `chrome.storage`).
