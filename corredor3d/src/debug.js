/* Painel de desempenho (?debug=1 ou tecla P): mostra o que a máquina realmente está sofrendo.
   Serve para você me mandar um print com números em vez de "tá pesado". */
export function createDebug(renderer, getState) {
  const el = document.createElement('pre');
  el.id = 'dbg';
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:50;margin:0;padding:8px 10px;font:11px/1.35 ui-monospace,Consolas,monospace;color:#bff;background:rgba(0,0,0,.72);border:1px solid rgba(0,255,200,.35);border-radius:6px;pointer-events:none;white-space:pre;max-width:96vw;display:none';
  document.body.appendChild(el);
  renderer.info.autoReset = false;
  let on = new URLSearchParams(location.search).has('debug');
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
  const frames = []; let acc = 0, n = 0, worst = 0, lastDraw = 0, jsMs = 0, t0 = 0;
  const show = (v) => { on = v; el.style.display = on ? 'block' : 'none'; };
  show(on);
  addEventListener('keydown', (e) => { if (e.key === 'p' || e.key === 'P') show(!on); });

  return {
    begin() { renderer.info.reset(); t0 = performance.now(); },
    end(frameMs) {
      jsMs = performance.now() - t0;                               /* tempo de CPU do frame (JS + envio de comandos) */
      acc += frameMs; n++; worst = Math.max(worst, frameMs);
      const now = performance.now();
      if (now - lastDraw < 500) return;
      lastDraw = now;
      const avg = acc / n, fps = 1000 / avg, r = renderer.info.render, m = renderer.info.memory, s = getState();
      el.textContent =
        `FPS ${fps.toFixed(0)}  (média ${avg.toFixed(1)} ms · pior ${worst.toFixed(0)} ms)\n` +
        `CPU/frame ${jsMs.toFixed(1)} ms\n` +
        `tier ${s.tier}  escala ${(s.scale * 100).toFixed(0)}%  pr ${s.pr.toFixed(2)}\n` +
        `canvas ${s.w}×${s.h}  ` + (s.msaa ? `MSAA ${s.msaa}x ` : '') + (s.fxaa ? 'FXAA ' : '') + '\n' +
        `draw calls ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k\n` +
        `geom ${m.geometries}  tex ${m.textures}  luzes ${s.lights}\n` +
        `AO ${s.gtao ? 'on' : 'off'}  bloom ${s.bloom ? 'on' : 'off'}  sombra ${s.shadow ? 'on' : 'off'}  feixes ${s.shafts ? 'on' : 'off'}\n` +
        `degradação ${s.level}\n` +
        `GPU ${gpu}\n` + (performance.memory ? `heap JS ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB\n` : '');
      acc = 0; n = 0; worst = 0;
    },
  };
}
