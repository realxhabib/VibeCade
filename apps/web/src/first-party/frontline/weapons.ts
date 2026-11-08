/**
 * The armory: twelve original weapons (four primaries and a sidearm for the
 * standard loadout, seven more that only the gun game ladder hands out) and
 * the pure math every client runs the
 * same way. Damage falls off linearly between two ranges and is scaled by
 * the body zone hit; spread and recoil are deterministic functions of a
 * per-life seed and the shot number, so a replay (or a test) of the same
 * trigger pulls lands the same pellets and kicks the same way.
 */

/** The order is the wire format (weapon indices in snapshots, hits and kills): only ever append. */
export const WEAPON_IDS = ["ar", "smg", "sniper", "shotgun", "pistol", "lmg", "burst", "dmr", "autoshot", "mp", "magnum", "knife"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];
export const PRIMARIES: readonly WeaponId[] = ["ar", "smg", "sniper", "shotgun"];

/**
 * Gun game: every kill moves you one weapon down this ladder (a team moves
 * together in team play), and a kill with the last one, the knife, wins.
 * Long guns first, then the close-range ones, then the sidearms.
 */
export const GUN_GAME_LADDER: readonly WeaponId[] = ["ar", "smg", "lmg", "burst", "shotgun", "autoshot", "dmr", "sniper", "mp", "magnum", "pistol", "knife"];

/** Hit zones: head, upper body (chest, arms), lower body (hips, legs). */
export const ZONE_HEAD = 0;
export const ZONE_UPPER = 1;
export const ZONE_LOWER = 2;
export type Zone = 0 | 1 | 2;

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: string;
  /** Damage per bullet (per pellet for the shotgun) up close and at long range. */
  damage: [near: number, far: number];
  /** Full damage up to range[0] m, falling linearly to `far` at range[1] m. */
  range: [number, number];
  /** Beyond this nothing registers (and victims reject the claim). */
  maxRange: number;
  rpm: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reloadS: number;
  drawS: number;
  pellets: number;
  /** Cone half-angle of the pellet pattern (degrees). */
  pelletSpread: number;
  /** Spread (degrees, cone half-angle) from the hip and aimed down sights. */
  hipSpread: number;
  adsSpread: number;
  /** Extra spread at full running speed (degrees). */
  moveSpread: number;
  bloomPerShot: number;
  bloomMax: number;
  /** Bloom recovery (degrees per second). */
  bloomRecover: number;
  /** View kick per shot (degrees). */
  recoilPitch: number;
  recoilYaw: number;
  /** Recoil multiplier while aiming. */
  adsRecoil: number;
  /** Vertical field of view when fully aimed (degrees). */
  adsFov: number;
  adsS: number;
  /** Movement speed multiplier while holding it. */
  mobility: number;
  /** Damage multipliers per zone [head, upper, lower]. */
  zones: [number, number, number];
  /** Scoped sniper: black overlay, no viewmodel when fully aimed. */
  scope: boolean;
  /** Rounds per trigger pull (burst rifle); they cycle at `rpm`, then `burstDelayS` before the next pull. */
  burst?: number;
  burstDelayS?: number;
  /** A blade: no ammo, no muzzle flash or tracer, it only reaches `maxRange`. */
  melee?: boolean;
  /** Big kick (camera shake, view model punch, a thicker smoke puff). */
  heavy?: boolean;
  /** Loadout card bars (0–1). */
  card: { damage: number; range: number; rate: number; mobility: number };
  blurb: string;
}

export const BASE_FOV = 74;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ar: {
    id: "ar",
    name: "Kestrel AR-7",
    kind: "Assault rifle",
    damage: [30, 22],
    range: [20, 45],
    maxRange: 220,
    rpm: 720,
    auto: true,
    mag: 30,
    reserve: 120,
    reloadS: 2.1,
    drawS: 0.5,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 3.2,
    adsSpread: 0.3,
    moveSpread: 2.2,
    bloomPerShot: 0.32,
    bloomMax: 2.6,
    bloomRecover: 7,
    recoilPitch: 0.55,
    recoilYaw: 0.26,
    adsRecoil: 0.62,
    adsFov: 54,
    adsS: 0.22,
    mobility: 0.95,
    zones: [1.5, 1, 0.85],
    scope: false,
    card: { damage: 0.6, range: 0.75, rate: 0.75, mobility: 0.6 },
    blurb: "Four to the chest at any range. The all-rounder.",
  },
  smg: {
    id: "smg",
    name: "Wasp-9",
    kind: "Submachine gun",
    damage: [26, 14],
    range: [8, 24],
    maxRange: 160,
    rpm: 900,
    auto: true,
    mag: 32,
    reserve: 128,
    reloadS: 1.8,
    drawS: 0.4,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 2.3,
    adsSpread: 0.65,
    moveSpread: 1.2,
    bloomPerShot: 0.22,
    bloomMax: 2,
    bloomRecover: 9,
    recoilPitch: 0.42,
    recoilYaw: 0.36,
    adsRecoil: 0.7,
    adsFov: 60,
    adsS: 0.16,
    mobility: 1.06,
    zones: [1.4, 1, 0.9],
    scope: false,
    card: { damage: 0.5, range: 0.35, rate: 0.95, mobility: 0.9 },
    blurb: "Fastest to aim and to run. Shreds up close.",
  },
  sniper: {
    id: "sniper",
    name: "Heron LR",
    kind: "Sniper rifle",
    damage: [110, 100],
    range: [40, 120],
    maxRange: 300,
    rpm: 48,
    auto: false,
    mag: 5,
    reserve: 20,
    reloadS: 3,
    drawS: 0.6,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 7,
    adsSpread: 0,
    moveSpread: 3.5,
    bloomPerShot: 1.2,
    bloomMax: 3,
    bloomRecover: 5,
    recoilPitch: 3.4,
    recoilYaw: 0.5,
    adsRecoil: 0.8,
    adsFov: 17,
    adsS: 0.36,
    mobility: 0.9,
    zones: [1.5, 1, 0.7],
    scope: true,
    heavy: true,
    card: { damage: 1, range: 1, rate: 0.12, mobility: 0.45 },
    blurb: "One shot to the upper body drops anyone. Scope in first.",
  },
  shotgun: {
    id: "shotgun",
    name: "Brute-12",
    kind: "Shotgun",
    damage: [18, 4],
    range: [6, 18],
    maxRange: 40,
    rpm: 70,
    auto: false,
    mag: 6,
    reserve: 24,
    reloadS: 2.8,
    drawS: 0.5,
    pellets: 8,
    pelletSpread: 4.4,
    hipSpread: 0.8,
    adsSpread: 0.4,
    moveSpread: 1,
    bloomPerShot: 0.4,
    bloomMax: 1.2,
    bloomRecover: 4,
    recoilPitch: 3,
    recoilYaw: 0.6,
    adsRecoil: 0.8,
    adsFov: 64,
    adsS: 0.2,
    mobility: 1,
    zones: [1.25, 1, 0.9],
    scope: false,
    heavy: true,
    card: { damage: 0.95, range: 0.15, rate: 0.2, mobility: 0.75 },
    blurb: "Eight pellets. One pump clears a doorway.",
  },
  pistol: {
    id: "pistol",
    name: "Warden P9",
    kind: "Sidearm",
    damage: [34, 20],
    range: [10, 28],
    maxRange: 120,
    rpm: 400,
    auto: false,
    mag: 12,
    reserve: 48,
    reloadS: 1.5,
    drawS: 0.35,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 1.8,
    adsSpread: 0.4,
    moveSpread: 1,
    bloomPerShot: 0.5,
    bloomMax: 2,
    bloomRecover: 8,
    recoilPitch: 1.1,
    recoilYaw: 0.3,
    adsRecoil: 0.7,
    adsFov: 62,
    adsS: 0.14,
    mobility: 1.08,
    zones: [1.5, 1, 0.85],
    scope: false,
    card: { damage: 0.55, range: 0.45, rate: 0.5, mobility: 1 },
    blurb: "Always on your hip. Swapping beats reloading.",
  },
  lmg: {
    id: "lmg",
    name: "Ox-60",
    kind: "Light machine gun",
    damage: [28, 22],
    range: [25, 55],
    maxRange: 220,
    rpm: 650,
    auto: true,
    mag: 60,
    reserve: 120,
    reloadS: 4.2,
    drawS: 0.75,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 4.2,
    adsSpread: 0.45,
    moveSpread: 3,
    bloomPerShot: 0.25,
    bloomMax: 2.4,
    bloomRecover: 6,
    recoilPitch: 0.48,
    recoilYaw: 0.34,
    adsRecoil: 0.55,
    adsFov: 52,
    adsS: 0.34,
    mobility: 0.86,
    zones: [1.4, 1, 0.85],
    scope: false,
    card: { damage: 0.6, range: 0.8, rate: 0.7, mobility: 0.3 },
    blurb: "Sixty rounds before you think about reloading. Slow to aim, slow to run.",
  },
  burst: {
    id: "burst",
    name: "Lark BR-3",
    kind: "Burst rifle",
    damage: [34, 25],
    range: [22, 50],
    maxRange: 220,
    rpm: 950,
    auto: false,
    burst: 3,
    burstDelayS: 0.24,
    mag: 30,
    reserve: 120,
    reloadS: 2.3,
    drawS: 0.5,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 3,
    adsSpread: 0.25,
    moveSpread: 2,
    bloomPerShot: 0.25,
    bloomMax: 2.2,
    bloomRecover: 8,
    recoilPitch: 0.5,
    recoilYaw: 0.18,
    adsRecoil: 0.6,
    adsFov: 52,
    adsS: 0.24,
    mobility: 0.95,
    zones: [1.5, 1, 0.85],
    scope: false,
    card: { damage: 0.7, range: 0.75, rate: 0.6, mobility: 0.6 },
    blurb: "Three rounds a pull. Land the whole burst up close and they drop.",
  },
  dmr: {
    id: "dmr",
    name: "Falcon DMR",
    kind: "Marksman rifle",
    damage: [55, 50],
    range: [30, 80],
    maxRange: 260,
    rpm: 320,
    auto: false,
    mag: 12,
    reserve: 48,
    reloadS: 2.6,
    drawS: 0.55,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 4.5,
    adsSpread: 0.05,
    moveSpread: 2.6,
    bloomPerShot: 0.9,
    bloomMax: 2.6,
    bloomRecover: 6,
    recoilPitch: 1.6,
    recoilYaw: 0.25,
    adsRecoil: 0.65,
    adsFov: 38,
    adsS: 0.28,
    mobility: 0.92,
    zones: [1.7, 1, 0.8],
    scope: false,
    card: { damage: 0.8, range: 0.9, rate: 0.35, mobility: 0.5 },
    blurb: "Two to the chest at any range. Every miss shows.",
  },
  autoshot: {
    id: "autoshot",
    name: "Mauler AS-8",
    kind: "Auto shotgun",
    damage: [12, 3],
    range: [5, 14],
    maxRange: 32,
    rpm: 220,
    auto: true,
    mag: 8,
    reserve: 32,
    reloadS: 3,
    drawS: 0.55,
    pellets: 7,
    pelletSpread: 5.2,
    hipSpread: 1,
    adsSpread: 0.6,
    moveSpread: 1.2,
    bloomPerShot: 0.6,
    bloomMax: 1.6,
    bloomRecover: 4,
    recoilPitch: 2.2,
    recoilYaw: 0.7,
    adsRecoil: 0.8,
    adsFov: 64,
    adsS: 0.22,
    mobility: 0.98,
    zones: [1.25, 1, 0.9],
    scope: false,
    heavy: true,
    card: { damage: 0.8, range: 0.1, rate: 0.45, mobility: 0.7 },
    blurb: "Hold the trigger. Two shells up close is all it takes.",
  },
  mp: {
    id: "mp",
    name: "Hornet MP",
    kind: "Machine pistol",
    damage: [22, 12],
    range: [7, 20],
    maxRange: 120,
    rpm: 1100,
    auto: true,
    mag: 20,
    reserve: 100,
    reloadS: 1.6,
    drawS: 0.3,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 2.6,
    adsSpread: 0.9,
    moveSpread: 1,
    bloomPerShot: 0.25,
    bloomMax: 2.6,
    bloomRecover: 9,
    recoilPitch: 0.5,
    recoilYaw: 0.5,
    adsRecoil: 0.75,
    adsFov: 62,
    adsS: 0.14,
    mobility: 1.08,
    zones: [1.4, 1, 0.9],
    scope: false,
    card: { damage: 0.4, range: 0.3, rate: 1, mobility: 1 },
    blurb: "A pistol that empties in a second. Get close and hold on.",
  },
  magnum: {
    id: "magnum",
    name: "Mule .44",
    kind: "Revolver",
    damage: [62, 40],
    range: [12, 35],
    maxRange: 140,
    rpm: 150,
    auto: false,
    mag: 6,
    reserve: 30,
    reloadS: 2.4,
    drawS: 0.45,
    pellets: 1,
    pelletSpread: 0,
    hipSpread: 2.2,
    adsSpread: 0.2,
    moveSpread: 1.4,
    bloomPerShot: 1.4,
    bloomMax: 3,
    bloomRecover: 5,
    recoilPitch: 4.2,
    recoilYaw: 0.8,
    adsRecoil: 0.7,
    adsFov: 60,
    adsS: 0.18,
    mobility: 1.06,
    zones: [1.7, 1, 0.85],
    scope: false,
    heavy: true,
    card: { damage: 0.85, range: 0.5, rate: 0.2, mobility: 0.95 },
    blurb: "Six heavy rounds. One to the head up close is enough.",
  },
  knife: {
    id: "knife",
    name: "Talon knife",
    kind: "Knife",
    damage: [100, 100],
    range: [1, 2.6],
    maxRange: 2.6,
    rpm: 110,
    auto: true,
    mag: 1,
    reserve: 0,
    reloadS: 0,
    drawS: 0.3,
    pellets: 3,
    pelletSpread: 9,
    hipSpread: 0,
    adsSpread: 0,
    moveSpread: 0,
    bloomPerShot: 0,
    bloomMax: 0,
    bloomRecover: 1,
    // A small nudge of the view with each swing.
    recoilPitch: 0.3,
    recoilYaw: 0.2,
    adsRecoil: 0.8,
    adsFov: BASE_FOV,
    adsS: 0.1,
    mobility: 1.12,
    zones: [1.2, 1, 1],
    scope: false,
    melee: true,
    card: { damage: 1, range: 0, rate: 0.3, mobility: 1 },
    blurb: "One slash drops anyone, if you can get close enough.",
  },
};

export const weaponIndex = (id: WeaponId): number => WEAPON_IDS.indexOf(id);
export const weaponAt = (i: number): WeaponDef | null => {
  const id = WEAPON_IDS[i];
  return id ? WEAPONS[id] : null;
};

/* ---------------------------------------------------------------------- */
/* Perks                                                                  */
/* ---------------------------------------------------------------------- */

export const PERK_IDS = ["quick_hands", "steady_aim", "light_step"] as const;
export type PerkId = (typeof PERK_IDS)[number];

export const PERKS: Record<PerkId, { name: string; blurb: string }> = {
  quick_hands: { name: "Quick Hands", blurb: "Reload and swap 30% faster." },
  steady_aim: { name: "Steady Aim", blurb: "35% tighter hip-fire spread." },
  light_step: { name: "Light Step", blurb: "Move 7% faster, quieter footsteps." },
};

export interface Loadout {
  primary: WeaponId;
  perk: PerkId;
}

export const DEFAULT_LOADOUT: Loadout = { primary: "ar", perk: "quick_hands" };

export function parseLoadout(raw: unknown): Loadout {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Loadout, unknown>>;
  const primary = PRIMARIES.includes(o.primary as WeaponId) ? (o.primary as WeaponId) : DEFAULT_LOADOUT.primary;
  const perk = PERK_IDS.includes(o.perk as PerkId) ? (o.perk as PerkId) : DEFAULT_LOADOUT.perk;
  return { primary, perk };
}

export const encodeLoadout = (l: Loadout): number => PRIMARIES.indexOf(l.primary) * 4 + PERK_IDS.indexOf(l.perk);
export function decodeLoadout(n: number): Loadout {
  return {
    primary: PRIMARIES[Math.floor(n / 4)] ?? DEFAULT_LOADOUT.primary,
    perk: PERK_IDS[n % 4] ?? DEFAULT_LOADOUT.perk,
  };
}

export const reloadTime = (w: WeaponDef, perk: PerkId | null): number => w.reloadS * (perk === "quick_hands" ? 0.7 : 1);
export const drawTime = (w: WeaponDef, perk: PerkId | null): number => w.drawS * (perk === "quick_hands" ? 0.7 : 1);
export const fireInterval = (w: WeaponDef): number => 60 / w.rpm;

/** Index of the ladder rung for a gun game score (`per` kills per weapon), capped at the last rung. */
export function gunGameRung(score: number, per: number): number {
  return Math.max(0, Math.min(GUN_GAME_LADDER.length - 1, Math.floor(Math.max(0, score) / Math.max(1, per))));
}

/* ---------------------------------------------------------------------- */
/* Damage                                                                 */
/* ---------------------------------------------------------------------- */

/** Damage of one bullet/pellet at `dist` m before the zone multiplier. */
export function falloff(w: WeaponDef, dist: number): number {
  const [near, far] = w.damage;
  const [r0, r1] = w.range;
  if (dist <= r0) return near;
  if (dist >= r1) return far;
  return near + ((far - near) * (dist - r0)) / (r1 - r0);
}

/**
 * Total damage of one trigger pull that put `counts[zone]` bullets (pellets)
 * into each zone at `dist` m. Nothing lands past the weapon's max range.
 */
export function hitDamage(w: WeaponDef, dist: number, counts: readonly [number, number, number]): number {
  if (!(dist >= 0) || dist > w.maxRange) return 0;
  const base = falloff(w, dist);
  let total = 0;
  for (let z = 0; z < 3; z++) total += base * w.zones[z]! * Math.max(0, counts[z] ?? 0);
  return Math.round(total);
}

/** How many single-zone hits it takes to drop a full-health player. */
export function shotsToKill(w: WeaponDef, dist: number, zone: Zone, hp = 100): number {
  const counts: [number, number, number] = [0, 0, 0];
  counts[zone] = w.pellets;
  const per = hitDamage(w, dist, counts);
  return per <= 0 ? Infinity : Math.ceil(hp / per);
}

/* ---------------------------------------------------------------------- */
/* Deterministic randomness                                               */
/* ---------------------------------------------------------------------- */

/** 32-bit integer hash of up to four integers → [0, 1). */
export function hash01(a: number, b = 0, c = 0, d = 0): number {
  let h = 0x9e3779b9 ^ Math.imul(a | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) ^ Math.imul(b | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) ^ Math.imul(c | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16), 0x165667b1) ^ Math.imul(d | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A point in the unit disc for (seed, shot, pellet): uniform over the area. */
export function spreadOffset(seed: number, shot: number, pellet: number): [number, number] {
  const r = Math.sqrt(hash01(seed, shot, pellet, 1));
  const a = hash01(seed, shot, pellet, 2) * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export interface SpreadInput {
  /** 0 = hip, 1 = fully aimed. */
  ads: number;
  /** Horizontal speed as a fraction of running speed (0–1+). */
  speed: number;
  airborne: boolean;
  crouched: boolean;
  /** Accumulated firing bloom (degrees). */
  bloom: number;
  steadyAim: boolean;
}

/** Current cone half-angle (degrees) for the center of the shot. */
export function spreadDeg(w: WeaponDef, s: SpreadInput): number {
  const hip = w.hipSpread * (s.steadyAim ? 0.65 : 1);
  const ads = Math.max(0, Math.min(1, s.ads));
  let spread = hip + (w.adsSpread - hip) * ads;
  spread += w.moveSpread * Math.min(1.3, Math.max(0, s.speed)) * (1 - 0.6 * ads);
  if (s.airborne) spread += 3 * (1 - 0.5 * ads);
  if (s.crouched && !s.airborne) spread *= 0.8;
  spread += Math.min(w.bloomMax, Math.max(0, s.bloom)) * (1 - 0.5 * ads);
  return spread;
}

/**
 * The view kick of the `shot`-th bullet of a burst (0-based): mostly up, with
 * a weapon-specific sideways drift so each gun has a learnable pattern.
 */
export function recoilKick(w: WeaponDef, shot: number, ads: number): { pitch: number; yaw: number } {
  const wi = weaponIndex(w.id);
  const n = Math.max(0, shot | 0);
  const jitter = hash01(wi, n, 7) * 2 - 1;
  const side = hash01(wi, n, 11) * 2 - 1;
  // First shots climb straight; later ones drift along the weapon's sway.
  const climb = n < 3 ? 1.15 : 1;
  const drift = Math.sin(n * 0.55 + wi * 1.7) * (n < 3 ? 0.3 : 1);
  const mult = 1 - (1 - w.adsRecoil) * Math.max(0, Math.min(1, ads));
  return {
    pitch: w.recoilPitch * climb * (1 + 0.22 * jitter) * mult,
    yaw: w.recoilYaw * (drift + 0.45 * side) * mult,
  };
}
