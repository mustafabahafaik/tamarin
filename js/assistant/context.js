// Asistana her soruda giden kısa bağlam: store'dan seçilmiş alanların JSON özeti (en fazla ~8 KB).
// GİZLİLİK: alanlar tek tek seçilir (beyaz liste). phones.pin, Kasa (tamarin.vault), calendar, cache ve
// extra hiç gönderilmez; notlarda "pin", "şifre", "password", "seed", "2fa" … geçen satırlar atılır.
// Hassas filtre tek yerde: isSensitive / safeNote (tests/assistant.test.mjs denetler).
import { nowParts, ymd, GUNLER, isoDow, today0, diffDays, parseYmd } from '../dates.js';
import { billDue, upcomingDays, sortPhones } from '../status.js';

export const MAX_BYTES = 8 * 1024;

// Türkçe küçük harf + aksansız ("ŞİFRE" = "sifre", "2FA" = "2fa").
const fold = (s) => String(s).toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
const SENSITIVE = /\bpin\b|pin ?kod|\bpuk\b|sifre|parola|passw|password|seed|mnemonic|kurtarma|recovery|2fa|totp|secret|api ?key/;

/** Metinde gizli bilgi işareti var mı (pin, şifre, password, seed, 2fa …). */
export function isSensitive(text) {
  return SENSITIVE.test(fold(text ?? ''));
}

/** Notun hassas olmayan satırları (en fazla 140 karakter); hepsi hassassa ''. */
export function safeNote(note) {
  if (typeof note !== 'string' || !note.trim()) return '';
  const lines = note.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !isSensitive(l));
  return lines.join(' / ').slice(0, 140);
}

const withNote = (obj, note) => {
  const n = safeNote(note);
  return n ? { ...obj, not: n } : obj;
};

const bytes = (s) => new TextEncoder().encode(s).length;

/**
 * Bağlam nesnesi. state: store state; now: Date; weather: { derece, durum, en_yuksek, en_dusuk, yagis } | null.
 */
export function buildContext(state, now = new Date(), weather = null) {
  const p = nowParts(now);
  const today = today0(now);
  const todayText = ymd(p.y, p.m, p.d);
  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = `${p.y}-${pad(p.m)}`;

  const odemeler = state.bills.map((b) => {
    const due = billDue(b, today);
    return withNote({
      id: b.id, ad: b.name, kat: b.cat, tutar: b.amount, gun: b.day,
      bu_ay_odendi: b.paid.includes(monthKey), sonraki_vade: due ? ymd(due.date) : null,
      ...(due && diffDays(today, due.date) < 0 ? { gecikme_gun: -diffDays(today, due.date) } : {}),
    }, b.note);
  });

  const dersler = [...state.classes].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((c) => ({
    id: c.id, ad: c.name, gun: c.day, gun_adi: GUNLER[c.day], bas: c.start, bit: c.end,
    ...(c.room ? { yer: c.room } : {}), ...(c.teacher ? { hoca: c.teacher } : {}),
  }));

  const sinavlar = state.exams
    .map((e) => ({ e, diff: diffDays(today, parseYmd(e.date)) }))
    .filter(({ diff }) => diff >= -14)
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.time || '').localeCompare(b.e.time || ''))
    .map(({ e, diff }) => withNote({
      id: e.id, ders: e.course, tur: e.type, tarih: e.date, ...(e.time ? { saat: e.time } : {}),
      ...(e.room ? { yer: e.room } : {}), ...(diff < 0 ? { gecti: true } : {}),
    }, e.note));

  const ozel_gunler = upcomingDays(state.days, today).map(({ entry, date, diff }) => withNote({
    id: entry.id, ad: entry.name, tur: entry.kind, tarih: ymd(date), kalan_gun: diff, yakinlik: entry.rel,
    ...(entry.year ? { yas: date.getFullYear() - entry.year } : {}),
  }, entry.note));

  const threeDaysAgo = now.getTime() - 3 * 86400000;
  const isler = state.tasks
    .filter((t) => !t.done || (t.doneAt && Date.parse(t.doneAt) >= threeDaysAgo))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''))
    .map((t) => withNote({
      id: t.id, baslik: t.title, tarih: t.date, ...(t.time ? { saat: t.time } : {}),
      onem: t.prio, hatirlatma: t.remind, ...(t.done ? { bitti: true } : {}),
    }, t.note));

  // Telefonlar: yalnızca id, ad, numara, model, renk. PIN, not ve ek bilgiler YOK.
  const telefonlar = sortPhones(state.phones).map((ph) => ({ id: ph.id, ad: ph.name, numara: ph.number, model: ph.model, renk: ph.color }));
  const phoneName = new Map(state.phones.map((ph) => [ph.id, ph.name]));
  // Hesaplar: yalnızca id, platform, etiket, bağlı telefonun adı (kullanıcı adı, UID, not yok).
  const hesaplar = state.accounts.map((a) => ({ id: a.id, platform: a.platform, etiket: a.label, telefon: phoneName.get(a.phoneId) ?? '' }));

  return {
    simdi: { tarih: todayText, gun: GUNLER[isoDow(today)], saat: `${pad(p.hour)}:${pad(p.minute)}` },
    kullanici: { ad: state.name, sehir: state.city?.name ?? '' },
    ...(weather ? { hava: weather } : {}),
    odemeler, dersler, sinavlar, ozel_gunler, isler, telefonlar, hesaplar,
  };
}

/**
 * Bağlamın JSON'u, en fazla MAX_BYTES. Aşarsa sırayla: tamamlanan görevler, geçmiş sınavlar, notlar,
 * sonra listelerin sonları kırpılır.
 */
export function contextJson(state, now = new Date(), weather = null, limit = MAX_BYTES) {
  const ctx = buildContext(state, now, weather);
  let text = JSON.stringify(ctx);
  const fits = () => bytes(text = JSON.stringify(ctx)) <= limit;
  if (bytes(text) <= limit) return text;

  ctx.isler = ctx.isler.filter((t) => !t.bitti);
  if (fits()) return text;
  ctx.sinavlar = ctx.sinavlar.filter((e) => !e.gecti);
  if (fits()) return text;
  for (const key of ['odemeler', 'sinavlar', 'ozel_gunler', 'isler']) ctx[key] = ctx[key].map(({ not, ...rest }) => rest);
  if (fits()) return text;
  // Son çare: en uzun listeden sondan kırp (en uzak tarihler / en az acil olanlar sonda).
  const lists = ['isler', 'ozel_gunler', 'odemeler', 'dersler', 'sinavlar', 'hesaplar', 'telefonlar'];
  while (!fits()) {
    const longest = lists.reduce((a, b) => (ctx[b].length > ctx[a].length ? b : a));
    if (!ctx[longest].length) break;
    ctx[longest] = ctx[longest].slice(0, Math.max(0, Math.floor(ctx[longest].length * 0.85)));
  }
  return text;
}
