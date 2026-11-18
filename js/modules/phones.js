// Business > Telefonlar (#business/telefonlar): telefonlar, hatları ve SIM PIN'leri. Ekranı js/modules/business.js
// kurar; burada satır, ayrıntı ve form var. Çizim js/phone-art.js'te; numara/PIN kuralları store.js'te
// (phoneDigits, simPin), biçim, sıra ve arama js/status.js'te.
// PIN kuralları: listede, toast'ta, konsolda ve URL'de hiç yok; aramaya girmez. Ayrıntıda "••••"; göz ikonuyla
// görünür, 30 sn sonra, sheet kapanınca, ekrandan çıkınca ve uygulama arka plana geçince yeniden gizlenir.
// Kopyalanan PIN 30 sn sonra panodan silinir. Bu dosyada console.* kullanılmaz.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import {
  getState, add, update, remove, snapshot, restore, PHONE_MODELS, CASE_COLORS, PLATFORMS, phoneDigits, simPin,
} from '../store.js';
import { formatPhone, MODEL_SHORT, accountsOf } from '../status.js';
import { phoneArt, caseVar } from '../phone-art.js';
import { field as formField, pickGrid, focusFirstError } from '../form.js';
import { icon, PLAIN, REVEAL_MS, revealed, copy, info, badge, extraEditor, vaultGuard } from '../biz-ui.js';
import { openAccountDetail, openAccountForm } from './accounts.js';

export const art = (phone, size, cls = 'phone-art') => svg(phoneArt(phone.model, phone.color, phone.cased, size, cls));

const EXTRA_LABELS = ['Operatör', 'Tarife', 'IMEI', 'PUK', 'Alış tarihi', 'Garanti', 'Kimde'];
const PIN_DOTS = '••••'; // PIN uzunluğu da belli olmasın: hep dört nokta

export const numberText = (phone) => (phone.number ? formatPhone(phone.number) : 'Numara yok');
const colorLabel = (phone) => (phone.cased ? `${phone.color} kılıf` : phone.color);

/* ---------- Liste ---------- */

/** O hattaki hesapların küçük platform rozetleri: platform başına bir rozet, birden çoksa sayısıyla. */
function lineBadges(accounts) {
  const counts = PLATFORMS.map((p) => [p, accounts.filter((a) => a.platform === p).length]).filter(([, n]) => n);
  if (!counts.length) return null;
  return h('span', { class: 'p-row-badges' }, counts.map(([p, n]) => h('span', { class: 'p-row-badge' },
    badge(p, 'is-tiny'), n > 1 && h('span', { class: 'p-row-badge-n' }, `${n}`))));
}

export function phoneRow(phone, accounts) {
  const mine = accountsOf(accounts, phone.id);
  const summary = mine.length ? `, ${mine.length} hesap` : '';
  return h('li', {},
    h('button', {
      type: 'button',
      class: 'p-row',
      onclick: () => openPhoneDetail(phone.id),
      'aria-label': `${phone.name}, ${numberText(phone)}, ${phone.model}, ${colorLabel(phone)}${summary}`,
    },
    h('span', { class: 'p-row-art' }, art(phone, 44)),
    h('span', { class: 'p-row-text' },
      h('span', { class: 'p-row-name' }, phone.name),
      h('span', { class: `p-row-number${phone.number ? '' : ' is-empty'}` }, numberText(phone)),
      lineBadges(mine)),
    h('span', { class: 'p-row-meta' },
      h('span', { class: `p-dot${phone.color === 'Şeffaf' ? ' is-clear' : ''}`, style: `--dot: ${caseVar(phone.color)}` }),
      MODEL_SHORT[phone.model] ?? 'Diğer')));
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

/** "Bu hatta": bağlı hesaplar, yalnızca rozet + etiket ("T Eren", "B Duygu"; dokununca hesabın ayrıntısı) ve hesap ekleme. */
function onThisLine(phone) {
  const mine = accountsOf(getState().accounts, phone.id);
  return h('div', { class: 'p-field' },
    h('span', { class: 'field-label' }, 'Bu hatta'),
    mine.length
      ? h('ul', { class: 'biz-mini-list' }, mine.map((a) => h('li', {},
        h('button', { type: 'button', class: 'biz-mini biz-mini-acc', onclick: () => openAccountDetail(a.id), 'aria-label': `${a.platform}: ${a.label}` },
          badge(a.platform, 'is-small'),
          h('span', { class: 'biz-mini-name' }, a.label),
          icon('chevron', 'biz-mini-chev')))))
      : h('p', { class: 'biz-none' }, 'Bu hatta kayıtlı hesap yok.'),
    h('div', { class: 'biz-add-on' },
      h('span', { class: 'biz-add-on-label' }, 'Bu hatta hesap ekle'),
      h('div', { class: 'biz-add-on-row' }, PLATFORMS.map((p) => h('button', {
        type: 'button', class: 'btn btn-secondary biz-add-on-btn', onclick: () => openAccountForm(null, { platform: p, phoneId: phone.id }),
      }, badge(p, 'is-small'), p)))));
}

export function openPhoneDetail(id) {
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
    body: h('div', { class: 'p-detail', dataset: { cat: 'business' } },
      h('div', { class: 'p-detail-head' },
        art(phone, 84, 'phone-art p-detail-art'),
        h('div', { class: 'p-detail-title' },
          h('span', { class: 'p-detail-name' }, phone.name),
          h('span', { class: 'p-detail-model' }, phone.model)),
        h('button', { type: 'button', class: 'p-edit', 'aria-label': `${phone.name} düzenle`, onclick: () => openPhoneForm(phone) }, icon('edit'))),
      h('div', { class: 'p-field' }, h('span', { class: 'field-label' }, 'Numara'), numberRow),
      pin.el,
      h('div', { class: 'p-infos' },
        info('Model', phone.model),
        info(phone.cased ? 'Kılıf rengi' : 'Renk', phone.cased ? phone.color : `${phone.color} · kılıfsız`)),
      phone.note && h('div', { class: 'p-field' }, h('span', { class: 'field-label' }, 'Not'), h('p', { class: 'p-note' }, phone.note)),
      phone.extra.length > 0 && h('div', { class: 'p-field' },
        h('span', { class: 'field-label' }, 'Ek bilgiler'),
        h('div', { class: 'p-infos' }, phone.extra.map((x) => info(x.label || 'Bilgi', x.value || '—')))),
      onThisLine(phone)),
  });
}

/* ---------- Form ---------- */

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

export function openPhoneForm(phone = null) {
  // Ayrıntıdan geliyorsa openSheet oradaki sheet'i kapatır; onClose PIN'i gizler.
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);

  const name = h('input', { class: 'input', id: 'p-name', ...PLAIN, autocapitalize: 'words', maxlength: '40', placeholder: 'Örn. faik1' });
  const number = h('input', { class: 'input', id: 'p-number', type: 'tel', inputmode: 'tel', ...PLAIN, maxlength: '20', placeholder: '0555 000 00 00' });
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
  const colorTitle = h('span', { class: 'field-label' }, cased ? 'Kılıf rengi' : 'Renk');
  const caseGrid = pickGrid({
    label: 'Kılıf', columns: 2, value: cased,
    options: [{ value: true, label: 'Kılıflı' }, { value: false, label: 'Kılıfsız' }],
    onChange: (v) => { cased = v; colorTitle.textContent = v ? 'Kılıf rengi' : 'Renk'; paintArt(); },
  });
  const colors = colorPicker(color, (c) => { color = c; paintArt(); });
  const submitLabel = phone ? 'Kaydet' : 'Ekle';
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel);
  let guard = null;
  const extra = extraEditor(phone?.extra ?? [], EXTRA_LABELS, () => guard?.update());
  guard = vaultGuard(() => [note.value, extra.value()], submit, submitLabel);
  note.addEventListener('input', guard.update);
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

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'business' } },
    preview,
    field('name', 'Ad', name),
    field('number', 'Numara', number),
    pinField,
    h('div', { class: 'field' }, h('span', { class: 'field-label p-label-row' }, 'Model', modelName), models.el),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Kılıf'), caseGrid.el),
    h('div', { class: 'field' }, h('span', { class: 'p-label-row' }, colorTitle, colors.name), colors.el),
    field('note', 'Not', note),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ek bilgiler'), extra.el),
    guard.el,
    h('p', { class: 'field-error', role: 'alert', id: 'p-form-error' }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      submit),
    phone && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sil'), () => {
      const before = snapshot(); // bağlı hesapların phoneId'si de bu kopyada: Geri al ikisini birlikte getirir
      const linked = getState().accounts.filter((a) => a.phoneId === phone.id).length;
      remove('phones', phone.id);
      closeSheet();
      toast(linked ? `${phone.name} silindi, ${linked} hesabın hattı boşaldı` : `${phone.name} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let ok = true;
    const digits = phoneDigits(number.value);
    const pinValue = simPin(pin.value);
    if (!name.value.trim()) { errors.name.textContent = 'Ad boş olamaz.'; ok = false; }
    if (digits === null) { errors.number.textContent = 'Numara 10–11 haneli olmalı (ör. 0555 000 00 00).'; ok = false; }
    if (pinValue === null) { errors.pin.textContent = 'PIN 4–8 rakam olmalı.'; ok = false; }
    if (!ok) { focusFirstError(form); return; }
    if (!guard.allow()) return; // "Bunu Kasa'ya koy": bir kez uyar, ikinci dokunuşta kaydet

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

  guard.update();
  openSheet({ title: phone ? 'Telefonu düzenle' : 'Telefon ekle', body: form, onClose: () => { hidePin(); pin.value = ''; } });
}
