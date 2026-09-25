// Minimap geometry, kept free of the DOM so it can be tested.

/** Minimap width in CSS pixels at size 1. */
export const MINIMAP_BASE_PX = 112;
/** World metres from the centre to the edge at zoom 1. */
export const MINIMAP_RADIUS_M = 34;

export const minimapPx = (scale: number) => Math.round(MINIMAP_BASE_PX * scale);
export const minimapRadiusM = (zoom: number) => MINIMAP_RADIUS_M / zoom;

/**
 * A marker's offset from the minimap's centre, in pixels: north (−z) up, like
 * the full map. `half` is half the minimap's width in pixels.
 */
export function project(dx: number, dz: number, radiusM: number, half: number) {
  return { x: (dx / radiusM) * half, y: (dz / radiusM) * half };
}

/**
 * Keeps a marker inside the rim (circle or square, less `inset` px), so
 * something off the map shows at the edge, in its direction.
 */
export function toRim(x: number, y: number, half: number, round: boolean, inset: number) {
  const r = half - inset;
  const reach = round ? Math.hypot(x, y) : Math.max(Math.abs(x), Math.abs(y));
  if (reach <= r) return { x, y, outside: false };
  const k = r / reach;
  return { x: x * k, y: y * k, outside: true };
}

/**
 * Where the minimap's top-left corner goes for a saved centre (fractions of the
 * screen), kept fully on screen with `margin` px to spare.
 */
export function placeMinimap(
  at: { x: number; y: number },
  size: number,
  vw: number,
  vh: number,
  margin = 8,
) {
  const half = size / 2;
  const cx = Math.min(
    Math.max(at.x * vw, half + margin),
    Math.max(half + margin, vw - half - margin),
  );
  const cy = Math.min(
    Math.max(at.y * vh, half + margin),
    Math.max(half + margin, vh - half - margin),
  );
  return { left: Math.round(cx - half), top: Math.round(cy - half) };
}

/** The minimap's centre as fractions of the screen, from its top-left corner. */
export function centreFraction(left: number, top: number, size: number, vw: number, vh: number) {
  return {
    x: Math.min(1, Math.max(0, (left + size / 2) / Math.max(1, vw))),
    y: Math.min(1, Math.max(0, (top + size / 2) / Math.max(1, vh))),
  };
}
