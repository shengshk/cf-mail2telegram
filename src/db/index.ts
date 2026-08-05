import type { KVNamespace } from '@cloudflare/workers-types';
import type { EmailCache, EmailHandleStatus } from '../types';

export type AddressListStoreKey = 'BLOCK_LIST' | 'WHITE_LIST';

const MAIL_CACHE_INDEX_KEY = 'MAIL_CACHE_INDEX';

export class Dao {
    private readonly db: KVNamespace;

    constructor(db: KVNamespace) {
        this.db = db;
        this.loadArrayFromDB = this.loadArrayFromDB.bind(this);
        this.addAddress = this.addAddress.bind(this);
        this.removeAddress = this.removeAddress.bind(this);
        this.loadMailStatus = this.loadMailStatus.bind(this);
        this.loadMailCache = this.loadMailCache.bind(this);
    }

    async loadArrayFromDB(key: AddressListStoreKey): Promise<string[]> {
        try {
            const raw = await this.db.get(key);
            return loadArrayFromRaw(raw);
        } catch (e) {
            console.error(e);
        }
        return [];
    }

    async addAddress(address: string, type: AddressListStoreKey): Promise<void> {
        const list = await this.loadArrayFromDB(type);
        list.unshift(address);
        await this.db.put(type, JSON.stringify(list));
    }

    async removeAddress(address: string, type: AddressListStoreKey): Promise<void> {
        const list = await this.loadArrayFromDB(type);
        const result = list.filter(item => item !== address);
        await this.db.put(type, JSON.stringify(result));
    }

    async loadMailStatus(id: string, guardian: boolean): Promise<EmailHandleStatus> {
        const defaultStatus = {
            telegram: false,
            forward: [],
        };
        if (guardian) {
            try {
                const raw = await this.db.get(id);
                if (raw) {
                    return {
                        ...defaultStatus,
                        ...JSON.parse(raw),
                    };
                }
            } catch (e) {
                console.error(e);
            }
        }
        return defaultStatus;
    }

    async saveMailStatus(id: string, status: EmailHandleStatus, ttl?: number): Promise<void> {
        await this.db.put(id, JSON.stringify(status), { expirationTtl: ttl });
    }

    async loadMailCache(id: string): Promise<EmailCache | null> {
        try {
            const raw = await this.db.get(id);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error(e);
        }
        return null;
    }

    async saveMailCache(id: string, cache: EmailCache, ttl?: number): Promise<void> {
        await this.db.put(id, JSON.stringify(cache), { expirationTtl: ttl });
    }

    async deleteMailCache(id: string): Promise<void> {
        try {
            await this.db.delete(id);
        } catch (e) {
            console.error(e);
        }
    }

    async loadMailCacheIndex(): Promise<string[]> {
        try {
            const raw = await this.db.get(MAIL_CACHE_INDEX_KEY);
            return loadArrayFromRaw(raw);
        } catch (e) {
            console.error(e);
        }
        return [];
    }

    async saveMailCacheIndex(ids: string[]): Promise<void> {
        await this.db.put(MAIL_CACHE_INDEX_KEY, JSON.stringify(ids));
    }

    /**
     * Persist preview cache (no time TTL), append to index, delete oldest when over maxCount.
     */
    async saveMailCacheWithLimit(
        id: string,
        cache: EmailCache,
        maxCount: number,
    ): Promise<void> {
        await this.saveMailCache(id, cache);
        let index = await this.loadMailCacheIndex();
        index = index.filter(x => x !== id);
        index.push(id);
        while (index.length > maxCount) {
            const old = index.shift();
            if (old) {
                await this.deleteMailCache(old);
            }
        }
        await this.saveMailCacheIndex(index);
    }

    async telegramIDToMailID(id: string): Promise<string | null> {
        return await this.db.get(`TelegramID2MailID:${id}`);
    }

    async saveTelegramIDToMailID(id: string, mailID: string, ttl?: number): Promise<void> {
        await this.db.put(`TelegramID2MailID:${id}`, mailID, { expirationTtl: ttl });
    }

    async loadPublicHost(): Promise<string | null> {
        try {
            const raw = await this.db.get('PUBLIC_HOST');
            return raw?.trim() || null;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async savePublicHost(host: string): Promise<void> {
        await this.db.put('PUBLIC_HOST', host);
    }

    async loadBotUsername(): Promise<string | null> {
        try {
            const raw = await this.db.get('BOT_USERNAME');
            return raw?.trim().replace(/^@/, '') || null;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async saveBotUsername(username: string): Promise<void> {
        await this.db.put('BOT_USERNAME', username.trim().replace(/^@/, ''));
    }

    async loadPreviewMode(chatId: string): Promise<string | null> {
        try {
            return await this.db.get(`PREVIEW_MODE:${chatId}`);
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    async savePreviewMode(chatId: string, mode: string): Promise<void> {
        await this.db.put(`PREVIEW_MODE:${chatId}`, mode);
    }
}

export function loadArrayFromRaw(raw: string | null | undefined): string[] {
    if (!raw) {
        return [];
    }
    let list = [];
    try {
        list = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(list)) {
        return [];
    }
    return list;
}
