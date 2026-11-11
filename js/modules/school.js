// Eğitim (#egitim, halkadaki mavi dilim): "Ders programı" | "Sınavlar".
// Hesaplar js/status.js'te (daySchedule, classConflicts, examCountdown, splitExams); form parçaları js/form.js.
// Her değişiklik store "change" olayı yayınlar; ana ekran (dilim özeti, ruh hali, zil, mesaj, "Bugün") güncellenir.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import { getState, onChange, add, update, remove, snapshot, restore, setField, EXAM_TYPES } from '../store.js';
import { daySchedule, classConflicts, examCountdown, splitExams, examWhen, minutesOf } from '../status.js';
import { today0, isoDow, addDays, ymd, GUNLER, GUNLER_KISA } from '../dates.js';
import { field as formField, pickGrid, suggestions, focusFirstError, calendarButton, calendarAction } from '../form.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  Vize: '<path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3.5V9h5.5"/><path d="m8.5 16.5 1-3.2 4.8-4.8 2.2 2.2-4.8 4.8z"/>',
  Final: '<path d="M5 21V4"/><path d="M5 4.5h11l-2.2 3.8L16 12H5"/>',
  'Bütünleme': '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4.2h4.2"/><path d="M12 8v4.5l3 1.8"/>',
  Quiz: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
  'Ödev teslimi': '<path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5z"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  'Proje teslimi': '<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5V17A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17z"/><path d="M12 10.5v5M9.5 13h5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5zM8 7.5h8"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
};

const icon = (name, cls = 's-svg') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? PATHS.book}</svg>`);

/* ---------- Durum ---------- */

let root = null;
let stop = null;
let tickTimer = 0;
let selectedDay = 1;   // 1 = Pzt … 7 = Paz; ekran her açıldığında bugüne döner
let pastOpen = false;  // "Geçmiş" grubu açık mı

const tab = () => getState().ui?.schoolTab ?? 'schedule';
const setTab = (value) => { if (value !== tab()) setField('ui', { ...getState().ui, schoolTab: value }); };

/** Ders adı önerileri: ders programı + sınavlardaki dersler. */
const courseNames = () => {
  const { classes, exams } = getState();
  return [...classes.map((c) => c.name), ...exams.map((e) => e.course)].sort((a, b) => a.localeCompare(b, 'tr'));
};

/* ---------- Ders programı ---------- */

function dayChips() {
  const { classes } = getState();
  const todayDow = isoDow(today0());
  return h('div', { class: 's-days', role: 'tablist', 'aria-label': 'Gün' }, [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const count = classes.filter((c) => c.day === d).length;
    const weekendEmpty = d >= 6 && !count;
    return h('button', {
      type: 'button',
      role: 'tab',
      class: `s-day${weekendEmpty ? ' is-faded' : ''}${d === todayDow ? ' is-today' : ''}`,
      'aria-selected': String(d === selectedDay),
      'aria-label': `${GUNLER[d]}, ${count ? `${count} ders` : 'ders yok'}${d === todayDow ? ', bugün' : ''}`,
      onclick: () => { selectedDay = d; draw(); },
    },
    h('span', { class: 's-day-name' }, GUNLER_KISA[d]),
    h('span', { class: 's-dots', 'aria-hidden': 'true' }, Array.from({ length: Math.min(count, 4) }, () => h('span', {}))));
  }));
}

function scheduleView() {
  const { classes } = getState();
  const todayDow = isoDow(today0());
  const isToday = selectedDay === todayDow;
  const items = daySchedule(classes, selectedDay, new Date(), isToday);
  const heading = h('p', { class: 's-dayhead' }, GUNLER[selectedDay], isToday && h('span', { class: 's-dayhead-today' }, ' · bugün'));

  if (!items.length) {
    return h('div', { class: 's-schedule' }, dayChips(), heading,
      h('div', { class: 's-empty' },
        h('p', { class: 's-empty-text' }, 'Bu gün ders yok'),
        h('button', { type: 'button', class: 'btn btn-primary s-empty-btn', onclick: () => openClassForm() }, 'Ders ekle')));
  }

  const timeline = h('ol', { class: 's-timeline' }, items.map((item) => {
    if (item.type === 'gap') return h('li', { class: 's-gap' }, h('span', {}, item.label));
    const c = item.entry;
    return h('li', { class: 's-slot', dataset: { state: item.state } },
      h('div', { class: 's-time' }, h('span', { class: 's-start' }, c.start), h('span', { class: 's-end' }, c.end)),
      h('button', { type: 'button', class: 's-card', onclick: () => openClassForm(c), 'aria-label': `${c.name}, ${c.start}–${c.end}${item.label ? `, ${item.label}` : ''}. Düzenle` },
        item.label && h('span', { class: 's-badge' }, item.label),
        h('span', { class: 's-name' }, c.name),
        (c.room || c.teacher) && h('span', { class: 's-meta' }, [c.room, c.teacher].filter(Boolean).join(' · ')),
        item.state === 'live' && h('span', { class: 's-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(item.progress * 100)) },
          h('span', { style: `width:${Math.round(item.progress * 100)}%` }))));
  }));

  return h('div', { class: 's-schedule' }, dayChips(), heading, timeline);
}

/* ---------- Sınavlar ---------- */

function examRow(exam, now, { past = false } = {}) {
  const cd = examCountdown(exam, now);
  return h('li', {},
    h('button', { type: 'button', class: `s-exam${past ? ' is-past' : ''}`, dataset: { level: cd.level }, onclick: () => openExamForm(exam), 'aria-label': `${exam.course} ${exam.type}, ${examWhen(exam)}, ${cd.short}. Düzenle` },
      h('span', { class: 's-type', title: exam.type }, icon(exam.type)),
      h('span', { class: 's-exam-text' },
        h('span', { class: 's-exam-course' }, exam.course),
        h('span', { class: 's-exam-meta' }, `${exam.type} · ${examWhen(exam)}`)),
      h('span', { class: 's-count' },
        cd.level === 'today' && h('span', { class: 's-live-dot', 'aria-hidden': 'true' }),
        cd.short)));
}

function examsView() {
  const now = new Date();
  const { upcoming, past } = splitExams(getState().exams, now);
  const parts = [];

  if (upcoming.length) {
    const [first, ...rest] = upcoming;
    const cd = examCountdown(first, now);
    parts.push(h('button', { type: 'button', class: 's-hero', dataset: { level: cd.level }, onclick: () => openExamForm(first) },
      h('span', { class: 's-hero-top' },
        h('span', { class: 's-type s-type-lg' }, icon(first.type)),
        h('span', { class: 's-hero-kind' }, `En yakın · ${first.type}`)),
      h('span', { class: 's-hero-course' }, first.course),
      h('span', { class: 's-hero-when' }, examWhen(first)),
      h('span', { class: 's-hero-count' },
        cd.level === 'today' && h('span', { class: 's-live-dot', 'aria-hidden': 'true' }),
        h('span', { class: 's-hero-detail' }, cd.detail),
        cd.detail !== cd.short && h('span', { class: 's-hero-short' }, cd.short))));
    if (rest.length) parts.push(h('ul', { class: 's-exams', 'aria-label': 'Yaklaşan sınavlar' }, rest.map((e) => examRow(e, now))));
  } else {
    parts.push(h('div', { class: 's-empty' },
      h('p', { class: 's-empty-text' }, 'Yaklaşan sınav yok'),
      h('button', { type: 'button', class: 'btn btn-primary s-empty-btn', onclick: () => openExamForm() }, 'Sınav ekle')));
  }

  if (past.length) {
    const toggle = h('button', { type: 'button', class: 's-past-toggle', 'aria-expanded': String(pastOpen), onclick: () => { pastOpen = !pastOpen; draw(); } },
      h('span', {}, `Geçmiş (${past.length})`), icon('chevron', 's-svg s-chevron'));
    parts.push(h('section', { class: 's-past' }, toggle,
      pastOpen && h('ul', { class: 's-exams' }, past.map((e) => examRow(e, now, { past: true })))));
  }
  return h('div', { class: 's-exams-view' }, parts);
}

/* ---------- Çizim ---------- */

function draw() {
  if (!root?.isConnected) return;
  const current = tab();
  const seg = h('div', { class: 's-seg', role: 'tablist', 'aria-label': 'Bölüm' },
    [['schedule', 'Ders programı'], ['exams', 'Sınavlar']].map(([key, label]) => h('button', {
      type: 'button', role: 'tab', class: 's-seg-btn', 'aria-selected': String(current === key), onclick: () => setTab(key),
    }, label)));
  root.replaceChildren(seg, current === 'schedule' ? scheduleView() : examsView());
  root.closest('.screen')?.querySelector('.fab')?.setAttribute('aria-label', current === 'exams' ? 'Sınav ekle' : 'Ders ekle');
}

/** Dakika başında yeniden çiz (Şimdi/Sıradaki, ilerleme ve geri sayımlar güncel kalsın). */
function scheduleTick() {
  clearTimeout(tickTimer);
  const msToMinute = 60000 - (Date.now() % 60000) + 50;
  tickTimer = setTimeout(() => { if (!root?.isConnected) return; draw(); scheduleTick(); }, msToMinute);
}

/* ---------- Formlar ---------- */

const TEXT = { autocomplete: 'off' };

function openClassForm(entry = null) {
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);
  const name = h('input', { class: 'input', id: 's-name', ...TEXT, autocapitalize: 'words', maxlength: '200', placeholder: 'Örn. Lineer Cebir' });
  const start = h('input', { class: 'input', id: 's-start', type: 'time' });
  const end = h('input', { class: 'input', id: 's-end', type: 'time' });
  const room = h('input', { class: 'input', id: 's-room', ...TEXT, maxlength: '60', placeholder: 'Örn. B-201' });
  const teacher = h('input', { class: 'input', id: 's-teacher', ...TEXT, autocapitalize: 'words', maxlength: '80' });
  name.value = entry?.name ?? '';
  start.value = entry?.start ?? '09:00';
  end.value = entry?.end ?? '09:50';
  room.value = entry?.room ?? '';
  teacher.value = entry?.teacher ?? '';

  const warning = h('p', { class: 'form-warning', role: 'status', hidden: true });
  const days = pickGrid({ label: 'Gün', columns: 7, value: entry?.day ?? selectedDay, options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: GUNLER_KISA[d] })), onChange: () => checkConflict() });

  // Aynı gün ve saatte çakışan ders varsa uyar (kaydetmeyi engellemez).
  function checkConflict() {
    const valid = /^\d\d:\d\d$/.test(start.value) && /^\d\d:\d\d$/.test(end.value) && minutesOf(end.value) > minutesOf(start.value);
    const clashes = valid ? classConflicts(getState().classes, { id: entry?.id, day: days.value, start: start.value, end: end.value }) : [];
    warning.hidden = !clashes.length;
    warning.textContent = clashes.length ? `Bu saatte ${clashes.map((c) => `${c.name} (${c.start}–${c.end})`).join(', ')} ile çakışıyor. Yine de kaydedebilirsin.` : '';
  }
  start.addEventListener('input', checkConflict);
  end.addEventListener('input', checkConflict);
  checkConflict();

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'school' } },
    field('name', 'Ders adı', name),
    suggestions(name, courseNames),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Gün'), days.el),
    h('div', { class: 's-two' }, field('start', 'Başlangıç', start), field('end', 'Bitiş', end)),
    warning,
    field('room', 'Derslik', room),
    field('teacher', 'Hoca', teacher),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, entry ? 'Kaydet' : 'Ekle')),
    entry && calendarButton('classes', entry),
    entry && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Dersi sil'), () => {
      const before = snapshot();
      remove('classes', entry.id);
      closeSheet();
      toast(`${entry.name} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let ok = true;
    if (!name.value.trim()) { errors.name.textContent = 'Ders adı boş olamaz.'; ok = false; }
    if (!/^\d\d:\d\d$/.test(start.value)) { errors.start.textContent = 'Başlangıç saatini seç.'; ok = false; }
    if (!/^\d\d:\d\d$/.test(end.value)) { errors.end.textContent = 'Bitiş saatini seç.'; ok = false; }
    else if (/^\d\d:\d\d$/.test(start.value) && minutesOf(end.value) <= minutesOf(start.value)) { errors.end.textContent = 'Bitiş, başlangıçtan sonra olmalı.'; ok = false; }
    if (!ok) { focusFirstError(form); return; }
    const data = { name: name.value.trim(), day: days.value, start: start.value, end: end.value, room: room.value, teacher: teacher.value };
    const previousDay = selectedDay;
    selectedDay = data.day; // kaydın "change" olayıyla yeniden çizilirken dersin günü açık olsun
    let saved;
    try {
      saved = entry ? update('classes', entry.id, data) : add('classes', data);
    } catch (err) {
      selectedDay = previousDay;
      errors.teacher.textContent = err.message;
      return;
    }
    closeSheet();
    if (entry) toast(`${data.name} güncellendi`);
    else toast(`${data.name} eklendi`, { actions: [calendarAction('classes', saved)] });
  });

  openSheet({ title: entry ? 'Dersi düzenle' : 'Ders ekle', body: form });
}

function openExamForm(entry = null) {
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);
  const course = h('input', { class: 'input', id: 'e-course', ...TEXT, autocapitalize: 'words', maxlength: '200', placeholder: 'Örn. Fizik II' });
  const date = h('input', { class: 'input', id: 'e-date', type: 'date' });
  const time = h('input', { class: 'input', id: 'e-time', type: 'time' });
  const room = h('input', { class: 'input', id: 'e-room', ...TEXT, maxlength: '60', placeholder: 'Örn. B-201' });
  const note = h('textarea', { class: 'input s-note', id: 'e-note', rows: '2', maxlength: '1000' });
  course.value = entry?.course ?? '';
  date.value = entry?.date ?? ymd(addDays(today0(), 7));
  time.value = entry?.time ?? '';
  room.value = entry?.room ?? '';
  note.value = entry?.note ?? '';
  const types = pickGrid({ label: 'Tür', columns: 3, value: entry?.type ?? 'Vize', options: EXAM_TYPES.map((t) => ({ value: t, label: t, icon: icon(t, 'pick-svg') })) });

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'school' } },
    field('course', 'Ders', course),
    suggestions(course, () => getState().classes.map((c) => c.name).concat(getState().exams.map((e) => e.course))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tür'), types.el),
    h('div', { class: 's-two' }, field('date', 'Tarih', date), field('time', 'Saat (isteğe bağlı)', time)),
    field('room', 'Derslik', room),
    field('note', 'Not', note),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, entry ? 'Kaydet' : 'Ekle')),
    entry && calendarButton('exams', entry),
    entry && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sınavı sil'), () => {
      const before = snapshot();
      remove('exams', entry.id);
      closeSheet();
      toast(`${entry.course} ${entry.type.toLocaleLowerCase('tr-TR')} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let ok = true;
    if (!course.value.trim()) { errors.course.textContent = 'Ders boş olamaz.'; ok = false; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { errors.date.textContent = 'Tarihi seç.'; ok = false; }
    if (time.value && !/^\d\d:\d\d$/.test(time.value)) { errors.time.textContent = 'Saati SS:DD biçiminde seç.'; ok = false; }
    if (!ok) { focusFirstError(form); return; }
    const data = { course: course.value.trim(), type: types.value, date: date.value, time: time.value, room: room.value, note: note.value };
    let saved;
    try {
      saved = entry ? update('exams', entry.id, data) : add('exams', data);
    } catch (err) {
      errors.note.textContent = err.message;
      return;
    }
    closeSheet();
    if (entry) toast('Sınav güncellendi');
    else toast(`${data.course} ${data.type.toLocaleLowerCase('tr-TR')} eklendi`, { actions: [calendarAction('exams', saved)] });
  });

  openSheet({ title: entry ? 'Sınavı düzenle' : 'Sınav ekle', body: form });
}

/* ---------- Modül ---------- */

export default {
  id: 'school',
  route: 'egitim',
  title: 'Eğitim',
  get addLabel() { return tab() === 'exams' ? 'Sınav ekle' : 'Ders ekle'; },
  onAdd: () => (tab() === 'exams' ? openExamForm() : openClassForm()),
  render(container) {
    selectedDay = isoDow(today0());
    pastOpen = false;
    root = h('div', { class: 'school' });
    container.append(root);
    stop?.();
    stop = onChange(() => draw());
    scheduleTick();
    queueMicrotask(draw);
  },
  leave() {
    stop?.();
    stop = null;
    clearTimeout(tickTimer);
    root = null;
  },
};
