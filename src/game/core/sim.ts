// Game simulation. Plain mutable state stepped from a single useFrame call.
// Nothing here imports React: rendering reads these objects each frame.
// Randomness comes from a seeded generator so combat runs are reproducible.

import {
  ABILITIES,
  BURST,
  CHAIN_RECOVERY,
  COMBO_BUFFER_FROM,
  COMBO_GRACE,
  DODGE,
  GALE,
  SHOTS,
  SWINGS,
  type AbilityId,
} from "../data/combat";
import { ABILITY_UNLOCK_LEVELS, ARCHETYPES } from "../data/archetypes";
import { QUESTS } from "../data/quests";
import { abilityUnlocked } from "./rules";
import { enemyDef } from "../data/enemies";
import { rollLoot } from "../data/loot";
import { ITEMS } from "../data/items";
import { BARROW_GATE, COLLIDERS, NPCS, SPAWNS } from "../world/layout";
import { REGIONS, clampToWorld, heightAt, mulberry32, regionAt } from "../world/terrain";
import { sfx } from "./audio";
import { input } from "./input";
import { readSave, writeSave, SAVE_VERSION, type SaveFile } from "./persistence";
import { statsFor, useGame } from "./store";

export type EnemyPhase =
  | "idle"
  | "chase"
  | "windup"
  | "strike"
  | "recover"
  | "return"
  | "stagger"
  | "charge"
  | "roar"
  | "dead";

export type Zone =
  | { kind: "cone"; x: number; z: number; yaw: number; r: number; arc: number }
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "line"; x: number; z: number; yaw: number; len: number; w: number };

export type BossMove = "cleave" | "charge" | "roots";

export interface EnemyRuntime {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  phase: EnemyPhase;
  timer: number;
  homeX: number;
  homeZ: number;
  homeYaw: number;
  hitFlash: number;
  /** 0..1 progress of the current windup. */
  telegraph: number;
  windupTotal: number;
  struck: boolean;
  respawnIn: number;
  anim: string;
  speed: number;
  aggro: boolean;
  /** Locked-in danger zones for the current windup/strike. */
  zones: Zone[];
  slowT: number;
  bossPhase: 1 | 2;
  moveIdx: number;
  move: BossMove | null;
  chargeLeft: number;
}

export interface DropRuntime {
  id: number;
  x: number;
  y: number;
  z: number;
  itemId?: string | undefined;
  potion: boolean;
  gold: number;
  shards: number;
  born: number;
  taken: boolean;
}

export interface SparkRuntime {
  id: number;
  x: number;
  y: number;
  z: number;
  born: number;
  color: string;
  size: number;
  ring: boolean;
  life: number;
}

export interface FloaterRuntime {
  id: number;
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  big: boolean;
  born: number;
}

export type PlayerAction = "none" | "attack" | "dodge" | "gale" | "burst" | "ward-cast";

export interface ProjectileRuntime {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  travelled: number;
  range: number;
  damage: number;
  crit: boolean;
  pierce: boolean;
  radius: number;
  color: string;
  hit: Set<string>;
  big: boolean;
}

export interface RainRuntime {
  x: number;
  z: number;
  r: number;
  born: number;
  ticks: number[];
  next: number;
  mult: number;
}

export interface PlayerRuntime {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  anim: string;
  /** Increments whenever a one-shot animation should restart. */
  animKey: number;
  speedMag: number;
  action: PlayerAction;
  actionT: number;
  comboIdx: number;
  comboBuffered: boolean;
  lastSwingEnd: number;
  attackCooldown: number;
  hitIds: Set<string>;
  swingSerial: number;
  dodgeCd: number;
  dodgeIframe: number;
  dodgeDirX: number;
  dodgeDirZ: number;
  cooldowns: Record<AbilityId, number>;
  wardT: number;
  shieldHp: number;
  shieldT: number;
  hasteT: number;
  /** Ability driving the current dash/leap/burst action. */
  abilityId: AbilityId | null;
  hurtT: number;
  invuln: number;
  hitFlash: number;
  dead: boolean;
  deathTimer: number;
  stepAcc: number;
}

export const SPAWN_POINT = { x: 0, z: 12 };

function freshPlayer(): PlayerRuntime {
  return {
    x: SPAWN_POINT.x,
    y: heightAt(SPAWN_POINT.x, SPAWN_POINT.z),
    z: SPAWN_POINT.z,
    yaw: Math.PI,
    vx: 0,
    vz: 0,
    vy: 0,
    grounded: true,
    coyote: 0,
    jumpBuffer: 0,
    anim: "idle",
    animKey: 0,
    speedMag: 0,
    action: "none",
    actionT: 0,
    comboIdx: 0,
    comboBuffered: false,
    lastSwingEnd: -10,
    attackCooldown: 0,
    hitIds: new Set(),
    swingSerial: 0,
    dodgeCd: 0,
    dodgeIframe: 0,
    dodgeDirX: 0,
    dodgeDirZ: 1,
    cooldowns: { galestep: 0, emberburst: 0, barkward: 0, vault: 0, arrowrain: 0, secondwind: 0, blink: 0, frostnova: 0, aegis: 0 },
    wardT: 0,
    shieldHp: 0,
    shieldT: 0,
    hasteT: 0,
    abilityId: null,
    hurtT: 0,
    invuln: 0,
    hitFlash: 0,
    dead: false,
    deathTimer: 0,
    stepAcc: 0,
  };
}

export const world = {
  time: 0,
  player: freshPlayer(),
  enemies: [] as EnemyRuntime[],
  drops: [] as DropRuntime[],
  sparks: [] as SparkRuntime[],
  floaters: [] as FloaterRuntime[],
  projectiles: [] as ProjectileRuntime[],
  rains: [] as RainRuntime[],
  defeated: new Set<string>(),
  cameraShake: 0,
  /** Remaining hit-pause; the simulation freezes while > 0. */
  hitstop: 0,
  /** Counters exposed for tests. */
  stats: { swings: 0, hits: 0, evades: 0 },
};

let dropId = 0;
let sparkId = 0;
let floaterId = 0;
let projectileId = 0;
export const SEED = 20260925;
let rand: () => number = mulberry32(SEED);
let saveTimer = 0;
let unlockedCount = -1;

const WALK = 5.6;
const SPRINT = 9.2;
const GRAVITY = -26;
const JUMP_V = 9.4;
const ACCEL = 13;
const DECEL = 11;
const AIR_CONTROL = 3;
const TURN = 18;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;

function makeEnemy(spawn: (typeof SPAWNS)[number]): EnemyRuntime {
  const def = enemyDef(spawn.type);
  return {
    id: spawn.id,
    type: spawn.type,
    x: spawn.x,
    y: heightAt(spawn.x, spawn.z),
    z: spawn.z,
    yaw: spawn.yaw,
    hp: def.maxHp,
    maxHp: def.maxHp,
    phase: "idle",
    timer: 0,
    homeX: spawn.x,
    homeZ: spawn.z,
    homeYaw: spawn.yaw,
    hitFlash: 0,
    telegraph: 0,
    windupTotal: def.windup,
    struck: false,
    respawnIn: 0,
    anim: "idle",
    speed: def.speed,
    aggro: false,
    zones: [],
    slowT: 0,
    bossPhase: 1,
    moveIdx: 0,
    move: null,
    chargeLeft: 0,
  };
}

export function initWorld(save: SaveFile | null) {
  rand = mulberry32(SEED);
  world.time = 0;
  world.hitstop = 0;
  world.drops.length = 0;
  world.sparks.length = 0;
  world.floaters.length = 0;
  world.projectiles.length = 0;
  world.rains.length = 0;
  world.stats = { swings: 0, hits: 0, evades: 0 };
  world.defeated = new Set(save?.defeated ?? []);
  world.enemies = SPAWNS.map(makeEnemy);
  for (const e of world.enemies) {
    if (enemyDef(e.type).boss && world.defeated.has(e.id)) {
      e.phase = "dead";
      e.hp = 0;
      e.respawnIn = 99999;
    }
  }
  const p = freshPlayer();
  p.x = save?.player.x ?? SPAWN_POINT.x;
  p.z = save?.player.z ?? SPAWN_POINT.z;
  p.y = heightAt(p.x, p.z);
  p.yaw = save?.player.yaw ?? Math.PI;
  world.player = p;
  input.yaw = p.yaw + Math.PI;
  input.pitch = 0.34;
  unlockedCount = -1;
}

function angleLerp(from: number, to: number, k: number) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * k;
}

export function snapshot(): SaveFile {
  const s = useGame.getState();
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    player: { x: world.player.x, y: world.player.y, z: world.player.z, yaw: world.player.yaw },
    archetype: s.archetype,
    hp: s.hp,
    level: s.level,
    xp: s.xp,
    gold: s.gold,
    shards: s.shards,
    potions: s.potions,
    inventory: s.inventory,
    equipped: s.equipped,
    questIdx: s.questIdx,
    questStep: s.questStep,
    questKills: s.questKills,
    questComplete: s.questComplete,
    barrowUnlocked: s.barrowUnlocked,
    codex: s.codex,
    deaths: s.deaths,
    kills: s.kills,
    elapsed: s.elapsed,
    defeated: Array.from(world.defeated),
    quality: s.quality,
    muted: s.muted,
  };
}

export function saveNow() {
  writeSave(snapshot());
  useGame.setState({ hasSave: true });
}

export function loadSaveIntoStore(): SaveFile | null {
  const save = readSave();
  if (!save) return null;
  useGame.getState().hydrate({
    archetype: save.archetype,
    hp: save.hp,
    level: save.level,
    xp: save.xp,
    gold: save.gold,
    shards: save.shards,
    potions: save.potions,
    inventory: save.inventory,
    equipped: save.equipped,
    questIdx: save.questIdx,
    questStep: save.questStep,
    questKills: save.questKills,
    questComplete: save.questComplete,
    barrowUnlocked: save.barrowUnlocked,
    codex: save.codex,
    deaths: save.deaths,
    kills: save.kills,
    elapsed: save.elapsed,
    hasSave: true,
  });
  return save;
}

function resolveCollisions(pos: { x: number; z: number }, radius: number) {
  // Two passes so being wedged between neighbouring colliders (fence posts,
  // cottage corners) resolves instead of jittering in place.
  const gateShut = !useGame.getState().barrowUnlocked;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of gateShut ? [...COLLIDERS, BARROW_GATE] : COLLIDERS) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }
  clampToWorld(pos);
}

/** True when a solid collider (cottage, wall, rock, tree) sits between two points. */
export function lineBlocked(ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz || 1e-6;
  for (const c of COLLIDERS) {
    if (c.r < 0.9) continue; // thin posts / NPCs don't block swings
    // Ignore colliders that contain either endpoint (already overlapping)
    if (Math.hypot(ax - c.x, az - c.z) < c.r || Math.hypot(bx - c.x, bz - c.z) < c.r) continue;
    const t = Math.max(0, Math.min(1, ((c.x - ax) * vx + (c.z - az) * vz) / len2));
    const px = ax + vx * t - c.x;
    const pz = az + vz * t - c.z;
    if (px * px + pz * pz < c.r * c.r * 0.8) return true;
  }
  return false;
}

function killPlayer() {
  const p = world.player;
  p.dead = true;
  p.deathTimer = 0;
  p.anim = "die";
  sfx.death();
  const store = useGame.getState();
  useGame.setState({ deaths: store.deaths + 1, screen: "dead", bossBar: null, inventoryOpen: false });
  saveNow();
}

export function respawnPlayer() {
  const store = useGame.getState();
  const stats = statsFor(store);
  const p = world.player;
  p.x = SPAWN_POINT.x;
  p.z = SPAWN_POINT.z;
  p.y = heightAt(p.x, p.z);
  p.vy = 0;
  p.dead = false;
  p.anim = "idle";
  p.action = "none";
  p.vx = 0;
  p.vz = 0;
  p.comboIdx = 0;
  p.invuln = 1.5;
  store.setHp(Math.round(stats.maxHp * 0.6));
  useGame.setState({ screen: "playing" });
  for (const e of world.enemies) {
    if (e.phase !== "dead") {
      e.zones = [];
      e.phase = "return";
      e.aggro = false;
    }
  }
  saveNow();
}

function playerHasWeapon() {
  const s = useGame.getState();
  if (s.equipped.weapon) return true;
  if (s.inventory.some((i) => ITEMS[i.itemId]?.slot === "weapon")) return true;
  return world.drops.some((d) => !d.taken && d.itemId && ITEMS[d.itemId]?.slot === "weapon");
}

function pushDrop(x: number, z: number, part: Partial<DropRuntime>) {
  dropId += 1;
  world.drops.push({ id: dropId, x, y: heightAt(x, z), z, potion: false, gold: 0, shards: 0, born: world.time, taken: false, ...part });
}

function dropLoot(enemy: EnemyRuntime) {
  const def = enemyDef(enemy.type);
  const loot = rollLoot(def.lootTable, regionAt(enemy.x, enemy.z), rand);
  // The starter quest requires equipping a weapon: guarantee the first one.
  if (!def.boss && !playerHasWeapon() && !loot.items.some((id) => ITEMS[id]?.slot === "weapon")) loot.items.unshift("wayfarer-blade");
  const bounty = statsFor(useGame.getState()).mods.bounty ?? 0;
  const gold = Math.round(loot.gold * (1 + bounty));
  pushDrop(enemy.x, enemy.z, { potion: loot.potion, gold, shards: loot.shards, itemId: loot.items[0] });
  loot.items.slice(1).forEach((itemId, i) => {
    const a = (i + 1) * 2.1;
    pushDrop(enemy.x + Math.cos(a) * 1.4, enemy.z + Math.sin(a) * 1.4, { itemId });
  });
}

function killEnemy(enemy: EnemyRuntime) {
  const def = enemyDef(enemy.type);
  enemy.phase = "dead";
  enemy.hp = 0;
  enemy.anim = "die";
  enemy.aggro = false;
  enemy.respawnIn = def.respawnDelay;
  world.defeated.add(enemy.id);
  dropLoot(enemy);
  sfx.enemyDown();
  const store = useGame.getState();
  store.addXp(def.xp);
  store.registerKill(enemy.type);
  if (def.boss) {
    useGame.setState({ bossBar: null });
    store.toast(`${def.name} falls! Boss reward dropped.`, "quest");
    spark(enemy.x, enemy.y + 0.2, enemy.z, "#ffd27a", 7, true, 1.1);
  }
  saveNow();
}

function spark(x: number, y: number, z: number, color: string, size = 0.45, ring = false, life = 0.45) {
  sparkId += 1;
  world.sparks.push({ id: sparkId, x, y, z, born: world.time, color, size, ring, life });
  if (world.sparks.length > 32) world.sparks.shift();
}

function floater(x: number, y: number, z: number, text: string, color: string, big = false) {
  floaterId += 1;
  world.floaters.push({ id: floaterId, x, y, z, text, color, big, born: world.time });
  if (world.floaters.length > 14) world.floaters.shift();
}

export function pointInZone(zone: Zone, px: number, pz: number, pad = 0.35) {
  const dx = px - zone.x;
  const dz = pz - zone.z;
  if (zone.kind === "circle") return Math.hypot(dx, dz) <= zone.r + pad;
  if (zone.kind === "cone") {
    const d = Math.hypot(dx, dz);
    if (d > zone.r + pad) return false;
    if (d < 0.9) return true;
    const ang = Math.atan2(dx, dz);
    let diff = ang - zone.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= zone.arc / 2 + 0.08;
  }
  const fx = Math.sin(zone.yaw);
  const fz = Math.cos(zone.yaw);
  const along = dx * fx + dz * fz;
  const side = Math.abs(dx * fz - dz * fx);
  return along >= -0.5 && along <= zone.len + pad && side <= zone.w / 2 + pad;
}

function damagePlayer(amount: number, fromX: number, fromZ: number, attacker?: EnemyRuntime) {
  const store = useGame.getState();
  const p = world.player;
  if (p.dead) return;
  if (p.dodgeIframe > 0 || p.action === "gale") {
    world.stats.evades += 1;
    floater(p.x, p.y + 2.6, p.z, "Evaded", "#bfe6ff");
    sfx.evade();
    return;
  }
  if (p.invuln > 0) return;
  const stats = statsFor(store);
  let dealt = Math.max(2, Math.round(amount - stats.defense * 0.45));
  if (p.wardT > 0) dealt = Math.max(1, Math.round(dealt * 0.4));
  if (p.shieldHp > 0) {
    const absorbed = Math.min(p.shieldHp, dealt);
    p.shieldHp -= absorbed;
    dealt -= absorbed;
    if (p.shieldHp <= 0) p.shieldT = 0;
    if (dealt <= 0) {
      floater(p.x, p.y + 2.5, p.z, "Absorbed", "#b9a4ff");
      sfx.evade();
      return;
    }
  }
  if (attacker && stats.mods.thorns) {
    const reflect = Math.max(1, Math.round(dealt * stats.mods.thorns));
    damageEnemy(attacker, reflect, { knock: 0, stagger: false, big: false });
  }
  const hp = Math.max(0, store.hp - dealt);
  store.setHp(hp);
  p.invuln = 0.45;
  p.hitFlash = 0.3;
  p.hurtT = 0.28;
  // Knock back away from the source, and interrupt swings (not dodges).
  const dx = p.x - fromX;
  const dz = p.z - fromZ;
  const d = Math.hypot(dx, dz) || 1;
  p.vx = (dx / d) * 7;
  p.vz = (dz / d) * 7;
  if (p.action === "attack" || p.action === "burst" || p.action === "ward-cast") {
    p.action = "none";
    p.comboIdx = 0;
    p.comboBuffered = false;
  }
  world.cameraShake = 0.45;
  world.hitstop = Math.max(world.hitstop, 0.06);
  floater(p.x, p.y + 2.5, p.z, `-${dealt}`, p.wardT > 0 ? "#c9d9a0" : "#ff7a66");
  spark(p.x, p.y + 1.2, p.z, "#ff6b5a", 0.4);
  sfx.hurt();
  if (hp <= 0) killPlayer();
}

/** Roll a player hit: attack × multiplier, small variance, crit chance from stats. */
function playerHit(mult: number) {
  const stats = statsFor(useGame.getState());
  const crit = rand() < stats.crit;
  const dmg = Math.round(stats.attack * mult * (0.92 + rand() * 0.16) * (crit ? 1.6 : 1));
  return { dmg, crit };
}

function damageEnemy(
  e: EnemyRuntime,
  amount: number,
  opts: { knock: number; stagger: boolean; big: boolean; crit?: boolean; slowFor?: number },
) {
  const def = enemyDef(e.type);
  if (e.phase === "dead" || e.phase === "roar") return false;
  const p = world.player;
  e.hp -= amount;
  e.hitFlash = 0.22;
  e.aggro = true;
  if (opts.slowFor) e.slowT = Math.max(e.slowT, opts.slowFor);
  world.stats.hits += 1;
  const store = useGame.getState();
  const steal = statsFor(store).mods.lifesteal ?? 0;
  if (steal > 0 && !p.dead) {
    const max = statsFor(store).maxHp;
    store.setHp(Math.min(max, store.hp + amount * steal));
  }
  floater(
    e.x,
    e.y + def.scale * 1.15 + 0.4,
    e.z,
    opts.crit ? `${amount}!` : String(amount),
    opts.crit ? "#ff9d5c" : opts.big ? "#ffcf5c" : "#fff2d6",
    opts.big || !!opts.crit,
  );
  spark(e.x, e.y + def.scale * 0.55, e.z, opts.big ? "#ffc35a" : "#ffe2a8", opts.big ? 0.6 : 0.38);
  if (e.hp <= 0) {
    killEnemy(e);
    e.zones = [];
    return true;
  }
  const kb = def.boss ? opts.knock * 0.15 : opts.knock;
  if (kb > 0) {
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    e.x += (dx / d) * kb;
    e.z += (dz / d) * kb;
    resolveCollisions(e, 0.6);
  }
  if (opts.stagger && !def.boss && e.phase !== "charge") {
    // Interrupts windups — rewarding a well-timed finisher.
    e.phase = "stagger";
    e.timer = 0.45;
    e.zones = [];
    e.telegraph = 0;
  } else if (e.phase === "idle" || e.phase === "return") {
    e.phase = "chase";
  }
  if (def.boss && e.bossPhase === 1 && e.hp <= e.maxHp * 0.5) startRoar(e);
  return false;
}

// ---------------------------------------------------------------- player

function moveIntent(camYaw: number) {
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  let mx = input.moveX * fz * -1 + input.moveZ * fx;
  let mz = input.moveX * fx + input.moveZ * fz;
  const mag = Math.hypot(mx, mz);
  if (mag > 1) {
    mx /= mag;
    mz /= mag;
  }
  return { mx, mz, mag: Math.min(1, mag) };
}

/** Soft aim: at swing start, face a nearby enemy roughly in front. */
function autoFace(p: PlayerRuntime, range: number) {
  let best: EnemyRuntime | null = null;
  let bestScore = -Infinity;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  for (const e of world.enemies) {
    if (e.phase === "dead") continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.2) continue;
    const score = dot * 2 - d * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best) p.yaw = Math.atan2(best.x - p.x, best.z - p.z);
}

function basicKind() {
  return ARCHETYPES[useGame.getState().archetype]?.basic ?? "melee";
}

/** Duration of chain step `idx` for the current archetype. */
function swingDuration(idx: number) {
  const kind = basicKind();
  return kind === "melee" ? SWINGS[idx]!.duration : SHOTS[kind].duration[idx]!;
}

function fireShot(p: PlayerRuntime, idx: number) {
  const kind = basicKind();
  if (kind === "melee") return;
  const cfg = SHOTS[kind];
  const hit = playerHit(cfg.mult[idx]!);
  projectileId += 1;
  world.projectiles.push({
    id: projectileId,
    x: p.x + Math.sin(p.yaw) * 0.8,
    y: p.y + 1.25,
    z: p.z + Math.cos(p.yaw) * 0.8,
    vx: Math.sin(p.yaw) * cfg.speed,
    vz: Math.cos(p.yaw) * cfg.speed,
    travelled: 0,
    range: cfg.range,
    damage: hit.dmg,
    crit: hit.crit,
    pierce: cfg.pierce[idx]!,
    radius: kind === "bolt" ? cfg.radius * (idx === 2 ? 1.5 : 1) : 0,
    color: cfg.color,
    hit: new Set(),
    big: idx === 2,
  });
  if (world.projectiles.length > 24) world.projectiles.shift();
}

function explode(pr: ProjectileRuntime) {
  for (const e of world.enemies) {
    if (e.phase === "dead" || pr.hit.has(e.id)) continue;
    if (Math.hypot(e.x - pr.x, e.z - pr.z) > pr.radius + (enemyDef(e.type).boss ? 1 : 0.3)) continue;
    pr.hit.add(e.id);
    damageEnemy(e, pr.damage, { knock: pr.big ? 1.2 : 0.4, stagger: pr.big, big: pr.big, crit: pr.crit });
  }
  spark(pr.x, heightAt(pr.x, pr.z) + 0.1, pr.z, pr.color, pr.radius, true, 0.4);
  sfx.hit(pr.big ? 2 : 0);
}

function stepProjectiles(dt: number) {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i]!;
    const step = Math.hypot(pr.vx, pr.vz) * dt;
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    pr.travelled += step;
    let done = pr.travelled >= pr.range;
    // Solid obstacles stop shots.
    for (const c of COLLIDERS) {
      if (c.r >= 0.9 && Math.hypot(pr.x - c.x, pr.z - c.z) < c.r * 0.85) {
        done = true;
        break;
      }
    }
    if (!done) {
      for (const e of world.enemies) {
        if (e.phase === "dead" || pr.hit.has(e.id)) continue;
        const reach = enemyDef(e.type).boss ? 1.8 : 1.0;
        if (Math.hypot(e.x - pr.x, e.z - pr.z) > reach) continue;
        if (pr.radius > 0) {
          done = true;
          break;
        }
        pr.hit.add(e.id);
        damageEnemy(e, pr.damage, { knock: pr.big ? 1.0 : 0.3, stagger: pr.big, big: pr.big, crit: pr.crit });
        world.hitstop = Math.max(world.hitstop, pr.big ? 0.05 : 0.03);
        sfx.hit(pr.big ? 2 : 0);
        if (!pr.pierce) {
          done = true;
          break;
        }
      }
    }
    if (done) {
      if (pr.radius > 0) explode(pr);
      world.projectiles.splice(i, 1);
    }
  }
}

function startSwing(p: PlayerRuntime, idx: number, mx: number, mz: number, mag: number) {
  const swing = SWINGS[idx]!;
  const kind = basicKind();
  if (mag > 0.2) p.yaw = Math.atan2(mx, mz);
  autoFace(p, kind === "melee" ? swing.range + 1.6 : kind === "arrow" ? 20 : 15);
  p.action = "attack";
  p.actionT = 0;
  p.comboIdx = idx + 1;
  p.comboBuffered = false;
  p.hitIds = new Set();
  p.swingSerial += 1;
  p.animKey += 1;
  const lunge = kind === "melee" ? swing.lunge : 0;
  p.vx = Math.sin(p.yaw) * lunge;
  p.vz = Math.cos(p.yaw) * lunge;
  world.stats.swings += 1;
  sfx.swing(idx);
}

function tryAttack(p: PlayerRuntime, mx: number, mz: number, mag: number) {
  if (p.action === "attack") {
    if (p.actionT >= swingDuration(p.comboIdx - 1) * COMBO_BUFFER_FROM && p.comboIdx < SWINGS.length) p.comboBuffered = true;
    return;
  }
  if (p.action !== "none" || p.attackCooldown > 0) return;
  const chaining = world.time - p.lastSwingEnd <= COMBO_GRACE && p.comboIdx > 0 && p.comboIdx < SWINGS.length;
  startSwing(p, chaining ? p.comboIdx : 0, mx, mz, mag);
}

function applySwingHits(p: PlayerRuntime, swing: (typeof SWINGS)[number]) {
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  let confirmed = false;
  const finisher = p.comboIdx === SWINGS.length;
  for (const e of world.enemies) {
    if (e.phase === "dead" || p.hitIds.has(e.id)) continue;
    const def = enemyDef(e.type);
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    const reach = swing.range + (def.boss ? 1.2 : 0.3);
    if (dist > reach) continue;
    const dot = dist < 0.6 ? 1 : (dx * fx + dz * fz) / dist;
    if (dot < swing.minDot) continue;
    if (lineBlocked(p.x, p.z, e.x, e.z)) continue;
    p.hitIds.add(e.id);
    const hit = playerHit(swing.damageMult);
    damageEnemy(e, hit.dmg, { knock: swing.knockback, stagger: swing.staggers, big: finisher, crit: hit.crit });
    confirmed = true;
  }
  if (confirmed) {
    world.hitstop = Math.max(world.hitstop, swing.hitstop);
    world.cameraShake = finisher ? 0.35 : 0.18;
    sfx.hit(p.comboIdx - 1);
  }
}

function tryDodge(p: PlayerRuntime, mx: number, mz: number, mag: number) {
  if (p.dodgeCd > 0 || p.dead || p.action === "gale") return;
  if (p.action === "attack") {
    // Dodge-cancel out of a swing keeps the chain honest but responsive.
    p.comboIdx = 0;
    p.comboBuffered = false;
  }
  const dirX = mag > 0.2 ? mx / (mag || 1) : -Math.sin(p.yaw);
  const dirZ = mag > 0.2 ? mz / (mag || 1) : -Math.cos(p.yaw);
  p.dodgeDirX = dirX;
  p.dodgeDirZ = dirZ;
  if (mag > 0.2) p.yaw = Math.atan2(dirX, dirZ);
  p.action = "dodge";
  p.actionT = 0;
  p.dodgeCd = DODGE.cooldown;
  p.dodgeIframe = DODGE.iframes;
  p.animKey += 1;
  sfx.dodge();
}

function abilityCooldown(id: AbilityId) {
  const focus = statsFor(useGame.getState()).mods.focus ?? 0;
  return ABILITIES[id].cooldown * (1 - focus);
}

/** Current archetype's ability in slot `idx` (0..2). */
export function abilityInSlot(idx: number): AbilityId | null {
  const a = ARCHETYPES[useGame.getState().archetype];
  return a?.abilities[idx] ?? null;
}

function useAbility(p: PlayerRuntime, idx: number, mx: number, mz: number, mag: number) {
  const id = abilityInSlot(idx);
  if (!id || p.dead) return;
  const def = ABILITIES[id];
  const s = useGame.getState();
  if (!abilityUnlocked(s.level, idx)) {
    s.toast(`${def.name} unlocks at level ${ABILITY_UNLOCK_LEVELS[idx]}.`, "info");
    return;
  }
  if (p.cooldowns[id] > 0) return;
  if (p.action === "dodge" || p.action === "gale" || p.action === "burst") return;
  p.comboIdx = 0;
  p.comboBuffered = false;
  p.cooldowns[id] = abilityCooldown(id);
  p.animKey += 1;
  p.abilityId = id;
  p.actionT = 0;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  const eff = def.effect;
  const max = statsFor(s).maxHp;
  switch (eff.kind) {
    case "dash":
      if (mag > 0.2) p.yaw = Math.atan2(mx, mz);
      p.action = "gale";
      sfx.gale();
      spark(p.x, p.y + 0.8, p.z, "#cfe9ff", 0.5);
      break;
    case "leap":
      // Leap away from where you face; slow whatever you leave behind.
      slowAround(p.x, p.z, eff.slowRadius);
      p.action = "gale";
      p.vy = 6;
      p.grounded = false;
      sfx.gale();
      break;
    case "blink": {
      const sx = p.x;
      const sz = p.z;
      if (mag > 0.2) p.yaw = Math.atan2(mx, mz);
      const bx = Math.sin(p.yaw);
      const bz = Math.cos(p.yaw);
      for (let d = 0; d < eff.distance; d += 0.5) {
        const pos = { x: p.x + bx * 0.5, z: p.z + bz * 0.5 };
        resolveCollisions(pos, 0.55);
        if (Math.hypot(pos.x - p.x, pos.z - p.z) < 0.25) break;
        p.x = pos.x;
        p.z = pos.z;
      }
      p.y = Math.max(p.y, heightAt(p.x, p.z));
      p.dodgeIframe = 0.3;
      p.action = "ward-cast";
      spark(sx, p.y + 1, sz, "#b9a4ff", 0.6);
      spark(p.x, p.y + 1, p.z, "#b9a4ff", 0.6);
      sfx.gale();
      break;
    }
    case "burst":
      p.action = "burst";
      p.hitIds = new Set();
      sfx.burstCharge();
      break;
    case "rain": {
      const tx = p.x + fx * eff.reach;
      const tz = p.z + fz * eff.reach;
      world.rains.push({ x: tx, z: tz, r: eff.radius, born: world.time, ticks: eff.ticks, next: 0, mult: eff.damageMult });
      p.action = "ward-cast";
      sfx.swing(1);
      break;
    }
    case "ward":
      p.action = "ward-cast";
      p.wardT = eff.duration;
      sfx.ward();
      floater(p.x, p.y + 2.8, p.z, def.name, "#c9e39a");
      break;
    case "heal":
      p.action = "ward-cast";
      s.setHp(Math.min(max, s.hp + max * eff.fraction));
      p.hasteT = eff.hasteFor;
      sfx.heal();
      floater(p.x, p.y + 2.8, p.z, `+${Math.round(max * eff.fraction)}`, "#9fe39a");
      break;
    case "shield":
      p.action = "ward-cast";
      p.shieldHp = Math.round(max * eff.fraction);
      p.shieldT = eff.duration;
      sfx.ward();
      floater(p.x, p.y + 2.8, p.z, def.name, "#b9a4ff");
      break;
  }
}

function slowAround(x: number, z: number, radius: number) {
  let slowed = 0;
  for (const e of world.enemies) {
    if (e.phase === "dead") continue;
    if (Math.hypot(e.x - x, e.z - z) > radius) continue;
    e.slowT = GALE.slowFor;
    e.aggro = true;
    if (e.phase === "idle" || e.phase === "return") e.phase = "chase";
    if (!enemyDef(e.type).boss && e.phase === "windup") {
      e.phase = "stagger";
      e.timer = 0.4;
      e.zones = [];
    }
    slowed += 1;
  }
  spark(x, heightAt(x, z) + 0.1, z, "#bfe6ff", radius, true, 0.5);
  if (slowed) floater(x, heightAt(x, z) + 2.6, z, "Slowed", "#bfe6ff");
}

function stepRains() {
  for (let i = world.rains.length - 1; i >= 0; i--) {
    const r = world.rains[i]!;
    const age = world.time - r.born;
    while (r.next < r.ticks.length && age >= r.ticks[r.next]!) {
      r.next += 1;
      for (const e of world.enemies) {
        if (e.phase === "dead") continue;
        if (Math.hypot(e.x - r.x, e.z - r.z) > r.r + (enemyDef(e.type).boss ? 1 : 0.3)) continue;
        const hit = playerHit(r.mult);
        damageEnemy(e, hit.dmg, { knock: 0.2, stagger: false, big: false, crit: hit.crit });
      }
      spark(r.x, heightAt(r.x, r.z) + 0.1, r.z, "#f3d38a", r.r, true, 0.3);
      sfx.hit(0);
    }
    if (r.next >= r.ticks.length) world.rains.splice(i, 1);
  }
}

function stepPlayer(dt: number, camYaw: number) {
  const p = world.player;
  const store = useGame.getState();

  if (p.dead) {
    p.deathTimer += dt;
    p.y += (heightAt(p.x, p.z) - p.y) * Math.min(1, dt * 8);
    p.anim = "die";
    return;
  }

  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.dodgeIframe = Math.max(0, p.dodgeIframe - dt);
  for (const id of Object.keys(p.cooldowns) as AbilityId[]) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - dt);
  p.hasteT = Math.max(0, p.hasteT - dt);
  p.shieldT = Math.max(0, p.shieldT - dt);
  if (p.shieldT <= 0) p.shieldHp = 0;
  if (p.wardT > 0) {
    const before = p.wardT;
    p.wardT = Math.max(0, p.wardT - dt);
    const max = statsFor(store).maxHp;
    const heal = ((before - p.wardT) / 4) * max * 0.2;
    if (store.hp < max) store.setHp(Math.min(max, store.hp + heal));
  }

  const { mx, mz, mag } = moveIntent(camYaw);

  if (input.dodgeQueued) {
    input.dodgeQueued = false;
    tryDodge(p, mx, mz, mag);
  }
  if (input.abilityQueued !== null) {
    const idx = input.abilityQueued;
    input.abilityQueued = null;
    useAbility(p, idx, mx, mz, mag);
  }
  if (input.attackQueued) {
    input.attackQueued = false;
    tryAttack(p, mx, mz, mag);
  }
  if (input.healQueued) {
    input.healQueued = false;
    store.usePotion();
  }
  if (input.jumpQueued) {
    input.jumpQueued = false;
    p.jumpBuffer = JUMP_BUFFER;
  }

  // ---- action timeline
  p.actionT += dt;
  let ctrl = 1; // movement authority this frame
  const arche = ARCHETYPES[store.archetype] ?? ARCHETYPES.vanguard;
  const speedMul = arche.moveMult * (1 + (statsFor(store).mods.swift ?? 0)) * (p.hasteT > 0 ? 1.3 : 1);
  let speedCap = (input.sprint ? SPRINT : WALK) * speedMul;
  if (p.action === "attack") {
    const swing = SWINGS[p.comboIdx - 1]!;
    const melee = basicKind() === "melee";
    ctrl = melee ? 0.15 : 0.5;
    speedCap = melee ? 1.4 : 2.6;
    if (melee) {
      if (p.actionT >= swing.hitAt && p.actionT <= swing.hitAt + swing.hitWindow) applySwingHits(p, swing);
    } else if (p.actionT >= 0.09 && !p.hitIds.has("__fired")) {
      p.hitIds.add("__fired");
      fireShot(p, p.comboIdx - 1);
    }
    if (p.actionT >= swingDuration(p.comboIdx - 1)) {
      p.action = "none";
      p.lastSwingEnd = world.time;
      if (p.comboIdx >= SWINGS.length) {
        p.attackCooldown = CHAIN_RECOVERY;
        p.comboIdx = 0;
      } else if (p.comboBuffered) {
        startSwing(p, p.comboIdx, mx, mz, mag);
      }
    }
  } else if (p.action === "dodge") {
    ctrl = 0;
    const k = 1 - p.actionT / DODGE.duration;
    const sp = DODGE.speed * Math.max(0.25, k);
    p.vx = p.dodgeDirX * sp;
    p.vz = p.dodgeDirZ * sp;
    if (p.actionT >= DODGE.duration) p.action = "none";
  } else if (p.action === "gale") {
    ctrl = 0;
    const eff = p.abilityId ? ABILITIES[p.abilityId].effect : null;
    const leap = eff?.kind === "leap";
    const distance = eff && (eff.kind === "dash" || eff.kind === "leap") ? eff.distance : 8;
    const duration = eff && (eff.kind === "dash" || eff.kind === "leap") ? eff.duration : 0.22;
    const dir = leap ? -1 : 1;
    const sp = distance / duration;
    p.vx = Math.sin(p.yaw) * sp * dir;
    p.vz = Math.cos(p.yaw) * sp * dir;
    if (Math.floor(p.actionT * 40) % 3 === 0) spark(p.x, p.y + 1, p.z, "#d8efff", 0.3, false, 0.3);
    if (p.actionT >= duration) {
      p.action = "none";
      p.vx *= 0.25;
      p.vz *= 0.25;
      if (!leap && eff?.kind === "dash") slowAround(p.x, p.z, eff.slowRadius);
    }
  } else if (p.action === "burst") {
    ctrl = 0;
    speedCap = 0;
    const eff = p.abilityId ? ABILITIES[p.abilityId].effect : null;
    if (eff?.kind === "burst" && p.actionT >= BURST.hitAt && p.hitIds.size === 0) {
      p.hitIds.add("__cast");
      let any = false;
      for (const e of world.enemies) {
        if (e.phase === "dead") continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) > eff.radius + (enemyDef(e.type).boss ? 1 : 0)) continue;
        if (lineBlocked(p.x, p.z, e.x, e.z)) continue;
        const hit = playerHit(eff.damageMult);
        damageEnemy(e, hit.dmg, { knock: eff.knockback, stagger: true, big: true, crit: hit.crit, slowFor: eff.slowFor });
        any = true;
      }
      spark(p.x, p.y + 0.15, p.z, eff.color, eff.radius, true, 0.55);
      world.cameraShake = 0.4;
      if (any) world.hitstop = Math.max(world.hitstop, 0.07);
      sfx.burst();
    }
    if (p.actionT >= BURST.castTime) p.action = "none";
  } else if (p.action === "ward-cast") {
    ctrl = 0.6;
    if (p.actionT >= 0.3) p.action = "none";
  }

  // ---- horizontal velocity with acceleration / deceleration
  const moving = mag > 0.05;
  const sprinting = input.sprint && moving && p.action === "none" && p.grounded;
  const target = p.action === "none" || p.action === "attack" || p.action === "ward-cast" ? speedCap * mag : 0;
  if (ctrl > 0) {
    const tx = mx * (target / (mag || 1)) * (mag > 0 ? 1 : 0);
    const tz = mz * (target / (mag || 1)) * (mag > 0 ? 1 : 0);
    const k = !p.grounded ? AIR_CONTROL : moving ? ACCEL : DECEL;
    const blend = (1 - Math.exp(-k * dt)) * (p.action === "attack" ? 0.6 : 1);
    p.vx += (tx - p.vx) * blend;
    p.vz += (tz - p.vz) * blend;
  } else if (p.action === "burst") {
    p.vx *= Math.exp(-14 * dt);
    p.vz *= Math.exp(-14 * dt);
  }
  // Hurt knockback decays quickly regardless of control.
  if (p.hurtT > 0 && p.action === "none") {
    p.vx *= Math.exp(-6 * dt);
    p.vz *= Math.exp(-6 * dt);
  }

  const beforeX = p.x;
  const beforeZ = p.z;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  resolveCollisions(p, 0.55);
  // Kill velocity into walls so we don't keep grinding against them.
  if (dt > 0) {
    const ax = (p.x - beforeX) / dt;
    const az = (p.z - beforeZ) / dt;
    if (Math.hypot(ax, az) < Math.hypot(p.vx, p.vz) - 0.01) {
      p.vx = ax;
      p.vz = az;
    }
  }
  const planar = Math.hypot(p.vx, p.vz);
  p.speedMag = planar;

  if (moving && (p.action === "none" || p.action === "ward-cast")) {
    p.yaw = angleLerp(p.yaw, Math.atan2(mx, mz), 1 - Math.exp(-TURN * dt));
  }

  // ---- vertical: coyote time + jump buffer
  const ground = heightAt(p.x, p.z);
  p.coyote = p.grounded ? COYOTE : Math.max(0, p.coyote - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.jumpBuffer > 0 && p.coyote > 0 && (p.action === "none" || p.action === "attack")) {
    if (p.action === "attack") {
      p.action = "none";
      p.comboIdx = 0;
    }
    p.vy = JUMP_V;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    sfx.jump();
  }
  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= ground) {
    if (!p.grounded && p.vy < -6) {
      sfx.land();
      spark(p.x, ground + 0.1, p.z, "#d8c7a0", 0.9, true, 0.3);
    }
    p.y = ground;
    p.vy = 0;
    p.grounded = true;
  } else if (p.y - ground > 0.25 || p.vy > 0) {
    p.grounded = false;
  } else {
    // Stick to downhill slopes instead of bouncing.
    p.y = ground;
    p.vy = 0;
    p.grounded = true;
  }

  // ---- footsteps
  if (p.grounded && planar > 1.5 && p.action === "none") {
    p.stepAcc += dt * planar;
    const stride = sprinting ? 2.5 : 1.9;
    if (p.stepAcc > stride) {
      p.stepAcc = 0;
      sfx.step(sprinting);
    }
  }

  // ---- animation state
  const swingAnim = p.action === "attack" ? `attack${p.comboIdx}` : null;
  p.anim =
    p.action === "dodge"
      ? "dodge"
      : p.action === "gale"
        ? "dodge"
        : p.action === "burst"
          ? "burst"
          : p.action === "ward-cast"
            ? "ward"
            : swingAnim
              ? swingAnim
              : p.hurtT > 0.12
                ? "hit"
                : !p.grounded
                  ? p.vy > 0
                    ? "jump"
                    : "fall"
                  : planar > 7.2 * speedMul
                    ? "sprint"
                    : planar > 0.6
                      ? "walk"
                      : "idle";
}

// ---------------------------------------------------------------- enemies

function faceToward(e: EnemyRuntime, tx: number, tz: number, k: number, dt: number) {
  e.yaw = angleLerp(e.yaw, Math.atan2(tx - e.x, tz - e.z), 1 - Math.exp(-k * dt));
}

function beginWindup(e: EnemyRuntime, duration: number, zones: Zone[], move: BossMove | null = null) {
  e.phase = "windup";
  e.timer = duration;
  e.windupTotal = duration;
  e.telegraph = 0;
  e.struck = false;
  e.zones = zones;
  e.move = move;
  const p = world.player;
  if (Math.hypot(p.x - e.x, p.z - e.z) < 18) sfx.windup(enemyDef(e.type).boss ? 0.6 : 1);
}

function basicZone(e: EnemyRuntime): Zone {
  const def = enemyDef(e.type);
  if (def.zone.kind === "cone") {
    return { kind: "cone", x: e.x, z: e.z, yaw: e.yaw, r: def.zone.radius, arc: def.zone.arc };
  }
  return {
    kind: "circle",
    x: e.x + Math.sin(e.yaw) * def.zone.offset,
    z: e.z + Math.cos(e.yaw) * def.zone.offset,
    r: def.zone.radius,
  };
}

function startRoar(e: EnemyRuntime) {
  e.bossPhase = 2;
  e.phase = "roar";
  e.timer = 1.5;
  e.zones = [];
  e.telegraph = 0;
  e.moveIdx = 0;
  const p = world.player;
  const d = Math.hypot(p.x - e.x, p.z - e.z);
  if (d < 6.5) {
    p.vx = ((p.x - e.x) / (d || 1)) * 12;
    p.vz = ((p.z - e.z) / (d || 1)) * 12;
    p.hurtT = 0.25;
  }
  spark(e.x, e.y + 0.2, e.z, "#c96b3a", 6.5, true, 0.8);
  world.cameraShake = 0.8;
  sfx.roar();
  useGame.getState().toast(`${enemyDef(e.type).name} is enraged — the ground itself answers!`, "bad");
}

const BOSS_P1: BossMove[] = ["cleave", "cleave", "charge"];
const BOSS_P2: BossMove[] = ["cleave", "roots", "charge", "roots"];

function bossChoose(e: EnemyRuntime, dist: number) {
  const list = e.bossPhase === 1 ? BOSS_P1 : BOSS_P2;
  let move = list[e.moveIdx % list.length]!;
  // Only cleave when close enough; otherwise take the next ranged option.
  if (move === "cleave" && dist > 5.5) move = e.bossPhase === 1 ? "charge" : "roots";
  e.moveIdx += 1;
  const speedMul = e.bossPhase === 2 ? 0.82 : 1;
  const p = world.player;
  e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
  if (move === "cleave") {
    beginWindup(e, 0.85 * speedMul, [basicZone(e)], "cleave");
  } else if (move === "charge") {
    const len = Math.min(16, Math.max(8, dist + 3));
    beginWindup(e, 1.0 * speedMul, [{ kind: "line", x: e.x, z: e.z, yaw: e.yaw, len, w: 2.8 }], "charge");
    e.chargeLeft = len;
  } else {
    // Three root eruptions: on the player and to either side of them.
    const sx = Math.cos(e.yaw);
    const sz = -Math.sin(e.yaw);
    const zones: Zone[] = [
      { kind: "circle", x: p.x, z: p.z, r: 2.5 },
      { kind: "circle", x: p.x + sx * 4.2, z: p.z + sz * 4.2, r: 2.5 },
      { kind: "circle", x: p.x - sx * 4.2, z: p.z - sz * 4.2, r: 2.5 },
    ];
    beginWindup(e, 1.15, zones, "roots");
  }
}

function stepEnemy(e: EnemyRuntime, dt: number) {
  const def = enemyDef(e.type);
  const p = world.player;
  e.hitFlash = Math.max(0, e.hitFlash - dt);
  e.slowT = Math.max(0, e.slowT - dt);
  const slow = e.slowT > 0 ? 0.45 : 1;
  const phaseSpeed = def.boss && e.bossPhase === 2 ? 1.2 : 1;

  if (e.phase === "dead") {
    e.zones = [];
    e.respawnIn -= dt;
    if (e.respawnIn <= 0 && !def.boss) {
      Object.assign(e, makeEnemy({ id: e.id, type: e.type, x: e.homeX, z: e.homeZ, yaw: e.homeYaw } as (typeof SPAWNS)[number]));
      world.defeated.delete(e.id);
    }
    return;
  }

  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const dist = Math.hypot(dx, dz);
  const homeDist = Math.hypot(e.x - e.homeX, e.z - e.homeZ);
  const playerAlive = !p.dead;

  if (homeDist > def.leashRange && e.phase !== "return" && e.phase !== "charge") {
    e.phase = "return";
    e.aggro = false;
    e.zones = [];
  }

  switch (e.phase) {
    case "idle": {
      e.anim = "idle";
      if (playerAlive && dist < def.aggroRange) {
        e.phase = "chase";
        e.aggro = true;
        useGame.getState().seeEnemy(e.type);
      }
      break;
    }
    case "chase": {
      if (!playerAlive || dist > def.aggroRange * 1.7) {
        e.phase = "return";
        e.aggro = false;
        break;
      }
      e.anim = "walk";
      if (dist > def.attackRange * 0.85) {
        const step = def.speed * slow * phaseSpeed * dt;
        e.x += (dx / (dist || 1)) * step;
        e.z += (dz / (dist || 1)) * step;
        resolveCollisions(e, 0.6);
      }
      faceToward(e, p.x, p.z, 8, dt);
      if (def.boss) {
        e.timer -= dt;
        if (dist <= def.attackRange || (e.timer <= 0 && dist < 16)) bossChoose(e, dist);
      } else if (dist <= def.attackRange) {
        // Facing locks at windup start, so stepping aside is a real answer.
        e.yaw = Math.atan2(dx, dz);
        beginWindup(e, def.windup, [basicZone(e)]);
      }
      break;
    }
    case "windup": {
      e.anim = "windup";
      e.timer -= dt * (slow < 1 ? 0.85 : 1);
      e.telegraph = 1 - Math.max(0, e.timer) / e.windupTotal;
      if (e.timer <= 0) {
        e.telegraph = 0;
        e.anim = "attack";
        if (e.move === "charge") {
          e.phase = "charge";
          e.struck = false;
          sfx.charge();
        } else {
          e.phase = "strike";
          e.timer = 0.14;
        }
      }
      break;
    }
    case "strike": {
      e.timer -= dt;
      if (!e.struck) {
        e.struck = true;
        const hit = e.zones.some(
          (z) => pointInZone(z, p.x, p.z) && (z.kind !== "cone" || !lineBlocked(e.x, e.z, p.x, p.z)),
        );
        for (const z of e.zones) {
          if (z.kind === "circle") spark(z.x, heightAt(z.x, z.z) + 0.1, z.z, "#b9774a", z.r, true, 0.4);
        }
        if (e.move === "roots" || def.zone.kind === "circle") {
          sfx.slam();
          world.cameraShake = Math.max(world.cameraShake, 0.3);
        }
        if (hit && playerAlive) damagePlayer(def.damage, e.x, e.z, e);
      }
      if (e.timer <= 0) {
        e.phase = "recover";
        e.timer = def.recover * (def.boss && e.bossPhase === 2 ? 0.8 : 1);
        e.zones = [];
      }
      break;
    }
    case "charge": {
      e.anim = "sprint";
      const step = Math.min(e.chargeLeft, 22 * dt);
      const bx = e.x;
      const bz = e.z;
      e.x += Math.sin(e.yaw) * step;
      e.z += Math.cos(e.yaw) * step;
      resolveCollisions(e, 0.9);
      const moved = Math.hypot(e.x - bx, e.z - bz);
      e.chargeLeft -= step;
      if (!e.struck && Math.hypot(p.x - e.x, p.z - e.z) < 2.0 && playerAlive) {
        e.struck = true;
        damagePlayer(Math.round(def.damage * 1.25), e.x - Math.sin(e.yaw) * 2, e.z - Math.cos(e.yaw) * 2, e);
      }
      if (Math.floor(world.time * 30) % 3 === 0) spark(e.x, e.y + 0.3, e.z, "#a98563", 0.5, false, 0.35);
      if (e.chargeLeft <= 0.01 || moved < step * 0.4) {
        e.phase = "recover";
        e.timer = def.recover + 0.3; // punish window after a charge
        e.zones = [];
        world.cameraShake = Math.max(world.cameraShake, 0.3);
        sfx.slam();
      }
      break;
    }
    case "roar": {
      e.anim = "windup";
      e.timer -= dt;
      if (e.timer <= 0) {
        e.phase = "chase";
        e.timer = 0.4;
      }
      break;
    }
    case "stagger": {
      e.anim = "hit";
      e.timer -= dt;
      if (e.timer <= 0) e.phase = "chase";
      break;
    }
    case "recover": {
      e.anim = "idle";
      e.timer -= dt;
      if (e.timer <= 0) {
        e.phase = playerAlive && dist < def.aggroRange * 1.5 ? "chase" : "return";
        e.timer = 1.2; // boss: time before it may use a ranged move while chasing
      }
      break;
    }
    case "return": {
      e.anim = "walk";
      e.zones = [];
      const hx = e.homeX - e.x;
      const hz = e.homeZ - e.z;
      const hd = Math.hypot(hx, hz);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
      if (hd < 0.6) {
        e.phase = "idle";
        e.yaw = e.homeYaw;
        e.hp = e.maxHp;
      } else {
        const step = def.speed * 0.9 * dt;
        e.x += (hx / hd) * step;
        e.z += (hz / hd) * step;
        resolveCollisions(e, 0.6);
        faceToward(e, e.homeX, e.homeZ, 6, dt);
      }
      break;
    }
  }

  e.y += (heightAt(e.x, e.z) - e.y) * Math.min(1, dt * 10);

  if (def.boss) {
    const bar = useGame.getState().bossBar;
    const show = e.aggro && e.phase !== "return";
    if (!show) {
      if (bar) useGame.setState({ bossBar: null });
    } else if (!bar || Math.abs(bar.hp - e.hp) > 0.5 || bar.phase !== e.bossPhase) {
      useGame.setState({ bossBar: { name: def.name, hp: Math.max(0, e.hp), max: e.maxHp, phase: e.bossPhase } });
    }
  }
}

function checkUnlocks() {
  const s = useGame.getState();
  const n = [0, 1, 2].filter((i) => abilityUnlocked(s.level, i)).length;
  if (unlockedCount >= 0 && n > unlockedCount) {
    const id = abilityInSlot(n - 1);
    if (id) {
      const def = ABILITIES[id];
      s.toast(`New ability: ${def.name} (${n}) — ${def.description}`, "quest");
    }
  }
  unlockedCount = n;
}

function stepDrops(dt: number) {
  void dt;
  const p = world.player;
  const store = useGame.getState();
  for (const d of world.drops) {
    if (d.taken) continue;
    const dist = Math.hypot(d.x - p.x, d.z - p.z);
    if (dist < 2.0 && !p.dead) {
      d.taken = true;
      if (d.itemId) store.addItem(d.itemId);
      if (d.potion) {
        useGame.setState({ potions: store.potions + 1 });
        store.toast("Picked up a Sunbloom Draught", "good");
      }
      if (d.gold > 0) useGame.setState({ gold: useGame.getState().gold + d.gold });
      if (d.shards > 0) {
        useGame.setState({ shards: useGame.getState().shards + d.shards });
        store.toast(`+${d.shards} Aether Shard${d.shards > 1 ? "s" : ""}`, "good");
      }
      sfx.pickup();
    }
  }
  if (world.drops.length > 60) world.drops.splice(0, world.drops.length - 60);
  for (let i = world.drops.length - 1; i >= 0; i--) {
    if (world.drops[i]!.taken && world.time - world.drops[i]!.born > 0.1) {
      if (world.time - world.drops[i]!.born > 0.6) world.drops.splice(i, 1);
    }
  }
}

function nearestNpc() {
  const p = world.player;
  let best: (typeof NPCS)[number] | null = null;
  let bestDist = 4.2;
  for (const npc of NPCS) {
    const d = Math.hypot(npc.x - p.x, npc.z - p.z);
    if (d < bestDist) {
      bestDist = d;
      best = npc;
    }
  }
  return best;
}

function selaLines(): string[] {
  const s = useGame.getState();
  if (s.questComplete) {
    return [
      "The barrow is dark and the road is quiet. You have done more than anyone asked.",
      "Keep your blade sharp at the forge. Whatever fell from the sky is not finished with us.",
    ];
  }
  const quest = QUESTS[s.questIdx];
  if (s.questIdx === 0) {
    switch (s.questStep) {
      case 0:
        return [
          "You woke on the meadow road, then. Half of Emberhollow thought you were another falling star.",
          "Bramblekin have crawled out of Whisperpine since the sky cracked. Walk north past the windmill and cull three of them.",
          "Strike, then step back. They telegraph every swing — so do you.",
        ];
      case 1:
        return ["North, past the lantern path. The woods start where the pines close in."];
      case 2:
        return ["Three Bramblekin. Keep count, and keep your distance between swings."];
      case 3:
        return ["Whatever they dropped, put it in your hands. An unarmed warden is a rumour, not a defence."];
      case 4:
        return ["Thornmaw nests in the Sunken Arch, east along the old road.", "It charges. Let it commit, then answer."];
      default:
        return ["Thornmaw's fang, still warm. You did not run. Good.", quest?.completionText ?? ""];
    }
  }
  switch (s.questStep) {
    case 0:
      return [
        "The Barrow of Lanterns lies west, past the windmill. The gate answers to that key now.",
        `Go when you are ready — level ${quest?.recommendedLevel ?? "4–7"} is my advice. Oda at the forge can sharpen what you carry.`,
      ];
    case 1:
      return ["Shades move faster than anything in the woods. Let them swing into nothing, then answer."];
    case 2:
      return ["The Lantern King sits at the back of the barrow. Break his light."];
    default:
      return ["You brought back his crown. Emberhollow owes you.", quest?.completionText ?? ""];
  }
}

function elderLines(): string[] {
  return [
    "I keep the Hall of Paths. Vanguard, Ranger, Arcanist — the village has trained all three.",
    "Change your path here whenever you like. Your level, gear and deeds come with you.",
  ];
}

function tryInteract() {
  const store = useGame.getState();
  if (store.dialogue) {
    store.openDialogue(null);
    return;
  }
  const npc = nearestNpc();
  if (!npc) return;
  sfx.ui();
  if (npc.id === "sela") {
    const step = QUESTS[store.questIdx]?.steps[store.questStep];
    store.openDialogue({ name: npc.name, lines: selaLines() });
    if (!store.questComplete && step && step.kind === "talk" && step.npc === "sela") store.advanceQuest();
  } else if (npc.id === "elder") {
    store.openDialogue({ name: npc.name, lines: elderLines() });
    store.toggleInventory(true, "build");
  } else if (npc.id === "smith") {
    store.openDialogue(null);
    store.toggleInventory(true, "forge");
  }
}

function stepQuest() {
  const store = useGame.getState();
  const step = QUESTS[store.questIdx]?.steps[store.questStep];
  if (!step || store.questComplete) return;
  if (step.kind === "reach") {
    const region = regionAt(world.player.x, world.player.z);
    if (region === step.area) store.advanceQuest();
  } else if (step.kind === "equip") {
    if (store.equipped.weapon) store.advanceQuest();
  } else if (step.kind === "boss") {
    // Boss killed before reaching this step (it never respawns) — don't stall.
    const boss = world.enemies.find((e) => e.type === step.enemy);
    if (boss && boss.phase === "dead") store.advanceQuest();
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__aether"] = { world, useGame, lineBlocked, stepWorld, pointInZone, initWorld, saveNow };
  (window as unknown as Record<string, unknown>)["__aetherInput"] = input;
}

let lastRegion: string | null = null;
let lastPrompt: string | null = null;

export function stepWorld(dtRaw: number) {
  const store = useGame.getState();
  if (store.screen !== "playing") {
    if (input.interactQueued) input.interactQueued = false;
    return;
  }
  const dt0 = Math.min(dtRaw, 0.05);
  // Hit-pause: freeze the simulation briefly on confirmed hits.
  if (world.hitstop > 0) {
    world.hitstop = Math.max(0, world.hitstop - dt0);
    return;
  }
  const dt = dt0;
  world.time += dt;

  if (input.interactQueued) {
    input.interactQueued = false;
    tryInteract();
  }

  stepPlayer(dt, input.yaw);
  for (const e of world.enemies) stepEnemy(e, dt);
  stepProjectiles(dt);
  stepRains();
  stepDrops(dt);
  stepQuest();

  world.cameraShake = Math.max(0, world.cameraShake - dt * 2.2);
  for (let i = world.sparks.length - 1; i >= 0; i--) {
    if (world.time - world.sparks[i]!.born > world.sparks[i]!.life) world.sparks.splice(i, 1);
  }
  for (let i = world.floaters.length - 1; i >= 0; i--) {
    if (world.time - world.floaters[i]!.born > 0.9) world.floaters.splice(i, 1);
  }
  checkUnlocks();

  // HUD-facing values that change rarely
  const region = regionAt(world.player.x, world.player.z);
  if (region !== lastRegion) {
    lastRegion = region;
    useGame.setState({ region: region ? REGIONS[region].label : null, regionId: region });
    if (region) store.discoverPlace(region);
  }
  const npc = nearestNpc();
  const prompt = npc
    ? `Speak with ${npc.name}`
    : world.drops.some((d) => !d.taken && Math.hypot(d.x - world.player.x, d.z - world.player.z) < 3.5)
      ? "Walk over loot to pick it up"
      : null;
  if (prompt !== lastPrompt) {
    lastPrompt = prompt;
    useGame.setState({ interactPrompt: prompt });
  }

  saveTimer += dt;
  if (saveTimer > 12) {
    saveTimer = 0;
    useGame.setState({ elapsed: useGame.getState().elapsed + 12 });
    saveNow();
  }
}

export function itemLabel(itemId?: string) {
  return itemId ? (ITEMS[itemId]?.name ?? itemId) : "";
}
