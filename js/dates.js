// Tarih yardımcıları.
// Takvim günleri "YYYY-MM-DD" metni (ymd) olarak saklanır. Date nesneleri o günün yerel gece
// yarısını (00:00) temsil eder. "Bugün" ve "şu an" her zaman Europe/Istanbul saatine göredir.

export const TZ = 'Europe/Istanbul';

export const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
export const AYLAR_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// ISO sırası: 1 = Pazartesi … 7 = Pazar (0. eleman boş, böylece GUNLER[isoDow(x)] çalışır).
export const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const GUNLER_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const pad = (n) => String(n).padStart(2, '0');

const nowFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

/** Şu an İstanbul'da: { y, m, d, hour, minute } (m: 1–12). */
export function nowParts(now = new Date()) {
  const p = Object.fromEntries(nowFormat.formatToParts(now).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour % 24, minute: +p.minute };
}

const toDate = (x) => (x instanceof Date ? x : parseYmd(x));

/**
 * "YYYY-MM-DD" üretir.
 *   ymd()            → bugün (İstanbul)
 *   ymd(date)        → o Date'in yerel günü
 *   ymd(2026, 11, 9) → "2026-11-09"
 */
export function ymd(a, m, d) {
  if (a === undefined) {
    const p = nowParts();
    return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  }
  if (typeof a === 'number') return `${a}-${pad(m)}-${pad(d)}`;
  return `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`;
}

/** "YYYY-MM": faturaların "hangi ay ödendi" anahtarı. */
export function ym(date) {
  const x = toDate(date);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

/** "YYYY-MM-DD" → o günün yerel gece yarısı (Date). Geçersiz tarihte (ör. 2026-02-30) null. */
export function parseYmd(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!match) return null;
  const [y, m, d] = [+match[1], +match[2], +match[3]];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export const isYmd = (s) => parseYmd(s) !== null;

/** Bugünün (İstanbul) gece yarısı. */
export function today0(now = new Date()) {
  const p = nowParts(now);
  return new Date(p.y, p.m - 1, p.d);
}

/** b − a, gün olarak (Date ya da "YYYY-MM-DD"). Saat dilimi ve yaz saatinden etkilenmez. */
export function diffDays(a, b) {
  const p = toDate(a);
  const q = toDate(b);
  const utc = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((utc(q) - utc(p)) / 86400000);
}

export function addDays(date, n) {
  const x = toDate(date);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n);
}

/** ISO haftanın günü: 1 = Pazartesi … 7 = Pazar. */
export function isoDow(date) {
  const day = toDate(date).getDay();
  return day === 0 ? 7 : day;
}

/** Ayın gün sayısı (m: 1–12). */
export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/** Ayın son gününe taşan günü kırpar: 31 → Nisan'da 30, Şubat'ta 28/29. */
export function clampDay(y, m, day) {
  return Math.min(day, daysInMonth(y, m));
}

/** "Bugün", "Yarın", "Dün", "3 gün sonra", "2 gün geçti" */
export function relDay(target, base = today0()) {
  const n = diffDays(base, target);
  if (n === 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  if (n === -1) return 'Dün';
  return n > 0 ? `${n} gün sonra` : `${-n} gün geçti`;
}

/** "15 Kasım" */
export function formatShort(date) {
  const x = toDate(date);
  return `${x.getDate()} ${AYLAR[x.getMonth()]}`;
}

/** "Salı, 10 Kasım" */
export function formatLong(date) {
  const x = toDate(date);
  return `${GUNLER[isoDow(x)]}, ${formatShort(x)}`;
}

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Her yıl tekrar eden günün (gün, ay, isteğe bağlı yıl) geçerliliği; sorun yoksa null, varsa Türkçe neden.
 *   30 Şubat, 31 Nisan → geçersiz; 29 Şubat yıl yoksa geçerli (artık olmayan yıllarda 28 Şubat sayılır),
 *   yıl verilirse o yıl artık yıl olmalı. Yıl gelecekte olamaz; strictDate ise tarihin kendisi de.
 */
export function annualDateError(day, month, year = null, { today = today0(), strictDate = false } = {}) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'Ayı seç.';
  if (!Number.isInteger(day) || day < 1 || day > 31) return 'Gün 1 ile 31 arasında olmalı.';
  if (day > daysInMonth(2024, month)) return `${day} ${AYLAR[month - 1]} diye bir gün yok.`;
  if (year == null) return null;
  if (!Number.isInteger(year) || year < 1900) return 'Yıl 1900 ya da sonrası olmalı.';
  const t = toDate(today);
  if (year > t.getFullYear()) return 'Yıl gelecekte olamaz.';
  if (month === 2 && day === 29 && !isLeap(year)) return `${year} artık yıl değil, o yıl 29 Şubat yoktu.`;
  if (strictDate && new Date(year, month - 1, day) > t) return 'Bu tarih henüz gelmedi.';
  return null;
}

/** Her yıl tekrar eden bir günün (ay, gün) bugünden itibaren ilk gelişi. 29 Şubat → 28 Şubat. */
export function nextAnnual(month, day, base = today0()) {
  const b = toDate(base);
  const on = (y) => new Date(y, month - 1, clampDay(y, month, day));
  const thisYear = on(b.getFullYear());
  return diffDays(b, thisYear) >= 0 ? thisYear : on(b.getFullYear() + 1);
}
