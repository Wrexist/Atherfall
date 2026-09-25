# Aetherfall

A 3D action RPG for phones, played upright in the browser. Explore Dawnreach, fight with a sword, crossbow or spells, loot and forge gear, and follow the quest from Emberhollow to the Barrow of Lanterns. Optional accounts add cloud saves and let you see other players walking around live.

Built with React 19, TypeScript, three.js (via @react-three/fiber and drei), zustand and TanStack Start. It's connected to [Lovable](https://lovable.dev/projects/319af114-79bc-4e94-9339-b18de4d2b21e): commits to `main` sync to the Lovable editor and back.

## Play it locally

You need [Bun](https://bun.sh) and Node.js 22.

```sh
bun install
npx vite dev --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173. To test on your phone, use `--host 0.0.0.0` and open your computer's address from the phone (same Wi-Fi).

## Checks

These run in CI on every pull request (`.github/workflows/ci.yml`):

```sh
bun test ./tests      # simulation, saves, camera, settings, online sync
npx tsc --noEmit -p .
npx eslint src tests  # prettier/react-refresh warnings are known
npx vite build
```

## Where things are

| Path                  | What                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `src/game/core`       | Simulation (`sim.ts`), store, saves, input, settings, camera framing        |
| `src/game/render`     | 3D scene: characters, props, meadow, water, effects                         |
| `src/game/ui`         | HUD, touch controls, menus, journal, account                                |
| `src/game/online`     | Optional accounts, cloud saves and live presence (Supabase / Lovable Cloud) |
| `src/game/data`       | Tuning: classes, enemies, items, combat, quests                             |
| `scripts/models`      | Builds the 3D models from the KayKit packs                                  |
| `supabase/migrations` | Database for the online features                                            |

## Docs

- `docs/ROADMAP.md`: what's done and what's next.
- `docs/ONLINE.md`: accounts, cloud saves, presence, and how to switch them on in Lovable.
- `docs/ASSETS.md`: where the 3D art comes from (all CC0) and how to rebuild or add models.

## Credits

3D characters and world pieces are by [Kay Lousberg (KayKit)](https://kaylousberg.com). The few remaining props are by [Kenney](https://kenney.nl). All are CC0 (public domain).
