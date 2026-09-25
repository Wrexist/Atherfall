import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useGame } from "../core/store";
import { MODEL_URLS, Scene } from "./Scene";

/** Upper device-pixel-ratio per quality; the adaptive scale below only ever lowers it. */
const MAX_DPR: Record<string, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};
const MIN_SCALE = 0.6;

export function GameCanvas() {
  const quality = useGame((s) => s.quality);
  // Render continuously only while something moves; menus get on-demand frames
  // so a paused phone isn't burning battery redrawing a still scene.
  const live = useGame((s) => s.screen === "playing" || s.screen === "loading");
  // Adaptive resolution: drop render scale when frames are missed, recover when there's headroom.
  const [scale, setScale] = useState(1);
  // Remounting the Canvas is the reliable way to recover a lost WebGL context
  // (iOS drops it under memory pressure or after long backgrounding).
  const [generation, setGeneration] = useState(0);
  const [lost, setLost] = useState(false);
  const canvasKey = `${quality}-${generation}`;
  // r3f deliberately forces a context loss when it disposes a replaced canvas;
  // only the current canvas may report a real loss.
  const currentKey = useRef(canvasKey);
  currentKey.current = canvasKey;

  useEffect(() => setScale(1), [quality]);

  // Start every model download at once instead of in waves as components mount
  // and suspend (a slow chain on mobile data). After mount, so loader progress
  // events never land in the middle of React's first render.
  useEffect(() => {
    for (const url of MODEL_URLS) useGLTF.preload(url);
  }, []);

  const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const dpr = Math.max(0.5, Math.min(deviceDpr, MAX_DPR[quality] ?? 1.5) * scale);

  const restore = useCallback(() => {
    setLost(false);
    setGeneration((g) => g + 1);
  }, []);

  return (
    <>
      <Canvas
        // Antialias is fixed at context creation, so a quality change needs a fresh context.
        key={canvasKey}
        shadows={quality !== "low" ? "percentage" : false}
        dpr={dpr}
        frameloop={live ? "always" : "demand"}
        camera={{ fov: 58, near: 0.5, far: 400, position: [0, 10, 20] }}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          scene.matrixWorldAutoUpdate = true;
          const el = gl.domElement;
          const myKey = canvasKey;
          el.addEventListener("webglcontextlost", (e) => {
            if (myKey !== currentKey.current) return;
            e.preventDefault();
            setLost(true);
            if (useGame.getState().screen === "playing") useGame.setState({ screen: "paused" });
          });
          el.addEventListener("webglcontextrestored", () => {
            if (myKey === currentKey.current) restore();
          });
        }}
      >
        <PerformanceMonitor
          onDecline={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.15).toFixed(2)))}
          onIncline={() => setScale((s) => Math.min(1, +(s + 0.1).toFixed(2)))}
          flipflops={4}
          onFallback={() => setScale(MIN_SCALE)}
        />
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      {lost && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-[var(--ink)]/90 p-6 text-center">
          <p className="max-w-sm text-sm leading-relaxed text-[var(--parchment)]/85">
            Your device paused the graphics to save memory. Your progress is safe.
          </p>
          <button
            className="min-h-11 rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 py-2.5 text-sm font-semibold text-[var(--parchment)]"
            onClick={restore}
          >
            Restore world
          </button>
        </div>
      )}
    </>
  );
}
