import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Quality } from "../core/store";
import { COLLIDERS } from "../world/layout";
import {
  REGIONS,
  groundColor,
  heightAt,
  mulberry32,
  pathDistance,
  slopeAt,
} from "../world/terrain";

// Painted-meadow detail: thousands of tiny grass tufts and flowers, all
// procedural (nothing to download), instanced in spatial cells so off-screen
// cells are culled, swaying in a light breeze. Purely visual: walk-through.

const COUNTS: Record<Quality, { tufts: number; flowers: number }> = {
  low: { tufts: 3000, flowers: 450 },
  medium: { tufts: 8000, flowers: 1100 },
  high: { tufts: 12000, flowers: 1600 },
};

const CELL = 40;
const FLOWER_COLORS = ["#fff6e0", "#ffd84a", "#ff8fb1", "#b89cff", "#8fc4ff", "#ffffff"];

/** Five thin blades fanned around a point, dark at the root, bright at the tip. */
function tuftGeometry() {
  const pos: number[] = [];
  const colors: number[] = [];
  const root = new THREE.Color("#6c9c45");
  const tip = new THREE.Color("#c4e27a");
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + b * 0.7;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const lean = 0.16 + (b % 2) * 0.12;
    const h = 0.5 + ((b * 7) % 5) * 0.08;
    const w = 0.075;
    pos.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, dx * lean, h, dz * lean);
    colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  return upLit(pos, colors);
}

/**
 * Both windings of every triangle, all with normals pointing up: blades are lit
 * like the ground under them from either side. (A double-sided material flips
 * back-face normals, which lit half the blades from below: black grass.)
 */
function upLit(pos: number[], colors: number[]) {
  const p = [...pos];
  const c = [...colors];
  for (let t = 0; t < pos.length; t += 9) {
    p.push(...pos.slice(t + 3, t + 6), ...pos.slice(t, t + 3), ...pos.slice(t + 6, t + 9));
    c.push(...colors.slice(t + 3, t + 6), ...colors.slice(t, t + 3), ...colors.slice(t + 6, t + 9));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      p.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.computeBoundingSphere();
  return g;
}

/** A stem and a small round six-petal head; the head takes the instance colour. */
function flowerGeometry() {
  const pos: number[] = [];
  const colors: number[] = [];
  const stem = [0.4, 0.62, 0.26];
  const h = 0.5;
  pos.push(-0.02, 0, 0, 0.02, 0, 0, 0, h, 0);
  colors.push(...stem, ...stem, ...stem);
  const r = 0.16;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const b = a + Math.PI / 3;
    pos.push(
      0,
      h,
      0,
      Math.cos(a) * r,
      h + 0.03,
      Math.sin(a) * r,
      Math.cos(b) * r,
      h + 0.03,
      Math.sin(b) * r,
    );
    colors.push(1, 0.95, 0.6, 1, 1, 1, 1, 1, 1);
  }
  return upLit(pos, colors);
}

const time = { value: 0 };

/** Lambert with a breeze: the higher a vertex, the more it sways. */
function swayMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms["uTime"] = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
        #else
          float ph = 0.0;
        #endif
        float sway = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.9) * 0.3;
        transformed.x += sway * position.y * position.y * 0.35;
        transformed.z += sway * position.y * position.y * 0.15;`,
      );
  };
  return m;
}

interface Spot {
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  color: THREE.Color;
}

function open(x: number, z: number) {
  if (Math.hypot(x, z) > 104) return false;
  if (slopeAt(x, z) > 0.45) return false;
  if (heightAt(x, z) < 1.2) return false; // no grass on the beach or in water
  if (pathDistance(x, z) < 2.1) return false; // roads stay worn
  if (Math.hypot(x, z) < 6.5) return false; // the fountain square
  for (const c of COLLIDERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + 0.2) ** 2) return false;
  }
  return true;
}

function scatter(count: number, seed: number, flowers: boolean): Spot[] {
  const rand = mulberry32(seed);
  const out: Spot[] = [];
  const c = new THREE.Color();
  for (let tries = 0; out.length < count && tries < count * 4; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 104;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Denser in the woods and around the village edge, thinner on open plains.
    const woods = Math.hypot(x - REGIONS.woods.x, z - REGIONS.woods.z) < REGIONS.woods.radius + 8;
    const edge = Math.abs(Math.hypot(x, z) - 20) < 8;
    const keep = woods || edge ? 1 : 0.55;
    if (rand() > keep || !open(x, z)) continue;
    const y = heightAt(x, z);
    if (flowers) {
      c.set(FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]!);
    } else {
      // Take the ground's colour, a touch lighter, so every region keeps its tone.
      groundColor(x, z, y, c).lerp(new THREE.Color("#ffffff"), 0.1).multiplyScalar(1.25);
    }
    out.push({ x, z, y, yaw: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.8, color: c.clone() });
  }
  return out;
}

function Field({
  geometry,
  material,
  spots,
  shadows,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  spots: Spot[];
  shadows: boolean;
}) {
  const cells = useMemo(() => {
    const map = new Map<string, Spot[]>();
    for (const s of spots) {
      const key = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return Array.from(map.values());
  }, [spots]);
  return (
    <>
      {cells.map((list, i) => (
        <Cell key={i} geometry={geometry} material={material} spots={list} shadows={shadows} />
      ))}
    </>
  );
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function Cell({
  geometry,
  material,
  spots,
  shadows,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  spots: Spot[];
  shadows: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    spots.forEach((s, i) => {
      _e.set(0, s.yaw, 0);
      _q.setFromEuler(_e);
      _p.set(s.x, s.y - 0.02, s.z);
      _s.setScalar(s.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, s.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, spots.length]}
      receiveShadow={shadows}
      matrixAutoUpdate={false}
    />
  );
}

export function Meadow({ quality, shadows }: { quality: Quality; shadows: boolean }) {
  const n = COUNTS[quality];
  const tuft = useMemo(tuftGeometry, []);
  const flower = useMemo(flowerGeometry, []);
  const material = useMemo(swayMaterial, []);
  const tufts = useMemo(() => scatter(n.tufts, 90210, false), [n.tufts]);
  const flowers = useMemo(() => scatter(n.flowers, 4242, true), [n.flowers]);
  useFrame((_, dt) => {
    time.value += dt;
  });
  return (
    <>
      <Field geometry={tuft} material={material} spots={tufts} shadows={shadows} />
      <Field geometry={flower} material={material} spots={flowers} shadows={shadows} />
    </>
  );
}
