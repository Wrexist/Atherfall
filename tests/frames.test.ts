// Battery saver frame pacing. Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import { SAVER_FPS, frameDue } from "../src/game/core/frameCap";

/** Frames drawn in one second on a display of this refresh rate (with a little vsync jitter). */
function drawnPerSecond(hz: number) {
  let last = -Infinity;
  let drawn = 0;
  for (let i = 0; i < hz; i++) {
    const now = (i * 1000) / hz + (i % 3 === 0 ? 0.6 : -0.4);
    if (frameDue(now, last, SAVER_FPS)) {
      last = now;
      drawn++;
    }
  }
  return drawn;
}

describe("battery saver", () => {
  test("holds about 30 fps on 60, 90 and 120 Hz screens", () => {
    for (const hz of [60, 90, 120]) {
      const n = drawnPerSecond(hz);
      expect(n).toBeGreaterThanOrEqual(28);
      expect(n).toBeLessThanOrEqual(31);
    }
  });

  test("never skips on a screen already slower than the cap", () => {
    expect(drawnPerSecond(24)).toBe(24);
  });
});
