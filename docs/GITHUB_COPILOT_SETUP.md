# GitHub Copilot Setup

TestCapture AI uses GitHub's **OAuth Device Authorization flow** to access your Copilot subscription. No passwords, no personal access tokens — the standard flow VSCode, Neovim, and every other Copilot client uses.

## Walkthrough

1. **Open the extension popup** (click the toolbar icon or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>).
2. Click the ⚙ gear.
3. **Provider** → **GitHub Copilot** → **Connect**.
4. A new tab opens showing a short code, e.g.:

   ```
   Step 1 — enter this code on GitHub

     WDJB-MJHT          [Copy]

   [ Open github.com/login/device ↗ ]
   ```

5. Click **Open github.com/login/device** → paste the code → **Continue** → **Authorize GitHub for VS Code**.
6. The TestCapture tab detects approval automatically (it polls every 5 seconds), exchanges the `gho_` token for a Copilot session token, fetches your available models, and shows ✅ Connected.
7. Close the auth tab. Provider is now set to `copilot` globally — the popup pill will read **Connected ✓**.

## How it works under the hood

```
┌───────────────┐     POST /login/device/code     ┌────────────┐
│  Extension    │ ───────────────────────────────▶│  GitHub    │
│  auth.js      │ ◀───────────────────────────────│            │
│               │   { device_code, user_code }    └────────────┘
│               │                                        ▲
│               │                                        │
│               │  POST /login/oauth/access_token       │
│               │   (poll every 5s)                      │
│               │ ──────────────────────────────────────┘
│               │    { access_token: gho_XXX }
│               │
│               │  GET /copilot_internal/v2/token         ┌────────────┐
│               │ ──────────────────────────────────────▶│ api.github │
│               │     Authorization: token gho_XXX        │  .com      │
│               │ ◀──────────────────────────────────────│            │
│               │    { token: tid=…, expires_at, … }     └────────────┘
│               │
│               │  POST /chat/completions                 ┌────────────┐
│               │ ──────────────────────────────────────▶│ api.github │
│               │     Authorization: Bearer <copilot>     │ copilot.com│
└───────────────┘                                         └────────────┘
```

We use the public **VSCode client ID `Iv1.b507a08c87ecfe98`** with scope `read:user` — this is the same ID every open-source Copilot client uses (copilot.lua, copilot-node-server, etc.). Your Copilot plan permissions are evaluated server-side by GitHub; we simply make requests on your behalf.

## Storage

| Key                        | Contents                                                     |
|----------------------------|--------------------------------------------------------------|
| `tc_copilot_gh_token`      | The long-lived `gho_…` OAuth token. Scope: `read:user`.      |
| `tc_copilot_session`       | `{ token, expires_at, refresh_in, updated_at }` — refreshed automatically 60 s before expiry. |

Both keys live in `chrome.storage.local`, which is per-extension and sandboxed — no webpage JavaScript or other extension can read it.

## Troubleshooting

| Symptom                                                                     | Fix                                                                          |
|-----------------------------------------------------------------------------|------------------------------------------------------------------------------|
| `Device start failed 404`                                                   | Check your network; some corporate proxies block `github.com/login/device`.  |
| Code entered on GitHub, but extension keeps polling forever                 | Reload the auth tab. The device code expires after ~10 min.                  |
| `Copilot 403` on generation                                                 | Your Copilot subscription doesn't include this model, or the monthly quota is hit. Pick a different model or wait for quota reset. |
| Extension says "Not connected" after working yesterday                      | `gho_` tokens rarely expire but can be revoked on `github.com/settings/connections/applications`. Reconnect.                       |
| Works in the extension, fails in the web demo                               | Expected — the web demo cannot call Copilot (CORS). Use the extension.       |

## Revoking access

1. Open `chrome://extensions` → TestCapture AI → ⚙ Settings → **Disconnect**. **— or —**
2. Visit <https://github.com/settings/connections/applications/Iv1.b507a08c87ecfe98> and click **Revoke access**.

The next call from the extension will fail with 401; TestCapture will flag it and fall back to the offline template.
