// Halkanın 4 dilimi "bloklardan örülmüş iglo" gibi: her dilim kavisli taş bloklara bölünür ve bloklar
// açılışta uçup yerine oturur, boşta ara sıra birkaç komşu blok kalkıp sekerek yerine döner, dokununca
// dilim "nefes" alır. Yalnızca SVG + Web Animations API (element.animate); yalnızca transform ve opacity.
//
// Geometri (DOM'suz, Node testlerinde de çalışır): blocksFor(rot, perRow) → bloklar.
//   - Dilim js/face.js'teki yuvarlatılmış çeyrek halkanın birebir şekli: iç/dış yarıçap 96/137, eksenden
//     12.5 boşluk, köşe 8. Radyalde 3 sıra; sıra başına perRow (8; yavaş cihazda 7) blok, orta sıra yarım
//     blok kaydırmalı (uçlarda yarım bloklar). Bloklar arasında JOINT derz, köşeler çok hafif yuvarlak.
//   - Dilimin uçlarındaki bloklar dilimin düz ucunu (eksene paralel çizgi) ve köşe yuvarlamasını izler:
//     blokların birleşimi dilimin şekli olur.
//   - Ton: dilimin degradesindeki yeri (cat-1 → cat-2 → cat-3) + sabit tohumla ±%3.5 açıklık farkı.
//
// Animasyon (createRingBlocks): açılış (oturum başına bir kez), boşta döngü (tek dilimde 3–6 komşu blok;
// acil dilim daha sık), dokunma nefesi, modülden dönüşte girilen dilimin mini dalgası. Hareket halindeki
// blok, aynı şekilli açık tonlu kopyasının opaklığıyla "aydınlanır" (parlama/blur/filter değil).
// Sayfa gizliyken ve yüz kapalıyken zamanlayıcılar durur; prefers-reduced-motion'da hareket yok.

export const R_IN = 96;
export const R_OUT = 137;
export const GAP = 12.5;     // dilim ucunun eksenden uzaklığı (js/face.js ile aynı)
export const CORNER = 8;     // dilimin köşe yuvarlaması
export const ROWS = 3;
export const PER_ROW = 8;    // sıra başına blok (orta sıra: 7 tam + 2 yarım)
export const PER_ROW_LITE = 7;
export const JOINT = 1.25;   // derz (tasarım birimi; ekranda ~1.3–1.7 px)
const SOFT = 1.1;            // blok köşelerinin hafif yuvarlaması
const TONE_SPREAD = 0.035;   // ±%3.5 açıklık

const f = (n) => Math.round(n * 100) / 100;
const DEG = Math.PI / 180;

/* ---------- Tohumlu rastgele ---------- */

/** mulberry32: aynı tohum → aynı dizi. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dizgeden 32 bit tohum (FNV-1a). */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** n bloğun açıklık farkları (−TONE_SPREAD..+TONE_SPREAD), tohuma göre sabit. */
export function tones(seed, n) {
  const next = rng(seed);
  return Array.from({ length: n }, () => f((next() * 2 - 1) * TONE_SPREAD * 1000) / 1000);
}

/* ---------- Geometri ---------- */

const rot2 = ([x, y], deg) => {
  const a = deg * DEG;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

/**
 * Sağ üst dilim yerel koordinatlarda (y aşağı; açı −90° = yukarı, 0° = sağ). r yarıçapında dilimin açı
 * aralığı: üst uç x = GAP çizgisi, sağ uç y = −GAP çizgisi.
 */
const lo = (r) => -Math.PI / 2 + Math.asin(GAP / r);  // üst uç (dikey eksen tarafı)
const hi = (r) => -Math.asin(GAP / r);                // sağ uç (yatay eksen tarafı)

/**
 * Bir bloğun ana hatları: kenarlar 'arc' (merkez 0,0, yarıçap r) ya da 'line'. Köşeler (vertex) için
 * yuvarlama yarıçapı. Saat yönünde: dış yay (a0→a1), sağ kenar, iç yay (a1→a0), sol kenar.
 */
function outline(r0, r1, a0, a1, { startEnd, endEnd, rowIndex }) {
  // Uç bloklarda kenar düz çizgi (eksene paralel), içtekilerde derz kadar daraltılmış radyal çizgi.
  const j = JOINT / 2;
  const outA0 = startEnd ? lo(r1) : a0 + j / r1;
  const inA0 = startEnd ? lo(r0) : a0 + j / r0;
  const outA1 = endEnd ? hi(r1) : a1 - j / r1;
  const inA1 = endEnd ? hi(r0) : a1 - j / r0;
  const isOuter = rowIndex === ROWS - 1;
  const isInner = rowIndex === 0;
  // Dilimin köşeleri: dış sıranın dış köşeleri ve iç sıranın iç köşeleri (uç bloklarda) CORNER.
  const rc = (onEnd, onEdgeRow) => (onEnd && onEdgeRow ? CORNER : SOFT);
  return {
    verts: [
      { p: polar(r1, outA0), r: rc(startEnd, isOuter) },  // sol üst (dış)
      { p: polar(r1, outA1), r: rc(endEnd, isOuter) },    // sağ üst (dış)
      { p: polar(r0, inA1), r: rc(endEnd, isInner) },     // sağ alt (iç)
      { p: polar(r0, inA0), r: rc(startEnd, isInner) },   // sol alt (iç)
    ],
    // kenar i: verts[i] → verts[i+1]
    edges: [
      { kind: 'arc', r: r1, sweep: 1 },
      { kind: 'line' },
      { kind: 'arc', r: r0, sweep: 0 },
      { kind: 'line' },
    ],
    arcs: { outer: [r1, outA0, outA1], inner: [r0, inA0, inA1] },
  };
}

/** Kenar boyunca köşeden d uzaklıktaki nokta (yay için açısal, çizgi için doğrusal). */
function along(edge, from, to, d, atStart) {
  if (edge.kind === 'line') {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const t = Math.min(0.45, d / len);
    return atStart ? [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
      : [to[0] + (from[0] - to[0]) * t, to[1] + (from[1] - to[1]) * t];
  }
  const a0 = Math.atan2(from[1], from[0]);
  const a1 = Math.atan2(to[1], to[0]);
  const span = a1 - a0;
  const da = Math.sign(span) * Math.min(Math.abs(span) * 0.45, d / edge.r);
  return atStart ? polar(edge.r, a0 + da) : polar(edge.r, a1 - da);
}

const fmt = (pt, deg) => { const [x, y] = rot2(pt, deg); return `${f(x)} ${f(y)}`; };

/** Ana hattı köşeleri yuvarlatılmış SVG yoluna çevirir (yaylar A, köşeler Q); noktalar deg kadar döndürülür. */
function pathOf({ verts, edges }, deg) {
  const n = verts.length;
  const pts = verts.map((v, i) => {
    const prevEdge = edges[(i - 1 + n) % n];
    const nextEdge = edges[i];
    const prev = verts[(i - 1 + n) % n].p;
    const next = verts[(i + 1) % n].p;
    return { v: v.p, inPt: along(prevEdge, prev, v.p, v.r, false), outPt: along(nextEdge, v.p, next, v.r, true) };
  });
  let d = `M ${fmt(pts[0].outPt, deg)}`;
  for (let i = 0; i < n; i++) {
    const e = edges[i];
    const nx = pts[(i + 1) % n];
    d += e.kind === 'arc' ? ` A ${f(e.r)} ${f(e.r)} 0 0 ${e.sweep} ${fmt(nx.inPt, deg)}` : ` L ${fmt(nx.inPt, deg)}`;
    d += ` Q ${fmt(nx.v, deg)} ${fmt(nx.outPt, deg)}`;
  }
  return `${d} Z`;
}

/** Yay parçası (kabartma kenarı için), köşelerden biraz içeride; deg kadar döndürülmüş. */
function arcPath([r, a0, a1], inset, deg) {
  const da = inset / r;
  return `M ${fmt(polar(r, a0 + da), deg)} A ${f(r)} ${f(r)} 0 0 1 ${fmt(polar(r, a1 - da), deg)}`;
}

/**
 * Bir dilimin blokları. rot: dilimin dönüşü (face.js SLICES: bills 270, school 0, tasks 90, days 180).
 * Dönen her blok: { row, k, index, r0, r1, a0, a1 (yerel açı), d (yol), top/bottom (kabartma kenarları),
 *   cx, cy (merkez), dir [x,y] (dışa doğru birim vektör), tone (−0.035..0.035), t (degradedeki yeri 0..1), end }
 */
export function blocksFor(rot, perRow = PER_ROW, { seed = 1, from = [-1, 0], to = [1, 0] } = {}) {
  const thick = (R_OUT - R_IN) / ROWS;
  const list = [];
  for (let row = 0; row < ROWS; row++) {
    const r0 = R_IN + row * thick + (row > 0 ? JOINT / 2 : 0);
    const r1 = R_IN + (row + 1) * thick - (row < ROWS - 1 ? JOINT / 2 : 0);
    const rm = (r0 + r1) / 2;
    const span = hi(rm) - lo(rm);
    // Orta sıra yarım blok kaydırmalı: sınırlar (k + 0.5) / perRow, uçlarda yarım bloklar.
    const shift = row % 2 === 1 ? 0.5 : 0;
    const cuts = [0];
    for (let k = 1; k <= perRow; k++) {
      const c = (k - shift) / perRow;
      if (c > 0 && c < 1) cuts.push(c);
    }
    cuts.push(1);
    for (let k = 0; k < cuts.length - 1; k++) {
      const a0 = lo(rm) + cuts[k] * span;
      const a1 = lo(rm) + cuts[k + 1] * span;
      const startEnd = k === 0;
      const endEnd = k === cuts.length - 2;
      const o = outline(r0, r1, a0, a1, { startEnd, endEnd, rowIndex: row });
      const am = (a0 + a1) / 2;
      list.push({ row, k, r0, r1, a0, a1, am, rm, end: startEnd || endEnd, outline: o });
    }
  }
  const tone = tones(seed, list.length);
  return list.map((b, index) => {
    const local = polar(b.rm, b.am);
    const [cx, cy] = rot2(local, rot);
    const dir = [cx / Math.hypot(cx, cy), cy / Math.hypot(cx, cy)];
    // Kabartma: ışık yukarıdan. Üst yarıdaki dilimde dış yay "üst kenar", alt yarıda iç yay.
    const upper = cy < 0;
    const outer = arcPath(b.outline.arcs.outer, 2.2, rot);
    const inner = arcPath(b.outline.arcs.inner, 2.2, rot);
    // Degradedeki yer (face.js'teki doğrusal degradenin iki ucuna izdüşüm).
    const gx = to[0] - from[0];
    const gy = to[1] - from[1];
    const t = Math.min(1, Math.max(0, ((cx - from[0]) * gx + (cy - from[1]) * gy) / (gx * gx + gy * gy)));
    return {
      row: b.row, k: b.k, index, end: b.end, r0: b.r0, r1: b.r1, a0: b.a0, a1: b.a1,
      d: pathOf(b.outline, rot),
      top: upper ? outer : inner,
      bottom: upper ? inner : outer,
      cx: f(cx), cy: f(cy), dir, tone: tone[index], t: f(t),
      verts: b.outline.verts.map((v) => rot2(v.p, rot)),
    };
  });
}

/** Bloğun dolgu rengi: degrade (cat-1 → cat-2 → cat-3) + açıklık farkı; hepsi CSS değişkeniyle. */
export function blockFill(t, tone) {
  const base = t < 0.45
    ? `color-mix(in srgb, var(--cat-2) ${f((t / 0.45) * 100)}%, var(--cat-1))`
    : `color-mix(in srgb, var(--cat-3) ${f(((t - 0.45) / 0.55) * 100)}%, var(--cat-2))`;
  if (!tone) return base;
  return `color-mix(in srgb, ${tone > 0 ? '#fff' : '#000'} ${f(Math.abs(tone) * 100)}%, ${base})`;
}

/** Bir dilimin blok katmanı (SVG işaretlemesi). Her blok: dolgu, aydınlanma örtüsü, iki kabartma kenarı. */
export function blocksMarkup(blocks) {
  return `<g class="blk-wrap">${blocks.map((b) => `<g class="blk" data-i="${b.index}">`
    + `<path class="blk-face" d="${b.d}" style="fill: ${blockFill(b.t, b.tone)}"/>`
    + `<path class="blk-top" d="${b.top}"/><path class="blk-bottom" d="${b.bottom}"/>`
    + `<path class="blk-lit" d="${b.d}"/></g>`).join('')}</g>`;
}

/* ---------- Animasyon ---------- */

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_SETTLE = 'cubic-bezier(0.33, 0, 0.25, 1)';
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const between = (r, a, b) => a + r() * (b - a);

let introDone = false;     // açılış oturum başına bir kez
let lastEntered = null;    // dokunulup girilen dilim: yüze dönüşte mini dalga
let active = null;         // ekrandaki denetleyici (önizleme / ekran görüntüsü için activeRing())

/**
 * Halka denetleyicisi.
 *   const ctl = createRingBlocks({ layers: [{ id, el, blocks, href }], isUrgent: (id) => bool, onLite })
 *   ctl.start()  (ekran takılınca; açılış ya da dönüş dalgası + boşta döngü)
 *   ctl.pause() / ctl.resume()  (sayfa gizlenince / görünür olunca)
 *   ctl.destroy() (ekran kapanınca: tüm animasyonlar iptal, zamanlayıcılar durur)
 * layers[i].el: dilimin <svg>'si; içinde .blk grupları (blocksMarkup) ve .slice-link.
 */
export function createRingBlocks({ layers, isUrgent = () => false, unit = 1, onLite = () => {} }) {
  const running = new Set();
  let idleTimer = 0;
  let paused = false;
  let destroyed = false;
  const R = rng(seedOf(`idle-${Date.now()}`)); // boşta döngü her açılışta farklı; tonlar sabit
  const px = (v) => v / (typeof unit === 'function' ? unit() : unit); // CSS pikseli → SVG birimi

  const groups = new Map(layers.map((L) => [L.id, [...L.el.querySelectorAll('.blk')].map((g) => ({
    g, lit: g.querySelector('.blk-lit'), b: L.blocks[Number(g.dataset.i)],
  }))]));

  // Açılış oynayacaksa bloklar ilk karede görünmesin (ekran belirirken yerlerinde bir an görünüp dağılmasın).
  const willIntro = !introDone && !reduced();
  if (willIntro) for (const list of groups.values()) for (const { g } of list) g.style.opacity = '0';

  function play(el, frames, options) {
    const anim = el.animate(frames, options);
    running.add(anim);
    const done = () => running.delete(anim);
    anim.finished.then(done, done);
    return anim;
  }

  /** Aydınlanma örtüsü: aynı şekilli açık kopyanın opaklığı (0 → peak → 0). */
  function light(lit, peak, duration, delay, at = 0.4) {
    return play(lit, [{ opacity: 0 }, { opacity: peak, offset: at }, { opacity: 0 }], { duration, delay, easing: 'ease-in-out', fill: 'none' });
  }

  /* --- Açılış: dilim dilim (sol üst → sağ üst → sağ alt → sol alt), her dilimde içten dışa, uçtan uca --- */
  function intro() {
    const order = ['bills', 'school', 'tasks', 'days'];
    let last = null;
    order.forEach((id, s) => {
      const list = groups.get(id) ?? [];
      // Dalga sırası: sıra (içten dışa) ağırlıklı, sonra açısal konum (bir uçtan diğerine).
      const seq = [...list].sort((p, q) => (p.b.row * 2.2 + p.b.k) - (q.b.row * 2.2 + q.b.k));
      seq.forEach(({ g, lit, b }, n) => {
        const delay = s * 140 + n * 22;
        const duration = 520 + ((b.index * 37) % 180); // 520–700 ms
        const far = 70 + between(R, 0, 50);
        const side = between(R, -18, 18);
        const spin = between(R, -55, 55);
        const tx = b.dir[0] * far - b.dir[1] * side;
        const ty = b.dir[1] * far + b.dir[0] * side - 14;
        const ox = -b.dir[0] * 1.6;
        const oy = -b.dir[1] * 1.6; // hafif aşma: içeri doğru 1.6 birim, sonra oturma
        last = play(g, [
          { transform: `translate(${f(tx)}px, ${f(ty)}px) rotate(${f(spin)}deg) scale(0.72)`, opacity: 0, easing: EASE_OUT },
          { transform: `translate(${f(ox)}px, ${f(oy)}px) rotate(${f(-spin * 0.02)}deg) scale(1.012)`, opacity: 1, offset: 0.78, easing: EASE_SETTLE },
          { transform: 'none', opacity: 1 },
        ], { duration, delay, fill: 'backwards' });
        light(lit, 0.55, duration, delay, 0.45);
        g.style.opacity = ''; // artık animasyonun ilk karesi (fill: backwards) saydamlığı tutuyor
      });
    });
    return last;
  }

  /* --- Yüze dönüş: girilen dilimin blokları hızlı bir mini dalgayla yerine oturur (≤ 500 ms) --- */
  function settle(id) {
    const list = groups.get(id) ?? [];
    list.forEach(({ g, lit, b }) => {
      const delay = (b.row * 2.2 + b.k) * 9;
      play(g, [
        { transform: `translate(${f(b.dir[0] * px(7))}px, ${f(b.dir[1] * px(7))}px) scale(0.96)`, opacity: 0.4, easing: EASE_OUT },
        { transform: 'none', opacity: 1 },
      ], { duration: 320, delay, fill: 'backwards' });
      light(lit, 0.35, 320, delay);
    });
  }

  /* --- Boşta döngü: tek dilimde 3–6 komşu blok kalkar, havada asılı kalır, sekerek oturur --- */
  function lift(id) {
    const list = groups.get(id) ?? [];
    if (!list.length) return;
    const count = 3 + Math.floor(R() * 4);           // 3–6
    const start = list[Math.floor(R() * list.length)];
    // Komşular: aynı sırada yanındakiler, sığmazsa komşu sıraya taşar (dalga gibi yayılır).
    const near = [...list].sort((p, q) => dist(start.b, p.b) - dist(start.b, q.b)).slice(0, count);
    near.forEach(({ g, lit, b }, n) => {
      const out = px(between(R, 6, 10));
      const up = px(between(R, 3, 5));
      const spin = between(R, 4, 10) * (R() < 0.5 ? -1 : 1);
      const sx = between(R, 0.92, 1.04);
      const sy = between(R, 0.94, 1.03);
      const hang = between(R, 350, 450);
      const rise = 300;
      const fall = 460;
      const duration = rise + hang + fall;
      const tx = f(b.dir[0] * out);
      const ty = f(b.dir[1] * out - up);
      play(g, [
        { transform: 'none', easing: EASE_OUT },
        { transform: `translate(${tx}px, ${ty}px) rotate(${f(spin)}deg) scale(${f(sx)}, ${f(sy)})`, offset: rise / duration, easing: 'ease-in-out' },
        { transform: `translate(${tx}px, ${f(ty - px(0.6))}px) rotate(${f(spin * 0.85)}deg) scale(${f(sx * 1.01)}, ${f(sy)})`, offset: (rise + hang) / duration, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
        { transform: `translate(${f(-b.dir[0] * px(0.8))}px, ${f(-b.dir[1] * px(0.8))}px) scale(1.01, 0.985)`, offset: (rise + hang + fall * 0.62) / duration, easing: 'ease-out' },
        { transform: 'none' },
      ], { duration, delay: n * 110 });
      light(lit, 0.45, duration, n * 110, 0.35);
    });
  }

  const dist = (p, q) => Math.abs(p.row - q.row) * 1.6 + Math.abs((p.k - (p.row % 2) * 0.5) - (q.k - (q.row % 2) * 0.5));

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (paused || destroyed || reduced()) return;
    const urgent = layers.filter((L) => isUrgent(L.id));
    const wait = urgent.length ? between(R, 3000, 5000) : between(R, 6000, 9000);
    idleTimer = setTimeout(() => {
      if (paused || destroyed) return;
      const pool = urgent.length && R() < 0.7 ? urgent : layers;
      lift(pool[Math.floor(R() * pool.length)].id);
      scheduleIdle();
    }, wait);
  }

  /* --- Dokunma: dilimin blokları kısa bir dalgayla dışa doğru "nefes" alır (~260 ms), sonra modül açılır --- */
  function breathe(id) {
    const list = groups.get(id) ?? [];
    let longest = 0;
    if (reduced()) {
      const wrap = layers.find((L) => L.id === id)?.el.querySelector('.blk-wrap');
      if (wrap) play(wrap, [{ opacity: 1 }, { opacity: 0.7 }, { opacity: 1 }], { duration: 160 });
      return 160;
    }
    list.forEach(({ g, lit, b }) => {
      const delay = (b.row * 2.2 + b.k) * 5;
      const o = px(between(R, 4, 6));
      play(g, [
        { transform: 'none', easing: EASE_OUT },
        { transform: `translate(${f(b.dir[0] * o)}px, ${f(b.dir[1] * o)}px)`, offset: 0.45, easing: 'ease-in-out' },
        { transform: 'none' },
      ], { duration: 200, delay });
      light(lit, 0.3, 200, delay);
      longest = Math.max(longest, delay + 200);
    });
    return longest;
  }

  // Dilim bağlantısı: önce nefes, sonra modül (aynı adres). Klavyeyle de aynı.
  for (const L of layers) {
    const link = L.el.querySelector('.slice-link');
    link?.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      lastEntered = L.id;
      const wait = breathe(L.id);
      setTimeout(() => { location.hash = L.href; }, Math.min(wait, 280));
    });
  }

  /** Kare süresi izleme (yalnızca açılışta, sayfa görünürken): kare düşüyorsa onLite() (sıra başına 7 blok). */
  function watchFrames(until) {
    if (!globalThis.requestAnimationFrame || document.visibilityState !== 'visible') return;
    const gaps = [];
    let prev = 0;
    const step = (now) => {
      if (destroyed || document.visibilityState !== 'visible') return;
      if (prev) {
        const dt = now - prev;
        if (dt < 250) gaps.push(dt); // önizleme/arka plan duraklaması sayılmaz
      }
      prev = now;
      if (now < until) requestAnimationFrame(step);
      else if (gaps.length > 20) {
        const slow = gaps.filter((g) => g > 24).length / gaps.length;
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        if (slow > 0.25 || mean > 21) onLite();
      }
    };
    requestAnimationFrame(step);
  }

  const api = {
    start() {
      if (destroyed) return;
      if (!reduced()) {
        if (!introDone) {
          introDone = true;
          intro();
          watchFrames(performance.now() + 1700);
        } else if (lastEntered) {
          settle(lastEntered);
        }
      } else {
        introDone = true;
      }
      lastEntered = null;
      scheduleIdle();
    },
    pause() { paused = true; clearTimeout(idleTimer); },
    resume() { if (destroyed) return; paused = false; scheduleIdle(); },
    destroy() {
      destroyed = true;
      if (active === api) active = null;
      clearTimeout(idleTimer);
      for (const anim of running) anim.cancel();
      running.clear();
    },
    /** Önizleme/ekran görüntüsü için: bir dilimde boşta döngüyü hemen başlat. */
    liftNow(id) { lift(id); },
    get introPlayed() { return introDone; },
  };
  active = api;
  return api;
}

/** Ekrandaki halka denetleyicisi (yoksa null). Yalnızca önizleme ve ekran görüntüsü araçları için. */
export function activeRing() {
  return active;
}

/** Testler ve önizleme için oturum durumunu sıfırlar. */
export function resetSession() {
  introDone = false;
  lastEntered = null;
}
