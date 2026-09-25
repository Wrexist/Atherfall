import { useState } from "react";
import { STARTER_QUEST } from "../data/quests";
import { setMuted as setAudioMuted, sfx } from "../core/audio";
import { } from "../core/persistence";
import { initWorld, respawnPlayer, saveNow } from "../core/sim";
import { useGame, type Quality } from "../core/store";
import type { SaveFile } from "../core/persistence";

const QUALITIES: Array<{ id: Quality; label: string; note: string }> = [
  { id: "low", label: "Low", note: "No shadows, short draw distance — best on phones" },
  { id: "medium", label: "Medium", note: "Shadows on, balanced" },
  { id: "high", label: "High", note: "Sharp shadows, long draw distance" },
];

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-[var(--gilt)]/30 bg-[var(--panel)]/95 p-6 shadow-2xl backdrop-blur">
      {children}
    </div>
  );
}

export function LoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[var(--ink)] px-6">
      <h1 className="font-display text-4xl tracking-[0.4em] text-[var(--gilt)]">AETHERFALL</h1>
      <p className="mt-2 text-xs uppercase tracking-[0.3em] text-[var(--parchment)]/50">Dawnreach</p>
      <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-[var(--parchment)]/15">
        <div
          className="h-full rounded-full bg-[var(--gilt)] transition-[width] duration-200"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-3 text-[11px] text-[var(--parchment)]/45">
        Raising the pines… {Math.round(progress * 100)}%
      </p>
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

export function TitleScreen({ save }: { save: SaveFile | null }) {
  const screen = useGame((s) => s.screen);
  const quality = useGame((s) => s.quality);
  const setQuality = useGame((s) => s.setQuality);
  const [showControls, setShowControls] = useState(false);
  if (screen !== "title") return null;

  const start = (useSave: boolean) => {
    sfx.ui();
    if (!useSave) {
      clearSave();
      useGame.getState().resetProgress();
    }
    initWorld(useSave ? save : null);
    useGame.setState({ screen: "playing" });
    saveNow();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--ink)]/80 p-4 backdrop-blur-sm">
      <Panel>
        <h1 className="font-display text-3xl tracking-[0.35em] text-[var(--gilt)]">AETHERFALL</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-[var(--parchment)]/50">
          Chapter one · Dawnreach
        </p>
        <p className="mt-4 text-sm leading-relaxed text-[var(--parchment)]/85">
          Something fell out of the sky over Tidewrack Bay, and the woods around Emberhollow have not
          been quiet since. Warden Sela is waiting by the fountain.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {save && (
            <button
              className="rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 py-2.5 text-sm font-semibold text-[var(--parchment)] hover:bg-[var(--gilt)]/35"
              onClick={() => start(true)}
            >
              Continue — level {save.level}
            </button>
          )}
          <button
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${
              save
                ? "border border-[var(--gilt)]/25 text-[var(--parchment)]/80 hover:bg-[var(--ink)]/40"
                : "border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 text-[var(--parchment)] hover:bg-[var(--gilt)]/35"
            }`}
            onClick={() => start(false)}
          >
            {save ? "New journey" : "Begin"}
          </button>
          <button
            className="rounded-lg border border-[var(--gilt)]/25 px-4 py-2.5 text-sm text-[var(--parchment)]/80 hover:bg-[var(--ink)]/40"
            onClick={() => setShowControls((v) => !v)}
          >
            Controls
          </button>
        </div>

        {showControls && <ControlsList />}

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Graphics</div>
          <QualityPicker quality={quality} setQuality={setQuality} />
        </div>
      </Panel>
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
          className={`rounded-lg border p-2 text-left ${
            quality === q.id
              ? "border-[var(--gilt)]/60 bg-[var(--gilt)]/15"
              : "border-[var(--gilt)]/20 hover:bg-[var(--ink)]/40"
          }`}
        >
          <div className="text-sm text-[var(--parchment)]">{q.label}</div>
          <div className="text-[10px] leading-snug text-[var(--parchment)]/55">{q.note}</div>
        </button>
      ))}
    </div>
  );
}

function ControlsList() {
  const rows: Array<[string, string]> = [
    ["Move", "W A S D / left joystick"],
    ["Sprint", "Shift / push joystick fully"],
    ["Look", "Move mouse / drag right half"],
    ["Attack", "Left click / Attack button"],
    ["Jump", "Space / Jump button"],
    ["Talk & continue", "E / Talk button"],
    ["Drink draught", "Q / Heal button"],
    ["Satchel", "I / Bag button"],
    ["Pause", "Escape"],
    ["Mute", "M"],
  ];
  return (
    <div className="mt-4 grid gap-x-6 gap-y-1 rounded-lg border border-[var(--gilt)]/20 p-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-[11px]">
          <span className="text-[var(--parchment)]/60">{k}</span>
          <span className="text-right text-[var(--parchment)]">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function PauseMenu() {
  const s = useGame();
  if (s.screen !== "paused") return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--ink)]/35 p-4">
      <Panel>
        <h2 className="font-display text-xl tracking-[0.25em] text-[var(--gilt)]">PAUSED</h2>
        <p className="mt-1 text-xs text-[var(--parchment)]/60">
          {STARTER_QUEST.name} · step {Math.min(s.questStep + 1, STARTER_QUEST.steps.length)} of{" "}
          {STARTER_QUEST.steps.length}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 py-2.5 text-sm font-semibold text-[var(--parchment)] hover:bg-[var(--gilt)]/35"
            onClick={() => {
              sfx.ui();
              useGame.setState({ screen: "playing" });
            }}
          >
            Resume
          </button>
          <button
            className="rounded-lg border border-[var(--gilt)]/25 px-4 py-2.5 text-sm text-[var(--parchment)]/85 hover:bg-[var(--ink)]/40"
            onClick={() => {
              saveNow();
              useGame.getState().toast("Progress saved", "good");
            }}
          >
            Save now
          </button>
          <button
            className="rounded-lg border border-[#e8735a]/40 px-4 py-2.5 text-sm text-[#f0a595] hover:bg-[#e8735a]/15"
            onClick={() => {
              clearSave();
              useGame.getState().resetProgress();
              initWorld(null);
              useGame.setState({ screen: "title" });
            }}
          >
            Erase save
          </button>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Graphics</div>
          <QualityPicker quality={s.quality} setQuality={s.setQuality} />
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-[var(--parchment)]/80">
          <input
            type="checkbox"
            checked={s.muted}
            onChange={(e) => {
              s.setMuted(e.target.checked);
              setAudioMuted(e.target.checked);
            }}
          />
          Mute sound
        </label>

        <ControlsList />
      </Panel>
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
        <h2 className="font-display text-2xl tracking-[0.25em] text-[#f0a595]">YOU FALL</h2>
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
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--gilt)]/35 bg-[var(--panel)]/95 p-4 backdrop-blur">
        <div className="font-display text-sm tracking-[0.2em] text-[var(--gilt)]">
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
          className="mt-3 rounded-lg border border-[var(--gilt)]/40 bg-[var(--gilt)]/15 px-4 py-2 text-xs text-[var(--parchment)] hover:bg-[var(--gilt)]/30"
          onClick={() => {
            sfx.ui();
            openDialogue(null);
          }}
        >
          Close (E)
        </button>
      </div>
    </div>
  );
}
