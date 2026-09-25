// Item definitions. Pure data: tweak freely without touching rendering code.

export type Rarity = "common" | "uncommon" | "rare" | "epic";
export type EquipSlot = "weapon" | "armor" | "accessory" | "relic";
export const SLOTS: EquipSlot[] = ["weapon", "armor", "accessory", "relic"];
export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Weapon",
  armor: "Armor",
  accessory: "Accessory",
  relic: "Relic",
};

export type ModifierId = "lifesteal" | "swift" | "focus" | "thorns" | "bounty" | "keen";

export interface ModifierDef {
  id: ModifierId;
  name: string;
  /** Exact, player-facing effect. Numbers here are the ones the sim uses. */
  text: string;
  value: number;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  lifesteal: { id: "lifesteal", name: "Lifedrinker", text: "Heal for 6% of damage you deal", value: 0.06 },
  swift: { id: "swift", name: "Swift", text: "+10% movement speed", value: 0.1 },
  focus: { id: "focus", name: "Focused", text: "Ability cooldowns 15% shorter", value: 0.15 },
  thorns: { id: "thorns", name: "Thorned", text: "Reflect 40% of damage taken to the attacker", value: 0.4 },
  bounty: { id: "bounty", name: "Bountiful", text: "+25% embers from foes", value: 0.25 },
  keen: { id: "keen", name: "Keen", text: "+8% critical chance", value: 0.08 },
};

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  /** Character level required to equip. */
  level: number;
  attack?: number;
  defense?: number;
  health?: number;
  /** Critical chance in percentage points. */
  crit?: number;
  mod?: ModifierId;
  /** Boss rewards: never drop from ordinary foes. */
  boss?: boolean;
  flavor: string;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#c3cbd6",
  uncommon: "#6ee06a",
  rare: "#4fb0ff",
  epic: "#ffb23f",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Radiant",
};

export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic"];

const list: ItemDef[] = [
  // ---- Weapons
  { id: "wayfarer-blade", name: "Wayfarer Blade", slot: "weapon", rarity: "common", level: 1, attack: 4, flavor: "Notched from a hundred road-side scuffles." },
  { id: "thorn-cleaver", name: "Thorn Cleaver", slot: "weapon", rarity: "uncommon", level: 2, attack: 8, flavor: "Bramble sap has hardened along the edge." },
  { id: "hollow-pike", name: "Hollow Pike", slot: "weapon", rarity: "uncommon", level: 3, attack: 11, defense: 1, flavor: "Taken from a sentinel that no longer needed it." },
  { id: "dawnreach-longsword", name: "Dawnreach Longsword", slot: "weapon", rarity: "rare", level: 4, attack: 16, health: 10, mod: "keen", flavor: "Forged the year the falling star lit the bay." },
  { id: "thornmaw-fang", name: "Thornmaw Fang", slot: "weapon", rarity: "epic", level: 4, attack: 22, health: 15, mod: "lifesteal", boss: true, flavor: "Still warm. Still hungry." },
  { id: "barrow-glaive", name: "Barrow Glaive", slot: "weapon", rarity: "uncommon", level: 5, attack: 19, flavor: "Lantern soot never quite washes off." },
  { id: "lantern-edge", name: "Lantern Edge", slot: "weapon", rarity: "rare", level: 6, attack: 26, crit: 3, mod: "focus", flavor: "A wick burns in the fuller and never goes out." },
  { id: "kingsbane", name: "Kingsbane", slot: "weapon", rarity: "epic", level: 7, attack: 34, health: 30, mod: "lifesteal", boss: true, flavor: "Taken from a crown that ruled only the dark." },
  // ---- Armor
  { id: "woven-jerkin", name: "Woven Jerkin", slot: "armor", rarity: "common", level: 1, defense: 3, health: 10, flavor: "Village weave, stubborn as the folk who made it." },
  { id: "bark-plated-vest", name: "Bark-Plated Vest", slot: "armor", rarity: "uncommon", level: 2, defense: 6, health: 20, flavor: "Whisperpine bark, cured in hearth smoke." },
  { id: "sentinel-cuirass", name: "Sentinel Cuirass", slot: "armor", rarity: "rare", level: 3, defense: 11, health: 30, mod: "thorns", flavor: "Cold to the touch, even at noon." },
  { id: "shade-wrap", name: "Shade Wrap", slot: "armor", rarity: "uncommon", level: 5, defense: 13, health: 40, flavor: "Woven from something that was mostly shadow." },
  { id: "warden-plate", name: "Warden Plate", slot: "armor", rarity: "rare", level: 6, defense: 19, health: 60, mod: "thorns", flavor: "Every dent is a promise it kept." },
  // ---- Accessories
  { id: "emberglass-charm", name: "Emberglass Charm", slot: "accessory", rarity: "uncommon", level: 1, health: 25, flavor: "Warms when danger is near. It is often warm." },
  { id: "hunters-band", name: "Hunter's Band", slot: "accessory", rarity: "uncommon", level: 2, attack: 2, crit: 4, flavor: "Braided from bowstring and luck." },
  { id: "tidewrack-pearl", name: "Tidewrack Pearl", slot: "accessory", rarity: "rare", level: 3, attack: 4, health: 30, mod: "bounty", flavor: "Washed up the night the sky cracked." },
  { id: "lantern-ring", name: "Lantern Ring", slot: "accessory", rarity: "rare", level: 5, attack: 7, health: 35, mod: "swift", flavor: "Its glow leans toward the exit." },
  // ---- Relics
  { id: "sunstone-shard", name: "Sunstone Shard", slot: "relic", rarity: "rare", level: 3, defense: 4, health: 30, flavor: "A splinter of the falling star, still humming." },
  { id: "barrow-idol", name: "Barrow Idol", slot: "relic", rarity: "rare", level: 5, attack: 6, defense: 5, mod: "lifesteal", flavor: "Its eyes follow whoever holds it." },
  { id: "thornmaw-heartseed", name: "Thornmaw Heartseed", slot: "relic", rarity: "epic", level: 4, attack: 6, health: 40, mod: "focus", boss: true, flavor: "It beats, slowly, when you are in danger." },
  { id: "lantern-crown", name: "Crown of the Lantern King", slot: "relic", rarity: "epic", level: 7, attack: 12, defense: 8, health: 60, mod: "swift", boss: true, flavor: "Heavier than it looks. Lighter than it should be." },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}
