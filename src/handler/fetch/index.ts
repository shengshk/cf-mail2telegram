import type { IRequest, RouterType } from 'itty-router';
import type { AddressListStoreKey } from '../../db';
import type { Environment } from '../../types';
import { validate } from '@tma.js/init-data-node/web';
import { json, Router } from 'itty-router';
import { Dao } from '../../db';
import { requireTelegram } from '../../env';
import { htmlLang, resolveUiLang, t, tmaI18nPayload } from '../../i18n';
import { buildPreviewBodyHtml, renderPreviewEmptyMiniApp, renderPreviewMiniAppShell, renderPreviewPage, sanitizeHtmlForPreview } from '../../mail/preview';
import { isWebLinkValid } from '../../mail/cache-policy';
import { publicHostFromRequest, savePublicHost } from '../../public-host';
import statusHtml from '../../status.html';
import { createTelegramBotAPI, telegramCommands, telegramWebhookHandler, tmaHTML } from '../../telegram';
import { isMailStartParam, parseListModeStartParam, saveBotUsername } from '../../telegram/bot-username';
import {
    clearWebAuthCookieHeader,
    isWebAuthEnabled,
    isWebAuthenticated,
    makeWebAuthCookie,
    parseWebUser,
    renderLoginPage,
    requestIsHttps,
    safeNextPath,
    setWebAuthCookieHeader,
} from '../../web-auth';

class HTTPError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function createTmaAuthMiddleware(env: Environment): (req: Request) => Promise<void> {
    const { token, chatId } = requireTelegram(env);
    return async (req: Request): Promise<void> => {
        const [authType, authData = ''] = (req.headers.get('Authorization') || '').split(' ');
        if (authType !== 'tma') {
            throw new HTTPError(401, 'Invalid authorization type');
        }
        try {
            await validate(authData, token, {
                expiresIn: 3600,
            });
            const user = JSON.parse(new URLSearchParams(authData).get('user') || '{}');
            for (const id of chatId.split(',')) {
                if (id.trim() === `${user.id}`) {
                    return;
                }
            }
            throw new HTTPError(403, 'Permission denied');
        } catch (e) {
            throw new HTTPError(401, (e as Error).message);
        }
    };
}

type AddressType = 'block' | 'white';

function addressParamsCheck(address: string, type: AddressType): AddressListStoreKey {
    const keyMap: { [key in AddressType]: AddressListStoreKey } = {
        block: 'BLOCK_LIST',
        white: 'WHITE_LIST',
    };
    if (!address || !type) {
        throw new HTTPError(400, 'Missing address or type');
    }
    if (keyMap[type] === undefined) {
        throw new HTTPError(400, 'Invalid type');
    }
    return keyMap[type];
}

function errorHandler(error: Error): Response {
    if (error instanceof HTTPError) {
        return new Response(JSON.stringify({
            error: error.message,
        }), { status: error.status });
    }
    return new Response(JSON.stringify({
        error: error.message,
    }), { status: 500 });
}

function createRouter(env: Environment, ctx?: ExecutionContext): RouterType {
    const router = Router({
        catch: errorHandler,
        finally: [json],
    });

    const {
        DB,
    } = env;
    const { token: TELEGRAM_TOKEN } = requireTelegram(env);
    const dao = new Dao(DB);
    const auth = createTmaAuthMiddleware(env);

    router.get('/', async (): Promise<Response> => {
        return new Response(statusHtml, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
            },
        });
    });

    /// Status page: compare KV PUBLIC_HOST vs browser host
    router.get('/api/status', async (req: IRequest): Promise<any> => {
        const host = await dao.loadPublicHost();
        const webAuthEnabled = isWebAuthEnabled(env);
        const authenticated = webAuthEnabled
            ? await isWebAuthenticated(env, (req as unknown as Request).headers.get('Cookie'))
            : true;
        return {
            host: host || null,
            webAuthEnabled,
            authenticated,
        };
    });

    router.get('/login', async (req: IRequest): Promise<Response> => {
        if (!isWebAuthEnabled(env)) {
            return Response.redirect(new URL('/', req.url).toString(), 302);
        }
        const nextUrl = safeNextPath(String(req.query.next || '/'));
        if (await isWebAuthenticated(env, (req as unknown as Request).headers.get('Cookie'))) {
            return Response.redirect(new URL(nextUrl, req.url).toString(), 302);
        }
        return new Response(renderLoginPage(env, { nextUrl }), {
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
    });

    router.post('/login', async (req: IRequest): Promise<Response> => {
        if (!isWebAuthEnabled(env)) {
            return Response.redirect(new URL('/', req.url).toString(), 302);
        }
        const creds = parseWebUser(env);
        const request = req as unknown as Request;
        const form = await request.formData();
        const username = String(form.get('username') || '').trim();
        const password = String(form.get('password') || '');
        const remember = String(form.get('remember') || '') === '1';
        const nextUrl = safeNextPath(String(form.get('next') || '/'));
        if (!creds || username !== creds.username || password !== creds.password) {
            return new Response(renderLoginPage(env, { nextUrl, error: 'loginBadCredentials' }), {
                status: 401,
                headers: { 'content-type': 'text/html; charset=utf-8' },
            });
        }
        const cookie = await makeWebAuthCookie(creds, remember);
        return new Response(null, {
            status: 302,
            headers: {
                Location: new URL(nextUrl, request.url).toString(),
                'Set-Cookie': setWebAuthCookieHeader(cookie.value, cookie.maxAge, requestIsHttps(request)),
            },
        });
    });

    router.get('/logout', async (req: IRequest): Promise<Response> => {
        const nextUrl = safeNextPath(String(req.query.next || '/login'));
        const request = req as unknown as Request;
        return new Response(null, {
            status: 302,
            headers: {
                Location: new URL(nextUrl, request.url).toString(),
                'Set-Cookie': clearWebAuthCookieHeader(requestIsHttps(request)),
            },
        });
    });

    router.get('/init', async (req: IRequest): Promise<any> => {
        if (!DB) {
            throw new HTTPError(500, 'KV binding DB is required');
        }
        if (isWebAuthEnabled(env)) {
            const ok = await isWebAuthenticated(env, (req as unknown as Request).headers.get('Cookie'));
            if (!ok) {
                throw new HTTPError(401, 'Login required');
            }
        }
        const host = publicHostFromRequest(req as unknown as Request);
        if (!host) {
            throw new HTTPError(400, 'Cannot detect public host from request URL');
        }
        const savedHost = await savePublicHost(dao, host);
        const api = createTelegramBotAPI(TELEGRAM_TOKEN);
        const lang = resolveUiLang(env);
        let botUsername: string | undefined;
        try {
            const me = await api.getMeWithReturns({});
            if (me.ok && me.result?.username) {
                botUsername = await saveBotUsername(dao, me.result.username);
            }
        } catch (e) {
            console.error('[init] getMe failed', e);
        }
        const webhook = await api.setWebhook({
            url: `https://${savedHost}/telegram/${TELEGRAM_TOKEN}/webhook`,
        });
        const commands = await api.setMyCommands({
            commands: telegramCommands(lang),
        });
        return {
            host: savedHost,
            botUsername: botUsername || null,
            webhook: await webhook.json(),
            commands: await commands.json(),
        };
    });

    /// Telegram Mini Apps：默认打开最新邮件；名单仍用 /cfmail（start_param / ?mode=）
    router.get('/tma', async (req: IRequest): Promise<Response> => {
        const startParam = String(
            req.query.tgWebAppStartParam || req.query.startapp || '',
        ).trim();
        const mode = String(req.query.mode || '').trim().toLowerCase();
        const listFromQuery = mode === 'block' || mode === 'white' || mode === 'test'
            ? mode as 'block' | 'white' | 'test'
            : undefined;
        const listMode = parseListModeStartParam(startParam) || listFromQuery;
        if (listMode) {
            const lang = resolveUiLang(env);
            const payload = JSON.stringify(tmaI18nPayload(lang)).replace(/</g, '\\u003c');
            const html = tmaHTML
                .replace(/__UI_LANG__/g, htmlLang(lang))
                .replace('__I18N_JSON__', payload);
            return new Response(html, {
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'Referrer-Policy': 'no-referrer',
                },
            });
        }

        const previewId = String(req.query.id || '').trim()
            || (isMailStartParam(startParam) ? startParam : '');
        if (previewId) {
            const html = renderPreviewMiniAppShell(previewId, env);
            return new Response(html, {
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'Referrer-Policy': 'no-referrer',
                },
            });
        }

        const index = await dao.loadMailCacheIndex();
        const latestId = index.length ? index[index.length - 1] : '';
        const html = latestId
            ? renderPreviewMiniAppShell(latestId, env)
            : renderPreviewEmptyMiniApp(env);
        return new Response(html, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'Referrer-Policy': 'no-referrer',
            },
        });
    });

    /// 邮件预览 Mini App（web_app 按钮直达；路径保留 id，避免 query 被客户端丢掉）
    router.get('/tma/email/:id', async (req: IRequest): Promise<Response> => {
        const id = req.params.id;
        const html = renderPreviewMiniAppShell(id, env);
        return new Response(html, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'Referrer-Policy': 'no-referrer',
            },
        });
    });

    router.get('/api/email/:id', auth, async (req: IRequest): Promise<any> => {
        const id = req.params.id;
        const value = await dao.loadMailCache(id);
        if (!value) {
            throw new HTTPError(404, t(resolveUiLang(env), 'previewExpired'));
        }
        const lang = resolveUiLang(env);
        return {
            subject: value.subject || t(lang, 'noSubjectShort'),
            from: value.from || '',
            to: value.to || '',
            date: value.date || '',
            bodyHtml: buildPreviewBodyHtml(value),
        };
    });

    router.post('/api/address/add', auth, async (req: IRequest): Promise<any> => {
        const { address, type } = await req.json() as { address: string; type: AddressType };
        const key = addressParamsCheck(address, type);
        await dao.addAddress(address, key);
        return { success: true };
    });

    router.post('/api/address/remove', auth, async (req: IRequest): Promise<any> => {
        const { address, type } = await req.json() as { address: string; type: AddressType };
        const key = addressParamsCheck(address, type);
        await dao.removeAddress(address, key);
        return { success: true };
    });

    router.get('/api/address/list', auth, async (): Promise<any> => {
        const block = await dao.loadArrayFromDB('BLOCK_LIST');
        const white = await dao.loadArrayFromDB('WHITE_LIST');
        return { block, white };
    });

    /// Webhook

    router.post('/telegram/:token/webhook', async (req: IRequest): Promise<any> => {
        const debug = (env.DEBUG || '').toLowerCase() === 'true';
        const tokenMatched = req.params.token === TELEGRAM_TOKEN;
        if (!tokenMatched) {
            // 路径里的 token 与当前 TELEGRAM_BOT 不一致（常见：别的 bot 仍把 webhook 指到本 Worker）
            if (debug) {
                console.warn('[telegram] webhook.invalid_token');
            }
            throw new HTTPError(403, 'Invalid token');
        }
        if (debug) {
            console.log(`[telegram] webhook.request ${JSON.stringify({
                url: req.url,
                method: req.method,
            })}`);
        }
        try {
            await telegramWebhookHandler(req, env, ctx);
            if (debug) {
                console.log('[telegram] webhook.done');
            }
        } catch (e) {
            const err = e as Error;
            console.error(`[telegram] webhook.error ${JSON.stringify({
                message: err.message,
                stack: err.stack,
            })}`);
        }
        return { success: true };
    });

    /// Preview：WEB_USER 模式需登录；否则 ?t= token + 倒计时

    router.get('/email/:id', async (req: IRequest): Promise<Response> => {
        const id = req.params.id;
        const mode = String(req.query.mode || 'page');
        const token = String(req.query.t || '');
        const request = req as unknown as Request;
        const lang = resolveUiLang(env);
        const authEnabled = isWebAuthEnabled(env);

        if (authEnabled) {
            const ok = await isWebAuthenticated(env, request.headers.get('Cookie'));
            if (!ok) {
                const next = `/email/${encodeURIComponent(id)}`;
                return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url).toString(), 302);
            }
        }

        const value = await dao.loadMailCache(id);
        if (!value) {
            return new Response(t(lang, 'previewExpired'), {
                status: 404,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
        }
        if (!authEnabled && !isWebLinkValid(value, token)) {
            return new Response(t(lang, 'webLinkExpired'), {
                status: 403,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
        }

        if (mode === 'text') {
            return new Response(value.text || '', {
                headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
        }
        if (mode === 'raw' || mode === 'html') {
            return new Response(value.html || value.text || '', {
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'Referrer-Policy': 'no-referrer',
                },
            });
        }

        const body = value.html
            ? sanitizeHtmlForPreview(value.html)
            : '';
        const page = renderPreviewPage(value, body, env, authEnabled
            ? { showLogout: true }
            : { linkExpiresAt: value.webExpiresAt || 0 });
        return new Response(page, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'Referrer-Policy': 'no-referrer',
            },
        });
    });

    router.all('*', async () => {
        throw new HTTPError(404, 'Not found');
    });

    return router;
}

export async function fetchHandler(
    request: Request,
    env: Environment,
    ctx?: ExecutionContext,
): Promise<Response> {
    const router = createRouter(env, ctx);
    return router.fetch(request).catch((e) => {
        return new Response(JSON.stringify({
            error: e.message,
        }), { status: 500 });
    });
}
