// Regression checks for bugs found in the mobile/gameplay audit. Run with: bun test ./tests
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { input } from "../src/game/core/input";
import { initWorld, loadSaveIntoStore, snapshot, stepWorld, world } from "../src/game/core/sim";
import { migrateSave, SAVE_KEY } from "../src/game/core/persistence";
import { statsFor, useGame } from "../src/game/core/store";
import { COLLIDERS } from "../src/game/world/layout";
import { SEA_LEVEL, heightAt, regionAt } from "../src/game/world/terrain";

const DT = 1 / 60;
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += DT) stepWorld(DT);
};

const OPEN = (() => {
  for (let x = -60; x <= 60; x += 3)
    for (let z = -60; z <= 60; z += 3)
      if (!regionAt(x, z) && COLLIDERS.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + 9))
        return { x, z };
  throw new Error("no open ground");
})();

beforeEach(() => {
  useGame.getState().resetProgress();
  useGame.setState({ screen: "playing", questStep: 1 });
  initWorld(null);
  for (const e of world.enemies) {
    e.x = e.homeX = 900;
    e.z = e.homeZ = 900;
  }
  const p = world.player;
  p.x = OPEN.x;
  p.z = OPEN.z;
  p.y = heightAt(OPEN.x, OPEN.z);
  p.yaw = 0;
  input.yaw = 0;
  input.moveX = input.moveZ = 0;
});

describe("gear swaps", () => {
  test("equipping and unequipping a +HP item is never a free heal", () => {
    const store = useGame.getState();
    store.addItem("dawnreach-longsword", true);
    useGame.setState({ level: 5, hp: 20 });
    const uid = useGame.getState().inventory[0]!.uid;
    for (let i = 0; i < 5; i++) {
      useGame.getState().equip(uid);
      useGame.getState().unequip("weapon");
    }
    expect(useGame.getState().hp).toBe(20);
    useGame.getState().equip(uid);
    const s = useGame.getState();
    // Max went up by the item's health; the missing amount is unchanged.
    expect(statsFor(s).maxHp - s.hp).toBe(
      statsFor({ ...s, equipped: { ...s.equipped, weapon: null } }).maxHp - 20,
    );
  });
});

describe("one-time rewards", () => {
  test("a boss's reward goes straight into the satchel on the kill", () => {
    const boss = world.enemies.find((e) => e.id === "boss")!;
    boss.x = boss.homeX = OPEN.x;
    boss.z = boss.homeZ = OPEN.z + 2.2;
    boss.hp = 1;
    const before = useGame.getState();
    const loot = before.inventory.length + before.gold + before.shards + before.potions;
    input.attackQueued = true;
    run(0.8);
    expect(boss.phase).toBe("dead");
    expect(world.drops.every((d) => d.taken)).toBe(true);
    const after = useGame.getState();
    expect(after.inventory.length + after.gold + after.shards + after.potions).toBeGreaterThan(
      loot,
    );
  });
});

describe("water", () => {
  test("an enemy knocked into deep water walks back out", () => {
    const t2 = world.enemies.find((e) => e.id === "t2")!;
    t2.homeX = 18;
    t2.homeZ = 53;
    // Find a deep-water spot just off its home beach.
    let deep: { x: number; z: number } | null = null;
    for (let d = 1; d < 20 && !deep; d += 0.5) {
      if (heightAt(18, 53 + d) < SEA_LEVEL - 0.8) deep = { x: 18, z: 53 + d };
    }
    expect(deep).not.toBeNull();
    t2.x = deep!.x;
    t2.z = deep!.z;
    t2.aggro = false;
    t2.phase = "return";
    const start = Math.hypot(t2.x - t2.homeX, t2.z - t2.homeZ);
    run(6);
    expect(Math.hypot(t2.x - t2.homeX, t2.z - t2.homeZ)).toBeLessThan(start - 1);
  });
});

describe("saves", () => {
  test("a v2 save naming removed items or missing fields is repaired, not crashed on", () => {
    const good = snapshot();
    const broken = JSON.parse(JSON.stringify(good));
    broken.inventory = [
      { uid: "a", itemId: "wayfarer-blade", plus: 0 },
      { uid: "b", itemId: "item-from-a-future-patch", plus: 1 },
    ];
    broken.equipped = { weapon: { uid: "c", itemId: "gone", plus: 0 }, armor: null };
    delete broken.codex;
    broken.gold = "lots";
    const s = migrateSave(broken)!;
    expect(s.inventory.map((i) => i.itemId)).toEqual(["wayfarer-blade"]);
    expect(s.equipped.weapon).toBeNull();
    expect(s.equipped.relic).toBeNull();
    expect(s.codex.items).toEqual([]);
    expect(s.gold).toBe(0);
  });

  describe("with storage", () => {
    const mem = new Map<string, string>();
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in g;
    beforeEach(() => {
      mem.clear();
      if (!hadWindow)
        g.window = {
          localStorage: {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          },
        };
    });
    afterEach(() => {
      if (!hadWindow) delete g.window;
    });

    test("reloading a save made on the death screen wakes you alive at a waypoint", () => {
      if (hadWindow) return;
      const save = snapshot();
      save.hp = 0;
      save.player = { x: 58, y: 0, z: -34, yaw: 0 }; // died in Thornmaw's arena
      mem.set(SAVE_KEY, JSON.stringify(save));
      const loaded = loadSaveIntoStore()!;
      expect(loaded.hp).toBeGreaterThan(0);
      expect(useGame.getState().hp).toBeGreaterThan(0);
      expect(Math.hypot(loaded.player.x - 58, loaded.player.z + 34)).toBeGreaterThan(10);
    });

    test("an unreadable save is kept aside instead of being silently lost", () => {
      if (hadWindow) return;
      mem.set(SAVE_KEY, "{not json");
      expect(loadSaveIntoStore()).toBeNull();
      expect(mem.get(`${SAVE_KEY}.unreadable`)).toBe("{not json");
    });
  });
});
