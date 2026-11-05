import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { mount } from '../src/server/oauth.js';

const webserverFile = process.env.DSH_NATIVE_WEBSERVER_JS;
const frontendFile = process.env.DSH_NATIVE_FRONTEND_JS;
const skip = !webserverFile || !frontendFile
  ? 'set DSH_NATIVE_WEBSERVER_JS and DSH_NATIVE_FRONTEND_JS to extracted installed lib/index.js files'
  : false;

// Only native resource/render code is executed here. Authentication and Cordis
// effects are local fixtures; this does not prove native cookie verification.
async function fixture(t) {
  const [webserver, frontend] = await Promise.all([
    readFile(webserverFile, 'utf8'), readFile(frontendFile, 'utf8'),
  ]);
  const injectionsStart = webserver.indexOf('function escapeHtmlAttribute(');
  const injectionsEnd = webserver.indexOf('//#endregion', injectionsStart);
  assert.ok(injectionsStart >= 0 && injectionsEnd > injectionsStart, 'native injection implementation exists');
  const methods = ['register', 'registerFallback', 'readResource', 'responderFor', 'match',
    'applyIndexTaps', 'collectIndexInjections', 'renderIndex'].map(name => {
    const match = webserver.match(new RegExp(`\\t(?:async )?${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\t\\}`));
    assert.ok(match, `installed webserver implements ${name}`);
    return match[0];
  });
  const staticStart = frontend.indexOf('const HTML_MIME =');
  const staticEnd = frontend.indexOf('//#endregion', staticStart);
  assert.ok(staticStart >= 0 && staticEnd > staticStart, 'native static resource implementation exists');
  const context = vm.createContext({ Buffer, URL, Request, Response, Headers, ReadableStream,
    createHash, readFile, dirname, extname, join, normalize, resolve, sep });
  // Extraction avoids booting the installed server or resolving Electron/asar imports.
  // Marker assertions fail loudly when the installed artifact layout changes.
  vm.runInContext(`${webserver.slice(injectionsStart, injectionsEnd)}
    const RESOURCE_METHODS = 'GET, HEAD';
    globalThis.NativeResources = class { ${methods.join('\n')} };
    ${frontend.slice(staticStart, staticEnd)}
    globalThis.applyFrontend = apply;`, context);
  const directory = await mkdtemp(join(tmpdir(), 'dsh-native-root-test-'));
  t.after(() => {
    assert.equal(dirname(directory), tmpdir());
    assert.ok(directory.startsWith(join(tmpdir(), 'dsh-native-root-test-')));
    return rm(directory, { recursive: true, force: true });
  });
  const html = '<!doctype html><html><head><title>Native fixture</title></head><body><main>NATIVE_PRIVATE_BODY</main></body></html>';
  const distIndex = join(directory, 'index.html');
  await writeFile(distIndex, html);
  const disposers = [], reads = [], admissions = [], renderedPeers = [];
  const peer = { id: 'test-browser-peer' };
  const boot = { transport: 'test-only', peer: peer.id, marker: 'NATIVE_BOOT_CONTENT' };
  const server = new context.NativeResources();
  Object.assign(server, { protocol: 'https:', exact: new Map(), prefixes: new Map(),
    indexTaps: [value => value.replace('</body>', '<aside>NATIVE_INDEX_TAP</aside></body>')],
    ctx: { emit(event, rows, renderedPeer) {
      assert.equal(event, 'webserver/index-inject');
      renderedPeers.push(renderedPeer);
      rows.push({ kind: 'global', name: '__DSH_BOOT__', value: boot });
    } },
  });
  const nativeRead = server.readResource;
  server.readResource = function(request, admittedPeer) {
    reads.push({ request, peer: admittedPeer });
    return nativeRead.call(this, request, admittedPeer);
  };
  let mode = 'cookie';
  const ctx = { webServer: server, connection: { browserPeer: peer,
    isTrusted: req => req.headers.host === 'dsh.example',
    authorizeIndex(req, res) {
      admissions.push(req);
      if (mode === 'throw') throw Error('PRIVATE_AUTH_FAILURE');
      if (mode === 'cookie' && req.headers.cookie === 'test-native-session=accepted') return true;
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end('PRIVATE_DENIAL_BODY');
      return false;
    },
  }, effect(setup) { disposers.push(setup()); } };
  context.applyFrontend(ctx, { distIndex });
  mount(ctx, { enabled: true, appId: 'test-app', appSecret: 'test-secret' });
  t.after(async () => { for (const dispose of disposers.reverse()) await dispose(); });
  return { reads, admissions, renderedPeers, peer, boot,
    setMode(value) { mode = value; },
    async request(cookie) {
      const res = { status: undefined, headers: {}, body: '',
        writeHead(status, headers = {}) { this.status = status; this.headers = headers; this.headersSent = true; },
        end(body = '') { this.body = body.toString(); },
      };
      await server.exact.get('/').handler({ method: 'GET', url: '/', headers: { host: 'dsh.example', cookie } }, res);
      return res;
    },
  };
}

test('authenticated plugin root reads installed native index resource and renders boot without redirect', { skip }, async t => {
  const f = await fixture(t);
  const res = await f.request('test-native-session=accepted');
  assert.equal(res.status, 200);
  assert.equal(new Headers(res.headers).has('location'), false);
  assert.match(res.headers['content-type'], /^text\/html/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(f.admissions.length, 1);
  assert.equal(f.reads.length, 1);
  assert.ok(f.reads[0].request instanceof Request);
  assert.equal(f.reads[0].request.url, 'https://dsh.example/index.html');
  assert.equal(f.reads[0].request.method, 'GET');
  assert.equal(f.reads[0].peer, f.peer);
  assert.deepEqual(f.renderedPeers, [f.peer]);
  assert.match(res.body, /NATIVE_PRIVATE_BODY/);
  assert.match(res.body, /<base href="\.\/">/);
  assert.ok(res.body.includes(`globalThis["__DSH_BOOT__"] = ${JSON.stringify(f.boot)}`));
  assert.match(res.body, /__DSH_BOOT_READY__/);
  assert.match(res.body, /NATIVE_INDEX_TAP/);
  assert.doesNotMatch(res.body, /http-equiv="refresh"/);
});

test('anonymous plugin root never reads the native resource', { skip }, async t => {
  const f = await fixture(t);
  const res = await f.request();
  assert.equal(res.status, 200);
  assert.match(res.body, /Sign in with Feishu/);
  assert.equal(f.admissions.length, 1);
  assert.equal(f.reads.length, 0);
  assert.equal(f.renderedPeers.length, 0);
  assert.doesNotMatch(res.body, /NATIVE_PRIVATE_BODY|__DSH_BOOT__|PRIVATE_DENIAL_BODY/);
});

test('native admission refusal or exception cannot expose the index body', { skip }, async t => {
  for (const mode of ['deny', 'throw']) {
    const f = await fixture(t);
    f.setMode(mode);
    const res = await f.request('test-native-session=accepted');
    assert.equal(res.status, mode === 'deny' ? 200 : 400);
    assert.equal(f.admissions.length, 1);
    assert.equal(f.reads.length, 0);
    assert.equal(f.renderedPeers.length, 0);
    assert.equal(new Headers(res.headers).has('location'), false);
    assert.doesNotMatch(res.body, /NATIVE_PRIVATE_BODY|__DSH_BOOT__|PRIVATE_AUTH_FAILURE|PRIVATE_DENIAL_BODY/);
  }
});
