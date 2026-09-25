import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { questTarget } from "../core/questTarget";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { heightAt } from "../world/terrain";

const _v = new THREE.Vector3();
/** Hide the marker once you're this close — the goal is right in front of you. */
const ARRIVED = 7;
/** Keep the edge arrow clear of the screen border and the HUD corners. */
const EDGE = 56;

/**
 * Quest guidance without opening the map: a gold marker with the distance over
 * the current goal, which slides to the screen edge and points the way when the
 * goal is off-screen or behind you. One DOM element, positioned per frame.
 */
export function QuestMarker() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const el = useRef<{ root: HTMLDivElement; arrow: HTMLDivElement; label: HTMLSpanElement } | null>(
    null,
  );
  const lastText = useRef("");
  const target = useRef<{ x: number; z: number } | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return undefined;
    const root = document.createElement("div");
    root.setAttribute("data-testid", "quest-marker");
    root.style.cssText =
      "position:absolute;left:0;top:0;z-index:4;pointer-events:none;display:none;will-change:transform;" +
      "flex-direction:column;align-items:center;gap:2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))";
    // A notched arrowhead (not a plain triangle, which looks the same every 120°).
    const arrow = document.createElement("div");
    arrow.style.cssText = "width:18px;height:22px";
    arrow.innerHTML =
      '<svg viewBox="0 0 18 22" width="18" height="22"><path d="M9 0 L18 22 L9 16 L0 22 Z" fill="#f3c969" stroke="#5a3d12" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    const label = document.createElement("span");
    label.className = "font-display";
    label.style.cssText = "font-size:12px;font-weight:700;color:#f7e6bf;letter-spacing:.06em";
    root.append(arrow, label);
    host.appendChild(root);
    el.current = { root, arrow, label };
    return () => {
      root.remove();
      el.current = null;
    };
  }, [gl]);

  useFrame(() => {
    const m = el.current;
    if (!m) return;
    const g = useGame.getState();
    // The target only moves when enemies do; a few lookups a second is plenty.
    if (tick.current++ % 6 === 0) target.current = questTarget();
    const t = target.current;
    const p = world.player;
    const dist = t ? Math.hypot(t.x - p.x, t.z - p.z) : 0;
    if (!t || g.screen !== "playing" || g.inventoryOpen || g.dialogue || dist < ARRIVED) {
      if (m.root.style.display !== "none") m.root.style.display = "none";
      return;
    }
    m.root.style.display = "flex";

    _v.set(t.x, heightAt(t.x, t.z) + 3, t.z).project(camera);
    const behind = _v.z > 1;
    let sx = (_v.x * 0.5 + 0.5) * size.width;
    let sy = (-_v.y * 0.5 + 0.5) * size.height;
    const onScreen =
      !behind && sx > EDGE && sx < size.width - EDGE && sy > EDGE && sy < size.height - EDGE;

    let angle = 180; // pointing down at the goal
    if (!onScreen) {
      // Direction from screen centre; flipped when the goal is behind the camera.
      const cx = size.width / 2;
      const cy = size.height / 2;
      let dx = sx - cx;
      let dy = sy - cy;
      if (behind) {
        dx = -dx;
        dy = -dy;
      }
      if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
      // Scale the direction until it touches the inset screen rectangle.
      const k = Math.min((cx - EDGE) / Math.abs(dx || 1e-6), (cy - EDGE) / Math.abs(dy || 1e-6));
      sx = cx + dx * k;
      sy = cy + dy * k;
      angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    }
    m.arrow.style.transform = `rotate(${angle.toFixed(0)}deg)`;
    const text = `${Math.round(dist)}m`;
    if (text !== lastText.current) m.label.textContent = lastText.current = text;
    m.root.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-50%)`;
  });

  return null;
}
