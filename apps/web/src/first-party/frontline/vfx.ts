/**
 * Pooled effects, a few draw calls in all:
 *
 *   tracers   camera-facing streaks flying along the bullet path, each with a
 *             wide dim halo, and the faint line the round leaves in the air
 *             for a third of a second (all instanced)
 *   rings     a blast's shockwave racing out along the ground
 *   sparks    additive points with gravity (HDR hot, so they bloom on high)
 *   bits      heavier chips: concrete grit, wood splinters, asphalt, blood
 *   smoke     instanced billboards (normal blend, fogged): impact dust,
 *             muzzle wisps, blast smoke, the distant plumes, the wreck's smoke
 *   glow      instanced additive billboards: fireballs, flames, flashes
 *   casings   brass shells ejected from guns, bouncing and rolling
 *   debris    blast chunks tumbling to the ground
 *   decals    bullet holes (surface-aligned quads) and blast scorch marks
 *   lights    a tiny pool of point lights for muzzle flashes and blasts
 *
 * Particle counts scale with the tier's budget; the ambient emitters (plumes
 * and the burning wreck) only run when the tier allows it.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Texture,
} from "three";
import type { Impact } from "./game";

interface Tracer {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  t: number;
  speed: number;
  width: number;
}

/** The disturbed air behind a round: the whole path at once, fading. */
interface Trail {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  age: number;
  life: number;
  width: number;
}

interface Ring {
  mesh: Mesh;
  age: number;
  life: number;
  size: number;
}

const TRACERS = 48;
const TRAILS = 40;
const _c = new Color();

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  age: number;
  r: number;
  g: number;
  b: number;
  a: number;
  grav: number;
  drag: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _cam = new Vector3();
const _o = new Object3D();

class PointPool {
  readonly points: Points;
  private readonly list: Particle[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo = new BufferGeometry();

  constructor(
    readonly max: number,
    tex: Texture,
    size: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    const pa = new BufferAttribute(this.pos, 3);
    pa.setUsage(DynamicDrawUsage);
    const ca = new BufferAttribute(this.col, 4);
    ca.setUsage(DynamicDrawUsage);
    this.geo.setAttribute("position", pa);
    this.geo.setAttribute("color", ca);
    this.geo.setDrawRange(0, 0);
    const mat = new PointsMaterial({
      map: tex,
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.visible = false;
  }

  spawn(p: Omit<Particle, "age">): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ ...p, age: 0 });
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r;
      this.col[n * 4 + 1] = p.g;
      this.col[n * 4 + 2] = p.b;
      this.col[n * 4 + 3] = p.a * k;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.points.visible = n > 0;
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as PointsMaterial).dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Billboards (smoke, fire)                                               */
/* ---------------------------------------------------------------------- */

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  rot: number;
  spin: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** Fraction of life spent fading in. */
  fadeIn: number;
  drag: number;
  lift: number;
  /** Fire: cools from white-yellow through orange to dark as it ages (glow pool only). */
  hot: boolean;
}

const BILLBOARD_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec2 iSizeRot;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSizeRot.y);
  float s = sin(iSizeRot.y);
  vec2 p = mat2(c, s, -s, c) * position.xy * iSizeRot.x;
  mvPosition.xy += p;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const BILLBOARD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 tint;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb * tint, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

class BillboardPool {
  readonly mesh: Mesh;
  private readonly list: Puff[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly sr: Float32Array;
  private readonly geo: InstancedBufferGeometry;
  private readonly mat: ShaderMaterial;
  private readonly aPos: InstancedBufferAttribute;
  private readonly aCol: InstancedBufferAttribute;
  private readonly aSr: InstancedBufferAttribute;

  constructor(
    readonly max: number,
    tex: Texture,
    private readonly additive: boolean,
  ) {
    const quad = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute("position", quad.getAttribute("position"));
    this.geo.setAttribute("uv", quad.getAttribute("uv"));
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.sr = new Float32Array(max * 2);
    this.aPos = new InstancedBufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    this.aCol = new InstancedBufferAttribute(this.col, 4).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    this.aSr = new InstancedBufferAttribute(this.sr, 2).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    this.geo.setAttribute("iPos", this.aPos);
    this.geo.setAttribute("iColor", this.aCol);
    this.geo.setAttribute("iSizeRot", this.aSr);
    this.geo.instanceCount = 0;
    this.mat = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { map: { value: tex }, tint: { value: new Color(1, 1, 1) } }]),
      vertexShader: BILLBOARD_VERT,
      fragmentShader: BILLBOARD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      fog: true,
    });
    this.mat.uniforms.map!.value = tex;
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 5 : 4;
    this.mesh.visible = false;
    quad.dispose();
  }

  get size(): number {
    return this.list.length;
  }

  spawn(p: Omit<Puff, "age">): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ ...p, age: 0 });
  }

  update(dt: number, cam: Vector3): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.list.splice(i, 1);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy = p.vy * d + p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
    }
    // Far to near, so the normal-blended smoke layers correctly.
    if (!this.additive) {
      this.list.sort((a, b) => (b.x - cam.x) ** 2 + (b.y - cam.y) ** 2 + (b.z - cam.z) ** 2 - ((a.x - cam.x) ** 2 + (a.y - cam.y) ** 2 + (a.z - cam.z) ** 2));
    }
    let n = 0;
    for (const p of this.list) {
      const t = p.age / p.life;
      const fade = t < p.fadeIn ? t / p.fadeIn : 1 - (t - p.fadeIn) / (1 - p.fadeIn);
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      let r = p.r;
      let g = p.g;
      let b = p.b;
      if (p.hot) {
        // White-yellow → orange → deep red → nothing.
        const k = Math.min(1, t * 1.6);
        r = p.r * (1 - k * 0.3);
        g = p.g * (1 - k * 0.75);
        b = p.b * (1 - k * 0.95);
      }
      this.col[n * 4] = r;
      this.col[n * 4 + 1] = g;
      this.col[n * 4 + 2] = b;
      this.col[n * 4 + 3] = p.a * Math.max(0, fade);
      this.sr[n * 2] = p.size0 + (p.size1 - p.size0) * (1 - (1 - t) * (1 - t));
      this.sr[n * 2 + 1] = p.rot;
      n++;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSr.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Rocket smoke trails                                                    */
/* ---------------------------------------------------------------------- */

const TRAIL_POINTS = 72;
const TRAIL_SLOTS = 4;

const RIBBON_VERT = /* glsl */ `
attribute vec3 aRib;
varying vec3 vRib;
#include <fog_pars_vertex>
void main() {
  vRib = aRib;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// aRib: x = metres along the trail (for the noise), y = −1…1 across, z = opacity.
const RIBBON_FRAG = /* glsl */ `
uniform vec3 color;
uniform float time;
varying vec3 vRib;
#include <fog_pars_fragment>
float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float across = 1.0 - vRib.y * vRib.y;
  // Billows: clumps along the trail, lumps within them, both eating at the edges more than the core,
  // and lit lumps against shadowed folds.
  float clump = rn(vec2(vRib.x * 0.45, 3.1));
  vec2 q = vec2(vRib.x * 1.3, vRib.y * 1.4 + time * 0.12);
  float n = rn(q) * 0.55 + rn(q * 2.7 + 7.3) * 0.3 + rn(q * 6.1 + 2.1) * 0.15;
  float d = across * (0.45 + 0.8 * n) * (0.7 + 0.5 * clump) - 0.18;
  float a = vRib.z * smoothstep(0.0, 0.55, d);
  if (a < 0.004) discard;
  gl_FragColor = vec4(color * (0.78 + 0.32 * n), a);
  #include <fog_fragment>
}`;

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** Metres along the trail when it was laid. */
  s: number;
}

interface SmokeTrail {
  key: object | null;
  pts: TrailPoint[];
  /** The rocket's live nozzle (the head of the ribbon), while it flies. */
  head: { x: number; y: number; z: number } | null;
  dist: number;
}

/**
 * The smoke a rocket motor lays down: one camera-facing ribbon per rocket
 * through points dropped along its flight, each widening, rising and
 * drifting as it ages, with a shader breaking it into billows. One draw
 * call for all of them, a few hundred vertices.
 */
class SmokeTrails {
  readonly mesh: Mesh;
  private readonly slots: SmokeTrail[] = [];
  private readonly pos: Float32Array;
  private readonly rib: Float32Array;
  private readonly geo = new BufferGeometry();
  private readonly mat: ShaderMaterial;
  private readonly aPos: BufferAttribute;
  private readonly aRib: BufferAttribute;

  constructor(private readonly life: number) {
    const verts = TRAIL_SLOTS * (TRAIL_POINTS + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.rib = new Float32Array(verts * 3);
    this.aPos = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    this.aRib = new BufferAttribute(this.rib, 3).setUsage(DynamicDrawUsage);
    this.geo.setAttribute("position", this.aPos);
    this.geo.setAttribute("aRib", this.aRib);
    const index: number[] = [];
    for (let t = 0; t < TRAIL_SLOTS; t++) {
      const base = t * (TRAIL_POINTS + 1) * 2;
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setIndex(index);
    this.mat = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { color: { value: new Color(0.86, 0.85, 0.82) }, time: { value: 0 } }]),
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    for (let i = 0; i < TRAIL_SLOTS; i++) this.slots.push({ key: null, pts: [], head: null, dist: 0 });
  }

  /** The rocket `key` is at (x, y, z) this frame: drops a point every so often and keeps the ribbon's head on it. */
  feed(key: object, x: number, y: number, z: number): void {
    let t = this.slots.find((s) => s.key === key);
    if (!t) {
      // A free slot, else the one whose smoke is oldest.
      t = this.slots.find((s) => !s.key && !s.pts.length) ?? this.slots.reduce((a, b) => (!a.key && (b.key || (a.pts[0]?.age ?? 0) > (b.pts[0]?.age ?? 0)) ? a : b));
      t.key = key;
      t.pts.length = 0;
      t.dist = 0;
    }
    const last = t.pts[t.pts.length - 1];
    const step = last ? Math.hypot(x - last.x, y - last.y, z - last.z) : 1;
    if (step >= 0.45) {
      t.dist += last ? step : 0;
      if (t.pts.length >= TRAIL_POINTS) t.pts.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 0.15 + Math.random() * 0.35;
      t.pts.push({ x, y, z, vx: Math.cos(a) * sp + 0.25, vy: 0.18 + Math.random() * 0.25, vz: Math.sin(a) * sp + 0.08, age: 0, s: t.dist });
    }
    t.head = { x, y, z };
  }

  /** The rocket `key` went off: its smoke stays and fades, the head stops following. */
  end(key: object): void {
    const t = this.slots.find((s) => s.key === key);
    if (t) {
      t.key = null;
      t.head = null;
    }
  }

  update(dt: number, cam: Vector3, time: number): void {
    if (!this.mesh.visible && this.slots.every((t) => !t.pts.length && !t.head)) return;
    this.mat.uniforms.time!.value = time;
    let any = false;
    for (let si = 0; si < this.slots.length; si++) {
      const t = this.slots[si]!;
      for (const p of t.pts) {
        p.age += dt;
        const d = Math.exp(-1.2 * dt);
        p.vx *= d;
        p.vz *= d;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      while (t.pts.length && t.pts[0]!.age >= this.life) t.pts.shift();
      if (!t.key && !t.pts.length) t.head = null;
      const base = si * (TRAIL_POINTS + 1) * 2;
      // The points, oldest first, then the head on the rocket itself.
      const n = t.pts.length + (t.head ? 1 : 0);
      for (let i = 0; i <= TRAIL_POINTS; i++) {
        const v = (base + i * 2) * 3;
        if (i >= n || n < 2) {
          // Unused: collapsed onto the last vertex (no area, nothing drawn).
          for (let k = 0; k < 6; k++) this.pos[v + k] = i > 0 && n >= 2 ? this.pos[v - 6 + (k % 3)] : 0;
          this.rib[v + 2] = 0;
          this.rib[v + 5] = 0;
          continue;
        }
        const p = i < t.pts.length ? t.pts[i]! : null;
        const x = p ? p.x : t.head!.x;
        const y = p ? p.y : t.head!.y;
        const z = p ? p.z : t.head!.z;
        // Direction along the ribbon from its neighbours.
        const a = i > 0 ? (i - 1 < t.pts.length ? t.pts[i - 1]! : t.head!) : null;
        const b = i + 1 < n ? (i + 1 < t.pts.length ? t.pts[i + 1]! : t.head!) : null;
        _x.set((b ? b.x : x) - (a ? a.x : x), (b ? b.y : y) - (a ? a.y : y), (b ? b.z : z) - (a ? a.z : z));
        _z.set(cam.x - x, cam.y - y, cam.z - z);
        _y.crossVectors(_x, _z);
        const l = _y.length();
        // How side-on we see this stretch: a ribbon seen end-on is a thin twisted fan, so it fades out
        // there and the puffs laid along the trail carry the look.
        const side = l / Math.max(1e-6, _x.length() * _z.length());
        if (l < 1e-6) _y.set(0, 1, 0);
        else _y.multiplyScalar(1 / l);
        const age = p ? p.age : 0;
        const k = age / this.life;
        // Thin and dense at the nozzle, widening and thinning out as it ages.
        const w = 0.07 + Math.min(1.5, age * 0.9 + Math.sqrt(age) * 0.35);
        // Fades in over the first metre behind the nozzle (the flame's own glow covers that).
        const fadeIn = p ? Math.min(1, (t.head ? t.dist - p.s : 9) + age * 6) : 0;
        const edge = Math.min(1, Math.max(0, (side - 0.12) / 0.3));
        const alpha = 0.85 * fadeIn * (1 - k) * (1 - k) * Math.min(1, 0.35 / Math.max(0.35, w * 0.6)) * edge * edge * (3 - 2 * edge);
        this.pos[v] = x + _y.x * w;
        this.pos[v + 1] = y + _y.y * w;
        this.pos[v + 2] = z + _y.z * w;
        this.pos[v + 3] = x - _y.x * w;
        this.pos[v + 4] = y - _y.y * w;
        this.pos[v + 5] = z - _y.z * w;
        const s = p ? p.s : t.dist + 0.5;
        this.rib[v] = s;
        this.rib[v + 1] = -1;
        this.rib[v + 2] = alpha;
        this.rib[v + 3] = s;
        this.rib[v + 4] = 1;
        this.rib[v + 5] = alpha;
        any = true;
      }
    }
    this.mesh.visible = any;
    this.aPos.needsUpdate = true;
    this.aRib.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ---------------------------------------------------------------------- */
/* Rigid bits (casings, debris)                                           */
/* ---------------------------------------------------------------------- */

interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  age: number;
  life: number;
  s: number;
  rest: number;
}

class BodyPool {
  readonly mesh: InstancedMesh;
  private readonly list: Body[] = [];
  private next = 0;

  constructor(
    readonly max: number,
    geo: BufferGeometry,
    mat: MeshStandardMaterial,
    readonly bounce: number,
  ) {
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  spawn(b: Omit<Body, "age" | "rest">): void {
    if (this.list.length >= this.max) this.list.splice(this.next++ % this.list.length, 1);
    this.list.push({ ...b, age: 0, rest: 0 });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]!;
      b.age += dt;
      if (b.age >= b.life) {
        this.list.splice(i, 1);
        continue;
      }
      if (b.rest < 3) {
        b.vy -= 17 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rx += b.wx * dt;
        b.ry += b.wy * dt;
        b.rz += b.wz * dt;
        const floor = b.s * 0.5;
        if (b.y < floor) {
          b.y = floor;
          b.vy = Math.abs(b.vy) * this.bounce;
          b.vx *= 0.55;
          b.vz *= 0.55;
          b.wx *= 0.5;
          b.wz *= 0.5;
          if (b.vy < 0.4) {
            b.rest++;
            b.vy = 0;
            // Lie on the side.
            b.rx = Math.round(b.rx / (Math.PI / 2)) * (Math.PI / 2);
            b.rz = Math.round(b.rz / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
    }
    let n = 0;
    for (const b of this.list) {
      const fade = b.life - b.age < 0.4 ? (b.life - b.age) / 0.4 : 1;
      _o.position.set(b.x, b.y - (1 - fade) * b.s, b.z);
      _o.rotation.set(b.rx, b.ry, b.rz);
      _o.scale.setScalar(b.s);
      _o.updateMatrix();
      this.mesh.setMatrixAt(n++, _o.matrix);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------------- */
/* Vfx                                                                    */
/* ---------------------------------------------------------------------- */

export interface VfxTextures {
  streak: Texture;
  dot: Texture;
  hole: Texture;
  smoke: Texture;
  fire: Texture;
  scorch: Texture;
  ring: Texture;
  trail: Texture;
}

export interface VfxOptions {
  decals: number;
  particles: number;
  /** Point lights for flashes (medium/high). */
  lights: boolean;
  /** Plumes, the burning wreck. */
  ambience: boolean;
  /** Low tier: impact dust as cheap points (like before), no chips or billboards for bullets. */
  lite?: boolean;
}

interface FlashLight {
  light: PointLight;
  until: number;
  start: number;
  peak: number;
}

const DUST: Record<string, [number, number, number]> = {
  concrete: [0.62, 0.6, 0.56],
  ground: [0.34, 0.33, 0.31],
  container: [0.46, 0.4, 0.34],
  metal: [0.42, 0.42, 0.42],
  wood: [0.5, 0.39, 0.27],
  sand: [0.72, 0.64, 0.5],
  tarp: [0.4, 0.42, 0.38],
  glass: [0.8, 0.85, 0.88],
};

export class Vfx {
  private readonly tracers: Tracer[] = [];
  private readonly tracerMesh: InstancedMesh;
  private readonly trails: Trail[] = [];
  private readonly trailMesh: InstancedMesh;
  private readonly rings: Ring[] = [];
  private readonly sparks: PointPool;
  private readonly bits: PointPool;
  /** Low tier's impact dust. */
  private readonly puffs: PointPool | null;
  private readonly lite: boolean;
  private readonly smoke: BillboardPool;
  private readonly glow: BillboardPool;
  private readonly casings: BodyPool;
  private readonly debris: BodyPool;
  private readonly rocketTrails: SmokeTrails;
  private readonly decals: InstancedMesh;
  private readonly scorches: InstancedMesh;
  private readonly lights: FlashLight[] = [];
  private fireLight: PointLight | null = null;
  private readonly lightsOn: boolean;
  private decalIndex = 0;
  private decalCount = 0;
  private scorchIndex = 0;
  private scale = 1;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: { dispose(): void }[] = [];
  private ambience: boolean;
  private emitters: { x: number; y: number; z: number; kind: "plume" | "fire"; acc: number; h: number }[] = [];
  private time = 0;
  private distantAt = 12;
  /** A distant blast went off (engine plays its rumble). */
  onDistant: (() => void) | null = null;

  constructor(
    private readonly scene: Scene,
    tex: VfxTextures,
    opts: VfxOptions,
  ) {
    // Unit quad: length along +x, width along y, facing +z (turned toward the camera per tracer).
    const quad = new PlaneGeometry(1, 1);
    this.geometries.push(quad);
    const tracerMat = new MeshBasicMaterial({ map: tex.streak, transparent: true, blending: AdditiveBlending, depthWrite: false, color: new Color(2.2, 1.7, 1.1) });
    this.materials.push(tracerMat);
    // Two instances per tracer: the streak and its halo (dimmed by the instance color).
    this.tracerMesh = new InstancedMesh(quad, tracerMat, TRACERS * 2);
    this.tracerMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.renderOrder = 4;
    for (let i = 0; i < TRACERS * 2; i++) this.tracerMesh.setColorAt(i, _c.setRGB(1, 1, 1));
    scene.add(this.tracerMesh);
    const trailMat = new MeshBasicMaterial({ map: tex.trail, transparent: true, blending: AdditiveBlending, depthWrite: false });
    this.materials.push(trailMat);
    this.trailMesh = new InstancedMesh(quad, trailMat, TRAILS);
    this.trailMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.trailMesh.count = 0;
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = 3;
    for (let i = 0; i < TRAILS; i++) this.trailMesh.setColorAt(i, _c.setRGB(0, 0, 0));
    scene.add(this.trailMesh);
    // Shockwave rings (flat on the ground, additive).
    const ringGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.geometries.push(ringGeo);
    for (let i = 0; i < 3; i++) {
      const mat = new MeshBasicMaterial({ map: tex.ring, transparent: true, blending: AdditiveBlending, depthWrite: false, color: new Color(0, 0, 0) });
      this.materials.push(mat);
      const mesh = new Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.rings.push({ mesh, age: 1, life: 1, size: 1 });
    }
    this.sparks = new PointPool(260, tex.dot, 0.055, true);
    this.bits = new PointPool(220, tex.dot, 0.045, false);
    scene.add(this.sparks.points, this.bits.points);
    this.lite = !!opts.lite;
    this.puffs = this.lite ? new PointPool(160, tex.dot, 0.35, false) : null;
    if (this.puffs) scene.add(this.puffs.points);
    this.smoke = new BillboardPool(opts.ambience ? 320 : 90, tex.smoke, false);
    this.glow = new BillboardPool(opts.ambience ? 120 : 40, tex.fire, true);
    scene.add(this.smoke.mesh, this.glow.mesh);
    this.rocketTrails = new SmokeTrails(this.lite ? 2.4 : 3.6);
    scene.add(this.rocketTrails.mesh);

    const brass = new MeshStandardMaterial({ color: 0xc9a042, metalness: 0.9, roughness: 0.3 });
    const rock = new MeshStandardMaterial({ color: 0x3a3632, metalness: 0, roughness: 0.95 });
    this.materials.push(brass, rock);
    const casingGeo = new CylinderGeometry(0.5, 0.5, 2.6, 6).rotateZ(Math.PI / 2);
    const chunkGeo = new IcosahedronGeometry(0.6, 0);
    this.geometries.push(casingGeo, chunkGeo);
    this.casings = new BodyPool(opts.ambience ? 48 : 16, casingGeo, brass, 0.35);
    this.debris = new BodyPool(opts.ambience ? 48 : 16, chunkGeo, rock, 0.25);
    this.casings.mesh.castShadow = false;
    scene.add(this.casings.mesh, this.debris.mesh);

    const dg = new PlaneGeometry(0.13, 0.13);
    this.geometries.push(dg);
    const holeMat = new MeshBasicMaterial({ map: tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.materials.push(holeMat);
    this.decals = new InstancedMesh(dg, holeMat, Math.max(8, opts.decals));
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 2;
    scene.add(this.decals);
    const sg = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.geometries.push(sg);
    const scorchMat = new MeshBasicMaterial({ map: tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.materials.push(scorchMat);
    this.scorches = new InstancedMesh(sg, scorchMat, 6);
    this.scorches.count = 0;
    this.scorches.frustumCulled = false;
    this.scorches.renderOrder = 1;
    this.scorches.visible = false;
    scene.add(this.scorches);
    this.scale = opts.particles;
    this.ambience = opts.ambience;
    this.lightsOn = opts.lights;
    if (opts.lights) {
      for (let i = 0; i < 2; i++) {
        const light = new PointLight(0xffa860, 0, 9, 2);
        light.castShadow = false;
        scene.add(light);
        this.lights.push({ light, until: 0, start: 0, peak: 0 });
      }
    }
  }

  setBudget(particles: number): void {
    this.scale = particles;
  }

  /** Ambient emitters: smoke columns beyond the walls and fires (the wreck). */
  setAmbient(plumes: { x: number; z: number; h: number }[], fires: { x: number; y: number; z: number }[]): void {
    this.emitters = [...plumes.map((p) => ({ x: p.x, y: 0, z: p.z, kind: "plume" as const, acc: 0, h: p.h })), ...fires.map((f) => ({ x: f.x, y: f.y, z: f.z, kind: "fire" as const, acc: 0, h: 1 }))];
    const fire = fires[0];
    if (fire && this.ambience && this.lightsOn && !this.fireLight) {
      this.fireLight = new PointLight(0xff8a3c, 0, 10, 2);
      this.fireLight.position.set(fire.x, fire.y + 0.8, fire.z);
      this.scene.add(this.fireLight);
    }
    // Pre-warm the plumes so they're already tall when the match starts.
    if (this.ambience) for (let i = 0; i < 60; i++) this.ambient(0.33);
  }

  /** A short-lived light at `p` (muzzle flash: small; blast: big). */
  flash(x: number, y: number, z: number, intensity: number, ms: number, color = 0xffa860): void {
    if (!this.lights.length) return;
    const now = performance.now();
    let slot = this.lights.find((l) => l.until < now) ?? this.lights.reduce((a, b) => (a.peak < b.peak ? a : b));
    if (slot.until > now && slot.peak > intensity) return;
    slot = slot!;
    slot.light.position.set(x, y, z);
    slot.light.color.setHex(color);
    slot.light.distance = Math.max(6, intensity * 1.2);
    slot.peak = intensity;
    slot.start = now;
    slot.until = now + ms;
  }

  /** A bullet's visible path from the muzzle to where it stopped. */
  tracer(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, width = 0.035): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.5) return;
    if (this.tracers.length >= TRACERS) this.tracers.shift();
    this.tracers.push({ ox: from.x, oy: from.y, oz: from.z, dx: dx / len, dy: dy / len, dz: dz / len, len, t: 0, speed: 380 + Math.random() * 60, width });
    if (this.lite || len < 4) return;
    if (this.trails.length >= TRAILS) this.trails.shift();
    this.trails.push({ ox: from.x, oy: from.y, oz: from.z, dx: dx / len, dy: dy / len, dz: dz / len, len, age: 0, life: width > 0.05 ? 0.6 : 0.32, width: width * 0.55 });
  }

  /**
   * The flash at someone's muzzle, seen from outside: a white-hot burst, a
   * tongue of flame thrown forward, and a few sparks of unburnt powder.
   * `own` (your gun: the first-person flash is drawn with the weapon) keeps
   * only the sparks.
   */
  muzzleFlash(x: number, y: number, z: number, dx: number, dy: number, dz: number, big = false, own = false): void {
    const k = big ? 1.6 : 1;
    if (!own) {
      this.glow.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.05, size0: 0.55 * k, size1: 0.3 * k, rot: Math.random() * 6, spin: 0, r: 5, g: 3.6, b: 2, a: 1, fadeIn: 0.01, drag: 0, lift: 0, hot: false });
      if (!this.lite) this.glow.spawn({ x: x + dx * 0.18, y: y + dy * 0.18, z: z + dz * 0.18, vx: dx * 7, vy: dy * 7, vz: dz * 7, life: 0.07, size0: 0.32 * k, size1: 0.12, rot: Math.random() * 6, spin: 0, r: 4, g: 2.4, b: 1, a: 0.9, fadeIn: 0.01, drag: 10, lift: 0, hot: false });
    }
    if (this.lite) return;
    const sparks = Math.ceil((big ? 5 : 2) * this.scale * (Math.random() + 0.3));
    for (let i = 0; i < sparks; i++) {
      const sp = 9 + Math.random() * 14;
      this.sparks.spawn({ x, y, z, vx: dx * sp + (Math.random() - 0.5) * 4, vy: dy * sp + (Math.random() - 0.5) * 4, vz: dz * sp + (Math.random() - 0.5) * 4, life: 0.06 + Math.random() * 0.12, r: 3.4, g: 2.2, b: 0.9, a: 1, grav: 4, drag: 5 });
    }
  }

  /** A little gray wisp at the muzzle after a shot. */
  muzzleSmoke(x: number, y: number, z: number, big = false): void {
    if (this.lite || Math.random() > this.scale) return;
    this.smoke.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.25, vz: (Math.random() - 0.5) * 0.3, life: big ? 1.4 : 0.8, size0: 0.08, size1: big ? 0.9 : 0.5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 1.2, r: 0.8, g: 0.79, b: 0.77, a: big ? 0.35 : 0.2, fadeIn: 0.1, drag: 2, lift: 0.2, hot: false });
  }

  /** A spent case flying out of the ejection port. */
  casing(x: number, y: number, z: number, rightX: number, rightZ: number, big = false): void {
    if (this.lite || Math.random() > this.scale + 0.2) return;
    const sp = 1.6 + Math.random() * 1.2;
    this.casings.spawn({ x, y, z, vx: rightX * sp + (Math.random() - 0.5) * 0.4, vy: 1.8 + Math.random() * 1.2, vz: rightZ * sp + (Math.random() - 0.5) * 0.4, rx: 0, ry: Math.random() * 6, rz: 0, wx: (Math.random() - 0.5) * 30, wy: (Math.random() - 0.5) * 20, wz: (Math.random() - 0.5) * 30, life: 2.6, s: big ? 0.011 : 0.0075 });
  }

  impact(i: Impact): void {
    const n = this.scale;
    if (i.surface === "flesh") {
      for (let k = 0; k < Math.ceil(6 * n); k++) {
        this.bits.spawn({ x: i.x, y: i.y, z: i.z, vx: i.nx * 1.2 + (Math.random() - 0.5) * 1.6, vy: i.ny * 1.2 + Math.random() * 1.2, vz: i.nz * 1.2 + (Math.random() - 0.5) * 1.6, life: 0.35 + Math.random() * 0.25, r: 0.42, g: 0.03, b: 0.03, a: 0.9, grav: 6, drag: 4 });
      }
      this.smoke.spawn({ x: i.x, y: i.y, z: i.z, vx: i.nx * 0.6, vy: 0.1, vz: i.nz * 0.6, life: 0.45, size0: 0.1, size1: 0.45, rot: Math.random() * 6, spin: 0, r: 0.5, g: 0.06, b: 0.05, a: 0.55, fadeIn: 0.05, drag: 4, lift: 0, hot: false });
      return;
    }
    const s = i.surface;
    const hard = s === "metal" || s === "container";
    const [dr, dg, db] = DUST[s] ?? DUST.concrete!;
    if (this.puffs) {
      // Low tier: sparks and a few dust points, as before.
      for (let k = 0; k < Math.ceil((hard ? 9 : 3) * n); k++) {
        const sp = 3 + Math.random() * 5;
        this.sparks.spawn({ x: i.x, y: i.y, z: i.z, vx: i.nx * sp + (Math.random() - 0.5) * 4, vy: i.ny * sp + Math.random() * 3, vz: i.nz * sp + (Math.random() - 0.5) * 4, life: 0.18 + Math.random() * 0.25, r: 1, g: 0.8, b: 0.4, a: 1, grav: 12, drag: 2 });
      }
      for (let k = 0; k < Math.ceil((hard ? 2 : 5) * n); k++) {
        this.puffs.spawn({ x: i.x + i.nx * 0.05, y: i.y + i.ny * 0.05, z: i.z + i.nz * 0.05, vx: i.nx * (0.8 + Math.random()) + (Math.random() - 0.5), vy: i.ny * (0.8 + Math.random()) + Math.random() * 0.6, vz: i.nz * (0.8 + Math.random()) + (Math.random() - 0.5), life: 0.5 + Math.random() * 0.5, r: dr, g: dg, b: db, a: 0.55, grav: -0.3, drag: 3 });
      }
      this.decal(i);
      return;
    }
    // Metal: a hot shower of sparks. Concrete/asphalt: a few, plus grit. Wood: splinters.
    const sparks = Math.ceil((hard ? 11 : s === "concrete" || s === "ground" ? 3 : 0) * n);
    for (let k = 0; k < sparks; k++) {
      const sp = 3 + Math.random() * 6;
      this.sparks.spawn({ x: i.x, y: i.y, z: i.z, vx: i.nx * sp + (Math.random() - 0.5) * 4, vy: i.ny * sp + Math.random() * 3, vz: i.nz * sp + (Math.random() - 0.5) * 4, life: 0.15 + Math.random() * 0.3, r: 3.2, g: 2.1 + Math.random() * 0.6, b: 0.8, a: 1, grav: 12, drag: 2 });
    }
    const chips = Math.ceil((s === "wood" ? 9 : hard ? 2 : 6) * n);
    for (let k = 0; k < chips; k++) {
      const sp = 1.5 + Math.random() * 3;
      const tone = 0.7 + Math.random() * 0.5;
      this.bits.spawn({ x: i.x, y: i.y, z: i.z, vx: i.nx * sp + (Math.random() - 0.5) * 2, vy: i.ny * sp + 1 + Math.random() * 2, vz: i.nz * sp + (Math.random() - 0.5) * 2, life: 0.5 + Math.random() * 0.5, r: dr * tone * (s === "wood" ? 1.3 : 0.8), g: dg * tone * (s === "wood" ? 1.2 : 0.8), b: db * tone * 0.8, a: 1, grav: 14, drag: 1.2 });
    }
    // Dust puff off the surface (bigger for soft stuff), drifting.
    const puffs = Math.ceil((hard ? 1 : 3) * n);
    for (let k = 0; k < puffs; k++) {
      const out = 0.5 + Math.random() * 0.9;
      this.smoke.spawn({ x: i.x + i.nx * 0.05, y: i.y + i.ny * 0.05, z: i.z + i.nz * 0.05, vx: i.nx * out + (Math.random() - 0.5) * 0.4, vy: i.ny * out + Math.random() * 0.3, vz: i.nz * out + (Math.random() - 0.5) * 0.4, life: 0.9 + Math.random() * 0.8, size0: 0.08, size1: hard ? 0.5 : 0.8 + Math.random() * 0.4, rot: Math.random() * 6, spin: (Math.random() - 0.5), r: dr, g: dg, b: db, a: hard ? 0.35 : 0.55, fadeIn: 0.06, drag: 3, lift: 0.15, hot: false });
    }
    // Every hit pops: a white flash on steel, a duller one on stone and wood.
    this.glow.spawn({ x: i.x + i.nx * 0.02, y: i.y + i.ny * 0.02, z: i.z + i.nz * 0.02, vx: 0, vy: 0, vz: 0, life: hard ? 0.07 : 0.05, size0: hard ? 0.34 : 0.18, size1: 0.1, rot: Math.random() * 6, spin: 0, r: hard ? 3.6 : 1.6, g: hard ? 2.6 : 1.2, b: hard ? 1.4 : 0.8, a: 1, fadeIn: 0.01, drag: 0, lift: 0, hot: false });
    if (hard) {
      // The struck spot glows for a moment as it cools.
      this.glow.spawn({ x: i.x + i.nx * 0.012, y: i.y + i.ny * 0.012, z: i.z + i.nz * 0.012, vx: 0, vy: 0, vz: 0, life: 0.55, size0: 0.09, size1: 0.05, rot: 0, spin: 0, r: 3, g: 1.5, b: 0.5, a: 0.9, fadeIn: 0.02, drag: 0, lift: 0, hot: true });
      // Now and then the round skips off: a short streak leaving the surface.
      if (Math.random() < 0.3 * n) {
        const rx = i.nx + (Math.random() - 0.5) * 1.6;
        const ry = i.ny + Math.random() * 0.7;
        const rz = i.nz + (Math.random() - 0.5) * 1.6;
        const rl = Math.hypot(rx, ry, rz) || 1;
        const reach = 5 + Math.random() * 9;
        if (this.tracers.length < TRACERS) this.tracers.push({ ox: i.x, oy: i.y, oz: i.z, dx: rx / rl, dy: ry / rl, dz: rz / rl, len: reach, t: 0, speed: 140 + Math.random() * 60, width: 0.02 });
      }
    } else {
      // Stone and wood throw a quick jet of dust straight off the face.
      this.smoke.spawn({ x: i.x + i.nx * 0.06, y: i.y + i.ny * 0.06, z: i.z + i.nz * 0.06, vx: i.nx * 3.2, vy: i.ny * 3.2 + 0.2, vz: i.nz * 3.2, life: 0.5, size0: 0.06, size1: 0.55, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 2, r: dr * 1.15, g: dg * 1.15, b: db * 1.15, a: 0.6, fadeIn: 0.04, drag: 5, lift: 0.1, hot: false });
    }
    this.decal(i);
  }

  private decal(i: Impact): void {
    _p.set(i.x + i.nx * 0.005, i.y + i.ny * 0.005, i.z + i.nz * 0.005);
    _z.set(i.nx, i.ny, i.nz);
    _o.position.copy(_p);
    _o.lookAt(_p.x + _z.x, _p.y + _z.y, _p.z + _z.z);
    _o.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.7 + Math.random() * 0.6;
    _o.scale.set(s, s, s);
    _o.updateMatrix();
    this.decals.setMatrixAt(this.decalIndex, _o.matrix);
    this.decalIndex = (this.decalIndex + 1) % this.decals.instanceMatrix.count;
    this.decalCount = Math.min(this.decals.instanceMatrix.count, this.decalCount + 1);
    this.decals.count = this.decalCount;
    this.decals.instanceMatrix.needsUpdate = true;
  }

  /**
   * A rocket leaving the tube at (x, y, z), flying along (dx, dy, dz): the
   * flash and a cloud of propellant smoke at the muzzle, and out of the back
   * the backblast, a cone of flame and a big rolling cloud of smoke and grit.
   * `own` (your launcher: its flash is drawn with the weapon) keeps the muzzle
   * smoke clear of your sight line.
   */
  rocketLaunch(x: number, y: number, z: number, dx: number, dy: number, dz: number, own = false): void {
    const n = Math.max(0.5, this.scale);
    this.flash(x, y, z, own ? 10 : 16, 140, 0xffb070);
    if (!own) {
      this.glow.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.08, size0: 1.3, size1: 0.8, rot: Math.random() * 6, spin: 0, r: 5.5, g: 4, b: 2.4, a: 1, fadeIn: 0.01, drag: 0, lift: 0, hot: false });
      this.glow.spawn({ x: x + dx * 0.4, y: y + dy * 0.4, z: z + dz * 0.4, vx: dx * 9, vy: dy * 9, vz: dz * 9, life: 0.1, size0: 0.7, size1: 0.3, rot: Math.random() * 6, spin: 0, r: 4.5, g: 2.8, b: 1.2, a: 0.9, fadeIn: 0.01, drag: 12, lift: 0, hot: false });
    }
    // Propellant smoke thrown forward and hanging in the air (your own starts a little ahead, thinner, so you can see the hit).
    const ahead = own ? 1.6 : 0.3;
    for (let k = 0; k < Math.ceil((own ? 4 : 7) * n); k++) {
      const sp = 2 + Math.random() * 4;
      this.smoke.spawn({ x: x + dx * ahead, y: y + dy * ahead, z: z + dz * ahead, vx: dx * sp + (Math.random() - 0.5) * 1.4, vy: dy * sp + Math.random() * 0.5, vz: dz * sp + (Math.random() - 0.5) * 1.4, life: 1.6 + Math.random() * 1.2, size0: 0.3, size1: (own ? 1.2 : 1.6) + Math.random() * 0.8, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.8, r: 0.78, g: 0.77, b: 0.74, a: own ? 0.22 : 0.45, fadeIn: 0.05, drag: 2.2, lift: 0.25, hot: false });
    }
    // Backblast: the tube's other end, a metre behind the muzzle (for your own, behind your head).
    const back = own ? 1.6 : 1.05;
    const bx = x - dx * back;
    const by = y - dy * back;
    const bz = z - dz * back;
    if (!own) {
      for (let k = 0; k < 3; k++) {
        const sp = 8 + k * 5;
        this.glow.spawn({ x: bx, y: by, z: bz, vx: -dx * sp, vy: -dy * sp, vz: -dz * sp, life: 0.09 + k * 0.03, size0: 0.6 + k * 0.3, size1: 1.4 + k * 0.5, rot: Math.random() * 6, spin: 0, r: 4.2, g: 2.6, b: 1.1, a: 0.85, fadeIn: 0.01, drag: 8, lift: 0, hot: true });
      }
    }
    for (let k = 0; k < Math.ceil(9 * n); k++) {
      const sp = 5 + Math.random() * 9;
      const sx = (Math.random() - 0.5) * 4;
      const sz = (Math.random() - 0.5) * 4;
      const grit = Math.random() < 0.4;
      this.smoke.spawn({ x: bx, y: by, z: bz, vx: -dx * sp + sx, vy: -dy * sp + Math.random() * 0.8, vz: -dz * sp + sz, life: 2 + Math.random() * 1.6, size0: 0.4, size1: 2.2 + Math.random() * 1.6, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6, r: grit ? 0.6 : 0.74, g: grit ? 0.55 : 0.73, b: grit ? 0.47 : 0.7, a: 0.5, fadeIn: 0.04, drag: 2.6, lift: 0.3, hot: false });
    }
    if (this.lite) return;
    for (let k = 0; k < Math.ceil(10 * n); k++) {
      const sp = 10 + Math.random() * 14;
      this.sparks.spawn({ x: bx, y: by, z: bz, vx: -dx * sp + (Math.random() - 0.5) * 5, vy: -dy * sp + (Math.random() - 0.3) * 4, vz: -dz * sp + (Math.random() - 0.5) * 5, life: 0.1 + Math.random() * 0.2, r: 3.6, g: 2.2, b: 0.8, a: 1, grav: 6, drag: 4 });
    }
  }

  /**
   * One frame of a rocket in flight, its nozzle at (x, y, z) pointing back
   * along −(dx, dy, dz): the motor's flame and glow, a little light, and the
   * smoke trail (`key` = the rocket, so its ribbon continues frame to frame).
   */
  rocket(key: object, x: number, y: number, z: number, dx: number, dy: number, dz: number, dt: number): void {
    this.rocketTrails.feed(key, x, y, z);
    const f = 0.8 + Math.random() * 0.4;
    this.glow.spawn({ x, y, z, vx: -dx * 4, vy: -dy * 4, vz: -dz * 4, life: 0.06, size0: 0.75 * f, size1: 0.35, rot: Math.random() * 6, spin: 0, r: 5, g: 3.4, b: 1.6, a: 1, fadeIn: 0.01, drag: 6, lift: 0, hot: false });
    this.rocketLightIn -= dt;
    if (this.rocketLightIn <= 0) {
      this.rocketLightIn = 0.07;
      this.flash(x, y, z, 5, 110, 0xffa050);
    }
    // Puffs along the way give the trail body (and carry it when it's seen end-on).
    if (Math.random() < (this.lite ? 0.2 : 0.45) * Math.max(0.5, this.scale)) {
      this.smoke.spawn({ x: x - dx * 0.4, y: y - dy * 0.4, z: z - dz * 0.4, vx: (Math.random() - 0.5) * 0.5, vy: 0.2, vz: (Math.random() - 0.5) * 0.5, life: 2 + Math.random() * 1.2, size0: 0.3, size1: 1.3 + Math.random() * 0.9, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.5, r: 0.85, g: 0.84, b: 0.81, a: 0.3, fadeIn: 0.08, drag: 1.5, lift: 0.2, hot: false });
    }
    if (this.lite) return;
    if (Math.random() < 0.4) {
      this.sparks.spawn({ x, y, z, vx: -dx * 12 + (Math.random() - 0.5) * 3, vy: -dy * 12 + (Math.random() - 0.5) * 3, vz: -dz * 12 + (Math.random() - 0.5) * 3, life: 0.08 + Math.random() * 0.12, r: 3.6, g: 2.4, b: 1, a: 1, grav: 2, drag: 5 });
    }
  }

  private rocketLightIn = 0;

  /** The rocket `key` hit something: its trail stops growing and drifts off. */
  rocketEnd(key: object): void {
    this.rocketTrails.end(key);
  }

  /**
   * A blast at (x, y, z) off a surface facing (nx, ny, nz) (the ground: up; a
   * rocket into a wall: the wall's face): a split-second white flash, a
   * fireball that is swallowed within moments by dirty brown-black smoke,
   * a shockwave, grit and chunks thrown out of the surface, burning bits, a
   * dust ring when it's on the ground, the smoke column and a scorch.
   */
  explosion(x: number, y: number, z: number, nx = 0, ny = 1, nz = 0): void {
    const n = Math.max(0.5, this.scale);
    /** A random direction in the hemisphere around the normal, pulled toward it by `bias`. */
    const out = (bias: number): Vector3 => {
      _s.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (_s.x * nx + _s.y * ny + _s.z * nz < 0) _s.multiplyScalar(-1);
      return _s.set(_s.x + nx * bias, _s.y + ny * bias, _s.z + nz * bias).normalize();
    };
    // The blast's center sits a little off the surface.
    const cx = x + nx * 0.35;
    const cy = y + ny * 0.35;
    const cz = z + nz * 0.35;
    const ground = ny > 0.6 && y < 1.2;
    this.flash(cx, cy + 0.3, cz, 60, 260, 0xffb070);
    // Core flash: white-hot, gone in a blink.
    this.glow.spawn({ x: cx, y: cy, z: cz, vx: 0, vy: 0, vz: 0, life: 0.08, size0: 2.4, size1: 3.6, rot: Math.random() * 6, spin: 0, r: 5, g: 4.4, b: 3.4, a: 1, fadeIn: 0.05, drag: 0, lift: 0, hot: false });
    // The shockwave: a bright ring racing out along the ground.
    if (ground) {
      const ring = this.rings.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
      ring.age = 0;
      ring.life = 0.42;
      ring.size = 15;
      ring.mesh.position.set(x, Math.max(0.05, y - 0.2), z);
      ring.mesh.rotation.y = Math.random() * 6;
      ring.mesh.visible = true;
    }
    if (!this.lite) {
      // Burning fragments arcing out, slow to die, and a few flames left licking where it hit.
      for (let k = 0; k < Math.ceil(16 * n); k++) {
        const d = out(0.6);
        const sp = 6 + Math.random() * 8;
        this.sparks.spawn({ x: cx, y: cy, z: cz, vx: d.x * sp, vy: d.y * sp + 3, vz: d.z * sp, life: 1.1 + Math.random() * 1.1, r: 3.6, g: 1.6, b: 0.4, a: 1, grav: 9, drag: 0.5 });
      }
      for (let k = 0; k < Math.ceil(6 * n); k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 1.1;
        this.glow.spawn({ x: x + Math.cos(a) * d * (1 - Math.abs(nx)), y: Math.max(0.15, y - 0.1 + (1 - ny) * (Math.random() - 0.5)), z: z + Math.sin(a) * d * (1 - Math.abs(nz)), vx: nx * 0.3, vy: 0.5 + Math.random() * 0.5, vz: nz * 0.3, life: 0.9 + Math.random() * 1.1, size0: 0.7, size1: 0.2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 2, r: 3.2, g: 2, b: 0.9, a: 0.8, fadeIn: 0.3, drag: 1, lift: 0.8, hot: true });
      }
    }
    // Fireball: hot billows pushed out of the surface, short-lived.
    for (let k = 0; k < Math.ceil(13 * n); k++) {
      const d = out(0.9);
      const sp = 2 + Math.random() * 4;
      this.glow.spawn({ x: cx + d.x * 0.3, y: cy + d.y * 0.3, z: cz + d.z * 0.3, vx: d.x * sp, vy: d.y * sp + 1, vz: d.z * sp, life: 0.2 + Math.random() * 0.22, size0: 0.8, size1: 1.8 + Math.random() * 1.2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 3, r: 3.4, g: 1.9, b: 0.7, a: 0.85, fadeIn: 0.06, drag: 5, lift: 1.5, hot: true });
    }
    // The dirty smoke that swallows it: brown-black, thrown out with the fireball and rolling up.
    for (let k = 0; k < Math.ceil(16 * n); k++) {
      const d = out(0.8);
      const sp = 2.5 + Math.random() * 4.5;
      const tone = 0.11 + Math.random() * 0.09;
      this.smoke.spawn({ x: cx + d.x * 0.5, y: cy + d.y * 0.5, z: cz + d.z * 0.5, vx: d.x * sp, vy: d.y * sp + 0.6, vz: d.z * sp, life: 2.8 + Math.random() * 1.8, size0: 2, size1: 4 + Math.random() * 2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.5, r: tone * 1.15, g: tone, b: tone * 0.85, a: 1, fadeIn: 0.12, drag: 3, lift: 0.7, hot: false });
    }
    // Sparks and burning bits.
    for (let k = 0; k < Math.ceil(36 * n); k++) {
      const d = out(0.3);
      const sp = 6 + Math.random() * 12;
      this.sparks.spawn({ x: cx, y: cy, z: cz, vx: d.x * sp, vy: d.y * sp + 2, vz: d.z * sp, life: 0.4 + Math.random() * 0.8, r: 3.5, g: 2, b: 0.7, a: 1, grav: 10, drag: 1.2 });
    }
    // Chunks of whatever it hit, and a spray of grit.
    for (let k = 0; k < Math.ceil(12 * n); k++) {
      const d = out(0.7);
      const sp = 4 + Math.random() * 7;
      this.debris.spawn({ x: cx, y: cy, z: cz, vx: d.x * sp, vy: d.y * sp + 3, vz: d.z * sp, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, wx: (Math.random() - 0.5) * 16, wy: (Math.random() - 0.5) * 16, wz: (Math.random() - 0.5) * 16, life: 4 + Math.random() * 2, s: 0.04 + Math.random() * 0.07 });
    }
    if (!this.lite) {
      for (let k = 0; k < Math.ceil(26 * n); k++) {
        const d = out(1.2);
        const sp = 5 + Math.random() * 10;
        const tone = 0.22 + Math.random() * 0.18;
        this.bits.spawn({ x: cx, y: cy, z: cz, vx: d.x * sp, vy: d.y * sp + 2, vz: d.z * sp, life: 0.7 + Math.random() * 0.7, r: tone * 1.1, g: tone, b: tone * 0.85, a: 1, grav: 14, drag: 1 });
      }
    }
    if (ground) {
      // Dust ring along the ground, and dirt thrown up in a crown.
      for (let k = 0; k < Math.ceil(12 * n); k++) {
        const a = (k / 12) * Math.PI * 2;
        this.smoke.spawn({ x, y: 0.3, z, vx: Math.cos(a) * 6, vy: 0.2, vz: Math.sin(a) * 6, life: 1.6 + Math.random() * 0.8, size0: 0.6, size1: 3.2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6, r: 0.5, g: 0.46, b: 0.4, a: 0.55, fadeIn: 0.05, drag: 2.6, lift: 0.3, hot: false });
      }
      for (let k = 0; k < Math.ceil(5 * n); k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 2;
        this.smoke.spawn({ x: x + Math.cos(a) * 0.4, y: 0.4, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: 6 + Math.random() * 4, vz: Math.sin(a) * sp, life: 1.4 + Math.random() * 0.8, size0: 0.4, size1: 1.8 + Math.random(), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6, r: 0.42, g: 0.37, b: 0.31, a: 0.7, fadeIn: 0.04, drag: 2.4, lift: -1.5, hot: false });
      }
    } else {
      // Off a wall: a burst of dust and grit along its face.
      for (let k = 0; k < Math.ceil(8 * n); k++) {
        const d = out(0.2);
        const sp = 4 + Math.random() * 4;
        this.smoke.spawn({ x: cx, y: cy, z: cz, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: 1.4 + Math.random() * 0.8, size0: 0.5, size1: 2.4, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6, r: 0.5, g: 0.47, b: 0.42, a: 0.5, fadeIn: 0.05, drag: 2.8, lift: 0.2, hot: false });
      }
    }
    // The smoke column, lingering.
    for (let k = 0; k < Math.ceil(13 * n); k++) {
      this.smoke.spawn({ x: cx + (Math.random() - 0.5) * 1.2, y: cy + 0.4 + Math.random() * 1.4, z: cz + (Math.random() - 0.5) * 1.2, vx: (Math.random() - 0.5) * 1.6 + nx * 0.8, vy: 1.8 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.6 + nz * 0.8, life: 4 + Math.random() * 3.5, size0: 1.4, size1: 6 + Math.random() * 3.5, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4, r: 0.21, g: 0.19, b: 0.17, a: 0.75, fadeIn: 0.1, drag: 0.9, lift: 0.3, hot: false });
    }
    if (!ground) return;
    // Scorch mark.
    _o.position.set(x, 0.012, z);
    _o.rotation.set(0, Math.random() * Math.PI * 2, 0);
    _o.scale.setScalar(3 + Math.random());
    _o.updateMatrix();
    this.scorches.setMatrixAt(this.scorchIndex % 6, _o.matrix);
    this.scorchIndex++;
    this.scorches.count = Math.min(6, this.scorchIndex);
    this.scorches.visible = true;
    this.scorches.instanceMatrix.needsUpdate = true;
  }

  /** A small dust kick (landing, footsteps in the sand). */
  dust(x: number, y: number, z: number, amount: number): void {
    if (this.puffs) {
      for (let k = 0; k < Math.ceil(amount * this.scale); k++) {
        const a = Math.random() * Math.PI * 2;
        this.puffs.spawn({ x, y: y + 0.05, z, vx: Math.cos(a) * 1.2, vy: 0.4 + Math.random() * 0.5, vz: Math.sin(a) * 1.2, life: 0.6 + Math.random() * 0.4, r: 0.45, g: 0.43, b: 0.4, a: 0.4, grav: -0.2, drag: 3 });
      }
      return;
    }
    for (let k = 0; k < Math.ceil(amount * this.scale); k++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn({ x, y: y + 0.08, z, vx: Math.cos(a) * 1.2, vy: 0.3, vz: Math.sin(a) * 1.2, life: 0.8 + Math.random() * 0.4, size0: 0.15, size1: 0.7, rot: Math.random() * 6, spin: 0, r: 0.45, g: 0.43, b: 0.4, a: 0.35, fadeIn: 0.1, drag: 3, lift: 0.1, hot: false });
    }
  }

  private ambient(dt: number): void {
    this.time += dt;
    for (const e of this.emitters) {
      if (e.kind === "plume") {
        // Big dark billows rising and leaning downwind, lit warm at the top by the sun.
        e.acc += dt * 1.6;
        while (e.acc >= 1) {
          e.acc -= 1;
          const k = Math.random();
          this.smoke.spawn({ x: e.x + (Math.random() - 0.5) * 4, y: 2 + Math.random() * 3, z: e.z + (Math.random() - 0.5) * 4, vx: 0.9 + Math.random() * 0.6, vy: e.h / 18, vz: 0.3, life: 18 + Math.random() * 6, size0: 6, size1: 26 + k * 12, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.08, r: 0.2 + k * 0.08, g: 0.19 + k * 0.07, b: 0.18 + k * 0.05, a: 0.8, fadeIn: 0.08, drag: 0.02, lift: 0, hot: false });
        }
        if (Math.random() < dt * 3) this.glow.spawn({ x: e.x + (Math.random() - 0.5) * 3, y: 1.5 + Math.random() * 2, z: e.z + (Math.random() - 0.5) * 3, vx: 0, vy: 2.5, vz: 0, life: 1.2, size0: 4, size1: 7, rot: Math.random() * 6, spin: 0, r: 3, g: 1.5, b: 0.5, a: 0.7, fadeIn: 0.15, drag: 0.5, lift: 0, hot: true });
      } else {
        // The wreck: licking flames, a flickering light, a steady smoke trail.
        e.acc += dt * 26 * Math.max(0.5, this.scale);
        while (e.acc >= 1) {
          e.acc -= 1;
          this.glow.spawn({ x: e.x + (Math.random() - 0.5) * 1.8, y: e.y + Math.random() * 0.3, z: e.z + (Math.random() - 0.5) * 0.9, vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.3, life: 0.45 + Math.random() * 0.35, size0: 0.9, size1: 0.3, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 2, r: 3.4, g: 2.2, b: 1.1, a: 0.85, fadeIn: 0.15, drag: 1, lift: 1.5, hot: true });
          if (Math.random() < 0.22) this.smoke.spawn({ x: e.x + (Math.random() - 0.5) * 1.2, y: e.y + 1.0, z: e.z + (Math.random() - 0.5) * 0.6, vx: 0.45 + Math.random() * 0.3, vy: 1.4 + Math.random() * 0.8, vz: 0.12, life: 7 + Math.random() * 3, size0: 0.6, size1: 4.5 + Math.random() * 3, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.3, r: 0.16, g: 0.15, b: 0.14, a: 0.42, fadeIn: 0.12, drag: 0.4, lift: 0.1, hot: false });
        }
        if (this.fireLight) this.fireLight.intensity = 9 + Math.sin(this.time * 17) * 2.5 + Math.sin(this.time * 7.3) * 2;
      }
    }
    // Now and then something big goes off out past the walls.
    const plumes = this.emitters.filter((e) => e.kind === "plume");
    if (plumes.length && this.time > this.distantAt) {
      this.distantAt = this.time + 14 + Math.random() * 18;
      const e = plumes[Math.floor(Math.random() * plumes.length)]!;
      this.glow.spawn({ x: e.x, y: 4, z: e.z, vx: 0, vy: 3, vz: 0, life: 0.9, size0: 10, size1: 22, rot: 0, spin: 0, r: 5, g: 3, b: 1.4, a: 1, fadeIn: 0.05, drag: 0, lift: 0, hot: true });
      for (let k = 0; k < 6; k++) this.smoke.spawn({ x: e.x + (Math.random() - 0.5) * 8, y: 6 + Math.random() * 6, z: e.z + (Math.random() - 0.5) * 8, vx: 0.6, vy: 3, vz: 0.2, life: 14, size0: 10, size1: 28, rot: Math.random() * 6, spin: 0, r: 0.24, g: 0.22, b: 0.2, a: 0.75, fadeIn: 0.05, drag: 0.1, lift: 0, hot: false });
      this.onDistant?.();
    }
  }

  update(dt: number, camera: PerspectiveCamera): void {
    camera.getWorldPosition(_cam);
    if (this.ambience && dt > 0) this.ambient(dt);
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!;
      t.t += dt * t.speed;
      if (t.t - 7 > t.len) {
        this.tracers.splice(i, 1);
      }
    }
    /** Lays the unit quad along a path segment centred at `_p` (axis in `_x`), turned to face the camera. */
    const lay = (len: number, width: number): boolean => {
      _z.copy(_cam).sub(_p);
      _y.crossVectors(_z, _x).normalize();
      if (_y.lengthSq() < 1e-6) return false;
      _z.crossVectors(_x, _y).normalize();
      _m.makeBasis(_x, _y, _z);
      _q.setFromRotationMatrix(_m);
      _s.set(len, width, 1);
      _m.compose(_p, _q, _s);
      return true;
    };
    for (const t of this.tracers) {
      const head = Math.min(t.len, t.t);
      const tail = Math.max(0, t.t - 7);
      const seg = head - tail;
      if (seg <= 0.05) continue;
      const mid = (head + tail) / 2;
      _p.set(t.ox + t.dx * mid, t.oy + t.dy * mid, t.oz + t.dz * mid);
      _x.set(t.dx, t.dy, t.dz);
      const w = t.width * Math.max(1, _p.distanceTo(_cam) * 0.06);
      if (!lay(seg, w)) continue;
      this.tracerMesh.setColorAt(n, _c.setRGB(1, 1, 1));
      this.tracerMesh.setMatrixAt(n++, _m);
      // Halo: the same streak, four times as wide and dim.
      if (!this.lite && lay(seg, w * 4.5)) {
        this.tracerMesh.setColorAt(n, _c.setRGB(0.2, 0.11, 0.04));
        this.tracerMesh.setMatrixAt(n++, _m);
      }
      if (n >= TRACERS * 2 - 1) break;
    }
    this.tracerMesh.count = n;
    this.tracerMesh.visible = n > 0;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;
    // Trails: the whole path behind the round, thinning out.
    let tn = 0;
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i]!;
      t.age += dt;
      if (t.age >= t.life) this.trails.splice(i, 1);
    }
    for (const t of this.trails) {
      // It only exists where the round has already been.
      const reached = Math.min(t.len, t.age * 400);
      if (reached < 1) continue;
      _p.set(t.ox + (t.dx * reached) / 2, t.oy + (t.dy * reached) / 2, t.oz + (t.dz * reached) / 2);
      _x.set(t.dx, t.dy, t.dz);
      const k = 1 - t.age / t.life;
      if (!lay(reached, t.width * (1 + (1 - k) * 2.5) * Math.max(1, _p.distanceTo(_cam) * 0.04))) continue;
      const f = 0.22 * k * k;
      this.trailMesh.setColorAt(tn, _c.setRGB(f, f * 0.92, f * 0.8));
      this.trailMesh.setMatrixAt(tn++, _m);
    }
    this.trailMesh.count = tn;
    this.trailMesh.visible = tn > 0;
    this.trailMesh.instanceMatrix.needsUpdate = true;
    if (this.trailMesh.instanceColor) this.trailMesh.instanceColor.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      // Fast at first, slowing as it spreads.
      r.mesh.scale.setScalar(r.size * (1 - (1 - k) * (1 - k)) + 0.5);
      const f = (1 - k) * (1 - k) * 2.2;
      (r.mesh.material as MeshBasicMaterial).color.setRGB(f, f * 0.8, f * 0.55);
    }
    this.decals.visible = this.decalCount > 0;
    this.sparks.update(dt);
    this.bits.update(dt);
    this.puffs?.update(dt);
    this.smoke.update(dt, _cam);
    this.glow.update(dt, _cam);
    this.rocketTrails.update(dt, _cam, performance.now() / 1000);
    this.casings.update(dt);
    this.debris.update(dt);
    const now = performance.now();
    for (const l of this.lights) {
      if (l.until < now) {
        l.light.intensity = 0;
        continue;
      }
      const k = (now - l.start) / Math.max(1, l.until - l.start);
      l.light.intensity = l.peak * (1 - k) * (1 - k);
    }
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.sparks.dispose();
    this.bits.dispose();
    this.puffs?.dispose();
    this.puffs?.points.removeFromParent();
    this.smoke.dispose();
    this.glow.dispose();
    this.trailMesh.dispose();
    this.rocketTrails.dispose();
    this.casings.mesh.dispose();
    this.debris.mesh.dispose();
    for (const o of [this.tracerMesh, this.trailMesh, ...this.rings.map((r) => r.mesh), this.decals, this.scorches, this.sparks.points, this.bits.points, this.smoke.mesh, this.glow.mesh, this.rocketTrails.mesh, this.casings.mesh, this.debris.mesh]) o.removeFromParent();
    for (const l of this.lights) l.light.removeFromParent();
    this.fireLight?.removeFromParent();
  }
}
