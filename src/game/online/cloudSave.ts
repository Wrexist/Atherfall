import { create } from "zustand";
import { migrateSave, type SaveFile } from "../core/persistence";
import { useAccount, syncProfileProgress } from "./account";
import { backend } from "./client";

/** Uploads are batched: at most one every this many ms while playing. */
const UPLOAD_EVERY = 30_000;
/** Saves this close in time count as the same save. */
const SAME_WITHIN = 2_000;

export type SaveComparison =
  "none" | "only-local" | "only-cloud" | "same" | "local-newer" | "cloud-newer";

/** Which of the device save and the cloud save should win? */
export function compareSaves(local: SaveFile | null, cloud: SaveFile | null): SaveComparison {
  if (!local && !cloud) return "none";
  if (!cloud) return "only-local";
  if (!local) return "only-cloud";
  const diff = (cloud.savedAt ?? 0) - (local.savedAt ?? 0);
  if (Math.abs(diff) <= SAME_WITHIN) return "same";
  return diff > 0 ? "cloud-newer" : "local-newer";
}

/** The cloud save and its server revision (bumped by the server on every change). */
export interface CloudCopy {
  save: SaveFile;
  revision: number;
}

export type UploadResult =
  | { ok: true; revision: number }
  /** conflict: another device saved since this one last looked, so nothing was written. */
  | { ok: false; conflict: boolean };

export async function fetchCloudSave(): Promise<CloudCopy | null> {
  const sb = backend();
  const userId = useAccount.getState().userId;
  if (!sb || !userId) return null;
  const { data, error } = await sb
    .from("saves")
    .select("data, revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  // Same migration/repair path as a device save, so an old or damaged cloud save is safe.
  const save = data ? migrateSave(structuredClone(data.data)) : null;
  return save ? { save, revision: Number(data!.revision) || 0 } : null;
}

/**
 * Save on top of revision `base` (the last one this device saw). The server
 * refuses it if the cloud save has changed since, instead of overwriting
 * another device's progress. Ordering never depends on device clocks.
 */
export async function uploadSave(save: SaveFile, base: number): Promise<UploadResult> {
  const sb = backend();
  const userId = useAccount.getState().userId;
  if (!sb || !userId) return { ok: false, conflict: false };
  const { data, error } = await sb.rpc("upload_save", {
    p_data: save,
    p_version: save.v,
    p_level: save.level,
    p_saved_at: new Date(save.savedAt).toISOString(),
    p_base: base,
  });
  if (error) return { ok: false, conflict: false };
  if (data === null || data === undefined) return { ok: false, conflict: true };
  void syncProfileProgress(save.archetype, save.level);
  return { ok: true, revision: Number(data) };
}

/** The server calls, swappable in tests. */
export const cloud = { fetch: fetchCloudSave, upload: uploadSave };

/**
 * Uploads start only after this device's save and the cloud save have been
 * reconciled for this account (see startCloudSync), so progress made elsewhere
 * is never overwritten by an older device save — even if the check failed offline.
 */
let syncedUser: string | null = null;
/** The cloud revision this device's next upload builds on. */
let revision = 0;
function markSynced(userId: string | null, base: number) {
  syncedUser = userId;
  revision = base;
}

let pending: SaveFile | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastUpload = 0;
/** The upload on its way to the server; the next one waits for it. */
let inFlight: Promise<void> | null = null;
/** Page hidden (or being unloaded): timers may be frozen, so upload at once. */
let backgrounded = false;
/** Bumped to abandon a reconciliation still waiting on the server. */
let syncRun = 0;

/** Called on every local save; uploads the latest one at most every 30 seconds. */
export function queueUpload(save: SaveFile) {
  const { status, userId } = useAccount.getState();
  if (status !== "signed-in" || !userId || userId !== syncedUser) return;
  pending = save;
  // A save made while going to the background (the game saves on hide, possibly
  // after our own hide handler ran) must not wait on a timer that may never fire.
  if (backgrounded) {
    void flushUpload();
    return;
  }
  if (timer) return;
  const wait = Math.max(0, lastUpload + UPLOAD_EVERY - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void flushUpload();
  }, wait);
}

/** The page was hidden or shown. Hiding pushes the latest save now. */
export function setBackgrounded(hidden: boolean) {
  backgrounded = hidden;
  if (hidden) void flushUpload();
}

/**
 * Upload the pending save now (app going to the background, sign-out, …).
 * One upload at a time, each on top of the revision the last one produced, so
 * a slow request can never land after (and undo) a newer one.
 */
export async function flushUpload() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (inFlight) await inFlight;
  const save = pending;
  const user = syncedUser;
  pending = null;
  if (!save || !user) return;
  lastUpload = Date.now();
  const mine = (async () => {
    const r = await cloud.upload(save, revision);
    if (syncedUser !== user) return; // signed out meanwhile
    if (r.ok) revision = r.revision;
    else if (r.conflict) stopForConflict();
    else pending ??= save; // network trouble: keep it for the next try
  })();
  inFlight = mine;
  try {
    await mine;
  } finally {
    if (inFlight === mine) inFlight = null;
  }
}

/** Another device saved to the cloud: keep playing locally, never overwrite it. */
function stopForConflict() {
  syncedUser = null;
  pending = null;
  useCloudSync.setState({
    phase: "conflict",
    message:
      "Another device saved to the cloud. Your progress here is safe on this device — restart the game to choose which journey to keep.",
  });
}

export function dropPendingUpload() {
  pending = null;
  syncedUser = null;
  revision = 0;
  if (timer) clearTimeout(timer);
  timer = null;
  useCloudSync.setState({ ...IDLE });
  syncRun++; // abandon any check still in flight
}

// ─── Reconciliation ─────────────────────────────────────────────────────────
// Runs once per signed-in account, outside any screen's lifecycle: leaving the
// title screen must not abandon it (that used to leave uploads off all session).

/** Give up waiting on the server after this long and play from the device. */
export const CHECK_TIMEOUT = 8_000;

export type SyncPhase = "idle" | "checking" | "choice" | "done" | "failed" | "conflict";

interface CloudSyncState {
  phase: SyncPhase;
  userId: string | null;
  message: string | null;
  /** Set while the player must pick between a newer cloud save and this device's. */
  choice: { local: SaveFile; cloud: SaveFile; revision: number } | null;
}

const IDLE: CloudSyncState = { phase: "idle", userId: null, message: null, choice: null };
export const useCloudSync = create<CloudSyncState>(() => ({ ...IDLE }));

/** Local save access, passed in so this module stays free of game code. */
export interface LocalSaves {
  read: () => SaveFile | null;
  /** Store this save on the device and load it into the game. */
  adopt: (save: SaveFile) => void;
}

/** Upload during reconciliation; a conflict here means the cloud changed while we looked. */
async function reconcileUpload(save: SaveFile, base: number, userId: string) {
  markSynced(userId, base);
  const r = await cloud.upload(save, base);
  if (syncedUser !== userId) return false;
  if (r.ok) revision = r.revision;
  else if (r.conflict) stopForConflict();
  return r.ok;
}

/**
 * Reconcile this device's save with the account's cloud save. Newer device
 * progress is uploaded; a newer cloud save is offered as a choice (never
 * silently replaces progress on this device). Safe to call repeatedly.
 */
export async function startCloudSync(userId: string, local: LocalSaves) {
  const s = useCloudSync.getState();
  const retry = s.phase === "idle" || s.phase === "failed" || s.phase === "conflict";
  if (s.userId === userId && !retry) return;
  const mine = ++syncRun;
  useCloudSync.setState({
    phase: "checking",
    userId,
    message: "Checking your cloud save…",
    choice: null,
  });
  const stillMine = () => syncRun === mine && useAccount.getState().userId === userId;
  let remote: CloudCopy | null;
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  try {
    remote = await Promise.race([
      cloud.fetch(),
      new Promise<never>((_, reject) => {
        giveUp = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT);
      }),
    ]);
  } catch {
    if (stillMine())
      useCloudSync.setState({
        phase: "failed",
        message: "Couldn't reach your cloud save — playing from this device.",
      });
    return;
  } finally {
    clearTimeout(giveUp);
  }
  if (!stillMine()) return;
  const mineLocal = local.read();
  const base = remote?.revision ?? 0;
  const cmp = compareSaves(mineLocal, remote?.save ?? null);
  if (cmp === "cloud-newer") {
    useCloudSync.setState({
      phase: "choice",
      message: null,
      choice: { local: mineLocal!, cloud: remote!.save, revision: base },
    });
    return;
  }
  if (cmp === "only-cloud") {
    markSynced(userId, base);
    local.adopt(remote!.save);
    useCloudSync.setState({ phase: "done", message: "Cloud save loaded." });
  } else if (cmp === "only-local" || cmp === "local-newer") {
    useCloudSync.setState({ phase: "done", message: null });
    const ok = await reconcileUpload(mineLocal!, base, userId);
    if (stillMine() && ok)
      useCloudSync.setState({ message: "This device's journey is now saved in the cloud." });
  } else {
    markSynced(userId, base);
    useCloudSync.setState({
      phase: "done",
      message: cmp === "same" ? "Cloud save is up to date." : null,
    });
  }
}

/** The player's answer to "your cloud save is newer". */
export function resolveCloudChoice(useCloud: boolean, local: LocalSaves) {
  const { choice, userId } = useCloudSync.getState();
  if (!choice || !userId) return;
  useCloudSync.setState({
    phase: "done",
    choice: null,
    message: useCloud
      ? "Cloud save loaded."
      : "Kept this device's journey (and saved it to the cloud).",
  });
  if (useCloud) {
    markSynced(userId, choice.revision);
    local.adopt(choice.cloud);
  } else {
    // Saved on top of the cloud revision the player just saw and chose over.
    void reconcileUpload(choice.local, choice.revision, userId);
  }
}
