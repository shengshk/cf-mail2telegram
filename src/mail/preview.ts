import type { EmailCache, Environment } from '../types';
import { resolveUiLang, htmlLang, t } from '../i18n';

const PREVIEW_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
background:#f0f1f3;color:#1f2937;-webkit-font-smoothing:antialiased}
.preview{max-width:820px;margin:0 auto;padding:1.25rem 1rem 2.5rem}
.preview-bar{display:flex;justify-content:space-between;align-items:center;gap:1rem;
padding:.35rem 0 1rem;margin-bottom:1rem;border-bottom:1px solid #e5e7eb;
font-size:.8125rem;color:#6b7280;letter-spacing:.01em}
.preview-sheet{background:#fff;border:1px solid #e5e7eb;border-radius:12px;
box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);overflow:hidden}
.preview-meta{padding:1.25rem 1.5rem;background:#fff;border-bottom:1px solid #eceef1}
.preview-meta h1{margin:0 0 .65rem;font-size:1.2rem;font-weight:650;color:#111827;letter-spacing:-.01em;
line-height:1.35;word-break:break-word}
.meta{color:#6b7280;font-size:.8125rem;line-height:1.65;margin:0}
.mail-canvas{background:#fff;color:#111;padding:1.5rem;overflow-x:auto}
.mail-canvas img{max-width:100%;height:auto}
`.trim();

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 轻量消毒：去掉危险标签/事件，保留原排版与颜色 */
export function sanitizeHtmlForPreview(rawHtml: string, maxLength = 200000): string {
    let html = rawHtml
        .replace(/<(script|iframe|object|embed|form|meta|link|base|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(script|iframe|object|embed|form|meta|link|base|style)\b[^>]*\/?>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
        .replace(/\s(href|src|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '')
        .replace(/<img\b([^>]*?)>/gi, (_m, attrs: string) => {
            if (/referrerpolicy=/i.test(attrs)) {
                return `<img${attrs}>`;
            }
            return `<img referrerpolicy="no-referrer"${attrs}>`;
        });
    if (html.length > maxLength) {
        html = `${html.slice(0, maxLength)}…`;
    }
    return html;
}

export function renderPreviewPage(mail: EmailCache, bodyHtml: string, env?: Environment): string {
    const lang = resolveUiLang(env || {});
    const subject = escapeHtml(mail.subject || t(lang, 'noSubjectShort'));
    const sender = escapeHtml(mail.from || '');
    const recipient = escapeHtml(mail.to || '');
    const when = escapeHtml(mail.date || '');
    const canvas = bodyHtml.trim()
        ? bodyHtml
        : `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(mail.text || '')}</pre>`;

    return `<!doctype html><html lang="${htmlLang(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${subject}</title><style>${PREVIEW_CSS}</style></head>
<body>
<div class="preview">
  <div class="preview-bar"><span>${escapeHtml(t(lang, 'previewTitle'))}</span></div>
  <div class="preview-sheet">
    <div class="preview-meta">
      <h1>${subject}</h1>
      <div class="meta">${escapeHtml(t(lang, 'previewFrom'))} ${sender}<br>${escapeHtml(t(lang, 'previewTo'))} ${recipient}${when ? `<br>${when}` : ''}</div>
    </div>
    <div class="mail-canvas">${canvas}</div>
  </div>
</div>
</body></html>`;
}
