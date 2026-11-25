import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { oauthLocale, loginCsp } from './oauth-locale.js';
import { createRootEntry } from './root-entry.js';

const LOGIN = '/auth/feishu/login';
const START = '/auth/feishu/start';
const CALLBACK = '/auth/feishu/callback';
const AUTHORIZE = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
// The authorize endpoint documents PKCE pairing with the v2 token endpoint.
const TOKEN = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const USERINFO = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
const SESSION_TTL_SECONDS = 14 * 24 * 3600;
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

/** Origin-scoped cookie names: transient state under /auth/feishu, session at the root. */
function cookieNames(publicUrl) {
  const base = `dsh-feishu-${hash(publicUrl.origin).slice(0, 16)}`;
  return { state: base, session: `${base}-session` };
}

/**
 * Build a request origin from the Host header, honouring whichever native
 * trust API the host exposes (isTrustedRequest on dsh 0.2.3-alpha.2+,
 * isTrusted before that). The webserver Host fence runs the same check for
 * every route; this keeps the OAuth handlers honest under direct dispatch.
 *
 * Defence in depth, not the primary gate: when neither trust API exists the
 * host is trusted (an unknown host must degrade to the firewall's behaviour,
 * never fail closed on a guess). On a host that renames the trust API again this
 * turns permissive rather than loud, so the Host fence upstream must stay the
 * authority for what reaches these handlers.
 */
function requestOrigin(ctx, req, protocol) {
  const host = req.headers.host;
  if (typeof host !== 'string') return undefined;
  const connection = ctx.connection;
  // isTrustedRequest is typed private on the host's HostConnectionService but is
  // the only sync trust check reachable here (connection.admit would recurse
  // back into this provider). If a future host hides it, this silently falls
  // back to isTrusted or to "trusted" - check this line first when a host
  // upgrade starts admitting unexpected origins.
  const trusted = typeof connection?.isTrustedRequest === 'function' ? connection.isTrustedRequest({ headers: { host } })
    : typeof connection?.isTrusted === 'function' ? connection.isTrusted({ headers: { host } }) : undefined;
  if (trusted === false) return undefined;
  let url;
  try { url = new URL(`${protocol}//${host}/`); } catch { return undefined; }
  if (url.host !== host || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
  return url;
}

/**
 * Feishu browser session: HMAC-signed payload carried by a persistent cookie.
 * The host authentication registry accepts this session through the provider
 * registered below, exactly like the official token/remote providers do.
 */
function sessionCodec(appId, appSecret) {
  const key = createHash('sha256').update(`feishu-oauth session: ${appId}: ${appSecret}`).digest();
  const sign = payload => createHmac('sha256', key).update(payload).digest('base64url');
  return {
    issue(openId, at = Date.now()) {
      const payload = Buffer.from(JSON.stringify({ oid: openId, exp: at + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    verify(value, at = Date.now()) {
      if (typeof value !== 'string' || !value.includes('.')) return undefined;
      const dot = value.lastIndexOf('.');
      const payload = value.slice(0, dot), signature = value.slice(dot + 1);
      if (!payload || !signature || !same(sign(payload), signature)) return undefined;
      let data;
      try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return undefined; }
      if (typeof data?.oid !== 'string' || !data.oid.trim() || typeof data?.exp !== 'number' || !(data.exp > at)) return undefined;
      return data;
    },
  };
}

/**
 * Register exact routes as Cordis effects; disposal cancels and awaits
 * in-flight callbacks. On hosts with the connection authentication registry
 * (dsh 0.2.3-alpha.2+), a completed Feishu login issues a persistent signed
 * session cookie and the registry accepts it via the provider below - the
 * same admission path the official token and remote-connection providers use,
 * so the host gateway on "/" admits the browser without any redirect chain.
 * Legacy hosts without the registry keep the previous root-wall behavior.
 */
export function mount(ctx, config, { fetchImpl = globalThis.fetch, now = Date.now, stateTtlSeconds = 300, maxPendingStates = 256, fetchTimeoutMs = 10000 } = {}) {
  const c = resolve(config, ctx.webServer.protocol);
  if (!c) return;
  // dsh 0.2.3-alpha.2 provides the registry as the separate
  // "connection.authentication" service; nested proxy access would demand an
  // inject entry that legacy hosts cannot satisfy, so resolve through the
  // framework reflector (with a direct fallback for plain fixtures) and
  // degrade to the legacy path when the registry is absent.
  const registry = (() => {
    try { const viaReflect = ctx.reflect?.get?.('connection.authentication', false); if (viaReflect) return viaReflect; } catch { /* proxy refusal: legacy host */ }
    try { return ctx.connection?.authentication; } catch { return undefined; }
  })();
  const providerMode = typeof registry?.register === 'function';
  const sessions = sessionCodec(c.appId, c.secret);
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
    const requestUrl = requestOrigin(ctx, req, ctx.webServer.protocol);
    if (!requestUrl) return reply(res, 403, text.forbidden);
    const target = new URL(req.url, requestUrl);
    if (target.origin !== requestUrl.origin) return reply(res, 403, text.forbidden);
    // OAuth-facing URLs use the configured public base; trust still comes from the request Host.
    const publicUrl = new URL(c.publicUrl ?? requestUrl.origin);
    const names = cookieNames(publicUrl);
    const secure = publicUrl.protocol === 'https:';
    const cookie = (name, value, age, path = '/') => `${name}=${value}; Path=${path}; Max-Age=${age}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
    const stateCookie = value => cookie(names.state, value, stateTtlSeconds, '/auth/feishu');
    const clearState = () => cookie(names.state, '', 0, '/auth/feishu');
    const callbackUrl = new URL(CALLBACK, publicUrl).href;
    const sessionCookie = value => cookie(names.session, value, SESSION_TTL_SECONDS);
    const session = sessions.verify(cookieValue(req.headers.cookie, names.session), now());
    if (path === '/') {
      const serveApp = async () => {
        // Feishu/native admission renders the existing app without a browser redirect.
        const page = await ctx.webServer.readResource(new Request(new URL('/index.html', requestUrl)), ctx.connection.browserPeer);
        const body = Buffer.from(await page.arrayBuffer());
        res.writeHead(page.status, { ...Object.fromEntries(page.headers), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
        res.end(body);
      };
      // Root wall only (opt-in rootPage): a valid Feishu session admits directly.
      if (session) return serveApp();
      if (!providerMode) {
        // Legacy hosts: token recovery delegates verbatim to the native
        // exchange, writing its own 303 and cookie on the real response.
        if (new URL(req.url, 'http://localhost/').searchParams.has('token')) { ctx.connection.authorizeIndex?.(req, res); return; }
        // A valid native cookie admits into the app without a redirect chain.
        const probe = capture();
        if (ctx.connection.authorizeIndex?.(req, probe)) return serveApp();
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
      return reply(res, 303, '', { location: auth.href, 'set-cookie': stateCookie(browser) });
    }
    const state = single(target.searchParams, 'state');
    const browser = cookieValue(req.headers.cookie, names.state);
    prune();
    const entry = states.get(state);
    if (!entry || entry.origin !== publicUrl.origin || !browser || !same(hash(browser), entry.browser)) return reply(res, 400, text.expired);
    states.delete(state); // Consume before any asynchronous operation, including errors.
    const cleared = { 'set-cookie': clearState() };
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
      // The persistent Feishu session is the admission credential: the host
      // authentication registry (provider below) verifies it on every request,
      // including the host gateway serving "/".
      const issued = sessionCookie(sessions.issue(user.data.open_id.trim(), now()));
      // A rendered same-origin page ends the cross-site redirect chain before Strict-cookie navigation.
      return reply(res, 200, text.successPage, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': [issued, clearState()] });
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
  if (providerMode) {
    // Join the host authentication registry: same admission path as the
    // official token / remote providers; first provider returning a peer wins.
    // Use the bare service instance from the reflector so nested proxy
    // admission cannot interfere with createPeer/register.
    const bare = ctx.reflect?.get?.('connection', false) ?? ctx.connection;
    const peer = bare.createPeer({ principal: { kind: 'owner' } });
    const authenticate = request => {
      // Callers pass node header objects (webserver/authorize) or Fetch
      // Headers (remote-connection's root gateway); read both shapes.
      const raw = request?.headers;
      const read = name => {
        if (!raw) return undefined;
        if (typeof raw.get === 'function') return raw.get(name) ?? undefined;
        const value = raw[name];
        return Array.isArray(value) ? value.join('; ') : value;
      };
      const headers = { host: read('host'), cookie: read('cookie') };
      const requestUrl = requestOrigin(ctx, { headers }, ctx.webServer.protocol);
      if (!requestUrl) return undefined;
      const session = sessions.verify(cookieValue(headers.cookie, cookieNames(new URL(c.publicUrl ?? requestUrl.origin)).session), now());
      return session ? peer : undefined;
    };
    // The registry scopes registrations to its own owner (the connection
    // service), not to this plugin, so the returned disposer must be bound to
    // our effect: otherwise every settings change that remounts the plugin
    // leaves a stale provider behind, and a rotated appSecret would keep
    // honouring sessions signed with the old one until the host restarts.
    ctx.effect(() => registry.register({ authenticate }), 'feishu-oauth: authentication provider');
    // Cooperate with whoever owns "/" instead of competing for the route: the
    // official sign-in page gains a Feishu card, and a bare 401 on "/" becomes
    // the Feishu login page. Registration order never matters.
    if (typeof ctx.on === 'function') ctx.effect(() => ctx.on('webserver/request', createRootEntry()), 'feishu-oauth: root entry');
  }
  // Root wall: automatic on legacy hosts (no authentication registry, hence no
  // remote-connection gateway); explicit opt-in/opt-out via rootPage.
  const rootWall = config.rootPage === true || (config.rootPage !== false && !providerMode);
  const routePaths = rootWall ? ['/', LOGIN, START, CALLBACK] : [LOGIN, START, CALLBACK];
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
      ctx.logger?.warn('feishu-oauth: exact "/" is already served by the host gateway; root wall skipped, Feishu login stays at ' + LOGIN);
    }
  }
}
