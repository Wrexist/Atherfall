// Homestead content: seeds, crops, pantry goods, bench recipes, farm quests
// and the companion. Everything here is plain data — balance it without
// touching rendering or simulation code.

export const HOMESTEAD = { x: 18, z: 28, radius: 11 } as const;
/** Soil plots, laid out in front of the cottage. The 4th unlocks via a recipe. */
export const PLOTS: Array<{ x: number; z: number }> = [
  { x: 14.5, z: 31 },
  { x: 17.5, z: 31 },
  { x: 20.5, z: 31 },
  { x: 23.5, z: 31 },
];
export const BASE_PLOTS = 3;
export const BENCH = { x: 22.5, z: 25 } as const;
export const OSWIN = { x: 13.5, z: 25.5 } as const;
/** Offline growth is capped; a skewed clock can only ever finish crops, never break a save. */
export const OFFLINE_CAP_SECONDS = 6 * 3600;

export type MaterialKind = "seed" | "crop" | "food" | "tonic" | "trade";

export interface MaterialDef {
  id: string;
  name: string;
  kind: MaterialKind;
  /** Where it comes from — shown in the pantry. */
  source: string;
  /** What it's for — shown in the pantry. */
  use: string;
  /** Embers paid per unit at the homestead market crate (trade goods and spare crops). */
  sell?: number;
  color: string;
}

export interface CropDef {
  id: string;
  seed: string;
  produce: string;
  /** Seconds of growth. Growth continues while you adventure and while the game is closed. */
  growSeconds: number;
  yield: [number, number];
  /** Chance to get a seed back on harvest. */
  seedBack: number;
  color: string;
}

export const MATERIALS: Record<string, MaterialDef> = {
  "emberroot-seed": {
    id: "emberroot-seed",
    name: "Emberroot Seed",
    kind: "seed",
    source: "Bramblekin drops (Whisperpine), the Hollow Stump cache, Oswin's first quest.",
    use: "Plant at your homestead. Grows Emberroot in 1.5 minutes.",
    color: "#d9703f",
  },
  "mistbloom-seed": {
    id: "mistbloom-seed",
    name: "Mistbloom Seed",
    kind: "seed",
    source: "Drowned drops (Tidewrack Shore), shard crystals, the Gull Rock wreck.",
    use: "Plant at your homestead. Grows Mistbloom in 2.5 minutes.",
    color: "#8fb8d8",
  },
  "sunwheat-seed": {
    id: "sunwheat-seed",
    name: "Sunwheat Seed",
    kind: "seed",
    source: "Hollow Sentinel drops (ruins road), the Watchstone hoard, Oswin's second quest.",
    use: "Plant at your homestead. Grows Sunwheat in 4 minutes.",
    color: "#e2c15a",
  },
  emberroot: {
    id: "emberroot",
    name: "Emberroot",
    kind: "crop",
    source: "Harvested from Emberroot plots.",
    use: "Cooking: Emberroot Stew (damage). Alchemy: Hearthward Broth.",
    sell: 4,
    color: "#d9703f",
  },
  mistbloom: {
    id: "mistbloom",
    name: "Mistbloom",
    kind: "crop",
    source: "Harvested from Mistbloom plots.",
    use: "Alchemy: Sunbloom Draught, Hearthward Broth, Burr's Collar.",
    sell: 6,
    color: "#8fb8d8",
  },
  sunwheat: {
    id: "sunwheat",
    name: "Sunwheat",
    kind: "trade",
    source: "Harvested from Sunwheat plots.",
    use: "Trade good: sells for 14 embers. Building: Raised Bed, Trellis.",
    sell: 14,
    color: "#e2c15a",
  },
  "ember-stew": {
    id: "ember-stew",
    name: "Emberroot Stew",
    kind: "food",
    source: "Crafted at the homestead bench.",
    use: "Eat before a fight: +20% damage for 3 minutes. One meal active at a time.",
    color: "#c9562e",
  },
  "hearth-broth": {
    id: "hearth-broth",
    name: "Hearthward Broth",
    kind: "food",
    source: "Crafted at the homestead bench.",
    use: "Eat before a fight: take 20% less damage for 3 minutes. One meal active at a time.",
    color: "#b58a5a",
  },
};

export const CROPS: Record<string, CropDef> = {
  emberroot: { id: "emberroot", seed: "emberroot-seed", produce: "emberroot", growSeconds: 90, yield: [2, 3], seedBack: 0.6, color: "#d9703f" },
  mistbloom: { id: "mistbloom", seed: "mistbloom-seed", produce: "mistbloom", growSeconds: 150, yield: [2, 3], seedBack: 0.5, color: "#8fb8d8" },
  sunwheat: { id: "sunwheat", seed: "sunwheat-seed", produce: "sunwheat", growSeconds: 240, yield: [3, 4], seedBack: 0.5, color: "#e2c15a" },
};

export function cropForSeed(seedId: string) {
  return Object.values(CROPS).find((c) => c.seed === seedId) ?? null;
}

export interface FoodBuff {
  id: string;
  name: string;
  seconds: number;
  /** Multiplies damage you deal. */
  damage?: number;
  /** Multiplies damage you take. */
  taken?: number;
}

export const FOODS: Record<string, FoodBuff> = {
  "ember-stew": { id: "ember-stew", name: "Emberroot Stew", seconds: 180, damage: 1.2 },
  "hearth-broth": { id: "hearth-broth", name: "Hearthward Broth", seconds: 180, taken: 0.8 },
};

export type RecipeOutput =
  | { kind: "material"; id: string; count: number }
  | { kind: "potion"; count: number }
  | { kind: "upgrade"; id: string };

export interface RecipeDef {
  id: string;
  name: string;
  desc: string;
  cost: Record<string, number>;
  gold?: number;
  shards?: number;
  output: RecipeOutput;
}

export const UPGRADES: Record<string, string> = {
  "raised-bed": "Raised Bed — a 4th farm plot",
  trellis: "Trellis — crops grow 25% faster",
  collar: "Burr's Collar — companion ability recharges 30% faster",
};

export const RECIPES: RecipeDef[] = [
  { id: "ember-stew", name: "Emberroot Stew", desc: "+20% damage for 3 min.", cost: { emberroot: 2 }, output: { kind: "material", id: "ember-stew", count: 1 } },
  { id: "hearth-broth", name: "Hearthward Broth", desc: "Take 20% less damage for 3 min.", cost: { emberroot: 1, mistbloom: 1 }, output: { kind: "material", id: "hearth-broth", count: 1 } },
  { id: "draught", name: "Sunbloom Draught", desc: "A healing draught (Q). Heals 45% of max health.", cost: { mistbloom: 2 }, output: { kind: "potion", count: 1 } },
  { id: "raised-bed", name: "Raised Bed", desc: "Adds a 4th plot. One-time.", cost: { sunwheat: 4 }, gold: 40, output: { kind: "upgrade", id: "raised-bed" } },
  { id: "trellis", name: "Trellis", desc: "All crops grow 25% faster. One-time.", cost: { sunwheat: 3, emberroot: 2 }, output: { kind: "upgrade", id: "trellis" } },
  { id: "collar", name: "Burr's Collar", desc: "Companion ability recharges 30% faster. One-time.", cost: { mistbloom: 3 }, shards: 4, output: { kind: "upgrade", id: "collar" } },
];

/** Seed drop chances per enemy type (rolled on each kill). */
export const SEED_DROPS: Record<string, { seed: string; chance: number }> = {
  bramblekin: { seed: "emberroot-seed", chance: 0.35 },
  drowned: { seed: "mistbloom-seed", chance: 0.4 },
  sentinel: { seed: "sunwheat-seed", chance: 0.35 },
  shade: { seed: "mistbloom-seed", chance: 0.25 },
  thornmaw: { seed: "sunwheat-seed", chance: 1 },
};
/** Exploration: chance a shard crystal also yields a seed; secret caches' seed gifts. */
export const CRYSTAL_SEED = { seed: "mistbloom-seed", chance: 0.3 };
export const SECRET_SEEDS: Record<string, Record<string, number>> = {
  "hollow-stump": { "emberroot-seed": 3 },
  "watchstone-hoard": { "sunwheat-seed": 3 },
  "gull-wreck": { "mistbloom-seed": 3 },
};

// ---- Companion -----------------------------------------------------------
export const COMPANION = {
  name: "Burr",
  kind: "thistle-fox",
  modes: {
    combat: {
      label: "Pounce",
      desc: "Burr leaps at the nearest enemy within 12 m: 80% of your attack and a 2 s stagger.",
      cooldown: 20,
      range: 12,
      damageMult: 0.8,
    },
    gather: {
      label: "Forage",
      desc: "Burr fetches all loot within 14 m and digs up a random seed.",
      cooldown: 40,
      range: 14,
    },
  },
} as const;
export type CompanionMode = keyof typeof COMPANION.modes;

// ---- Farm quests (a side line from Oswin; never blocks the main story) ----
export type FarmStep =
  | { kind: "talk"; title: string; hint: string }
  | { kind: "plant"; title: string; hint: string }
  | { kind: "kill"; enemy: string; count: number; title: string; hint: string }
  | { kind: "harvest"; title: string; hint: string }
  | { kind: "craft"; recipe: string; title: string; hint: string }
  | { kind: "eat"; title: string; hint: string }
  | { kind: "fedKills"; count: number; title: string; hint: string };

export interface FarmQuestDef {
  id: string;
  name: string;
  intro: string[];
  steps: FarmStep[];
  outro: string;
  reward: { gold: number; xp: number; materials: Record<string, number>; homestead?: boolean; companion?: boolean; text: string };
}

export const FARM_QUESTS: FarmQuestDef[] = [
  {
    id: "a-plot-of-your-own",
    name: "A Plot of Your Own",
    intro: [
      "Oswin: Warden Sela says you're staying. Good — a hero who eats well lives longer.",
      "That cottage and its plots are yours. Here's a pouch of Emberroot seed. Plant one, then go earn your supper while it grows.",
    ],
    steps: [
      { kind: "plant", title: "Plant a seed at your homestead", hint: "Stand by a soil plot and press E (or open the Homestead tab, H)." },
      { kind: "kill", enemy: "bramblekin", count: 3, title: "While it grows: cull 3 Bramblekin", hint: "They chew the seedlings. Whisperpine Woods, north of the village." },
      { kind: "harvest", title: "Harvest your crop", hint: "Ready plots glow. Emberroot takes 1.5 minutes." },
      { kind: "talk", title: "Show Oswin your harvest", hint: "He waits by your homestead gate." },
    ],
    outro: "Oswin: Now that's a root with some fire in it. Take the sunwheat seed — sell the grain, keep the gold.",
    reward: { gold: 30, xp: 80, materials: { "sunwheat-seed": 2, "mistbloom-seed": 2 }, homestead: true, text: "30 embers, 2 Sunwheat & 2 Mistbloom seeds" },
  },
  {
    id: "fed-for-the-fight",
    name: "Fed for the Fight",
    intro: [
      "Oswin: Anyone can swing a blade. Swinging it on a full belly — that's craft.",
      "Cook an Emberroot Stew at the bench, eat it, and go test it on something that bites back.",
    ],
    steps: [
      { kind: "craft", recipe: "ember-stew", title: "Cook Emberroot Stew at the bench", hint: "Two Emberroot. The bench is beside the cottage." },
      { kind: "eat", title: "Eat the stew", hint: "Homestead tab (H) → Pantry → Eat, or press F." },
      { kind: "fedKills", count: 3, title: "Defeat 3 enemies while well fed", hint: "Any foe counts while your meal lasts." },
      { kind: "talk", title: "Return to Oswin", hint: "Your homestead gate." },
    ],
    outro: "Oswin: Thought so. This little one's been sniffing round your plots all week — Burr's decided you're his. He's handy in a scrap, or with a nose for loot.",
    reward: { gold: 40, xp: 140, materials: { "emberroot-seed": 2, "sunwheat-seed": 1 }, companion: true, text: "40 embers, seeds, and Burr the thistle-fox joins you" },
  },
];
