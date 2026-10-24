// FILE: js/math.js
// Typesets formulas with KaTeX, self-hosted and loaded on demand, with plain text as the fallback.
//
// Markup contract: an element with data-tex="…" already contains a readable plain-text version of the formula.
// If KaTeX (CSS and JS) loads, that element is replaced by the typeset formula; if it does not load within
// the timeout, or a formula fails to parse, the plain text simply stays. Add the attribute data-display for
// display (block) mode. Nothing is ever hidden while we wait, so a slow or blocked CDN costs nothing.

// Served from our own origin (copied from the katex package by scripts/build.mjs): no third-party host, no extra connection.
export const KATEX_CSS = '/assets/vendor/katex/katex.min.css';
export const KATEX_JS = '/assets/vendor/katex/katex.min.js';

let state = 'idle';              // idle | loading | ready | failed
let promise = null;

export function mathState() { return state; }

function load(timeoutMs) {
    if (promise) return promise;
    state = 'loading';
    promise = new Promise((resolve) => {
        let cssOk = false, jsOk = !!window.katex, done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            state = ok ? 'ready' : 'failed';
            resolve(ok ? window.katex : null);
        };
        const check = () => { if (cssOk && jsOk && window.katex) finish(true); };
        const timer = setTimeout(() => finish(false), timeoutMs);

        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = KATEX_CSS; link.crossOrigin = 'anonymous';
        link.addEventListener('load', () => { cssOk = true; check(); });
        link.addEventListener('error', () => finish(false));
        document.head.append(link);

        if (window.katex) { jsOk = true; check(); return; }
        const s = document.createElement('script');
        s.src = KATEX_JS; s.async = true; s.crossOrigin = 'anonymous';
        s.addEventListener('load', () => { jsOk = true; check(); });
        s.addEventListener('error', () => finish(false));
        document.head.append(s);
    });
    return promise;
}

function render(katex, root) {
    const nodes = root.querySelectorAll('[data-tex]:not([data-tex-done])');
    let ok = 0, bad = 0;
    nodes.forEach((el) => {
        const tex = el.getAttribute('data-tex');
        try {
            // Render into a detached node and swap only on success: katex.render() empties its target before it parses,
            // so rendering in place would leave a blank element behind when a formula fails.
            const tmp = document.createElement('span');
            katex.render(tex, tmp, {
                displayMode: el.hasAttribute('data-display'),
                throwOnError: true,             // on any parse error keep the plain text instead of showing red source
                strict: 'ignore',
                trust: false,
                output: 'htmlAndMathml',        // the MathML half is what screen readers read
            });
            el.replaceChildren(...tmp.childNodes);
            el.setAttribute('data-tex-done', '1');
            el.classList.add('tex-ok');
            ok++;
        } catch (err) {
            el.setAttribute('data-tex-done', 'failed');
            bad++;
            if (window.console) console.warn('[math] kept plain text for', tex, err && err.message);
        }
    });
    return { ok, bad };
}

// Start loading KaTeX now (so it is ready long before anyone scrolls to a formula) and typeset `root` when it arrives.
// Safe to call repeatedly, for example after new drawers are built. Resolves to { ok, bad } or null if KaTeX never loaded.
export function typeset(root = document, timeoutMs = 8000) {
    return load(timeoutMs).then((katex) => (katex ? render(katex, root) : null));
}
