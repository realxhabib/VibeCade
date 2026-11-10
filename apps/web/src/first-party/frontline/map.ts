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
  stairs(x: number, z: number, dir: "+x" | "-x" | "+z" | "-z", steps: number, rise: number, run: number, width: number, color = PALETTE.metal): void {
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      const a = run * i;
      const b = run * (i + 1);
      const plate = { look: "plate" } as const;
      if (dir === "+x") this.box(x + a, 0, z - width / 2, x + b, top, z + width / 2, "metal", color, plate);
      if (dir === "-x") this.box(x - b, 0, z - width / 2, x - a, top, z + width / 2, "metal", color, plate);
      if (dir === "+z") this.box(x - width / 2, 0, z + a, x + width / 2, top, z + b, "metal", color, plate);
      if (dir === "-z") this.box(x - width / 2, 0, z - b, x + width / 2, top, z - a, "metal", color, plate);
    }
  }

  crate(cx: number, cz: number, size = 1.1, y = 0, color = PALETTE.wood): Box {
    return this.block(cx, cz, size, size, size, "wood", color, y);
  }

  /** A cluster of oil drums (four on a 1.3 m square), cover to the waist. */
  drums(cx: number, cz: number, w = 1.3, d = 1.3): Box {
    return this.box(cx - w / 2, 0, cz - d / 2, cx + w / 2, 0.9, cz + d / 2, "metal", PALETTE.drum, { look: "drums" });
  }

  /** A stack of wooden pallets (1.2 × 1.0 m, `n` high). */
  pallets(cx: number, cz: number, n: number, along: "x" | "z" = "x"): Box {
    const w = along === "x" ? 1.2 : 1.0;
    const d = along === "x" ? 1.0 : 1.2;
    return this.box(cx - w / 2, 0, cz - d / 2, cx + w / 2, n * 0.15, cz + d / 2, "wood", PALETTE.wood, { look: "pallets", ribs: along });
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

/** Sea level under Ironwake's main deck (the deck is y = 0). */
export const SHIP_SEA_Y = -9;
/** Ironwake's bow beyond the playable deck: the raised forecastle's outline, aft to the prow (x, half-beam). */
export const SHIP_BOW: readonly (readonly [number, number])[] = [
  [44, 19.35],
  [54, 16.5],
  [63, 10.5],
  [69, 4.6],
  [72, 0],
];
export const SHIP_FORECASTLE_Y = 1.7;

const SHIP = {
  white: 0xe2dfd6,
  offWhite: 0xcfccc3,
  glass: 0x16232e,
  deckGear: 0x35584a,
  hatch: 0x6a7068,
  navy: 0x22344c,
  hullRed: 0x7a2e26,
};

function ironwake(): MapDef {
  const X0 = -50;
  const X1 = 44;
  const Z = 19;
  const b = new Builder();
  const plate = { look: "plate" } as const;

  /* Bulwarks (just outside the playable deck) and the step up to the forecastle. */
  const BW = 1.15;
  b.box(X0 - 0.35, 0, -Z - 0.35, X1, BW, -Z, "metal", SHIP.white);
  b.box(X0 - 0.35, 0, Z, X1, BW, Z + 0.35, "metal", SHIP.white);
  b.box(X0 - 0.35, 0, -Z, X0, BW, Z, "metal", SHIP.white);
  b.box(X1, 0, -Z - 0.35, X1 + 1, SHIP_FORECASTLE_Y, Z + 0.35, "metal", SHIP.white);

  /* Stern: the accommodation tower (x −40…−26, z −15…15). Its ground floor is open: mess room, lockers, a stair core. */
  const TX0 = -40;
  const TX1 = -26;
  const TZ = 15;
  const WH = 3.2;
  const DOOR = 2.4;
  // Forward wall: a door near each side, two mess-room windows looking down the cargo deck.
  for (const [z0, z1] of [
    [-TZ, -10.5],
    [-7.5, -4.5],
    [-1.5, 1.5],
    [4.5, 7.5],
    [10.5, TZ],
  ] as const)
    b.box(TX1 - 0.5, 0, z0, TX1, WH, z1, "metal", SHIP.white);
  for (const z0 of [-10.5, 7.5]) b.box(TX1 - 0.5, DOOR, z0, TX1, WH, z0 + 3, "metal", SHIP.white);
  for (const z0 of [-4.5, 1.5]) {
    b.box(TX1 - 0.5, 0, z0, TX1, 1.05, z0 + 3, "metal", SHIP.white);
    b.box(TX1 - 0.5, 2.05, z0, TX1, WH, z0 + 3, "metal", SHIP.white);
  }
  // Aft wall: one door on the centerline.
  b.box(TX0, 0, -TZ, TX0 + 0.5, WH, -1.5, "metal", SHIP.white);
  b.box(TX0, 0, 1.5, TX0 + 0.5, WH, TZ, "metal", SHIP.white);
  b.box(TX0, DOOR, -1.5, TX0 + 0.5, WH, 1.5, "metal", SHIP.white);
  // Side walls: a door each (port one further aft).
  for (const [z0, z1, d0] of [
    [-TZ, -TZ + 0.5, -36.5],
    [TZ - 0.5, TZ, -32.5],
  ] as const) {
    b.box(TX0 + 0.5, 0, z0, d0, WH, z1, "metal", SHIP.white);
    b.box(d0 + 3, 0, z0, TX1 - 0.5, WH, z1, "metal", SHIP.white);
    b.box(d0, DOOR, z0, d0 + 3, WH, z1, "metal", SHIP.white);
  }
  // Everything above the ground floor: five more decks, solid.
  const TOP = 17.4;
  b.box(TX0, WH, -TZ, TX1, TOP, TZ, "metal", SHIP.white);
  // Inside: the stair core, lockers, the galley counter, mess tables.
  b.box(-35.5, 0, -2.5, -31.5, WH, 2.5, "metal", SHIP.offWhite);
  b.block(-38.9, -8.5, 0.9, 4.2, 2, "metal", 0x55707f);
  b.block(-38.9, 9.5, 0.9, 3.2, 2, "metal", 0x55707f);
  b.block(-33.5, 10.6, 3.4, 0.9, 1.05, "metal", 0x8a8f93);
  b.block(-29.2, -9, 1.2, 2.6, 0.8, "metal", 0x8a8f93);
  b.block(-33.6, -9.4, 1.2, 2.6, 0.8, "metal", 0x8a8f93);
  b.block(-29.4, 0, 1.1, 2.2, 0.8, "metal", 0x8a8f93);
  b.crate(-37.6, 4.6, 1.1);
  b.crate(-28.4, 12.6, 1.2);
  b.crate(-28.5, 12.5, 0.8, 1.2);

  // Scenery up the tower (never collides): deck edges, windows, the bridge with its wings, funnel and mast.
  const g = { ghost: true } as const;
  for (let level = 1; level <= 4; level++) {
    const y = WH + (level - 1) * 2.84 + 2.6;
    b.box(TX0 - 0.5, y, -TZ - 0.5, TX1 + 0.7, y + 0.16, TZ + 0.5, "metal", SHIP.offWhite, g);
  }
  for (let level = 0; level < 5; level++) {
    const y = WH + level * 2.84 + 0.95;
    if (y + 1 > TOP) break;
    for (let i = 0; i < 9; i++) {
      const z = -12 + i * 3;
      b.box(TX1, y, z - 0.75, TX1 + 0.04, y + 0.95, z + 0.75, "metal", SHIP.glass, { ghost: true, look: "plate" });
      b.box(TX0 - 0.04, y, z - 0.75, TX0, y + 0.95, z + 0.75, "metal", SHIP.glass, { ghost: true, look: "plate" });
    }
    for (let i = 0; i < 4; i++) {
      const x = -37.5 + i * 3;
      b.box(x - 0.75, y, -TZ - 0.04, x + 0.75, y + 0.95, -TZ, "metal", SHIP.glass, { ghost: true, look: "plate" });
      b.box(x - 0.75, y, TZ, x + 0.75, y + 0.95, TZ + 0.04, "metal", SHIP.glass, { ghost: true, look: "plate" });
    }
  }
  const BRIDGE = TOP + 3;
  b.box(TX0, TOP, -Z - 0.3, TX1 + 1, TOP + 0.3, Z + 0.3, "metal", SHIP.offWhite, g);
  b.box(TX0 + 1, TOP + 0.3, -Z + 2.5, TX1 + 1, BRIDGE, Z - 2.5, "metal", SHIP.white, g);
  b.box(TX1 + 1, TOP + 1.25, -Z + 3, TX1 + 1.05, BRIDGE - 0.5, Z - 3, "metal", SHIP.glass, { ghost: true, look: "plate" });
  b.box(TX0 + 0.6, BRIDGE, -Z + 2, TX1 + 1.5, BRIDGE + 0.22, Z - 2, "metal", SHIP.offWhite, g);
  // Wing rails.
  for (const z of [-Z - 0.3, Z + 0.2]) b.box(TX0, TOP + 0.3, z, TX1 + 1, TOP + 1.3, z + 0.1, "metal", SHIP.white, g);
  for (const z of [-Z - 0.3, Z - 2.5]) b.box(TX1 + 0.9, TOP + 0.3, z, TX1 + 1, TOP + 1.3, z + 2.8, "metal", SHIP.white, g);
  // Funnel (navy with a mustard band) and the radar mast.
  b.box(-39, BRIDGE, -3.2, -34.5, BRIDGE + 7, 3.2, "metal", SHIP.navy, g);
  b.box(-39.05, BRIDGE + 4.2, -3.25, -34.45, BRIDGE + 5.5, 3.25, "metal", PALETTE.mustard, g);
  b.box(-38.6, BRIDGE + 7, -2.8, -34.9, BRIDGE + 7.3, 2.8, "metal", 0x1b1c1e, g);
  b.box(-30.3, BRIDGE, -0.3, -29.7, BRIDGE + 8, 0.3, "metal", SHIP.white, g);
  b.box(-30.2, BRIDGE + 5.4, -3.4, -29.8, BRIDGE + 5.7, 3.4, "metal", SHIP.white, g);
  b.box(-30.6, BRIDGE + 6.6, -1.6, -29.4, BRIDGE + 6.9, 1.6, "metal", 0x9aa0a6, g);

  /* The mooring deck behind the tower. */
  b.block(-45.5, -9.5, 2.2, 3.2, 1.35, "metal", SHIP.deckGear);
  b.block(-45.5, 9.5, 2.2, 3.2, 1.35, "metal", SHIP.deckGear);
  b.drums(-42.4, -15.6);
  b.drums(-47.8, 2.2);
  b.block(-48.6, -14.5, 0.7, 1.6, 0.75, "metal", 0x2c2f33);
  b.block(-48.6, 14.5, 0.7, 1.6, 0.75, "metal", 0x2c2f33);
  b.crate(-43.2, 4.4, 1.2);
  b.crate(-42.1, 5.3, 1);
  b.pallets(-44.6, 15.8, 4);
  b.crate(-46.4, -3.4, 1.1);

  /* Cargo. Containers stow fore and aft: an inner and an outer row each side of the center lane. */
  const INNER = 7.22;
  const OUTER = 12.22;
  const colors = [PALETTE.rust, PALETTE.blue, PALETTE.teal, PALETTE.mustard, PALETTE.bone, PALETTE.olive, PALETTE.brick];
  let ci = 0;
  const stack = (x: number, z: number, levels: number, along: "x" | "z" = "x") => {
    for (let l = 0; l < levels; l++) b.container(x, z, along, colors[(ci++ * 5 + l) % colors.length]!, l);
  };
  // Bay 1 (x −22…−9.8).
  stack(-18.95, INNER, 2);
  stack(-18.95, OUTER, 3);
  stack(-12.85, OUTER, 2);
  stack(-18.95, -INNER, 1);
  stack(-12.85, -INNER, 3);
  stack(-12.85, -OUTER, 2);
  stack(-15.9, 0.9, 1);
  b.crate(-20.4, -2.6, 1.2);
  b.crate(-11.2, 4.3, 1.1);
  b.drums(-20.6, -12.4);
  // Bay 2 (x −1.8…10.4): the starboard inner row is one container high, a walkway you reach by the stairs.
  stack(1.25, INNER, 1);
  stack(7.35, INNER, 1);
  stack(1.25, OUTER, 3);
  stack(7.35, OUTER, 2);
  stack(1.25, -INNER, 2);
  stack(1.25, -OUTER, 2);
  stack(7.35, -OUTER, 3);
  stack(4.3, 0, 2, "z");
  b.crate(8.6, -6.9, 1.2);
  b.crate(-0.6, -3.8, 1);
  // Bay 3 (x 18.4…30.6): the same on the port side, stairs from the foredeck.
  stack(21.45, -INNER, 1);
  stack(27.55, -INNER, 1);
  stack(21.45, -OUTER, 3);
  stack(27.55, -OUTER, 3);
  stack(27.55, INNER, 2);
  stack(21.45, OUTER, 2);
  stack(27.55, OUTER, 1);
  stack(24.5, 1.4, 1);
  b.crate(20.2, 6.6, 1.2);
  b.crate(21.4, 7.3, 0.9);
  b.drums(29.2, -3.4);
  b.stairs(-5.4, INNER, "+x", 6, CONTAINER_H / 6, 0.6, 1.8);
  b.stairs(34.2, -INNER, "-x", 6, CONTAINER_H / 6, 0.6, 1.8);

  /* The lane in front of the tower. */
  b.drums(-24, 1.2);
  b.crate(-24.2, -12.6, 1.2);
  b.pallets(-23.8, 11.6, 5, "z");

  /* Crane courts: a low hatch cover (you step onto it), a crane pedestal, cover. */
  for (const [x0, cz, dir] of [
    [-9, -11, 1],
    [11.2, 11, -1],
  ] as const) {
    b.box(x0, 0, -5, x0 + 6.4, 0.4, 5, "metal", SHIP.hatch, plate);
    const cx = x0 + 3.2;
    // The pedestal collides; the cab, jib and hook above are scenery.
    b.block(cx, cz, 2.6, 2.6, 13, "metal", PALETTE.yellow);
    b.box(cx - 2, 13, cz - 2, cx + 2, 16.2, cz + 2, "metal", PALETTE.yellow, g);
    b.box(cx - 1.4, 14.2, cz - 2.05, cx + 1.4, 15.6, cz + 2.05, "metal", SHIP.glass, { ghost: true, look: "plate" });
    const tip = cx + dir * 27;
    // The jib: a lattice box girder (four chords, posts and braces between them).
    const [j0, j1] = [Math.min(cx, tip), Math.max(cx, tip)];
    for (const y of [15, 15.86]) for (const z of [cz - 0.7, cz + 0.56]) b.box(j0, y, z, j1, y + 0.14, z + 0.14, "metal", PALETTE.yellow, g);
    for (let x = j0 + 0.2; x < j1; x += 2.2) {
      for (const z of [cz - 0.68, cz + 0.58]) b.box(x, 15.14, z, x + 0.1, 15.86, z + 0.1, "metal", PALETTE.yellow, g);
      b.box(x, 15.9, cz - 0.56, x + 0.1, 16, cz + 0.56, "metal", PALETTE.yellow, g);
    }
    b.box(cx - dir * 4.5, 14.6, cz - 0.9, cx, 16.4, cz + 0.9, "metal", 0x4b4f55, g);
    b.box(cx - 0.35, 16.2, cz - 0.35, cx + 0.35, 20.5, cz + 0.35, "metal", PALETTE.yellow, g);
    b.box(tip - dir * 2.06, 7.2, cz - 0.06, tip - dir * 1.94, 15, cz + 0.06, "metal", 0x2a2c2f, g);
    b.box(tip - dir * 2.4, 6.4, cz - 0.4, tip - dir * 1.6, 7.2, cz + 0.4, "metal", PALETTE.yellow, g);
  }
  b.crate(-6.4, -1.6, 1.2, 0.4);
  b.crate(-5.2, -2.3, 0.9, 0.4);
  b.pallets(-4, 2.6, 4);
  b.drums(-8.4, 13.2);
  b.crate(13.4, 1.8, 1.2, 0.4);
  b.crate(13.5, 1.9, 0.8, 1.6);
  b.pallets(16, -2.4, 5, "z");
  b.drums(12.2, -11.8);
  b.crate(16.8, -14.2, 1.1);

  /* The walkways down both rails: ventilators, bollards, odds and ends for cover. */
  const vent = (x: number, z: number) => {
    b.block(x, z, 1.1, 1.1, 1.25, "metal", SHIP.white);
    b.block(x, z, 1.5, 1.5, 0.3, "metal", SHIP.offWhite, 1.25);
  };
  vent(-33, 17.9);
  vent(-30, -17.9);
  vent(-15.5, 17.4);
  vent(-3.5, -17.6);
  vent(9.5, 17.6);
  vent(19.5, -15.2);
  vent(24.5, 17.2);
  b.crate(-6, 15.2, 1.2);
  b.crate(-4.8, 15.6, 1);
  b.drums(-17.5, -16.2);
  b.pallets(4.5, -15.4, 5);
  b.drums(15.4, 15.6);
  b.crate(31.6, -16.4, 1.1);
  b.pallets(33.2, 16.2, 4, "z");

  /* The foredeck: windlasses, a breakwater, bollards. */
  b.block(40.6, -8.5, 2.4, 3.4, 1.4, "metal", SHIP.deckGear);
  b.block(40.6, 8.5, 2.4, 3.4, 1.4, "metal", SHIP.deckGear);
  b.box(36.6, 0, -4.5, 37, 1.1, 4.5, "metal", SHIP.white);
  b.block(42.6, -15, 0.7, 1.6, 0.75, "metal", 0x2c2f33);
  b.block(42.6, 15, 0.7, 1.6, 0.75, "metal", 0x2c2f33);
  b.crate(35.4, 9.6, 1.2);
  b.crate(34.4, 10.5, 1);
  b.drums(38.8, -15.2);
  b.block(33.6, 0.6, 2.4, 1.8, 1.5, "wood", PALETTE.wood);
  b.block(-24.5, -5.4, 2, 2.4, 1.3, "wood", PALETTE.wood);
  // Up on the forecastle (scenery): windlass drums, the foremast.
  b.box(50, SHIP_FORECASTLE_Y, -5.5, 53, SHIP_FORECASTLE_Y + 1.5, -2.5, "metal", SHIP.deckGear, g);
  b.box(50, SHIP_FORECASTLE_Y, 2.5, 53, SHIP_FORECASTLE_Y + 1.5, 5.5, "metal", SHIP.deckGear, g);
  b.box(57.7, SHIP_FORECASTLE_Y, -0.3, 58.3, SHIP_FORECASTLE_Y + 13, 0.3, "metal", SHIP.white, g);
  b.box(57.8, SHIP_FORECASTLE_Y + 9, -2.6, 58.2, SHIP_FORECASTLE_Y + 9.3, 2.6, "metal", SHIP.white, g);

  // The ship's own paintwork is looked after; cargo, gear and drums rust as they please.
  const kept = new Set<number>([SHIP.white, SHIP.offWhite, SHIP.navy, PALETTE.yellow, PALETTE.mustard, 0x55707f, 0x8a8f93, 0x9aa0a6]);
  for (const box of b.boxes) if (box.surface === "metal" && !box.look && kept.has(box.color)) box.look = "clean";

  const aft = -Math.PI / 2; // facing the bow (+x)
  const fwd = Math.PI / 2;
  const spawns: Spawn[] = [
    // The mooring deck (facing forward).
    { x: -47.5, y: 0, z: -16, yaw: aft, side: 0 },
    { x: -43, y: 0, z: -11.5, yaw: aft - 0.3, side: 0 },
    { x: -44, y: 0, z: -1.5, yaw: aft, side: 0 },
    { x: -47.5, y: 0, z: 6, yaw: aft, side: 0 },
    { x: -42.5, y: 0, z: 12.5, yaw: aft + 0.3, side: 0 },
    { x: -48, y: 0, z: 17, yaw: aft, side: 0 },
    // The foredeck (facing aft).
    { x: 42, y: 0, z: 17, yaw: fwd, side: 1 },
    { x: 38.5, y: 0, z: 12.5, yaw: fwd + 0.3, side: 1 },
    { x: 41.5, y: 0, z: 2, yaw: fwd, side: 1 },
    { x: 39, y: 0, z: -3, yaw: fwd, side: 1 },
    { x: 38, y: 0, z: -12, yaw: fwd - 0.3, side: 1 },
    { x: 42.5, y: 0, z: -17, yaw: fwd, side: 1 },
    // Inside the tower, the rails amidships, the crane courts.
    { x: -37.5, y: 0, z: -12, yaw: aft, side: null },
    { x: -29, y: 0, z: 5.5, yaw: aft, side: null },
    { x: -1.5, y: 0, z: 17.5, yaw: Math.PI, side: null },
    { x: 13, y: 0, z: -17.5, yaw: 0, side: null },
    { x: -7, y: 0, z: -15.5, yaw: 0, side: null },
    { x: 17.5, y: 0, z: 15.5, yaw: Math.PI, side: null },
  ];

  const perches: MapDef["perches"] = [
    { x: 4.3, y: CONTAINER_H, z: INNER, link: [[-6.1, 0, INNER]] },
    { x: 24.5, y: CONTAINER_H, z: -INNER, link: [[34.9, 0, -INNER]] },
  ];

  // On the horizon: a burning freighter off the starboard beam, another ship far off the port bow.
  const sb = new Builder();
  const far = (x0: number, z0: number, len: number, beam: number, hull: number, bays: number) => {
    sb.box(x0, SHIP_SEA_Y, z0, x0 + len, -2.5, z0 + beam, "metal", hull, g);
    sb.box(x0 + 4, -2.5, z0 + 2, x0 + 16, 12, z0 + beam - 2, "metal", SHIP.white, g);
    sb.box(x0 + 7, 12, z0 + beam / 2 - 2, x0 + 11, 17, z0 + beam / 2 + 2, "metal", SHIP.navy, g);
    for (let i = 0; i < bays; i++) {
      const x = x0 + 22 + i * 13;
      const levels = 1 + ((i * 7 + 3) % 4);
      for (let l = 0; l < levels; l++) sb.box(x, -2.5 + l * CONTAINER_H, z0 + 1.5, x + 12.2, -2.5 + (l + 1) * CONTAINER_H, z0 + beam - 1.5, "container", colors[(i * 3 + l * 5) % colors.length]!, { ghost: true, ribs: "x" });
    }
  };
  far(-70, 92, 120, 20, SHIP.hullRed, 7);
  far(120, -150, 130, 22, SHIP.navy, 7);

  return {
    id: "ironwake",
    name: "Ironwake",
    blurb: "A giant container ship at sea: cargo bays, crane courts, the tower.",
    setting: "ship",
    bounds: { x0: X0, z0: -Z, x1: X1, z1: Z },
    boxes: b.boxes,
    spawns,
    perches,
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
