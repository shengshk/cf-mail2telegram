import type { EmailMessage } from '@cloudflare/workers-types';
import type { Environment } from '../types';

export type ForwardedBackupPolicy = 'noforwarded' | 'forwarded';

export interface ForwardTarget {
    /** Destination address for Email Routing forward */
    email: string;
    /** Optional Gmail label/folder; used by the Mailbox button when backed up */
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
 * Parse: `user@gmail.com` | `user@gmail.com,Backup` |
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

/**
 * Gmail auto-forward envelope rewrite:
 * `local+caf_=fwdlocal=fwddomain@domain` → `local@domain`
 */
export function unwrapGmailCafAddress(address: string): string | undefined {
    const trimmed = address.trim();
    const m = /^([^@]+)\+caf_=[^=]+=[^@]+@([^@]+)$/i.exec(trimmed);
    if (!m) {
        return undefined;
    }
    return `${m[1]}@${m[2]}`;
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

/** Headers that may name the pre-forward mailbox (and/or the CF destination). */
const RELATED_HEADER_KEYS = [
    'To',
    'Cc',
    'Delivered-To',
    'X-Original-To',
    'X-Forwarded-To',
    'Resent-To',
] as const;

/**
 * Visible recipient headers only. Do NOT use Delivered-To / X-Forwarded-To here —
 * those often list the CF routing address and would hide Gmail auto-forwards.
 */
const VISIBLE_RECIPIENT_HEADER_KEYS = ['To', 'Cc', 'Resent-To'] as const;

function addressesFromHeaders(message: EmailMessage, keys: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const key of keys) {
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

/** Addresses from common recipient-related headers */
export function relatedRecipientAddresses(message: EmailMessage): string[] {
    return addressesFromHeaders(message, RELATED_HEADER_KEYS);
}

/**
 * First header recipient that is not on the CF routing domain — typical Gmail/Outlook auto-forward source.
 * Prefer visible To/Cc; fall back to Delivered-To / X-*-To only if needed.
 */
export function pickOriginalMailboxAddress(message: EmailMessage): string | undefined {
    const routedTo = (message.to || '').trim().toLowerCase();
    const routedDomain = emailDomain(routedTo);
    if (!routedDomain) {
        return undefined;
    }
    const prefer = [
        ...addressesFromHeaders(message, VISIBLE_RECIPIENT_HEADER_KEYS),
        ...relatedRecipientAddresses(message),
    ];
    const seen = new Set<string>();
    for (const addr of prefer) {
        if (seen.has(addr)) {
            continue;
        }
        seen.add(addr);
        if (emailDomain(addr) && emailDomain(addr) !== routedDomain) {
            return addr;
        }
    }
    return undefined;
}

export interface DisplayAddressFields {
    from: string;
    to: string;
    /** External mailbox for Mailbox button when not backed up */
    originalTo?: string;
}

function pickDisplayFrom(
    envelopeFrom: string,
    mimeFrom?: string,
    headerFrom?: string,
): string {
    for (const cand of [mimeFrom, headerFrom, envelopeFrom]) {
        const raw = (cand || '').trim();
        if (!raw) {
            continue;
        }
        // Never show Gmail CAF rewrite as the sender.
        if (unwrapGmailCafAddress(raw)) {
            continue;
        }
        return raw;
    }
    // Last resort: CAF owner mailbox (forwarding account), still better than +caf_=…
    return unwrapGmailCafAddress(envelopeFrom) || envelopeFrom;
}

/**
 * For externally forwarded mail, prefer original From/To for Telegram display.
 * Direct domain mail: leave envelope addresses unchanged.
 */
export function resolveDisplayAddresses(
    message: EmailMessage,
    envelope: { from: string; to: string },
    mime?: { from?: string; to?: string },
): DisplayAddressFields {
    const cafOwner = unwrapGmailCafAddress(envelope.from)
        || unwrapGmailCafAddress(mime?.from || '');
    const forwarded = !!cafOwner || isExternallyForwarded(message);
    const originalTo = pickOriginalMailboxAddress(message) || cafOwner || undefined;

    if (!forwarded) {
        return originalTo
            ? { from: envelope.from, to: envelope.to, originalTo }
            : { from: envelope.from, to: envelope.to };
    }

    const headerFrom = extractEmailsFromHeaderValue(message.headers.get('From') || '')[0];
    const from = pickDisplayFrom(envelope.from, mime?.from, headerFrom);
    const to = originalTo
        || (mime?.to && emailDomain(mime.to) !== emailDomain(envelope.to) ? mime.to : '')
        || envelope.to;

    return {
        from,
        to,
        ...(originalTo ? { originalTo } : {}),
    };
}

/**
 * True when mail reached the CF address via another mailbox (Gmail/Outlook auto-forward).
 * Gmail CAF envelope From is definitive; otherwise look for an off-domain visible To/Cc.
 *
 * Note: Delivered-To / X-Forwarded-To alone must NOT force "not forwarded" — they usually
 * name the CF destination even for auto-forwarded mail.
 */
export function isExternallyForwarded(message: EmailMessage): boolean {
    if (unwrapGmailCafAddress(message.from || '')) {
        return true;
    }
    const routedTo = (message.to || '').trim().toLowerCase();
    const routedDomain = emailDomain(routedTo);
    if (!routedTo || !routedDomain) {
        return false;
    }
    const visible = addressesFromHeaders(message, VISIBLE_RECIPIENT_HEADER_KEYS);
    if (visible.length === 0) {
        return false;
    }
    let sawOffDomain = false;
    for (const addr of visible) {
        if (addr === routedTo || emailDomain(addr) === routedDomain) {
            continue;
        }
        if (emailDomain(addr)) {
            sawOffDomain = true;
        }
    }
    return sawOffDomain;
}

/** Single backup target from FORWARD_MAIL only. */
export function getForwardTarget(env: Environment): ForwardTarget | undefined {
    return parseForwardMailsValue(env.FORWARD_MAIL || '');
}

/** @deprecated alias */
export function primaryForwardTarget(env: Environment): ForwardTarget | undefined {
    return getForwardTarget(env);
}

/**
 * Whether Email Routing `message.forward` should run for this inbound mail.
 * Hard rule: never backup when From / related recipients match FORWARD_MAIL (Gmail +tag aware).
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
