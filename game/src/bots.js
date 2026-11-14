// bots.js — bot AI, character meshes and hitboxes (5 Kestrels incl. the
// player, 5 Vultures). `world`/`nav` arrive as arguments; nothing here
// builds a scene at import time. All randomness comes from injected rng();
// no Math.random, no console.log. Hot loops reuse module-level temps.
// Facing: yaw = 0 faces +Z (south); forward = (sin yaw, 0, cos yaw).
// Group rotation.y = yaw, gun on local +Z points forward.
// Team colours come from palette.js (TEAM K 0x2fae9e, V 0xc65a3a).
import * as THREE from 'three';
import { TEAM } from './palette.js';
import { segmentBlocked } from './raycast.js';

const TEAM_COLOR = TEAM;
const TEAM_DARK = { K: 0x14544d, V: 0x5e2a1c };
const SKIN = 0x9a9a9a;
const EYE_H = 1.55, CHEST_H = 1.2;
const FOV_COS = 0.5736; // cos(55 deg)
const SEE_RANGE = 42, HEAR_RANGE = 26;
const WALK_SPEED = 4.3, HOLD_SPEED = 2.3, ARRIVE_DIST = 0.4;
const PLANT_TIME = 3.5, DEFUSE_TIME = 5.0, LOSE_TARGET_AFTER = 2.5;
const K_NAMES = ['Heron', 'Kite', 'Merlin', 'Osprey'];
const V_NAMES = ['Rook', 'Jackdaw', 'Magpie', 'Crow', 'Raven'];

// Module-level temps (never allocate in step()).
const _eye = new THREE.Vector3(), _chest = new THREE.Vector3();
const _dir = new THREE.Vector3(), _right = new THREE.Vector3();
const _up2 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _probe = new THREE.Box3(), _up = new THREE.Vector3(0, 1, 0);

// Shared geometry / materials, one set per team.
let _shared = null;
function getShared() {
  if (_shared) return _shared;
  const perTeam = {};
  for (const team of ['K', 'V']) {
    perTeam[team] = {
      darkMat: new THREE.MeshLambertMaterial({ color: TEAM_DARK[team] }),
      teamMat: new THREE.MeshLambertMaterial({ color: TEAM_COLOR[team] }),
    };
  }
  _shared = {
    legGeo: new THREE.BoxGeometry(0.16, 0.8, 0.2),
    torsoGeo: new THREE.BoxGeometry(0.56, 0.7, 0.34),
    headGeo: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    stripeGeo: new THREE.BoxGeometry(0.32, 0.08, 0.32),
    gunGeo: new THREE.BoxGeometry(0.09, 0.13, 0.72),
    lightGeo: new THREE.BoxGeometry(0.1, 0.06, 0.1),
    gunMat: new THREE.MeshLambertMaterial({ color: 0x1c1c20 }),
    skinMat: new THREE.MeshLambertMaterial({ color: SKIN }),
    perTeam,
  };
  return _shared;
}
function buildMesh(bot) {
  const s = getShared(), mats = s.perTeam[bot.team], g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); g.add(m); return m;
  };
  add(s.legGeo, mats.darkMat, -0.11, 0.4, 0);
  add(s.legGeo, mats.darkMat, 0.11, 0.4, 0);
  add(s.torsoGeo, mats.teamMat, 0, 1.15, 0);
  add(s.headGeo, s.skinMat, 0, 1.62, 0);
  add(s.stripeGeo, mats.teamMat, 0, 1.74, 0); // team-coloured helmet stripe
  add(s.gunGeo, s.gunMat, 0.12, 1.25, 0.32);
  add(s.lightGeo, mats.teamMat, -0.29, 1.42, 0); // shoulder light
  return g;
}
function makeBot(id, team, name, index, rng) {
  const bot = {
    id, team, name, index,
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0, pitch: 0, hp: 100, armor: 0, alive: true, weapon: 'rifle',
    state: 'push', path: [], pathIndex: 0, holdNode: null,
    target: null, // null | 'player' | enemy bot object
    reactAt: 0, burstLeft: 0, burstAt: 0,
    lastKnown: null, _lk: { x: 0, z: 0 }, // lastKnown points at _lk when set
    skill: 0.4 + rng() * 0.5, role: 'push',
    perceiveAt: index * 0.03, lastSeenAt: -100,
    strafeDir: 1, strafeAt: 0, strafeAnchor: { x: 0, z: 0 },
    scanPhase: rng() * Math.PI * 2, holdYaw: 0, fetching: false,
    plantT: 0, defuseT: 0, fallT: 0, crouching: false,
    group: null,
    _headBox: new THREE.Box3(), _torsoBox: new THREE.Box3(), _legsBox: new THREE.Box3(),
  };
  bot.group = buildMesh(bot);
  return bot;
}

export function createBots(scene, deps) {
  const world = deps.world, nav = deps.nav;
  const rng = deps.rng || (() => 0.5);
  const combat = deps.combat || {};
  const getPlayer = deps.getPlayer || (() => null);
  const getRound = deps.getRound || (() => ({ phase: 'live', plantedSite: null, bombPos: null, timeLeft: 0 }));
  const audio = deps.audio || null;
  const bots = [];
  for (let i = 0; i < 4; i++) bots.push(makeBot('K' + (i + 1), 'K', K_NAMES[i], i, rng));
  for (let i = 0; i < 5; i++) bots.push(makeBot('V' + (i + 1), 'V', V_NAMES[i], 4 + i, rng));
  for (const bot of bots) scene.add(bot.group);
  // Flat hitbox list, rebuilt in place by hitBoxes(); same array every call.
  const allHitBoxes = [];
  for (const bot of bots) {
    allHitBoxes.push({ box: bot._headBox, part: 'head', bot });
    allHitBoxes.push({ box: bot._torsoBox, part: 'torso', bot });
    allHitBoxes.push({ box: bot._legsBox, part: 'legs', bot });
  }
  let targetSite = 'A', bombDrop = null, lastWeapons = null;
  let defusedFor = null; // site already defused this round: don't emit twice
  const colliders = world ? world.colliders : [];
  function setLastKnown(bot, x, z) { bot._lk.x = x; bot._lk.z = z; bot.lastKnown = bot._lk; }
  function siteOf(letter) { return world && world.sites ? world.sites[letter] : null; }
  // Ask nav for a path to (tx, tz); fall back to a direct waypoint so a bot
  // never stands still forever when nav is missing or returns nothing.
  function requestPath(bot, tx, tz) {
    bot.path = []; bot.pathIndex = 0;
    if (nav && nav.nearest && nav.findPath) {
      const found = nav.findPath(nav.nearest(bot.pos.x, bot.pos.z), nav.nearest(tx, tz));
      if (found && found.length) { bot.path = found; return; }
    }
    bot.path = [{ x: tx, z: tz }];
  }
  function faceToward(bot, x, z) { bot.yaw = Math.atan2(x - bot.pos.x, z - bot.pos.z); }
  // True when a 0.6 x 1.7 m probe box at (x, z) is clear of all colliders.
  function probeClear(x, z) {
    _probe.min.set(x - 0.3, 0, z - 0.3); _probe.max.set(x + 0.3, 1.7, z + 0.3);
    for (let i = 0; i < colliders.length; i++) if (_probe.intersectsBox(colliders[i])) return false;
    return true;
  }
  function emit(type, site) {
    if (Array.isArray(deps.events)) { deps.events.push({ type, site }); return; }
    if (type === 'plantDone' && combat.plantDone) combat.plantDone(site);
    if (type === 'defuseDone' && combat.defuseDone) combat.defuseDone(site);
  }
  function pickWeapon(list, i, fallback) {
    if (!list || !list[i]) return fallback;
    const def = list[i], id = typeof def === 'string' ? def : (def.id || def.weapon || '');
    return (id === 'smg' || id === 'sniper' || id === 'sidearm' || id === 'rifle') ? id : fallback;
  }
  function spawnRound(weapons) {
    lastWeapons = weapons || lastWeapons;
    targetSite = rng() < 0.5 ? 'A' : 'B';
    bombDrop = null;
    defusedFor = null;
    const defendersArmored = rng() < 0.5; // defenders get armor 50 on ~50% of rounds
    const siteA = siteOf('A'), siteB = siteOf('B');
    let ki = 0, vi = 0;
    for (const bot of bots) {
      bot.hp = 100; bot.alive = true; bot.state = 'push'; bot.target = null;
      bot.lastKnown = null; bot.reactAt = 0; bot.burstLeft = 0; bot.burstAt = 0;
      bot.lastSeenAt = -100; bot.plantT = 0; bot.defuseT = 0; bot.fallT = 0;
      bot.crouching = false; bot.path = []; bot.pathIndex = 0; bot.fetching = false;
      bot.group.rotation.set(0, 0, 0); bot.group.scale.set(1, 1, 1); bot.group.visible = true;
      if (bot.team === 'K') {
        const sp = world.spawns.K[ki % world.spawns.K.length];
        bot.pos.set(sp.x, 0, sp.z);
        bot.weapon = pickWeapon(lastWeapons && lastWeapons.K, ki, 'rifle');
        bot.armor = 0; bot.role = ki === 0 ? 'carrier' : 'push';
        bot.yaw = Math.atan2(siteOf(targetSite).cx - sp.x, siteOf(targetSite).cz - sp.z);
        ki++;
      } else {
        const sp = world.spawns.V[vi % world.spawns.V.length];
        bot.pos.set(sp.x, 0, sp.z);
        bot.weapon = pickWeapon(lastWeapons && lastWeapons.V, vi, 'rifle');
        bot.armor = defendersArmored ? 50 : 0;
        bot.role = vi < 2 ? 'holdA' : vi < 4 ? 'holdB' : 'mid';
        const anchor = bot.role === 'holdA' ? siteA : bot.role === 'holdB' ? siteB : { cx: 0, cz: 0 };
        bot.yaw = Math.atan2(anchor.cx - sp.x, anchor.cz - sp.z);
        bot.holdYaw = bot.yaw;
        vi++;
      }
      bot.group.position.copy(bot.pos); bot.group.rotation.y = bot.yaw;
    }
    // Objectives: attackers path to the target site, defenders to hold corners.
    for (const bot of bots) {
      if (bot.team === 'K') {
        const s = siteOf(targetSite);
        requestPath(bot, s.cx + (rng() - 0.5) * 4, s.cz + (rng() - 0.5) * 4);
      } else if (bot.role === 'holdA' || bot.role === 'holdB') {
        const s = siteOf(bot.role === 'holdA' ? 'A' : 'B');
        const hx = s.cx + (bot.index % 2 === 0 ? -3 : 3);
        const hz = s.cz + (bot.index % 2 === 0 ? 3 : -3);
        bot.holdNode = nav && nav.nearest ? nav.nearest(hx, hz) : null;
        requestPath(bot, hx, hz);
        bot.state = 'hold'; bot.crouching = true;
      } else {
        requestPath(bot, (rng() - 0.5) * 6, -2 + (rng() - 0.5) * 4);
        bot.state = 'hold'; bot.crouching = true;
      }
    }
  }
  function hitBoxes() {
    for (const bot of bots) {
      const p = bot.pos;
      if (!bot.alive) { // dead bots present no hitbox: collapse all three
        for (const b of [bot._headBox, bot._torsoBox, bot._legsBox]) b.min.set(p.x, p.y, p.z), b.max.set(p.x, p.y, p.z);
        continue;
      }
      bot._headBox.min.set(p.x - 0.15, p.y + 1.47, p.z - 0.15);
      bot._headBox.max.set(p.x + 0.15, p.y + 1.77, p.z + 0.15);
      bot._torsoBox.min.set(p.x - 0.28, p.y + 0.8, p.z - 0.17);
      bot._torsoBox.max.set(p.x + 0.28, p.y + 1.5, p.z + 0.17);
      bot._legsBox.min.set(p.x - 0.25, p.y, p.z - 0.15);
      bot._legsBox.max.set(p.x + 0.25, p.y + 0.85, p.z + 0.15);
    }
    return allHitBoxes;
  }
  // Can `bot` see (tx, ty, tz)? Range + FOV + LOS via segmentBlocked.
  // Returns distance, or 0 when not seen.
  function canSee(bot, tx, ty, tz) {
    _a.set(bot.pos.x, bot.pos.y + EYE_H, bot.pos.z); _b.set(tx, ty, tz);
    const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > SEE_RANGE) return 0;
    if (dist > 4) {
      if ((dx * Math.sin(bot.yaw) + dz * Math.cos(bot.yaw)) / dist < FOV_COS) return 0;
    }
    if (segmentBlocked(_a, _b, colliders)) return 0;
    return dist;
  }
  function acquire(bot, target, x, z, now) {
    if (bot.target !== target) {
      bot.target = target;
      bot.reactAt = now + 0.25 + (1 - bot.skill) * 0.45;
      bot.burstLeft = 0; bot.burstAt = bot.reactAt;
      bot.strafeAnchor.x = bot.pos.x; bot.strafeAnchor.z = bot.pos.z;
      bot.strafeAt = now;
    }
    bot.lastSeenAt = now;
    setLastKnown(bot, x, z);
  }
  function perceive(bot, now) {
    if (now < bot.perceiveAt) return;
    bot.perceiveAt = now + 0.15;
    // The player is a Kestrel: only Vulture bots hunt them.
    if (bot.team === 'V') {
      const pl = getPlayer();
      if (pl && pl.alive && canSee(bot, pl.pos.x, pl.pos.y + CHEST_H, pl.pos.z) > 0) {
        acquire(bot, 'player', pl.pos.x, pl.pos.z, now);
      }
    }
    for (let i = 0; i < bots.length; i++) {
      const other = bots[i];
      if (other === bot || !other.alive || other.team === bot.team) continue;
      if (canSee(bot, other.pos.x, other.pos.y + CHEST_H, other.pos.z) > 0) {
        acquire(bot, other, other.pos.x, other.pos.z, now);
      }
    }
    if (bot.target && now - bot.lastSeenAt > LOSE_TARGET_AFTER) {
      bot.target = null;
      if (bot.lastKnown && bot.state !== 'plant' && bot.state !== 'defuse') {
        requestPath(bot, bot.lastKnown.x, bot.lastKnown.z);
        if (bot.team === 'K') bot.state = 'push';
      }
    }
  }
  function fireAt(bot, now) {
    let tx, tz, ty, moving, crouching;
    if (bot.target === 'player') {
      const pl = getPlayer();
      if (!pl || !pl.alive) { bot.target = null; return; }
      tx = pl.pos.x; tz = pl.pos.z; ty = pl.pos.y + CHEST_H;
      moving = pl.speed > 0.5; crouching = !!pl.crouching;
    } else if (bot.target) {
      const t = bot.target;
      if (!t.alive) { bot.target = null; return; }
      tx = t.pos.x; tz = t.pos.z; ty = t.pos.y + CHEST_H;
      moving = t.pathIndex < t.path.length; crouching = !!t.crouching;
    } else return;
    _eye.set(bot.pos.x, bot.pos.y + EYE_H, bot.pos.z);
    _dir.set(tx - _eye.x, ty - _eye.y, tz - _eye.z);
    const dist = _dir.length();
    if (dist < 0.001) return;
    _dir.divideScalar(dist);
    // Aim error grows with distance, shrinks with skill; moving targets are
    // harder, crouching targets slightly harder to hit.
    let err = (0.02 + dist * 0.0016) * (1.6 - bot.skill);
    if (moving) err *= 1.5;
    if (crouching) err *= 0.8;
    const phi = rng() * Math.PI * 2;
    _right.crossVectors(_dir, _up);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0); else _right.normalize();
    _up2.crossVectors(_right, _dir);
    const ex = Math.cos(phi) * err, ey = Math.sin(phi) * err;
    _dir.x += _right.x * ex + _up2.x * ey;
    _dir.y += _right.y * ex + _up2.y * ey;
    _dir.z += _right.z * ex + _up2.z * ey;
    _dir.normalize();
    // Start the ray outside the shooter's own head box (the eye sits inside
    // it, and a ray cast from inside a box reports a hit at t = 0).
    _eye.addScaledVector(_dir, 0.35);
    faceToward(bot, tx, tz);
    if (combat.fireHitscan) {
      const res = combat.fireHitscan(_eye, _dir, bot);
      if (res && res.hit && audio && audio.hitmarker) audio.hitmarker(false);
    }
    if (combat.noise) combat.noise(bot.pos.x, bot.pos.z, bot.team);
    if (audio && audio.shot) audio.shot(bot.weapon === 'smg' ? 'smg' : bot.weapon === 'sniper' ? 'sniper' : bot.weapon === 'rifle' ? 'rifle' : 'sidearm');
  }
  function combatStep(bot, dt, now) {
    if (!bot.target || now < bot.reactAt) return;
    if (bot.burstLeft > 0) {
      if (now >= bot.burstAt) {
        fireAt(bot, now);
        bot.burstLeft--; bot.burstAt = now + 0.11;
      }
    } else if (now >= bot.burstAt) {
      bot.burstLeft = 3 + Math.floor(rng() * 3); // fresh burst of 3-5 shots
      bot.burstAt = now;
    }
    // Strafe while engaging, clamped near the anchor so bots never slide
    // into walls; probe the next position against colliders first.
    if (now >= bot.strafeAt) {
      bot.strafeDir = -bot.strafeDir;
      bot.strafeAt = now + 0.7 + rng() * 0.7;
    }
    if (!bot.lastKnown) return;
    let px = bot.lastKnown.x - bot.pos.x, pz = bot.lastKnown.z - bot.pos.z;
    const len = Math.sqrt(px * px + pz * pz);
    if (len <= 0.01) return;
    px /= len; pz /= len;
    const nx = bot.pos.x + (-pz * bot.strafeDir) * WALK_SPEED * 0.5 * dt;
    const nz = bot.pos.z + (px * bot.strafeDir) * WALK_SPEED * 0.5 * dt;
    const ax = nx - bot.strafeAnchor.x, az = nz - bot.strafeAnchor.z;
    if (ax * ax + az * az <= 1.44 && probeClear(nx, nz)) { bot.pos.x = nx; bot.pos.z = nz; }
  }
  // Move along the current path. Returns true while still travelling.
  function moveAlongPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return false;
    const node = bot.path[bot.pathIndex];
    const dx = node.x - bot.pos.x, dz = node.z - bot.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < ARRIVE_DIST) { bot.pathIndex++; return bot.pathIndex < bot.path.length; }
    const speed = bot.crouching ? HOLD_SPEED : WALK_SPEED;
    const stepLen = Math.min(dist, speed * dt);
    const nx = bot.pos.x + (dx / dist) * stepLen;
    const nz = bot.pos.z + (dz / dist) * stepLen;
    if (probeClear(nx, nz)) {
      bot.pos.x = nx; bot.pos.z = nz; bot.yaw = Math.atan2(dx, dz);
    } else bot.pathIndex++; // blocked waypoint: skip it, don't get stuck
    return true;
  }
  function objectiveStep(bot, dt, now) {
    const round = getRound();
    // Freeze time: during the buy phase nobody plants or defuses — bots
    // only move to their positions. Planting/defusing need a live round.
    const fighting = round.phase === 'live' || round.phase === 'planted';
    if (bot.team === 'K') {
      // Dropped bomb: the carrier fetches it before pushing to the site.
      const gb = deps.getBomb ? deps.getBomb() : null;
      if (bot.role === 'carrier' && gb && !gb.planted && gb.holder === null) {
        const dx = gb.x - bot.pos.x, dz = gb.z - bot.pos.z;
        if (dx * dx + dz * dz > 1.44) {
          if (!bot.fetching) { bot.fetching = true; requestPath(bot, gb.x, gb.z); }
          moveAlongPath(bot, dt);
          return;
        }
        bot.fetching = false;
        if (deps.onBombPickup) deps.onBombPickup(bot);
        return;
      }
      if (bot.state === 'plant') {
        if (!fighting) return; // freeze: hold the plant until the round goes live
        const prev = bot.plantT;
        bot.plantT -= dt;
        if (audio && audio.plantBeep && Math.floor(prev * 2) !== Math.floor(bot.plantT * 2)) audio.plantBeep();
        if (bot.plantT <= 0) {
          emit('plantDone', targetSite);
          bot.state = 'retreat';
          const sp = world.spawns.K[0];
          requestPath(bot, sp.x, sp.z);
        }
        return;
      }
      if (bot.state === 'retreat') { moveAlongPath(bot, dt); return; }
      if (bot.role === 'carrier' && !round.plantedSite) {
        const s = siteOf(targetSite);
        const inside = s && bot.pos.x >= s.minX && bot.pos.x <= s.maxX && bot.pos.z >= s.minZ && bot.pos.z <= s.maxZ;
        if (inside || bot.pathIndex >= bot.path.length) {
          if (!fighting) return; // freeze: wait at the site, plant when live
          bot.state = 'plant'; bot.plantT = PLANT_TIME;
          emit('plantStart', targetSite);
          return;
        }
      }
      moveAlongPath(bot, dt);
      return;
    }
    // Vultures: rotate to a planted bomb, otherwise hold.
    if (round.plantedSite === defusedFor) {
      // Already defused this round: drop out of rotate/defuse back to hold.
      if (bot.state === 'defuse' || bot.state === 'rotate') { bot.state = 'hold'; bot.crouching = true; }
    } else if (round.plantedSite) {
      if (bot.state === 'defuse') {
        if (!fighting) return; // freeze: hold the defuse until the round goes live
        bot.defuseT -= dt;
        if (bot.defuseT <= 0) {
          defusedFor = round.plantedSite;
          emit('defuseDone', round.plantedSite); bot.state = 'hold';
        }
        return;
      }
      const bp = round.bombPos || siteOf(round.plantedSite);
      const bx = bp.x !== undefined ? bp.x : bp.cx;
      const bz = bp.z !== undefined ? bp.z : bp.cz;
      if (bot.state !== 'rotate') {
        bot.state = 'rotate'; bot.crouching = false;
        requestPath(bot, bx, bz);
      }
      const dx = bx - bot.pos.x, dz = bz - bot.pos.z;
      if (dx * dx + dz * dz < 2.25 || bot.pathIndex >= bot.path.length) {
        if (!fighting) return; // freeze: wait at the bomb, defuse when live
        bot.state = 'defuse'; bot.defuseT = DEFUSE_TIME; faceToward(bot, bx, bz);
        return;
      }
      moveAlongPath(bot, dt);
      return;
    }
    if (bot.state === 'hold') {
      if (bot.pathIndex < bot.path.length) {
        moveAlongPath(bot, dt);
        if (bot.pathIndex >= bot.path.length) bot.holdYaw = bot.yaw;
      } else {
        bot.scanPhase += dt * 0.8;
        bot.yaw = bot.holdYaw + Math.sin(bot.scanPhase) * 0.6;
        bot.crouching = true;
      }
    } else moveAlongPath(bot, dt);
  }
  // True when the carrier has arrived at the target site and must plant
  // even if it currently has a target (otherwise it would fight forever
  // and the round could never be planted).
  function carrierArrived(bot) {
    if (bot.team !== 'K' || bot.role !== 'carrier') return false;
    if (getRound().plantedSite) return false;
    const s = siteOf(targetSite);
    if (!s) return false;
    const inside = bot.pos.x >= s.minX && bot.pos.x <= s.maxX && bot.pos.z >= s.minZ && bot.pos.z <= s.maxZ;
    return inside || bot.pathIndex >= bot.path.length;
  }
  // True when a defender has reached the planted bomb and must defuse
  // even while it has a target.
  function atBomb(bot) {
    const round = getRound();
    if (bot.team !== 'V' || !round.plantedSite || round.plantedSite === defusedFor) return false;
    const bp = round.bombPos || siteOf(round.plantedSite);
    const bx = bp.x !== undefined ? bp.x : bp.cx;
    const bz = bp.z !== undefined ? bp.z : bp.cz;
    const dx = bx - bot.pos.x, dz = bz - bot.pos.z;
    return (dx * dx + dz * dz < 2.25) || bot.pathIndex >= bot.path.length;
  }
  function stepBot(bot, dt, now) {
    if (!bot.alive) {
      if (bot.fallT < 0.4) { // death fall: rotate to lying over 0.4s, sink a little
        bot.fallT = Math.min(0.4, bot.fallT + dt);
        const t = bot.fallT / 0.4;
        bot.group.rotation.x = -Math.PI / 2 * t;
        bot.group.position.y = bot.pos.y - 0.2 * t;
      }
      return;
    }
    // Freeze time: during the buy phase (and after a round ends) nobody
    // fights — bots path to their positions, but no one acquires or shoots,
    // so the player can never be killed before the round goes live.
    const round = getRound();
    const fighting = round.phase === 'live' || round.phase === 'planted';
    if (fighting) perceive(bot, now);
    const busy = bot.state === 'plant' || bot.state === 'defuse';
    // Engaging bots strafe in place; planting/defusing bots still need
    // objectiveStep so their timers count down; an arrived carrier or a
    // defender at the bomb runs the objective even with a target.
    if (carrierArrived(bot) || atBomb(bot)) objectiveStep(bot, dt, now);
    else if (bot.target && !busy && fighting) combatStep(bot, dt, now);
    else objectiveStep(bot, dt, now);
    bot.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    bot.group.rotation.y = bot.yaw;
    bot.group.scale.y = bot.crouching ? 0.82 : 1;
  }
  function step(dt, now) {
    // Separation: push apart alive bots closer than 0.9 m.
    for (let i = 0; i < bots.length; i++) {
      const a = bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bots.length; j++) {
        const b = bots[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.81 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.9 - d) / 2, ux = dx / d, uz = dz / d;
          a.pos.x -= ux * push; a.pos.z -= uz * push;
          b.pos.x += ux * push; b.pos.z += uz * push;
        }
      }
    }
    for (let i = 0; i < bots.length; i++) stepBot(bots[i], dt, now);
  }
  function damage(bot, amount, part, shooterPos) {
    if (!bot.alive) return false;
    if (bot.armor > 0) { // armor absorbs half the incoming damage while it lasts
      const absorbed = amount * 0.5;
      bot.armor = Math.max(0, bot.armor - absorbed);
      amount = amount * 0.5;
    }
    bot.hp -= amount;
    if (shooterPos) setLastKnown(bot, shooterPos.x, shooterPos.z);
    if (bot.hp > 0) return false;
    bot.hp = 0; bot.alive = false; bot.fallT = 0; bot.state = 'dead'; bot.target = null;
    if (bot.role === 'carrier') {
      bombDrop = { x: bot.pos.x, z: bot.pos.z };
      let best = null, bestD = Infinity;
      for (const other of bots) {
        if (other.team !== 'K' || !other.alive) continue;
        const dx = other.pos.x - bombDrop.x, dz = other.pos.z - bombDrop.z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = other; }
      }
      if (best) {
        best.role = 'carrier'; best.state = 'push';
        const s = siteOf(targetSite);
        if (s) requestPath(best, s.cx, s.cz);
      }
    }
    return true;
  }
  function onNoise(x, z, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const dx = x - bot.pos.x, dz = z - bot.pos.z;
      if (dx * dx + dz * dz < HEAR_RANGE * HEAR_RANGE) {
        setLastKnown(bot, x, z);
        if (!bot.target) faceToward(bot, x, z);
      }
    }
  }
  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.alive && bot.team === team) n++;
    return n;
  }
  function carrier() {
    for (const bot of bots) if (bot.team === 'K' && bot.role === 'carrier' && bot.alive) return bot;
    return null;
  }
  function resetRound() { spawnRound(lastWeapons); }
  return { bots, spawnRound, step, hitBoxes, damage, onNoise, aliveCount, carrier, resetRound };
}
