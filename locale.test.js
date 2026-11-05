import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import en from './locale/en.json' with { type: 'json' };
import zh from './locale/zh.json' with { type: 'json' };
import { validateSettings } from './settings-form.js';

test('English and Chinese metadata and settings have matching nonempty language keys', () => {
  for (const section of ['meta', 'settings']) {
    assert.deepEqual(Object.keys(en[section]).sort(), Object.keys(zh[section]).sort());
    for (const language of [en, zh]) for (const text of Object.values(language[section])) assert.ok(typeof text === 'string' && text.trim());
  }
  assert.match(en.meta.title, /Feishu/);
  assert.match(zh.meta.title, /飞书/);
});

test('native locale registration supplies both languages, scopes the slot, and disposes', () => {
  let plugin, dictionary, entry, active = false;
  const effects = [];
  runInNewContext(readFileSync(new URL('./client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: module => { plugin = module.factory(() => ({})); } } },
  });
  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'configForms']);
  plugin.apply({
    effect: setup => effects.push(setup()),
    locale: { register(namespace, value) { assert.equal(namespace, 'settings.feishuOAuth'); dictionary = value; active = true; return () => { active = false; }; } },
    configForms: { get: () => ({}), whileServed: (_names, setup) => setup() },
    slots: { inject: (_slot, setup) => setup(), register(meta) { entry = meta; return () => {}; } },
  });
  assert.equal(active, true);
  assert.equal(entry.locale, 'settings.feishuOAuth');
  assert.deepEqual(JSON.parse(JSON.stringify(dictionary)), { en: en.settings, zh: zh.settings });
  effects.reverse().forEach(dispose => dispose());
  assert.equal(active, false);
});

test('every validation branch uses a translatable key in each language', () => {
  const valid = { enabled: false, appId: '', appSecret: '' };
  const cases = [
    [{ enabled: 'yes' }, 'invalidEnabled'],
    [{ appId: ' app' }, 'invalidAppId'],
    [{ appSecret: ' secret' }, 'invalidAppSecret'],
    [{ enabled: true }, 'missingAppId'],
  ];
  for (const dictionary of [en.settings, zh.settings]) {
    for (const [patch, key] of cases) assert.equal(validateSettings({ ...valid, ...patch }, key => dictionary[key]), dictionary[key]);
    assert.equal(validateSettings(valid, key => dictionary[key]), '');
  }
});
