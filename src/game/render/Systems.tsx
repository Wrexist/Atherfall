import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { input, pollInput } from "../core/input";
import { lockedEnemy, stepWorld, world } from "../core/sim";
import { heightAt } from "../world/terrain";
import { COLLIDERS } from "../world/layout";

const BASE_DISTANCE = 9.2;
const HEAD = 1.55;

/** Only boulders and cottages block the camera; trees are allowed to overlap. */
const CAMERA_BLOCKERS = COLLIDERS.filter((c) => c.r >= 1.5);

// Fixed sun direction and the shadow camera's axes (it looks at its target with +Y up).
const SUN_OFFSET = new THREE.Vector3(-42, 58, 34);
const SUN_DIR = SUN_OFFSET.clone().normalize();
const SUN_RIGHT = new THREE.Vector3(0, 1, 0).cross(SUN_DIR).normalize();
const SUN_UP = SUN_DIR.clone().cross(SUN_RIGHT).normalize();
const _focus = new THREE.Vector3();

/**
 * Single per-frame driver: input -> simulation -> camera.
 * Mounted first so every view component reads already-updated state.
 */
export function Systems({ sunRef }: { sunRef: React.RefObject<THREE.DirectionalLight | null> }) {
  const camera = useThree((s) => s.camera);
  const current = useRef(new THREE.Vector3(0, 8, 14));
  const lookAt = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());

  useFrame(({ clock }, deltaRaw) => {
    const dt = Math.min(deltaRaw, 0.05);
    pollInput();
    stepWorld(dt);

    const p = world.player;
    // Lock-on: swing the camera round to keep the target in view ahead of the player.
    const lock = lockedEnemy();
    if (lock) {
      const want = Math.atan2(lock.x - p.x, lock.z - p.z);
      if (Math.hypot(lock.x - p.x, lock.z - p.z) > 1.5) {
        let diff = want - input.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        input.yaw += diff * (1 - Math.exp(-5 * dt));
      }
    }
    const targetX = p.x;
    const targetY = p.y + HEAD;
    const targetZ = p.z;

    const cosP = Math.cos(input.pitch);
    let dist = BASE_DISTANCE;

    // Pull the camera in when terrain would block the view.
    const dirX = -Math.sin(input.yaw) * cosP;
    const dirZ = -Math.cos(input.yaw) * cosP;
    const dirY = Math.sin(input.pitch);
    // Also pull in for solid props (trees, rocks, cottages) so the view never
    // ends up inside foliage or walls.
    for (let i = 3; i <= 12; i++) {
      const t = (i / 12) * BASE_DISTANCE;
      const sx = targetX + dirX * t;
      const sz = targetZ + dirZ * t;
      const sy = targetY + dirY * t;
      const gh = heightAt(sx, sz);
      let blocked = sy < gh + 0.9;
      if (!blocked && sy < gh + 5.5) {
        for (const c of CAMERA_BLOCKERS) {
          const dx = sx - c.x;
          const dz = sz - c.z;
          const rr = c.r + 0.7;
          if (dx * dx + dz * dz < rr * rr) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        dist = Math.max(3.2, t - 0.6);
        break;
      }
    }

    desired.current.set(targetX + dirX * dist, targetY + dirY * dist, targetZ + dirZ * dist);
    const ground = heightAt(desired.current.x, desired.current.z) + 0.85;
    if (desired.current.y < ground) desired.current.y = ground;

    const k = 1 - Math.exp(-11 * dt);
    current.current.lerp(desired.current, k);

    camera.position.copy(current.current);
    lookAt.current.set(targetX, targetY + 0.25, targetZ);
    const shake = world.cameraShake;
    if (shake > 0.001) {
      // Smooth layered sine "noise" instead of per-frame random jitter: reads as
      // a jolt, not a flicker, and doesn't vary with frame rate.
      const t = clock.elapsedTime;
      const s = shake * 0.16;
      camera.position.x += s * (Math.sin(t * 41.3) + 0.6 * Math.sin(t * 23.7 + 0.8));
      camera.position.y += s * (Math.sin(t * 37.1 + 1.3) + 0.6 * Math.sin(t * 19.9));
    }
    camera.lookAt(lookAt.current);
    // Small roll kick on heavy hits.
    if (shake > 0.001) camera.rotateZ(shake * 0.035 * Math.sin(clock.elapsedTime * 29));

    const sun = sunRef.current;
    if (sun) {
      // Follow the player, but move the shadow box in whole shadow-map texels
      // (in the light's own plane) so shadow edges don't crawl as you walk.
      const cam = sun.shadow.camera;
      const texel = (cam.right - cam.left) / sun.shadow.mapSize.width;
      _focus.set(p.x, p.y, p.z);
      const u = Math.round(_focus.dot(SUN_RIGHT) / texel) * texel;
      const v = Math.round(_focus.dot(SUN_UP) / texel) * texel;
      const w = _focus.dot(SUN_DIR);
      _focus.copy(SUN_RIGHT).multiplyScalar(u).addScaledVector(SUN_UP, v).addScaledVector(SUN_DIR, w);
      sun.target.position.copy(_focus);
      sun.position.copy(_focus).add(SUN_OFFSET);
      sun.target.updateMatrixWorld();
    }
  });

  return null;
}
