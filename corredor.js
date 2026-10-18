/* Corredor.exe — primeira pessoa. O scroll vertical vira a caminhada pelo corredor.
   Só transform/opacity; um rAF por scroll; segmentos fora da vista saem do DOM visível. */
(function () {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), track = $('track'), view = $('view'), hall = $('hall');
  const veil = $('veil'), bar = $('bar'), depthEl = $('depth'), shade = $('shade');
  const panels = [...hall.querySelectorAll('.panel')];
  const N = panels.length;
  const SP = 640, WH = 300, HH = 250, SEG = SP * 2, YAW = 82, FRONT = 330, METERS = 666;
  const T = 'translate(-50%,-50%)';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (x) => x * x * (3 - 2 * x);

  /* lado de cada estação: alterna esquerda/direita; início e fim olham de frente */
  const sides = panels.map((p, i) => (p.classList.contains('front') ? 0 : (i % 2 ? 1 : -1)));
  const L = (N - 1) * SP + FRONT + 60;                       /* comprimento do corredor */

  /* ---- monta o corredor: painéis, portas decorativas, luzes, segmentos ---- */
  panels.forEach((el, i) => el.classList.add(sides[i] < 0 ? 'l' : sides[i] > 0 ? 'r' : 'f'));
  /* a altura do painel depende da fonte/idioma: reposiciona ao medir */
  function place() {
   panels.forEach((el, i) => {
    const s = sides[i];
    el.style.transform = s
      ? `${T} translate3d(${s * (WH - 3)}px,${HH - el.offsetHeight / 2 - 4}px,${-i * SP}px) rotateY(${s < 0 ? 90 : -90}deg)`
      : `${T} translate3d(0,0,${-(i * SP + FRONT)}px)`;
   });
  }
  place();

  let out = '';
  const nseg = Math.ceil(L / SEG) + 1;
  for (let k = 0; k < nseg; k++) {
    const z = -(k * SEG + SEG / 2);
    out += `<div class="seg" data-k="${k}" style="display:none">` +
      `<i class="pl wall" style="transform:${T} translate3d(${-WH}px,0,${z}px) rotateY(90deg)"></i>` +
      `<i class="pl wall" style="transform:${T} translate3d(${WH}px,0,${z}px) rotateY(-90deg)"></i>` +
      `<i class="pl floor" style="transform:${T} translate3d(0,${HH}px,${z}px) rotateX(90deg)"></i>` +
      `<i class="pl ceil" style="transform:${T} translate3d(0,${-HH}px,${z}px) rotateX(-90deg)"></i></div>`;
  }
  /* luzes de teto a cada estação (meio entre portas) + poça de luz no chão */
  let lights = '';
  for (let i = 0; i <= N; i++) {
    const z = -(i * SP + SP / 2), f = i % 3 === 0 ? ' flick' : '';
    lights += `<i class="pl lamp${f}" style="transform:${T} translate3d(0,${-HH + 1}px,${z}px) rotateX(-90deg)"></i>` +
      `<i class="pl pool${f}" style="transform:${T} translate3d(0,${HH - 1}px,${z}px) rotateX(90deg)"></i>`;
  }
  /* portas decorativas na parede oposta + placa numerada */
  let decs = '';
  for (let i = 1; i < N - 1; i++) {
    const o = -sides[i];
    decs += `<i class="pl dec" style="transform:${T} translate3d(${o * (WH - 3)}px,${HH - 177}px,${-i * SP}px) rotateY(${o < 0 ? 90 : -90}deg)">${String(i).padStart(2, '0')}</i>`;
  }
  const endw = `<i class="pl endw" style="transform:${T} translate3d(0,0,${-L}px)"></i>`;
  hall.insertAdjacentHTML('afterbegin', out + lights + decs + endw);

  const segs = [...hall.querySelectorAll('.seg')];
  let segLo = -1, segHi = -1;
  function cullSegs(zc) {
    const c = Math.floor(zc / SEG), lo = Math.max(0, c - 1), hi = Math.min(nseg - 1, c + 5);
    if (lo === segLo && hi === segHi) return;
    segLo = lo; segHi = hi;
    segs.forEach((s, k) => { s.style.display = k >= lo && k <= hi ? '' : 'none'; });
  }

  /* ---- escala: o painel precisa caber na tela quando a câmera olha para ele ---- */
  let sc = 1, vw = 0, vh = 0, stepPx = 0;
  function measure() {
    vw = innerWidth; vh = innerHeight;
    if (!vw || !vh) return;
    const wall = panels.filter((p, i) => sides[i]);
    const pw = Math.max(...wall.map((p) => p.offsetWidth)), ph = Math.max(...wall.map((p) => p.offsetHeight));
    place();
    sc = Math.min(1.35, vw * 0.92 / (0.72 * pw), vh * 0.9 / (0.72 * ph));
    stepPx = Math.max(380, vh * 0.65);
    track.style.height = (vh + stepPx * (N - 1)) + 'px';
    update();
  }

  /* ---- câmera ---- */
  let ticking = false, lastCur = -1, depthShown = -1, corrShown = -1;
  function update() {
    ticking = false;
    const s = clamp(scrollY / stepPx, 0, N - 1);
    const i0 = Math.min(N - 2, Math.floor(s)), t = s - i0;
    const k = smooth(clamp((t - 0.25) / 0.5, 0, 1));          /* anda entre estações */
    const zc = SP * (i0 + k) + (s >= N - 1 ? 0 : 0);
    const near = Math.round(s), d = Math.abs(s - near);
    const amp = smooth(1 - clamp((d - 0.2) / 0.25, 0, 1));    /* quanto olha para a porta */
    const yaw = sides[near] * YAW * amp;
    const mov = 4 * k * (1 - k);                              /* só balança andando */
    const bob = Math.sin(zc / 46) * 3 * mov, roll = Math.sin(zc / 92) * 0.45 * mov;
    hall.style.transform = `scale3d(${sc},${sc},${sc}) translateY(${bob.toFixed(2)}px) rotateZ(${roll.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) translate3d(0,0,${zc.toFixed(1)}px)`;
    cullSegs(zc);

    /* painel da estação atual acende; vizinhos ficam só como porta */
    if (near !== lastCur) {
      lastCur = near;
      panels.forEach((p, i) => {
        p.classList.toggle('on', Math.abs(i - near) <= 0);
        p.style.visibility = Math.abs(i - near) <= 7 ? '' : 'hidden';
      });
    }

    const p = s / (N - 1);
    veil.style.opacity = (p * 0.5).toFixed(2);
    bar.style.transform = `scaleX(${p.toFixed(4)})`;
    const corr = p > 0.75 ? 3 : p > 0.45 ? 2 : p > 0.15 ? 1 : 0;
    if (corr !== corrShown) { corrShown = corr; stage.dataset.corr = corr; }
    const m = Math.round(p * METERS);
    if (m !== depthShown) { depthShown = m; depthEl.textContent = m + 'm'; }
    window.__zc = zc;
  }

  /* ---- scroll, mouse (olhar) e vulto ocioso ---- */
  let idleT = 0, shadeT = 0;
  function startIdle() {
    stage.classList.add('idle');
    const zc = window.__zc || 0;
    shade.style.transition = 'none';
    shade.style.transform = `${T} translate3d(0,${HH - 165}px,${-(zc + 1500)}px)`;
    shade.style.opacity = '0';
    void shade.offsetWidth;
    shade.style.transition = 'transform 14s linear, opacity 2s ease';
    shade.style.transform = `${T} translate3d(0,${HH - 165}px,${-(zc + 380)}px)`;
    shade.style.opacity = '.92';
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
    if (stage.classList.contains('idle')) {
      stage.classList.remove('idle');
      shade.style.transition = 'opacity .25s ease'; shade.style.opacity = '0';
    }
    clearTimeout(idleT); idleT = setTimeout(startIdle, 8000);
  }
  addEventListener('scroll', onScroll, { passive: true });

  if (matchMedia('(pointer: fine)').matches) {
    let mx = 50, my = 50, raf = 0;
    addEventListener('mousemove', (e) => {
      mx = 50 + (e.clientX / innerWidth - 0.5) * 14; my = 50 + (e.clientY / innerHeight - 0.5) * 12;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; view.style.perspectiveOrigin = mx.toFixed(1) + '% ' + my.toFixed(1) + '%'; });
    }, { passive: true });
  }

  let rz = 0;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(measure, 120); }).observe(stage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setTimeout(measure, 60)));
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  measure();
  idleT = setTimeout(startIdle, 8000);

  /* ---- áudio ambiente (opt-in): zumbido grave + batimento que acelera ---- */
  const btn = $('audio');
  let ctx = null, on = false, beatT = 0, drone = null;
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.gain.value = 0.07; g.connect(ctx.destination);
    [55, 55.7, 110.3].forEach((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; o.connect(lp); lp.connect(g); o.start(); });
    drone = g;
  }
  function beat() {
    if (!on) return;
    const t = ctx.currentTime;
    [0, 0.2].forEach((dt, n) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = n ? 55 : 70; g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t + dt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
      o.connect(g); g.connect(ctx.destination); o.start(t + dt); o.stop(t + dt + 0.3);
    });
    const corr = +stage.dataset.corr || 0;
    beatT = setTimeout(beat, 1500 - corr * 300);              /* coração acelera com a distância */
  }
  btn.addEventListener('click', () => {
    on = !on;
    if (on) { if (!ctx) build(); ctx.resume(); beatT = setTimeout(beat, 600); }
    else { clearTimeout(beatT); if (ctx) ctx.suspend(); }
    btn.querySelector('i').className = 'fa-solid ' + (on ? 'fa-volume-high' : 'fa-volume-xmark');
  });
})();
