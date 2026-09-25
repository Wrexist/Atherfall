import { useGLTF } from "@react-three/drei";
import { assetUrl } from "../core/assets";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { enemyDef } from "../data/enemies";
import { ARCHETYPES } from "../data/archetypes";
import { NPCS } from "../world/layout";
import { heightAt } from "../world/terrain";
import { world } from "../core/sim";
import { useGame } from "../core/store";
import { QUESTS } from "../data/quests";
import { DODGE, SWINGS } from "../data/combat";
import { col } from "./colors";
import { liteMaterial, useLiteMaterials } from "./materials";
import { KAYKIT_ANIMATIONS, rigFor, type RigInfo } from "./rigs";

type CharMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

/**
 * How long the game holds these states, in seconds. KayKit clips are stretched
 * or squeezed to fit, so a swing's visible impact lands on its hit window.
 */
const FIT_SECONDS: Record<string, number> = {
  attack1: SWINGS[0]!.duration,
  attack2: SWINGS[1]!.duration,
  attack3: SWINGS[2]!.duration,
  dodge: DODGE.duration,
};

const ONCE = new Set([
  "attack",
  "attack1",
  "attack2",
  "attack3",
  "dodge",
  "burst",
  "ward",
  "die",
  "windup",
  "hit",
]);

export function useCharacter(url: string, tint?: string) {
  const gltf = useGLTF(assetUrl(url));
  // KayKit characters share one rig, so their clips ship once for all of them.
  const shared = useGLTF(assetUrl(KAYKIT_ANIMATIONS));
  const rig = rigFor(url);
  const lite = useLiteMaterials();
  const character = useMemo(() => {
    const scene = cloneSkeleton(gltf.scene) as THREE.Group;
    const materials: CharMaterial[] = [];
    const owned: THREE.Material[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Skinned meshes can animate outside their bind-pose bounds (a wide swing,
      // a death fall); culling them by those bounds made limbs vanish at the
      // screen edge.
      mesh.frustumCulled = false;
      const src = (
        Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      ) as THREE.MeshStandardMaterial;
      // Each character gets its own material (hit flashes are per character).
      const mat = (lite ? liteMaterial(src) : src).clone() as CharMaterial;
      // Glowing eyes keep their colour whatever the creature's tint.
      const glows = src.name === "Glow" || (src.emissive && src.emissive.getHex() !== 0);
      if (tint && !glows) mat.color.lerp(new THREE.Color(tint), 0.45);
      mesh.material = mat;
      owned.push(mat);
      if (!glows) materials.push(mat);
    });
    const animations = rig.kind === "kaykit" ? shared.animations : gltf.animations;
    return { scene, materials, animations, rig, owned };
  }, [gltf.scene, gltf.animations, shared.animations, rig, tint, lite]);
  // The per-character material clones are this character's alone: free them
  // when it goes (a class change, another player leaving). Textures and
  // geometry are shared with the loaded model and stay.
  useEffect(() => () => character.owned.forEach((m) => m.dispose()), [character]);
  return character;
}

/**
 * Own AnimationMixer per character (instead of drei's useAnimations, which
 * advances every mixer every frame). Callers decide when to `update`, so far
 * or hidden characters can tick slowly or not at all.
 */
/** Bones above the hips (three.js drops the dots: "upperarm.l" is "upperarml"). */
const UPPER_BONE = /^(spine|chest|upperarm|lowerarm|wrist|hand|handslot|head)/;

export function useAnimator(
  root: React.RefObject<THREE.Group | null>,
  animations: THREE.AnimationClip[],
  info: RigInfo,
) {
  const rig = useRef<{
    mixer: THREE.AnimationMixer | null;
    actions: Record<string, THREE.AnimationAction>;
  }>({
    mixer: null,
    actions: {},
  });
  const current = useRef<string>("");
  const lastKey = useRef(-1);
  /** Actions playing now, so any switch fades out exactly these. */
  const active = useRef<THREE.AnimationAction[]>([]);
  const halves = useRef(new Map<string, THREE.AnimationAction>());

  const bind = useCallback(() => {
    const r = rig.current;
    if (!r.mixer && root.current) {
      r.mixer = new THREE.AnimationMixer(root.current);
      for (const clip of animations) r.actions[clip.name] = r.mixer.clipAction(clip);
    }
    return r;
  }, [root, animations]);

  useEffect(
    () => () => {
      const r = rig.current;
      if (r.mixer) {
        r.mixer.stopAllAction();
        r.mixer.uncacheRoot(r.mixer.getRoot());
      }
      rig.current = { mixer: null, actions: {} };
      current.current = "";
      active.current = [];
      halves.current.clear();
    },
    [animations],
  );

  const update = useCallback((dt: number) => bind().mixer?.update(dt), [bind]);

  const play = useCallback(
    (state: string, speed = 1, key = 0) => {
      const { actions } = bind();
      const clips = info.clips;
      const restart = key !== lastKey.current && ONCE.has(state);
      lastKey.current = key;
      const next = actions[clips[state] ?? clips["idle"] ?? ""];
      // KayKit clips are fitted to how long the game holds the state.
      const hold = info.kind === "kaykit" ? FIT_SECONDS[state] : undefined;
      const fit = hold && next ? next.getClip().duration / hold : 0;
      const rate = fit || speed;
      if (current.current === state && !restart) {
        const a = actions[clips[state] ?? ""];
        if (a) a.timeScale = rate;
        return;
      }
      if (!next) return;
      next.reset();
      next.timeScale = rate;
      if (ONCE.has(state)) {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = false;
      }
      const fade = state.startsWith("attack") || state === "dodge" ? 0.06 : 0.14;
      for (const a of active.current) if (a !== next) a.fadeOut(fade);
      next.fadeIn(fade).play();
      active.current = [next];
      current.current = state;
    },
    [bind, info],
  );

  /** The upper or lower half of a clip (by bone), made once per clip. */
  const half = useCallback(
    (clipName: string, upper: boolean) => {
      const { mixer, actions } = bind();
      const key = `${clipName}@${upper ? "up" : "low"}`;
      const hit = halves.current.get(key);
      if (hit) return hit;
      const src = actions[clipName]?.getClip();
      if (!mixer || !src) return null;
      const tracks = src.tracks.filter((t) => UPPER_BONE.test(t.name) === upper);
      const action = mixer.clipAction(new THREE.AnimationClip(key, src.duration, tracks));
      halves.current.set(key, action);
      return action;
    },
    [bind],
  );

  /**
   * Swinging on the move: legs from the walk/run clip, everything above the
   * hips from the attack, so the hero never skates or slows to swing.
   */
  const playSplit = useCallback(
    (armsState: string, legsState: string, key: number) => {
      const clips = info.clips;
      const arms = half(clips[armsState] ?? "", true);
      const legs = half(clips[legsState] ?? "", false);
      if (!arms || !legs) {
        play(armsState, 1, key);
        return;
      }
      const restart = key !== lastKey.current;
      lastKey.current = key;
      const hold = info.kind === "kaykit" ? FIT_SECONDS[armsState] : undefined;
      arms.timeScale = hold ? arms.getClip().duration / hold : 1;
      legs.timeScale = CLIP_SPEED[legsState] ?? 1;
      const name = `${armsState}|${legsState}`;
      if (current.current === name && !restart) return;
      if (restart || !active.current.includes(arms)) {
        arms.reset();
        arms.setLoop(THREE.LoopOnce, 1);
        arms.clampWhenFinished = true;
      }
      if (!active.current.includes(legs)) {
        legs.reset();
        legs.setLoop(THREE.LoopRepeat, Infinity);
      }
      for (const a of active.current) if (a !== arms && a !== legs) a.fadeOut(0.06);
      arms.fadeIn(0.06).play();
      legs.fadeIn(0.06).play();
      active.current = [arms, legs];
      current.current = name;
    },
    [half, info, play],
  );

  return { play, playSplit, update };
}

/** Skips the material writes entirely while nothing changes (the common case). */
function flashMaterials(
  materials: CharMaterial[],
  amount: number,
  color: string,
  last: { amount: number; color: string },
) {
  if (last.amount === amount && (amount === 0 || last.color === color)) return;
  last.amount = amount;
  last.color = color;
  const c = col(color);
  for (const m of materials) {
    m.emissive.copy(c);
    m.emissiveIntensity = amount;
  }
}

/** Animation level of detail: full rate up close, throttled mid-range, frozen far away. */
const ANIM_NEAR = 30;
const ANIM_FAR = 70;

export const CLIP_SPEED: Record<string, number> = {
  swim: 0.7,
  climb: 0.8,
  attack1: 1.9,
  attack2: 1.9,
  attack3: 1.3,
  dodge: 2.2,
  burst: 1.8,
  ward: 1.6,
  hit: 1.6,
  sprint: 1.15,
};

/** Remounts the hero model when the archetype changes. */
export function PlayerView() {
  const archetype = useGame((s) => s.archetype);
  return <PlayerModel key={archetype} url={ARCHETYPES[archetype].model} />;
}

function PlayerModel({ url }: { url: string }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ward = useRef<THREE.Mesh>(null);
  const { scene, materials, animations, rig } = useCharacter(url);
  const { play, playSplit, update } = useAnimator(group, animations, rig);
  const flash = useRef({ amount: -1, color: "" });

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const p = world.player;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    if (p.legs && p.anim.startsWith("attack") && rig.kind === "kaykit")
      playSplit(p.anim, p.legs, p.animKey);
    else play(p.anim, CLIP_SPEED[p.anim] ?? 1, p.animKey);
    update(dt);
    const b = body.current;
    if (b) {
      // Procedural layers: finisher spin, dodge roll, hurt recoil, dash lean.
      // (KayKit has real clips for the spin, roll and flinch.)
      b.rotation.set(0, 0, 0);
      if (rig.proceduralMoves) {
        if (p.action === "attack" && p.comboIdx === 3)
          b.rotation.y = -Math.min(1, p.actionT / 0.34) * Math.PI * 2;
        if (p.action === "dodge") b.rotation.x = Math.min(1, p.actionT / 0.34) * Math.PI * 2;
        if (p.hurtT > 0) b.rotation.x = -p.hurtT * 1.3;
      }
      if (p.action === "gale") b.rotation.x = 0.45;
      if (p.swimming) b.rotation.x = p.anim === "swim" ? 1.15 : 0.35;
    }
    if (ward.current) {
      ward.current.visible = p.wardT > 0 || p.shieldHp > 0;
      const m = ward.current.material as THREE.MeshBasicMaterial;
      m.color.copy(col(p.shieldHp > 0 ? "#b9a4ff" : "#b9d98a"));
      m.opacity = 0.1 + Math.min(1, Math.max(p.wardT, p.shieldT)) * 0.12;
    }
    flashMaterials(
      materials,
      p.dodgeIframe > 0 ? 0.35 : p.hitFlash * 2.2,
      p.dodgeIframe > 0 ? "#9fd4ff" : "#ff5a4a",
      flash.current,
    );
    g.visible = !(p.dead && p.deathTimer > 4);
  });

  return (
    <group ref={group}>
      <group ref={body} position-y={0.85}>
        <group position-y={-0.85} scale={2.15 * rig.scale}>
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
  const { scene, materials, animations, rig } = useCharacter(def.model, def.tint);
  const { play, update } = useAnimator(inner, animations, rig);
  const camera = useThree((s) => s.camera);
  const fog = useThree((s) => s.scene.fog as THREE.Fog | null);
  const flash = useRef({ amount: -1, color: "" });
  const pending = useRef(0);
  const frame = useRef(index % 3);

  useFrame((_, dt) => {
    const g = group.current;
    const e = world.enemies[index];
    if (!g || !e) return;
    const alive = e.phase !== "dead";
    const dist = Math.hypot(e.x - camera.position.x, e.z - camera.position.z);
    // Past the fog it's invisible anyway: skip drawing, skinning and animation.
    const inRange = dist < (fog ? fog.far : 200) + 4;
    g.visible = inRange && (alive || e.respawnIn > def.respawnDelay - 2.5);
    if (!g.visible) {
      pending.current = 0;
      if (bar.current) bar.current.visible = false;
      return;
    }
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = e.yaw;
    play(
      e.anim === "walk" && e.phase === "chase" ? "sprint" : e.anim,
      e.anim === "attack" ? 1.6 : e.anim === "windup" ? 1 / Math.max(0.4, e.windupTotal) : 1,
    );
    // Staggered across enemies so throttled ones don't all tick on the same frame.
    pending.current += dt;
    frame.current = (frame.current + 1) % 3;
    if (dist < ANIM_NEAR || (dist < ANIM_FAR && frame.current === 0)) {
      update(pending.current);
      pending.current = 0;
    }
    flashMaterials(
      materials,
      e.hitFlash > 0
        ? e.hitFlash * 2.5
        : e.phase === "windup"
          ? 0.25 + e.telegraph * 0.6
          : e.slowT > 0
            ? 0.3
            : 0,
      e.hitFlash > 0 ? "#ffb3a0" : e.phase === "windup" ? "#ff4a2a" : "#8fc8ff",
      flash.current,
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
      <group ref={inner} scale={def.scale * rig.scale}>
        <primitive object={scene} />
      </group>
      <group ref={bar} position={[0, barY, 0]} visible={false} scale={1.3}>
        <mesh renderOrder={7}>
          <planeGeometry args={[1.12, 0.24]} />
          <meshBasicMaterial color="#f3e2bd" transparent opacity={0.9} depthTest={false} />
        </mesh>
        <mesh position={[0, 0, 0.005]} renderOrder={8}>
          <planeGeometry args={[1.05, 0.17]} />
          <meshBasicMaterial color="#1b140f" transparent opacity={0.85} depthTest={false} />
        </mesh>
        {/* Transparent like its backing, so it's drawn after it: an opaque fill
            went in the opaque pass and the backing was painted over it. */}
        <mesh ref={barFill} position={[0, 0, 0.01]} renderOrder={9}>
          <planeGeometry args={[1, 0.12]} />
          <meshBasicMaterial color="#e2412f" transparent opacity={1} depthTest={false} />
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

/** A name plate (and optional quest mark) drawn once to a canvas, for a sprite. */
function plateTexture(name: string, quest: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.font = "800 44px Nunito, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const w = Math.min(500, g.measureText(name).width + 44);
  // Dark pill with the name, like the mockup.
  g.fillStyle = "rgba(14,22,36,0.72)";
  g.beginPath();
  g.roundRect(256 - w / 2, 128, w, 58, 29);
  g.fill();
  g.fillStyle = "#f4f1ea";
  g.fillText(name, 256, 159);
  if (!quest) {
    // A little "…" speech bubble: this villager has something to say.
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.strokeStyle = "rgba(11,19,32,0.8)";
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(206, 36, 100, 62, 30);
    g.moveTo(240, 96);
    g.lineTo(232, 116);
    g.lineTo(258, 97);
    g.fill();
    g.stroke();
    g.fillStyle = "#3b4658";
    for (const dx of [-24, 0, 24]) {
      g.beginPath();
      g.arc(256 + dx, 67, 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (quest) {
    // Gold diamond with a "!" above the name.
    g.save();
    g.translate(256, 62);
    g.rotate(Math.PI / 4);
    const grad = g.createLinearGradient(-40, -40, 40, 40);
    grad.addColorStop(0, "#ffe68a");
    grad.addColorStop(1, "#e89b2e");
    g.fillStyle = grad;
    g.strokeStyle = "#3a2206";
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(-38, -38, 76, 76, 10);
    g.fill();
    g.stroke();
    g.restore();
    g.fillStyle = "#3a2206";
    g.font = "900 64px Nunito, system-ui, sans-serif";
    g.fillText("!", 256, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** How near the hero must be for a villager's name to show. */
const PLATE_NEAR = 16;

function NpcView({ npc }: { npc: (typeof NPCS)[number] }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations, rig } = useCharacter(npc.model, npc.tint);
  const { play, update } = useAnimator(group, animations, rig);
  const camera = useThree((s) => s.camera);
  const questStep = useGame((s) => s.questStep);
  const complete = useGame((s) => s.questComplete);
  const marker = useRef<THREE.Sprite>(null);

  useEffect(() => {
    play("idle");
  }, [play]);

  const questIdx = useGame((s) => s.questIdx);
  const step = QUESTS[questIdx]?.steps[questStep];
  const wants = npc.id === "sela" && !complete && step?.kind === "talk";
  const plate = useMemo(() => plateTexture(npc.name, wants), [npc.name, wants]);
  useEffect(() => () => plate.dispose(), [plate]);

  useFrame((state, dt) => {
    if (Math.hypot(npc.x - camera.position.x, npc.z - camera.position.z) < ANIM_FAR) update(dt);
    if (marker.current) {
      const p = world.player;
      marker.current.visible = wants || Math.hypot(npc.x - p.x, npc.z - p.z) < PLATE_NEAR;
      marker.current.position.y = 3.35 + (wants ? Math.sin(state.clock.elapsedTime * 2.4) * 0.1 : 0);
    }
  });

  return (
    <group position={[npc.x, 0, npc.z]} rotation-y={npc.yaw}>
      <group ref={group} scale={npc.scale * rig.scale}>
        <primitive object={scene} />
      </group>
      {/* Name plate (and the quest "!"), always facing the camera. */}
      <sprite ref={marker} position={[0, 3.35, 0]} scale={[3.4, 1.28, 1]} visible={false} renderOrder={5}>
        <spriteMaterial map={plate} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/**
 * The Warden's statue on the fountain: the knight model in a proud pose,
 * turned to stone (posed once, never animated).
 */
export function Statue({ x, z, y, scale }: { x: number; z: number; y: number; scale: number }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations, rig } = useCharacter("/models/kaykit/knight.glb");
  const { play, update } = useAnimator(group, animations, rig);
  useEffect(() => {
    play("emote-cheer");
    update(0.45);
    const stone = new THREE.MeshStandardMaterial({ color: "#cfc8ba", roughness: 0.92, flatShading: true });
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = stone;
    });
    return () => stone.dispose();
  }, [scene, play, update]);
  return (
    <group position={[x, y, z]} rotation-y={0}>
      {/* A stepped stone pillar rising from the basin. */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.55, 0.7, 1.6, 8]} />
        <meshStandardMaterial color="#c9c2b4" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.22, 8]} />
        <meshStandardMaterial color="#d6cfc1" roughness={0.95} flatShading />
      </mesh>
      <group ref={group} position={[0, 1.8, 0]} scale={scale * rig.scale}>
        <primitive object={scene} />
      </group>
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
