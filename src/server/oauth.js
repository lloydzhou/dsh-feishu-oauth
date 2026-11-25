import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { oauthLocale, loginCsp } from './oauth-locale.js';

const LOGIN = '/auth/feishu/login';
const START = '/auth/feishu/start';
const CALLBACK = '/auth/feishu/callback';
const AUTHORIZE = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
// The authorize endpoint documents PKCE pairing with the v2 token endpoint.
const TOKEN = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const USERINFO = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
const nonce = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('base64url');
const same = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const baseHeaders = {
  'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function reply(res, status, body = '', headers = {}) {
  res.writeHead(status, { ...baseHeaders, 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}
function capture() {
  return { status: undefined, headers: {}, ended: false,
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end() { this.ended = true; },
  };
}
function cookieValue(header, name) {
  if (typeof header !== 'string') return undefined;
  const values = header.split(';').map(s => s.trim()).filter(s => s.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
function single(params, name) {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

/**
 * Validate the optional canonical public base. Only an http(s) root origin is
 * representable: the OAuth routes live at the root, so a path prefix cannot be
 * honoured, and credentials/query/fragment must never become a redirect target.
 */
export function publicBase(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || /[\s\u0000-\u001F\u007F\\?#]/.test(value)) throw new Error('Invalid public URL');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid public URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid public URL');
  if (url.pathname !== '/' || url.href !== `${url.origin}/`) throw new Error('Invalid public URL path');
  return url.origin;
}

/** Incomplete credentials leave native login untouched. */
export function resolve(config, protocol) {
  if (!config.enabled || !config.appId || !config.appSecret) return undefined;
  if (!['http:', 'https:'].includes(protocol)) throw new Error('Unsupported listener protocol');
  return { appId: config.appId, secret: config.appSecret, publicUrl: publicBase(config.publicUrl) };
}

/** Derive an origin only from an authority accepted by native DSH Host policy. */
function requestOrigin(ctx, req) {
  const host = req.headers.host;
  if (typeof host !== 'string' || !ctx.connection.isTrusted({ headers: { host } })) return undefined;
  const url = new URL(`${ctx.webServer.protocol}//${host}/`);
  if (url.host !== host || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
  return url;
}

/** Use only public native auth APIs; token stays in a synchronous in-process request. */
export function nativeCookie(connection, headers, publicUrl) {
  const authenticated = new URL(connection.authenticatedUrl(publicUrl));
  if (authenticated.origin !== new URL(publicUrl).origin || authenticated.pathname !== '/' || authenticated.searchParams.getAll('token').length !== 1) throw new Error('Native authentication unavailable');
  const response = capture();
  const accepted = connection.authorizeIndex({ method: 'GET', url: `/${authenticated.search}`, headers: { ...headers } }, response);
  const cookies = response.headers['set-cookie'];
  const values = typeof cookies === 'string' ? [cookies] : cookies;
  if (accepted !== false || response.status !== 303 || !response.ended || !Array.isArray(values) || values.length !== 1 || !values[0].startsWith('dsh-auth-') || !values[0].includes('; HttpOnly; SameSite=Strict')) throw new Error('Native authentication unavailable');
  return values;
}

/** Register exact routes as Cordis effects; disposal cancels and awaits in-flight callbacks. */
export function mount(ctx, config, { fetchImpl = globalThis.fetch, now = Date.now, stateTtlSeconds = 300, maxPendingStates = 256, fetchTimeoutMs = 10000 } = {}) {
  const c = resolve(config, ctx.webServer.protocol);
  if (!c) return;
  // Opt-in root wall: dsh 0.2.3-alpha.2+ hosts run the remote-connection gateway
  // (QR pairing / token login) on exact "/", and duplicate exact routes make the
  // late registrant fail to activate. Keep "/" free by default; the Feishu login
  // page lives at /auth/feishu/login either way, and a completed Feishu login
  // mints the native session cookie, so the host gateway admits it as usual.
  const states = new Map();
  const operations = new Set();
  let exchanges = 0;
  const maxExchanges = 16;
  const lifetime = new AbortController();
  const prune = () => { for (const [key, entry] of states) if (entry.expires <= now()) states.delete(key); };
  async function json(url, options, diagnostic) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(fetchTimeoutMs)]) });
    diagnostic.http = response.status;
    // Fixed provider responses are bounded independently of declared content length.
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 65536) throw new Error('Provider response too large');
      chunks.push(Buffer.from(chunk));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (Number.isSafeInteger(data?.code) && data.code >= 0 && data.code <= 2147483647) diagnostic.provider = data.code;
    if (!response.ok) throw new Error('Provider unavailable');
    return data;
  }
  async function handle(path, req, res) {
    const text = oauthLocale(req.headers['accept-language']);
    if (req.method !== 'GET') return reply(res, 405, text.methodNotAllowed, { allow: 'GET' });
    // Recovery remains delegated verbatim, including native authority handling.
    if (path === '/' && new URL(req.url, 'http://localhost/').searchParams.has('token')) { ctx.connection.authorizeIndex(req, res); return; }
    const requestUrl = requestOrigin(ctx, req);
    if (!requestUrl) return reply(res, 403, text.forbidden);
    const target = new URL(req.url, requestUrl);
    if (target.origin !== requestUrl.origin) return reply(res, 403, text.forbidden);
    // OAuth-facing URLs use the configured public base; trust still comes from the request Host.
    const publicUrl = new URL(c.publicUrl ?? requestUrl.origin);
    const cookieName = `dsh-feishu-${hash(publicUrl.origin).slice(0, 16)}`;
    const cookie = (value, age) => `${cookieName}=${value}; Path=/auth/feishu; Max-Age=${age}; HttpOnly; SameSite=Lax${publicUrl.protocol === 'https:' ? '; Secure' : ''}`;
    const clearCookie = () => cookie('', 0);
    const callbackUrl = new URL(CALLBACK, publicUrl).href;
    if (path === '/') {
      const probe = capture();
      if (ctx.connection.authorizeIndex(req, probe)) {
        // Admission is native; the resource read renders the existing app without a browser redirect.
        const page = await ctx.webServer.readResource(new Request(new URL('/index.html', requestUrl)), ctx.connection.browserPeer);
        const body = Buffer.from(await page.arrayBuffer());
        res.writeHead(page.status, { ...Object.fromEntries(page.headers), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
        res.end(body);
        return;
      }
      return reply(res, 200, text.loginPage, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': loginCsp });
    }
    if (path === LOGIN) return reply(res, 200, text.loginPage, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': loginCsp });
    if (path === START) {
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== publicUrl.origin)) return reply(res, 403, text.forbidden);
      if (target.search) return reply(res, 400, text.unexpectedParameters);
      prune();
      if (states.size >= maxPendingStates) return reply(res, 503, text.busy);
      const state = nonce(), browser = nonce(), verifier = nonce();
      states.set(state, { origin: publicUrl.origin, browser: hash(browser), verifier, expires: now() + stateTtlSeconds * 1000 });
      const auth = new URL(AUTHORIZE);
      auth.search = new URLSearchParams({ client_id: c.appId, response_type: 'code', redirect_uri: callbackUrl, state, code_challenge: hash(verifier), code_challenge_method: 'S256' }).toString();
      return reply(res, 303, '', { location: auth.href, 'set-cookie': cookie(browser, stateTtlSeconds) });
    }
    const state = single(target.searchParams, 'state');
    const browser = cookieValue(req.headers.cookie, cookieName);
    prune();
    const entry = states.get(state);
    if (!entry || entry.origin !== publicUrl.origin || !browser || !same(hash(browser), entry.browser)) return reply(res, 400, text.expired);
    states.delete(state); // Consume before any asynchronous operation, including errors.
    const cleared = { 'set-cookie': clearCookie() };
    if (target.searchParams.has('error')) return reply(res, 400, text.declined, cleared);
    const code = single(target.searchParams, 'code');
    if (!code || !/^[A-Za-z0-9_-]{1,4096}$/.test(code)) return reply(res, 400, text.invalidResponse, cleared);
    if (exchanges >= maxExchanges) return reply(res, 503, text.busy, cleared);
    exchanges++;
    let diagnostic = { stage: 'TOKEN' };
    const failure = (status, message) => {
      const details = [diagnostic.stage, diagnostic.http === undefined ? undefined : `HTTP_${diagnostic.http}`, diagnostic.provider === undefined ? undefined : `CODE_${diagnostic.provider}`].filter(Boolean).join('/');
      return reply(res, status, `${message}\n[${details}]`, cleared);
    };
    try {
      const token = await json(TOKEN, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ grant_type: 'authorization_code', client_id: c.appId, client_secret: c.secret, code, redirect_uri: callbackUrl, code_verifier: entry.verifier }) }, diagnostic);
      if (token.code !== 0 || token.error || token.token_type !== 'Bearer' || typeof token.access_token !== 'string' || !token.access_token) throw new Error('Token rejected');
      diagnostic = { stage: 'USERINFO' };
      const user = await json(USERINFO, { headers: { authorization: `Bearer ${token.access_token}` } }, diagnostic);
      if (user.code !== 0 || typeof user.data?.open_id !== 'string' || !user.data.open_id.trim()) return failure(403, text.unverifiedIdentity);
      if (lifetime.signal.aborted) return reply(res, 503, text.unavailable, cleared);
      diagnostic = { stage: 'NATIVE_COOKIE' };
      const cookies = nativeCookie(ctx.connection, req.headers, `${publicUrl.origin}/`);
      // A rendered same-origin page ends the cross-site redirect chain before Strict-cookie navigation.
      return reply(res, 200, text.successPage, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': [...cookies, clearCookie()] });
    } catch {
      // Provider/native exceptions can contain credentials. Never log or reflect them.
      return failure(502, text.failed);
    } finally {
      exchanges--;
    }
  }
  ctx.effect(() => async () => {
    lifetime.abort();
    states.clear();
    await Promise.allSettled([...operations]);
  }, 'feishu-oauth: pending logins');
  const routePaths = config.rootPage === true ? ['/', LOGIN, START, CALLBACK] : [LOGIN, START, CALLBACK];
  for (const path of routePaths) {
    const register = () => ctx.webServer.register({
      kind: 'exact', path, auth: 'anonymous',
      handler(req, res) {
        const operation = handle(path, req, res).catch(() => { if (!res.headersSent) reply(res, 400, oauthLocale(req.headers['accept-language']).invalidRequest); });
        operations.add(operation);
        return operation.finally(() => operations.delete(operation));
      },
    });
    try {
      ctx.effect(register, `feishu-oauth: ${path}`);
    } catch (error) {
      // Only the explicitly enabled root page may lose the registration race to
      // the host gateway; OAuth login itself stays fully functional on its own paths.
      if (path !== '/') throw error;
      ctx.logger?.warn('feishu-oauth: exact "/" is already served by the host gateway; root wall skipped, Feishu login stays at ' + LOGIN_PATH);
    }
  }
}
