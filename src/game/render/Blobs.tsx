import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ITEMS, RARITY_COLOR } from "../data/items";
import { useGame } from "../core/store";
import { world } from "../core/sim";
import { enemyDef } from "../data/enemies";
import { remotes } from "../online/presence";
import { NPCS } from "../world/layout";
import { heightAt } from "../world/terrain";

/** Soft round shadow, drawn once. */
let blobTexture: THREE.CanvasTexture | null = null;
function blob() {
  if (blobTexture || typeof document === "undefined") return blobTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.5)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.32)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTexture = new THREE.CanvasTexture(c);
  return blobTexture;
}

const MAX_REMOTES = 16;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Soft blob shadows under every character, for Low graphics where real
 * shadows are off (so heroes don't float above the ground). One instanced
 * draw call for everyone.
 */
export function BlobShadows() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 1 + world.enemies.length + NPCS.length + MAX_REMOTES;
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }),
    [],
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let i = 0;
    const place = (x: number, y: number, z: number, size: number) => {
      // Shrinks as the character rises (jumps), like a real shadow.
      const lift = Math.max(0, y - heightAt(x, z));
      const k = size * Math.max(0.45, 1 - lift * 0.18);
      _p.set(x, heightAt(x, z) + 0.06, z);
      _s.set(k, k, k);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i++, _m);
    };
    const p = world.player;
    if (!(p.dead && p.deathTimer > 4)) place(p.x, p.y, p.z, 1.6);
    else mesh.setMatrixAt(i++, HIDDEN);
    for (const e of world.enemies) {
      if (e.phase === "dead") mesh.setMatrixAt(i++, HIDDEN);
      else place(e.x, e.y, e.z, enemyDef(e.type).scale * 0.75);
    }
    for (const n of NPCS) place(n.x, heightAt(n.x, n.z), n.z, 1.5);
    let r = 0;
    for (const rp of remotes.values()) {
      if (r++ >= MAX_REMOTES) break;
      if (rp.placed) place(rp.rx, rp.ry, rp.rz, 1.6);
      else mesh.setMatrixAt(i++, HIDDEN);
    }
    while (i < count) mesh.setMatrixAt(i++, HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, count]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}

/** A faint gold ring under the hero, so you can always find yourself in a fight. */
export function HeroRing() {
  const ref = useRef<THREE.Mesh>(null);
  // Your weapon's rarity shows under your feet: rare and better glow.
  const rarity = useGame((g) => (g.equipped.weapon ? ITEMS[g.equipped.weapon.itemId]?.rarity : undefined));
  const rare = rarity === "rare" || rarity === "epic";
  const ringColor = rarity && rarity !== "common" ? RARITY_COLOR[rarity] : "#ffe3a0";
  const geometry = useMemo(() => new THREE.RingGeometry(0.72, 0.9, 40).rotateX(-Math.PI / 2), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const p = world.player;
    m.visible = !p.dead && p.grounded;
    m.position.set(p.x, heightAt(p.x, p.z) + 0.07, p.z);
  });
  return (
    <mesh ref={ref} geometry={geometry} renderOrder={3}>
      <meshBasicMaterial
        color={ringColor}
        transparent
        opacity={rare ? 0.62 : 0.4}
        depthWrite={false}
        blending={rare ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </mesh>
  );
}
