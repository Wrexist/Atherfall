// Minimap geometry and its saved options. Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import {
  MINIMAP_BASE_PX,
  centreFraction,
  minimapPx,
  minimapRadiusM,
  placeMinimap,
  project,
  toRim,
} from "../src/game/core/minimap";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/game/core/settings";

describe("minimap geometry", () => {
  test("north is up and the edge is the zoom radius", () => {
    const r = minimapRadiusM(1);
    expect(project(0, -r, r, 50)).toEqual({ x: 0, y: -50 }); // due north: top edge
    expect(project(r / 2, 0, r, 50)).toEqual({ x: 25, y: 0 });
    expect(minimapRadiusM(2)).toBe(r / 2); // zooming in shows less ground
    expect(minimapPx(1)).toBe(MINIMAP_BASE_PX);
  });

  test("off-map markers sit on the rim, pointing their way", () => {
    const far = toRim(300, 0, 50, true, 6);
    expect(far).toEqual({ x: 44, y: 0, outside: true });
    const diag = toRim(100, 100, 50, true, 0);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(50);
    const square = toRim(100, 100, 50, false, 0);
    expect(square).toEqual({ x: 50, y: 50, outside: true }); // corner of a square map
    expect(toRim(10, -10, 50, true, 6)).toEqual({ x: 10, y: -10, outside: false });
  });

  test("a moved minimap stays fully on screen, even after the screen shrinks", () => {
    expect(placeMinimap({ x: 0.5, y: 0.5 }, 100, 400, 800)).toEqual({ left: 150, top: 350 });
    expect(placeMinimap({ x: 1, y: 0 }, 100, 400, 800, 8)).toEqual({ left: 292, top: 8 });
    // Saved on a tall screen near the bottom; now a short landscape one.
    expect(placeMinimap({ x: 0.1, y: 0.98 }, 120, 844, 390, 8).top).toBe(390 - 120 - 8);
    // Round trip: where it's dropped is where it comes back.
    const at = centreFraction(210, 300, 100, 400, 800);
    expect(placeMinimap(at, 100, 400, 800)).toEqual({ left: 210, top: 300 });
  });
});

describe("minimap options", () => {
  test("defaults: on, round, top-right corner", () => {
    const s = sanitizeSettings({});
    expect(s.minimap).toBe(true);
    expect(s.minimapRound).toBe(true);
    expect(s.minimapAt).toEqual({ portrait: null, landscape: null });
    expect(s.minimapScale).toBe(DEFAULT_SETTINGS.minimapScale);
  });

  test("stored values are clamped, and broken positions reset to the corner", () => {
    const s = sanitizeSettings({
      minimapScale: 9,
      minimapZoom: 0,
      minimapOpacity: -1,
      minimapAt: { portrait: { x: 1.4, y: 0.2 }, landscape: { x: "left", y: 2 } },
    });
    expect(s.minimapScale).toBe(1.6);
    expect(s.minimapZoom).toBe(0.5);
    expect(s.minimapOpacity).toBe(0.35);
    expect(s.minimapAt.portrait).toEqual({ x: 1, y: 0.2 });
    expect(s.minimapAt.landscape).toBeNull();
    expect(sanitizeSettings({ minimapAt: "nope" }).minimapAt).toEqual({
      portrait: null,
      landscape: null,
    });
  });
});
