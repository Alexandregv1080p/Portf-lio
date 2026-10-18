/* Sonografia procedural (Web Audio, sem arquivos): tudo é sintetizado e espacializado.
   Camadas: sala (reverb de corredor) · zumbido ambiente · lâmpadas (3D) · passos ·
   portas (rangido + som atrás de cada uma) · eventos aleatórios · o vulto (batimento/drone). */

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function createAudio(cfg, externalCtx) {
  const STRIDE = 0.78;                     /* metros por passo */
  const POS_BOOST = 2.6;                   /* fontes 3D perdem nível com a distância: compensa */
  const MASTER = 0.9;
  let ctx = null, master, dryBus, verbSend, noiseBuf, brownBuf;
  let started = false, muted = false;
  const S = { camPos: { x: 0, y: 1.6, z: 0 }, p: 0, shade: { visible: false, dist: 99 }, doorOpen: [], doorDist: [] };
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
    const sec = 3.4, len = (ctx.sampleRate * sec) | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
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
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
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
  const ROOM_KINDS = ['servers', 'radio', 'musicbox', 'clock', 'breath', 'servers', 'radio', 'clock'];
  function buildRoom(i, pos) {
    const kind = ROOM_KINDS[i % ROOM_KINDS.length];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(lp);
    route(lp, { pos, send: 0.35, gain: 1 });
    const room = { kind, lp, bus, pos, t: 0 };
    const loop = (buf, f, q, g, type = 'bandpass') => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      const v = ctx.createGain(); v.gain.value = g; s.connect(b); b.connect(v); v.connect(bus); s.start(0, Math.random() * 2); return v;
    };
    if (kind === 'servers') {
      [110, 220, 330].forEach((f, k) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * (1 + k * 0.002); g.gain.value = 0.05 / (k + 1); o.connect(g); g.connect(bus); o.start(); });
      loop(noiseBuf, 700, 0.6, 0.35);
    } else if (kind === 'radio') {
      const v = loop(noiseBuf, 1900, 0.5, 0.5);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rnd(3, 8); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(v.gain); lfo.start();
    }
    return room;
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

  /* ----------------------------------------------- eventos aleatórios do prédio */
  function ambientEvent(force) {
    const c = S.camPos, p = S.p, ahead = (d, x = 0) => ({ x, y: rnd(0.4, 2.6), z: c.z - d });
    const kinds = [['drip', 36], ['knock', 18], ['steps', 14], ['groan', 14], ['whisper', p > 0.25 ? 10 : 0], ['slam', 6], ['rat', 8]];
    let r = Math.random() * kinds.reduce((a, k) => a + k[1], 0), kind = kinds[0][0];
    for (const [k, w] of kinds) { if ((r -= w) <= 0) { kind = k; break; } }
    if (force) kind = force;
    if (kind === 'drip') {
      const pos = ahead(rnd(-8, 16), rnd(-1.2, 1.2));
      tone({ pos, freq: rnd(1700, 3000), dur: 0.22, gain: 0.6, send: 0.7 });
      if (Math.random() < 0.5) tone({ pos, freq: rnd(1700, 3000), dur: 0.2, gain: 0.5, delay: rnd(0.9, 1.6), send: 0.7 });
    } else if (kind === 'knock') {                                  /* batidas no cano de metal */
      const pos = { x: rnd(-1.2, 1.2), y: 2.9, z: c.z - rnd(4, 18) }, n = (Math.random() * 3 | 0) + 2;
      for (let i = 0; i < n; i++) { const d = i * rnd(0.32, 0.55); thump({ pos, f0: rnd(150, 190), f1: 80, dur: 0.18, gain: 0.8, delay: d, send: 0.7 }); noiseHit({ pos, freq: 1300, q: 4, dur: 0.12, gain: 0.35, delay: d, send: 0.7 }); }
    } else if (kind === 'steps') {                                  /* alguém andando atrás de você */
      distantSteps((Math.random() * 4 | 0) + 4, { x: rnd(-0.6, 0.6), y: 0.1, z: c.z + rnd(7, 12) });
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
    } else if (kind === 'slam') {                                   /* porta batendo ao longe */
      const pos = ahead(rnd(14, 22), rnd(-1.4, 1.4));
      thump({ pos, f0: 90, f1: 34, dur: 0.4, gain: 1.1, send: 0.9 }); noiseHit({ pos, freq: 900, q: 0.8, dur: 0.25, gain: 0.6, send: 0.9 });
    } else {                                                        /* algo correndo no forro */
      const pos = { x: rnd(-1, 1), y: 3.1, z: c.z - rnd(2, 9) }, n = 10 + (Math.random() * 10 | 0);
      for (let i = 0; i < n; i++) noiseHit({ pos: { ...pos, z: pos.z - i * 0.35 }, freq: rnd(2600, 4200), q: 2, dur: 0.02, gain: rnd(0.5, 0.9), delay: i * rnd(0.04, 0.08), send: 0.5 });
    }
    return kind;
  }
  function scheduleEvents() {
    const wait = rnd(4500, 13000) * (1 - S.p * 0.45);
    timers.push(setTimeout(() => { if (started && !muted) ambientEvent(); scheduleEvents(); }, wait));
  }

  /* -------------------------------------------------------- vulto: batimento */
  let beatTimer = 0;
  function beat() {
    const pr = S.shade.visible ? clamp(1 - S.shade.dist / 12, 0, 1) : 0;
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
    if (!ctx) ctx = externalCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 5; comp.attack.value = 0.01; comp.release.value = 0.3;
    dryBus = ctx.createGain(); verbSend = ctx.createGain();
    const conv = ctx.createConvolver(); noiseBuf = makeNoise(3, 'white'); brownBuf = makeNoise(4, 'brown'); conv.buffer = makeIR();
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.7;
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

    /* lâmpadas: zumbido posicional (gagueja com o flicker) */
    positions.fixtures.forEach((pos) => {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = 120; o2.type = 'square'; o2.frequency.value = 240.7;
      bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 5; g.gain.value = 0.0012;
      o1.connect(bp); o2.connect(bp); bp.connect(g); route(g, { pos, send: 0.25 }); o1.start(); o2.start();
      fixtureState.push({ gain: g, pos, k: 1 });
    });
    /* sala de dentro de cada porta */
    positions.doors.forEach((pos, i) => rooms.push(buildRoom(i, pos)));
    timers.push(setInterval(() => { rooms.forEach((r, i) => roomTick(r, (S.doorDist[i] ?? 99) < 5.5)); }, 700 + (Math.random() * 100 | 0)));

    /* alarme de emergência no fim: pulsa e cresce quando você chega perto */
    const al = ctx.createOscillator(), al2 = ctx.createOscillator(), trem = ctx.createGain(), alg = ctx.createGain();
    const alLfo = ctx.createOscillator(), alLg = ctx.createGain();
    al.frequency.value = 98; al2.frequency.value = 147.5; trem.gain.value = 0.5; alg.gain.value = 0;   /* alg = nível (por distância); trem = pulso */
    alLfo.frequency.value = 0.62; alLg.gain.value = 0.5; alLfo.connect(alLg); alLg.connect(trem.gain);
    al.connect(trem); al2.connect(trem); trem.connect(alg); route(alg, { pos: positions.end, send: 0.5 });
    al.start(); al2.start(); alLfo.start(); S.alarm = alg;

    started = true;
    S.endPos = positions.end;
    master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.6);
    scheduleEvents(); beat();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
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

    /* passos: um a cada STRIDE metros andados (acompanha o scroll de verdade) */
    stepAcc += s.stepDist;
    while (stepAcc >= STRIDE) {
      stepAcc -= STRIDE; stepSide *= -1;
      if (!muted) footstep(clamp(0.5 + s.speed * 0.3, 0.5, 1), stepSide);
    }
    if (s.stepDist === 0 && s.speed < 0.02) stepAcc = Math.min(stepAcc, STRIDE * 0.5);

    /* lâmpadas: o zumbido cai e crepita junto com a luz */
    s.fixtures.forEach((k, i) => {
      const f = fixtureState[i]; if (!f) return;
      f.gain.gain.setTargetAtTime(0.0012 * (0.1 + 0.9 * k), t, 0.015);
      if (f.k > 0.6 && k < 0.5 && !muted) { noiseHit({ pos: f.pos, freq: rnd(3200, 5200), q: 2, dur: 0.03, gain: 0.12, send: 0.3 }); thump({ pos: f.pos, f0: 300, f1: 120, dur: 0.05, gain: 0.05 }); }
      f.k = k;
    });

    /* salas atrás das portas: mais alto perto, e vaza quando a porta abre */
    rooms.forEach((r, i) => {
      const d = s.doorDist[i] ?? 99; S.doorDist[i] = d;
      const open = S.doorOpen[i] || 0, near = clamp(1 - d / 6.5, 0, 1);
      r.bus.gain.setTargetAtTime(near * near * (0.6 + 1.4 * open), t, 0.12);
      r.lp.frequency.setTargetAtTime(520 + open * 3400, t, 0.15);
    });

    /* alarme no fim e sub-grave que cresce com a profundidade */
    const dEnd = Math.abs(S.endPos.z - s.camPos.z);
    S.alarm.gain.setTargetAtTime(0.06 * clamp(1 - dEnd / 26, 0, 1), t, 0.3);
    S.subG.gain.setTargetAtTime(0.012 + 0.04 * s.p, t, 0.5);

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

  function door(i, open) {
    if (!started || i < 0) return;
    S.doorOpen[i] = open ? 1 : 0;
    if (!muted) creak(positionsRef.doors[i], open);
  }
  let positionsRef = { doors: [], fixtures: [], end: { x: 0, y: 1, z: -50 } };

  return {
    start(positions) { positionsRef = positions; start(positions); },
    update, door,
    get started() { return started; },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (started) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.15);
    },
    pause() { if (ctx && ctx.suspend) ctx.suspend(); },
    resume() { if (ctx && started && !muted && ctx.resume) ctx.resume(); },
    /* só para testes offline */
    _test: { at: (sec, fn) => { baseDelay = sec; try { fn(); } finally { baseDelay = 0; } }, footstep: (v = 1, s = 1) => footstep(v, s), creak: (pos, o) => creak(pos, o), ambient: (k) => ambientEvent(k), ctxRef: () => ctx, setCtx: (c) => { ctx = c; } },
  };
}
