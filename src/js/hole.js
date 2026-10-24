// FILE: js/hole.js
import * as THREE from 'three';
import { createQuality } from './quality.js';

// Ported from Gargantua's src/game/blackHoleShader.ts. Physics and look unchanged, except:
//  - the loop count is the compile-time define STEPS
//  - the tail (photon-ring glow onward) is reconstructed, because the attachment was cut off there
//  - a 1/255 dither before output to hide banding in the dark gradients
export const bhVertex = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const bhFragment = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat4 uCamMat;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uWarp;      // 0..1 extra distortion/flash (near horizon / events)
uniform float uFade;      // global fade
varying vec2 vUv;

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                   mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                   mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec3(1.7, 9.2, 3.1);
        a *= 0.5;
    }
    return v;
}

vec3 starLayer(vec3 dir, float scale, float thresh) {
    vec3 p = dir * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(id);
    if (h < thresh) return vec3(0.0);
    vec3 off = vec3(hash13(id + 11.1), hash13(id + 23.7), hash13(id + 37.3)) - 0.5;
    float d = length(f - off * 0.6);
    float b = smoothstep(0.12, 0.0, d) * (h - thresh) / (1.0 - thresh);
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + h * 4.0) + h * 50.0);
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), hash13(id + 5.0));
    return tint * b * tw * 3.0;
}

vec3 sky(vec3 dir) {
    vec3 col = vec3(0.0);
    col += starLayer(dir, 90.0, 0.94);
    col += starLayer(dir, 220.0, 0.965) * 0.8;
    col += starLayer(dir, 500.0, 0.975) * 0.5;
    // galactic band
    vec3 bandAxis = normalize(vec3(0.3, 1.0, 0.25));
    float band = 1.0 - abs(dot(dir, bandAxis));
    band = pow(band, 6.0);
    float neb = fbm(dir * 3.0 + vec3(0.0, uTime * 0.005, 0.0));
    float neb2 = fbm(dir * 7.0 - 3.0);
    col += vec3(0.32, 0.24, 0.18) * band * neb * 0.35;
    col += vec3(0.10, 0.12, 0.2) * pow(neb2, 3.0) * 0.6;
    col += starLayer(dir, 900.0, 0.9) * band * 0.6;
    return col;
}

vec4 disk(vec3 p, float r, vec3 rayDir) {
    float inner = 2.6;
    float outer = 15.0;
    if (r < inner || r > outer) return vec4(0.0);
    float ang = atan(p.z, p.x);
    float omega = 2.2 / pow(r, 1.5);
    float rot = ang + uTime * omega;
    vec2 q = vec2(cos(rot), sin(rot)) * r;
    float n = fbm(vec3(q * 0.9, r * 0.35 + uTime * 0.02));
    float streak = fbm(vec3(r * 3.2, cos(rot) * 1.5, sin(rot) * 1.5));
    float rings = 0.55 + 0.45 * sin(r * 7.0 + n * 6.0);
    float edge = smoothstep(inner, inner + 0.5, r) * (1.0 - smoothstep(7.0, outer, r));
    float dens = edge * (0.35 + 0.9 * n) * (0.5 + 0.6 * streak) * rings;
    float temp = clamp(pow(3.2 / r, 1.35), 0.0, 1.6);
    // mild relativistic beaming
    vec3 tang = normalize(vec3(-p.z, 0.0, p.x));
    float beam = 1.0 + 0.55 * dot(tang, -normalize(rayDir));
    vec3 hot = vec3(1.0, 0.93, 0.82);
    vec3 warm = vec3(1.0, 0.58, 0.22);
    vec3 cool = vec3(0.55, 0.22, 0.07);
    vec3 col = mix(cool, warm, smoothstep(0.15, 0.6, temp));
    col = mix(col, hot, smoothstep(0.6, 1.2, temp));
    col *= dens * temp * 3.2 * beam;
    float a = clamp(dens * 1.4, 0.0, 1.0);
    return vec4(col, a);
}

vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    vec3 rdCam = normalize(vec3(uv.x * uTanHalfFov * uAspect, uv.y * uTanHalfFov, -1.0));
    vec3 rd = normalize((uCamMat * vec4(rdCam, 0.0)).xyz);
    vec3 pos = uCamPos;
    vec3 vel = rd;
    vec3 hv = cross(pos, vel);
    float h2 = dot(hv, hv);

    vec3 acc = vec3(0.0);
    float alpha = 0.0;
    bool captured = false;
    float minR = 1e5;

    for (int i = 0; i < STEPS; i++) {
        float r = length(pos);
        minR = min(minR, r);
        float dt = clamp(0.07 * r, 0.015, 2.5);
        vec3 prev = pos;
        vec3 a = -1.5 * h2 * pos / pow(r, 5.0);
        vel += a * dt;
        pos += vel * dt;
        float nr = length(pos);
        if (nr < 1.0) { captured = true; break; }
        if (prev.y * pos.y < 0.0) {
            float t = prev.y / (prev.y - pos.y);
            vec3 hit = mix(prev, pos, t);
            float hr = length(hit.xz);
            vec4 d = disk(hit, hr, vel);
            acc += d.rgb * (1.0 - alpha);
            alpha += d.a * (1.0 - alpha);
            if (alpha > 0.98) break;
        }
        if (nr > 90.0 && dot(pos, vel) > 0.0) break;
    }

    vec3 bg = captured ? vec3(0.0) : sky(normalize(vel));
    vec3 col = acc + bg * (1.0 - alpha);

    // photon ring glow  (tail below is reconstructed)
    float ring = exp(-pow((minR - 1.5) * 4.0, 2.0));
    col += vec3(1.0, 0.82, 0.58) * ring * 0.30 * (1.0 - alpha);

    // warp: brief haze/flash driven from JS
    float vig = smoothstep(1.2, 0.0, length(uv));
    col += vec3(0.50, 0.65, 1.0) * uWarp * 0.22 * vig;

    col *= uFade;
    col = aces(col);
    col = pow(col, vec3(1.0 / 2.2));
    col += (hash13(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}
`;

const FOV = 50;

export function createHole(canvas) {
    if (!canvas) throw new Error('canvas missing');
    const renderer = new THREE.WebGLRenderer({
        canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'default',
    });
    renderer.setClearColor(0x000000, 1);

    const api = { failed: false, cssW: 0, cssH: 0 };
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
        api.failed = true;
        try { console.error('[hole] shader error', gl.getProgramInfoLog(program), gl.getShaderInfoLog(fs), gl.getShaderInfoLog(vs)); } catch (e) { /* ignore */ }
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
    const uniforms = {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uCamPos: { value: camera.position },
        uCamMat: { value: camera.matrixWorld },
        uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
        uAspect: { value: 1 },
        uWarp: { value: 0 },
        uFade: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
        vertexShader: bhVertex,
        fragmentShader: bhFragment,
        uniforms,
        defines: { STEPS: 200 },
        depthTest: false,
        depthWrite: false,
        transparent: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    scene.add(quad);

    /* adaptive quality: see quality.js */
    const sizeVec = new THREE.Vector2();
    let lastPr = 0;
    const q = createQuality({
        onScale: () => resize(),
        onSteps: (n) => { material.defines.STEPS = n; material.needsUpdate = true; },
    });

    function resize() {
        const w = Math.max(1, canvas.clientWidth), hgt = Math.max(1, canvas.clientHeight);
        const pr = Math.min(window.devicePixelRatio || 1, 1.5) * q.scale;
        if (w === api.cssW && hgt === api.cssH && Math.abs(pr - lastPr) < 1e-3) return;
        api.cssW = w; api.cssH = hgt; lastPr = pr;
        renderer.setPixelRatio(pr);
        renderer.setSize(w, hgt, false);
        renderer.getDrawingBufferSize(sizeVec);
        uniforms.uRes.value.set(sizeVec.x, sizeVec.y);
        camera.aspect = w / hgt;
        camera.updateProjectionMatrix();
        uniforms.uAspect.value = w / hgt;
    }

    let lostCb = null, restoredCb = null;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (lostCb) lostCb(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { if (restoredCb) restoredCb(); }, false);

    return Object.assign(api, {
        renderer, scene, camera, uniforms, material, quality: q,
        resize,
        setCamera(px, py, pz, tx, ty, tz) {
            camera.position.set(px, py, pz);
            camera.up.set(0, 1, 0);
            camera.lookAt(tx, ty, tz);
            camera.updateMatrixWorld(true);
        },
        setFrame(time, warp, fade) {
            uniforms.uTime.value = time;
            uniforms.uWarp.value = warp;
            uniforms.uFade.value = fade;
        },
        /* Compile the (heavy) shader off the main thread where the browser supports
           KHR_parallel_shader_compile, so boot does not freeze while it builds. */
        ready() {
            return typeof renderer.compileAsync === 'function'
                ? renderer.compileAsync(scene, camera).catch(() => {})
                : Promise.resolve();
        },
        render() { renderer.render(scene, camera); },
                         onLost(cb) { lostCb = cb; },
                         onRestored(cb) { restoredCb = cb; },
                         dispose() { renderer.dispose(); },
    });
}
