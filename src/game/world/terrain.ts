// Analytic heightfield for the Dawnreach region. Deterministic, no assets.
// Everything (rendering, physics, prop scatter, camera) samples these helpers.

import * as THREE from "three";

export const WORLD_RADIUS = 112;
export const SEA_LEVEL = 0.45;

export const REGIONS = {
  village: { x: 0, z: 0, radius: 24, label: "Emberhollow" },
  woods: { x: -6, z: -56, radius: 34, label: "Whisperpine Woods" },
  ruins: { x: 58, z: -30, radius: 22, label: "The Sunken Arch" },
  shore: { x: 8, z: 72, radius: 34, label: "Tidewrack Shore" },
} as const;

export type RegionId = keyof typeof REGIONS;

/** Village → woods → ruins → shore path network (used for colouring + wayfinding). */
export const PATHS: Array<Array<[number, number]>> = [
  [
    [0, 8],
    [1, -10],
    [-3, -28],
    [-6, -44],
    [-5, -62],
  ],
  [
    [6, 2],
    [22, -6],
    [38, -16],
    [50, -26],
  ],
  [
    [2, 10],
    [6, 34],
    [9, 54],
    [10, 68],
  ],
];

function gauss(dx: number, dz: number, r: number) {
  return Math.exp(-(dx * dx + dz * dz) / (r * r));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Terrain elevation in world units. */
export function heightAt(x: number, z: number): number {
  let h = 3;
  h += 2.1 * Math.sin(x * 0.05) * Math.cos(z * 0.042);
  h += 1.25 * Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09 - 0.7);
  h += 0.45 * Math.sin(x * 0.23) * Math.cos(z * 0.2 + 2.1);

  // Northern forest ridge and eastern highland
  h += 11 * gauss(x + 24, z + 104, 58);
  h += 7 * gauss(x - 82, z + 34, 44);
  h += 4.5 * gauss(x + 70, z + 10, 38);

  // Ruins plateau
  const ruinT = gauss(x - REGIONS.ruins.x, z - REGIONS.ruins.z, 20);
  h = h * (1 - ruinT) + 7.2 * ruinT;

  // Village bowl, kept flat and readable
  const villageT = gauss(x - REGIONS.village.x, z - REGIONS.village.z, 17);
  h = h * (1 - villageT) + 3 * villageT;

  // Shoreline descent to the south
  if (z > 44) {
    h -= Math.pow(z - 44, 1.45) * 0.055;
  }

  // Rim cliffs so the world reads as enclosed
  const d = Math.hypot(x, z);
  if (d > WORLD_RADIUS - 26 && z < 50) {
    h += smoothstep(WORLD_RADIUS - 26, WORLD_RADIUS + 6, d) * 26;
  }
  return h;
}

const _n = new THREE.Vector3();
/** Smooth terrain normal via central differences. */
export function normalAt(x: number, z: number, out = _n): THREE.Vector3 {
  const e = 0.8;
  const hl = heightAt(x - e, z);
  const hr = heightAt(x + e, z);
  const hd = heightAt(x, z - e);
  const hu = heightAt(x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

/** Steepness 0 (flat) .. 1 (vertical). */
export function slopeAt(x: number, z: number): number {
  return 1 - normalAt(x, z).y;
}

/** Distance from (x,z) to the nearest road segment. */
export function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i]!;
      const [bx, bz] = path[i + 1]!;
      const vx = bx - ax;
      const vz = bz - az;
      const len2 = vx * vx + vz * vz || 1;
      let t = ((x - ax) * vx + (z - az) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + vx * t;
      const pz = az + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) best = d;
    }
  }
  return best;
}

const GRASS = new THREE.Color("#6f8f4a");
const GRASS_DRY = new THREE.Color("#93a04e");
const FOREST = new THREE.Color("#3f6238");
const SAND = new THREE.Color("#d8c48d");
const ROCK = new THREE.Color("#8d8577");
const DIRT = new THREE.Color("#9c7c53");

const _c = new THREE.Color();
/** Vertex colour for the terrain mesh. */
export function groundColor(x: number, z: number, h: number, out = _c): THREE.Color {
  const slope = slopeAt(x, z);
  const forestT = Math.min(1, gauss(x - REGIONS.woods.x, z - REGIONS.woods.z, 40) * 1.4);
  out.copy(GRASS).lerp(GRASS_DRY, 0.5 + 0.5 * Math.sin(x * 0.09 + z * 0.07));
  out.lerp(FOREST, forestT * 0.75);

  // Beach band around sea level
  const beach = 1 - smoothstep(SEA_LEVEL + 0.4, SEA_LEVEL + 3.2, h);
  out.lerp(SAND, Math.max(0, beach));

  // Rocky where steep
  out.lerp(ROCK, smoothstep(0.22, 0.55, slope));

  // Worn roads
  const road = 1 - smoothstep(1.6, 4.2, pathDistance(x, z));
  out.lerp(DIRT, road * 0.85 * (1 - Math.max(0, beach)));
  return out;
}

export function regionAt(x: number, z: number): RegionId | null {
  for (const key of Object.keys(REGIONS) as RegionId[]) {
    const r = REGIONS[key];
    if (Math.hypot(x - r.x, z - r.z) < r.radius) return key;
  }
  return null;
}

/** Keep an entity inside the playable bowl. */
export function clampToWorld(v: { x: number; z: number }) {
  const limit = WORLD_RADIUS - 14;
  const d = Math.hypot(v.x, v.z);
  if (d > limit) {
    v.x = (v.x / d) * limit;
    v.z = (v.z / d) * limit;
  }
}

/** Deterministic PRNG so the world is identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
