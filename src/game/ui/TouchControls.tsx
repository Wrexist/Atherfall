import { useEffect, useRef, useState } from "react";
import { applyLook, input, setSprintTouch, touch } from "../core/input";
import { useSettings } from "../core/settings";
import { useGame } from "../core/store";
import { CombatStates, CooldownSweep, SlotIcon, useAbilitySlots, type SlotId } from "./Cooldowns";
import { EmotePicker } from "./Emotes";
import { THREAT_DOT, useEnemiesNear, usePortrait, useThreatened } from "./layout";
import { useCoach } from "./Tips";
import { useAccount } from "../online/account";
import { togglePartyPanel } from "./Party";
import { Glyph } from "./kit";

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
        style={{ width: BASE_PX, height: BASE_PX, opacity: Math.max(0.85, opacity) }}
        className={`pointer-events-auto absolute bottom-[max(4.25rem,calc(env(safe-area-inset-bottom)+3rem))] ${
          right
            ? "right-[max(1.75rem,env(safe-area-inset-right))]"
            : "left-[max(1.75rem,env(safe-area-inset-left))]"
        } flex items-center justify-center rounded-full border-2 border-white/35 bg-[radial-gradient(circle,rgba(20,31,51,0.4),rgba(11,19,32,0.6))] shadow-[inset_0_0_18px_rgba(0,0,0,0.35)] transition-opacity`}
      >
        {/* Direction marks, like a d-pad. */}
        {[0, 90, 180, 270].map((a) => (
          <span
            key={a}
            aria-hidden
            className="absolute left-1/2 top-1/2 h-0 w-0 border-x-[6px] border-b-[8px] border-x-transparent border-b-white/55"
            style={{ transform: `translate(-50%, -50%) rotate(${a}deg) translateY(-${BASE_PX / 2 - 12}px)` }}
          />
        ))}
        <div
          ref={knob}
          style={{ width: KNOB_PX, height: KNOB_PX }}
          className="rounded-full bg-[radial-gradient(circle_at_40%_30%,#ffffff,#c9d2de_60%,#8e99a8)] shadow-[0_4px_8px_rgba(0,0,0,0.45)] ring-2 ring-[#0b1320]/50"
        />
      </div>
    </div>
  );
}

const DISC =
  "bg-[radial-gradient(circle_at_50%_30%,#35507e,#152238_75%)] text-[var(--parchment)] ring-[3px] ring-[#8ea3c2]/60 shadow-[0_4px_0_rgba(0,0,0,0.45),inset_0_0_0_2px_rgba(11,19,32,0.8)] active:translate-y-px active:brightness-125";
/** Coaching glow on the control a tip is teaching. */
const COACH = "!ring-4 !ring-[var(--gilt)] animate-pulse";
const GOLD_DISC =
  "bg-[radial-gradient(circle_at_50%_30%,#2e4266,#111b2d_75%)] text-white ring-[5px] ring-[#e9b44c] shadow-[0_0_0_2px_#0b1320,0_5px_0_rgba(0,0,0,0.45),0_0_18px_rgba(233,180,76,0.45)] active:translate-y-px active:brightness-125";

function TouchButton({
  label,
  onPress,
  onRelease,
  size = "h-16 w-16",
  className = "",
  primary = false,
  icon,
  attention = false,
}: {
  label: string;
  onPress: () => void;
  /** Called when the finger lifts (or is cancelled) after a press on this button. */
  onRelease?: () => void;
  size?: string;
  className?: string;
  /** The big gold button (Attack). */
  primary?: boolean;
  icon?: React.ReactNode;
  attention?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={`pointer-events-auto flex touch-none flex-col items-center justify-center rounded-full text-xs font-black uppercase tracking-wide ${
        primary ? GOLD_DISC : `${DISC} text-outline`
      } ${attention ? COACH : ""} ${size} ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        // Capture so the release is seen even if the thumb slides off the button.
        if (onRelease) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onPress();
      }}
      // Fires on lift, cancel, or if the browser drops the capture for any reason.
      onLostPointerCapture={onRelease}
    >
      {icon}
      <span className={icon ? "mt-0.5 text-[10px] leading-none" : ""}>{label}</span>
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
  tiny = false,
  attention = false,
  count,
  onPress,
}: {
  /** A small number badge (potions left). */
  count?: number;
  small?: boolean;
  /** Tertiary (Jump): smallest, still a 44px target. */
  tiny?: boolean;
  /** Coaching: glow until the player uses it. */
  attention?: boolean;
  id: SlotId | "jump" | "target" | "heal";
  label: string;
  angle: number;
  radius: number;
  onPress: () => void;
}) {
  const size = tiny ? "h-[3.25rem] w-[3.25rem]" : small ? "h-[3.4rem] w-[3.4rem]" : "h-[3.75rem] w-[3.75rem]";
  // Positioned on an arc around the attack button's centre.
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;
  return (
    <button
      aria-label={label}
      data-testid={`touch-${id}`}
      style={{ transform: `translate(calc(${x}px - 50%), calc(${-y}px - 50%))` }}
      className={`pointer-events-auto absolute left-1/2 top-1/2 flex ${size} touch-none flex-col items-center justify-center rounded-full ${DISC} ${attention ? COACH : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {id === "jump" || id === "heal" || id === "target" || id === "dodge" ? (
        <>
          <Glyph
            id={id === "jump" ? "up" : id === "heal" ? "potion" : id === "target" ? "crosshair" : "swoosh"}
            className="h-6 w-6"
          />
          <span className="mt-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-outline">
            {id === "heal" ? "Heal" : label}
          </span>
          {count !== undefined && (
            <span className="absolute right-1 top-1 font-display text-sm leading-none text-white text-outline">
              {count}
            </span>
          )}
          {id === "dodge" && <CooldownSweep id="dodge" />}
        </>
      ) : (
        <>
          <SlotIcon id={id} className="h-5 w-5" />
          {/* Long names ("Emberburst") shrink to fit the round button. */}
          <span
            className={`font-black uppercase text-outline ${label.length > 7 ? "text-[7.5px] tracking-normal" : "text-[9px] tracking-wide"}`}
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
  const near = useEnemiesNear();
  const coach = useCoach((c) => c.tip);
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
      primary
      attention={coach === "attack"}
      icon={<Glyph id="sword" className={portrait ? "h-10 w-10" : "h-9 w-9"} />}
      size={portrait ? "h-[5.75rem] w-[5.75rem]" : "h-[5.25rem] w-[5.25rem]"}
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
    const OUTER = [182, 160, 138];
    return (
      <div className="pointer-events-none fixed inset-0 z-20">
        {/* One combat cluster: a soft shade gathers the buttons around Attack. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute bottom-0 h-[17rem] w-[17rem] ${lefty ? "left-0" : "right-0"}`}
          style={{
            background: `radial-gradient(circle at ${lefty ? "0%" : "100%"} 100%, rgba(11,19,32,0.42) 0%, rgba(11,19,32,0.18) 45%, transparent 70%)`,
          }}
        />
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
            tiny
            angle={ang(200)}
            radius={84}
            onPress={() => (input.jumpQueued = true)}
          />
          <ArcButton
            id="dodge"
            label="Dodge"
            attention={coach === "dodge"}
            angle={ang(153)}
            radius={92}
            onPress={() => (input.dodgeQueued = true)}
          />
          <ArcButton
            id="heal"
            label={`Heal ${potions}`}
            count={potions}
            attention={coach === "heal"}
            angle={ang(110)}
            radius={92}
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
            attention={near && coach === "attack"}
            angle={ang(72)}
            radius={112}
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
