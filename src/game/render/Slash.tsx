import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { ARCHETYPES } from "../data/archetypes";
import { SWINGS } from "../data/combat";

/**
 * A flat crescent in the XZ plane, centred on +z (the way the hero faces).
 * `aT` runs 0..1 along the arc, `aR` 0 at the inner edge to 1 at the blade tip.
 */
function crescent(inner: number, outer: number, arc: number, segments: number) {
  const pos: number[] = [];
  const t: number[] = [];
  const r: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = -arc / 2 + u * arc;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    pos.push(sx * inner, 0, cz * inner, sx * outer, 0, cz * outer);
    t.push(u, u);
    r.push(0, 1);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute("aR", new THREE.Float32BufferAttribute(r, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const VERT = /* glsl */ `
  attribute float aT;
  attribute float aR;
  varying float vT;
  varying float vR;
  void main() {
    vT = aT;
    vR = aR;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A bright band chasing the blade along the arc, hottest at the tip.
const FRAG = /* glsl */ `
  uniform float uHead;
  uniform float uTail;
  uniform float uFade;
  uniform vec3 uColor;
  varying float vT;
  varying float vR;
  void main() {
    float along = smoothstep(uTail, uHead, vT) * (1.0 - smoothstep(uHead, uHead + 0.03, vT));
    // Thin at the root, brightest just inside the blade tip.
    float edge = smoothstep(0.0, 0.75, vR) * (1.0 - smoothstep(0.9, 1.0, vR));
    float a = along * along * edge * uFade * 0.85;
    vec3 c = mix(uColor, vec3(1.0), smoothstep(0.55, 0.95, vR) * along);
    gl_FragColor = vec4(c, a);
  }
`;

function slashMaterial(color: string) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uHead: { value: 0 },
      uTail: { value: 0 },
      uFade: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** How each swing of the three-hit chain is drawn. */
const STYLE = [
  { arc: 2.3, tilt: 0.38, mirror: false }, // diagonal cut
  { arc: 2.3, tilt: -0.12, mirror: true }, // backhand
  { arc: Math.PI * 2, tilt: 0, mirror: false }, // spinning finisher
];

/**
 * Sword trail for melee swings: a glowing crescent that sweeps with the blade
 * and fades, like mobile action RPGs. Purely visual; reads the hero's swing.
 */
export function SlashTrail() {
  const archetype = useGame((s) => s.archetype);
  const melee = ARCHETYPES[archetype].basic === "melee";
  const group = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const cuts = useMemo(
    () => [
      crescent(1.0, 2.3, STYLE[0]!.arc, 28),
      crescent(1.0, 2.3, STYLE[1]!.arc, 28),
      crescent(1.2, 2.5, STYLE[2]!.arc, 56),
    ],
    [],
  );
  const material = useMemo(() => slashMaterial("#ffd489"), []);
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const g = group.current;
    const m = mesh.current;
    if (!g || !m || !tilt.current) return;
    const p = world.player;
    const idx = p.comboIdx - 1;
    const swing = SWINGS[idx];
    if (!melee || p.action !== "attack" || !swing) {
      g.visible = false;
      return;
    }
    const k = p.actionT / swing.duration;
    // Sweep during the first three quarters of the swing, then fade out.
    const sweep = Math.min(1, k / 0.75);
    const style = STYLE[idx]!;
    g.visible = true;
    g.position.set(p.x, p.y + 1.0, p.z);
    g.rotation.y = p.yaw;
    tilt.current.rotation.z = style.tilt;
    tilt.current.scale.x = style.mirror ? -1 : 1;
    if (m.geometry !== cuts[idx]) m.geometry = cuts[idx]!;
    const u = material.uniforms;
    u["uHead"]!.value = sweep * 1.08;
    u["uTail"]!.value = sweep * 1.08 - (idx === 2 ? 0.4 : 0.38);
    u["uFade"]!.value = 1 - Math.max(0, (k - 0.75) / 0.25);
  });

  return (
    <group ref={group} visible={false}>
      <group ref={tilt}>
        <mesh
          ref={mesh}
          geometry={cuts[0]!}
          material={material}
          renderOrder={5}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}
