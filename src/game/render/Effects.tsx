import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ITEMS, RARITY_COLOR } from "../data/items";
import { lockedEnemy, world, type Zone } from "../core/sim";
import { enemyDef } from "../data/enemies";
import { heightAt } from "../world/terrain";
import { col } from "./colors";

const DROP_SLOTS = 24;
const SPARK_SLOTS = 24;

/** Vertical fade for loot beams: solid at the ground, gone at the top. */
let beamFade: THREE.CanvasTexture | null = null;
function beamAlpha() {
  if (beamFade || typeof document === "undefined") return beamFade;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.35, "#777");
  grad.addColorStop(1, "#000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  beamFade = new THREE.CanvasTexture(c);
  return beamFade;
}

export function DropViews() {
  const groups = useRef<Array<THREE.Group | null>>([]);
  const mats = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const beams = useRef<Array<THREE.Mesh | null>>([]);
  const beamGeom = useMemo(() => new THREE.CylinderGeometry(0.34, 0.5, 5.5, 14, 1, true), []);
  const alpha = useMemo(beamAlpha, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let next = 0; // walks world.drops, skipping taken ones, without allocating
    for (let i = 0; i < DROP_SLOTS; i++) {
      const g = groups.current[i];
      if (!g) continue;
      while (next < world.drops.length && world.drops[next]!.taken) next++;
      const d = world.drops[next++];
      if (!d) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(d.x, d.y + 1.0 + Math.sin(t * 2 + i) * 0.14, d.z);
      g.rotation.y = t * 1.3 + i;
      const rarity = d.itemId ? (ITEMS[d.itemId]?.rarity ?? "common") : null;
      const color = rarity ? RARITY_COLOR[rarity] : d.potion ? "#e2707f" : "#e8c169";
      const mat = mats.current[i];
      if (mat) {
        mat.color.copy(col(color));
        mat.emissive.copy(col(color));
      }
      // Anything better than common gets a light beam you can spot from afar.
      const beam = beams.current[i];
      if (beam) {
        beam.visible = !!rarity && rarity !== "common";
        if (beam.visible) {
          beam.position.set(d.x, d.y + 2.75, d.z);
          const bm = beam.material as THREE.MeshBasicMaterial;
          bm.color.copy(col(color));
          bm.opacity = 0.5 + Math.sin(t * 3 + i) * 0.12;
        }
      }
    }
  });

  return (
    <>
      {Array.from({ length: DROP_SLOTS }).map((_, i) => (
        <mesh
          key={`beam${i}`}
          geometry={beamGeom}
          visible={false}
          renderOrder={3}
          ref={(el) => {
            beams.current[i] = el;
          }}
        >
          <meshBasicMaterial
            alphaMap={alpha}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {Array.from({ length: DROP_SLOTS }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh castShadow>
            <octahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial
              ref={(m) => {
                mats.current[i] = m as THREE.MeshStandardMaterial;
              }}
              color="#e8c169"
              emissive="#e8c169"
              emissiveIntensity={0.7}
              roughness={0.35}
              metalness={0.2}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.95}>
            <circleGeometry args={[0.6, 20]} />
            <meshBasicMaterial color="#ffd79a" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** A soft four-point star, drawn once: hit sparks are additive sprites of it. */
let starTexture: THREE.CanvasTexture | null = null;
function starSprite() {
  if (starTexture || typeof document === "undefined") return starTexture;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.25, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.fillStyle = "rgba(255,255,255,0.9)";
  for (const [w, h] of [
    [4, 30],
    [30, 4],
  ] as const) {
    g.beginPath();
    g.ellipse(32, 32, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  starTexture = new THREE.CanvasTexture(c);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  return starTexture;
}

export function SparkViews() {
  const meshes = useRef<Array<THREE.Sprite | null>>([]);
  const map = useMemo(starSprite, []);

  useFrame(() => {
    let next = 0;
    for (let i = 0; i < SPARK_SLOTS; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      while (next < world.sparks.length && world.sparks[next]!.ring) next++;
      const s = world.sparks[next++];
      if (!s) {
        mesh.visible = false;
        continue;
      }
      const age = (world.time - s.born) / s.life;
      if (age >= 1) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(s.x, s.y + age * 0.6, s.z);
      // Burst out fast, then fade; the star spins a quarter turn as it goes.
      mesh.scale.setScalar(s.size * 2.6 * (0.5 + Math.sqrt(age) * 1.4));
      const mat = mesh.material as THREE.SpriteMaterial;
      mat.rotation = age * 1.6;
      mat.color.copy(col(s.color));
      mat.opacity = (1 - age) * (1 - age);
    }
  });

  return (
    <>
      {Array.from({ length: SPARK_SLOTS }).map((_, i) => (
        <sprite
          key={i}
          visible={false}
          renderOrder={6}
          ref={(el) => {
            meshes.current[i] = el;
          }}
        >
          <spriteMaterial
            map={map}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </>
  );
}

const RING_SLOTS = 8;

/** Flat expanding shockwave rings (landing, Emberburst, Gale Step, slams). */
export function RingViews() {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const geom = useMemo(() => new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), []);
  useFrame(() => {
    let next = 0;
    for (let i = 0; i < RING_SLOTS; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      while (next < world.sparks.length && !world.sparks[next]!.ring) next++;
      const s = world.sparks[next++];
      const age = s ? (world.time - s.born) / s.life : 1;
      if (!s || age >= 1) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(s.x, heightAt(s.x, s.z) + 0.15, s.z);
      mesh.scale.setScalar(s.size * (0.35 + age * 0.75));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(col(s.color));
      mat.opacity = (1 - age) * 0.7;
    }
  });
  return (
    <>
      {Array.from({ length: RING_SLOTS }).map((_, i) => (
        <mesh
          key={i}
          geometry={geom}
          visible={false}
          renderOrder={4}
          ref={(el) => {
            meshes.current[i] = el;
          }}
        >
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

const ZONE_SLOTS = 10;
const coneCache = new Map<number, THREE.BufferGeometry>();
function coneGeom(arc: number) {
  const key = Math.round(arc * 100);
  let g = coneCache.get(key);
  if (!g) {
    g = new THREE.CircleGeometry(1, 32, -arc / 2, arc).rotateX(-Math.PI / 2);
    coneCache.set(key, g);
  }
  return g;
}

/**
 * Enemy attack zones: a faint full-size outline shows exactly where the hit
 * lands, and a brighter fill grows to the edge as the windup completes.
 */
export function ZoneViews() {
  const slots = useRef<Array<{ g: THREE.Group; outline: THREE.Mesh; fill: THREE.Mesh } | null>>([]);
  const circle = useMemo(() => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), []);
  const plane = useMemo(
    () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2),
    [],
  );

  useFrame(() => {
    const active: Array<{ z: Zone; t: number; striking: boolean; friendly?: boolean }> = [];
    for (const r of world.rains) {
      active.push({
        z: { kind: "circle", x: r.x, z: r.z, r: r.r },
        t: 1,
        striking: false,
        friendly: true,
      });
    }
    for (const e of world.enemies) {
      if (!e.zones.length) continue;
      if (e.phase !== "windup" && e.phase !== "strike" && e.phase !== "charge") continue;
      for (const z of e.zones)
        active.push({
          z,
          t: e.phase === "windup" ? e.telegraph : 1,
          striking: e.phase !== "windup",
        });
    }
    for (let i = 0; i < ZONE_SLOTS; i++) {
      const slot = slots.current[i];
      if (!slot) continue;
      const a = active[i];
      if (!a) {
        slot.g.visible = false;
        continue;
      }
      const { z, t } = a;
      slot.g.visible = true;
      slot.g.position.set(z.x, heightAt(z.x, z.z) + 0.12, z.z);
      const om = slot.outline.material as THREE.MeshBasicMaterial;
      const fm = slot.fill.material as THREE.MeshBasicMaterial;
      om.color.copy(col(a.friendly ? "#f3d38a" : "#ff5a36"));
      fm.color.copy(col(a.friendly ? "#f3d38a" : "#ff3d1f"));
      om.opacity = a.striking ? 0.3 : 0.12 + t * 0.08;
      fm.opacity = a.striking ? 0.38 : 0.14 + t * 0.24;
      if (z.kind === "circle") {
        slot.g.rotation.y = 0;
        slot.outline.geometry = circle;
        slot.fill.geometry = circle;
        slot.outline.scale.setScalar(z.r);
        slot.fill.scale.setScalar(z.r * Math.max(0.05, t));
      } else if (z.kind === "cone") {
        slot.g.rotation.y = z.yaw - Math.PI / 2;
        const g = coneGeom(z.arc);
        slot.outline.geometry = g;
        slot.fill.geometry = g;
        slot.outline.scale.setScalar(z.r);
        slot.fill.scale.setScalar(z.r * Math.max(0.05, t));
      } else {
        slot.g.rotation.y = z.yaw;
        slot.outline.geometry = plane;
        slot.fill.geometry = plane;
        slot.outline.scale.set(z.w, 1, z.len);
        slot.fill.scale.set(z.w, 1, z.len * Math.max(0.03, t));
      }
    }
  });

  return (
    <>
      {Array.from({ length: ZONE_SLOTS }).map((_, i) => (
        <group
          key={i}
          visible={false}
          ref={(g) => {
            if (!g) return;
            slots.current[i] = {
              g,
              outline: g.children[0] as THREE.Mesh,
              fill: g.children[1] as THREE.Mesh,
            };
          }}
        >
          <mesh renderOrder={5}>
            <circleGeometry args={[1, 8]} />
            <meshBasicMaterial
              color="#ff5a36"
              transparent
              opacity={0.2}
              depthWrite={false}
              depthTest={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh renderOrder={6} position-y={0.01}>
            <circleGeometry args={[1, 8]} />
            <meshBasicMaterial
              color="#ff3d1f"
              transparent
              opacity={0.4}
              depthWrite={false}
              depthTest={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

const FLOAT_SLOTS = 12;
const _proj = new THREE.Vector3();

/**
 * Floating damage / state numbers. DOM text keeps them crisp and readable; one
 * overlay with 12 reused spans is projected here in a single pass (instead of a
 * React root + projection per label), and only `transform`/`opacity` change per
 * frame so the browser never re-lays-out the text while it floats.
 */
export function FloaterViews() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const labels = useRef<HTMLSpanElement[]>([]);
  const shown = useRef<Array<{ text: string; color: string; big: boolean; id: number }>>([]);

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return undefined;
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5";
    const spans: HTMLSpanElement[] = [];
    for (let i = 0; i < FLOAT_SLOTS; i++) {
      const el = document.createElement("span");
      el.className = "select-none whitespace-nowrap";
      // Chunky rounded numbers with a dark outline, readable over any ground.
      el.style.cssText =
        "position:absolute;left:0;top:0;opacity:0;will-change:transform,opacity;" +
        'font-family:ui-rounded,"SF Pro Rounded","Arial Rounded MT Bold","Nunito",system-ui,sans-serif;' +
        "font-weight:900;letter-spacing:.02em;-webkit-text-stroke:4px rgba(38,14,8,.92);paint-order:stroke fill;" +
        "text-shadow:0 2px 0 rgba(38,14,8,.9)";
      layer.appendChild(el);
      spans.push(el);
    }
    host.appendChild(layer);
    labels.current = spans;
    shown.current = spans.map(() => ({ text: "", color: "", big: false, id: -1 }));
    return () => {
      layer.remove();
      labels.current = [];
    };
  }, [gl]);

  useFrame(() => {
    const spans = labels.current;
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i]!;
      const f = world.floaters[world.floaters.length - 1 - i];
      const age = f ? (world.time - f.born) / 0.9 : 1;
      if (!f || age >= 1) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        continue;
      }
      // Rise and drift a little to one side (alternating), so stacked hits spread out.
      const drift = (f.id % 2 === 0 ? 1 : -1) * age * 0.5;
      _proj.set(f.x + drift, f.y + 0.3 + age * 1.3, f.z).project(camera);
      if (_proj.z > 1) {
        el.style.opacity = "0"; // behind the camera
        continue;
      }
      const last = shown.current[i]!;
      if (last.text !== f.text) el.textContent = last.text = f.text;
      if (last.color !== f.color) el.style.color = last.color = f.color;
      if (last.big !== f.big || last.id === -1) {
        el.style.fontSize = f.big ? "30px" : "21px";
        last.big = f.big;
        last.id = 0;
      }
      const x = (_proj.x * 0.5 + 0.5) * size.width;
      const y = (-_proj.y * 0.5 + 0.5) * size.height;
      // Pop: overshoot, then settle.
      const scale = age < 0.08 ? 0.6 + age * 12.5 : age < 0.2 ? 1.6 - (age - 0.08) * 5 : 1;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = (age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3).toFixed(3);
    }
  });

  return null;
}

const PROJ_SLOTS = 16;

/** Arrows (thin streaks) and arcane bolts (glowing orbs). */
export function ProjectileViews() {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const arrow = useMemo(
    () => new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6).rotateX(Math.PI / 2),
    [],
  );
  const orb = useMemo(() => new THREE.IcosahedronGeometry(0.32, 1), []);
  useFrame(() => {
    for (let i = 0; i < PROJ_SLOTS; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const pr = world.projectiles[i];
      if (!pr) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.geometry = pr.radius > 0 ? orb : arrow;
      m.position.set(pr.x, pr.y, pr.z);
      m.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
      m.scale.setScalar(pr.big ? 1.4 : 1);
      (m.material as THREE.MeshBasicMaterial).color.copy(col(pr.color));
    }
  });
  return (
    <>
      {Array.from({ length: PROJ_SLOTS }).map((_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            meshes.current[i] = el;
          }}
        >
          <meshBasicMaterial />
        </mesh>
      ))}
    </>
  );
}

/** Pulsing ring under the locked-on enemy. */
export function LockRing() {
  const ref = useRef<THREE.Mesh>(null);
  const geom = useMemo(() => new THREE.RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2), []);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const e = lockedEnemy();
    m.visible = !!e;
    if (!e) return;
    const r = enemyDef(e.type).scale * 0.5 + 0.4;
    m.position.set(e.x, heightAt(e.x, e.z) + 0.1, e.z);
    m.scale.setScalar(r * (1 + Math.sin(state.clock.elapsedTime * 5) * 0.06));
  });
  return (
    <mesh ref={ref} geometry={geom} visible={false} renderOrder={4}>
      <meshBasicMaterial
        color="#f3c969"
        transparent
        opacity={0.8}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
