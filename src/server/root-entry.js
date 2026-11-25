import { oauthLocale, loginCsp } from './oauth-locale.js';

/**
 * Root entry cooperation with whatever owns exact "/".
 *
 * The plugin never registers "/" on hosts that run the official remote-connection
 * gateway. Instead a `webserver/request` middleware watches the root response:
 * - the official 401 sign-in page (HTML) gains a Feishu card next to the Token
 *   form and the pairing button; nothing of the official page is removed;
 * - a bare 401 on "/" (no sign-in page at all) is replaced by the Feishu login
 *   page, so a host without remote-connection still offers an entry.
 * Every other response passes through untouched, so registration order and the
 * official routes are never affected.
 */

const MARKER = 'data-feishu-oauth-entry';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/** Styles matching the official card language (light-dark tokens, 44px controls). */
export const entryStyles = `.feishu-oauth-entry{display:flex;flex-direction:column;gap:12px}.feishu-oauth-entry h2{margin:0;font-size:14px;line-height:1.5;font-weight:500}.feishu-oauth-entry a.feishu-oauth-button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:8px 12px;border-radius:8px;font-size:14px;line-height:1.5;font-weight:500;text-decoration:none;color:light-dark(#fff,#222);background:light-dark(#3370ff,#679efe)}@media(hover:hover){.feishu-oauth-entry a.feishu-oauth-button:hover{background:light-dark(#2b5fd9,#8ab4ff)}}`;

/** The Feishu card inserted into the official sign-in page. */
export function entryCard(text) {
  return `<section class="feishu-oauth-entry" ${MARKER} aria-labelledby="feishu-oauth-title"><h2 id="feishu-oauth-title">${escapeHtml(text.feishuName)}</h2><p class="hint">${escapeHtml(text.subtitle)}</p><a class="feishu-oauth-button" href="/auth/feishu/start">${escapeHtml(text.signIn)}</a><p class="hint">${escapeHtml(text.accessNote)}</p></section>`;
}

/**
 * Add the Feishu card to the official sign-in HTML. Returns the input unchanged
 * when the layout is not recognised or the card is already present, so an
 * unexpected official page is never broken.
 */
export function injectEntry(html, text) {
  if (typeof html !== 'string' || html.includes(MARKER)) return html;
  const card = entryCard(text);
  let out;
  const methods = '<div class="methods">';
  const at = html.indexOf(methods);
  if (at !== -1) {
    out = html.slice(0, at + methods.length) + card + html.slice(at + methods.length);
  } else {
    const close = html.lastIndexOf('</section>');
    if (close === -1) return html;
    out = html.slice(0, close) + `<div class="methods">${card}</div>` + html.slice(close);
  }
  const head = out.indexOf('</head>');
  return head === -1 ? out : out.slice(0, head) + `<style>${entryStyles}</style>` + out.slice(head);
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return Array.isArray(value) ? value.join(', ') : value;
  return undefined;
}

function withoutLength(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers ?? {})) if (key.toLowerCase() !== 'content-length') out[key] = value;
  return out;
}

/** Root requests eligible for the entry: plain GET "/" without token or QR exchange. */
function eligible(req) {
  if (req.method !== 'GET') return false;
  let url;
  try { url = new URL(req.url ?? '/', 'http://dsh.invalid'); } catch { return false; }
  return url.pathname === '/' && !url.searchParams.has('token') && url.searchParams.get('login') !== 'qr';
}

/**
 * `webserver/request` waterfall listener. Holds back only a 401 root response,
 * then either augments the official HTML or replaces a bare 401 with the
 * Feishu login page. All original response methods are restored afterwards.
 */
export function createRootEntry() {
  return async function feishuRootEntry(req, res, next) {
    if (!eligible(req)) return next();
    const text = oauthLocale(req.headers?.['accept-language']);
    const names = ['writeHead', 'flushHeaders', 'write', 'end'];
    const saved = names.map(name => [name, Object.hasOwn(res, name), res[name]]);
    const restore = () => { for (const [name, own, fn] of saved) { if (own) res[name] = fn; else delete res[name]; } };
    const original = Object.fromEntries(saved.map(([name, , fn]) => [name, fn]));
    let held;
    const chunks = [];
    const collect = (chunk, encoding) => {
      if (chunk === undefined || chunk === null || typeof chunk === 'function') return;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8') : Buffer.from(chunk));
    };
    res.writeHead = function (status, ...rest) {
      const headers = rest.find(value => value && typeof value === 'object');
      if (status === 401) {
        const type = headerValue(headers, 'content-type');
        if (type === undefined || /^text\/html\b/i.test(type)) {
          held = { status, headers: headers ?? {}, html: type !== undefined && /^text\/html\b/i.test(type) };
          return this;
        }
      }
      restore();
      return original.writeHead.call(this, status, ...rest);
    };
    // The webserver flushes headers right after writeHead; while the response is
    // held, flushing must not trigger node's implicit 200 head.
    res.flushHeaders = function () {
      if (held) return;
      restore();
      return original.flushHeaders?.call(this);
    };
    res.write = function (chunk, encoding, callback) {
      if (!held) { restore(); return original.write.call(this, chunk, encoding, callback); }
      collect(chunk, encoding);
      const done = typeof encoding === 'function' ? encoding : callback;
      if (typeof done === 'function') queueMicrotask(done);
      return true;
    };
    res.end = function (chunk, encoding, callback) {
      if (!held) { restore(); return original.end.call(this, chunk, encoding, callback); }
      collect(chunk, encoding);
      const done = [chunk, encoding, callback].find(value => typeof value === 'function');
      const state = held;
      held = undefined;
      restore();
      let status = state.status, headers = withoutLength(state.headers), body = Buffer.concat(chunks);
      if (state.html) {
        // Official sign-in page: add the Feishu card beside the native methods.
        body = Buffer.from(injectEntry(body.toString('utf8'), text), 'utf8');
      } else {
        // Bare 401: nobody renders a sign-in page on "/", offer the Feishu one.
        headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-type': 'text/html; charset=utf-8', 'content-security-policy': loginCsp };
        body = Buffer.from(text.loginPage, 'utf8');
      }
      original.writeHead.call(this, status, headers);
      return original.end.call(this, body, done);
    };
    try {
      await next();
    } finally {
      // A held response keeps its hooks until end() so the rewrite still applies;
      // otherwise the original methods are back in place (idempotent).
      if (!held) restore();
    }
  };
}
