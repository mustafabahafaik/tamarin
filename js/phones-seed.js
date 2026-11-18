// Baha'nın telefonları: uygulama açılınca Telefonlar ekranına bir kez eklenir (store.js, phoneSeed).
// Depo herkese açık: burada yalnızca numara, model ve kılıf var; SIM PIN'ler telefondan elle girilir.
// Listeye yeni telefon eklenince SEED_VERSION'ı artır: yalnızca numarası henüz kayıtlı olmayanlar eklenir.

export const SEED_VERSION = 1;

export const PHONE_SEED = [
  { name: 'Baha faik1', number: '05317653701', model: 'iPhone SE (2./3. nesil)', color: 'Siyah', cased: true },
  { name: 'Baha faik2', number: '05340576142', model: 'iPhone 7 Plus', color: 'Sarı', cased: true },
  { name: 'Baha faik3', number: '05340587812', model: 'iPhone 8', color: 'Siyah', cased: true },
  { name: 'Baha faik4', number: '05374514879', model: 'iPhone SE (2./3. nesil)', color: 'Mor', cased: true },
  { name: 'Baha faik5', number: '05374599631', model: 'iPhone SE (2./3. nesil)', color: 'Turuncu', cased: true },
  { name: 'Baha faik8', number: '05375186963', model: 'iPhone SE (2./3. nesil)', color: 'Pembe', cased: true },
  { name: 'Baha faik9', number: '05375156457', model: 'iPhone 7 Plus', color: 'Mavi', cased: true },
];
