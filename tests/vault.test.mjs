// Kasa testi: node tests/vault.test.mjs   (proje kökünden; Node 20+, harici kütüphane yok)
// Gerçek 600.000 iterasyon kullanılır; birkaç saniye sürer.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const V = await import('../js/vault.js');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.log(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const MASTER = 'kırmızı-Tamarin-42';
const SECRET = { app: 'Instagram', username: 'ornek.kullanici', password: 'Gizli$ifre-9xQ!', url: 'https://instagram.com', note: 'iki adımlı doğrulama açık', cat: 'Sosyal medya' };
const stored = () => mem.get('tamarin.vault');

await test('kasa oluşturulur; yalnızca izin verilen alanlar, 600.000 iterasyon', async () => {
  await V.createVault(MASTER);
  const blob = JSON.parse(stored());
  assert.deepEqual(Object.keys(blob).sort(), ['ciphertext', 'iterations', 'iv', 'salt', 'v']);
  assert.equal(blob.iterations, 600000);
  assert.equal(Buffer.from(blob.salt, 'base64').length, 16);
  assert.equal(Buffer.from(blob.iv, 'base64').length, 12);
});

await test('şifrele → kilitle → aynı şifreyle çöz: aynı veri', async () => {
  await V.saveEntry(SECRET);
  await V.saveEntry({ app: 'Okul portalı', username: '2024123', password: 'P0rtal-ŞifreÇ', cat: 'Okul' });
  const before = V.entries().map(({ id, updated, ...rest }) => rest);
  V.lock();
  assert.equal(V.isUnlocked(), false);
  assert.throws(() => V.entries(), /kilitli/);
  await V.unlock(MASTER);
  const after = V.entries().map(({ id, updated, ...rest }) => rest);
  assert.deepEqual(after, before);
  assert.equal(after.find((e) => e.app === 'Instagram').password, SECRET.password);
});

await test('her kayıtta yeni IV', async () => {
  const iv1 = JSON.parse(stored()).iv;
  await V.saveEntry({ app: 'Steam', username: 'oyuncu42', password: 'x'.repeat(20), cat: 'Oyun' });
  const iv2 = JSON.parse(stored()).iv;
  assert.notEqual(iv1, iv2);
});

await test('localStorage kaydında düz metin yok (şifre, kullanıcı adı, uygulama adı, ana şifre)', async () => {
  const everything = [...mem.values()].join('\n');
  for (const plain of [SECRET.password, SECRET.username, SECRET.app, SECRET.note, MASTER, 'P0rtal-ŞifreÇ', 'Steam']) {
    assert.ok(!everything.includes(plain), `düz metin bulundu: ${plain.slice(0, 3)}…`);
  }
  // base64 içinde de geçmesin (ör. yanlışlıkla şifrelemeden base64'e çevrilmiş olmasın)
  const decoded = Buffer.from(JSON.parse(stored()).ciphertext, 'base64').toString('utf8');
  assert.ok(!decoded.includes(SECRET.password));
});

await test('yanlış şifre çözemiyor; 5 yanlıştan sonra 30 sn bekleme', async () => {
  V.lock();
  for (let i = 1; i <= 5; i++) {
    await assert.rejects(V.unlock(`yanlis-${i}-sifre`), V.WrongPassword);
  }
  assert.equal(V.isUnlocked(), false);
  const wait = V.lockoutLeft();
  assert.ok(wait > 28000 && wait <= 30000, `bekleme ${wait} ms`);
  await assert.rejects(V.unlock(MASTER), V.LockedOut); // doğru şifre bile beklemede reddedilir
  // Bekleme bitince doğru şifre çalışır ve sayaç sıfırlanır
  const guard = JSON.parse(mem.get('tamarin.vault.guard'));
  mem.set('tamarin.vault.guard', JSON.stringify({ ...guard, until: Date.now() - 1 }));
  await V.unlock(MASTER);
  assert.equal(JSON.parse(mem.get('tamarin.vault.guard')).fails, 0);
});

await test('her ek 5 yanlışta bekleme ikiye katlanır', async () => {
  V.lock();
  mem.set('tamarin.vault.guard', JSON.stringify({ fails: 9, until: 0 }));
  await assert.rejects(V.unlock('yanlis-sifre-10'), V.WrongPassword);
  const wait = V.lockoutLeft();
  assert.ok(wait > 58000 && wait <= 60000, `bekleme ${wait} ms`);
  mem.set('tamarin.vault.guard', JSON.stringify({ fails: 0, until: 0 }));
  await V.unlock(MASTER);
});

await test('ana şifre değişince eski şifre çalışmıyor, yeni şifre çalışıyor', async () => {
  const oldSalt = JSON.parse(stored()).salt;
  await assert.rejects(V.changePassword('eski-degil-bu', 'yepyeni-Sifre-77'), V.WrongPassword);
  await V.changePassword(MASTER, 'yepyeni-Sifre-77');
  assert.notEqual(JSON.parse(stored()).salt, oldSalt, 'yeni salt üretilmeli');
  V.lock();
  await assert.rejects(V.unlock(MASTER), V.WrongPassword);
  mem.set('tamarin.vault.guard', JSON.stringify({ fails: 0, until: 0 }));
  await V.unlock('yepyeni-Sifre-77');
  assert.equal(V.entries().find((e) => e.app === 'Instagram').password, SECRET.password);
});

await test('şifreli yedek: aynı şifreyle yüklenir, yanlış şifre mevcut kasaya dokunmaz', async () => {
  const backup = JSON.parse(JSON.stringify(V.exportEncrypted()));
  assert.equal(backup.app, 'tamarin-vault');
  assert.ok(!JSON.stringify(backup).includes(SECRET.password));
  const current = stored();
  await assert.rejects(V.importEncrypted(backup, 'yanlis-sifre-xx'), V.WrongPassword);
  assert.equal(stored(), current);
  await assert.rejects(V.importEncrypted({ app: 'tamarin-vault', v: 1, salt: 'eA==', iv: 'eA==', ciphertext: 'eA==', iterations: 600000 }, 'x'), /yedeği değil/);
  await V.importEncrypted(backup, 'yepyeni-Sifre-77');
  assert.equal(V.entries().length, 3);
});

await test('ana yedek (store) kasayı içermez', async () => {
  const S = await import('../js/store.js');
  const json = JSON.stringify(S.exportData());
  assert.ok(!json.includes('tamarin-vault') && !json.includes(JSON.parse(stored()).ciphertext.slice(0, 24)));
});

await test('güçlü şifre üretici: uzunluk ve seçilen türler', async () => {
  for (const length of [12, 20, 32]) {
    const pw = V.generatePassword({ length });
    assert.equal(pw.length, length);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[2-9]/);
    assert.match(pw, /[^A-Za-z0-9]/);
  }
  assert.match(V.generatePassword({ length: 16, upper: false, symbols: false }), /^[a-z2-9]{16}$/);
  assert.equal(V.generatePassword({ length: 99 }).length, 32);
  assert.throws(() => V.generatePassword({ upper: false, lower: false, digits: false, symbols: false }));
  assert.equal(new Set(Array.from({ length: 50 }, () => V.generatePassword())).size, 50);
});

await test('sıfırla: kasa ve deneme sayacı silinir', async () => {
  V.resetVault();
  assert.equal(V.hasVault(), false);
  assert.equal(mem.has('tamarin.vault'), false);
  assert.equal(mem.has('tamarin.vault.guard'), false);
});

console.log(`\n${passed} test geçti${process.exitCode ? ', başarısız olan var' : ''}`);
