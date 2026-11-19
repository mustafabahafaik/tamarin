// Tamarin asistanı: Cloudflare Worker (Workers Free). Tarayıcı Gemini'ye doğrudan bağlanmaz; bu Worker
// erişim kodunu denetler, kötüye kullanımı sınırlar ve isteği Gemini generateContent'e iletir.
//
//   POST /chat  { messages: [Gemini Content...], context: "<JSON özet>" }
//     → 200 { text, toolCalls: [{ id, name, args }], content }   (content: modelin turu, aynen geri gönderilir)
//   POST /ping  → 200 { ok: true, model }   (Gemini'yi çağırmaz; "Bağlantıyı dene" için)
//   GET /health → 200 { ok: true }   (erişim kodu gerekmez; telefondan tarayıcıyla açıp ulaşılabilirliği görmek için)
//   Hatalar: { error: "auth" | "origin" | "rate" | "day" | "quota" | "too_large" | "bad_request" |
//              "upstream" | "blocked" | "config" | "timeout" }
//
// Sırlar (wrangler secret): GEMINI_API_KEY, TAMARIN_TOKEN. KV: RATE (dakika / gün sayaçları).
// İçerik loglanmaz ve saklanmaz: console.* yok, KV'de yalnızca sayaçlar.
import { SYSTEM, CONTEXT_GUIDE, TOOLS } from '../../js/assistant/declarations.js';

/**
 * Kararlı Flash modelleri (Gemini docs, Kasım 2026: "Stable"; Pro yok), tercih sırasıyla. Tek yer.
 * Ücretsiz katmanda model yoğunken 503 UNAVAILABLE döner: o zaman sıradakine geçilir.
 */
export const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
export const MODEL = MODELS[0];
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
// Yoğunluk / geçici sunucu hatası: sıradaki modeli dene. 429 (kota) ve 400 (istek) denenmez.
const RETRYABLE = new Set([500, 502, 503, 504]);

export const ORIGINS = ['https://mustafabahafaik.github.io', 'http://localhost:5190'];
export const LIMITS = { perMinute: 10, perDay: 150, bodyBytes: 48 * 1024, outputTokens: 600, upstreamMs: 18000 };

const ROLES = new Set(['user', 'model']);
const MAX_MESSAGES = 24; // istemci en çok 10 mesaj + araç yanıtları gönderir

/* ---------- Yanıt yardımcıları ---------- */

function cors(origin) {
  if (!origin || !ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Safari bazı durumlarda Cache-Control / Pragma da ekler; izin verilmezse ön uçuş düşer.
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cache-Control, Pragma',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(origin) },
  });
}

/** Sabit süreli karşılaştırma (erişim kodu zamanlamadan tahmin edilmesin). */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/* ---------- Sınır (KV sayaçları) ---------- */

/** Dakikada 10, günde 150 istek. Aşılırsa "rate" ya da "day"; değilse sayaçları artırır. */
export async function checkLimit(kv, now = Date.now()) {
  if (!kv) return null; // KV bağlanmadıysa sınır yok (yerel geliştirme)
  const minuteKey = `m:${Math.floor(now / 60000)}`;
  const dayKey = `d:${new Date(now + 3 * 3600000).toISOString().slice(0, 10)}`; // İstanbul günü (UTC+3)
  const [minute, day] = await Promise.all([kv.get(minuteKey), kv.get(dayKey)]);
  const m = Number(minute) || 0;
  const d = Number(day) || 0;
  if (m >= LIMITS.perMinute) return 'rate';
  if (d >= LIMITS.perDay) return 'day';
  await Promise.all([
    kv.put(minuteKey, String(m + 1), { expirationTtl: 120 }),
    kv.put(dayKey, String(d + 1), { expirationTtl: 2 * 86400 }),
  ]);
  return null;
}

/* ---------- Doğrulama ---------- */

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Gelen mesajları Gemini Content biçimine temizler; uymayanı reddeder (null). */
export function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of messages) {
    if (!isObj(m) || !ROLES.has(m.role) || !Array.isArray(m.parts) || !m.parts.length || m.parts.length > 16) return null;
    const parts = [];
    for (const p of m.parts) {
      if (!isObj(p)) return null;
      const part = {};
      if (typeof p.text === 'string') part.text = p.text.slice(0, 4000);
      if (isObj(p.functionCall) && typeof p.functionCall.name === 'string') {
        part.functionCall = { name: p.functionCall.name, args: isObj(p.functionCall.args) ? p.functionCall.args : {} };
        if (typeof p.functionCall.id === 'string') part.functionCall.id = p.functionCall.id;
      }
      if (isObj(p.functionResponse) && typeof p.functionResponse.name === 'string') {
        part.functionResponse = { name: p.functionResponse.name, response: isObj(p.functionResponse.response) ? p.functionResponse.response : {} };
        if (typeof p.functionResponse.id === 'string') part.functionResponse.id = p.functionResponse.id;
      }
      if (typeof p.thoughtSignature === 'string') part.thoughtSignature = p.thoughtSignature; // aynen geri gitmeli
      if (p.thought === true) part.thought = true;
      if (!Object.keys(part).length) return null;
      parts.push(part);
    }
    out.push({ role: m.role, parts });
  }
  return out;
}

/* ---------- Gemini ---------- */

/**
 * Gemini'yi çağırır; yoğunluk (5xx) ya da zaman aşımında sıradaki Flash modeline geçer. Toplam süre
 * LIMITS.upstreamMs'i aşmaz. Döner: { res, model } (res: son yanıt) ya da hata fırlatır (hepsi ağdan düştüyse).
 */
async function callGemini(env, contents, context) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: `${SYSTEM}\n\n${CONTEXT_GUIDE}\n\nVERİ:\n${context}` }] },
    contents,
    tools: [{ functionDeclarations: TOOLS }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: LIMITS.outputTokens, thinkingConfig: { thinkingLevel: 'LOW' } },
  });
  const deadline = Date.now() + LIMITS.upstreamMs;
  let last = null;
  let lastErr = null;
  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    try {
      const res = await fetch(geminiUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body,
        signal: AbortSignal.timeout(left),
      });
      last = { res, model };
      if (!RETRYABLE.has(res.status)) return last;
    } catch (err) {
      lastErr = err;
    }
  }
  if (last) return last;
  throw lastErr ?? new Error('upstream');
}

/** Gemini yanıtını istemcinin anlayacağı sade biçime çevirir. */
export function simplify(data) {
  if (data?.promptFeedback?.blockReason) return { error: 'blocked' };
  const candidate = data?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
  const toolCalls = parts.filter((p) => isObj(p.functionCall)).map((p) => ({
    id: typeof p.functionCall.id === 'string' ? p.functionCall.id : undefined,
    name: p.functionCall.name,
    args: isObj(p.functionCall.args) ? p.functionCall.args : {},
  }));
  if (!text && !toolCalls.length && candidate?.finishReason === 'SAFETY') return { error: 'blocked' };
  return { text, toolCalls, content: { role: 'model', parts }, finish: candidate?.finishReason ?? '' };
}

/* ---------- Giriş noktası ---------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    if (origin && !ORIGINS.includes(origin)) return json({ error: 'origin' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    // Tarayıcıdan açılabilen sağlık adresi (sır gerekmez, bilgi vermez): telefon Worker'a ulaşıyor mu?
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'tamarin-asistan' }, 200, origin);
    if (request.method !== 'POST' || !['/chat', '/ping'].includes(url.pathname)) return json({ error: 'bad_request' }, 404, origin);
    if (!env.TAMARIN_TOKEN || !env.GEMINI_API_KEY) return json({ error: 'config' }, 500, origin);

    const declared = Number(request.headers.get('Content-Length'));
    if (declared > LIMITS.bodyBytes) return json({ error: 'too_large' }, 413, origin);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > LIMITS.bodyBytes) return json({ error: 'too_large' }, 413, origin);
    let body = null;
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }

    // Erişim kodu: Authorization: Bearer <kod> ya da gövdede { token }. Uygulama ikincisini kullanır: text/plain
    // gövdeli, özel başlıksız "basit istek" Safari'de CORS ön uçuşu (OPTIONS) hiç gerektirmez.
    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (typeof body?.token === 'string' ? body.token : '');
    if (!sameToken(token, env.TAMARIN_TOKEN)) return json({ error: 'auth' }, 401, origin);
    if (url.pathname === '/ping') return json({ ok: true, model: MODEL }, 200, origin);
    if (!body) return json({ error: 'bad_request' }, 400, origin);
    const contents = cleanMessages(body?.messages);
    const context = typeof body?.context === 'string' ? body.context.slice(0, 12000) : '{}';
    if (!contents) return json({ error: 'bad_request' }, 400, origin);

    const limited = await checkLimit(env.RATE);
    if (limited) return json({ error: limited }, 429, origin);

    let upstream;
    let model;
    try {
      ({ res: upstream, model } = await callGemini(env, contents, context));
    } catch (err) {
      return json({ error: err?.name === 'TimeoutError' ? 'timeout' : 'upstream' }, 504, origin);
    }
    if (!upstream.ok) {
      let err = {};
      try { err = (await upstream.json())?.error ?? {}; } catch { /* gövde yok */ }
      if (upstream.status === 429 || err.status === 'RESOURCE_EXHAUSTED') return json({ error: 'quota' }, 429, origin);
      // Tüm Flash modelleri yoğun (503): sakin bir "meşgul" cevabı.
      if (RETRYABLE.has(upstream.status)) return json({ error: 'busy', status: upstream.status }, 503, origin);
      // Gemini'nin hata açıklaması (şema/model/konum sorunu gibi; kullanıcı verisi ya da anahtar içermez), kısaltılmış.
      const detail = `${upstream.status} ${err.status ?? ''} ${String(err.message ?? '').slice(0, 240)}`.trim();
      return json({ error: 'gemini', status: upstream.status, detail }, 502, origin);
    }
    let data;
    try { data = await upstream.json(); } catch { return json({ error: 'upstream' }, 502, origin); }
    const out = simplify(data);
    if (!out.error) out.model = model;
    return json(out, out.error ? 502 : 200, origin);
  },
};
