// Asistan sohbeti: yüzde tamarine kısa dokununca alttan açılan yüksek sheet. Üstte küçük tamarin (konuşurken
// hafif kafa hareketi, düşünürken yavaş nefes; transform/opacity), mesaj balonları (Baha sağda, Tamarin solda),
// altta yazı kutusu + (varsa) mikrofon + Gönder. Model araç çağırınca onay kartı; onaylanmadan hiçbir şey yazılmaz.
// Sohbet geçmişi yalnızca bellekte: sheet kapanınca 10 dk tutulur, sonra silinir. Modele en çok son 10 mesaj gider.
// Sesli mod (talk): yüzde tamarine tek dokunuş → ekran açılmadan dinler (webkitSpeechRecognition, tr-TR), soruyu
// aynı geçmişle gönderir, cevabı balonda gösterip sesli okur. Onay gerekirse sohbet sheet'i kartla açılır.
import { h, svg, openSheet, toast } from '../ui.js';
import { getState, restore } from '../store.js';
import { realForecast, describe } from '../weather.js';
import { contextJson } from './context.js';
import { planCall, createApproval, responseParts } from './tools.js';
import { loadConfig, callWorker, AssistantError, ERROR_TEXT } from './config.js';

const KEEP_MS = 10 * 60 * 1000;
const MAX_TURNS = 10;
const SUGGESTIONS = ['Bu ay ne kadar ödemem kaldı?', 'Yarın derslerim', 'Yaklaşan doğum günleri', 'Bugün ne yapmam lazım?'];

let history = [];  // Gemini Content listesi (model turları thoughtSignature ile aynen)
let log = [];      // ekrandaki girdiler: { who: 'me' | 'tam', text, kind?, el? }
let owed = null;   // modele ulaşamamış function response parçaları (bir sonraki isteğin başına eklenir)
let pending = null; // cevaplanmamış onay kartı: { calls, approval, entry }
let clearTimer = 0;
let ui = null;     // açık sheet'in parçaları
let busy = false;
let controller = null;
let voice = null;  // sesli mod açıkken cevap/hata/kart buraya da gider

/* ---------- Yardımcılar ---------- */

const icon = (d) => svg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
const ICON = {
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
};

function weatherSummary() {
  const data = realForecast().data;
  if (!data) return null;
  const today = data.daily?.[0];
  return {
    derece: Math.round(data.current.temp), durum: describe(data.current.code, data.current.isDay).text,
    ...(today ? { en_yuksek: Math.round(today.max), en_dusuk: Math.round(today.min), yagis: today.pop } : {}),
  };
}

/** Modele gidecek son mesajlar: en çok MAX_TURNS; kesim bir kullanıcı yazısıyla başlar. */
export function trimHistory(list, max = MAX_TURNS) {
  let out = list.slice(-max);
  while (out.length && !(out[0].role === 'user' && out[0].parts.some((p) => typeof p.text === 'string'))) out = out.slice(1);
  // İlk içerikteki araç yanıtlarının çağrısı kesilmiş olabilir: yalnızca yazı kalsın.
  if (out.length && out[0].parts.some((p) => p.functionResponse)) out = [{ ...out[0], parts: out[0].parts.filter((p) => !p.functionResponse) }, ...out.slice(1)];
  return out;
}

/* ---------- Ses ---------- */

function speak(text, force = false) {
  const synth = globalThis.speechSynthesis;
  if (!synth || (!force && !loadConfig().speak) || !text) return;
  synth.cancel(); // yeni mesajda önceki okuma durur
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'tr-TR';
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('tr'));
  if (voice) u.voice = voice;
  u.onstart = () => ui?.face.classList.add('is-talking');
  u.onend = () => ui?.face.classList.remove('is-talking');
  synth.speak(u);
}

function stopSpeaking() {
  globalThis.speechSynthesis?.cancel();
  ui?.face.classList.remove('is-talking');
}

/* ---------- Çizim ---------- */

function bubble(entry) {
  if (entry.el) return entry.el;
  const cls = `chat-msg is-${entry.who}${entry.kind ? ` is-${entry.kind}` : ''}`;
  entry.el = h('div', { class: cls }, h('p', { class: 'chat-text' }, entry.text), entry.action ?? null);
  return entry.el;
}

function scrollDown() {
  if (!ui) return;
  requestAnimationFrame(() => { ui.list.scrollTop = ui.list.scrollHeight; });
}

function render() {
  if (!ui) return;
  ui.list.replaceChildren(...log.map(bubble));
  ui.chips.hidden = log.length > 0 || busy;
  ui.thinking.hidden = !busy;
  ui.face.classList.toggle('is-thinking', busy);
  ui.send.disabled = busy;
  scrollDown();
}

function say(text, kind) {
  log.push({ who: 'tam', text, kind });
  render();
  if (voice) { voice.show(text, kind); if (kind !== 'error') speak(text, true); return; }
  if (kind !== 'error') {
    speak(text);
    if (ui && !loadConfig().speak) { // okuma kapalıysa kısa bir "konuşma" hareketi
      ui.face.classList.add('is-talking');
      setTimeout(() => ui?.face.classList.remove('is-talking'), 1600);
    }
  }
}

function showError(err) {
  const code = err instanceof AssistantError ? err.code : 'server';
  const base = ERROR_TEXT[code] ?? ERROR_TEXT.server;
  const entry = { who: 'tam', text: err?.detail ? `${base} (${err.detail})` : base, kind: 'error' };
  if (code === 'setup' || code === 'auth') {
    entry.action = h('button', {
      type: 'button', class: 'btn btn-secondary chat-act',
      onclick: async () => { const { openSettings } = await import('../settings.js'); openSettings({ focus: 'assistant' }); },
    }, 'Ayarlar > Asistan');
  }
  log.push(entry);
  render();
  voice?.show(entry.text, 'error', code === 'setup' || code === 'auth');
}

/* ---------- Onay kartı ---------- */

function approvalCard(calls, plans) {
  const approval = createApproval(plans);
  const valid = plans.filter((p) => p.ok).length;
  const items = h('ul', { class: 'chat-card-list' }, plans.map((p) => h('li', { class: p.ok ? '' : 'is-bad' },
    h('span', { class: 'chat-card-title' }, p.ok ? p.title : 'Yapılamaz'),
    h('span', { class: 'chat-card-line' }, p.ok ? p.line : p.error))));
  const note = h('p', { class: 'chat-card-note', role: 'status' });
  const yes = h('button', { type: 'button', class: `btn ${approval.danger ? 'btn-danger' : 'btn-primary'}` },
    valid > 1 ? 'Hepsini onayla' : 'Onayla');
  const no = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Vazgeç');
  const actions = h('div', { class: 'actions' }, no, yes);
  const card = h('div', { class: `chat-card${approval.danger ? ' is-danger' : ''}` }, items, note, actions);
  if (!valid) yes.disabled = true;

  const finish = (results, text) => {
    actions.remove();
    note.textContent = text;
    pending = null;
    runTurn(responseParts(calls, results));
  };

  yes.addEventListener('click', () => {
    if (busy) return;
    const res = approval.approve();
    if (res === 'armed') { // silme: ikinci dokunuş
      yes.textContent = 'Emin misin? Tekrar dokun';
      note.textContent = 'Silinen kayıt toast\'taki "Geri al" ile geri gelir.';
      return;
    }
    if (res.status !== 'done') return;
    const failed = res.results.filter((r) => !r.ok);
    const okCount = res.results.length - failed.length;
    if (okCount) toast(okCount > 1 ? `${okCount} değişiklik kaydedildi` : 'Kaydedildi', { action: 'Geri al', onAction: () => restore(res.before) });
    finish(res.results, failed.length ? `Yapılamadı: ${failed.map((r) => r.error).join('; ')}` : 'Onaylandı.');
  });
  no.addEventListener('click', () => {
    if (busy) return;
    finish(approval.cancel(), 'Vazgeçildi; değişiklik yapılmadı.');
  });
  return { card, approval };
}

/* ---------- Konuşma ---------- */

/**
 * Bir tur: parts (kullanıcı yazısı ve/veya araç yanıtları) tek bir "user" içeriği olarak eklenir, Worker'a
 * gider. Hata olursa geçmiş eski haline döner; içindeki araç yanıtları owed'de kalır ve sonraki istekle gider
 * (onaylanıp yazılmış bir değişiklik modelden saklanmasın).
 */
async function runTurn(parts) {
  busy = true;
  render();
  controller = new AbortController();
  const before = history.length;
  history.push({ role: 'user', parts });
  try {
    const data = await callWorker('/chat', {
      messages: trimHistory(history),
      context: contextJson(getState(), new Date(), weatherSummary()),
    }, { signal: controller.signal });
    const modelParts = data.content?.parts;
    if (Array.isArray(modelParts) && modelParts.length) history.push({ role: 'model', parts: modelParts });
    const calls = Array.isArray(data.toolCalls) ? data.toolCalls : [];
    if (data.text) say(data.text);
    if (calls.length) {
      const plans = calls.map((call) => planCall(call));
      const { card, approval } = approvalCard(calls, plans);
      const entry = { who: 'tam', text: '', kind: 'card', el: h('div', { class: 'chat-msg is-tam is-card' }, card) };
      log.push(entry);
      pending = { calls, approval, entry };
      voice?.card(); // onay gerekiyor: sohbet ekranı kartla açılır
    } else if (!data.text) {
      showError(new AssistantError('empty'));
    }
  } catch (err) {
    history.length = before;
    const responses = parts.filter((p) => p.functionResponse);
    owed = responses.length ? responses : null;
    showError(err);
  } finally {
    busy = false;
    controller = null;
    render();
  }
}

function send(text) {
  const value = text.trim();
  if (!value || busy) return;
  stopSpeaking();
  const parts = [...(owed ?? [])];
  owed = null;
  if (pending) { // cevaplanmamış kart: vazgeçildi say
    parts.push(...responseParts(pending.calls, pending.approval.cancel()));
    pending.entry.el.querySelector('.actions')?.remove();
    pending.entry.el.querySelector('.chat-card-note').textContent = 'Vazgeçildi; değişiklik yapılmadı.';
    pending = null;
  }
  parts.push({ text: value });
  log.push({ who: 'me', text: value });
  runTurn(parts);
}

/* ---------- Sesli mod ---------- */

const SpeechRec = () => globalThis.webkitSpeechRecognition ?? globalThis.SpeechRecognition;
let bubbleEl = null;
let hideTimer = 0;
let rec = null;

function voiceBubble() {
  if (bubbleEl?.isConnected) return bubbleEl;
  bubbleEl = h('button', { type: 'button', class: 'voice-bubble', 'aria-live': 'polite' });
  bubbleEl.addEventListener('click', () => { // balona dokununca: sohbetin tamamı
    if (rec) { rec.stop(); return; }
    endVoice();
    openChat();
  });
  document.body.append(bubbleEl);
  return bubbleEl;
}

function showBubble(text, state) {
  clearTimeout(hideTimer);
  const el = voiceBubble();
  el.dataset.state = state;
  const dots = state === 'listening' || state === 'thinking'
    ? [h('span', { class: 'voice-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))] : [];
  el.replaceChildren(...dots, h('span', { class: 'voice-text' }, text)); // replaceChildren null'u "null" yazar
  el.classList.add('is-on');
}

function hideBubble(after = 0) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => bubbleEl?.classList.remove('is-on'), after);
}

function endVoice() {
  voice = null;
  rec?.abort?.();
  rec = null;
  hideBubble();
}

/**
 * Tamarine tek dokunuş: hemen dinler, sorar, cevabı balonda gösterip sesli okur.
 * Tanıma yoksa ya da asistan ayarlanmamışsa sohbet ekranını açar.
 */
export function talk() {
  const SR = SpeechRec();
  const cfg = loadConfig();
  if (!SR || !cfg.url || !cfg.token || busy) { openChat(); return; }
  // iOS: konuşma sentezi yalnızca bir dokunuşla açılır; boş bir okumayla şimdi aç.
  try { globalThis.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* yoksa geç */ }
  stopSpeaking();
  clearTimeout(clearTimer);
  if (rec) { rec.stop(); return; } // ikinci dokunuş: dinlemeyi bitir

  voice = {
    show: (text, kind, settings) => {
      showBubble(text, kind === 'error' ? 'error' : 'answer');
      if (settings) { hideBubble(6000); return; }
      hideBubble(kind === 'error' ? 6000 : Math.min(16000, 5000 + text.length * 60));
    },
    card: () => { endVoice(); openChat(); },
  };
  let heard = '';
  rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    heard = [...e.results].map((r) => r[0].transcript).join(' ').trim();
    showBubble(heard || 'Dinliyorum…', 'listening');
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      voice = null;
      showBubble('Mikrofon izni yok; yazarak sorabilirsin.', 'error');
      hideBubble(2500);
      setTimeout(openChat, 900);
    }
  };
  rec.onend = () => {
    rec = null;
    if (!voice) return;
    if (!heard) { showBubble('Duyamadım; tekrar dokun.', 'error'); hideBubble(2500); voice = null; return; }
    showBubble('Düşünüyorum…', 'thinking');
    send(heard);
    clearTimer = setTimeout(() => { history = []; log = []; owed = null; pending = null; }, KEEP_MS);
  };
  showBubble('Dinliyorum…', 'listening');
  try { rec.start(); } catch { rec = null; voice = null; openChat(); }
}

/* ---------- Sheet ---------- */

function micButton(input) {
  const SR = globalThis.webkitSpeechRecognition ?? globalThis.SpeechRecognition;
  if (!SR) return null;
  const btn = h('button', { type: 'button', class: 'chat-icon-btn', 'aria-label': 'Sesle sor', 'aria-pressed': 'false' }, icon(ICON.mic));
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'tr-TR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { input.value = `${input.value ? `${input.value} ` : ''}${e.results[0][0].transcript}`; input.focus(); };
    rec.onend = () => { rec = null; btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('is-on'); };
    rec.onerror = rec.onend;
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.add('is-on');
    rec.start();
  });
  return btn;
}

/** Sohbeti açar (yüzde tamarine kısa dokunma). */
export function openChat() {
  if (voice) endVoice();
  clearTimeout(clearTimer);
  const face = h('div', { class: 'chat-face', 'aria-hidden': 'true' },
    h('img', { src: 'assets/tamarin-768.webp', alt: '', draggable: 'false', decoding: 'async' }));
  const list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' });
  const chips = h('div', { class: 'chat-chips' }, SUGGESTIONS.map((s) => h('button', {
    type: 'button', class: 'chip', onclick: () => send(s),
  }, s)));
  const cancel = h('button', { type: 'button', class: 'btn-text chat-cancel', onclick: () => controller?.abort() }, 'İptal');
  const thinking = h('div', { class: 'chat-thinking', hidden: true }, h('span', {}, 'Tamarin düşünüyor…'), cancel);
  const input = h('input', {
    class: 'input chat-input', type: 'text', placeholder: "Tamarin'e sor…", autocomplete: 'off',
    autocapitalize: 'sentences', enterkeyhint: 'send', maxlength: '600', 'aria-label': 'Mesaj',
  });
  const sendBtn = h('button', { type: 'submit', class: 'chat-icon-btn chat-send', 'aria-label': 'Gönder' }, icon(ICON.send));
  const form = h('form', { class: 'chat-form' }, input, micButton(input), sendBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = '';
    send(value);
  });

  const body = h('div', { class: 'chat' }, h('div', { class: 'chat-head' }, face,
    h('p', { class: 'chat-sub' }, 'Kayıtlarına bakıp cevaplarım; değişikliği sen onaylarsın.')),
  list, chips, thinking, form);
  ui = { face, list, chips, thinking, send: sendBtn, input };
  render();
  openSheet({
    title: 'Tamarin',
    body,
    onClose: () => {
      stopSpeaking();
      controller?.abort();
      ui = null;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => { history = []; log = []; owed = null; pending = null; }, KEEP_MS);
    },
  });
}

// Testler için.
export const _state = { get history() { return history; }, reset() { history = []; log = []; owed = null; pending = null; } };
