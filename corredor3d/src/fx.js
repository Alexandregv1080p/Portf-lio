/* Pós-processamento enxuto: [AO] → [bloom em meia resolução] → filme (grade de cor + glitch) → saída → [FXAA]
   Cada etapa é opcional por tier; o que pesa (AO, bloom, MSAA) só entra no tier ultra/high. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export async function createFx(renderer, scene, camera, { Q }) {
  const sz = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  /* HDR (half float) só quando há bloom/MSAA; no tier low o alvo é 8 bits (metade da banda de memória) */
  const hdr = Q.msaa > 0 || Q.bloom;
  const rt = new THREE.WebGLRenderTarget(Math.max(1, sz.x * pr), Math.max(1, sz.y * pr), { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (Q.gtao) {                                    /* só no tier ultra: oclusão de ambiente é a etapa mais cara */
    const { GTAOPass } = await import('three/examples/jsm/postprocessing/GTAOPass.js');
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    const ov = gtao._overrideVisibility.bind(gtao);               /* feixes, halos e poças não entram no cálculo de AO */
    gtao._overrideVisibility = function () { ov(); this.scene.traverse((o) => { if (o.userData && o.userData.noAO && o.visible) { o.visible = false; this._visibilityCache.push(o); } }); };
    composer.addPass(gtao);
  }

  let bloom = null;
  if (Q.bloom) {                                   /* resolução da cadeia de blur pela metade: ~4x menos custo, visualmente igual */
    bloom = new UnrealBloomPass(new THREE.Vector2(Math.round(innerWidth / 2), Math.round(innerHeight / 2)), 0.3, 0.5, 0.9);
    composer.addPass(bloom);
  }

  const ca = Q.ca;                                 /* aberração cromática = 3 leituras da textura; tiers fracos usam 1 */
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
        if (burst > .02) {                                                    /* rasgo de fita: só durante os bursts */
          float band = floor(uv.y*34.);
          float gate = step(.88 - glitch*.1, h(vec2(band, floor(time*.35))));
          uv.x += burst * .075 * gate * (h(vec2(band, time)) - .5) * 2.;
        }
        vec2 d = vUv - .5; float r = length(d);
        ${ca ? `float ca = .0004 + r*r*.0028 + burst*.009;
        vec3 c = vec3(texture2D(tDiffuse, uv + d*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d*ca).b);`
             : 'vec3 c = texture2D(tDiffuse, uv).rgb;'}
        if (burst > .45 && h(floor(vUv*vec2(26.,15.)) + floor(time*.5)) > .965) c = c.gbr * 1.2;      /* blocos corrompidos */
        float lum = dot(c, vec3(.299,.587,.114));
        c = mix(vec3(lum), c, sat) * tint;
        float g = h(floor(vUv*vec2(1920.,1080.)) + time) - .5;
        c += g * mix(.022, .006, smoothstep(.0, .6, lum));
        c *= smoothstep(.95, .28, r*1.12);
        gl_FragColor = vec4(c*flick, 1.);
      }`,
  });
  composer.addPass(film);
  composer.addPass(new OutputPass());

  let fxaa = null;
  if (Q.fxaa) {                                    /* antialias barato no fim (já em LDR): substitui o MSAA caro */
    fxaa = new ShaderPass(FXAAShader);
    composer.addPass(fxaa);
  }

  /* chamado quando a resolução interna muda (resolução dinâmica) ou a janela é redimensionada */
  function resize(w, h, pixelRatio) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
    if (bloom) bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  }
  resize(innerWidth, innerHeight, pr);
  return { composer, film, bloom, gtao, fxaa, resize };
}
