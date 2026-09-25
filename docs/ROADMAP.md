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

## Phase 2 — Smooth 60fps on mid-range phones ✅ (mostly done)

Measured on an emulated iPhone 13 (software renderer, same resolution before and after):

| Quality | Triangles per frame | Frame time |
|---------|---------------------|------------|
| **Low** (phone default) | 91k → 34k (−63%) | 54ms → 30ms (~1.8× faster) |
| **Medium** | 268k → 119k (−55%) | 181ms → 156ms (~14% faster) |

A real phone GPU is far faster in absolute terms, but it is limited by the same things: fill rate and vertex work.

| # | Pri | Item | Status |
|---|-----|------|--------|
| 28 | P1 | Props split into 48m spatial chunks with tight bounds, so off-screen cells are culled in both the camera and shadow passes. Cells past the fog are hidden. | ✅ |
| 29 | P1 | ~280 undergrowth props no longer cast shadows. The sun's shadow box shrank from ±55 to ±32 (Medium) / ±48 (High) and is snapped to shadow-map texels, so there's no shimmer. | ✅ |
| 30 | P1 | Own animation mixers: full rate within 30m, every 3rd frame (staggered) up to 70m, frozen beyond. Enemies past the fog are hidden. | ✅ |
| 31 | P1 | Floating damage numbers: one DOM overlay projected in a single pass, instead of 12 `<Html>` React roots. | ✅ |
| 32 | P1 | Per-frame `filter()` allocations removed. Colours use a shared parsed cache. Material flashes are skipped when unchanged. | ✅ |
| 33 | P1 | The desktop ability bar is no longer mounted on phones. All HUD readouts share one animation-frame loop and skip unchanged DOM writes. | ✅ |
| 34 | P2 | Low quality uses Lambert shading for terrain, water, props and characters. | ✅ |
| 35 | P2 | All GLBs start downloading together (preload). A service worker (`public/sw.js`, production only) caches models, icons and fonts (served instantly, refreshed in the background) and hashed app bundles. The page itself is network-first, so releases are never held back. Verified: the game relaunches and plays with the network off. | ✅ |
| 36 | P2 | Instanced props are static (`matrixAutoUpdate=false`). Camera occlusion checks only the 42 large colliders instead of 459. Crystal heights are precomputed. | ✅ |
| 37 | P2 | Dispose cloned materials and terrain geometry. Mostly moot now: a quality change remounts the canvas, which frees the GPU context. | ⬜ |
| 38 | P2 | The world map is sharp on retina screens and redraws at ~20fps instead of 60. | ✅ |
| 39 | P2 | Add a battery-saver option (30fps cap). | ⬜ |

## Phase 3 — Mobile controls & feel ✅ (mostly done)

| # | Pri | Item | Status |
|---|-----|------|--------|
| 40 | P1 | Floating joystick: it appears wherever the left thumb lands on the left half. It can be switched back to a fixed stick. | ✅ |
| 41 | P1 | Settings: look sensitivity, invert Y, hold-to-attack, floating joystick, vibration. Stored per device. Still to do: joystick size and opacity, left-handed layout. | ◐ |
| 42 | P1 | Vibration on hit, damage, perfect evade, kill, burst, boss roar, level-up and death (Android; iPhone browsers have no vibration API). | ✅ |
| 43 | P1 | 180ms input buffer for attack, dodge and abilities: early presses fire as soon as they're allowed instead of being dropped. | ✅ |
| 44 | P1 | Hold Attack to keep swinging (touch and mouse). Lock-on: the Target button (Tab/R on keyboard) locks the nearest enemy in view, tap again for the next, then off. The camera tracks the target, attacks aim at it, a gold ring marks it, and the lock drops on death or distance. | ✅ |
| 45 | P1 | First-run tips, one at a time, each cleared by doing it: move, look, talk to Sela, attack (when an enemy engages), dodge (when a red zone appears), heal (below 50% HP). Touch and keyboard wording differ. Shown once per device. | ✅ |
| 46 | P1 | Journal buttons are at least 44px on touch, and 8–10px text is now 11px+. Faint text raised to 70% opacity where touched. | ✅ |
| 47 | P1 | Journal respects safe areas. The map fits the screen with the fast-travel list beside it, and the satchel shows gear and bag side by side on landscape phones. The old `md` breakpoint was 768px, but a landscape iPhone is ~750px. | ✅ |
| 48 | P1 | Touch-specific controls list. The climb prompt no longer names keys. | ✅ |
| 49 | P2 | HUD on landscape phones: vitals and quest panels stay compact (they used to grow at 640px). Tips and toasts sit top-centre, clear of the thumbs. The "E" key hint is hidden on touch. A quest marker shows the distance over the current goal (the NPC, the area, or the nearest living target) and slides to the screen edge, pointing the way, when the goal is off-screen. | ✅ |
| 50 | P2 | Enemy knockback is a quick decaying slide instead of a teleport. Getting hit costs a moment of control so your own knockback reads. Nearby enemies push apart instead of stacking. Camera shake is smooth, frame-rate independent, with a small roll kick. | ✅ |
| 51 | P2 | Decide whether the bag should pause combat. Enemies keep attacking while it is open (seen in testing: damage taken with the map open). At least show a warning. | ⬜ |
| 52 | P2 | Loading screen tips, and a retry if assets stall on slow networks. | ⬜ |

## Phase 4 — Remaining gameplay bugs ✅ (tests in `tests/regressions.test.ts` and `tests/world.test.ts`)

| # | Pri | Item | Status |
|---|-----|------|--------|
| 53 | P2 | A thorns kill at the end of a boss charge left a zombie boss (double loot). | ✅ |
| 54 | P2 | `damagePlayer` wrote HP from a stale store read, erasing lifesteal or level-up heals triggered by thorns. | ✅ |
| 55 | P2 | A boss that resets now returns to its calm first phase. | ✅ |
| 56 | P2 | Shard nodes reset for a new game. **Still to do:** regrow timers aren't saved, so reloading refills the 6 nodes (small payoff). | ◐ |
| 57 | P2 | Each session gets a fresh random seed (tests keep the fixed one), and forging saves at once, so rolls can't be save-scummed. | ✅ |
| 58 | P2 | Pressing E mid-climb restarted the climb. | ✅ |
| 59 | P2 | Ward, heal, haste and slow numbers are now read from `combat.ts` data. | ✅ |
| 60 | P2 | Ability casts have armour: a hit no longer cancels Emberburst or Frost Nova after the cooldown is spent. | ✅ |
| 61 | P2 | Unclaimed loot fades (coin after 3 min, gear after 5), so the drop cap no longer deletes fresh loot. | ✅ |
| 62 | P2 | Leash exploit: enemies walking home "Evade" hits. | ✅ |
| 63 | P2 | Blink obeys the same steep-slope rule as walking. | ✅ |

## Phase 5 — Ship as a real phone app

| # | Item |
|---|------|
| 64 | Wrap with **Capacitor** for App Store and Google Play builds. This adds native haptics, a status bar, orientation lock and splash screen. |
| 65 | ✅ Offline and asset caching (see #35). Still to do: show the download size up front. |
| 66 | Crash and performance telemetry (e.g. Sentry) with device model and FPS buckets. |
| 67 | Real-device test matrix: iPhone SE/12/15, a mid-range Android (e.g. Galaxy A-series), a low-end Android. |
| 68 | Store assets: screenshots, privacy policy, age rating. |

## Phase 6 — Make it an MMO (backend: Lovable Cloud, see `docs/ONLINE.md`)

| # | Item | Status |
|---|------|--------|
| 69 | **Accounts plus cloud saves.** Optional email sign-in and a unique player name. Cloud saves reconcile with the device save on sign-in and never silently overwrite progress. Tested against a real local Supabase. **To switch on:** enable Lovable Cloud and apply the migration (2 steps in `docs/ONLINE.md`). Still to do: Google sign-in, password reset. | ◐ |
| 70 | **Server-authoritative economy.** Loot, gold, forging and trades validated on the server (edge functions), so saves can't be edited for items. Needed before anything is tradeable. | ⬜ |
| 71 | **Presence.** Other signed-in players are shown live, with name tags and an "N online" count, over a private channel for signed-in players only. Shard into instances when busy; move to Cloudflare Durable Objects at scale. | ✅ |
| 72 | **Social.** Chat with moderation and filters, friends, parties (shared quest credit, shared loot rules), emotes. | ⬜ |
| 73 | **Co-op content.** World bosses on a timer, a party-scaled dungeon (the Barrow), daily and weekly quests. | ⬜ |
| 74 | **Progression depth.** Talent trees, more regions past the Tidewrack gate, crafting from shards, cosmetics. | ⬜ |
| 75 | **Live ops.** Events, season pass, leaderboards. | ⬜ |
| 76 | **Anti-cheat and safety.** Rate limits, movement sanity checks, report and block. | ⬜ |

## Housekeeping

| # | Item |
|---|------|
| 77 | 389 Prettier formatting errors: run `npm run format` once in its own commit. |
| 78 | `README.md` still says "Exact Screenshot Match". Replace it with a real project description. |
| 79 | Add CI (typecheck, lint, `bun test`) on every push. |
