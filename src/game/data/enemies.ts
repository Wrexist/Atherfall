// Enemy archetypes. Pure data.

export interface EnemyDef {
  id: string;
  name: string;
  model: string;
  /** Uniform scale applied to the loaded GLB (models are ~0.8 units tall). */
  scale: number;
  /** Displayed level; also the codex's danger rating. */
  level: number;
  /** Short codex entry. */
  lore: string;
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
    level: 1,
    lore: "Root-and-thorn walkers that crawled out of Whisperpine after the sky cracked. Quick swipes in a short cone.",
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
    level: 3,
    lore: "Hollow armour animated by old oaths. Slow, but its ground slam lands a few steps ahead of it.",
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
    level: 4,
    lore: "A root-crowned tyrant of the Sunken Arch. Sweeps, charges, and when wounded, makes the ground erupt.",
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
  shade: {
    id: "shade",
    name: "Barrow Shade",
    model: "/models/dng/character-orc.glb",
    scale: 2.2,
    level: 5,
    lore: "What is left of those buried with the Lantern King. Fast and relentless, with a wide swipe.",
    maxHp: 95,
    damage: 15,
    attackRange: 2.4,
    aggroRange: 10,
    leashRange: 22,
    speed: 4.3,
    windup: 0.55,
    recover: 0.6,
    xp: 60,
    lootTable: "shade",
    tint: "#6d6aa8",
    respawnDelay: 45,
    zone: { kind: "cone", radius: 3.1, arc: 2.2 },
  },
  warden: {
    id: "warden",
    name: "Lantern Warden",
    model: "/models/gy/character-skeleton.glb",
    scale: 2.7,
    level: 6,
    lore: "Bone guards that still carry their lanterns. Their slams hit hard and wide — never stand in front.",
    maxHp: 190,
    damage: 26,
    attackRange: 3.1,
    aggroRange: 11,
    leashRange: 22,
    speed: 2.8,
    windup: 1.0,
    recover: 0.9,
    xp: 95,
    lootTable: "warden",
    tint: "#e8c36a",
    respawnDelay: 60,
    zone: { kind: "circle", radius: 2.8, offset: 2.2 },
  },
  lanternking: {
    id: "lanternking",
    name: "The Lantern King",
    model: "/models/gy/character-vampire.glb",
    scale: 3.8,
    level: 7,
    lore: "Buried with his court and his light. Awake again, and furious about it.",
    maxHp: 720,
    damage: 30,
    attackRange: 4.4,
    aggroRange: 18,
    leashRange: 30,
    speed: 4.4,
    windup: 0.8,
    recover: 1.1,
    xp: 600,
    lootTable: "lanternking",
    tint: "#3d5a8a",
    boss: true,
    respawnDelay: 9999,
    zone: { kind: "cone", radius: 5.6, arc: 2.6 },
  },
};

/** Checked lookup: throws on unknown ids so data typos surface immediately. */
export function enemyDef(id: string): EnemyDef {
  const d = ENEMIES[id];
  if (!d) throw new Error(`Unknown enemy type: ${id}`);
  return d;
}
