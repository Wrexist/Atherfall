// Game simulation. Plain mutable state stepped from a single useFrame call.
// Nothing here imports React: rendering reads these objects each frame.

import { ENEMIES } from "../data/enemies";
import { rollLoot } from "../data/loot";
import { STARTER_QUEST } from "../data/quests";
import { ITEMS } from "../data/items";
import { COLLIDERS, NPCS, SPAWNS } from "../world/layout";
import { REGIONS, clampToWorld, heightAt, regionAt } from "../world/terrain";
import { sfx } from "./audio";
import { input } from "./input";
import { readSave, writeSave, SAVE_VERSION, type SaveFile } from "./persistence";
import { statsFor, useGame } from "./store";

export type EnemyPhase = "idle" | "chase" | "windup" | "strike" | "recover" | "return" | "dead";

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
  telegraph: number;
  struck: boolean;
  respawnIn: number;
  anim: string;
  speed: number;
  aggro: boolean;
}

export interface DropRuntime {
  id: number;
  x: number;
  y: number;
  z: number;
  itemId?: string;
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
}

export interface PlayerRuntime {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vy: number;
  grounded: boolean;
  anim: string;
  speedMag: number;
  attackTimer: number;
  attackCooldown: number;
  didHit: boolean;
  invuln: number;
  hitFlash: number;
  dead: boolean;
  deathTimer: number;
}

export const SPAWN_POINT = { x: 0, z: 12 };

export const world = {
  time: 0,
  player: {
    x: SPAWN_POINT.x,
    y: heightAt(SPAWN_POINT.x, SPAWN_POINT.z),
    z: SPAWN_POINT.z,
    yaw: Math.PI,
    vy: 0,
    grounded: true,
    anim: "idle",
    speedMag: 0,
    attackTimer: 0,
    attackCooldown: 0,
    didHit: false,
    invuln: 0,
    hitFlash: 0,
    dead: false,
    deathTimer: 0,
  } as PlayerRuntime,
  enemies: [] as EnemyRuntime[],
  drops: [] as DropRuntime[],
  sparks: [] as SparkRuntime[],
  defeated: new Set<string>(),
  cameraShake: 0,
};

let dropId = 0;
let sparkId = 0;
let rand = Math.random;
let saveTimer = 0;

const WALK = 5.6;
const SPRINT = 9.2;
const GRAVITY = -26;
const JUMP_V = 9.4;
const ATTACK_DURATION = 0.55;
const ATTACK_HIT_AT = 0.2;
const ATTACK_RANGE = 3.1;

function makeEnemy(spawn: (typeof SPAWNS)[number]): EnemyRuntime {
  const def = ENEMIES[spawn.type];
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
    struck: false,
    respawnIn: 0,
    anim: "idle",
    speed: def.speed,
    aggro: false,
  };
}

export function initWorld(save: SaveFile | null) {
  rand = Math.random;
  world.time = 0;
  world.drops.length = 0;
  world.sparks.length = 0;
  world.defeated = new Set(save?.defeated ?? []);
  world.enemies = SPAWNS.map(makeEnemy);
  for (const e of world.enemies) {
    if (ENEMIES[e.type].boss && world.defeated.has(e.id)) {
      e.phase = "dead";
      e.hp = 0;
      e.respawnIn = 99999;
    }
  }
  const p = world.player;
  p.x = save?.player.x ?? SPAWN_POINT.x;
  p.z = save?.player.z ?? SPAWN_POINT.z;
  p.y = heightAt(p.x, p.z);
  p.yaw = save?.player.yaw ?? Math.PI;
  p.vy = 0;
  p.grounded = true;
  p.dead = false;
  p.deathTimer = 0;
  p.attackTimer = 0;
  p.attackCooldown = 0;
  p.invuln = 0;
  p.hitFlash = 0;
  p.anim = "idle";
  input.yaw = p.yaw + Math.PI;
  input.pitch = 0.34;
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

function spark(x: number, y: number, z: number, color: string, size = 0.5) {
  sparkId += 1;
  world.sparks.push({ id: sparkId, x, y, z, born: world.time, color, size });
  if (world.sparks.length > 40) world.sparks.shift();
}

function resolveCollisions(pos: { x: number; z: number }, radius: number) {
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
  clampToWorld(pos);
}

function damagePlayer(amount: number) {
  const store = useGame.getState();
  const p = world.player;
  if (p.dead || p.invuln > 0) return;
  const stats = statsFor(store);
  const dealt = Math.max(2, Math.round(amount - stats.defense * 0.45));
  const hp = Math.max(0, store.hp - dealt);
  store.setHp(hp);
  p.invuln = 0.55;
  p.hitFlash = 0.35;
  world.cameraShake = 0.5;
  sfx.hurt();
  if (hp <= 0) killPlayer();
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
  p.invuln = 1.5;
  store.setHp(Math.round(stats.maxHp * 0.6));
  useGame.setState({ screen: "playing" });
  for (const e of world.enemies) {
    if (e.phase !== "dead") {
      e.phase = "return";
      e.aggro = false;
    }
  }
  saveNow();
}

function dropLoot(enemy: EnemyRuntime) {
  const def = ENEMIES[enemy.type];
  const loot = rollLoot(def.lootTable, rand);
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
  const def = ENEMIES[enemy.type];
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

function playerAttack() {
  const p = world.player;
  if (p.attackCooldown > 0 || p.dead) return;
  p.attackTimer = ATTACK_DURATION;
  p.attackCooldown = ATTACK_DURATION + 0.1;
  p.didHit = false;
  p.anim = "attack";
  sfx.swing();
}

function applyAttackHit() {
  const p = world.player;
  const store = useGame.getState();
  const stats = statsFor(store);
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  let hitAny = false;
  for (const e of world.enemies) {
    if (e.phase === "dead") continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    const reach = ATTACK_RANGE + (ENEMIES[e.type].boss ? 1.2 : 0.4);
    if (dist > reach) continue;
    const dot = (dx / (dist || 1)) * fx + (dz / (dist || 1)) * fz;
    if (dot < 0.3) continue;
    const dmg = Math.round(stats.attack * (0.9 + rand() * 0.25));
    e.hp -= dmg;
    e.hitFlash = 0.28;
    e.aggro = true;
    hitAny = true;
    spark(e.x, e.y + 1.1, e.z, "#ffd489", 0.55);
    if (e.hp <= 0) killEnemy(e);
    else if (e.phase === "idle" || e.phase === "return") e.phase = "chase";
  }
  if (hitAny) {
    sfx.hit();
    world.cameraShake = 0.25;
  }
}

function stepPlayer(dt: number, camYaw: number) {
  const p = world.player;
  const store = useGame.getState();

  if (p.dead) {
    p.deathTimer += dt;
    p.y += (heightAt(p.x, p.z) - p.y) * Math.min(1, dt * 8);
    return;
  }

  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.attackCooldown = Math.max(0, p.attackCooldown - dt);

  if (input.attackQueued) {
    input.attackQueued = false;
    playerAttack();
  }
  if (input.healQueued) {
    input.healQueued = false;
    store.usePotion();
  }

  const attacking = p.attackTimer > 0;
  if (attacking) {
    const before = p.attackTimer;
    p.attackTimer = Math.max(0, p.attackTimer - dt);
    const elapsed = ATTACK_DURATION - p.attackTimer;
    if (!p.didHit && elapsed >= ATTACK_HIT_AT && before > 0) {
      p.didHit = true;
      applyAttackHit();
    }
  }

  // Camera-relative movement
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  let mx = input.moveX * fz * -1 + input.moveZ * fx;
  let mz = input.moveX * fx + input.moveZ * fz;
  const mag = Math.hypot(mx, mz);
  if (mag > 1) {
    mx /= mag;
    mz /= mag;
  }
  const moving = mag > 0.05;
  const sprinting = input.sprint && moving && !attacking;
  const speed = (attacking ? 1.6 : sprinting ? SPRINT : WALK) * Math.min(1, mag);

  p.x += mx * speed * dt;
  p.z += mz * speed * dt;
  resolveCollisions(p, 0.55);
  p.speedMag = moving ? speed : 0;

  if (moving) {
    const target = Math.atan2(mx, mz);
    let diff = target - p.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.yaw += diff * (1 - Math.exp(-14 * dt));
  }

  // Vertical motion
  const ground = heightAt(p.x, p.z);
  if (input.jumpQueued) {
    input.jumpQueued = false;
    if (p.grounded) {
      p.vy = JUMP_V;
      p.grounded = false;
      sfx.jump();
    }
  }
  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= ground) {
    if (!p.grounded && p.vy < -6) sfx.land();
    p.y = ground;
    p.vy = 0;
    p.grounded = true;
  } else {
    p.grounded = false;
  }

  p.anim = attacking
    ? "attack"
    : !p.grounded
      ? p.vy > 0
        ? "jump"
        : "fall"
      : sprinting
        ? "sprint"
        : moving
          ? "walk"
          : "idle";
}

function stepEnemy(e: EnemyRuntime, dt: number) {
  const def = ENEMIES[e.type];
  const p = world.player;
  e.hitFlash = Math.max(0, e.hitFlash - dt);

  if (e.phase === "dead") {
    e.respawnIn -= dt;
    if (e.respawnIn <= 0 && !def.boss) {
      e.hp = e.maxHp;
      e.x = e.homeX;
      e.z = e.homeZ;
      e.y = heightAt(e.x, e.z);
      e.yaw = e.homeYaw;
      e.phase = "idle";
      e.anim = "idle";
      e.telegraph = 0;
      world.defeated.delete(e.id);
    }
    return;
  }

  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const dist = Math.hypot(dx, dz);
  const homeDist = Math.hypot(e.x - e.homeX, e.z - e.homeZ);
  const playerAlive = !p.dead;

  if (homeDist > def.leashRange && e.phase !== "return") {
    e.phase = "return";
    e.aggro = false;
  }

  switch (e.phase) {
    case "idle": {
      e.anim = "idle";
      if (playerAlive && dist < def.aggroRange) {
        e.phase = "chase";
        e.aggro = true;
        if (def.boss) {
          useGame.setState({ bossBar: { name: def.name, hp: e.hp, max: e.maxHp } });
        }
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
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      if (dist > def.attackRange * 0.85) {
        const step = def.speed * dt;
        e.x += nx * step;
        e.z += nz * step;
        resolveCollisions(e, 0.6);
      }
      const target = Math.atan2(nx, nz);
      let diff = target - e.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.yaw += diff * (1 - Math.exp(-8 * dt));
      if (dist <= def.attackRange) {
        e.phase = "windup";
        e.timer = def.windup;
        e.struck = false;
      }
      break;
    }
    case "windup": {
      e.anim = "windup";
      e.timer -= dt;
      e.telegraph = 1 - Math.max(0, e.timer) / def.windup;
      if (e.timer <= 0) {
        e.phase = "strike";
        e.timer = 0.12;
        e.telegraph = 0;
        e.anim = "attack";
      }
      break;
    }
    case "strike": {
      e.timer -= dt;
      if (!e.struck) {
        e.struck = true;
        const fx = Math.sin(e.yaw);
        const fz = Math.cos(e.yaw);
        const d = Math.hypot(dx, dz) || 1;
        const dot = (dx / d) * fx + (dz / d) * fz;
        if (d <= def.attackRange * 1.3 && dot > 0.2) {
          damagePlayer(def.damage);
          spark(p.x, p.y + 1.2, p.z, "#ff6b5a", 0.6);
        }
      }
      if (e.timer <= 0) {
        e.phase = "recover";
        e.timer = def.recover;
      }
      break;
    }
    case "recover": {
      e.anim = "idle";
      e.timer -= dt;
      if (e.timer <= 0) e.phase = playerAlive && dist < def.aggroRange * 1.5 ? "chase" : "return";
      break;
    }
    case "return": {
      e.anim = "walk";
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
        const target = Math.atan2(hx / hd, hz / hd);
        let diff = target - e.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.yaw += diff * (1 - Math.exp(-6 * dt));
      }
      if (def.boss) useGame.setState({ bossBar: null });
      break;
    }
  }

  e.y += (heightAt(e.x, e.z) - e.y) * Math.min(1, dt * 10);

  if (def.boss && e.aggro && e.phase !== "dead") {
    const bar = useGame.getState().bossBar;
    if (!bar || Math.abs(bar.hp - e.hp) > 0.5) {
      useGame.setState({ bossBar: { name: def.name, hp: Math.max(0, e.hp), max: e.maxHp } });
    }
  }
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
    if (world.drops[i].taken && world.time - world.drops[i].born > 0.1) {
      if (world.time - world.drops[i].born > 0.6) world.drops.splice(i, 1);
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
  }
}

let lastRegion: string | null = null;
let lastPrompt: string | null = null;

export function stepWorld(dtRaw: number) {
  const store = useGame.getState();
  if (store.screen !== "playing") {
    if (input.interactQueued) input.interactQueued = false;
    return;
  }
  const dt = Math.min(dtRaw, 0.05);
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
    if (world.time - world.sparks[i].born > 0.45) world.sparks.splice(i, 1);
  }

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
