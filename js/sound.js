// Tamarin sesleri: Web Audio ile sentezlenen tiz ıslıklar (3–6 kHz).
//   calm    → sakin tek cıvıltı
//   happy   → mutlu, hızlı trill
//   worried → endişeli, kesik kesik alarm
// iOS'ta AudioContext ancak bir dokunuşun içinde başlatılabilir; unlockAudio()
// ilk dokunuşta bunu yapar. iPhone sessiz moddaysa iOS bu sesleri çalmaz.
// Aç/kapa ve seviye store'daki `sound` alanından okunur; değişince ana ses anında güncellenir.
import { getState, onChange } from './store.js';

const LOUDEST = 0.32; // seviye 1.0 iken ana kazanç

let ctx = null;
let master = null;

const masterLevel = () => LOUDEST * getState().sound.volume;

onChange((state) => {
  if (master) master.gain.setTargetAtTime(LOUDEST * state.sound.volume, ctx.currentTime, 0.05);
});

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = masterLevel();
  // Çok tiz frekanslar kulağı tırmalamasın diye yumuşak bir tepe filtresi.
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 6500;
  shelf.gain.value = -6;
  master.connect(shelf).connect(ctx.destination);
  return ctx;
}

/** İlk dokunuşta sesi "uyandırır" (iOS şartı). Uygulama açılırken bir kez çağrılır. */
export function unlockAudio() {
  const unlock = () => {
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state !== 'running') audio.resume();
    // iOS: kısa sessiz bir tampon çalmak bağlamı kesin olarak açar.
    const buffer = audio.createBuffer(1, 1, 22050);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0);
    if (audio.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchend', unlock, true);
}

/**
 * Tek bir ıslık: frekans `freqs` noktaları arasında üstel kayar.
 * Hafif ikinci harmonik ve titreşim (vibrato) sesi elektronik bip'ten ayırır.
 * `this` = { ctx, master }: aynı sesler gerçek ya da çevrimdışı (test) bağlamda çalınabilsin.
 */
function whistle(t0, duration, freqs, { gain = 1, vibrato = 0, harsh = false } = {}) {
  const { ctx, master } = this;
  const osc = ctx.createOscillator();
  osc.type = harsh ? 'triangle' : 'sine';
  const step = duration / (freqs.length - 1);
  osc.frequency.setValueAtTime(freqs[0], t0);
  freqs.slice(1).forEach((f, i) => osc.frequency.exponentialRampToValueAtTime(f, t0 + step * (i + 1)));

  const overtone = ctx.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(freqs[0] * 2, t0);
  freqs.slice(1).forEach((f, i) => overtone.frequency.exponentialRampToValueAtTime(f * 2, t0 + step * (i + 1)));
  const overtoneGain = ctx.createGain();
  overtoneGain.gain.value = harsh ? 0.25 : 0.08;

  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 38;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + duration + 0.02);
  }

  const env = ctx.createGain();
  const peak = 0.9 * gain;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, duration * 0.25));
  env.gain.setValueAtTime(peak, t0 + duration * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env);
  overtone.connect(overtoneGain).connect(env);
  env.connect(master);
  osc.start(t0);
  overtone.start(t0);
  osc.stop(t0 + duration + 0.02);
  overtone.stop(t0 + duration + 0.02);
}

const jitter = (value, amount) => value * (1 + (Math.random() * 2 - 1) * amount);

const CALLS = {
  // Yükselip hafifçe düşen tek, uzun ıslık.
  calm(w, t) {
    w(t, 0.32, [jitter(3300, 0.04), jitter(5200, 0.03), jitter(4300, 0.03)], { vibrato: 40 });
  },
  // Kısa bir "giriş" ıslığı ve ardından hızlı, inen bir trill dizisi.
  happy(w, t) {
    w(t, 0.09, [jitter(4200, 0.03), jitter(5600, 0.03)], { gain: 0.8 });
    const notes = 9;
    for (let i = 0; i < notes; i++) {
      const start = t + 0.12 + i * 0.045;
      const top = 5900 - i * 140;
      w(start, 0.035, [jitter(top, 0.02), jitter(top - 900, 0.02)], { gain: 0.7 - i * 0.03 });
    }
  },
  // Kasa açıldı: iki hızlı, yükselen mutlu cıvıltı.
  unlock(w, t) {
    w(t, 0.07, [jitter(3800, 0.02), jitter(5000, 0.02)], { gain: 0.8 });
    w(t + 0.09, 0.11, [jitter(4600, 0.02), jitter(5900, 0.02)], { gain: 0.85, vibrato: 30 });
  },
  // Ödendi işareti: tek, kısa, yükselen onay cıvıltısı.
  check(w, t) {
    w(t, 0.09, [jitter(4300, 0.02), jitter(5800, 0.02)], { gain: 0.75 });
  },
  // Yanlış şifre: iki kısa, sert "tsik".
  denied(w, t) {
    w(t, 0.045, [jitter(5600, 0.02), jitter(3400, 0.02)], { harsh: true });
    w(t + 0.11, 0.045, [jitter(5400, 0.02), jitter(3200, 0.02)], { harsh: true, gain: 0.8 });
  },
  // Sert, kesik kesik ve aşağı inen "tsik" sesleri.
  worried(w, t) {
    for (let i = 0; i < 5; i++) {
      const start = t + i * 0.13;
      w(start, 0.045, [jitter(6000, 0.02), jitter(3600, 0.03)], { harsh: true, gain: i === 4 ? 0.7 : 1 });
    }
  },
};

/** Bir sesi verilen bağlama ve çıkışa planlar (testte OfflineAudioContext ile de kullanılır). */
export function scheduleCall(audioCtx, destination, mood, when) {
  (CALLS[mood] ?? CALLS.calm)(whistle.bind({ ctx: audioCtx, master: destination }), when);
}

/** Duruma göre tamarin sesi çalar. Ses kapalıysa ya da tarayıcı desteklemiyorsa hiçbir şey yapmaz. */
export function playCall(mood = 'calm') {
  const { on, volume } = getState().sound;
  if (!on || volume <= 0) return;
  const audio = ensureContext();
  if (!audio) return;
  if (audio.state !== 'running') audio.resume();
  scheduleCall(audio, master, mood, audio.currentTime + 0.02);
}
