/**
 * Ironwake's dressing: what a carrier needs that boxes can't give. Jets with
 * a shaped fuselage, swept wings and canted fins (the map's own boxes for
 * them only collide), the mast on the island with its radar, and the quads
 * that carry the flight deck's paint. Render-only: nothing here collides.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";
import { rgbOf, type V3 } from "./geo";
import { SHIP_DECK_Y, SHIP_FORECASTLE_X, SHIP_FORECASTLE_Y, SHIP_MAST, SHIP_RAMP_X, type MapDef } from "./map";

/** Triangles with smooth or flat normals, vertex colors, and faces that always point away from a part's inside. */
class Shape {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];

  private tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, rgb: V3): void {
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...na, ...nb, ...nc);
    this.col.push(...rgb, ...rgb, ...rgb);
  }

  /** A flat polygon (convex, any winding) facing away from `inside`. */
  face(pts: V3[], inside: V3, rgb: V3): void {
    const [a, b, c] = [pts[0]!, pts[1]!, pts[2]!];
    let n = unit(cross(sub(b, a), sub(c, a)));
    const flip = dot(n, sub(a, inside)) < 0;
    if (flip) n = [-n[0], -n[1], -n[2]];
    for (let i = 1; i + 1 < pts.length; i++) {
      if (flip) this.tri(a, pts[i + 1]!, pts[i]!, n, n, n, rgb);
      else this.tri(a, pts[i]!, pts[i + 1]!, n, n, n, rgb);
    }
  }

  /** A slab between two matching outlines (a wing between its upper and lower skin). */
  slab(top: V3[], bottom: V3[], rgb: V3, edge: V3 = rgb): void {
    const all = [...top, ...bottom];
    const inside: V3 = [avg(all, 0), avg(all, 1), avg(all, 2)];
    this.face(top, inside, rgb);
    this.face(bottom, inside, rgb);
    for (let i = 0; i < top.length; i++) {
      const j = (i + 1) % top.length;
      this.face([top[i]!, top[j]!, bottom[j]!, bottom[i]!], inside, edge);
    }
  }

  /**
   * A body lofted through rings (each a closed loop of the same number of
   * points around the same axis), smooth-shaded, capped at both ends.
   */
  loft(rings: V3[][], color: (ring: number, point: V3) => V3, caps: V3 | null = null): void {
    const centers = rings.map((r): V3 => [avg(r, 0), avg(r, 1), avg(r, 2)]);
    const n = rings[0]!.length;
    // Smooth normals: away from the ring's center, leaning with the taper.
    const normal = (i: number, j: number): V3 => {
      const p = rings[i]!;
      const radial = sub(p[j]!, centers[i]!);
      const along = sub(rings[Math.min(rings.length - 1, i + 1)]![j]!, rings[Math.max(0, i - 1)]![j]!);
      const tangent = sub(p[(j + 1) % n]!, p[(j + n - 1) % n]!);
      let v = unit(cross(along, tangent));
      if (dot(v, radial) < 0) v = [-v[0], -v[1], -v[2]];
      return len(radial) < 1e-4 ? unit(sub(centers[i]!, centers[i === 0 ? 1 : i - 1]!)) : v;
    };
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        const [a, b, c, d] = [rings[i]![j]!, rings[i + 1]![j]!, rings[i + 1]![k]!, rings[i]![k]!];
        const [na, nb, nc, nd] = [normal(i, j), normal(i + 1, j), normal(i + 1, k), normal(i, k)];
        const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
        const out = sub(mid, [(centers[i]![0] + centers[i + 1]![0]) / 2, (centers[i]![1] + centers[i + 1]![1]) / 2, (centers[i]![2] + centers[i + 1]![2]) / 2]);
        const flip = dot(cross(sub(b, a), sub(d, a)), out) < 0;
        const rgb = color(i, mid);
        if (flip) {
          this.tri(a, d, b, na, nd, nb, rgb);
          this.tri(b, d, c, nb, nd, nc, rgb);
        } else {
          this.tri(a, b, d, na, nb, nd, rgb);
          this.tri(b, c, d, nb, nc, nd, rgb);
        }
      }
    }
    if (caps) {
      this.face(rings[0]!, centers[1]!, caps);
      this.face(rings[rings.length - 1]!, centers[rings.length - 2]!, caps);
    }
  }

  /** An axis-aligned box. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rgb: V3): void {
    this.slab(
      [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      rgb,
    );
  }

  /** Adds another shape, turned by `yaw` about y and moved to (x, y, z). */
  add(s: Shape, x: number, y: number, z: number, yaw: number): void {
    const [c, sn] = [Math.cos(yaw), Math.sin(yaw)];
    for (let i = 0; i < s.pos.length; i += 3) {
      const [px, py, pz] = [s.pos[i]!, s.pos[i + 1]!, s.pos[i + 2]!];
      this.pos.push(x + px * c - pz * sn, y + py, z + px * sn + pz * c);
      const [nx, ny, nz] = [s.nor[i]!, s.nor[i + 1]!, s.nor[i + 2]!];
      this.nor.push(nx * c - nz * sn, ny, nx * sn + nz * c);
    }
    for (const v of s.col) this.col.push(v);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const avg = (pts: V3[], k: 0 | 1 | 2) => pts.reduce((s, p) => s + p[k], 0) / pts.length;

/** A ring around the x axis at `x`: half-width `w`, half-height `h`, centered at height `y` and side offset `z`; `flat` squares it off. */
function ring(x: number, y: number, w: number, h: number, segs: number, z = 0, flat = 0): V3[] {
  const out: V3[] = [];
  for (let j = 0; j < segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    // A superellipse: flat = 0 is round, toward 1 a rounded box.
    const e = 1 - flat * 0.6;
    out.push([x, y + h * Math.sign(s) * Math.abs(s) ** e, z + w * Math.sign(c) * Math.abs(c) ** e]);
  }
  return out;
}

const GREY = 0x7d868e;
const BELLY = 0x9aa2a9;
const DARK = 0x33383e;
const GLASS = 0x141c24;

/** One jet, nose toward +x, standing on its gear at y = 0. About 12 m long, 8.6 m across. */
function jet(): Shape {
  const s = new Shape();
  const grey = rgbOf(GREY);
  const belly = rgbOf(BELLY);
  const dark = rgbOf(DARK);
  const CY = 1.62;
  // Two-tone: grey above, pale below.
  const skin = (_i: number, p: V3): V3 => (p[1] < CY - 0.12 ? belly : grey);

  // Fuselage, tail to nose.
  const stations: [number, number, number, number, number][] = [
    // x, center y, half-width, half-height, squareness
    [-5.5, CY, 0.78, 0.4, 0.5],
    [-4.4, CY, 0.95, 0.5, 0.5],
    [-2.4, CY + 0.02, 1.02, 0.56, 0.45],
    [-0.2, CY + 0.04, 0.98, 0.6, 0.35],
    [1.5, CY + 0.06, 0.8, 0.62, 0.2],
    [2.9, CY + 0.04, 0.62, 0.58, 0.1],
    [4.1, CY - 0.02, 0.45, 0.44, 0],
    [5.1, CY - 0.06, 0.25, 0.25, 0],
    [5.75, CY - 0.08, 0.1, 0.1, 0],
    [6.05, CY - 0.09, 0.02, 0.02, 0],
  ];
  s.loft(
    stations.map(([x, y, w, h, f]) => ring(x, y, w, h, 12, 0, f)),
    (i, p) => (i >= 7 ? dark : skin(i, p)),
    dark,
  );
  // Canopy: a long bubble.
  const glass = rgbOf(GLASS);
  s.loft(
    [
      ring(0.7, CY + 0.52, 0.06, 0.05, 10),
      ring(1.3, CY + 0.6, 0.3, 0.2, 10),
      ring(2.2, CY + 0.66, 0.4, 0.34, 10),
      ring(3.0, CY + 0.6, 0.36, 0.3, 10),
      ring(3.7, CY + 0.42, 0.22, 0.16, 10),
      ring(4.0, CY + 0.32, 0.05, 0.04, 10),
    ],
    () => glass,
  );
  // The anti-glare panel ahead of it.
  s.loft([ring(3.6, CY + 0.36, 0.3, 0.1, 8), ring(4.6, CY + 0.22, 0.2, 0.08, 8), ring(5.1, CY + 0.12, 0.05, 0.03, 8)], () => dark);
  // The spine behind it.
  s.loft([ring(-3.6, CY + 0.42, 0.3, 0.16, 8), ring(-1, CY + 0.52, 0.36, 0.2, 8), ring(0.9, CY + 0.52, 0.3, 0.16, 8)], () => grey, grey);

  for (const m of [-1, 1]) {
    const z = (v: number) => m * v;
    const plan = (pts: [number, number][], y: number, t: number, rgb: V3, lift = 0) => {
      // Thinner toward the tip (the outline's later points), lifted by `lift` per meter out.
      const at = (px: number, pz: number, side: number): V3 => [px, y + lift * Math.abs(pz) + side * t * (1 - Math.min(0.6, Math.abs(pz) / 8)), z(pz)];
      s.slab(
        pts.map(([px, pz]) => at(px, pz, 0.5)),
        pts.map(([px, pz]) => at(px, pz, -0.5)),
        rgb,
      );
    };
    // Wing, with the leading-edge extension running forward to the cockpit.
    plan(
      [
        [1.3, 0.9],
        [-0.9, 4.25],
        [-2.5, 4.25],
        [-2.9, 0.9],
      ],
      CY + 0.08,
      0.16,
      grey,
      -0.015,
    );
    plan(
      [
        [3.6, 0.5],
        [1.3, 1.55],
        [1.3, 0.6],
      ],
      CY + 0.1,
      0.1,
      grey,
    );
    // Tailplane.
    plan(
      [
        [-3.9, 0.85],
        [-5.2, 2.75],
        [-5.95, 2.75],
        [-5.6, 0.85],
      ],
      CY,
      0.1,
      grey,
    );
    // Fin, canted outward.
    const cant = 0.33;
    const fin = (px: number, py: number, side: number): V3 => [px, CY + 0.4 + py, z(0.62 + py * cant + side * 0.05)];
    const outline: [number, number][] = [
      [-2.7, 0],
      [-4.5, 2.25],
      [-5.45, 2.25],
      [-5.1, 0],
    ];
    s.slab(
      outline.map(([px, py]) => fin(px, py, 1)),
      outline.map(([px, py]) => fin(px, py, -1)),
      grey,
    );
    // The squadron's colors on the fin tip.
    const tip: [number, number][] = [
      [-4.26, 1.95],
      [-4.5, 2.25],
      [-5.45, 2.25],
      [-5.4, 1.95],
    ];
    s.slab(
      tip.map(([px, py]) => fin(px, py, 1.25)),
      tip.map(([px, py]) => fin(px, py, -1.25)),
      rgbOf(0xb23a2e),
    );
    // Intake under the wing root, engine nozzle, wingtip missile on its rail.
    s.loft([ring(-1.2, CY - 0.28, 0.3, 0.36, 4, z(0.98), 0.9), ring(1.7, CY - 0.26, 0.26, 0.34, 4, z(0.98), 0.9), ring(2.3, CY - 0.2, 0.2, 0.28, 4, z(0.94), 0.9)], (_i, p) => skin(0, p), dark);
    s.loft([ring(-6.05, CY, 0.3, 0.3, 10, z(0.44)), ring(-5.4, CY, 0.38, 0.38, 10, z(0.44))], () => dark, rgbOf(0x15171a));
    const white = rgbOf(0xd9dcdf);
    s.loft([ring(-2.7, CY + 0.02, 0.07, 0.07, 6, z(4.36)), ring(-0.4, CY + 0.02, 0.07, 0.07, 6, z(4.36)), ring(0.05, CY + 0.02, 0.01, 0.01, 6, z(4.36))], () => white, white);
    // Main gear.
    s.box(-1.55, 0.3, z(1.02) - 0.05, -1.43, CY - 0.4, z(1.02) + 0.05, dark);
    s.loft([ring(-1.49, 0.32, 0.32, 0.32, 10, 0), ring(-1.49, 0.32, 0.32, 0.32, 10, 0)].map((r, k) => r.map(([, y, zz]): V3 => [-1.49 + zz, y, z(1.02) + (k ? 0.11 : -0.11)])), () => rgbOf(0x17181a), rgbOf(0x17181a));
  }
  // Nose gear, centerline tank on its pylon.
  s.box(2.52, 0.26, -0.05, 2.64, CY - 0.4, 0.05, dark);
  s.loft([ring(0, 0.26, 0.26, 0.26, 10), ring(0, 0.26, 0.26, 0.26, 10)].map((r, k) => r.map(([, y, zz]): V3 => [2.58 + zz, y, k ? 0.09 : -0.09])), () => rgbOf(0x17181a), rgbOf(0x17181a));
  s.loft([ring(-2.6, 0.82, 0.03, 0.03, 8), ring(-2, 0.82, 0.24, 0.24, 8), ring(0.6, 0.82, 0.27, 0.27, 8), ring(1.4, 0.82, 0.03, 0.03, 8)], () => belly);
  s.box(-1.2, 1.02, -0.05, 0.2, 1.14, 0.05, belly);
  return s;
}

/** The mast on the island: a lattice pole, platforms, a radome, whips. The rotating antenna is `radarGeometry`. */
function mast(s: Shape): void {
  const [x, y, z] = SHIP_MAST;
  const grey = rgbOf(0x8d959c);
  const dark = rgbOf(0x3a3f45);
  const H = 9;
  // Four legs leaning in, cross-braced.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    s.loft([ring(0, 0, 0.09, 0.09, 5), ring(0, 0, 0.06, 0.06, 5)].map((r, k) => r.map(([, ry, rz]): V3 => [x + sx * (k ? 0.35 : 0.9) + ry, y + (k ? H : 0), z + sz * (k ? 0.35 : 0.9) + rz])), () => grey);
  }
  for (let level = 1; level <= 3; level++) {
    const h = (level * H) / 4;
    const r = 0.9 - (0.55 * h) / H + 0.25;
    s.box(x - r, y + h, z - r, x + r, y + h + 0.1, z + r, grey);
    s.box(x - r, y + h + 0.1, z - r, x + r, y + h + 0.8, z - r + 0.04, dark);
    s.box(x - r, y + h + 0.1, z + r - 0.04, x + r, y + h + 0.8, z + r, dark);
  }
  // The yard, with a radome at each end, and the big dome on top.
  s.box(x - 0.1, y + H * 0.62, z - 3.2, x + 0.1, y + H * 0.62 + 0.14, z + 3.2, grey);
  const ball = (cx: number, cy: number, cz: number, r: number, rgb: V3) => {
    const rings: V3[][] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI;
      const rr = Math.max(0.01, Math.sin(a) * r);
      rings.push(ring(0, 0, rr, rr, 10).map(([, ry, rz]): V3 => [cx + ry, cy - Math.cos(a) * r, cz + rz]));
    }
    s.loft(rings, () => rgb);
  };
  const white = rgbOf(0xdfe2e4);
  ball(x, y + H * 0.62 + 0.5, z - 3, 0.42, white);
  ball(x, y + H * 0.62 + 0.5, z + 3, 0.42, white);
  ball(x, y + H + 1.9, z, 0.85, white);
  s.box(x - 0.07, y + H, z - 0.07, x + 0.07, y + H + 1.2, z + 0.07, grey);
  for (const [dx, dz] of [
    [-0.5, 0.5],
    [0.5, -0.5],
  ] as const)
    s.box(x + dx - 0.02, y + H, z + dz - 0.02, x + dx + 0.02, y + H + 4.5, z + dz + 0.02, dark);
}

/** Every jet on the map and the island's mast, as one mesh. */
export function carrierGeometry(map: MapDef): BufferGeometry {
  const all = new Shape();
  const one = jet();
  for (const j of map.jets ?? []) all.add(one, j.x, j.y, j.z, j.yaw);
  mast(all);
  return all.geometry();
}

/** The search radar on the island (around its own origin: the engine turns it). */
export function radarGeometry(): BufferGeometry {
  const s = new Shape();
  const dark = rgbOf(0x3a3f45);
  s.box(-0.08, 0, -0.08, 0.08, 0.5, 0.08, dark);
  // A slightly dished grid: three bars.
  for (const [dz, dx] of [
    [-1.6, 0.18],
    [0, 0],
    [1.6, 0.18],
  ] as const)
    s.box(dx - 0.05, 0.5, dz - 0.9, dx + 0.05, 1.9, dz + 0.9, dark);
  s.box(-0.04, 0.5, -2.5, 0.22, 0.62, 2.5, dark);
  s.box(-0.04, 1.78, -2.5, 0.22, 1.9, 2.5, dark);
  return s.geometry();
}

/** The flight deck's painted surface: one quad over the top of every deck box, mapped across the whole ship. */
export function deckGeometry(map: MapDef): BufferGeometry {
  const { x0, z0, w, h } = deckFrame(map);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const b of map.boxes) {
    if (b.look !== "deck") continue;
    const y = b.y1 + 0.012;
    const pts = [
      [b.x0, b.z1],
      [b.x1, b.z1],
      [b.x1, b.z0],
      [b.x0, b.z1],
      [b.x1, b.z0],
      [b.x0, b.z0],
    ] as const;
    for (const [x, z] of pts) {
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push((x - x0) / w, 1 - (z - z0) / h);
    }
  }
  // The ramp at the bow: one slope over the low steps you actually climb.
  const { bounds } = map;
  const rise = SHIP_FORECASTLE_Y - SHIP_DECK_Y;
  const run = SHIP_FORECASTLE_X - SHIP_RAMP_X;
  const slope = Math.hypot(rise, run);
  const corner = (x: number, z: number) => {
    pos.push(x, (x === SHIP_RAMP_X ? SHIP_DECK_Y : SHIP_FORECASTLE_Y) + 0.03, z);
    nor.push(-rise / slope, run / slope, 0);
    uv.push((x - x0) / w, 1 - (z - z0) / h);
  };
  for (const [x, z] of [
    [SHIP_RAMP_X, bounds.z1],
    [SHIP_FORECASTLE_X, bounds.z1],
    [SHIP_FORECASTLE_X, bounds.z0],
    [SHIP_RAMP_X, bounds.z1],
    [SHIP_FORECASTLE_X, bounds.z0],
    [SHIP_RAMP_X, bounds.z0],
  ] as const)
    corner(x, z);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** The rectangle the deck's texture covers (world x/z). */
export function deckFrame(map: MapDef): { x0: number; z0: number; w: number; h: number } {
  const { bounds } = map;
  return { x0: bounds.x0 - 0.5, z0: bounds.z0 - 0.5, w: bounds.x1 - bounds.x0 + 1, h: bounds.z1 - bounds.z0 + 1 };
}
