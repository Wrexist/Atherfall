import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { SEA_LEVEL, heightAt } from "../world/terrain";

// Stylized sea: turquoise shallows over the sand fading to deep blue, foam
// lines that run up the beach, and a soft shimmer. One draw call. The water's
// depth at each vertex is baked from the terrain when the mesh is built.

const CENTER: [number, number] = [6, 96];
const SIZE: [number, number] = [340, 220];

const VERT = /* glsl */ `
  attribute float aDepth;
  varying float vDepth;
  varying vec2 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vDepth = aDepth;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  varying float vDepth;
  varying vec2 vWorld;
  #include <fog_pars_fragment>

  float wave(vec2 p, float t) {
    return sin(p.x * 0.35 + t * 1.1) * cos(p.y * 0.29 - t * 0.8) + sin((p.x + p.y) * 0.21 + t * 0.6);
  }

  void main() {
    float d = max(vDepth, 0.0);
    vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 3.5, d));
    // Shimmer: soft bright ripples.
    float w = wave(vWorld, uTime);
    col += vec3(0.07, 0.09, 0.1) * smoothstep(1.2, 1.9, w);
    // Foam: a solid edge at the waterline plus lines that run up the beach.
    float edge = 1.0 - smoothstep(0.0, 0.18, d);
    float lines = smoothstep(0.82, 0.97, sin(d * 9.0 - uTime * 1.6 + w * 0.6)) * (1.0 - smoothstep(0.2, 1.1, d));
    float foam = clamp(edge + lines * 0.8, 0.0, 1.0);
    col = mix(col, uFoam, foam);
    // Clear over the sand, solid further out.
    float alpha = mix(0.55, 0.92, smoothstep(0.0, 2.0, d));
    alpha = max(alpha, foam * 0.95);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function Water() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE[0], SIZE[1], 120, 80);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes["position"] as THREE.BufferAttribute;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      depth[i] = SEA_LEVEL - heightAt(pos.getX(i) + CENTER[0], pos.getZ(i) + CENTER[1]);
    }
    g.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uShallow: { value: new THREE.Color("#5fd6d0") },
            uDeep: { value: new THREE.Color("#1f6fa3") },
            uFoam: { value: new THREE.Color("#f4fbff") },
          },
        ]),
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    [],
  );
  useFrame((_, dt) => {
    material.uniforms["uTime"]!.value += dt;
  });
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[CENTER[0], SEA_LEVEL, CENTER[1]]}
      renderOrder={1}
    />
  );
}
