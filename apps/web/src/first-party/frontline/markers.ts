/**
 * Who's who at a glance:
 *
 * - A marker over every other player in their own color (each seat has its
 *   own). Teammates' markers carry a white ring and show through walls, so
 *   you always know where your friends are; enemies' only show in sight.
 * - The kill leader wears a floating gold crown that everyone can see, a
 *   faint copy of it even through walls, so the table knows who to hunt.
 *
 * Purely visual. The leader comes from the live kill tally, which every
 * client keeps, so everyone crowns the same player.
 */

import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type BufferGeometry,
  type Camera,
  type Material,
  type Scene,
  type Texture,
} from "three";
import { SEAT_COLORS } from "./avatars";
import type { Game, Soldier } from "./game";
import { lineOfSight } from "./physics";

/** Fewer kills than this and nobody wears the crown yet. */
export const CROWN_MIN_KILLS = 2;

/**
 * The kill leader: the one player with strictly the most kills (at least
 * `CROWN_MIN_KILLS`). On a tie at the top the current holder keeps it; a
 * tie without them leaves the crown off.
 */
export function crownHolder(kills: ReadonlyMap<number, number>, seats: readonly number[], current: number | null): number | null {
  let top = 0;
  for (const s of seats) top = Math.max(top, kills.get(s) ?? 0);
  if (top < CROWN_MIN_KILLS) return null;
  const leaders = seats.filter((s) => (kills.get(s) ?? 0) === top);
  if (leaders.length === 1) return leaders[0]!;
  return current !== null && leaders.includes(current) ? current : null;
}

export function seatColor(seat: number): string {
  return SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length]!;
}

/** A downward chevron in `color`, ringed white for a friend or dark for anyone else. */
function markerTexture(color: string, friend: boolean): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  ctx.moveTo(10, 14);
  ctx.lineTo(54, 14);
  ctx.lineTo(32, 50);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = friend ? 9 : 6;
  ctx.strokeStyle = friend ? "#ffffff" : "rgba(10,12,16,0.85)";
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A small gold crown: a band, five points with gems. */
function crownGroup(geos: BufferGeometry[], solid: Material, gem: Material): Group {
  const g = new Group();
  const band = new CylinderGeometry(0.15, 0.13, 0.09, 20, 1, true);
  geos.push(band);
  g.add(new Mesh(band, solid));
  const spike = new ConeGeometry(0.035, 0.11, 6);
  const jewel = new OctahedronGeometry(0.022);
  geos.push(spike, jewel);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const m = new Mesh(spike, solid);
    m.position.set(Math.cos(a) * 0.14, 0.095, Math.sin(a) * 0.14);
    g.add(m);
    const j = new Mesh(jewel, gem);
    j.position.set(Math.cos(a) * 0.145, 0.02, Math.sin(a) * 0.145);
    g.add(j);
  }
  return g;
}

export class Markers {
  private readonly group = new Group();
  private readonly sprites = new Map<string, Sprite>();
  /** Enemies' markers only show while you can actually see them (checked a few times a second). */
  private readonly seen = new Map<string, boolean>();
  private readonly friends = new Set<string>();
  private seenAt = -1e9;
  private readonly textures: Texture[] = [];
  private readonly materials: Material[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly crown: Group;
  private readonly ghost: Group;
  private holder: number | null = null;
  private checkedAt = -1e9;
  /** Fired when the crown changes hands (null: nobody holds it). */
  onCrown: ((seat: number | null) => void) | null = null;

  constructor(
    scene: Scene,
    private readonly game: Game,
    private readonly reduceMotion: boolean,
  ) {
    scene.add(this.group);
    const me = game.me;
    for (const s of game.soldiers) {
      if (s === me) continue;
      const friend = !!me && game.teams > 0 && !game.isEnemy(me, s);
      const tex = markerTexture(seatColor(s.seat), friend);
      this.textures.push(tex);
      const mat = new SpriteMaterial({ map: tex, depthTest: !friend, depthWrite: false, transparent: true, fog: false });
      this.materials.push(mat);
      const sprite = new Sprite(mat);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = friend ? 20 : 5;
      sprite.visible = false;
      this.group.add(sprite);
      this.sprites.set(s.id, sprite);
      if (friend) this.friends.add(s.id);
    }
    const gold = new MeshStandardMaterial({ color: 0xffc83d, emissive: 0x6b4300, metalness: 0.85, roughness: 0.28 });
    const gem = new MeshStandardMaterial({ color: 0xff3d5a, emissive: 0x5a0010, metalness: 0.2, roughness: 0.2 });
    const ghostMat = new MeshStandardMaterial({ color: 0xffd25a, emissive: 0xffb020, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false });
    this.materials.push(gold, gem, ghostMat);
    this.crown = crownGroup(this.geometries, gold, gem);
    this.ghost = crownGroup(this.geometries, ghostMat, ghostMat);
    this.ghost.traverse((o) => (o.renderOrder = 21));
    this.crown.visible = this.ghost.visible = false;
    this.group.add(this.crown, this.ghost);
  }

  /** The seat wearing the crown right now. */
  get leader(): number | null {
    return this.holder;
  }

  update(now: number, camera: Camera, firstPersonId: string | null): void {
    const g = this.game;
    if (now - this.checkedAt > 250) {
      this.checkedAt = now;
      const next = crownHolder(g.liveTally().kills, g.soldiers.map((s) => s.seat), this.holder);
      if (next !== this.holder) {
        this.holder = next;
        this.onCrown?.(next);
      }
    }
    const cam = camera.position;
    const look = now - this.seenAt > 120;
    if (look) this.seenAt = now;
    let crowned: Soldier | null = null;
    for (const s of g.soldiers) {
      const p = g.posOf(s);
      const head = p.y + (g.crouchOf(s) > 0.5 ? 1.35 : 1.95);
      const sprite = this.sprites.get(s.id);
      let shown = s.alive && s.id !== firstPersonId;
      if (shown && !this.friends.has(s.id)) {
        if (look) this.seen.set(s.id, lineOfSight(g.world, cam, { x: p.x, y: p.y + (g.crouchOf(s) > 0.5 ? 0.8 : 1.2), z: p.z }, 0.2));
        shown = this.seen.get(s.id) ?? false;
      }
      if (sprite) {
        sprite.visible = shown;
        if (shown) {
          const dist = Math.hypot(p.x - cam.x, head - cam.y, p.z - cam.z);
          const k = Math.min(0.75, Math.max(0.2, dist * 0.02));
          sprite.scale.set(k, k, 1);
          sprite.position.set(p.x, head + 0.08, p.z);
        }
      }
      if (s.seat === this.holder && s.alive) crowned = s;
    }
    const wear = !!crowned && crowned.id !== firstPersonId;
    this.crown.visible = this.ghost.visible = wear;
    if (wear && crowned) {
      const p = g.posOf(crowned);
      const head = p.y + (g.crouchOf(crowned) > 0.5 ? 1.35 : 1.95);
      const t = now / 1000;
      const y = head + 0.42 + (this.reduceMotion ? 0 : Math.sin(t * 2.4) * 0.05);
      const spin = this.reduceMotion ? 0 : t * 1.6;
      for (const c of [this.crown, this.ghost]) {
        c.position.set(p.x, y, p.z);
        c.rotation.y = spin;
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.textures.forEach((t) => t.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries.forEach((g) => g.dispose());
  }
}
