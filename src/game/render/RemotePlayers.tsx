import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ARCHETYPES, type ArchetypeId } from "../data/archetypes";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { onlineConfigured } from "../online/client";
import {
  MAX_SHOWN,
  isAway,
  nearestIds,
  remotes,
  sendPosition,
  stepRemotes,
  usePresence,
} from "../online/presence";
import { CLIP_SPEED, useAnimator, useCharacter } from "./Characters";

const _v = new THREE.Vector3();

/** Other players in the world, plus their name tags. Renders nothing offline. */
export function RemotePlayers() {
  if (!onlineConfigured) return null;
  return <RemotePlayersOnline />;
}

function RemotePlayersOnline() {
  const ids = usePresence((s) => s.ids);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const labels = useRef<HTMLSpanElement[]>([]);
  const shown = useRef<string[]>([]);
  const pick = useRef(0);

  // Name tags: one overlay with reusable spans (like the damage numbers).
  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return undefined;
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3";
    const spans: HTMLSpanElement[] = [];
    for (let i = 0; i < MAX_SHOWN; i++) {
      const el = document.createElement("span");
      el.className = "font-display";
      el.style.cssText =
        "position:absolute;left:0;top:0;display:none;white-space:nowrap;font-size:12px;font-weight:600;" +
        "color:#e9f2ff;text-shadow:0 1px 3px rgba(0,0,0,.9);will-change:transform";
      layer.appendChild(el);
      spans.push(el);
    }
    host.appendChild(layer);
    labels.current = spans;
    return () => {
      layer.remove();
      labels.current = [];
    };
  }, [gl]);

  useFrame((_, dt) => {
    const now = Date.now();
    const p = world.player;
    if (useGame.getState().screen === "playing") {
      sendPosition({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, a: p.anim }, now);
    }
    stepRemotes(remotes, dt);

    // Re-pick who to draw twice a second (nearest first).
    pick.current += dt;
    if (pick.current > 0.5) {
      pick.current = 0;
      // "id|class": a class change remounts that player's model.
      const next = nearestIds(remotes, p.x, p.z).map(
        (id) => `${id}|${remotes.get(id)?.archetype ?? ""}`,
      );
      if (next.join() !== shown.current.join()) {
        shown.current = next;
        usePresence.setState({ ids: next });
      }
    }

    const spans = labels.current;
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i]!;
      const r = remotes.get((shown.current[i] ?? "").split("|")[0]!);
      if (!r || !r.placed) {
        if (el.style.display !== "none") el.style.display = "none";
        continue;
      }
      _v.set(r.rx, r.ry + 2.6, r.rz).project(camera);
      const dist = Math.hypot(r.rx - camera.position.x, r.rz - camera.position.z);
      if (_v.z > 1 || dist > 60) {
        el.style.display = "none";
        continue;
      }
      const text = `${r.name || "…"} · ${r.level}${isAway(r, now) ? " (away)" : ""}`;
      if (el.textContent !== text) el.textContent = text;
      el.style.display = "block";
      el.style.opacity = dist > 40 ? String(1 - (dist - 40) / 20) : "1";
      const x = (_v.x * 0.5 + 0.5) * size.width;
      const y = (-_v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
    }
  });

  return (
    <>
      {ids.map((key) => (
        <RemotePlayerSlot key={key} id={key.split("|")[0]!} />
      ))}
    </>
  );
}

/** Remounts the model when that player changes class. */
function RemotePlayerSlot({ id }: { id: string }) {
  const archetype = (remotes.get(id)?.archetype ?? "vanguard") as ArchetypeId;
  const def = ARCHETYPES[archetype] ?? ARCHETYPES.vanguard;
  return <RemotePlayerView key={def.id} id={id} url={def.model} />;
}

function RemotePlayerView({ id, url }: { id: string; url: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations, rig } = useCharacter(url);
  const { play, update } = useAnimator(group, animations, rig);

  useFrame((_, dt) => {
    const g = group.current;
    const r = remotes.get(id);
    if (!g) return;
    if (!r || !r.placed) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(r.rx, r.ry, r.rz);
    g.rotation.y = r.ryaw;
    const anim = isAway(r, Date.now()) ? "idle" : r.anim;
    play(anim, CLIP_SPEED[anim] ?? 1);
    update(dt);
  });

  return (
    <group ref={group} visible={false}>
      <group scale={2.15 * rig.scale}>
        <primitive object={scene} />
      </group>
    </group>
  );
}
