// Online layer logic that doesn't need a server. Run with: bun test ./tests
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { SaveFile } from "../src/game/core/persistence";
import { nameProblem, useAccount } from "../src/game/online/account";
import {
  CHECK_TIMEOUT,
  cloud,
  compareSaves,
  dropPendingUpload,
  flushUpload,
  queueUpload,
  resolveCloudChoice,
  setBackgrounded,
  startCloudSync,
  useCloudSync,
} from "../src/game/online/cloudSave";
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

describe("cloud save syncing", () => {
  const realCloud = { ...cloud };
  let uploads: SaveFile[] = [];
  let adopted: SaveFile[] = [];
  let localSave: SaveFile | null = null;
  const local = { read: () => localSave, adopt: (s: SaveFile) => void adopted.push(s) };
  /** A server reply we release by hand, like a slow network. */
  const deferred = () => {
    let resolve!: (s: SaveFile | null) => void;
    const promise = new Promise<SaveFile | null>((r) => (resolve = r));
    return { promise, resolve };
  };

  beforeEach(() => {
    uploads = [];
    adopted = [];
    localSave = null;
    cloud.upload = async (s) => {
      uploads.push(s);
      return true;
    };
    useAccount.setState({ status: "signed-in", userId: "u1" });
    dropPendingUpload();
    setBackgrounded(false);
  });
  afterEach(() => {
    Object.assign(cloud, realCloud);
    dropPendingUpload();
    useAccount.setState({ status: "unavailable", userId: null });
  });

  test("the check finishes even after the title screen is gone, then uploads resume", async () => {
    // Regression: pressing Continue while the check was pending used to drop
    // its result, leaving cloud uploads off for the whole session.
    const reply = deferred();
    cloud.fetch = () => reply.promise;
    localSave = save(90_000, 3);
    const done = startCloudSync("u1", local);
    expect(useCloudSync.getState().phase).toBe("checking"); // title screen waits on this
    reply.resolve(save(1000, 2)); // the title screen is long gone by now
    await done;
    expect(useCloudSync.getState().phase).toBe("done");
    expect(uploads).toEqual([localSave]); // newer device progress went up
    queueUpload(save(95_000, 3));
    await flushUpload();
    expect(uploads.length).toBe(2);
  });

  test("a save made after the hide handler already ran is uploaded at once", async () => {
    // Regression: the game's save-on-hide ran after our flush-on-hide, so the
    // final save waited on a timer that a backgrounded phone may never fire.
    cloud.fetch = async () => null;
    await startCloudSync("u1", local);
    setBackgrounded(true); // our listener first: nothing pending yet
    queueUpload(save(50_000, 4)); // then the game's save-on-hide
    expect(uploads.map((s) => s.savedAt)).toEqual([50_000]);
    setBackgrounded(false);
    queueUpload(save(60_000, 4)); // back in the foreground: batched again
    expect(uploads.length).toBe(1);
  });

  test("a newer cloud save waits for the player's choice before any upload", async () => {
    cloud.fetch = async () => save(90_000, 7);
    localSave = save(1000, 2);
    await startCloudSync("u1", local);
    expect(useCloudSync.getState().phase).toBe("choice");
    queueUpload(save(2000, 2));
    await flushUpload();
    expect(uploads).toEqual([]); // never overwrite newer progress made elsewhere
    resolveCloudChoice(true, local);
    expect(adopted.map((s) => s.level)).toEqual([7]);
    expect(useCloudSync.getState().phase).toBe("done");
  });

  test("keeping this device's older save stamps it newest, so the server accepts it", async () => {
    cloud.fetch = async () => save(90_000, 7);
    localSave = save(1000, 2);
    await startCloudSync("u1", local);
    resolveCloudChoice(false, local);
    const kept = uploads[0]!;
    expect(kept.level).toBe(2);
    expect(kept.savedAt).toBeGreaterThan(90_000); // the server ignores older uploads
    expect(adopted).toEqual([kept]); // and the device agrees, so no repeat question
  });

  test("signing out abandons a check still waiting on the server", async () => {
    const reply = deferred();
    cloud.fetch = () => reply.promise;
    const done = startCloudSync("u1", local);
    dropPendingUpload(); // sign-out
    useAccount.setState({ status: "signed-out", userId: null });
    reply.resolve(save(90_000, 7));
    await done;
    expect(useCloudSync.getState().phase).toBe("idle");
    expect(adopted).toEqual([]);
  });

  test("a server that never answers doesn't hold the title screen", async () => {
    jest.useFakeTimers();
    try {
      cloud.fetch = () => new Promise(() => {});
      const done = startCloudSync("u1", local);
      jest.advanceTimersByTime(CHECK_TIMEOUT + 1);
      await done;
      expect(useCloudSync.getState().phase).toBe("failed");
      queueUpload(save(5000));
      await flushUpload();
      expect(uploads).toEqual([]); // unreconciled: play from the device only
    } finally {
      jest.useRealTimers();
    }
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
