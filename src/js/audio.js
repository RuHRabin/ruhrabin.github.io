// FILE: js/audio.js
// Opt-in ambient sound. Nothing here runs until toggle() is called from a click or tap
// (browsers only let Web Audio start after a gesture), so there is never any autoplay.
//
//   drone  : six detuned sine and triangle voices on A (55 Hz) → low-pass filter (slowly breathing) → dry + convolution reverb
//   tick   : a quiet two-tone clock tick, scheduled on the audio clock. Its rate rises with γ, the deeper the camera sits:
//            it is Earth's clock heard from down here, and Earth time runs γ times faster than yours.
//   fades  : 1 s linear fade in and out; a short fade and suspend when the tab is hidden
//
// The helpers tickRate() and makeImpulse() are pure, so tests.html can check them without a sound card.

export const FADE_SECONDS = 1;
export const LEVEL = 0.32;                 // master gain once faded in: deliberately quiet
export const TICK_BASE_HZ = 0.8;           // ticks per second when γ = 1
export const TICK_MAX_HZ = 6;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// γ → ticks per second. γ is about 1.015 in the far field and 1.63 at the camera floor (r = 1.6 rs): ≈ 0.84 → 3.5 per second.
export function tickRate(gamma) {
    const g = Number.isFinite(gamma) ? Math.max(1, gamma) : 1;
    return Math.min(TICK_MAX_HZ, TICK_BASE_HZ * g * g * g);
}

function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Two channels of decaying, slightly darkened noise: a simple hall for the ConvolverNode. Seeded, so identical every run.
export function makeImpulse(sampleRate, seconds = 3.2, decay = 3.4, seed = 7) {
    const n = Math.max(1, Math.floor(sampleRate * seconds));
    const out = [new Float32Array(n), new Float32Array(n)];
    for (let ch = 0; ch < 2; ch++) {
        const rnd = mulberry32(seed + ch * 101);
        let y = 0;
        for (let i = 0; i < n; i++) {
            const env = Math.pow(1 - i / n, decay);
            y += 0.4 * ((rnd() * 2 - 1) - y);              // one-pole low-pass: a soft, dark tail
            out[ch][i] = y * env;
        }
    }
    return out;
}

function makeNoise(sampleRate, seconds, seed) {
    const n = Math.max(1, Math.floor(sampleRate * seconds));
    const a = new Float32Array(n), rnd = mulberry32(seed);
    for (let i = 0; i < n; i++) a[i] = rnd() * 2 - 1;
    return a;
}

// The drone: [type, Hz, detune in cents, gain]. A1 with its octave, fifth and a little upper air.
const VOICES = [
    ['sine', 55, 0, 0.30],
    ['triangle', 55, 6, 0.16],
    ['sine', 110, -4, 0.18],
    ['triangle', 82.41, 3, 0.14],
    ['sine', 164.81, -7, 0.06],
    ['sine', 220, 5, 0.04],
];

export function createAudio(opts = {}) {
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    const api = { supported: !!AC, enabled: false };
    const stats = { ticks: 0 };

    let ctx = null, G = null;
    let timer = 0, offTimer = 0, hideTimer = 0, nextTick = 0, token = 0, held = false, flip = false;
    let gammaT = 1, gammaS = 1;

    const emit = () => { if (opts.onChange) { try { opts.onChange(api.enabled); } catch (e) { /* ignore */ } } };

    function build() {
        ctx = new AC({ latencyHint: 'interactive' });
        const master = ctx.createGain(); master.gain.value = 0;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
        master.connect(comp); comp.connect(ctx.destination);

        // drone → bus → low-pass → dry and reverb
        const bus = ctx.createGain(); bus.gain.value = 0.9;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 560; filter.Q.value = 0.6;
        const dry = ctx.createGain(); dry.gain.value = 0.62;
        const wet = ctx.createGain(); wet.gain.value = 0.55;
        const conv = ctx.createConvolver();
        const ir = makeImpulse(ctx.sampleRate);
        const buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
        buf.copyToChannel(ir[0], 0); buf.copyToChannel(ir[1], 1);
        conv.buffer = buf;
        bus.connect(filter); filter.connect(dry); filter.connect(conv); conv.connect(wet);
        dry.connect(master); wet.connect(master);

        const oscs = VOICES.map(([type, hz, cents, gain]) => {
            const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = cents;
            const vg = ctx.createGain(); vg.gain.value = gain;
            o.connect(vg); vg.connect(bus);
            o.start();
            return o;
        });

        // slow breathing on the filter, so the chord is never perfectly still
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 80;
        lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();

        // the clock: a quiet tick bus, mostly dry with a little room
        const tick = ctx.createGain(); tick.gain.value = 0.11;
        const tickSend = ctx.createGain(); tickSend.gain.value = 0.3;
        tick.connect(master); tick.connect(tickSend); tickSend.connect(conv);

        const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
        noise.copyToChannel(makeNoise(ctx.sampleRate, 0.03, 99), 0);

        G = { master, filter, tick, noise, oscs, lfo };
    }

    function fadeTo(level, secs) {
        const p = G.master.gain, t = ctx.currentTime, v = p.value;
        p.cancelScheduledValues(t);
        p.setValueAtTime(v, t);
        p.linearRampToValueAtTime(level, t + secs);
    }

    function scheduleTick(t) {
        const hi = flip;
        const src = ctx.createBufferSource(); src.buffer = G.noise;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hi ? 2300 : 3100; bp.Q.value = 3;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.9, t + 0.0007);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
        src.connect(bp); bp.connect(env); env.connect(G.tick);
        src.start(t); src.stop(t + 0.04);

        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hi ? 880 : 1180;
        const oe = ctx.createGain();
        oe.gain.setValueAtTime(0, t);
        oe.gain.linearRampToValueAtTime(0.35, t + 0.001);
        oe.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
        o.connect(oe); oe.connect(G.tick);
        o.start(t); o.stop(t + 0.06);

        flip = !flip;
        stats.ticks++;
    }

    // Look-ahead scheduler: every 30 ms, queue the ticks that fall in the next 140 ms on the audio clock.
    function pump() {
        if (!ctx) return;
        gammaS += (gammaT - gammaS) * 0.12;                              // glide, so the rate never jumps
        const depth = clamp((gammaS - 1) / 0.63, 0, 1);
        G.filter.frequency.setTargetAtTime(560 - 200 * depth, ctx.currentTime, 0.4);   // deeper = a little darker
        const rate = tickRate(gammaS), horizon = ctx.currentTime + 0.14;
        if (nextTick < ctx.currentTime - 0.5) nextTick = ctx.currentTime + 0.05;       // catch up after a stall instead of bursting
        for (let guard = 0; nextTick < horizon && guard < 8; guard++) { scheduleTick(nextTick); nextTick += 1 / rate; }
    }
    function startTicks() {
        stopTicks();
        nextTick = ctx.currentTime + 0.15;
        timer = setInterval(pump, 30);
    }
    function stopTicks() { if (timer) { clearInterval(timer); timer = 0; } }

    function resumeAndFade(my) {
        ctx.resume().then(() => {
            if (my !== token || !api.enabled) return;
            fadeTo(LEVEL, FADE_SECONDS);
            startTicks();
        }).catch(() => { /* the browser refused; the button stays honest below */ if (my === token) { api.enabled = false; emit(); } });
    }

    function enable() {
        if (!api.supported) return false;
        clearTimeout(offTimer); clearTimeout(hideTimer);
        api.enabled = true; held = false;
        const my = ++token;
        try { if (!ctx) build(); } catch (e) {
            api.supported = false; api.enabled = false; emit();
            return false;
        }
        resumeAndFade(my);
        emit();
        return true;
    }

    function disable() {
        api.enabled = false;
        const my = ++token;
        emit();
        if (!ctx) return;
        fadeTo(0, FADE_SECONDS);                       // the ticks keep scheduling during the fade, then everything stops
        clearTimeout(offTimer);
        offTimer = setTimeout(() => {
            if (my !== token) return;
            stopTicks();
            ctx.suspend().catch(() => {});
        }, FADE_SECONDS * 1000 + 80);
    }

    // Short game cues (checkpoint, scan, mission complete). Silent unless sound is on and the context is running.
    const CUES = { gate: [[660, 0], [990, 0.07]], scan: [[880, 0], [1320, 0.06], [1760, 0.12]], win: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]] };
    api.cue = (kind) => {
        const notes = CUES[kind];
        if (!notes || !api.enabled || !ctx || !G || ctx.state !== 'running') return;
        const t0 = ctx.currentTime + 0.01;
        for (const [f, d] of notes) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'triangle'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t0 + d);
            g.gain.exponentialRampToValueAtTime(0.16, t0 + d + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.24);
            o.connect(g); g.connect(G.master);
            o.start(t0 + d); o.stop(t0 + d + 0.28);
        }
    };

    api.toggle = () => (api.enabled ? (disable(), false) : enable());
    api.setGamma = (g) => { if (Number.isFinite(g)) gammaT = Math.max(1, g); };
    api.stats = () => ({
        state: ctx ? ctx.state : 'none', level: G ? G.master.gain.value : 0, rate: tickRate(gammaS), gamma: gammaS,
        ticks: stats.ticks, enabled: api.enabled, voices: G ? G.oscs.length : 0,
    });

    // Stop when the tab is hidden; come back (with the usual 1 s fade) only if sound is still on.
    const onVis = () => {
        if (!ctx) return;
        if (document.hidden) {
            if (!api.enabled) return;
            held = true; ++token;
            clearTimeout(hideTimer);
            fadeTo(0, 0.12);
            hideTimer = setTimeout(() => { if (document.hidden && held) { stopTicks(); ctx.suspend().catch(() => {}); } }, 180);
        } else if (held) {
            held = false;
            clearTimeout(hideTimer);
            if (api.enabled) resumeAndFade(++token);
        }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

    api.dispose = () => {
        api.enabled = false; ++token;
        clearTimeout(offTimer); clearTimeout(hideTimer); stopTicks();
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
        if (ctx) { try { ctx.close(); } catch (e) { /* ignore */ } ctx = null; G = null; }
    };

    return api;
}
