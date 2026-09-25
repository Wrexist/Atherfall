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
/**
 * How long an attack / dodge / ability press is remembered if it can't happen
 * yet (too early in a swing, dodge on cooldown, mid-cast). It then fires the
 * moment it's allowed — so taps are never silently eaten.
 */
export const INPUT_BUFFER = 0.18;
/** Pause after the finisher before a new chain can start. */
export const CHAIN_RECOVERY = 0.22;

export const DODGE = {
  duration: 0.36,
  /** Invulnerable window from the start of the dodge. */
  iframes: 0.24,
  speed: 15,
  cooldown: 1.2,
};

export type AbilityId =
  | "galestep"
  | "emberburst"
  | "barkward"
  | "vault"
  | "arrowrain"
  | "secondwind"
  | "blink"
  | "frostnova"
  | "aegis";

export type AbilityEffect =
  | { kind: "dash"; distance: number; duration: number; slowRadius: number }
  | { kind: "leap"; distance: number; duration: number; slowRadius: number }
  | { kind: "blink"; distance: number }
  | { kind: "burst"; radius: number; damageMult: number; knockback: number; slowFor: number; color: string }
  | { kind: "rain"; radius: number; reach: number; ticks: number[]; damageMult: number }
  | { kind: "ward"; duration: number; damageTaken: number; healFraction: number }
  | { kind: "heal"; fraction: number; hasteFor: number; haste: number }
  | { kind: "shield"; fraction: number; duration: number };

export interface AbilityDef {
  id: AbilityId;
  name: string;
  purpose: "mobility" | "area" | "defense";
  cooldown: number;
  description: string;
  effect: AbilityEffect;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  // Vanguard
  galestep: { id: "galestep", name: "Gale Step", purpose: "mobility", cooldown: 7, description: "Dash forward through danger. Foes near where you land are slowed.", effect: { kind: "dash", distance: 8, duration: 0.22, slowRadius: 3.4 } },
  emberburst: { id: "emberburst", name: "Emberburst", purpose: "area", cooldown: 9, description: "Slam the ground, burning and knocking back everything around you.", effect: { kind: "burst", radius: 4.3, damageMult: 1.6, knockback: 2.6, slowFor: 0, color: "#ffb45a" } },
  barkward: { id: "barkward", name: "Bark Ward", purpose: "defense", cooldown: 16, description: "For 4 seconds, take 60% less damage and regenerate 20% health.", effect: { kind: "ward", duration: 4, damageTaken: 0.4, healFraction: 0.2 } },
  // Ranger
  vault: { id: "vault", name: "Vault", purpose: "mobility", cooldown: 6, description: "Leap 7m backwards, untouchable, slowing foes you leave behind.", effect: { kind: "leap", distance: 7, duration: 0.35, slowRadius: 3.6 } },
  arrowrain: { id: "arrowrain", name: "Arrow Rain", purpose: "area", cooldown: 9, description: "Arrows fall three times on the marked circle ahead of you.", effect: { kind: "rain", radius: 3.6, reach: 8, ticks: [0.45, 0.8, 1.15], damageMult: 0.75 } },
  secondwind: { id: "secondwind", name: "Second Wind", purpose: "defense", cooldown: 16, description: "Instantly heal 25% health and move 30% faster for 4 seconds.", effect: { kind: "heal", fraction: 0.25, hasteFor: 4, haste: 0.3 } },
  // Arcanist
  blink: { id: "blink", name: "Blink", purpose: "mobility", cooldown: 7, description: "Teleport 9m forward, passing through attacks.", effect: { kind: "blink", distance: 9 } },
  frostnova: { id: "frostnova", name: "Frost Nova", purpose: "area", cooldown: 10, description: "Freeze the air around you: damage, interrupt and slow every foe for 3s.", effect: { kind: "burst", radius: 4.8, damageMult: 1.4, knockback: 0.5, slowFor: 3, color: "#9fd8ff" } },
  aegis: { id: "aegis", name: "Aegis", purpose: "defense", cooldown: 16, description: "A barrier absorbs damage equal to 35% of your health for 5s.", effect: { kind: "shield", fraction: 0.35, duration: 5 } },
};

export const GALE = { slowFor: 2.5, slowFactor: 0.45 };
export const BURST = { castTime: 0.38, hitAt: 0.18 };

/** Ranged basic attacks. Each shot registers at most once per enemy. */
export const SHOTS = {
  arrow: { duration: [0.34, 0.34, 0.5], mult: [0.85, 0.85, 1.35], speed: 34, range: 22, pierce: [false, false, true], radius: 0, color: "#f3e4c8" },
  bolt: { duration: [0.44, 0.44, 0.62], mult: [0.95, 0.95, 1.6], speed: 21, range: 17, pierce: [false, false, false], radius: 2.1, color: "#b9a4ff" },
} as const;
