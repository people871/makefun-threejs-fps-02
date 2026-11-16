// world.js — "Kestrel Yard": an original industrial depot map.
// Static build only: boxes, procedural canvas textures, lighting.
// All solid geometry is axis-aligned boxes; collision uses THREE.Box3.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { NODES, EDGE_PAIRS } from './nav.js';

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

// Vertical sky gradient: golden hour — deep blue-violet zenith fading
// through mauve to a warm orange/peach horizon band. NOTE: on the dome
// the horizon sits at v≈0.5, so the warm band must live just above it —
// stops below 0.5 are never visible above the walls.
function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#3d4f96'); // zenith: deep blue-violet
  grad.addColorStop(0.18, '#5a5fa8'); // blue-violet
  grad.addColorStop(0.30, '#8a6fa0'); // violet-mauve
  grad.addColorStop(0.40, '#d98a70'); // warm rose-peach
  grad.addColorStop(0.47, '#f7b45e'); // warm orange horizon band
  grad.addColorStop(0.53, '#eda04e'); // low warm band (just below horizon)
  grad.addColorStop(1.0, '#7a5a48'); // below the horizon (never seen)
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A few soft overlapping puffs on one canvas: a cheap cloud sprite.
// Golden hour: the tops stay near-white while the undersides are lit
// warm orange by the low sun (a warm wash over the lower half).
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
  // Warm underlight: sunset orange washing the cloud bellies.
  ctx.globalCompositeOperation = 'source-atop';
  const warm = ctx.createLinearGradient(0, 40, 0, 128);
  warm.addColorStop(0, 'rgba(255,190,120,0)');
  warm.addColorStop(0.55, 'rgba(255,170,100,0.35)');
  warm.addColorStop(1, 'rgba(255,140,70,0.6)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, 256, 128);
  ctx.globalCompositeOperation = 'source-over';
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
    // rust streaks bleeding down from the top edge + grime near the base
    for (let i = 0; i < 14; i++) {
      const sx = Math.random() * size;
      const sw = 2 + Math.random() * 6;
      const len = size * (0.25 + Math.random() * 0.6);
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(88,48,18,${0.28 + Math.random() * 0.2})`);
      grad.addColorStop(1, 'rgba(88,48,18,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, 0, sw, len);
    }
    const grime = ctx.createLinearGradient(0, size * 0.8, 0, size);
    grime.addColorStop(0, 'rgba(40,28,16,0)');
    grime.addColorStop(1, 'rgba(40,28,16,0.3)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, size * 0.8, size, size * 0.2);
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

function planksDraw(base = '#8a6f4e') {
  return (ctx, size) => {
    ctx.fillStyle = base;
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
  };
}

function concreteDraw(ctx, size) {  ctx.fillStyle = '#6a7076';
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

// ---------------------------------------------------------------- grass
// Patchy lawn, warmed for golden hour: olive-yellow greens, less
// saturated than midday, so the grass sits in the same warm grade as
// the sky and the low sun. Same blotch/blade/dirt structure as before.
function grassDraw(ctx, size) {
  ctx.fillStyle = '#66783a';
  ctx.fillRect(0, 0, size, size);
  const tones = ['#55682e', '#77863c', '#8a8f45', '#6a7a30', '#94944d'];
  for (let i = 0; i < 11; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const pr = size * (0.2 + Math.random() * 0.35);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, tones[i % tones.length] + '73'); // ~0.45 alpha
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  // fine blade grain: short vertical strokes in lighter/darker green
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.strokeStyle = Math.random() < 0.5
      ? `rgba(30,45,12,${0.12 + Math.random() * 0.2})`
      : `rgba(180,190,110,${0.10 + Math.random() * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, y - 2 - Math.random() * 3);
    ctx.stroke();
  }
  speckle(ctx, size, 2200, 0.16, false);
  speckle(ctx, size, 800, 0.10, true);
  // dirt speckles (bare earth showing through the lawn)
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = `rgba(107,84,58,${0.2 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // a few larger bare-earth patches so the lawn is not uniformly green
  for (let i = 0; i < 4; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const pr = size * (0.06 + Math.random() * 0.08);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, 'rgba(120,100,66,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  // worn tan streaks where feet/tyres cross the grass
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.strokeStyle = `rgba(150,130,90,${0.10 + Math.random() * 0.08})`;
    ctx.lineWidth = 3 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * size * 0.5, y + (Math.random() - 0.5) * size * 0.3);
    ctx.stroke();
  }
}

// One grass tuft: tapered blades fanning out, in four greens.
function tuftTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const greens = ['#4a6428', '#5f7a30', '#7a8a3c', '#9a9a4e'];
  for (let i = 0; i < 15; i++) {
    const bx = 8 + i * 7 + (Math.random() - 0.5) * 5;
    const tipX = bx + (Math.random() - 0.5) * 44;
    const tipY = 8 + Math.random() * 42;
    const half = 2.5 + Math.random() * 2;
    ctx.fillStyle = greens[i % greens.length];
    ctx.beginPath();
    ctx.moveTo(bx - half, size);
    ctx.lineTo(bx + half, size);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Deterministic RNG (mulberry32) so tuft placement is identical every
// load — the staged screenshots must be reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hazardDraw(ctx, size) {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffb52e'; // brighter amber so the pad reads in warm light
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
      map: makeCanvasTexture(planksDraw(), 256, 1, 1),
      roughness: 0.85, metalness: 0.0,
    }),
    // Weathered grey-brown crates: same planks, older timber, so the yard
    // is not one uniform wood tone.
    crate2: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(planksDraw('#7d7462'), 256, 1, 1),
      roughness: 0.9, metalness: 0.0,
    }),
    concrete: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(concreteDraw, 256, 2, 1),
      roughness: 0.9, metalness: 0.05,
    }),
    hazard: new THREE.MeshStandardMaterial({
      map: makeCanvasTexture(hazardDraw, 256, 1, 1),
      emissive: new THREE.Color(0xffb52e),
      emissiveMap: makeCanvasTexture(hazardDraw, 256, 1, 1),
      emissiveIntensity: 0.6,
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
  // crates (1.2 cube, crouch cover) — two timber tones alternate
  [1.2, 1.2, 1.2, -3, 0.6, 2, 'crate2'],
  [1.2, 1.2, 1.2, 3, 0.6, -6, 'crate'],
  [1.2, 1.2, 1.2, -12, 0.6, 0, 'crate'],
  [1.2, 1.2, 1.2, 12, 0.6, 0, 'crate2'],
  [1.2, 1.2, 1.2, -19, 0.6, -7, 'crate2'],
  [1.2, 1.2, 1.2, 19, 0.6, -7, 'crate'],
  [1.2, 1.2, 1.2, -6, 0.6, 8, 'crate'],
  [1.2, 1.2, 1.2, 6, 0.6, 8, 'crate2'],
  // tall crates near the sites
  [1.2, 2.4, 1.2, -16, 1.2, -12, 'crate'],
  [1.2, 2.4, 1.2, 16, 1.2, -12, 'crate'],
];

// Site marker pads (NOT colliders): [w, h, d, x, y, z].
const SITE_PADS = [
  [5, 0.06, 5, -19, 0.03, -9],
  [5, 0.06, 5, 19, 0.03, -9],
];

// Grassy ground patches (thin overlays on the asphalt, NOT colliders):
// [w, d, x, z, tint]. Asphalt stays under the container pads, the site
// pads and the main lanes (the worn paths bots walk); grass fills the yard
// between containers, the mid-lane flanks, the spawn yards either side of
// the divider gaps, the site approaches, and a strip inside the perimeter.
const GRASS_PATCHES = [
  // mid-lane flanks (central lane x -2.5..2.5 stays asphalt = worn path)
  [4, 12, -4.5, 0, 0],
  [4, 12, 4.5, 0, 1],
  // yard between the containers
  [5, 5, -13.5, 1, 1],
  [5, 5, 13.5, -1, 2],
  // Kestrel spawn yard, split so the three divider gaps stay asphalt
  [5.5, 3, -4.25, 12.5, 0],
  [5.5, 3, 4.25, 12.5, 2],
  // spawn foreground: lawn right in front of the Kestrel line (the
  // start-shot camera stands on it, so the frame opens on grass)
  [16, 2, 0, 15.2, 1],
  // Vulture yard (mirrored)
  [5.5, 3, -4.25, -12.5, 1],
  [5.5, 3, 4.25, -12.5, 0],
  // site approaches, just outside the site walls
  [3.5, 8, -12, -9, 0],
  [3.5, 8, 12, -9, 1],
  // northern strip inside each site, behind the pad
  [7, 1.8, -19, -13, 2],
  [7, 1.8, 19, -13, 0],
  // southern strip inside each site, in front of the pad (end-shot
  // foreground: the camera stands just south-east of Site A)
  [4, 2.5, -17, -5, 0],
  [4, 2.5, 17, -5, 1],
  // inner perimeter strips (inside the boundary walls)
  [1.6, 30, -23, 0, 1],
  [1.6, 30, 23, 0, 2],
  [44, 1.6, 0, -17.2, 0],
  [44, 1.6, 0, 17.2, 1],
];

// Grass tint variants (multiplied over the same patchy texture).
const GRASS_TINTS = [0xffffff, 0xe8f0d0, 0xd8e8b8];

// Grass patches + instanced tufts + the lawn beyond the walls.
// Static only: patches are thin non-colliding overlays, tufts are two
// static InstancedMeshes (crossed planes) with per-instance tint. No
// per-frame work, no allocation in the sim loop.
function buildGrass(group, shootables) {
  // One patchy texture per tint; each patch repeats it to its own size
  // (repeat ~1 tile per 3 m) so the grain stays consistent.
  const mats = GRASS_TINTS.map((tint) => new THREE.MeshStandardMaterial({
    map: makeCanvasTexture(grassDraw, 256, 1, 1),
    color: tint,
    roughness: 1.0,
    metalness: 0.0,
  }));
  for (const [w, d, x, z, tint] of GRASS_PATCHES) {
    const mat = mats[tint].clone();
    mat.map = mat.map.clone();
    mat.map.repeat.set(Math.max(1, Math.round(w / 2.5)), Math.max(1, Math.round(d / 2.5)));
    mat.map.needsUpdate = true;
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat);
    patch.position.set(x, 0.015, z);
    patch.receiveShadow = true;
    group.add(patch);
    shootables.push(patch); // bullet impacts on grass read like the floor
  }

  // Lawn beyond the walls: a wide grass plane under the whole map so the
  // view over the fence line is green, not void (fog hazes it out).
  const outerMat = new THREE.MeshStandardMaterial({
    map: makeCanvasTexture(grassDraw, 256, 24, 24),
    roughness: 1.0,
    metalness: 0.0,
  });
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.08;
  group.add(outer);

  // ---- instanced grass tufts (crossed planes, ~400, static) ----
  const rng = mulberry32(1337);
  const tuftGeo = new THREE.PlaneGeometry(0.55, 0.5);
  tuftGeo.translate(0, 0.25, 0);
  const tuftMat = new THREE.MeshLambertMaterial({
    map: tuftTexture(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  // Exclusions: solid footprints (inflated), site pads, spawn points,
  // and the bot walking corridors (nav nodes + edges).
  const solids = [];
  for (const [w, h, d, x, y, z, matKey] of BOXES) {
    if (matKey === 'floor') continue;
    solids.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
  }
  for (const [w, h, d, x, y, z] of SITE_PADS) {
    solids.push({ minX: x - w / 2 - 0.5, maxX: x + w / 2 + 0.5, minZ: z - d / 2 - 0.5, maxZ: z + d / 2 + 0.5 });
  }
  const spawns = [
    [-6, 15], [-3, 16], [0, 15], [3, 16], [6, 15],
    [-6, -15], [-3, -16], [0, -15], [3, -16], [6, -15],
  ];
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  };
  const blocked = (x, z) => {
    for (const s of solids) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return true;
    }
    for (const [sx, sz] of spawns) {
      if (Math.hypot(x - sx, z - sz) < 1.0) return true;
    }
    for (const [a, b] of EDGE_PAIRS) {
      const na = byId.get(a);
      const nb = byId.get(b);
      if (segDist(x, z, na.x, na.z, nb.x, nb.z) < 0.7) return true;
    }
    return false;
  };
  const spots = [];
  for (const [w, d, x, z] of GRASS_PATCHES) {
    const tries = Math.round(w * d * 1.6);
    for (let i = 0; i < tries; i += 1) {
      const px = x - w / 2 + 0.3 + rng() * (w - 0.6);
      const pz = z - d / 2 + 0.3 + rng() * (d - 0.6);
      if (!blocked(px, pz)) spots.push([px, pz]);
    }
  }
  const count = spots.length;
  const meshA = new THREE.InstancedMesh(tuftGeo, tuftMat, count);
  const meshB = new THREE.InstancedMesh(tuftGeo, tuftMat, count);
  meshA.frustumCulled = false;
  meshB.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const [px, pz] = spots[i];
    const rot = rng() * Math.PI;
    const sc = 0.7 + rng() * 0.6;
    e.set(0, rot, 0);
    q.setFromEuler(e);
    v.set(px, 0, pz);
    s.set(sc, sc * (0.85 + rng() * 0.3), sc);
    m.compose(v, q, s);
    meshA.setMatrixAt(i, m);
    e.set(0, rot + Math.PI / 2, 0);
    q.setFromEuler(e);
    m.compose(v, q, s);
    meshB.setMatrixAt(i, m);
    col.setHSL(0.26 + rng() * 0.04, 0.45, 0.42 + rng() * 0.18);
    meshA.setColorAt(i, col);
    meshB.setColorAt(i, col);
  }
  meshA.instanceMatrix.needsUpdate = true;
  meshB.instanceMatrix.needsUpdate = true;
  if (meshA.instanceColor) meshA.instanceColor.needsUpdate = true;
  if (meshB.instanceColor) meshB.instanceColor.needsUpdate = true;
  group.add(meshA);
  group.add(meshB);
  return count;
}

// ------------------------------------------------------------------- build
export function createWorld(scene) {
  // Warm hazy sky as the backdrop (the dome sits beyond the fog range and
  // is fog:false, so the sky itself never gets fogged out). The dome,
  // sun and clouds are toneMapped:false so the golden-hour gradient and
  // glow keep their designed colours under the ACES grade.
  scene.background = new THREE.Color(0xe8b48c);
  scene.fog = new THREE.Fog(0xdfb18c, 45, 110);

  // Gradient sky dome, low sun in the west, and dramatic clouds.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(110, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, toneMapped: false }),
  );
  scene.add(sky);
  const sunTex = blobTexture(128, [
    [0, 'rgba(255,246,220,1)'],
    [0.22, 'rgba(255,214,140,0.95)'],
    [0.5, 'rgba(255,170,80,0.4)'],
    [1, 'rgba(255,160,70,0)'],
  ]);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }));
  sun.position.set(-52, 20, -48);
  sun.scale.set(30, 30, 1);
  scene.add(sun);
  const cloudTex = cloudTexture();
  // Bigger, more numerous clouds with warm-lit undersides; the north-west
  // sky is where the start, play and end cameras all look, so it gets
  // the heaviest cover, with a few to the east and south for balance.
  const cloudSpots = [
    [-60, 52, -70, 56, 28], [30, 58, -80, 64, 32], [70, 48, 40, 50, 25],
    [-20, 62, 75, 58, 30], [-85, 55, 20, 46, 23], [10, 50, -40, 38, 19],
    [-35, 68, -55, 48, 24], [-75, 60, -35, 52, 26], [45, 66, -60, 44, 22],
    [85, 58, -30, 42, 21], [-10, 72, 30, 50, 25], [60, 54, 70, 46, 23],
  ];
  for (const [x, y, z, w, h] of cloudSpots) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false,
      fog: false, toneMapped: false, color: 0xffe2c0,
    }));
    cloud.position.set(x, y, z);
    cloud.scale.set(w, h, 1);
    scene.add(cloud);
  }

  // Light shafts: large soft additive planes slanting down from the low
  // western sun. Subtle by design (opacity 0.07) — warm air, not fog.
  const shaftTex = blobTexture(128, [
    [0, 'rgba(255,205,135,0.9)'],
    [0.45, 'rgba(255,185,105,0.3)'],
    [1, 'rgba(255,180,100,0)'],
  ]);
  const shaftSpots = [
    [-10, 20, -8, 0.55, 0.32], [6, 22, 4, 0.45, 0.30], [-20, 18, 10, 0.65, 0.34],
  ];
  for (const [x, y, z, ry, rz] of shaftSpots) {
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 46),
      new THREE.MeshBasicMaterial({
        map: shaftTex, transparent: true, opacity: 0.07, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    shaft.position.set(x, y, z);
    shaft.rotation.set(0, ry, rz);
    scene.add(shaft);
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

  // Grassy yard: patchy lawn overlays, instanced tufts, lawn beyond the
  // walls. Patches are visual only (not colliders); tufts are kept clear
  // of bot corridors, spawn points and solid footprints.
  const grassTufts = buildGrass(group, shootables);

  // ------------------------------------------------------------ lighting
  // Golden-hour sun: low in the west, warm orange, long shadows east.
  // Warm hemisphere (peach sky / warm earth bounce) + a cool fill from
  // the east so shadow sides stay readable instead of muddy.
  const hemi = new THREE.HemisphereLight(0xffcf9e, 0x8a6a45, 1.3);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffb066, 2.8);
  key.position.set(-26, 9, -10);
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

  const fill = new THREE.DirectionalLight(0x8fa8c8, 0.55);
  fill.position.set(18, 14, 6);
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
    grassTufts,
  };
}
