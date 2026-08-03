import type { ForwardableEmailMessage, ReadableStream, ReadableWritablePair } from '@cloudflare/workers-types';
import type { RawEmail } from 'postal-mime';
import type { EmailCache, MaxEmailSizePolicy } from '../types';
import { convert } from 'html-to-text';
import PostalMime from 'postal-mime';

function truncateStream(stream: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
    let bytesRead = 0;
    const tran = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
            if (bytesRead >= maxBytes) {
                controller.terminate();
                return;
            }
            const remainingBytes = maxBytes - bytesRead;
            if (chunk.length <= remainingBytes) {
                controller.enqueue(chunk);
                bytesRead += chunk.length;
            } else {
                const limitedChunk = chunk.slice(0, remainingBytes);
                controller.enqueue(limitedChunk);
                bytesRead += remainingBytes;
                controller.terminate();
            }
        },
    }) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
    return stream.pipeThrough(tran);
}

export function formatMailDate(raw: string | null | undefined, timeZone = 'Asia/Shanghai'): string {
    try {
        const d = raw ? new Date(raw) : new Date();
        if (Number.isNaN(d.getTime())) {
            return new Date().toISOString().replace('T', ' ').slice(0, 19);
        }
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).formatToParts(d);
        const get = (type: string) => parts.find(p => p.type === type)?.value || '';
        return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
    } catch {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }
}

export async function parseEmail(
    message: ForwardableEmailMessage,
    maxSize: number,
    maxSizePolicy: MaxEmailSizePolicy,
    useEmlHeaders: boolean = false,
    timeZone = 'Asia/Shanghai',
): Promise<EmailCache> {
    const id = crypto.randomUUID();
    const cache: EmailCache = {
        id,
        messageId: message.headers.get('Message-ID') || id,
        from: message.from,
        to: message.to,
        subject: message.headers.get('Subject') || '',
        date: formatMailDate(message.headers.get('Date'), timeZone),
    };
    const thridHeader = message.headers.get('X-GM-THRID');
    if (thridHeader && /^\d+$/.test(thridHeader.trim())) {
        cache.gmThrid = thridHeader.trim();
    }
    let isTruncate = false;
    let emailRaw = message.raw;
    try {
        switch (message.rawSize > maxSize ? maxSizePolicy : 'continue') {
            case 'unhandled':
                cache.text = `The original size of the email was ${message.rawSize} bytes, which exceeds the maximum size of ${maxSize} bytes.`;
                cache.html = cache.text;
                return cache;
            case 'truncate':
                isTruncate = true;
                emailRaw = truncateStream(message.raw, maxSize);
                break;
            default:
                break;
        }
        const parser = new PostalMime();
        const email = await parser.parse(emailRaw as unknown as RawEmail);
        cache.subject = email.subject || cache.subject;
        if (useEmlHeaders) {
            cache.messageId = email.messageId || cache.messageId;
            cache.from = email.from?.address || cache.from;
            cache.to = email.to?.map(addr => addr.address).at(0) || cache.to;
        }
        if (email.date) {
            const rawDate = typeof email.date === 'string'
                ? email.date
                : (email.date as Date).toISOString();
            cache.date = formatMailDate(rawDate, timeZone);
        }
        cache.html = email.html;
        cache.text = email.text;
        if (cache.html && !cache.text) {
            cache.text = convert(cache.html, {});
        }
        if (isTruncate) {
            cache.text += `\n\n[Truncated] The original size of the email was ${message.rawSize} bytes, which exceeds the maximum size of ${maxSize} bytes.`;
        }
    } catch (e) {
        const msg = `Error parsing email: ${(e as Error).message}`;
        cache.text = msg;
        cache.html = msg;
    }
    return cache;
}
