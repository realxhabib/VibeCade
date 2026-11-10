/**
 * PBR materials for the yard (medium/high tiers), built from the downloaded
 * CC0 texture sets. Each is a MeshStandardMaterial with a small shader patch:
 *
 *   container  neutral painted steel × per-container tint (vertex color), rib
 *              normals, plus a rust-streak / dirt overlay on a second UV set
 *              (u along the side, v up the wall)
 *   painted    painted metal whose albedo alpha is a paint mask: the tint
 *              only colors the paint, the rust keeps its own color
 *   ground     tiled wet asphalt (sampled at two scales against tiling) under
 *              a baked overlay (lane paint, oil, contact shadows) and a
 *              wetness mask: puddles go dark, glossy and flat
 *
 * Every material shares the scene's image-based lighting (the HDRI).
 */

import { Color, DoubleSide, MeshStandardMaterial, Vector2, type IUniform, type Material, type Texture } from "three";
import type { AssetPack, MaterialId } from "./assets";

interface Patch {
  key: string;
  uniforms?: Record<string, IUniform>;
  vertexPars?: string;
  vertexMain?: string;
  /** After `transformed` is set up (object-space vertex displacement). */
  vertexBegin?: string;
  fragPars?: string;
  /** After the albedo map and vertex colors are applied (diffuseColor). */
  afterColor?: string;
  /** After roughnessFactor / metalnessFactor are known. */
  afterRoughness?: string;
  afterNormal?: string;
}

export function patchMaterial(m: Material, p: Patch): void {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, p.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${p.vertexPars ?? ""}`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n${p.vertexMain ?? ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${p.vertexBegin ?? ""}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${p.fragPars ?? ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${p.afterColor ?? ""}`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\n${p.afterRoughness ?? ""}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${p.afterNormal ?? ""}`);
  };
  m.customProgramCacheKey = () => p.key;
}

function std(pack: AssetPack, id: MaterialId, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}): MeshStandardMaterial {
  const t = pack.mats[id];
  return new MeshStandardMaterial({
    map: t.albedo,
    normalMap: t.normal,
    roughnessMap: t.arm,
    metalnessMap: t.arm,
    aoMap: t.arm,
    aoMapIntensity: 0.8,
    roughness: 1,
    metalness: 1,
    ...extra,
  });
}

export interface WorldMaterials {
  container: MeshStandardMaterial;
  painted: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  planks: MeshStandardMaterial;
  plate: MeshStandardMaterial;
  cladding: MeshStandardMaterial;
  /** Painted metal that is looked after (`look: "clean"`). */
  clean: MeshStandardMaterial;
  ground: MeshStandardMaterial;
  /** Logos and stencils on container sides (alpha-tested, follows the ribs). */
  decal: MeshStandardMaterial;
  tarp: MeshStandardMaterial;
  /** Chain-link fence (alpha-tested canvas). */
  fence: MeshStandardMaterial;
  all: Material[];
}

export interface GroundMaps {
  /** Lane paint, oil stains, contact shadows: rgb over the asphalt by alpha (sRGB). */
  overlay: Texture;
  /** r = contact AO multiplier, g = wetness (1 = standing water). */
  mask: Texture;
  /** World size covered by the overlay (m) and its origin. */
  size: Vector2;
  origin: Vector2;
}

export function worldMaterials(pack: AssetPack, ground: GroundMaps, extras: { logos: Texture; fence: Texture }): WorldMaterials {
  const container = std(pack, "container", { vertexColors: true, metalness: 0.35 });
  container.normalScale.set(1.15, 1.15);
  patchMaterial(container, {
    key: "fl-container",
    uniforms: { grimeMap: { value: pack.grime } },
    vertexPars: "attribute vec2 grimeUv; varying vec2 vGrimeUv;",
    vertexMain: "vGrimeUv = grimeUv;",
    fragPars: "uniform sampler2D grimeMap; varying vec2 vGrimeUv; float fGrime;",
    afterColor: `
      vec4 grime = texture2D(grimeMap, vGrimeUv);
      fGrime = grime.a;
      diffuseColor.rgb = mix(diffuseColor.rgb, grime.rgb, grime.a * 0.92);`,
    afterRoughness: "roughnessFactor = mix(roughnessFactor, 0.93, fGrime); metalnessFactor *= 1.0 - fGrime;",
  });

  /** Painted metal; `rustK` scales how much of the rust shows (1 = left to weather, less = looked after). */
  const paintedMetal = (key: string, rustK: number) => {
    const m = std(pack, "painted", { vertexColors: true, metalness: 0.5 });
    patchMaterial(m, {
      key,
      vertexPars: "varying float vPaintY;",
      vertexMain: "vPaintY = (modelMatrix * vec4(position, 1.0)).y;",
      fragPars: "float fPaint; varying float vPaintY;",
      afterColor: `
      // Paint takes the tint; rust keeps its own (darkened) color. It gathers near the ground and in a few
      // coarse patches higher up, so painted steel reads as weathered instead of camouflaged.
      float coarse = texture2D(map, vMapUv * 0.17 + vec2(0.37, 0.61)).a;
      float wide = texture2D(map, vMapUv * 0.061 + vec2(0.11, 0.83)).a;
      float low = 1.0 - smoothstep(0.0, 0.7, vPaintY);
      float rustPatch = smoothstep(0.55, 0.9, 1.0 - coarse) * mix(smoothstep(0.55, 0.9, 1.0 - wide), 1.0, low);
      float rustAmt = (1.0 - smoothstep(0.1, 0.6, sampledDiffuseColor.a)) * rustPatch * ${rustK.toFixed(2)};
      fPaint = 1.0 - rustAmt;
      vec3 rust = mix(sampledDiffuseColor.rgb, vec3(0.2, 0.1, 0.06), 0.5) * 0.5 * diffuse;
      // Sun-faded paint: a slow change in tone across the surface.
      // The albedo is rusty wherever its mask says so: paint over the rust we don't keep.
      vec3 paintTex = mix(vec3(0.84), sampledDiffuseColor.rgb, sampledDiffuseColor.a);
      diffuseColor.rgb = diffuse * vColor.rgb * paintTex * (0.92 + 0.12 * wide);
      diffuseColor.rgb = mix(rust, diffuseColor.rgb, fPaint);
      diffuseColor.a = opacity;`,
      afterRoughness: "roughnessFactor = mix(0.92, roughnessFactor * 0.8, fPaint); metalnessFactor *= fPaint;",
    });
    return m;
  };
  const painted = paintedMetal("fl-painted", 1);
  // Kept-up paint (the ship's own plating and superstructure): the odd rust bleed only.
  const clean = paintedMetal("fl-clean", 0.4);
  clean.metalness = 0.25;

  const concrete = std(pack, "concrete", { vertexColors: true, metalness: 0 });
  const planks = std(pack, "planks", { vertexColors: true, metalness: 0 });
  const plate = std(pack, "plate", { vertexColors: true });
  const cladding = std(pack, "cladding", { vertexColors: true });
  // Mostly seen in shade at this sun angle: lifted so the ribs still read.
  cladding.color.multiplyScalar(1.35);

  const asphalt = pack.mats.asphalt;
  const groundMat = new MeshStandardMaterial({ map: asphalt.albedo, normalMap: asphalt.normal, roughnessMap: asphalt.arm, aoMap: asphalt.arm, aoMapIntensity: 0.6, roughness: 1, metalness: 0 });
  patchMaterial(groundMat, {
    key: "fl-ground",
    uniforms: {
      overlayMap: { value: ground.overlay },
      maskMap: { value: ground.mask },
      overlaySize: { value: ground.size },
      overlayOrigin: { value: ground.origin },
    },
    vertexPars: "varying vec2 vOverlayUv; uniform vec2 overlaySize; uniform vec2 overlayOrigin;",
    vertexMain: "{ vec4 wp = modelMatrix * vec4(position, 1.0); vOverlayUv = vec2((wp.x - overlayOrigin.x) / overlaySize.x, 1.0 - (wp.z - overlayOrigin.y) / overlaySize.y); }",
    fragPars: "uniform sampler2D overlayMap; uniform sampler2D maskMap; varying vec2 vOverlayUv; float fWet; float fAo;",
    afterColor: `
      // A second, rotated, larger-scale sample breaks up the tiling.
      vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.27 + vec2(0.31, 0.17);
      vec3 macro = texture2D(map, uvB).rgb;
      diffuseColor.rgb = mix(diffuseColor.rgb, macro * diffuse, 0.4);
      vec4 mk = texture2D(maskMap, vOverlayUv);
      vec4 ov = texture2D(overlayMap, vOverlayUv);
      fWet = mk.g;
      fAo = mk.r;
      diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a);
      // Damp everywhere, darker where it's wet.
      diffuseColor.rgb *= mix(0.78, 0.3, fWet) * fAo;`,
    // Damp asphalt glints toward a low sun; standing water is a mirror.
    afterRoughness: "roughnessFactor = mix(roughnessFactor * 0.74, 0.09, smoothstep(0.5, 0.92, fWet));",
    afterNormal: "normal = normalize(mix(normal, nonPerturbedNormal, smoothstep(0.35, 0.75, fWet)));",
  });
  groundMat.envMapIntensity = 1.35;

  const decal = new MeshStandardMaterial({
    map: extras.logos,
    normalMap: pack.mats.container.normal,
    roughness: 0.62,
    metalness: 0.1,
    alphaTest: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // The logo uses uv; the ribs (normal map) use the container's uv, stored in uv1.
  if (pack.mats.container.normal) {
    decal.normalMap = pack.mats.container.normal.clone();
    decal.normalMap.channel = 1;
    decal.normalMap.needsUpdate = true;
  }

  const tarp = new MeshStandardMaterial({ vertexColors: true, normalMap: pack.fabric, roughness: 0.78, metalness: 0, side: DoubleSide });
  tarp.normalScale.set(0.6, 0.6);

  const fence = new MeshStandardMaterial({ map: extras.fence, alphaTest: 0.5, side: DoubleSide, roughness: 0.55, metalness: 0.7, color: new Color(0.75, 0.76, 0.78) });

  const all: Material[] = [container, painted, clean, concrete, planks, plate, cladding, groundMat, decal, tarp, fence];
  return { container, painted, clean, concrete, planks, plate, cladding, ground: groundMat, decal, tarp, fence, all };
}
