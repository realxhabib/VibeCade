/**
 * The maps, built from boxes in code.
 *
 * Saltyard: a sun-bleached container port. A
 * covered warehouse on the west side (close quarters between racks), the
 * "stack" in the middle (containers around an open court, two perches up
 * stairs), three container lanes on the east side, and open truck yards at
 * the north and south ends where most spawns are. Sized for 2–8 players.
 *
 * Everything here is data: the renderer draws the boxes, physics collides
 * with them, the bots walk the waypoint graph built from them.
 */

import type { Box, Surface } from "./physics";

export interface Spawn {
  x: number;
  y: number;
  z: number;
  /** Facing (yaw, 0 = toward −z / north). */
  yaw: number;
  /** Preferred side for the opening spawns of team play (0 = north, 1 = south). */
  side: 0 | 1 | null;
}

export interface MapDef {
  id: string;
  name: string;
  /** One line for the map picker. */
  blurb: string;
  /** What lies under and around the boxes: a walled yard on asphalt, or a ship's steel deck at sea. */
  setting: "yard" | "ship";
  bounds: { x0: number; z0: number; x1: number; z1: number };
  boxes: Box[];
  spawns: Spawn[];
  /** Extra waypoints off the ground (perches) and the links that reach them. */
  perches: { x: number; y: number; z: number; link: [number, number, number][] }[];
  /**
   * A map on several floors: the bots' waypoints then cover every walkable
   * top, and each route (a chain of points up a staircase) joins two floors.
   */
  routes?: [number, number, number][][];
  /** Big decorative silhouettes outside the walls (never collide). */
  skyline: Box[];
  /** Sun direction (toward the sun), sky + fog colors. */
  sun: [number, number, number];
  /** Where a fire burns (the wreck), for flames, smoke and its light. */
  fires: { x: number; y: number; z: number }[];
  /** Distant smoke columns beyond the walls (scenery). */
  plumes: { x: number; z: number; h: number }[];
  sky: { top: number; horizon: number; ground: number; fog: number };
}

export const CONTAINER_L = 6.1;
export const CONTAINER_W = 2.44;
export const CONTAINER_H = 2.6;

const PALETTE = {
  rust: 0xb2583e,
  blue: 0x4d7aa3,
  teal: 0x3e8c83,
  mustard: 0xcf9f47,
  bone: 0xd8d1c1,
  olive: 0x7b8750,
  brick: 0x8e4a3a,
  concrete: 0xc9c1b1,
  darkConcrete: 0x9c9486,
  wood: 0xa57b4f,
  metal: 0x6f757c,
  yellow: 0xe0b440,
  drum: 0x2f5f9e,
};

class Builder {
  readonly boxes: Box[] = [];

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, surface: Surface, color: number, extra: Partial<Box> = {}): Box {
    const b: Box = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), surface, color, ...extra };
    this.boxes.push(b);
    return b;
  }

  /** Box by center (x, z), footprint w (x) × d (z), height h, standing on y. */
  block(cx: number, cz: number, w: number, d: number, h: number, surface: Surface, color: number, y = 0): Box {
    return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, surface, color);
  }

  /** A 20 ft container, long side along x or z, on stack level 0/1. */
  container(cx: number, cz: number, along: "x" | "z", color: number, level = 0): Box {
    const w = along === "x" ? CONTAINER_L : CONTAINER_W;
    const d = along === "x" ? CONTAINER_W : CONTAINER_L;
    const y = level * CONTAINER_H;
    return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + CONTAINER_H, cz + d / 2, "container", color, { ribs: along });
  }

  /** Stairs rising toward `dir` from (x, z): `steps` steps of `rise` × `run`, `width` wide. */
  stairs(x: number, z: number, dir: "+x" | "-x" | "+z" | "-z", steps: number, rise: number, run: number, width: number, color = PALETTE.metal, base = 0): void {
    for (let i = 0; i < steps; i++) {
      const top = base + rise * (i + 1);
      const a = run * i;
      const b = run * (i + 1);
      const plate = { look: "plate" } as const;
      if (dir === "+x") this.box(x + a, base, z - width / 2, x + b, top, z + width / 2, "metal", color, plate);
      if (dir === "-x") this.box(x - b, base, z - width / 2, x - a, top, z + width / 2, "metal", color, plate);
      if (dir === "+z") this.box(x - width / 2, base, z + a, x + width / 2, top, z + b, "metal", color, plate);
      if (dir === "-z") this.box(x - width / 2, base, z - b, x + width / 2, top, z - a, "metal", color, plate);
    }
  }

  crate(cx: number, cz: number, size = 1.1, y = 0, color = PALETTE.wood): Box {
    return this.block(cx, cz, size, size, size, "wood", color, y);
  }

  /** A cluster of oil drums (four on a 1.3 m square), cover to the waist. */
  drums(cx: number, cz: number, w = 1.3, d = 1.3, y = 0): Box {
    return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + 0.9, cz + d / 2, "metal", PALETTE.drum, { look: "drums" });
  }

  /** A stack of wooden pallets (1.2 × 1.0 m, `n` high). */
  pallets(cx: number, cz: number, n: number, along: "x" | "z" = "x", y = 0): Box {
    const w = along === "x" ? 1.2 : 1.0;
    const d = along === "x" ? 1.0 : 1.2;
    return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + n * 0.15, cz + d / 2, "wood", PALETTE.wood, { look: "pallets", ribs: along });
  }

  /** A thin light pole (collides as a 0.3 m post). */
  pole(cx: number, cz: number): Box {
    return this.box(cx - 0.15, 0, cz - 0.15, cx + 0.15, 9, cz + 0.15, "metal", 0x6c7176);
  }

  /** Concrete road barrier. */
  barrier(cx: number, cz: number, along: "x" | "z"): Box {
    return along === "x" ? this.block(cx, cz, 2.4, 0.6, 0.95, "concrete", PALETTE.concrete) : this.block(cx, cz, 0.6, 2.4, 0.95, "concrete", PALETTE.concrete);
  }
}

function saltyard(): MapDef {
  const X = 36;
  const Z = 30;
  const b = new Builder();
  const WALL_H = 4.6;

  // Perimeter wall.
  b.box(-X - 1, 0, -Z - 1, X + 1, WALL_H, -Z, "concrete", PALETTE.darkConcrete);
  b.box(-X - 1, 0, Z, X + 1, WALL_H, Z + 1, "concrete", PALETTE.darkConcrete);
  b.box(-X - 1, 0, -Z, -X, WALL_H, Z, "concrete", PALETTE.darkConcrete);
  b.box(X, 0, -Z, X + 1, WALL_H, Z, "concrete", PALETTE.darkConcrete);

  /* West: the warehouse (x −36…−18, z −12…12), roof at 5 m. */
  const WX1 = -18;
  const WH = 5;
  const wall = PALETTE.brick;
  const clad = { look: "cladding" } as const;
  // East wall with two doorways (z −7.5…−4.5 and 3…6).
  b.box(WX1 - 0.5, 0, -12, WX1, WH, -7.5, "concrete", wall, clad);
  b.box(WX1 - 0.5, 0, -4.5, WX1, WH, 3, "concrete", wall, clad);
  b.box(WX1 - 0.5, 0, 6, WX1, WH, 12, "concrete", wall, clad);
  b.box(WX1 - 0.5, 2.8, -7.5, WX1, WH, -4.5, "concrete", wall, clad);
  b.box(WX1 - 0.5, 2.8, 3, WX1, WH, 6, "concrete", wall, clad);
  // North wall with a roller door (x −30…−25).
  b.box(-X, 0, -12.5, -30, WH, -12, "concrete", wall, clad);
  b.box(-25, 0, -12.5, WX1, WH, -12, "concrete", wall, clad);
  b.box(-30, 3.2, -12.5, -25, WH, -12, "concrete", wall, clad);
  // South wall with a door (x −24…−21).
  b.box(-X, 0, 12, -24, WH, 12.5, "concrete", wall, clad);
  b.box(-21, 0, 12, WX1, WH, 12.5, "concrete", wall, clad);
  b.box(-24, 2.8, 12, -21, WH, 12.5, "concrete", wall, clad);
  // Roof.
  b.box(-X, WH, -12.5, WX1, WH + 0.35, 12.5, "metal", 0x8a8f93, { look: "cladding" });
  // Racks inside (x −32…−23 at z −4.5 and 4.5), with a gap in the middle of each.
  b.box(-32.5, 0, -5.2, -28.6, 2.1, -4, "metal", PALETTE.yellow);
  b.box(-26.4, 0, -5.2, -22.5, 2.1, -4, "metal", PALETTE.yellow);
  b.box(-32.5, 0, 4, -28.6, 2.1, 5.2, "metal", PALETTE.yellow);
  b.box(-26.4, 0, 4, -22.5, 2.1, 5.2, "metal", PALETTE.yellow);
  // Crates and a forklift-sized block inside.
  b.crate(-33.8, -9.6, 1.3);
  b.crate(-32.4, -9.9, 1);
  b.crate(-33.8, -9.6, 0.9, 1.3);
  b.crate(-21.2, 9.4, 1.2);
  b.crate(-27.5, 0.2, 1.1);
  b.block(-20.8, -9.5, 1.6, 2.6, 1.5, "metal", PALETTE.yellow);
  b.block(-34.2, 8.2, 2.4, 3.2, 1.2, "wood", PALETTE.wood);

  /* Center: the stack (containers around an open court). */
  b.container(-5, -6, "x", PALETTE.rust);
  b.container(-5, -6, "x", PALETTE.teal, 1);
  b.container(-5, -6, "x", PALETTE.mustard, 2);
  b.container(5.5, -6, "x", PALETTE.blue);
  b.container(-5.5, 6, "x", PALETTE.mustard);
  b.container(5, 6, "x", PALETTE.bone);
  b.container(5, 6, "x", PALETTE.olive, 1);
  // Stairs to the top of the blue container (east end) and the mustard one (west end).
  b.stairs(12.2, -6, "-x", 6, CONTAINER_H / 6, 0.6, 1.8);
  b.stairs(-12.15, 6, "+x", 6, CONTAINER_H / 6, 0.6, 1.8);
  // Court cover.
  b.crate(0.2, 0, 1.2);
  b.crate(-1.1, 0.4, 0.9);
  b.crate(0.2, 0, 0.8, 1.2);
  b.barrier(-5, -0.6, "x");
  b.barrier(6, 1.2, "x");

  /* Between the warehouse and the stack. */
  b.barrier(-14.5, -3, "z");
  b.barrier(-14.5, 4.5, "z");
  b.block(-13.4, -14.5, 2.2, 2.2, 1.9, "wood", PALETTE.wood);
  b.crate(-11.5, 14.8, 1.2);
  b.crate(-11.6, 13.4, 1);

  /* East: three container lanes. */
  // Row A (x = 16).
  b.container(16, -16.95, "z", PALETTE.blue);
  b.container(16, -10.85, "z", PALETTE.rust);
  b.container(16, -16.95, "z", PALETTE.bone, 1);
  b.container(16, -16.95, "z", PALETTE.teal, 2);
  b.container(16, 7.05, "z", PALETTE.teal);
  b.container(16, 13.15, "z", PALETTE.mustard);
  // Row B (x = 23).
  b.container(23, -12, "z", PALETTE.olive);
  b.container(23, -5.9, "z", PALETTE.rust);
  b.container(23, -5.9, "z", PALETTE.blue, 1);
  b.container(23, 9, "z", PALETTE.bone);
  b.container(23, 15.1, "z", PALETTE.rust);
  // Row C (x = 30).
  b.container(30, -17, "z", PALETTE.mustard);
  b.container(30, -10.9, "z", PALETTE.teal);
  b.container(30, 2, "z", PALETTE.blue);
  b.container(30, 8.1, "z", PALETTE.olive);
  b.container(30, 8.1, "z", PALETTE.rust, 1);
  b.container(30, 8.1, "z", PALETTE.blue, 2);
  // Cover in the lanes.
  b.crate(19.6, 1.5, 1.1);
  b.crate(26.6, -0.5, 1.2);
  b.crate(33.6, -4.5, 1);
  b.crate(26.8, 20.5, 1.1);
  b.barrier(19.5, -21, "x");

  /* North yard: a parked truck and trailer, crates. */
  b.block(-4, -21.5, 2.5, 2.4, 2.9, "metal", 0xd2d6d8); // cab
  b.box(-2.75, 0, -22.7, 5.6, 1.1, -20.3, "metal", 0x3a3d42, { look: "plate" }); // chassis
  b.box(-2.6, 1.1, -22.72, 5.6, 1.1 + CONTAINER_H, -20.28, "container", PALETTE.rust, { ribs: "x" });
  b.crate(-17.6, -24.4, 1.2);
  b.crate(-16.3, -24.8, 1);
  b.crate(12.5, -25.5, 1.2);
  b.barrier(-9, -17.5, "x");
  b.barrier(8.5, -16.8, "x");

  /* South yard. */
  b.block(4, 21.5, 2.5, 2.4, 2.9, "metal", 0x3d6fb0); // cab
  b.box(-5.6, 0, 20.3, 2.75, 1.1, 22.7, "metal", 0x3a3d42, { look: "plate" });
  b.box(-5.6, 1.1, 20.28, 2.6, 1.1 + CONTAINER_H, 22.72, "container", PALETTE.teal, { ribs: "x" });
  b.crate(16.7, 25.2, 1.2);
  b.crate(-12.4, 25.6, 1.2);
  b.crate(-11.2, 25.9, 0.9);
  b.barrier(-8.5, 17, "x");
  b.barrier(9.5, 17.5, "x");

  /* Gantry crane over the yard (legs collide, the beam is scenery). */
  for (const [x, z] of [
    [-10.5, -18.5],
    [10.5, -18.5],
    [-10.5, 18.5],
    [10.5, 18.5],
  ] as const) {
    b.block(x, z, 0.9, 0.9, 16, "metal", PALETTE.yellow);
  }
  b.box(-11, 15.4, -19, 11, 16.6, -18, "metal", PALETTE.yellow, { ghost: true });
  b.box(-11, 15.4, 18, 11, 16.6, 19, "metal", PALETTE.yellow, { ghost: true });
  b.box(-11, 16.6, -19, -10, 17.4, 19, "metal", PALETTE.yellow, { ghost: true });
  b.box(10, 16.6, -19, 11, 17.4, 19, "metal", PALETTE.yellow, { ghost: true });
  b.box(-1.5, 14.6, -19, 1.5, 15.4, 19, "metal", 0x4b4f55, { ghost: true });

  /* Set dressing that is also cover: drum clusters, pallet stacks, a burnt-out car, light poles. */
  b.drums(-10.2, -9.6);
  b.drums(20.8, 10.6);
  b.drums(34.4, 4.8);
  b.drums(-8.2, 24.6, 1.3, 1.3);
  b.drums(-30.9, -1.4);
  b.pallets(-19.6, -25.3, 5);
  b.pallets(27.9, 12.6, 4, "z");
  b.pallets(-30.6, -9.2, 3);
  b.pallets(6.6, -25.2, 6);
  b.box(-28.6, 0, 18.6, -24.4, 1.45, 20.5, "metal", 0x2b2622, { look: "wreck" });
  b.pole(-35.25, 16.5);
  b.pole(35.25, -18.5);
  b.pole(12.5, 29.25);
  b.pole(-14.5, -29.25);

  const spawns: Spawn[] = [
    // North yard (facing south, into the map).
    { x: -24, y: 0, z: -26.5, yaw: Math.PI - 0.4, side: 0 },
    { x: -12, y: 0, z: -27.5, yaw: Math.PI, side: 0 },
    { x: 1, y: 0, z: -27, yaw: Math.PI, side: 0 },
    { x: 9, y: 0, z: -22.5, yaw: Math.PI + 0.3, side: 0 },
    { x: 20, y: 0, z: -26, yaw: Math.PI + 0.2, side: 0 },
    { x: 33, y: 0, z: -26.5, yaw: Math.PI + 0.3, side: 0 },
    // South yard (facing north).
    { x: 24, y: 0, z: 26.5, yaw: 0.4, side: 1 },
    { x: 12, y: 0, z: 27.5, yaw: 0, side: 1 },
    { x: -1, y: 0, z: 27, yaw: 0, side: 1 },
    { x: -9, y: 0, z: 22.5, yaw: -0.3, side: 1 },
    { x: -20, y: 0, z: 26, yaw: -0.2, side: 1 },
    { x: -33, y: 0, z: 26.5, yaw: -0.3, side: 1 },
    // Warehouse corners (facing east) and the far lanes (facing west).
    { x: -33.5, y: 0, z: -2, yaw: -Math.PI / 2, side: null },
    { x: -30.5, y: 0, z: 9, yaw: -Math.PI / 2, side: null },
    { x: 33.5, y: 0, z: 14, yaw: Math.PI / 2, side: null },
    { x: 33.5, y: 0, z: -14, yaw: Math.PI / 2, side: null },
    { x: 19.5, y: 0, z: -3, yaw: Math.PI / 2, side: null },
    { x: -15.5, y: 0, z: 0.5, yaw: -Math.PI / 2, side: null },
  ];

  // Perches: tops of the stair containers (y 2.6), linked to the stair feet.
  const perches: MapDef["perches"] = [
    { x: 5.5, y: CONTAINER_H, z: -6, link: [[12.9, 0, -6]] },
    { x: -5.5, y: CONTAINER_H, z: 6, link: [[-12.9, 0, 6]] },
  ];

  // Distant silhouettes: stacked containers and cranes beyond the walls.
  const skyline: Box[] = [];
  const sb = new Builder();
  const colors = [PALETTE.rust, PALETTE.blue, PALETTE.teal, PALETTE.mustard, PALETTE.bone, PALETTE.olive];
  let ci = 0;
  for (let i = 0; i < 9; i++) {
    const x = -44 + i * 11;
    const levels = 2 + ((i * 7) % 3);
    for (let l = 0; l < levels; l++) sb.box(x - 4.5, l * CONTAINER_H, -44, x + 4.5, (l + 1) * CONTAINER_H, -38, "container", colors[ci++ % colors.length]!, { ghost: true, ribs: "x" });
  }
  for (let i = 0; i < 8; i++) {
    const z = -30 + i * 9;
    const levels = 1 + ((i * 5) % 3);
    for (let l = 0; l < levels; l++) sb.box(44, l * CONTAINER_H, z - 4, 50, (l + 1) * CONTAINER_H, z + 4, "container", colors[ci++ % colors.length]!, { ghost: true, ribs: "z" });
  }
  // Harbor cranes (legs + boom reaching out over the water).
  for (const [x, z, dir] of [
    [30, -58, -1],
    [-34, 58, 1],
  ] as const) {
    sb.box(x - 6, 0, z - 1, x - 5, 30, z + 1, "metal", 0xd9523b, { ghost: true });
    sb.box(x + 5, 0, z - 1, x + 6, 30, z + 1, "metal", 0xd9523b, { ghost: true });
    sb.box(x - 7, 28, z - 1.5, x + 7, 31, z + 1.5, "metal", 0xd9523b, { ghost: true });
    sb.box(x - 1.5, 30, z - 4 * dir, x + 1.5, 32, z + 26 * dir, "metal", 0xd9523b, { ghost: true });
  }
  skyline.push(...sb.boxes);

  return {
    id: "saltyard",
    name: "Saltyard",
    blurb: "A container port: a warehouse, the stack, three tight lanes.",
    setting: "yard",
    bounds: { x0: -X, z0: -Z, x1: X, z1: Z },
    boxes: b.boxes,
    spawns,
    perches,
    skyline,
    // Low late-afternoon sun (matches the HDRI's sun azimuth; a little higher so lanes aren't all shade).
    sun: [0.714, 0.469, 0.519],
    fires: [{ x: -26.5, y: 1.2, z: 19.55 }],
    plumes: [
      { x: -70, z: -95, h: 70 },
      { x: 95, z: 60, h: 55 },
    ],
    sky: { top: 0x6fa6d6, horizon: 0xe9dcc4, ground: 0xb9a88c, fog: 0xe6d9c2 },
  };
}

/**
 * Ironwake's heights. y = 0 is the floor of the open cargo hold; the main
 * deck is two containers above it, so a stack of two is a bridge at deck
 * level. Above that: the forecastle, then the gallery around the tower.
 */
export const SHIP_DECK_Y = 2 * CONTAINER_H;
export const SHIP_FORECASTLE_Y = SHIP_DECK_Y + 1.6;
export const SHIP_SEA_Y = SHIP_DECK_Y - 9.5;
/** Where the raised forecastle starts (it is walkable up to the map's edge; the prow beyond is scenery). */
export const SHIP_FORECASTLE_X = 36;
/** The prow beyond the playable deck: the outline from the map's edge to the stem (x, half-beam). */
export const SHIP_BOW: readonly (readonly [number, number])[] = [
  [44, 19.35],
  [54, 16.5],
  [63, 10.5],
  [69, 4.6],
  [72, 0],
];

const SHIP = {
  white: 0xe2dfd6,
  offWhite: 0xcfccc3,
  glass: 0x16232e,
  deck: 0x4c6e5e,
  deckGear: 0x35584a,
  hold: 0x6f6f68,
  catwalk: 0x595d60,
  navy: 0x22344c,
  hullRed: 0x7a2e26,
  orange: 0xd9662b,
};

function ironwake(): MapDef {
  const X0 = -50;
  const X1 = 44;
  const Z = 19;
  const D = SHIP_DECK_Y;
  const FY = SHIP_FORECASTLE_Y;
  const FX = SHIP_FORECASTLE_X;
  // The hold: an open pit amidships, 42 m by 22 m.
  const HX0 = -20;
  const HX1 = 22;
  const HZ = 11;
  const b = new Builder();
  const g = { ghost: true } as const;
  const glass = { ghost: true, look: "plate" } as const;
  const routes: [number, number, number][][] = [];

  /* The main deck: everything around the hold, solid down to its floor. */
  b.box(X0, 0, -Z, HX0, D, Z, "metal", SHIP.deck);
  b.box(HX1, 0, -Z, X1, D, Z, "metal", SHIP.deck);
  b.box(HX0, 0, -Z, HX1, D, -HZ, "metal", SHIP.deck);
  b.box(HX0, 0, HZ, HX1, D, Z, "metal", SHIP.deck);
  // Bare steel lining the hold's sides below the deck edge, and a hazard stripe around the opening (scenery).
  for (const z of [-HZ, HZ - 0.04]) b.box(HX0, 0, z, HX1, D - 0.3, z + 0.04, "metal", SHIP.hold, { ghost: true, look: "plate" });
  for (const x of [HX0, HX1 - 0.04]) b.box(x, 0, -HZ, x + 0.04, D - 0.3, HZ, "metal", SHIP.hold, { ghost: true, look: "plate" });
  for (const z of [-HZ - 0.35, HZ + 0.05]) b.box(HX0 - 0.35, D, z, HX1 + 0.35, D + 0.015, z + 0.3, "metal", PALETTE.yellow, g);
  for (const x of [HX0 - 0.35, HX1 + 0.05]) b.box(x, D, -HZ, x + 0.3, D + 0.015, HZ, "metal", PALETTE.yellow, g);

  /* Bulwarks just outside the playable deck; taller around the forecastle. */
  const BW = 1.15;
  for (const [z0, z1] of [
    [-Z - 0.35, -Z],
    [Z, Z + 0.35],
  ] as const) {
    b.box(X0 - 0.35, 0, z0, FX, D + BW, z1, "metal", SHIP.white);
    b.box(FX, 0, z0, X1, FY + BW, z1, "metal", SHIP.white);
  }
  b.box(X0 - 0.35, 0, -Z, X0, D + BW, Z, "metal", SHIP.white);
  b.box(X1, 0, -Z - 0.35, X1 + 0.35, FY + BW, Z + 0.35, "metal", SHIP.white, g);

  /* The forecastle: a raised deck across the bow, a short flight of steps each side. */
  b.box(FX, D, -Z, X1, FY, Z, "metal", SHIP.deck);
  for (const z of [-13, 13]) {
    b.stairs(FX - 2, z, "+x", 4, (FY - D) / 4, 0.5, 2.4, PALETTE.metal, D);
    routes.push([
      [FX - 2.6, D, z],
      [FX + 0.8, FY, z],
    ]);
  }
  b.block(40.6, -7, 2.4, 3.4, 1.4, "metal", SHIP.deckGear, FY);
  b.block(40.6, 7, 2.4, 3.4, 1.4, "metal", SHIP.deckGear, FY);
  b.box(FX + 0.1, FY, -6, FX + 0.4, FY + 1.05, 6, "metal", SHIP.white);
  b.block(42.8, -15, 0.7, 1.6, 0.75, "metal", 0x2c2f33, FY);
  b.block(42.8, 15, 0.7, 1.6, 0.75, "metal", 0x2c2f33, FY);
  b.crate(38.6, 15.8, 1.1, FY);
  b.drums(37.6, -16.6, 1.3, 1.3, FY);
  // The foremast: its foot collides, the rest is scenery.
  b.block(42.4, 0, 0.7, 0.7, 2.6, "metal", SHIP.white, FY);
  b.box(42.15, FY + 2.6, -0.25, 42.65, FY + 13, 0.25, "metal", SHIP.white, g);
  b.box(42.2, FY + 9, -2.6, 42.6, FY + 9.3, 2.6, "metal", SHIP.white, g);
  // Windlasses out on the prow (scenery).
  b.box(50, FY, -5.5, 53, FY + 1.5, -2.5, "metal", SHIP.deckGear, g);
  b.box(50, FY, 2.5, 53, FY + 1.5, 5.5, "metal", SHIP.deckGear, g);

  /* The tower on the aft deck (x −44…−30, z −13…13): an open ground floor, a gallery around it one deck up. */
  const TX0 = -44;
  const TX1 = -30;
  const TZ = 13;
  const WH = 3.2;
  const CEIL = D + WH;
  const DOOR = D + 2.4;
  // Forward wall: a door near each side, two mess-room windows looking over the hold.
  for (const [z0, z1] of [
    [-TZ, -9.5],
    [-6.5, -4.5],
    [-1.5, 1.5],
    [4.5, 6.5],
    [9.5, TZ],
  ] as const)
    b.box(TX1 - 0.5, D, z0, TX1, CEIL, z1, "metal", SHIP.white);
  for (const z0 of [-9.5, 6.5]) b.box(TX1 - 0.5, DOOR, z0, TX1, CEIL, z0 + 3, "metal", SHIP.white);
  for (const z0 of [-4.5, 1.5]) {
    b.box(TX1 - 0.5, D, z0, TX1, D + 1.05, z0 + 3, "metal", SHIP.white);
    b.box(TX1 - 0.5, D + 2.05, z0, TX1, CEIL, z0 + 3, "metal", SHIP.white);
  }
  // Aft wall: one door on the centerline.
  b.box(TX0, D, -TZ, TX0 + 0.5, CEIL, -1.5, "metal", SHIP.white);
  b.box(TX0, D, 1.5, TX0 + 0.5, CEIL, TZ, "metal", SHIP.white);
  b.box(TX0, DOOR, -1.5, TX0 + 0.5, CEIL, 1.5, "metal", SHIP.white);
  // Side walls: a door each (the port one further aft).
  for (const [z0, z1, d0] of [
    [-TZ, -TZ + 0.5, -40.5],
    [TZ - 0.5, TZ, -36.5],
  ] as const) {
    b.box(TX0 + 0.5, D, z0, d0, CEIL, z1, "metal", SHIP.white);
    b.box(d0 + 3, D, z0, TX1 - 0.5, CEIL, z1, "metal", SHIP.white);
    b.box(d0, DOOR, z0, d0 + 3, CEIL, z1, "metal", SHIP.white);
  }
  // Everything above the ground floor: four more decks, solid.
  const TOP = D + 14.6;
  b.box(TX0, CEIL, -TZ, TX1, TOP, TZ, "metal", SHIP.white);
  // Inside: the stair core, lockers, the galley counter, mess tables.
  b.box(-39.5, D, -2.5, -35.5, CEIL, 2.5, "metal", SHIP.offWhite);
  b.block(-42.9, -8, 0.9, 4.2, 2, "metal", 0x55707f, D);
  b.block(-42.9, 8.5, 0.9, 3.2, 2, "metal", 0x55707f, D);
  b.block(-37.5, 9.4, 3.4, 0.9, 1.05, "metal", 0x8a8f93, D);
  b.block(-33.2, -8.6, 1.2, 2.6, 0.8, "metal", 0x8a8f93, D);
  b.block(-33.4, 0, 1.1, 2.2, 0.8, "metal", 0x8a8f93, D);
  b.crate(-41.6, 4.6, 1.1, D);
  b.crate(-32.4, 11, 1.2, D);

  // The gallery: a walkway one deck up, across the tower's face and down its starboard side, with a waist-high rail.
  const GY = CEIL + 0.2;
  b.box(TX1, CEIL, -TZ - 2.4, TX1 + 2.8, GY, TZ + 2.4, "metal", SHIP.catwalk, { look: "plate" });
  b.box(TX0, CEIL, TZ, TX1, GY, TZ + 2.4, "metal", SHIP.catwalk, { look: "plate" });
  for (const [z0, z1] of [
    [-TZ, -8],
    [-5, 5],
    [8, TZ + 2.4],
  ] as const)
    b.box(TX1 + 2.7, GY, z0, TX1 + 2.8, GY + 1.05, z1, "metal", SHIP.white);
  b.box(TX0 + 3, GY, TZ + 2.3, TX1 + 2.8, GY + 1.05, TZ + 2.4, "metal", SHIP.white);
  b.box(TX1, GY, -TZ - 2.4, TX1 + 0.1, GY + 1.05, -TZ - 0.1, "metal", SHIP.white, g);
  // Two ways up: from the apron on the port side, and from the stern on the starboard side.
  b.stairs(TX1 + 2.8 + 4.8, -TZ - 1.2, "-x", 8, (GY - D) / 8, 0.6, 2.2, PALETTE.metal, D);
  routes.push([
    [TX1 + 8.3, D, -TZ - 1.2],
    [TX1 + 2, GY, -TZ - 1.2],
  ]);
  b.stairs(TX0 - 4.8, TZ + 1.2, "+x", 8, (GY - D) / 8, 0.6, 2.2, PALETTE.metal, D);
  routes.push([
    [TX0 - 5.5, D, TZ + 1.2],
    [TX0 + 0.8, GY, TZ + 1.2],
  ]);

  // Scenery up the tower: deck edges, windows, the bridge with its wings, funnel and mast.
  for (let level = 1; level <= 3; level++) {
    const y = CEIL + level * 2.84;
    b.box(TX0 - 0.5, y, -TZ - 0.5, TX1 + 0.7, y + 0.16, TZ + 0.5, "metal", SHIP.offWhite, g);
  }
  for (let level = 0; level < 4; level++) {
    const y = CEIL + level * 2.84 + 1.15;
    for (let i = 0; i < 8; i++) {
      const z = -10.5 + i * 3;
      b.box(TX1, y, z - 0.75, TX1 + 0.04, y + 0.95, z + 0.75, "metal", SHIP.glass, glass);
      b.box(TX0 - 0.04, y, z - 0.75, TX0, y + 0.95, z + 0.75, "metal", SHIP.glass, glass);
    }
    for (let i = 0; i < 4; i++) {
      const x = -41.5 + i * 3;
      b.box(x - 0.75, y, -TZ - 0.04, x + 0.75, y + 0.95, -TZ, "metal", SHIP.glass, glass);
      b.box(x - 0.75, y, TZ, x + 0.75, y + 0.95, TZ + 0.04, "metal", SHIP.glass, glass);
    }
  }
  const BRIDGE = TOP + 3;
  b.box(TX0, TOP, -Z - 0.3, TX1 + 1, TOP + 0.3, Z + 0.3, "metal", SHIP.offWhite, g);
  b.box(TX0 + 1, TOP + 0.3, -Z + 2.5, TX1 + 1, BRIDGE, Z - 2.5, "metal", SHIP.white, g);
  b.box(TX1 + 1, TOP + 1.25, -Z + 3, TX1 + 1.05, BRIDGE - 0.5, Z - 3, "metal", SHIP.glass, glass);
  b.box(TX0 + 0.6, BRIDGE, -Z + 2, TX1 + 1.5, BRIDGE + 0.22, Z - 2, "metal", SHIP.offWhite, g);
  for (const z of [-Z - 0.3, Z + 0.2]) b.box(TX0, TOP + 0.3, z, TX1 + 1, TOP + 1.3, z + 0.1, "metal", SHIP.white, g);
  for (const z of [-Z - 0.3, Z - 2.5]) b.box(TX1 + 0.9, TOP + 0.3, z, TX1 + 1, TOP + 1.3, z + 2.8, "metal", SHIP.white, g);
  b.box(-43, BRIDGE, -3.2, -38.5, BRIDGE + 7, 3.2, "metal", SHIP.navy, g);
  b.box(-43.05, BRIDGE + 4.2, -3.25, -38.45, BRIDGE + 5.5, 3.25, "metal", PALETTE.mustard, g);
  b.box(-42.6, BRIDGE + 7, -2.8, -38.9, BRIDGE + 7.3, 2.8, "metal", 0x1b1c1e, g);
  b.box(-34.3, BRIDGE, -0.3, -33.7, BRIDGE + 8, 0.3, "metal", SHIP.white, g);
  b.box(-34.2, BRIDGE + 5.4, -3.4, -33.8, BRIDGE + 5.7, 3.4, "metal", SHIP.white, g);
  b.box(-34.6, BRIDGE + 6.6, -1.6, -33.4, BRIDGE + 6.9, 1.6, "metal", 0x9aa0a6, g);

  /* The stern, behind the tower: mooring gear, a lifeboat in its cradle. */
  b.block(-47.6, -9, 1.8, 3, 1.3, "metal", SHIP.deckGear, D);
  b.block(-48.9, -15.6, 0.7, 1.6, 0.75, "metal", 0x2c2f33, D);
  b.block(-47, 3.4, 4.4, 2, 1.9, "metal", SHIP.orange, D);
  b.drums(-45.6, -16.8, 1.3, 1.3, D);
  b.crate(-46.2, -3.2, 1.1, D);

  /* The apron between the tower and the hold. */
  b.block(-23.4, -3.6, 2.2, 2.6, 1.4, "wood", PALETTE.wood, D);
  b.drums(-27, 4.4, 1.3, 1.3, D);
  b.crate(-22.6, 7.6, 1.2, D);
  b.crate(-22.5, 7.7, 0.8, D + 1.2);
  b.pallets(-24.4, -9.6, 5, "z", D);
  b.block(-21.4, 14.8, 1.1, 1.1, 1.25, "metal", SHIP.white, D);

  /* Containers. In the hold a stack of two reaches deck level; three stand a container above it. */
  const colors = [PALETTE.rust, PALETTE.blue, PALETTE.teal, PALETTE.mustard, PALETTE.bone, PALETTE.olive, PALETTE.brick];
  let ci = 0;
  const stack = (cx: number, cz: number, along: "x" | "z", levels: number, base = 0) => {
    const w = along === "x" ? CONTAINER_L : CONTAINER_W;
    const d = along === "x" ? CONTAINER_W : CONTAINER_L;
    for (let l = 0; l < levels; l++) {
      const y = base + l * CONTAINER_H;
      b.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + CONTAINER_H, cz + d / 2, "container", colors[(ci++ * 5 + l) % colors.length]!, { ribs: along });
    }
  };
  // The crossing amidships: two stacks end to end, a catwalk from each to the side decks. You pass under the catwalks.
  const CX = 1.22;
  stack(CX, -3.05, "z", 2);
  stack(CX, 3.05, "z", 2);
  for (const [z0, z1] of [
    [-HZ, -6.1],
    [6.1, HZ],
  ] as const)
    b.box(CX - 1.22, D - 0.18, z0, CX + 1.22, D, z1, "metal", SHIP.catwalk, { look: "plate" });
  b.crate(CX, 0.4, 1.2, D);
  b.crate(CX + 0.1, -4.6, 1, D);
  // Aft half of the hold: a pier of containers out from the apron, a step down from it, cover on the floor.
  stack(HX0 + 3.05, 4.2, "x", 2);
  stack(HX0 + 9.15, 4.2, "x", 1);
  stack(-13, -4.4, "z", 1);
  stack(-6.4, -7.6, "x", 3);
  b.crate(-16.4, -1.8, 1.2);
  b.crate(-4.6, 2.2, 1.1);
  b.drums(-9.4, 8);
  b.pallets(-17.6, 8.2, 5);
  // Forward half: a pier out from the port side deck, a tall stack that stands above the deck, cover.
  stack(8.4, -HZ + 3.05, "z", 2);
  stack(8.4, -HZ + 9.15, "z", 1);
  stack(16.6, 3.4, "x", 3);
  stack(17.4, -3.2, "x", 1);
  b.crate(5.2, 6.4, 1.2);
  b.crate(12.6, 8.4, 1.1);
  b.drums(19.6, -8.2);
  b.pallets(13.4, 0.4, 4, "z");
  // Four staircases out of the hold, one in each corner.
  const rise = D / 12;
  b.stairs(-12.8, -HZ + 0.9, "-x", 12, rise, 0.6, 1.8);
  routes.push([
    [-12.2, 0, -HZ + 0.9],
    [HX0 - 0.8, D, -HZ + 0.9],
  ]);
  b.stairs(-18.4, HZ - 0.9, "+x", 12, rise, 0.6, 1.8);
  routes.push([
    [-19, 0, HZ - 0.9],
    [-11.5, D, HZ - 0.9],
    [-11.5, D, HZ + 1],
  ]);
  b.stairs(14.8, HZ - 0.9, "+x", 12, rise, 0.6, 1.8);
  routes.push([
    [14.2, 0, HZ - 0.9],
    [HX1 + 0.8, D, HZ - 0.9],
  ]);
  b.stairs(20.4, -HZ + 0.9, "-x", 12, rise, 0.6, 1.8);
  routes.push([
    [21, 0, -HZ + 0.9],
    [13.5, D, -HZ + 0.9],
    [13.5, D, -HZ - 1],
  ]);

  /* The side decks: a crane on each, a container, ventilators and gear for cover, a rail along parts of the hold's edge. */
  for (const [cx, cz, dir] of [
    [-9, -15.5, 1],
    [11, 15.5, -1],
  ] as const) {
    // The pedestal collides; the cab, the lattice jib and the hook above are scenery.
    b.block(cx, cz, 2.6, 2.6, 11, "metal", PALETTE.yellow, D);
    const top = D + 11;
    b.box(cx - 2, top, cz - 2, cx + 2, top + 3.2, cz + 2, "metal", PALETTE.yellow, g);
    b.box(cx - 1.4, top + 1.2, cz - 2.05, cx + 1.4, top + 2.6, cz + 2.05, "metal", SHIP.glass, glass);
    // The jib swings in over the hold.
    const jz = cz - Math.sign(cz) * 9;
    const tip = cx + dir * 22;
    const [j0, j1] = [Math.min(cx, tip), Math.max(cx, tip)];
    for (const y of [top + 2, top + 2.86]) for (const z of [jz - 0.7, jz + 0.56]) b.box(j0, y, z, j1, y + 0.14, z + 0.14, "metal", PALETTE.yellow, g);
    for (let x = j0 + 0.2; x < j1; x += 2.2) {
      for (const z of [jz - 0.68, jz + 0.58]) b.box(x, top + 2.14, z, x + 0.1, top + 2.86, z + 0.1, "metal", PALETTE.yellow, g);
      b.box(x, top + 2.9, jz - 0.56, x + 0.1, top + 3, jz + 0.56, "metal", PALETTE.yellow, g);
    }
    b.box(cx - 0.6, top + 2, Math.min(cz, jz) - 0.6, cx + 0.6, top + 3, Math.max(cz, jz) + 0.6, "metal", PALETTE.yellow, g);
    b.box(cx - 0.35, top + 3.2, cz - 0.35, cx + 0.35, top + 7.5, cz + 0.35, "metal", PALETTE.yellow, g);
    // A container on the hook, hanging over the hold.
    b.box(tip - dir * 2.06, top - 4.2, jz - 0.06, tip - dir * 1.94, top + 2, jz + 0.06, "metal", 0x2a2c2f, g);
    b.box(tip - dir * 2 - CONTAINER_L / 2, top - 4.2 - CONTAINER_H, jz - CONTAINER_W / 2, tip - dir * 2 + CONTAINER_L / 2, top - 4.2, jz + CONTAINER_W / 2, "container", dir > 0 ? PALETTE.teal : PALETTE.rust, { ghost: true, ribs: "x" });
  }
  stack(4, -16.2, "x", 1, D);
  stack(-4, 15.6, "x", 2, D);
  stack(27.5, 5, "z", 1, D);
  stack(27.5, -9.6, "z", 2, D);
  const vent = (x: number, z: number) => {
    b.block(x, z, 1.1, 1.1, 1.25, "metal", SHIP.white, D);
    b.block(x, z, 1.5, 1.5, 0.3, "metal", SHIP.offWhite, D + 1.25);
  };
  vent(-17, -17.4);
  vent(18.5, -17.2);
  vent(-15, 17.6);
  vent(19, 12.6);
  vent(31.5, -16.5);
  b.crate(-1.6, -12.4, 1.2, D);
  b.drums(13.6, -13.2, 1.3, 1.3, D);
  b.pallets(2.6, 12.6, 5, "x", D);
  b.crate(-18.4, 13, 1.1, D);
  b.block(24.6, 13.6, 2.2, 2.4, 1.5, "wood", PALETTE.wood, D);
  b.drums(32.8, 9.4, 1.3, 1.3, D);
  b.crate(30.4, -1.2, 1.2, D);
  b.crate(24, -2.6, 1, D);
  // Rails at the hold's edge: something to crouch behind, with gaps to drop in through.
  for (const [x0, x1, z] of [
    [-16, -11, -HZ - 0.12],
    [-2, 0, -HZ - 0.12],
    [2.5, 6, -HZ - 0.12],
    [14.6, 20, -HZ - 0.12],
    [-19, -13, HZ + 0.02],
    [-6, 0, HZ + 0.02],
    [5, 11, HZ + 0.02],
  ] as const)
    b.box(x0, D, z, x1, D + 1.05, z + 0.1, "metal", SHIP.white);
  for (const [z0, z1, x] of [
    [-7, -2, HX0 - 0.12],
    [6, 9.5, HX0 - 0.12],
    [-9, -4, HX1 + 0.02],
    [1, 7, HX1 + 0.02],
  ] as const)
    b.box(x, D, z0, x + 0.1, D + 1.05, z1, "metal", SHIP.white);

  // The ship's own paintwork is looked after; cargo, gear and drums rust as they please.
  const kept = new Set<number>([SHIP.white, SHIP.offWhite, SHIP.navy, SHIP.deck, SHIP.orange, PALETTE.yellow, PALETTE.mustard, 0x55707f, 0x8a8f93, 0x9aa0a6]);
  for (const box of b.boxes) if (box.surface === "metal" && !box.look && kept.has(box.color)) box.look = "clean";

  const aft = -Math.PI / 2; // facing the bow (+x)
  const fwd = Math.PI / 2;
  const spawns: Spawn[] = [
    // The stern (facing forward).
    { x: -47.5, y: D, z: -17, yaw: aft, side: 0 },
    { x: -47, y: D, z: -12.5, yaw: aft, side: 0 },
    { x: -46.5, y: D, z: -5.5, yaw: aft, side: 0 },
    { x: -46.5, y: D, z: 7, yaw: aft, side: 0 },
    { x: -47.5, y: D, z: 10.5, yaw: aft, side: 0 },
    { x: -48.5, y: D, z: 17.5, yaw: aft, side: 0 },
    // The forecastle (facing aft).
    { x: 42, y: FY, z: 17.5, yaw: fwd, side: 1 },
    { x: 38.5, y: FY, z: 11.5, yaw: fwd, side: 1 },
    { x: 42.5, y: FY, z: 3.5, yaw: fwd, side: 1 },
    { x: 38.2, y: FY, z: -2.5, yaw: fwd, side: 1 },
    { x: 38.5, y: FY, z: -11.5, yaw: fwd, side: 1 },
    { x: 42, y: FY, z: -17.5, yaw: fwd, side: 1 },
    // Inside the tower, on the gallery, the side decks, down in the hold.
    { x: -41.5, y: D, z: -11, yaw: aft, side: null },
    { x: -33, y: D, z: 4.5, yaw: aft, side: null },
    { x: TX1 + 1.4, y: GY, z: 6.5, yaw: aft, side: null },
    { x: 1.5, y: D, z: 17.4, yaw: Math.PI, side: null },
    { x: 9, y: D, z: -17.8, yaw: 0, side: null },
    { x: -17.5, y: 0, z: -5.5, yaw: aft, side: null },
    { x: 20, y: 0, z: 6.5, yaw: fwd, side: null },
    { x: 31, y: D, z: 16, yaw: fwd, side: null },
  ];

  // On the horizon: a burning freighter off the starboard beam, another ship far off the port bow.
  const sb = new Builder();
  const far = (x0: number, z0: number, len: number, beam: number, hull: number, bays: number) => {
    const top = SHIP_SEA_Y + 6.5;
    sb.box(x0, SHIP_SEA_Y, z0, x0 + len, top, z0 + beam, "metal", hull, g);
    sb.box(x0 + 4, top, z0 + 2, x0 + 16, top + 14.5, z0 + beam - 2, "metal", SHIP.white, g);
    sb.box(x0 + 7, top + 14.5, z0 + beam / 2 - 2, x0 + 11, top + 19.5, z0 + beam / 2 + 2, "metal", SHIP.navy, g);
    for (let i = 0; i < bays; i++) {
      const x = x0 + 22 + i * 13;
      const levels = 1 + ((i * 7 + 3) % 4);
      for (let l = 0; l < levels; l++) sb.box(x, top + l * CONTAINER_H, z0 + 1.5, x + 12.2, top + (l + 1) * CONTAINER_H, z0 + beam - 1.5, "container", colors[(i * 3 + l * 5) % colors.length]!, { ghost: true, ribs: "x" });
    }
  };
  far(-70, 92, 120, 20, SHIP.hullRed, 7);
  far(120, -150, 130, 22, SHIP.navy, 7);

  return {
    id: "ironwake",
    name: "Ironwake",
    blurb: "A giant container ship at sea: fight from the open hold up to the tower's gallery.",
    setting: "ship",
    bounds: { x0: X0, z0: -Z, x1: X1, z1: Z },
    boxes: b.boxes,
    spawns,
    perches: [],
    routes,
    skyline: sb.boxes,
    // The same low sun as the yard (it is the HDRI's): off the starboard bow, so you fight into the light going forward.
    sun: [0.714, 0.469, 0.519],
    fires: [],
    plumes: [{ x: -22, z: 102, h: 60 }],
    sky: { top: 0x6fa6d6, horizon: 0xe9dcc4, ground: 0x93a3a6, fog: 0xe6d9c2 },
  };
}

export const MAPS = { saltyard: saltyard(), ironwake: ironwake() };
export type MapId = keyof typeof MAPS;
export const MAP_IDS = Object.keys(MAPS) as MapId[];
export const DEFAULT_MAP: MapId = "saltyard";

export const isMapId = (v: unknown): v is MapId => typeof v === "string" && Object.prototype.hasOwnProperty.call(MAPS, v);
