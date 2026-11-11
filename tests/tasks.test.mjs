// Ajanda testi: node tests/tasks.test.mjs   (proje kökünden; harici kütüphane yok)
// Türkçe ifade algılama, gruplama, erteleme, gecikme, tamamlananlar, dilim özeti.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const St = await import('../js/status.js');
const S = await import('../js/store.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const day = (y, m, d) => new Date(y, m - 1, d);
const today = day(2026, 11, 11); // Çarşamba
const at = (hhmm, date = '2026-11-11') => new Date(`${date}T${hhmm}:00+03:00`);
const task = (id, date, extra = {}) => ({ id, title: id, date, time: '', remind: 'none', prio: 'normal', note: '', done: false, doneAt: '', ...extra });

await test('ifade algılama: tarih, saat ve başlık (26 örnek)', () => {
  const cases = [
    ['yarın 14:00 dişçi', 'Dişçi', '2026-11-12', '14:00'],
    ['2 gün sonra kargo', 'Kargo', '2026-11-13', null],
    ['iki gün sonra fatura yatır', 'Fatura yatır', '2026-11-13', null],
    ['cuma 15:30 toplantı', 'Toplantı', '2026-11-13', '15:30'],
    ["saat 3'te berber", 'Berber', null, '15:00'],
    ['haftaya pazartesi sunum', 'Sunum', '2026-11-16', null],
    ['haftaya rapor', 'Rapor', '2026-11-18', null],
    ['bugün market alışverişi', 'Market alışverişi', '2026-11-11', null],
    ["akşam 8'de yemek", 'Yemek', null, '20:00'],
    ['sabah 9’da koşu', 'Koşu', null, '09:00'],                 // iPhone'un kıvrık kesme işareti
    ['15 aralık doktor', 'Doktor', '2026-12-15', null],
    ['yarından sonra kitap iade', 'Kitap iade', '2026-11-13', null],
    ['çarşamba toplantı', 'Toplantı', '2026-11-18', null],      // bugün çarşamba → gelecek hafta
    ['doktor randevusu', 'Doktor randevusu', null, null],
    ["saat 10.30'da ders", 'Ders', null, '10:30'],
    ['pazar günü kahvaltı', 'Kahvaltı', '2026-11-15', null],
    ['3 buçukta çay', 'Çay', null, '15:30'],
    ['1 hafta sonra rapor', 'Rapor', '2026-11-18', null],
    ['Yarına kadar ödev', 'Ödev', '2026-11-12', null],
    ['cumartesi maç', 'Maç', '2026-11-14', null],               // "cuma" ile karışmaz
    ['İlaç al yarın', 'İlaç al', '2026-11-12', null],
    ["ayın 20'si kira", 'Kira', '2026-11-20', null],
    ["gece 2'de nöbet", 'Nöbet', null, '02:00'],
    ['cumaya kadar proje', 'Proje', '2026-11-13', null],
    ['pazara git', 'Pazara git', null, null],                   // "pazar" burada çarşı
    ['haftaya cuma 09:15 veli toplantısı', 'Veli toplantısı', '2026-11-20', '09:15'],
  ];
  for (const [text, title, date, time] of cases) {
    assert.deepEqual(St.parseQuick(text, today), { title, date, time }, text);
  }
});

await test('ifade algılama: yalnızca tarih yazılırsa başlık boş kalır, 5 Kasım geçtiyse seneye', () => {
  assert.deepEqual(St.parseQuick('yarın', today), { title: '', date: '2026-11-12', time: null });
  assert.equal(St.parseQuick('5 kasım', today).date, '2027-11-05');
  assert.equal(St.parseQuick('30 şubat parti', today).date, null);
});

await test('gruplama: Gecikmiş, Bugün, Yarın, Bu hafta, Daha sonra, Tarihsiz; grup içi sıra', () => {
  const tasks = [
    task('sonra', '2026-11-16'), task('tarihsiz-1', ''), task('gecikmis', '2026-11-09'),
    task('bugun-saatsiz', '2026-11-11'), task('bugun-15', '2026-11-11', { time: '15:00' }), task('bugun-09', '2026-11-11', { time: '09:00' }),
    task('bugun-onemli', '2026-11-11', { prio: 'high' }), task('yarin', '2026-11-12'), task('cuma', '2026-11-13'), task('pazar', '2026-11-15'),
    task('bitti', '2026-11-11', { done: true, doneAt: '2026-11-11T08:00:00.000Z' }), task('tarihsiz-onemli', '', { prio: 'high' }),
  ];
  const groups = St.taskGroups(tasks, today);
  assert.deepEqual(groups.map((g) => `${g.title}: ${g.items.map((i) => i.task.id).join(',')}`), [
    'Gecikmiş: gecikmis',
    'Bugün: bugun-09,bugun-15,bugun-onemli,bugun-saatsiz',
    'Yarın: yarin',
    'Bu hafta: cuma,pazar',
    'Daha sonra: sonra',
    'Tarihsiz: tarihsiz-onemli,tarihsiz-1',
  ]);
  // Pazar günü "Bu hafta" boştur: yarın pazartesi, salı "Daha sonra"
  const sunday = St.taskGroups([task('pzt', '2026-11-16'), task('sali', '2026-11-17')], day(2026, 11, 15));
  assert.deepEqual(sunday.map((g) => g.key), ['tomorrow', 'later']);
});

await test('gecikme ve alt yazı: "2 gün gecikti · 14:00", "Yarın · 14:00", gün adı, tarih', () => {
  assert.equal(St.taskWhen(task('a', '2026-11-09', { time: '14:00' }), today), '2 gün gecikti · 14:00');
  assert.equal(St.taskWhen(task('a', '2026-11-11'), today), 'Bugün');
  assert.equal(St.taskWhen(task('a', '2026-11-12', { time: '14:00' }), today), 'Yarın · 14:00');
  assert.equal(St.taskWhen(task('a', '2026-11-13'), today), 'Cuma');
  assert.equal(St.taskWhen(task('a', '2026-11-24'), today), '24 Kasım');
  assert.equal(St.taskWhen(task('a', '2027-01-05'), today), '5 Ocak 2027');
  assert.equal(St.taskWhen(task('a', ''), today), '');
});

await test('erteleme: gecikmiş/bugün/tarihsiz → yarın, ileri tarihli → bir gün sonrası', () => {
  assert.equal(St.postponeDate(task('a', '2026-11-08'), today), '2026-11-12');
  assert.equal(St.postponeDate(task('a', '2026-11-11'), today), '2026-11-12');
  assert.equal(St.postponeDate(task('a', ''), today), '2026-11-12');
  assert.equal(St.postponeDate(task('a', '2026-11-20'), today), '2026-11-21');
  assert.equal(St.postponeLabel(task('a', '2026-11-11'), today), 'Yarına ertele');
  assert.equal(St.postponeLabel(task('a', '2026-11-20'), today), '1 gün ertele');
});

await test('şema: tarihsiz görevde saat olmaz; tamamlanma zamanı yalnızca bitmiş görevde', () => {
  S.resetAll();
  const undated = S.add('tasks', { title: 'Kitap oku', date: '', time: '10:00' });
  assert.equal(undated.date, '');
  assert.equal(undated.time, '');
  const t = S.add('tasks', { title: 'Dişçi', date: '2026-11-12', time: '14:00' });
  const done = S.update('tasks', t.id, { done: true, doneAt: '2026-11-11T10:20:00.000Z' });
  assert.equal(done.doneAt, '2026-11-11T10:20:00.000Z');
  assert.equal(S.update('tasks', t.id, { done: false }).doneAt, '');
  assert.throws(() => S.add('tasks', { title: '', date: '2026-11-12' }));
  assert.throws(() => S.add('tasks', { title: 'x', date: '2026-02-30' }));
});

await test('tamamlananlar: en son tamamlanan önce; "Bugün 13:20" / "Dün"', () => {
  const list = St.completedTasks([
    task('eski', '2026-11-01', { done: true, doneAt: new Date(2026, 10, 9, 11, 0).toISOString() }),
    task('acik', '2026-11-12'),
    task('yeni', '2026-11-11', { done: true, doneAt: new Date(2026, 10, 11, 13, 20).toISOString() }),
    task('zamansiz', '2026-11-11', { done: true }),
  ]);
  assert.deepEqual(list.map((t) => t.id), ['yeni', 'eski', 'zamansiz']);
  assert.equal(St.doneWhen(list[0], at('15:00')), 'Bugün 13:20');
  assert.equal(St.doneWhen(task('x', '', { done: true, doneAt: new Date(2026, 10, 10, 12, 0).toISOString() }), at('15:00')), 'Dün');
});

await test('ana ekran: yeşil dilim özeti, ruh hali, mesaj ve "Bugün" kartları', () => {
  S.resetAll();
  const status = () => St.computeStatus(at('12:00'), S.getState());
  assert.equal(status().summaries.tasks, 'Boş');
  S.add('tasks', { title: 'Tarihsiz iş', date: '' });
  S.add('tasks', { title: 'Sunum', date: '2026-11-16' });
  assert.equal(status().summaries.tasks, 'Bugün boş');
  assert.equal(status().upcoming.filter((i) => i.cat === 'tasks').length, 1); // tarihsiz zile girmez
  const a = S.add('tasks', { title: 'Market', date: '2026-11-11', time: '18:00' });
  S.add('tasks', { title: 'Kargo', date: '2026-11-11' });
  S.add('tasks', { title: 'Fatura', date: '2026-11-11' });
  assert.equal(status().summaries.tasks, 'Bugün 3 iş');
  assert.equal(status().message, 'Bugün 3 işin var');
  assert.notEqual(status().mood, 'worried');
  const late = S.add('tasks', { title: 'Vergi', date: '2026-11-09', time: '10:00' });
  assert.equal(status().summaries.tasks, '1 gecikmiş');
  assert.equal(status().mood, 'worried');
  assert.equal(status().message, 'Vergi gecikti');
  assert.ok(status().urgent);
  const cards = St.todayCards(at('12:00'), S.getState()).filter((c) => c.cat === 'tasks');
  assert.equal(cards[0].label, '2 gün gecikti');
  assert.equal(cards[1].label, 'Bugün 18:00');
  S.update('tasks', late.id, { done: true, doneAt: new Date().toISOString() });
  S.update('tasks', a.id, { date: St.postponeDate(a, today) });
  assert.equal(status().summaries.tasks, 'Bugün 2 iş');
  assert.notEqual(status().mood, 'worried');
});

console.log(`\n${passed} test geçti${process.exitCode ? ', başarısız olan var' : ''}`);
