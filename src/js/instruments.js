// FILE: js/instruments.js
// ∂ Instruments station. init(root, ctx) builds five live simulations inside #instruments.
// ctx = { isCalm(): true while motion is paused or reduced, isReduced(): OS reduced-motion setting }.
// All physics lives in sims.js (pure, tested in tests.html). This file is only the UI: canvas, controls, readouts.
//
// Rules every instrument follows:
//   * it advances only while it is on screen, the tab is visible, its own Play is on, and ctx.isCalm() is false;
//   * when motion is calm (global Pause or prefers-reduced-motion) it shows a finished "poster" frame instead
//     and offers Step, so nothing is hidden from people who turned motion off;
//   * sliders, dragging and clicking still work in calm mode: they just redraw the poster.

import * as S from './sims.js';

const MONO_FALLBACK = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

/* ---------------------------------------------------------------- small helpers */

function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const k of Object.keys(attrs)) {
            const v = attrs[k];
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : String(v));
        }
    }
    for (const kid of kids) if (kid != null) el.append(kid);
    return el;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const rad = (deg) => (deg * Math.PI) / 180;
const sci = (x, d = 2) => (x === 0 ? '0' : x.toExponential(d));
const put = (el, s) => { if (el._s !== s) { el._s = s; el.textContent = s; } };
const fmtG = (x) => (x === 0 ? '0' : (Math.abs(x) < 0.01 || Math.abs(x) >= 1000 ? x.toExponential(2) : x.toFixed(3)));

function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(215,227,255,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    return {
        bg: v('--bg', '#0a0e1a'), panel: v('--panel', '#0f1528'), text: v('--text', '#d7e3ff'), muted: v('--muted', '#7f8fb5'),
        cyan: v('--cyan', '#5ce1e6'), amber: v('--amber', '#ffb454'), rose: v('--rose', '#ff6b9d'),
        line: v('--line', '#26345e'), gM: v('--gM', '#1b2748'), mono: v('--mono', MONO_FALLBACK),
    };
}

// Ring buffer of (x, y) points drawn oldest → newest with a rising alpha, so the trail fades out behind the head.
class Trail {
    constructor(n) { this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.len = 0; this.head = 0; }
    clear() { this.len = 0; this.head = 0; }
    push(x, y) {
        this.x[this.head] = x; this.y[this.head] = y;
        this.head = (this.head + 1) % this.n;
        if (this.len < this.n) this.len++;
    }
    draw(g, tx, ty, color, lw, maxA, chunks = 16) {
        const len = this.len;
        if (len < 2) return;
        const per = Math.max(1, Math.ceil((len - 1) / chunks));
        const total = Math.ceil((len - 1) / per);
        const start = (this.head - len + this.n) % this.n;
        g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color;
        for (let c = 0; c < total; c++) {
            const i0 = c * per, i1 = Math.min(len - 1, (c + 1) * per);
            g.globalAlpha = maxA * ((c + 1) / total);
            g.beginPath();
            for (let i = i0; i <= i1; i++) {
                const k = (start + i) % this.n;
                const px = tx(this.x[k]), py = ty(this.y[k]);
                if (i === i0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.stroke();
        }
        g.globalAlpha = 1;
    }
}

/* ---------------------------------------------------------------- styles */

/* The instruments' styles live in css/style.css (one design system). */
function injectStyle() {}

/* ---------------------------------------------------------------- the math drawers
   Each formula is typeset by KaTeX when it loads (see math.js). The text we write here is the fallback that stays if it never does.
   T() is an inline formula, D() a display formula. TeX is written with String.raw so backslashes survive. */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const R = String.raw;
const T = (tex, plain) => `<span class="tex" data-tex="${esc(tex)}">${plain}</span>`;
const D = (tex, plain) => `<div class="ins-eq" data-tex="${esc(tex)}" data-display>${esc(plain)}</div>`;

const MATH = {
    lorenz: `
<p>Three coupled equations, integrated with classical RK4 at ${T(R`\Delta t = 0.005`, 'dt = 0.005')} (error per step ${T(R`O(\Delta t^{5})`, 'O(dt⁵)')}):</p>
${D(R`\begin{aligned}\dot x &= \sigma\,(y-x)\\ \dot y &= x\,(\rho-z)-y\\ \dot z &= xy-\beta z\end{aligned}\qquad \sigma=10,\ \rho=28,\ \beta=\tfrac{8}{3}`,
    'dx/dt = σ(y − x)\ndy/dt = x(ρ − z) − y\ndz/dt = xy − βz          σ = 10, ρ = 28, β = 8/3')}
<p>Both twins start on the attractor (after a 20-unit warm-up) and B begins a distance ${T(R`d_0`, 'd₀')} from A, 0.001 by default. Nearby trajectories separate like ${T(R`d(t)\approx d_0\,e^{\lambda t}`, 'd(t) ≈ d₀·e<sup>λt</sup>')}, so ${T(R`\ln d`, 'ln d')} climbs with slope ${T(R`\lambda`, 'λ')}, the largest Lyapunov exponent. Theory for these parameters: ${T(R`\lambda \approx 0.906`, 'λ ≈ 0.906')}, so the gap doubles roughly every ${T(R`\ln 2/\lambda \approx 0.77`, 'ln 2 / λ ≈ 0.77')} time units.</p>
<p>The readout fits a least-squares line to ${T(R`\ln|A-B|`, 'ln|A − B|')} from ${T(R`t=1`, 't = 1')} until the gap first reaches 1. It stops there because the gap can never grow past the size of the attractor (tens of units); the strip chart flattens at that ceiling. The dashed line is the theory slope, drawn from the same starting gap.</p>
<p><strong>Honest caveat:</strong> one run is one sample. The local stretching rate depends on where on the attractor you happen to be, so single estimates scatter widely. Over 40 different starting points the estimates ranged from about 0 to above 2 and averaged 0.85; tests.html checks that average. Only the average approaches 0.906, so drag a few times and watch it wander.</p>`,

    pendulum: `
<p>Two point masses on rigid rods; ${T(R`\theta_1,\theta_2`, 'θ₁, θ₂')} are measured from straight down. With T the kinetic and V the potential energy, the Lagrangian is ${T(R`L=T-V`, 'L = T − V')}:</p>
${D(R`\begin{aligned}T&=\tfrac12(m_1+m_2)\,l_1^{2}\omega_1^{2}+\tfrac12 m_2 l_2^{2}\omega_2^{2}+m_2 l_1 l_2\,\omega_1\omega_2\cos(\theta_1-\theta_2)\\ V&=-(m_1+m_2)\,g\,l_1\cos\theta_1-m_2\,g\,l_2\cos\theta_2\end{aligned}`,
    'T = ½(m₁+m₂)l₁²ω₁² + ½m₂l₂²ω₂² + m₂l₁l₂ω₁ω₂cos(θ₁−θ₂)\nV = −(m₁+m₂)g l₁ cosθ₁ − m₂ g l₂ cosθ₂')}
<p>The Euler–Lagrange equations ${T(R`\tfrac{d}{dt}\tfrac{\partial L}{\partial \omega_i}=\tfrac{\partial L}{\partial \theta_i}`, 'd/dt(∂L/∂ω) = ∂L/∂θ')} give, with ${T(R`\Delta=\theta_1-\theta_2`, 'Δ = θ₁ − θ₂')} and ${T(R`D=2m_1+m_2-m_2\cos 2\Delta`, 'D = 2m₁ + m₂ − m₂cos 2Δ')}:</p>
${D(R`\begin{aligned}\dot\theta_i&=\omega_i\\ \dot\omega_1&=\frac{-g(2m_1+m_2)\sin\theta_1-m_2 g\sin(\theta_1-2\theta_2)-2\sin\Delta\,m_2\left(\omega_2^{2}l_2+\omega_1^{2}l_1\cos\Delta\right)}{l_1 D}\\ \dot\omega_2&=\frac{2\sin\Delta\left(\omega_1^{2}l_1(m_1+m_2)+g(m_1+m_2)\cos\theta_1+\omega_2^{2}l_2 m_2\cos\Delta\right)}{l_2 D}\end{aligned}`,
    'dθ/dt = ω\ndω₁/dt = [−g(2m₁+m₂) sinθ₁ − m₂g sin(θ₁−2θ₂) − 2 sinΔ · m₂(ω₂²l₂ + ω₁²l₁ cosΔ)] / (l₁D)\ndω₂/dt = [2 sinΔ · (ω₁²l₁(m₁+m₂) + g(m₁+m₂) cosθ₁ + ω₂²l₂m₂ cosΔ)] / (l₂D)')}
<p>Here ${T(R`m_1=m_2=l_1=l_2=1`, 'm₁ = m₂ = l₁ = l₂ = 1')} and ${T(R`g=9.81`, 'g = 9.81')}, integrated with RK4 at ${T(R`\Delta t=0.001`, 'dt = 0.001')}, released from rest.</p>
<p><strong>Energy meter.</strong> The true motion conserves ${T(R`E=T+V`, 'E = T + V')} exactly, so any change in E is pure numerical error. The meter shows ${T(R`|E-E_0|/|E_0|`, '|E − E₀| / |E₀|')} for each copy on a log scale, with a white tick at ${T(R`10^{-6}`, '10⁻⁶')}. RK4 is not symplectic, so the error creeps upward the longer it runs; if it ever crosses the tick, don’t trust the picture. (If ${T(R`E_0`, 'E₀')} happens to be almost exactly 0 the ratio means nothing, so the denominator is floored at 1% of ${T(R`(m_1+m_2)g\,l_1+m_2 g\,l_2`, '(m₁+m₂)g l₁ + m₂g l₂')}.)</p>`,

    kepler: `
<p>Mean anomaly ${T(R`M=2\pi t/P`, 'M = 2πt/P')} grows linearly with time. Kepler’s equation ${T(R`M=E-e\sin E`, 'M = E − e sin E')} gives the eccentric anomaly E, solved by Newton–Raphson:</p>
${D(R`E\leftarrow E-\frac{E-e\sin E-M}{1-e\cos E}\qquad(\text{a few steps, tolerance }10^{-14})`,
    'E ← E − (E − e sinE − M) / (1 − e cosE)         (a few steps, tolerance 1e-14)')}
<p>From the focus: ${T(R`x=a(\cos E-e)`, 'x = a(cosE − e)')}, ${T(R`y=a\sqrt{1-e^{2}}\,\sin E`, 'y = a√(1−e²) sinE')}, ${T(R`r=a(1-e\cos E)`, 'r = a(1 − e cosE)')}. Units ${T(R`GM=1`, 'GM = 1')}, ${T(R`a=1`, 'a = 1')}, so the period is ${T(R`P=2\pi`, 'P = 2π')} and the speed follows from ${T(R`v^{2}=GM\left(\tfrac{2}{r}-\tfrac{1}{a}\right)`, 'v² = GM(2/r − 1/a)')}.</p>
<p>The twelve wedges are cut at equal times P/12. Each wedge’s area is <em>measured</em>: its arc is split into thin triangles from the focus and their areas are added (shoelace formula). Kepler’s second law says ${T(R`\mathrm{d}A/\mathrm{d}t=\tfrac12|\mathbf{r}\times\mathbf{v}|`, 'dA/dt = ½|r × v|')} is constant, so every wedge should come to ${T(R`\pi a b/12`, 'πab/12')} ≈ 0.2618 for a = 1, e = 0. The spread readout, (max − min)/mean over finished wedges, shows how close the measurement gets. The number never comes from the law, so agreement is a check, not an assumption.</p>`,

    loss: `
<p>Himmelblau’s function is a standard non-convex test surface with four minima, all exactly L = 0 (labelled A–D):</p>
${D(R`\begin{aligned}L(x,y)&=(x^{2}+y-11)^{2}+(x+y^{2}-7)^{2}\\ \frac{\partial L}{\partial x}&=4x(x^{2}+y-11)+2(x+y^{2}-7)\\ \frac{\partial L}{\partial y}&=2(x^{2}+y-11)+4y(x+y^{2}-7)\end{aligned}`,
    'L(x, y) = (x² + y − 11)² + (x + y² − 7)²\n∂L/∂x = 4x(x² + y − 11) + 2(x + y² − 7)\n∂L/∂y = 2(x² + y − 11) + 4y(x + y² − 7)')}
<p>Three optimizers read the same gradient ${T(R`g=\nabla L`, 'g = ∇L')} at their own position:</p>
${D(R`\begin{aligned}\text{SGD:}\quad&\theta\leftarrow\theta-\eta\,g\\ \text{Momentum:}\quad&v\leftarrow\beta v-\eta\,g,\quad\theta\leftarrow\theta+v\\ \text{Adam:}\quad&m\leftarrow\beta m+(1-\beta)\,g,\quad s\leftarrow 0.999\,s+0.001\,g^{2}\\ &\theta\leftarrow\theta-\eta\,\frac{\hat m}{\sqrt{\hat s}+10^{-8}}\end{aligned}`,
    'SGD        θ ← θ − η g\nMomentum   v ← β v − η g,      θ ← θ + v\nAdam       m ← β m + (1−β) g,  s ← 0.999 s + 0.001 g²\n           θ ← θ − η · m̂ / (√ŝ + 10⁻⁸)       (m̂, ŝ bias-corrected)')}
<p>${T(R`\eta`, 'η')} and ${T(R`\beta`, 'β')} are shared; β is the momentum coefficient and Adam’s ${T(R`\beta_1`, 'β₁')}. Where a run ends depends on the start and on the method, so try several starts. Raise η and plain SGD starts to bounce or blow up (a step of ηg overshoots once η exceeds about ${T(R`2/\lambda_{\max}`, '2/λ<sub>max</sub>')}, the steepest curvature it meets), while Adam, whose step is about η no matter how big the gradient, stays calm. A run stops when ${T(R`\lVert\nabla L\rVert \lt 10^{-6}`, '|∇L| &lt; 10⁻⁶')} (converged), after 4000 steps, or if it escapes to infinity (diverged). The contours are spaced by a factor of ${T(R`\sqrt{2}`, '√2')} in L.</p>`,

    box: `
<p>Infinite well of width ${T(R`L=1`, 'L = 1')}, with ${T(R`\hbar=m=1`, 'ħ = m = 1')}. The stationary states and energies are</p>
${D(R`\psi_n(x)=\sqrt{2}\,\sin(n\pi x),\qquad E_n=\frac{n^{2}\pi^{2}}{2}`, 'ψₙ(x) = √2 sin(nπx),        Eₙ = n²π²/2')}
<p>An equal superposition ${T(R`\Psi=\big(\psi_{n_1}e^{-iE_1 t}+\psi_{n_2}e^{-iE_2 t}\big)/\sqrt{2}`, 'Ψ = (ψ<sub>n₁</sub>e<sup>−iE₁t</sup> + ψ<sub>n₂</sub>e<sup>−iE₂t</sup>)/√2')} has probability density</p>
${D(R`|\Psi|^{2}=\tfrac12\Big(\psi_1^{2}+\psi_2^{2}+2\,\psi_1\psi_2\cos\big((E_2-E_1)\,t\big)\Big)`, '|Ψ|² = ½ (ψ₁² + ψ₂² + 2 ψ₁ψ₂ cos((E₂ − E₁) t))')}
<p>The cross term is interference between the two phases, and it makes the density slosh with period ${T(R`T=2\pi/(E_2-E_1)`, 'T = 2π/(E₂ − E₁)')}. For ${T(R`n_1+n_2`, 'n₁ + n₂')} odd the mean position moves as</p>
${D(R`\langle x\rangle(t)=\tfrac12-\frac{8\,n_1 n_2}{\pi^{2}\,(n_1^{2}-n_2^{2})^{2}}\cos\big((E_2-E_1)\,t\big)`, '⟨x⟩(t) = ½ − 8 n₁n₂ / (π² (n₁² − n₂²)²) · cos((E₂ − E₁) t)')}
<p>When n₁ + n₂ is even the density still changes shape but ⟨x⟩ stays at ½. If n₁ = n₂ there is only one state and nothing moves (the formula would double-count, so that case is drawn as plain ψₙ²). The norm readout integrates |Ψ|² numerically and should read 1.0000 at every instant. The animation is slowed so one period lasts 3 seconds; the real period is in the readout.</p>`,
};

/* ---------------------------------------------------------------- base instrument */

class Instrument {
    constructor(env, spec) {
        this.env = env; this.C = env.C; this.ctx = env.ctx; this.spec = spec;
        this.playing = true; this.onScreen = false; this.calm = false; this.started = false; this.dirty = true;
        this.w = 0; this.h = 0; this.dpr = 1;
        this.rd = {};

        const id = spec.id;
        this.canvas = h('canvas', {
            id: id + '-cv', role: 'img', 'aria-label': spec.alt, 'aria-describedby': id + '-hint',
            tabindex: spec.focusable ? '0' : null, class: spec.canvasClass || '',
        });
        this.g = this.canvas.getContext('2d');
        this.ctl = h('div', { class: 'ins-ctl', role: 'group', 'aria-label': spec.title + ' controls' });
        this.playBtn = h('button', { type: 'button', class: 'btn', onclick: () => this.togglePlay() }, 'Pause');
        this.stepBtn = h('button', { type: 'button', class: 'btn', onclick: () => this.stepClick(), title: 'Advance by one small chunk' }, 'Step');
        this.restartBtn = h('button', { type: 'button', class: 'btn', onclick: () => this.restart() }, 'Restart');
        this.act = h('div', { class: 'ins-act', role: 'group', 'aria-label': spec.title + ' playback' }, this.playBtn, this.stepBtn, this.restartBtn);
        this.rdl = h('dl', { class: 'ins-rd' });
        this.status = h('p', { class: 'ins-status', hidden: true },
            'Motion is paused (site pause or your reduced-motion setting). Showing a finished frame; Step advances by hand.');
        this.extra = h('div', {});
        this.details = h('details', {}, h('summary', null, 'the math'), h('div', { class: 'ins-mb' }));
        this.details.lastChild.innerHTML = spec.math;

        this.root = h('article', { class: 'ins', 'aria-labelledby': id + '-t' },
            h('div', { class: 'ins-head' },
                h('h3', { id: id + '-t' }, spec.title),
                h('p', { class: 'ins-cap' }, spec.caption)),
            h('div', { class: 'ins-stage' }, this.canvas),
            h('p', { class: 'ins-hint', id: id + '-hint' }, spec.hint),
            this.ctl, this.act, this.rdl, this.extra, this.status, this.details);
    }

    addSlider({ key, label, min, max, step, value, fmt, onInput }) {
        const id = this.spec.id + '-' + key;
        const out = h('output', { for: id }, fmt(value));
        const inp = h('input', { type: 'range', id, min, max, step, value });
        inp.addEventListener('input', () => { const v = +inp.value; out.textContent = fmt(v); onInput(v); });
        this.ctl.append(h('label', { for: id }, label), inp, out);
        return { input: inp, out, set(v) { inp.value = v; out.textContent = fmt(+inp.value); }, get value() { return +inp.value; } };
    }

    addReadout(key, label, cls) {
        const dd = h('dd', { class: cls || null }, '–');
        this.rdl.append(h('div', null, h('dt', null, label), dd));
        this.rd[key] = dd;
        return dd;
    }

    /* ---- lifecycle ---- */
    setVisible(v) {
        this.onScreen = v;
        if (v) { if (!this.started) this.start(); this.dirty = true; this.env.kick(); }
    }
    start() {
        this.started = true;
        this.setCalm(!!this.ctx.isCalm());
        this.restart();
    }
    setCalm(c) {
        if (c === this.calm && this._calmInit) return;
        this._calmInit = true;
        this.calm = c;
        this.status.hidden = !c;
        this.playBtn.disabled = c;
        this.updatePlayLabel();
        this.dirty = true;
    }
    running() { return this.playing && this.onScreen && !this.calm && !document.hidden; }
    updatePlayLabel() { this.playBtn.textContent = this.playing && !this.calm ? 'Pause' : 'Play'; }
    togglePlay() { this.playing = !this.playing; this.updatePlayLabel(); this.env.kick(); }
    stepClick() {
        if (!this.calm) { this.playing = false; this.updatePlayLabel(); }   // in calm mode Play is disabled; leave the person's own choice alone
        this.stepOnce(); this.dirty = true; this.env.kick();
    }
    restart() {
        this.reset();
        if (this.calm) this.poster();
        this.dirty = true;
        this.env.kick();
    }

    /* ---- sizing and drawing ---- */
    resize() {
        const r = this.canvas.getBoundingClientRect();
        const w = Math.round(r.width), h2 = Math.round(r.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (w === this.w && h2 === this.h && dpr === this.dpr) return;
        this.w = w; this.h = h2; this.dpr = dpr;
        this.canvas.width = Math.max(1, Math.round(w * dpr));
        this.canvas.height = Math.max(1, Math.round(h2 * dpr));
        this.onResize();
        this.dirty = true;
    }
    render() {
        this.dirty = false;
        if (this.w < 2 || this.h < 2) return;
        const g = this.g;
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        g.clearRect(0, 0, this.w, this.h);
        this.draw(g, this.w, this.h);
        this.updateReadout();
    }
    font(px, weight = 400) { return `${weight} ${px}px ${this.C.mono}`; }

    /* ---- hooks for subclasses ---- */
    onResize() {}
    reset() {}
    poster() {}
    advance() {}
    stepOnce() {}
    draw() {}
    updateReadout() {}
}

/* ================================================================ 1. Lorenz twin */

class LorenzInstrument extends Instrument {
    constructor(env) {
        super(env, {
            id: 'ins-lorenz', title: 'Lorenz twin', caption: 'chaos · a tiny nudge, a different future',
            alt: 'Two Lorenz trajectories, cyan and amber, starting 0.001 apart, drawn in the x–z plane, with a log-scale strip chart of how far apart they are.',
            hint: 'Drag on the plot to nudge B’s start and restart both. Double-click resets the nudge. With the plot focused, arrow keys nudge too (Shift = bigger).',
            focusable: true, canvasClass: 'ins-drag',
            math: MATH.lorenz,
        });
        this.sim = new S.LorenzTwin();
        this.nudge = [1e-3, 0, 0];
        this.ta = new Trail(900); this.tb = new Trail(900);
        this.rate = 2;                 // time units per real second
        this.acc = 0;
        this.drag = null;

        this.addReadout('t', 't (time units)');
        this.addReadout('sep', 'separation |A − B|');
        this.addReadout('lam', 'growth rate (ln d slope)', 'amber');
        this.addReadout('theory', 'theory · starting gap');

        const cv = this.canvas;
        cv.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
            try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            e.preventDefault();
        });
        cv.addEventListener('pointermove', (e) => {
            if (!this.drag) return;
            const K = 1e-4;            // 10 px of drag = 1e-3
            this.setNudge([(e.clientX - this.drag.x) * K, 0, -(e.clientY - this.drag.y) * K]);
        });
        const end = () => { this.drag = null; };
        cv.addEventListener('pointerup', end);
        cv.addEventListener('pointercancel', end);
        cv.addEventListener('dblclick', () => this.setNudge([1e-3, 0, 0]));
        cv.addEventListener('keydown', (e) => {
            const big = e.shiftKey ? 10 : 1, k = 1e-4 * big;
            const n = this.nudge.slice();
            if (e.key === 'ArrowRight') n[0] += k;
            else if (e.key === 'ArrowLeft') n[0] -= k;
            else if (e.key === 'ArrowUp') n[2] += k;
            else if (e.key === 'ArrowDown') n[2] -= k;
            else if (e.key === 'Escape' || e.key === '0') { n[0] = 1e-3; n[1] = 0; n[2] = 0; }
            else return;
            e.preventDefault();
            this.setNudge(n);
        });
    }

    setNudge(v) {
        let m = Math.hypot(v[0], v[1], v[2]);
        if (m === 0) { v = [1e-6, 0, 0]; m = 1e-6; }
        const k = m > 0.05 ? 0.05 / m : (m < 1e-6 ? 1e-6 / m : 1);
        this.nudge = [v[0] * k, v[1] * k, v[2] * k];
        this.restart();
    }

    reset() {
        this.sim.reset(this.nudge);
        this.ta.clear(); this.tb.clear();
        this.acc = 0;
        this.pushTrails();
    }
    pushTrails() {
        this.ta.push(this.sim.a[0], this.sim.a[2]);
        this.tb.push(this.sim.b[0], this.sim.b[2]);
    }
    run(steps) {
        for (let i = 0; i < steps; i++) {
            this.sim.step(1);
            if (this.sim.steps % 2 === 0) this.pushTrails();
        }
    }
    poster() { this.run(2800); }                    // 14 time units: past the point where the twins have parted
    advance(dt) {
        this.acc += dt * this.rate;
        const n = Math.min(240, Math.floor(this.acc / this.sim.dt));
        this.acc -= n * this.sim.dt;
        this.run(n);
    }
    stepOnce() { this.run(100); }                   // half a time unit

    draw(g, w, h) {
        const C = this.C, sim = this.sim;
        const pad = 10, stripH = clamp(Math.round(h * 0.3), 84, Math.round(h * 0.42));
        const mainH = h - stripH - pad;
        const s = Math.min((w - 2 * pad) / 44, (mainH - pad) / 50);
        const top = pad + ((mainH - pad) - 50 * s) / 2;
        const tx = (x) => w / 2 + s * x, ty = (z) => top + (50 - z) * s;

        // legend
        g.font = this.font(10.5, 500); g.textBaseline = 'middle';
        g.fillStyle = C.cyan; g.fillText('● A', pad + 2, pad + 6);
        g.fillStyle = C.amber; g.fillText('● B', pad + 40, pad + 6);
        g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText('x–z plane', w - pad - 2, pad + 6); g.textAlign = 'left';

        this.tb.draw(g, tx, ty, C.amber, 1.4, 0.95);
        this.ta.draw(g, tx, ty, C.cyan, 1.4, 0.95);

        // heads
        g.lineWidth = 1.5; g.strokeStyle = C.bg;
        g.fillStyle = C.amber; g.beginPath(); g.arc(tx(sim.b[0]), ty(sim.b[2]), 3.6, 0, 6.2832); g.fill(); g.stroke();
        g.fillStyle = C.cyan; g.beginPath(); g.arc(tx(sim.a[0]), ty(sim.a[2]), 3.6, 0, 6.2832); g.fill(); g.stroke();

        // the nudge, magnified into an arrow at A's start (the real gap is far below a pixel)
        const sx = tx(sim.start[0]), sy = ty(sim.start[2]);
        const a = this.drag ? 1 : clamp(1 - (sim.t - 2) / 2, 0.45, 1);
        let dx = this.nudge[0], dz = -this.nudge[2];
        const dm = Math.hypot(dx, dz) || 1; dx /= dm; dz /= dm;
        g.globalAlpha = a;
        g.strokeStyle = C.cyan; g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, 6, 0, 6.2832); g.stroke();
        const ex = sx + dx * 20, ey = sy + dz * 20;
        g.strokeStyle = C.amber; g.lineWidth = 1.5; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = C.amber; g.beginPath(); g.arc(ex, ey, 2.5, 0, 6.2832); g.fill();
        g.fillStyle = C.text; g.font = this.font(10);
        const mag = sci(Math.hypot(...this.nudge));
        let label = 'B − A = ' + mag + ' (not to scale)';
        if (g.measureText(label).width > w * 0.5) label = 'B − A = ' + mag;        // narrow canvas: drop the aside
        const wd = g.measureText(label).width;
        let lx, al;                                     // keep the label on the canvas: flip to the far side of the ring if needed
        if (dx >= 0) { lx = ex + 6; al = 'left'; if (lx + wd > w - 6) { lx = sx - 10; al = 'right'; } }
        else { lx = ex - 6; al = 'right'; if (lx - wd < 6) { lx = sx + 10; al = 'left'; } }
        if (al === 'right' && lx - wd < 6) lx = 6 + wd;                             // last resort: pin to the left edge
        if (al === 'left' && lx + wd > w - 6) lx = w - 6 - wd;
        g.textAlign = al;
        g.fillText(label, lx, ey + (dz > 0.3 ? 8 : dz < -0.3 ? -8 : 0));
        g.textAlign = 'left'; g.globalAlpha = 1;

        this.drawStrip(g, w, h, pad, stripH);
    }

    drawStrip(g, w, h, pad, stripH) {
        const C = this.C, sim = this.sim, H = sim.hist;
        const x0 = pad + 34, x1 = w - pad, y0 = h - stripH + 8, y1 = h - pad - 12;
        const lo = Math.floor(Math.log10(sim.sep0)) - 0.5, hi = 2;
        const yv = (lg) => y1 - ((y1 - y0) * (lg - lo)) / (hi - lo);
        const tWin = 24, tmin = Math.max(0, sim.t - tWin);
        const xv = (t) => x0 + ((x1 - x0) * (t - tmin)) / tWin;

        g.save();
        g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
        // fit window
        const est = sim.lyapunovEstimate();
        if (est) {
            const ta = xv(est.t0), tb = xv(est.closed ? est.t1 : sim.t);
            g.fillStyle = rgba(C.cyan, 0.08); g.fillRect(ta, y0, Math.max(0, tb - ta), y1 - y0);
        }
        // decade lines
        g.strokeStyle = rgba(C.line, 0.9); g.lineWidth = 1;
        for (let k = Math.ceil(lo); k <= hi; k++) { g.beginPath(); g.moveTo(x0, yv(k)); g.lineTo(x1, yv(k)); g.stroke(); }
        // theory slope
        if (tmin === 0) {
            const lg0 = Math.log10(sim.sep0), slope = S.LORENZ_LYAPUNOV / Math.LN10;
            const tHit = Math.min(tWin, (hi - lg0) / slope);
            g.setLineDash([4, 4]); g.strokeStyle = C.rose; g.lineWidth = 1.2; g.globalAlpha = 0.9;
            g.beginPath(); g.moveTo(xv(0), yv(lg0)); g.lineTo(xv(tHit), yv(lg0 + slope * tHit)); g.stroke();
            g.setLineDash([]); g.globalAlpha = 1;
        }
        // data
        g.strokeStyle = C.text; g.lineWidth = 1.5; g.beginPath();
        let first = true;
        for (let i = 0; i < H.t.length; i++) {
            if (H.t[i] < tmin) continue;
            const px = xv(H.t[i]), py = yv(H.ln[i] / Math.LN10);
            if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py);
        }
        g.stroke();
        g.restore();

        g.strokeStyle = C.line; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
        g.font = this.font(9); g.fillStyle = C.muted; g.textBaseline = 'middle'; g.textAlign = 'right';
        const every = Math.max(1, Math.ceil(12 / ((y1 - y0) / (hi - lo))));        // thin the labels so they never touch
        for (let k = Math.ceil(lo); k <= hi; k++) if ((hi - k) % every === 0) g.fillText('1e' + k, x0 - 4, yv(k));
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('log₁₀ |A − B|', x0 + 4, y0 + 10);
        g.fillStyle = C.rose; g.fillText('- - theory slope', x1 - 86, y1 - 5);
        g.fillStyle = C.muted;
        g.fillText(String(Math.round(tmin)), x0, h - pad);
        g.textAlign = 'right'; g.fillText(String(Math.round(tmin + tWin)) + '  time', x1, h - pad); g.textAlign = 'left';
    }

    updateReadout() {
        const sim = this.sim, est = sim.lyapunovEstimate();
        put(this.rd.t, sim.t.toFixed(2));
        put(this.rd.sep, sci(sim.separation()));
        put(this.rd.lam, est ? est.rate.toFixed(3) + ' /unit' + (est.closed ? '' : ' …') : '–  (needs t > 1.5)');
        put(this.rd.theory, S.LORENZ_LYAPUNOV.toFixed(3) + ' · ' + sci(Math.hypot(...this.nudge), 1));
    }
}

/* ================================================================ 2. Double pendulum */

class PendulumInstrument extends Instrument {
    constructor(env) {
        super(env, {
            id: 'ins-pendulum', title: 'Double pendulum', caption: 'chaos · two copies, one honest energy meter',
            alt: 'Two double pendulums, cyan and amber, released from rest 0.001 radians apart, with fading trails behind the lower bobs.',
            hint: 'Pick the starting angles. Copy B starts 0.001 rad away in θ₁. The meter below checks the integrator against energy conservation.',
            math: MATH.pendulum,
        });
        this.th1 = 150; this.th2 = 120;
        this.pair = new S.PendulumPair(rad(this.th1), rad(this.th2));
        this.ta = new Trail(420); this.tb = new Trail(420);
        this.acc = 0;

        this.s1 = this.addSlider({ key: 'th1', label: 'θ₁ start', min: -175, max: 175, step: 1, value: this.th1, fmt: (v) => v + '°', onInput: (v) => { this.th1 = v; this.restart(); } });
        this.s2 = this.addSlider({ key: 'th2', label: 'θ₂ start', min: -175, max: 175, step: 1, value: this.th2, fmt: (v) => v + '°', onInput: (v) => { this.th2 = v; this.restart(); } });

        this.addReadout('t', 't (seconds)');
        this.addReadout('tip', 'tip separation');
        this.meters = {};
        for (const [k, label, cls] of [['ea', 'energy drift · A', ''], ['eb', 'energy drift · B', 'amber']]) {
            const dd = this.addReadout(k, label, cls);
            const bar = h('i'), tick = h('b', { style: `left:${((-6 + 12) / 9) * 100}%` });
            dd.after(h('div', { class: 'ins-meter', 'aria-hidden': 'true' }, bar, tick));
            this.meters[k] = bar;
        }
    }

    reset() {
        this.pair.reset(rad(this.th1), rad(this.th2));
        this.ta.clear(); this.tb.clear();
        this.acc = 0;
        this.pushTrails();
    }
    pushTrails() {
        const A = S.pendulumTips(this.pair.a), B = S.pendulumTips(this.pair.b);
        this.ta.push(A[2], A[3]); this.tb.push(B[2], B[3]);
    }
    run(steps) {
        for (let i = 0; i < steps; i += 10) {         // one trail point per 10 ms of pendulum time
            const n = Math.min(10, steps - i);
            this.pair.step(n);
            if (n === 10) this.pushTrails();
        }
    }
    poster() { this.run(4000); }                       // 4 s in: trails are drawn, copies have parted
    advance(dt) {
        this.acc += dt;
        const n = Math.min(60, Math.floor(this.acc / this.pair.dt));
        this.acc -= n * this.pair.dt;
        this.run(n);
    }
    stepOnce() { this.run(250); }

    draw(g, w, h) {
        const C = this.C, p = this.pair;
        const R = Math.min(w, h) / 2 - 14, u = R / 2, cx = w / 2, cy = h / 2;
        const tx = (x) => cx + u * x, ty = (y) => cy + u * y;

        // reach circle
        g.strokeStyle = rgba(C.line, 0.9); g.lineWidth = 1; g.setLineDash([2, 5]);
        g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.stroke(); g.setLineDash([]);

        g.font = this.font(10.5, 500); g.textBaseline = 'middle';
        g.fillStyle = C.cyan; g.fillText('● A', 12, 14);
        g.fillStyle = C.amber; g.fillText('● B  (+0.001 rad)', 52, 14);

        this.tb.draw(g, tx, ty, C.amber, 1.5, 0.9);
        this.ta.draw(g, tx, ty, C.cyan, 1.5, 0.9);

        const arm = (s, col, lw, alpha) => {
            const T = S.pendulumTips(s);
            g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = lw;
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx(T[0]), ty(T[1])); g.lineTo(tx(T[2]), ty(T[3])); g.stroke();
            g.fillStyle = col;
            g.beginPath(); g.arc(tx(T[0]), ty(T[1]), 4, 0, 6.2832); g.fill();
            g.beginPath(); g.arc(tx(T[2]), ty(T[3]), 5, 0, 6.2832); g.fill();
            g.globalAlpha = 1;
        };
        arm(p.b, C.amber, 1.5, 0.85);
        arm(p.a, C.cyan, 2, 1);
        g.fillStyle = C.text; g.beginPath(); g.arc(cx, cy, 3, 0, 6.2832); g.fill();
    }

    updateReadout() {
        const p = this.pair, ea = p.errA(), eb = p.errB();
        put(this.rd.t, p.t.toFixed(2));
        put(this.rd.tip, sci(p.tipSeparation()));
        put(this.rd.ea, sci(ea));
        put(this.rd.eb, sci(eb));
        for (const [k, e] of [['ea', ea], ['eb', eb]]) {
            const bar = this.meters[k];
            const f = e > 0 ? clamp((Math.log10(e) + 12) / 9, 0, 1) : 0;
            bar.style.width = (f * 100).toFixed(1) + '%';
            const cls = e < 1e-6 ? '' : e < 1e-4 ? 'warn' : 'bad';
            if (bar._c !== cls) { bar._c = cls; bar.className = cls; }
        }
    }
}

/* ================================================================ 3. Kepler orbit */

class KeplerInstrument extends Instrument {
    constructor(env) {
        super(env, {
            id: 'ins-kepler', title: 'Kepler orbit', caption: 'order · equal areas in equal times',
            alt: 'An elliptical orbit around a focus, divided into twelve shaded wedges swept in equal time steps, each labelled with its measured area.',
            hint: 'Slide the eccentricity. Twelve wedges are swept in equal time steps; each area is measured by adding thin triangles from the focus.',
            math: MATH.kepler,
        });
        this.e = 0.6;
        this.N = S.KEPLER_WEDGES;
        this.P = S.TAU;
        this.dtw = this.P / this.N;
        this.rate = this.P / 14;       // one orbit in 14 s
        this.t = 0; this.hold = 0;
        this.W = S.keplerWedges(this.e, this.N);

        this.se = this.addSlider({ key: 'e', label: 'eccentricity e', min: 0, max: 0.9, step: 0.01, value: this.e, fmt: (v) => v.toFixed(2), onInput: (v) => { this.e = v; this.restart(); } });

        this.addReadout('spread', 'wedge area spread');
        this.addReadout('r', 'distance r', 'amber');
        this.addReadout('v', 'speed v', 'amber');
        this.addReadout('t', 't / P');

        this.cells = [];
        const grid = h('div', { class: 'ins-wg', role: 'group', 'aria-label': 'Area of each wedge' });
        for (let k = 0; k < this.N; k++) {
            const sw = h('i'), em = h('em', null, '–');
            grid.append(h('span', null, sw, h('b', null, String(k + 1)), em));
            this.cells.push({ span: grid.lastChild, sw, em });
        }
        this.extra.append(h('p', { class: 'ins-note' }, 'Area of each wedge (units: a² with a = 1):'), grid);
    }

    wedgeColor(k) { return k % 2 ? this.C.amber : this.C.cyan; }

    reset() {
        this.W = S.keplerWedges(this.e, this.N);
        this.t = 0; this.hold = 0;
    }
    poster() { this.t = this.P; this.hold = 0; }
    advance(dt) {
        if (this.t >= this.P) {
            this.hold -= dt;
            if (this.hold <= 0) { this.t = 0; this.hold = 0; }
            return;
        }
        this.t = Math.min(this.P, this.t + dt * this.rate);
        if (this.t >= this.P) this.hold = 1.6;      // linger on the finished set of wedges
    }
    stepOnce() {
        if (this.t >= this.P - 1e-9) this.t = 0;
        this.t = Math.min(this.P, this.t + this.dtw / 2);
    }

    state() {
        const done = Math.min(this.N, Math.floor((this.t + 1e-12) / this.dtw));
        const E = S.solveKepler(this.t, this.e);
        return { done, E };
    }

    draw(g, w, h) {
        const C = this.C, e = this.e, b = Math.sqrt(1 - e * e), pad = 16;
        const s = Math.min((w - 2 * pad) / 2, (h - 2 * pad) / (2 * b));
        const tx = (x) => w / 2 + s * (x + e), ty = (y) => h / 2 - s * y;
        const { done, E } = this.state();
        const Eb = this.W.E;

        const wedge = (E0, E1, fill, alpha) => {
            const n = Math.max(2, Math.ceil(Math.abs(E1 - E0) / 0.05));
            g.beginPath(); g.moveTo(tx(0), ty(0));
            for (let i = 0; i <= n; i++) { const p = S.keplerPosition(E0 + ((E1 - E0) * i) / n, e); g.lineTo(tx(p[0]), ty(p[1])); }
            g.closePath(); g.globalAlpha = alpha; g.fillStyle = fill; g.fill(); g.globalAlpha = 1;
        };
        for (let k = 0; k < done; k++) wedge(Eb[k], Eb[k + 1], this.wedgeColor(k), 0.26);
        if (done < this.N) wedge(Eb[done], E, C.text, 0.3);

        // orbit
        g.strokeStyle = C.muted; g.lineWidth = 1.2; g.beginPath();
        for (let i = 0; i <= 160; i++) { const p = S.keplerPosition((i / 160) * S.TAU, e); if (i) g.lineTo(tx(p[0]), ty(p[1])); else g.moveTo(tx(p[0]), ty(p[1])); }
        g.stroke();

        // wedge boundaries (equal time), numbers
        g.font = this.font(9.5, 500); g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let k = 0; k < this.N; k++) {
            const p = S.keplerPosition(Eb[k], e);
            g.strokeStyle = rgba(C.text, 0.22); g.lineWidth = 1; g.beginPath(); g.moveTo(tx(0), ty(0)); g.lineTo(tx(p[0]), ty(p[1])); g.stroke();
            g.fillStyle = C.bg; g.strokeStyle = C.text; g.beginPath(); g.arc(tx(p[0]), ty(p[1]), 2.5, 0, 6.2832); g.fill(); g.stroke();
            const m = S.keplerPosition((Eb[k] + Eb[k + 1]) / 2, e);
            const ox = m[0] + e, oy = m[1], om = Math.hypot(ox * s, oy * s) || 1;     // push outward from the ellipse centre
            g.fillStyle = k < done ? this.wedgeColor(k) : C.muted;
            g.fillText(String(k + 1), tx(m[0]) + (ox * s / om) * 11, ty(m[1]) - (oy * s / om) * 11);
        }
        g.textAlign = 'left';

        // sun at the focus, planet
        const grad = g.createRadialGradient(tx(0), ty(0), 0, tx(0), ty(0), 14);
        grad.addColorStop(0, rgba(C.amber, 0.55)); grad.addColorStop(1, rgba(C.amber, 0));
        g.fillStyle = grad; g.beginPath(); g.arc(tx(0), ty(0), 14, 0, 6.2832); g.fill();
        g.fillStyle = C.amber; g.beginPath(); g.arc(tx(0), ty(0), 4, 0, 6.2832); g.fill();
        const p = S.keplerPosition(E, e);
        g.strokeStyle = rgba(C.cyan, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(tx(0), ty(0)); g.lineTo(tx(p[0]), ty(p[1])); g.stroke();
        g.fillStyle = C.cyan; g.strokeStyle = C.bg; g.lineWidth = 1.5;
        g.beginPath(); g.arc(tx(p[0]), ty(p[1]), 4.5, 0, 6.2832); g.fill(); g.stroke();
    }

    updateReadout() {
        const { done, E } = this.state();
        const W = this.W;
        const live = done < this.N ? S.sweptArea(this.e, W.E[done], E, 1) : null;
        for (let k = 0; k < this.N; k++) {
            const c = this.cells[k];
            put(c.em, k < done ? W.areas[k].toFixed(4) : k === done ? live.toFixed(4) : '–');
            const col = k < done ? this.wedgeColor(k) : k === done ? this.C.text : this.C.line;
            if (c.sw._c !== col) { c.sw._c = col; c.sw.style.background = col; }
            c.span.classList.toggle('live', k === done);
        }
        if (done >= 2) {
            const a = W.areas.slice(0, done);
            const mean = a.reduce((x, y) => x + y, 0) / a.length;
            put(this.rd.spread, sci((Math.max(...a) - Math.min(...a)) / mean) + ' (' + done + ' done)');
        } else put(this.rd.spread, '–  (needs 2 wedges)');
        const rv = S.keplerRV(E, this.e);
        put(this.rd.r, rv.r.toFixed(3));
        put(this.rd.v, rv.v.toFixed(3));
        put(this.rd.t, (this.t / this.P).toFixed(3));
    }
}

/* ================================================================ 4. Loss landscape */

const LOSS_RANGE = 6;                       // y runs −6…6; x gets whatever the canvas width allows
const LOSS_MIN_LABELS = ['A', 'B', 'C', 'D'];

class LossInstrument extends Instrument {
    constructor(env) {
        super(env, {
            id: 'ins-loss', title: 'Loss landscape', caption: 'descent · one start, three ways downhill',
            alt: 'A contour map of Himmelblau’s function with four minima. Click to place a start point; SGD, momentum and Adam paths run from it in amber, rose and cyan.',
            hint: 'Click the map to drop a start point (with the map focused, arrow keys move it). SGD, momentum and Adam all start there and share η and β.',
            focusable: true, canvasClass: 'ins-click',
            math: MATH.loss,
        });
        this.p0 = [0.5, -0.5];
        this.logEta = -2;               // η = 0.01
        this.beta = 0.9;
        this.opts = [
            { kind: 'sgd', name: 'SGD', color: this.C.amber },
            { kind: 'momentum', name: 'Momentum', color: this.C.rose },
            { kind: 'adam', name: 'Adam', color: this.C.cyan },
        ].map((o) => Object.assign(o, { opt: new S.Optimizer(o.kind, this.p0[0], this.p0[1], { eta: 0.01, beta: this.beta }) }));
        this.acc = 0;
        this.bg = document.createElement('canvas');
        this.bgKey = '';

        this.sEta = this.addSlider({ key: 'eta', label: 'η (log scale)', min: -3, max: -1, step: 0.05, value: this.logEta, fmt: (v) => Math.pow(10, v).toPrecision(2), onInput: (v) => { this.logEta = v; this.applyParams(); } });
        this.sBeta = this.addSlider({ key: 'beta', label: 'β', min: 0, max: 0.99, step: 0.01, value: this.beta, fmt: (v) => v.toFixed(2), onInput: (v) => { this.beta = v; this.applyParams(); } });

        this.tbody = h('tbody');
        this.rows = this.opts.map((o) => {
            const cells = [h('td'), h('td'), h('td'), h('td'), h('td')];
            cells[0].append(h('i', { style: `background:${o.color}` }), o.name);
            this.tbody.append(h('tr', null, ...cells));
            return cells;
        });
        this.extra.append(h('div', { class: 'ins-tbw' }, h('table', { class: 'ins-tb' },
            h('caption', { class: 'sr-only' }, 'Live values for each optimizer'),
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'method'), h('th', { scope: 'col' }, 'L'), h('th', { scope: 'col' }, '|∇L|'), h('th', { scope: 'col' }, 'steps'), h('th', { scope: 'col' }, 'state'))),
            this.tbody)));

        this.canvas.addEventListener('click', (e) => {
            const r = this.canvas.getBoundingClientRect();
            const m = this.metrics();
            this.setStart((e.clientX - r.left - this.w / 2) / m.scale, (this.h / 2 - (e.clientY - r.top)) / m.scale);
        });
        this.canvas.addEventListener('keydown', (e) => {
            const k = e.shiftKey ? 1 : 0.25;
            let [x, y] = this.p0;
            if (e.key === 'ArrowRight') x += k; else if (e.key === 'ArrowLeft') x -= k;
            else if (e.key === 'ArrowUp') y += k; else if (e.key === 'ArrowDown') y -= k;
            else return;
            e.preventDefault();
            this.setStart(x, y);
        });
    }

    metrics() {
        const scale = (this.h - 12) / (2 * LOSS_RANGE);
        return { scale, xr: this.w / 2 / scale };
    }
    setStart(x, y) {
        const m = this.metrics();
        this.p0 = [clamp(x, -m.xr, m.xr), clamp(y, -LOSS_RANGE, LOSS_RANGE)];
        this.restart();
    }
    applyParams() {
        for (const o of this.opts) o.opt.setParams(Math.pow(10, this.logEta), this.beta);
        this.dirty = true;
    }

    reset() {
        for (const o of this.opts) { o.opt.setParams(Math.pow(10, this.logEta), this.beta); o.opt.reset(this.p0[0], this.p0[1]); }
        this.acc = 0;
    }
    run(n) { for (const o of this.opts) for (let i = 0; i < n; i++) if (!o.opt.step()) break; }
    poster() { this.run(400); }
    advance(dt) {
        this.acc += dt * 150;                           // 150 optimizer steps per second
        const n = Math.min(40, Math.floor(this.acc));
        this.acc -= n;
        this.run(n);
    }
    stepOnce() { this.run(10); }

    onResize() { this.bgKey = ''; }

    // The landscape is drawn once per size into an offscreen canvas: a soft colour field plus √2-spaced contour lines.
    buildBackground() {
        const key = this.w + 'x' + this.h;
        if (key === this.bgKey) return;
        this.bgKey = key;
        const C = this.C, w = this.w, h = this.h, m = this.metrics();
        const cell = 3, nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1;
        const F = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[j * nx + i] = S.himmelblau((i * cell - w / 2) / m.scale, (h / 2 - j * cell) / m.scale);

        const bg = this.bg;
        bg.width = w; bg.height = h;
        const g = bg.getContext('2d');
        g.clearRect(0, 0, w, h);

        // colour field at cell resolution, smoothly scaled up
        const small = document.createElement('canvas'); small.width = nx; small.height = ny;
        const sg = small.getContext('2d'), img = sg.createImageData(nx, ny);
        const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
        const lo = rgb(C.cyan), mid = [24, 38, 78], hi = [12, 16, 32];     // glowing valleys → navy slopes → near-black ridges
        const top = Math.log10(1 + 1500);
        for (let k = 0; k < F.length; k++) {
            const t = clamp(Math.log10(1 + F[k]) / top, 0, 1);
            let c, a;
            if (t < 0.4) { const u = t / 0.4; c = [0, 1, 2].map((q) => lo[q] + (mid[q] - lo[q]) * u); a = 0.4 + (0.55 - 0.4) * u; }
            else { const u = (t - 0.4) / 0.6; c = [0, 1, 2].map((q) => mid[q] + (hi[q] - mid[q]) * u); a = 0.55 + 0.1 * u; }
            img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = a * 255;
        }
        sg.putImageData(img, 0, 0);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(small, 0, 0, nx, ny, 0, 0, nx * cell, ny * cell);

        // contours by marching squares
        g.lineWidth = 1; g.lineCap = 'round';
        for (let q = 0; q <= 28; q++) {
            const lv = 0.25 * Math.pow(2, q / 2);
            g.strokeStyle = rgba(C.text, q % 4 === 0 ? 0.42 : 0.17);
            g.beginPath();
            for (let j = 0; j < ny - 1; j++) {
                for (let i = 0; i < nx - 1; i++) {
                    const a = F[j * nx + i], b = F[j * nx + i + 1], c = F[(j + 1) * nx + i + 1], d = F[(j + 1) * nx + i];
                    const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
                    if (idx === 0 || idx === 15) continue;
                    const x0 = i * cell, y0 = j * cell;
                    const T = [x0 + (cell * (lv - a)) / (b - a), y0];
                    const R = [x0 + cell, y0 + (cell * (lv - b)) / (c - b)];
                    const B = [x0 + (cell * (lv - d)) / (c - d), y0 + cell];
                    const L = [x0, y0 + (cell * (lv - a)) / (d - a)];
                    const seg = (p, r) => { g.moveTo(p[0], p[1]); g.lineTo(r[0], r[1]); };
                    switch (idx) {
                        case 1: case 14: seg(L, B); break;
                        case 2: case 13: seg(B, R); break;
                        case 3: case 12: seg(L, R); break;
                        case 4: case 11: seg(T, R); break;
                        case 5: seg(T, L); seg(B, R); break;
                        case 6: case 9: seg(T, B); break;
                        case 7: case 8: seg(T, L); break;
                        case 10: seg(T, R); seg(L, B); break;
                        default: break;
                    }
                }
            }
            g.stroke();
        }
    }

    draw(g, w, h) {
        const C = this.C, m = this.metrics();
        this.buildBackground();
        g.drawImage(this.bg, 0, 0, w, h);
        const tx = (x) => w / 2 + m.scale * x, ty = (y) => h / 2 - m.scale * y;

        // the four minima
        g.font = this.font(10, 500); g.textAlign = 'left'; g.textBaseline = 'middle';
        S.HIMMELBLAU_MINIMA.forEach((p, i) => {
            const x = tx(p[0]), y = ty(p[1]);
            g.strokeStyle = C.text; g.lineWidth = 1.2; g.beginPath();
            g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
            g.fillStyle = C.text; g.fillText(LOSS_MIN_LABELS[i], x + 7, y - 7);
        });

        // paths
        g.lineJoin = 'round'; g.lineCap = 'round';
        for (const o of this.opts) {
            const P = o.opt.path;
            g.strokeStyle = o.color; g.lineWidth = 1.6; g.globalAlpha = 0.9; g.beginPath();
            for (let i = 0; i < P.length; i += 2) { const px = tx(P[i]), py = ty(P[i + 1]); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
            g.stroke(); g.globalAlpha = 1;
        }
        // heads (drawn after so they sit on top), then the start marker
        for (const o of this.opts) {
            const x = tx(o.opt.x), y = ty(o.opt.y);
            if (!isFinite(x) || !isFinite(y)) continue;
            g.fillStyle = o.color; g.strokeStyle = C.bg; g.lineWidth = 1.5;
            g.beginPath(); g.arc(clamp(x, -10, w + 10), clamp(y, -10, h + 10), 4.2, 0, 6.2832); g.fill(); g.stroke();
        }
        const sx = tx(this.p0[0]), sy = ty(this.p0[1]);
        g.strokeStyle = C.text; g.lineWidth = 1.3; g.beginPath(); g.arc(sx, sy, 6, 0, 6.2832); g.stroke();
        g.beginPath(); g.moveTo(sx - 10, sy); g.lineTo(sx - 6, sy); g.moveTo(sx + 6, sy); g.lineTo(sx + 10, sy);
        g.moveTo(sx, sy - 10); g.lineTo(sx, sy - 6); g.moveTo(sx, sy + 6); g.lineTo(sx, sy + 10); g.stroke();

        // legend
        g.font = this.font(10.5, 500); g.textBaseline = 'middle';
        let lx = 10;
        for (const o of this.opts) { g.fillStyle = o.color; g.fillText('● ' + o.name, lx, 13); lx += 22 + o.name.length * 6.6; }
        g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText('click to set start', w - 10, h - 11); g.textAlign = 'left';
    }

    updateReadout() {
        this.opts.forEach((o, i) => {
            const p = o.opt, r = this.rows[i];
            put(r[1], fmtG(p.L)); put(r[2], fmtG(p.gnorm)); put(r[3], String(p.steps));
            let st = 'running';
            if (p.status === 'converged') { const k = p.nearestMinimum(0.3); st = '✓ → ' + (k >= 0 ? LOSS_MIN_LABELS[k] : '?'); }
            else if (p.status === 'diverged') st = '✗ diverged';
            else if (p.status === 'done') st = 'stopped @ ' + p.maxSteps;
            put(r[4], st);
        });
    }
}

/* ================================================================ 5. Particle in a box */

class BoxInstrument extends Instrument {
    constructor(env) {
        super(env, {
            id: 'ins-box', title: 'Particle in a box', caption: 'quanta · a standing wave that sloshes',
            alt: 'The probability density of a particle in an infinite well, an equal mix of two energy states, sloshing between the walls.',
            hint: 'An equal mix of states n₁ and n₂. The density sloshes because the two phases drift apart. Time is slowed so one period lasts 3 s.',
            math: MATH.box,
        });
        this.n1 = 1; this.n2 = 2;
        this.t = 0;
        this.sn1 = this.addSlider({ key: 'n1', label: 'n₁', min: 1, max: 8, step: 1, value: this.n1, fmt: (v) => String(v), onInput: (v) => { this.n1 = v; this.restart(); } });
        this.sn2 = this.addSlider({ key: 'n2', label: 'n₂', min: 1, max: 8, step: 1, value: this.n2, fmt: (v) => String(v), onInput: (v) => { this.n2 = v; this.restart(); } });

        this.addReadout('E', 'E₁ · E₂');
        this.addReadout('dE', 'ΔE · period T');
        this.addReadout('mx', '⟨x⟩ now', 'amber');
        this.addReadout('norm', '∫|Ψ|² dx');
        this.ymax = 2;
    }

    reset() {
        this.t = 0;
        this.ymax = Math.max(2, S.boxDensityMax(this.n1, this.n2));
    }
    get period() { return S.boxPeriod(this.n1, this.n2); }
    advance(dt) {
        const T = this.period;
        this.t += dt * (isFinite(T) ? T / 3 : 0.25);
        if (isFinite(T) && this.t > 1000 * T) this.t %= T;
    }
    stepOnce() { const T = this.period; this.t += isFinite(T) ? T / 12 : 0.05; }

    draw(g, w, h) {
        const C = this.C, n1 = this.n1, n2 = this.n2, t = this.t;
        const X0 = 28, X1 = w - 28, top = 44, base = h - 30;
        const tx = (x) => X0 + (X1 - X0) * x;
        const ty = (d) => base - ((base - top) * d) / (this.ymax * 1.08);

        // walls
        g.fillStyle = rgba(C.text, 0.85);
        g.fillRect(X0 - 3, top - 14, 3, base - top + 14); g.fillRect(X1, top - 14, 3, base - top + 14);
        g.font = this.font(9.5); g.fillStyle = C.muted; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.textAlign = 'left'; g.fillText('V = ∞', 4, top - 16);
        g.textAlign = 'right'; g.fillText('V = ∞', w - 4, top - 16);
        g.textAlign = 'center';
        // floor and ticks
        g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(X0, base + 0.5); g.lineTo(X1, base + 0.5); g.stroke();
        for (const [x, lab] of [[0, '0'], [0.5, 'L/2'], [1, 'L']]) {
            g.beginPath(); g.moveTo(tx(x), base); g.lineTo(tx(x), base + 4); g.stroke();
            g.fillText(lab, tx(x), base + 16);
        }

        const curve = (fn) => { g.beginPath(); for (let i = 0; i <= 240; i++) { const x = i / 240; const y = ty(fn(x)); if (i) g.lineTo(tx(x), y); else g.moveTo(tx(x), y); } };

        // the two states on their own (dashed)
        g.setLineDash([4, 4]); g.lineWidth = 1.2; g.globalAlpha = 0.65;
        g.strokeStyle = C.rose; curve((x) => S.boxPsi(n1, x) ** 2); g.stroke();
        if (n2 !== n1) { g.strokeStyle = C.amber; curve((x) => S.boxPsi(n2, x) ** 2); g.stroke(); }
        g.setLineDash([]); g.globalAlpha = 1;

        // density
        curve((x) => S.boxDensity(n1, n2, x, t));
        g.lineTo(tx(1), base); g.lineTo(tx(0), base); g.closePath();
        g.fillStyle = rgba(C.cyan, 0.2); g.fill();
        curve((x) => S.boxDensity(n1, n2, x, t));
        g.strokeStyle = C.cyan; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();

        // mean position
        const mx = S.boxMeanX(n1, n2, t);
        g.strokeStyle = rgba(C.text, 0.5); g.setLineDash([2, 4]); g.beginPath(); g.moveTo(tx(mx), top); g.lineTo(tx(mx), base); g.stroke(); g.setLineDash([]);
        g.fillStyle = C.text; g.beginPath(); g.moveTo(tx(mx), base - 1); g.lineTo(tx(mx) - 5, base + 8); g.lineTo(tx(mx) + 5, base + 8); g.closePath(); g.fill();

        // legend
        g.font = this.font(10.5, 500); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillStyle = C.cyan; g.fillText('— |Ψ|²', X0 + 6, 11);
        g.fillStyle = C.rose; g.fillText('- - ψ' + sub(n1) + '²', X0 + 70, 11);
        if (n2 !== n1) { g.fillStyle = C.amber; g.fillText('- - ψ' + sub(n2) + '²', X0 + 128, 11); }
        g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText('t = ' + t.toFixed(3), X1, 11); g.textAlign = 'left';
    }

    updateReadout() {
        const n1 = this.n1, n2 = this.n2, t = this.t, T = this.period;
        put(this.rd.E, S.boxEnergy(n1).toFixed(3) + ' · ' + S.boxEnergy(n2).toFixed(3));
        put(this.rd.dE, n1 === n2 ? '0 · stationary' : Math.abs(S.boxEnergy(n2) - S.boxEnergy(n1)).toFixed(3) + ' · ' + T.toFixed(4));
        put(this.rd.mx, S.boxMeanX(n1, n2, t).toFixed(4) + ((n1 + n2) % 2 === 0 || n1 === n2 ? ' (fixed)' : ''));
        put(this.rd.norm, S.boxNorm(n1, n2, t).toFixed(4));
    }
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
function sub(n) { return String(n).split('').map((d) => SUB[+d]).join(''); }

/* ================================================================ init */

export function init(root, ctx) {
    const el = root || document.getElementById('instruments');
    if (!el) return null;
    if (el.__instruments) return el.__instruments;

    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    ctx = ctx || { isCalm: () => !!(mq && mq.matches), isReduced: () => !!(mq && mq.matches) };

    injectStyle();
    el.querySelectorAll('.ins-loading').forEach((n) => n.remove());      // the "calibrating" placeholder from the HTML
    const C = readPalette();
    let raf = 0, timer = 0, last = 0, list = [], disposed = false;

    const frame = (now) => {
        raf = 0;
        if (disposed) return;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        const calm = !!ctx.isCalm();
        let visible = false, busy = false;
        for (const ins of list) {
            if (!ins.onScreen) continue;
            visible = true;
            ins.setCalm(calm);
            if (ins.running()) { ins.advance(dt); ins.dirty = true; }
            if (ins.dirty) { ins.render(); }
            if (ins.running() || ins.dirty) busy = true;
        }
        if (visible && !document.hidden) {
            if (busy) raf = requestAnimationFrame(frame);
            else { last = 0; timer = setTimeout(kick, 250); }     // idle: keep an eye on the global Pause without burning frames
        } else last = 0;
    };
    const kick = () => {
        clearTimeout(timer); timer = 0;
        if (!raf && !disposed && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
    };
    const env = { C, ctx, kick };

    list = [new LorenzInstrument(env), new PendulumInstrument(env), new KeplerInstrument(env), new LossInstrument(env), new BoxInstrument(env)];
    for (const ins of list) el.append(ins.root);

    const ro = 'ResizeObserver' in window ? new ResizeObserver((entries) => {
        for (const en of entries) { const ins = list.find((x) => x.canvas === en.target); if (ins) { ins.resize(); if (ins.onScreen) kick(); } }
    }) : null;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
        for (const en of entries) { const ins = list.find((x) => x.root === en.target); if (ins) { ins.resize(); ins.setVisible(en.isIntersecting); } }
    }, { rootMargin: '80px' }) : null;
    for (const ins of list) {
        if (ro) ro.observe(ins.canvas);
        if (io) io.observe(ins.root);
        else { ins.resize(); ins.setVisible(true); }
    }

    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    if (mq) { try { mq.addEventListener('change', kick); } catch (e) { try { mq.addListener(kick); } catch (e2) { /* ignore */ } } }

    const api = {
        root: el, ctx, instruments: list,
        dispose() {
            disposed = true;
            cancelAnimationFrame(raf); clearTimeout(timer);
            if (io) io.disconnect(); if (ro) ro.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            for (const ins of list) ins.root.remove();
            delete el.__instruments;
        },
    };
    el.__instruments = api;
    return api;
}
