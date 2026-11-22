// util.js — small shared helpers: deterministic RNG, math, canvas textures.
// GRAND CITY 6 — original code, written for this entry.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(rand(rng, lo, hi + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const TAU = Math.PI * 2;

/** Shortest signed angular difference, wrapped to [-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Move `angle` toward `target` by at most `step` radians. */
export function angleToward(angle, target, step) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= step) return target;
  return angle + Math.sign(d) * step;
}

/** Build a THREE.CanvasTexture from a 2D drawing callback. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft radial-gradient sprite texture (for markers, glows, particles). */
export function glowTexture(inner, outer) {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

/** Format a clock time like 21:07 from a 0-24 hour value. */
export function clockString(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** Format money like $12,450. */
export function moneyString(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Simple AABB (x/z) overlap test for a circle of radius r at (x,z). */
export function circleHitsBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

/** Push a circle out of an AABB; returns the corrected {x, z} and whether it hit. */
export function resolveCircleBox(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  let dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return { x, z, hit: false };
  if (d2 < 1e-8) {
    // Center inside the box: push out along the smallest penetration axis.
    const pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) return { x: b.minX - r, z, hit: true };
    if (m === pr) return { x: b.maxX + r, z, hit: true };
    if (m === pt) return { x, z: b.minZ - r, hit: true };
    return { x, z: b.maxZ + r, hit: true };
  }
  const d = Math.sqrt(d2);
  dx /= d; dz /= d;
  return { x: cx + dx * r, z: cz + dz * r, hit: true };
}
