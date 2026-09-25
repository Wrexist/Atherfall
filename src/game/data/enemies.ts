// Enemy archetypes. Pure data.

export interface EnemyDef {
  id: string;
  name: string;
  model: string;
  /** Uniform scale applied to the loaded GLB (models are ~0.8 units tall). */
  scale: number;
  maxHp: number;
  damage: number;
  /** Distance at which the enemy can land a hit. */
  attackRange: number;
  aggroRange: number;
  leashRange: number;
  speed: number;
  /** Telegraph duration in seconds before the hit lands. */
  windup: number;
  /** Recovery after the swing. */
  recover: number;
  xp: number;
  lootTable: string;
  tint?: string;
  boss?: boolean;
  respawnDelay: number;
  /** Shape of the telegraphed attack zone drawn on the ground. */
  zone: { kind: "cone"; radius: number; arc: number } | { kind: "circle"; radius: number; offset: number };
}

export const ENEMIES: Record<string, EnemyDef> = {
  bramblekin: {
    id: "bramblekin",
    name: "Bramblekin",
    model: "/models/gy/character-zombie.glb",
    scale: 2.0,
    maxHp: 40,
    damage: 7,
    attackRange: 2.2,
    aggroRange: 9,
    leashRange: 24,
    speed: 3.6,
    windup: 0.6,
    recover: 0.7,
    xp: 22,
    lootTable: "bramblekin",
    tint: "#7fa55a",
    respawnDelay: 28,
    zone: { kind: "cone", radius: 2.9, arc: 1.9 },
  },
  sentinel: {
    id: "sentinel",
    name: "Hollow Sentinel",
    model: "/models/gy/character-skeleton.glb",
    scale: 2.5,
    maxHp: 90,
    damage: 17,
    attackRange: 2.9,
    aggroRange: 11,
    leashRange: 30,
    speed: 2.6,
    windup: 1.0,
    recover: 1.0,
    xp: 45,
    lootTable: "sentinel",
    tint: "#cfd6de",
    respawnDelay: 40,
    zone: { kind: "circle", radius: 2.4, offset: 2.0 },
  },
  thornmaw: {
    id: "thornmaw",
    name: "Thornmaw, the Root-Crowned",
    model: "/models/gy/character-vampire.glb",
    scale: 3.4,
    maxHp: 240,
    damage: 18,
    attackRange: 4.0,
    aggroRange: 20,
    leashRange: 40,
    speed: 4.2,
    windup: 0.85,
    recover: 1.2,
    xp: 260,
    lootTable: "thornmaw",
    tint: "#8b5e3c",
    boss: true,
    respawnDelay: 9999,
    zone: { kind: "cone", radius: 5.2, arc: 2.6 },
  },
};

/** Checked lookup: throws on unknown ids so data typos surface immediately. */
export function enemyDef(id: string): EnemyDef {
  const d = ENEMIES[id];
  if (!d) throw new Error(`Unknown enemy type: ${id}`);
  return d;
}
