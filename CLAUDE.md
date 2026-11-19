# Tamarin

iPhone'da Safari'den "Ana Ekrana Ekle" ile kullanılan kişisel günlük asistan PWA'sı.
Arayüz dili Türkçe. Sonraki tüm adımlarda bu kurallara uyulur.

## Kurallar

- **Ad:** Uygulamanın adı Tamarin. Manifest, başlık ve ikonlarda bu ad kullanılır.
- **Teknoloji:** Saf HTML + CSS + vanilla JS (ES modules). Framework ve build aracı yok.
  GitHub Pages'te statik olarak çalışır (adres: `/tamarin/` alt yolu), bu yüzden tüm yollar
  göreli olmalı (`./`, `css/style.css`, `js/app.js`; `/` ile başlayan yol yok).
- **Dosya yapısı:**
  - `index.html`
  - `css/style.css`
  - `js/app.js` — router + render
  - `js/ui.js` — ortak bileşenler: alttan açılan sheet, toast, `h()` DOM yardımcısı
  - `js/form.js` — modül formlarının ortak parçaları: etiketli alan + alan hatası (`field`),
    ikonlu seçim ızgarası (`pickGrid`), öneri çipleri (`suggestions`); renk formun `data-cat`'inden gelir;
    formlardaki "Takvime ekle" (`calendarButton`) ve yeni kayıt toast'ındaki aksiyon (`calendarAction`)
  - `js/store.js` — veri (şema, doğrulama, CRUD, "change" olayı, yedek, örnekler)
  - `js/dates.js` — tarih yardımcıları
  - `js/ics.js` — iPhone Takvimi'ne aktarma: RFC 5545 üretimi, kayıt türü kuralları, hash, paylaş / data: / indir
  - `js/weather.js` — hava durumu (tahmin, önbellek, şehir arama, WMO → Türkçe, efekt "sahnesi")
  - `js/weather-fx.js` — içeriğin arkasındaki tam ekran hava efekti canvas'ı
  - `js/ring-blocks.js` — halkanın 4 dilimini taş bloklara bölen geometri (DOM'suz) ve blok animasyonları
    (açılış, boşta döngü, dokunma nefesi, dönüş dalgası; Web Animations API)
  - `js/face.js` — ana ekran yüzü (başlık, halka, tamarin, Business butonu, "Bugün" şeridi, zil/tahmin/kayıt sheet'leri)
  - `js/status.js` — durum: acil olanlar, yaklaşanlar listesi, alttaki yazı, tamarinin ruh hali;
    telefon numarası biçimi ve doğal sıra (`formatPhone`, `sortPhones`, `MODEL_SHORT`); Business: özet
    (`bizSummary`), arama (`searchPhones`, `searchAccounts`; PIN'de aramaz), `accountGroups`, `accountsOf`,
    Telegram'ın alfabetik sırası (`sortByLabel`, localeCompare 'tr'), "Bunu Kasa'ya koy" sözcükleri (`vaultWords`)
  - `js/phones-seed.js` — Baha'nın telefonları (since, ad, numara, SIM PIN, model, kılıf): sürüm bazlı, her biri bir kez eklenir
  - `js/phone-art.js` — `phoneArt(model, color, cased, size)`: telefonun arkasının SVG işaretlemesi (DOM'suz);
    `phoneSilhouette(size)`: telefonsuz hesap için kesik çizgili boş siluet (`--pa-dash`)
  - `js/sound.js` — Web Audio ile sentezlenen tamarin sesleri
  - `js/settings.js` — Ayarlar ekranı (sol üstteki kullanıcıya dokununca açılan sheet)
  - `js/modules/*.js` — `bills`, `school`, `days`, `tasks`, `vault` (şifre kasası ekranı), `business` (Business
    ekranı: sekmeler, arama, listeler), `phones` (telefon satırı/ayrıntı/form), `accounts` (hesap satırı/ayrıntı/form)
  - `js/biz-ui.js` — Business'ın ortak parçaları: çizgi ikonlar, pano (30 sn sonra silinir), açık PIN'leri
    gizleme, Ek bilgiler düzenleyicisi, platform rozeti (`badge`), "Bunu Kasa'ya koy" uyarısı (`vaultGuard`)
  - `js/vault.js` — kasa çekirdeği: Web Crypto ile şifreleme, kilit, otomatik kilit, şifre üretici
  - `js/assistant/` — yapay zekâ asistanı: `declarations.js` (sistem talimatı + araç tanımları; Worker da kullanır),
    `context.js` (bağlam özeti + hassas filtre), `tools.js` (araç çağrısı → onay → store), `config.js` (ayarlar,
    Worker istemcisi, hata metinleri), `chat.js` (sohbet sheet'i)
  - `worker/` — Cloudflare Worker (kendi `package.json` + `wrangler.toml`; uygulama yüklemez, sw.js SHELL'e girmez)
  - `tests/` — Node testleri (`vault`, `bills`, `school`, `days`, `tasks`, `ics`, `phones`, `business`, `ring-blocks`, `assistant`, `worker`: `node tests/<ad>.test.mjs`);
    `tests/fixtures/ornek.ics` örnek takvim (`.gitattributes`: `-text`, CRLF bayt bayt korunur)
  - `manifest.webmanifest`, `sw.js`, `icons/`
  - `README.md`, `docs/ekran-goruntusu.webp` (README görseli), `.nojekyll` (Pages dosyaları işlemesin)
  - `assets/` — şeffaf tamarin görselleri `tamarin-768.webp` ve `tamarin-1152.webp` (aynı kare kadraj, srcset).
    Göz kırpma karesi yok. Görsel ve ondan üretilen `icons/` proje sahibine ait (kaynağı referans/tamarin.jpg);
    lisans sorusu kapandı, değiştirme önerme
  - `referans/tasarim.gif` — ana ekranın yerleşim ve ölçü referansı (renkleri artık "Toprak" teması);
    `referans/tamarin.jpg` — tamarinin kaynak fotoğrafı (1600x1067). İkisi de yalnızca bu bilgisayarda:
    `.gitignore`'da, depoya girmez (tools/cut_tamarin.py okur)
  - `tools/` — yalnızca geliştirme araçları (yerel sunucu, tamarin kesici, ikon üretici, `phone-art.html`:
    tüm telefon çizimleri birkaç renkte yan yana); uygulama bunları yüklemez
- **Kullanıcı:** Tek kullanıcı; ad ve şehir store'da (`name` varsayılan "Baha", `city` varsayılan
  Çanakkale). Ayarlar ekranından değişir.
- **Veri:** localStorage, `"tamarin.v1"` anahtarında tek state nesnesi (js/store.js). Bildirimler
  iPhone Takvimi'ne `.ics` aktarımıyla; hava durumu Open-Meteo'dan. Şema (alanların kuralları
  store.js'teki `SHAPES`'te):
  - `{ version: 2, name, city: {name, lat, lon}, semesterEnd, sound: {on, volume 0–1}, bills, classes, exams, days, tasks, phones, accounts, exNoticeClosed, phoneSeed, ui: {schoolTab, bizTab}, calendar, cache }`
    (`ui.bizTab`: Business'ın son sekmesi, telefonlar/telegram/bybit/okx; varsayılan telefonlar)
  - calendar `{exported: {"<tür>:<id>": hash}, last: {at, method, count, note} | null}` (js/ics.js yazar)
  - bill `{id, name, cat, amount, day (1–31; kısa ayda son güne kırpılır), note, paid: ["2026-11", …]}`;
    cat: Kira / Aidat / Telefon / İnternet / Elektrik / Su / Doğalgaz / Abonelik / Kredi kartı / Diğer
    (eski Konut/Fatura/Kredi değerleri yüklemede çevrilir)
  - class `{id, name, day (1=Pzt..7=Paz), start "HH:MM", end, room, teacher}`
  - exam `{id, course, type (Vize/Final/Bütünleme/Quiz/Ödev teslimi/Proje teslimi), date, time, room, note}`
  - day `{id, name, kind (Doğum günü/Yıldönümü/Özel gün), day, month, year?, rel (Aile/Arkadaş/Sevgili/İş-Okul/Diğer), note}`
  - task `{id, title, date ("" = tarihsiz), time? (yalnızca tarihliyse), remind ("0","15","60","1440","none"),
    prio (low/normal/high), note, done, doneAt (ISO; yalnızca tamamlanmışsa)}`; tarihsiz görev zile ve yüze girmez
  - phone `{id, name (≤ 40), number ("" ya da 10–11 rakam; "0555 000 00 01", tireli, "+90 …" girişi rakama
    çevrilir: `phoneDigits`), pin ("" ya da 4–8 rakamlı METİN, baştaki 0 korunur; sayı türü reddedilir:
    `simPin`), model (PHONE_MODELS: iPhone SE (2./3. nesil) / iPhone 7 Plus / iPhone 8 / iPhone 12 / Diğer;
    boşsa Diğer), color (CASE_COLORS, 14 renk; boşsa Siyah), cased (boolean, varsayılan true), note (≤ 1000),
    extra: [{label ≤ 40, value ≤ 200}] (boş satırlar atılır, en çok 20)}`. Yeni tür olduğu için VERSION
    2 kaldı; eski kayıtta `phones` yoksa boş liste. Telefonlarda örnek kayıt yok; yedeğe girer.
  - account `{id, platform (PLATFORMS: Telegram / Bybit / OKX), label (zorunlu, ≤ 40; ör. "Eren"), phoneId
    (bir telefonun id'si ya da ""), username (≤ 80; Telegram'da @kullanıcıadı, borsada e-posta), uid (≤ 40),
    status (ACCOUNT_STATUSES: Aktif / Doğrulanmamış / KYC tamam / Kısıtlı / Kapalı; boşsa Aktif), twofa
    (boolean: yalnızca 2FA açık mı, anahtar DEĞİL), note (≤ 1000), extra (telefonla aynı kurallar)}`.
    Şifre, 2FA anahtarı, yedek kod, seed/kurtarma ifadesi alanı YOK; şemada olmayan anahtarlar atılır.
    `phoneId` bilinmeyen bir telefonu gösteriyorsa (yükleme, yedek, ekleme/güncelleme) "" olur; telefon
    silinince bağlı hesapların `phoneId`'si aynı değişiklikte "" olur (snapshot/restore "Geri al" ikisini
    birlikte getirir). TYPES'ta `accounts` `phones`'tan sonra. Hesaplarda örnek yok; yedeğe girer.
  - `phoneSeed` (sayı): js/phones-seed.js'in uygulanmış sürümü (şu an `SEED_VERSION` 3). Sürüm bazlı: her
    tohum kaydının `since`'i eklendiği sürümdür (ilk 7 telefon 1, iPhone 12 3). Açılışta `phoneSeed <
    SEED_VERSION` ise: `since > phoneSeed` olan ve numarası henüz kayıtlı olmayan telefonlar eklenir;
    `since <= phoneSeed` olanlar (daha önce eklenmiş, kullanıcı silmiş olabilir) geri gelmez; aynı
    numaralı telefonun PIN'i boşsa tohumdaki PIN yazılır (elle girilen PIN'e dokunulmaz). Sonra
    `phoneSeed = SEED_VERSION`. Diğer kayıtlara dokunulmaz. "Tüm verileri sil" ve yedek yükleme `phoneSeed`'i
    düşürmez. Yeni tohum telefonu: `since` = yeni sürüm, `SEED_VERSION` artar.
  - Örnek kayıtlar `ex: true` taşır; `cache` (hava) yedeğe girmez ve olay yayınlamaz.
- **Veriye yazma yalnızca store API'siyle:** `add(type, item)`, `update(type, id, patch)`,
  `remove(type, id)`, `setField(key, value)`. Şemaya uymayan kayıt hata fırlatır; bozuk kayıtlı veri
  uygulamayı çökertmez. Her değişiklik kaydedilir ve `events` üzerinde "change" yayınlanır; arayüz
  `onChange(fn)` ile dinler (yüz: halka özetleri, nabız, zil, alt yazı; ses: seviye).
- **İlk açılış:** Örnek verilerle (4 fatura, 4 ders, 2 sınav, 2 özel gün, 2 görev) açılır; yüzde
  kapatılabilir "Örnek verilerle açıldı · Örnekleri sil" bildirimi çıkar.
- **Silme:** `confirm()` yok. Tehlikeli işlemler iki dokunuşla onaylanır (`confirmTap`, js/ui.js:
  "Sil" → "Emin misin? Tekrar dokun") ve toast'taki "Geri al" ile geri alınabilir (`snapshot`/`restore`).
- **Ana ekran bir "yüz" (yerleşim: referans/tasarim.gif):**
  - Üst alan: solda kullanıcı ikonu + saate göre selamlama ("Günaydın, Baha") ve tarih (dokununca
    Ayarlar), sağda büyük sıcaklık + durum + ↑/↓ ve hava ikonu (dokununca 4 günlük tahmin), en sağda
    zil. Altında tek satır ipucu, YALNIZCA bilgi (öğüt yok: "şemsiyeni al", "bol su iç", "kalın giyin",
    "dikkatli ol" yazılmaz): yağış > %50 → "Yağış ihtimali %78", > 30° → "En yüksek 32°", < 5° →
    "Hissedilen 3°", rüzgar > 25 km/s → "Rüzgar 30 km/s"; yoksa gün doğumu/batımı. (Tamarinin halkanın
    altındaki konuşması ayrı, js/status.js.)
    Zilin solunda tek küçük bağlantı: kilit (#kasa), 30px genişlik. Başlıkta Business ikonu YOK; Business'a
    yalnızca halkanın altındaki Business butonundan girilir.
    İsim kesilmez: sığmazsa selamdan sonra ikinci satıra iner (`.greet-hello` / `.greet-name`). `.who` 4px aşağıda `position: relative` ile durur, yerleşimde yer kaplamaz:
    iki satırlı selam bile hava sütunundan (≈60px) en çok ~1px uzun, başlık yüksekliği değişmez.
  - Ortada 4 dilimli mat halka — sol üst Ödemeler (kiremit, cüzdan), sağ üst Eğitim (arduvaz mavisi,
    kep), sol alt Özel Günler (gül kurusu, kalp), sağ alt Ajanda (adaçayı, takvim) — ve ortada tamarin.
    Dilimler "bloklardan örülmüş iglo": taş bloklar (aşağıdaki **Halka blokları**). İkonlar ayrı bir üst
    katmanda (`.ring-icons`), blokların ve tamarinin bıyıklarının üstünde, hep sabit ve okunaklı.
    Altında tamarinin durum yazısı: acil bir şey yoksa havaya göre konuşur.
  - Tamarin gerçek fotoğraftan (aşağıdaki **Tamarin görseli**). Kutu halka merkezli, kenarı 274u (halkanın dış
    çapı); bıyıklar dilimlerin üstüne taşar. Nefes 1 → 1.012 ölçek (transform). Eğilmede `will-change` yalnızca
    hareket sürerken. Tamarin üzerinde blur/filter yok. Göz kırpma yok.
  - Business butonu: durum yazısıyla "Bugün" şeridi arasında (alt alanın üstünde), ekran genişliğine
    yakın, 44px yüksek, yuvarlak köşeli; solda ince çizgili çanta, "Business", sağda özet ("8 hat · 14 hesap",
    `bizSummary`) ve ›. Dokununca #business. Renk beşinci mat ton eski pirinç (`--biz-1..3`,
    `[data-cat="business"]`), dilimlerle aynı malzeme: aynı rengin tonları arasında hafif geçiş, parlama yok.
    Yüz ızgara düzeninde (başlık | halka alanı | Business | Bugün); halka alanı kalan yüksekliği alır ve
    boyut kabıdır (`container-type: size`): halka 100cqh'ye göre küçülür, 375×667'de örnek veri
    bildirimiyle bile "Bugün" kartları görünür (`--biz-h` eski formülde de düşülür).
  - Alt alan: "Bugün" şeridi — küçük örnek veri bildirimi ve yatay kayan kartlar (sıradaki ders,
    bugünkü görevler, en acil ödeme, yaklaşan sınav/özel gün; kategori renginde ince kenar + ikon).
    Karta dokununca kaydın ayrıntısı açılır. Boşsa "Bugün boşsun Baha, keyfine bak".
  - Tab bar yok. Dilime dokununca modül tam ekran açılır, geri butonuyla yüze dönülür. Zildeki
    kırmızı nokta yalnızca acil bir şey varsa görünür.
  - Ağaç dalı yok (denendi, kullanıcı kaldırttı).
- **Hava:** Open-Meteo tahmini (current + 4 günlük daily, `timezone=auto`), 8 sn zaman aşımı,
  30 dk önbellek (store `cache.forecast`); internet yoksa son veri "x dk önce" notuyla. Şehir store'daki
  `city`, Ayarlar'daki aramayla (geocoding API) değişir.
- **Hava efekti:** Yalnızca yüzde, içeriğin arkasında tam ekran canvas (`#scene .fx`). Güneş ışını
  (sol üst), ay ve yıldız (sağ üst boşluk), bulut, pus, yağmur + sıçrama, kar, şimşek, rüzgar
  çizgileri. Düşük opaklık, parçacık sınırı, sayfa gizliyken ya da yüz kapalıyken döngü durur;
  hareket azaltmada tek sabit kare. Ayarlar'daki "Hava efektini dene" seçicisi geçicidir (bellekte).
- **Ölçüler:** Yüz ekranındaki ölçüler tasarım GIF'inin pikseli cinsinden (`--u0`, 438u = ekran
  genişliği). Yeni öğe eklerken GIF'ten ölçüp `calc(N * var(--u))` ile yaz. Halka alanı
  (`.face-stage`) `--u`'yu kendi ölçeğiyle yeniden tanımlar: uzun ekranda halka genişliğe göre
  büyür (iki yanda 28px), başlık ve alt yazı tasarım boyutunda kalır.
- **Hash routing:** `#odemeler`, `#egitim`, `#gunler`, `#ajanda`, `#kasa` (zilin yanındaki kilit
  ikonu), `#business` (sekmeler `#business/telefonlar`, `/telegram`, `/bybit`, `/okx`; yüzde yalnızca
  Business butonu açar); eski `#telefonlar` → `#business/telefonlar`; boş hash = yüz.
  "/" sonrası alt adres: `render(body, sub)`; aynı ekranda yalnızca alt adres değişirse `subroute(sub)`
  (ekran yeniden kurulmaz; sekme değişimi `location.replace`, geçmişe eklenmez). Ekran `leave()` tanımlarsa router ayrılırken çağırır; "+" ekranın `onAdd()`'ını
  açar, `fab: false` ise "+" gösterilmez. Modül store'a abone olursa `leave()`'de bırakır.
- **Ödemeler (#odemeler, js/modules/bills.js):** Üstte ay özeti (toplam/ödenen/kalan, "3/5 ödendi",
  turuncu çubuk; hepsi ödenince yeşil ve "Bu ayki tüm ödemeler tamam") ve ‹ ay › değiştirici. Satır:
  kategori ikonu, ad, vade, tutar, durum etiketi (Ödendi + "Sonraki: …" yeşil, "N gün gecikti" kırmızı,
  Bugün/Yarın/≤3 gün turuncu, diğerleri nötr) ve seçili ay için yuvarlak ödendi butonu (tik + cıvıltı,
  toast'ta "Geri al"). Sıra: ödenmemişler vadeye göre, ödenenler sonda. Ay hesapları js/status.js'te
  (`billMonth`, `monthSummary`, `togglePaid`, `parseAmount`); para `money.format` (tam sayı kuruşsuz,
  kuruşlu iki basamak).
- **Eğitim (#egitim, js/modules/school.js):** Üstte iki parçalı "Ders programı" | "Sınavlar" seçici;
  son sekme store `ui.schoolTab`'da hatırlanır, "+" etkin sekmenin formunu açar.
  - Ders programı: Pzt–Paz gün çipleri (bugün seçili, altında ders sayısı kadar nokta; dersi olmayan
    Cmt/Paz soluk). Seçili günün dersleri başlangıca göre: solda saat aralığı, sağda kart (ad,
    derslik · hoca). 30 dk'dan uzun aralara "1 sa 15 dk boşluk" satırı. Bugün için süren ders "Şimdi" +
    ince ilerleme çubuğu, sonraki "Sıradaki · 40 dk sonra", bitenler soluk; ekran açıkken dakika başında
    yeniden çizilir. Boşsa "Bu gün ders yok".
  - Sınavlar: en yakın sınav üstte büyük kartta ("9 gün 4 saat" ayrıntılı geri sayım), diğerleri tarih
    sırasıyla satır (türe göre ikon, ders, "12 Ocak Salı 10:00 · B-201", sağda "9 gün"/"Yarın"/"Bugün";
    ≤ 7 gün turuncu, ≤ 2 gün kırmızı, bugün yanıp sönen kırmızı nokta). Geçmişler altta katlanır
    "Geçmiş" grubunda, soluk.
  - Formlar: ders adı/ders alanında önceki adlar öneri çipi; bitiş başlangıçtan sonra olmalı; aynı gün
    ve saatte çakışan ders varsa uyarı çıkar ama kayda engel olmaz. Silme iki dokunuş + "Geri al".
  - Hesaplar js/status.js'te (`daySchedule`, `classConflicts`, `examCountdown`, `splitExams`,
    `examWhen`). Mavi dilim özeti: en yakın sınav ("Final 9 gün", "Quiz bugün"), yoksa "Bugün 3 ders" /
    "Bugün ders yok". Bugün/yarın sınav varsa tamarin endişeli; alt yazıda bugün/yarın olan sınav ve özel
    günlerden en yakını söylenir (aynı günse sınav önce).
- **Özel Günler (#gunler, js/modules/days.js):** Üstte yakınlık filtresi çipleri (Tümü / Aile / Arkadaş /
  Sevgili / İş-Okul / Diğer, yatay kayar). En yakın gün büyük kartta: isim, tür, tarih, geri sayım
  ("12 gün"/"Yarın"/"Bugün"), doğum yılı varsa "25 yaşına giriyor", yıldönümüyse "3. yıl".
  - Kutlama modu (bugün doğum günü): yumuşak pembe hale, kartın üstünde yavaşça düşen mat konfeti,
    "Bugün Annemin doğum günü!"; karta dokununca mutlu trill (ses açıksa), düzenleme sağ üstteki kalemle.
    Hareket azaltmada konfeti hiç çizilmez.
  - Liste bir sonraki gerçekleşmeye göre (bu yıl geçtiyse seneye; aynı gün ada göre): yakınlık renginde
    baş harfli rozet, isim + tür ikonu (pasta / kalp / yıldız), "14 Mart · Aile", sağda geri sayım.
    Bugün/yarın pembe vurgulu, 7 gün içi hafif vurgulu. "Bu ay" ve "Gelecek aylar" (ay başlıklarıyla,
    başka yıldaysa "Ocak 2027") diye gruplu. Boşsa tamarin + "Sevdiklerinin doğum günlerini ekle, sana bir
    gün önceden haber vereyim".
  - Form: isim, tür, gün, ay (Türkçe açılır liste), yıl (isteğe bağlı), yakınlık, not. 30 Şubat gibi
    tarihler reddedilir (`annualDateError`, js/dates.js; store da uygular); 29 Şubat artık olmayan
    yıllarda 28 Şubat'ta kutlanır, yıl verilirse o yıl artık yıl olmalı; yıl (ve formda tarihin
    kendisi) gelecekte olamaz. Silme iki dokunuş + "Geri al".
  - Hesaplar js/status.js'te (`upcomingDays`, `groupDays`, `dayMilestone`, `dayCountdown`).
    Pembe dilim özeti: "Annem yarın" / "Annem bugün" / "14 gün", kayıt yoksa "Ekle". Bugün ya da yarın
    özel gün varsa (endişe verecek bir şey yoksa) tamarin mutlu.
- **Ajanda (#ajanda, js/modules/tasks.js):** Asıl amaç "2 gün sonra şu işim var" notunu 2–3 saniyede
  eklemek.
  - Hızlı ekleme en üstte, kaydırınca üst çubuğun altında sabit: "Ne yapacaksın?" kutusu + Ekle, altında
    Bugün / Yarın / 2 gün sonra / Haftaya / Tarih seç çipleri (varsayılan Bugün) ve saat çipi. Enter ya da
    Ekle; sonra kutu temizlenir, odak kutuda kalır (Ekle ve çipler `pointerdown`'da odağı almaz), cıvıltı
    çalar. Hızlı ekleme bir kez kurulur; store değişince yalnızca liste çizilir (yazı ve çipler korunur).
  - Türkçe ifade algılama (`parseQuick`, js/status.js): bugün/yarın/yarından sonra, "N gün/hafta sonra",
    haftaya, gün adları (bugün o günse gelecek hafta), "haftaya cuma", "15 aralık", "ayın 20'si"; saat
    "15:30", "saat 3'te" (1–6 öğleden sonra sayılır), "10.30'da", "akşam 8'de", "3 buçukta". Bulunan
    sözcükler başlıktan atılır; yazarken çip ve saat güncellenir, kullanıcı çipe dokunduysa o seçim kalır.
    "pazar" ekliyse ya da "pazar alışverişi" gibi kullanılırsa gün sayılmaz.
  - Liste: "Yaklaşan" | "Tamamlanan". Yaklaşanlar Gecikmiş (kırmızı) / Bugün / Yarın / Bu hafta (Pazar'a
    kadar) / Daha sonra / Tarihsiz (`taskGroups`). Satır: yuvarlak onay, başlık, "Yarın · 14:00", yüksek
    önemde kırmızı bayrak, not ikonu. Onayda tik + üstü çizilir + satır kaybolur, "Geri al". Sola kaydır →
    Sil, sağa kaydır → "Yarına ertele" (ileri tarihliyse "1 gün ertele", `postponeDate`); ikisi formda da
    var. Liste değişince satırlar yerine kayarak (FLIP, transform), yeni gelen belirerek girer.
  - Tamamlananlar `doneAt`'e göre yeniden eskiye, satırda "Geri al"; "Tamamlananları temizle" iki dokunuş.
  - Form: başlık, tarih (aynı çipler + Tarihsiz), saat, hatırlatma, önem, not; ertele ve iki dokunuşla sil.
  - Yeşil dilim özeti: "1 gecikmiş" / "Bugün 3 iş" / "Bugün boş" (açık iş var) / "Boş". Gecikmiş iş varsa
    tamarin endişeli.
- **Business (#business, js/modules/business.js + phones.js + accounts.js + js/biz-ui.js):** telefonlar/hatlar
  ve bu hatlarda açılmış Telegram, Bybit, OKX hesapları tek yerde, birbirine bağlı.
  - Sıra yukarıdan aşağı: "Business" başlığı (üst çubuk; bu ekranda opak, yüksekliği safe-area-inset-top +
    56px, kayan içerik durum çubuğunun ve başlığın altına binmez) → dört parçalı seçici Telefonlar | Telegram |
    Bybit | OKX (her birinde sayı; aramada eşleşen sayısı) → arama kutusu (ad, numara — boşluklu/"+90" da —,
    kullanıcı adı, UID, bağlı telefon; PIN'de ARAMAZ; Türkçe harf ve aksan fark etmez) → liste. Son sekme `ui.bizTab`; "+" etkin sekmenin formunu açar. Ekran rengi
    pirinç. Store aboneliği `leave()`'de bırakılır, açık PIN'ler gizlenir, arama unutulur.
  - Telefonlar sekmesi: ada göre doğal sırada (faik2 < faik10, `sortPhones`); solda çizim (~40px), ad
    (kalın), altında "0555 000 00 01" (yoksa "Numara yok") ve o hattaki hesapların platform rozetleri
    (platform başına bir rozet, birden çoksa sayı), sağda renk noktası + kısa model. Boşsa çizim +
    "Telefonlarını ekle".
  - Telefon ayrıntısı: büyük çizim, ad, model, düzenle kalemi; numara "Ara" (`tel:`) ve "Kopyala"; "SIM PIN
    ••••"; model, kılıf rengi (kılıfsızsa "Renk"), not, Ek bilgiler; "Bu hatta" (bağlı hesaplar yalnızca platform
    rozeti + etiket, ör. "T Eren", "B Duygu"; dokununca hesabın ayrıntısı) ve "Bu hatta hesap ekle" (Telegram / Bybit / OKX: platformu ve phoneId'si dolu form).
  - Telegram ve Bybit sekmeleri (`COMPACT`, js/modules/accounts.js): her satırda YALNIZCA iki şey: solda
    bağlı telefonun `phoneArt` çizimi (~44px, kendi model/kılıf renginde), sağında etiket büyük ve kalın
    ("Eren"), dikeyde çizimle ortalı. Satırda başka hiçbir şey yok: kullanıcı adı, e-posta, UID, numara,
    telefon adı, durum etiketi ve platform rozeti gösterilmez, yalnızca ayrıntıda. Telefonu yoksa çizim
    yerine kesik çizgili boş siluet (`phoneSilhouette`). Sıra etikete göre alfabetik (`sortByLabel`,
    localeCompare 'tr'); "Hat yok" grubu yok. Kapalı hesabın satırı soluk.
  - OKX sekmesi: solda bağlı telefonun çizimi (yoksa siluet), yanında etiket (kalın), altında küçük
    e-posta, sağda durum etiketi (Aktif patina, KYC tamam yeşil, Kısıtlı turuncu, Kapalı soluk ve satır soluk,
    Doğrulanmamış nötr); platform rozeti satırda yok. Sıra bağlı telefonun doğal sırası, sonra etiket
    (`accountGroups`); telefonu olmayanlar altta "Hat yok" grubunda.
  - Boş sekmede rozet + "Telegram hesaplarını ekle" vb.
  - Telegram / OKX hesap ayrıntısı: büyük rozet, etiket, platform, düzenle kalemi; kullanıcı adı / e-posta
    (Kopyala), UID / Telegram ID (Kopyala), durum, 2FA Açık/Kapalı, bağlı telefon (çizim + adı; dokununca
    telefonun ayrıntısı), not, Ek bilgiler, "Şifresi Kasa'da" → #kasa.
  - Telegram / OKX hesap formu: platform (`pickGrid`, rozetli), etiket (zorunlu, "Örn. Eren"), telefon seçici
    (iki sütun, çizimli; "Hat yok" siluetle), kullanıcı adı (Telegram `@kullaniciadi`, borsada e-posta), UID,
    durum çipleri, 2FA Açık/Kapalı, not, Ek bilgiler (öneri çipleri Kayıt tarihi, Referans kodu, Ülke).
    Silme formda, iki dokunuş + "Geri al".
  - **Bybit sade** (`SIMPLE`, js/modules/accounts.js): form YALNIZCA etiket (zorunlu) + telefon seçici; platform
    seçici, e-posta, UID, durum, 2FA, not, Ek bilgiler yok. Açılınca etiket kutusu odakta, Enter kaydeder.
    Ayrıntı yalnızca rozet + etiket, bağlı telefon (çizim + adı; dokununca telefonun ayrıntısı), düzenle kalemi
    ve iki dokunuşla sil + "Geri al". Şema değişmedi: yeni Bybit kaydı yalnızca `{platform, label, phoneId}`
    yazar, diğer alanlar store varsayılanı (boş / Aktif / 2FA kapalı); düzenleme patch birleştirir, eski Bybit
    kayıtlarındaki dolu alanlar silinmez, yalnızca gösterilmez (aramada hâlâ bulunur). Telegram/OKX formu
    Bybit'e geçerse aynı alanlar gizlenir.
  - **Kasa'ya gidecekler:** hesapta şifre, 2FA anahtarı, yedek kod, seed / kurtarma ifadesi, API anahtarı
    tutulmaz. Not ya da Ek bilgiler'de böyle bir şey varsa (`vaultWords`: şifre, parola, password, 2FA
    key/anahtar, yedek kod, seed, kurtarma ifadesi, secret, API key…) formda "Bunu Kasa'ya koy" uyarısı
    çıkar (`vaultGuard`; telefon formunda da). Engellemez: ilk "Kaydet"te uyarı öne çıkar, buton "Yine de
    kaydet" olur, ikinci dokunuş kaydeder.
  - Platform rozetleri resmi logo değil: yuvarlak rozette baş harf (T / B / O), mat tonlar `--pf-telegram`
    (soluk gök mavisi), `--pf-bybit` (kehribar), `--pf-okx` (kül); harf koyu (`--on-badge`).
  - Telefon formu: canlı çizim önizlemesi, ad, numara (`inputmode="tel"`; alandan çıkınca biçimlenir), PIN, model
    (`pickGrid`, ikonları seçili renk/kılıfla `phoneArt`), Kılıflı/Kılıfsız, renk yuvarlakları, not, Ek
    bilgiler (satır ekle/sil; öneri çipleri Operatör, Tarife, IMEI, PUK, Alış tarihi, Garanti, Kimde).
    Silme formda, iki dokunuş + "Geri al"; bağlı hesapların hattı boşalır, toast bunu söyler, "Geri al" ikisini getirir.
  - **PIN kuralları:** listede, toast'ta, konsolda, URL'de ve hata mesajlarında PIN hiç yok (store hata
    mesajları değeri içermez). Ayrıntıda uzunluğu da belli etmeyen "••••"; göz ikonuyla görünür, 30 sn
    sonra, sheet kapanınca, ekrandan çıkınca (`leave`) ve uygulama arka plana geçince (`visibilitychange`
    hidden, `pagehide`) yeniden gizlenir. "Kopyala" panoya yazar, 30 sn sonra `writeText("")` (başarısızsa
    sessiz). Formdaki PIN alanı `type=password` + göz, `inputmode="numeric"`, `autocomplete="off"`; form
    kapanınca alan boşaltılır. Aramaya girmez. `phones.js`, `accounts.js`, `business.js`, `biz-ui.js`'te `console.*` yok. PIN ana store'da (şifresiz) durur ve
    ana yedeğe girer; kasa gibi şifrelenmez.
  - Çizim (js/phone-art.js): SE ve 8 aynı gövde (sol üstte tek kamera + yanında flaş), 7 Plus daha büyük
    gövde + yatay hap şeklinde çift kamera + flaş, 12 düz kenarlı gövde + kare adada çapraz iki kamera +
    flaş, Diğer tek kamera. Kılıflıysa daha kalın yumuşak kenarlı kılıf katmanı ve kamera açıklığı; Şeffaf
    kılıf yarı saydam, altında gümüş gövde. Logo yok. Renkler `--case-<renk>` (`--case-su-yesili` …) ve
    `--pa-*` değişkenleri; yalnızca ince bir üst ışık geçişi.
- **Takvim (js/ics.js):** Bildirimleri iPhone'un kendi Takvim'i verir; uygulama yalnızca .ics üretir.
  - RFC 5545: VCALENDAR'da VERSION:2.0, PRODID:-//Tamarin//TR, CALSCALE:GREGORIAN, X-WR-CALNAME:Tamarin,
    X-WR-TIMEZONE:Europe/Istanbul. CRLF, TEXT kaçışı (\\ ; , yeni satır), 75 bayt katlama (kod noktası
    sınırında; Türkçe karakter bölünmez). Saatler floating (Z yok), tüm gün `VALUE=DATE`. UID
    `<tür>-<id>@tamarin` (bill/class/exam/day/task), DTSTAMP her üretimde UTC.
  - Ödeme: tüm gün, aylık; gün 29–30 → `BYMONTHDAY=28..gün;BYSETPOS=-1`, 31 → `BYMONTHDAY=-1`
    (uygulamanın `clampDay` vadesiyle aynı gün). Özel gün: tüm gün, yıllık; 29 Şubat
    `BYMONTH=2;BYMONTHDAY=-1`. İkisinde alarm önceki gün 09:00 (`-PT15H`) ve aynı gün 09:00 (`PT9H`).
    Ders: haftalık `BYDAY`, dönem sonu varsa `UNTIL=…T235959`, 15 dk önce; dönemi bitmişse aktarılmaz.
    Sınav: saat yoksa 09:00, 2 saat; 1 gün ve 2 saat önce; geçmiş sınav aktarılmaz. Görev: saatliyse
    hatırlatmaya göre (Yok = alarm yok, 30 dk), saatsizse tüm gün + 09:00; tarihsiz, tamamlanmış ve
    tarihi geçmiş iş aktarılmaz. Her VALARM `ACTION:DISPLAY` + dolu DESCRIPTION.
  - Teslim (`deliver`): masaüstünde .ics indirilir; telefonda önce text/calendar dosyasıyla paylaş
    menüsü, desteklenmez ya da hata verirse `data:text/calendar` adresine gidilir. Sonuç ve hata konsola
    değil, store `calendar.last`'e yazılır (sayfadan ayrılmadan önce) ve Ayarlar > Takvim'deki "Son
    aktarma" satırında görünür. İptal edilen aktarım kayıtları işaretlemez.
  - "Sadece yeni ve değişenler": kaydın takvimi etkileyen alanlarının FNV-1a hash'i (`recordHash`;
    dersler dönem sonunu da içerir, ödendi işaretleri içermez) son aktarılanla karşılaştırılır.
  - Doğum günü başlığındaki yaş ("(54)") aktarıldığı yılın yaşıdır; tekrar eden etkinlikte sonraki
    yıllarda değişmez (yaş değişince kayıt "değişen" sayılmaz).
- **Mobil öncelikli:** max-width 560px, safe-area inset'leri (`viewport-fit=cover`),
  input font-size en az 16px (iOS'un otomatik yakınlaştırmasını engeller).
- **Tema "Toprak":** Tek ve koyu; açık tema yok. Sıcak, neredeyse siyah zemin (`--bg` #16120f,
  ortada sabit hafif aydınlık), krem yazı. Kategori tonları mat ve doğal: ödemeler kiremit, eğitim
  arduvaz mavisi, özel günler gül kurusu, ajanda adaçayı, Business eski pirinç (`--bills-1..3`, `--school-*`,
  `--days-*`, `--tasks-*`, `--biz-*`; 1/2/3 aynı rengin hafif ışık farkı). Ana renk patina turkuazı (`--accent`). Tüm
  renkler CSS değişkeni (`:root`). Modül ekranları, sheet'ler ve ikonlar aynı paleti kullanır.
- **"Yapay zekâ işi" görünmesin:** Neon parlama, renkli/bulanık ışık lekeleri, parıltı çizgileri ve
  doygun gökkuşağı degradeleri yok. İstisnalar yalnızca: acil dilimin çevresinde nabız gibi atan
  yumuşak hale (`.slice-glow`), Özel Günler kutlama kartının pembe halesi (`.d-hero.is-party`) ve halka
  bloklarının aydınlanma örtüsü (`.blk-lit`: bloğun aynı şekilli, rengin açık tonundaki kopyası; yalnızca
  opaklığı 0 → 0.55 (açılış) / 0.45 (boşta) → 0 hareket eder; parlama, glow, gölge ya da blur DEĞİL).
  Konfeti de paletin mat tonlarından (`--confetti-0..4`). Emoji yok.
- **Hareket:** Animasyonlar yalnızca `transform`/`opacity` ile (telefonda akıcı kalsın; bulanıklık
  filtreleri sabit katmanlarda). `prefers-reduced-motion` açıksa sürekli animasyonlar durur.
  İstisna (kullanıcı istedi): halka bloklarının animasyonu JS'ten Web Animations API (`element.animate`) ile
  yürür, kuralları **Halka blokları**'nda; yine yalnızca transform ve opacity.
- **Halka blokları (js/ring-blocks.js):**
  - Yapı: her dilim, face.js'teki yuvarlatılmış çeyrek halkanın birebir şekli korunarak 3 radyal sıraya ve
    sıra başına 8 bloğa bölünür; orta sıra yarım blok kaydırmalı (7 tam + 2 yarım): dilim başına 25, toplam
    100 blok. Uç bloklar dilimin düz ucunu (eksenden 12.5) ve köşe yuvarlamasını (8) izler. Derz `JOINT`
    1.25 birim (~1.3–1.7 px), blok köşeleri çok hafif yuvarlak. Her blok ayrı `<g class="blk">`: dolgu yolu,
    üstte ince açık / altta ince koyu kabartma kenarı (ışık yukarıdan: üst yarıda dış yay "üst"), aydınlanma
    örtüsü `.blk-lit`.
  - Malzeme: dilimin rengi (degradedeki yerine göre cat-1 → cat-2 → cat-3, `color-mix`) + bloğa sabit tohumlu
    (mulberry32, dilim adından) ±%3.5 açıklık farkı; her açılışta aynı. Doku için filter/blur YOK.
  - Dokunma alanı blokların değil dilimin tam şekli (`.slice-shape`, saydam dolgu); bloklar ve ikonlar
    `pointer-events: none`. Basılı tutma geri bildirimi yalnızca `.blk-wrap` opaklığı (0.88).
  - Açılış (oturum başına bir kez): bloklar halkanın dışında dağınık, döndürülmüş, saydam başlar; dilim dilim
    (sol üst → sağ üst → sağ alt → sol alt; dilimler 140 ms arayla), dilimde içten dışa ve uçtan uca dalga
    (bloklar arası 22 ms), blok başına 520–700 ms, easing `cubic-bezier(0.22, 1, 0.36, 1)` + hafif içe aşma ve
    oturma; toplam ~1.6 sn. Açılış oynayacaksa bloklar ilk karede gizli (ekran belirirken yerinde görünüp
    dağılmasın). İkonlar 0.5 sn sonra opaklıkla belirir.
  - Boşta döngü: 6–9 sn'de bir (acil dilim varsa 3–5 sn ve %70 acil dilim) tek dilimde 3–6 komşu blok sırayla
    (110 ms) kalkar: dışa 6–10 px + yukarı 3–5 px, 4–10° dönme, scaleX/scaleY 0.92–1.04 (3B illüzyonu), 350–450 ms
    havada, sonra hafif sekmeyle oturur. Aynı anda tek dilim.
  - Dokunma: dilimin blokları kısa dalgayla 4–6 px dışa "nefes" alır (~200 ms + dalga), en çok 280 ms sonra modül
    açılır. Modülden yüze dönüşte yalnızca girilen dilim ≤ 500 ms'lik mini dalgayla oturur.
  - Sayfa gizliyken idle zamanlayıcı durur (pause/resume), yüz kapanınca (`cleanup`) tüm animasyonlar iptal
    edilir. px → SVG birimi dönüşümü `layoutScene`'de ölçülür; animasyon sırasında layout okunmaz/yazılmaz.
  - `prefers-reduced-motion`: açılış ve idle yok; dokunmada yalnızca kısa opaklık geri bildirimi.
  - Performans: açılışta kare süreleri izlenir (sayfa görünürken; 250 ms'den uzun duraklamalar sayılmaz); kareler
    düşüyorsa (%25'ten fazlası > 24 ms ya da ortalama > 21 ms) `cache.blocksLite` yazılır ve sonraki çizimde sıra
    başına 7 blok (dilim başına 22).
  - Test: `node tests/ring-blocks.test.mjs` (blok sayısı, yay sınırları, derz, aynı tohum → aynı ton, malzeme).
- **Tarihler:** Yerel saat (Europe/Istanbul), Türkçe gün/ay adları.

## Asistan (js/assistant/, worker/)

Ortadaki tamarin, uygulamadaki verilere bakarak Türkçe soru cevaplar ve onayla kayıt ekler/değiştirir.
Beyin Google Gemini API ücretsiz katmanı; ücretli hiçbir servis/plan yok.

- **Mimari:** tarayıcı Gemini'ye doğrudan bağlanmaz. Araya Cloudflare Worker girer (Workers Free, `worker/`):
  - `POST /chat {messages, context}` → Gemini `generateContent` → `{ text, toolCalls: [{id, name, args}], content }`.
    `content` modelin turu; istemci onu (thoughtSignature dahil) AYNEN geçmişe koyar ve geri gönderir.
    `POST /ping`: yalnızca erişim kodunu doğrular, Gemini'yi çağırmaz ("Bağlantıyı dene").
    `GET /health`: erişim kodu gerektirmez, bilgi vermez `{ok:true}`; telefondan tarayıcıyla açıp Worker'a ulaşılıyor mu bakmak için.
  - İstemci erişim kodundan görünür ASCII dışını, adresten boşluk/görünmez karakterleri atar (`cleanToken`, `cleanUrl`);
    ağ hatasında cihaz çevrimiçiyse "Worker'a ulaşamadım" (`unreachable`), değilse "internet yok" der.
  - Model tek sabitte: `MODEL` (worker/src/index.js), `gemini-3.8-flash` (Gemini docs'ta "Stable" en yeni Flash;
    Pro değil). Değiştirirken docs'tan doğrula. `thinkingLevel: LOW`, `maxOutputTokens: 600`, araç modu AUTO.
  - Sırlar yalnızca `wrangler secret`: `GEMINI_API_KEY`, `TAMARIN_TOKEN`. Anahtar Gemini'ye `x-goog-api-key`
    başlığıyla gider (URL'de değil). `Authorization: Bearer <TAMARIN_TOKEN>` yoksa/yanlışsa 401 (sabit süreli karşılaştırma).
  - CORS yalnızca `https://mustafabahafaik.github.io` ve `http://localhost:5190`; başka Origin 403.
  - Sınır KV'de (`RATE`): dakikada 10, günde 150 istek (İstanbul günü) → 429 `rate` / `day`. Gövde ≤ 48 KB (413).
    Gemini 429 / RESOURCE_EXHAUSTED → 429 `{ error: "quota" }`.
  - Worker hiçbir içeriği loglamaz/saklamaz: `console.*` yok, observability kapalı, KV'de yalnızca sayaçlar.
- **Bağlam (`context.js`):** her soruda store'dan beyaz listeyle seçilmiş JSON özet: simdi (tarih, gün, saat),
  kullanici, hava, odemeler (id, ad, kat, tutar, gun, bu_ay_odendi, sonraki_vade, gecikme_gun), dersler, sinavlar
  (gelecek + son 14 gün), ozel_gunler (sonraki gerçekleşme, kalan gün, yaş), isler (açıklar + son 3 günde
  tamamlananlar), telefonlar (id, ad, numara, model, renk), hesaplar (id, platform, etiket, telefon adı).
  - **ASLA gönderilmez:** `phones.pin`, Kasa (`tamarin.vault`), `calendar`, `cache`, `extra`, hesapların kullanıcı
    adı/UID'si; notlarda "pin", "şifre", "parola", "password", "seed", "2fa", "puk", "kurtarma"… geçen satırlar.
    Filtre tek yerde: `isSensitive` / `safeNote` (tests/assistant.test.mjs).
  - En fazla 8 KB (`MAX_BYTES`); aşarsa sırayla tamamlanan görevler, geçmiş sınavlar, notlar, sonra liste sonları kırpılır.
- **Sistem talimatı ve araçlar (`declarations.js`):** Tamarin kimliği, Türkçe/kısa, veride olmayanı uydurma, açık
  tarih/tutar, PIN/şifre/Kasa sorulursa göremediğini söyle, emoji yok. Araçlar: add_task, complete_task,
  postpone_task, add_bill, mark_bill_paid, add_exam, add_day, add_class, update_record (yalnızca `FIELD_NAMES`;
  phones.pin, accounts.platform, extra, paid, doneAt değiştirilemez), delete_record.
- **Onay (`tools.js`):** model araç çağırınca hiçbir şey yazılmaz. `planCall` argümanları araç tanımına göre denetler
  (bilinmeyen/eksik alan, bilinmeyen id/tür reddedilir), `store.preview` ile kaydetmeden dener, somut Türkçe özet
  üretir ("Ajanda'ya ekle: Dişçi · 21 Kasım Cumartesi 15:00 · 1 saat önce hatırlat"). Kart: "Onayla" / "Vazgeç";
  birden çok çağrıda tek kart + "Hepsini onayla". Silme (ya da silme içeren kart) kırmızı ve iki dokunuş
  (`createApproval`: ilk onay "armed"). Onaylanınca store API'siyle uygulanır, toast'ta "Geri al"; şema hatası
  kullanıcıya gösterilir ve modele hata olarak döner. Sonuç modele function response (aynı id, aynı sıra).
- **Arayüz (`chat.js`):** yüzde tamarine KISA dokunma sohbeti açar, UZUN basma (480 ms) eski ses + zıplama.
  Yüksek sheet: küçük tamarin (düşünürken nefes, konuşurken kafa hareketi; transform), balonlar (Baha sağda),
  yazı kutusu + Gönder; `webkitSpeechRecognition` varsa mikrofon (tr-TR). Boşken öneri çipleri. "Tamarin
  düşünüyor…" + İptal (AbortController), 20 sn zaman aşımı. Geçmiş yalnızca bellekte; sheet kapanınca 10 dk
  tutulur, sonra silinir; modele en çok son 10 mesaj (kesim bir kullanıcı yazısıyla başlar). Hata metinleri
  `ERROR_TEXT` (config.js): internet yok, erişim kodu yanlış, dakika sınırı, kota dolu, Worker adresi boş (+ Ayarlar butonu).
- **Ayarlar > Asistan:** Worker adresi, Erişim kodu (gizli + göz), "Cevapları sesli oku" (speechSynthesis tr-TR,
  yeni mesajda önceki okuma durur), "Bağlantıyı dene". localStorage `"tamarin.assistant"` (ana store'dan ayrı);
  ana yedeğe GİRMEZ, "Tüm verileri sil" dokunmaz.
- **Depo herkese açık:** API anahtarı, erişim kodu ve gerçek veri commit'lenmez. `worker/.dev.vars`, `.wrangler/`
  .gitignore'da. `wrangler.toml`'daki KV id gizli değildir.
- **Service worker:** Worker istekleri POST ve başka adrese gider; önbelleğe hiç girmez.
- Test: `node tests/assistant.test.mjs`, `node tests/worker.test.mjs`.

## Kasa güvenlik kuralları

Uygulama şifreleri kasası (`#kasa`, js/vault.js + js/modules/vault.js) hassastır; aşağıdakilere
harfiyen uyulur, gevşetilmez:

- **Yalnızca Web Crypto API.** Harici kriptografi kütüphanesi yok.
- **Anahtar türetme:** ana şifreden PBKDF2-SHA256, rastgele 16 bayt salt, 600.000 iterasyon →
  AES-GCM 256 anahtar, dışa aktarılamaz (`extractable: false`).
- **Şifreleme:** tüm kayıtlar tek bir JSON olarak AES-GCM 256; her kayıtta yeni rastgele 12 bayt IV.
- **Depolama:** localStorage `"tamarin.vault"` (ana store'dan AYRI) yalnızca `{v, salt, iv, ciphertext,
  iterations}`. Ayrı `"tamarin.vault.guard"` yalnızca yanlış deneme sayısı ve bekleme bitişi (gizli değil).
- **Asla:** ana şifre, türetilen anahtar ya da düz şifreler localStorage'a, sessionStorage'a, konsola,
  URL'ye, toast'a veya hata mesajına yazılmaz. Kasa dosyalarında `console.*` kullanılmaz.
- **Doğrulama:** ana şifre AES-GCM çözmeyle doğrulanır (çözemiyorsa yanlış); ayrı şifre hash'i saklanmaz.
- **Yedek:** kasa ana yedeğe (store `exportData`) girmez; "Tüm verileri sil" kasaya dokunmaz. Şifreli
  yedek dosyası saklanan kaydın aynısıdır; yüklemeden önce yedeğin ana şifresiyle açılabildiği
  doğrulanır, açılmazsa mevcut kasaya dokunulmaz.
- **Kilit:** uygulama arka plana geçince (`visibilitychange` hidden, `pagehide`), kasa ekranından
  çıkınca (`leave`) ve 2 dk işlem olmayınca hemen kilitlenir: anahtar ve çözülmüş veri referansları
  bırakılır, açık sheet kapanır, ekran yeniden çizilir. (JavaScript belleği elle sıfırlayamaz;
  "silmek" = referansları bırakmak.)
- **Deneme sınırı:** 5 yanlış denemede 30 sn bekleme, her ek 5 denemede süre iki katı; bekleme
  sırasında doğru şifre de reddedilir.
- **Arayüz:** şifreler listede hiç görünmez; ayrıntıda varsayılan gizli (göz ikonuyla göster/gizle).
  Kopyalanan şifre 30 sn sonra `navigator.clipboard.writeText("")` ile silinir (başarısızsa sessizce
  geçilir). Tüm kasa alanlarında `autocomplete="off"` ve `autocapitalize="off"`. Silme iki dokunuşla,
  kasa sıfırlama "SIFIRLA" yazarak onaylanır.
- **Kurulum:** ana şifre en az 8 karakter + tekrarı; "Ana şifreni unutursan kasadaki şifreler
  kurtarılamaz. Bir yere yazıp güvenli sakla." uyarısı ve "Anladım" işaretlenmeden oluşturulmaz.
- **Şifre üretici:** `crypto.getRandomValues`, mod yanlılığı olmadan; 12–32 karakter; seçilen her
  türden en az bir karakter.
- **Test:** kasa kodu değişince `node tests/vault.test.mjs` geçmeli (şifrele/çöz, yanlış şifre,
  şifre değiştirme, depoda düz metin olmaması, deneme sınırı, yedek).

## Geliştirme

- Testler (harici kütüphane yok): `node tests/vault.test.mjs` (gerçek 600.000 iterasyon, ~2 sn),
  `node tests/bills.test.mjs` (vade, gecikme, ay sonu kayması, ödendi işaretleme, özet, tutar),
  `node tests/school.test.mjs` (şimdi/sıradaki ders, boşluk, çakışma, geri sayım, geçmiş/gelecek,
  dilim özeti ve alt yazı önceliği), `node tests/days.test.mjs` (sonraki gerçekleşme, yaş/yıl, 29 Şubat,
  geçersiz tarih, sıralama, gruplar, filtre, dilim özeti), `node tests/tasks.test.mjs` (Türkçe ifade
  algılama, gruplama, erteleme, gecikme, tamamlananlar, dilim özeti), `node tests/ics.test.mjs` (satır
  katlama, kaçış, CRLF, RRULE'ler ve ay sonu kayması, 29 Şubat, UNTIL, alarmlar, teslim zinciri, hash;
  örnek dosyayı yenilemek için `UPDATE_FIXTURES=1`), `node tests/phones.test.mjs` (numara temizleme ve
  biçimi, PIN'de baştaki 0, geçersiz numara/PIN, model/renk, ek bilgi sınırları, doğal sıra, yedek, çizim),
  `node tests/business.test.mjs` (numara/PIN, model/renk/platform/durum, gizli alanların atılması, ek bilgi
  sınırları, doğal sıra ve "Hat yok", Telegram'ın Türkçe alfabetik sırası, boş siluet, telefon silinince bağın kopması + Geri al, bilinmeyen phoneId, arama
  ve PIN'de aramama, yedek, ui.bizTab, "Bunu Kasa'ya koy" sözcükleri, Bybit sade kayıt ve eski alanların korunması, sürüm bazlı tohum, Business özeti),
  `node tests/ring-blocks.test.mjs` (blok sayısı, yay sınırları, derz, tohumlu tonlar, malzeme kuralları),
  `node tests/assistant.test.mjs` (bağlamda PIN ve hassas satır yok, 8 KB kırpma, araç → kayıt, şema dışı ret,
  onaysız değişiklik yok, silmenin iki adımı), `node tests/worker.test.mjs` (fetch/KV taklit: 401, CORS, quota, sınırlar).
- Izgara içindeki yatay kayan şeritler sayfayı genişletmesin: kapsayıcıya
  `grid-template-columns: minmax(0, 1fr)` ya da `min-width: 0` ver; 375px'te `scrollWidth` kontrol et.
- Yayın: GitHub Pages, `main` dalının kökü → https://mustafabahafaik.github.io/tamarin/. Depo herkese açık:
  kişisel veri, gerçek şifre ya da kasa içeriği commit'lenmez; testlerde ve örneklerde yalnızca uydurma veriler.
  Tek istisna (kullanıcı açıkça istedi, riskini bilerek): js/phones-seed.js'teki telefon numaraları ve SIM PIN'leri.
- Yerel sunucu: `node tools/serve.mjs` → http://localhost:5190/tamarin/
  (GitHub Pages'teki alt yolu taklit eder; telefondan bakmak için `--lan`).
- **Tamarin görseli:** `python tools/cut_tamarin.py --photo referans/tamarin.jpg` (rembg isnet + pymatting +
  numpy + Pillow; ~1 dk), ardından `python tools/make_icons.py`. Adımlar:
  1. rembg yumuşak maskesinden trimap; arada pymatting closed-form alfa (bıyık ve kulak kılları). Model maskesi
     ile büyüğü alınır (tel kopmasın).
  2. Renk arındırma: pymatting `estimate_foreground_ml`; kenarda yeşil/koyu arka plan saçağı kalmaz.
  3. Kadraj: gözlerin ortası halka merkezinin 12u üstünde, ölçek 0.245 u/fotoğraf pikseli, kare kenarı 2 × 137u
     (= 1118 fotoğraf pikseli). Fotoğrafın üst kenarı kafayı kestiği için tepe 70 pikselde yumuşakça erir.
  4. Halka maskesi: deliğin içi kalır; bantta yalnızca bıyık telleri (parlak, az doygun); koyu kürk üstte iç
     kenara ~10u taşar (kulaklar), altta 34u'luk geniş geçişle erir (omuzlar).
  5. Renk doğal, yalnızca +%4 sıcaklık; doygunluk artırma, keskinleştirme, HDR yok.
  6. Çıktı `assets/tamarin-1152.webp` ve `-768`, WebP kalite 88, alfa. En büyük ekranda (430×932, DPR 3) kutu
     274u ≈ 374 CSS px → 1122 cihaz pikseli; 1152 görsel bunu karşılar (kaynak 1118 px, yani en büyük ekranda
     bile ~1:1; fotoğraftan fazla detay yoktur). `<img srcset>` + `sizes`: 768 / 1152.
  7. Göz kırpma YOK: fotoğrafta kapalı göz karesi yok; kürkten sentezlenen kapak yakından yapay göründü.
  Eski GIF yolu (`python tools/cut_tamarin.py`, referans/tasarim.gif) yalnızca geçmiş için duruyor; yeni kadrajla
  uyumlu değil.
- Service worker network-first. Yeni bir uygulama dosyası eklenince `sw.js` içindeki
  `SHELL` listesine de ekle ve `CACHE` sürümünü artır.
- Yüz ekranı kurulurken gelen olaylar (ör. önbellekten yüklenen hava) ekran henüz sayfaya
  takılmadığı için gelir: temizliği yalnızca "takıldı, sonra çıkarıldı" durumunda yap (`gone()`).
- Önizleme bölmesi gizliyken tarayıcı çizim döngüsünü (requestAnimationFrame) durdurur; efekt
  testlerinde bunu hata sanma, bölme görünürken ya da tek kare çizdirerek dene.
