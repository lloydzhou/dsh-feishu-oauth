import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../oauth.js';

// Provider requests are explicitly settled; no network, timer, or shared fixture
// module is needed to observe admission while all sixteen slots remain occupied.
function fixture() {
  const routes = new Map(), disposers = [], providerCalls = [], pending = [], nativeCalls = [];
  const ctx = { webServer: { protocol: 'https:', register(route) {
    assert.equal(routes.has(route.path), false);
    routes.set(route.path, route);
    return () => routes.delete(route.path);
  } }, connection: {
    isTrusted: req => req.headers.host === 'dsh.example',
    authenticatedUrl: base => `${base}?token=TEST_RECOVERY_TOKEN`,
    authorizeIndex(req, res) {
      nativeCalls.push(req);
      if (req.url === '/?token=TEST_RECOVERY_TOKEN') {
        res.writeHead(303, { location: './', 'set-cookie': 'dsh-auth-test=signed; HttpOnly; SameSite=Strict; Secure' });
        res.end();
        return false;
      }
      res.writeHead(401); res.end(); return false;
    },
  }, effect(setup) { disposers.push(setup()); } };
  mount(ctx, { enabled: true, appId: 'test-app', appSecret: 'test-secret' }, {
    fetchImpl(url, options) {
      providerCalls.push({ url, options });
      if (url.endsWith('/user_info')) return Promise.resolve(Response.json({ code: 0, data: { open_id: 'test-user' } }));
      return new Promise((resolve, reject) => {
        const abort = () => reject(options.signal.reason);
        options.signal.addEventListener('abort', abort, { once: true });
        pending.push({
          succeed() { options.signal.removeEventListener('abort', abort); resolve(Response.json({ code: 0, token_type: 'Bearer', access_token: 'test-access-token' })); },
          fail() { options.signal.removeEventListener('abort', abort); reject(Error('test provider failure')); },
        });
      });
    },
  });
  return { providerCalls, pending, nativeCalls,
    async request(url, headers = {}) {
      const res = { status: undefined, headers: {}, body: '',
        writeHead(status, h = {}) { this.status = status; this.headers = h; this.headersSent = true; },
        end(body = '') { this.body = body; },
      };
      await routes.get(new URL(url, 'https://dsh.example/').pathname).handler({ method: 'GET', url, headers: { host: 'dsh.example', ...headers } }, res);
      return res;
    },
    async close() { for (const dispose of disposers.reverse()) await dispose(); },
  };
}
async function begin(f) {
  const res = await f.request('/auth/feishu/start');
  assert.equal(res.status, 303);
  const state = new URL(res.headers.location).searchParams.get('state');
  assert.ok(state);
  return { url: `/auth/feishu/callback?state=${state}&code=test_code`, cookie: res.headers['set-cookie'].split(';')[0] };
}
const callback = (f, login) => f.request(login.url, { cookie: login.cookie });

for (const settlement of ['success', 'failure']) {
  test(`sixteen provider exchanges bound admission; ${settlement} releases a slot and recovery stays available`, async t => {
    const f = fixture();
    t.after(() => f.close());
    const inFlight = [];
    for (let i = 0; i < 16; i++) {
      const login = await begin(f);
      inFlight.push(callback(f, login));
    }
    assert.equal(f.pending.length, 16);
    assert.equal(f.providerCalls.length, 16);
    assert.ok(f.providerCalls.every(call => call.url.endsWith('/oauth/token')));

    const overflow = await begin(f);
    const rejected = await callback(f, overflow);
    assert.equal(rejected.status, 503);
    assert.match(rejected.headers['set-cookie'], /Max-Age=0/);
    assert.equal(f.providerCalls.length, 16, 'seventeenth valid state must not reach the provider');
    assert.equal((await callback(f, overflow)).status, 400, 'busy callback consumes its valid state');
    assert.equal(f.providerCalls.length, 16);

    const recovery = await f.request('/?token=TEST_RECOVERY_TOKEN');
    assert.equal(recovery.status, 303);
    assert.equal(recovery.headers.location, './');
    assert.match(recovery.headers['set-cookie'], /^dsh-auth-test=/);
    assert.equal(f.nativeCalls.length, 1);
    assert.equal(f.providerCalls.length, 16, 'native recovery bypasses provider admission');

    if (settlement === 'success') f.pending[0].succeed();
    else f.pending[0].fail();
    assert.equal((await inFlight[0]).status, settlement === 'success' ? 200 : 502);
    const callsAfterSettlement = f.providerCalls.length;
    assert.equal(callsAfterSettlement, settlement === 'success' ? 17 : 16);
    const replacement = await begin(f);
    const replacementRequest = callback(f, replacement);
    assert.equal(f.pending.length, 17, 'settlement admits a new token exchange');
    assert.equal(f.providerCalls.length, callsAfterSettlement + 1);

    const stillFull = await begin(f);
    assert.equal((await callback(f, stillFull)).status, 503, 'only the settled slot was released');
    assert.equal(f.providerCalls.length, callsAfterSettlement + 1);
    f.pending[16].succeed();
    assert.equal((await replacementRequest).status, 200);
    for (const operation of f.pending.slice(1, 16)) operation.succeed();
    assert.ok((await Promise.all(inFlight.slice(1))).every(res => res.status === 200));

    const finalLogin = await begin(f);
    const finalRequest = callback(f, finalLogin);
    f.pending[17].succeed();
    assert.equal((await finalRequest).status, 200, 'admission remains usable after the batch settles');
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/oauth/token')).length, 18);
  });
}
