import test from 'node:test';
import assert from 'node:assert/strict';
import { createRootEntry, injectEntry } from '../src/server/root-entry.js';
import { oauthLocale } from '../src/server/oauth-locale.js';
import { fixture } from './oauth.test.js';
import { mountSettings } from '../src/server/settings.js';

// Shape of the official remote-connection sign-in page (token form + pairing element).
const official = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign in</title><style>.card{}</style></head><body><main class="page"><section class="card" aria-labelledby="title"><h1 id="title">Sign in</h1><p id="description" class="description">d</p><div class="methods"><form id="token-form" action="./" method="get"><input id="token" name="token"></form><dsh-device-pairing></dsh-device-pairing></div></section></main><script>boot()</script></body></html>';

class FakeResponse {
  constructor() { this.status = undefined; this.headers = undefined; this.body = Buffer.alloc(0); this.writableEnded = false; }
  get socket() { return {}; }
  writeHead(status, headers) { if (this.headersSent) throw Error('headers already sent'); this.status = status; this.headers = headers; this.headersSent = true; return this; }
  // Like node: flushing without an explicit head sends an implicit 200.
  flushHeaders() { if (!this.headersSent) this.writeHead(200, {}); }
  write(chunk) { this.body = Buffer.concat([this.body, Buffer.from(chunk)]); return true; }
  end(chunk, callback) { if (chunk && typeof chunk !== 'function') this.write(chunk); this.writableEnded = true; if (typeof callback === 'function') callback(); return this; }
}

async function run(url, downstream, headers = {}) {
  const res = new FakeResponse();
  let called = false;
  await createRootEntry()({ method: 'GET', url, headers }, res, async () => { called = true; await downstream(res); });
  return { res, called, html: res.body.toString('utf8') };
}

test('the official sign-in page keeps every native method and gains the Feishu card', async () => {
  const { res, html } = await run('/', async r => {
    r.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'content-length': String(official.length) });
    r.flushHeaders();
    r.write(official.slice(0, 100)); r.write(Buffer.from(official.slice(100))); r.end();
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers['content-length'], undefined, 'stale length is dropped');
  assert.match(html, /id="token-form"/);
  assert.match(html, /<dsh-device-pairing>/);
  assert.match(html, /<script>boot\(\)<\/script>/);
  assert.match(html, /<div class="methods"><section class="feishu-oauth-entry"[^>]*>.*href="\/auth\/feishu\/start"/);
  assert.match(html, /Sign in with Feishu/);
  assert.equal(html.match(/data-feishu-oauth-entry/g).length, 1);
  assert.ok(html.indexOf('<style>.feishu-oauth-entry') < html.indexOf('</head>'));
  assert.equal(['writeHead', 'flushHeaders', 'write', 'end'].some(name => Object.hasOwn(res, name)), false, 'methods restored');
});

test('Chinese browsers get the Chinese card', async () => {
  const { html } = await run('/', async r => { r.writeHead(401, { 'content-type': 'text/html' }); r.end(official); }, { 'accept-language': 'zh-CN,zh;q=0.9' });
  assert.match(html, /使用飞书授权登录/);
});

test('a bare 401 on "/" (no gateway page) becomes the Feishu login page', async () => {
  const { res, html } = await run('/', async r => { r.writeHead(401, { 'Cache-Control': 'no-store' }); r.flushHeaders(); r.end('unauthorized'); });
  assert.equal(res.status, 401);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.headers['content-security-policy'], /style-src 'sha256-/);
  assert.match(html, /Sign in with Feishu/);
  assert.doesNotMatch(html, /unauthorized/);
});

test('authenticated app, other statuses and non-root paths pass through untouched', async () => {
  const app = await run('/', async r => { r.writeHead(200, { 'content-type': 'text/html' }); r.flushHeaders(); r.end('<html>app</html>'); });
  assert.equal(app.html, '<html>app</html>');
  assert.equal(app.res.status, 200);
  const forbidden = await run('/', async r => { r.writeHead(403, { 'content-type': 'text/html' }); r.end('authentication unavailable'); });
  assert.equal(forbidden.html, 'authentication unavailable');
  for (const url of ['/?token=x', '/?login=qr', '/index.html', '/api/x']) {
    const result = await run(url, async r => { r.writeHead(401, { 'content-type': 'text/html' }); r.end(official); });
    assert.ok(result.called);
    assert.equal(result.html, official, url);
  }
});

test('injection is idempotent and leaves unknown layouts unchanged', () => {
  const text = oauthLocale('en');
  const once = injectEntry(official, text);
  assert.equal(injectEntry(once, text), once);
  assert.equal(injectEntry('<p>no card here</p>', text), '<p>no card here</p>');
  const noMethods = injectEntry('<html><head></head><body><section class="card"><h1>x</h1></section></body></html>', text);
  assert.match(noMethods, /<div class="methods"><section class="feishu-oauth-entry"/);
});

test('provider hosts register the root entry middleware and dispose it with the routes', async () => {
  const listeners = new Map();
  const f = fixture({}, {}, undefined, [], ctx => { ctx.on = (name, listener) => { listeners.set(name, listener); return () => listeners.delete(name); }; });
  assert.equal(typeof listeners.get('webserver/request'), 'function');
  assert.equal(f.routes.has('/'), false, '"/" stays with the host gateway');
  await f.close();
  assert.equal(listeners.size, 0);
});

test('legacy hosts (no registry, no gateway) get the root wall automatically; rootPage: false opts out', async () => {
  const { legacyConnection } = await import('./oauth.test.js');
  const auto = fixture({}, {}, legacyConnection());
  assert.ok(auto.routes.has('/'));
  await auto.close();
  const off = fixture({ rootPage: false }, {}, legacyConnection());
  assert.equal(off.routes.has('/'), false);
  await off.close();
});

test('through mountSettings, provider hosts join the registry and leave "/" to the gateway', async () => {
  const providers = [], routes = new Map(), listeners = new Map(), disposers = [];
  const registry = { register(provider) { providers.push(provider); } };
  const connection = { isTrustedRequest: () => true, createPeer: () => ({ peer: true }), browserPeer: {} };
  const ctx = {
    connection,
    webServer: { protocol: 'https:', register(route) { if (routes.has(route.path)) throw Error('duplicate'); routes.set(route.path, route); return () => routes.delete(route.path); } },
    reflect: { get(name) { return name === 'connection.authentication' ? registry : name === 'connection' ? connection : undefined; } },
    on(name, listener) { if (name === 'loader/volatile-update') return () => {}; listeners.set(name, listener); return () => listeners.delete(name); },
    effect(setup) { disposers.push(setup()); },
    logger: { warn() { throw Error('activation must not fail'); } },
  };
  mountSettings(ctx, { enabled: true, appId: 'app', appSecret: 'secret', publicUrl: '' });
  assert.equal(providers.length, 1);
  assert.equal(routes.has('/'), false);
  assert.ok(routes.has('/auth/feishu/login'));
  assert.equal(typeof listeners.get('webserver/request'), 'function');
  for (const dispose of disposers.reverse()) await dispose?.();
});
