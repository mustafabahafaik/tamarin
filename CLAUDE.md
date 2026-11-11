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
  - `js/face.js` — ana ekran yüzü (başlık, halka, tamarin, "Bugün" şeridi, zil/tahmin/kayıt sheet'leri)
  - `js/status.js` — durum: acil olanlar, yaklaşanlar listesi, alttaki yazı, tamarinin ruh hali
  - `js/sound.js` — Web Audio ile sentezlenen tamarin sesleri
  - `js/settings.js` — Ayarlar ekranı (sol üstteki kullanıcıya dokununca açılan sheet)
  - `js/modules/*.js` — `bills`, `school`, `days`, `tasks`, `vault` (şifre kasası ekranı)
  - `js/vault.js` — kasa çekirdeği: Web Crypto ile şifreleme, kilit, otomatik kilit, şifre üretici
  - `tests/` — Node testleri (`vault`, `bills`, `school`, `days`, `tasks`, `ics`: `node tests/<ad>.test.mjs`);
    `tests/fixtures/ornek.ics` örnek takvim (`.gitattributes`: `-text`, CRLF bayt bayt korunur)
  - `manifest.webmanifest`, `sw.js`, `icons/`
  - `README.md`, `docs/ekran-goruntusu.webp` (README görseli), `.nojekyll` (Pages dosyaları işlemesin)
  - `assets/` — şeffaf tamarin görselleri (`tamarin.webp`, göz kırpma için `tamarin-blink.webp`). Görsel ve ondan
    üretilen `icons/` proje sahibine ait (kaynağı referans/tasarim.gif); lisans sorusu kapandı, değiştirme önerme
  - `referans/tasarim.gif` — ana ekranın yerleşim ve ölçü referansı (renkleri artık "Toprak" teması).
    Yalnızca bu bilgisayarda: `.gitignore`'da, depoya girmez (tools/cut_tamarin.py okur)
  - `tools/` — yalnızca geliştirme araçları (yerel sunucu, tamarin kesici, ikon üretici); uygulama bunları yüklemez
- **Kullanıcı:** Tek kullanıcı; ad ve şehir store'da (`name` varsayılan "Baha", `city` varsayılan
  Çanakkale). Ayarlar ekranından değişir.
- **Veri:** localStorage, `"tamarin.v1"` anahtarında tek state nesnesi (js/store.js). Bildirimler
  iPhone Takvimi'ne `.ics` aktarımıyla; hava durumu Open-Meteo'dan. Şema (alanların kuralları
  store.js'teki `SHAPES`'te):
  - `{ version: 2, name, city: {name, lat, lon}, semesterEnd, sound: {on, volume 0–1}, bills, classes, exams, days, tasks, exNoticeClosed, ui: {schoolTab}, calendar, cache }`
  - calendar `{exported: {"<tür>:<id>": hash}, last: {at, method, count, note} | null}` (js/ics.js yazar)
  - bill `{id, name, cat, amount, day (1–31; kısa ayda son güne kırpılır), note, paid: ["2026-11", …]}`;
    cat: Kira / Aidat / Telefon / İnternet / Elektrik / Su / Doğalgaz / Abonelik / Kredi kartı / Diğer
    (eski Konut/Fatura/Kredi değerleri yüklemede çevrilir)
  - class `{id, name, day (1=Pzt..7=Paz), start "HH:MM", end, room, teacher}`
  - exam `{id, course, type (Vize/Final/Bütünleme/Quiz/Ödev teslimi/Proje teslimi), date, time, room, note}`
  - day `{id, name, kind (Doğum günü/Yıldönümü/Özel gün), day, month, year?, rel (Aile/Arkadaş/Sevgili/İş-Okul/Diğer), note}`
  - task `{id, title, date ("" = tarihsiz), time? (yalnızca tarihliyse), remind ("0","15","60","1440","none"),
    prio (low/normal/high), note, done, doneAt (ISO; yalnızca tamamlanmışsa)}`; tarihsiz görev zile ve yüze girmez
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
    zil. Altında tek satır ipucu: yağış > %50, > 30°, < 5°, rüzgar > 25 km/s; yoksa gün doğumu/batımı.
    İsim kesilmez: sığmazsa selamdan sonra ikinci satıra iner (`.greet-hello` / `.greet-name`); hava
    sütunu daha uzun olduğu için başlık yüksekliği değişmez (yalnızca 430px civarında birkaç piksel).
  - Ortada 4 dilimli mat halka — sol üst Ödemeler (kiremit, cüzdan), sağ üst Eğitim (arduvaz mavisi,
    kep), sol alt Özel Günler (gül kurusu, kalp), sağ alt Ajanda (adaçayı, takvim) — ve ortada tamarin.
    Altında tamarinin durum yazısı: acil bir şey yoksa havaya göre konuşur.
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
  ikonu); boş hash = yüz. Ekran `leave()` tanımlarsa router ayrılırken çağırır; "+" ekranın `onAdd()`'ını
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
  arduvaz mavisi, özel günler gül kurusu, ajanda adaçayı (`--bills-1..3`, `--school-*`, `--days-*`,
  `--tasks-*`; 1/2/3 aynı rengin hafif ışık farkı). Ana renk patina turkuazı (`--accent`). Tüm
  renkler CSS değişkeni (`:root`). Modül ekranları, sheet'ler ve ikonlar aynı paleti kullanır.
- **"Yapay zekâ işi" görünmesin:** Neon parlama, renkli/bulanık ışık lekeleri, parıltı çizgileri ve
  doygun gökkuşağı degradeleri yok. İstisnalar yalnızca: acil dilimin çevresinde nabız gibi atan
  yumuşak hale (`.slice-glow`) ve Özel Günler kutlama kartının pembe halesi (`.d-hero.is-party`).
  Konfeti de paletin mat tonlarından (`--confetti-0..4`). Emoji yok.
- **Hareket:** Animasyonlar yalnızca `transform`/`opacity` ile (telefonda akıcı kalsın; bulanıklık
  filtreleri sabit katmanlarda). `prefers-reduced-motion` açıksa sürekli animasyonlar durur.
- **Tarihler:** Yerel saat (Europe/Istanbul), Türkçe gün/ay adları.

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
  örnek dosyayı yenilemek için `UPDATE_FIXTURES=1`).
- Izgara içindeki yatay kayan şeritler sayfayı genişletmesin: kapsayıcıya
  `grid-template-columns: minmax(0, 1fr)` ya da `min-width: 0` ver; 375px'te `scrollWidth` kontrol et.
- Yayın: GitHub Pages, `main` dalının kökü → https://mustafabahafaik.github.io/tamarin/. Depo herkese açık:
  kişisel veri, gerçek şifre ya da kasa içeriği commit'lenmez; testlerde ve örneklerde yalnızca uydurma veriler.
- Yerel sunucu: `node tools/serve.mjs` → http://localhost:5190/tamarin/
  (GitHub Pages'teki alt yolu taklit eder; telefondan bakmak için `--lan`).
- Tamarini kes: `python tools/cut_tamarin.py` (rembg + Pillow; referans/tasarim.gif karelerinden;
  neon yansımalarını silip Toprak temasına göre ısıtır).
  Gerçek fotoğraf için `--photo referans/tamarin.jpg`. Ardından ikonları yeniden üret:
  `python tools/make_icons.py`.
- Service worker network-first. Yeni bir uygulama dosyası eklenince `sw.js` içindeki
  `SHELL` listesine de ekle ve `CACHE` sürümünü artır.
- Yüz ekranı kurulurken gelen olaylar (ör. önbellekten yüklenen hava) ekran henüz sayfaya
  takılmadığı için gelir: temizliği yalnızca "takıldı, sonra çıkarıldı" durumunda yap (`gone()`).
- Önizleme bölmesi gizliyken tarayıcı çizim döngüsünü (requestAnimationFrame) durdurur; efekt
  testlerinde bunu hata sanma, bölme görünürken ya da tek kare çizdirerek dene.
