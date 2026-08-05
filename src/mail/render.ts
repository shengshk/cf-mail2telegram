import type * as Telegram from 'telegram-bot-api-types';
import type { EmailCache, Environment } from '../types';
import type { ExtractResult } from './extract';
import { resolveUiLang, t } from '../i18n';
import { loadPublicHost } from '../public-host';
import { loadBotUsername, miniAppStartLink } from '../telegram/bot-username';
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

/** OTP AI bold / local italic; DEBUG shows fallback reason */
export async function renderEmailListMode(
    mail: EmailCache,
    env: Environment,
    extract?: ExtractResult,
): Promise<EmailDetailParams> {
    const lang = resolveUiLang(env);
    const host = await loadPublicHost(env);
    const lines: string[] = [];
    if (extract?.code) {
        const code = escapeHtml(extract.code);
        const styled = extract.source === 'local' ? `<i>${code}</i>` : `<b>${code}</b>`;
        lines.push(`${t(lang, 'otp')} ${styled}`);
        if (extract.source === 'local' && extract.reason && isDebug(env)) {
            lines.push(`${t(lang, 'debug')} ${escapeHtml(truncateDisplay(extract.reason, 80))}`);
        }
    } else {
        const subject = (mail.subject || '').trim();
        if (subject) {
            lines.push(`${t(lang, 'subject')} ${escapeHtml(truncateDisplay(subject))}`);
        } else {
            const preview = truncateDisplay((mail.text || '').replace(/\s+/g, ' ').trim());
            lines.push(`${t(lang, 'noSubject')} ${escapeHtml(preview || t(lang, 'empty'))}`);
        }
    }
    lines.push(`${t(lang, 'from')} ${escapeHtml(mail.from || '')}`);
    lines.push(`${t(lang, 'to')} ${escapeHtml(mail.to || '')}`);
    if (mail.date) {
        lines.push(escapeHtml(mail.date));
    }

    const hasBody = !!(mail.html || mail.text);
    const botUsername = hasBody ? await loadBotUsername(env) : undefined;
    const previewAppUrl = hasBody && botUsername
        ? miniAppStartLink(botUsername, mail.id)
        : undefined;
    const webUrl = hasBody && host
        ? `https://${host}/email/${mail.id}`
        : undefined;
    const mailboxUrl = mailboxButtonUrl(mail, env);
    const reply_markup = buildKeyboard(previewAppUrl, webUrl, mailboxUrl, lang) as Telegram.InlineKeyboardMarkup | undefined;

    return {
        text: lines.join('\n'),
        parse_mode: 'HTML',
        reply_markup,
        link_preview_options: {
            is_disabled: true,
        },
    };
}

function renderEmailDetail(text: string | undefined | null, id: string, env: Environment): EmailDetailParams {
    const lang = resolveUiLang(env);
    return {
        text: text || t(lang, 'noContent'),
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: t(lang, 'back'),
                        callback_data: `l:${id}`,
                    },
                    {
                        text: t(lang, 'delete'),
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

/** Compat for old message callbacks */
export async function renderEmailPreviewMode(mail: EmailCache, env: Environment): Promise<EmailDetailParams> {
    return renderEmailDetail(mail.text?.substring(0, 4096), mail.id, env);
}

/** Compat; Summary removed */
export async function renderEmailSummaryMode(mail: EmailCache, env: Environment): Promise<EmailDetailParams> {
    const lang = resolveUiLang(env);
    return renderEmailDetail(t(lang, 'summaryDisabled'), mail.id, env);
}

export async function renderEmailDebugMode(mail: EmailCache, env: Environment): Promise<EmailDetailParams> {
    const obj = { ...mail };
    delete obj.html;
    delete obj.text;
    return renderEmailDetail(JSON.stringify(obj, null, 2), mail.id, env);
}
