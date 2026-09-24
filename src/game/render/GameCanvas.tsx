import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { useGame } from "../core/store";
import { Scene } from "./Scene";

const DPR: Record<string, [number, number]> = {
  low: [0.7, 1],
  medium: [1, 1.5],
  high: [1, 2],
};

export function GameCanvas() {
  const quality = useGame((s) => s.quality);
  return (
    <Canvas
      shadows={quality !== "low"}
      dpr={DPR[quality]}
      camera={{ fov: 58, near: 0.5, far: 400, position: [0, 10, 20] }}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.matrixWorldAutoUpdate = true;
      }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
