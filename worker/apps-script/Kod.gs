// Tamarin asistanı — Google Apps Script aracısı (script.google.com, ücretsiz).
// Neden: bazı Türkiye ağları Cloudflare'in ücretsiz adreslerini (*.workers.dev, *.pages.dev) DNS'ten engelliyor;
// iPhone'da ana ekrandaki web uygulaması bu adreslere ulaşamıyor (Safari sekmesi Özel Geçiş ile ulaşabiliyor).
// Bu betik isteği Google'ın sunucusundan asıl Worker'a aynen iletir ve yanıtı döner.
// Sır YOK: Gemini anahtarı ve erişim kodu yalnızca Worker'da; erişim kodu istek gövdesinde gelir, Worker denetler.
// Hiçbir şey loglanmaz ve saklanmaz.
//
// Kurulum (README > Asistan): script.google.com > Yeni proje > bu dosyayı yapıştır > Dağıt > Yeni dağıtım >
// Web uygulaması, "Ben olarak yürüt", erişim "Herkes" > Dağıt > çıkan /exec adresi Tamarin'de Worker adresi olur.

const WORKER = 'https://tamarin-asistan.tamarin-asistan.workers.dev';

/** POST ?p=chat | ?p=ping — gövde (text/plain JSON, { token, ... }) Worker'a aynen gider. */
function doPost(e) {
  const path = e && e.parameter && e.parameter.p === 'ping' ? '/ping' : '/chat';
  const body = e && e.postData ? e.postData.contents : '{}';
  if (body.length > 48 * 1024) return out({ error: 'too_large' });
  try {
    const res = UrlFetchApp.fetch(WORKER + path, {
      method: 'post',
      contentType: 'text/plain;charset=UTF-8',
      payload: body,
      muteHttpExceptions: true,
      followRedirects: true,
    });
    return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return out({ error: 'upstream' });
  }
}

/** GET: sağlık testi (kod gerekmez, bilgi vermez). */
function doGet() {
  return out({ ok: true, service: 'tamarin-asistan', via: 'apps-script' });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
