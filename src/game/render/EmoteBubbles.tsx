import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { world } from "../core/sim";
import type { EmoteId } from "../data/emotes";
import { remotes } from "../online/presence";

// Emotes are subtle from the high camera, so a small bubble above the head
// says what's happening, for you and for other players (their emote arrives
// as their animation over the live channel).

const ICON: Record<EmoteId, string> = { wave: "👋", cheer: "🎉", sit: "☕" };
const MAX_REMOTES = 16;

function bubbleTexture(icon: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,248,232,0.95)";
  g.strokeStyle = "rgba(60,36,18,0.9)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 58, 48, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // little tail pointing down at the character
  g.beginPath();
  g.moveTo(52, 100);
  g.lineTo(64, 124);
  g.lineTo(76, 100);
  g.closePath();
  g.fill();
  g.font = "60px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(icon, 64, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const emoteOf = (anim: string): EmoteId | null => {
  const id = anim.startsWith("emote-") ? anim.slice(6) : "";
  return id === "wave" || id === "cheer" || id === "sit" ? id : null;
};

export function EmoteBubbles() {
  const materials = useMemo(() => {
    if (typeof document === "undefined") return null;
    return Object.fromEntries(
      (Object.keys(ICON) as EmoteId[]).map((id) => [
        id,
        new THREE.SpriteMaterial({
          map: bubbleTexture(ICON[id]),
          depthTest: false,
          transparent: true,
        }),
      ]),
    ) as Record<EmoteId, THREE.SpriteMaterial>;
  }, []);
  const sprites = useRef<Array<THREE.Sprite | null>>([]);

  useFrame(({ clock }) => {
    if (!materials) return;
    const bob = Math.sin(clock.elapsedTime * 4) * 0.08;
    let i = 0;
    const show = (x: number, y: number, z: number, id: EmoteId | null) => {
      const s = sprites.current[i++];
      if (!s) return;
      s.visible = !!id;
      if (!id) return;
      s.material = materials[id];
      s.position.set(x, y + 2.9 + bob, z);
    };
    const p = world.player;
    show(p.x, p.y, p.z, p.dead ? null : emoteOf(p.anim));
    let n = 0;
    for (const r of remotes.values()) {
      if (n++ >= MAX_REMOTES) break;
      show(r.rx, r.ry, r.rz, r.placed ? emoteOf(r.anim) : null);
    }
    while (i <= MAX_REMOTES) show(0, 0, 0, null);
  });

  return (
    <>
      {Array.from({ length: MAX_REMOTES + 1 }).map((_, i) => (
        <sprite
          key={i}
          visible={false}
          scale={1.1}
          renderOrder={10}
          ref={(el) => {
            sprites.current[i] = el;
          }}
        />
      ))}
    </>
  );
}
