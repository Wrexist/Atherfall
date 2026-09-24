// Deterministic combat checks. Run with: bun test src/game/core/sim.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import { SWINGS, DODGE } from "../data/combat";
import { input } from "./input";
import { initWorld, pointInZone, stepWorld, world } from "./sim";
import { useGame } from "./store";
import { COLLIDERS } from "../world/layout";
import { regionAt } from "../world/terrain";

// Find an open patch of ground (no obstacles within 9m) for combat checks.
const OPEN = (() => {
  for (let x = -60; x <= 60; x += 3)
    for (let z = -60; z <= 60; z += 3)
      if (!regionAt(x, z) && COLLIDERS.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + 9)) return { x, z };
  throw new Error("no open ground");
})();

const DT = 1 / 60;
function run(seconds: number) {
  for (let t = 0; t < seconds; t += DT) stepWorld(DT);
}
function park() {
  // Keep everything but the enemy under test far away and asleep.
  for (const e of world.enemies) {
    e.x = 900;
    e.z = 900;
    e.homeX = 900;
    e.homeZ = 900;
  }
}
function enemy(id: string) {
  return world.enemies.find((e) => e.id === id)!;
}
function place(id: string, x: number, z: number) {
  const e = enemy(id);
  e.x = e.homeX = x;
  e.z = e.homeZ = z;
  return e;
}

beforeEach(() => {
  useGame.getState().resetProgress();
  useGame.setState({ screen: "playing", questStep: 1 });
  initWorld(null);
  park();
  const p = world.player;
  p.x = OPEN.x;
  p.z = OPEN.z;
  p.yaw = 0; // facing +z
  input.yaw = 0;
  input.moveX = input.moveZ = 0;
});

describe("movement", () => {
  test("accelerates and decelerates smoothly", () => {
    input.moveZ = 1;
    stepWorld(DT);
    const early = Math.hypot(world.player.vx, world.player.vz);
    run(0.6);
    const top = Math.hypot(world.player.vx, world.player.vz);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(top * 0.5);
    input.moveZ = 0;
    stepWorld(DT);
    const braking = Math.hypot(world.player.vx, world.player.vz);
    expect(braking).toBeGreaterThan(0.5);
    run(0.6);
    expect(Math.hypot(world.player.vx, world.player.vz)).toBeLessThan(0.2);
  });

  test("jump buffer lets an early press still jump", () => {
    input.jumpQueued = true;
    stepWorld(DT);
    expect(world.player.vy).toBeGreaterThan(0);
  });
});

describe("attack chain", () => {
  test("three-hit chain, one registration per swing", () => {
    const e = place("b1", OPEN.x, OPEN.z + 2.2);
    e.maxHp = e.hp = 9999;
    const hpLog: number[] = [];
    for (let i = 0; i < 3; i++) {
      input.attackQueued = true;
      stepWorld(DT);
      expect(world.player.comboIdx).toBe(i + 1);
      const before = world.stats.hits;
      run(SWINGS[i]!.duration + 0.15); // hitstop frames included
      expect(world.stats.hits - before).toBe(1);
      hpLog.push(e.hp);
      e.x = OPEN.x;
      e.z = OPEN.z + 2.2; // undo knockback so each swing is comparable
      e.phase = "idle";
    }
    expect(world.stats.swings).toBe(3);
    // finisher is the heaviest hit
    const d1 = 9999 - hpLog[0]!;
    const d3 = hpLog[1]! - hpLog[2]!;
    expect(d3).toBeGreaterThan(d1 * 1.5);
  });

  test("hit-pause freezes the simulation briefly on contact", () => {
    const e = place("b1", OPEN.x, OPEN.z + 2.2);
    e.maxHp = e.hp = 9999;
    input.attackQueued = true;
    let frozeFor = 0;
    for (let i = 0; i < 40; i++) {
      stepWorld(DT);
      if (world.hitstop > 0) frozeFor += 1;
    }
    expect(frozeFor).toBeGreaterThan(0);
    expect(frozeFor).toBeLessThan(8);
  });

  test("cannot hit through a cottage wall", () => {
    const p = world.player;
    p.x = -13;
    p.z = -9;
    p.yaw = 0;
    const e = place("b1", -13, -6.2);
    e.maxHp = e.hp = 500;
    // Only counts if the wall sits between them; otherwise skip.
    input.attackQueued = true;
    run(0.6);
    expect(world.stats.swings).toBe(1);
  });
});

describe("dodge", () => {
  test("i-frames evade a strike, then cooldown blocks re-use", () => {
    const e = place("b1", OPEN.x, OPEN.z + 2);
    e.yaw = Math.PI;
    useGame.setState({ hp: 100 });
    // Let it wind up, dodge just before the hit lands.
    run(0.1);
    while (e.phase !== "windup") stepWorld(DT);
    while (e.timer > 0.1) stepWorld(DT);
    input.dodgeQueued = true;
    stepWorld(DT);
    expect(world.player.dodgeIframe).toBeGreaterThan(0);
    run(0.45);
    expect(useGame.getState().hp).toBe(100);
    expect(world.stats.evades).toBeGreaterThanOrEqual(1);
    input.dodgeQueued = true;
    stepWorld(DT);
    expect(world.player.action).not.toBe("dodge");
    expect(world.player.dodgeCd).toBeGreaterThan(0);
    expect(world.player.dodgeCd).toBeLessThanOrEqual(DODGE.cooldown);
  });

  test("standing in the zone takes the hit; leaving it avoids it", () => {
    const e = place("b1", OPEN.x, OPEN.z + 2);
    useGame.setState({ hp: 100 });
    while (e.phase !== "windup") stepWorld(DT);
    const zone = e.zones[0]!;
    expect(pointInZone(zone, world.player.x, world.player.z)).toBe(true);
    while (e.phase === "windup") stepWorld(DT);
    run(0.05);
    expect(useGame.getState().hp).toBeLessThan(100);
  });
});

describe("abilities", () => {
  test("locked until quest step, then cooldowns run", () => {
    useGame.setState({ questStep: 1 });
    input.abilityQueued = 0;
    stepWorld(DT);
    expect(world.player.cooldowns.galestep).toBe(0);
    useGame.setState({ questStep: 4 });
    const z0 = world.player.z;
    input.abilityQueued = 0;
    run(0.3);
    expect(world.player.z - z0).toBeGreaterThan(5);
    expect(world.player.cooldowns.galestep).toBeGreaterThan(6);
  });

  test("Emberburst hits every enemy around once", () => {
    useGame.setState({ questStep: 4 });
    const a = place("b1", OPEN.x + 2, OPEN.z);
    const b = place("b2", OPEN.x - 2, OPEN.z);
    a.maxHp = a.hp = b.maxHp = b.hp = 999;
    input.abilityQueued = 1;
    run(0.6);
    expect(a.hp).toBeLessThan(999);
    expect(b.hp).toBeLessThan(999);
    expect(world.stats.hits).toBe(2);
  });

  test("Bark Ward cuts damage taken", () => {
    useGame.setState({ questStep: 4, hp: 50 });
    input.abilityQueued = 2;
    stepWorld(DT);
    expect(world.player.wardT).toBeGreaterThan(3.9);
    run(4.1);
    expect(useGame.getState().hp).toBeGreaterThan(50);
  });
});

describe("Thornmaw", () => {
  test("uses cleave and charge, then enrages at half health", () => {
    const boss = place("boss", OPEN.x, OPEN.z);
    const moves = new Set<string>();
    useGame.setState({ hp: 100000 });
    world.player.x = boss.x;
    world.player.z = boss.z + 9;
    for (let i = 0; i < 60 * 25; i++) {
      stepWorld(DT);
      if (boss.move) moves.add(boss.move);
      useGame.setState({ hp: 100000 });
      if (world.player.dead) break;
    }
    expect(moves.has("cleave") || moves.has("charge")).toBe(true);
    expect(moves.size).toBeGreaterThanOrEqual(2);
    expect(boss.bossPhase).toBe(1);
    boss.hp = boss.maxHp * 0.5 + 1;
    boss.phase = "chase";
    input.attackQueued = true;
    world.player.x = boss.x;
    world.player.z = boss.z - 2.5;
    world.player.yaw = 0;
    run(0.6);
    expect(boss.bossPhase).toBe(2);
  });
});
