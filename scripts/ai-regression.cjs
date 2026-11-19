const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-gemini-'));
process.env.LIFE_DATA_DIR = directory;
delete process.env.GEMINI_API_KEY;
const originalFetch = global.fetch;
const key = 'test-gemini-key';
const requests = [];
let reply;
global.fetch = async (url, init) => {
  requests.push({ url, init, body: JSON.parse(init.body) });
  return reply();
};
const success = (content, finishReason = 'STOP') => () => Response.json({ candidates: [{ content: { parts: [{ text: 'internal thought', thought: true }, { text: content }] }, finishReason }] });
const request = (body, withKey = true) => new Request('http://localhost/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(withKey ? { 'x-gemini-api-key': key } : {}) }, body: JSON.stringify(body),
});
async function run() {
  const store = require('../lib/store.ts');
  const organize = require('../app/api/organize/route.ts');
  const goals = require('../app/api/goals/breakdown/route.ts');
  const clarify = require('../app/api/inbox/[id]/clarify/route.ts');
  const validate = require('../app/api/ai/validate/route.ts');
  reply = success(JSON.stringify([{ title: '练习英语', dimension_primary: '心智' }]));
  let data = await (await organize.POST(request({ input: '练习英语' }))).json();
  assert.equal(data.mode, 'gemini');
  assert.equal(data.tasks[0].title, '练习英语');
  assert.equal((await store.readState()).ai_logs[0].mode, 'gemini');
  reply = success(JSON.stringify({ title: '英语沟通', success_metric: '能独立完成客户需求沟通', dimension_primary: '心智', next_action: '准备一次沟通提纲', deadline: null }));
  data = await (await goals.POST(request({ input: '30天完成英语练习' }))).json();
  assert.equal(data.mode, 'gemini');
  assert.equal(data.suggestion.title, '英语沟通');
  assert.equal(data.suggestion.deadline, null);
  assert.equal(data.suggestion.goal_type, undefined);
  assert.equal(data.suggestion.stage_results, undefined);
  await store.updateState(s => { s.inbox_items.push({ id: 'inbox', content: '明天练习英语', status: '未处理', created_at: new Date().toISOString(), archived_at: null }); });
  reply = success(JSON.stringify({ clarified_type: '今日动作', dimension_primary: '心智', next_action: '跟读英语' }));
  data = await (await clarify.POST(request({}), { params: Promise.resolve({ id: 'inbox' }) })).json();
  assert.equal(data.mode, 'gemini');
  assert.equal(data.clarification.next_action, '跟读英语');
  reply = success('OK');
  data = await (await validate.POST(request({ token: key }))).json();
  assert.equal(data.valid, true);
  for (const { url, init, body } of requests) {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    assert.equal(init.headers['x-goog-api-key'], key);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
    assert.ok(body.contents[0].parts[0].text);
    assert.equal(body.messages, undefined);
  }
  assert.equal(data.modelUsed, 'gemini-3.6-flash');
  assert.equal(requests.at(-1).body.generationConfig.maxOutputTokens, 256);
  assert.equal(requests[0].body.generationConfig.responseMimeType, 'application/json');
  assert.ok(requests[0].body.systemInstruction.parts[0].text);
  const { parseMacProxy } = require('../lib/ai-network.ts');
  assert.equal(parseMacProxy('HTTPSProxy : 127.0.0.1\nHTTPSPort : 7897\nHTTPSEnable : 1'), 'http://127.0.0.1:7897');
  assert.equal(parseMacProxy('HTTPSProxy : 127.0.0.1\nHTTPSPort : 7897\nHTTPSEnable : 0'), '');
  assert.equal(parseMacProxy('HTTPSProxy : ::1\nHTTPSPort : 7897\nHTTPSEnable : 1'), 'http://[::1]:7897');
  let attempts = 0;
  reply = () => ++attempts === 1
    ? Response.json({ error: { message: 'Overloaded' } }, { status: 503 })
    : success('OK')();
  data = await (await validate.POST(request({ token: key }))).json();
  assert.equal(data.valid, true);
  assert.equal(data.modelUsed, 'gemini-3.5-flash-lite');
  assert.ok(requests.at(-1).url.includes('gemini-3.5-flash-lite'));
  reply = () => Response.json({ error: { code: 400, message: `API key not valid: ${key}` } }, { status: 400 });
  data = await (await validate.POST(request({ token: key }))).json();
  assert.equal(data.valid, false);
  assert.equal(data.status, 'invalid');
  assert.ok(!data.error.includes(key), 'errors must redact keys');
  reply = () => Response.json({ error: { message: 'User location is not supported for the API use.' } }, { status: 400 });
  data = await (await validate.POST(request({ token: key }))).json();
  assert.equal(data.valid, false);
  assert.equal(data.status, 'region_unavailable', 'unsupported region is not an invalid key');
  assert.ok(data.error.includes('网络出口地区'));
  reply = () => Response.json({ error: { message: 'Quota exceeded' } }, { status: 429, headers: { 'retry-after': '60' } });
  data = await (await validate.POST(request({ token: key }))).json();
  assert.equal(data.status, 'busy');
  reply = success('[]');
  const previous = requests.length;
  const noKey = await (await organize.POST(request({ input: '练习英语' }, false))).json();
  assert.equal(noKey.mode, 'rules');
  assert.equal(requests.length, previous, 'no key means no remote request');
  process.env.GEMINI_API_KEY = key;
  data = await (await organize.POST(request({ input: '练习英语' }, false))).json();
  assert.equal(requests.at(-1).init.headers['x-goog-api-key'], key);
  delete process.env.GEMINI_API_KEY;
  for (const response of [success(''), success('{broken'), success('[]', 'MAX_TOKENS'), () => { throw new DOMException('timeout', 'TimeoutError'); }]) {
    reply = response;
    data = await (await organize.POST(request({ input: '练习英语' }))).json();
    assert.equal(data.mode, 'rules');
    assert.ok(data.tasks.length);
    assert.ok(data.error);
  }
  assert.equal((await validate.POST(request({ token: '' }))).status, 400);
  reply = () => { throw new TypeError('fetch failed'); };
  data = await (await validate.POST(request({ token: key }))).json();
  assert.equal(data.valid, false);
  assert.equal(data.status, 'unavailable', 'network failure must not mark the key invalid');
  console.log('PASS: Gemini native routing/auth/payload, proxy discovery, model fallback, all three AI features, key validation/redaction, quota, environment key, local fallback, empty/malformed/truncated output and timeout.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  fs.rmSync(directory, { recursive: true, force: true });
});
