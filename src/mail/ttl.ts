import type { Environment } from '../types';

export interface MailsTtlConfig {
    /** KV expirationTtl in seconds (min 60) */
    ttlSeconds: number;
    /** Max preview caches to keep; older IDs are deleted */
    maxCount: number;
}

const DURATION_RE = /^(\d+)\s*([smhd])?$/i;

/** Parse `30m` / `1h` / `1d` / bare seconds → seconds */
export function parseDurationToSeconds(raw: string): number | undefined {
    const s = raw.trim();
    if (!s) {
        return undefined;
    }
    const m = DURATION_RE.exec(s);
    if (!m) {
        return undefined;
    }
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 0) {
        return undefined;
    }
    const unit = (m[2] || 's').toLowerCase();
    switch (unit) {
        case 's':
            return n;
        case 'm':
            return n * 60;
        case 'h':
            return n * 3600;
        case 'd':
            return n * 86400;
        default:
            return undefined;
    }
}

/**
 * `MAILS_TTL=1d,10` → time + max count.
 * Defaults: 1d, unlimited count (Number.MAX_SAFE_INTEGER) if second part omitted — require both for clarity.
 * Invalid / empty → 1d, 100.
 */
export function parseMailsTtl(raw: string | undefined): MailsTtlConfig {
    const fallback: MailsTtlConfig = { ttlSeconds: 86400, maxCount: 100 };
    const trimmed = (raw || '').trim();
    if (!trimmed) {
        return fallback;
    }
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    const ttlSeconds = parseDurationToSeconds(parts[0] || '') ?? fallback.ttlSeconds;
    let maxCount = fallback.maxCount;
    if (parts[1] !== undefined) {
        const n = Number.parseInt(parts[1], 10);
        if (Number.isFinite(n) && n > 0) {
            maxCount = n;
        }
    }
    return {
        ttlSeconds: Math.max(60, ttlSeconds),
        maxCount,
    };
}

export function resolveMailsTtl(env: Environment): MailsTtlConfig {
    return parseMailsTtl(env.MAILS_TTL);
}
