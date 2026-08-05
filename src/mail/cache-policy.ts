import type { EmailCache } from '../types';

/** Max mail bodies kept in KV (oldest dropped). No per-entry time TTL on data. */
export const MAIL_CACHE_MAX = 100;

/** Unauthenticated web preview link lifetime (data may still exist). */
export const WEB_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** Soft TTL for Telegram message_id → mail id map (orphan cleanup). */
export const TELEGRAM_ID_MAP_TTL_SECONDS = 90 * 24 * 60 * 60;

export function attachWebPreviewMeta(mail: EmailCache, now = Date.now()): void {
    mail.webToken = crypto.randomUUID().replace(/-/g, '');
    mail.webExpiresAt = now + WEB_LINK_TTL_MS;
}

export function isWebLinkValid(mail: EmailCache, token: string | undefined, now = Date.now()): boolean {
    const t = (token || '').trim();
    if (!t || !mail.webToken || t !== mail.webToken) {
        return false;
    }
    if (!mail.webExpiresAt || now >= mail.webExpiresAt) {
        return false;
    }
    return true;
}

export function webPreviewUrl(
    host: string,
    mail: EmailCache,
    opts?: { authEnabled?: boolean },
): string | undefined {
    if (!host || !mail.id) {
        return undefined;
    }
    if (opts?.authEnabled) {
        return `https://${host}/email/${encodeURIComponent(mail.id)}`;
    }
    if (!mail.webToken) {
        return undefined;
    }
    return `https://${host}/email/${encodeURIComponent(mail.id)}?t=${encodeURIComponent(mail.webToken)}`;
}
