import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { heightAt } from "../world/terrain";
import { liteMaterials, useLiteMaterials } from "./materials";

export interface InstanceTransform {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  yOffset?: number | undefined;
  /** Absolute ground height override (skips terrain sampling). */
  y?: number;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  local: THREE.Matrix4;
}

/**
 * `url` is a GLB, or `file.glb#piece` for one named piece of a kit file (all
 * KayKit world pieces live in one file, so they share a single texture).
 */
function useParts(url: string): Part[] {
  const [file, piece] = url.split("#") as [string, string | undefined];
  const { scene } = useGLTF(file);
  const lite = useLiteMaterials();
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const root = piece ? scene.getObjectByName(piece) : scene;
    if (!root) throw new Error(`no piece "${piece}" in ${file}`);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const parts: Part[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      parts.push({
        geometry: mesh.geometry,
        material: lite ? liteMaterials(mesh.material) : mesh.material,
        local: new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld),
      });
    });
    return parts;
  }, [scene, piece, file, lite]);
}

/**
 * Props are bucketed into square cells so each cell's InstancedMesh gets a tight
 * bounding sphere: three.js then frustum-culls whole cells (camera *and* shadow
 * pass), and cells past the fog are hidden outright. One huge world-sized
 * instanced mesh can never be culled, so every tree was drawn every frame.
 */
const CELL = 48;
/** Models with only a few copies stay in one mesh; splitting them just adds draw calls. */
const MIN_TO_SPLIT = 8;

interface Chunk {
  key: string;
  items: InstanceTransform[];
  cx: number;
  cz: number;
  radius: number;
}

function chunkItems(items: InstanceTransform[]): Chunk[] {
  const cells = new Map<string, InstanceTransform[]>();
  for (const it of items) {
    const key =
      items.length < MIN_TO_SPLIT ? "all" : `${Math.floor(it.x / CELL)},${Math.floor(it.z / CELL)}`;
    const arr = cells.get(key);
    if (arr) arr.push(it);
    else cells.set(key, [it]);
  }
  return Array.from(cells.entries()).map(([key, list]) => {
    let cx = 0;
    let cz = 0;
    for (const it of list) {
      cx += it.x;
      cz += it.z;
    }
    cx /= list.length;
    cz /= list.length;
    let radius = 0;
    for (const it of list) radius = Math.max(radius, Math.hypot(it.x - cx, it.z - cz));
    return { key, items: list, cx, cz, radius };
  });
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function InstancedPart({
  part,
  items,
  castShadow,
  receiveShadow,
}: {
  part: Part;
  items: InstanceTransform[];
  castShadow: boolean;
  receiveShadow: boolean;
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
    // Static: bounds are computed once, and the object matrix never changes.
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.updateMatrix();
  }, [items, part]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material as THREE.Material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      matrixAutoUpdate={false}
    />
  );
}

/**
 * Renders many copies of one GLB as instanced meshes, split into spatial cells.
 * `drawDistance` hides whole cells beyond it (match the fog far plane).
 */
export function ModelInstances({
  url,
  items,
  shadows,
  castShadow = shadows,
  drawDistance = Infinity,
}: {
  url: string;
  items: InstanceTransform[];
  shadows: boolean;
  /** Small scatter (grass, flowers) looks the same without casting — and costs a shadow pass. */
  castShadow?: boolean;
  drawDistance?: number;
}) {
  const parts = useParts(url);
  const chunks = useMemo(() => chunkItems(items), [items]);
  const groups = useRef<Array<THREE.Group | null>>([]);

  useFrame(({ camera }) => {
    if (!Number.isFinite(drawDistance)) return;
    const px = camera.position.x;
    const pz = camera.position.z;
    for (let i = 0; i < chunks.length; i++) {
      const g = groups.current[i];
      const c = chunks[i]!;
      if (g) g.visible = Math.hypot(c.cx - px, c.cz - pz) - c.radius - 4 < drawDistance;
    }
  });

  if (items.length === 0) return null;
  return (
    <>
      {chunks.map((c, ci) => (
        <group
          key={c.key}
          matrixAutoUpdate={false}
          ref={(g) => {
            groups.current[ci] = g;
          }}
        >
          {parts.map((part, i) => (
            <InstancedPart
              key={i}
              part={part}
              items={c.items}
              castShadow={castShadow && shadows}
              receiveShadow={shadows}
            />
          ))}
        </group>
      ))}
    </>
  );
}
