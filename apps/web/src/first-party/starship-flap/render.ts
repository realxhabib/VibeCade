/**
 * Canvas drawing for Starship Flap (no React). The world is WORLD_H units
 * tall; the view scales it to the canvas height and shows as much course as
 * the width allows.
 */
import { GATE_WIDTH, SHIP_RADIUS, WORLD_H, type Gate } from "./logic";

export interface ShipSprite {
  /** World x of the ship's centre. */
  x: number;
  y: number;
  vy: number;
  /** Seconds since the engines last fired. */
  sinceThrust: number;
  crashed: boolean;
  /** 1 for your ship, lower for ghosts. */
  alpha: number;
  label?: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
}

export interface Scene {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** Real seconds (twinkles, blinking lights). */
  time: number;
  /** World x of the view's left edge. */
  camera: number;
  course: readonly Gate[];
  ships: ShipSprite[];
  particles: Particle[];
  /** Screen shake strength (0 = none). */
  shake: number;
  reduced: boolean;
}

/** The ship's nose angle (radians): up when climbing, down when falling. */
export function shipAngle(vy: number): number {
  return Math.max(-0.55, Math.min(0.85, vy / 820));
}

/** A burst of fire and debris where a ship blew up. */
export function explode(particles: Particle[], x: number, y: number, rand: () => number = Math.random): void {
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const v = 60 + rand() * 340;
    const max = 0.5 + rand() * 0.9;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: max, max, size: 2 + rand() * 5, hue: 15 + rand() * 35 });
  }
}

export function updateParticles(particles: Particle[], dt: number): void {
  for (const p of particles) {
    p.life -= dt;
    p.vy += 500 * dt;
    p.vx *= 1 - 1.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i]!.life <= 0) particles.splice(i, 1);
}

/** Deterministic star field (same sky every match). */
const STARS = (() => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 140 }, () => ({ x: r(), y: r() * 0.92, z: 0.15 + r() * 0.85, tw: r() * 6 }));
})();

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { width: w, height: h } = scene;
  const k = h / WORLD_H;
  const viewW = w / k;

  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#04040c");
  sky.addColorStop(0.65, "#0b0920");
  sky.addColorStop(1, "#2a1230");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  if (scene.shake > 0 && !scene.reduced) ctx.translate((Math.random() - 0.5) * scene.shake, (Math.random() - 0.5) * scene.shake);

  // Stars drift with parallax.
  for (const star of STARS) {
    const span = w + 40;
    const sx = (((star.x * span - scene.camera * k * star.z * 0.08) % span) + span) % span - 20;
    const tw = scene.reduced ? 1 : 0.6 + 0.4 * Math.sin(scene.time * 2 + star.tw);
    ctx.globalAlpha = (0.25 + star.z * 0.6) * tw;
    ctx.fillStyle = "#fff";
    const size = star.z > 0.8 ? 1.8 : 1.1;
    ctx.fillRect(sx, star.y * h, size, size);
  }
  ctx.globalAlpha = 1;

  // Mars, far away.
  const marsX = w * 0.78 - ((scene.camera * k * 0.02) % (w * 1.6));
  const mx = marsX < -80 ? marsX + w * 1.6 : marsX;
  const mr = Math.min(w, h) * 0.12;
  const mars = ctx.createRadialGradient(mx - mr * 0.35, h * 0.2 - mr * 0.35, mr * 0.1, mx, h * 0.2, mr);
  mars.addColorStop(0, "#ffb27a");
  mars.addColorStop(0.6, "#d4552c");
  mars.addColorStop(1, "#5a1a12");
  ctx.fillStyle = mars;
  ctx.beginPath();
  ctx.arc(mx, h * 0.2, mr, 0, Math.PI * 2);
  ctx.fill();

  // Ground: the ocean off the launch site, with a glowing horizon.
  const ground = WORLD_H * k;
  const horizon = ctx.createLinearGradient(0, ground - 30 * k, 0, h);
  horizon.addColorStop(0, "rgba(255,110,60,0)");
  horizon.addColorStop(1, "rgba(255,110,60,0.25)");
  ctx.fillStyle = horizon;
  ctx.fillRect(0, ground - 30 * k, w, 30 * k);

  ctx.scale(k, k);
  const cam = scene.camera;

  for (const gate of scene.course) {
    const gx = gate.x - cam;
    if (gx > viewW + 10) break;
    if (gx + GATE_WIDTH < -10) continue;
    drawTower(ctx, gx, gate, scene.time, scene.reduced);
  }

  for (const ship of scene.ships) if (!ship.crashed) drawShip(ctx, ship.x - cam, ship.y, ship);

  for (const p of scene.particles) {
    const t = p.life / p.max;
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = `hsl(${p.hue + (1 - t) * 10}, 100%, ${45 + t * 30}%)`;
    ctx.beginPath();
    ctx.arc(p.x - cam, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** One gate: a lattice launch tower above and below the gap, with "chopstick" arms at the gap. */
function drawTower(ctx: CanvasRenderingContext2D, x: number, gate: Gate, time: number, reduced: boolean): void {
  const top = gate.gapY - gate.gapH / 2;
  const bottom = gate.gapY + gate.gapH / 2;
  for (const [y0, y1] of [
    [-20, top],
    [bottom, WORLD_H + 20],
  ] as const) {
    const body = ctx.createLinearGradient(x, 0, x + GATE_WIDTH, 0);
    body.addColorStop(0, "#2b3040");
    body.addColorStop(0.45, "#5d6478");
    body.addColorStop(1, "#1d212d");
    ctx.fillStyle = body;
    ctx.fillRect(x, y0, GATE_WIDTH, y1 - y0);
    // Lattice bracing.
    ctx.strokeStyle = "rgba(10,12,20,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const bay = 34;
    for (let y = Math.floor(y0 / bay) * bay; y < y1; y += bay) {
      ctx.moveTo(x + 4, Math.max(y0, y));
      ctx.lineTo(x + GATE_WIDTH - 4, Math.min(y1, y + bay));
      ctx.moveTo(x + GATE_WIDTH - 4, Math.max(y0, y));
      ctx.lineTo(x + 4, Math.min(y1, y + bay));
      ctx.moveTo(x, y);
      ctx.lineTo(x + GATE_WIDTH, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(x + 0.5, y0, GATE_WIDTH - 1, y1 - y0);
  }
  // Chopstick arms reaching into the gap.
  ctx.fillStyle = "#8a92a8";
  ctx.fillRect(x - 10, top - 12, GATE_WIDTH + 20, 12);
  ctx.fillRect(x - 10, bottom, GATE_WIDTH + 20, 12);
  // Blinking warning lights.
  const on = reduced || Math.sin(time * 5 + gate.x * 0.01) > 0;
  ctx.fillStyle = on ? "#ff3d4f" : "#5a1820";
  for (const ly of [top - 6, bottom + 6]) {
    ctx.beginPath();
    ctx.arc(x - 6, ly, 3, 0, Math.PI * 2);
    ctx.arc(x + GATE_WIDTH + 6, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (on) {
    ctx.fillStyle = "rgba(255,61,79,0.18)";
    for (const ly of [top - 6, bottom + 6]) {
      ctx.beginPath();
      ctx.arc(x - 6, ly, 9, 0, Math.PI * 2);
      ctx.arc(x + GATE_WIDTH + 6, ly, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Starship, nose to the right: steel hull, dark heat shield, flaps, and the engine plume when thrusting. */
function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, ship: ShipSprite): void {
  const L = 62;
  const R = 9.5;
  ctx.save();
  ctx.globalAlpha = ship.alpha;
  ctx.translate(x, y);
  ctx.rotate(shipAngle(ship.vy));

  // Plume: big right after a thrust, a flicker otherwise.
  const burn = Math.max(0, 1 - ship.sinceThrust / 0.35);
  const plume = 10 + burn * 38 + Math.random() * 4;
  const flame = ctx.createLinearGradient(-L / 2, 0, -L / 2 - plume, 0);
  flame.addColorStop(0, "rgba(255,255,230,0.95)");
  flame.addColorStop(0.3, "rgba(255,170,60,0.85)");
  flame.addColorStop(1, "rgba(255,70,30,0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-L / 2 + 2, -R * 0.75);
  ctx.quadraticCurveTo(-L / 2 - plume * 0.6, -R * (0.9 + burn * 0.4), -L / 2 - plume, 0);
  ctx.quadraticCurveTo(-L / 2 - plume * 0.6, R * (0.9 + burn * 0.4), -L / 2 + 2, R * 0.75);
  ctx.fill();

  // Aft flaps.
  ctx.fillStyle = "#2c2f38";
  ctx.beginPath();
  ctx.moveTo(-L / 2 + 4, -R);
  ctx.lineTo(-L / 2 - 4, -R - 9);
  ctx.lineTo(-L / 2 + 16, -R - 9);
  ctx.lineTo(-L / 2 + 20, -R);
  ctx.moveTo(-L / 2 + 4, R);
  ctx.lineTo(-L / 2 - 4, R + 9);
  ctx.lineTo(-L / 2 + 16, R + 9);
  ctx.lineTo(-L / 2 + 20, R);
  ctx.fill();

  // Steel hull with a rounded nose.
  const hull = ctx.createLinearGradient(0, -R, 0, R);
  hull.addColorStop(0, "#f4f6fa");
  hull.addColorStop(0.45, "#b9c0cc");
  hull.addColorStop(1, "#7d8594");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-L / 2, -R);
  ctx.lineTo(L / 2 - 14, -R);
  ctx.quadraticCurveTo(L / 2 + 4, -R * 0.6, L / 2 + 6, 0);
  ctx.quadraticCurveTo(L / 2 + 4, R * 0.6, L / 2 - 14, R);
  ctx.lineTo(-L / 2, R);
  ctx.closePath();
  ctx.fill();
  // Heat shield (belly).
  ctx.fillStyle = "#1a1c22";
  ctx.beginPath();
  ctx.moveTo(-L / 2, R * 0.35);
  ctx.lineTo(L / 2 - 14, R * 0.35);
  ctx.quadraticCurveTo(L / 2 + 2, R * 0.3, L / 2 + 5, R * 0.15);
  ctx.quadraticCurveTo(L / 2 + 4, R * 0.6, L / 2 - 14, R);
  ctx.lineTo(-L / 2, R);
  ctx.closePath();
  ctx.fill();
  // Forward flaps.
  ctx.fillStyle = "#2c2f38";
  ctx.beginPath();
  ctx.moveTo(L / 2 - 20, -R);
  ctx.lineTo(L / 2 - 26, -R - 6);
  ctx.lineTo(L / 2 - 14, -R - 5);
  ctx.lineTo(L / 2 - 10, -R + 1);
  ctx.fill();
  // Ring seams.
  ctx.strokeStyle = "rgba(60,66,80,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let sx = -L / 2 + 10; sx < L / 2 - 14; sx += 10) {
    ctx.moveTo(sx, -R);
    ctx.lineTo(sx, R * 0.35);
  }
  ctx.stroke();
  ctx.restore();

  if (ship.label) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, ship.alpha + 0.2);
    ctx.fillStyle = "#e1e5ee";
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ship.label, x, y - SHIP_RADIUS - 18);
    ctx.restore();
  }
}
