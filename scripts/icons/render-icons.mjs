// Renders the item and class icons in public/icons/ from the KayKit packs, so
// they match the game's own 3D art (docs/ASSETS.md). Needs:
//   - the packs in .cache/kaykit (node scripts/models/build-kaykit.mjs fetches them),
//   - Playwright with Chromium (PLAYWRIGHT=<path to playwright's index.mjs> if it
//     isn't installed in this project).
// Usage: node scripts/icons/render-icons.mjs [ids...] [--sheet file.png]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ICONS } from "./specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/icons");
const TYPES = {
  ".js": "text/javascript",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".png": "image/png",
};

const args = process.argv.slice(2);
const sheetAt = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : null;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--sheet");

const pw = process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : "playwright";
const { chromium } = await import(pw);
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page:", e.message));
await page.route("http://icons.local/**", async (route) => {
  const p = decodeURIComponent(new URL(route.request().url()).pathname);
  if (p === "/") {
    return route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module" src="/page.js"></script>',
    });
  }
  let file = null;
  if (p === "/page.js") file = path.join(ROOT, "scripts/icons/page.js");
  else if (p.startsWith("/three/")) file = path.join(ROOT, "node_modules", p);
  else if (p.startsWith("/cache/"))
    file = path.join(ROOT, ".cache/kaykit", p.slice("/cache/".length));
  if (!file) return route.fulfill({ status: 404 });
  try {
    const body = await readFile(file);
    return route.fulfill({
      body,
      contentType: TYPES[path.extname(file)] ?? "application/octet-stream",
    });
  } catch {
    return route.fulfill({ status: 404, body: `missing ${p}` });
  }
});
await page.goto("http://icons.local/");
await page.waitForFunction(() => window.ready === true, null, { timeout: 60_000 });

const done = [];
for (const spec of ICONS.filter((s) => only.length === 0 || only.includes(s.id))) {
  const url = await page.evaluate((s) => window.renderIcon(s), spec);
  const dir = path.join(OUT, spec.dir);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${spec.id}.png`);
  await writeFile(file, Buffer.from(url.split(",")[1], "base64"));
  done.push({ id: spec.id, url });
  console.log(
    `${path.relative(ROOT, file).replaceAll("\\", "/")}  ${Math.round((url.length * 0.75) / 1024)} KB`,
  );
}

if (sheetAt) {
  // A labelled contact sheet on the game's panel colour, for reviewing by eye.
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.setContent(
    `<body style="margin:0;background:#1e2a3d;font:12px sans-serif;color:#f4f1ea;display:flex;flex-wrap:wrap;gap:10px;padding:12px">${done
      .map(
        (d) =>
          `<div style="width:120px;text-align:center"><div style="background:#2b3b55;border-radius:14px;padding:4px"><img src="${d.url}" width="112" height="112"></div>${d.id}</div>`,
      )
      .join("")}</body>`,
  );
  await page.screenshot({ path: sheetAt, fullPage: true });
  console.log(`sheet: ${sheetAt}`);
}
await browser.close();
