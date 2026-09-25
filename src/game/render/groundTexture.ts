import * as THREE from "three";

/**
 * A tileable "painted" detail texture for the ground, drawn once at startup
 * (nothing to download). Soft light and dark blotches plus short grass
 * strokes, all close to white: it multiplies the ground's vertex colours, so
 * regions keep their colour and just stop looking flat.
 */
const SIZE = 256;
const GRID = 8;

let cached: THREE.CanvasTexture | null = null;

/** Deterministic, so every session paints the same ground. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function groundDetailTexture(): THREE.CanvasTexture | null {
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rand = rng(1701);

  // Wrapping value noise: blotches that tile seamlessly.
  const grid = Array.from({ length: GRID * GRID }, () => rand());
  const at = (x: number, y: number) => grid[((y + GRID) % GRID) * GRID + ((x + GRID) % GRID)]!;
  const img = ctx.createImageData(SIZE, SIZE);
  const cell = SIZE / GRID;
  for (let py = 0; py < SIZE; py++)
    for (let px = 0; px < SIZE; px++) {
      const gx = px / cell;
      const gy = py / cell;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const sx = (gx - x0) ** 2 * (3 - 2 * (gx - x0));
      const sy = (gy - y0) ** 2 * (3 - 2 * (gy - y0));
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      const n = top * (1 - sy) + bottom * sy;
      const v = Math.round(255 * (0.9 + n * 0.1));
      const i = (py * SIZE + px) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);

  // Short grass strokes, light and dark, drawn wrapped so edges tile.
  ctx.lineCap = "round";
  for (let k = 0; k < 900; k++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const len = 3 + rand() * 5;
    const lean = (rand() - 0.5) * 0.9;
    const light = rand() < 0.45;
    ctx.strokeStyle = light
      ? `rgba(255,255,255,${0.12 + rand() * 0.14})`
      : `rgba(0,0,0,${0.05 + rand() * 0.07})`;
    ctx.lineWidth = 1 + rand() * 1.2;
    for (const ox of [-SIZE, 0, SIZE])
      for (const oy of [-SIZE, 0, SIZE]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + lean * len, y + oy - len);
        ctx.stroke();
      }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cached = tex;
  return tex;
}
