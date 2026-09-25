import type { RealtimeChannel } from "@supabase/supabase-js";
import { create } from "zustand";
import { useAccount } from "./account";
import { backend } from "./client";
import type { RemotePlayer } from "./presence";

/**
 * Parties (docs/PARTIES.md): who is in your party and who invited you. The
 * database decides everything (security-definer functions acting as the
 * signed-in player); this module mirrors it, updated live by Realtime and
 * refreshed after every action and every so often in case the live link
 * drops.
 */

export const PARTY_SIZE = 4;
/** Only players this close can be invited from the party panel. */
export const INVITE_RANGE = 25;
/** How often to re-check while signed in, in case a live update was missed. */
const REFRESH_MS = 20_000;

export interface PartyMember {
  id: string;
  name: string;
  archetype: string;
  level: number;
}

export interface PartyInvite {
  id: string;
  fromName: string;
  /** When it expires, on this device's clock. */
  expiresAt: number;
}

interface PartyState {
  partyId: string | null;
  leader: string | null;
  members: PartyMember[];
  invites: PartyInvite[];
  /** Whether this player takes invites (profiles.party_invites). */
  open: boolean;
  busy: boolean;
  error: string | null;
}

const EMPTY: PartyState = {
  partyId: null,
  leader: null,
  members: [],
  invites: [],
  open: true,
  busy: false,
  error: null,
};

export const useParty = create<PartyState>(() => ({ ...EMPTY }));

/**
 * Players you could invite: placed nearby (from live presence), not yourself,
 * not already in your party, nearest first. Presence ids are only a target
 * here: the server checks the rest, and the invitee sees the real inviter.
 */
export function invitableNearby(
  players: Iterable<RemotePlayer>,
  selfId: string | null,
  members: readonly PartyMember[],
  x: number,
  z: number,
  range = INVITE_RANGE,
): RemotePlayer[] {
  const inParty = new Set(members.map((m) => m.id));
  return Array.from(players)
    .filter((r) => r.placed && r.id !== selfId && !inParty.has(r.id))
    .map((r) => ({ r, d: Math.hypot(r.rx - x, r.rz - z) }))
    .filter(({ d }) => d <= range)
    .sort((a, b) => a.d - b.d)
    .map(({ r }) => r);
}

/** The server's wording, trimmed of Postgres prefixes, for toasts. */
function tidy(message: string) {
  return message.replace(/^.*?ERROR:\s*/i, "").trim();
}

async function call(fn: string, args: Record<string, unknown> = {}) {
  const sb = backend();
  if (!sb) return false;
  useParty.setState({ busy: true, error: null });
  const { error } = await sb.rpc(fn, args);
  useParty.setState({ busy: false, error: error ? tidy(error.message) : null });
  await refreshParty();
  return !error;
}

export const inviteToParty = (userId: string) => call("invite_to_party", { p_to: userId });
export const acceptInvite = (inviteId: string) => call("accept_invite", { p_invite: inviteId });
export const declineInvite = (inviteId: string) => call("decline_invite", { p_invite: inviteId });
export const leaveParty = () => call("leave_party");
export const removeMember = (userId: string) => call("remove_member", { p_user: userId });

/** Take party invites or not (players can switch them off). */
export async function setInvitesOpen(open: boolean) {
  const sb = backend();
  const userId = useAccount.getState().userId;
  if (!sb || !userId) return;
  useParty.setState({ open });
  const { error } = await sb.from("profiles").update({ party_invites: open }).eq("id", userId);
  if (error) useParty.setState({ open: !open, error: tidy(error.message) });
}

/** What the server says about my party and invites, as the store holds it. */
export type PartySnapshot = Pick<PartyState, "partyId" | "leader" | "members" | "invites" | "open">;

/** Read party, members and pending invites (null without a backend). */
async function readParty(userId: string): Promise<PartySnapshot | null> {
  const sb = backend();
  if (!sb) return null;
  const [mine, invites, me] = await Promise.all([
    sb.from("party_members").select("party_id").eq("user_id", userId).maybeSingle(),
    // Live ones only, timed by the server's clock (see the migration).
    sb.rpc("my_party_invites"),
    sb.from("profiles").select("party_invites").eq("id", userId).maybeSingle(),
  ]);
  const partyId = (mine.data?.party_id as string | undefined) ?? null;
  let leader: string | null = null;
  let members: PartyMember[] = [];
  if (partyId) {
    const [party, rows] = await Promise.all([
      sb.from("parties").select("leader").eq("id", partyId).maybeSingle(),
      sb
        .from("party_members")
        .select("user_id, joined_at")
        .eq("party_id", partyId)
        .order("joined_at"),
    ]);
    leader = (party.data?.leader as string | undefined) ?? null;
    members = await profilesFor((rows.data ?? []).map((r) => r.user_id as string));
  }
  const now = Date.now();
  const inviteRows = (invites.data ?? []) as {
    id: string;
    from_name: string | null;
    seconds_left: number;
  }[];
  return {
    partyId,
    leader,
    members,
    invites: inviteRows.map((r) => ({
      id: r.id,
      fromName: r.from_name ?? "A player",
      expiresAt: now + Math.max(0, r.seconds_left) * 1000,
    })),
    open: (me.data?.party_invites as boolean | undefined) ?? true,
  };
}

/** Swappable for tests, like cloud in cloudSave.ts. */
export const partyIo = { read: readParty };

/**
 * Bumped by every refresh and by stopping. Refreshes overlap (actions, live
 * updates, the timer), so only the newest one's answer is kept: an older,
 * slower one must not undo it, and nothing lands after sign-out.
 */
let refreshSeq = 0;

/** Re-read party, members and pending invites from the server. */
export async function refreshParty() {
  const userId = useAccount.getState().userId;
  if (!userId) return;
  const seq = ++refreshSeq;
  const snap = await partyIo.read(userId);
  if (!snap || seq !== refreshSeq || useAccount.getState().userId !== userId) return;
  useParty.setState(snap);
  watchParty(snap.partyId, userId);
}

async function profilesFor(ids: string[]): Promise<PartyMember[]> {
  const sb = backend();
  if (!sb || ids.length === 0) return [];
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, archetype, level")
    .in("id", ids);
  const byId = new Map((data ?? []).map((p) => [p.id as string, p]));
  return ids.map((id) => {
    const p = byId.get(id);
    return {
      id,
      name: (p?.display_name as string | undefined) ?? "Player",
      archetype: (p?.archetype as string | undefined) ?? "vanguard",
      level: (p?.level as number | undefined) ?? 1,
    };
  });
}

// ─── Live updates ──────────────────────────────────────────────────────────

let live: RealtimeChannel | null = null;
let liveKey = "";
let timer: ReturnType<typeof setInterval> | null = null;

/** Follow invites to me and changes to my party's members. */
function watchParty(partyId: string | null, userId: string) {
  const sb = backend();
  const key = `${userId}:${partyId ?? ""}`;
  if (!sb || key === liveKey) return;
  if (live) void sb.removeChannel(live);
  liveKey = key;
  const ch = sb.channel(`party-watch:${userId}`);
  ch.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "party_invites", filter: `to_user=eq.${userId}` },
    () => void refreshParty(),
  );
  if (partyId) {
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "party_members", filter: `party_id=eq.${partyId}` },
      () => void refreshParty(),
    );
  }
  live = ch;
  ch.subscribe();
}

/** Stop following parties and forget them (sign-out). */
export function stopParties() {
  refreshSeq++; // drop answers still on their way
  if (timer) clearInterval(timer);
  timer = null;
  const sb = backend();
  if (live && sb) void sb.removeChannel(live);
  live = null;
  liveKey = "";
  useParty.setState({ ...EMPTY });
}

/** Start following parties for the signed-in player. Returns stopParties. */
export function startParties() {
  if (!backend()) return () => {};
  void refreshParty();
  timer = setInterval(() => void refreshParty(), REFRESH_MS);
  return stopParties;
}
