import { useEffect, useState } from "react";
import { ITEMS } from "../data/items";
import { QUESTS } from "../data/quests";
import { ARCHETYPES } from "../data/archetypes";
import { AbilityBar } from "./Cooldowns";
import { useShallow } from "zustand/react/shallow";
import { statsFor, useGame, xpForLevel } from "../core/store";

function Bar({
  value,
  max,
  className,
  height = "h-3",
}: {
  value: number;
  max: number;
  className: string;
  height?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`${height} w-full overflow-hidden rounded-full bg-[var(--ink)]/60 ring-1 ring-[var(--gilt)]/30`}>
      <div className={`h-full rounded-full transition-[width] duration-200 ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** True on mouse/trackpad devices; phones never mount the desktop-only HUD pieces. */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setFine(mq.matches);
    const on = () => setFine(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return fine;
}

export function Hud() {
  const fine = useFinePointer();
  // Select only what the HUD shows, so unrelated store writes don't re-render it.
  const s = useGame(
    useShallow((g) => ({
      archetype: g.archetype,
      level: g.level,
      hp: g.hp,
      xp: g.xp,
      equipped: g.equipped,
      gold: g.gold,
      shards: g.shards,
      potions: g.potions,
      region: g.region,
      questIdx: g.questIdx,
      questStep: g.questStep,
      questKills: g.questKills,
      questComplete: g.questComplete,
      bossBar: g.bossBar,
      interactPrompt: g.interactPrompt,
      dialogue: g.dialogue,
      toasts: g.toasts,
    })),
  );
  const stats = statsFor(s);
  const quest = QUESTS[s.questIdx]!;
  const step = quest.steps[s.questStep];
  const weapon = s.equipped.weapon ? ITEMS[s.equipped.weapon.itemId] : null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 select-none"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
    <div className="relative h-full w-full">
      {/* Vitals */}
      <div className="absolute left-0 top-0 w-52 space-y-1.5 rounded-lg bg-[var(--panel)]/55 p-2.5 backdrop-blur-sm sm:w-72 sm:p-3">
        <div className="flex items-baseline justify-between font-display text-sm text-[var(--parchment)]">
          <span className="tracking-[0.18em]">{ARCHETYPES[s.archetype].name.toUpperCase()}</span>
          <span className="text-[var(--gilt)]">Lv {s.level}</span>
        </div>
        <Bar value={s.hp} max={stats.maxHp} className="bg-gradient-to-r from-[#c2412f] to-[#e8735a]" height="h-4" />
        <div className="flex justify-between gap-2 text-xs font-medium text-[var(--parchment)]">
          <span>
            {Math.ceil(s.hp)} / {stats.maxHp}
          </span>
          <span data-testid="hud-stats">
            ATK {stats.attack} · DEF {stats.defense}
          </span>
        </div>
        <Bar value={s.xp} max={xpForLevel(s.level)} className="bg-gradient-to-r from-[#7a6ad8] to-[#b2a1ff]" height="h-1.5" />
      </div>

      {/* Region, gold and quest tracker stacked in one column so they never overlap */}
      <div className="absolute right-0 top-0 flex w-52 flex-col items-end gap-2 sm:w-64">
        <div className="rounded-lg bg-[var(--panel)]/70 px-3 py-1.5 text-right backdrop-blur-sm">
          <div className="font-display text-sm tracking-[0.2em] text-[var(--parchment)] drop-shadow sm:text-base">
            {s.region ?? "Dawnreach"}
          </div>
          <div className="text-xs text-[var(--gilt)] drop-shadow">{s.gold} embers · {s.shards} shards</div>
        </div>
        <div className="w-full rounded-lg border border-[var(--gilt)]/25 bg-[var(--panel)]/85 p-2.5 backdrop-blur-sm sm:p-3">
          <div className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--gilt)]">
            {quest.name}
          </div>
          {s.questComplete ? (
            <p className="mt-1.5 text-xs leading-snug text-[var(--parchment)]/90">
              All quests complete. Keep forging — Dawnreach will need you again.
            </p>
          ) : step ? (
            <>
              <p data-testid="quest-step" className="mt-1.5 text-sm font-medium leading-snug text-[var(--parchment)]">
                {step.title}
                {step.kind === "kill" ? ` (${s.questKills}/${step.count})` : ""}
              </p>
              <p className="mt-1 hidden text-xs leading-snug text-[var(--parchment)]/70 min-[480px]:[@media(min-height:420px)]:block">
                {step.hint}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Boss bar */}
      {s.bossBar && (
        <div className="absolute left-1/2 top-4 w-[max(12rem,min(30rem,calc(100%-37rem)))] -translate-x-1/2">
          <div className="text-center font-display text-sm tracking-[0.2em] text-[var(--parchment)] drop-shadow">
            {s.bossBar.name.toUpperCase()}
            {s.bossBar.phase === 2 && <span className="ml-2 text-[#f0a595]">· ENRAGED</span>}
          </div>
          <div className="mt-1">
            <Bar value={s.bossBar.hp} max={s.bossBar.max} className="bg-gradient-to-r from-[#8c2f22] to-[#e2894b]" height="h-3" />
          </div>
        </div>
      )}

      {/* Interact prompt */}
      {s.interactPrompt && !s.dialogue && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 rounded-full border border-[var(--gilt)]/30 bg-[var(--panel)]/85 px-4 py-1.5 text-xs text-[var(--parchment)] backdrop-blur-sm">
          {s.interactPrompt}
          <span className="ml-2 hidden rounded bg-[var(--gilt)]/20 px-1.5 py-0.5 font-mono text-[10px] text-[var(--gilt)] sm:inline">
            E
          </span>
        </div>
      )}

      {/* Toasts */}
      <div className="absolute bottom-32 left-1/2 flex w-[min(24rem,80vw)] -translate-x-1/2 flex-col items-center gap-1.5">
        {s.toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md border px-3 py-1.5 text-center text-xs backdrop-blur-sm ${
              t.tone === "quest"
                ? "border-[var(--gilt)]/50 bg-[var(--gilt)]/15 text-[var(--gilt)]"
                : t.tone === "good"
                  ? "border-[#8fd18a]/40 bg-[var(--panel)]/85 text-[#b7e8b1]"
                  : t.tone === "bad"
                    ? "border-[#e8735a]/40 bg-[var(--panel)]/85 text-[#f0a595]"
                    : "border-[var(--gilt)]/20 bg-[var(--panel)]/85 text-[var(--parchment)]"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Ability bar (desktop) */}
      {fine && !s.dialogue && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <AbilityBar />
        </div>
      )}

      {/* Loadout + key hints (mouse/keyboard devices only; touch uses on-screen buttons) */}
      <div className={`absolute bottom-0 left-0 hidden items-stretch gap-3 ${s.dialogue ? "" : "[@media(pointer:fine)]:flex"}`}>
        <div className="rounded-lg border border-[var(--gilt)]/25 bg-[var(--panel)]/80 px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--gilt)]">Weapon</div>
          <div className="text-sm text-[var(--parchment)]">{weapon?.name ?? "Bare hands"}</div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-[var(--panel)]/70 px-3 py-2 text-xs text-[var(--parchment)]/90 backdrop-blur-sm">
          <span><b className="text-[var(--gilt)]">WASD</b> move</span>
          <span><b className="text-[var(--gilt)]">Shift</b> sprint</span>
          <span><b className="text-[var(--gilt)]">Click</b> attack</span>
          <span><b className="text-[var(--gilt)]">Space</b> jump</span>
          <span><b className="text-[var(--gilt)]">E</b> talk</span>
          <span><b className="text-[var(--gilt)]">Q</b> draught ({s.potions})</span>
          <span><b className="text-[var(--gilt)]">I B K N</b> bag · build · codex · map</span>
          <span><b className="text-[var(--gilt)]">F / RMB</b> dodge</span>
          <span><b className="text-[var(--gilt)]">1 2 3</b> abilities</span>
          <span><b className="text-[var(--gilt)]">Esc</b> pause</span>
        </div>
      </div>
    </div>
    </div>
  );
}
