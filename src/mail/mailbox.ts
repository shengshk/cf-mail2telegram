import type { EmailCache, Environment } from '../types';

/** 对齐 Docker：有 X-GM-THRID 则深链；否则用 Message-ID 搜索（CF Email Routing 通常无 thrid） */
export function gmailMailboxUrl(mail: EmailCache, env: Environment): string | undefined {
    const u = Number.parseInt(env.GMAIL_U || '0', 10);
    const gmailU = Number.isFinite(u) && u >= 0 ? u : 0;

    if (mail.gmThrid) {
        const raw = mail.gmThrid.trim();
        if (/^\d+$/.test(raw)) {
            try {
                const hexId = BigInt(raw).toString(16);
                const label = (env.GMAIL_LABEL || 'INBOX').trim();
                if (!label || label.toUpperCase() === 'INBOX') {
                    return `https://mail.google.com/mail/u/${gmailU}/#inbox/${hexId}`;
                }
                return `https://mail.google.com/mail/u/${gmailU}/#label/${encodeURIComponent(label)}/${hexId}`;
            } catch {
                // fall through to Message-ID search
            }
        }
    }

    const mid = (mail.messageId || '').trim().replace(/^<|>$/g, '');
    if (!mid) {
        return undefined;
    }
    // Telegram URL 按钮需合法 https；Gmail 搜索可打开该 Message-ID
    const q = encodeURIComponent(`rfc822msgid:${mid}`);
    return `https://mail.google.com/mail/u/${gmailU}/#search/${q}`;
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
