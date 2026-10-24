import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveRoom, liveRoomUrl } from "./live-room";

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  // Test helpers: the server side.
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const supabase = (token: string | null = "tok-1") =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }) as unknown as SupabaseClient;
const MATCH = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("liveRoomUrl", () => {
  it("turns the server's address into its room socket", () => {
    expect(liveRoomUrl("https://174-138-34-59.sslip.io", MATCH)).toBe(`wss://174-138-34-59.sslip.io/room?match=${MATCH}`);
    expect(liveRoomUrl("http://localhost:8787", MATCH)).toBe(`ws://localhost:8787/room?match=${MATCH}`);
  });
});

describe("createLiveRoom", () => {
  it("signs in, holds events until welcomed, then relays both ways", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const ws = FakeSocket.all[0]!;
    const got: unknown[] = [];
    room.onEvent((event, from, at) => got.push({ event, from, at }));
    room.send({ kind: "start", at: 1 });
    room.track({ ready: true });
    ws.open();
    expect(ws.sent).toEqual([{ t: "auth", token: "tok-1" }]);
    ws.receive({ t: "welcome", you: "alice" });
    expect(ws.sent.slice(1)).toEqual([
      { t: "track", ready: true },
      { t: "event", event: { kind: "start", at: 1 } },
    ]);
    room.send({ kind: "reaction", emoji: "🔥" });
    expect(ws.sent.at(-1)).toEqual({ t: "event", event: { kind: "reaction", emoji: "🔥" } });
    ws.receive({ t: "event", from: "bob", at: 7, event: { kind: "app", type: "pos", payload: 3 } });
    expect(got).toEqual([{ event: { kind: "app", type: "pos", payload: 3 }, from: "bob", at: 7 }]);
    room.close();
  });

  it("reports presence", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const seen: unknown[] = [];
    room.onPresence((p) => seen.push(p));
    FakeSocket.all[0]!.receive({ t: "presence", peers: [{ userId: "alice", ready: true }, { userId: "bob", ready: false }] });
    expect(seen.at(-1)).toEqual([
      { userId: "alice", ready: true },
      { userId: "bob", ready: false },
    ]);
    room.close();
  });

  it("reconnects with a fresh token when dropped, but not when refused", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.drop(1006);
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
    FakeSocket.all[1]!.drop(4403);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.all).toHaveLength(2);
    room.close();
  });

  it("stops for good once closed", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    room.close();
    FakeSocket.all[0]!.drop(1006);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  describe("match state", () => {
    const open = async (latest: { state: unknown; version: number } | null = null) => {
      const room = createLiveRoom(supabase(), "https://live.example", MATCH, {
        WebSocket: FakeSocket as unknown as typeof WebSocket,
        latestState: () => latest as never,
      });
      await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
      const ws = FakeSocket.all[0]!;
      ws.open();
      return { room, ws, state: room.state! };
    };
    const sentOf = (ws: FakeSocket, t: string) => ws.sent.filter((m) => (m as { t: string }).t === t);

    it("doesn't hold the state when the room says so (an older server)", async () => {
      const { room, ws, state } = await open({ state: { k: [] }, version: 2 });
      ws.receive({ t: "welcome", you: "alice" });
      expect(state.holds()).toBe(false);
      expect(sentOf(ws, "state.offer")).toEqual([]);
      await expect(state.set({ a: 1 }, 2)).rejects.toMatchObject({ code: "internal" });
      room.close();
    });

    it("seeds an empty room with our copy; writes wait for the room's first copy", async () => {
      const { room, ws, state } = await open({ state: { k: [] }, version: 2 });
      const seen: unknown[] = [];
      state.onChange((copy, by) => seen.push({ ...copy, by }));
      ws.receive({ t: "welcome", you: "alice", holds: true, state: null });
      expect(state.holds()).toBe(true);
      expect(state.copy()).toBeNull();
      expect(sentOf(ws, "state.offer")).toEqual([{ t: "state.offer", state: { k: [] }, version: 2 }]);

      const write = state.set({ k: [1] }, 2);
      await Promise.resolve();
      expect(sentOf(ws, "state.set")).toEqual([]);
      ws.receive({ t: "state", state: { k: [] }, version: 2, by: "alice" });
      await vi.waitFor(() => expect(sentOf(ws, "state.set")).toEqual([{ t: "state.set", id: 1, state: { k: [1] }, expectedVersion: 2 }]));
      ws.receive({ t: "state", state: { k: [1] }, version: 3, by: "alice" });
      ws.receive({ t: "state.ok", id: 1, version: 3 });
      await expect(write).resolves.toBe(3);
      expect(seen).toEqual([
        { state: { k: [] }, version: 2, by: "alice" },
        { state: { k: [1] }, version: 3, by: "alice" },
      ]);
      room.close();
    });

    it("gives up waiting for a room that never gets a copy", async () => {
      const { room, ws, state } = await open();
      ws.receive({ t: "welcome", you: "alice", holds: true, state: null });
      const write = state.set({ k: [1] }, 0);
      const failed = expect(write).rejects.toMatchObject({ code: "internal" });
      await vi.advanceTimersByTimeAsync(5000);
      await failed;
      room.close();
    });

    it("offers only a newer copy than the room's, and hears everyone's writes", async () => {
      const { room, ws, state } = await open({ state: { k: [1] }, version: 4 });
      const seen: unknown[] = [];
      state.onChange((copy, by) => seen.push({ ...copy, by }));
      ws.receive({ t: "welcome", you: "alice", holds: true, state: { state: { k: [1, 2] }, version: 6 } });
      expect(sentOf(ws, "state.offer")).toEqual([]);
      expect(state.copy()).toEqual({ state: { k: [1, 2] }, version: 6 });
      ws.receive({ t: "state", state: { k: [1, 2, 3] }, version: 7, by: "bob" });
      ws.receive({ t: "state", state: { k: [1] }, version: 5, by: "bob" });
      expect(seen).toEqual([
        { state: { k: [1, 2] }, version: 6, by: null },
        { state: { k: [1, 2, 3] }, version: 7, by: "bob" },
      ]);
      room.close();
    });

    it("hands back the room's copy with a conflict", async () => {
      const { room, ws, state } = await open();
      ws.receive({ t: "welcome", you: "alice", holds: true, state: { state: null, version: 0 } });
      const write = state.set({ n: 1 }, 0);
      await vi.waitFor(() => expect(sentOf(ws, "state.set")).toHaveLength(1));
      ws.receive({ t: "state.err", id: 1, code: "conflict", state: { n: 2 }, version: 1 });
      await expect(write).rejects.toMatchObject({ code: "conflict" });
      expect(state.copy()).toEqual({ state: { n: 2 }, version: 1 });
      room.close();
    });

    it("fails writes in flight when dropped, and offers our copy to the room it reconnects to", async () => {
      let latest = { state: { n: 0 } as unknown, version: 0 };
      const room = createLiveRoom(supabase(), "https://live.example", MATCH, {
        WebSocket: FakeSocket as unknown as typeof WebSocket,
        latestState: () => latest as never,
      });
      await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
      const ws = FakeSocket.all[0]!;
      ws.open();
      const state = room.state!;
      ws.receive({ t: "welcome", you: "alice", holds: true, state: { state: { n: 3 }, version: 3 } });
      latest = { state: { n: 3 }, version: 3 };
      const dropped = state.set({ n: 4 }, 3);
      await vi.waitFor(() => expect(sentOf(ws, "state.set")).toHaveLength(1));
      ws.drop(1006);
      await expect(dropped).rejects.toMatchObject({ code: "internal" });
      expect(state.holds()).toBe(false);

      // The server restarted: its room is empty, and takes our copy.
      await vi.advanceTimersByTimeAsync(600);
      await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
      const ws2 = FakeSocket.all[1]!;
      ws2.open();
      ws2.receive({ t: "welcome", you: "alice", holds: true, state: null });
      expect(sentOf(ws2, "state.offer")).toEqual([{ t: "state.offer", state: { n: 3 }, version: 3 }]);
      room.close();
    });
  });
});
