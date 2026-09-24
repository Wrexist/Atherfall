import { useProgress } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { initAudio, setMuted as setAudioMuted } from "../core/audio";
import { applyLook, input, keys, resetInput } from "../core/input";
import { loadSaveIntoStore } from "../core/sim";
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
  TitleScreen,
  WebglError,
} from "./Menus";
import { TouchControls } from "./TouchControls";

function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Game() {
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
        if (e.code === "KeyI") state.toggleInventory();
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
      initAudio();
      if (document.pointerLockElement !== el) {
        void el.requestPointerLock?.();
        dragging.current = true;
        return;
      }
      if (e.button === 0) input.attackQueued = true;
    };
    const onPointerUp = () => {
      dragging.current = false;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const locked = document.pointerLockElement === el;
      if (locked) applyLook(e.movementX, e.movementY);
      else if (dragging.current) applyLook(e.movementX, e.movementY);
    };
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onMove);
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
  const overlay = useMemo(() => screen === "playing" || screen === "paused" || screen === "dead", [screen]);

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
      <TitleScreen save={save} />
      {showLoading && <LoadingScreen progress={useGame.getState().loadProgress} />}
    </div>
  );
}
