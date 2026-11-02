import { describe, expect, it } from "vitest";
import { crownHolder, seatColor } from "./markers";

const k = (o: Record<number, number>) => new Map(Object.entries(o).map(([s, n]) => [Number(s), n]));

describe("kill leader crown", () => {
  const seats = [0, 1, 2, 3];
  it("waits for a couple of kills", () => {
    expect(crownHolder(k({}), seats, null)).toBeNull();
    expect(crownHolder(k({ 1: 1 }), seats, null)).toBeNull();
    expect(crownHolder(k({ 1: 2 }), seats, null)).toBe(1);
  });
  it("goes to the one player strictly ahead", () => {
    expect(crownHolder(k({ 0: 3, 1: 5, 2: 4 }), seats, 0)).toBe(1);
  });
  it("stays with the holder on a tie, and is off for a tie without them", () => {
    expect(crownHolder(k({ 0: 4, 1: 4 }), seats, 0)).toBe(0);
    expect(crownHolder(k({ 0: 4, 1: 4 }), seats, 2)).toBeNull();
    expect(crownHolder(k({ 0: 4, 1: 4 }), seats, null)).toBeNull();
  });
  it("gives every seat at a full table its own color", () => {
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(seatColor)).size).toBe(8);
  });
});
