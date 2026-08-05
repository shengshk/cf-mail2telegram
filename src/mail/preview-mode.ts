import type { Environment } from '../types';
import { Dao } from '../db';

export type PreviewMode = 'miniapp' | 'web';

const KEY_PREFIX = 'PREVIEW_MODE:';

export function parsePreviewMode(raw: string | null | undefined): PreviewMode {
    return raw === 'web' ? 'web' : 'miniapp';
}

export async function loadPreviewMode(env: Environment, chatId: string): Promise<PreviewMode> {
    if (!env.DB || !chatId) {
        return 'miniapp';
    }
    const dao = new Dao(env.DB);
    return parsePreviewMode(await dao.loadPreviewMode(chatId));
}

export async function savePreviewMode(env: Environment, chatId: string, mode: PreviewMode): Promise<void> {
    if (!env.DB || !chatId) {
        return;
    }
    const dao = new Dao(env.DB);
    await dao.savePreviewMode(chatId, mode);
}

export { KEY_PREFIX as PREVIEW_MODE_KEY_PREFIX };
