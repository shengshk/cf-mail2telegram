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
    /** Whether Email Routing backup to FORWARD_MAIL ran for this mail */
    backedUp?: boolean;
    /** Header To (external) for Mailbox when not backed up */
    originalTo?: string;
}

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

/**
 * Required: TELEGRAM_BOT, KV binding DB
 * Recommended: GEMINI_API_KEY, FORWARD_MAIL, MAILS_TTL
 * Optional: UI_LANG (en|zh|tw, default en)
 * Public hostname is saved when you open /init (KV PUBLIC_HOST).
 */
export interface Environment {
    /** token,chat_id[,junk_chat_id] */
    TELEGRAM_BOT?: string;
    /** @deprecated */
    TELEGRAM_TOKEN?: string;
    /** @deprecated */
    TELEGRAM_ID?: string;

    /** UI language: en (default) | zh | tw */
    UI_LANG?: string;

    /**
     * Single backup:
     * `email` | `email,Folder` | `email,Folder,noforwarded|forwarded` | `email,forwarded`
     * Default policy: noforwarded.
     */
    FORWARD_MAIL?: string;

    /**
     * Preview retention: `duration,maxCount` e.g. `1d,10` / `24h,50` / `86400,20`
     * Default if unset: `1d,100`
     */
    MAILS_TTL?: string;

    BLOCK_LIST?: string;
    WHITE_LIST?: string;
    DISABLE_LOAD_REGEX_FROM_DB?: string;
    BLOCK_POLICY?: string;
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
