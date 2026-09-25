// Regression checks for bugs found in the mobile/gameplay audit. Run with: bun test ./tests
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { input } from "../src/game/core/input";
import {
  DROP_LIFE_COIN,
  initWorld,
  loadSaveIntoStore,
  snapshot,
  stepWorld,
  world,
} from "../src/game/core/sim";
import { RESOURCES, RESOURCE_RESPAWN, WATCHSTONE } from "../src/game/data/world";
import { migrateSave, SAVE_KEY } from "../src/game/core/persistence";
import { useSettings } from "../src/game/core/settings";
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

  test("damaged equipped entries are rebuilt: usable uid, numeric plus, right slot", () => {
    const broken = JSON.parse(JSON.stringify(snapshot()));
    broken.inventory = [{ uid: "r0", itemId: "thorn-cleaver", plus: 0 }];
    broken.equipped = {
      weapon: { itemId: "wayfarer-blade", plus: "sharp" }, // no uid, bad plus
      armor: { uid: "", itemId: "wayfarer-blade", plus: 2 }, // a weapon in the armor slot
      accessory: null,
      relic: null,
    };
    const s = migrateSave(broken)!;
    const w = s.equipped.weapon!;
    expect(w.itemId).toBe("wayfarer-blade");
    expect(typeof w.uid).toBe("string");
    expect(w.uid.length).toBeGreaterThan(0);
    expect(w.uid).not.toBe("r0"); // never collides with a repaired satchel uid
    expect(w.plus).toBe(0);
    expect(s.equipped.armor).toBeNull();
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

describe("input buffer", () => {
  test("an attack pressed early in a swing still chains into the next hit", () => {
    input.attackQueued = true;
    stepWorld(DT);
    expect(world.player.comboIdx).toBe(1);
    run(0.05); // well before the old 30% cut-off, where the press was dropped
    input.attackQueued = true;
    run(0.6);
    expect(world.player.comboIdx).toBe(2);
  });

  test("a dodge pressed just before its cooldown ends still happens", () => {
    input.dodgeQueued = true;
    stepWorld(DT);
    expect(world.player.action).toBe("dodge");
    const cd = world.player.dodgeCd;
    run(cd - 0.1);
    input.dodgeQueued = true;
    stepWorld(DT);
    expect(world.player.action).not.toBe("dodge");
    run(0.15);
    expect(world.player.action).toBe("dodge");
  });

  test("a stale press expires instead of firing much later", () => {
    input.dodgeQueued = true;
    stepWorld(DT);
    run(0.1);
    input.dodgeQueued = true; // far too early: cooldown still has a long way to go
    run(world.player.dodgeCd + 0.05);
    expect(world.player.action).not.toBe("dodge");
  });
});

describe("combat fairness", () => {
  const boss = () => world.enemies.find((e) => e.id === "boss")!;
  const putBoss = (dz = 2.2) => {
    const b = boss();
    b.x = b.homeX = world.player.x;
    b.z = b.homeZ = world.player.z + dz;
    return b;
  };

  test("an enemy walking home after a leash can't be farmed", () => {
    const b = putBoss();
    b.phase = "return";
    b.homeZ += 30; // it is heading away from us
    b.hp = b.maxHp * 0.5;
    input.attackQueued = true;
    run(0.6);
    expect(world.stats.swings).toBe(1);
    expect(world.stats.hits).toBe(0); // the swing connected with nothing it could hurt
  });

  test("a boss that resets goes back to its calm first phase", () => {
    const b = putBoss(0.5);
    b.bossPhase = 2;
    b.x += 3;
    b.phase = "return";
    world.player.x += 60; // out of reach so it doesn't re-aggro
    run(3);
    expect(b.phase).toBe("idle");
    expect(b.bossPhase).toBe(1);
  });

  test("a boss killed by thorns at the end of its charge stays dead", () => {
    useGame.setState({ level: 5 });
    useGame.getState().addItem("sentinel-cuirass", true);
    useGame.getState().equip(useGame.getState().inventory[0]!.uid);
    const b = putBoss(1.5);
    b.hp = 1;
    b.aggro = true;
    b.phase = "charge";
    b.struck = false;
    b.chargeLeft = 0.005; // the charge ends on the same frame it connects
    b.yaw = Math.PI; // running at the player
    world.player.invuln = 0;
    stepWorld(DT);
    expect(b.phase).toBe("dead");
    run(1);
    expect(b.phase).toBe("dead");
  });

  test("a hit doesn't cancel an ability whose cooldown is already spent", () => {
    useGame.setState({ level: 3 });
    input.abilityQueued = 1; // Emberburst
    stepWorld(DT);
    expect(world.player.action).toBe("burst");
    const b = putBoss(1.5);
    b.aggro = true;
    b.phase = "strike";
    b.struck = false;
    b.timer = 0.3;
    b.zones = [{ kind: "circle", x: world.player.x, z: world.player.z, r: 3 }];
    world.player.invuln = 0;
    stepWorld(DT);
    expect(useGame.getState().hp).toBeLessThan(statsFor(useGame.getState()).maxHp);
    expect(world.player.action).toBe("burst");
  });

  test("Blink can't skip the Watchstone climb", () => {
    useGame.setState({ archetype: "arcanist", level: 2 });
    const p = world.player;
    // Stand at the rock's foot, facing its centre.
    p.x = WATCHSTONE.x;
    p.z = WATCHSTONE.z + WATCHSTONE.radius + 4;
    p.y = heightAt(p.x, p.z);
    p.yaw = Math.PI; // facing -z, towards the rock
    input.yaw = p.yaw + Math.PI;
    input.abilityQueued = 0;
    stepWorld(DT);
    run(0.5);
    expect(p.y).toBeLessThan(heightAt(WATCHSTONE.x, WATCHSTONE.z) - 4);
  });
});

describe("loot on the ground", () => {
  test("unclaimed coin fades after a while instead of piling up forever", () => {
    world.drops.push({
      id: 999,
      x: 900,
      y: 0,
      z: 900,
      potion: false,
      gold: 5,
      shards: 0,
      born: world.time,
      taken: false,
    });
    run(1);
    expect(world.drops.some((d) => d.id === 999)).toBe(true);
    world.time += DROP_LIFE_COIN;
    run(0.1);
    expect(world.drops.some((d) => d.id === 999)).toBe(false);
  });
});

describe("combat feel", () => {
  test("knockback is a quick slide, not a teleport", () => {
    const e = world.enemies.find((x) => x.id === "b1")!;
    e.x = e.homeX = world.player.x;
    e.z = e.homeZ = world.player.z + 2.2;
    e.maxHp = e.hp = 9999;
    const z0 = e.z;
    input.attackQueued = true;
    let hitFrame = -1;
    for (let i = 0; i < 60 && hitFrame < 0; i++) {
      stepWorld(DT);
      if (e.kvx !== 0 || e.kvz !== 0) hitFrame = i;
    }
    expect(hitFrame).toBeGreaterThanOrEqual(0);
    const firstFrame = Math.abs(e.z - z0);
    run(0.6);
    const total = Math.abs(e.z - z0);
    expect(total).toBeGreaterThan(0.2);
    expect(firstFrame).toBeLessThan(total * 0.5); // spread over several frames
  });

  test("enemies on the same spot spread apart", () => {
    const [a, b] = world.enemies.filter((x) => x.type === "bramblekin");
    for (const e of [a!, b!]) {
      e.x = e.homeX = world.player.x + 8;
      e.z = e.homeZ = world.player.z + 8;
      e.phase = "idle";
    }
    world.player.x -= 30; // far enough that they stay idle
    run(0.3);
    expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThan(1);
  });
});

describe("shard crystals", () => {
  const standOn = (x: number, z: number) => {
    const p = world.player;
    p.x = x;
    p.z = z;
    p.y = heightAt(x, z);
  };
  const reload = (awaySeconds = 0) => {
    const save = migrateSave(JSON.parse(JSON.stringify(snapshot())))!;
    save.savedAt -= awaySeconds * 1000;
    initWorld(save);
  };

  test("a gathered crystal stays gathered through a save and reload", () => {
    // Regression (#56): regrow timers weren't saved, so reloading refilled every crystal.
    const r = RESOURCES[0]!;
    standOn(r.x, r.z);
    const before = useGame.getState().shards;
    run(0.2);
    const gathered = useGame.getState().shards;
    expect(gathered).toBe(before + r.shards);
    reload();
    standOn(r.x, r.z);
    run(0.2);
    expect(useGame.getState().shards).toBe(gathered);
  });

  test("time away counts toward regrowing", () => {
    const r = RESOURCES[1]!;
    standOn(r.x, r.z);
    run(0.2);
    const gathered = useGame.getState().shards;
    reload(RESOURCE_RESPAWN + 5); // back after the crystal has grown again
    standOn(r.x, r.z);
    run(0.2);
    expect(useGame.getState().shards).toBe(gathered + r.shards);
  });

  test("a damaged save's timers are cleaned, not trusted", () => {
    const save = migrateSave({
      ...JSON.parse(JSON.stringify(snapshot())),
      shardRegrow: { "r-w1": 1e9, x: "soon", "r-w2": -5 },
    })!;
    expect(save.shardRegrow).toEqual({ "r-w1": RESOURCE_RESPAWN });
  });
});

describe("lock-on", () => {
  const place = (id: string, dx: number, dz: number) => {
    const e = world.enemies.find((x) => x.id === id)!;
    e.x = e.homeX = world.player.x + dx;
    e.z = e.homeZ = world.player.z + dz;
    e.phase = "idle";
    return e;
  };

  test("locks the nearest enemy, cycles to the next, then releases", () => {
    const near = place("b1", 0, 5);
    const far = place("b2", 0, 12);
    input.lockQueued = true;
    stepWorld(DT);
    expect(world.lockId).toBe(near.id);
    input.lockQueued = true;
    stepWorld(DT);
    expect(world.lockId).toBe(far.id);
    input.lockQueued = true;
    stepWorld(DT);
    expect(world.lockId).toBeNull();
  });

  test("top view: prefers the enemy ahead of the hero; behind view: ahead of the camera", () => {
    const east = place("b1", 6, 0); // where the hero faces
    const north = place("b2", 0, -5.5); // up the screen (where the top camera looks)
    world.player.yaw = Math.PI / 2;
    input.yaw = Math.PI; // camera facing north, as the top view holds it
    useSettings.setState({ camera: "top" });
    input.lockQueued = true;
    stepWorld(DT);
    expect(world.lockId).toBe(east.id);
    world.lockId = null;
    useSettings.setState({ camera: "behind" });
    input.lockQueued = true;
    stepWorld(DT);
    expect(world.lockId).toBe(north.id);
    useSettings.setState({ camera: "top" });
  });

  test("attacks turn to face the locked target", () => {
    const target = place("b1", 2.5, 0); // off to the side, outside the forward auto-aim cone
    target.maxHp = target.hp = 9999;
    world.player.yaw = Math.PI; // facing away from it
    input.lockQueued = true;
    stepWorld(DT);
    input.attackQueued = true;
    stepWorld(DT);
    expect(world.player.yaw).toBeCloseTo(Math.atan2(2.5, 0), 2);
  });

  test("the lock drops when the target dies", () => {
    const target = place("b1", 0, 4);
    input.lockQueued = true;
    stepWorld(DT);
    expect(world.lockId).toBe(target.id);
    target.phase = "dead";
    target.hp = 0;
    stepWorld(DT);
    expect(world.lockId).toBeNull();
  });
});
