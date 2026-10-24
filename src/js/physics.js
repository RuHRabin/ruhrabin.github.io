// FILE: js/physics.js
// Pure math: no Three.js, no DOM. Units: Schwarzschild radius rs = 1.

export const TAU = Math.PI * 2;
export const MIN_R = 1.6;                      // camera floor, in rs
export const A_MIN = 8;                        // innermost orbit radius, in rs
export const A_SPAN = 20;
export const DAYS_MAX = 270;
export const T_AT_A_MIN = 45;                  // seconds per orbit at a = 8
export const K_KEPLER = (TAU / T_AT_A_MIN) * Math.pow(A_MIN, 1.5);   // n = K * a^(-3/2): Kepler's third law
export const BLINK_BASE_HZ = 0.9;
export const SHADOW_B = 1.5 * Math.sqrt(3);    // critical impact parameter 3*sqrt(3)/2 = 2.598 rs

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const logLerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));

// Deterministic hash of a string to [0, 1): FNV-1a plus a murmur-style finaliser. No Math.random anywhere.
export function hash01(str, salt = 0) {
    let x = (2166136261 ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        x ^= s.charCodeAt(i);
        x = Math.imul(x, 16777619) >>> 0;
    }
    x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0;
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
}

export function daysSince(iso, nowMs = Date.now()) {
    const t = Date.parse(iso);
    return isFinite(t) ? Math.max(0, (nowMs - t) / 86400000) : null;
}

// Recently touched work orbits deep; old work drifts outward (log scale, 0..270 days).
export function orbitRadius(days) {
    const t = clamp(Math.log10(1 + days) / Math.log10(1 + DAYS_MAX), 0, 1);
    return A_MIN + A_SPAN * t;
}

// Kepler's equation M = E - e sin E, Newton-Raphson, 8 iterations, start E = M.
export function solveKepler(M, e) {
    M -= TAU * Math.floor((M + Math.PI) / TAU);      // wrap to [-pi, pi)
    let E = M;
    for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
}

// days may be null (unknown): then a hash-based placeholder radius is used and el.placeholder is true.
// h4 (extra, not in the brief) sets the orbit's orientation about the Y axis so periapses do not all point the same way.
export function orbitElements(name, days) {
    const h1 = hash01(name, 1), h2 = hash01(name, 2), h3 = hash01(name, 3), h4 = hash01(name, 4);
    const known = Number.isFinite(days);
    const d = known ? Math.max(0, days) : hash01(name, 5) * DAYS_MAX;
    const a = orbitRadius(d);
    const e = 0.05 + 0.30 * h1;
    const n = K_KEPLER * Math.pow(a, -1.5);
    return {
        a, e, inc: (h2 - 0.5) * 0.7, M0: TAU * h3, n, node: TAU * h4,
        b: a * Math.sqrt(1 - e * e), period: TAU / n, days: d, placeholder: !known,
    };
}

// Point on the orbit for eccentric anomaly E. The hole sits at the focus. Orbit plane = XZ plane tilted about X by inc.
export function orbitPoint(el, E, out) {
    const u = el.a * (Math.cos(E) - el.e);
    const v = el.b * Math.sin(E);
    const y0 = v * Math.sin(el.inc), z0 = v * Math.cos(el.inc);
    const cn = Math.cos(el.node), sn = Math.sin(el.node);
    out.x = u * cn + z0 * sn;
    out.y = y0;
    out.z = -u * sn + z0 * cn;
    return out;
}

export function keplerPosition(el, t, out) {
    return orbitPoint(el, solveKepler(el.M0 + el.n * t, el.e), out);
}

// Static-observer gravitational time dilation: Earth time runs gamma times faster than yours.
export function gamma(r) {
    return 1 / Math.sqrt(Math.max(1 - 1 / Math.max(r, 1.0001), 1e-4));
}

// Clocks deeper in the well tick slower seen from far away: blink rate = base / gamma(a).
export function blinkHz(a) { return BLINK_BASE_HZ / gamma(a); }

export function bodyRadius(stars) {
    return 0.25 + 0.3 * Math.log2(1 + Math.max(0, stars || 0));
}

// Weak-field deflection angle alpha = 2 rs / b, clamped to 0.8 rad (the formula breaks down below b of about 3 rs).
export function deflection(b) {
    return Math.min(2 / Math.max(b, 1e-6), 0.8);
}

// Approximate weak-field lensing for a body (cam, body: {x,y,z}; out gets x,y,z, hidden, lensed, b).
// (1) hidden if the body is behind the hole and its straight line of sight passes within b < 1.3 rs.
// (2) otherwise, if behind the hole, the apparent direction is pushed away from the hole using the thin-lens
//     relation beta = theta - alpha(theta) * Dls / Ds with alpha = 2 rs / b (clamped), keeping the camera distance.
export function lensBody(cam, body, out) {
    out.x = body.x; out.y = body.y; out.z = body.z;
    out.hidden = false; out.lensed = false; out.b = Infinity;
    const dx = body.x - cam.x, dy = body.y - cam.y, dz = body.z - cam.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return out;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const s = -(cam.x * ux + cam.y * uy + cam.z * uz);      // distance along the sight line to the point nearest the hole
    if (s <= 0 || s >= L) return out;                        // hole is not between camera and body
    const b = Math.hypot(cam.x + ux * s, cam.y + uy * s, cam.z + uz * s);
    out.b = b;
    if (b < 1.3) { out.hidden = true; return out; }
    const Dl = Math.hypot(cam.x, cam.y, cam.z);
    const hx = -cam.x / Dl, hy = -cam.y / Dl, hz = -cam.z / Dl;   // unit vector camera -> hole
    const cosB = clamp(ux * hx + uy * hy + uz * hz, -1, 1);
    const beta = Math.acos(cosB);
    const Ds = L * cosB, Dls = Ds - Dl;
    if (Dls <= 1e-4) return out;
    let theta = 0.5 * (beta + Math.sqrt(beta * beta + 8 * Dls / (Dl * Ds)));   // thetaE^2 = 2 Dls / (Dl Ds)
    theta = Math.min(theta, beta + deflection(Dl * Math.sin(Math.min(theta, 1.5))) * Dls / Ds);
    if (Dl * Math.sin(Math.min(theta, 1.5)) < SHADOW_B) { out.hidden = true; return out; }   // image would sit inside the shadow
    let tx = ux - cosB * hx, ty = uy - cosB * hy, tz = uz - cosB * hz;
    const tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-6) { out.hidden = true; return out; }
    tx /= tl; ty /= tl; tz /= tl;
    const c = Math.cos(theta), sn = Math.sin(theta);
    out.x = cam.x + L * (c * hx + sn * tx);
    out.y = cam.y + L * (c * hy + sn * ty);
    out.z = cam.z + L * (c * hz + sn * tz);
    out.lensed = true;
    return out;
}

// Camera position from distance r, elevation above the disk plane and azimuth.
export function cameraPose(r, pitch, azim, out) {
    const cp = Math.cos(pitch);
    out.x = r * cp * Math.sin(azim);
    out.y = r * Math.sin(pitch);
    out.z = r * cp * Math.cos(azim);
    return out;
}

// Point to look at: aim at `aim`, then turn the view by `shift` rad about the camera's up axis
// (+ turns left, so the aimed object moves to the right of the screen).
export function gazeTarget(pos, aim, shift, out) {
    let fx = aim.x - pos.x, fy = aim.y - pos.y, fz = aim.z - pos.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    let ux = -fy * fx, uy = 1 - fy * fy, uz = -fy * fz;
    const ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-6) { ux = 0; uy = 0; uz = 1; } else { ux /= ul; uy /= ul; uz /= ul; }
    const cx = uy * fz - uz * fy, cy = uz * fx - ux * fz, cz = ux * fy - uy * fx;   // up x forward
    const c = Math.cos(shift), s = Math.sin(shift);
    out.x = pos.x + fx * c + cx * s;
    out.y = pos.y + fy * c + cy * s;
    out.z = pos.z + fz * c + cz * s;
    return out;
}
