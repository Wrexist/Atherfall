import { QUESTS } from "../data/quests";
import { NPCS, SPAWNS } from "../world/layout";
import { REGIONS } from "../world/terrain";
import { world } from "./sim";
import { useGame } from "./store";

/**
 * Where the current quest step wants the player to go: the NPC to talk to, the
 * area to reach, or the nearest living enemy to defeat (its spawn if none is up).
 * Null when the step has no place (e.g. "equip a weapon") or all quests are done.
 */
export function questTarget(): { x: number; z: number } | null {
  const s = useGame.getState();
  if (s.questComplete) return null;
  const step = QUESTS[s.questIdx]?.steps[s.questStep];
  if (!step) return null;
  if (step.kind === "talk") {
    const npc = NPCS.find((n) => n.id === step.npc);
    return npc ? { x: npc.x, z: npc.z } : null;
  }
  if (step.kind === "reach") {
    const r = REGIONS[step.area as keyof typeof REGIONS];
    return r ? { x: r.x, z: r.z } : null;
  }
  if (step.kind === "kill" || step.kind === "boss") {
    const p = world.player;
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.type !== step.enemy || e.phase === "dead") continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = { x: e.x, z: e.z };
      }
    }
    if (best) return best;
    const sp = SPAWNS.find((x) => x.type === step.enemy);
    return sp ? { x: sp.x, z: sp.z } : null;
  }
  return null;
}
