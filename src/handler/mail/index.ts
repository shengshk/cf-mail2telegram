import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { ExtractResult } from '../../mail/extract';
import type { BlockPolicy, EmailCache, Environment } from '../../types';
import { Dao } from '../../db';
import { requireTelegram } from '../../env';
import {
    extractVerificationCode,
    getForwardTarget,
    isMessageBlock,
    parseEmail,
    pickOriginalMailboxAddress,
    renderEmailListMode,
    shouldBackupInboundMail,
} from '../../mail';
import {
    attachWebPreviewMeta,
    MAIL_CACHE_MAX,
    TELEGRAM_ID_MAP_TTL_SECONDS,
} from '../../mail/cache-policy';
import { createTelegramBotAPI } from '../../telegram';

export async function sendMailToTelegram(mail: EmailCache, env: Environment, extract?: ExtractResult): Promise<number[]> {
    const { token, chatId } = requireTelegram(env);
    const api = createTelegramBotAPI(token);
    const messageID: number[] = [];
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
        messageID.push(msg.result.message_id);
    }
    return messageID;
}

export async function emailHandler(message: ForwardableEmailMessage, env: Environment): Promise<void> {
    const {
        BLOCK_POLICY,
        GUARDIAN_MODE,
        DB,
        MAX_EMAIL_SIZE,
        MAX_EMAIL_SIZE_POLICY,
        TIMEZONE,
    } = env;

    if (!DB) {
        console.error('[mail] KV binding DB missing: Worker → Bindings → KV, variable name must be DB');
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

    let backedUp = false;
    try {
        const blockForward = isBlock && blockPolicy.includes('forward');
        const backupTo = getForwardTarget(env)?.email;
        if (!blockForward && backupTo && !status.forward.includes(backupTo) && shouldBackupInboundMail(message, env)) {
            try {
                await message.forward(backupTo);
                backedUp = true;
                if (isGuardian) {
                    status.forward.push(backupTo);
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
            const maxSize = Number.parseInt(MAX_EMAIL_SIZE || '', 10) || 512 * 1024;
            const maxSizePolicy = MAX_EMAIL_SIZE_POLICY || 'truncate';
            const mail = await parseEmail(message, maxSize, maxSizePolicy, false, TIMEZONE || 'Asia/Shanghai');
            mail.backedUp = backedUp;
            const originalTo = pickOriginalMailboxAddress(message);
            if (originalTo) {
                mail.originalTo = originalTo;
            }
            attachWebPreviewMeta(mail);
            const extractText = [mail.subject, mail.text].filter(Boolean).join('\n');
            const short = extractText.length <= 3000 ? extractText : `${extractText.slice(0, 3000)}...`;
            const extract = await extractVerificationCode(short, env);
            try {
                await dao.saveMailCacheWithLimit(mail.id, mail, MAIL_CACHE_MAX);
            } catch (e) {
                console.error('[mail] saveMailCache failed', e);
            }
            const msgIDs = await sendMailToTelegram(mail, env, extract);
            for (const msgID of msgIDs) {
                try {
                    await dao.saveTelegramIDToMailID(`${msgID}`, mail.id, TELEGRAM_ID_MAP_TTL_SECONDS);
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
