// Business (#business; sekmeler #business/telefonlar, #business/telegram, #business/bybit, #business/okx):
// telefonlar/hatlar ve bu hatlarda açılmış Telegram, Bybit, OKX hesapları, birbirine bağlı. Son sekme store
// ui.bizTab'da. Arama ad, numara, kullanıcı adı ve UID'de; PIN'de aramaz. Satır/ayrıntı/form: phones.js, accounts.js.
import { h, svg } from '../ui.js';
import { getState, onChange, setField, BIZ_TABS, PLATFORMS } from '../store.js';
import { searchPhones, searchAccounts, accountGroups, sortByLabel } from '../status.js';
import { phoneArt } from '../phone-art.js';
import { icon, PLAIN, badge, hideAllPins } from '../biz-ui.js';
import { phoneRow, openPhoneForm } from './phones.js';
import { accountRow, openAccountForm, COMPACT } from './accounts.js';

const TAB_TITLES = { telefonlar: 'Telefonlar', telegram: 'Telegram', bybit: 'Bybit', okx: 'OKX' };
const PLATFORM_OF = { telegram: 'Telegram', bybit: 'Bybit', okx: 'OKX' };

let tab = 'telefonlar';
let query = '';
let root = null;
let seg = null;
let listEl = null;
let stop = null;

const storedTab = () => getState().ui?.bizTab ?? 'telefonlar';

/** Sekmeyi değiştirir: adres (#business/<sekme>, geçmişe eklemeden) ve store ui.bizTab. */
function goTab(next) {
  if (!BIZ_TABS.includes(next)) return;
  if (location.hash !== `#business/${next}`) location.replace(`#business/${next}`); // hashchange → subroute
  else selectTab(next);
}

function selectTab(next) {
  tab = BIZ_TABS.includes(next) ? next : storedTab();
  if (tab !== storedTab()) setField('ui', { ...getState().ui, bizTab: tab }); // change → draw
  else draw();
}

function emptyState() {
  const platform = PLATFORM_OF[tab];
  if (!platform) {
    return h('div', { class: 'p-empty' },
      svg(phoneArt('iPhone 12', 'Su yeşili', true, 72, 'phone-art p-empty-art')),
      h('p', { class: 'p-empty-text' }, 'Telefonlarını ekle'),
      h('button', { type: 'button', class: 'btn btn-primary p-empty-btn', onclick: () => openPhoneForm() }, 'Telefon ekle'));
  }
  return h('div', { class: 'p-empty' },
    badge(platform, 'is-empty-badge'),
    h('p', { class: 'p-empty-text' }, `${platform} hesaplarını ekle`),
    h('button', { type: 'button', class: 'btn btn-primary p-empty-btn', onclick: () => openAccountForm(null, { platform }) }, `${platform} hesabı ekle`));
}

function paintTabs(state) {
  const counts = {
    telefonlar: searchPhones(state.phones, state.accounts, query).length,
    ...Object.fromEntries(PLATFORMS.map((p) => [p.toLowerCase(), searchAccounts(state.accounts, state.phones, query, p).length])),
  };
  seg.querySelectorAll('.biz-seg-btn').forEach((btn) => {
    const key = btn.dataset.tab;
    btn.setAttribute('aria-selected', String(key === tab));
    btn.querySelector('.biz-seg-n').textContent = String(counts[key]);
    btn.setAttribute('aria-label', `${TAB_TITLES[key]}, ${counts[key]}`);
  });
}

function draw() {
  if (!root?.isConnected) return;
  const state = getState();
  paintTabs(state);
  const platform = PLATFORM_OF[tab];
  const total = platform ? state.accounts.filter((a) => a.platform === platform).length : state.phones.length;
  if (!total) { listEl.replaceChildren(emptyState()); return; }

  if (!platform) {
    const phones = searchPhones(state.phones, state.accounts, query);
    listEl.replaceChildren(phones.length
      ? h('ul', { class: 'p-list' }, phones.map((p) => phoneRow(p, state.accounts)))
      : h('p', { class: 'biz-none biz-nohit' }, 'Eşleşen telefon yok.'));
    return;
  }

  const found = searchAccounts(state.accounts, state.phones, query, platform);
  if (!found.length) { listEl.replaceChildren(h('p', { class: 'biz-none biz-nohit' }, 'Eşleşen hesap yok.')); return; }
  const byId = new Map(state.phones.map((p) => [p.id, p]));
  // Telegram ve Bybit: tek liste, etikete göre alfabetik (telefonsuzlar siluetle, aynı listede).
  if (COMPACT.has(platform)) {
    listEl.replaceChildren(h('ul', { class: 'p-list' }, sortByLabel(found).map((a) => accountRow(a, byId.get(a.phoneId)))));
    return;
  }
  // OKX: bağlı telefonun sırasıyla, telefonsuzlar altta "Hat yok" grubunda.
  listEl.replaceChildren(...accountGroups(found, state.phones).map((group) => h('section', { class: 'a-group' },
    group.title && h('h2', { class: 'a-group-title' }, group.title, h('span', { class: 'a-group-n' }, String(group.items.length))),
    h('ul', { class: 'p-list' }, group.items.map((a) => accountRow(a, byId.get(a.phoneId)))))));
}

export default {
  id: 'business',
  route: 'business',
  title: 'Business',
  get addLabel() { return tab === 'telefonlar' ? 'Telefon ekle' : `${PLATFORM_OF[tab]} hesabı ekle`; },
  onAdd: () => (tab === 'telefonlar' ? openPhoneForm() : openAccountForm(null, { platform: PLATFORM_OF[tab] })),
  render(container, sub = '') {
    tab = BIZ_TABS.includes(sub) ? sub : storedTab();
    const search = h('input', {
      class: 'input v-search', type: 'search', ...PLAIN, autocapitalize: 'off', enterkeyhint: 'search',
      placeholder: 'Ad, numara, kullanıcı adı, UID', 'aria-label': 'Business içinde ara',
    });
    search.value = query;
    search.addEventListener('input', () => { query = search.value; draw(); });
    seg = h('div', { class: 'biz-seg', role: 'tablist', 'aria-label': 'Bölüm' }, BIZ_TABS.map((key) => h('button', {
      type: 'button', role: 'tab', class: 'biz-seg-btn', dataset: { tab: key }, onclick: () => goTab(key),
    }, h('span', { class: 'biz-seg-name' }, TAB_TITLES[key]), h('span', { class: 'biz-seg-n' }, ''))));
    listEl = h('div', { class: 'biz-list' });
    root = h('div', { class: 'biz' },
      // Sıra: başlık (üst çubuk) → sekme seçici → arama. Arama en üstte durunca kaydırırken durum çubuğunun
      // ve başlığın altına giriyordu.
      h('div', { class: 'biz-tools' },
        seg,
        h('span', { class: 'v-search-wrap' }, icon('search', 'v-search-icon'), search)),
      listEl);
    container.append(root);
    stop?.();
    stop = onChange(() => draw());
    if (tab !== storedTab()) setField('ui', { ...getState().ui, bizTab: tab });
    queueMicrotask(draw);
  },
  /** Aynı ekranda sekme adresi değişince (#business/telegram): ekran yeniden kurulmaz. */
  subroute(sub) {
    selectTab(sub);
  },
  /** Ekrandan çıkınca: aboneliği bırak, açık PIN'leri gizle, aramayı unut. */
  leave() {
    stop?.();
    stop = null;
    hideAllPins();
    root = null;
    query = '';
  },
};
