// Tamarin asistanı — Cloudflare Pages aracısı (adres: *.pages.dev).
// Bazı iPhone ayarları/engelleyicileri başka bir siteden (github.io) *.workers.dev'e giden istekleri kesiyor.
// Bu Pages projesi isteği olduğu gibi asıl Worker'a (tamarin-asistan) servis bağlantısıyla iletir; sırlar,
// sınırlar, CORS ve doğrulama Worker'da kalır. Burada hiçbir şey loglanmaz ve saklanmaz.
export default {
  fetch(request, env) {
    return env.ASISTAN.fetch(request);
  },
};
