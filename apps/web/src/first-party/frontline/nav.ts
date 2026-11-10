/**
 * Navmesh-lite for the bots: a waypoint graph laid over the map. Ground
 * nodes sit on a 3 m grid wherever a player fits; neighbors link when a
 * player-wide corridor between them is clear. Perches (container tops
 * reached by stairs) are extra nodes with hand-placed links. A map on
 * several floors (the ship) gets nodes on every walkable top instead, and
 * routes up its staircases. A* finds paths; `coverFrom` finds the nearest
 * node an enemy can't see.
 */

import type { MapDef } from "./map";
import { CollisionWorld, groundBelow, lineOfSight, PLAYER_R, STEP, type Vec3 } from "./physics";

export interface NavNode {
  x: number;
  y: number;
  z: number;
  links: number[];
}

export class NavGraph {
  readonly nodes: NavNode[];

  constructor(nodes: NavNode[]) {
    this.nodes = nodes;
  }

  /** Nearest node to a point (preferring the same floor), optionally one we can see. */
  nearest(p: Vec3, world?: CollisionWorld): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      const dy = Math.abs(n.y - p.y);
      const d = Math.hypot(n.x - p.x, n.z - p.z) + dy * 4;
      if (d >= bestD) continue;
      if (world && d > 1.5 && !lineOfSight(world, { x: p.x, y: p.y + 0.9, z: p.z }, { x: n.x, y: n.y + 0.9, z: n.z })) continue;
      best = i;
      bestD = d;
    }
    if (best < 0 && world) return this.nearest(p);
    return best;
  }

  /** A* from node a to node b: the list of node indices (a first), or null. */
  path(a: number, b: number): number[] | null {
    const n = this.nodes.length;
    if (a < 0 || b < 0 || a >= n || b >= n) return null;
    if (a === b) return [a];
    const g = new Float64Array(n).fill(Infinity);
    const f = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [a];
    g[a] = 0;
    f[a] = this.dist(a, b);
    while (open.length > 0) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[bi]!]!) bi = i;
      const cur = open[bi]!;
      if (cur === b) {
        const out = [b];
        let c = b;
        while (from[c]! >= 0) {
          c = from[c]!;
          out.push(c);
        }
        return out.reverse();
      }
      open.splice(bi, 1);
      closed[cur] = 1;
      for (const nb of this.nodes[cur]!.links) {
        if (closed[nb]) continue;
        const cand = g[cur]! + this.dist(cur, nb);
        if (cand >= g[nb]!) continue;
        from[nb] = cur;
        g[nb] = cand;
        f[nb] = cand + this.dist(nb, b);
        if (!open.includes(nb)) open.push(nb);
      }
    }
    return null;
  }

  dist(a: number, b: number): number {
    const p = this.nodes[a]!;
    const q = this.nodes[b]!;
    return Math.hypot(p.x - q.x, (p.y - q.y) * 2, p.z - q.z);
  }

  /** Node indices reachable from `start` (for tests and sanity checks). */
  reachable(start: number): Set<number> {
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      for (const nb of this.nodes[c]!.links) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    return seen;
  }

  /**
   * The closest node (by path-ish straight distance from `from`) that `threat`
   * can't see at chest height, within `maxDist` m, or -1.
   */
  coverFrom(world: CollisionWorld, from: Vec3, threat: Vec3, maxDist = 14): number {
    let best = -1;
    let bestScore = Infinity;
    const eye = { x: threat.x, y: threat.y + 1.5, z: threat.z };
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]!;
      const d = Math.hypot(n.x - from.x, n.z - from.z);
      if (d > maxDist || d < 1) continue;
      // Don't run toward the threat.
      const toward = (n.x - from.x) * (threat.x - from.x) + (n.z - from.z) * (threat.z - from.z);
      const score = d + (toward > 0 ? d * 0.8 : 0);
      if (score >= bestScore) continue;
      if (lineOfSight(world, eye, { x: n.x, y: n.y + 1.1, z: n.z })) continue;
      best = i;
      bestScore = score;
    }
    return best;
  }
}

/** Whether a player-wide corridor from a to b (same floor) is clear. */
function corridorClear(world: CollisionWorld, ax: number, az: number, bx: number, bz: number, y: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / 0.4));
  const r = PLAYER_R + 0.12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    let hit = false;
    world.near(x - r, z - r, x + r, z + r, (box) => {
      if (hit || box.y1 <= y + STEP || box.y0 >= y + 1.7) return;
      const cx = Math.max(box.x0, Math.min(x, box.x1));
      const cz = Math.max(box.z0, Math.min(z, box.z1));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) hit = true;
    });
    if (hit) return false;
  }
  return true;
}

/** Whether you can walk from a to b: the corridor is clear and the floor never steps more than a stride. */
function walkable(world: CollisionWorld, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / 0.3));
  let y = ay;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    // The floor right under the point (not what a foot's width would catch): a staircase met from its side is no way up.
    const floor = groundBelow(world, x, z, y + STEP, 0.05);
    if (y - floor > STEP) return false;
    if (!corridorClear(world, x, z, x, z, floor)) return false;
    y = floor;
  }
  return Math.abs(y - by) < 0.05;
}

/**
 * The graph for a map on several floors (`map.routes`): grid nodes on every
 * surface a player can stand on (the ground and the tops of boxes), linked
 * where you can simply walk between them, plus the routes (staircases) that
 * join one floor to the next. Whatever can't be reached from the first spawn
 * (the top of a tall stack) is dropped.
 */
function buildLevels(map: MapDef, world: CollisionWorld, spacing: number): NavGraph {
  const { bounds } = map;
  const pad = 1;
  const cols = Math.floor((bounds.x1 - bounds.x0 - pad * 2) / spacing) + 1;
  const rows = Math.floor((bounds.z1 - bounds.z0 - pad * 2) / spacing) + 1;
  let nodes: NavNode[] = [];
  /** Per grid cell: the nodes stacked there. */
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  const standable = (x: number, z: number, y: number) => Math.abs(groundBelow(world, x, z, y + 0.01) - y) < 0.01 && corridorClear(world, x, z, x, z, y);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = bounds.x0 + pad + c * spacing;
      const z = bounds.z0 + pad + r * spacing;
      const heights = new Set<number>([0]);
      world.near(x, z, x, z, (box) => {
        if (x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1) heights.add(box.y1);
      });
      for (const y of [...heights].sort((p, q) => p - q)) {
        if (!standable(x, z, y)) continue;
        cells[r * cols + c]!.push(nodes.length);
        nodes.push({ x, y, z, links: [] });
      }
    }
  }
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!nodes[a]!.links.includes(b)) nodes[a]!.links.push(b);
    if (!nodes[b]!.links.includes(a)) nodes[b]!.links.push(a);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ] as const) {
        const c2 = c + dc;
        const r2 = r + dr;
        if (c2 >= cols || r2 < 0 || r2 >= rows) continue;
        for (const a of cells[r * cols + c]!) {
          for (const b of cells[r2 * cols + c2]!) {
            const p = nodes[a]!;
            const q = nodes[b]!;
            // Both ways: a walk that only works downhill (a ledge) is not a link.
            if (walkable(world, p.x, p.y, p.z, q.x, q.y, q.z) && walkable(world, q.x, q.y, q.z, p.x, p.y, p.z)) link(a, b);
          }
        }
      }
    }
  }
  const grid = nodes.length;
  for (const route of map.routes ?? []) {
    let prev = -1;
    route.forEach(([x, y, z], k) => {
      const at = nodes.length;
      nodes.push({ x, y, z, links: [] });
      if (prev >= 0) link(prev, at);
      prev = at;
      if (k !== 0 && k !== route.length - 1) return;
      // Each end joins the nearest grid nodes on its own floor.
      nodes
        .slice(0, grid)
        .map((n, i) => ({ i, n, d: Math.hypot(n.x - x, n.z - z) }))
        .filter((e) => Math.abs(e.n.y - y) < 0.3 && e.d < spacing * 1.7)
        .sort((p, q) => p.d - q.d)
        .slice(0, 4)
        .forEach((e) => {
          if (walkable(world, x, y, z, e.n.x, e.n.y, e.n.z)) link(at, e.i);
        });
    });
  }
  // Keep what the first spawn can reach.
  const all = new NavGraph(nodes);
  const keep = [...all.reachable(all.nearest(map.spawns[0]!))].sort((p, q) => p - q);
  const index = new Map(keep.map((old, i) => [old, i]));
  nodes = keep.map((old) => ({ ...nodes[old]!, links: nodes[old]!.links.map((l) => index.get(l)!) }));
  return new NavGraph(nodes);
}

/** Builds the waypoint graph for a map. */
export function buildNav(map: MapDef, world: CollisionWorld, spacing = 3): NavGraph {
  if (map.routes) return buildLevels(map, world, spacing);
  const { bounds } = map;
  const nodes: NavNode[] = [];
  const index = new Map<string, number>();
  const pad = 1;
  const cols = Math.floor((bounds.x1 - bounds.x0 - pad * 2) / spacing) + 1;
  const rows = Math.floor((bounds.z1 - bounds.z0 - pad * 2) / spacing) + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = bounds.x0 + pad + c * spacing;
      const z = bounds.z0 + pad + r * spacing;
      if (!corridorClear(world, x, z, x, z, 0)) continue;
      index.set(`${c},${r}`, nodes.length);
      nodes.push({ x, y: 0, z, links: [] });
    }
  }
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!nodes[a]!.links.includes(b)) nodes[a]!.links.push(b);
    if (!nodes[b]!.links.includes(a)) nodes[b]!.links.push(a);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = index.get(`${c},${r}`);
      if (a === undefined) continue;
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ] as const) {
        const b = index.get(`${c + dc},${r + dr}`);
        if (b === undefined) continue;
        const p = nodes[a]!;
        const q = nodes[b]!;
        if (corridorClear(world, p.x, p.z, q.x, q.z, 0)) link(a, b);
      }
    }
  }
  // Perches: a node on top, a node at each stair foot, linked through.
  for (const perch of map.perches) {
    const top = nodes.length;
    nodes.push({ x: perch.x, y: perch.y, z: perch.z, links: [] });
    for (const [x, y, z] of perch.link) {
      const foot = nodes.length;
      nodes.push({ x, y, z, links: [] });
      link(top, foot);
      // The foot joins the nearest ground nodes it has a clear corridor to.
      const near = nodes
        .map((n, i) => ({ i, d: Math.hypot(n.x - x, n.z - z), n }))
        .filter((e) => e.i !== foot && e.i !== top && e.n.y === 0 && e.d < spacing * 1.6)
        .sort((p, q) => p.d - q.d)
        .slice(0, 4);
      for (const e of near) if (corridorClear(world, x, z, e.n.x, e.n.z, 0)) link(foot, e.i);
    }
  }
  return new NavGraph(nodes);
}
