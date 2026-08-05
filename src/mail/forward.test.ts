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
import { mailboxButtonUrl } from './mailbox';
import { isWebLinkValid, MAIL_CACHE_MAX, WEB_LINK_TTL_MS, attachWebPreviewMeta, webPreviewUrl } from './cache-policy';
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

function envWith(mails?: string): Environment {
    return {
        FORWARD_MAIL: mails,
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

    assert(getForwardTarget(envWith('x@y.com,Backup,forwarded'))?.email === 'x@y.com', 'get FORWARD_MAIL');
    assert(getForwardTarget(envWith()) === undefined, 'no FORWARD_MAIL');

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

    // cache / web link
    assert(MAIL_CACHE_MAX === 100, 'cache max');
    assert(WEB_LINK_TTL_MS === 86400000, 'web link 1d');
    const linkMail: EmailCache = {
        id: 'w1',
        messageId: 'w1',
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'x',
    };
    attachWebPreviewMeta(linkMail, 1_000_000);
    assert(!!linkMail.webToken && linkMail.webExpiresAt === 1_000_000 + WEB_LINK_TTL_MS, 'attach web meta');
    assert(isWebLinkValid(linkMail, linkMail.webToken, 1_000_000 + 1000), 'web valid');
    assert(!isWebLinkValid(linkMail, 'bad', 1_000_000 + 1000), 'web bad token');
    assert(!isWebLinkValid(linkMail, linkMail.webToken, linkMail.webExpiresAt), 'web expired');
    assert(
        webPreviewUrl('h.example', linkMail, { authEnabled: true }) === `https://h.example/email/${linkMail.id}`,
        'auth url no token',
    );
    assert(
        !!webPreviewUrl('h.example', linkMail)?.includes('?t='),
        'open url has token',
    );

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
