import { useEffect, useRef, useState } from "react";
import { LANDMARKS, SECRETS, WAYPOINTS } from "../data/world";
import { QUESTS } from "../data/quests";
import { SPAWNS } from "../world/layout";
import { REGIONS, SEA_LEVEL, groundColor, heightAt } from "../world/terrain";
import { fastTravel, inCombat, world } from "../core/sim";
import { useGame } from "../core/store";

const SPAN = 100; // world units from centre to edge of the map
const RES = 150;
let cached: ImageData | null = null;

function toMap(x: number, z: number, size: number) {
  return { mx: ((x + SPAN) / (SPAN * 2)) * size, my: ((z + SPAN) / (SPAN * 2)) * size };
}

/** Terrain painted once from the same heightfield the game uses. */
function terrainImage(ctx: CanvasRenderingContext2D) {
  if (cached) return cached;
  const img = ctx.createImageData(RES, RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = (i / RES) * SPAN * 2 - SPAN;
      const z = (j / RES) * SPAN * 2 - SPAN;
      const h = heightAt(x, z);
      const o = (j * RES + i) * 4;
      if (h < SEA_LEVEL) {
        const d = Math.min(1, (SEA_LEVEL - h) / 8);
        img.data[o] = 60 - d * 30;
        img.data[o + 1] = 130 - d * 50;
        img.data[o + 2] = 140 - d * 30;
      } else {
        const c = groundColor(x, z, h);
        const shade = 0.75 + Math.min(0.4, h / 40);
        img.data[o] = c.r * 255 * shade;
        img.data[o + 1] = c.g * 255 * shade;
        img.data[o + 2] = c.b * 255 * shade;
      }
      img.data[o + 3] = Math.hypot(x, z) > 100 ? 0 : 255;
    }
  }
  cached = img;
  return img;
}

function questTarget(): { x: number; z: number } | null {
  const s = useGame.getState();
  if (s.questComplete) return null;
  const step = QUESTS[s.questIdx]?.steps[s.questStep];
  if (!step) return null;
  if (step.kind === "talk") return { x: 3.2, z: 3.6 };
  if (step.kind === "reach") {
    const r = REGIONS[step.area as keyof typeof REGIONS];
    return r ? { x: r.x, z: r.z } : null;
  }
  if (step.kind === "kill" || step.kind === "boss") {
    const sp = SPAWNS.find((x) => x.type === step.enemy);
    return sp ? { x: sp.x, z: sp.z } : null;
  }
  return null;
}

export function WorldMap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const s = useGame();
  const [msg, setMsg] = useState<string | null>(null);
  const size = 420;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    // Sharp on retina phones: back the canvas with device pixels, draw in CSS pixels.
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const off = document.createElement("canvas");
    off.width = RES;
    off.height = RES;
    off.getContext("2d")!.putImageData(terrainImage(off.getContext("2d")!), 0, 0);
    let raf = 0;
    let lastDraw = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // ~20fps is plenty for a map marker and saves redrawing the whole map 60×/s.
      if (now - lastDraw < 50) return;
      lastDraw = now;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, size, size);
      ctx.font = "600 11px Cinzel, Georgia, serif";
      ctx.textAlign = "center";
      const st = useGame.getState();
      for (const [id, r] of Object.entries(REGIONS)) {
        if (!st.codex.places.includes(id)) continue;
        const { mx, my } = toMap(r.x, r.z, size);
        ctx.fillStyle = "rgba(23,17,13,0.55)";
        ctx.fillText(r.label, mx + 1, my + 1);
        ctx.fillStyle = "#f3e4c8";
        ctx.fillText(r.label, mx, my);
      }
      for (const l of LANDMARKS) {
        if (!st.landmarks.includes(l.id)) continue;
        const { mx, my } = toMap(l.x, l.z, size);
        ctx.fillStyle = "#e5b45c";
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const sec of SECRETS) {
        if (!st.secrets.includes(sec.id)) continue;
        const { mx, my } = toMap(sec.x, sec.z, size);
        ctx.fillStyle = "#8fd18a";
        ctx.fillText("✓", mx, my + 4);
      }
      for (const w of WAYPOINTS) {
        const on = st.waypoints.includes(w.id);
        const { mx, my } = toMap(w.x, w.z, size);
        ctx.fillStyle = on ? "#9fd8ff" : "rgba(243,228,200,0.35)";
        ctx.beginPath();
        ctx.moveTo(mx, my - 7);
        ctx.lineTo(mx + 5, my);
        ctx.lineTo(mx, my + 7);
        ctx.lineTo(mx - 5, my);
        ctx.closePath();
        ctx.fill();
      }
      const q = questTarget();
      if (q) {
        const { mx, my } = toMap(q.x, q.z, size);
        ctx.strokeStyle = "#e5b45c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 9 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      const p = world.player;
      const { mx, my } = toMap(p.x, p.z, size);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI - p.yaw);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#17110d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5.5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5.5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const travel = (id: string) => {
    const r = fastTravel(id);
    setMsg(r.ok ? null : r.message);
  };
  const fighting = inCombat();

  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr]">
      <div className="mx-auto w-full max-w-[420px]">
        <canvas
          ref={canvas}
          width={size}
          height={size}
          data-testid="world-map"
          className="aspect-square w-full rounded-full border border-[var(--gilt)]/30"
        />
        <p className="mt-1 text-center text-[10px] text-[var(--parchment)]/55">North is up · ◆ waypoint · ○ quest goal · ✓ opened cache</p>
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Fast travel</h3>
          <div className="space-y-1.5">
            {WAYPOINTS.map((w) => {
              const on = s.waypoints.includes(w.id);
              return (
                <button
                  key={w.id}
                  data-testid={`travel-${w.id}`}
                  disabled={!on || fighting}
                  onClick={() => travel(w.id)}
                  className="flex w-full items-center justify-between rounded-md border border-[var(--gilt)]/25 bg-[var(--ink)]/40 px-2.5 py-1.5 text-left text-xs text-[var(--parchment)] disabled:opacity-40"
                >
                  <span>{on ? w.name : "Undiscovered waypoint"}</span>
                  <span className="text-[10px] text-[var(--gilt)]">{on ? (fighting ? "in combat" : "Travel") : REGIONS[w.region as keyof typeof REGIONS]?.label ?? ""}</span>
                </button>
              );
            })}
          </div>
          {msg && <p className="mt-1.5 text-xs text-[#f0a595]">{msg}</p>}
        </div>
        <div>
          <h3 className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Secrets {s.secrets.length}/{SECRETS.length}</h3>
          {SECRETS.map((sec) => (
            <p key={sec.id} className="text-[11px] text-[var(--parchment)]/70">
              {s.secrets.includes(sec.id) ? `✓ ${sec.name}` : `? ${sec.hint}`}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
