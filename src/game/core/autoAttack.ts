// Auto-attack, like mobile action RPGs (Eternal Hero): walk into reach of an
// enemy and the hero turns to it and swings; stand still in a fight and the
// hero keeps swinging. Kept free of the game state so it can be tested.

export type AttackKind = "melee" | "arrow" | "bolt";

/**
 * How far auto-attack reaches, metres. Melee: the sword's reach plus a lunge.
 * Ranged: shorter than manual aim, so the hero doesn't start fights across the
 * screen on its own.
 */
export const AUTO_RANGE: Record<AttackKind, number> = { melee: 3.6, arrow: 11, bolt: 10 };

export interface AutoCandidate {
  id: string;
  x: number;
  z: number;
  hp: number;
  phase: string;
}

/**
 * The enemy to fight: the locked target if it's in reach, else the nearest
 * living enemy in reach (any direction), else none.
 */
export function pickAutoTarget<T extends AutoCandidate>(
  px: number,
  pz: number,
  enemies: readonly T[],
  range: number,
  lockedId: string | null,
): T | null {
  let best: T | null = null;
  let bestD = range;
  for (const e of enemies) {
    if (e.hp <= 0 || e.phase === "dead") continue;
    const d = Math.hypot(e.x - px, e.z - pz);
    if (d > range) continue;
    if (e.id === lockedId) return e;
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Whether to swing on our own: walking into reach always does; standing still
 * only while a fight is on (so idle heroes don't pick fights with sleeping
 * enemies they're just looking at).
 */
export function shouldAutoAttack(hasTarget: boolean, moving: boolean, inCombat: boolean) {
  return hasTarget && (moving || inCombat);
}
