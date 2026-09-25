import { useEffect, useState } from "react";

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

/** A phone held sideways: Aetherfall plays upright, so it asks to be rotated. */
export const PHONE_SIDEWAYS =
  "(orientation: landscape) and (pointer: coarse) and (max-height: 600px)";
