// Builds the game's character models from Kay Lousberg's KayKit packs (CC0).
//
//   node scripts/models/build-kaykit.mjs
//
// Sources are downloaded from GitHub at pinned commits into .cache/kaykit (not
// committed); the optimized results go to public/models/kaykit (committed).
// For each character it:
//   1. keeps only the parts and weapons the game shows,
//   2. attaches loose weapons (skeletons ship them separately) to a hand bone,
//   3. merges every part into one skinned mesh per material (1–2 draw calls
//      instead of ~10 on a phone),
//   4. drops the animations (all KayKit characters share one rig, so they
//      ship once, in animations.glb),
//   5. quantizes and meshopt-compresses the result.
// See docs/ASSETS.md for the license and how to add or remove a model.

import path from "node:path";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, quantize, resample } from "@gltf-transform/functions";
import { OUT, fetchPackFile, io, ready, report } from "./lib.mjs";

/** Characters: source file, the mesh nodes to keep, and loose weapons to attach. */
const CHARACTERS = [
  // Heroes
  {
    out: "knight",
    pack: "adventurers",
    src: "Characters/gltf/Knight.glb",
    keep: ["Knight_*", "1H_Sword", "Round_Shield"],
  },
  {
    out: "ranger",
    pack: "adventurers",
    src: "Characters/gltf/Rogue_Hooded.glb",
    keep: ["Rogue_*", "1H_Crossbow"],
  },
  {
    out: "mage",
    pack: "adventurers",
    src: "Characters/gltf/Mage.glb",
    keep: ["Mage_*", "2H_Staff"],
  },
  // Villagers (no weapons)
  { out: "rogue", pack: "adventurers", src: "Characters/gltf/Rogue.glb", keep: ["Rogue_*"] },
  {
    out: "barbarian",
    pack: "adventurers",
    src: "Characters/gltf/Barbarian.glb",
    keep: ["Barbarian_*", "1H_Axe"],
  },
  { out: "elder", pack: "adventurers", src: "Characters/gltf/Mage.glb", keep: ["Mage_*"] },
  // Enemies
  {
    out: "skeleton-minion",
    pack: "skeletons",
    src: "Characters/gltf/Skeleton_Minion.glb",
    keep: ["Skeleton_Minion_*"],
    attach: [{ src: "Assets/gltf/Skeleton_Blade.gltf", bone: "handslot.r" }],
  },
  {
    out: "skeleton-warrior",
    pack: "skeletons",
    src: "Characters/gltf/Skeleton_Warrior.glb",
    keep: ["Skeleton_Warrior_*"],
    attach: [
      { src: "Assets/gltf/Skeleton_Axe.gltf", bone: "handslot.r" },
      { src: "Assets/gltf/Skeleton_Shield_Large_A.gltf", bone: "handslot.l" },
    ],
  },
  {
    out: "skeleton-rogue",
    pack: "skeletons",
    src: "Characters/gltf/Skeleton_Rogue.glb",
    keep: ["Skeleton_Rogue_*"],
    attach: [{ src: "Assets/gltf/Skeleton_Blade.gltf", bone: "handslot.r" }],
  },
  {
    out: "skeleton-mage",
    pack: "skeletons",
    src: "Characters/gltf/Skeleton_Mage.glb",
    keep: ["Skeleton_Mage_*"],
    attach: [{ src: "Assets/gltf/Skeleton_Staff.gltf", bone: "handslot.r" }],
  },
];

/** The clips the game plays (see render/rigs.ts). Taken from the skeletons pack, which has them all. */
const CLIPS = [
  "Idle",
  "Walking_A",
  "Walking_B",
  "Walking_D_Skeletons",
  "Running_A",
  "Jump_Idle",
  "Dodge_Forward",
  "Hit_A",
  "Death_A",
  "Death_C_Skeletons",
  "1H_Melee_Attack_Slice_Diagonal",
  "1H_Melee_Attack_Slice_Horizontal",
  "1H_Melee_Attack_Chop",
  "1H_Melee_Attack_Stab",
  "2H_Melee_Attack_Spin",
  "2H_Melee_Attack_Chop",
  "1H_Ranged_Shoot",
  "Spellcast_Shoot",
  "Spellcast_Raise",
  "Spellcast_Long",
  "Block",
  "Use_Item",
  "Interact",
  "Cheer",
  "Taunt",
  "Spawn_Ground_Skeletons",
  "Sit_Floor_Idle",
];
const ANIMATION_SOURCE = { pack: "skeletons", src: "Characters/gltf/Skeleton_Minion.glb" };

const glob = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

// ---- small matrix helpers (column-major 4x4, as glTF stores them)
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10,
    b01 = a00 * a12 - a02 * a10,
    b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11,
    b04 = a01 * a13 - a03 * a11,
    b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30,
    b07 = a20 * a32 - a22 * a30,
    b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31,
    b10 = a21 * a33 - a23 * a31,
    b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const d = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d,
    (a02 * b10 - a01 * b11 - a03 * b09) * d,
    (a31 * b05 - a32 * b04 + a33 * b03) * d,
    (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d,
    (a00 * b11 - a02 * b08 + a03 * b07) * d,
    (a32 * b02 - a30 * b05 - a33 * b01) * d,
    (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d,
    (a01 * b08 - a00 * b10 - a03 * b06) * d,
    (a30 * b04 - a31 * b02 + a33 * b00) * d,
    (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d,
    (a00 * b09 - a01 * b07 + a02 * b06) * d,
    (a31 * b01 - a30 * b03 - a32 * b00) * d,
    (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
}
const point = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
function normalMatrix(m) {
  const inv = invert(m); // inverse-transpose, read transposed below
  return (x, y, z) => {
    const nx = inv[0] * x + inv[1] * y + inv[2] * z;
    const ny = inv[4] * x + inv[5] * y + inv[6] * z;
    const nz = inv[8] * x + inv[9] * y + inv[10] * z;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
}

/** Remove a clip with its keyframe data (disposing the clip alone leaves its samplers behind). */
function dropClip(anim) {
  for (const c of anim.listChannels()) c.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

/** Parent of each node (gltf-transform only stores children). */
function parents(doc) {
  const map = new Map();
  for (const n of doc.getRoot().listNodes()) for (const c of n.listChildren()) map.set(c, n);
  return map;
}

/**
 * Merge every visible part into one skinned mesh per material. Rigid parts
 * (helmet, cape, weapons: children of bones) become skinned to that bone with
 * weight 1, moved into the skin's bind space so they render exactly where they
 * did: v' = inverse(meshWorld) · inverse(IBM[joint]) · (part relative to joint) · v.
 */
function mergeParts(doc) {
  const root = doc.getRoot();
  const parentOf = parents(doc);
  const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
  if (!skinned.length) throw new Error("no skinned mesh");
  const host = skinned[0];
  const skin = host.getSkin();
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const ibmOf = (j) => ibm.getElement(joints.indexOf(j), new Array(16));
  const toHost = invert(host.getWorldMatrix());

  /** @type {Map<import("@gltf-transform/core").Material, {pos:number[],nrm:number[],uv:number[],jnt:number[],wgt:number[],idx:number[]}>} */
  const byMaterial = new Map();
  const bucket = (mat) => {
    if (!byMaterial.has(mat))
      byMaterial.set(mat, { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] });
    return byMaterial.get(mat);
  };

  for (const node of root.listNodes().filter((n) => n.getMesh())) {
    let xf; // transform into host bind space
    let joint = null; // rigid parts: the bone they ride on
    if (node.getSkin()) {
      if (node.getSkin() !== skin) throw new Error(`second skin on ${node.getName()}`);
      xf = mul(toHost, node.getWorldMatrix());
    } else {
      let chain = node.getMatrix();
      let p = parentOf.get(node);
      while (p && !joints.includes(p)) {
        chain = mul(p.getMatrix(), chain);
        p = parentOf.get(p);
      }
      if (!p) throw new Error(`rigid part ${node.getName()} is not under a bone`);
      joint = joints.indexOf(p);
      xf = mul(toHost, mul(invert(ibmOf(p)), chain));
    }
    const nrmOf = normalMatrix(xf);
    for (const prim of node.getMesh().listPrimitives()) {
      const b = bucket(prim.getMaterial());
      const base = b.pos.length / 3;
      const P = prim.getAttribute("POSITION");
      const N = prim.getAttribute("NORMAL");
      const T = prim.getAttribute("TEXCOORD_0");
      const J = prim.getAttribute("JOINTS_0");
      const W = prim.getAttribute("WEIGHTS_0");
      const v = [0, 0, 0, 0];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, v);
        b.pos.push(...point(xf, v[0], v[1], v[2]));
        if (N) {
          N.getElement(i, v);
          b.nrm.push(...nrmOf(v[0], v[1], v[2]));
        } else b.nrm.push(0, 1, 0);
        if (T) {
          T.getElement(i, v);
          b.uv.push(v[0], v[1]);
        } else b.uv.push(0, 0);
        if (joint === null) {
          J.getElement(i, v);
          b.jnt.push(v[0], v[1], v[2], v[3]);
          W.getElement(i, v);
          b.wgt.push(v[0], v[1], v[2], v[3]);
        } else {
          b.jnt.push(joint, 0, 0, 0);
          b.wgt.push(1, 0, 0, 0);
        }
      }
      const I = prim.getIndices();
      if (I) for (let i = 0; i < I.getCount(); i++) b.idx.push(base + I.getScalar(i));
      else for (let i = 0; i < P.getCount(); i++) b.idx.push(base + i);
    }
  }

  const buffer = root.listBuffers()[0];
  const mesh = doc.createMesh(host.getMesh().getName() || "Body");
  for (const [mat, b] of byMaterial) {
    const acc = (type, arr, Ctor) =>
      doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buffer);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setMaterial(mat)
        .setIndices(acc("SCALAR", b.idx, b.pos.length / 3 > 65535 ? Uint32Array : Uint16Array))
        .setAttribute("POSITION", acc("VEC3", b.pos, Float32Array))
        .setAttribute("NORMAL", acc("VEC3", b.nrm, Float32Array))
        .setAttribute("TEXCOORD_0", acc("VEC2", b.uv, Float32Array))
        .setAttribute("JOINTS_0", acc("VEC4", b.jnt, Uint16Array))
        .setAttribute("WEIGHTS_0", acc("VEC4", b.wgt, Float32Array)),
    );
  }
  for (const node of root.listNodes().filter((n) => n.getMesh() && n !== host)) node.dispose();
  host.setMesh(mesh).setName("Body");
}

async function buildCharacter(spec) {
  const doc = await io.read(await fetchPackFile(spec.pack, spec.src));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) dropClip(a);
  const keep = spec.keep.map(glob);
  for (const n of root.listNodes())
    if (n.getMesh() && !keep.some((re) => re.test(n.getName()))) n.dispose();

  for (const a of spec.attach ?? []) {
    const weapon = await io.read(await fetchPackFile(spec.pack, a.src));
    const map = mergeDocuments(doc, weapon);
    const bone = root.listNodes().find((n) => n.getName() === a.bone);
    if (!bone) throw new Error(`no bone ${a.bone}`);
    for (const scene of weapon.getRoot().listScenes()) {
      const merged = map.get(scene);
      for (const child of merged.listChildren()) bone.addChild(child);
      merged.dispose();
    }
  }
  // mergeDocuments brings a second buffer; keep everything in one.
  const [main, ...extra] = root.listBuffers();
  for (const acc of root.listAccessors()) acc.setBuffer(main);
  for (const b of extra) b.dispose();

  mergeParts(doc);
  await doc.transform(
    prune({ keepLeaves: true }),
    dedup(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const file = path.join(OUT, `${spec.out}.glb`);
  await io.write(file, doc);
  return file;
}

async function buildAnimations() {
  const doc = await io.read(await fetchPackFile(ANIMATION_SOURCE.pack, ANIMATION_SOURCE.src));
  const root = doc.getRoot();
  const want = new Set(CLIPS);
  for (const a of root.listAnimations()) if (!want.has(a.getName())) dropClip(a);
  const missing = CLIPS.filter((c) => !root.listAnimations().some((a) => a.getName() === c));
  if (missing.length) throw new Error(`missing clips: ${missing.join(", ")}`);
  // Bones that move skin (directly or through a child). The rig's IK and
  // foot-roll helpers deform nothing: the clips are already baked onto the
  // real bones, so their tracks are dead weight.
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const weighted = new Set();
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const J = prim.getAttribute("JOINTS_0");
      const W = prim.getAttribute("WEIGHTS_0");
      const j = [0, 0, 0, 0];
      const w = [0, 0, 0, 0];
      for (let i = 0; i < J.getCount(); i++) {
        J.getElement(i, j);
        W.getElement(i, w);
        for (let k = 0; k < 4; k++) if (w[k] > 0) weighted.add(joints[j[k]]);
      }
    }
  // Hand slots carry weapons; keep them even if this model holds nothing.
  for (const n of root.listNodes()) if (/^handslot/.test(n.getName())) weighted.add(n);
  const needed = (node) => weighted.has(node) || node.listChildren().some(needed);
  const isOne = (acc) => {
    const v = [0, 0, 0];
    for (let i = 0; i < acc.getCount(); i++) {
      acc.getElement(i, v);
      if (Math.abs(v[0] - 1) + Math.abs(v[1] - 1) + Math.abs(v[2] - 1) > 1e-4) return false;
    }
    return true;
  };
  for (const a of root.listAnimations())
    for (const c of a.listChannels()) {
      const node = c.getTargetNode();
      const deadScale = c.getTargetPath() === "scale" && isOne(c.getSampler().getOutput());
      if (!node || !needed(node) || deadScale) {
        const sampler = c.getSampler();
        c.dispose();
        if (!a.listChannels().some((o) => o.getSampler() === sampler)) sampler.dispose();
      }
    }
  // Only the bones are needed: clips bind to any KayKit character by bone name.
  for (const n of root.listNodes()) if (n.getMesh()) n.dispose();
  for (const s of root.listSkins()) s.dispose();
  await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup());
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const file = path.join(OUT, "animations.glb");
  await io.write(file, doc);
  return file;
}

await ready();
const built = [];
for (const spec of CHARACTERS) built.push(await buildCharacter(spec));
built.push(await buildAnimations());
await report(built);
