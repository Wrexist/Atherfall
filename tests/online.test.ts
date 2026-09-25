// Online layer logic that doesn't need a server. Run with: bun test ./tests
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { SaveFile } from "../src/game/core/persistence";
import { nameProblem, useAccount } from "../src/game/online/account";
import {
  INVITE_RANGE,
  type PartySnapshot,
  invitableNearby,
  partyIo,
  refreshParty,
  stopParties,
  useParty,
} from "../src/game/online/party";
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
  /** A pretend server: one save per account, with the revision the real one keeps. */
  let server: { save: SaveFile | null; revision: number };
  let uploads: { save: SaveFile; base: number }[] = [];
  let adopted: SaveFile[] = [];
  let localSave: SaveFile | null = null;
  const local = { read: () => localSave, adopt: (s: SaveFile) => void adopted.push(s) };
  const acceptUpload = async (save: SaveFile, base: number) => {
    uploads.push({ save, base });
    if (base !== server.revision) return { ok: false as const, conflict: true };
    server = { save, revision: server.revision + 1 };
    return { ok: true as const, revision: server.revision };
  };
  /** A server reply we release by hand, like a slow network. */
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };
  const onServer = (save: SaveFile, revision: number) => {
    server = { save, revision };
    cloud.fetch = async () => ({ save, revision });
  };

  beforeEach(() => {
    server = { save: null, revision: 0 };
    uploads = [];
    adopted = [];
    localSave = null;
    cloud.fetch = async () =>
      server.save ? { save: server.save, revision: server.revision } : null;
    cloud.upload = acceptUpload;
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
    server = { save: save(1000, 2), revision: 4 };
    const reply = deferred<{ save: SaveFile; revision: number } | null>();
    cloud.fetch = () => reply.promise;
    localSave = save(90_000, 3);
    const done = startCloudSync("u1", local);
    expect(useCloudSync.getState().phase).toBe("checking"); // title screen waits on this
    reply.resolve({ save: save(1000, 2), revision: 4 }); // the title screen is long gone by now
    await done;
    expect(useCloudSync.getState().phase).toBe("done");
    expect(uploads).toEqual([{ save: localSave, base: 4 }]); // newer device progress went up
    queueUpload(save(95_000, 3));
    await flushUpload();
    expect(uploads.map((u) => u.base)).toEqual([4, 5]); // each on top of the last
  });

  test("a save made after the hide handler already ran is uploaded at once", async () => {
    // Regression: the game's save-on-hide ran after our flush-on-hide, so the
    // final save waited on a timer that a backgrounded phone may never fire.
    await startCloudSync("u1", local);
    setBackgrounded(true); // our listener first: nothing pending yet
    queueUpload(save(50_000, 4)); // then the game's save-on-hide
    expect(uploads.map((u) => u.save.savedAt)).toEqual([50_000]);
    setBackgrounded(false);
    queueUpload(save(60_000, 4)); // back in the foreground: batched again
    expect(uploads.length).toBe(1);
  });

  test("uploads go one at a time, so a slow one can't land after a newer one", async () => {
    await startCloudSync("u1", local);
    const slow = deferred<void>();
    cloud.upload = async (s, base) => {
      if (!uploads.length) await slow.promise; // the first request is stuck on a bad network
      return acceptUpload(s, base);
    };
    queueUpload(save(1000, 2));
    const first = flushUpload();
    queueUpload(save(2000, 3));
    const second = flushUpload(); // must wait for the first
    await Promise.resolve();
    expect(uploads).toEqual([]);
    slow.resolve();
    await Promise.all([first, second]);
    expect(uploads.map((u) => [u.save.level, u.base])).toEqual([
      [2, 0],
      [3, 1],
    ]);
    expect(server.save!.level).toBe(3);
  });

  test("starting to play while the title screen's upload is still sending doesn't fake a conflict", async () => {
    // Regression (review of #3): the reconciliation upload bypassed the queue,
    // so the first in-game save raced it on the same revision and one of them
    // was taken for another device's save.
    server = { save: save(1000, 2), revision: 4 };
    localSave = save(90_000, 3);
    const slow = deferred<void>();
    cloud.upload = async (s, base) => {
      if (!uploads.length) await slow.promise; // the title screen's upload is slow
      return acceptUpload(s, base);
    };
    const sync = startCloudSync("u1", local);
    await new Promise((r) => setTimeout(r, 0));
    queueUpload(save(95_000, 3)); // the player pressed Continue and the game saved
    const game = flushUpload();
    slow.resolve();
    await Promise.all([sync, game]);
    expect(useCloudSync.getState().phase).toBe("done");
    expect(uploads.map((u) => [u.save.savedAt, u.base])).toEqual([
      [90_000, 4],
      [95_000, 5],
    ]);
    expect(server.save!.savedAt).toBe(95_000);
  });

  test("another device's save is never overwritten: syncing stops and the player is told", async () => {
    onServer(save(1000, 2), 7);
    localSave = save(1000, 2);
    await startCloudSync("u1", local); // same save, synced at revision 7
    server = { save: save(5000, 9), revision: 8 }; // a phone elsewhere saves
    queueUpload(save(6000, 3));
    await flushUpload();
    expect(server.save!.level).toBe(9); // untouched
    expect(useCloudSync.getState().phase).toBe("conflict");
    expect(useCloudSync.getState().message).toMatch(/another device/i);
    queueUpload(save(7000, 3));
    await flushUpload();
    expect(uploads.length).toBe(1); // no more attempts this session
  });

  test("a newer cloud save waits for the player's choice before any upload", async () => {
    onServer(save(90_000, 7), 3);
    localSave = save(1000, 2);
    await startCloudSync("u1", local);
    expect(useCloudSync.getState().phase).toBe("choice");
    queueUpload(save(2000, 2));
    await flushUpload();
    expect(uploads).toEqual([]); // never overwrite newer progress made elsewhere
    resolveCloudChoice(true, local);
    expect(adopted.map((s) => s.level)).toEqual([7]);
    expect(useCloudSync.getState().phase).toBe("done");
    queueUpload(save(95_000, 7));
    await flushUpload();
    expect(uploads.map((u) => u.base)).toEqual([3]); // builds on the save it loaded
  });

  test("keeping this device's save uploads it as it is, whatever the clocks say", async () => {
    // Regression: it used to be re-stamped into the future, and then the next
    // real saves looked older and were dropped.
    onServer(save(90_000, 7), 3);
    localSave = save(1000, 2);
    await startCloudSync("u1", local);
    resolveCloudChoice(false, local);
    await Promise.resolve();
    expect(uploads).toEqual([{ save: localSave, base: 3 }]);
    expect(adopted).toEqual([]); // the device already has it
    queueUpload(save(1500, 2)); // a later save from a device whose clock is behind
    await flushUpload();
    expect(server.save!.savedAt).toBe(1500);
  });

  test("signing out abandons a check still waiting on the server", async () => {
    const reply = deferred<{ save: SaveFile; revision: number } | null>();
    cloud.fetch = () => reply.promise;
    const done = startCloudSync("u1", local);
    dropPendingUpload(); // sign-out
    useAccount.setState({ status: "signed-out", userId: null });
    reply.resolve({ save: save(90_000, 7), revision: 1 });
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

describe("parties", () => {
  const player = (id: string, x: number, placed = true) =>
    ({
      id,
      name: id,
      archetype: "ranger",
      level: 3,
      x,
      y: 0,
      z: 0,
      yaw: 0,
      anim: "idle",
      rx: x,
      ry: 0,
      rz: 0,
      ryaw: 0,
      seen: 0,
      placed,
    }) as RemotePlayer;

  test("only nearby, placed players who aren't you or already in your party, nearest first", () => {
    const players = [
      player("far", INVITE_RANGE + 5),
      player("near", 3),
      player("self", 1),
      player("member", 2),
      player("ghost", 1, false), // no position yet
      player("closest", 1.5),
    ];
    const members = [{ id: "member", name: "M", archetype: "vanguard", level: 1 }];
    const ids = invitableNearby(players, "self", members, 0, 0).map((r) => r.id);
    expect(ids).toEqual(["closest", "near"]);
  });
});

describe("party refresh", () => {
  const snap = (partyId: string | null): PartySnapshot => ({
    partyId,
    leader: partyId ? "me" : null,
    members: [],
    invites: [],
    open: true,
  });
  let answers: Array<(s: PartySnapshot) => void> = [];
  const realRead = partyIo.read;
  beforeEach(() => {
    answers = [];
    partyIo.read = () => new Promise((resolve) => answers.push(resolve));
    useAccount.setState({ userId: "me" });
    stopParties();
  });
  afterEach(() => {
    partyIo.read = realRead;
    useAccount.setState({ userId: null });
  });

  test("a slower, older refresh can't undo a newer one", async () => {
    const older = refreshParty();
    const newer = refreshParty();
    answers[1]!(snap("after-join"));
    answers[0]!(snap(null)); // read before the join, arriving last
    await Promise.all([older, newer]);
    expect(useParty.getState().partyId).toBe("after-join");
  });

  test("nothing lands after stopping (sign-out)", async () => {
    const pending = refreshParty();
    stopParties();
    answers[0]!(snap("stale"));
    await pending;
    expect(useParty.getState().partyId).toBeNull();
  });
});
