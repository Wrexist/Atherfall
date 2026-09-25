// Shared input state. Written by DOM listeners / touch UI, read inside useFrame.

import { useSettings } from "./settings";

export interface InputState {
  /** -1..1 movement on the local right axis. */
  moveX: number;
  /** -1..1 movement forward. */
  moveZ: number;
  sprint: boolean;
  jumpQueued: boolean;
  attackQueued: boolean;
  /** Attack button/mouse held down: keeps chaining swings (if enabled in settings). */
  attackHeld: boolean;
  interactQueued: boolean;
  healQueued: boolean;
  dodgeQueued: boolean;
  /** Index into ABILITIES, or null. */
  abilityQueued: number | null;
  /** Lock onto / cycle / release a target. */
  lockQueued: boolean;
  /** Camera orbit, radians. */
  yaw: number;
  pitch: number;
  /** Set true while a touch drag controls the camera. */
  touchLook: boolean;
}

export const input: InputState = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  jumpQueued: false,
  attackQueued: false,
  attackHeld: false,
  interactQueued: false,
  healQueued: false,
  dodgeQueued: false,
  abilityQueued: null,
  lockQueued: false,
  yaw: Math.PI,
  pitch: 0.34,
  touchLook: false,
};

export const keys = new Set<string>();

export const touch = {
  moveX: 0,
  moveZ: 0,
};

export const MIN_PITCH = -0.25;
export const MAX_PITCH = 1.05;

export function applyLook(dx: number, dy: number, sensitivity = 0.0026) {
  const prefs = useSettings.getState();
  const k = sensitivity * prefs.lookSensitivity;
  input.yaw -= dx * k;
  input.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, input.pitch + (prefs.invertY ? -dy : dy) * k));
}

export function resetInput() {
  keys.clear();
  touch.moveX = 0;
  touch.moveZ = 0;
  input.moveX = 0;
  input.moveZ = 0;
  input.sprint = false;
  input.jumpQueued = false;
  input.attackQueued = false;
  input.attackHeld = false;
  input.interactQueued = false;
  input.healQueued = false;
  input.dodgeQueued = false;
  input.abilityQueued = null;
  input.lockQueued = false;
}

/** Fold keyboard + touch into the movement axes. Called once per frame. */
export function pollInput() {
  const kx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  const kz = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  input.moveX = Math.max(-1, Math.min(1, kx + touch.moveX));
  input.moveZ = Math.max(-1, Math.min(1, kz + touch.moveZ));
  input.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || sprintTouch;
}

let sprintTouch = false;
export function setSprintTouch(v: boolean) {
  sprintTouch = v;
}
