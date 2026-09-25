// Playable archetypes. Pure data — the simulation reads these numbers.

import type { AbilityId } from "./combat";

export type ArchetypeId = "vanguard" | "ranger" | "arcanist";
export type BasicAttack = "melee" | "arrow" | "bolt";

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  role: string;
  description: string;
  model: string;
  tint?: string;
  basic: BasicAttack;
  base: { attack: number; defense: number; maxHp: number; crit: number };
  perLevel: { attack: number; defense: number; maxHp: number };
  moveMult: number;
  /** Ability ids in unlock order; unlock levels come from ABILITY_UNLOCK_LEVELS. */
  abilities: [AbilityId, AbilityId, AbilityId];
}

export const ABILITY_UNLOCK_LEVELS: [number, number, number] = [2, 3, 4];

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    role: "Front-line bruiser",
    description: "Three-hit sword chain with a spinning finisher. Toughest and most forgiving.",
    model: "/models/mini/hero.glb",
    basic: "melee",
    base: { attack: 7, defense: 3, maxHp: 110, crit: 5 },
    perLevel: { attack: 2, defense: 1.2, maxHp: 20 },
    moveMult: 1,
    abilities: ["galestep", "emberburst", "barkward"],
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    role: "Mobile marksman",
    description: "Fires arrows from range; the third shot pierces. Fastest and hits critically most often.",
    model: "/models/mini/ranger.glb",
    basic: "arrow",
    base: { attack: 6, defense: 2, maxHp: 92, crit: 14 },
    perLevel: { attack: 2.1, defense: 0.8, maxHp: 15 },
    moveMult: 1.1,
    abilities: ["vault", "arrowrain", "secondwind"],
  },
  arcanist: {
    id: "arcanist",
    name: "Arcanist",
    role: "Area caster",
    description: "Hurls exploding bolts that hit groups. Fragile, but abilities hit hardest.",
    model: "/models/mini/arcanist.glb",
    basic: "bolt",
    base: { attack: 8, defense: 2, maxHp: 86, crit: 7 },
    perLevel: { attack: 2.4, defense: 0.7, maxHp: 14 },
    moveMult: 1,
    abilities: ["blink", "frostnova", "aegis"],
  },
};

export const ARCHETYPE_LIST: ArchetypeDef[] = [ARCHETYPES.vanguard, ARCHETYPES.ranger, ARCHETYPES.arcanist];
