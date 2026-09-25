import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { enemyDef } from "../data/enemies";
import { ARCHETYPES } from "../data/archetypes";
import { NPCS } from "../world/layout";
import { heightAt } from "../world/terrain";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { QUESTS } from "../data/quests";

/** Clip name per logical animation state. */
const CLIP: Record<string, string> = {
  idle: "idle",
  walk: "walk",
  sprint: "sprint",
  jump: "jump",
  fall: "fall",
  attack: "attack-melee-right",
  attack1: "attack-melee-right",
  attack2: "attack-melee-left",
  attack3: "attack-melee-right",
  dodge: "crouch",
  burst: "attack-kick-right",
  ward: "interact-left",
  hit: "fall",
  swim: "walk",
  tread: "idle",
  climb: "jump",
  hang: "static",
  windup: "interact-right",
  die: "die",
  talk: "emote-yes",
};

const ONCE = new Set(["attack", "attack1", "attack2", "attack3", "dodge", "burst", "ward", "die", "windup", "hit"]);

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
  const lastKey = useRef(-1);
  return (state: string, speed = 1, key = 0) => {
    const restart = key !== lastKey.current && ONCE.has(state);
    lastKey.current = key;
    if (current.current === state && !restart) {
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
    const fade = state.startsWith("attack") || state === "dodge" ? 0.06 : 0.14;
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    current.current = state;
  };
}

function flashMaterials(materials: THREE.MeshStandardMaterial[], amount: number, color: string) {
  for (const m of materials) {
    m.emissive.set(color);
    m.emissiveIntensity = amount;
  }
}

const CLIP_SPEED: Record<string, number> = { swim: 0.7, climb: 0.8, attack1: 1.9, attack2: 1.9, attack3: 1.3, dodge: 2.2, burst: 1.8, ward: 1.6, hit: 1.6, sprint: 1.15 };

/** Remounts the hero model when the archetype changes. */
export function PlayerView() {
  const archetype = useGame((s) => s.archetype);
  return <PlayerModel key={archetype} url={ARCHETYPES[archetype].model} />;
}

function PlayerModel({ url }: { url: string }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ward = useRef<THREE.Mesh>(null);
  const { scene, materials, animations } = useCharacter(url);
  const play = useAnimator(group, animations);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = world.player;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    play(p.anim, CLIP_SPEED[p.anim] ?? 1, p.animKey);
    const b = body.current;
    if (b) {
      // Procedural layers: finisher spin, dodge roll, hurt recoil, dash lean.
      b.rotation.set(0, 0, 0);
      if (p.action === "attack" && p.comboIdx === 3) b.rotation.y = -Math.min(1, p.actionT / 0.34) * Math.PI * 2;
      if (p.action === "dodge") b.rotation.x = Math.min(1, p.actionT / 0.34) * Math.PI * 2;
      if (p.action === "gale") b.rotation.x = 0.45;
      if (p.hurtT > 0) b.rotation.x = -p.hurtT * 1.3;
      if (p.swimming) b.rotation.x = p.anim === "swim" ? 1.15 : 0.35;
    }
    if (ward.current) {
      ward.current.visible = p.wardT > 0 || p.shieldHp > 0;
      const m = ward.current.material as THREE.MeshBasicMaterial;
      m.color.set(p.shieldHp > 0 ? "#b9a4ff" : "#b9d98a");
      m.opacity = 0.1 + Math.min(1, Math.max(p.wardT, p.shieldT)) * 0.12;
    }
    flashMaterials(materials, p.dodgeIframe > 0 ? 0.35 : p.hitFlash * 2.2, p.dodgeIframe > 0 ? "#9fd4ff" : "#ff5a4a");
    g.visible = !(p.dead && p.deathTimer > 4);
  });

  return (
    <group ref={group}>
      <group ref={body} position-y={0.85}>
        <group position-y={-0.85} scale={2.15}>
          <primitive object={scene} />
        </group>
      </group>
      <mesh ref={ward} position-y={1} visible={false}>
        <sphereGeometry args={[1.35, 20, 14]} />
        <meshBasicMaterial color="#b9d98a" transparent opacity={0.18} depthWrite={false} />
      </mesh>
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
    play(e.anim === "walk" && e.phase === "chase" ? "sprint" : e.anim, e.anim === "attack" ? 1.6 : e.anim === "windup" ? 1 / Math.max(0.4, e.windupTotal) : 1);
    flashMaterials(
      materials,
      e.hitFlash > 0 ? e.hitFlash * 2.5 : e.phase === "windup" ? 0.25 + e.telegraph * 0.6 : e.slowT > 0 ? 0.3 : 0,
      e.hitFlash > 0 ? "#ffb3a0" : e.phase === "windup" ? "#ff4a2a" : "#8fc8ff",
    );

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
    inner.current!.rotation.x = e.phase === "stagger" ? -0.35 : 0;
  });

  const barY = def.boss ? 3.9 : def.scale * 1.2;

  return (
    <group ref={group}>
      <group ref={inner} scale={def.scale}>
        <primitive object={scene} />
      </group>
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

  const questIdx = useGame((s) => s.questIdx);
  const step = QUESTS[questIdx]?.steps[questStep];
  const wants = npc.id === "sela" && !complete && step?.kind === "talk";

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
