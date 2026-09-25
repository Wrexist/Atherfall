// Stored per-device settings are cleaned before use. Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/game/core/settings";

describe("settings", () => {
  test("garbage in storage falls back to the defaults", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ haptics: "yes", camera: "sideways", stickSize: "big" })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  test("joystick size and opacity stay in their ranges", () => {
    const small = sanitizeSettings({ stickSize: 0.2, stickOpacity: 0 });
    expect([small.stickSize, small.stickOpacity]).toEqual([0.75, 0.25]);
    const big = sanitizeSettings({ stickSize: 9, stickOpacity: 5 });
    expect([big.stickSize, big.stickOpacity]).toEqual([1.4, 1]);
    expect(sanitizeSettings({ stickSize: Number.NaN }).stickSize).toBe(DEFAULT_SETTINGS.stickSize);
  });

  test("valid choices are kept", () => {
    const s = sanitizeSettings({
      leftHanded: true,
      stickSize: 1.2,
      camera: "behind",
      batterySaver: true,
      tipsDone: ["move", 3, "look"],
    });
    expect(s.leftHanded).toBe(true);
    expect(s.stickSize).toBe(1.2);
    expect(s.camera).toBe("behind");
    expect(s.batterySaver).toBe(true);
    expect(s.tipsDone).toEqual(["move", "look"]);
  });
});

test("camera zoom is kept between close and far", () => {
  expect(sanitizeSettings({ cameraZoom: 9 }).cameraZoom).toBe(1.8);
  expect(sanitizeSettings({ cameraZoom: 0.1 }).cameraZoom).toBe(0.8);
  expect(sanitizeSettings({}).cameraZoom).toBe(1);
});
