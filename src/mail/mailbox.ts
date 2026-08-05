import type { EmailCache, Environment } from '../types';
import type { UiLang } from '../i18n';
import { t } from '../i18n';
import { primaryForwardTarget } from './forward';

function emailDomain(address: string): string {
    const at = address.lastIndexOf('@');
    return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

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

function primaryFolder(env: Environment): string {
    return (primaryForwardTarget(env)?.folder || '').trim();
}

/** 有 thrid 时直达该线程（Gmail）；文件夹优先 FORWARD_MAILS 的 folder，否则 INBOX */
function gmailThridUrl(thrid: string, env: Environment): string | undefined {
    const raw = thrid.trim();
    if (!/^\d+$/.test(raw)) {
        return undefined;
    }
    try {
        const hexId = BigInt(raw).toString(16);
        const label = primaryFolder(env) || 'INBOX';
        const u = gmailU(env);
        if (label.toUpperCase() === 'INBOX') {
            return `https://mail.google.com/mail/u/${u}/#inbox/${hexId}`;
        }
        return `https://mail.google.com/mail/u/${u}/#label/${encodeURIComponent(label)}/${hexId}`;
    } catch {
        return undefined;
    }
}

function gmailFolderOrHome(env: Environment): string {
    const u = gmailU(env);
    const dir = primaryFolder(env);
    if (dir) {
        if (dir.toUpperCase() === 'INBOX') {
            return `https://mail.google.com/mail/u/${u}/#inbox`;
        }
        return `https://mail.google.com/mail/u/${u}/#label/${encodeURIComponent(dir)}`;
    }
    return `https://mail.google.com/mail/u/${u}/`;
}

function providerHomeUrl(address: string): string {
    const domain = emailDomain(address);
    if (!domain) {
        return 'https://mail.google.com/';
    }
    if (isGmailDomain(domain)) {
        return '';
    }
    if (isOutlookDomain(domain)) {
        return 'https://outlook.live.com/mail/';
    }
    return `https://mail.${domain}`;
}

/**
 * 「邮箱」按钮：
 * - 有 X-GM-THRID → 精准深链（优先）
 * - FORWARD_MAILS 为 Gmail：folder → 标签页，否则 Gmail 首页
 * - 非 Gmail：忽略 folder，跳对应首页
 * - 未配置 FORWARD_MAILS（及旧变量）→ 不显示按钮（仅 folder 且无邮箱时仍按 Gmail 处理）
 */
export function mailboxButtonUrl(mail: EmailCache, env: Environment): string | undefined {
    if (mail.gmThrid) {
        const precise = gmailThridUrl(mail.gmThrid, env);
        if (precise) {
            return precise;
        }
    }

    const primary = primaryForwardTarget(env);
    const first = primary?.email || '';
    const dir = primary?.folder || '';

    if (!first) {
        if (dir) {
            return gmailFolderOrHome(env);
        }
        return undefined;
    }

    const domain = emailDomain(first);
    if (isGmailDomain(domain)) {
        return gmailFolderOrHome(env);
    }

    return providerHomeUrl(first) || undefined;
}

/** @deprecated 用 mailboxButtonUrl */
export function gmailMailboxUrl(mail: EmailCache, env: Environment): string | undefined {
    return mailboxButtonUrl(mail, env);
}

export function buildKeyboard(
    previewUrl: string | undefined,
    mailboxUrl: string | undefined,
    lang: UiLang,
): { inline_keyboard: Array<Array<{ text: string; url: string }>> } | undefined {
    const row: Array<{ text: string; url: string }> = [];
    if (previewUrl) {
        row.push({ text: t(lang, 'previewBtn'), url: previewUrl });
    }
    if (mailboxUrl) {
        row.push({ text: t(lang, 'mailboxBtn'), url: mailboxUrl });
    }
    if (!row.length) {
        return undefined;
    }
    return { inline_keyboard: [row] };
}
