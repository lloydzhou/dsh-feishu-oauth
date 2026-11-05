import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as plugin from 'dsh-feishu-oauth';
import manifest from 'dsh-feishu-oauth/package.json' with { type: 'json' };

const root = new URL('../', import.meta.url);

test('public exports resolve to shipped runtime files without development sources', () => {
  const npmCli = process.env.npm_execpath;
  const args = ['pack', '--dry-run', '--ignore-scripts', '--json', '--cache', join(tmpdir(), 'dsh-feishu-npm-cache')];
  const output = execFileSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args, {
    cwd: fileURLToPath(root), encoding: 'utf8', shell: !npmCli && process.platform === 'win32',
  });
  const [pack] = JSON.parse(output);
  const shipped = new Set(pack.files.map(file => file.path));
  assert.deepEqual(manifest.exports, {
    '.': './src/server/index.js', './client': './dist/client.js',
    './locale/*.json': './locale/*.json', './package.json': './package.json',
  });
  assert.equal(manifest.main, manifest.exports['.']);
  assert.equal(plugin.name, 'feishu-oauth');
  assert.equal(typeof plugin.apply, 'function');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.ok(shipped.has(manifest.dsh.bundle.patch.slice(2)));
  for (const specifier of ['', '/client', '/locale/en.json', '/locale/zh.json', '/package.json']) {
    const resolved = new URL(import.meta.resolve(`dsh-feishu-oauth${specifier}`));
    const path = fileURLToPath(resolved).slice(fileURLToPath(root).length).replaceAll('\\', '/');
    assert.ok(shipped.has(path), `public export is shipped: ${path}`);
    assert.ok(readFileSync(resolved).length);
  }
  for (const path of shipped) {
    assert.doesNotMatch(path, /^(?:test|scripts|src\/client)\/|\.test\.js$/);
    if (!path.startsWith('src/server/') || !path.endsWith('.js')) continue;
    const source = readFileSync(new URL(path, root), 'utf8');
    for (const [, specifier] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue;
      const dependency = posix.normalize(posix.join(posix.dirname(path), specifier));
      assert.ok(shipped.has(dependency), `${path} imports shipped ${dependency}`);
    }
  }
});
