// Telefon çizimi: modele göre telefonun ARKASINI çizen SVG işaretlemesi üretir (DOM'a dokunmaz,
// Node testlerinde de çalışır). Renkler CSS değişkeni: --case-<renk> (css/style.css :root).
// Marka logosu yok; yalnızca gövde, kamera(lar), flaş ve isteğe bağlı kılıf.
//   svg(phoneArt('iPhone 12', 'Su yeşili', true, 44))

const VIEW_W = 64;
const VIEW_H = 124;

/** Kılıf rengi → CSS değişkeni adı: "Su yeşili" → "su-yesili". */
export const CASE_SLUG = {
  Siyah: 'siyah', Beyaz: 'beyaz', Gri: 'gri', Sarı: 'sari', Turuncu: 'turuncu', Kırmızı: 'kirmizi', Pembe: 'pembe',
  Mor: 'mor', Mavi: 'mavi', Lacivert: 'lacivert', 'Su yeşili': 'su-yesili', Yeşil: 'yesil', Kahverengi: 'kahverengi', Şeffaf: 'seffaf',
};

export const caseVar = (color) => `var(--case-${CASE_SLUG[color] ?? 'siyah'})`;

// Gövde ölçüleri (viewBox birimi) ve kamera düzeni. SE (2./3. nesil) ile 8 aynı gövdeyi paylaşır.
const BODIES = {
  'iPhone SE (2./3. nesil)': { w: 44, h: 92, rx: 7.5, cam: 'single' },
  'iPhone 8': { w: 44, h: 92, rx: 7.5, cam: 'single' },
  'iPhone 7 Plus': { w: 50, h: 102, rx: 8.5, cam: 'dual' },
  'iPhone 12': { w: 47, h: 97, rx: 5.5, cam: 'island', flat: true },
  Diğer: { w: 46, h: 95, rx: 7.5, cam: 'plain' },
};

const CASE_PAD = 3.6;
let uid = 0;

const n = (v) => Math.round(v * 100) / 100;
const rect = (x, y, w, h, rx, style) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}" style="${style}"/>`;
const circle = (cx, cy, r, style) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" style="${style}"/>`;

function lens(cx, cy, r) {
  return circle(cx, cy, r, 'fill: var(--pa-ring)')
    + circle(cx, cy, r * 0.64, 'fill: var(--pa-lens)')
    + circle(cx - r * 0.22, cy - r * 0.22, r * 0.16, 'fill: rgba(242, 234, 223, 0.2)');
}

const flash = (cx, cy, r = 1.6) => circle(cx, cy, r, 'fill: var(--pa-flash)');

/** Kamera bölgesi: kılıflıysa çevresinde kılıf açıklığı (telefonun koyu camı görünür). */
function camera(kind, x, y, cased) {
  const hole = (hx, hy, hw, hh, hr) => (cased ? rect(x + hx, y + hy, hw, hh, hr, 'fill: var(--pa-glass); stroke: rgba(0, 0, 0, 0.3); stroke-width: 0.6') : '');
  switch (kind) {
    case 'dual': // 7 Plus: yatay hap şeklinde çift kamera çıkıntısı + flaş
      return hole(2.4, 2.4, 29, 13.2, 6.6)
        + rect(x + 4, y + 4, 19.5, 10, 5, 'fill: var(--pa-ring); stroke: rgba(242, 234, 223, 0.14); stroke-width: 0.5')
        + lens(x + 9, y + 9, 3.4) + lens(x + 18.5, y + 9, 3.4)
        + flash(x + 27.4, y + 9);
    case 'island': // 12: kare kamera adası, içinde çapraz iki kamera + flaş
      return hole(2, 2, 22, 22, 6.6)
        + rect(x + 3.5, y + 3.5, 19, 19, 5, 'fill: rgba(242, 234, 223, 0.08); stroke: rgba(0, 0, 0, 0.28); stroke-width: 0.6')
        + lens(x + 9, y + 9, 3.6) + lens(x + 17, y + 17, 3.6)
        + flash(x + 17.2, y + 8.8, 1.5)
        + circle(x + 8.8, y + 17.2, 0.6, 'fill: var(--pa-lens)');
    case 'plain': // Diğer: tek kamera
      return hole(3, 3, 12, 12, 6) + lens(x + 9, y + 9, 4.4);
    default: // SE / 8: sol üstte tek yuvarlak kamera, yanında küçük flaş
      return hole(3, 3, 19, 12, 6) + lens(x + 9, y + 9, 4.4) + flash(x + 17.6, y + 9);
  }
}

/**
 * Telefonun arkasının SVG işaretlemesi.
 * @param {string} model  PHONE_MODELS'ten biri (bilinmeyen → "Diğer")
 * @param {string} color  CASE_COLORS'tan biri; kılıflıysa kılıfın, değilse gövdenin rengi
 * @param {boolean} cased kılıflı mı
 * @param {number} size   genişlik (px); yükseklik oranla
 * @param {string} cls    svg sınıfı
 */
export function phoneArt(model, color, cased = true, size = 44, cls = 'phone-art') {
  const body = BODIES[model] ?? BODIES.Diğer;
  const clear = color === 'Şeffaf';
  const x = (VIEW_W - body.w) / 2;
  const y = (VIEW_H - body.h) / 2;
  const light = `pa-light-${++uid}`;
  const height = n(size * (VIEW_H / VIEW_W));

  let shape = '';
  let top = ''; // üst ışık geçişinin uygulanacağı dış şekil
  if (cased) {
    const cx = x - CASE_PAD;
    const cy = y - CASE_PAD;
    const cw = body.w + CASE_PAD * 2;
    const ch = body.h + CASE_PAD * 2;
    const crx = body.rx + CASE_PAD - (body.flat ? 0.6 : 0);
    // Şeffaf kılıfta altındaki (gümüş) telefon görünür; kılıf yarı saydam bir katman.
    if (clear) shape += rect(x, y, body.w, body.h, body.rx, 'fill: var(--pa-under)');
    shape += rect(cx, cy, cw, ch, crx, `fill: ${caseVar(color)}; stroke: var(--pa-outline); stroke-width: 0.8`);
    // Kılıf dudağı: içte ince bir çizgi, kenarlar yumuşak dursun.
    shape += rect(cx + 1.8, cy + 1.8, cw - 3.6, ch - 3.6, crx - 1.6, `fill: none; stroke: ${clear ? 'rgba(242, 234, 223, 0.22)' : 'rgba(0, 0, 0, 0.16)'}; stroke-width: 0.8`);
    top = rect(cx, cy, cw, ch, crx, `fill: url(#${light})`);
  } else {
    shape += rect(x, y, body.w, body.h, body.rx, `fill: ${clear ? 'var(--pa-under)' : caseVar(color)}; stroke: var(--pa-outline); stroke-width: 0.8`);
    // 12'nin düz kenarları: içte biraz açık bir çerçeve bandı.
    if (body.flat) shape += rect(x + 1, y + 1, body.w - 2, body.h - 2, body.rx - 1, 'fill: none; stroke: rgba(242, 234, 223, 0.16); stroke-width: 1.4');
    top = rect(x, y, body.w, body.h, body.rx, `fill: url(#${light})`);
  }

  return `<svg class="${cls}" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${n(size)}" height="${height}" aria-hidden="true" focusable="false">`
    + `<defs><linearGradient id="${light}" x1="0" y1="0" x2="0" y2="1">`
    + '<stop offset="0" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>'
    + '</linearGradient></defs>'
    + shape + top + camera(body.cam, x, y, cased)
    + '</svg>';
}
