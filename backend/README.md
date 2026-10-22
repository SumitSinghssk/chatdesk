# Starter Kit API

FastAPI + PostgreSQL backend for the starter kit admin panel and public website.

## Setup

```bash
python -m venv venv
venv\Scripts\activate                 # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                # set DATABASE_URL + SECRET_KEY
python create_db.py                   # create the database if it doesn't exist
alembic upgrade head                  # run migrations
python seed.py all                    # or pick: python seed.py rbac users settings content
python run.py                         # http://127.0.0.1:8001  (docs at /docs)
```

Generate a secret key with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

Commands:

| Task | Command |
| --- | --- |
| New migration after changing models | `alembic revision --autogenerate -m "describe change"` |
| Apply migrations | `alembic upgrade head` |
| Add new permission keys / roles (safe to re-run) | `python seed.py rbac` |
| Scheduled tasks (run every minute) | `python scheduler.py` |
| Emergency: new admin password | `python manage.py reset-password <email> [--generate]` |
| Emergency: unlock / reset 2FA | `python manage.py unlock <email>` · `python manage.py reset-two-factor <email>` |
| Emergency: unblock an IP | `python manage.py unblock <ip>` |
| Production (cPanel / Passenger) | `passenger_wsgi.py` |
| Production (server) | `uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4 --timeout-keep-alive 75` |

## Folder structure

```
app/
├── main.py                 FastAPI app: middleware, exception handlers, /storage/uploads mount
├── models.py               imports every model (used by Alembic + relationships)
├── api/v1/
│   ├── admin.py            /api/v1/admin/*   (auth applied once for all protected routes)
│   ├── website.py          /api/v1/website/* (public, no auth)
│   └── customer.py         /api/v1/customer/* (website customers: auth + account)
├── core/                   config, database, security (JWT/bcrypt), admin_auth (guards),
│                           customer_auth (customer cookie sessions), exceptions,
│                           mailer (SMTP from settings), rate_limiter, logging
├── services/               reusable integrations, no routes
│   ├── sms/                SMS gateways with failover (see "SMS" below)
│   ├── payments/           payment gateways: orders, signature checks, webhooks (see "Payments")
│   ├── fields.py           GatewayField: describes a gateway setting so the admin builds the form
│   └── google_auth.py      verifies Google sign-in ID tokens
├── shared/
│   ├── constants/permissions.py   permission catalog + default role grants
│   ├── enums/              Status, PublishStatus, EnquiryStatus, ...
│   ├── mixins.py           TimestampMixin, SoftDeleteMixin
│   ├── pagination.py       page / per_page / search → {data, meta}
│   └── utils/              search, slug, uploads, bulk schemas, datetime, request meta
└── modules/
    ├── admin/<module>/     models.py · schemas.py · service.py · routes.py
    ├── website/<module>/   public read-only endpoints (+ contact form, 404 log)
    └── customer/<module>/  customer auth (password, OTP, Google) and account
seeders/                    rbac, users, settings (menus + SEO), demo content
alembic/                    migrations
storage/uploads/            uploaded files (served at /storage/uploads)
storage/logs/               app-YYYY-MM-DD.log (viewable in Admin → Application logs)
```

Admin modules: `auth`, `profile`, `dashboard`, `search`, `notifications`, `users`, `roles`, `permissions`, `blog_categories`, `blogs`, `pages`, `testimonials`, `galleries`, `media`, `menus`, `enquiries`, `seo`, `redirects`, `not_found`, `settings`, `activity_log`, `trash`, `logs`.

## Conventions

- **Layers:** routes → service. A service queries with `db.query(...)`, commits, and returns the response envelope.
- **Responses:**
  - Success: `{"status": true, "message": "...", "data": ..., "meta": {page, per_page, total, total_pages}}`.
  - Error: `{"status": false, "message": "...", "errors": {"field": ["msg"]}}`.
- **Raising errors:** `HTTPException(404, detail="X not found")` for a plain error. For field errors use `HTTPException(422, detail={"errors": {"slug": ["Already in use"]}})`.
- **Lists:** pass `page`, `per_page` and `search` to get `meta`. Without them you get the full list, capped at 500, which is handy for dropdowns.
- **Permissions:** `dependencies=[Depends(require_admin_permission(P.BLOGS_UPDATE))]`. Super admin has `"*"`.
- **Audit:** every mutation calls `log_activity(...)` before `db.commit()`.
- **Times:** every timestamp is stored in UTC (`now()` from `app.shared.utils.datetime`) and returned as ISO with a `Z`. Settings → Date & time sets the site timezone, which decides display, "today" boundaries, date filters and backup schedules. Use `to_utc()` for times a user typed, and `site_now()` / `today_start()` for local days.
- **Admin-managed values:** the app name (Settings → Business profile), timezone (Date & time) and token/reset-link lifetimes (Security) live in settings, not env.
- **Soft delete:** `SoftDeleteMixin` plus `deleted_at`. Deleted rows appear in the Trash module; register new soft-deletable models in `modules/admin/trash/service.py`.

## Auth model

- **Login:** returns an access token (30 min) and a refresh token (7 days, or 30 with "remember me"). Each login creates a `user_sessions` row; the tokens carry its id (`sid`) and the user's `token_version`.
- **Refresh:** rotates the refresh token. The old one stops working.
- **Signing out everywhere:**
  - Logout revokes the session.
  - A password, role or permission change bumps `token_version`, which signs the user out of every session.
- **Two-factor:** a 2FA user's login returns a short-lived `two_factor_token`, which is exchanged at `/auth/two-factor-challenge` with a TOTP or recovery code.
- **Lockout:** after N failed logins (Settings → Security) the account locks. Admins are notified.

## Customers

Customers are website members. They're stored in their own `customers` table, completely separate from admin `users`, and can never reach the admin panel.

- **Sign-in methods** (Settings → Customer login): email/mobile + password, mobile OTP, and Google. Any combination can be on. OTP and Google create the account on first sign-in when sign-ups are allowed.
- **Sessions:** an opaque token in the httpOnly `sk_customer` cookie (hashed in `customer_sessions`), plus a readable `sk_member=1` hint for the website header. Mutating requests need `X-Requested-With: sk-web`.
- **Guard:** `Depends(require_customer)` from `app.core.customer_auth` returns the signed-in `Customer`.
- **Businesses:** each customer is a business using the WhatsApp workspace. `customers.business_name` is set at sign-up and in the profile. Their WhatsApp number lives in `whatsapp_accounts` (`modules/customer/whatsapp/`).
- **Admin:** Admin → Customers lists, edits, blocks and signs out customers (`customers.*` permissions). It shows each customer's WhatsApp status and can filter by it (`?whatsapp=connected|error|not_connected`).

## SMS

`app/services/sms` is the one place that sends SMS. Use it from anywhere:

```python
from app.services.sms import send_template, send_sms

send_template(db, "login_otp", phone, {"code": "123456", "minutes": 5})
send_sms(db, phone, "Your order has shipped")
```

- **Gateways** (MSG91, Fast2SMS, Exotel, Gupshup, Twilio) are set up in Settings → SMS gateways. Every enabled gateway is tried in priority order until one succeeds.
- **Delivery log:** each send is logged in `sms_logs`, with each gateway's error. OTP codes are masked.
- **Add a message type:** add an `SmsTemplate` to `services/sms/templates.py`. Its text and per-gateway DLT template IDs become editable in the admin.
- **Add a gateway:** subclass `SmsGateway` in `services/sms/gateways/<name>.py` (declare `fields`, implement `send`) and register it in `gateways/__init__.py`. The admin form is built from `fields`.
- **Development:** with no gateway enabled, messages (including OTP codes) are written to the log instead of sent. Production refuses.

## Payments

`app/services/payments` holds everything payment-related. Razorpay is built in. Set it up in Settings → Payment gateways, which has a test-connection button, a real test payment and the webhook URL to copy.

```python
from app.services.payments import start_checkout, confirm_payment, to_minor

session = start_checkout(db, amount=to_minor(499), purpose="order", reference="ORD-12",
                         customer_id=customer.id, payer={"name": ..., "email": ..., "phone": ...})
# hand session to the browser: openCheckout(session) from src/lib/payments/checkout.ts
payment = confirm_payment(db, session["gateway"], data_from_checkout)   # verifies the signature
```

- Each payment is a `payments` row (amounts in paise/cents). Webhooks at `/api/v1/website/payments/webhook/{gateway}` are signature-checked, stored in `payment_webhooks`, de-duplicated by event ID, and update the payment's status (paid, failed, refunded).
- **Add a gateway:** subclass `PaymentGateway` in `services/payments/gateways/<name>.py` (fields, create_order, checkout, verify_payment, verify_webhook, parse_webhook) and register it. On the frontend, add a launcher in `src/lib/payments/` and register it in `checkout.ts`.

## Scheduler & backups

`scheduler.py` runs the scheduled jobs. Call it **every minute**:

```bash
# Linux (crontab -e)
* * * * * cd /path/to/starter-kit-api && venv/bin/python scheduler.py >> /dev/null 2>&1

# Windows (administrator prompt) - or create the task in Task Scheduler with "Start in" = the project folder
schtasks /Create /F /SC MINUTE /MO 1 /TN "Starter Kit scheduler" /TR "\"C:\path\to\starter-kit-api\venv\Scripts\python.exe\" \"C:\path\to\starter-kit-api\scheduler.py\""
```

Each run writes a heartbeat (shown on Backups and System health) and then:

| Task | What it does | When |
| --- | --- | --- |
| `backup` | the scheduled backup from Backups -> Automatic backups, then keeps only the newest *keep* scheduled backups | when a slot is due (one per slot, guarded by a Postgres advisory lock) |
| `trash` | permanently deletes trashed items older than 30 days | at most hourly |
| `not_found` | forgets 404 log entries not seen for 90 days | at most hourly |
| `security` | firewall housekeeping | at most hourly |

```bash
python scheduler.py                         # normal run (what cron calls)
python scheduler.py --task trash            # run one task now: backup | trash | not_found | security | all
python scheduler.py --force-backup          # make a scheduled backup even when none is due
```

Backups are stored in `storage/backups/backup-YYYY-MM-DD-HHMMSS/` (never served publicly) as
`database.sql.gz` (plain SQL from `pg_dump`, restore with `gunzip -c database.sql.gz | psql -d starter_kit`)
and `files.zip` (the contents of `storage/uploads`). `pg_dump` is found via `PG_DUMP_PATH` in `.env`, then `PATH`,
then the newest `C:\Program Files\PostgreSQL\<version>\bin`. Its version must be the same as or newer than the
database server's. The password from `DATABASE_URL` is passed in the `PGPASSWORD` environment variable, never on
the command line.

## Docker

`docker-compose.yml` runs PostgreSQL, the API and the scheduler (it runs `scheduler.py` every minute).

```bash
cp .env.docker.example .env.docker      # fill in POSTGRES_PASSWORD, SECRET_KEY, ADMIN_HINT_SECRET, INTERNAL_API_KEY
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker exec api python manage.py create-admin you@example.com --generate
```

- Start this folder before the frontend: it creates the shared `starter-kit` network the frontend joins.
- On every start the API runs `alembic upgrade head` and `seed.py rbac`. `AUTO_SEED` decides what an empty database gets: `basic` (settings only), `demo` (demo users and content) or `none`.
- The database and `storage/` (uploads, backups, logs) live in the `pgdata` and `storage` volumes, so they survive rebuilds.
- The API is not published on a host port. The frontend reaches it at `http://api:8001` inside the network.
- Logs: `docker compose --env-file .env.docker logs -f api scheduler`.

## Tests and CI

```bash
pip install -r requirements-dev.txt
ruff check .
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/starter_kit_test pytest -q
```

The tests refuse to run on a database whose name doesn't contain `test`. Create, migrate and seed it first: `create_db.py`, `alembic upgrade head`, `seed.py all`, each run with `DATABASE_URL` pointing at it.

`.github/workflows/ci.yml` runs lint, a migrations check, the tests and a Docker build on every push. GitHub only reads workflows from the repository root. Push this folder as its own repository, or copy the file to `<repo>/.github/workflows/`. If you copy it, set `defaults.run.working-directory` and the Docker `context` to `starter-kit-api`.

## Error monitoring (Sentry)

Set `SENTRY_DSN` (in `.env` or `.env.docker`) to turn it on for the API and the scheduler. Leave it empty to turn it off. Unhandled errors, database outages and failed scheduler tasks are reported. Passwords, cookies and auth headers are never sent. Optional settings: `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` (0–1, default 0).

## Caching

- **Website pages** are cached by Next.js for up to 10 minutes. Whenever anything that appears on the website changes (posts, pages, menus, SEO, settings, galleries, testimonials, team, comments, redirects, firewall), the API tells the frontend which parts to refresh (`POST {FRONTEND_URL}/api/revalidate`), so visitors see edits immediately.
- It works out what changed by itself: `app/core/cache.py` watches every database commit (including bulk updates and deletes) and maps tables to cache tags in `TABLE_TAGS`. A new module only needs a line there if its data shows on the website.
- Needs the same `INTERNAL_API_KEY` in the API `.env` and the frontend `.env.local`. Without it, the website still refreshes on its own every 10 minutes.
- Scheduled posts and pages: the scheduler refreshes the website the minute they go live.
- Settings reads are cached in memory for 30 seconds per worker; admin screens always read live values.
- Uploaded files are served with a one-year browser cache (file names are unique, so a changed image always gets a new URL).
- **System health → Clear website cache** clears everything by hand. The "Website cache refresh" check shows whether instant refresh is working.
