import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  BARROW_GATE,
  COTTAGES,
  NPCS,
  PROPS,
  SPAWNS,
  cottageHouse,
  modelFile,
  type PropInstance,
} from "../world/layout";
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
import { BlobShadows, HeroRing } from "./Blobs";
import { EmoteBubbles } from "./EmoteBubbles";
import { Meadow } from "./Grass";
import { SlashTrail } from "./Slash";

/** Every model file the scene can show, so all downloads start together. */
export const MODEL_URLS = Array.from(
  new Set<string>([
    ...PROPS.map((p) => modelFile(p.model)),
    ...COTTAGES.map((c) => modelFile(cottageHouse(c).model)),
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
  {
    segments: number;
    shadows: boolean;
    shadowMap: number;
    shadowSpan: number;
    far: number;
    detail: boolean;
  }
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

/** Village houses: one KayKit building per cottage plot. */
function Cottages({ shadows }: { shadows: boolean }) {
  const grouped = useMemo(() => {
    const map = new Map<string, InstanceTransform[]>();
    for (const c of COTTAGES) {
      const house = cottageHouse(c);
      const arr = map.get(house.model) ?? [];
      arr.push({ x: c.x, z: c.z, yaw: c.yaw, scale: house.scale, y: heightAt(c.x, c.z) - 0.05 });
      map.set(house.model, arr);
    }
    return Array.from(map.entries());
  }, []);
  return (
    <>
      {grouped.map(([url, items]) => (
        <ModelInstances key={url} url={url} items={items} shadows={shadows} />
      ))}
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
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const props = useMemo(
    () => groupProps(q.detail ? PROPS : PROPS.filter((p) => !p.detail)),
    [q.detail],
  );

  return (
    <>
      <Systems sunRef={sunRef} />
      <color attach="background" args={["#a9d9f2"]} />
      <fog attach="fog" args={["#a9d9f2", q.far * 0.45, q.far]} />

      <hemisphereLight ref={hemiRef} args={["#cfe8ff", "#5d7d3c", 1.05]} />
      <ambientLight ref={ambRef} intensity={0.2} color="#fff4e2" />
      <DayNight sun={sunRef} hemi={hemiRef} amb={ambRef} />
      <directionalLight
        ref={sunRef}
        color="#fff1da"
        intensity={2.7}
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

      <Meadow quality={quality} shadows={q.shadows} />
      <PlayerView />
      <HeroRing />
      {!q.shadows && <BlobShadows />}
      <SlashTrail />
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
      <EmoteBubbles />
    </>
  );
}
