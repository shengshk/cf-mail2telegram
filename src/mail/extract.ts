import type { Environment } from '../types';

const GEMINI_OPENAI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_CUSTOM_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_AI_PROVIDER = 'GEMINI_OFFICIAL,CUSTOM';
const DEFAULT_GEMINI_MODELS = 'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash';
const DEFAULT_CUSTOM_MODELS = 'google/gemma-4-26b-a4b-it:free,poolside/laguna-s-2.1:free';

const SUPPORTED_PROVIDERS = ['GEMINI_OFFICIAL', 'CUSTOM'] as const;
type AiProvider = (typeof SUPPORTED_PROVIDERS)[number];

const DEFAULT_PROMPT = (
    '从以下文本中提取验证码。只输出验证码，不要有任何其他文字。'
    + '如果没有验证码，只输出\'None\'。\n\n文本：{input_text}\n\n验证码：'
);

const VERIFICATION_KEYWORDS = [
    '验证码', '校验码', '检验码', '确认码', '激活码', '动态码', '安全码',
    '验证代码', '校验代码', '检验代码', '激活代码', '确认代码', '动态代码', '安全代码',
    '登入码', '认证码', '识别码', '短信口令', '动态密码', '交易码', '上网密码', '随机码', '动态口令',
    '驗證碼', '校驗碼', '檢驗碼', '確認碼', '激活碼', '動態碼',
    '驗證代碼', '校驗代碼', '檢驗代碼', '確認代碼', '激活代碼', '動態代碼',
    '登入碼', '認證碼', '識別碼',
    'code', 'otp', 'one-time password', 'verification', 'auth', 'authentication',
    'pin', 'security', 'access', 'token',
    '短信验证', '短信验證', '短信校验', '短信校驗',
    '手机验证', '手機驗證', '手机校验', '手機校驗',
    '验证短信', '驗證短信', '验证信息', '驗證信息',
    '一次性密码', '一次性密碼', '临时密码', '臨時密碼',
    '授权码', '授權碼', '授权密码', '授權密碼',
    '二步验证', '二步驗證', '两步验证', '兩步驗證',
    'mfa', '2fa', 'two-factor', 'multi-factor',
    'passcode', 'pass code', 'secure code', 'security code',
    'tac', 'tan', 'transaction authentication number',
    '验证邮件', '驗證郵件', '确认邮件', '確認郵件',
    '一次性验证码', '一次性驗證碼', '单次有效', '單次有效',
    '临时口令', '臨時口令', '临时验证码', '臨時驗證碼',
];

const PERMANENT_MARKERS = [
    'USER LOCATION IS NOT SUPPORTED',
    'FAILED_PRECONDITION',
    'PAYMENT REQUIRED',
    'INSUFFICIENT CREDITS',
    'INSUFFICIENT_QUOTA',
    'INVALID API KEY',
    'API KEY NOT VALID',
    'PERMISSION DENIED',
];

export type ExtractSource = 'gemini' | 'custom' | 'local';

export interface ExtractResult {
    code?: string;
    source?: ExtractSource;
    reason?: string;
}

export class LlmNetworkError extends Error {
    constructor(
        message: string,
        readonly permanent = false,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'LlmNetworkError';
    }
}

export function desensitizeText(text: string): string {
    return text
        .replace(/&nbsp;|&#160;|\u00a0/gi, ' ')
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '***.***.***.***')
        .replace(/http[s]?:\/\/\S+/g, 'http://****')
        .replace(/\b\d{10,11}\b/g, '**********')
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '****@****.***')
        .replace(/\b\d{13,19}\b/g, '********************');
}

export function containsVerificationKeywords(text: string): boolean {
    const lowered = text.toLowerCase();
    return VERIFICATION_KEYWORDS.some(k => lowered.includes(k.toLowerCase()));
}

export function extractCodeLocal(text: string): string | undefined {
    const cleaned = desensitizeText(text);
    const patterns = [
        /(?:验证码|校验码|确认码|动态码|验证代码|碼|码|code|Code).{0,4}?(\d{4,6})(?:\D|$)/gi,
        /(?:验证码|校验码|确认码|动态码|验证代码|碼|码|code|Code).{0,4}?([0-9a-zA-Z]{4,8})(?:\D|$)/gi,
        /(?<!\d)(\d{4,6})(?!\d)/g,
        /(?<![0-9a-zA-Z])([0-9a-zA-Z]{4,8})(?![0-9a-zA-Z])/g,
    ];
    const skip = new Set(['nbsp', 'http', 'https', 'none', 'null', 'true', 'false']);
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(cleaned)) !== null) {
            const cand = match[1];
            if (!cand || skip.has(cand.toLowerCase())) {
                continue;
            }
            return cand;
        }
    }
    return undefined;
}

function normalizeCode(raw: string | null | undefined): string | undefined {
    if (raw == null) {
        return undefined;
    }
    const value = raw.trim().replace(/^[`"']+|[`"']+$/g, '');
    if (!value || value.toLowerCase() === 'none') {
        return undefined;
    }
    if (value.includes(' ') || value.includes('\n') || value.length > 12) {
        const m = value.match(/[0-9A-Za-z]{4,8}/);
        return m?.[0];
    }
    return value;
}

function splitCsv(raw: string | undefined | null): string[] {
    return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isAiProvider(name: string): name is AiProvider {
    return (SUPPORTED_PROVIDERS as readonly string[]).includes(name);
}

function parseProviders(env: Environment): AiProvider[] {
    const raw = (env.AI_PROVIDER || DEFAULT_AI_PROVIDER).trim();
    const list = splitCsv(raw).map(s => s.toUpperCase());
    const out: AiProvider[] = [];
    for (const item of list) {
        if (!isAiProvider(item)) {
            console.warn(`[extract] 不支持的 AI_PROVIDER: ${item}，已忽略`);
            continue;
        }
        if (!out.includes(item)) {
            out.push(item);
        }
    }
    return out;
}

function isPermanentLlmFailure(status: number | undefined, detail: string): boolean {
    if (status !== undefined && [400, 401, 402, 403].includes(status)) {
        return true;
    }
    const upper = detail.toUpperCase();
    return PERMANENT_MARKERS.some(m => upper.includes(m));
}

/** Gemini: 429 / 地区 / 账号类都应跳过整个 Provider，换模型几乎无意义。 */
function shouldSkipProvider(provider: AiProvider, err: LlmNetworkError): boolean {
    if (err.permanent) {
        return true;
    }
    if (provider === 'GEMINI_OFFICIAL' && err.status === 429) {
        return true;
    }
    return false;
}

interface ChatCompletionResponse {
    choices?: Array<{
        finish_reason?: string;
        message?: { content?: string | null };
    }>;
}

function resolveChatCompletionsUrl(provider: AiProvider, env: Environment): string {
    if (provider === 'GEMINI_OFFICIAL') {
        return `${GEMINI_OPENAI_BASE}chat/completions`;
    }
    let base = (env.CUSTOM_API_BASE || DEFAULT_CUSTOM_BASE).trim().replace(/\/+$/, '');
    if (!base) {
        throw new LlmNetworkError('CUSTOM 缺少 CUSTOM_API_BASE', true);
    }
    if (base.endsWith('/chat/completions')) {
        return base;
    }
    if (!base.endsWith('/v1')) {
        base += '/v1';
    }
    return `${base}/chat/completions`;
}

function resolveApiKey(provider: AiProvider, env: Environment): string {
    const key = provider === 'GEMINI_OFFICIAL'
        ? (env.GEMINI_OFFICIAL_API_KEY || '').trim()
        : (env.CUSTOM_API_KEY || '').trim();
    if (!key) {
        throw new LlmNetworkError(`${provider} 缺少 API_KEY`, true);
    }
    return key;
}

function resolveModels(provider: AiProvider, env: Environment): string[] {
    const raw = provider === 'GEMINI_OFFICIAL'
        ? (env.GEMINI_OFFICIAL_API_MODEL || DEFAULT_GEMINI_MODELS)
        : (env.CUSTOM_API_MODEL || DEFAULT_CUSTOM_MODELS);
    const models = splitCsv(raw);
    if (!models.length) {
        throw new LlmNetworkError(`${provider} 缺少 API_MODEL`, true);
    }
    return models;
}

function maxTokensForModel(model: string): number {
    return model.toLowerCase().includes('gemini-2.5') ? 1024 : 256;
}

function sourceForProvider(provider: AiProvider): ExtractSource {
    return provider === 'GEMINI_OFFICIAL' ? 'gemini' : 'custom';
}

async function chatCompletions(
    provider: AiProvider,
    model: string,
    prompt: string,
    env: Environment,
): Promise<string | undefined> {
    const apiKey = resolveApiKey(provider, env);
    const url = resolveChatCompletionsUrl(provider, env);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
    };
    if (provider === 'CUSTOM') {
        headers['HTTP-Referer'] = 'https://github.com/shengshk/cf-mail2telegram';
        headers['X-Title'] = 'cf-mail2telegram';
    }

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: maxTokensForModel(model),
        }),
    });

    if (!resp.ok) {
        const body = (await resp.text()).slice(0, 500);
        let detail = body;
        try {
            const j = JSON.parse(body) as { error?: { message?: string; status?: string } };
            if (j?.error?.message) {
                detail = j.error.message;
            }
        } catch {
            // keep raw body
        }
        const msg = `${provider}/${model} HTTP ${resp.status}: ${detail}`;
        throw new LlmNetworkError(msg, isPermanentLlmFailure(resp.status, detail), resp.status);
    }

    const data = await resp.json() as ChatCompletionResponse;
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') {
        console.warn(`[extract] ${provider}/${model} 输出被截断(finish_reason=length): ${JSON.stringify(choice.message?.content)}`);
        throw new LlmNetworkError(`${provider}/${model} LLM output truncated`, false, undefined);
    }
    return normalizeCode(choice?.message?.content);
}

/**
 * 有关键词才抽；按 AI_PROVIDER 顺序 × 各 *_API_MODEL 顺序；
 * 永久错误/Gemini 429 跳过整个 Provider；仅全部 LLM 失败才本地正则；
 * 模型明确返回 None/空 不兜底、不换下一 Provider。
 */
export async function extractVerificationCode(text: string, env: Environment): Promise<ExtractResult> {
    if (!text || !containsVerificationKeywords(text)) {
        return { reason: 'no_keywords' };
    }

    const providers = parseProviders(env);
    if (!providers.length) {
        console.warn('[extract] AI_PROVIDER 为空，启用本地正则兜底');
        const code = extractCodeLocal(text);
        return code
            ? { code, source: 'local', reason: 'AI_PROVIDER empty' }
            : { reason: 'local_none_after_error: AI_PROVIDER empty' };
    }

    const promptTemplate = env.PROMPT_TEMPLATE || DEFAULT_PROMPT;
    const prompt = promptTemplate.replace('{input_text}', desensitizeText(text));
    const errors: string[] = [];

    for (const provider of providers) {
        let models: string[];
        try {
            resolveApiKey(provider, env);
            if (provider === 'CUSTOM' && !(env.CUSTOM_API_BASE || DEFAULT_CUSTOM_BASE).trim()) {
                throw new LlmNetworkError('CUSTOM 缺少 CUSTOM_API_BASE', true);
            }
            models = resolveModels(provider, env);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(msg);
            console.warn(`[extract] ${msg}，跳过`);
            continue;
        }

        for (const model of models) {
            try {
                const code = await chatCompletions(provider, model, prompt, env);
                if (code) {
                    console.log(`[extract] ${provider}/${model} 提取成功: ${code}`);
                    return { code, source: sourceForProvider(provider) };
                }
                console.log(`[extract] ${provider}/${model} 返回 None，不进行后续兜底`);
                return { reason: 'llm_none' };
            } catch (e) {
                const err = e instanceof LlmNetworkError
                    ? e
                    : new LlmNetworkError(e instanceof Error ? e.message : String(e), false);
                errors.push(err.message);
                console.warn(`[extract] ${provider}/${model} 调用失败: ${err.message}`);
                if (shouldSkipProvider(provider, err)) {
                    console.warn(`[extract] ${provider} 永久/限流错误，跳过该 Provider 剩余模型`);
                    break;
                }
            }
        }
    }

    const errMsg = errors.join(' | ') || 'all providers failed';
    console.warn(`[extract] 全部 LLM 失败，启用本地正则兜底: ${errMsg}`);
    const code = extractCodeLocal(text);
    if (code) {
        console.log(`[extract] 本地正则提取成功: ${code}`);
        return { code, source: 'local', reason: errMsg };
    }
    return { reason: `local_none_after_error: ${errMsg}` };
}

export function truncateDisplay(text: string, maxLen = 80): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) {
        return t;
    }
    return `${t.slice(0, maxLen)}…`;
}
