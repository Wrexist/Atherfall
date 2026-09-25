import { SEA_LEVEL, groundColor, heightAt } from "../world/terrain";

/** World metres from the island's centre to the edge of the painted map. */
export const MAP_SPAN = 100;

const painted = new Map<number, HTMLCanvasElement>();

/**
 * The island painted from the same heightfield the game uses, once per
 * resolution (the full map uses a small one, the minimap a sharper one).
 */
export function terrainCanvas(res: number): HTMLCanvasElement {
  const hit = painted.get(res);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(res, res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = (i / res) * MAP_SPAN * 2 - MAP_SPAN;
      const z = (j / res) * MAP_SPAN * 2 - MAP_SPAN;
      const h = heightAt(x, z);
      const o = (j * res + i) * 4;
      if (h < SEA_LEVEL) {
        const d = Math.min(1, (SEA_LEVEL - h) / 8);
        img.data[o] = 64 - d * 34;
        img.data[o + 1] = 150 - d * 60;
        img.data[o + 2] = 170 - d * 30;
      } else {
        const c = groundColor(x, z, h);
        const shade = 0.8 + Math.min(0.4, h / 40);
        img.data[o] = c.r * 255 * shade;
        img.data[o + 1] = c.g * 255 * shade;
        img.data[o + 2] = c.b * 255 * shade;
      }
      img.data[o + 3] = Math.hypot(x, z) > MAP_SPAN ? 0 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  painted.set(res, canvas);
  return canvas;
}

/** The hero's arrow, pointing where they face (north up). */
export function drawHeroArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  yaw: number,
  s = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI - yaw);
  ctx.scale(s, s);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#0b1320";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
