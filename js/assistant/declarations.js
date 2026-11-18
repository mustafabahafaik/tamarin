// Asistanın sabitleri: sistem talimatı ve araç tanımları (Gemini function calling, JSON Schema küçük harf
// türler). Hem uygulama (js/assistant/tools.js) hem Cloudflare Worker (worker/src/index.js) bu dosyayı kullanır;
// DOM'a ve store'a dokunmaz.

export const SYSTEM = [
  "Sen Tamarin'sin, Baha'nın telefonundaki kişisel asistan, bir imparator tamarin.",
  'Türkçe, samimi ve kısa konuş (genelde 1–3 cümle).',
  "Yalnızca verilen verilere dayan; veride olmayanı uydurma, 'kayıtlarda yok' de.",
  "Tarih ve tutarları açık yaz ('23 Kasım Pazartesi', '18.500 ₺').",
  'Kayıt eklemek/değiştirmek için araçları kullan; değişiklik kullanıcı onaylamadan olmaz.',
  "PIN, şifre ya da Kasa sorulursa göremediğini, Kasa'ya bakmasını söyle.",
  'Emoji kullanma.',
].join(' ');

/** Bağlam JSON'unun açıklaması (sistem talimatına eklenir; alan adları kısa). */
export const CONTEXT_GUIDE = [
  'Aşağıdaki VERİ, uygulamadaki kayıtların bugünkü özeti (JSON).',
  'simdi: tarih (YYYY-AA-GG), gün adı, saat (Europe/Istanbul). kullanici: ad, sehir. hava: son bilinen hava.',
  'odemeler: id, ad, kat, tutar (₺), gun (her ayın kaçı), bu_ay_odendi, sonraki_vade (ödenmemiş ilk vade), gecikme_gun (varsa).',
  'dersler: id, ad, gun (1=Pazartesi..7=Pazar), gun_adi, bas, bit, yer, hoca.',
  'sinavlar: id, ders, tur, tarih, saat, yer, gecti (true = geçmiş).',
  'ozel_gunler: id, ad, tur, tarih (sonraki gerçekleşme), kalan_gun, yakinlik, yas (doğum yılı biliniyorsa o gün kaç yaşında).',
  'isler: id, baslik, tarih ("" = tarihsiz), saat, onem (low/normal/high), hatirlatma (dakika önce; none = yok), bitti.',
  'telefonlar: id, ad, numara, model, renk. hesaplar: id, platform, etiket, telefon (bağlı telefonun adı).',
  'Araçlarda id olarak bu listelerdeki id değerlerini kullan; tarih YYYY-AA-GG, saat SS:DD.',
].join(' ');

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });

/**
 * update_record'un patch'inde yazılabilecek alanlar (tüm türlerin şema alanları; hangisinin hangi türde
 * geçerli olduğunu uygulama denetler). PIN (phones.pin), platform (accounts.platform), extra, paid ve doneAt yok.
 */
const PATCH_FIELDS = {
  name: str('Ad (bills, classes, days, phones)'),
  title: str('Başlık (tasks)'),
  course: str('Ders (exams)'),
  label: str('Etiket (accounts)'),
  cat: str('Kategori (bills)'),
  amount: { type: 'number', description: 'Tutar ₺ (bills)' },
  day: int('Gün: bills/days için ayın günü, classes için 1–7'),
  month: int('Ay 1–12 (days)'),
  year: int('Yıl (days)'),
  date: str('YYYY-AA-GG (exams, tasks)'),
  time: str('SS:DD (exams, tasks)'),
  start: str('SS:DD (classes)'),
  end: str('SS:DD (classes)'),
  room: str('Derslik (classes, exams)'),
  teacher: str('Hoca (classes)'),
  type: str('Sınav türü (exams)'),
  kind: str('Tür (days)'),
  rel: str('Yakınlık (days)'),
  remind: str('Hatırlatma (tasks)'),
  prio: str('Önem (tasks)'),
  done: { type: 'boolean', description: 'Tamamlandı mı (tasks)' },
  note: str('Not'),
  number: str('Telefon numarası (phones)'),
  model: str('Telefon modeli (phones)'),
  color: str('Kılıf rengi (phones)'),
  cased: { type: 'boolean', description: 'Kılıflı mı (phones)' },
  phoneId: str('Bağlı telefonun id değeri (accounts)'),
  username: str('Kullanıcı adı / e-posta (accounts)'),
  uid: str('UID (accounts)'),
  status: str('Durum (accounts)'),
  twofa: { type: 'boolean', description: '2FA açık mı (accounts)' },
};

/** Araçlar. Uygulama, model çağırınca hemen uygulamaz; önce kullanıcıya onay kartı gösterir. */
export const TOOLS = [
  {
    name: 'add_task',
    description: "Ajanda'ya yeni bir iş ekler.",
    parameters: {
      type: 'object',
      properties: {
        title: str('İşin kısa adı'),
        date: str('YYYY-AA-GG; boşsa tarihsiz'),
        time: str('SS:DD (yalnızca tarih varsa)'),
        remind: { type: 'string', enum: ['0', '15', '60', '1440', 'none'], description: 'Kaç dakika önce hatırlatılsın' },
        prio: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Önem' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Bir işi tamamlandı olarak işaretler.',
    parameters: { type: 'object', properties: { id: str('isler listesindeki id') }, required: ['id'] },
  },
  {
    name: 'postpone_task',
    description: 'Bir işin tarihini değiştirir (erteler).',
    parameters: { type: 'object', properties: { id: str('isler listesindeki id'), date: str('Yeni tarih, YYYY-AA-GG') }, required: ['id', 'date'] },
  },
  {
    name: 'add_bill',
    description: 'Her ay tekrar eden yeni bir ödeme ekler.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Ödemenin adı'),
        cat: { type: 'string', enum: ['Kira', 'Aidat', 'Telefon', 'İnternet', 'Elektrik', 'Su', 'Doğalgaz', 'Abonelik', 'Kredi kartı', 'Diğer'] },
        amount: { type: 'number', description: 'Tutar (₺)' },
        day: int('Her ayın kaçında (1–31)'),
      },
      required: ['name', 'cat', 'day'],
    },
  },
  {
    name: 'mark_bill_paid',
    description: 'Bir ödemeyi o ay için ödendi olarak işaretler.',
    parameters: { type: 'object', properties: { id: str('odemeler listesindeki id'), month: str('YYYY-AA') }, required: ['id', 'month'] },
  },
  {
    name: 'add_exam',
    description: 'Sınav ya da teslim ekler.',
    parameters: {
      type: 'object',
      properties: {
        course: str('Ders adı'),
        type: { type: 'string', enum: ['Vize', 'Final', 'Bütünleme', 'Quiz', 'Ödev teslimi', 'Proje teslimi'] },
        date: str('YYYY-AA-GG'),
        time: str('SS:DD'),
        room: str('Derslik'),
      },
      required: ['course', 'type', 'date'],
    },
  },
  {
    name: 'add_day',
    description: 'Doğum günü, yıldönümü ya da özel gün ekler.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Kimin / neyin'),
        kind: { type: 'string', enum: ['Doğum günü', 'Yıldönümü', 'Özel gün'] },
        day: int('Gün (1–31)'),
        month: int('Ay (1–12)'),
        year: int('Yıl (isteğe bağlı; doğum yılı)'),
        rel: { type: 'string', enum: ['Aile', 'Arkadaş', 'Sevgili', 'İş-Okul', 'Diğer'] },
      },
      required: ['name', 'kind', 'day', 'month'],
    },
  },
  {
    name: 'add_class',
    description: 'Ders programına haftalık bir ders ekler.',
    parameters: {
      type: 'object',
      properties: {
        name: str('Ders adı'),
        day: int('Gün: 1=Pazartesi … 7=Pazar'),
        start: str('Başlangıç SS:DD'),
        end: str('Bitiş SS:DD'),
        room: str('Derslik'),
      },
      required: ['name', 'day', 'start', 'end'],
    },
  },
  {
    name: 'update_record',
    description: "Var olan bir kaydın alanlarını değiştirir. Telefonun PIN'i ve hesabın platformu değiştirilemez.",
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bills', 'classes', 'exams', 'days', 'tasks', 'phones', 'accounts'] },
        id: str('Kaydın id değeri'),
        patch: {
          type: 'object',
          description: 'Değişecek alanlar ve yeni değerleri; yalnızca o kayıt türünde olan alanları yaz',
          properties: PATCH_FIELDS,
        },
      },
      required: ['type', 'id', 'patch'],
    },
  },
  {
    name: 'delete_record',
    description: 'Bir kaydı siler (kullanıcı iki kez onaylar).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bills', 'classes', 'exams', 'days', 'tasks', 'phones', 'accounts'] },
        id: str('Kaydın id değeri'),
      },
      required: ['type', 'id'],
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
