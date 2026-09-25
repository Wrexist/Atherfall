import { useEffect, useRef } from "react";
import { ABILITY_UNLOCK_LEVELS, ARCHETYPES } from "../data/archetypes";
import { ABILITIES, DODGE, type AbilityId } from "../data/combat";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { abilityUnlocked } from "../core/rules";

export type SlotId = "dodge" | AbilityId;

function cooldownOf(id: SlotId): { left: number; max: number } {
  const p = world.player;
  if (id === "dodge") return { left: p.dodgeCd, max: DODGE.cooldown };
  return { left: p.cooldowns[id], max: ABILITIES[id].cooldown };
}

// One shared animation-frame loop for every live HUD readout, instead of one
// requestAnimationFrame chain per button.
const tickers = new Set<() => void>();
let tickerRaf = 0;
function runTickers() {
  for (const fn of tickers) fn();
  tickerRaf = tickers.size ? requestAnimationFrame(runTickers) : 0;
}
function useTicker(fn: () => void, deps: React.DependencyList) {
  useEffect(() => {
    tickers.add(fn);
    if (!tickerRaf) tickerRaf = requestAnimationFrame(runTickers);
    return () => {
      tickers.delete(fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Reads cooldowns straight from the simulation every animation frame. */
export function CooldownSweep({ id }: { id: SlotId }) {
  const sweep = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const lastDeg = useRef(-1);
  useTicker(() => {
    const { left, max } = cooldownOf(id);
    const frac = max > 0 ? Math.min(1, left / max) : 0;
    // Whole degrees only: an unchanged gradient string is not rewritten (no repaint).
    const deg = Math.ceil(frac * 360);
    if (sweep.current && deg !== lastDeg.current) {
      lastDeg.current = deg;
      sweep.current.style.background = deg > 0 ? `conic-gradient(rgba(8,12,22,0.72) ${deg}deg, transparent 0deg)` : "transparent";
    }
    if (label.current) {
      const txt = left > 0.05 ? (left >= 1 ? Math.ceil(left).toString() : left.toFixed(1)) : "";
      if (label.current.textContent !== txt) label.current.textContent = txt;
    }
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

/** Current archetype's three ability slots with unlock state. */
export function useAbilitySlots() {
  const archetype = useGame((s) => s.archetype);
  const level = useGame((s) => s.level);
  return ARCHETYPES[archetype].abilities.map((id, i) => ({
    id,
    def: ABILITIES[id],
    key: String(i + 1),
    index: i,
    unlocked: abilityUnlocked(level, i),
    unlockLevel: ABILITY_UNLOCK_LEVELS[i],
  }));
}

const ICON: Record<SlotId, string> = {
  dodge: "M4 16c4-8 10-10 16-8M14 4l6 4-4 6",
  galestep: "M3 12h13M3 7h9M3 17h9M16 7l5 5-5 5",
  emberburst: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  barkward: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z",
  vault: "M20 12H7M11 7l-5 5 5 5M4 5v14",
  arrowrain: "M6 3v10M12 3v12M18 3v10M4 11l2 3 2-3M10 13l2 3 2-3M16 11l2 3 2-3M4 20h16",
  secondwind: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10zM9 12h6M12 9v6",
  blink: "M4 12h4M16 12h4M12 4v4M12 16v4M8 8l8 8M16 8l-8 8",
  frostnova: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3",
  aegis: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
};

export function SlotIcon({ id, className = "h-6 w-6" }: { id: SlotId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[id]} />
    </svg>
  );
}

/** Live combat state chips (ward, shield, haste, evade window, combo step). */
export function CombatStates() {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef("");
  useTicker(() => {
    const p = world.player;
    const parts: string[] = [];
    if (p.dodgeIframe > 0 || p.action === "gale") parts.push(`<span class="text-[#bfe6ff]">EVADE</span>`);
    if (p.wardT > 0) parts.push(`<span class="text-[#c9e39a]">WARD ${p.wardT.toFixed(1)}s</span>`);
    if (p.shieldHp > 0) parts.push(`<span class="text-[#b9a4ff]">AEGIS ${Math.ceil(p.shieldHp)}</span>`);
    if (p.hasteT > 0) parts.push(`<span class="text-[#9fe39a]">HASTE ${p.hasteT.toFixed(1)}s</span>`);
    if (p.action === "attack") {
      const pips = [1, 2, 3].map((n) => (n <= p.comboIdx ? "◆" : "◇")).join(" ");
      parts.push(`<span class="text-[var(--gilt)]">${pips}</span>`);
    }
    const html = parts.join(`<span class="opacity-40"> · </span>`);
    // Compare with the last string written — reading innerHTML serialises the DOM.
    if (ref.current && last.current !== html) {
      last.current = html;
      ref.current.innerHTML = html;
    }
  }, []);
  return <div ref={ref} data-testid="combat-states" className="h-5 text-center font-display text-sm tracking-[0.15em] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" />;
}

/** Desktop ability bar, bottom centre. */
export function AbilityBar() {
  const abilities = useAbilitySlots();
  const slots: Array<{ id: SlotId; name: string; key: string; on: boolean; hint?: string }> = [
    { id: "dodge", name: "Dodge", key: "F", on: true },
    ...abilities.map((a) => ({ id: a.id, name: a.def.name, key: a.key, on: a.unlocked, hint: `Level ${a.unlockLevel}` })),
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <CombatStates />
      <div className="flex gap-2">
        {slots.map((s) => (
          <div key={s.id} className="flex w-16 flex-col items-center gap-1" title={s.on ? s.name : `Unlocks at ${s.hint}`}>
            <div
              data-testid={`slot-${s.id}`}
              className={`relative flex h-12 w-12 items-center justify-center rounded-xl border-2 shadow-[0_3px_0_rgba(0,0,0,0.4)] ${
                s.on
                  ? "border-[var(--gilt)] bg-gradient-to-b from-[#3a5078] to-[#22324f] text-white"
                  : "border-[#56627a] bg-[#1c2940]/70 text-[var(--parchment)]/30"
              }`}
            >
              <SlotIcon id={s.id} />
              {s.on && <CooldownSweep id={s.id} />}
              <span className="absolute -right-1.5 -top-1.5 rounded-md bg-[var(--gilt)] px-1 font-mono text-[10px] font-bold text-[#3a2206] ring-2 ring-[#0b1320]">{s.key}</span>
            </div>
            <span className={`w-full truncate text-center text-[10px] font-extrabold text-outline ${s.on ? "text-[var(--parchment)]" : "text-[var(--parchment)]/45"}`}>
              {s.on ? s.name : s.hint}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
