import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { sfx } from "../core/audio";
import {
  centreFraction,
  minimapPx,
  minimapRadiusM,
  placeMinimap,
  project,
  toRim,
} from "../core/minimap";
import { questTarget } from "../core/questTarget";
import { useSettings } from "../core/settings";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { ENEMIES } from "../data/enemies";
import { ITEMS, RARITY_COLOR } from "../data/items";
import { WAYPOINTS } from "../data/world";
import { remotes, usePresence } from "../online/presence";
import { NPCS } from "../world/layout";
import { BTN } from "./kit";
import { usePortrait } from "./layout";
import { MAP_SPAN, drawHeroArrow, terrainCanvas } from "./mapPaint";

/** Minimap edit mode (drag it, resize it); entered from the menu or by holding the minimap. */
export const useMinimapEdit = create<{ editing: boolean }>(() => ({ editing: false }));
export const editMinimap = (editing: boolean) => useMinimapEdit.setState({ editing });

const TERRAIN_RES = 256;
const HOLD_MS = 550;
const clampScale = (v: number) => Math.round(Math.min(1.6, Math.max(0.7, v)) * 10) / 10;

/** Height the HUD should leave free under the minimap in its default top-right spot. */
export function useMinimapReserve() {
  const on = useSettings((s) => s.minimap);
  const scale = useSettings((s) => s.minimapScale);
  const at = useSettings((s) => s.minimapAt);
  const portrait = usePortrait();
  const editing = useMinimapEdit((s) => s.editing);
  const moved = portrait ? at.portrait : at.landscape;
  if ((!on && !editing) || moved) return 0;
  return minimapPx(scale) + 22;
}

function useViewport() {
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 390 : window.innerWidth,
    h: typeof window === "undefined" ? 844 : window.innerHeight,
  }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/**
 * Round (or square) map of the ground around the hero, north up: enemies,
 * villagers, loot, other players, waypoints and the quest goal (on the rim
 * when it's further away). Tap it for the full map; hold it to move it.
 */
export function Minimap() {
  const on = useSettings((s) => s.minimap);
  const scale = useSettings((s) => s.minimapScale);
  const zoom = useSettings((s) => s.minimapZoom);
  const round = useSettings((s) => s.minimapRound);
  const opacity = useSettings((s) => s.minimapOpacity);
  const at = useSettings((s) => s.minimapAt);
  const update = useSettings((s) => s.update);
  const editing = useMinimapEdit((s) => s.editing);
  const portrait = usePortrait();
  const region = useGame((g) => g.region);
  const online = usePresence((p) => (p.connected ? p.online : 0));
  const vp = useViewport();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const press = useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const size = minimapPx(scale);
  const orient = portrait ? "portrait" : "landscape";
  const saved = at[orient];
  const visible = on || editing;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!visible || !c || !ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    const terrain = terrainCanvas(TERRAIN_RES);
    const half = size / 2;
    const k = TERRAIN_RES / (MAP_SPAN * 2);
    const rM = minimapRadiusM(zoom);
    const TAU = Math.PI * 2;

    const dot = (dx: number, dz: number, r: number, fill: string) => {
      const m = project(dx, dz, rM, half);
      if (toRim(m.x, m.y, half, round, r).outside) return;
      ctx.beginPath();
      ctx.arc(half + m.x, half + m.y, r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };

    const draw = () => {
      const p = world.player;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      if (round) ctx.arc(half, half, half, 0, TAU);
      else ctx.rect(0, 0, size, size);
      ctx.clip();
      ctx.fillStyle = "#1f5f78"; // open sea beyond the painted island
      ctx.fillRect(0, 0, size, size);
      const u = (p.x + MAP_SPAN) * k;
      const v = (p.z + MAP_SPAN) * k;
      const rr = rM * k;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrain, u - rr, v - rr, rr * 2, rr * 2, 0, 0, size, size);

      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "#0b1320";
      const st = useGame.getState();
      for (const w of WAYPOINTS) {
        if (!st.waypoints.includes(w.id)) continue;
        const m = project(w.x - p.x, w.z - p.z, rM, half);
        if (toRim(m.x, m.y, half, round, 6).outside) continue;
        const x = half + m.x;
        const y = half + m.y;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 4.5, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 4.5, y);
        ctx.closePath();
        ctx.fillStyle = "#6fc3ff";
        ctx.fill();
        ctx.stroke();
      }
      for (const d of world.drops) {
        if (d.taken) continue;
        const item = d.itemId ? ITEMS[d.itemId] : undefined;
        dot(d.x - p.x, d.z - p.z, 2.4, item ? RARITY_COLOR[item.rarity] : "#ffcb5c");
      }
      for (const n of NPCS) dot(n.x - p.x, n.z - p.z, 3.2, "#ffd24a");
      for (const r of remotes.values()) {
        if (r.placed) dot(r.rx - p.x, r.rz - p.z, 3.2, "#5fe1ff");
      }
      for (const e of world.enemies) {
        if (e.hp <= 0) continue;
        const boss = ENEMIES[e.type]?.boss;
        dot(e.x - p.x, e.z - p.z, boss ? 5.5 : e.aggro ? 3.6 : 3, boss ? "#ff2d55" : "#ff5a4a");
      }

      const q = questTarget();
      if (q) {
        const m = project(q.x - p.x, q.z - p.z, rM, half);
        const rim = toRim(m.x, m.y, half, round, 9);
        const x = half + rim.x;
        const y = half + rim.y;
        ctx.strokeStyle = "#0b1320";
        if (rim.outside) {
          // An arrow on the rim, pointing the way.
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.atan2(rim.y, rim.x));
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-5, -6.5);
          ctx.lineTo(-2, 0);
          ctx.lineTo(-5, 6.5);
          ctx.closePath();
          ctx.fillStyle = "#ffcb5c";
          ctx.lineWidth = 1.6;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          const pulse = 6 + Math.sin(performance.now() / 260) * 1.5;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(x, y, pulse, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = "#ffcb5c";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      drawHeroArrow(ctx, half, half, p.yaw, 0.95);
      ctx.restore();
    };
    draw();
    const iv = setInterval(draw, 100); // 10 fps: plenty for a map, and cheap
    return () => clearInterval(iv);
  }, [visible, size, zoom, round]);

  if (!visible) return null;

  const pos = drag ?? (saved ? placeMinimap(saved, size, vp.w, vp.h) : null);
  const corner = portrait
    ? {
        top: "max(0.75rem, env(safe-area-inset-top))",
        right: "max(0.75rem, env(safe-area-inset-right))",
      }
    : {
        top: "max(1.25rem, env(safe-area-inset-top))",
        right: "max(1.5rem, env(safe-area-inset-right))",
      };

  const clearHold = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = {
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
      timer: editing
        ? null
        : setTimeout(() => {
            if (press.current) press.current.timer = null;
            sfx.ui();
            editMinimap(true);
          }, HOLD_MS),
    };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    if (!pr) return;
    if (!editing) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 10) clearHold();
      return;
    }
    const at = centreFraction(e.clientX - pr.dx, e.clientY - pr.dy, size, vp.w, vp.h);
    setDrag(placeMinimap(at, size, vp.w, vp.h));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    press.current = null;
    if (!pr) return;
    if (editing) {
      if (drag) {
        update({
          minimapAt: { ...at, [orient]: centreFraction(drag.left, drag.top, size, vp.w, vp.h) },
        });
        setDrag(null);
      }
      return;
    }
    const wasHold = pr.timer === null;
    clearHold();
    if (!wasHold && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) <= 10) {
      sfx.ui();
      useGame.getState().toggleInventory(true, "map");
    }
  };

  // Toolbar on the side with room: above the map when it's low on the screen,
  // and pinned to the screen edge it's near.
  const top = pos?.top ?? 0;
  const left = pos?.left ?? vp.w - size;
  const toolbarAbove = top + size > vp.h * 0.6;
  const toolbarX =
    left + size / 2 < 140
      ? "left-0"
      : left + size / 2 > vp.w - 140
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  // Portalled to the game shell: the HUD's own layer sits under the touch
  // controls, and a minimap moved over the joystick area must still take taps
  // (while staying under the journal and menus).
  return createPortal(
    <div
      data-testid="minimap"
      className="pointer-events-none fixed z-[21] flex flex-col items-center select-none"
      style={pos ? { left: pos.left, top: pos.top, width: size } : { ...corner, width: size }}
    >
      <div
        role="button"
        aria-label={
          editing ? "Minimap: drag to move" : "Minimap: tap for the full map, hold to move"
        }
        className={`pointer-events-auto relative touch-none ${round ? "rounded-full" : "rounded-2xl"} ${
          editing ? "outline-dashed outline-[3px] outline-offset-4 outline-[var(--gilt)]" : ""
        }`}
        style={{
          width: size,
          height: size,
          opacity,
          boxShadow:
            "0 0 0 3px #1c2940, 0 0 0 5px #0b1320, inset 0 0 0 1px rgba(255,255,255,0.18), 0 5px 0 5px rgba(0,0,0,0.25)",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          clearHold();
          press.current = null;
          setDrag(null);
        }}
      >
        <canvas
          ref={canvas}
          className={`h-full w-full ${round ? "rounded-full" : "rounded-2xl"}`}
          aria-hidden
        />
        <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1c2940] px-1.5 font-display text-[11px] leading-4 text-[var(--gilt)] ring-2 ring-[#0b1320]">
          N
        </span>
      </div>
      {region && (
        <div className="mt-2 max-w-[10rem] truncate rounded-full bg-[var(--ink)]/70 px-2.5 py-0.5 font-display text-xs text-[var(--parchment)] text-outline">
          {region}
        </div>
      )}
      {online > 1 && (
        <div
          data-testid="online-count"
          className="mt-1 rounded-full bg-[var(--ink)]/70 px-2 text-[11px] font-extrabold text-[#8ff0a0]"
        >
          ● {online} online
        </div>
      )}
      {editing && (
        <div
          className={`pointer-events-auto absolute flex w-max flex-col items-center gap-1.5 rounded-2xl bg-[var(--panel)] p-2 text-[var(--parchment)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] ring-2 ring-[var(--edge)] ${toolbarX} ${
            toolbarAbove ? "bottom-full mb-4" : "top-full mt-4"
          }`}
        >
          <span className="text-[11px] font-extrabold text-[var(--parchment)]/80">
            Drag the map to move it
          </span>
          <div className="flex gap-1.5">
            <button
              className={`${BTN.secondary} min-w-11 !px-3`}
              aria-label="Smaller minimap"
              onClick={() => update({ minimapScale: clampScale(scale - 0.1) })}
            >
              −
            </button>
            <button
              className={`${BTN.secondary} min-w-11 !px-3`}
              aria-label="Bigger minimap"
              onClick={() => update({ minimapScale: clampScale(scale + 0.1) })}
            >
              +
            </button>
            <button
              className={`${BTN.ghost} !px-3`}
              onClick={() => update({ minimapAt: { ...at, [orient]: null } })}
            >
              Reset
            </button>
            <button className={`${BTN.primary} !px-4`} onClick={() => editMinimap(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>,
    document.getElementById("game-shell") ?? document.body,
  );
}
