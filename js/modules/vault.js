// Kasa ekranı (#kasa): uygulama şifreleri. Kriptografi js/vault.js'te.
// Durumlar: kurulum ("Kasa oluştur") → kilit ekranı → açık liste.
// Kilitlenince (arka plan, ekrandan çıkış, 2 dk işlem yok) açık sheet kapanır ve ekran yeniden
// çizilir: çözülmüş bilgi DOM'da kalmaz. Şifreler listede hiç görünmez.
import { h, svg, openSheet, closeSheet, toast, confirmTap, saveFile } from '../ui.js';
import * as V from '../vault.js';
import { playCall } from '../sound.js';
import { ymd, formatShort } from '../dates.js';

/* ---------- İkonlar ---------- */

const PATHS = {
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a16 16 0 0 1-3.1 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1.1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1.1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
};

const icon = (name, cls = 'v-icon') => svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);

/* ---------- Ortak parçalar ---------- */

const SECRET_ATTRS = { autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' };

/** Şifre alanı + göster/gizle düğmesi. */
function secretField(id, label, { value = '' } = {}) {
  const input = h('input', { class: 'input v-secret', type: 'password', id, ...SECRET_ATTRS });
  input.value = value;
  const eye = h('button', { type: 'button', class: 'v-eye', 'aria-label': 'Şifreyi göster', 'aria-pressed': 'false' }, icon('eye'));
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
    eye.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  });
  const field = h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), h('span', { class: 'v-secret-wrap' }, input, eye));
  return { field, input };
}

const STRENGTH = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];

/** Basit güç göstergesi (4 çubuk). */
function strengthMeter() {
  const bars = h('span', { class: 'v-meter-bars' }, [0, 1, 2, 3].map(() => h('span', {})));
  const label = h('span', { class: 'v-meter-label' });
  const el = h('div', { class: 'v-meter', 'aria-live': 'polite' }, bars, label);
  const set = (password) => {
    const score = V.strength(password);
    el.dataset.score = password ? String(score) : '';
    label.textContent = password ? STRENGTH[score] : '';
  };
  set('');
  return { el, set };
}

const CAT_KEYS = { 'Sosyal medya': 'social', Okul: 'school', Banka: 'bank', Oyun: 'game', 'E-posta': 'mail', Diğer: 'other' };
const badge = (entry) => h('span', { class: 'v-badge', dataset: { vcat: CAT_KEYS[entry.cat] }, 'aria-hidden': 'true' }, entry.app.charAt(0).toLocaleUpperCase('tr-TR'));

/* ---------- Pano ---------- */

let clipboardTimer = 0;

async function copyText(value, { secret = false, label = 'Kopyalandı' } = {}) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    toast('Kopyalanamadı');
    return;
  }
  if (!secret) { toast(label); return; }
  toast('Kopyalandı, 30 sn sonra silinecek');
  clearTimeout(clipboardTimer);
  clipboardTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
}

/* ---------- Görünümler ---------- */

function setupView() {
  const first = secretField('v-new', 'Ana şifre');
  const second = secretField('v-new2', 'Ana şifre (tekrar)');
  const meter = strengthMeter();
  const error = h('p', { class: 'v-error', role: 'alert' });
  const agree = h('input', { type: 'checkbox', id: 'v-agree' });
  const create = h('button', { type: 'submit', class: 'btn btn-primary btn-block', disabled: true }, 'Kasa oluştur');

  const check = () => {
    const a = first.input.value;
    const b = second.input.value;
    meter.set(a);
    let problem = '';
    if (a && a.length < 8) problem = 'En az 8 karakter olmalı.';
    else if (b && a !== b) problem = 'Şifreler aynı değil.';
    error.textContent = problem;
    const ok = a.length >= 8 && a === b && agree.checked;
    create.disabled = !ok;
    return ok;
  };
  [first.input, second.input].forEach((el) => el.addEventListener('input', check));
  agree.addEventListener('change', check);

  const form = h('form', { class: 'form v-card' },
    h('h2', { class: 'v-title' }, 'Kasa oluştur'),
    h('p', { class: 'hint' }, 'Uygulama şifrelerin bu cihazda, yalnızca senin bildiğin bir ana şifreyle şifrelenerek saklanır.'),
    first.field, meter.el, second.field, error,
    h('p', { class: 'v-warning' }, 'Ana şifreni unutursan kasadaki şifreler kurtarılamaz. Bir yere yazıp güvenli sakla.'),
    h('label', { class: 'v-check', for: 'v-agree' }, agree, h('span', {}, 'Anladım')),
    create);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!check()) return;
    create.disabled = true;
    create.textContent = 'Oluşturuluyor…';
    try {
      await V.createVault(first.input.value);
      first.input.value = '';
      second.input.value = '';
      playCall('unlock');
      toast('Kasa oluşturuldu');
    } catch (err) {
      error.textContent = err.message;
      create.textContent = 'Kasa oluştur';
      check();
    }
  });
  return form;
}

function lockView() {
  const pass = secretField('v-pass', 'Ana şifre');
  const message = h('p', { class: 'v-error', role: 'alert' });
  const open = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Kilidi aç');
  const form = h('form', { class: 'form v-lock' },
    h('div', { class: 'v-tamarin', 'aria-hidden': 'true' }, h('img', { src: 'assets/tamarin-768.webp', alt: '', draggable: 'false' })),
    h('h2', { class: 'v-title' }, 'Kasa kilitli'),
    h('p', { class: 'hint' }, 'Ana şifrenle aç.'),
    pass.field, message, open);

  let countdown = 0;
  const waitTick = () => {
    const left = V.lockoutLeft();
    if (!form.isConnected || left <= 0) {
      clearInterval(countdown);
      countdown = 0;
      open.disabled = false;
      if (form.isConnected && message.dataset.kind === 'wait') { message.textContent = ''; message.dataset.kind = ''; }
      return;
    }
    open.disabled = true;
    message.dataset.kind = 'wait';
    message.textContent = `Çok fazla yanlış deneme. ${Math.ceil(left / 1000)} sn bekle.`;
  };
  const startWait = () => { waitTick(); if (!countdown) countdown = setInterval(waitTick, 1000); };
  if (V.lockoutLeft() > 0) startWait();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (open.disabled || !pass.input.value) return;
    open.disabled = true;
    open.textContent = 'Açılıyor…';
    const attempt = pass.input.value;
    pass.input.value = '';
    try {
      await V.unlock(attempt);
      playCall('unlock'); // görünüm "unlock" olayıyla listeye geçer
    } catch (err) {
      open.textContent = 'Kilidi aç';
      open.disabled = false;
      if (err instanceof V.LockedOut) { startWait(); return; }
      if (!(err instanceof V.WrongPassword)) { message.textContent = 'Kasa açılamadı.'; return; }
      playCall('denied');
      form.classList.remove('is-shaking');
      void form.offsetWidth;
      form.classList.add('is-shaking');
      if (V.lockoutLeft() > 0) startWait();
      else {
        const left = V.triesLeft();
        message.dataset.kind = 'wrong';
        message.textContent = left <= 2 ? `Şifre yanlış · ${left} deneme sonra bekleme var` : 'Şifre yanlış';
      }
      pass.input.focus();
    }
  });
  return form;
}

let query = '';
let filter = 'all';

function listView() {
  const search = h('input', { class: 'input v-search', type: 'search', placeholder: 'Uygulama ara', 'aria-label': 'Uygulama ara', ...SECRET_ATTRS });
  search.value = query;
  const lockBtn = h('button', { type: 'button', class: 'v-tool', 'aria-label': 'Kasayı kilitle', onclick: () => V.lock() }, icon('lock'));
  const gearBtn = h('button', { type: 'button', class: 'v-tool', 'aria-label': 'Kasa ayarları', onclick: openVaultSettings }, icon('gear'));
  const chips = h('div', { class: 'chips v-chips', role: 'group', 'aria-label': 'Kategori' });
  const listEl = h('ul', { class: 'v-list' });

  const paintChips = () => chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.key === filter)));
  for (const [key, label] of [['all', 'Tümü'], ...V.CATS.map((c) => [c, c])]) {
    chips.append(h('button', { type: 'button', class: 'chip', dataset: { key }, onclick: () => { filter = key; paintChips(); renderList(); } }, label));
  }
  paintChips();

  function renderList() {
    const all = V.entries();
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const shown = all.filter((e) => (filter === 'all' || e.cat === filter) && (!q || e.app.toLocaleLowerCase('tr-TR').includes(q)));
    if (!all.length) {
      listEl.replaceChildren(h('li', { class: 'v-empty' }, 'Henüz kayıt yok. Sağ alttaki + ile ilk şifreni ekle.'));
      return;
    }
    if (!shown.length) {
      listEl.replaceChildren(h('li', { class: 'v-empty' }, 'Eşleşen kayıt yok.'));
      return;
    }
    // Satırda şifre yok: yalnızca rozet, uygulama adı, kullanıcı adı.
    listEl.replaceChildren(...shown.map((entry) => h('li', {},
      h('button', { type: 'button', class: 'v-row', onclick: () => openDetail(entry.id) },
        badge(entry),
        h('span', { class: 'v-row-text' },
          h('span', { class: 'v-row-app' }, entry.app),
          h('span', { class: 'v-row-user' }, entry.username || '—'))))));
  }

  search.addEventListener('input', () => { query = search.value; renderList(); });
  renderList();

  return h('div', { class: 'v-open' },
    h('div', { class: 'v-toolbar' }, h('span', { class: 'v-search-wrap' }, icon('search', 'v-search-icon'), search), lockBtn, gearBtn),
    chips,
    listEl,
    h('p', { class: 'hint v-auto' }, '2 dakika işlem yapılmazsa, uygulamadan çıkınca ya da başka ekrana geçince kasa kendiliğinden kilitlenir.'),
    h('button', { type: 'button', class: 'fab', 'aria-label': 'Şifre ekle', onclick: () => openEdit() }, icon('plus', 'icon')));
}

/* ---------- Sheet'ler ---------- */

function openDetail(id) {
  const entry = V.entries().find((e) => e.id === id);
  if (!entry) return;
  const dots = '••••••••••';
  const value = h('span', { class: 'v-pass-value' }, dots);
  const eye = h('button', { type: 'button', class: 'v-mini', 'aria-label': 'Şifreyi göster', 'aria-pressed': 'false' }, icon('eye'));
  eye.addEventListener('click', () => {
    const show = value.textContent === dots;
    value.textContent = show ? entry.password || '—' : dots;
    value.classList.toggle('is-shown', show);
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
    eye.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  });
  const copyUser = h('button', { type: 'button', class: 'btn btn-secondary v-copy', disabled: !entry.username }, icon('copy'), 'Kopyala');
  copyUser.addEventListener('click', () => copyText(entry.username, { label: 'Kullanıcı adı kopyalandı' }));
  const copyPass = h('button', { type: 'button', class: 'btn btn-secondary v-copy', disabled: !entry.password }, icon('copy'), 'Kopyala');
  copyPass.addEventListener('click', () => copyText(entry.password, { secret: true }));

  const safeUrl = /^https?:\/\//i.test(entry.url) ? entry.url : '';
  const remove = confirmTap(h('button', { type: 'button', class: 'btn btn-danger' }, 'Sil'), async () => {
    await V.deleteEntry(entry.id);
    closeSheet();
    toast(`${entry.app} silindi`);
  });

  openSheet({
    title: entry.app,
    body: h('div', { class: 'v-detail' },
      h('div', { class: 'v-detail-head' }, badge(entry), h('span', { class: 'v-detail-cat' }, entry.cat)),
      h('div', { class: 'v-field' },
        h('span', { class: 'field-label' }, 'Kullanıcı adı'),
        h('div', { class: 'v-field-row' }, h('span', { class: 'v-field-value' }, entry.username || '—'), copyUser)),
      h('div', { class: 'v-field' },
        h('span', { class: 'field-label' }, 'Şifre'),
        h('div', { class: 'v-field-row' }, value, eye, copyPass)),
      safeUrl && h('div', { class: 'v-field' }, h('span', { class: 'field-label' }, 'Adres'),
        h('a', { class: 'v-link', href: safeUrl, target: '_blank', rel: 'noopener noreferrer' }, safeUrl)),
      entry.note && h('div', { class: 'v-field' }, h('span', { class: 'field-label' }, 'Not'), h('p', { class: 'v-note' }, entry.note)),
      h('p', { class: 'hint' }, `Son güncelleme: ${formatShort(ymd(new Date(entry.updated)))}`),
      h('div', { class: 'actions' }, remove, h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => openEdit(entry) }, 'Düzenle'))),
  });
}

function openEdit(entry = null) {
  const app = h('input', { class: 'input', id: 'v-app', ...SECRET_ATTRS, autocapitalize: 'words', maxlength: '80' });
  const user = h('input', { class: 'input', id: 'v-user', ...SECRET_ATTRS, maxlength: '160' });
  const pass = secretField('v-pw', 'Şifre', { value: entry?.password ?? '' });
  const url = h('input', { class: 'input', id: 'v-url', type: 'url', inputmode: 'url', ...SECRET_ATTRS, placeholder: 'https://', maxlength: '300' });
  const cat = h('select', { class: 'input', id: 'v-cat' }, V.CATS.map((c) => h('option', { value: c }, c)));
  const note = h('textarea', { class: 'input v-textarea', id: 'v-note', rows: '3', ...SECRET_ATTRS, maxlength: '1000' });
  app.value = entry?.app ?? '';
  user.value = entry?.username ?? '';
  url.value = entry?.url ?? '';
  cat.value = entry?.cat ?? 'Diğer';
  note.value = entry?.note ?? '';
  const error = h('p', { class: 'v-error', role: 'alert' });

  /* Güçlü şifre üretici */
  const length = h('input', { type: 'range', class: 'range', min: '12', max: '32', step: '1', 'aria-label': 'Uzunluk' });
  length.value = '20';
  const lengthLabel = h('span', { class: 'v-gen-len' }, '20 karakter');
  const opts = Object.fromEntries([['upper', 'Büyük harf'], ['lower', 'Küçük harf'], ['digits', 'Rakam'], ['symbols', 'Sembol']].map(([key, label]) => {
    const box = h('input', { type: 'checkbox', checked: true, id: `v-gen-${key}` });
    return [key, { box, el: h('label', { class: 'v-check', for: `v-gen-${key}` }, box, h('span', {}, label)) }];
  }));
  const paintLength = () => {
    lengthLabel.textContent = `${length.value} karakter`;
    length.style.setProperty('--fill', `${((length.value - 12) / 20) * 100}%`);
  };
  paintLength();
  const generate = () => {
    try {
      pass.input.value = V.generatePassword({ length: Number(length.value), ...Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, o.box.checked])) });
      if (pass.input.type === 'password') pass.field.querySelector('.v-eye').click(); // üretileni göster
      error.textContent = '';
    } catch (err) {
      error.textContent = err.message;
    }
  };
  length.addEventListener('input', () => { paintLength(); generate(); });
  Object.values(opts).forEach((o) => o.box.addEventListener('change', generate));
  const gen = h('div', { class: 'v-gen', hidden: true },
    h('div', { class: 'v-gen-head' }, h('span', { class: 'field-label' }, 'Uzunluk'), lengthLabel),
    length,
    h('div', { class: 'v-gen-opts' }, Object.values(opts).map((o) => o.el)),
    h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: generate }, 'Yeniden üret'));
  const genBtn = h('button', { type: 'button', class: 'btn btn-secondary v-gen-btn' }, icon('dice'), 'Güçlü şifre üret');
  genBtn.addEventListener('click', () => { gen.hidden = false; genBtn.hidden = true; generate(); });

  const form = h('form', { class: 'form' },
    h('label', { class: 'field', for: 'v-app' }, h('span', { class: 'field-label' }, 'Uygulama / site'), app),
    h('label', { class: 'field', for: 'v-user' }, h('span', { class: 'field-label' }, 'Kullanıcı adı'), user),
    pass.field, genBtn, gen,
    h('label', { class: 'field', for: 'v-url' }, h('span', { class: 'field-label' }, 'Adres (isteğe bağlı)'), url),
    h('label', { class: 'field', for: 'v-cat' }, h('span', { class: 'field-label' }, 'Kategori'), cat),
    h('label', { class: 'field', for: 'v-note' }, h('span', { class: 'field-label' }, 'Not'), note),
    error,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => closeSheet() }, 'Vazgeç'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Kaydet')));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!app.value.trim()) { error.textContent = 'Uygulama adı boş olamaz.'; app.focus(); return; }
    try {
      await V.saveEntry({ id: entry?.id, app: app.value, username: user.value, password: pass.input.value, url: url.value, cat: cat.value, note: note.value });
      closeSheet();
      toast(entry ? 'Güncellendi' : 'Kaydedildi');
    } catch (err) {
      error.textContent = err.message;
    }
  });
  openSheet({ title: entry ? 'Şifreyi düzenle' : 'Şifre ekle', body: form });
}

function openVaultSettings() {
  /* Ana şifreyi değiştir */
  const oldPw = secretField('v-old', 'Şu anki ana şifre');
  const newPw = secretField('v-new-a', 'Yeni ana şifre');
  const newPw2 = secretField('v-new-b', 'Yeni ana şifre (tekrar)');
  const meter = strengthMeter();
  const changeError = h('p', { class: 'v-error', role: 'alert' });
  const changeBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Ana şifreyi değiştir');
  newPw.input.addEventListener('input', () => meter.set(newPw.input.value));
  const changeForm = h('form', { class: 'form' }, oldPw.field, newPw.field, meter.el, newPw2.field, changeError, changeBtn);
  changeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (newPw.input.value.length < 8) { changeError.textContent = 'Yeni şifre en az 8 karakter olmalı.'; return; }
    if (newPw.input.value !== newPw2.input.value) { changeError.textContent = 'Yeni şifreler aynı değil.'; return; }
    changeBtn.disabled = true;
    changeBtn.textContent = 'Yeniden şifreleniyor…';
    try {
      await V.changePassword(oldPw.input.value, newPw.input.value);
      [oldPw, newPw, newPw2].forEach((f) => { f.input.value = ''; });
      meter.set('');
      changeError.textContent = '';
      toast('Ana şifre değişti');
    } catch (err) {
      changeError.textContent = err instanceof V.WrongPassword ? 'Şu anki ana şifre yanlış.' : err.message;
      if (err instanceof V.WrongPassword) playCall('denied');
    } finally {
      changeBtn.disabled = false;
      changeBtn.textContent = 'Ana şifreyi değiştir';
    }
  });

  /* Şifreli yedek */
  const download = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Şifreli yedek indir');
  download.addEventListener('click', async () => {
    const file = new File([JSON.stringify(V.exportEncrypted(), null, 2)], `tamarin-kasa-${ymd()}.json`, { type: 'application/json' });
    const result = await saveFile(file, { title: 'Tamarin kasa yedeği' });
    if (result !== 'cancelled') toast('Şifreli yedek hazır');
  });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', tabindex: '-1' });
  const upload = h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => fileInput.click() }, 'Şifreli yedek yükle');
  const importPanel = h('div', { class: 'set-panel', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let json = null;
    try { json = file.size < 4 * 1024 * 1024 ? JSON.parse(await file.text()) : null; } catch { json = null; }
    if (!json || json.app !== 'tamarin-vault' || !V.isBlob(json)) {
      importPanel.replaceChildren(h('p', { class: 'set-panel-title is-error' }, 'Bu dosya bir Tamarin kasa yedeği değil.'));
      importPanel.hidden = false;
      return;
    }
    const pw = secretField('v-import', 'Yedeğin ana şifresi');
    const importError = h('p', { class: 'v-error', role: 'alert' });
    const load = confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Yükle (mevcut kasanın yerine geçer)'), async () => {
      try {
        await V.importEncrypted(json, pw.input.value);
        pw.input.value = '';
        closeSheet();
        toast('Şifreli yedek yüklendi');
      } catch (err) {
        importError.textContent = err instanceof V.WrongPassword ? 'Yedeğin ana şifresi yanlış; mevcut kasaya dokunulmadı.' : err.message;
      }
    });
    importPanel.replaceChildren(h('p', { class: 'set-panel-title' }, file.name), pw.field, importError, load);
    importPanel.hidden = false;
  });

  /* Kasayı sıfırla */
  const confirmText = h('input', { class: 'input', placeholder: 'SIFIRLA', 'aria-label': 'Onay için SIFIRLA yaz', ...SECRET_ATTRS, autocapitalize: 'characters' });
  const resetBtn = h('button', { type: 'button', class: 'btn btn-danger btn-block', disabled: true }, 'Kasayı sıfırla');
  confirmText.addEventListener('input', () => { resetBtn.disabled = confirmText.value.trim() !== 'SIFIRLA'; });
  resetBtn.addEventListener('click', () => {
    if (confirmText.value.trim() !== 'SIFIRLA') return;
    V.resetVault();
    closeSheet();
    toast('Kasa sıfırlandı');
  });

  openSheet({
    title: 'Kasa ayarları',
    body: h('div', { class: 'settings' },
      h('section', { class: 'set-group' }, h('h3', { class: 'set-title' }, 'Ana şifre'), h('div', { class: 'set-card v-pad' }, changeForm)),
      h('section', { class: 'set-group' }, h('h3', { class: 'set-title' }, 'Şifreli yedek'),
        h('div', { class: 'set-card v-pad' },
          h('p', { class: 'hint v-hint' }, 'Kasa olduğu gibi, şifreli indirilir; yalnızca aynı ana şifreyle açılır. Ana uygulama yedeğine kasa girmez.'),
          h('div', { class: 'actions' }, download, upload), importPanel, fileInput)),
      h('section', { class: 'set-group' }, h('h3', { class: 'set-title' }, 'Kasayı sıfırla'),
        h('div', { class: 'set-card v-pad' },
          h('p', { class: 'hint v-hint' }, 'Kasadaki tüm şifreler kalıcı olarak silinir. Onaylamak için SIFIRLA yaz.'),
          confirmText, resetBtn))),
  });
}

/* ---------- Ekran ---------- */

let root = null;

function draw() {
  if (!root?.isConnected) return;
  const view = !V.hasVault() ? setupView() : V.isUnlocked() ? listView() : lockView();
  root.replaceChildren(view);
  root.querySelector('#v-new, #v-pass')?.focus({ preventScroll: true });
}

// Kasa olayları: kilitlenince açık sheet (çözülmüş bilgiyle) kapanır, ekran kilit görünümüne döner.
V.vaultEvents.addEventListener('lock', () => { if (root?.isConnected) { closeSheet(); draw(); } });
V.vaultEvents.addEventListener('unlock', () => draw());
V.vaultEvents.addEventListener('change', () => {
  const list = root?.querySelector('.v-list');
  if (list && V.isUnlocked()) draw();
});

// Kasa açıkken her dokunuş/tuş 2 dakikalık otomatik kilit sayacını baştan başlatır.
['pointerdown', 'keydown', 'input'].forEach((type) => document.addEventListener(type, () => V.touch(), { capture: true, passive: true }));

export default {
  id: 'vault',
  route: 'kasa',
  title: 'Kasa',
  fab: false, // "+" yalnızca kasa açıkken, görünüm kendisi gösterir
  render(container) {
    query = '';
    filter = 'all';
    root = h('div', { class: 'vault' });
    container.append(root);
    queueMicrotask(draw);
  },
  /** Kasa ekranından çıkınca: hemen kilitle. */
  leave() {
    V.lock();
    root = null;
  },
};
