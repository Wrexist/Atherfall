import { useEffect, useRef, useState } from "react";
import { applyLook, input, setSprintTouch, touch } from "../core/input";
import { useGame } from "../core/store";

const KNOB = 52;

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const set = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy);
    const max = 56;
    const clamped = len > max ? max / len : 1;
    const kx = dx * clamped;
    const ky = dy * clamped;
    if (knob.current) knob.current.style.transform = `translate(${kx}px, ${ky}px)`;
    touch.moveX = kx / max;
    touch.moveZ = -ky / max;
    setSprintTouch(Math.hypot(kx, ky) / max > 0.85);
  };

  return (
    <div
      ref={base}
      className="pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.75rem,env(safe-area-inset-left))] flex h-32 w-32 touch-none items-center justify-center rounded-full border border-[var(--gilt)]/30 bg-[var(--panel)]/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const rect = base.current!.getBoundingClientRect();
        origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        set(e.clientX - origin.current.x, e.clientY - origin.current.y);
      }}
      onPointerMove={(e) => {
        if (id.current !== e.pointerId) return;
        set(e.clientX - origin.current.x, e.clientY - origin.current.y);
      }}
      onPointerUp={() => {
        id.current = null;
        set(0, 0);
        setSprintTouch(false);
      }}
      onPointerCancel={() => {
        id.current = null;
        set(0, 0);
        setSprintTouch(false);
      }}
    >
      <div
        ref={knob}
        style={{ width: KNOB, height: KNOB }}
        className="rounded-full border border-[var(--gilt)]/50 bg-[var(--gilt)]/30"
      />
    </div>
  );
}

function TouchButton({
  label,
  onPress,
  size = "h-16 w-16",
  className = "",
}: {
  label: string;
  onPress: () => void;
  size?: string;
  className?: string;
}) {
  return (
    <button
      className={`pointer-events-auto touch-none rounded-full border border-[var(--gilt)]/40 bg-[var(--panel)]/70 text-xs font-semibold uppercase tracking-wider text-[var(--parchment)] active:bg-[var(--gilt)]/35 ${size} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {label}
    </button>
  );
}

/** Drag-to-look surface covering the right half of the screen. */
function LookPad() {
  const id = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  return (
    <div
      className="pointer-events-auto absolute inset-y-0 right-0 w-1/2 touch-none"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (id.current !== e.pointerId) return;
        applyLook((e.clientX - last.current.x) * 1.6, (e.clientY - last.current.y) * 1.6);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        id.current = null;
      }}
      onPointerCancel={() => {
        id.current = null;
      }}
    />
  );
}

export function TouchControls() {
  const [isTouch, setIsTouch] = useState(false);
  const potions = useGame((s) => s.potions);
  const toggleInventory = useGame((s) => s.toggleInventory);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!isTouch) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <LookPad />
      <Joystick />
      <div className="pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.75rem,env(safe-area-inset-right))] flex flex-col items-end gap-3">
        <div className="flex gap-3">
          <TouchButton label="Bag" size="h-12 w-12" onPress={() => toggleInventory()} />
          <TouchButton
            label={`Heal ${potions}`}
            size="h-12 w-12"
            onPress={() => {
              input.healQueued = true;
            }}
          />
        </div>
        <div className="flex items-end gap-3">
          <TouchButton
            label="Talk"
            size="h-14 w-14"
            onPress={() => {
              input.interactQueued = true;
            }}
          />
          <TouchButton
            label="Jump"
            size="h-16 w-16"
            onPress={() => {
              input.jumpQueued = true;
            }}
          />
          <TouchButton
            label="Attack"
            size="h-24 w-24"
            className="!text-sm"
            onPress={() => {
              input.attackQueued = true;
            }}
          />
        </div>
      </div>
    </div>
  );
}
