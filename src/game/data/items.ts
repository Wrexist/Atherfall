// Item definitions. Pure data: tweak freely without touching rendering code.

export type Rarity = "common" | "uncommon" | "rare" | "epic";
export type EquipSlot = "weapon" | "armor" | "trinket";

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  attack?: number;
  defense?: number;
  health?: number;
  flavor: string;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#cbbfa6",
  uncommon: "#8fd18a",
  rare: "#7fc4ef",
  epic: "#d8a44f",
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Radiant",
};

export const ITEMS: Record<string, ItemDef> = {
  "wayfarer-blade": {
    id: "wayfarer-blade",
    name: "Wayfarer Blade",
    slot: "weapon",
    rarity: "common",
    attack: 4,
    flavor: "Notched from a hundred road-side scuffles.",
  },
  "thorn-cleaver": {
    id: "thorn-cleaver",
    name: "Thorn Cleaver",
    slot: "weapon",
    rarity: "uncommon",
    attack: 9,
    flavor: "Bramble sap has hardened along the edge.",
  },
  "hollow-pike": {
    id: "hollow-pike",
    name: "Hollow Pike",
    slot: "weapon",
    rarity: "uncommon",
    attack: 11,
    defense: 1,
    flavor: "Taken from a sentinel that no longer needed it.",
  },
  "dawnreach-longsword": {
    id: "dawnreach-longsword",
    name: "Dawnreach Longsword",
    slot: "weapon",
    rarity: "rare",
    attack: 17,
    health: 10,
    flavor: "Forged the year the falling star lit the bay.",
  },
  "thornmaw-fang": {
    id: "thornmaw-fang",
    name: "Thornmaw Fang",
    slot: "weapon",
    rarity: "epic",
    attack: 26,
    health: 15,
    flavor: "Still warm. Still hungry.",
  },
  "woven-jerkin": {
    id: "woven-jerkin",
    name: "Woven Jerkin",
    slot: "armor",
    rarity: "common",
    defense: 3,
    health: 10,
    flavor: "Village weave, stubborn as the folk who made it.",
  },
  "bark-plated-vest": {
    id: "bark-plated-vest",
    name: "Bark-Plated Vest",
    slot: "armor",
    rarity: "uncommon",
    defense: 7,
    health: 20,
    flavor: "Whisperpine bark, cured in hearth smoke.",
  },
  "sentinel-cuirass": {
    id: "sentinel-cuirass",
    name: "Sentinel Cuirass",
    slot: "armor",
    rarity: "rare",
    defense: 13,
    health: 35,
    flavor: "Cold to the touch, even at noon.",
  },
  "emberglass-charm": {
    id: "emberglass-charm",
    name: "Emberglass Charm",
    slot: "trinket",
    rarity: "uncommon",
    health: 25,
    flavor: "Warms when danger is near. It is often warm.",
  },
  "tidewrack-pearl": {
    id: "tidewrack-pearl",
    name: "Tidewrack Pearl",
    slot: "trinket",
    rarity: "rare",
    attack: 5,
    health: 30,
    flavor: "Washed up the night the sky cracked.",
  },
};

export function itemPower(def: ItemDef): number {
  return (def.attack ?? 0) * 2 + (def.defense ?? 0) * 2 + (def.health ?? 0) * 0.5;
}
