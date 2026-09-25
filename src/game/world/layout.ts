// Handcrafted + seeded layout of Dawnreach: buildings, scatter props, NPCs,
// enemy spawns and landmarks. Pure data generation, no three.js scene objects.

import { REGIONS, heightAt, mulberry32, pathDistance, slopeAt } from "./terrain";
import { GULL_ROCK, WATCHSTONE, WAYPOINTS } from "../data/world";

export interface PropInstance {
  model: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** Collider radius in world units; 0 = walk-through. */
  collide: number;
  /** Omitted on Low graphics. */
  detail?: boolean;
  yOffset?: number;
}

export interface CottageDef {
  x: number;
  z: number;
  yaw: number;
  /** Footprint in modules (each module is 3 world units wide). */
  w: number;
  d: number;
  roof: string;
}

export interface NpcDef {
  id: string;
  name: string;
  model: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface SpawnDef {
  id: string;
  type: string;
  x: number;
  z: number;
  yaw: number;
}

const M = 3; // cottage module size in world units

/** Blocks the barrow entrance until the starter quest is done. */
export const BARROW_GATE = { x: -46, z: 14, r: 3.6 };

export const COTTAGES: CottageDef[] = [
  { x: -13, z: -4, yaw: 0.25, w: 2, d: 2, roof: "#8c4b39" },
  { x: -10, z: 9, yaw: -0.5, w: 2, d: 3, roof: "#a35c3a" },
  { x: 12, z: 8, yaw: 2.6, w: 3, d: 2, roof: "#7d4634" },
  { x: 14, z: -7, yaw: 3.5, w: 2, d: 2, roof: "#96543c" },
  { x: -2, z: -17, yaw: 0.1, w: 3, d: 2, roof: "#8c4b39" },
];

export const NPCS: NpcDef[] = [
  {
    id: "sela",
    name: "Warden Sela",
    model: "/models/mini/npc-sela.glb",
    x: 3.2,
    z: 3.6,
    yaw: -2.3,
    scale: 2.1,
  },
  {
    id: "smith",
    name: "Oda the Smith",
    model: "/models/mini/smith.glb",
    x: 7.5,
    z: -2.5,
    yaw: -1.2,
    scale: 2.1,
  },
  {
    id: "elder",
    name: "Elder Kervan",
    model: "/models/mini/npc-elder.glb",
    x: -7.5,
    z: 1.5,
    yaw: 1.1,
    scale: 2.1,
  },
];

export const SPAWNS: SpawnDef[] = [
  // Whisperpine Woods — Bramblekin
  { id: "b1", type: "bramblekin", x: -4, z: -36, yaw: 0 },
  { id: "b2", type: "bramblekin", x: -14, z: -44, yaw: 1.2 },
  { id: "b3", type: "bramblekin", x: 2, z: -50, yaw: 2.4 },
  { id: "b4", type: "bramblekin", x: -12, z: -58, yaw: 3.1 },
  { id: "b5", type: "bramblekin", x: 2, z: -64, yaw: 0.6 },
  { id: "b6", type: "bramblekin", x: -23, z: -69, yaw: 1.9 },
  { id: "b7", type: "bramblekin", x: 10, z: -58, yaw: 4.2 },
  // Road to the ruins — Hollow Sentinels
  { id: "s1", type: "sentinel", x: 34, z: -18, yaw: 3.0 },
  { id: "s2", type: "sentinel", x: 47, z: -24, yaw: 2.4 },
  { id: "s3", type: "sentinel", x: 60, z: -18, yaw: 1.4 },
  { id: "s4", type: "sentinel", x: 72, z: -48, yaw: 0.4 },
  // Miniboss
  { id: "boss", type: "thornmaw", x: 58, z: -34, yaw: 1.6 },
  // Tidewrack Shore
  { id: "t1", type: "drowned", x: -16, z: 52, yaw: 0 },
  { id: "t2", type: "drowned", x: 18, z: 53, yaw: 3 },
  { id: "t3", type: "drowned", x: 36, z: 48, yaw: 2 },
  // One-time guardians at secrets
  { id: "e-root", type: "rootfather", x: -26, z: -76, yaw: 2.4 },
  { id: "e-tide", type: "tidebound", x: 21, z: 80, yaw: 2.8 },
  // Barrow of Lanterns (dungeon)
  { id: "d1", type: "shade", x: -51, z: 8, yaw: -1.6 },
  { id: "d2", type: "shade", x: -51, z: 20, yaw: -1.6 },
  { id: "d3", type: "shade", x: -58, z: 5.5, yaw: -1.2 },
  { id: "d4", type: "shade", x: -58, z: 22.5, yaw: -2.0 },
  { id: "d5", type: "shade", x: -56, z: 14, yaw: -1.6 },
  { id: "w1", type: "warden", x: -65, z: 7, yaw: 1.2 },
  { id: "w2", type: "warden", x: -65, z: 21, yaw: 2.0 },
  { id: "king", type: "lanternking", x: -70, z: 14, yaw: 1.57 },
];

const TREES = [
  "/models/nature/tree_pineTallA.glb",
  "/models/nature/tree_pineRoundC.glb",
  "/models/nature/tree_default.glb",
  "/models/nature/tree_oak.glb",
];

const SMALL = [
  "/models/nature/grass.glb",
  "/models/nature/grass_large.glb",
  "/models/nature/plant_bushDetailed.glb",
  "/models/nature/flower_yellowA.glb",
  "/models/nature/flower_purpleB.glb",
  "/models/nature/mushroom_redGroup.glb",
];

const ROCKS = [
  "/models/nature/rock_largeA.glb",
  "/models/nature/rock_tallB.glb",
  "/models/nature/rock_smallC.glb",
];

function pick<T>(arr: T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))] as T;
}

/** Landmarks placed by hand so the region reads as designed, not scattered. */
function handmade(): PropInstance[] {
  const p: PropInstance[] = [];
  const add = (
    model: string,
    x: number,
    z: number,
    yaw: number,
    scale: number,
    collide = 0,
    detail = false,
  ) => p.push({ model, x, z, yaw, scale, collide, detail });

  // --- Emberhollow village ---
  add("/models/town/fountain-round.glb", 0, 0, 0, 3.2, 2.6);
  add("/models/town/windmill.glb", -24, -14, 0.6, 4.2, 3.4);
  add("/models/town/watermill.glb", 20, 16, -1.2, 3.6, 3.2);
  add("/models/town/stall.glb", -5, 7, 0.3, 2.8, 1.4);
  add("/models/town/stall-red.glb", 6, 8.5, -0.4, 2.8, 1.4);
  add("/models/town/cart.glb", 9, -3, 1.9, 2.6, 1.2);
  add("/models/town/banner-green.glb", -3.4, -2.6, 0, 3, 0.5, true);
  add("/models/town/banner-green.glb", 3.4, 2.6, 3.14, 3, 0.5, true);
  add("/models/nature/campfire_stones.glb", 5.5, -6.5, 0, 2.6, 0.9);

  // Lantern posts along the north road and the village square
  const lanterns: Array<[number, number]> = [
    [3, 9],
    [-3, 9],
    [2.5, -12],
    [-3.5, -12],
    [1.5, -24],
    [-4.5, -24],
    [-1, -38],
    [-9, -38],
    [9, 3.6],
    [-8, -1],
    [6.2, 22.6],
    [-1, 22],
  ];
  for (const [x, z] of lanterns) add("/models/town/lantern.glb", x, z, 0, 2.8, 0.4);

  // Fences framing the square
  for (let i = 0; i < 7; i++) {
    add("/models/town/fence.glb", -18 + i * 3, 18, 0, 3, 1.0, true);
    // leave a gap where the east road to the ruins passes through
    if (i !== 4 && i !== 5) add("/models/town/hedge.glb", 18, -18 + i * 3, Math.PI / 2, 3, 1.2, true);
  }

  // --- Whisperpine Woods gateway ---
  add("/models/nature/statue_obelisk.glb", -8.5, -30, 0.2, 3, 1.2);
  add("/models/nature/statue_columnDamaged.glb", 2.5, -30, -0.3, 3, 1.2);
  add("/models/nature/log.glb", -10, -50, 0.9, 3, 1.1, true);
  add("/models/nature/stump_old.glb", 6, -54, 0, 3, 1.0, true);

  // --- Sunken Arch ruins ---
  const rx = REGIONS.ruins.x;
  const rz = REGIONS.ruins.z;
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ring.push([rx + Math.cos(a) * 15, rz + Math.sin(a) * 15]);
  }
  ring.forEach(([x, z], i) => {
    if (pathDistance(x, z) < 2.2) return; // keep the ruins road clear
    const model =
      i % 3 === 0
        ? "/models/gy/pillar-large.glb"
        : i % 3 === 1
          ? "/models/gy/column-large.glb"
          : "/models/gy/pillar-small.glb";
    add(model, x, z, (i * 1.7) % 6.28, 3.2, 1.1);
  });
  add("/models/gy/altar-stone.glb", rx, rz, 0.4, 3.4, 1.6);
  add("/models/gy/fire-basket.glb", rx - 5, rz + 5, 0, 3, 0.8);
  add("/models/gy/fire-basket.glb", rx + 5, rz - 5, 0, 3, 0.8);
  add("/models/gy/stone-wall.glb", rx - 12, rz + 10, 0.8, 3.4, 1.4, true);
  add("/models/gy/stone-wall-damaged.glb", rx + 12, rz + 9, -0.7, 3.4, 1.4, true);
  add("/models/gy/brick-wall.glb", rx + 3, rz - 14, 0.2, 3.4, 1.4, true);
  add("/models/gy/debris.glb", rx - 3, rz - 8, 1.1, 3, 0.6, true);
  add("/models/gy/rocks-tall.glb", rx + 9, rz + 14, 0.5, 3, 1.2);

  // --- Barrow of Lanterns: walled court with an east gate ---
  const W = 3.4;
  const x0 = -74, x1 = -46, z0 = 2, z1 = 26;
  for (let x = x0; x <= x1 + 0.01; x += W) {
    add("/models/dng/wall.glb", x, z0, 0, W, 1.9);
    add("/models/dng/wall.glb", x, z1, 0, W, 1.9);
  }
  for (let z = z0 + W; z < z1 - 0.01; z += W) {
    add("/models/dng/wall.glb", x0, z, 0, W, 1.9);
    // leave a two-segment opening in the east wall for the gate
    if (Math.abs(z - BARROW_GATE.z) > W) add("/models/dng/wall.glb", x1, z, 0, W, 1.9);
  }
  for (const [cx, cz] of [[-54, 10], [-54, 18], [-62, 10], [-62, 18]] as const) {
    add("/models/dng/column.glb", cx, cz, 0, 3.4, 0.95);
  }
  add("/models/gy/fire-basket.glb", -48.5, 10.5, 0, 2.6, 0.6);
  add("/models/gy/fire-basket.glb", -48.5, 17.5, 0, 2.6, 0.6);
  add("/models/gy/fire-basket.glb", -72, 9, 0, 2.6, 0.6);
  add("/models/gy/fire-basket.glb", -72, 19, 0, 2.6, 0.6);
  add("/models/dng/chest.glb", -72, 14, Math.PI / 2, 3, 0.9);
  add("/models/dng/banner.glb", -72.2, 11.5, Math.PI / 2, 3.4, 0, true);
  add("/models/dng/banner.glb", -72.2, 16.5, Math.PI / 2, 3.4, 0, true);
  add("/models/dng/stones.glb", -60, 24, 0.4, 3, 0, true);
  add("/models/dng/stones.glb", -50, 4, 1.4, 3, 0, true);
  add("/models/nature/rock_largeA.glb", -42, 5, 0.7, 3.2, 1.5);
  add("/models/nature/rock_tallB.glb", -42, 23, 1.9, 3.2, 1.4);

  // --- Open-world landmarks ---
  for (const w of WAYPOINTS) add("/models/gy/pillar-large.glb", w.x, w.z, 0.3, 3.2, 0.7);
  add("/models/nature/tree_pineTallA.glb", -20, -64, 0.4, 9, 1.8); // the Elder Pine
  add("/models/gy/column-large.glb", 27, -42, 0.2, 3, 0.8); // Watchstone summit ruin
  add("/models/gy/debris.glb", 33, -46, 1.2, 3, 0, true);
  add("/models/town/planks.glb", 20, 83, 0.9, 3.6, 0); // Gull Rock wreck
  add("/models/town/planks.glb", 26, 80, 2.1, 3.6, 0);
  add("/models/town/cart.glb", 27, 86, 2.6, 2.6, 1.0);
  add("/models/dng/stones.glb", 22, 88, 0.3, 3, 0, true);
  add("/models/nature/rock_tallB.glb", -32, -82, 0.8, 3.6, 1.4); // Hollow Stump grove
  add("/models/nature/rock_largeA.glb", -24, -84, 2.2, 3.2, 1.4);

  // --- Tidewrack Shore teaser ---
  add("/models/town/planks.glb", 9, 62, 0.1, 3.4, 0);
  add("/models/town/planks.glb", 10, 66, 0.1, 3.4, 0);
  add("/models/nature/rock_largeA.glb", 20, 70, 0.7, 3.4, 1.6);
  add("/models/nature/rock_tallB.glb", -6, 68, 1.9, 3.2, 1.4);
  return p;
}

function scatter(): PropInstance[] {
  const rand = mulberry32(20260412);
  const out: PropInstance[] = [];

  const tryPlace = (
    x: number,
    z: number,
    model: string,
    scale: number,
    collide: number,
    detail: boolean,
  ) => {
    if (Math.hypot(x, z) > 104) return;
    if (slopeAt(x, z) > 0.42) return;
    const h = heightAt(x, z);
    if (h < 1.1) return; // keep the beach and water clear
    if (pathDistance(x, z) < 4.5) return;
    if (Math.hypot(x, z) < 21) return; // village square stays clear
    if (Math.hypot(x - REGIONS.ruins.x, z - REGIONS.ruins.z) < 19) return;
    if (Math.hypot(x - REGIONS.barrow.x, z - REGIONS.barrow.z) < 24) return;
    if (Math.hypot(x - WATCHSTONE.x, z - WATCHSTONE.z) < 13) return;
    if (Math.hypot(x - GULL_ROCK.x, z - GULL_ROCK.z) < 14) return;
    if (Math.hypot(x + 30, z + 80) < 6) return; // keep the cache clearing open
    if (WAYPOINTS.some((w) => Math.hypot(x - w.x, z - w.z) < 5)) return;
    out.push({ model, x, z, yaw: rand() * 6.28, scale, collide, detail });
  };

  // Forest body
  for (let i = 0; i < 260; i++) {
    const a = rand() * 6.28;
    const r = Math.sqrt(rand()) * 42;
    const x = REGIONS.woods.x + Math.cos(a) * r * 1.15;
    const z = REGIONS.woods.z + Math.sin(a) * r;
    tryPlace(x, z, pick(TREES, rand()), 2.6 + rand() * 1.4, 1.0, false);
  }
  // Outlying groves
  for (let i = 0; i < 110; i++) {
    const a = rand() * 6.28;
    const r = 26 + rand() * 72;
    tryPlace(
      Math.cos(a) * r,
      Math.sin(a) * r * 0.9,
      pick(TREES, rand()),
      2.4 + rand() * 1.2,
      1.0,
      false,
    );
  }
  // Rocks
  for (let i = 0; i < 90; i++) {
    const a = rand() * 6.28;
    const r = 22 + rand() * 80;
    tryPlace(Math.cos(a) * r, Math.sin(a) * r, pick(ROCKS, rand()), 2.2 + rand() * 1.6, 1.1, false);
  }
  // Undergrowth (Low graphics drops these)
  for (let i = 0; i < 420; i++) {
    const a = rand() * 6.28;
    const r = 14 + rand() * 88;
    tryPlace(Math.cos(a) * r, Math.sin(a) * r, pick(SMALL, rand()), 2 + rand() * 1.4, 0, true);
  }
  return out;
}

export const PROPS: PropInstance[] = [...handmade(), ...scatter()];

export interface Collider {
  x: number;
  z: number;
  r: number;
}

function cottageColliders(): Collider[] {
  return COTTAGES.map((c) => ({
    x: c.x,
    z: c.z,
    r: (Math.max(c.w, c.d) * M) / 2 + 0.4,
  }));
}

export const COLLIDERS: Collider[] = [
  ...PROPS.filter((p) => p.collide > 0).map((p) => ({ x: p.x, z: p.z, r: p.collide })),
  ...cottageColliders(),
  ...NPCS.map((n) => ({ x: n.x, z: n.z, r: 0.8 })),
];

/** Wall module placements for one cottage (local space, y at base). */
export function cottageWalls(c: CottageDef) {
  const walls: Array<{ model: string; x: number; z: number; yaw: number }> = [];
  const halfW = (c.w * M) / 2;
  const halfD = (c.d * M) / 2;
  for (let i = 0; i < c.d; i++) {
    const z = -halfD + M / 2 + i * M;
    const door = i === Math.floor(c.d / 2);
    walls.push({
      model: door ? "/models/town/wall-door.glb" : "/models/town/wall-window-shutters.glb",
      x: halfW,
      z,
      yaw: 0,
    });
    walls.push({ model: "/models/town/wall.glb", x: -halfW, z, yaw: Math.PI });
  }
  for (let i = 0; i < c.w; i++) {
    const x = -halfW + M / 2 + i * M;
    walls.push({
      model: i % 2 === 0 ? "/models/town/wall-window-shutters.glb" : "/models/town/wall.glb",
      x,
      z: halfD,
      yaw: Math.PI / 2,
    });
    walls.push({ model: "/models/town/wall.glb", x, z: -halfD, yaw: -Math.PI / 2 });
  }
  return walls;
}

export const MODULE = M;

/** Every unique GLB the world needs, for preloading. */
export const ALL_MODELS: string[] = Array.from(
  new Set<string>([
    ...PROPS.map((p) => p.model),
    ...COTTAGES.flatMap((c) => cottageWalls(c).map((w) => w.model)),
    ...NPCS.map((n) => n.model),
    "/models/mini/hero.glb",
    "/models/gy/character-zombie.glb",
    "/models/gy/character-skeleton.glb",
    "/models/gy/character-vampire.glb",
    "/models/dng/character-orc.glb",
    "/models/dng/gate.glb",
    "/models/dng/chest.glb",
    "/models/mini/ranger.glb",
    "/models/mini/arcanist.glb",
  ]),
);
