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
python migrate.py
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

### Team, roles and chat assignment

- **One login per person.** A business owner invites people from **Team**. Each person opens a one-time invite link (valid 7 days) and sets a password.
- **Roles:**
  - **Owner:** everything.
  - **Admin:** everything, including the team, except removing the owner.
  - **Agent:** the inbox and contacts only.
- **How it works in the code:** workspace endpoints use `require_workspace` or `require_admin` from `app/modules/customer/team/access.py`. These return the owner's account, so data stays scoped by the owner's id, and the signed-in person is available as `actor(ws)`.
- **Assigning chats:** chats can be assigned to a person and/or a team. Round-robin auto-assignment is set under **Team → Assignment rules**:
  - only people who are Available
  - optionally only one team
  - optionally a cap on open chats per person
- **Agent visibility:** all chats, their own plus unassigned, or only their own.
- **Response time:** measured from a customer's first unanswered message to the team's reply, and shown under **Team → Performance**.
- **Testing without Meta:** set `WHATSAPP_GRAPH_URL` to point the API at a stand-in for Meta's Graph API, so sends succeed. Never set it in production.

### How campaigns are sent

- The API sends campaigns in a background thread. It also checks every 15 seconds for scheduled campaigns that are due, and resumes any campaign a restart interrupted.
- In production, also run `backend> python scheduler.py` every minute (cron or Task Scheduler). Its `campaigns` task does the same job if the API is down.
- Each campaign is claimed with one atomic database update, so it is never sent twice.
- Speed is about 20 messages a second (`CAMPAIGN_SEND_GAP` in seconds).
- If Meta rejects the token or can't be reached, the campaign pauses with the reason instead of failing everyone. Press **Resume** once the token is fixed.
- Set `CAMPAIGN_WORKER=off` to turn the in-API sender off, for example when only `scheduler.py` should send.

### How chatbots run

- A chatbot is a flow drawn on the canvas (**Grow → Chatbots**). Edits save as a draft automatically; customers get the version last **published**, so half-done edits never reach a chat.
- **What starts one:** keywords, a customer's first message, any message (it then takes the place of the default automatic reply), a Click-to-WhatsApp ad, or a person / auto-reply / another chatbot. Two live chatbots can't share a keyword or a trigger.
- **Order on each incoming message:** opt-out / opt-in words first, then a chatbot already talking in the chat (or one the message starts), then the automatic replies.
- **While it talks:** wrong answers are explained and asked again (Settings → retries), exit words such as “agent” hand the chat over, and it gives up after the timeout. When someone from the team replies in the chat, the chatbot stops by itself.
- **Delays and timeouts** run in a background thread of the API (every 3 seconds). `scheduler.py`'s `chatbots` task does the same job. Set `CHATBOT_WORKER=off` to turn the in-API thread off.
- **API request blocks** only call public internet addresses (not this server or its private network) and wait at most 8 seconds. For local testing only, `CHATBOT_ALLOW_PRIVATE_URLS=1` lifts that limit; never set it in production.

### How the AI agent works

- **Providers:** each business brings its own key (**Grow → AI agent → AI connections**): Claude (through Anthropic's SDK), or ChatGPT, Gemini, Groq, DeepSeek, Mistral, OpenRouter or any OpenAI-compatible address. Keys are encrypted with `SECRET_KEY` and checked by listing the models (no tokens spent). In production a custom address must be on the public internet.
- **Knowledge is read once:** files (PDF, Word, Excel, CSV, text, Markdown, HTML), web pages (optionally the whole site), notes and Q&A are turned into text when added; the originals stay in `storage/ai-knowledge` for the preview. **Train** cuts them into passages and builds a search index (BM25, kept in memory per training version), so answering never re-reads a document.
- **Low usage:** the prompt has a fixed part (rules, important facts and, for a small knowledge base, all of it) that the provider caches, and a small changing part (date, memory summary, matching passages). A larger knowledge base sends only the passages that match the question. Stand-alone questions asked before are answered from a saved answer with no AI call. Memory keeps the last messages word for word and folds older ones into a short summary.
- **WhatsApp:** an agent answering on WhatsApp takes the place of the welcome, away and default automatic replies; opt-out words, chatbots and keyword replies still go first. Replies run in a background thread (`AI_WORKER=off` turns it off; replies then run inside the webhook). The agent hands over (assigns, reopens, marks the chat) when it should, and steps back when a person replies or the chat is paused from the inbox; resolving the chat brings it back.
- **Website:** `<script src="https://<frontend>/widget.js" data-agent="pk_…" async></script>` adds the chat bubble (an iframe of `/ai-chat/<key>`, the only page other sites may frame). The same page works as a shareable chat link. Server-to-server calls use `POST /api/v1/website/ai/<key>/messages` with the agent's secret API key.
- **Limits:** a monthly budget per agent, rate limits on the public endpoints, and an allow-list of websites for the widget.

## Everyday commands

| Task | Command (from the folder shown) |
| --- | --- |
| New DB migration after changing models | `backend> alembic revision --autogenerate -m "what changed"` then `python migrate.py` |
| Migrate the test DB too | `backend> python migrate.py --test` |
| Scheduled jobs (cron every minute) | `backend> python scheduler.py` · `python scheduler.py list` · `run <job>` |
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
