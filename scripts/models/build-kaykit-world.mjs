// Builds public/models/kaykit/world.glb: every KayKit world piece the game
// places (buildings, trees, rocks, props), in ONE file.
//
//   node scripts/models/build-kaykit-world.mjs
//
// One file means one download and one shared texture on the GPU (every piece
// of a pack uses the same small palette image). The game addresses a piece as
// "/models/kaykit/world.glb#<name>" (see render/Instances.tsx). Each piece is a
// top-level node, standing on y = 0 at its own origin, as KayKit authored it.

import path from "node:path";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, getBounds, mergeDocuments, prune, quantize } from "@gltf-transform/functions";
import { OUT, fetchPackFile, io, ready, report } from "./lib.mjs";

const MED = "Assets/gltf";
/** [name in world.glb, pack, source file] */
const PIECES = [
  // Village buildings (KayKit Medieval Hexagon)
  ["home_A_red", "medieval", `${MED}/buildings/red/building_home_A_red.gltf`],
  ["home_B_blue", "medieval", `${MED}/buildings/blue/building_home_B_blue.gltf`],
  ["home_A_yellow", "medieval", `${MED}/buildings/yellow/building_home_A_yellow.gltf`],
  ["home_B_green", "medieval", `${MED}/buildings/green/building_home_B_green.gltf`],
  ["tavern", "medieval", `${MED}/buildings/red/building_tavern_red.gltf`],
  ["blacksmith", "medieval", `${MED}/buildings/blue/building_blacksmith_blue.gltf`],
  ["windmill", "medieval", `${MED}/buildings/yellow/building_windmill_yellow.gltf`],
  ["watermill", "medieval", `${MED}/buildings/green/building_watermill_green.gltf`],
  ["well", "medieval", `${MED}/buildings/blue/building_well_blue.gltf`],
  ["market", "medieval", `${MED}/buildings/red/building_market_red.gltf`],
  ["ruin", "medieval", `${MED}/buildings/neutral/building_destroyed.gltf`],
  ["fence_wood", "medieval", `${MED}/buildings/neutral/fence_wood_straight.gltf`],
  ["fence_stone", "medieval", `${MED}/buildings/neutral/fence_stone_straight.gltf`],
  ["wall_stone", "medieval", `${MED}/buildings/neutral/wall_straight.gltf`],
  // Nature
  ["tree_A", "medieval", `${MED}/decoration/nature/tree_single_A.gltf`],
  ["tree_B", "medieval", `${MED}/decoration/nature/tree_single_B.gltf`],
  ["trees_A_small", "medieval", `${MED}/decoration/nature/trees_A_small.gltf`],
  ["trees_A_medium", "medieval", `${MED}/decoration/nature/trees_A_medium.gltf`],
  ["trees_B_small", "medieval", `${MED}/decoration/nature/trees_B_small.gltf`],
  ["trees_B_medium", "medieval", `${MED}/decoration/nature/trees_B_medium.gltf`],
  ["rock_A", "medieval", `${MED}/decoration/nature/rock_single_A.gltf`],
  ["rock_B", "medieval", `${MED}/decoration/nature/rock_single_B.gltf`],
  ["rock_C", "medieval", `${MED}/decoration/nature/rock_single_C.gltf`],
  ["rock_D", "medieval", `${MED}/decoration/nature/rock_single_D.gltf`],
  ["rock_E", "medieval", `${MED}/decoration/nature/rock_single_E.gltf`],
  ["reeds", "medieval", `${MED}/decoration/nature/waterplant_B.gltf`],
  // Props
  ["barrel", "medieval", `${MED}/decoration/props/barrel.gltf`],
  ["crate_big", "medieval", `${MED}/decoration/props/crate_A_big.gltf`],
  ["crate_small", "medieval", `${MED}/decoration/props/crate_B_small.gltf`],
  ["sack", "medieval", `${MED}/decoration/props/sack.gltf`],
  ["tent", "medieval", `${MED}/decoration/props/tent.gltf`],
  ["weaponrack", "medieval", `${MED}/decoration/props/weaponrack.gltf`],
  ["wheelbarrow", "medieval", `${MED}/decoration/props/wheelbarrow.gltf`],
  ["bucket", "medieval", `${MED}/decoration/props/bucket_water.gltf`],
  ["lumber", "medieval", `${MED}/decoration/props/resource_lumber.gltf`],
  ["flag_red", "medieval", `${MED}/decoration/props/flag_red.gltf`],
  // Graveyard and barrow (KayKit Halloween Bits)
  ["lantern_post", "halloween", "Assets/gltf/post_lantern.gltf"],
  ["lantern_standing", "halloween", "Assets/gltf/lantern_standing.gltf"],
  ["pine_orange", "halloween", "Assets/gltf/tree_pine_orange_medium.gltf"],
  ["pine_yellow", "halloween", "Assets/gltf/tree_pine_yellow_large.gltf"],
  ["tree_dead", "halloween", "Assets/gltf/tree_dead_large.gltf"],
  ["tree_dead_small", "halloween", "Assets/gltf/tree_dead_medium.gltf"],
  ["gravestone", "halloween", "Assets/gltf/gravestone.gltf"],
  ["grave", "halloween", "Assets/gltf/grave_A.gltf"],
  ["iron_fence", "halloween", "Assets/gltf/fence.gltf"],
  ["iron_fence_pillar", "halloween", "Assets/gltf/fence_pillar.gltf"],
  ["arch_gate", "halloween", "Assets/gltf/arch_gate.gltf"],
  ["shrine", "halloween", "Assets/gltf/shrine_candles.gltf"],
  ["pillar", "halloween", "Assets/gltf/pillar.gltf"],
  ["crypt", "halloween", "Assets/gltf/crypt.gltf"],
  ["skull", "halloween", "Assets/gltf/skull.gltf"],
  ["bones", "halloween", "Assets/gltf/bone_A.gltf"],
  ["candles", "halloween", "Assets/gltf/candle_triple.gltf"],
];

await ready();
const doc = await io.read(await fetchPackFile(PIECES[0][1], PIECES[0][2]));
const root = doc.getRoot();
const scene = root.listScenes()[0];
/** Wrap a scene's top-level nodes in one node named for the piece. */
function adopt(name, fromScene) {
  const holder = doc.createNode(name);
  for (const child of fromScene.listChildren()) holder.addChild(child);
  scene.addChild(holder);
}
// The first file's own nodes become the first piece.
{
  const holder = doc.createNode(PIECES[0][0]);
  for (const child of scene.listChildren()) holder.addChild(child);
  scene.addChild(holder);
}
for (const [name, pack, src] of PIECES.slice(1)) {
  const piece = await io.read(await fetchPackFile(pack, src));
  const map = mergeDocuments(doc, piece);
  for (const s of piece.getRoot().listScenes()) {
    const merged = map.get(s);
    adopt(name, merged);
    merged.dispose();
  }
}
// One buffer; identical palette textures and materials collapse into one each.
const [main, ...extra] = root.listBuffers();
for (const acc of root.listAccessors()) acc.setBuffer(main);
for (const b of extra) b.dispose();
await doc.transform(
  dedup(),
  prune({ keepLeaves: true }),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
);
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

// Sizes, for placing pieces in world/layout.ts.
for (const node of scene.listChildren()) {
  const b = getBounds(node);
  const size = b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(" x ");
  console.log(
    `${node.getName().padEnd(18)} ${size}  (y ${b.min[1].toFixed(2)}..${b.max[1].toFixed(2)})`,
  );
}
console.log(`textures ${root.listTextures().length}, materials ${root.listMaterials().length}`);
const file = path.join(OUT, "world.glb");
await io.write(file, doc);
await report([file]);
