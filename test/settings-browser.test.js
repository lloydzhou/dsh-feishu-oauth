import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import zh from '../locale/zh.json' with { type: 'json' };
const t = key => { assert.ok(key in zh.settings, `Missing translation: ${key}`); return zh.settings[key]; };

test('built browser bundle registers authenticated form while OAuth is disabled and disposes slot', async () => {
  let plugin, entry, Component, registered = false, request;
  const form = { mutate: async (ops, revision) => { request = { ops, revision }; return false; } };
  runInNewContext(readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(module) { assert.equal(module.id, 'dsh-feishu-oauth'); plugin = module.factory(id => { assert.ok(['react', '@deepseek-ai/dsh-client-ui-primitives'].includes(id)); return {}; }); } } },
  });
  const effects = [];
  plugin.apply({
    locale: { register: () => () => {} },
    configForms: { get(ns) { assert.equal(ns, 'feishu-oauth'); return form; }, whileServed(names, fn) { assert.equal(names.join(','), 'feishu-oauth'); return fn(); } },
    slots: { inject(slot, fn) { assert.equal(slot, 'plugins.bundle.config'); return fn(); }, register(meta, component) { registered = true; entry = meta; Component = component; return () => { registered = false; }; } },
    effect(fn) { effects.push(fn()); },
  });
  assert.equal(registered, true);
  assert.equal(entry.key, 'dsh-feishu-oauth');
  assert.equal(typeof Component, 'function');
  const props = entry.inject();
  assert.equal(props.hooks.config, form);
  assert.equal(await props.save([{ op: 'set', path: ['enabled'], value: false }], 7), false);
  assert.equal(request.revision, 7);
  assert.equal(request.ops[0].path[0], 'enabled');
  effects.reverse().forEach(dispose => dispose()); assert.equal(registered, false);
});

test('built editor exposes only three settings, derives HTTP callback and preserves blank secrets', async () => {
  const state = [], saves = [];
  let cursor = 0, plugin, Card;
  const react = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
  };
  runInNewContext(readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8'), {
    window: { location: { origin: 'http://192.0.2.10:3080', protocol: 'http:' }, __ModuleLoader__: { load(module) { plugin = module.factory(id => id === 'react' ? react : { Switch: 'NativeSwitch' }); } } },
  });
  plugin.apply({
    locale: { register: () => () => {} },
    configForms: { get: () => ({}), whileServed: (_names, fn) => fn() },
    slots: { inject: (_slot, fn) => fn(), register(_meta, component) { Card = component; return () => {}; } }, effect: fn => fn(),
  });
  const props = { t, useConfig: () => ({ status: 'ready', revision: 9, writable: true, value: { enabled: false, appId: 'app', appSecret: 'NEVER-DISPLAY' } }), save: async (ops, revision) => { saves.push({ ops, revision }); return true; } };
  const render = () => { cursor = 0; const editor = Card(props); return editor.type(editor.props); };
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(nodes)];
  let tree = render();
  const inputs = nodes(tree).filter(node => node.type === 'input');
  assert.deepEqual(inputs.map(node => node.props.type), ['text', 'password']);
  const toggle = nodes(tree).find(node => node.type === 'NativeSwitch');
  assert.equal(toggle.props.checked, false);
  assert.equal(toggle.props.label, t('enabled'));
  toggle.props.onChange(true);
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === 'NativeSwitch').props.checked, true);
  assert.equal(inputs[1].props.value, '');
  assert.ok(JSON.stringify(tree).includes('http://192.0.2.10:3080/auth/feishu/callback'));
  assert.ok(JSON.stringify(tree).includes('HTTP 不加密'));
  assert.ok(!JSON.stringify(tree).includes('NEVER-DISPLAY'));
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(saves[0].revision, 9);
  assert.equal(saves[0].ops.length, 2);
  assert.ok(saves[0].ops.every(op => op.path[0] !== 'appSecret'));
  // Remount a fresh editor to enter a replacement, then verify successful save clears it.
  state.length = 0;
  tree = render();
  nodes(tree).find(node => node.props.type === 'password').props.onChange({ target: { value: 'replacement-raw-secret' } });
  tree = render();
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(saves[1].ops[2].value, 'replacement-raw-secret');
  tree = render();
  assert.equal(nodes(tree).find(node => node.props.type === 'password').props.value, '');
});

const installedServer = process.env.DSH_INSTALLED_SETTINGS_SERVER;
test('installed native secret redaction omits values and mutation preserves unspecified secret', { skip: !installedServer && 'Set DSH_INSTALLED_SETTINGS_SERVER to extracted settings index.js' }, async () => {
  const source = readFileSync(installedServer, 'utf8');
  const start = source.indexOf('function isRecord(');
  const end = source.indexOf('//#endregion', start);
  const redact = runInNewContext(source.slice(start, end) + '\nredactSecrets;');
  const schema = { type: 'object', dict: { enabled: { type: 'boolean' }, appId: { type: 'string' }, appSecret: { type: 'string', meta: { role: 'secret' } } } };
  const result = redact(schema, { enabled: true, appId: 'app', appSecret: 'native-raw-secret' });
  assert.equal(result.value.appSecret, undefined);
  assert.equal(result.secrets[0].path.join('.'), 'appSecret');
  assert.equal(result.secrets[0].set, true);
  assert.equal(JSON.stringify(result).includes('native-raw-secret'), false);
  const methodStart = source.indexOf('\tasync mutate(ns, ops, expectedRevision) {');
  const methodEnd = source.indexOf('\n\tasync write(', methodStart);
  assert.ok(methodStart > 0 && methodEnd > methodStart);
  const service = runInNewContext('({' + source.slice(methodStart, methodEnd) + '})', {
    applyPathOp: (value, op) => ({ ...value, [op.path[0]]: op.value }),
  });
  let stored = { enabled: false, appId: 'app', appSecret: 'native-raw-secret' };
  service.write = async (ns, change, expected) => { assert.equal(ns, 'feishu-oauth'); assert.equal(expected, 4); stored = change(stored, {}, schema); };
  await service.mutate('feishu-oauth', [{ op: 'set', path: ['enabled'], value: true }], 4);
  assert.equal(stored.appSecret, 'native-raw-secret');
  await service.mutate('feishu-oauth', [{ op: 'set', path: ['appSecret'], value: 'replacement' }], 4);
  assert.equal(stored.appSecret, 'replacement');
});

const installedClient = process.env.DSH_INSTALLED_SETTINGS_CLIENT;
test('official installed ConfigFormController carries atomic edits and fixed revisions over settings RPC', { skip: !installedClient && 'Set DSH_INSTALLED_SETTINGS_CLIENT to extracted official ui-settings client.js' }, async () => {
  const source = readFileSync(installedClient, 'utf8');
  const start = source.indexOf('var ConfigFormController = class {');
  const end = source.indexOf('\n\t\t};', start) + '\n\t\t};'.length;
  assert.ok(start > 0 && end > start);
  const createSnapshotStore = initial => {
    let value = initial;
    return { getSnapshot: () => value, subscribe: () => () => {}, update(fn) { value = { ...value }; fn(value); } };
  };
  const Controller = runInNewContext(source.slice(start, end) + '\nConfigFormController;', { structuredClone, _deepseek_ai_dsh_client_store: { createSnapshotStore } });
  let mirrored = { view: { writable: true, namespaces: [{ ns: 'feishu-oauth', revision: 4, value: { enabled: false }, schema: {} }] } };
  let notify, request;
  const mirror = { getSnapshot: () => mirrored, subscribe(fn) { notify = fn; return () => {}; }, acceptView(view) { mirrored = { view: { writable: true, namespaces: [view] } }; notify(); } };
  const ctx = { remote: { settings: { async mutate(...args) { request = args; return { ok: true, value: { ns: 'feishu-oauth', revision: 5, value: { enabled: true }, schema: {} } }; } } } };
  const controller = new Controller(ctx, { namespace: 'feishu-oauth' }, mirror, { rehydrate: v => v, validate: () => undefined });
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().value.enabled, false);
  const ops = [{ op: 'set', path: ['enabled'], value: true }, { op: 'set', path: ['appId'], value: 'app' }];
  assert.equal(await controller.mutate(ops, 4), true);
  assert.equal(request[0], 'feishu-oauth'); assert.deepEqual(request[1], ops); assert.equal(request[2], 4);
  assert.equal(controller.getSnapshot().revision, 5);
  await controller.dispose();
});
