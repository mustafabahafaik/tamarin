// Worker testi: node tests/worker.test.mjs   (proje kökünden; fetch ve KV taklit, ağ yok)
// Token yoksa/yanlışsa 401, CORS başlıkları ve izinsiz köken, Gemini 429 → { error: "quota" }, dakika/gün sınırı,
// gövde boyutu, yanıtın sade biçime çevrilmesi (thoughtSignature aynen), anahtarın URL'de olmaması.
import assert from 'node:assert/strict';

const W = await import('../worker/src/index.js');
const worker = W.default;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const TOKEN = 'deneme-erisim-kodu-0000-1111';
const ORIGIN = 'https://mustafabahafaik.github.io';

function kv() {
  const map = new Map();
  return { map, get: async (k) => (map.has(k) ? map.get(k) : null), put: async (k, v) => { map.set(k, v); } };
}
const env = (extra = {}) => ({ GEMINI_API_KEY: 'gizli-anahtar', TAMARIN_TOKEN: TOKEN, RATE: kv(), ...extra });

function req(path, { method = 'POST', origin = ORIGIN, token = TOKEN, body = { messages: [{ role: 'user', parts: [{ text: 'Merhaba' }] }], context: '{"a":1}' } } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`https://tamarin-asistan.example.workers.dev${path}`, { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
}

let calls = [];
function mockGemini(status, payload) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

await test('erişim kodu yoksa ya da yanlışsa 401; CORS başlığı izinli kökene yine eklenir', async () => {
  mockGemini(200, {});
  for (const token of [null, 'yanlis']) {
    const res = await worker.fetch(req('/chat', { token }), env());
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'auth' });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }
  assert.equal(calls.length, 0, "Gemini'ye gidilmedi");
});

await test('basit istek: kod gövdede (text/plain, başlık yok) kabul edilir; yanlış gövde kodu 401', async () => {
  mockGemini(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'Merhaba Baha' }] } }] });
  const simple = (token, path = '/chat') => new Request(`https://tamarin-asistan.example.workers.dev${path}`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ token, messages: [{ role: 'user', parts: [{ text: 'Merhaba' }] }], context: '{}' }),
  });
  const ok = await worker.fetch(simple(TOKEN), env());
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).text, 'Merhaba Baha');
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.ok(!JSON.parse(calls[0].init.body).contents.some((c) => JSON.stringify(c).includes(TOKEN)), "kod Gemini'ye gitmez");
  assert.equal((await worker.fetch(simple('yanlis'), env())).status, 401);
  assert.deepEqual(await (await worker.fetch(simple(TOKEN, '/ping'), env())).json(), { ok: true, model: W.MODEL });
});

await test('CORS: izinli kökenler için ön uçuş (OPTIONS) 204 + başlıklar; izinsiz köken 403, başlık yok', async () => {
  for (const origin of ['https://mustafabahafaik.github.io', 'http://localhost:5190']) {
    const res = await worker.fetch(req('/chat', { method: 'OPTIONS', origin, token: null }), env());
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    assert.match(res.headers.get('Access-Control-Allow-Headers'), /Cache-Control, Pragma/); // Safari ekleyebilir
    assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
  }
  const bad = await worker.fetch(req('/chat', { origin: 'https://kotu.example' }), env());
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

await test("Gemini 429 / RESOURCE_EXHAUSTED → istemciye 429 { error: 'quota' }", async () => {
  mockGemini(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } });
  const res = await worker.fetch(req('/chat'), env());
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'quota' });
  mockGemini(400, { error: { status: 'RESOURCE_EXHAUSTED' } });
  assert.deepEqual(await (await worker.fetch(req('/chat'), env())).json(), { error: 'quota' });
});

await test('başarılı yanıt sade biçime çevrilir: text, toolCalls, content (thoughtSignature aynen); anahtar başlıkta', async () => {
  mockGemini(200, {
    candidates: [{
      finishReason: 'STOP',
      content: { role: 'model', parts: [
        { text: 'Tamam, ekliyorum.' },
        { functionCall: { id: 'fc1', name: 'add_task', args: { title: 'Dişçi', date: '2026-11-21' } }, thoughtSignature: 'SIG_A' },
      ] },
    }],
  });
  const res = await worker.fetch(req('/chat'), env());
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.text, 'Tamam, ekliyorum.');
  assert.deepEqual(out.toolCalls, [{ id: 'fc1', name: 'add_task', args: { title: 'Dişçi', date: '2026-11-21' } }]);
  assert.equal(out.content.parts[1].thoughtSignature, 'SIG_A');
  const call = calls[0];
  assert.match(call.url, new RegExp(`/models/${W.MODEL}:generateContent$`));
  assert.ok(!call.url.includes('gizli-anahtar'), 'anahtar URL\'de değil');
  assert.equal(call.init.headers['x-goog-api-key'], 'gizli-anahtar');
  const sent = JSON.parse(call.init.body);
  assert.match(sent.systemInstruction.parts[0].text, /Tamarin'sin/);
  assert.match(sent.systemInstruction.parts[0].text, /\{"a":1\}/);
  assert.equal(sent.generationConfig.maxOutputTokens, 600);
  assert.equal(sent.tools[0].functionDeclarations.length, 10);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

await test('yoğunluk: 503 gelince sıradaki Flash modeline geçer; hepsi 503 ise { error: "busy" }; 400 denenmez', async () => {
  let n = 0;
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    n++;
    if (n === 1) return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'ikinci model' }] } }] }), { status: 200 });
  };
  const res = await worker.fetch(req('/chat'), env());
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.text, 'ikinci model');
  assert.equal(out.model, W.MODELS[1]);
  assert.deepEqual(calls.map((c) => c.url.match(/models\/([^:]+):/)[1]), W.MODELS.slice(0, 2));
  assert.ok(W.MODELS.every((m) => /flash/.test(m) && !/pro/.test(m)), 'yalnızca Flash, Pro yok');

  mockGemini(503, { error: { code: 503, status: 'UNAVAILABLE' } });
  const busy = await worker.fetch(req('/chat'), env());
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).error, 'busy');
  assert.equal(calls.length, W.MODELS.length, 'her model bir kez');

  mockGemini(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'kötü şema' } });
  const bad = await (await worker.fetch(req('/chat'), env())).json();
  assert.equal(bad.error, 'gemini');
  assert.match(bad.detail, /INVALID_ARGUMENT kötü şema/);
  assert.equal(calls.length, 1, '400 başka modelde denenmez');
});

await test('istek sınırı: dakikada 10 (11. istek 429 rate), günde 150 (429 day)', async () => {
  mockGemini(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }] });
  const e = env();
  for (let i = 0; i < 10; i++) assert.equal((await worker.fetch(req('/chat'), e)).status, 200);
  const res = await worker.fetch(req('/chat'), e);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'rate' });
  // Gün sınırı: sayaç 150'de
  const store = kv();
  const now = Date.now();
  store.map.set(`d:${new Date(now + 3 * 3600000).toISOString().slice(0, 10)}`, '150');
  assert.equal(await W.checkLimit(store, now), 'day');
  assert.equal(await W.checkLimit(kv(), now), null);
});

await test('gövde 48 KB üstü 413; bozuk JSON ve geçersiz mesajlar 400; /ping Gemini\'yi çağırmaz', async () => {
  mockGemini(200, {});
  const big = JSON.stringify({ messages: [{ role: 'user', parts: [{ text: 'x'.repeat(50 * 1024) }] }], context: '{}' });
  assert.equal((await worker.fetch(req('/chat', { body: big }), env())).status, 413);
  assert.equal((await worker.fetch(req('/chat', { body: '{bozuk' }), env())).status, 400);
  assert.equal((await worker.fetch(req('/chat', { body: { messages: [{ role: 'system', parts: [{ text: 'x' }] }] } }), env())).status, 400);
  assert.equal((await worker.fetch(req('/chat', { body: { messages: [] } }), env())).status, 400);
  const ping = await worker.fetch(req('/ping', { body: {} }), env());
  assert.deepEqual(await ping.json(), { ok: true, model: W.MODEL });
  assert.equal(calls.length, 0);
  assert.equal((await worker.fetch(req('/baska'), env())).status, 404);
  // Sağlık adresi: GET, erişim kodu gerekmez, sır ya da model bilgisi vermez.
  const health = await worker.fetch(req('/health', { method: 'GET', token: null, origin: null }), env());
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'tamarin-asistan' });
  assert.equal(calls.length, 0);
});

await test('sırlar eksikse 500 config; içerik loglanmaz (console.* yok)', async () => {
  const res = await worker.fetch(req('/chat'), { RATE: kv() });
  assert.equal(res.status, 500);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
  assert.ok(!/console\./.test(src.replace(/\/\/.*$/gm, '')));
});

console.log(`\n${passed} test geçti${process.exitCode ? ', bazıları başarısız' : ''}.`);
