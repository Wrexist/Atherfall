# Aetherfall — Audit & Roadmap

Goal: the smoothest, cleanest, most enjoyable RPG/MMO on iPhone and Android.

This list comes from four audits (2026-09-25): rendering performance, gameplay logic,
mobile UX, and a live run on an emulated iPhone 13. Every item was checked against the code.

**Legend:** ✅ done · 🔜 next · ⬜ backlog. **P0** = broken on a real phone, **P1** = hurts
feel or polish, **P2** = improvement.

## Where the game stands

- **Classes:** 3 (Vanguard, Ranger, Arcanist).
- **Abilities:** 9, three per class, unlocking at levels 2, 3 and 4.
- **Combat:** dodge with i-frames, jump, swim, climb.
- **Enemies:** 9 types across 25 spawns, including 2 bosses with phase 2 and 2 one-time elites.
- **Quest line:** 2 quests.
- **World:** 5 regions, with fast-travel waypoints, secret caches, landmarks, shard nodes and a day/night cycle.
- **Items:** 21 items, 6 modifiers, forging to +5, sell and salvage, plus a codex.
- **Saves:** stored in the browser only, versioned.
- **Health:** 49 tests pass, typecheck is clean and the build passes.
- **Still missing:** everything that makes it an MMO (accounts, server, other players) and
  everything that makes it an installable phone app (store build, offline cache).

---

## Phase 1 — Mobile foundations ✅ (this pass)

| # | Pri | Item | Status |
|---|-----|------|--------|
| 1 | P0 | No sound on phones: audio was only unlocked by a mouse click. It now unlocks on any tap and resumes after interruptions. | ✅ |
| 2 | P0 | No way to pause on touch. Added a **Menu** button. | ✅ |
| 3 | P0 | Backgrounding (home button, call, app switch) now pauses, saves at once and suspends audio. Before, up to 12s of progress could be lost. | ✅ |
| 4 | P0 | Portrait layout overlapped the controls. Portrait now shows a "rotate your device" screen and pauses the game. | ✅ |
| 5 | P0 | Pause and title menus were clipped on landscape phones. Panels are now capped to the screen height and scroll. | ✅ |
| 6 | P0 | Phones started on Medium (shadows, DPR 1.5, MSAA). Touch or weak devices now default to **Low**. | ✅ |
| 7 | P0 | Adaptive resolution: render scale drops automatically when frames are missed and recovers when there's headroom. | ✅ |
| 8 | P0 | The HUD re-rendered 60×/s while Bark Ward healed. The heal now writes whole points only, and HUD and Pause subscribe to just the fields they show. | ✅ |
| 9 | P1 | Losing the WebGL context (iOS under memory pressure) left a black screen. There is now a recovery overlay and the canvas remounts. | ✅ |
| 10 | P1 | The 3D scene redrew at 60fps behind the pause, death and title screens. It now renders on demand there. | ✅ |
| 11 | P1 | Live `backdrop-blur` over the canvas is costly on mobile GPUs. It is off on touch devices. | ✅ |
| 12 | P1 | iOS long-press callout, text magnifier, tap flash and rubber-band scrolling are now disabled. | ✅ |
| 13 | P1 | A second finger could steal the joystick or look pad, and a finger sliding off the pad left it stuck. Pointer IDs are now tracked. | ✅ |
| 14 | P1 | Changing graphics quality never changed antialiasing. The canvas now remounts with the new setting. | ✅ |
| 15 | P1 | Fullscreen plus landscape lock on Android when tapping Begin. | ✅ |
| 16 | P1 | Home-screen install: manifest, icons, apple-touch-icon, theme-color, iOS full-screen meta tags. | ✅ |
| 17 | P1 | Dialogue box: respects safe areas, has a 44px Close button, and no longer shows "(E)" on touch. | ✅ |

## Phase 1b — Gameplay bugs ✅ (this pass, covered by `tests/regressions.test.ts`)

| # | Pri | Item | Status |
|---|-----|------|--------|
| 18 | P0 | Boss and elite loot was lost for good if the app closed before you walked over it. It now goes straight into the satchel. | ✅ |
| 19 | P0 | Reloading after dying brought you back at 0 HP inside the boss arena. You now wake at the nearest waypoint with 60% HP. | ✅ |
| 20 | P1 | Equipping and unequipping a +HP item was an unlimited free heal. Missing HP now stays the same across gear swaps. | ✅ |
| 21 | P1 | "Continue" after "Erase save" loaded the erased save. | ✅ |
| 22 | P1 | Enemies knocked into deep water froze there forever, including a cache guardian. | ✅ |
| 23 | P1 | Graphics quality and mute were saved but never restored. | ✅ |
| 24 | P1 | Corrupt or unknown-version saves were silently discarded, and unknown item IDs crashed the satchel. Saves are now repaired field by field and unreadable ones are kept aside. | ✅ |
| 25 | P1 | Landmark lore could pop up mid-boss-fight and block attacks. It now waits until combat ends. | ✅ |
| 26 | P2 | Camera shake kept jittering on the pause and death screens. | ✅ |
| 27 | P2 | Lint error: `useAbility` tripped the React hooks rule. Renamed to `castAbility`. | ✅ |

---

## Phase 2 — Smooth 60fps on mid-range phones 🔜 (recommended next)

| # | Pri | Item |
|---|-----|------|
| 28 | P1 | Remove `frustumCulled={false}` on instanced props (`Instances.tsx`), and split the scatter into spatial chunks so off-screen props aren't drawn. |
| 29 | P1 | Shadows: stop ~420 undergrowth props from casting. Shrink the sun frustum from ±55 to ~±25 and snap it to texels to stop shimmer. Consider character-only shadows on mobile. |
| 30 | P1 | Enemy animation: skip mixer updates for dead or far enemies, and hide enemies beyond fog distance (~130 draw calls today). |
| 31 | P1 | Floating damage numbers: replace the 12 drei `<Html>` roots with one overlay or instanced sprites. They also change `fontSize` every frame. |
| 32 | P1 | Per-frame allocations: `filter()` inside loops and `Color.set("#hex")` string parsing in `Effects.tsx`, `Characters.tsx` and `WorldObjects.tsx`. |
| 33 | P1 | The desktop ability bar is only hidden with CSS on phones and keeps running two rAF loops. Mount it per device instead. |
| 34 | P2 | Low quality: use `MeshLambertMaterial` for terrain, water and props. |
| 35 | P2 | Preload GLBs with `useGLTF.preload` to avoid a loading waterfall, and add a service worker so models are cached for the next launch and offline. |
| 36 | P2 | Mark static objects `matrixAutoUpdate=false`. Merge the crystals into one InstancedMesh. Pre-filter the large colliders used by the camera occlusion scan. |
| 37 | P2 | Dispose cloned materials on archetype change and old terrain geometry on quality change. |
| 38 | P2 | The world map canvas redraws every frame and ignores devicePixelRatio, so it is blurry on retina screens. |
| 39 | P2 | Add a battery-saver option (30fps cap). |

## Phase 3 — Mobile controls & feel

| # | Pri | Item |
|---|-----|------|
| 40 | P1 | Floating joystick: spawn it wherever the left thumb lands, like Genshin. |
| 41 | P1 | Settings: look sensitivity, invert Y, joystick size and opacity, left-handed layout, haptics on/off. |
| 42 | P1 | Haptics with `navigator.vibrate` on hit, dodge, damage and level-up (Android; iOS needs a native wrapper). |
| 43 | P1 | Input buffer of ~150ms. Attack presses are currently dropped during the first 30% of a swing, dodges and casts. |
| 44 | P1 | Lock-on / target-cycle button and camera recentre. Hold Attack to auto-combo. |
| 45 | P1 | First-run tutorial with contextual tips: move, look (drag right side), attack, dodge, heal. |
| 46 | P1 | Touch targets of at least 44px and text of at least 11px everywhere. Journal tabs, "Remove" and filter chips are 15–28px today. Faint text (parchment at 45–55%) fails contrast. |
| 47 | P1 | Inventory and journal: pad for safe areas, since the notch overlaps the tabs in landscape. |
| 48 | P1 | Touch-specific text: the climb prompt says "W climb · S descend · Space let go" and the controls list is keyboard-first. |
| 49 | P2 | HUD at 844×390: collapse the quest hint to one line and move toasts to the top so they don't collide with the ability arc. Add a minimap or quest arrow. |
| 50 | P2 | Knockback with velocity and decay instead of a teleport. Add enemy separation so groups don't stack on one point. Use noise-based camera shake. |
| 51 | P2 | Decide whether the bag should pause combat. Enemies keep attacking while it is open. At least show a warning. |
| 52 | P2 | Loading screen tips, and a retry if assets stall on slow networks. |

## Phase 4 — Remaining gameplay bugs

| # | Pri | Item |
|---|-----|------|
| 53 | P2 | A thorns kill during a boss charge can leave a zombie boss (double loot). Add `if (e.phase === "dead") return` after `damagePlayer` in `stepEnemy`. |
| 54 | P2 | `damagePlayer` writes HP from a stale store read, which can erase lifesteal or level-up heals. |
| 55 | P2 | A boss that resets keeps phase 2. |
| 56 | P2 | Shard nodes: regrow timers aren't reset on a new game and aren't saved, so reloading refills them. |
| 57 | P2 | Fixed RNG seed on every load, plus forging doesn't save at once: loot, crits and forge rolls can be save-scummed. |
| 58 | P2 | Pressing E mid-climb restarts the climb. |
| 59 | P2 | Ability numbers are hardcoded in the sim instead of read from data (ward 0.4, heal, haste 1.3, slow 0.45). |
| 60 | P2 | Any hit cancels Emberburst or Frost Nova but still spends the cooldown. |
| 61 | P2 | The drop cap deletes the oldest *untaken* loot, and drops never despawn. |
| 62 | P2 | Leash exploit: returning enemies can be hit but never fight back. |
| 63 | P2 | Blink skips the steep-slope check, so the Arcanist can skip the Watchstone climb. |

## Phase 5 — Ship as a real phone app

| # | Item |
|---|------|
| 64 | Wrap with **Capacitor** for App Store and Google Play builds. This adds native haptics, a status bar, orientation lock and splash screen. |
| 65 | Offline and asset caching with a service worker (see #35). Show the download size up front. |
| 66 | Crash and performance telemetry (e.g. Sentry) with device model and FPS buckets. |
| 67 | Real-device test matrix: iPhone SE/12/15, a mid-range Android (e.g. Galaxy A-series), a low-end Android. |
| 68 | Store assets: screenshots, privacy policy, age rating. |

## Phase 6 — Make it an MMO

The single-player loop is fun first. The MMO layer then builds on a backend (Lovable Cloud / Supabase).

| # | Item |
|---|------|
| 69 | **Accounts plus cloud saves.** Sign in (Apple, Google, email) and store the `SaveFile` server-side, keeping localStorage as an offline cache. |
| 70 | **Server-authoritative economy.** Loot, gold, forging and trades validated on the server (edge functions), so saves can't be edited for items. |
| 71 | **Presence.** See other players in Dawnreach through Realtime channels: position and animation at ~5–10Hz with client interpolation, sharded ~20–40 players per zone instance. |
| 72 | **Social.** Chat with moderation and filters, friends, parties (shared quest credit, shared loot rules), emotes. |
| 73 | **Co-op content.** World bosses on a timer, a party-scaled dungeon (the Barrow), daily and weekly quests. |
| 74 | **Progression depth.** Talent trees, more regions past the Tidewrack gate, crafting from shards, cosmetics. |
| 75 | **Live ops.** Events, season pass, leaderboards. |
| 76 | **Anti-cheat and safety.** Rate limits, movement sanity checks, report and block. |

## Housekeeping

| # | Item |
|---|------|
| 77 | 389 Prettier formatting errors: run `npm run format` once in its own commit. |
| 78 | `README.md` still says "Exact Screenshot Match". Replace it with a real project description. |
| 79 | Add CI (typecheck, lint, `bun test`) on every push. |
