// Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import { ARCHETYPES } from "../src/game/data/archetypes";
import { ITEMS } from "../src/game/data/items";
import { LOOT_TABLES, rollLoot } from "../src/game/data/loot";
import { mulberry32 } from "../src/game/world/terrain";
import { migrateSave, SAVE_VERSION, type SaveFileV1 } from "../src/game/core/persistence";
import {
  EMPTY_EQUIPPED,
  FORGE,
  applyForge,
  batchDispose,
  compareToEquipped,
  equipItem,
  forgeCost,
  forgePreview,
  itemStats,
  salvageValue,
  sellValue,
  statsFor,
  type Bag,
  type InvEntry,
} from "../src/game/core/rules";

const e = (itemId: string, plus = 0, uid = itemId): InvEntry => ({ uid, itemId, plus });

describe("stat calculation", () => {
  test("level 1 base stats match each archetype's data", () => {
    for (const a of Object.values(ARCHETYPES)) {
      const s = statsFor(a.id, 1, EMPTY_EQUIPPED);
      expect(s.attack).toBe(a.base.attack);
      expect(s.maxHp).toBe(a.base.maxHp);
      expect(s.crit).toBeCloseTo(a.base.crit / 100);
    }
  });

  test("archetypes are genuinely different", () => {
    const v = statsFor("vanguard", 5, EMPTY_EQUIPPED);
    const r = statsFor("ranger", 5, EMPTY_EQUIPPED);
    const a = statsFor("arcanist", 5, EMPTY_EQUIPPED);
    expect(v.maxHp).toBeGreaterThan(r.maxHp);
    expect(r.crit).toBeGreaterThan(v.crit);
    expect(a.attack).toBeGreaterThan(v.attack);
  });

  test("equipment, forge level and modifiers add up", () => {
    const eq = { ...EMPTY_EQUIPPED, weapon: e("dawnreach-longsword", 2), armor: e("sentinel-cuirass") };
    const base = statsFor("vanguard", 4, EMPTY_EQUIPPED);
    const s = statsFor("vanguard", 4, eq);
    const sword = itemStats(ITEMS["dawnreach-longsword"]!, 2);
    expect(sword.attack).toBe(16 + 2 * 2); // 12% of 16 rounds to 2 per step
    expect(s.attack).toBe(base.attack + sword.attack);
    expect(s.defense).toBe(base.defense + 11);
    expect(s.mods.keen).toBeCloseTo(0.08);
    expect(s.mods.thorns).toBeCloseTo(0.4);
    expect(s.crit).toBeCloseTo(base.crit + 0.08);
  });

  test("comparison reports exact deltas against the equipped item", () => {
    const eq = { ...EMPTY_EQUIPPED, weapon: e("wayfarer-blade") };
    const cmp = compareToEquipped("vanguard", 3, eq, e("hollow-pike"));
    expect(cmp.delta.attack).toBe(11 - 4);
    expect(cmp.delta.defense).toBe(1);
    expect(cmp.replaces?.itemId).toBe("wayfarer-blade");
  });
});

describe("loot generation", () => {
  test("same seed, same drops", () => {
    const a = rollLoot("sentinel", "ruins", mulberry32(7));
    const b = rollLoot("sentinel", "ruins", mulberry32(7));
    expect(a).toEqual(b);
  });

  test("drops only come from the enemy's pool plus the region pool", () => {
    const allowed = new Set([...LOOT_TABLES["bramblekin"]!.entries.map((x) => x.itemId), "bark-plated-vest", "hunters-band"]);
    const r = mulberry32(1);
    for (let i = 0; i < 400; i++) {
      for (const id of rollLoot("bramblekin", "woods", r).items) expect(allowed.has(id)).toBe(true);
    }
  });

  test("region changes what can drop", () => {
    const r = mulberry32(3);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) rollLoot("shade", "barrow", r).items.forEach((x) => seen.add(x));
    expect(seen.has("barrow-idol")).toBe(true); // barrow-only pool
  });

  test("bosses always drop their unique rewards, ordinary foes never do", () => {
    const r = mulberry32(9);
    const boss = rollLoot("thornmaw", "ruins", r);
    expect(boss.items).toContain("thornmaw-fang");
    expect(boss.items).toContain("thornmaw-heartseed");
    expect(boss.shards).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < 500; i++) {
      for (const id of rollLoot("sentinel", "ruins", r).items) expect(ITEMS[id]!.boss).toBeFalsy();
    }
  });
});

describe("inventory transactions", () => {
  const bag = (over: Partial<Bag> = {}): Bag => ({ inventory: [], equipped: { ...EMPTY_EQUIPPED }, gold: 0, shards: 0, level: 3, ...over });

  test("equip swaps the previous item back into the satchel", () => {
    const b = bag({ inventory: [e("hollow-pike")], equipped: { ...EMPTY_EQUIPPED, weapon: e("wayfarer-blade") } });
    const r = equipItem(b, "hollow-pike");
    expect(r.ok).toBe(true);
    expect(r.bag.equipped.weapon?.itemId).toBe("hollow-pike");
    expect(r.bag.inventory.map((i) => i.itemId)).toEqual(["wayfarer-blade"]);
  });

  test("level requirement blocks equipping", () => {
    const r = equipItem(bag({ level: 2, inventory: [e("kingsbane")] }), "kingsbane");
    expect(r.ok).toBe(false);
    expect(r.bag.equipped.weapon).toBeNull();
  });

  test("batch sell and salvage pay the listed values and never touch equipped gear", () => {
    const items = [e("woven-jerkin", 0, "a"), e("thorn-cleaver", 1, "b"), e("sunstone-shard", 0, "c")];
    const b = bag({ inventory: items, equipped: { ...EMPTY_EQUIPPED, weapon: e("wayfarer-blade", 0, "w") } });
    const sold = batchDispose(b, ["a", "b", "w"], "sell");
    expect(sold.bag.gold).toBe(sellValue(items[0]!) + sellValue(items[1]!));
    expect(sold.bag.inventory.map((i) => i.uid)).toEqual(["c"]);
    expect(sold.bag.equipped.weapon?.uid).toBe("w");
    const salv = batchDispose(sold.bag, ["c"], "salvage");
    expect(salv.bag.shards).toBe(salvageValue(items[2]!));
    expect(salv.bag.inventory).toEqual([]);
    expect(batchDispose(salv.bag, [], "sell").ok).toBe(false);
  });
});

describe("forge", () => {
  const sword = ITEMS["dawnreach-longsword"]!;

  test("costs rise with each step and follow the published formula", () => {
    const c0 = forgeCost(sword, 0);
    const c1 = forgeCost(sword, 1);
    expect(c0.gold).toBe(Math.round(FORGE.goldBase.rare * 1 * (1 + sword.level * 0.15)));
    expect(c1.gold).toBeGreaterThan(c0.gold);
    expect(c1.shards).toBe(FORGE.shardBase.rare * 2);
    expect(forgeCost(sword, 0).chance).toBe(1);
    expect(forgeCost(sword, 3).chance).toBe(0.75);
    expect(forgeCost(sword, 4).chance).toBe(0.5);
  });

  test("preview matches the applied result exactly", () => {
    const entry = e("dawnreach-longsword", 1);
    const wallet = { gold: 999, shards: 99 };
    const p = forgePreview(entry, wallet);
    const r = applyForge(entry, wallet, 0);
    expect(r.success).toBe(true);
    expect(itemStats(sword, r.entry.plus)).toEqual(p.to);
    expect(r.gold).toBe(999 - p.cost.gold);
    expect(r.shards).toBe(99 - p.cost.shards);
  });

  test("failure spends embers, refunds half the shards, keeps the item", () => {
    const entry = e("dawnreach-longsword", 4);
    const wallet = { gold: 999, shards: 99 };
    const p = forgePreview(entry, wallet);
    const r = applyForge(entry, wallet, 0.99);
    expect(r.success).toBe(false);
    expect(r.entry.plus).toBe(4);
    expect(r.gold).toBe(999 - p.cost.gold);
    expect(r.shards).toBe(99 - p.cost.shards + Math.floor(p.cost.shards / 2));
  });

  test("cannot upgrade without materials or past +5", () => {
    expect(applyForge(e("wayfarer-blade"), { gold: 0, shards: 0 }, 0).ok).toBe(false);
    expect(forgePreview(e("wayfarer-blade", 5), { gold: 999, shards: 99 }).canUpgrade).toBe(false);
  });
});

describe("save migration", () => {
  const v1: SaveFileV1 = {
    v: 1,
    savedAt: 1,
    player: { x: 1, y: 2, z: 3, yaw: 0 },
    hp: 80,
    level: 3,
    xp: 40,
    gold: 120,
    potions: 2,
    inventory: [{ uid: "u1", itemId: "thorn-cleaver" }, { uid: "u2", itemId: "not-a-real-item" }],
    equipped: { weapon: "wayfarer-blade", armor: null, trinket: "emberglass-charm" },
    questStep: 6,
    questKills: 0,
    questComplete: true,
    shoreUnlocked: true,
    deaths: 1,
    kills: 9,
    elapsed: 600,
    defeated: ["boss"],
    quality: "low",
    muted: false,
  };

  test("v1 converts to the current version without losing progress", () => {
    const s = migrateSave(v1)!;
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.level).toBe(3);
    expect(s.gold).toBe(120);
    expect(s.archetype).toBe("vanguard");
    expect(s.equipped.weapon?.itemId).toBe("wayfarer-blade");
    expect(s.equipped.accessory?.itemId).toBe("emberglass-charm"); // trinket → accessory
    expect(s.inventory.map((i) => i.itemId)).toEqual(["thorn-cleaver"]); // unknown item dropped safely
    expect(s.inventory[0]!.plus).toBe(0);
    expect(s.questIdx).toBe(1); // finished starter → barrow quest
    expect(s.barrowUnlocked).toBe(true);
    expect(s.codex.kills["thornmaw"]).toBe(1);
    expect(s.defeated).toContain("boss");
  });

  test("mid-quest v1 keeps its step", () => {
    const s = migrateSave({ ...v1, questStep: 3, questComplete: false, shoreUnlocked: false })!;
    expect(s.questIdx).toBe(0);
    expect(s.questStep).toBe(3);
    expect(s.barrowUnlocked).toBe(false);
  });

  test("current saves pass through; unknown versions are refused", () => {
    const s = migrateSave(v1)!;
    expect(migrateSave(s)).toBe(s);
    expect(migrateSave({ v: 99 })).toBeNull();
    expect(migrateSave(null)).toBeNull();
  });
});
