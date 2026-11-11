// Takvim: kayıtları iPhone Takvimi'ne .ics (RFC 5545) olarak aktarır; bildirimleri Takvim'in kendisi verir.
// Saf kısım (kaçış, katlama, kayıt → VEVENT, hash) Node'da test edilir; teslim (paylaş / data: / indir)
// tarayıcıda çalışır ve sonucu Ayarlar'daki "Son aktarma" satırı için store'a yazar (konsola değil).
import { getState, setField } from './store.js';
import { today0, ymd, parseYmd, addDays, clampDay, nextAnnual, isoDow } from './dates.js';
import { money, dayTitle, dayMilestone } from './status.js';

export const CRLF = '\r\n';

/* ---------- Biçim ---------- */

/** TEXT değeri kaçışı: ters bölü, noktalı virgül, virgül, yeni satır. */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();
const octets = (s) => encoder.encode(s).length;

/**
 * 75 bayt satır katlama: devam satırı tek boşlukla başlar (boşluk 75'e dahil).
 * Kod noktası sınırında böler; "ğ", "ş", "İ" gibi çok baytlı UTF-8 karakterler ikiye ayrılmaz.
 */
export function foldLine(line) {
  if (octets(line) <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = octets(ch);
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // baştaki boşluk 1 bayt
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
/** 20261112 */
export const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
/** 20261112T140000 — "floating" yerel saat, Z eki yok */
export const icsLocal = (d) => `${icsDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
/** 20261111T112000Z — DTSTAMP her zaman UTC */
export const icsUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const at = (dateLike, hhmm) => {
  const d = dateLike instanceof Date ? dateLike : parseYmd(dateLike);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0);
};
const plusMinutes = (d, min) => new Date(d.getTime() + min * 60000);

/* ---------- Kayıt → etkinlik ---------- */

export const KIND = { bills: 'bill', classes: 'class', exams: 'exam', days: 'day', tasks: 'task' };
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const EXAM_SUFFIX = {
  Vize: 'Vizesi', Final: 'Finali', 'Bütünleme': 'Bütünlemesi', Quiz: 'Quizi',
  'Ödev teslimi': 'Ödev Teslimi', 'Proje teslimi': 'Proje Teslimi',
};

/**
 * Ödeme günü 29–31 ise ay sonuna kayan kural. BYSETPOS=-1, BYMONTHDAY listesinden o ayda var olan
 * en büyük günü seçer: 30 → Ocak 30, Şubat 28/29, Nisan 30; 29 → Şubat'ta 28 (artık yılda 29); 31 → ayın son günü.
 * ("BYMONTHDAY=<gün>,-1" 31 çeken ayda iki kez çalardı; "28,29,30,31;BYSETPOS=-1" her ay son güne giderdi.)
 */
export function monthlyRule(day) {
  if (day <= 28) return 'FREQ=MONTHLY';
  if (day === 31) return 'FREQ=MONTHLY;BYMONTHDAY=-1';
  const days = [];
  for (let d = 28; d <= day; d++) days.push(d);
  return `FREQ=MONTHLY;BYMONTHDAY=${days.join(',')};BYSETPOS=-1`;
}

const alarm = (trigger, description) => ({ trigger, description });
const DAY_BEFORE_9 = '-PT15H'; // tüm gün etkinliğinde: önceki gün 09:00
const SAME_DAY_9 = 'PT9H';     // tüm gün etkinliğinde: aynı gün 09:00
const TASK_TRIGGER = { 0: 'PT0S', 15: '-PT15M', 60: '-PT1H', 1440: '-P1D' };

/**
 * Bir kaydın takvim etkinliği; aktarılamıyorsa { reason }.
 *   { event: { uid, summary, start, end, allDay, rrule, location, description, alarms, priority } }
 */
export function eventFor(type, rec, { today = today0(), state = getState() } = {}) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const uid = `${KIND[type]}-${rec.id}@tamarin`;

  if (type === 'bills') {
    const start = new Date(t.getFullYear(), t.getMonth(), clampDay(t.getFullYear(), t.getMonth() + 1, rec.day));
    const summary = `${/ödeme/i.test(rec.name) ? rec.name : `${rec.name} ödemesi`}${rec.amount ? ` · ${money.format(rec.amount)}` : ''}`;
    return {
      event: {
        uid, summary, start, end: addDays(start, 1), allDay: true, rrule: monthlyRule(rec.day),
        description: [rec.cat, rec.note].filter(Boolean).join('\n'),
        alarms: [alarm(DAY_BEFORE_9, `Yarın ödeme günü: ${summary}`), alarm(SAME_DAY_9, `Bugün ödeme günü: ${summary}`)],
      },
    };
  }

  if (type === 'days') {
    const start = nextAnnual(rec.month, rec.day, t); // 29 Şubat artık olmayan yılda 28 Şubat
    const milestone = dayMilestone(rec, start);
    const years = rec.year ? start.getFullYear() - rec.year : 0;
    const extra = rec.kind === 'Doğum günü' && years > 0 ? ` (${years})` : rec.kind === 'Yıldönümü' && milestone ? ` (${milestone})` : '';
    const summary = `${dayTitle(rec)}${extra}`;
    const leapling = rec.month === 2 && rec.day === 29;
    return {
      event: {
        uid, summary, start, end: addDays(start, 1), allDay: true,
        rrule: leapling ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY',
        description: [rec.rel, rec.year && rec.kind === 'Doğum günü' ? `${rec.year} doğumlu` : '', rec.note].filter(Boolean).join('\n'),
        alarms: [alarm(DAY_BEFORE_9, `Yarın: ${dayTitle(rec)}`), alarm(SAME_DAY_9, `Bugün: ${dayTitle(rec)}`)],
      },
    };
  }

  if (type === 'classes') {
    const first = addDays(t, (rec.day - isoDow(t) + 7) % 7);
    const until = state.semesterEnd ? parseYmd(state.semesterEnd) : null;
    if (until && until < first) return { reason: 'Dönem bitmiş; ders takvime aktarılmaz.' };
    const summary = [rec.name, rec.room].filter(Boolean).join(' · ');
    return {
      event: {
        uid, summary, start: at(first, rec.start), end: at(first, rec.end), allDay: false,
        rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[rec.day - 1]}${until ? `;UNTIL=${icsDate(until)}T235959` : ''}`,
        location: rec.room, description: rec.teacher,
        alarms: [alarm('-PT15M', `15 dk sonra: ${summary}`)],
      },
    };
  }

  if (type === 'exams') {
    if (rec.date < ymd(t)) return { reason: 'Geçmiş sınav takvime aktarılmaz.' };
    const start = at(rec.date, rec.time || '09:00');
    const summary = [`${rec.course} ${EXAM_SUFFIX[rec.type] ?? rec.type}`, rec.room].filter(Boolean).join(' · ');
    return {
      event: {
        uid, summary, start, end: plusMinutes(start, 120), allDay: false,
        location: rec.room, description: [rec.time ? '' : 'Saat girilmedi; 09:00 varsayıldı.', rec.note].filter(Boolean).join('\n'),
        alarms: [alarm('-P1D', `Yarın: ${summary}`), alarm('-PT2H', `2 saat sonra: ${summary}`)],
      },
    };
  }

  if (type === 'tasks') {
    if (!rec.date) return { reason: 'Tarihsiz işler takvime aktarılmaz.' };
    if (rec.done) return { reason: 'Tamamlanmış iş takvime aktarılmaz.' };
    if (rec.date < ymd(t)) return { reason: 'Tarihi geçmiş iş takvime aktarılmaz; önce ertele.' };
    const base = { uid, summary: rec.title, description: rec.note, priority: rec.prio === 'high' ? 1 : null };
    if (!rec.time) {
      const start = parseYmd(rec.date);
      return { event: { ...base, start, end: addDays(start, 1), allDay: true, alarms: [alarm(SAME_DAY_9, `Bugün: ${rec.title}`)] } };
    }
    const start = at(rec.date, rec.time);
    const trigger = TASK_TRIGGER[rec.remind];
    const lead = { 0: 'Şimdi', 15: '15 dk sonra', 60: '1 saat sonra', 1440: 'Yarın' }[rec.remind];
    return { event: { ...base, start, end: plusMinutes(start, 30), allDay: false, alarms: trigger ? [alarm(trigger, `${lead}: ${rec.title}`)] : [] } };
  }

  return { reason: 'Bu kayıt türü takvime aktarılmaz.' };
}

/** VEVENT satırları (katlanmamış). */
function veventLines(ev, stamp) {
  const lines = ['BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${stamp}`];
  if (ev.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.start)}`, `DTEND;VALUE=DATE:${icsDate(ev.end)}`);
  else lines.push(`DTSTART:${icsLocal(ev.start)}`, `DTEND:${icsLocal(ev.end)}`);
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
  lines.push(`SUMMARY:${escapeText(ev.summary)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.priority) lines.push(`PRIORITY:${ev.priority}`);
  if (ev.allDay) lines.push('TRANSP:TRANSPARENT'); // tüm gün etkinliği gününü "meşgul" göstermesin
  for (const a of ev.alarms ?? []) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(a.description || ev.summary)}`, `TRIGGER:${a.trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Tam takvim dosyası: CRLF satır sonları, 75 bayt katlama, sonda CRLF. */
export function buildCalendar(events, now = new Date()) {
  const stamp = icsUtc(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tamarin//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Tamarin',
    'X-WR-TIMEZONE:Europe/Istanbul',
    ...events.flatMap((ev) => veventLines(ev, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/* ---------- Ne aktarılacak: hash ile "yeni ve değişenler" ---------- */

/** Takvimi etkileyen alanlar (ödendi işaretleri, örnek bayrağı vb. dahil değil). */
const HASH_FIELDS = {
  bills: ['name', 'cat', 'amount', 'day', 'note'],
  classes: ['name', 'day', 'start', 'end', 'room', 'teacher'],
  exams: ['course', 'type', 'date', 'time', 'room', 'note'],
  days: ['name', 'kind', 'day', 'month', 'year', 'rel', 'note'],
  tasks: ['title', 'date', 'time', 'remind', 'prio', 'note'],
};

/** Kaydın takvimdeki halinin kısa özeti (FNV-1a 32 bit). Dersler dönem sonuna da bağlı. */
export function recordHash(type, rec, state = getState()) {
  const data = [type, ...HASH_FIELDS[type].map((k) => rec[k] ?? ''), type === 'classes' ? state.semesterEnd : ''];
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(JSON.stringify(data))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const keyOf = (type, id) => `${type}:${id}`;

/**
 * Aktarılacak kayıtlar. mode: 'all' (aktarılabilen her şey), 'changed' (hiç aktarılmamış ya da
 * son aktarımdan sonra değişmiş), 'one' (yalnızca type/id).
 *   → { entries: [{ type, rec, event, hash }], skipped: [{ type, rec, reason }] }
 */
export function selectForCalendar({ mode = 'all', type: onlyType, id, state = getState(), today = today0() } = {}) {
  const entries = [];
  const skipped = [];
  const exported = state.calendar?.exported ?? {};
  for (const type of Object.keys(KIND)) {
    if (mode === 'one' && type !== onlyType) continue;
    for (const rec of state[type]) {
      if (mode === 'one' && rec.id !== id) continue;
      const { event, reason } = eventFor(type, rec, { today, state });
      if (!event) { skipped.push({ type, rec, reason }); continue; }
      const hash = recordHash(type, rec, state);
      if (mode === 'changed' && exported[keyOf(type, rec.id)] === hash) continue;
      entries.push({ type, rec, event, hash });
    }
  }
  return { entries, skipped };
}

/** Ayarlar'daki "Sadece yeni ve değişenleri aktar" sayısı. */
export const pendingCount = (state = getState(), today = today0()) => selectForCalendar({ mode: 'changed', state, today }).entries.length;

/** Tek kayıt aktarılabilir mi? (formdaki buton ve toast aksiyonu için) */
export function calendarReason(type, rec, state = getState()) {
  return KIND[type] ? eventFor(type, rec, { state }).reason ?? null : 'Bu kayıt türü takvime aktarılmaz.';
}

/* ---------- Teslim: iPhone'da "Takvime ekle" ---------- */

export const METHOD_LABELS = {
  share: 'Paylaş menüsüyle açıldı',
  cancel: 'Paylaş menüsü kapatıldı, aktarılmadı',
  'data-url': 'Takvim ekranı data: adresiyle açıldı',
  download: '.ics dosyası indirildi',
  error: 'Aktarılamadı',
};

const describe = (err) => `${err?.name || 'Hata'}${err?.message ? `: ${err.message}` : ''}`.slice(0, 140);

function defaultEnv() {
  const nav = globalThis.navigator;
  return {
    navigator: nav,
    mobile: /iP(hone|ad|od)|Android/i.test(nav?.userAgent ?? '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1),
    open: (url) => { globalThis.location.href = url; },
    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: filename, hidden: true });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
}

/**
 * .ics metnini kullanıcıya verir. Telefonda: (a) text/calendar dosyasıyla paylaş menüsü, olmazsa ya da hata
 * verirse (b) data:text/calendar adresine git (Safari "Tümünü ekle" ekranı). Masaüstünde (c) indir.
 * commit(sonuç) her durumda, sayfadan ayrılmadan ÖNCE çağrılır (data: adresi sayfayı terk edebilir).
 *   sonuç: { method: 'share' | 'cancel' | 'data-url' | 'download', note }
 */
export async function deliver(ics, filename, commit, env = defaultEnv()) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  if (!env.mobile) {
    commit({ method: 'download', note: '' });
    env.download(blob, filename);
    return 'download';
  }
  let note = '';
  let file = null;
  let canShare = false;
  try {
    file = new File([ics], filename, { type: 'text/calendar' });
    canShare = !!(env.navigator?.share && env.navigator.canShare?.({ files: [file] }));
    if (!canShare) note = 'Paylaş menüsü dosya desteklemiyor';
  } catch (err) {
    note = `Paylaş denetimi hata verdi: ${describe(err)}`;
  }
  if (canShare) {
    try {
      await env.navigator.share({ files: [file], title: 'Tamarin takvimi' });
      commit({ method: 'share', note: '' });
      return 'share';
    } catch (err) {
      if (err?.name === 'AbortError') {
        commit({ method: 'cancel', note: '' });
        return 'cancel';
      }
      note = `Paylaşma hata verdi: ${describe(err)}`;
    }
  }
  commit({ method: 'data-url', note });
  env.open(`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`);
  return 'data-url';
}

/**
 * Seçilen kayıtları tek dosyada aktarır ve sonucu store'a yazar: aktarılan kayıtların hash'i
 * (iptal değilse) ve Ayarlar'daki "Son aktarma" satırı.  → { ok, method, count, message }
 */
export async function exportToCalendar(options = {}, env) {
  const state = getState();
  const { entries, skipped } = selectForCalendar({ ...options, state });
  if (!entries.length) {
    const message = options.mode === 'one' ? skipped[0]?.reason ?? 'Kayıt bulunamadı.' : options.mode === 'changed' ? 'Aktarılacak yeni ya da değişen kayıt yok.' : 'Takvime aktarılacak kayıt yok.';
    return { ok: false, count: 0, message };
  }
  const ics = buildCalendar(entries.map((e) => e.event), new Date());
  const filename = options.mode === 'one' ? `tamarin-${KIND[entries[0].type]}.ics` : 'tamarin-takvim.ics';
  let result = null;
  const commit = ({ method, note }) => {
    result = method;
    const now = getState();
    const exported = {};
    // Silinmiş kayıtların izini bırakma.
    for (const [key, hash] of Object.entries(now.calendar.exported)) {
      const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      if (now[type]?.some((r) => r.id === id)) exported[key] = hash;
    }
    if (method !== 'cancel') for (const e of entries) exported[keyOf(e.type, e.rec.id)] = e.hash;
    setField('calendar', { exported, last: { at: new Date().toISOString(), method, count: entries.length, note } });
  };
  try {
    await deliver(ics, filename, commit, env);
  } catch (err) {
    setField('calendar', { ...getState().calendar, last: { at: new Date().toISOString(), method: 'error', count: entries.length, note: describe(err) } });
    return { ok: false, method: 'error', count: entries.length, message: 'Takvime aktarılamadı.' };
  }
  return { ok: result !== 'cancel', method: result, count: entries.length, message: METHOD_LABELS[result] };
}
