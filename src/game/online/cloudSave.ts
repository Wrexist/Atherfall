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

/**
 * Uploads start only after this device's save and the cloud save have been
 * reconciled for this account (title screen), so progress made elsewhere is
 * never overwritten by an older device save — even if the check failed offline.
 */
let syncedUser: string | null = null;
export function markSynced(userId: string | null) {
  syncedUser = userId;
}

let pending: SaveFile | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastUpload = 0;

/** Called on every local save; uploads the latest one at most every 30 seconds. */
export function queueUpload(save: SaveFile) {
  const { status, userId } = useAccount.getState();
  if (status !== "signed-in" || !userId || userId !== syncedUser) return;
  pending = save;
  if (timer) return;
  const wait = Math.max(0, lastUpload + UPLOAD_EVERY - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void flushUpload();
  }, wait);
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
  if (!(await uploadSave(save))) pending ??= save; // keep it for the next try
}

export function dropPendingUpload() {
  pending = null;
  syncedUser = null;
  if (timer) clearTimeout(timer);
  timer = null;
}
