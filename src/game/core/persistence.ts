// Versioned local save with forward migration. Older saves are upgraded in
// place (and the original is kept as a backup); newer/unknown versions are
// refused rather than half-loaded.

import type { ArchetypeId } from "../data/archetypes";
import { ITEMS, type EquipSlot } from "../data/items";
import type { Equipped, InvEntry } from "./rules";

export const SAVE_KEY = "aetherfall.save";
export const SAVE_VERSION = 2;

export type Quality = "low" | "medium" | "high";

export interface Codex {
  /** enemy type → times defeated */
  kills: Record<string, number>;
  /** enemy types encountered (aggroed) */
  seen: string[];
  places: string[];
  items: string[];
}

export interface SaveFile {
  v: 2;
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number };
  archetype: ArchetypeId;
  hp: number;
  level: number;
  xp: number;
  gold: number;
  shards: number;
  potions: number;
  inventory: InvEntry[];
  equipped: Equipped;
  questIdx: number;
  questStep: number;
  questKills: number;
  questComplete: boolean;
  barrowUnlocked: boolean;
  codex: Codex;
  /** Added after v2 shipped; optional so earlier v2 saves still load. */
  waypoints?: string[];
  secrets?: string[];
  landmarks?: string[];
  deaths: number;
  kills: number;
  elapsed: number;
  defeated: string[];
  quality: Quality;
  muted: boolean;
}

/** Shape written by version 1 of the game. */
export interface SaveFileV1 {
  v: 1;
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number };
  hp: number;
  level: number;
  xp: number;
  gold: number;
  potions: number;
  inventory: Array<{ uid: string; itemId: string }>;
  equipped: { weapon: string | null; armor: string | null; trinket: string | null };
  questStep: number;
  questKills: number;
  questComplete: boolean;
  shoreUnlocked: boolean;
  deaths: number;
  kills: number;
  elapsed: number;
  defeated: string[];
  quality: Quality;
  muted: boolean;
}

export function emptyCodex(): Codex {
  return { kills: {}, seen: [], places: [], items: [] };
}

let migrateUid = 0;
function uid() {
  migrateUid += 1;
  return `m${migrateUid}`;
}

export function migrateV1(old: SaveFileV1): SaveFile {
  const known = (id: string | null | undefined): id is string => !!id && !!ITEMS[id];
  const equipped: Equipped = { weapon: null, armor: null, accessory: null, relic: null };
  const map: Array<[keyof SaveFileV1["equipped"], EquipSlot]> = [
    ["weapon", "weapon"],
    ["armor", "armor"],
    ["trinket", "accessory"],
  ];
  for (const [from, to] of map) {
    const id = old.equipped?.[from];
    if (known(id)) equipped[to] = { uid: uid(), itemId: id, plus: 0 };
  }
  const inventory: InvEntry[] = (old.inventory ?? []).filter((i) => known(i.itemId)).map((i) => ({ uid: i.uid || uid(), itemId: i.itemId, plus: 0 }));
  const codex = emptyCodex();
  codex.items = Array.from(new Set([...inventory.map((i) => i.itemId), ...Object.values(equipped).flatMap((e) => (e ? [e.itemId] : []))]));
  codex.places = ["village"];
  if (old.questStep >= 2 || old.questComplete) codex.places.push("woods");
  if (old.questStep >= 5 || old.questComplete) codex.places.push("ruins");
  if (old.questStep >= 3 || old.questComplete) {
    codex.seen.push("bramblekin");
    codex.kills["bramblekin"] = 3;
  }
  if ((old.defeated ?? []).includes("boss") || old.questComplete) {
    codex.seen.push("thornmaw");
    codex.kills["thornmaw"] = 1;
  }
  return {
    v: 2,
    savedAt: old.savedAt,
    player: old.player,
    archetype: "vanguard",
    hp: old.hp,
    level: old.level,
    xp: old.xp,
    gold: old.gold,
    shards: old.questComplete ? 6 : 0,
    potions: old.potions,
    inventory,
    equipped,
    // A finished starter quest moves straight on to the Barrow quest.
    questIdx: old.questComplete ? 1 : 0,
    questStep: old.questComplete ? 0 : old.questStep,
    questKills: old.questComplete ? 0 : old.questKills,
    questComplete: false,
    barrowUnlocked: !!(old.questComplete || old.shoreUnlocked),
    codex,
    deaths: old.deaths ?? 0,
    kills: old.kills ?? 0,
    elapsed: old.elapsed ?? 0,
    defeated: old.defeated ?? [],
    quality: old.quality ?? "medium",
    muted: !!old.muted,
  };
}

/** Upgrade any known save shape to the current version. */
export function migrateSave(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as { v?: unknown }).v;
  if (v === SAVE_VERSION) return raw as SaveFile;
  if (v === 1) return migrateV1(raw as SaveFileV1);
  return null;
}

export function readSave(): SaveFile | null {
  if (typeof window === "undefined") return null;
  try {
    const text = window.localStorage.getItem(SAVE_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as { v?: number };
    const save = migrateSave(parsed);
    if (save && parsed.v !== SAVE_VERSION) {
      window.localStorage.setItem(`${SAVE_KEY}.v${parsed.v}.bak`, text);
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    }
    return save;
  } catch {
    return null;
  }
}

export function writeSave(save: SaveFile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage full or blocked — gameplay continues without saving */
  }
}

export function clearSaveStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
