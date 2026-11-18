// Telefonlar (#telefonlar, yüzde zilin yanındaki telefon ikonu): telefonlar, hatları ve SIM PIN'leri.
// Çizim js/phone-art.js'te; numara/PIN kuralları store.js'te (phoneDigits, simPin), biçim ve sıra
// js/status.js'te (formatPhone, sortPhones, MODEL_SHORT).
// PIN kuralları: listede, toast'ta, konsolda ve URL'de hiç yok. Ayrıntıda "••••"; göz ikonuyla görünür,
// 30 sn sonra, ekrandan çıkınca ve uygulama arka plana geçince yeniden gizlenir. Kopyalanan PIN
// 30 sn sonra panodan silinir. Bu dosyada console.* kullanılmaz.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import {
  getState, onChange, add, update, remove, snapshot, restore,
  PHONE_MODELS, CASE_COLORS, MAX_EXTRA, phoneDigits, simPin,
} from '../store.js';
import { formatPhone, sortPhones, MODEL_SHORT } from '../status.js';
import { phoneArt, caseVar } from '../phone-art.js';
import { field as formField, pickGrid, focusFirstError } from '../form.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a16 16 0 0 1-3.1 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  call: '<path d="M5 3.5h3.2l1.6 4.3-2.1 1.4a11 11 0 0 0 5.1 5.1l1.4-2.1 4.3 1.6V17a2.5 2.5 0 0 1-2.7 2.5C9.9 19 5 14.1 4.5 7.2A2.5 2.5 0 0 1 5 3.5z"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

const icon = (name, cls = 'p-icon') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);
const art = (phone, size, cls) => svg(phoneArt(phone.model, phone.color, phone.cased, size, cls));

const EXTRA_LABELS = ['Operatör', 'Tarife', 'IMEI', 'PUK', 'Alış tarihi', 'Garanti', 'Kimde'];
const PIN_DOTS = '••••'; // PIN uzunluğu da belli olmasın: hep dört nokta
const REVEAL_MS = 30000;

/* ---------- PIN gizleme ---------- */

// Açık (görünen) her PIN burada bir "gizle" fonksiyonuyla durur: ayrıntıdaki değer ve formdaki alan.
const revealed = new Set();

function hideAllPins() {
  for (const hide of [...revealed]) hide();
}

// Uygulama arka plana geçince (iPhone'da başka uygulamaya geçiş, ekran kilidi) PIN'ler gizlenir.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hideAllPins(); });
window.addEventListener('pagehide', hideAllPins);

/* ---------- Pano ---------- */

let clipboardTimer = 0;

async function copy(value, { secret = false, label = 'Kopyalandı' } = {}) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    toast('Kopyalanamadı');
    return;
  }
  if (!secret) { toast(label); return; }
  toast('PIN kopyalandı, 30 sn sonra panodan silinecek');
  clearTimeout(clipboardTimer);
  clipboardTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), REVEAL_MS);
}

/* ---------- Liste ---------- */

let root = null;
let stop = null;

const numberText = (phone) => (phone.number ? formatPhone(phone.number) : 'Numara yok');
const colorLabel = (phone) => (phone.cased ? `${phone.color} kılıf` : phone.color);

function row(phone) {
  return h('li', {},
    h('button', {
      type: 'button',
      class: 'p-row',
      onclick: () => openDetail(phone.id),
      'aria-label': `${phone.name}, ${numberText(phone)}, ${phone.model}, ${colorLabel(phone)}`,
    },
    h('span', { class: 'p-row-art' }, art(phone, 44, 'phone-art')),
    h('span', { class: 'p-row-text' },
      h('span', { class: 'p-row-name' }, phone.name),
      h('span', { class: `p-row-number${phone.number ? '' : ' is-empty'}` }, numberText(phone))),
    h('span', { class: 'p-row-meta' },
      h('span', { class: `p-dot${phone.color === 'Şeffaf' ? ' is-clear' : ''}`, style: `--dot: ${caseVar(phone.color)}` }),
      MODEL_SHORT[phone.model] ?? 'Diğer')));
}

function emptyState() {
  return h('div', { class: 'p-empty' },
    svg(phoneArt('iPhone 12', 'Su yeşili', true, 72, 'phone-art p-empty-art')),
    h('p', { class: 'p-empty-text' }, 'Telefonlarını ekle'),
    h('button', { type: 'button', class: 'btn btn-primary p-empty-btn', onclick: () => openForm() }, 'Telefon ekle'));
}

function draw() {
  if (!root?.isConnected) return;
  const phones = sortPhones(getState().phones);
  if (!phones.length) { root.replaceChildren(emptyState()); return; }
  root.replaceChildren(
    h('p', { class: 'p-count' }, `${phones.length} telefon`),
    h('ul', { class: 'p-list' }, phones.map(row)));
}

/* ---------- Ayrıntı ---------- */

/** "SIM PIN ••••" satırı: göz ile göster/gizle (30 sn sonra kendiliğinden gizlenir), Kopyala. */
function pinRow(pin) {
  const value = h('span', { class: 'p-pin-value' }, pin ? PIN_DOTS : '—');
  const eye = h('button', { type: 'button', class: 'p-mini', 'aria-label': 'PIN\'i göster', 'aria-pressed': 'false', disabled: !pin }, icon('eye'));
  let timer = 0;

  function hide() {
    clearTimeout(timer);
    revealed.delete(hide);
    value.textContent = pin ? PIN_DOTS : '—';
    value.classList.remove('is-shown');
    eye.setAttribute('aria-pressed', 'false');
    eye.setAttribute('aria-label', 'PIN\'i göster');
    eye.replaceChildren(icon('eye'));
  }

  function show() {
    value.textContent = pin;
    value.classList.add('is-shown');
    eye.setAttribute('aria-pressed', 'true');
    eye.setAttribute('aria-label', 'PIN\'i gizle');
    eye.replaceChildren(icon('eyeOff'));
    revealed.add(hide);
    clearTimeout(timer);
    timer = setTimeout(hide, REVEAL_MS);
  }

  eye.addEventListener('click', () => (revealed.has(hide) ? hide() : show()));
  const copyBtn = h('button', { type: 'button', class: 'btn btn-secondary p-copy', disabled: !pin }, icon('copy'), 'Kopyala');
  copyBtn.addEventListener('click', () => copy(pin, { secret: true }));

  return { el: h('div', { class: 'p-field' },
    h('span', { class: 'field-label' }, 'SIM PIN'),
    h('div', { class: 'p-field-row' }, value, eye, copyBtn)), hide };
}

function info(label, value) {
  return h('div', { class: 'p-info' }, h('span', { class: 'p-info-label' }, label), h('span', { class: 'p-info-value' }, value));
}

function openDetail(id) {
  const phone = getState().phones.find((p) => p.id === id);
  if (!phone) return;
  const pin = pinRow(phone.pin);

  const numberRow = phone.number
    ? h('div', { class: 'p-field-row' },
      h('span', { class: 'p-field-value' }, formatPhone(phone.number)),
      h('a', { class: 'btn btn-secondary p-copy', href: `tel:${phone.number}` }, icon('call'), 'Ara'),
      h('button', { type: 'button', class: 'btn btn-secondary p-copy', onclick: () => copy(phone.number, { label: 'Numara kopyalandı' }) }, icon('copy'), 'Kopyala'))
    : h('div', { class: 'p-field-row' }, h('span', { class: 'p-field-value is-empty' }, 'Numara yok'));

  openSheet({
    title: phone.name,
    onClose: pin.hide,
    body: h('div', { class: 'p-detail', dataset: { cat: 'phones' } },
      h('div', { class: 'p-detail-head' },
        art(phone, 84, 'phone-art p-detail-art'),
        h('div', { class: 'p-detail-title' },
          h('span', { class: 'p-detail-name' }, phone.name),
          h('span', { class: 'p-detail-model' }, phone.model)),
        h('button', { type: 'button', class: 'p-edit', 'aria-label': `${phone.name} düzenle`, onclick: () => openForm(phone) }, icon('edit'))),
      h('div', { class: 'p-field' }, h('span', { class: 'field-label' }, 'Numara'), numberRow),
      pin.el,
      h('div', { class: 'p-infos' },
        info('Model', phone.model),
        info(phone.cased ? 'Kılıf rengi' : 'Renk', phone.cased ? phone.color : `${phone.color} · kılıfsız`)),
      phone.note && h('div', { class: 'p-field' }, h('span', { class: 'field-label' }, 'Not'), h('p', { class: 'p-note' }, phone.note)),
      phone.extra.length > 0 && h('div', { class: 'p-field' },
        h('span', { class: 'field-label' }, 'Ek bilgiler'),
        h('div', { class: 'p-infos' }, phone.extra.map((x) => info(x.label || 'Bilgi', x.value || '—'))))),
  });
}

/* ---------- Form ---------- */

const PLAIN = { autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' };

/** Ek bilgiler: etiket + değer satırları, satır ekle/sil, önerilen etiket çipleri. */
function extraEditor(initial) {
  const list = h('div', { class: 'p-extra-list' });
  const addBtn = h('button', { type: 'button', class: 'btn btn-secondary p-extra-add' }, icon('plus'), 'Satır ekle');
  const chips = h('div', { class: 'suggest p-extra-chips', 'aria-label': 'Önerilen etiketler' });
  const rows = () => [...list.querySelectorAll('.p-extra-row')];

  function paint() {
    const used = new Set(rows().map((r) => r.querySelector('.p-extra-label').value.trim().toLocaleLowerCase('tr-TR')));
    const full = rows().length >= MAX_EXTRA;
    addBtn.disabled = full;
    chips.replaceChildren(...EXTRA_LABELS.filter((l) => !used.has(l.toLocaleLowerCase('tr-TR'))).map((l) => h('button', {
      type: 'button', class: 'suggest-chip', disabled: full,
      onclick: () => {
        const empty = rows().find((r) => !r.querySelector('.p-extra-label').value.trim());
        const target = empty ?? addRow({ label: '', value: '' });
        target.querySelector('.p-extra-label').value = l;
        paint();
        target.querySelector('.p-extra-value').focus();
      },
    }, l)));
    chips.hidden = !chips.childElementCount;
  }

  function addRow({ label, value }) {
    if (rows().length >= MAX_EXTRA) return null;
    const labelInput = h('input', { class: 'input p-extra-label', ...PLAIN, autocapitalize: 'sentences', maxlength: '40', placeholder: 'Etiket', 'aria-label': 'Etiket' });
    const valueInput = h('input', { class: 'input p-extra-value', ...PLAIN, autocapitalize: 'off', maxlength: '200', placeholder: 'Değer', 'aria-label': 'Değer' });
    labelInput.value = label;
    valueInput.value = value;
    labelInput.addEventListener('input', paint);
    const el = h('div', { class: 'p-extra-row' }, labelInput, valueInput,
      h('button', { type: 'button', class: 'p-mini', 'aria-label': 'Satırı sil', onclick: () => { el.remove(); paint(); } }, icon('close')));
    list.append(el);
    paint();
    return el;
  }

  addBtn.addEventListener('click', () => addRow({ label: '', value: '' })?.querySelector('.p-extra-label').focus());
  initial.forEach(addRow);
  paint();

  return {
    el: h('div', { class: 'p-extra' }, list, chips, addBtn),
    value: () => rows().map((r) => ({ label: r.querySelector('.p-extra-label').value, value: r.querySelector('.p-extra-value').value })),
  };
}

/** Kılıf rengi yuvarlakları (radyo grubu). */
function colorPicker(value, onChange) {
  let current = value;
  const name = h('span', { class: 'p-color-name' }, current);
  const grid = h('div', { class: 'p-colors', role: 'radiogroup', 'aria-label': 'Renk' });
  const paint = () => {
    grid.querySelectorAll('.p-swatch').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === current)));
    name.textContent = current;
  };
  for (const color of CASE_COLORS) {
    grid.append(h('button', {
      type: 'button', role: 'radio', class: `p-swatch${color === 'Şeffaf' ? ' is-clear' : ''}`, dataset: { value: color },
      'aria-label': color, style: `--dot: ${caseVar(color)}`,
      onclick: () => { current = color; paint(); onChange(current); },
    }));
  }
  paint();
  return { el: grid, name, get value() { return current; } };
}

function openForm(phone = null) {
  // Ayrıntıdan geliyorsa openSheet oradaki sheet'i kapatır; onClose PIN'i gizler.
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);

  const name = h('input', { class: 'input', id: 'p-name', ...PLAIN, autocapitalize: 'words', maxlength: '40', placeholder: 'Örn. faik1' });
  const number = h('input', { class: 'input', id: 'p-number', type: 'tel', inputmode: 'tel', ...PLAIN, maxlength: '20', placeholder: '0531 000 00 00' });
  const pin = h('input', { class: 'input p-secret', id: 'p-pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', ...PLAIN, autocapitalize: 'off', maxlength: '8' });
  const note = h('textarea', { class: 'input p-textarea', id: 'p-note', rows: '3', maxlength: '1000', placeholder: 'Ne için kullanılıyor, nerede duruyor…' });
  name.value = phone?.name ?? '';
  number.value = phone?.number ? formatPhone(phone.number) : '';
  pin.value = phone?.pin ?? '';
  note.value = phone?.note ?? '';

  // PIN alanının gözü: varsayılan gizli; arka plana geçince ve form kapanınca yeniden gizlenir.
  const eye = h('button', { type: 'button', class: 'p-eye', 'aria-label': 'PIN\'i göster', 'aria-pressed': 'false' }, icon('eye'));
  const hidePin = () => {
    revealed.delete(hidePin);
    pin.type = 'password';
    eye.setAttribute('aria-pressed', 'false');
    eye.setAttribute('aria-label', 'PIN\'i göster');
    eye.replaceChildren(icon('eye'));
  };
  eye.addEventListener('click', () => {
    if (pin.type === 'text') { hidePin(); return; }
    pin.type = 'text';
    eye.setAttribute('aria-pressed', 'true');
    eye.setAttribute('aria-label', 'PIN\'i gizle');
    eye.replaceChildren(icon('eyeOff'));
    revealed.add(hidePin);
  });

  // Numara: yazarken yalnızca hatayı sil; alandan çıkınca geçerliyse "0555 000 00 01" biçimine getir.
  number.addEventListener('blur', () => {
    const digits = phoneDigits(number.value);
    if (digits) number.value = formatPhone(digits);
  });

  let model = phone?.model ?? PHONE_MODELS[0];
  let color = phone?.color ?? 'Siyah';
  let cased = phone?.cased ?? true;

  const preview = h('div', { class: 'p-preview', 'aria-hidden': 'true' });
  const paintArt = () => {
    preview.replaceChildren(svg(phoneArt(model, color, cased, 64, 'phone-art')));
    models.el.querySelectorAll('.pick').forEach((b) => {
      b.querySelector('svg')?.replaceWith(svg(phoneArt(b.dataset.value, color, cased, 20, 'pick-svg pick-phone')));
    });
  };

  const models = pickGrid({
    label: 'Model', columns: 5, value: model,
    options: PHONE_MODELS.map((m) => ({ value: m, label: MODEL_SHORT[m], icon: svg(phoneArt(m, color, cased, 20, 'pick-svg pick-phone')) })),
    onChange: (m) => { model = m; modelName.textContent = m; paintArt(); },
  });
  const modelName = h('span', { class: 'p-pick-name' }, model);
  const colorLabel = h('span', { class: 'field-label' }, cased ? 'Kılıf rengi' : 'Renk');
  const caseGrid = pickGrid({
    label: 'Kılıf', columns: 2, value: cased,
    options: [{ value: true, label: 'Kılıflı' }, { value: false, label: 'Kılıfsız' }],
    onChange: (v) => { cased = v; colorLabel.textContent = v ? 'Kılıf rengi' : 'Renk'; paintArt(); },
  });
  const colors = colorPicker(color, (c) => { color = c; paintArt(); });
  const extra = extraEditor(phone?.extra ?? []);
  paintArt();

  // PIN alanı elle kurulur: göz butonu input'un yanında, label yalnızca input'a bağlı.
  errors.pin = h('span', { class: 'field-error', id: 'err-p-pin', role: 'alert' });
  pin.setAttribute('aria-describedby', 'err-p-pin');
  pin.addEventListener('input', () => { errors.pin.textContent = ''; });
  const pinField = h('div', { class: 'field' },
    h('label', { class: 'field-label', for: 'p-pin' }, 'SIM PIN'),
    h('span', { class: 'p-secret-wrap' }, pin, eye),
    h('span', { class: 'field-hint' }, '4–8 rakam. Listede ve bildirimlerde hiç görünmez.'),
    errors.pin);

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'phones' } },
    preview,
    field('name', 'Ad', name),
    field('number', 'Numara', number),
    pinField,
    h('div', { class: 'field' }, h('span', { class: 'field-label p-label-row' }, 'Model', modelName), models.el),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Kılıf'), caseGrid.el),
    h('div', { class: 'field' }, h('span', { class: 'p-label-row' }, colorLabel, colors.name), colors.el),
    field('note', 'Not', note),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ek bilgiler'), extra.el),
    h('p', { class: 'field-error', role: 'alert', id: 'p-form-error' }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, phone ? 'Kaydet' : 'Ekle')),
    phone && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sil'), () => {
      const before = snapshot();
      remove('phones', phone.id);
      closeSheet();
      toast(`${phone.name} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let ok = true;
    const digits = phoneDigits(number.value);
    const pinValue = simPin(pin.value);
    if (!name.value.trim()) { errors.name.textContent = 'Ad boş olamaz.'; ok = false; }
    if (digits === null) { errors.number.textContent = 'Numara 10–11 haneli olmalı (ör. 0531 000 00 00).'; ok = false; }
    if (pinValue === null) { errors.pin.textContent = 'PIN 4–8 rakam olmalı.'; ok = false; }
    if (!ok) { focusFirstError(form); return; }

    const data = { name: name.value.trim(), number: digits, pin: pinValue, model, color, cased, note: note.value, extra: extra.value() };
    try {
      if (phone) update('phones', phone.id, data);
      else add('phones', data);
    } catch (err) {
      form.querySelector('#p-form-error').textContent = err.message; // mesajlar değeri içermez
      return;
    }
    pin.value = '';
    closeSheet();
    toast(phone ? `${data.name} güncellendi` : `${data.name} eklendi`);
  });

  openSheet({ title: phone ? 'Telefonu düzenle' : 'Telefon ekle', body: form, onClose: () => { hidePin(); pin.value = ''; } });
}

/* ---------- Modül ---------- */

export default {
  id: 'phones',
  route: 'telefonlar',
  title: 'Telefonlar',
  addLabel: 'Telefon ekle',
  onAdd: () => openForm(),
  render(container) {
    root = h('div', { class: 'phones' });
    container.append(root);
    stop?.();
    stop = onChange(() => draw());
    queueMicrotask(draw);
  },
  /** Ekrandan çıkınca: aboneliği bırak, açık PIN'leri gizle. */
  leave() {
    stop?.();
    stop = null;
    hideAllPins();
    root = null;
  },
};
