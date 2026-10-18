import * as THREE from 'three';
import { createAudio } from './audio.js';
import { buildWorld, CL } from './world.js';
import { createFx } from './fx.js';
import { makeEnvironment, flashlightCookie, makeDust } from './lighting.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------------------------------------------------------------- renderer */
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
} catch (e) {
  console.error('WebGL init falhou:', e);
  $('nogl').hidden = false; $('loader').remove(); throw e;
}
renderer.setPixelRatio(coarse ? Math.min(devicePixelRatio, 1.5) : clamp(devicePixelRatio, 1.5, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !coarse;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0807);
scene.fog = new THREE.FogExp2(0x0a0807, 0.05);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.environment = makeEnvironment(renderer); scene.environmentIntensity = 0.3;     /* reflexos: metal, portas, piso molhado */

const manager = new THREE.LoadingManager(() => { $('loadmsg').hidden = true; $('enter').hidden = false; });
const tl = new THREE.TextureLoader(manager);
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

/* ------------------------------------------------------------------ mundo */
const world = buildWorld(scene, { tl, aniso, coarse });
const { zones, cabins, pois, events } = world;
const hemi = new THREE.HemisphereLight(0x2a1218, 0x050203, 0.1); scene.add(hemi);

/* lanterna: SpotLight presa à câmera; o alvo segue o mouse */
const spot = new THREE.SpotLight(0xfff0dc, coarse ? 90 : 150, 26, Math.PI / 7.5, 0.6, 1.4);
spot.position.set(0.22, -0.22, 0.1);
spot.castShadow = !coarse;
spot.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048); spot.shadow.radius = 3.5;
if (!coarse) spot.map = flashlightCookie();
spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 26;
camera.add(spot);
const aimTarget = new THREE.Object3D(); scene.add(aimTarget); spot.target = aimTarget;

/* poeira iluminada de verdade: só aparece na lanterna e nos feixes das lâmpadas */
const DUST = coarse ? 260 : 700;
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

const fx = createFx(renderer, scene, camera, { coarse });

/* ------------------------------------------------------- trilho da câmera */
/* scroll → distância D ao longo do prédio. Dentro dos elevadores o scroll "custa" mais por metro: a descida demora. */
const D_START = 1, D_END = world.total - 2.4, PPM_WALK = 62, PPM_LIFT = 150;
const segs = []; { let d = D_START, px = 0;
  const cuts = [D_START, ...cabins.flatMap((c) => [c.d0, c.d1]), D_END];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b <= a) continue;
    const lift = cabins.some((c) => c.d0 === a && c.d1 === b), ppm = lift ? PPM_LIFT : PPM_WALK;
    segs.push({ d0: a, d1: b, px0: px, ppm }); px += (b - a) * ppm; d = b;
  }
  segs.totalPx = px; }
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
let camD = D_START, lastScrollT = performance.now(), vel = 0, wv = 0, phase = 0, ws = 0, lastInLift = false;   /* wv: velocidade (m/s com sinal); phase: passadas */
addEventListener('scroll', () => { lastScrollT = performance.now(); }, { passive: true });
const fwdV = new THREE.Vector3(), upV = new THREE.Vector3();
let lastT = performance.now(), elapsed = 0, running = true, lastFloor = -1;
const liftState = new Map();          /* por cabine: fases já disparadas */
let bannerT = 0;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { lastT = performance.now(); audio.resume(); tick(); } else audio.pause();
});
/* qualidade adaptativa: se a GPU não acompanha, desliga o que pesa (AO → resolução → bloom), sem o jogador perceber */
let lastTickT = performance.now(), ema = 16, sampled = 0, qLevel = 0;
function degrade() {
  qLevel++;
  if (qLevel === 1 && fx.gtao) fx.gtao.enabled = false;
  else if (qLevel === 2) { renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); fx.composer.setPixelRatio(1); fx.composer.setSize(innerWidth, innerHeight); }
  else if (qLevel === 3 && fx.bloom) fx.bloom.enabled = false;
}
function tick() {
  if (!running) return; requestAnimationFrame(tick);
  const now = performance.now(), raw = now - lastTickT; lastTickT = now;
  if (raw < 250) { ema = ema * 0.95 + raw * 0.05; if (++sampled > 150 && ema > 27 && qLevel < 3) { degrade(); sampled = 0; ema = 16; } }
  step(now);
}

function step(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now; elapsed += dt; const t = elapsed;
  while (ctl.seq.length && ctl.seq[0].at <= now) ctl.seq.shift().fn();
  ctl.seq.sort((a, b) => a.at - b.at);

  /* câmera: scroll → D (suavizado) */
  const px = clamp(scrollY, 0, segs.totalPx);
  const goalD = forceD ?? dFromPx(px);
  const prevD = camD;
  /* o scroll define para onde ir; o personagem ANDA até lá: velocidade máxima, aceleração com peso, freio suave.
     (sem isso a câmera "desliza" por inércia exponencial e não parece caminhada) */
  const vmax = lastInLift ? 1.1 : 3.3, vback = 1.7;
  const desired = clamp((goalD - camD) * 3.4, -vback, vmax);
  wv += (desired - wv) * (1 - Math.exp(-dt / (Math.abs(desired) > Math.abs(wv) ? 0.2 : 0.13)));
  if (forceD !== null && Math.abs(goalD - camD) < 1e-4) wv = 0;
  camD += wv * dt;
  const stepD = Math.abs(camD - prevD), speed = Math.abs(wv);
  vel = speed;
  const env = world.envAt(camD);
  const inLift = env.cabin && camD > env.cabin.d0 + 0.3 && camD < env.cabin.d1;
  lastInLift = inLift;
  /* passada: o comprimento cresce com a velocidade (andar → trotar); cada número inteiro de fase é um apoio do pé */
  const stride = lerp(0.72, 1.08, clamp(speed / 3.3, 0, 1)), prevPhase = phase;
  phase += stepD / stride;
  const steps = Math.floor(phase) - Math.floor(prevPhase);
  ws = lerp(ws, clamp(speed / 1.5, 0, 1), 1 - Math.exp(-dt / 0.1));
  const fall = Math.pow(Math.cos(Math.PI * phase), 2);                  /* 1 no apoio do pé, 0 no meio da passada */
  const sway = Math.sin(Math.PI * phase);                                 /* alterna esquerda/direita a cada passo */
  const bobY = reduce ? 0 : -0.052 * ws * fall + 0.018 * ws;              /* a cabeça cai no apoio */
  const bobX = reduce ? 0 : 0.034 * ws * sway;
  const nod = reduce ? 0 : 0.016 * ws * fall;                             /* leve "cabeceio" para baixo no impacto */
  const z = world.zOf(camD);

  /* atmosfera do andar (névoa, grade, glitch, tremor, FOV) */
  scene.fog.color.copy(env.fog); scene.background.copy(env.fog); scene.fog.density = env.fogD;
  hemi.color.copy(env.amb); hemi.intensity = env.ambI;
  scene.environmentIntensity = 0.1 + env.fear * 0.34;       /* reflexos mais fortes quanto mais fundo (piso molhado, metal); a recepção fica seca */
  const shakeAmt = (reduce ? 0 : env.shake * 0.012) + ctl.shake * 0.05 + (inLift && env.k > 0 ? 0.01 : 0);
  ctl.shake = Math.max(0, ctl.shake - dt * 1.6);
  camera.fov = lerp(camera.fov, env.fov + ctl.fov + (reduce ? 0 : 0.7 * ws * fall), 1 - Math.exp(-dt / 0.07)); camera.updateProjectionMatrix();

  /* sem mouse por alguns segundos (celular): a luz vagueia sozinha */
  if (coarse && now - lastMove > 3500) aimGoal.set(Math.sin(t * 0.45) * 0.5, Math.cos(t * 0.33) * 0.18 - 0.04);
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
  const nearK = clamp(Math.pow(aimDist / 6, 1.15), 0.16, 1.3);
  spot.intensity = (coarse ? 90 : 150) * nearK * (1 + env.fear * 0.35) * (0.96 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.1) * 0.02) * (inLift ? 0.35 : 1);

  /* ponto de interesse sob a luz → abre e mostra o cartão */
  const hit = ray.intersectObjects(hits, false)[0];
  const looked = hit && hit.distance < 6.5 ? hit.object.userData.poi : -1;
  if (looked >= 0) { lostAt = 0; showPoi(looked); }
  else if (shownPoi >= 0 && !cardHover) { if (!lostAt) lostAt = now; if (now - lostAt > 500) { lostAt = 0; showPoi(-1); } }

  /* mundo: elevadores, luzes, emergência, POIs */
  const out = world.step(camD, t, dt, { active: shownPoi, reduce, emerg: env.emerg });
  if (events.chairPoi && events.chairPoi.chair && events.chairPoi.chair.userData.roll) {
    const k = clamp((now - events.chairPoi.chair.userData.roll) / 2600, 0, 1), c = events.chairPoi.chair;
    c.position.z = 1.15 + k * 1.7; c.rotation.y = k * 9; if (k >= 1) c.userData.roll = 0;
  }
  /* blackout: tudo apaga (as lâmpadas voltam sozinhas depois) */
  const dark = ctl.lightsOut > now;
  out.fixtures.forEach((f) => { f.forced = dark ? 0 : -1; });

  /* glitch: bursts aleatórios na frequência do andar */
  if (!reduce && Math.random() < dt * (env.glitch * 0.9 + 0.02)) ctl.burst = Math.max(ctl.burst, 0.4 + Math.random() * 0.6);
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
    const pool = world.fixturePool(camD, 3);
    audio.update({
      camPos: camera.position, fwd: fwdV, up: upV, p: corr, speed: vel, stepDist: stepD, steps, stepVol: clamp(0.5 + speed * 0.16, 0.5, 1),
      fixtures: pool.map((f) => ({ pos: { x: 0, y: 2.9, z: world.zOf(f.D) }, k: f.k })),
      doorDist: pois.map((p) => Math.hypot(p.pos.x - camera.position.x, p.pos.z - camera.position.z)),
      shade: { visible: shade.visible, dist: Math.abs(shade.position.z - z) },
      lift: inLift ? env.k : -1, dark,
    });
  }
  fx.composer.render();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); fx.composer.setSize(innerWidth, innerHeight); sizeSpacer();
});
scrollTo(0, 0);
tick();

/* só em dev: simula frames com tempo sintético (o painel de preview limita o rAF) */
if (import.meta.env.DEV) {
  let simNow = performance.now();
  window.__sim = {
    audio, world, camera, scene, spot, ctl, SCARES, renderer, fx, shade,
    size(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); fx.composer.setSize(w, h); },
    place(d, ax = 0, ay = -0.05) { camD = forceD = d; aim.set(ax, ay); aimGoal.set(ax, ay); lastMove = simNow; },
    aimAt(ax, ay) { aimGoal.set(ax, ay); lastMove = simNow; },
    goto(d) { forceD = d; }, gait: () => ({ camD: +camD.toFixed(2), wv: +wv.toFixed(2), phase: +phase.toFixed(2), ws: +ws.toFixed(2) }),
    run(n, ms = 16.7) { running = false; const log = []; let prev = shownPoi; for (let i = 0; i < n; i++) { simNow += ms; lastT = simNow - ms; step(simNow); if (shownPoi !== prev) { log.push([i, prev, shownPoi]); prev = shownPoi; } } return log; },
    state: () => ({ shownPoi, camD: +camD.toFixed(2), floor: lastFloor, aim: [aim.x, aim.y].map((v) => +v.toFixed(2)), open: pois.map((p) => +p.open.toFixed(2)) }),
    poiNdc(i) { camera.updateMatrixWorld(); const v = pois[i].hit.getWorldPosition(new THREE.Vector3()).project(camera); return [+v.x.toFixed(3), +v.y.toFixed(3)]; },
    segs, D_END,
  };
}
