// Asistanın araç çağrıları → onay kartı → store. Model bir araç çağırınca HİÇBİR ŞEY hemen yazılmaz:
// planCall çağrıyı doğrular (şema dışı alan, eksik alan, bilinmeyen id reddedilir), store.preview ile kaydı
// kaydetmeden dener ve Türkçe bir özet üretir. Yazma yalnızca createApproval(...).approve() ile olur;
// silme ve bir silme içeren listeler iki adımlıdır (ilk onay "kurulur", ikinci onay uygular).
import { TOOLS } from './declarations.js';
import { getState, add, update, remove, snapshot, preview, FIELD_NAMES } from '../store.js';
import { togglePaid, money, formatPhone } from '../status.js';
import { parseYmd, AYLAR, GUNLER, isoDow } from '../dates.js';

const SPEC = Object.fromEntries(TOOLS.map((t) => [t.name, t.parameters]));
const TYPE_LABEL = { bills: 'Ödeme', classes: 'Ders', exams: 'Sınav', days: 'Özel gün', tasks: 'İş', phones: 'Telefon', accounts: 'Hesap' };
const REMIND = { 0: 'tam zamanında hatırlat', 15: '15 dk önce hatırlat', 60: '1 saat önce hatırlat', 1440: '1 gün önce hatırlat', none: 'hatırlatma yok' };
const PRIO = { low: 'düşük önem', normal: '', high: 'yüksek önem' };
// Asistanın değiştiremeyeceği alanlar.
const LOCKED = { phones: ['pin'], accounts: ['platform'] };

/** "2026-11-21" → "21 Kasım Cuma" */
export function dayText(value) {
  const d = parseYmd(value);
  return d ? `${d.getDate()} ${AYLAR[d.getMonth()]} ${GUNLER[isoDow(d)]}` : String(value);
}
const monthText = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${AYLAR[m - 1]} ${y}`;
};
const titleOf = (type, r) => r?.name ?? r?.title ?? r?.course ?? r?.label ?? '';

class PlanError extends Error {}
const bad = (message) => { throw new PlanError(message); };

/** Argümanlar araç tanımına uyuyor mu: bilinmeyen alan ve eksik zorunlu alan reddedilir. */
function checkArgs(name, args) {
  const spec = SPEC[name];
  if (!spec) bad(`Bilinmeyen araç: ${name}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) bad('Araç argümanları nesne olmalı');
  for (const key of Object.keys(args)) if (!(key in spec.properties)) bad(`"${key}" alanı ${name} aracında yok`);
  for (const key of spec.required ?? []) if (args[key] === undefined || args[key] === null || args[key] === '') bad(`"${key}" eksik`);
}

function find(type, id, state) {
  const item = state[type]?.find((x) => x.id === id);
  if (!item) bad(`${TYPE_LABEL[type] ?? type} bulunamadı (id: ${id})`);
  return item;
}

/** Şemayla dene (kaydetmeden). Hata mesajı kullanıcıya ve modele gider. */
function tryPreview(type, data, id = null) {
  try { return preview(type, data, id); } catch (err) { return bad(err.message); }
}

/**
 * Bir araç çağrısının planı.
 *   → { ok: true, name, title, line, danger, type, run() }   (run: store'a yazar, sonucu döndürür)
 *   → { ok: false, name, error }
 * State'e dokunmaz.
 */
export function planCall(call, state = getState(), now = new Date()) {
  const name = call?.name;
  const args = call?.args ?? {};
  try {
    checkArgs(name, args);
    switch (name) {
      case 'add_task': {
        const data = { title: args.title, date: args.date ?? '', time: args.time ?? '', remind: args.remind ?? (args.time ? '60' : 'none'), prio: args.prio ?? 'normal' };
        const r = tryPreview('tasks', data);
        const when = r.date ? `${dayText(r.date)}${r.time ? ` ${r.time}` : ''}` : 'tarihsiz';
        const line = [r.title, when, r.date ? REMIND[r.remind] : '', PRIO[r.prio]].filter(Boolean).join(' · ');
        return plan(name, "Ajanda'ya ekle", line, false, 'tasks', () => add('tasks', data));
      }
      case 'complete_task': {
        const task = find('tasks', args.id, state);
        if (task.done) bad(`"${task.title}" zaten tamamlanmış`);
        const patch = { done: true, doneAt: now.toISOString() };
        tryPreview('tasks', patch, task.id);
        return plan(name, 'Tamamlandı işaretle', task.title, false, 'tasks', () => update('tasks', task.id, patch));
      }
      case 'postpone_task': {
        const task = find('tasks', args.id, state);
        const r = tryPreview('tasks', { date: args.date }, task.id);
        const from = task.date ? dayText(task.date) : 'tarihsiz';
        return plan(name, 'Ertele', `${task.title} · ${from} → ${dayText(r.date)}`, false, 'tasks', () => update('tasks', task.id, { date: args.date }));
      }
      case 'add_bill': {
        const data = { name: args.name, cat: args.cat, amount: args.amount ?? 0, day: args.day, note: '', paid: [] };
        const r = tryPreview('bills', data);
        const line = [r.name, r.cat, r.amount ? money.format(r.amount) : '', `her ayın ${r.day}'i`].filter(Boolean).join(' · ');
        return plan(name, 'Ödemelere ekle', line, false, 'bills', () => add('bills', data));
      }
      case 'mark_bill_paid': {
        const bill = find('bills', args.id, state);
        if (typeof args.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) bad('Ay YYYY-AA biçiminde olmalı');
        if (bill.paid.includes(args.month)) bad(`${bill.name} ${monthText(args.month)} için zaten ödendi`);
        const paid = togglePaid(bill.paid, args.month);
        tryPreview('bills', { paid }, bill.id);
        const line = [bill.name, monthText(args.month), bill.amount ? money.format(bill.amount) : ''].filter(Boolean).join(' · ');
        return plan(name, 'Ödendi işaretle', line, false, 'bills', () => update('bills', bill.id, { paid }));
      }
      case 'add_exam': {
        const data = { course: args.course, type: args.type, date: args.date, time: args.time ?? '', room: args.room ?? '', note: '' };
        const r = tryPreview('exams', data);
        const line = [`${r.course} ${r.type}`, `${dayText(r.date)}${r.time ? ` ${r.time}` : ''}`, r.room].filter(Boolean).join(' · ');
        return plan(name, 'Sınav ekle', line, false, 'exams', () => add('exams', data));
      }
      case 'add_day': {
        const data = { name: args.name, kind: args.kind, day: args.day, month: args.month, year: args.year ?? null, rel: args.rel ?? 'Diğer', note: '' };
        const r = tryPreview('days', data);
        const line = [r.name, r.kind, `${r.day} ${AYLAR[r.month - 1]}${r.year ? ` ${r.year}` : ''}`, r.rel].filter(Boolean).join(' · ');
        return plan(name, 'Özel gün ekle', line, false, 'days', () => add('days', data));
      }
      case 'add_class': {
        const data = { name: args.name, day: args.day, start: args.start, end: args.end, room: args.room ?? '', teacher: '' };
        const r = tryPreview('classes', data);
        const line = [r.name, `${GUNLER[r.day]} ${r.start}–${r.end}`, r.room].filter(Boolean).join(' · ');
        return plan(name, 'Ders ekle', line, false, 'classes', () => add('classes', data));
      }
      case 'update_record': {
        const { type, id, patch } = args;
        if (!FIELD_NAMES[type]) bad(`Bilinmeyen kayıt türü: ${type}`);
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) bad('Değişecek alan yok');
        const item = find(type, id, state);
        for (const key of Object.keys(patch)) {
          if ((LOCKED[type] ?? []).includes(key)) bad(`${TYPE_LABEL[type]} için "${key}" değiştirilemez`);
          if (!FIELD_NAMES[type].includes(key) || key === 'doneAt') bad(`"${key}" alanı ${TYPE_LABEL[type]} kaydında yok`);
        }
        const r = tryPreview(type, patch, id);
        const show = (key, v) => {
          if (v === '' || v == null) return '—';
          if (key === 'date') return dayText(v);
          if (key === 'amount') return money.format(v);
          if (key === 'number') return formatPhone(v);
          if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
          return String(v);
        };
        const changes = Object.keys(patch).map((key) => `${key}: ${show(key, item[key])} → ${show(key, r[key])}`);
        return plan(name, `${TYPE_LABEL[type]} güncelle`, `${titleOf(type, item)} · ${changes.join(' · ')}`, false, type, () => update(type, id, patch));
      }
      case 'delete_record': {
        const { type, id } = args;
        if (!FIELD_NAMES[type]) bad(`Bilinmeyen kayıt türü: ${type}`);
        const item = find(type, id, state);
        return plan(name, `${TYPE_LABEL[type]} sil`, titleOf(type, item), true, type, () => remove(type, id));
      }
      default:
        return bad(`Bilinmeyen araç: ${name}`);
    }
  } catch (err) {
    if (err instanceof PlanError) return { ok: false, name, id: call?.id, error: err.message };
    throw err;
  }

  function plan(tool, title, line, danger, type, run) {
    return { ok: true, name: tool, id: call?.id, title, line, danger, type, run };
  }
}

/**
 * Onay: tek kartta bir ya da daha çok plan. Silme varsa iki adım: ilk approve() 'armed' döner ve hiçbir
 * şey yazmaz; ikinci approve() uygular. Geçersiz planlar uygulanmaz, sonuçlarında hata döner.
 *   const ap = createApproval(plans); ap.approve() → 'armed' | { status: 'done', results, before }
 *   ap.cancel() → results (hepsi { ok: false, cancelled: true })
 */
export function createApproval(plans) {
  const danger = plans.some((p) => p.ok && p.danger);
  let armed = false;
  let settled = false;
  return {
    plans,
    danger,
    get armed() { return armed; },
    approve() {
      if (settled) return { status: 'settled' };
      if (danger && !armed) { armed = true; return 'armed'; }
      settled = true;
      const before = snapshot();
      const results = plans.map((p) => {
        if (!p.ok) return { ok: false, error: p.error };
        try {
          const out = p.run();
          return { ok: true, id: out?.id ?? null };
        } catch (err) {
          return { ok: false, error: err.message }; // şema hatası: kullanıcıya ve modele
        }
      });
      return { status: 'done', results, before };
    },
    cancel() {
      settled = true;
      return plans.map(() => ({ ok: false, cancelled: true }));
    },
  };
}

/** Modelin function response parçaları (çağrılarla aynı sırada, aynı id ile). */
export function responseParts(calls, results) {
  return calls.map((call, i) => ({
    functionResponse: {
      name: call.name,
      ...(call.id ? { id: call.id } : {}),
      response: results[i]?.cancelled ? { result: 'Kullanıcı vazgeçti; değişiklik yapılmadı.' }
        : results[i]?.ok ? { result: 'Yapıldı.', ...(results[i].id ? { id: results[i].id } : {}) }
          : { error: results[i]?.error ?? 'Uygulanamadı' },
    },
  }));
}
