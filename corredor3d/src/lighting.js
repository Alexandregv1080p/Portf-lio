/* Iluminação "de jogo": ambiente de reflexo (IBL), feixes volumétricos das lâmpadas, poeira que só aparece na luz,
   cookie da lanterna. Tudo sintético, sem arquivos. */
import * as THREE from 'three';

/* ---- ambiente de reflexo: um corredor escuro com tubos de luz no teto (dá brilho de verdade a metal, porta e piso molhado) ---- */
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(14, 5, 60), new THREE.MeshBasicMaterial({ color: 0x08090b, side: THREE.BackSide })));
  const strip = new THREE.MeshBasicMaterial(); strip.color.setRGB(7, 6.4, 5.6);
  for (let z = -26; z <= 26; z += 6) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 1.5), strip); m.position.set(0, 2.4, z); s.add(m); }
  const panel = new THREE.MeshBasicMaterial(); panel.color.setRGB(0.5, 0.6, 0.8);       /* reflexo frio de uma parede lateral */
  for (const x of [-6.5, 6.5]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 1.4), panel); m.position.set(x, 1.2, 0); m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; s.add(m); }
  const tex = pm.fromScene(s, 0.03).texture; pm.dispose();
  return tex;
}

/* ---- feixe volumétrico: cone aditivo cuja intensidade depende do ângulo de visão (mais denso quando você olha "através" dele) ---- */
const shaftVert = `varying vec3 vN; varying vec3 vV; varying float vT;
  uniform float uLen;
  void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vV = -mv.xyz; vN = normalize(normalMatrix*normal); vT = clamp(-position.y/uLen, 0., 1.); gl_Position = projectionMatrix*mv; }`;
const shaftFrag = `varying vec3 vN; varying vec3 vV; varying float vT; uniform float uK; uniform vec3 uColor; uniform float uTime;
  void main(){
    float nv = abs(dot(normalize(vN), normalize(vV)));
    float core = nv * nv;
    float fall = pow(max(1. - vT, 0.0001), 1.1) * smoothstep(0., .08, vT);     /* pow de base negativa = NaN: o bloom espalhava isso e a tela ficava preta */
    float shimmer = .9 + .1*sin(uTime*1.7 + vT*8.);
    gl_FragColor = vec4(uColor, core*fall*uK*shimmer);
  }`;
export function makeShaft(radius, length) {
  const g = new THREE.ConeGeometry(radius, length, 40, 1, true); g.translate(0, -length / 2, 0);
  const m = new THREE.ShaderMaterial({
    vertexShader: shaftVert, fragmentShader: shaftFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uLen: { value: length }, uTime: { value: 0 } },
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.userData.noAO = true; mesh.visible = false; mesh.renderOrder = 5;
  return mesh;
}

/* ---- halo suave em volta de cada lâmpada ---- */
let haloTex = null;
export function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); haloTex = new THREE.CanvasTexture(c); haloTex.colorSpace = THREE.SRGBColorSpace; return haloTex;
}

/* ---- cookie da lanterna: ponto quente + halo com leve irregularidade (como uma lanterna de verdade) ---- */
export function flashlightCookie() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#e8e8e8'); gr.addColorStop(0.8, '#9a9a9a'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 60; i++) {                               /* irregularidades do refletor */
    const a = Math.random() * 6.283, r = 30 + Math.random() * 90, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, rr = 6 + Math.random() * 18;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, `rgba(0,0,0,${0.02 + Math.random() * 0.05})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.globalCompositeOperation = 'source-over'; g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 6; g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, 6.283); g.stroke();   /* anel do refletor */
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---- poeira: só se vê dentro da lanterna ou dos feixes das lâmpadas (partículas iluminadas de verdade) ---- */
const N_LAMPS = 6;
export function makeDust(count) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count), base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { base[i * 3] = (Math.random() - 0.5) * 3.2; base[i * 3 + 1] = Math.random() * 3.2; base[i * 3 + 2] = -Math.random() * 16; seed[i] = Math.random() * 6.283; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const lampPos = Array.from({ length: N_LAMPS }, () => new THREE.Vector3(0, -99, 0)), lampCol = Array.from({ length: N_LAMPS }, () => new THREE.Color(0)), lampI = new Array(N_LAMPS).fill(0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uSpotPos: { value: new THREE.Vector3() }, uSpotDir: { value: new THREE.Vector3(0, 0, -1) }, uSpotCos: { value: 0.9 }, uSpotI: { value: 1 },
      uLampPos: { value: lampPos }, uLampCol: { value: lampCol }, uLampI: { value: lampI }, uSize: { value: 0.017 }, uScale: { value: 500 }, uOpacity: { value: 0.75 }, uTint: { value: new THREE.Color(1, 0.93, 0.82) },
    },
    vertexShader: `attribute float aSeed; uniform vec3 uSpotPos, uSpotDir; uniform float uSpotCos, uSpotI, uSize, uScale, uOpacity; uniform vec3 uLampPos[${N_LAMPS}]; uniform vec3 uLampCol[${N_LAMPS}]; uniform float uLampI[${N_LAMPS}]; uniform vec3 uTint;
      varying float vA; varying vec3 vCol;
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.);
        vec3 toP = wp.xyz - uSpotPos; float d = length(toP);
        float c = dot(toP/max(d,.001), uSpotDir);
        float spot = smoothstep(uSpotCos, uSpotCos + .06, c) * uSpotI / (1. + d*.12);
        vec3 col = uTint * spot;
        for (int i = 0; i < ${N_LAMPS}; i++) {
          vec3 lp = uLampPos[i]; float depth = lp.y - wp.y; float r = length(wp.xz - lp.xz);
          float R = .25 + max(depth, 0.) * .5;
          float f = (1. - smoothstep(R*.4, R, r)) * step(0., depth) * uLampI[i] / (1. + depth*.4);
          col += uLampCol[i] * f;
        }
        float b = max(max(col.r, col.g), col.b);
        vec4 mv = viewMatrix*wp;
        gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(uSize * uScale / max(-mv.z, .1) * (.7 + b*.6), 1., 6.);
        vA = clamp(b, 0., 1.) * uOpacity * (.55 + .45*sin(aSeed*3. + wp.x*2. + wp.z));
        vCol = col / max(b, .001);
      }`,
    fragmentShader: `varying float vA; varying vec3 vCol;
      void main(){ vec2 p = gl_PointCoord - .5; float r = length(p); float a = smoothstep(.5, .1, r) * vA; if (a < .004) discard; gl_FragColor = vec4(vCol, a); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.noAO = true;
  return { points: pts, mat, base, lampPos, lampCol, lampI, N_LAMPS };
}
