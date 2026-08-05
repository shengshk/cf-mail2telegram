import type { EmailMessage } from '@cloudflare/workers-types';
import type { Environment } from '../types';
import {
    emailsMatch,
    getForwardTarget,
    isExternallyForwarded,
    normalizeEmailAddress,
    parseForwardMailsValue,
    shouldBackupInboundMail,
} from './forward';

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

function envWith(mails: string): Environment {
    return { FORWARD_MAILS: mails, DB: {} as Environment['DB'] };
}

export async function runForwardTests(): Promise<void> {
    // parse
    assert(parseForwardMailsValue('') === undefined, 'empty');
    assert(parseForwardMailsValue('a@gmail.com')?.email === 'a@gmail.com', 'email only');
    assert(parseForwardMailsValue('a@gmail.com')?.policy === 'noforwarded', 'default policy');
    assert(parseForwardMailsValue('a@gmail.com,Backup')?.folder === 'Backup', 'folder');
    assert(parseForwardMailsValue('a@gmail.com,Backup')?.policy === 'noforwarded', 'folder default policy');
    assert(parseForwardMailsValue('a@gmail.com,forwarded')?.policy === 'forwarded', 'policy as 2nd');
    assert(parseForwardMailsValue('a@gmail.com,forwarded')?.folder === undefined, 'no folder when 2nd is policy');
    assert(parseForwardMailsValue('a@gmail.com,Backup,forwarded')?.folder === 'Backup', '3-part folder');
    assert(parseForwardMailsValue('a@gmail.com,Backup,forwarded')?.policy === 'forwarded', '3-part policy');
    assert(parseForwardMailsValue('a@gmail.com,,noforwarded')?.folder === undefined, 'empty folder');
    assert(parseForwardMailsValue('a@gmail.com,,noforwarded')?.policy === 'noforwarded', 'empty folder policy');

    // gmail +
    assert(normalizeEmailAddress('User+Bak@gmail.com') === 'user@gmail.com', 'gmail plus');
    assert(normalizeEmailAddress('user+2fa@googlemail.com') === 'user@gmail.com', 'googlemail');
    assert(emailsMatch('shengshk+bak@gmail.com', 'shengshk@gmail.com'), 'plus match');
    assert(!emailsMatch('a@gmail.com', 'b@gmail.com'), 'different locals');

    // single target + legacy
    assert(getForwardTarget(envWith('x@y.com,Backup,forwarded'))?.email === 'x@y.com', 'get FORWARD_MAILS');
    assert(
        getForwardTarget({ FORWARD_MAIL: 'old@gmail.com,Label', DB: {} as Environment['DB'] })?.folder === 'Label',
        'legacy FORWARD_MAIL',
    );
    assert(
        getForwardTarget({
            FORWARD_MAILS: 'a@gmail.com',
            FORWARD_MAIL: 'b@gmail.com',
            DB: {} as Environment['DB'],
        })?.email === 'a@gmail.com',
        'FORWARD_MAILS wins',
    );

    // externally forwarded
    assert(
        isExternallyForwarded(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'shengshk@gmail.com' },
        })),
        'gmail auto-forward detected',
    );
    assert(
        !isExternallyForwarded(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'otp@mydomain.com' },
        })),
        'direct to domain',
    );
    assert(
        !isExternallyForwarded(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'other@mydomain.com' },
        })),
        'same domain alias = direct',
    );

    // shouldBackup: noforwarded skips external forward
    const noFwd = envWith('shengshk+bak@gmail.com,Backup,noforwarded');
    assert(
        !shouldBackupInboundMail(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'shengshk@gmail.com' },
        }), noFwd),
        'noforwarded blocks gmail→domain',
    );
    assert(
        shouldBackupInboundMail(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'otp@mydomain.com' },
        }), noFwd),
        'noforwarded allows direct',
    );

    // hard rule B: match backup address even if policy=forwarded
    const allowFwd = envWith('shengshk+bak@gmail.com,Backup,forwarded');
    assert(
        !shouldBackupInboundMail(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'shengshk@gmail.com' },
        }), allowFwd),
        'rule B: To matches backup (+ normalized)',
    );
    assert(
        !shouldBackupInboundMail(mockMessage({
            from: 'shengshk+other@gmail.com',
            to: 'otp@mydomain.com',
            headers: { To: 'otp@mydomain.com' },
        }), allowFwd),
        'rule B: From matches backup',
    );
    assert(
        shouldBackupInboundMail(mockMessage({
            from: 'svc@example.com',
            to: 'otp@mydomain.com',
            headers: { To: 'someone@outlook.com' },
        }), allowFwd),
        'forwarded policy allows unrelated external forward',
    );

    console.log('forward.test: ok');
}
