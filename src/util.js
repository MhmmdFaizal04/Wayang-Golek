/* Small maths helpers used across the stage. */

export const TAU = Math.PI * 2;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Map v from one range onto another, clamped at both ends. */
export const remap = (v, inLo, inHi, outLo, outHi) =>
  lerp(outLo, outHi, clamp((v - inLo) / (inHi - inLo || 1e-6)));

/** Smoothstep with a clamped input. */
export const smoothstep = (edge0, edge1, v) => {
  const t = clamp((v - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. */
export const approach = (current, target, rate, dt) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

/** Shortest signed distance between two angles. */
export const angleDelta = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** Exponential approach that takes the short way round a circle. */
export const approachAngle = (current, target, rate, dt) =>
  current + angleDelta(current, target) * (1 - Math.exp(-rate * dt));

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const dist3 = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** A tiny deterministic PRNG so every reload draws the same figures. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap value noise in one dimension — smooth, looping, no allocations. */
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 1.0 + seed * 1.7) * 0.5 +
    Math.sin(t * 2.3 + seed * 4.1) * 0.32 +
    Math.sin(t * 4.7 + seed * 2.9) * 0.18
  );
}

/**
 * A one-pole filter with a deadband, so a hand at rest produces a still
 * puppet instead of a twitching one.
 */
export class Damped {
  constructor(value = 0, rate = 14, deadband = 0) {
    this.value = value;
    this.rate = rate;
    this.deadband = deadband;
  }

  set(v) {
    this.value = v;
    return v;
  }

  step(target, dt, rate = this.rate) {
    if (this.deadband && Math.abs(target - this.value) < this.deadband) {
      return this.value;
    }
    this.value = approach(this.value, target, rate, dt);
    return this.value;
  }
}

/** Rolling median of the last n samples — shrugs off tracker spikes. */
export class Median {
  constructor(size = 5) {
    this.size = size;
    this.buf = [];
    this.sorted = [];
  }

  push(v) {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    this.sorted = [...this.buf].sort((a, b) => a - b);
    return this.sorted[this.sorted.length >> 1];
  }

  get value() {
    return this.sorted.length ? this.sorted[this.sorted.length >> 1] : 0;
  }
}
