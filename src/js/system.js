// FILE: js/system.js
import * as THREE from 'three';
import { orbitElements, orbitPoint, keplerPosition, bodyRadius, blinkHz, lensBody, TAU, hash01, clamp } from './physics.js';
import { formatDate, h } from './data.js';

const C = { cyan: '#5ce1e6', amber: '#ffb454', rose: '#ff6b9d', text: '#d7e3ff', muted: '#7f8fb5' };

export function languageColor(lang) {
    switch (lang) {
        case 'JavaScript': case 'TypeScript': return C.cyan;
        case 'Python': return C.amber;
        case 'Kotlin': return C.rose;
        case 'HTML': return C.text;
        default: return C.muted;
    }
}

const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

// Bodies are lit from the direction of the hole (the disk), plus a faint rim. Colours are written as raw sRGB.
const BODY_VS = `
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vL = normalize(-wp.xyz);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BODY_FS = `
precision highp float;
uniform vec3 uColor;
uniform float uBright;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
void main() {
    vec3 n = normalize(vN);
    float lam = max(dot(n, normalize(vL)), 0.0);
    float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
    vec3 col = uColor * (0.12 + 0.88 * lam) + uColor * rim * 0.4 + vec3(1.0, 0.7, 0.35) * lam * 0.08;
    gl_FragColor = vec4(col * uBright, 1.0);
}
`;

let glowTex = null;
function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    return glowTex;
}

const v = new THREE.Vector3();
const $ = (id) => document.getElementById(id);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class System {
    constructor(scene, repos, opts = {}) {
        this.scene = scene;
        this.opts = opts;
        this.bodies = [];
        this.selected = null;
        this.opener = null;
        this.markersActive = false;
        this.appear = 0;
        this.markersEl = $('markers');
        this.dos = {
            root: $('dossier'), close: $('dossier-close'), kicker: $('dossier-kicker'), name: $('dossier-name'),
            line: $('dossier-line'), meta: $('dossier-meta'), note: $('dossier-note'), links: $('dossier-links'),
        };
        if (this.dos.close) this.dos.close.addEventListener('click', () => this.close());

        this.root = new THREE.Group();
        scene.add(this.root);

        // invisible depth-only sphere at the hole: hides orbit lines and bodies that pass behind the shadow
        const occ = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 16), new THREE.MeshBasicMaterial({ colorWrite: false }));
        occ.renderOrder = -0.5;
        this.root.add(occ);

        this.sphere = new THREE.SphereGeometry(1, 24, 16);
        const tex = glowTexture();
        const tmp = { x: 0, y: 0, z: 0 };

        repos.forEach((repo, idx) => {
            const el = orbitElements(repo.name, repo.days);
            const radius = bodyRadius(repo.stars);
            const hex = languageColor(repo.language);
            const col = new THREE.Color(hex);

            const g = new THREE.Group();
            const mat = new THREE.ShaderMaterial({
                vertexShader: BODY_VS,
                fragmentShader: BODY_FS,
                uniforms: { uColor: { value: new THREE.Vector3(...hexRgb(hex)) }, uBright: { value: 1 } },
            });
            const mesh = new THREE.Mesh(this.sphere, mat);
            mesh.scale.setScalar(radius);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5,
            }));
            glow.scale.setScalar(radius * 6);
            const clock = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tex, color: new THREE.Color(C.text), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.2,
            }));
            clock.scale.setScalar(0.55);
            clock.position.set(0, radius * 1.6 + 0.25, 0);
            g.add(mesh, glow, clock);
            g.visible = false;
            this.root.add(g);

            const N = 160;
            const pts = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {
                orbitPoint(el, (i / N) * TAU, tmp);
                pts[i * 3] = tmp.x; pts[i * 3 + 1] = tmp.y; pts[i * 3 + 2] = tmp.z;
            }
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
            const line = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false }));
            line.frustumCulled = false;
            this.root.add(line);

            const btn = h('button', { type: 'button', class: 'marker', 'aria-label': 'Open dossier for ' + repo.name }, repo.name);
            btn.style.setProperty('--c', hex);
            btn.hidden = true;
            if (this.markersEl) this.markersEl.append(btn);

            const body = {
                idx, repo, el, radius, hex, g, mesh, glow, clock, line, btn,
                pos: { x: 0, y: 0, z: 0 },
                app: { x: 0, y: 0, z: 0, hidden: false, lensed: false, b: Infinity },
                sx: 0, sy: 0, px: 0, shown: false, focus: false,
                phase: hash01(repo.name, 7) * TAU,
                      hz: blinkHz(el.a),
            };
            btn.addEventListener('click', () => this.open(body, btn));
            btn.addEventListener('focus', () => { body.focus = true; });
            btn.addEventListener('blur', () => { body.focus = false; });
            this.bodies.push(body);
        });
    }

    /* true Kepler positions and the tiny clock lights (blink rate = 1/gamma(a)) */
    advance(t, dt, calm) {
        this.appear = calm ? 1 : Math.min(1, this.appear + dt / 1.2);
        const k = Math.max(0.0001, easeOut(this.appear));
        for (const b of this.bodies) {
            keplerPosition(b.el, t, b.pos);
            const pulse = Math.pow(Math.max(0, Math.sin(TAU * b.hz * t + b.phase)), 6);
            b.clock.material.opacity = 0.14 + 0.86 * pulse;
            b.g.scale.setScalar(k);
        }
    }

    /* weak-field lensing nudge, projection and DOM markers; needs the camera pose of this frame */
    place(camera, W, H) {
        const cp = camera.position, inv = camera.matrixWorldInverse;
        const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const asp = W / Math.max(1, H);
        for (const b of this.bodies) {
            const a = b.app;
            lensBody(cp, b.pos, a);
            v.set(a.x, a.y, a.z).applyMatrix4(inv);
            const depth = -v.z;
            const visible = !a.hidden && depth > 0.6;
            b.shown = visible;
            b.g.visible = visible;
            b.g.position.set(a.x, a.y, a.z);
            if (depth > 0.01) {
                b.sx = (v.x / (depth * tanH * asp) * 0.5 + 0.5) * W;
                b.sy = (1 - (v.y / (depth * tanH) * 0.5 + 0.5)) * H;
                b.px = (b.radius / (depth * tanH)) * H * 0.5;
            }
            const hot = b === this.selected ? 1 : (b.focus ? 0.6 : 0);
            b.glow.material.opacity = 0.5 + 0.4 * hot;
            b.line.material.opacity = 0.16 + 0.4 * hot;

            if (!this.markersActive) continue;
            const onScreen = visible && b.sx > -10 && b.sx < W + 10 && b.sy > -10 && b.sy < H + 10;
            if (onScreen || b.focus) {
                b.btn.hidden = false;
                const x = depth > 0.01 ? clamp(b.sx, 8, W - 8) : W / 2;
                const y = depth > 0.01 ? clamp(b.sy, 8, H - 8) : H / 2;
                b.btn.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
            } else if (!b.btn.hidden) b.btn.hidden = true;
        }
    }

    setMarkersActive(on) {
        if (on === this.markersActive) return;
        this.markersActive = on;
        if (this.markersEl) this.markersEl.classList.toggle('show', on);
        if (!on) for (const b of this.bodies) b.btn.hidden = true;
    }

    pickAt(x, y) {
        if (!this.markersActive) return false;
        let best = null, bd = 1e9;
        for (const b of this.bodies) {
            if (!b.shown) continue;
            const d = Math.hypot(b.sx - x, b.sy - y);
            if (d < Math.max(18, b.px + 10) && d < bd) { best = b; bd = d; }
        }
        if (!best) return false;
        this.open(best, null);
        return true;
    }

    open(body, opener) {
        const d = this.dos;
        if (!d.root) return;
        const repo = body.repo, el = body.el;
        this.selected = body;
        this.opener = opener || body.btn;
        if (d.kicker) d.kicker.textContent = 'Dossier';
        if (d.name) d.name.textContent = repo.name;
        if (d.line) d.line.textContent = repo.line;
        if (d.note) { d.note.hidden = !repo.note; d.note.textContent = repo.note || ''; }
        if (d.meta) {
            d.meta.textContent = '';
            const rows = [
                ['Language', repo.language || 'unknown'],
                ['Stars', repo.stars == null ? '\u2014' : String(repo.stars)],
                ['Last commit', repo.pushedAt ? formatDate(repo.pushedAt) : 'unknown'],
                ['Orbit', 'a ' + el.a.toFixed(1) + ' rs \u00b7 e ' + el.e.toFixed(2) + ' \u00b7 T ' + el.period.toFixed(0) + ' s' + (el.placeholder ? ' (placeholder)' : '')],
            ];
            for (const [k, val] of rows) d.meta.append(h('dt', null, k), h('dd', null, val));
        }
        if (d.links) {
            d.links.textContent = '';
            const btn = (href, label, title) => h('a', {
                href, class: 'btn', target: '_blank', rel: 'noopener noreferrer', title,
                style: 'text-decoration:none;display:inline-flex;align-items:center',
            }, label, h('span', { class: 'sr-only' }, ' (opens in a new tab)'));
            if (repo.live) d.links.append(btn(repo.live, 'Live'));
            d.links.append(btn(repo.url, 'Source'));
            (repo.releases || []).slice(0, 2).forEach((rel) => {
                d.links.append(btn(rel.url, 'Release ' + rel.tag));
                rel.assets.slice(0, 3).forEach((as) => d.links.append(btn(as.url, '\u2193 ' + as.name, 'Download ' + as.name)));
            });
        }
        d.root.hidden = false;
        if (d.close) d.close.focus({ preventScroll: true });
        if (this.opts.onOpen) this.opts.onOpen(body);
    }

    close() {
        const d = this.dos;
        if (!this.selected || !d.root) return;
        const hadFocus = d.root.contains(document.activeElement);
        const opener = this.opener;
        this.selected = null;
        d.root.hidden = true;
        if (hadFocus && opener && !opener.hidden) opener.focus({ preventScroll: true });
        if (this.opts.onClose) this.opts.onClose();
    }

    dispose() {
        this.close();
        this.scene.remove(this.root);
        for (const b of this.bodies) {
            b.btn.remove();
            b.line.geometry.dispose();
            b.line.material.dispose();
            b.glow.material.dispose();
            b.clock.material.dispose();
            b.mesh.material.dispose();
        }
        this.sphere.dispose();
        this.bodies = [];
    }
}
