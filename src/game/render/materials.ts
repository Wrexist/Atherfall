import * as THREE from "three";
import { useGame } from "../core/store";

/**
 * Low quality swaps physically based materials (MeshStandard: GGX specular,
 * roughness/metalness) for Lambert diffuse shading. The storybook palette looks
 * nearly identical, and every covered pixel becomes much cheaper — fill rate is
 * the main limit on phone GPUs.
 */
const lite = new WeakMap<THREE.Material, THREE.Material>();

export function liteMaterial<T extends THREE.Material>(src: T): T | THREE.MeshLambertMaterial {
  if (!(src instanceof THREE.MeshStandardMaterial)) return src;
  let m = lite.get(src) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      name: src.name,
      color: src.color,
      map: src.map,
      emissive: src.emissive,
      emissiveMap: src.emissiveMap,
      emissiveIntensity: src.emissiveIntensity,
      vertexColors: src.vertexColors,
      flatShading: src.flatShading,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      side: src.side,
      fog: src.fog,
    });
    lite.set(src, m);
  }
  return m;
}

export function liteMaterials(src: THREE.Material | THREE.Material[]) {
  return Array.isArray(src) ? src.map((m) => liteMaterial(m)) : liteMaterial(src);
}

/** True when the cheap material set should be used. */
export function useLiteMaterials() {
  return useGame((s) => s.quality === "low");
}
