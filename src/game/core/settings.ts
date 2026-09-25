// Per-device preferences (not part of the save): controls feel and comfort.
import { create } from "zustand";
import type { CameraMode } from "./camera";

export interface Settings {
  /** Camera look speed multiplier, 0.4–2.2. */
  lookSensitivity: number;
  invertY: boolean;
  /** Vibration on hits, dodges, damage and level-ups (Android; iPhone Safari has no vibration API). */
  haptics: boolean;
  /** Joystick appears wherever the left thumb lands (off = fixed in the corner). */
  floatingStick: boolean;
  /** Holding Attack keeps chaining swings. */
  holdToAttack: boolean;
  /** High 3/4 view (default) or the orbiting behind-the-back camera. */
  camera: CameraMode;
  /** First-run tips already learned or dismissed. */
  tipsDone: string[];
}

export const SETTINGS_KEY = "aetherfall.settings";

export const DEFAULT_SETTINGS: Settings = {
  lookSensitivity: 1,
  invertY: false,
  haptics: true,
  floatingStick: true,
  holdToAttack: true,
  camera: "top",
  tipsDone: [],
};

function load(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      if (typeof raw[k] === typeof DEFAULT_SETTINGS[k])
        (out as Record<string, unknown>)[k] = raw[k];
    }
    out.lookSensitivity = Math.max(0.4, Math.min(2.2, out.lookSensitivity));
    if (out.camera !== "top" && out.camera !== "behind") out.camera = DEFAULT_SETTINGS.camera;
    out.tipsDone = Array.isArray(raw.tipsDone)
      ? raw.tipsDone.filter((t) => typeof t === "string")
      : [];
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const useSettings = create<Settings & { update: (patch: Partial<Settings>) => void }>(
  (set, get) => ({
    ...load(),
    update: (patch) => {
      set(patch);
      try {
        const { update: _u, ...data } = get();
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
      } catch {
        /* storage blocked — settings still apply for this session */
      }
    },
  }),
);

/** Short vibration if the device supports it and the player hasn't turned it off. */
export function haptic(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (!useSettings.getState().haptics) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw without a recent user gesture */
  }
}
