// Kasa çekirdeği: uygulama şifrelerini ana şifreyle şifreli saklar. Yalnızca Web Crypto API.
//
// - Anahtar: ana şifreden PBKDF2-SHA256 (rastgele 16 bayt salt, 600.000 iterasyon) → AES-GCM 256.
//   Anahtar dışa aktarılamaz (extractable: false).
// - Tüm kayıtlar tek bir JSON olarak AES-GCM ile şifrelenir; her kayıtta yeni rastgele 12 bayt IV.
// - localStorage'a ("tamarin.vault", ana store'dan ayrı) yalnızca { v, salt, iv, ciphertext, iterations }.
//   Ana şifre, anahtar ya da düz veri hiçbir depoya, konsola veya URL'ye yazılmaz.
// - Ana şifre doğrulaması çözme ile yapılır: AES-GCM çözemiyorsa şifre yanlıştır (ayrı hash yok).
// - Kilitlenince anahtar ve çözülmüş veri referansları bırakılır (bellekte tutulmaz).
// - Ayrı "tamarin.vault.guard" anahtarında yalnızca yanlış deneme sayısı ve bekleme bitişi durur (gizli değil).

const KEY = 'tamarin.vault';
const GUARD = 'tamarin.vault.guard';
const VERSION = 1;
export const ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const IDLE_MS = 2 * 60 * 1000;      // 2 dk işlem yoksa kilitle
const FREE_TRIES = 5;               // 5 yanlış denemede bir bekleme
const BASE_WAIT_MS = 30 * 1000;     // ilk bekleme 30 sn, her 5 ek denemede iki katı

export const CATS = ['Sosyal medya', 'Okul', 'Banka', 'Oyun', 'E-posta', 'Diğer'];
// Not: JavaScript belleği elle sıfırlayamaz; "silmek" = tüm referansları bırakmak (çöp toplayıcı temizler).

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class WrongPassword extends Error {
  constructor() { super('Şifre yanlış'); this.name = 'WrongPassword'; }
}

export class LockedOut extends Error {
  constructor(ms) { super('Çok fazla deneme'); this.name = 'LockedOut'; this.ms = ms; }
}

/* ---------- Bayt ↔ base64 ---------- */

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/* ---------- Kriptografi ---------- */

/** Ana şifreden AES-GCM 256 anahtarı türetir (dışa aktarılamaz). */
export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Veriyi yeni bir IV ile şifreler → saklanacak kayıt. */
async function seal(key, salt, iterations, data) {
  const iv = random(IV_BYTES);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(data)));
  return { v: VERSION, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)), iterations };
}

/** Kaydı şifreyle açar. Şifre yanlışsa (GCM doğrulaması tutmazsa) WrongPassword. */
async function unseal(blob, password) {
  const salt = fromB64(blob.salt);
  const key = await deriveKey(password, salt, blob.iterations);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ciphertext));
  } catch {
    throw new WrongPassword();
  }
  return { key, salt, iterations: blob.iterations, data: normalizeData(JSON.parse(decoder.decode(plain))) };
}

/** Saklanan/yüklenen kaydın biçimi doğru mu (içeriğe bakmadan). */
export function isBlob(x) {
  const b64 = (s) => typeof s === 'string' && s.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(s);
  return !!x && typeof x === 'object' && x.v === VERSION && b64(x.salt) && b64(x.iv) && b64(x.ciphertext)
    && Number.isInteger(x.iterations) && x.iterations >= 100000 && x.iterations <= 10000000
    && fromB64(x.salt).length === SALT_BYTES && fromB64(x.iv).length === IV_BYTES;
}

/* ---------- Kayıtlar ---------- */

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normalizeEntry(raw, now = new Date().toISOString()) {
  const app = text(raw.app, 80);
  if (!app) throw new Error('Uygulama adı boş olamaz');
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : (globalThis.crypto.randomUUID?.() ?? toB64(random(12))),
    app,
    username: text(raw.username, 160),
    password: typeof raw.password === 'string' ? raw.password.slice(0, 256) : '',
    url: text(raw.url, 300),
    note: text(raw.note, 1000),
    cat: CATS.includes(raw.cat) ? raw.cat : 'Diğer',
    updated: typeof raw.updated === 'string' ? raw.updated : now,
  };
}

function normalizeData(data) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return { entries: entries.flatMap((e) => { try { return [normalizeEntry(e)]; } catch { return []; } }) };
}

/* ---------- Depolama ---------- */

function readBlob() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    return isBlob(blob) ? blob : null;
  } catch {
    return null;
  }
}

function writeBlob(blob) {
  // Yalnızca izin verilen alanlar yazılır.
  const { v, salt, iv, ciphertext, iterations } = blob;
  localStorage.setItem(KEY, JSON.stringify({ v, salt, iv, ciphertext, iterations }));
}

function readGuard() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARD) ?? '{}');
    return { fails: Number.isInteger(g.fails) ? g.fails : 0, until: Number(g.until) || 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function writeGuard(g) {
  try { localStorage.setItem(GUARD, JSON.stringify(g)); } catch { /* yoksa geç */ }
}

/* ---------- Oturum ---------- */

export const vaultEvents = new EventTarget();
let session = null; // { key, salt, iterations, data } — yalnızca bellekte, kilitlenince null
let idleTimer = 0;

const emit = (type) => vaultEvents.dispatchEvent(new Event(type));

function armIdle() {
  clearTimeout(idleTimer);
  if (!session) return;
  idleTimer = setTimeout(() => lock(), IDLE_MS);
  idleTimer?.unref?.(); // Node testleri beklemesin
}

/** Kasa açıkken kullanıcı bir şey yaptı: 2 dk sayacını baştan başlat. */
export function touch() {
  if (session) armIdle();
}

export const hasVault = () => readBlob() !== null;
export const isUnlocked = () => session !== null;

/** Kasayı kilitler: anahtar ve çözülmüş veri bırakılır. */
export function lock() {
  if (!session) return;
  session = null;
  clearTimeout(idleTimer);
  emit('lock');
}

/** Yeni kasa kurar ve açık hale getirir. */
export async function createVault(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Ana şifre en az 8 karakter olmalı');
  const salt = random(SALT_BYTES);
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = { entries: [] };
  writeBlob(await seal(key, salt, ITERATIONS, data));
  writeGuard({ fails: 0, until: 0 });
  session = { key, salt, iterations: ITERATIONS, data };
  armIdle();
  emit('unlock');
}

/** Bekleme süresi (ms); 0 ise deneme yapılabilir. */
export function lockoutLeft(now = Date.now()) {
  return Math.max(0, readGuard().until - now);
}

/** Kalan ücretsiz deneme hakkı (bir sonraki beklemeye kadar). */
export function triesLeft() {
  const { fails } = readGuard();
  return FREE_TRIES - (fails % FREE_TRIES);
}

/** Ana şifreyle kilidi açar. Yanlışsa WrongPassword, beklemedeyse LockedOut. */
export async function unlock(password) {
  const left = lockoutLeft();
  if (left > 0) throw new LockedOut(left);
  const blob = readBlob();
  if (!blob) throw new Error('Kasa yok');
  try {
    session = await unseal(blob, password);
  } catch (err) {
    if (!(err instanceof WrongPassword)) throw err;
    const g = readGuard();
    g.fails += 1;
    if (g.fails % FREE_TRIES === 0) g.until = Date.now() + BASE_WAIT_MS * 2 ** (g.fails / FREE_TRIES - 1);
    writeGuard(g);
    throw err;
  }
  writeGuard({ fails: 0, until: 0 });
  armIdle();
  emit('unlock');
}

function requireSession() {
  if (!session) throw new Error('Kasa kilitli');
  return session;
}

/** Açık kasadaki kayıtlar (uygulama adına göre sıralı kopya). */
export function entries() {
  return [...requireSession().data.entries].sort((a, b) => a.app.localeCompare(b.app, 'tr'));
}

async function persist() {
  const s = requireSession();
  writeBlob(await seal(s.key, s.salt, s.iterations, s.data)); // her kayıtta yeni IV
  armIdle();
  emit('change');
}

/** Kayıt ekler ya da (aynı id varsa) günceller. Temizlenmiş kaydı döndürür. */
export async function saveEntry(raw) {
  const s = requireSession();
  const entry = normalizeEntry({ ...raw, updated: new Date().toISOString() });
  const i = s.data.entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) s.data.entries[i] = entry;
  else s.data.entries.push(entry);
  await persist();
  return entry;
}

export async function deleteEntry(id) {
  const s = requireSession();
  s.data.entries = s.data.entries.filter((e) => e.id !== id);
  await persist();
}

/** Ana şifreyi değiştirir: eski şifre doğrulanır, tüm veri yeni salt ve anahtarla yeniden şifrelenir. */
export async function changePassword(oldPassword, newPassword) {
  requireSession();
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw new Error('Yeni ana şifre en az 8 karakter olmalı');
  const blob = readBlob();
  const opened = await unseal(blob, oldPassword); // yanlışsa WrongPassword
  const salt = random(SALT_BYTES);
  const key = await deriveKey(newPassword, salt, ITERATIONS);
  writeBlob(await seal(key, salt, ITERATIONS, opened.data));
  session = { key, salt, iterations: ITERATIONS, data: opened.data };
  armIdle();
  emit('change');
}

/** Şifreli yedek: saklanan kayıt olduğu gibi (yalnızca aynı ana şifreyle açılır). */
export function exportEncrypted() {
  const blob = readBlob();
  if (!blob) throw new Error('Kasa yok');
  return { app: 'tamarin-vault', ...blob };
}

/** Şifreli yedeği yükler: önce verilen şifreyle açılabildiği doğrulanır, sonra mevcut kasanın yerine geçer. */
export async function importEncrypted(json, password) {
  const blob = json && json.app === 'tamarin-vault' ? json : null;
  if (!blob || !isBlob(blob)) throw new Error('Dosya bir Tamarin kasa yedeği değil');
  session = await unseal(blob, password); // yanlışsa WrongPassword; mevcut kasaya dokunulmaz
  writeBlob(blob);
  writeGuard({ fails: 0, until: 0 });
  armIdle();
  emit('unlock');
}

/** Kasayı tamamen siler. */
export function resetVault() {
  session = null;
  clearTimeout(idleTimer);
  try { localStorage.removeItem(KEY); localStorage.removeItem(GUARD); } catch { /* yoksa geç */ }
  emit('lock');
}

/* ---------- Güçlü şifre üretici ---------- */

const SETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',   // karışan I ve O yok
  lower: 'abcdefghijkmnopqrstuvwxyz',  // karışan l yok
  digits: '23456789',                  // karışan 0 ve 1 yok
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
};

/** 0..n-1 arası eşit olasılıklı rastgele tam sayı (mod yanlılığı olmadan). */
function randomBelow(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

/** crypto.getRandomValues ile şifre: seçilen her türden en az bir karakter. */
export function generatePassword({ length = 20, upper = true, lower = true, digits = true, symbols = true } = {}) {
  const chosen = Object.entries({ upper, lower, digits, symbols }).filter(([, on]) => on).map(([k]) => SETS[k]);
  if (!chosen.length) throw new Error('En az bir karakter türü seç');
  const n = Math.max(12, Math.min(32, Math.round(length)));
  const all = chosen.join('');
  const chars = chosen.map((set) => set[randomBelow(set.length)]);
  while (chars.length < n) chars.push(all[randomBelow(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Basit güç tahmini: 0 (çok zayıf) – 4 (güçlü). */
export function strength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  const kinds = [/[a-zçğıöşü]/, /[A-ZÇĞİÖŞÜ]/, /\d/, /[^\w\sçğıöşüÇĞİÖŞÜ]/].filter((re) => re.test(password)).length;
  if (kinds >= 3) score++;
  if (/^(\d+|[a-z]+)$/i.test(password) || /(.)\1{3,}/.test(password)) score--;
  return Math.max(0, Math.min(4, score));
}

/* ---------- Otomatik kilit: uygulama arka plana geçince ---------- */

globalThis.document?.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') lock();
});
globalThis.addEventListener?.('pagehide', lock);
