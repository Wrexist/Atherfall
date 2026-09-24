import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { enemyDef } from "../data/enemies";
import { NPCS } from "../world/layout";
import { heightAt } from "../world/terrain";
import { world } from "../core/sim";
import { useGame } from "../core/store";

/** Clip name per logical animation state. */
const CLIP: Record<string, string> = {
  idle: "idle",
  walk: "walk",
  sprint: "sprint",
  jump: "jump",
  fall: "fall",
  attack: "attack-melee-right",
  windup: "interact-right",
  die: "die",
  talk: "emote-yes",
};

const ONCE = new Set(["attack", "die", "windup"]);

function useCharacter(url: string, tint?: string) {
  const gltf = useGLTF(url);
  return useMemo(() => {
    const scene = cloneSkeleton(gltf.scene) as THREE.Group;
    const materials: THREE.MeshStandardMaterial[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const mat = src.clone();
      if (tint) mat.color.lerp(new THREE.Color(tint), 0.45);
      mesh.material = mat;
      materials.push(mat);
    });
    return { scene, materials, animations: gltf.animations };
  }, [gltf.scene, gltf.animations, tint]);
}

function useAnimator(
  root: React.RefObject<THREE.Group | null>,
  animations: THREE.AnimationClip[],
) {
  const { actions } = useAnimations(animations, root);
  const current = useRef<string>("");
  return (state: string, speed = 1) => {
    if (current.current === state) {
      const a = actions[CLIP[state] ?? ""];
      if (a) a.timeScale = speed;
      return;
    }
    const next = actions[CLIP[state] ?? "idle"];
    const prev = actions[CLIP[current.current] ?? ""];
    if (!next) return;
    next.reset();
    next.timeScale = speed;
    if (ONCE.has(state)) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.fadeIn(0.14).play();
    if (prev && prev !== next) prev.fadeOut(0.14);
    current.current = state;
  };
}

function flashMaterials(materials: THREE.MeshStandardMaterial[], amount: number, color: string) {
  for (const m of materials) {
    m.emissive.set(color);
    m.emissiveIntensity = amount;
  }
}

export function PlayerView() {
  const group = useRef<THREE.Group>(null);
  const { scene, materials, animations } = useCharacter("/models/mini/hero.glb");
  const play = useAnimator(group, animations);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = world.player;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    play(p.anim, p.anim === "attack" ? 1.7 : p.anim === "sprint" ? 1.15 : 1);
    flashMaterials(materials, p.hitFlash * 2.2, "#ff5a4a");
    g.visible = !(p.dead && p.deathTimer > 4);
  });

  return (
    <group ref={group} scale={2.15}>
      <primitive object={scene} />
    </group>
  );
}

function EnemyView({ index }: { index: number }) {
  const runtime = world.enemies[index]!;
  const def = enemyDef(runtime.type);
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Group>(null);
  const barFill = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const { scene, materials, animations } = useCharacter(def.model, def.tint);
  const play = useAnimator(inner, animations);
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    const g = group.current;
    const e = world.enemies[index];
    if (!g || !e) return;
    const alive = e.phase !== "dead";
    g.visible = alive || e.respawnIn > def.respawnDelay - 2.5;
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = e.yaw;
    play(e.anim === "walk" && e.phase === "chase" ? "sprint" : e.anim, e.anim === "attack" ? 1.6 : 1);
    flashMaterials(materials, e.hitFlash * 2.5, "#ffb3a0");

    if (bar.current) {
      const show = alive && (e.aggro || e.hp < e.maxHp);
      bar.current.visible = show && !def.boss;
      if (show) {
        bar.current.quaternion.copy(camera.quaternion);
        if (barFill.current) {
          const ratio = Math.max(0, e.hp / e.maxHp);
          barFill.current.scale.x = ratio;
          barFill.current.position.x = -(1 - ratio) * 0.5;
        }
      }
    }
    if (ring.current) {
      const active = e.phase === "windup";
      ring.current.visible = active;
      if (active) {
        const s = def.attackRange * (0.45 + e.telegraph * 0.75);
        ring.current.scale.setScalar(s);
        (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + e.telegraph * 0.5;
      }
    }
  });

  const barY = def.boss ? 3.9 : def.scale * 1.2;

  return (
    <group ref={group}>
      <group ref={inner} scale={def.scale}>
        <primitive object={scene} />
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.08} visible={false}>
        <ringGeometry args={[0.72, 1, 28]} />
        <meshBasicMaterial color="#ff5d3d" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <group ref={bar} position={[0, barY, 0]} visible={false}>
        <mesh>
          <planeGeometry args={[1.05, 0.15]} />
          <meshBasicMaterial color="#1b140f" transparent opacity={0.75} depthTest={false} />
        </mesh>
        <mesh ref={barFill} position={[0, 0, 0.01]}>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#d8543f" depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

export function EnemyViews() {
  return (
    <>
      {world.enemies.map((e, i) => (
        <EnemyView key={e.id} index={i} />
      ))}
    </>
  );
}

function NpcView({ npc }: { npc: (typeof NPCS)[number] }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useCharacter(npc.model);
  const play = useAnimator(group, animations);
  const questStep = useGame((s) => s.questStep);
  const complete = useGame((s) => s.questComplete);
  const marker = useRef<THREE.Mesh>(null);

  useEffect(() => {
    play("idle");
  }, [play]);

  const wants =
    npc.id === "sela" &&
    !complete &&
    (questStep === 0 || questStep === 5);

  useFrame((state) => {
    if (marker.current) {
      marker.current.visible = wants;
      marker.current.position.y = 3 + Math.sin(state.clock.elapsedTime * 2.4) * 0.16;
      marker.current.rotation.y += 0.02;
    }
  });

  return (
    <group position={[npc.x, 0, npc.z]} rotation-y={npc.yaw}>
      <group ref={group} scale={npc.scale}>
        <primitive object={scene} />
      </group>
      <mesh ref={marker} position={[0, 3, 0]} visible={false}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial
          color="#f6c453"
          emissive="#f0a92c"
          emissiveIntensity={1.4}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}

export function NpcViews() {
  return (
    <>
      {NPCS.map((npc) => (
        <group key={npc.id} position={[0, heightAt(npc.x, npc.z), 0]}>
          <NpcView npc={npc} />
        </group>
      ))}
    </>
  );
}
