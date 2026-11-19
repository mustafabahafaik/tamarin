// Ana ekran yüzü (yerleşim: referans/tasarim.gif, renkler: "Toprak" teması).
// Üstte selamlama + hava + zil ve ipucu; ortada 4 dilimli halka, tamarin ve durum yazısı;
// durum yazısıyla "Bugün" şeridi arasında Business butonu (#business); altta "Bugün" şeridi. Arkada, içeriğin altında hava efekti (weather-fx.js).
// Halka ölçüleri GIF pikseli cinsinden (u); CSS'teki --u bunları ekran genişliğine ölçekler.
import { h, svg, openSheet, closeSheet, toast, confirmTap } from './ui.js';
import { getState, onChange, setField, countExamples, removeExamples, snapshot, restore, getCache, setCache } from './store.js';
import { blocksFor, blocksMarkup, createRingBlocks, seedOf, PER_ROW, PER_ROW_LITE } from './ring-blocks.js';
import { computeStatus, whenLabel, todayCards, money, bizSummary } from './status.js';
import {
  WINDY, describe, cachedForecast, refreshForecast, ageLabel,
  weatherEvents, setRealForecast, realForecast, currentScene,
} from './weather.js';
import { today0, nowParts, isoDow, formatLong, GUNLER, AYLAR } from './dates.js';
import { createWeatherFx } from './weather-fx.js';
import { openSettings } from './settings.js';
import { playCall } from './sound.js';
import { talk } from './assistant/chat.js';

/* ---------- Geometri ---------- */

const R_IN = 96;      // halkanın iç yarıçapı
const R_OUT = 137;    // dış yarıçap
const GAP = 12.5;     // dilim ucunun eksenden uzaklığı (dilimler arası boşluk = 25)
const CORNER = 8;     // dilim köşe yuvarlaklığı
const BOX = 170;      // halka kutusu -170..170: parlamalara yer kalsın

// Saat yönünde dönüş (sağ üst = 0°), ikon merkezi/ölçeği (GIF'ten ölçüldü) ve degradenin iki ucu.
const SLICES = {
  bills:  { rot: 270, icon: 'wallet',   at: [-86.5, -76.5], scale: 1.72, from: [-118, -14], to: [-14, -118] },
  school: { rot: 0,   icon: 'cap',      at: [84, -77],      scale: 1.8,  from: [14, -118],  to: [118, -14] },
  tasks:  { rot: 90,  icon: 'calendar', at: [89.5, 71.5],   scale: 1.7,  from: [118, 14],   to: [14, 118] },
  days:   { rot: 180, icon: 'heart',    at: [-89.5, 70.5],  scale: 1.92, from: [-118, 14],  to: [-14, 118] },
};
const ORDER = ['bills', 'school', 'tasks', 'days']; // açılışta saat yönünde yerine otursunlar

const f = (n) => Math.round(n * 100) / 100;

function rotate([x, y], deg) {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

/** Köşeleri yuvarlatılmış çeyrek halka. Sağ üst dilim hesaplanır, sonra döndürülür. */
function slicePath(deg) {
  const k = GAP + CORNER;
  const yo = Math.sqrt((R_OUT - CORNER) ** 2 - k ** 2);
  const yi = Math.sqrt((R_IN + CORNER) ** 2 - k ** 2);
  const out = R_OUT / (R_OUT - CORNER);
  const inn = R_IN / (R_IN + CORNER);
  const pts = {
    p1: [GAP, -yo], t1: [k * out, -yo * out],    // üst uç, dış köşe
    t2: [yo * out, -k * out], p2: [yo, -GAP],    // sağ uç, dış köşe
    p3: [yi, -GAP], t3: [yi * inn, -k * inn],    // sağ uç, iç köşe
    t4: [k * inn, -yi * inn], p4: [GAP, -yi],    // üst uç, iç köşe
  };
  const P = Object.fromEntries(Object.entries(pts).map(([key, pt]) => [key, rotate(pt, deg).map(f).join(' ')]));
  return `M ${P.p1} A ${CORNER} ${CORNER} 0 0 1 ${P.t1} A ${R_OUT} ${R_OUT} 0 0 1 ${P.t2} `
    + `A ${CORNER} ${CORNER} 0 0 1 ${P.p2} L ${P.p3} A ${CORNER} ${CORNER} 0 0 1 ${P.t3} `
    + `A ${R_IN} ${R_IN} 0 0 0 ${P.t4} A ${CORNER} ${CORNER} 0 0 1 ${P.p4} Z`;
}

/* ---------- İkonlar (24'lük ızgara, çizgi ikon) ---------- */

const ICONS = {
  wallet: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M3 9h12.5"/><path d="M21 11h-3.6a2.25 2.25 0 0 0 0 4.5H21"/><circle cx="17.6" cy="13.25" r=".55" fill="currentColor"/>',
  cap: '<path d="M1.5 9.5 12 5l10.5 4.5L12 14z"/><path d="M6 12v4.2c0 1.3 2.7 2.8 6 2.8s6-1.5 6-2.8V12"/><path d="M22.5 9.5v5.5"/>',
  heart: '<path d="M12 20.3C7.2 17 3.5 13.7 3.5 9.7 3.5 7 5.5 5 8 5c1.6 0 3.1.8 4 2.2C12.9 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.7 0 4-3.7 7.3-8.5 10.6z"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><g fill="currentColor" stroke="none"><rect x="7" y="12" width="2" height="2" rx=".4"/><rect x="11" y="12" width="2" height="2" rx=".4"/><rect x="15" y="12" width="2" height="2" rx=".4"/><rect x="7" y="15.8" width="2" height="2" rx=".4"/><rect x="11" y="15.8" width="2" height="2" rx=".4"/></g>',
  user: '<circle cx="12" cy="7.8" r="3.7"/><path d="M4.8 20.2c0-3.9 3.2-6.3 7.2-6.3s7.2 2.4 7.2 6.3"/>',
  bell: '<path d="M4.9 17V11.2a7.1 7.1 0 0 1 14.2 0V17l2 2.3H2.9z"/><path d="M9.7 21.4a2.4 2.4 0 0 0 4.6 0"/><path d="M12 2.4v1.7"/>',
  cloud: '<path d="M7.2 19h9.6a4.2 4.2 0 0 0 .7-8.35 5.6 5.6 0 0 0-10.7-.9A4.65 4.65 0 0 0 7.2 19z"/>',
  clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
  rain: '<path d="M7.2 15.5h9.6a4 4 0 0 0 .7-7.95 5.4 5.4 0 0 0-10.4-.85A4.4 4.4 0 0 0 7.2 15.5z"/><path d="M8.5 18.5 7.5 21M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5"/>',
  snow: '<path d="M7.2 15.5h9.6a4 4 0 0 0 .7-7.95 5.4 5.4 0 0 0-10.4-.85A4.4 4.4 0 0 0 7.2 15.5z"/><path d="M8 19.5h.01M12 21h.01M16 19.5h.01" stroke-width="2.4"/>',
  storm: '<path d="M7.2 15h9.6a4 4 0 0 0 .7-7.95 5.4 5.4 0 0 0-10.4-.85A4.4 4.4 0 0 0 7.2 15z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
  fog: '<path d="M7.2 13h9.6a4 4 0 0 0 .7-7.95 5.4 5.4 0 0 0-10.4-.85A4.4 4.4 0 0 0 7.2 13z"/><path d="M4.5 16.5h15M6.5 20h11"/>',
  partly: '<path d="M8.5 3.5v1.4M3.5 8.5h1.4M5 5l1 1M12 5l-1 1"/><path d="M5.6 10.6a3.2 3.2 0 0 1 5.9-2.6"/><path d="M8.6 20h8.8a3.8 3.8 0 0 0 .6-7.55 5 5 0 0 0-9.6-.75A4.15 4.15 0 0 0 8.6 20z"/>',
  'partly-night': '<path d="M11.4 7.6A4.4 4.4 0 0 1 5.6 3.4a4.4 4.4 0 1 0 5.8 4.2z"/><path d="M8.6 20h8.8a3.8 3.8 0 0 0 .6-7.55 5 5 0 0 0-9.6-.75A4.15 4.15 0 0 0 8.6 20z"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/><path d="M12 3v.5"/>',
  thermo: '<path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  wind: '<path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 13h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 17h7"/>',
  sunset: '<path d="M7 17a5 5 0 0 1 10 0"/><path d="M3 20h18M12 3v6M9 6l3 3 3-3M5.2 12.2l1.2 1M18.8 12.2l-1.2 1"/>',
  sunrise: '<path d="M7 17a5 5 0 0 1 10 0"/><path d="M3 20h18M12 9V3M9 6l3-3 3 3M5.2 12.2l1.2 1M18.8 12.2l-1.2 1"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5zM8 7.5h8"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.2 2.8 2.8L16.2 9.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  bag: '<rect x="3" y="7" width="18" height="13" rx="2.6"/><path d="M8.6 7V5.6A1.6 1.6 0 0 1 10.2 4h3.6a1.6 1.6 0 0 1 1.6 1.6V7"/><path d="M3 12.4c2.8 1.3 5.8 1.9 9 1.9s6.2-.6 9-1.9"/><path d="M12 13.2v1.9"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
};

function icon(name, cls) {
  return svg(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`);
}

/* ---------- Halka ---------- */

/**
 * Bir dilim: acil hale katmanı + taş bloklar (js/ring-blocks.js) + dokunma alanı (dilimin tam şekli, saydam)
 * + ikon (blokların üstünde, ayrı katman). Döner: { layer, svgEl, blocks }.
 */
function sliceLayer(mod, index, perRow) {
  const s = SLICES[mod.id];
  const blocks = blocksFor(s.rot, perRow, { seed: seedOf(mod.id), from: s.from, to: s.to });
  const d = slicePath(s.rot);
  const vb = `${-BOX} ${-BOX} ${BOX * 2} ${BOX * 2}`;
  const [ix, iy] = s.at;
  const layer = h('div', { class: 'slice-layer', dataset: { cat: mod.id }, style: `--i: ${index}` });

  // Acil durum halesi ayrı bir katmanda: nabız animasyonu yalnızca onun opaklığını değiştirir.
  layer.append(svg(`
    <svg class="slice-glow" viewBox="${vb}" aria-hidden="true">
      <defs><filter id="glow-${mod.id}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6"/>
      </filter></defs>
      <path d="${d}" filter="url(#glow-${mod.id})"/>
    </svg>`));

  const svgEl = svg(`
    <svg class="slice-svg" viewBox="${vb}">
      <a class="slice-link" href="#${mod.route}" aria-label="${mod.title}">
        <path class="slice-shape" d="${d}"/>
        ${blocksMarkup(blocks)}
        <path class="slice-rim" d="${d}"/>
      </a>
    </svg>`);
  layer.append(svgEl);

  // İkon ayrı katmanda (ringIcons): blokların ve tamarinin bıyıklarının üstünde, hep sabit ve okunaklı.
  const icon = `<g class="slice-icon" data-cat="${mod.id}" transform="translate(${ix} ${iy}) scale(${s.scale}) translate(-12 -12)"
    fill="none" stroke="currentColor" stroke-width="${f(2.6 / s.scale)}" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.icon]}</g>`;
  return { layer, svgEl, blocks, icon };
}

/** Dört dilimin ikonları tek bir üst katmanda (dokunmayı alttaki dilime bırakır). */
function ringIcons(slices) {
  const vb = `${-BOX} ${-BOX} ${BOX * 2} ${BOX * 2}`;
  return svg(`<svg class="ring-icons" viewBox="${vb}" aria-hidden="true">${slices.map((sl) => sl.icon).join('')}</svg>`);
}

/**
 * Tamarin: referans/tamarin.jpg'den kesilmiş gerçek fotoğraf (tools/cut_tamarin.py). Kutu halka merkezli,
 * kenarı 274u; srcset ile ekrana göre 768 ya da 1152 piksellik görsel (doğal boyutundan büyütülmez).
 * Göz kırpma yok: fotoğrafta kapalı göz karesi yok, sentezlenen kapak yapay görünüyordu.
 */
function tamarinFigure() {
  const img = h('img', {
    class: 'tamarin-img', src: 'assets/tamarin-768.webp', alt: '', draggable: 'false', decoding: 'async',
    srcset: 'assets/tamarin-768.webp 768w, assets/tamarin-1152.webp 1152w',
    sizes: '(max-width: 560px) calc(100vw - 56px), 504px',
  });
  const breath = h('div', { class: 'tamarin-breath' }, img);
  const tilt = h('div', { class: 'tamarin-tilt' }, breath);
  return { figure: h('div', { class: 'tamarin', 'aria-hidden': 'true' }, tilt), tilt, breath };
}

/* ---------- Davranışlar ---------- */

/** Parmak (ya da fare) ekranda gezdikçe tamarin o yöne hafifçe döner. */
function setupTilt(screen, target) {
  let goal = [0, 0];
  let now = [0, 0];
  let frame = 0;
  let last = 0;
  const MAX = 13;   // derece
  const TAU = 110;  // ms: hedefe yaklaşma hızı; süreye bağlı, 60/120 Hz ekranlarda aynı his

  function step(time) {
    const dt = last ? Math.min(time - last, 250) : 16;
    last = time;
    const k = 1 - Math.exp(-dt / TAU);
    now = now.map((v, i) => v + (goal[i] - v) * k);
    const [x, y] = now;
    target.style.transform = `rotateY(${f(x * MAX)}deg) rotateX(${f(-y * MAX)}deg) translate3d(${f(x * 5)}px, ${f(y * 4)}px, 0)`;
    const settled = Math.abs(goal[0] - x) < 0.002 && Math.abs(goal[1] - y) < 0.002;
    frame = settled ? 0 : requestAnimationFrame(step);
    if (settled) { last = 0; target.style.willChange = ''; }
  }
  const kick = () => {
    if (frame) return;
    target.style.willChange = 'transform'; // yalnızca hareket süresince
    frame = requestAnimationFrame(step);
  };

  function aim(event) {
    const box = target.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    goal = [clamp((event.clientX - cx) / (window.innerWidth / 2)), clamp((event.clientY - cy) / (window.innerHeight / 2))];
    kick();
  }
  function release() { goal = [0, 0]; kick(); }

  screen.addEventListener('pointermove', aim);
  screen.addEventListener('pointerdown', aim);
  screen.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') release(); });
  screen.addEventListener('pointercancel', release);
  screen.addEventListener('pointerleave', release);
}

/* ---------- Sheet'ler ---------- */

const SECTION_TITLES = { bills: 'Ödemeler', school: 'Sınavlar ve teslimler', days: 'Doğum günleri ve özel günler', tasks: 'Görevler' };
const ROUTES = { bills: 'odemeler', school: 'egitim', days: 'gunler', tasks: 'ajanda' };
const MODULE_TITLES = { bills: 'Ödemeler', school: 'Eğitim', days: 'Özel Günler', tasks: 'Ajanda' };

/** Satırın ikinci bilgisi: tutar, yaş / yıl ya da önem. */
function detail(item) {
  if (item.cat === 'bills' && item.amount) return money.format(item.amount);
  if (item.cat === 'days' && item.milestone) return item.milestone;
  if (item.cat === 'tasks' && item.prio === 'high') return 'Önemli';
  return '';
}

/** Zil: yaklaşan ödemeler, sınavlar, doğum günleri ve görevler. */
function openUpcoming() {
  const { upcoming } = computeStatus();
  const body = h('div', { class: 'upcoming' });
  if (!upcoming.length) {
    body.append(h('p', { class: 'upcoming-empty' }, 'Yaklaşan bir şey yok.'),
      h('p', { class: 'hint' }, 'Ödemeler, sınavlar, doğum günleri ve görevler eklendikçe burada görünecek.'));
  }
  for (const cat of ['bills', 'school', 'days', 'tasks']) {
    const items = upcoming.filter((i) => i.cat === cat);
    if (!items.length) continue;
    body.append(h('section', { class: 'upcoming-group', dataset: { cat } },
      h('h3', { class: 'upcoming-title' }, SECTION_TITLES[cat]),
      h('ul', { class: 'upcoming-list' }, items.map((item) => h('li', {},
        h('a', { class: `upcoming-row${item.urgent ? ' is-urgent' : ''}`, href: `#${ROUTES[cat]}` },
          h('span', { class: 'upcoming-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'upcoming-text' },
            h('span', { class: 'upcoming-name' }, item.title),
            detail(item) && h('span', { class: 'upcoming-detail' }, detail(item))),
          h('span', { class: 'upcoming-when' }, whenLabel(item))))))));
  }
  openSheet({ title: 'Yaklaşanlar', body });
}

const dayName = (i, ymdText) => (i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : GUNLER[isoDow(ymdText)]);
const deg = (n) => `${Math.round(n)}°`;
const clock = (iso) => (iso ? iso.slice(11, 16) : '');

/** Havaya dokununca: 4 günlük tahmin. */
function openForecast() {
  const { data, stale } = realForecast();
  const body = h('div', { class: 'forecast' });
  if (!data) {
    const retry = h('button', { type: 'button', class: 'btn btn-secondary btn-block' }, 'Tekrar dene');
    retry.addEventListener('click', async () => {
      retry.textContent = 'Deneniyor…';
      const result = await refreshForecast({ force: true });
      setRealForecast(result.data, result.stale);
      closeSheet();
      if (result.data) openForecast();
      else toast('Hava durumu alınamadı');
    });
    body.append(h('p', { class: 'upcoming-empty' }, 'Hava durumu alınamadı.'),
      h('p', { class: 'hint' }, 'İnternet bağlantını kontrol edip tekrar dene.'), retry);
    openSheet({ title: 'Hava durumu', body });
    return;
  }
  const now = data.current;
  const lo = Math.min(...data.daily.map((d) => d.min));
  const hi = Math.max(...data.daily.map((d) => d.max));
  const span = Math.max(1, hi - lo);
  const nowInfo = describe(now.code, now.isDay);
  body.append(
    h('div', { class: 'fc-now' },
      h('span', { class: 'fc-now-icon' }, icon(nowInfo.icon, 'fc-icon-big')),
      h('div', { class: 'fc-now-text' },
        h('p', { class: 'fc-now-temp' }, deg(now.temp), h('span', { class: 'fc-now-desc' }, nowInfo.text)),
        h('p', { class: 'hint' }, `Hissedilen ${deg(now.feels)} · Rüzgar ${Math.round(now.wind)} km/s`),
        h('p', { class: 'hint' }, `Gün doğumu ${clock(data.daily[0].sunrise)} · Gün batımı ${clock(data.daily[0].sunset)}`))),
    h('ul', { class: 'fc-list' }, data.daily.map((d, i) => h('li', { class: 'fc-row' },
      h('span', { class: 'fc-day' }, h('span', { class: 'fc-day-name' }, dayName(i, d.date)), h('span', { class: 'fc-day-desc' }, describe(d.code).text)),
      h('span', { class: 'fc-icon' }, icon(describe(d.code).icon, 'fc-svg')),
      h('span', { class: 'fc-pop' }, d.pop > 0 ? `%${d.pop}` : ''),
      h('span', { class: 'fc-range' },
        h('span', { class: 'fc-min' }, deg(d.min)),
        h('span', { class: 'fc-bar', style: `--from:${((d.min - lo) / span) * 100}%; --to:${((d.max - lo) / span) * 100}%` }),
        h('span', { class: 'fc-max' }, deg(d.max)))))),
    h('p', { class: 'hint fc-foot' }, stale ? `Bağlantı yok · ${ageLabel(data.at)} güncellendi` : `Open-Meteo · ${ageLabel(data.at)} güncellendi`));
  openSheet({ title: `${data.city} · 4 günlük tahmin`, body });
}

const REMIND = { 0: 'Tam zamanında', 15: '15 dk önce', 60: '1 saat önce', 1440: '1 gün önce', none: 'Yok' };
const PRIO = { low: 'Düşük', normal: 'Normal', high: 'Yüksek' };

/** "Bugün" kartına dokununca: kaydın ayrıntısı ve bölümüne git. */
function openRecord(card) {
  const entry = getState()[card.type]?.find((x) => x.id === card.id);
  if (!entry) return;
  const rows = {
    bills: () => [['Tutar', entry.amount ? money.format(entry.amount) : '—'], ['Son gün', `Her ayın ${entry.day}. günü`], ['Tür', entry.cat || '—'], ['Durum', card.label]],
    classes: () => [['Gün', GUNLER[entry.day]], ['Saat', `${entry.start}–${entry.end}`], ['Derslik', entry.room || '—'], ['Öğretim üyesi', entry.teacher || '—']],
    exams: () => [['Tür', entry.type], ['Tarih', `${formatLong(entry.date)}${entry.time ? ` · ${entry.time}` : ''}`], ['Derslik', entry.room || '—'], ['Ne zaman', card.label]],
    days: () => [['Tür', entry.kind], ['Tarih', `${entry.day} ${AYLAR[entry.month - 1]}${entry.year ? ` ${entry.year}` : ''}`], ['Yakınlık', entry.rel], ['Ne zaman', card.label]],
    tasks: () => [['Tarih', `${formatLong(entry.date)}${entry.time ? ` · ${entry.time}` : ''}`], ['Önem', PRIO[entry.prio]], ['Hatırlatma', REMIND[entry.remind]], ['Durum', entry.done ? 'Tamamlandı' : card.label]],
  }[card.type]();
  if (entry.note) rows.push(['Not', entry.note]);
  openSheet({
    title: card.title,
    body: h('div', { class: 'record', dataset: { cat: card.cat } },
      h('dl', { class: 'record-list' }, rows.map(([k, v]) => h('div', { class: 'record-row' }, h('dt', {}, k), h('dd', {}, v)))),
      h('a', { class: 'btn btn-secondary btn-block record-go', href: `#${ROUTES[card.cat]}` }, `${MODULE_TITLES[card.cat]} bölümüne git`)),
  });
}

/** "Bugün" şeridinin üstündeki küçük "Örnek verilerle açıldı · Örnekleri sil" bildirimi (kapatılabilir). */
function exampleNotice() {
  const remove = confirmTap(h('button', { type: 'button', class: 'ex-notice-action' }, 'Örnekleri sil'), () => {
    const before = snapshot();
    removeExamples();
    toast('Örnekler silindi', { action: 'Geri al', onAction: () => restore(before) });
  });
  const close = h('button', { type: 'button', class: 'ex-notice-close', 'aria-label': 'Bildirimi kapat', onclick: () => setField('exNoticeClosed', true) },
    svg('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'));
  return h('div', { class: 'ex-notice', role: 'status', hidden: true },
    h('span', { class: 'ex-notice-text' }, 'Örnek verilerle açıldı'),
    h('span', { class: 'ex-notice-sep', 'aria-hidden': 'true' }, '·'),
    remove, close);
}

/* ---------- Üst alan ---------- */

function greeting(hour) {
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  if (hour >= 18 && hour < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

/**
 * Başlığın altındaki tek satır ipucu: yağış > %50, > 30°, < 5°, rüzgar; yoksa gün doğumu/batımı.
 * Yalnızca bilgi, öğüt yok ("şemsiyeni al" değil, "Yağış ihtimali %78").
 */
function weatherHint(data) {
  if (!data) return null;
  const today = data.daily[0];
  const now = data.current;
  if (today.pop > 50) return { icon: 'umbrella', text: `Yağış ihtimali %${today.pop}` };
  if (Math.max(now.temp, today.max) > 30) return { icon: 'thermo', text: `En yüksek ${deg(Math.max(now.temp, today.max))}` };
  if (now.temp < 5) return { icon: 'thermo', text: `Hissedilen ${deg(now.feels ?? now.temp)}` };
  if (now.wind > WINDY) return { icon: 'wind', text: `Rüzgar ${Math.round(now.wind)} km/s` };
  if (now.isDay) return { icon: 'sunset', text: `Gün batımı ${clock(today.sunset)}` };
  const sunrise = nowParts().hour >= 12 ? data.daily[1]?.sunrise : today.sunrise;
  return { icon: 'sunrise', text: `Gün doğumu ${clock(sunrise)}` };
}

/* ---------- Sahne (hava efekti) ---------- */

let sceneCtl = null;

function sceneControllers() {
  if (sceneCtl) return sceneCtl;
  const root = document.getElementById('scene');
  sceneCtl = { fx: createWeatherFx(root.querySelector('.fx')) };
  return sceneCtl;
}

/* ---------- Ekran ---------- */

let introPlayed = false;

/** Yüz ekranını kurar; ekran DOM'dan çıkınca zamanlayıcılar, abonelikler ve efektler kendini temizler. */
export function createFaceScreen(modules) {
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));

  /* Üst alan: selamlama + tarih | hava | zil, altında ipucu */
  const greetTitle = h('span', { class: 'greet-title' });
  const greetDate = h('span', { class: 'greet-date' });
  const who = h('button', { type: 'button', class: 'who', 'aria-label': 'Ayarlar', onclick: openSettings },
    h('span', { class: 'who-icon' }, icon('user', 'who-svg')),
    h('span', { class: 'greet' }, greetTitle, greetDate));

  const wxIcon = h('span', { class: 'wx-icon' });
  const wxTemp = h('span', { class: 'wx-temp' });
  const wxDesc = h('span', { class: 'wx-desc' });
  const wxRange = h('span', { class: 'wx-range' });
  const wx = h('button', { type: 'button', class: 'wx', onclick: openForecast }, wxIcon, h('span', { class: 'wx-text' }, wxTemp, wxDesc, wxRange));

  const bellDot = h('span', { class: 'bell-dot', hidden: true });
  const bell = h('button', { type: 'button', class: 'bell', 'aria-label': 'Yaklaşanlar', onclick: openUpcoming },
    icon('bell', 'bell-icon'), bellDot);

  const hint = h('p', { class: 'face-hint' });
  const header = h('header', { class: 'face-top' },
    h('h1', { class: 'visually-hidden' }, 'Tamarin'),
    h('div', { class: 'top-row' }, who, wx,
      h('a', { class: 'vault-link', href: '#kasa', 'aria-label': 'Şifre kasası' }, icon('lock', 'vault-link-icon')),
      bell),
    hint);

  /* Halka + tamarin + durum yazısı */
  const ring = h('div', { class: 'ring' });
  const perRow = getCache('blocksLite') ? PER_ROW_LITE : PER_ROW; // kare düşen cihazda sıra başına 7
  const slices = ORDER.map((id, index) => ({ id, href: byId[id].route, ...sliceLayer(byId[id], index, perRow) }));
  slices.forEach((sl) => ring.append(sl.layer));
  const { figure, tilt } = tamarinFigure();
  const hit = h('button', { type: 'button', class: 'tamarin-hit', 'aria-label': 'Tamarin ile konuş (uzun bas: ses)' });
  ring.append(figure, ringIcons(slices), hit);
  const ringWrap = h('nav', { class: 'ring-wrap', 'aria-label': 'Bölümler' }, ring);
  const message = h('p', { class: 'face-message', role: 'status' });

  /* Business butonu: halkanın altındaki yazıyla "Bugün" şeridi arasında */
  const bizInfo = h('span', { class: 'biz-btn-info' });
  const bizBtn = h('a', { class: 'biz-btn', href: '#business', dataset: { cat: 'business' } },
    icon('bag', 'biz-btn-icon'),
    h('span', { class: 'biz-btn-title' }, 'Business'),
    bizInfo,
    icon('chevron', 'biz-btn-chev'));
  const biz = h('div', { class: 'face-biz' }, bizBtn);

  /* Alt alan: örnek veri şeridi + "Bugün" kartları */
  const notice = exampleNotice();
  const cardsEl = h('div', { class: 'today-scroll' });
  const strip = h('section', { class: 'today', 'aria-label': 'Bugün' },
    notice,
    h('h2', { class: 'today-title' }, 'Bugün'),
    cardsEl);

  const screen = h('div', { class: `screen screen-face${introPlayed ? '' : ' is-intro'}` },
    header,
    h('main', { class: 'face-stage' }, ringWrap, message),
    biz,
    strip);

  if (!introPlayed) {
    introPlayed = true;
    setTimeout(() => screen.classList.remove('is-intro'), 1800);
  }

  const { fx } = sceneControllers();
  let status = computeStatus();
  let active = true;

  function renderHeader() {
    const state = getState();
    // "İyi akşamlar," ve isim ayrı parçalar: dar ekranda isim kesilmez, ikinci satıra iner
    // (sağdaki hava sütunu zaten daha uzun olduğu için başlık yüksekliği değişmez).
    greetTitle.replaceChildren(
      h('span', { class: 'greet-hello' }, `${greeting(nowParts().hour)},`), ' ',
      h('span', { class: 'greet-name' }, state.name));
    greetDate.textContent = formatLong(today0());

    const { data, stale } = realForecast();
    if (data) {
      const now = data.current;
      const today = data.daily[0];
      const info = describe(now.code, now.isDay);
      wxIcon.replaceChildren(icon(info.icon, 'wx-svg'));
      wxTemp.textContent = deg(now.temp);
      wxDesc.textContent = info.text;
      wxRange.textContent = `↑${deg(today.max)}  ↓${deg(today.min)}`;
      wxRange.setAttribute('aria-label', `En yüksek ${deg(today.max)}, en düşük ${deg(today.min)}`);
      wx.setAttribute('aria-label', `${data.city}: ${deg(now.temp)}, ${info.text}. 4 günlük tahmin`);
    } else {
      wxIcon.replaceChildren(icon('cloud', 'wx-svg'));
      wxTemp.textContent = '–';
      wxDesc.textContent = state.city.name;
      wxRange.textContent = 'Hava bekleniyor';
      wx.setAttribute('aria-label', 'Hava durumu');
    }
    const tip = weatherHint(data);
    const note = data && stale ? ` · ${ageLabel(data.at)}` : '';
    hint.replaceChildren(...(tip ? [icon(tip.icon, 'hint-svg'), h('span', {}, `${tip.text}${note}`)] : []));
    hint.hidden = !tip;
  }

  function renderToday() {
    const state = getState();
    const cards = todayCards();
    cardsEl.replaceChildren(...(cards.length
      ? cards.map((card) => h('button', { type: 'button', class: `today-card${card.urgent ? ' is-urgent' : ''}`, dataset: { cat: card.cat }, onclick: () => openRecord(card) },
        h('span', { class: 'tc-top' }, icon(card.icon, 'tc-svg'), h('span', { class: 'tc-label' }, card.label)),
        h('span', { class: 'tc-title' }, card.title),
        card.sub && h('span', { class: 'tc-sub' }, card.sub)))
      : [h('p', { class: 'today-empty' }, `Bugün boşsun ${state.name}, keyfine bak`)]));
  }

  /** Store'daki her değişiklikte, hava değişince ve dakikada iki kez yüzü verilerden yeniden hesaplar. */
  function update() {
    const state = getState();
    status = computeStatus(new Date(), state, { scene: currentScene(), data: realForecast().data });
    if (message.textContent !== status.message) {
      message.classList.remove('is-changing');
      void message.offsetWidth;
      message.classList.add('is-changing');
      message.textContent = status.message;
    }
    bellDot.hidden = !status.urgent;
    bell.setAttribute('aria-label', status.urgent ? 'Yaklaşanlar, acil bir şey var' : 'Yaklaşanlar');
    ring.querySelectorAll('.slice-layer').forEach((layer) => {
      const cat = layer.dataset.cat;
      layer.classList.toggle('is-urgent', status.urgentCats.has(cat));
      // Halka özeti ("1 gecikti", "Vize 9 gün"): tasarımda görünür yazı yok, ekran okuyucu söyler.
      layer.querySelector('.slice-link').setAttribute('aria-label', `${byId[cat].title}: ${status.summaries[cat]}`);
    });
    notice.hidden = !countExamples() || state.exNoticeClosed;
    bizInfo.textContent = bizSummary(state);
    bizBtn.setAttribute('aria-label', `Business: ${bizSummary(state)}`);
    renderHeader();
    renderToday();
  }

  /** Ayı başlıkla halka arasındaki boş sağ üst köşeye yerleştirir. */
  function layoutScene() {
    if (!screen.isConnected) return;
    unitPx = (ringWrap.getBoundingClientRect().width / 340) || 1;
    const top = header.getBoundingClientRect().bottom;
    const ringBox = ringWrap.getBoundingClientRect();
    const ringTop = ringBox.top + ringBox.height / 2 - (ringBox.width * 137) / 340;
    fx.setAnchors({ moonX: window.innerWidth - 58, moonY: top + Math.max(26, Math.min(64, (ringTop - top) * 0.55)) });
  }

  function applyScene() {
    fx.setScene(currentScene());
    update();
  }

  setupTilt(screen, tilt);

  // Taş bloklar: açılış (oturum başına bir kez), boşta döngü, dokunma nefesi, dönüş dalgası.
  let unitPx = 1; // 1 SVG birimi kaç CSS pikseli (layoutScene ölçer; animasyon sırasında okunmaz)
  const blocksCtl = createRingBlocks({
    layers: slices.map((sl) => ({ id: sl.id, el: sl.svgEl, blocks: sl.blocks, href: sl.href })),
    isUrgent: (id) => status.urgentCats.has(id),
    unit: () => unitPx,
    onLite: () => setCache('blocksLite', true),
  });

  // Tamarin: kısa dokunma sesli konuşma (js/assistant/chat.js talk: dinler, cevabı balonda gösterip okur);
  // uzun basma eski tepki (ses + zıplama).
  const LONG_MS = 480;
  let pressTimer = 0;
  let longFired = false;
  const react = () => {
    playCall(status.mood);
    figure.classList.remove('is-hop');
    void figure.offsetWidth;
    figure.classList.add('is-hop');
  };
  hit.addEventListener('pointerdown', () => {
    longFired = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { longFired = true; react(); }, LONG_MS);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) hit.addEventListener(type, () => clearTimeout(pressTimer));
  hit.addEventListener('contextmenu', (event) => event.preventDefault());
  hit.addEventListener('click', () => {
    if (longFired) { longFired = false; return; }
    talk(); // tek dokunuş: hemen dinler, sesle cevap verir
  });

  async function loadWeather(force = false) {
    const result = await refreshForecast({ force });
    if (!active) return;
    setRealForecast(result.data, result.stale);
  }

  // Ekran henüz sayfaya takılmadıysa (kurulum sırasında gelen olaylar) "kapatıldı" sayılmaz;
  // yalnızca bir kez takılıp sonra çıkarıldıysa her şey temizlenir.
  let mounted = false;
  const gone = () => mounted && !screen.isConnected;

  // Durum değişince (store "change", hava, saat, uygulamaya dönüş) yüzü güncelle.
  let lastCity = getState().city;
  const offStore = onChange((state) => {
    if (gone()) return cleanup();
    update();
    if (state.city.lat !== lastCity.lat || state.city.lon !== lastCity.lon) {
      lastCity = state.city;
      setRealForecast(null);
      loadWeather(true);
    }
  });
  const onScene = () => (gone() ? cleanup() : applyScene());
  weatherEvents.addEventListener('scene', onScene);
  const timer = setInterval(() => (gone() ? cleanup() : update()), 30000);
  const onVisible = () => {
    if (gone()) return cleanup();
    if (document.visibilityState === 'visible') { update(); loadWeather(); blocksCtl.resume(); } else blocksCtl.pause();
  };
  document.addEventListener('visibilitychange', onVisible);
  const resizer = new ResizeObserver(() => layoutScene());
  const onResize = () => layoutScene();
  window.addEventListener('resize', onResize);

  // Ekran DOM'a takılınca efektleri başlat, çıkarılınca hemen durdur.
  const mountWatch = new MutationObserver(() => { if (!screen.isConnected) cleanup(); });
  setTimeout(() => {
    if (!active) return;
    if (!screen.isConnected) return cleanup(); // takılmadan önce başka ekrana geçildi
    mounted = true;
    mountWatch.observe(screen.parentNode, { childList: true });
    resizer.observe(screen);
    layoutScene();
    document.fonts?.ready.then(layoutScene);
    fx.start();
    blocksCtl.start();
  }, 0);

  function cleanup() {
    if (!active) return;
    active = false;
    offStore();
    weatherEvents.removeEventListener('scene', onScene);
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('resize', onResize);
    resizer.disconnect();
    mountWatch.disconnect();
    fx.stop();
    blocksCtl.destroy();
  }

  setRealForecast(cachedForecast(), false);
  message.textContent = status.message;
  applyScene();
  loadWeather();

  return screen;
}
