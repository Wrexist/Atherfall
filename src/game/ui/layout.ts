import { useEffect, useState } from "react";
import { inCombat } from "../core/sim";

/** Tracks a media query (false during SSR and the first render). */
function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Screens taller than wide (phones held upright) get the portrait HUD and controls. */
export function usePortrait() {
  return useMedia("(orientation: portrait)");
}

/** True on mouse/trackpad devices; phones never mount the desktop-only HUD pieces. */
export function useFinePointer() {
  return useMedia("(pointer: fine)");
}

/**
 * True while enemies are hunting the hero. The world keeps running behind
 * menus (it's an MMO), so menus use this to warn. Checked 4 times a second;
 * re-renders only when the answer changes.
 */
export function useThreatened() {
  const [threat, setThreat] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => setThreat(inCombat()), 250);
    return () => clearInterval(iv);
  }, []);
  return threat;
}

/** A pulsing red dot for a button whose screen hides an ongoing fight. */
export const THREAT_DOT =
  "after:absolute after:-right-1 after:-top-1 after:h-3 after:w-3 after:animate-pulse after:rounded-full after:border after:border-[var(--ink)] after:bg-[#e2412f] after:content-['']";

/** A phone held sideways: Aetherfall plays upright, so it asks to be rotated. */
export const PHONE_SIDEWAYS =
  "(orientation: landscape) and (pointer: coarse) and (max-height: 600px)";
