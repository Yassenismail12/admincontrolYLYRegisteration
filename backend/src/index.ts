interface Env {
  WORKER_ALLOWED_ORIGIN?: string;
  DB: D1Database;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

const DEFAULT_ORIGIN = 'http://localhost:3000';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const SESSION_COOKIE_NAME = 'yly_admin_session';
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_ATTEMPT_LIMIT = 8;

const APPLICANT_SORT_FIELDS = new Set([
  'id', 'full_name', 'national_id', 'whatsapp', 'email', 'governorate',
  'university', 'faculty', 'study_year', 'egyptian', 'age', 'submitted_at',
]);

const APPLICANT_EXPORT_COLUMNS = [
  'id', 'full_name', 'national_id', 'whatsapp', 'email', 'age', 'egyptian',
  'governorate', 'university', 'faculty', 'study_year', 'how_know_about_us',
  'submitted_at', 'source',
];

// ---------------------------------------------------------------------------
// CORS - only ever echoes back an Origin that is explicitly trusted, since
// admin routes rely on cookies + Access-Control-Allow-Credentials.
// ---------------------------------------------------------------------------

function getAllowedOrigins(env: Env): string[] {
  const raw = env.WORKER_ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function resolveOrigin(request: Request, env: Env): string {
  const requestOrigin = request.headers.get('Origin');
  const allowed = getAllowedOrigins(env);
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowed[0] || DEFAULT_ORIGIN;
}

function buildCorsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  origin = DEFAULT_ORIGIN,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(origin),
      ...extraHeaders,
    },
  });
}

function logEvent(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...details }));
}

// ---------------------------------------------------------------------------
// Session auth - stateless, signed cookies (HMAC-SHA256). The cookie itself
// carries the username + expiry, so no session table is needed.
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function fromBase64UrlToStandard(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64;
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): string {
  return atob(fromBase64UrlToStandard(input));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function createSessionToken(username: string, env: Env): Promise<string> {
  const payload = JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_SECONDS * 1000 });
  const payloadEncoded = base64UrlEncode(payload);
  const key = await hmacKey(env.SESSION_SECRET);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payloadEncoded));
  const signatureEncoded = base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
  return `${payloadEncoded}.${signatureEncoded}`;
}

async function verifySessionToken(token: string, env: Env): Promise<{ username: string } | null> {
  const [payloadEncoded, signatureEncoded] = token.split('.');
  if (!payloadEncoded || !signatureEncoded) return null;

  const key = await hmacKey(env.SESSION_SECRET);
  const signatureBytes = decodeBase64(fromBase64UrlToStandard(signatureEncoded));
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, textEncoder.encode(payloadEncoded));
  if (!valid) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (typeof payload.u !== 'string') return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || '';
  const out: Record<string, string> = {};
  header.split(';').forEach((part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });
  return out;
}

function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function buildClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

async function requireAdmin(request: Request, env: Env): Promise<{ username: string } | null> {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return await verifySessionToken(token, env);
}

// Constant-time comparison so login timing doesn't leak how many characters matched.
function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length, 1);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLength; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

// Brute-force throttle backed by D1 directly - no external cache/KV service needed.
async function loginAttemptsExceeded(ip: string, env: Env): Promise<boolean> {
  const now = Date.now();
  const row = (await env.DB.prepare('SELECT count, window_start FROM admin_login_attempts WHERE ip = ?').bind(ip).first()) as
    | { count: number; window_start: number }
    | null;

  if (!row || now - row.window_start > LOGIN_ATTEMPT_WINDOW_MS) {
    await env.DB
      .prepare(
        'INSERT INTO admin_login_attempts (ip, count, window_start) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET count = 1, window_start = excluded.window_start'
      )
      .bind(ip, now)
      .run();
    return false;
  }

  const nextCount = row.count + 1;
  await env.DB.prepare('UPDATE admin_login_attempts SET count = ? WHERE ip = ?').bind(nextCount, ip).run();
  return nextCount > LOGIN_ATTEMPT_LIMIT;
}

// ---------------------------------------------------------------------------
// Registration on/off toggle, backed by the shared `settings` table.
// ---------------------------------------------------------------------------

async function getRegistrationOpen(env: Env): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'registration_open'").first();
  return !row || (row as any).value !== 'false';
}

async function setRegistrationOpen(open: boolean, env: Env): Promise<void> {
  await env.DB
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .bind('registration_open', open ? 'true' : 'false')
    .run();
}

// ---------------------------------------------------------------------------
// Applicants query building (list + export share the same filters)
// ---------------------------------------------------------------------------

function buildApplicantsQuery(params: URLSearchParams) {
  const search = params.get('search')?.trim();
  const governorate = params.get('governorate')?.trim();
  const university = params.get('university')?.trim();
  const studyYear = params.get('study_year')?.trim();
  const egyptianParam = params.get('egyptian');
  const requestedSort = params.get('sort') || '';
  const sortField = APPLICANT_SORT_FIELDS.has(requestedSort) ? requestedSort : 'submitted_at';
  const order = params.get('order') === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const bindings: any[] = [];

  if (search) {
    conditions.push('(full_name LIKE ? OR national_id LIKE ? OR whatsapp LIKE ? OR email LIKE ?)');
    const like = `%${search}%`;
    bindings.push(like, like, like, like);
  }
  if (governorate) {
    conditions.push('governorate = ?');
    bindings.push(governorate);
  }
  if (university) {
    conditions.push('university = ?');
    bindings.push(university);
  }
  if (studyYear) {
    conditions.push('study_year = ?');
    bindings.push(studyYear);
  }
  if (egyptianParam === 'true' || egyptianParam === 'false') {
    conditions.push('egyptian = ?');
    bindings.push(egyptianParam === 'true' ? 1 : 0);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, bindings, sortField, order };
}

function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Record<string, any>[], columns: string[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvField(row[column])).join(','));
  }
  return lines.join('\n');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(request, env);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
    }

    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'anonymous';

    if (path === '/api/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok', ts: Date.now() }, 200, origin);
    }

    // -- Public read-only endpoint so the main registration form can show a
    //    "closed" message. Intentionally has no auth requirement.
    if (path === '/api/registration-status' && request.method === 'GET') {
      const open = await getRegistrationOpen(env);
      return jsonResponse({ open }, 200, origin);
    }

    if (path === '/api/login' && request.method === 'POST') {
      try {
        const tooMany = await loginAttemptsExceeded(clientIp, env);
        if (tooMany) {
          logEvent('admin_login_blocked', { clientIp });
          return jsonResponse({ error: 'Too many login attempts. Please try again later.' }, 429, origin);
        }

        const body = (await request.json()) as { username?: string; password?: string };
        const username = String(body.username ?? '');
        const password = String(body.password ?? '');

        const usernameOk = constantTimeEqual(username, env.ADMIN_USERNAME || '');
        const passwordOk = constantTimeEqual(password, env.ADMIN_PASSWORD || '');

        if (!usernameOk || !passwordOk) {
          logEvent('admin_login_failed', { clientIp });
          return jsonResponse({ error: 'Invalid username or password.' }, 401, origin);
        }

        const token = await createSessionToken(username, env);
        logEvent('admin_login_success', { clientIp, username });
        return jsonResponse({ success: true, username }, 200, origin, { 'Set-Cookie': buildSessionCookie(token) });
      } catch (error) {
        logEvent('admin_login_error', { clientIp, error: String(error) });
        return jsonResponse({ error: 'Login failed.' }, 500, origin);
      }
    }

    if (path === '/api/logout' && request.method === 'POST') {
      return jsonResponse({ success: true }, 200, origin, { 'Set-Cookie': buildClearCookie() });
    }

    if (path === '/api/me' && request.method === 'GET') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ authenticated: false }, 401, origin);
      return jsonResponse({ authenticated: true, username: session.username }, 200, origin);
    }

    if (path === '/api/applicants' && request.method === 'GET') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

      const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 25) || 25));
      const offset = (page - 1) * pageSize;
      const { whereClause, bindings, sortField, order } = buildApplicantsQuery(url.searchParams);

      const [countResult, dataResult] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as total FROM applicants ${whereClause}`).bind(...bindings).first(),
        env.DB
          .prepare(`SELECT * FROM applicants ${whereClause} ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`)
          .bind(...bindings, pageSize, offset)
          .all(),
      ]);

      return jsonResponse(
        { data: dataResult.results, total: (countResult as any)?.total ?? 0, page, pageSize },
        200,
        origin
      );
    }

    if (path === '/api/applicants/export' && request.method === 'GET') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

      const { whereClause, bindings, sortField, order } = buildApplicantsQuery(url.searchParams);
      const result = await env.DB
        .prepare(`SELECT * FROM applicants ${whereClause} ORDER BY ${sortField} ${order}`)
        .bind(...bindings)
        .all();

      const csv = toCsv(result.results as Record<string, any>[], APPLICANT_EXPORT_COLUMNS);
      logEvent('admin_export', { clientIp, username: session.username, count: result.results.length });

      return new Response(csv, {
        status: 200,
        headers: {
          ...buildCorsHeaders(origin),
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="applicants-${Date.now()}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (path === '/api/applicants/recent' && request.method === 'GET') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

      const sinceId = Number(url.searchParams.get('sinceId') || 0) || 0;
      const result = await env.DB
        .prepare('SELECT * FROM applicants WHERE id > ? ORDER BY id ASC LIMIT 50')
        .bind(sinceId)
        .all();

      return jsonResponse({ data: result.results }, 200, origin);
    }

    if (path === '/api/analytics' && request.method === 'GET') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

      const [totalRow, todayRow, weekRow, byGovernorate, byUniversity, byStudyYear, byHowKnow, byDay] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) as count FROM applicants').first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM applicants WHERE date(submitted_at) = date('now')").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM applicants WHERE submitted_at >= datetime('now', '-7 days')").first(),
        env.DB.prepare('SELECT governorate, COUNT(*) as count FROM applicants WHERE governorate IS NOT NULL GROUP BY governorate ORDER BY count DESC').all(),
        env.DB.prepare('SELECT university, COUNT(*) as count FROM applicants WHERE university IS NOT NULL GROUP BY university ORDER BY count DESC LIMIT 15').all(),
        env.DB.prepare('SELECT study_year, COUNT(*) as count FROM applicants WHERE study_year IS NOT NULL GROUP BY study_year ORDER BY count DESC').all(),
        env.DB.prepare('SELECT how_know_about_us, COUNT(*) as count FROM applicants WHERE how_know_about_us IS NOT NULL GROUP BY how_know_about_us ORDER BY count DESC').all(),
        env.DB.prepare("SELECT date(submitted_at) as day, COUNT(*) as count FROM applicants GROUP BY day ORDER BY day DESC LIMIT 30").all(),
      ]);

      return jsonResponse(
        {
          total: (totalRow as any)?.count ?? 0,
          today: (todayRow as any)?.count ?? 0,
          last7Days: (weekRow as any)?.count ?? 0,
          byGovernorate: byGovernorate.results,
          byUniversity: byUniversity.results,
          byStudyYear: byStudyYear.results,
          byHowKnowAboutUs: byHowKnow.results,
          byDay: byDay.results,
        },
        200,
        origin
      );
    }

    if (path === '/api/settings' && request.method === 'GET') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401, origin);
      const open = await getRegistrationOpen(env);
      return jsonResponse({ registration_open: open }, 200, origin);
    }

    if (path === '/api/settings' && request.method === 'POST') {
      const session = await requireAdmin(request, env);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401, origin);

      const body = (await request.json()) as { registration_open?: boolean };
      const nextValue = Boolean(body.registration_open);
      await setRegistrationOpen(nextValue, env);
      logEvent('admin_settings_update', { clientIp, username: session.username, registration_open: nextValue });
      return jsonResponse({ success: true, registration_open: nextValue }, 200, origin);
    }

    return jsonResponse({ error: 'Not found' }, 404, origin);
  },
};
