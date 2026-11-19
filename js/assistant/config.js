// Asistan ayarları ve Worker istemcisi. Ayarlar ana store'dan AYRI, localStorage "tamarin.assistant"
// anahtarında: { url, token, speak }. Ana yedeğe girmez, "Tüm verileri sil" dokunmaz.
// Erişim kodu yalnızca bu cihazda durur; konsola, URL'ye ve hata mesajına yazılmaz.

const KEY = 'tamarin.assistant';
export const TIMEOUT_MS = 20000;

/** Erişim kodu yalnızca görünür ASCII: yapıştırırken gelen boşluk, satır sonu ve görünmez karakterler atılır
 *  (aksi halde tarayıcı Authorization başlığını hiç göndermez, istek "ağ hatası" gibi düşer). */
export const cleanToken = (t) => String(t ?? '').replace(/[^\x21-\x7e]/g, '');
/** Adres: boşluklar ve görünmez karakterler atılır. */
export const cleanUrl = (u) => String(u ?? '').replace(/[\s\u200b-\u200f\u2060\ufeff]/g, '');

export function loadConfig() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    return { url: typeof v.url === 'string' ? cleanUrl(v.url) : '', token: typeof v.token === 'string' ? cleanToken(v.token) : '', speak: v.speak === true };
  } catch {
    return { url: '', token: '', speak: false };
  }
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  next.url = cleanUrl(next.url);
  next.token = cleanToken(next.token);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* depolama yok: bu oturumda çalışmaz */ }
  return next;
}

/** Google Apps Script aracısı mı (https://script.google.com/macros/s/<id>/exec)? */
export const isAppsScript = (url) => /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(String(url ?? '').trim().replace(/\/+$/, ''));

/**
 * "tamarin-asistan.x.workers.dev/" → "https://tamarin-asistan.x.workers.dev" + yol.
 * Apps Script aracısında tek adres var: /health → adresin kendisi (GET), /ping → ?p=ping, /chat → ?p=chat.
 */
export function endpoint(url, path) {
  let u = String(url ?? '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (isAppsScript(u)) return path === '/health' ? u : `${u}?p=${path.replace(/^\//, '')}`;
  return `${u}${path}`;
}

export class AssistantError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Kullanıcıya gösterilecek sakin Türkçe hata. */
export const ERROR_TEXT = {
  setup: "Önce Ayarlar > Asistan'dan bağlan.",
  offline: 'İnternet yok gibi; bağlanınca tekrar sor.',
  unreachable: "Worker'a ulaşamadım. Adresi kontrol et; mobil veride açılmıyorsa Wi-Fi'de dene.",
  bad_url: 'Worker adresi geçersiz; https:// ile başlayan tam adresi yaz.',
  auth: "Erişim kodu yanlış. Ayarlar > Asistan'dan kontrol et.",
  rate: 'Biraz yavaşla, bir dakika sonra tekrar sor.',
  quota: 'Bugünlük konuşma hakkım doldu, yarın yine konuşuruz.',
  day: 'Bugünlük konuşma hakkım doldu, yarın yine konuşuruz.',
  timeout: 'Cevap gecikti; biraz sonra tekrar dene.',
  aborted: 'Tamam, bu soruyu bıraktım.',
  blocked: 'Buna cevap veremiyorum.',
  origin: 'Bu adresten bağlanılamıyor.',
  too_large: 'Mesaj çok uzun oldu; daha kısa sor.',
  empty: 'Kısa bir cevap bulamadım; başka türlü sorar mısın?',
  server: 'Bir şeyler ters gitti; birazdan tekrar dene.',
  gemini: 'Gemini cevap vermedi; birazdan tekrar dene.',
  busy: 'Gemini şu an çok yoğun; biraz sonra tekrar sor.',
  upstream: "Gemini'ye ulaşılamadı; birazdan tekrar dene.",
  config: 'Asistan sunucusu ayarlanmamış (sırlar eksik).',
};

/** Ön uçuş gerektirmeyen sağlık testi: { ok, detail } (Bağlantıyı dene, ilk adım). */
export async function checkHealth(config = loadConfig()) {
  let target;
  try { target = new URL(endpoint(cleanUrl(config.url), '/health')); } catch { return { ok: false, detail: 'adres geçersiz' }; }
  try {
    const res = await fetch(target, { credentials: 'omit', signal: AbortSignal.timeout?.(10000) });
    return { ok: res.ok, detail: res.ok ? 'sağlık ✓' : `sağlık HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: `sağlık ✗ ${err?.name ?? 'Error'}: ${String(err?.message ?? '').slice(0, 60)}` };
  }
}

/**
 * Worker'a POST. Döner: yanıt gövdesi. Hata: AssistantError(code).
 *   callWorker('/chat', { messages, context }, { signal })
 */
export async function callWorker(path, body, { signal, config = loadConfig() } = {}) {
  if (!config.url || !config.token) throw new AssistantError('setup');
  let target;
  try { target = new URL(endpoint(cleanUrl(config.url), path)); } catch { throw new AssistantError('bad_url'); }
  if (target.protocol !== 'https:' && target.hostname !== 'localhost') throw new AssistantError('bad_url');
  if (globalThis.navigator && navigator.onLine === false) throw new AssistantError('offline');
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  let res;
  try {
    // "Basit istek": text/plain gövde, özel başlık yok, cache seçeneği yok → tarayıcı CORS ön uçuşu (OPTIONS)
    // göndermez. Erişim kodu Authorization başlığında değil gövdede gider (HTTPS içinde; URL'de değil).
    // Safari ön uçuşta takılıyordu (Load failed); bu biçim ona hiç gerek bırakmaz.
    res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...(body ?? {}), token: cleanToken(config.token) }),
      signal: timeout.signal,
      credentials: 'omit',
    });
  } catch (err) {
    // Ağ hatası: cihaz çevrimdışıysa "internet yok", değilse Worker'a ulaşılamadı (DNS, engel, CORS).
    const offline = globalThis.navigator && navigator.onLine === false;
    const e = new AssistantError(signal?.aborted ? 'aborted' : timeout.signal.aborted ? 'timeout' : offline ? 'offline' : 'unreachable');
    e.detail = `${err?.name ?? 'Error'}: ${String(err?.message ?? '').slice(0, 80)} · ${target.host}`; // kod içermez
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let data = null;
  try { data = await res.json(); } catch { /* boş gövde */ }
  if (res.status === 401) throw new AssistantError('auth');
  if (data?.error) {
    const e = new AssistantError(ERROR_TEXT[data.error] ? data.error : 'server');
    // Worker'ın kısa teknik ayrıntısı (Gemini hata açıklaması / durum kodu); kullanıcı verisi ya da kod içermez.
    const extra = [data.error !== e.code ? data.error : '', data.detail ?? (data.status ? String(data.status) : '')].filter(Boolean).join(' · ');
    if (extra) e.detail = extra.slice(0, 260);
    throw e;
  }
  if (!res.ok || !data) throw new AssistantError('server');
  return data;
}
