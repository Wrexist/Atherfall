import { useProgress } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { setMuted as setAudioMuted, suspendAudio, unlockAudio } from "../core/audio";
import { applyLook, input, keys, resetInput } from "../core/input";
import { loadSaveIntoStore, saveNow } from "../core/sim";
import { useSettings } from "../core/settings";
import { useGame } from "../core/store";
import type { SaveFile } from "../core/persistence";
import { GameCanvas } from "../render/GameCanvas";
import { Hud } from "./Hud";
import { InventoryPanel } from "./Inventory";
import {
  DeathScreen,
  DialogueBox,
  LoadingScreen,
  PauseMenu,
  RotateHint,
  TitleScreen,
  WebglError,
} from "./Menus";
import { TouchControls } from "./TouchControls";
import { useOnline } from "../online/useOnline";

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Game() {
  useOnline();
  const screen = useGame((s) => s.screen);
  const { progress } = useProgress();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [save, setSave] = useState<SaveFile | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ready = useRef(false);

  useEffect(() => {
    setWebgl(webglAvailable());
    setSave(loadSaveIntoStore());
  }, []);

  // Leave the loading screen once the scene assets have streamed in.
  // (A cancelled timer used to leave the game stuck on "loading" forever when
  // progress bounced back to 100; now it is simply re-armed.)
  useEffect(() => {
    useGame.setState({ loadProgress: progress / 100 });
    if (progress < 100 || ready.current) return undefined;
    const t = setTimeout(() => {
      ready.current = true;
      if (useGame.getState().screen === "loading") useGame.setState({ screen: "title" });
    }, 350);
    return () => clearTimeout(t);
  }, [progress]);
  // Safety net: if loading reports complete but nothing re-renders, still advance.
  useEffect(() => {
    const iv = setInterval(() => {
      const g = useGame.getState();
      if (g.screen === "loading" && g.loadProgress >= 1) useGame.setState({ screen: "title" });
    }, 1500);
    return () => clearInterval(iv);
  }, []);

  // Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      // Typing in a form (sign-in) must not move the hero or open menus.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.repeat) return;
      keys.add(e.code);
      const state = useGame.getState();
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (state.screen === "playing") {
        if (e.code === "Space") input.jumpQueued = true;
        if (e.code === "KeyE") input.interactQueued = true;
        if (e.code === "KeyQ") input.healQueued = true;
        if (e.code === "KeyI") state.toggleInventory(undefined, "satchel");
        if (e.code === "KeyB") state.toggleInventory(undefined, "build");
        if (e.code === "KeyK") state.toggleInventory(undefined, "codex");
        if (e.code === "KeyN") state.toggleInventory(undefined, "map");
        if (e.code === "KeyF" || e.code === "ControlLeft") input.dodgeQueued = true;
        if (e.code === "Tab" || e.code === "KeyR") {
          e.preventDefault();
          input.lockQueued = true;
        }
        if (e.code === "Digit1") input.abilityQueued = 0;
        if (e.code === "Digit2") input.abilityQueued = 1;
        if (e.code === "Digit3") input.abilityQueued = 2;
      }
      if (e.code === "Escape") {
        if (state.inventoryOpen) state.toggleInventory(false);
        else if (state.screen === "playing") useGame.setState({ screen: "paused" });
        else if (state.screen === "paused") useGame.setState({ screen: "playing" });
      }
      if (e.code === "KeyM") {
        const muted = !useGame.getState().muted;
        useGame.setState({ muted });
        setAudioMuted(muted);
      }
    };
    const onUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => resetInput();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Mouse look + attack
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const state = useGame.getState();
      if (state.screen !== "playing" || state.inventoryOpen || state.dialogue) return;
      // Top view: the camera is fixed, so the mouse is free — clicks act at once.
      const top = useSettings.getState().camera === "top";
      if (!top && document.pointerLockElement !== el) {
        void el.requestPointerLock?.();
        dragging.current = true;
        return;
      }
      if (e.button === 0) {
        input.attackQueued = true;
        input.attackHeld = true;
      }
      if (e.button === 2) input.dodgeQueued = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging.current = false;
      if (e.pointerType === "mouse" && e.button === 0) input.attackHeld = false;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const locked = document.pointerLockElement === el;
      if (locked) applyLook(e.movementX, e.movementY);
      else if (dragging.current) applyLook(e.movementX, e.movementY);
    };
    const onContext = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  // Asset cache for instant relaunch / offline play (see public/sw.js). Production
  // only, and never inside an iframe such as the editor preview.
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator) || window.top !== window.self)
      return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  // Mobile browsers only allow audio after a user gesture, and suspend it again
  // after interruptions — so every tap (touch, pen or mouse) re-unlocks it.
  useEffect(() => {
    const onGesture = () => unlockAudio();
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
  }, []);

  // Backgrounding (home button, app switch, incoming call, tab switch): pause,
  // save immediately — iOS may kill the page without warning — and stop audio.
  useEffect(() => {
    const persist = () => {
      const s = useGame.getState().screen;
      if (s === "playing" || s === "paused" || s === "dead") saveNow();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      resetInput();
      if (useGame.getState().screen === "playing") useGame.setState({ screen: "paused" });
      persist();
      suspendAudio();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", persist);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", persist);
    };
  }, []);

  // Release the cursor whenever gameplay is interrupted — including the satchel,
  // so its buttons are clickable with a visible mouse cursor.
  const inventoryOpen = useGame((s) => s.inventoryOpen);
  useEffect(() => {
    const interrupted = screen !== "playing" || inventoryOpen;
    if (interrupted && document.pointerLockElement) document.exitPointerLock();
    if (interrupted) resetInput();
  }, [screen, inventoryOpen]);

  const showLoading = screen === "loading";
  const overlay = useMemo(
    () => screen === "playing" || screen === "paused" || screen === "dead",
    [screen],
  );

  if (webgl === false) return <WebglError />;

  return (
    <div ref={shellRef} className="fixed inset-0 overflow-hidden bg-[var(--ink)] touch-none">
      <GameCanvas />
      {overlay && <Hud />}
      {overlay && <TouchControls />}
      <DialogueBox />
      <InventoryPanel />
      <PauseMenu />
      <DeathScreen />
      <TitleScreen save={save} onSaveChanged={setSave} />
      {showLoading && <LoadingScreen progress={useGame.getState().loadProgress} />}
      <RotateHint />
    </div>
  );
}
