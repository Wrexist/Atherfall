// What each icon in public/icons/ is made of (see render-icons.mjs).
// file + mesh: pieces of a KayKit model (.cache/kaykit, CC0). proc: built in page.js.
// rot: [x, y, z] degrees. tint multiplies the piece's colours; glow adds light.

const ADV = "/cache/adventurers/Characters/gltf";
const SKEL = "/cache/skeletons/Assets/gltf";
const HALLOWEEN = "/cache/halloween/Assets/gltf";

const weapon = (id, file, mesh, extra = {}) => ({
  id,
  dir: "items",
  file,
  mesh,
  rot: [8, 15, -45],
  pad: 1.0,
  ...extra,
});
const body = (id, file, mesh, extra = {}) => ({
  id,
  dir: "items",
  file,
  mesh,
  rot: [8, -22, 0],
  pad: 1.06,
  ...extra,
});

export const ICONS = [
  // Weapons
  weapon("wayfarer-blade", `${ADV}/Knight.glb`, "1H_Sword"),
  weapon("thorn-cleaver", `${ADV}/Barbarian.glb`, "1H_Axe", { tint: "#cfe8b8" }),
  weapon("hollow-pike", `${SKEL}/Skeleton_Staff.gltf`, "Skeleton_Staff"),
  weapon("dawnreach-longsword", `${ADV}/Knight.glb`, "2H_Sword", { tint: "#fff4d8" }),
  weapon("thornmaw-fang", `${SKEL}/Skeleton_Blade.gltf`, "Skeleton_Blade", {
    glow: "#7a1020",
    glowStrength: 0.35,
  }),
  weapon("barrow-glaive", `${SKEL}/Skeleton_Axe.gltf`, "Skeleton_Axe"),
  weapon("lantern-edge", `${ADV}/Rogue.glb`, "Knife", { glow: "#ffb640", glowStrength: 0.3 }),
  weapon("kingsbane", `${ADV}/Knight.glb`, "2H_Sword", {
    tint: "#9c8cff",
    glow: "#5a2ab0",
    glowStrength: 0.45,
  }),
  // Armour
  body("woven-jerkin", `${ADV}/Rogue.glb`, "Rogue_Body"),
  body("bark-plated-vest", `${ADV}/Barbarian.glb`, "Barbarian_Body", { tint: "#d8c8a8" }),
  body("sentinel-cuirass", `${ADV}/Knight.glb`, "Knight_Body"),
  body("shade-wrap", `${ADV}/Mage.glb`, "Mage_Body", { tint: "#8a86b8" }),
  body("warden-plate", `${ADV}/Knight.glb`, "Knight_Body", {
    tint: "#b8d4ff",
    glow: "#1d4c8a",
    glowStrength: 0.2,
  }),
  // Accessories
  { id: "emberglass-charm", dir: "items", proc: "charm", rot: [0, 20, -12] },
  { id: "hunters-band", dir: "items", proc: "band", rot: [28, 0, 12] },
  { id: "tidewrack-pearl", dir: "items", proc: "pearl", rot: [30, 0, 0], pad: 1.08 },
  {
    id: "lantern-ring",
    dir: "items",
    proc: "ring",
    stone: 0xffc93c,
    rot: [18, 30, 0],
  },
  // Relics
  { id: "sunstone-shard", dir: "items", proc: "crystal", color: 0xffc23a, rot: [10, 20, 0] },
  {
    id: "barrow-idol",
    dir: "items",
    file: `${HALLOWEEN}/skull.gltf`,
    mesh: "skull",
    rot: [10, -25, 0],
    glow: "#1f6b4a",
    glowStrength: 0.25,
  },
  { id: "thornmaw-heartseed", dir: "items", proc: "heartseed", rot: [10, 15, 0] },
  { id: "lantern-crown", dir: "items", proc: "crown", rot: [22, 12, 0], pad: 1.12 },
  // Classes
  {
    id: "vanguard",
    dir: "classes",
    file: `${ADV}/Knight.glb`,
    parts: [
      { mesh: "1H_Sword", rot: [0, 0, -45], pos: [0, 0, -0.3] },
      { mesh: "Round_Shield", rot: [0, 0, 0], pos: [-0.05, -0.1, 0.3] },
    ],
    rot: [5, 15, 0],
    pad: 1.02,
  },
  {
    id: "ranger",
    dir: "classes",
    file: `${ADV}/Rogue.glb`,
    mesh: "2H_Crossbow",
    rot: [0, 90, -35],
    pad: 1.0,
  },
  { id: "arcanist", dir: "classes", file: `${ADV}/Mage.glb`, mesh: "2H_Staff", rot: [10, 25, -40] },
];
