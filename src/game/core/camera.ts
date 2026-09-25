// Camera framing, kept free of three.js so it can be tested.
//
// "top": a fixed, high 3/4 view like mobile action RPGs (north is always up the
// screen, the joystick moves you in screen directions, enemies all around you
// stay in view). "behind": the original orbiting third-person camera.

export type CameraMode = "top" | "behind";

/** Top view heading: the camera sits south of the player, looking north. */
export const TOP_YAW = Math.PI;
/** Top view tilt above the horizon, radians (~57°). */
export const TOP_PITCH = 1.0;
/** Width of world the top view keeps across any screen shape, degrees. */
export const TOP_HFOV = 42;
/** Vertical field of view range for the top view, degrees. */
export const TOP_VFOV_MIN = 38;
export const TOP_VFOV_MAX = 74;
/** The behind-the-back camera's vertical field of view, degrees. */
export const BEHIND_FOV = 58;

const DEG = Math.PI / 180;

/** Vertical FOV (what three.js takes) that shows `hfov` degrees across a screen of this aspect. */
export function verticalFov(hfov: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((hfov * DEG) / 2) / Math.max(0.1, aspect))) / DEG;
}

/** Degrees of world visible across the screen for a vertical FOV and aspect. */
export function horizontalFov(vfov: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((vfov * DEG) / 2) * aspect)) / DEG;
}

export interface TopFraming {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Camera distance from the hero's head. */
  distance: number;
  /**
   * How far north of the hero the camera aims. On an upright phone this puts
   * the hero a little below the middle: more room to see what's coming, and
   * clear of the HUD and tips above. Wide screens have room to spare.
   */
  lookAhead: number;
}

/**
 * Top view framing for a screen of this aspect (width / height). Upright phones
 * get a taller lens so the world around the hero stays as wide as on a
 * landscape screen; wide screens pull back a little instead of widening the lens.
 */
export function topFraming(aspect: number): TopFraming {
  const fov = Math.min(TOP_VFOV_MAX, Math.max(TOP_VFOV_MIN, verticalFov(TOP_HFOV, aspect)));
  const upright = aspect < 1;
  return { fov, distance: upright ? 17 : 21, lookAhead: upright ? 2.4 : 0.6 };
}

/** Field of view for a camera mode on a screen of this aspect (width / height). */
export function cameraFov(mode: CameraMode, aspect: number): number {
  return mode === "behind" ? BEHIND_FOV : topFraming(aspect).fov;
}
