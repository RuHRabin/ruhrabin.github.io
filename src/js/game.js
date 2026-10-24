// FILE: js/game.js
// The game layer of the 3D view. It adds no content of its own: the "gameplay" is exploring the portfolio.
//   three.js : speed-streaking space dust, checkpoint gates laid along the real camera rail, a 3D target-lock
//              bracket and a scan pulse on projects.
//   rules    : three missions (reach the photon sphere, scan every project, make contact), a rank, saved progress.
//              Opening a project's details counts as scanning it.
//   flight deck: cockpit vignette and pillars, reticle, radar minimap, depth meter, mission bar, toasts.
import * as THREE from 'three';
import { clamp, TAU } from './physics.js';
import { h } from './data.js';

const STORE = 'rabin.game';
const EMAIL = 'rabin@ruhrbin.site';
const CYAN = '#5ce1e6', AMBER = '#ffb454', TEXT = '#d7e3ff';

function load() {
    try {
        const j = JSON.parse(localStorage.getItem(STORE) || '{}');
        return { scanned: Array.isArray(j.scanned) ? j.scanned.filter((x) => typeof x === 'string') : [], best: Number.isFinite(j.best) ? clamp(j.best, 0, 4) : 0 };
    } catch (e) { return { scanned: [], best: 0 }; }
}
function save(s) { try { localStorage.setItem(STORE, JSON.stringify({ scanned: s.scanned, best: s.best })); } catch (e) { /* storage blocked */ } }

/* ---------- textures ---------- */
function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
const bracketTex = () => canvasTex(128, (g, n) => {
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'square';
    const m = 14, L = 30;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const x = sx > 0 ? m : n - m, y = sy > 0 ? m : n - m;
        g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
    }
});
const ringTex = () => canvasTex(128, (g, n) => {
    g.strokeStyle = '#fff'; g.lineWidth = 5;
    g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 8, 0, TAU); g.stroke();
});

/* ---------- speed dust: line segments that stretch with camera velocity ---------- */
const DUST_VS = `
attribute float aEnd;
attribute float aSeed;
attribute vec3 aDir;
uniform vec3 uCam;
uniform vec3 uVel;
uniform float uStreak;
uniform float uBox;
uniform float uTime;
varying float vA;
varying float vTint;
void main() {
    vec3 rel = mod(position - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;     // wrap around the camera
    rel += (aDir * 0.05 + uVel * uStreak) * aEnd;                         // tail trails behind the motion
    vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
    gl_Position = projectionMatrix * mv;
    float edge = smoothstep(0.5 * uBox, 0.18 * uBox, length(rel));
    float tw = 0.65 + 0.35 * sin(uTime * 1.7 + aSeed * 40.0);
    vA = (1.0 - 0.92 * aEnd) * edge * tw * (0.25 + 0.75 * fract(aSeed * 7.31));
    vTint = step(0.82, fract(aSeed * 13.7));
}
`;
const DUST_FS = `
precision mediump float;
uniform float uFade;
varying float vA;
varying float vTint;
void main() {
    vec3 c = mix(vec3(0.55, 0.82, 1.0), vec3(1.0, 0.78, 0.45), vTint);
    gl_FragColor = vec4(c * vA * 0.85 * uFade, 1.0);
}
`;

/* ---------- checkpoint gates: rings with animated energy dashes ---------- */
const GATE_VS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const GATE_FS = `
precision mediump float;
uniform float uTime;
uniform float uState;      // 0 ahead, 1 next, 2 passed
uniform float uFlash;
uniform float uDir;
uniform float uFade;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
    float dash = smoothstep(0.30, 0.55, 0.5 + 0.5 * sin(vUv.x * 6.2831853 * 18.0 - uTime * 2.6 * uDir));
    float a = uState < 0.5 ? 0.10 + 0.20 * dash : (uState < 1.5 ? 0.30 + 0.70 * dash : 0.08 + 0.12 * dash);
    vec3 col = uState < 1.5 && uState > 0.5 ? vec3(1.0, 0.70, 0.33) : uColor;
    a += uFlash * 0.9;
    gl_FragColor = vec4(mix(col, vec3(1.0), uFlash * 0.6) * a * uFade, 1.0);
}
`;

export function createGame(opts) {
    const { scene, camera, rail, stations, host, audio, isCalm } = opts;
    const state = load();
    const N_ST = stations.length - 1;              // 4 checkpoints after the start
    const root = new THREE.Group();
    scene.add(root);
    let system = null, active = true, selected = null, lock = null;
    let simTime = 0, uNow = 0, speedS = 0;
    const prev = new THREE.Vector3(), vel = new THREE.Vector3(), tmp = new THREE.Vector3(), tan = new THREE.Vector3();
    let havePrev = false;

    /* dust */
    const COUNT = 650, BOX = 44;
    const pos = new Float32Array(COUNT * 2 * 3), end = new Float32Array(COUNT * 2), seed = new Float32Array(COUNT * 2), dir = new Float32Array(COUNT * 2 * 3);
    let rs = 12345;
    const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
    for (let i = 0; i < COUNT; i++) {
        const x = (rnd() - 0.5) * BOX, y = (rnd() - 0.5) * BOX, z = (rnd() - 0.5) * BOX, sd = rnd();
        let dx = rnd() - 0.5, dy = rnd() - 0.5, dz = rnd() - 0.5;
        const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        for (let e = 0; e < 2; e++) {
            const k = i * 2 + e;
            pos.set([x, y, z], k * 3); dir.set([dx, dy, dz], k * 3); end[k] = e; seed[k] = sd;
        }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    dg.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    const dustU = {
        uCam: { value: camera.position }, uVel: { value: new THREE.Vector3() }, uStreak: { value: 0.07 }, uBox: { value: BOX },
        uTime: { value: 0 }, uFade: { value: 1 },
    };
    const dust = new THREE.LineSegments(dg, new THREE.ShaderMaterial({
        vertexShader: DUST_VS, fragmentShader: DUST_FS, uniforms: dustU,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    }));
    dust.frustumCulled = false;
    dust.renderOrder = 0.2;
    root.add(dust);

    /* gates: every quarter of the way along the rail; the four whole numbers are the checkpoints */
    const gatesGroup = new THREE.Group();
    root.add(gatesGroup);
    const torus = new THREE.TorusGeometry(1, 0.022, 6, 96);
    const gates = [];
    for (let k = 1; k <= N_ST * 4; k++) {
        const u = k / 4, major = k % 4 === 0;
        rail(u, tmp);
        const p = tmp.clone();
        rail(u + 0.02, tmp); const a = tmp.clone();
        rail(u - 0.02, tmp); tan.copy(a).sub(tmp).normalize();
        const r = Math.hypot(p.x, p.y, p.z);
        const size = (0.45 + 0.075 * r) * (major ? 1.3 : 1);
        const g = new THREE.Group();
        g.position.copy(p);
        g.lookAt(p.clone().add(tan));
        g.scale.setScalar(size);
        const rings = [];
        const mk = (scale, dirSign) => {
            const m = new THREE.Mesh(torus, new THREE.ShaderMaterial({
                vertexShader: GATE_VS, fragmentShader: GATE_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
                uniforms: { uTime: dustU.uTime, uState: { value: 0 }, uFlash: { value: 0 }, uDir: { value: dirSign }, uFade: dustU.uFade, uColor: { value: new THREE.Color(CYAN) } },
            }));
            m.scale.setScalar(scale);
            g.add(m); rings.push(m);
        };
        mk(1, 1);
        if (major) mk(0.8, -1);
        gatesGroup.add(g);
        gates.push({ u, major, g, rings, passed: u <= state.best + 1e-6, flash: 0, idx: k });
    }
    const setGateState = (gt, st) => gt.rings.forEach((m) => { m.material.uniforms.uState.value = st; });

    /* lock bracket + scan pulse (3D sprites) */
    const bTex = bracketTex(), rTex = ringTex();
    const lockSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bTex, color: new THREE.Color(CYAN), transparent: true, depthTest: false, depthWrite: false, opacity: 0.95 }));
    lockSprite.visible = false;
    lockSprite.renderOrder = 5;
    const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: rTex, color: new THREE.Color(AMBER), blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    pulse.visible = false;
    pulse.renderOrder = 5;
    let pulseT = 1, pulseBody = null;

    /* ---------- flight-deck DOM ---------- */
    host.textContent = '';
    const kEl = (t) => h('span', { class: 'g-k' }, t);
    const rankEl = h('b', null, 'Cadet');
    const objEl = h('span', { class: 'g-objtext' }, '');
    const meterFill = h('i');
    const gatesEl = h('span', null, '');
    const scansEl = h('span', null, '');
    const cta = h('a', { class: 'g-cta', href: 'mailto:' + EMAIL }, 'Say hello');
    cta.hidden = true;
    const reset = h('button', { type: 'button', class: 'g-reset hide-sm', 'aria-label': 'Reset game progress' }, 'Reset');
    const bar = h('section', { class: 'g-bar', 'aria-label': 'Mission status' },
        h('span', { class: 'g-rank' }, kEl('Rank'), rankEl),
        h('span', { class: 'g-obj' }, kEl('Objective'), objEl, h('span', { class: 'g-meter', 'aria-hidden': 'true' }, meterFill)),
        h('span', { class: 'g-count' }, gatesEl, scansEl),
        cta, reset);
    const radarCv = h('canvas', { width: 128, height: 128, 'aria-hidden': 'true' });
    const radarLabel = h('p', { class: 'sr-only' }, '');
    const radar = h('div', { class: 'g-radar', role: 'img', 'aria-label': 'Radar' }, radarCv, radarLabel);
    const depthFill = h('i', { class: 'g-depth-fill' });
    const depth = h('div', { class: 'g-depth', 'aria-hidden': 'true' }, depthFill, ...stations.map((_, i) => h('b', { style: `top:${(i / N_ST) * 100}%` })));
    const toasts = h('div', { class: 'g-toasts', role: 'status', 'aria-live': 'polite' });
    const reticle = h('div', { class: 'g-reticle', 'aria-hidden': 'true' });
    reticle.innerHTML = '<svg viewBox="0 0 40 40"><path d="M20 4v8M20 28v8M4 20h8M28 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><circle cx="20" cy="20" r="1.6" fill="currentColor"/></svg>';
    const cockpit = h('div', { class: 'g-cockpit', 'aria-hidden': 'true' }, h('i', { class: 'g-pillar l' }), h('i', { class: 'g-pillar r' }), h('i', { class: 'g-vig' }), h('i', { class: 'g-scan' }));
    host.append(cockpit, reticle, depth, radar, bar, toasts);

    function toast(title, text) {
        const t = h('div', { class: 'g-toast' }, h('b', null, title), text ? h('span', null, text) : '');
        toasts.append(t);
        while (toasts.children.length > 3) toasts.firstChild.remove();
        setTimeout(() => t.remove(), 4200);
    }

    const total = () => (system ? system.bodies.length : 0);
    const scannedSet = () => new Set(state.scanned);
    const rankOf = () => {
        const n = state.scanned.length, N = Math.max(1, total());
        if (n >= N && N > 1 && state.best >= N_ST) return 'Commander';
        if (n >= Math.ceil((2 * N) / 3)) return 'Captain';
        if (n >= Math.ceil(N / 3)) return 'Navigator';
        if (n >= 1) return 'Pilot';
        return 'Cadet';
    };
    let wasComplete = false;
    function refresh(silent) {
        const N = total(), n = state.scanned.length;
        const photon = state.best >= 3, scanAll = N > 0 && n >= N, contact = state.best >= N_ST;
        const cps = gates.filter((g) => g.major && g.passed).length;
        rankEl.textContent = rankOf();
        gatesEl.textContent = `Checkpoints ${cps}/${N_ST}`;
        scansEl.textContent = `Scanned ${n}/${N || '?'}`;
        let text, frac;
        if (!photon) { text = 'Reach the photon sphere'; frac = clamp(Math.max(state.best, uNow) / 3, 0, 1); }
        else if (!scanAll) { text = 'Scan every project'; frac = N ? n / N : 0; }
        else if (!contact) { text = 'Make contact'; frac = clamp(Math.max(state.best, uNow) / N_ST, 0, 1); }
        else { text = 'Mission complete'; frac = 1; }
        const complete = photon && scanAll && contact;
        objEl.textContent = text;
        meterFill.style.width = Math.round(frac * 100) + '%';
        cta.hidden = !complete;
        radarLabel.textContent = `Radar. ${n} of ${N} projects scanned.`;
        if (complete && !wasComplete && !silent) { toast('Mission complete', 'Every project scanned, closest approach made.'); audio.cue('win'); }
        wasComplete = complete;
        if (system) for (const b of system.bodies) {
            const sc = scannedSet().has(b.repo.name);
            b.btn.classList.toggle('scanned', sc);
            b.btn.classList.toggle('unscanned', !sc);
            b.glow.material.opacity = sc ? 0.8 : 0.5;
        }
    }
    reset.addEventListener('click', () => {
        state.scanned = []; state.best = 0; save(state); wasComplete = false;
        gates.forEach((g) => { g.passed = false; setGateState(g, 0); });
        refresh(true);
        toast('Progress reset', 'Fly the route again.');
    });

    /* ---------- radar ---------- */
    const rctx = radarCv.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function sizeRadar() {
        const s = Math.max(64, Math.round(radar.getBoundingClientRect().width || 128));
        radarCv.width = radarCv.height = Math.round(s * DPR);
        radarCv.dataset.s = String(s);
    }
    function drawRadar(camPos, look, t, calm) {
        const S = Number(radarCv.dataset.s) || 128;
        if (!S || !rctx) return;
        rctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        rctx.clearRect(0, 0, S, S);
        const c = S / 2, R = c - 3, range = 36, k = R / range;
        rctx.fillStyle = 'rgba(8,12,24,.78)'; rctx.beginPath(); rctx.arc(c, c, R, 0, TAU); rctx.fill();
        rctx.strokeStyle = 'rgba(92,225,230,.28)'; rctx.lineWidth = 1;
        for (const rr of [9, 18, 28]) { rctx.beginPath(); rctx.arc(c, c, rr * k, 0, TAU); rctx.stroke(); }
        rctx.beginPath(); rctx.moveTo(c - R, c); rctx.lineTo(c + R, c); rctx.moveTo(c, c - R); rctx.lineTo(c, c + R); rctx.stroke();
        rctx.strokeStyle = 'rgba(92,225,230,.7)'; rctx.lineWidth = 1.5; rctx.beginPath(); rctx.arc(c, c, R, 0, TAU); rctx.stroke();
        if (!calm) {   // sweep
            const a = t * 1.4;
            rctx.fillStyle = 'rgba(92,225,230,.13)'; rctx.beginPath(); rctx.moveTo(c, c); rctx.arc(c, c, R, a - 0.55, a); rctx.closePath(); rctx.fill();
        }
        rctx.fillStyle = '#000'; rctx.strokeStyle = AMBER; rctx.lineWidth = 1.5;
        rctx.beginPath(); rctx.arc(c, c, Math.max(3, 2.6 * k), 0, TAU); rctx.fill(); rctx.stroke();
        if (system) {
            const sc = scannedSet();
            for (const b of system.bodies) {
                let x = b.pos.x * k, y = b.pos.z * k;
                const d = Math.hypot(x, y); if (d > R - 3) { x *= (R - 3) / d; y *= (R - 3) / d; }
                const px = c + x, py = c + y;
                rctx.strokeStyle = b.hex; rctx.fillStyle = b.hex; rctx.lineWidth = 1.5;
                rctx.beginPath(); rctx.arc(px, py, selected === b ? 4 : 3, 0, TAU);
                if (sc.has(b.repo.name)) rctx.fill(); else rctx.stroke();
                if (selected === b) { rctx.strokeStyle = '#fff'; rctx.strokeRect(px - 6, py - 6, 12, 12); }
            }
        }
        // the ship: a triangle at the camera, pointing where it looks
        let sx = camPos.x * k, sy = camPos.z * k;
        const sd = Math.hypot(sx, sy); if (sd > R - 4) { sx *= (R - 4) / sd; sy *= (R - 4) / sd; }
        const ang = Math.atan2(look.z, look.x);
        rctx.save(); rctx.translate(c + sx, c + sy); rctx.rotate(ang);
        rctx.fillStyle = '#fff'; rctx.beginPath(); rctx.moveTo(6, 0); rctx.lineTo(-4, 3.6); rctx.lineTo(-2.4, 0); rctx.lineTo(-4, -3.6); rctx.closePath(); rctx.fill();
        rctx.restore();
    }
    sizeRadar();
    window.addEventListener('resize', sizeRadar);

    /* ---------- public API ---------- */
    let acc = 0, uiT = 0;
    const api = {
        setSystem(sys) {
            system = sys;
            refresh(true);
        },
        setActive(on) {
            active = !!on;
            root.visible = active;
            if (active) { havePrev = false; sizeRadar(); }
        },
        onOpen(body) {
            selected = body;
            body.g.add(lockSprite);
            lockSprite.visible = true;
            lockSprite.scale.setScalar(body.radius * 5 + 0.6);
            lockSprite.material.color.set(scannedSet().has(body.repo.name) ? CYAN : AMBER);
            if (!scannedSet().has(body.repo.name)) {
                state.scanned.push(body.repo.name);
                save(state);
                toast(`Scanned: ${body.repo.name}`, `${state.scanned.length} of ${total()} projects`);
                audio.cue('scan');
                pulseBody = body; pulseT = 0; body.g.add(pulse); pulse.visible = true;
                lockSprite.material.color.set(CYAN);
                refresh(false);
            }
        },
        onClose() {
            selected = null;
            lockSprite.visible = false;
            if (lockSprite.parent) lockSprite.parent.remove(lockSprite);
        },
        update(dt, calm, camPos, look, u, t) {
            if (!active) return;
            simTime = t; uNow = u;
            // camera velocity -> streaks
            if (havePrev && dt > 0) {
                tmp.copy(camPos).sub(prev).multiplyScalar(1 / dt);
                if (tmp.length() > 120) tmp.setLength(120);
                const k = 1 - Math.exp(-dt / 0.1);
                vel.lerp(tmp, k);
            }
            prev.copy(camPos); havePrev = true;
            speedS = vel.length();
            const streak = calm ? 0 : Math.min(0.075, 5 / Math.max(speedS, 1));   // seconds of trail, capped so a streak is never longer than ~5 units
            dustU.uVel.value.copy(vel);
            dustU.uStreak.value = streak;
            dustU.uTime.value = calm ? 0 : t;
            // gates follow the slow drift of the camera rail
            gatesGroup.rotation.y = t * 0.012;
            let next = null;
            for (const g of gates) {
                if (!g.passed && u >= g.u - 0.004) {
                    g.passed = true; g.flash = 1;
                    if (g.u > state.best) { state.best = g.u; save(state); }
                    if (g.major) {
                        const cps = gates.filter((x) => x.major && x.passed).length;
                        toast(`Checkpoint ${cps}/${N_ST}`, stations[g.u]);
                        audio.cue('gate');
                    }
                    refresh(false);
                }
                if (!g.passed && !next && g.major) next = g;
                if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.8);
                g.rings.forEach((m) => {
                    m.material.uniforms.uFlash.value = g.flash;
                });
                setGateState(g, g.passed ? 2 : g === next ? 1 : 0);
            }
            // lock + pulse
            if (lockSprite.visible) lockSprite.material.rotation = calm ? 0 : t * 0.6;
            if (pulseBody && pulseT < 1) {
                pulseT = Math.min(1, pulseT + dt / 0.9);
                const s = pulseBody.radius * (3 + 9 * pulseT);
                pulse.scale.setScalar(s);
                pulse.material.opacity = (1 - pulseT) * 0.9;
                if (pulseT >= 1) { pulse.visible = false; if (pulse.parent) pulse.parent.remove(pulse); }
            }
            // DOM updates are throttled (about 12 per second)
            uiT += dt;
            if (uiT > 0.08) {
                uiT = 0;
                const cur = u < 1.6 || u > 3.4 ? '0' : '1';
                if (host.dataset.compact !== cur) host.dataset.compact = cur;
                depthFill.style.height = (clamp(u / N_ST, 0, 1) * 100).toFixed(1) + '%';
                if (!cta.hidden) { /* nothing */ } else {
                    const photon = state.best >= 3;
                    if (!photon) meterFill.style.width = Math.round(clamp(Math.max(state.best, u) / 3, 0, 1) * 100) + '%';
                }
                if (system) {
                    const sc = scannedSet();
                    for (const b of system.bodies) {
                        if (b.btn.hidden) continue;
                        const d = Math.hypot(b.pos.x - camPos.x, b.pos.y - camPos.y, b.pos.z - camPos.z);
                        b.btn.dataset.d = (sc.has(b.repo.name) ? '\u2713 ' : '') + d.toFixed(1) + ' rs';
                    }
                }
                if (radar.offsetParent !== null) drawRadar(camPos, look, t, calm);
            }
        },
        reset() { reset.click(); },
        state: () => ({ scanned: state.scanned.slice(), best: state.best, rank: rankOf() }),
    };
    refresh(true);
    // initial state of gates
    let nextMarked = false;
    for (const g of gates) { setGateState(g, g.passed ? 2 : (!nextMarked && g.major ? (nextMarked = true, 1) : 0)); }
    return api;
}
