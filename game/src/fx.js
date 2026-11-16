// fx.js — pooled impact dust / spark bursts and explosion flashes.
// Everything is preallocated: a fixed sprite pool and one reusable light.
// No allocation in step() or in the burst/explosion calls (callers pass a
// point; the pool reuses its own vectors).
import * as THREE from 'three';

const POOL = 40;

function softDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFx(scene) {
  const tex = softDotTexture();
  const items = [];
  for (let i = 0; i < POOL; i += 1) {
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    items.push({
      sprite, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.3, grow: 1,
    });
  }
  let cursor = 0;

  // One reusable explosion light + fireball sprite.
  const boomLight = new THREE.PointLight(0xff7a1a, 0, 24, 1.8);
  scene.add(boomLight);
  const boomMat = new THREE.SpriteMaterial({
    map: tex, color: 0xffb060, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const boomSprite = new THREE.Sprite(boomMat);
  boomSprite.visible = false;
  scene.add(boomSprite);
  let boomLife = 0;
  let boomMax = 1;
  let boomScale = 1;

  function spawnOne(point, vx, vy, vz, life, size, grow, color, additive) {
    const it = items[cursor];
    cursor = (cursor + 1) % items.length;
    it.sprite.position.copy(point);
    it.vel.set(vx, vy, vz);
    it.life = life;
    it.maxLife = life;
    it.size = size;
    it.grow = grow;
    it.sprite.material.color.setHex(color);
    it.sprite.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    it.sprite.material.needsUpdate = true;
    it.sprite.material.opacity = 0.9;
    it.sprite.scale.set(size, size, 1);
    it.sprite.visible = true;
  }

  function burst(point, opts = {}) {
    const count = opts.count || 6;
    const speed = opts.speed || 2.2;
    const life = opts.life || 0.5;
    const size = opts.size || 0.35;
    const color = opts.color || 0xcfc4ae;
    const additive = !!opts.additive;
    const up = opts.up || 1.0;
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * speed;
      spawnOne(
        point,
        Math.cos(a) * r, (Math.random() * 0.9 + 0.1) * speed * up,
        Math.sin(a) * r,
        life * (0.6 + Math.random() * 0.7),
        size * (0.7 + Math.random() * 0.6),
        1.6, color, additive,
      );
    }
  }

  // Orange flash + light at a point (grenade blast, bomb detonation, the
  // brief arming flash when the charge is planted). Scale 1 = full blast.
  function explosion(point, scale = 1) {
    boomScale = scale;
    boomLight.position.set(point.x, point.y + 0.6, point.z);
    boomLight.intensity = 70 * scale;
    boomSprite.position.set(point.x, point.y + 0.6, point.z);
    boomSprite.scale.set(7 * scale, 7 * scale, 1);
    boomMat.opacity = 0.95;
    boomSprite.visible = true;
    boomLife = 0.5;
    boomMax = 0.5;
    burst(point, { count: Math.round(14 * scale), color: 0xffa040, speed: 4, life: 0.7, size: 0.8, additive: true });
    burst(point, { count: Math.round(8 * scale), color: 0x8a8078, speed: 1.5, life: 0.9, size: 1.1 });
  }

  function step(dt) {
    for (const it of items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) {
        it.sprite.visible = false;
        it.sprite.material.opacity = 0;
        continue;
      }
      it.sprite.position.addScaledVector(it.vel, dt);
      it.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      it.vel.y -= dt * 1.5;
      const s = it.size * (1 + (1 - it.life / it.maxLife) * it.grow);
      it.sprite.scale.set(s, s, 1);
      it.sprite.material.opacity = 0.9 * (it.life / it.maxLife);
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const t = Math.max(0, boomLife / boomMax);
      boomLight.intensity = 70 * boomScale * t;
      boomMat.opacity = 0.95 * t;
      const s = 7 * boomScale * (1 + (1 - t) * 0.8);
      boomSprite.scale.set(s, s, 1);
      if (boomLife <= 0) {
        boomSprite.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { burst, explosion, step };
}
