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
    /** 格式化后的时间，用于 TG / 预览页 */
    date?: string;
    /** Gmail X-GM-THRID（若邮件头带有） */
    gmThrid?: string;
    html?: string;
    text?: string;
}

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

export interface Environment {
    TELEGRAM_TOKEN: string;
    TELEGRAM_ID: string;
    FORWARD_LIST: string;
    BLOCK_LIST: string;
    WHITE_LIST: string;
    DISABLE_LOAD_REGEX_FROM_DB: string;
    BLOCK_POLICY: string;
    MAIL_TTL: string;
    DOMAIN: string;
    MAX_EMAIL_SIZE?: string;
    MAX_EMAIL_SIZE_POLICY?: MaxEmailSizePolicy;
    /** Gemini 抽验证码（对齐 Docker 范本；仅此模型） */
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    PROMPT_TEMPLATE?: string;
    TIMEZONE?: string;
    /** Gmail 多账号时 mail.google.com/mail/u/N 的 N，默认 0 */
    GMAIL_U?: string;
    /** thrid 深链用的 label；空则 INBOX。无 thrid 时走 rfc822msgid 搜索 */
    GMAIL_LABEL?: string;
    /** @deprecated 摘要已移除，保留字段以免旧 wrangler 报错 */
    OPENAI_API_KEY?: string;
    OPENAI_COMPLETIONS_API?: string;
    OPENAI_CHAT_MODEL?: string;
    WORKERS_AI_MODEL?: string;
    SUMMARY_TARGET_LANG?: string;
    GUARDIAN_MODE?: string;
    RESEND_API_KEY?: string;
    DB: KVNamespace;
    AI?: Ai;
    DEBUG?: string;
}
