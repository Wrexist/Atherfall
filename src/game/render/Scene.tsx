import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { COTTAGES, MODULE, PROPS, cottageWalls, type PropInstance } from "../world/layout";
import { REGIONS, heightAt } from "../world/terrain";
import { useGame, type Quality } from "../core/store";
import { ModelInstances, type InstanceTransform } from "./Instances";
import { Terrain } from "./Terrain";
import { EnemyViews, NpcViews, PlayerView } from "./Characters";
import { DropViews, FloaterViews, RingViews, SparkViews, ZoneViews } from "./Effects";
import { Systems } from "./Systems";

const QUALITY: Record<Quality, { segments: number; shadows: boolean; shadowMap: number; far: number; detail: boolean }> = {
  low: { segments: 90, shadows: false, shadowMap: 512, far: 95, detail: false },
  medium: { segments: 140, shadows: true, shadowMap: 1024, far: 135, detail: true },
  high: { segments: 190, shadows: true, shadowMap: 2048, far: 175, detail: true },
};

function groupProps(props: PropInstance[]) {
  const map = new Map<string, InstanceTransform[]>();
  for (const p of props) {
    const arr = map.get(p.model) ?? [];
    arr.push({ x: p.x, z: p.z, yaw: p.yaw, scale: p.scale, yOffset: p.yOffset });
    map.set(p.model, arr);
  }
  return Array.from(map.entries());
}

function Cottages({ shadows }: { shadows: boolean }) {
  const grouped = useMemo(() => {
    const map = new Map<string, InstanceTransform[]>();
    for (const c of COTTAGES) {
      const base = heightAt(c.x, c.z) - 0.1;
      for (const w of cottageWalls(c)) {
        const cos = Math.cos(c.yaw);
        const sin = Math.sin(c.yaw);
        const x = c.x + w.x * cos + w.z * sin;
        const z = c.z - w.x * sin + w.z * cos;
        const arr = map.get(w.model) ?? [];
        arr.push({ x, z, yaw: c.yaw + w.yaw, scale: MODULE, y: base });
        map.set(w.model, arr);
      }
    }
    return Array.from(map.entries());
  }, []);

  return (
    <>
      {grouped.map(([url, items]) => (
        <ModelInstances key={url} url={url} items={items} shadows={shadows} />
      ))}
      {COTTAGES.map((c, i) => {
        const base = heightAt(c.x, c.z) - 0.1;
        const w = c.w * MODULE;
        const d = c.d * MODULE;
        const span = Math.max(w, d);
        return (
          <group key={i} position={[c.x, base, c.z]} rotation-y={c.yaw}>
            <mesh position={[0, -0.06, 0]} receiveShadow={shadows}>
              <boxGeometry args={[w + 0.5, 0.3, d + 0.5]} />
              <meshStandardMaterial color="#9a8a72" roughness={1} />
            </mesh>
            <mesh position={[0, MODULE + span * 0.24, 0]} rotation-y={Math.PI / 4} castShadow={shadows}>
              <coneGeometry args={[span * 0.82, span * 0.55, 4]} />
              <meshStandardMaterial color={c.roof} roughness={0.9} flatShading />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function ShoreGate() {
  const unlocked = useGame((s) => s.shoreUnlocked);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.18 + Math.sin(state.clock.elapsedTime * 1.6) * 0.07;
    }
  });
  if (!unlocked) return null;
  const x = REGIONS.shore.x;
  const z = REGIONS.shore.z;
  return (
    <mesh ref={ref} position={[x, heightAt(x, z) + 9, z]}>
      <cylinderGeometry args={[2.2, 2.6, 18, 20, 1, true]} />
      <meshBasicMaterial
        color="#ffd88a"
        transparent
        opacity={0.22}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Scene() {
  const quality = useGame((s) => s.quality);
  const q = QUALITY[quality];
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const props = useMemo(
    () => groupProps(q.detail ? PROPS : PROPS.filter((p) => !p.detail)),
    [q.detail],
  );

  return (
    <>
      <Systems sunRef={sunRef} />
      <color attach="background" args={["#f0cfa1"]} />
      <fog attach="fog" args={["#efc99c", q.far * 0.32, q.far]} />

      <hemisphereLight args={["#ffe2b8", "#4e5a3a", 0.85]} />
      <ambientLight intensity={0.35} color="#ffd9b0" />
      <directionalLight
        ref={sunRef}
        color="#ffcf93"
        intensity={2.1}
        castShadow={q.shadows}
        shadow-mapSize-width={q.shadowMap}
        shadow-mapSize-height={q.shadowMap}
        shadow-bias={-0.0008}
        shadow-camera-near={1}
        shadow-camera-far={190}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
      />

      <Terrain segments={q.segments} shadows={q.shadows} />
      <Cottages shadows={q.shadows} />
      {props.map(([url, items]) => (
        <ModelInstances key={url} url={url} items={items} shadows={q.shadows} />
      ))}

      <PlayerView />
      <EnemyViews />
      <NpcViews />
      <DropViews />
      <SparkViews />
      <RingViews />
      <ZoneViews />
      <FloaterViews />
      <ShoreGate />
    </>
  );
}
