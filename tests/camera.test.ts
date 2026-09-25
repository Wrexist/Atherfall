// Camera framing for the top view and the behind-the-back view. Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import {
  BEHIND_FOV,
  TOP_HFOV,
  TOP_VFOV_MAX,
  TOP_VFOV_MIN,
  cameraFov,
  horizontalFov,
  topFraming,
  verticalFov,
} from "../src/game/core/camera";

const IPHONE_PORTRAIT = 390 / 844;
const DESKTOP = 16 / 9;

describe("camera framing", () => {
  test("vertical/horizontal FOV conversions agree", () => {
    expect(verticalFov(50, 1)).toBeCloseTo(50, 6);
    expect(horizontalFov(verticalFov(42, 0.5), 0.5)).toBeCloseTo(42, 6);
  });

  test("an upright phone still sees a wide slice of the world around the hero", () => {
    const fov = cameraFov("top", IPHONE_PORTRAIT);
    expect(fov).toBeLessThanOrEqual(TOP_VFOV_MAX);
    // Width on screen stays close to the target instead of shrinking to a keyhole.
    expect(horizontalFov(fov, IPHONE_PORTRAIT)).toBeGreaterThan(TOP_HFOV - 6);
  });

  test("wide screens keep a calm lens and at least the target width", () => {
    const fov = cameraFov("top", DESKTOP);
    expect(fov).toBe(TOP_VFOV_MIN);
    expect(horizontalFov(fov, DESKTOP)).toBeGreaterThanOrEqual(TOP_HFOV);
  });

  test("upright phones aim ahead of the hero; wide screens keep the hero near the middle", () => {
    const phone = topFraming(IPHONE_PORTRAIT);
    const desk = topFraming(DESKTOP);
    expect(phone.lookAhead).toBeGreaterThan(desk.lookAhead);
    // Wide screens pull back rather than widening the lens.
    expect(desk.distance).toBeGreaterThan(phone.distance);
  });

  test("the behind-the-back camera keeps its original lens", () => {
    expect(cameraFov("behind", IPHONE_PORTRAIT)).toBe(BEHIND_FOV);
    expect(cameraFov("behind", DESKTOP)).toBe(BEHIND_FOV);
  });
});
