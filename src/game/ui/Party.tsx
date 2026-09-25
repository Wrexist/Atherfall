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

/** Whether the party panel is open. */
export const usePartyPanel = create<{ open: boolean }>(() => ({ open: false }));
export const togglePartyPanel = () => usePartyPanel.setState((s) => ({ open: !s.open }));

const btn =
  "min-h-11 rounded-lg border border-[var(--gilt)]/40 px-3 text-sm text-[var(--parchment)] active:bg-[var(--gilt)]/30 disabled:opacity-50";
const primary =
  "min-h-11 rounded-lg border border-[var(--gilt)]/60 bg-[var(--gilt)]/25 px-4 text-sm font-semibold text-[var(--parchment)] active:bg-[var(--gilt)]/40 disabled:opacity-50";

const classLabel = (archetype: string) => ARCHETYPES[archetype as ArchetypeId]?.name ?? "Hero";

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
      onClick={() => usePartyPanel.setState({ open: false })}
    >
      <div
        role="dialog"
        aria-label="Party"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--gilt)]/30 bg-[var(--panel)]/95 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm tracking-[0.2em] text-[var(--gilt)]">
            PARTY {partyId ? `(${members.length}/${PARTY_SIZE})` : ""}
          </h2>
          <button
            className="min-h-11 min-w-11 rounded-md text-[var(--parchment)]/80"
            aria-label="Close"
            onClick={() => usePartyPanel.setState({ open: false })}
          >
            ✕
          </button>
        </div>

        {partyId ? (
          <ul className="mt-2 divide-y divide-[var(--gilt)]/10">
            {members.map((m) => (
              <li key={m.id} className="flex min-h-11 items-center justify-between gap-2 py-1">
                <span className="text-sm text-[var(--parchment)]">
                  {m.id === leader && (
                    <span className="mr-1 text-[var(--gilt)]" aria-label="Leader">
                      ♛
                    </span>
                  )}
                  {m.name}
                  <span className="text-xs text-[var(--parchment)]/60">
                    {" "}
                    · {classLabel(m.archetype)} {m.level}
                  </span>
                </span>
                {leading && m.id !== selfId && (
                  <button className={btn} disabled={busy} onClick={() => void removeMember(m.id)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--parchment)]/75">
            Invite a player near you to start a party. Quest kills count for everyone close by, and
            so does the XP. Loot stays yours.
          </p>
        )}

        <h3 className="mt-4 text-[11px] uppercase tracking-[0.2em] text-[var(--gilt)]">
          Players nearby
        </h3>
        {nearby.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--parchment)]/60">
            No one within {INVITE_RANGE} m. Walk over to someone and open this again.
          </p>
        ) : (
          <ul className="mt-1">
            {nearby.slice(0, 6).map((r) => (
              <li key={r.id} className="flex min-h-11 items-center justify-between gap-2">
                <span className="text-sm text-[var(--parchment)]">
                  {r.name}
                  <span className="text-xs text-[var(--parchment)]/60">
                    {" "}
                    · {classLabel(r.archetype)} {r.level}
                  </span>
                </span>
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
          <p role="alert" className="mt-3 text-sm text-[#f0a595]">
            {error}
          </p>
        )}

        <label className="mt-4 flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm text-[var(--parchment)]">Take party invites</span>
          <input
            type="checkbox"
            className="h-6 w-6 accent-[var(--gilt)]"
            checked={taking}
            onChange={(e) => void setInvitesOpen(e.target.checked)}
          />
        </label>

        {partyId && (
          <button className={`${btn} mt-3`} disabled={busy} onClick={() => void leaveParty()}>
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
      className="pointer-events-auto fixed inset-x-3 top-[36%] z-40 mx-auto max-w-sm rounded-2xl border border-[var(--gilt)]/50 bg-[var(--panel)]/95 p-4 text-center shadow-2xl"
    >
      <p className="text-sm text-[var(--parchment)]">
        <b className="text-[var(--gilt)]">{invite.fromName}</b> invites you to a party.
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
