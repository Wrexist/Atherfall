// Pure homestead rules — no rendering, no store. Tested in tests/farm.test.ts.

import {
  BASE_PLOTS,
  CROPS,
  FOODS,
  MATERIALS,
  OFFLINE_CAP_SECONDS,
  PLOTS,
  RECIPES,
  cropForSeed,
  type RecipeDef,
} from "../data/farm";

export interface Plot {
  crop: string | null;
  /** Seconds of growth accumulated (never decreases). */
  grown: number;
}

export interface FarmState {
  plots: Plot[];
  materials: Record<string, number>;
  upgrades: string[];
}

export type Result<T> = { ok: true; value: T; message: string } | { ok: false; message: string };

export function emptyFarm(): FarmState {
  return { plots: PLOTS.map(() => ({ crop: null, grown: 0 })), materials: {}, upgrades: [] };
}

export function plotCount(f: Pick<FarmState, "upgrades">) {
  return f.upgrades.includes("raised-bed") ? PLOTS.length : BASE_PLOTS;
}

export function growthRate(f: Pick<FarmState, "upgrades">) {
  return f.upgrades.includes("trellis") ? 1.25 : 1;
}

export function plotReady(p: Plot) {
  const c = p.crop ? CROPS[p.crop] : null;
  return !!c && p.grown >= c.growSeconds;
}

export function secondsLeft(p: Plot, rate = 1) {
  const c = p.crop ? CROPS[p.crop] : null;
  if (!c) return 0;
  return Math.max(0, (c.growSeconds - p.grown) / rate);
}

/** Advance growth by `seconds` of time. Negative/NaN input is ignored. */
export function grow(f: FarmState, seconds: number): FarmState {
  if (!(seconds > 0)) return f;
  const rate = growthRate(f);
  let changed = false;
  const plots = f.plots.map((p) => {
    const c = p.crop ? CROPS[p.crop] : null;
    if (!c || p.grown >= c.growSeconds) return p;
    changed = true;
    return { ...p, grown: Math.min(c.growSeconds, p.grown + seconds * rate) };
  });
  return changed ? { ...f, plots } : f;
}

/**
 * Time that passed while the game was closed. A clock set backwards yields 0
 * (growth never reverses); a clock set far forwards is capped.
 */
export function offlineSeconds(savedAt: number, now: number) {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 0;
  return Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (now - savedAt) / 1000));
}

const add = (m: Record<string, number>, id: string, n: number) => {
  const next = { ...m, [id]: (m[id] ?? 0) + n };
  if (next[id]! <= 0) delete next[id];
  return next;
};

export function addMaterials(f: FarmState, gains: Record<string, number>): FarmState {
  let materials = f.materials;
  for (const [id, n] of Object.entries(gains)) if (MATERIALS[id]) materials = add(materials, id, n);
  return { ...f, materials };
}

export function plant(f: FarmState, plotIdx: number, seedId: string): Result<FarmState> {
  if (plotIdx < 0 || plotIdx >= plotCount(f)) return { ok: false, message: "That plot isn't tilled yet." };
  const plot = f.plots[plotIdx]!;
  if (plot.crop) return { ok: false, message: "Something is already growing there." };
  const crop = cropForSeed(seedId);
  if (!crop) return { ok: false, message: "That isn't a seed." };
  if ((f.materials[seedId] ?? 0) < 1) return { ok: false, message: `You have no ${MATERIALS[seedId]!.name}.` };
  const plots = f.plots.map((p, i) => (i === plotIdx ? { crop: crop.id, grown: 0 } : p));
  return { ok: true, value: { ...f, plots, materials: add(f.materials, seedId, -1) }, message: `Planted ${MATERIALS[crop.produce]!.name}.` };
}

/** `roll` values in [0,1) make yields deterministic in tests. */
export function harvest(f: FarmState, plotIdx: number, roll: () => number): Result<{ farm: FarmState; gained: Record<string, number> }> {
  const plot = f.plots[plotIdx];
  if (!plot || !plot.crop) return { ok: false, message: "Nothing is planted there." };
  if (!plotReady(plot)) return { ok: false, message: "Not ready yet." };
  const c = CROPS[plot.crop]!;
  const n = c.yield[0] + Math.floor(roll() * (c.yield[1] - c.yield[0] + 1));
  const gained: Record<string, number> = { [c.produce]: n };
  if (roll() < c.seedBack) gained[c.seed] = 1;
  const plots = f.plots.map((p, i) => (i === plotIdx ? { crop: null, grown: 0 } : p));
  const farm = addMaterials({ ...f, plots }, gained);
  const seedTxt = gained[c.seed] ? " and a seed" : "";
  return { ok: true, value: { farm, gained }, message: `Harvested ${n} ${MATERIALS[c.produce]!.name}${seedTxt}.` };
}

export interface Purse {
  gold: number;
  shards: number;
}

export function canCraft(f: FarmState, purse: Purse, r: RecipeDef): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [id, n] of Object.entries(r.cost)) {
    const have = f.materials[id] ?? 0;
    if (have < n) missing.push(`${n - have} ${MATERIALS[id]?.name ?? id}`);
  }
  if ((r.gold ?? 0) > purse.gold) missing.push(`${(r.gold ?? 0) - purse.gold} embers`);
  if ((r.shards ?? 0) > purse.shards) missing.push(`${(r.shards ?? 0) - purse.shards} shards`);
  if (r.output.kind === "upgrade" && f.upgrades.includes(r.output.id)) missing.push("already built");
  return { ok: missing.length === 0, missing };
}

export function craft(
  f: FarmState,
  purse: Purse,
  recipeId: string,
): Result<{ farm: FarmState; purse: Purse; potions: number }> {
  const r = RECIPES.find((x) => x.id === recipeId);
  if (!r) return { ok: false, message: "Unknown recipe." };
  const check = canCraft(f, purse, r);
  if (!check.ok) return { ok: false, message: `Need ${check.missing.join(", ")}.` };
  let materials = f.materials;
  for (const [id, n] of Object.entries(r.cost)) materials = add(materials, id, -n);
  let farm: FarmState = { ...f, materials };
  let potions = 0;
  if (r.output.kind === "material") farm = addMaterials(farm, { [r.output.id]: r.output.count });
  else if (r.output.kind === "potion") potions = r.output.count;
  else farm = { ...farm, upgrades: [...farm.upgrades, r.output.id] };
  return {
    ok: true,
    value: { farm, purse: { gold: purse.gold - (r.gold ?? 0), shards: purse.shards - (r.shards ?? 0) }, potions },
    message: `Crafted ${r.name}.`,
  };
}

export interface ActiveBuff {
  id: string;
  left: number;
}

export function eat(f: FarmState, foodId: string): Result<{ farm: FarmState; buff: ActiveBuff }> {
  const food = FOODS[foodId];
  if (!food) return { ok: false, message: "You can't eat that." };
  if ((f.materials[foodId] ?? 0) < 1) return { ok: false, message: `You have no ${food.name}.` };
  return {
    ok: true,
    value: { farm: { ...f, materials: add(f.materials, foodId, -1) }, buff: { id: foodId, left: food.seconds } },
    message: `You eat the ${food.name}.`,
  };
}

export function buffMultipliers(buff: ActiveBuff | null) {
  const food = buff && buff.left > 0 ? FOODS[buff.id] : null;
  return { damage: food?.damage ?? 1, taken: food?.taken ?? 1 };
}

/** Sell every sellable unit of one material. */
export function sell(f: FarmState, id: string, count: number): Result<{ farm: FarmState; gold: number }> {
  const def = MATERIALS[id];
  const have = f.materials[id] ?? 0;
  if (!def?.sell) return { ok: false, message: "The market crate won't take that." };
  const n = Math.min(have, Math.max(0, Math.floor(count)));
  if (n <= 0) return { ok: false, message: `You have no ${def.name}.` };
  return { ok: true, value: { farm: { ...f, materials: add(f.materials, id, -n) }, gold: n * def.sell }, message: `Sold ${n} ${def.name} for ${n * def.sell} embers.` };
}

/** Repair a farm read from a save: bad plots are cleared, never crash the game. */
export function repairFarm(raw: unknown): FarmState {
  const f = emptyFarm();
  if (!raw || typeof raw !== "object") return f;
  const r = raw as Partial<FarmState>;
  if (Array.isArray(r.plots))
    f.plots = f.plots.map((_, i) => {
      const p = r.plots![i] as Partial<Plot> | undefined;
      const crop = p && typeof p.crop === "string" && CROPS[p.crop] ? p.crop : null;
      const grown = crop && typeof p!.grown === "number" && Number.isFinite(p!.grown) ? Math.max(0, Math.min(CROPS[crop]!.growSeconds, p!.grown)) : 0;
      return { crop, grown };
    });
  if (r.materials && typeof r.materials === "object")
    for (const [id, n] of Object.entries(r.materials))
      if (MATERIALS[id] && typeof n === "number" && Number.isFinite(n) && n > 0) f.materials[id] = Math.floor(n);
  if (Array.isArray(r.upgrades)) f.upgrades = r.upgrades.filter((u): u is string => typeof u === "string" && ["raised-bed", "trellis", "collar"].includes(u));
  return f;
}
