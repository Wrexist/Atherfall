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
  /** Turn to and attack enemies in reach on your own (walking, or standing in a fight). */
  autoAttack: boolean;
  /** High 3/4 view (default) or the orbiting behind-the-back camera. */
  camera: CameraMode;
  /** Cap the game at 30 fps: a cooler phone and longer play. */
  batterySaver: boolean;
  /** Joystick size multiplier, 0.75–1.4. */
  stickSize: number;
  /** Joystick opacity at rest, 0.25–1. */
  stickOpacity: number;
  /** Mirror the touch controls: stick on the right, attack on the left. */
  leftHanded: boolean;
  /** First-run tips already learned or dismissed. */
  tipsDone: string[];
  /** Minimap in the HUD. */
  minimap: boolean;
  /** Minimap size multiplier, 0.7–1.6. */
  minimapScale: number;
  /** Minimap zoom: higher shows less ground in more detail, 0.5–2. */
  minimapZoom: number;
  /** Round (true) or square minimap. */
  minimapRound: boolean;
  /** Minimap opacity, 0.35–1. */
  minimapOpacity: number;
  /** Where the player moved the minimap, per screen shape (null = top-right corner). */
  minimapAt: { portrait: ScreenPos | null; landscape: ScreenPos | null };
}

/** A point as fractions of the screen's width and height (survives rotation and resizing). */
export interface ScreenPos {
  x: number;
  y: number;
}

export const SETTINGS_KEY = "aetherfall.settings";

export const DEFAULT_SETTINGS: Settings = {
  lookSensitivity: 1,
  invertY: false,
  haptics: true,
  floatingStick: true,
  holdToAttack: true,
  autoAttack: true,
  camera: "top",
  batterySaver: false,
  stickSize: 1,
  stickOpacity: 0.45,
  leftHanded: false,
  tipsDone: [],
  minimap: true,
  minimapScale: 1,
  minimapZoom: 1,
  minimapRound: true,
  minimapOpacity: 0.95,
  minimapAt: { portrait: null, landscape: null },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A stored screen position, or null if it's missing or broken. */
function screenPos(raw: unknown): ScreenPos | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, y } = raw as Partial<ScreenPos>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y))
    return null;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

/**
 * Stored settings, made safe: unknown keys dropped, wrong types replaced by
 * defaults, numbers clamped to their ranges.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const v = r[k];
    if (typeof v === typeof DEFAULT_SETTINGS[k] && (typeof v !== "number" || Number.isFinite(v)))
      (out as Record<string, unknown>)[k] = v;
  }
  out.lookSensitivity = clamp(out.lookSensitivity, 0.4, 2.2);
  out.stickSize = clamp(out.stickSize, 0.75, 1.4);
  out.stickOpacity = clamp(out.stickOpacity, 0.25, 1);
  if (out.camera !== "top" && out.camera !== "behind") out.camera = DEFAULT_SETTINGS.camera;
  out.tipsDone = Array.isArray(r.tipsDone) ? r.tipsDone.filter((t) => typeof t === "string") : [];
  out.minimapScale = clamp(out.minimapScale, 0.7, 1.6);
  out.minimapZoom = clamp(out.minimapZoom, 0.5, 2);
  out.minimapOpacity = clamp(out.minimapOpacity, 0.35, 1);
  const at = (r.minimapAt ?? {}) as Partial<Settings["minimapAt"]>;
  out.minimapAt = { portrait: screenPos(at.portrait), landscape: screenPos(at.landscape) };
  return out;
}

function load(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    return sanitizeSettings(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}"));
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
