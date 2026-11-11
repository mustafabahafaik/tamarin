// Eğitim testi: node tests/school.test.mjs   (proje kökünden; harici kütüphane yok)
// Şimdi/sıradaki ders, boşluk, çakışma, sınav geri sayımı, geçmiş/gelecek ayrımı, dilim özeti.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const St = await import('../js/status.js');
const S = await import('../js/store.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

// 11 Kasım 2026 Çarşamba (ISO gün 3), İstanbul saati
const at = (hhmm, date = '2026-11-11') => new Date(`${date}T${hhmm}:00+03:00`);
const cls = (id, start, end, day = 3, name = id) => ({ id, name, day, start, end, room: '', teacher: '' });
const program = [cls('Fizik', '09:00', '10:50'), cls('Kimya', '11:00', '12:00'), cls('Tarih', '13:15', '14:00'), cls('Pazartesi dersi', '09:00', '10:00', 1)];

const states = (items) => items.filter((i) => i.type === 'class').map((i) => `${i.entry.id}:${i.state}`).join(' ');

await test('şimdi: süren ders "Şimdi" + ilerleme, sıradaki "Sıradaki · 40 dk sonra", bitenler geçmiş', () => {
  const items = St.daySchedule(program, 3, at('10:20'));
  assert.equal(states(items), 'Fizik:live Kimya:next Tarih:later');
  const live = items.find((i) => i.state === 'live');
  assert.equal(live.label, 'Şimdi');
  assert.equal(Math.round(live.progress * 100), 73); // 80 / 110 dk
  assert.equal(items.find((i) => i.state === 'next').label, 'Sıradaki · 40 dk sonra');
  assert.equal(states(St.daySchedule(program, 3, at('12:30'))), 'Fizik:past Kimya:past Tarih:next');
  assert.equal(St.daySchedule(program, 3, at('12:30')).find((i) => i.state === 'next').label, 'Sıradaki · 45 dk sonra');
  assert.equal(states(St.daySchedule(program, 3, at('15:00'))), 'Fizik:past Kimya:past Tarih:past');
  assert.equal(states(St.daySchedule(program, 3, at('07:00'))), 'Fizik:next Kimya:later Tarih:later');
  assert.equal(St.daySchedule(program, 3, at('07:00')).find((i) => i.state === 'next').label, 'Sıradaki · 2 sa sonra');
});

await test('başka gün seçiliyken şimdi/sıradaki yok; o günün dersleri sıralı', () => {
  assert.equal(states(St.daySchedule(program, 3, at('10:20'), false)), 'Fizik:later Kimya:later Tarih:later');
  assert.equal(states(St.daySchedule(program, 1, at('10:20'), false)), 'Pazartesi dersi:later');
  assert.equal(St.daySchedule(program, 6, at('10:20'), false).length, 0);
});

await test('boşluk: 30 dk üstü satır olur ("1 sa 15 dk boşluk"), 30 dk ve altı olmaz', () => {
  const gaps = St.daySchedule(program, 3, at('08:00')).filter((i) => i.type === 'gap');
  assert.deepEqual(gaps.map((g) => g.label), ['1 sa 15 dk boşluk']); // 12:00 → 13:15; 10:50 → 11:00 yalnızca 10 dk
  const exactly30 = [cls('A', '09:00', '10:00'), cls('B', '10:30', '11:00')];
  assert.equal(St.daySchedule(exactly30, 3, at('08:00')).filter((i) => i.type === 'gap').length, 0);
  const overlapping = [cls('A', '09:00', '12:00'), cls('B', '10:00', '11:00'), cls('C', '12:45', '13:00')];
  assert.deepEqual(St.daySchedule(overlapping, 3, at('08:00')).filter((i) => i.type === 'gap').map((g) => g.minutes), [45]);
  assert.equal(St.durationLabel(45), '45 dk');
  assert.equal(St.durationLabel(120), '2 sa');
});

await test('çakışma: üst üste binen bulunur; uç uca, başka gün ve kendisi sayılmaz', () => {
  const names = (list) => list.map((c) => c.id).join(',');
  assert.equal(names(St.classConflicts(program, cls('Yeni', '10:30', '11:30'))), 'Fizik,Kimya');
  assert.equal(names(St.classConflicts(program, cls('Yeni', '10:50', '11:00'))), '');
  assert.equal(names(St.classConflicts(program, cls('Yeni', '09:30', '10:30', 2))), '');
  assert.equal(names(St.classConflicts(program, { ...program[0] })), '');
  assert.equal(names(St.classConflicts(program, cls('Yeni', '08:00', '15:00'))), 'Fizik,Kimya,Tarih');
});

const exam = (id, date, time = '', type = 'Vize') => ({ id, course: id, type, date, time, room: '', note: '' });

await test('geri sayım: Bugün / Yarın / 9 gün, renk seviyesi ve ayrıntı', () => {
  const now = at('06:00');
  const c = (e) => St.examCountdown(e, now);
  assert.deepEqual([c(exam('a', '2026-11-11', '10:00')).short, c(exam('a', '2026-11-11', '10:00')).level], ['Bugün', 'today']);
  assert.equal(c(exam('a', '2026-11-11', '10:00')).detail, '4 saat');
  assert.equal(St.examCountdown(exam('a', '2026-11-11', '10:00'), at('07:35')).detail, '2 saat 25 dk');
  assert.equal(St.examCountdown(exam('a', '2026-11-20', '06:00'), now).detail, '9 gün');
  assert.deepEqual([c(exam('b', '2026-11-12')).short, c(exam('b', '2026-11-12')).level], ['Yarın', 'urgent']);
  assert.equal(c(exam('c', '2026-11-13')).level, 'urgent');      // 2 gün
  assert.equal(c(exam('d', '2026-11-18')).level, 'soon');        // 7 gün
  assert.deepEqual([c(exam('e', '2026-11-20', '10:00')).short, c(exam('e', '2026-11-20', '10:00')).level], ['9 gün', 'later']);
  assert.equal(c(exam('e', '2026-11-20', '10:00')).detail, '9 gün 4 saat');
  assert.equal(St.examCountdown(exam('a', '2026-11-11', '10:00'), at('11:00')).detail, 'Başladı');
  assert.deepEqual([c(exam('f', '2026-11-08')).short, c(exam('f', '2026-11-08')).level], ['3 gün önce', 'past']);
});

await test('geçmiş/gelecek: bugün gelecekte kalır; yaklaşanlar en yakın önce, geçmişler en yeni önce', () => {
  const list = [exam('dün', '2026-11-10'), exam('bugün', '2026-11-11', '15:00'), exam('ocak', '2027-01-12', '10:00'), exam('ekim', '2026-10-20'), exam('bugün-sabah', '2026-11-11', '09:00')];
  const { upcoming, past } = St.splitExams(list, at('20:00'));
  assert.deepEqual(upcoming.map((e) => e.id), ['bugün-sabah', 'bugün', 'ocak']);
  assert.deepEqual(past.map((e) => e.id), ['dün', 'ekim']);
  assert.equal(St.examWhen({ ...exam('x', '2027-01-12', '10:00'), room: 'B-201' }), '12 Ocak Salı 10:00 · B-201');
});

await test('ana ekran: mavi dilim özeti ve ruh hali', () => {
  S.resetAll();
  const summary = (when) => St.computeStatus(when, S.getState()).summaries.school;
  assert.equal(summary(at('12:00')), 'Bugün ders yok');
  S.add('classes', { name: 'Fizik', day: 3, start: '09:00', end: '10:50' });
  S.add('classes', { name: 'Kimya', day: 3, start: '11:00', end: '12:00' });
  S.add('classes', { name: 'Tarih', day: 3, start: '13:15', end: '14:00' });
  assert.equal(summary(at('12:00')), 'Bugün 3 ders');
  S.add('exams', { course: 'Fizik', type: 'Final', date: '2026-11-20', time: '10:00' });
  assert.equal(summary(at('12:00')), 'Final 9 gün');
  assert.notEqual(St.computeStatus(at('12:00'), S.getState()).mood, 'worried');
  S.add('exams', { course: 'Kimya', type: 'Quiz', date: '2026-11-11', time: '16:00' });
  assert.equal(summary(at('12:00')), 'Quiz bugün');
  assert.equal(St.computeStatus(at('12:00'), S.getState()).mood, 'worried');
  // Bugün şeridi: sıradaki ders
  assert.equal(St.todayCards(at('10:20'), S.getState())[0].label, 'Şimdi · bitiş 10:50');
});

await test('alt yazı: bugünkü sınavı yarınki özel gün örtmez; aynı günse sınav önce', () => {
  S.resetAll();
  const message = () => St.computeStatus(at('12:00'), S.getState()).message;
  S.add('days', { name: 'Ayşe', kind: 'Doğum günü', day: 12, month: 11, rel: 'Arkadaş' });
  assert.match(message(), /^Yarın .*doğum günü$/);
  const quiz = S.add('exams', { course: 'Kimya', type: 'Quiz', date: '2026-11-11', time: '16:00' });
  assert.equal(message(), 'Bugün Kimya quizi var');
  S.remove('exams', quiz.id);
  S.add('exams', { course: 'Fizik', type: 'Final', date: '2026-11-12' });
  assert.equal(message(), 'Yarın Fizik finali var');
});

console.log(`\n${passed} test geçti${process.exitCode ? ', başarısız olan var' : ''}`);
