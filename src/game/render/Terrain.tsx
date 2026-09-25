import { useMemo } from "react";
import * as THREE from "three";
import { SEA_LEVEL, WORLD_RADIUS, groundColor, heightAt } from "../world/terrain";

export function Terrain({ segments, shadows, lite }: { segments: number; shadows: boolean; lite: boolean }) {
  const geometry = useMemo(() => {
    const size = WORLD_RADIUS * 2.2;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes["position"] as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      groundColor(x, z, h, c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [segments]);

  return (
    <>
      {/* The ground covers most of the screen: on Low it uses cheap diffuse shading. */}
      <mesh geometry={geometry} receiveShadow={shadows}>
        {lite ? (
          <meshLambertMaterial vertexColors />
        ) : (
          <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
        )}
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[6, SEA_LEVEL, 96]}>
        <planeGeometry args={[340, 220]} />
        {lite ? (
          <meshLambertMaterial color="#2f7f88" transparent opacity={0.82} />
        ) : (
          <meshStandardMaterial color="#2f7f88" transparent opacity={0.82} roughness={0.25} metalness={0.15} />
        )}
      </mesh>
    </>
  );
}
