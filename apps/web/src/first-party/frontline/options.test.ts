import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, NO_LIMIT, docOverrides, limitLabel, optionsSummary, parseOptions, resolveSeason, seasonOf, toSettings } from "./options";
import { FFA_LIMIT, MATCH_MS, limitReached, newDoc, applyKill, type KillRec } from "./rules";

describe("match options", () => {
  it("falls back to the defaults", () => {
    expect(parseOptions(undefined)).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions({})).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions({ min: "ten", kills: null, season: "monsoon" })).toEqual(DEFAULT_OPTIONS);
    const doc = newDoc(0, 0, 4, docOverrides(DEFAULT_OPTIONS));
    expect(doc.dur).toBe(MATCH_MS);
    expect(doc.lim).toBe(FFA_LIMIT);
  });

  it("reads and clamps the host's choices", () => {
    expect(parseOptions({ min: 10, kills: 30, season: "winter" })).toEqual({ minutes: 10, kills: 30, season: "winter" });
    expect(parseOptions({ min: 500, kills: 1 })).toMatchObject({ minutes: 30, kills: 5 });
    expect(parseOptions({ kills: 0 }).kills).toBe(0);
  });

  it("round-trips through the settings blob", () => {
    const o = { minutes: 15, kills: 0, season: "autumn" as const };
    expect(parseOptions(toSettings(o))).toEqual(o);
    expect(toSettings(DEFAULT_OPTIONS)).toEqual({});
    expect(toSettings({ ...DEFAULT_OPTIONS, minutes: 7 })).toEqual({});
  });

  it("sets the match document's clock and limit", () => {
    const doc = newDoc(1000, 2, 4, docOverrides(parseOptions({ min: 3, kills: 10 })));
    expect(doc.dur).toBe(3 * 60_000);
    expect(doc.lim).toBe(10);
  });

  it("no kill limit leaves the clock to end the match", () => {
    let doc = newDoc(0, 0, 2, docOverrides(parseOptions({ kills: 0 })));
    expect(doc.lim).toBe(NO_LIMIT);
    for (let life = 0; life < 60; life++) doc = applyKill(doc, [1, life, 0, 0, 0, 10] as KillRec, 1)!;
    expect(limitReached(doc)).toBe(false);
    expect(doc.end).toBeNull();
    expect(limitLabel(doc.lim, false)).toBe("no kill limit");
  });

  it("summarizes for the challenge card", () => {
    expect(optionsSummary(DEFAULT_OPTIONS)).toBe("7 min");
    expect(optionsSummary({ minutes: 10, kills: 30, season: "winter" })).toBe("10 min · first to 30 · ❄️ Winter");
  });

  it("follows the calendar when the host leaves the season on auto", () => {
    expect(seasonOf(new Date(Date.UTC(2026, 11, 20)))).toBe("winter");
    expect(seasonOf(new Date(Date.UTC(2026, 1, 1)))).toBe("winter");
    expect(seasonOf(new Date(Date.UTC(2026, 3, 1)))).toBe("spring");
    expect(seasonOf(new Date(Date.UTC(2026, 6, 1)))).toBe("summer");
    expect(seasonOf(new Date(Date.UTC(2026, 10, 2)))).toBe("autumn");
    expect(resolveSeason("spring", new Date(Date.UTC(2026, 10, 2)))).toBe("spring");
  });
});
