import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { heightAt } from "../world/terrain";

/**
 * Emberhollow's square, dressed like the target mockup (docs/art): cobbles
 * round the fountain and along the roads, flower beds, blue banners and a
 * signpost. All procedural (nothing to download) and few draw calls: one mesh
 * per material.
 */

const PLAZA_R = 8.5;
const LIFT = 0.035; // just above the ground, never z-fighting it

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** Irregular warm cobbles with mortar, painted once. */
function cobbleTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#6f6152";
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = 11;
  const cell = 512 / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const off = j % 2 ? cell / 2 : 0;
      const cx = i * cell + off + (rnd() - 0.5) * 8;
      const cy = j * cell + cell / 2 + (rnd() - 0.5) * 8;
      const w = cell * (0.42 + rnd() * 0.08);
      const h = cell * (0.4 + rnd() * 0.08);
      const tone = 150 + rnd() * 50;
      for (const dx of [0, -512, 512]) {
        const x = cx + dx;
        const grad = g.createLinearGradient(x, cy - h, x, cy + h);
        grad.addColorStop(0, `rgb(${tone + 14},${tone + 8},${tone - 4})`);
        grad.addColorStop(1, `rgb(${tone - 14},${tone - 20},${tone - 28})`);
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(x, cy, w, h, (rnd() - 0.5) * 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat shape laid onto the terrain: every vertex takes the ground height. */
function drape(geo: THREE.BufferGeometry, uvScale: number) {
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z) + LIFT);
    uv.setXY(i, x / uvScale, z / uvScale);
  }
  geo.computeVertexNormals();
  return geo;
}

function disc(r: number) {
  const g = new THREE.CircleGeometry(r, 72, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  return drape(g, 1.7);
}

/** A road strip from (x0, z0) to (x1, z1), subdivided so it follows the ground. */
function strip(x0: number, z0: number, x1: number, z1: number, width: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(width, len, 2, Math.ceil(len));
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.atan2(x1 - x0, z1 - z0) + Math.PI);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  return drape(g, 1.7);
}

function bannerTexture() {
  const [c, g] = canvas(128, 256);
  g.clearRect(0, 0, 128, 256);
  // Cloth with a swallow-tail bottom.
  g.fillStyle = "#26478a";
  g.beginPath();
  g.moveTo(4, 0);
  g.lineTo(124, 0);
  g.lineTo(124, 230);
  g.lineTo(64, 196);
  g.lineTo(4, 230);
  g.closePath();
  g.fill();
  g.strokeStyle = "#e3b75a";
  g.lineWidth = 7;
  g.stroke();
  // A gold star-flower emblem.
  g.save();
  g.translate(64, 96);
  g.fillStyle = "#f0c865";
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.ellipse(0, -22, 9, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.rotate(Math.PI / 4);
  }
  g.beginPath();
  g.arc(0, 0, 10, 0, Math.PI * 2);
  g.fillStyle = "#fff0bf";
  g.fill();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SIGNS = ["Blacksmith", "Market", "Farmland", "Forest Trail"];

function signTexture() {
  const [c, g] = canvas(512, 128 * SIGNS.length);
  SIGNS.forEach((text, i) => {
    const y = i * 128;
    const grad = g.createLinearGradient(0, y, 0, y + 128);
    grad.addColorStop(0, "#8a5a36");
    grad.addColorStop(1, "#5e3b22");
    g.fillStyle = grad;
    g.fillRect(0, y, 512, 128);
    g.strokeStyle = "#3b2414";
    g.lineWidth = 10;
    g.strokeRect(5, y + 5, 502, 118);
    g.fillStyle = "#f3e2bd";
    g.font = "800 58px Nunito, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, y + 68);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Plaza({ shadows }: { shadows: boolean }) {
  const built = useMemo(() => {
    // Cobbles: the square plus the roads north (to the woods) and south (the way in).
    const cobbleGeo = mergeGeometries([
      disc(PLAZA_R),
      strip(0, PLAZA_R - 1, -0.5, 17, 3.6),
      strip(0, -PLAZA_R + 1, 0.5, -15, 3.4),
    ])!;
    const cobbleMat = new THREE.MeshStandardMaterial({
      map: cobbleTexture(),
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    // Flower beds ringing the fountain: leafy clumps with bright heads.
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const leafGeo = new THREE.IcosahedronGeometry(0.34, 0);
    leafGeo.scale(1, 0.55, 1);
    const headGeo = new THREE.IcosahedronGeometry(0.11, 0);
    const leaves = new THREE.InstancedMesh(
      leafGeo,
      new THREE.MeshStandardMaterial({ color: "#4f8f3a", roughness: 0.9, flatShading: true }),
      70,
    );
    const heads = new THREE.InstancedMesh(
      headGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }),
      220,
    );
    const palette = ["#ffd24a", "#ffffff", "#ff8fb1", "#b88cff", "#ff7043", "#fff1a8"].map(
      (h) => new THREE.Color(h),
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let li = 0;
    let hi = 0;
    for (let k = 0; k < 70; k++) {
      const a = (k / 70) * Math.PI * 2 + rnd() * 0.05;
      // Gaps north and south where the paths meet the fountain.
      if (Math.abs(Math.sin(a)) > 0.93) continue;
      const r = 3.35 + rnd() * 0.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = heightAt(x, z);
      const sc = 0.8 + rnd() * 0.5;
      m.compose(
        p.set(x, y + 0.12, z),
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6),
        s.set(sc, sc, sc),
      );
      leaves.setMatrixAt(li++, m);
      for (let f = 0; f < 3 && hi < 220; f++) {
        const fx = x + (rnd() - 0.5) * 0.5;
        const fz = z + (rnd() - 0.5) * 0.5;
        m.compose(p.set(fx, y + 0.28 + rnd() * 0.12, fz), q.identity(), s.set(1, 1, 1));
        heads.setMatrixAt(hi, m);
        heads.setColorAt(hi++, palette[Math.floor(rnd() * palette.length)]!);
      }
    }
    leaves.count = li;
    heads.count = hi;

    // Banners on poles at the corners of the square.
    const poleParts: THREE.BufferGeometry[] = [];
    const clothParts: THREE.BufferGeometry[] = [];
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const x = Math.cos(a) * (PLAZA_R - 1.2);
      const z = Math.sin(a) * (PLAZA_R - 1.2);
      const y = heightAt(x, z);
      const pole = new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6);
      pole.translate(x, y + 1.8, z);
      const bar = new THREE.BoxGeometry(1.1, 0.07, 0.07);
      bar.rotateY(-a + Math.PI / 2);
      bar.translate(x, y + 3.45, z);
      poleParts.push(pole, bar);
      const cloth = new THREE.PlaneGeometry(0.95, 1.9);
      cloth.rotateY(-a + Math.PI / 2);
      cloth.translate(x, y + 2.45, z);
      clothParts.push(cloth);
    }
    const wood = new THREE.MeshStandardMaterial({ color: "#5a3a24", roughness: 0.85 });
    const poles = mergeGeometries(poleParts)!;
    const cloths = mergeGeometries(clothParts)!;
    const clothMat = new THREE.MeshStandardMaterial({
      map: bannerTexture(),
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });

    // Signpost at the south entrance, facing the way in.
    const sx = -2.6;
    const sz = 11.2;
    const sy = heightAt(sx, sz);
    const post = new THREE.BoxGeometry(0.22, 3.2, 0.22);
    post.translate(sx, sy + 1.6, sz);
    const signTex = signTexture();
    const boards: THREE.BufferGeometry[] = [];
    SIGNS.forEach((_, i) => {
      const b = new THREE.PlaneGeometry(2.3, 0.5);
      // Each board shows its own row of the texture.
      const uv = b.getAttribute("uv");
      const n = SIGNS.length;
      for (let v = 0; v < uv.count; v++) {
        uv.setY(v, (n - 1 - i + uv.getY(v)) / n);
      }
      const left = i % 2 === 1;
      b.rotateY(left ? 0.25 : -0.25);
      b.translate(sx + (left ? -0.75 : 0.75), sy + 2.8 - i * 0.58, sz + 0.14 + i * 0.02);
      boards.push(b);
    });
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const signGeo = mergeGeometries(boards)!;
    return {
      cobbleGeo,
      cobbleMat,
      leaves,
      heads,
      poles,
      cloths,
      clothMat,
      wood,
      post,
      signGeo,
      signMat,
    };
  }, []);

  useEffect(
    () => () => {
      for (const o of [built.cobbleGeo, built.poles, built.cloths, built.post, built.signGeo])
        o.dispose();
      built.cobbleMat.map?.dispose();
      built.clothMat.map?.dispose();
      built.signMat.map?.dispose();
      built.leaves.dispose();
      built.heads.dispose();
    },
    [built],
  );

  return (
    <group>
      <mesh geometry={built.cobbleGeo} material={built.cobbleMat} receiveShadow={shadows} />
      <primitive object={built.leaves} />
      <primitive object={built.heads} />
      <mesh geometry={built.poles} material={built.wood} castShadow={shadows} />
      <mesh geometry={built.cloths} material={built.clothMat} castShadow={shadows} />
      <mesh geometry={built.post} material={built.wood} castShadow={shadows} />
      <mesh geometry={built.signGeo} material={built.signMat} castShadow={shadows} />
    </group>
  );
}
