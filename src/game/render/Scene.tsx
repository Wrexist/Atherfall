import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { BARROW_GATE, COTTAGES, MODULE, NPCS, PROPS, SPAWNS, cottageWalls, type PropInstance } from "../world/layout";
import { ARCHETYPES } from "../data/archetypes";
import { enemyDef } from "../data/enemies";
import { useGLTF } from "@react-three/drei";
import { heightAt } from "../world/terrain";
import { useGame, type Quality } from "../core/store";
import { ModelInstances, type InstanceTransform } from "./Instances";
import { Terrain } from "./Terrain";
import { EnemyViews, NpcViews, PlayerView } from "./Characters";
import {
  DropViews,
  FloaterViews,
  LockRing,
  ProjectileViews,
  RingViews,
  SparkViews,
  ZoneViews,
} from "./Effects";
import { Systems } from "./Systems";
import { WorldObjects } from "./WorldObjects";
import { QuestMarker } from "./QuestMarker";
import { RemotePlayers } from "./RemotePlayers";
import { DayNight } from "./DayNight";

/** Every model the scene can show, so all downloads start together. */
export const MODEL_URLS = Array.from(
  new Set<string>([
    ...PROPS.map((p) => p.model),
    ...COTTAGES.flatMap((c) => cottageWalls(c).map((w) => w.model)),
    ...Object.values(ARCHETYPES).map((a) => a.model),
    ...SPAWNS.map((sp) => enemyDef(sp.type).model),
    ...NPCS.map((n) => n.model),
    "/models/dng/gate.glb",
    "/models/dng/chest.glb",
  ]),
);

/**
 * `shadowSpan` is the half-width of the sun's shadow box around the player. A
 * tighter box gives sharper shadows from the same map and skips casters far
 * away (their shadows would be lost in fog anyway).
 */
const QUALITY: Record<
  Quality,
  { segments: number; shadows: boolean; shadowMap: number; shadowSpan: number; far: number; detail: boolean }
> = {
  low: { segments: 90, shadows: false, shadowMap: 512, shadowSpan: 30, far: 95, detail: false },
  medium: { segments: 140, shadows: true, shadowMap: 1024, shadowSpan: 32, far: 135, detail: true },
  high: { segments: 190, shadows: true, shadowMap: 2048, shadowSpan: 48, far: 175, detail: true },
};

function groupProps(props: PropInstance[]) {
  const map = new Map<string, { items: InstanceTransform[]; allDetail: boolean }>();
  for (const p of props) {
    const g = map.get(p.model) ?? { items: [], allDetail: true };
    g.items.push({ x: p.x, z: p.z, yaw: p.yaw, scale: p.scale, yOffset: p.yOffset });
    if (!p.detail) g.allDetail = false;
    map.set(p.model, g);
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

/** Iron gate across the barrow entrance; swaps to a guiding beam once opened. */
function BarrowGate() {
  const unlocked = useGame((s) => s.barrowUnlocked);
  const done = useGame((s) => s.questComplete);
  const gate = useGLTF("/models/dng/gate.glb");
  const leaves = useMemo(() => [gate.scene.clone(), gate.scene.clone()], [gate.scene]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.18 + Math.sin(state.clock.elapsedTime * 1.6) * 0.07;
    }
  });
  const { x, z } = BARROW_GATE;
  const y = heightAt(x, z);
  if (!unlocked) {
    return (
      <group position={[x, y, z]} rotation-y={Math.PI / 2}>
        <primitive object={leaves[0]!} position={[-1.7, 0, 0]} scale={4.2} />
        <primitive object={leaves[1]!} position={[1.7, 0, 0]} scale={4.2} />
      </group>
    );
  }
  if (done) return null;
  return (
    <mesh ref={ref} position={[x + 2, y + 9, z]}>
      <cylinderGeometry args={[2.2, 2.6, 18, 20, 1, true]} />
      <meshBasicMaterial color="#ffd88a" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export function Scene() {
  const quality = useGame((s) => s.quality);
  const q = QUALITY[quality];
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const props = useMemo(
    () => groupProps(q.detail ? PROPS : PROPS.filter((p) => !p.detail)),
    [q.detail],
  );

  return (
    <>
      <Systems sunRef={sunRef} />
      <color attach="background" args={["#f0cfa1"]} />
      <fog attach="fog" args={["#efc99c", q.far * 0.32, q.far]} />

      <hemisphereLight ref={hemiRef} args={["#ffe2b8", "#4e5a3a", 0.85]} />
      <ambientLight ref={ambRef} intensity={0.35} color="#ffd9b0" />
      <DayNight sun={sunRef} hemi={hemiRef} amb={ambRef} />
      <directionalLight
        ref={sunRef}
        color="#ffcf93"
        intensity={2.1}
        castShadow={q.shadows}
        shadow-mapSize-width={q.shadowMap}
        shadow-mapSize-height={q.shadowMap}
        shadow-bias={-0.0008}
        shadow-camera-near={1}
        shadow-camera-far={170}
        shadow-camera-left={-q.shadowSpan}
        shadow-camera-right={q.shadowSpan}
        shadow-camera-top={q.shadowSpan}
        shadow-camera-bottom={-q.shadowSpan}
      />

      <Terrain segments={q.segments} shadows={q.shadows} lite={quality === "low"} />
      <Cottages shadows={q.shadows} />
      {props.map(([url, g]) => (
        <ModelInstances
          key={url}
          url={url}
          items={g.items}
          shadows={q.shadows}
          castShadow={!g.allDetail}
          drawDistance={q.far}
        />
      ))}

      <PlayerView />
      <EnemyViews />
      <NpcViews />
      <DropViews />
      <SparkViews />
      <RingViews />
      <ZoneViews />
      <FloaterViews />
      <ProjectileViews />
      <LockRing />
      <BarrowGate />
      <WorldObjects />
      <QuestMarker />
      <RemotePlayers />
    </>
  );
}
