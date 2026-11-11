// Hava efekti katmanı: içeriğin arkasında tam ekran canvas.
// Güneş ışını, ay ve yıldız, bulut, pus, yağmur (sıçramalı), kar, şimşek ve rüzgar çizgileri.
// Efektler düşük opaklıkta; parçacık sayısı sınırlı; sayfa görünmezken ya da yüz ekranı
// açık değilken döngü durur; prefers-reduced-motion açıksa tek bir sabit kare çizilir.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const LIMIT = { drops: 140, flakes: 95, stars: 50, clouds: 7, splashes: 30, streaks: 10 };

const rand = (a, b) => a + Math.random() * (b - a);

function offscreen(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  draw(c.getContext('2d'), c.width, c.height);
  return c;
}

/**
 * createWeatherFx(canvas, { onFlash }) → { setScene, setAnchors, start, stop, renderOnce }
 * onFlash: şimşek çaktığında çağrılır (isteğe bağlı).
 */
export function createWeatherFx(canvas, { onFlash } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let scene = null;
  let moon = { x: 0, y: 0 };
  let active = false; // yüz ekranı açık mı
  let raf = 0;
  let last = 0;
  let time = 0;

  let sprites = {};
  let drops = [];
  let flakes = [];
  let splashes = [];
  let clouds = [];
  let stars = [];
  let streaks = [];
  let fogs = [];
  let flash = 0;
  let nextFlash = 0;
  let flicker = 0;

  /* ---------- Hazırlık ---------- */

  function buildSprites() {
    // Güneş ışınları: sol üst köşeden yelpaze gibi açılan yumuşak kamalar (yarı çözünürlükte, daha yumuşak).
    const rw = W / 2;
    const rh = H / 2;
    sprites.rays = offscreen(rw, rh, (g, w, h) => {
      const len = Math.hypot(w, h) * 0.95;
      const angles = [0.32, 0.5, 0.66, 0.82, 1.0, 1.18];
      angles.forEach((a, i) => {
        const spread = 0.045 + (i % 2) * 0.03;
        const grad = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        grad.addColorStop(0, 'rgba(255, 214, 160, 0.55)');
        grad.addColorStop(0.55, 'rgba(255, 214, 160, 0.12)');
        grad.addColorStop(1, 'rgba(255, 214, 160, 0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a - spread) * len, Math.sin(a - spread) * len);
        g.lineTo(Math.cos(a + spread) * len, Math.sin(a + spread) * len);
        g.closePath();
        g.fill();
      });
    });
    // Bulut: üst üste binmiş yumuşak daireler.
    sprites.cloud = offscreen(260, 110, (g) => {
      [[70, 66, 46], [118, 50, 54], [168, 62, 44], [208, 72, 32], [44, 78, 30], [140, 80, 40]].forEach(([x, y, r]) => {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(222, 212, 198, 0.9)');
        grad.addColorStop(1, 'rgba(222, 212, 198, 0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      });
    });
    // Ay: parıltı ayrı çizilir (hilali oyarken parıltı delinmesin), üstüne hilal.
    sprites.moonGlow = offscreen(120, 120, (g) => {
      const glow = g.createRadialGradient(60, 60, 6, 60, 60, 60);
      glow.addColorStop(0, 'rgba(240, 228, 200, 0.3)');
      glow.addColorStop(1, 'rgba(240, 228, 200, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 120, 120);
    });
    sprites.moon = offscreen(40, 40, (g) => {
      g.fillStyle = 'rgba(242, 233, 212, 0.95)';
      g.beginPath();
      g.arc(20, 20, 13, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(27, 15, 11.5, 0, Math.PI * 2);
      g.fill();
    });
    // Pus: geniş, yumuşak yatay bant.
    sprites.fog = offscreen(420, 140, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(214, 204, 190, 0.8)');
      grad.addColorStop(1, 'rgba(214, 204, 190, 0)');
      g.setTransform(1, 0, 0, h / w, 0, 0); // daireyi yatay elipse bas
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    });
    sprites.sunGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, H) * 0.75);
    sprites.sunGlow.addColorStop(0, 'rgba(255, 200, 130, 0.16)');
    sprites.sunGlow.addColorStop(1, 'rgba(255, 200, 130, 0)');
  }

  function populate() {
    if (!scene || !W) return;
    const s = scene;
    stars = s.night
      ? Array.from({ length: LIMIT.stars }, () => ({ x: rand(0, W), y: rand(0, H * 0.62), r: rand(0.5, 1.3), base: rand(0.25, 0.7), speed: rand(0.6, 1.8), phase: rand(0, 6.3) }))
      : [];
    const cloudCount = Math.min(LIMIT.clouds, Math.round(s.clouds * LIMIT.clouds));
    clouds = Array.from({ length: cloudCount }, (_, i) => ({
      x: rand(-260, W), y: rand(H * 0.04, H * 0.5), scale: rand(0.7, 1.5),
      alpha: rand(0.06, 0.13) * (s.night ? 0.6 : 1), speed: rand(5, 11), drift: i,
    }));
    drops = Array.from({ length: s.rain > 0 ? Math.min(LIMIT.drops, Math.round(30 + s.rain * 110)) : 0 }, () => newDrop(true));
    flakes = Array.from({ length: s.snow > 0 ? Math.min(LIMIT.flakes, Math.round(25 + s.snow * 70)) : 0 }, () => newFlake(true));
    streaks = [];
    splashes = [];
    fogs = s.fog ? Array.from({ length: 4 }, (_, i) => ({ x: rand(-200, W - 100), phase: i / 4, speed: rand(6, 14) })) : [];
    nextFlash = time + rand(2, 5);
  }

  const rainVx = () => 50 + (scene?.wind ?? 0) * 7; // rüzgar arttıkça daha çapraz

  function newDrop(anywhere = false) {
    const vy = rand(720, 980);
    const vx = rainVx();
    const lead = (vx / vy) * H; // rüzgarla kayacağı yolu baştan hesaba kat
    return { x: rand(-lead, W), y: anywhere ? rand(-H, H) : rand(-H * 0.25, -10), vy, len: rand(10, 18) * (0.7 + scene.rain * 0.5) };
  }

  function newFlake(anywhere = false) {
    return { x: rand(-40, W + 40), y: anywhere ? rand(-H, H) : rand(-60, -6), r: rand(1, 2.6), vy: rand(24, 58), amp: rand(8, 22), freq: rand(0.4, 1.1), phase: rand(0, 6.3) };
  }

  /* ---------- Güncelleme ---------- */

  function update(dt) {
    time += dt;
    const s = scene;
    const ground = H - 6;
    const vx = rainVx();

    for (const d of drops) {
      d.y += d.vy * dt;
      d.x += vx * dt;
      if (d.y > ground) {
        if (splashes.length < LIMIT.splashes && Math.random() < 0.35) splashes.push({ x: d.x, y: ground, age: 0 });
        Object.assign(d, newDrop());
      }
    }
    splashes = splashes.filter((p) => (p.age += dt) < 0.28);

    for (const f of flakes) {
      f.y += f.vy * dt;
      f.x += (Math.sin(time * f.freq + f.phase) * f.amp * 0.9 + s.wind * 1.2) * dt;
      if (f.y > H + 8 || f.x > W + 60) Object.assign(f, newFlake());
    }

    for (const c of clouds) {
      c.x += (c.speed + s.wind * 0.5) * c.scale * dt;
      if (c.x > W + 40) { c.x = -260 * c.scale; c.y = rand(H * 0.04, H * 0.5); }
    }

    for (const fog of fogs) fog.x += fog.speed * dt * (fog.phase > 0.5 ? -1 : 1);

    if (s.windy) {
      const max = Math.min(LIMIT.streaks, 4 + Math.round((s.wind - 25) / 5));
      if (streaks.length < max && Math.random() < dt * 3) {
        streaks.push({ x: rand(-200, W * 0.6), y: rand(H * 0.08, H * 0.9), len: rand(80, 170), speed: rand(380, 680), life: rand(0.7, 1.3), age: 0, bend: rand(-14, 14) });
      }
      for (const k of streaks) { k.age += dt; k.x += k.speed * dt; }
      streaks = streaks.filter((k) => k.age < k.life);
    } else {
      streaks = [];
    }

    if (s.lightning) {
      if (time > nextFlash) {
        flash = 0.5;
        flicker = time + 0.18;
        nextFlash = time + rand(4, 10);
        onFlash?.();
      }
      if (flicker && time > flicker) { flash = Math.max(flash, 0.32); flicker = 0; }
      flash *= Math.exp(-dt * 9);
    } else {
      flash = 0;
    }
  }

  /* ---------- Çizim ---------- */

  function draw() {
    const s = scene;
    ctx.clearRect(0, 0, W, H);
    if (!s) return;

    if (s.sunny) {
      const dim = 1 - s.clouds * 0.6;
      ctx.fillStyle = sprites.sunGlow;
      ctx.globalAlpha = dim;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(-W * 0.04, -H * 0.02);
      ctx.rotate(Math.sin(time * 0.06) * 0.05);
      ctx.globalAlpha = (0.55 + Math.sin(time * 0.35) * 0.12) * dim;
      ctx.drawImage(sprites.rays, 0, 0, W, H);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (s.night) {
      const clear = 1 - s.clouds * 0.8;
      ctx.fillStyle = 'rgb(242, 234, 216)';
      for (const st of stars) {
        ctx.globalAlpha = st.base * clear * (0.6 + 0.4 * Math.sin(time * st.speed + st.phase));
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
      ctx.globalAlpha = 0.85 * (1 - s.clouds * 0.5);
      ctx.drawImage(sprites.moonGlow, moon.x - 60, moon.y - 60);
      ctx.drawImage(sprites.moon, moon.x - 20, moon.y - 20);
      ctx.globalAlpha = 1;
    }

    for (const c of clouds) {
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(sprites.cloud, c.x, c.y, 260 * c.scale, 110 * c.scale);
    }

    for (const fog of fogs) {
      const rise = (time / 40 + fog.phase) % 1; // alttan yukarı yavaşça
      ctx.globalAlpha = 0.09 * Math.sin(rise * Math.PI);
      ctx.drawImage(sprites.fog, fog.x, H * (0.95 - rise * 0.4) - 70, W * 0.9, 150);
    }
    ctx.globalAlpha = 1;

    if (drops.length) {
      const vx = rainVx();
      ctx.strokeStyle = `rgba(214, 222, 228, ${0.2 + s.rain * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of drops) {
        const k = d.len / d.vy;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - vx * k, d.y - d.len);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(214, 222, 228, 0.35)';
      ctx.beginPath();
      for (const p of splashes) {
        const r = 1.5 + p.age * 18;
        ctx.moveTo(p.x - r, p.y);
        ctx.quadraticCurveTo(p.x, p.y - r * 0.9, p.x + r, p.y);
      }
      ctx.stroke();
    }

    if (flakes.length) {
      ctx.fillStyle = 'rgba(246, 241, 233, 0.75)';
      ctx.beginPath();
      for (const f of flakes) {
        ctx.moveTo(f.x + f.r, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    if (streaks.length) {
      ctx.lineWidth = 1.2;
      for (const k of streaks) {
        ctx.strokeStyle = `rgba(232, 222, 206, ${0.14 * Math.sin((k.age / k.life) * Math.PI)})`;
        ctx.beginPath();
        ctx.moveTo(k.x, k.y);
        ctx.quadraticCurveTo(k.x + k.len / 2, k.y + k.bend, k.x + k.len, k.y);
        ctx.stroke();
      }
    }

    if (flash > 0.01) {
      ctx.fillStyle = `rgba(255, 248, 235, ${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- Döngü ---------- */

  function frame(now) {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function resume() {
    if (raf || !active || document.hidden || !scene) return;
    if (reducedMotion.matches) { renderOnce(); return; }
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildSprites();
    populate();
    if (active) renderOnce();
  }

  /** Tek kare çizer (hareket azaltma açıkken ya da hemen göstermek için). */
  function renderOnce() {
    if (!scene) return;
    update(0);
    draw();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  reducedMotion.addEventListener?.('change', () => { pause(); resume(); });
  resize();

  return {
    setScene(next) {
      scene = next;
      populate();
      if (active) { renderOnce(); resume(); }
    },
    /** Ayın konumu (yüz ekranının boş üst sağ köşesi). */
    setAnchors({ moonX, moonY }) {
      moon = { x: moonX, y: moonY };
      if (active && reducedMotion.matches) renderOnce();
    },
    start() {
      active = true;
      canvas.classList.add('is-on');
      renderOnce();
      resume();
    },
    stop() {
      active = false;
      pause();
      canvas.classList.remove('is-on');
      ctx.clearRect(0, 0, W, H);
    },
    renderOnce,
  };
}
