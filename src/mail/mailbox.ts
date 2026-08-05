import type { UiLang } from '../i18n';
import type { EmailCache, Environment } from '../types';
import { t } from '../i18n';
import { emailDomain, getForwardTarget } from './forward';

function isGmailDomain(domain: string): boolean {
    return domain === 'gmail.com' || domain === 'googlemail.com';
}

function isOutlookDomain(domain: string): boolean {
    return domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com';
}

function gmailU(env: Environment): number {
    const u = Number.parseInt(env.GMAIL_U || '0', 10);
    return Number.isFinite(u) && u >= 0 ? u : 0;
}

function gmailThridUrl(thrid: string, folder: string, env: Environment): string | undefined {
    const raw = thrid.trim();
    if (!/^\d+$/.test(raw)) {
        return undefined;
    }
    try {
        const hexId = BigInt(raw).toString(16);
        const label = folder.trim() || 'INBOX';
        const u = gmailU(env);
        if (label.toUpperCase() === 'INBOX') {
            return `https://mail.google.com/mail/u/${u}/#inbox/${hexId}`;
        }
        return `https://mail.google.com/mail/u/${u}/#label/${encodeURIComponent(label)}/${hexId}`;
    } catch {
        return undefined;
    }
}

function gmailFolderOrHome(folder: string, env: Environment): string {
    const u = gmailU(env);
    const dir = folder.trim();
    if (dir) {
        if (dir.toUpperCase() === 'INBOX') {
            return `https://mail.google.com/mail/u/${u}/#inbox`;
        }
        return `https://mail.google.com/mail/u/${u}/#label/${encodeURIComponent(dir)}`;
    }
    return `https://mail.google.com/mail/u/${u}/`;
}

function providerHomeUrl(address: string, env: Environment): string | undefined {
    const domain = emailDomain(address);
    if (!domain) {
        return undefined;
    }
    if (isGmailDomain(domain)) {
        return gmailFolderOrHome('', env);
    }
    if (isOutlookDomain(domain)) {
        return 'https://outlook.live.com/mail/';
    }
    // Custom / CF domain usually has no useful webmail
    return undefined;
}

/**
 * 「邮箱」按钮：
 * - 已备份 → FORWARD_MAIL（Gmail 可用 folder / thrid）
 * - 未备份 → 尽量跳邮件头原 To 对应网页邮箱（不带 Backup 文件夹）
 * - 都无法打开 → 不显示
 */
export function mailboxButtonUrl(mail: EmailCache, env: Environment): string | undefined {
    if (mail.backedUp) {
        const primary = getForwardTarget(env);
        const first = primary?.email || '';
        const dir = primary?.folder || '';
        if (mail.gmThrid && first && isGmailDomain(emailDomain(first))) {
            const precise = gmailThridUrl(mail.gmThrid, dir, env);
            if (precise) {
                return precise;
            }
        }
        if (!first) {
            return undefined;
        }
        if (isGmailDomain(emailDomain(first))) {
            return gmailFolderOrHome(dir, env);
        }
        return providerHomeUrl(first, env);
    }

    const original = (mail.originalTo || '').trim();
    if (!original) {
        return undefined;
    }
    if (mail.gmThrid && isGmailDomain(emailDomain(original))) {
        const precise = gmailThridUrl(mail.gmThrid, 'INBOX', env);
        if (precise) {
            return precise;
        }
    }
    return providerHomeUrl(original, env);
}

export type InlineBtn
    = | { text: string; url: string }
        | { text: string; web_app: { url: string } };

/**
 * Buttons: Preview (Mini App via t.me?startapp=) · Web (browser) · Mailbox
 * Preview must be `url` (deep link), not `web_app` — clients drop web_app query/path.
 */
export function buildKeyboard(
    previewAppUrl: string | undefined,
    webUrl: string | undefined,
    mailboxUrl: string | undefined,
    lang: UiLang,
): { inline_keyboard: InlineBtn[][] } | undefined {
    const row: InlineBtn[] = [];
    if (previewAppUrl) {
        row.push({ text: t(lang, 'previewBtn'), url: previewAppUrl });
    }
    if (webUrl) {
        row.push({ text: t(lang, 'webBtn'), url: webUrl });
    }
    if (mailboxUrl) {
        row.push({ text: t(lang, 'mailboxBtn'), url: mailboxUrl });
    }
    if (!row.length) {
        return undefined;
    }
    return { inline_keyboard: [row] };
}
