import * as THREE from 'three';
import { createAudio } from './audio.js';
import { buildWorld, CL } from './world.js';
import { createFx } from './fx.js';
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
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.03;
spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 26;
camera.add(spot);
const aimTarget = new THREE.Object3D(); scene.add(aimTarget); spot.target = aimTarget;

/* poeira (e fuligem nos andares fundos) acompanhando a câmera */
const DUST = coarse ? 160 : 380;
const dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 3.2; dustPos[i * 3 + 1] = Math.random() * 3.2; dustPos[i * 3 + 2] = -Math.random() * 14; dustSeed[i] = Math.random() * 6.28; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dc = document.createElement('canvas'); dc.width = dc.height = 32;
const dg = dc.getContext('2d'), grad = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); dg.fillStyle = grad; dg.fillRect(0, 0, 32, 32);
const dustMat = new THREE.PointsMaterial({ color: 0xffe2c8, size: 0.026, map: new THREE.CanvasTexture(dc), transparent: true, opacity: 0.28, depthWrite: false });
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

/* o vulto */
const shade = new THREE.Group();
const sMat = new THREE.MeshBasicMaterial({ color: 0x000000 });          /* silhueta preta: some no escuro, aparece contra a luz */
const sBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 1.45, 14), sMat); sBody.position.y = 0.95; shade.add(sBody);
const sHead = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), sMat); sHead.position.y = 1.85; shade.add(sHead);
for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); e.position.set(x, 1.87, 0.17); shade.add(e); }
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
let camD = D_START, lastScrollT = performance.now(), bobPhase = 0, vel = 0;
addEventListener('scroll', () => { lastScrollT = performance.now(); }, { passive: true });
const fwdV = new THREE.Vector3(), upV = new THREE.Vector3();
let lastT = performance.now(), elapsed = 0, running = true, lastFloor = -1;
const liftState = new Map();          /* por cabine: fases já disparadas */
let bannerT = 0;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) { lastT = performance.now(); audio.resume(); tick(); } else audio.pause();
});
function tick() { if (!running) return; requestAnimationFrame(tick); step(performance.now()); }

function step(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now; elapsed += dt; const t = elapsed;
  while (ctl.seq.length && ctl.seq[0].at <= now) ctl.seq.shift().fn();
  ctl.seq.sort((a, b) => a.at - b.at);

  /* câmera: scroll → D (suavizado) */
  const px = clamp(scrollY, 0, segs.totalPx);
  const goalD = forceD ?? dFromPx(px);
  const prevD = camD;
  camD = lerp(camD, goalD, 1 - Math.pow(0.002, dt));
  const stepD = Math.abs(camD - prevD);
  vel = lerp(vel, stepD / Math.max(dt, 1e-3), 0.1);
  bobPhase += stepD * 2.6;
  const env = world.envAt(camD);
  const inLift = env.cabin && camD > env.cabin.d0 + 0.3 && camD < env.cabin.d1;
  const mv = clamp(vel / 1.2, 0, 1) * (inLift ? 0.15 : 1);
  const bobY = reduce ? 0 : Math.sin(bobPhase) * 0.035 * mv, bobX = reduce ? 0 : Math.cos(bobPhase * 0.5) * 0.02 * mv;
  const z = world.zOf(camD);

  /* atmosfera do andar (névoa, grade, glitch, tremor, FOV) */
  scene.fog.color.copy(env.fog); scene.background.copy(env.fog); scene.fog.density = env.fogD;
  hemi.color.copy(env.amb); hemi.intensity = env.ambI;
  const shakeAmt = (reduce ? 0 : env.shake * 0.012) + ctl.shake * 0.05 + (inLift && env.k > 0 ? 0.01 : 0);
  ctl.shake = Math.max(0, ctl.shake - dt * 1.6);
  camera.fov = lerp(camera.fov, env.fov + ctl.fov, 1 - Math.pow(0.05, dt)); camera.updateProjectionMatrix();

  /* sem mouse por alguns segundos (celular): a luz vagueia sozinha */
  if (coarse && now - lastMove > 3500) aimGoal.set(Math.sin(t * 0.45) * 0.5, Math.cos(t * 0.33) * 0.18 - 0.04);
  aim.lerp(aimGoal, 1 - Math.pow(0.0005, dt));

  const sx = (Math.random() - 0.5) * shakeAmt, sy = (Math.random() - 0.5) * shakeAmt;
  camera.position.set(bobX + sx, 1.62 + bobY + sy, z);
  const roll = bobX * 0.5 + env.fear * Math.sin(t * 0.7) * 0.012;      /* o mundo "não está no prumo" lá no fundo */
  camera.rotation.set(aim.y * 0.16, -aim.x * 0.38, roll);

  /* lanterna */
  camera.updateMatrixWorld();
  ray.setFromCamera(aim, camera); ray.far = 20;
  aimTarget.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 9);
  spot.intensity = (coarse ? 90 : 150) * (1 + env.fear * 0.35) * (0.96 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.1) * 0.02) * (inLift ? 0.22 : 1);                 /* dentro da cabine a parede está colada: sem isso estoura o branco */

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

  /* poeira acompanha a câmera; mais fuligem e mais vermelha nos andares fundos */
  dustMat.color.set(env.fear > 0.7 ? 0xff9a8a : 0xffe2c8); dustMat.opacity = 0.22 + env.fear * 0.18;
  const dp = dustGeo.attributes.position;
  for (let i = 0; i < DUST; i++) {
    dp.array[i * 3] = dustPos[i * 3] + Math.sin(t * 0.3 + dustSeed[i]) * 0.15;
    dp.array[i * 3 + 1] = dustPos[i * 3 + 1] + Math.cos(t * 0.25 + dustSeed[i]) * 0.1 - (env.fear > 0.7 ? (t * 0.15 + dustSeed[i]) % 3.2 * 0.2 : 0);
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
      camPos: camera.position, fwd: fwdV, up: upV, p: corr, speed: vel, stepDist: stepD,
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
    run(n, ms = 16.7) { running = false; const log = []; let prev = shownPoi; for (let i = 0; i < n; i++) { simNow += ms; lastT = simNow - ms; step(simNow); if (shownPoi !== prev) { log.push([i, prev, shownPoi]); prev = shownPoi; } } return log; },
    state: () => ({ shownPoi, camD: +camD.toFixed(2), floor: lastFloor, aim: [aim.x, aim.y].map((v) => +v.toFixed(2)), open: pois.map((p) => +p.open.toFixed(2)) }),
    poiNdc(i) { camera.updateMatrixWorld(); const v = pois[i].hit.getWorldPosition(new THREE.Vector3()).project(camera); return [+v.x.toFixed(3), +v.y.toFixed(3)]; },
    segs, D_END,
  };
}
