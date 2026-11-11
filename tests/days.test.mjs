// Özel Günler testi: node tests/days.test.mjs   (proje kökünden; harici kütüphane yok)
// Sonraki gerçekleşme tarihi, yıldönümü, yaş, 29 Şubat, geçersiz tarih, sıralama, gruplar, dilim özeti.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const St = await import('../js/status.js');
const S = await import('../js/store.js');
const D = await import('../js/dates.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const day = (y, m, d) => new Date(y, m - 1, d);       // yerel gece yarısı
const today = day(2026, 11, 11);                       // 11 Kasım 2026 Çarşamba
const at = (hhmm, date = '2026-11-11') => new Date(`${date}T${hhmm}:00+03:00`);
const entry = (id, d, m, extra = {}) => ({ id, name: id, kind: 'Doğum günü', day: d, month: m, year: null, rel: 'Aile', note: '', ...extra });
const ymdOf = (date) => D.ymd(date);

await test('sonraki gerçekleşme: bu yıl geçmediyse bu yıl, geçtiyse seneye; bugün bugündür', () => {
  const [a, b, c] = St.upcomingDays([entry('aralik', 3, 12), entry('ekim', 5, 10), entry('bugun', 11, 11)], today);
  assert.equal(ymdOf(a.date), '2026-11-11');
  assert.equal(a.entry.id, 'bugun');
  assert.equal(a.diff, 0);
  assert.equal(ymdOf(b.date), '2026-12-03');
  assert.equal(b.diff, 22);
  assert.equal(ymdOf(c.date), '2027-10-05'); // 5 Ekim geçti → seneye
});

await test('geri sayım etiketi ve vurgu: Bugün / Yarın / 7 gün (hafif) / 12 gün', () => {
  assert.deepEqual(St.dayCountdown(0), { short: 'Bugün', level: 'today' });
  assert.deepEqual(St.dayCountdown(1), { short: 'Yarın', level: 'tomorrow' });
  assert.deepEqual(St.dayCountdown(7), { short: '7 gün', level: 'week' });
  assert.deepEqual(St.dayCountdown(12), { short: '12 gün', level: 'later' });
});

await test('yaş ve yıldönümü: "25 yaşına giriyor", "3. yıl"; yıl yoksa ya da dolmadıysa boş', () => {
  const [bday] = St.upcomingDays([entry('Ali', 20, 11, { year: 2001 })], today);
  assert.equal(bday.milestone, '25 yaşına giriyor');
  const [passedBday] = St.upcomingDays([entry('Ece', 1, 3, { year: 2001 })], today);
  assert.equal(passedBday.milestone, '26 yaşına giriyor'); // 1 Mart 2027'de
  const [anniv] = St.upcomingDays([entry('Evlilik', 14, 2, { kind: 'Yıldönümü', year: 2024 })], today);
  assert.equal(anniv.milestone, '3. yıl');
  assert.equal(St.dayMilestone(entry('x', 1, 1, { kind: 'Özel gün', year: 2020 }), day(2027, 1, 1)), '');
  assert.equal(St.dayMilestone(entry('x', 1, 1), day(2027, 1, 1)), '');
  assert.equal(St.dayMilestone(entry('x', 20, 12, { year: 2026 }), day(2026, 12, 20)), ''); // 0 yaş gösterilmez
});

await test('29 Şubat: artık olmayan yılda 28 Şubat, artık yılda 29 Şubat', () => {
  const leapling = entry('Deniz', 29, 2, { year: 2004 });
  const [y2027] = St.upcomingDays([leapling], today);
  assert.equal(ymdOf(y2027.date), '2027-02-28');
  assert.equal(y2027.milestone, '23 yaşına giriyor');
  const [y2028] = St.upcomingDays([leapling], day(2027, 3, 1));
  assert.equal(ymdOf(y2028.date), '2028-02-29');
  // 28 Şubat 2027'de "Bugün"
  assert.equal(St.upcomingDays([leapling], day(2027, 2, 28))[0].diff, 0);
});

await test('geçersiz tarih: 30 Şubat, 31 Nisan reddedilir; gelecek yıl ve artık olmayan yılda 29 Şubat da', () => {
  assert.equal(D.annualDateError(30, 2), '30 Şubat diye bir gün yok.');
  assert.equal(D.annualDateError(31, 4), '31 Nisan diye bir gün yok.');
  assert.equal(D.annualDateError(29, 2), null);
  assert.equal(D.annualDateError(29, 2, 2004, { today }), null);
  assert.match(D.annualDateError(29, 2, 2001, { today }), /2001 artık yıl değil/);
  assert.equal(D.annualDateError(5, 5, 2027, { today }), 'Yıl gelecekte olamaz.');
  assert.equal(D.annualDateError(20, 12, 2026, { today }), null);
  assert.equal(D.annualDateError(20, 12, 2026, { today, strictDate: true }), 'Bu tarih henüz gelmedi.');
  assert.equal(D.annualDateError(1, 1, 1850, { today }), 'Yıl 1900 ya da sonrası olmalı.');

  S.resetAll();
  const base = { name: 'Test', kind: 'Doğum günü', rel: 'Aile' };
  assert.throws(() => S.add('days', { ...base, day: 30, month: 2 }));
  assert.throws(() => S.add('days', { ...base, day: 31, month: 4 }));
  assert.throws(() => S.add('days', { ...base, day: 29, month: 2, year: 2001 }));
  assert.throws(() => S.add('days', { ...base, day: 1, month: 1, year: new Date().getFullYear() + 1 }));
  assert.equal(S.add('days', { ...base, day: 29, month: 2, year: 2004 }).day, 29);
  assert.equal(S.add('days', { ...base, day: 29, month: 2 }).year, null);
  assert.equal(S.getState().days.length, 2);
});

await test('sıralama ve gruplar: sonraki tarihe göre, aynı günse ada göre; "Bu ay" + ay başlıkları', () => {
  const list = St.upcomingDays([
    entry('Zeynep', 25, 11), entry('Ayşe', 25, 11), entry('Ocak', 2, 1), entry('Aralık', 1, 12),
    entry('Geçen', 1, 11), entry('Yarın', 12, 11),
  ], today);
  assert.deepEqual(list.map((i) => i.entry.id), ['Yarın', 'Ayşe', 'Zeynep', 'Aralık', 'Ocak', 'Geçen']);
  const { thisMonth, months } = St.groupDays(list, today);
  assert.deepEqual(thisMonth.map((i) => i.entry.id), ['Yarın', 'Ayşe', 'Zeynep']);
  assert.deepEqual(months.map((m) => `${m.title}: ${m.items.map((i) => i.entry.id).join(',')}`),
    ['Aralık: Aralık', 'Ocak 2027: Ocak', 'Kasım 2027: Geçen']);
});

await test('yakınlık filtresi yalnızca o yakınlığı bırakır', () => {
  const list = [entry('Annem', 1, 12), entry('Ali', 2, 12, { rel: 'Arkadaş' }), entry('Can', 3, 12, { rel: 'Arkadaş' })];
  assert.deepEqual(St.upcomingDays(list, today, 'Arkadaş').map((i) => i.entry.id), ['Ali', 'Can']);
  assert.equal(St.upcomingDays(list, today, 'Sevgili').length, 0);
  assert.equal(St.upcomingDays(list, today).length, 3);
});

await test('kutlama yazısı: "Bugün Annemin doğum günü!"', () => {
  assert.equal(St.celebrationText(entry('Annem', 11, 11)), 'Bugün Annemin doğum günü!');
  assert.equal(St.celebrationText(entry('Ali', 11, 11)), "Bugün Ali'nin doğum günü!");
});

await test('ana ekran: pembe dilim özeti, ruh hali, mesaj ve "Bugün" kartı', () => {
  S.resetAll();
  const status = () => St.computeStatus(at('12:00'), S.getState());
  assert.equal(status().summaries.days, 'Ekle');
  S.add('days', { name: 'Ali', kind: 'Doğum günü', day: 25, month: 11, year: 2001, rel: 'Arkadaş' });
  assert.equal(status().summaries.days, '14 gün');
  assert.notEqual(status().mood, 'happy'); // 14 gün sonra: henüz mutlu değil
  const mom = S.add('days', { name: 'Annem', kind: 'Doğum günü', day: 12, month: 11, year: 1972, rel: 'Aile' });
  assert.equal(status().summaries.days, 'Annem yarın');
  assert.equal(status().mood, 'happy');
  assert.equal(status().message, 'Yarın annemin doğum günü');
  assert.ok(status().urgentCats.has('days'));
  const card = St.todayCards(at('12:00'), S.getState()).find((c) => c.cat === 'days');
  assert.equal(card.title, 'Annemin doğum günü');
  assert.equal(card.sub, '54 yaşına giriyor');
  S.update('days', mom.id, { day: 11 });
  assert.equal(status().summaries.days, 'Annem bugün');
  assert.equal(status().message, 'Bugün annemin doğum günü');
  S.add('days', { name: 'Evlilik', kind: 'Yıldönümü', day: 11, month: 11, year: 2023, rel: 'Sevgili' });
  const cards = St.todayCards(at('12:00'), S.getState());
  assert.ok(cards.some((c) => c.cat === 'days'));
});

console.log(`\n${passed} test geçti${process.exitCode ? ', başarısız olan var' : ''}`);
