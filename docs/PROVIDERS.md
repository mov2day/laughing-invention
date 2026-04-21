# AI Providers

TestCapture AI supports four providers. Each has different trade-offs on cost, model quality, and setup friction. **All run from the extension directly — the backend is not in the loop for AI calls.**

| Provider        | Cost                            | Quality   | Setup         | Extension | Web demo |
|-----------------|---------------------------------|-----------|---------------|-----------|----------|
| GitHub Copilot  | Your Copilot subscription       | ★★★★☆     | Device flow   | ✓         | ✗ (CORS) |
| Anthropic       | Per-token ($3/M input, Sonnet)  | ★★★★★     | Paste API key | ✓         | ✓        |
| OpenAI          | Per-token ($2.50/M, GPT-4o)     | ★★★★☆     | Paste API key | ✓         | ✓        |
| Offline         | Free                            | ★★★☆☆     | Zero          | ✓         | ✓        |

## GitHub Copilot

### Why
If you pay for Copilot (Business or Individual), you already have access to the same models VSCode uses — GPT-4o, GPT-4.1, Claude 3.5 / 3.7 Sonnet, and o1. TestCapture AI piggybacks on the exact same API that VSCode uses, with the same `Iv1.b507a08c87ecfe98` public client ID.

### Setup (in the extension)
1. Open the popup → ⚙ Settings → Provider → **GitHub Copilot** → **Connect**.
2. A tab opens, a short code is shown (e.g. `WDJB-MJHT`).
3. Click the button — `github.com/login/device` opens. Paste the code.
4. Approve on GitHub. Return to the TestCapture tab; it detects approval automatically and exchanges for a Copilot session token.
5. The Model dropdown populates from `api.githubcopilot.com/models`. Pick whichever you prefer.

### Token lifecycle
- The long-lived OAuth token (`gho_…`) is stored in `chrome.storage.local` as `tc_copilot_gh_token`.
- The short-lived Copilot session token (typically 25–30 min TTL) is in `tc_copilot_session` and auto-refreshed on every API call via `api.github.com/copilot_internal/v2/token`.
- Click **Disconnect** in Settings to remove both.

### Limitations
- **Web demo cannot use Copilot** — GitHub's device flow and Copilot endpoints don't serve CORS headers for arbitrary origins. The browser blocks the call. This is exactly why the extension exists.
- Copilot for Individual has a monthly request cap — hitting it surfaces as a 402/403 from the Copilot API; TestCapture will fall back to the offline template and surface an error toast.

## Anthropic (direct)

1. Generate a key at <https://console.anthropic.com/>.
2. Settings → Provider → **Anthropic** → paste the key.
3. Pick a model: Sonnet 4.5 (default), Opus 4.5, Haiku 4.5. All support the latest messages API.
4. Calls go directly to `api.anthropic.com/v1/messages` with the `anthropic-dangerous-direct-browser-access: true` header.

## OpenAI (direct)

1. Generate a key at <https://platform.openai.com/api-keys>.
2. Settings → Provider → **OpenAI** → paste the key.
3. Model list is fetched from `/v1/models` and filtered to `gpt*` / `o1*`.

## Offline templates

- Zero setup. No key. No network. Deterministic per-framework templates.
- Use it as the default fallback: every provider falls back to offline on error, so your users always see something.
- The Dashboard metadata shows `OFFLINE` or `OFFLINE · FALLBACK` when this path fires.

## Picking a model inside the popup / dashboard

Every provider exposes `listModels(provider)`:
- **Copilot** — hits `/models` on the Copilot token; cached briefly.
- **Anthropic** — curated list (there's no public `/models` endpoint).
- **OpenAI** — `/v1/models` filtered to chat-capable SKUs.
- **Offline** — single `deterministic` entry.

Click the ↻ icon next to the model dropdown to force-refresh.
