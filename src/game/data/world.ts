// Open-world content: waypoints, secrets, resource nodes, landmarks, climb
// routes. Pure data — the simulation and map read these.

export interface Waypoint {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
  /** Discovered from the start. */
  known?: boolean;
}

export const WAYPOINTS: Waypoint[] = [
  { id: "emberhollow", name: "Emberhollow Square", region: "village", x: 4, z: -10, known: true },
  { id: "whisperpine", name: "Whisperpine Trail", region: "woods", x: -4, z: -42 },
  { id: "sunken-arch", name: "Sunken Arch Road", region: "ruins", x: 38, z: -26 },
  { id: "tidewrack", name: "Tidewrack Landing", region: "shore", x: 2, z: 49 },
  { id: "barrow-gate", name: "Barrow Gate", region: "barrow", x: -39, z: 18 },
];

export interface SecretDef {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
  /** Chest stays sealed until this one-time guardian is defeated. */
  guardian?: string;
  reward: { itemId: string; gold: number; shards: number };
  hint: string;
}

export const SECRETS: SecretDef[] = [
  {
    id: "hollow-stump",
    name: "Hollow Stump Cache",
    region: "woods",
    x: -30,
    z: -80,
    guardian: "rootfather",
    reward: { itemId: "hunters-band", gold: 40, shards: 4 },
    hint: "Deep in Whisperpine, where the oldest roots gather.",
  },
  {
    id: "watchstone",
    name: "Watchstone Hoard",
    region: "ruins",
    x: 30,
    z: -44,
    reward: { itemId: "sunstone-shard", gold: 60, shards: 5 },
    hint: "On top of the lone stone pillar west of the Arch. There are vines on its south face.",
  },
  {
    id: "gull-rock",
    name: "Wreck on Gull Rock",
    region: "shore",
    x: 24,
    z: 84,
    guardian: "tidebound",
    reward: { itemId: "tidewrack-pearl", gold: 80, shards: 6 },
    hint: "A wreck lies on the rock island off Tidewrack. Swim out.",
  },
];

export interface ResourceNode {
  id: string;
  region: string;
  x: number;
  z: number;
  shards: number;
}

/** Aether crystals: walk over to gather. They regrow. */
export const RESOURCE_RESPAWN = 150;
export const RESOURCES: ResourceNode[] = [
  { id: "r-w1", region: "woods", x: -22, z: -50, shards: 1 },
  { id: "r-w2", region: "woods", x: 12, z: -70, shards: 1 },
  { id: "r-h1", region: "ruins", x: 68, z: -18, shards: 2 },
  { id: "r-h2", region: "ruins", x: 72, z: -40, shards: 2 },
  { id: "r-s1", region: "shore", x: -24, z: 53, shards: 2 },
  { id: "r-s2", region: "shore", x: 32, z: 52, shards: 2 },
];

export interface Landmark {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
  /** Shown once when you first come close — environmental storytelling. */
  lines: string[];
}

export const LANDMARKS: Landmark[] = [
  {
    id: "elder-pine",
    name: "The Elder Pine",
    region: "woods",
    x: -20,
    z: -64,
    lines: [
      "Names are carved into the bark, generations deep. The newest ones are scratched out.",
      "Something with thorns has been sleeping against the roots.",
    ],
  },
  {
    id: "broken-arch",
    name: "The Broken Arch",
    region: "ruins",
    x: 58,
    z: -22,
    lines: ["An oath is cut into the keystone: WE HOLD UNTIL RELIEVED.", "Nobody ever came to relieve them."],
  },
  {
    id: "fallen-star",
    name: "Starfall Crater",
    region: "shore",
    x: -8,
    z: 55,
    lines: [
      "The sand here has turned to green glass. At the centre, a shard of the fallen star still hums.",
      "Footprints lead from the crater toward the sea, and do not come back.",
    ],
  },
];

export interface ClimbRoute {
  id: string;
  name: string;
  /** Foot of the vines (ground level). */
  base: { x: number; z: number };
  /** Where you step off at the top. */
  top: { x: number; z: number };
}

export const CLIMBS: ClimbRoute[] = [{ id: "watchstone-vines", name: "Watchstone vines", base: { x: 30, z: -35.2 }, top: { x: 30, z: -39 } }];

/** Terrain features used by the heightfield (kept here so map + sim agree). */
export const WATCHSTONE = { x: 30, z: -44, radius: 7, rise: 9 };
export const GULL_ROCK = { x: 24, z: 84, radius: 9, rise: 13.5 };
