/* O prédio: andares (zonas) ligados por elevadores, pontos de interesse (portas/telas/racks) e cenografia. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeShaft, haloTexture } from './lighting.js';
import { ABOUT, JOBS, RACKS, PROJECTS, ZONES } from './content.js';

export const W = 3.2, H = 3.2, SP = 5, LEAD = 8, TAIL = 5, CL = 6;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

/* gerador pseudo-aleatório determinístico: o prédio é sempre o mesmo */
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rnd() * (b - a);

export function buildWorld(scene, { tl, aniso, Q }) {
  /* ------------------------------------------------------------ materiais */
  /* telas pequenas: reduz as texturas na carga (1024 → 512/256) para caber na memória de vídeo do celular */
  const shrinkTex = (t) => {
    const img = t.image, T = Q.tex || 1024; if (!img || !img.width || img.width <= T) return;
    const c = document.createElement('canvas'); c.width = c.height = T; c.getContext('2d').drawImage(img, 0, 0, T, T); t.image = c; t.needsUpdate = true;
  };
  const loadSet = (name, metal) => {
    const L = (k, srgb) => { const t = tl.load(`tex/${Q.tex || 1024}/${name}_${k}.webp`, shrinkTex); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return { map: L('Color', true), normalMap: L('NormalGL'), roughnessMap: L('Roughness'), metalnessMap: metal ? L('Metalness') : null };
  };
  const sets = { wall: loadSet('wall'), floor: loadSet('floor'), ceil: loadSet('ceil'), metal: loadSet('metal', true) };
  const mat = (set, rx, ry, opts = {}) => {
    const c = (t) => { if (!t) return null; const n = t.clone(); n.repeat.set(rx, ry); return n; };
    const m = { map: c(set.map), normalMap: c(set.normalMap), roughnessMap: c(set.roughnessMap), ...opts };
    if (set.metalnessMap) m.metalnessMap = c(set.metalnessMap);
    return new THREE.MeshStandardMaterial(m);
  };
  /* dielétrico escuro sem brilho exagerado: sob a lanterna (física) um preto comum refletiria ~4% e viraria cinza */
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x0c0809, roughness: 0.88, metalness: 0.15, specularIntensity: 0.08 });
  const steel = mat(sets.metal, 2, 1, { color: 0x8a8486, metalness: 0.9 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x2e221c, roughness: 0.92 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 1, side: THREE.DoubleSide });

  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return { c, g, t };
  };
  const box = (w, h, d, m, x, y, z, parent, cast = true) => {
    const mn = Math.min(w, h, d);
    const o = new THREE.Mesh(mn >= 0.07 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, mn / 3.2)) : new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
    if (cast) { o.castShadow = true; o.receiveShadow = true; } parent.add(o); return o;
  };

  /* grunge: manchas grandes + sujeira fina, tileável (soma de senoides com frequências inteiras) */
  const grunge = (() => {
    const S = Q.msaa >= 4 ? 512 : 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    const waves = (n, fmin, fmax) => Array.from({ length: n }, () => ({ fx: (Math.round(rr(fmin, fmax)) || 1) * (rnd() < 0.5 ? -1 : 1), fy: Math.round(rr(fmin, fmax)) || 1, p: rr(0, 6.283), a: rr(0.4, 1) }));
    const lo = waves(16, 1, 9), hi = waves(22, 6, 38), TWO = Math.PI * 2;
    const sum = (ws, u, v) => { let s = 0, t = 0; for (const w of ws) { s += w.a * Math.sin(TWO * (w.fx * u + w.fy * v) + w.p); t += w.a; } return s / t; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, a = sum(lo, u, v), b = sum(hi, u, v), i = (y * S + x) * 4;
      const r = clamp(0.5 + a * 1.6, 0, 1), gg = clamp(0.5 + b * 1.8 + a * 0.4, 0, 1);
      d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = 128; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2; return t;
  })();
  const addGrunge = (m, strength = 0.8, scale = 0.37) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uHW = { value: new THREE.Vector2(W / 2, H) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.uniforms.tGrunge = { value: grunge }; sh.uniforms.uGr = { value: strength }; sh.uniforms.uGs = { value: scale };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform vec2 uHW; uniform sampler2D tGrunge; uniform float uGr; uniform float uGs;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          #ifdef USE_MAP
          vec4 grn = texture2D(tGrunge, vMapUv * uGs);
          vec4 grf = texture2D(tGrunge, vMapUv * 1.7 + 0.37);
          diffuseColor.rgb *= mix(1.0, (0.3 + grn.r * 0.85) * (0.58 + grf.g * 0.55), uGr);
          /* sujeira por altura e cantos: rodapé encardido, escorrido do teto, quina parede/piso escura */
          float ax = abs(vWp.x) / uHW.x;
          float low = 1.0 - smoothstep(0.0, 0.9, vWp.y), high = smoothstep(uHW.y - 0.7, uHW.y, vWp.y);
          float corner = smoothstep(0.7, 1.0, ax) * step(vWp.y, 0.05);
          float streak = texture2D(tGrunge, vec2(vWp.z * 0.9 + vWp.x * 3.0, vWp.y * 0.07)).g;
          float dirt = low * step(0.9, ax) * (0.45 + grf.r * 0.4) + high * 0.5 + corner * 0.4 + streak * 0.18 * smoothstep(0.2, 2.2, vWp.y) * step(0.9, ax);
          diffuseColor.rgb *= 1.0 - clamp(dirt, 0.0, 0.8);
          #endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          #ifdef USE_MAP
          roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.5 + grn.r * 0.95, uGr * 0.6), 0.04, 1.0);
          #endif`);
    };
    return m;
  };

  /* -------------------------------------------------------------- layout */
  let D = 0;
  const zones = [], cabins = [];
  ZONES.forEach((z, i) => {
    const len = z.len ?? (LEAD + z.n * SP + TAIL);
    zones.push({ ...z, i, d0: D, d1: D + len, len }); D += len;
    if (i < ZONES.length - 1) { cabins.push({ i, d0: D, d1: D + CL }); D += CL; }
  });
  const total = D, zOf = (d) => -d;

  /* ----------------------------------------------- casca dos andares */
  zones.forEach((z) => {
    const L = z.look, cz = zOf(z.d0 + z.len / 2), nsc = new THREE.Vector2(0.55, 0.55);
    const wm = mat(sets[L.wall[0]], z.len / L.wall[2], H / L.wall[2], { color: L.wall[1] });
    const fm = mat(sets[L.floor[0]], W / L.floor[2], z.len / L.floor[2], { color: L.floor[1], roughness: L.floor[3] ?? 0.85, normalScale: nsc });
    const cm = mat(sets[L.ceil[0]], W / L.ceil[2], z.len / L.ceil[2], { color: L.ceil[1] });
    addGrunge(wm, 0.9); addGrunge(fm, 0.8, 0.3); addGrunge(cm, 0.75);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, z.len), fm); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, cz); floor.receiveShadow = true; scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, z.len), cm); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, cz); ceil.receiveShadow = true; scene.add(ceil);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(z.len, H), wm); w.rotation.y = -s * Math.PI / 2; w.position.set(s * W / 2, H / 2, cz); w.receiveShadow = true; scene.add(w);
      box(0.05, 0.18, z.len, darkMetal, s * (W / 2 - 0.025), 0.09, cz, scene);              /* rodapé */
      if (z.i > 0) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, z.len, 12), steel); p.rotation.x = Math.PI / 2; p.position.set(s * (W / 2 - 0.3), H - 0.22, cz); p.castShadow = true; scene.add(p); }
    }
    for (let d = z.d0 + 2; d < z.d1; d += 4) box(W - 0.2, 0.05, 0.08, darkMetal, 0, H - 0.12, zOf(d), scene);   /* suportes */
    /* ---- detalhe arquitetônico: quebra a monotonia das paredes (pilastras, lambri, faixa, calha, duto, placas, faixa no piso) */
    const accent = new THREE.Color(L.lamp).multiplyScalar(0.45), wallC = new THREE.Color(L.wall[1]);
    const inst = (geo, m, list, cast = false) => {
      const im = new THREE.InstancedMesh(geo, m, list.length), o = new THREE.Object3D();
      list.forEach((v, i) => { o.position.set(v[0], v[1], v[2]); o.rotation.set(0, v[3] || 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = cast && Q.shadow; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im;
    };
    const poiDs = Array.from({ length: z.n || 0 }, (_, k) => z.d0 + LEAD + k * SP), clear = (d) => poiDs.every((p) => Math.abs(p - d) > 1.1);   /* nada de pilastra/placa em cima de porta */
    const ds = []; for (let d = z.d0 + 2; d < z.d1; d += 4) if (clear(d)) ds.push(d);
    const pil = new THREE.MeshStandardMaterial({ color: wallC.clone().multiplyScalar(0.3), roughness: 0.92, metalness: 0 });
    inst(new THREE.BoxGeometry(0.16, H, 0.34), pil, ds.flatMap((d) => [[-(W / 2 - 0.08), H / 2, zOf(d)], [W / 2 - 0.08, H / 2, zOf(d)]]), true);
    const lam = addGrunge(mat(sets.metal, z.len / 1.4, 0.8, { color: wallC.clone().multiplyScalar(0.5), metalness: 0.55, roughness: 0.7 }), 0.8, 0.5);
    for (const sd of [-1, 1]) {
      box(0.035, 1.05, z.len, lam, sd * (W / 2 - 0.0175), 0.525, cz, scene, false);                         /* lambri metálico */
      box(0.06, 0.07, z.len, darkMetal, sd * (W / 2 - 0.03), 1.08, cz, scene, false);                       /* guarda-corpo / friso */
    }
    if (Q.props >= 0.7) {
      const st = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.75, metalness: 0.1 });
      for (const sd of [-1, 1]) box(0.012, 0.12, z.len, st, sd * (W / 2 - 0.006), 1.55, cz, scene, false);   /* faixa de cor do andar */
      const dash = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const dl = []; for (let d = z.d0 + 1; d < z.d1 - 0.5; d += 1.6) dl.push([0, 0.004, zOf(d)]);
      const dm = inst(new THREE.PlaneGeometry(0.07, 0.7).rotateX(-Math.PI / 2), dash, dl);                    /* tracejado central no piso */
      dm.receiveShadow = false;
      const sg = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#0d0f12'; g.fillRect(0, 0, w, h); g.strokeStyle = '#' + accent.clone().multiplyScalar(2.2).getHexString(); g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
        g.fillStyle = g.strokeStyle; g.font = 'bold 30px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`ANDAR ${z.floor} ▸`, w / 2, h / 2 + 1);
      }).t;
      const sgm = new THREE.MeshStandardMaterial({ map: sg, roughness: 0.55, metalness: 0.2, emissiveMap: sg, emissive: 0xffffff, emissiveIntensity: 0.18 });
      const sl = []; for (let d = z.d0 + 4; d < z.d1 - 3; d += 12) if (clear(d)) sl.push([-(W / 2 - 0.03), 2.05, zOf(d), Math.PI / 2], [W / 2 - 0.03, 2.05, zOf(d), -Math.PI / 2]);
      inst(new THREE.PlaneGeometry(0.9, 0.225), sgm, sl);
    }
    box(0.45, 0.05, z.len, darkMetal, -(W / 2 - 0.85), H - 0.3, cz, scene, false);                           /* calha de cabos */
    if (z.i > 0) {
      const dt = addGrunge(mat(sets.metal, 1, 1, { color: 0x77787c, metalness: 0.7, roughness: 0.6 }), 0.7, 0.8), dl2 = [];
      for (let d = z.d0 + 1; d < z.d1 - 3.8; d += 4) dl2.push([W / 2 - 0.9, H - 0.42, zOf(d + 1.9)]);
      inst(new THREE.BoxGeometry(0.55, 0.34, 3.7), dt, dl2, true);                                           /* duto em segmentos */
    }
  });
  /* parede do fim do prédio + porta final */
  const lastZ = zones[zones.length - 1];
  const endWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat(sets.ceil, 1.4, 1.2, { color: 0x24100f }));
  endWall.position.set(0, H / 2, zOf(lastZ.d1)); scene.add(endWall);

  /* -------------------------------------------------------- elevadores */
  const labelOf = (zi) => `${zones[zi].floor}`;
  cabins.forEach((c) => {
    const cz = zOf(c.d0 + CL / 2);
    const brushed = canvasTex(256, 256, (g, w2, h2) => {                                                    /* aço escovado: fibras verticais finas */
      g.fillStyle = '#8c9298'; g.fillRect(0, 0, w2, h2);
      for (let x = 0; x < w2; x++) { const a = rr(0.02, 0.16); g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(x, 0, 1, h2); }
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${rr(0.02, 0.07)})`; g.fillRect(rr(0, w2), rr(0, h2), rr(1, 3), rr(10, 80)); }
    }).t;
    brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping; brushed.repeat.set(3, 2);
    const mm = new THREE.MeshStandardMaterial({ map: brushed, color: 0x9ba1a8, roughness: 0.45, metalness: 0.4 });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, CL), mat(sets.metal, 2, 2, { color: 0x3a3e44, roughness: 0.9, metalness: 0.1, roughnessMap: null })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.005, cz); fl.receiveShadow = true; scene.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, CL), mat(sets.metal, 2, 2, { color: 0x50555c, roughness: 0.9, metalness: 0.1, roughnessMap: null })); ce.rotation.x = Math.PI / 2; ce.position.set(0, H, cz); scene.add(ce);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(CL, H), mm); w.rotation.y = -s * Math.PI / 2; w.position.set(s * (W / 2 - 0.004), H / 2, cz); w.receiveShadow = true; scene.add(w);
      box(0.06, 0.05, CL - 0.3, steel, s * (W / 2 - 0.05), 1.0, cz, scene, false);                      /* corrimão */
    }
    /* acabamento realista da cabine: friso de painéis, espelho, rodapé, soleira, plaqueta e luminária */
    const seam = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.7, metalness: 0.4 });
    const seams = []; for (let k = 1; k < 7; k++) for (const sd of [-1, 1]) seams.push([sd * (W / 2 - 0.008), H / 2, cz - CL / 2 + k * (CL / 7)]);
    const sm2 = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, H - 0.1, 0.012), seam, seams.length), so2 = new THREE.Object3D();
    seams.forEach((v, i) => { so2.position.set(v[0], v[1], v[2]); so2.updateMatrix(); sm2.setMatrixAt(i, so2.matrix); }); scene.add(sm2);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(CL * 0.55, 1.5), new THREE.MeshStandardMaterial({ color: 0xbfc6cc, roughness: 0.06, metalness: 1 }));
    mirror.rotation.y = Math.PI / 2; mirror.position.set(-(W / 2 - 0.012), 1.75, cz); scene.add(mirror);                      /* espelho na parede esquerda */
    for (const [w, h, y] of [[CL * 0.55 + 0.1, 0.05, 2.52], [CL * 0.55 + 0.1, 0.05, 0.98]]) box(0.025, h, w, steel, -(W / 2 - 0.012), y, cz, scene, false);
    for (const sd of [-1, 1]) box(0.03, 0.3, CL, darkMetal, sd * (W / 2 - 0.016), 0.15, cz, scene, false);                  /* rodapé de aço escuro */
    box(W, 0.02, 0.2, steel, 0, 0.012, zOf(c.d0), scene, false); box(W, 0.02, 0.2, steel, 0, 0.012, zOf(c.d1), scene, false);   /* soleiras */
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5, map: canvasTex(256, 150, (g, w2, h2) => {
      g.fillStyle = '#aab0b6'; g.fillRect(0, 0, w2, h2); g.fillStyle = '#1b1d20'; g.font = '700 22px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('CAPACIDADE', w2 / 2, 40); g.font = '700 30px Arial, sans-serif'; g.fillText('8 PESSOAS', w2 / 2, 82); g.fillText('630 kg', w2 / 2, 122);
    }).t }));
    plaque.rotation.y = Math.PI / 2; plaque.position.set(-(W / 2 - 0.01), 2.05, zOf(c.d0 + 0.9)); scene.add(plaque);
    /* portas de correr (frente e fundo) */
    const mkDoors = (d) => {
      const g = new THREE.Group(); g.position.set(0, 0, zOf(d)); scene.add(g);
      const L = box(W / 2 + 0.02, H, 0.08, mm, -W / 4, H / 2, 0, g), R = box(W / 2 + 0.02, H, 0.08, mm, W / 4, H / 2, 0, g);
      box(W + 0.2, 0.25, 0.14, darkMetal, 0, H - 0.1, 0, g, false);
      return { L, R, open: 1 };
    };
    c.front = mkDoors(c.d0); c.back = mkDoors(c.d1); c.back.open = 0;
    /* painel de andar (canvas atualizado só quando muda) */
    const disp = canvasTex(256, 128, () => {});
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: disp.t }));
    dm.position.set(0, 2.72, zOf(c.d1) + 0.1); scene.add(dm);
    c.disp = { ...disp, last: null };
    const btn = canvasTex(160, 400, (g, w2, h2) => {
      g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, w2, h2); g.fillStyle = '#6d7379'; g.fillRect(6, 6, w2 - 12, h2 - 12);
      const labels = ['0', '-1', '-2', '-3', '-4', '-5']; g.textAlign = 'center'; g.textBaseline = 'middle';
      labels.forEach((t, k) => { const x = 40 + (k % 2) * 80, y = 54 + Math.floor(k / 2) * 68; g.fillStyle = '#25282c'; g.beginPath(); g.arc(x, y, 25, 0, 6.3); g.fill(); g.strokeStyle = '#d8dce0'; g.lineWidth = 3; g.stroke(); g.fillStyle = k === c.i + 1 ? '#ffb27a' : '#e4e7ea'; g.font = '700 22px Arial, sans-serif'; g.fillText(t, x, y + 1); });
      g.fillStyle = '#25282c'; g.beginPath(); g.arc(40, 346, 22, 0, 6.3); g.fill(); g.beginPath(); g.arc(120, 346, 22, 0, 6.3); g.fill();
      g.fillStyle = '#ff3a2a'; g.font = '700 20px Arial'; g.fillText('🔔', 40, 347); g.fillStyle = '#e4e7ea'; g.fillText('◀▶', 120, 347);
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.75), new THREE.MeshStandardMaterial({ map: btn.t, roughness: 0.45, metalness: 0.6, emissive: 0xffffff, emissiveMap: btn.t, emissiveIntensity: 0.15 }));
    panel.rotation.y = -Math.PI / 2; panel.position.set(W / 2 - 0.012, 1.3, zOf(c.d0 + 0.95)); scene.add(panel);
    box(0.02, 0.8, 0.35, steel, W / 2 - 0.012, 1.3, zOf(c.d0 + 0.95), scene, false);
    c.light = { D: c.d0 + CL / 2, y: H - 0.35, color: 0xfff0dc, base: 2.0, bad: false, seed: 1, k: 1, cabin: true };
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.7), new THREE.MeshBasicMaterial({ color: 0xfff0dc })); tube.position.set(0, H - 0.05, cz); scene.add(tube);
    c.light.tube = tube;
    box(1.34, 0.03, 0.84, darkMetal, 0, H - 0.015, cz, scene, false);                       /* moldura da luminária */
  });
  const drawFloor = (c, text, glitchy) => {
    const { g } = c.disp; g.fillStyle = '#050505'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#ff2a2a'; g.lineWidth = 3; g.strokeRect(4, 4, 248, 120);
    g.fillStyle = glitchy ? '#ff2a2a' : '#ffb27a'; g.font = '700 64px monospace'; g.textAlign = 'center'; g.fillText(text, 128, 84);
    g.font = '600 16px monospace'; g.fillStyle = '#9aa'; g.fillText('ANDAR', 128, 28);
    c.disp.t.needsUpdate = true;
  };

  /* ---------------------------------------------------- decalques (sangue, textos) */
  const dripTex = canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) {
      const x = rr(10, w - 10), len = rr(80, h - 60), wd = rr(4, 16);
      const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(120,0,6,.95)'); gr.addColorStop(1, 'rgba(70,0,4,.9)');
      g.fillStyle = gr; g.fillRect(x - wd / 2, 0, wd, len); g.beginPath(); g.arc(x, len, wd * 0.8, 0, 6.3); g.fill();
    }
    g.fillStyle = 'rgba(110,0,6,.9)'; g.fillRect(0, 0, w, rr(14, 30));
  });
  const handTex = canvasTex(128, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(130,0,8,.9)';
    g.beginPath(); g.ellipse(64, 100, 34, 42, 0, 0, 6.3); g.fill();
    for (let k = 0; k < 5; k++) { const a = -0.9 + k * 0.45; g.save(); g.translate(64, 80); g.rotate(a); g.fillRect(-6, -78 - (k === 0 || k === 4 ? -16 : 0), 12, 70); g.restore(); }
    for (let k = 0; k < 6; k++) g.fillRect(rr(30, 98), 120, 4, rr(20, 40));
  });
  const writeTex = (text) => canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = '700 74px "Metal Mania", Impact, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(150,0,10,.95)'; g.fillText(text, w / 2, 86);
    for (let i = 0; i < 18; i++) { g.fillRect(rr(20, w - 20), 90, 5, rr(10, 36)); }
  });
  const decalMat = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...o });
  const wallDecal = (tex, w, h, d, y, side, parent = scene) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(tex.t));
    m.position.set(side * (W / 2 - 0.012), y, zOf(d)); m.rotation.y = -side * Math.PI / 2; parent.add(m); return m;
  };

  /* ----------------------------------------------------------- pontos de interesse */
  const pois = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const poiD = (z, k) => z.d0 + LEAD + k * SP;
  const sideOf = (k) => (k % 2 ? 1 : -1);

  function plate(a, b, color) {
    return canvasTex(256, 96, (g) => {
      g.fillStyle = '#100608'; g.fillRect(0, 0, 256, 96); g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, 250, 90);
      g.fillStyle = color; g.font = '700 34px monospace'; g.textAlign = 'center'; g.fillText(a, 128, 44);
      g.fillStyle = '#e8c9c9'; g.font = '600 15px monospace'; g.fillText(b, 128, 74);
    }).t;
  }
  function makeDoor(z, k, a, b, card, accent) {
    const side = sideOf(k), d = poiD(z, k), DW = 1.15, DH = 2.3;
    const g = new THREE.Group(); g.position.set(side * (W / 2 - 0.02), 0, zOf(d)); g.rotation.y = -side * Math.PI / 2; scene.add(g);
    box(DW + 0.28, DH + 0.14, 0.12, darkMetal, 0, (DH + 0.14) / 2, -0.02, g);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshBasicMaterial({ color: z.fear > 0.7 ? 0xff3a22 : 0xffa060 })); glow.position.set(0, DH / 2, -0.015); g.add(glow);
    const pivot = new THREE.Group(); pivot.position.set(-DW / 2, 0, 0); g.add(pivot);
    const leaf = box(DW, DH, 0.06, steel, DW / 2, DH / 2, 0.02, pivot);
    const pt = plate(a, b, accent);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: pt, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.12 })); pl.position.set(DW / 2, 1.75, 0.055); pivot.add(pl);
    box(0.05, 0.14, 0.07, darkMetal, DW - 0.12, 1.05, 0.07, pivot);
    if (z.fear >= 0.75) { const h = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), decalMat(handTex.t)); h.position.set(rr(0.4, 0.8), rr(1.1, 1.5), 0.056); h.rotation.z = rr(-0.3, 0.3); pivot.add(h); }
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(DW + 0.3, DH + 0.2), hitMat); hit.position.set(0, DH / 2, 0.05); g.add(hit);
    const poi = { z, k, D: d, side, kind: 'door', card, group: g, hit, open: 0, pivot, pos: { x: side * (W / 2 - 0.5), y: 1.2, z: zOf(d) }, audio: z.id === 'exp' ? 'clock' : 'breath' };
    hit.userData.poi = pois.length; pois.push(poi);
    poi.apply = () => { pivot.rotation.y = -poi.open * 0.85; };
    leaf.userData.noHit = true;
    return poi;
  }
  function makeMonitor(z, k, card) {
    const side = sideOf(k), d = poiD(z, k);
    const g = new THREE.Group(); g.position.set(side * (W / 2 - 0.02), 0, zOf(d)); g.rotation.y = -side * Math.PI / 2; scene.add(g);
    const lines = (corrupt) => canvasTex(512, 320, (c, w, h) => {
      c.fillStyle = '#031208'; c.fillRect(0, 0, w, h); c.font = '600 22px monospace'; c.fillStyle = '#3dff9a';
      c.fillText(`C:\\sobre_0${k + 1}.txt`, 18, 34); c.fillStyle = corrupt ? '#ff2a2a' : '#9fe8c0';
      const words = (corrupt ? 'ele vê você ele vê você ele vê você não olhe atrás' : card.body).split(' '); let line = '', y = 74;
      for (const wd of words) { if ((line + wd).length > 30) { c.fillText(line, 18, y); y += 30; line = ''; } line += wd + ' '; if (y > h - 24) break; }
      c.fillText(line, 18, y); c.fillRect(18, h - 30, 14, 20);
    });
    const normal = lines(false), bad = lines(true);
    const scr = new THREE.MeshStandardMaterial({ map: normal.t, emissive: 0xffffff, emissiveMap: normal.t, emissiveIntensity: 0.55, roughness: 0.3 });
    box(1.5, 0.95, 0.1, plastic, 0, 1.75, 0.02, g);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.82), scr); sm.position.set(0, 1.75, 0.075); g.add(sm);
    box(1.6, 0.05, 0.8, wood, 0, 0.92, 0.4, g); box(0.05, 0.9, 0.7, darkMetal, -0.72, 0.45, 0.4, g); box(0.05, 0.9, 0.7, darkMetal, 0.72, 0.45, 0.4, g);
    const chair = new THREE.Group(); chair.position.set(0, 0, 1.15); g.add(chair);
    box(0.5, 0.06, 0.5, fabric, 0, 0.5, 0, chair); box(0.5, 0.55, 0.06, fabric, 0, 0.8, 0.22, chair); box(0.06, 0.5, 0.06, darkMetal, 0, 0.25, 0, chair);
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), hitMat); hit.position.set(0, 1.5, 0.12); g.add(hit);
    const poi = { z, k, D: d, side, kind: 'screen', card, group: g, hit, open: 0, chair, pos: { x: side * (W / 2 - 0.5), y: 1.5, z: zOf(d) }, audio: 'none' };
    hit.userData.poi = pois.length; pois.push(poi);
    poi.apply = () => {
      const on = poi.open > 0.5, flick = on && Math.sin(performance.now() * 0.03) > 0.8 && z.fear > 0.3;
      scr.emissiveIntensity = 0.55 + poi.open * 0.9; const t = flick ? bad.t : normal.t; scr.map = t; scr.emissiveMap = t;
    };
    return poi;
  }
  function rackFront(label, hot) {
    return canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#0a0d10'; g.fillRect(0, 0, w, h);
      for (let u = 0; u < 12; u++) {
        const y = 14 + u * 40; g.fillStyle = '#14191e'; g.fillRect(10, y, w - 20, 34); g.strokeStyle = '#222a31'; g.strokeRect(10, y, w - 20, 34);
        for (let l = 0; l < 9; l++) { g.fillStyle = hot ? (rnd() > 0.35 ? '#ff2a2a' : '#400') : (rnd() > 0.5 ? '#3dff9a' : (rnd() > 0.5 ? '#00d8ff' : '#123')); g.fillRect(24 + l * 12, y + 8, 6, 6); }
        g.fillStyle = '#333'; for (let v = 0; v < 12; v++) g.fillRect(150 + v * 6, y + 6, 3, 22);
      }
      g.fillStyle = '#9ab'; g.font = '600 18px monospace'; g.fillText(label, 14, 502);
    });
  }
  let rackInnerMat = null;
  function makeRack(z, k, card, poiFlag, d, side) {
    const g = new THREE.Group(); g.position.set(side * (W / 2 - 0.52), 0, zOf(d)); g.rotation.y = -side * Math.PI / 2; scene.add(g);
    box(1.0, 2.3, 0.9, new THREE.MeshStandardMaterial({ color: 0x090c10, roughness: 0.95, metalness: 0.1 }), 0, 1.15, 0.0, g);
    const ft = rackFront(card ? card.title : 'srv', false), ftHot = rackFront(card ? card.title : 'srv', true);
    const front = new THREE.MeshStandardMaterial({ map: ft.t, emissive: 0xffffff, emissiveMap: ft.t, emissiveIntensity: 0.9, roughness: 0.5 });
    const pivot = new THREE.Group(); pivot.position.set(-0.47, 0, 0.47); g.add(pivot);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.95, metalness: 0.1 });        /* quinas foscas: não pegam brilho branco da lanterna */
    const inner = rackInnerMat || (rackInnerMat = (() => { const t = canvasTex(128, 256, (g, ww, hh) => { g.fillStyle = '#0c1014'; g.fillRect(0, 0, ww, hh); g.fillStyle = '#05070a'; for (let i = 0; i < 18; i++) g.fillRect(14, 10 + i * 13, ww - 28, 6); g.strokeStyle = '#1b222a'; g.lineWidth = 3; g.strokeRect(5, 5, ww - 10, hh - 10); }).t; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.2 }); })());
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.94, 2.2, 0.04), [edgeMat, edgeMat, edgeMat, edgeMat, front, inner]);   /* só a frente leva o painel; o verso mostra a grade */ door.position.set(0.47, 1.15, 0); door.castShadow = true; pivot.add(door);
    if (!poiFlag) return { g, front, ftHot, ft };
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), hitMat); hit.position.set(0, 1.2, 0.6); g.add(hit);
    const poi = { z, k, D: d, side, kind: 'rack', card, group: g, hit, open: 0, pivot, pos: { x: side * (W / 2 - 0.6), y: 1.2, z: zOf(d) }, audio: 'servers', front, ft, ftHot, hot: false };
    hit.userData.poi = pois.length; pois.push(poi);
    poi.apply = () => { pivot.rotation.y = poi.open * 1.35; front.emissiveIntensity = 0.9 + poi.open * 0.7; };
    return poi;
  }

  zones.forEach((z) => {
    for (let k = 0; k < z.n; k++) {
      const d = poiD(z, k);
      if (z.id === 'sobre') makeMonitor(z, k, { cat: 'SOBRE MIM', title: `Arquivo 0${k + 1}`, body: ABOUT[k] });
      else if (z.id === 'exp') { const j = JOBS[k]; makeDoor(z, k, `SALA 0${k + 1}`, j.date.split('—')[0].trim(), { cat: j.date, title: j.role, stack: j.co, body: j.desc }, '#7cff9a'); }
      else if (z.id === 'skills') { const r = RACKS[k]; makeRack(z, k, { cat: 'STACK', title: r.name, list: r.list, body: r.body }, true, d, sideOf(k)); }
      else if (z.id === 'proj') { const p = PROJECTS[k]; makeDoor(z, k, `LAB 0${k + 1}`, p.cat, { cat: p.cat, title: p.name, stack: p.stack, body: p.desc, url: p.url }, '#ff3a2a'); }
    }
  });

  /* ----------------------------------------------------------- cenografia por andar */
  const decorT = [];       /* coisas que se animam: { update(t, camD) } */
  const events = {};       /* objetos usados pelos sustos */

  /* recepção */
  {
    const z = zones[0];
    const desk = new THREE.Group(); desk.position.set(1.0, 0, zOf(z.d0 + 15)); scene.add(desk);
    /* balcão de recepção: corpo de madeira ripada, tampo de pedra polida, ressalto de atendimento, toe-kick e objetos */
    const walnut = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.65, metalness: 0.05 });
    const slatM = new THREE.MeshStandardMaterial({ color: 0x3b2619, roughness: 0.55, metalness: 0.05 });
    const stone = new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.1, map: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,215,.22)';
      for (let i = 0; i < 14; i++) { g.lineWidth = rr(0.6, 2); g.beginPath(); let x = rr(0, w), y = 0; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rr(-30, 30); y += h / 8; g.lineTo(x, y); } g.stroke(); }
    }).t });
    box(1.1, 0.95, 2.6, walnut, 0, 0.5, 0, desk);                                  /* corpo */
    box(1.12, 0.1, 2.62, darkMetal, 0, 0.05, 0, desk, false);                      /* rodapé do balcão */
    const slats = []; for (let k = 0; k < 18; k++) slats.push([-0.565, 0.55, (k - 8.5) * 0.14, 0]);
    const slm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.78, 0.075), slatM, slats.length), so = new THREE.Object3D();
    slats.forEach((v, i) => { so.position.set(v[0], v[1], v[2]); so.updateMatrix(); slm.setMatrixAt(i, so.matrix); }); slm.castShadow = Q.shadow; desk.add(slm);   /* ripas na face do corredor */
    for (const e of [-1, 1]) {                                                       /* topos do balcão: moldura + almofada rebaixada */
      box(1.04, 0.84, 0.02, darkMetal, 0, 0.5, e * 1.305, desk, false);
      box(0.86, 0.66, 0.025, slatM, 0, 0.5, e * 1.312, desk, false);
    }
    box(1.2, 0.05, 2.72, stone, 0, 1.0, 0, desk);                                  /* tampo de pedra */
    box(0.22, 0.22, 2.72, walnut, -0.5, 1.12, 0, desk);                            /* ressalto de atendimento */
    box(0.04, 0.02, 2.72, steel, -0.62, 1.01, 0, desk, false);                     /* friso metálico */
    const kb = box(0.18, 0.02, 0.45, plastic, -0.15, 1.04, -0.4, desk, false); void kb;
    box(0.28, 0.03, 0.2, paper, 0.1, 1.04, 0.5, desk, false); box(0.28, 0.03, 0.2, paper, 0.12, 1.07, 0.5, desk, false).rotation.y = 0.3;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, 6.3, 0, 1.4), steel); bell.position.set(-0.4, 1.04, 0.8); desk.add(bell);
    box(0.2, 0.06, 0.26, plastic, -0.2, 1.06, 1.0, desk, false);                   /* telefone */
    const lamp = new THREE.Group(); lamp.position.set(0.35, 1.03, -1.0); desk.add(lamp);
    box(0.12, 0.02, 0.12, darkMetal, 0, 0, 0, lamp, false); box(0.02, 0.35, 0.02, darkMetal, 0, 0.18, 0, lamp, false); box(0.18, 0.1, 0.1, darkMetal, 0, 0.38, 0, lamp, false);
    const mon = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#031208'; g.fillRect(0, 0, w, h); g.fillStyle = '#3dff9a'; g.font = '600 20px monospace'; g.fillText('RECEPÇÃO', 18, 36); g.fillText('> visitante: 1', 18, 70); g.fillText('> andar: 0', 18, 100); g.fillText('> descer? [s/N]', 18, 130); });
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ map: mon.t, emissive: 0xffffff, emissiveMap: mon.t, emissiveIntensity: 0.8 })); sc.position.set(-0.25, 1.4, -0.4); sc.rotation.y = Math.PI / 2 - 0.2; desk.add(sc);
    const tv = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#05090c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8f6ff'; g.font = '700 40px monospace'; g.fillText('BEM-VINDO', 24, 90); g.font = '500 24px monospace'; g.fillStyle = '#7fd'; g.fillText('alexandre.exe · full stack', 24, 140); g.fillStyle = '#ff6a5a'; g.fillText('ANDAR 0 — não desça.', 24, 200); });
    const tm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: tv.t, emissive: 0xffffff, emissiveMap: tv.t, emissiveIntensity: 0.7 })); tm.position.set(-(W / 2 - 0.04), 1.9, zOf(z.d0 + 11)); tm.rotation.y = Math.PI / 2; scene.add(tm);
  }

  /* escritórios: divisórias, pôsteres que se corrompem, cadeira que rola sozinha */
  {
    const z = zones[1];
    const posters = ['TRABALHE EM EQUIPE', 'FOCO. FOCO. FOCO.', 'ELE ESTÁ AQUI', 'NÃO OLHE ATRÁS', 'VOCÊ É INSUBSTITUÍVEL'];
    const cubFabric = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 1, metalness: 0 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.55, metalness: 0.6 });
    posters.forEach((txt, k) => {
      const side = -sideOf(k), d = poiD(z, k);                                  /* baia de trabalho em torno da tela */
      const t = canvasTex(256, 320, (g, w, h) => { g.fillStyle = k >= 2 ? '#2a0a0a' : '#e8e6de'; g.fillRect(0, 0, w, h); g.fillStyle = k >= 2 ? '#d22' : '#222'; g.font = '700 30px sans-serif'; g.textAlign = 'center'; const parts = txt.split(' '); parts.forEach((p, i) => g.fillText(p, w / 2, 110 + i * 40)); g.strokeStyle = k >= 2 ? '#800' : '#999'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); });
      for (const e of [-1, 1]) {                                                 /* divisórias perpendiculares à parede, com moldura de alumínio */
        const cx = side * (W / 2 - 0.5), cz2 = zOf(d + e * 1.05);
        box(1.0, 1.45, 0.05, cubFabric, cx, 0.95, cz2, scene);
        box(1.02, 0.04, 0.07, trim, cx, 1.69, cz2, scene, false); box(0.04, 1.49, 0.07, trim, cx - side * 0.5, 0.95, cz2, scene, false); box(0.05, 0.2, 0.09, trim, cx - side * 0.5, 0.1, cz2, scene, false);
        if (e === 1) {                                                           /* pôster afixado na divisória, de frente para o posto */
          box(0.5, 0.62, 0.012, darkMetal, cx, 1.25, cz2 + 0.03, scene, false);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.56), new THREE.MeshStandardMaterial({ map: t.t, roughness: 0.8 })); m.position.set(cx, 1.25, cz2 + 0.04); scene.add(m);
        }
      }
    });
    const roll = zones[1].pois = pois.filter((p) => p.z === z);
    events.chair = roll[2] ? roll[2].chair : null; events.chairPoi = roll[2];
  }

  /* arquivo: armários de gavetas (que abrem sozinhos), papéis no chão */
  {
    const z = zones[2]; events.drawers = [];
    const dtex = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#4c554f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { g.strokeStyle = '#1f2421'; g.lineWidth = 3; g.strokeRect(6, 8 + i * 61, w - 12, 55); g.fillStyle = '#222'; g.fillRect(w / 2 - 16, 28 + i * 61, 32, 6); } });
    const cm = new THREE.MeshStandardMaterial({ map: dtex.t, roughness: 0.5, metalness: 0.5 });
    for (let k = 0; k < z.n; k++) for (const s of [-1, 1]) {
      if (s === sideOf(k)) continue;
      const g = new THREE.Group(); g.position.set(s * (W / 2 - 0.4), 0, zOf(poiD(z, k))); g.rotation.y = -s * Math.PI / 2; scene.add(g);
      box(0.8, 1.9, 0.7, cm, 0, 0.95, 0, g);
      const dr = box(0.74, 0.34, 0.06, darkMetal, 0, 1.2 + (k % 2) * 0.25, 0.38, g); dr.userData.rest = dr.position.z; events.drawers.push({ mesh: dr, d: poiD(z, k), open: 0, goal: 0 });
    }
    for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), paper); m.rotation.set(-Math.PI / 2, 0, rr(0, 6.3)); m.position.set(rr(-1.3, 1.3), 0.012 + rnd() * 0.004, zOf(rr(z.d0 + 3, z.d1 - 2))); scene.add(m); }
  }

  /* servidores: racks decorativos, bandejas de cabos */
  {
    const z = zones[3];
    for (let k = 0; k < z.n; k++) for (const s of [-1, 1]) { if (s === sideOf(k)) { const d2 = poiD(z, k) + 2.5; makeRack(z, k, null, false, d2, s); } else makeRack(z, k, null, false, poiD(z, k), s); }
    for (const s of [-1, 1]) box(0.5, 0.06, z.len, darkMetal, s * 0.9, H - 0.45, zOf(z.d0 + z.len / 2), scene, false);
  }

  /* laboratório e abismo: sangue nas paredes, correntes, escritas */
  {
    const zl = zones[4], zb = zones[5];
    for (let i = 0; i < 12; i++) { const z = i < 8 ? zl : zb; wallDecal(dripTex, rr(0.7, 1.2), rr(1.4, 2.6), rr(z.d0 + 2, z.d1 - 2), rr(1.5, 2.6), i % 2 ? 1 : -1); }
    ['ELE VÊ VOCÊ', 'NÃO VOLTE', 'DESÇA'].forEach((txt, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), decalMat(writeTex(txt).t)); const side = i % 2 ? 1 : -1; m.position.set(side * (W / 2 - 0.012), 1.7, zOf(zb.d0 + 4 + i * 4.5)); m.rotation.y = -side * Math.PI / 2; scene.add(m); });
    for (let i = 0; i < 9; i++) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rr(0.8, 1.8), 6), darkMetal); ch.position.set(rr(-1.2, 1.2), H - 0.7, zOf(rr(zl.d0 + 4, zl.d1 - 3))); scene.add(ch); }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), new THREE.MeshStandardMaterial({ color: 0x3a0305, roughness: 0.12, metalness: 0.2 })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.012, zOf(zb.d1 - 5)); scene.add(pool);
    /* a porta final: grande, com fresta de luz vermelha */
    const fd = new THREE.Group(); fd.position.set(0, 0, zOf(zb.d1) + 0.05); scene.add(fd);
    box(2.0, 2.8, 0.12, darkMetal, 0, 1.4, 0, fd);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), new THREE.MeshBasicMaterial({ color: 0xff3018 })); gl.position.set(0, 1.4, 0.07); fd.add(gl);
    const bars = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), new THREE.MeshStandardMaterial({ color: 0x050202, roughness: 0.6 })); bars.position.set(0, 1.4, 0.075); fd.add(bars);
    bars.geometry = new THREE.PlaneGeometry(1.7, 2.6); bars.material.transparent = true; bars.material.opacity = 0.94;
    events.endGlow = gl;
  }

  /* poças de água/sangue que espelham as lâmpadas e manchas de sujeira nas paredes */
  {
    const edge = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }).t;
    edge.colorSpace = THREE.NoColorSpace;
    const puddleMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.05, metalness: 0, envMapIntensity: 2.4, alphaMap: edge, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const puddles = [[zones[2], 0x0a1210, 7], [zones[3], 0x05080c, 4], [zones[4], 0x1a0505, 8], [zones[5], 0x2a0404, 6]];
    for (const [z, col, n0] of puddles) for (let i = 0, n = Math.round(n0 * Math.max(Q.props, 0.5)); i < n; i++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1, 28), puddleMat(col)); p.rotation.x = -Math.PI / 2; p.scale.set(rr(0.35, 0.9), rr(0.5, 1.4), 1);
      p.position.set(rr(-1.2, 1.2), 0.006, zOf(rr(z.d0 + 2, z.d1 - 2))); p.userData.noAO = true; scene.add(p);
    }
    const stain = canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { const x = rr(20, w - 20), y = rr(20, h - 20), r = rr(14, 70), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(10,8,6,${rr(0.08, 0.28)})`); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      for (let i = 0; i < 10; i++) { const x = rr(10, w - 10), len = rr(40, 220), gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(30,18,10,${rr(0.15, 0.35)})`); gr.addColorStop(1, 'rgba(30,18,10,0)'); g.fillStyle = gr; g.fillRect(x, 0, rr(3, 12), len); }
    });
    zones.forEach((z) => { if (z.i === 0) return; for (let i = 0; i < Math.round((8 + z.i * 2) * Math.max(Q.props, 0.5)); i++) wallDecal(stain, rr(1.2, 2.6), rr(1.2, 2.6), rr(z.d0 + 1, z.d1 - 1), rr(1.0, 2.4), i % 2 ? 1 : -1); });
  }

  /* ------------------------------------------------------------- luzes */
  const fixtures = [];
  zones.forEach((z) => {
    for (let d = z.d0 + 3; d < z.d1 - 1.5; d += 8) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 1.1), new THREE.MeshBasicMaterial({ color: z.look.lamp })); tube.position.set(0, H - 0.04, zOf(d)); scene.add(tube);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: z.look.lamp, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false }));
      halo.scale.set(2.2, 2.2, 1); halo.position.set(0, H - 0.25, zOf(d)); halo.userData.noAO = true; halo.userData.noCull = true; scene.add(halo);
      fixtures.push({ D: d, y: H - 0.3, color: z.look.lamp, base: z.look.lampI, bad: rnd() < z.env.bad, seed: rnd() * 100, k: 1, tube, halo, z: z.i, forced: -1 });
    }
  });
  cabins.forEach((c) => fixtures.push(c.light));
  fixtures.sort((a, b) => a.D - b.D);
  const emerg = [];
  [zones[4], zones[5]].forEach((z) => { for (let d = z.d0 + 5; d < z.d1 - 1; d += 9) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2020 })); t.position.set(z.id === 'end' ? 1.4 : -1.4, H - 0.4, zOf(d)); scene.add(t); emerg.push({ D: d, x: t.position.x, mesh: t }); } });
  const POOL = Q.lights;
  const lights = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xffffff, 0, 11, 2); scene.add(l); return l; });
  const shafts = Array.from({ length: Math.min(POOL, Q.shafts) }, () => { const s = makeShaft(1.75, H - 0.05); s.userData.noCull = true; scene.add(s); return s; });
  const setShafts = (on) => { shafts.forEach((s) => { s.userData.off = !on; if (!on) s.visible = false; }); };
  const lampPool = lights.map((l) => ({ pos: l.position, color: l.color, I: 0 }));
  const poolArr = new Array(POOL).fill(null);
  const redLights = [0, 1].map(() => { const l = new THREE.PointLight(0xff1a1a, 0, 14, 2); scene.add(l); return l; });

  /* ------------------------------------------------------------ consultas e passo */
  const zoneAt = (d) => zones.find((z) => d >= z.d0 && d < z.d1) || (d < 0 ? zones[0] : zones[zones.length - 1]);
  const cabinAt = (d) => cabins.find((c) => d >= c.d0 && d < c.d1) || null;
  const envMix = { fog: new THREE.Color(), amb: new THREE.Color(), fogD: 0, ambI: 0, tint: [1, 1, 1], sat: 1, glitch: 0, shake: 0, fov: 66, emerg: 0, fear: 0 };
  const cA = new THREE.Color(), cB = new THREE.Color();
  function envAt(d) {
    const cab = cabinAt(d); let a, b, k = 0, z = zoneAt(d);
    if (cab) { a = zones[cab.i]; b = zones[cab.i + 1]; k = smooth(((d - cab.d0) / CL - 0.35) / 0.3); } else { a = b = z; }
    const ea = a.env, eb = b.env;
    envMix.fog.copy(cA.set(ea.fog)).lerp(cB.set(eb.fog), k); envMix.amb.copy(cA.set(ea.amb)).lerp(cB.set(eb.amb), k);
    envMix.fogD = lerp(ea.fogD, eb.fogD, k); envMix.ambI = lerp(ea.ambI, eb.ambI, k); envMix.sat = lerp(ea.sat, eb.sat, k);
    envMix.tint = ea.tint.map((v, i) => lerp(v, eb.tint[i], k)); envMix.glitch = lerp(ea.glitch, eb.glitch, k);
    envMix.shake = lerp(ea.shake, eb.shake, k); envMix.fov = lerp(ea.fov, eb.fov, k); envMix.emerg = lerp(ea.emerg, eb.emerg, k);
    envMix.fear = lerp(a.fear, b.fear, k); envMix.zone = cab ? (k > 0.5 ? b : a) : z; envMix.cabin = cab; envMix.k = k;
    return envMix;
  }

  function step(camD, t, dt, o) {
    /* elevadores: portas e painel conforme a posição da câmera dentro da cabine */
    for (const c of cabins) {
      const tt = (camD - c.d0) / CL;
      const fOpen = tt < 0.1 ? 1 : 1 - smooth((tt - 0.12) / 0.14), bOpen = smooth((tt - 0.7) / 0.14);
      c.front.open = lerp(c.front.open, fOpen, 1 - Math.pow(0.001, dt)); c.back.open = lerp(c.back.open, bOpen, 1 - Math.pow(0.001, dt));
      c.front.L.position.x = -W / 4 - c.front.open * W / 2; c.front.R.position.x = W / 4 + c.front.open * W / 2;
      c.back.L.position.x = -W / 4 - c.back.open * W / 2; c.back.R.position.x = W / 4 + c.back.open * W / 2;
      const inside = tt > 0 && tt < 1;
      const show = tt < 0.3 ? labelOf(c.i) : tt < 0.7 ? (Math.floor(t * 6) % 2 ? '▼' : ' ') : labelOf(c.i + 1);
      const deep = zones[c.i + 1].fear > 0.55 && tt > 0.3 && tt < 0.75 && Math.random() < 0.18;
      const txt = deep ? String.fromCharCode(0x2588 + ((Math.random() * 8) | 0)) + '' + (Math.random() * 9 | 0) : show;
      if (inside && c.disp.last !== txt) { c.disp.last = txt; drawFloor(c, txt, tt > 0.3 && zones[c.i + 1].fear > 0.55); }
    }
    /* luzes: instabilidade por andar; o conjunto mais próximo da câmera recebe PointLights reais */
    let lo = 0, hi = fixtures.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (fixtures[m].D < camD) lo = m + 1; else hi = m; }
    const first = clamp(lo - 2, 0, Math.max(0, fixtures.length - POOL));
    let flickMin = 1;
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i]; if (i < first - 2 || i > first + POOL + 2) { f.tube.visible = true; continue; }
      let k = 1;
      if (f.forced >= 0) k = f.forced;
      else if (!o.reduce && !f.cabin) { const n = Math.sin(t * 31 + f.seed) * Math.sin(t * 13.7 + f.seed * 2); const fz = zones[f.z]; if (f.bad && n > 0.78 - fz.fear * 0.12) k = 0.12; else if (n > 0.93 - fz.fear * 0.1) k = 0.35; }
      f.k = k; f.tube.material.color.setHex(f.color).multiplyScalar(0.3 + 0.7 * k);
      if (Math.abs(f.D - camD) < 7) flickMin = Math.min(flickMin, 0.88 + 0.12 * k);
    }
    for (const f of fixtures) { if (f.halo) { const near = Math.abs(f.D - camD) < 22; f.halo.visible = near; if (near) f.halo.material.opacity = 0.38 * f.k; } }
    for (let i = 0; i < POOL; i++) {
      const f = fixtures[first + i], l = lights[i], sh = shafts[i];
      poolArr[i] = f || null;
      if (!f) { l.intensity = 0; if (sh) sh.visible = false; lampPool[i].I = 0; continue; }
      l.color.setHex(f.color); l.position.set(0, f.y, zOf(f.D)); l.intensity = f.base * f.k;
      const kk = f.k * Math.min(1.2, f.base / 3.4); lampPool[i].I = 0.75 * kk;
      if (sh) {
        sh.visible = !sh.userData.off && f.k > 0.02; sh.position.set(0, H - 0.05, zOf(f.D));
        sh.material.uniforms.uColor.value.setHex(f.color); sh.material.uniforms.uTime.value = t; sh.material.uniforms.uK.value = 0.2 * kk;
      }
    }
    /* luz de emergência vermelha pulsando (laboratório e abismo) */
    let e0 = null, e1 = null, d0 = 16, d1 = 16;
    for (const e of emerg) { const d = Math.abs(e.D - camD); if (d < d0) { e1 = e0; d1 = d0; e0 = e; d0 = d; } else if (d < d1) { e1 = e; d1 = d; } }
    [e0, e1].forEach((e, i) => { const l = redLights[i]; if (!e || o.emerg <= 0) { l.intensity = 0; return; } l.position.set(e.x, H - 0.4, zOf(e.D)); l.intensity = o.emerg * (0.6 + 0.4 * Math.sin(t * 3.2 + e.D)); });
    emerg.forEach((e) => e.mesh.material.color.setScalar(0.5 + 0.5 * Math.sin(t * 3.2 + e.D)).multiply(cA.set(0xff2020)));
    /* pontos de interesse: abrem/acendem quando a luz os alcança */
    pois.forEach((p, i) => { p.open = lerp(p.open, (o.active === i || p.force) ? 1 : 0, 1 - Math.pow(0.02, dt)); p.apply(); });
    /* objetos animados pelos sustos */
    if (events.drawers) events.drawers.forEach((dr) => { dr.open = lerp(dr.open, dr.goal, 1 - Math.pow(0.0001, dt)); dr.mesh.position.z = dr.mesh.userData.rest + dr.open * 0.55; });
    decorT.forEach((d) => d.update(t, camD));
    return { flick: flickMin, fixtures, lampPool, pool: poolArr };
  }


  /* ----------------------------------------------- props reais (modelos CC0 da Poly Haven) */
  function populate(models) {
    const put = (name, x, z, ry, targetH, { y = 0, lie = false } = {}) => {
      const m = models[name]; if (!m) return null;
      const o = m.obj.clone(true), s = targetH / m.h;
      o.scale.setScalar(s); o.rotation.set(lie ? Math.PI / 2 : 0, ry, 0, 'YXZ');
      o.position.set(x, lie ? m.size.x * s * 0.5 + 0.02 : y, z);
      o.updateMatrixWorld(true);
      const key = name + '|' + Math.floor(-z / 40); (batches[key] = batches[key] || { list: [] }).list.push(o);   /* instanciado: uma chamada de desenho por modelo/trecho */
      return o;
    };
    const batches = {};
    if (models.sign) {                                                      /* amarelo vivo estoura com a lanterna: escurece uma vez só */
      const obj = models.sign.obj.clone(true);
      obj.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.color.multiplyScalar(0.2); c.material.emissiveIntensity = 0; c.material.emissiveMap = null; c.material.roughness = 1; c.material.metalness = 0; } });
      models.sign = { ...models.sign, obj };
    }
    const keep = () => rnd() < Q.props;
    const wx = (side, half) => side * (W / 2 - half - 0.03);              /* encosta na parede */
    const along = (m, side) => (m && m.size.x > m.size.z ? Math.PI / 2 : 0) + (side > 0 ? Math.PI : 0);   /* eixo maior paralelo à parede */
    const z0 = zones[0], z1 = zones[1], z2 = zones[2], z3 = zones[3], z4 = zones[4], z5 = zones[5];

    put('fire', wx(1, 0.1), zOf(z0.d0 + 7), -Math.PI / 2, 0.5, { y: 1.05 });
    put('sofa', wx(-1, 0.45), zOf(z0.d0 + 9), Math.PI / 2, 0.85);                /* sofá da recepção, encosto na parede */
    put('plant', wx(-1, 0.3), zOf(z0.d0 + 4), 0.8, 1.0);                      /* vaso abandonado na recepção */
    /* cadeiras reais nos postos de tela (a cadeira que rola sozinha é a mesma, só com outro visual) */
    if (models.chair) for (const po of pois) if (po.kind === 'screen' && po.chair) {
      const m = models.chair, o = m.obj.clone(true), sc = 0.9 / m.h; po.chair.children.forEach((c) => { c.visible = false; });
      o.scale.setScalar(sc); o.rotation.y = Math.PI;
      o.traverse((c) => { if (c.isMesh) { c.castShadow = Q.shadow; } }); po.chair.add(o);
    }
    for (let k = 0; k < z1.n; k++) if (keep()) { const side = -sideOf(k); put('laptop', wx(side, 0.4), zOf(poiD(z1, k) + 2.5), rr(-0.5, 0.5) + (side > 0 ? Math.PI : 0), 0.22, { y: 0.76 }); }
    put('sign', wx(-1, 0.4) + 0.9, zOf(z0.d0 + 12), 0.5, 0.65);
    put('sign', 0.3, zOf(z1.d0 + 9), -0.4, 0.65);
    put('stool', wx(1, 0.3), zOf(z2.d0 + 6), rr(0, 6), 0.7);
    put('truck', wx(-1, 0.3), zOf(z3.d0 + 9), Math.PI / 2 * (-1), 1.1, { lie: false });
    for (let k = 0; k < z2.n; k++) if (keep()) put('box', wx(sideOf(k) * -1, 0.3), zOf(poiD(z2, k) + 5), rr(0, 6), 0.35);
    for (let i = 0; i < 4; i++) if (keep()) put('box', wx(i % 2 ? 1 : -1, 0.3), zOf(z4.d0 + 8 + i * 9), rr(0, 6), 0.35, { y: i % 2 ? 0.45 : 0 });
    put('stool', wx(-1, 0.3), zOf(z4.d0 + 14), 0.4, 0.7, { lie: true });
    put('cabinet', wx(-1, 0.3), zOf(z0.d0 + 17.5), Math.PI / 2, 1.1);
    for (let k = 0; k < z1.n; k++) { if (!keep()) continue; const side = -sideOf(k); put('desk', wx(side, 0.4), zOf(poiD(z1, k) + 2.5), along(models.desk, side), 0.76); }
    put('fire', wx(-1, 0.1), zOf(z1.d0 + 4), Math.PI / 2, 0.5, { y: 1.05 });
    for (let k = 0; k < z2.n; k++) {
      if (keep()) put('cabinet', wx(sideOf(k), 0.3), zOf(poiD(z2, k) + 2.5), sideOf(k) > 0 ? -Math.PI / 2 : Math.PI / 2, 1.1);
      if (keep()) put('crate', wx(-sideOf(k), 0.3), zOf(poiD(z2, k) + rr(1, 4)), rr(-0.4, 0.4), 0.45);
    }
    for (let k = 0; k < z3.n; k++) { if (keep()) put('crate', wx(sideOf(k), 0.3), zOf(poiD(z3, k) + 3.5), rr(-0.5, 0.5), 0.5); }
    put('fire', wx(1, 0.1), zOf(z3.d0 + 5), -Math.PI / 2, 0.5, { y: 1.05 });
    for (let i = 0; i < 11; i++) {                                           /* laboratório: barris e caixas pelos cantos */
      if (!keep()) continue; const side = i % 2 ? 1 : -1, d = z4.d0 + 4 + i * 4.3 + rr(-0.6, 0.6);
      if (i % 3 === 0) { const o = put('barrel', wx(side, 0.32), zOf(d), rr(0, 6), 0.95); put('barrel', wx(side, 0.32) - side * 0.25, zOf(d + 0.65), rr(0, 6), 0.95, { lie: i % 2 === 0 }); void o; }
      else if (i % 3 === 1) { put('crate', wx(side, 0.3), zOf(d), rr(-0.4, 0.4), 0.45); put('crate', wx(side, 0.3), zOf(d), rr(-0.4, 0.4), 0.45, { y: 0.45 }); }
      else put('barrel', wx(side, 0.32), zOf(d), rr(0, 6), 0.95);
    }
    for (let i = 0; i < 6; i++) {                                            /* abismo: pilhas tombadas, nada arrumado */
      if (!keep()) continue; const side = i % 2 ? 1 : -1, d = z5.d0 + 3 + i * 2.4;
      put(i % 2 ? 'barrel' : 'crate', wx(side, 0.32), zOf(d), rr(0, 6), i % 2 ? 0.95 : 0.45, { lie: i % 3 === 0 });
    }
    for (const b of Object.values(batches)) {                              /* transforma os clones em InstancedMesh */
      const parts = (o) => { const a = []; o.traverse((c) => { if (c.isMesh) a.push(c); }); return a; };
      const sets = b.list.map(parts);
      sets[0].forEach((mesh, i) => {
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, b.list.length);
        sets.forEach((ps, j) => im.setMatrixAt(j, ps[i].matrixWorld));
        im.castShadow = Q.shadow; im.receiveShadow = Q.shadow; scene.add(im);
      });
    }
  }

  /* culling por distância: só o trecho perto da câmera é desenhado (o prédio tem ~230 m; a névoa esconde o resto) */
  const statics = [], tmpBox = new THREE.Box3(), known = new Set();
  function indexStatics() {
    for (const o of scene.children) {
      if (known.has(o) || o.isLight || o.isCamera || o.userData.noCull) continue; known.add(o);
      tmpBox.setFromObject(o); if (!isFinite(tmpBox.min.z)) continue; statics.push({ o, z0: tmpBox.min.z, z1: tmpBox.max.z });
    }
  }
  let lastCull = 1e9;
  function cull(camZ, force) {
    if (!force && Math.abs(camZ - lastCull) < 2) return; lastCull = camZ;
    const far = camZ - 52, near = camZ + 10;                              /* a câmera olha para -z */
    for (const s of statics) s.o.visible = !(s.z1 < far || s.z0 > near);
  }
  indexStatics();
  const populateAndIndex = (models) => { populate(models); indexStatics(); cull(0, true); };

  return { zones, cabins, pois, fixtures, total, envAt, step, zoneAt, cabinAt, events, zOf, decorT, H, W, populate: populateAndIndex, addGrunge, shrinkTex, cull, setShafts };
}
