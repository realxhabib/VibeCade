import { describe, expect, it } from "vitest";
import { SMALL_AREA, guessTier } from "./device-tier";

const full = 1440 * 900;
const at = (renderer: string, extra: Partial<Parameters<typeof guessTier>[0]> = {}) => guessTier({ renderer, touch: false, cores: 8, area: full, ...extra });

describe("guessTier", () => {
  it("keeps software rendering low, wherever it runs", () => {
    expect(at("google swiftshader")).toBe("low");
    expect(at("google swiftshader", { area: SMALL_AREA })).toBe("low");
  });

  it("gives recent phones medium (Safari reports every iPhone as Apple GPU) and older ones low", () => {
    expect(at("apple gpu", { touch: true, cores: 4 })).toBe("medium");
    expect(at("adreno (tm) 740", { touch: true })).toBe("medium");
    expect(at("mali-g78", { touch: true })).toBe("medium");
    expect(at("adreno (tm) 610", { touch: true })).toBe("low");
    expect(at("mali-g52", { touch: true })).toBe("low");
  });

  it("steps computers up a tier in a small frame like the X post's card", () => {
    expect(at("angle (intel, intel(r) uhd graphics 620 direct3d11)", { cores: 4 })).toBe("low");
    expect(at("angle (intel, intel(r) uhd graphics 620 direct3d11)", { cores: 4, area: 480 * 400 })).toBe("medium");
    expect(at("angle (intel, intel(r) iris(r) xe graphics)", { area: 480 * 400 })).toBe("high");
    expect(at("angle (nvidia, nvidia geforce rtx 3060)")).toBe("high");
    // Phones are full screen already: no step up.
    expect(at("adreno (tm) 610", { touch: true, area: 390 * 400 })).toBe("low");
  });
});
