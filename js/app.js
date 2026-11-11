// Router + render. Boş hash = yüz; #odemeler, #egitim, #gunler, #ajanda = modül ekranları; #kasa = şifre kasası.
import { h, icons, closeSheet, toast } from './ui.js';
import { createFaceScreen } from './face.js';
import { unlockAudio } from './sound.js';
import { loadWarning } from './store.js';
import bills from './modules/bills.js';
import school from './modules/school.js';
import days from './modules/days.js';
import tasks from './modules/tasks.js';
import vault from './modules/vault.js';

const MODULES = [bills, school, days, tasks]; // yüzdeki dört dilim
const SCREENS = [...MODULES, vault];          // hash ile açılan tüm ekranlar
const byRoute = new Map(SCREENS.map((mod) => [mod.route, mod]));
const root = document.getElementById('app');
let current = null; // açık modül ekranı (ayrılırken leave() çağrılır)

// Modüle yüzden mi gelindi? Öyleyse geri butonu tarayıcı geçmişinde bir adım geri gider;
// uygulama doğrudan bir modül adresiyle açıldıysa geçmiş boştur, o zaman yüze "atlarız".
let cameFromFace = false;

function routeOf(url) {
  return decodeURIComponent(new URL(url).hash.slice(1));
}

function goToFace() {
  history.replaceState(null, '', location.pathname + location.search);
  cameFromFace = false;
  render();
}

function goBack() {
  if (cameFromFace) history.back();
  else goToFace();
}

function mount(screen) {
  root.replaceChildren(screen);
  window.scrollTo(0, 0);
}

function renderFace() {
  document.title = 'Tamarin';
  mount(createFaceScreen(MODULES));
}

function renderModule(mod) {
  document.title = `${mod.title} · Tamarin`;
  const body = h('main', { class: 'module-body' });
  mod.render(body);
  mount(h('div', { class: 'screen screen-module', dataset: { cat: mod.id } },
    h('header', { class: 'topbar' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Geri', onclick: goBack }, icons.back()),
      h('h1', { class: 'topbar-title' }, mod.title)),
    body,
    mod.fab !== false && h('button', {
      type: 'button', class: 'fab', 'aria-label': mod.addLabel, onclick: () => mod.onAdd?.(),
    }, icons.plus())));
}

function render() {
  closeSheet();
  const route = routeOf(location.href);
  const mod = route ? byRoute.get(route) ?? null : null;
  if (current && current !== mod) current.leave?.(); // ör. kasa: ekrandan çıkınca kilitlen
  current = mod;
  if (!route) return renderFace();
  if (!mod) return goToFace(); // bilinmeyen adres → yüz
  renderModule(mod);
}

window.addEventListener('hashchange', (event) => {
  const from = routeOf(event.oldURL);
  const to = routeOf(event.newURL);
  if (!to) cameFromFace = false;
  else if (!from) cameFromFace = true;
  render();
});

unlockAudio(); // iOS: ses ilk dokunuşta açılır
render();
if (loadWarning) toast(loadWarning, { duration: 7000 });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Tamarin: service worker kaydedilemedi', err);
    });
  });
}
