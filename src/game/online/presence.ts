import type { RealtimeChannel } from "@supabase/supabase-js";
import { create } from "zustand";
import { backend } from "./client";

/**
 * Live world presence: see other signed-in players moving around Dawnreach.
 *
 * Each client broadcasts its own position a few times a second on a private
 * Realtime channel (only signed-in players may join — see the migration), and
 * renders everyone else smoothly interpolated between updates. Nothing here is
 * authoritative: it is purely social. Combat and loot stay local for now.
 */

/** One shared world channel for now; shard into "world:dawnreach-2"… when it gets busy. */
export const WORLD_TOPIC = "world:dawnreach";
/** Position updates per second while moving (idle players only send a heartbeat). */
export const SEND_HZ = 5;
export const HEARTBEAT_MS = 3000;
/**
 * A player still in the channel but silent this long is shown as "away" (a
 * paused game stops sending). Players who actually leave are removed by the
 * presence sync.
 */
export const STALE_MS = 12_000;
/** Never draw more than this many other players (nearest first). */
export const MAX_SHOWN = 16;

export interface PosMessage {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Animation state name (walk, sprint, attack1, …). */
  a: string;
}

export interface PresenceMeta {
  name: string;
  archetype: string;
  level: number;
}

export interface RemotePlayer extends PresenceMeta {
  id: string;
  /** Latest reported state. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: string;
  /** Smoothed state that is actually drawn. */
  rx: number;
  ry: number;
  rz: number;
  ryaw: number;
  /** ms timestamp of the last message. */
  seen: number;
  /** False until the first position arrives (don't draw players at 0,0). */
  placed: boolean;
}

export const remotes = new Map<string, RemotePlayer>();

export const usePresence = create<{ connected: boolean; online: number; ids: string[] }>(() => ({
  connected: false,
  online: 0,
  ids: [],
}));

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Apply one position message. Malformed messages are ignored. */
export function applyPosition(
  map: Map<string, RemotePlayer>,
  msg: Partial<PosMessage>,
  now: number,
  selfId: string | null,
) {
  if (typeof msg.id !== "string" || msg.id === selfId) return;
  if (!finite(msg.x) || !finite(msg.y) || !finite(msg.z) || !finite(msg.yaw)) return;
  let r = map.get(msg.id);
  if (!r) {
    // Heard before presence metadata arrived: placeholder until the sync fills it in.
    r = {
      id: msg.id,
      name: "",
      archetype: "vanguard",
      level: 1,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      anim: "idle",
      rx: 0,
      ry: 0,
      rz: 0,
      ryaw: 0,
      seen: now,
      placed: false,
    };
    map.set(msg.id, r);
  }
  r.x = msg.x;
  r.y = msg.y;
  r.z = msg.z;
  r.yaw = msg.yaw;
  r.anim = typeof msg.a === "string" ? msg.a.slice(0, 24) : "idle";
  r.seen = now;
  if (!r.placed) {
    r.rx = r.x;
    r.ry = r.y;
    r.rz = r.z;
    r.ryaw = r.yaw;
    r.placed = true;
  }
}

/** Presence sync: fill in names/classes, and drop players who have left the channel. */
export function applyPresence(
  map: Map<string, RemotePlayer>,
  state: Record<string, Array<Partial<PresenceMeta>>>,
  now: number,
  selfId: string | null,
) {
  for (const id of map.keys()) if (!(id in state)) map.delete(id);
  for (const [id, metas] of Object.entries(state)) {
    if (id === selfId) continue;
    const meta = metas[metas.length - 1] ?? {};
    const r = map.get(id);
    const name = typeof meta.name === "string" ? meta.name.slice(0, 16) : "";
    const archetype = typeof meta.archetype === "string" ? meta.archetype : "vanguard";
    const level = finite(meta.level) ? meta.level : 1;
    if (r) Object.assign(r, { name, archetype, level });
    else
      map.set(id, {
        id,
        name,
        archetype,
        level,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        anim: "idle",
        rx: 0,
        ry: 0,
        rz: 0,
        ryaw: 0,
        seen: now,
        placed: false,
      });
  }
}

export function isAway(r: RemotePlayer, now: number) {
  return now - r.seen > STALE_MS;
}

/** Ease the drawn state toward the latest report. */
export function stepRemotes(map: Map<string, RemotePlayer>, dt: number) {
  const k = 1 - Math.exp(-10 * dt);
  for (const r of map.values()) {
    if (!r.placed) continue;
    // Big jumps (fast travel, respawn) snap instead of sliding across the map.
    if (Math.hypot(r.x - r.rx, r.z - r.rz) > 12) {
      r.rx = r.x;
      r.ry = r.y;
      r.rz = r.z;
    } else {
      r.rx += (r.x - r.rx) * k;
      r.ry += (r.y - r.ry) * k;
      r.rz += (r.z - r.rz) * k;
    }
    let d = r.yaw - r.ryaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.ryaw += d * k;
  }
}

/** Should we broadcast our position now? Moving: SEND_HZ. Still: a heartbeat. */
export function shouldSend(
  last: { x: number; z: number; yaw: number; a: string; at: number } | null,
  cur: { x: number; z: number; yaw: number; a: string },
  now: number,
) {
  if (!last) return true;
  const since = now - last.at;
  if (since < 1000 / SEND_HZ) return false;
  const changed =
    Math.hypot(cur.x - last.x, cur.z - last.z) > 0.05 ||
    Math.abs(cur.yaw - last.yaw) > 0.05 ||
    cur.a !== last.a;
  return changed || since >= HEARTBEAT_MS;
}

/** The nearest players to draw (at most MAX_SHOWN). */
export function nearestIds(map: Map<string, RemotePlayer>, x: number, z: number) {
  return Array.from(map.values())
    .filter((r) => r.placed)
    .sort((a, b) => Math.hypot(a.rx - x, a.rz - z) - Math.hypot(b.rx - x, b.rz - z))
    .slice(0, MAX_SHOWN)
    .map((r) => r.id);
}

// ─── Network ─────────────────────────────────────────────────────────────────

let channel: RealtimeChannel | null = null;
let joinedAs: string | null = null;
let lastSent: { x: number; z: number; yaw: number; a: string; at: number } | null = null;

export async function joinWorld(selfId: string, meta: PresenceMeta) {
  const sb = backend();
  if (!sb || joinedAs === selfId) return;
  await leaveWorld();
  joinedAs = selfId;
  lastSent = null;
  await sb.realtime.setAuth(); // private channel: send our session token
  if (joinedAs !== selfId) return; // left again while we were waiting
  const ch = sb.channel(WORLD_TOPIC, {
    config: { private: true, broadcast: { self: false }, presence: { key: selfId } },
  });
  channel = ch;
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState<PresenceMeta>();
    applyPresence(remotes, state, Date.now(), selfId);
    usePresence.setState({ online: Object.keys(state).length });
  });
  ch.on("broadcast", { event: "pos" }, ({ payload }) => {
    applyPosition(remotes, payload as Partial<PosMessage>, Date.now(), selfId);
  });
  ch.subscribe((status) => {
    if (channel !== ch) return;
    if (status === "SUBSCRIBED") {
      usePresence.setState({ connected: true });
      void ch.track(meta);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      usePresence.setState({ connected: false });
    }
  });
}

export async function leaveWorld() {
  const ch = channel;
  channel = null;
  joinedAs = null;
  remotes.clear();
  usePresence.setState({ connected: false, online: 0, ids: [] });
  if (ch) await backend()?.removeChannel(ch);
}

/** Update what others see about us (class change, level up). */
export function updateMeta(meta: PresenceMeta) {
  if (channel && usePresence.getState().connected) void channel.track(meta);
}

/** Called every frame while playing: broadcast our position when due. */
export function sendPosition(cur: Omit<PosMessage, "id">, now: number) {
  if (!channel || !joinedAs || !usePresence.getState().connected) return;
  if (!shouldSend(lastSent, cur, now)) return;
  lastSent = { x: cur.x, z: cur.z, yaw: cur.yaw, a: cur.a, at: now };
  const msg: PosMessage = {
    id: joinedAs,
    x: Math.round(cur.x * 100) / 100,
    y: Math.round(cur.y * 100) / 100,
    z: Math.round(cur.z * 100) / 100,
    yaw: Math.round(cur.yaw * 1000) / 1000,
    a: cur.a,
  };
  void channel.send({ type: "broadcast", event: "pos", payload: msg });
}
