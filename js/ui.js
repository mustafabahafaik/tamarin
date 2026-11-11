// Ortak arayüz parçaları: h() DOM yardımcısı, ikonlar, alttan açılan sheet ve toast.

/**
 * Küçük DOM yardımcısı. Metinler her zaman metin düğümü olarak eklenir (innerHTML yok),
 * böylece kullanıcı verisi HTML olarak yorumlanmaz.
 *   h('button', { class: 'btn', onclick: kaydet }, 'Kaydet')
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Sabit (bizim yazdığımız) SVG işaretlemesinden düğüm üretir. */
export function svg(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export const icons = {
  back: () => svg('<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  plus: () => svg('<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'),
};

/* ---------- Sheet (alttan açılan panel) ---------- */

let activeSheet = null;
let sheetCount = 0;

/**
 * Alttan açılan panel. `body` bir DOM düğümüdür (genelde form).
 * Kapatma: "Kapat" butonu, arka plana dokunma, Escape ya da tutamacı aşağı çekme.
 * Dönen nesne: { close, panel }
 */
export function openSheet({ title, body, onClose } = {}) {
  activeSheet?.close();

  const titleId = `sheet-title-${++sheetCount}`;
  const closeButton = h('button', { type: 'button', class: 'btn-text' }, 'Kapat');
  const head = h('header', { class: 'sheet-head' },
    h('h2', { id: titleId, class: 'sheet-title' }, title),
    closeButton);
  const panel = h('section', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1',
  },
  h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
  head,
  h('div', { class: 'sheet-body' }, body));
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const layer = h('div', { class: 'sheet-layer' }, backdrop, panel);

  const previousFocus = document.activeElement;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    if (activeSheet === api) activeSheet = null;
    layer.classList.remove('is-open');
    document.documentElement.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
    window.visualViewport?.removeEventListener('resize', onViewport);
    window.visualViewport?.removeEventListener('scroll', onViewport);
    const remove = () => layer.remove();
    panel.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 450); // transition hiç tetiklenmezse
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    onClose?.();
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
  }

  // iPhone klavyesi açılınca paneli klavyenin üstüne taşı.
  function onViewport() {
    const vv = window.visualViewport;
    const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    layer.style.setProperty('--kb', `${keyboard}px`);
  }

  // Tutamaçtan / başlıktan aşağı çekerek kapatma.
  let dragStart = null;
  let dragDistance = 0;
  panel.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.sheet-grip, .sheet-head') || event.target.closest('button')) return;
    dragStart = event.clientY;
    dragDistance = 0;
    panel.setPointerCapture(event.pointerId);
    panel.classList.add('is-dragging');
  });
  panel.addEventListener('pointermove', (event) => {
    if (dragStart == null) return;
    dragDistance = Math.max(0, event.clientY - dragStart);
    panel.style.transform = `translateY(${dragDistance}px)`;
  });
  const endDrag = () => {
    if (dragStart == null) return;
    dragStart = null;
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    if (dragDistance > 90) close();
  };
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  window.visualViewport?.addEventListener('resize', onViewport);
  window.visualViewport?.addEventListener('scroll', onViewport);

  document.body.append(layer);
  document.documentElement.classList.add('is-locked');
  void layer.offsetWidth; // başlangıç durumunu çizdir ki geçiş animasyonu çalışsın
  layer.classList.add('is-open');
  panel.focus({ preventScroll: true });

  const api = { close, panel };
  activeSheet = api;
  return api;
}

/** Açık bir sheet varsa kapatır (ör. ekran değişirken). */
export function closeSheet() {
  activeSheet?.close();
}

/* ---------- Dosya kaydetme ---------- */

const isAppleMobile = () => /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Dosyayı kullanıcıya verir: iPhone'da paylaşım sayfası ("Dosyalar'a Kaydet"), başka yerde indirme.
 * Dönen: 'shared' | 'downloaded' | 'cancelled'
 */
export async function saveFile(file, { title = file.name } = {}) {
  if (isAppleMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: file.name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/* ---------- İki dokunuşla onay ---------- */

/**
 * Tehlikeli butonlar için confirm() yerine: ilk dokunuşta buton "Emin misin? Tekrar dokun"a
 * döner, birkaç saniye içinde ikinci dokunuş işlemi yapar; süre dolarsa eski haline döner.
 */
export function confirmTap(button, onConfirm, { prompt = 'Emin misin? Tekrar dokun', timeout = 3500 } = {}) {
  const label = button.textContent;
  let timer = 0;
  const disarm = () => {
    clearTimeout(timer);
    button.classList.remove('is-armed');
    button.textContent = label;
  };
  button.addEventListener('click', () => {
    if (!button.classList.contains('is-armed')) {
      button.classList.add('is-armed');
      button.textContent = prompt;
      timer = setTimeout(disarm, timeout);
      return;
    }
    disarm();
    onConfirm();
  });
  return button;
}

/* ---------- Toast ---------- */

let toastHost = null;
let toastTimer = 0;

/**
 * Kısa bildirim. İsteğe bağlı aksiyon butonu (ya da en çok iki buton):
 *   toast('Silindi', { action: 'Geri al', onAction: geriAl })
 *   toast('Eklendi', { actions: [{ label: 'Takvime ekle', onAction: aktar }, { label: 'Geri al', onAction: geriAl }] })
 */
export function toast(message, { action, onAction, actions, duration } = {}) {
  const list = (actions ?? (action ? [{ label: action, onAction }] : [])).filter(Boolean);
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  clearTimeout(toastTimer);
  toastHost.replaceChildren();

  const node = h('div', { class: 'toast' }, h('span', { class: 'toast-message' }, message));
  const dismiss = () => {
    clearTimeout(toastTimer);
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 250);
  };
  for (const item of list) {
    node.append(h('button', {
      type: 'button',
      class: 'toast-action',
      onclick: () => { dismiss(); item.onAction?.(); },
    }, item.label));
  }
  if (list.length > 1) node.classList.add('is-stacked'); // yazı üstte, butonlar altta sağda

  toastHost.append(node);
  void node.offsetWidth;
  node.classList.add('is-visible');
  toastTimer = setTimeout(dismiss, duration ?? (list.length ? 6000 : 3500));
  return { dismiss };
}
