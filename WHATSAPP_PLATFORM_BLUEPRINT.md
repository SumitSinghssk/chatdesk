# WhatsApp Business Platform — Build Blueprint (Python + React)

**As of:** 22 Oct 2026
**Goal:** Build our own WhatsApp Business platform with every major feature of WATI, Interakt and AiSensy, on the official Meta WhatsApp Cloud API.
**Stack:** Python (FastAPI) backend, React (TypeScript) frontend.

---

## Table of contents

1. [Overview](#1-overview)
2. [Feature list](#2-feature-list)
3. [Meta prerequisites and setup](#3-meta-prerequisites-and-setup)
4. [System architecture](#4-system-architecture)
5. [Tech stack](#5-tech-stack)
6. [Project folder structure](#6-project-folder-structure)
7. [Database schema](#7-database-schema)
8. [Backend API design and webhook handling](#8-backend-api-design-and-webhook-handling)
9. [Frontend pages and components](#9-frontend-pages-and-components)
10. [Build roadmap](#10-build-roadmap)
11. [Security, compliance and WhatsApp policy](#11-security-compliance-and-whatsapp-policy)
12. [Deployment, monitoring, costs and risks](#12-deployment-monitoring-costs-and-risks)
13. [Next steps](#13-next-steps)

---

## 1. Overview

We will build our own WhatsApp Business platform on the official Meta WhatsApp Cloud API. The core (inbox, broadcasts, bots, AI agent) takes about **3–4 months with 1–2 developers**. After that, our main running cost is Meta's per-message fee, with no platform markup.

### Goals

- Run every feature we use today in WATI, Interakt or AiSensy on our own system.
- Pay Meta's base message rates directly, with no monthly plan fee and no per-message markup.
- Own all customer data and connect it freely to our CRM, store and payment systems.

### Scope decision: own business first, SaaS later

| Phase | What it means |
| --- | --- |
| **A. Single business (this plan)** | One Meta Business account, our own WhatsApp number(s), our own team as users. |
| **B. SaaS (optional, later)** | Other businesses connect their numbers through **Meta Embedded Signup**, with us registered as a Meta **Tech Provider**. Adds multi-tenant isolation, wallets and billing. |

> Design rule: from day one every table carries an `org_id`. Moving to SaaS later then needs no rewrite.

### Out of scope for version 1

- Native mobile apps (we use a mobile-friendly web inbox instead)
- WhatsApp voice calling
- Creating ads inside the app (we track and attribute them first)

All of these are planned for Phase 5.

---

## 2. Feature list

This list has 13 modules. Each feature is tagged with its build phase (see [Build roadmap](#10-build-roadmap)).

### 2.1 WhatsApp connection — P1

- Connect a WhatsApp Business Account (WABA) and its phone numbers
- Webhook receiver for incoming messages and status updates
- Send message types:
  - text, image, video, audio, document, sticker
  - location, contacts
  - interactive buttons and lists
  - templates
- Delivery status tracking: sent → delivered → read → failed, with error codes
- Media upload and download (store in S3-compatible storage)
- Support for multiple phone numbers
- Show phone number quality rating and messaging limit tier

### 2.2 Contacts (CRM-lite) — P1

- Contact list with search, filters and pagination
- CSV import (column mapping, duplicate check) and CSV export
- Tags and custom attributes (text, number, date, dropdown)
- Opt-in / opt-out tracking with source and timestamp (required by Meta policy)
- Contact profile card: details, tags, attributes, orders, conversation history
- Merge duplicate contacts
- Block contact

### 2.3 Team inbox — P1–P2

- Real-time chat over WebSockets
- Conversation list filters: open / pending / resolved / mine / unassigned / team
- Assign a chat to an agent or team
- Auto-assignment: round-robin, load-balanced, rule-based (tag or keyword)
- Internal notes visible only to the team
- Quick replies (saved responses, shortcut `/`)
- Labels on conversations
- **24-hour window timer**: shows when only templates can be sent
- Send templates from the inbox when the window has closed
- Media preview, file sending, emoji picker
- Business hours, welcome message, away message
- Phone number masking for agents (role-based)
- Search across all messages
- Desktop notifications and sound alerts

### 2.4 Templates — P1

- Create a template and submit it to Meta:
  - header: text, image, video or document
  - body with variables
  - footer
  - buttons: quick reply, URL, phone, copy code
- Categories: marketing, utility, authentication
- Sync approval status from Meta (webhook + periodic sync)
- Carousel templates and limited-time-offer templates
- Template preview exactly as WhatsApp shows it
- Template library and duplicate/edit

### 2.5 Broadcasts and campaigns — P2

- Bulk send a template to a segment or uploaded list
- Map variables to contact attributes, with fallback values
- Schedule with time zone; send now
- Rate-limited send queue that respects the number's throughput and tier
- Auto-retry failed messages (with error-code rules)
- Cost estimate before sending (count × rate per category/country)
- **Retargeting**: new campaign to those who read / replied / clicked / did not reply
- Link click tracking (short redirect URLs)
- **Drip sequences**: multi-step messages with delays that stop when the contact replies
- **Event-triggered campaigns**, sent when an API event arrives (e.g. `order_placed`)
- Campaign report: sent, delivered, read, clicked, replied, failed, cost

### 2.6 Segments — P2

- Dynamic segments built with a rule builder (tags, attributes, last active, opted in, campaign activity)
- Static lists from CSV
- Ready-made segments: highly engaged, inactive 30 days, at-risk, winback

### 2.7 Chatbot and flow builder — P2 (keyword bot) → P4 (visual builder)

- Keyword triggers (exact / contains / regex) and default reply
- Welcome flow for new contacts
- **Visual drag-and-drop flow builder** with these node types:
  - send message (text, media, buttons, list)
  - ask a question and save the answer to an attribute (with validation)
  - condition / branch
  - delay
  - API call (webhook), with the response stored in variables
  - set tag or attribute
  - assign to agent or team (handover)
  - start another flow
  - AI agent step
  - end
- Triggers: keyword, new contact, template button reply, QR code / link (`wa.me` with a prefilled text), click-to-WhatsApp ad, API
- **WhatsApp Flows** (native forms) for lead capture, booking and feedback
- Bot-to-human handover with context
- Flow analytics: started, completed, drop-off per node

### 2.8 AI — P3

- **AI agent** answering customers:
  - knowledge base from website URLs, PDF, DOCX and FAQ entries (RAG with embeddings)
  - tool calling: check order status, create booking, update CRM, fetch product info
  - guardrails: allowed topics, tone, escalate when unsure
  - human handoff with a conversation summary
  - multi-language replies
- **Agent assist** in the inbox:
  - suggested replies
  - summarise conversation
  - translate message
- **AI template writer**, which drafts templates that fit Meta's categories
- **Conversation quality score**: sentiment and resolution rating per chat

### 2.9 Commerce — P3

- WhatsApp catalog sync (Meta Commerce Manager catalog)
- Single-product and multi-product messages
- Receive cart / order messages from WhatsApp
- Payment links (Razorpay / PayU / Stripe) with a payment-status webhook
- Order status notifications: confirmed, shipped, delivered
- **Shopify / WooCommerce**:
  - abandoned cart reminders (up to 3)
  - order updates
  - COD confirmation and COD-to-prepaid conversion flow
  - back-in-stock alerts
- Order list in the contact profile

### 2.10 Ads — P4

- **Click-to-WhatsApp ad attribution**: read the `referral` object on incoming messages (ad id, headline, source URL)
- Map ads to flows (an ad starts a specific bot)
- Track the 72-hour free entry-point window
- Send conversion events (lead, purchase) back to Meta via the Conversions API
- Ad performance report: conversations, leads and revenue per ad
- *Later:* create and manage ads through the Meta Marketing API

### 2.11 Integrations — P3–P4

- **Outgoing webhooks**: message received, message status, contact created, campaign finished
- **Public REST API** with API keys:
  - send a message or template
  - create or update a contact
  - track an event
- Shopify, WooCommerce, Razorpay, PayU
- Google Sheets (sync contacts / append leads)
- HubSpot / Zoho CRM (sync contacts and conversations)
- Zapier / Make, via webhooks + API

### 2.12 Analytics — P2–P4

- Dashboard showing:
  - conversations, messages in and out
  - cost by category
  - active contacts
- Campaign funnel: sent → delivered → read → clicked → replied
- Agent performance: first response time, resolution time, chats handled
- Bot performance: completion and handover rate
- Ad attribution report
- CSV export of every report

### 2.13 Admin and security — P1–P4

- Users, invites and roles (owner, admin, manager, agent) with granular permissions
- Teams
- Audit log of sensitive actions
- API keys management
- Wallet / spend tracking (estimated Meta charges)
- Settings: business profile, working hours, number settings
- Two-factor authentication (2FA)

### 2.14 Later — P5

- Instagram DMs and Facebook Messenger in the same inbox
- WhatsApp Business Calling (WebRTC)
- SMS / RCS / email fallback when WhatsApp fails
- Mobile app (React Native)
- Multi-tenant SaaS: Embedded Signup, plans, billing, per-tenant wallets

---

## 3. Meta prerequisites and setup

You can only send messages once these steps are done. Business verification is the slowest step; it can take days.

1. **Meta Business Portfolio**: create one at business.facebook.com.
2. **Business verification**: upload legal documents such as GST, incorporation certificate or utility bill. This is needed for higher messaging limits and display-name approval.
3. **Meta Developer App**: at developers.facebook.com, create an app of type *Business* and add the **WhatsApp** product.
4. **WhatsApp Business Account (WABA)**: created with the app, or linked to an existing one.
5. **Phone number**:
   - Add and verify by SMS or voice call.
   - The number must not be active on the normal WhatsApp app. If it is, delete that account first.
   - Set the **display name**; Meta reviews it.
6. **System User + permanent token**:
   - In Business Settings → System Users, create an admin system user.
   - Assign the app and the WABA to it.
   - Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` (plus `business_management` if needed).
   - Never use the temporary 24-hour token in production.
7. **Webhook configuration**:
   - Set the callback URL (`https://api.yourdomain.com/webhooks/whatsapp`) and a verify token.
   - Subscribe to the fields `messages`, `message_template_status_update`, `phone_number_quality_update` and `account_update`.
   - Subscribe the app to the WABA (`POST /{waba_id}/subscribed_apps`).
8. **Register the number** for Cloud API (`POST /{phone_number_id}/register` with a 6-digit PIN for two-step verification).
9. **Payment method**: add a card or credit line in WhatsApp Manager so paid messages can be sent.
10. **First templates**: submit a few utility and marketing templates for approval.
11. *(Optional)* **Official Business Account** (green tick): apply once the business is notable enough.
12. *(Later, SaaS only)* Become a **Tech Provider** and complete app review for Embedded Signup.

### Key rules and limits to design for

| Rule | What it means for us |
| --- | --- |
| **24-hour customer service window** | Free-form messages only within 24 h of the customer's last message. Outside it → approved templates only. |
| **Per-message pricing** | Meta charges per delivered template message by category (marketing, utility, authentication) and country. Check Meta's current rate card; utility and service-message rules have changed recently. |
| **Messaging limit tiers** | Unique users a number can message per 24 h, starting at about 250. It increases with good quality and volume. |
| **Quality rating** | Green / yellow / red, based on blocks and reports. Low quality can lower your tier or pause templates. |
| **Throughput** | Cloud API default is about 80 messages/sec per number (can be upgraded). The broadcast queue must rate-limit. |
| **Template approval** | Every template is reviewed. Wrong category or bad content → rejected or recategorised. |
| **Opt-in required** | You must have the user's permission before messaging them. Store proof. |

> Make the Graph API version a config value (`GRAPH_API_VERSION`), because Meta retires old versions regularly.

---

## 4. System architecture

All Meta traffic goes through one webhook receiver and one sending service. Everything else (inbox, bots, AI, campaigns) runs as workers reading from a queue, so a slow component never blocks incoming messages.

```
                         ┌──────────────────────────┐
  WhatsApp users  ⇄      │   Meta WhatsApp Cloud API │
                         └────────────┬─────────────┘
                     webhooks (POST)  │  ▲  Graph API (send, templates, media)
                                      ▼  │
┌──────────────────────────────────────────────────────────────────────┐
│                         FastAPI backend                              │
│                                                                      │
│  /webhooks/whatsapp ──► verify signature ──► save raw event ──► queue │
│                                                                      │
│  REST API (/api/v1/*)  ◄──── React dashboard (HTTPS, JWT)            │
│  WebSocket (/ws)       ────► live inbox updates                      │
│  Public API (/public/*) ◄─── Shopify, CRM, Zapier (API keys)         │
└───────────────┬──────────────────────────────────────┬───────────────┘
                │                                      │
         PostgreSQL (+pgvector)                 Redis (queue, cache, pub/sub)
                │                                      │
┌───────────────┴──────────────────────────────────────┴───────────────┐
│                         Celery workers                               │
│  • Inbound processor  → store message, update contact, notify inbox  │
│  • Bot engine         → run flows, keyword replies                   │
│  • AI agent           → LLM + knowledge base + tools                 │
│  • Campaign sender    → rate-limited bulk sending, retries           │
│  • Scheduler (beat)   → scheduled campaigns, drips, template sync    │
│  • Integrations       → Shopify/Razorpay events, outgoing webhooks   │
└──────────────────────────────────────────────────────────────────────┘
                │
        S3 / MinIO (media files)        LLM API (Claude) for AI features
```

### Incoming message flow

1. Meta sends `POST /webhooks/whatsapp`.
2. We check the `X-Hub-Signature-256` HMAC with the app secret.
3. We save the raw payload to `webhook_events` and push a job to the queue.
4. We **return 200 immediately**, because Meta retries slow or failed webhooks.
5. The worker parses the event:
   - upsert contact
   - upsert conversation
   - insert message, or update the status of an existing one
6. The worker publishes an event to Redis pub/sub → the WebSocket server → the agent's browser updates live.
7. If the conversation is unassigned or bot-owned → the bot engine or AI agent decides the reply.
8. A reply is sent through the **sending service** (one place for all sends, with retries, logging and rate limits).

### Outgoing message flow

1. An agent, bot or campaign creates a message record with status `queued`.
2. A worker calls `POST /{phone_number_id}/messages`, saves the returned `wamid`, and sets status `sent`.
3. Status webhooks later update it to `delivered`, `read` or `failed`.

---

## 5. Tech stack

### Backend (Python)

| Purpose | Choice | Why |
| --- | --- | --- |
| Language | Python 3.12+ | Team preference, strong AI ecosystem |
| Web framework | **FastAPI** | Async, fast, automatic OpenAPI docs, WebSockets built in |
| ORM | **SQLAlchemy 2.0 (async)** + **Alembic** migrations | Mature, typed |
| Validation | **Pydantic v2** | Comes with FastAPI |
| Database | **PostgreSQL 16** + **pgvector** | Relational data + embeddings for the AI knowledge base in one DB |
| Queue / jobs | **Celery** + **Redis** (Celery Beat for schedules) | Reliable retries, rate limits, scheduled tasks |
| Cache / pub-sub | **Redis** | Live inbox events, rate-limit counters, sessions |
| HTTP client | **httpx** (async) | Calls to the Graph API |
| Auth | JWT (access + refresh), **passlib/bcrypt**, optional TOTP 2FA (**pyotp**) | |
| File storage | **S3** or **MinIO** (boto3) | Media files |
| AI | **Anthropic Claude API** (`anthropic` SDK), embeddings model, pgvector | AI agent, suggestions, summaries |
| Document parsing | `pypdf`, `python-docx`, `trafilatura` (web pages) | Knowledge-base ingestion |
| Testing | **pytest**, pytest-asyncio, httpx test client | |
| Lint / format | **ruff**, **mypy** | |

### Frontend (React)

| Purpose | Choice |
| --- | --- |
| Build tool | **Vite** + **React 18/19** + **TypeScript** |
| Routing | **React Router** |
| Server state | **TanStack Query** |
| Client state | **Zustand** |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) |
| Forms | **React Hook Form** + **Zod** |
| Tables | **TanStack Table** |
| Flow builder | **React Flow** (`@xyflow/react`) |
| Charts | **Recharts** |
| Real-time | Native WebSocket with auto-reconnect |
| Dates | **date-fns** |
| Testing | **Vitest**, **React Testing Library**, **Playwright** (end-to-end) |

### Infrastructure

- **Docker** + **docker-compose** for local development (api, worker, beat, postgres, redis, minio, frontend)
- Reverse proxy: **Nginx** or **Caddy** (automatic HTTPS)
- Hosting: one VPS to start (DigitalOcean / Hetzner / AWS Lightsail), managed Postgres later
- CI/CD: **GitHub Actions** (lint, test, build images, deploy)
- Monitoring: **Sentry** (errors), **Prometheus + Grafana** or a hosted option, **Flower** for Celery
- Local webhook testing: **ngrok** or **Cloudflare Tunnel**

---

## 6. Project folder structure

```
wati/
├── WHATSAPP_PLATFORM_BLUEPRINT.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/                     # migrations
│   ├── app/
│   │   ├── main.py                  # FastAPI app, routers, middleware
│   │   ├── core/
│   │   │   ├── config.py            # settings from env (pydantic-settings)
│   │   │   ├── database.py          # async engine/session
│   │   │   ├── security.py          # JWT, password hashing, permissions
│   │   │   ├── redis.py
│   │   │   └── logging.py
│   │   ├── models/                  # SQLAlchemy models (one file per domain)
│   │   │   ├── org.py  user.py  contact.py  conversation.py  message.py
│   │   │   ├── template.py  campaign.py  segment.py  flow.py
│   │   │   ├── ai.py  commerce.py  integration.py  audit.py
│   │   ├── schemas/                 # Pydantic request/response models
│   │   ├── api/
│   │   │   ├── deps.py              # current user, db session, permissions
│   │   │   └── v1/
│   │   │       ├── auth.py  users.py  contacts.py  conversations.py
│   │   │       ├── messages.py  templates.py  campaigns.py  segments.py
│   │   │       ├── flows.py  ai.py  commerce.py  analytics.py
│   │   │       ├── integrations.py  settings.py
│   │   │       └── public.py        # API-key protected public API
│   │   ├── webhooks/
│   │   │   ├── whatsapp.py          # verify + receive Meta webhooks
│   │   │   ├── shopify.py
│   │   │   └── payments.py          # Razorpay / PayU
│   │   ├── services/
│   │   │   ├── whatsapp/
│   │   │   │   ├── client.py        # Graph API wrapper (send, media, templates)
│   │   │   │   ├── parser.py        # webhook payload → domain events
│   │   │   │   └── sender.py        # central send service + rate limiting
│   │   │   ├── inbox.py  assignment.py  contacts.py
│   │   │   ├── campaigns.py  segments.py  templates.py
│   │   │   ├── bot_engine/          # flow runner, node handlers
│   │   │   ├── ai/                  # agent, rag, tools, prompts
│   │   │   ├── commerce/            # catalog, orders, payments
│   │   │   └── integrations/        # shopify, sheets, crm, outgoing webhooks
│   │   ├── workers/
│   │   │   ├── celery_app.py
│   │   │   ├── inbound.py  outbound.py  campaigns.py
│   │   │   ├── bots.py  ai.py  scheduled.py  integrations.py
│   │   ├── realtime/
│   │   │   └── ws.py                # WebSocket manager + Redis pub/sub
│   │   └── utils/
│   └── tests/
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx  App.tsx  router.tsx
        ├── api/                     # axios/fetch client, endpoint functions
        ├── hooks/                   # useAuth, useSocket, query hooks
        ├── stores/                  # zustand stores
        ├── components/
        │   ├── ui/                  # shadcn components
        │   ├── layout/              # sidebar, topbar
        │   ├── inbox/               # ChatList, ChatWindow, Composer, ContactPanel
        │   ├── templates/           # TemplateForm, WhatsAppPreview
        │   ├── campaigns/
        │   ├── flows/               # FlowCanvas, node components, NodeSettings
        │   └── charts/
        ├── pages/                   # one folder per route (see section 9)
        ├── lib/                     # utils, formatters, constants
        └── types/
```

---

## 7. Database schema

PostgreSQL holds everything. Every business table has `id` (UUID), `org_id`, `created_at` and `updated_at`.

### Core tables

| Table | Key columns | Notes |
| --- | --- | --- |
| `orgs` | name, timezone, settings (jsonb) | One row now; many in SaaS |
| `users` | email, password_hash, name, role, is_active, totp_secret | |
| `teams`, `team_members` | name / team_id, user_id | |
| `whatsapp_accounts` | waba_id, access_token (encrypted), app_secret (encrypted) | |
| `phone_numbers` | whatsapp_account_id, phone_number_id, display_number, display_name, quality_rating, messaging_tier, status | |
| `contacts` | wa_id (phone), name, email, opt_in_status, opt_in_source, opt_in_at, last_inbound_at, attributes (jsonb), blocked | Unique (org_id, wa_id) |
| `tags`, `contact_tags` | name, color / contact_id, tag_id | |
| `attribute_definitions` | key, label, type, options | Custom fields |
| `conversations` | contact_id, phone_number_id, status (open/pending/resolved), assigned_user_id, assigned_team_id, bot_state, window_expires_at, last_message_at, unread_count | |
| `messages` | conversation_id, contact_id, direction (in/out), wamid, type, content (jsonb), status, error_code, error_detail, sent_by (user/bot/ai/campaign), campaign_id, pricing_category, cost, created_at | Index on wamid, (conversation_id, created_at) |
| `notes` | conversation_id, user_id, body | Internal notes |
| `quick_replies` | shortcut, body, media | |
| `templates` | name, language, category, status, components (jsonb), meta_template_id, rejection_reason | |
| `segments` | name, type (dynamic/static), rules (jsonb) | |
| `segment_members` | segment_id, contact_id | Static segments only |
| `campaigns` | name, type (broadcast/drip/event), template_id, segment_id, variable_mapping (jsonb), scheduled_at, status, stats (jsonb) | |
| `campaign_recipients` | campaign_id, contact_id, message_id, status, clicked_at, replied_at | |
| `drip_steps` | campaign_id, order, delay_minutes, template_id, stop_on_reply | |
| `tracked_links` | code, target_url, campaign_id, contact_id, clicks | Click tracking |
| `flows` | name, trigger (jsonb), graph (jsonb: nodes + edges), is_active, version | |
| `flow_runs` | flow_id, conversation_id, current_node_id, variables (jsonb), status | |
| `ai_agents` | name, system_prompt, model, tools (jsonb), handoff_rules (jsonb), languages | |
| `kb_documents` | agent_id, source_type (url/pdf/docx/faq), source, status | |
| `kb_chunks` | document_id, content, embedding (vector) | pgvector index |
| `products` | catalog_id, retailer_id, name, price, currency, image_url, stock | |
| `orders` | contact_id, source (whatsapp/shopify/woo), external_id, items (jsonb), total, status, payment_status | |
| `payments` | order_id, provider, provider_ref, amount, status, link_url | |
| `ad_referrals` | message_id, contact_id, source_type, source_id (ad id), headline, ctwa_clid | CTWA attribution |
| `integrations` | type (shopify/razorpay/sheets/hubspot), config (encrypted jsonb), status | |
| `outgoing_webhooks` | url, secret, events[] | |
| `api_keys` | name, key_hash, scopes, last_used_at | |
| `events` | contact_id, name, properties (jsonb) | Tracked events that trigger campaigns |
| `webhook_events` | source, payload (jsonb), processed, error | Raw log for replay and debugging |
| `audit_logs` | user_id, action, entity, entity_id, data (jsonb) | |
| `wallet_transactions` | type, amount, reference, balance_after | Spend tracking |

### Relationships (short version)

```
org ─┬─ users ── team_members ── teams
     ├─ whatsapp_accounts ── phone_numbers
     ├─ contacts ─┬─ contact_tags ── tags
     │            ├─ conversations ─┬─ messages
     │            │                 ├─ notes
     │            │                 └─ flow_runs ── flows
     │            ├─ orders ── payments
     │            └─ events
     ├─ templates
     ├─ segments ── segment_members
     ├─ campaigns ─┬─ campaign_recipients
     │             └─ drip_steps
     └─ ai_agents ── kb_documents ── kb_chunks
```

---

## 8. Backend API design and webhook handling

### 8.1 Internal REST API (`/api/v1`, JWT auth)

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/2fa/verify` |
| Users / teams | `GET/POST /users`, `PATCH/DELETE /users/{id}`, `GET/POST /teams` |
| Contacts | `GET/POST /contacts`, `GET/PATCH/DELETE /contacts/{id}`, `POST /contacts/import`, `GET /contacts/export`, `POST /contacts/{id}/tags` |
| Conversations | `GET /conversations?status=&assignee=&q=`, `GET /conversations/{id}`, `PATCH /conversations/{id}` (status, assignee), `GET /conversations/{id}/messages`, `POST /conversations/{id}/notes` |
| Messages | `POST /conversations/{id}/messages` (text/media/interactive/template), `POST /media/upload` |
| Templates | `GET/POST /templates`, `DELETE /templates/{id}`, `POST /templates/sync` |
| Segments | `GET/POST /segments`, `POST /segments/preview` (count of matching contacts) |
| Campaigns | `GET/POST /campaigns`, `POST /campaigns/{id}/estimate`, `POST /campaigns/{id}/launch`, `POST /campaigns/{id}/pause`, `GET /campaigns/{id}/report` |
| Flows | `GET/POST /flows`, `PUT /flows/{id}`, `POST /flows/{id}/publish`, `POST /flows/{id}/test` |
| AI | `GET/POST /ai/agents`, `POST /ai/agents/{id}/documents`, `POST /ai/suggest-reply`, `POST /ai/summarize` |
| Commerce | `POST /catalog/sync`, `GET /products`, `GET /orders`, `POST /payments/link` |
| Analytics | `GET /analytics/overview`, `/analytics/campaigns`, `/analytics/agents`, `/analytics/bots`, `/analytics/ads` |
| Settings | `GET/PATCH /settings`, `GET/POST /api-keys`, `GET/POST /outgoing-webhooks`, `GET /audit-logs` |
| Real-time | `WS /ws?token=…` (events: `message.new`, `message.status`, `conversation.updated`, `typing`) |

### 8.2 Public API (`/public/v1`, API-key auth)

- `POST /public/v1/messages/template`: send a template to a phone number
- `POST /public/v1/messages/text`: send text (only inside the 24 h window)
- `POST /public/v1/contacts`: create or update a contact with tags and attributes
- `POST /public/v1/events`: track an event, which can trigger an event campaign or flow

### 8.3 WhatsApp webhook: verify and receive

```python
# app/webhooks/whatsapp.py
import hmac, hashlib
from fastapi import APIRouter, Request, Response, HTTPException, Query
from app.core.config import settings
from app.workers.inbound import process_whatsapp_event

router = APIRouter()

@router.get("/webhooks/whatsapp")
async def verify(
    mode: str = Query(alias="hub.mode"),
    token: str = Query(alias="hub.verify_token"),
    challenge: str = Query(alias="hub.challenge"),
):
    if mode == "subscribe" and token == settings.WA_VERIFY_TOKEN:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403)

@router.post("/webhooks/whatsapp")
async def receive(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(
        settings.WA_APP_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401)

    # store raw + enqueue; never do slow work here
    process_whatsapp_event.delay(body.decode())
    return {"status": "ok"}
```

### 8.4 Sending a message (Graph API client)

```python
# app/services/whatsapp/client.py
import httpx
from app.core.config import settings

GRAPH = f"https://graph.facebook.com/{settings.GRAPH_API_VERSION}"

class WhatsAppClient:
    def __init__(self, phone_number_id: str, token: str):
        self.phone_number_id = phone_number_id
        self.headers = {"Authorization": f"Bearer {token}"}

    async def send(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{GRAPH}/{self.phone_number_id}/messages",
                headers=self.headers,
                json={"messaging_product": "whatsapp", **payload},
            )
            r.raise_for_status()
            return r.json()  # contains messages[0].id = wamid

    async def send_text(self, to: str, text: str):
        return await self.send({"to": to, "type": "text", "text": {"body": text}})

    async def send_template(self, to: str, name: str, lang: str, components: list):
        return await self.send({
            "to": to,
            "type": "template",
            "template": {"name": name, "language": {"code": lang}, "components": components},
        })
```

Other Graph API calls you will use:

| Action | Call |
| --- | --- |
| Upload media | `POST /{phone_number_id}/media` |
| Download media | `GET /{media_id}`, then GET the returned URL with the token |
| List / create templates | `GET` / `POST /{waba_id}/message_templates` |
| Delete template | `DELETE /{waba_id}/message_templates?name=…` |
| Phone numbers | `GET /{waba_id}/phone_numbers` (quality, tier) |
| Mark as read | `POST /{phone_number_id}/messages` with `status: "read"` and `message_id` |
| Subscribe app to WABA | `POST /{waba_id}/subscribed_apps` |

### 8.5 Webhook payload processing rules

- `entry[].changes[].value.messages[]`: new incoming message.
  - Upsert contact (`wa_id`, `profile.name`).
  - Set `conversation.window_expires_at = now + 24h`.
  - Store any `referral` (ad click) in `ad_referrals`.
- `entry[].changes[].value.statuses[]`: update the message by `id` (wamid). Save `pricing.category`, plus `errors` when failed.
- `message_template_status_update`: update the template status and rejection reason.
- `phone_number_quality_update`: update the number's quality and tier, and alert admins.
- **Idempotency:** Meta can deliver the same webhook twice. Use a unique index on `wamid` and ignore duplicates.
- **Ordering:** status events can arrive before the send response is saved. Retry the status update after a short delay if the message is not found.

### 8.6 Campaign sender rules

- Split recipients into batches and send through a Celery queue with a rate limit (e.g. 60–80 messages/sec per number, configurable).
- Before sending, skip contacts who have opted out, are blocked, or are invalid.
- On error, look up the Meta error code:
  - retry for rate-limit and temporary errors
  - mark failed for invalid number or user not on WhatsApp
  - **pause the whole campaign** if the quality rating drops or a spam limit is hit
- Update `campaign.stats` live so the UI shows progress.

### 8.7 Bot engine (flow runner)

- A flow is a JSON graph: `nodes[]` (id, type, config) and `edges[]` (from, to, condition/button id).
- For each incoming message where the conversation has an active `flow_run`:
  1. Load the run and its current node.
  2. Validate the user's input against what the node expects (button id, text, number, email).
  3. Save variables.
  4. Follow the matching edge.
  5. Execute nodes until one needs user input, or the flow ends.
- No active run → check triggers (keyword, new contact, ad id). Still no match → default reply, AI agent, or human queue.
- Human handover sets `conversation.bot_state = "human"`. The bot then stays silent until the chat is resolved.

### 8.8 AI agent

- **Ingest:**
  1. Fetch the URL or parse the file.
  2. Split into chunks of about 500–800 tokens.
  3. Embed each chunk and store it in `kb_chunks` (pgvector).
- **Answer:**
  1. Embed the question and retrieve the top-k chunks.
  2. Call the LLM with the system prompt, the chunks, the recent conversation and the tools.
  3. Execute any tool calls (order status, booking, CRM).
  4. Reply.
- **Handoff:** when confidence is low, the user asks for a human, or a sensitive topic comes up → assign to the team with an AI summary note.
- **Cost control:** cap AI replies per conversation per day, and log tokens per message.

---

## 9. Frontend pages and components

| Route | Page | Main components |
| --- | --- | --- |
| `/login` | Login, 2FA | LoginForm, OtpInput |
| `/` | Dashboard | StatCards, MessagesChart, CampaignSummary, AgentLeaderboard |
| `/inbox` | Team inbox | ConversationList (filters, search), ChatWindow (messages, media, status ticks, 24 h timer), Composer (text, emoji, attachments, quick replies `/`, template picker), ContactPanel (profile, tags, attributes, orders, notes) |
| `/contacts` | Contacts | ContactsTable, ImportWizard (CSV mapping), ContactDrawer, TagManager |
| `/contacts/segments` | Segments | SegmentList, RuleBuilder, LiveCount |
| `/templates` | Templates | TemplateList (status badges), TemplateEditor + WhatsAppPreview |
| `/campaigns` | Campaigns | CampaignList, CampaignWizard (audience → template → variables → schedule → cost estimate → review), CampaignReport (funnel, recipient table) |
| `/campaigns/drips` | Drip sequences | DripEditor (steps + delays) |
| `/flows` | Chatbot flows | FlowList, FlowCanvas (React Flow), node palette, NodeSettingsPanel, TestChatSimulator |
| `/ai` | AI agent | AgentSettings (prompt, tone, handoff), KnowledgeBase (upload / URLs / FAQ), Playground |
| `/commerce` | Catalog and orders | ProductGrid, OrdersTable, PaymentLinkDialog |
| `/ads` | Ads attribution | AdPerformanceTable, AdFlowMapping |
| `/analytics` | Reports | Tabs: overview, campaigns, agents, bots, ads; DateRangePicker; Export |
| `/integrations` | Integrations | IntegrationCards (Shopify, Razorpay, Sheets, CRM), WebhookManager, ApiKeyManager |
| `/settings` | Settings | Business profile, phone numbers (quality/tier), users and roles, teams, working hours, quick replies, audit log, billing/wallet |

**UX rules**

- The inbox must feel instant:
  - optimistic message sending
  - WebSocket updates
  - virtualised message list for long chats
- Show the **24-hour window** clearly. When it has closed, the composer switches to "Send template".
- Every bulk action shows a confirmation with the count and estimated cost.
- The inbox must work on mobile screens (agents use phones).

---

## 10. Build roadmap

The roadmap has five phases, with a usable release at the end of each one. Estimates assume 1–2 full-time developers.

```
Phase 1  Foundation + Inbox        ███████            weeks 1–4
Phase 2  Broadcasts + Simple bots         ██████      weeks 5–8
Phase 3  AI + Commerce + Integrations          ██████ weeks 9–12
Phase 4  Flow builder + Ads + Analytics             ██████  weeks 13–16
Phase 5  Channels, Calling, Mobile, SaaS                  ████████ (later)
```

### Phase 0 — Setup (week 0, in parallel)

- [ ] Start Meta Business verification (it can take days)
- [ ] Create the Meta app, WABA, test number and system-user token
- [ ] Buy a domain; set up a VPS or cloud account
- [ ] Create the Git repo, `docker-compose.yml`, `.env.example`
- [ ] Scaffold the backend (FastAPI, SQLAlchemy, Alembic, Celery) and the frontend (Vite, React, TS, Tailwind, shadcn)

### Phase 1 — Foundation and Team Inbox (weeks 1–4)

**Backend**

- [ ] Config, DB session, base models with `org_id`, Alembic first migration
- [ ] Auth: login, JWT access/refresh, roles and permissions
- [ ] Models: orgs, users, teams, whatsapp_accounts, phone_numbers, contacts, tags, conversations, messages, notes, templates, webhook_events
- [ ] WhatsApp webhook: GET verify, POST with signature check, store and enqueue
- [ ] Inbound worker: parse messages and statuses, upsert contact and conversation, idempotency on wamid
- [ ] WhatsApp client and central sender: text, media, interactive buttons and lists, templates
- [ ] Media upload/download to S3/MinIO
- [ ] WebSocket server with Redis pub/sub
- [ ] Conversations API: list, filter, assign, status, notes, quick replies
- [ ] Templates: create, submit, sync status
- [ ] Contacts API: CRUD, tags, attributes, CSV import/export

**Frontend**

- [ ] App shell: sidebar, auth pages, protected routes
- [ ] Inbox: conversation list, chat window, composer, contact panel, live updates
- [ ] 24-hour window indicator and template sending from the inbox
- [ ] Contacts page with import wizard
- [ ] Templates page with editor and live WhatsApp preview
- [ ] Settings: users, phone number info

**Deliverable:** a team can chat with customers on WhatsApp from our own dashboard, replacing the WATI inbox.

### Phase 2 — Broadcasts, Segments and Simple Bots (weeks 5–8)

- [ ] Segments: rule builder (backend query generator + UI), live count
- [ ] Campaigns: wizard, variable mapping, scheduling with time zone, cost estimate
- [ ] Rate-limited campaign sender with retries and auto-pause on quality issues
- [ ] Click tracking with a short-link redirect service
- [ ] Retargeting: create a campaign from the read / replied / clicked / not-replied recipients
- [ ] Drip sequences with stop-on-reply
- [ ] Opt-out handling (keyword STOP + button) and opt-in sources
- [ ] Keyword bot: welcome message, keyword replies, away message, business hours
- [ ] Auto-assignment: round-robin and load-balanced
- [ ] Analytics v1: dashboard and campaign report
- [ ] Opt-in collection helpers: `wa.me` link and QR generator, website chat widget

**Deliverable:** marketing broadcasts and retargeting with full reports, replacing the AiSensy broadcasts.

### Phase 3 — AI, Commerce and Integrations (weeks 9–12)

- [ ] Knowledge base ingestion (URL, PDF, DOCX, FAQ) → chunks + embeddings (pgvector)
- [ ] AI agent: RAG answers, tools (order status, booking, CRM lookup), handoff with summary
- [ ] Agent assist in the inbox: suggested reply, summarise, translate
- [ ] AI template writer
- [ ] Catalog sync, product and multi-product messages, cart/order messages
- [ ] Payment links (Razorpay / PayU) + payment webhooks → order status
- [ ] Shopify app/webhooks: abandoned cart (3 reminders), order updates, COD confirm and COD-to-prepaid
- [ ] WooCommerce webhooks (same flows)
- [ ] Public API with API keys + outgoing webhooks
- [ ] Event tracking API → event-triggered campaigns
- [ ] Google Sheets integration

**Deliverable:** AI answers customers 24/7, e-commerce automations run, and other systems can connect.

### Phase 4 — Visual Flow Builder, Ads and Advanced Analytics (weeks 13–16)

- [ ] Flow builder UI with React Flow: node palette, settings panel, validation, versioning, publish
- [ ] Flow engine: all node types (question, condition, delay, API call, AI step, handover, sub-flow)
- [ ] Test simulator inside the builder
- [ ] WhatsApp Flows (native forms) support
- [ ] Click-to-WhatsApp: store referrals, map ad → flow, ad performance report
- [ ] Conversions API: send lead/purchase events back to Meta
- [ ] Analytics v2: agent performance, bot funnel per node, ad ROI, exports
- [ ] Audit log, granular permissions, number masking, 2FA
- [ ] HubSpot / Zoho CRM sync

**Deliverable:** feature parity with WATI, Interakt and AiSensy for our use.

### Phase 5 — Later

- [ ] Instagram DMs and Messenger in the inbox
- [ ] WhatsApp Business Calling (WebRTC), recordings, AI transcripts
- [ ] SMS / RCS / email fallback
- [ ] React Native mobile app with push notifications
- [ ] Create ads through the Meta Marketing API
- [ ] Multi-tenant SaaS:
  - Tech Provider registration and Embedded Signup
  - per-tenant wallets and billing (Razorpay/Stripe subscriptions)
  - plan limits
  - tenant admin panel

### Definition of done for every feature

- Unit tests for services, plus an API test for each endpoint
- Errors logged to Sentry; no unhandled exceptions in workers
- Works on a mobile-width screen
- Permissions checked on the backend (not only hidden in the UI)
- Documented in the OpenAPI schema

---

## 11. Security, compliance and WhatsApp policy

### Security

- Verify **every** Meta webhook with `X-Hub-Signature-256`. Verify Shopify and Razorpay webhooks with their own signatures.
- Encrypt tokens and secrets at rest (Fernet / KMS). Keep them out of the frontend and out of logs.
- HTTPS everywhere; HSTS; secure, HTTP-only refresh cookies.
- Hash passwords with bcrypt or argon2. Optional TOTP 2FA, required for admins.
- Role-based permissions enforced in API dependencies. Filter every query by `org_id`.
- Rate-limit login and public API endpoints.
- Store API keys only as hashes; show each key once at creation.
- Audit-log logins, exports, deletions, permission changes and campaign launches.
- Daily database backups, with a tested restore.
- Media URLs: signed, time-limited links.

### Data protection (India DPDP Act 2023 / GDPR if serving EU)

- Collect and store opt-in consent with source and timestamp.
- Let contacts opt out at any time (STOP keyword, button); honour it immediately.
- Data export and deletion on request.
- Retention policy for messages and media (e.g. auto-delete media after N days if desired).
- Privacy policy and terms on the website, linked in the WhatsApp business profile.

### WhatsApp Business policy (avoid bans)

- Message only users who opted in. Never message bought or scraped lists.
- Follow the Commerce Policy: no restricted products such as drugs, weapons or adult content.
- Use the correct template category. Don't hide marketing inside utility templates.
- Watch the quality rating. Auto-pause campaigns when it drops to yellow or red.
- Always give an easy way to opt out of marketing.
- Don't spam: control frequency per contact (e.g. at most N marketing messages per week).
- Hand over to a human when the user asks for one.

---

## 12. Deployment, monitoring, costs and risks

### Environments

| Env | Purpose |
| --- | --- |
| **Local** | docker-compose + ngrok/Cloudflare Tunnel for webhooks, Meta **test number** |
| **Staging** | Separate DB, separate test number, same code |
| **Production** | Real number(s), backups, monitoring, alerts |

### Deployment steps (first production release)

1. Provision a VPS (4 vCPU / 8 GB RAM is enough to start) or a managed platform.
2. Install Docker; deploy `api`, `worker`, `beat`, `frontend` (static via Nginx/Caddy), `redis`, and Postgres (managed is better).
3. Point DNS: `app.yourdomain.com` (frontend), `api.yourdomain.com` (backend).
4. Enable HTTPS (Caddy auto-TLS or certbot).
5. Run Alembic migrations; create the first owner user.
6. Set the Meta webhook URL to the production API; send a test message.
7. Set up a GitHub Actions pipeline: test → build images → deploy → run migrations.
8. Turn on Sentry, uptime checks (webhook endpoint), Flower and DB backups.

### Monitoring and alerts

- Webhook endpoint uptime and response time (must stay under ~1–2 s)
- Queue length and worker failures (Flower / Prometheus)
- Message failure rate per error code
- Phone number quality rating and tier changes → alert admins
- Meta spend per day vs. budget
- AI token usage and cost per day

### Estimated monthly running cost (single business, starting out)

| Item | Estimate |
| --- | --- |
| VPS / cloud server | ₹1,500 – ₹5,000 |
| Managed Postgres (optional) | ₹1,500 – ₹4,000 |
| Object storage (media) | ₹200 – ₹1,000 |
| Domain, email, Sentry free tier | ₹100 – ₹500 |
| AI (LLM + embeddings) | usage-based; depends on AI reply volume |
| **Meta message fees** | per message at Meta's base rate, no markup (check Meta's current India rate card) |

Compare with SaaS plans: WATI is ₹2,999–18,499/month and AiSensy ₹1,500–45,000/month, plus their message markups, chatbot and AI add-ons, and per-user fees.

### Risks and how we handle them

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Business verification delayed | Can't go live | Start on day 1; use the test number for development |
| Number quality drops / restricted | Campaigns blocked | Opt-in only, frequency caps, auto-pause, monitor quality |
| Meta API changes / version retirement | Features break | Config-driven API version, follow the Meta changelog, integration tests |
| Webhook downtime → lost messages | Missed chats | Return 200 fast, queue everything, raw event log, Meta retries, uptime alerts |
| Flow builder takes longer than planned | Delay | Ship the keyword bot first (Phase 2); flow builder in Phase 4 |
| AI gives wrong answers | Bad customer experience | RAG from our own docs only, guardrails, handoff, review logs |
| Pricing rule changes by Meta | Cost surprise | Read pricing from status webhooks, show real cost, budget alerts |
| Small team / bus factor | Slow progress | Clean structure, tests, this blueprint, documented decisions |

---

## 13. Next steps

1. **Today:** start Meta Business verification. Create the Meta app, WABA and test number.
2. **Decide:** single business only, or SaaS later? This affects Phase 5, not Phase 1.
3. **Scaffold the project** in this folder (`backend/` + `frontend/` + `docker-compose.yml`).
4. **Build Phase 1, step 1:** webhook receiver + sending a text message + storing both, tested with the Meta test number via ngrok.
5. Then follow the Phase 1 checklist above.

---

### References (official documentation)

- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- Webhooks: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
- Message templates: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- Pricing: https://developers.facebook.com/docs/whatsapp/pricing
- WhatsApp Flows: https://developers.facebook.com/docs/whatsapp/flows
- Embedded Signup (SaaS): https://developers.facebook.com/docs/whatsapp/embedded-signup
- WhatsApp Business Policy: https://business.whatsapp.com/policy
- FastAPI: https://fastapi.tiangolo.com
- React Flow: https://reactflow.dev
