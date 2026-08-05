import type { Environment } from '../types';
import { Dao } from '../db';
import { requireTelegram } from '../env';
import { createTelegramBotAPI } from './api';

const BOT_USERNAME_KEY = 'BOT_USERNAME';

export async function saveBotUsername(dao: Dao, username: string): Promise<string> {
    const normalized = username.trim().replace(/^@/, '');
    if (!normalized) {
        throw new Error('Empty bot username');
    }
    await dao.saveBotUsername(normalized);
    return normalized;
}

/** Load cached @bot username (no @). Fetches getMe and caches if missing. */
export async function loadBotUsername(env: Environment): Promise<string | undefined> {
    if (!env.DB) {
        return undefined;
    }
    const dao = new Dao(env.DB);
    const cached = await dao.loadBotUsername();
    if (cached) {
        return cached;
    }
    try {
        const { token } = requireTelegram(env);
        const api = createTelegramBotAPI(token);
        const me = await api.getMeWithReturns({});
        if (!me.ok || !me.result?.username) {
            return undefined;
        }
        return await saveBotUsername(dao, me.result.username);
    } catch (e) {
        console.error('[bot-username]', e);
        return undefined;
    }
}

/** Main Mini App deep link with start_param (survives Telegram stripping web_app query). */
export function miniAppStartLink(botUsername: string, startParam: string): string {
    const u = botUsername.trim().replace(/^@/, '');
    return `https://t.me/${u}?startapp=${encodeURIComponent(startParam)}`;
}

export function isMailStartParam(param: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
}

export function listModeStartParam(mode: 'block' | 'white' | 'test'): string {
    return `list_${mode}`;
}

export function parseListModeStartParam(param: string): 'block' | 'white' | 'test' | undefined {
    switch (param) {
        case 'list_block':
            return 'block';
        case 'list_white':
            return 'white';
        case 'list_test':
            return 'test';
        default:
            return undefined;
    }
}

export { BOT_USERNAME_KEY };
