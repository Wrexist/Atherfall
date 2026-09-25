import { useMemo } from "react";
import * as THREE from "three";
import { WORLD_RADIUS, groundColor, heightAt } from "../world/terrain";
import { groundDetailTexture } from "./groundTexture";
import { Water } from "./Water";

/** World units per repeat of the painted detail texture. */
const DETAIL_TILE = 9;

export function Terrain({
  segments,
  shadows,
  lite,
}: {
  segments: number;
  shadows: boolean;
  lite: boolean;
}) {
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
  const detail = useMemo(() => {
    const tex = groundDetailTexture();
    const repeat = (WORLD_RADIUS * 2.2) / DETAIL_TILE;
    tex?.repeat.set(repeat, repeat);
    return tex;
  }, []);

  return (
    <>
      {/* The ground covers most of the screen: on Low it uses cheap diffuse shading. */}
      <mesh geometry={geometry} receiveShadow={shadows}>
        {lite ? (
          <meshLambertMaterial vertexColors map={detail} />
        ) : (
          <meshStandardMaterial vertexColors map={detail} roughness={0.95} metalness={0} />
        )}
      </mesh>
      <Water />
    </>
  );
}
