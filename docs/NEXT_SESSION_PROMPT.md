# Master prompt: next Aetherfall session (local Claude Code)

Paste everything below the line into a local Claude Code session opened in your Atherfall folder
(or an empty folder: it will clone the repo).

---

You are continuing development of **Aetherfall**, a browser 3D action RPG (React 19 + TypeScript,
three.js via @react-three/fiber and drei, zustand, TanStack Start, Tailwind v4, Bun for tests).
Repo: https://github.com/Wrexist/Atherfall. The project is connected to **Lovable**.

**The goal:** the smoothest, cleanest, most enjoyable RPG/MMO on iPhone and Android. Work autonomously.
Keep doing the next most valuable item, verify it properly, commit, push, and continue. Stop to ask me
only for decisions that are genuinely mine: money, accounts, or product direction.

## 0. Get the latest code

1. If there is no checkout, clone `https://github.com/Wrexist/Atherfall.git` and `cd` into it.
2. Run `git fetch --all --prune && git checkout main && git pull`.
   PR #1 (mobile foundations, performance, controls, online) is already merged into `main`.
3. Create a branch for this session's work, e.g. `git checkout -b dev/next-<date>`. Push it and open a PR into `main` when a batch is ready. `main` is the branch Lovable syncs, so only merge working code into it.
4. If `main` later gets new commits (e.g. edits made in Lovable), bring them in with `git merge origin/main` (never rebase) and resolve any conflicts.

## 1. Rules (important)

- **Read `AGENTS.md` first.** Never force-push, and never rebase, amend or squash commits that are already pushed: it breaks Lovable's history. Keep every pushed commit in a working state.
- **Don't create anything in my own Supabase account.** It has no free project slots left. The live backend is Lovable Cloud, which I enable myself in the Lovable editor. For testing, run a *local* Supabase in Docker (below).
- **Work in small, verified batches.** One theme per commit, with a clear message. For every bug fix, add a regression test and confirm it fails on the old code before it passes on the new.
- **Mobile first.**
  - Every change must work on a landscape phone (~750×342 CSS px, i.e. iPhone in Safari), respect safe areas, keep tap targets ≥ 44px, and never show keyboard key names on touch.
  - Landscape phones pass Tailwind's `sm` (640px) but not `md` (768px). Pick breakpoints with that in mind.
- **Performance budget.** No allocations or `Color.set("#hex")` in `useFrame` (use `col()` from `render/colors.ts`). No per-frame React store writes. No `backdrop-blur` on touch.
- **Offline must keep working.** With no `VITE_SUPABASE_*` env vars the game must play exactly as before, with no sign-in UI and no network calls.

## 2. Orient yourself (read before changing anything)

- `docs/ROADMAP.md`: the full audit list with status (✅ done, ◐ partial, ⬜ / 🔜 open). **This is your task list.**
- `docs/ONLINE.md`: accounts, cloud saves and live presence. Covers design, security rules, scale plan, and how to enable Lovable Cloud.
- Code map:
  - `src/game/core` (simulation `sim.ts`, `store.ts`, `persistence.ts`, `input.ts`, `settings.ts`, `audio.ts`, `questTarget.ts`)
  - `src/game/render` (scene, instancing, characters, effects, quest marker, remote players)
  - `src/game/ui` (HUD, menus, touch controls, journal, tips, account)
  - `src/game/online` (Supabase client, account, cloud save, presence)
  - `src/game/data` (tuning data)
  - `supabase/migrations`
  - `public/sw.js` (service worker)
  - `tests/`

## 3. Baseline checks (run first, and again before every push)

```sh
bun install
bun test ./tests                 # all must pass (72 at last count)
npx tsc --noEmit -p .            # must be clean
npx eslint src tests             # ignore prettier/prettier and react-refresh warnings (pre-existing); nothing else allowed
npx vite build                   # must succeed
```

## 4. How to verify in a real browser (don't skip; tests alone aren't enough for UI/feel)

- **Dev server:** `npx vite dev --host 127.0.0.1 --port 5173`.
- **Drive it with Playwright** (Chromium) using `devices['iPhone 13 landscape']` and screenshot the result. Look at the screenshots. Headless WebGL needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- **Measuring render cost:** wrap `WebGL2RenderingContext.prototype.drawElements` and friends in an init script to count draw calls and triangles per frame. Compare before/after at a *pinned* render scale: adaptive DPR otherwise skews timings.
- **Gotchas:**
  - After editing files while the dev server runs, a test that does `await import('/src/…')` in the page can get a *stale separate module copy* (HMR timestamps). Restart the dev server before such tests.
  - Don't `pkill -f "vite dev"` in the same shell command that starts the server (the pattern matches your own command).
- **Production/offline checks:** build with `NITRO_PRESET=node-server npx vite build`, run `HOST=127.0.0.1 PORT=4173 node .output/server/index.mjs`, and test the service worker there. The default build targets Cloudflare.
- **Online features, against a LOCAL Supabase** (never my account):
  - Start Docker, then `npx supabase init` in a scratch folder.
  - Copy in `supabase/migrations/*.sql` and run `npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit`.
  - Run the game with `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from supabase status>`.
  - Test with two browser contexts (two "phones") and check that security rules hold (players can't read or write each other's saves).
- **Real devices:** open the dev server from my phone on the same Wi-Fi (`--host 0.0.0.0`). Add a small debug FPS overlay (e.g. `?debug=1`) if it helps me report real-device numbers.

## 5. What to do, in priority order

**A. Review leftovers first.**
- PR #1 is merged, but its review bots (Codex, CodeRabbit) may have left comments after the merge. Read them on https://github.com/Wrexist/Atherfall/pull/1.
- Verify each finding against the code on `main`, and fix the real ones (with tests) in your new branch.

**B. Remaining ⬜/◐ roadmap items** (small, high value):
1. **#51, combat while the journal is open.** Keep the world running (it's an MMO), but show an "In combat!" warning in the journal, and let the Bag/Map buttons show enemies are near.
2. **#41, more control settings:** joystick size and opacity, and a left-handed layout that mirrors the controls.
3. **#39, battery saver:** a 30 fps cap option in settings.
4. **#52, loading screen:** tips, plus a "Retry" when assets stall.
5. **#56, shard nodes:** save regrow timers so reloading doesn't refill them.
6. **#65:** show the download size before the first load on mobile data.
7. **#37:** dispose cloned materials and old terrain geometry when the character model is swapped.

**C. Online (Lovable Cloud).** Check `docs/ONLINE.md`. If Lovable Cloud isn't enabled yet, remind me of the 2 steps.
1. "Forgot password?" flow (Supabase reset email + a set-new-password screen).
2. Emotes (wave, cheer, sit) broadcast over the presence channel. Safe social features before chat.
3. **Parties:** invite nearby players, shared quest kill credit, party frames on the HUD. Design the messages on the existing Realtime channel first, and show me the design before building.
4. World sharding (`world:dawnreach-N`, about 40 players each) when a channel is busy.
5. **Server-validated economy** (Cloud edge functions for loot, gold and forging) before anything becomes tradeable. **This is big: propose a design and ask before building.**
6. Chat only with moderation (filter, report, block). Ask me first.

**D. Native apps (can only be done on my machine; Phase 5 in the roadmap).**
1. Add **Capacitor** (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`). Point it at the built client assets. Configure landscape lock, status bar hidden, splash screen, and native haptics (`@capacitor/haptics`, wired into the existing `haptic()` in `core/settings.ts`).
2. Build and run on Android (Android Studio) first, then iOS (Xcode, which needs a Mac). Tell me exactly which accounts I need: Apple Developer is $99 a year, Google Play is $25 once.
3. Measure FPS on a real mid-range Android and an iPhone. Fix whatever is slow.

**E. Housekeeping.**
- One commit that only runs `npm run format` (Prettier). Nothing else in it.
- Rewrite `README.md`: it still says "Exact Screenshot Match".
- Add GitHub Actions CI: bun install, typecheck, eslint (without prettier noise), `bun test ./tests`, build.

**F. Content and progression depth** (ask me for direction before starting):
- A new region past the Tidewrack gate.
- Talent trees.
- Crafting from Aether Shards.
- Cosmetics.
- Daily quests and world bosses.

## 6. Reporting

After each batch, update `docs/ROADMAP.md` (status and what was verified), then commit and push. In chat, tell me in plain language:
- what changed for players;
- how you verified it (tests, screenshots, measurements);
- what's next;
- anything you need from me.

Be honest about what you could not verify (e.g. real-device performance).
