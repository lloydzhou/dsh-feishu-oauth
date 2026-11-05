import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mount, resolve, nativeCookie } from '../oauth.js';

export const config = { enabled: true, appId: 'app', appSecret: 'PRIVATE_APP_SECRET' };
const publicUrl = 'https://dsh.example/';
export function fixture(overrides = {}, dependencies = {}, connection) {
  const routes = new Map(), disposers = [], calls = [];
  const ctx = { webServer: { protocol: 'https:', async readResource(request, peer) { assert.equal(request.url, 'https://dsh.example/index.html'); assert.equal(peer, ctx.connection.browserPeer); return new Response('<html>native app</html>', { headers: { 'content-type': 'text/html' } }); }, register(route) { if (routes.has(route.path)) throw Error('duplicate'); routes.set(route.path, route); return () => routes.delete(route.path); } },
    connection: connection ?? {
      isTrusted(req) { return ['dsh.example', '192.0.2.10:3080', 'localhost:3080'].includes(req.headers.host); },
      authenticatedUrl(base) { return `${base}?token=PRIVATE_LAUNCH_TOKEN`; },
      authorizeIndex(req, res) {
        calls.push(req);
        if (req.url.includes('token=PRIVATE_LAUNCH_TOKEN')) { res.writeHead(303, { 'set-cookie': 'dsh-auth-test=signed; HttpOnly; SameSite=Strict; Secure', location: './' }); res.end(); return false; }
        if (req.headers.cookie?.includes('dsh-auth-test=signed')) return true;
        res.writeHead(401); res.end(); return false;
      },
    }, effect(fn) { disposers.push(fn()); },
  };
  const requests = [];
  const fetchImpl = async (url, opts) => { requests.push({ url, opts }); return Response.json(url.includes('/token') ? { code: 0, access_token: 'PRIVATE_ACCESS_TOKEN', token_type: 'Bearer' } : { code: 0, data: { tenant_key: 'tenant', open_id: 'owner' } }); };
  mount(ctx, { ...config, ...overrides }, { stateTtlSeconds: 30, maxPendingStates: 2, fetchTimeoutMs: 100, fetchImpl, ...dependencies });
  return { routes, requests, calls, ctx,
    async request(url, headers = {}, method = 'GET') {
      const res = { status: undefined, headers: {}, body: '', writeHead(status, h = {}) { this.status = status; this.headers = h; this.headersSent = true; }, end(body = '') { this.body = body; } };
      await routes.get(new URL(url, publicUrl).pathname).handler({ url, method, headers: { host: 'dsh.example', ...headers } }, res);
      return res;
    },
    async close() { for (const dispose of disposers.reverse()) await dispose(); },
  };
}
export async function begin(f) {
  const res = await f.request('/auth/feishu/start');
  return { res, state: new URL(res.headers.location).searchParams.get('state'), cookie: res.headers['set-cookie'].split(';')[0] };
}
const callback = state => `/auth/feishu/callback?state=${state}&code=code`;
test('disabled and incomplete config register nothing', async () => {
  for (const override of [{ enabled: false }, { appId: '' }, { appSecret: '' }]) assert.equal(fixture(override).routes.size, 0);
});
test('only supported native listener protocols are admitted', () => {
  assert.ok(resolve(config, 'http:'));
  assert.ok(resolve(config, 'https:'));
  assert.throws(() => resolve(config, 'ftp:'));
});
test('LAN HTTP callback is derived from current native trusted authority', async () => {
  const f = fixture(); f.ctx.webServer.protocol = 'http:';
  const start = await f.request('/auth/feishu/start', { host: '192.0.2.10:3080', 'x-forwarded-host': 'evil', 'x-forwarded-proto': 'https' });
  assert.equal(new URL(start.headers.location).searchParams.get('redirect_uri'), 'http://192.0.2.10:3080/auth/feishu/callback');
  assert.doesNotMatch(start.headers['set-cookie'], /Secure/);
  const state = new URL(start.headers.location).searchParams.get('state');
  const cookie = start.headers['set-cookie'].split(';')[0];
  assert.equal((await f.request(callback(state), { host: 'localhost:3080', cookie })).status, 400);
  assert.equal((await f.request(callback(state), { host: '192.0.2.10:3080', cookie, 'sec-fetch-site': 'cross-site' })).status, 200);
  assert.equal(JSON.parse(f.requests[0].opts.body).redirect_uri, 'http://192.0.2.10:3080/auth/feishu/callback');
  await f.close();
});
test('GET and authority fences reject forwarded-header bypass', async () => {
  const f = fixture();
  assert.equal((await f.request('/auth/feishu/start', {}, 'POST')).status, 405);
  assert.equal((await f.request('/auth/feishu/start', { host: 'evil', 'x-forwarded-host': 'dsh.example' })).status, 403);
  assert.equal((await f.request('/auth/feishu/start', { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await f.request('/auth/feishu/start?next=https://evil')).status, 400);
  await f.close(); assert.equal(f.routes.size, 0);
});
test('PKCE, browser binding, single use and native cookie with no secret disclosure', async () => {
  const f = fixture(); const { res, state, cookie } = await begin(f);
  const auth = new URL(res.headers.location);
  assert.equal(auth.origin, 'https://accounts.feishu.cn'); assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.match(res.headers['set-cookie'], /HttpOnly; SameSite=Lax; Secure/);
  assert.equal((await f.request(callback(state))).status, 400);
  assert.equal((await f.request(callback(state), { cookie: 'wrong=value' })).status, 400);
  const success = await f.request(callback(state), { cookie, 'sec-fetch-site': 'cross-site' });
  assert.equal(success.status, 200); assert.match(success.body, /http-equiv="refresh" content="0;url=\/"/);
  assert.equal(success.headers['set-cookie'].length, 2);
  assert.doesNotMatch(JSON.stringify(success), /PRIVATE_/);
  const payload = JSON.parse(f.requests[0].opts.body);
  assert.equal(f.requests[0].url, 'https://open.feishu.cn/open-apis/authen/v2/oauth/token');
  assert.equal(f.requests[0].opts.headers['content-type'], 'application/json; charset=utf-8');
  assert.match(payload.code_verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'), auth.searchParams.get('code_challenge'));
  assert.equal(payload.redirect_uri, auth.searchParams.get('redirect_uri'));
  assert.equal(payload.client_id, auth.searchParams.get('client_id'));
  assert.equal(payload.client_secret, config.appSecret);
  assert.equal(f.requests[0].opts.redirect, 'error');
  assert.equal(f.requests[1].opts.headers.authorization, 'Bearer PRIVATE_ACCESS_TOKEN');
  assert.equal((await f.request(callback(state), { cookie })).status, 400);
  const home = await f.request('/', { cookie: 'dsh-auth-test=signed' });
  assert.equal(home.status, 200);
  assert.equal(home.headers.location, undefined);
  assert.equal(home.body.toString(), '<html>native app</html>');
});
test('native recovery works on a different authority without exposing token to OAuth', async () => {
  const f = fixture(); assert.equal((await f.request('/?token=PRIVATE_LAUNCH_TOKEN', { host: 'localhost:3080' })).status, 303);
  assert.match((await f.request('/')).body, /Sign in with Feishu/);
});
test('expired state, duplicate parameters and full storage reject', async () => {
  let clock = 0; const f = fixture({}, { now: () => clock }); const a = await begin(f);
  assert.equal((await f.request(`${callback(a.state)}&state=${a.state}`, { cookie: a.cookie })).status, 400);
  await begin(f); assert.equal((await f.request('/auth/feishu/start')).status, 503);
  clock = 30001; assert.equal((await f.request(callback(a.state), { cookie: a.cookie })).status, 400);
  assert.equal((await f.request('/auth/feishu/start')).status, 303);
});
test('denied provider and unauthorized identity never mint native cookies', async () => {
  for (const fetchImpl of [async () => { throw Error('PRIVATE_APP_SECRET'); }, async () => Response.json({ code: 999 }), async url => Response.json(url.includes('/token') ? { code: 0, access_token: 'x', token_type: 'Bearer' } : { code: 0, data: { tenant_key: 'other', open_id: '' } })]) {
    const f = fixture({}, { fetchImpl }); const a = await begin(f); const res = await f.request(callback(a.state), { cookie: a.cookie });
    assert.ok([403, 502].includes(res.status)); assert.equal(f.calls.length, 0); assert.doesNotMatch(JSON.stringify(res), /PRIVATE_/);
  }
});
test('every app-authorized valid identity is admitted without a user or tenant list', async () => {
  for (const open_id of ['first-user', 'another-user']) {
    const f = fixture({}, { fetchImpl: async url => Response.json(url.includes('/token') ? { code: 0, access_token: 'x', token_type: 'Bearer' } : { code: 0, data: { tenant_key: 'another-tenant', open_id } }) });
    const a = await begin(f);
    assert.equal((await f.request(callback(a.state), { cookie: a.cookie })).status, 200);
    assert.equal(f.calls.length, 1);
    await f.close();
  }
});
test('provider refusal consumes state and clears transient cookie', async () => {
  const f = fixture(); const a = await begin(f); const res = await f.request(`/auth/feishu/callback?state=${a.state}&error=access_denied`, { cookie: a.cookie });
  assert.equal(res.status, 400); assert.match(res.headers['set-cookie'], /Max-Age=0/); assert.equal(f.requests.length, 0);
  assert.equal((await f.request(callback(a.state), { cookie: a.cookie })).status, 400);
});
test('oversized provider responses and timeout failures remain sanitized', async () => {
  for (const fetchImpl of [async () => new Response('x'.repeat(65537)), async (_url, options) => new Promise((_, reject) => { options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); })]) {
    const f = fixture({}, { fetchImpl }); const a = await begin(f);
    // Keep the test runner alive while Node's unref'ed AbortSignal timeout fires.
    const hold = setInterval(() => {}, 1000);
    try { const res = await f.request(callback(a.state), { cookie: a.cookie }); assert.equal(res.status, 502); assert.equal(f.calls.length, 0); }
    finally { clearInterval(hold); await f.close(); }
  }
});
test('disposal aborts an in-flight callback and prevents cookie issuance', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = fixture({}, { fetchImpl: async (_url, options) => new Promise((_, reject) => { started(); options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); }) });
  const a = await begin(f); const pending = f.request(callback(a.state), { cookie: a.cookie });
  await ready; await f.close();
  assert.equal((await pending).status, 502); assert.equal(f.routes.size, 0); assert.equal(f.calls.length, 0);
});
test('adapter rejects unexpected native results instead of forwarding them', () => {
  assert.throws(() => nativeCookie({ authenticatedUrl: () => 'https://evil/?token=x' }, {}, publicUrl));
  assert.throws(() => nativeCookie({ authenticatedUrl: () => `${publicUrl}?token=x`, authorizeIndex(req, res) { res.writeHead(303, { location: req.url }); res.end(); return false; } }, {}, publicUrl));
});
