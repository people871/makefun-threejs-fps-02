// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it (waiting out the HUD's CSS fade-ins), then freezes it and sets
// window.__shotReady. ?selftest=1 runs a scripted play-through of the simulation
// and reports window.__selftest.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// Golden-hour grade (Pass 3): filmic tone mapping keeps the warm key
// light and bright sky from washing out while holding shadow detail.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const nav = createNav();
const audio = createAudio();
const hud = createHud({ onBuy: (id) => game.buy(id) });
const game = createGame({ scene, camera, hud, audio, world, nav, rng });
const input = createInput(renderer.domElement, onLockChange);

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
// One input object for the whole session: game.step() keeps edge state on it
// (B/G/number-key presses), so a fresh object per frame would re-trigger them.
const simInput = { keys: input.state.keys, firing: false, zoom: false, lookX: 0, lookY: 0 };

hud.onPlay(() => {
  audio.ensure();
  if (shot || selftest) return;
  if (game.state.phase === 'matchEnd') {
    game.startMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot || selftest) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (game.state.phase !== 'matchEnd' && game.state.alive) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    simInput.firing = input.state.firing;
    simInput.zoom = input.state.zoom;
    simInput.lookX = look.x;
    simInput.lookY = look.y;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      game.step(FIXED_STEP, simInput);
      accumulator -= FIXED_STEP;
      steps += 1;
      simInput.lookX = 0;
      simInput.lookY = 0;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    game.syncHud();
  }
  renderer.render(scene, camera);
}

function paintTwiceThenReady() {
  // Render until the frame is visually settled, then freeze: at least
  // two paints and 400 ms, and — if a round banner is showing — until its
  // CSS fade-in has actually reached full opacity. Headless compositing
  // under SwiftShader can run far fewer frames than wall-clock time
  // suggests, so a bare 400 ms wait can catch the banner mid-fade.
  const startedAt = performance.now();
  let painted = 0;
  function bannerSettled() {
    const bannerEl = document.getElementById('banner');
    if (!bannerEl || !bannerEl.classList.contains('show')) return true;
    return Number.parseFloat(getComputedStyle(bannerEl).opacity) >= 0.99;
  }
  function paint() {
    requestAnimationFrame(paint);
    game.syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted >= 2 && performance.now() - startedAt >= 400 && bannerSettled()) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  game.stageShot(name);
  // Let the bots settle one step so their meshes sit on the ground, then freeze.
  game.step(FIXED_STEP, { keys: new Set(), firing: false, zoom: false, lookX: 0, lookY: 0 });
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot) {
  runShot(shot);
} else if (selftest) {
  // One rendered frame first so the scene exists, then run the scripted checks.
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    const results = game.selftest();
    window.__selftest = results;
    console.log('SELFTEST', JSON.stringify(results));
    frozen = true;
  });
} else {
  game.startMatch();
  requestAnimationFrame(frame);
}
