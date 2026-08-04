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
 * Required: TELEGRAM_BOT (or legacy TOKEN+ID), KV binding DB
 * Recommended: GEMINI_API_KEY, FORWARD_MAIL
 * Optional: UI_LANG (en|zh|tw, default en), FORWARD_MAIL0/1/2/…
 * Public hostname is saved automatically when you open /init (stored in KV as PUBLIC_HOST).
 */
export interface Environment {
    /** token,chat_id[,junk_chat_id] — preferred over legacy vars */
    TELEGRAM_BOT?: string;
    /** @deprecated use TELEGRAM_BOT */
    TELEGRAM_TOKEN?: string;
    /** @deprecated use TELEGRAM_BOT */
    TELEGRAM_ID?: string;

    /** UI language: en (default) | zh | tw */
    UI_LANG?: string;

    /**
     * Primary backup: `user@gmail.com` or `user@gmail.com,Backup`
     * Extra backups: FORWARD_MAIL0 / FORWARD_MAIL1 / … (any digits)
     */
    FORWARD_MAIL?: string;
    /** @deprecated use FORWARD_MAIL / FORWARD_MAILn */
    FORWARD_LIST?: string;
    /** @deprecated fold into FORWARD_MAIL as `email,Folder` */
    FORWARD_DIR?: string;
    BLOCK_LIST?: string;
    WHITE_LIST?: string;
    DISABLE_LOAD_REGEX_FROM_DB?: string;
    BLOCK_POLICY?: string;
    MAIL_TTL?: string;
    MAX_EMAIL_SIZE?: string;
    MAX_EMAIL_SIZE_POLICY?: MaxEmailSizePolicy;

    GEMINI_API_KEY?: string;
    /** default gemini-2.5-flash-lite */
    GEMINI_MODEL?: string;
    PROMPT_TEMPLATE?: string;
    /** default Asia/Shanghai */
    TIMEZONE?: string;
    /** Gmail multi-account index, default 0 */
    GMAIL_U?: string;
    /** @deprecated use FORWARD_MAIL folder part */
    GMAIL_LABEL?: string;

    GUARDIAN_MODE?: string;
    RESEND_API_KEY?: string;
    DB: KVNamespace;
    AI?: Ai;
    DEBUG?: string;

    /** @deprecated summary removed */
    OPENAI_API_KEY?: string;
    OPENAI_COMPLETIONS_API?: string;
    OPENAI_CHAT_MODEL?: string;
    WORKERS_AI_MODEL?: string;
    SUMMARY_TARGET_LANG?: string;
}
