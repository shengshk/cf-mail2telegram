import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { ExtractResult } from '../../mail/extract';
import type { BlockPolicy, EmailCache, Environment } from '../../types';
import { Dao } from '../../db';
import { requireTelegram } from '../../env';
import { extractVerificationCode, isMessageBlock, parseEmail, renderEmailListMode } from '../../mail';
import { createTelegramBotAPI } from '../../telegram';

export async function sendMailToTelegram(mail: EmailCache, env: Environment, extract?: ExtractResult): Promise<number[]> {
    const { token, chatId } = requireTelegram(env);
    const req = await renderEmailListMode(mail, env, extract);
    const api = createTelegramBotAPI(token);
    const messageID: number[] = [];
    for (const id of chatId.split(',')) {
        const cid = id.trim();
        if (!cid) {
            continue;
        }
        const msg = await api.sendMessageWithReturns({
            chat_id: cid,
            ...req,
        });
        messageID.push(msg.result.message_id);
    }
    return messageID;
}

export async function emailHandler(message: ForwardableEmailMessage, env: Environment): Promise<void> {
    const {
        FORWARD_LIST,
        BLOCK_POLICY,
        GUARDIAN_MODE,
        DB,
        MAIL_TTL,
        MAX_EMAIL_SIZE,
        MAX_EMAIL_SIZE_POLICY,
        TIMEZONE,
    } = env;

    if (!DB) {
        console.error('[mail] KV 绑定 DB 缺失：去 Worker → 绑定，添加 KV，变量名必须是 DB');
    }
    const dao = new Dao(DB);
    const id = message.headers.get('Message-ID')?.trim() || crypto.randomUUID();
    const isBlock = await isMessageBlock(message, env);
    const isGuardian = GUARDIAN_MODE === 'true';
    const blockPolicy: BlockPolicy[] = (BLOCK_POLICY || 'telegram').split(',') as BlockPolicy[];
    const statusTTL = 60 * 60;
    const status = await dao.loadMailStatus(id, isGuardian);

    if (isBlock && blockPolicy.includes('reject')) {
        message.setReject('Blocked');
        return;
    }

    try {
        const blockForward = isBlock && blockPolicy.includes('forward');
        const forwardList = blockForward ? [] : (FORWARD_LIST || '').split(',');
        for (const forward of forwardList) {
            try {
                const add = forward.trim();
                if (status.forward.includes(add)) {
                    continue;
                }
                await message.forward(add);
                if (isGuardian) {
                    status.forward.push(add);
                    await dao.saveMailStatus(id, status, statusTTL);
                }
            } catch (e) {
                console.error(e);
            }
        }
    } catch (e) {
        console.error(e);
    }

    try {
        const blockTelegram = isBlock && blockPolicy.includes('telegram');
        if (!status.telegram && !blockTelegram) {
            const ttl = Number.parseInt(MAIL_TTL, 10) || 60 * 60 * 24;
            const maxSize = Number.parseInt(MAX_EMAIL_SIZE || '', 10) || 512 * 1024;
            const maxSizePolicy = MAX_EMAIL_SIZE_POLICY || 'truncate';
            const mail = await parseEmail(message, maxSize, maxSizePolicy, false, TIMEZONE || 'Asia/Shanghai');
            const extractText = [mail.subject, mail.text].filter(Boolean).join('\n');
            const short = extractText.length <= 3000 ? extractText : `${extractText.slice(0, 3000)}...`;
            const extract = await extractVerificationCode(short, env);
            // 先发 TG：KV 写失败不应挡住推送（预览依赖 cache，失败仅影响预览/回溯）
            try {
                await dao.saveMailCache(mail.id, mail, ttl);
            } catch (e) {
                console.error('[mail] saveMailCache failed', e);
            }
            const msgIDs = await sendMailToTelegram(mail, env, extract);
            for (const msgID of msgIDs) {
                try {
                    await dao.saveTelegramIDToMailID(`${msgID}`, mail.id, ttl);
                } catch (e) {
                    console.error('[mail] saveTelegramIDToMailID failed', e);
                }
            }
        }
        if (isGuardian) {
            status.telegram = true;
            await dao.saveMailStatus(id, status, statusTTL);
        }
    } catch (e) {
        console.error(e);
    }
}
