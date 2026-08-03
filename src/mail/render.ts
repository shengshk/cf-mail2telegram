import type * as Telegram from 'telegram-bot-api-types';
import type { ExtractResult } from './extract';
import type { EmailCache, Environment } from '../types';
import { truncateDisplay } from './extract';
import { buildKeyboard, mailboxButtonUrl } from './mailbox';

export interface EmailDetailParams {
    text: string;
    reply_markup?: Telegram.InlineKeyboardMarkup;
    link_preview_options: Telegram.LinkPreviewOptions;
}

export type EmailRender = (mail: EmailCache, env: Environment) => Promise<EmailDetailParams>;

/** 对齐 Docker 范本：文案 +「预览」「邮箱」并排 URL 按钮 */
export async function renderEmailListMode(
    mail: EmailCache,
    env: Environment,
    extract?: ExtractResult,
): Promise<EmailDetailParams> {
    const { DOMAIN } = env;
    const lines: string[] = [];
    if (extract?.code) {
        let codeLine = `验证码：${extract.code}`;
        if (extract.source === 'local') {
            codeLine += ' · 本地';
            if (extract.reason) {
                codeLine += ` (${truncateDisplay(extract.reason, 60)})`;
            }
        }
        lines.push(codeLine);
    } else {
        const subject = (mail.subject || '').trim();
        if (subject) {
            lines.push(`主题：${truncateDisplay(subject)}`);
        } else {
            const preview = truncateDisplay((mail.text || '').replace(/\s+/g, ' ').trim());
            lines.push(`无主题：${preview || '(空)'}`);
        }
    }
    lines.push(`发件人：${mail.from || ''}`);
    lines.push(`收件人：${mail.to || ''}`);
    if (mail.date) {
        lines.push(mail.date);
    }

    const previewUrl = (mail.html || mail.text) && DOMAIN
        ? `https://${DOMAIN}/email/${mail.id}`
        : undefined;
    const mailboxUrl = mailboxButtonUrl(mail, env);
    const reply_markup = buildKeyboard(previewUrl, mailboxUrl) as Telegram.InlineKeyboardMarkup | undefined;

    return {
        text: lines.join('\n'),
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
