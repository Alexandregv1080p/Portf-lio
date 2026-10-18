import * as THREE from 'three';
import { createAudio } from './audio.js';
import { buildWorld, CL } from './world.js';
import { createFx } from './fx.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeEnvironment, flashlightCookie, makeDust } from './lighting.js';
import { createDebug } from './debug.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

/* Qualidade por tier (o padrão é leve de propósito; a resolução ainda se ajusta sozinha pelo FPS).
   ?q=low|mid|high|ultra força um tier · ?scale=0.7 força a escala de resolução · ?debug=1 mostra o painel de desempenho */
const params = new URLSearchParams(location.search);
const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
const TIER = ['low', 'mid', 'high', 'ultra'].includes(params.get('q')) ? params.get('q') : (!coarse ? 'high' : (mem >= 6 && cores >= 6 ? 'mid' : 'low'));
const Q = {
  ultra: { tex: 1024, pr: [1.5, 2], msaa: 4, fxaa: false, ca: true, shadow: true, shadowRes: 2048, gtao: true, bloom: true, lights: 6, shafts: 6, dust: 700, props: 1, an: 8, cookie: true, env: true },
  high: { tex: 1024, pr: [1, 1.25], msaa: 0, fxaa: true, ca: true, shadow: true, shadowRes: 1024, gtao: false, bloom: true, lights: 4, shafts: 4, dust: 420, props: 1, an: 4, cookie: false, env: true },
  mid: { tex: 512, pr: [0.85, 1], msaa: 0, fxaa: true, ca: false, shadow: false, shadowRes: 512, gtao: false, bloom: false, lights: 3, shafts: 3, dust: 240, props: 0.7, an: 4, cookie: false, env: true },
  low: { tex: 256, pr: [0.65, 0.85], msaa: 0, fxaa: false, ca: false, shadow: false, shadowRes: 512, gtao: false, bloom: false, lights: 2, shafts: 0, dust: 110, props: 0.45, an: 2, cookie: false, env: false },
}[TIER];
const touchUI = coarse || TIER === 'low' || TIER === 'mid';
const BASE_PR = clamp(devicePixelRatio, Q.pr[0], Q.pr[1]);
const SCALES = [1, 0.85, 0.72, 0.6, 0.5];                    /* resolução dinâmica: degraus (multiplicam a densidade de pixels) */
let scaleIdx = Math.max(0, SCALES.findIndex((v) => v <= (parseFloat(params.get('scale')) || 1) + 1e-6));
const curPR = () => BASE_PR * SCALES[scaleIdx];

/* ---------------------------------------------------------------- renderer */
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: TIER === 'ultra', powerPreference: 'high-performance' });
} catch (e) {
  console.error('WebGL init falhou:', e);
  $('nogl').hidden = false; $('loader').remove(); throw e;
}
renderer.setPixelRatio(curPR());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadow;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;                       /* a sombra da lanterna atualiza em frames alternados (metade do custo) */
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0807);
scene.fog = new THREE.FogExp2(0x0a0807, 0.05);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

if (Q.env) { scene.environment = makeEnvironment(renderer); scene.environmentIntensity = 0.3; }     /* reflexos: metal, portas, piso molhado */

let texturesReady = false, modelsReady = false;
const showEnter = () => { if (texturesReady && modelsReady) { $('loadmsg').hidden = true; $('enter').hidden = false; } };
const manager = new THREE.LoadingManager(() => { texturesReady = true; showEnter(); });
const tl = new THREE.TextureLoader(manager);
const aniso = Math.min(Q.an, renderer.capabilities.getMaxAnisotropy());

/* ------------------------------------------------------------------ mundo */
const world = buildWorld(scene, { tl, aniso, Q });
const { zones, cabins, pois, events } = world;
/* props reais (Poly Haven, CC0): barril, caixa militar, escrivaninha, gaveteiro, extintor */
const MODELS = { barrel: 'Barrel_01', desk: 'metal_office_desk', cabinet: 'drawer_cabinet', crate: 'old_military_crate', fire: 'korean_fire_extinguisher_01' };
{
  const gl = new GLTFLoader(manager), base = import.meta.env.BASE_URL || './', box = new THREE.Box3(), v = new THREE.Vector3();
  Promise.all(Object.entries(MODELS).map(async ([k, id]) => {
    try {
      const g = await gl.loadAsync(`${base}models/${id}/${id}${Q.tex >= 1024 ? '' : '_512'}.glb`); box.setFromObject(g.scene); box.getSize(v);
      const wrap = new THREE.Group(); g.scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); wrap.add(g.scene);   /* origem no centro da base */
      const seen = new Set();
      g.scene.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of ms) { if (seen.has(mt)) continue; seen.add(mt); for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (mt[key]) world.shrinkTex(mt[key]); world.addGrunge(mt, 0.6); } });
      return [k, { obj: wrap, h: v.y, size: v.clone() }];
    } catch (e) { console.warn('modelo não carregou:', id); return null; }
  })).then((list) => { world.populate(Object.fromEntries(list.filter(Boolean))); modelsReady = true; showEnter(); });
}
const hemi = new THREE.HemisphereLight(0x2a1218, 0x050203, 0.1); scene.add(hemi);

/* lanterna: SpotLight presa à câmera; o alvo segue o mouse */
const spot = new THREE.SpotLight(0xfff0dc, TIER === 'ultra' || TIER === 'high' ? 150 : 100, 22, Math.PI / 7.5, 0.6, 1.4);
spot.position.set(0.22, -0.22, 0.1);
spot.castShadow = Q.shadow;
spot.shadow.mapSize.set(Q.shadowRes, Q.shadowRes); spot.shadow.radius = 3.5;
if (Q.cookie) spot.map = flashlightCookie();
spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 16;
camera.add(spot);
const aimTarget = new THREE.Object3D(); scene.add(aimTarget); spot.target = aimTarget;

/* poeira iluminada de verdade: só aparece na lanterna e nos feixes das lâmpadas */
const DUST = Q.dust;
const dustSys = makeDust(DUST), dustGeo = dustSys.points.geometry, dustPos = dustSys.base, dustSeed = dustGeo.attributes.aSeed.array, dustMat = dustSys.mat;
scene.add(dustSys.points);
const spotPosV = new THREE.Vector3(), spotDirV = new THREE.Vector3();

/* o vulto: figura alta e magra, braços longos pendurados, cabeça inclinada — silhueta preta, só os olhos brilham */
const shade = new THREE.Group();
const sMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, sMat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); shade.add(m); return m; };
part(new THREE.CylinderGeometry(0.15, 0.2, 0.95, 10), 0, 1.35, 0);                 /* tronco */
part(new THREE.CylinderGeometry(0.075, 0.06, 0.95, 8), -0.09, 0.5, 0);             /* pernas */
part(new THREE.CylinderGeometry(0.075, 0.06, 0.95, 8), 0.09, 0.5, 0);
const armL = part(new THREE.CylinderGeometry(0.04, 0.03, 1.2, 6), -0.27, 1.12, 0.03, 0, 0.1);   /* braços longos */
const armR = part(new THREE.CylinderGeometry(0.04, 0.03, 1.2, 6), 0.27, 1.12, 0.03, 0, -0.1);
const head = part(new THREE.SphereGeometry(0.13, 14, 12), 0.03, 1.98, 0.02); head.scale.set(0.9, 1.25, 0.95); head.rotation.z = -0.22;
part(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 8), 0.0, 1.82, 0);              /* pescoço */
for (const x of [-0.04, 0.05]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); e.position.set(x, 2.0, 0.12); shade.add(e); }
shade.userData.arms = [armL, armR, head];
shade.visible = false; scene.add(shade);

const fx = await createFx(renderer, scene, camera, { Q });

/* ------------------------------------------------------- trilho da câmera */
/* scroll → distância D ao longo do prédio. Dentro dos elevadores o scroll "custa" mais por metro: a descida demora. */
const D_START = 1, D_END = world.total - 2.4, PPM_WALK = 85, PPM_LIFT = 170;
const segs = []; { let d = D_START, px = 0;
  const cuts = [D_START, ...cabins.flatMap((c) => [c.d0, c.d1]), D_END];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b <= a) continue;
    const lift = cabins.some((c) => c.d0 === a && c.d1 === b), ppm = lift ? PPM_LIFT : PPM_WALK;
    segs.push({ d0: a, d1: b, px0: px, ppm }); px += (b - a) * ppm; d = b;
  }
  segs.totalPx = px; }
const pxFromD = (d) => { for (const s of segs) { if (d <= s.d1) return s.px0 + Math.max(0, d - s.d0) * s.ppm; } return segs.totalPx; };
const dFromPx = (px) => { for (const s of segs) { if (px <= s.px0 + (s.d1 - s.d0) * s.ppm) return s.d0 + (px - s.px0) / s.ppm; } return D_END; };
function sizeSpacer() { $('spacer').style.height = Math.round(segs.totalPx + innerHeight) + 'px'; }
sizeSpacer();

/* ------------------------------------------------------------------ áudio */
const audio = createAudio();
const sndBtn = $('snd');
function paintSnd() { sndBtn.textContent = !audio.started || audio.muted ? 'som: off' : 'som: on'; }
function enter(withSound) {
  $('loader').classList.add('done');
  if (withSound) audio.start({
    rooms: pois.map((p) => ({ pos: p.pos, kind: p.audio })),
    end: { x: 0, y: 1.5, z: world.zOf(world.total) },
  });
  paintSnd();
}
$('enter-snd').addEventListener('click', () => enter(true));
$('enter-mute').addEventListener('click', () => enter(false));
sndBtn.addEventListener('click', () => { if (!audio.started) { enter(true); return; } audio.setMuted(!audio.muted); paintSnd(); });

/* ------------------------------------------------------------ interação */
const aim = new THREE.Vector2(0.1, -0.05), aimGoal = new THREE.Vector2(0.1, -0.05);
let lastMove = -1e9, interacted = false;
addEventListener('pointermove', (e) => {
  aimGoal.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  lastMove = performance.now();
  if (!interacted) { interacted = true; $('hint').classList.add('gone'); }
}, { passive: true });

/* celular: o dedo (ou o último toque) guia a lanterna sem atrapalhar o scroll */
function touchAim(e) {
  const t = e.touches && e.touches[0]; if (!t) return;
  aimGoal.set(clamp((t.clientX / innerWidth) * 2 - 1, -0.95, 0.95), clamp(-((t.clientY / innerHeight) * 2 - 1), -0.9, 0.6));
  lastMove = performance.now();
  if (!interacted) { interacted = true; $('hint').classList.add('gone'); }
}
addEventListener('touchstart', touchAim, { passive: true });
addEventListener('touchmove', touchAim, { passive: true });
if (touchUI) $('hint').textContent = 'deslize para andar · toque para guiar a luz';

const ray = new THREE.Raycaster();
const hits = pois.map((p) => p.hit);
const projEl = $('proj'), heroEl = $('hero'), endEl = $('end'), depthEl = $('depth'), floorTag = $('floortag'), corrBar = $('corrbar'), corrVal = $('corrval'), banner = $('banner');
let cardHover = false, shownPoi = -1, lostAt = 0;
projEl.addEventListener('pointerenter', () => { cardHover = true; });
projEl.addEventListener('pointerleave', () => { cardHover = false; });
function showPoi(i) {
  if (i === shownPoi) return;
  if (shownPoi >= 0) audio.door(shownPoi, false, pois[shownPoi].kind);
  if (i >= 0) audio.door(i, true, pois[i].kind);
  shownPoi = i;
  if (i < 0) { projEl.classList.remove('show'); return; }
  const c = pois[i].card;
  projEl.querySelector('.cat').textContent = c.cat;
  projEl.querySelector('h2').textContent = c.title;
  projEl.querySelector('.stack').textContent = c.stack || '';
  projEl.querySelector('p').textContent = Array.isArray(c.body) ? c.body.join('\n') : (c.body || '');
  const bars = projEl.querySelector('.bars'); bars.innerHTML = '';
  (c.list || []).forEach(([n, v, lbl]) => { const r = document.createElement('div'); r.className = 'sk'; r.innerHTML = `<span></span><em></em><div class="bar"><i></i></div>`; r.children[0].textContent = n; r.children[1].textContent = lbl; r.querySelector('i').style.width = v + '%'; bars.appendChild(r); });
  const go = projEl.querySelector('.go');
  if (c.url) { projEl.href = c.url; go.hidden = false; } else { projEl.removeAttribute('href'); go.hidden = true; }
  projEl.classList.add('show');
}

/* ------------------------------------------------------------ sustos */
const ctl = { shade: null, blackout: 0, burst: 0, shake: 0, fov: 0, lightsOut: 0, seq: [] };
const once = new Set();
function later(ms, fn) { ctl.seq.push({ at: performance.now() + ms, fn }); }
const zone = (id) => zones.find((z) => z.id === id);
const poisOf = (id) => pois.filter((p) => p.z.id === id);
const Zs = { lobby: zone('lobby'), sobre: zone('sobre'), exp: zone('exp'), skills: zone('skills'), proj: zone('proj'), end: zone('end') };

/* cada susto dispara uma vez, quando você passa de D (e se repete se você voltar e reentrar) */
const SCARES = [
  { id: 'phone', D: Zs.sobre.d0 + 5, run() { audio.event('phone'); ctl.burst = 0.3; } },
  { id: 'chair', D: poisOf('sobre')[2].D - 6, run() { const p = poisOf('sobre')[2]; if (p && p.chair) { p.chair.userData.roll = performance.now(); audio.event('chair'); } } },
  { id: 'drawers', D: Zs.exp.d0 + 9, run() {
    (events.drawers || []).forEach((dr, i) => later(i * 420, () => { dr.goal = 1; audio.event('drawer'); ctl.burst = 0.5; }));
    ctl.lightsOut = performance.now() + 5200; later(5200, () => { (events.drawers || []).forEach((dr) => { dr.goal = 0; }); });
  } },
  { id: 'blackout', D: Zs.skills.d0 + 13, run() {
    ctl.lightsOut = performance.now() + 6500; audio.event('zap'); ctl.burst = 1;
    ctl.shade = { mode: 'ahead', dist: 7, min: 3, until: performance.now() + 6500 };
    later(6500, () => { audio.event('zap'); ctl.burst = 1; });
  } },
  { id: 'slam', D: Zs.proj.d0 + 14, run() {
    poisOf('proj').slice(1, 6).forEach((p, i) => later(i * 260, () => { p.force = 1; audio.door(pois.indexOf(p), true, 'door'); ctl.burst = 0.6; ctl.shake = 0.6; later(520, () => { p.force = 0; audio.door(pois.indexOf(p), false, 'door'); }); }));
  } },
  { id: 'chase', D: Zs.end.d0 + 5, run() { ctl.shade = { mode: 'ahead', dist: 8, min: 2.4, until: performance.now() + 60000, chase: true }; audio.event('stinger'); ctl.burst = 1; } },
  { id: 'final', D: Zs.end.d1 - 6.5, run() {
    ctl.lightsOut = performance.now() + 4200; ctl.burst = 1; ctl.shake = 1; audio.event('stinger');
    ctl.shade = { mode: 'ahead', dist: 1.7, min: 1.7, until: performance.now() + 2200, snap: true };
    later(2300, () => { ctl.burst = 1; audio.event('zap'); });
  } },
];

/* ------------------------------------------------------------------ loop */
let forceD = null;                                          /* só o harness de dev usa */
let aimDist = 8;
let goalS = D_START;
let camD = D_START, lastScrollT = performance.now(), vel = 0, wv = 0, phase = 0, ws = 0, lastInLift = false;   /* wv: velocidade (m/s com sinal); phase: passadas */
addEventListener('scroll', () => { lastScrollT = performance.now(); }, { passive: true });
const fwdV = new THREE.Vector3(), upV = new THREE.Vector3();
const audioFix = [0, 1, 2].map(() => ({ pos: { x: 0, y: 2.9, z: 0 }, k: 1 })), doorDistArr = new Array(pois.length).fill(99);
const au = { shade: { visible: false, dist: 99 } };    /* objeto reutilizado: nada de alocar por frame */
let lastT = performance.now(), elapsed = 0, running = true, lastFloor = -1;
const liftState = new Map();          /* por cabine: fases já disparadas */
let bannerT = 0;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { lastT = performance.now(); audio.resume(); tick(); } else audio.pause();
});
/* ---- desempenho: (1) limita a ~60 fps (telas de 120/144 Hz renderizariam o dobro à toa), (2) ajusta a resolução interna
   pelo tempo real de frame, (3) se ainda assim não der, desliga recursos em escada. Nada disso exige ação do jogador. */
let lastRenderT = 0, ema = 16.7, slowCnt = 0, fastCnt = 0, lastChange = 0, noUpUntil = 0, level = 0, shaftsOn = Q.shafts > 0;
const MIN_FRAME = 1000 / 62;
function setScale(i) {
  scaleIdx = i; const pr = curPR();
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); fx.resize(innerWidth, innerHeight, pr);
}
const LADDER = [
  () => { if (fx.gtao) fx.gtao.enabled = false; },
  () => { if (fx.bloom) fx.bloom.enabled = false; },
  () => { spot.castShadow = false; },
  () => { shaftsOn = false; world.setShafts(false); },
  () => { dustGeo.setDrawRange(0, Math.floor(DUST / 3)); },
];
const dbg = createDebug(renderer, () => ({
  tier: TIER, scale: SCALES[scaleIdx], pr: curPR(), w: renderer.domElement.width, h: renderer.domElement.height, msaa: Q.msaa, fxaa: !!fx.fxaa,
  lights: Q.lights, gtao: !!(fx.gtao && fx.gtao.enabled), bloom: !!(fx.bloom && fx.bloom.enabled), shadow: spot.castShadow, shafts: shaftsOn,
  level: level + '/' + LADDER.length,
}));
let frameN = 0;
function tick() {
  if (!running) return; requestAnimationFrame(tick);
  const now = performance.now(), since = now - lastRenderT;
  if (since < MIN_FRAME - 1.5) return;                                   /* pula frames extras em telas de alta taxa */
  lastRenderT = now;
  if (since < 250) {
    ema = ema * 0.9 + since * 0.1;
    if (ema > 20.5) { slowCnt++; fastCnt = 0; } else if (ema < 17.6) { fastCnt++; slowCnt = 0; } else { slowCnt = 0; }
    if (slowCnt > 24 && now - lastChange > 1500) {                      /* abaixo de ~48 fps: reduz resolução; no piso, corta recursos */
      if (scaleIdx < SCALES.length - 1) { setScale(scaleIdx + 1); noUpUntil = now + 45000; }
      else if (level < LADDER.length) LADDER[level++]();
      slowCnt = 0; lastChange = now; ema = 16.7;
    } else if (fastCnt > 420 && scaleIdx > 0 && now > noUpUntil && now - lastChange > 6000) {   /* estável há ~7 s: sobe um degrau */
      setScale(scaleIdx - 1); fastCnt = 0; lastChange = now; ema = 16.7;
    }
  }
  dbg.begin();
  step(now);
  dbg.end(since);
}

function step(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now; elapsed += dt; const t = elapsed;
  while (ctl.seq.length && ctl.seq[0].at <= now) ctl.seq.shift().fn();
  ctl.seq.sort((a, b) => a.at - b.at);

  /* câmera: scroll → D (suavizado) */
  const px = clamp(scrollY, 0, segs.totalPx);
  const rawGoal = forceD ?? dFromPx(px);
  let goalD = rawGoal;
  /* "coleira" do scroll: o ponto do scroll nunca fica mais de LEAD metros à frente/atrás do personagem.
     Um fling longo não vira uma corrida automática: ele só anda no ritmo que o corpo aguenta e para junto com o dedo. */
  if (forceD === null) {
    const LEAD = 2.2;
    if (rawGoal - camD > LEAD) goalD = camD + LEAD; else if (camD - rawGoal > LEAD) goalD = camD - LEAD;
    if (goalD !== rawGoal) { const py = pxFromD(goalD); if (Math.abs(scrollY - py) > 3) scrollTo(0, py); }
  }
  goalS += (goalD - goalS) * (1 - Math.exp(-dt / 0.08));          /* suaviza o início do passo (aceleração com peso) */
  const prevD = camD;
  /* o scroll é o passo: a câmera segue o ponto do scroll com uma mola criticamente amortecida (~0,3 s), então
     ela PARA quando o scroll para (nada de continuar "correndo atrás" do ponto). A velocidade é limitada só por segurança. */
  const OMEGA = lastInLift ? 6 : 11;
  wv += (OMEGA * OMEGA * (goalS - camD) - 2 * OMEGA * wv) * dt;
  wv = clamp(wv, lastInLift ? -2.2 : -6.5, lastInLift ? 2.2 : 6.5);
  if (Math.abs(goalS - camD) < 0.002 && Math.abs(wv) < 0.02) { camD = goalS; wv = 0; }
  else camD += wv * dt;
  const stepD = Math.abs(camD - prevD), speed = Math.abs(wv);
  vel = speed;
  const env = world.envAt(camD);
  const inLift = env.cabin && camD > env.cabin.d0 + 0.3 && camD < env.cabin.d1;
  lastInLift = inLift;
  /* passada: o comprimento cresce com a velocidade (andar → trotar); cada número inteiro de fase é um apoio do pé */
  const stride = Math.max(lerp(0.75, 1.45, clamp(speed / 5, 0, 1)), speed / 3.6), prevPhase = phase;      /* nunca mais de ~3,6 passos/s */
  phase += stepD / stride;
  const steps = Math.floor(phase) - Math.floor(prevPhase);
  ws = lerp(ws, clamp(speed / 1.5, 0, 1), 1 - Math.exp(-dt / 0.1));
  const fall = Math.pow(Math.cos(Math.PI * phase), 2);                  /* 1 no apoio do pé, 0 no meio da passada */
  const sway = Math.sin(Math.PI * phase);                                 /* alterna esquerda/direita a cada passo */
  const breath = reduce ? 0 : (1 - ws) * Math.sin(performance.now() / 1000 * 1.45);   /* respiração parada: sobe e desce devagar */
  const bobY = reduce ? 0 : -0.052 * ws * fall + 0.018 * ws + 0.006 * breath;              /* a cabeça cai no apoio */
  const bobX = reduce ? 0 : 0.034 * ws * sway;
  const nod = reduce ? 0 : 0.016 * ws * fall + 0.0025 * breath;                             /* leve "cabeceio" para baixo no impacto */
  const z = world.zOf(camD);

  /* atmosfera do andar (névoa, grade, glitch, tremor, FOV) */
  scene.fog.color.copy(env.fog); scene.background.copy(env.fog); scene.fog.density = env.fogD;
  hemi.color.copy(env.amb); hemi.intensity = env.ambI;
  scene.environmentIntensity = 0.1 + env.fear * 0.34;       /* reflexos mais fortes quanto mais fundo (piso molhado, metal); a recepção fica seca */
  const shakeAmt = (reduce ? 0 : env.shake * 0.01 * (0.25 + 0.75 * ws)) + ctl.shake * 0.04 + (inLift && env.k > 0 ? 0.006 : 0);
  ctl.shake = Math.max(0, ctl.shake - dt * 1.6);
  camera.fov = lerp(camera.fov, env.fov + ctl.fov + (reduce ? 0 : 0.7 * ws * fall), 1 - Math.exp(-dt / 0.07)); camera.updateProjectionMatrix();

  /* sem mouse por alguns segundos (celular): a luz vagueia sozinha */
  if (touchUI && now - lastMove > 4500) aimGoal.set(Math.sin(t * 0.45) * 0.5, Math.cos(t * 0.33) * 0.18 - 0.04);
  aim.lerp(aimGoal, 1 - Math.pow(0.0005, dt));

  const sx = (Math.random() - 0.5) * shakeAmt, sy = (Math.random() - 0.5) * shakeAmt;
  camera.position.set(bobX + sx, 1.62 + bobY + sy, z);
  const roll = (reduce ? 0 : 0.013 * ws * sway) + env.fear * Math.sin(t * 0.7) * 0.012;      /* o mundo "não está no prumo" lá no fundo */
  camera.rotation.set(aim.y * 0.16 - nod, -aim.x * 0.38 + (reduce ? 0 : 0.006 * ws * sway), roll);

  /* lanterna */
  camera.updateMatrixWorld();
  ray.setFromCamera(aim, camera); ray.far = 20;
  aimTarget.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 9);
  /* distância até a superfície mirada (planos do corredor): a intensidade acompanha, como a adaptação dos olhos */
  { const o = ray.ray.origin, d = ray.ray.direction; let tt = 22;
    if (d.x > 1e-4) tt = Math.min(tt, (1.6 - o.x) / d.x); else if (d.x < -1e-4) tt = Math.min(tt, (-1.6 - o.x) / d.x);
    if (d.y < -1e-4) tt = Math.min(tt, -o.y / d.y); else if (d.y > 1e-4) tt = Math.min(tt, (3.2 - o.y) / d.y);
    aimDist = lerp(aimDist, Math.max(tt, 0.5), 1 - Math.exp(-dt / 0.14)); }
  const nearK = clamp(Math.pow(aimDist / 6, 1.45), 0.1, 1.25);
  spot.intensity = (TIER === 'ultra' || TIER === 'high' ? 150 : 100) * nearK * (1 + env.fear * 0.35) * (0.96 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.1) * 0.02) * (inLift ? 0.35 : 1);

  /* ponto de interesse sob a luz → abre e mostra o cartão */
  const hit = ray.intersectObjects(hits, false)[0];
  const looked = hit && hit.distance < 6.5 ? hit.object.userData.poi : -1;
  if (looked >= 0) { lostAt = 0; showPoi(looked); }
  else if (shownPoi >= 0 && !cardHover) { if (!lostAt) lostAt = now; if (now - lostAt > 500) { lostAt = 0; showPoi(-1); } }

  /* mundo: elevadores, luzes, emergência, POIs */
  world.cull(z);
  const out = world.step(camD, t, dt, { active: shownPoi, reduce, emerg: env.emerg });
  if (events.chairPoi && events.chairPoi.chair && events.chairPoi.chair.userData.roll) {
    const k = clamp((now - events.chairPoi.chair.userData.roll) / 2600, 0, 1), c = events.chairPoi.chair;
    c.position.z = 1.15 + k * 1.7; c.rotation.y = k * 9; if (k >= 1) c.userData.roll = 0;
  }
  /* blackout: tudo apaga (as lâmpadas voltam sozinhas depois) */
  const dark = ctl.lightsOut > now;
  out.fixtures.forEach((f) => { f.forced = dark ? 0 : -1; });

  /* glitch: bursts aleatórios na frequência do andar */
  if (!reduce && Math.random() < dt * (env.glitch * 0.22 + 0.004)) ctl.burst = Math.max(ctl.burst, 0.3 + Math.random() * 0.4);
  ctl.burst = Math.max(0, ctl.burst - dt * 2.4);
  const u = fx.film.uniforms;
  u.glitch.value = reduce ? 0 : env.glitch; u.burst.value = reduce ? 0 : ctl.burst;
  u.sat.value = env.sat; u.tint.value.set(env.tint[0], env.tint[1], env.tint[2]);
  u.flick.value = reduce ? 1 : (dark ? 0.96 : out.flick); u.time.value = t * 60 % 1000;

  /* poeira: posições seguem a câmera; o brilho vem dos uniformes (lanterna + feixes) */
  spot.getWorldPosition(spotPosV); spotDirV.copy(aimTarget.position).sub(spotPosV).normalize();
  const du = dustMat.uniforms;
  du.uSpotPos.value.copy(spotPosV); du.uSpotDir.value.copy(spotDirV); du.uSpotCos.value = Math.cos(spot.angle * 0.9);
  du.uSpotI.value = clamp(spot.intensity / 150, 0, 1.6) * 0.9; du.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  du.uTint.value.set(env.fear > 0.7 ? 1.0 : 1.0, env.fear > 0.7 ? 0.62 : 0.93, env.fear > 0.7 ? 0.55 : 0.82);
  (out.lampPool || []).forEach((lp, i) => { du.uLampPos.value[i].copy(lp.pos); du.uLampCol.value[i].copy(lp.color); du.uLampI.value[i] = lp.I; });
  const dp = dustGeo.attributes.position;
  for (let i = 0; i < DUST; i++) {
    dp.array[i * 3] = dustPos[i * 3] + Math.sin(t * 0.3 + dustSeed[i]) * 0.18;
    dp.array[i * 3 + 1] = dustPos[i * 3 + 1] + Math.cos(t * 0.25 + dustSeed[i]) * 0.12 - (env.fear > 0.7 ? ((t * 0.12 + dustSeed[i]) % 3.2) * 0.2 : 0);
    dp.array[i * 3 + 2] = z + 1 + dustPos[i * 3 + 2];
  }
  dp.needsUpdate = true;

  /* sustos por posição */
  SCARES.forEach((s) => {
    const done = once.has(s.id);
    if (!done && camD > s.D && camD < s.D + 6) { once.add(s.id); s.run(); }
    else if (done && camD < s.D - 4) once.delete(s.id);              /* voltou: pode assustar de novo */
  });

  /* o vulto: ocioso (fica parado → ele se aproxima) ou conduzido por um susto */
  const idleLimit = 8000 - env.fear * 3500;
  const idle = now - lastScrollT > idleLimit && !inLift && camD < world.total - 4;
  if (idle && !ctl.shade) ctl.shade = { mode: 'ahead', dist: 11, min: 3.2, until: Infinity, creep: true, idle: true, t0: t };
  if (!idle && ctl.shade && ctl.shade.idle) ctl.shade = null;
  const sh = ctl.shade;
  if (sh && now > sh.until) { ctl.shade = null; shade.visible = false; }
  else if (sh) {
    shade.visible = true;
    if (sh.creep) sh.dist = Math.max(sh.min, lerp(11, sh.min, clamp((t - sh.t0) / 18, 0, 1)));
    else if (sh.chase) sh.dist = vel > 0.3 ? Math.min(sh.dist + dt * 0.5, 8) : Math.max(sh.min, sh.dist - dt * 0.9);
    shade.position.set(Math.sin(t * 0.7) * 0.25, 0, z - sh.dist);
    const [aL, aR, hd] = shade.userData.arms; aL.rotation.z = 0.1 + Math.sin(t * 1.3) * 0.05; aR.rotation.z = -0.1 - Math.sin(t * 1.1) * 0.05; hd.rotation.z = -0.22 + Math.sin(t * 0.8) * 0.08;
    if (sh.snap && Math.random() < 0.3) shade.position.x += (Math.random() - 0.5) * 0.2;
  } else shade.visible = false;

  /* elevadores: dispara os sons/banner nas fases da descida */
  cabins.forEach((c, i) => {
    const tt = (camD - c.d0) / CL; let st = liftState.get(i); if (!st) { st = { close: false, hum: false, ding: false }; liftState.set(i, st); }
    if (tt < 0.02 || tt > 1.05) { st.close = st.hum = st.ding = false; return; }       /* fora da cabine: rearma e não dispara */
    if (tt > 0.13 && !st.close) { st.close = true; audio.elevator('close'); }
    if (tt > 0.3 && !st.hum) { st.hum = true; audio.elevator('hum', zones[i + 1].fear); ctl.burst = Math.max(ctl.burst, 0.35); }
    if (tt > 0.7 && !st.ding) { st.ding = true; audio.elevator('ding', zones[i + 1].fear); audio.elevator('open'); bannerT = now + 3600; const z2 = zones[i + 1]; banner.querySelector('b').textContent = `ANDAR ${z2.floor}`; banner.querySelector('span').textContent = z2.name; }
  });
  banner.classList.toggle('show', now < bannerT);

  /* HUD */
  const zNow = env.zone;
  depthEl.textContent = Math.max(0, Math.round(camD - D_START)) + 'm';
  if (zNow.i !== lastFloor) { lastFloor = zNow.i; floorTag.textContent = `ANDAR ${zNow.floor} · ${zNow.name}`; audio.setFloor(zNow.i, zNow.fear); }
  const corr = clamp((camD - D_START) / (D_END - D_START), 0, 1);
  corrBar.style.transform = `scaleX(${corr.toFixed(3)})`; corrVal.textContent = Math.round(corr * 100) + '%';
  heroEl.classList.toggle('show', camD < D_START + 3.5);
  endEl.classList.toggle('show', camD > Zs.end.d1 - 9);

  if (audio.started) {
    camera.getWorldDirection(fwdV); upV.set(0, 1, 0).applyQuaternion(camera.quaternion);
    let nf = 0;
    for (const f of out.pool) { if (!f || nf >= 3) continue; const o = audioFix[nf++]; o.pos.z = world.zOf(f.D); o.k = f.k; }
    for (let i = 0; i < pois.length; i++) doorDistArr[i] = Math.hypot(pois[i].pos.x - camera.position.x, pois[i].pos.z - camera.position.z);
    au.camPos = camera.position; au.fwd = fwdV; au.up = upV; au.p = corr; au.speed = vel; au.stepDist = stepD; au.steps = steps;
    au.stepVol = clamp(0.5 + speed * 0.16, 0.5, 1); au.nFix = nf; au.fixtures = audioFix; au.doorDist = doorDistArr;
    au.shade.visible = shade.visible; au.shade.dist = Math.abs(shade.position.z - z); au.lift = inLift ? env.k : -1; au.dark = dark;
    audio.update(au);
  }
  if (spot.castShadow) renderer.shadowMap.needsUpdate = (++frameN & 1) === 0 || frameN < 3;
  fx.composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); fx.resize(innerWidth, innerHeight, curPR()); sizeSpacer();
});
scrollTo(0, 0);
tick();

/* só em dev: simula frames com tempo sintético (o painel de preview limita o rAF) */
if (import.meta.env.DEV) {
  let simNow = performance.now();
  window.__sim = {
    audio, world, camera, scene, spot, ctl, SCARES, renderer, fx, shade,
    size(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); fx.composer.setSize(w, h); },
    place(d, ax = 0, ay = -0.05) { camD = goalS = forceD = d; wv = 0; aim.set(ax, ay); aimGoal.set(ax, ay); lastMove = simNow; },
    aimAt(ax, ay) { aimGoal.set(ax, ay); lastMove = simNow; },
    goto(d) { forceD = d; }, release() { forceD = null; goalS = camD; }, dFromPx, pxFromD, gait: () => ({ camD: +camD.toFixed(2), wv: +wv.toFixed(2), phase: +phase.toFixed(2), ws: +ws.toFixed(2) }),
    run(n, ms = 16.7) { running = false; const log = []; let prev = shownPoi; for (let i = 0; i < n; i++) { simNow += ms; lastT = simNow - ms; step(simNow); if (shownPoi !== prev) { log.push([i, prev, shownPoi]); prev = shownPoi; } } return log; },
    state: () => ({ shownPoi, camD: +camD.toFixed(2), floor: lastFloor, aim: [aim.x, aim.y].map((v) => +v.toFixed(2)), open: pois.map((p) => +p.open.toFixed(2)) }),
    poiNdc(i) { camera.updateMatrixWorld(); const v = pois[i].hit.getWorldPosition(new THREE.Vector3()).project(camera); return [+v.x.toFixed(3), +v.y.toFixed(3)]; },
    segs, D_END,
  };
}
