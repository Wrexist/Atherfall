import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { world } from "../core/sim";

// Key frames across the day (dayTime 0..1). Night keeps a strong cool
// "moonlight" so the player and enemy telegraphs stay readable.
const KEYS = [
  { t: 0.0, sky: "#f7d7b4", sun: "#ffd3a4", sunI: 2.2, hemi: 0.95, amb: 0.22 }, // dawn
  { t: 0.25, sky: "#a9d9f2", sun: "#ffe6bf", sunI: 2.8, hemi: 1.05, amb: 0.2 }, // noon
  { t: 0.5, sky: "#f3b98a", sun: "#ffb277", sunI: 2.1, hemi: 0.9, amb: 0.22 }, // dusk
  { t: 0.62, sky: "#6f80b3", sun: "#bccbff", sunI: 1.5, hemi: 0.8, amb: 0.36 }, // blue hour
  { t: 0.75, sky: "#43528a", sun: "#bccbff", sunI: 1.35, hemi: 0.78, amb: 0.4 }, // midnight
  { t: 0.9, sky: "#6a73a6", sun: "#d2c9ff", sunI: 1.5, hemi: 0.8, amb: 0.36 },
  { t: 1.0, sky: "#f7d7b4", sun: "#ffd3a4", sunI: 2.2, hemi: 0.95, amb: 0.22 },
];

export function DayNight({
  sun,
  hemi,
  amb,
}: {
  sun: React.RefObject<THREE.DirectionalLight | null>;
  hemi: React.RefObject<THREE.HemisphereLight | null>;
  amb: React.RefObject<THREE.AmbientLight | null>;
}) {
  const scene = useThree((s) => s.scene);
  const cols = useMemo(
    () => KEYS.map((k) => ({ sky: new THREE.Color(k.sky), sun: new THREE.Color(k.sun) })),
    [],
  );
  const sky = useMemo(() => new THREE.Color(), []);
  const sunC = useMemo(() => new THREE.Color(), []);
  let acc = 0;
  useFrame((_, dt) => {
    // Lighting changes slowly; updating a few times a second is plenty.
    acc += dt;
    if (acc < 0.2) return;
    acc = 0;
    const t = world.dayTime;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1]!.t <= t) i++;
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    const k = (t - a.t) / Math.max(0.0001, b.t - a.t);
    sky.copy(cols[i]!.sky).lerp(cols[i + 1]!.sky, k);
    sunC.copy(cols[i]!.sun).lerp(cols[i + 1]!.sun, k);
    if (scene.background instanceof THREE.Color) scene.background.copy(sky);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(sky);
    if (sun.current) {
      sun.current.color.copy(sunC);
      sun.current.intensity = a.sunI + (b.sunI - a.sunI) * k;
    }
    if (hemi.current) {
      hemi.current.intensity = a.hemi + (b.hemi - a.hemi) * k;
      // Sky fill from above; the ground colour (set once) bounces green from below.
      hemi.current.color.copy(sky).lerp(sunC, 0.35);
    }
    if (amb.current) amb.current.intensity = a.amb + (b.amb - a.amb) * k;
  });
  return null;
}
