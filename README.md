# ChatDesk — WhatsApp Business Platform

Our own WATI / Interakt / AiSensy-style platform on the official **Meta WhatsApp Cloud API**.
The full feature plan and build roadmap are in [WHATSAPP_PLATFORM_BLUEPRINT.md](WHATSAPP_PLATFORM_BLUEPRINT.md).

One codebase serves three apps:

| App | URL | Who uses it | Code |
| --- | --- | --- | --- |
| **Website** | `/` | Visitors: product landing page, pricing, blog, contact | `frontend/src/app/(website)` |
| **Customer workspace** | `/dashboard` | Businesses: connect WhatsApp, inbox, campaigns, bots… | `frontend/src/app/(workspace)` |
| **Admin panel** | `/admin` | Our team: customers, content, SEO, settings, security | `frontend/src/app/admin` |

All three use the same FastAPI backend (`backend/`).

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, JWT
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, TanStack Query

The admin panel, website and customer accounts come from the `python-nextjs-starter` kit. The kit's own docs are in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Folder structure

```
wati/
├── README.md                         ← you are here
├── WHATSAPP_PLATFORM_BLUEPRINT.md    ← features, architecture, roadmap
├── backend/                          FastAPI API  → http://127.0.0.1:8001/docs
│   ├── app/
│   │   ├── api/v1/                   admin.py · website.py · customer.py (routers, auto-discovered)
│   │   ├── core/                     config, database, security, auth guards, crypto
│   │   ├── services/
│   │   │   ├── whatsapp/             ★ Meta Graph API client + webhook signature check
│   │   │   ├── payments/  sms/       payment gateways, SMS gateways
│   │   ├── modules/
│   │   │   ├── admin/<module>/       admin panel APIs  (models · schemas · service · routes)
│   │   │   ├── website/<module>/     public APIs       (+ whatsapp/ ★ Meta webhook receiver)
│   │   │   └── customer/<module>/    workspace APIs    (auth, account, whatsapp/ ★ connection)
│   │   └── shared/                   enums, mixins, pagination, utils
│   ├── alembic/versions/             database migrations
│   ├── seeders/                      roles, admin users, settings, demo content
│   └── tests/                        pytest (incl. test_whatsapp.py)
└── frontend/                         Next.js  → http://localhost:3000
    └── src/
        ├── config/                   routes, API endpoints, permissions, site name (one place each)
        ├── proxy.ts                  firewall, auth redirects, maintenance mode
        └── app/
            ├── (website)/            public website (server-rendered, SEO)
            ├── (customer)/           /login and /register for businesses
            ├── (workspace)/          ★ customer workspace (built like the admin panel, WhatsApp-green theme)
            │   ├── layout.tsx        admin.css + customer.css + the admin Providers (toasts, confirm, React Query)
            │   ├── customer.css      the only visual difference from admin: brand colour tokens
            │   └── dashboard/
            │       ├── _lib/nav.ts   sidebar, tabs, breadcrumbs and Ctrl K all come from this module list
            │       ├── _lib/whatsappApi.ts
            │       ├── _components/
            │       │   ├── CustomerShell.tsx   = AdminShell for customers (customer session)
            │       │   ├── shell/              Header, Sidebar, TabsBar, CommandPalette, UserMenu (admin copies)
            │       │   └── Overview, WhatsAppConnection, AccountSettings, ModulePage (admin UI kit)
            │       └── inbox/ contacts/ campaigns/ templates/ chatbots/ ai-agent/ commerce/ analytics/ whatsapp/ account/
            └── admin/                admin panel (copied from the starter kit)
```

★ = added for WhatsApp.

## Quick start (Windows)

Requirements: Python 3.12+, Node.js 20+, PostgreSQL 14+.

```powershell
# 1. Backend → http://127.0.0.1:8001/docs
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env          # set DATABASE_URL, SECRET_KEY, ADMIN_HINT_SECRET, INTERNAL_API_KEY
python create_db.py
alembic upgrade head
python seed.py all
python run.py

# 2. Frontend → http://localhost:3000   (new terminal)
cd frontend
npm install
copy .env.example .env.local    # ADMIN_HINT_SECRET + INTERNAL_API_KEY must match backend/.env
npm run dev
```

Then open:

- **Website:** http://localhost:3000
- **Customer workspace:** http://localhost:3000/register → you land on `/dashboard`
- **Admin panel:** http://localhost:3000/admin, signing in as `superadmin@gmail.com` with password `Password@123`. Change this password before going live.

## Connecting a real WhatsApp number

1. Complete the Meta setup in the blueprint (section 3): Business verification, a Meta app with WhatsApp, a phone number and a permanent system-user token.
2. In the workspace, open **WhatsApp setup** and paste:
   - the WABA ID
   - the phone number ID
   - the access token
   - the app secret (recommended)
3. Copy the **Callback URL** and **Verify token** into your Meta app (WhatsApp → Configuration). Subscribe to `messages`, plus `message_template_status_update`, `message_template_quality_update` and `template_category_update` so template approvals show up within seconds (without them, Templates checks Meta every 30 seconds while something is in review).
   - Meta needs a public HTTPS URL. Locally, run `ngrok http 8001` and set `APP_URL` in `backend/.env` to the ngrok URL.
4. Message your number from a phone. The workspace Overview shows the event, and **Send a test message** replies to you.

## Everyday commands

| Task | Command (from the folder shown) |
| --- | --- |
| New DB migration after changing models | `backend> alembic revision --autogenerate -m "what changed"` then `alembic upgrade head` |
| Backend tests (uses `wati_test` DB from `TEST_DATABASE_URL`) | `backend> python -m pytest -q` |
| Backend lint | `backend> ruff check app tests` |
| Frontend type check / lint / format | `frontend> npm run typecheck` · `npm run lint` · `npx prettier --write src` |
| Production build | `frontend> npm run build` (the API must be running) |

## Adding a workspace feature (example: Contacts)

1. **Backend:** create `backend/app/modules/customer/contacts/` with `models.py`, `schemas.py`, `service.py` and `routes.py`, copying `customer/whatsapp/`.
   - Routers and models are discovered automatically.
   - Guard each route with `Depends(require_customer)`.
   - Generate and apply a migration.
2. **Frontend:**
   - Add the endpoints to `src/config/endpoints/customer.ts`.
   - Add an API file in `(workspace)/dashboard/_lib/`.
   - Build the screen in `(workspace)/dashboard/_components/` with the admin UI kit (`@/app/admin/_components/ui`, `DataGrid`, `KpiTile`…), exactly as an admin page is built. It turns green automatically.
   - Render it from `contacts/page.tsx`.
   - In `_lib/nav.ts`, change the module's `status` from `"planned"` to `"live"`.
3. Add a test in `backend/tests/`.

## Rebranding

"ChatDesk" is a placeholder product name. To change it:

- the frontend fallback: `frontend/src/config/site.ts`
- the backend default: `backend/app/core/config.py` (`DEFAULT_APP_NAME`)
- the live value: **Admin → Settings → Business profile**

The website brand colour is `--primary` in `frontend/src/app/(website)/website.css`.
