// Veri katmanı: tek bir state nesnesi, localStorage'da "tamarin.v1" anahtarında.
// Okuma/yazma hata vermez: bozuk veri gelirse uygulama varsayılanlarla açılır (bozuk kopya
// "tamarin.v1.bozuk" anahtarına saklanır), kayıt yapılamazsa uygulama yine çalışır.
// Her değişiklikte kaydedilir ve `events` üzerinde "change" olayı yayınlanır.
import { ymd, ym, addDays, today0, isYmd, isoDow, annualDateError } from './dates.js';
import { PHONE_SEED, SEED_VERSION } from './phones-seed.js';

const KEY = 'tamarin.v1';
const VERSION = 2;

export const TYPES = ['bills', 'classes', 'exams', 'days', 'tasks', 'phones'];
export const DEFAULT_CITY = Object.freeze({ name: 'Çanakkale', lat: 40.1553, lon: 26.4142 });
export const BILL_CATS = ['Kira', 'Aidat', 'Telefon', 'İnternet', 'Elektrik', 'Su', 'Doğalgaz', 'Abonelik', 'Kredi kartı', 'Diğer'];

// Eski kategoriler (ilk sürüm: Konut/Fatura/Kredi) yenilerine çevrilir; "Fatura" addan tahmin edilir.
const BILL_GUESS = [
  [/kira/, 'Kira'], [/aidat/, 'Aidat'], [/telefon|gsm|turkcell|vodafone|türk telekom/, 'Telefon'],
  [/internet|fiber|superonline/, 'İnternet'], [/elektrik/, 'Elektrik'], [/doğal ?gaz|^gaz/, 'Doğalgaz'],
  [/^su\b|su fatura|iski|aski/, 'Su'], [/netflix|spotify|youtube|abonelik|icloud|disney|prime/, 'Abonelik'],
  [/kredi|kart/, 'Kredi kartı'],
];

function billCat(cat, name) {
  if (BILL_CATS.includes(cat)) return cat;
  if (cat === 'Konut') return 'Kira';
  if (cat === 'Kredi') return 'Kredi kartı';
  const n = typeof name === 'string' ? name.toLocaleLowerCase('tr-TR') : '';
  return BILL_GUESS.find(([re]) => re.test(n))?.[1] ?? 'Diğer';
}
export const EXAM_TYPES = ['Vize', 'Final', 'Bütünleme', 'Quiz', 'Ödev teslimi', 'Proje teslimi'];
export const DAY_KINDS = ['Doğum günü', 'Yıldönümü', 'Özel gün'];
export const RELATIONS = ['Aile', 'Arkadaş', 'Sevgili', 'İş-Okul', 'Diğer'];
export const REMINDERS = ['0', '15', '60', '1440', 'none']; // dakika önce; none = hatırlatma yok
export const PRIORITIES = ['low', 'normal', 'high'];
export const PHONE_MODELS = ['iPhone SE (2./3. nesil)', 'iPhone 7 Plus', 'iPhone 8', 'iPhone 12', 'Diğer'];
export const CASE_COLORS = ['Siyah', 'Beyaz', 'Gri', 'Sarı', 'Turuncu', 'Kırmızı', 'Pembe', 'Mor', 'Mavi', 'Lacivert', 'Su yeşili', 'Yeşil', 'Kahverengi', 'Şeffaf'];
export const MAX_EXTRA = 20;

/**
 * Telefon numarasını rakama çevirir: boşluk, tire, nokta ve parantez atılır; "+90" baştaki 0 olur.
 * Boş → ''. Geçersizse (rakam dışı karakter ya da 10–11 hane değil) null.
 *   phoneDigits('0555 000 00 01') → '05550000001'
 */
export function phoneDigits(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  let s = value.replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('+90')) s = `0${s.slice(3)}`;
  return /^\d{10,11}$/.test(s) ? s : null;
}

/** SIM PIN: metin, yalnızca rakam, 4–8 hane (baştaki 0 korunur; sayıya çevrilmez). Boş → ''. Geçersizse null. */
export function simPin(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return '';
  return /^\d{4,8}$/.test(s) ? s : null;
}

export const events = new EventTarget();

/* ---------- Doğrulama ---------- */

class SchemaError extends Error {}
const fail = (message) => { throw new SchemaError(message); };

function text(value, field, { required = false, max = 200 } = {}) {
  if (value == null || value === '') return required ? fail(`${field} boş olamaz`) : '';
  if (typeof value !== 'string') fail(`${field} metin olmalı`);
  const trimmed = value.trim();
  if (required && !trimmed) fail(`${field} boş olamaz`);
  return trimmed.slice(0, max);
}

function int(value, field, lo, hi) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < lo || n > hi) fail(`${field} ${lo}–${hi} arası tam sayı olmalı`);
  return n;
}

function oneOf(value, field, options, fallback) {
  if ((value == null || value === '') && fallback !== undefined) return fallback;
  if (!options.includes(value)) fail(`${field} şunlardan biri olmalı: ${options.join(', ')}`);
  return value;
}

function clock(value, field, required) {
  if (value == null || value === '') return required ? fail(`${field} boş olamaz`) : '';
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(`${field} SS:DD biçiminde olmalı`);
  return value;
}

function day(value, field, required = true) {
  if (value == null || value === '') return required ? fail(`${field} boş olamaz`) : '';
  if (!isYmd(value)) fail(`${field} geçerli bir YYYY-AA-GG tarihi olmalı`);
  return value;
}

function money(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail('amount 0 ya da pozitif bir sayı olmalı');
  return Math.round(n * 100) / 100;
}

function extraRows(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail('extra liste olmalı');
  const rows = value.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`extra[${i}] nesne olmalı`);
    return { label: text(row.label, 'extra.label', { max: 40 }), value: text(row.value, 'extra.value', { max: 200 }) };
  }).filter((row) => row.label || row.value); // boş satırlar atılır
  if (rows.length > MAX_EXTRA) fail(`extra en fazla ${MAX_EXTRA} satır olabilir`);
  return rows;
}

const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const SHAPES = {
  bills: (x) => ({
    name: text(x.name, 'name', { required: true }),
    cat: billCat(x.cat, x.name),
    amount: money(x.amount),
    day: int(x.day, 'day', 1, 31),
    note: text(x.note, 'note', { max: 1000 }),
    paid: Array.isArray(x.paid ?? [])
      ? [...new Set((x.paid ?? []).filter((k) => typeof k === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(k)))].sort()
      : fail('paid "YYYY-MM" listesi olmalı'),
  }),
  classes: (x) => {
    const shaped = {
      name: text(x.name, 'name', { required: true }),
      day: int(x.day, 'day', 1, 7),
      start: clock(x.start, 'start', true),
      end: clock(x.end, 'end', true),
      room: text(x.room, 'room', { max: 60 }),
      teacher: text(x.teacher, 'teacher', { max: 80 }),
    };
    if (shaped.end <= shaped.start) fail('end, start saatinden sonra olmalı');
    return shaped;
  },
  exams: (x) => ({
    course: text(x.course, 'course', { required: true }),
    type: oneOf(x.type, 'type', EXAM_TYPES),
    date: day(x.date, 'date'),
    time: clock(x.time, 'time', false),
    room: text(x.room, 'room', { max: 60 }),
    note: text(x.note, 'note', { max: 1000 }),
  }),
  days: (x) => {
    const month = int(x.month, 'month', 1, 12);
    const shaped = {
      name: text(x.name, 'name', { required: true }),
      kind: oneOf(x.kind, 'kind', DAY_KINDS),
      day: int(x.day, 'day', 1, MAX_DAY[month - 1]),
      month,
      year: x.year == null || x.year === '' ? null : int(x.year, 'year', 1900, 2100),
      rel: oneOf(x.rel, 'rel', RELATIONS, 'Diğer'),
      note: text(x.note, 'note', { max: 1000 }),
    };
    // 30 Şubat zaten MAX_DAY'de elenir; burada gelecek yıl ve artık olmayan yılda 29 Şubat.
    const problem = annualDateError(shaped.day, shaped.month, shaped.year);
    if (problem) fail(problem);
    return shaped;
  },
  tasks: (x) => {
    const date = day(x.date, 'date', false); // '' = tarihsiz
    const done = x.done === true;
    return {
      title: text(x.title, 'title', { required: true }),
      date,
      time: date ? clock(x.time, 'time', false) : '', // saat yalnızca tarihli görevde
      remind: oneOf(x.remind == null ? 'none' : String(x.remind), 'remind', REMINDERS, 'none'),
      prio: oneOf(x.prio, 'prio', PRIORITIES, 'normal'),
      note: text(x.note, 'note', { max: 1000 }),
      done,
      // Tamamlanma anı (ISO); "Tamamlanan" listesi buna göre sıralanır. Açık görevde boş.
      doneAt: done && typeof x.doneAt === 'string' && !Number.isNaN(Date.parse(x.doneAt)) ? new Date(x.doneAt).toISOString() : '',
    };
  },
  // Hata mesajları değeri içermez (PIN konsola ya da arayüze sızmasın).
  phones: (x) => {
    const number = phoneDigits(x.number);
    if (number === null) fail('number 10–11 haneli olmalı');
    const pin = simPin(x.pin);
    if (pin === null) fail('pin 4–8 rakamlı metin olmalı');
    if (x.cased != null && typeof x.cased !== 'boolean') fail('cased true/false olmalı');
    return {
      name: text(x.name, 'name', { required: true, max: 40 }),
      number,
      pin,
      model: oneOf(x.model, 'model', PHONE_MODELS, 'Diğer'),
      color: oneOf(x.color, 'color', CASE_COLORS, 'Siyah'),
      cased: x.cased !== false,
      note: text(x.note, 'note', { max: 1000 }),
      extra: extraRows(x.extra),
    };
  },
};

const FIELDS = {
  name: (v) => text(v, 'name', { required: true, max: 40 }),
  city: (v) => {
    if (!v || typeof v !== 'object') fail('city nesne olmalı');
    const lat = Number(v.lat);
    const lon = Number(v.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) fail('city.lat −90–90 arası olmalı');
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) fail('city.lon −180–180 arası olmalı');
    return { name: text(v.name, 'city.name', { required: true, max: 60 }), lat, lon };
  },
  semesterEnd: (v) => day(v, 'semesterEnd', false),
  sound: (v) => {
    if (!v || typeof v !== 'object') fail('sound nesne olmalı');
    const volume = Number(v.volume ?? 0.7);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) fail('sound.volume 0–1 arası olmalı');
    return { on: v.on !== false, volume: Math.round(volume * 100) / 100 };
  },
  exNoticeClosed: (v) => v === true,
  // js/phones-seed.js'teki telefonların hangi sürümü eklendi (0 = hiç). Silinen telefon geri gelmesin diye.
  phoneSeed: (v) => (Number.isInteger(v) && v >= 0 ? v : 0),
  // Arayüz tercihleri (ör. Eğitim'de son seçili sekme)
  ui: (v) => ({ schoolTab: v?.schoolTab === 'exams' ? 'exams' : 'schedule' }),
  // Takvim aktarımı (js/ics.js): kayıt başına son aktarılan halin hash'i ve Ayarlar'daki "Son aktarma" satırı.
  calendar: (v) => {
    const exported = {};
    const raw = v?.exported && typeof v.exported === 'object' && !Array.isArray(v.exported) ? v.exported : {};
    for (const [key, hash] of Object.entries(raw)) {
      if (/^(bills|classes|exams|days|tasks):[\w-]{1,64}$/.test(key) && typeof hash === 'string' && /^[0-9a-f]{8}$/.test(hash)) exported[key] = hash;
    }
    const l = v?.last;
    const last = l && typeof l === 'object' && typeof l.at === 'string' && !Number.isNaN(Date.parse(l.at))
      ? {
        at: new Date(l.at).toISOString(),
        method: CALENDAR_METHODS.includes(l.method) ? l.method : 'error',
        count: Number.isInteger(l.count) && l.count >= 0 ? l.count : 0,
        note: typeof l.note === 'string' ? l.note.slice(0, 200) : '',
      }
      : null;
    return { exported, last };
  },
};

const CALENDAR_METHODS = ['share', 'cancel', 'data-url', 'download', 'error'];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Tek kaydı şemaya göre temizler; uymuyorsa SchemaError fırlatır. */
function normalize(type, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('kayıt bir nesne olmalı');
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : uid();
  return { id, ...SHAPES[type](raw), ...(raw.ex === true ? { ex: true } : {}) };
}

function defaults() {
  return {
    version: VERSION,
    name: 'Baha',
    city: { ...DEFAULT_CITY },
    semesterEnd: '',
    sound: { on: true, volume: 0.7 },
    bills: [], classes: [], exams: [], days: [], tasks: [], phones: [],
    exNoticeClosed: false,
    phoneSeed: 0,
    ui: { schoolTab: 'schedule' },
    calendar: { exported: {}, last: null },
    cache: {},
  };
}

/**
 * Ham nesneyi state'e çevirir. strict: hatalı kayıtta yedek reddedilir (errors dolu döner);
 * değilse hatalı kayıt atlanır, hatalı alan varsayılana döner.
 */
function normalizeState(raw, { strict = false } = {}) {
  const state = defaults();
  const errors = [];
  for (const [key, check] of Object.entries(FIELDS)) {
    if (raw[key] === undefined) continue;
    try { state[key] = check(raw[key]); } catch (err) { errors.push(`${key}: ${err.message}`); }
  }
  const seen = new Set();
  for (const type of TYPES) {
    if (raw[type] === undefined) continue;
    if (!Array.isArray(raw[type])) { errors.push(`${type}: liste olmalı`); continue; }
    raw[type].forEach((item, i) => {
      try {
        const clean = normalize(type, item);
        if (seen.has(clean.id)) clean.id = uid(); // çift kimlik olmasın
        seen.add(clean.id);
        state[type].push(clean);
      } catch (err) {
        errors.push(`${type}[${i}]: ${err.message}`);
      }
    });
  }
  if (!strict && raw.cache && typeof raw.cache === 'object' && !Array.isArray(raw.cache)) state.cache = raw.cache;
  return { state, errors };
}

/* ---------- Örnek veriler ---------- */

/** İlk açılış için "ex: true" işaretli örnekler. Tarihler bugüne göre ayarlanır. */
function examples() {
  const today = today0();
  const thisMonth = ym(today);
  const bill = (name, cat, amount, offset, paid = false) => {
    const due = addDays(today, offset);
    // Vade gelecek aya taştıysa bu ayınki ödenmiş sayılır; böylece sıradaki vade o gün olur.
    const settled = paid || ym(due) !== thisMonth;
    return { name, cat, amount, day: due.getDate(), note: '', paid: settled ? [thisMonth] : [], ex: true };
  };
  const on = (offset) => addDays(today, offset);
  const mom = on(1);
  const friend = on(18);
  const cls = (name, dow, start, end, room, teacher) => ({ name, day: dow, start, end, room, teacher, ex: true });
  const todayDow = isoDow(today);
  const dow = (shift) => ((todayDow - 1 + shift) % 7) + 1; // bugünden itibaren haftanın günleri

  return {
    bills: [
      bill('Kira', 'Kira', 12500, -3),
      bill('Elektrik', 'Elektrik', 640, 5),
      bill('İnternet', 'İnternet', 399, -6, true),
      bill('Spotify', 'Abonelik', 99, 11),
    ],
    classes: [
      cls('Lineer Cebir', dow(0), '09:00', '10:50', 'A-101', 'Dr. Öğr. Üyesi Elif Arslan'),
      cls('Algoritmalar', dow(1), '13:00', '14:50', 'Lab-2', 'Doç. Dr. Murat Şahin'),
      cls('Fizik II', dow(2), '10:00', '11:50', 'B-203', 'Prof. Dr. Kemal Aydın'),
      cls('Teknik İngilizce', dow(3), '15:00', '16:50', 'C-005', 'Öğr. Gör. Selin Koç'),
    ],
    exams: [
      { course: 'Lineer Cebir', type: 'Vize', date: ymd(on(9)), time: '10:00', room: 'A-101', note: '', ex: true },
      { course: 'Algoritmalar', type: 'Ödev teslimi', date: ymd(on(2)), time: '23:59', room: '', note: 'Moodle üzerinden', ex: true },
    ],
    days: [
      { name: 'Annem', kind: 'Doğum günü', day: mom.getDate(), month: mom.getMonth() + 1, year: 1972, rel: 'Aile', note: '', ex: true },
      { name: 'Ali', kind: 'Doğum günü', day: friend.getDate(), month: friend.getMonth() + 1, year: 2004, rel: 'Arkadaş', note: '', ex: true },
    ],
    tasks: [
      { title: 'Market alışverişi', date: ymd(today), time: '18:00', remind: '60', prio: 'normal', note: '', done: false, ex: true },
      { title: 'Kütüphaneye kitap iade', date: ymd(on(1)), time: '', remind: '1440', prio: 'high', note: '', done: false, ex: true },
    ],
    phones: [], // telefonlarda örnek yok
  };
}

function withExamples(state) {
  const ex = examples();
  const next = { ...state };
  for (const type of TYPES) next[type] = [...state[type], ...ex[type].map((item) => normalize(type, item))];
  next.exNoticeClosed = false;
  return next;
}

/* ---------- Yükleme ve kayıt ---------- */

/** Açılışta bir sorun olduysa kullanıcıya gösterilecek kısa not (yoksa ''). */
export let loadWarning = '';

function readStorage() {
  try { return localStorage.getItem(KEY); } catch { return undefined; } // undefined: depolama yok
}

function parse(raw) {
  if (raw === undefined) return { state: withExamples(defaults()), persist: false };
  if (raw === null) return { state: withExamples(defaults()), persist: true }; // ilk açılış
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    try { localStorage.setItem(`${KEY}.bozuk`, raw); } catch { /* yer yoksa geç */ }
    loadWarning = 'Kayıtlı veri okunamadı; varsayılanlarla açıldı. Eski veri ayrıca saklandı.';
    return { state: defaults(), persist: true };
  }
  if (data.version !== VERSION) {
    // v1 (ilk iskelet) gerçek kayıt tutmuyordu: yalnızca ses ayarı taşınır, örnekler yüklenir.
    const sound = { on: data.settings?.sound !== false, volume: 0.7 };
    return { state: withExamples({ ...defaults(), sound }), persist: true };
  }
  const { state, errors } = normalizeState(data);
  if (errors.length) {
    console.warn('Tamarin: bazı kayıtlar okunamadı ve atlandı', errors);
    loadWarning = `${errors.length} kayıt okunamadı ve atlandı.`;
  }
  return { state, persist: errors.length > 0 };
}

/**
 * js/phones-seed.js'teki telefonlar. İlk kez (phoneSeed 0): numarası kayıtlı olmayanlar eklenir.
 * Sonraki sürümlerde telefon eklenmez (silinen geri gelmesin); yalnızca aynı numaralı telefonun PIN'i
 * boşsa tohumdaki PIN yazılır (elle girilen PIN'e dokunulmaz). Diğer kayıtlara dokunulmaz. Değiştiyse true.
 */
function applyPhoneSeed() {
  if (state.phoneSeed >= SEED_VERSION) return false;
  const byNumber = new Map(state.phones.filter((p) => p.number).map((p) => [p.number, p]));
  const phones = state.phones.map((p) => {
    const seed = PHONE_SEED.find((x) => x.number === p.number);
    return p.number && !p.pin && seed?.pin && simPin(seed.pin) ? { ...p, pin: seed.pin } : p;
  });
  if (state.phoneSeed === 0) {
    for (const raw of PHONE_SEED) {
      if (byNumber.has(raw.number)) continue;
      try { phones.push(normalize('phones', raw)); } catch { /* bozuk tohum kaydı: atla */ }
    }
  }
  state = { ...state, phones, phoneSeed: SEED_VERSION };
  return true;
}

let state;
{
  const loaded = parse(readStorage());
  state = loaded.state;
  const seeded = applyPhoneSeed();
  if (loaded.persist || seeded) save();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Tamarin: veri kaydedilemedi', err);
    return false;
  }
}

function commit(detail) {
  const saved = save();
  events.dispatchEvent(new CustomEvent('change', { detail: { ...detail, saved } }));
  return saved;
}

// Aynı uygulama başka bir sekmede açıksa oradaki değişiklikleri de al.
globalThis.addEventListener?.('storage', (event) => {
  if (event.key !== KEY || event.newValue == null) return;
  try {
    state = normalizeState(JSON.parse(event.newValue)).state;
    events.dispatchEvent(new CustomEvent('change', { detail: { action: 'sync' } }));
  } catch { /* bozuk yazım: yok say */ }
});

/* ---------- Okuma ---------- */

/** Güncel state. Doğrudan değiştirme; add/update/remove/setField kullan. */
export function getState() {
  return state;
}

export function list(type) {
  assertType(type);
  return state[type];
}

/** "change" olayına abone olur; dönen fonksiyon aboneliği bitirir. fn(state, detail) */
export function onChange(fn) {
  const handler = (event) => fn(state, event.detail);
  events.addEventListener('change', handler);
  return () => events.removeEventListener('change', handler);
}

function assertType(type) {
  if (!TYPES.includes(type)) throw new Error(`Bilinmeyen tür: ${type}`);
}

/* ---------- CRUD ---------- */

/** Yeni kayıt ekler; şemaya uymuyorsa hata fırlatır. Eklenen (temizlenmiş) kaydı döndürür. */
export function add(type, item) {
  assertType(type);
  const clean = normalize(type, { ...item, id: undefined });
  state = { ...state, [type]: [...state[type], clean] };
  commit({ type, action: 'add', id: clean.id });
  return clean;
}

/** Kaydı günceller (patch birleştirilir). Güncellenmiş kaydı döndürür. */
export function update(type, id, patch) {
  assertType(type);
  const index = state[type].findIndex((x) => x.id === id);
  if (index < 0) throw new Error(`${type} içinde ${id} yok`);
  const clean = normalize(type, { ...state[type][index], ...patch, id });
  const items = [...state[type]];
  items[index] = clean;
  state = { ...state, [type]: items };
  commit({ type, action: 'update', id });
  return clean;
}

/** Kaydı siler; silinen kaydı döndürür (yoksa null). */
export function remove(type, id) {
  assertType(type);
  const item = state[type].find((x) => x.id === id) ?? null;
  if (!item) return null;
  state = { ...state, [type]: state[type].filter((x) => x.id !== id) };
  commit({ type, action: 'remove', id });
  return item;
}

/** Tekil alanlar: name, city, semesterEnd, sound, exNoticeClosed. */
export function setField(key, value) {
  if (!FIELDS[key]) throw new Error(`Bilinmeyen alan: ${key}`);
  state = { ...state, [key]: FIELDS[key](value) };
  commit({ field: key, action: 'set' });
  return state[key];
}

/* ---------- Toplu işlemler ---------- */

export function countExamples() {
  return TYPES.reduce((n, type) => n + state[type].filter((x) => x.ex).length, 0);
}

export function removeExamples() {
  const next = { ...state };
  for (const type of TYPES) next[type] = state[type].filter((x) => !x.ex);
  state = next;
  commit({ action: 'removeExamples' });
}

/** Tüm kayıtları ve ayarları siler (örnekler geri gelmez). */
export function resetAll() {
  state = { ...defaults(), cache: state.cache, phoneSeed: state.phoneSeed }; // telefonlar geri gelmez
  commit({ action: 'reset' });
}

/** Geri alma için anlık kopya. */
export function snapshot() {
  return JSON.stringify(state);
}

export function restore(snap) {
  state = normalizeState(JSON.parse(snap)).state;
  commit({ action: 'restore' });
}

/* ---------- Yedek ---------- */

/** Yedek nesnesi. Derin kopyadır: üzerinde yapılan değişiklik canlı veriye sızmaz. */
export function exportData() {
  const { cache, ...data } = state;
  return { app: 'tamarin', version: VERSION, exportedAt: new Date().toISOString(), data: structuredClone(data) };
}

/**
 * Yedek dosyasını doğrular. { ok, errors, counts, state }
 * Hem exportData() biçimini hem de doğrudan state nesnesini kabul eder.
 */
export function validateBackup(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['Dosya bir Tamarin yedeği değil.'] };
  }
  if (json.app !== undefined && json.app !== 'tamarin') return { ok: false, errors: ['Dosya bir Tamarin yedeği değil.'] };
  const data = json.app === 'tamarin' ? json.data : json;
  if (!data || typeof data !== 'object' || !TYPES.some((type) => Array.isArray(data[type]))) {
    return { ok: false, errors: ['Dosyada Tamarin kayıtları bulunamadı.'] };
  }
  const { state: parsed, errors } = normalizeState(data, { strict: true });
  const counts = Object.fromEntries(TYPES.map((type) => [type, parsed[type].length]));
  return { ok: errors.length === 0, errors, counts, state: parsed };
}

/** Doğrulanmış yedeği mevcut verinin yerine koyar. */
export function importBackup(json) {
  const result = validateBackup(json);
  if (!result.ok) throw new SchemaError(result.errors[0]);
  state = { ...result.state, cache: state.cache, phoneSeed: Math.max(result.state.phoneSeed, state.phoneSeed) };
  commit({ action: 'import' });
  return result.counts;
}

/* ---------- Önbellek (yedeğe girmez, olay yayınlamaz) ---------- */

export function getCache(key) {
  return state.cache?.[key];
}

export function setCache(key, value) {
  state = { ...state, cache: { ...state.cache, [key]: value } };
  save();
}
