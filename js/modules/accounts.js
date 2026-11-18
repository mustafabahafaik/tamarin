// Business > Telegram / Bybit / OKX (#business/telegram …): hatlarda açılmış hesaplar. Ekranı
// js/modules/business.js kurar; burada satır, ayrıntı ve form var. Hesapta şifre, 2FA anahtarı, yedek kod ya da
// kurtarma ifadesi YOK: onlar Kasa'ya (#kasa). Not / Ek bilgiler'e böyle bir şey yazılırsa form uyarır.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from '../ui.js';
import { getState, add, update, remove, snapshot, restore, PLATFORMS, ACCOUNT_STATUSES } from '../store.js';
import { sortPhones } from '../status.js';
import { phoneSilhouette } from '../phone-art.js';
import { field as formField, pickGrid, focusFirstError } from '../form.js';
import { icon, PLAIN, info, copyRow, badge, extraEditor, vaultGuard } from '../biz-ui.js';
import { art, numberText, openPhoneDetail } from './phones.js';

const EXTRA_LABELS = ['Kayıt tarihi', 'Referans kodu', 'Ülke'];
const STATUS_SLUG = { Aktif: 'active', Doğrulanmamış: 'unverified', 'KYC tamam': 'kyc', Kısıtlı: 'limited', Kapalı: 'closed' };
const isExchange = (platform) => platform !== 'Telegram';
export const userLabel = (platform) => (isExchange(platform) ? 'E-posta' : 'Kullanıcı adı');

/** Durum etiketi: KYC tamam yeşil, Kısıtlı turuncu, Kapalı soluk, Doğrulanmamış nötr. */
export function statusChip(status) {
  return h('span', { class: 'a-chip', dataset: { st: STATUS_SLUG[status] ?? 'active' } }, status);
}

const phoneOf = (account) => getState().phones.find((p) => p.id === account.phoneId) ?? null;

/* ---------- Liste ---------- */

/** Satırın solu: bağlı telefonun kendi model/kılıf renginde çizimi; telefon yoksa kesik çizgili boş siluet. */
const lineArt = (phone) => h('span', { class: 'a-row-art' }, phone ? art(phone, 44) : svg(phoneSilhouette(44)));

/**
 * Telegram satırı: YALNIZCA bağlı telefonun çizimi ve büyük, kalın etiket ("Eren"). Telefon adı, numara,
 * kullanıcı adı, durum ve rozet satırda yok; ayrıntıda durur.
 * Bybit / OKX satırı: çizim, etiket (kalın) + altında küçük e-posta, sağda durum etiketi.
 */
export function accountRow(account, phone) {
  const line = phone ? phone.name : 'hat yok';
  if (!isExchange(account.platform)) {
    return h('li', {},
      h('button', {
        type: 'button', class: `a-row a-row-tg${account.status === 'Kapalı' ? ' is-closed' : ''}`,
        onclick: () => openAccountDetail(account.id), 'aria-label': `${account.label}, ${line}`,
      }, lineArt(phone), h('span', { class: 'a-row-tg-name' }, account.label)));
  }
  return h('li', {},
    h('button', {
      type: 'button',
      class: `a-row${account.status === 'Kapalı' ? ' is-closed' : ''}`,
      onclick: () => openAccountDetail(account.id),
      'aria-label': `${account.label}, ${account.username || 'e-posta yok'}, ${account.status}, ${line}`,
    },
    lineArt(phone),
    h('span', { class: 'a-row-text' },
      h('span', { class: 'a-row-name' }, account.label),
      h('span', { class: `a-row-user${account.username ? '' : ' is-empty'}` }, account.username || 'E-posta yok')),
    h('span', { class: 'a-row-meta' }, statusChip(account.status))));
}

/* ---------- Ayrıntı ---------- */

export function openAccountDetail(id) {
  const account = getState().accounts.find((a) => a.id === id);
  if (!account) return;
  const phone = phoneOf(account);

  openSheet({
    title: account.label,
    body: h('div', { class: 'p-detail', dataset: { cat: 'business' } },
      h('div', { class: 'p-detail-head' },
        badge(account.platform, 'is-big'),
        h('div', { class: 'p-detail-title' },
          h('span', { class: 'p-detail-name' }, account.label),
          h('span', { class: 'p-detail-model' }, account.platform)),
        h('button', { type: 'button', class: 'p-edit', 'aria-label': `${account.label} düzenle`, onclick: () => openAccountForm(account) }, icon('edit'))),
      copyRow(userLabel(account.platform), account.username, isExchange(account.platform) ? 'E-posta kopyalandı' : 'Kullanıcı adı kopyalandı'),
      copyRow(isExchange(account.platform) ? 'UID' : 'Telegram ID', account.uid, 'UID kopyalandı'),
      h('div', { class: 'p-infos' },
        h('div', { class: 'p-info' }, h('span', { class: 'p-info-label' }, 'Durum'), statusChip(account.status)),
        info('2FA', account.twofa ? 'Açık' : 'Kapalı')),
      h('div', { class: 'p-field' },
        h('span', { class: 'field-label' }, 'Bağlı telefon'),
        phone
          ? h('button', { type: 'button', class: 'biz-mini', onclick: () => openPhoneDetail(phone.id) },
            h('span', { class: 'biz-mini-art' }, art(phone, 22)),
            h('span', { class: 'biz-mini-text' },
              h('span', { class: 'biz-mini-name' }, phone.name),
              h('span', { class: 'biz-mini-sub' }, numberText(phone))),
            icon('chevron', 'biz-mini-chev'))
          : h('p', { class: 'biz-none' }, 'Hat yok')),
      account.note && h('div', { class: 'p-field' }, h('span', { class: 'field-label' }, 'Not'), h('p', { class: 'p-note' }, account.note)),
      account.extra.length > 0 && h('div', { class: 'p-field' },
        h('span', { class: 'field-label' }, 'Ek bilgiler'),
        h('div', { class: 'p-infos' }, account.extra.map((x) => info(x.label || 'Bilgi', x.value || '—')))),
      h('a', { class: 'btn btn-secondary btn-block biz-vault', href: '#kasa' }, icon('lock'), 'Şifresi Kasa\'da')),
  });
}

/* ---------- Form ---------- */

/** Çizimli telefon seçici (radyo grubu): "Hat yok" + doğal sırada telefonlar. */
function phonePicker(value) {
  let current = value;
  const phones = sortPhones(getState().phones);
  const grid = h('div', { class: 'a-phones', role: 'radiogroup', 'aria-label': 'Telefon' });
  const paint = () => grid.querySelectorAll('.a-phone').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === current)));
  const option = (id, content, label) => h('button', {
    type: 'button', role: 'radio', class: 'a-phone', dataset: { value: id }, 'aria-label': label,
    onclick: () => { current = id; paint(); },
  }, ...content);
  grid.append(option('', [h('span', { class: 'a-phone-art' }, svg(phoneSilhouette(16))), h('span', { class: 'a-phone-text' }, h('span', { class: 'a-phone-name' }, 'Hat yok'))], 'Hat yok'));
  for (const p of phones) {
    grid.append(option(p.id, [
      h('span', { class: 'a-phone-art' }, art(p, 16)),
      h('span', { class: 'a-phone-text' }, h('span', { class: 'a-phone-name' }, p.name), h('span', { class: 'a-phone-num' }, numberText(p)))],
    `${p.name}, ${numberText(p)}`));
  }
  paint();
  return { el: grid, get value() { return current; } };
}

/** Hesap formu. account yoksa yeni; preset { platform, phoneId } ("Bu hatta hesap ekle", etkin sekme). */
export function openAccountForm(account = null, preset = {}) {
  const errors = {};
  const field = (key, label, control, hint) => formField(errors, key, label, control, hint);
  let platform = account?.platform ?? (PLATFORMS.includes(preset.platform) ? preset.platform : PLATFORMS[0]);
  let status = account?.status ?? 'Aktif';
  let twofa = account?.twofa ?? false;

  const label = h('input', { class: 'input', id: 'a-label', ...PLAIN, autocapitalize: 'words', maxlength: '40', placeholder: 'Örn. Eren' });
  const user = h('input', { class: 'input', id: 'a-user', ...PLAIN, autocapitalize: 'off', maxlength: '80' });
  const uid = h('input', { class: 'input', id: 'a-uid', ...PLAIN, autocapitalize: 'off', maxlength: '40', inputmode: 'numeric' });
  const note = h('textarea', { class: 'input p-textarea', id: 'a-note', rows: '3', maxlength: '1000', placeholder: 'Ne için kullanılıyor…' });
  label.value = account?.label ?? '';
  user.value = account?.username ?? '';
  uid.value = account?.uid ?? '';
  note.value = account?.note ?? '';

  const userTitle = h('span', { class: 'field-label' });
  const uidTitle = h('span', { class: 'field-label' });
  // Platforma göre ipuçları: Telegram @kullanıcıadı, borsalar e-posta.
  const paintPlatform = () => {
    userTitle.textContent = userLabel(platform);
    uidTitle.textContent = isExchange(platform) ? 'UID' : 'Telegram ID';
    user.placeholder = isExchange(platform) ? 'ornek@posta.com' : '@kullaniciadi';
    user.type = isExchange(platform) ? 'email' : 'text';
    user.inputMode = isExchange(platform) ? 'email' : 'text';
    form.dataset.pf = platform.toLowerCase();
  };

  const platforms = pickGrid({
    label: 'Platform', columns: 3, value: platform,
    options: PLATFORMS.map((p) => ({ value: p, label: p, icon: badge(p, 'is-small pick-badge') })),
    onChange: (p) => { platform = p; paintPlatform(); },
  });
  const phones = phonePicker(account?.phoneId ?? preset.phoneId ?? '');
  const statuses = h('div', { class: 'chips a-statuses', role: 'radiogroup', 'aria-label': 'Durum' });
  const paintStatus = () => statuses.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === status)));
  for (const s of ACCOUNT_STATUSES) {
    statuses.append(h('button', { type: 'button', class: 'chip', dataset: { value: s }, onclick: () => { status = s; paintStatus(); } }, s));
  }
  paintStatus();
  const twofaGrid = pickGrid({
    label: '2FA', columns: 2, value: twofa,
    options: [{ value: true, label: 'Açık' }, { value: false, label: 'Kapalı' }],
    onChange: (v) => { twofa = v; },
  });

  const submitLabel = account ? 'Kaydet' : 'Ekle';
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel);
  let guard = null;
  const extra = extraEditor(account?.extra ?? [], EXTRA_LABELS, () => guard?.update());
  guard = vaultGuard(() => [note.value, extra.value()], submit, submitLabel);
  note.addEventListener('input', guard.update);

  const userField = h('label', { class: 'field', for: 'a-user' }, userTitle, user);
  const uidField = h('label', { class: 'field', for: 'a-uid' }, uidTitle, uid);

  const form = h('form', { class: 'form', novalidate: true, dataset: { cat: 'business' } },
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Platform'), platforms.el),
    field('label', 'Etiket', label, 'Listede bu adla görünür.'),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Telefon (hat)'), phones.el),
    userField,
    uidField,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Durum'), statuses),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, '2FA'), twofaGrid.el,
      h('span', { class: 'field-hint' }, 'Yalnızca açık mı kapalı mı. 2FA anahtarı ve yedek kodlar Kasa\'ya.')),
    field('note', 'Not', note),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ek bilgiler'), extra.el),
    guard.el,
    h('p', { class: 'field-hint a-vault-hint' }, icon('lock', 'a-vault-icon'), 'Şifre, 2FA anahtarı, yedek kod ve kurtarma ifadesi burada tutulmaz; ', h('a', { href: '#kasa' }, 'Kasa'), '\'ya koy.'),
    h('p', { class: 'field-error', role: 'alert', id: 'a-form-error' }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      submit),
    account && confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Sil'), () => {
      const before = snapshot();
      remove('accounts', account.id);
      closeSheet();
      toast(`${account.label} silindi`, { action: 'Geri al', onAction: () => restore(before) });
    }));
  paintPlatform();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = label.value.trim();
    if (!name) { errors.label.textContent = 'Etiket boş olamaz.'; focusFirstError(form); return; }
    if (!guard.allow()) return; // "Bunu Kasa'ya koy": bir kez uyar, ikinci dokunuşta kaydet

    const data = { platform, label: name, phoneId: phones.value, username: user.value, uid: uid.value, status, twofa, note: note.value, extra: extra.value() };
    try {
      if (account) update('accounts', account.id, data);
      else add('accounts', data);
    } catch (err) {
      form.querySelector('#a-form-error').textContent = err.message;
      return;
    }
    closeSheet();
    toast(account ? `${name} güncellendi` : `${name} eklendi`);
  });

  guard.update();
  openSheet({ title: account ? 'Hesabı düzenle' : `${platform} hesabı ekle`, body: form });
}
