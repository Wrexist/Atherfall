import { useEffect, useRef, useState } from "react";
import { LANDMARKS, SECRETS, WAYPOINTS } from "../data/world";
import { REGIONS } from "../world/terrain";
import { MAP_SPAN, drawHeroArrow, terrainCanvas } from "./mapPaint";
import { fastTravel, inCombat, world } from "../core/sim";
import { questTarget } from "../core/questTarget";
import { useGame } from "../core/store";

const SPAN = MAP_SPAN;
const RES = 150;

function toMap(x: number, z: number, size: number) {
  return { mx: ((x + SPAN) / (SPAN * 2)) * size, my: ((z + SPAN) / (SPAN * 2)) * size };
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
    const off = terrainCanvas(RES);
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
      ctx.font = "800 11px Nunito, system-ui, sans-serif";
      ctx.textAlign = "center";
      const st = useGame.getState();
      for (const [id, r] of Object.entries(REGIONS)) {
        if (!st.codex.places.includes(id)) continue;
        const { mx, my } = toMap(r.x, r.z, size);
        ctx.fillStyle = "rgba(14,22,36,0.6)";
        ctx.fillText(r.label, mx + 1, my + 1);
        ctx.fillStyle = "#f4f1ea";
        ctx.fillText(r.label, mx, my);
      }
      for (const l of LANDMARKS) {
        if (!st.landmarks.includes(l.id)) continue;
        const { mx, my } = toMap(l.x, l.z, size);
        ctx.fillStyle = "#ffcb5c";
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
        ctx.fillStyle = on ? "#9fd8ff" : "rgba(244,241,234,0.35)";
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
        ctx.strokeStyle = "#ffcb5c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 9 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      const p = world.player;
      const { mx, my } = toMap(p.x, p.z, size);
      drawHeroArrow(ctx, mx, my, p.yaw);
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[auto_1fr]">
      {/* Never taller than the screen allows: on a landscape phone it sits beside the list.
          (The one-column track is capped so the canvas's own pixel width can't widen it
          past an upright phone's screen.) */}
      <div className="mx-auto w-full max-w-[min(420px,calc(100dvh-8.5rem))]">
        <canvas
          ref={canvas}
          width={size}
          height={size}
          data-testid="world-map"
          className="aspect-square w-full max-w-full rounded-full border-4 border-[var(--edge)] shadow-[0_4px_0_rgba(0,0,0,0.35)]"
        />
        <p className="mt-1 text-center text-[11px] text-[var(--parchment)]/55">North is up · ◆ waypoint · ○ quest goal · ✓ opened cache</p>
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="mb-1.5 font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">Fast travel</h3>
          <div className="space-y-1.5">
            {WAYPOINTS.map((w) => {
              const on = s.waypoints.includes(w.id);
              return (
                <button
                  key={w.id}
                  data-testid={`travel-${w.id}`}
                  disabled={!on || fighting}
                  onClick={() => travel(w.id)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl bg-[var(--panel-2)] px-3 text-left text-sm font-extrabold text-[var(--parchment)] disabled:opacity-45"
                >
                  <span>{on ? w.name : "Undiscovered waypoint"}</span>
                  <span className="text-[11px] text-[var(--gilt)]">{on ? (fighting ? "in combat" : "Travel") : REGIONS[w.region as keyof typeof REGIONS]?.label ?? ""}</span>
                </button>
              );
            })}
          </div>
          {msg && <p className="mt-1.5 text-xs text-[#f0a595]">{msg}</p>}
        </div>
        <div>
          <h3 className="mb-1 font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">Secrets {s.secrets.length}/{SECRETS.length}</h3>
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
