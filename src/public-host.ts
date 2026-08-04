import type { Environment } from '../types';
import { Dao } from '../db';

const PUBLIC_HOST_KEY = 'PUBLIC_HOST';

/** Normalize host from a request URL or legacy-looking string. */
export function normalizePublicHost(raw: string): string {
    let host = raw.trim();
    if (!host) {
        return '';
    }
    host = host.replace(/^https?:\/\//i, '');
    host = host.split('/')[0] || '';
    host = host.replace(/:\d+$/, '');
    return host.trim().toLowerCase();
}

export function publicHostFromRequest(req: Request): string {
    return normalizePublicHost(new URL(req.url).host);
}

export async function savePublicHost(dao: Dao, host: string): Promise<string> {
    const normalized = normalizePublicHost(host);
    if (!normalized) {
        throw new Error('Empty public host');
    }
    await dao.savePublicHost(normalized);
    return normalized;
}

export async function loadPublicHost(env: Environment): Promise<string | undefined> {
    if (!env.DB) {
        return undefined;
    }
    const dao = new Dao(env.DB);
    const host = await dao.loadPublicHost();
    return host || undefined;
}

export async function requirePublicHost(env: Environment): Promise<string> {
    const host = await loadPublicHost(env);
    if (!host) {
        throw new Error('Public host not set. Open https://<your-worker-host>/init once in a browser.');
    }
    return host;
}

export { PUBLIC_HOST_KEY };
