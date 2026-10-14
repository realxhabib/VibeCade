/**
 * Render quality tiers. `auto` guesses from the device (GPU string, pixel
 * ratio, memory, touch) and then watches the real frame rate over the first
 * seconds of a match, stepping down if it can't hold ~40 fps. Players can
 * pin a tier in the pause menu (remembered per browser).
 */

import { detectDeviceTier } from "../shared/device-tier";

export type Tier = "high" | "medium" | "low";
export type QualityPref = "auto" | Tier;

export interface TierSettings {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  post: boolean;
  ao: boolean;
  smaa: boolean;
  bloom: boolean;
  /** Particle budget multiplier. */
  vfx: number;
  crowd: boolean;
  beams: boolean;
  anisotropy: boolean;
}

export const TIERS: Record<Tier, TierSettings> = {
  high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, post: true, ao: true, smaa: true, bloom: true, vfx: 1, crowd: true, beams: true, anisotropy: true },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, post: true, ao: false, smaa: false, bloom: true, vfx: 0.7, crowd: true, beams: true, anisotropy: false },
  low: { dpr: [0.75, 1], shadows: true, shadowMapSize: 512, post: false, ao: false, smaa: false, bloom: false, vfx: 0.4, crowd: false, beams: false, anisotropy: false },
};

const KEY = "wedge-wars:quality";

export function loadPref(): QualityPref {
  try {
    const url = new URLSearchParams(window.location.search).get("quality");
    if (url === "high" || url === "medium" || url === "low") return url;
    const v = window.localStorage.getItem(KEY);
    if (v === "high" || v === "medium" || v === "low" || v === "auto") return v;
  } catch {
    // storage blocked
  }
  return "auto";
}

export function savePref(pref: QualityPref): void {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // storage blocked
  }
}

let guessed: Tier | null = null;

/** A first guess from the device (`shared/device-tier`); the match steps down from it if it can't hold the frame rate. */
export function detectTier(): Tier {
  return (guessed ??= detectDeviceTier());
}

export function lower(tier: Tier): Tier {
  return tier === "high" ? "medium" : "low";
}

/**
 * Frame-rate probe: feed it frame deltas; after `windowS` seconds of play it
 * returns a verdict once ("down" when the average is under `minFps`).
 */
export class FpsProbe {
  private elapsed = 0;
  private frames = 0;
  private done = false;
  constructor(
    private readonly windowS = 4,
    private readonly minFps = 40,
    private readonly skipS = 1.5,
  ) {}
  sample(dt: number): "down" | "ok" | null {
    if (this.done) return null;
    this.elapsed += dt;
    if (this.elapsed < this.skipS) return null;
    this.frames++;
    if (this.elapsed < this.skipS + this.windowS) return null;
    this.done = true;
    const fps = this.frames / this.windowS;
    return fps < this.minFps ? "down" : "ok";
  }
}
