import type { EmailMessage } from '@cloudflare/workers-types';
import type { Environment } from '../types';
import {
    emailsMatch,
    getForwardTarget,
    isExternallyForwarded,
    normalizeEmailAddress,
    parseForwardMailsValue,
    pickOriginalMailboxAddress,
    shouldBackupInboundMail,
} from './forward';
import { parseDurationToSeconds, parseMailsTtl } from './ttl';
import { mailboxButtonUrl } from './mailbox';
import type { EmailCache } from '../types';

function assert(cond: unknown, msg: string): void {
    if (!cond) {
        throw new Error(msg);
    }
}

function mockMessage(partial: {
    from: string;
    to: string;
    headers?: Record<string, string>;
}): EmailMessage {
    const headers = new Headers(partial.headers || {});
    return {
        from: partial.from,
        to: partial.to,
        headers,
    } as unknown as EmailMessage;
}

function envWith(mails?: string, ttl?: string): Environment {
    return {
        FORWARD_MAILS: mails,
        MAILS_TTL: ttl,
        DB: {} as Environment['DB'],
    };
}

export async function runForwardTests(): Promise<void> {
    assert(parseForwardMailsValue('') === undefined, 'empty');
    assert(parseForwardMailsValue('a@gmail.com')?.email === 'a@gmail.com', 'email only');
    assert(parseForwardMailsValue('a@gmail.com')?.policy === 'noforwarded', 'default policy');
    assert(parseForwardMailsValue('a@gmail.com,Backup')?.folder === 'Backup', 'folder');
    assert(parseForwardMailsValue('a@gmail.com,forwarded')?.policy === 'forwarded', 'policy as 2nd');
    assert(parseForwardMailsValue('a@gmail.com,Backup,forwarded')?.folder === 'Backup', '3-part folder');

    assert(normalizeEmailAddress('User+Bak@gmail.com') === 'user@gmail.com', 'gmail plus');
    assert(emailsMatch('shengshk+bak@gmail.com', 'shengshk@gmail.com'), 'plus match');

    assert(getForwardTarget(envWith('x@y.com,Backup,forwarded'))?.email === 'x@y.com', 'get FORWARD_MAILS');
    assert(getForwardTarget(envWith()) === undefined, 'no FORWARD_MAILS');

    assert(
        isExternallyForwarded(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'shengshk@gmail.com' },
        })),
        'gmail auto-forward detected',
    );

    const msgFwd = mockMessage({
        from: 'svc@example.com',
        to: 'otp@mydomain.com',
        headers: { To: 'shengshk@gmail.com' },
    });
    assert(pickOriginalMailboxAddress(msgFwd) === 'shengshk@gmail.com', 'original To');

    const noFwd = envWith('shengshk+bak@gmail.com,Backup,noforwarded');
    assert(!shouldBackupInboundMail(msgFwd, noFwd), 'noforwarded blocks gmail→domain');
    assert(
        shouldBackupInboundMail(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'otp@mydomain.com' },
        }), noFwd),
        'noforwarded allows direct',
    );

    // ttl
    assert(parseDurationToSeconds('1d') === 86400, '1d');
    assert(parseDurationToSeconds('24h') === 86400, '24h');
    assert(parseDurationToSeconds('30m') === 1800, '30m');
    assert(parseDurationToSeconds('90') === 90, 'seconds');
    assert(parseMailsTtl('1d,10').ttlSeconds === 86400, 'ttl part');
    assert(parseMailsTtl('1d,10').maxCount === 10, 'count part');
    assert(parseMailsTtl('').maxCount === 100, 'default count');
    assert(parseMailsTtl('1h').ttlSeconds === 3600, 'time only keeps default count');

    // mailbox button
    const backupMail: EmailCache = {
        id: '1',
        messageId: '1',
        from: 'a@b.com',
        to: 'otp@mydomain.com',
        subject: 'x',
        backedUp: true,
    };
    const urlBackup = mailboxButtonUrl(backupMail, envWith('you@gmail.com,Backup,noforwarded'));
    assert(urlBackup?.includes('mail.google.com') && urlBackup.includes('Backup'), 'backed up → Backup label');

    const noBackupMail: EmailCache = {
        id: '2',
        messageId: '2',
        from: 'a@b.com',
        to: 'otp@mydomain.com',
        subject: 'x',
        backedUp: false,
        originalTo: 'shengshk@gmail.com',
    };
    const urlOrig = mailboxButtonUrl(noBackupMail, envWith('you@gmail.com,Backup,noforwarded'));
    assert(urlOrig?.includes('mail.google.com') && !urlOrig.includes('Backup'), 'not backed up → original gmail home');

    assert(
        mailboxButtonUrl({
            id: '3',
            messageId: '3',
            from: 'a@b.com',
            to: 'otp@mydomain.com',
            subject: 'x',
            backedUp: false,
        }, envWith('you@gmail.com,Backup')) === undefined,
        'no originalTo → hide mailbox',
    );

    console.log('forward.test: ok');
}
