import type { IRequest, RouterType } from 'itty-router';
import type { AddressListStoreKey } from '../../db';
import type { Environment } from '../../types';
import { validate } from '@tma.js/init-data-node/web';
import { json, Router } from 'itty-router';
import { Dao } from '../../db';
import { requireTelegram } from '../../env';
import { renderPreviewPage, sanitizeHtmlForPreview } from '../../mail/preview';
import { createTelegramBotAPI, telegramCommands, telegramWebhookHandler, tmaHTML } from '../../telegram';

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

function createRouter(env: Environment): RouterType {
    const router = Router({
        catch: errorHandler,
        finally: [json],
    });

    const {
        DOMAIN,
        DB,
    } = env;
    const { token: TELEGRAM_TOKEN } = requireTelegram(env);
    const dao = new Dao(DB);
    const auth = createTmaAuthMiddleware(env);

    router.get('/', async (): Promise<Response> => {
        return new Response(null, {
            status: 302,
            headers: {
                location: 'https://github.com/shengshk/mail2telegramcf',
            },
        });
    });

    router.get('/init', async (): Promise<any> => {
        const api = createTelegramBotAPI(TELEGRAM_TOKEN);
        const webhook = await api.setWebhook({
            url: `https://${DOMAIN}/telegram/${TELEGRAM_TOKEN}/webhook`,
        });
        const commands = await api.setMyCommands({
            commands: telegramCommands,
        });
        return {
            webhook: await webhook.json(),
            commands: await commands.json(),
        };
    });

    /// Telegram Mini Apps

    router.get('/tma', async (): Promise<Response> => {
        return new Response(tmaHTML, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
            },
        });
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
        console.log(`[telegram] webhook.request ${JSON.stringify({
            url: req.url,
            method: req.method,
            tokenMatched: req.params.token === TELEGRAM_TOKEN,
        })}`);
        if (req.params.token !== TELEGRAM_TOKEN) {
            console.warn('[telegram] webhook.invalid_token');
            throw new HTTPError(403, 'Invalid token');
        }
        try {
            await telegramWebhookHandler(req, env);
            console.log('[telegram] webhook.done');
        } catch (e) {
            const err = e as Error;
            console.error(`[telegram] webhook.error ${JSON.stringify({
                message: err.message,
                stack: err.stack,
            })}`);
        }
        return { success: true };
    });

    /// Preview（默认浅灰白阅读壳 + 原 HTML；?mode=raw 吐原始片段）

    router.get('/email/:id', async (req: IRequest): Promise<Response> => {
        const id = req.params.id;
        const mode = String(req.query.mode || 'page');
        const value = await dao.loadMailCache(id);
        if (!value) {
            return new Response('预览不存在或已过期', {
                status: 404,
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
        const page = renderPreviewPage(value, body);
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

export async function fetchHandler(request: Request, env: Environment): Promise<Response> {
    const router = createRouter(env);
    return router.fetch(request).catch((e) => {
        return new Response(JSON.stringify({
            error: e.message,
        }), { status: 500 });
    });
}
