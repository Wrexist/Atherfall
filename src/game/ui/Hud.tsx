import { QUESTS } from "../data/quests";
import { ARCHETYPES } from "../data/archetypes";
import { AbilityBar, CombatStates } from "./Cooldowns";
import { EmotePicker } from "./Emotes";
import { Tips } from "./Tips";
import { usePresence } from "../online/presence";
import { useAccount } from "../online/account";
import { togglePartyPanel } from "./Party";
import { useShallow } from "zustand/react/shallow";
import { statsFor, useGame, xpForLevel } from "../core/store";
import { THREAT_DOT, useFinePointer, usePortrait, useThreatened } from "./layout";
import { interactLabel } from "./TouchControls";
import { Glyph, portraitUrl } from "./kit";
import { Minimap, useMinimapReserve } from "./Minimap";
import { useSettings } from "../core/settings";
import { useEffect, useRef, useState } from "react";
import { world } from "../core/sim";
import { questTarget } from "../core/questTarget";

/** Metres to the quest goal, refreshed twice a second (null when there isn't one). */
function useQuestDistance() {
  const [m, setM] = useState<number | null>(null);
  useEffect(() => {
    const iv = setInterval(() => {
      const q = questTarget();
      const p = world.player;
      setM(q ? Math.round(Math.hypot(q.x - p.x, q.z - p.z)) : null);
    }, 500);
    return () => clearInterval(iv);
  }, []);
  return m;
}

/** "Emberhollow" across the top for a moment when entering a region. */
function LocationBanner({ region }: { region: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    // Left every region: drop the banner, and let the next entry show it again.
    if (!region) {
      last.current = null;
      setShown(null);
      return;
    }
    if (region === last.current) return;
    last.current = region;
    setShown(region);
  }, [region]);
  // Its own timer, so a region change can never cancel the fade.
  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(() => setShown(null), 2600);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div
      role="status"
      data-testid="location-banner"
      className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center animate-in fade-in duration-500"
    >
      <span className="h-0.5 w-40 bg-gradient-to-r from-transparent via-[var(--gilt)] to-transparent" />
      <span className="my-1 font-display text-3xl text-[var(--parchment)] text-outline">{shown}</span>
      <span className="h-0.5 w-40 bg-gradient-to-r from-transparent via-[var(--gilt)] to-transparent" />
    </div>
  );
}

function Bar({
  value,
  max,
  className,
  height = "h-3",
  label,
}: {
  value: number;
  max: number;
  className: string;
  height?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className={`relative ${height} w-full overflow-hidden rounded-full bg-[#0b1320]/85 ring-2 ring-[#0b1320]`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${className}`}
        style={{ width: `${pct}%` }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-full bg-white/15" />
      {label && (
        <span className="absolute inset-0 grid place-items-center text-[11px] font-black leading-none text-white text-outline">
          {label}
        </span>
      )}
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

/** Player frame: class emblem with the level, name, health and experience. */
function Vitals({ s, compact = false }: { s: HudState; compact?: boolean }) {
  const stats = statsFor(s);
  return (
    <div className="flex items-center gap-2">
      <div className="relative shrink-0">
        <div
          className={`grid place-items-center overflow-hidden rounded-full border-[3px] border-[#c9a45a] bg-[radial-gradient(circle_at_50%_35%,#3a5078,#141f33)] shadow-[0_3px_0_rgba(0,0,0,0.45)] ring-2 ring-[#0b1320] ${
            compact ? "h-[3.75rem] w-[3.75rem]" : "h-16 w-16"
          }`}
        >
          <img
            src={portraitUrl(s.archetype)}
            alt=""
            className={compact ? "mt-1 h-12 w-12" : "mt-1 h-14 w-14"}
          />
        </div>
        <span className="absolute -bottom-1 -left-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-gradient-to-b from-[#ffd970] to-[#e89b2e] px-1 font-display text-[13px] leading-none text-[#3a2206] ring-2 ring-[#0b1320]">
          {s.level}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-end justify-between gap-2">
          <span className="leading-none">
            <span
              className={`block font-display leading-none text-[var(--parchment)] text-outline ${compact ? "text-[15px]" : "text-base"}`}
            >
              {ARCHETYPES[s.archetype].name}
            </span>
            <span className="text-[10px] font-extrabold leading-none text-[var(--gilt)] text-outline">
              Lv. {s.level}
            </span>
          </span>
          <span
            data-testid="hud-stats"
            className="flex shrink-0 items-center gap-1 text-[11px] font-black text-[var(--parchment)] text-outline"
          >
            <Glyph id="attack" className="h-3.5 w-3.5" />
            {stats.attack}
            <Glyph id="defense" className="ml-0.5 h-3.5 w-3.5" />
            {stats.defense}
          </span>
        </div>
        <Bar
          value={s.hp}
          max={stats.maxHp}
          className="bg-gradient-to-b from-[#ff6b5b] to-[#d9352b]"
          height={compact ? "h-4" : "h-5"}
          label={`${Math.ceil(s.hp)} / ${stats.maxHp}`}
        />
        <Bar
          value={s.xp}
          max={xpForLevel(s.level)}
          className="bg-gradient-to-b from-[#7cc4ff] to-[#2f7fd6]"
          height="h-2"
        />
      </div>
    </div>
  );
}

/** Region name (and who's online) when the minimap is switched off. */
function RegionCard({ s, online }: { s: HudState; online: number }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="rounded-full bg-[var(--ink)]/70 px-3 py-1 font-display text-sm text-[var(--parchment)] text-outline">
        {s.region ?? "Dawnreach"}
      </div>
      {online > 1 && (
        <div
          className="rounded-full bg-[var(--ink)]/70 px-2 text-[11px] font-extrabold text-[#8ff0a0]"
          data-testid="online-count"
        >
          &#9679; {online} online
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
  const dist = useQuestDistance();
  return (
    <div
      className={`w-full rounded-2xl bg-[var(--panel)]/85 shadow-[0_3px_0_rgba(0,0,0,0.35)] ring-2 ring-[#0b1320]/50 ${
        compact ? "px-2.5 py-1.5" : "p-2.5 [@media(min-height:560px)]:p-3"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 font-display text-[var(--gilt)] text-outline ${compact ? "text-[12px]" : "text-sm"}`}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-[#ffd970] to-[#e89b2e] font-display text-[15px] leading-none text-[#3a2206] ring-2 ring-[#0b1320]">
          !
        </span>
        <span className="truncate">{quest.name}</span>
        <span
          aria-hidden
          title={dist !== null ? `${dist} m` : undefined}
          className="ml-auto h-3.5 w-3.5 shrink-0 rotate-45 rounded-[3px] bg-gradient-to-br from-[#ffe28a] to-[#e89b2e] ring-1 ring-[#0b1320]"
        />
      </div>
      {s.questComplete ? (
        <p className="mt-1 text-xs font-bold leading-snug text-[var(--parchment)]/90">
          All quests complete. Keep forging: Dawnreach will need you again.
        </p>
      ) : step ? (
        <>
          <p
            data-testid="quest-step"
            className={`font-extrabold leading-snug text-[var(--parchment)] ${compact ? "mt-0.5 text-[13px]" : "mt-1 text-sm"}`}
          >
            {step.title}
            {step.kind === "kill" && (
              <span className="ml-1.5 rounded-full bg-[var(--ink)]/70 px-1.5 text-[11px] text-[var(--gilt)]">
                {s.questKills}/{step.count}
              </span>
            )}
          </p>
          {hints && (
            <p className="mt-1 hidden text-xs font-semibold leading-snug text-[var(--parchment)]/70 min-[480px]:[@media(min-height:420px)]:block">
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
      <div className="flex items-center justify-center gap-2 font-display text-base text-[var(--parchment)] text-outline">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#b3122b] text-[11px] ring-2 ring-[#0b1320]">
          !
        </span>
        {s.bossBar.name}
        {s.bossBar.phase === 2 && <span className="text-[#ff7a6a]">&middot; Enraged</span>}
      </div>
      <div className="mt-1">
        <Bar
          value={s.bossBar.hp}
          max={s.bossBar.max}
          className="bg-gradient-to-b from-[#ff5b5b] to-[#b3122b]"
          height="h-4"
          label={`${Math.ceil(s.bossBar.hp)} / ${s.bossBar.max}`}
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
          className={`rounded-full px-3.5 py-1.5 text-center text-xs font-extrabold shadow-[0_3px_0_rgba(0,0,0,0.35)] ring-2 ${
            t.tone === "quest"
              ? "bg-gradient-to-b from-[#ffd970] to-[#f2a93b] text-[#3a2206] ring-[#b8741a]"
              : t.tone === "good"
                ? "bg-[var(--panel)]/92 text-[#9ff09a] ring-[#2f7a3a]"
                : t.tone === "bad"
                  ? "bg-[var(--panel)]/92 text-[#ffb3a6] ring-[#8a2a1c]"
                  : "bg-[var(--panel)]/92 text-[var(--parchment)] ring-[#0b1320]/60"
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
      className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-[var(--panel)]/92 px-4 py-1.5 text-xs font-extrabold text-[var(--parchment)] shadow-[0_3px_0_rgba(0,0,0,0.35)] ring-2 ring-[var(--gilt)]/60 ${className}`}
    >
      {s.interactPrompt}
      <span className="ml-2 hidden rounded bg-[var(--gilt)] px-1.5 py-0.5 font-mono text-[10px] text-[#3a2206] [@media(pointer:fine)]:inline">
        E
      </span>
    </div>
  );
}

/** Bag / Map / Menu / Emote on touch screens held upright: top right, away from both thumbs. */
function PortraitMenuButtons() {
  const signedIn = useAccount((a) => a.status === "signed-in");
  const threat = useThreatened();
  const minimap = useSettings((p) => p.minimap);
  const btn =
    "pointer-events-auto relative flex h-[3.4rem] w-[3.4rem] touch-none flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_30%,#2e4266,#141f33)] text-[var(--parchment)] shadow-[0_3px_0_rgba(0,0,0,0.45)] ring-2 ring-[#8a7a55]/80 active:translate-y-px";
  const label = "mt-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-outline";
  // Enemies near: the journal won't pause them, so say so before it opens.
  const warn = threat ? THREAT_DOT : "";
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className={`${btn} ${warn}`}
        aria-label={threat ? "Bag (enemies near)" : "Bag"}
        onPointerDown={() => useGame.getState().toggleInventory()}
      >
        <Glyph id="bag" className="h-6 w-6" />
        <span className={label}>Bag</span>
      </button>
      {/* With the minimap on, tapping it opens the map. */}
      {!minimap && (
        <button
          className={`${btn} ${warn}`}
          aria-label={threat ? "Map (enemies near)" : "Map"}
          onPointerDown={() => useGame.getState().toggleInventory(true, "map")}
        >
          <Glyph id="map" className="h-6 w-6" />
          <span className={label}>Map</span>
        </button>
      )}
      {signedIn && (
        <button className={btn} aria-label="Party" onPointerDown={() => togglePartyPanel()}>
          <Glyph id="party" className="h-6 w-6" />
          <span className={label}>Party</span>
        </button>
      )}
      <button
        className={btn}
        aria-label="Menu"
        onPointerDown={() => {
          useGame.getState().toggleInventory(false);
          useGame.setState({ screen: "paused" });
        }}
      >
        <Glyph id="gear" className="h-6 w-6" />
        <span className={label}>Menu</span>
      </button>
      <EmotePicker buttonClass={btn} openTo="left">
        <Glyph id="emote" className="h-6 w-6" />
        <span className={label}>Emote</span>
      </EmotePicker>
    </div>
  );
}

/**
 * Portrait: everything that isn't a thumb control sits in the top third, so the
 * hero (centre) and both thumbs (bottom) stay clear.
 */
function PortraitHud({ s, online, fine }: { s: HudState; online: number; fine: boolean }) {
  const reserve = useMinimapReserve();
  const minimap = useSettings((p) => p.minimap);
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
          <div className="w-[min(15rem,58%)] space-y-2">
            <Vitals s={s} compact />
            <QuestTracker s={s} hints={false} compact />
            <CombatStates />
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Room for the minimap in its corner (it draws itself, fixed). */}
            {reserve > 0 && <div style={{ height: reserve }} aria-hidden />}
            {!minimap && <RegionCard s={s} online={online} />}
            {!fine && <PortraitMenuButtons />}
          </div>
        </div>
        {s.bossBar && (
          <div className="mt-2">
            <BossBar s={s} />
          </div>
        )}
        <LocationBanner region={s.region} />
        {/* The game's mark, bottom left under the joystick's rest spot. */}
        {!fine && (
          <div className="pointer-events-none absolute bottom-0 left-1 flex flex-col items-center leading-none opacity-95">
            {/* A spire-and-star emblem over the name. */}
            <svg viewBox="0 0 40 26" className="-mb-1 h-6 w-9" aria-hidden>
              <path
                d="M20 1 22 14 20 25 18 14Z M20 9 30 14 20 12 10 14Z"
                fill="#e2c275"
                stroke="#3a2a12"
                strokeWidth="1"
              />
            </svg>
            <span
              className="text-[21px] tracking-[0.04em] text-[#f1e3c0]"
              style={{
                fontFamily: "Cinzel, Georgia, serif",
                fontWeight: 700,
                textShadow: "0 2px 0 #0b1320, 0 0 8px rgba(0,0,0,0.6)",
              }}
            >
              AETHERFALL
            </span>
            <span className="mt-1 text-[7px] font-extrabold tracking-[0.28em] text-[#e2d3a8] text-outline">
              EXPLORE &middot; FIGHT &middot; FARM &middot; GROW
            </span>
          </div>
        )}
        {/* Between the HUD and the hero (who sits just below the middle). */}
        <div className="absolute left-0 right-16 top-[33%] flex flex-col items-center gap-1.5 px-1">
          <Toasts s={s} />
        </div>
        {/* On touch, a Talk/Open/Climb button already says what E would do. */}
        {(fine || !interactLabel(s.interactPrompt)) && (
          <InteractPrompt s={s} className="bottom-[15.5rem]" />
        )}
      </div>
      <Minimap />
    </div>
  );
}

export function Hud() {
  const fine = useFinePointer();
  const portrait = usePortrait();
  const online = usePresence((p) => (p.connected ? p.online : 0));
  const s = useHudState();
  const reserve = useMinimapReserve();
  const minimap = useSettings((p) => p.minimap);
  const signedIn = useAccount((a) => a.status === "signed-in");
  if (portrait) return <PortraitHud s={s} online={online} fine={fine} />;

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
        <div className="absolute left-0 top-0 w-60 [@media(min-height:560px)]:w-72">
          <Vitals s={s} />
        </div>

        {/* Minimap (drawn fixed), region and quest tracker stacked so they never overlap */}
        <div className="absolute right-0 top-0 flex w-52 flex-col items-end gap-2 [@media(min-height:560px)]:w-64">
          {reserve > 0 && <div style={{ height: reserve }} aria-hidden />}
          {!minimap && <RegionCard s={s} online={online} />}
          <QuestTracker s={s} hints />
        </div>

        {/* Boss bar */}
        {s.bossBar && (
          <div className="absolute left-1/2 top-4 w-[max(12rem,min(30rem,calc(100%-37rem)))] -translate-x-1/2">
            <BossBar s={s} />
          </div>
        )}

        <InteractPrompt s={s} className="bottom-40" />
        <LocationBanner region={s.region} />

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

        {/* Key hints (mouse/keyboard only; touch uses on-screen buttons). New players get the
          full list; after level 2 just the essentials, to keep the screen clean. */}
        <div
          className={`absolute bottom-0 left-0 hidden ${s.dialogue ? "" : "[@media(pointer:fine)]:block"}`}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-2xl bg-[var(--panel)]/80 px-3 py-2 text-xs font-bold text-[var(--parchment)]/90 ring-2 ring-[#0b1320]/50">
            {[
              ...(s.level <= 2
                ? [
                    ["WASD", "move"],
                    ["Shift", "sprint"],
                    ["Click", "attack"],
                    ["Space", "jump"],
                    ["E", "talk"],
                    [`Q`, `draught (${s.potions})`],
                    ["F / RMB", "dodge"],
                    ["1 2 3", "abilities"],
                    ["I B K N", "bag, hero, codex, map"],
                    ["V C X", "wave, cheer, sit"],
                    ["Esc", "menu"],
                  ]
                : [
                    [`Q`, `draught (${s.potions})`],
                    ["I", "bag"],
                    ["N", "map"],
                    ["Esc", "menu"],
                  ]),
              ...(signedIn ? [["P", "party"]] : []),
            ].map(([k, v]) => (
              <span key={k}>
                <b className="text-[var(--gilt)]">{k}</b> {v}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Minimap />
    </div>
  );
}
