import { useCallback, useEffect, useRef, useState } from "react";
import { QUESTS } from "../data/quests";
import { setMuted as setAudioMuted, sfx, unlockAudio } from "../core/audio";
import { initWorld, respawnPlayer, saveNow } from "../core/sim";
import { haptic, useSettings } from "../core/settings";
import {
  AccountDialog,
  AccountLine,
  CloudSaveChoice,
  CloudSaveSync,
  NewPasswordDialog,
  useLocalSaves,
} from "./Account";
import { useCloudSync } from "../online/cloudSave";
import { PHONE_SIDEWAYS } from "./layout";
import { LOADING_TIPS, loadStalled } from "../core/loading";
import { clearSave, useGame, type Quality } from "../core/store";
import type { SaveFile } from "../core/persistence";
import { BTN } from "./kit";
import { editMinimap } from "./Minimap";

const QUALITIES: Array<{ id: Quality; label: string; note: string }> = [
  { id: "low", label: "Low", note: "No shadows, short draw distance — best on phones" },
  { id: "medium", label: "Medium", note: "Shadows on, balanced" },
  { id: "high", label: "High", note: "Sharp shadows, long draw distance" },
];

function Panel({ children }: { children: React.ReactNode }) {
  return (
    // Capped to the visible height and scrollable: on a landscape phone (~390px tall)
    // the pause menu and controls list would otherwise be clipped off-screen.
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border-2 border-[var(--edge)] bg-[var(--panel)] p-5 text-[var(--parchment)] shadow-[0_16px_48px_rgba(0,0,0,0.6)] sm:p-6">
      {children}
    </div>
  );
}

/**
 * On phones, take over the whole screen and hold portrait (Android/Chrome).
 * iPhone Safari has no element fullscreen; there the home-screen install
 * (manifest, display: fullscreen) gives the same result. Must run in a tap.
 */
function enterMobileFullscreen() {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  if (window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) return;
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root
    .requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      // Phones only: tablets play in either orientation (the manifest stays
      // "any" for the same reason, since it applies to every installed device).
      if (Math.min(screen.width, screen.height) >= 600) return undefined;
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      return orientation?.lock?.("portrait");
    })
    .catch(() => undefined);
}

const freshSeed = () => (Math.random() * 2 ** 32) >>> 0;

export function LoadingScreen({ progress }: { progress: number }) {
  const [tip, setTip] = useState(0);
  const [stalled, setStalled] = useState(false);
  const lastChange = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setTip((t) => (t + 1) % LOADING_TIPS.length), 4500);
    return () => clearInterval(iv);
  }, []);
  // Progress moved: the clock for "stuck" starts again.
  useEffect(() => {
    lastChange.current = Date.now();
    setStalled(false);
  }, [progress]);
  useEffect(() => {
    const iv = setInterval(
      () => setStalled(loadStalled(progress, lastChange.current, Date.now())),
      1000,
    );
    return () => clearInterval(iv);
  }, [progress]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[var(--ink)] px-6 text-center">
      <h1 className="font-display text-3xl tracking-wide text-[var(--gilt)] text-outline sm:text-4xl">
        AETHERFALL
      </h1>
      <p className="mt-2 text-xs uppercase tracking-[0.3em] text-[var(--parchment)]/50">
        Dawnreach
      </p>
      <div className="mt-8 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-[var(--parchment)]/15">
        <div
          className="h-full rounded-full bg-[var(--gilt)] transition-[width] duration-200"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-3 text-[11px] text-[var(--parchment)]/45">
        Raising the pines… {Math.round(progress * 100)}%
      </p>
      {stalled ? (
        <div className="mt-6 flex max-w-xs flex-col items-center gap-3">
          <p className="text-sm text-[var(--parchment)]/80">
            Still loading. Your connection may be slow or have dropped.
          </p>
          <button
            className="min-h-11 rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 text-sm font-semibold text-[var(--parchment)]"
            // Files that already arrived are cached, so a retry picks up where it stopped.
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      ) : (
        <p
          className="mt-6 min-h-10 max-w-xs text-sm leading-snug text-[var(--parchment)]/70"
          aria-live="polite"
        >
          <span className="text-[var(--gilt)]">✦ </span>
          {LOADING_TIPS[tip]}
        </p>
      )}
    </div>
  );
}

export function WebglError() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)] p-6">
      <Panel>
        <h2 className="font-display text-xl tracking-widest text-[var(--gilt)]">3D UNAVAILABLE</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--parchment)]/80">
          This browser could not start WebGL, so Aetherfall cannot draw its world. Try a recent
          Chrome, Edge, Firefox or Safari, enable hardware acceleration in your browser settings, or
          switch to another device.
        </p>
      </Panel>
    </div>
  );
}

export function TitleScreen({
  save: bootSave,
  onSaveChanged,
}: {
  save: SaveFile | null;
  onSaveChanged: (save: SaveFile | null) => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const screen = useGame((s) => s.screen);
  // The save read at page load goes stale once "Erase save" is used; only offer
  // Continue while the store still says a save exists.
  const hasSave = useGame((s) => s.hasSave);
  const save = hasSave ? bootSave : null;
  const quality = useGame((s) => s.quality);
  const setQuality = useGame((s) => s.setQuality);
  const [showControls, setShowControls] = useState(false);
  // Wait for the cloud save check (and the player's pick, if the cloud copy is
  // newer) so a cloud save can't arrive mid-game or be skipped for the session.
  const cloudBusy = useCloudSync((c) => c.phase === "checking" || c.phase === "choice");
  const cloudChoice = useCloudSync((c) => c.choice !== null);
  const local = useLocalSaves(onSaveChanged);
  if (screen !== "title") return null;

  const start = (useSave: boolean) => {
    unlockAudio();
    enterMobileFullscreen();
    sfx.ui();
    if (!useSave) {
      clearSave();
      useGame.getState().resetProgress();
    }
    initWorld(useSave ? save : null, freshSeed());
    useGame.setState({ screen: "playing" });
    saveNow();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--ink)]/80 p-4">
      <Panel>
        <h1 className="font-display text-5xl leading-none text-[var(--gilt)] text-outline">Aetherfall</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-[var(--parchment)]/50">
          Chapter one · Dawnreach
        </p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--parchment)]/85">
          Something fell out of the sky over Tidewrack Bay, and the woods around Emberhollow have
          not been quiet since. Warden Sela is waiting by the fountain.
        </p>

        {/* A pending cloud-save question replaces the start buttons, so it's never
            below the fold on a landscape phone while they're disabled. */}
        {cloudChoice ? (
          <CloudSaveChoice local={local} />
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            {save && (
              <button
                className={BTN.primary}
                disabled={cloudBusy}
                onClick={() => start(true)}
              >
                Continue — level {save.level}
              </button>
            )}
            <button
              className={save ? BTN.secondary : BTN.primary}
              disabled={cloudBusy}
              onClick={() => start(false)}
            >
              {save ? "New journey" : "Begin"}
            </button>
            <button
              className={BTN.secondary}
              onClick={() => setShowControls((v) => !v)}
            >
              Controls
            </button>
          </div>
        )}
        <CloudSaveSync local={local} />

        {showControls && <ControlsList />}

        <AccountLine onOpen={() => setAccountOpen(true)} />

        <div className="mt-5">
          <div className="font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">Graphics</div>
          <QualityPicker quality={quality} setQuality={setQuality} />
        </div>
      </Panel>
      {accountOpen && <AccountDialog onClose={closeAccount} />}
      <NewPasswordDialog />
    </div>
  );
}

function QualityPicker({
  quality,
  setQuality,
}: {
  quality: Quality;
  setQuality: (q: Quality) => void;
}) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      {QUALITIES.map((q) => (
        <button
          key={q.id}
          onClick={() => {
            sfx.ui();
            setQuality(q.id);
          }}
          className={`min-h-11 rounded-2xl border-2 p-2.5 text-left ${
            quality === q.id
              ? "border-[var(--gilt)] bg-[var(--gilt)]/15"
              : "border-transparent bg-[var(--panel-2)]"
          }`}
        >
          <div className="text-sm font-extrabold text-[var(--parchment)]">{q.label}</div>
          <div className="text-[11px] leading-snug text-[var(--parchment)]/55">{q.note}</div>
        </button>
      ))}
    </div>
  );
}

function ControlsList() {
  // Show the scheme for the device in hand; touch players never see key names.
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const rows: Array<[string, string]> = touch
    ? [
        ["Move", "Left thumb anywhere on the left half"],
        ["Sprint", "Push the stick all the way"],
        ["Look", "Drag on the right half"],
        ["Attack", "Tap Attack — hold to keep swinging"],
        ["Dodge", "Dodge (brief invulnerability)"],
        ["Lock on", "Target — tap again for the next, then off"],
        ["Abilities", "Buttons around Attack, from level 2"],
        ["Talk / climb / open", "Button that appears in the bottom row"],
        ["Heal", "Heal button"],
        ["Bag · map · menu", "Bottom row"],
      ]
    : [
        ["Move", "W A S D"],
        ["Sprint", "Shift"],
        ["Look", "Move mouse (click to lock)"],
        ["Attack", "Left click — hold to keep swinging"],
        ["Dodge", "F / right click"],
        ["Lock on", "Tab or R — again for the next, then off"],
        ["Abilities", "1 2 3"],
        ["Jump", "Space"],
        ["Talk & continue", "E"],
        ["Drink draught", "Q"],
        ["Satchel · build · codex · map", "I · B · K · N"],
        ["Pause", "Escape"],
        ["Mute", "M"],
      ];
  return (
    <div className="mt-4 grid gap-x-6 gap-y-1.5 rounded-lg border border-[var(--gilt)]/20 p-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-xs">
          <span className="text-[var(--parchment)]/70">{k}</span>
          <span className="text-right text-[var(--parchment)]">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function PauseMenu() {
  const screen = useGame((g) => g.screen);
  if (screen !== "paused") return null;
  return <PauseMenuBody />;
}

/** Only mounted while paused, so the always-mounted wrapper stays cheap. */
function PauseMenuBody() {
  const s = useGame();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--ink)]/35 p-4">
      <Panel>
        <h2 className="font-display text-xl tracking-wide text-[var(--gilt)] text-outline">PAUSED</h2>
        <p className="mt-1 text-xs text-[var(--parchment)]/60">
          {s.questComplete
            ? "All quests complete"
            : `${QUESTS[s.questIdx]!.name} · step ${s.questStep + 1} of ${QUESTS[s.questIdx]!.steps.length}`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={BTN.primary}
            onClick={() => {
              sfx.ui();
              useGame.setState({ screen: "playing" });
            }}
          >
            Resume
          </button>
          <button
            className={BTN.secondary}
            onClick={() => {
              saveNow();
              useGame.getState().toast("Progress saved", "good");
            }}
          >
            Save now
          </button>
          <button
            className={BTN.danger}
            onClick={() => {
              clearSave();
              useGame.getState().resetProgress();
              initWorld(null, freshSeed());
              useGame.setState({ screen: "title" });
            }}
          >
            Erase save
          </button>
        </div>

        <div className="mt-5">
          <div className="font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">Graphics</div>
          <QualityPicker quality={s.quality} setQuality={s.setQuality} />
        </div>

        <div className="mt-2 divide-y divide-[var(--gilt)]/10">
          <Toggle
            label="Sound"
            on={!s.muted}
            onChange={(on) => {
              s.setMuted(!on);
              setAudioMuted(!on);
            }}
          />
        </div>

        <MinimapSettings />

        <ComfortSettings />

        <AccountLine />

        <ControlsList />
      </Panel>
    </div>
  );
}

/** Big, thumb-sized on/off row (the whole row is the target). */
function Toggle({
  label,
  note,
  on,
  onChange,
}: {
  label: string;
  note?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      className="flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left"
      onClick={() => {
        sfx.ui();
        onChange(!on);
      }}
    >
      <span>
        <span className="block text-sm font-bold text-[var(--parchment)]">{label}</span>
        {note && <span className="block text-xs text-[var(--parchment)]/70">{note}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
          on
            ? "border-[#b8741a] bg-[var(--gilt)]"
            : "border-[var(--edge)] bg-[var(--ink)]/70"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-[var(--parchment)] shadow transition-transform ${
            on ? "translate-x-[1.35rem]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  show,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  show: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block py-1.5">
      <span className="flex items-baseline justify-between text-sm font-bold text-[var(--parchment)]">
        {label}
        <span className="text-xs font-extrabold text-[var(--gilt)]">{show(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full accent-[var(--gilt)]"
      />
    </label>
  );
}

/** Minimap options: show, size, zoom, shape, opacity, and where it sits. */
function MinimapSettings() {
  const prefs = useSettings();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="mt-5">
      <div className="font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">
        Minimap
      </div>
      <div className="divide-y divide-[var(--gilt)]/10">
        <Toggle
          label="Show minimap"
          note="Tap it for the full map. Hold it to move it."
          on={prefs.minimap}
          onChange={(v) => prefs.update({ minimap: v })}
        />
        {prefs.minimap && (
          <>
            <Slider
              label="Size"
              value={prefs.minimapScale}
              min={0.7}
              max={1.6}
              show={pct}
              onChange={(v) => prefs.update({ minimapScale: v })}
            />
            <Slider
              label="Zoom"
              value={prefs.minimapZoom}
              min={0.5}
              max={2}
              show={(v) => `${v.toFixed(1)}×`}
              onChange={(v) => prefs.update({ minimapZoom: v })}
            />
            <Slider
              label="Opacity"
              value={prefs.minimapOpacity}
              min={0.35}
              max={1}
              show={pct}
              onChange={(v) => prefs.update({ minimapOpacity: v })}
            />
            <Toggle
              label="Round minimap"
              note="Off: square"
              on={prefs.minimapRound}
              onChange={(v) => prefs.update({ minimapRound: v })}
            />
            <div className="flex flex-wrap gap-2 py-2">
              <button
                data-testid="move-minimap"
                className={BTN.secondary}
                onClick={() => {
                  sfx.ui();
                  editMinimap(true);
                  useGame.setState({ screen: "playing" });
                }}
              >
                Move minimap
              </button>
              <button
                className={BTN.ghost}
                onClick={() =>
                  prefs.update({
                    minimapAt: { portrait: null, landscape: null },
                    minimapScale: 1,
                    minimapZoom: 1,
                    minimapOpacity: 0.95,
                    minimapRound: true,
                  })
                }
              >
                Reset minimap
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Controls and comfort: stored per device, not in the save. */
function ComfortSettings() {
  const prefs = useSettings();
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return (
    <div className="mt-5">
      <div className="font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">Controls</div>
      <Toggle
        label="Top-down camera"
        note="High view with north up. Off: the camera follows behind you and you steer the view."
        on={prefs.camera === "top"}
        onChange={(v) => {
          prefs.update({ camera: v ? "top" : "behind" });
          if (v && document.pointerLockElement) document.exitPointerLock();
        }}
      />
      {prefs.camera === "behind" && (
        <>
          <label className="mt-2 block">
            <span className="flex items-baseline justify-between text-sm text-[var(--parchment)]">
              Look sensitivity
              <span className="text-xs text-[var(--parchment)]/70">
                {prefs.lookSensitivity.toFixed(1)}×
              </span>
            </span>
            <input
              type="range"
              min={0.4}
              max={2.2}
              step={0.1}
              value={prefs.lookSensitivity}
              onChange={(e) => prefs.update({ lookSensitivity: Number(e.target.value) })}
              className="mt-1 h-11 w-full accent-[var(--gilt)]"
            />
          </label>
          <Toggle
            label="Invert camera up/down"
            on={prefs.invertY}
            onChange={(v) => prefs.update({ invertY: v })}
          />
        </>
      )}
      <div className="divide-y divide-[var(--gilt)]/10">
        <Toggle
          label="Battery saver"
          note="Caps the game at 30 frames a second: a cooler phone and longer play"
          on={prefs.batterySaver}
          onChange={(v) => prefs.update({ batterySaver: v })}
        />
        <Toggle
          label="Hold Attack to keep swinging"
          on={prefs.holdToAttack}
          onChange={(v) => prefs.update({ holdToAttack: v })}
        />
        {touch && (
          <>
            <Toggle
              label="Left-handed controls"
              note="Stick on the right, Attack on the left"
              on={prefs.leftHanded}
              onChange={(v) => prefs.update({ leftHanded: v })}
            />
            <Slider
              label="Joystick size"
              value={prefs.stickSize}
              min={0.75}
              max={1.4}
              show={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => prefs.update({ stickSize: v })}
            />
            <Slider
              label="Joystick opacity"
              value={prefs.stickOpacity}
              min={0.25}
              max={1}
              show={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => prefs.update({ stickOpacity: v })}
            />
            <Toggle
              label="Floating joystick"
              note="Appears wherever your left thumb lands"
              on={prefs.floatingStick}
              onChange={(v) => prefs.update({ floatingStick: v })}
            />
            <Toggle
              label="Vibration"
              note="On hits, dodges, damage and level-ups (not supported by iPhone browsers)"
              on={prefs.haptics}
              onChange={(v) => {
                prefs.update({ haptics: v });
                if (v) haptic(25);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function DeathScreen() {
  const screen = useGame((s) => s.screen);
  const deaths = useGame((s) => s.deaths);
  if (screen !== "dead") return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#2a0d0a]/55 p-4">
      <Panel>
        <h2 className="font-display text-2xl tracking-wide text-[#f0a595] text-outline">YOU FALL</h2>
        <p className="mt-2 text-sm text-[var(--parchment)]/80">
          Emberhollow's bells carry you back to the fountain. Your satchel is intact — your pride is
          not. ({deaths} {deaths === 1 ? "fall" : "falls"} so far.)
        </p>
        <button
          className="mt-5 rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 py-2.5 text-sm font-semibold text-[var(--parchment)] hover:bg-[var(--gilt)]/35"
          onClick={() => {
            sfx.ui();
            respawnPlayer();
          }}
        >
          Wake in Emberhollow
        </button>
      </Panel>
    </div>
  );
}

export function DialogueBox() {
  const dialogue = useGame((s) => s.dialogue);
  const openDialogue = useGame((s) => s.openDialogue);
  if (!dialogue) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex justify-center p-4"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-[var(--gilt)]/35 bg-[var(--panel)]/95 p-4 backdrop-blur">
        <div className="font-display text-sm tracking-wide text-[var(--gilt)] text-outline">
          {dialogue.name.toUpperCase()}
        </div>
        <div className="mt-2 space-y-1.5">
          {dialogue.lines.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-[var(--parchment)]/90">
              {line}
            </p>
          ))}
        </div>
        <button
          className="mt-3 min-h-11 rounded-lg border border-[var(--gilt)]/40 bg-[var(--gilt)]/15 px-5 py-2 text-sm text-[var(--parchment)] hover:bg-[var(--gilt)]/30"
          onClick={() => {
            sfx.ui();
            openDialogue(null);
          }}
        >
          Close<span className="hidden [@media(pointer:fine)]:inline"> (E)</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Phones held sideways: the controls and HUD are designed for one-handed
 * upright play, so ask the player to rotate and pause the fight underneath
 * instead of letting enemies hit an unplayable layout. (Tablets and desktops
 * play in any orientation.)
 */
export function RotateHint() {
  const [sideways, setSideways] = useState(false);
  const loading = useGame((g) => g.screen === "loading");
  useEffect(() => {
    const mq = window.matchMedia(PHONE_SIDEWAYS);
    const update = () => {
      setSideways(mq.matches);
      if (mq.matches && useGame.getState().screen === "playing") {
        useGame.setState({ screen: "paused" });
      }
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (!sideways || loading) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[var(--ink)] p-8 text-center">
      <svg
        viewBox="0 0 64 64"
        className="h-16 w-16 animate-pulse text-[var(--gilt)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden
      >
        <rect x="20" y="6" width="24" height="44" rx="4" />
        <path d="M10 44a22 22 0 0 0 18 14M54 20A22 22 0 0 0 36 6" strokeLinecap="round" />
        <path d="M24 55l4 3-3 4M40 3l-4 3 3 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="font-display text-xl tracking-wide text-[var(--gilt)] text-outline">
        ROTATE YOUR DEVICE
      </h2>
      <p className="max-w-xs text-sm leading-relaxed text-[var(--parchment)]/80">
        Aetherfall plays upright. Turn your phone to portrait to continue your journey.
      </p>
    </div>
  );
}
