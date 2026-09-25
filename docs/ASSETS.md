# Art assets

## Where the 3D models come from

| Folder                                      | Source                                                                                                                                                                                                             | License             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `public/models/kaykit/`                     | [KayKit Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) and [KayKit Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) by Kay Lousberg | CC0 (public domain) |
| `public/models/town`, `nature`, `gy`, `dng` | Kenney kits (Fantasy Town, Nature, Graveyard, Mini Dungeon)                                                                                                                                                        | CC0 (public domain) |

CC0 means no attribution is required and commercial use is fine. We credit the artists here anyway.

Art direction (decided 2026-09-25): chunky chibi characters and saturated colours, like _Eternal Hero_ and _Skull Hero_. New art should match the KayKit style.

## Character pipeline

`public/models/kaykit/*.glb` is **generated**. Don't edit those files by hand.

```sh
node scripts/models/build-kaykit.mjs
```

The script downloads the packs at pinned commits into `.cache/kaykit/` (git-ignored), then for each character:

1. Keeps only the listed body parts and weapons, and attaches loose weapons to a hand bone.
2. Merges all parts into one skinned mesh per material. That's 1 draw call per hero instead of about 10.
3. Removes the animations. All KayKit characters share one rig, so the clips ship once, in `animations.glb`, and bind to any KayKit model by bone name.
4. Quantizes and meshopt-compresses the result. A character is about 100–160 KB and the animation library about 370 KB.

Build tooling (`@gltf-transform/*`, `meshoptimizer`) is a dev dependency only. Nothing extra ships to players: three.js already includes the meshopt decoder.

### Adding a character

1. Add an entry to `CHARACTERS` in `scripts/models/build-kaykit.mjs`, and any new clips to `CLIPS`.
2. Run the script.
3. Register the model in `src/game/render/rigs.ts` (`RIGS`), overriding clips if it fights differently.
4. Point the archetype, enemy or NPC data at it, and add it to `ALL_MODELS` in `src/game/world/layout.ts` so it preloads.

### Removing it

Delete the `CHARACTERS` entry and the output `.glb`, remove its `RIGS` line, and point the data back at another model. If no KayKit model is left, also delete `animations.glb`, the script and the four dev dependencies.

## Size budget

The whole `public/` folder is cached by the service worker for offline play, so every kilobyte is a download on mobile data. Rough targets:

- Hero or enemy: 200 KB or less, 8k triangles or less, and 1–4 draw calls.
- Props: instanced where they repeat.
