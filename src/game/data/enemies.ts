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
}

export const ENEMIES: Record<string, EnemyDef> = {
  bramblekin: {
    id: "bramblekin",
    name: "Bramblekin",
    model: "/models/gy/character-zombie.glb",
    scale: 2.0,
    maxHp: 46,
    damage: 9,
    attackRange: 2.2,
    aggroRange: 13,
    leashRange: 26,
    speed: 3.6,
    windup: 0.55,
    recover: 0.7,
    xp: 22,
    lootTable: "bramblekin",
    tint: "#7fa55a",
    respawnDelay: 28,
  },
  sentinel: {
    id: "sentinel",
    name: "Hollow Sentinel",
    model: "/models/gy/character-skeleton.glb",
    scale: 2.5,
    maxHp: 90,
    damage: 17,
    attackRange: 2.9,
    aggroRange: 15,
    leashRange: 30,
    speed: 2.6,
    windup: 1.0,
    recover: 1.0,
    xp: 45,
    lootTable: "sentinel",
    tint: "#cfd6de",
    respawnDelay: 40,
  },
  thornmaw: {
    id: "thornmaw",
    name: "Thornmaw, the Root-Crowned",
    model: "/models/gy/character-vampire.glb",
    scale: 3.4,
    maxHp: 320,
    damage: 24,
    attackRange: 4.0,
    aggroRange: 20,
    leashRange: 40,
    speed: 4.2,
    windup: 0.85,
    recover: 0.9,
    xp: 260,
    lootTable: "thornmaw",
    tint: "#8b5e3c",
    boss: true,
    respawnDelay: 9999,
  },
};
