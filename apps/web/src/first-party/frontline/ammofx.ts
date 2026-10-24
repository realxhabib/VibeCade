/**
 * Ammo drops on screen: a small ammo can, slowly spinning and bobbing, with a
 * glowing ring on the ground, where each of your kills fell. Only your own
 * drops show (only you can take them); they blink out over their last seconds.
 */

import { AdditiveBlending, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, type Scene } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Game } from "./game";

const POOL = 6;
const FADE_MS = 4000;

export class AmmoFx {
  private readonly group = new Group();
  private readonly items: { box: Mesh; ring: Mesh }[] = [];
  private readonly boxMat = new MeshStandardMaterial({ color: 0x4b5a2a, roughness: 0.6, metalness: 0.3, emissive: new Color(0x2a2300) });
  private readonly ringMat = new MeshBasicMaterial({ color: new Color(1.8, 1.4, 0.4), transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false });

  constructor(scene: Scene) {
    const can = new BoxGeometry(0.34, 0.2, 0.18);
    const lid = new BoxGeometry(0.36, 0.035, 0.2).translate(0, 0.115, 0);
    const handle = new BoxGeometry(0.16, 0.03, 0.03).translate(0, 0.15, 0);
    const stripe = new BoxGeometry(0.345, 0.04, 0.185).translate(0, -0.02, 0);
    const geo = mergeGeometries([can, lid, handle, stripe].map((g) => g.toNonIndexed()))!;
    [can, lid, handle, stripe].forEach((g) => g.dispose());
    const ringGeo = new RingGeometry(0.42, 0.55, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const box = new Mesh(geo, this.boxMat);
      box.castShadow = true;
      const ring = new Mesh(ringGeo, this.ringMat);
      ring.renderOrder = 5;
      box.visible = ring.visible = false;
      this.items.push({ box, ring });
      this.group.add(box, ring);
    }
    scene.add(this.group);
  }

  update(game: Game, now: number, showFor: number | null): void {
    const mine = showFor === null ? [] : game.drops.filter((d) => d.owner === showFor);
    this.items.forEach(({ box, ring }, i) => {
      const d = mine[mine.length - 1 - i];
      // Blinks over its last seconds.
      const left = d ? d.until - now : 0;
      const on = !!d && (left > FADE_MS || Math.floor(now / 160) % 2 === 0);
      box.visible = ring.visible = on;
      if (!d || !on) return;
      const t = (now - d.at) / 1000;
      box.position.set(d.x, d.y + 0.32 + Math.sin(t * 2.6) * 0.05, d.z);
      box.rotation.set(0, t * 1.4, 0);
      ring.position.set(d.x, d.y + 0.03, d.z);
      ring.scale.setScalar(1 + Math.sin(t * 3.2) * 0.06);
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    this.items[0]?.box.geometry.dispose();
    this.items[0]?.ring.geometry.dispose();
    this.boxMat.dispose();
    this.ringMat.dispose();
  }
}
