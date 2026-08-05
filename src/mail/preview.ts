import type { EmailCache, Environment } from '../types';
import { resolveUiLang, htmlLang, t } from '../i18n';

/** Browser tab favicon: envelope only (currentColor → brand green) */
const PREVIEW_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
    + `<path d="M0 0h24v24H0z" fill="none"/>`
    + `<path fill="#3ecf8e" d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h16q.825 0 1.413.588T22 6v12q0 .825-.587 1.413T20 20zm8.263-7.212q.137-.038.262-.113L19.6 8.25q.2-.125.3-.312t.1-.413q0-.5-.425-.75T18.7 6.8L12 11L5.3 6.8q-.45-.275-.875-.012T4 7.525q0 .25.1.438t.3.287l7.075 4.425q.125.075.263.113t.262.037t.263-.037"/>`
    + `</svg>`,
);

const PREVIEW_FAVICON_LINK = `<link rel="icon" href="${PREVIEW_FAVICON}" />`;

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
.mail-canvas a{color:#2563eb;text-decoration:underline;word-break:break-all}
`.trim();

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const BARE_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

function splitUrlTrail(raw: string): { url: string; trail: string } {
    const url = raw.replace(/[),.;:!?]+$/g, '');
    return { url, trail: raw.slice(url.length) };
}

/** Escape plain text and wrap bare http(s) URLs as anchors */
export function linkifyAndEscapeText(text: string): string {
    let out = '';
    let last = 0;
    BARE_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BARE_URL_RE.exec(text))) {
        out += escapeHtml(text.slice(last, m.index));
        const { url, trail } = splitUrlTrail(m[0]);
        if (url) {
            const href = escapeHtml(url);
            out += `<a href="${href}" rel="noopener noreferrer" target="_blank">${href}</a>${escapeHtml(trail)}`;
        } else {
            out += escapeHtml(m[0]);
        }
        last = m.index + m[0].length;
    }
    out += escapeHtml(text.slice(last));
    return out;
}

/** Wrap bare URLs in HTML text nodes (skip existing <a>…</a>) */
function linkifyHtmlDocument(html: string): string {
    return html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi).map((part) => {
        if (/^<a\b/i.test(part)) {
            return part;
        }
        return part.replace(/(<[^>]+>)|([^<]+)/g, (chunk, tag: string | undefined, text: string | undefined) => {
            if (tag) {
                return tag;
            }
            const raw = text || '';
            BARE_URL_RE.lastIndex = 0;
            return raw.replace(BARE_URL_RE, (match) => {
                const { url, trail } = splitUrlTrail(match);
                if (!url) {
                    return match;
                }
                const href = url.replace(/"/g, '&quot;');
                return `<a href="${href}" rel="noopener noreferrer" target="_blank">${url}</a>${trail}`;
            });
        });
    }).join('');
}

/** 轻量消毒：去掉危险标签/事件，保留原排版与颜色；正文裸 URL 可点 */
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
    html = linkifyHtmlDocument(html);
    if (html.length > maxLength) {
        html = `${html.slice(0, maxLength)}…`;
    }
    return html;
}

export function buildPreviewBodyHtml(mail: EmailCache): string {
    if (mail.html?.trim()) {
        return sanitizeHtmlForPreview(mail.html);
    }
    return `<pre style="white-space:pre-wrap;margin:0">${linkifyAndEscapeText(mail.text || '')}</pre>`;
}

export interface WebPreviewBarOptions {
    /** Unix ms when unauthenticated link expires; omit when WEB_USER auth mode */
    linkExpiresAt?: number;
    /** Show logout link (WEB_USER mode) */
    showLogout?: boolean;
}

/** Web page; optional live countdown for token mode; logout when auth mode */
export function renderPreviewPage(
    mail: EmailCache,
    bodyHtml: string,
    env?: Environment,
    webBar?: WebPreviewBarOptions,
): string {
    const lang = resolveUiLang(env || {});
    const subject = escapeHtml(mail.subject || t(lang, 'noSubjectShort'));
    const sender = escapeHtml(mail.from || '');
    const recipient = escapeHtml(mail.to || '');
    const when = escapeHtml(mail.date || '');
    const title = escapeHtml(t(lang, 'previewTitle'));
    const canvas = bodyHtml.trim()
        ? bodyHtml
        : `<pre style="white-space:pre-wrap;margin:0">${escapeHtml(mail.text || '')}</pre>`;

    const logoutHtml = webBar?.showLogout
        ? `<a class="out" href="/logout?next=${encodeURIComponent(`/email/${mail.id}`)}">${escapeHtml(t(lang, 'logout'))}</a>`
        : '';

    const useCountdown = !!(webBar?.linkExpiresAt && webBar.linkExpiresAt > 0);
    const countdownLabels = JSON.stringify({
        title: t(lang, 'previewTitle'),
        remain: t(lang, 'linkRemainLabel'),
        expired: t(lang, 'linkExpiredLabel'),
        day: t(lang, 'durationDay'),
        hour: t(lang, 'durationHour'),
        minute: t(lang, 'durationMinute'),
        second: t(lang, 'durationSecond'),
    }).replace(/</g, '\\u003c');
    const expiresAt = webBar?.linkExpiresAt ?? 0;
    const countdownScript = useCountdown
        ? `<script>(function(){
  var el=document.getElementById('preview-bar-text');
  var L=${countdownLabels};
  var exp=${expiresAt};
  function fmt(ms){
    if(ms<=0) return L.title+' · '+L.expired;
    var s=Math.floor(ms/1000);
    var d=Math.floor(s/86400); s%=86400;
    var h=Math.floor(s/3600); s%=3600;
    var m=Math.floor(s/60); s%=60;
    var parts=[];
    if(d) parts.push(d+L.day);
    if(h||d) parts.push(h+L.hour);
    if(m||h||d) parts.push(m+L.minute);
    parts.push(s+L.second);
    return L.title+' · '+L.remain+' '+parts.join('');
  }
  function tick(){
    if(!el) return;
    var left=exp-Date.now();
    el.textContent=fmt(left);
    if(left<=0) return;
    setTimeout(tick,1000);
  }
  tick();
})();</script>`
        : '';

    const barLeft = useCountdown
        ? `<span id="preview-bar-text">${title}</span>`
        : `<span>${title}</span>`;

    return `<!doctype html><html lang="${htmlLang(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
${PREVIEW_FAVICON_LINK}
<title>${subject}</title><style>${PREVIEW_CSS}
a.out{color:#4b5563;font-size:.8125rem;text-decoration:none}
a.out:hover{color:#111827;text-decoration:underline}
</style></head>
<body>
<div class="preview">
  <div class="preview-bar">${barLeft}${logoutHtml}</div>
  <div class="preview-sheet">
    <div class="preview-meta">
      <h1>${subject}</h1>
      <div class="meta">${escapeHtml(t(lang, 'previewFrom'))} ${sender}<br>${escapeHtml(t(lang, 'previewTo'))} ${recipient}${when ? `<br>${when}` : ''}</div>
    </div>
    <div class="mail-canvas">${canvas}</div>
  </div>
</div>
${countdownScript}
</body></html>`;
}

/** Mini App shell: same light CSS; loads content via TMA-authenticated API */
export function renderPreviewMiniAppShell(mailId: string, env?: Environment): string {
    const lang = resolveUiLang(env || {});
    const title = escapeHtml(t(lang, 'previewTitle'));
    const loading = escapeHtml(t(lang, 'previewLoading'));
    const authRequired = escapeHtml(t(lang, 'previewAuthRequired'));
    const fromLabel = escapeHtml(t(lang, 'previewFrom'));
    const toLabel = escapeHtml(t(lang, 'previewTo'));
    const idJson = JSON.stringify(mailId);
    const labelsJson = JSON.stringify({
        from: t(lang, 'previewFrom'),
        to: t(lang, 'previewTo'),
        expired: t(lang, 'previewExpired'),
        denied: t(lang, 'previewDenied'),
        authRequired: t(lang, 'previewAuthRequired'),
    }).replace(/</g, '\\u003c');

    return `<!doctype html><html lang="${htmlLang(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
${PREVIEW_FAVICON_LINK}
<title>${title}</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>${PREVIEW_CSS}
.status{padding:2.5rem 1.25rem;text-align:center;color:#6b7280;font-size:.9375rem}
</style></head>
<body>
<div id="root"><div class="status">${loading}</div></div>
<script>
(function(){
  var mailId=${idJson};
  var L=${labelsJson};
  var root=document.getElementById('root');
  function show(msg){ root.innerHTML='<div class="status">'+msg+'</div>'; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function paint(d){
    var when=d.date?('<br>'+esc(d.date)):'';
    root.innerHTML='<div class="preview"><div class="preview-bar"><span>${title}</span></div>'
      +'<div class="preview-sheet"><div class="preview-meta"><h1>'+esc(d.subject)+'</h1>'
      +'<div class="meta">${fromLabel} '+esc(d.from)+'<br>${toLabel} '+esc(d.to)+when+'</div></div>'
      +'<div class="mail-canvas">'+(d.bodyHtml||'')+'</div></div></div>';
    document.title=d.subject||'${title}';
  }
  try{
    var tg=window.Telegram&&window.Telegram.WebApp;
    if(tg){ tg.ready(); try{ tg.expand(); }catch(e){} }
    var initData=tg&&tg.initData;
    if(!initData){ show('${authRequired}'); return; }
    fetch('/api/email/'+encodeURIComponent(mailId),{
      headers:{ 'Authorization':'tma '+initData }
    }).then(function(r){
      if(r.status===401||r.status===403) throw new Error(L.denied);
      if(r.status===404) throw new Error(L.expired);
      if(!r.ok) throw new Error(L.denied);
      return r.json();
    }).then(paint).catch(function(e){ show(esc(e.message||L.denied)); });
  }catch(e){ show('${authRequired}'); }
})();
</script>
</body></html>`;
}

/** Main Mini App empty state when no cached mail */
export function renderPreviewEmptyMiniApp(env?: Environment): string {
    const lang = resolveUiLang(env || {});
    const title = escapeHtml(t(lang, 'previewTitle'));
    const msg = escapeHtml(t(lang, 'previewNoMail')).replace(/\n/g, '<br>');
    return `<!doctype html><html lang="${htmlLang(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
${PREVIEW_FAVICON_LINK}
<title>${title}</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>${PREVIEW_CSS}
.status{padding:2.5rem 1.25rem;text-align:center;color:#6b7280;font-size:.9375rem;line-height:1.6;white-space:pre-wrap}
</style></head>
<body>
<div class="status">${msg}</div>
<script>
(function(){
  var tg=window.Telegram&&window.Telegram.WebApp;
  if(tg){ try{ tg.ready(); tg.expand(); }catch(e){} }
})();
</script>
</body></html>`;
}
