import { useState, type ReactNode } from "react";
import { input } from "../core/input";
import { EMOTES } from "../data/emotes";

/**
 * Touch: an Emote button that opens Wave / Cheer / Sit. Other signed-in
 * players see the gesture too. `openTo` is the side the list opens toward.
 */
const EMOJI: Record<string, string> = { wave: "👋", cheer: "🎉", sit: "☕" };

export function EmotePicker({
  buttonClass,
  openTo,
  children = "Emote",
}: {
  buttonClass: string;
  openTo: "left" | "up";
  /** Button content (the HUD passes an icon and a label). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className={buttonClass}
        aria-expanded={open}
        onPointerDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        {children}
      </button>
      {open && (
        <div
          className={`pointer-events-auto absolute flex gap-1.5 rounded-2xl bg-[var(--panel)] p-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.45)] ring-2 ring-[var(--edge)] ${
            openTo === "left"
              ? "right-full top-0 mr-2 flex-row"
              : "bottom-full left-1/2 mb-2 -translate-x-1/2 flex-row"
          }`}
        >
          {EMOTES.map((em) => (
            <button
              key={em.id}
              className="flex min-h-12 min-w-14 touch-none flex-col items-center justify-center rounded-xl bg-[var(--panel-2)] px-2 text-[11px] font-extrabold text-[var(--parchment)] active:bg-[var(--gilt)]/35"
              onPointerDown={(e) => {
                e.preventDefault();
                input.emoteQueued = em.id;
                setOpen(false);
              }}
            >
              <span className="text-lg leading-none">{EMOJI[em.id] ?? "✨"}</span>
              {em.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
