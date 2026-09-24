import { ITEMS } from "../data/items";
import { STARTER_QUEST } from "../data/quests";
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

export function Hud() {
  const s = useGame();
  const stats = statsFor(s);
  const step = STARTER_QUEST.steps[s.questStep];
  const weapon = s.equipped.weapon ? ITEMS[s.equipped.weapon] : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* Vitals */}
      <div className="absolute left-4 top-4 w-60 space-y-1.5 sm:w-72">
        <div className="flex items-baseline justify-between font-display text-sm text-[var(--parchment)]">
          <span className="tracking-[0.18em]">WARDEN</span>
          <span className="text-[var(--gilt)]">Lv {s.level}</span>
        </div>
        <Bar value={s.hp} max={stats.maxHp} className="bg-gradient-to-r from-[#c2412f] to-[#e8735a]" height="h-4" />
        <div className="flex justify-between text-[11px] font-medium text-[var(--parchment)]/80">
          <span>
            {Math.ceil(s.hp)} / {stats.maxHp}
          </span>
          <span>
            ATK {stats.attack} · DEF {stats.defense}
          </span>
        </div>
        <Bar value={s.xp} max={xpForLevel(s.level)} className="bg-gradient-to-r from-[#7a6ad8] to-[#b2a1ff]" height="h-1.5" />
      </div>

      {/* Region + gold */}
      <div className="absolute right-4 top-4 text-right">
        <div className="font-display text-base tracking-[0.2em] text-[var(--parchment)] drop-shadow">
          {s.region ?? "Dawnreach"}
        </div>
        <div className="text-xs text-[var(--gilt)]">{s.gold} embers · {s.kills} slain</div>
      </div>

      {/* Quest tracker */}
      <div className="absolute right-4 top-20 w-56 rounded-lg border border-[var(--gilt)]/25 bg-[var(--panel)]/85 p-3 backdrop-blur-sm sm:w-64">
        <div className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--gilt)]">
          {STARTER_QUEST.name}
        </div>
        {s.questComplete ? (
          <p className="mt-1.5 text-xs leading-snug text-[var(--parchment)]/85">
            Complete. Tidewrack Shore is marked to the south.
          </p>
        ) : step ? (
          <>
            <p className="mt-1.5 text-sm font-medium leading-snug text-[var(--parchment)]">
              {step.title}
              {step.kind === "kill" ? ` (${s.questKills}/${step.count})` : ""}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-[var(--parchment)]/60">{step.hint}</p>
          </>
        ) : null}
      </div>

      {/* Boss bar */}
      {s.bossBar && (
        <div className="absolute left-1/2 top-4 w-[min(30rem,70vw)] -translate-x-1/2">
          <div className="text-center font-display text-sm tracking-[0.2em] text-[var(--parchment)] drop-shadow">
            {s.bossBar.name.toUpperCase()}
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
      <div className="absolute bottom-28 left-1/2 flex w-[min(24rem,80vw)] -translate-x-1/2 flex-col items-center gap-1.5">
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

      {/* Loadout + key hints (desktop) */}
      <div className="absolute bottom-4 left-4 hidden items-end gap-4 sm:flex">
        <div className="rounded-lg border border-[var(--gilt)]/25 bg-[var(--panel)]/80 px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--gilt)]">Weapon</div>
          <div className="text-sm text-[var(--parchment)]">{weapon?.name ?? "Bare hands"}</div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-[var(--parchment)]/70">
          <span><b className="text-[var(--gilt)]">WASD</b> move</span>
          <span><b className="text-[var(--gilt)]">Shift</b> sprint</span>
          <span><b className="text-[var(--gilt)]">Click</b> attack</span>
          <span><b className="text-[var(--gilt)]">Space</b> jump</span>
          <span><b className="text-[var(--gilt)]">E</b> talk</span>
          <span><b className="text-[var(--gilt)]">Q</b> draught ({s.potions})</span>
          <span><b className="text-[var(--gilt)]">I</b> satchel</span>
          <span><b className="text-[var(--gilt)]">Esc</b> pause</span>
        </div>
      </div>
    </div>
  );
}
