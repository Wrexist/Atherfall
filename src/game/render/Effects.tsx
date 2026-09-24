import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ITEMS, RARITY_COLOR } from "../data/items";
import { world, type Zone } from "../core/sim";
import { heightAt } from "../world/terrain";

const DROP_SLOTS = 24;
const SPARK_SLOTS = 24;

export function DropViews() {
  const groups = useRef<Array<THREE.Group | null>>([]);
  const mats = useRef<Array<THREE.MeshStandardMaterial | null>>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const drops = world.drops.filter((d) => !d.taken);
    for (let i = 0; i < DROP_SLOTS; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const d = drops[i];
      if (!d) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(d.x, d.y + 1.0 + Math.sin(t * 2 + i) * 0.14, d.z);
      g.rotation.y = t * 1.3 + i;
      const mat = mats.current[i];
      if (mat) {
        const color = d.itemId
          ? RARITY_COLOR[ITEMS[d.itemId]?.rarity ?? "common"]
          : d.potion
            ? "#e2707f"
            : "#e8c169";
        mat.color.set(color);
        mat.emissive.set(color);
      }
    }
  });

  return (
    <>
      {Array.from({ length: DROP_SLOTS }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh castShadow>
            <octahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial
              ref={(m) => {
                mats.current[i] = m as THREE.MeshStandardMaterial;
              }}
              color="#e8c169"
              emissive="#e8c169"
              emissiveIntensity={0.7}
              roughness={0.35}
              metalness={0.2}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.95}>
            <circleGeometry args={[0.6, 20]} />
            <meshBasicMaterial color="#ffd79a" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function SparkViews() {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const geom = useMemo(() => new THREE.IcosahedronGeometry(0.3, 0), []);

  useFrame(() => {
    for (let i = 0; i < SPARK_SLOTS; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const s = world.sparks.filter((k) => !k.ring)[i];
      if (!s) {
        mesh.visible = false;
        continue;
      }
      const age = (world.time - s.born) / s.life;
      if (age >= 1) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(s.x, s.y + age * 0.9, s.z);
      mesh.scale.setScalar(s.size * (0.6 + age * 1.9));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(s.color);
      mat.opacity = 1 - age;
    }
  });

  return (
    <>
      {Array.from({ length: SPARK_SLOTS }).map((_, i) => (
        <mesh
          key={i}
          geometry={geom}
          visible={false}
          ref={(el) => {
            meshes.current[i] = el;
          }}
        >
          <meshBasicMaterial transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

const RING_SLOTS = 8;

/** Flat expanding shockwave rings (landing, Emberburst, Gale Step, slams). */
export function RingViews() {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const geom = useMemo(() => new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), []);
  useFrame(() => {
    const rings = world.sparks.filter((k) => k.ring);
    for (let i = 0; i < RING_SLOTS; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const s = rings[i];
      const age = s ? (world.time - s.born) / s.life : 1;
      if (!s || age >= 1) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(s.x, heightAt(s.x, s.z) + 0.15, s.z);
      mesh.scale.setScalar(s.size * (0.35 + age * 0.75));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(s.color);
      mat.opacity = (1 - age) * 0.7;
    }
  });
  return (
    <>
      {Array.from({ length: RING_SLOTS }).map((_, i) => (
        <mesh key={i} geometry={geom} visible={false} renderOrder={4} ref={(el) => { meshes.current[i] = el; }}>
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

const ZONE_SLOTS = 10;
const coneCache = new Map<number, THREE.BufferGeometry>();
function coneGeom(arc: number) {
  const key = Math.round(arc * 100);
  let g = coneCache.get(key);
  if (!g) {
    g = new THREE.CircleGeometry(1, 32, -arc / 2, arc).rotateX(-Math.PI / 2);
    coneCache.set(key, g);
  }
  return g;
}

/**
 * Enemy attack zones: a faint full-size outline shows exactly where the hit
 * lands, and a brighter fill grows to the edge as the windup completes.
 */
export function ZoneViews() {
  const slots = useRef<Array<{ g: THREE.Group; outline: THREE.Mesh; fill: THREE.Mesh } | null>>([]);
  const circle = useMemo(() => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), []);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2), []);

  useFrame(() => {
    const active: Array<{ z: Zone; t: number; striking: boolean }> = [];
    for (const e of world.enemies) {
      if (!e.zones.length) continue;
      if (e.phase !== "windup" && e.phase !== "strike" && e.phase !== "charge") continue;
      for (const z of e.zones) active.push({ z, t: e.phase === "windup" ? e.telegraph : 1, striking: e.phase !== "windup" });
    }
    for (let i = 0; i < ZONE_SLOTS; i++) {
      const slot = slots.current[i];
      if (!slot) continue;
      const a = active[i];
      if (!a) {
        slot.g.visible = false;
        continue;
      }
      const { z, t } = a;
      slot.g.visible = true;
      slot.g.position.set(z.x, heightAt(z.x, z.z) + 0.12, z.z);
      const om = slot.outline.material as THREE.MeshBasicMaterial;
      const fm = slot.fill.material as THREE.MeshBasicMaterial;
      om.opacity = a.striking ? 0.5 : 0.16 + t * 0.1;
      fm.opacity = a.striking ? 0.6 : 0.22 + t * 0.35;
      if (z.kind === "circle") {
        slot.g.rotation.y = 0;
        slot.outline.geometry = circle;
        slot.fill.geometry = circle;
        slot.outline.scale.setScalar(z.r);
        slot.fill.scale.setScalar(z.r * Math.max(0.05, t));
      } else if (z.kind === "cone") {
        slot.g.rotation.y = z.yaw - Math.PI / 2;
        const g = coneGeom(z.arc);
        slot.outline.geometry = g;
        slot.fill.geometry = g;
        slot.outline.scale.setScalar(z.r);
        slot.fill.scale.setScalar(z.r * Math.max(0.05, t));
      } else {
        slot.g.rotation.y = z.yaw;
        slot.outline.geometry = plane;
        slot.fill.geometry = plane;
        slot.outline.scale.set(z.w, 1, z.len);
        slot.fill.scale.set(z.w, 1, z.len * Math.max(0.03, t));
      }
    }
  });

  return (
    <>
      {Array.from({ length: ZONE_SLOTS }).map((_, i) => (
        <group
          key={i}
          visible={false}
          ref={(g) => {
            if (!g) return;
            slots.current[i] = { g, outline: g.children[0] as THREE.Mesh, fill: g.children[1] as THREE.Mesh };
          }}
        >
          <mesh renderOrder={5}>
            <circleGeometry args={[1, 8]} />
            <meshBasicMaterial color="#ff5a36" transparent opacity={0.2} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh renderOrder={6} position-y={0.01}>
            <circleGeometry args={[1, 8]} />
            <meshBasicMaterial color="#ff3d1f" transparent opacity={0.4} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </>
  );
}

const FLOAT_SLOTS = 12;

/** Floating damage / state numbers. DOM text keeps them crisp and readable. */
export function FloaterViews() {
  const groups = useRef<Array<THREE.Group | null>>([]);
  const labels = useRef<Array<HTMLDivElement | null>>([]);
  useFrame(() => {
    for (let i = 0; i < FLOAT_SLOTS; i++) {
      const g = groups.current[i];
      const el = labels.current[i];
      if (!g || !el) continue;
      const f = world.floaters[world.floaters.length - 1 - i];
      const age = f ? (world.time - f.born) / 0.9 : 1;
      if (!f || age >= 1) {
        el.style.opacity = "0";
        continue;
      }
      g.position.set(f.x, f.y + age * 1.1, f.z);
      if (el.textContent !== f.text) el.textContent = f.text;
      el.style.color = f.color;
      el.style.opacity = String(age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3);
      el.style.fontSize = f.big ? "22px" : "15px";
      el.style.transform = `scale(${age < 0.12 ? 1.35 - age * 3 : 1})`;
    }
  });
  return (
    <>
      {Array.from({ length: FLOAT_SLOTS }).map((_, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }}>
          <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div
              ref={(el) => { labels.current[i] = el; }}
              className="select-none whitespace-nowrap font-display font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"
              style={{ opacity: 0 }}
            />
          </Html>
        </group>
      ))}
    </>
  );
}
