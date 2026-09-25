// Player combat tuning. Pure data — edit numbers here, not in the simulation.

export interface SwingDef {
  /** Total swing length in seconds. */
  duration: number;
  /** When the active hit window opens (seconds from swing start). */
  hitAt: number;
  /** How long the hit window stays open. Each enemy can be hit once per swing. */
  hitWindow: number;
  damageMult: number;
  range: number;
  /** Minimum dot(facing, toEnemy). 1 = dead ahead only, -1 = full circle. */
  minDot: number;
  /** Forward lunge speed applied at swing start (m/s). */
  lunge: number;
  /** Hit-pause length on a confirmed hit. */
  hitstop: number;
  knockback: number;
  staggers: boolean;
  clipSpeed: number;
}

/** Three-hit basic chain: two quick cuts, then a wide spinning finisher. */
export const SWINGS: SwingDef[] = [
  { duration: 0.4, hitAt: 0.13, hitWindow: 0.07, damageMult: 1.0, range: 3.1, minDot: 0.35, lunge: 3.4, hitstop: 0.045, knockback: 0.45, staggers: false, clipSpeed: 1.9 },
  { duration: 0.4, hitAt: 0.13, hitWindow: 0.07, damageMult: 1.15, range: 3.1, minDot: 0.35, lunge: 3.4, hitstop: 0.05, knockback: 0.5, staggers: false, clipSpeed: 1.9 },
  { duration: 0.62, hitAt: 0.25, hitWindow: 0.09, damageMult: 1.9, range: 3.7, minDot: -0.3, lunge: 5.5, hitstop: 0.09, knockback: 1.7, staggers: true, clipSpeed: 1.3 },
];

/** Press attack again within this window after a swing ends to continue the chain. */
export const COMBO_GRACE = 0.4;
/** Earliest point (fraction of a swing) at which the next press is buffered. */
export const COMBO_BUFFER_FROM = 0.3;
/** Pause after the finisher before a new chain can start. */
export const CHAIN_RECOVERY = 0.22;

export const DODGE = {
  duration: 0.36,
  /** Invulnerable window from the start of the dodge. */
  iframes: 0.24,
  speed: 15,
  cooldown: 1.2,
};

export type AbilityId = "galestep" | "emberburst" | "barkward";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  purpose: "mobility" | "area" | "defense";
  key: string;
  cooldown: number;
  /** Unlocks when the starter quest reaches this step index (or is complete). */
  unlockStep: number;
  unlockHint: string;
  description: string;
}

export const ABILITIES: AbilityDef[] = [
  {
    id: "galestep",
    name: "Gale Step",
    purpose: "mobility",
    key: "1",
    cooldown: 7,
    unlockStep: 2,
    unlockHint: "Enter Whisperpine",
    description: "Dash forward through danger. Foes near where you land are slowed.",
  },
  {
    id: "emberburst",
    name: "Emberburst",
    purpose: "area",
    key: "2",
    cooldown: 9,
    unlockStep: 3,
    unlockHint: "Cull three Bramblekin",
    description: "Slam the ground, burning and knocking back everything around you.",
  },
  {
    id: "barkward",
    name: "Bark Ward",
    purpose: "defense",
    key: "3",
    cooldown: 16,
    unlockStep: 4,
    unlockHint: "Arm yourself",
    description: "For 4 seconds, take 60% less damage and regenerate health.",
  },
];

export const GALE = { distance: 8, duration: 0.22, slowRadius: 3.4, slowFor: 2.5, slowFactor: 0.45 };
export const BURST = { radius: 4.3, damageMult: 1.6, knockback: 2.6, castTime: 0.38, hitAt: 0.18 };
export const WARD = { duration: 4, damageTaken: 0.4, healFraction: 0.2 };

export function abilityUnlocked(def: AbilityDef, questStep: number, questComplete: boolean) {
  return questComplete || questStep >= def.unlockStep;
}
