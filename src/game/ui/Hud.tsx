import { ITEMS } from "../data/items";
import { QUESTS } from "../data/quests";
import { ARCHETYPES } from "../data/archetypes";
import { AbilityBar, CombatStates } from "./Cooldowns";
import { Tips } from "./Tips";
import { usePresence } from "../online/presence";
import { useShallow } from "zustand/react/shallow";
import { statsFor, useGame, xpForLevel } from "../core/store";
import { THREAT_DOT, useFinePointer, usePortrait, useThreatened } from "./layout";
import { interactLabel } from "./TouchControls";

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
    <div
      className={`${height} w-full overflow-hidden rounded-full bg-[var(--ink)]/60 ring-1 ring-[var(--gilt)]/30`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${className}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type HudState = ReturnType<typeof useHudState>;

function useHudState() {
  // Select only what the HUD shows, so unrelated store writes don't re-render it.
  return useGame(
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
}

function Vitals({ s, compact = false }: { s: HudState; compact?: boolean }) {
  const stats = statsFor(s);
  return (
    <div
      className={`rounded-lg bg-[var(--panel)]/55 backdrop-blur-sm ${
        compact ? "space-y-1 px-2 py-1.5" : "space-y-1.5 p-2.5 [@media(min-height:560px)]:p-3"
      }`}
    >
      <div
        className={`flex items-baseline justify-between font-display text-[var(--parchment)] ${compact ? "text-xs" : "text-sm"}`}
      >
        <span className="tracking-[0.18em]">{ARCHETYPES[s.archetype].name.toUpperCase()}</span>
        <span className="text-[var(--gilt)]">Lv {s.level}</span>
      </div>
      <Bar
        value={s.hp}
        max={stats.maxHp}
        className="bg-gradient-to-r from-[#c2412f] to-[#e8735a]"
        height={compact ? "h-3.5" : "h-4"}
      />
      <div
        className={`flex justify-between gap-2 font-medium text-[var(--parchment)] ${compact ? "text-[11px]" : "text-xs"}`}
      >
        <span>
          {Math.ceil(s.hp)} / {stats.maxHp}
        </span>
        <span data-testid="hud-stats">
          ATK {stats.attack} · DEF {stats.defense}
        </span>
      </div>
      <Bar
        value={s.xp}
        max={xpForLevel(s.level)}
        className="bg-gradient-to-r from-[#7a6ad8] to-[#b2a1ff]"
        height={compact ? "h-1" : "h-1.5"}
      />
    </div>
  );
}

function RegionCard({
  s,
  online,
  compact = false,
}: {
  s: HudState;
  online: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-[var(--panel)]/70 text-right backdrop-blur-sm ${compact ? "px-2 py-1" : "px-3 py-1.5"}`}
    >
      <div
        className={`font-display text-[var(--parchment)] drop-shadow ${
          compact
            ? "whitespace-nowrap text-xs tracking-[0.12em]"
            : "text-sm tracking-[0.2em] [@media(min-height:560px)]:text-base"
        }`}
      >
        {s.region ?? "Dawnreach"}
      </div>
      <div className={`text-[var(--gilt)] drop-shadow ${compact ? "text-[11px]" : "text-xs"}`}>
        {s.gold} embers · {s.shards} shards
      </div>
      {online > 1 && (
        <div className="text-[11px] text-[#b7e8b1] drop-shadow" data-testid="online-count">
          ● {online} online
        </div>
      )}
    </div>
  );
}

function QuestTracker({
  s,
  hints,
  compact = false,
}: {
  s: HudState;
  hints: boolean;
  compact?: boolean;
}) {
  const quest = QUESTS[s.questIdx]!;
  const step = quest.steps[s.questStep];
  return (
    <div
      className={`w-full rounded-lg border border-[var(--gilt)]/25 bg-[var(--panel)]/85 backdrop-blur-sm ${
        compact ? "px-2 py-1.5" : "p-2.5 [@media(min-height:560px)]:p-3"
      }`}
    >
      <div
        className={`font-display uppercase text-[var(--gilt)] ${compact ? "truncate text-[10px] tracking-[0.14em]" : "text-[11px] tracking-[0.2em]"}`}
      >
        {quest.name}
      </div>
      {s.questComplete ? (
        <p className="mt-1.5 text-xs leading-snug text-[var(--parchment)]/90">
          All quests complete. Keep forging — Dawnreach will need you again.
        </p>
      ) : step ? (
        <>
          <p
            data-testid="quest-step"
            className={`font-medium leading-snug text-[var(--parchment)] ${compact ? "mt-0.5 text-[13px]" : "mt-1.5 text-sm"}`}
          >
            {step.title}
            {step.kind === "kill" ? ` (${s.questKills}/${step.count})` : ""}
          </p>
          {hints && (
            <p className="mt-1 hidden text-xs leading-snug text-[var(--parchment)]/70 min-[480px]:[@media(min-height:420px)]:block">
              {step.hint}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

function BossBar({ s }: { s: HudState }) {
  if (!s.bossBar) return null;
  return (
    <div>
      <div className="text-center font-display text-sm tracking-[0.2em] text-[var(--parchment)] drop-shadow">
        {s.bossBar.name.toUpperCase()}
        {s.bossBar.phase === 2 && <span className="ml-2 text-[#f0a595]">· ENRAGED</span>}
      </div>
      <div className="mt-1">
        <Bar
          value={s.bossBar.hp}
          max={s.bossBar.max}
          className="bg-gradient-to-r from-[#8c2f22] to-[#e2894b]"
          height="h-3"
        />
      </div>
    </div>
  );
}

function Toasts({ s }: { s: HudState }) {
  return (
    <>
      {!s.dialogue && <Tips />}
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
    </>
  );
}

function InteractPrompt({ s, className }: { s: HudState; className: string }) {
  if (!s.interactPrompt || s.dialogue) return null;
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 rounded-full border border-[var(--gilt)]/30 bg-[var(--panel)]/85 px-4 py-1.5 text-xs text-[var(--parchment)] backdrop-blur-sm ${className}`}
    >
      {s.interactPrompt}
      <span className="ml-2 hidden rounded bg-[var(--gilt)]/20 px-1.5 py-0.5 font-mono text-[10px] text-[var(--gilt)] [@media(pointer:fine)]:inline">
        E
      </span>
    </div>
  );
}

/** Bag / Map / Menu on touch screens held upright: top right, away from both thumbs. */
function PortraitMenuButtons() {
  const threat = useThreatened();
  const btn =
    "pointer-events-auto relative flex h-11 w-11 touch-none items-center justify-center rounded-xl border border-[var(--gilt)]/40 bg-[var(--panel)]/75 text-[10px] font-semibold uppercase tracking-wider text-[var(--parchment)] active:bg-[var(--gilt)]/35";
  // Enemies near: the journal won't pause them, so say so before it opens.
  const warn = threat ? THREAT_DOT : "";
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className={`${btn} ${warn}`}
        aria-label={threat ? "Bag (enemies near)" : "Bag"}
        onPointerDown={() => useGame.getState().toggleInventory()}
      >
        Bag
      </button>
      <button
        className={`${btn} ${warn}`}
        aria-label={threat ? "Map (enemies near)" : "Map"}
        onPointerDown={() => useGame.getState().toggleInventory(true, "map")}
      >
        Map
      </button>
      <button
        className={btn}
        onPointerDown={() => {
          useGame.getState().toggleInventory(false);
          useGame.setState({ screen: "paused" });
        }}
      >
        Menu
      </button>
    </div>
  );
}

/**
 * Portrait: everything that isn't a thumb control sits in the top third, so the
 * hero (centre) and both thumbs (bottom) stay clear.
 */
function PortraitHud({ s, online, fine }: { s: HudState; online: number; fine: boolean }) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 select-none"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      <div className="relative h-full w-full">
        <div className="flex items-start justify-between gap-2">
          <div className="w-[min(15rem,58%)] space-y-1.5">
            <Vitals s={s} compact />
            <QuestTracker s={s} hints={false} compact />
            <CombatStates />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <RegionCard s={s} online={online} compact />
            {!fine && <PortraitMenuButtons />}
          </div>
        </div>
        {s.bossBar && (
          <div className="mt-2">
            <BossBar s={s} />
          </div>
        )}
        {/* Between the HUD and the hero (who sits just below the middle). */}
        <div className="absolute inset-x-0 top-[33%] flex flex-col items-center gap-1.5 px-1">
          <Toasts s={s} />
        </div>
        {/* On touch, a Talk/Open/Climb button already says what E would do. */}
        {(fine || !interactLabel(s.interactPrompt)) && (
          <InteractPrompt s={s} className="bottom-[15.5rem]" />
        )}
      </div>
    </div>
  );
}

export function Hud() {
  const fine = useFinePointer();
  const portrait = usePortrait();
  const online = usePresence((p) => (p.connected ? p.online : 0));
  const s = useHudState();
  if (portrait) return <PortraitHud s={s} online={online} fine={fine} />;
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
        <div className="absolute left-0 top-0 w-52 [@media(min-height:560px)]:w-72">
          <Vitals s={s} />
        </div>

        {/* Region, gold and quest tracker stacked in one column so they never overlap */}
        <div className="absolute right-0 top-0 flex w-52 flex-col items-end gap-2 [@media(min-height:560px)]:w-64">
          <RegionCard s={s} online={online} />
          <QuestTracker s={s} hints />
        </div>

        {/* Boss bar */}
        {s.bossBar && (
          <div className="absolute left-1/2 top-4 w-[max(12rem,min(30rem,calc(100%-37rem)))] -translate-x-1/2">
            <BossBar s={s} />
          </div>
        )}

        <InteractPrompt s={s} className="bottom-40" />

        {/* Tips + toasts. Desktop: above the ability bar. Touch: top centre, between the
          vitals and quest panels, so they never sit under a thumb or the attack arc. */}
        <div
          className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 ${
            fine
              ? "bottom-32 w-[min(24rem,80vw)]"
              : `w-[min(22rem,calc(100%-29rem))] ${s.bossBar ? "top-12" : "top-0"}`
          }`}
        >
          <Toasts s={s} />
        </div>

        {/* Ability bar (desktop) */}
        {fine && !s.dialogue && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <AbilityBar />
          </div>
        )}

        {/* Loadout + key hints (mouse/keyboard devices only; touch uses on-screen buttons) */}
        <div
          className={`absolute bottom-0 left-0 hidden items-stretch gap-3 ${s.dialogue ? "" : "[@media(pointer:fine)]:flex"}`}
        >
          <div className="rounded-lg border border-[var(--gilt)]/25 bg-[var(--panel)]/80 px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--gilt)]">Weapon</div>
            <div className="text-sm text-[var(--parchment)]">{weapon?.name ?? "Bare hands"}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-[var(--panel)]/70 px-3 py-2 text-xs text-[var(--parchment)]/90 backdrop-blur-sm">
            <span>
              <b className="text-[var(--gilt)]">WASD</b> move
            </span>
            <span>
              <b className="text-[var(--gilt)]">Shift</b> sprint
            </span>
            <span>
              <b className="text-[var(--gilt)]">Click</b> attack
            </span>
            <span>
              <b className="text-[var(--gilt)]">Space</b> jump
            </span>
            <span>
              <b className="text-[var(--gilt)]">E</b> talk
            </span>
            <span>
              <b className="text-[var(--gilt)]">Q</b> draught ({s.potions})
            </span>
            <span>
              <b className="text-[var(--gilt)]">I B K N</b> bag · build · codex · map
            </span>
            <span>
              <b className="text-[var(--gilt)]">F / RMB</b> dodge
            </span>
            <span>
              <b className="text-[var(--gilt)]">1 2 3</b> abilities
            </span>
            <span>
              <b className="text-[var(--gilt)]">Esc</b> pause
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
