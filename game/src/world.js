// world.js — "Kestrel Yard": an original industrial depot map.
// Static build only: boxes, procedural canvas textures, lighting.
// All solid geometry is axis-aligned boxes; collision uses THREE.Box3.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// ---------------------------------------------------------------- textures
// Draw into a canvas, return a repeating sRGB texture.
function makeCanvasTexture(draw, size = 256, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, count, alpha, light) {
  for (let i = 0; i < count; i++) {
    const v = Math.random();
    ctx.fillStyle = light
      ? `rgba(255,255,255,${alpha * v})`
      : `rgba(0,0,0,${alpha * v})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function asphaltDraw(ctx, size) {
  ctx.fillStyle = '#26292d';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 2600, 0.16, false);
  speckle(ctx, size, 900, 0.10, true);
  // faint expansion joints
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
}

function corrugatedDraw(base, dark, light) {
  return (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const ridge = size / 8;
    for (let x = 0; x < size; x += ridge) {
      ctx.fillStyle = dark;
      ctx.fillRect(x, 0, ridge * 0.45, size);
      ctx.fillStyle = light;
      ctx.fillRect(x + ridge * 0.55, 0, ridge * 0.18, size);
    }
    speckle(ctx, size, 500, 0.12, false);
    // horizontal seam + rivets
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, size / 2 - 1, size, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = ridge / 2; x < size; x += ridge) {
      ctx.beginPath();
      ctx.arc(x, size / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

function planksDraw(ctx, size) {
  ctx.fillStyle = '#7a6248';
  ctx.fillRect(0, 0, size, size);
  const plank = size / 4;
  for (let y = 0; y < size; y += plank) {
    ctx.fillStyle = `rgba(0,0,0,${0.08 + (y / plank % 2) * 0.08})`;
    ctx.fillRect(0, y, size, plank);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-2, y, size + 4, plank);
    // grain
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 5; g++) {
      const gy = y + 4 + Math.random() * (plank - 8);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(size * 0.3, gy + 3, size * 0.6, gy - 3, size, gy);
      ctx.stroke();
    }
  }
}

function concreteDraw(ctx, size) {
  ctx.fillStyle = '#555b60';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 2000, 0.14, false);
  speckle(ctx, size, 700, 0.08, true);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, 0);
    ctx.lineTo(Math.random() * size, size);
    ctx.stroke();
  }
}

function hazardDraw(ctx, size) {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = PALETTE.accent;
  const stripe = size / 8;
  for (let i = -1; i < 10; i++) {
    ctx.save();
    ctx.translate(i * stripe, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(0, -size, stripe * 0.5, size * 3);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
}

// ---------------------------------------------------------------- materials
function buildMaterials() {
  return {
    floor: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(asphaltDraw, 256, 12, 9),
      roughness: 0.95, metalness: 0.0,
    }),
    wall: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(corrugatedDraw('#5d6871', '#49525a', '#7d8894'), 256, 3, 1),
      roughness: 0.6, metalness: 0.5,
    }),
    container: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(corrugatedDraw('#6b4a2f', '#523722', '#8a6242'), 256, 2, 1),
      roughness: 0.7, metalness: 0.4,
    }),
    crate: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(planksDraw, 256, 1, 1),
      roughness: 0.85, metalness: 0.0,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(concreteDraw, 256, 2, 1),
      roughness: 0.9, metalness: 0.05,
    }),
    hazard: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(hazardDraw, 256, 1, 1),
      emissive: new THREE.Color(PALETTE.accent),
      emissiveMap: makeCanvasTexture(hazardDraw, 256, 1, 1),
      emissiveIntensity: 0.9,
      roughness: 0.6, metalness: 0.1,
    }),
  };
}

// Boxes: [w, h, d, x, y, z, material] — y is the box CENTRE height.
const BOXES = [
  // floor
  [48.8, 0.4, 36.8, 0, -0.2, 0, 'floor'],
  // boundary walls (h 5, thickness 0.4)
  [0.4, 5, 36.8, -24.2, 2.5, 0, 'wall'],
  [0.4, 5, 36.8, 24.2, 2.5, 0, 'wall'],
  [48.8, 5, 0.4, 0, 2.5, -18.2, 'wall'],
  [48.8, 5, 0.4, 0, 2.5, 18.2, 'wall'],
  // site A enclosure (west room x -24..-14, z -14..-4; gaps: south x -18..-16, east z -10..-8)
  [0.4, 4, 4, -14.2, 2, -12, 'wall'],
  [0.4, 4, 4, -14.2, 2, -6, 'wall'],
  [6, 4, 0.4, -21, 2, -3.8, 'wall'],
  [2, 4, 0.4, -15, 2, -3.8, 'wall'],
  // site B enclosure (mirrored)
  [0.4, 4, 4, 14.2, 2, -12, 'wall'],
  [0.4, 4, 4, 14.2, 2, -6, 'wall'],
  [6, 4, 0.4, 21, 2, -3.8, 'wall'],
  [2, 4, 0.4, 15, 2, -3.8, 'wall'],
  // spawn divider, south (Kestrel side, z=10; gaps x -10..-7, -1.5..1.5, 7..10)
  [14, 4, 0.4, -17, 2, 10, 'wall'],
  [5.5, 4, 0.4, -4.25, 2, 10, 'wall'],
  [5.5, 4, 0.4, 4.25, 2, 10, 'wall'],
  [14, 4, 0.4, 17, 2, 10, 'wall'],
  // spawn divider, north (Vulture side, z=-10; same gaps)
  // NOTE: the outer segments stop short of the sites — a full-width wall
  // here would bisect both bomb sites at z=-10 and seal their northern
  // strips (incl. the tall crates at (±16,-12)) with no way in. Each
  // outer segment is split to leave a 4 m gap centred on its site
  // (x -21..-17 west, 17..21 east) so the whole site stays reachable.
  [3, 4, 0.4, -22.5, 2, -10, 'wall'],
  [7, 4, 0.4, -13.5, 2, -10, 'wall'],
  [5.5, 4, 0.4, -4.25, 2, -10, 'wall'],
  [5.5, 4, 0.4, 4.25, 2, -10, 'wall'],
  [7, 4, 0.4, 13.5, 2, -10, 'wall'],
  [3, 4, 0.4, 22.5, 2, -10, 'wall'],
  // mid structure: low crouch wall + two pillars
  [4, 1.2, 1.2, 0, 0.6, 0, 'concrete'],
  [1.2, 4, 1.2, -5, 2, -2, 'concrete'],
  [1.2, 4, 1.2, 5, 2, 2, 'concrete'],
  // containers (2.6 high, block sight)
  [6, 2.6, 2.4, -8, 1.3, 4, 'container'],
  [6, 2.6, 2.4, 8, 1.3, -4, 'container'],
  [2.4, 2.6, 6, -18, 1.3, 6, 'container'],
  [2.4, 2.6, 6, 18, 1.3, 6, 'container'],
  // crates (1.2 cube, crouch cover)
  [1.2, 1.2, 1.2, -3, 0.6, 2, 'crate'],
  [1.2, 1.2, 1.2, 3, 0.6, -6, 'crate'],
  [1.2, 1.2, 1.2, -12, 0.6, 0, 'crate'],
  [1.2, 1.2, 1.2, 12, 0.6, 0, 'crate'],
  [1.2, 1.2, 1.2, -19, 0.6, -7, 'crate'],
  [1.2, 1.2, 1.2, 19, 0.6, -7, 'crate'],
  [1.2, 1.2, 1.2, -6, 0.6, 8, 'crate'],
  [1.2, 1.2, 1.2, 6, 0.6, 8, 'crate'],
  // tall crates near the sites
  [1.2, 2.4, 1.2, -16, 1.2, -12, 'crate'],
  [1.2, 2.4, 1.2, 16, 1.2, -12, 'crate'],
];

// Site marker pads (NOT colliders): [w, h, d, x, y, z].
const SITE_PADS = [
  [5, 0.06, 5, -19, 0.03, -9],
  [5, 0.06, 5, 19, 0.03, -9],
];

// ------------------------------------------------------------------- build
export function createWorld(scene) {
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(PALETTE.canvas, 30, 70);

  const materials = buildMaterials();
  const group = new THREE.Group();
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, matKey) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      materials[matKey],
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, matKey] of BOXES) {
    box(w, h, d, x, y, z, matKey);
  }

  // Glowing hazard pads marking the bomb sites (visual only).
  for (const [w, h, d, x, y, z] of SITE_PADS) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.hazard);
    pad.position.set(x, y, z);
    pad.receiveShadow = true;
    group.add(pad);
    shootables.push(pad);
  }

  // ------------------------------------------------------------ lighting
  const hemi = new THREE.HemisphereLight(PALETTE.surface, PALETTE.canvas, 0.9);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe0b3, 1.6);
  key.position.set(12, 18, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0005;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0x9db8d6, 0.4);
  fill.position.set(-10, 12, -8);
  scene.add(fill);
  scene.add(fill.target);

  for (const [x, z] of [[-19, -9], [19, -9]]) {
    const lamp = new THREE.PointLight(0xf0a830, 12, 14);
    lamp.position.set(x, 4, z);
    scene.add(lamp);
  }

  scene.add(group);

  return {
    colliders,
    shootables,
    sites: {
      A: { minX: -24, maxX: -14, minZ: -14, maxZ: -4, cx: -19, cz: -9 },
      B: { minX: 14, maxX: 24, minZ: -14, maxZ: -4, cx: 19, cz: -9 },
    },
    spawns: {
      K: [
        { x: -6, z: 15 }, { x: -3, z: 16 }, { x: 0, z: 15 },
        { x: 3, z: 16 }, { x: 6, z: 15 },
      ],
      V: [
        { x: -6, z: -15 }, { x: -3, z: -16 }, { x: 0, z: -15 },
        { x: 3, z: -16 }, { x: 6, z: -15 },
      ],
    },
    group,
    bounds: { minX: -24, maxX: 24, minZ: -18, maxZ: 18 },
  };
}
