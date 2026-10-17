/* Necrópole.exe — o scroll vertical vira a caminhada horizontal.
   Só transform/opacity, um único rAF por scroll (nada de variáveis na raiz). */
(function () {
  const $ = (id) => document.getElementById(id);
  const track = $('track'), art = $('art'), cards = $('cards'), far = $('far'), mid = $('mid');
  const moon = $('moon'), moonRed = $('moonRed'), veil = $('veil'), bar = $('bar'), depthEl = $('depth');
  const walker = $('walker'), lantern = $('lantern'), gl = $('gl'), gr = $('gr');
  const fine = matchMedia('(pointer: fine)').matches;
  const FAR = 0.18, MID = 0.5, MOON = 0.04, METERS = 666;

  let wl = 0, wr = 0, vw = 0, vh = 0, dist = 0, shift = 0, items = [], ticking = false, depthShown = -1;

  function measure() {
    vw = innerWidth; vh = innerHeight;
    if (!vw || !vh) return;
    dist = Math.max(0, art.scrollWidth - vw);
    track.style.height = (vh + dist) + 'px';
    far.style.width = (vw + dist * FAR) + 'px';
    mid.style.width = (vw + dist * MID) + 'px';
    /* posição absoluta (no mundo) de cada elemento revelável */
    items = [...cards.querySelectorAll('.rv')].map((el) => { const r = el.getBoundingClientRect(); return { el, on: false, dim: false, x: r.left + shift, w: r.width, card: el.matches('.tomb,.door,.rack,.glass') }; });
    /* a luz do personagem é fixa na tela */
    const w = walker.getBoundingClientRect();
    wl = w.left; wr = w.right;
    lamp(w.left + w.width * 0.89, w.top + w.height * 0.55);
    update();
  }

  function lamp(x, y) {
    lantern.style.setProperty('--lx', x + 'px');
    lantern.style.setProperty('--ly', y + 'px');
  }

  function update() {
    ticking = false;
    const p = dist ? Math.min(1, Math.max(0, scrollY / dist)) : 0;
    shift = p * dist;
    const t = 'translate3d(' + (-shift) + 'px,0,0)';
    art.style.transform = cards.style.transform = t;
    far.style.transform = 'translate3d(' + (-shift * FAR) + 'px,0,0)';
    mid.style.transform = 'translate3d(' + (-shift * MID) + 'px,0,0)';
    moon.style.transform = 'translate3d(' + (-shift * MOON) + 'px,0,0)';

    /* portão se abre quando o vulto chega perto */
    const g = Math.min(1, Math.max(0, (shift - vw * 0.12) / (vw * 0.3)));
    const s = 'scaleX(' + (1 - 0.9 * g).toFixed(3) + ')';
    gl.style.transform = gr.style.transform = s;

    /* revela ao aproximar (histerese: rebobinar também apaga) */
    for (const it of items) {
      const sx = it.x - shift;
      if (!it.on && sx < vw * 0.85) { it.on = true; it.el.classList.add('on'); }
      else if (it.on && sx > vw * 1.05) { it.on = false; it.el.classList.remove('on'); }
      if (it.card) {   /* o vulto passa na frente: esmaece o card para não cobrir o texto */
        const d = sx < wr && sx + it.w > wl;
        if (d !== it.dim) { it.dim = d; it.el.classList.toggle('dim', d); }
      }
    }

    /* a corrupção cresce com a distância */
    veil.style.opacity = (p * 0.5).toFixed(2);
    moonRed.style.opacity = Math.min(1, p * 1.4).toFixed(2);
    lantern.style.setProperty('--c', p.toFixed(2));
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    const m = Math.round(p * METERS);
    if (m !== depthShown) { depthShown = m; depthEl.textContent = m + 'm'; }
  }

  /* andar enquanto rola; parar de rolar = parar de andar */
  let walkT = 0, idleT = 0;
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
    walker.classList.add('walking');
    clearTimeout(walkT); walkT = setTimeout(() => walker.classList.remove('walking'), 160);
    document.body.classList.remove('idle');
    clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 7000);
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* lanterna segue o mouse (1 update por frame; vars só no #lantern) */
  if (fine) {
    let mx = 0, my = 0, raf = 0;
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; lamp(mx, my); });
    }, { passive: true });
  }

  let rz = 0;
  /* ResizeObserver também cobre o 1º layout real (viewport 0 durante o load) */
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(measure, 120); }).observe($('stage'));
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  /* o idioma muda o tamanho dos textos → remede */
  document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setTimeout(measure, 60)));
  /* a história sempre começa no portão (evita estado velho de scroll restaurado) */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  measure();
  idleT = setTimeout(() => document.body.classList.add('idle'), 7000);

  /* ---- áudio ambiente (opt-in, Web Audio — sem arquivo) ---- */
  const btn = $('audio');
  let ctx = null, on = false, bellT = 0;
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 220;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const g = ctx.createGain(); g.gain.value = 0.18;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination); src.start();
  }
  function bell() {
    if (!on) return;
    const t = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    g.connect(ctx.destination);
    [196, 392, 588].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f * (i ? 1.003 : 1); o.connect(g); o.start(t); o.stop(t + 5); });
    bellT = setTimeout(bell, 12000 + Math.random() * 8000);
  }
  btn.addEventListener('click', () => {
    on = !on;
    if (on) { if (!ctx) build(); ctx.resume(); bellT = setTimeout(bell, 2500); }
    else { clearTimeout(bellT); if (ctx) ctx.suspend(); }
    btn.querySelector('i').className = 'fa-solid ' + (on ? 'fa-volume-high' : 'fa-volume-xmark');
  });
})();
