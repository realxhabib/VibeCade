import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("gives phones a faster look speed than the mouse by default", () => {
    const s = parseSettings(null);
    expect(s.touchSensitivity).toBe(DEFAULT_SETTINGS.touchSensitivity);
    expect(s.touchSensitivity).toBeGreaterThan(s.sensitivity);
  });

  it("keeps saved settings from before the touch look speed existed", () => {
    const s = parseSettings({ sensitivity: 4, invert: true });
    expect(s.sensitivity).toBe(4);
    expect(s.touchSensitivity).toBe(DEFAULT_SETTINGS.touchSensitivity);
    expect(s.invert).toBe(true);
  });

  it("clamps both look speeds", () => {
    const s = parseSettings({ sensitivity: 100, touchSensitivity: -1 });
    expect(s.sensitivity).toBe(8);
    expect(s.touchSensitivity).toBe(0.3);
  });
});
