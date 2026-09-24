// Loot tables. Each entry is rolled independently against its chance,
// then one weighted item is picked from the successful pool.

export interface LootEntry {
  itemId: string;
  weight: number;
}

export interface LootTable {
  /** Chance (0..1) that anything drops at all. */
  dropChance: number;
  entries: LootEntry[];
  /** Chance of also dropping a Sunbloom Draught (healing). */
  potionChance: number;
  gold: [number, number];
}

export const LOOT_TABLES: Record<string, LootTable> = {
  bramblekin: {
    dropChance: 0.55,
    potionChance: 0.3,
    gold: [3, 9],
    entries: [
      { itemId: "wayfarer-blade", weight: 30 },
      { itemId: "woven-jerkin", weight: 30 },
      { itemId: "thorn-cleaver", weight: 22 },
      { itemId: "emberglass-charm", weight: 13 },
      { itemId: "bark-plated-vest", weight: 5 },
    ],
  },
  sentinel: {
    dropChance: 0.8,
    potionChance: 0.45,
    gold: [8, 20],
    entries: [
      { itemId: "hollow-pike", weight: 34 },
      { itemId: "bark-plated-vest", weight: 30 },
      { itemId: "emberglass-charm", weight: 18 },
      { itemId: "sentinel-cuirass", weight: 12 },
      { itemId: "dawnreach-longsword", weight: 6 },
    ],
  },
  thornmaw: {
    dropChance: 1,
    potionChance: 1,
    gold: [60, 90],
    entries: [{ itemId: "thornmaw-fang", weight: 1 }],
  },
  chest: {
    dropChance: 1,
    potionChance: 0.5,
    gold: [10, 25],
    entries: [
      { itemId: "wayfarer-blade", weight: 25 },
      { itemId: "woven-jerkin", weight: 25 },
      { itemId: "thorn-cleaver", weight: 20 },
      { itemId: "tidewrack-pearl", weight: 15 },
      { itemId: "dawnreach-longsword", weight: 15 },
    ],
  },
};

export function rollLoot(
  tableId: string,
  rand: () => number,
): { itemId?: string | undefined; potion: boolean; gold: number } {
  const table = LOOT_TABLES[tableId];
  if (!table) return { potion: false, gold: 0 };
  const gold = Math.round(table.gold[0] + rand() * (table.gold[1] - table.gold[0]));
  const potion = rand() < table.potionChance;
  if (rand() > table.dropChance) return { potion, gold };

  const total = table.entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rand() * total;
  for (const entry of table.entries) {
    roll -= entry.weight;
    if (roll <= 0) return { itemId: entry.itemId, potion, gold };
  }
  return { itemId: table.entries[0]?.itemId, potion, gold };
}
