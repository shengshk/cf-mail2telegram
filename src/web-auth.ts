import type { Environment } from './types';
import { htmlLang, resolveUiLang, t, type UiLang } from './i18n';

export const WEB_AUTH_COOKIE = 'm2t_session';
export const WEB_SESSION_TTL_SEC = 7 * 24 * 60 * 60;
export const WEB_REMEMBER_TTL_SEC = 30 * 24 * 60 * 60;

export interface WebUserCreds {
    username: string;
    password: string;
}

/** `WEB_USER=user,key` — split on first comma only. */
export function parseWebUser(env: Environment): WebUserCreds | undefined {
    const raw = (env.WEB_USER || '').trim();
    if (!raw) {
        return undefined;
    }
    const i = raw.indexOf(',');
    if (i <= 0 || i >= raw.length - 1) {
        return undefined;
    }
    const username = raw.slice(0, i).trim();
    const password = raw.slice(i + 1);
    if (!username || !password) {
        return undefined;
    }
    return { username, password };
}

export function isWebAuthEnabled(env: Environment): boolean {
    return !!parseWebUser(env);
}

function b64urlEncode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) {
        s += String.fromCharCode(b);
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Uint8Array {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    );
}

async function signPayload(secret: string, payload: string): Promise<string> {
    const key = await hmacKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return b64urlEncode(new Uint8Array(sig));
}

async function verifyPayload(secret: string, payload: string, signature: string): Promise<boolean> {
    const expected = await signPayload(secret, payload);
    if (expected.length !== signature.length) {
        return false;
    }
    let ok = 0;
    for (let i = 0; i < expected.length; i++) {
        ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return ok === 0;
}

export async function makeWebAuthCookie(
    creds: WebUserCreds,
    remember: boolean,
    now = Date.now(),
): Promise<{ value: string; maxAge: number }> {
    const maxAge = remember ? WEB_REMEMBER_TTL_SEC : WEB_SESSION_TTL_SEC;
    const expires = Math.floor(now / 1000) + maxAge;
    const raw = `${creds.username}|${expires}`;
    const payload = b64urlEncode(new TextEncoder().encode(raw));
    const signature = await signPayload(creds.password, payload);
    return { value: `${payload}.${signature}`, maxAge };
}

export async function isWebAuthenticated(
    env: Environment,
    cookieHeader: string | null,
    now = Date.now(),
): Promise<boolean> {
    const creds = parseWebUser(env);
    if (!creds) {
        return true;
    }
    const match = /(?:^|;\s*)m2t_session=([^;]+)/.exec(cookieHeader || '');
    const value = match?.[1] ? decodeURIComponent(match[1]) : '';
    if (!value || !value.includes('.')) {
        return false;
    }
    const [payload, signature] = value.split('.', 2);
    if (!payload || !signature) {
        return false;
    }
    if (!(await verifyPayload(creds.password, payload, signature))) {
        return false;
    }
    try {
        const raw = new TextDecoder().decode(b64urlDecode(payload));
        const [user, expStr] = raw.split('|', 2);
        const exp = Number.parseInt(expStr || '', 10);
        if (!user || user !== creds.username || !Number.isFinite(exp)) {
            return false;
        }
        return exp * 1000 > now;
    } catch {
        return false;
    }
}

export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
    const next = (raw || '').trim() || fallback;
    if (!next.startsWith('/') || next.startsWith('//')) {
        return fallback;
    }
    return next;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const LOGIN_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
background:#f0f1f3;color:#1f2937;-webkit-font-smoothing:antialiased}
.wrap{min-height:100vh;display:grid;place-items:center;padding:1.5rem}
.card{width:100%;max-width:420px;padding:1.75rem;border-radius:12px;border:1px solid #e5e7eb;
background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);
display:flex;flex-direction:column;gap:.75rem}
h1{margin:0;font-size:1.25rem;font-weight:650;color:#111827;letter-spacing:-.01em}
.sub{margin:0;font-size:.875rem;color:#6b7280;line-height:1.5}
input{width:100%;border-radius:8px;border:1px solid #d1d5db;background:#fff;
color:#111827;padding:.65rem .75rem;font-size:.9rem;outline:none}
input:focus{border-color:#9ca3af;box-shadow:0 0 0 3px rgba(156,163,175,.25)}
label.rem{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:#4b5563;cursor:pointer;user-select:none}
.err{margin:0;font-size:.875rem;color:#b91c1c}
button{width:100%;border:none;border-radius:8px;padding:.7rem 1rem;font-size:.95rem;font-weight:600;
color:#fff;background:#374151;cursor:pointer}
button:hover{background:#1f2937}
`.trim();

export function renderLoginPage(
    env: Environment,
    opts: { nextUrl?: string; error?: string } = {},
): string {
    const lang = resolveUiLang(env);
    const title = escapeHtml(t(lang, 'loginTitle'));
    const subtitle = escapeHtml(t(lang, 'loginSub'));
    const nextUrl = escapeHtml(safeNextPath(opts.nextUrl));
    const err = opts.error
        ? `<p class="err">${escapeHtml(t(lang, opts.error as 'loginBadCredentials'))}</p>`
        : '';
    return `<!doctype html><html lang="${htmlLang(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${LOGIN_CSS}</style></head>
<body><div class="wrap"><form class="card" method="post" action="/login">
<h1>${title}</h1><p class="sub">${subtitle}</p>
${err}
<input type="hidden" name="next" value="${nextUrl}">
<input name="username" type="text" placeholder="${escapeHtml(t(lang, 'loginUsername'))}" required autocomplete="username">
<input name="password" type="password" placeholder="${escapeHtml(t(lang, 'loginPassword'))}" required autocomplete="current-password">
<label class="rem"><input type="checkbox" name="remember" value="1"> ${escapeHtml(t(lang, 'loginRemember'))}</label>
<button type="submit">${escapeHtml(t(lang, 'loginBtn'))}</button>
</form></div></body></html>`;
}

export function setWebAuthCookieHeader(value: string, maxAge: number, secure: boolean): string {
    const parts = [
        `${WEB_AUTH_COOKIE}=${encodeURIComponent(value)}`,
        'Path=/',
        `Max-Age=${maxAge}`,
        'HttpOnly',
        'SameSite=Lax',
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

export function clearWebAuthCookieHeader(secure: boolean): string {
    const parts = [
        `${WEB_AUTH_COOKIE}=`,
        'Path=/',
        'Max-Age=0',
        'HttpOnly',
        'SameSite=Lax',
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

export function requestIsHttps(req: Request): boolean {
    const url = new URL(req.url);
    if (url.protocol === 'https:') {
        return true;
    }
    const xf = (req.headers.get('X-Forwarded-Proto') || '').split(',')[0]?.trim().toLowerCase();
    return xf === 'https';
}

export type { UiLang };
