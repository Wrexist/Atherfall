# Aetherfall Online — setup and design

Aetherfall plays fully offline. When a backend is configured, three things switch on:
- **Optional accounts:** email and password, plus a unique player name.
- **Cloud saves:** continue your journey on another phone.
- **Live presence:** see other signed-in players moving around Dawnreach, with name tags and an "N online" count.

## Turning it on in Lovable (one time, about 2 minutes)

1. **Enable Lovable Cloud.** In the Lovable editor, open the **Cloud** tab and enable it. Lovable creates the backend and fills in `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. The game picks these up automatically.
2. **Create the tables and permissions.** Ask the Lovable agent:
   > Apply the SQL migration in `supabase/migrations/20260925120000_online_foundation.sql` to the Cloud database.
3. **Check sign-in settings.** In **Cloud → Users → Auth settings**, keep **Email** sign-in on. Email confirmation can stay on: the game tells new players to confirm, then sign in.

That's it. The title screen now shows **Sign in · play online**.

Lovable Cloud is managed by Lovable and runs on its usage allowance. It does not use your own Supabase account or its free-project slots.

## What was tested

Everything below was run against a real local Supabase stack, the same software Lovable Cloud uses:

- **Security checks:** 18 of 18 passed (script kept outside the repo).
  - Sign-up creates the profile. A duplicate name, in any letter case, falls back to a "Wanderer…" name.
  - Players can read and write only their own save. Other players and signed-out users get nothing.
  - Players can only rename themselves. The database rejects invalid names and oversized saves.
  - Signed-in players can join the private world channel and receive each other's positions and presence. Signed-out users are refused.
- **End to end with two emulated phones:**
  - Both created accounts through the in-game dialog, and each saw the other walking, with a name tag and "2 online".
  - A third "device" signing in as the first player got **Continue — level 3** from the cloud.
- **Unit tests:** `tests/online.test.ts` covers save reconciliation, name rules, presence handling, smoothing, send rate and nearest-player limits.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Client | `src/game/online/client.ts` | Created only when the env vars exist. It shares the default Supabase session storage, so Lovable-generated auth (e.g. a Google button) shares the same session. |
| Accounts | `src/game/online/account.ts`, `src/game/ui/Account.tsx` | Sign-in is offered on the title screen only (that's where cloud and device saves are reconciled). |
| Cloud saves | `src/game/online/cloudSave.ts` | See the rules below. |
| Presence | `src/game/online/presence.ts`, `src/game/render/RemotePlayers.tsx` | Private Realtime channel `world:dawnreach`. See the rules below. |
| Database | `supabase/migrations/…_online_foundation.sql` | See the rules below. |
| Glue | `src/game/online/useOnline.ts` | Wires it all to the game lifecycle, and does nothing without a backend. |

**Cloud save rules**
- The device save stays the source of truth while playing.
- The latest save uploads at most every 30s, and at once when the app is backgrounded or on sign-out.
- On sign-in the game compares the two saves:
  - Newer device progress is uploaded.
  - A newer cloud save is offered as a choice, never forced.
  - A cloud-only save is loaded.
- Uploads only start after that comparison, so an old device can never overwrite newer progress made elsewhere.

**Presence rules**
- Each player sends 5 updates per second while moving, and a heartbeat every 3s while still.
- Other players are drawn smoothly between updates. Teleports snap instead of sliding across the map.
- At most the 16 nearest players are drawn.
- A player whose game is paused shows as "(away)".

**Database rules**
- `profiles` are public to read; each player can edit only their own.
- `saves` are private to their owner, capped at 256KB.
- A sign-up trigger creates the profile.
- Only signed-in players may use `world:*` channels.

## Cost and scale

- **Saves:** one small upsert per player every ~30s of play.
- **Presence:** each player's message reaches everyone else on the channel. So traffic grows with (players online)² while they move.
  - This is cheap for dozens of players.
  - For hundreds, shard players into instances (`world:dawnreach-1`, `-2`, … about 40 each; one constant in `presence.ts`).
  - Before that, check your Lovable plan's Cloud allowance.
- **When it gets big:** a Cloudflare Worker with Durable Objects (one object per zone instance, WebSockets) is the cheapest way to run an authoritative realtime game server at scale.
  - The presence code keeps the wire format small and in one module, so the transport can move there later without touching accounts or saves.
  - Accounts and saves would stay on Lovable Cloud.

## Not yet (next steps)

- **Server-checked economy.** Loot, gold, forging and trades are still decided on the device. Before anything tradeable exists between players, move them into Cloud functions (edge functions) that validate against the saved state.
- **Chat.** Needs moderation (filters, report and block) before it ships. Emotes are a safe first step.
- **Parties and co-op bosses.** They build on the presence channel: shared quest credit and a party-scaled Barrow.
- **Sign in with Google / Apple.** Lovable Cloud offers managed Google sign-in; ask Lovable to add it and it will share the session. Apple sign-in needs a native app build or your own OAuth setup.
- **Password reset.** Supabase sends reset emails; the game needs a small "Forgot password?" flow.
