// FILE: js/hud.js
import { gamma } from './physics.js';

const pad = (n) => String(n).padStart(2, '0');
export function formatClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60);
}

export function initHud(cb = {}) {
    const $ = (id) => document.getElementById(id);
    const el = {
        r: $('hud-r'), g: $('hud-gamma'), ratio: $('hud-ratio'), you: $('clock-you'), earth: $('clock-earth'),
        q: $('quality'), list: $('btn-list'), pause: $('btn-pause'), pauses: Array.from(document.querySelectorAll('#btn-pause,[data-pause]')), sound: $('btn-sound'), legend: $('legend'), debug: $('debug'),
        nav: Array.from(document.querySelectorAll('#stations a[data-go]')),
    };
    // localStorage can throw (private windows, blocked site data), so every access is wrapped; the page works without it.
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, val) { try { localStorage.setItem(k, val); } catch (e) { /* ignore */ } },
    };
    // Sound is deliberately not remembered: Web Audio cannot start without a click anyway, and sound is never on by default.
    // Default is the fast plain page; 3D is something you choose (and we remember it).
    const prefs = { list: store.get('rabin.list') !== '0', pause: store.get('rabin.pause') === '1' };
    const st = { r: 34, you: 0, earth: 0, list: false, listLocked: false, paused: false, last: performance.now(), cache: {} };

    function put(node, key, text) {
        if (node && st.cache[key] !== text) { st.cache[key] = text; node.textContent = text; }
    }

    // Two clocks. "Your time" is proper time. Earth time advances gamma(r) times faster (static observer).
    function tick() {
        const now = performance.now();
        const dt = Math.min(1, Math.max(0, (now - st.last) / 1000));
        st.last = now;
        st.you += dt;
        st.earth += dt * gamma(st.r);
        put(el.you, 'you', formatClock(st.you));
        put(el.earth, 'earth', formatClock(st.earth));
    }
    setInterval(tick, 250);
    tick();

    const api = {
        prefs,
        gammaOf: gamma,
        setR(r) {
            st.r = r;
            const g = gamma(r);
            put(el.r, 'r', r.toFixed(2));
            put(el.g, 'g', g.toFixed(3));
            put(el.ratio, 'ratio', g.toFixed(3));
        },
        setStation(i) {
            if (st.cache.station === i) return;
            st.cache.station = i;
            el.nav.forEach((a) => {
                if (Number(a.dataset.go) === i) a.setAttribute('aria-current', 'true');
                else a.removeAttribute('aria-current');
            });
        },
        setNavHidden(i, hide) {
            el.nav.forEach((a) => { if (Number(a.dataset.go) === i) a.hidden = !!hide; });
        },
        setLegend(on) { if (el.legend) el.legend.classList.toggle('show', !!on); },
        setQuality(text) { put(el.q, 'q', text); },
        setDebug(text) {
            if (!el.debug) return;
            el.debug.hidden = !text;
            if (text) el.debug.textContent = text;
        },
        setList(on) {
            st.list = !!on;
            if (!el.list) return;
            // One button, two jobs: its label always says what a click will do.
            el.list.removeAttribute('aria-pressed');
            el.list.textContent = st.list ? 'Explore in 3D' : 'Back to page';
            el.list.setAttribute('aria-label', st.list ? 'Explore the site in 3D' : 'Leave the 3D view and return to the standard page');
            el.list.title = st.list ? 'Load the interactive 3D black-hole view' : 'Return to the standard page';
        },
        // When the 3D view cannot run, the plain page is the only page: say so and stop the toggle from leading to a blank screen.
        lockList(on) {
            st.listLocked = !!on;
            if (!el.list) return;
            if (on) {
                el.list.setAttribute('aria-disabled', 'true');
                el.list.title = 'The 3D view is unavailable here, so the plain page is shown';
            } else {
                el.list.removeAttribute('aria-disabled');
                api.setList(st.list);
            }
        },
        setPaused(on) {
            st.paused = !!on;
            // the HUD button and the one in the instruments section stay in step
            el.pauses.forEach((b) => b.setAttribute('aria-pressed', st.paused ? 'true' : 'false'));
        },
        // available === false: the browser has no Web Audio. The button stays visible but disabled, with the reason as its title.
        setSound(on, available = true) {
            if (!el.sound) return;
            el.sound.setAttribute('aria-pressed', on ? 'true' : 'false');
            el.sound.disabled = !available;
            el.sound.title = !available ? 'Sound is not available in this browser'
                : on ? 'Sound is on: a soft drone and a clock tick that speeds up as you descend' : 'Turn on a soft drone and a clock tick (off by default)';
        },
    };

    if (el.list) el.list.addEventListener('click', () => {
        if (st.listLocked) return;
        api.setList(!st.list);
        prefs.list = st.list;
        store.set('rabin.list', st.list ? '1' : '0');
        if (cb.onList) cb.onList(st.list);
    });
    el.pauses.forEach((b) => b.addEventListener('click', () => {
        api.setPaused(!st.paused);
        store.set('rabin.pause', st.paused ? '1' : '0');
        if (cb.onPause) cb.onPause(st.paused);
    }));
    // The audio context must be created and resumed inside this click handler (a user gesture), so the callback runs synchronously.
    if (el.sound) el.sound.addEventListener('click', () => { if (cb.onSound) cb.onSound(); });
    el.nav.forEach((a) => a.addEventListener('click', (e) => {
        e.preventDefault();
        if (cb.onGo) cb.onGo(Number(a.dataset.go));
    }));

    return api;
}
