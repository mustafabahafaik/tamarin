// Business testi: node tests/business.test.mjs   (proje kökünden; harici kütüphane yok)
// Telefonlar + Telegram/Bybit/OKX hesapları: numara/PIN, model/renk/platform/durum doğrulama, ek bilgi sınırları,
// doğal sıra, telefon silinince bağın kopması ve Geri al, bilinmeyen phoneId, arama (PIN'de aramaz), yedek,
// "Bunu Kasa'ya koy" uyarısı, Business özeti. Yazılan numara, PIN, kullanıcı adı ve UID'ler uydurmadır;
// tohum testi gerçek tohumu js/phones-seed.js'ten okur (burada numara yazılmaz).
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../js/store.js');
const St = await import('../js/status.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

// Temiz başlangıç: tohum telefonlar ve örnekler gitsin (resetAll phoneSeed'i korur, telefonlar geri gelmez).
S.resetAll();

const phone = (extra = {}) => ({ name: 'deneme', number: '0555 000 00 01', pin: '7319', model: 'iPhone 12', color: 'Mavi', ...extra });
const account = (extra = {}) => ({ platform: 'Bybit', label: 'Eren', username: 'ornek1@posta.test', uid: '100200300', ...extra });

await test('numara: boşluklu/tireli giriş rakama çevrilir, biçim "0555 000 00 01"; boş olabilir', () => {
  assert.equal(S.add('phones', phone({ number: '0555-000-00-02' })).number, '05550000002');
  assert.equal(S.add('phones', phone({ number: '+90 555 000 00 03' })).number, '05550000003');
  assert.equal(S.add('phones', phone({ number: '' })).number, '');
  assert.equal(St.formatPhone('05550000001'), '0555 000 00 01');
  assert.equal(St.formatPhone('5550000001'), '555 000 00 01');
});

await test('PIN baştaki 0 ile metin; geçersiz PIN ve numara reddedilir, hata değeri içermez', () => {
  assert.equal(S.add('phones', phone({ pin: '0042' })).pin, '0042');
  assert.equal(JSON.parse(mem.get('tamarin.v1')).phones.find((p) => p.pin === '0042').pin, '0042');
  for (const bad of ['123', '123456789', '12a4']) {
    assert.throws(() => S.add('phones', phone({ pin: bad })), (err) => /pin/.test(err.message) && !err.message.includes(bad));
  }
  assert.throws(() => S.add('phones', phone({ pin: 42 })), /pin/);
  for (const bad of ['0555 12', '055500000012', '0555 000 00 0a']) {
    assert.throws(() => S.add('phones', phone({ number: bad })), (err) => /number/.test(err.message) && !err.message.includes(bad));
  }
});

await test('model/renk/platform/durum: listeden biri; varsayılanlar Diğer, Siyah, Aktif; 2FA yalnızca boolean', () => {
  const p = S.add('phones', phone({ model: '', color: '', cased: undefined }));
  assert.deepEqual([p.model, p.color, p.cased], ['Diğer', 'Siyah', true]);
  assert.throws(() => S.add('phones', phone({ model: 'iPhone 15' })), /model/);
  assert.throws(() => S.add('phones', phone({ color: 'Neon' })), /color/);

  const a = S.add('accounts', account({ status: '', twofa: undefined }));
  assert.deepEqual([a.platform, a.status, a.twofa, a.phoneId], ['Bybit', 'Aktif', false, '']);
  assert.equal(S.add('accounts', account({ twofa: true, status: 'KYC tamam' })).twofa, true);
  assert.throws(() => S.add('accounts', account({ platform: 'Binance' })), /platform/);
  assert.throws(() => S.add('accounts', account({ platform: '' })), /platform/);
  assert.throws(() => S.add('accounts', account({ status: 'Banlı' })), /status/);
  assert.throws(() => S.add('accounts', account({ twofa: 'evet' })), /twofa/);
  assert.throws(() => S.add('accounts', account({ label: '  ' })), /label/);
  for (const s of S.ACCOUNT_STATUSES) assert.equal(S.add('accounts', account({ status: s })).status, s);
});

await test('hesapta şifre/2FA anahtarı/seed alanı yok: bilinmeyen alanlar atılır; uzunluk sınırları', () => {
  const a = S.add('accounts', account({ password: 'uydurma-sifre', twofaKey: 'ABCDEF', seed: 'bir iki üç', label: 'x'.repeat(60), username: 'u'.repeat(100), uid: '9'.repeat(50) }));
  assert.deepEqual(Object.keys(a).sort(), ['extra', 'id', 'label', 'note', 'phoneId', 'platform', 'status', 'twofa', 'uid', 'username']);
  assert.equal(a.label.length, 40);
  assert.equal(a.username.length, 80);
  assert.equal(a.uid.length, 40);
  assert.ok(!mem.get('tamarin.v1').includes('uydurma-sifre'));
});

await test('ek bilgiler (telefon ve hesap): boşlar atılır, etiket 40 / değer 200, en fazla 20 satır', () => {
  for (const type of ['phones', 'accounts']) {
    const base = type === 'phones' ? phone() : account();
    const rec = S.add(type, { ...base, extra: [{ label: 'Ülke', value: 'TR' }, { label: '', value: '' }, { label: 'L'.repeat(50), value: 'V'.repeat(250) }] });
    assert.equal(rec.extra.length, 2);
    assert.equal(rec.extra[1].label.length, 40);
    assert.equal(rec.extra[1].value.length, 200);
    const rows = Array.from({ length: 20 }, (_, i) => ({ label: `e${i}`, value: 'x' }));
    assert.equal(S.add(type, { ...base, extra: rows }).extra.length, 20);
    assert.throws(() => S.add(type, { ...base, extra: [...rows, { label: 'fazla', value: 'x' }] }), /extra/);
    assert.equal(S.add(type, { ...base, extra: [...rows, { label: '', value: '' }] }).extra.length, 20); // boş satır sayılmaz
  }
});

await test('doğal sıralama: faik2 < faik10; hesaplar telefonun sırasıyla, "Hat yok" en sonda', () => {
  S.resetAll();
  const p10 = S.add('phones', phone({ name: 'faik10', number: '05550000010' }));
  const p2 = S.add('phones', phone({ name: 'faik2', number: '05550000002' }));
  const p1 = S.add('phones', phone({ name: 'Faik1', number: '05550000001' }));
  assert.deepEqual(St.sortPhones(S.getState().phones).map((p) => p.name), ['Faik1', 'faik2', 'faik10']);
  S.add('accounts', account({ label: 'Mert', phoneId: p10.id }));
  S.add('accounts', account({ label: 'Zeynep', phoneId: p2.id }));
  S.add('accounts', account({ label: 'Ali', phoneId: p2.id }));
  S.add('accounts', account({ label: 'Deniz' }));
  S.add('accounts', account({ label: 'Eren', phoneId: p1.id }));
  const groups = St.accountGroups(S.getState().accounts, S.getState().phones);
  assert.deepEqual(groups.map((g) => g.title), ['', 'Hat yok']);
  assert.deepEqual(groups[0].items.map((a) => a.label), ['Eren', 'Ali', 'Zeynep', 'Mert']);
  assert.deepEqual(groups[1].items.map((a) => a.label), ['Deniz']);
});

await test('Telegram sırası: etikete göre alfabetik, Türkçe harf sırasıyla (telefonsuzlar da aynı listede)', () => {
  const tg = ['Zeynep', 'Çağrı', 'Eren', 'İrem', 'Ilgın', 'Cem', 'Şule', 'Sena', 'Ömer', 'Oğuz'].map((label, i) => ({ id: `t${i}`, platform: 'Telegram', label, phoneId: i % 2 ? '' : 'p' }));
  assert.deepEqual(St.sortByLabel(tg).map((a) => a.label), ['Cem', 'Çağrı', 'Eren', 'Ilgın', 'İrem', 'Oğuz', 'Ömer', 'Sena', 'Şule', 'Zeynep']);
  assert.equal(tg[0].label, 'Zeynep'); // kopyayı sıralar, listeye dokunmaz
});

await test('çizim: telefonsuz hesap için kesik çizgili boş siluet (renk yok, logo yok)', async () => {
  const A = await import('../js/phone-art.js');
  const out = A.phoneSilhouette(44);
  assert.match(out, /^<svg [^>]*width="44"/);
  assert.match(out, /stroke-dasharray/);
  assert.match(out, /var\(--pa-dash\)/);
  assert.ok(!/--case-/.test(out));
});

await test('telefon silinince bağlı hesapların phoneId\'si "" olur; Geri al ikisini birlikte getirir', () => {
  S.resetAll();
  const p = S.add('phones', phone({ name: 'hat1', number: '05550000021' }));
  const other = S.add('phones', phone({ name: 'hat2', number: '05550000022' }));
  const t = S.add('accounts', account({ platform: 'Telegram', label: 'Selin', username: '@ornek_tg', phoneId: p.id }));
  const b = S.add('accounts', account({ phoneId: p.id }));
  const o = S.add('accounts', account({ platform: 'OKX', label: 'Ayşe', phoneId: other.id }));
  const before = S.snapshot();
  let events = 0;
  const off = S.onChange(() => events++);
  S.remove('phones', p.id);
  off();
  assert.equal(events, 1); // tek değişiklik
  const after = S.getState();
  assert.equal(after.accounts.find((a) => a.id === t.id).phoneId, '');
  assert.equal(after.accounts.find((a) => a.id === b.id).phoneId, '');
  assert.equal(after.accounts.find((a) => a.id === o.id).phoneId, other.id); // başka hat etkilenmez
  assert.equal(JSON.parse(mem.get('tamarin.v1')).accounts.find((a) => a.id === t.id).phoneId, ''); // kayıtta da
  S.restore(before);
  assert.ok(S.getState().phones.some((x) => x.id === p.id));
  assert.equal(S.getState().accounts.find((a) => a.id === t.id).phoneId, p.id);
  assert.equal(S.getState().accounts.find((a) => a.id === b.id).phoneId, p.id);
});

await test('bilinmeyen phoneId: ekleme/güncellemede, yüklemede ve yedekte "" olur', async () => {
  S.resetAll();
  const p = S.add('phones', phone({ number: '05550000031' }));
  assert.equal(S.add('accounts', account({ phoneId: 'yok-boyle-bir-id' })).phoneId, '');
  const a = S.add('accounts', account({ phoneId: p.id }));
  assert.equal(S.update('accounts', a.id, { phoneId: 'yok' }).phoneId, '');
  assert.throws(() => S.add('accounts', account({ phoneId: 42 })), /phoneId/);

  const saved = mem.get('tamarin.v1');
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phoneSeed: 99, phones: [{ id: 'p1', name: 'hat', number: '05550000041' }],
    accounts: [{ id: 'a1', platform: 'OKX', label: 'Ayşe', phoneId: 'p1' }, { id: 'a2', platform: 'OKX', label: 'Burak', phoneId: 'silinmis' }] }));
  const fresh = await import(`../js/store.js?bag=${Date.now()}`);
  assert.deepEqual(fresh.getState().accounts.map((x) => x.phoneId), ['p1', '']);
  assert.equal(fresh.getState().phones.length, 1); // phoneSeed ileri: tohum eklenmez
  mem.set('tamarin.v1', saved);

  const check = S.validateBackup({ app: 'tamarin', version: 2, data: { phones: [], accounts: [{ platform: 'Telegram', label: 'T', phoneId: 'kayip' }] } });
  assert.equal(check.ok, true);
  assert.equal(check.state.accounts[0].phoneId, '');
});

await test('arama: ad, numara (boşluklu da), kullanıcı adı, UID, bağlı telefon; PIN\'de aramaz', () => {
  S.resetAll();
  const a1 = S.add('phones', phone({ name: 'faik1', number: '05550000051', pin: '7319' }));
  const a2 = S.add('phones', phone({ name: 'faik2', number: '05550000052', pin: '0864' }));
  S.add('accounts', account({ platform: 'Telegram', label: 'Selin', username: '@kum_kedisi', uid: '4400112233', phoneId: a1.id }));
  S.add('accounts', account({ platform: 'Bybit', label: 'Kaan', username: 'deniz@posta.test', uid: '55667788', phoneId: a2.id }));
  S.add('accounts', account({ platform: 'OKX', label: 'Ayşe', username: 'okx1@posta.test', uid: '99001122' }));
  const st = S.getState();
  const phones = (q) => St.searchPhones(st.phones, st.accounts, q).map((p) => p.name);
  const accs = (q, pf) => St.searchAccounts(st.accounts, st.phones, q, pf).map((a) => a.label);

  assert.deepEqual(phones(''), ['faik1', 'faik2']);
  assert.deepEqual(phones('FAIK2'), ['faik2']);
  assert.deepEqual(phones('0555 000 00 52'), ['faik2']);
  assert.deepEqual(phones('0000051'), ['faik1']);
  assert.deepEqual(phones('+90 555 000 00 51'), ['faik1']);
  assert.deepEqual(phones('kum_kedisi'), ['faik1']); // o hattaki hesabın kullanıcı adı
  assert.deepEqual(phones('55667788'), ['faik2']);   // o hattaki hesabın UID'si
  assert.deepEqual(accs('deniz'), ['Kaan']);
  assert.deepEqual(accs('99001122'), ['Ayşe']);
  assert.deepEqual(accs('faik1'), ['Selin']);   // bağlı telefonun adı
  assert.deepEqual(accs('0555 000 00 52'), ['Kaan']);
  assert.deepEqual(accs('', 'OKX'), ['Ayşe']);
  assert.deepEqual(accs('deniz', 'Telegram'), []);
  // PIN'de aramaz
  for (const pin of ['7319', '0864']) {
    assert.deepEqual(phones(pin), [], pin);
    assert.deepEqual(accs(pin), [], pin);
  }
});

await test('yedek: telefonlar ve hesaplar dışa aktarılır, doğrulanır ve geri yüklenir (bağlar ve PIN korunur)', () => {
  S.resetAll();
  const p = S.add('phones', phone({ name: 'yedek', number: '05550000061', pin: '0123', extra: [{ label: 'IMEI', value: '000000000000000' }] }));
  S.add('accounts', account({ label: 'Eren', phoneId: p.id, twofa: true, status: 'KYC tamam', extra: [{ label: 'Ülke', value: 'TR' }] }));
  S.add('accounts', account({ platform: 'Telegram', label: 'Selin', username: '@ornek' }));
  const backup = JSON.parse(JSON.stringify(S.exportData()));
  assert.equal(backup.data.accounts.length, 2);
  const check = S.validateBackup(backup);
  assert.equal(check.ok, true);
  assert.equal(check.counts.accounts, 2);
  assert.equal(check.counts.phones, 1);

  S.resetAll();
  assert.equal(S.getState().accounts.length, 0);
  const counts = S.importBackup(backup);
  assert.deepEqual([counts.phones, counts.accounts], [1, 2]);
  const restored = S.getState();
  assert.equal(restored.phones[0].pin, '0123');
  const bybit = restored.accounts.find((a) => a.label === 'Eren');
  assert.equal(bybit.phoneId, restored.phones[0].id);
  assert.deepEqual([bybit.twofa, bybit.status, bybit.extra[0].value], [true, 'KYC tamam', 'TR']);

  const bad = S.validateBackup({ app: 'tamarin', data: { accounts: [{ platform: 'Binance', label: 'x' }] } });
  assert.equal(bad.ok, false);
});

await test('VERSION değişmez; eski kayıtta accounts yoksa boş liste; ui.bizTab varsayılanı ve doğrulaması', async () => {
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phoneSeed: 99, ui: { schoolTab: 'exams' }, bills: [] }));
  const old = await import(`../js/store.js?eski=${Date.now()}`);
  assert.deepEqual(old.getState().accounts, []);
  assert.equal(old.exportData().version, 2);
  assert.deepEqual(old.getState().ui, { schoolTab: 'exams', bizTab: 'telefonlar' });
  assert.equal(old.setField('ui', { ...old.getState().ui, bizTab: 'okx' }).bizTab, 'okx');
  assert.equal(old.setField('ui', { bizTab: 'binance' }).bizTab, 'telefonlar');
  assert.equal(old.countExamples(), 0); // hesaplarda örnek yok
});

await test('"Bunu Kasa\'ya koy": şifre, password, 2FA anahtarı, yedek kod, seed yakalanır; sıradan notlar değil', () => {
  assert.deepEqual(St.vaultWords('Şifresi: uydurma'), ['şifre']);
  assert.deepEqual(St.vaultWords('', [{ label: 'Password', value: 'x' }]), ['password']);
  assert.ok(St.vaultWords('', [{ label: '2FA key', value: 'x' }]).includes('2FA anahtarı'));
  assert.ok(St.vaultWords('yedek kodlar kağıtta').includes('yedek kod'));
  assert.ok(St.vaultWords('', [{ label: 'Seed', value: 'bir iki üç' }]).includes('seed'));
  assert.ok(St.vaultWords('kurtarma ifadesi defterde').includes('seed'));
  assert.ok(St.vaultWords('', [{ label: 'API key', value: 'x' }]).includes('API anahtarı'));
  assert.deepEqual(St.vaultWords('2FA açık, Google Authenticator', [{ label: 'Referans kodu', value: 'ABC123' }, { label: 'Ülke', value: 'TR' }]), []);
  assert.deepEqual(St.vaultWords(''), []);
});

await test('tohum sürüm bazlı: phoneSeed 2\'de iPhone 12 eklenir, silinen eski telefon gelmez; 3\'te hiçbir şey eklenmez; aynı numara iki kez eklenmez', async () => {
  // Tohum numaraları dosyadan okunur (burada yazılmaz).
  const { PHONE_SEED, SEED_VERSION } = await import('../js/phones-seed.js');
  assert.equal(SEED_VERSION, 3);
  assert.ok(PHONE_SEED.every((x) => Number.isInteger(x.since) && x.since >= 1 && x.since <= SEED_VERSION));
  const old = PHONE_SEED.filter((x) => x.since <= 2);
  const fresh = PHONE_SEED.filter((x) => x.since > 2);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].model, 'iPhone 12');
  const asPhone = (x, extra = {}) => ({ name: x.name, number: x.number, pin: x.pin, model: x.model, color: x.color, cased: x.cased, ...extra });

  // phoneSeed 2: eski telefonlardan biri silinmiş; iPhone 12 gelir, silinen gelmez, diğer kayıtlar kalır.
  const kept = old.slice(1);
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phoneSeed: 2, phones: kept.map((x) => asPhone(x)),
    accounts: [{ id: 'a1', platform: 'Telegram', label: 'Eren' }] }));
  const v2 = await import(`../js/store.js?tohum2=${Date.now()}`);
  const phones = v2.getState().phones;
  assert.equal(phones.length, kept.length + 1);
  const added = phones.find((p) => p.number === fresh[0].number);
  assert.deepEqual([added.name, added.model, added.color, added.cased, added.pin], [fresh[0].name, 'iPhone 12', 'Su yeşili', true, fresh[0].pin]);
  assert.equal(added.pin.length, 4);
  assert.ok(added.pin.startsWith('0')); // baştaki 0 korunur
  assert.ok(!phones.some((p) => p.number === old[0].number)); // silinen eski telefon geri gelmez
  assert.equal(v2.getState().phoneSeed, 3);
  assert.equal(v2.getState().accounts.length, 1);
  assert.equal(JSON.parse(mem.get('tamarin.v1')).phoneSeed, 3); // kaydedildi

  // phoneSeed 3: hiçbir şey eklenmez (iPhone 12 silinmiş olsa bile).
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phoneSeed: 3, phones: [] }));
  const v3 = await import(`../js/store.js?tohum3=${Date.now()}`);
  assert.equal(v3.getState().phones.length, 0);

  // Aynı numara elle eklenmişse (farklı adla) ikinci kez eklenmez; PIN boşsa tohumdan dolar.
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phoneSeed: 2, phones: [{ name: 'elle', number: fresh[0].number, pin: '' }] }));
  const dup = await import(`../js/store.js?tohumcift=${Date.now()}`);
  const same = dup.getState().phones.filter((p) => p.number === fresh[0].number);
  assert.equal(same.length, 1);
  assert.equal(same[0].name, 'elle');
  assert.equal(same[0].pin, fresh[0].pin);

  // Elle girilen PIN'e dokunulmaz.
  mem.set('tamarin.v1', JSON.stringify({ version: 2, phoneSeed: 2, phones: [{ name: 'elle', number: fresh[0].number, pin: '4242' }] }));
  const manual = await import(`../js/store.js?tohumpin=${Date.now()}`);
  assert.equal(manual.getState().phones[0].pin, '4242');
});

await test('Business özeti: "8 hat · 14 hesap"; boşsa "Hat ve hesap ekle"', () => {
  assert.equal(St.bizSummary({ phones: new Array(8).fill({}), accounts: new Array(14).fill({}) }), '8 hat · 14 hesap');
  assert.equal(St.bizSummary({ phones: [{}], accounts: [] }), '1 hat · 0 hesap');
  assert.equal(St.bizSummary({ phones: [], accounts: [] }), 'Hat ve hesap ekle');
  const linked = St.accountsOf([{ platform: 'OKX', label: 'O', phoneId: 'p' }, { platform: 'Telegram', label: 'T', phoneId: 'p' }, { platform: 'Bybit', label: 'B', phoneId: 'x' }], 'p');
  assert.deepEqual(linked.map((a) => a.platform), ['Telegram', 'OKX']);
});

console.log(`\n${passed} test geçti${process.exitCode ? ', bazıları başarısız' : ''}.`);
