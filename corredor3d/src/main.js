import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

const G = 'https://github.com/Alexandregv1080p';
const PROJECTS = [
  { name: 'Browser Engine', cat: 'SYSTEMS', stack: 'C++ · HTML/CSS parser · layout · rendering', url: G,
    desc: 'Navegador construído do zero em C++ — parser de HTML/CSS, árvore de layout e motor de renderização próprios.' },
  { name: 'SO · Raspberry Pi', cat: 'SYSTEMS', stack: 'C · Assembly · bare-metal', url: G,
    desc: 'Sistema operacional bare-metal do zero para Raspberry Pi: boot, gerência de memória e I/O escritos à mão.' },
  { name: 'Dev Codex', cat: 'FULLSTACK', stack: '.NET 8 · Vue 3 · Kotlin · PostgreSQL · SignalR', url: G + '/Dev-Codex',
    desc: 'Plataforma de cursos online com web em Vue 3, app Android em Kotlin e painel admin. Chat em tempo real via SignalR, CI/CD e Terraform.' },
  { name: 'MinX', cat: 'FULLSTACK', stack: 'NestJS · Next.js · MySQL · Redis · AWS SQS/Lambda', url: G + '/MinX',
    desc: 'Rede social estilo Twitter com API NestJS modular, fanout assíncrono da timeline via SQS + Lambda e deploy em Kubernetes.' },
  { name: 'Fast Trade', cat: 'FULLSTACK', stack: 'Java · Spring Boot · Angular 17 · Kotlin', url: G + '/Fast-Trade',
    desc: 'Marketplace de compra, venda e troca: JWT, chat em tempo real (WebSocket STOMP), painel Angular e app Android em Compose.' },
  { name: 'Pagamentos API', cat: 'API', stack: '.NET 8 · Angular 17 · RabbitMQ · SignalR', url: G + '/PagamentosApi',
    desc: 'Pagamentos assíncronos com RabbitMQ (consumo idempotente, retry com TTL e DLQ), tempo real por SignalR e testes.' },
  { name: 'Agenda Atenta', cat: 'WEB', stack: 'Laravel 13 · PHP · MySQL · Web Push', url: G + '/Agenda-Atenta',
    desc: 'Organizador de rotinas semanais com arrastar-e-soltar, recorrência, anotações em Markdown e notificações via Web Push.' },
  { name: 'Eventus', cat: 'WEB', stack: 'Angular 21 · Signals · Bootstrap 5', url: G + '/Eventus',
    desc: 'Marketplace do ecossistema de eventos: SPA em Angular 21 (zoneless, signals) com múltiplos perfis e API desacoplada.' },
];

/* ---------------------------------------------------------------- renderer */
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
} catch (e) {
  console.error('WebGL init falhou:', e);
  $('nogl').hidden = false; $('loader').remove(); throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !coarse;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030102);
scene.fog = new THREE.FogExp2(0x030102, 0.1);

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

/* --------------------------------------------------------------- materiais */
const manager = new THREE.LoadingManager(() => $('loader').classList.add('done'));
const tl = new THREE.TextureLoader(manager);
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
function pbr(name, rx, ry, opts = {}) {
  const load = (k, srgb) => {
    const t = tl.load(`tex/${name}_${k}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const { metal: hasMetalMap, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ map: load('Color', true), normalMap: load('NormalGL'), roughnessMap: load('Roughness'), ...rest });
  if (hasMetalMap) m.metalnessMap = load('Metalness');
  return m;
}

/* ---------------------------------------------------------------- corredor */
const W = 3.2, H = 3.2, DOOR0 = 9, SP = 5, L = DOOR0 + SP * PROJECTS.length + 9;

const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), pbr('floor', W / 1.4, L / 1.4, { color: 0x6f6568, roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -L / 2); floor.receiveShadow = true; scene.add(floor);

const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), pbr('ceil', W / 2, L / 2, { color: 0x6d6468 }));
ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -L / 2); ceil.receiveShadow = true; scene.add(ceil);

const wallMat = pbr('wall', L / 2.6, H / 2.6, { color: 0xa39390 });
for (const s of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat);
  wall.rotation.y = -s * Math.PI / 2; wall.position.set(s * W / 2, H / 2, -L / 2); wall.receiveShadow = true; scene.add(wall);
}
const endWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
endWall.position.set(0, H / 2, -L); scene.add(endWall);

const metal = pbr('metal', 4, 1, { color: 0x8a8486, metal: true, metalness: 0.9 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0c0809, roughness: 0.55, metalness: 0.6 });

/* rodapé + tubulações no teto (dão sombra e escala sob a lanterna) */
for (const s of [-1, 1]) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, L), darkMetal);
  base.position.set(s * (W / 2 - 0.025), 0.09, -L / 2); base.castShadow = base.receiveShadow = true; scene.add(base);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, L, 14), metal);
  pipe.rotation.x = Math.PI / 2; pipe.position.set(s * (W / 2 - 0.3), H - 0.22, -L / 2); pipe.castShadow = true; scene.add(pipe);
}
for (let z = 3; z < L; z += 4) {          /* suportes das tubulações */
  const br = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.05, 0.08), darkMetal);
  br.position.set(0, H - 0.12, -z); br.castShadow = true; scene.add(br);
}

/* --------------------------------------------------------------- portas */
function plateTexture(i, p) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#120608'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#ff2a2a'; g.lineWidth = 3; g.strokeRect(3, 3, 250, 90);
  g.fillStyle = '#ff2a2a'; g.font = '700 38px monospace'; g.textAlign = 'center'; g.fillText(String(i + 1).padStart(2, '0'), 128, 44);
  g.fillStyle = '#e8c9c9'; g.font = '600 16px monospace'; g.fillText(p.cat, 128, 74);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t;
}
const doors = [];                    /* { pivot, leaf, open, z } */
const leaves = [];
PROJECTS.forEach((p, i) => {
  const side = i % 2 ? 1 : -1, z = -(DOOR0 + i * SP);
  const g = new THREE.Group();
  g.position.set(side * (W / 2 - 0.02), 0, z);
  g.rotation.y = -side * Math.PI / 2;           /* +z local → aponta para o centro do corredor */
  const DW = 1.15, DH = 2.3;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.28, DH + 0.14, 0.12), darkMetal);
  frame.position.set(0, (DH + 0.14) / 2, -0.02); frame.castShadow = frame.receiveShadow = true; g.add(frame);
  /* fresta de luz por trás da porta */
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshBasicMaterial({ color: 0xffa060 }));
  glow.position.set(0, DH / 2, -0.015); g.add(glow);
  const pivot = new THREE.Group(); pivot.position.set(-DW / 2, 0, 0.0); g.add(pivot);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 0.06), metal);
  leaf.position.set(DW / 2, DH / 2, 0.02); leaf.castShadow = leaf.receiveShadow = true; leaf.userData.i = i; pivot.add(leaf);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: plateTexture(i, p), emissive: 0xffffff, emissiveMap: plateTexture(i, p), emissiveIntensity: 0.12 }));
  plate.position.set(DW / 2, 1.75, 0.055); pivot.add(plate);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), darkMetal);
  handle.position.set(DW - 0.12, 1.05, 0.07); handle.castShadow = true; pivot.add(handle);
  scene.add(g);
  doors.push({ pivot, z, side, open: 0 }); leaves.push(leaf);
});

/* --------------------------------------------------------------- luzes */
scene.add(new THREE.HemisphereLight(0x2a1218, 0x050203, 0.07));

/* lanterna: SpotLight presa à câmera; o alvo segue o mouse */
const spot = new THREE.SpotLight(0xfff0dc, coarse ? 90 : 150, 26, Math.PI / 7.5, 0.6, 1.4);
spot.position.set(0.22, -0.22, 0.1);
spot.castShadow = !coarse;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 26;
camera.add(spot);
const aimTarget = new THREE.Object3D(); scene.add(aimTarget); spot.target = aimTarget;

/* lâmpadas de teto: poucas, fracas e instáveis */
const fixtures = [];
for (let z = 6, k = 0; z < L - 3; z += 8, k++) {
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 1.1), new THREE.MeshBasicMaterial({ color: 0xffe6c4 }));
  tube.position.set(0, H - 0.04, -z); scene.add(tube);
  const light = new THREE.PointLight(0xffd7a8, 3, 11, 2); light.position.set(0, H - 0.3, -z); scene.add(light);
  fixtures.push({ tube, light, base: 3, bad: k % 2 === 1, off: 0, seed: Math.random() * 100 });
}
const emergency = new THREE.PointLight(0xff1a1a, 22, 14, 2); emergency.position.set(0, 2.2, -(L - 2.2)); scene.add(emergency);
const endDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), new THREE.MeshBasicMaterial({ color: 0xff5a3a }));
endDoor.position.set(0, 1.2, -L + 0.02); scene.add(endDoor);

/* poeira flutuando perto da câmera */
const DUST = coarse ? 160 : 380;
const dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - 0.5) * W; dustPos[i * 3 + 1] = Math.random() * H; dustPos[i * 3 + 2] = -Math.random() * 14; dustSeed[i] = Math.random() * 6.28; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dc = document.createElement('canvas'); dc.width = dc.height = 32;
const dg = dc.getContext('2d'), grad = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); dg.fillStyle = grad; dg.fillRect(0, 0, 32, 32);
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe2c8, size: 0.035, map: new THREE.CanvasTexture(dc), transparent: true, opacity: 0.4, depthWrite: false }));
dust.frustumCulled = false; scene.add(dust);

/* o vulto: só aparece se você ficar parado, e só se a luz o alcançar */
const shade = new THREE.Group();
const sMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
const sBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 1.45, 14), sMat); sBody.position.y = 0.95; shade.add(sBody);
const sHead = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), sMat); sHead.position.y = 1.85; shade.add(sHead);
for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); e.position.set(x, 1.87, 0.17); shade.add(e); }
shade.visible = false; scene.add(shade);

/* ---------------------------------------------------------- pós-processamento */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (!coarse) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.88));
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, flick: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float flick; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d = vUv - .5; float r = length(d);
      float ca = .0012 + r*r*.012;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d*ca).b);
      c += (h(vUv*vec2(1920.,1080.) + time) - .5) * .06;
      c *= smoothstep(.95, .28, r*1.12);
      c *= .94 + .06*sin(vUv.y*900.);
      gl_FragColor = vec4(c*flick, 1.);
    }`,
});
composer.addPass(film);
composer.addPass(new OutputPass());

/* -------------------------------------------------------------- interação */
const aim = new THREE.Vector2(0.1, -0.05), aimGoal = new THREE.Vector2(0.1, -0.05);
let lastMove = -1e9, interacted = false;
addEventListener('pointermove', (e) => {
  aimGoal.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  lastMove = performance.now();
  if (!interacted) { interacted = true; $('hint').classList.add('gone'); }
}, { passive: true });

const ray = new THREE.Raycaster();
const projEl = $('proj'), heroEl = $('hero'), endEl = $('end'), depthEl = $('depth');
let cardHover = false, shownDoor = -1;
projEl.addEventListener('pointerenter', () => { cardHover = true; });
projEl.addEventListener('pointerleave', () => { cardHover = false; });
function showDoor(i) {
  if (i === shownDoor) return;
  shownDoor = i;
  if (i < 0) { projEl.classList.remove('show'); return; }
  const p = PROJECTS[i];
  projEl.href = p.url;
  projEl.querySelector('.cat').textContent = p.cat;
  projEl.querySelector('h2').textContent = p.name;
  projEl.querySelector('.stack').textContent = p.stack;
  projEl.querySelector('p').textContent = p.desc;
  projEl.classList.add('show');
}

/* ------------------------------------------------------------------ loop */
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
let camZ = -1, lastScrollT = performance.now(), lastY = scrollY, bobPhase = 0, vel = 0;
addEventListener('scroll', () => { lastScrollT = performance.now(); }, { passive: true });
let shadeOn = false, shadeStart = 0, shadeZ = 0;
let lastT = performance.now(), elapsed = 0;
let running = true;
document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { lastT = performance.now(); tick(); } });

function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now; elapsed += dt; const t = elapsed;

  /* câmera: scroll → posição ao longo do corredor (suavizado) */
  const p = clamp(scrollY / maxScroll(), 0, 1);
  const goalZ = -1 - p * (L - 7.5);
  const prev = camZ;
  camZ = lerp(camZ, goalZ, 1 - Math.pow(0.002, dt));
  vel = lerp(vel, Math.abs(camZ - prev) / Math.max(dt, 1e-3), 0.1);
  bobPhase += Math.abs(camZ - prev) * 2.6;
  const mv = clamp(vel / 1.2, 0, 1);
  const bobY = reduce ? 0 : Math.sin(bobPhase) * 0.035 * mv, bobX = reduce ? 0 : Math.cos(bobPhase * 0.5) * 0.02 * mv;

  /* sem mouse por alguns segundos (celular): a luz vagueia sozinha */
  if (now - lastMove > 3500) aimGoal.set(Math.sin(t * 0.45) * 0.5, Math.cos(t * 0.33) * 0.18 - 0.04);
  aim.lerp(aimGoal, 1 - Math.pow(0.0005, dt));

  camera.position.set(bobX, 1.62 + bobY, camZ);
  camera.rotation.set(aim.y * 0.16, -aim.x * 0.38, bobX * 0.5);   /* a cabeça acompanha a luz, de leve */

  /* lanterna: o alvo é exatamente a posição do mouse no mundo */
  camera.updateMatrixWorld();
  ray.setFromCamera(aim, camera);
  ray.far = 20;
  aimTarget.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 9);
  spot.intensity = (coarse ? 90 : 150) * (0.96 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.1) * 0.02);

  /* porta sob a luz → abre e mostra o projeto */
  const hit = ray.intersectObjects(leaves, false)[0];
  const lookedAt = hit && hit.distance < 6.5 ? hit.object.userData.i : -1;
  if (lookedAt >= 0 || !cardHover) showDoor(lookedAt);
  doors.forEach((d, i) => {
    const goal = i === shownDoor ? 1 : 0;
    d.open = lerp(d.open, goal, 1 - Math.pow(0.02, dt));
    d.pivot.rotation.y = -d.open * 0.95;
  });

  /* lâmpadas instáveis */
  let fl = 1;
  fixtures.forEach((f) => {
    let k = 1;
    if (!reduce) {
      const n = Math.sin(t * 31 + f.seed) * Math.sin(t * 13.7 + f.seed * 2);
      if (f.bad && n > 0.78) k = 0.12; else if (n > 0.93) k = 0.35;
    }
    f.light.intensity = f.base * k; f.tube.material.color.setScalar(0.35 + 0.65 * k);
    fl = Math.min(fl, 0.9 + 0.1 * k);
  });
  emergency.intensity = 22 * (0.75 + 0.25 * Math.sin(t * 3.2));
  film.uniforms.flick.value = reduce ? 1 : fl;
  film.uniforms.time.value = t * 60 % 1000;

  /* poeira acompanha a câmera */
  const dp = dustGeo.attributes.position;
  for (let i = 0; i < DUST; i++) {
    let z = dustPos[i * 3 + 2];
    dp.array[i * 3] = dustPos[i * 3] + Math.sin(t * 0.3 + dustSeed[i]) * 0.15;
    dp.array[i * 3 + 1] = dustPos[i * 3 + 1] + Math.cos(t * 0.25 + dustSeed[i]) * 0.1;
    dp.array[i * 3 + 2] = camZ + 1 + z;
  }
  dp.needsUpdate = true;

  /* vulto: aparece quando você fica parado e some ao rolar */
  const idle = now - lastScrollT > 8000;
  if (idle && !shadeOn && p < 0.97) { shadeOn = true; shadeStart = t; shade.visible = true; shadeZ = camZ - 11; }
  if (!idle && shadeOn) { shadeOn = false; shade.visible = false; }
  if (shadeOn) {
    const k = clamp((t - shadeStart) / 18, 0, 1);
    shade.position.set(Math.sin(t * 0.7) * 0.25, 0, lerp(shadeZ, camZ - 3.2, k));
  }

  /* HUD/cartões por progresso */
  depthEl.textContent = Math.max(0, Math.round(-camZ - 1)) + 'm';
  heroEl.classList.toggle('show', p < 0.025);
  endEl.classList.toggle('show', camZ < -(L - 9.5));

  composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
scrollTo(0, 0);
tick();
