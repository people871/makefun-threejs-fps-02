// weapons.js — weapon definitions, first-person view models, firing/reload,
// and thrown frag grenades. Original code; no external assets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const ACCENT = (PALETTE && PALETTE.accent) || 0xd7ff3f;

export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sparrow', price: 300, damage: 26, headMult: 3,
    mag: 12, reserveMax: 48, auto: false, fireGap: 0.17, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.03, recoilPitch: 0.008, recoilYaw: 0.004,
    range: 60, zoom: 1, fovMult: 1, shotKind: 'sidearm',
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', price: 2700, damage: 33, headMult: 4,
    mag: 25, reserveMax: 75, auto: true, fireGap: 0.10, reloadTime: 2.1,
    spreadStill: 0.002, spreadMove: 0.026, recoilPitch: 0.011, recoilYaw: 0.005,
    range: 60, zoom: 1, fovMult: 1, shotKind: 'rifle',
  },
  smg: {
    id: 'smg', name: 'Rook-9', price: 1500, damage: 22, headMult: 3,
    mag: 32, reserveMax: 96, auto: true, fireGap: 0.075, reloadTime: 1.8,
    spreadStill: 0.005, spreadMove: 0.03, recoilPitch: 0.007, recoilYaw: 0.004,
    range: 60, zoom: 1, fovMult: 1, shotKind: 'smg',
  },
  sniper: {
    id: 'sniper', name: 'Longbow .50', price: 4750, damage: 95, headMult: 4,
    mag: 5, reserveMax: 15, auto: false, fireGap: 1.15, reloadTime: 3.2,
    spreadStill: 0.0006, spreadMove: 0.05, recoilPitch: 0.05, recoilYaw: 0.01,
    range: 60, zoom: 2.2, fovMult: 2.2, shotKind: 'sniper',
  },
  grenade: {
    id: 'grenade', name: 'Spark Frag', price: 300, countMax: 1,
    fuse: 1.6, radius: 6.5, maxDamage: 95,
  },
};

const METAL = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.55, metalness: 0.8 });
const METAL_DARK = new THREE.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.7, metalness: 0.6 });
const GRIP = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.8, metalness: 0.1 });
const FLASH_MAT = new THREE.MeshBasicMaterial({
  color: 0xffd27a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
});

function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || METAL);
  m.position.set(x, y, z);
  return m;
}

// Build one view-model group per weapon. All face -Z (downrange).
function buildViewModel(id) {
  const g = new THREE.Group();
  if (id === 'sidearm') {
    g.add(box(0.05, 0.07, 0.24, 0, 0, -0.08));            // slide
    g.add(box(0.045, 0.05, 0.2, 0, -0.02, -0.06, METAL_DARK)); // frame
    g.add(box(0.04, 0.12, 0.05, 0, -0.09, 0.02, GRIP));   // grip
    g.add(box(0.012, 0.02, 0.012, 0, 0.045, -0.18));       // front sight
    g.add(box(0.04, 0.015, 0.03, 0, 0.042, 0.03));         // rear sight
  } else if (id === 'rifle') {
    g.add(box(0.06, 0.09, 0.55, 0, 0, -0.2));             // receiver + handguard
    g.add(box(0.035, 0.035, 0.22, 0, 0.01, -0.55));        // barrel
    g.add(box(0.05, 0.16, 0.06, 0, -0.12, -0.12, GRIP));  // magazine
    g.add(box(0.05, 0.12, 0.06, 0, -0.1, 0.06, GRIP));    // grip
    g.add(box(0.04, 0.05, 0.12, 0, 0.07, -0.18));          // sight
    g.add(box(0.055, 0.07, 0.12, 0, -0.01, 0.16));         // stock
  } else if (id === 'smg') {
    g.add(box(0.055, 0.08, 0.34, 0, 0, -0.12));            // body
    g.add(box(0.03, 0.03, 0.16, 0, 0.01, -0.36));          // suppressor
    g.add(box(0.045, 0.13, 0.05, 0, -0.1, -0.08, GRIP));   // magazine
    g.add(box(0.045, 0.1, 0.05, 0, -0.09, 0.06, GRIP));    // grip
    g.add(box(0.03, 0.04, 0.08, 0, 0.06, -0.12));          // top rail sight
  } else { // sniper
    g.add(box(0.06, 0.09, 0.6, 0, 0, -0.24));              // receiver
    g.add(box(0.028, 0.028, 0.5, 0, 0.01, -0.75));         // long barrel
    g.add(box(0.04, 0.04, 0.1, 0, 0.01, -0.98, METAL_DARK)); // muzzle brake
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 12), METAL_DARK);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.085, -0.22);
    g.add(scope);
    g.add(box(0.05, 0.14, 0.06, 0, -0.11, -0.1, GRIP));   // magazine
    g.add(box(0.05, 0.1, 0.06, 0, -0.09, 0.08, GRIP));    // grip
    g.add(box(0.05, 0.08, 0.14, 0, -0.005, 0.2));          // stock
    g.add(box(0.04, 0.05, 0.04, 0, -0.05, -0.3));          // bipod stub
  }
  return g;
}

const MUZZLE_Z = { sidearm: -0.22, rifle: -0.68, smg: -0.46, sniper: -1.04 };

export function createArsenal(camera, audio) {
  const state = {};
  for (const id of ['sidearm', 'rifle', 'smg', 'sniper']) {
    const def = WEAPONS[id];
    state[id] = { mag: def.mag, reserve: def.reserveMax, owned: id === 'sidearm' };
  }
  let grenades = 0;
  let current = 'sidearm';
  let cooldown = 0;
  let flash = 0;
  let reloading = false;
  let reloadT = 0;
  let kick = 0;      // view-model kickback 0..1
  let zoomT = 0;     // sniper zoom 0..1
  let zoomed = false;

  // View models: build all four once, toggle visibility on equip.
  const models = {};
  const flashMeshes = {};
  const flashLights = {};
  const root = new THREE.Group();
  root.position.set(0.24, -0.2, -0.42);
  for (const id of ['sidearm', 'rifle', 'smg', 'sniper']) {
    const g = buildViewModel(id);
    g.visible = id === current;
    const flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), FLASH_MAT.clone());
    flashMesh.position.set(0, 0.01, MUZZLE_Z[id]);
    flashMesh.visible = false;
    g.add(flashMesh);
    const light = new THREE.PointLight(0xffc46b, 0, 3.5);
    light.position.set(0, 0.02, MUZZLE_Z[id]);
    g.add(light);
    flashMeshes[id] = flashMesh;
    flashLights[id] = light;
    models[id] = g;
    root.add(g);
  }
  camera.add(root);

  function def() { return WEAPONS[current]; }

  function equip(id) {
    if (!state[id] || !state[id].owned || id === current) return id === current;
    models[current].visible = false;
    current = id;
    models[current].visible = true;
    reloading = false;
    reloadT = 0;
    kick = 0;
    zoomT = 0;
    return true;
  }

  function buy(id) {
    if (!WEAPONS[id] || id === 'grenade') return false;
    const s = state[id];
    s.owned = true;
    s.mag = WEAPONS[id].mag;
    s.reserve = WEAPONS[id].reserveMax;
    return true;
  }

  const arsenal = {
    equip, buy,
    currentDef() { return def(); },
    mag() { return state[current].mag; },
    reserve() { return state[current].reserve; },
    has(id) { return !!(state[id] && state[id].owned); },
    ownedIds() { return Object.keys(state).filter((id) => state[id].owned); },
    reloading() { return reloading; },
    ready() { return state[current].mag > 0 && cooldown <= 0 && !reloading; },

    fire() {
      if (!arsenal.ready()) return null;
      const d = def();
      state[current].mag -= 1;
      cooldown = d.fireGap;
      flash = 0.06;
      kick = 1;
      flashMeshes[current].visible = true;
      flashLights[current].intensity = 6;
      if (audio) audio.shot(d.shotKind);
      return d;
    },

    reload() {
      const s = state[current];
      const d = def();
      if (reloading || s.mag >= d.mag || s.reserve <= 0) return false;
      reloading = true;
      reloadT = d.reloadTime;
      if (audio) audio.reload();
      return true;
    },

    spread(speed, airborne) {
      const d = def();
      let s = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
      if (airborne) s += 0.02;
      return s;
    },

    setZoomed(b) { zoomed = !!b; },
    zoomFovMult() {
      if (current !== 'sniper') return 1;
      return 1 - 0.55 * zoomT;
    },
    isZoomed() { return current === 'sniper' && zoomT > 0.5; },

    grenadeCount() { return grenades; },
    addGrenade() { if (grenades < WEAPONS.grenade.countMax) { grenades += 1; return true; } return false; },
    useGrenade() { if (grenades > 0) { grenades -= 1; return true; } return false; },

    resetRound(keepWeapons) {
      if (!keepWeapons) {
        for (const id of Object.keys(state)) {
          state[id].owned = id === 'sidearm';
          state[id].mag = WEAPONS[id].mag;
          state[id].reserve = WEAPONS[id].reserveMax;
        }
        grenades = 0;
        equip('sidearm');
      } else {
        for (const id of Object.keys(state)) {
          if (!state[id].owned) continue;
          const need = WEAPONS[id].mag - state[id].mag;
          const take = Math.min(need, state[id].reserve);
          state[id].mag += take;
          state[id].reserve -= take;
        }
        grenades = WEAPONS.grenade.countMax;
      }
      reloading = false;
      reloadT = 0;
      cooldown = 0;
      zoomT = 0;
    },

    step(dt) {
      if (cooldown > 0) cooldown -= dt;
      if (flash > 0) {
        flash -= dt;
        if (flash <= 0) {
          flashMeshes[current].visible = false;
          flashLights[current].intensity = 0;
        }
      }
      // Kick recovery: view model eases back to rest pose.
      if (kick > 0) kick = Math.max(0, kick - dt * 6);
      const d = def();
      const m = models[current];
      m.position.z = kick * 0.06;
      m.rotation.x = kick * 0.05;
      // Reload dip: model lowers and tilts while reloading.
      let dip = 0;
      if (reloading) {
        reloadT -= dt;
        const p = 1 - Math.max(0, reloadT) / d.reloadTime; // 0..1
        dip = Math.sin(p * Math.PI); // down then back up
        if (reloadT <= 0) {
          const s = state[current];
          const need = d.mag - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
          reloading = false;
        }
      }
      m.position.y = -dip * 0.14;
      m.rotation.z = dip * 0.35;
      // Sniper zoom lerp.
      const target = zoomed && current === 'sniper' ? 1 : 0;
      zoomT += (target - zoomT) * Math.min(1, dt * 10);
      if (Math.abs(target - zoomT) < 0.001) zoomT = target;
      // Zoomed view model pulls slightly in and down for a scoped feel.
      m.position.x = -zoomT * 0.18;
      m.position.y += -zoomT * 0.03;
    },
  };

  return arsenal;
}

// ---------------------------------------------------------------------------
// Grenades
// ---------------------------------------------------------------------------
const GRAVITY = 14;
const GROUND_Y = 0.12;
const MAX_GRENADES = 8;

export function createGrenades(scene, audio) {
  const grenades = [];
  const tmpBox = new THREE.Box3();
  const tmpMin = new THREE.Vector3();
  const tmpMax = new THREE.Vector3();
  const grenadeGeo = new THREE.SphereGeometry(0.09, 12, 10);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5, metalness: 0.7 });
  const bandMat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.6, metalness: 0.2 });
  const bandGeo = new THREE.TorusGeometry(0.09, 0.012, 6, 16);

  function throwFrom(origin, dir, power) {
    if (grenades.length >= MAX_GRENADES) return false;
    const mesh = new THREE.Group();
    const ball = new THREE.Mesh(grenadeGeo, grenadeMat);
    const band = new THREE.Mesh(bandGeo, bandMat);
    mesh.add(ball);
    mesh.add(band);
    mesh.position.copy(origin);
    scene.add(mesh);
    const vel = dir.clone().multiplyScalar(power === undefined ? 14 : power);
    vel.y += 4.5;
    grenades.push({ mesh, vel, fuse: WEAPONS.grenade.fuse });
    return true;
  }

  function step(dt, colliders, onExplode) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      // Ground bounce.
      if (p.y < GROUND_Y) {
        p.y = GROUND_Y;
        if (g.vel.y < 0) g.vel.y = -g.vel.y * 0.45;
        g.vel.x *= 0.8;
        g.vel.z *= 0.8;
      }
      // Collider bounce: probe a small box around the grenade.
      tmpMin.set(p.x - 0.09, p.y - 0.09, p.z - 0.09);
      tmpMax.set(p.x + 0.09, p.y + 0.09, p.z + 0.09);
      tmpBox.min.copy(tmpMin);
      tmpBox.max.copy(tmpMax);
      for (let c = 0; c < colliders.length; c++) {
        if (!tmpBox.intersectsBox(colliders[c])) continue;
        const b = colliders[c];
        const dxMin = Math.abs(p.x - b.min.x);
        const dxMax = Math.abs(p.x - b.max.x);
        const dzMin = Math.abs(p.z - b.min.z);
        const dzMax = Math.abs(p.z - b.max.z);
        const dyMin = Math.abs(p.y - b.min.y);
        const dyMax = Math.abs(p.y - b.max.y);
        const m = Math.min(dxMin, dxMax, dzMin, dzMax, dyMin, dyMax);
        if (m === dxMin || m === dxMax) { g.vel.x = -g.vel.x * 0.45; p.x = m === dxMin ? b.min.x - 0.1 : b.max.x + 0.1; }
        else if (m === dzMin || m === dzMax) { g.vel.z = -g.vel.z * 0.45; p.z = m === dzMin ? b.min.z - 0.1 : b.max.z + 0.1; }
        else { g.vel.y = -g.vel.y * 0.45; p.y = m === dyMin ? b.min.y - 0.1 : b.max.y + 0.1; }
      }
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        if (audio) audio.explosion();
        if (onExplode) onExplode(p.clone());
      }
    }
  }

  return {
    throwFrom,
    step,
    count() { return grenades.length; },
  };
}
