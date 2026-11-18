// Durum: state'ten "acil olan ne, yaklaşan ne, halka ne özetlesin, yüz ne desin" hesabı.
// Kayıt şekilleri js/store.js'teki SHAPES'te tanımlı.
import { getState } from './store.js';
import { today0, diffDays, addDays, clampDay, nextAnnual, nowParts, isoDow, parseYmd, relDay, formatShort, ymd, daysInMonth, GUNLER, AYLAR } from './dates.js';

// Tam sayı tutarlar kuruşsuz ("₺12.500"), kuruşlular iki basamakla ("₺1.250,50").
const wholeTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const centsTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = { format: (n) => (Number.isInteger(Math.round(n * 100) / 100) ? wholeTL : centsTL).format(n) };

const NIGHT_FROM = 23; // 23:00'ten
const NIGHT_UNTIL = 5; // 05:00'e kadar "gece"

// Ne kadar ilerisi "yaklaşan" listesine girer (gün).
const WINDOW = { bills: 14, exams: 30, days: 30, tasks: 7 };

/* ---------- Türkçe yardımcılar ---------- */

const VOWELS = 'aeıioöuü';
const HARMONY = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' };
// Akrabalık sözcükleri özel ad değildir: kesme işareti almaz, cümle içinde küçük harfle yazılır.
const KIN = new Set(['annem', 'babam', 'anneannem', 'babaannem', 'dedem', 'ninem', 'kardeşim', 'ablam', 'abim',
  'ağabeyim', 'eşim', 'sevgilim', 'teyzem', 'halam', 'dayım', 'amcam', 'kuzenim', 'yeğenim', 'oğlum', 'kızım',
  'yengem', 'eniştem', 'annemler', 'babamlar']);

const lowerTr = (s) => s.toLocaleLowerCase('tr-TR');
const isKin = (name) => KIN.has(lowerTr(name.trim()));

/** Tamlayan eki: "Annem" → "Annemin", "Ali" → "Ali'nin", "Duru" → "Duru'nun". */
export function genitive(name) {
  const word = name.trim();
  const lower = lowerTr(word);
  const lastVowel = [...lower].reverse().find((ch) => VOWELS.includes(ch)) ?? 'e';
  const suffix = (VOWELS.includes(lower.at(-1)) ? 'n' : '') + HARMONY[lastVowel];
  return isKin(word) ? `${word}${suffix}` : `${word}'${suffix}`;
}

const EXAM_SUFFIX = {
  Vize: 'vizesi', Final: 'finali', Bütünleme: 'bütünlemesi', Quiz: 'quizi',
  'Ödev teslimi': 'ödev teslimi', 'Proje teslimi': 'proje teslimi',
};

/** "Lineer Cebir vizesi", "Algoritmalar ödev teslimi" */
export function examTitle(exam) {
  return `${exam.course} ${EXAM_SUFFIX[exam.type] ?? lowerTr(exam.type)}`;
}

/** "Annemin doğum günü", "Evlilik yıldönümü", "Anneler Günü" */
export function dayTitle(entry) {
  if (entry.kind === 'Doğum günü') return `${genitive(entry.name)} doğum günü`;
  if (entry.kind === 'Yıldönümü') return `${entry.name} yıldönümü`;
  return entry.name;
}

/** Cümle içinde: akrabalık sözcüğüyle başlıyorsa küçük harf ("Yarın annemin doğum günü"). */
function inSentence(entry) {
  const title = dayTitle(entry);
  return isKin(entry.name) ? lowerTr(title.charAt(0)) + title.slice(1) : title;
}

const pad = (n) => String(n).padStart(2, '0');

/** Faturanın sıradaki ödenmemiş vadesi (bu ay ödendiyse gelecek ay). İkisi de ödendiyse null. */
export function billDue(bill, today = today0()) {
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  for (let i = 0; i < 2; i++) {
    const key = `${y}-${pad(m)}`;
    if (!bill.paid.includes(key)) return { date: new Date(y, m - 1, clampDay(y, m, bill.day)), key };
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return null;
}

/* ---------- Ödemeler: ay bazında (js/modules/bills.js) ---------- */

export const monthKey = (y, m) => `${y}-${pad(m)}`;

/** Ayı kaydırır: shiftMonth(2026, 12, 1) → [2027, 1] */
export function shiftMonth(y, m, delta) {
  const d = new Date(y, m - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

/** Faturanın o aydaki vadesi; ayın 31'i gibi günler kısa aylarda son güne kayar (clampDay). */
export const dueDate = (bill, y, m) => new Date(y, m - 1, clampDay(y, m, bill.day));

/** Ödendi işaretini koyar/kaldırır (paid dizisine "YYYY-MM" ekler ya da çıkarır). */
export function togglePaid(paid, key) {
  return paid.includes(key) ? paid.filter((k) => k !== key) : [...paid, key].sort();
}

/**
 * Faturanın seçili aydaki durumu:
 * { key, due, paid, state: 'paid' | 'late' | 'today' | 'soon' | 'upcoming', label, diff, next }
 * paid ise next: sıradaki ödenmemiş ayın vadesi ("Sonraki: 5 Aralık").
 */
export function billMonth(bill, y, m, today = today0()) {
  const key = monthKey(y, m);
  const due = dueDate(bill, y, m);
  const diff = diffDays(today, due);
  if (bill.paid.includes(key)) {
    let [ny, nm] = shiftMonth(y, m, 1);
    for (let i = 0; i < 24 && bill.paid.includes(monthKey(ny, nm)); i++) [ny, nm] = shiftMonth(ny, nm, 1);
    return { key, due, diff, paid: true, state: 'paid', label: 'Ödendi', next: dueDate(bill, ny, nm) };
  }
  if (diff < 0) return { key, due, diff, paid: false, state: 'late', label: `${-diff} gün gecikti` };
  if (diff === 0) return { key, due, diff, paid: false, state: 'today', label: 'Bugün' };
  if (diff <= 3) return { key, due, diff, paid: false, state: 'soon', label: diff === 1 ? 'Yarın' : `${diff} gün kaldı` };
  return { key, due, diff, paid: false, state: 'upcoming', label: `${diff} gün kaldı` };
}

/**
 * Bir ayın özeti: { rows, total, paidAmount, remaining, count, paidCount, allPaid }
 * Sıralama: ödenmemişler vadeye göre önde, ödenenler sonda.
 */
export function monthSummary(bills, y, m, today = today0()) {
  const rows = bills.map((bill) => ({ bill, ...billMonth(bill, y, m, today) }));
  rows.sort((a, b) => Number(a.paid) - Number(b.paid) || a.due - b.due || a.bill.name.localeCompare(b.bill.name, 'tr'));
  const cents = (n) => Math.round((n || 0) * 100);
  const total = rows.reduce((s, r) => s + cents(r.bill.amount), 0) / 100;
  const paidAmount = rows.filter((r) => r.paid).reduce((s, r) => s + cents(r.bill.amount), 0) / 100;
  const paidCount = rows.filter((r) => r.paid).length;
  return {
    rows,
    total,
    paidAmount,
    remaining: Math.round((total - paidAmount) * 100) / 100,
    count: rows.length,
    paidCount,
    allPaid: rows.length > 0 && paidCount === rows.length,
  };
}

/** Kullanıcının yazdığı tutar: "1.250,50", "1250.5", "12,5" → sayı; boş → 0; geçersiz → NaN. */
export function parseAmount(text) {
  const s = String(text ?? '').replace(/[\s₺TL]/gi, '');
  if (!s) return 0;
  let normalized = s;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, ''); // 1.250 → 1250
  if (!/^\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100) / 100;
}

/* ---------- Yaklaşanlar ---------- */

function collect(state, today) {
  const items = [];

  for (const bill of state.bills) {
    const due = billDue(bill, today);
    if (!due) continue;
    const diff = diffDays(today, due.date);
    if (diff > WINDOW.bills) continue;
    items.push({ cat: 'bills', type: 'bills', id: bill.id, title: bill.name, date: due.date, diff, amount: bill.amount, urgent: diff <= 1 });
  }

  for (const exam of state.exams) {
    const date = parseYmd(exam.date);
    const diff = diffDays(today, date);
    if (diff < 0 || diff > WINDOW.exams) continue;
    items.push({ cat: 'school', type: 'exams', id: exam.id, title: examTitle(exam), date, diff, time: exam.time, kind: exam.type, urgent: diff <= 1 });
  }

  for (const entry of state.days) {
    const date = nextAnnual(entry.month, entry.day, today);
    const diff = diffDays(today, date);
    if (diff > WINDOW.days) continue;
    const age = entry.kind === 'Doğum günü' && entry.year ? date.getFullYear() - entry.year : null;
    items.push({ cat: 'days', type: 'days', id: entry.id, title: dayTitle(entry), name: entry.name, kind: entry.kind, sentence: inSentence(entry), date, diff, age, milestone: dayMilestone(entry, date), urgent: diff <= 1 });
  }

  for (const task of state.tasks) {
    if (task.done || !task.date) continue; // tarihsiz görev zile ve yüze girmez
    const date = parseYmd(task.date);
    const diff = diffDays(today, date);
    if (diff > WINDOW.tasks) continue;
    items.push({ cat: 'tasks', type: 'tasks', id: task.id, title: task.title, date, diff, time: task.time, prio: task.prio, urgent: diff <= 0 });
  }

  return items.sort((a, b) => a.diff - b.diff || (a.time || '99').localeCompare(b.time || '99'));
}

/** Zil listesindeki zaman etiketi: "3 gün gecikti", "Bugün 18:00", "9 gün sonra · 19 Kasım" */
export function whenLabel(item, today = today0()) {
  if (item.diff < 0) return item.cat === 'bills' ? `${-item.diff} gün gecikti` : relDay(item.date, today);
  const base = relDay(item.date, today);
  return item.diff <= 1 ? `${base}${item.time ? ` ${item.time}` : ''}` : `${base} · ${formatShort(item.date)}`;
}

/* ---------- Halka özetleri ---------- */

function summaries(state, items, today) {
  const thisMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const by = (cat) => items.filter((i) => i.cat === cat);

  const late = by('bills').filter((i) => i.diff < 0).length;
  const unpaid = state.bills.filter((b) => !b.paid.includes(thisMonth)).length;
  const bills = !state.bills.length ? 'Kayıt yok' : late ? `${late} gecikti` : unpaid ? `${unpaid} ödenmedi` : 'Hepsi ödendi';

  // Eğitim: en yakın (geçmemiş) sınav "Final 9 gün"; yoksa "Bugün 3 ders" ya da "Bugün ders yok".
  const nearest = state.exams
    .map((e) => ({ e, diff: diffDays(today, e.date) }))
    .filter((x) => x.diff >= 0)
    .sort((a, b) => a.diff - b.diff || (a.e.time || '99').localeCompare(b.e.time || '99'))[0];
  const classesToday = state.classes.filter((c) => c.day === isoDow(today)).length;
  let school = classesToday ? `Bugün ${classesToday} ders` : 'Bugün ders yok';
  if (nearest) school = `${nearest.e.type} ${nearest.diff === 0 ? 'bugün' : nearest.diff === 1 ? 'yarın' : `${nearest.diff} gün`}`;

  // Özel Günler: en yakın gün ("Annem yarın", "Annem bugün", "14 gün"); hiç kayıt yoksa "Ekle".
  const nextDay = upcomingDays(state.days, today)[0];
  const days = !nextDay ? 'Ekle' : nextDay.diff <= 1 ? `${nextDay.entry.name} ${nextDay.diff === 0 ? 'bugün' : 'yarın'}` : `${nextDay.diff} gün`;

  // Ajanda: "1 gecikmiş" / "Bugün 3 iş"; açık iş var ama bugün yoksa "Bugün boş", hiç yoksa "Boş".
  const openTasks = state.tasks.filter((t) => !t.done);
  const lateTasks = by('tasks').filter((i) => i.diff < 0).length;
  const todayTasks = by('tasks').filter((i) => i.diff === 0).length;
  const tasks = lateTasks ? `${lateTasks} gecikmiş` : todayTasks ? `Bugün ${todayTasks} iş` : openTasks.length ? 'Bugün boş' : 'Boş';

  return { bills, school, days, tasks };
}

/* ---------- Alttaki yazı ---------- */

function pickMessage(state, items, hour, weather) {
  if (hour >= NIGHT_FROM || hour < NIGHT_UNTIL) return `Saat geç oldu ${state.name}, uyu artık`;

  const lateBill = items.find((i) => i.cat === 'bills' && i.diff < 0);
  if (lateBill) return `${lateBill.title} ${-lateBill.diff} gün gecikti`;

  // Bugün/yarın olan sınav ve özel günlerden en yakını; aynı günse sınav önce (bugünkü sınavı yarınki doğum günü örtmesin).
  const near = items.filter((i) => (i.cat === 'school' || i.cat === 'days') && i.diff >= 0 && i.diff <= 1)
    .sort((a, b) => a.diff - b.diff || (a.cat === 'school' ? -1 : 0) - (b.cat === 'school' ? -1 : 0))[0];
  if (near?.cat === 'school') return `${near.diff === 0 ? 'Bugün' : 'Yarın'} ${near.title} var`;
  if (near) {
    // Doğum günü cümle içinde akar ("Yarın annemin doğum günü"); diğerleri başlık gibi ("Yarın: Evlilik yıldönümü").
    const when = near.diff === 0 ? 'Bugün' : 'Yarın';
    return near.kind === 'Doğum günü' ? `${when} ${near.sentence}` : `${when}: ${near.title}`;
  }

  const bill = items.find((i) => i.cat === 'bills' && i.diff <= 1);
  if (bill) return `${bill.title} ${bill.diff === 0 ? 'bugün' : 'yarın'} ödenmeli`;

  const lateTasks = items.filter((i) => i.cat === 'tasks' && i.diff < 0);
  if (lateTasks.length) return lateTasks.length === 1 ? `${lateTasks[0].title} gecikti` : `${lateTasks.length} iş gecikti`;

  const todayTasks = items.filter((i) => i.cat === 'tasks' && i.diff === 0);
  if (todayTasks.length) return todayTasks.length === 1 ? `Bugün: ${todayTasks[0].title}` : `Bugün ${todayTasks.length} işin var`;

  return weatherMessage(weather, state.name) ?? 'Her şey yolunda görünüyor.';
}

/**
 * Acil bir şey yokken havaya göre tek cümle (yoksa null).
 * weather: { scene, data } — scene etkin sahne (deneme seçimi dahil), data gerçek tahmin.
 */
export function weatherMessage(weather, name) {
  const scene = weather?.scene;
  if (!scene) return null;
  const now = weather.data?.current;
  const today = weather.data?.daily?.[0];
  const temp = now?.temp;
  if (scene.lightning) return `Fırtına var ${name}, dışarıda dikkatli ol`;
  if (scene.rain > 0) return `Dışarısı ıslak, şemsiyeni unutma ${name}`;
  if (scene.snow > 0) return `Kar yağıyor ${name}, sıkı giyin`;
  if (today && today.pop > 60) return `Yağmur gelebilir, şemsiyeni yanına al ${name}`;
  if (scene.windy) return `Rüzgar sert ${name}, sıkı tutun`;
  if (scene.fog) return `Sis var ${name}, yolda dikkatli ol`;
  if (temp != null && Math.max(temp, today?.max ?? temp) > 30) return `Bugün çok sıcak ${name}, gölgede kal`;
  if (temp != null && temp < 3) return `Hava buz gibi ${name}, kalın giyin`;
  if (scene.sunny && (temp == null || (temp >= 12 && temp <= 28))) return `Hava güzel ${name}, biraz dışarı çık`;
  return null;
}

/**
 * { message, mood, urgent, urgentCats, upcoming, summaries }
 *   mood: 'worried' (ödeme/sınav kapıda, gecikmiş görev ya da fırtına) | 'happy' (özel gün ya da her şey temiz) | 'calm'
 *   urgentCats: halkada nabız gibi parlayacak dilimler ('bills' | 'school' | 'days' | 'tasks')
 *   weather: { scene, data } (isteğe bağlı) — acil bir şey yokken mesaj havaya göre değişir.
 */
export function computeStatus(now = new Date(), state = getState(), weather = null) {
  const today = today0(now);
  const { hour } = nowParts(now);
  const upcoming = collect(state, today);
  const urgentItems = upcoming.filter((i) => i.urgent);
  const urgentCats = new Set(urgentItems.map((i) => i.cat));
  const night = hour >= NIGHT_FROM || hour < NIGHT_UNTIL;

  const worrying = urgentItems.some((i) => i.cat === 'bills' || i.cat === 'school' || (i.cat === 'tasks' && i.diff < 0))
    || weather?.scene?.lightning;
  let mood = 'calm';
  if (worrying) mood = 'worried';
  else if (urgentCats.has('days') || (!upcoming.length && !night)) mood = 'happy';

  return {
    message: pickMessage(state, upcoming, hour, weather),
    mood,
    urgent: urgentItems.length > 0,
    urgentCats,
    upcoming,
    summaries: summaries(state, upcoming, today),
  };
}

/* ---------- "Bugün" şeridi ---------- */

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/* ---------- Eğitim: ders programı ve sınavlar (js/modules/school.js) ---------- */

export const minutesOf = toMinutes;

/** 75 → "1 sa 15 dk", 45 → "45 dk", 120 → "2 sa" */
export function durationLabel(minutes) {
  const hrs = Math.floor(minutes / 60);
  const min = minutes % 60;
  if (!hrs) return `${min} dk`;
  return min ? `${hrs} sa ${min} dk` : `${hrs} sa`;
}

const byStart = (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
const GAP_MIN = 30; // bundan uzun boşluklar listede ayrı satır olur

/**
 * Bir günün zaman çizelgesi: [{ type: 'class', entry, state, progress, untilMin, label } | { type: 'gap', minutes, label }]
 * state (yalnızca bugün için anlamlı): 'live' (Şimdi) | 'next' (Sıradaki) | 'past' (bitti) | 'later'
 * 30 dk'dan uzun boşluklar araya "1 sa 15 dk boşluk" satırı olarak girer.
 */
export function daySchedule(classes, dow, now = new Date(), isToday = true) {
  const { hour, minute } = nowParts(now);
  const t = hour * 60 + minute;
  const list = classes.filter((c) => c.day === dow).sort(byStart);
  const items = [];
  let lastEnd = null;
  let nextMarked = false;
  for (const entry of list) {
    const s = toMinutes(entry.start);
    const e = toMinutes(entry.end);
    if (lastEnd !== null && s - lastEnd > GAP_MIN) items.push({ type: 'gap', minutes: s - lastEnd, label: `${durationLabel(s - lastEnd)} boşluk` });
    lastEnd = Math.max(lastEnd ?? 0, e);
    let state = 'later';
    let progress = 0;
    let untilMin = null;
    let label = '';
    if (isToday) {
      if (t >= e) state = 'past';
      else if (t >= s) { state = 'live'; progress = (t - s) / (e - s); label = 'Şimdi'; }
      else if (!nextMarked) { state = 'next'; untilMin = s - t; nextMarked = true; label = `Sıradaki · ${durationLabel(untilMin)} sonra`; }
    }
    items.push({ type: 'class', entry, state, progress, untilMin, label });
  }
  return items;
}

/** Aynı gün ve saatte çakışan dersler (uç uca gelenler çakışma değildir; kendisi hariç). */
export function classConflicts(classes, candidate) {
  const s = toMinutes(candidate.start);
  const e = toMinutes(candidate.end);
  return classes.filter((c) => c.id !== candidate.id && c.day === candidate.day && toMinutes(c.start) < e && s < toMinutes(c.end));
}

/** Sınavın anı: tarih + saat (saat yoksa günün sonu). */
export function examMoment(exam) {
  const d = parseYmd(exam.date);
  if (exam.time) d.setHours(Number(exam.time.slice(0, 2)), Number(exam.time.slice(3, 5)));
  else d.setHours(23, 59);
  return d;
}

/**
 * Geri sayım: { diff, level, short, detail }
 *   short: "Bugün" | "Yarın" | "9 gün" | "3 gün önce"
 *   level: 'today' | 'urgent' (≤2 gün) | 'soon' (≤7 gün) | 'later' | 'past'
 *   detail: "9 gün 4 saat", "4 saat 20 dk", "35 dk", "Başladı", "Geçti"
 */
export function examCountdown(exam, now = new Date()) {
  const diff = diffDays(today0(now), exam.date);
  const level = diff < 0 ? 'past' : diff === 0 ? 'today' : diff <= 2 ? 'urgent' : diff <= 7 ? 'soon' : 'later';
  const short = diff < 0 ? `${-diff} gün önce` : diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : `${diff} gün`;
  const ms = examMoment(exam) - now;
  let detail;
  if (diff < 0) detail = 'Geçti';
  else if (ms <= 0) detail = 'Başladı';
  else {
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days) detail = hours ? `${days} gün ${hours} saat` : `${days} gün`;
    else if (hours) detail = mins ? `${hours} saat ${mins} dk` : `${hours} saat`;
    else detail = `${Math.max(1, mins)} dk`;
  }
  return { diff, level, short, detail };
}

/** Sınavları ayırır: yaklaşanlar (bugün dahil, en yakın önce) ve geçmişler (en yeni önce). */
export function splitExams(exams, now = new Date()) {
  const today = today0(now);
  const upcoming = exams.filter((e) => diffDays(today, e.date) >= 0).sort((a, b) => examMoment(a) - examMoment(b));
  const past = exams.filter((e) => diffDays(today, e.date) < 0).sort((a, b) => examMoment(b) - examMoment(a));
  return { upcoming, past };
}

/** "12 Ocak Pazartesi 10:00 · B-201" */
export function examWhen(exam) {
  const date = parseYmd(exam.date);
  return [`${formatShort(date)} ${GUNLER[isoDow(date)]}${exam.time ? ` ${exam.time}` : ''}`, exam.room].filter(Boolean).join(' · ');
}

/* ---------- Özel Günler (js/modules/days.js) ---------- */

/** "25 yaşına giriyor" (doğum günü), "3. yıl" (yıldönümü); yıl yoksa ya da henüz dolmadıysa ''. */
export function dayMilestone(entry, date) {
  if (!entry.year) return '';
  const years = date.getFullYear() - entry.year;
  if (years <= 0) return '';
  if (entry.kind === 'Doğum günü') return `${years} yaşına giriyor`;
  if (entry.kind === 'Yıldönümü') return `${years}. yıl`;
  return '';
}

/** Geri sayım etiketi ve vurgu: Bugün / Yarın (pembe), ≤ 7 gün (hafif), sonrası nötr. */
export function dayCountdown(diff) {
  if (diff === 0) return { short: 'Bugün', level: 'today' };
  if (diff === 1) return { short: 'Yarın', level: 'tomorrow' };
  return { short: `${diff} gün`, level: diff <= 7 ? 'week' : 'later' };
}

/**
 * Özel günler bir sonraki gerçekleşme tarihine göre (bu yıl geçtiyse seneye; 29 Şubat artık olmayan
 * yılda 28 Şubat). Aynı gün olanlar ada göre. rel verilirse yalnızca o yakınlık.
 *   → [{ entry, date, diff, milestone, countdown }]
 */
export function upcomingDays(days, today = today0(), rel = null) {
  return days
    .filter((entry) => !rel || entry.rel === rel)
    .map((entry) => {
      const date = nextAnnual(entry.month, entry.day, today);
      const diff = diffDays(today, date);
      return { entry, date, diff, milestone: dayMilestone(entry, date), countdown: dayCountdown(diff) };
    })
    .sort((a, b) => a.diff - b.diff || a.entry.name.localeCompare(b.entry.name, 'tr'));
}

/**
 * Listeyi gruplar: "Bu ay" (bu takvim ayında kalanlar) ve "Gelecek aylar" (ay başlıklarıyla;
 * başka yıldaysa "Ocak 2027").  → { thisMonth: [...], months: [{ key, title, items }] }
 */
export function groupDays(list, today = today0()) {
  const t = toDateOnly(today);
  const thisMonth = [];
  const months = [];
  for (const item of list) {
    const y = item.date.getFullYear();
    const m = item.date.getMonth();
    if (y === t.getFullYear() && m === t.getMonth()) { thisMonth.push(item); continue; }
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    let group = months.at(-1);
    if (group?.key !== key) {
      group = { key, title: y === t.getFullYear() ? AYLAR[m] : `${AYLAR[m]} ${y}`, items: [] };
      months.push(group);
    }
    group.items.push(item);
  }
  return { thisMonth, months };
}

const toDateOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Kutlama kartı yazısı: "Bugün Annemin doğum günü!" */
export const celebrationText = (entry) => `Bugün ${dayTitle(entry)}!`;

/* ---------- Ajanda (js/modules/tasks.js) ---------- */

/** Hızlı tarih çipleri: Bugün / Yarın / 2 gün sonra / Haftaya (aynı gün, gelecek hafta). */
export function quickDates(today = today0()) {
  return [
    { key: 'today', label: 'Bugün', date: ymd(today) },
    { key: 'tomorrow', label: 'Yarın', date: ymd(addDays(today, 1)) },
    { key: 'in2', label: '2 gün sonra', date: ymd(addDays(today, 2)) },
    { key: 'week', label: 'Haftaya', date: ymd(addDays(today, 7)) },
  ];
}

const L = '\\p{L}';
const WEEKDAY_RE = 'pazartesi|cumartesi|çarşamba|perşembe|salı|cuma|pazar';
const WEEKDAY_NUM = { pazartesi: 1, salı: 2, çarşamba: 3, perşembe: 4, cuma: 5, cumartesi: 6, pazar: 7 };
const NUM_WORDS = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10 };
const NUM_RE = `\\d{1,3}|${Object.keys(NUM_WORDS).join('|')}`;
const MONTH_RE = 'ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık';
const SUFFIX = `(?:'?(?:y?[ae]|d[ae]|t[ae]|n[ae]|ki|dan|den|tan|ten))?`; // cumaya, aralıkta, yarınki, 15'te …
const AFTER = `(?:\\s+(?:günü|kadar|akşamı|sabahı))*`;
const toNum = (s) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s]);
// Sözcük sınırı: JavaScript'in \b'si Türkçe harfleri tanımaz; önüne harf/rakam gelmemeli, ardına harf gelmemeli.
const word = (body) => new RegExp(`(^|[^${L}\\d])(${body})(?![${L}])`, 'u');

/** Türkçe tarih ifadeleri (ilk eşleşen kazanır). fn(match, today) → Date */
const DATE_RULES = [
  [word(`(?:haftaya|gelecek hafta|önümüzdeki hafta)\\s+(${WEEKDAY_RE})${SUFFIX}${AFTER}`), (m, t) => addDays(t, 7 - isoDow(t) + WEEKDAY_NUM[m[3]])],
  [word(`(${NUM_RE})\\s*gün\\s+(?:sonra|içinde)${SUFFIX}${AFTER}`), (m, t) => addDays(t, toNum(m[3]))],
  [word(`(${NUM_RE})\\s*hafta\\s+sonra${SUFFIX}${AFTER}`), (m, t) => addDays(t, 7 * toNum(m[3]))],
  [word(`(?:yarından sonra|öbür gün|öbürgün)${AFTER}`), (m, t) => addDays(t, 2)],
  [word(`yarın${SUFFIX}${AFTER}`), (m, t) => addDays(t, 1)],
  [word(`(?:bugün${SUFFIX}|bu akşam|bu sabah|bu gece|bu öğlen)${AFTER}`), (m, t) => t],
  [word(`(?:haftaya|gelecek hafta|önümüzdeki hafta)${AFTER}`), (m, t) => addDays(t, 7)],
  [word(`(${WEEKDAY_RE})${SUFFIX}${AFTER}`), (m, t) => {
    // "pazar" çarşı da demek: "pazara git", "pazarda", "pazar alışverişi" gün sayılmaz; "pazar (günü)" sayılır.
    if (m[3] === 'pazar' && (/^pazar'?(?:y?[ae]|d[ae]|t[ae]|dan|den|tan)/.test(m[2]) || /^\s*(?:alışveriş|yer|tezgah|esnaf)/.test(m.input.slice(m.index + m[0].length)))) return null;
    return addDays(t, ((WEEKDAY_NUM[m[3]] - isoDow(t) + 7) % 7) || 7); // bugün o günse gelecek hafta
  }],
  [word(`(\\d{1,2})\\s+(${MONTH_RE})${SUFFIX}${AFTER}`), (m, t) => {
    const month = MONTH_RE.split('|').indexOf(m[4]) + 1;
    const d = Number(m[3]);
    if (d < 1 || d > daysInMonth(2024, month)) return null;
    const on = (y) => (d <= daysInMonth(y, month) ? new Date(y, month - 1, d) : null);
    const thisYear = on(t.getFullYear());
    return thisYear && diffDays(t, thisYear) >= 0 ? thisYear : on(t.getFullYear() + 1);
  }],
  [word(`ayın\\s+(\\d{1,2})'?(?:[sıiuü]+|[sıiuü]*n[dt][ae])?${AFTER}`), (m, t) => {
    const d = Number(m[3]);
    for (let k = 0; k < 3; k++) {
      const y = t.getFullYear();
      const mo = t.getMonth() + k;
      const date = new Date(y, mo, d);
      if (date.getDate() === d && diffDays(t, date) >= 0) return date;
    }
    return null;
  }],
];

// Saat: "15:30", "saat 3'te", "saat 10.30'da", "akşam 8'de", "3 buçukta". Ardından gelen ek atılır.
const TIME_RE = new RegExp(
  `(^|[^${L}\\d])(((?:sabah|öğleden sonra|öğlen|öğleyin|akşam|gece)\\s+)?(saat\\s*)?(\\d{1,2})(?:([:.])(\\d{2})|\\s*(buçuk))?((?:ta|te)(?![${L}])|'(?:d[ae]|t[ae]))?)(?![${L}\\d])`,
  'u',
);

function findTime(lower) {
  const re = new RegExp(TIME_RE.source, 'gu');
  for (const m of lower.matchAll(re)) {
    const [, lead, , mod, saat, hh, sep, mm, half, suffix] = m;
    const explicit = saat || sep === ':' || (sep === '.' && (saat || suffix)) || half || (suffix && suffix.startsWith("'"));
    if (!explicit) continue;
    let hour = Number(hh);
    const minute = mm ? Number(mm) : half ? 30 : 0;
    if (hour > 23 || minute > 59) continue;
    const modifier = mod?.trim();
    if (modifier === 'gece') {
      if (hour >= 9 && hour < 12) hour += 12;           // gece 11 → 23, gece 2 → 02
    } else if (modifier && modifier !== 'sabah') {
      if (hour < 12) hour += 12;                         // akşam 8 → 20, öğleden sonra 3 → 15
    } else if (!modifier && sep !== ':' && hour >= 1 && hour <= 6) {
      hour += 12;                                        // "saat 3'te" günün ortasında 15:00 demek; "03:00" yazan iki nokta kullanır
    }
    const start = m.index + lead.length;
    return { start, end: m.index + m[0].length, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
  }
  return null;
}

/**
 * Hızlı eklemedeki yazıdan tarih ve saati çıkarır, o sözcükleri başlıktan atar.
 *   parseQuick('yarın 14:00 dişçi') → { title: 'Dişçi', date: '2026-11-12', time: '14:00' }
 * Bulunamayan alan null; başlığın ilk harfi büyütülür.
 */
export function parseQuick(text, today = today0()) {
  let original = String(text ?? '').replace(/[’‘`´]/g, "'");
  let lower = original.toLocaleLowerCase('tr-TR');
  if (lower.length !== original.length) original = lower; // olağan dışı harflerde dizinler kaymasın
  const cut = (start, end) => {
    original = `${original.slice(0, start)} ${original.slice(end)}`;
    lower = `${lower.slice(0, start)} ${lower.slice(end)}`;
  };

  let date = null;
  for (const [re, fn] of DATE_RULES) {
    const m = re.exec(lower);
    if (!m) continue;
    const found = fn(m, toDateOnly(today));
    if (!found) continue;
    date = ymd(found);
    cut(m.index + m[1].length, m.index + m[0].length);
    break;
  }

  let time = null;
  const t = findTime(lower);
  if (t) { time = t.time; cut(t.start, t.end); }

  const cleaned = original.replace(/\s+/g, ' ').replace(/^[\s,;.\-–—:]+|[\s,;\-–—:]+$/g, '').trim();
  const title = cleaned ? cleaned.charAt(0).toLocaleUpperCase('tr-TR') + cleaned.slice(1) : '';
  return { title, date, time };
}

const PRIO_RANK = { high: 0, normal: 1, low: 2 };

/**
 * Açık görevler gruplu: Gecikmiş, Bugün, Yarın, Bu hafta (Pazar'a kadar), Daha sonra, Tarihsiz.
 * Grup içinde tarih → saat (saatsizler günün sonunda) → önem → ekleniş sırası. Boş gruplar dönmez.
 *   → [{ key, title, items: [{ task, diff }] }]
 */
export function taskGroups(tasks, today = today0()) {
  const t = toDateOnly(today);
  const weekLeft = 7 - isoDow(t); // bugünden Pazar'a kalan gün
  const groups = { late: [], today: [], tomorrow: [], week: [], later: [], none: [] };
  tasks.forEach((task, index) => {
    if (task.done) return;
    if (!task.date) { groups.none.push({ task, diff: null, index }); return; }
    const diff = diffDays(t, task.date);
    const key = diff < 0 ? 'late' : diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff <= weekLeft ? 'week' : 'later';
    groups[key].push({ task, diff, index });
  });
  const order = (a, b) => (a.task.date || '').localeCompare(b.task.date || '')
    || (a.task.time || '99:99').localeCompare(b.task.time || '99:99')
    || PRIO_RANK[a.task.prio] - PRIO_RANK[b.task.prio]
    || a.index - b.index;
  const TITLES = { late: 'Gecikmiş', today: 'Bugün', tomorrow: 'Yarın', week: 'Bu hafta', later: 'Daha sonra', none: 'Tarihsiz' };
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([key, items]) => ({ key, title: TITLES[key], items: items.sort(order).map(({ task, diff }) => ({ task, diff })) }));
}

/** Satırın alt yazısı: "Yarın · 14:00", "2 gün gecikti", "Cuma", "24 Kasım", tarihsizse ''. */
export function taskWhen(task, today = today0()) {
  if (!task.date) return '';
  const t = toDateOnly(today);
  const date = parseYmd(task.date);
  const diff = diffDays(t, date);
  let base;
  if (diff < 0) base = `${-diff} gün gecikti`;
  else if (diff === 0) base = 'Bugün';
  else if (diff === 1) base = 'Yarın';
  else if (diff < 7) base = GUNLER[isoDow(date)];
  else base = `${formatShort(date)}${date.getFullYear() !== t.getFullYear() ? ` ${date.getFullYear()}` : ''}`;
  return task.time ? `${base} · ${task.time}` : base;
}

/** Erteleme: gecikmiş, bugünkü ya da tarihsiz → yarın; ileri tarihli → bir gün sonrası. */
export function postponeDate(task, today = today0()) {
  const t = toDateOnly(today);
  const base = task.date && diffDays(t, task.date) > 0 ? parseYmd(task.date) : t;
  return ymd(addDays(base, 1));
}

export const postponeLabel = (task, today = today0()) => (task.date && diffDays(toDateOnly(today), task.date) > 0 ? '1 gün ertele' : 'Yarına ertele');

/** Tamamlananlar: en son tamamlanan önce (zamanı bilinmeyenler sonda). */
export function completedTasks(tasks) {
  return tasks.filter((task) => task.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
}

/** "Bugün 14:20", "Dün", "9 Kasım" */
export function doneWhen(task, now = new Date()) {
  if (!task.doneAt) return '';
  const at = new Date(task.doneAt);
  const diff = diffDays(at, today0(now));
  if (diff === 0) return `Bugün ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (diff === 1) return 'Dün';
  return formatShort(at);
}

/** Sıradaki ders: şu an süren ("Şimdi"), bugün kalan ya da önümüzdeki günlerin ilki. */
function nextClass(state, today, minutes) {
  const byStart = (a, b) => a.start.localeCompare(b.start);
  const todays = state.classes.filter((c) => c.day === isoDow(today)).sort(byStart);
  const live = todays.find((c) => toMinutes(c.start) <= minutes && minutes < toMinutes(c.end));
  if (live) return { entry: live, label: `Şimdi · bitiş ${live.end}`, live: true };
  const later = todays.find((c) => toMinutes(c.start) > minutes);
  if (later) return { entry: later, label: `${later.start}–${later.end}` };
  for (let shift = 1; shift <= 7; shift++) {
    const date = addDays(today, shift);
    const first = state.classes.filter((c) => c.day === isoDow(date)).sort(byStart)[0];
    if (first) return { entry: first, label: `${shift === 1 ? 'Yarın' : GUNLER[isoDow(date)]} ${first.start}` };
  }
  return null;
}

/**
 * Ana ekranın altındaki kartlar: [{ cat, type, id, icon, label, title, sub, urgent }]
 * Sıra: sıradaki ders, bugünkü (ve gecikmiş) görevler, en acil ödeme, yaklaşan sınav, yaklaşan özel gün.
 */
export function todayCards(now = new Date(), state = getState()) {
  const today = today0(now);
  const { hour, minute } = nowParts(now);
  const items = collect(state, today);
  const cards = [];

  const cls = nextClass(state, today, hour * 60 + minute);
  if (cls) {
    cards.push({
      cat: 'school', type: 'classes', id: cls.entry.id, icon: 'book', label: cls.label,
      title: cls.entry.name, sub: cls.entry.room, urgent: !!cls.live,
    });
  }

  for (const task of items.filter((i) => i.cat === 'tasks' && i.diff <= 0).slice(0, 3)) {
    cards.push({
      cat: 'tasks', type: 'tasks', id: task.id, icon: 'check',
      label: task.diff < 0 ? `${-task.diff} gün gecikti` : `Bugün${task.time ? ` ${task.time}` : ''}`,
      title: task.title, sub: task.prio === 'high' ? 'Önemli' : '', urgent: true,
    });
  }

  const bill = items.find((i) => i.cat === 'bills');
  if (bill) {
    cards.push({
      cat: 'bills', type: 'bills', id: bill.id, icon: 'wallet', label: whenLabel(bill, today),
      title: bill.title, sub: bill.amount ? money.format(bill.amount) : '', urgent: bill.urgent,
    });
  }

  const exam = items.find((i) => i.cat === 'school' && i.diff <= 14);
  if (exam) {
    cards.push({
      cat: 'school', type: 'exams', id: exam.id, icon: 'cap', label: whenLabel(exam, today),
      title: exam.title, sub: '', urgent: exam.urgent,
    });
  }

  const special = items.find((i) => i.cat === 'days' && i.diff <= 14);
  if (special) {
    cards.push({
      cat: 'days', type: 'days', id: special.id, icon: 'heart', label: whenLabel(special, today),
      title: special.title, sub: special.milestone, urgent: special.urgent,
    });
  }

  return cards;
}

/* ---------- Telefonlar ---------- */

/** "05550000001" → "0555 000 00 01", "5550000001" → "555 000 00 01"; başka uzunluk olduğu gibi. */
export function formatPhone(digits) {
  if (typeof digits !== 'string') return '';
  const m = digits.match(/^(0?\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? m.slice(1).join(' ') : digits;
}

/** Listedeki kısa model adı: "SE", "7 Plus", "8", "12", "Diğer". */
export const MODEL_SHORT = {
  'iPhone SE (2./3. nesil)': 'SE', 'iPhone 7 Plus': '7 Plus', 'iPhone 8': '8', 'iPhone 12': '12', Diğer: 'Diğer',
};

// Doğal sıra: "faik2" < "faik10"; büyük/küçük harf ve Türkçe harfler doğru sıralanır.
const phoneCollator = new Intl.Collator('tr-TR', { numeric: true, sensitivity: 'base' });

/** Telefonları ada göre doğal sırada döndürür (aynı adda numaraya göre). */
export function sortPhones(phones) {
  return [...phones].sort((a, b) => phoneCollator.compare(a.name, b.name) || a.number.localeCompare(b.number));
}
