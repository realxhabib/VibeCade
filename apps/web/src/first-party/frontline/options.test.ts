import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, NO_LIMIT, killChoices, optionsFrom, docOverrides, limitLabel, optionsSummary, parseOptions, resolveSeason, seasonOf, toSettings } from "./options";
import { FFA_LIMIT, MATCH_MS, gunGameWeapon, limitReached, newDoc, applyKill, parseDoc, type KillRec } from "./rules";
import { GUN_GAME_LADDER, weaponIndex } from "./weapons";

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
    expect(parseOptions({ min: 10, kills: 30, season: "winter" })).toEqual({ minutes: 10, kills: 30, season: "winter", mode: "standard", map: "saltyard" });
    expect(parseOptions({ min: 500, kills: 900 })).toMatchObject({ minutes: 30, kills: 200 });
    expect(parseOptions({ min: 0.2, kills: -4 })).toMatchObject({ minutes: 1, kills: 1 });
    expect(parseOptions({ kills: 0 }).kills).toBe(0);
  });

  it("round-trips through the settings blob", () => {
    const o = { minutes: 15, kills: 0, season: "autumn" as const, mode: "standard" as const, map: "saltyard" as const };
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
    expect(optionsSummary({ minutes: 10, kills: 30, season: "winter", mode: "standard", map: "saltyard" })).toBe("10 min · first to 30 · ❄️ Winter");
    expect(optionsSummary({ minutes: 5, kills: 30, season: "auto", mode: "gungame", map: "saltyard" })).toBe("Gun game · 5 min");
  });

  it("carries the map: settings, summary, and a started match's document", () => {
    expect(parseOptions({ map: "ironwake" }).map).toBe("ironwake");
    expect(parseOptions({ map: "atlantis" }).map).toBe("saltyard");
    expect(parseOptions({ map: "toString" }).map).toBe("saltyard");
    expect(toSettings({ ...DEFAULT_OPTIONS, map: "ironwake" })).toEqual({ map: "ironwake" });
    expect(optionsSummary({ ...DEFAULT_OPTIONS, map: "ironwake" })).toBe("Ironwake · 7 min");
    expect(optionsFrom({ pre: { map: "ironwake" } }, {}).map).toBe("ironwake");
    expect(optionsFrom(newDoc(0, 0, 2, { m: "ironwake" }), {}).map).toBe("ironwake");
    // A match that started before maps could be picked has none in its document.
    expect(optionsFrom(newDoc(0, 0, 2), { map: "ironwake" }).map).toBe("saltyard");
    expect(parseDoc(JSON.parse(JSON.stringify(newDoc(0, 0, 2, { m: "ironwake" }))))?.m).toBe("ironwake");
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

describe("options in the shared state", () => {
  it("prefers the host's loadout-screen picks, then the challenge settings", () => {
    expect(optionsFrom(null, { min: 10 })).toMatchObject({ minutes: 10 });
    expect(optionsFrom({ pre: { min: 3, kills: 0, season: "winter" } }, { min: 10 })).toEqual({ minutes: 3, kills: 0, season: "winter", mode: "standard", map: "saltyard" });
  });
  it("reads a started match from its document (a reconnect keeps the same season)", () => {
    const doc = newDoc(0, 0, 2, { ...docOverrides(parseOptions({ min: 15, kills: 0 })), s: "spring" });
    expect(optionsFrom(doc, {})).toEqual({ minutes: 15, kills: 0, season: "spring", mode: "standard", map: "saltyard" });
  });
  it("a started gun game reads back as gun game", () => {
    const doc = newDoc(0, 0, 4, docOverrides(parseOptions({ mode: "gungame", kills: 5 })));
    expect(optionsFrom(doc, {})).toMatchObject({ mode: "gungame", kills: null });
  });
});

describe("kill limit buttons", () => {
  it("go lowest to highest, standard in its place, no limit last", () => {
    expect(killChoices(20)).toEqual([5, 10, null, 30, 50, 0]);
    expect(killChoices(40)).toEqual([5, 10, 20, 30, null, 50, 0]);
  });
});

describe("gun game", () => {
  it("is a host option that round-trips through the settings blob", () => {
    expect(parseOptions({ mode: "gungame" }).mode).toBe("gungame");
    expect(parseOptions({ mode: "zombies" }).mode).toBe("standard");
    expect(toSettings({ ...DEFAULT_OPTIONS, mode: "gungame", map: "saltyard" })).toEqual({ mode: "gungame" });
    expect(parseOptions(toSettings({ ...DEFAULT_OPTIONS, mode: "gungame", minutes: 10 }))).toEqual({ ...DEFAULT_OPTIONS, mode: "gungame", minutes: 10 });
  });

  it("the ladder is the kill limit: one kill per weapon alone, a team's size per weapon in team play", () => {
    const ffa = newDoc(0, 0, 6, docOverrides(parseOptions({ mode: "gungame", kills: 50 })));
    expect(ffa.gg).toBe(1);
    expect(ffa.lim).toBe(GUN_GAME_LADDER.length);
    const teams = newDoc(0, 2, 6, docOverrides(parseOptions({ mode: "gungame", map: "saltyard" })));
    expect(teams.gg).toBe(3);
    expect(teams.lim).toBe(GUN_GAME_LADDER.length * 3);
    expect(newDoc(0, 0, 4).gg).toBeUndefined();
  });

  it("ends on the kill made with the last weapon", () => {
    let doc = newDoc(0, 0, 2, docOverrides(parseOptions({ mode: "gungame", map: "saltyard" })));
    for (let life = 0; life < GUN_GAME_LADDER.length - 1; life++) doc = applyKill(doc, [1, life, 0, 0, 0, 10] as KillRec, 1)!;
    expect(doc.end).toBeNull();
    expect(gunGameWeapon(GUN_GAME_LADDER.length - 1, 1)).toBe("knife");
    doc = applyKill(doc, [1, GUN_GAME_LADDER.length - 1, 0, weaponIndex("knife"), 0, 10] as KillRec, 2)!;
    expect(doc.end).toEqual({ r: "limit", at: 2 });
    expect(parseDoc(JSON.parse(JSON.stringify(doc)))?.gg).toBe(1);
  });

  it("hands out the ladder in order, a team's size of kills per rung in team play", () => {
    expect(gunGameWeapon(0, 1)).toBe("ar");
    expect(gunGameWeapon(1, 1)).toBe("smg");
    expect(gunGameWeapon(99, 1)).toBe("knife");
    expect(gunGameWeapon(2, 3)).toBe("ar");
    expect(gunGameWeapon(3, 3)).toBe("smg");
    expect(limitLabel(12, false, true)).toBe("first knife kill wins");
  });
});
