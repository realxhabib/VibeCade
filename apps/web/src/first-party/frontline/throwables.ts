/**
 * The grenade dresses for the season: a packed snowball in winter, an
 * exploding turkey in autumn, an egg bomb in spring and a firecracker in
 * summer. Same flight, fuse and blast for all of them (the simulation in
 * grenade.ts doesn't know); only the model, its name and the burst change.
 */

import { BufferAttribute, Color, CylinderGeometry, IcosahedronGeometry, SphereGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Season } from "./options";

export interface Throwable {
  /** "Snowball", shown in the HUD and the kill card. */
  name: string;
  /** Lower case, for "+1 snowball". */
  noun: string;
  icon: string;
  /** Colors of the burst when it goes off. */
  burst: number[];
  /** Burst glows (sparks) rather than tumbling (snow, feathers, confetti). */
  glow: boolean;
}

export const THROWABLES: Record<Season, Throwable> = {
  winter: { name: "Snowball", noun: "snowball", icon: "❄️", burst: [0xffffff, 0xeef5ff, 0xdde9f5], glow: false },
  autumn: { name: "Exploding turkey", noun: "turkey", icon: "🦃", burst: [0x6b3a1c, 0xf1e6d2, 0xc4682a, 0x2b1a10, 0xd9a14a], glow: false },
  spring: { name: "Egg bomb", noun: "egg bomb", icon: "🥚", burst: [0xff9ccf, 0x8fd8ff, 0xfff07a, 0xb5f2a0, 0xd4b2ff], glow: false },
  summer: { name: "Firecracker", noun: "firecracker", icon: "🧨", burst: [0xffd36b, 0xff7a2e, 0xff3d3d, 0xfff4c2], glow: true },
};

/** One piece of a throwable: geometry in local space and its color. */
export interface Part {
  geo: BufferGeometry;
  color: number;
}

/** The throwable's pieces, about the size of a frag (`k` scales it). */
export function throwableParts(season: Season, k = 1): Part[] {
  const parts: Part[] = [];
  const add = (geo: BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    geo.rotateX(rx).rotateZ(rz).translate(x, y, z).scale(k, k, k);
    parts.push({ geo, color });
  };
  if (season === "winter") {
    add(new IcosahedronGeometry(0.052, 1), 0xf4f8fc);
    // A few lumps so it reads as packed snow.
    add(new IcosahedronGeometry(0.02, 0), 0xe6eef6, 0.035, 0.03, 0.02);
    add(new IcosahedronGeometry(0.018, 0), 0xe9f0f8, -0.03, -0.025, 0.03);
  } else if (season === "autumn") {
    add(new SphereGeometry(0.055, 12, 10).scale(1.25, 0.82, 1), 0xa0592a);
    for (const s of [-1, 1]) {
      add(new CylinderGeometry(0.011, 0.02, 0.065, 8), 0xb86a35, -0.05, 0.025, s * 0.03, 0, -0.9);
      add(new SphereGeometry(0.012, 8, 6), 0xf2e6cf, -0.08, 0.05, s * 0.03);
    }
    // A lit fuse where the stuffing should be.
    add(new CylinderGeometry(0.003, 0.003, 0.04, 5), 0x3a2a1a, 0.06, 0.035, 0, 0, -0.6);
    add(new SphereGeometry(0.008, 6, 5), 0xffc23d, 0.075, 0.052, 0);
  } else if (season === "spring") {
    add(new SphereGeometry(0.045, 14, 12).scale(1, 1.3, 1), 0xff9ccf);
    add(new CylinderGeometry(0.0462, 0.0462, 0.014, 16, 1, true), 0x7fd6ff, 0, 0.012, 0);
    add(new CylinderGeometry(0.0425, 0.0425, 0.01, 16, 1, true), 0xfff07a, 0, -0.022, 0);
  } else {
    add(new CylinderGeometry(0.022, 0.022, 0.11, 12), 0xd8262c);
    add(new CylinderGeometry(0.0225, 0.0225, 0.012, 12), 0xf2c14e, 0, 0.05, 0);
    add(new CylinderGeometry(0.0225, 0.0225, 0.012, 12), 0xf2c14e, 0, -0.05, 0);
    add(new CylinderGeometry(0.003, 0.003, 0.045, 5), 0x2b2b2b, 0, 0.075, 0);
    add(new SphereGeometry(0.008, 6, 5), 0xffc23d, 0, 0.1, 0);
  }
  return parts;
}

/** All the pieces in one geometry, colored per vertex. */
export function throwableGeometry(season: Season, k = 1): BufferGeometry {
  const c = new Color();
  const geos = throwableParts(season, k).map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    c.setHex(color);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  return merged;
}
