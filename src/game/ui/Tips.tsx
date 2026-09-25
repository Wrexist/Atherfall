import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { input } from "../core/input";
import { useSettings } from "../core/settings";
import { world } from "../core/sim";
import { statsFor, useGame } from "../core/store";
import { create } from "zustand";

/** The tip on screen, so the control it teaches can light up. */
export const useCoach = create<{ tip: string | null }>(() => ({ tip: null }));

/**
 * First-run coaching: one short tip at a time, shown only when it's relevant
 * and cleared by *doing* the thing (or tapping ×). Progress is kept per device,
 * so a returning player never sees a tip twice.
 */
interface Tip {
  id: string;
  touch: string;
  desk: string;
  /** Show now? Checked a few times a second. */
  when: (ctx: TipCtx) => boolean;
  /** Has the player done it? Marks the tip learned. */
  done: (ctx: TipCtx) => boolean;
  /** Situational (a fight is on): takes over from a basic tip, which returns later. */
  urgent?: boolean;
}

interface TipCtx {
  moved: number;
  turned: number;
  swings: number;
  dodged: boolean;
  healed: boolean;
  threatened: boolean;
  telegraph: boolean;
  lowHp: boolean;
  talked: boolean;
}

const TIPS: Tip[] = [
  {
    id: "move",
    touch: "Drag here to move",
    desk: "Walk with W A S D — hold Shift to sprint.",
    when: () => true,
    done: (c) => c.moved > 4,
  },
  {
    id: "look",
    touch: "Drag on the right side of the screen to look around.",
    desk: "Click the game, then move the mouse to look around.",
    // The top view has a fixed camera: nothing to learn.
    when: () => useSettings.getState().camera === "behind",
    done: (c) => c.turned > 0.9,
  },
  {
    id: "talk",
    touch: "Walk to Warden Sela at the fountain, then tap Talk",
    desk: "Warden Sela waits by the fountain — walk up and press E.",
    when: () => true,
    done: (c) => c.talked,
  },
  {
    id: "attack",
    urgent: true,
    touch: "Attack! Hold to keep swinging",
    desk: "Enemy! Click to attack — hold to keep swinging.",
    when: (c) => c.threatened,
    done: (c) => c.swings >= 3,
  },
  {
    id: "dodge",
    urgent: true,
    touch: "Red on the ground? Dodge!",
    desk: "Red on the ground means a hit is coming — press F or right-click to dodge.",
    when: (c) => c.telegraph,
    done: (c) => c.dodged,
  },
  {
    id: "heal",
    urgent: true,
    touch: "Low health: Heal",
    desk: "Health is low — press Q to drink a Sunbloom Draught.",
    when: (c) => c.lowHp,
    done: (c) => c.healed,
  },
];

/** Where each tip sits on an upright touch screen: next to its control. */
const TOUCH_ANCHOR: Record<string, string> = {
  move: "left-3 bottom-[12.75rem] !max-w-[10rem]",
  // Fight tips sit under the quest card, clear of the hero and the buttons;
  // the control they teach glows.
  attack: "left-3 top-[10.5rem]",
  dodge: "left-3 top-[10.5rem]",
  heal: "left-3 top-[10.5rem]",
  talk: "left-1/2 top-[28%] -translate-x-1/2",
};

/**
 * A tip's anchor for left-handed controls: side classes swap (left-3 becomes
 * right-3); centred tips (left-1/2) stay put.
 */
export function mirrorAnchor(classes: string) {
  return classes
    .split(" ")
    .map((c) => {
      if (c === "left-1/2") return c;
      if (c.startsWith("left-")) return `right-${c.slice(5)}`;
      if (c.startsWith("right-")) return `left-${c.slice(6)}`;
      return c;
    })
    .join(" ");
}

export function Tips() {
  const learned = useSettings((s) => s.tipsDone);
  const update = useSettings((s) => s.update);
  const [active, setActive] = useState<Tip | null>(null);
  const current = useRef<Tip | null>(null);
  const show = (t: Tip | null) => {
    current.current = t;
    setActive(t);
    useCoach.setState({ tip: t?.id ?? null });
  };
  const touch = useRef(false);
  // Baselines, so progress counts from when a tip first appears.
  const base = useRef({ x: 0, z: 0, yaw: 0, swings: 0, potions: 0, dodges: 0, set: false });
  const dodges = useRef(0);

  useEffect(() => {
    touch.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);

  const allLearned = TIPS.every((t) => learned.includes(t.id));
  useEffect(() => {
    if (allLearned) return undefined;
    let lastDodge = false;
    const iv = setInterval(() => {
      const g = useGame.getState();
      if (g.screen !== "playing" || g.inventoryOpen) return;
      const p = world.player;
      // Count dodges as they start (dodgeIframe rises from 0).
      const dodging = p.dodgeIframe > 0;
      if (dodging && !lastDodge) dodges.current += 1;
      lastDodge = dodging;
      const b = base.current;
      if (!b.set) {
        Object.assign(b, {
          x: p.x,
          z: p.z,
          yaw: input.yaw,
          swings: world.stats.swings,
          potions: g.potions,
          set: true,
        });
      }
      const ctx: TipCtx = {
        moved: Math.hypot(p.x - b.x, p.z - b.z),
        turned: Math.abs(input.yaw - b.yaw),
        swings: world.stats.swings - b.swings,
        dodged: dodges.current > b.dodges,
        healed: g.potions < b.potions,
        threatened: world.enemies.some((e) => e.aggro && e.phase !== "dead"),
        telegraph: world.enemies.some((e) => e.phase === "windup"),
        lowHp: g.hp < statsFor(g).maxHp * 0.5 && g.potions > 0,
        talked: !!g.dialogue || g.questStep > 0 || g.questIdx > 0,
      };
      const done = useSettings.getState().tipsDone;
      const learn = (id: string) => update({ tipsDone: [...done, id] });
      const cur = current.current;
      if (cur && cur.done(ctx)) {
        learn(cur.id);
        show(null);
        return;
      }
      const urgent = TIPS.find((t) => t.urgent && !done.includes(t.id) && t !== cur && t.when(ctx));
      if (cur && !(urgent && !cur.urgent)) return;
      const next = cur ? urgent : TIPS.find((t) => !done.includes(t.id) && t.when(ctx));
      if (!next) return;
      // Already done before we asked (e.g. talked to Sela while another tip showed)? Skip it.
      if (next.done({ ...ctx, moved: 0, turned: 0, swings: 0, dodged: false, healed: false })) {
        learn(next.id);
        return;
      }
      // Fresh baseline: progress counts from when the tip appears.
      Object.assign(b, {
        x: p.x,
        z: p.z,
        yaw: input.yaw,
        swings: world.stats.swings,
        potions: g.potions,
        dodges: dodges.current,
      });
      show(next);
    }, 250);
    return () => clearInterval(iv);
  }, [allLearned, update]);

  useEffect(() => () => useCoach.setState({ tip: null }), []);
  if (!active) return null;
  // On touch the tip sits beside the control it teaches (the control glows too),
  // never over the middle of the screen.
  // Left-handed controls swap sides, so the tips follow their controls.
  const raw = touch.current ? TOUCH_ANCHOR[active.id] : undefined;
  const anchor = raw && useSettings.getState().leftHanded ? mirrorAnchor(raw) : raw;
  const bubble = (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-1.5 rounded-2xl bg-[var(--panel)]/92 py-1.5 pl-3 pr-1 text-[13px] font-extrabold leading-snug text-[var(--parchment)] shadow-[0_4px_0_rgba(0,0,0,0.35)] ring-2 ring-[var(--gilt)]/70 ${
        anchor ? `fixed z-[22] max-w-[15rem] ${anchor}` : "max-w-[min(22rem,80vw)]"
      }`}
    >
      <span className="flex-1">{touch.current ? active.touch : active.desk}</span>
      <button
        aria-label="Dismiss tip"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--parchment)]/70"
        onClick={() => {
          update({ tipsDone: [...useSettings.getState().tipsDone, active.id] });
          show(null);
        }}
      >
        ×
      </button>
    </div>
  );
  // Anchored tips sit above the touch controls' layer so × stays tappable.
  return anchor ? createPortal(bubble, document.getElementById("game-shell") ?? document.body) : bubble;
}
