import type { ReactNode } from "react";
import { assetUrl } from "../core/assets";
import type { ArchetypeId } from "../data/archetypes";
import { ITEMS, RARITY_COLOR, type EquipSlot, type Rarity } from "../data/items";
import type { InvEntry } from "../core/store";

/**
 * Shared look for panels and HUD, after Eternal Hero / Skull Hero: slate
 * panels, chunky outlined headings, gold primary buttons, and items shown as
 * rarity-coloured tiles with their icon (public/icons, rendered from the game's
 * own models by scripts/icons/render-icons.mjs).
 */

/** Accent per class, for its emblem ring and ability frames. */
export const CLASS_TONE: Record<ArchetypeId, string> = {
  vanguard: "#ff8a4c",
  ranger: "#6ee06a",
  arcanist: "#8fb8ff",
};
export const classIconUrl = (id: ArchetypeId) => assetUrl(`/icons/classes/${id}.png`);

// ─── Buttons ─────────────────────────────────────────────────────────────────

const base =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-extrabold transition-transform active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
export const BTN = {
  primary: `${base} border-b-4 border-[#b8741a] bg-gradient-to-b from-[#ffd970] to-[#f2a93b] text-[#3a2206] shadow-[0_2px_0_rgba(0,0,0,0.35)]`,
  secondary: `${base} border-b-4 border-[#16223a] bg-gradient-to-b from-[#3e5580] to-[#2c4063] text-[var(--parchment)] shadow-[0_2px_0_rgba(0,0,0,0.35)]`,
  danger: `${base} border-b-4 border-[#7a2417] bg-gradient-to-b from-[#f0735a] to-[#cf4630] text-white shadow-[0_2px_0_rgba(0,0,0,0.35)]`,
  shard: `${base} border-b-4 border-[#4b2d86] bg-gradient-to-b from-[#b58cff] to-[#7c52d6] text-white shadow-[0_2px_0_rgba(0,0,0,0.35)]`,
  ghost: `${base} border border-[var(--edge)] bg-[var(--ink)]/40 text-[var(--parchment)]`,
};

/** A raised card inside a panel. */
export const CARD = "rounded-2xl border border-[var(--edge)]/70 bg-[var(--panel-2)] p-3";
/** Small heading inside a card. */
export const H3 =
  "font-display text-[15px] leading-none tracking-wide text-[var(--gilt)] text-outline";

// ─── Icons ───────────────────────────────────────────────────────────────────

/** Solid 24×24 glyphs, drawn in their own colours so they read at a glance. */
const GLYPHS = {
  bag: {
    fill: "#e0a15a",
    d: "M8 6V5a4 4 0 0 1 8 0v1h1.5A2.5 2.5 0 0 1 20 8.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5A2.5 2.5 0 0 1 6.5 6H8Zm2 0h4V5a2 2 0 0 0-4 0v1Zm-2 7v2.5h8V13H8Z",
  },
  forge: {
    fill: "#b9c4d4",
    d: "M2 6h14.5a5.5 5.5 0 0 1-5.5 5.5h-.5V14H13l2.5 4h-11L7 14h2.5v-2.5H8A6 6 0 0 1 2 6Zm16 0h4v2.5h-4V6Z",
  },
  hero: {
    fill: "#8fc2ff",
    d: "M12 2a8 8 0 0 0-8 8v6.5L7.5 20H10v-6H7v-2.5h10V14h-3v6h2.5l3.5-3.5V10a8 8 0 0 0-8-8Zm-1.25 3h2.5v5h-2.5V5Z",
  },
  codex: {
    fill: "#c99bff",
    d: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5v-15ZM8 6v2.2h8V6H8Z",
  },
  map: {
    fill: "#7fd6a0",
    d: "M2.5 5.2 9 3l6 2.2L21.5 3v15.8L15 21l-6-2.2-6.5 2.2V5.2ZM9 5.4v11.2l6 2.2V7.6L9 5.4Z",
  },
  attack: {
    fill: "#dfe6ef",
    d: "M14.5 3H21v6.5l-9.3 9.3 1.4 1.4-1.4 1.4-2.8-2.8-3 3-1.4-1.4 3-3-2.8-2.8 1.4-1.4 1.4 1.4L14.5 3Z",
  },
  defense: {
    fill: "#6fb1ff",
    d: "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3Z",
  },
  health: {
    fill: "#ff5f6d",
    d: "M12 21s-7.5-4.6-9.5-9.2C1 8.4 3.3 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.5 0 5.8 3.4 4.3 6.8C19.5 16.4 12 21 12 21Z",
  },
  crit: {
    fill: "#ffd24a",
    d: "M12 2l2.4 6.3L21 9l-5 4.5L17.5 21 12 17.3 6.5 21 8 13.5 3 9l6.6-.7L12 2Z",
  },
  ember: {
    fill: "#ff9a3c",
    d: "M12 2c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.2 1.1-3.7 2.3-4.8.2 1.8 1 2.9 2.2 3.4C10.6 7.9 11.1 4.8 12 2Z",
  },
  shard: { fill: "#b88cff", d: "M12 2l6.5 7.5L12 22 5.5 9.5 12 2Z" },
  lock: {
    fill: "#ff8f7a",
    d: "M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z",
  },
  close: {
    fill: "#f4f1ea",
    d: "M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4 1.4-1.4Z",
  },
  check: { fill: "#ffffff", d: "M9.5 16.2 4.8 11.5l-1.6 1.6 6.3 6.3L21 7.9l-1.6-1.6-9.9 9.9Z" },
  gear: {
    fill: "#c8d3e2",
    d: "M10.3 2h3.4l.5 2.6a7.7 7.7 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7.7 7.7 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a7.7 7.7 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.7 7.7 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7.7 7.7 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a7.7 7.7 0 0 1 1.9-1.1l.5-2.6ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  },
  party: {
    fill: "#8fd3ff",
    d: "M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.5 0a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM1.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5v1h-15v-1Zm16.5 1v-1c0-2-.8-3.8-2.1-5.2.4 0 .7-.1 1.1-.1 3.4 0 6.2 2.4 6.2 5.4V21H18Z",
  },
  emote: {
    fill: "#ffd24a",
    d: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-3.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM7 14c.9 2.4 2.8 3.8 5 3.8s4.1-1.4 5-3.8H7Z",
  },
} as const;
export type GlyphId = keyof typeof GLYPHS;

export function Glyph({
  id,
  className = "h-5 w-5",
  color,
}: {
  id: GlyphId;
  className?: string | undefined;
  color?: string | undefined;
}) {
  const g = GLYPHS[id];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d={g.d}
        fill={color ?? g.fill}
        stroke="#0b1320"
        strokeWidth="1.4"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}

// ─── Items ───────────────────────────────────────────────────────────────────

/** Tile colours per rarity: frame, inner top, inner bottom, glow behind the icon. */
export const RARITY_TILE: Record<
  Rarity,
  { frame: string; top: string; bottom: string; glow: string }
> = {
  common: { frame: "#8e9aab", top: "#34445e", bottom: "#1f2b40", glow: "rgba(205,214,228,0.30)" },
  uncommon: { frame: "#4fc957", top: "#245a3a", bottom: "#142c21", glow: "rgba(110,224,106,0.40)" },
  rare: { frame: "#3f9cff", top: "#1f4f86", bottom: "#132846", glow: "rgba(79,176,255,0.45)" },
  epic: { frame: "#ffb23f", top: "#7a4c14", bottom: "#3b250b", glow: "rgba(255,190,80,0.55)" },
};

export const itemIconUrl = (itemId: string) => assetUrl(`/icons/items/${itemId}.png`);

/** Faint outline shown in an empty equipment slot. */
const SLOT_GLYPH: Record<EquipSlot, GlyphId> = {
  weapon: "attack",
  armor: "defense",
  accessory: "crit",
  relic: "shard",
};

export function ItemTile({
  entry,
  itemId,
  slot,
  size = "md",
  selected,
  marked,
  locked,
  worn,
  unknown,
  label,
  onClick,
  testId,
}: {
  entry?: InvEntry | null | undefined;
  /** For items not in the bag (codex). */
  itemId?: string | undefined;
  /** Shown as an empty slot when there's no item. */
  slot?: EquipSlot | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  selected?: boolean | undefined;
  marked?: boolean | undefined;
  locked?: boolean | undefined;
  worn?: boolean | undefined;
  unknown?: boolean | undefined;
  label?: string | undefined;
  onClick?: (() => void) | undefined;
  testId?: string | undefined;
}) {
  const id = entry?.itemId ?? itemId;
  const def = id ? ITEMS[id] : undefined;
  const t = def && !unknown ? RARITY_TILE[def.rarity] : RARITY_TILE.common;
  const box = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-12 w-12" : "h-16 w-16";
  const inner = (
    <>
      <span
        className="absolute inset-[3px] rounded-[10px]"
        style={{
          background: `radial-gradient(circle at 50% 38%, ${def && !unknown ? t.glow : "transparent"} 0%, transparent 62%), linear-gradient(180deg, ${t.top}, ${t.bottom})`,
        }}
      />
      {def && !unknown ? (
        <img
          src={itemIconUrl(def.id)}
          alt=""
          draggable={false}
          // A new item without its icon yet shows an empty tile, not a broken image.
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className={`relative h-full w-full object-contain p-1 ${locked ? "opacity-60 grayscale-[0.5]" : ""}`}
        />
      ) : def && unknown ? (
        <img
          src={itemIconUrl(def.id)}
          alt=""
          draggable={false}
          className="relative h-full w-full object-contain p-1.5 opacity-40 brightness-0"
        />
      ) : slot ? (
        <span className="relative grid h-full w-full place-items-center opacity-30">
          <Glyph id={SLOT_GLYPH[slot]} className="h-1/2 w-1/2" color="#9aa9c0" />
        </span>
      ) : null}
      {def && !unknown && (
        <span
          className={`absolute bottom-[3px] left-[3px] rounded-md px-1 text-[10px] font-black leading-4 ${
            locked ? "bg-[#c0392b] text-white" : "bg-black/55 text-white"
          }`}
        >
          {locked && <Glyph id="lock" className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" color="#fff" />}
          {def.level}
        </span>
      )}
      {entry && entry.plus > 0 && (
        <span className="absolute right-[3px] top-[3px] rounded-md bg-[#ffcb5c] px-1 text-[10px] font-black leading-4 text-[#3a2206]">
          +{entry.plus}
        </span>
      )}
      {worn && (
        <span className="absolute left-[3px] top-[3px] rounded-md bg-[var(--gilt)] px-1 text-[9px] font-black leading-4 text-[#3a2206]">
          E
        </span>
      )}
      {marked && (
        <span className="absolute inset-0 grid place-items-center rounded-xl bg-[#e5533d]/35">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#e5533d] ring-2 ring-white">
            <Glyph id="check" className="h-4 w-4" />
          </span>
        </span>
      )}
    </>
  );
  const frame = {
    background: `linear-gradient(180deg, ${t.frame}, ${t.frame}bb)`,
    boxShadow: selected
      ? `0 0 0 3px #fff, 0 0 14px ${def ? RARITY_COLOR[def.rarity] : "#fff"}`
      : "0 2px 0 rgba(0,0,0,0.45)",
  };
  const cls = `relative shrink-0 rounded-xl ${box}`;
  return (
    <div className="flex flex-col items-center gap-0.5">
      {onClick ? (
        <button
          data-testid={testId}
          onClick={onClick}
          className={`${cls} transition-transform active:scale-95`}
          style={frame}
          aria-label={def ? (unknown ? "Unknown item" : def.name) : label}
          aria-pressed={selected}
        >
          {inner}
        </button>
      ) : (
        <div data-testid={testId} className={cls} style={frame}>
          {inner}
        </div>
      )}
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--parchment)]/60">
          {label}
        </span>
      )}
    </div>
  );
}

/** "⚔ 12" with the stat's icon; delta shown green up or red down. */
export function StatChip({
  icon,
  value,
  delta,
  suffix = "",
  title,
}: {
  icon: GlyphId;
  value: ReactNode;
  delta?: number | undefined;
  suffix?: string;
  title: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 rounded-xl bg-[var(--ink)]/55 px-2 py-1.5"
      title={title}
    >
      <Glyph id={icon} className="h-5 w-5 shrink-0" />
      <span className="sr-only">{title}</span>
      <span className="text-sm font-extrabold text-[var(--parchment)]">
        {value}
        {suffix}
      </span>
      {delta !== undefined && delta !== 0 && (
        <span
          className={`text-xs font-extrabold ${delta > 0 ? "text-[#6ee06a]" : "text-[#ff7a6a]"}`}
        >
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
          {suffix}
        </span>
      )}
    </div>
  );
}
