import type { Environment } from '../types';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

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

export type ExtractSource = 'gemini' | 'local';

export interface ExtractResult {
    code?: string;
    source?: ExtractSource;
    reason?: string;
}

export class LlmNetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LlmNetworkError';
    }
}

export function desensitizeText(text: string): string {
    return text
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
    for (const pattern of patterns) {
        const match = pattern.exec(cleaned);
        if (match?.[1]) {
            return match[1];
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

interface ChatCompletionResponse {
    choices?: Array<{
        finish_reason?: string;
        message?: { content?: string | null };
    }>;
}

export async function extractCodeGemini(text: string, env: Environment): Promise<string | undefined> {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new LlmNetworkError('GEMINI_API_KEY 未配置');
    }
    if (apiKey.startsWith('sk-')) {
        console.warn('[extract] GEMINI_API_KEY 以 sk- 开头，官方 Gemini 请用 AIza...');
    }

    const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const promptTemplate = env.PROMPT_TEMPLATE || DEFAULT_PROMPT;
    const prompt = promptTemplate.replace('{input_text}', desensitizeText(text));
    // gemini-2.5* thinking 计入 max_tokens，过小会截断成半截码
    const maxTokens = model.toLowerCase().includes('gemini-2.5') ? 1024 : 256;

    const resp = await fetch(`${GEMINI_BASE_URL}chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: maxTokens,
        }),
    });

    if (!resp.ok) {
        const body = (await resp.text()).slice(0, 300);
        throw new LlmNetworkError(`Gemini API ${resp.status}: ${body}`);
    }

    const data = await resp.json() as ChatCompletionResponse;
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') {
        console.warn(`[extract] Gemini 输出被截断(finish_reason=length): ${JSON.stringify(choice.message?.content)}`);
        throw new LlmNetworkError('LLM output truncated');
    }
    return normalizeCode(choice?.message?.content);
}

/**
 * 对齐 Docker 范本：有关键词才抽；先 Gemini；仅网络/API 失败才本地兜底；
 * 模型返回 None/空 不兜底。
 */
export async function extractVerificationCode(text: string, env: Environment): Promise<ExtractResult> {
    if (!text || !containsVerificationKeywords(text)) {
        return { reason: 'no_keywords' };
    }
    try {
        const code = await extractCodeGemini(text, env);
        if (code) {
            console.log(`[extract] gemini 提取成功: ${code}`);
            return { code, source: 'gemini' };
        }
        console.log('[extract] gemini 返回 None，不进行本地兜底');
        return { reason: 'llm_none' };
    } catch (e) {
        if (!(e instanceof LlmNetworkError)) {
            console.warn(`[extract] gemini 调用异常，启用本地正则兜底: ${(e as Error).message}`);
        } else {
            console.warn(`[extract] gemini 调用失败，启用本地正则兜底: ${e.message}`);
        }
        const code = extractCodeLocal(text);
        if (code) {
            console.log(`[extract] 本地正则提取成功: ${code}`);
            return { code, source: 'local' };
        }
        return { reason: 'local_none_after_error' };
    }
}

export function truncateDisplay(text: string, maxLen = 80): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) {
        return t;
    }
    return `${t.slice(0, maxLen)}…`;
}
