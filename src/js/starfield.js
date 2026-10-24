// FILE: js/starfield.js
// The backdrop used when WebGL is unavailable (or its context is lost): a deterministic 2D-canvas sky with a
// small black hole. Stars circle it slowly, the disc tilts, and the whole thing swells a little as you scroll
// toward the bottom of the page. It draws one still frame when motion is calm (Pause or reduced motion), and
// nothing at all while the tab is hidden. No Math.random: the sky is the same every time.

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

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

const NOOP = { active: false, start() {}, stop() {}, poke() {} };

export function createStarfield(canvas, opts = {}) {
    const g = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!g) return NOOP;
    const isCalm = opts.isCalm || (() => false);
    const P = Object.assign({ bg: '#0a0e1a', text: '#d7e3ff', cyan: '#5ce1e6', amber: '#ffb454', rose: '#ff6b9d' }, opts.palette || {});

    let W = 0, H = 0, dpr = 1, stars = [], raf = 0, on = false, t = 0, last = 0, queued = false;

    function seed() {
        const r = mulberry32(20241);
        const n = Math.round(clamp((W * H) / 3800, 120, 520));
        const tints = [P.text, P.text, P.text, P.cyan, P.amber];
        stars = [];
        for (let i = 0; i < n; i++) {
            stars.push({
                a: r() * TAU, d: Math.sqrt(r()), sz: 0.5 + r() * 1.1, ph: r() * TAU, tw: 0.4 + r() * 1.4,
                c: tints[Math.floor(r() * tints.length)], al: 0.25 + r() * 0.55,
            });
        }
    }

    function size() {
        const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
        const d = Math.min(window.devicePixelRatio || 1, 1.5);
        if (w === W && h === H && d === dpr) return false;
        W = w; H = h; dpr = d;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        seed();
        return true;
    }

    function ring(cx, cy, R, back) {
        // the accretion disc: a stack of soft ellipses, tilted; `back` = far half (behind the hole), else near half
        g.save();
        g.translate(cx, cy); g.rotate(-0.28); g.scale(1, 0.26);
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 7; k++) {
            const rr = R * (1.5 + k * 0.42);
            g.beginPath();
            g.arc(0, 0, rr, back ? Math.PI : 0, back ? TAU : Math.PI);
            g.lineWidth = R * 0.2;
            g.strokeStyle = k < 3 ? P.amber : P.rose;
            g.globalAlpha = (back ? 0.2 : 0.3) * (1 - k / 8);
            g.stroke();
        }
        g.restore();
    }

    function draw() {
        queued = false;
        size();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const wide = W >= 720;
        const cx = wide ? W * 0.72 : W * 0.5, cy = wide ? H * 0.46 : H * 0.3;
        const doc = document.documentElement;
        const span = Math.max(1, doc.scrollHeight - H);
        const prog = clamp(window.scrollY / span, 0, 1);
        const R = Math.min(W, H) * (wide ? 0.1 : 0.12) * (1 + prog * 1.3);
        const reach = Math.hypot(W, H) * 0.75;

        for (const s of stars) {
            const rad = 0.08 + s.d * 0.92;
            const ang = s.a + (t * 0.012) / (0.25 + s.d);
            const x = cx + Math.cos(ang) * rad * reach, y = cy + Math.sin(ang) * rad * reach * 0.62;
            if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
            if (Math.hypot(x - cx, (y - cy) / 0.62) < R * 1.1) continue;
            g.globalAlpha = s.al * (0.75 + 0.25 * Math.sin(t * s.tw + s.ph));
            g.fillStyle = s.c;
            g.fillRect(x, y, s.sz, s.sz);
        }
        g.globalAlpha = 1;

        ring(cx, cy, R, true);
        g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = '#000'; g.fill();
        // lensed light over and under the shadow, and the photon ring
        g.lineWidth = Math.max(1, R * 0.05);
        g.strokeStyle = P.amber; g.globalAlpha = 0.5;
        g.beginPath(); g.arc(cx, cy, R * 1.22, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        g.beginPath(); g.arc(cx, cy, R * 1.22, Math.PI * 0.08, Math.PI * 0.92); g.globalAlpha = 0.25; g.stroke();
        g.globalAlpha = 0.6; g.lineWidth = 1.5; g.strokeStyle = P.text;
        g.beginPath(); g.arc(cx, cy, R * 1.04, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        ring(cx, cy, R, false);
        g.globalAlpha = 1;
    }

    function loop(now) {
        raf = 0;
        if (!on) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        const calm = !!isCalm();
        if (!calm) t += dt;
        draw();
        if (on && !calm && !document.hidden) raf = requestAnimationFrame(loop); else last = 0;
    }

    function poke() {                                   // draw once soon (scroll, resize, Pause toggled)
        if (!on || queued || raf) return;
        queued = true;
        requestAnimationFrame(() => {
            if (!on) { queued = false; return; }
            if (!isCalm() && !document.hidden) { queued = false; raf = requestAnimationFrame(loop); } else draw();
        });
    }

    const onScroll = () => poke();
    const onVis = () => { last = 0; poke(); };

    return {
        get active() { return on; },
        start() {
            if (on) return;
            on = true; last = 0;
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll);
            document.addEventListener('visibilitychange', onVis);
            raf = requestAnimationFrame(loop);
        },
        stop() {
            if (!on) return;
            on = false;
            cancelAnimationFrame(raf); raf = 0;
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            document.removeEventListener('visibilitychange', onVis);
            g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
        },
        poke,
    };
}
