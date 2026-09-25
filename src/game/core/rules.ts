// Pure progression rules: stats, items, forge, selling. No React, no store —
// everything here takes plain data and returns plain data, so it is testable.

import { ABILITY_UNLOCK_LEVELS, ARCHETYPES, type ArchetypeId } from "../data/archetypes";
import { ITEMS, MODIFIERS, SLOTS, type EquipSlot, type ItemDef, type ModifierId, type Rarity } from "../data/items";

export interface InvEntry {
  uid: string;
  itemId: string;
  /** Forge level, 0..FORGE.maxPlus */
  plus: number;
}

export type Equipped = Record<EquipSlot, InvEntry | null>;

export interface DerivedStats {
  attack: number;
  defense: number;
  maxHp: number;
  /** 0..1 */
  crit: number;
  mods: Partial<Record<ModifierId, number>>;
}

export interface ItemStats {
  attack: number;
  defense: number;
  health: number;
  crit: number;
}

export const EMPTY_EQUIPPED: Equipped = { weapon: null, armor: null, accessory: null, relic: null };
export const MAX_LEVEL = 12;

export function xpForLevel(level: number) {
  return Math.round(120 * Math.pow(level, 1.35));
}

// ---------------------------------------------------------------- forge rules

export const FORGE = {
  maxPlus: 5,
  /** Each + adds this fraction of the item's base stats (minimum +1 per stat it has). */
  perPlus: 0.12,
  goldBase: { common: 12, uncommon: 20, rare: 32, epic: 48 } as Record<Rarity, number>,
  shardBase: { common: 1, uncommon: 1, rare: 2, epic: 3 } as Record<Rarity, number>,
  /** Success chance when upgrading FROM this + level. */
  chance: [1, 1, 1, 0.75, 0.5],
  /** On failure: embers are spent, this fraction of shards is returned, the item is never lost. */
  failShardRefund: 0.5,
};

export function itemStats(def: ItemDef, plus = 0): ItemStats {
  const up = (v: number | undefined) => {
    if (!v) return 0;
    return v + Math.max(1, Math.round(v * FORGE.perPlus)) * plus;
  };
  return { attack: up(def.attack), defense: up(def.defense), health: up(def.health), crit: def.crit ?? 0 };
}

export function forgeCost(def: ItemDef, plus: number) {
  const step = plus + 1;
  return {
    gold: Math.round(FORGE.goldBase[def.rarity] * step * (1 + def.level * 0.15)),
    shards: FORGE.shardBase[def.rarity] * step,
    chance: FORGE.chance[plus] ?? 0,
  };
}

export interface ForgePreview {
  canUpgrade: boolean;
  reason?: string;
  from: ItemStats;
  to: ItemStats;
  cost: { gold: number; shards: number; chance: number };
}

export function forgePreview(entry: InvEntry, wallet: { gold: number; shards: number }): ForgePreview {
  const def = ITEMS[entry.itemId]!;
  const from = itemStats(def, entry.plus);
  if (entry.plus >= FORGE.maxPlus) {
    return { canUpgrade: false, reason: "Already at +5", from, to: from, cost: { gold: 0, shards: 0, chance: 0 } };
  }
  const cost = forgeCost(def, entry.plus);
  const to = itemStats(def, entry.plus + 1);
  let reason: string | undefined;
  if (wallet.gold < cost.gold) reason = `Need ${cost.gold - wallet.gold} more embers`;
  else if (wallet.shards < cost.shards) reason = `Need ${cost.shards - wallet.shards} more Aether Shards`;
  return { canUpgrade: !reason, ...(reason ? { reason } : {}), from, to, cost };
}

export interface ForgeResult {
  ok: boolean;
  success: boolean;
  entry: InvEntry;
  gold: number;
  shards: number;
  message: string;
}

/** Spend materials and attempt an upgrade. `roll` in [0,1). */
export function applyForge(entry: InvEntry, wallet: { gold: number; shards: number }, roll: number): ForgeResult {
  const p = forgePreview(entry, wallet);
  if (!p.canUpgrade) return { ok: false, success: false, entry, gold: wallet.gold, shards: wallet.shards, message: p.reason ?? "Cannot upgrade" };
  const success = roll < p.cost.chance;
  const def = ITEMS[entry.itemId]!;
  if (success) {
    return {
      ok: true,
      success: true,
      entry: { ...entry, plus: entry.plus + 1 },
      gold: wallet.gold - p.cost.gold,
      shards: wallet.shards - p.cost.shards,
      message: `${def.name} is now +${entry.plus + 1}`,
    };
  }
  const refund = Math.floor(p.cost.shards * FORGE.failShardRefund);
  return {
    ok: true,
    success: false,
    entry,
    gold: wallet.gold - p.cost.gold,
    shards: wallet.shards - p.cost.shards + refund,
    message: `The metal cracks — ${def.name} stays +${entry.plus}. ${refund} shard${refund === 1 ? "" : "s"} recovered.`,
  };
}

// ---------------------------------------------------------------- stats

export function statsFor(archetype: ArchetypeId, level: number, equipped: Equipped): DerivedStats {
  const a = ARCHETYPES[archetype] ?? ARCHETYPES.vanguard;
  const l = level - 1;
  let attack = a.base.attack + a.perLevel.attack * l;
  let defense = a.base.defense + a.perLevel.defense * l;
  let maxHp = a.base.maxHp + a.perLevel.maxHp * l;
  let crit = a.base.crit;
  const mods: Partial<Record<ModifierId, number>> = {};
  for (const slot of SLOTS) {
    const e = equipped[slot];
    const def = e ? ITEMS[e.itemId] : undefined;
    if (!e || !def) continue;
    const s = itemStats(def, e.plus);
    attack += s.attack;
    defense += s.defense;
    maxHp += s.health;
    crit += s.crit;
    if (def.mod) mods[def.mod] = (mods[def.mod] ?? 0) + MODIFIERS[def.mod].value;
  }
  if (mods.keen) crit += mods.keen * 100;
  return {
    attack: Math.round(attack),
    defense: Math.round(defense),
    maxHp: Math.round(maxHp),
    crit: Math.min(60, crit) / 100,
    mods,
  };
}

export function abilityUnlocked(level: number, index: number) {
  return level >= (ABILITY_UNLOCK_LEVELS[index] ?? 99);
}

// ---------------------------------------------------------------- inventory

export interface Bag {
  inventory: InvEntry[];
  equipped: Equipped;
  gold: number;
  shards: number;
  level: number;
}

export type TxResult = { ok: true; bag: Bag; message: string } | { ok: false; bag: Bag; message: string };

export function equipItem(bag: Bag, uid: string): TxResult {
  const entry = bag.inventory.find((i) => i.uid === uid);
  if (!entry) return { ok: false, bag, message: "Item not in satchel" };
  const def = ITEMS[entry.itemId];
  if (!def) return { ok: false, bag, message: "Unknown item" };
  if (bag.level < def.level) return { ok: false, bag, message: `Requires level ${def.level}` };
  const prev = bag.equipped[def.slot];
  const inventory = bag.inventory.filter((i) => i.uid !== uid);
  if (prev) inventory.push(prev);
  return { ok: true, bag: { ...bag, inventory, equipped: { ...bag.equipped, [def.slot]: entry } }, message: `Equipped ${def.name}` };
}

export function unequipItem(bag: Bag, slot: EquipSlot): TxResult {
  const prev = bag.equipped[slot];
  if (!prev) return { ok: false, bag, message: "Nothing equipped" };
  return { ok: true, bag: { ...bag, inventory: [...bag.inventory, prev], equipped: { ...bag.equipped, [slot]: null } }, message: "Unequipped" };
}

const SELL_BASE: Record<Rarity, number> = { common: 6, uncommon: 14, rare: 32, epic: 70 };
const SALVAGE_BASE: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 4, epic: 7 };

export function sellValue(entry: InvEntry) {
  const def = ITEMS[entry.itemId]!;
  return Math.round(SELL_BASE[def.rarity] * (1 + def.level * 0.2) + entry.plus * 8);
}

export function salvageValue(entry: InvEntry) {
  const def = ITEMS[entry.itemId]!;
  return SALVAGE_BASE[def.rarity] + entry.plus;
}

/** Sell or salvage many satchel items at once. Equipped items are never touched. */
export function batchDispose(bag: Bag, uids: string[], mode: "sell" | "salvage"): TxResult {
  const set = new Set(uids);
  const picked = bag.inventory.filter((i) => set.has(i.uid));
  if (!picked.length) return { ok: false, bag, message: "Nothing selected" };
  const total = picked.reduce((sum, e) => sum + (mode === "sell" ? sellValue(e) : salvageValue(e)), 0);
  const inventory = bag.inventory.filter((i) => !set.has(i.uid));
  const next: Bag = {
    ...bag,
    inventory,
    gold: bag.gold + (mode === "sell" ? total : 0),
    shards: bag.shards + (mode === "salvage" ? total : 0),
  };
  return {
    ok: true,
    bag: next,
    message: mode === "sell" ? `Sold ${picked.length} item(s) for ${total} embers` : `Salvaged ${picked.length} item(s) into ${total} Aether Shards`,
  };
}

/** Stat deltas if `entry` replaced what is in its slot now. */
export function compareToEquipped(archetype: ArchetypeId, level: number, equipped: Equipped, entry: InvEntry) {
  const def = ITEMS[entry.itemId]!;
  const now = statsFor(archetype, level, equipped);
  const after = statsFor(archetype, level, { ...equipped, [def.slot]: entry });
  return {
    now,
    after,
    delta: {
      attack: after.attack - now.attack,
      defense: after.defense - now.defense,
      maxHp: after.maxHp - now.maxHp,
      crit: Math.round((after.crit - now.crit) * 100),
    },
    replaces: equipped[def.slot],
  };
}
