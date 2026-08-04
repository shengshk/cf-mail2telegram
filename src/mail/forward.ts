import type { Environment } from '../types';

export interface ForwardTarget {
    /** Destination address for Email Routing forward */
    email: string;
    /** Optional Gmail label/folder; only used from the primary target */
    folder?: string;
}

const FORWARD_EMAIL_RE = /^FORWARD_EMAIL(\d*)$/;

/** Parse one value: `user@gmail.com` or `user@gmail.com,Backup` */
export function parseForwardEmailValue(raw: string): ForwardTarget | undefined {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    const comma = trimmed.indexOf(',');
    if (comma < 0) {
        return { email: trimmed };
    }
    const email = trimmed.slice(0, comma).trim();
    const folder = trimmed.slice(comma + 1).trim();
    if (!email) {
        return undefined;
    }
    return folder ? { email, folder } : { email };
}

/**
 * Collect FORWARD_EMAIL, FORWARD_EMAIL0, FORWARD_EMAIL1, … (any digits).
 * Order: bare FORWARD_EMAIL first, then numeric suffixes ascending.
 * Fallback: legacy FORWARD_LIST (+ FORWARD_DIR / GMAIL_LABEL on the first address).
 */
export function listForwardTargets(env: Environment): ForwardTarget[] {
    const found = new Map<number, string>();

    const consider = (order: number, raw: unknown) => {
        const s = String(raw ?? '').trim();
        if (!s || found.has(order)) {
            return;
        }
        found.set(order, s);
    };

    consider(-1, env.FORWARD_EMAIL);

    const bag = env as Record<string, unknown>;
    for (const key of Object.keys(bag)) {
        const m = FORWARD_EMAIL_RE.exec(key);
        if (!m) {
            continue;
        }
        const order = m[1] === '' ? -1 : Number.parseInt(m[1], 10);
        if (!Number.isFinite(order)) {
            continue;
        }
        consider(order, bag[key]);
    }

    // Probe common numeric suffixes in case env keys are not fully enumerable
    for (let i = 0; i <= 64; i++) {
        consider(i, bag[`FORWARD_EMAIL${i}`]);
    }

    if (found.size > 0) {
        const orders = [...found.keys()].sort((a, b) => a - b);
        const out: ForwardTarget[] = [];
        const seen = new Set<string>();
        for (const order of orders) {
            const parsed = parseForwardEmailValue(found.get(order)!);
            if (!parsed) {
                continue;
            }
            const key = parsed.email.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(parsed);
        }
        return out;
    }

    // Legacy FORWARD_LIST + FORWARD_DIR
    const list = (env.FORWARD_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
    const folder = (env.FORWARD_DIR || env.GMAIL_LABEL || '').trim();
    return list.map((email, i) => (i === 0 && folder ? { email, folder } : { email }));
}

export function forwardEmailAddresses(env: Environment): string[] {
    return listForwardTargets(env).map(t => t.email);
}

/** Primary backup address + optional Gmail folder for the Mailbox button */
export function primaryForwardTarget(env: Environment): ForwardTarget | undefined {
    return listForwardTargets(env)[0];
}
