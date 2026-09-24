// Versioned local save. Bump SAVE_VERSION when the shape changes; unknown or
// older versions are discarded rather than half-loaded.

import type { EquipSlot } from "../data/items";
import { useGame, type InvEntry, type Quality } from "./store";

export const SAVE_KEY = "aetherfall.save";
export const SAVE_VERSION = 1;

export interface SaveFile {
  v: number;
  savedAt: number;
  player: { x: number; y: number; z: number; yaw: number };
  hp: number;
  level: number;
  xp: number;
  gold: number;
  potions: number;
  inventory: InvEntry[];
  equipped: Record<EquipSlot, string | null>;
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

export function readSave(): SaveFile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveFile;
    if (!parsed || parsed.v !== SAVE_VERSION) return null;
    return parsed;
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

export function clearSave() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  useGame.setState({ hasSave: false });
}
