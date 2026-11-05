import { mount } from './oauth.js';

/** Keep the UI served while OAuth is off; each committed edit revokes old login attempts. */
export function mountSettings(ctx, config, mountRoutes = mount) {
  let disposers = [];
  let closed = false;
  let generation = 0;
  let tail = Promise.resolve();
  const snapshot = () => Object.fromEntries(Object.entries(config).map(([key, value]) => [key,
    value && typeof value.get === 'function' ? value.get() : value]));
  let requested = snapshot();
  const stop = () => {
    const owned = disposers;
    disposers = [];
    // Invoke every disposer synchronously: routes disappear and in-flight requests abort immediately.
    const results = owned.reverse().map(dispose => {
      try { return Promise.resolve(dispose()); } catch { return Promise.reject(new Error('OAuth cleanup failed')); }
    });
    return Promise.all(results);
  };
  const start = () => mountRoutes({
    connection: ctx.connection,
    webServer: ctx.webServer,
    effect(setup) { const dispose = setup(); if (typeof dispose === 'function') disposers.push(dispose); },
  }, snapshot());
  const failed = () => {
    // Provider and configuration errors may contain credentials; never forward their messages.
    ctx.logger?.warn('feishu-oauth: configuration could not be activated; native token login remains available');
  };
  try { start(); } catch { tail = stop().catch(failed); failed(); }
  ctx.on('loader/volatile-update', () => {
    const next = snapshot();
    if (JSON.stringify(next) === JSON.stringify(requested)) return tail;
    requested = next;
    const revision = ++generation;
    const stopping = stop();
    // Observe cleanup rejection immediately even while an older update is settling.
    const settled = stopping.then(() => true, () => false);
    tail = tail.then(async () => {
      if (!await settled) { failed(); return; }
      if (closed || revision !== generation) return;
      try { start(); } catch { await stop(); failed(); }
    }).catch(failed);
    return tail;
  });
  ctx.effect(() => async () => {
    closed = true;
    generation++;
    await Promise.all([stop(), tail]);
  }, 'feishu-oauth: live configuration');
}
