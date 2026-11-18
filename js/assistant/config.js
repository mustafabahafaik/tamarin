// Asistan ayarları ve Worker istemcisi. Ayarlar ana store'dan AYRI, localStorage "tamarin.assistant"
// anahtarında: { url, token, speak }. Ana yedeğe girmez, "Tüm verileri sil" dokunmaz.
// Erişim kodu yalnızca bu cihazda durur; konsola, URL'ye ve hata mesajına yazılmaz.

const KEY = 'tamarin.assistant';
export const TIMEOUT_MS = 20000;

export function loadConfig() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
    return { url: typeof v.url === 'string' ? v.url : '', token: typeof v.token === 'string' ? v.token : '', speak: v.speak === true };
  } catch {
    return { url: '', token: '', speak: false };
  }
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* depolama yok: bu oturumda çalışmaz */ }
  return next;
}

/** "tamarin-asistan.x.workers.dev/" → "https://tamarin-asistan.x.workers.dev" + yol */
export function endpoint(url, path) {
  let u = String(url ?? '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
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
};

/**
 * Worker'a POST. Döner: yanıt gövdesi. Hata: AssistantError(code).
 *   callWorker('/chat', { messages, context }, { signal })
 */
export async function callWorker(path, body, { signal, config = loadConfig() } = {}) {
  if (!config.url || !config.token) throw new AssistantError('setup');
  if (globalThis.navigator && navigator.onLine === false) throw new AssistantError('offline');
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  let res;
  try {
    res = await fetch(endpoint(config.url, path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body ?? {}),
      signal: timeout.signal,
      cache: 'no-store',
    });
  } catch {
    throw new AssistantError(signal?.aborted ? 'aborted' : timeout.signal.aborted ? 'timeout' : 'offline');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let data = null;
  try { data = await res.json(); } catch { /* boş gövde */ }
  if (res.status === 401) throw new AssistantError('auth');
  if (data?.error) throw new AssistantError(ERROR_TEXT[data.error] ? data.error : 'server');
  if (!res.ok || !data) throw new AssistantError('server');
  return data;
}
