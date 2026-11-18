// Baha'nın telefonları: uygulama açılınca Telefonlar ekranına bir kez eklenir (store.js, phoneSeed).
// Depo herkese açık; numaralar ve SIM PIN'ler kullanıcının isteğiyle burada (PIN'ler metin, baştaki 0 korunur).
// Bir şey değişince SEED_VERSION'ı artır. Kurallar store.js applyPhoneSeed'de: telefonlar yalnızca ilk kez
// eklenir (silinen geri gelmez); sonraki sürümler yalnızca PIN'i boş kalmış telefonların PIN'ini doldurur.

export const SEED_VERSION = 2;

export const PHONE_SEED = [
  { name: 'Baha faik1', number: '05317653701', pin: '3317', model: 'iPhone SE (2./3. nesil)', color: 'Siyah', cased: true },
  { name: 'Baha faik2', number: '05340576142', pin: '7314', model: 'iPhone 7 Plus', color: 'Sarı', cased: true },
  { name: 'Baha faik3', number: '05340587812', pin: '1385', model: 'iPhone 8', color: 'Siyah', cased: true },
  { name: 'Baha faik4', number: '05374514879', pin: '8053', model: 'iPhone SE (2./3. nesil)', color: 'Mor', cased: true },
  { name: 'Baha faik5', number: '05374599631', pin: '8502', model: 'iPhone SE (2./3. nesil)', color: 'Turuncu', cased: true },
  { name: 'Baha faik8', number: '05375186963', pin: '7049', model: 'iPhone SE (2./3. nesil)', color: 'Pembe', cased: true },
  { name: 'Baha faik9', number: '05375156457', pin: '0765', model: 'iPhone 7 Plus', color: 'Mavi', cased: true },
];
