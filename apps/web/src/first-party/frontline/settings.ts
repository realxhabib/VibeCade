/**
 * Player settings (mouse and touch look speed, invert, aim assist, quality) and the
 * last loadout, saved with the SDK's per-player storage so they follow the
 * player across devices, mirrored in localStorage so the first frame
 * already uses them.
 */

import type { VibeCadeClient } from "vibecade-sdk";
import type { QualityPref } from "./quality";
import { DEFAULT_LOADOUT, parseLoadout, type Loadout } from "./weapons";

export interface Settings {
  /** Mouse: radians per pixel × 1000. */
  sensitivity: number;
  /** Look speed on phones and tablets (the same kind of number, on the touch scale). */
  touchSensitivity: number;
  invert: boolean;
  aimAssist: boolean;
  quality: QualityPref;
  loadout: Loadout;
}

/** Look speed limits (both sliders). */
export const MIN_SENSITIVITY = 0.3;
export const MAX_SENSITIVITY = 8;

/** Phones turn faster out of the box: a thumb drag is short, and 2.2 felt sluggish. */
export const DEFAULT_SETTINGS: Settings = { sensitivity: 2.2, touchSensitivity: 3.6, invert: false, aimAssist: true, quality: "auto", loadout: DEFAULT_LOADOUT };

const KEY = "settings";
const LOCAL = "frontline:settings";

export function parseSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const sens = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, v)) : fallback);
  const quality = o.quality === "high" || o.quality === "medium" || o.quality === "low" || o.quality === "auto" ? o.quality : "auto";
  return {
    sensitivity: sens(o.sensitivity, DEFAULT_SETTINGS.sensitivity),
    touchSensitivity: sens(o.touchSensitivity, DEFAULT_SETTINGS.touchSensitivity),
    invert: o.invert === true,
    aimAssist: o.aimAssist !== false,
    quality,
    loadout: parseLoadout(o.loadout),
  };
}

export function loadLocal(): Settings {
  try {
    const url = new URLSearchParams(window.location.search).get("quality");
    const raw = window.localStorage.getItem(LOCAL);
    const s = parseSettings(raw ? JSON.parse(raw) : null);
    if (url === "high" || url === "medium" || url === "low") s.quality = url;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Reads the synced copy (it wins over the local one when it exists). */
export async function loadRemote(xapps: VibeCadeClient): Promise<Settings | null> {
  try {
    const raw = await xapps.storage.get(KEY);
    return raw ? parseSettings(raw) : null;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Saves locally now and to SDK storage shortly after (debounced; spectators can't write). */
export function saveSettings(xapps: VibeCadeClient, s: Settings): void {
  try {
    window.localStorage.setItem(LOCAL, JSON.stringify(s));
  } catch {
    // storage blocked
  }
  if (xapps.isSpectator || xapps.purpose === "setup") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    xapps.storage.set(KEY, { ...s, loadout: { ...s.loadout } }).catch((error: unknown) => console.warn("[frontline] saving settings failed", error));
  }, 600);
}
