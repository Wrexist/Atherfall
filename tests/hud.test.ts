// HUD details that don't need a browser. Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import { mirrorAnchor } from "../src/game/ui/Tips";

describe("coaching tips", () => {
  test("left-handed controls put each tip on the mirrored side", () => {
    expect(mirrorAnchor("left-3 bottom-[12.75rem] !max-w-[10rem]")).toBe(
      "right-3 bottom-[12.75rem] !max-w-[10rem]",
    );
    expect(mirrorAnchor("left-3 top-[10.5rem]")).toBe("right-3 top-[10.5rem]");
    // Centred tips stay centred.
    expect(mirrorAnchor("left-1/2 top-[28%] -translate-x-1/2")).toBe(
      "left-1/2 top-[28%] -translate-x-1/2",
    );
  });
});
