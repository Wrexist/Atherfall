// Shared helpers for the KayKit model builds (see docs/ASSETS.md).

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const CACHE = path.join(ROOT, ".cache/kaykit");
export const OUT = path.join(ROOT, "public/models/kaykit");

const GH = "https://raw.githubusercontent.com/KayKit-Game-Assets";

/** Kay Lousberg's KayKit packs (CC0), pinned to exact commits so builds are reproducible. */
export const PACKS = {
  adventurers: `${GH}/KayKit-Character-Pack-Adventures-1.0/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures`,
  skeletons: `${GH}/KayKit-Character-Pack-Skeletons-1.0/15b62b9bad122f72926c10fb14d622c73819fa54/addons/kaykit_character_pack_skeletons`,
  medieval: `${GH}/KayKit-Medieval-Hexagon-Pack-1.0/84fa4e91af6a88989be7c99e0891cede11f2ca38/addons/kaykit_medieval_hexagon_pack`,
  halloween: `${GH}/KayKit-Halloween-Bits-1.0/6dc69bf6b2fa766a985754f35ec6a0324090e6c6/addons/kaykit_halloween_bits`,
  dungeon: `${GH}/KayKit-Dungeon-Remastered-1.0/b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07/addons/kaykit_dungeon_remastered`,
};

export const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

export async function ready() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await mkdir(OUT, { recursive: true });
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Download a pack file (and a .gltf's .bin and textures) into the cache once. */
export async function fetchPackFile(pack, rel) {
  const file = path.join(CACHE, pack, rel);
  if (await exists(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  const res = await fetch(`${PACKS[pack]}/${rel}`);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${pack}/${rel}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  if (rel.endsWith(".gltf")) {
    const json = JSON.parse(buf.toString("utf8"));
    const deps = [...(json.buffers ?? []), ...(json.images ?? [])]
      .map((b) => b.uri)
      .filter(Boolean);
    for (const uri of deps)
      await fetchPackFile(pack, path.posix.join(path.posix.dirname(rel), uri));
  }
  return file;
}

/** Print sizes of the built files. */
export async function report(files) {
  let total = 0;
  for (const f of files) {
    const s = await stat(f);
    total += s.size;
    console.log(
      `${path.relative(ROOT, f).replaceAll("\\", "/")}  ${(s.size / 1024).toFixed(0)} KB`,
    );
  }
  console.log(`total ${(total / 1024).toFixed(0)} KB`);
}
