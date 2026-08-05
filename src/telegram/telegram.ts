import type * as Telegram from 'telegram-bot-api-types';
import type { EmailRender } from '../mail';
import type { Environment } from '../types';
import { Dao } from '../db';
import { requireTelegram } from '../env';
import { resolveUiLang, t } from '../i18n';
import { renderEmailDebugMode, renderEmailListMode, renderEmailPreviewMode, renderEmailSummaryMode, replyToEmail } from '../mail';
import { checkTestCommandRate, isAllowedTestUser, runFakeMailUiTest } from '../mail/test-mail';
import { loadPreviewMode, savePreviewMode, type PreviewMode } from '../mail/preview-mode';
import { isWebAuthEnabled } from '../web-auth';
import { loadPublicHost } from '../public-host';
import { createTelegramBotAPI } from './api';
import { tmaListWebAppUrl } from './bot-username';

type TelegramMessageHandler = (message: Telegram.Message) => Promise<Response>;
type CommandHandlerGroup = Record<string, TelegramMessageHandler>;

function modeLabel(lang: ReturnType<typeof resolveUiLang>, mode: PreviewMode): string {
    return mode === 'web' ? t(lang, 'previewModeWeb') : t(lang, 'previewModeMini');
}

function fill(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
const CMD_DELETE_WAIT_MS = 60_000;
const CMD_DELETE_ATTEMPTS = 3;

function logTelegram(event: string, data?: Record<string, unknown>): void {
    console.log(`[telegram] ${event}${data ? ` ${JSON.stringify(data)}` : ''}`);
}

function logTelegramError(event: string, error: unknown, data?: Record<string, unknown>): void {
    const err = error as Error;
    console.error(`[telegram] ${event} ${JSON.stringify({
        ...data,
        message: err?.message || String(error),
        stack: err?.stack,
    })}`);
}

async function logTelegramResponse(method: string, response: Response): Promise<void> {
    const data: Record<string, unknown> = {
        method,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
    };

    if (!response.ok) {
        try {
            data.body = (await response.clone().text()).substring(0, 500);
        } catch (e) {
            data.bodyReadError = (e as Error).message;
        }
    }

    logTelegram('api.response', data);
}

async function sleepMs(ms: number): Promise<void> {
    const sched = (globalThis as { scheduler?: { wait: (n: number) => Promise<void> } }).scheduler;
    if (sched?.wait) {
        await sched.wait(ms);
        return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
}

/** Ephemeral TG messages (commands / config / errors): wait 60s, retry every 60s ×3, then give up. Mail cards are never scheduled. */
async function deleteMessageWithRetry(
    token: string,
    chatId: number,
    messageId: number,
    env?: Environment,
): Promise<void> {
    const api = createTelegramBotAPI(token);
    const deadlineKey = `EPHEMERAL_DEL:${chatId}:${messageId}`;
    const waitUntilDeadline = async () => {
        for (;;) {
            let deadline = Date.now() + CMD_DELETE_WAIT_MS;
            if (env?.DB) {
                const raw = await env.DB.get(deadlineKey);
                const n = raw ? Number(raw) : NaN;
                if (Number.isFinite(n) && n > 0) {
                    deadline = n;
                }
            }
            const wait = Math.max(0, deadline - Date.now());
            if (wait <= 0) {
                return;
            }
            await sleepMs(Math.min(wait, CMD_DELETE_WAIT_MS));
            if (Date.now() >= deadline) {
                return;
            }
        }
    };
    await waitUntilDeadline();
    for (let attempt = 1; attempt <= CMD_DELETE_ATTEMPTS; attempt++) {
        try {
            const response = await api.deleteMessage({
                chat_id: chatId,
                message_id: messageId,
            });
            if (response.ok) {
                logTelegram('ephemeral.delete.ok', { chatId, messageId, attempt });
                if (env?.DB) {
                    try {
                        await env.DB.delete(deadlineKey);
                    } catch { /* ignore */ }
                }
                return;
            }
            await logTelegramResponse('deleteMessage', response);
            logTelegram('ephemeral.delete.fail', { chatId, messageId, attempt, status: response.status });
        } catch (e) {
            logTelegramError('ephemeral.delete.error', e, { chatId, messageId, attempt });
        }
        if (attempt < CMD_DELETE_ATTEMPTS) {
            await sleepMs(CMD_DELETE_WAIT_MS);
        }
    }
    logTelegram('ephemeral.delete.give_up', { chatId, messageId });
}

function scheduleDeleteMessage(
    ctx: ExecutionContext | undefined,
    token: string,
    chatId: number,
    messageId: number | undefined | null,
    env?: Environment,
): void {
    if (messageId == null || !Number.isFinite(messageId)) {
        return;
    }
    const deadline = Date.now() + CMD_DELETE_WAIT_MS;
    const task = (async () => {
        if (env?.DB) {
            try {
                await env.DB.put(`EPHEMERAL_DEL:${chatId}:${messageId}`, String(deadline), {
                    expirationTtl: Math.ceil((CMD_DELETE_WAIT_MS * (CMD_DELETE_ATTEMPTS + 1)) / 1000) + 60,
                });
            } catch (e) {
                logTelegramError('ephemeral.deadline.put', e, { chatId, messageId });
            }
        }
        await deleteMessageWithRetry(token, chatId, messageId, env);
    })();
    if (ctx?.waitUntil) {
        ctx.waitUntil(task);
    } else {
        void task;
    }
}

async function sentMessageId(response: Response): Promise<number | undefined> {
    try {
        const data = await response.clone().json() as { ok?: boolean; result?: { message_id?: number } };
        const id = data?.result?.message_id;
        return typeof id === 'number' ? id : undefined;
    } catch {
        return undefined;
    }
}

async function scheduleDeleteSent(
    ctx: ExecutionContext | undefined,
    token: string,
    chatId: number,
    response: Response,
    env?: Environment,
): Promise<void> {
    scheduleDeleteMessage(ctx, token, chatId, await sentMessageId(response), env);
}

function handlePreviewModeCommand(env: Environment, ctx?: ExecutionContext): TelegramMessageHandler {
    return async (msg: Telegram.Message): Promise<Response> => {
        const { token } = requireTelegram(env);
        const lang = resolveUiLang(env);
        const chatKey = `${msg.chat.id}`;
        const mode = await loadPreviewMode(env, chatKey);
        const text = [
            fill(t(lang, 'previewModeCurrent'), { mode: modeLabel(lang, mode) }),
            t(lang, 'previewModeSetOk').split('\n')[1] || '',
        ].filter(Boolean).join('\n');
        const response = await createTelegramBotAPI(token).sendMessage({
            chat_id: msg.chat.id,
            text,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: t(lang, 'previewModeSwitchMini'), callback_data: 'pm:mini' },
                        { text: t(lang, 'previewModeSwitchWeb'), callback_data: 'pm:webwarn' },
                    ],
                ],
            },
            disable_web_page_preview: true,
        } as Telegram.SendMessageParams);
        scheduleDeleteMessage(ctx, token, msg.chat.id, msg.message_id, env);
        await scheduleDeleteSent(ctx, token, msg.chat.id, response, env);
        return response;
    };
}

function handleCfmailCommand(env: Environment, ctx?: ExecutionContext): TelegramMessageHandler {
    return async (msg: Telegram.Message): Promise<Response> => {
        const { token } = requireTelegram(env);
        const lang = resolveUiLang(env);
        const host = await loadPublicHost(env);
        const lines = [
            `${t(lang, 'yourChatId')} ${msg.chat.id}`,
            host
                ? `${t(lang, 'workerRoute')} https://${host}/`
                : t(lang, 'workerRouteMissing'),
        ];
        const params: Telegram.SendMessageParams = {
            chat_id: msg.chat.id,
            text: lines.join('\n'),
            disable_web_page_preview: true,
        } as Telegram.SendMessageParams;

        if (msg.chat.type === 'private' && host) {
            params.reply_markup = {
                inline_keyboard: [
                    [
                        {
                            text: t(lang, 'tmaAddressManage'),
                            web_app: { url: tmaListWebAppUrl(host) },
                        },
                    ],
                ],
            };
        }

        const response = await createTelegramBotAPI(token).sendMessage(params);
        scheduleDeleteMessage(ctx, token, msg.chat.id, msg.message_id, env);
        await scheduleDeleteSent(ctx, token, msg.chat.id, response, env);
        return response;
    };
}

function handleTestCommand(env: Environment, ctx?: ExecutionContext): TelegramMessageHandler {
    return async (msg: Telegram.Message): Promise<Response> => {
        const { token } = requireTelegram(env);
        const api = createTelegramBotAPI(token);
        const lang = resolveUiLang(env);
        const chatId = msg.chat.id;
        const fromId = msg.from?.id;
        const reply = async (text: string) => {
            const response = await api.sendMessage({
                chat_id: chatId,
                text,
                reply_parameters: { message_id: msg.message_id },
            });
            await scheduleDeleteSent(ctx, token, chatId, response, env);
            return response;
        };

        const finish = async (response: Response) => {
            scheduleDeleteMessage(ctx, token, chatId, msg.message_id, env);
            return response;
        };

        if (!isAllowedTestUser(env, chatId, fromId)) {
            logTelegram('test.denied', { chatId, fromId });
            return finish(await reply(t(lang, 'testDenied')));
        }
        if (!env.DB) {
            return finish(await reply('KV binding DB is required'));
        }
        const rateUser = `${fromId ?? chatId}`;
        const rate = await checkTestCommandRate(env.DB, rateUser);
        if (!rate.ok) {
            logTelegram('test.rate_limited', { chatId, fromId, retryAfterSec: rate.retryAfterSec });
            return finish(await reply(t(lang, 'testRateLimit').replace('{n}', `${rate.retryAfterSec}`)));
        }

        try {
            logTelegram('test.run', { chatId, fromId });
            await runFakeMailUiTest(env);
            // Keep mail card; only delete user /test
            scheduleDeleteMessage(ctx, token, chatId, msg.message_id, env);
            return new Response('ok');
        } catch (e) {
            logTelegramError('test.error', e, { chatId, fromId });
            return finish(await reply((e as Error).message || t(lang, 'testDenied')));
        }
    };
}

async function handleReplyEmailCommand(
    message: Telegram.Message,
    env: Environment,
    ctx?: ExecutionContext,
): Promise<void> {
    const { token } = requireTelegram(env);
    const {
        RESEND_API_KEY,
        DB,
    } = env;
    const dao = new Dao(DB);
    const api = createTelegramBotAPI(token);
    const chatId = message.chat.id;
    scheduleDeleteMessage(ctx, token, chatId, message.message_id, env);
    const reply = async (text: string) => {
        const response = await api.sendMessage({
            chat_id: chatId,
            reply_parameters: {
                message_id: message.message_id,
            },
            text,
        });
        await scheduleDeleteSent(ctx, token, chatId, response, env);
    };
    if (!RESEND_API_KEY) {
        logTelegram('reply_email.disabled', { chatId, messageId: message.message_id });
        await reply('Resend API is not enabled.');
        return;
    }
    if (!message.text) {
        logTelegram('reply_email.missing_text', { chatId, messageId: message.message_id });
        await reply('Please provide a message to resend.');
        return;
    }
    try {
        const messageID = message.reply_to_message?.message_id;
        if (!messageID) {
            logTelegram('reply_email.missing_reply', { chatId, messageId: message.message_id });
            await reply('Please reply to a message to resend.');
            return;
        }
        const mailID = await dao.telegramIDToMailID(`${messageID}`);
        if (!mailID) {
            logTelegram('reply_email.mail_id_not_found', { chatId, messageId: message.message_id, replyMessageId: messageID });
            await reply('Message not found.');
            return;
        }
        const mail = await dao.loadMailCache(mailID);
        if (!mail) {
            logTelegram('reply_email.mail_not_found', { chatId, messageId: message.message_id, mailId: mailID });
            await reply('Message not found or expired.');
            return;
        }
        logTelegram('reply_email.send', { chatId, messageId: message.message_id, mailId: mailID });
        await replyToEmail(RESEND_API_KEY, mail, message.text);
        await reply('Reply sent successfully.');
    } catch (e) {
        logTelegramError('reply_email.error', e, { chatId, messageId: message.message_id });
        await reply((e as Error).message);
    }
}

async function telegramCommandHandler(
    message: Telegram.Message,
    env: Environment,
    ctx?: ExecutionContext,
): Promise<void> {
    logTelegram('message.received', {
        chatId: message?.chat?.id,
        messageId: message?.message_id,
        chatType: message?.chat?.type,
        hasText: !!message?.text,
        isReply: !!message?.reply_to_message,
    });
    if (message?.reply_to_message) {
        await handleReplyEmailCommand(message, env, ctx);
        return;
    }
    let [command] = message.text?.split(/ (.*)/) || [''];
    if (!command.startsWith('/')) {
        logTelegram('message.invalid_command', { command, chatId: message.chat.id, messageId: message.message_id });
        return;
    }
    command = command.substring(1);
    command = command.split('@')[0] || command;
    const cfmail = handleCfmailCommand(env, ctx);
    const test = handleTestCommand(env, ctx);
    const previewmode = handlePreviewModeCommand(env, ctx);
    const handlers: CommandHandlerGroup = {
        cfmail,
        start: cfmail,
        test,
        previewmode,
    };

    if (handlers[command]) {
        logTelegram('command.handle', { command, chatId: message.chat.id, messageId: message.message_id });
        await handlers[command](message);
        return;
    }
    logTelegram('command.unknown', { command, chatId: message.chat.id, messageId: message.message_id });
    await cfmail(message);
}

async function telegramCallbackHandler(
    callback: Telegram.CallbackQuery,
    env: Environment,
    ctx?: ExecutionContext,
): Promise<void> {
    const { token } = requireTelegram(env);
    const { DB } = env;

    const data = callback.data;
    const callbackId = callback.id;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const api = createTelegramBotAPI(token);
    const dao = new Dao(DB);

    if (!data || !chatId || !messageId) {
        logTelegram('callback.missing_fields', {
            hasData: !!data,
            hasChatId: !!chatId,
            hasMessageId: !!messageId,
            callbackId,
        });
        return;
    }

    logTelegram('callback.received', { data, callbackId, chatId, messageId });
    const renderHandlerBuilder = (render: EmailRender): (arg: string) => Promise<void> => {
        return async (arg: string): Promise<void> => {
            logTelegram('callback.load_mail.start', { data, mailId: arg, chatId, messageId });
            const value = await dao.loadMailCache(arg);
            if (!value) {
                logTelegram('callback.load_mail.not_found', { data, mailId: arg, chatId, messageId });
                throw new Error('Error: Email not found or expired.');
            }
            logTelegram('callback.load_mail.ok', {
                data,
                mailId: arg,
                subjectLength: value.subject?.length,
                textLength: value.text?.length || 0,
                htmlLength: value.html?.length || 0,
            });
            const req = await render(value, env);
            logTelegram('callback.render.ok', {
                data,
                mailId: arg,
                responseTextLength: req.text?.length || 0,
                keyboardRows: req.reply_markup?.inline_keyboard?.length || 0,
            });
            const params: Telegram.EditMessageTextParams = {
                chat_id: chatId,
                message_id: messageId,
                ...req,
            };
            logTelegram('callback.edit_message.start', { data, mailId: arg, chatId, messageId });
            const response = await api.editMessageText(params);
            await logTelegramResponse('editMessageText', response);
        };
    };

    const deleteMessage = async (arg: string): Promise<void> => {
        logTelegram('callback.delete_message.start', { data, arg, chatId, messageId });
        const response = await api.deleteMessage({
            chat_id: chatId,
            message_id: messageId,
        });
        await logTelegramResponse('deleteMessage', response);
    };

    const handlers = {
        p: renderHandlerBuilder(renderEmailPreviewMode),
        l: renderHandlerBuilder(renderEmailListMode),
        s: renderHandlerBuilder(renderEmailSummaryMode),
        d: renderHandlerBuilder(renderEmailDebugMode),
        delete: deleteMessage,
    } as { [key: string]: (arg: string) => Promise<void> };

    const [act, arg] = data.split(/:(.*)/) as [string, string];
    logTelegram('callback.parsed', { data, act, arg, chatId, messageId });

    if (act === 'pm') {
        const lang = resolveUiLang(env);
        const chatKey = `${chatId}`;
        const answer = async (text?: string) => {
            const response = await api.answerCallbackQuery({
                callback_query_id: callbackId,
                text,
                show_alert: false,
            });
            await logTelegramResponse('answerCallbackQuery', response);
        };
        const edit = async (text: string, keyboard?: Telegram.InlineKeyboardMarkup) => {
            const response = await api.editMessageText({
                chat_id: chatId,
                message_id: messageId,
                text,
                reply_markup: keyboard,
                disable_web_page_preview: true,
            } as Telegram.EditMessageTextParams);
            await logTelegramResponse('editMessageText', response);
        };

        try {
            const current = await loadPreviewMode(env, chatKey);
            if (arg === 'mini') {
                if (current === 'miniapp') {
                    await answer(fill(t(lang, 'previewModeAlready'), { mode: modeLabel(lang, 'miniapp') }));
                    scheduleDeleteMessage(ctx, token, chatId, messageId, env);
                    return;
                }
                await savePreviewMode(env, chatKey, 'miniapp');
                await edit(fill(t(lang, 'previewModeSetOk'), { mode: modeLabel(lang, 'miniapp') }));
                await answer();
                scheduleDeleteMessage(ctx, token, chatId, messageId, env);
                return;
            }
            if (arg === 'webwarn') {
                if (current === 'web') {
                    await answer(fill(t(lang, 'previewModeAlready'), { mode: modeLabel(lang, 'web') }));
                    scheduleDeleteMessage(ctx, token, chatId, messageId, env);
                    return;
                }
                await edit(t(lang, isWebAuthEnabled(env) ? 'previewModeWarnAuth' : 'previewModeWarnOpen'), {
                    inline_keyboard: [[
                        { text: t(lang, 'previewModeYes'), callback_data: 'pm:web' },
                        { text: t(lang, 'previewModeNo'), callback_data: 'pm:cancel' },
                    ]],
                });
                await answer();
                // Bump 60s so Yes/No stays readable; final set/cancel bumps again
                scheduleDeleteMessage(ctx, token, chatId, messageId, env);
                return;
            }
            if (arg === 'web') {
                await savePreviewMode(env, chatKey, 'web');
                await edit(fill(t(lang, 'previewModeSetOk'), { mode: modeLabel(lang, 'web') }));
                await answer();
                scheduleDeleteMessage(ctx, token, chatId, messageId, env);
                return;
            }
            if (arg === 'cancel') {
                await edit(t(lang, 'previewModeCancel'));
                await answer();
                scheduleDeleteMessage(ctx, token, chatId, messageId, env);
                return;
            }
            await answer();
            scheduleDeleteMessage(ctx, token, chatId, messageId, env);
        } catch (e) {
            logTelegramError('callback.previewmode.error', e, { data, chatId, messageId });
            const response = await api.answerCallbackQuery({
                callback_query_id: callbackId,
                text: (e as Error).message,
                show_alert: true,
            });
            await logTelegramResponse('answerCallbackQuery', response);
            scheduleDeleteMessage(ctx, token, chatId, messageId, env);
        }
        return;
    }

    if (handlers[act]) {
        try {
            await handlers[act](arg);
        } catch (e) {
            logTelegramError('callback.handler.error', e, { data, act, arg, chatId, messageId });
            const response = await api.answerCallbackQuery({
                callback_query_id: callbackId,
                text: (e as Error).message,
                show_alert: true,
            });
            await logTelegramResponse('answerCallbackQuery', response);
        }
        return;
    }
    logTelegram('callback.unknown_action', { data, act, arg, chatId, messageId });
}

export async function telegramWebhookHandler(
    req: Request,
    env: Environment,
    ctx?: ExecutionContext,
): Promise<void> {
    const body = await req.json() as Telegram.Update;
    logTelegram('webhook.update', {
        updateId: body?.update_id,
        hasMessage: !!body?.message,
        hasCallbackQuery: !!body?.callback_query,
        hasEditedMessage: !!body?.edited_message,
        keys: body ? Object.keys(body) : [],
    });
    if (body?.message) {
        await telegramCommandHandler(body?.message, env, ctx);
        return;
    }
    if (body?.callback_query) {
        await telegramCallbackHandler(body?.callback_query, env, ctx);
        return;
    }
    logTelegram('webhook.unhandled_update', { updateId: body?.update_id, keys: body ? Object.keys(body) : [] });
}
