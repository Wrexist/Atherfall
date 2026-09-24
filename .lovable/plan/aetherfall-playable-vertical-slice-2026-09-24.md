# AETHERFALL — Playable Vertical Slice

A third-person 3D action RPG you can actually play in the browser: explore the Dawnreach region, fight, loot, equip, and finish a starter quest in under 10 minutes.

## Art direction

Warm "storybook dusk" fantasy: golden late-afternoon light, soft green-gold meadows, weathered pale stone ruins, teal shoreline. Low-poly CC0 character and prop models with clean silhouettes, textured ground, light bloom only. Deliberately not neon/sci-fi.

## The world: Dawnreach

One handcrafted region, small but full, rather than empty terrain:

- **Emberhollow village** — a few houses, lantern posts, and the quest-giver NPC Warden Sela.
- **Whisperpine woods** — forest slope with roaming enemies.
- **The Sunken Arch ruins** — broken stone plaza where the miniboss waits.
- **Tidewrack shore** — beach edge that closes the map naturally and reveals the next destination.
- Elevation changes, a path network, and landmarks visible from spawn so the player always knows where to go.

## What the player can do

- Move, sprint, jump, light attack combo, take damage, drink a potion, die, respawn at the village.
- Desktop: WASD, mouse-look camera, left-click attack, Space jump, on-screen key hints.
- Mobile/landscape: virtual joystick, drag-to-look, large attack and jump buttons.
- Camera smoothly follows and pushes in when terrain or walls would block the view.

## Enemies

- **Bramblekin** — fast, weak, swipes with a short wind-up.
- **Hollow Sentinel** — slower armored striker with a clearly telegraphed overhead slam and a visible ground warning.
- **Miniboss: Thornmaw** — bigger Bramblekin variant at the ruins with more health and a charge attack.
- All have floating health bars, aggro range, and leash back home when you run away.

## Quest, loot, progression

Starter quest "Embers of Dawnreach" in four tracked steps: reach the woods → defeat 3 Bramblekin → loot and equip a weapon → defeat Thornmaw and return to Sela. Completion unlocks a marked new destination (Tidewrack gate) as the teaser for the next milestone.

Enemies drop items by rarity from a loot table. Pick-ups float in the world, go into a grid inventory, can be equipped in weapon/armor/trinket slots, and change the displayed attack/defense/health numbers immediately.

Progress (position, level, inventory, equipment, quest step) saves to the browser automatically with a versioned save format, plus a reset option.

## Polish and quality

- Loading screen with progress, plus a clear message if the device can't run 3D graphics.
- Low / Medium / High graphics setting that changes shadows, draw distance, and resolution scale.
- Pause menu with settings and controls list. No dead buttons, no fake systems.
- Simple synthesized hit/step/pickup sounds with a mute toggle.

## Technical section

- React 19 + TypeScript with three.js via `@react-three/fiber` v9 and `@react-three/drei` v10, mounted on a client-only route (`ssr: false`) at `/`.
- Simulation lives in a plain mutable game-state store stepped inside `useFrame` (delta-timed, `Math.exp(-k*dt)` damping); React only renders HUD/menus, subscribing through a lightweight store so per-frame values never trigger React re-renders.
- Modules: `src/game/world`, `player`, `camera`, `input`, `combat`, `enemies`, `loot`, `quests`, `inventory`, `progression`, `persistence`; tuning data (enemy stats, items, loot tables, quest steps) in `src/game/data/*.ts` separate from rendering.
- Characters and props from CC0 kits (Kenney / Quaternius / poly.pizza), downloaded and validated before any code references them; terrain, paths and ruins generated procedurally with canvas textures. Primitives only where a shape isn't a recognizable named object.
- Custom arcade movement physics: heightfield terrain sampling for ground contact, capsule-vs-sphere collision for enemies and obstacles, camera raycast for occlusion. No physics engine.
- Save data in `localStorage` under a versioned schema with migration guard. No backend in this milestone.
- Verified in-browser with screenshots and console/network checks before delivery.

## Out of scope for this slice

Multiplayer, skill trees, crafting, multiple regions, cloud saves, accounts.
