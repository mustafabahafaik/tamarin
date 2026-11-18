// Telefonlar testi: node tests/phones.test.mjs   (proje kökünden; harici kütüphane yok)
// Numara temizleme/biçimlendirme, PIN (baştaki 0), model/renk doğrulama, ek bilgi sınırları,
// doğal sıralama, yedekten geri yükleme, çizim. Tüm numara ve PIN'ler uydurmadır.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../js/store.js');
const St = await import('../js/status.js');
const A = await import('../js/phone-art.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const phone = (extra = {}) => ({ name: 'deneme', number: '0555 000 00 01', pin: '0000', model: 'iPhone 12', color: 'Mavi', ...extra });

await test('numara: boşluklu/tireli/parantezli giriş rakama çevrilir; +90 baştaki 0 olur; boş olabilir', () => {
  assert.equal(S.phoneDigits('0555 000 00 01'), '05550000001');
  assert.equal(S.phoneDigits('0555-000-00-01'), '05550000001');
  assert.equal(S.phoneDigits('(0555) 000.00.01'), '05550000001');
  assert.equal(S.phoneDigits('+90 555 000 00 01'), '05550000001');
  assert.equal(S.phoneDigits('555 000 00 01'), '5550000001'); // 10 hane
  assert.equal(S.phoneDigits(''), '');
  assert.equal(S.phoneDigits('   '), '');
  assert.equal(S.phoneDigits(undefined), '');
  assert.equal(S.add('phones', phone({ number: '0555-000-00-02' })).number, '05550000002');
  assert.equal(S.add('phones', phone({ number: '' })).number, '');
});

await test('numara biçimi: "0555 000 00 01", 10 hanede "555 000 00 01"', () => {
  assert.equal(St.formatPhone('05550000001'), '0555 000 00 01');
  assert.equal(St.formatPhone('5550000001'), '555 000 00 01');
  assert.equal(St.formatPhone(''), '');
});

await test('geçersiz numara reddedilir: kısa, uzun, harfli, sayı türü', () => {
  for (const bad of ['0555 12', '055500000012', '0555 000 00 0a', '+1 555 000 0001']) {
    assert.equal(S.phoneDigits(bad), null, bad);
    assert.throws(() => S.add('phones', phone({ number: bad })), /number/);
  }
  assert.throws(() => S.add('phones', phone({ number: 5550000001 })), /number/);
});

await test('PIN: metin olarak saklanır, baştaki 0 korunur; 4–8 rakam; boş olabilir', () => {
  assert.equal(S.add('phones', phone({ pin: '0042' })).pin, '0042');
  assert.equal(S.add('phones', phone({ pin: '00000000' })).pin, '00000000');
  assert.equal(S.add('phones', phone({ pin: '' })).pin, '');
  assert.equal(S.add('phones', phone({ pin: undefined })).pin, '');
  const saved = JSON.parse(mem.get('tamarin.v1')).phones.find((p) => p.pin === '0042');
  assert.equal(saved.pin, '0042'); // kayıtta da metin
});

await test('geçersiz PIN reddedilir: kısa, uzun, harfli, sayı türü; hata mesajı PIN\'i içermez', () => {
  for (const bad of ['123', '123456789', '12a4', '12 34']) {
    assert.throws(() => S.add('phones', phone({ pin: bad })), (err) => /pin/.test(err.message) && !err.message.includes(bad));
  }
  assert.throws(() => S.add('phones', phone({ pin: 42 })), /pin/); // sayıya çevrilmiş PIN (baştaki 0 kaybolmuş olabilir)
});

await test('model ve renk: listeden biri; boşsa Diğer / Siyah; kılıf varsayılan true', () => {
  const p = S.add('phones', { name: 'sade' });
  assert.equal(p.model, 'Diğer');
  assert.equal(p.color, 'Siyah');
  assert.equal(p.cased, true);
  assert.equal(S.add('phones', phone({ cased: false })).cased, false);
  for (const model of S.PHONE_MODELS) assert.equal(S.add('phones', phone({ model })).model, model);
  for (const color of S.CASE_COLORS) assert.equal(S.add('phones', phone({ color })).color, color);
  assert.throws(() => S.add('phones', phone({ model: 'iPhone 15' })), /model/);
  assert.throws(() => S.add('phones', phone({ color: 'Neon yeşil' })), /color/);
  assert.throws(() => S.add('phones', phone({ cased: 'evet' })), /cased/);
  assert.throws(() => S.add('phones', phone({ name: '  ' })), /name/);
  assert.equal(S.add('phones', phone({ name: 'x'.repeat(60) })).name.length, 40);
});

await test('ek bilgiler: boş satırlar atılır, etiket 40 / değer 200 karakter, en fazla 20 satır', () => {
  const p = S.add('phones', phone({
    extra: [{ label: 'Operatör', value: 'Hayal GSM' }, { label: ' ', value: '' }, { label: '', value: 'yalnız değer' }, { label: 'L'.repeat(50), value: 'V'.repeat(250) }],
  }));
  assert.equal(p.extra.length, 3);
  assert.deepEqual(p.extra[0], { label: 'Operatör', value: 'Hayal GSM' });
  assert.equal(p.extra[2].label.length, 40);
  assert.equal(p.extra[2].value.length, 200);
  const twenty = Array.from({ length: 20 }, (_, i) => ({ label: `E${i}`, value: String(i) }));
  assert.equal(S.add('phones', phone({ extra: [...twenty, { label: '', value: '' }] })).extra.length, 20);
  assert.throws(() => S.add('phones', phone({ extra: [...twenty, { label: 'E20', value: '20' }] })), /extra/);
  assert.throws(() => S.add('phones', phone({ extra: 'Operatör: X' })), /extra/);
  assert.throws(() => S.add('phones', phone({ extra: [null] })), /extra/);
  assert.deepEqual(S.add('phones', phone({ extra: undefined })).extra, []);
});

await test('doğal sıralama: faik2 < faik10, büyük/küçük harf fark etmez', () => {
  const names = ['faik10', 'Faik2', 'faik1', 'İş', 'ana', 'faik3'];
  const sorted = St.sortPhones(names.map((name, i) => ({ name, number: String(i) }))).map((p) => p.name);
  assert.deepEqual(sorted, ['ana', 'faik1', 'Faik2', 'faik3', 'faik10', 'İş']);
  assert.equal(St.MODEL_SHORT['iPhone SE (2./3. nesil)'], 'SE');
  assert.equal(St.MODEL_SHORT['iPhone 7 Plus'], '7 Plus');
});

await test('yeni tür: VERSION değişmez; eski kayıtta phones yoksa tohum telefonlar bir kez eklenir, diğer kayıtlar kalır', async () => {
  const { PHONE_SEED, SEED_VERSION } = await import('../js/phones-seed.js');
  const bill = { id: 'b1', name: 'Kira', cat: 'Kira', amount: 100, day: 1, note: '', paid: [] };
  mem.set('tamarin.v1', JSON.stringify({ version: 2, name: 'Deneme', bills: [bill], classes: [], exams: [], days: [], tasks: [] }));
  const old = await import(`../js/store.js?eski=${Date.now()}`);
  assert.equal(old.getState().phones.length, PHONE_SEED.length);
  assert.equal(old.getState().bills.length, 1);
  assert.equal(old.getState().phoneSeed, SEED_VERSION);
  for (const seed of PHONE_SEED) {
    assert.equal(old.getState().phones.find((p) => p.number === seed.number).pin, seed.pin); // metin, baştaki 0 dahil
  }
  assert.equal(old.exportData().version, 2);

  // Yeniden açılış: tekrar eklenmez; silinen telefon geri gelmez.
  old.remove('phones', old.getState().phones[0].id);
  const again = await import(`../js/store.js?tekrar=${Date.now()}`);
  assert.equal(again.getState().phones.length, PHONE_SEED.length - 1);

  // Aynı numara elle eklenmişse tohum onu ikinci kez eklemez.
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phones: [{ name: 'elle', number: PHONE_SEED[0].number }] }));
  const manual = await import(`../js/store.js?elle=${Date.now()}`);
  assert.equal(manual.getState().phones.length, PHONE_SEED.length);
  assert.equal(manual.getState().phones.filter((p) => p.number === PHONE_SEED[0].number).length, 1);

  // İlk açılış: örnekler + tohum telefonlar; "Tüm verileri sil" telefonları geri getirmez.
  mem.delete('tamarin.v1');
  const first = await import(`../js/store.js?ilk=${Date.now()}`);
  assert.ok(first.countExamples() > 0);
  assert.equal(first.getState().phones.length, PHONE_SEED.length);
  first.resetAll();
  const afterReset = await import(`../js/store.js?sifir=${Date.now()}`);
  assert.equal(afterReset.getState().phones.length, 0);
});

await test('tohum güncellemesi: boş PIN doldurulur, elle girilen PIN ve silinen telefon korunur', async () => {
  const { PHONE_SEED, SEED_VERSION } = await import('../js/phones-seed.js');
  const [a, b, c] = PHONE_SEED;
  // Önceki sürümden kalan durum: tohum telefonlar PIN'siz eklenmiş, biri elle PIN almış, biri silinmiş.
  mem.set('tamarin.v1', JSON.stringify({
    version: 2,
    phoneSeed: SEED_VERSION - 1,
    phones: [
      { name: a.name, number: a.number, pin: '' },
      { name: b.name, number: b.number, pin: '9999' },
    ],
  }));
  const up = await import(`../js/store.js?guncelle=${Date.now()}`);
  const phones = up.getState().phones;
  const newer = PHONE_SEED.filter((x) => x.since > SEED_VERSION - 1).length; // bu sürümde gelen yeni telefonlar
  assert.equal(phones.length, 2 + newer); // c silinmişti: geri gelmez
  assert.equal(phones.find((p) => p.number === a.number).pin, a.pin);
  assert.equal(phones.find((p) => p.number === b.number).pin, '9999');
  assert.ok(!phones.some((p) => p.number === c.number));
  assert.equal(up.getState().phoneSeed, SEED_VERSION);
});

await test('yedek: telefonlar dışa aktarılır, doğrulanır ve geri yüklenir (PIN baştaki 0 ile)', () => {
  S.resetAll();
  S.add('phones', phone({ name: 'faik1', pin: '0123', extra: [{ label: 'Kimde', value: 'çekmece' }] }));
  S.add('phones', phone({ name: 'faik2', number: '', pin: '', model: 'iPhone 7 Plus', color: 'Sarı', cased: false }));
  const backup = JSON.parse(JSON.stringify(S.exportData()));
  assert.equal(backup.data.phones.length, 2);

  const check = S.validateBackup(backup);
  assert.equal(check.ok, true);
  assert.equal(check.counts.phones, 2);

  S.resetAll();
  assert.equal(S.getState().phones.length, 0);
  S.importBackup(backup);
  const [a, b] = St.sortPhones(S.getState().phones);
  assert.equal(a.pin, '0123');
  assert.deepEqual(a.extra, [{ label: 'Kimde', value: 'çekmece' }]);
  assert.equal(b.cased, false);
  assert.equal(b.color, 'Sarı');

  // Yalnızca telefon içeren yedek de geçerli; bozuk telefon kaydı yedeği reddettirir.
  assert.equal(S.validateBackup({ app: 'tamarin', version: 2, data: { phones: backup.data.phones } }).ok, true);
  const bad = structuredClone(backup);
  bad.data.phones[0].pin = '12';
  const rejected = S.validateBackup(bad);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.every((e) => !e.includes('12 ')));
  assert.throws(() => S.importBackup(bad));
  assert.equal(S.getState().phones.length, 2); // mevcut veri yerinde
});

await test('silme + geri al (snapshot/restore) telefonları da kapsar', () => {
  const before = S.snapshot();
  const id = S.getState().phones[0].id;
  S.remove('phones', id);
  assert.equal(S.getState().phones.length, 1);
  S.restore(before);
  assert.equal(S.getState().phones.length, 2);
});

await test('çizim: her model için SVG, renk CSS değişkeni, logo yok; kılıflıda kılıf katmanı', () => {
  for (const model of S.PHONE_MODELS) {
    for (const cased of [true, false]) {
      const markup = A.phoneArt(model, 'Su yeşili', cased, 44);
      assert.match(markup, /^<svg [^>]*viewBox="0 0 64 124"[^>]*width="44"/);
      assert.match(markup, /var\(--case-su-yesili\)/);
      assert.doesNotMatch(markup, /apple|logo|#[0-9a-f]{6}/i); // renkler değişkende, logo yok
    }
  }
  const lensCount = (m) => (A.phoneArt(m, 'Siyah', false, 44).match(/var\(--pa-lens\)/g) ?? []).length;
  assert.equal(lensCount('iPhone 8'), 1);
  assert.equal(lensCount('iPhone SE (2./3. nesil)'), 1);
  assert.equal(lensCount('iPhone 7 Plus'), 2);
  assert.ok(lensCount('iPhone 12') >= 2);
  assert.match(A.phoneArt('iPhone 12', 'Siyah', true, 44), /var\(--pa-glass\)/);      // kılıfta kamera açıklığı
  assert.doesNotMatch(A.phoneArt('iPhone 12', 'Siyah', false, 44), /var\(--pa-glass\)/);
  assert.match(A.phoneArt('iPhone 8', 'Şeffaf', true, 44), /var\(--pa-under\).*var\(--case-seffaf\)/); // şeffaf: altında gövde
  for (const color of S.CASE_COLORS) assert.ok(A.CASE_SLUG[color], color);
});

console.log(`\n${passed} test geçti${process.exitCode ? ', bazıları KALDI' : ''}.`);
