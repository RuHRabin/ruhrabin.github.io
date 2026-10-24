import{c as w,d as u,j as y,k as S,l as E,m as T,o as A,p as R}from"./chunk-L2ODXVS6.js";var z=(r,i,s)=>Math.min(s,Math.max(i,r));function C({onScale:r=()=>{},onSteps:i=()=>{}}={}){return{scale:1,steps:200,avg:0,capped:!1,capAvg:0,win:0,sum:0,skip:0,hold:0,fast:0,slow:0,prevAvg:0,lastDown:!1,noGain:0,descentBase:0,label(){return(this.capped?"capped ":"auto ")+this.scale.toFixed(1)+"x"},setSteps(s){this.steps=s,i(s),this.hold=8,this.skip=5},setScale(s){this.scale=Math.round(z(s,.5,1)*10)/10,r(this.scale),this.skip=5},sample(s){if(s>250)return;if(this.skip>0){this.skip--;return}if(this.sum+=s,this.win++,this.win<30)return;let t=this.sum/this.win;if(this.avg=t,this.sum=0,this.win=0,this.hold>0&&this.hold--,this.lastDown&&(this.lastDown=!1,t>this.prevAvg*.9?this.noGain++:this.noGain=0,this.noGain>=2&&t>=28&&t<=38&&t>this.descentBase*.9)){this.capped=!0,this.capAvg=t,this.noGain=0,this.descentBase=0,this.fast=0,this.slow=0,this.scale!==1&&this.setScale(1),this.steps!==200&&this.setSteps(200);return}if(this.capped)if(t<this.capAvg*.6||t>this.capAvg*1.35)this.capped=!1,this.noGain=0,this.descentBase=0;else return;if(t>22){this.fast=0;let a=!1;this.steps>200&&this.hold===0?(this.setSteps(200),a=!0):this.scale>.5?(this.setScale(this.scale-.1),a=!0):this.steps>140&&++this.slow>=2&&this.hold===0&&(this.slow=0,this.setSteps(140),a=!0),a&&(this.descentBase===0&&(this.descentBase=t),this.prevAvg=t,this.lastDown=!0)}else t<14?(this.slow=0,this.noGain=0,this.descentBase=0,this.scale<1?this.setScale(this.scale+.1):this.steps<200&&this.hold===0?this.setSteps(200):t<9&&++this.fast>=4&&this.steps===200&&this.hold===0&&(this.fast=0,this.setSteps(260))):(this.fast=0,this.slow=0,this.noGain=0,this.descentBase=0)}}}var M=`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,k=`
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
`,H=50;function W(r){if(!r)throw new Error("canvas missing");let i=new A({canvas:r,antialias:!1,alpha:!1,stencil:!1,powerPreference:"default"});i.setClearColor(0,1);let s={failed:!1,cssW:0,cssH:0};i.debug.onShaderError=(e,o,l,d)=>{s.failed=!0;try{console.error("[hole] shader error",e.getProgramInfoLog(o),e.getShaderInfoLog(d),e.getShaderInfoLog(l))}catch{}};let t=new R,a=new E(H,1,.1,500),c={uRes:{value:new u(1,1)},uTime:{value:0},uCamPos:{value:a.position},uCamMat:{value:a.matrixWorld},uTanHalfFov:{value:Math.tan(w.degToRad(H/2))},uAspect:{value:1},uWarp:{value:0},uFade:{value:1}},n=new S({vertexShader:M,fragmentShader:k,uniforms:c,defines:{STEPS:200},depthTest:!1,depthWrite:!1,transparent:!1}),h=new y(new T(2,2),n);h.frustumCulled=!1,h.renderOrder=-1,t.add(h);let f=new u,m=0,g=C({onScale:()=>x(),onSteps:e=>{n.defines.STEPS=e,n.needsUpdate=!0}});function x(){let e=Math.max(1,r.clientWidth),o=Math.max(1,r.clientHeight),l=Math.min(window.devicePixelRatio||1,1.5)*g.scale;e===s.cssW&&o===s.cssH&&Math.abs(l-m)<.001||(s.cssW=e,s.cssH=o,m=l,i.setPixelRatio(l),i.setSize(e,o,!1),i.getDrawingBufferSize(f),c.uRes.value.set(f.x,f.y),a.aspect=e/o,a.updateProjectionMatrix(),c.uAspect.value=e/o)}let v=null,p=null;return r.addEventListener("webglcontextlost",e=>{e.preventDefault(),v&&v()},!1),r.addEventListener("webglcontextrestored",()=>{p&&p()},!1),Object.assign(s,{renderer:i,scene:t,camera:a,uniforms:c,material:n,quality:g,resize:x,setCamera(e,o,l,d,b,P){a.position.set(e,o,l),a.up.set(0,1,0),a.lookAt(d,b,P),a.updateMatrixWorld(!0)},setFrame(e,o,l){c.uTime.value=e,c.uWarp.value=o,c.uFade.value=l},ready(){return typeof i.compileAsync=="function"?i.compileAsync(t,a).catch(()=>{}):Promise.resolve()},render(){i.render(t,a)},onLost(e){v=e},onRestored(e){p=e},dispose(){i.dispose()}})}export{k as bhFragment,M as bhVertex,W as createHole};
