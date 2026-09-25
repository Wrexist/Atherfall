import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { world } from "../core/sim";
import { LANTERNS } from "../world/layout";
import { heightAt } from "../world/terrain";

/**
 * Warm light without lights: soft additive sprites on the lantern posts and a
 * flickering fire at the forge. No shadow maps or per-pixel lights, so it costs
 * almost nothing on phones.
 */

/** Height of a lantern post's lamp above the ground (lantern_post at scale 0.85). */
const LAMP_Y = 2.25;
/** The forge fire by Oda's anvil (the campfire stones in the square). */
const FORGE = { x: 5.5, z: -6.5 };

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,240,200,1)");
  grad.addColorStop(0.25, "rgba(255,196,110,0.75)");
  grad.addColorStop(1, "rgba(255,150,60,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flameTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 96, 2, 32, 80, 60);
  grad.addColorStop(0, "rgba(255,250,210,1)");
  grad.addColorStop(0.3, "rgba(255,190,70,0.95)");
  grad.addColorStop(0.65, "rgba(240,90,30,0.6)");
  grad.addColorStop(1, "rgba(200,40,10,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(56, 50, 60, 90, 32, 124);
  g.bezierCurveTo(4, 90, 8, 50, 32, 4);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Glows() {
  const tex = useMemo(() => ({ glow: glowTexture(), flame: flameTexture() }), []);
  useEffect(() => () => void (tex.glow.dispose(), tex.flame.dispose()), [tex]);
  const lamps = useRef<THREE.Group>(null);
  const flames = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Lanterns glow a little by day and fully from dusk to dawn.
    const d = world.dayTime;
    const night = d > 0.45 && d < 0.95 ? 1 : d > 0.4 ? (d - 0.4) / 0.05 : 0.35;
    if (lamps.current) {
      lamps.current.children.forEach((s, i) => {
        const m = (s as THREE.Sprite).material;
        m.opacity = (0.45 + 0.55 * night) * (0.92 + Math.sin(t * 7 + i * 1.7) * 0.08);
      });
    }
    if (flames.current) {
      flames.current.children.forEach((s, i) => {
        const k = 1 + Math.sin(t * (11 + i * 3) + i) * 0.12 + Math.sin(t * 23 + i * 5) * 0.06;
        s.scale.set(0.55 * (1.1 - i * 0.2) * k, 1.0 * (1.1 - i * 0.18) * k, 1);
      });
    }
    if (halo.current) halo.current.material.opacity = 0.55 + Math.sin(t * 9) * 0.08;
  });

  const fy = heightAt(FORGE.x, FORGE.z);
  return (
    <group>
      <group ref={lamps}>
        {LANTERNS.map(([x, z], i) => (
          <sprite key={i} position={[x, heightAt(x, z) + LAMP_Y, z]} scale={[1.3, 1.3, 1]}>
            <spriteMaterial
              map={tex.glow}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        ))}
      </group>
      <group position={[FORGE.x, fy, FORGE.z]}>
        <sprite ref={halo} position={[0, 0.7, 0]} scale={[3.2, 3.2, 1]}>
          <spriteMaterial
            map={tex.glow}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
        <group ref={flames}>
          {[0, 1, 2].map((i) => (
            <sprite key={i} position={[(i - 1) * 0.18, 0.55 - i * 0.05, 0]}>
              <spriteMaterial
                map={tex.flame}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
          ))}
        </group>
      </group>
    </group>
  );
}
