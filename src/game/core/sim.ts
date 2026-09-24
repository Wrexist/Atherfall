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
  SWINGS,
  WARD,
  abilityUnlocked,
  type AbilityId,
} from "../data/combat";
import { enemyDef } from "../data/enemies";
import { rollLoot } from "../data/loot";
import { STARTER_QUEST } from "../data/quests";
import { ITEMS } from "../data/items";
import { COLLIDERS, NPCS, SPAWNS } from "../world/layout";
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
    cooldowns: { galestep: 0, emberburst: 0, barkward: 0 },
    wardT: 0,
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
    hp: s.hp,
    level: s.level,
    xp: s.xp,
    gold: s.gold,
    potions: s.potions,
    inventory: s.inventory,
    equipped: s.equipped,
    questStep: s.questStep,
    questKills: s.questKills,
    questComplete: s.questComplete,
    shoreUnlocked: s.shoreUnlocked,
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
    hp: save.hp,
    level: save.level,
    xp: save.xp,
    gold: save.gold,
    potions: save.potions,
    inventory: save.inventory,
    equipped: save.equipped,
    questStep: save.questStep,
    questKills: save.questKills,
    questComplete: save.questComplete,
    shoreUnlocked: save.shoreUnlocked,
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
  for (let pass = 0; pass < 2; pass++) {
    for (const c of COLLIDERS) {
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

function dropLoot(enemy: EnemyRuntime) {
  const def = enemyDef(enemy.type);
  const loot = rollLoot(def.lootTable, rand);
  // The starter quest requires equipping a weapon: guarantee the first one
  // so the tutorial can never stall on bad luck.
  if (!def.boss && !playerHasWeapon()) loot.itemId = "wayfarer-blade";
  if (!loot.itemId && !loot.potion && loot.gold <= 0) return;
  dropId += 1;
  world.drops.push({
    id: dropId,
    x: enemy.x,
    y: heightAt(enemy.x, enemy.z),
    z: enemy.z,
    itemId: loot.itemId,
    potion: loot.potion,
    gold: loot.gold,
    born: world.time,
    taken: false,
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
    store.toast(`${def.name} falls. The arch goes quiet.`, "quest");
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

function damagePlayer(amount: number, fromX: number, fromZ: number) {
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
  if (p.wardT > 0) dealt = Math.max(1, Math.round(dealt * WARD.damageTaken));
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

function damageEnemy(e: EnemyRuntime, amount: number, opts: { knock: number; stagger: boolean; big: boolean }) {
  const def = enemyDef(e.type);
  if (e.phase === "dead" || e.phase === "roar") return false;
  const p = world.player;
  e.hp -= amount;
  e.hitFlash = 0.22;
  e.aggro = true;
  world.stats.hits += 1;
  floater(e.x, e.y + def.scale * 1.15 + 0.4, e.z, String(amount), opts.big ? "#ffcf5c" : "#fff2d6", opts.big);
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

function startSwing(p: PlayerRuntime, idx: number, mx: number, mz: number, mag: number) {
  const swing = SWINGS[idx]!;
  if (mag > 0.2) p.yaw = Math.atan2(mx, mz);
  autoFace(p, swing.range + 1.6);
  p.action = "attack";
  p.actionT = 0;
  p.comboIdx = idx + 1;
  p.comboBuffered = false;
  p.hitIds = new Set();
  p.swingSerial += 1;
  p.animKey += 1;
  p.vx = Math.sin(p.yaw) * swing.lunge;
  p.vz = Math.cos(p.yaw) * swing.lunge;
  world.stats.swings += 1;
  sfx.swing(idx);
}

function tryAttack(p: PlayerRuntime, mx: number, mz: number, mag: number) {
  if (p.action === "attack") {
    const swing = SWINGS[p.comboIdx - 1]!;
    if (p.actionT >= swing.duration * COMBO_BUFFER_FROM && p.comboIdx < SWINGS.length) p.comboBuffered = true;
    return;
  }
  if (p.action !== "none" || p.attackCooldown > 0) return;
  const chaining = world.time - p.lastSwingEnd <= COMBO_GRACE && p.comboIdx > 0 && p.comboIdx < SWINGS.length;
  startSwing(p, chaining ? p.comboIdx : 0, mx, mz, mag);
}

function applySwingHits(p: PlayerRuntime, swing: (typeof SWINGS)[number]) {
  const stats = statsFor(useGame.getState());
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
    const dmg = Math.round(stats.attack * swing.damageMult * (0.92 + rand() * 0.16));
    damageEnemy(e, dmg, { knock: swing.knockback, stagger: swing.staggers, big: finisher });
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

function useAbility(p: PlayerRuntime, idx: number, mx: number, mz: number, mag: number) {
  const def = ABILITIES[idx];
  if (!def || p.dead) return;
  const s = useGame.getState();
  if (!abilityUnlocked(def, s.questStep, s.questComplete)) {
    s.toast(`${def.name} is sealed — ${def.unlockHint.toLowerCase()} to awaken it.`, "info");
    return;
  }
  if (p.cooldowns[def.id] > 0) return;
  if (p.action === "dodge" || p.action === "gale" || p.action === "burst") return;
  p.comboIdx = 0;
  p.comboBuffered = false;
  p.cooldowns[def.id] = def.cooldown;
  p.animKey += 1;
  if (def.id === "galestep") {
    if (mag > 0.2) p.yaw = Math.atan2(mx, mz);
    p.action = "gale";
    p.actionT = 0;
    sfx.gale();
    spark(p.x, p.y + 0.8, p.z, "#cfe9ff", 0.5);
  } else if (def.id === "emberburst") {
    p.action = "burst";
    p.actionT = 0;
    p.hitIds = new Set();
    sfx.burstCharge();
  } else {
    p.action = "ward-cast";
    p.actionT = 0;
    p.wardT = WARD.duration;
    sfx.ward();
    floater(p.x, p.y + 2.8, p.z, "Bark Ward", "#c9e39a");
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
  for (const a of ABILITIES) p.cooldowns[a.id] = Math.max(0, p.cooldowns[a.id] - dt);
  if (p.wardT > 0) {
    const before = p.wardT;
    p.wardT = Math.max(0, p.wardT - dt);
    const max = statsFor(store).maxHp;
    const heal = ((before - p.wardT) / WARD.duration) * max * WARD.healFraction;
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
  let speedCap = input.sprint ? SPRINT : WALK;
  if (p.action === "attack") {
    const swing = SWINGS[p.comboIdx - 1]!;
    ctrl = 0.15;
    speedCap = 1.4;
    if (p.actionT >= swing.hitAt && p.actionT <= swing.hitAt + swing.hitWindow) applySwingHits(p, swing);
    if (p.actionT >= swing.duration) {
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
    const sp = GALE.distance / GALE.duration;
    p.vx = Math.sin(p.yaw) * sp;
    p.vz = Math.cos(p.yaw) * sp;
    if (Math.floor(p.actionT * 40) % 3 === 0) spark(p.x, p.y + 1, p.z, "#d8efff", 0.3, false, 0.3);
    if (p.actionT >= GALE.duration) {
      p.action = "none";
      p.vx *= 0.25;
      p.vz *= 0.25;
      let slowed = 0;
      for (const e of world.enemies) {
        if (e.phase === "dead") continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) <= GALE.slowRadius) {
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
      }
      spark(p.x, p.y + 0.1, p.z, "#bfe6ff", GALE.slowRadius, true, 0.5);
      if (slowed) floater(p.x, p.y + 2.6, p.z, "Slowed", "#bfe6ff");
    }
  } else if (p.action === "burst") {
    ctrl = 0;
    speedCap = 0;
    if (p.actionT >= BURST.hitAt && p.hitIds.size === 0) {
      p.hitIds.add("__cast");
      const stats = statsFor(store);
      let any = false;
      for (const e of world.enemies) {
        if (e.phase === "dead") continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) > BURST.radius + (enemyDef(e.type).boss ? 1 : 0)) continue;
        if (lineBlocked(p.x, p.z, e.x, e.z)) continue;
        const dmg = Math.round(stats.attack * BURST.damageMult * (0.95 + rand() * 0.1));
        damageEnemy(e, dmg, { knock: BURST.knockback, stagger: true, big: true });
        any = true;
      }
      spark(p.x, p.y + 0.15, p.z, "#ffb45a", BURST.radius, true, 0.55);
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
                  : planar > 7.2
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
  useGame.getState().toast("Thornmaw tears free of its roots — the ground itself answers!", "bad");
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
        if (hit && playerAlive) damagePlayer(def.damage, e.x, e.z);
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
        damagePlayer(Math.round(def.damage * 1.25), e.x - Math.sin(e.yaw) * 2, e.z - Math.cos(e.yaw) * 2);
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
  const n = ABILITIES.filter((a) => abilityUnlocked(a, s.questStep, s.questComplete)).length;
  if (unlockedCount >= 0 && n > unlockedCount) {
    const def = ABILITIES[n - 1]!;
    s.toast(`New ability: ${def.name} (${def.key}) — ${def.description}`, "quest");
    sfx.levelUp();
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

function selaLines(step: number, complete: boolean): string[] {
  if (complete) {
    return [
      "Tidewrack is yours to walk now, Warden-in-training.",
      "Whatever fell out of that sky is still burning on the sand. Go carefully.",
    ];
  }
  if (step === STARTER_QUEST.steps.length - 1) {
    return [
      "Thornmaw's fang, still warm. You did not run. Good.",
      STARTER_QUEST.completionText,
    ];
  }
  switch (step) {
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
      return [
        "Thornmaw nests in the Sunken Arch, east along the old road.",
        "It charges. Let it commit, then answer.",
      ];
    default:
      return ["Return to me when Thornmaw is down."];
  }
}

function elderLines(): string[] {
  return [
    "Emberhollow has stood here nine generations. The bay has never glowed like that before.",
    "Sela will send you somewhere unwise. Drink your draughts — press Q, not pride.",
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
    const step = STARTER_QUEST.steps[store.questStep];
    store.openDialogue({ name: npc.name, lines: selaLines(store.questStep, store.questComplete) });
    if (step && step.kind === "talk" && step.npc === "sela") {
      store.advanceQuest();
    }
  } else {
    store.openDialogue({ name: npc.name, lines: elderLines() });
  }
}

function stepQuest() {
  const store = useGame.getState();
  const step = STARTER_QUEST.steps[store.questStep];
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
  (window as unknown as Record<string, unknown>)["__aether"] = { world, useGame, lineBlocked, stepWorld, pointInZone };
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
    useGame.setState({ region: region ? REGIONS[region].label : null });
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
