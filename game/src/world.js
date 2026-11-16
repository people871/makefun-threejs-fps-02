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
  ctx.fillStyle = '#4a4f55';
  ctx.fillRect(0, 0, size, size);
  // Large soft patches of warmer / cooler tone so the yard is not one flat grey.
  for (let i = 0; i < 7; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const pr = size * (0.25 + Math.random() * 0.35);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    const warm = Math.random() < 0.5;
    grad.addColorStop(0, warm ? 'rgba(122,102,74,0.16)' : 'rgba(70,88,104,0.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  speckle(ctx, size, 2600, 0.16, false);
  speckle(ctx, size, 900, 0.10, true);
  // faint expansion joints
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
}

// Soft radial blob (sun disc, cloud puffs, impact dust) on a canvas.
function blobTexture(size, stops, w = size, h = size) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Vertical sky gradient: warm horizon haze up to soft afternoon blue.
function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#4f83b8'); // zenith
  grad.addColorStop(0.42, '#7ba7cc'); // mid sky
  grad.addColorStop(0.62, '#c3d3de'); // high haze
  grad.addColorStop(0.74, '#f2c98f'); // warm horizon
  grad.addColorStop(0.82, '#e8b07a'); // low warm band
  grad.addColorStop(1.0, '#8a7a63'); // below the horizon (never seen)
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A few soft overlapping puffs on one canvas: a cheap cloud sprite.
function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const puff = (x, y, r, a) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,252,246,${a})`);
    grad.addColorStop(1, 'rgba(255,252,246,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  puff(80, 78, 52, 0.85);
  puff(128, 62, 58, 0.9);
  puff(178, 80, 48, 0.85);
  puff(108, 88, 40, 0.7);
  puff(156, 92, 38, 0.7);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  ctx.fillStyle = '#8a6f4e';
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
  ctx.fillStyle = '#6a7076';
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
      map: makeCanvasTexture(corrugatedDraw('#6d7880', '#565f67', '#93a0ab'), 256, 3, 1),
      roughness: 0.6, metalness: 0.5,
    }),
    // Containers in distinct yard colours so the scene is not flat brown.
    containerRust: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(corrugatedDraw('#a85c28', '#83431c', '#c97a3e'), 256, 2, 1),
      roughness: 0.7, metalness: 0.4,
    }),
    containerTeal: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(corrugatedDraw('#2e6f6a', '#20524e', '#4a938c'), 256, 2, 1),
      roughness: 0.7, metalness: 0.4,
    }),
    containerOlive: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(corrugatedDraw('#6b6b3a', '#51512c', '#8a8a52'), 256, 2, 1),
      roughness: 0.7, metalness: 0.4,
    }),
    containerGrey: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(corrugatedDraw('#6a7076', '#52575c', '#8b9298'), 256, 2, 1),
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
      emissiveIntensity: 0.3,
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
  // containers (2.6 high, block sight) — one colour each
  [6, 2.6, 2.4, -8, 1.3, 4, 'containerRust'],
  [6, 2.6, 2.4, 8, 1.3, -4, 'containerTeal'],
  [2.4, 2.6, 6, -18, 1.3, 6, 'containerOlive'],
  [2.4, 2.6, 6, 18, 1.3, 6, 'containerGrey'],
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
  // Warm hazy sky as the backdrop (the dome sits beyond the fog range and
  // is fog:false, so the sky itself never gets fogged out).
  scene.background = new THREE.Color(0x9db8cc);
  scene.fog = new THREE.Fog(0xb9c8d8, 45, 110);

  // Gradient sky dome, late-afternoon sun, and a few soft clouds.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(110, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sunTex = blobTexture(128, [
    [0, 'rgba(255,244,214,1)'],
    [0.25, 'rgba(255,214,140,0.95)'],
    [0.6, 'rgba(255,180,90,0.28)'],
    [1, 'rgba(255,180,90,0)'],
  ]);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, depthWrite: false, fog: false,
  }));
  sun.position.set(30, 34, -45);
  sun.scale.set(22, 22, 1);
  scene.add(sun);
  const cloudTex = cloudTexture();
  const cloudSpots = [
    [-60, 52, -70, 44, 22], [30, 58, -80, 52, 26], [70, 48, 40, 40, 20],
    [-20, 62, 75, 46, 24], [-85, 55, 20, 36, 18], [10, 50, -40, 30, 15],
  ];
  for (const [x, y, z, w, h] of cloudSpots) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false, fog: false,
    }));
    cloud.position.set(x, y, z);
    cloud.scale.set(w, h, 1);
    scene.add(cloud);
  }

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
  // Late-afternoon sun: bright warm key with shadows, cool sky bounce.
  const hemi = new THREE.HemisphereLight(0xbfd6e8, 0x8a7a5f, 1.35);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffd9a0, 2.6);
  key.position.set(14, 16, -10);
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

  const fill = new THREE.DirectionalLight(0x9db8d6, 0.55);
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
