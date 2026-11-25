import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSettings } from '../src/server/settings.js';

// Provider hosts: the authentication registry owns registrations as its own
// effects, so a plugin that drops the disposer keeps admitting sessions signed
// with a rotated secret until the host restarts. These tests pin that the
// registration lives and dies with the plugin.

function fixture(values) {
  const providers = new Set();
  const routes = new Map();
  const listeners = new Map();
  const disposers = [];
  const registry = {
    register(provider) {
      providers.add(provider);
      return () => providers.delete(provider);
    },
  };
  const connection = { isTrustedRequest: () => true, createPeer: () => ({ peer: true }), browserPeer: {} };
  const ctx = {
    connection,
    webServer: {
      protocol: 'https:',
      register(route) {
        if (routes.has(route.path)) throw Error('duplicate');
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
    reflect: { get(name) { return name === 'connection.authentication' ? registry : name === 'connection' ? connection : undefined; } },
    on(name, listener) { listeners.set(name, listener); return () => listeners.delete(name); },
    effect(setup) { const dispose = setup(); if (typeof dispose === 'function') disposers.push(dispose); },
    logger: { warn() { throw Error('activation must not fail'); } },
  };
  const refs = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => values[key] }]));
  mountSettings(ctx, refs);
  return {
    values,
    providers,
    routes,
    listeners,
    close: async () => { for (const dispose of disposers.reverse()) await dispose?.(); },
  };
}

test('a committed credential change swaps the provider instead of leaking the old one', async () => {
  const f = fixture({ enabled: true, appId: 'app', appSecret: 'secret', publicUrl: '' });
  assert.equal(f.providers.size, 1, 'one provider after the first activation');
  const first = [...f.providers][0];

  f.values.appSecret = 'rotated';
  await f.listeners.get('loader/volatile-update')();
  assert.equal(f.providers.size, 1, 'remount must not accumulate providers');
  assert.notEqual([...f.providers][0], first, 'the stale provider is disposed and replaced');

  await f.close();
  assert.equal(f.providers.size, 0, 'disposal unregisters the provider');
});

test('repeated settings changes keep exactly one provider registered', async () => {
  const f = fixture({ enabled: true, appId: 'app', appSecret: 'secret', publicUrl: '' });
  for (const secret of ['s1', 's2', 's3', 's4']) {
    f.values.appSecret = secret;
    await f.listeners.get('loader/volatile-update')();
    assert.equal(f.providers.size, 1, `still one provider after rotating to ${secret}`);
  }
  assert.equal(f.routes.has('/'), false, 'the gateway keeps owning "/" throughout');
  await f.close();
  assert.equal(f.providers.size, 0);
  assert.equal(f.routes.size, 0, 'every route was released with the plugin');
});
