// Takvim testi: node tests/ics.test.mjs   (proje kökünden; harici kütüphane yok)
// RFC 5545: CRLF, kaçış, 75 bayt katlama (Türkçe karakterler bölünmeden), floating saat, VALUE=DATE,
// RRULE'ler (ay sonu kayması, 29 Şubat, UNTIL), alarmlar, teslim zinciri, "yeni ve değişenler" hash'i.
// Örnek dosya: tests/fixtures/ornek.ics (UPDATE_FIXTURES=1 ile yeniden yazılır).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const I = await import('../js/ics.js');
const S = await import('../js/store.js');
const D = await import('../js/dates.js');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { console.log(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

const today = new Date(2026, 10, 11);                  // 11 Kasım 2026 Çarşamba
const stampAt = new Date(Date.UTC(2026, 10, 11, 8, 0, 0));
const base = { semesterEnd: '', calendar: { exported: {}, last: null }, bills: [], classes: [], exams: [], days: [], tasks: [] };
const bill = (id, day, extra = {}) => ({ id, name: 'Kira', cat: 'Kira', amount: 12500, day, note: '', paid: [], ...extra });
const event = (type, rec, state = base) => I.eventFor(type, rec, { today, state }).event;
const ics = (type, rec, state = base) => I.buildCalendar([event(type, rec, state)], stampAt);
const unfold = (text) => text.replace(/\r\n /g, '');
const prop = (text, name) => unfold(text).split('\r\n').filter((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
const blocks = (text, name) => unfold(text).split(`BEGIN:${name}\r\n`).slice(1).map((b) => b.split(`END:${name}`)[0]);

/* ---------- Biçim ---------- */

await test('kaçış: ters bölü, noktalı virgül, virgül, yeni satır', () => {
  assert.equal(I.escapeText('a,b;c\\d\ne\r\nf'), 'a\\,b\\;c\\\\d\\ne\\nf');
  assert.equal(I.escapeText('Dişçi: 14:00'), 'Dişçi: 14:00'); // iki nokta kaçılmaz
});

await test('katlama: her satır ≤ 75 bayt, devam satırı boşlukla, Türkçe karakter bölünmez', () => {
  const long = `DESCRIPTION:${I.escapeText('Ğüşıöç İĞÜŞÖÇ çiğköfte, şeftali; ılık ğ ü ş ı ö ç '.repeat(6))}`;
  const folded = I.foldLine(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 3);
  const strict = new TextDecoder('utf-8', { fatal: true });
  lines.forEach((line, i) => {
    const bytes = new TextEncoder().encode(line);
    assert.ok(bytes.length <= 75, `${i}. satır ${bytes.length} bayt`);
    if (i > 0) assert.equal(line[0], ' ');
    strict.decode(bytes); // yarım UTF-8 dizisi varsa fırlatır
  });
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.equal(I.foldLine('SUMMARY:Kısa'), 'SUMMARY:Kısa');
});

await test('takvim başlığı, CRLF ve DTSTAMP', () => {
  const text = ics('bills', bill('k', 5));
  assert.ok(text.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(text), 'tek başına LF olmamalı');
  for (const line of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tamarin//TR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Tamarin', 'X-WR-TIMEZONE:Europe/Istanbul', 'END:VCALENDAR']) {
    assert.ok(text.includes(`${line}\r\n`), line);
  }
  assert.deepEqual(prop(text, 'DTSTAMP'), ['DTSTAMP:20261111T080000Z']);
  assert.deepEqual(prop(text, 'UID'), ['UID:bill-k@tamarin']);
});

/* ---------- Kayıt türleri ---------- */

// Basit RRULE açıcı (yalnızca testte): FREQ=MONTHLY + BYMONTHDAY + BYSETPOS, FREQ=YEARLY + BYMONTH/BYMONTHDAY.
function occurrences(rrule, start, count) {
  const p = Object.fromEntries(rrule.split(';').map((x) => x.split('=')));
  const out = [];
  for (let k = 0; out.length < count && k < count * 14; k++) {
    const y = p.FREQ === 'YEARLY' ? start.getFullYear() + k : start.getFullYear();
    const m = p.FREQ === 'YEARLY' ? (p.BYMONTH ? Number(p.BYMONTH) - 1 : start.getMonth()) : start.getMonth() + k;
    const dim = new Date(y, m + 1, 0).getDate();
    let days = (p.BYMONTHDAY ? p.BYMONTHDAY.split(',').map(Number) : [start.getDate()]).map((d) => (d < 0 ? dim + 1 + d : d));
    days = [...new Set(days.filter((d) => d >= 1 && d <= dim))].sort((a, b) => a - b);
    if (p.BYSETPOS) days = [days.at(Number(p.BYSETPOS) < 0 ? Number(p.BYSETPOS) : Number(p.BYSETPOS) - 1)].filter(Boolean);
    out.push(...days.map((d) => D.ymd(new Date(y, m, d))));
  }
  return out.slice(0, count);
}

await test('ödeme: tüm gün, aylık; "Kira ödemesi · ₺12.500"; alarmlar 1 gün önce ve aynı gün 09:00', () => {
  const text = ics('bills', bill('k', 5, { note: 'IBAN: TR00, açıklama; Kasım' }));
  assert.deepEqual(prop(text, 'DTSTART'), ['DTSTART;VALUE=DATE:20261105']);
  assert.deepEqual(prop(text, 'DTEND'), ['DTEND;VALUE=DATE:20261106']);
  assert.deepEqual(prop(text, 'RRULE'), ['RRULE:FREQ=MONTHLY']);
  assert.deepEqual(prop(text, 'SUMMARY'), ['SUMMARY:Kira ödemesi · ₺12.500']);
  assert.ok(unfold(text).includes('DESCRIPTION:Kira\\nIBAN: TR00\\, açıklama\\; Kasım'));
  const alarms = blocks(text, 'VALARM');
  assert.equal(alarms.length, 2);
  assert.ok(alarms[0].includes('TRIGGER:-PT15H'));
  assert.ok(alarms[1].includes('TRIGGER:PT9H'));
  assert.equal(event('bills', bill('x', 3, { amount: 0, name: 'Aidat' })).summary, 'Aidat ödemesi');
});

await test('ödeme 29–31: ay sonuna kayan kural; 26 ay boyunca uygulamanın vadesiyle aynı gün', () => {
  assert.equal(I.monthlyRule(15), 'FREQ=MONTHLY');
  assert.equal(I.monthlyRule(29), 'FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1');
  assert.equal(I.monthlyRule(30), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
  assert.equal(I.monthlyRule(31), 'FREQ=MONTHLY;BYMONTHDAY=-1');
  for (const day of [15, 28, 29, 30, 31]) {
    const ev = event('bills', bill('k', day));
    const got = occurrences(ev.rrule, ev.start, 26);
    const expected = Array.from({ length: 26 }, (_, k) => {
      const first = new Date(2026, 10 + k, 1);
      return D.ymd(new Date(first.getFullYear(), first.getMonth(), D.clampDay(first.getFullYear(), first.getMonth() + 1, day)));
    });
    assert.deepEqual(got, expected, `gün ${day}`);
  }
  // Şubat örnekleri: 2027 artık değil, 2028 artık yıl
  const feb = (day) => occurrences(event('bills', bill('k', day)).rrule, event('bills', bill('k', day)).start, 26).filter((d) => d.slice(5, 7) === '02');
  assert.deepEqual(feb(29), ['2027-02-28', '2028-02-29']);
  assert.deepEqual(feb(30), ['2027-02-28', '2028-02-29']);
  assert.deepEqual(feb(31), ['2027-02-28', '2028-02-29']);
  // Neden başka kurallar değil: "30,-1" Ocak'ta iki kez, "28,29,30,31;BYSETPOS=-1" 30'u Ocak 31'e kaydırır.
  assert.deepEqual(occurrences('FREQ=MONTHLY;BYMONTHDAY=30,-1', new Date(2027, 0, 30), 2), ['2027-01-30', '2027-01-31']);
  assert.deepEqual(occurrences('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1', new Date(2027, 0, 1), 1), ['2027-01-31']);
});

await test('özel gün: tüm gün, yıllık, "Annemin doğum günü (54)"; 29 Şubat BYMONTH=2;BYMONTHDAY=-1', () => {
  const mom = { id: 'm', name: 'Annem', kind: 'Doğum günü', day: 12, month: 11, year: 1972, rel: 'Aile', note: '' };
  const text = ics('days', mom);
  assert.deepEqual(prop(text, 'SUMMARY'), ['SUMMARY:Annemin doğum günü (54)']);
  assert.deepEqual(prop(text, 'DTSTART'), ['DTSTART;VALUE=DATE:20261112']);
  assert.deepEqual(prop(text, 'RRULE'), ['RRULE:FREQ=YEARLY']);
  assert.deepEqual(blocks(text, 'VALARM').map((a) => a.match(/TRIGGER:(\S+)/)[1]), ['-PT15H', 'PT9H']);
  assert.ok(text.includes('UID:day-m@tamarin'));
  const leap = event('days', { id: 'l', name: 'Deniz', kind: 'Doğum günü', day: 29, month: 2, year: 2004, rel: 'Arkadaş', note: '' });
  assert.equal(leap.rrule, 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
  assert.equal(D.ymd(leap.start), '2027-02-28');
  assert.equal(leap.summary, "Deniz'in doğum günü (23)");
  assert.deepEqual(occurrences(leap.rrule, leap.start, 3), ['2027-02-28', '2028-02-29', '2029-02-28']);
  const anniv = event('days', { id: 'a', name: 'Evlilik', kind: 'Yıldönümü', day: 14, month: 2, year: 2024, rel: 'Sevgili', note: '' });
  assert.equal(anniv.summary, 'Evlilik yıldönümü (3. yıl)');
  assert.equal(event('days', { id: 'o', name: 'Öğretmenler Günü', kind: 'Özel gün', day: 24, month: 11, year: null, rel: 'Diğer', note: '' }).summary, 'Öğretmenler Günü');
});

await test('ders: saatli (floating), haftalık BYDAY, dönem sonu UNTIL, 15 dk önce alarm', () => {
  const cls = { id: 'c', name: 'Lineer Cebir', day: 3, start: '09:00', end: '10:50', room: 'A-101', teacher: 'Dr. Elif Arslan' };
  const plain = ics('classes', cls);
  assert.deepEqual(prop(plain, 'DTSTART'), ['DTSTART:20261111T090000']); // Z yok, TZID yok
  assert.deepEqual(prop(plain, 'DTEND'), ['DTEND:20261111T105000']);
  assert.deepEqual(prop(plain, 'RRULE'), ['RRULE:FREQ=WEEKLY;BYDAY=WE']);
  assert.deepEqual(prop(plain, 'SUMMARY'), ['SUMMARY:Lineer Cebir · A-101']);
  assert.deepEqual(prop(plain, 'LOCATION'), ['LOCATION:A-101']);
  assert.ok(blocks(plain, 'VALARM')[0].includes('TRIGGER:-PT15M'));
  const withEnd = ics('classes', { ...cls, day: 1 }, { ...base, semesterEnd: '2027-01-15' });
  assert.deepEqual(prop(withEnd, 'RRULE'), ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270115T235959']);
  assert.deepEqual(prop(withEnd, 'DTSTART'), ['DTSTART:20261116T090000']);
  assert.match(I.eventFor('classes', cls, { today, state: { ...base, semesterEnd: '2026-11-01' } }).reason, /Dönem bitmiş/);
});

await test('sınav: saatli, saat yoksa 09:00, 2 saat; "Veritabanı Finali · B-201"; 1 gün ve 2 saat önce', () => {
  const exam = { id: 'e', course: 'Veritabanı', type: 'Final', date: '2026-11-20', time: '10:00', room: 'B-201', note: '' };
  const text = ics('exams', exam);
  assert.deepEqual(prop(text, 'SUMMARY'), ['SUMMARY:Veritabanı Finali · B-201']);
  assert.deepEqual(prop(text, 'DTSTART'), ['DTSTART:20261120T100000']);
  assert.deepEqual(prop(text, 'DTEND'), ['DTEND:20261120T120000']);
  assert.deepEqual(blocks(text, 'VALARM').map((a) => a.match(/TRIGGER:(\S+)/)[1]), ['-P1D', '-PT2H']);
  const noTime = event('exams', { ...exam, time: '', room: '' });
  assert.equal(I.icsLocal(noTime.start), '20261120T090000');
  assert.equal(I.icsLocal(noTime.end), '20261120T110000');
  assert.equal(noTime.summary, 'Veritabanı Finali');
  assert.equal(event('exams', { ...exam, type: 'Ödev teslimi', room: '' }).summary, 'Veritabanı Ödev Teslimi');
  assert.match(I.eventFor('exams', { ...exam, date: '2026-11-10' }, { today, state: base }).reason, /Geçmiş/);
});

await test('görev: saatliyse seçilen hatırlatma (Yok = alarm yok), saatsizse tüm gün + 09:00, tarihsiz aktarılmaz', () => {
  const task = { id: 't', title: 'Dişçi', date: '2026-11-12', time: '14:00', remind: '60', prio: 'high', note: 'Sigorta kartı', done: false, doneAt: '' };
  const text = ics('tasks', task);
  assert.deepEqual(prop(text, 'SUMMARY'), ['SUMMARY:Dişçi']);
  assert.deepEqual(prop(text, 'DTSTART'), ['DTSTART:20261112T140000']);
  assert.deepEqual(prop(text, 'PRIORITY'), ['PRIORITY:1']);
  assert.deepEqual(blocks(text, 'VALARM').map((a) => a.match(/TRIGGER:(\S+)/)[1]), ['-PT1H']);
  const triggers = (remind) => event('tasks', { ...task, remind }).alarms.map((a) => a.trigger);
  assert.deepEqual(triggers('0'), ['PT0S']);
  assert.deepEqual(triggers('15'), ['-PT15M']);
  assert.deepEqual(triggers('1440'), ['-P1D']);
  assert.deepEqual(triggers('none'), []);
  assert.equal(blocks(ics('tasks', { ...task, remind: 'none' }), 'VALARM').length, 0);
  const allDay = ics('tasks', { ...task, time: '', remind: 'none' });
  assert.deepEqual(prop(allDay, 'DTSTART'), ['DTSTART;VALUE=DATE:20261112']);
  assert.deepEqual(blocks(allDay, 'VALARM').map((a) => a.match(/TRIGGER:(\S+)/)[1]), ['PT9H']);
  assert.match(I.eventFor('tasks', { ...task, date: '', time: '' }, { today, state: base }).reason, /Tarihsiz/);
  assert.match(I.eventFor('tasks', { ...task, done: true }, { today, state: base }).reason, /Tamamlanmış/);
});

await test('her VALARM: ACTION:DISPLAY ve dolu DESCRIPTION', () => {
  const all = I.buildCalendar([
    event('bills', bill('k', 31)),
    event('days', { id: 'm', name: 'Annem', kind: 'Doğum günü', day: 12, month: 11, year: 1972, rel: 'Aile', note: '' }),
    event('classes', { id: 'c', name: 'Fizik', day: 5, start: '10:00', end: '11:50', room: '', teacher: '' }),
    event('exams', { id: 'e', course: 'Fizik', type: 'Vize', date: '2026-11-20', time: '', room: '', note: '' }),
    event('tasks', { id: 't', title: 'Market', date: '2026-11-11', time: '', remind: 'none', prio: 'normal', note: '', done: false, doneAt: '' }),
  ], stampAt);
  const alarms = blocks(all, 'VALARM');
  assert.equal(alarms.length, 2 + 2 + 1 + 2 + 1);
  for (const a of alarms) {
    assert.ok(a.includes('ACTION:DISPLAY\r\n'));
    assert.match(a, /DESCRIPTION:\S+/);
  }
});

/* ---------- Seçim, hash ve teslim ---------- */

const fakeEnv = (overrides = {}) => {
  const calls = [];
  const env = {
    mobile: true,
    navigator: { canShare: () => true, share: async () => { calls.push('share'); } },
    open: (url) => calls.push(`open:${url.slice(0, 40)}`),
    download: (blob, name) => calls.push(`download:${name}:${blob.type}`),
    ...overrides,
  };
  return { env, calls };
};

await test('teslim: masaüstünde indir; telefonda paylaş, iptal, hata → data: adresi', async () => {
  const text = I.buildCalendar([event('bills', bill('k', 5))], stampAt);
  const commits = [];
  const commit = (r) => commits.push(r);

  let { env, calls } = fakeEnv({ mobile: false });
  assert.equal(await I.deliver(text, 'a.ics', commit, env), 'download');
  assert.deepEqual(calls, ['download:a.ics:text/calendar;charset=utf-8']);

  ({ env, calls } = fakeEnv());
  assert.equal(await I.deliver(text, 'a.ics', commit, env), 'share');
  assert.deepEqual(calls, ['share']);

  ({ env, calls } = fakeEnv({ navigator: { canShare: () => true, share: async () => { throw Object.assign(new Error('iptal'), { name: 'AbortError' }); } } }));
  assert.equal(await I.deliver(text, 'a.ics', commit, env), 'cancel');
  assert.deepEqual(calls, []);

  const order = [];
  ({ env } = fakeEnv({ navigator: { canShare: () => true, share: async () => { throw Object.assign(new Error('izin yok'), { name: 'NotAllowedError' }); } }, open: (url) => order.push(['open', url]) }));
  assert.equal(await I.deliver(text, 'a.ics', (r) => order.push(['commit', r]), env), 'data-url');
  assert.equal(order[0][0], 'commit'); // sayfadan ayrılmadan önce yazılır
  assert.match(order[0][1].note, /NotAllowedError: izin yok/);
  assert.ok(order[1][1].startsWith('data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR%0D%0A'));
  assert.equal(decodeURIComponent(order[1][1].split(',').slice(1).join(',')), text);

  ({ env, calls } = fakeEnv({ navigator: { canShare: () => false, share: async () => {} } }));
  assert.equal(await I.deliver(text, 'a.ics', commit, env), 'data-url');
  assert.match(commits.at(-1).note, /desteklemiyor/);
  ({ env, calls } = fakeEnv({ navigator: {} }));
  assert.equal(await I.deliver(text, 'a.ics', commit, env), 'data-url');
});

await test('"Sadece yeni ve değişenler": hash, iptal, değişiklik, dönem sonu, silinen kayıt', async () => {
  S.resetAll();
  const t0 = D.today0();
  const rent = S.add('bills', { name: 'Kira', cat: 'Kira', amount: 12500, day: 5 });
  const cls = S.add('classes', { name: 'Fizik', day: 2, start: '10:00', end: '11:00' });
  S.add('tasks', { title: 'Tarihsiz', date: '' });
  const task = S.add('tasks', { title: 'Dişçi', date: D.ymd(D.addDays(t0, 1)), time: '14:00', remind: '15' });
  assert.equal(I.pendingCount(), 3); // tarihsiz iş sayılmaz

  const share = fakeEnv().env;
  let result = await I.exportToCalendar({ mode: 'all' }, share);
  assert.deepEqual([result.ok, result.method, result.count], [true, 'share', 3]);
  assert.equal(S.getState().calendar.last.method, 'share');
  assert.equal(S.getState().calendar.last.count, 3);
  assert.equal(I.pendingCount(), 0);
  assert.deepEqual(await I.exportToCalendar({ mode: 'changed' }, share), { ok: false, count: 0, message: 'Aktarılacak yeni ya da değişen kayıt yok.' });

  S.update('tasks', task.id, { time: '15:00' });
  S.update('bills', rent.id, { paid: ['2026-11'] }); // ödendi işareti takvimi etkilemez
  assert.equal(I.pendingCount(), 1);
  const cancel = fakeEnv({ navigator: { canShare: () => true, share: async () => { throw Object.assign(new Error(''), { name: 'AbortError' }); } } }).env;
  result = await I.exportToCalendar({ mode: 'changed' }, cancel);
  assert.equal(result.method, 'cancel');
  assert.equal(I.pendingCount(), 1); // iptal edilen aktarım işaretlenmez
  result = await I.exportToCalendar({ mode: 'changed' }, share);
  assert.equal(result.count, 1);
  assert.equal(I.pendingCount(), 0);

  S.setField('semesterEnd', D.ymd(D.addDays(t0, 60)));
  assert.deepEqual(I.selectForCalendar({ mode: 'changed' }).entries.map((e) => e.rec.id), [cls.id]);

  S.remove('bills', rent.id);
  await I.exportToCalendar({ mode: 'one', type: 'classes', id: cls.id }, share);
  assert.ok(!Object.keys(S.getState().calendar.exported).some((k) => k.includes(rent.id)), 'silinen kaydın izi kalmaz');
  assert.deepEqual(await I.exportToCalendar({ mode: 'one', type: 'tasks', id: S.getState().tasks[0].id }, share), { ok: false, count: 0, message: 'Tarihsiz işler takvime aktarılmaz.' });
  // store şeması bozuk hash'i kabul etmez
  S.setField('calendar', { exported: { 'bills:x': 'zz', 'foo:y': '12345678' }, last: { at: 'dün', method: 'share' } });
  assert.deepEqual(S.getState().calendar, { exported: {}, last: null });
});

/* ---------- Örnek dosya ---------- */

await test('örnek takvim (tests/fixtures/ornek.ics) her türden kayıtla aynı kalır', () => {
  const state = {
    ...base,
    semesterEnd: '2027-01-15',
    bills: [bill('kira', 5), bill('elektrik', 31, { name: 'Elektrik', cat: 'Elektrik', amount: 640.5, note: 'Abone no: 123456, son ödeme günü ayın son günü; e-Devlet üzerinden ödenebilir, gecikirse faiz işler.' })],
    classes: [{ id: 'lineer', name: 'Lineer Cebir', day: 3, start: '09:00', end: '10:50', room: 'A-101', teacher: 'Dr. Öğr. Üyesi Elif Arslan' }],
    exams: [
      { id: 'vt-final', course: 'Veritabanı', type: 'Final', date: '2026-12-20', time: '10:00', room: 'B-201', note: '' },
      { id: 'algo-odev', course: 'Algoritmalar', type: 'Ödev teslimi', date: '2026-11-13', time: '', room: '', note: 'Moodle üzerinden' },
    ],
    days: [
      { id: 'annem', name: 'Annem', kind: 'Doğum günü', day: 12, month: 11, year: 1972, rel: 'Aile', note: 'Hediye fikri: çiçek, kitap; belki şal' },
      { id: 'deniz', name: 'Deniz', kind: 'Doğum günü', day: 29, month: 2, year: 2004, rel: 'Arkadaş', note: '' },
    ],
    tasks: [
      { id: 'disci', title: 'Dişçi', date: '2026-11-12', time: '14:00', remind: '60', prio: 'high', note: 'Sigorta kartını unutma', done: false, doneAt: '' },
      { id: 'market', title: 'Market alışverişi', date: '2026-11-11', time: '', remind: 'none', prio: 'normal', note: '', done: false, doneAt: '' },
      { id: 'kitap', title: 'Kitap oku', date: '', time: '', remind: 'none', prio: 'normal', note: '', done: false, doneAt: '' },
    ],
  };
  const { entries, skipped } = I.selectForCalendar({ state, today });
  assert.equal(entries.length, 9);
  assert.deepEqual(skipped.map((s) => s.rec.id), ['kitap']);
  const text = I.buildCalendar(entries.map((e) => e.event), stampAt);
  const path = new URL('./fixtures/ornek.ics', import.meta.url);
  if (process.env.UPDATE_FIXTURES || !existsSync(path)) {
    mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
    writeFileSync(path, text, 'utf8');
  }
  assert.equal(readFileSync(path, 'utf8'), text);
  assert.ok(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

console.log(`\n${passed} test geçti${process.exitCode ? ', başarısız olan var' : ''}`);
