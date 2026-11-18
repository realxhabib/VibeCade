/**
 * Grenades on screen: a small frag model for every grenade in flight
 * (following the shared simulated path, tumbling), bounce clinks, and the
 * throw preview while the grenade button is held — a dotted arc and a ring
 * where it will come to rest.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  LatheGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Game, LiveNade } from "./game";
import type { NadeFlight } from "./grenade";
import type { Vec3 } from "./physics";
import type { Season } from "./options";
import { throwableGeometry } from "./throwables";

const ARC_POINTS = 48;
const _d = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Color();

/** Paints a geometry one color (a `color` attribute for vertex-colored materials). */
function tint(g: BufferGeometry, hex: number): BufferGeometry {
  _c.setHex(hex);
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute("color", new BufferAttribute(col, 3));
  return g;
}

export class NadeFx {
  private readonly bodyGeo: BufferGeometry;
  private readonly bodyMat: MeshStandardMaterial;
  private readonly meshes: Mesh[] = [];
  /** Rockets in flight: warhead, motor, fins, and the motor's flame (a hot core inside a longer flicker). */
  private readonly rocketGeo: BufferGeometry;
  private readonly rocketMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
  private readonly flameGeo = new SphereGeometry(0.05, 8, 6).scale(1, 1, 3).translate(0, 0, -0.12);
  private readonly flameMat = new MeshBasicMaterial({ color: new Color(4, 3, 1.8), transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  private readonly plumeGeo = new ConeGeometry(0.07, 0.55, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.3);
  private readonly plumeMat = new MeshBasicMaterial({ color: new Color(2.6, 1.2, 0.35), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  private readonly rockets: Mesh[] = [];
  private readonly arc: Points;
  private readonly arcGeo = new BufferGeometry();
  private readonly arcPos = new Float32Array(ARC_POINTS * 3);
  private readonly ring: Mesh;
  private readonly group = new Group();
  private readonly clinked = new Map<LiveNade, number>();

  /** `season`: the grenade dresses up (snowball, turkey, egg, firecracker; see throwables.ts). */
  constructor(scene: Scene, season?: Season) {
    if (season) {
      // Bigger than a frag so it reads at a glance (it is a turkey, after all).
      this.bodyGeo = throwableGeometry(season, 1.7);
      this.bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: season === "winter" ? 0.8 : 0.5, metalness: 0.05 });
    } else {
      const body = new SphereGeometry(0.045, 10, 8).scale(1, 1.2, 1);
      const top = new CylinderGeometry(0.016, 0.02, 0.03, 8).translate(0, 0.06, 0);
      const spoon = new CylinderGeometry(0.006, 0.006, 0.08, 4).translate(0.03, 0.03, 0).rotateZ(0.3);
      this.bodyGeo = mergeGeometries([body.toNonIndexed(), top.toNonIndexed(), spoon.toNonIndexed()])!;
      [body, top, spoon].forEach((g) => g.dispose());
      this.bodyMat = new MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.55, metalness: 0.35 });
    }
    // Built along +z (lookAt points +z at the target), about a metre long: the fat olive warhead
    // (fuze tip, ogive, widest band, tail cone), the slim motor, four fins and the nozzle.
    const parts: BufferGeometry[] = [];
    const turned = (pts: [number, number][], color: number) => {
      const g = new LatheGeometry(pts.map(([r, z]) => new Vector2(r, -z)), 14).rotateX(-Math.PI / 2).toNonIndexed();
      parts.push(tint(g, color));
    };
    turned([[0, 0.5], [0.006, 0.5], [0.007, 0.45]], 0x6d6f69);
    turned([[0.007, 0.45], [0.02, 0.41], [0.034, 0.34], [0.043, 0.27], [0.044, 0.24]], 0x4b5236);
    turned([[0.044, 0.24], [0.0445, 0.22]], 0x22241f);
    turned([[0.0445, 0.22], [0.042, 0.17], [0.022, 0.1], [0.018, 0.08]], 0x4b5236);
    turned([[0.018, 0.08], [0.018, -0.36], [0.022, -0.4], [0.03, -0.45], [0, -0.45]], 0x3a3d38);
    for (let k = 0; k < 4; k++) parts.push(tint(new BoxGeometry(0.004, 0.06, 0.12).translate(0, 0.048, -0.36).rotateZ((k * Math.PI) / 2 + Math.PI / 4).toNonIndexed(), 0x2f312c));
    this.rocketGeo = mergeGeometries(parts)!;
    parts.forEach((g) => g.dispose());
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(this.rocketGeo, this.rocketMat);
      const flame = new Mesh(this.flameGeo, this.flameMat);
      const plume = new Mesh(this.plumeGeo, this.plumeMat);
      flame.position.z = -0.45;
      plume.position.z = -0.45;
      flame.renderOrder = 6;
      plume.renderOrder = 6;
      m.add(flame, plume);
      m.visible = false;
      this.rockets.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < 8; i++) {
      const m = new Mesh(this.bodyGeo, this.bodyMat);
      m.visible = false;
      m.castShadow = true;
      this.meshes.push(m);
      this.group.add(m);
    }
    const pa = new BufferAttribute(this.arcPos, 3);
    pa.setUsage(DynamicDrawUsage);
    this.arcGeo.setAttribute("position", pa);
    this.arc = new Points(this.arcGeo, new PointsMaterial({ color: new Color(1.6, 1.4, 1.0), size: 5, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.renderOrder = 6;
    this.ring = new Mesh(new RingGeometry(0.55, 0.7, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: new Color(1.6, 0.5, 0.35), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    this.group.add(this.arc, this.ring);
    scene.add(this.group);
  }

  /**
   * `rocket` hears where each rocket's nozzle is this frame (and which way it
   * flies), once its motor has lit, for the flame's glow and the smoke trail.
   */
  update(game: Game, now: number, preview: NadeFlight | null, clink: (x: number, z: number) => void, rocket?: (n: LiveNade, nozzle: Vec3, dir: Vec3) => void): void {
    const live = game.nades.filter((n) => !n.rocket);
    const rockets = game.nades.filter((n) => n.rocket && now >= n.releasedAt);
    this.rockets.forEach((m, i) => {
      const n = rockets[i];
      m.visible = !!n;
      if (!n) return;
      const p = game.nadePos(n, now);
      const o = n.flight.path[0] ?? p;
      const e = n.flight.end;
      _d.set(e.x - o.x, e.y - o.y, e.z - o.z);
      if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
      _d.normalize();
      // It spins and corkscrews a little in flight (a few centimetres, for the eye only).
      const t = (now - n.releasedAt) / 1000;
      _a.set(-_d.z, 0, _d.x);
      if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
      _a.normalize();
      _b.crossVectors(_d, _a);
      const wob = 0.045 * Math.min(1, t * 5);
      const ang = t * Math.PI * 2 * 5;
      const ox = (_a.x * Math.cos(ang) + _b.x * Math.sin(ang)) * wob;
      const oy = (_a.y * Math.cos(ang) + _b.y * Math.sin(ang)) * wob;
      const oz = (_a.z * Math.cos(ang) + _b.z * Math.sin(ang)) * wob;
      m.position.set(p.x + ox, p.y + oy, p.z + oz);
      m.lookAt(m.position.x + _d.x, m.position.y + _d.y, m.position.z + _d.z);
      m.rotateZ(ang * 0.5);
      // The motor lights a beat after it leaves the tube; then the flame flickers.
      const lit = t > 0.05;
      const flame = m.children[0]!;
      const plume = m.children[1]!;
      flame.visible = lit;
      plume.visible = lit;
      if (lit) {
        const f = 0.8 + Math.random() * 0.45;
        flame.scale.set(f, f, 0.8 + Math.random() * 0.5);
        plume.scale.set(0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4, 0.7 + Math.random() * 0.8);
        rocket?.(n, { x: m.position.x - _d.x * 0.47, y: m.position.y - _d.y * 0.47, z: m.position.z - _d.z * 0.47 }, { x: _d.x, y: _d.y, z: _d.z });
      }
    });
    this.meshes.forEach((m, i) => {
      const n = live[i];
      m.visible = !!n;
      if (!n) return;
      const p = game.nadePos(n, now);
      m.position.set(p.x, p.y, p.z);
      const t = (now - n.releasedAt) / 1000;
      const moving = n.flight.path.length > 1 ? Math.max(0, 1 - t / 1.4) : 0;
      m.rotation.set(t * 11 * moving, t * 3, t * 7 * moving);
      // Clinks as it hits things.
      const done = this.clinked.get(n) ?? 0;
      const due = n.flight.bounces.filter((b) => b <= now - n.releasedAt).length;
      if (due > done) {
        clink(p.x, p.z);
        this.clinked.set(n, due);
      }
    });
    for (const n of this.clinked.keys()) if (!game.nades.includes(n)) this.clinked.delete(n);
    if (preview) {
      const path = preview.path;
      for (let i = 0; i < ARC_POINTS; i++) {
        const p = path[Math.min(path.length - 1, Math.floor((i / (ARC_POINTS - 1)) * (path.length - 1)))]!;
        this.arcPos[i * 3] = p.x;
        this.arcPos[i * 3 + 1] = p.y;
        this.arcPos[i * 3 + 2] = p.z;
      }
      this.arcGeo.attributes.position!.needsUpdate = true;
      this.arc.visible = true;
      const end = preview.end;
      this.ring.position.set(end.x, end.y + 0.03, end.z);
      this.ring.visible = true;
    } else {
      this.arc.visible = false;
      this.ring.visible = false;
    }
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.bodyMat.dispose();
    this.rocketGeo.dispose();
    this.rocketMat.dispose();
    this.flameGeo.dispose();
    this.flameMat.dispose();
    this.plumeGeo.dispose();
    this.plumeMat.dispose();
    this.arcGeo.dispose();
    (this.arc.material as PointsMaterial).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    this.group.removeFromParent();
  }
}
