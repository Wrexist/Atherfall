import { useEffect, useState } from "react";
import { onSave } from "../core/sim";
import { useGame } from "../core/store";
import { initAccount, useAccount } from "./account";
import { onlineConfigured } from "./client";
import { dropPendingUpload, queueUpload, setBackgrounded } from "./cloudSave";
import { joinWorld, leaveWorld, updateMeta } from "./presence";

/**
 * Wires the online layer to the game's lifecycle. Does nothing at all when the
 * game has no backend configured (it then plays exactly as before, offline).
 */
export function useOnline() {
  const status = useAccount((a) => a.status);
  const userId = useAccount((a) => a.userId);
  const name = useAccount((a) => a.profile?.display_name ?? null);
  const inWorld = useGame(
    (g) => g.screen === "playing" || g.screen === "paused" || g.screen === "dead",
  );
  const archetype = useGame((g) => g.archetype);
  const level = useGame((g) => g.level);

  useEffect(() => {
    if (!onlineConfigured) return undefined;
    initAccount();
    const off = onSave(queueUpload);
    // Backgrounded: push the latest save now, including the one the game makes
    // on hide (its listener may run after ours). Leaving the world is handled by
    // the effect below — iOS may freeze the page, and a silent socket would
    // leave a statue behind.
    const onVisibility = () => setBackgrounded(document.visibilityState === "hidden");
    const onHide = () => setBackgrounded(true);
    const onShow = () => setBackgrounded(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  // Signing out stops syncing this device's save to that account.
  useEffect(() => {
    if (status === "signed-out") dropPendingUpload();
  }, [status]);

  // Be in the shared world while in the game, signed in and on screen.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    if (!onlineConfigured) return;
    if (status === "signed-in" && userId && name && inWorld && visible) {
      void joinWorld(userId, { name, archetype, level });
    } else {
      void leaveWorld();
    }
    // archetype/level changes are pushed below without rejoining
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, name, inWorld, visible]);

  useEffect(() => {
    if (name) updateMeta({ name, archetype, level });
  }, [name, archetype, level]);
}
