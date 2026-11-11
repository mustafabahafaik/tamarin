// Ödemeler testi: node tests/bills.test.mjs   (proje kökünden; harici kütüphane yok)
// Vade hesabı, gecikme/kalan gün etiketleri, ay sonu kayması, ödendi işaretleme, özet, tutar, kategori.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const St = await import('../js/status.js');
const S = await import('../js/store.js');
const { ymd } = await import('../js/dates.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const day = (s) => new Date(...s.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
const bill = (over = {}) => ({ id: 'b', name: 'Kira', cat: 'Kira', amount: 12500, day: 5, note: '', paid: [], ...over });

await test('vade: seçili ayın günü', () => {
  assert.equal(ymd(St.dueDate(bill(), 2026, 11)), '2026-11-05');
  assert.equal(ymd(St.dueDate(bill({ day: 15 }), 2027, 1)), '2027-01-15');
});

await test('ay sonu kayması: 31 → Şubat 28/29, Nisan 30; 30 → Şubat 28', () => {
  assert.equal(ymd(St.dueDate(bill({ day: 31 }), 2026, 2)), '2026-02-28');
  assert.equal(ymd(St.dueDate(bill({ day: 31 }), 2028, 2)), '2028-02-29');
  assert.equal(ymd(St.dueDate(bill({ day: 31 }), 2026, 4)), '2026-04-30');
  assert.equal(ymd(St.dueDate(bill({ day: 30 }), 2027, 2)), '2027-02-28');
  assert.equal(ymd(St.dueDate(bill({ day: 31 }), 2026, 12)), '2026-12-31');
});

await test('gecikme ve kalan gün etiketleri', () => {
  const today = day('2026-11-08');
  const cases = [
    [5, 'late', '3 gün gecikti'],
    [8, 'today', 'Bugün'],
    [9, 'soon', 'Yarın'],
    [10, 'soon', '2 gün kaldı'],
    [11, 'soon', '3 gün kaldı'],
    [20, 'upcoming', '12 gün kaldı'],
  ];
  for (const [d, state, label] of cases) {
    const r = St.billMonth(bill({ day: d }), 2026, 11, today);
    assert.deepEqual([r.state, r.label], [state, label], `ayın ${d}'i`);
  }
  // Geçmiş ay ödenmediyse gecikmiş, gelecek ay bekliyor
  assert.equal(St.billMonth(bill(), 2026, 10, today).label, '34 gün gecikti');
  assert.equal(St.billMonth(bill(), 2026, 12, today).label, '27 gün kaldı');
});

await test('ödendi işaretleme: ekle/çıkar, sıralı, tekrarsız', () => {
  let paid = [];
  paid = St.togglePaid(paid, '2026-11');
  paid = St.togglePaid(paid, '2026-09');
  assert.deepEqual(paid, ['2026-09', '2026-11']);
  paid = St.togglePaid(paid, '2026-11');
  assert.deepEqual(paid, ['2026-09']);
});

await test('ödendi: "Ödendi" ve sonraki vade (ödenmiş aylar atlanır, yıl geçişi)', () => {
  const today = day('2026-11-20');
  const r = St.billMonth(bill({ paid: ['2026-11'] }), 2026, 11, today);
  assert.equal(r.state, 'paid');
  assert.equal(r.label, 'Ödendi');
  assert.equal(ymd(r.next), '2026-12-05');
  const r2 = St.billMonth(bill({ day: 31, paid: ['2026-11', '2026-12', '2027-01'] }), 2026, 11, today);
  assert.equal(ymd(r2.next), '2027-02-28');
});

await test('ay özeti: toplam/ödenen/kalan, sayaç, sıralama, hepsi ödendi', () => {
  const today = day('2026-11-08');
  const bills = [
    bill({ id: 'k', name: 'Kira', amount: 12500, day: 5 }),
    bill({ id: 'e', name: 'Elektrik', amount: 640.5, day: 13 }),
    bill({ id: 'i', name: 'İnternet', amount: 399, day: 2, paid: ['2026-11'] }),
    bill({ id: 's', name: 'Spotify', amount: 0, day: 1 }),
  ];
  const s = St.monthSummary(bills, 2026, 11, today);
  assert.equal(s.total, 13539.5);
  assert.equal(s.paidAmount, 399);
  assert.equal(s.remaining, 13140.5);
  assert.deepEqual([s.paidCount, s.count, s.allPaid], [1, 4, false]);
  assert.deepEqual(s.rows.map((r) => r.bill.id), ['s', 'k', 'e', 'i']); // ödenmemişler vadeye göre, ödenen sonda
  const all = St.monthSummary(bills.map((b) => ({ ...b, paid: ['2026-11'] })), 2026, 11, today);
  assert.equal(all.allPaid, true);
  assert.equal(St.monthSummary([], 2026, 11, today).allPaid, false);
});

await test('ay kaydırma', () => {
  assert.deepEqual(St.shiftMonth(2026, 12, 1), [2027, 1]);
  assert.deepEqual(St.shiftMonth(2026, 1, -1), [2025, 12]);
  assert.deepEqual(St.shiftMonth(2026, 11, -13), [2025, 10]);
});

await test('tutar: Türkçe yazımlar', () => {
  assert.equal(St.parseAmount('1.250,50'), 1250.5);
  assert.equal(St.parseAmount('1250.5'), 1250.5);
  assert.equal(St.parseAmount('12,5'), 12.5);
  assert.equal(St.parseAmount('1.250'), 1250);
  assert.equal(St.parseAmount('₺ 640'), 640);
  assert.equal(St.parseAmount(''), 0);
  assert.ok(Number.isNaN(St.parseAmount('on iki')));
});

await test('para biçimi: tam sayı kuruşsuz, kuruşlu iki basamak', () => {
  const nb = (s) => s.replace(/\s/g, ' ');
  assert.equal(nb(St.money.format(12500)), '₺12.500');
  assert.equal(nb(St.money.format(1250.5)), '₺1.250,50');
  assert.equal(nb(St.money.format(0)), '₺0');
});

await test('store: işaretleme kaydedilir; gün 1–31 ve ad doğrulanır; eski kategoriler çevrilir', () => {
  S.resetAll();
  const b = S.add('bills', { name: 'Su', cat: 'Su', amount: 180, day: 31 });
  S.update('bills', b.id, { paid: St.togglePaid(b.paid, '2026-11') });
  assert.deepEqual(S.list('bills')[0].paid, ['2026-11']);
  assert.throws(() => S.add('bills', { name: 'X', day: 32 }), /day/);
  assert.throws(() => S.add('bills', { name: '  ', day: 5 }), /name/);
  const legacy = S.add('bills', { name: 'Elektrik faturası', cat: 'Fatura', day: 10 });
  assert.equal(legacy.cat, 'Elektrik');
  assert.equal(S.add('bills', { name: 'Ev', cat: 'Konut', day: 1 }).cat, 'Kira');
  assert.equal(S.add('bills', { name: 'Bir şey', cat: 'Bilinmeyen', day: 1 }).cat, 'Diğer');
});

console.log(`\n${passed} test geçti${process.exitCode ? ', başarısız olan var' : ''}`);
