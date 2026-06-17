# Optional: make the registration toggle actually block new signups

This dashboard's "Registration open/closed" toggle writes directly to a
`settings` row in your shared D1 database. The dashboard and its Worker can
read that value fine on their own - but your **existing** public Worker
(`RegistrationForm/backend/src/index.ts`) is what actually serves
`POST /api/register`, so it's the only place that can stop a submission
from being saved. Everything below is optional and entirely manual (no git
patch needed) - three small additions to one file.

Open `RegistrationForm/backend/src/index.ts` and make these three changes:

## 1. Add a small helper (anywhere near the top, e.g. right after `toEnglishNumbers`)

```ts
async function getRegistrationOpen(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'registration_open'").first();
  return !row || (row as any).value !== 'false';
}
```

## 2. (Optional but recommended) Let the public form ask whether registration is open

Find this block:

```ts
    if (path === '/api/page-data' && request.method === 'GET') {
```

Add this right above it:

```ts
    if (path === '/api/registration-status' && request.method === 'GET') {
      const open = await getRegistrationOpen(env);
      return jsonResponse({ open }, 200, 'public, max-age=15', origin);
    }

```

(Then have the frontend's `RegistrationForm.jsx` fetch this once and show a
"registration is currently closed" message when `open` is `false` - up to
you, the form will otherwise just show the 403 error message below.)

## 3. Block submissions while closed

Find this line inside the `/api/register` handler:

```ts
  try {
    const body = (await request.json()) as Record<string, any>;
```

Replace it with:

```ts
  try {
    const registrationOpen = await getRegistrationOpen(env);
    if (!registrationOpen) {
      logEvent('registration_closed', { clientId, path });
      return jsonResponse({ error: 'التسجيل مغلق حاليًا. تابعنا لمعرفة موعد الفتح القادم.' }, 403, 'no-store', origin);
    }

    const body = (await request.json()) as Record<string, any>;
```

That's it - no new secrets, no new bindings. It reuses the `env.DB` binding
your Worker already has, reading the same `settings` table the dashboard
writes to.

## A separate, unrelated thing worth knowing about

Your `backend/wrangler.toml` currently has `TURNSTILE_SECRET` and
`FIREBASE_API_KEY` hardcoded in `[vars]`, which means they're sitting in
plaintext in your git history. This is unrelated to the dashboard, but since
you're already in this file: consider moving `TURNSTILE_SECRET` to a Worker
secret (`wrangler secret put TURNSTILE_SECRET`, then remove it from
`wrangler.toml`) and rotating it in the Cloudflare Turnstile dashboard, since
the committed value should be treated as compromised.
