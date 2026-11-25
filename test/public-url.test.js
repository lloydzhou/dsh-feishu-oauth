import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, publicBase, resolve } from '../src/server/oauth.js';
import { Config } from '../src/server/index.js';
import { begin, fixture } from './oauth.test.js';
import { fields, pickSettings, settingsOperations, validateSettings, callbackUrl } from '../src/client/settings-form.js';

const credentials = { enabled: true, appId: 'app', appSecret: 'secret' };
const blank = { enabled: false, appId: '', appSecret: '', publicUrl: '' };
const callback = state => `/auth/feishu/callback?state=${state}&code=code`;

test('configuration schema exposes a volatile public base with a blank default', () => {
  assert.equal(Config.dict.publicUrl.type, 'string');
  assert.equal(Config.dict.publicUrl.meta.default, '');
  assert.equal(Config.dict.publicUrl.meta.volatile, true);
  assert.match(Config.dict.publicUrl.meta.description, /http\(s\)/);
});

test('public base is optional and accepts only an http(s) root origin', () => {
  assert.equal(publicBase(undefined), undefined);
  assert.equal(publicBase(null), undefined);
  assert.equal(publicBase(''), undefined);
  for (const [value, origin] of [
    ['https://dsh.example', 'https://dsh.example'],
    ['https://dsh.example/', 'https://dsh.example'],
    ['https://dsh.example:443/', 'https://dsh.example'],
    ['http://192.0.2.10:3080', 'http://192.0.2.10:3080'],
  ]) assert.equal(publicBase(value), origin);
  for (const value of [
    'ftp://dsh.example', '//dsh.example', 'not a url',
    'https://user@dsh.example', 'https://user:pass@dsh.example',
    'https://dsh.example/?next=1', 'https://dsh.example/#fragment',
    'https://dsh.example/dsh', 'https://dsh.example//',
    ' https://dsh.example', 'https://dsh.example ', 'https://dsh.example\n',
    'https://dsh.example\\',
  ]) assert.throws(() => publicBase(value), undefined, value);
  assert.throws(() => publicBase('https://dsh.example/dsh'), /path/);
});

test('activation uses the configured base, while blank keeps the request-derived base', async () => {
  assert.deepEqual(resolve(credentials, 'https:'), { appId: 'app', secret: 'secret', publicUrl: undefined });
  assert.equal(resolve({ ...credentials, publicUrl: 'https://public.example/' }, 'https:').publicUrl, 'https://public.example');
  assert.throws(() => resolve({ ...credentials, publicUrl: 'https://public.example/dsh' }, 'https:'));
  assert.equal(resolve({ enabled: false, publicUrl: 'not a url' }, 'https:'), undefined);

  const blankFixture = fixture({ publicUrl: '' });
  blankFixture.ctx.webServer.protocol = 'http:';
  const fallback = await blankFixture.request('/auth/feishu/start', { host: '192.0.2.10:3080' });
  assert.equal(new URL(fallback.headers.location).searchParams.get('redirect_uri'), 'http://192.0.2.10:3080/auth/feishu/callback');
  assert.doesNotMatch(fallback.headers['set-cookie'], /Secure/);
  await blankFixture.close();

  const overridden = fixture({ publicUrl: 'https://public.example/' });
  const start = await overridden.request('/auth/feishu/start');
  assert.equal(new URL(start.headers.location).searchParams.get('redirect_uri'), 'https://public.example/auth/feishu/callback');
  assert.match(start.headers['set-cookie'], /Secure/);
  await overridden.close();
});

test('publicUrl never overrides native Host trust', async () => {
  // A configured public base is not an admission list: the actual Host must still pass isTrusted().
  const f = fixture({ publicUrl: 'https://public.example/', rootPage: true });
  assert.equal((await f.request('/auth/feishu/start', { host: 'public.example' })).status, 403);
  assert.equal((await f.request('/', { host: 'public.example' })).status, 403);
  await f.close();
});

test('publicUrl stays separate from native trustedHosts', async () => {
  const trustedHosts = [];
  const connection = { trustedHosts, isTrusted: () => false };
  const f = fixture({ publicUrl: 'https://public.example/' }, {}, connection);
  assert.deepEqual(trustedHosts, []);
  assert.equal((await f.request('/auth/feishu/start', { host: 'public.example' })).status, 403);
  assert.deepEqual(trustedHosts, []);
  await f.close();
});

test('the configured base is the Origin fence for login start', async () => {
  const f = fixture({ publicUrl: 'https://public.example/', rootPage: true });
  assert.equal((await f.request('/auth/feishu/start', { origin: 'https://public.example' })).status, 303);
  assert.equal((await f.request('/auth/feishu/start', { origin: 'https://other.example' })).status, 403);
  await f.close();
});

test('configured base drives callback, token exchange and native cookie without changing recovery', async () => {
  const f = fixture({ publicUrl: 'https://public.example/', rootPage: true });
  let nativeBase;
  const authenticatedUrl = f.ctx.connection.authenticatedUrl;
  f.ctx.connection.authenticatedUrl = base => { nativeBase = base; return authenticatedUrl(base); };
  const { state, cookie } = await begin(f);
  const success = await f.request(callback(state), { cookie });
  assert.equal(success.status, 200);
  assert.equal(JSON.parse(f.requests[0].opts.body).redirect_uri, 'https://public.example/auth/feishu/callback');
  assert.equal(nativeBase, 'https://public.example/');
  assert.equal(f.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(success), /PRIVATE_/);

  const recovery = await f.request('/?token=PRIVATE_LAUNCH_TOKEN', { host: 'localhost:3080' });
  assert.equal(recovery.status, 303);
  assert.equal(recovery.headers.location, './');
  assert.equal(f.calls.at(-1).url, '/?token=PRIVATE_LAUNCH_TOKEN');
  await f.close();
});

test('an invalid public base fails activation before any route is registered', () => {
  const routes = new Map();
  const ctx = {
    webServer: { protocol: 'https:', register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
    connection: {},
    effect(setup) { setup(); },
  };
  assert.throws(() => mount(ctx, { ...credentials, publicUrl: 'https://public.example/dsh' }, { fetchImpl: async () => { throw Error('unexpected'); } }));
  assert.equal(routes.size, 0);
});

test('form validation rejects invalid bases and save operations clear or set the value', () => {
  assert.deepEqual(fields, ['enabled', 'appId', 'appSecret', 'publicUrl']);
  assert.equal(validateSettings(blank), '');
  assert.equal(validateSettings({ ...blank, publicUrl: 'https://public.example' }), '');
  assert.match(validateSettings({ ...blank, publicUrl: 'https://public.example/dsh' }), /路径/);
  assert.match(validateSettings({ ...blank, publicUrl: 'https://public.example?x=1' }), /http\(s\)/);
  assert.deepEqual(settingsOperations(blank).map(operation => operation.path[0]), ['enabled', 'appId', 'publicUrl']);
  assert.equal(settingsOperations(blank).at(-1).value, '');
  const draft = pickSettings({ ...blank, appSecret: 'DO-NOT-RETURN', publicUrl: 'https://public.example/', extra: 'DO-NOT-RETURN' });
  assert.deepEqual(Object.keys(draft), fields);
  assert.equal(draft.appSecret, '');
  assert.equal(draft.publicUrl, 'https://public.example/');
});

test('callback preview uses a valid configured base and otherwise the current origin', () => {
  assert.equal(callbackUrl('', 'http://192.0.2.10:3080'), 'http://192.0.2.10:3080/auth/feishu/callback');
  assert.equal(callbackUrl('https://public.example/', 'http://192.0.2.10:3080'), 'https://public.example/auth/feishu/callback');
  assert.equal(callbackUrl('https://public.example/dsh', 'http://192.0.2.10:3080'), 'http://192.0.2.10:3080/auth/feishu/callback');
  assert.equal(callbackUrl('https://user@public.example', 'http://192.0.2.10:3080'), 'http://192.0.2.10:3080/auth/feishu/callback');
});
