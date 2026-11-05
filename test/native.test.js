import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { nativeCookie, mount } from '../src/server/oauth.js';

// Optional, read-only verification of the actual extracted implementation, not a copied signer.
const file = process.env.DSH_NATIVE_CONNECTION_JS;
test('extracted native browser auth accepts adapter cookie and preserves audience', { skip: !file && 'set DSH_NATIVE_CONNECTION_JS to extracted installed connection lib/index.js' }, async () => {
  const source = await readFile(file, 'utf8');
  const start = source.indexOf('//#region lib/types/browser-auth.js');
  const end = source.indexOf('//#endregion', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ Buffer, URL, Headers, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual, credentialKey: (a, b) => `${a}/${b}` });
  // Test-only extraction avoids unsupported asar imports in standard Node. Production never evaluates native source.
  vm.runInContext(`${source.slice(start, end)}; globalThis.NativeAuth = BrowserAuth;`, context);
  let record;
  const auth = await context.NativeAuth.create({}, { async modifyRecord(key, modify) { record = await modify(record) ?? record; return record; } }, 1);
  for (const secure of [false, true]) {
    const publicUrl = `${secure ? 'https' : 'http'}://dsh.example/`;
    const connection = { authenticatedUrl: base => auth.authenticatedUrl(base), authorizeIndex: (req, res) => auth.authorizeIndex(req, res, secure) };
    const cookies = nativeCookie(connection, { host: 'dsh.example', 'sec-fetch-site': 'cross-site' }, publicUrl);
    const cookie = cookies[0].split(';')[0];
    assert.equal(auth.isAuthenticated({ headers: { host: 'dsh.example', cookie } }, secure), true);
    assert.equal(auth.isAuthenticated({ headers: { host: 'evil.example', cookie } }, secure), false);
    assert.equal(cookies[0].includes('; Secure'), secure);
    assert.equal(auth.authorizeIndex({ method: 'GET', url: '/index.html', headers: { host: 'dsh.example', cookie } }, {} , secure), true);
    assert.equal(cookies[0].includes(new URL(auth.authenticatedUrl(publicUrl)).searchParams.get('token')), false);
  }
  const trustStart = source.indexOf('//#region lib/types/loopback-hostname.js');
  vm.runInContext(`${source.slice(trustStart, start)}; globalThis.trust = isTrustedApiRequest;`, context);
  const routes = new Map(), disposers = [];
  const connection = {
    isTrusted: req => context.trust(req, [], '192.0.2.10', 'http:'),
    authenticatedUrl: base => auth.authenticatedUrl(base),
    authorizeIndex: (req, res) => auth.authorizeIndex(req, res, false),
  };
  mount({ connection, webServer: { protocol: 'http:', register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } }, effect(setup) { disposers.push(setup()); } },
    { enabled: true, appId: 'test', appSecret: 'test-secret' },
    { fetchImpl: async url => Response.json(url.includes('/token') ? { code: 0, access_token: 'access', token_type: 'Bearer' } : { code: 0, data: { open_id: 'authorized-user' } }) });
  const request = async (path, headers = {}) => {
    const res = { writeHead(status, h) { this.status = status; this.headers = h; }, end() {} };
    await routes.get(new URL(path, 'http://localhost').pathname).handler({ method: 'GET', url: path, headers: { host: '192.0.2.10:3080', ...headers } }, res);
    return res;
  };
  assert.equal((await request('/auth/feishu/start', { host: 'evil.example' })).status, 403);
  const began = await request('/auth/feishu/start');
  const state = new URL(began.headers.location).searchParams.get('state');
  const result = await request(`/auth/feishu/callback?state=${state}&code=code`, { cookie: began.headers['set-cookie'].split(';')[0], 'sec-fetch-site': 'cross-site' });
  assert.equal(result.status, 200);
  const cookie = result.headers['set-cookie'][0].split(';')[0];
  assert.equal(auth.isAuthenticated({ headers: { host: '192.0.2.10:3080', cookie } }, false), true);
  for (const dispose of disposers.reverse()) await dispose();
  assert.equal(routes.size, 0);
});
