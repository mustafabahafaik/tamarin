// Baha'nın telefonları: uygulama açılınca Business > Telefonlar'a eklenir (store.js applyPhoneSeed, phoneSeed).
// Depo herkese açık; numaralar ve SIM PIN'ler kullanıcının isteğiyle burada (PIN'ler metin, baştaki 0 korunur).
// Kurallar (sürüm bazlı): her kaydın "since" değeri, eklendiği tohum sürümüdür. Açılışta since'i kayıtlı
// phoneSeed'den büyük olan ve numarası henüz kayıtlı olmayan telefonlar eklenir; since <= phoneSeed olanlar
// (daha önce eklenmiş, belki kullanıcı silmiş) geri gelmez. PIN'i boş kalmış aynı numaralı telefonun PIN'i
// tohumdan doldurulur. Yeni telefon eklerken since'i yeni sürüm yap ve SEED_VERSION'ı artır.

export const SEED_VERSION = 3;

export const PHONE_SEED = [
  { since: 1, name: 'Baha faik1', number: '05317653701', pin: '3317', model: 'iPhone SE (2./3. nesil)', color: 'Siyah', cased: true },
  { since: 1, name: 'Baha faik2', number: '05340576142', pin: '7314', model: 'iPhone 7 Plus', color: 'Sarı', cased: true },
  { since: 1, name: 'Baha faik3', number: '05340587812', pin: '1385', model: 'iPhone 8', color: 'Siyah', cased: true },
  { since: 1, name: 'Baha faik4', number: '05374514879', pin: '8053', model: 'iPhone SE (2./3. nesil)', color: 'Mor', cased: true },
  { since: 1, name: 'Baha faik5', number: '05374599631', pin: '8502', model: 'iPhone SE (2./3. nesil)', color: 'Turuncu', cased: true },
  { since: 1, name: 'Baha faik8', number: '05375186963', pin: '7049', model: 'iPhone SE (2./3. nesil)', color: 'Pembe', cased: true },
  { since: 1, name: 'Baha faik9', number: '05375156457', pin: '0765', model: 'iPhone 7 Plus', color: 'Mavi', cased: true },
  { since: 3, name: 'iPhone 12', number: '05510130155', pin: '0990', model: 'iPhone 12', color: 'Su yeşili', cased: true },
];
