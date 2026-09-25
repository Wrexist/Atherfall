// Runs in a headless browser (see render-icons.mjs): renders one 3D piece at a
// time, lit and framed like a game icon, and returns it as an outlined PNG.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const SIZE = 256; // rendered size; the PNG is downscaled for smooth edges
const OUTLINE = "#0b1320";

const canvas = document.createElement("canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
  new RoomEnvironment(),
  0.04,
).texture;
scene.environmentIntensity = 0.55;
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x3a2c22, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-2, 3, 4);
const rim = new THREE.DirectionalLight(0xcfe2ff, 2.2);
rim.position.set(3, 2, -3);
const fill = new THREE.DirectionalLight(0xffe2c0, 0.5);
fill.position.set(3, -1, 2);
scene.add(key, rim, fill);
const camera = new THREE.PerspectiveCamera(20, 1, 0.01, 200);

const loader = new GLTFLoader();
const files = new Map();
const load = (url) => {
  if (!files.has(url)) files.set(url, loader.loadAsync(url));
  return files.get(url);
};

const deg = THREE.MathUtils.degToRad;
const std = (o) => new THREE.MeshStandardMaterial(o);
const gold = () => std({ color: 0xf2c14e, metalness: 0.9, roughness: 0.25 });
const gem = (c, e = 0.45) =>
  std({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.12, flatShading: true });

/** Small hand-built pieces for things the packs lack (rings, charms, crowns and so on). */
const PROCS = {
  ring({ metal = 0xf2c14e, stone = 0xffc93c }) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.2, 20, 64),
      std({ color: metal, metalness: 0.9, roughness: 0.25 }),
    );
    const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.28, 12), gold());
    setting.position.y = 1.15;
    const stoneMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), gem(stone, 0.6));
    stoneMesh.scale.set(1, 0.8, 1);
    stoneMesh.position.y = 1.5;
    g.add(band, setting, stoneMesh);
    return g;
  },
  band() {
    const g = new THREE.Group();
    const leather = std({ color: 0x9a6337, roughness: 0.75 });
    const string = std({ color: 0xe8d9b0, roughness: 0.6 });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 18, 64), leather));
    for (let i = 0; i < 7; i++) {
      const a = -0.6 + i * 0.2;
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 8, 24), string);
      wrap.position.set(Math.cos(a) * 1, Math.sin(a) * 1, 0);
      wrap.rotation.set(0, Math.PI / 2, a);
      g.add(wrap);
    }
    const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), gem(0x52d273, 0.35));
    bead.position.set(-1.0, -0.1, 0.25);
    g.add(bead);
    return g;
  },
  charm() {
    const g = new THREE.Group();
    const glass = std({
      color: 0xff4d00,
      emissive: 0xd42a00,
      emissiveIntensity: 0.5,
      roughness: 0.18,
      metalness: 0.15,
    });
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 24), glass);
    drop.scale.set(1, 1.2, 0.8);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.0, 32), glass);
    tip.position.y = -1.1;
    tip.rotation.z = Math.PI;
    tip.scale.set(1, 1, 0.8);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.35, 16), gold());
    cap.position.y = 0.95;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 12, 32), gold());
    loop.position.y = 1.35;
    g.add(drop, tip, cap, loop);
    return g;
  },
  pearl() {
    const g = new THREE.Group();
    const shell = std({
      color: 0x79c3d6,
      roughness: 0.4,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const half = () =>
      new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), shell);
    const bottom = half();
    bottom.scale.set(1, 0.5, 0.9);
    bottom.rotation.x = Math.PI;
    const top = half();
    top.scale.set(1, 0.5, 0.9);
    top.position.set(0, 0.05, -0.95);
    top.rotation.x = -1.05;
    const pearl = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 48, 32),
      std({
        color: 0xfff6ff,
        roughness: 0.12,
        metalness: 0.25,
        emissive: 0x8a70b0,
        emissiveIntensity: 0.18,
      }),
    );
    pearl.position.set(0, 0.25, 0.1);
    g.add(bottom, top, pearl);
    return g;
  },
  crystal({ color = 0xffc23a }) {
    const g = new THREE.Group();
    const m = gem(color, 0.7);
    const shard = (h, r, x, z, tilt) => {
      const s = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 6), m);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.6, 6), m);
      tip.position.y = h / 2 + r * 0.8;
      s.add(body, tip);
      s.position.set(x, h / 2 - 0.9, z);
      s.rotation.z = tilt;
      return s;
    };
    g.add(
      shard(1.9, 0.42, 0, 0, 0),
      shard(1.2, 0.3, -0.55, 0.1, 0.45),
      shard(1.0, 0.28, 0.55, -0.05, -0.5),
    );
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.7, 0),
      std({ color: 0x6b5d52, roughness: 0.9, flatShading: true }),
    );
    rock.scale.set(1.4, 0.45, 1);
    rock.position.y = -1;
    g.add(rock);
    return g;
  },
  heartseed() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), gem(0xc0283c, 0.45));
    core.scale.set(1, 1.15, 1);
    g.add(core);
    const thorn = std({ color: 0x3e5a2a, roughness: 0.7, flatShading: true });
    const dirs = new THREE.IcosahedronGeometry(1, 0).getAttribute("position");
    const seen = new Set();
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      const k = v
        .toArray()
        .map((n) => n.toFixed(2))
        .join();
      if (seen.has(k)) continue;
      seen.add(k);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), thorn);
      c.position.copy(v.clone().multiplyScalar(1.05));
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      g.add(c);
    }
    return g;
  },
  crown() {
    const g = new THREE.Group();
    const m = gold();
    m.side = THREE.DoubleSide;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 0.92, 0.55, 8, 1, true), m));
    const colors = [0x4aa8ff, 0xff4d6d, 0x62d26f, 0xffd166];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 4), m);
      spike.position.set(Math.cos(a) * 0.95, 0.6, Math.sin(a) * 0.95);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), m);
      ball.position.set(Math.cos(a) * 0.95, 0.98, Math.sin(a) * 0.95);
      g.add(spike, ball);
      if (i % 2 === 0) {
        const jewel = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16, 0),
          gem(colors[i / 2], 0.5),
        );
        jewel.position.set(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0);
        g.add(jewel);
      }
    }
    return g;
  },
};

/** Named pieces from a model file, as plain meshes in their own space. */
async function piece(url, names) {
  const gltf = await load(url);
  const g = new THREE.Group();
  for (const name of [].concat(names)) {
    const src = gltf.scene.getObjectByName(name);
    if (!src) throw new Error(`${name} not found in ${url}`);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const mat = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      g.add(new THREE.Mesh(o.geometry, mat));
    });
  }
  return g;
}

function tint(obj, spec) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (spec.tint) m.color.multiply(new THREE.Color(spec.tint));
      if (spec.glow) {
        m.emissive = new THREE.Color(spec.glow);
        m.emissiveIntensity = spec.glowStrength ?? 0.35;
      }
    }
  });
}

function frame(obj, pad) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const half = Math.max(size.x, size.y) / 2;
  const dist = (half * pad) / Math.tan(deg(camera.fov / 2)) + size.z / 2;
  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = dist / 50;
  camera.far = dist * 4;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

function outlined(src, out) {
  const sil = document.createElement("canvas");
  sil.width = sil.height = SIZE;
  const s = sil.getContext("2d");
  const r = 5;
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    s.drawImage(src, Math.cos(t) * r, Math.sin(t) * r);
  }
  s.globalCompositeOperation = "source-in";
  s.fillStyle = OUTLINE;
  s.fillRect(0, 0, SIZE, SIZE);
  const full = document.createElement("canvas");
  full.width = full.height = SIZE;
  const f = full.getContext("2d");
  f.shadowColor = "rgba(0,0,0,0.35)";
  f.shadowBlur = 6;
  f.shadowOffsetY = 5;
  f.drawImage(sil, 0, 0);
  f.shadowColor = "transparent";
  f.drawImage(src, 0, 0);
  const small = document.createElement("canvas");
  small.width = small.height = out;
  const c = small.getContext("2d");
  c.imageSmoothingQuality = "high";
  c.drawImage(full, 0, 0, out, out);
  return small.toDataURL("image/png");
}

async function build(spec) {
  if (spec.proc) return PROCS[spec.proc](spec);
  if (!spec.parts) return piece(spec.file, spec.mesh);
  const g = new THREE.Group();
  for (const part of spec.parts) {
    const obj = await piece(part.file ?? spec.file, part.mesh);
    const [x = 0, y = 0, z = 0] = part.rot ?? [];
    obj.rotation.set(deg(x), deg(y), deg(z), "YXZ");
    obj.position.set(...(part.pos ?? [0, 0, 0]));
    obj.scale.setScalar(part.scale ?? 1);
    g.add(obj);
  }
  return g;
}

window.renderIcon = async (spec) => {
  const obj = await build(spec);
  tint(obj, spec);
  const [x = 0, y = 0, z = 0] = spec.rot ?? [];
  obj.rotation.set(deg(x), deg(y), deg(z), "YXZ");
  const holder = new THREE.Group();
  holder.add(obj);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  frame(holder, spec.pad ?? 1.18);
  renderer.render(scene, camera);
  scene.remove(holder);
  return outlined(canvas, spec.out ?? 128);
};
window.ready = true;
