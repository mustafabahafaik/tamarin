// Halka blokları testi: node tests/ring-blocks.test.mjs   (proje kökünden; harici kütüphane yok)
// Blok sayısı, her bloğun dilim yayının sınırları içinde kalması, aynı tohumla aynı ton dağılımı, malzeme kuralları.
import assert from 'node:assert/strict';

const B = await import('../js/ring-blocks.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

// face.js'teki dilimler: dönüş ve degradenin iki ucu.
const SLICES = {
  bills: { rot: 270, from: [-118, -14], to: [-14, -118] },
  school: { rot: 0, from: [14, -118], to: [118, -14] },
  tasks: { rot: 90, from: [118, 14], to: [14, 118] },
  days: { rot: 180, from: [-118, 14], to: [-14, 118] },
};
const all = (perRow) => Object.entries(SLICES).map(([id, s]) => B.blocksFor(s.rot, perRow, { seed: B.seedOf(id), from: s.from, to: s.to }));

/** SVG yolundaki tüm noktalar (M/L uçları, Q'nun kontrol ve uç noktası, A'nın uç noktası; yarıçap ve bayraklar hariç). */
function points(d) {
  const tokens = d.match(/[MLQAZ]|-?\d+(?:\.\d+)?/g);
  const pts = [];
  for (let i = 0; i < tokens.length;) {
    const cmd = tokens[i++];
    const num = () => Number(tokens[i++]);
    if (cmd === 'M' || cmd === 'L') pts.push([num(), num()]);
    else if (cmd === 'Q') { pts.push([num(), num()]); pts.push([num(), num()]); }
    else if (cmd === 'A') { i += 5; pts.push([num(), num()]); }
  }
  return pts;
}

const unrotate = ([x, y], deg) => {
  const a = (-deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

await test('blok sayısı: dilim başına 25 (8 + 9 + 8; orta sıra yarım kaydırmalı), toplam 100; hafif mod 22 / 88', () => {
  const full = all(B.PER_ROW);
  assert.deepEqual(full.map((l) => l.length), [25, 25, 25, 25]);
  assert.deepEqual([0, 1, 2].map((row) => full[0].filter((b) => b.row === row).length), [8, 9, 8]);
  const lite = all(B.PER_ROW_LITE);
  assert.deepEqual(lite.map((l) => l.length), [22, 22, 22, 22]);
  assert.equal(B.ROWS, 3);
});

await test('her blok dilimin yay sınırları içinde: R_IN..R_OUT arası, iki uçta eksenden en az GAP uzakta', () => {
  const eps = 0.06;
  for (const [id, list] of Object.entries(SLICES).map(([id], i) => [id, all(B.PER_ROW)[i]])) {
    const rot = SLICES[id].rot;
    for (const b of list) {
      for (const p of [...points(b.d), ...points(b.top), ...points(b.bottom)]) {
        const [x, y] = unrotate(p, rot); // sağ üst dilimin yerel koordinatı (y aşağı)
        const r = Math.hypot(x, y);
        // Q kontrol noktaları köşede, yayın dışına çok az taşabilir: köşe noktası hâlâ halka bandında olmalı.
        assert.ok(r >= B.R_IN - eps && r <= B.R_OUT + 1.2, `${id}#${b.index} r=${r.toFixed(2)}`);
        assert.ok(x >= B.GAP - eps, `${id}#${b.index} x=${x.toFixed(2)}`);
        assert.ok(y <= -B.GAP + eps, `${id}#${b.index} y=${y.toFixed(2)}`);
      }
      // Yolun uç noktaları (Q kontrol noktası değil) halkanın kendisinde.
      for (const v of b.verts) {
        const r = Math.hypot(...v);
        assert.ok(r >= B.R_IN - eps && r <= B.R_OUT + eps, `${id}#${b.index} köşe r=${r.toFixed(2)}`);
      }
      assert.ok(b.r0 >= B.R_IN - eps && b.r1 <= B.R_OUT + eps && b.r1 > b.r0);
      const len = Math.hypot(...b.dir);
      assert.ok(Math.abs(len - 1) < 1e-9);
    }
  }
});

await test('bloklar üst üste binmez: aynı sırada açı aralıkları ayrık, sıralar arasında derz', () => {
  for (const list of all(B.PER_ROW)) {
    for (const row of [0, 1, 2]) {
      const r = list.filter((b) => b.row === row).sort((p, q) => p.a0 - q.a0);
      for (let i = 1; i < r.length; i++) assert.ok(r[i].a0 >= r[i - 1].a1 - 1e-9);
    }
    const rows = [0, 1, 2].map((row) => list.find((b) => b.row === row));
    assert.ok(rows[1].r0 - rows[0].r1 >= B.JOINT - 1e-9);
    assert.ok(rows[2].r0 - rows[1].r1 >= B.JOINT - 1e-9);
  }
});

await test('ton: aynı tohum → aynı dağılım (her açılışta aynı), farklı tohum → farklı; hepsi ±%3.5 içinde', () => {
  const a = B.tones(B.seedOf('bills'), 25);
  const b = B.tones(B.seedOf('bills'), 25);
  const c = B.tones(B.seedOf('school'), 25);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every((t) => Math.abs(t) <= 0.035));
  assert.ok(new Set(a).size > 20); // gerçekten dağılmış
  const again = all(B.PER_ROW);
  assert.deepEqual(all(B.PER_ROW).map((l) => l.map((x) => [x.d, x.tone])), again.map((l) => l.map((x) => [x.d, x.tone])));
});

await test('malzeme: dolgu CSS değişkeni + color-mix; aydınlanma örtüsü var; filter/blur/gölge yok', () => {
  const list = all(B.PER_ROW)[0];
  const markup = B.blocksMarkup(list);
  assert.equal((markup.match(/class="blk"/g) ?? []).length, 25);
  assert.equal((markup.match(/class="blk-lit"/g) ?? []).length, 25);
  assert.match(B.blockFill(0.2, 0.02), /var\(--cat-1\)/);
  assert.match(B.blockFill(0.8, -0.02), /var\(--cat-3\).*|color-mix\(in srgb, #000/);
  assert.ok(!/filter|blur|shadow/i.test(markup));
  // Degrade: t 0 → cat-1 ağırlıklı, 1 → cat-3.
  assert.match(B.blockFill(0, 0), /var\(--cat-2\) 0%, var\(--cat-1\)/);
  assert.match(B.blockFill(1, 0), /var\(--cat-3\) 100%, var\(--cat-2\)/);
});

await test('tohumlu rastgele: mulberry32 aynı tohumla aynı dizi, 0..1 aralığında', () => {
  const r1 = B.rng(42);
  const r2 = B.rng(42);
  const xs = Array.from({ length: 50 }, () => r1());
  assert.deepEqual(xs, Array.from({ length: 50 }, () => r2()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

console.log(`\n${passed} test geçti${process.exitCode ? ', bazıları başarısız' : ''}.`);
