// Ajanda (#ajanda, halkadaki yeşil dilim): "2 gün sonra şu işim var" notunu 2–3 saniyede eklemek.
// Hızlı ekleme bir kez kurulur (yazı, çip ve odak korunur); store değişince yalnızca liste yeniden çizilir.
// Hesaplar js/status.js'te (parseQuick, taskGroups, taskWhen, postponeDate, completedTasks, quickDates).
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import { getState, onChange, add, update, remove, snapshot, restore } from '../store.js';
import { parseQuick, taskGroups, taskWhen, postponeDate, postponeLabel, completedTasks, doneWhen, quickDates } from '../status.js';
import { today0, ymd, parseYmd, AYLAR_KISA, GUNLER_KISA, isoDow } from '../dates.js';
import { playCall } from '../sound.js';
import { field as formField, pickGrid, focusFirstError, calendarButton, calendarAction } from '../form.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  check: '<path d="m6 12.5 4 4 8-9"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h10.5l-2 3.8 2 3.7H6"/>',
  note: '<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14.5 3.5v4h4M9 12h6M9 15.5h4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  later: '<path d="M4 12h12"/><path d="m12 7 5 5-5 5"/><path d="M20 5v14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};

const icon = (name, cls = 't-svg') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);

const REMINDERS = [['0', 'Tam zamanında'], ['15', '15 dk önce'], ['60', '1 saat önce'], ['1440', '1 gün önce'], ['none', 'Yok']];
const PRIOS = [['low', 'Düşük'], ['normal', 'Normal'], ['high', 'Yüksek']];

/* ---------- Durum ---------- */

let root = null;        // ekranın kökü
let listHost = null;    // yalnızca bu yeniden çizilir
let quick = null;       // hızlı ekleme denetimi ({ el, refresh })
let stop = null;
let midnightTimer = 0;
let view = 'open';      // 'open' (Yaklaşan) | 'done' (Tamamlanan)
let lastView = null;    // sekme değişmediyse yeni gelen satırlar belirerek girer
const pending = new Set(); // tamamlanma animasyonu süren görevler
let openRow = null;     // kaydırılıp açık kalan satır

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const shortDate = (s) => { const d = parseYmd(s); return `${d.getDate()} ${AYLAR_KISA[d.getMonth()]} ${GUNLER_KISA[isoDow(d)]}`; };

/* ---------- Tarih çipleri (hızlı ekleme ve form ortak) ---------- */

/**
 * Bugün / Yarın / 2 gün sonra / Haftaya / Tarih seç (+ formda Tarihsiz).
 * "Tarih seç" çipinin üstünde görünmez bir tarih kutusu durur: iPhone'da dokunuş doğrudan seçiciyi açar.
 * keepFocus: çiplere dokunmak yazı kutusundaki odağı (ve klavyeyi) almasın.
 */
function dateChips({ value, allowNone = false, keepFocus = false, onPick }) {
  let current = value;
  const el = h('div', { class: 't-chips', role: 'radiogroup', 'aria-label': 'Tarih' });
  const picker = h('input', { type: 'date', class: 't-overlay-input', 'aria-label': 'Tarih seç' });
  const pickLabel = h('span', {}, 'Tarih seç');
  const pickChip = h('span', { class: 't-chip t-chip-pick', role: 'radio' }, icon('calendar', 't-svg t-chip-svg'), pickLabel, picker);
  picker.addEventListener('click', () => { try { picker.showPicker?.(); } catch { /* bazı tarayıcılar izin vermez */ } });
  picker.addEventListener('change', () => { if (picker.value) choose(picker.value); });

  const fixed = () => [...quickDates(today0()).map((q) => ({ value: q.date, label: q.label })), ...(allowNone ? [{ value: '', label: 'Tarihsiz' }] : [])];
  let buttons = [];

  function build() {
    buttons = fixed().map((opt) => {
      const b = h('button', { type: 'button', class: 't-chip', role: 'radio', dataset: { value: opt.value }, onclick: () => choose(opt.value) }, opt.label);
      if (keepFocus) b.addEventListener('pointerdown', (e) => e.preventDefault());
      return b;
    });
    el.replaceChildren(...buttons, pickChip);
    paint();
  }

  function paint() {
    const known = buttons.some((b) => b.dataset.value === current);
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.value === current));
    pickChip.setAttribute('aria-checked', String(!known));
    pickLabel.textContent = known ? 'Tarih seç' : shortDate(current);
    picker.value = current || '';
  }

  function choose(v) {
    current = v;
    paint();
    onPick?.(v);
  }

  build();
  return { el, get value() { return current; }, set(v) { current = v; paint(); }, rebuild: build };
}

/** Saat çipi: görünmez saat kutusu üstte, saat seçilince yanında temizleme düğmesi. */
function timeChip({ value = '', onPick }) {
  let current = value;
  const input = h('input', { type: 'time', class: 't-overlay-input', 'aria-label': 'Saat seç' });
  const label = h('span', {}, 'Saat');
  const clear = h('button', { type: 'button', class: 't-chip-clear', 'aria-label': 'Saati kaldır', onclick: () => choose('') }, icon('x', 't-svg'));
  clear.addEventListener('pointerdown', (e) => e.preventDefault());
  const chip = h('span', { class: 't-chip t-chip-time' }, icon('clock', 't-svg t-chip-svg'), label, input);
  input.addEventListener('click', () => { try { input.showPicker?.(); } catch { /* izin yoksa yerel davranış */ } });
  input.addEventListener('change', () => choose(input.value));
  const el = h('div', { class: 't-time-wrap' }, chip, clear);

  function paint() {
    label.textContent = current || 'Saat';
    chip.classList.toggle('is-set', !!current);
    clear.hidden = !current;
    input.value = current;
  }
  function choose(v) { current = v; paint(); onPick?.(v); }
  paint();
  return { el, get value() { return current; }, set(v) { current = v; paint(); } };
}

/* ---------- Hızlı ekleme ---------- */

function quickAdd() {
  const input = h('input', {
    class: 'input t-quick-input', id: 't-quick', type: 'text', autocomplete: 'off', autocapitalize: 'sentences',
    enterkeyhint: 'done', maxlength: '200', placeholder: 'Ne yapacaksın?', 'aria-label': 'Ne yapacaksın?',
  });
  const addBtn = h('button', { type: 'submit', class: 'btn t-quick-add' }, 'Ekle');
  addBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // odak kutuda kalsın, klavye kapanmasın
  const preview = h('p', { class: 't-quick-preview', hidden: true, 'aria-live': 'polite' });

  // Kullanıcı çipe kendisi dokunduysa yazıdaki ifade artık tarihi/saati değiştirmez (yazı temizlenince sıfırlanır).
  let manualDate = false;
  let manualTime = false;
  const dates = dateChips({ value: ymd(today0()), keepFocus: true, onPick: () => { manualDate = true; } });
  const time = timeChip({ onPick: () => { manualTime = true; } });

  function detect() {
    const text = input.value;
    if (!text.trim()) {
      manualDate = false; manualTime = false;
      dates.set(ymd(today0())); time.set('');
      preview.hidden = true;
      return;
    }
    const parsed = parseQuick(text);
    if (!manualDate) dates.set(parsed.date ?? ymd(today0()));
    if (!manualTime) time.set(parsed.time ?? '');
    const changed = parsed.title && (parsed.date || parsed.time) && parsed.title !== text.trim();
    preview.hidden = !changed;
    if (changed) preview.textContent = `"${parsed.title}" olarak eklenecek`;
  }
  input.addEventListener('input', detect);

  const form = h('form', { class: 't-quick-form', novalidate: true },
    h('div', { class: 't-quick-row' }, input, addBtn),
    h('div', { class: 't-quick-chips' }, h('div', { class: 't-chips-scroll' }, dates.el), time.el),
    preview);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = parseQuick(input.value);
    if (!parsed.title) {
      input.focus();
      input.classList.remove('is-shake');
      void input.offsetWidth;
      input.classList.add('is-shake');
      preview.hidden = false;
      preview.textContent = input.value.trim() ? 'Tarihi anladım, ne yapacağını da yaz.' : 'Önce ne yapacağını yaz.';
      return;
    }
    const date = dates.value;
    const task = add('tasks', { title: parsed.title, date, time: date ? time.value : '', remind: 'none', prio: 'normal', note: '' });
    playCall('check');
    input.value = '';
    detect();
    input.focus();
    const when = taskWhen(task);
    toast(`${task.title}${when ? ` · ${when}` : ''} eklendi`, {
      actions: [calendarAction('tasks', task), { label: 'Geri al', onAction: () => remove('tasks', task.id) }],
    });
  });

  return { el: h('section', { class: 't-quick', 'aria-label': 'Hızlı ekle' }, form), rebuild: () => { dates.rebuild(); detect(); } };
}

/* ---------- Kaydırma (sola: Sil, sağa: Yarına ertele) ---------- */

const OPEN = 104;

function closeOpenRow(except) {
  if (openRow && openRow !== except) openRow.close();
}

function swipeable(wrap, content) {
  let startX = 0; let startY = 0; let base = 0; let dx = 0;
  let tracking = false; let decided = false; let horizontal = false; let pointer = null; let suppress = false;
  const api = { offset: 0, close: () => settle(0) };

  function setX(x, animate) {
    content.style.transition = animate ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    content.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    wrap.dataset.side = x > 0 ? 'left' : x < 0 ? 'right' : '';
  }
  function settle(x) {
    api.offset = x;
    setX(x, true);
    wrap.classList.toggle('is-open', x !== 0);
    if (x !== 0) { closeOpenRow(api); openRow = api; } else if (openRow === api) openRow = null;
  }

  content.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tracking = true; decided = false; horizontal = false; pointer = e.pointerId;
    startX = e.clientX; startY = e.clientY; base = api.offset; dx = base;
  });
  content.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== pointer) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;
    if (!decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      decided = true;
      horizontal = Math.abs(mx) > Math.abs(my) * 1.2;
      if (!horizontal) { tracking = false; return; }
      content.setPointerCapture?.(pointer);
      closeOpenRow(api);
    }
    let x = base + mx;
    const limit = OPEN * 1.25;
    if (Math.abs(x) > limit) x = Math.sign(x) * (limit + (Math.abs(x) - limit) * 0.25); // lastik gibi
    dx = x;
    setX(x, false);
  });
  const end = (e) => {
    if (!tracking || e.pointerId !== pointer) return;
    tracking = false;
    if (!horizontal) return;
    suppress = true;
    settle(dx <= -OPEN / 2 ? -OPEN : dx >= OPEN / 2 ? OPEN : 0);
  };
  content.addEventListener('pointerup', end);
  content.addEventListener('pointercancel', (e) => { if (tracking && horizontal) { tracking = false; settle(0); } });
  // Kaydırmanın sonundaki "tık" satırı açmasın; açık satıra dokunmak onu kapatır.
  content.addEventListener('click', (e) => {
    if (suppress || api.offset !== 0) {
      e.stopPropagation();
      e.preventDefault();
      if (!suppress) settle(0);
      suppress = false;
    }
  }, true);
  return api;
}

/* ---------- Liste ---------- */

function postpone(task) {
  const before = snapshot();
  const date = postponeDate(task);
  update('tasks', task.id, { date });
  toast(`${task.title} · ${taskWhen({ ...task, date }) || 'ertelendi'}`, { action: 'Geri al', onAction: () => restore(before) });
}

function removeTask(task) {
  const before = snapshot();
  remove('tasks', task.id);
  toast(`${task.title} silindi`, { action: 'Geri al', onAction: () => restore(before) });
}

/** Tik → üstü çizilir → satır yavaşça kaybolur → kaydedilir; toast'ta "Geri al". */
function complete(task, wrap) {
  if (pending.has(task.id)) return;
  pending.add(task.id);
  wrap.classList.add('is-done');
  playCall('check');
  const calm = reducedMotion();
  setTimeout(() => wrap.classList.add('is-leaving'), calm ? 0 : 520);
  setTimeout(() => {
    pending.delete(task.id);
    const before = snapshot();
    try { update('tasks', task.id, { done: true, doneAt: new Date().toISOString() }); } catch { return; }
    toast(`${task.title} tamamlandı`, { action: 'Geri al', onAction: () => restore(before) });
  }, calm ? 150 : 520 + 420);
}

function uncomplete(task) {
  const before = snapshot();
  update('tasks', task.id, { done: false });
  toast(`${task.title} yeniden açıldı`, { action: 'Geri al', onAction: () => restore(before) });
}

function openRowView(task) {
  const when = taskWhen(task);
  const late = /gecikti/.test(when);
  const wrap = h('li', { class: `t-item${pending.has(task.id) ? ' is-done' : ''}`, dataset: { id: task.id } });
  const check = h('button', {
    type: 'button', class: 't-check', 'aria-label': `${task.title} tamamlandı olarak işaretle`,
    onclick: (e) => { e.stopPropagation(); complete(task, wrap); },
  }, icon('check', 't-svg t-check-svg'));
  const main = h('button', { type: 'button', class: 't-main', onclick: () => openForm(task), 'aria-label': `${task.title}${when ? `, ${when}` : ''}${task.prio === 'high' ? ', önemli' : ''}. Düzenle` },
    h('span', { class: 't-title' }, task.title),
    (when || task.prio === 'high' || task.note) && h('span', { class: 't-meta' },
      when && h('span', { class: `t-when${late ? ' is-late' : ''}` }, when),
      task.prio === 'high' && h('span', { class: 't-flag', title: 'Yüksek önem' }, icon('flag', 't-svg t-meta-svg')),
      task.note && h('span', { class: 't-has-note', title: 'Not var' }, icon('note', 't-svg t-meta-svg'))));
  const content = h('div', { class: 't-row' }, check, main);
  const postponeBtn = h('button', { type: 'button', class: 't-act t-act-later', tabindex: '-1', 'aria-hidden': 'true', onclick: () => postpone(task) }, icon('later', 't-svg'), h('span', {}, postponeLabel(task)));
  const deleteBtn = h('button', { type: 'button', class: 't-act t-act-delete', tabindex: '-1', 'aria-hidden': 'true', onclick: () => removeTask(task) }, icon('trash', 't-svg'), h('span', {}, 'Sil'));
  wrap.append(h('div', { class: 't-acts' }, postponeBtn, deleteBtn), content);
  swipeable(wrap, content);
  return wrap;
}

function doneRowView(task) {
  const when = doneWhen(task);
  return h('li', { class: 't-item is-complete', dataset: { id: task.id } },
    h('div', { class: 't-row' },
      h('button', { type: 'button', class: 't-check is-on', 'aria-label': `${task.title} geri al`, onclick: () => uncomplete(task) }, icon('check', 't-svg t-check-svg')),
      h('button', { type: 'button', class: 't-main', onclick: () => openForm(task), 'aria-label': `${task.title}, tamamlandı${when ? ` ${when}` : ''}. Düzenle` },
        h('span', { class: 't-title' }, task.title),
        when && h('span', { class: 't-meta' }, h('span', { class: 't-when' }, `Tamamlandı · ${when}`))),
      h('button', { type: 'button', class: 't-undo', onclick: () => uncomplete(task) }, icon('undo', 't-svg t-meta-svg'), 'Geri al')));
}

function emptyState() {
  return h('div', { class: 't-empty' },
    h('div', { class: 't-empty-tamarin', 'aria-hidden': 'true' }, h('img', { src: 'assets/tamarin.webp', alt: '', draggable: 'false' })),
    h('p', { class: 't-empty-text' }, 'Aklındaki işleri yaz, ben unutmayayım'));
}

function segment() {
  return h('div', { class: 't-seg', role: 'tablist', 'aria-label': 'Liste' },
    [['open', 'Yaklaşan'], ['done', 'Tamamlanan']].map(([key, label]) => h('button', {
      type: 'button', role: 'tab', class: 't-seg-btn', 'aria-selected': String(view === key),
      onclick: () => { if (view !== key) { view = key; drawList(); } },
    }, label)));
}

function drawOpen() {
  const tasks = getState().tasks;
  const groups = taskGroups(tasks);
  if (!groups.length) return [tasks.length ? h('p', { class: 't-note-empty' }, 'Hepsini bitirdin. Yeni bir iş aklına gelirse yukarıya yaz.') : emptyState()];
  return groups.map((g) => h('section', { class: 't-group', dataset: { group: g.key }, 'aria-label': g.title },
    h('h2', { class: 't-group-title' }, g.title, h('span', { class: 't-group-count' }, String(g.items.length))),
    h('ul', { class: 't-list' }, g.items.map(({ task }) => openRowView(task)))));
}

function drawDone() {
  const done = completedTasks(getState().tasks);
  if (!done.length) return [h('p', { class: 't-note-empty' }, 'Henüz tamamlanan iş yok.')];
  const clear = confirmTap(h('button', { type: 'button', class: 'btn btn-danger t-clear' }, 'Tamamlananları temizle'), () => {
    const before = snapshot();
    for (const task of completedTasks(getState().tasks)) remove('tasks', task.id);
    toast(`${done.length} tamamlanan iş temizlendi`, { action: 'Geri al', onAction: () => restore(before) });
  });
  return [h('ul', { class: 't-list' }, done.map(doneRowView)), clear];
}

/** Yalnızca listeyi çizer; satırlar yeni yerlerine kayarak gider (FLIP, yalnızca transform). */
function drawList() {
  if (!listHost?.isConnected) return;
  const before = new Map();
  if (!reducedMotion()) listHost.querySelectorAll('.t-item').forEach((el) => before.set(el.dataset.id, el.getBoundingClientRect().top));
  // İlk çizimde ve sekme değişince her şey yeni sayılmaz; yalnızca aynı görünümde sonradan gelenler.
  const known = lastView === view ? new Set([...listHost.querySelectorAll('.t-item')].map((el) => el.dataset.id)) : null;
  openRow = null;
  listHost.replaceChildren(segment(), ...(view === 'open' ? drawOpen() : drawDone()));
  lastView = view;
  listHost.querySelectorAll('.t-item').forEach((el) => {
    // Önceki çizimde olmayan satır (hızlı ekleme, form, "Geri al") belirerek girer.
    if (known && !known.has(el.dataset.id)) el.classList.add('is-new');
    const old = before.get(el.dataset.id);
    if (old === undefined) return;
    const delta = old - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    el.style.transform = `translateY(${delta}px)`;
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    });
  });
}

function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  midnightTimer = setTimeout(() => { if (!root?.isConnected) return; quick?.rebuild(); drawList(); scheduleMidnight(); }, next - now);
}

/* ---------- Detaylı form ---------- */

function openForm(task = null) {
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);
  const title = h('input', { class: 'input', id: 't-title', autocomplete: 'off', autocapitalize: 'sentences', maxlength: '200', placeholder: 'Örn. Dişçi randevusu' });
  const timeInput = h('input', { class: 'input', id: 't-time', type: 'time' });
  const clearTime = h('button', { type: 'button', class: 'btn-text t-time-clear', onclick: () => { timeInput.value = ''; syncTime(); } }, 'Saati kaldır');
  const note = h('textarea', { class: 'input t-note', id: 't-note', rows: '3', maxlength: '1000', placeholder: 'Ayrıntılar, adres, getirilecekler…' });
  title.value = task?.title ?? '';
  timeInput.value = task?.time ?? '';
  note.value = task?.note ?? '';

  const dates = dateChips({ value: task ? task.date : ymd(today0()), allowNone: true, onPick: () => syncTime() });
  const reminders = pickGrid({ label: 'Hatırlatma', columns: 3, value: task?.remind ?? 'none', options: REMINDERS.map(([value, label]) => ({ value, label })) });
  const prios = pickGrid({ label: 'Önem', columns: 3, value: task?.prio ?? 'normal', options: PRIOS.map(([value, label]) => ({ value, label, icon: value === 'high' ? icon('flag', 't-svg t-meta-svg t-pick-flag') : null })) });

  // Tarihsiz görevin saati olmaz.
  function syncTime() {
    const dated = !!dates.value;
    timeInput.disabled = !dated;
    if (!dated) timeInput.value = '';
    clearTime.hidden = !timeInput.value;
  }
  timeInput.addEventListener('input', syncTime);
  timeInput.addEventListener('change', syncTime);

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'tasks' } },
    field('title', 'Başlık', title),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tarih'), h('div', { class: 't-form-chips' }, dates.el)),
    field('time', 'Saat (isteğe bağlı)', timeInput),
    clearTime,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Hatırlatma'), reminders.el),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Önem'), prios.el),
    field('note', 'Not', note),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, task ? 'Kaydet' : 'Ekle')),
    task && !task.done && h('button', { type: 'button', class: 'btn btn-secondary btn-block t-form-later', onclick: () => { closeSheet(); postpone(task); } }, icon('later', 't-svg t-meta-svg'), postponeLabel(task)),
    task && calendarButton('tasks', task),
    task && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sil'), () => { closeSheet(); removeTask(task); }));
  syncTime();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!title.value.trim()) { errors.title.textContent = 'Başlık boş olamaz.'; focusFirstError(form); return; }
    if (timeInput.value && !/^\d\d:\d\d$/.test(timeInput.value)) { errors.time.textContent = 'Saati SS:DD biçiminde seç.'; focusFirstError(form); return; }
    const data = { title: title.value.trim(), date: dates.value, time: dates.value ? timeInput.value : '', remind: reminders.value, prio: prios.value, note: note.value };
    let saved;
    try {
      saved = task ? update('tasks', task.id, data) : add('tasks', data);
    } catch (err) {
      errors.note.textContent = err.message;
      return;
    }
    closeSheet();
    if (task) toast(`${data.title} güncellendi`);
    else toast(`${data.title} eklendi`, { actions: [calendarAction('tasks', saved)] });
  });

  openSheet({ title: task ? 'İşi düzenle' : 'İş ekle', body: form });
}

/* ---------- Modül ---------- */

export default {
  id: 'tasks',
  route: 'ajanda',
  title: 'Ajanda',
  addLabel: 'İş ekle',
  onAdd: () => openForm(),
  render(container) {
    view = 'open';
    quick = quickAdd();
    listHost = h('div', { class: 't-body' });
    root = h('div', { class: 'tasks' }, quick.el, listHost);
    container.append(root);
    stop?.();
    stop = onChange(() => drawList()); // yazı kutusu ve çipler yerinde kalır
    scheduleMidnight();
    queueMicrotask(drawList);
  },
  leave() {
    lastView = null;
    stop?.();
    stop = null;
    clearTimeout(midnightTimer);
    root = null;
    listHost = null;
    quick = null;
    openRow = null;
  },
};
