// Asistan testi: node tests/assistant.test.mjs   (proje kökünden; harici kütüphane yok)
// Bağlamda PIN ve hassas not satırlarının OLMADIĞI, 8 KB kırpma, araç çağrılarının store kaydına doğru
// çevrilmesi, şema dışı alan reddi, onaysız değişiklik olmaması, silmenin iki adımı. Tüm veriler uydurmadır.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../js/store.js');
const C = await import('../js/assistant/context.js');
const T = await import('../js/assistant/tools.js');
const D = await import('../js/assistant/declarations.js');
const { money } = await import('../js/status.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const NOW = new Date(2026, 10, 18, 15, 7); // 18 Kasım 2026 Çarşamba 15:07
S.resetAll();

function seed() {
  S.resetAll();
  const phone = S.add('phones', { name: 'deneme', number: '05550000001', pin: '7319', model: 'iPhone 12', color: 'Mavi', note: 'gizli not', extra: [{ label: 'PUK', value: '11112222' }] });
  S.add('accounts', { platform: 'Bybit', label: 'Eren', phoneId: phone.id, username: 'ornek@posta.test', uid: '998877', note: 'şifre: uydurma123' });
  S.add('bills', { name: 'Kira', cat: 'Kira', amount: 18500, day: 5, note: 'Ev sahibi Ali\nKapı şifresi 4321', paid: [] });
  S.add('tasks', { title: 'Dişçi', date: '2026-11-21', time: '15:00', remind: '60', note: 'Randevu kartını al\n2FA kodu 556677', done: false });
  S.add('tasks', { title: 'Market', date: '2026-11-17', done: true, doneAt: '2026-11-17T10:00:00.000Z' });
  S.add('exams', { course: 'Fizik', type: 'Vize', date: '2026-11-25', time: '10:00', room: 'B-1', note: 'seed: kelimeler bir iki' });
  S.add('days', { name: 'Annem', kind: 'Doğum günü', day: 2, month: 12, year: 1972, rel: 'Aile', note: 'pasta' });
  S.add('classes', { name: 'Lineer Cebir', day: 4, start: '09:00', end: '10:50', room: 'A-101', teacher: 'Hoca' });
  mem.set('tamarin.vault', JSON.stringify({ v: 1, salt: 'S4LT', iv: 'IVIV', ciphertext: 'KASAICERIGI', iterations: 600000 }));
  return phone;
}

await test('bağlam: PIN, Kasa, calendar, cache, extra ve hassas not satırları YOK; diğer bilgiler var', () => {
  seed();
  S.setCache('forecast', { gizli: 'ONBELLEK' });
  const json = C.contextJson(S.getState(), NOW, { derece: 9, durum: 'Hafif yağmur' });
  for (const bad of ['7319', 'pin', 'PUK', '11112222', 'gizli not', 'uydurma123', '4321', '556677', 'kelimeler', 'KASAICERIGI', 'S4LT', 'ONBELLEK', 'calendar', 'exported', 'ornek@posta.test', '998877']) {
    assert.ok(!json.includes(bad), `bağlamda olmamalı: ${bad}`);
  }
  const ctx = JSON.parse(json);
  assert.deepEqual(ctx.simdi, { tarih: '2026-11-18', gun: 'Çarşamba', saat: '15:07' });
  assert.equal(ctx.kullanici.ad, 'Baha');
  assert.equal(ctx.hava.derece, 9);
  assert.equal(ctx.odemeler[0].not, 'Ev sahibi Ali');           // hassas satır atıldı, gerisi kaldı
  assert.equal(ctx.odemeler[0].sonraki_vade, '2026-11-05');      // bu ayın 5'i geçti ve ödenmedi
  assert.equal(ctx.odemeler[0].gecikme_gun, 13);
  assert.equal(ctx.isler.find((t) => t.baslik === 'Dişçi').not, 'Randevu kartını al');
  assert.ok(!('not' in ctx.sinavlar[0]));                         // tek satır hassas → not hiç yok
  assert.deepEqual(Object.keys(ctx.telefonlar[0]).sort(), ['ad', 'id', 'model', 'numara', 'renk']);
  assert.deepEqual(Object.keys(ctx.hesaplar[0]).sort(), ['etiket', 'id', 'platform', 'telefon']);
  assert.equal(ctx.hesaplar[0].telefon, 'deneme');
  assert.equal(ctx.ozel_gunler[0].kalan_gun, 14);
  assert.equal(ctx.ozel_gunler[0].yas, 54);
  assert.equal(ctx.isler.find((t) => t.baslik === 'Market').bitti, true); // son 3 günde tamamlandı
});

await test('hassas filtre tek yerde: pin, şifre, password, seed, 2fa (büyük/küçük, Türkçe harf)', () => {
  for (const s of ['PIN 1234', 'pin kodu', 'ŞİFRE: x', 'sifre', 'Password', 'seed phrase', '2FA', 'kurtarma ifadesi', 'PUK 1']) assert.ok(C.isSensitive(s), s);
  for (const s of ['Pinar ile buluş', 'Market alışverişi', 'Randevu 15:00', 'spinning dersi']) assert.ok(!C.isSensitive(s), s);
  assert.equal(C.safeNote('a\nŞifre 1\nb'), 'a / b');
  assert.equal(C.safeNote('PIN 0000'), '');
});

await test('8 KB sınırı: önce tamamlanan görevler, sonra geçmiş sınavlar kırpılır; açık işler korunur', () => {
  S.resetAll();
  for (let i = 0; i < 40; i++) S.add('tasks', { title: `Açık iş ${i} ${'x'.repeat(40)}`, date: '2026-11-30', note: 'n'.repeat(100), done: false });
  for (let i = 0; i < 60; i++) S.add('tasks', { title: `Biten ${i} ${'y'.repeat(40)}`, date: '2026-11-17', done: true, doneAt: '2026-11-18T08:00:00.000Z' });
  for (let i = 0; i < 20; i++) S.add('exams', { course: `Geçmiş ${i}`, type: 'Quiz', date: '2026-11-10', note: 'z'.repeat(60) });
  const full = JSON.stringify(C.buildContext(S.getState(), NOW));
  assert.ok(new TextEncoder().encode(full).length > 8192);
  const json = C.contextJson(S.getState(), NOW);
  assert.ok(new TextEncoder().encode(json).length <= 8192);
  const ctx = JSON.parse(json);
  assert.ok(!ctx.isler.some((t) => t.bitti), 'tamamlananlar önce gider');
  assert.ok(ctx.isler.length >= 30, 'açık işlerin çoğu kalır');
  // Daha sıkı sınırda geçmiş sınavlar da gider, sonra notlar, en son liste sonları.
  const tight = JSON.parse(C.contextJson(S.getState(), NOW, null, 4000));
  assert.ok(!tight.sinavlar.some((e) => e.gecti));
  assert.ok(new TextEncoder().encode(JSON.stringify(tight)).length <= 4000);
});

await test('araç → kayıt: add_task, add_bill, add_exam, add_day, add_class, complete/postpone, mark_bill_paid', () => {
  S.resetAll();
  const before = JSON.stringify(S.getState());
  const plans = [
    T.planCall({ name: 'add_task', args: { title: 'Dişçi', date: '2026-11-21', time: '15:00', remind: '60' } }, S.getState(), NOW),
    T.planCall({ name: 'add_bill', args: { name: 'Kira', cat: 'Kira', amount: 18500, day: 5 } }, S.getState(), NOW),
    T.planCall({ name: 'add_exam', args: { course: 'Fizik', type: 'Vize', date: '2026-11-25', time: '10:00', room: 'B-1' } }, S.getState(), NOW),
    T.planCall({ name: 'add_day', args: { name: 'Annem', kind: 'Doğum günü', day: 2, month: 12, year: 1972, rel: 'Aile' } }, S.getState(), NOW),
    T.planCall({ name: 'add_class', args: { name: 'Fizik', day: 2, start: '10:00', end: '11:50', room: 'B-203' } }, S.getState(), NOW),
  ];
  assert.ok(plans.every((p) => p.ok), plans.map((p) => p.error).join(';'));
  assert.equal(plans[0].line, 'Dişçi · 21 Kasım Cumartesi 15:00 · 1 saat önce hatırlat');
  assert.equal(plans[1].line, `Kira · Kira · ${money.format(18500)} · her ayın 5'i`); // uygulamanın para biçimi
  assert.equal(JSON.stringify(S.getState()), before, 'planlamak hiçbir şey yazmaz');
  const res = T.createApproval(plans).approve();
  assert.equal(res.status, 'done');
  assert.ok(res.results.every((r) => r.ok));
  const st = S.getState();
  const task = st.tasks[0];
  assert.deepEqual([task.title, task.date, task.time, task.remind, task.prio, task.done], ['Dişçi', '2026-11-21', '15:00', '60', 'normal', false]);
  assert.deepEqual([st.bills[0].name, st.bills[0].amount, st.bills[0].day], ['Kira', 18500, 5]);
  assert.equal(st.exams[0].room, 'B-1');
  assert.equal(st.days[0].year, 1972);
  assert.deepEqual([st.classes[0].day, st.classes[0].start, st.classes[0].end], [2, '10:00', '11:50']);

  const p2 = [
    T.planCall({ name: 'postpone_task', args: { id: task.id, date: '2026-11-23' } }, S.getState(), NOW),
    T.planCall({ name: 'mark_bill_paid', args: { id: st.bills[0].id, month: '2026-11' } }, S.getState(), NOW),
  ];
  assert.ok(p2.every((p) => p.ok));
  assert.equal(p2[0].line, 'Dişçi · 21 Kasım Cumartesi → 23 Kasım Pazartesi');
  T.createApproval(p2).approve();
  assert.equal(S.getState().tasks[0].date, '2026-11-23');
  assert.deepEqual(S.getState().bills[0].paid, ['2026-11']);
  const done = T.planCall({ name: 'complete_task', args: { id: task.id } }, S.getState(), NOW);
  T.createApproval([done]).approve();
  assert.equal(S.getState().tasks[0].done, true);
  assert.equal(S.getState().tasks[0].doneAt, NOW.toISOString());
  assert.equal(T.planCall({ name: 'complete_task', args: { id: task.id } }, S.getState(), NOW).ok, false); // zaten bitti
  assert.equal(T.planCall({ name: 'mark_bill_paid', args: { id: st.bills[0].id, month: '2026-11' } }).ok, false); // zaten ödendi
});

await test('şema dışı: bilinmeyen alan, eksik alan, bilinmeyen araç/id/tür, PIN ve platform reddedilir; geçersiz değer şema hatası', () => {
  const phone = seed();
  const acc = S.getState().accounts[0];
  const no = (call, re) => {
    const p = T.planCall(call, S.getState(), NOW);
    assert.equal(p.ok, false, JSON.stringify(call));
    if (re) assert.match(p.error, re);
  };
  no({ name: 'add_task', args: { title: 'x', password: 'y' } }, /password/);
  no({ name: 'add_task', args: {} }, /title/);
  no({ name: 'hack', args: {} }, /Bilinmeyen araç/);
  no({ name: 'complete_task', args: { id: 'yok' } }, /bulunamadı/);
  no({ name: 'update_record', args: { type: 'phones', id: phone.id, patch: { pin: '0000' } } }, /pin/);
  no({ name: 'update_record', args: { type: 'accounts', id: acc.id, patch: { platform: 'OKX' } } }, /platform/);
  no({ name: 'update_record', args: { type: 'tasks', id: S.getState().tasks[0].id, patch: { foo: 1 } } }, /foo/);
  no({ name: 'update_record', args: { type: 'vault', id: 'x', patch: { a: 1 } } }, /tür/);
  no({ name: 'update_record', args: { type: 'tasks', id: S.getState().tasks[0].id, patch: { date: '2026-13-40' } } }, /date/);
  no({ name: 'add_bill', args: { name: 'x', cat: 'Kira', day: 40 } }, /day/);
  no({ name: 'add_class', args: { name: 'x', day: 2, start: '12:00', end: '11:00' } }, /end/);
  // Geçerli güncelleme: yalnızca patch'teki alan değişir, özet eski → yeni
  const ok = T.planCall({ name: 'update_record', args: { type: 'phones', id: phone.id, patch: { color: 'Siyah' } } }, S.getState(), NOW);
  assert.ok(ok.ok);
  assert.match(ok.line, /color: Mavi → Siyah/);
  T.createApproval([ok]).approve();
  assert.equal(S.getState().phones[0].color, 'Siyah');
  assert.equal(S.getState().phones[0].pin, '7319'); // PIN'e dokunulmadı
});

await test('onaysız değişiklik yok: planlamak ve vazgeçmek store\'u değiştirmez; vazgeçme yanıtı modele gider', () => {
  seed();
  const before = JSON.stringify(S.getState());
  const calls = [{ id: 'c1', name: 'add_task', args: { title: 'Deneme' } }, { id: 'c2', name: 'delete_record', args: { type: 'bills', id: S.getState().bills[0].id } }];
  const plans = calls.map((c) => T.planCall(c, S.getState(), NOW));
  const ap = T.createApproval(plans);
  const results = ap.cancel();
  assert.equal(JSON.stringify(S.getState()), before);
  assert.deepEqual(ap.approve(), { status: 'settled' }); // vazgeçildikten sonra onay işlemez
  assert.equal(JSON.stringify(S.getState()), before);
  const parts = T.responseParts(calls, results);
  assert.deepEqual(parts.map((p) => [p.functionResponse.name, p.functionResponse.id]), [['add_task', 'c1'], ['delete_record', 'c2']]);
  assert.match(parts[0].functionResponse.response.result, /vazgeçti/);
});

await test('silme iki adım: ilk onay "armed" (silmez), ikinci onay siler; Geri al ile döner', () => {
  seed();
  const bill = S.getState().bills[0];
  const plan = T.planCall({ id: 'd1', name: 'delete_record', args: { type: 'bills', id: bill.id } }, S.getState(), NOW);
  assert.ok(plan.ok && plan.danger);
  assert.equal(plan.title, 'Ödeme sil');
  const ap = T.createApproval([plan]);
  assert.equal(ap.approve(), 'armed');
  assert.ok(S.getState().bills.some((b) => b.id === bill.id), 'ilk onayda silinmedi');
  const res = ap.approve();
  assert.equal(res.status, 'done');
  assert.ok(!S.getState().bills.some((b) => b.id === bill.id));
  S.restore(res.before);
  assert.ok(S.getState().bills.some((b) => b.id === bill.id));
  // Silme içermeyen kart tek adım; karışık listede (ekle + sil) iki adım
  const mixed = T.createApproval([T.planCall({ name: 'add_task', args: { title: 'a' } }), T.planCall({ name: 'delete_record', args: { type: 'bills', id: bill.id } })]);
  assert.equal(mixed.approve(), 'armed');
  assert.equal(S.getState().tasks.filter((t) => t.title === 'a').length, 0);
  mixed.approve();
  assert.equal(S.getState().tasks.filter((t) => t.title === 'a').length, 1);
});

await test('uygulama sırasında şema hatası: sonuçta hata, kayıt yazılmaz, diğerleri uygulanır', () => {
  S.resetAll();
  const good = T.planCall({ name: 'add_task', args: { title: 'iyi' } });
  const broken = { ok: true, name: 'add_task', title: 'x', line: 'x', danger: false, run: () => S.add('tasks', { title: '' }) };
  const res = T.createApproval([good, broken]).approve();
  assert.equal(res.results[0].ok, true);
  assert.equal(res.results[1].ok, false);
  assert.match(res.results[1].error, /title/);
  assert.equal(S.getState().tasks.length, 1);
  const parts = T.responseParts([{ name: 'add_task' }, { name: 'add_task' }], res.results);
  assert.ok(parts[1].functionResponse.response.error);
});

await test('araç tanımları: her araç adı benzersiz, update patch\'inde pin/platform yok, sistem talimatı Türkçe ve emojisiz', () => {
  assert.equal(new Set(D.TOOL_NAMES).size, D.TOOL_NAMES.length);
  assert.deepEqual(D.TOOL_NAMES, ['add_task', 'complete_task', 'postpone_task', 'add_bill', 'mark_bill_paid', 'add_exam', 'add_day', 'add_class', 'update_record', 'delete_record']);
  const patch = D.TOOLS.find((t) => t.name === 'update_record').parameters.properties.patch.properties;
  assert.ok(!('pin' in patch) && !('platform' in patch) && !('extra' in patch));
  assert.match(D.SYSTEM, /Tamarin'sin/);
  assert.match(D.SYSTEM, /Kasa/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(D.SYSTEM));
});

await test('ayarlar: erişim kodu ve adres yapıştırma artıklarından temizlenir; ulaşılamayan Worker "unreachable"', async () => {
  const K = await import('../js/assistant/config.js');
  const setOnline = (onLine) => Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true, writable: true });
  assert.equal(K.cleanToken(' abc-123​\n'), 'abc-123');
  assert.equal(K.cleanToken('kod x'), 'kodx');
  assert.equal(K.cleanUrl(' https://tamarin-asistan.ornek.workers.dev​ '), 'https://tamarin-asistan.ornek.workers.dev');
  const saved = K.saveConfig({ url: ' https://ornek.test ', token: 'x y\n' });
  assert.deepEqual([saved.url, saved.token], ['https://ornek.test', 'xy']);
  assert.ok(!JSON.stringify(S.exportData()).includes('ornek.test'), 'asistan ayarları yedeğe girmez');
  setOnline(true);
  globalThis.fetch = async () => { throw new TypeError('Load failed'); };
  await assert.rejects(K.callWorker('/ping', {}), (e) => e.code === 'unreachable');
  setOnline(false);
  await assert.rejects(K.callWorker('/ping', {}), (e) => e.code === 'offline');
  await assert.rejects(K.callWorker('/ping', {}, { config: { url: 'http://kotu.example', token: 'a' } }), (e) => e.code === 'bad_url');
  setOnline(true);
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer xy');
    assert.equal(String(url), 'https://ornek.test/ping');
    return new Response(JSON.stringify({ error: 'auth' }), { status: 401 });
  };
  await assert.rejects(K.callWorker('/ping', {}), (e) => e.code === 'auth');
});

console.log(`\n${passed} test geçti${process.exitCode ? ', bazıları başarısız' : ''}.`);
