import { useEffect, useRef, useState } from "react";
import { applyLook, input, setSprintTouch, touch } from "../core/input";
import { useSettings } from "../core/settings";
import { useGame } from "../core/store";
import { CombatStates, CooldownSweep, SlotIcon, useAbilitySlots, type SlotId } from "./Cooldowns";
import { EmotePicker } from "./Emotes";
import { THREAT_DOT, usePortrait, useThreatened } from "./layout";
import { useAccount } from "../online/account";
import { togglePartyPanel } from "./Party";

const KNOB = 52;
const BASE = 128;
/** Knob travel from the centre at full deflection. */
const TRAVEL = 56;

/**
 * Left-thumb movement stick. Floating (default): the stick appears wherever the
 * thumb lands in the left half of the screen, so there's no small target to hunt
 * for. Fixed: only the resting stick in the corner responds.
 */
function Joystick({
  floating,
  zone: zoneClass,
  size,
  opacity,
  right,
}: {
  floating: boolean;
  zone: string;
  /** Size multiplier. */
  size: number;
  /** Opacity at rest (full while held). */
  opacity: number;
  /** Rest in the bottom-right corner (left-handed layout). */
  right: boolean;
}) {
  const BASE_PX = BASE * size;
  const KNOB_PX = KNOB * size;
  const TRAVEL_PX = TRAVEL * size;
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const set = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy);
    const clamped = len > TRAVEL_PX ? TRAVEL_PX / len : 1;
    const kx = dx * clamped;
    const ky = dy * clamped;
    if (knob.current) knob.current.style.transform = `translate(${kx}px, ${ky}px)`;
    touch.moveX = kx / TRAVEL_PX;
    touch.moveZ = -ky / TRAVEL_PX;
    setSprintTouch(Math.hypot(kx, ky) / TRAVEL_PX > 0.85);
  };

  /** Move the stick's centre to a point in zone coordinates (null = back to its resting spot). */
  const placeBase = (x: number | null, y: number | null) => {
    const el = base.current;
    const z = zone.current;
    if (!el || !z) return;
    el.style.transform = "";
    if (x === null || y === null) {
      el.style.opacity = String(opacity);
      return;
    }
    const rest = el.getBoundingClientRect();
    const zr = z.getBoundingClientRect();
    const dx = x - (rest.left - zr.left + rest.width / 2);
    const dy = y - (rest.top - zr.top + rest.height / 2);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.opacity = "1";
  };

  const release = (e: React.PointerEvent) => {
    if (id.current !== e.pointerId) return;
    id.current = null;
    set(0, 0);
    setSprintTouch(false);
    placeBase(null, null);
  };

  return (
    <div
      ref={zone}
      // Floating: a whole zone (left half, or lower left when upright) is the stick's touch area.
      className={`absolute touch-none ${floating ? `pointer-events-auto ${zoneClass}` : "pointer-events-none inset-0"}`}
      onPointerDown={(e) => {
        if (id.current !== null) return; // a second thumb must not steal the stick
        if (!floating && !base.current!.contains(e.target as Node)) return;
        id.current = e.pointerId;
        (floating ? (e.currentTarget as HTMLElement) : base.current!).setPointerCapture(
          e.pointerId,
        );
        if (floating) {
          const z = zone.current!.getBoundingClientRect();
          // Keep the whole stick on screen even when the thumb lands at an edge.
          const x = Math.max(BASE_PX / 2, Math.min(z.width - BASE_PX / 2, e.clientX - z.left));
          const y = Math.max(BASE_PX / 2, Math.min(z.height - BASE_PX / 2, e.clientY - z.top));
          placeBase(x, y);
          origin.current = { x: x + z.left, y: y + z.top };
        } else {
          const rect = base.current!.getBoundingClientRect();
          origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        set(e.clientX - origin.current.x, e.clientY - origin.current.y);
      }}
      onPointerMove={(e) => {
        if (id.current !== e.pointerId) return;
        set(e.clientX - origin.current.x, e.clientY - origin.current.y);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        ref={base}
        style={{ width: BASE_PX, height: BASE_PX, opacity }}
        className={`pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] ${
          right
            ? "right-[max(1.75rem,env(safe-area-inset-right))]"
            : "left-[max(1.75rem,env(safe-area-inset-left))]"
        } flex items-center justify-center rounded-full border border-[var(--gilt)]/30 bg-[var(--panel)]/40 transition-opacity`}
      >
        <div
          ref={knob}
          style={{ width: KNOB_PX, height: KNOB_PX }}
          className="rounded-full border border-[var(--gilt)]/50 bg-[var(--gilt)]/30"
        />
      </div>
    </div>
  );
}

function TouchButton({
  label,
  onPress,
  onRelease,
  size = "h-16 w-16",
  className = "",
}: {
  label: string;
  onPress: () => void;
  /** Called when the finger lifts (or is cancelled) after a press on this button. */
  onRelease?: () => void;
  size?: string;
  className?: string;
}) {
  return (
    <button
      className={`pointer-events-auto touch-none rounded-full border border-[var(--gilt)]/40 bg-[var(--panel)]/70 text-xs font-semibold uppercase tracking-wider text-[var(--parchment)] active:bg-[var(--gilt)]/35 ${size} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        // Capture so the release is seen even if the thumb slides off the button.
        if (onRelease) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onPress();
      }}
      // Fires on lift, cancel, or if the browser drops the capture for any reason.
      onLostPointerCapture={onRelease}
    >
      {label}
    </button>
  );
}

/** Drag-to-look surface covering the half of the screen away from the stick. */
function LookPad({ left }: { left: boolean }) {
  const id = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  return (
    <div
      className={`pointer-events-auto absolute inset-y-0 w-1/2 touch-none ${left ? "left-0" : "right-0"}`}
      onPointerDown={(e) => {
        if (id.current !== null) return;
        id.current = e.pointerId;
        // Capture so the release is seen even if the finger slides off the pad.
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (id.current !== e.pointerId) return;
        applyLook((e.clientX - last.current.x) * 1.6, (e.clientY - last.current.y) * 1.6);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (id.current === e.pointerId) id.current = null;
      }}
      onPointerCancel={(e) => {
        if (id.current === e.pointerId) id.current = null;
      }}
    />
  );
}

function ArcButton({
  id,
  label,
  angle,
  radius,
  small = false,
  onPress,
}: {
  small?: boolean;
  id: SlotId | "jump" | "target" | "heal";
  label: string;
  angle: number;
  radius: number;
  onPress: () => void;
}) {
  const size = small ? "h-[3.2rem] w-[3.2rem]" : "h-[3.6rem] w-[3.6rem]";
  // Positioned on an arc around the attack button's centre.
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;
  return (
    <button
      aria-label={label}
      data-testid={`touch-${id}`}
      style={{ transform: `translate(calc(${x}px - 50%), calc(${-y}px - 50%))` }}
      className={`pointer-events-auto absolute left-1/2 top-1/2 flex ${size} touch-none flex-col items-center justify-center overflow-hidden rounded-full border border-[var(--gilt)]/45 bg-[var(--panel)]/75 text-[var(--parchment)] active:bg-[var(--gilt)]/35`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {id === "jump" ? (
        <span className="text-[11px] font-semibold uppercase tracking-wider">Jump</span>
      ) : id === "heal" ? (
        <>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 3h6M10 3v4.5L6.5 13a5.5 5.5 0 1 0 11 0L14 7.5V3" />
            <path d="M8 14h8" />
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
        </>
      ) : id === "target" ? (
        <>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="7" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-wide">Target</span>
        </>
      ) : (
        <>
          <SlotIcon id={id} className="h-5 w-5" />
          {/* Long names ("Emberburst") shrink to fit the round button. */}
          <span
            className={`font-semibold uppercase ${label.length > 7 ? "text-[7.5px] tracking-normal" : "text-[9px] tracking-wide"}`}
          >
            {label}
          </span>
          <CooldownSweep id={id} />
        </>
      )}
    </button>
  );
}

/** The interact button's label for a prompt, or null when there's nothing to press. */
export function interactLabel(prompt: string | null) {
  if (!prompt || !/^(Speak|Climb the|Open)/.test(prompt)) return null;
  return prompt.startsWith("Climb") ? "Climb" : prompt.startsWith("Open") ? "Open" : "Talk";
}

export function TouchControls() {
  const [isTouch, setIsTouch] = useState(false);
  const potions = useGame((s) => s.potions);
  const prompt = useGame((s) => s.interactPrompt);
  const toggleInventory = useGame((s) => s.toggleInventory);
  const slots = useAbilitySlots();
  const floatingStick = useSettings((s) => s.floatingStick);
  const orbit = useSettings((s) => s.camera === "behind");
  const stickSize = useSettings((s) => s.stickSize);
  const stickOpacity = useSettings((s) => s.stickOpacity);
  const lefty = useSettings((s) => s.leftHanded);
  const portrait = usePortrait();
  const threat = useThreatened();
  const signedIn = useAccount((a) => a.status === "signed-in");
  /** Left-handed: everything mirrored left to right. */
  const ang = (a: number) => (lefty ? 180 - a : a);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!isTouch) return null;

  // Two rings around Attack: Jump + Dodge close in, abilities on an outer arc
  // that only fills as they unlock — so thumbs never hunt for small targets.
  const abilities = slots
    .filter((a) => a.unlocked)
    .map((a) => ({ id: a.id as SlotId, label: a.def.name.split(" ").pop()!, idx: a.index }));
  const interact = interactLabel(prompt);
  const attack = (
    <TouchButton
      label="Attack"
      size={portrait ? "h-[5.25rem] w-[5.25rem]" : "h-20 w-20"}
      className="!text-sm"
      onPress={() => {
        input.attackQueued = true;
        input.attackHeld = true;
      }}
      onRelease={() => {
        input.attackHeld = false;
      }}
    />
  );

  if (portrait) {
    // Upright phone, one thumb each: the stick anywhere in the lower left, and
    // every combat action on rings around Attack in the lower right. Bag, Map
    // and Menu live in the HUD's top-right corner.
    const OUTER = [174, 148, 122];
    return (
      <div className="pointer-events-none fixed inset-0 z-20">
        {orbit && <LookPad left={lefty} />}
        <Joystick
          floating={floatingStick}
          zone={`bottom-0 h-[58%] w-[56%] ${lefty ? "right-0" : "left-0"}`}
          size={stickSize}
          opacity={stickOpacity}
          right={lefty}
        />
        <div
          className={`pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] h-[5.25rem] w-[5.25rem] ${
            lefty
              ? "left-[max(1.25rem,env(safe-area-inset-left))]"
              : "right-[max(1.25rem,env(safe-area-inset-right))]"
          }`}
        >
          {attack}
          <ArcButton
            id="jump"
            label="Jump"
            angle={ang(188)}
            radius={94}
            onPress={() => (input.jumpQueued = true)}
          />
          <ArcButton
            id="dodge"
            label="Dodge"
            angle={ang(140)}
            radius={94}
            onPress={() => (input.dodgeQueued = true)}
          />
          <ArcButton
            id="heal"
            label={`Heal ${potions}`}
            angle={ang(94)}
            radius={94}
            onPress={() => (input.healQueued = true)}
          />
          {abilities.map((a, i) => (
            <ArcButton
              key={a.id}
              id={a.id}
              label={a.label}
              small
              angle={ang(OUTER[i]!)}
              radius={160}
              onPress={() => (input.abilityQueued = a.idx)}
            />
          ))}
          <ArcButton
            id="target"
            label="Target"
            small
            angle={ang(98)}
            radius={160}
            onPress={() => (input.lockQueued = true)}
          />
          {interact && (
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(calc(-50% ${lefty ? "+" : "-"} 60px), calc(-50% - 222px))`,
              }}
            >
              <TouchButton
                label={interact}
                size="h-12 min-w-[5.5rem] px-4 !rounded-xl"
                className="border-[var(--gilt)] !bg-[var(--gilt)]/30"
                onPress={() => (input.interactQueued = true)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const OUTER = [178, 146, 114];
  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {orbit && <LookPad left={lefty} />}
      <Joystick
        floating={floatingStick}
        zone={`inset-y-0 w-1/2 ${lefty ? "right-0" : "left-0"}`}
        size={stickSize}
        opacity={stickOpacity}
        right={lefty}
      />
      {/* Utility row, bottom centre, clear of both thumbs */}
      <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <CombatStates />
        <div className="flex gap-2">
          <TouchButton
            label="Bag"
            size="h-11 w-14 !rounded-xl"
            className={threat ? `relative ${THREAT_DOT}` : ""}
            onPress={() => toggleInventory()}
          />
          <TouchButton
            label={`Heal ${potions}`}
            size="h-11 w-14 !rounded-xl"
            onPress={() => (input.healQueued = true)}
          />
          <TouchButton
            label="Map"
            size="h-11 w-14 !rounded-xl"
            className={threat ? `relative ${THREAT_DOT}` : ""}
            onPress={() => useGame.getState().toggleInventory(true, "map")}
          />
          {signedIn && (
            <TouchButton label="Party" size="h-11 w-14 !rounded-xl" onPress={() => togglePartyPanel()} />
          )}
          <TouchButton
            label="Menu"
            size="h-11 w-14 !rounded-xl"
            onPress={() => {
              useGame.getState().toggleInventory(false);
              useGame.setState({ screen: "paused" });
            }}
          />
          <EmotePicker
            buttonClass="pointer-events-auto h-11 w-14 touch-none rounded-xl border border-[var(--gilt)]/40 bg-[var(--panel)]/70 text-xs font-semibold uppercase tracking-wider text-[var(--parchment)] active:bg-[var(--gilt)]/35"
            openTo="up"
          />
          {interact && (
            <TouchButton
              label={interact}
              size="h-11 w-14 !rounded-xl"
              className="border-[var(--gilt)]"
              onPress={() => (input.interactQueued = true)}
            />
          )}
        </div>
      </div>
      <div
        className={`pointer-events-none absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] h-20 w-20 ${
          lefty
            ? "left-[max(1.25rem,env(safe-area-inset-left))]"
            : "right-[max(1.25rem,env(safe-area-inset-right))]"
        }`}
      >
        {attack}
        <ArcButton
          id="jump"
          label="Jump"
          angle={ang(192)}
          radius={90}
          onPress={() => (input.jumpQueued = true)}
        />
        <ArcButton
          id="dodge"
          label="Dodge"
          angle={ang(138)}
          radius={90}
          onPress={() => (input.dodgeQueued = true)}
        />
        <ArcButton
          id="target"
          label="Target"
          small
          angle={ang(84)}
          radius={92}
          onPress={() => (input.lockQueued = true)}
        />
        {abilities.map((a, i) => (
          <ArcButton
            key={a.id}
            id={a.id}
            label={a.label}
            small
            angle={ang(OUTER[i]!)}
            radius={150}
            onPress={() => (input.abilityQueued = a.idx)}
          />
        ))}
      </div>
    </div>
  );
}
