// Auto-attack like Eternal Hero: walk into reach and the hero turns and swings;
// stand still in a fight and it keeps swinging. Run with: bun test ./tests
import { beforeEach, describe, expect, test } from "bun:test";
import { AUTO_RANGE, pickAutoTarget, shouldAutoAttack } from "../src/game/core/autoAttack";
import { input } from "../src/game/core/input";
import { useSettings } from "../src/game/core/settings";
import { initWorld, stepWorld, world } from "../src/game/core/sim";
import { useGame } from "../src/game/core/store";
import { COLLIDERS } from "../src/game/world/layout";
import { SEA_LEVEL, heightAt, regionAt } from "../src/game/world/terrain";

const foe = (id: string, x: number, z: number, hp = 10, phase = "idle") => ({
  id,
  x,
  z,
  hp,
  phase,
});

describe("choosing what to hit", () => {
  test("nearest living enemy in reach, in any direction", () => {
    const list = [foe("far", 0, 9), foe("behind", 0, -2), foe("dead", 1, 0, 0, "dead")];
    expect(pickAutoTarget(0, 0, list, 3.6, null)?.id).toBe("behind");
    expect(pickAutoTarget(0, 0, [foe("far", 0, 9)], 3.6, null)).toBeNull();
  });

  test("the locked target wins while it's in reach", () => {
    const list = [foe("near", 1, 0), foe("locked", 0, 3)];
    expect(pickAutoTarget(0, 0, list, 3.6, "locked")?.id).toBe("locked");
    expect(pickAutoTarget(0, 0, [foe("near", 1, 0), foe("locked", 0, 8)], 3.6, "locked")?.id).toBe(
      "near",
    );
  });

  test("walking into reach attacks; standing still only in a fight", () => {
    expect(shouldAutoAttack(true, true, false)).toBe(true);
    expect(shouldAutoAttack(true, false, true)).toBe(true);
    expect(shouldAutoAttack(true, false, false)).toBe(false);
    expect(shouldAutoAttack(false, true, true)).toBe(false);
    expect(AUTO_RANGE.arrow).toBeGreaterThan(AUTO_RANGE.melee);
  });
});

const DT = 1 / 60;
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += DT) stepWorld(DT);
};
const OPEN = (() => {
  for (let x = -60; x <= 60; x += 3)
    for (let z = -60; z <= 60; z += 3)
      if (!regionAt(x, z) && COLLIDERS.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + 9))
        return { x, z };
  throw new Error("no open ground");
})();

describe("in the game", () => {
  beforeEach(() => {
    useGame.getState().resetProgress();
    useGame.setState({ screen: "playing", questStep: 1, archetype: "vanguard" });
    useSettings.setState({ autoAttack: true, tipsDone: [] });
    initWorld(null);
    for (const e of world.enemies) {
      e.x = e.homeX = 900;
      e.z = e.homeZ = 900;
    }
    const p = world.player;
    p.x = OPEN.x;
    p.z = OPEN.z;
    p.y = heightAt(OPEN.x, OPEN.z);
    p.yaw = 0;
    input.yaw = 0;
    input.moveX = input.moveZ = 0;
    input.attackHeld = false;
    // One enemy just east of the hero, within sword reach.
    const e = world.enemies[0]!;
    e.x = e.homeX = OPEN.x + 2.6;
    e.z = e.homeZ = OPEN.z;
  });

  test("standing next to an enemy in a fight, the hero turns and swings", () => {
    run(1.2);
    expect(world.stats.swings).toBeGreaterThan(0);
    const e = world.enemies[0]!;
    const p = world.player;
    const want = Math.atan2(e.x - p.x, e.z - p.z);
    expect(Math.abs(Math.atan2(Math.sin(p.yaw - want), Math.cos(p.yaw - want)))).toBeLessThan(0.6);
  });

  test("walking past an enemy in reach, the hero swings at it", () => {
    input.moveZ = 1; // walk away along the screen, enemy to the side
    run(0.4);
    expect(world.stats.swings).toBeGreaterThan(0);
  });

  test("attacking on the move never slows the hero down", () => {
    const p = world.player;
    const walk = (seconds: number) => {
      const x0 = p.x;
      const z0 = p.z;
      input.moveZ = 1;
      run(seconds);
      input.moveZ = 0;
      return Math.hypot(p.x - x0, p.z - z0);
    };
    // Swinging (auto-attack at the enemy beside us) while walking…
    const swings0 = world.stats.swings;
    const fighting = walk(0.5);
    expect(world.stats.swings).toBeGreaterThan(swings0);
    // …covers as much ground as walking with nothing to hit.
    for (const e of world.enemies) e.x = e.homeX = 900;
    run(0.6);
    const free = walk(0.5);
    expect(fighting).toBeGreaterThan(free * 0.9);
  });

  test("split walking legs never outlive the swing (swimming)", () => {
    const p = world.player;
    for (const e of world.enemies) e.x = e.homeX = 900;
    // Deep water: the swim step returns early, before the animation choice.
    let sea = { x: 0, z: 0 };
    outer: for (let r = 60; r < 130; r += 4)
      for (let a = 0; a < 6.28; a += 0.2) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (heightAt(x, z) < SEA_LEVEL - 3) {
          sea = { x, z };
          break outer;
        }
      }
    p.x = sea.x;
    p.z = sea.z;
    p.y = SEA_LEVEL - 1;
    p.swimming = true;
    p.legs = "walk"; // left over from a swing just before diving in
    run(0.3);
    expect(p.swimming).toBe(true);
    expect(p.legs).toBeNull();
  });

  test("with auto-attack off, nothing swings on its own", () => {
    useSettings.setState({ autoAttack: false });
    run(1.2);
    expect(world.stats.swings).toBe(0);
  });
});

describe("loot", () => {
  beforeEach(() => {
    useGame.getState().resetProgress();
    useGame.setState({ screen: "playing", questStep: 1 });
    initWorld(null);
    for (const e of world.enemies) {
      e.x = e.homeX = 900;
      e.z = e.homeZ = 900;
    }
    const p = world.player;
    p.x = OPEN.x;
    p.z = OPEN.z;
    p.y = heightAt(OPEN.x, OPEN.z);
    input.moveX = input.moveZ = 0;
  });

  const coins = (dx: number) =>
    world.drops.push({
      id: 9001,
      x: OPEN.x + dx,
      y: heightAt(OPEN.x + dx, OPEN.z),
      z: OPEN.z,
      potion: false,
      gold: 25,
      shards: 0,
      born: world.time,
      taken: false,
    });

  test("nearby loot flies to the hero after its pop, no walking over it", () => {
    const before = useGame.getState().gold;
    coins(4.5);
    run(0.2);
    expect(useGame.getState().gold).toBe(before); // still popping out
    run(1.5);
    expect(useGame.getState().gold).toBe(before + 25);
  });

  test("loot further away waits for you", () => {
    const before = useGame.getState().gold;
    coins(9);
    run(2);
    expect(useGame.getState().gold).toBe(before);
  });
});
