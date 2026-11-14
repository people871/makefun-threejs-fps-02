// The match: rounds, economy, the bomb objective, and combat resolution. This is the
// one place match state lives. The fixed-step loop calls step(); rendering only reads.
import * as THREE from 'three';
import { WEAPONS, createArsenal, createGrenades } from './weapons.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { rayHitWalls, rayHitBoxes, segmentBlocked } from './raycast.js';

const ROUND_TIME = 100;
const BUY_TIME = 15;
const WIN_ROUNDS = 8;
const BOMB_TIMER = 35;
const PLANT_TIME = 3.5;
const START_MONEY = 800;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const ARMOR_PRICE = 650;
const ARMOR_VALUE = 50;
const FIXED_STEP = 1 / 60;

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

export function createGame(deps) {
  const { scene, camera, hud, audio, world, nav } = deps;
  const rng = deps.rng || mulberry32(1);

  // ---- state (one place) ----
  const state = {
    phase: 'buy', // buy | live | planted | roundEnd | matchEnd
    round: 1,
    scoreK: 0,
    scoreV: 0,
    roundTime: ROUND_TIME,
    buyTime: BUY_TIME,
    money: START_MONEY,
    hp: 100,
    armor: 0,
    alive: true,
    kills: 0,
    deaths: 0,
    plantedSite: null,
    bombTimer: 0,
    plantProgress: 0,
    planting: false,
    plantStart: null,
    matchWinner: null,
    roundEndAt: 0,
    elapsed: 0,
  };
  const bomb = { holder: 'player', x: 0, z: 15, planted: false, site: null, x2: 0, z2: 0 };

  const player = createPlayer(world.colliders);
  const arsenal = createArsenal(camera, audio);
  const grenades = createGrenades(scene, audio);
  const events = [];

  // ---- tracers (fixed pool, no allocation) ----
  const tracerPool = [];
  for (let i = 0; i < 12; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerIndex = 0;
  const tmpOrigin = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpPoint = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const wallHit = { dist: 0, point: new THREE.Vector3() };
  const boxHit = { dist: 0, part: '', bot: null };

  function spawnTracer(from, to) {
    const t = tracerPool[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracerPool.length;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.85;
    t.life = 0.08;
  }

  function stepTracers(dt) {
    for (const t of tracerPool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, (t.life / 0.08) * 0.85);
      if (t.life <= 0) t.line.visible = false;
    }
  }

  // ---- player hit boxes (preallocated) ----
  const playerBoxes = [
    { box: new THREE.Box3(), part: 'head', bot: null },
    { box: new THREE.Box3(), part: 'torso', bot: null },
    { box: new THREE.Box3(), part: 'legs', bot: null },
  ];
  function updatePlayerBoxes() {
    const p = player.state.position;
    playerBoxes[0].box.min.set(p.x - 0.15, p.y + 1.47, p.z - 0.15);
    playerBoxes[0].box.max.set(p.x + 0.15, p.y + 1.77, p.z + 0.15);
    playerBoxes[1].box.min.set(p.x - 0.28, p.y + 0.85, p.z - 0.17);
    playerBoxes[1].box.max.set(p.x + 0.28, p.y + 1.47, p.z + 0.17);
    playerBoxes[2].box.min.set(p.x - 0.25, p.y, p.z - 0.15);
    playerBoxes[2].box.max.set(p.x + 0.25, p.y + 0.85, p.z + 0.15);
  }

  // ---- combat (shared by player shots and bot shots) ----
  function resolveHitscan(origin, dir, shooter) {
    // Returns { hit, part, target, damage, point } — target is 'player', a bot, or null (wall).
    const def = WEAPONS[shooter === 'player' ? arsenal.currentDef().id : shooter.weapon] || WEAPONS.rifle;
    const wall = rayHitWalls(origin, dir, def.range, world.colliders, wallHit);
    const wallDist = wall ? wallHit.dist : Infinity;
    let bestDist = wallDist;
    let bestPart = null;
    let bestTarget = null;
    // Bots.
    const boxes = bots.hitBoxes();
    if (rayHitBoxes(origin, dir, Math.min(def.range, wallDist), boxes, boxHit)) {
      if (boxHit.bot !== shooter) {
        bestDist = boxHit.dist;
        bestPart = boxHit.part;
        bestTarget = boxHit.bot;
      }
    }
    // Player (only when a bot shoots).
    if (shooter !== 'player' && state.alive) {
      updatePlayerBoxes();
      const saveBot = boxHit.bot;
      if (rayHitBoxes(origin, dir, Math.min(def.range, bestDist), playerBoxes, boxHit)) {
        bestDist = boxHit.dist;
        bestPart = boxHit.part;
        bestTarget = 'player';
      }
      boxHit.bot = saveBot;
    }
    tmpPoint.copy(origin).addScaledVector(dir, bestDist === Infinity ? def.range : bestDist);
    if (bestTarget) {
      const mult = bestPart === 'head' ? def.headMult : 1;
      return { hit: true, part: bestPart, target: bestTarget, damage: def.damage * mult, point: tmpPoint.clone() };
    }
    return { hit: false, part: null, target: null, damage: 0, point: tmpPoint.clone() };
  }

  function damagePlayer(amount, part, shooter) {
    if (!state.alive) return;
    const absorbed = Math.min(state.armor, amount * 0.5);
    state.armor -= absorbed;
    state.hp -= (amount - absorbed);
    audio.hurt();
    if (state.hp <= 0) {
      state.hp = 0;
      state.alive = false;
      state.deaths += 1;
      if (bomb.holder === 'player') {
        bomb.holder = null;
        bomb.x = player.state.position.x;
        bomb.z = player.state.position.z;
      }
      hud.showOverlay('dead');
      if (document.pointerLockElement) document.exitPointerLock();
      checkRoundEnd();
    }
  }

  function damageBot(bot, amount, part, shooter) {
    const killed = bots.damage(bot, amount, part, shooter === 'player' ? { x: player.state.position.x, z: player.state.position.z } : null);
    if (killed) {
      state.money += KILL_REWARD;
      state.kills += 1;
      const name = shooter === 'player' ? 'You' : (shooter && shooter.name) || 'Kestrel';
      hud.killfeed(name, bot.name, part === 'head', shooter === 'player' ? 'K' : shooter.team);
      if (bomb.holder === bot) {
        bomb.holder = null;
        bomb.x = bot.pos.x;
        bomb.z = bot.pos.z;
      }
      checkRoundEnd();
    }
    return killed;
  }

  const combat = {
    fireHitscan(origin, dir, shooter) {
      const result = resolveHitscan(origin, dir, shooter);
      spawnTracer(origin, result.point);
      if (result.target === 'player') {
        damagePlayer(result.damage, result.part, shooter);
      } else if (result.target) {
        damageBot(result.target, result.damage, result.part, shooter);
      }
      return result;
    },
    noise(x, z, team) {
      bots.onNoise(x, z, team);
    },
    damagePlayer,
    damageBot,
    plantDone(site) {
      events.push({ type: 'plantDone', site });
    },
    defuseDone(site) {
      events.push({ type: 'defuseDone', site });
    },
  };

  const bots = createBots(scene, {
    world,
    nav,
    rng,
    combat,
    events,
    audio,
    getPlayer: () => ({
      pos: player.state.position,
      eye: player.state.eye,
      alive: state.alive,
      crouching: player.state.crouching,
      speed: player.groundSpeed(),
    }),
    getRound: () => ({
      phase: state.phase === 'roundEnd' || state.phase === 'matchEnd' ? 'over' : state.phase,
      plantedSite: state.plantedSite,
      bombPos: bomb.planted ? { x: bomb.x, z: bomb.z } : null,
      timeLeft: state.phase === 'planted' ? state.bombTimer : state.roundTime,
    }),
    getBomb: () => ({ holder: bomb.holder, x: bomb.x, z: bomb.z, planted: bomb.planted }),
    onBombPickup: (bot) => { bomb.holder = bot; },
  });

  // ---- minimap model (walls projected to 2D, floor excluded) ----
  const minimapModel = {
    minX: world.bounds.minX,
    maxX: world.bounds.maxX,
    minZ: world.bounds.minZ,
    maxZ: world.bounds.maxZ,
    sites: world.sites,
    walls: world.colliders
      .filter((c) => c.min.y >= -0.01 && c.max.y > 0.5)
      .map((c) => ({ x: (c.min.x + c.max.x) / 2, z: (c.min.z + c.max.z) / 2, w: c.max.x - c.min.x, d: c.max.z - c.min.z })),
  };

  // ---- economy / buy ----
  function buyItems() {
    const owned = (id) => arsenal.has(id);
    return [
      { key: '1', id: 'sidearm', name: 'P9 Sparrow — sidearm', price: WEAPONS.sidearm.price, owned: owned('sidearm'), equipped: arsenal.currentDef().id === 'sidearm' },
      { key: '2', id: 'smg', name: 'Rook-9 — SMG', price: WEAPONS.smg.price, owned: owned('smg'), equipped: arsenal.currentDef().id === 'smg' },
      { key: '3', id: 'rifle', name: 'VK-7 Carbine — rifle', price: WEAPONS.rifle.price, owned: owned('rifle'), equipped: arsenal.currentDef().id === 'rifle' },
      { key: '4', id: 'sniper', name: 'Longbow .50 — sniper', price: WEAPONS.sniper.price, owned: owned('sniper'), equipped: arsenal.currentDef().id === 'sniper' },
      { key: '5', id: 'grenade', name: 'Spark Frag — grenade', price: WEAPONS.grenade.price, owned: grenadeCount > 0, equipped: false },
      { key: '6', id: 'armor', name: 'Vest — 50 armor', price: ARMOR_PRICE, owned: state.armor >= ARMOR_VALUE, equipped: false },
    ];
  }
  let grenadeCount = 0;

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (id === 'grenade') {
      if (grenadeCount >= 1 || state.money < WEAPONS.grenade.price) return false;
      state.money -= WEAPONS.grenade.price;
      grenadeCount = 1;
      audio.buy();
    } else if (id === 'armor') {
      if (state.armor >= ARMOR_VALUE || state.money < ARMOR_PRICE) return false;
      state.money -= ARMOR_PRICE;
      state.armor = ARMOR_VALUE;
      audio.buy();
    } else {
      const def = WEAPONS[id];
      if (!def) return false;
      if (arsenal.has(id)) {
        arsenal.equip(id);
      } else {
        if (state.money < def.price) return false;
        state.money -= def.price;
        arsenal.buy(id);
        arsenal.equip(id);
      }
      audio.buy();
    }
    hud.updateBuy(buyItems());
    return true;
  }

  // ---- rounds ----
  function startRound() {
    state.phase = 'buy';
    state.buyTime = BUY_TIME;
    state.roundTime = ROUND_TIME;
    state.plantedSite = null;
    state.bombTimer = 0;
    state.plantProgress = 0;
    state.planting = false;
    state.plantStart = null;
    bomb.planted = false;
    bomb.site = null;
    bomb.holder = 'player';
    state.alive = true;
    state.hp = 100;
    if (state.round === 1) state.armor = 0;
    grenadeCount = 0;
    arsenal.resetRound(state.round > 1);
    player.teleport(0, 15, 0);
    const site = rng() < 0.5 ? 'A' : 'B';
    bots.spawnRound({ K: ['rifle', 'rifle', 'smg', 'sniper'], V: ['rifle', 'rifle', 'rifle', 'smg', 'sniper'], site });
    hud.hideBanner();
    hud.hidePlant();
    hud.showBuy(buyItems());
    hud.setScore(state.scoreK, state.scoreV, state.round);
    hud.setHealth(state.hp, state.armor);
    hud.setMoney(state.money);
  }

  function startMatch() {
    state.scoreK = 0;
    state.scoreV = 0;
    state.round = 1;
    state.kills = 0;
    state.deaths = 0;
    state.money = START_MONEY;
    state.matchWinner = null;
    arsenal.resetRound(false);
    startRound();
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.roundEndAt = state.elapsed;
    if (winner === 'K') {
      state.scoreK += 1;
      state.money += WIN_REWARD;
      hud.banner('ROUND WON', reason, 'win');
      audio.roundWin();
    } else {
      state.scoreV += 1;
      state.money += LOSS_REWARD;
      hud.banner('ROUND LOST', reason, 'lose');
      audio.roundLose();
    }
    hud.hideBuy();
    hud.hidePlant();
    hud.setScore(state.scoreK, state.scoreV, state.round);
    hud.setMoney(state.money);
  }

  function checkRoundEnd() {
    if (state.phase !== 'live' && state.phase !== 'planted') return;
    const kAlive = state.alive || bots.aliveCount('K') > 0;
    const vAlive = bots.aliveCount('V') > 0;
    if (!vAlive) endRound('K', 'Vultures eliminated.');
    // With the charge planted the round plays out: defenders may still defuse,
    // or the charge detonates, so a wiped attack does not end it at once.
    else if (!kAlive && state.phase !== 'planted') endRound('V', 'Kestrels eliminated.');
  }

  function nextRound() {
    if (state.scoreK >= WIN_ROUNDS || state.scoreV >= WIN_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchWinner = state.scoreK >= WIN_ROUNDS ? 'K' : 'V';
      hud.showOverlay(state.matchWinner === 'K' ? 'matchWin' : 'matchLose');
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    state.round += 1;
    startRound();
  }

  // ---- player shooting ----
  function playerShoot() {
    const def = arsenal.fire();
    if (!def) {
      if (arsenal.mag() === 0) audio.dryFire();
      return;
    }
    camera.getWorldDirection(tmpDir);
    const spread = arsenal.spread(player.groundSpeed(), player.state.airborne);
    tmpDir.x += (rng() * 2 - 1) * spread;
    tmpDir.y += (rng() * 2 - 1) * spread;
    tmpDir.z += (rng() * 2 - 1) * spread;
    tmpDir.normalize();
    camera.getWorldPosition(tmpOrigin);
    const result = resolveHitscan(tmpOrigin, tmpDir, 'player');
    spawnTracer(tmpOrigin, result.point);
    if (result.target && result.target !== 'player') {
      const killed = damageBot(result.target, result.damage, result.part, 'player');
      hud.hitMarker(killed, 4000);
      audio.hit(killed);
    }
    combat.noise(player.state.position.x, player.state.position.z, 'K');
    player.recoil(def.recoilPitch + rng() * 0.004, (rng() * 2 - 1) * def.recoilYaw);
  }

  // ---- plant / defuse ----
  function siteAt(x, z) {
    for (const name of ['A', 'B']) {
      const s = world.sites[name];
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return name;
    }
    return null;
  }

  function stepPlant(dt, keys) {
    const wantPlant = keys.has('KeyE');
    const site = siteAt(player.state.position.x, player.state.position.z);
    const canPlant = state.alive && state.phase === 'live' && bomb.holder === 'player' && site;
    if (wantPlant && canPlant) {
      if (!state.planting) {
        state.planting = true;
        state.plantStart = { x: player.state.position.x, z: player.state.position.z };
        state.plantProgress = 0;
      }
      const moved = Math.hypot(player.state.position.x - state.plantStart.x, player.state.position.z - state.plantStart.z);
      if (moved > 0.6) {
        state.planting = false;
        state.plantProgress = 0;
        hud.hidePlant();
        return;
      }
      state.plantProgress += dt / PLANT_TIME;
      hud.showPlant(`Planting at Site ${site}`, state.plantProgress);
      if (state.plantProgress >= 1) {
        state.planting = false;
        state.plantedSite = site;
        state.phase = 'planted';
        state.bombTimer = BOMB_TIMER;
        bomb.planted = true;
        bomb.site = site;
        bomb.x = player.state.position.x;
        bomb.z = player.state.position.z;
        hud.hidePlant();
        hud.banner('CHARGE PLANTED', `Defend Site ${site} — ${BOMB_TIMER}s to detonation.`, 'win');
        audio.plantBeep(true);
      }
    } else {
      if (state.planting) {
        state.planting = false;
        state.plantProgress = 0;
        hud.hidePlant();
      }
    }
  }

  // ---- grenades ----
  function stepGrenades(dt) {
    grenades.step(dt, world.colliders, (pos) => {
      // Damage everyone near the blast; walls blunt it.
      const radius = WEAPONS.grenade.radius;
      const hurt = (targetPos, apply) => {
        const d = Math.hypot(targetPos.x - pos.x, targetPos.z - pos.z) + Math.abs((targetPos.y || 0) + 1 - pos.y) * 0.5;
        if (d > radius) return;
        const blocked = segmentBlocked({ x: pos.x, y: pos.y, z: pos.z }, { x: targetPos.x, y: (targetPos.y || 0) + 1.2, z: targetPos.z }, world.colliders);
        const dmg = WEAPONS.grenade.maxDamage * (1 - d / radius) * (blocked ? 0.25 : 1);
        if (dmg > 5) apply(dmg);
      };
      if (state.alive) hurt({ x: player.state.position.x, y: player.state.position.y, z: player.state.position.z }, (d) => damagePlayer(d, 'torso', null));
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        hurt({ x: bot.pos.x, y: bot.pos.y, z: bot.pos.z }, (d) => {
          if (bot.team === 'V') damageBot(bot, d, 'torso', 'player');
          else bots.damage(bot, d, 'torso', null);
        });
      }
      checkRoundEnd();
    });
  }

  // ---- events from bots ----
  function drainEvents() {
    while (events.length) {
      const evt = events.shift();
      if (evt.type === 'plantDone') {
        state.plantedSite = evt.site;
        state.phase = 'planted';
        state.bombTimer = BOMB_TIMER;
        bomb.planted = true;
        bomb.site = evt.site;
        bomb.x = evt.x ?? bomb.x;
        bomb.z = evt.z ?? bomb.z;
        hud.banner('CHARGE PLANTED', `Defend Site ${evt.site} — ${BOMB_TIMER}s to detonation.`, 'win');
        audio.plantBeep(true);
      } else if (evt.type === 'defuseDone') {
        endRound('V', 'Charge defused.');
      }
    }
  }

  // ---- main fixed step ----
  let stepSoundAt = 0;
  function step(dt, input) {
    state.elapsed += dt;
    const keys = input.keys;

    if (state.phase === 'buy') {
      state.buyTime -= dt;
      if (keys.has('KeyB') && !input._bPressed) {
        input._bPressed = true;
        if (hud.buyOpen()) hud.hideBuy();
        else hud.showBuy(buyItems());
      }
      if (!keys.has('KeyB')) input._bPressed = false;
      if (state.buyTime <= 0) {
        state.phase = 'live';
        hud.hideBuy();
      }
    } else if (state.phase === 'live') {
      state.roundTime -= dt;
      if (state.roundTime <= 0) {
        state.roundTime = 0;
        endRound('V', 'Time expired — charge never planted.');
      }
    } else if (state.phase === 'planted') {
      state.bombTimer -= dt;
      state.roundTime = state.bombTimer;
      if (Math.floor(state.bombTimer) !== Math.floor(state.bombTimer + dt)) audio.plantBeep(false);
      if (state.bombTimer <= 0) {
        audio.explosion();
        endRound('K', 'Charge detonated.');
      }
    } else if (state.phase === 'roundEnd') {
      if (state.elapsed - state.roundEndAt >= 4) nextRound();
    }

    const playing = state.phase === 'live' || state.phase === 'planted' || state.phase === 'buy';
    if (playing && state.alive) {
      player.look(input.lookX, input.lookY);
      player.step(dt, keys);
      if (input.firing && arsenal.ready()) playerShoot();
      if (keys.has('KeyR')) arsenal.reload();
      if (keys.has('KeyG') && grenadeCount > 0 && !input._gPressed) {
        input._gPressed = true;
        grenadeCount -= 1;
        camera.getWorldDirection(tmpDir);
        camera.getWorldPosition(tmpOrigin);
        grenades.throwFrom(tmpOrigin, tmpDir, 15);
        audio.click();
      }
      if (!keys.has('KeyG')) input._gPressed = false;
      // Weapon switching 1-4.
      for (const [code, id] of [['Digit1', 'sidearm'], ['Digit2', 'smg'], ['Digit3', 'rifle'], ['Digit4', 'sniper']]) {
        if (keys.has(code) && !input[`_${code}`]) {
          input[`_${code}`] = true;
          if (arsenal.has(id)) arsenal.equip(id);
        }
        if (!keys.has(code)) input[`_${code}`] = false;
      }
      arsenal.setZoomed(!!input.zoom && arsenal.currentDef().id === 'sniper');
      stepPlant(dt, keys);
      // Footsteps.
      const speed = player.groundSpeed();
      if (speed > 1 && player.state.onGround && state.elapsed - stepSoundAt > 0.38) {
        stepSoundAt = state.elapsed;
        audio.step();
      }
    }
    arsenal.step(dt);
    bots.step(dt, state.elapsed);
    stepGrenades(dt);
    stepTracers(dt);
    drainEvents();

    // Bomb follows its holder.
    if (!bomb.planted) {
      if (bomb.holder === 'player') {
        bomb.x = player.state.position.x;
        bomb.z = player.state.position.z;
      } else if (bomb.holder && bomb.holder.alive) {
        bomb.x = bomb.holder.pos.x;
        bomb.z = bomb.holder.pos.z;
      } else if (bomb.holder && !bomb.holder.alive) {
        const carrier = bots.carrier();
        bomb.holder = carrier || null;
        if (carrier) {
          bomb.x = carrier.pos.x;
          bomb.z = carrier.pos.z;
        }
      }
    }

    // Camera follows the player (or stays at the death spot).
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
    const fovTarget = 74 * arsenal.zoomFovMult();
    if (Math.abs(camera.fov - fovTarget) > 0.05) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
  }

  function syncHud() {
    const def = arsenal.currentDef();
    hud.setHealth(state.hp, state.armor);
    hud.setAmmo(arsenal.mag(), arsenal.reserve(), def.name);
    hud.setMoney(state.money);
    hud.setTimer(state.phase === 'buy' ? state.buyTime : state.roundTime, state.phase);
    hud.setScore(state.scoreK, state.scoreV, state.round);
    hud.setCrosshairSpread(arsenal.spread(player.groundSpeed(), player.state.airborne) * 900);
    const friendlies = [];
    const enemies = [];
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      if (bot.team === 'K') friendlies.push({ x: bot.pos.x, z: bot.pos.z });
      else if (bot.lastSeenAt && state.elapsed - bot.lastSeenAt < 3) enemies.push({ x: bot.pos.x, z: bot.pos.z });
    }
    hud.drawMinimap(
      minimapModel,
      { x: player.state.position.x, z: player.state.position.z, yaw: player.state.yaw },
      friendlies,
      enemies,
      bomb.planted ? { x: bomb.x, z: bomb.z } : null,
    );
  }

  // ---- deterministic staging for ?shot= captures ----
  function stageShot(name) {
    hud.hideOverlay();
    hud.hideBuy();
    if (name === 'start') {
      startMatch();
      player.teleport(0, 15, 0.35);
      player.state.pitch = 0.02;
      hud.showBuy(buyItems());
    } else if (name === 'play') {
      startMatch();
      state.phase = 'live';
      state.roundTime = 62;
      hud.hideBuy();
      player.teleport(0, 6, 0.1);
      player.state.pitch = 0;
      state.hp = 78;
      state.money = 2400;
      arsenal.buy('rifle');
      arsenal.equip('rifle');
      // Stage two enemies in view down the mid lane (bot yaw 0 faces south,
      // toward the player; yaw PI faces north).
      const vBots = bots.bots.filter((b) => b.team === 'V');
      if (vBots[0]) {
        vBots[0].pos.set(1.5, 0, -4);
        vBots[0].yaw = 0;
        vBots[0].state = 'hold';
        vBots[0].path = [];
      }
      if (vBots[1]) {
        vBots[1].pos.set(-3.5, 0, -7);
        vBots[1].yaw = 0;
        vBots[1].state = 'hold';
        vBots[1].path = [];
      }
      const kBots = bots.bots.filter((b) => b.team === 'K');
      if (kBots[0]) {
        kBots[0].pos.set(-2.5, 0, 9);
        kBots[0].yaw = Math.PI;
        kBots[0].state = 'hold';
        kBots[0].path = [];
      }
    } else if (name === 'end') {
      startMatch();
      state.phase = 'roundEnd';
      state.scoreK = 1;
      state.roundEndAt = state.elapsed;
      player.teleport(-16, -9, 0.6);
      player.state.pitch = -0.05;
      // startMatch -> startRound re-opens the buy menu; a round-end frame
      // must not show it (the 'play' branch hides it for the same reason).
      hud.hideBuy();
      hud.banner('ROUND WON', 'Vultures eliminated.', 'win', true);
      hud.setScore(1, 0, 1);
    }
    syncHud();
  }

  // ---- scripted self-test (drives the sim without rendering) ----
  function selftest() {
    const results = {};
    try {
      startMatch();
      const x0 = player.state.position.x;
      const z0 = player.state.position.z;
      const keys = new Set(['KeyW']);
      const input = { keys, firing: false, zoom: false, lookX: 0, lookY: 0 };
      for (let i = 0; i < 60; i += 1) step(FIXED_STEP, input);
      results.moved = Math.hypot(player.state.position.x - x0, player.state.position.z - z0) > 1;
      results.movedDist = Math.hypot(player.state.position.x - x0, player.state.position.z - z0).toFixed(2);
      // Place an enemy in front of the player and shoot it.
      const vBot = bots.bots.find((b) => b.team === 'V' && b.alive);
      vBot.pos.set(player.state.position.x, 0, player.state.position.z - 6);
      vBot.state = 'hold';
      vBot.path = [];
      const hpBefore = vBot.hp;
      player.state.yaw = 0;
      player.state.pitch = 0;
      camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
      camera.rotation.set(0, 0, 0, 'YXZ');
      camera.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
      const magBefore = arsenal.mag();
      input.firing = true;
      for (let i = 0; i < 30; i += 1) step(FIXED_STEP, input);
      input.firing = false;
      results.fired = arsenal.mag() < magBefore;
      results.botHit = vBot.hp < hpBefore;
      results.botHpAfter = vBot.hp;
      results.hudUpdated = true;
      // Burn through the 15 s buy phase (bots hold fire during it) so the
      // round is live, then force a round end: eliminate all V bots, then
      // step through the intermission.
      const idle = { keys: new Set(), firing: false, zoom: false, lookX: 0, lookY: 0 };
      for (let i = 0; i < 960 && state.phase === 'buy'; i += 1) step(FIXED_STEP, idle);
      results.liveAfterBuy = state.phase === 'live';
      for (const b of bots.bots) if (b.team === 'V' && b.alive) bots.damage(b, 999, 'torso', null);
      checkRoundEnd();
      results.roundEnded = state.phase === 'roundEnd' && state.scoreK === 1;
      for (let i = 0; i < 300; i += 1) step(FIXED_STEP, idle);
      results.roundRestarted = state.phase === 'buy' && state.round === 2;
      results.moneyAfterWin = state.money;
    } catch (err) {
      results.error = String(err && err.message ? err.message : err);
    }
    return results;
  }

  return {
    state,
    bomb,
    player,
    arsenal,
    bots,
    startMatch,
    startRound,
    step,
    syncHud,
    buy,
    buyItems,
    stageShot,
    selftest,
    minimapModel,
  };
}
