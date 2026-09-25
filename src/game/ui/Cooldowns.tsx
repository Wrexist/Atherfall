import { useEffect, useRef } from "react";
import { ABILITIES, DODGE, abilityUnlocked, type AbilityDef } from "../data/combat";
import { world } from "../core/sim";
import { useGame } from "../core/store";

export type SlotId = "dodge" | AbilityDef["id"];

function cooldownOf(id: SlotId): { left: number; max: number } {
  const p = world.player;
  if (id === "dodge") return { left: p.dodgeCd, max: DODGE.cooldown };
  const def = ABILITIES.find((a) => a.id === id)!;
  return { left: p.cooldowns[id], max: def.cooldown };
}

/** Reads cooldowns straight from the simulation every animation frame. */
export function CooldownSweep({ id }: { id: SlotId }) {
  const sweep = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { left, max } = cooldownOf(id);
      const frac = max > 0 ? left / max : 0;
      if (sweep.current) {
        sweep.current.style.background = frac > 0 ? `conic-gradient(rgba(12,8,6,0.72) ${frac * 360}deg, transparent 0deg)` : "transparent";
      }
      if (label.current) {
        const txt = left > 0.05 ? (left >= 1 ? Math.ceil(left).toString() : left.toFixed(1)) : "";
        if (label.current.textContent !== txt) label.current.textContent = txt;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return (
    <>
      <div ref={sweep} className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      <span
        ref={label}
        data-testid={`cd-${id}`}
        className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-base font-bold text-[var(--parchment)] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
      />
    </>
  );
}

export function useUnlocked() {
  const step = useGame((s) => s.questStep);
  const done = useGame((s) => s.questComplete);
  return ABILITIES.map((a) => abilityUnlocked(a, step, done));
}

const ICON: Record<SlotId, string> = {
  dodge: "M4 16c4-8 10-10 16-8M14 4l6 4-4 6",
  galestep: "M3 12h13M3 7h9M3 17h9M16 7l5 5-5 5",
  emberburst: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  barkward: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z",
};

export function SlotIcon({ id, className = "h-6 w-6" }: { id: SlotId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[id]} />
    </svg>
  );
}

/** Live combat state chips (ward, evade window, combo step). */
export function CombatStates() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = world.player;
      const parts: string[] = [];
      if (p.dodgeIframe > 0 || p.action === "gale") parts.push(`<span class="text-[#bfe6ff]">EVADE</span>`);
      if (p.wardT > 0) parts.push(`<span class="text-[#c9e39a]">WARD ${p.wardT.toFixed(1)}s</span>`);
      if (p.action === "attack") {
        const pips = [1, 2, 3].map((n) => (n <= p.comboIdx ? "◆" : "◇")).join(" ");
        parts.push(`<span class="text-[var(--gilt)]">${pips}</span>`);
      }
      const html = parts.join(`<span class="opacity-40"> · </span>`);
      if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} data-testid="combat-states" className="h-5 text-center font-display text-sm tracking-[0.15em] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" />;
}

/** Desktop ability bar, bottom centre. */
export function AbilityBar() {
  const unlocked = useUnlocked();
  const slots: Array<{ id: SlotId; name: string; key: string; on: boolean; hint?: string }> = [
    { id: "dodge", name: "Dodge", key: "F", on: true },
    ...ABILITIES.map((a, i) => ({ id: a.id, name: a.name, key: a.key, on: unlocked[i]!, hint: a.unlockHint })),
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <CombatStates />
      <div className="flex gap-2">
        {slots.map((s) => (
          <div key={s.id} className="flex w-16 flex-col items-center gap-1" title={s.on ? s.name : `Locked — ${s.hint}`}>
            <div
              data-testid={`slot-${s.id}`}
              className={`relative flex h-12 w-12 items-center justify-center rounded-lg border ${
                s.on ? "border-[var(--gilt)]/50 bg-[var(--panel)]/85 text-[var(--parchment)]" : "border-[var(--parchment)]/15 bg-[var(--panel)]/50 text-[var(--parchment)]/25"
              }`}
            >
              <SlotIcon id={s.id} />
              {s.on && <CooldownSweep id={s.id} />}
              <span className="absolute -right-1 -top-1 rounded bg-[var(--ink)] px-1 font-mono text-[10px] text-[var(--gilt)]">{s.key}</span>
            </div>
            <span className={`w-full truncate text-center text-[10px] ${s.on ? "text-[var(--parchment)]/85" : "text-[var(--parchment)]/40"}`}>
              {s.on ? s.name : s.hint}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
