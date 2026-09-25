import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, useGLTF } from "@react-three/drei";
import { assetUrl } from "../core/assets";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { SAVER_FPS, frameDue } from "../core/frameCap";
import { useSettings } from "../core/settings";
import { useGame } from "../core/store";
import { MODEL_URLS, Scene } from "./Scene";

/** Upper device-pixel-ratio per quality; the adaptive scale below only ever lowers it. */
const MAX_DPR: Record<string, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};
const MIN_SCALE = 0.6;

/**
 * Battery saver: the canvas renders on demand and this asks for a frame at
 * most SAVER_FPS times a second, whatever the screen's refresh rate.
 */
function FrameCap() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = -Infinity;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (frameDue(now, last, SAVER_FPS)) {
        last = now;
        invalidate();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);
  return null;
}

/**
 * A model that fails to download (a dropped connection on mobile data) throws
 * out of the 3D scene. Catch it here and offer a retry in the game's own
 * look, instead of the site's generic error page.
 */
class LoadErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-[var(--ink)] p-6 text-center">
        <h2 className="font-display text-xl tracking-[0.25em] text-[var(--gilt)]">
          CONNECTION LOST
        </h2>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--parchment)]/80">
          Part of the world didn't download. Check your connection and try again. Your progress is
          safe.
        </p>
        <button
          className="min-h-11 rounded-lg border border-[var(--gilt)]/50 bg-[var(--gilt)]/20 px-5 text-sm font-semibold text-[var(--parchment)]"
          // What already arrived is cached, so the retry picks up where it stopped.
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }
}

export function GameCanvas() {
  return (
    <LoadErrorBoundary>
      <GameCanvasInner />
    </LoadErrorBoundary>
  );
}

function GameCanvasInner() {
  const quality = useGame((s) => s.quality);
  // Render continuously only while something moves; menus get on-demand frames
  // so a paused phone isn't burning battery redrawing a still scene.
  const live = useGame((s) => s.screen === "playing" || s.screen === "loading");
  const capped = useSettings((s) => s.batterySaver);
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
    for (const url of MODEL_URLS) useGLTF.preload(assetUrl(url));
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
        frameloop={live && !capped ? "always" : "demand"}
        camera={{ fov: 58, near: 0.5, far: 400, position: [0, 10, 20] }}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          // Neutral keeps the storybook colours as painted (ACES pushed
          // everything towards orange-brown and washed the greens out).
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.0;
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
        {live && capped && <FrameCap />}
        <PerformanceMonitor
          // Capped at 30 fps, judge smoothness against 30, not the screen's rate.
          key={capped ? "capped" : "free"}
          {...(capped ? { bounds: (): [number, number] => [SAVER_FPS - 6, SAVER_FPS - 1] } : {})}
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
