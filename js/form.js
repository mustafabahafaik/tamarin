// Modül formlarının ortak parçaları (Ödemeler, Eğitim): etiketli alan + alan altı hata, ikonlu seçim
// ızgarası, öneri çipleri. Renk, formun data-cat'inden (--cat) gelir: sheet body'ye eklendiği için
// modül ekranının rengini miras almaz.
import { h, svg, toast } from './ui.js';
import { exportToCalendar, calendarReason } from './ics.js';

/**
 * Etiketli alan. errors[key] alanın altındaki hata satırıdır; kullanıcı yazınca kendiliğinden silinir.
 *   field(errors, 'name', 'Ad', input, 'İsteğe bağlı ipucu')
 */
export function field(errors, key, label, control, hint) {
  const errorId = `err-${control.id || key}`;
  errors[key] = h('span', { class: 'field-error', id: errorId, role: 'alert' });
  control.setAttribute('aria-describedby', errorId);
  control.addEventListener('input', () => { errors[key].textContent = ''; });
  return h('label', { class: 'field', for: control.id },
    h('span', { class: 'field-label' }, label),
    control,
    hint && h('span', { class: 'field-hint' }, hint),
    errors[key]);
}

/** Hatalardan ilkinin alanına odaklanır; hata yoksa false. */
export function focusFirstError(form) {
  const first = form.querySelector('.field-error:not(:empty)');
  first?.closest('.field')?.querySelector('input, textarea, select, button')?.focus();
  return !!first;
}

/**
 * Radyo grubu gibi seçim ızgarası.
 *   pickGrid({ label: 'Tür', options: [{ value, label, icon }], value, columns: 5, onChange })
 * Dönen: { el, value } (value her zaman güncel seçim)
 */
export function pickGrid({ label, options, value, columns = 5, onChange }) {
  let current = value;
  const grid = h('div', { class: 'pick-grid', role: 'radiogroup', 'aria-label': label, style: `--cols:${columns}` });
  const paint = () => grid.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === String(current))));
  for (const opt of options) {
    grid.append(h('button', {
      type: 'button', class: 'pick', role: 'radio', dataset: { value: String(opt.value) },
      onclick: () => { current = opt.value; paint(); onChange?.(current); },
    }, opt.icon, h('span', {}, opt.label)));
  }
  paint();
  return { el: grid, get value() { return current; } };
}

/**
 * Öneri çipleri: alana yazdıkça (ya da odaklanınca) eşleşen önceki değerler çıkar, dokununca alanı doldurur.
 *   suggestions(input, () => ['Fizik II', 'Lineer Cebir'])
 */
export function suggestions(input, getOptions, max = 6) {
  const box = h('div', { class: 'suggest', hidden: true, 'aria-label': 'Öneriler' });
  const lower = (s) => s.toLocaleLowerCase('tr-TR');
  const render = () => {
    const q = lower(input.value.trim());
    const options = [...new Set(getOptions().filter(Boolean))]
      .filter((o) => lower(o) !== q && (!q || lower(o).includes(q)))
      .slice(0, max);
    box.replaceChildren(...options.map((o) => h('button', {
      type: 'button', class: 'suggest-chip',
      onclick: () => {
        input.value = o;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        box.hidden = true;
      },
    }, o)));
    box.hidden = !options.length;
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  return box;
}

/* ---------- Takvime ekle (js/ics.js) ---------- */

const CAL_ICON = '<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';

/** Kaydedilmiş bir kaydı (store'daki son haliyle) tek başına takvime aktarır; sonucu kısaca söyler. */
export async function sendToCalendar(type, id) {
  const result = await exportToCalendar({ mode: 'one', type, id });
  if (result.method === 'share') toast('Takvime gönderildi');
  else if (result.method === 'download') toast('.ics dosyası indirildi; açınca Takvim\'e eklenir');
  else if (!result.ok && result.method !== 'cancel' && result.method !== 'data-url') toast(result.message);
}

/** Formdaki "Takvime ekle" butonu; aktarılamayan kayıtta (ör. tarihsiz iş) kapalı ve nedeni altında. */
export function calendarButton(type, rec) {
  const reason = calendarReason(type, rec);
  const button = h('button', {
    type: 'button', class: 'btn btn-secondary btn-block btn-calendar', disabled: !!reason,
    onclick: () => sendToCalendar(type, rec.id),
  }, svg(CAL_ICON), 'Takvime ekle');
  return reason ? h('div', { class: 'calendar-off' }, button, h('p', { class: 'field-hint' }, reason)) : button;
}

/** Yeni kayıt toast'ındaki "Takvime ekle" aksiyonu (aktarılamıyorsa null). */
export function calendarAction(type, rec) {
  return calendarReason(type, rec) ? null : { label: 'Takvime ekle', onAction: () => sendToCalendar(type, rec.id) };
}
