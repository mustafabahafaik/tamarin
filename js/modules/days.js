// Özel Günler (#gunler, halkadaki pembe dilim): doğum günleri, yıldönümleri, özel günler.
// Hesaplar js/status.js'te (upcomingDays, groupDays, dayMilestone, dayCountdown); tarih kuralları
// js/dates.js annualDateError'da (store da aynısını uygular). Form parçaları js/form.js.
// Her değişiklik store "change" olayı yayınlar; ana ekran (dilim özeti, ruh hali, zil, mesaj, "Bugün") güncellenir.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import { getState, onChange, add, update, remove, snapshot, restore, DAY_KINDS, RELATIONS } from '../store.js';
import { upcomingDays, groupDays, celebrationText } from '../status.js';
import { today0, formatShort, isoDow, annualDateError, AYLAR, GUNLER } from '../dates.js';
import { playCall } from '../sound.js';
import { field as formField, pickGrid, focusFirstError, calendarButton, calendarAction } from '../form.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  cake: '<path d="M4 20.5h16"/><path d="M5.5 20.5v-7A1.5 1.5 0 0 1 7 12h10a1.5 1.5 0 0 1 1.5 1.5v7"/><path d="M5.5 15.8c1.2 0 1.6.9 3.2.9s1.6-.9 3.3-.9 1.7.9 3.3.9 2-.9 3.2-.9"/><path d="M12 12V9"/><path d="M12 4.3c1 1.1 1 2.4 0 3-1-.6-1-1.9 0-3z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
};

const KIND_ICON = { 'Doğum günü': 'cake', 'Yıldönümü': 'heart', 'Özel gün': 'star' };
const REL_KEY = { Aile: 'aile', 'Arkadaş': 'arkadas', Sevgili: 'sevgili', 'İş-Okul': 'is', 'Diğer': 'diger' };

const icon = (name, cls = 'd-svg') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? PATHS.star}</svg>`);
const kindIcon = (kind, cls) => icon(KIND_ICON[kind], cls);

/* ---------- Durum ---------- */

let root = null;
let stop = null;
let midnightTimer = 0;
let filter = null; // null = Tümü, yoksa RELATIONS'tan biri

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const initial = (name) => (name.trim()[0] ?? '?').toLocaleUpperCase('tr-TR');

/* ---------- Görünüm ---------- */

function badge(entry, cls = '') {
  return h('span', { class: `d-badge ${cls}`.trim(), dataset: { rel: REL_KEY[entry.rel] ?? 'diger' }, 'aria-hidden': 'true' }, initial(entry.name));
}

/** Kartın üstünde yavaşça düşen mat konfeti (yalnızca transform/opacity; hareket azaltmada hiç yok). */
function confetti() {
  const rnd = (i, k) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return h('span', { class: 'd-confetti', 'aria-hidden': 'true' }, Array.from({ length: 18 }, (_, i) => h('i', {
    class: i % 3 === 0 ? 'is-dot' : '',
    style: [
      `--x:${(4 + rnd(i, 1) * 92).toFixed(1)}%`,
      `--d:${(7 + rnd(i, 2) * 5).toFixed(2)}s`,
      `--delay:-${(rnd(i, 3) * 12).toFixed(2)}s`,
      `--r:${Math.round(160 + rnd(i, 4) * 400) * (i % 2 ? 1 : -1)}deg`,
      `--drift:${Math.round((rnd(i, 5) - 0.5) * 60)}px`,
      `--c:var(--confetti-${i % 5})`,
    ].join(';'),
  })));
}

function hero(item) {
  const { entry, date, milestone, countdown } = item;
  const party = item.diff === 0 && entry.kind === 'Doğum günü';
  const when = `${formatShort(date)} ${GUNLER[isoDow(date)]} · ${entry.rel}`;

  const main = h('button', {
    type: 'button',
    class: 'd-hero-main',
    'aria-label': party ? `${celebrationText(entry)} Kutla` : `${entry.name}, ${entry.kind}, ${when}, ${countdown.short}. Düzenle`,
    onclick: party ? () => cheer(main) : () => openForm(entry),
  },
  h('span', { class: 'd-hero-top' },
    badge(entry, 'd-badge-lg'),
    h('span', { class: 'd-hero-kind' }, kindIcon(entry.kind, 'd-svg d-kind-svg'), party ? 'Kutlama günü' : `En yakın · ${entry.kind}`)),
  h('span', { class: 'd-hero-name' }, party ? celebrationText(entry) : entry.name),
  h('span', { class: 'd-hero-when' }, when),
  h('span', { class: 'd-hero-count' },
    h('span', { class: 'd-hero-big' }, countdown.short),
    milestone && h('span', { class: 'd-hero-mile' }, milestone)));

  return h('section', { class: `d-hero${party ? ' is-party' : ''}`, dataset: { level: countdown.level }, 'aria-label': 'En yakın özel gün' },
    party && !reducedMotion() && confetti(),
    main,
    party && h('button', { type: 'button', class: 'd-hero-edit', 'aria-label': `${entry.name} düzenle`, onclick: () => openForm(entry) }, icon('edit')));
}

/** Kutlama kartına dokununca: mutlu tamarin trill'i (ses açıksa; playCall ayarı kendisi kontrol eder) ve küçük zıplama. */
function cheer(button) {
  playCall('happy');
  button.classList.remove('is-cheer');
  void button.offsetWidth;
  button.classList.add('is-cheer');
}

function row(item) {
  const { entry, countdown } = item;
  return h('li', {},
    h('button', {
      type: 'button',
      class: 'd-row',
      dataset: { level: countdown.level },
      onclick: () => openForm(entry),
      'aria-label': `${entry.name}, ${entry.kind}, ${entry.day} ${AYLAR[entry.month - 1]}, ${entry.rel}, ${countdown.short}. Düzenle`,
    },
    badge(entry),
    h('span', { class: 'd-text' },
      h('span', { class: 'd-name-line' }, h('span', { class: 'd-name' }, entry.name), kindIcon(entry.kind, 'd-svg d-kind-svg')),
      h('span', { class: 'd-date' }, `${entry.day} ${AYLAR[entry.month - 1]} · ${entry.rel}`)),
    h('span', { class: 'd-count' }, countdown.short)));
}

function filters() {
  const chip = (value, label) => h('button', {
    type: 'button',
    class: 'd-filter',
    'aria-pressed': String(filter === value),
    onclick: () => { filter = value; draw(); },
  }, value && h('span', { class: 'd-rel-dot', dataset: { rel: REL_KEY[value] } }), label);
  return h('div', { class: 'd-filters', role: 'group', 'aria-label': 'Yakınlık' }, chip(null, 'Tümü'), RELATIONS.map((r) => chip(r, r)));
}

function emptyState() {
  return h('div', { class: 'd-empty' },
    h('div', { class: 'd-empty-tamarin', 'aria-hidden': 'true' }, h('img', { src: 'assets/tamarin-768.webp', alt: '', draggable: 'false' })),
    h('p', { class: 'd-empty-text' }, 'Sevdiklerinin doğum günlerini ekle, sana bir gün önceden haber vereyim'),
    h('button', { type: 'button', class: 'btn btn-primary d-empty-btn', onclick: () => openForm() }, 'Özel gün ekle'));
}

function draw() {
  if (!root?.isConnected) return;
  const all = getState().days;
  if (!all.length) { root.replaceChildren(emptyState()); return; }

  const list = upcomingDays(all, today0(), filter);
  if (!list.length) {
    root.replaceChildren(filters(), h('p', { class: 'd-filter-empty' }, `${filter} yakınlığında kayıt yok.`));
    return;
  }

  const [first, ...rest] = list;
  const { thisMonth, months } = groupDays(rest, today0());
  const listOf = (items) => h('ul', { class: 'd-list' }, items.map(row));
  root.replaceChildren(...[
    filters(),
    hero(first),
    thisMonth.length > 0 && h('section', { class: 'd-group', 'aria-label': 'Bu ay' },
      h('h2', { class: 'd-group-title' }, 'Bu ay'), listOf(thisMonth)),
    months.length > 0 && h('section', { class: 'd-group', 'aria-label': 'Gelecek aylar' },
      h('h2', { class: 'd-group-title' }, 'Gelecek aylar'),
      months.map((m) => h('div', { class: 'd-month' }, h('h3', { class: 'd-month-title' }, m.title), listOf(m.items)))),
  ].filter(Boolean));
}

/** Gece yarısı geri sayımlar ve sıralama değişir: ekran açıksa yeniden çiz. */
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  midnightTimer = setTimeout(() => { if (!root?.isConnected) return; draw(); scheduleMidnight(); }, next - now);
}

/* ---------- Form ---------- */

const DIGITS = { inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' };
const YEAR_LABEL = { 'Doğum günü': 'Doğum yılı (isteğe bağlı)', 'Yıldönümü': 'Başlangıç yılı (isteğe bağlı)', 'Özel gün': 'Yıl (isteğe bağlı)' };

function openForm(entry = null) {
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);
  const t = today0();

  const name = h('input', { class: 'input', id: 'd-name', autocomplete: 'off', autocapitalize: 'words', maxlength: '200', placeholder: 'Örn. Annem, Ali' });
  const dayInput = h('input', { class: 'input', id: 'd-day', ...DIGITS, maxlength: '2', placeholder: '1–31' });
  const month = h('select', { class: 'input', id: 'd-month' }, AYLAR.map((m, i) => h('option', { value: String(i + 1) }, m)));
  const year = h('input', { class: 'input', id: 'd-year', ...DIGITS, maxlength: '4', placeholder: `Örn. ${t.getFullYear() - 25}` });
  const note = h('textarea', { class: 'input d-note', id: 'd-note', rows: '3', maxlength: '1000', placeholder: 'Hediye fikirleri, notlar…' });
  name.value = entry?.name ?? '';
  dayInput.value = entry ? String(entry.day) : '';
  month.value = String(entry?.month ?? t.getMonth() + 1);
  year.value = entry?.year ? String(entry.year) : '';
  note.value = entry?.note ?? '';

  const yearField = field('year', YEAR_LABEL[entry?.kind ?? 'Doğum günü'], year);
  const kinds = pickGrid({
    label: 'Tür', columns: 3, value: entry?.kind ?? 'Doğum günü',
    options: DAY_KINDS.map((k) => ({ value: k, label: k, icon: kindIcon(k, 'pick-svg') })),
    onChange: (k) => { yearField.querySelector('.field-label').textContent = YEAR_LABEL[k]; },
  });
  const rels = pickGrid({
    label: 'Yakınlık', columns: 5, value: entry?.rel ?? 'Aile',
    options: RELATIONS.map((r) => ({ value: r, label: r, icon: h('span', { class: 'd-rel-dot', dataset: { rel: REL_KEY[r] } }) })),
  });
  const leapHint = h('p', { class: 'field-hint d-leap-hint', hidden: true }, 'Artık yıl olmayan yıllarda 28 Şubat\'ta hatırlatırım.');

  const readInt = (input) => (/^\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : null);

  // Gün/ay değişince: 30 Şubat gibi tarihleri hemen söyle, 29 Şubat için not göster.
  function checkDate() {
    const d = readInt(dayInput);
    const m = Number(month.value);
    leapHint.hidden = !(d === 29 && m === 2);
    if (d !== null) errors.day.textContent = annualDateError(d, m) ?? '';
  }

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'days' } },
    field('name', 'İsim', name),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tür'), kinds.el),
    h('div', { class: 'd-two' }, field('day', 'Gün', dayInput), field('month', 'Ay', month)),
    leapHint,
    yearField,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Yakınlık'), rels.el),
    field('note', 'Not', note),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, entry ? 'Kaydet' : 'Ekle')),
    entry && calendarButton('days', entry),
    entry && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sil'), () => {
      const before = snapshot();
      remove('days', entry.id);
      closeSheet();
      toast(`${entry.name} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));

  // field() hatayı yazınca siler; bu dinleyiciler ondan sonra eklendiği için yeni hatayı yazar.
  dayInput.addEventListener('input', checkDate);
  month.addEventListener('change', checkDate);
  checkDate();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let ok = true;
    const d = readInt(dayInput);
    const m = Number(month.value);
    const y = year.value.trim() ? readInt(year) : null;
    if (!name.value.trim()) { errors.name.textContent = 'İsim boş olamaz.'; ok = false; }
    const dayProblem = d === null ? 'Günü yaz (1–31).' : annualDateError(d, m);
    if (dayProblem) { errors.day.textContent = dayProblem; ok = false; }
    if (year.value.trim() && y === null) { errors.year.textContent = 'Yılı dört haneli yaz (ör. 1998).'; ok = false; }
    else if (y !== null && !dayProblem) {
      const yearProblem = annualDateError(d, m, y, { today: t, strictDate: true });
      if (yearProblem) { errors.year.textContent = yearProblem; ok = false; }
    }
    if (!ok) { focusFirstError(form); return; }

    const data = { name: name.value.trim(), kind: kinds.value, day: d, month: m, year: y, rel: rels.value, note: note.value };
    let saved;
    try {
      saved = entry ? update('days', entry.id, data) : add('days', data);
    } catch (err) {
      errors.note.textContent = err.message;
      return;
    }
    closeSheet();
    if (entry) toast(`${data.name} güncellendi`);
    else toast(`${data.name} eklendi`, { actions: [calendarAction('days', saved)] });
  });

  openSheet({ title: entry ? 'Özel günü düzenle' : 'Özel gün ekle', body: form });
}

/* ---------- Modül ---------- */

export default {
  id: 'days',
  route: 'gunler',
  title: 'Özel Günler',
  addLabel: 'Özel gün ekle',
  onAdd: () => openForm(),
  render(container) {
    root = h('div', { class: 'days' });
    container.append(root);
    stop?.();
    stop = onChange(() => draw()); // store değişince (bu ekrandan ya da başka yerden) yeniden çiz
    scheduleMidnight();
    queueMicrotask(draw);
  },
  leave() {
    stop?.();
    stop = null;
    clearTimeout(midnightTimer);
    root = null;
  },
};
