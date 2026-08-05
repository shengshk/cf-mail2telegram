import type { EmailCache, Environment } from '../types';
import { Dao } from '../db';
import { resolveTelegram, requireTelegram } from '../env';
import { createTelegramBotAPI } from '../telegram/api';
import {
    attachWebPreviewMeta,
    MAIL_CACHE_MAX,
    TELEGRAM_ID_MAP_TTL_SECONDS,
} from './cache-policy';
import { extractVerificationCode } from './extract';
import { formatMailDate } from './parse';
import { renderEmailListMode } from './render';
import { isWebAuthEnabled } from '../web-auth';

const SUBJECTS = [
    'Login verification',
    'Security code',
    'Confirm your sign-in',
    '一次性验证',
    '账户安全提醒',
];

const TEST_FROM = 'from@test.mail';
const TEST_TO = 'to@test.mail';

const TEST_RATE_PREFIX = 'TEST_CMD_RATE:';
const TEST_RATE_MS = 10_000;

function randInt(max: number): number {
    return Math.floor(Math.random() * max);
}

function pick<T>(arr: T[]): T {
    return arr[randInt(arr.length)]!;
}

function randomOtp(): string {
    return String(100000 + randInt(900000));
}

export function isAllowedTestUser(env: Environment, chatId: number, fromId?: number): boolean {
    const { chatId: allowedRaw } = resolveTelegram(env);
    const allowed = new Set(
        allowedRaw.split(',').map(s => s.trim()).filter(Boolean),
    );
    if (allowed.has(`${chatId}`)) {
        return true;
    }
    if (fromId !== undefined && allowed.has(`${fromId}`)) {
        return true;
    }
    return false;
}

export async function checkTestCommandRate(
    db: Environment['DB'],
    userId: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
    const key = `${TEST_RATE_PREFIX}${userId}`;
    const raw = await db.get(key);
    const now = Date.now();
    if (raw) {
        const last = Number.parseInt(raw, 10);
        if (Number.isFinite(last)) {
            const elapsed = now - last;
            if (elapsed < TEST_RATE_MS) {
                return { ok: false, retryAfterSec: Math.max(1, Math.ceil((TEST_RATE_MS - elapsed) / 1000)) };
            }
        }
    }
    await db.put(key, String(now), { expirationTtl: 60 });
    return { ok: true };
}

/**
 * Fake mail for TG UI: fixed from/to, simulate backedUp → Mailbox uses FORWARD_MAIL.
 * Real Gemini/local OTP; no CF Email Routing forward.
 */
export async function runFakeMailUiTest(env: Environment): Promise<{ mailId: string; code: string }> {
    if (!env.DB) {
        throw new Error('KV binding DB is required');
    }
    const code = randomOtp();
    const from = TEST_FROM;
    const to = TEST_TO;
    const subject = `TEST: ${pick(SUBJECTS)} ${randInt(9999)}`;
    const text = [
        `这是一封 UI 测试邮件（假信，不会真实备份）。`,
        ``,
        `您的验证码是 ${code}，请在 5 分钟内使用。`,
        ``,
        `From: ${from}`,
        `To: ${to}`,
    ].join('\n');
    const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
<p>这是一封 <b>UI 测试邮件</b>（假信，不会真实备份）。</p>
<p>您的验证码是 <b style="font-size:1.25rem">${code}</b>，请在 5 分钟内使用。</p>
<p style="color:#6b7280;font-size:12px">From: ${from}<br>To: ${to}</p>
</div>`;

    const mail: EmailCache = {
        id: crypto.randomUUID(),
        messageId: `<test-${crypto.randomUUID()}@cf-mail2telegram.test>`,
        from,
        to,
        subject,
        date: formatMailDate(undefined, env.TIMEZONE || 'Asia/Shanghai'),
        text,
        html,
        backedUp: true,
    };
    if (!isWebAuthEnabled(env)) {
        attachWebPreviewMeta(mail);
    }

    const extractText = [mail.subject, mail.text].filter(Boolean).join('\n');
    const short = extractText.length <= 3000 ? extractText : `${extractText.slice(0, 3000)}...`;
    const extract = await extractVerificationCode(short, env);

    const dao = new Dao(env.DB);
    await dao.saveMailCacheWithLimit(mail.id, mail, MAIL_CACHE_MAX);

    const { token, chatId } = requireTelegram(env);
    const api = createTelegramBotAPI(token);
    for (const id of chatId.split(',')) {
        const cid = id.trim();
        if (!cid) {
            continue;
        }
        const req = await renderEmailListMode(mail, env, extract, { chatId: cid });
        const msg = await api.sendMessageWithReturns({
            chat_id: cid,
            ...req,
        });
        try {
            await dao.saveTelegramIDToMailID(`${msg.result.message_id}`, mail.id, TELEGRAM_ID_MAP_TTL_SECONDS);
        } catch (e) {
            console.error('[test] saveTelegramIDToMailID failed', e);
        }
    }
    return { mailId: mail.id, code };
}
