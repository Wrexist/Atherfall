import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ITEMS, RARITY_COLOR } from "../data/items";
import { world } from "../core/sim";

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
      const s = world.sparks[i];
      if (!s) {
        mesh.visible = false;
        continue;
      }
      const age = (world.time - s.born) / 0.45;
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
