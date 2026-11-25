// loader visuals. loaderEngine has no imports and uses no outside variables on purpose,
// so boot.js can run it inside a web worker on an OffscreenCanvas. that way it keeps animating smoothly
// even when the main thread is busy. if workers aren't available it just runs on the main thread.
//
// the idea: a spiral galaxy spins in the dark. while the page loads, stars leave it and fly along curved paths
// to form the wordmark from left to right (so the logo is the progress bar). at 100% the dotted letters turn solid,
// a light sweep crosses them, and everything jumps to hyperspace into the 3D scene.
export function loaderEngine(cv, mk, post) {
  const TAU = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const ctx = cv.getContext('2d', { alpha: false }), sc = mk(2, 2), g = sc.getContext('2d'), b1 = mk(2, 2), g1 = b1.getContext('2d'), b2 = mk(2, 2), g2 = b2.getContext('2d'), hc = mk(2, 2), hg = hc.getContext('2d');
  const MONO = '500 12px ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace';
  let W = 0, H = 0, D = 1, cx = 0, cy = 0, bwPx = 0, iwPx = 1, ihPx = 1, Rg = 1, diag = 1;
  let pts = null, img = null, iw = 1, ih = 0.2, bwf = 0.8, bwmax = 1300;
  let NF = 0, NS = 0, N = 0, X, Y, VX, VY, TX, TY, TH, SD, SZ, ST, AN, RR, RT, KK, DX, DY, R0, SP, EX, EY, EDX, EDY, ER, ESP, ESZ, ED;
  let uiA = 0, uiY = 0, uiX0 = 0, uiX1 = 0, target = 0, shown = 0, label = 'Initialising', prevLabel = '', labelA = 1, t = 0, lock = 0, formed = false, settled = 0, skip = false, phase = 0, pt = 0, chargeD = 0.6, warpD = 1, revealed = false, closed = false, started = false, lastT = 0, lastPost = 0, seed = 7, OX = 0, OY = 0;
  const NE = 1400, rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const PAL = [], MV = [];
  for (let k = 0; k < 32; k++) { const u = k / 31; PAL.push('rgb(' + Math.round(255 - 110 * u) + ',' + Math.round(212 - 12 * u) + ',' + Math.round(158 + 97 * u) + ')'); } // galaxy colors: warm in the middle, blue at the arms
  for (let k = 0; k < 16; k++) { const u = k / 15; MV.push('rgb(' + Math.round(222 + 33 * u) + ',' + Math.round(236 - 14 * u) + ',' + Math.round(255 - 79 * u) + ')'); } // colors while forming: cool white when slow, warm when fast
  const gs = mk(64, 64), gx = gs.getContext('2d'); { const q = gx.createRadialGradient(32, 32, 0, 32, 32, 32); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(0.22, 'rgba(255,238,215,.5)'); q.addColorStop(1, 'rgba(255,190,140,0)'); gx.fillStyle = q; gx.fillRect(0, 0, 64, 64); }

  const omega = (u) => 0.2 * Math.pow(u + 0.08, -0.75);
  function orb(i, a) { const e = RR[i] * Rg, lx = Math.cos(a) * e, ly = Math.sin(a) * e * 0.42 + (SD[i] - 0.5) * Rg * 0.05 * (1 - RR[i]), c = 0.9492, s = -0.3146; OX = cx + lx * c - ly * s; OY = cy + lx * s + ly * c; }
  function layout() {
    cx = W / 2; cy = H * 0.455; diag = Math.hypot(W, H); Rg = diag * 0.34; bwPx = Math.min(W * bwf, bwmax); iwPx = Math.max(1, iw * bwPx); ihPx = Math.max(1, ih * bwPx);
    hc.width = Math.max(2, Math.ceil(iwPx * D)); hc.height = Math.max(2, Math.ceil(ihPx * D));
    for (let i = 0; i < NF; i++) { TX[i] = cx + pts[2 * i] * bwPx; TY[i] = cy + pts[2 * i + 1] * bwPx; }
  }
  function build() {
    NF = pts ? pts.length / 2 : 0; NS = W < 700 ? 800 : 1700; N = NF + NS;
    const f = (n) => new Float32Array(n); X = f(N); Y = f(N); VX = f(N); VY = f(N); TX = f(N); TY = f(N); TH = f(N); SD = f(N); SZ = f(N); AN = f(N); RR = f(N); RT = f(N); KK = f(N); DX = f(N); DY = f(N); R0 = f(N); SP = f(N); ST = new Uint8Array(N);
    ED = f(NE); EX = f(NE); EY = f(NE); EDX = f(NE); EDY = f(NE); ER = f(NE); ESP = f(NE); ESZ = f(NE);
    for (let i = 0; i < N; i++) {
      const u = Math.pow(rnd(), 1.45) * 0.96 + 0.04, arm = rnd() < 0.5 ? 0 : Math.PI; RR[i] = u;
      AN[i] = arm + 3.3 * Math.log(1 + u * 5.2) + (rnd() + rnd() + rnd() - 1.5) * (0.55 + 0.9 * (1 - u)); // two spiral arms with some random scatter
      SD[i] = rnd(); SZ[i] = i < NF ? 1.35 + rnd() * 0.75 : 0.55 + rnd() * 1.15; KK[i] = 0.8 + rnd() * 0.45;
      if (i < NF) TH[i] = clamp(0.03 + 0.9 * ((pts[2 * i] + 0.5) * 0.78 + rnd() * 0.22), 0, 0.985); // stars leave left to right, with a bit of randomness
    }
    layout();
  }
  function release(i) { // give the star its orbit speed so it leaves the galaxy on a natural curve
    orb(i, AN[i]); const x0 = OX, y0 = OY; orb(i, AN[i] + omega(RR[i]) * 0.016); X[i] = x0; Y[i] = y0; VX[i] = (OX - x0) / 0.016; VY[i] = (OY - y0) / 0.016; ST[i] = 1; RT[i] = 0;
  }
  function step(dt) {
    shown += (target - shown) * (1 - Math.exp(-dt * (skip ? 7 : 2.3))); if (target - shown < 4e-4) shown = target;
    labelA = Math.min(1, labelA + dt * 4);
    if (phase === 0 || phase === 1) {
      settled = 0;
      for (let i = 0; i < N; i++) {
        const s = ST[i];
        if (s === 0) { AN[i] += omega(RR[i]) * dt; if (i < NF && shown >= TH[i]) release(i); }
        else if (s === 1) {
          RT[i] += dt; const ramp = sm(0, 0.65, RT[i]), k = (12 + 56 * ramp) * KK[i], c = 2 * Math.sqrt(k) * 0.56;
          const dx = TX[i] - X[i], dy = TY[i] - Y[i], d = Math.hypot(dx, dy) + 1e-3, sw = 360 * (1 - ramp) * Math.min(1, d / 240); // spring toward the target (a little underdamped so it overshoots) plus some swirl
          VX[i] += (k * dx - c * VX[i] - (dy / d) * sw) * dt; VY[i] += (k * dy - c * VY[i] + (dx / d) * sw) * dt; X[i] += VX[i] * dt; Y[i] += VY[i] * dt;
          if (d < 0.8 && Math.abs(VX[i]) + Math.abs(VY[i]) < 7) { ST[i] = 2; X[i] = TX[i]; Y[i] = TY[i]; }
        } else settled++;
      }
      formed = NF === 0 ? shown > 0.995 : shown > 0.995 && settled >= NF * 0.97;
    }
    lock += ((formed || phase > 0 ? 1 : 0) - lock) * (1 - Math.exp(-dt * 3.2));
  }
  function ui(ua) {
    uiA = 0;
    if (ua < 0.01 || !pts) return;
    const x0 = cx - bwPx / 2, x1 = cx + bwPx / 2, y = cy + ihPx / 2 + Math.max(26, H * 0.05), hx = x0 + shown * bwPx;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = ua * 0.09; g.fillStyle = '#cfe0ff'; g.fillRect(x0, y, bwPx, 1);
    const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#ff8a50'); gr.addColorStop(0.5, '#fff0d4'); gr.addColorStop(1, '#4cb8ff');
    g.globalAlpha = ua; g.fillStyle = gr; g.fillRect(x0, y - 0.5, Math.max(0, shown * bwPx), 2);
    g.globalAlpha = ua * 0.85 * sm(0.004, 0.05, shown); g.drawImage(gs, hx - 14, y - 13, 28, 28);
    uiA = ua; uiY = y; uiX0 = x0; uiX1 = x1;
  }
  function uiText(c) {
    if (uiA < 0.01 || !pts) return; const ua = uiA, y = uiY, x0 = uiX0, x1 = uiX1, fs = Math.max(11, Math.round(Math.min(W, 1400) / 105));
    c.setTransform(D, 0, 0, D, 0, 0); c.globalCompositeOperation = 'source-over'; c.font = MONO.replace('12px', fs + 'px'); if ('letterSpacing' in c) c.letterSpacing = '1.5px'; c.textBaseline = 'top'; c.fillStyle = '#c6d4ea'; c.textAlign = 'left';
    c.globalAlpha = ua * 0.7 * (1 - labelA); c.fillText(prevLabel.toUpperCase(), x0, y + 20 - 5 * labelA); c.globalAlpha = ua * 0.7 * labelA; c.fillText(label.toUpperCase(), x0, y + 20 + 5 * (1 - labelA));
    c.textAlign = 'right'; c.globalAlpha = ua * 0.9; c.fillStyle = '#eef4ff'; c.fillText(('00' + Math.round(shown * 100)).slice(-3) + '%', x1, y + 20);
  }
  function drawLoad() {
    const ch = phase === 1 ? sm(0, 1, pt / chargeD) : 0, boost = 1 + ch * 1.4;
    g.setTransform(D, 0, 0, D, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = 'rgba(3,5,10,.3)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    const gr = Rg * 0.42; g.globalAlpha = (0.2 - 0.12 * shown) * sm(0, 1.5, t) * (1 + ch * 0.6); g.drawImage(gs, cx - gr, cy - gr * 0.5, gr * 2, gr); // glow in the galaxy center
    const fadeIn = sm(0, 1.4, t), bx = (((t * 0.42) % 2.4) - 0.5) * bwPx + cx - bwPx / 2, k0 = 1 - 0.012 * ch;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      const s = ST[i]; let x, y, a, col, z = SZ[i];
      if (s === 0) { orb(i, AN[i]); x = OX; y = OY; const u = RR[i]; col = PAL[(u * 31) | 0]; a = (0.2 + 0.55 * SD[i]) * (0.76 + 0.24 * Math.sin(t * 2.4 + SD[i] * 41)) * fadeIn * (i >= NF ? 0.85 : 1) * (0.4 + 0.6 * sm(0, 0.4, u)); z *= 1.15 - 0.45 * u; }
      else {
        x = s === 2 ? cx + (TX[i] - cx) * k0 : X[i]; y = s === 2 ? cy + (TY[i] - cy) * k0 : Y[i]; const sp = s === 1 ? Math.hypot(VX[i], VY[i]) : 0;
        col = MV[Math.min(15, (sp / 28) | 0)]; a = (0.7 + 0.3 * Math.sin(t * 3.1 + SD[i] * 53)) * (1 - 0.82 * lock) * boost;
        if (s === 2) { const q = (TX[i] - bx) / (bwPx * 0.06); a += 1.1 * Math.exp(-q * q) * lock; } else if (sp > 70) { g.moveTo(x - VX[i] * 0.02, y - VY[i] * 0.02); g.lineTo(x, y); }
      }
      g.globalAlpha = a > 1 ? 1 : a; g.fillStyle = col; g.fillRect(x - z * 0.5, y - z * 0.5, z, z);
    }
    g.globalAlpha = 0.5; g.strokeStyle = 'rgb(255,226,186)'; g.lineWidth = 1; g.stroke(); // curved trails behind the flying stars
    if (img && lock > 0.01) { // sharp text fades in over the dots, with a light sweep
      hg.globalCompositeOperation = 'source-over'; hg.clearRect(0, 0, hc.width, hc.height); hg.drawImage(img, 0, 0, hc.width, hc.height); hg.globalCompositeOperation = 'source-atop';
      const p = ((t * 0.42) % 2.4) / 2.4 * 1.8 - 0.4, w0 = hc.width, q = hg.createLinearGradient(w0 * (p - 0.14), 0, w0 * (p + 0.14), 0); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(0.5, 'rgba(255,248,236,.8)'); q.addColorStop(1, 'rgba(255,255,255,0)');
      hg.fillStyle = q; hg.fillRect(0, 0, w0, hc.height); hg.globalCompositeOperation = 'source-over';
      g.globalAlpha = lock * 0.5 * (1 + ch * 0.5); g.drawImage(hc, cx - iwPx / 2, cy - ihPx / 2, iwPx, ihPx);
    }
    ui(1 - sm(0, 0.35, pt / chargeD) * (phase === 1 ? 1 : 0));
  }
  function drawWarp() {
    g.setTransform(D, 0, 0, D, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = 'rgba(3,5,10,.62)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    const v0 = diag * 0.5, fade = (0.5 + 0.3 * sm(0, 0.25, pt)) * (1 - sm(0.95, 1.7, pt));
    const lines = (n, get, wOf, col, lw) => { // batched streaks: each star flies outward and speeds up, and the streak gets longer with speed
      g.beginPath();
      for (let i = 0; i < n; i += 2) {
        if (wOf(i) !== lw) continue; const d = get(i), p = d.p; if (p <= 0) continue;
        const trv = v0 * (0.1 * p + 6.4 * Math.pow(p, 3.2) / 3.2), len = v0 * (0.1 + 6.4 * Math.pow(p, 2.2)) * 0.045 * d.s, d1 = d.r + trv * d.s;
        g.moveTo(cx + d.x * (d1 - len), cy + d.y * (d1 - len)); g.lineTo(cx + d.x * d1, cy + d.y * d1);
      }
      g.strokeStyle = col; g.lineWidth = lw * (0.55 + pt * 0.55); g.stroke();
    };
    const dd = { x: 0, y: 0, r: 0, s: 1, p: 0 }, gd = (i) => { dd.x = DX[i]; dd.y = DY[i]; dd.r = R0[i]; dd.s = SP[i]; dd.p = pt; return dd; }, ge = (i) => { dd.x = EDX[i]; dd.y = EDY[i]; dd.r = ER[i]; dd.s = ESP[i]; dd.p = pt - ED[i]; return dd; };
    g.globalAlpha = fade; lines(N, gd, (i) => (SZ[i] > 1.75 ? 1.4 : 0.8), 'rgb(232,243,255)', 1.4); lines(N, gd, (i) => (SZ[i] > 1.75 ? 1.4 : 0.8), 'rgb(255,226,190)', 0.8);
    g.globalAlpha = fade * 1.15; lines(NE, ge, (i) => (ESZ[i] > 1.3 ? 1.4 : 0.8), 'rgb(206,228,255)', 1.4); lines(NE, ge, (i) => (ESZ[i] > 1.3 ? 1.4 : 0.8), 'rgb(255,240,220)', 0.8);
    const f = sm(0.12, 0.46, pt) * (1 - sm(0.46, 1.0, pt)) * 0.3; if (f > 0.01) { const r = diag * 0.55, q = g.createRadialGradient(cx, cy, 0, cx, cy, r); q.addColorStop(0, 'rgba(255,250,240,1)'); q.addColorStop(0.35, 'rgba(190,220,255,.55)'); q.addColorStop(1, 'rgba(120,170,255,0)'); g.globalAlpha = f; g.fillStyle = q; g.fillRect(0, 0, W, H); }
    if (img && pt < 0.3) { g.globalAlpha = (1 - sm(0, 0.3, pt)) * 0.9; g.drawImage(hc, cx - iwPx / 2, cy - ihPx / 2, iwPx, ihPx); }
  }
  function compose() {
    const ch = phase === 1 ? sm(0, 1, pt / chargeD) : 0, z = phase === 2 ? 1.02 + 0.14 * sm(0, 1, pt) : 1 + 0.02 * ch, ox = (1 - z) * cv.width * 0.5, oy = (1 - z) * cv.height * 0.455;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, cv.width, cv.height);
    g1.globalCompositeOperation = 'copy'; g1.drawImage(sc, 0, 0, b1.width, b1.height); g2.globalCompositeOperation = 'copy'; g2.drawImage(b1, 0, 0, b2.width, b2.height);
    ctx.setTransform(z, 0, 0, z, ox, oy); ctx.drawImage(sc, 0, 0);
    const ba = 0.34 + 0.32 * ch + (phase === 2 ? 0.05 * sm(0, 0.4, pt) : 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ba; ctx.drawImage(b1, 0, 0, cv.width, cv.height); ctx.globalAlpha = ba * 1.15; ctx.drawImage(b2, 0, 0, cv.width, cv.height);
    if (phase < 2) uiText(ctx); else uiA = 0;
  }
  function startWarp() {
    phase = 2; pt = 0;
    for (let i = 0; i < N; i++) { const s = ST[i], x = s === 2 || s === 1 ? (s === 2 ? TX[i] : X[i]) : (orb(i, AN[i]), OX), y = s === 2 || s === 1 ? (s === 2 ? TY[i] : Y[i]) : OY; let dx = x - cx, dy = y - cy; const r = Math.hypot(dx, dy); if (r < 3) { const a = rnd() * TAU; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= r; dy /= r; } DX[i] = dx; DY[i] = dy; R0[i] = Math.min(r, diag * 0.9); SP[i] = 0.55 + rnd() * 0.9; }
    for (let i = 0; i < NE; i++) { const a = rnd() * TAU; EDX[i] = Math.cos(a); EDY[i] = Math.sin(a); ER[i] = Math.pow(rnd(), 2) * diag * 0.12; ED[i] = rnd() * 0.75; ESP[i] = 0.5 + rnd() * 0.95; ESZ[i] = 0.7 + rnd() * 1.3; }
  }
  function frame(now) {
    if (closed) return;
    const dt = clamp(((lastT ? now - lastT : 16) / 1000), 0.001, 0.05); lastT = now; t += dt;
    if (!N && W && (pts || t > 0.8)) build();
    if (N) {
      if (phase === 1) { pt += dt; if (pt >= chargeD) startWarp(); }
      else if (phase === 2) { pt += dt / warpD; if (!revealed && pt > 0.4) { revealed = true; post({ t: 'reveal' }); } if (pt > 2.1) { closed = true; post({ t: 'end' }); return; } }
      step(dt); if (phase === 2) drawWarp(); else drawLoad();
    } else { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#03050a'; g.fillRect(0, 0, sc.width, sc.height); }
    compose();
    if (now - lastPost > 50) { lastPost = now; post({ t: 'st', shown, formed }); }
    sched();
  }
  const sched = () => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(frame) : setTimeout(() => frame(performance.now()), 16));
  return {
    msg(m) {
      switch (m.t) {
        case 'size': W = m.w; H = m.h; D = Math.min(m.d || 1, 1.5); cv.width = sc.width = Math.round(W * D); cv.height = sc.height = Math.round(H * D);
          b1.width = Math.max(2, Math.ceil(cv.width / 4)); b1.height = Math.max(2, Math.ceil(cv.height / 4)); b2.width = Math.max(2, Math.ceil(cv.width / 12)); b2.height = Math.max(2, Math.ceil(cv.height / 12));
          ctx.imageSmoothingEnabled = g1.imageSmoothingEnabled = g2.imageSmoothingEnabled = true; if (N) layout(); if (!started) { started = true; sched(); } break;
        case 'pts': pts = m.pts; bwf = m.bwf; bwmax = m.bwmax; img = m.img; iw = m.iw; ih = m.ih; if (N) { build(); } break;
        case 'p': target = Math.max(target, m.v); break;
        case 'label': if (m.v !== label) { prevLabel = label; label = m.v; labelA = 0; } break;
        case 'skip': skip = true; break;
        case 'ignite': if (phase === 0) { skip = !!m.skip; chargeD = skip ? 0.12 : 0.6; warpD = skip ? 0.65 : 1; phase = 1; pt = 0; if (!N) { phase = 2; } } break;
        case 'close': closed = true; break;
      }
    },
  };
}

// turns the wordmark into star target positions (relative to its width) plus a sharp bitmap of the text.
// needs the real page font, so it runs on the main thread and the result goes to the worker once.
export async function sampleWordmark(W, H) {
  const portrait = W < H * 0.9, lines = portrait ? ['RUHR', 'ABIN'] : ['RUHRABIN'], bwf = portrait ? 0.84 : 0.8, bwmax = portrait ? 640 : 1300, bw = Math.min(W * bwf, bwmax);
  const fam = '"Geist Variable","Geist","Helvetica Neue",Arial,system-ui,sans-serif';
  try { if (document.fonts) await Promise.race([document.fonts.load('800 100px "Geist Variable"'), new Promise((r) => setTimeout(r, 1200))]); } catch (e) { /* no font? system sans is fine */ }
  const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true }); x.font = '800 100px ' + fam;
  const lw = (s) => { let w = 0; for (const ch of s) w += x.measureText(ch).width; return w; }, fs = 100 * bw * (portrait ? 0.8 : 0.84) / Math.max(...lines.map(lw));
  const lh = fs * 0.78, pad = Math.ceil(fs * 0.14); c.width = Math.ceil(bw + pad * 2); c.height = Math.ceil(lines.length * lh * 1.18 + pad * 2);
  x.font = '800 ' + fs + 'px ' + fam; x.fillStyle = '#eef4ff'; x.textBaseline = 'alphabetic';
  lines.forEach((s, li) => { const Lw = lw(s), gap = s.length > 1 ? (bw - Lw) / (s.length - 1) : 0; let px = pad; for (const ch of s) { x.fillText(ch, px, pad + li * lh * 1.18 + fs * 0.74); px += x.measureText(ch).width + gap; } });
  const d = x.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) ink++;
  const want = portrait ? 1700 : W < 1000 ? 2700 : 3900, step = Math.max(1, Math.sqrt(ink / want)), out = [];
  for (let yy = 0; yy < c.height; yy += step) for (let xx = 0; xx < c.width; xx += step) {
    const jx = xx + (Math.random() - 0.5) * step, jy = yy + (Math.random() - 0.5) * step, ix = Math.min(c.width - 1, Math.max(0, jx | 0)), iy = Math.min(c.height - 1, Math.max(0, jy | 0));
    if (d[(iy * c.width + ix) * 4 + 3] > 128) out.push((jx - c.width / 2) / bw, (jy - c.height / 2) / bw);
  }
  const bmp = typeof createImageBitmap === 'function' ? await createImageBitmap(c) : c;
  return { pts: new Float32Array(out), img: bmp, iw: c.width / bw, ih: c.height / bw, bwf, bwmax };
}
