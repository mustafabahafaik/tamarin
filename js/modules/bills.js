// Ödemeler (#odemeler, halkadaki turuncu dilim): kira, aidat, faturalar, abonelikler.
// Ay bazında hesaplar js/status.js'te (billMonth, monthSummary, togglePaid); veri store API'siyle yazılır.
// Her değişiklik store "change" olayı yayınlar; ana ekran (dilim özeti, zil, mesaj, "Bugün") kendiliğinden güncellenir.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import { getState, onChange, add, update, remove, snapshot, restore, BILL_CATS } from '../store.js';
import { monthSummary, togglePaid, shiftMonth, parseAmount, money } from '../status.js';
import { today0, formatShort, AYLAR } from '../dates.js';
import { playCall } from '../sound.js';
import { field as formField, pickGrid, focusFirstError, calendarButton, calendarAction } from '../form.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  Kira: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  Aidat: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15M10.5 20.5V18h3v2.5"/>',
  Telefon: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  'İnternet': '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.3a9.5 9.5 0 0 1 13 0"/><path d="M8.6 15.6a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  Elektrik: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  Su: '<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
  'Doğalgaz': '<path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4.5-3.5-6.5-4.5-11-2.5 2-3 4.5-3 6.5-1-.8-1.6-2-1.8-3.4C7.4 9.3 5.5 12 5.5 15a6.5 6.5 0 0 0 6.5 6.5z"/>',
  Abonelik: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/>',
  'Kredi kartı': '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  'Diğer': '<path d="M6 2.5h12v19l-2.5-1.6L13 21.5l-2.5-1.6L8 21.5l-2-1.6z"/><path d="M9 7.5h6M9 11h6M9 14.5h3.5"/>',
  check: '<path d="m6 12.5 4 4 8-9"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
};

const icon = (name, cls = 'b-svg') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? PATHS['Diğer']}</svg>`);

/* ---------- Durum ---------- */

let selected = null;      // [yıl, ay] — ekran her açıldığında bu aya döner
let justToggled = null;   // yeniden çizimden sonra tik animasyonu oynayacak satır
let root = null;
let stop = null;

const monthTitle = ([y, m]) => `${AYLAR[m - 1]} ${y}`;

function currentMonth() {
  const t = today0();
  return [t.getFullYear(), t.getMonth() + 1];
}

/* ---------- Görünüm ---------- */

function summaryCard(summary) {
  const [y, m] = selected;
  const ratio = summary.count ? summary.paidCount / summary.count : 0;
  const switcher = h('div', { class: 'b-switch' },
    h('button', { type: 'button', class: 'b-switch-btn', 'aria-label': 'Önceki ay', onclick: () => { selected = shiftMonth(y, m, -1); draw(); } }, icon('prev')),
    h('span', { class: 'b-switch-label' }, AYLAR[m - 1]),
    h('button', { type: 'button', class: 'b-switch-btn', 'aria-label': 'Sonraki ay', onclick: () => { selected = shiftMonth(y, m, 1); draw(); } }, icon('next')));

  return h('section', { class: `b-summary${summary.allPaid ? ' is-done' : ''}`, 'aria-label': `${monthTitle(selected)} özeti` },
    h('div', { class: 'b-sum-top' },
      h('div', { class: 'b-sum-head' },
        h('p', { class: 'b-month' }, monthTitle(selected)),
        h('p', { class: 'b-total' }, money.format(summary.total)),
        h('p', { class: 'b-total-label' }, 'Toplam')),
      switcher),
    h('div', { class: 'b-split' },
      h('div', {}, h('span', { class: 'b-split-label' }, 'Ödenen'), h('span', { class: 'b-split-value is-paid' }, money.format(summary.paidAmount))),
      h('div', {}, h('span', { class: 'b-split-label' }, 'Kalan'), h('span', { class: 'b-split-value' }, money.format(summary.remaining)))),
    h('div', { class: 'b-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(summary.count), 'aria-valuenow': String(summary.paidCount) },
      h('span', { style: `width:${Math.round(ratio * 100)}%` })),
    h('p', { class: 'b-count' }, summary.allPaid ? 'Bu ayki tüm ödemeler tamam' : `${summary.paidCount}/${summary.count} ödendi`));
}

function row(r) {
  const { bill } = r;
  const date = r.paid ? `${formatShort(r.due)} · Sonraki: ${formatShort(r.next)}` : formatShort(r.due);
  const check = h('button', {
    type: 'button',
    class: `b-check${r.paid ? ' is-on' : ''}${justToggled === bill.id ? ' is-pop' : ''}`,
    'aria-pressed': String(r.paid),
    'aria-label': `${bill.name}: ${r.paid ? 'ödenmedi olarak işaretle' : 'ödendi olarak işaretle'}`,
    onclick: () => togglePayment(bill, r.key),
  }, icon('check', 'b-check-svg'));

  return h('li', { class: 'b-row', dataset: { state: r.state } },
    h('button', { type: 'button', class: 'b-main', onclick: () => openForm(bill), 'aria-label': `${bill.name}, ${r.label}. Düzenle` },
      h('span', { class: 'b-icon' }, icon(bill.cat)),
      h('span', { class: 'b-text' },
        h('span', { class: 'b-name' }, bill.name),
        h('span', { class: 'b-date' }, date)),
      h('span', { class: 'b-right' },
        h('span', { class: 'b-amount' }, bill.amount ? money.format(bill.amount) : '—'),
        h('span', { class: 'b-chip' }, r.label))),
    check);
}

function emptyState() {
  return h('div', { class: 'b-empty' },
    h('div', { class: 'b-empty-tamarin', 'aria-hidden': 'true' }, h('img', { src: 'assets/tamarin.webp', alt: '', draggable: 'false' })),
    h('p', { class: 'b-empty-text' }, 'Kira, aidat, faturalar... İlk ödemeni ekle'),
    h('button', { type: 'button', class: 'btn btn-primary b-empty-btn', onclick: () => openForm() }, 'Ödeme ekle'));
}

function draw() {
  if (!root?.isConnected) return;
  const bills = getState().bills;
  if (!bills.length) {
    root.replaceChildren(emptyState());
    return;
  }
  const [y, m] = selected;
  const summary = monthSummary(bills, y, m);
  root.replaceChildren(
    summaryCard(summary),
    h('ul', { class: 'b-list', 'aria-label': `${monthTitle(selected)} ödemeleri` }, summary.rows.map(row)));
  justToggled = null;
}

/* ---------- İşlemler ---------- */

function togglePayment(bill, key) {
  const before = bill.paid;
  const nowPaid = !before.includes(key);
  justToggled = bill.id;
  update('bills', bill.id, { paid: togglePaid(before, key) });
  if (nowPaid) playCall('check');
  const [y, m] = key.split('-').map(Number);
  const when = `${AYLAR[m - 1]}${y !== selected[0] ? ` ${y}` : ''}`;
  toast(`${bill.name} · ${when} ${nowPaid ? 'ödendi' : 'ödenmedi'} olarak işaretlendi`, {
    action: 'Geri al',
    onAction: () => { if (getState().bills.some((b) => b.id === bill.id)) update('bills', bill.id, { paid: before }); },
  });
}

const DIGITS = { inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' };

/** Ekle/düzenle formu (sheet). */
function openForm(bill = null) {
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);

  const name = h('input', { class: 'input', id: 'b-name', autocomplete: 'off', autocapitalize: 'words', maxlength: '200', placeholder: 'Örn. Kira' });
  const amount = h('input', { class: 'input', id: 'b-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Örn. 1.250' });
  const dayInput = h('input', { class: 'input', id: 'b-day', ...DIGITS, maxlength: '2', placeholder: '1–31' });
  const note = h('textarea', { class: 'input b-note', id: 'b-note', rows: '2', maxlength: '1000' });
  name.value = bill?.name ?? '';
  amount.value = bill?.amount ? String(bill.amount).replace('.', ',') : '';
  dayInput.value = bill?.day ? String(bill.day) : '';
  note.value = bill?.note ?? '';

  // Tür: ikonlu seçim (ortak pickGrid)
  const cats = pickGrid({ label: 'Tür', value: bill?.cat ?? 'Kira', options: BILL_CATS.map((c) => ({ value: c, label: c, icon: icon(c, 'pick-svg') })) });

  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, bill ? 'Kaydet' : 'Ekle');
  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'bills' } },
    field('name', 'Ad', name),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tür'), cats.el),
    h('div', { class: 'b-two' },
      field('amount', 'Tutar (isteğe bağlı)', amount),
      field('day', 'Ayın kaçı', dayInput)),
    h('p', { class: 'field-hint b-day-hint' }, '29–31 seçersen kısa aylarda ayın son günü sayılır.'),
    field('note', 'Not', note),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      save),
    bill && calendarButton('bills', bill),
    bill && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sil'), () => {
      const before = snapshot();
      remove('bills', bill.id);
      closeSheet();
      toast(`${bill.name} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let ok = true;
    const nameValue = name.value.trim();
    const amountValue = parseAmount(amount.value);
    const dayValue = Number(dayInput.value.trim());
    if (!nameValue) { errors.name.textContent = 'Ad boş olamaz.'; ok = false; }
    if (Number.isNaN(amountValue) || amountValue < 0) { errors.amount.textContent = 'Geçerli bir tutar yaz (ör. 1.250,50).'; ok = false; }
    if (!/^\d{1,2}$/.test(dayInput.value.trim()) || dayValue < 1 || dayValue > 31) { errors.day.textContent = 'Gün 1 ile 31 arasında olmalı.'; ok = false; }
    if (!ok) { focusFirstError(form); return; }
    const data = { name: nameValue, cat: cats.value, amount: amountValue, day: dayValue, note: note.value };
    let saved;
    try {
      saved = bill ? update('bills', bill.id, data) : add('bills', { ...data, paid: [] });
    } catch (err) {
      errors.note.textContent = err.message;
      return;
    }
    closeSheet();
    if (bill) toast(`${nameValue} güncellendi`);
    else toast(`${nameValue} eklendi`, { actions: [calendarAction('bills', saved)] });
  });

  openSheet({ title: bill ? 'Ödemeyi düzenle' : 'Ödeme ekle', body: form });
}

/* ---------- Modül ---------- */

export default {
  id: 'bills',
  route: 'odemeler',
  title: 'Ödemeler',
  addLabel: 'Ödeme ekle',
  onAdd: () => openForm(),
  render(container) {
    selected = currentMonth();
    root = h('div', { class: 'bills' });
    container.append(root);
    stop?.();
    stop = onChange(() => draw()); // store değişince (bu ekrandan ya da başka yerden) yeniden çiz
    queueMicrotask(draw);
  },
  leave() {
    stop?.();
    stop = null;
    root = null;
  },
};
