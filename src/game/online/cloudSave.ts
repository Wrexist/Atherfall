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

export async function fetchCloudSave(): Promise<SaveFile | null> {
  const sb = backend();
  const userId = useAccount.getState().userId;
  if (!sb || !userId) return null;
  const { data, error } = await sb.from("saves").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  // Same migration/repair path as a device save, so an old or damaged cloud save is safe.
  return data ? migrateSave(structuredClone(data.data)) : null;
}

export async function uploadSave(save: SaveFile) {
  const sb = backend();
  const userId = useAccount.getState().userId;
  if (!sb || !userId) return false;
  const { error } = await sb.from("saves").upsert({
    user_id: userId,
    data: save,
    version: save.v,
    level: save.level,
    saved_at: new Date(save.savedAt).toISOString(),
  });
  if (error) return false;
  void syncProfileProgress(save.archetype, save.level);
  return true;
}

/** The server calls, swappable in tests. */
export const cloud = { fetch: fetchCloudSave, upload: uploadSave };

/**
 * Uploads start only after this device's save and the cloud save have been
 * reconciled for this account (see startCloudSync), so progress made elsewhere
 * is never overwritten by an older device save — even if the check failed offline.
 */
let syncedUser: string | null = null;
function markSynced(userId: string | null) {
  syncedUser = userId;
}

let pending: SaveFile | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastUpload = 0;
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

/** Upload the pending save now (app going to the background, sign-out, …). */
export async function flushUpload() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const save = pending;
  pending = null;
  if (!save) return;
  lastUpload = Date.now();
  if (!(await cloud.upload(save))) pending ??= save; // keep it for the next try
}

export function dropPendingUpload() {
  pending = null;
  syncedUser = null;
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

export type SyncPhase = "idle" | "checking" | "choice" | "done" | "failed";

interface CloudSyncState {
  phase: SyncPhase;
  userId: string | null;
  message: string | null;
  /** Set while the player must pick between a newer cloud save and this device's. */
  choice: { local: SaveFile; cloud: SaveFile } | null;
}

const IDLE: CloudSyncState = { phase: "idle", userId: null, message: null, choice: null };
export const useCloudSync = create<CloudSyncState>(() => ({ ...IDLE }));

/** Local save access, passed in so this module stays free of game code. */
export interface LocalSaves {
  read: () => SaveFile | null;
  /** Store this save on the device and load it into the game. */
  adopt: (save: SaveFile) => void;
}


/**
 * Reconcile this device's save with the account's cloud save. Newer device
 * progress is uploaded; a newer cloud save is offered as a choice (never
 * silently replaces progress on this device). Safe to call repeatedly.
 */
export async function startCloudSync(userId: string, local: LocalSaves) {
  const s = useCloudSync.getState();
  if (s.userId === userId && s.phase !== "idle" && s.phase !== "failed") return;
  const mine = ++syncRun;
  useCloudSync.setState({ phase: "checking", userId, message: "Checking your cloud save…", choice: null });
  const stillMine = () => syncRun === mine && useAccount.getState().userId === userId;
  let remote: SaveFile | null;
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
  const cmp = compareSaves(mineLocal, remote);
  if (cmp === "cloud-newer") {
    useCloudSync.setState({ phase: "choice", message: null, choice: { local: mineLocal!, cloud: remote! } });
    return;
  }
  markSynced(userId);
  if (cmp === "only-cloud") {
    local.adopt(remote!);
    useCloudSync.setState({ phase: "done", message: "Cloud save loaded." });
  } else if (cmp === "only-local" || cmp === "local-newer") {
    useCloudSync.setState({ phase: "done", message: null });
    const ok = await cloud.upload(mineLocal!);
    if (stillMine() && ok)
      useCloudSync.setState({ message: "This device's journey is now saved in the cloud." });
  } else {
    useCloudSync.setState({ phase: "done", message: cmp === "same" ? "Cloud save is up to date." : null });
  }
}

/** The player's answer to "your cloud save is newer". */
export function resolveCloudChoice(useCloud: boolean, local: LocalSaves) {
  const { choice, userId } = useCloudSync.getState();
  if (!choice || !userId) return;
  if (useCloud) local.adopt(choice.cloud);
  else {
    // Keeping the older device save is a deliberate pick: stamp it as the newest,
    // or the server (which only moves saves forward) would ignore it — and the
    // next sign-in would ask again.
    const kept = { ...choice.local, savedAt: Math.max(Date.now(), choice.cloud.savedAt + 1) };
    local.adopt(kept);
    void cloud.upload(kept);
  }
  markSynced(userId);
  useCloudSync.setState({
    phase: "done",
    choice: null,
    message: useCloud ? "Cloud save loaded." : "Kept this device's journey (and saved it to the cloud).",
  });
}
