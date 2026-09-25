// Online layer logic that doesn't need a server. Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import type { SaveFile } from "../src/game/core/persistence";
import { nameProblem } from "../src/game/online/account";
import { compareSaves } from "../src/game/online/cloudSave";
import {
  HEARTBEAT_MS,
  MAX_SHOWN,
  SEND_HZ,
  STALE_MS,
  applyPosition,
  applyPresence,
  isAway,
  nearestIds,
  shouldSend,
  stepRemotes,
  type RemotePlayer,
} from "../src/game/online/presence";

const save = (savedAt: number, level = 1) => ({ v: 2, savedAt, level }) as unknown as SaveFile;

describe("cloud save reconciliation", () => {
  test("picks the right side", () => {
    expect(compareSaves(null, null)).toBe("none");
    expect(compareSaves(save(1000), null)).toBe("only-local");
    expect(compareSaves(null, save(1000))).toBe("only-cloud");
    expect(compareSaves(save(1000), save(1500))).toBe("same"); // within 2s
    expect(compareSaves(save(1000), save(90_000))).toBe("cloud-newer");
    expect(compareSaves(save(90_000), save(1000))).toBe("local-newer");
  });
});

describe("player names", () => {
  test("follow the same rule as the database", () => {
    expect(nameProblem("Sela")).toBeNull();
    expect(nameProblem("Iron Fox_2")).toBeNull();
    expect(nameProblem("ab")).not.toBeNull();
    expect(nameProblem("a-very-long-name-here")).not.toBeNull();
    expect(nameProblem("_edge")).not.toBeNull();
    expect(nameProblem("bad!name")).not.toBeNull();
  });
});

describe("presence", () => {
  const meta = { name: "Rowan", archetype: "ranger", level: 4 };

  test("presence fills in names; positions place players; self is ignored", () => {
    const map = new Map<string, RemotePlayer>();
    applyPresence(map, { me: [meta], other: [meta] }, 0, "me");
    expect([...map.keys()]).toEqual(["other"]);
    expect(map.get("other")!.placed).toBe(false); // not drawn before a position arrives
    applyPosition(map, { id: "other", x: 5, y: 1, z: -3, yaw: 1, a: "walk" }, 10, "me");
    applyPosition(map, { id: "me", x: 9, y: 9, z: 9, yaw: 0, a: "idle" }, 10, "me");
    const r = map.get("other")!;
    expect(r.placed).toBe(true);
    expect([r.rx, r.rz, r.name, r.archetype, r.level]).toEqual([5, -3, "Rowan", "ranger", 4]);
    expect(map.has("me")).toBe(false);
  });

  test("malformed messages are ignored", () => {
    const map = new Map<string, RemotePlayer>();
    applyPosition(map, { id: "x", x: Number.NaN, y: 0, z: 0, yaw: 0 }, 0, null);
    applyPosition(map, { x: 1, y: 0, z: 0, yaw: 0 } as never, 0, null);
    expect(map.size).toBe(0);
  });

  test("players who leave the channel disappear; silent ones are 'away'", () => {
    const map = new Map<string, RemotePlayer>();
    applyPresence(map, { a: [meta], b: [meta] }, 0, null);
    applyPosition(map, { id: "a", x: 0, y: 0, z: 0, yaw: 0, a: "idle" }, 0, null);
    applyPresence(map, { a: [meta] }, 100, null);
    expect(map.has("b")).toBe(false);
    expect(isAway(map.get("a")!, STALE_MS - 1)).toBe(false);
    expect(isAway(map.get("a")!, STALE_MS + 1)).toBe(true);
  });

  test("movement is smoothed; teleports snap", () => {
    const map = new Map<string, RemotePlayer>();
    applyPosition(map, { id: "a", x: 0, y: 0, z: 0, yaw: 0, a: "walk" }, 0, null);
    applyPosition(map, { id: "a", x: 1, y: 0, z: 0, yaw: 0, a: "walk" }, 200, null);
    stepRemotes(map, 1 / 60);
    const r = map.get("a")!;
    expect(r.rx).toBeGreaterThan(0);
    expect(r.rx).toBeLessThan(1);
    applyPosition(map, { id: "a", x: 80, y: 0, z: 0, yaw: 0, a: "idle" }, 400, null);
    stepRemotes(map, 1 / 60);
    expect(r.rx).toBe(80);
  });

  test("send rate: capped while moving, heartbeat while still", () => {
    const pos = { x: 0, z: 0, yaw: 0, a: "idle" };
    expect(shouldSend(null, pos, 0)).toBe(true);
    const last = { ...pos, at: 0 };
    expect(shouldSend(last, { ...pos, x: 1 }, 1000 / SEND_HZ - 1)).toBe(false);
    expect(shouldSend(last, { ...pos, x: 1 }, 1000 / SEND_HZ)).toBe(true);
    expect(shouldSend(last, pos, 1000)).toBe(false);
    expect(shouldSend(last, pos, HEARTBEAT_MS)).toBe(true);
  });

  test("only the nearest players are drawn", () => {
    const map = new Map<string, RemotePlayer>();
    for (let i = 0; i < MAX_SHOWN + 5; i++) {
      applyPosition(map, { id: `p${i}`, x: i * 3, y: 0, z: 0, yaw: 0, a: "idle" }, 0, null);
    }
    const ids = nearestIds(map, 0, 0);
    expect(ids.length).toBe(MAX_SHOWN);
    expect(ids[0]).toBe("p0");
    expect(ids).not.toContain(`p${MAX_SHOWN + 4}`);
  });
});
