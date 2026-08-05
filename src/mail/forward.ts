import type { EmailMessage } from '@cloudflare/workers-types';
import type { Environment } from '../types';

export type ForwardedBackupPolicy = 'noforwarded' | 'forwarded';

export interface ForwardTarget {
    /** Destination address for Email Routing forward */
    email: string;
    /** Optional Gmail label/folder; used by the Mailbox button */
    folder?: string;
    /**
     * `noforwarded` (default): only backup mail addressed to the domain inbox.
     * `forwarded`: also backup mail that was auto-forwarded in from another mailbox.
     */
    policy: ForwardedBackupPolicy;
}

const POLICY_RE = /^(noforwarded|forwarded)$/i;
const EMAIL_IN_HEADER_RE = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*/gi;

/**
 * Parse one value: `user@gmail.com` | `user@gmail.com,Backup` |
 * `user@gmail.com,Backup,noforwarded` | `user@gmail.com,forwarded` | `user@gmail.com,,forwarded`
 */
export function parseForwardMailsValue(raw: string): ForwardTarget | undefined {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    const parts = trimmed.split(',').map(s => s.trim());
    let policy: ForwardedBackupPolicy = 'noforwarded';
    if (parts.length > 1 && POLICY_RE.test(parts[parts.length - 1] || '')) {
        policy = parts.pop()!.toLowerCase() as ForwardedBackupPolicy;
    }
    const email = (parts[0] || '').trim();
    if (!email || !email.includes('@')) {
        return undefined;
    }
    const folder = (parts[1] || '').trim();
    return folder ? { email, folder, policy } : { email, policy };
}

export function emailDomain(address: string): string {
    const at = address.lastIndexOf('@');
    return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

/** Gmail `user+tag@gmail.com` / `googlemail.com` → `user@gmail.com` for compare */
export function normalizeEmailAddress(address: string): string {
    const trimmed = address.trim().toLowerCase();
    const at = trimmed.lastIndexOf('@');
    if (at < 0) {
        return trimmed;
    }
    let local = trimmed.slice(0, at);
    let domain = trimmed.slice(at + 1);
    if (domain === 'googlemail.com') {
        domain = 'gmail.com';
    }
    if (domain === 'gmail.com') {
        const plus = local.indexOf('+');
        if (plus >= 0) {
            local = local.slice(0, plus);
        }
    }
    return `${local}@${domain}`;
}

export function emailsMatch(a: string, b: string): boolean {
    return normalizeEmailAddress(a) === normalizeEmailAddress(b);
}

export function extractEmailsFromHeaderValue(raw: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of raw.matchAll(EMAIL_IN_HEADER_RE)) {
        const addr = m[0].toLowerCase();
        if (seen.has(addr)) {
            continue;
        }
        seen.add(addr);
        out.push(addr);
    }
    return out;
}

const RELATED_HEADER_KEYS = [
    'To',
    'Cc',
    'Delivered-To',
    'X-Original-To',
    'X-Forwarded-To',
    'Resent-To',
] as const;

/** Addresses from common recipient-related headers */
export function relatedRecipientAddresses(message: EmailMessage): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const key of RELATED_HEADER_KEYS) {
        const raw = message.headers.get(key);
        if (!raw) {
            continue;
        }
        for (const addr of extractEmailsFromHeaderValue(raw)) {
            if (seen.has(addr)) {
                continue;
            }
            seen.add(addr);
            out.push(addr);
        }
    }
    return out;
}

/**
 * True when the message was delivered to the CF routing address but the
 * visible To/Cc (etc.) only reference other mailboxes — typical of auto-forward.
 */
export function isExternallyForwarded(message: EmailMessage): boolean {
    const routedTo = (message.to || '').trim().toLowerCase();
    const routedDomain = emailDomain(routedTo);
    if (!routedTo || !routedDomain) {
        return false;
    }
    const headers = relatedRecipientAddresses(message);
    if (headers.length === 0) {
        return false;
    }
    for (const addr of headers) {
        if (addr === routedTo || emailDomain(addr) === routedDomain) {
            return false;
        }
    }
    return true;
}

/**
 * Single backup target only.
 * Prefer FORWARD_MAILS; fall back to legacy FORWARD_MAIL, then first FORWARD_LIST entry.
 * FORWARD_MAIL0/1/… are ignored.
 */
export function getForwardTarget(env: Environment): ForwardTarget | undefined {
    const primary = parseForwardMailsValue(env.FORWARD_MAILS || '');
    if (primary) {
        return primary;
    }
    const legacyMail = parseForwardMailsValue(env.FORWARD_MAIL || '');
    if (legacyMail) {
        return legacyMail;
    }
    const list = (env.FORWARD_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.length > 0) {
        const folder = (env.FORWARD_DIR || env.GMAIL_LABEL || '').trim();
        return folder
            ? { email: list[0], folder, policy: 'noforwarded' }
            : { email: list[0], policy: 'noforwarded' };
    }
    return undefined;
}

/** @deprecated use getForwardTarget */
export function primaryForwardTarget(env: Environment): ForwardTarget | undefined {
    return getForwardTarget(env);
}

/** @deprecated single backup only; returns 0–1 addresses */
export function listForwardTargets(env: Environment): ForwardTarget[] {
    const t = getForwardTarget(env);
    return t ? [t] : [];
}

/** @deprecated single backup only */
export function forwardEmailAddresses(env: Environment): string[] {
    const t = getForwardTarget(env);
    return t ? [t.email] : [];
}

/**
 * Whether Email Routing `message.forward` should run for this inbound mail.
 * Hard rule: never backup when From / related recipients match FORWARD_MAILS (Gmail +tag aware).
 * Soft rule: with policy `noforwarded`, skip externally forwarded mail.
 */
export function shouldBackupInboundMail(message: EmailMessage, env: Environment): boolean {
    const target = getForwardTarget(env);
    if (!target) {
        return false;
    }

    const related = [
        message.from,
        ...relatedRecipientAddresses(message),
    ].filter(Boolean);

    for (const addr of related) {
        if (emailsMatch(addr, target.email)) {
            return false;
        }
    }

    if (target.policy === 'noforwarded' && isExternallyForwarded(message)) {
        return false;
    }

    return true;
}
