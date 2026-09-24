import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { heightAt } from "../world/terrain";

export interface InstanceTransform {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  yOffset?: number;
  /** Absolute ground height override (skips terrain sampling). */
  y?: number;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  local: THREE.Matrix4;
}

function useParts(url: string): Part[] {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: Part[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      parts.push({
        geometry: mesh.geometry,
        material: mesh.material,
        local: mesh.matrixWorld.clone(),
      });
    });
    return parts;
  }, [scene]);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function InstancedPart({
  part,
  items,
  shadows,
}: {
  part: Part;
  items: InstanceTransform[];
  shadows: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _e.set(0, it.yaw, 0);
      _q.setFromEuler(_e);
      _v.set(it.x, (it.y ?? heightAt(it.x, it.z)) + (it.yOffset ?? 0), it.z);
      _s.setScalar(it.scale);
      _m.compose(_v, _q, _s);
      _m.multiply(part.local);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, part]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material as THREE.Material, items.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      frustumCulled={false}
    />
  );
}

/** Renders many copies of one GLB as instanced meshes (one draw call per sub-mesh). */
export function ModelInstances({
  url,
  items,
  shadows,
}: {
  url: string;
  items: InstanceTransform[];
  shadows: boolean;
}) {
  const parts = useParts(url);
  if (items.length === 0) return null;
  return (
    <>
      {parts.map((part, i) => (
        <InstancedPart key={i} part={part} items={items} shadows={shadows} />
      ))}
    </>
  );
}
