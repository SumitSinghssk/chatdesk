# Starter Kit Frontend

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4. It serves both the **SEO-friendly public website** and the **admin panel** (`/admin`).

## Setup

```bash
npm install
copy .env.example .env.local   # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL
npm run dev                    # http://localhost:3000  ·  admin at /admin
```

| Script                        | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                 | Development server                                               |
| `npm run build` / `npm start` | Production build / server (the API must be running during build) |
| `npm run typecheck`           | `tsc --noEmit`                                                   |
| `npm run lint`                | ESLint                                                           |

## Folder structure

The project follows the Next.js App Router colocation convention. Code lives next to the route that uses it, in **private folders** (an underscore prefix such as `_components` keeps a folder out of routing). Only code shared by the admin **and** the website lives outside `app/`.

```
src/
├── proxy.ts                         firewall, admin gate, maintenance mode, redirects
├── lib/                             shared by admin + website only
│   ├── site.ts                      env-driven config (site name, URLs)
│   ├── utils.ts                     cn(), date/byte formatting, slugify…
│   └── api/endpoints.ts             every API path
└── app/
    ├── layout.tsx · globals.css     root: font, Tailwind, token mapping
    ├── sitemap.ts · robots.ts       generated from the API
    ├── not-found.tsx · maintenance/
    │
    ├── (website)/                   PUBLIC WEBSITE
    │   ├── layout.tsx · page.tsx    site layout · home page
    │   ├── website.css              website styles (scoped to .site-theme)
    │   ├── _components/             header/footer/nav (layout/), ui, PageSeo, HomePage
    │   ├── _lib/                    server-side fetchers (ISR), buildMetadata()
    │   ├── blog/                    page.tsx, [slug]/page.tsx, _components/
    │   ├── gallery/ · contact/ · [slug]/   each with its own _components/
    │
    ├── (customer)/                  CUSTOMER ACCOUNT (uses the website header/footer)
    │   ├── _lib/customerApi.ts      cookie-session API client for /api/v1/customer
    │   ├── _components/             AccountLink (header), GoogleButton, OtpForm, ui
    │   ├── login/ · register/       sign in / sign up (password, mobile OTP, Google)
    │   (the workspace itself lives in app/(workspace)/dashboard — see the root README)
    │
    └── admin/                       ADMIN PANEL
        ├── layout.tsx               admin scope + providers + #admin-portal
        ├── admin.css                admin styles (scoped to .admin-theme)
        ├── _components/
        │   ├── ui/                  UI kit: Button, Input, Select, MultiSelect, DatePicker,
        │   │                        TimePicker, DateRangePicker, ColorInput, RadioGroup, Card,
        │   │                        DataTable, Modal, Tabs, Badge, ImageField, RichTextEditor…
        │   ├── Providers.tsx · ConfirmProvider.tsx · TransferMenu.tsx
        ├── _hooks/                  useUrlListState, useUrlModal, useBulkSelection, useListActions…
        ├── _lib/                    api client (token refresh), one API file per resource,
        │                            permissions (PERM, usePermissions), form helpers
        ├── _store/                  authStore, themeStore
        ├── (auth)/                  login, two-factor, forgot/reset password
        │   └── _components/         AuthLayout, LoginForm, TwoFactorForm…
        └── (panel)/                 every signed-in screen
            ├── layout.tsx           renders AdminShell
            ├── _components/
            │   ├── AdminShell.tsx   main admin layout
            │   └── shell/           Sidebar, Header, UserMenu, CommandPalette, WorkspaceSwitcher,
            │                        IdleWarning, NotificationBell, navConfig, hooks
            ├── blogs/
            │   ├── page.tsx · create/page.tsx · [id]/edit/page.tsx
            │   └── _components/     Blogs.tsx (list), BlogForm.tsx, PublishCard.tsx…
            └── users/ · roles/ · settings/ · enquiries/ · seo/ · …   same pattern
```

### Admin and website are fully separate

- The admin uses `app/admin/_components` and `app/admin/admin.css` (scoped to `.admin-theme`, with dark mode).
- The website uses `app/(website)/_components` and `app/(website)/website.css` (scoped to `.site-theme`).
- Neither imports the other's code. Restyling the website can't change the admin panel.
- The only things they share are the Tailwind setup in `globals.css`, which maps token utilities (`bg-surface`, `text-fg`, `bg-primary`…) to CSS variables, and `src/lib`. Each side sets its own variable values.

### Payments

`src/lib/payments/checkout.ts` exports `openCheckout(session)`. It opens the gateway's popup (Razorpay today) for a session created by the API's `start_checkout`, and resolves to `completed`, `failed` or `dismissed`. Pass `completed.data` back to the API to confirm the payment. Both the admin test payment and future website checkouts use it.

### Customer pages

- `/login`, `/register` and `/dashboard` live in the `(customer)` route group.
- `proxy.ts` sends signed-out visitors from `/dashboard` to `/login?next=…`, and signed-in customers away from `/login` and `/register`.
- Which sign-in methods appear is set in Admin → Settings → Customer login.
- `/dashboard` is the customer's WhatsApp workspace (`app/(workspace)/dashboard`). Its sidebar comes from `_lib/nav.ts`. Profile and business name are at `/dashboard/account`.

## Conventions

- **Route files stay thin.** A `page.tsx` exports `metadata` and renders its screen from `_components`, wrapped in `<Suspense>`.
- **A list page** follows this pattern:
  - `useUrlListState` keeps page, search and filters in the URL.
  - `useQuery` fetches the data.
  - `<DataTable>` renders rows, with `<BulkActionBar>` for selected rows.
  - `useListActions` handles delete, toggle and bulk actions (confirm, toast, refetch).
- **Forms** use react-hook-form + zod, and only kit controls:
  - `Input` and `Textarea` through `register`.
  - `Select`, `MultiSelect`, `DatePicker` (`withTime` for date + time), `TimePicker`, `ColorInput`, `RadioGroup` and `Switch` through `<Controller>`.
  - The admin has no native `<select>` or browser date/time inputs.
  - Server validation errors map onto fields with `applyServerErrors()`.
  - Create/edit modals open via `?action=create` / `?action=edit&id=…`, which `useUrlModal` manages.
- **Permissions:** `const can = usePermissions(); can(PERM.BLOGS_DELETE)` hides buttons, and the menu is filtered the same way. The API enforces every permission as well.
- **Admin styling:** use the semantic tokens (`bg-surface`, `text-fg`, `border-line`, `bg-primary`…) and the UI kit only, so dark mode works everywhere.
- **SEO:** every public page exports `generateMetadata()` that calls `buildMetadata(path, pageData)`, and renders `<PageSeo path=…>`. Admin → SEO records override per path; the `*` record is the site-wide default.

## Adding an admin module

1. Add the endpoint paths to `src/lib/api/endpoints.ts`, and a resource API file to `app/admin/_lib/api/`.
2. Create `app/admin/(panel)/<module>/page.tsx` and `app/admin/(panel)/<module>/_components/` (copy `blog-categories` as a template).
3. Add the permission keys to `app/admin/_lib/permissions.ts` and a menu entry to `app/admin/(panel)/_components/shell/navConfig.ts`.

## Deployment

Run the frontend and API behind one reverse proxy (nginx, Caddy…) over HTTPS. Environment variables that matter for real visitor IPs and server-to-server calls:

| Variable            | Where    | Purpose                                                                                                                                                                                                                   |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY`       | frontend | `true` only behind your own reverse proxy: the proxy (`src/proxy.ts`) then reads the visitor IP from the right-most `X-Forwarded-For` entry for the firewall check. Leave unset otherwise (clients can forge the header). |
| `TRUSTED_PROXIES`   | API      | IPs/CIDRs of the proxies (and the Next server) whose `X-Forwarded-For` the API trusts for rate limiting, firewall and logs.                                                                                               |
| `INTERNAL_API_KEY`  | both     | Shared secret the Next server sends (`X-Internal-Key`) on server-to-server calls such as the firewall list fetch. Same value on both sides; never prefix it with `NEXT_PUBLIC_`.                                          |
| `ADMIN_HINT_SECRET` | both     | Secret used to sign the admin "signed-in" hint cookie checked by the proxy (admin gate / maintenance bypass).                                                                                                             |

Security headers: `/admin` gets a strict per-request nonce CSP from `src/proxy.ts` (admin pages render dynamically); the public website keeps static/ISR rendering with a baseline CSP from `next.config.ts` that does not restrict `script-src`, so admin-authored analytics/SEO scripts keep working.

## Docker

`docker-compose.yml` builds the site as a standalone Next.js server. Start the API folder first, because it creates the shared `starter-kit` network.

```bash
cp .env.docker.example .env.docker      # same ADMIN_HINT_SECRET and INTERNAL_API_KEY as the API
docker compose --env-file .env.docker up -d --build
```

- `SITE_URL` and `SENTRY_DSN` are built into the image, so rebuild (`--build`) after changing them.
- The site listens on `127.0.0.1:3000` by default. Put nginx, Caddy or Traefik in front of it for HTTPS, or set `FRONTEND_BIND=0.0.0.0`.
- When the API isn't reachable during a build (Docker, CI), website pages render on request instead of being pre-rendered. Nothing else changes.

## CI

`.github/workflows/ci.yml` runs lint, type check, `format:check`, a production build and a Docker build on every push. GitHub only reads workflows from the repository root. Push this folder as its own repository, or copy the file to `<repo>/.github/workflows/`. If you copy it, set `defaults.run.working-directory` and the Docker `context` to `starter-kit-frontend`.

## Error monitoring (Sentry)

Set `NEXT_PUBLIC_SENTRY_DSN` (in `.env.local`) or `SENTRY_DSN` (in `.env.docker`) to report errors from the browser, server rendering and the proxy. Leave it empty to turn it off: the SDK isn't loaded at all. Cookies, auth headers and request bodies are never sent. For readable stack traces, set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` at build time to upload source maps.

## Caching

- Website data is fetched through `apiGet` (`src/app/(website)/_lib/server.ts`). Each request is cached for 10 minutes (`CACHE_TTL` in `src/config/cache.ts`) and tagged by the kind of data it returns (`tagsForPath`).
- The API calls `POST /api/revalidate` with the changed tags after every edit, so the matching pages refresh immediately. The call is authenticated with `INTERNAL_API_KEY`, which must match the API.
- The same call also clears the proxy's in-memory redirects, maintenance and firewall lists (`src/lib/proxyCache.ts`), which otherwise refresh every 5 minutes.
- When adding a website endpoint, add its path to `PATH_TAGS` in `src/config/cache.ts` and its table to `TABLE_TAGS` in the API's `app/core/cache.py`.
- The admin panel uses TanStack Query (30 s stale time). After a change, refresh every query key the change affects. Example: comment actions also refresh `QK.BLOGS`, because the blog list shows comment counts.
