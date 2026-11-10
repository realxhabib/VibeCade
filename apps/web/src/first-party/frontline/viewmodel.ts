/**
 * The first-person weapon: its own small scene and camera, drawn over the
 * world after a depth clear so it never clips into walls. Guns are built in
 * code from rounded boxes and cylinders (receivers with ejection ports and
 * charging handles, rails, vented handguards, muzzle devices, curved
 * magazines, a red-dot optic whose dot glows through the glass), with
 * per-part metal/polymer PBR response and the scene's sky for reflections.
 * Gloved hands (knuckles, fingers, thumbs) and camo sleeves hold them.
 *
 * Motion is layered springs: walk bob, idle breathing, look sway (the gun
 * lags your aim), strafe tilt, aim-down-sights (the sight comes to the
 * center of the screen along a short arc), sprint carry, recoil (kick back,
 * muzzle climb and a little random roll, recovering on a spring), reload
 * (tilt, the magazine drops out and back in), swap drop, the grenade hold
 * (off hand up with the frag) and throw, and a muzzle flash with a light.
 */

import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { patchMaterial } from "./materials";
import { PRIMARIES, type WeaponId } from "./weapons";

const STANDARD: readonly WeaponId[] = [...PRIMARIES, "pistol"];
import type { Season } from "./options";
import { throwableParts } from "./throwables";

const _e = new Euler();
const _m4 = new Matrix4();
const _col = new Color();

interface GunModel {
  group: Group;
  /** Where the muzzle is, in the gun's frame. */
  muzzle: [number, number, number];
  /** Sight height above the gun origin (ADS brings it to the view center). */
  sightY: number;
  /** Magazine mesh (drops during reloads). */
  mag: Mesh | null;
  magY: number;
  /** How far ahead of the camera the gun sits when aimed. */
  adsZ: number;
}

const HIP: [number, number, number] = [0.14, -0.15, -0.42];

type V3 = [number, number, number];
const _ma = new Matrix4();
const _mb = new Matrix4();
const _va = new Vector3();
const _vb = new Vector3();
const _vc = new Vector3();
const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const apply = (m: Matrix4, p: V3): V3 => {
  _va.set(p[0], p[1], p[2]).applyMatrix4(m);
  return [_va.x, _va.y, _va.z];
};
/** The transform that lays a y-axis shape (cylinder, capsule) from `a` to `b`. A fresh matrix each call. */
function between(a: V3, b: V3): Matrix4 {
  _vb.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  _q.setFromUnitVectors(UP, _vb);
  return new Matrix4().makeRotationFromQuaternion(_q).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** Where the support hand holds each long gun (z along the barrel). */
const SUPPORT: Partial<Record<WeaponId, number>> = { rpg: -0.2, smg: -0.2, shotgun: -0.36, burst: -0.3, lmg: -0.38, dmr: -0.36, autoshot: -0.3 };

/**
 * Surface kinds → [roughness, metalness, look]. `look` picks the procedural
 * detail the shader adds (see `DETAIL`): 0 bare metal (brushed, bright worn
 * edges), 1 polymer (stippled), 2 glove leather, 3 camo cloth, 4 wood grain,
 * 5 none (glass).
 */
const SURF = {
  steel: [0.3, 0.92, 0],
  parkerized: [0.46, 0.4, 0],
  polymer: [0.58, 0.04, 1],
  glove: [0.72, 0.0, 2],
  sleeve: [0.92, 0.0, 3],
  glass: [0.05, 0.2, 5],
  wood: [0.55, 0.0, 4],
} as const;

/**
 * What makes boxes read as a machined rifle up close, all in the one
 * material's shader (no textures to download): a bump from 3D noise in the
 * gun's own space (stippled polymer, brushed steel, leather grain, a cloth
 * weave with folds), camo on the sleeves, grain in wood, and paint worn
 * bright along every bevelled edge (found from how fast the normal turns).
 */
const DETAIL = {
  vertexPars: "attribute vec3 rm; varying vec3 vRm; varying vec3 vObj;",
  vertexMain: "vRm = rm; vObj = position;",
  fragPars: /* glsl */ `
    varying vec3 vRm; varying vec3 vObj;
    float flH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float flN3(vec3 x) {
      vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(flH3(i), flH3(i + vec3(1, 0, 0)), f.x), mix(flH3(i + vec3(0, 1, 0)), flH3(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(flH3(i + vec3(0, 0, 1)), flH3(i + vec3(1, 0, 1)), f.x), mix(flH3(i + vec3(0, 1, 1)), flH3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float flHeight; float flWear;
    vec3 flBump(vec3 pos, vec3 n, float h) {
      vec3 sx = dFdx(pos); vec3 sy = dFdy(pos);
      vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
      float det = dot(sx, r1);
      vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
      return normalize(abs(det) * n - grad);
    }`,
  afterColor: /* glsl */ `
    {
      float look = floor(vRm.z + 0.5);
      vec3 p = vObj;
      flHeight = 0.0; flWear = 0.0;
      // How sharply the surface turns here (1/m): high on bevels and corners.
      float curv = length(fwidth(normalize(vNormal))) / max(length(fwidth(vViewPosition)), 1e-5);
      float patchy = flN3(p * 90.0);
      if (look < 0.5) {
        float brushed = flN3(p * vec3(1500.0, 1500.0, 60.0));
        flHeight = brushed * 0.00006;
        flWear = smoothstep(90.0, 260.0, curv) * (0.2 + 0.8 * patchy * patchy);
        diffuseColor.rgb *= 0.9 + 0.2 * flN3(p * 45.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.4), flWear * 0.55);
      } else if (look < 1.5) {
        float stipple = flN3(p * 850.0);
        flHeight = stipple * 0.00022;
        flWear = smoothstep(60.0, 220.0, curv) * patchy * 0.5;
        diffuseColor.rgb *= 0.88 + 0.24 * flN3(p * 30.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.9 + 0.03, flWear);
      } else if (look < 2.5) {
        float grain = flN3(p * 520.0) * 0.6 + flN3(p * 1300.0) * 0.4;
        flHeight = grain * 0.0003 + flN3(p * 70.0) * 0.0006;
        diffuseColor.rgb *= 0.8 + 0.4 * grain;
        flWear = smoothstep(80.0, 200.0, curv) * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5, flWear);
      } else if (look < 3.5) {
        // Camo: three earth tones in soft blotches, over a weave with folds.
        float a = flN3(p * 13.0 + 3.7) * 0.65 + flN3(p * 31.0) * 0.35;
        float b = flN3(p * 17.0 + 11.3);
        vec3 camo = mix(vec3(0.028, 0.034, 0.03), vec3(0.06, 0.058, 0.045), smoothstep(0.42, 0.5, a));
        camo = mix(camo, vec3(0.012, 0.014, 0.014), smoothstep(0.55, 0.62, b));
        float weave = sin(p.x * 2600.0) * sin(p.z * 2600.0 + p.y * 2600.0);
        diffuseColor.rgb = camo * (0.9 + 0.1 * weave);
        flHeight = weave * 0.00008 + flN3(p * vec3(60.0, 60.0, 14.0)) * 0.0022;
      } else if (look < 4.5) {
        float grain = flN3(vec3(p.x * 160.0, p.y * 160.0, p.z * 9.0));
        float rings = sin((p.y + grain * 0.02) * 420.0);
        diffuseColor.rgb *= 0.72 + 0.3 * grain + 0.1 * rings;
        flHeight = grain * 0.00012;
      }
    }`,
  afterRoughness: /* glsl */ `
    roughnessFactor = vRm.x; metalnessFactor = vRm.y;
    {
      float look = floor(vRm.z + 0.5);
      if (look < 0.5) { roughnessFactor = mix(roughnessFactor + 0.12 * (flN3(vObj * 70.0) - 0.5), 0.22, flWear); metalnessFactor = mix(metalnessFactor, 1.0, flWear); }
      else if (look < 1.5) roughnessFactor = mix(roughnessFactor + 0.1 * (flN3(vObj * 40.0) - 0.5), 0.38, flWear);
      else if (look < 2.5) roughnessFactor -= 0.18 * flWear;
    }`,
  afterNormal: "normal = flBump(-vViewPosition, normal, flHeight);",
};
type Surf = keyof typeof SURF;

export class ViewModel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(54, 1, 0.01, 10);
  private readonly root = new Group();
  private readonly guns = new Map<WeaponId, GunModel>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private current: WeaponId | null = null;
  private readonly flash: Mesh;
  private readonly flashLight: PointLight;
  private flashUntil = 0;
  /** The off hand with a frag (grenade hold and throw). */
  private readonly nadeArm = new Group();
  private nadeHold = 0;
  private throwAt = -1e9;
  /** The knife's last swing (and which way it went: they alternate). */
  private slashAt = -1e9;
  private slashSide = 1;
  // Springs.
  private swayX = 0;
  private swayY = 0;
  private swayVX = 0;
  private swayVY = 0;
  private kick = 0;
  private kickV = 0;
  private kickRot = 0;
  private kickRotV = 0;
  private roll = 0;
  private rollV = 0;
  private sprint = 0;
  private tilt = 0;
  private bobT = 0;
  private readonly shared: MeshStandardMaterial | MeshLambertMaterial;
  private readonly hemi = new HemisphereLight(0xdfe9ff, 0x6b5a45, 1.0);
  private readonly sun = new DirectionalLight(0xffe2c0, 2.2);
  private sunLevel = 1;
  private sunBase = 2.2;

  /**
   * Lights the weapon like the world around it: the sun from where it really
   * is relative to the view (`dir`, camera space: a rim along the top when you
   * face it, full on the side when it's behind you), in the world's colors,
   * dimmed when you stand in shade (`lit` 0…1, eased here).
   */
  setLight(dir: { x: number; y: number; z: number }, lit: number, dt: number): void {
    this.sun.position.set(dir.x, dir.y, dir.z);
    this.sunLevel += (lit - this.sunLevel) * Math.min(1, dt * 7);
    this.sun.intensity = this.sunBase * (0.12 + 0.88 * this.sunLevel);
    if ("envMapIntensity" in this.shared) this.shared.envMapIntensity = 0.75 + 0.35 * this.sunLevel;
  }

  /** The world's light colors (after the season's tint). */
  setLightColors(sun: Color, sunIntensity: number, sky: Color, ground: Color, hemiIntensity: number): void {
    this.sun.color.copy(sun);
    this.sunBase = sunIntensity;
    this.hemi.color.copy(sky);
    this.hemi.groundColor.copy(ground);
    this.hemi.intensity = hemiIntensity;
  }

  /** `detail` false (low tier): plain boxes, no rail teeth / fingers / glass, Lambert shading. */
  constructor(
    flashTex: Texture,
    private readonly detail = true,
    private readonly season: Season | null = null,
  ) {
    this.scene.add(this.hemi);
    this.scene.add(new AmbientLight(0xffffff, detail ? 0.2 : 0.45));
    this.sun.position.set(0.6, 1, 0.4);
    this.scene.add(this.sun);
    this.flashLight = new PointLight(0xffb060, 0, 2.5, 2);
    this.flashLight.position.set(0, -0.05, -0.8);
    this.scene.add(this.flashLight);
    this.scene.add(this.root);
    // One material for guns and hands: vertex colors + per-vertex roughness/metalness.
    if (detail) {
      this.shared = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 0.9 });
      patchMaterial(this.shared, { key: "fl-vm2", ...DETAIL });
    } else {
      this.shared = new MeshLambertMaterial({ vertexColors: true });
    }
    this.materials.push(this.shared);
    const flashMat = new MeshBasicMaterial({ map: flashTex, blending: AdditiveBlending, transparent: true, depthWrite: false, color: new Color(2.6, 2.1, 1.5) });
    this.materials.push(flashMat);
    const flashGeo = new PlaneGeometry(0.22, 0.22);
    this.geometries.push(flashGeo);
    this.flash = new Mesh(flashGeo, flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 5;
    this.root.add(this.flash);
    // The standard loadout's guns up front; the gun game's others when `prepare` asks (or on first use).
    for (const id of STANDARD) this.gun(id);
    this.buildNadeArm();
    this.scene.add(this.nadeArm);
  }

  /* -------------------------------------------------------------------- */
  /* Building                                                             */
  /* -------------------------------------------------------------------- */

  /** Colors and surface attributes on a geometry placed at (x, y, z) with rotation (rx, ry, rz). */
  private place(geo: BufferGeometry, color: number, surf: Surf, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    _e.set(rx, ry, rz);
    _m4.makeRotationFromEuler(_e);
    _m4.setPosition(x, y, z);
    g.applyMatrix4(_m4);
    _col.setHex(color);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const rm = new Float32Array(n * 3);
    const [r, m, look] = SURF[surf];
    for (let i = 0; i < n; i++) {
      col[i * 3] = _col.r;
      col[i * 3 + 1] = _col.g;
      col[i * 3 + 2] = _col.b;
      rm[i * 3] = r;
      rm[i * 3 + 1] = m;
      rm[i * 3 + 2] = look;
    }
    g.setAttribute("color", new BufferAttribute(col, 3));
    g.setAttribute("rm", new BufferAttribute(rm, 3));
    return g;
  }

  private placeM(geo: BufferGeometry, color: number, surf: Surf, m: Matrix4): BufferGeometry {
    const g = this.place(geo, color, surf, 0, 0, 0);
    g.applyMatrix4(m);
    return g;
  }

  private build(id: WeaponId): GunModel {
    const g = new Group();
    const black = 0x2e2f33;
    const dark = 0x404247;
    const steel = 0x46494e;
    const accent =
      id === "sniper" || id === "dmr" ? 0x5e5340 : id === "shotgun" || id === "magnum" ? 0x5a3b22 : id === "smg" || id === "mp" ? 0x25272b : id === "lmg" ? 0x3a3f30 : id === "burst" ? 0x4a4d52 : id === "autoshot" ? 0x30343a : 0x26282c;
    const glove = 0x4d473c;
    const sleeve = 0x3b4230;
    const parts: BufferGeometry[] = [];
    const detail = this.detail;
    const rbox = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, surf: Surf, rx = 0, rad = 0.004) =>
      parts.push(this.place(detail ? new RoundedBoxGeometry(w, h, d, 2, Math.min(rad, w / 2.2, h / 2.2, d / 2.2)) : new BoxGeometry(w, h, d), color, surf, x, y, z, rx));
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, surf: Surf, rx = 0) => parts.push(this.place(new BoxGeometry(w, h, d), color, surf, x, y, z, rx));
    const cyl = (r: number, len: number, x: number, y: number, z: number, color: number, surf: Surf, seg = detail ? 20 : 10, r2 = r) => parts.push(this.place(new CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2), color, surf, x, y, z));
    const rail = (z0: number, z1: number, y: number) => {
      box(0.022, 0.007, z1 - z0, 0, y, (z0 + z1) / 2, black, "parkerized");
      if (detail) for (let z = z0 + 0.006; z < z1; z += 0.01) box(0.026, 0.005, 0.005, 0, y + 0.006, z, black, "parkerized");
    };
    const magBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, curve = 0): Mesh => {
      const segs: BufferGeometry[] = [];
      const n = curve ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        segs.push(this.place(detail ? new RoundedBoxGeometry(w, h / n + 0.002, d, 1, 0.003) : new BoxGeometry(w, h / n + 0.002, d), color, "polymer", 0, h / 2 - t * h, t * t * curve, rx + curve * t * 1.5));
      }
      const geo = mergeGeometries(segs)!;
      segs.forEach((s) => s.dispose());
      this.geometries.push(geo);
      const m = new Mesh(geo, this.shared);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    /** A pin or screw head showing on both sides of a `w`-wide body. */
    const pin = (y: number, z: number, w: number, r = 0.0035) => {
      if (detail) parts.push(this.place(new CylinderGeometry(r, r, w + 0.003, 10).rotateZ(Math.PI / 2), steel, "steel", 0, y, z));
    };
    /** Lightening slots down both sides (and the bottom) of a `w`-wide handguard. */
    const slots = (z0: number, z1: number, y: number, w: number, step = 0.042) => {
      if (!detail) return;
      for (let z = z0; z < z1 - 0.01; z += step) {
        rbox(w + 0.002, 0.009, 0.028, 0, y, z + 0.014, 0x0c0d0e, "polymer", 0, 0.004);
        rbox(0.009, w + 0.002, 0.028, 0, y, z + 0.014, 0x0c0d0e, "polymer", 0, 0.004);
      }
    };
    /** Trigger blade inside the guard. */
    const trigger = (y: number, z: number) => {
      if (detail) rbox(0.006, 0.022, 0.006, 0, y, z, steel, "steel", -0.3, 0.002);
    };
    /** A muzzle brake: a fat collar with dark ports cut across it. */
    const brake = (y: number, z: number, r = 0.015, len = 0.055) => {
      cyl(r, len, 0, y, z, black, "parkerized", 14);
      if (detail) for (let k = -1; k <= 1; k++) box(r * 2 + 0.002, r * 0.7, 0.006, 0, y, z + k * 0.014, 0x08090a, "polymer");
    };
    let mag: Mesh | null = null;
    let magY = 0;
    let muzzle: [number, number, number] = [0, 0.02, -0.6];
    let sightY = 0.07;
    let adsZ = -0.22;
    const rear = (y0: number, top: number, z: number, gap = 0.011) => {
      box(0.007, top - y0, 0.012, -gap, (y0 + top) / 2, z, black, "parkerized");
      box(0.007, top - y0, 0.012, gap, (y0 + top) / 2, z, black, "parkerized");
    };
    const front = (y0: number, top: number, z: number) => box(0.005, top - y0, 0.008, 0, (y0 + top) / 2, z, black, "parkerized");
    /** Red-dot sight at height `y` (dot center), `z` its center. */
    const redDot = (y: number, z: number) => {
      rbox(0.036, 0.03, 0.07, 0, y - 0.034, z, black, "parkerized", 0, 0.005);
      rbox(0.044, 0.012, 0.03, 0, y - 0.05, z, black, "parkerized", 0, 0.003); // clamp
      pin(y - 0.05, z, 0.046, 0.005);
      if (detail) parts.push(this.place(new CylinderGeometry(0.007, 0.007, 0.012, 10), steel, "steel", 0.012, y - 0.014, z + 0.02)); // brightness dial
      // Hood: two posts and a top bar, glass between.
      rbox(0.006, 0.042, 0.05, -0.021, y - 0.002, z, black, "parkerized", 0, 0.002);
      rbox(0.006, 0.042, 0.05, 0.021, y - 0.002, z, black, "parkerized", 0, 0.002);
      rbox(0.048, 0.007, 0.05, 0, y + 0.021, z, black, "parkerized", 0, 0.002);
    };
    let dotAt: [number, number] | null = null;
    if (id === "ar") {
      rbox(0.05, 0.062, 0.3, 0, 0.003, -0.09, dark, "parkerized", 0, 0.006); // upper receiver
      rbox(0.046, 0.05, 0.2, 0, -0.045, -0.04, dark, "parkerized", 0, 0.006); // lower
      rbox(0.05, 0.06, 0.07, 0, -0.05, -0.12, dark, "parkerized", 0, 0.007); // magazine well
      rbox(0.004, 0.02, 0.055, 0.025, 0.006, -0.08, 0x0c0d0e, "polymer", 0, 0.002); // ejection port
      rbox(0.005, 0.012, 0.06, 0.027, -0.008, -0.08, dark, "parkerized", 0, 0.002); // dust cover, open
      rbox(0.014, 0.014, 0.02, 0.027, 0.002, -0.005, dark, "parkerized", 0, 0.004); // forward assist
      rbox(0.03, 0.01, 0.03, 0, 0.03, 0.052, black, "parkerized", 0, 0.003); // charging handle
      rbox(0.004, 0.018, 0.012, -0.025, -0.022, -0.085, steel, "steel", 0, 0.002); // bolt catch
      pin(-0.03, -0.165, 0.046);
      pin(-0.028, 0.035, 0.046);
      pin(-0.05, -0.012, 0.046, 0.0028);
      if (detail) parts.push(this.place(new CylinderGeometry(0.006, 0.006, 0.052, 10).rotateZ(Math.PI / 2), steel, "steel", 0, -0.03, 0.012)); // selector
      rbox(0.052, 0.054, 0.25, 0, 0.004, -0.36, accent, "parkerized", 0, 0.014); // handguard
      slots(-0.47, -0.25, 0.004, 0.052);
      rail(-0.22, 0.03, 0.037);
      rail(-0.48, -0.25, 0.034);
      cyl(0.0095, 0.16, 0, 0.008, -0.55, black, "steel");
      cyl(0.013, 0.02, 0, 0.008, -0.492, black, "parkerized", 12); // gas block
      brake(0.008, -0.635);
      cyl(0.015, 0.16, 0, -0.004, 0.14, black, "parkerized", 14); // buffer tube
      rbox(0.04, 0.05, 0.11, 0, -0.012, 0.16, accent, "polymer", 0, 0.012); // stock body
      rbox(0.036, 0.085, 0.03, 0, -0.03, 0.215, accent, "polymer", 0.1, 0.01); // butt
      rbox(0.03, 0.012, 0.09, 0, 0.022, 0.15, accent, "polymer", 0, 0.005); // cheek rest
      rbox(0.036, 0.078, 0.044, 0, -0.082, 0.032, black, "polymer", 0.28, 0.01); // grip
      if (detail) for (let k = 0; k < 4; k++) rbox(0.038, 0.004, 0.03, 0, -0.062 - k * 0.012, 0.043 + k * 0.0035, 0x0c0d0e, "polymer", 0.28, 0.001); // grip grooves
      rbox(0.008, 0.005, 0.06, 0, -0.082, -0.022, black, "parkerized", 0, 0.002); // trigger guard
      trigger(-0.062, -0.018);
      mag = magBox(0.03, 0.14, 0.058, 0, -0.105, -0.12, 0x2c2e31, -0.12, 0.03);
      magY = -0.105;
      sightY = 0.09;
      redDot(sightY, -0.07);
      dotAt = [sightY, -0.07];
      rbox(0.012, 0.03, 0.014, 0, 0.052, -0.46, black, "parkerized", 0, 0.003); // folded front sight
      muzzle = [0, 0.008, -0.67];
      adsZ = -0.26;
    } else if (id === "smg") {
      rbox(0.052, 0.07, 0.26, 0, 0, -0.07, dark, "parkerized");
      box(0.003, 0.02, 0.045, 0.027, 0.008, -0.07, black, "steel");
      rbox(0.056, 0.05, 0.12, 0, -0.004, -0.23, accent, "polymer", 0, 0.01);
      rail(-0.19, 0.04, 0.037);
      cyl(0.012, 0.09, 0, 0.01, -0.33, black, "steel");
      cyl(0.02, 0.1, 0, 0.01, -0.36, black, "parkerized", 12); // suppressor-ish can
      box(0.02, 0.02, 0.14, 0, -0.01, 0.1, steel, "steel"); // folding stock arm
      rbox(0.035, 0.09, 0.05, 0, -0.075, 0.0, accent, "polymer", 0.2, 0.008);
      mag = magBox(0.028, 0.17, 0.045, 0, -0.12, -0.12, black);
      magY = -0.12;
      sightY = 0.088;
      redDot(sightY, -0.05);
      dotAt = [sightY, -0.05];
      muzzle = [0, 0.01, -0.42];
      adsZ = -0.26;
    } else if (id === "sniper") {
      rbox(0.05, 0.07, 0.4, 0, 0, -0.08, accent, "polymer", 0, 0.012);
      rbox(0.042, 0.06, 0.2, 0, -0.01, 0.2, accent, "polymer", 0, 0.012); // stock
      rbox(0.03, 0.03, 0.1, 0, 0.035, 0.26, accent, "polymer", 0, 0.01); // cheek rest
      cyl(0.012, 0.44, 0, 0.012, -0.5, black, "steel");
      cyl(0.018, 0.07, 0, 0.012, -0.74, black, "parkerized", 8);
      rbox(0.035, 0.08, 0.05, 0, -0.07, 0.04, accent, "polymer", 0.25);
      mag = magBox(0.035, 0.06, 0.07, 0, -0.06, -0.08, black);
      magY = -0.06;
      cyl(0.022, 0.26, 0, 0.078, -0.1, black, "parkerized", 18);
      cyl(0.03, 0.05, 0, 0.078, -0.25, black, "parkerized", 18, 0.024);
      cyl(0.027, 0.04, 0, 0.078, 0.04, black, "parkerized", 18);
      box(0.012, 0.03, 0.02, 0.028, 0.08, -0.1, black, "parkerized"); // turret
      box(0.012, 0.03, 0.02, 0, 0.105, -0.1, black, "parkerized");
      box(0.03, 0.012, 0.02, 0.035, 0.02, 0.02, steel, "steel"); // bolt handle
      muzzle = [0, 0.012, -0.78];
      sightY = 0.078;
      adsZ = -0.16;
    } else if (id === "shotgun") {
      rbox(0.052, 0.07, 0.3, 0, 0, -0.06, dark, "parkerized");
      cyl(0.015, 0.46, 0, 0.018, -0.42, black, "steel");
      cyl(0.013, 0.4, 0, -0.014, -0.4, dark, "steel");
      mag = magBox(0.056, 0.05, 0.15, 0, -0.018, -0.36, accent); // pump
      if (detail) for (let z = -0.42; z < -0.3; z += 0.02) box(0.06, 0.005, 0.008, 0, -0.018, z, black, "polymer");
      magY = -0.018;
      rbox(0.045, 0.07, 0.16, 0, -0.03, 0.15, accent, "wood", 0.1, 0.012);
      rbox(0.035, 0.08, 0.05, 0, -0.07, 0.05, accent, "wood", 0.25);
      rear(0.035, 0.056, 0.02, 0.01);
      front(0.033, 0.05, -0.62);
      muzzle = [0, 0.018, -0.66];
      sightY = 0.05;
      adsZ = -0.3;
    } else if (id === "lmg") {
      rbox(0.064, 0.074, 0.34, 0, 0.004, -0.08, dark, "parkerized"); // receiver
      box(0.003, 0.02, 0.06, 0.033, 0.01, -0.06, black, "steel"); // ejection port
      rbox(0.07, 0.024, 0.16, 0, 0.05, -0.1, accent, "parkerized", 0, 0.006); // feed cover
      rbox(0.012, 0.03, 0.09, 0, 0.085, -0.16, black, "parkerized", 0, 0.004); // carry handle
      rbox(0.062, 0.062, 0.2, 0, 0.004, -0.36, accent, "polymer", 0, 0.012); // handguard
      if (detail) for (let z = -0.44; z < -0.28; z += 0.035) box(0.066, 0.014, 0.012, 0, 0.004, z, black, "polymer");
      cyl(0.013, 0.24, 0, 0.008, -0.56, black, "steel");
      cyl(0.019, 0.05, 0, 0.008, -0.69, black, "steel", 8);
      box(0.008, 0.008, 0.16, -0.012, -0.03, -0.5, black, "steel"); // folded bipod
      box(0.008, 0.008, 0.16, 0.012, -0.03, -0.5, black, "steel");
      rbox(0.046, 0.06, 0.15, 0, -0.016, 0.14, accent, "polymer", 0, 0.01); // stock
      rbox(0.036, 0.075, 0.045, 0, -0.08, 0.03, black, "polymer", 0.28, 0.008); // grip
      box(0.006, 0.02, 0.05, 0, -0.07, -0.02, black, "parkerized");
      mag = magBox(0.07, 0.09, 0.11, 0.004, -0.08, -0.13, 0x3d4430); // box magazine
      magY = -0.08;
      rail(-0.06, 0.04, 0.042);
      sightY = 0.098;
      redDot(sightY, -0.01);
      dotAt = [sightY, -0.01];
      muzzle = [0, 0.008, -0.72];
      adsZ = -0.27;
    } else if (id === "burst") {
      // Bullpup: the magazine sits behind the grip, the receiver runs back into the stock.
      rbox(0.056, 0.07, 0.46, 0, 0, -0.06, accent, "polymer", 0, 0.014);
      box(0.003, 0.02, 0.05, 0.029, 0.01, 0.05, black, "steel");
      rbox(0.05, 0.03, 0.12, 0, 0.045, -0.12, accent, "polymer", 0, 0.01); // top shroud
      cyl(0.012, 0.14, 0, 0.008, -0.36, black, "steel");
      cyl(0.017, 0.045, 0, 0.008, -0.45, black, "steel", 8);
      rbox(0.036, 0.075, 0.045, 0, -0.08, -0.11, black, "polymer", 0.28, 0.008); // grip forward of the mag
      box(0.006, 0.02, 0.05, 0, -0.07, -0.15, black, "parkerized");
      mag = magBox(0.03, 0.12, 0.055, 0, -0.09, 0.03, dark, -0.1, 0.02);
      magY = -0.09;
      rail(-0.2, 0.0, 0.062);
      sightY = 0.1;
      redDot(sightY, -0.1);
      dotAt = [sightY, -0.1];
      muzzle = [0, 0.008, -0.48];
      adsZ = -0.24;
    } else if (id === "dmr") {
      rbox(0.05, 0.064, 0.3, 0, 0.003, -0.09, dark, "parkerized");
      rbox(0.046, 0.05, 0.2, 0, -0.045, -0.04, dark, "parkerized");
      box(0.003, 0.018, 0.05, 0.026, 0.008, -0.08, black, "steel");
      rbox(0.054, 0.054, 0.28, 0, 0.004, -0.38, accent, "polymer", 0, 0.012); // long handguard
      if (detail) for (let z = -0.5; z < -0.28; z += 0.04) box(0.058, 0.012, 0.016, 0, 0.004, z, black, "polymer");
      cyl(0.011, 0.2, 0, 0.008, -0.6, black, "steel");
      cyl(0.017, 0.06, 0, 0.008, -0.72, black, "steel", 8);
      rbox(0.04, 0.06, 0.16, 0, -0.012, 0.15, accent, "polymer", 0, 0.01); // stock
      rbox(0.03, 0.025, 0.08, 0, 0.032, 0.17, accent, "polymer", 0, 0.008); // cheek riser
      rbox(0.036, 0.075, 0.045, 0, -0.08, 0.03, black, "polymer", 0.28, 0.008);
      box(0.006, 0.02, 0.05, 0, -0.07, -0.02, black, "parkerized");
      mag = magBox(0.03, 0.08, 0.06, 0, -0.08, -0.12, dark, -0.05);
      magY = -0.08;
      rail(-0.22, 0.03, 0.037);
      // A short scope: tube, bells and two rings.
      cyl(0.019, 0.2, 0, 0.076, -0.08, black, "parkerized", 18);
      cyl(0.026, 0.05, 0, 0.076, -0.2, black, "parkerized", 18, 0.02);
      cyl(0.024, 0.04, 0, 0.076, 0.03, black, "parkerized", 18);
      box(0.014, 0.035, 0.016, 0, 0.055, -0.13, black, "parkerized");
      box(0.014, 0.035, 0.016, 0, 0.055, -0.02, black, "parkerized");
      muzzle = [0, 0.008, -0.76];
      sightY = 0.076;
      adsZ = -0.18;
    } else if (id === "autoshot") {
      rbox(0.058, 0.078, 0.32, 0, 0, -0.07, accent, "polymer", 0, 0.012);
      box(0.003, 0.022, 0.05, 0.03, 0.01, -0.06, black, "steel");
      rbox(0.06, 0.05, 0.16, 0, -0.004, -0.3, dark, "polymer", 0, 0.012); // handguard
      cyl(0.017, 0.26, 0, 0.016, -0.42, black, "steel");
      cyl(0.022, 0.05, 0, 0.016, -0.56, black, "steel", 8);
      rbox(0.046, 0.06, 0.15, 0, -0.02, 0.15, accent, "polymer", 0.05, 0.012);
      rbox(0.036, 0.08, 0.05, 0, -0.08, 0.03, black, "polymer", 0.28, 0.008);
      box(0.006, 0.02, 0.05, 0, -0.07, -0.02, black, "parkerized");
      mag = magBox(0.05, 0.1, 0.1, 0, -0.09, -0.13, black); // drum
      magY = -0.09;
      rail(-0.2, 0.0, 0.042);
      sightY = 0.096;
      redDot(sightY, -0.08);
      dotAt = [sightY, -0.08];
      muzzle = [0, 0.016, -0.6];
      adsZ = -0.27;
    } else if (id === "mp") {
      rbox(0.036, 0.034, 0.2, 0, 0.026, -0.065, dark, "parkerized", 0, 0.004); // slide
      rbox(0.033, 0.032, 0.18, 0, -0.006, -0.055, black, "polymer", 0, 0.004);
      cyl(0.011, 0.05, 0, 0.026, -0.185, black, "steel", 10); // compensator
      box(0.012, 0.012, 0.06, 0, 0.0, 0.05, steel, "steel"); // stub stock
      box(0.006, 0.018, 0.04, 0, -0.03, -0.04, black, "polymer");
      mag = magBox(0.028, 0.2, 0.05, 0, -0.1, 0.012, black, 0.25); // long magazine
      magY = -0.1;
      rear(0.044, 0.06, 0.02, 0.008);
      front(0.044, 0.056, -0.15);
      muzzle = [0, 0.026, -0.215];
      sightY = 0.056;
      adsZ = -0.33;
    } else if (id === "magnum") {
      cyl(0.013, 0.2, 0, 0.032, -0.16, steel, "steel", 12); // barrel
      rbox(0.022, 0.016, 0.2, 0, 0.048, -0.16, steel, "steel", 0, 0.004); // top rib
      cyl(0.024, 0.06, 0, 0.022, -0.035, steel, "steel", 6); // frame around the cylinder
      rbox(0.03, 0.05, 0.06, 0, 0.022, 0.015, steel, "steel", 0, 0.006);
      box(0.008, 0.016, 0.014, 0, 0.06, 0.04, black, "steel"); // hammer
      rbox(0.032, 0.095, 0.05, 0, -0.035, 0.05, accent, "wood", 0.3, 0.01); // grip
      box(0.006, 0.018, 0.04, 0, -0.012, -0.01, black, "steel");
      mag = magBox(0.044, 0.044, 0.05, 0, 0.022, -0.035, dark); // the cylinder swings out to reload
      magY = 0.022;
      rear(0.052, 0.064, 0.03, 0.008);
      front(0.052, 0.066, -0.25);
      muzzle = [0, 0.032, -0.27];
      sightY = 0.064;
      adsZ = -0.34;
    } else if (id === "rpg") {
      // A launch tube over the shoulder; the warhead out front comes off during a reload.
      cyl(0.042, 0.78, 0, 0.03, -0.12, 0x4f5640, "polymer", 16);
      cyl(0.05, 0.06, 0, 0.03, 0.27, black, "parkerized", 16, 0.044); // rear flare
      cyl(0.046, 0.04, 0, 0.03, -0.5, black, "parkerized", 16); // muzzle ring
      rbox(0.034, 0.08, 0.045, 0, -0.045, 0.03, black, "polymer", 0.28, 0.008); // grip
      rbox(0.03, 0.07, 0.04, 0, -0.04, -0.2, black, "polymer", 0.15, 0.008); // front grip
      box(0.006, 0.02, 0.05, 0, -0.03, -0.02, black, "parkerized"); // trigger guard
      // Iron sights on top of the tube.
      rear(0.07, 0.1, -0.02, 0.012);
      front(0.07, 0.1, -0.4);
      const warhead: BufferGeometry[] = [
        this.place(new CylinderGeometry(0.02, 0.045, 0.1, 14).rotateX(-Math.PI / 2), 0x6b6d5c, "parkerized", 0, 0, 0),
        this.place(new CylinderGeometry(0.003, 0.02, 0.08, 14).rotateX(-Math.PI / 2), 0x6b6d5c, "parkerized", 0, 0, -0.09),
      ];
      const wg = mergeGeometries(warhead)!;
      warhead.forEach((p) => p.dispose());
      this.geometries.push(wg);
      mag = new Mesh(wg, this.shared);
      mag.position.set(0, 0.03, -0.57);
      g.add(mag);
      magY = 0.03;
      muzzle = [0, 0.03, -0.66];
      sightY = 0.1;
      adsZ = -0.2;
    } else if (id === "knife") {
      // Handle in the fist, blade forward and a little up.
      rbox(0.026, 0.032, 0.1, 0, -0.03, 0.0, 0x2a2622, "polymer", 0.35, 0.008);
      box(0.05, 0.012, 0.012, 0, -0.012, -0.055, steel, "steel", 0.35); // guard
      box(0.006, 0.034, 0.17, 0, 0.022, -0.14, 0xb9bec4, "steel", 0.35); // blade
      box(0.004, 0.012, 0.05, 0, 0.052, -0.215, 0xd8dde2, "steel", 0.62); // tip
      muzzle = [0, 0.05, -0.22];
      sightY = 0.04;
      adsZ = -0.4;
    } else {
      rbox(0.034, 0.03, 0.19, 0, 0.026, -0.06, dark, "parkerized", 0, 0.004); // slide
      if (detail) for (let z = 0.0; z < 0.03; z += 0.007) box(0.036, 0.022, 0.003, 0, 0.026, z, black, "parkerized"); // serrations
      rbox(0.031, 0.03, 0.17, 0, -0.004, -0.05, black, "polymer", 0, 0.004); // frame
      cyl(0.006, 0.01, 0, 0.03, -0.155, black, "steel", 8);
      box(0.006, 0.018, 0.04, 0, -0.03, -0.035, black, "polymer"); // trigger guard
      mag = magBox(0.028, 0.11, 0.05, 0, -0.07, 0.01, black, 0.25);
      magY = -0.07;
      rear(0.042, 0.058, 0.02, 0.008);
      front(0.042, 0.054, -0.145);
      muzzle = [0, 0.03, -0.17];
      sightY = 0.054;
      adsZ = -0.34;
    }
    // Hands: the trigger hand on the grip, the support hand forward (pistol: both on the grip).
    const lite = (x: number, y: number, z: number, rx: number, ry: number) => {
      parts.push(this.place(new BoxGeometry(0.06, 0.06, 0.1), glove, "glove", x, y, z, rx, ry));
      parts.push(this.place(new BoxGeometry(0.075, 0.075, 0.3), sleeve, "sleeve", x + Math.sin(ry) * 0.18, y - 0.06, z + 0.2, rx - 0.35, ry));
    };
    /**
     * A gloved hand wrapped around something, built in the hand's own frame
     * (the thing it holds runs along +y through the origin; the palm is on
     * +x, the fingers cross in front at −z and come back on −x) and put in
     * the gun's frame by `m`. `gx` / `gz` are how far out the palm and the fingers sit (a handguard is fatter
     * than a pistol grip). The forearm runs from the wrist to `elbow` (gun
     * frame), which is out of view below the screen.
     */
    const hand = (m: Matrix4, gx: number, gz: number, wrist: V3, elbow: V3) => {
      const tan = 0x2a2b2e;
      const pad = 0x17181a;
      const seg = (a: V3, b: V3, r: number, color: number, surf: Surf) => {
        const g = new CapsuleGeometry(r, Math.max(0.0005, dist(a, b)), 3, 8);
        parts.push(this.placeM(g, color, surf, _mb.multiplyMatrices(m, between(a, b))));
      };
      const blk = (w: number, h: number, d: number, at: V3, rad: number, color: number, surf: Surf) =>
        parts.push(this.placeM(new RoundedBoxGeometry(w, h, d, 2, rad), color, surf, _mb.multiplyMatrices(m, _ma.makeTranslation(at[0], at[1], at[2]))));
      // Palm behind the grip, a tan back-of-hand panel, a hard knuckle guard.
      blk(0.03, 0.086, 0.052 + gz * 0.3, [gx + 0.006, 0, 0.012], 0.012, glove, "glove");
      blk(0.012, 0.07, 0.05, [gx + 0.021, 0.002, 0.012], 0.005, tan, "glove");
      blk(0.014, 0.074, 0.016, [gx + 0.012, 0.0, -gz + 0.006], 0.005, pad, "polymer");
      // Four fingers: along the palm side, across the front, back along the far side.
      for (let i = 0; i < 4; i++) {
        const y = 0.031 - i * 0.0205;
        const r = i === 3 ? 0.0085 : 0.0098;
        const reach = i === 0 || i === 3 ? 0.9 : 1;
        seg([gx + 0.004, y, 0.0], [gx - 0.002, y, -gz], r, glove, "glove");
        seg([gx - 0.002, y, -gz], [-gx - 0.002, y, -gz - 0.002], r, glove, "glove");
        seg([-gx - 0.002, y, -gz - 0.002], [-gx - 0.004, y - 0.002, -gz + 0.03 * reach], r * 0.95, glove, "glove");
        // A paler pad on each fingertip.
        seg([-gx - 0.006, y - 0.002, -gz + 0.016 * reach], [-gx - 0.006, y - 0.002, -gz + 0.028 * reach], r * 0.8, tan, "glove");
      }
      // Thumb over the top and forward along the far side.
      seg([gx + 0.004, 0.05, 0.026], [-gx + 0.002, 0.056, 0.012], 0.0112, glove, "glove");
      seg([-gx + 0.002, 0.056, 0.012], [-gx - 0.004, 0.05, -0.022], 0.0102, glove, "glove");
      // Wrist: cuff with a strap, then the sleeve to the elbow.
      const w = apply(m, wrist);
      const dir = norm(sub(elbow, w));
      const at = (t: number): V3 => [w[0] + dir[0] * t, w[1] + dir[1] * t, w[2] + dir[2] * t];
      const tube = (t0: number, t1: number, r0: number, r1: number, color: number, surf: Surf) =>
        parts.push(this.placeM(new CylinderGeometry(r1, r0, t1 - t0, 14, 1), color, surf, _mb.copy(between(at(t0), at(t1)))));
      tube(-0.02, 0.045, 0.031, 0.034, glove, "glove");
      tube(0.012, 0.03, 0.0365, 0.0365, pad, "polymer");
      tube(0.04, 0.075, 0.041, 0.043, sleeve, "sleeve");
      tube(0.07, dist(elbow, w), 0.039, 0.055, sleeve, "sleeve");
    };
    /** The trigger hand on a grip at (x, y, z) leaning back by `slant`. */
    const gripHand = (x: number, y: number, z: number, slant: number, elbow: V3 = [0.13, -0.34, z + 0.4]) =>
      hand(new Matrix4().makeRotationX(slant).setPosition(x, y, z), 0.018, 0.033, [0.03, -0.035, 0.05], elbow);
    /** The support hand under a handguard whose axis passes through (0, y, z): palm below, fingers up the near side. */
    const underHand = (y: number, z: number, gx: number, gz: number) =>
      hand(new Matrix4().makeBasis(_va.set(0, -1, 0), _vb.set(0.12, 0, -1).normalize(), _vc.set(1, 0, 0.12).normalize()).setPosition(0.002, y, z), gx, gz, [gx + 0.025, -0.06, 0.03], [-0.2, -0.36, z + 0.5]);
    if (!detail) {
      if (id === "knife") lite(0.0, -0.035, 0.0, 0.35, 0);
      else if (id === "pistol" || id === "mp" || id === "magnum") {
        lite(0.005, -0.06, id === "magnum" ? 0.06 : 0.03, 0.25, 0);
        lite(-0.03, -0.07, id === "magnum" ? 0.05 : 0.02, 0.25, 0.4);
      } else {
        lite(0.005, -0.07, id === "burst" ? -0.11 : 0.03, 0.25, 0);
        lite(-0.015, -0.035, SUPPORT[id] ?? -0.32, 0.1, 0.35);
      }
    } else if (id === "knife") {
      gripHand(0.0, -0.03, 0.0, 0.35);
    } else if (id === "pistol" || id === "mp" || id === "magnum") {
      const z = id === "magnum" ? 0.05 : 0.012;
      gripHand(0, -0.062, z, 0.25);
      // The off hand cups the grip from the other side.
      hand(new Matrix4().makeRotationX(0.25).multiply(_ma.makeRotationY(Math.PI * 0.86)).setPosition(-0.004, -0.07, z - 0.004), 0.022, 0.04, [0.03, -0.035, 0.05], [-0.24, -0.34, z + 0.38]);
    } else {
      gripHand(0, -0.078, id === "burst" ? -0.11 : 0.03, 0.28);
      const sz = SUPPORT[id] ?? -0.32;
      underHand(id === "rpg" ? 0.03 : id === "shotgun" ? -0.014 : 0.004, sz, id === "rpg" ? 0.045 : 0.03, id === "rpg" ? 0.05 : id === "lmg" ? 0.041 : 0.038);
    }
    // Low detail: the red dot is just a bright bead in the one mesh (no glass, no extra draws).
    if (dotAt && !detail) box(0.003, 0.003, 0.003, 0, dotAt[0], dotAt[1] - 0.02, 0xff2a1a, "glass");
    const merged = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    this.geometries.push(merged);
    g.add(new Mesh(merged, this.shared));
    if (dotAt && detail) {
      // Glass (tinted, glossy) and the glowing dot at the sight's center.
      const glass = new Mesh(new PlaneGeometry(0.036, 0.034), new MeshStandardMaterial({ color: 0x9fb7c6, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2 }));
      glass.position.set(0, dotAt[0], dotAt[1] - 0.02);
      const dot = new Mesh(new SphereGeometry(0.0012, 8, 6), new MeshBasicMaterial({ color: new Color(6, 0.4, 0.3), toneMapped: false }));
      dot.position.set(0, dotAt[0], dotAt[1] - 0.02);
      [glass, dot].forEach((m) => {
        this.geometries.push(m.geometry);
        this.materials.push(m.material as Material);
        m.renderOrder = 2;
        g.add(m);
      });
    }
    return { group: g, muzzle, sightY, mag, magY, adsZ };
  }

  /** The off hand, holding a frag: raised on the left when you hold the grenade button, swung forward on the throw. */
  private buildNadeArm(): void {
    const parts: BufferGeometry[] = [];
    if (this.season) {
      // The season's throwable (snowball, turkey, egg, firecracker), a little smaller than in the world.
      for (const p of throwableParts(this.season, 1.05)) parts.push(this.place(p.geo, p.color, "polymer", 0, 0.045, -0.02));
    } else {
      parts.push(this.place(new SphereGeometry(0.03, 12, 10).scale(1, 1.2, 1), 0x3d4a2c, "polymer", 0, 0.04, -0.02));
      parts.push(this.place(new CylinderGeometry(0.011, 0.014, 0.02, 8), 0x5a5d60, "steel", 0, 0.08, -0.02));
      parts.push(this.place(new BoxGeometry(0.006, 0.05, 0.012), 0x5a5d60, "steel", 0.02, 0.05, -0.02, 0, 0, 0.3));
    }
    parts.push(this.place(new RoundedBoxGeometry(0.06, 0.055, 0.08, 2, 0.014), 0x2a2622, "glove", 0, 0, 0));
    for (let i = 0; i < 4; i++) parts.push(this.place(new RoundedBoxGeometry(0.018, 0.04, 0.018, 1, 0.006), 0x2a2622, "glove", 0.03, 0.02, -0.03 + i * 0.018));
    parts.push(this.place(new CylinderGeometry(0.043, 0.048, 0.34, 10).rotateX(Math.PI / 2), 0x55603f, "sleeve", -0.02, -0.06, 0.2, -0.4));
    const geo = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    this.geometries.push(geo);
    this.nadeArm.add(new Mesh(geo, this.shared));
    this.nadeArm.visible = false;
  }

  /* -------------------------------------------------------------------- */
  /* Animation                                                            */
  /* -------------------------------------------------------------------- */

  private gun(id: WeaponId): GunModel {
    let m = this.guns.get(id);
    if (!m) {
      m = this.build(id);
      m.group.visible = false;
      this.root.add(m.group);
      this.guns.set(id, m);
    }
    return m;
  }

  /** Builds these models now (gun game: the whole ladder before the fight, so climbing never hitches). */
  prepare(ids: readonly WeaponId[]): void {
    for (const id of ids) this.gun(id);
  }

  setWeapon(id: WeaponId): void {
    if (this.current === id) return;
    if (this.current) this.gun(this.current).group.visible = false;
    this.current = id;
    this.gun(id).group.visible = true;
  }

  fired(now: number, strength: number): void {
    if (this.current === "knife") {
      // A blade swings instead of kicking, and there's no flash.
      this.slashAt = now;
      this.slashSide = -this.slashSide;
      return;
    }
    this.kickV += 3.2 * strength;
    this.kickRotV += 1.9 * strength;
    this.rollV += (Math.random() - 0.5) * 3 * strength;
    this.kickRot += 0.02 * strength;
    this.flashUntil = now + 45;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(s, s, 1);
  }

  throwNade(now: number): void {
    this.throwAt = now;
  }

  /** The weapon's own FOV: 54° tall, widened on portrait screens so the gun isn't cropped. */
  private baseFov = 54;

  /** Portrait screens pull the gun in toward the middle so it isn't cut off at the edge. */
  private hipX = HIP[0];

  resize(aspect: number): void {
    this.hipX = HIP[0] * Math.max(0.45, Math.min(1, aspect));
    this.baseFov = Math.max(54, (2 * Math.atan(Math.tan((22 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Poses the gun for this frame. `look` = this frame's view rotation
   * (radians) for sway; `reload` / `swap` are 0…1 progress (or −1 when not
   * doing it); `nadeHeld` the grenade button is down (with a grenade left).
   */
  update(o: { now: number; dt: number; ads: number; sprinting: boolean; moving: number; strafe?: number; walkPhase: number; grounded: boolean; lookX: number; lookY: number; reload: number; swap: number; hideScoped: boolean; reduceMotion: boolean; nadeHeld?: boolean }): void {
    const gun = this.current ? this.guns.get(this.current) : undefined;
    if (!gun) return;
    const dt = Math.min(0.05, o.dt);
    const calm = o.reduceMotion ? 0.35 : 1;
    // Sway: the gun lags the look a little (spring).
    const k = 90;
    const damp = 14;
    this.swayVX += (-o.lookX * 1.4 - this.swayX) * k * dt - this.swayVX * damp * dt;
    this.swayVY += (o.lookY * 1.4 - this.swayY) * k * dt - this.swayVY * damp * dt;
    this.swayX += this.swayVX * dt;
    this.swayY += this.swayVY * dt;
    this.swayX = Math.max(-0.06, Math.min(0.06, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    // Recoil springs: push back, muzzle climb, a random roll.
    this.kickV += -this.kick * 220 * dt - this.kickV * 22 * dt;
    this.kick += this.kickV * dt;
    this.kickRotV += -this.kickRot * 160 * dt - this.kickRotV * 18 * dt;
    this.kickRot += this.kickRotV * dt;
    this.rollV += -this.roll * 120 * dt - this.rollV * 14 * dt;
    this.roll += this.rollV * dt;
    this.sprint += ((o.sprinting ? 1 : 0) - this.sprint) * Math.min(1, dt * 9);
    this.tilt += ((o.strafe ?? 0) * 0.06 - this.tilt) * Math.min(1, dt * 6);
    this.bobT = o.walkPhase;
    const ads = o.ads;
    const hip = 1 - ads;
    const bobAmt = calm * o.moving * (o.grounded ? 1 : 0.2) * (1 - ads * 0.85);
    const bx = Math.sin(this.bobT * Math.PI) * 0.012 * bobAmt;
    const by = -Math.abs(Math.cos(this.bobT * Math.PI)) * 0.01 * bobAmt;
    // Idle breathing (less when aimed).
    const t = o.now / 1000;
    const br = calm * (1 - o.moving) * (1 - ads * 0.7);
    const bx2 = Math.sin(t * 1.1) * 0.0022 * br;
    const by2 = Math.sin(t * 2.2) * 0.0018 * br;
    // ADS travels along a short arc (up and in) rather than a straight line.
    const arc = Math.sin(ads * Math.PI) * 0.012;
    const x = this.hipX * hip + bx + bx2 + this.swayX * (0.4 + hip * 0.6) + 0.06 * this.sprint - arc * 0.5;
    const y = HIP[1] * hip + -gun.sightY * ads + by + by2 + this.swayY * (0.4 + hip * 0.6) - 0.04 * this.sprint + arc;
    const z = HIP[2] * hip + gun.adsZ * ads + Math.max(0, this.kick) * 0.06;
    let rx = this.kickRot * (1 - ads * 0.55) - 0.35 * this.sprint;
    let ry = 0.55 * this.sprint;
    let rz = 0.25 * this.sprint + this.roll * 0.05 * (1 - ads * 0.5) - this.tilt * (1 - ads * 0.6);
    let dy = 0;
    // Reload: dip, roll, and the magazine drops out and back in.
    if (o.reload >= 0) {
      const r = o.reload;
      const w = Math.sin(Math.min(1, r * 1.15) * Math.PI);
      dy -= 0.07 * w;
      rz += 0.5 * w;
      rx += 0.25 * w;
      if (gun.mag) {
        const out = r < 0.45 ? Math.min(1, r / 0.25) : Math.max(0, 1 - (r - 0.45) / 0.25);
        gun.mag.position.y = gun.magY - 0.18 * out;
        gun.mag.visible = !(r > 0.3 && r < 0.5);
      }
    } else if (gun.mag) {
      gun.mag.position.y = gun.magY;
      gun.mag.visible = true;
    }
    // Swap: drop out and come back up.
    if (o.swap >= 0) {
      const s = 1 - o.swap;
      dy -= 0.25 * s * s;
      rx -= 0.6 * s * s;
    }
    // Grenade: hold raises the off hand (and lowers the gun a touch); the throw swings it forward.
    const since = (o.now - this.throwAt) / 1000;
    const throwing = since >= 0 && since < 0.55;
    this.nadeHold += ((o.nadeHeld ? 1 : 0) - this.nadeHold) * Math.min(1, dt * 12);
    const lower = Math.max(this.nadeHold, throwing ? Math.sin((since / 0.55) * Math.PI) : 0);
    dy -= 0.06 * lower;
    rx -= 0.25 * lower;
    ry -= 0.2 * lower;
    this.nadeArm.visible = this.nadeHold > 0.02 || throwing;
    if (this.nadeArm.visible) {
      let ax = -0.26;
      let ay = -0.17 + (1 - this.nadeHold) * -0.25;
      let az = -0.52;
      let arx = 0.3;
      if (throwing) {
        const p = since / 0.55;
        ax = -0.26 + p * 0.14;
        ay = -0.12 + Math.sin(p * Math.PI) * 0.14 - p * p * 0.3;
        az = -0.5 - p * 0.35;
        arx = 0.3 - p * 1.6;
        this.nadeArm.children[0]!.visible = p < 0.45;
      } else this.nadeArm.children[0]!.visible = true;
      this.nadeArm.position.set(ax, ay, az);
      this.nadeArm.rotation.set(arx, 0.3, -0.2);
    }
    // Knife swing: a quick arc across the screen, alternating sides.
    let sx = 0;
    let sz = 0;
    const slash = (o.now - this.slashAt) / 1000;
    if (slash >= 0 && slash < 0.3) {
      const p = slash / 0.3;
      const arc = Math.sin(p * Math.PI) * calm;
      const side = this.slashSide;
      sx = (0.06 - p * 0.16) * side * calm;
      sz = -0.14 * arc;
      ry += 0.9 * arc * side;
      rz -= 0.7 * arc * side;
      rx -= 0.25 * arc;
    }
    this.root.position.set(x + sx, y + dy, z + sz);
    this.root.rotation.set(rx, ry, rz);
    // Muzzle flash.
    const flashing = o.now < this.flashUntil;
    this.flash.visible = flashing && !o.hideScoped;
    this.flash.position.set(gun.muzzle[0], gun.muzzle[1], gun.muzzle[2] - 0.02);
    this.flashLight.intensity = flashing ? 1.2 : 0;
    this.root.visible = !o.hideScoped;
    // Aiming narrows the view model's FOV a touch too (feels like leaning into the sights).
    const fov = this.baseFov - 8 * ads;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
