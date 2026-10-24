// FILE: js/main.js
// Lite-first: the page is complete, readable HTML before any of this runs. The 3D view (three.js + shader) and the
// instruments are loaded only when wanted, so a first visit downloads and executes very little.
import { initHud } from './hud.js';
import { loadData } from './data.js';
import { MIN_R, clamp, lerp, smoothstep, logLerp, cameraPose, gazeTarget } from './physics.js';
import { createAudio } from './audio.js';
import { createStarfield } from './starfield.js';
import { typeset, mathState } from './math.js';

const root = document.documentElement;
window.__ready = true;
root.classList.remove('no-js');
root.classList.add('js');

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const isReduced = () => !!(mqReduce && mqReduce.matches);

/* ---------- stations ---------- */
const stationEls = Array.from(document.querySelectorAll('.station'));
const STATION_R = stationEls.map((el) => parseFloat(el.dataset.r) || 10);
// pitch = elevation above the disk plane (rad).
// shift = how far the view is turned away from the hole (rad); + puts the hole on the right.
// Near the hole the shadow fills the sky (half-angle ~42 deg at r = 3.2, ~84 deg at r = 1.6),
// so a camera aimed at the centre would show only black. From station 4 on we look at the limb instead.
const POSE = [
    { pitch: 0.30, shift: 0.10, azim: 0.0 },
{ pitch: 0.46, shift: 0.00, azim: 0.4 },
{ pitch: 0.22, shift: -0.16, azim: 0.9 },
{ pitch: 0.24, shift: 0.95, azim: 1.5 },
{ pitch: 0.32, shift: 1.60, azim: 2.1 },
];

const state = { list: root.classList.contains('list-view'), paused: false, simTime: 0, scrollS: 0, warp: 0, fade: 0, u: 0, current: 0 };
const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
const drag = { on: false, az: 0, el: 0, lx: 0, ly: 0, dist: 0, moved: false };
const fly = { body: null, k: 0, target: 0 };
const pose = { r: 34, pitch: 0, shift: 0, azim: 0, u: 0, i0: 0, i1: 0, f: 0 };
const P = { x: 0, y: 0, z: 0 };
const AIM = { x: 0, y: 0, z: 0 };
const T = { x: 0, y: 0, z: 0 };

let hole = null, system = null, SystemClass = null, dataResult = null, game = null;
const LOOK = { x: 0, z: 0 };
const STATION_NAMES = Array.from(document.querySelectorAll('#stations a')).map((a) => a.textContent.trim());
let ctxLost = false, onScreen = true, booted = false, raf = 0, lastT = 0;
let markersOn = false, active = [], fpsS = 60, dbgT = 0, resizeTimer = 0;
/* Idle throttle: the scene never stops moving, so after IDLE_MS without input
   it renders at ~30 fps instead of the display rate. Simulation time still
   advances by the real elapsed time, so nothing visibly slows down. */
const IDLE_MS = 6000, IDLE_FRAME_MS = 28;
let lastInput = performance.now(), lastDraw = 0, wasIdle = false;

const isCalm = () => state.paused || isReduced();

function readPalette() {
    const cs = getComputedStyle(root);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    return { bg: v('--bg', '#0a0e1a'), text: v('--text', '#d7e3ff'), cyan: v('--cyan', '#5ce1e6'), amber: v('--amber', '#ffb454'), rose: v('--rose', '#ff6b9d') };
}

const hud = initHud({
    onList: (on) => (on ? setListMode(true) : enter3D()),
    onPause: (on) => setPausedMode(on),
    onGo: (i) => goTo(i),
    onSound: () => audio.toggle(),          // runs inside the click, which is what lets Web Audio start
});
// Sound is opt-in: nothing is created until the first click on the Sound button.
const audio = createAudio({ onChange: (on) => hud.setSound(on, audio.supported) });
hud.setSound(false, audio.supported);
const stars = createStarfield($('stars'), { isCalm, palette: readPalette() });

/* ---------- modes ---------- */
function setListMode(on) {
    state.list = !!on;
    root.classList.toggle('list-view', state.list);
    hud.setList(state.list);
    hud.setNavHidden(1, state.list);        // Orbit needs the 3D view; Instruments works in both modes
    if (game) game.setActive(!state.list);
    if (state.list) {
        if (system) system.close();
        hud.setLegend(false);
    }
    requestAnimationFrame(() => {
        measure();
        if (!state.list && hole) hole.resize();
        lastT = 0;
        wake();
        if (state.list) navFromScroll();
    });
}

function setPausedMode(on) {
    state.paused = !!on;
    hud.setPaused(state.paused);
    lastT = 0;
    stars.poke();
    wake();
}

/* ---------- when the 3D view cannot run ---------- */
// One path for every failure (no WebGL, shader error, lost context): the plain page over a 2D starfield, with a notice.
function setNoGl(on) {
    root.classList.toggle('nogl', !!on);
    hud.lockList(!!on);
    if (on) { hud.setQuality('2D'); } else stars.stop();
    const n = $('notice');
    if (n) n.hidden = !on;
}
function enterFallback(why) {
    console.warn('[main] 3D view unavailable (' + why + '), showing the plain page');
    setNoGl(true);
    setListMode(true);
}

/* ---------- station highlight without the 3D camera ---------- */
// In the 3D view the frame loop highlights the nearest station. In the plain page there is no loop, so follow the scroll.
let navQueued = false;
function navFromScroll() {
    navQueued = false;
    const mid = window.innerHeight * 0.4;
    let best = -1, bd = Infinity;
    stationEls.forEach((el, i) => {
        if (!el.getClientRects().length) return;
        const r = el.getBoundingClientRect();
        const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
        if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) hud.setStation(best);
}
function scheduleNav() {
    if (navQueued) return;
    navQueued = true;
    requestAnimationFrame(navFromScroll);
}

// Move keyboard and screen-reader focus to the station we just scrolled to.
function moveFocus(el) {
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}


/* ---------- layout measurement ---------- */
function measure() {
    const vh = window.innerHeight, sy = window.scrollY;
    active = [];
    stationEls.forEach((el, i) => {
        if (!el.getClientRects().length) return;
        const rect = el.getBoundingClientRect();
        active.push({ i, y: Math.max(0, rect.top + sy + rect.height / 2 - vh / 2) });
    });
    for (let k = 1; k < active.length; k++) {
        if (active[k].y <= active[k - 1].y) active[k].y = active[k - 1].y + 1;
    }
}

// Stations whose formulas are visible on arrival (formulas inside closed "the math" drawers do not count).
const MATH_STATIONS = stationEls.map((st) => Array.from(st.querySelectorAll('[data-tex]')).some((e) => !e.closest('details')));

function goTo(i) {
    if (!active.some((o) => o.i === i) || !stationEls[i]) return;
    const scroll = () => {
        measure();                                   // typesetting changes heights, so measure again just before moving
        const a = active.find((o) => o.i === i);
        if (!a) return;
        const top = state.list ? stationEls[i].getBoundingClientRect().top + window.scrollY - 80 : a.y;
        window.scrollTo({ top: Math.max(0, top), behavior: isReduced() ? 'auto' : 'smooth' });
        wake();
    };
    moveFocus(stationEls[i]);
    const st = mathState();
    if (MATH_STATIONS[i] && (st === 'idle' || st === 'loading')) {
        // First jump to a station with formulas, before KaTeX has arrived: give it a short head start (at most 450 ms)
        // so the formulas are typeset before they scroll into view instead of reflowing the panel under the reader.
        Promise.race([typeset(document).catch(() => null), new Promise((r) => setTimeout(r, 450))]).then(scroll);
    } else {
        scroll();
    }
    wake();
}

function poseAt(y) {
    const n = active.length;
    let i0 = 0, i1 = 0, f = 0;
    if (n) {
        i0 = i1 = active[0].i;
        if (y > active[0].y) {
            i0 = i1 = active[n - 1].i;
            for (let k = 0; k < n - 1; k++) {
                if (y < active[k + 1].y) {
                    i0 = active[k].i;
                    i1 = active[k + 1].i;
                    f = (y - active[k].y) / (active[k + 1].y - active[k].y);
                    break;
                }
            }
        }
    }
    const s = smoothstep(f), A = POSE[i0], B = POSE[i1];
    pose.i0 = i0; pose.i1 = i1; pose.f = f;
    pose.u = i0 + (i1 - i0) * f;
    pose.r = logLerp(STATION_R[i0], STATION_R[i1], s);   // log-space distance, smoothstep easing
    pose.pitch = lerp(A.pitch, B.pitch, s);
    pose.shift = lerp(A.shift, B.shift, s);
    pose.azim = lerp(A.azim, B.azim, s);
    return pose;
}

/* Position on the camera's rail at fractional station index u (the same spiral the scroll drives). The game puts its gates here. */
function railAt(u, out) {
    const n = POSE.length - 1, uu = clamp(u, 0, n), i0 = Math.min(Math.floor(uu), n - 1), s = smoothstep(uu - i0);
    const A = POSE[i0], B = POSE[i0 + 1];
    return cameraPose(Math.max(logLerp(STATION_R[i0], STATION_R[i0 + 1], s), MIN_R), lerp(A.pitch, B.pitch, s), lerp(A.azim, B.azim, s), out);
}

function updateCamera(dt, calm) {
    poseAt(state.scrollS);
    state.u = pose.u;
    state.current = pose.f < 0.5 ? pose.i0 : pose.i1;
    if (!calm) {
        const k = 1 - Math.exp(-dt / 0.25);
        ptr.sx += (ptr.x - ptr.sx) * k;
        ptr.sy += (ptr.y - ptr.sy) * k;
        if (!drag.on) {
            const d = Math.exp(-dt / 6);
            drag.az *= d;
            drag.el *= d;
        }
    } else {
        ptr.sx = 0; ptr.sy = 0;
    }
    // narrow portrait screens: pull back at the first two stations so orbits fit
    const asp = hole.cssW / Math.max(1, hole.cssH);
    const fit = 1 + (clamp(0.75 / asp, 1, 1.8) - 1) * (1 - smoothstep(clamp(pose.u - 1, 0, 1)));
    const az = pose.azim + state.simTime * 0.012 + drag.az + ptr.sx * 0.05;
    const el = clamp(pose.pitch + drag.el - ptr.sy * 0.03, -1.2, 1.2);
    cameraPose(Math.max(pose.r * fit, MIN_R), el, az, P);
    AIM.x = 0; AIM.y = 0; AIM.z = 0;
    let shift = pose.shift;
    if (fly.body && fly.k > 0.0005) {
        const k = smoothstep(fly.k), b = fly.body.pos;
        P.x += (b.x - P.x) * 0.45 * k;
        P.y += (b.y - P.y) * 0.45 * k;
        P.z += (b.z - P.z) * 0.45 * k;
        AIM.x = b.x * 0.9 * k; AIM.y = b.y * 0.9 * k; AIM.z = b.z * 0.9 * k;
        shift = lerp(shift, window.innerWidth >= 720 ? -0.2 : 0, k);
    }
    let rr = Math.hypot(P.x, P.y, P.z);
    if (rr < MIN_R) {
        const s = MIN_R / rr;
        P.x *= s; P.y *= s; P.z *= s; rr = MIN_R;
    }
    gazeTarget(P, AIM, shift, T);
    hole.setCamera(P.x, P.y, P.z, T.x, T.y, T.z);
    return rr;
}

/* ---------- render loop ---------- */
function wake() {
    if (raf || !hole || state.list || document.hidden || ctxLost || !onScreen) return;
    raf = requestAnimationFrame(frame);
}

function frame(now) {
    raf = 0;
    if (!hole || state.list || document.hidden || ctxLost || !onScreen) { lastT = 0; return; }
    const resumed = lastT === 0;
    const idle = !resumed && !isCalm() && now - lastInput > IDLE_MS;
    if (idle && now - lastDraw < IDLE_FRAME_MS) { raf = requestAnimationFrame(frame); return; }
    lastDraw = now;
    const dt = resumed ? 1 / 60 : Math.min(0.25, (now - lastT) / 1000);
    lastT = now;
    const calm = isCalm();
    if (!calm) state.simTime += dt;

    const target = window.scrollY;
    if (calm) state.scrollS = target;
    else {
        state.scrollS += (target - state.scrollS) * (1 - Math.exp(-dt / 0.14));
        if (Math.abs(target - state.scrollS) < 0.3) state.scrollS = target;
    }
    if (calm) fly.k = fly.target;
    else {
        fly.k += (fly.target - fly.k) * (1 - Math.exp(-dt / 0.35));
        if (Math.abs(fly.target - fly.k) < 0.002) fly.k = fly.target;
    }
    if (fly.k === 0 && fly.target === 0) fly.body = null;
    state.fade = calm ? 1 : Math.min(1, state.fade + dt / 0.9);
    state.warp = calm ? 0 : Math.max(0, state.warp - dt * 0.9);

    if (system) system.advance(state.simTime, dt, calm);
    const r = updateCamera(dt, calm);
    if (game) {
        LOOK.x = T.x - P.x; LOOK.z = T.z - P.z;
        game.update(dt, calm, P, LOOK, state.u, state.simTime);
    }
    markersOn = !state.list && state.u > 0.55 && state.u < 1.6;
    if (system) {
        system.setMarkersActive(markersOn);
        system.place(hole.camera, hole.cssW, hole.cssH);
        if (system.selected && (state.u < 0.35 || state.u > 2.2)) system.close();
    }
    hole.setFrame(state.simTime, state.warp, state.fade);
    hole.render();

    booted = true;
    if (hole.failed) {
        enterFallback('shader failed');
        return;
    }
    /* Idle frames are throttled on purpose, so they say nothing about GPU load. */
    if (!calm && !resumed && !idle && !wasIdle) hole.quality.sample(dt * 1000);
    wasIdle = idle;

    hud.setR(r);
    audio.setGamma(hud.gammaOf(r));          // the tick rate follows γ at the camera
    hud.setStation(state.current);
    hud.setLegend(markersOn);
    hud.setQuality(hole.quality.label());
    if (DEBUG) {
        fpsS += (1 / Math.max(dt, 1e-3) - fpsS) * 0.1;
        dbgT += dt;
        if (dbgT > 0.25 || resumed) {
            dbgT = 0;
            const g = hud.gammaOf(r);
            hud.setDebug(`fps ${fpsS.toFixed(0)}\nscale ${hole.quality.scale.toFixed(1)}\nSTEPS ${hole.quality.steps}\nr ${r.toFixed(3)}\ngamma ${g.toFixed(4)}`);
        }
    }

    const settling = Math.abs(window.scrollY - state.scrollS) > 0.01 || fly.k !== fly.target || state.fade < 1 || state.warp > 0;
    if (!calm || settling) raf = requestAnimationFrame(frame);
    else lastT = 0;
}

/* ---------- system (bodies) ---------- */
function onOpen(body) {
    if (game) game.onOpen(body);
    fly.body = body;
    fly.target = 1;
    state.warp = isCalm() ? 0 : 0.5;
    wake();
}
function onClose() {
    if (game) game.onClose();
    fly.target = 0;
    wake();
}
function tryAttach() {
    if (system || !hole || !SystemClass || !dataResult) return;
    try {
        system = new SystemClass(hole.scene, dataResult.repos, { onOpen, onClose });
        if (game) game.setSystem(system);
    } catch (err) {
        console.warn('[main] system failed', err);
        system = null;
        return;
    }
    wake();
}

/* ---------- data ---------- */
function onData(data) {
    dataResult = data;
    if (data.source !== 'live') {
        const note = $('synced');
        if (note) note.textContent = 'Live repo data is unavailable right now, so the 3D view uses a built-in list of featured projects. Orbit distances are placeholders.';
    }
    tryAttach();
}

/* ---------- reveal on scroll ---------- */
function setupReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => en.target.classList.toggle('in', en.isIntersecting));
    }, { threshold: 0.05 });
    els.forEach((e) => io.observe(e));
}

/* ---------- events ---------- */
function bindEvents() {
    const bump = () => { lastInput = performance.now(); };
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    window.addEventListener('scroll', () => { bump(); wake(); if (state.list) scheduleNav(); }, { passive: true });
    /* "scroll to descend": same path as the station nav (focus handling, reduced motion), not a raw anchor jump */
    const cue = document.querySelector('.cue a');
    if (cue) cue.addEventListener('click', (e) => { e.preventDefault(); goTo(1); });
    // The hero button does exactly what the top-bar button does (including remembering the choice).
    document.querySelectorAll('[data-enter3d]').forEach((cta) => cta.addEventListener('click', () => { const b = $('btn-list'); if (b) b.click(); else enter3D(); }));
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (hole && !state.list) hole.resize();
            measure();
            wake();
        }, 80);
    };
    window.addEventListener('resize', onResize);
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.body);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
    window.addEventListener('load', onResize);
    document.addEventListener('visibilitychange', () => { lastT = 0; wake(); });
    if (mqReduce) {
        const h = () => { lastT = 0; wake(); };
        try { mqReduce.addEventListener('change', h); } catch (e) { try { mqReduce.addListener(h); } catch (e2) { /* ignore */ } }
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && system && system.selected) system.close();
    });

        const interactive = 'a,button,input,textarea,select,.panel,#hud,#stations,#legend,#dossier,.marker';
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
            ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
            if (drag.on) {
                const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
                drag.lx = e.clientX; drag.ly = e.clientY;
                drag.az -= dx * 0.004;
                drag.el = clamp(drag.el + dy * 0.003, -0.7, 0.7);
                drag.dist += Math.abs(dx) + Math.abs(dy);
                if (drag.dist > 5) drag.moved = true;
            }
            wake();
        }, { passive: true });
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse' || e.button !== 0 || state.list) return;
            if (e.target.closest && e.target.closest(interactive)) return;
            drag.on = true; drag.moved = false; drag.dist = 0;
            drag.lx = e.clientX; drag.ly = e.clientY;
            document.body.style.cursor = 'grabbing';
        });
        const endDrag = () => { if (drag.on) { drag.on = false; document.body.style.cursor = ''; } };
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        window.addEventListener('click', (e) => {
            if (drag.moved) { drag.moved = false; return; }
            if (!system || !markersOn) return;
            if (e.target.closest && e.target.closest(interactive)) return;
            system.pickAt(e.clientX, e.clientY);
        });
}

/* ---------- boot ---------- */
function startInstruments() {
    const host = $('instruments');
    if (!host) return;
    const load = () => import('./instruments.js')
    .then((m) => m.init(host, { isCalm, isReduced }))
    .catch((e) => {
        console.warn('[instruments]', e);
        host.textContent = '';
        const p = document.createElement('p');
        p.className = 'ins-error';
        p.setAttribute('role', 'alert');
        p.textContent = 'The instruments could not start in this browser. The rest of the page still works.';
        host.append(p);
    });
    // The instruments (and their code) load when their section is about one screen away, not at page load.
    if (!('IntersectionObserver' in window)) { load(); }
    else {
        const io = new IntersectionObserver((es) => {
            if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
        }, { rootMargin: '0px 0px 100% 0px' });
        io.observe(host);
    }
    typesetNearView();
}

// KaTeX is about 300 KB plus a few hundred ms of main-thread time, so it is fetched only when a station that has
// formulas is about to scroll into view (one screen ahead). Until it arrives, or if it never does, the plain-text
// formulas stay, so nothing is lost by waiting.
function typesetNearView() {
    const stations = [];
    document.querySelectorAll('[data-tex]').forEach((el) => {
        const st = el.closest('.station') || el;
        if (!stations.includes(st)) stations.push(st);
    });
    if (!stations.length) return;
    const go = () => { typeset(document).catch(() => {}); };
    if (!('IntersectionObserver' in window)) { go(); return; }
    const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); go(); }
    }, { rootMargin: '0px 0px 80% 0px' });
    stations.forEach((st) => io.observe(st));
}

/* ---------- 3D view: loaded on demand ---------- */
let entering = null;
function status3d(msg) {
    const n = $('status3d');
    if (!n) return;
    n.textContent = msg || '';
    n.hidden = !msg;
}

function enter3D() {
    if (hole) {
        const fromList = state.list;
        setListMode(false);
        if (fromList) window.scrollTo(0, 0);
        return Promise.resolve();
    }
    if (entering) return entering;
    const fromList = state.list;
    entering = (async () => {
        status3d('Loading the 3D view…');
        try {
            // three.js lives behind dynamic imports, so a blocked or failed download falls back to the plain page
            const mods = await Promise.all([import('./hole.js'), import('./system.js'), import('./game.js')]);
            hole = mods[0].createHole($('gl'));
            SystemClass = mods[1].System;
            game = mods[2].createGame({ scene: hole.scene, camera: hole.camera, rail: railAt, stations: STATION_NAMES, host: $('game'), audio, isCalm });
        } catch (err) {
            console.warn('[main] 3D unavailable, showing the plain page', err);
            hole = null;
        }
        if (!hole) {
            status3d('');
            entering = null;
            enterFallback('WebGL unavailable');
            return;
        }
        hole.onLost(() => { ctxLost = true; enterFallback('WebGL context lost'); });
        hole.onRestored(() => { ctxLost = false; setNoGl(false); if (!hud.prefs.list) setListMode(false); });
        loadData().then(onData);
        // Build the heavy shader off the main thread where supported; never wait more than 3 s for it.
        await Promise.race([hole.ready(), new Promise((r) => setTimeout(r, 3000))]);
        const io = 'IntersectionObserver' in window
        ? new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) { lastT = 0; wake(); } })
        : null;
        if (io) io.observe($('gl'));
        setListMode(false);
        if (fromList) window.scrollTo(0, 0);
        hole.resize();
        measure();
        state.scrollS = window.scrollY;
        tryAttach();
        wake();
        status3d('');
    })();
    return entering;
}

/* ---------- boot ---------- */
function boot() {
    setupReveal();
    bindEvents();
    root.classList.add('js-ready');
    // The saved Pause applies first, before anything animates and on every path below.
    if (hud.prefs.pause) setPausedMode(true);
    hud.setList(state.list);
    hud.setNavHidden(1, state.list);
    measure();
    // Everything below is deferred until the page has painted, so none of it can delay first paint or input.
    const later = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 200);
    later(startInstruments);
    // Someone who chose the 3D view last time gets it again; everyone else gets the fast page and one button.
    if (!state.list) later(enter3D);
}

boot();
