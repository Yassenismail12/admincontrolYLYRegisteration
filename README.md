# YLY Admin Dashboard

A standalone admin dashboard for the YLY registration system. This is a
separate project from the main `RegistrationForm` repo - it has its own
Worker and its own Next.js frontend, deployed independently. It connects to
the **same D1 database** as the main registration Worker, so applicant data
stays in one place.

```
backend/    Cloudflare Worker - auth, applicants, analytics, settings
frontend/   Next.js dashboard (static export) - login, overview, applicants
```

## What this gives you

- Session-based login (signed HttpOnly cookie, 12h expiry) for a single admin account.
- An overview page: total/today/last-7-days stats, a registration on/off toggle, charts by governorate/study year/university/source, signups over the last 30 days, and a live feed that polls for new submissions every 5 seconds.
- An applicants page: search, filter by governorate/study year/Egyptian status, sortable columns, pagination, and CSV export.

## One thing this can't do by itself

The registration on/off toggle writes to a `settings` row in the shared
database, and this dashboard's `/api/registration-status` endpoint can read
it - but the actual public registration form is served by your *other*
Worker (`RegistrationForm/backend`), so blocking new signups requires that
Worker to check the flag before saving. See `OPTIONAL-public-worker-snippet.md`
in this folder for the ~10 lines to add there if you want the toggle to
actually block submissions, not just be visible here.

## Setup

### 1. Backend (Worker)

```bash
cd backend
npm install
```

Set the required secrets (these are never written to `wrangler.toml`):

```bash
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET   # e.g. `openssl rand -hex 32`
```

Apply migrations to the shared D1 database (safe to run even if the table
already exists, since they use `CREATE TABLE IF NOT EXISTS`):

```bash
npx wrangler d1 migrations apply yly-registration-db --remote
```

Update `WORKER_ALLOWED_ORIGIN` in `wrangler.toml` to your dashboard's deployed
URL (comma-separated if you want to also allow `http://localhost:3000` for
local dev), then deploy:

```bash
npm run deploy
```

### 2. Frontend (Next.js, static export)

```bash
cd frontend
npm install
cp .env.local.example .env.local
# edit .env.local: NEXT_PUBLIC_API_URL=https://<your-worker-subdomain>.workers.dev
npm run dev      # local dev at http://localhost:3000
npm run build    # outputs static files to ./out for Cloudflare Pages
```

Deploy `out/` as a new Cloudflare Pages project (separate from your existing
`registration-form` Pages project), e.g.:

```bash
npx wrangler pages deploy out --project-name=yly-admin-dashboard
```

### 3. Local development note

Admin session cookies are set with `SameSite=None; Secure`, which requires
HTTPS. Plain `http://localhost:3000` won't receive the cookie back from a
deployed (https) Worker. Easiest options for local testing: run `wrangler
dev --remote` and test against `https://localhost:8787`-style tunneled URLs,
or just test directly against your deployed Worker + deployed Pages preview
URL once both are live.
