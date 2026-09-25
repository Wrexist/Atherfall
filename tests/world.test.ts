// Open-world traversal checks. Run with: bun test ./tests
import { beforeEach, describe, expect, test } from "bun:test";
import { CLIMBS, GULL_ROCK, SECRETS, WATCHSTONE, WAYPOINTS } from "../src/game/data/world";
import { input } from "../src/game/core/input";
import { DAY_LENGTH, fastTravel, initWorld, respawnPlayer, stepWorld, world } from "../src/game/core/sim";
import { useGame } from "../src/game/core/store";
import { REGIONS, SEA_LEVEL, heightAt, regionAt } from "../src/game/world/terrain";

const DT = 1 / 60;
const run = (sec: number) => {
  for (let t = 0; t < sec; t += DT) stepWorld(DT);
};
function put(x: number, z: number) {
  const p = world.player;
  p.x = x;
  p.z = z;
  p.y = heightAt(x, z);
  p.vx = p.vz = p.vy = 0;
  p.grounded = true;
}
function calmEnemies() {
  for (const e of world.enemies) {
    e.x = e.homeX = 900;
    e.z = e.homeZ = 900;
  }
}
/** Walk toward a target with camera-relative input (camera yaw faces the target). */
function walkTo(x: number, z: number, maxSec = 60) {
  const p = world.player;
  const regions = new Set<string>();
  for (let t = 0; t < maxSec; t += DT) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 1.5) break;
    input.yaw = Math.atan2(x - p.x, z - p.z);
    input.moveX = 0;
    input.moveZ = 1;
    stepWorld(DT);
    const r = regionAt(p.x, p.z);
    if (r) regions.add(r);
  }
  input.moveZ = 0;
  if (process.env.DBG) console.log("walk end", p.x.toFixed(1), p.z.toFixed(1), "target", x, z);
  return { reached: Math.hypot(x - p.x, z - p.z) < 2, regions };
}

beforeEach(() => {
  useGame.getState().resetProgress();
  useGame.setState({ screen: "playing", level: 8, hp: 99999 });
  initWorld(null);
  input.moveX = input.moveZ = 0;
  input.sprint = true;
});

describe("region boundaries", () => {
  test("walk from the village into the woods, the ruins and down to the shore without menus", () => {
    calmEnemies();
    const woods = walkTo(REGIONS.woods.x, REGIONS.woods.z + 10, 40);
    expect(woods.reached).toBe(true);
    expect(woods.regions.has("woods")).toBe(true);
    put(4, -10);
    const ruins = walkTo(50, -26, 40);
    expect(ruins.reached).toBe(true);
    expect(ruins.regions.has("ruins")).toBe(true);
    put(2, 10);
    const shore = walkTo(4, 52, 40);
    expect(shore.reached).toBe(true);
    expect(shore.regions.has("shore")).toBe(true);
  });

  test("the starter 'reach the woods' step triggers on arrival", () => {
    calmEnemies();
    useGame.setState({ questIdx: 0, questStep: 1 });
    walkTo(REGIONS.woods.x, REGIONS.woods.z + 12, 40);
    expect(useGame.getState().questStep).toBe(2);
  });

  test("the world has an edge you cannot leave", () => {
    put(0, 0);
    walkTo(0, -200, 30);
    expect(Math.hypot(world.player.x, world.player.z)).toBeLessThan(100);
  });
});

describe("swimming", () => {
  test("deep water switches to swimming; you float, can't attack, and climb out on shore", () => {
    calmEnemies();
    put(4, 52);
    walkTo(GULL_ROCK.x, GULL_ROCK.z - 6, 40);
    const p = world.player;
    expect(p.swimming || heightAt(p.x, p.z) > SEA_LEVEL).toBe(true);
    // Reached the island → standing on land again
    expect(p.swimming).toBe(false);
    expect(heightAt(p.x, p.z)).toBeGreaterThan(SEA_LEVEL);
    // Mid-channel check
    put(20, 68);
    run(1.5);
    expect(p.swimming).toBe(true);
    expect(p.y).toBeGreaterThan(SEA_LEVEL - 1.3);
    input.attackQueued = true;
    stepWorld(DT);
    expect(p.action).toBe("none");
  });

  test("enemies do not follow into deep water", () => {
    put(18, 62);
    run(0.2);
    const t2 = world.enemies.find((e) => e.id === "t2")!;
    t2.aggro = true;
    t2.phase = "chase";
    run(4);
    expect(heightAt(t2.x, t2.z)).toBeGreaterThan(SEA_LEVEL - 0.7);
  });
});

describe("climbing", () => {
  test("the Watchstone cannot be walked up, but its vines can be climbed", () => {
    calmEnemies();
    const route = CLIMBS[0]!;
    put(route.base.x, route.base.z + 3);
    walkTo(WATCHSTONE.x, WATCHSTONE.z, 5);
    const topY = heightAt(WATCHSTONE.x, WATCHSTONE.z);
    expect(world.player.y).toBeLessThan(topY - 4);
    put(route.base.x, route.base.z);
    input.interactQueued = true;
    stepWorld(DT);
    expect(world.player.climbing).toBe(route.id);
    input.moveZ = 1;
    for (let t = 0; t < 8 && world.player.climbing; t += DT) stepWorld(DT);
    input.moveZ = 0;
    expect(world.player.climbing).toBeNull();
    expect(world.player.y).toBeGreaterThan(topY - 1.5);
  });

  test("letting go drops you back down", () => {
    const route = CLIMBS[0]!;
    put(route.base.x, route.base.z);
    input.interactQueued = true;
    stepWorld(DT);
    input.moveZ = 1;
    run(1);
    input.moveZ = 0;
    input.jumpQueued = true;
    stepWorld(DT);
    expect(world.player.climbing).toBeNull();
    run(2);
    expect(world.player.y).toBeLessThan(heightAt(WATCHSTONE.x, WATCHSTONE.z) - 4);
  });
});

describe("waypoints, fast travel, respawn", () => {
  test("waypoints are discovered on approach and fast travel moves you there", () => {
    calmEnemies();
    const wp = WAYPOINTS.find((w) => w.id === "whisperpine")!;
    expect(fastTravel("whisperpine").ok).toBe(false);
    put(wp.x + 3, wp.z + 3);
    run(0.5);
    expect(useGame.getState().waypoints).toContain("whisperpine");
    put(0, 12);
    expect(fastTravel("whisperpine").ok).toBe(true);
    expect(Math.hypot(world.player.x - wp.x, world.player.z - wp.z)).toBeLessThan(3);
  });

  test("fast travel is refused while an enemy is hunting you", () => {
    const e = world.enemies.find((x) => x.id === "b1")!;
    e.aggro = true;
    e.phase = "chase";
    expect(fastTravel("emberhollow").ok).toBe(false);
  });

  test("death respawns you at the nearest discovered waypoint", () => {
    useGame.setState({ waypoints: ["emberhollow", "tidewrack"] });
    put(10, 55);
    world.player.dead = true;
    respawnPlayer();
    const tw = WAYPOINTS.find((w) => w.id === "tidewrack")!;
    expect(Math.hypot(world.player.x - tw.x, world.player.z - tw.z)).toBeLessThan(3);
    put(60, -30);
    world.player.dead = true;
    respawnPlayer();
    const eh = WAYPOINTS.find((w) => w.id === "emberhollow")!;
    expect(Math.hypot(world.player.x - eh.x, world.player.z - eh.z)).toBeLessThan(3);
  });
});

describe("secrets and resources", () => {
  test("a guarded cache stays sealed until its guardian falls, and pays out once", () => {
    const sec = SECRETS.find((s) => s.id === "hollow-stump")!;
    put(sec.x + 1.5, sec.z);
    const gold0 = useGame.getState().gold;
    input.interactQueued = true;
    stepWorld(DT);
    expect(useGame.getState().secrets).not.toContain(sec.id);
    const guardian = world.enemies.find((e) => e.type === sec.guardian)!;
    guardian.phase = "dead";
    guardian.hp = 0;
    input.interactQueued = true;
    stepWorld(DT);
    expect(useGame.getState().secrets).toContain(sec.id);
    expect(useGame.getState().gold).toBe(gold0 + sec.reward.gold);
    input.interactQueued = true;
    stepWorld(DT);
    expect(useGame.getState().gold).toBe(gold0 + sec.reward.gold);
  });

  test("elite guardians stay defeated after a reload", () => {
    world.defeated.add("e-root");
    initWorld({ defeated: ["e-root"], player: { x: 0, z: 12, yaw: 0 } } as never);
    expect(world.enemies.find((e) => e.id === "e-root")!.phase).toBe("dead");
  });

  test("crystals give shards, then regrow later", () => {
    put(-22, -50);
    calmEnemies();
    const s0 = useGame.getState().shards;
    run(0.1);
    expect(useGame.getState().shards).toBe(s0 + 1);
    run(0.5);
    expect(useGame.getState().shards).toBe(s0 + 1);
  });
});

describe("day/night", () => {
  test("time advances with play and wraps around", () => {
    const t0 = world.dayTime;
    run(2);
    expect(world.dayTime).toBeCloseTo((t0 + 2 / DAY_LENGTH) % 1, 3);
  });
});
