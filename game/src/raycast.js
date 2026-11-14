// raycast.js — pure-math ray / segment tests against AABBs and bot hitboxes.
// No three.js Raycaster in hot paths; slab tests on plain numbers, zero
// allocation per call. three.js is used only for Vector3 / Box3 types.
// Coordinates: x east (+), z south (+), ground y = 0.

import * as THREE from 'three';

// Core slab test. Returns the entry distance t, or -1 on a miss.
// tLo / tHi bound the accepted interval (0..maxDist for rays, 0..1 for
// segments in param space). Origin inside a box reports t = 0.
function slabHit(ox, oy, oz, dx, dy, dz, mnx, mny, mnz, mxx, mxy, mxz, tLo, tHi) {
  let tMin = tLo;
  let tMax = tHi;
  let t1, t2, tmp;
  // X axis
  if (Math.abs(dx) < 1e-9) {
    if (ox < mnx || ox > mxx) return -1;
  } else {
    t1 = (mnx - ox) / dx; t2 = (mxx - ox) / dx;
    if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  // Y axis
  if (Math.abs(dy) < 1e-9) {
    if (oy < mny || oy > mxy) return -1;
  } else {
    t1 = (mny - oy) / dy; t2 = (mxy - oy) / dy;
    if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  // Z axis
  if (Math.abs(dz) < 1e-9) {
    if (oz < mnz || oz > mxz) return -1;
  } else {
    t1 = (mnz - oz) / dz; t2 = (mxz - oz) / dz;
    if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  return tMin < 0 ? 0 : tMin;
}

// Ray vs a single Box3. Returns entry distance in [0, maxDist] or -1.
function rayBox(ox, oy, oz, dx, dy, dz, box, maxDist) {
  const mn = box.min, mx = box.max;
  return slabHit(ox, oy, oz, dx, dy, dz,
    mn.x, mn.y, mn.z, mx.x, mx.y, mx.z, 0, maxDist);
}

/**
 * Nearest wall hit along a ray.
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} dir normalised direction
 * @param {number} maxDist
 * @param {THREE.Box3[]} colliders
 * @param {{dist:number, point:THREE.Vector3}} out written on a hit
 * @returns {boolean} true when a collider is hit within maxDist
 */
export function rayHitWalls(origin, dir, maxDist, colliders, out) {
  let best = Infinity;
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const dx = dir.x, dy = dir.y, dz = dir.z;
  for (let i = 0; i < colliders.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, colliders[i], maxDist);
    if (t >= 0 && t < best) best = t;
  }
  if (best === Infinity) return false;
  out.dist = best;
  out.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
  return true;
}

/**
 * True when the segment a -> b intersects any collider AABB.
 * @param {{x:number,y:number,z:number}|THREE.Vector3} a
 * @param {{x:number,y:number,z:number}|THREE.Vector3} b
 * @param {THREE.Box3[]} colliders
 */
export function segmentBlocked(a, b, colliders) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    const mn = box.min, mx = box.max;
    // Segment param t in [0, 1]; entry t = 0 means `a` is inside a box.
    const t = slabHit(a.x, a.y, a.z, dx, dy, dz,
      mn.x, mn.y, mn.z, mx.x, mx.y, mx.z, 0, 1);
    if (t >= 0) return true;
  }
  return false;
}

/**
 * Nearest hitbox hit along a ray.
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} dir normalised direction
 * @param {number} maxDist
 * @param {{box:THREE.Box3, part:string, bot:object}[]} boxes
 * @param {{dist:number, part:string|null, bot:object|null}} out written on a hit
 * @returns {boolean} true when a hitbox is hit within maxDist
 */
export function rayHitBoxes(origin, dir, maxDist, boxes, out) {
  let best = Infinity;
  let bestPart = null;
  let bestBot = null;
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const dx = dir.x, dy = dir.y, dz = dir.z;
  for (let i = 0; i < boxes.length; i++) {
    const entry = boxes[i];
    const t = rayBox(ox, oy, oz, dx, dy, dz, entry.box, maxDist);
    if (t >= 0 && t < best) {
      best = t;
      bestPart = entry.part;
      bestBot = entry.bot;
    }
  }
  if (best === Infinity) return false;
  out.dist = best;
  out.part = bestPart;
  out.bot = bestBot;
  return true;
}
