// Ayarlar ekranı: sol üstteki kullanıcıya dokununca alttan açılır.
// İsim, dönem sonu, ses, takvime aktarma, yedek al/yükle, örnekleri sil, tüm verileri sil.
// Silme işlemleri iki dokunuşla onaylanır (confirmTap) ve toast'tan geri alınabilir.
import { h, openSheet, toast, confirmTap, saveFile } from './ui.js';
import {
  TYPES, getState, setField, onChange, exportData, validateBackup, importBackup,
  countExamples, removeExamples, resetAll, snapshot, restore,
} from './store.js';
import { ymd, AYLAR } from './dates.js';
import { exportToCalendar, pendingCount, METHOD_LABELS } from './ics.js';
import { playCall } from './sound.js';
import { searchCities, PREVIEWS, getPreview, setPreview } from './weather.js';

const LABELS = { bills: 'fatura', classes: 'ders', exams: 'sınav', days: 'özel gün', tasks: 'görev', phones: 'telefon' };
const MAX_BACKUP = 2 * 1024 * 1024;

/** "4 fatura · 4 ders · 2 sınav" */
export function countText(counts) {
  return TYPES.filter((t) => counts[t]).map((t) => `${counts[t]} ${LABELS[t]}`).join(' · ') || 'Kayıt yok';
}

async function exportBackup() {
  const file = new File([JSON.stringify(exportData(), null, 2)], `tamarin-yedek-${ymd()}.json`, { type: 'application/json' });
  const result = await saveFile(file, { title: 'Tamarin yedeği' });
  if (result !== 'cancelled') toast(result === 'shared' ? 'Yedek paylaşıldı' : 'Yedek indirildi');
}

/** "Son aktarma: Bugün 14:20 · Paylaş menüsüyle açıldı · 12 kayıt" (+ varsa hata notu) */
export function lastExportText(last, now = new Date()) {
  if (!last) return 'Son aktarma: henüz yok';
  const d = new Date(last.at);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const when = ymd(d) === ymd(now) ? `Bugün ${clock}` : `${d.getDate()} ${AYLAR[d.getMonth()]} ${clock}`;
  return [`Son aktarma: ${when}`, METHOD_LABELS[last.method] ?? last.method, last.count ? `${last.count} kayıt` : '', last.note].filter(Boolean).join(' · ');
}

const group = (title, ...rows) => h('section', { class: 'set-group' },
  h('h3', { class: 'set-title' }, title),
  h('div', { class: 'set-card' }, rows));

const textBlock = (name, hint, id) => h('span', { class: 'set-text' },
  h('span', { class: 'setting-name', id }, name),
  hint && h('span', { class: 'hint' }, hint));

export function openSettings() {
  const state = getState();

  /* İsim */
  const name = h('input', {
    class: 'input', type: 'text', id: 'set-name', value: state.name, maxlength: '40',
    autocomplete: 'given-name', autocapitalize: 'words', enterkeyhint: 'done',
  });
  let nameTimer = 0;
  const saveName = () => {
    clearTimeout(nameTimer);
    const value = name.value.trim();
    if (value && value !== getState().name) setField('name', value);
  };
  name.addEventListener('input', () => { clearTimeout(nameTimer); nameTimer = setTimeout(saveName, 350); });
  name.addEventListener('change', saveName);
  name.addEventListener('blur', () => { if (!name.value.trim()) name.value = getState().name; });

  /* Şehir (hava durumu için) */
  const cityInput = h('input', {
    class: 'input', type: 'search', id: 'set-city', placeholder: state.city.name, autocomplete: 'off',
    autocapitalize: 'words', enterkeyhint: 'search', 'aria-describedby': 'set-city-status',
  });
  const cityStatus = h('p', { class: 'city-status', id: 'set-city-status' }, `Şu an: ${state.city.name}`);
  const cityList = h('ul', { class: 'city-list' });
  let cityTimer = 0;
  let cityQuery = 0;
  cityInput.addEventListener('input', () => {
    clearTimeout(cityTimer);
    const query = cityInput.value.trim();
    cityList.replaceChildren();
    if (query.length < 2) { cityStatus.textContent = `Şu an: ${getState().city.name}`; return; }
    cityStatus.textContent = 'Aranıyor…';
    cityTimer = setTimeout(async () => {
      const ticket = ++cityQuery; // geç gelen eski sonuçlar yenisini ezmesin
      try {
        const results = await searchCities(query);
        if (ticket !== cityQuery) return;
        cityStatus.textContent = results.length ? 'Bir şehir seç:' : 'Sonuç yok. Başka bir yazımla dene.';
        cityList.replaceChildren(...results.map((city) => h('li', {},
          h('button', {
            type: 'button', class: 'city-option',
            onclick: () => {
              setField('city', { name: city.name, lat: city.lat, lon: city.lon });
              cityInput.value = '';
              cityInput.placeholder = city.name;
              cityList.replaceChildren();
              cityStatus.textContent = `Şu an: ${city.name}`;
              toast(`Şehir: ${city.name}`);
            },
          }, city.name, city.region && h('span', { class: 'city-region' }, city.region)))));
      } catch {
        if (ticket === cityQuery) cityStatus.textContent = 'Bağlantı yok; şehir aranamadı.';
      }
    }, 400);
  });

  /* Hava efektini dene (geçici) */
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Hava efekti' });
  const paintChips = () => chips.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.key === getPreview())));
  for (const [key, label] of Object.entries(PREVIEWS)) {
    chips.append(h('button', { type: 'button', class: 'chip', dataset: { key }, onclick: () => { setPreview(key); paintChips(); } }, label));
  }
  paintChips();

  /* Dönem sonu */
  const semester = h('input', { class: 'input', type: 'date', id: 'set-semester', value: state.semesterEnd });
  semester.addEventListener('change', () => setField('semesterEnd', semester.value));

  /* Ses */
  const toggle = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-labelledby': 'set-sound' });
  const volume = h('input', { type: 'range', class: 'range', min: '0', max: '100', step: '5', 'aria-labelledby': 'set-volume' });
  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-checked') !== 'true';
    setField('sound', { ...getState().sound, on });
    if (on) playCall('calm');
  });
  volume.addEventListener('input', () => {
    volume.style.setProperty('--fill', `${volume.value}%`);
    setField('sound', { ...getState().sound, volume: Number(volume.value) / 100 });
  });
  volume.addEventListener('change', () => playCall('calm'));

  /* Yedek */
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', tabindex: '-1' });
  const importPanel = h('div', { class: 'set-panel', hidden: true });
  const closePanel = () => { importPanel.hidden = true; importPanel.replaceChildren(); };

  const showErrors = (errors) => {
    importPanel.replaceChildren(...[
      h('p', { class: 'set-panel-title is-error' }, 'Yedek yüklenemedi'),
      h('ul', { class: 'set-errors' }, errors.slice(0, 4).map((e) => h('li', {}, e))),
      errors.length > 4 && h('p', { class: 'hint' }, `ve ${errors.length - 4} hata daha`),
      h('div', { class: 'actions is-single' }, h('button', { type: 'button', class: 'btn btn-secondary', onclick: closePanel }, 'Tamam')),
    ].filter(Boolean)); // replaceChildren false'u atlamaz, "false" yazar
    importPanel.hidden = false;
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP) return showErrors(['Dosya çok büyük (en fazla 2 MB).']);
    let json;
    try { json = JSON.parse(await file.text()); } catch { return showErrors(['Dosya okunamadı: geçerli bir JSON değil.']); }
    const result = validateBackup(json);
    if (!result.ok) return showErrors(result.errors);
    const load = confirmTap(h('button', { type: 'button', class: 'btn btn-danger' }, 'Yükle'), () => {
      const before = snapshot();
      importBackup(json);
      closePanel();
      toast('Yedek yüklendi', { action: 'Geri al', onAction: () => restore(before) });
    });
    importPanel.replaceChildren(
      h('p', { class: 'set-panel-title' }, file.name),
      h('p', { class: 'hint' }, `${countText(result.counts)}. Yüklenirse şu anki verilerin yerine geçer.`),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-secondary', onclick: closePanel }, 'Vazgeç'), load));
    importPanel.hidden = false;
  });

  /* Veri */
  const counts = h('span', { class: 'hint' });
  const exHint = h('span', { class: 'hint' });
  const exRow = h('div', { class: 'set-row is-stacked' },
    h('span', { class: 'set-text' }, h('span', { class: 'setting-name' }, 'Örnek kayıtlar'), exHint),
    confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Örnekleri sil'), () => {
      const before = snapshot();
      removeExamples();
      toast('Örnekler silindi', { action: 'Geri al', onAction: () => restore(before) });
    }));

  const wipe = confirmTap(h('button', { type: 'button', class: 'btn btn-danger btn-block' }, 'Tüm verileri sil'), () => {
    const before = snapshot();
    resetAll();
    toast('Tüm veriler silindi', { action: 'Geri al', onAction: () => restore(before) });
  });

  /* Takvim: tek dosyada hepsi ya da yalnızca hiç aktarılmamış / değişmiş kayıtlar */
  async function runExport(mode) {
    const result = await exportToCalendar({ mode });
    if (result.method === 'share') toast(`${result.count} kayıt takvime gönderildi`);
    else if (result.method === 'download') toast(`${result.count} kayıt .ics dosyası olarak indirildi`);
    else if (!result.ok && result.method !== 'cancel' && result.method !== 'data-url') toast(result.message);
  }
  const calAll = h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: () => runExport('all') }, 'Tümünü takvime aktar');
  const calNew = h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: () => runExport('changed') }, 'Sadece yeni ve değişenleri aktar');
  const calLast = h('p', { class: 'hint cal-last', id: 'set-cal-last' });

  /** Store değişince (geri al, yedek yükleme, başka sekme) ekranı güncel tut. */
  function sync() {
    const s = getState();
    if (document.activeElement !== name) name.value = s.name;
    if (document.activeElement !== semester) semester.value = s.semesterEnd;
    toggle.setAttribute('aria-checked', String(s.sound.on));
    volume.value = String(Math.round(s.sound.volume * 100));
    volume.style.setProperty('--fill', `${volume.value}%`);
    volume.disabled = !s.sound.on;
    counts.textContent = countText(Object.fromEntries(TYPES.map((t) => [t, s[t].length])));
    const examples = countExamples();
    exRow.hidden = !examples;
    exHint.textContent = `${examples} örnek kayıt var; kendi kayıtlarına dokunulmaz.`;
    const pending = pendingCount(s);
    calNew.textContent = pending ? `Sadece yeni ve değişenleri aktar (${pending})` : 'Yeni ya da değişen kayıt yok';
    calNew.disabled = !pending;
    calLast.textContent = lastExportText(s.calendar.last);
  }

  const body = h('div', { class: 'settings' },
    group('Profil',
      h('label', { class: 'set-row is-stacked' }, textBlock('İsim', 'Ana ekranda ve mesajlarda görünür.'), name)),
    group('Konum',
      h('div', { class: 'set-row is-stacked' },
        h('label', { class: 'set-text', for: 'set-city' }, h('span', { class: 'setting-name' }, 'Şehir'), h('span', { class: 'hint' }, 'Hava durumu bu şehre göre gelir.')),
        cityInput, cityStatus, cityList)),
    group('Eğitim',
      h('label', { class: 'set-row is-stacked' }, textBlock('Dönem sonu', 'Eğitim bölümü kalan günü buna göre sayar.'), semester)),
    group('Hava efektini dene',
      h('div', { class: 'set-row is-stacked' },
        textBlock('Efekt', 'Geçici: arka plan ve tamarinin mesajı seçilen havaya göre değişir. Uygulama yeniden açılınca Gerçek\'e döner.'),
        chips)),
    group('Ses',
      h('div', { class: 'set-row' }, textBlock('Sesler', 'Tamarine dokununca ses çıkarır. iPhone sessizdeyse duyulmaz.', 'set-sound'), toggle),
      h('div', { class: 'set-row is-stacked' }, textBlock('Ses seviyesi', null, 'set-volume'), volume)),
    group('Takvim',
      h('div', { class: 'set-row is-stacked' },
        textBlock('Takvime aktar', 'Hatırlatmaları iPhone\'un kendi Takvim uygulaması verir.'),
        calAll, calNew,
        h('p', { class: 'hint' }, 'Aynı kaydı iki kez aktarırsan takvimde iki kez görünebilir. Değiştirdiğin bir kaydı yeniden aktarmadan önce takvimdeki eskisini sil.'),
        h('p', { class: 'hint' }, 'Bildirimler için iPhone Ayarlar > Takvim > Bildirimler açık olmalı ve etkinlikleri Tamarin takvimine değil, kendi takviminize ekleyin.')),
      h('div', { class: 'set-row' }, calLast)),
    group('Yedek',
      h('div', { class: 'set-row is-stacked' },
        textBlock('Yedek', 'Tüm kayıtlar tek bir JSON dosyasına yazılır.'),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: exportBackup }, 'Yedek al'),
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => fileInput.click() }, 'Yedek yükle')),
        importPanel, fileInput)),
    group('Veri',
      h('div', { class: 'set-row' }, h('span', { class: 'set-text' }, h('span', { class: 'setting-name' }, 'Kayıtlar'), counts)),
      exRow,
      h('div', { class: 'set-row is-stacked' },
        textBlock('Tüm verileri sil', 'Kayıtlar ve ayarlar silinir; örnekler geri gelmez. Şifre kasası ayrıdır, ona dokunulmaz. Önce yedek almak iyi olur.'),
        wipe)));

  sync();
  const stop = onChange(sync);
  openSheet({ title: 'Ayarlar', body, onClose: stop });
}
