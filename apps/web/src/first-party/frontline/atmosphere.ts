/**
 * The air between you and things, on every tier and for almost no cost:
 *
 *   sun fog    three's fog, re-coloured per pixel: haze glows warm when you
 *              look toward the sun and stays cool away from it, and it lies
 *              thicker near the ground than up at the container tops. A patch
 *              to the shared fog shader chunks (every material, sprites and
 *              particles included), with the sun baked in as constants; no
 *              new uniforms, no extra passes.
 *   sun glare  one additive sprite on the sun for the tiers without bloom:
 *              a soft halo that the yard's edges cut into.
 *
 * The chunks are global to three, so `install` returns an undo; the engine
 * calls it on dispose (shaders already built keep what they were built with).
 */

import { AdditiveBlending, CanvasTexture, Color, ShaderChunk, Sprite, SpriteMaterial, SRGBColorSpace, type Texture, type Vector3 } from "three";

export interface SunFog {
  /** Unit vector toward the sun (world). */
  dir: Vector3;
  /** Haze color looking straight at the sun (linear, may exceed 1). */
  glow: Color;
  /** 0 = plain fog, 1 = full glow toward the sun. */
  strength: number;
}

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : n.toFixed(5));

export function installSunFog(sun: SunFog): () => void {
  const prev = {
    pv: ShaderChunk.fog_pars_vertex,
    v: ShaderChunk.fog_vertex,
    pf: ShaderChunk.fog_pars_fragment,
    f: ShaderChunk.fog_fragment,
  };
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFlView;
  varying float vFlHeight;
#endif`;
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFlView = mvPosition.xyz;
  vFlHeight = dot(viewMatrix[1].xyz, mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFlView;
  varying float vFlHeight;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  // Ground haze: thicker low down, thinner above the stacks.
  fogFactor = clamp(fogFactor * mix(0.7, 1.3, exp(-max(vFlHeight, 0.0) * 0.16)), 0.0, 1.0);
  vec3 flSun = (viewMatrix * vec4(${f(sun.dir.x)}, ${f(sun.dir.y)}, ${f(sun.dir.z)}, 0.0)).xyz;
  float flToSun = max(dot(normalize(vFlView), flSun), 0.0);
  // A wide warm lobe and a tight bright one around the sun itself.
  float flGlow = ${f(sun.strength)} * (0.45 * flToSun * flToSun + 0.55 * pow(flToSun, 12.0));
  vec3 flFog = mix(fogColor, vec3(${f(sun.glow.r)}, ${f(sun.glow.g)}, ${f(sun.glow.b)}), flGlow);
  // Looking into the sun the haze also reads thicker (forward scattering).
  fogFactor = clamp(fogFactor * (1.0 + 0.6 * flGlow), 0.0, 1.0);
  gl_FragColor.rgb = mix( gl_FragColor.rgb, flFog, fogFactor );
#endif`;
  return () => {
    ShaderChunk.fog_pars_vertex = prev.pv;
    ShaderChunk.fog_vertex = prev.v;
    ShaderChunk.fog_pars_fragment = prev.pf;
    ShaderChunk.fog_fragment = prev.f;
  };
}

/** A soft radial halo with a hot core (additive). */
export function glareTexture(): Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,246,224,1)");
  g.addColorStop(0.06, "rgba(255,226,170,0.85)");
  g.addColorStop(0.2, "rgba(255,190,120,0.3)");
  g.addColorStop(0.5, "rgba(255,160,90,0.08)");
  g.addColorStop(1, "rgba(255,150,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The sun's halo for tiers without bloom: far along `dir`, behind everything in the yard. */
export function sunGlare(tex: Texture, dir: Vector3, color: Color, strength: number): Sprite {
  const mat = new SpriteMaterial({ map: tex, color: color.clone().multiplyScalar(strength), blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: true });
  const sp = new Sprite(mat);
  sp.position.copy(dir).multiplyScalar(420);
  sp.scale.setScalar(300);
  sp.renderOrder = -1;
  return sp;
}

/**
 * The film look for the tiers without post-processing (phones): the same
 * grade the high tier applies in its own pass (lift / gamma / gain, teal
 * shade and amber highlights), folded into three's tone mapping so it runs
 * inside the shaders that already draw the frame. No render target, no extra
 * pass, and the hardware anti-aliasing stays. Use with `CustomToneMapping`.
 */
export function installGradedToneMapping(): () => void {
  const prev = ShaderChunk.tonemapping_pars_fragment;
  ShaderChunk.tonemapping_pars_fragment = prev.replace(
    "vec3 CustomToneMapping( vec3 color ) { return color; }",
    /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  c = vec3(1.1, 1.04, 0.96) * (c + vec3(0.004, 0.004, 0.01) * (1.0 - c));
  c = pow(max(c, 0.0), vec3(1.0 / 0.94, 1.0 / 0.93, 1.0 / 0.92));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.02);
  c += (1.0 - l) * vec3(-0.012, 0.004, 0.018) + l * vec3(0.024, 0.01, -0.02);
  return clamp(c, 0.0, 1.0);
}`,
  );
  return () => {
    ShaderChunk.tonemapping_pars_fragment = prev;
  };
}
