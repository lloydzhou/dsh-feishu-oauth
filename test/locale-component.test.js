import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import en from '../locale/en.json' with { type: 'json' };
import zh from '../locale/zh.json' with { type: 'json' };

const dependencyRoot = process.env.DSH_COMPONENT_DEPS;
const primitivesPath = process.env.DSH_INSTALLED_PRIMITIVES_CLIENT;
test('real React editor localizes live state and saves native switch clicks atomically', {
  skip: (!dependencyRoot || !primitivesPath) && 'Set DSH_COMPONENT_DEPS and DSH_INSTALLED_PRIMITIVES_CLIENT for real React/jsdom/native Switch coverage',
}, async () => {
  const require = createRequire(`${dependencyRoot}/package.json`);
  const { JSDOM } = require('jsdom');
  const React = require('react');
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3080' });
  const previous = Object.fromEntries(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let root;
  try {
    const { createRoot } = require('react-dom/client');
    let primitives, plugin, Card, entry;
    const load = (file, resolve) => runInNewContext(readFileSync(file, 'utf8'), {
      window: { location: dom.window.location, __ModuleLoader__: { load(module) { const exports = module.factory(resolve); if (module.id === 'dsh-feishu-oauth') plugin = exports; else primitives = exports; } } },
    });
    load(primitivesPath, require);
    assert.equal(typeof primitives.Switch, 'function');
    load(new URL('../dist/client.js', import.meta.url), id => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id));
    const saves = [];
    let accept = false;
    const form = { mutate: async (ops, revision) => { saves.push(JSON.parse(JSON.stringify({ ops, revision }))); return accept; } };
    plugin.apply({
      effect: setup => setup(), locale: { register: () => () => {} },
      configForms: { get: () => form, whileServed: (_names, setup) => setup() },
      slots: { inject: (_slot, setup) => setup(), register(meta, component) { entry = meta; Card = component; return () => {}; } },
    });
    let language = en;
    let view = { status: 'ready', writable: true, revision: 12, value: { enabled: false, appId: 'app', appSecret: 'never-show' } };
    const render = () => root.render(React.createElement(Card, { ...entry.inject(), t: key => { assert.ok(key in language.settings, key); return language.settings[key]; }, useConfig: select => select(view) }));
    const container = dom.window.document.getElementById('root');
    root = createRoot(container);
    await React.act(render);
    const toggle = () => container.querySelector('[role="switch"]');
    const button = type => container.querySelector(`button[type="${type}"]`);
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
    assert.equal(toggle().getAttribute('aria-label'), en.settings.enabled);
    assert.equal(container.querySelector('input[type="password"]').value, '');
    assert.ok(!container.innerHTML.includes('never-show'));
    await React.act(() => toggle().click());
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    await React.act(() => button('submit').click());
    assert.deepEqual(saves[0], { revision: 12, ops: [{ op: 'set', path: ['enabled'], value: true }, { op: 'set', path: ['appId'], value: 'app' }] });
    assert.ok(container.textContent.includes(en.settings.conflict));
    language = zh;
    await React.act(render);
    assert.equal(toggle().getAttribute('aria-checked'), 'true');
    assert.ok(container.textContent.includes(zh.settings.conflict));
    assert.equal(toggle().getAttribute('aria-label'), zh.settings.enabled);
    accept = true;
    view = { ...view, revision: 13 };
    await React.act(render);
    await React.act(() => button('submit').click());
    assert.equal(saves[1].revision, 12);
    assert.ok(container.textContent.includes(zh.settings.saved));
    assert.equal(toggle().disabled, true);
    await React.act(() => button('button').click());
    assert.equal(toggle().disabled, false);
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
    view = { ...view, writable: false };
    await React.act(render);
    assert.equal(toggle().disabled, true);
    assert.ok(container.textContent.includes(zh.settings.readOnly));
  } finally {
    if (root) await React.act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
