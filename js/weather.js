// Hava durumu: Open-Meteo tahmini ve şehir arama (API anahtarı gerektirmez).
// - Şehir store'daki `city` alanından gelir (varsayılan Çanakkale).
// - Tahmin 30 dk store önbelleğinde durur (localStorage, yedeğe girmez); istek 8 sn'de zaman aşımına uğrar.
// - İnternet yoksa son veri "x dk önce" notuyla gösterilir.
// - "Sahne" (scene): efekt katmanı ve durum mesajının kullandığı sade hava özeti.
//   Ayarlardaki "Hava efektini dene" seçicisi gerçek sahnenin yerine hazır bir sahne koyar.
import { getState, getCache, setCache } from './store.js';

const MAX_AGE = 30 * 60 * 1000;
const TIMEOUT = 8000;
export const WINDY = 25; // km/s üstü "rüzgarlı"

/* ---------- WMO kodları ---------- */

// kod → [Türkçe açıklama, tür, şiddet 0–1]
const CODES = {
  0: ['Açık', 'clear', 0], 1: ['Az bulutlu', 'partly', 0], 2: ['Parçalı bulutlu', 'partly', 0], 3: ['Kapalı', 'cloudy', 0],
  45: ['Sisli', 'fog', 0], 48: ['Kırağılı sis', 'fog', 0],
  51: ['Hafif çisenti', 'drizzle', 0.2], 53: ['Çisenti', 'drizzle', 0.3], 55: ['Yoğun çisenti', 'drizzle', 0.45],
  56: ['Dondurucu çisenti', 'drizzle', 0.3], 57: ['Yoğun dondurucu çisenti', 'drizzle', 0.45],
  61: ['Hafif yağmur', 'rain', 0.35], 63: ['Yağmurlu', 'rain', 0.6], 65: ['Şiddetli yağmur', 'rain', 0.9],
  66: ['Dondurucu yağmur', 'rain', 0.5], 67: ['Şiddetli dondurucu yağmur', 'rain', 0.85],
  71: ['Hafif kar', 'snow', 0.3], 73: ['Karlı', 'snow', 0.55], 75: ['Yoğun kar', 'snow', 0.85], 77: ['Kar taneleri', 'snow', 0.25],
  80: ['Hafif sağanak', 'showers', 0.45], 81: ['Sağanak', 'showers', 0.7], 82: ['Şiddetli sağanak', 'showers', 0.95],
  85: ['Kar sağanağı', 'snow', 0.5], 86: ['Yoğun kar sağanağı', 'snow', 0.85],
  95: ['Gök gürültülü fırtına', 'storm', 0.8], 96: ['Dolu ve fırtına', 'storm', 0.9], 99: ['Şiddetli dolu ve fırtına', 'storm', 1],
};

const ICON_OF = { clear: 'clear', partly: 'partly', cloudy: 'cloud', fog: 'fog', drizzle: 'rain', rain: 'rain', showers: 'rain', snow: 'snow', storm: 'storm' };

/** { text, kind, intensity, icon } — icon: gece açık havada "moon". */
export function describe(code, isDay = true) {
  const [text, kind, intensity] = CODES[code] ?? ['Bilinmiyor', 'cloudy', 0];
  let icon = ICON_OF[kind];
  if (!isDay && kind === 'clear') icon = 'moon';
  if (!isDay && kind === 'partly') icon = 'partly-night';
  return { text, kind, intensity, icon };
}

/* ---------- Ağ ---------- */

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const round = (n) => Math.round(n * 1000) / 1000;
const sameCity = (data, city) => data && round(data.lat) === round(city.lat) && round(data.lon) === round(city.lon);

/** Open-Meteo yanıtını uygulamanın kullandığı sade biçime çevirir. */
export function parseForecast(json, city, at = Date.now()) {
  const c = json.current;
  const d = json.daily;
  return {
    at,
    city: city.name,
    lat: city.lat,
    lon: city.lon,
    current: {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      code: c.weather_code,
      wind: c.wind_speed_10m,
      isDay: c.is_day === 1,
      precip: c.precipitation ?? 0,
    },
    daily: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      pop: d.precipitation_probability_max?.[i] ?? 0,
      sunrise: d.sunrise[i],
      sunset: d.sunset[i],
    })),
  };
}

/** Şu anki şehir için son bilinen tahmin (yaşı ne olursa olsun) ya da null. */
export function cachedForecast() {
  const data = getCache('forecast');
  return data?.current && Array.isArray(data.daily) && sameCity(data, getState().city) ? data : null;
}

/**
 * Gerekirse ağdan yeniler. Dönen: { data, stale } — stale: ağdan alınamadı, eski veri.
 * Hiç veri yoksa data null.
 */
export async function refreshForecast({ force = false } = {}) {
  const cached = cachedForecast();
  if (!force && cached && Date.now() - cached.at < MAX_AGE) return { data: cached, stale: false };
  const { city } = getState();
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${city.lat}&longitude=${city.lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,precipitation'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
    + '&timezone=auto&forecast_days=4';
  try {
    const data = parseForecast(await fetchJson(url), city);
    setCache('forecast', data);
    return { data, stale: false };
  } catch (err) {
    console.warn('Tamarin: hava durumu alınamadı', err);
    return { data: cached, stale: true };
  }
}

/** "az önce", "12 dk önce", "3 sa önce", "2 gün önce" */
export function ageLabel(at, now = Date.now()) {
  const min = Math.round((now - at) / 60000);
  if (min < 2) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const hours = Math.round(min / 60);
  return hours < 24 ? `${hours} sa önce` : `${Math.round(hours / 24)} gün önce`;
}

/** Şehir arama: [{ name, region, lat, lon }] (en çok 6). Ağ hatasında fırlatır. */
export async function searchCities(name) {
  const q = name.trim();
  if (q.length < 2) return [];
  const json = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=tr`);
  return (json.results ?? []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter((x, i, all) => x && all.indexOf(x) === i && x !== r.name).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

/* ---------- Sahne ---------- */

/**
 * Sahne: { kind, night, clouds 0–1, rain 0–1, snow 0–1, fog, lightning, wind (km/s), windy, sunny }
 * kind: clear | partly | cloudy | fog | drizzle | rain | showers | snow | storm
 */
export function sceneFrom(data) {
  if (!data) return makeScene({ kind: 'partly', clouds: 0.3 });
  const { code, isDay, wind, precip } = data.current;
  const { kind, intensity } = describe(code, isDay);
  const clouds = { clear: 0, partly: code === 1 ? 0.25 : 0.5, cloudy: 0.9, fog: 0.4, drizzle: 0.7, rain: 0.8, showers: 0.7, snow: 0.8, storm: 1 }[kind];
  const wet = ['drizzle', 'rain', 'showers', 'storm'].includes(kind);
  return makeScene({
    kind,
    night: !isDay,
    clouds,
    rain: wet ? Math.max(intensity, Math.min(1, precip / 4)) : 0,
    snow: kind === 'snow' ? intensity : 0,
    wind,
  });
}

function makeScene({ kind, night = false, clouds = 0, rain = 0, snow = 0, wind = 6 }) {
  return {
    kind, night, clouds, rain, snow, wind,
    fog: kind === 'fog',
    lightning: kind === 'storm',
    windy: wind > WINDY,
    sunny: !night && (kind === 'clear' || kind === 'partly'),
  };
}

export const PREVIEWS = {
  real: 'Gerçek',
  sunny: 'Güneşli',
  night: 'Gece',
  cloudy: 'Bulutlu',
  rain: 'Yağmurlu',
  snow: 'Karlı',
  storm: 'Fırtınalı',
  windy: 'Rüzgarlı',
};

const PRESETS = {
  sunny: { kind: 'clear', clouds: 0.1, wind: 8 },
  night: { kind: 'clear', night: true, clouds: 0.05, wind: 5 },
  cloudy: { kind: 'cloudy', clouds: 0.9, wind: 12 },
  rain: { kind: 'rain', clouds: 0.85, rain: 0.6, wind: 14 },
  snow: { kind: 'snow', clouds: 0.8, snow: 0.6, wind: 8 },
  storm: { kind: 'storm', clouds: 1, rain: 0.95, wind: 38 },
  windy: { kind: 'partly', clouds: 0.35, wind: 42 },
};

// Uygulama içi hava "merkezi": gerçek veri + deneme seçimi → etkin sahne. Değişince "scene" olayı.
export const weatherEvents = new EventTarget();
let realData = null;
let realStale = false;
let preview = 'real'; // yalnızca bellekte: uygulama yeniden açılınca "Gerçek"e döner

const emit = () => weatherEvents.dispatchEvent(new CustomEvent('scene', { detail: currentScene() }));

export function setRealForecast(data, stale = false) {
  realData = data;
  realStale = stale;
  emit();
}

export const realForecast = () => ({ data: realData, stale: realStale });
export const getPreview = () => preview;

export function setPreview(key) {
  preview = PREVIEWS[key] ? key : 'real';
  emit();
}

/** Efektin ve mesajın kullandığı sahne (deneme seçiliyse o). */
export function currentScene() {
  return preview === 'real' ? sceneFrom(realData) : makeScene(PRESETS[preview]);
}
