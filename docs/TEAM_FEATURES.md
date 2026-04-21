# Team Features (paid, behind Activation Key)

The TestCapture AI Chrome extension is **fully functional standalone** — you can record, assert, generate, and export without ever running the team backend. Team features are an **opt-in** layer that unlocks collaboration between QA engineers.

## What you get

| Feature                      | Free (no key) | `TC-DEMO-TEAM-2026` | `TC-PRO-2026` | `TC-ENT-2026` |
|------------------------------|---------------|---------------------|---------------|----------------|
| Local recording              | ✓             | ✓                   | ✓             | ✓              |
| AI generation (any provider) | ✓             | ✓                   | ✓             | ✓              |
| Shared team sessions         | ✗             | ✓ (5 seats)         | ✓ (25 seats)  | ✓ (unlimited)  |
| Invite teammates             | ✗             | ✓                   | ✓             | ✓              |
| SSO                          | ✗             | ✗                   | ✓             | ✓              |
| Audit log                    | ✗             | ✗                   | ✗             | ✓              |

## Activation

### In the extension
1. Open the full-tab dashboard → ⚙ Settings.
2. Enter your activation key in **Team activation key** (try the free demo key `TC-DEMO-TEAM-2026`).
3. Click **Save**. The pill shows **Active · team** on success.

### In the web demo
1. `/dashboard` → Settings (top right) → **Team activation key** → paste → **Activate**.
2. A license token (`tctk_…`) is minted by the backend and stored in `localStorage.tc_web_license`.
3. The Dashboard now shows a **Share to team** button in the top bar and lists existing team sessions in the sidebar under a **TEAM** section.

## Under the hood

### Activation keys
Keys are seeded at backend startup into the `licenses` MongoDB collection:

```python
# /app/backend/server.py
SEED_LICENSES = [
    {"key": "TC-DEMO-TEAM-2026", "plan": "team",       "seats_total": 5,   "features": ["team_sessions", "invites"]},
    {"key": "TC-PRO-2026",       "plan": "pro",        "seats_total": 25,  "features": ["team_sessions", "invites", "sso"]},
    {"key": "TC-ENT-2026",       "plan": "enterprise", "seats_total": 10000,"features": ["team_sessions", "invites", "sso", "audit_log"]},
]
```

Every activation call mints an **opaque HMAC-signed token** of the form:

```
tctk_<sig>.<key>.<team_id>.<plan>.<nonce>
```

The `LICENSE_SIGNING_SECRET` env var rotates this — change it in production and existing tokens are invalidated.

### Endpoints

| Method | Path                          | Auth              | Description                                  |
|--------|-------------------------------|-------------------|----------------------------------------------|
| POST   | `/api/license/activate`       | none              | Validate key, return token                   |
| GET    | `/api/license/status`         | `X-License-Token` | Confirm token validity + seats               |
| POST   | `/api/team/sessions`          | `X-License-Token` | Share a recorded session with your team      |
| GET    | `/api/team/sessions`          | `X-License-Token` | List team sessions                           |
| GET    | `/api/team/sessions/{id}`     | `X-License-Token` | Fetch one                                    |
| DELETE | `/api/team/sessions/{id}`     | `X-License-Token` | Remove one                                   |
| POST   | `/api/team/invite`            | `X-License-Token` | Mint an invite token (7-day expiry)          |
| POST   | `/api/team/join`              | none              | Redeem an invite token, consume a seat       |

### Invite flow

```
Team admin                                           New teammate
──────────────                                       ──────────────
  POST /api/team/invite                                 ↓
   → tci_XXXXXXXXXXX  ────────── (email / Slack) ────▶ POST /api/team/join
                                                        body: { invite_token: tci_XXX }
                                                      ← { valid: true, token: tctk_YYY }
                                                        (plus seats_used incremented on admin's license)
```

The invite token is single-use. Joining consumes one seat from the team's license.

## Deploying your own backend

```bash
# 1. Env
cat > /app/backend/.env <<EOF
MONGO_URL=mongodb://mongo:27017
DB_NAME=testcapture
CORS_ORIGINS=https://your-dashboard.example.com
LICENSE_SIGNING_SECRET=$(openssl rand -hex 32)
EOF

# 2. Install + run (supervisor-managed in this repo)
cd /app/backend && pip install -r requirements.txt
# or with the provided supervisor config: sudo supervisorctl restart backend

# 3. Extension / web demo — point Settings → Proxy URL to https://your-api/api
```

See [`../backend/README.md`](../backend/README.md) for full server-side docs.

## FAQ

**Do I need the backend at all?**  No. TestCapture AI works 100% standalone. The team backend is purely additive.

**Where are team sessions stored?**  MongoDB, scoped to your license's `team_id`. Deleting the license doesn't delete the sessions — they remain accessible if the license is re-minted.

**Can I self-host?**  Yes. Change `LICENSE_SIGNING_SECRET`, seed your own keys (or edit `SEED_LICENSES`), and you have a closed-loop team backend.

**Is this DRM?**  It's soft. Keys are a coordination mechanism — the signing secret prevents forgery, but a determined user could strip license checks from their own fork. The design assumes trusted customers, not hostile ones.
