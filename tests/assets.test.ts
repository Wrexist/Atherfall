// Files from public/ must load when the game is served from a sub-path
// (GitHub Pages: /aetherfall-play/). Run with: bun test ./tests
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { assetUrl } from "../src/game/core/assets";

describe("asset paths", () => {
  test("unchanged when served from the site root", () => {
    expect(assetUrl("/models/kaykit/knight.glb", "/")).toBe("/models/kaykit/knight.glb");
  });

  test("under the sub-path on GitHub Pages", () => {
    expect(assetUrl("/models/kaykit/world.glb", "/aetherfall-play/")).toBe(
      "/aetherfall-play/models/kaykit/world.glb",
    );
    expect(assetUrl("/sw.js", "/aetherfall-play")).toBe("/aetherfall-play/sw.js");
  });

  test("other hosts and relative paths are left alone", () => {
    expect(assetUrl("https://fonts.gstatic.com/a.woff2", "/p/")).toBe(
      "https://fonts.gstatic.com/a.woff2",
    );
    expect(assetUrl("//cdn.example/a.glb", "/p/")).toBe("//cdn.example/a.glb");
    expect(assetUrl("icon-192.png", "/p/")).toBe("icon-192.png");
  });

  test("no code loads a public file from the site root directly", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".gen.ts")) files.push(p);
      }
    };
    walk(join(import.meta.dir, "../src"));
    const direct =
      /(useGLTF(?:\.preload)?|\.register)\(\s*["'`]\/(?!\/)|(href:|src=)\s*["'`{]*\/(?!\/)/;
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      // Icons in public/icons must go through assetUrl() on the same line.
      const bareIcon = text
        .split("\n")
        .some((line) => /["'`]\/icons\//.test(line) && !line.includes("assetUrl("));
      return direct.test(text) || bareIcon;
    });
    expect(offenders).toEqual([]);
  }, 30_000); // reads every source file; slow on a cold disk
});

describe("icons", () => {
  test("every item and class has its icon in public/icons", async () => {
    const { existsSync } = await import("node:fs");
    const { ITEMS } = await import("../src/game/data/items");
    const { ARCHETYPE_LIST } = await import("../src/game/data/archetypes");
    const root = join(import.meta.dir, "../public/icons");
    const missing = [
      ...Object.keys(ITEMS).filter((id) => !existsSync(join(root, "items", `${id}.png`))),
      ...ARCHETYPE_LIST.filter((a) => !existsSync(join(root, "classes", `${a.id}.png`))).map(
        (a) => a.id,
      ),
    ];
    expect(missing).toEqual([]);
  });
});
