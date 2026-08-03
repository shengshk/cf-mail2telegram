import type * as Telegram from 'telegram-bot-api-types';
import type { ExtractResult } from './extract';
import type { EmailCache, Environment } from '../types';
import { truncateDisplay } from './extract';
import { buildKeyboard, mailboxButtonUrl } from './mailbox';

export interface EmailDetailParams {
    text: string;
    parse_mode?: 'HTML';
    reply_markup?: Telegram.InlineKeyboardMarkup;
    link_preview_options: Telegram.LinkPreviewOptions;
}

export type EmailRender = (mail: EmailCache, env: Environment) => Promise<EmailDetailParams>;

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isDebug(env: Environment): boolean {
    return (env.DEBUG || '').toLowerCase() === 'true';
}

/** 对齐 Docker：验证码 AI 加粗 / 本地斜体；DEBUG 才贴错误原因 */
export async function renderEmailListMode(
    mail: EmailCache,
    env: Environment,
    extract?: ExtractResult,
): Promise<EmailDetailParams> {
    const { DOMAIN } = env;
    const lines: string[] = [];
    if (extract?.code) {
        const code = escapeHtml(extract.code);
        const styled = extract.source === 'local' ? `<i>${code}</i>` : `<b>${code}</b>`;
        lines.push(`验证码：${styled}`);
        if (extract.source === 'local' && extract.reason && isDebug(env)) {
            lines.push(`调试：${escapeHtml(truncateDisplay(extract.reason, 80))}`);
        }
    } else {
        const subject = (mail.subject || '').trim();
        if (subject) {
            lines.push(`主题：${escapeHtml(truncateDisplay(subject))}`);
        } else {
            const preview = truncateDisplay((mail.text || '').replace(/\s+/g, ' ').trim());
            lines.push(`无主题：${escapeHtml(preview || '(空)')}`);
        }
    }
    lines.push(`发件人：${escapeHtml(mail.from || '')}`);
    lines.push(`收件人：${escapeHtml(mail.to || '')}`);
    if (mail.date) {
        lines.push(escapeHtml(mail.date));
    }

    const previewUrl = (mail.html || mail.text) && DOMAIN
        ? `https://${DOMAIN}/email/${mail.id}`
        : undefined;
    const mailboxUrl = mailboxButtonUrl(mail, env);
    const reply_markup = buildKeyboard(previewUrl, mailboxUrl) as Telegram.InlineKeyboardMarkup | undefined;

    return {
        text: lines.join('\n'),
        parse_mode: 'HTML',
        reply_markup,
        link_preview_options: {
            is_disabled: true,
        },
    };
}

function renderEmailDetail(text: string | undefined | null, id: string): EmailDetailParams {
    return {
        text: text || 'No content',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: '返回',
                        callback_data: `l:${id}`,
                    },
                    {
                        text: '删除',
                        callback_data: 'delete',
                    },
                ],
            ],
        },
        link_preview_options: {
            is_disabled: true,
        },
    };
}

/** 兼容旧消息回调；新消息不再使用 */
export async function renderEmailPreviewMode(mail: EmailCache, _env: Environment): Promise<EmailDetailParams> {
    return renderEmailDetail(mail.text?.substring(0, 4096), mail.id);
}

/** 兼容旧消息回调；Summary 已移除 */
export async function renderEmailSummaryMode(mail: EmailCache, _env: Environment): Promise<EmailDetailParams> {
    return renderEmailDetail('摘要功能已关闭，请使用预览按钮查看原文。', mail.id);
}

export async function renderEmailDebugMode(mail: EmailCache, _env: Environment): Promise<EmailDetailParams> {
    const obj = { ...mail };
    delete obj.html;
    delete obj.text;
    return renderEmailDetail(JSON.stringify(obj, null, 2), mail.id);
}
