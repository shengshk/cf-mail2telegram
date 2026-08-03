import type { EmailCache, Environment } from '../types';

function firstForwardAddress(env: Environment): string {
    return (env.FORWARD_LIST || '').split(',').map(s => s.trim()).find(Boolean) || '';
}

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

/** 有 thrid 时直达该线程（Gmail）；文件夹优先 FORWARD_DIR，否则 INBOX */
function gmailThridUrl(thrid: string, env: Environment): string | undefined {
    const raw = thrid.trim();
    if (!/^\d+$/.test(raw)) {
        return undefined;
    }
    try {
        const hexId = BigInt(raw).toString(16);
        const label = (env.FORWARD_DIR || '').trim() || 'INBOX';
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
    const dir = (env.FORWARD_DIR || '').trim();
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
        return ''; // caller handles gmail
    }
    if (isOutlookDomain(domain)) {
        return 'https://outlook.live.com/mail/';
    }
    return `https://mail.${domain}`;
}

/**
 * 「邮箱」按钮：
 * - 有 X-GM-THRID → 精准深链（优先）
 * - Gmail（FORWARD_LIST 首个，或仅配了 FORWARD_DIR）：FORWARD_DIR → 标签页，否则 Gmail 首页
 * - 非 Gmail：忽略 FORWARD_DIR，按首个 FORWARD_LIST 跳对应首页；未配 FORWARD_LIST → 不显示按钮
 * - 已废止 rfc822msgid 搜索
 */
export function mailboxButtonUrl(mail: EmailCache, env: Environment): string | undefined {
    if (mail.gmThrid) {
        const precise = gmailThridUrl(mail.gmThrid, env);
        if (precise) {
            return precise;
        }
    }

    const first = firstForwardAddress(env);
    const dir = (env.FORWARD_DIR || '').trim();

    if (!first) {
        // 仅配了文件夹：按 Gmail 处理
        if (dir) {
            return gmailFolderOrHome(env);
        }
        return undefined;
    }

    const domain = emailDomain(first);
    if (isGmailDomain(domain)) {
        return gmailFolderOrHome(env);
    }

    // 非 Gmail：忽略 FORWARD_DIR
    return providerHomeUrl(first) || undefined;
}

/** @deprecated 用 mailboxButtonUrl */
export function gmailMailboxUrl(mail: EmailCache, env: Environment): string | undefined {
    return mailboxButtonUrl(mail, env);
}

export function buildKeyboard(
    previewUrl: string | undefined,
    mailboxUrl: string | undefined,
): { inline_keyboard: Array<Array<{ text: string; url: string }>> } | undefined {
    const row: Array<{ text: string; url: string }> = [];
    if (previewUrl) {
        row.push({ text: '预览', url: previewUrl });
    }
    if (mailboxUrl) {
        row.push({ text: '邮箱', url: mailboxUrl });
    }
    if (!row.length) {
        return undefined;
    }
    return { inline_keyboard: [row] };
}
