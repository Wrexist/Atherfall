import { useEffect, useState } from "react";
import { create } from "zustand";
import { sfx } from "../core/audio";
import { world } from "../core/sim";
import { ARCHETYPES, type ArchetypeId } from "../data/archetypes";
import { useAccount } from "../online/account";
import {
  INVITE_RANGE,
  PARTY_SIZE,
  acceptInvite,
  declineInvite,
  invitableNearby,
  inviteToParty,
  leaveParty,
  removeMember,
  setInvitesOpen,
  useParty,
} from "../online/party";
import { remotes } from "../online/presence";
import { BTN, CLASS_TONE, Glyph, classIconUrl } from "./kit";

/** Whether the party panel is open. */
export const usePartyPanel = create<{ open: boolean }>(() => ({ open: false }));
export const togglePartyPanel = () => usePartyPanel.setState((s) => ({ open: !s.open }));

const btn = BTN.secondary;
const primary = BTN.primary;

const archetypeOf = (a: string): ArchetypeId => (a in ARCHETYPES ? (a as ArchetypeId) : "vanguard");
const classLabel = (archetype: string) => ARCHETYPES[archetypeOf(archetype)].name;

/** A player's row: class emblem, name, class and level. */
function Who({
  name,
  archetype,
  level,
  leader,
}: {
  name: string;
  archetype: string;
  level: number;
  leader?: boolean;
}) {
  const a = archetypeOf(archetype);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 bg-[var(--ink)]"
        style={{ borderColor: CLASS_TONE[a] }}
      >
        <img src={classIconUrl(a)} alt="" className="h-7 w-7" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 truncate text-sm font-extrabold text-[var(--parchment)]">
          {leader && (
            <span className="text-[var(--gilt)]" aria-label="Leader" title="Leader">
              &#9819;
            </span>
          )}
          {name}
        </span>
        <span className="block text-xs font-bold text-[var(--parchment)]/60">
          {classLabel(archetype)} &middot; level {level}
        </span>
      </span>
    </span>
  );
}

/** Party: your members, nearby players to invite, and whether you take invites. */
export function PartyPanel() {
  const open = usePartyPanel((s) => s.open);
  const signedIn = useAccount((a) => a.status === "signed-in");
  const selfId = useAccount((a) => a.userId);
  const { partyId, leader, members, busy, error, open: taking } = useParty();
  const [, tick] = useState(0);
  // Nearby players move; re-read them once a second while the panel is open.
  useEffect(() => {
    if (!open) return undefined;
    const iv = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [open]);
  if (!open || !signedIn) return null;
  const p = world.player;
  const nearby = invitableNearby(remotes.values(), selfId, members, p.x, p.z);
  const full = members.length >= PARTY_SIZE;
  const leading = leader === selfId;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--ink)]/55 p-3"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) usePartyPanel.setState({ open: false });
      }}
    >
      <div
        role="dialog"
        aria-label="Party"
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border-2 border-[var(--edge)] bg-[var(--panel)] p-4 text-[var(--parchment)] shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl text-[var(--gilt)] text-outline">
            <Glyph id="party" className="h-6 w-6" />
            Party {partyId ? `${members.length}/${PARTY_SIZE}` : ""}
          </h2>
          <button
            className="grid h-11 w-11 place-items-center rounded-full border-b-4 border-[#7a2417] bg-gradient-to-b from-[#f0735a] to-[#cf4630]"
            aria-label="Close"
            onClick={() => usePartyPanel.setState({ open: false })}
          >
            <Glyph id="close" className="h-5 w-5" />
          </button>
        </div>

        {partyId ? (
          <ul className="mt-3 space-y-1.5">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-[var(--panel-2)] px-2.5 py-1.5"
              >
                <Who
                  name={m.name}
                  archetype={m.archetype}
                  level={m.level}
                  leader={m.id === leader}
                />
                {leading && m.id !== selfId && (
                  <button className={btn} disabled={busy} onClick={() => void removeMember(m.id)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-semibold text-[var(--parchment)]/80">
            Invite a player near you to start a party. Quest kills count for everyone close by, and
            so does the XP. Loot stays yours.
          </p>
        )}

        <h3 className="mt-4 font-display text-[15px] tracking-wide text-[var(--gilt)] text-outline">
          Players nearby
        </h3>
        {nearby.length === 0 ? (
          <p className="mt-1 text-xs font-semibold text-[var(--parchment)]/65">
            No one within {INVITE_RANGE} m. Walk over to someone and open this again.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {nearby.slice(0, 6).map((r) => (
              <li
                key={r.id}
                className="flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-[var(--panel-2)] px-2.5 py-1.5"
              >
                <Who name={r.name} archetype={r.archetype} level={r.level} />
                <button
                  className={primary}
                  disabled={busy || full}
                  onClick={() => {
                    sfx.ui();
                    void inviteToParty(r.id);
                  }}
                >
                  Invite
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-[#e5533d]/20 px-2.5 py-1.5 text-sm font-bold text-[#ffb3a6]"
          >
            {error}
          </p>
        )}

        <button
          role="switch"
          aria-checked={taking}
          className="mt-4 flex min-h-11 w-full items-center justify-between gap-3 text-left"
          onClick={() => void setInvitesOpen(!taking)}
        >
          <span>
            <span className="block text-sm font-bold text-[var(--parchment)]">
              Take party invites
            </span>
            <span className="block text-xs font-semibold text-[var(--parchment)]/60">
              From anyone nearby
            </span>
          </span>
          <span
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
              taking
                ? "border-[#b8741a] bg-[var(--gilt)]"
                : "border-[var(--edge)] bg-[var(--ink)]/70"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow transition-[left] ${
                taking ? "left-[1.4rem]" : "left-0.5"
              }`}
              style={{ width: "1.35rem", height: "1.35rem" }}
            />
          </span>
        </button>

        {partyId && (
          <button
            className={`${BTN.danger} mt-3 w-full`}
            disabled={busy}
            onClick={() => void leaveParty()}
          >
            Leave party
          </button>
        )}
      </div>
    </div>
  );
}

/** How long an invite popup stays up if it isn't answered. */
const INVITE_POPUP_MS = 30_000;

/** "Rowan invites you to a party": the newest invite, until answered, expired or 30 s pass. */
export function InvitePopup() {
  const invite = useParty((s) => s.invites[s.invites.length - 1] ?? null);
  const busy = useParty((s) => s.busy);
  const [hidden, setHidden] = useState<string | null>(null);
  // Keyed on the invite, not the object: refreshes rebuild it every 20 s,
  // which would otherwise restart the countdown for good.
  const inviteId = invite?.id ?? null;
  const expiresAt = invite?.expiresAt ?? 0;
  useEffect(() => {
    if (!inviteId) return undefined;
    const wait = Math.max(0, Math.min(INVITE_POPUP_MS, expiresAt - Date.now()));
    const t = setTimeout(() => setHidden(inviteId), wait);
    return () => clearTimeout(t);
  }, [inviteId, expiresAt]);
  if (!invite || hidden === invite.id) return null;
  return (
    <div
      role="alertdialog"
      aria-label="Party invite"
      className="pointer-events-auto fixed inset-x-3 top-[36%] z-40 mx-auto max-w-sm rounded-3xl border-2 border-[var(--gilt)] bg-[var(--panel)] p-4 text-center text-[var(--parchment)] shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      <Glyph id="party" className="mx-auto h-8 w-8" />
      <p className="mt-1 text-sm font-bold text-[var(--parchment)]">
        <b className="font-display text-lg font-normal text-[var(--gilt)] text-outline">
          {invite.fromName}
        </b>{" "}
        invites you to a party.
      </p>
      <div className="mt-3 flex justify-center gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={() => {
            sfx.ui();
            void acceptInvite(invite.id);
          }}
        >
          Join
        </button>
        <button className={btn} disabled={busy} onClick={() => void declineInvite(invite.id)}>
          No thanks
        </button>
      </div>
    </div>
  );
}
