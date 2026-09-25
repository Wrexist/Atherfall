import { useEffect, useState } from "react";
import { sfx } from "../core/audio";
import { readSave, writeSave, type SaveFile } from "../core/persistence";
import { loadSaveIntoStore } from "../core/sim";
import { ARCHETYPES, type ArchetypeId } from "../data/archetypes";
import { nameProblem, signIn, signOut, signUp, useAccount } from "../online/account";
import { onlineConfigured } from "../online/client";
import {
  flushUpload,
  resolveCloudChoice,
  startCloudSync,
  useCloudSync,
  type LocalSaves,
} from "../online/cloudSave";
import { usePresence } from "../online/presence";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-[var(--gilt)]/30 bg-[var(--ink)]/70 px-3 text-base text-[var(--parchment)] outline-none focus:border-[var(--gilt)]/70";
const primary =
  "min-h-11 rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 text-sm font-semibold text-[var(--parchment)] hover:bg-[var(--gilt)]/35 disabled:opacity-50";
const secondary =
  "min-h-11 rounded-lg border border-[var(--gilt)]/25 px-4 text-sm text-[var(--parchment)]/85 hover:bg-[var(--ink)]/40";

/** One line for the title screen / pause menu: who you are, or an invitation to sign in. */
export function AccountLine({ onOpen }: { onOpen?: () => void }) {
  const status = useAccount((a) => a.status);
  const name = useAccount((a) => a.profile?.display_name);
  const online = usePresence((p) => p.online);
  const busy = useAccount((a) => a.busy);
  if (status === "unavailable") return null;
  if (status === "loading")
    return <p className="mt-4 text-xs text-[var(--parchment)]/60">Connecting…</p>;
  if (status === "signed-out") {
    // Mid-game there's no sign-in: the cloud/device save choice belongs on the title screen.
    if (!onOpen)
      return (
        <p className="mt-4 text-xs text-[var(--parchment)]/65">
          Sign in from the title screen to play online.
        </p>
      );
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className={secondary} onClick={onOpen}>
          Sign in · play online
        </button>
        <span className="text-xs text-[var(--parchment)]/70">
          Save to the cloud and see other players.
        </span>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--parchment)]/85">
      <span>
        <span
          className="mr-1 inline-block h-2 w-2 rounded-full bg-[#8fd18a] align-middle"
          aria-hidden
        />
        Signed in as <b className="text-[var(--parchment)]">{name ?? "…"}</b>
        {online > 1 && <span className="text-[var(--parchment)]/70"> · {online} in Dawnreach</span>}
      </span>
      <button
        className="min-h-11 px-2 text-xs text-[var(--parchment)]/70 underline disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          await flushUpload(); // don't lose the last few seconds of progress
          await signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

/** Sign in / create account. Closes itself once signed in. */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const status = useAccount((a) => a.status);
  const busy = useAccount((a) => a.busy);
  const error = useAccount((a) => a.error);
  const notice = useAccount((a) => a.notice);

  useEffect(() => {
    if (status === "signed-in") onClose();
  }, [status, onClose]);
  useEffect(() => {
    useAccount.setState({ error: null, notice: null });
  }, [mode]);

  const nameHint = mode === "signup" && name ? nameProblem(name) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    sfx.ui();
    if (mode === "signup") await signUp(name, email, password);
    else await signIn(email, password);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[var(--ink)]/80 p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[var(--gilt)]/30 bg-[var(--panel)] p-5 shadow-2xl"
      >
        <div className="flex gap-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-11 flex-1 rounded-md font-display text-xs tracking-[0.15em] ${
                mode === m
                  ? "bg-[var(--gilt)]/25 text-[var(--parchment)]"
                  : "text-[var(--parchment)]/70"
              }`}
            >
              {m === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
          ))}
        </div>

        {mode === "signup" && (
          <label className="mt-4 block text-sm text-[var(--parchment)]/85">
            Player name{" "}
            <span className="text-xs text-[var(--parchment)]/60">(what others see)</span>
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              autoComplete="username"
              autoCapitalize="words"
              required
            />
            {nameHint && <span className="mt-1 block text-xs text-[#f0a595]">{nameHint}</span>}
          </label>
        )}
        <label className="mt-3 block text-sm text-[var(--parchment)]/85">
          Email
          <input
            className={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>
        <label className="mt-3 block text-sm text-[var(--parchment)]/85">
          Password
          <input
            className={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-[#f0a595]">
            {error}
          </p>
        )}
        {notice && <p className="mt-3 text-sm text-[#b7e8b1]">{notice}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className={primary} disabled={busy || !!nameHint}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button type="button" className={secondary} onClick={onClose}>
            Not now
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--parchment)]/65">
          Your journey is saved on this device either way. An account keeps it in the cloud too, so
          you can continue on another phone, and lets you see other players in Dawnreach.
        </p>
      </form>
    </div>
  );
}

function describe(save: SaveFile) {
  const arche = ARCHETYPES[save.archetype as ArchetypeId]?.name ?? "Hero";
  const when = new Date(save.savedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${arche}, level ${save.level} — saved ${when}`;
}

/** How the cloud-save check reads and replaces this device's save. */
export function useLocalSaves(onSaveChanged: (save: SaveFile | null) => void): LocalSaves {
  const [local] = useState<LocalSaves>(() => ({
    read: readSave,
    adopt: (save) => {
      writeSave(save);
      onSaveChanged(loadSaveIntoStore());
    },
  }));
  return local;
}

/**
 * On the title screen, once signed in: reconcile this device's save with the
 * cloud, and say how it went. The check itself lives in the cloud-save module,
 * so it finishes even if this screen goes away; the title screen waits for it.
 */
export function CloudSaveSync({ local }: { local: LocalSaves }) {
  const userId = useAccount((a) => a.userId);
  const message = useCloudSync((c) => c.message);
  useEffect(() => {
    if (onlineConfigured && userId) void startCloudSync(userId, local);
  }, [userId, local]);
  return message ? <p className="mt-2 text-xs text-[var(--parchment)]/70">{message}</p> : null;
}

/** "Your cloud save is newer": shown in place of the start buttons until answered. */
export function CloudSaveChoice({ local }: { local: LocalSaves }) {
  const choice = useCloudSync((c) => c.choice);
  if (!choice) return null;
  return (
    <div className="mt-4 rounded-lg border border-[var(--gilt)]/40 bg-[var(--ink)]/50 p-3">
      <p className="text-sm font-semibold text-[var(--parchment)]">
        Your cloud save is newer than this device's.
      </p>
      <p className="mt-1 text-xs text-[var(--parchment)]/75">Cloud: {describe(choice.cloud)}</p>
      <p className="text-xs text-[var(--parchment)]/75">This device: {describe(choice.local)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={primary} onClick={() => resolveCloudChoice(true, local)}>
          Use cloud save
        </button>
        <button className={secondary} onClick={() => resolveCloudChoice(false, local)}>
          Keep this device's
        </button>
      </div>
    </div>
  );
}
