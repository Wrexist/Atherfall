import { useState } from "react";
import { input } from "../core/input";
import { EMOTES } from "../data/emotes";

/**
 * Touch: an Emote button that opens Wave / Cheer / Sit. Other signed-in
 * players see the gesture too. `openTo` is the side the list opens toward.
 */
export function EmotePicker({
  buttonClass,
  openTo,
}: {
  buttonClass: string;
  openTo: "left" | "up";
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
        Emote
      </button>
      {open && (
        <div
          className={`pointer-events-auto absolute flex gap-1.5 rounded-xl border border-[var(--gilt)]/40 bg-[var(--panel)]/90 p-1.5 ${
            openTo === "left"
              ? "right-full top-0 mr-2 flex-row"
              : "bottom-full left-1/2 mb-2 -translate-x-1/2 flex-row"
          }`}
        >
          {EMOTES.map((em) => (
            <button
              key={em.id}
              className="min-h-11 min-w-14 touch-none rounded-lg border border-[var(--gilt)]/30 px-2 text-xs font-semibold text-[var(--parchment)] active:bg-[var(--gilt)]/35"
              onPointerDown={(e) => {
                e.preventDefault();
                input.emoteQueued = em.id;
                setOpen(false);
              }}
            >
              {em.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
