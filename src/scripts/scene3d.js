// WebGL scene: scroll-driven flight from Earth orbit, past the Moon, to a black hole.
// Everything is procedural (no textures downloaded): GPU-noise Earth, baked Milky Way, instanced stars, a cratered asteroid, a cratered Moon.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { root, SC, state } from './lib.js';
import { Sfx } from './sfx.js';

const V = THREE.Vector3, TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const DEG = Math.PI / 180;
const eq = (raH, decD) => { const a = raH * 15 * DEG, d = decD * DEG; return new V(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a)); }; // real sky coordinates (RA hours, Dec degrees)
const SUN = new V(0.77, 0.1, -0.63).normalize(); // low sun to the right: orbital sunrise, the camera pans toward it during the scroll
const HOLE = new V(-60, 12, -170);
let sunGlow, sunCore, constLines, renderer, scene, camera, composer, bloom, gem, earth, hole, disks = [], halo, stars, streaks, meteor, skyTex, cvs;
let ready = false, failed = false, running = false, last = 0, cp = 0, introT = 2, slow = 0, quality = 2, px = 0, py = 0, tx = 0, ty = 0, tMet = 6, travel = 0;
const U = { rotY: { value: 0 }, qual: { value: 1 }, time: { value: 0 }, sun: { value: SUN }, tint: { value: new THREE.Color('#4cb8ff') }, warp: { value: 0 }, px: { value: 1 } };

const NOISE = `
float hash(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1.,0.,0.)),f.x),mix(hash(i+vec3(0.,1.,0.)),hash(i+vec3(1.,1.,0.)),f.x),f.y),
            mix(mix(hash(i+vec3(0.,0.,1.)),hash(i+vec3(1.,0.,1.)),f.x),mix(hash(i+vec3(0.,1.,1.)),hash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,t=0.;for(int i=0;i<5;i++){t+=a*noise(p);p=p*2.03+vec3(17.,9.,3.);a*=.5;}return t;}`;
const BODY_V = `varying vec3 vN; varying vec3 vWN; varying vec3 vPos;
void main(){vN=normal;vWN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vPos=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;

function earthMat() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: BODY_V, fragmentShader: NOISE + `
  uniform vec3 sun; uniform float time,rotY,qual; uniform vec3 tint; varying vec3 vN; varying vec3 vWN; varying vec3 vPos;
  void main(){
    vec3 n=normalize(vN);
    vec3 wv=vec3(noise(n*3.+1.),noise(n*3.+5.),noise(n*3.+9.))-.5;
    float h=fbm(n*2.5+wv*.9+3.0);
    float land=smoothstep(.515,.545,h); float lat=abs(n.y);
    float shallow=smoothstep(.43,.515,h)*(1.-land);
    vec3 ocean=mix(mix(vec3(.003,.02,.07),vec3(.015,.11,.26),smoothstep(.15,.45,h)),vec3(.04,.30,.36),shallow);
    float dry=smoothstep(.40,.68,fbm(n*3.6+9.0))*(1.-smoothstep(.5,.82,lat));
    vec3 ground=mix(mix(vec3(.035,.09,.03),vec3(.14,.17,.06),smoothstep(.55,.72,h)),vec3(.40,.30,.15),dry);
    ground=mix(ground,vec3(.17,.15,.13),smoothstep(.70,.82,h));
    ground=mix(ground,vec3(.82,.86,.9),smoothstep(.80,.93,lat+(h-.5)*.25));
    vec3 col=mix(ocean,ground,land);
    vec3 Wn=normalize(vWN); float c=cos(rotY),s=sin(rotY);
    vec3 W=Wn;
    if(qual>.5&&land>.5){ float e=.012; float b0=noise(n*16.);
      vec3 g=vec3(noise(n*16.+vec3(e,0.,0.))-b0,noise(n*16.+vec3(0.,e,0.))-b0,noise(n*16.+vec3(0.,0.,e))-b0)/e; g-=n*dot(g,n);
      vec3 gw=vec3(c*g.x+s*g.z,g.y,-s*g.x+c*g.z); W=normalize(Wn+gw*.06*smoothstep(.55,.8,h)); }
    float d=dot(W,sun); float dl=max(d,0.);
    vec3 V=normalize(cameraPosition-vPos); vec3 H=normalize(sun+V);
    float spec=pow(max(dot(Wn,H),0.),90.)*(1.-land)*.9;
    float cs=0.;
    if(qual>.5&&dl>0.){ vec3 so=vec3(c*sun.x-s*sun.z,sun.y,s*sun.x+c*sun.z); cs=smoothstep(.54,.8,fbm(n*3.+vec3(time*.012,0.,time*.007)+20.+so*.05)); }
    vec3 day=col*(.03+.9*dl)*(1.-.5*cs)+spec;
    float term=smoothstep(.0,.3,d)*(1.-smoothstep(.3,.6,d)); day*=mix(vec3(1.),vec3(1.12,.72,.5),term*.55);
    float lit=smoothstep(-.06,.22,d);
    float cities=0.; if(d<.15){ cities=smoothstep(.6,.76,fbm(n*28.+5.))*land*smoothstep(.05,-.2,d); }
    vec3 night=col*.012+vec3(1.,.66,.32)*cities*1.4;
    vec3 cc=mix(night,day,lit);
    float fr=pow(1.-max(dot(Wn,V),0.),3.);
    cc+=tint*fr*(.06+.9*smoothstep(-.25,.45,d))*.55;
    gl_FragColor=vec4(cc,1.);
  }` });
}
function cloudMat() {
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: BODY_V, transparent: true, depthWrite: false, fragmentShader: NOISE + `
  uniform vec3 sun; uniform float time; varying vec3 vN; varying vec3 vWN; varying vec3 vPos;
  void main(){ vec3 n=normalize(vN);
    float cl=smoothstep(.54,.8,fbm(n*3.+vec3(time*.012,0.,time*.007)+20.)); cl=clamp(cl*(.7+fbm(n*9.+time*.01)*.6),0.,1.);
    vec3 W=normalize(vWN); float d=dot(W,sun); float lit=smoothstep(-.1,.25,d); float sset=smoothstep(.0,.25,d)*(1.-smoothstep(.25,.5,d));
    vec3 c=vec3(.95)*(.03+1.0*max(d,0.))*mix(vec3(1.),vec3(1.12,.78,.58),sset);
    gl_FragColor=vec4(c*lit+vec3(.012)*(1.-lit),cl*.9); }` });
}
function atmoMat() {
  return new THREE.ShaderMaterial({ uniforms: U, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vVN; varying vec3 vWN; void main(){vVN=normalize(normalMatrix*normal);vWN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 sun; uniform vec3 tint; varying vec3 vVN; varying vec3 vWN;
    void main(){float i=pow(max(0.,.74-dot(vVN,vec3(0.,0.,1.))),3.2)*3.2;float sd=dot(vWN,sun);float s=smoothstep(-.35,.5,sd);
      float band=smoothstep(-.08,.18,sd)*(1.-smoothstep(.18,.5,sd));
      vec3 c=mix(tint,vec3(1.,.48,.2),band*.75);gl_FragColor=vec4(c*i*(.12+.9*s),1.);}` });
}
// Moon: the surface is painted once into an albedo map and a height map (maria, then craters at every size, power-law distributed,
// each with a dark bowl and a raised rim), so each frame costs only a texture lookup instead of per-pixel crater maths.
function bakeMoon() {
  const W = 1536, Hh = 768, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; return c; }, A = mk(), B = mk(), a = A.getContext('2d'), b = B.getContext('2d');
  let sd = 3; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  a.fillStyle = '#b3afa5'; a.fillRect(0, 0, W, Hh); b.fillStyle = '#808080'; b.fillRect(0, 0, W, Hh);
  const sprite = (ctx, x, y, r, sx, stops) => { for (const o of [0, -W, W]) { const X = x + o; if (X < -r * sx || X > W + r * sx) continue; ctx.save(); ctx.translate(X, y); ctx.scale(sx, 1); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(([t, c]) => g.addColorStop(t, c)); ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); } };
  const pos = () => { const u = rnd(), la = Math.asin(rnd() * 2 - 1); return [u * W, (0.5 - la / Math.PI) * Hh, 1 / Math.max(0.25, Math.cos(la))]; };
  for (let i = 0; i < 16; i++) { const [x, y, sx] = pos(), r = 70 + rnd() * 120; for (let k = 0; k < 7; k++) sprite(a, x + (rnd() - 0.5) * r * 1.2 * sx, y + (rnd() - 0.5) * r * 0.9, r * (0.35 + rnd() * 0.45), sx, [[0, 'rgba(46,47,54,.62)'], [0.7, 'rgba(50,51,58,.4)'], [1, 'rgba(60,60,66,0)']]); } // maria
  for (let i = 0; i < 3800; i++) {
    const [x, y, sx] = pos(), r = 1.6 + Math.pow(rnd(), 4.6) * 52, fresh = rnd() < 0.08;
    sprite(b, x, y, r * 1.45, sx, [[0, 'rgba(60,60,60,.95)'], [0.5 / 1.45, 'rgba(96,96,96,.8)'], [0.8 / 1.45, 'rgba(128,128,128,.5)'], [1 / 1.45, 'rgba(176,176,176,.9)'], [1.12 / 1.45, 'rgba(160,160,160,.5)'], [1, 'rgba(128,128,128,0)']]); // bowl + raised rim
    sprite(a, x, y, r * 1.3, sx, fresh ? [[0, 'rgba(140,136,128,.25)'], [0.8 / 1.3, 'rgba(235,230,218,.5)'], [1, 'rgba(235,230,218,0)']] : [[0, 'rgba(55,54,52,.22)'], [0.85 / 1.3, 'rgba(70,69,66,.1)'], [1, 'rgba(200,196,188,0)']]);
  }
  for (let i = 0; i < 9000; i++) { const [x, y] = pos(); a.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,250,240' : '30,30,34') + ',' + (0.03 + rnd() * 0.05) + ')'; a.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2); } // regolith grain
  const T = (c, lin) => { const t = new THREE.CanvasTexture(c); if (lin) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: T(A, true), bump: T(B, false) };
}
function moonMat() {
  const t = bakeMoon();
  return new THREE.ShaderMaterial({ uniforms: { sun: U.sun, map: { value: t.map }, bump: { value: t.bump } },
    vertexShader: `varying vec2 vU; varying vec3 vWN; varying vec3 vPos;
    void main(){vU=uv;vWN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vPos=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform vec3 sun; uniform sampler2D map,bump; varying vec2 vU; varying vec3 vWN; varying vec3 vPos;
    void main(){
      vec3 Wn=normalize(vWN),V=normalize(cameraPosition-vPos),T=normalize(cross(vec3(0.,1.,0.),Wn)),B=cross(Wn,T);
      vec2 e=vec2(1./1536.,1./768.);
      float du=texture2D(bump,vU+vec2(e.x,0.)).r-texture2D(bump,vU-vec2(e.x,0.)).r, dv=texture2D(bump,vU+vec2(0.,e.y)).r-texture2D(bump,vU-vec2(0.,e.y)).r;
      vec3 W=normalize(Wn-5.*(du*T+dv*B));
      vec3 alb=texture2D(map,vU).rgb;
      float mu0=max(dot(W,sun),0.),mu=max(dot(W,V),.12);
      float sh=mix(mu0,mu0/(mu0+mu)*1.5,.4)*smoothstep(-.03,.1,dot(Wn,sun));
      vec3 ed=normalize(vec3(-34.,-27.5,34.));
      vec3 col=alb*1.7*sh+alb*vec3(.5,.68,1.)*.2*max(dot(W,ed),0.)*(1.-.85*smoothstep(-.1,.2,dot(Wn,sun)))+alb*.004;
      gl_FragColor=vec4(col,1.);}` });
}
function diskMat(inner, outer, fade) {
  return new THREE.ShaderMaterial({ uniforms: { time: U.time, uIn: { value: inner }, uOut: { value: outer }, uFade: { value: fade } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vP; void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: NOISE + `uniform float time,uIn,uOut,uFade; varying vec2 vP;
    void main(){float r=length(vP),a=atan(vP.y,vP.x),t=time*.35*(8./pow(r,1.5));
      float n=fbm(vec3(cos(a+t)*r*.42,sin(a+t)*r*.42,r*.7));
      float ring=smoothstep(uIn,uIn+.9,r)*(1.-smoothstep(uOut*.7,uOut,r));
      float dop=.55+.65*(.5+.5*sin(a+1.1));
      vec3 hot=mix(vec3(1.,.93,.78),vec3(1.,.32,.08),smoothstep(uIn,uOut*.85,r));
      float v=(n*1.7+.25)*dop*ring*uFade; gl_FragColor=vec4(hot*v*1.5,v);}` });
}
// ---- Asteroid: a lumpy, elongated rock with overlapping impact craters and a dark, uneven surface, built once on the CPU.
// One cheap standard-material draw call (no ray-tracing, no textures): the displaced mesh and vertex colours carry all the detail.
const hs = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
const vn = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hs(ix, iy, iz), hs(ix + 1, iy, iz), u), L(hs(ix, iy + 1, iz), hs(ix + 1, iy + 1, iz), u), v), L(L(hs(ix, iy, iz + 1), hs(ix + 1, iy, iz + 1), u), L(hs(ix, iy + 1, iz + 1), hs(ix + 1, iy + 1, iz + 1), u), v), w); };
const fb = (x, y, z, o) => { let a = 0.5, t = 0; for (let i = 0; i < o; i++) { t += a * vn(x, y, z); x = x * 2.03 + 17; y = y * 2.03 + 9; z = z * 2.03 + 3; a *= 0.5; } return t; };
function makeRock() {
  let g = new THREE.IcosahedronGeometry(1, 28); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
  let sd = 5; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, C = [];
  for (let i = 0; i < 52; i++) { const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z); C.push([s * Math.cos(a), z, s * Math.sin(a), i < 5 ? 0.3 + rnd() * 0.14 : 0.05 + Math.pow(rnd(), 2) * 0.2]); }
  const P = g.attributes.position, col = new Float32Array(P.count * 3), v = new V();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    let r = 1 + (fb(v.x * 1.3 + 4, v.y * 1.3, v.z * 1.3, 4) - 0.5) * 0.5, cav = 0;
    for (const c of C) { const q = Math.acos(Math.min(1, v.x * c[0] + v.y * c[1] + v.z * c[2])) / c[3]; if (q < 1.35) { r += c[3] * (0.38 * (q < 1 ? -(1 - q * q) * (1 - 0.3 * q * q) : 0) + 0.14 * Math.exp(-Math.pow((q - 1.05) * 3.4, 2))); if (q < 1) cav += 1 - q * q; } }
    r += (fb(v.x * 9, v.y * 9, v.z * 9, 3) - 0.5) * 0.08 + (fb(v.x * 26, v.y * 26, v.z * 26, 2) - 0.5) * 0.04 + (vn(v.x * 62, v.y * 62, v.z * 62) - 0.5) * 0.014;
    P.setXYZ(i, v.x * r, v.y * r * 0.76, v.z * r * 0.88);
    const k = Math.max(0.05, (0.8 + 0.5 * fb(v.x * 5 + 9, v.y * 5, v.z * 5, 3) + (fb(v.x * 40, v.y * 40, v.z * 40, 1) - 0.5) * 0.4) * (1 - 0.35 * Math.min(1, cav)));
    col[i * 3] = 0.42 * k; col[i * 3 + 1] = 0.38 * k; col[i * 3 + 2] = 0.33 * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
const SPRITE = (rgb) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(' + rgb + ',1)'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; };

async function bakeSky(onP) {
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#01020a'; x.fillRect(0, 0, W, H);
  const n = eq(12.857, 27.13).normalize(), gc = eq(17.761, -28.94), u = gc.clone().sub(n.clone().multiplyScalar(gc.dot(n))).normalize(), v = n.clone().cross(u).normalize(); // real galactic plane + centre
  const B = { w: SPRITE('255,226,190'), b: SPRITE('200,216,255'), r: SPRITE('255,170,140'), d: SPRITE('1,2,8') };
  const G = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
  const core = (t) => { const d = Math.min(t, TAU - t); return 0.2 + 0.8 * Math.exp(-Math.pow(d / 0.9, 2)); };
  function at(t, off) { const p = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t)).addScaledVector(n, off).normalize(); return { x: (0.5 - Math.atan2(p.z, p.x) / TAU) * W, y: (0.5 - Math.asin(p.y) / Math.PI) * H, lat: Math.asin(p.y) }; }
  function put(sp, q, r, al, sy) {
    const sx = 1 / Math.max(0.2, Math.cos(q.lat)); x.globalAlpha = al;
    for (const o of [0, -W, W]) { const X = q.x + o; if (X < -r * sx - 2 || X > W + r * sx + 2) continue; x.save(); x.translate(X, q.y); x.scale(sx, sy || 1); x.drawImage(sp, -r, -r, r * 2, r * 2); x.restore(); }
  }
  const jobs = [];
  for (let i = 0; i < 3800; i++) jobs.push(() => { const t = Math.random() * TAU, q = at(t, G() * 0.16 * (1 + 0.6 * Math.random())), b = core(t); put(Math.random() < 0.5 ? B.w : Math.random() < 0.8 ? B.b : B.r, q, (14 + Math.random() * 60) * (0.6 + b * 0.8), (0.018 + Math.random() * 0.03) * b * 1.3); });
  for (let i = 0; i < 700; i++) jobs.push(() => { const t = Math.random() * TAU, q = at(t, G() * 0.06 + (Math.random() < 0.5 ? -1 : 1) * 0.02), b = core(t); put(B.d, q, 8 + Math.random() * 34, (0.06 + Math.random() * 0.09) * b, 0.5); });
  [['255,80,130', 0.9, 0.2, 90, 0.1], ['90,200,210', 3.8, -0.1, 120, 0.07], ['180,120,255', 5.2, 0.3, 80, 0.05]].forEach((a) => jobs.push(() => { const q = at(a[1], a[2]), s = SPRITE(a[0]); put(s, q, a[3], a[4]); }));
  for (let i = 0; i < 7000; i++) jobs.push(() => { const t = Math.random() * TAU, q = at(t, G() * 0.2), b = core(t); if (Math.random() > b + 0.1) return; x.globalAlpha = 0.12 + Math.random() * 0.5; x.fillStyle = Math.random() < 0.5 ? '#fff' : '#ffe9cf'; x.fillRect(q.x, q.y, 1, 1); });
  for (let i = 0; i < 3500; i++) jobs.push(() => { x.globalAlpha = 0.1 + Math.random() * 0.45; x.fillStyle = '#dfe8ff'; x.fillRect(Math.random() * W, Math.random() * H, 1, 1); });
  const step = 450; for (let i = 0; i < jobs.length; i += step) { for (let j = i; j < Math.min(jobs.length, i + step); j++) jobs[j](); onP((i + step) / jobs.length); await frame(); }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; t.anisotropy = 4; return t;
}

function makeStars() {
  const N = 5200, pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 3), ph = new Float32Array(N);
  const T = [[0.66, 0.78, 1], [0.82, 0.88, 1], [1, 1, 1], [1, 0.96, 0.84], [1, 0.82, 0.62], [1, 0.7, 0.58]];
  for (let i = 0; i < N; i++) {
    const a = R(0, TAU), b = Math.acos(R(-1, 1)), r = R(500, 850);
    pos.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3);
    size[i] = 0.7 + Math.pow(Math.random(), 5) * 3.2; ph[i] = Math.random(); col.set(T[(Math.random() * 6) | 0], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aPh; uniform float time,px; varying vec3 vC; varying float vA;
    void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*px;float tw=.72+.28*sin(time*(.8+aPh*2.)+aPh*40.);vC=aColor;vA=tw*clamp(aSize*.55,.22,1.);}`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){float d=length(gl_PointCoord-.5);float a=pow(smoothstep(.5,.0,d),2.2)*vA;gl_FragColor=vec4(vC*a*1.5,a);}` });
  const grp = new THREE.Group(); grp.add(new THREE.Points(g, m));
  // the brightest real stars at their real positions (RA hours, Dec deg, magnitude, colour index)
  const BS = { Sirius: [6.752, -16.716, -1.46, 1], Canopus: [6.399, -52.696, -0.74, 3], Arcturus: [14.261, 19.182, -0.05, 4], 'Alpha Cen': [14.66, -60.834, -0.27, 3], Vega: [18.616, 38.784, 0.03, 1], Capella: [5.278, 45.998, 0.08, 3], Rigel: [5.242, -8.202, 0.13, 0], Procyon: [7.655, 5.225, 0.34, 3], Betelgeuse: [5.919, 7.407, 0.5, 5], Altair: [19.846, 8.868, 0.76, 2], Aldebaran: [4.599, 16.509, 0.85, 4], Antares: [16.49, -26.432, 1.06, 5], Spica: [13.42, -11.161, 0.97, 0], Pollux: [7.755, 28.026, 1.14, 4], Fomalhaut: [22.961, -29.622, 1.16, 2], Deneb: [20.69, 45.28, 1.25, 2], Regulus: [10.14, 11.967, 1.35, 0], Polaris: [2.53, 89.264, 1.98, 3], Bellatrix: [5.419, 6.35, 1.64, 0], Alnilam: [5.604, -1.202, 1.7, 0], Alnitak: [5.679, -1.943, 1.77, 0], Mintaka: [5.533, -0.299, 2.23, 0], Saiph: [5.796, -9.67, 2.07, 0], Dubhe: [11.062, 61.751, 1.79, 4], Merak: [11.031, 56.382, 2.37, 2], Phecda: [11.897, 53.695, 2.44, 2], Megrez: [12.257, 57.033, 3.31, 2], Alioth: [12.9, 55.96, 1.77, 2], Mizar: [13.399, 54.925, 2.04, 2], Alkaid: [13.792, 49.313, 1.86, 0], Schedar: [0.675, 56.537, 2.24, 4], Caph: [0.153, 59.15, 2.27, 3], 'Gamma Cas': [0.945, 60.717, 2.47, 0], Ruchbah: [1.43, 60.235, 2.68, 2], Segin: [1.907, 63.67, 3.38, 0], Acrux: [12.443, -63.099, 0.77, 0], Mimosa: [12.795, -59.689, 1.25, 0], Gacrux: [12.519, -57.113, 1.64, 5], 'Delta Cru': [12.252, -58.749, 2.8, 0] };
  const names = Object.keys(BS), bp = new Float32Array(names.length * 3), bs = new Float32Array(names.length), bc = new Float32Array(names.length * 3), bph = new Float32Array(names.length), P = {};
  names.forEach((nm, i) => { const [ra, dec, mag, ci] = BS[nm], v = eq(ra, dec).multiplyScalar(700); P[nm] = v; bp.set([v.x, v.y, v.z], i * 3); bs[i] = Math.max(3.4, Math.min(9.5, 4.2 + (2.2 - mag) * 1.25)); bc.set(T[ci], i * 3); bph[i] = Math.random(); });
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bg.setAttribute('aSize', new THREE.BufferAttribute(bs, 1)); bg.setAttribute('aColor', new THREE.BufferAttribute(bc, 3)); bg.setAttribute('aPh', new THREE.BufferAttribute(bph, 1));
  grp.add(new THREE.Points(bg, m));
  const E = [['Betelgeuse', 'Bellatrix'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Betelgeuse'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'], ['Rigel', 'Saiph'], ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'], ['Caph', 'Schedar'], ['Schedar', 'Gamma Cas'], ['Gamma Cas', 'Ruchbah'], ['Ruchbah', 'Segin'], ['Acrux', 'Gacrux'], ['Mimosa', 'Delta Cru']];
  constLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(E.flatMap(([a, b]) => [P[a], P[b]])), new THREE.LineBasicMaterial({ color: 0x78aaff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  constLines.visible = false; grp.add(constLines); return grp;
}
function makeStreaks() {
  const N = 1400, p = new Float32Array(N * 6), e = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const a = R(0, TAU), r = 1.5 + Math.pow(Math.random(), 0.7) * 38, z = R(-220, 0), o = i * 6; p.set([Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a) * r, Math.sin(a) * r, z], o); e[i * 2] = 0; e[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { len: { value: 0 }, trav: { value: 0 }, amt: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aEnd; uniform float len,trav; varying float vE; void main(){vec3 p=position;p.z=mod(p.z+trav,220.)-220.;p.z-=aEnd*len;vE=1.-aEnd*.85;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform float amt; varying float vE; void main(){gl_FragColor=vec4(vec3(.62,.8,1.)*vE*amt,vE*amt);}` });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.visible = false; return l;
}

export async function init(onP) {
  try {
    cvs = document.createElement('canvas'); cvs.id = 'gl'; cvs.setAttribute('aria-hidden', 'true'); document.body.prepend(cvs);
    renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.debug.onShaderError = () => { failed = true; }; window.__const = () => toggleConstellations();
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92; renderer.setClearColor(0x01020a, 1);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2200);
    skyTex = await bakeSky((p) => onP(p * 0.8));
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })); scene.add(sky);
    stars = makeStars(); scene.add(stars);
    earth = new THREE.Group(); earth.position.set(0, -21.5, -10);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(20, 160, 96), earthMat()); const atmo = new THREE.Mesh(new THREE.SphereGeometry(21.1, 96, 64), atmoMat()); const clouds = new THREE.Mesh(new THREE.SphereGeometry(20.16, 128, 80), cloudMat()); planet.add(clouds); earth.add(planet, atmo); earth.userData.planet = planet; scene.add(earth);
    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(SPRITE('255,236,206')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false })); sunGlow.position.copy(SUN).multiplyScalar(850); sunGlow.scale.set(300, 300, 1);
    sunCore = new THREE.Sprite(sunGlow.material.clone()); sunCore.position.copy(sunGlow.position); sunCore.scale.set(46, 46, 1); scene.add(sunGlow, sunCore);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 96, 64), moonMat()); moon.position.set(34, 6, -44); scene.add(moon);
    gem = new THREE.Mesh(makeRock(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); gem.rotation.set(0.5, 0.4, 0.2);
    scene.add(gem); const dl = new THREE.DirectionalLight(0xfff1dc, 2.6); dl.position.copy(SUN).multiplyScalar(30); const ef = new THREE.DirectionalLight(0x5b8ee0, 0.45), fl = new THREE.DirectionalLight(0xfff0dc, 2.2); ef.position.set(-6, -14, 9); fl.position.set(-7, 8, 9); scene.add(dl, ef, fl, new THREE.AmbientLight(0x8890a0, 0.16)); // sun key, blue Earthshine from below
    hole = new THREE.Group(); hole.position.copy(HOLE);
    hole.add(new THREE.Mesh(new THREE.SphereGeometry(3, 64, 48), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    const disk = new THREE.Mesh(new THREE.RingGeometry(3.6, 16, 160, 1), diskMat(3.6, 16, 1)); disk.rotation.x = -Math.PI / 2 + 0.22; hole.add(disk);
    const lens = new THREE.Mesh(new THREE.RingGeometry(3.05, 7.4, 128, 1), diskMat(3.05, 7.4, 0.9)); lens.userData.billboard = true; hole.add(lens);
    const pr = new THREE.Mesh(new THREE.RingGeometry(3.08, 3.32, 128, 1), new THREE.MeshBasicMaterial({ color: 0xffe9c8, side: THREE.DoubleSide, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); pr.userData.billboard = true; hole.add(pr);
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(SPRITE('255,150,70')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.26 })); halo.scale.set(46, 46, 1); hole.add(halo);
    disks = [disk, lens, pr]; scene.add(hole);
    streaks = makeStreaks(); camera.add(streaks); scene.add(camera);
    meteor = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V(0, 0, 0), new V(-14, 5, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); meteor.visible = false; camera.add(meteor);
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.65, 0.82); composer.addPass(bloom); composer.addPass(new OutputPass());
    resize(); addEventListener('resize', resize);
    addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth * 2 - 1; ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
    new MutationObserver(skinTint).observe(root, { attributes: true, attributeFilter: ['data-skin'] }); skinTint();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ready) loop(performance.now()); });
    onP(1); return true;
  } catch (e) { failed = true; throw e; }
}
function skinTint() { const mac = root.dataset.skin === 'mac'; U.tint.value.set(mac ? '#ffb067' : '#4cb8ff'); }
function resize() {
  if (!renderer) return; const dpr = Math.min(devicePixelRatio || 1, quality > 1 ? 1.5 : 1.1), w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h); bloom.setSize(w * dpr / 2, h * dpr / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix(); lastFov = camera.fov; U.px.value = dpr * Math.max(0.8, h / 900);
  bloom.enabled = quality > 1 && !matchMedia('(pointer:coarse)').matches;
}
export async function warmup() {
  try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
  camera.position.copy(HOLE).add(new V(8, 3, 22)); camera.lookAt(HOLE);
  for (let i = 0; i < 3; i++) { composer.render(); await frame(); }
  const gl = renderer.getContext(); if (gl.isContextLost()) failed = true;
  ready = !failed; if (ready) { cvs.classList.add('on'); const old = document.getElementById('space'); if (old) old.style.display = 'none'; running = true; last = 0; requestAnimationFrame(loop); }
}
export const ok = () => ready && !failed;
export function toggleConstellations() { if (!constLines) return false; constLines.visible = !constLines.visible; const m = constLines.material; m.opacity = constLines.visible ? 0.75 : 0; return constLines.visible; }
export function jump() { if (/[?&]nojump/.test(location.search)) { introT = 1; return; } introT = 0; state.warp = Math.max(state.warp, 1); }

const posC = new THREE.CatmullRomCurve3([[0, 0.3, 7], [1.5, 3, 2], [9, 8, -14], [24, 9, -34], [14, 12, -88], [-18, 12, -118], [-30, 13.5, -130], [-37, 13.5, -140]].map((a) => new V(...a)));
const lookC = new THREE.CatmullRomCurve3([[0, -2.4, -30], [6, 1, -22], [30, 7, -42], [-6, 12, -100], [-66, 12, -160], [-84, 11, -170], [-84, 11, -170], [-84, 11, -170]].map((a) => new V(...a)));
const INTRO_OFF = new V(10, 3, 26);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const A = new V(), B = new V(), FROM = new V(), A0 = new V(), B0 = new V(), LOOK = new V();
let lastFov = -1;

function loop(now) {
  if (!ready || document.hidden) { running = false; return; }
  running = true; const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  U.time.value += dt; px += (tx - px) * 0.05; py += (ty - py) * 0.05;
  if (SC.vel > 1.8) state.warp = Math.max(state.warp, Math.min(0.55, (SC.vel - 1.8) * 0.25));
  const w = state.warp; state.warp = Math.max(0, w - dt * 0.5); U.warp.value = w;
  cp += (SC.p - cp) * Math.min(1, dt * 3.2); const t = Math.min(0.999, Math.max(0, cp));
  posC.getPoint(t, A); lookC.getPoint(t, B);
  let fov = 55 + Math.min(10, SC.vel * 3) + w * 38;
  if (introT < 1) { // hyperspace jump: from the black hole to Earth orbit
    introT += dt / 3.6; const k = ease(Math.min(1, introT)); FROM.copy(HOLE).add(INTRO_OFF);
    posC.getPoint(0, A0); lookC.getPoint(0, B0); A.lerpVectors(FROM, A0, k); B.lerpVectors(HOLE, B0, Math.min(1, k * 1.6));
    state.warp = Math.max(state.warp, Math.sin(Math.min(1, introT) * Math.PI) * 0.95);
    fov = 55 + Math.sin(Math.min(1, introT) * Math.PI) * 55;
  }
  camera.position.set(A.x + px * 0.7, A.y - py * 0.45, A.z); camera.lookAt(B); camera.rotation.z += px * -0.015; if (Math.abs(fov - lastFov) > 0.01) { lastFov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
  earth.userData.planet.rotation.y += dt * 0.012; U.rotY.value = earth.userData.planet.rotation.y; U.qual.value = quality > 0 ? 1 : 0; earth.position.y = -21.5 - t * 14;
  // slow tumble, like a real asteroid
  gem.rotation.y += dt * 0.09 + px * 0.006; gem.rotation.x += dt * 0.035 - py * 0.003; const gp = 1 - Math.min(1, t * 5);
  gem.position.set(4.7 + px * 0.5, 2.15 - py * 0.3, -3.2 - (1 - gp) * 30); gem.scale.setScalar((0.35 + gp * 0.65) * 1.2);
  disks.forEach((d) => { if (d.userData.billboard) d.quaternion.copy(camera.quaternion); }); hole.children[1].rotation.z += dt * 0.02;
  stars.rotation.y += dt * 0.002;
  const sm = streaks.material.uniforms; streaks.visible = w > 0.03; if (streaks.visible) { sm.len.value = w * 70; sm.amt.value = Math.min(0.6, w * 0.7); travel += dt * (60 + w * 520); sm.trav.value = travel; }
  bloom.strength = 0.55 + w * 0.5 + Math.max(0, (t - 0.55) / 0.45) * 0.25;
  { const look = LOOK.copy(B).sub(A).normalize(), f = Math.max(0, Math.min(1, (look.dot(SUN) - 0.55) / 0.42)), sf = f * f * (3 - 2 * f); sunGlow.material.opacity = sf * 0.55; sunCore.material.opacity = sf; }
  tMet -= dt * (1 + SC.vel); if (tMet < 0 && !meteor.visible) { tMet = R(8, 16); meteor.position.set(R(-22, 8), R(8, 16), -40); meteor.visible = true; meteor.userData.t = 0; Sfx.meteor(); }
  if (meteor.visible) { const m = meteor.userData; m.t += dt; meteor.position.x += 60 * dt; meteor.position.y -= 24 * dt; meteor.material.opacity = Math.max(0, Math.sin(Math.min(1, m.t / 0.7) * Math.PI)); if (m.t > 0.7) meteor.visible = false; }
  composer.render();
  if (quality > 0) { slow = dt > 0.026 ? slow + 1 : Math.max(0, slow - 1); if (slow > 45) { quality--; slow = 0; resize(); } }
  requestAnimationFrame(loop);
}
