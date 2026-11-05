import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { selectLocale } from '../oauth-locale.js';
import { fixture, begin } from './oauth.test.js';

const zh = { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' };
const callback = state => `/auth/feishu/callback?state=${state}&code=code`;

test('browser locale selection honors quality, ties, variants, exclusions and English fallback', () => {
  for (const [header, expected] of [
    [undefined, 'en'], ['', 'en'], [['zh'], 'en'], ['fr,de;q=0.8', 'en'],
    ['zh', 'zh'], ['ZH-hant-TW', 'zh'], ['en-GB,zh;q=0.9', 'en'],
    ['en;q=0.2,zh-CN;q=0.9', 'zh'], ['zh;q=0.2,en;q=0.9', 'en'],
    ['zh;q=0.5,en;q=0.5', 'zh'], ['en;q=0.5,zh;q=0.5', 'en'],
    ['zh;q=0,en;q=0.1', 'en'], ['en;q=0,zh;q=0.1', 'zh'],
    ['zh;q=0,*;q=1', 'en'], ['en;q=0,*;q=1', 'zh'],
    ['*;q=0,zh;q=0.1', 'zh'], ['*', 'en'], ['*;q=0', 'en'],
    ['en;q=0,zh;q=0', 'en'], ['zh;q=0.000,en;q=0.001', 'en'],
    [' zh-CN ; q=0.900 , en ; q=0.100 ', 'zh'],
    ['zh;q=1.1,en;q=0.1', 'en'], ['zh;q=NaN', 'en'], ['zh;q=-1', 'en'],
    ['zh;q=0.1;q=1', 'en'], ['zh;q=0.1234', 'en'], ['zh<script>', 'en'],
  ]) assert.equal(selectLocale(header), expected, JSON.stringify(header));
});

test('login pages use browser language and only safe static HTML language tags', async t => {
  const f = fixture(); t.after(() => f.close());
  for (const [header, language, signIn, recovery] of [
    [undefined, 'en', 'Sign in with Feishu', 'Feishu access grants full owner privileges.'],
    [zh['accept-language'], 'zh', '使用飞书授权登录', '完整的所有者权限'],
    ['en;q=0.9,zh;q=0.1', 'en', 'Sign in with Feishu', 'Have a Token link?'],
    ['zh;q=0,en;q=1', 'en', 'Sign in with Feishu', 'Have a Token link?'],
    ['zh\"><script>PRIVATE_INJECTED</script>', 'en', 'Sign in with Feishu', 'Have a Token link?'],
  ]) {
    const res = await f.request('/', { 'accept-language': header });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes(`<html lang="${language}">`));
    assert.ok(res.body.includes(signIn)); assert.ok(res.body.includes(recovery));
    assert.match(res.body, /href="\/auth\/feishu\/start"/);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.equal(res.headers['cache-control'], 'no-store');
    const styles = [...res.body.matchAll(/<style>([\s\S]*?)<\/style>/g)];
    assert.equal(styles.length, 1);
    const hash = createHash('sha256').update(styles[0][1]).digest('base64');
    assert.equal(res.headers['content-security-policy'], `default-src 'none'; style-src 'sha256-${hash}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    assert.match(res.body, /name="viewport"/);
    assert.match(res.body, /prefers-color-scheme:\s*dark/);
    assert.match(res.body, /:focus-visible/);
    assert.match(res.body, /Token/);
    assert.doesNotMatch(res.body, /PRIVATE_|<script|<img|<link|\sstyle=|\sonclick=/);
  }
});

test('success uses callback browser language without changing native cookies or replay protection', async t => {
  const f = fixture(); t.after(() => f.close());
  const { state, cookie } = await begin(f);
  const res = await f.request(callback(state), { ...zh, cookie });
  assert.equal(res.status, 200);
  assert.match(res.body, /<html lang="zh">/);
  assert.match(res.body, /<meta http-equiv="refresh" content="0;url=\/">/);
  assert.doesNotMatch(res.body, /<h1>|<a |登录成功|继续前往/);
  assert.equal(res.headers['set-cookie'].length, 2);
  assert.match(res.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
  assert.match(res.headers['set-cookie'][1], /Max-Age=0/);
  assert.doesNotMatch(JSON.stringify(res), /PRIVATE_/);
  const replay = await f.request(callback(state), { ...zh, cookie });
  assert.equal(replay.status, 400); assert.equal(replay.body, '登录无效或已过期，请重新登录');
});

test('public request fences and state capacity errors are translated', async t => {
  const f = fixture(); t.after(() => f.close());
  for (const [url, headers, method, status, body] of [
    ['/auth/feishu/start', {}, 'POST', 405, '不支持此请求方法'],
    ['/auth/feishu/start', { host: 'evil' }, 'GET', 403, '禁止访问'],
    ['/auth/feishu/start', { 'sec-fetch-site': 'cross-site' }, 'GET', 403, '禁止访问'],
    ['https://evil/auth/feishu/start', {}, 'GET', 403, '禁止访问'],
    ['/auth/feishu/start?unexpected=PRIVATE_INPUT', {}, 'GET', 400, '请求包含非预期参数'],
    ['/auth/feishu/callback?state=PRIVATE_INPUT', {}, 'GET', 400, '登录无效或已过期，请重新登录'],
  ]) {
    const res = await f.request(url, { ...zh, ...headers }, method);
    assert.equal(res.status, status); assert.equal(res.body, body);
    assert.match(res.headers['content-type'], /text\/plain/);
    if (status === 405) assert.equal(res.headers.allow, 'GET');
  }
  await begin(f); await begin(f);
  const busy = await f.request('/auth/feishu/start', zh);
  assert.equal(busy.status, 503); assert.equal(busy.body, '登录请求繁忙，请稍后重试');
});

test('declined and malformed callbacks retain fixed localized messages and consume state', async t => {
  const f = fixture(); t.after(() => f.close());
  for (const [query, body] of [
    ['error=PRIVATE_PROVIDER_ERROR&error_description=PRIVATE_DESCRIPTION', '飞书登录已被拒绝，请重新登录'],
    ['code=%3Cscript%3EPRIVATE_INPUT', '登录响应无效，请重新登录'],
  ]) {
    const { state, cookie } = await begin(f);
    const res = await f.request(`/auth/feishu/callback?state=${state}&${query}`, { ...zh, cookie });
    assert.equal(res.status, 400); assert.equal(res.body, body);
    assert.match(res.headers['set-cookie'], /Max-Age=0/);
    assert.equal((await f.request(callback(state), { ...zh, cookie })).status, 400);
  }
  assert.equal(f.requests.length, 0); assert.equal(f.calls.length, 0);
});

test('provider and identity failures are localized without leaking secrets', async t => {
  for (const [fetchImpl, status, body] of [
    [async () => { throw Error('PRIVATE_PROVIDER_SECRET'); }, 502, '无法完成登录，请重新登录或使用原生恢复入口\n[TOKEN]'],
    [async url => Response.json(url.includes('/token') ? { code: 0, token_type: 'Bearer', access_token: 'PRIVATE_TOKEN' } : { code: 0, data: { open_id: '' }, error: 'PRIVATE_IDENTITY' }), 403, '无法验证飞书用户身份\n[USERINFO/HTTP_200/CODE_0]'],
  ]) {
    const f = fixture({}, { fetchImpl }); t.after(() => f.close());
    const { state, cookie } = await begin(f);
    const res = await f.request(callback(state), { ...zh, cookie });
    assert.equal(res.status, status); assert.equal(res.body, body);
    assert.match(res.headers['set-cookie'], /Max-Age=0/);
    assert.equal(f.calls.length, 0); assert.doesNotMatch(JSON.stringify(res), /PRIVATE_/);
  }
});

test('unexpected request failures are localized and sanitized', async t => {
  const f = fixture(); t.after(() => f.close());
  f.ctx.connection.isTrusted = () => { throw Error('PRIVATE_REQUEST'); };
  const res = await f.request('/', zh);
  assert.equal(res.status, 400); assert.equal(res.body, '请求无效');
});

test('native token recovery stays untranslated and authenticated root serves the app', async t => {
  const f = fixture(); t.after(() => f.close());
  const recovery = await f.request('/?token=PRIVATE_LAUNCH_TOKEN', zh);
  assert.equal(recovery.status, 303); assert.equal(recovery.body, '');
  assert.equal(recovery.headers.location, './');
  const authenticated = await f.request('/', { ...zh, cookie: 'dsh-auth-test=signed' });
  assert.equal(authenticated.status, 200); assert.equal(authenticated.headers.location, undefined);
  assert.equal(authenticated.body.toString(), '<html>native app</html>');
});
