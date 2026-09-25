# Art assets

## Where the 3D models come from

| Folder                                                     | Source                                                                                                                                                                                                      | License             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `public/models/kaykit/` characters                         | [KayKit Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) and [Skeletons](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) by Kay Lousberg | CC0 (public domain) |
| `public/models/kaykit/world.glb`                           | [KayKit Medieval Hexagon](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) and [Halloween Bits](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) by Kay Lousberg     | CC0 (public domain) |
| `public/models/town`, `nature`, `gy`, `dng` (the few left) | Kenney kits (Fantasy Town, Nature, Graveyard, Mini Dungeon)                                                                                                                                                 | CC0 (public domain) |

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

## World pipeline

`public/models/kaykit/world.glb` is also **generated**:

```sh
node scripts/models/build-kaykit-world.mjs
```

It puts every building, tree, rock and prop the world uses into **one** file, each as a named top-level piece standing at its own origin. One file means one download and one shared palette texture on the GPU. The game refers to a piece as `/models/kaykit/world.glb#tree_A` (`K("tree_A")` in `src/game/world/layout.ts`). The script prints each piece's size, which is what the layout's scales are based on.

KayKit Medieval pieces are sized for a hex board (a house is about 1 unit), so the layout scales them up: roughly ×6–8 for buildings and ×5 for trees. Halloween pieces are close to character scale. Keep each piece's size close to its collider radius in the layout, so what blocks the player is what they see.

### Adding a character

1. Add an entry to `CHARACTERS` in `scripts/models/build-kaykit.mjs`, and any new clips to `CLIPS`.
2. Run the script.
3. Register the model in `src/game/render/rigs.ts` (`RIGS`), overriding clips if it fights differently.
4. Point the archetype, enemy or NPC data at it, and add it to `ALL_MODELS` in `src/game/world/layout.ts` so it preloads.

### Removing it

Delete the `CHARACTERS` entry and the output `.glb`, remove its `RIGS` line, and point the data back at another model. If no KayKit model is left, also delete `animations.glb`, the script and the four dev dependencies.

## Icons

`public/icons/items/<item id>.png` and `public/icons/classes/<class id>.png` are **generated**: 3D pieces lit, framed and outlined like game icons, so they match the world's art. Weapons, armour and the skull idol come from the KayKit packs above (CC0). Rings, charms, the pearl, crystals, the heartseed and the crown are simple shapes built in `scripts/icons/page.js`. Each icon is 128×128, about 10 KB.

```sh
node scripts/models/build-kaykit.mjs          # once: fetches the packs into .cache/kaykit
node scripts/icons/render-icons.mjs [ids] --sheet sheet.png
```

The renderer needs Playwright with Chromium. If it isn't installed in this project, point `PLAYWRIGHT` at another copy's `index.mjs`. `--sheet` also saves a labelled contact sheet for checking the icons by eye.

- **New item:** add a line to `scripts/icons/specs.mjs` (a pack piece, or a `proc` shape), render it, and commit the PNG. `tests/assets.test.ts` fails if any item or class has no icon. Until the icon exists the game shows an empty tile.
- **Removing it:** delete `scripts/icons/` and the tiles show empty. The PNGs stand on their own.

## Fonts

Lilita One (headings) and Nunito (text), both SIL Open Font License, loaded from Google Fonts in `src/routes/__root.tsx`. The service worker caches them for offline play.

## Size budget

The whole `public/` folder is cached by the service worker for offline play, so every kilobyte is a download on mobile data. Rough targets:

- Hero or enemy: 200 KB or less, 8k triangles or less, and 1–4 draw calls.
- Props: instanced where they repeat.
