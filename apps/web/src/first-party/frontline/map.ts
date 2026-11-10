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
 * Ironwake's heights. y = 0 is the hangar's floor; the flight deck is its
 * roof. Above that: the ramp at the bow, then the gallery on the island.
 */
export const SHIP_DECK_Y = 2 * CONTAINER_H;
export const SHIP_FORECASTLE_Y = SHIP_DECK_Y + 1.6;
export const SHIP_SEA_Y = SHIP_DECK_Y - 9.5;
/** Where the bow ramp's top deck starts (it is walkable up to the map's edge; the prow beyond is scenery). */
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
  /** Haze grey: the island and the hull. */
  white: 0xa9b1b8,
  offWhite: 0x969ea6,
  glass: 0x16232e,
  /** The flight deck's dark non-skid. */
  deck: 0x585e65,
  deckGear: 0x3a3f45,
  hold: 0x7b8288,
  catwalk: 0x8a9096,
  navy: 0x22344c,
  hullRed: 0x7a2e26,
  jet: 0x8c959d,
  jetDark: 0x41464d,
  line: 0xe6e4dc,
};

function ironwake(): MapDef {
  const X0 = -50;
  const X1 = 44;
  const Z = 19;
  const D = SHIP_DECK_Y;
  const FY = SHIP_FORECASTLE_Y;
  const FX = SHIP_FORECASTLE_X;
  // The hangar: under the flight deck amidships, 42 m by 22 m.
  const HX0 = -20;
  const HX1 = 22;
  const HZ = 11;
  const ROOF = D - 0.35;
  const b = new Builder();
  const g = { ghost: true } as const;
  const glass = { ghost: true, look: "plate" } as const;
  const routes: [number, number, number][][] = [];

  /* The flight deck around the hangar, solid down to the hangar's floor. */
  b.box(X0, 0, -Z, HX0, D, Z, "metal", SHIP.deck);
  b.box(HX1, 0, -Z, X1, D, Z, "metal", SHIP.deck);
  b.box(HX0, 0, -Z, HX1, D, -HZ, "metal", SHIP.deck);
  b.box(HX0, 0, HZ, HX1, D, Z, "metal", SHIP.deck);
  /*
   * The flight deck over the hangar. Two aircraft elevators are down at
   * hangar level, leaving their shafts open to the sky (aft to starboard,
   * forward to port), and a hatch stands open over each of the other stairs.
   */
  const EA = { x0: HX0, x1: -9, z0: 1, z1: HZ };
  const EB = { x0: 11, x1: HX1, z0: -HZ, z1: -1 };
  const HATCH = 9.2;
  const roof = (x0: number, z0: number, x1: number, z1: number) => b.box(x0, ROOF, z0, x1, D, z1, "metal", SHIP.deck);
  roof(HX0, -HATCH, -11.4, EA.z0);
  roof(-11.4, -HZ, EA.x1, EA.z0);
  roof(EA.x1, -HZ, EB.x0, HZ);
  roof(EB.x0, EB.z1, 13.4, HZ);
  roof(13.4, EB.z1, HX1, HATCH);
  // The hangar's sides (scenery over the solid deck blocks), and hazard stripes around the elevator shafts.
  for (const z of [-HZ, HZ - 0.04]) b.box(HX0, 0, z, HX1, ROOF, z + 0.04, "metal", SHIP.hold, { ghost: true, look: "plate" });
  for (const x of [HX0, HX1 - 0.04]) b.box(x, 0, -HZ, x + 0.04, ROOF, HZ, "metal", SHIP.hold, { ghost: true, look: "plate" });
  for (const e of [EA, EB]) {
    for (const z of [e.z0 - 0.35, e.z1 + 0.05]) b.box(e.x0 - 0.35, D, z, e.x1 + 0.35, D + 0.015, z + 0.3, "metal", PALETTE.yellow, g);
    for (const x of [e.x0 - 0.35, e.x1 + 0.05]) b.box(x, D, e.z0, x + 0.3, D + 0.015, e.z1, "metal", PALETTE.yellow, g);
  }

  /* The deck's edge: no bulwark on a carrier, just a low coaming, and a catwalk slung outside below it (scenery). */
  for (const s of [-1, 1]) {
    const z0 = s < 0 ? -Z - 0.35 : Z;
    b.box(X0 - 0.35, 0, z0, FX, D + 0.12, z0 + 0.35, "metal", SHIP.deck);
    b.box(FX, 0, z0, X1, FY + 0.12, z0 + 0.35, "metal", SHIP.deck);
    const c0 = s < 0 ? -Z - 2 : Z + 0.35;
    b.box(X0 + 6, D - 1.5, c0, FX - 4, D - 1.4, c0 + 1.65, "metal", SHIP.catwalk, { ghost: true, look: "plate" });
    b.box(X0 + 6, D - 1.4, s < 0 ? c0 : c0 + 1.57, FX - 4, D - 0.4, s < 0 ? c0 + 0.08 : c0 + 1.65, "metal", SHIP.offWhite, g);
  }
  b.box(X0 - 0.35, 0, -Z, X0, D + 0.12, Z, "metal", SHIP.deck);
  b.box(X1, 0, -Z - 0.35, X1 + 0.35, FY + 0.12, Z + 0.35, "metal", SHIP.deck, g);
  // The angled deck's overhang to port, beyond where you can walk (scenery).
  b.box(-34, D - 0.7, -Z - 7, 14, D, -Z - 0.35, "metal", SHIP.deck, g);
  b.box(-34, D, -Z - 6.6, 14, D + 0.015, -Z - 6.3, "metal", SHIP.line, g);

  /* Painted lines: the landing area's edges, a dashed centerline, the catapult track to the ramp. */
  for (const z of [-7.2, 6.9]) b.box(X0 + 1, D, z, 30, D + 0.012, z + 0.3, "metal", SHIP.line, g);
  for (let x = X0 + 2; x < 30; x += 7) {
    if (x + 3.5 > EA.x0 - 1 && x < EA.x1 + 1) continue;
    b.box(x, D, -0.15, x + 3.5, D + 0.012, 0.15, "metal", PALETTE.yellow, g);
  }
  b.box(23, D, 2.9, FX - 2, D + 0.02, 3.1, "metal", SHIP.jetDark, g);

  /* The bow: a ski-jump ramp up to the forward deck, broad steps in the middle and a narrower flight each side. */
  b.box(FX, D, -Z, X1, FY, Z, "metal", SHIP.deck);
  for (const [z, w] of [
    [-13, 2.4],
    [0, 9],
    [13, 2.4],
  ] as const) {
    b.stairs(FX - 2, z, "+x", 4, (FY - D) / 4, 0.5, w, SHIP.deckGear, D);
    routes.push([
      [FX - 2.6, D, z],
      [FX + 0.8, FY, z],
    ]);
  }
  b.block(40.6, -7.4, 2.4, 3.4, 1.4, "metal", SHIP.deckGear, FY);
  b.block(40.6, 8.6, 2.4, 3.4, 1.4, "metal", SHIP.deckGear, FY);
  b.block(42.8, -15, 0.7, 1.6, 0.75, "metal", 0x2c2f33, FY);
  b.block(42.8, 15, 0.7, 1.6, 0.75, "metal", 0x2c2f33, FY);
  b.crate(38.6, 15.8, 1.1, FY);
  b.drums(37.6, -16.6, 1.3, 1.3, FY);
  b.block(38.4, 5.6, 0.3, 3.2, 1.3, "metal", SHIP.offWhite, FY);
  b.block(38.4, -4.2, 0.3, 3.2, 1.3, "metal", SHIP.offWhite, FY);

  /*
   * Aircraft. `dir` is where the nose points; a jet stands on its gear, so
   * you can't walk under it but you can see (and shoot) below the fuselage.
   */
  const jet = (cx: number, cz: number, dir: "+x" | "-x" | "+z" | "-z", y: number, scenery = false) => {
    const part = (l0: number, l1: number, w0: number, w1: number, y0: number, y1: number, color: number, ghost = false) => {
      const extra = ghost || scenery ? g : {};
      if (dir === "+x") b.box(cx + l0, y + y0, cz + w0, cx + l1, y + y1, cz + w1, "metal", color, extra);
      else if (dir === "-x") b.box(cx - l1, y + y0, cz - w1, cx - l0, y + y1, cz - w0, "metal", color, extra);
      else if (dir === "+z") b.box(cx - w1, y + y0, cz + l0, cx - w0, y + y1, cz + l1, "metal", color, extra);
      else b.box(cx + w0, y + y0, cz - l1, cx + w1, y + y1, cz - l0, "metal", color, extra);
    };
    part(-4.4, 2.6, -0.75, 0.75, 1, 2.15, SHIP.jet); // fuselage
    part(-3.6, 1, -0.45, 0.45, 2.15, 2.4, SHIP.jet); // spine
    part(2.6, 4, -0.55, 0.55, 1.1, 2.05, SHIP.jet); // forward fuselage
    part(4, 5, -0.38, 0.38, 1.25, 1.9, SHIP.jet); // nose
    part(5, 5.9, -0.2, 0.2, 1.42, 1.74, SHIP.jetDark); // radome
    part(1.2, 3.6, -0.4, 0.4, 2.05, 2.62, SHIP.glass, true); // canopy
    part(-5.1, -4.4, -0.68, -0.06, 1.2, 1.95, SHIP.jetDark); // nozzles
    part(-5.1, -4.4, 0.06, 0.68, 1.2, 1.95, SHIP.jetDark);
    for (const s of [-1, 1]) {
      const w = (a: number, c: number) => [Math.min(s * a, s * c), Math.max(s * a, s * c)] as const;
      part(0.2, 1.8, ...w(0.75, 1.02), 1.12, 1.86, SHIP.jetDark, true); // intake
      part(0.9, 2.6, ...w(0.75, 1.5), 1.6, 1.72, SHIP.jet, true); // wing root
      part(-2.6, 0.9, ...w(0.75, 2.5), 1.55, 1.72, SHIP.jet); // inner wing
      part(-3, 0, ...w(2.5, 4.2), 1.57, 1.7, SHIP.jet); // outer wing, swept back
      part(-2.6, 0.3, ...w(4.2, 4.3), 1.52, 1.76, SHIP.line, true); // wingtip missile
      part(-5.3, -3.7, ...w(0.75, 2.5), 1.56, 1.68, SHIP.jet); // tailplane
      part(-4.9, -3.4, ...w(0.5, 0.66), 2.15, 3.3, SHIP.jet, true); // fin
      part(-5.2, -3.9, ...w(0.5, 0.66), 3.3, 4.2, SHIP.jet, true);
      part(-1.7, -1.4, ...w(0.8, 1), 0, 1, SHIP.jetDark, true); // main gear
    }
    part(2.3, 2.5, -0.1, 0.1, 0, 1.1, SHIP.jetDark, true); // nose gear
  };
  /** A yellow deck tractor. */
  const tractor = (cx: number, cz: number, along: "x" | "z", y: number) => {
    const [w, d] = along === "x" ? [2.6, 1.5] : [1.5, 2.6];
    b.block(cx, cz, w, d, 0.95, "metal", PALETTE.yellow, y);
    b.block(cx, cz, w * 0.45, d * 0.45, 0.35, "metal", SHIP.jetDark, y + 0.95);
  };
  /** A jet-blast deflector: a plate raised out of the deck. */
  const deflector = (x: number, z0: number, z1: number) => b.box(x, D, z0, x + 0.3, D + 1.9, z1, "metal", SHIP.deckGear, { look: "plate" });

  /* The island on the starboard side (x −3…11): flight control at deck level, a gallery one deck up. */
  const IX0 = -3;
  const IX1 = 11;
  const IZ = 12.5;
  const WH = 3.2;
  const CEIL = D + WH;
  const DOOR = D + 2.4;
  // The face over the flight deck: two doors and a row of windows.
  for (const [x0, x1] of [
    [IX0, IX0 + 1],
    [IX0 + 3.6, IX0 + 4.6],
    [IX1 - 4.6, IX1 - 3.6],
    [IX1 - 1, IX1],
  ] as const)
    b.box(x0, D, IZ, x1, CEIL, IZ + 0.5, "metal", SHIP.white);
  for (const x0 of [IX0 + 1, IX1 - 3.6]) b.box(x0, DOOR, IZ, x0 + 2.6, CEIL, IZ + 0.5, "metal", SHIP.white);
  b.box(IX0 + 4.6, D, IZ, IX1 - 4.6, D + 1.05, IZ + 0.5, "metal", SHIP.white);
  b.box(IX0 + 4.6, D + 2.05, IZ, IX1 - 4.6, CEIL, IZ + 0.5, "metal", SHIP.white);
  // Its ends: a door in each. The outboard wall is solid.
  for (const x of [IX0, IX1 - 0.5]) {
    b.box(x, D, IZ + 0.5, x + 0.5, CEIL, IZ + 1.4, "metal", SHIP.white);
    b.box(x, D, IZ + 4, x + 0.5, CEIL, Z, "metal", SHIP.white);
    b.box(x, DOOR, IZ + 1.4, x + 0.5, CEIL, IZ + 4, "metal", SHIP.white);
  }
  b.box(IX0 + 0.5, D, Z - 0.5, IX1 - 0.5, CEIL, Z, "metal", SHIP.white);
  // Everything above: four more levels, solid.
  const TOP = D + 12.4;
  b.box(IX0, CEIL, IZ, IX1, TOP, Z, "metal", SHIP.white);
  // Inside: consoles under the windows, a plotting table, lockers.
  b.block(4, IZ + 1.1, 3.6, 0.8, 1, "metal", 0x55707f, D);
  b.block(4, 16.4, 2.4, 1.2, 0.85, "metal", 0x8a8f93, D);
  b.block(IX0 + 1.2, Z - 1, 1.2, 0.9, 2, "metal", 0x55707f, D);
  b.crate(IX1 - 1.4, Z - 1.3, 1.1, D);

  // The gallery: along the island's face over the flight deck and around its forward end, with a waist-high rail.
  const GY = CEIL + 0.2;
  const GX1 = IX1 + 2.4;
  b.box(IX0, CEIL, IZ - 2.4, GX1, GY, IZ, "metal", SHIP.offWhite);
  b.box(IX1, CEIL, IZ, GX1, GY, Z, "metal", SHIP.offWhite);
  b.box(IX0, GY, IZ - 2.4, GX1, GY + 1.05, IZ - 2.3, "metal", SHIP.white);
  b.box(GX1 - 0.1, GY, IZ - 2.3, GX1, GY + 1.05, 15.9, "metal", SHIP.white);
  b.box(GX1 - 0.1, GY, 18.3, GX1, GY + 1.05, Z, "metal", SHIP.white);
  // Two ways up: from amidships at its aft end, and from the bow side behind it.
  b.stairs(IX0 - 4.8, IZ - 1.2, "+x", 8, (GY - D) / 8, 0.6, 2.2, PALETTE.metal, D);
  routes.push([
    [IX0 - 5.5, D, IZ - 1.2],
    [IX0 + 0.8, GY, IZ - 1.2],
  ]);
  b.stairs(GX1 + 4.8, 17.1, "-x", 8, (GY - D) / 8, 0.6, 2.2, PALETTE.metal, D);
  routes.push([
    [GX1 + 5.5, D, 17.1],
    [GX1 - 0.9, GY, 17.1],
  ]);

  // Scenery up the island: deck edges, windows, the bridge, the funnel, the mast and its radar.
  for (let level = 1; level <= 3; level++) {
    const y = CEIL + level * 2.3;
    b.box(IX0 - 0.3, y, IZ - 0.3, IX1 + 0.3, y + 0.14, Z + 0.3, "metal", SHIP.offWhite, g);
  }
  for (let level = 0; level < 4; level++) {
    const y = CEIL + level * 2.3 + 0.95;
    for (let i = 0; i < 5; i++) {
      const x = IX0 + 1.8 + i * 2.6;
      b.box(x - 0.8, y, IZ - 0.04, x + 0.8, y + 0.85, IZ, "metal", SHIP.glass, glass);
    }
    for (const x of [IX0 - 0.04, IX1]) for (const z of [14.2, 16.6]) b.box(x, y, z - 0.7, x + 0.04, y + 0.85, z + 0.7, "metal", SHIP.glass, glass);
  }
  const BRIDGE = TOP + 2.8;
  b.box(IX0 - 0.8, TOP, IZ - 1.4, IX1 + 0.8, TOP + 0.25, Z + 0.3, "metal", SHIP.offWhite, g);
  b.box(IX0 + 0.5, TOP + 0.25, IZ - 0.9, IX1 - 2, BRIDGE, Z - 0.6, "metal", SHIP.white, g);
  b.box(IX0 + 0.8, TOP + 1.1, IZ - 0.95, IX1 - 2.3, BRIDGE - 0.5, IZ - 0.9, "metal", SHIP.glass, glass);
  b.box(IX0 + 0.45, TOP + 1.1, IZ - 0.6, IX0 + 0.5, BRIDGE - 0.5, Z - 0.9, "metal", SHIP.glass, glass);
  b.box(IX0 + 0.2, BRIDGE, IZ - 1.2, IX1 - 1.7, BRIDGE + 0.2, Z - 0.3, "metal", SHIP.offWhite, g);
  b.box(IX1 - 6, BRIDGE, 14, IX1 - 2.6, BRIDGE + 5, 17.6, "metal", SHIP.offWhite, g);
  b.box(IX1 - 5.8, BRIDGE + 5, 14.2, IX1 - 2.8, BRIDGE + 5.3, 17.4, "metal", 0x1b1c1e, g);
  b.box(1.7, BRIDGE, 15.5, 2.3, BRIDGE + 9, 16.1, "metal", SHIP.white, g);
  b.box(1.8, BRIDGE + 5.6, 12.8, 2.2, BRIDGE + 5.9, 18.8, "metal", SHIP.white, g);
  b.box(0.4, BRIDGE + 7, 14.6, 3.6, BRIDGE + 7.25, 17, "metal", SHIP.offWhite, g);
  b.box(-1.4, BRIDGE + 0.2, 13.6, -1, BRIDGE + 3, 18, "metal", SHIP.jetDark, g);

  /* Aft of the island: parked jets wingtip to wingtip, tractors and stores between them. */
  jet(-41, -11, "+z", D);
  jet(-41, 11.4, "-z", D);
  jet(-28, -13.2, "+x", D);
  tractor(-33.2, 1.2, "x", D);
  b.crate(-46.2, -3.2, 1.1, D);
  b.drums(-45.6, 17.2, 1.3, 1.3, D);
  b.block(-34, 14.6, 2.2, 2.6, 1.4, "wood", PALETTE.wood, D);
  b.crate(-26.4, 4.4, 1.2, D);
  b.crate(-26.3, 4.5, 0.8, D + 1.2);
  b.pallets(-24.4, -4.6, 5, "z", D);
  b.block(-47.6, -9, 1.8, 3, 1.3, "metal", SHIP.deckGear, D);

  /* Amidships, over the hangar: a jet waiting on the centerline, cover between the elevators. */
  jet(1, -5, "-x", D);
  tractor(-6.4, 6.4, "z", D);
  b.crate(4.6, 3.6, 1.2, D);
  b.drums(8.6, 7.6, 1.3, 1.3, D);
  b.pallets(-3.4, -11.2, 5, "x", D);
  b.crate(-14.6, -13.6, 1.1, D);
  b.block(6.2, -14.8, 2.4, 2.2, 1.5, "wood", PALETTE.wood, D);
  b.drums(-13.6, 14.4, 1.3, 1.3, D);
  b.crate(15.6, 13.4, 1.2, D);

  /* Forward: a jet on the catapult with its blast deflector up, another parked to port. */
  jet(28.5, 3, "+x", D);
  deflector(21.9, 0.4, 5.6);
  jet(26.5, -14, "-x", D);
  tractor(31, 10.6, "x", D);
  b.crate(24.6, -5.4, 1.2, D);
  b.drums(32.8, -7.4, 1.3, 1.3, D);
  b.crate(26, 15.4, 1.1, D);
  // Out on the angled deck, beyond reach.
  jet(-20, -Z - 3.4, "+x", D, true);
  jet(-2, -Z - 3.6, "+x", D, true);

  /* Rails at the elevator shafts: something to crouch behind, with gaps to drop in through. */
  for (const [x0, x1, z] of [
    [-19, -15, EA.z0 - 0.12],
    [-12.5, -9.5, EA.z0 - 0.12],
    [12, 15, EB.z1 + 0.02],
    [17.5, 21, EB.z1 + 0.02],
  ] as const)
    b.box(x0, D, z, x1, D + 1.05, z + 0.1, "metal", SHIP.white);
  for (const [z0, z1, x] of [
    [2, 6, EA.x1 + 0.02],
    [-9, -5, EB.x0 - 0.12],
    [2.5, 8, HX0 - 0.12],
    [-8.5, -3, HX1 + 0.02],
  ] as const)
    b.box(x, D, z0, x + 0.1, D + 1.05, z1, "metal", SHIP.white);

  /* The hangar. A bulkhead with its fire door open splits it into two bays. */
  for (const [z0, z1] of [
    [-HZ, -4],
    [4, HZ],
  ] as const)
    b.box(0.6, 0, z0, 1.8, ROOF, z1, "metal", SHIP.hold);
  b.box(0.6, 3.4, -4, 1.8, ROOF, 4, "metal", SHIP.hold);
  for (const z of [-4.1, 3.8]) b.box(0.5, 0, z, 1.9, 3.4, z + 0.3, "metal", PALETTE.yellow, g);
  // Aft bay: a jet under maintenance, the lowered elevator to starboard.
  jet(-8, -4.5, "+x", 0);
  tractor(-15.6, 5.4, "x", 0);
  b.crate(-16.4, -1.8, 1.2);
  b.crate(-4.6, 2.6, 1.1);
  b.drums(-3.4, 8.6);
  b.pallets(-17.6, -6.4, 5);
  b.block(-1.2, -9.6, 1, 2.4, 1.9, "metal", 0x55707f);
  b.box(-11.2, 0, 6.2, -10.2, 1.3, 8.6, "metal", PALETTE.rust);
  // Forward bay: another jet, the other elevator to port.
  jet(9, 4.5, "-x", 0);
  tractor(16.4, -4.6, "z", 0);
  b.crate(5.2, -6.4, 1.2);
  b.crate(5.3, -6.3, 0.8, 1.2);
  b.crate(12.6, -8.4, 1.1);
  b.drums(19.6, 1.2);
  b.pallets(4.4, -1.6, 4, "z");
  b.block(3.4, 9.8, 2.4, 1, 1.9, "metal", 0x55707f);
  b.box(18.6, 0, 5.2, 20.8, 1.3, 6.4, "metal", PALETTE.rust);
  // Lights along the overhead (scenery).
  for (const x of [-15, -5, 6, 16]) for (const z of [-5.5, 5.5]) if (!(x < EA.x1 && z > EA.z0) && !(x > EB.x0 && z < EB.z1)) b.box(x - 1.2, ROOF - 0.12, z - 0.15, x + 1.2, ROOF, z + 0.15, "metal", 0xf2efe2, g);
  // Four staircases up to the flight deck, one in each corner.
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

  // The ship's own paintwork is looked after; stores, gear and drums rust as they please.
  const kept = new Set<number>([SHIP.white, SHIP.offWhite, SHIP.navy, SHIP.deck, SHIP.hold, SHIP.jet, SHIP.jetDark, SHIP.line, PALETTE.yellow, 0x55707f, 0x8a8f93, 0xf2efe2]);
  for (const box of b.boxes) if (box.surface === "metal" && !box.look && kept.has(box.color)) box.look = "clean";

  const aft = -Math.PI / 2; // facing the bow (+x)
  const fwd = Math.PI / 2;
  const spawns: Spawn[] = [
    // The stern (facing forward).
    { x: -47.5, y: D, z: -17.5, yaw: aft, side: 0 },
    { x: -48, y: D, z: -12.5, yaw: aft, side: 0 },
    { x: -46.5, y: D, z: -5.5, yaw: aft, side: 0 },
    { x: -46.5, y: D, z: 4, yaw: aft, side: 0 },
    { x: -48, y: D, z: 10.5, yaw: aft, side: 0 },
    { x: -48.5, y: D, z: 15, yaw: aft, side: 0 },
    // The ramp at the bow (facing aft).
    { x: 42, y: FY, z: 17.5, yaw: fwd, side: 1 },
    { x: 38.5, y: FY, z: 11.5, yaw: fwd, side: 1 },
    { x: 42.5, y: FY, z: 3.5, yaw: fwd, side: 1 },
    { x: 38.2, y: FY, z: -1, yaw: fwd, side: 1 },
    { x: 38.5, y: FY, z: -11.5, yaw: fwd, side: 1 },
    { x: 42, y: FY, z: -17.5, yaw: fwd, side: 1 },
    // On the flight deck, inside the island, on its gallery, down in the hangar.
    { x: -30, y: D, z: 7.5, yaw: aft, side: null },
    { x: -22.5, y: D, z: -4, yaw: aft, side: null },
    { x: IX1 + 1.2, y: GY, z: 15, yaw: 0, side: null },
    { x: 7.5, y: D, z: 16.5, yaw: 0, side: null },
    { x: 9, y: D, z: -17.5, yaw: 0, side: null },
    { x: -17.5, y: 0, z: -3.5, yaw: aft, side: null },
    { x: 20, y: 0, z: 8, yaw: fwd, side: null },
    { x: 31, y: D, z: 16, yaw: fwd, side: null },
  ];

  // On the horizon: a burning freighter off the starboard beam, another ship far off the port bow.
  const colors = [PALETTE.rust, PALETTE.blue, PALETTE.teal, PALETTE.mustard, PALETTE.bone, PALETTE.olive, PALETTE.brick];
  const sb = new Builder();
  const far = (x0: number, z0: number, len: number, beam: number, hull: number, bays: number) => {
    const top = SHIP_SEA_Y + 6.5;
    sb.box(x0, SHIP_SEA_Y, z0, x0 + len, top, z0 + beam, "metal", hull, g);
    sb.box(x0 + 4, top, z0 + 2, x0 + 16, top + 14.5, z0 + beam - 2, "metal", 0xe2dfd6, g);
    sb.box(x0 + 7, top + 14.5, z0 + beam / 2 - 2, x0 + 11, top + 19.5, z0 + beam / 2 + 2, "metal", SHIP.navy, g);
    for (let i = 0; i < bays; i++) {
      const x = x0 + 22 + i * 13;
      const levels = 1 + ((i * 7 + 3) % 4);
      for (let l = 0; l < levels; l++) sb.box(x, top + l * CONTAINER_H, z0 + 1.5, x + 12.2, top + (l + 1) * CONTAINER_H, z0 + beam - 1.5, "container", colors[(i * 3 + l * 5) % colors.length]!, { ghost: true, ribs: "x" });
    }
  };
  /** An escort: a grey warship's outline. */
  const escort = (x0: number, z0: number) => {
    const top = SHIP_SEA_Y + 5;
    sb.box(x0, SHIP_SEA_Y, z0, x0 + 110, top, z0 + 14, "metal", SHIP.offWhite, g);
    sb.box(x0 + 38, top, z0 + 2, x0 + 70, top + 7, z0 + 12, "metal", SHIP.white, g);
    sb.box(x0 + 48, top + 7, z0 + 4, x0 + 58, top + 12, z0 + 10, "metal", SHIP.white, g);
    sb.box(x0 + 52, top + 12, z0 + 6.5, x0 + 53.5, top + 24, z0 + 8, "metal", SHIP.offWhite, g);
    sb.box(x0 + 84, top, z0 + 5, x0 + 90, top + 2.4, z0 + 9, "metal", SHIP.offWhite, g);
  };
  far(-70, 92, 120, 20, SHIP.hullRed, 7);
  escort(110, -150);

  return {
    id: "ironwake",
    name: "Ironwake",
    blurb: "An aircraft carrier at sea: fight among the jets on the flight deck, from the island's gallery, or down in the hangar.",
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
