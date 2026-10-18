/* Pós-processamento: bloom + filme com grade de cor por andar, glitch/VHS que cresce com a profundidade */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

export function createFx(renderer, scene, camera, { coarse }) {
  /* alvos com MSAA: sem isso o pós-processamento desfaz o antialias e as bordas ficam serrilhadas */
  const sz = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(Math.max(1, sz.x * pr), Math.max(1, sz.y * pr), { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  /* oclusão de ambiente (GTAO): contato e cantos escurecem, objetos "assentam" no cenário — só no desktop */
  let gtao = null;
  if (!coarse) {
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 14, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.9;
    const ov = gtao._overrideVisibility.bind(gtao);               /* feixes, halos e poças não entram no cálculo de AO */
    gtao._overrideVisibility = function () { ov(); this.scene.traverse((o) => { if (o.userData && o.userData.noAO && o.visible) { o.visible = false; this._visibilityCache.push(o); } }); };
    composer.addPass(gtao);
  }
  let bloom = null;
  if (!coarse) { bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.88); composer.addPass(bloom); }
  const film = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, time: { value: 0 }, flick: { value: 1 }, sat: { value: 1 },
      glitch: { value: 0 }, burst: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time, flick, sat, glitch, burst; uniform vec3 tint; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv = vUv;
        /* faixas horizontais deslocadas (rasgo de fita VHS): só em bursts e em glitch alto */
        float band = floor(uv.y*34.);
        float gate = step(.88 - glitch*.1, h(vec2(band, floor(time*.35))));
        uv.x += burst * .075 * gate * (h(vec2(band, time)) - .5) * 2.;           /* só durante os bursts: fora deles as bordas ficam limpas */
        uv.x += sin(uv.y*55. + time*.5) * .0002 * glitch;
        /* barra de tracking rolando */
        float by = fract(time*.011), bm = smoothstep(.06, .0, abs(uv.y - by));
        uv.x += bm * .012 * glitch;
        vec2 d = vUv - .5; float r = length(d);
        float ca = .0006 + r*r*.004 + glitch*.0022 + burst*.011;
        vec3 c = vec3(texture2D(tDiffuse, uv + d*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d*ca).b);
        c += bm * glitch * .05;
        if (burst > .45 && h(floor(vUv*vec2(26.,15.)) + floor(time*.5)) > .965) c = c.gbr * 1.2;      /* blocos corrompidos */
        float lum = dot(c, vec3(.299,.587,.114));
        c = mix(vec3(lum), c, sat) * tint;
        float g = h(floor(vUv*vec2(1920.,1080.)) + time) - .5;
        c += g * mix(.03, .008, smoothstep(.0, .6, lum));
        c *= smoothstep(.95, .28, r*1.12);
        gl_FragColor = vec4(c*flick, 1.);
      }`,
  });
  composer.addPass(film);
  composer.addPass(new OutputPass());
  return { composer, film, bloom, gtao };
}
