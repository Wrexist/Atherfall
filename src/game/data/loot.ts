// Loot tables, keyed by enemy type AND by the region the kill happens in.
// A roll picks from the enemy's own pool merged with the region's pool.

export interface LootEntry {
  itemId: string;
  weight: number;
}

export interface LootTable {
  /** Chance (0..1) that an item drops at all. */
  dropChance: number;
  entries: LootEntry[];
  potionChance: number;
  gold: [number, number];
  /** Aether Shards (forge material) dropped directly. */
  shards: [number, number];
  /** Bosses: items that always drop, in addition to the roll. */
  guaranteed?: string[];
}

export const LOOT_TABLES: Record<string, LootTable> = {
  bramblekin: {
    dropChance: 0.5,
    potionChance: 0.3,
    gold: [3, 9],
    shards: [0, 1],
    entries: [
      { itemId: "wayfarer-blade", weight: 26 },
      { itemId: "woven-jerkin", weight: 30 },
      { itemId: "thorn-cleaver", weight: 20 },
      { itemId: "emberglass-charm", weight: 14 },
      { itemId: "hunters-band", weight: 10 },
    ],
  },
  sentinel: {
    dropChance: 0.7,
    potionChance: 0.4,
    gold: [8, 18],
    shards: [1, 2],
    entries: [
      { itemId: "hollow-pike", weight: 30 },
      { itemId: "bark-plated-vest", weight: 26 },
      { itemId: "sentinel-cuirass", weight: 12 },
      { itemId: "sunstone-shard", weight: 8 },
      { itemId: "dawnreach-longsword", weight: 6 },
    ],
  },
  thornmaw: {
    dropChance: 0,
    potionChance: 1,
    gold: [70, 90],
    shards: [8, 8],
    entries: [],
    guaranteed: ["thornmaw-fang", "thornmaw-heartseed"],
  },
  shade: {
    dropChance: 0.55,
    potionChance: 0.35,
    gold: [12, 24],
    shards: [1, 3],
    entries: [
      { itemId: "barrow-glaive", weight: 30 },
      { itemId: "shade-wrap", weight: 30 },
      { itemId: "lantern-ring", weight: 10 },
      { itemId: "tidewrack-pearl", weight: 10 },
    ],
  },
  warden: {
    dropChance: 0.8,
    potionChance: 0.5,
    gold: [20, 34],
    shards: [2, 4],
    entries: [
      { itemId: "warden-plate", weight: 22 },
      { itemId: "lantern-edge", weight: 18 },
      { itemId: "barrow-idol", weight: 14 },
      { itemId: "shade-wrap", weight: 20 },
    ],
  },
  lanternking: {
    dropChance: 0,
    potionChance: 1,
    gold: [160, 200],
    shards: [15, 15],
    entries: [],
    guaranteed: ["kingsbane", "lantern-crown"],
  },
  rootfather: { dropChance: 1, potionChance: 1, gold: [30, 40], shards: [3, 3], entries: [{ itemId: "bark-plated-vest", weight: 1 }] },
  drowned: {
    dropChance: 0.5,
    potionChance: 0.35,
    gold: [6, 14],
    shards: [0, 2],
    entries: [
      { itemId: "tidewrack-pearl", weight: 8 },
      { itemId: "hollow-pike", weight: 20 },
      { itemId: "bark-plated-vest", weight: 20 },
      { itemId: "hunters-band", weight: 14 },
    ],
  },
  tidebound: { dropChance: 1, potionChance: 1, gold: [50, 60], shards: [4, 4], entries: [{ itemId: "sentinel-cuirass", weight: 1 }] },
};

/** Location pools: the place you fight shapes what you find. */
export const REGION_LOOT: Record<string, LootEntry[]> = {
  woods: [
    { itemId: "bark-plated-vest", weight: 8 },
    { itemId: "hunters-band", weight: 6 },
  ],
  ruins: [
    { itemId: "sunstone-shard", weight: 6 },
    { itemId: "tidewrack-pearl", weight: 5 },
  ],
  shore: [
    { itemId: "tidewrack-pearl", weight: 6 },
    { itemId: "emberglass-charm", weight: 6 },
  ],
  barrow: [
    { itemId: "lantern-ring", weight: 6 },
    { itemId: "barrow-idol", weight: 4 },
  ],
};

export interface LootRoll {
  items: string[];
  potion: boolean;
  gold: number;
  shards: number;
}

function range(r: () => number, [a, b]: [number, number]) {
  return Math.floor(a + r() * (b - a + 1 - 1e-9));
}

/** Deterministic given `rand`. Unknown tables return nothing. */
export function rollLoot(enemyType: string, region: string | null, rand: () => number): LootRoll {
  const table = LOOT_TABLES[enemyType];
  if (!table) return { items: [], potion: false, gold: 0, shards: 0 };
  const gold = range(rand, table.gold);
  const shards = range(rand, table.shards);
  const potion = rand() < table.potionChance;
  const items = [...(table.guaranteed ?? [])];
  if (rand() < table.dropChance) {
    const pool = [...table.entries, ...((region && REGION_LOOT[region]) || [])];
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    let roll = rand() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) {
        items.push(entry.itemId);
        break;
      }
    }
  }
  return { items, potion, gold, shards };
}
