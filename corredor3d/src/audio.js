/* Sonografia procedural (Web Audio, sem arquivos): tudo é sintetizado e espacializado.
   Camadas: sala (reverb de corredor) · zumbido ambiente · lâmpadas (3D) · passos ·
   portas (rangido + som atrás de cada uma) · eventos aleatórios · o vulto (batimento/drone). */

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const LITE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;   /* celular: reverb curta e panner barato */

export function createAudio(cfg, externalCtx) {
  const STRIDE = 0.78;                     /* metros por passo */
  const POS_BOOST = 2.6;                   /* fontes 3D perdem nível com a distância: compensa */
  const MASTER = 0.9;
  let ctx = null, master, dryBus, verbSend, noiseBuf, brownBuf;
  let started = false, muted = false;
  const S = { camPos: { x: 0, y: 1.6, z: 0 }, p: 0, shade: { visible: false, dist: 99 }, doorOpen: [], doorDist: [], floor: 0, fear: 0, floorBeat: 0, lift: -1 };
  let cfgRef = { rooms: [], end: { x: 0, y: 1, z: -50 } };
  const fixtureState = [];                 /* { gain, k } por lâmpada */
  const rooms = [];                        /* som atrás de cada porta */
  let stepAcc = 0, stepSide = 1, lastShadeVisible = false;
  const timers = [];
  let baseDelay = 0;                       /* só testes: desloca os disparos no tempo */

  /* ------------------------------------------------------------ utilidades */
  function makeNoise(sec, kind) {
    const len = (ctx.sampleRate * sec) | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
    }
    return b;
  }
  /* resposta ao impulso de corredor longo: reflexões iniciais em flutter + cauda que escurece */
  function makeIR() {
    const sec = LITE ? 2.0 : 3.2, len = (ctx.sampleRate * sec) | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, cut = 0.55 * Math.pow(1 - t, 2.2) + 0.04;     /* cauda cada vez mais abafada */
        lp += (Math.random() * 2 - 1 - lp) * cut;
        d[i] = lp * Math.pow(1 - t, 3.1) * 0.9;
      }
      [0.011, 0.023, 0.034, 0.048, 0.067, 0.091, 0.12].forEach((dt, k) => {    /* flutter entre as paredes */
        const idx = ((dt + (c ? 0.003 : 0)) * ctx.sampleRate) | 0;
        if (idx < len) d[idx] += (c ? -1 : 1) * 0.6 / (k + 1);
      });
    }
    return b;
  }
  function setPos(p, pos) {
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
  }
  /* liga uma fonte ao mix: pan estéreo OU posição 3D (HRTF), mais envio de reverb */
  function route(src, o = {}) {
    const g = ctx.createGain(); g.gain.value = (o.gain ?? 1) * (o.pos ? POS_BOOST : 1); src.connect(g); let tail = g;
    if (o.pos) {
      const p = ctx.createPanner(); p.panningModel = (o.cheap || LITE) ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse';   /* HRTF é caro: só nos one-shots do desktop */
      p.refDistance = 1.4; p.rolloffFactor = 1.35; p.maxDistance = 60; setPos(p, o.pos); tail.connect(p); tail = p;
    } else if (o.pan && ctx.createStereoPanner) {
      const sp = ctx.createStereoPanner(); sp.pan.value = o.pan; tail.connect(sp); tail = sp;
    }
    tail.connect(o.bus || dryBus);
    const send = o.send ?? 0.3;
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; tail.connect(s); s.connect(verbSend); }
    return { g, tail };
  }
  function noiseHit(o) {
    const t = ctx.currentTime + baseDelay + (o.delay || 0), s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.freq; f.Q.value = o.q || 1;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(o.gain, t + (o.attack || 0.003));
    e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(e); route(e, o);
    s.start(t, Math.random() * 2, o.dur + 0.05);
  }
  function thump(o) {
    const t = ctx.currentTime + baseDelay + (o.delay || 0), os = ctx.createOscillator(), e = ctx.createGain();
    os.type = o.type || 'sine';
    os.frequency.setValueAtTime(o.f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(o.gain, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    os.connect(e); route(e, o); os.start(t); os.stop(t + o.dur + 0.05);
  }
  function tone(o) {                       /* sino/gota/caixinha de música: senoide com harmônicos e decaimento */
    const t = ctx.currentTime + baseDelay + (o.delay || 0), e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(o.gain, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    [[1, 1], [2.01, 0.35], [3.98, 0.12]].forEach(([m, a]) => {
      const os = ctx.createOscillator(), g = ctx.createGain(); os.frequency.value = o.freq * m; g.gain.value = a;
      os.connect(g); g.connect(e); os.start(t); os.stop(t + o.dur + 0.05);
    });
    route(e, o);
  }

  /* ------------------------------------------------------ amostras reais (portas etc.) */
  /* Mixkit Sound Effects Free License (uso comercial permitido, sem atribuição).
     Se falharem ao carregar, o motor cai na síntese e continua funcionando. */
  const SAMPLES = ['door_creak_open', 'door_scary_open', 'door_creak_both', 'door_creak_close', 'door_hard_shut', 'door_metal_close', 'door_slam', 'knock_thick', 'floor_creak', 'lock_gear', 'lift_open', 'lift_close'];
  const samples = {};
  async function loadSamples() {
    const base = (import.meta.env && import.meta.env.BASE_URL) || './';
    await Promise.all(SAMPLES.map(async (n) => {
      try {
        const r = await fetch(`${base}sfx/${n}.mp3`); if (!r.ok) throw new Error(r.status);
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
        samples[n] = { buf, norm: pk > 0 ? 0.7 / pk : 1 };      /* normaliza todas para o mesmo pico */
      } catch (e) { /* sem amostra: usa síntese */ }
    }));
  }
  /* ---- passos reais: cada gravação longa é fatiada em passos soltos e sorteada a cada apoio do pé ---- */
  const STEP_FILES = ['steps_tunnel', 'steps_stones_a', 'steps_stones_b', 'steps_puddle', 'steps_mud'];
  const stepBank = {};
  function sliceSteps(buf) {
    const sr = buf.sampleRate, n = buf.length, hop = Math.round(sr * 0.004), ch = buf.numberOfChannels, data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    const env = [];
    for (let i = 0; i + hop * 2 < n; i += hop) { let s = 0; for (let k = 0; k < hop * 2; k++) { let v = 0; for (let c = 0; c < ch; c++) v += data[c][i + k]; v /= ch; s += v * v; } env.push(Math.sqrt(s / (hop * 2))); }
    const sorted = env.slice().sort((x, y) => x - y), ref = sorted[Math.floor(sorted.length * 0.98)] || 0.1, thr = ref * 0.35;
    const onsets = []; let last = -1e9;
    for (let i = 2; i < env.length; i++) if (env[i] > thr && env[i] > env[i - 1] * 1.35 && env[i - 1] <= env[i - 2] * 2.2 + 1e-6 && (i - last) * hop > sr * 0.32) { onsets.push(i * hop); last = i; }
    const out = [];
    for (let k = 0; k < onsets.length && out.length < 28; k++) {
      const start = Math.max(0, onsets[k] - Math.round(sr * 0.012)), end = Math.min(n, start + Math.round(sr * 0.42), (onsets[k + 1] ?? n) - Math.round(sr * 0.01));
      const len = end - start; if (len < sr * 0.12) continue;
      const seg = ctx.createBuffer(1, len, sr), d = seg.getChannelData(0); let pk = 0;
      for (let i = 0; i < len; i++) { let v = 0; for (let c = 0; c < ch; c++) v += data[c][start + i]; v /= ch; d[i] = v; pk = Math.max(pk, Math.abs(v)); }
      const g = pk > 0 ? 0.8 / pk : 1, fi = Math.round(sr * 0.004), fo = Math.round(sr * 0.08);
      for (let i = 0; i < len; i++) { d[i] *= g; if (i < fi) d[i] *= i / fi; if (i > len - fo) d[i] *= (len - i) / fo; }
      out.push(seg);
    }
    return out;
  }
  const stepLoading = {};
  function loadStepFile(n) {                                        /* cada gravação só é baixada/decodificada quando o andar precisa dela */
    if (stepLoading[n]) return stepLoading[n];
    const base = (import.meta.env && import.meta.env.BASE_URL) || './';
    return (stepLoading[n] = (async () => {
      try { const r = await fetch(`${base}sfx/${n}.mp3`); if (!r.ok) throw new Error(r.status); const sl = sliceSteps(await ctx.decodeAudioData(await r.arrayBuffer())); if (sl.length >= 3) stepBank[n] = sl; } catch (e) { /* cai na síntese */ }
    })());
  }
  const loadStepBank = () => Promise.all(STEP_FILES.map(loadStepFile));
  function ensureSteps(floor) {
    if (!ctx || !started) return;
    for (const f of [floor, floor + 1]) { const list = SURFACES[clamp(f, 0, SURFACES.length - 1)]; for (const [n] of list) loadStepFile(n); }
  }
  /* superfície por andar (a cabine do elevador é metal) */
  const SURFACES = [
    [['steps_tunnel', 1]],                                           /* 0 recepção: piso frio, eco de corredor */
    [['steps_stones_a', 1]],                                         /* 1 escritórios: concreto seco */
    [['steps_tunnel', 0.65], ['steps_puddle', 0.35]],                /* 2 arquivo: ladrilho molhado */
    [['steps_stones_b', 1]],                                         /* 3 servidores: grade metálica */
    [['steps_tunnel', 0.55], ['steps_puddle', 0.45]],                /* 4 laboratório: poças */
    [['steps_mud', 0.7], ['steps_tunnel', 0.3]],                     /* 5 abismo: algo viscoso no chão */
  ];
  function pickSurface() {
    const list = SURFACES[clamp(S.floor, 0, SURFACES.length - 1)].filter(([n]) => stepBank[n]);
    if (!list.length) return null;
    let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
    for (const [n, w] of list) { if ((r -= w) <= 0) return n; }
    return list[0][0];
  }
  function footstepReal(vol, side) {
    const name = pickSurface(); if (!name) { footstep(vol, side); return; }
    const bank = stepBank[name], buf = bank[(Math.random() * bank.length) | 0];
    const t = ctx.currentTime + baseDelay, src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = rnd(0.9, 1.0) * (S.floor >= 5 ? 0.92 : 1);          /* mais pesado e arrastado quanto mais fundo */
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rnd(3800, 6500) * (S.lift >= 0 ? 0.8 : 1);
    const e = ctx.createGain(); e.gain.value = 1; src.connect(lp); lp.connect(e);
    route(e, { pan: side * 0.14, gain: 0.27 * vol, send: S.lift >= 0 ? 0.12 : 0.34 });
    src.start(t);
    thump({ pan: side * 0.1, f0: rnd(78, 96), f1: 44, dur: 0.17, gain: 0.3 * vol, send: 0.2 });          /* corpo grave do impacto */
    if (S.floor === 3 || S.lift >= 0) tone({ pan: -side * 0.1, freq: rnd(520, 700), dur: 0.22, gain: 0.05 * vol, send: 0.3 });   /* grade/metal soa oco */
  }

  function sample(name, o = {}) {
    const s = samples[name]; if (!s) return false;
    const t = ctx.currentTime + baseDelay + (o.delay || 0), src = ctx.createBufferSource(), rate = o.rate ?? rnd(0.96, 1.04);
    src.buffer = s.buf; src.playbackRate.value = rate;
    let node = src;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    if (o.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
    const peak = s.norm * (o.gain ?? 1), len = (o.dur ?? s.buf.duration / rate), e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(peak, t + 0.01);
    if (o.dur) { e.gain.setValueAtTime(peak, t + Math.max(0.02, len - 0.15)); e.gain.linearRampToValueAtTime(0.0001, t + len); }
    node.connect(e); route(e, o);
    src.start(t, o.offset || 0, o.dur ? o.dur * rate : undefined);
    return true;
  }

  /* --------------------------------------------------------------- passos */
  /* camadas: corpo grave do calcanhar · estalo do salto no piso frio · arrasto da sola · ponta do pé · respingo (piso molhado) */
  function footstep(vol, side) {
    const pan = side * 0.18, o = { pan, send: 0.32 };
    thump({ ...o, f0: rnd(92, 118), f1: 46, dur: 0.15, gain: 0.5 * vol });
    noiseHit({ ...o, type: 'lowpass', freq: rnd(220, 300), dur: 0.13, gain: 0.34 * vol });
    noiseHit({ ...o, freq: rnd(2800, 3700), q: 1.4, dur: 0.02, gain: 0.15 * vol, send: 0.4 });
    noiseHit({ ...o, freq: rnd(900, 1400), q: 0.9, dur: 0.1, gain: 0.11 * vol, attack: 0.012, delay: 0.05 });
    noiseHit({ ...o, freq: rnd(560, 820), q: 0.8, dur: 0.05, gain: 0.08 * vol, delay: 0.115 });
    if (Math.random() < 0.22) {            /* poça: respingo e gotas */
      noiseHit({ ...o, type: 'highpass', freq: rnd(1600, 2400), dur: rnd(0.12, 0.2), gain: 0.07 * vol, delay: 0.02, send: 0.5 });
      if (Math.random() < 0.5) tone({ pan: -pan, freq: rnd(1500, 2600), dur: 0.12, gain: 0.025, delay: rnd(0.08, 0.2), send: 0.5 });
    }
    if (Math.random() < 0.07) thump({ ...o, type: 'triangle', f0: 1500, f1: 900, dur: 0.07, gain: 0.03 * vol, delay: 0.1 });   /* rangido da sola */
  }
  function distantSteps(n, pos) {          /* passos longe, abafados, atrás de você */
    for (let i = 0; i < n; i++) {
      const d = i * 0.62 + rnd(-0.04, 0.04), q = { pos: { ...pos, z: pos.z - i * 0.5 }, send: 0.85, delay: d };
      thump({ ...q, f0: 100, f1: 50, dur: 0.14, gain: 0.5 });
      noiseHit({ ...q, type: 'lowpass', freq: 380, dur: 0.1, gain: 0.35 });
      noiseHit({ ...q, freq: 2400, q: 1.2, dur: 0.02, gain: 0.15 });
    }
  }

  /* ---------------------------------------------------------------- portas */
  function creak(pos, opening) {
    if (samples.door_creak_open) {
      if (opening) {
        sample(pick(['door_creak_open', 'door_scary_open', 'door_creak_both']), { pos, send: 0.55, gain: 0.42, lp: 7000, dur: 2.8 });
        sample('lock_gear', { pos, send: 0.4, gain: 0.26 });                                   /* trinco de metal */
      } else {
        sample(pick(['door_creak_close', 'door_hard_shut', 'door_metal_close']), { pos, send: 0.6, gain: 0.45 });
      }
      return;
    }
    creakSynth(pos, opening);
  }
  function creakSynth(pos, opening) {
    const t = ctx.currentTime + baseDelay, dur = opening ? rnd(1.0, 1.5) : 0.6;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(1.5, t + 0.12);
    e.gain.setValueAtTime(1.5, t + dur * 0.7); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const os = ctx.createOscillator(); os.type = 'sawtooth';
    const f0 = opening ? 95 : 170, f1 = opening ? 175 : 85;
    os.frequency.setValueAtTime(f0, t); os.frequency.linearRampToValueAtTime(f1, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rnd(7, 13); lg.gain.value = 14; lfo.connect(lg); lg.connect(os.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(opening ? 320 : 900, t); bp.frequency.linearRampToValueAtTime(opening ? 950 : 360, t + dur);
    os.connect(bp); bp.connect(e); route(e, { pos, send: 0.55 });
    os.start(t); lfo.start(t); os.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    noiseHit({ pos, type: 'highpass', freq: 2600, dur: dur * 0.8, gain: 0.025, attack: 0.1, send: 0.4 });   /* atrito */
    if (opening) { noiseHit({ pos, freq: 2300, q: 3, dur: 0.025, gain: 0.2, send: 0.4 }); thump({ pos, f0: 210, f1: 120, dur: 0.06, gain: 0.12 }); }   /* trinco */
    else { thump({ pos, f0: 80, f1: 38, dur: 0.22, gain: 0.5, delay: dur * 0.85, send: 0.6 }); noiseHit({ pos, freq: 1800, q: 2, dur: 0.03, gain: 0.15, delay: dur * 0.86 }); }
  }

  /* som de dentro de cada sala (abafado pela porta; vaza quando ela abre) */
  function buildRoom(kind, pos) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(lp);
    const out = route(lp, { pos, send: 0.35, gain: 1, cheap: true });
    const room = { kind, lp, bus, pos, t: 0, stoppers: [], out };
    const loop = (buf, f, q, g, type = 'bandpass') => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      const v = ctx.createGain(); v.gain.value = g; s.connect(b); b.connect(v); v.connect(bus); s.start(0, Math.random() * 2); room.stoppers.push(s); return v;
    };
    if (kind === 'servers') {
      [110, 220, 330].forEach((f, k) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * (1 + k * 0.002); g.gain.value = 0.05 / (k + 1); o.connect(g); g.connect(bus); o.start(); room.stoppers.push(o); });
      loop(noiseBuf, 700, 0.6, 0.35);
    } else if (kind === 'radio') {
      const v = loop(noiseBuf, 1900, 0.5, 0.5);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rnd(3, 8); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(v.gain); lfo.start(); room.stoppers.push(lfo);
    }
    return room;
  }
  function destroyRoom(r) {                                            /* sala longe: libera os nós (cada panner/oscilador custa CPU) */
    for (const s of r.stoppers) { try { s.stop(); } catch (e) { /* ok */ } }
    try { r.bus.disconnect(); r.lp.disconnect(); r.out.g.disconnect(); r.out.tail.disconnect(); } catch (e) { /* ok */ }
  }
  /* eventos que acontecem dentro da sala, só quando você está perto */
  function roomTick(r, near) {
    const dest = r.bus;
    if (r.kind === 'musicbox' && near) {
      const notes = [220, 261.6, 293.7, 329.6, 392, 440];
      const t = ctx.currentTime;
      const e = ctx.createGain(); e.gain.value = 1; e.connect(dest);
      const f = pick(notes) * (Math.random() < 0.3 ? 2 : 1);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.5, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      const os = ctx.createOscillator(); os.frequency.value = f; os.connect(og); og.connect(e); os.start(t); os.stop(t + 1.5);
      const o2 = ctx.createOscillator(); o2.frequency.value = f * 2.76; const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.12, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o2.connect(g2); g2.connect(e); o2.start(t); o2.stop(t + 0.5);
    } else if (r.kind === 'clock' && near) {
      const t = ctx.currentTime, tick = ctx.createBufferSource(); tick.buffer = noiseBuf;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 2400; b.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      tick.connect(b); b.connect(g); g.connect(dest); tick.start(t, Math.random() * 2, 0.05);
    } else if (r.kind === 'breath' && near) {
      const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = brownBuf;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 520; b.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 1.1); g.gain.linearRampToValueAtTime(0.0001, t + 2.4);
      s.connect(b); b.connect(g); g.connect(dest); s.start(t, Math.random() * 2, 2.6);
    }
  }

  /* ------------------------------------------------ sons de susto e de elevador */
  function zap() {                                                   /* descarga elétrica / curto */
    noiseHit({ type: 'highpass', freq: 2500, dur: 0.28, gain: 0.5, send: 0.3 });
    thump({ type: 'sawtooth', f0: 1800, f1: 80, dur: 0.25, gain: 0.25, send: 0.3 });
    thump({ f0: 55, f1: 30, dur: 0.5, gain: 0.5, delay: 0.05, send: 0.5 });
    for (let i = 0; i < 6; i++) noiseHit({ freq: rnd(3000, 6000), q: 2, dur: 0.015, gain: 0.3, delay: 0.05 + i * rnd(0.03, 0.07), send: 0.2 });
  }
  function riser() {                                                 /* swell grave que sobe */
    const t0 = ctx.currentTime + baseDelay, os = ctx.createOscillator(), e = ctx.createGain();
    os.type = 'sawtooth'; os.frequency.setValueAtTime(38, t0); os.frequency.exponentialRampToValueAtTime(110, t0 + 3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(90, t0); lp.frequency.exponentialRampToValueAtTime(900, t0 + 3);
    e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(0.16, t0 + 2.6); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
    os.connect(lp); lp.connect(e); route(e, { send: 0.5 }); os.start(t0); os.stop(t0 + 3.5);
  }
  function phone() {                                                 /* telefone tocando numa sala vazia (corta no meio) */
    const c = S.camPos, pos = { x: rnd(-1.2, 1.2), y: 1.1, z: c.z - rnd(5, 9) }, t0 = ctx.currentTime + baseDelay;
    for (let r = 0; r < 3; r++) for (let b = 0; b < 2; b++) {
      const t = t0 + r * 1.15 + b * 0.24, e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.16, t + 0.01); e.gain.setValueAtTime(0.16, t + 0.15); e.gain.linearRampToValueAtTime(0.0001, t + 0.18);
      [440, 480].forEach((f) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(e); o.start(t); o.stop(t + 0.2); });
      route(e, { pos, send: 0.5 });
    }
  }
  function chairRoll() {                                             /* cadeira de rodinhas rolando sozinha */
    const c = S.camPos, t = ctx.currentTime + baseDelay, s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 2.2;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.35, t + 0.4); e.gain.setValueAtTime(0.35, t + 2.1); e.gain.linearRampToValueAtTime(0.0001, t + 2.6);
    s.connect(bp); bp.connect(e);
    const r = route(e, { pos: { x: -1.2, y: 0.3, z: c.z - 5 }, send: 0.5 }), p = r.tail;
    if (p.positionX) { p.positionX.setValueAtTime(-1.2, t); p.positionX.linearRampToValueAtTime(1.0, t + 2.6); p.positionZ.setValueAtTime(c.z - 5, t); p.positionZ.linearRampToValueAtTime(c.z - 3.2, t + 2.6); }
    s.start(t, Math.random() * 2, 2.7);
    thump({ pos: { x: 1.2, y: 0.3, z: c.z - 3.2 }, f0: 120, f1: 55, dur: 0.2, gain: 0.5, delay: 2.6, send: 0.6 });
  }
  function drawerSlam() {
    const pos = { x: rnd(-1.1, 1.1), y: 1.2, z: S.camPos.z - rnd(3, 8) };
    noiseHit({ pos, type: 'highpass', freq: 1800, dur: 0.45, gain: 0.4, send: 0.5 });
    thump({ pos, f0: 140, f1: 60, dur: 0.2, gain: 0.55, delay: 0.3, send: 0.6 });
    sample('door_metal_close', { pos, lp: 1500, gain: 0.3, delay: 0.3, send: 0.6 });
  }
  function elevator(name, fear = 0) {
    if (!started || muted) return;
    if (name === 'close') { if (!sample('lift_close', { gain: 0.5, send: 0.4 })) noiseHit({ type: 'lowpass', freq: 1200, dur: 0.8, gain: 0.4, send: 0.4 }); }
    else if (name === 'open') { if (!sample('lift_open', { gain: 0.5, send: 0.5, delay: 0.15 })) noiseHit({ type: 'lowpass', freq: 1500, dur: 0.7, gain: 0.35, delay: 0.15, send: 0.5 }); }
    else if (name === 'hum') {
      sample('floor_creak', { lp: 700, rate: 0.55, gain: 0.5, send: 0.6 });         /* cabo rangendo */
      thump({ f0: 70, f1: 38, dur: 0.9, gain: 0.35, send: 0.6 });
    } else if (name === 'ding') {                                                  /* gongo de elevador moderno; fica errado nos andares fundos */
      const k = 1 - fear * 0.22;
      tone({ freq: 1175 * k, dur: 1.5, gain: 0.2, send: 0.6 }); tone({ freq: 1568 * k, dur: 1.6, gain: 0.16, delay: 0.18, send: 0.6 });
      if (fear > 0.5) { tone({ freq: 1250 * k, dur: 1.4, gain: 0.13, delay: 0.06, send: 0.7 }); thump({ f0: 48, f1: 30, dur: 1.2, gain: 0.4, send: 0.6 }); }
    }
  }
  function event(name) {
    if (!started || muted) return;
    if (name === 'phone') phone(); else if (name === 'chair') chairRoll(); else if (name === 'drawer') drawerSlam();
    else if (name === 'zap') zap(); else if (name === 'stinger') { riser(); thump({ f0: 46, f1: 24, dur: 0.9, gain: 0.6, delay: 2.7, send: 0.7 }); }
  }

  /* ----------------------------------------------- eventos aleatórios do prédio */
  function ambientEvent(force) {
    const c = S.camPos, p = S.p, ahead = (d, x = 0) => ({ x, y: rnd(0.4, 2.6), z: c.z - d });
    const f = S.floor;
    const kinds = [['drip', f <= 2 ? 34 : 8], ['knock', f >= 1 ? 12 + f * 2 : 0], ['steps', f >= 1 ? 8 + f * 3 : 0], ['groan', f >= 2 ? 10 + f * 3 : 0],
      ['whisper', f >= 4 ? 18 + (f - 4) * 12 : 0], ['slam', f >= 3 ? 6 + f * 2 : 0], ['rat', f >= 2 ? 8 : 0], ['zap', f >= 3 ? 12 : 0]];
    let r = Math.random() * kinds.reduce((a, k) => a + k[1], 0), kind = kinds[0][0];
    for (const [k, w] of kinds) { if ((r -= w) <= 0) { kind = k; break; } }
    if (force) kind = force;
    if (kind === 'zap') zap();
    else if (kind === 'drip') {
      const pos = ahead(rnd(-8, 16), rnd(-1.2, 1.2));
      tone({ pos, freq: rnd(1700, 3000), dur: 0.22, gain: 0.6, send: 0.7 });
      if (Math.random() < 0.5) tone({ pos, freq: rnd(1700, 3000), dur: 0.2, gain: 0.5, delay: rnd(0.9, 1.6), send: 0.7 });
    } else if (kind === 'knock' && samples.knock_thick && Math.random() < 0.5) {      /* alguém bate numa porta, longe */
      sample('knock_thick', { pos: ahead(rnd(8, 18), rnd(-1.3, 1.3)), lp: 2200, gain: 0.4, send: 0.8 });
    } else if (kind === 'knock') {                                  /* batidas no cano de metal */
      const pos = { x: rnd(-1.2, 1.2), y: 2.9, z: c.z - rnd(4, 18) }, n = (Math.random() * 3 | 0) + 2;
      for (let i = 0; i < n; i++) { const d = i * rnd(0.32, 0.55); thump({ pos, f0: rnd(150, 190), f1: 80, dur: 0.18, gain: 0.8, delay: d, send: 0.7 }); noiseHit({ pos, freq: 1300, q: 4, dur: 0.12, gain: 0.35, delay: d, send: 0.7 }); }
    } else if (kind === 'steps') {                                  /* alguém andando atrás de você */
      distantSteps((Math.random() * 4 | 0) + 4, { x: rnd(-0.6, 0.6), y: 0.1, z: c.z + rnd(7, 12) });
    } else if (kind === 'groan' && samples.floor_creak && Math.random() < 0.5) {      /* tábua/estrutura rangendo no andar de cima */
      sample('floor_creak', { pos: { x: rnd(-1.4, 1.4), y: 3.2, z: c.z - rnd(2, 10) }, lp: 1400, rate: rnd(0.8, 0.95), gain: 0.9, send: 0.7 });
    } else if (kind === 'groan') {                                  /* a estrutura geme */
      const t = ctx.currentTime + baseDelay, pos = { x: rnd(-1.4, 1.4), y: 2.8, z: c.z - rnd(3, 14) };
      const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(rnd(52, 62), t); os.frequency.linearRampToValueAtTime(rnd(38, 48), t + 3.6);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(180, 260); bp.Q.value = 6;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.7, t + 1.2); e.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
      os.connect(bp); bp.connect(e); route(e, { pos, send: 0.7 }); os.start(t); os.stop(t + 4);
    } else if (kind === 'whisper') {                                /* sussurro: ruído com formantes e sílabas */
      const t = ctx.currentTime + baseDelay, pos = { x: rnd(-1.4, 1.4), y: 1.5, z: c.z + rnd(1.5, 4) };
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; const sum = ctx.createGain(); sum.gain.value = 0.9;
      [[520, 5], [1500, 6], [2600, 8]].forEach(([f, q]) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; s.connect(b); b.connect(sum); });
      const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < 6; k++) { const tt = t + k * rnd(0.18, 0.3); env.gain.linearRampToValueAtTime(rnd(0.45, 0.9), tt + 0.06); env.gain.linearRampToValueAtTime(0.01, tt + 0.16); }
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
      sum.connect(env); route(env, { pos, send: 0.6 }); s.start(t, Math.random() * 2, 2.3);
    } else if (kind === 'slam' && samples.door_slam) {              /* porta batendo ao longe (abafada pela distância) */
      sample(pick(['door_slam', 'door_metal_close']), { pos: ahead(rnd(14, 22), rnd(-1.4, 1.4)), lp: 1100, rate: rnd(0.85, 0.95), gain: 1, send: 0.95 });
    } else if (kind === 'slam') {
      const pos = ahead(rnd(14, 22), rnd(-1.4, 1.4));
      thump({ pos, f0: 90, f1: 34, dur: 0.4, gain: 1.1, send: 0.9 }); noiseHit({ pos, freq: 900, q: 0.8, dur: 0.25, gain: 0.6, send: 0.9 });
    } else {                                                        /* algo correndo no forro */
      const pos = { x: rnd(-1, 1), y: 3.1, z: c.z - rnd(2, 9) }, n = 10 + (Math.random() * 10 | 0);
      for (let i = 0; i < n; i++) noiseHit({ pos: { ...pos, z: pos.z - i * 0.35 }, freq: rnd(2600, 4200), q: 2, dur: 0.02, gain: rnd(0.5, 0.9), delay: i * rnd(0.04, 0.08), send: 0.5 });
    }
    return kind;
  }
  function scheduleEvents() {
    const wait = rnd(4500, 13000) * (1 - S.p * 0.45) * (1 - S.fear * 0.4);
    timers.push(setTimeout(() => { if (started && !muted) ambientEvent(); scheduleEvents(); }, wait));
  }

  /* -------------------------------------------------------- vulto: batimento */
  let beatTimer = 0;
  function beat() {
    const pr = Math.max(S.shade.visible ? clamp(1 - S.shade.dist / 12, 0, 1) : 0, S.floorBeat);
    if (started && !muted && pr > 0.03) {
      const g = 0.18 + 0.55 * pr;
      thump({ f0: 62, f1: 40, dur: 0.16, gain: g, send: 0.08 });
      thump({ f0: 54, f1: 36, dur: 0.18, gain: g * 0.75, delay: 0.17, send: 0.08 });
    }
    beatTimer = setTimeout(beat, 1050 - pr * 520);
  }

  /* ------------------------------------------------------------------ API */
  function start(positions) {
    if (started) return;
    cfgRef = positions;
    if (!ctx) ctx = externalCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 5; comp.attack.value = 0.01; comp.release.value = 0.3;
    dryBus = ctx.createGain(); verbSend = ctx.createGain();
    const conv = ctx.createConvolver(); noiseBuf = makeNoise(3, 'white'); brownBuf = makeNoise(4, 'brown'); conv.buffer = makeIR();
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.7; S.verbOut = verbOut;
    dryBus.connect(master); verbSend.connect(conv); conv.connect(verbOut); verbOut.connect(master);
    /* limitador rápido + saturação suave: nada passa de 0 dBFS, mesmo com fonte 3D colada na orelha */
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.25) / Math.tanh(1.25); }
    shaper.curve = curve; shaper.oversample = '2x';
    master.connect(comp); comp.connect(lim); lim.connect(shaper); shaper.connect(ctx.destination);

    /* sala: tom de fundo marrom + zumbido de 60 Hz (rede elétrica) + sopro de ventilação + sub-grave */
    const bed = ctx.createBufferSource(); bed.buffer = brownBuf; bed.loop = true;
    const bedLp = ctx.createBiquadFilter(); bedLp.type = 'lowpass'; bedLp.frequency.value = 130;
    bed.connect(bedLp); route(bedLp, { gain: 0.06, send: 0.1 }); bed.start();
    [[60, 0.006], [120, 0.004], [180, 0.0025]].forEach(([f, v]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = v; o.connect(g); route(g, { send: 0.1 }); o.start(); });
    const vent = ctx.createBufferSource(); vent.buffer = noiseBuf; vent.loop = true;
    const vbp = ctx.createBiquadFilter(); vbp.type = 'bandpass'; vbp.frequency.value = 850; vbp.Q.value = 0.6;
    const vg = ctx.createGain(); vg.gain.value = 0.005;
    const vl = ctx.createOscillator(), vlg = ctx.createGain(); vl.frequency.value = 0.07; vlg.gain.value = 0.003; vl.connect(vlg); vlg.connect(vg.gain); vl.start();
    vent.connect(vbp); vbp.connect(vg); route(vg, { send: 0.3 }); vent.start();
    const sub = ctx.createOscillator(), subG = ctx.createGain(); sub.frequency.value = 36; subG.gain.value = 0.012; sub.connect(subG); route(subG, { send: 0 }); sub.start();
    S.subG = subG;

    /* lâmpadas: 3 zumbidos 3D que migram para as lâmpadas mais próximas (gaguejam com o flicker) */
    for (let i = 0; i < 3; i++) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = 120; o2.type = 'square'; o2.frequency.value = 240.7;
      bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 5; g.gain.value = 0.0012;
      o1.connect(bp); o2.connect(bp); bp.connect(g); const r = route(g, { pos: { x: 0, y: 2.9, z: -5 }, send: 0.25, cheap: true }); o1.start(); o2.start();
      fixtureState.push({ gain: g, panner: r.tail, k: 1 });
    }
    /* sala de dentro de cada porta/rack */
    positions.rooms.forEach(() => rooms.push(null));                    /* as salas são criadas só quando você chega perto */
    timers.push(setInterval(() => { rooms.forEach((r, i) => { if (r) roomTick(r, (S.doorDist[i] ?? 99) < 5.5); }); }, 700 + (Math.random() * 100 | 0)));

    /* camadas por andar: ventiladores (servidores), chiado agudo, e o zumbido grave do elevador descendo */
    const fan = ctx.createBufferSource(); fan.buffer = noiseBuf; fan.loop = true;
    const fbp = ctx.createBiquadFilter(); fbp.type = 'bandpass'; fbp.frequency.value = 1500; fbp.Q.value = 0.5;
    const fanG = ctx.createGain(); fanG.gain.value = 0; fan.connect(fbp); fbp.connect(fanG); route(fanG, { send: 0.15 }); fan.start(); S.fanG = fanG;
    const whine = ctx.createOscillator(), whG = ctx.createGain(); whine.frequency.value = 7400; whG.gain.value = 0; whine.connect(whG); route(whG, { send: 0 }); whine.start(); S.whineG = whG;
    const lo = ctx.createOscillator(), lln = ctx.createBufferSource(), llp = ctx.createBiquadFilter(), lbp = ctx.createBiquadFilter(), liftG = ctx.createGain();
    lo.type = 'sawtooth'; lo.frequency.value = 52; llp.type = 'lowpass'; llp.frequency.value = 140; lln.buffer = brownBuf; lln.loop = true; lbp.type = 'bandpass'; lbp.frequency.value = 260; lbp.Q.value = 0.7;
    liftG.gain.value = 0; lo.connect(llp); llp.connect(liftG); lln.connect(lbp); lbp.connect(liftG); route(liftG, { send: 0.2 }); lo.start(); lln.start(); S.liftG = liftG;

    /* alarme de emergência no fim: pulsa e cresce quando você chega perto */
    const al = ctx.createOscillator(), al2 = ctx.createOscillator(), trem = ctx.createGain(), alg = ctx.createGain();
    const alLfo = ctx.createOscillator(), alLg = ctx.createGain();
    al.frequency.value = 98; al2.frequency.value = 147.5; trem.gain.value = 0.5; alg.gain.value = 0;   /* alg = nível (por distância); trem = pulso */
    alLfo.frequency.value = 0.62; alLg.gain.value = 0.5; alLfo.connect(alLg); alLg.connect(trem.gain);
    al.connect(trem); al2.connect(trem); trem.connect(alg); route(alg, { pos: positions.end, send: 0.5 });
    al.start(); al2.start(); alLfo.start(); S.alarm = alg;

    loadSamples();
    started = true;
    ensureSteps(S.floor);
    S.endPos = positions.end;
    master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.6);
    scheduleEvents(); beat();
    if (ctx.state === 'suspended' && ctx.resume && !(window.OfflineAudioContext && ctx instanceof OfflineAudioContext)) ctx.resume();
    /* entrada: um trinco e o corredor ganha vida */
    thump({ f0: 70, f1: 38, dur: 0.5, gain: 0.5, send: 0.8 });
  }

  function update(s) {
    if (!started) return;
    S.camPos = s.camPos; S.p = s.p; S.shade = s.shade;
    const t = ctx.currentTime, L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = s.camPos.x; L.positionY.value = s.camPos.y; L.positionZ.value = s.camPos.z;
      L.forwardX.value = s.fwd.x; L.forwardY.value = s.fwd.y; L.forwardZ.value = s.fwd.z;
      L.upX.value = s.up.x; L.upY.value = s.up.y; L.upZ.value = s.up.z;
    } else { L.setPosition(s.camPos.x, s.camPos.y, s.camPos.z); L.setOrientation(s.fwd.x, s.fwd.y, s.fwd.z, s.up.x, s.up.y, s.up.z); }

    /* passos: um por apoio do pé da câmera (a mesma passada que balança a cabeça) */
    if (s.steps !== undefined) {
      for (let i = 0; i < Math.min(2, s.steps); i++) { stepSide *= -1; if (!muted) footstepReal(s.stepVol ?? 1, stepSide); }
    } else {
      stepAcc += s.stepDist;
      while (stepAcc >= STRIDE) { stepAcc -= STRIDE; stepSide *= -1; if (!muted) footstep(clamp(0.5 + s.speed * 0.3, 0.5, 1), stepSide); }
    }

    /* lâmpadas: o zumbido segue as 3 mais próximas, cai e crepita junto com a luz */
    const nFix = s.nFix ?? s.fixtures.length;
    for (let i = 0; i < fixtureState.length; i++) {
      const f = fixtureState[i];
      if (i >= nFix) { f.gain.gain.setTargetAtTime(0, t, 0.05); continue; }
      const fx = s.fixtures[i], k = fx.k;
      setPos(f.panner, fx.pos);
      f.gain.gain.setTargetAtTime(0.0012 * (0.1 + 0.9 * k), t, 0.015);
      if (f.k > 0.6 && k < 0.5 && !muted) { noiseHit({ pos: fx.pos, freq: rnd(3200, 5200), q: 2, dur: 0.03, gain: 0.12, send: 0.3 }); thump({ pos: fx.pos, f0: 300, f1: 120, dur: 0.05, gain: 0.05 }); }
      f.k = k;
    }

    /* salas atrás das portas: criadas ao chegar perto (< 8 m), destruídas ao se afastar (> 11 m); mais alto perto e vaza quando a porta abre */
    for (let i = 0; i < cfgRef.rooms.length; i++) {
      const d = s.doorDist[i] ?? 99; S.doorDist[i] = d;
      const cfg = cfgRef.rooms[i]; if (cfg.kind === 'none') continue;
      let r = rooms[i];
      if (!r) { if (d < 8) r = rooms[i] = buildRoom(cfg.kind, cfg.pos); else continue; }
      else if (d > 11) { destroyRoom(r); rooms[i] = null; continue; }
      const open = S.doorOpen[i] || 0, near = clamp(1 - d / 6.5, 0, 1);
      r.bus.gain.setTargetAtTime(near * near * (0.6 + 1.4 * open), t, 0.12);
      r.lp.frequency.setTargetAtTime(520 + open * 3400, t, 0.15);
    }

    /* atmosfera sonora do andar */
    const f = S.floor, fear = S.fear;
    S.fanG.gain.setTargetAtTime(f === 3 ? 0.06 : f === 2 ? 0.012 : f === 1 ? 0.006 : f >= 4 ? 0.02 : 0, t, 0.8);
    S.whineG.gain.setTargetAtTime(f >= 3 ? 0.0016 * (0.4 + fear) : 0, t, 0.8);
    S.verbOut.gain.setTargetAtTime(0.7 + fear * 0.5, t, 0.8);
    S.liftG.gain.setTargetAtTime(s.lift >= 0 ? 0.3 + 0.12 * Math.sin(t * 7) : 0, t, 0.3);
    S.lift = s.lift;

    /* alarme no fim e sub-grave que cresce com a profundidade */
    const dEnd = Math.abs(S.endPos.z - s.camPos.z);
    S.alarm.gain.setTargetAtTime(0.06 * clamp(1 - dEnd / 26, 0, 1), t, 0.3);
    S.subG.gain.setTargetAtTime(0.012 + 0.04 * s.p + 0.03 * fear, t, 0.5);

    /* vulto: sting na primeira aparição + sumiço */
    if (s.shade.visible && !lastShadeVisible) {
      const t0 = ctx.currentTime, os = ctx.createOscillator(), e = ctx.createGain();
      os.type = 'sawtooth'; os.frequency.setValueAtTime(38, t0); os.frequency.exponentialRampToValueAtTime(110, t0 + 3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(90, t0); lp.frequency.exponentialRampToValueAtTime(900, t0 + 3);
      e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(0.16, t0 + 2.6); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
      os.connect(lp); lp.connect(e); route(e, { send: 0.5 }); os.start(t0); os.stop(t0 + 3.5);
    }
    if (!s.shade.visible && lastShadeVisible && !muted) { noiseHit({ type: 'lowpass', freq: 900, dur: 0.7, gain: 0.3, send: 0.8 }); thump({ f0: 55, f1: 30, dur: 0.6, gain: 0.5, send: 0.6 }); }
    lastShadeVisible = s.shade.visible;
  }

  function door(i, open, kind = 'door') {
    if (!started || i < 0) return;
    S.doorOpen[i] = open ? 1 : 0;
    if (muted || !cfgRef.rooms[i]) return;
    const pos = cfgRef.rooms[i].pos;
    if (kind === 'door') creak(pos, open);
    else if (kind === 'rack') { if (open) { sample('lock_gear', { pos, gain: 0.4, send: 0.3 }); noiseHit({ pos, freq: 900, q: 0.8, dur: 0.5, gain: 0.5, send: 0.4 }); } else sample('lock_gear', { pos, gain: 0.3, rate: 0.8 }); }
    else if (open) { tone({ pos, freq: 1320, dur: 0.18, gain: 0.5, send: 0.3 }); noiseHit({ pos, type: 'highpass', freq: 3000, dur: 0.12, gain: 0.3, send: 0.2 }); }
  }
  function setFloor(i, fear) { S.floor = i; S.fear = fear; S.floorBeat = i >= 5 ? 0.5 : i >= 4 ? 0.15 : 0; ensureSteps(i); }

  return {
    start(positions) { start(positions); },
    update, door, event, elevator, setFloor,
    get started() { return started; },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (started) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.15);
    },
    pause() { if (ctx && ctx.suspend) ctx.suspend(); },
    resume() { if (ctx && started && !muted && ctx.resume) ctx.resume(); },
    /* só para testes offline */
    _test: { zap: () => zap(), phone: () => phone(), chair: () => chairRoll(), drawer: () => drawerSlam(), elevator, event, samplesReady: () => Promise.all([loadSamples(), loadStepBank()]), stepBank: () => Object.fromEntries(Object.entries(stepBank).map(([k, v]) => [k, v.length])), footstepReal: (v = 1, s = 1) => footstepReal(v, s), samples: () => Object.keys(samples), at: (sec, fn) => { baseDelay = sec; try { fn(); } finally { baseDelay = 0; } }, footstep: (v = 1, s = 1) => footstep(v, s), creak: (pos, o) => creak(pos, o), ambient: (k) => ambientEvent(k), ctxRef: () => ctx, setCtx: (c) => { ctx = c; } },
  };
}
