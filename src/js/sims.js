// FILE: js/sims.js
// Pure physics for the ∂ Instruments station. No DOM, no Three.js, no Math.random: every run is reproducible.
// instruments.js draws it; tests.html checks it.

export const TAU = Math.PI * 2;

/* ================================================================
   1. Lorenz system, two twins, RK4
   ================================================================ */

export const LORENZ = Object.freeze({ sigma: 10, rho: 28, beta: 8 / 3 });
export const LORENZ_DT = 0.005;
export const LORENZ_LYAPUNOV = 0.906;      // largest Lyapunov exponent of the classic parameters (literature value)

export function lorenzDeriv(s, out, p = LORENZ) {
    out[0] = p.sigma * (s[1] - s[0]);
    out[1] = s[0] * (p.rho - s[2]) - s[1];
    out[2] = s[0] * s[1] - p.beta * s[2];
    return out;
}

// One classical RK4 step, in place on s = [x, y, z]. Written out by hand so a frame allocates nothing.
export function lorenzStep(s, dt = LORENZ_DT, p = LORENZ) {
    const sg = p.sigma, rho = p.rho, be = p.beta;
    const x = s[0], y = s[1], z = s[2];
    const h2 = dt / 2;

    const ax = sg * (y - x), ay = x * (rho - z) - y, az = x * y - be * z;
    const x2 = x + h2 * ax, y2 = y + h2 * ay, z2 = z + h2 * az;
    const bx = sg * (y2 - x2), by = x2 * (rho - z2) - y2, bz = x2 * y2 - be * z2;
    const x3 = x + h2 * bx, y3 = y + h2 * by, z3 = z + h2 * bz;
    const cx = sg * (y3 - x3), cy = x3 * (rho - z3) - y3, cz = x3 * y3 - be * z3;
    const x4 = x + dt * cx, y4 = y + dt * cy, z4 = z + dt * cz;
    const dx = sg * (y4 - x4), dy = x4 * (rho - z4) - y4, dz = x4 * y4 - be * z4;

    const k = dt / 6;
    s[0] = x + k * (ax + 2 * bx + 2 * cx + dx);
    s[1] = y + k * (ay + 2 * by + 2 * cy + dy);
    s[2] = z + k * (az + 2 * bz + 2 * cz + dz);
    return s;
}

let _lorenzStart = null;
// A point already on the attractor: start at (1,1,1) and let the transient die for 20 time units.
export function lorenzAttractorStart() {
    if (!_lorenzStart) {
        const s = new Float64Array([1, 1, 1]);
        for (let i = 0; i < 4000; i++) lorenzStep(s, LORENZ_DT);
        _lorenzStart = s;
    }
    return Float64Array.from(_lorenzStart);
}

// Twin A and twin B. B starts `offset` away from A. Tracks |A−B| and a least-squares growth rate of ln|A−B|.
export class LorenzTwin {
    constructor(opts = {}) {
        this.p = opts.params || LORENZ;
        this.dt = opts.dt || LORENZ_DT;
        this.sampleEvery = 10;                       // steps between samples (0.05 time units)
        this.fitFrom = 1.0;                          // skip the first time unit: B has to line up with the unstable direction
        this.fitBelow = 1.0;                         // the "early phase" ends when |A−B| reaches 1 (still small next to the attractor)
        this.start = opts.start ? Float64Array.from(opts.start) : lorenzAttractorStart();
        this.reset(opts.offset || [1e-3, 0, 0]);
    }

    reset(offset = this.offset) {
        this.offset = [offset[0], offset[1], offset[2]];
        this.a = Float64Array.from(this.start);
        this.b = new Float64Array([this.a[0] + this.offset[0], this.a[1] + this.offset[1], this.a[2] + this.offset[2]]);
        this.steps = 0;
        this.t = 0;
        this.sep0 = this.separation();
        this.hist = { t: [0], ln: [Math.log(this.sep0)] };
        this._n = 0; this._sx = 0; this._sy = 0; this._sxx = 0; this._sxy = 0;
        this._fitT0 = null; this._fitT1 = null; this._closed = false;
        return this;
    }

    separation() {
        const dx = this.a[0] - this.b[0], dy = this.a[1] - this.b[1], dz = this.a[2] - this.b[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    step(n = 1) {
        for (let i = 0; i < n; i++) {
            lorenzStep(this.a, this.dt, this.p);
            lorenzStep(this.b, this.dt, this.p);
            this.steps++;
            if (this.steps % this.sampleEvery === 0) this._sample();
        }
        this.t = this.steps * this.dt;
        return this;
    }

    _sample() {
        const t = this.steps * this.dt;
        const d = this.separation();
        const ln = Math.log(d);
        const H = this.hist;
        H.t.push(t); H.ln.push(ln);
        if (H.t.length > 6000) { H.t.splice(0, 2000); H.ln.splice(0, 2000); }
        if (!this._closed && t >= this.fitFrom) {
            if (d < this.fitBelow) {
                if (this._fitT0 === null) this._fitT0 = t;
                this._fitT1 = t;
                this._n++; this._sx += t; this._sy += ln; this._sxx += t * t; this._sxy += t * ln;
            } else if (this._n > 0) {
                this._closed = true;                 // the window ends the first time |A−B| reaches 1
            }
        }
    }

    // Slope of ln|A−B| against t over the early phase. null until there are at least 10 samples (0.5 time units).
    lyapunovEstimate() {
        const n = this._n;
        if (n < 10) return null;
        const den = n * this._sxx - this._sx * this._sx;
        if (!(den > 0)) return null;
        return { rate: (n * this._sxy - this._sx * this._sy) / den, t0: this._fitT0, t1: this._fitT1, n, closed: this._closed };
    }
}

/* ================================================================
   2. Double pendulum, Lagrangian equations, RK4
   state s = [θ1, θ2, ω1, ω2], θ measured from straight down
   ================================================================ */

export const PENDULUM = Object.freeze({ m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 });
export const PENDULUM_DT = 0.001;

// Euler–Lagrange equations of L = T − V for the double pendulum (standard closed form).
export function pendulumDeriv(s, out, p = PENDULUM) {
    const { m1, m2, l1, l2, g } = p;
    const t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3];
    const d = t1 - t2, sd = Math.sin(d), cd = Math.cos(d);
    const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
    out[0] = w1;
    out[1] = w2;
    out[2] = (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2)
              - 2 * sd * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * cd)) / (l1 * den);
    out[3] = (2 * sd * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * cd)) / (l2 * den);
    return out;
}

const _pk1 = new Float64Array(4), _pk2 = new Float64Array(4), _pk3 = new Float64Array(4), _pk4 = new Float64Array(4), _pt = new Float64Array(4);

export function pendulumStep(s, dt = PENDULUM_DT, p = PENDULUM) {
    pendulumDeriv(s, _pk1, p);
    for (let i = 0; i < 4; i++) _pt[i] = s[i] + 0.5 * dt * _pk1[i];
    pendulumDeriv(_pt, _pk2, p);
    for (let i = 0; i < 4; i++) _pt[i] = s[i] + 0.5 * dt * _pk2[i];
    pendulumDeriv(_pt, _pk3, p);
    for (let i = 0; i < 4; i++) _pt[i] = s[i] + dt * _pk3[i];
    pendulumDeriv(_pt, _pk4, p);
    for (let i = 0; i < 4; i++) s[i] += (dt / 6) * (_pk1[i] + 2 * _pk2[i] + 2 * _pk3[i] + _pk4[i]);
    return s;
}

// Total energy E = T + V (V = 0 at the pivot height).
export function pendulumEnergy(s, p = PENDULUM) {
    const { m1, m2, l1, l2, g } = p;
    const t1 = s[0], t2 = s[1], w1 = s[2], w2 = s[3];
    const T = 0.5 * (m1 + m2) * l1 * l1 * w1 * w1 + 0.5 * m2 * l2 * l2 * w2 * w2 + m2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2);
    const V = -(m1 + m2) * g * l1 * Math.cos(t1) - m2 * g * l2 * Math.cos(t2);
    return T + V;
}

export function pendulumEnergyScale(p = PENDULUM) {
    return (p.m1 + p.m2) * p.g * p.l1 + p.m2 * p.g * p.l2;     // |V| at its extreme: a natural yardstick
}

// |E − E0| / |E0|. If E0 happens to be almost exactly 0 the ratio is meaningless, so the denominator
// is floored at 1% of the energy scale. For any ordinary start this is exactly the relative error.
export function relativeEnergyError(E, E0, p = PENDULUM) {
    return Math.abs(E - E0) / Math.max(Math.abs(E0), 0.01 * pendulumEnergyScale(p));
}

// Bob positions, y pointing down. Returns [x1, y1, x2, y2].
export function pendulumTips(s, p = PENDULUM) {
    const x1 = p.l1 * Math.sin(s[0]), y1 = p.l1 * Math.cos(s[0]);
    return [x1, y1, x1 + p.l2 * Math.sin(s[1]), y1 + p.l2 * Math.cos(s[1])];
}

// Two copies of the same pendulum, B nudged by `delta` rad in θ1. Both released from rest.
export class PendulumPair {
    constructor(th1 = 2.0, th2 = 1.5, delta = 1e-3, p = PENDULUM) {
        this.p = p; this.dt = PENDULUM_DT;
        this.reset(th1, th2, delta);
    }
    reset(th1 = this.th1, th2 = this.th2, delta = this.delta) {
        this.th1 = th1; this.th2 = th2; this.delta = delta;
        this.a = new Float64Array([th1, th2, 0, 0]);
        this.b = new Float64Array([th1 + delta, th2, 0, 0]);
        this.E0a = pendulumEnergy(this.a, this.p);
        this.E0b = pendulumEnergy(this.b, this.p);
        this.steps = 0; this.t = 0;
        return this;
    }
    step(n = 1) {
        for (let i = 0; i < n; i++) { pendulumStep(this.a, this.dt, this.p); pendulumStep(this.b, this.dt, this.p); }
        this.steps += n; this.t = this.steps * this.dt;
        return this;
    }
    errA() { return relativeEnergyError(pendulumEnergy(this.a, this.p), this.E0a, this.p); }
    errB() { return relativeEnergyError(pendulumEnergy(this.b, this.p), this.E0b, this.p); }
    tipSeparation() {
        const A = pendulumTips(this.a, this.p), B = pendulumTips(this.b, this.p);
        return Math.hypot(A[2] - B[2], A[3] - B[3]);
    }
}

/* ================================================================
   3. Kepler orbit: Newton–Raphson for M = E − e sin E
   Units: GM = 1, semi-major axis a = 1, period 2π. Focus at the origin, periapsis on +x.
   ================================================================ */

export const KEPLER_WEDGES = 12;

// Solve M = E − e·sin(E) for E by Newton–Raphson. Accepts any M, returns E on the same branch (E − M is 2π-periodic).
export function solveKepler(M, e, tol = 1e-14) {
    const k = Math.floor((M + Math.PI) / TAU);
    const m = M - k * TAU;                                      // [−π, π)
    let E = e < 0.8 ? m : (m < 0 ? -Math.PI : Math.PI);         // π is a safe start for high e
    for (let i = 0; i < 60; i++) {
        const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
        E -= dE;
        if (Math.abs(dE) < tol) break;
    }
    return E + k * TAU;
}

export function keplerPosition(E, e, a = 1) {
    return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E)];
}

// Distance and speed from the focus (vis-viva, GM = 1).
export function keplerRV(E, e, a = 1) {
    const r = a * (1 - e * Math.cos(E));
    return { r, v: Math.sqrt(Math.max(0, 2 / r - 1 / a)) };
}

// Area swept from the focus between eccentric anomalies E0 → E1, measured geometrically:
// the ellipse is cut into thin triangles at the focus and their areas are added (shoelace).
// It does not use Kepler's second law, so equal wedges are something to check, not something assumed.
export function sweptArea(e, E0, E1, a = 1, n = 0) {
    const b = a * Math.sqrt(1 - e * e);
    if (!n) n = Math.max(8, Math.ceil(Math.abs(E1 - E0) / 0.004));
    let px = a * (Math.cos(E0) - e), py = b * Math.sin(E0), area = 0;
    for (let i = 1; i <= n; i++) {
        const E = E0 + ((E1 - E0) * i) / n;
        const x = a * (Math.cos(E) - e), y = b * Math.sin(E);
        area += px * y - x * py;
        px = x; py = y;
    }
    return area / 2;
}

// N wedges of equal TIME (mean anomaly M = 2πk/N from periapsis). Returns the boundaries and each wedge's area.
export function keplerWedges(e, N = KEPLER_WEDGES, a = 1) {
    const E = [], areas = [];
    for (let k = 0; k <= N; k++) E.push(solveKepler((TAU * k) / N, e));
    for (let k = 0; k < N; k++) areas.push(sweptArea(e, E[k], E[k + 1], a, 600));
    const b = a * Math.sqrt(1 - e * e);
    return { E, areas, expected: (Math.PI * a * b) / N, N };
}

/* ================================================================
   4. Himmelblau loss landscape and three optimizers
   ================================================================ */

export const HIMMELBLAU_MINIMA = Object.freeze([
    [3, 2],
    [-2.805118086952745, 3.131312518250573],
    [-3.779310253377747, -3.283185991286170],
    [3.584428340330492, -1.848126526964404],
]);

export function himmelblau(x, y) {
    const a = x * x + y - 11, b = x + y * y - 7;
    return a * a + b * b;
}

// Analytic gradient: ∂L/∂x = 4x(x²+y−11) + 2(x+y²−7), ∂L/∂y = 2(x²+y−11) + 4y(x+y²−7)
export function himmelblauGrad(x, y, out = [0, 0]) {
    const a = x * x + y - 11, b = x + y * y - 7;
    out[0] = 4 * x * a + 2 * b;
    out[1] = 2 * a + 4 * y * b;
    return out;
}

// Central finite difference, used only to check the analytic gradient.
export function finiteDiffGrad(f, x, y, h = 1e-4, out = [0, 0]) {
    out[0] = (f(x + h, y) - f(x - h, y)) / (2 * h);
    out[1] = (f(x, y + h) - f(x, y - h)) / (2 * h);
    return out;
}

// kind: 'sgd' | 'momentum' | 'adam'. `beta` is the momentum coefficient (and Adam's β1); Adam's β2 = 0.999.
//   sgd       θ ← θ − η g
//   momentum  v ← β v − η g ;  θ ← θ + v
//   adam      m ← β1 m + (1−β1) g ; s ← β2 s + (1−β2) g² ; θ ← θ − η m̂ / (√ŝ + ε)   (bias-corrected m̂, ŝ)
export class Optimizer {
    constructor(kind, x, y, opts = {}) {
        this.kind = kind;
        this.eta = opts.eta ?? 0.01;
        this.beta = opts.beta ?? 0.9;
        this.beta2 = opts.beta2 ?? 0.999;
        this.eps = 1e-8;
        this.maxSteps = opts.maxSteps ?? 4000;
        this.tol = opts.tol ?? 1e-6;
        this.reset(x, y);
    }

    setParams(eta, beta) { this.eta = eta; this.beta = beta; }

    reset(x, y) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0; this.mx = 0; this.my = 0; this.sx = 0; this.sy = 0;
        this.steps = 0;
        this.status = 'running';                      // running | converged | diverged | done
        this.path = [x, y];
        this._eval();
        if (this.gnorm < this.tol) this.status = 'converged';
    }

    _eval() {
        this.L = himmelblau(this.x, this.y);
        const a = this.x * this.x + this.y - 11, b = this.x + this.y * this.y - 7;
        this.gx = 4 * this.x * a + 2 * b;
        this.gy = 2 * a + 4 * this.y * b;
        this.gnorm = Math.hypot(this.gx, this.gy);
    }

    step() {
        if (this.status !== 'running') return false;
        const gx = this.gx, gy = this.gy, eta = this.eta;
        if (this.kind === 'sgd') {
            this.x -= eta * gx; this.y -= eta * gy;
        } else if (this.kind === 'momentum') {
            this.vx = this.beta * this.vx - eta * gx;
            this.vy = this.beta * this.vy - eta * gy;
            this.x += this.vx; this.y += this.vy;
        } else {
            const t = this.steps + 1, b1 = this.beta, b2 = this.beta2;
            this.mx = b1 * this.mx + (1 - b1) * gx; this.my = b1 * this.my + (1 - b1) * gy;
            this.sx = b2 * this.sx + (1 - b2) * gx * gx; this.sy = b2 * this.sy + (1 - b2) * gy * gy;
            const c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
            this.x -= (eta * (this.mx / c1)) / (Math.sqrt(this.sx / c2) + this.eps);
            this.y -= (eta * (this.my / c1)) / (Math.sqrt(this.sy / c2) + this.eps);
        }
        this.steps++;
        this._eval();
        this.path.push(this.x, this.y);
        if (!isFinite(this.x) || !isFinite(this.y) || !isFinite(this.L) || Math.abs(this.x) > 1e4 || Math.abs(this.y) > 1e4) this.status = 'diverged';
        else if (this.gnorm < this.tol) this.status = 'converged';
        else if (this.steps >= this.maxSteps) this.status = 'done';
        return true;
    }

    // Index of the nearest of the four minima (for colouring the outcome), or −1 if none is within `r`.
    nearestMinimum(r = 0.05) {
        let best = -1, bd = r;
        for (let i = 0; i < HIMMELBLAU_MINIMA.length; i++) {
            const d = Math.hypot(this.x - HIMMELBLAU_MINIMA[i][0], this.y - HIMMELBLAU_MINIMA[i][1]);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
}

/* ================================================================
   5. Particle in an infinite well, ħ = m = L = 1
   ================================================================ */

export const boxEnergy = (n) => (n * n * Math.PI * Math.PI) / 2;
export const boxPsi = (n, x) => Math.SQRT2 * Math.sin(n * Math.PI * x);

// Density of the equal superposition of n1 and n2:
//   |ψ|² = ½ (ψ₁² + ψ₂² + 2 ψ₁ψ₂ cos((E₂−E₁) t))
// If n1 = n2 there is only one state, so it is just ψ_n² (the formula would double-count and give norm 2).
export function boxDensity(n1, n2, x, t) {
    const a = boxPsi(n1, x);
    if (n1 === n2) return a * a;
    const b = boxPsi(n2, x);
    return 0.5 * (a * a + b * b + 2 * a * b * Math.cos((boxEnergy(n2) - boxEnergy(n1)) * t));
}

export const boxPeriod = (n1, n2) => (n1 === n2 ? Infinity : TAU / Math.abs(boxEnergy(n2) - boxEnergy(n1)));

// ⟨x⟩(t) = ½ + X₁₂ cos(ΔE t),  X₁₂ = ∫ x ψ₁ψ₂ dx = −8 n1 n2 / (π² (n1²−n2²)²) when n1+n2 is odd, else 0.
export function boxMeanX(n1, n2, t) {
    if (n1 === n2 || (n1 + n2) % 2 === 0) return 0.5;
    const X = (-8 * n1 * n2) / (Math.PI * Math.PI * Math.pow(n1 * n1 - n2 * n2, 2));
    return 0.5 + X * Math.cos((boxEnergy(n2) - boxEnergy(n1)) * t);
}

// Composite Simpson rule (n even).
export function simpson(f, a, b, n = 400) {
    if (n % 2) n++;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return (s * h) / 3;
}

export const boxNorm = (n1, n2, t) => simpson((x) => boxDensity(n1, n2, x, t), 0, 1, 800);
export const boxMeanXNumeric = (n1, n2, t) => simpson((x) => x * boxDensity(n1, n2, x, t), 0, 1, 800);

// Largest density the superposition ever reaches (cos = ±1), for a fixed vertical scale while it sloshes.
export function boxDensityMax(n1, n2) {
    let m = 0;
    for (let i = 0; i <= 1000; i++) {
        const x = i / 1000, a = boxPsi(n1, x), b = boxPsi(n2, x);
        const hi = n1 === n2 ? a * a : 0.5 * Math.max((a + b) * (a + b), (a - b) * (a - b));
        if (hi > m) m = hi;
    }
    return m;
}
