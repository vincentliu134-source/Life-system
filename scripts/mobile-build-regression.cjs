const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

async function run() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'life-mobile-build-'));
  try {
    fs.mkdirSync(path.join(temporary, 'scripts'));
    fs.mkdirSync(path.join(temporary, 'dist-mobile'));
    fs.copyFileSync(path.join(__dirname, 'build-mobile.cjs'), path.join(temporary, 'scripts/build-mobile.cjs'));
    const html = path.join(temporary, 'dist-mobile/index.html');
    fs.writeFileSync(html, 'first');
    const build = base => {
      execFileSync(process.execPath, [path.join(temporary, 'scripts/build-mobile.cjs')], { env: { ...process.env, MOBILE_BASE_PATH: base } });
      return fs.readFileSync(path.join(temporary, 'dist-mobile/sw.js'), 'utf8');
    };
    for (const base of ['/', '/life-system/']) {
      const source = build(base);
      const handlers = {};
      let assets;
      const deleted = [];
      let prefix;
      let cacheName;
      const cachedResponse = { offline: true };
      vm.runInNewContext(source + '\nglobalThis.testPrefix=PREFIX;globalThis.testCache=CACHE;', {
        URL,
        self: { location: { origin: 'https://example.github.io' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {}, clients: { claim() {} } },
        caches: {
          open: async () => ({ addAll: async values => { assets = Array.from(values); }, match: async () => cachedResponse }),
          keys: async () => [cacheName, prefix + 'old', 'life-six-mobile-unrelated'],
          delete: async key => { deleted.push(key); },
        },
        fetch: () => { throw new Error('Cached offline requests must not use the network'); },
        get testPrefix() { return prefix; }, set testPrefix(value) { prefix = value; },
        get testCache() { return cacheName; }, set testCache(value) { cacheName = value; },
      });
      const event = () => ({ waitUntil(promise) { this.pending = promise; } });
      const install = event(); handlers.install(install); await install.pending;
      assert.deepEqual(assets, [base, base + 'index.html']);
      const activate = event(); handlers.activate(activate); await activate.pending;
      assert.deepEqual(deleted, [prefix + 'old'], 'must preserve other apps on the same GitHub Pages origin');
      for (const pathname of ['/api/state', ...(base === '/' ? [] : ['/another-project/'])]) {
        handlers.fetch({ request: { method: 'GET', url: 'https://example.github.io' + pathname }, respondWith() { assert.fail('Must not intercept outside its scope'); } });
      }
      const request = event();
      request.request = { method: 'GET', url: 'https://example.github.io' + base };
      request.respondWith = promise => { request.response = promise; };
      handlers.fetch(request);
      assert.equal(await request.response, cachedResponse);
      fs.writeFileSync(html, 'other');
      assert.notEqual(build(base), source, 'same-size content changes must invalidate cached files');
      fs.writeFileSync(html, 'first');
    }
    console.log('PASS: root/repository mobile paths, scoped offline cache, cache cleanup and content updates.');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
