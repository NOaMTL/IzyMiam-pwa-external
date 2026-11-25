const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(fetch) {
  const data = new Map([['prep_token', 'old'], ['prep_refresh', 'secret']]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const exports = {};
  const context = { exports, process: { env: {} }, fetch, localStorage: storage, window: { location: { pathname: '/', href: '/' } } };
  const code = ts.transpileModule(fs.readFileSync('lib/api.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, context);
  return { api: exports, data, context };
}
const reply = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const refreshed = () => reply(200, { success: true, data: { token: 'new', user: {} } });

test('concurrent expired requests share one renewal and retry with new token', async () => {
  let renewals = 0;
  const { api, data } = setup(async (url, init) => {
    if (url.endsWith('/refresh')) { renewals++; await new Promise(r => setTimeout(r, 10)); return refreshed(); }
    return init.headers.Authorization === 'Bearer new' ? reply(200, { data: [] }) : reply(401);
  });
  await Promise.all([api.fetchTodoOrders(), api.fetchTodoOrders()]);
  assert.equal(renewals, 1); assert.equal(data.get('prep_token'), 'new');
});
for (const status of [429, 500]) test(`temporary ${status} preserves session`, async () => {
  const { api, data } = setup(async url => reply(url.endsWith('/refresh') ? status : 401));
  await assert.rejects(api.fetchTodoOrders());
  assert.equal(data.get('prep_refresh'), 'secret');
});
test('network interruption preserves session', async () => {
  const { api, data } = setup(async url => { if (url.endsWith('/refresh')) throw Error('offline'); return reply(401); });
  await assert.rejects(api.fetchTodoOrders()); assert.equal(data.get('prep_refresh'), 'secret');
});
test('revoked refresh clears credentials', async () => {
  const { api, data, context } = setup(async () => reply(401));
  await assert.rejects(api.fetchTodoOrders()); assert.equal(data.size, 0);
  assert.equal(context.window.location.href, '/login?expired=1');
});
test('second 401 stops retrying', async () => {
  let calls = 0;
  const { api } = setup(async url => { calls++; return url.endsWith('/refresh') ? refreshed() : reply(401); });
  await assert.rejects(api.fetchTodoOrders()); assert.equal(calls, 3);
});
test('logout during renewal never restores session', async () => {
  let resolve, started;
  const ready = new Promise(r => started = r);
  const { api, data } = setup(async url => {
    if (url.endsWith('/refresh')) { started(); return new Promise(r => resolve = r); }
    return reply(url.endsWith('/logout') ? 200 : 401);
  });
  const request = api.fetchTodoOrders(); await ready;
  api.logout(); resolve(refreshed());
  await assert.rejects(request); assert.equal(data.size, 0);
});
test('wrong login credentials do not renew an existing session', async () => {
  let calls = 0;
  const { api } = setup(async () => { calls++; return reply(401); });
  await assert.rejects(api.login('a', 'b')); assert.equal(calls, 1);
});
