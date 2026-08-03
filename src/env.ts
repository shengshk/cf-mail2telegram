import type { Environment } from './types';

/** 对齐 Docker：TELEGRAM_BOT=token,chat_id[,junk_chat_id]；兼容旧 TELEGRAM_TOKEN + TELEGRAM_ID */
export function resolveTelegram(env: Environment): { token: string; chatId: string; junkChatId: string } {
    const bot = (env.TELEGRAM_BOT || '').trim();
    if (bot) {
        // token 含冒号不含逗号，按逗号切即可
        const parts = bot.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            return {
                token: parts[0],
                chatId: parts[1],
                junkChatId: parts[2] || '',
            };
        }
    }
    return {
        token: (env.TELEGRAM_TOKEN || '').trim(),
        chatId: (env.TELEGRAM_ID || '').trim(),
        junkChatId: '',
    };
}

export function requireTelegram(env: Environment): { token: string; chatId: string } {
    const { token, chatId } = resolveTelegram(env);
    if (!token || !chatId) {
        throw new Error('请配置 TELEGRAM_BOT=token,chat_id（或旧变量 TELEGRAM_TOKEN + TELEGRAM_ID）');
    }
    return { token, chatId };
}
