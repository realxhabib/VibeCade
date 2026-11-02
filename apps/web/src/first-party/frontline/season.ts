/**
 * Seasons in the yard (the host picks one in the challenge setup, or it
 * follows the calendar; see `options.ts`):
 *
 * - Winter: snowfall, snow lying on the ground (drifts against walls, none
 *   under the warehouse roof) and capping every exposed top, an overcast
 *   sky, cold light and thicker fog.
 * - Autumn: leaves tumbling down, drifts of fallen leaves along the walls,
 *   a low golden sun and a hazier yard.
 * - Spring: blossom petals on the breeze and scattered on the ground, fresh
 *   green-tinted light.
 * - Summer: the original sun-bleached port, with dust motes in the air.
 *
 * Purely visual and local (nothing here touches the simulation). Falling
 * particles live in a box around the camera and wrap as it moves; one that
 * reaches a roof or the ground starts again at the top, so nothing falls
 * through the warehouse roof or into a container. Counts scale with the
 * quality tier's particle budget and drop with reduced motion.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Float32BufferAttribute,
  Fog,
  FogExp2,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  BufferGeometry,
  type DirectionalLight,
  type HemisphereLight,
  type Material,
  type Scene,
  type Texture,
  type Vector3,
} from "three";
import { Buf, hashN } from "./geo";
import type { MapDef } from "./map";
import type { Season } from "./options";
import type { Box } from "./physics";
import { softDot } from "./textures";

/* ---------------------------------------------------------------------- */
/* Light, fog and sky                                                     */
/* ---------------------------------------------------------------------- */

interface SeasonLook {
  fog: number;
  /** Fog thickness multiplier (exp² density up, linear far distance down). */
  fogK: number;
  sun: number;
  sunK: number;
  hemiSky: number;
  hemiGround: number;
  hemiK: number;
  /** Sky (HDRI) brightness multiplier. */
  skyK: number;
  /** Low tier's gradient sky dome. */
  sky: MapDef["sky"];
  /** Replace the HDRI backdrop with an overcast gradient (keeps its light). */
  overcast?: [top: number, horizon: number];
}

const LOOKS: Record<Season, SeasonLook | null> = {
  summer: null,
  winter: {
    fog: 0xdce2e9,
    fogK: 1.7,
    sun: 0xe6eeff,
    sunK: 0.62,
    hemiSky: 0xe4ecf7,
    hemiGround: 0xc9d0d8,
    hemiK: 1.35,
    skyK: 0.8,
    sky: { top: 0x9db2c6, horizon: 0xe3e8ec, ground: 0xd8dde2, fog: 0xdde3ea },
    overcast: [0x8d9fb2, 0xdfe5eb],
  },
  autumn: {
    fog: 0xd3ba94,
    fogK: 1.25,
    sun: 0xffb46e,
    sunK: 0.92,
    hemiSky: 0xe0d6c4,
    hemiGround: 0x6e5034,
    hemiK: 1,
    skyK: 0.85,
    sky: { top: 0x84a3c2, horizon: 0xefcf9f, ground: 0xa48a62, fog: 0xe8cfa6 },
  },
  spring: {
    fog: 0xcfd9d1,
    fogK: 0.9,
    sun: 0xfff3dc,
    sunK: 1,
    hemiSky: 0xdcebfa,
    hemiGround: 0x667152,
    hemiK: 1.05,
    skyK: 0.92,
    sky: { top: 0x6fb0e6, horizon: 0xe6ecdf, ground: 0x9aa486, fog: 0xe0e8dc },
  },
};

/** The map as the renderer should paint it this season (sky colors for the low tier's dome and fog). */
export function seasonalMap(map: MapDef, season: Season): MapDef {
  const look = LOOKS[season];
  return look ? { ...map, sky: look.sky } : map;
}

/**
 * Re-tints what the engine set up for summer: fog, the two lights and the
 * sky. Returns the textures it made (the overcast backdrop) for disposal.
 */
export function applySeasonLight(season: Season, scene: Scene, hemi: HemisphereLight, sun: DirectionalLight): Texture[] {
  const look = LOOKS[season];
  if (!look) return [];
  const fog = scene.fog;
  if (fog instanceof FogExp2) {
    fog.color.setHex(look.fog);
    fog.density *= look.fogK;
  } else if (fog instanceof Fog) {
    fog.color.setHex(look.fog);
    fog.near /= look.fogK;
  }
  sun.color.setHex(look.sun);
  sun.intensity *= look.sunK;
  hemi.color.setHex(look.hemiSky);
  hemi.groundColor.setHex(look.hemiGround);
  hemi.intensity *= look.hemiK;
  scene.backgroundIntensity *= look.skyK;
  if (scene.background instanceof Color) scene.background.setHex(look.sky.horizon);
  else if (look.overcast && scene.background) {
    const tex = gradientSky(look.overcast[0], look.overcast[1], look.fog);
    scene.background = tex;
    return [tex];
  }
  return [];
}

/** Equirectangular vertical gradient: zenith → horizon → a little below. */
function gradientSky(top: number, horizon: number, below: number): Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, hex(top));
  g.addColorStop(0.47, hex(horizon));
  g.addColorStop(0.53, hex(below));
  g.addColorStop(1, hex(below));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(c);
  t.mapping = EquirectangularReflectionMapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------------- */
/* Shelter: what's overhead                                               */
/* ---------------------------------------------------------------------- */

/** 1 m grid over the yard: the highest top of anything solid there, and whether a roof covers the ground. */
export class Shelter {
  readonly top: Float32Array;
  readonly roofed: Uint8Array;
  readonly w: number;
  readonly h: number;

  constructor(readonly map: MapDef) {
    const { bounds } = map;
    this.w = Math.ceil(bounds.x1 - bounds.x0);
    this.h = Math.ceil(bounds.z1 - bounds.z0);
    this.top = new Float32Array(this.w * this.h);
    this.roofed = new Uint8Array(this.w * this.h);
    for (const b of map.boxes) {
      if (b.ghost) continue;
      const i0 = Math.max(0, Math.floor(b.x0 - bounds.x0));
      const i1 = Math.min(this.w - 1, Math.ceil(b.x1 - bounds.x0) - 1);
      const j0 = Math.max(0, Math.floor(b.z0 - bounds.z0));
      const j1 = Math.min(this.h - 1, Math.ceil(b.z1 - bounds.z0) - 1);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          // Cell centers only: a box must cover the middle of the cell.
          const cx = bounds.x0 + i + 0.5;
          const cz = bounds.z0 + j + 0.5;
          if (cx < b.x0 || cx > b.x1 || cz < b.z0 || cz > b.z1) continue;
          const k = j * this.w + i;
          if (b.y1 > this.top[k]!) this.top[k] = b.y1;
          if (b.y0 > 1.2) this.roofed[k] = 1;
        }
    }
  }

  private cell(x: number, z: number): number {
    const i = Math.floor(x - this.map.bounds.x0);
    const j = Math.floor(z - this.map.bounds.z0);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }

  /** Where something falling at (x, z) lands. */
  floorAt(x: number, z: number): number {
    const k = this.cell(x, z);
    return k < 0 ? 0 : this.top[k]!;
  }

  isRoofed(x: number, z: number): boolean {
    const k = this.cell(x, z);
    return k >= 0 && this.roofed[k] === 1;
  }

  /** Inside (or right next to) a solid box at ground level. */
  blocked(x: number, z: number, pad = 0.15): boolean {
    return this.map.boxes.some((b) => !b.ghost && b.y0 < 0.3 && x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad);
  }

  /** Near a wall or a container (where leaves and snow pile up). */
  nearWall(x: number, z: number, d = 1.4): boolean {
    return this.map.boxes.some((b) => !b.ghost && b.y0 < 0.3 && b.y1 > 1.5 && x > b.x0 - d && x < b.x1 + d && z > b.z0 - d && z < b.z1 + d);
  }
}

/* ---------------------------------------------------------------------- */
/* Textures                                                               */
/* ---------------------------------------------------------------------- */

function canvasTexture(c: HTMLCanvasElement, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A leaf in near-white (instance colors tint it): pointed blade, a stem and veins. */
function leafTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.translate(32, 32);
  ctx.rotate(-Math.PI / 4);
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.bezierCurveTo(17, -16, 18, 10, 0, 22);
  ctx.bezierCurveTo(-18, 10, -17, -16, 0, -27);
  ctx.fillStyle = "#f4f0ea";
  ctx.fill();
  ctx.strokeStyle = "rgba(120,100,80,0.55)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, 30);
  for (const y of [-12, -3, 6, 14]) {
    ctx.moveTo(0, y);
    ctx.lineTo(9, y - 7);
    ctx.moveTo(0, y);
    ctx.lineTo(-9, y - 7);
  }
  ctx.stroke();
  return canvasTexture(c);
}

/** One boot print (dark, soft edged), toe up. */
function bootTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(70,82,96,0.75)";
  ctx.filter = "blur(1px)";
  ctx.beginPath();
  ctx.ellipse(16, 20, 10, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(16, 49, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvasTexture(c);
}

/** A blossom petal: rounded with a notch at the tip and a blush at the base. */
function petalTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.translate(32, 34);
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.bezierCurveTo(-24, 8, -20, -26, -5, -24);
  ctx.lineTo(0, -16);
  ctx.lineTo(5, -24);
  ctx.bezierCurveTo(20, -26, 24, 8, 0, 24);
  const g = ctx.createLinearGradient(0, 24, 0, -24);
  g.addColorStop(0, "#f2c9d6");
  g.addColorStop(0.45, "#fff4f7");
  g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g;
  ctx.fill();
  return canvasTexture(c);
}

/**
 * Snow lying on the yard (RGBA, white): patchy cover, deeper drifts against
 * walls and containers, bare under the roof. 6 px per meter.
 */
function snowGround(map: MapDef, shelter: Shelter): Texture {
  const PX = 6;
  const { bounds } = map;
  const W = Math.ceil((bounds.x1 - bounds.x0) * PX);
  const H = Math.ceil((bounds.z1 - bounds.z0) * PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const X = (x: number) => (x - bounds.x0) * PX;
  const Z = (z: number) => (z - bounds.z0) * PX;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(0, 0, W, H);
  const blob = (x: number, z: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * PX);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(X(x) - r * PX, Z(z) - r * PX, r * 2 * PX, r * 2 * PX);
  };
  const w = bounds.x1 - bounds.x0;
  const h = bounds.z1 - bounds.z0;
  for (let i = 0; i < 900; i++) blob(bounds.x0 + hashN(i * 3 + 1) * w, bounds.z0 + hashN(i * 7 + 2) * h, 0.8 + hashN(i * 11 + 3) * 3.2, 0.2 + hashN(i * 13 + 4) * 0.35);
  // Drifts along the walls and containers.
  for (const b of map.boxes) {
    if (b.ghost || b.y0 > 0.3 || b.y1 < 1.2) continue;
    const steps = Math.max(2, Math.round(((b.x1 - b.x0 + b.z1 - b.z0) * 2) / 1.2));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const side = s % 4;
      const x = side < 2 ? b.x0 + t * (b.x1 - b.x0) : side === 2 ? b.x0 - 0.3 : b.x1 + 0.3;
      const z = side >= 2 ? b.z0 + t * (b.z1 - b.z0) : side === 0 ? b.z0 - 0.3 : b.z1 + 0.3;
      blob(x, z, 1.1 + hashN(s * 5 + b.x0 * 13) * 0.8, 0.45);
    }
  }
  // Worn paths where people run: a few long, faint scuffs through the middle lanes.
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.18 + hashN(i * 31) * 0.2})`;
    ctx.lineWidth = (0.5 + hashN(i * 37) * 0.7) * PX;
    ctx.beginPath();
    const x0 = bounds.x0 + hashN(i * 41) * w;
    const z0 = bounds.z0 + hashN(i * 43) * h;
    ctx.moveTo(X(x0), Z(z0));
    ctx.quadraticCurveTo(X(x0 + (hashN(i * 47) - 0.5) * 30), Z(z0 + (hashN(i * 53) - 0.5) * 30), X(x0 + (hashN(i * 59) - 0.5) * 40), Z(z0 + (hashN(i * 61) - 0.5) * 40));
    ctx.stroke();
  }
  // Nothing under the roof (feathered at the edge).
  ctx.fillStyle = "rgba(0,0,0,1)";
  for (let j = 0; j < shelter.h; j++)
    for (let i = 0; i < shelter.w; i++) {
      if (!shelter.roofed[j * shelter.w + i]) continue;
      ctx.fillRect(i * PX - 1, j * PX - 1, PX + 2, PX + 2);
    }
  ctx.globalCompositeOperation = "source-over";
  return canvasTexture(c);
}

/* ---------------------------------------------------------------------- */
/* The seasonal dressing                                                  */
/* ---------------------------------------------------------------------- */

export interface SeasonFxOptions {
  /** Particle budget multiplier (quality tier). */
  budget: number;
  reduceMotion: boolean;
  shadows: boolean;
  /** PBR materials (medium/high) or Lambert (low). */
  pbr: boolean;
}

/** Falling things: snow (points), motes (points), leaves and petals (tumbling quads). */
type FallKind = "snow" | "motes" | "leaves" | "petals";

const FALL: Record<Season, { kind: FallKind; max: number; speed: [number, number]; sway: number; size: [number, number] }> = {
  winter: { kind: "snow", max: 2400, speed: [0.8, 1.5], sway: 0.35, size: [0, 0] },
  autumn: { kind: "leaves", max: 320, speed: [0.9, 1.6], sway: 1.1, size: [0.15, 0.24] },
  spring: { kind: "petals", max: 420, speed: [0.45, 0.85], sway: 0.9, size: [0.07, 0.11] },
  summer: { kind: "motes", max: 260, speed: [-0.05, 0.08], sway: 0.25, size: [0, 0] },
};

const LEAF_COLORS = [0xd8641e, 0xc0391b, 0xe9a12a, 0x8f4a1c, 0xb8761f, 0x9b2f17, 0xd9b33a];
const PETAL_COLORS = [0xffd6e4, 0xffb3cc, 0xff9cbe, 0xfff0f5];

/** Half-width of the box of falling things around the camera, and its height. */
const R = 17;
const TOP = 17;
const WIND = { x: 0.55, z: 0.3 };
/** Boot prints kept in the snow (about 15 seconds of a full table running around). */
const PRINTS = 480;

export class SeasonFx {
  readonly group = new Group();
  private readonly shelter: Shelter;
  private readonly owned: { textures: Texture[]; materials: Material[]; geometries: BufferGeometry[] } = { textures: [], materials: [], geometries: [] };
  private readonly kind: FallKind;
  private readonly max: number;
  private count = 0;
  private readonly p: Float32Array;
  /** Per particle: fall speed, phase, sway, spin (3), size. */
  private readonly vy: Float32Array;
  private readonly ph: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly size: Float32Array;
  private readonly sway: number;
  private readonly speedK: number;
  private points: Points | null = null;
  private quads: InstancedMesh | null = null;
  private litter: InstancedMesh | null = null;
  /** Winter: a ring of boot prints (the oldest are reused). */
  private prints: InstancedMesh | null = null;
  private printNext = 0;
  private readonly printSide = new Map<string, number>();
  private readonly dummy = new Object3D();
  private seed = 1;

  constructor(
    map: MapDef,
    readonly season: Season,
    private readonly opts: SeasonFxOptions,
  ) {
    this.shelter = new Shelter(map);
    const fall = FALL[season];
    this.kind = fall.kind;
    this.sway = fall.sway;
    this.speedK = opts.reduceMotion ? 0.55 : 1;
    this.max = Math.round(fall.max * (opts.reduceMotion ? 0.5 : 1));
    this.p = new Float32Array(this.max * 3);
    this.vy = new Float32Array(this.max);
    this.ph = new Float32Array(this.max);
    this.rot = new Float32Array(this.max * 3);
    this.spin = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    const cx = (map.bounds.x0 + map.bounds.x1) / 2;
    const cz = (map.bounds.z0 + map.bounds.z1) / 2;
    for (let i = 0; i < this.max; i++) {
      this.vy[i] = fall.speed[0] + this.rand() * (fall.speed[1] - fall.speed[0]);
      this.ph[i] = this.rand() * Math.PI * 2;
      this.size[i] = fall.size[0] + this.rand() * (fall.size[1] - fall.size[0]);
      for (let a = 0; a < 3; a++) {
        this.rot[i * 3 + a] = this.rand() * Math.PI * 2;
        this.spin[i * 3 + a] = (this.rand() - 0.5) * 5;
      }
      this.p[i * 3] = cx + (this.rand() * 2 - 1) * R;
      this.p[i * 3 + 1] = this.kind === "motes" ? 0.3 + this.rand() * 4.5 : this.rand() * TOP;
      this.p[i * 3 + 2] = cz + (this.rand() * 2 - 1) * R;
    }

    if (season === "winter") {
      this.buildSnowCover(map);
      const mat = this.mat(new MeshBasicMaterial({ map: this.tex(bootTexture()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      this.prints = new InstancedMesh(this.geo(new PlaneGeometry(0.13, 0.28).rotateX(-Math.PI / 2)), mat, PRINTS);
      this.prints.count = 0;
      this.prints.frustumCulled = false;
      this.prints.renderOrder = 2;
      this.group.add(this.prints);
    }
    if (season === "autumn") this.buildLitter(map, "leaves");
    if (season === "spring") this.buildLitter(map, "petals");

    if (this.kind === "snow" || this.kind === "motes") {
      const geo = this.geo(new BufferGeometry());
      geo.setAttribute("position", new Float32BufferAttribute(this.p, 3));
      const snow = this.kind === "snow";
      const mat = this.mat(
        new PointsMaterial({
          map: this.tex(softDot(snow ? 0.35 : 0.1, snow ? "255,255,255" : "255,240,205")),
          size: snow ? 0.12 : 0.05,
          sizeAttenuation: true,
          transparent: true,
          opacity: snow ? 0.95 : 0.55,
          depthWrite: false,
          blending: snow ? undefined : AdditiveBlending,
        }),
      );
      this.points = new Points(geo, mat);
      this.points.frustumCulled = false;
      this.group.add(this.points);
    } else {
      const geo = this.geo(new PlaneGeometry(1, 1));
      const tex = this.tex(this.kind === "leaves" ? leafTexture() : petalTexture());
      const mat = this.mat(opts.pbr ? new MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, roughness: 0.85, metalness: 0 }) : new MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide }));
      this.quads = new InstancedMesh(geo, mat, this.max);
      this.quads.frustumCulled = false;
      this.quads.castShadow = false;
      const colors = this.kind === "leaves" ? LEAF_COLORS : PETAL_COLORS;
      const col = new Color();
      for (let i = 0; i < this.max; i++) this.quads.setColorAt(i, col.setHex(colors[Math.floor(this.rand() * colors.length)]!));
      this.group.add(this.quads);
    }
    this.setBudget(opts.budget);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private tex<T extends Texture>(t: T): T {
    this.owned.textures.push(t);
    return t;
  }

  private mat<T extends Material>(m: T): T {
    this.owned.materials.push(m);
    return m;
  }

  private geo<T extends BufferGeometry>(g: T): T {
    this.owned.geometries.push(g);
    return g;
  }

  setBudget(budget: number): void {
    this.count = Math.max(0, Math.min(this.max, Math.round(this.max * Math.max(0.3, budget))));
    if (this.points) this.points.geometry.setDrawRange(0, this.count);
    if (this.quads) this.quads.count = this.count;
  }

  /** Snow on the ground and a cap on every exposed top. */
  private buildSnowCover(map: MapDef): void {
    const { bounds } = map;
    const W = bounds.x1 - bounds.x0;
    const H = bounds.z1 - bounds.z0;
    const tex = this.tex(snowGround(map, this.shelter));
    const groundMat = this.mat(
      this.opts.pbr
        ? new MeshStandardMaterial({ map: tex, color: 0xeef3f8, roughness: 0.85, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
        : new MeshLambertMaterial({ map: tex, color: 0xeef3f8, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    const ground = new Mesh(this.geo(new PlaneGeometry(W, H).rotateX(-Math.PI / 2)), groundMat);
    ground.position.set((bounds.x0 + bounds.x1) / 2, 0.015, (bounds.z0 + bounds.z1) / 2);
    ground.receiveShadow = this.opts.shadows;
    ground.renderOrder = 1;
    this.group.add(ground);

    const caps = new Buf();
    for (const b of map.boxes) {
      if (!capped(b, map.boxes)) continue;
      const o = 0.03;
      const k = 0.93 + hashN(Math.round(b.x0 * 7 + b.z0 * 13)) * 0.07;
      caps.box(b.x0 - o, b.y1, b.z0 - o, b.x1 + o, b.y1 + 0.07, b.z1 + o, [k, k, k * 1.02], { scale: 1, ao: 0.82 });
    }
    if (!caps.empty) {
      const capMat = this.mat(this.opts.pbr ? new MeshStandardMaterial({ color: 0xe9eef4, vertexColors: true, roughness: 0.8, metalness: 0 }) : new MeshLambertMaterial({ color: 0xe9eef4, vertexColors: true }));
      const mesh = new Mesh(this.geo(caps.geometry()), capMat);
      mesh.castShadow = false;
      mesh.receiveShadow = this.opts.shadows;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  /** Fallen leaves (autumn) or petals (spring) lying on the ground, thickest along the walls. */
  private buildLitter(map: MapDef, kind: "leaves" | "petals"): void {
    const leaves = kind === "leaves";
    const target = Math.round((leaves ? 5200 : 1800) * Math.max(0.4, this.opts.budget));
    const tex = this.tex(leaves ? leafTexture() : petalTexture());
    const mat = this.mat(this.opts.pbr ? new MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.9, metalness: 0 }) : new MeshLambertMaterial({ map: tex, alphaTest: 0.5 }));
    const geo = this.geo(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    const mesh = new InstancedMesh(geo, mat, target);
    const colors = leaves ? LEAF_COLORS : PETAL_COLORS;
    const col = new Color();
    const { bounds } = map;
    const W = bounds.x1 - bounds.x0;
    const H = bounds.z1 - bounds.z0;
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < target * 8 && n < target; i++) {
      // Clumps: most land near a wall, the rest scattered (and a few blown under the roof).
      const x = bounds.x0 + 0.3 + hashN(i * 3 + 17) * (W - 0.6);
      const z = bounds.z0 + 0.3 + hashN(i * 5 + 29) * (H - 0.6);
      if (this.shelter.blocked(x, z)) continue;
      const wall = this.shelter.nearWall(x, z);
      const keep = (wall ? 1 : leaves ? 0.35 : 0.4) * (this.shelter.isRoofed(x, z) ? 0.12 : 1);
      if (hashN(i * 7 + 41) > keep) continue;
      const s = (leaves ? 0.17 : 0.08) + hashN(i * 11 + 3) * (leaves ? 0.12 : 0.04);
      d.position.set(x, 0.012 + hashN(i * 13) * 0.02, z);
      d.rotation.set((hashN(i * 17) - 0.5) * 0.25, hashN(i * 19) * Math.PI * 2, (hashN(i * 23) - 0.5) * 0.25, "YXZ");
      d.scale.set(s, 1, s);
      d.updateMatrix();
      mesh.setMatrixAt(n, d.matrix);
      // Fallen leaves are a shade darker than the ones in the air.
      col.setHex(colors[Math.floor(hashN(i * 29) * colors.length)]!).multiplyScalar(leaves ? 0.82 : 0.95);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mesh.castShadow = false;
    mesh.receiveShadow = this.opts.shadows;
    this.group.add(mesh);
    this.litter = mesh;
  }

  setShadows(on: boolean): void {
    this.opts.shadows = on;
    this.group.traverse((o) => {
      if (o instanceof Mesh && o !== this.quads) o.receiveShadow = on;
    });
  }

  /** Winter: a boot print where `id` just stepped (alternating feet, facing `yaw`). */
  footprint(id: string, x: number, z: number, yaw: number): void {
    const prints = this.prints;
    if (!prints || this.shelter.isRoofed(x, z) || this.shelter.blocked(x, z, 0)) return;
    const side = (this.printSide.get(id) ?? 0) ^ 1;
    this.printSide.set(id, side);
    const off = side ? 0.12 : -0.12;
    const d = this.dummy;
    // right = (cos, −sin) for this yaw convention.
    d.position.set(x + Math.cos(yaw) * off, 0.03, z - Math.sin(yaw) * off);
    d.rotation.set(0, yaw, 0);
    d.scale.setScalar(1);
    d.updateMatrix();
    prints.setMatrixAt(this.printNext, d.matrix);
    this.printNext = (this.printNext + 1) % PRINTS;
    prints.count = Math.max(prints.count, this.printNext === 0 ? PRINTS : this.printNext);
    prints.instanceMatrix.needsUpdate = true;
  }

  /** Moves the falling things (`dt` seconds; 0 while paused) around the camera. */
  update(dt: number, t: number, cam: Vector3): void {
    if (this.count === 0) return;
    const p = this.p;
    const k = this.speedK;
    const motes = this.kind === "motes";
    const quads = this.quads;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      const ph = this.ph[i]!;
      if (dt > 0) {
        const s = Math.sin(t * (motes ? 0.4 : 1.1) + ph);
        const c = Math.cos(t * (motes ? 0.3 : 0.8) + ph * 1.3);
        const gust = motes ? 0.15 : 1;
        p[j] = p[j]! + (WIND.x * gust + s * this.sway) * dt * k;
        p[j + 1] = p[j + 1]! - (motes ? this.vy[i]! + s * 0.08 : this.vy[i]!) * dt * k;
        p[j + 2] = p[j + 2]! + (WIND.z * gust + c * this.sway * 0.7) * dt * k;
      }
      // Keep the cloud around the camera.
      let x = p[j]!;
      let z = p[j + 2]!;
      if (x - cam.x > R) x -= 2 * R;
      else if (x - cam.x < -R) x += 2 * R;
      if (z - cam.z > R) z -= 2 * R;
      else if (z - cam.z < -R) z += 2 * R;
      p[j] = x;
      p[j + 2] = z;
      let y = p[j + 1]!;
      if (motes) {
        if (y < 0.2 || y > 5) y = 0.4 + this.rand() * 4.2;
      } else if (y < this.shelter.floorAt(x, z)) {
        // Landed (on a roof, a container or the ground): start again at the top.
        y += TOP;
      }
      p[j + 1] = y;
      if (quads) {
        if (dt > 0) for (let a = 0; a < 3; a++) this.rot[j + a] = this.rot[j + a]! + this.spin[j + a]! * dt * k;
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(this.rot[j]!, this.rot[j + 1]!, this.rot[j + 2]!);
        this.dummy.scale.setScalar(this.size[i]!);
        this.dummy.updateMatrix();
        quads.setMatrixAt(i, this.dummy.matrix);
      }
    }
    if (this.points) (this.points.geometry.getAttribute("position") as Float32BufferAttribute).needsUpdate = true;
    if (quads) quads.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.quads?.dispose();
    this.prints?.dispose();
    this.litter?.dispose();
    this.owned.geometries.forEach((g) => g.dispose());
    this.owned.materials.forEach((m) => m.dispose());
    this.owned.textures.forEach((t) => t.dispose());
    this.group.removeFromParent();
  }
}

/** Whether snow settles on a box's top: solid, not tiny, and nothing sitting right on it or roofing it. */
function capped(b: Box, boxes: readonly Box[]): boolean {
  if (b.ghost || b.look === "wreck") return false;
  if (b.x1 - b.x0 < 0.25 || b.z1 - b.z0 < 0.25) return false;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  return !boxes.some((o) => o !== b && !o.ghost && o.y0 >= b.y1 - 0.05 && o.y0 < b.y1 + 8 && cx > o.x0 && cx < o.x1 && cz > o.z0 && cz < o.z1);
}
