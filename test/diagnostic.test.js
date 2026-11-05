import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, begin } from './oauth.test.js';

test('callback diagnostics expose only fixed stages and numeric provider status', async () => {
  for (const stage of ['TOKEN', 'USERINFO', 'NATIVE_COOKIE']) {
    const f = fixture({}, { fetchImpl: async url => {
      if (stage === 'TOKEN' || (stage === 'USERINFO' && !url.includes('/token'))) return Response.json({ code: 20002, error_description: 'PRIVATE_SECRET' }, { status: 400 });
      return Response.json(url.includes('/token') ? { code: 0, access_token: 'PRIVATE_ACCESS', token_type: 'Bearer' } : { code: 0, data: { open_id: 'owner' } });
    } });
    if (stage === 'NATIVE_COOKIE') f.ctx.connection.authenticatedUrl = () => { throw Error('PRIVATE_LAUNCH_TOKEN'); };
    const a = await begin(f);
    const result = await f.request(`/auth/feishu/callback?state=${a.state}&code=code`, { cookie: a.cookie });
    assert.equal(result.status, 502);
    assert.ok(result.body.includes(stage === 'NATIVE_COOKIE' ? '[NATIVE_COOKIE]' : `[${stage}/HTTP_400/CODE_20002]`));
    assert.doesNotMatch(result.body, /PRIVATE/);
    await f.close();
  }
});

test('network exceptions never appear in callback diagnostics', async () => {
  const f = fixture({}, { fetchImpl: async () => { throw Error('PRIVATE_SECRET'); } });
  const a = await begin(f);
  const result = await f.request(`/auth/feishu/callback?state=${a.state}&code=code`, { cookie: a.cookie });
  assert.ok(result.body.endsWith('[TOKEN]'));
  assert.doesNotMatch(result.body, /PRIVATE/);
  await f.close();
});
