# Parties — design proposal (for review before building)

Status: **approved 2026-09-25**. The owner chose: parties of **4**, **personal loot**, **XP shared with members nearby**, and invites from **anyone nearby** by default (players can switch them off). Being built in the order below.

## What players get

- **Invite nearby players.** Tap Party, and you see the signed-in players near you (from live presence). Tap one to invite them. They get a popup: _"Rowan invites you to a party — Join / No thanks"_.
- **Up to 4 per party**. There's one leader, who can remove members. Anyone can leave.
- **Shared quest credit.** When a party member kills an enemy your current quest needs, and you're close by, it counts for you too. Everyone progresses together.
- **Party frames on the HUD.** Name, class, level and a health bar for each other member, under your vitals. Members who go quiet show "away".
- **Loot stays personal**. Everyone gets their own drops, as today. Nothing is shared or traded until the server-validated economy exists (roadmap #70).

## Why this needs the server (and presence alone isn't enough)

Live presence works because it's harmless: every client broadcasts its own position, and the `id` inside a message is whatever that client wrote. That's fine for drawing players. For parties it isn't: anyone could send "Rowan invited you" or "I'm in your party". So:

- **Who is in which party lives in the database**, and only server functions change it. Each function acts as `auth.uid()`, the signed-in caller, and nobody else.
- **Party chatter (health, kills) goes over a private channel per party**, `party:<id>`. Row-level security lets only that party's members join it. A non-member can't listen or send.

## Data model (sketch)

```sql
parties        (id uuid pk, leader uuid → auth.users, created_at)
party_members  (party_id → parties, user_id → auth.users unique, joined_at)   -- one party at a time
party_invites  (id uuid pk, party_id → parties, from_user, to_user, created_at, expires_at)  -- 2 min expiry
```

Row-level security:

- Members can read their own party and member list.
- The inviter and the invitee can read an invite.
- There are no direct writes. Every change goes through these functions (`security definer`, always using `auth.uid()`):

| Function                                     | Rules                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invite_to_party(to_user)`                   | Creates a party with you as leader if you have none. Refuses if the party is full or the target is already in one. Rate limited to about 5 invites a minute. Refuses if the target has blocked you (block list comes with chat). |
| `accept_invite(invite_id)`                   | The invite must be yours and still valid. You must not be in a party, and the party must not be full.                                                                                                                            |
| `decline_invite(invite_id)`, `leave_party()` | If the leader leaves, the longest-standing member becomes leader. An empty party is deleted.                                                                                                                                     |
| `remove_member(user_id)`                     | Leader only.                                                                                                                                                                                                                     |

**Invites arrive instantly** through Realtime database changes on `party_invites` rows addressed to you. Joins and leaves arrive the same way, on `party_members` for your party.

## Party channel messages (`party:<id>`, private, members only)

| Event   | Payload                     | When                           | Size  |
| ------- | --------------------------- | ------------------------------ | ----- |
| `state` | `{ hp: 0..1, lvl, region }` | Every 2 s and on change        | ~40 B |
| `kill`  | `{ sid, type, x, z }`       | When the sender kills an enemy | ~50 B |

Cost: a full party of 4 sends about 2 messages a second in total. That's negligible next to presence.

## Shared kill credit: how it stays fair

Credit is decided on **your** device, from your own world. A `kill` message from a party member counts for you only when **all** of these hold:

1. Its enemy `type` is what your current quest step needs.
2. You're within **35 m** of where it died.
3. Your own world has that spawn (`sid`) near that spot. The spawn layout is identical for everyone, so made-up enemies don't count.
4. That spawn hasn't already given you credit during its current respawn cycle (no double counting).

This is still client-side, so a modified client could fake kills. The worst case is a friend finishing a quest step faster, which is harmless now because loot and gold aren't shared. It gets revisited with the server-validated economy.

**XP**: members within range also get the kill's XP (owner's decision). It's what players expect, and the risk is the same as for quest credit.

## HUD (portrait)

```
┌──────────────────────────┐  ┌───────────┐
│ VANGUARD          Lv 6   │  │ EMBERHOLLOW│
│ ███████████░░░  110/210  │  │ 12 · 3     │
├──────────────────────────┤  └───────────┘
│ Rowan   Ranger 5  ██████░ │  ← party frames (tap = nothing yet)
│ Mira    Mage 4    ███░░░░ │
│ Kess    Knight 6  (away)  │
├──────────────────────────┤
│ EMBERS OF DAWNREACH      │
│ Cull 3 Bramblekin (2/3)  │
└──────────────────────────┘
```

Invite popup: centred, big buttons, auto-dismisses after 30 s. A **"Party invites: everyone nearby / nobody"** setting **[you decide which is the default]**.

## Safety

- Invites only come from signed-in players and are rate limited. You can turn them off. Blocking comes with the chat work (roadmap #72).
- No free text anywhere in parties. Names are the existing validated player names.

## Build order (each a small, tested PR)

1. **Database:** tables, security rules and functions, with a Postgres test script like the saves one (fake invites refused, non-members can't join the channel).
2. **Party state and invites in the game:** Party button, invite list from presence, invite popup, leave and remove.
3. **Party channel:** HUD frames and health.
4. **Shared kill credit and XP,** with unit tests for the four fairness rules.

Everything stays invisible offline, and for players who aren't signed in.
