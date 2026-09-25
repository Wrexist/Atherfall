import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CLIMBS, LANDMARKS, RESOURCES, SECRETS, WAYPOINTS } from "../data/world";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { heightAt } from "../world/terrain";
import { col } from "./colors";

/** Waypoint beacons: a soft blue ring + light shaft once discovered. */
function Waypoints() {
  const found = useGame((s) => s.waypoints);
  return (
    <>
      {WAYPOINTS.map((w) => {
        const y = heightAt(w.x, w.z);
        const on = found.includes(w.id);
        return (
          <group key={w.id} position={[w.x, y, w.z]}>
            <mesh rotation-x={-Math.PI / 2} position-y={0.12}>
              <ringGeometry args={[1.6, 2.1, 32]} />
              <meshBasicMaterial color={on ? "#9fd8ff" : "#8a7f6a"} transparent opacity={on ? 0.7 : 0.35} depthWrite={false} />
            </mesh>
            {on && (
              <mesh position-y={6}>
                <cylinderGeometry args={[0.35, 0.6, 12, 12, 1, true]} />
                <meshBasicMaterial color="#9fd8ff" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

/** Secret caches: chests that glow when ready and dim once opened. */
function Secrets() {
  const opened = useGame((s) => s.secrets);
  const gltf = useGLTF("/models/dng/chest.glb");
  const chests = useMemo(() => SECRETS.map(() => gltf.scene.clone()), [gltf.scene]);
  const glows = useRef<Array<THREE.Mesh | null>>([]);
  useFrame((state) => {
    SECRETS.forEach((sec, i) => {
      const g = glows.current[i];
      if (!g) return;
      const sealed = sec.guardian ? world.enemies.some((e) => e.type === sec.guardian && e.phase !== "dead") : false;
      const m = g.material as THREE.MeshBasicMaterial;
      m.color.copy(col(sealed ? "#e8735a" : "#ffd27a"));
      m.opacity = 0.35 + Math.sin(state.clock.elapsedTime * 2.4) * 0.12;
    });
  });
  return (
    <>
      {SECRETS.map((sec, i) => {
        const done = opened.includes(sec.id);
        return (
          <group key={sec.id} position={[sec.x, heightAt(sec.x, sec.z), sec.z]}>
            <primitive object={chests[i]!} scale={3} rotation-y={0.6} />
            {!done && (
              <mesh
                ref={(el) => {
                  glows.current[i] = el;
                }}
                rotation-x={-Math.PI / 2}
                position-y={0.1}
              >
                <ringGeometry args={[1.3, 1.8, 28]} />
                <meshBasicMaterial transparent depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

/** Aether crystals: hidden while regrowing. */
function Crystals() {
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  const geo = useMemo(() => new THREE.OctahedronGeometry(0.55, 0), []);
  const baseY = useMemo(() => RESOURCES.map((r) => heightAt(r.x, r.z) + 0.9), []);
  useFrame((state) => {
    RESOURCES.forEach((r, i) => {
      const m = refs.current[i];
      if (!m) return;
      const regrow = world.resourceRegrow[r.id];
      m.visible = regrow === undefined || world.time >= regrow;
      m.rotation.y = state.clock.elapsedTime * 0.8 + i;
      m.position.y = baseY[i]! + Math.sin(state.clock.elapsedTime * 1.8 + i) * 0.1;
    });
  });
  return (
    <>
      {RESOURCES.map((r, i) => (
        <mesh
          key={r.id}
          geometry={geo}
          position={[r.x, heightAt(r.x, r.z) + 0.9, r.z]}
          scale={[1, 1.8, 1]}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <meshStandardMaterial color="#b9a4ff" emissive="#8a6cff" emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

/** The fallen star in Starfall Crater and the vines on the Watchstone. */
function Features() {
  const star = LANDMARKS.find((l) => l.id === "fallen-star")!;
  const sy = heightAt(star.x, star.z);
  return (
    <>
      <group position={[star.x, sy, star.z]}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.08}>
          <circleGeometry args={[5, 28]} />
          <meshStandardMaterial color="#6fae8f" roughness={0.2} metalness={0.3} transparent opacity={0.75} />
        </mesh>
        {[0, 1.3, 2.4, 3.6, 4.9].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.9, 1.2 + (i % 2) * 0.4, Math.sin(a) * 0.9]} rotation={[0.3 * i, a, 0.4]} scale={[0.5, 1.8 + (i % 3) * 0.5, 0.5]}>
            <octahedronGeometry args={[0.8, 0]} />
            <meshStandardMaterial color="#9ff0c8" emissive="#3fd49a" emissiveIntensity={1.2} roughness={0.2} />
          </mesh>
        ))}
      </group>
      {CLIMBS.map((c) => {
        const baseY = heightAt(c.base.x, c.base.z);
        const topY = heightAt(c.top.x, c.top.z);
        const h = topY - baseY;
        const yaw = Math.atan2(c.top.x - c.base.x, c.top.z - c.base.z);
        return (
          <group key={c.id} position={[c.base.x, baseY, c.base.z]} rotation-y={yaw}>
            {[-0.7, 0, 0.7].map((dx, i) => (
              <mesh key={i} position={[dx, h / 2, 1.1]} rotation-x={0.12}>
                <boxGeometry args={[0.35, h + 0.5, 0.15]} />
                <meshStandardMaterial color={i === 1 ? "#4d7a33" : "#5f8f3c"} roughness={0.9} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

export function WorldObjects() {
  return (
    <>
      <Waypoints />
      <Secrets />
      <Crystals />
      <Features />
    </>
  );
}
