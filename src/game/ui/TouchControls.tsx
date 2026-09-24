import { useEffect, useRef, useState } from "react";
import { applyLook, input, setSprintTouch, touch } from "../core/input";
import { useGame } from "../core/store";
import { ABILITIES } from "../data/combat";
import { CombatStates, CooldownSweep, SlotIcon, useUnlocked, type SlotId } from "./Cooldowns";

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

function ArcButton({
  id,
  label,
  angle,
  radius,
  onPress,
}: {
  id: SlotId | "jump";
  label: string;
  angle: number;
  radius: number;
  onPress: () => void;
}) {
  // Positioned on an arc around the attack button's centre.
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;
  return (
    <button
      aria-label={label}
      data-testid={`touch-${id}`}
      style={{ transform: `translate(calc(${x}px - 50%), calc(${-y}px - 50%))` }}
      className="pointer-events-auto absolute left-1/2 top-1/2 flex h-[3.6rem] w-[3.6rem] touch-none flex-col items-center justify-center overflow-hidden rounded-full border border-[var(--gilt)]/45 bg-[var(--panel)]/75 text-[var(--parchment)] active:bg-[var(--gilt)]/35"
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {id === "jump" ? (
        <span className="text-[11px] font-semibold uppercase tracking-wider">Jump</span>
      ) : (
        <>
          <SlotIcon id={id} className="h-5 w-5" />
          <span className="text-[8px] font-semibold uppercase tracking-wide">{label}</span>
          <CooldownSweep id={id} />
        </>
      )}
    </button>
  );
}

export function TouchControls() {
  const [isTouch, setIsTouch] = useState(false);
  const potions = useGame((s) => s.potions);
  const prompt = useGame((s) => s.interactPrompt);
  const toggleInventory = useGame((s) => s.toggleInventory);
  const unlocked = useUnlocked();

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!isTouch) return null;

  // Arc from straight left (180°) sweeping up to near-vertical (100°).
  const arc: Array<{ id: SlotId | "jump"; label: string; press: () => void }> = [
    { id: "jump", label: "Jump", press: () => (input.jumpQueued = true) },
    { id: "dodge", label: "Dodge", press: () => (input.dodgeQueued = true) },
    ...ABILITIES.map((a, i) => ({ id: a.id as SlotId, label: a.name.split(" ")[0]!, press: () => (input.abilityQueued = i), on: unlocked[i] }))
      .filter((a) => a.on),
  ];
  const step = arc.length > 1 ? 80 / (arc.length - 1) : 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <LookPad />
      <Joystick />
      {/* Utility row, bottom centre, clear of both thumbs */}
      <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <CombatStates />
        <div className="flex gap-2">
          <TouchButton label="Bag" size="h-11 w-14 !rounded-xl" onPress={() => toggleInventory()} />
          <TouchButton label={`Heal ${potions}`} size="h-11 w-14 !rounded-xl" onPress={() => (input.healQueued = true)} />
          {prompt?.startsWith("Speak") && (
            <TouchButton label="Talk" size="h-11 w-14 !rounded-xl" className="border-[var(--gilt)]" onPress={() => (input.interactQueued = true)} />
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] h-24 w-24">
        <TouchButton
          label="Attack"
          size="h-24 w-24"
          className="!text-sm"
          onPress={() => {
            input.attackQueued = true;
          }}
        />
        {arc.map((b, i) => (
          <ArcButton key={b.id} id={b.id} label={b.label} angle={180 - step * i} radius={98} onPress={b.press} />
        ))}
      </div>
    </div>
  );
}
