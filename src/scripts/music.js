// generative music engine (WebAudio, no audio files). a slow, cinematic chord progression in three moods that follows your scroll:
//   orbit (A minor, hopeful) → moon (D lydian, bright) → horizon (D minor, tense, with a pulse).
// layers: detuned saw pads, sine/triangle bass, FM bell arpeggio through a ping-pong delay, high shimmer and filtered risers.
// createMusic() takes the audio context, output node, reverb node and a read() callback, so it can also render offline.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = (a, b) => a + Math.random() * (b - a);
const MID = (n) => 440 * Math.pow(2, (n - 69) / 12);
// each entry: [bass, pad voices, arpeggio notes] as MIDI numbers
const SCENES = [
  [[33, [57, 64, 67, 71, 72], [69, 72, 76, 79, 83, 84]], [29, [57, 60, 65, 69, 72], [65, 69, 72, 76, 77, 81]], [36, [55, 60, 64, 67, 71], [64, 67, 71, 72, 76, 79]], [31, [59, 62, 67, 69, 74], [67, 71, 74, 76, 79, 81]]],
  [[38, [57, 62, 66, 69, 73], [74, 78, 81, 85, 86]], [35, [59, 62, 66, 69, 73], [71, 74, 78, 81, 85]], [31, [59, 62, 66, 67, 71], [74, 78, 79, 83, 85]], [33, [61, 64, 66, 69, 71], [76, 78, 81, 83, 85]]],
  [[38, [57, 62, 64, 65, 69], [62, 65, 69, 72, 74, 77]], [34, [53, 58, 62, 65, 69], [69, 74, 76, 77, 81, 82]], [31, [62, 65, 67, 69, 70], [74, 77, 79, 81, 82]], [33, [64, 67, 69, 74, 76], [69, 74, 76, 79, 81]]],
];
const BPM = 66, BEAT = 60 / BPM, EIGHTH = BEAT / 2, CHORD = BEAT * 8;

export function createMusic(ac, dest, verb, read) {
  const bus = ac.createGain(); bus.gain.value = 0;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.4;
  bus.connect(lp); lp.connect(dest);
  const send = ac.createGain(); send.gain.value = 0.5; lp.connect(send); send.connect(verb);
  // ping-pong delay, dotted eighth
  const din = ac.createGain(), dl = ac.createDelay(2), dr = ac.createDelay(2), f1 = ac.createGain(), f2 = ac.createGain(), tone = ac.createBiquadFilter(), pl = ac.createStereoPanner(), pr = ac.createStereoPanner(), dout = ac.createGain();
  dl.delayTime.value = EIGHTH * 1.5; dr.delayTime.value = EIGHTH * 1.5; f1.gain.value = 0.38; f2.gain.value = 0.38; tone.type = 'lowpass'; tone.frequency.value = 2600; pl.pan.value = -0.7; pr.pan.value = 0.7; dout.gain.value = 0.55;
  din.connect(dl); dl.connect(tone); tone.connect(f1); f1.connect(dr); dr.connect(f2); f2.connect(dl); dl.connect(pl); dr.connect(pr); pl.connect(dout); pr.connect(dout); dout.connect(dest); dout.connect(send);
  // noise buffer reused by the risers
  const nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nbuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  let timer = 0, vol = 0.8, nextChord = 0, nextEighth = 0, chordIdx = 0, arpIdx = 2, chords = [], running = false, sample = null, sampleSrc = null;

  function env(g, t, a, peak, hold, r) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r); return t + a + hold + r; }
  // linear release so chords crossfade without a dip in volume
  function envL(g, t, a, peak, hold, r) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.linearRampToValueAtTime(0.0001, t + a + hold + r); return t + a + hold + r; }
  function pad(t, midi, inten) {
    const f = MID(midi), g = ac.createGain(), flt = ac.createBiquadFilter(), cut = 520 + inten * 2200; flt.type = 'lowpass'; flt.Q.value = 0.7;
    flt.frequency.setValueAtTime(cut * 0.7, t); flt.frequency.linearRampToValueAtTime(cut * 1.35, t + 4); flt.frequency.linearRampToValueAtTime(cut * 0.8, t + CHORD + 2.6);
    const end = envL(g, t, 2.4, 0.05, CHORD - 2.4, 2.6), sp = R(0.7, 1);
    [[-10, -sp, 0], [10, sp, R(0.009, 0.021)]].forEach(([d, pn, ph]) => { const o = ac.createOscillator(), pa = ac.createStereoPanner(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d + R(-3, 3); pa.pan.value = pn; o.connect(flt); flt.connect(pa); pa.connect(g); o.start(t + ph); o.stop(end + 0.1); }); // start offset so left and right don't line up
    const s = ac.createOscillator(), sg = ac.createGain(); s.type = 'sine'; s.frequency.value = f / 2; sg.gain.value = 0.6; s.connect(sg); sg.connect(g); s.start(t); s.stop(end + 0.1);
    g.connect(bus);
  }
  function bass(t, midi) {
    const f = MID(midi), g = ac.createGain(), flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 420;
    const end = envL(g, t, 0.7, 0.07, CHORD - 0.7, 1.5);
    [['sine', 1, 1], ['triangle', 1, 0.5], ['sine', 2, 0.35]].forEach(([ty, m, k]) => { const o = ac.createOscillator(), og = ac.createGain(); o.type = ty; o.frequency.value = f * m; og.gain.value = k; o.connect(og); og.connect(flt); o.start(t); o.stop(end + 0.1); });
    flt.connect(g); g.connect(bus);
  }
  function shimmer(t, midi) {
    const g = ac.createGain(), o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(); o.type = 'sine'; o.frequency.value = MID(midi + 24);
    lfo.frequency.value = R(4.5, 6.5); lg.gain.value = 0.007; lfo.connect(lg); lg.connect(g.gain);
    const end = env(g, t, 2.6, 0.02, 2.4, 3.2); o.connect(g); g.connect(bus); const sd = ac.createGain(); sd.gain.value = 0.9; g.connect(sd); sd.connect(send); o.start(t); lfo.start(t); o.stop(end + 0.1); lfo.stop(end + 0.1);
  }
  function bell(t, midi, inten) {
    const f = MID(midi), c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain(), p = ac.createStereoPanner();
    c.type = 'sine'; c.frequency.value = f; m.type = 'sine'; m.frequency.value = f * 2; mg.gain.setValueAtTime(f * (0.9 + inten * 1.4), t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.55);
    m.connect(mg); mg.connect(c.frequency); p.pan.value = R(-0.45, 0.45);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085 + inten * 0.05, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    c.connect(g); g.connect(p); p.connect(bus); const ds = ac.createGain(); ds.gain.value = 0.5; p.connect(ds); ds.connect(din);
    c.start(t); m.start(t); c.stop(t + 1.6); m.stop(t + 1.6);
  }
  function riser(t, len) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = nbuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(3600, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + len * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + len + 0.7);
  }
  function thump(t, a) {
    [[0, 1], [0.21, 0.55]].forEach(([d, k]) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(62, t + d); o.frequency.exponentialRampToValueAtTime(34, t + d + 0.2);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(0.09 * a * k, t + d + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.38); o.connect(g); g.connect(bus); o.start(t + d); o.stop(t + d + 0.45); });
  }
  const level = () => { const s = read(); return { p: s.p, inten: clamp(0.2 + s.p * 0.45 + s.vel * 0.12 + s.warp * 0.3, 0, 1) }; };
  function chordAt(t) { for (let i = chords.length - 1; i >= 0; i--) if (chords[i].t <= t + 0.001) return chords[i]; return null; }
  function tick(limit) {
    while (nextChord < limit + 0.25) {
      const { p, inten } = level(), sc = p < 0.3 ? 0 : p < 0.68 ? 1 : 2, c = SCENES[sc][chordIdx % 4], t = nextChord;
      chords.push({ t, sc, c, p }); if (chords.length > 6) chords.shift();
      bass(t, c[0]); c[1].forEach((n, i) => pad(t + i * 0.12, n, inten)); shimmer(t + 0.4, c[1][R(1, 4) | 0]);
      if (chordIdx % 2 === 1 && inten > 0.3) riser(t + CHORD - 4.2, 4.2);
      if (sc === 2) { const a = clamp((p - 0.66) / 0.34, 0.25, 1); for (let b = 0; b < 8; b++) thump(t + b * BEAT, a * (b % 4 === 0 ? 1 : 0.6)); }
      chordIdx++; nextChord += CHORD;
    }
    while (nextEighth < limit) {
      const ch = chordAt(nextEighth), { inten } = level();
      if (ch) { const k = Math.round((nextEighth - ch.t) / EIGHTH), accent = k % 4 === 0, prob = 0.16 + inten * 0.62 + (accent ? 0.2 : 0);
        if (Math.random() < prob) { const pool = ch.c[2]; arpIdx = clamp(arpIdx + [-2, -1, 1, 1, 2][(Math.random() * 5) | 0], 0, pool.length - 1); bell(nextEighth, pool[arpIdx], inten); } }
      nextEighth += EIGHTH;
    }
  }
  return {
    ac, tick, lp, bus,
    start(open) {
      if (running) return; running = true; const t = ac.currentTime; nextChord = t + 0.25; nextEighth = t + 0.25; chords = [];
      bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(vol, t + 2.5);
      lp.frequency.cancelScheduledValues(t); lp.frequency.setValueAtTime(open ? 14000 : 380, t);
      if (sample) { sampleSrc = ac.createBufferSource(); sampleSrc.buffer = sample; sampleSrc.loop = true; sampleSrc.connect(bus); sampleSrc.start(); return; }
      timer = setInterval(() => tick(ac.currentTime + 0.6), 150); tick(t + 0.6);
    },
    stop() {
      if (!running) return; running = false; clearInterval(timer); const t = ac.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 1.2);
      if (sampleSrc) { const s = sampleSrc; setTimeout(() => { try { s.stop(); } catch {} }, 1400); sampleSrc = null; }
    },
    open() { const t = ac.currentTime; lp.frequency.cancelScheduledValues(t); lp.frequency.setValueAtTime(Math.max(200, lp.frequency.value), t); lp.frequency.exponentialRampToValueAtTime(14000, t + 4.5); },
    volume(v) { vol = clamp(v, 0, 1); if (running) bus.gain.setTargetAtTime(vol, ac.currentTime, 0.2); },
    useSample(buf) { sample = buf; },
    get running() { return running; },
  };
}
