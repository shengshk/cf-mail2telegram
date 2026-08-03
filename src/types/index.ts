import type { Ai, KVNamespace } from '@cloudflare/workers-types';

export interface EmailHandleStatus {
    telegram: boolean;
    forward: string[];
}

export interface EmailCache {
    id: string;
    messageId: string;
    from: string;
    to: string;
    subject: string;
    date?: string;
    gmThrid?: string;
    html?: string;
    text?: string;
}

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

/**
 * 精简配置（对齐 Docker）：
 * 必填：DOMAIN、TELEGRAM_BOT（或旧 TOKEN+ID）、KV 绑定 DB
 * 建议：GEMINI_API_KEY、FORWARD_LIST
 * 其余均有代码默认，可不配
 */
export interface Environment {
    DOMAIN: string;
    /** token,chat_id[,junk_chat_id] — 优先于旧变量 */
    TELEGRAM_BOT?: string;
    /** @deprecated 用 TELEGRAM_BOT */
    TELEGRAM_TOKEN?: string;
    /** @deprecated 用 TELEGRAM_BOT */
    TELEGRAM_ID?: string;

    FORWARD_LIST?: string;
    BLOCK_LIST?: string;
    WHITE_LIST?: string;
    DISABLE_LOAD_REGEX_FROM_DB?: string;
    BLOCK_POLICY?: string;
    MAIL_TTL?: string;
    MAX_EMAIL_SIZE?: string;
    MAX_EMAIL_SIZE_POLICY?: MaxEmailSizePolicy;

    GEMINI_API_KEY?: string;
    /** 默认 gemini-2.5-flash-lite */
    GEMINI_MODEL?: string;
    PROMPT_TEMPLATE?: string;
    /** 默认 Asia/Shanghai */
    TIMEZONE?: string;
    /** 默认 0 */
    GMAIL_U?: string;
    /** 默认 INBOX */
    GMAIL_LABEL?: string;

    GUARDIAN_MODE?: string;
    RESEND_API_KEY?: string;
    DB: KVNamespace;
    AI?: Ai;
    DEBUG?: string;

    /** @deprecated 摘要已移除 */
    OPENAI_API_KEY?: string;
    OPENAI_COMPLETIONS_API?: string;
    OPENAI_CHAT_MODEL?: string;
    WORKERS_AI_MODEL?: string;
    SUMMARY_TARGET_LANG?: string;
}
