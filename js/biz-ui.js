// Business ekranının ortak parçaları (js/modules/business.js, phones.js, accounts.js): çizgi ikonlar,
// pano (gizli değer 30 sn sonra silinir), açık PIN'lerin gizlenmesi, bilgi satırı, Ek bilgiler düzenleyicisi,
// platform rozeti (resmi logo değil: yuvarlak rozette baş harf) ve "Bunu Kasa'ya koy" uyarısı.
// Bu dosyada console.* kullanılmaz (PIN konsola sızmasın).
import { h, svg, toast } from './ui.js';
import { MAX_EXTRA } from './store.js';
import { vaultWords } from './status.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a16 16 0 0 1-3.1 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  call: '<path d="M5 3.5h3.2l1.6 4.3-2.1 1.4a11 11 0 0 0 5.1 5.1l1.4-2.1 4.3 1.6V17a2.5 2.5 0 0 1-2.7 2.5C9.9 19 5 14.1 4.5 7.2A2.5 2.5 0 0 1 5 3.5z"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
};

export const icon = (name, cls = 'p-icon') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);

export const PLAIN = { autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' };
export const REVEAL_MS = 30000;

/* ---------- Açık PIN'ler ---------- */

// Açık (görünen) her PIN burada bir "gizle" fonksiyonuyla durur: ayrıntıdaki değer ve formdaki alan.
export const revealed = new Set();

export function hideAllPins() {
  for (const hide of [...revealed]) hide();
}

// Uygulama arka plana geçince (iPhone'da başka uygulamaya geçiş, ekran kilidi) PIN'ler gizlenir.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hideAllPins(); });
window.addEventListener('pagehide', hideAllPins);

/* ---------- Pano ---------- */

let clipboardTimer = 0;

/** Panoya yazar. secret: 30 sn sonra pano boşaltılır (başarısızsa sessizce geçilir). */
export async function copy(value, { secret = false, label = 'Kopyalandı' } = {}) {
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

/* ---------- Satırlar ---------- */

export function info(label, value) {
  return h('div', { class: 'p-info' }, h('span', { class: 'p-info-label' }, label), h('span', { class: 'p-info-value' }, value));
}

/** Değer + Kopyala satırı (kullanıcı adı, UID). Boşsa "—". */
export function copyRow(label, value, copiedLabel) {
  return h('div', { class: 'p-field' },
    h('span', { class: 'field-label' }, label),
    h('div', { class: 'p-field-row' },
      h('span', { class: `p-field-value${value ? '' : ' is-empty'}` }, value || '—'),
      value && h('button', { type: 'button', class: 'btn btn-secondary p-copy', onclick: () => copy(value, { label: copiedLabel }) }, icon('copy'), 'Kopyala')));
}

/* ---------- Platform rozeti ---------- */

export const PLATFORM_SLUG = { Telegram: 'telegram', Bybit: 'bybit', OKX: 'okx' };

/** Resmi logo yok: yuvarlak rozette baş harf (T / B / O), her platforma paletten ayrı mat ton. */
export function badge(platform, cls = '') {
  return h('span', { class: `pf-badge${cls ? ` ${cls}` : ''}`, dataset: { pf: PLATFORM_SLUG[platform] ?? 'telegram' }, 'aria-hidden': 'true' }, platform[0]);
}

/* ---------- Ek bilgiler ---------- */

/**
 * Ek bilgiler: etiket + değer satırları, satır ekle/sil, önerilen etiket çipleri.
 *   extraEditor(phone.extra, ['Operatör', 'IMEI'], onInput)
 */
export function extraEditor(initial, labels, onInput = () => {}) {
  const list = h('div', { class: 'p-extra-list' });
  const addBtn = h('button', { type: 'button', class: 'btn btn-secondary p-extra-add' }, icon('plus'), 'Satır ekle');
  const chips = h('div', { class: 'suggest p-extra-chips', 'aria-label': 'Önerilen etiketler' });
  const rows = () => [...list.querySelectorAll('.p-extra-row')];

  function paint() {
    const used = new Set(rows().map((r) => r.querySelector('.p-extra-label').value.trim().toLocaleLowerCase('tr-TR')));
    const full = rows().length >= MAX_EXTRA;
    addBtn.disabled = full;
    chips.replaceChildren(...labels.filter((l) => !used.has(l.toLocaleLowerCase('tr-TR'))).map((l) => h('button', {
      type: 'button', class: 'suggest-chip', disabled: full,
      onclick: () => {
        const empty = rows().find((r) => !r.querySelector('.p-extra-label').value.trim());
        const target = empty ?? addRow({ label: '', value: '' });
        target.querySelector('.p-extra-label').value = l;
        paint();
        onInput();
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
    labelInput.addEventListener('input', () => { paint(); onInput(); });
    valueInput.addEventListener('input', onInput);
    const el = h('div', { class: 'p-extra-row' }, labelInput, valueInput,
      h('button', { type: 'button', class: 'p-mini', 'aria-label': 'Satırı sil', onclick: () => { el.remove(); paint(); onInput(); } }, icon('close')));
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

/* ---------- "Bunu Kasa'ya koy" ---------- */

/**
 * Not / Ek bilgiler'e şifre, 2FA anahtarı, yedek kod, seed gibi bir şey yazılınca çıkan uyarı. Kayda engel
 * olmaz: ilk "Kaydet"te uyarı öne çıkar ve buton "Yine de kaydet" olur, ikinci dokunuş kaydeder.
 *   const guard = vaultGuard(() => [note.value, extra.value()], submitBtn, 'Kaydet')
 *   guard.update() (yazdıkça) · guard.allow() (submit'te: false ise kaydetme)
 */
export function vaultGuard(read, submit, submitLabel) {
  const text = h('span', {});
  const el = h('div', { class: 'biz-warn', role: 'status', hidden: true },
    icon('warn', 'biz-warn-icon'),
    h('span', { class: 'biz-warn-text' }, h('strong', {}, 'Bunu Kasa\'ya koy. '), text,
      ' ', h('a', { href: '#kasa', class: 'biz-warn-link' }, 'Kasa\'yı aç')));
  let found = [];
  let warned = false;

  function update() {
    const [note, extra] = read();
    const next = vaultWords(note, extra);
    if (next.join() !== found.join()) warned = false; // yeni bir şey yazıldıysa yeniden sor
    found = next;
    el.hidden = !found.length;
    el.classList.remove('is-loud');
    text.textContent = found.length ? `Not ya da Ek bilgilerde ${found.join(', ')} var gibi; burası şifrelenmez, Kasa şifreler.` : '';
    submit.textContent = found.length && warned ? 'Yine de kaydet' : submitLabel;
  }

  function allow() {
    update();
    if (!found.length || warned) return true;
    warned = true;
    el.classList.add('is-loud');
    submit.textContent = 'Yine de kaydet';
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return false;
  }

  return { el, update, allow };
}
