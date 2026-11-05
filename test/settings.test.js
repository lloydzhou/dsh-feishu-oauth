import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSettings } from '../src/server/settings.js';
import { fields, pickSettings, validateSettings, settingsOperations } from '../src/client/settings-form.js';

const valid = { enabled: false, appId: '', appSecret: '' };
test('disabled OAuth remains configurable without an application or secret', () => {
  assert.equal(validateSettings(valid), '');
  assert.equal(validateSettings({ ...valid, enabled: true }).includes('填写'), true);
  assert.equal(validateSettings({ ...valid, appId: 'app', enabled: true }), '');
});
test('form loads a blank secret and omits it from ordinary saves', () => {
  const draft = pickSettings({ ...valid, appSecret: 'DO-NOT-RETURN', allowedTenantKey: 'tenant', allowedOpenIds: ['user'] });
  assert.deepEqual(Object.keys(draft), fields);
  assert.equal(draft.appSecret, '');
  const ops = settingsOperations({ ...draft, unknown: 'DO-NOT-RETURN' });
  assert.equal(JSON.stringify(ops).includes('DO-NOT-RETURN'), false);
  assert.deepEqual(ops.map(op => op.path[0]), ['enabled', 'appId']);
  assert.ok(ops.every(op => op.op === 'set'));
});
test('a raw secret is sent only when explicitly entered', () => {
  const raw = 'raw-secret-123';
  const draft = { ...valid, appId: 'app', appSecret: raw, enabled: true };
  assert.equal(validateSettings(draft), '');
  assert.deepEqual(settingsOperations(draft), [
    { op: 'set', path: ['enabled'], value: true },
    { op: 'set', path: ['appId'], value: 'app' },
    { op: 'set', path: ['appSecret'], value: raw },
  ]);
});
test('form rejects malformed field values without requiring a redacted secret', () => {
  for (const bad of [{ enabled: 'yes' }, { appId: ' app' }, { appId: null }, { appSecret: ' secret ' }, { appSecret: null }]) assert.ok(validateSettings({ ...valid, ...bad }));
  assert.equal(validateSettings({ ...valid, enabled: true, appId: 'app' }), '');
});
function fixture(mount) {
  const events = new Map(), effects = [], warnings = [];
  const values = { ...valid };
  const refs = Object.fromEntries(Object.keys(values).map(key => [key, { get: () => values[key] }]));
  const ctx = { connection: {}, webServer: {}, logger: { warn: text => warnings.push(text) }, on(event, fn) { events.set(event, fn); }, effect(setup) { effects.push(setup()); } };
  mountSettings(ctx, refs, mount);
  return { values, warnings, update: () => events.get('loader/volatile-update')(), dispose: () => effects[0]() };
}
test('committed changes revoke routes immediately and await pending callbacks before replacement', async () => {
  const order = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let starts = 0;
  const f = fixture((ctx, config) => {
    const id = ++starts;
    order.push(['start', id, config.enabled, config.appId]);
    ctx.effect(() => () => { order.push(['abort', id]); return id === 1 ? pending : Promise.resolve(); });
    ctx.effect(() => () => order.push(['remove', id]));
  });
  f.values.enabled = true; f.values.appId = 'app';
  const updating = f.update();
  assert.deepEqual(order.slice(1), [['remove', 1], ['abort', 1]]);
  await Promise.resolve(); assert.equal(starts, 1);
  finish(); await updating;
  assert.deepEqual(order.at(-1), ['start', 2, true, 'app']);
  await f.dispose(); assert.deepEqual(order.slice(-2), [['remove', 2], ['abort', 2]]);
});
test('unrelated volatile updates leave active routes and pending logins unchanged', async () => {
  let starts = 0, stops = 0;
  const f = fixture(ctx => { starts++; ctx.effect(() => () => { stops++; }); });
  await f.update(); await f.update();
  assert.equal(starts, 1); assert.equal(stops, 0);
  f.values.appId = 'changed';
  await f.update();
  assert.equal(starts, 2); assert.equal(stops, 1);
  await f.update();
  assert.equal(starts, 2); assert.equal(stops, 1);
  await f.dispose();
});
test('rapid edits coalesce and teardown never remounts a pending update', async () => {
  let count = 0, finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = fixture(ctx => { count++; ctx.effect(() => () => pending); });
  f.values.appId = 'first';
  const a = f.update();
  f.values.appId = 'second';
  const b = f.update(), disposal = f.dispose();
  finish(); await Promise.all([a, b, disposal]); assert.equal(count, 1);
});
test('activation failures clean partial routes and never log thrown credentials', async () => {
  let removed = 0;
  const f = fixture(ctx => { ctx.effect(() => () => { removed++; }); throw Error('SECRET-DO-NOT-LOG'); });
  f.values.appId = 'changed';
  await f.update(); await f.dispose();
  assert.equal(removed, 2);
  assert.equal(f.warnings.length, 2);
  assert.equal(JSON.stringify(f.warnings).includes('SECRET'), false);
});
