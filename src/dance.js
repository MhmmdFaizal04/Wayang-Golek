// "Kiprahan" — a signature solo built from wayang sabetan vocabulary, performed in the staccato, spasmodic manner
// of a live dalang: the figure HOLDS a pose, then SNAPS to the next one in ~0.1 s, often in bursts of two or three
// quick jerks on the sub-beats, and quivers (getar) while it holds.
//
// Motifs, in order:
//   sembahan    — hands pressed together before the face, bowing (the opening salute)
//   ulap-ulap   — a hand at the brow as if looking far, head peeking left and right
//   kiprah      — the bold show-off dance: arms flung to new angles, hopping on each beat
//   ombak banyu — "water waves", a jerky rise-and-fall that ripples forward
//   srisig      — rapid tiny running steps
//   besut       — jumps up toward the blencong (the shadow swells), arms wheeling, spinning around twice
//   sabetan     — wind up, then a whip-like strike of the front arm with a lunge
//   tancep      — slammed down into the gedebog, a rebound, then back to the hand

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 2;
const mix = (a, b, t) => a + (b - a) * t;
const mixV = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const arc = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

const REST_F = [0.45, -0.55];
const REST_B = [-0.25, -0.95];
const SEMBAH_F = [0.55, 0.45];
const SEMBAH_B = [1.15, 0.45];
const ULAP_F = [0.3, 0.85];
const HIP_B = [-0.15, -0.75];
const SPREAD_F = [1.0, 0.45];
const SPREAD_B = [-0.95, -0.25];
const OUT_F = [1.05, 0.08];
const OUT_B = [-1.0, 0.05];

const SNAP = 0.17;

const K = (b, pose, snap = SNAP) => ({ b, snap, ...pose });
const KEYS = [
  K(-0.01, { motif: 'sembahan', x: 0, y: 8, tilt: 0.04, depth: 0, front: REST_F, back: REST_B }),
  K(0, { y: 12, tilt: 0.1, front: [0.5, 0.05], back: [0.55, -0.25] }),
  K(0.33, { y: 16, tilt: 0.18, front: SEMBAH_F, back: SEMBAH_B }),
  K(1, { y: 22, tilt: 0.26 }),
  K(1.33, { y: 14, tilt: 0.14 }),
  K(1.66, { y: 18, tilt: 0.2 }, 0.1),

  K(2, { motif: 'ulap-ulap', y: -10, tilt: -0.06, front: ULAP_F, back: HIP_B }),
  K(2.33, { x: 26, tilt: 0.05 }),
  K(2.66, { x: 0, tilt: -0.09 }),
  K(3, { x: 34, y: -16, tilt: 0.07 }),
  K(3.33, { x: 20, tilt: -0.03 }, 0.1),
  K(3.66, { y: -8, tilt: 0.02 }, 0.1),

  K(4, { motif: 'kiprah', x: 10, y: -24, tilt: 0.14, front: SPREAD_F, back: SPREAD_B }),
  K(4.25, { y: 4, tilt: 0.06 }, 0.1),
  K(5, { x: 0, y: -20, tilt: -0.12, front: [0.7, 0.95], back: [-0.7, -0.6] }),
  K(5.25, { y: 4 }, 0.1),
  K(6, { x: 32, y: -22, tilt: 0.18, front: [1.1, -0.1], back: [-0.6, 0.8] }),
  K(6.25, { y: 6 }, 0.1),
  K(6.66, { front: [0.9, 0.6], back: [-0.95, -0.2] }),
  K(7, { x: 12, y: -24, tilt: -0.13, front: [0.4, 1.0], back: [-1.0, 0.3] }),
  K(7.25, { y: 6, tilt: -0.04 }, 0.1),
  K(7.6, { tilt: 0.07 }),

  K(8, { motif: 'ombak banyu', x: 30, y: -22, tilt: -0.07, front: [0.95, 0.7], back: [-0.9, -0.5] }),
  K(8.5, { x: 45, y: 18, tilt: 0.11, front: [0.95, -0.2], back: [-0.9, 0.45] }),
  K(9, { x: 60, y: -22, tilt: -0.07, front: [0.95, 0.7], back: [-0.9, -0.5] }),
  K(9.5, { x: 75, y: 18, tilt: 0.11, front: [0.95, -0.2], back: [-0.9, 0.45] }),
  K(10, { x: 90, y: -22, tilt: -0.07, front: [0.95, 0.7], back: [-0.9, -0.5] }),
  K(10.5, { x: 100, y: 18, tilt: 0.11, front: [0.95, -0.2], back: [-0.9, 0.45] }),
  K(11, { x: 110, y: -18, tilt: -0.05, front: [0.95, 0.6], back: [-0.9, -0.4] }),
  K(11.5, { x: 115, y: 10, tilt: 0.08, front: [0.95, 0.1], back: [-0.9, 0.2] }),

  K(12, { motif: 'srisig', x: 135, y: -8, tilt: 0.13, front: OUT_F, back: OUT_B }, 0.1),
  K(12.33, { x: 157, y: 0 }, 0.1),
  K(12.66, { x: 179, y: -8 }, 0.1),
  K(13, { x: 201, y: 0 }, 0.1),
  K(13.33, { x: 223, y: -8 }, 0.1),
  K(13.66, { x: 240, y: 0 }, 0.1),

  K(14, { motif: 'besut', x: 0, y: -52, tilt: 0.02, depth: 0.9, front: arc(0.95, Math.PI / 2), back: arc(0.9, -Math.PI / 2) }, 0.22),
  K(14.5, { front: arc(0.95, 0), back: arc(0.9, Math.PI) }),
  K(15.5, { front: arc(0.95, -Math.PI / 2), back: arc(0.9, Math.PI / 2) }),
  K(16.33, { front: arc(0.95, Math.PI), back: arc(0.9, 0) }),
  K(16.66, { y: -4, tilt: 0.04, depth: 0.2, front: arc(0.95, Math.PI / 2), back: arc(0.9, -Math.PI / 2) }, 0.18),

  K(17, { motif: 'sabetan', x: -12, y: 0, tilt: -0.12, depth: 0, front: arc(1.1, 2.5), back: SPREAD_B }),
  K(17.33, { x: 80, tilt: 0.22, front: arc(1.15, -0.4) }, 0.08),

  K(18.33, { motif: 'tancep', x: 72, y: 34, tilt: 0.03, front: REST_F, back: REST_B }, 0.1),
  K(18.5, { y: 20 }, 0.1),
  K(18.8, { x: 0, y: 8, tilt: 0 }, 0.5),
];

for (let i = 1; i < KEYS.length; i++) {
  for (const f of ['motif', 'x', 'y', 'tilt', 'depth', 'front', 'back']) {
    if (KEYS[i][f] === undefined) KEYS[i][f] = KEYS[i - 1][f];
  }
}

export const KIPRAH_BEATS = 19.5;
export const TURN_BEATS = [15, 16];

export function kiprahPose(b) {
  let i = 0;
  while (i + 1 < KEYS.length && KEYS[i + 1].b <= b) i++;
  const key = KEYS[i];
  const prev = KEYS[Math.max(0, i - 1)];
  const u = i === 0 ? 1 : (b - key.b) / key.snap;
  const t = easeOut(u);
  const since = Math.max(0, b - key.b - key.snap);
  return {
    motif: key.motif,
    x: mix(prev.x, key.x, t),
    y: mix(prev.y, key.y, t),
    tilt: mix(prev.tilt, key.tilt, t),
    depth: mix(prev.depth, key.depth, t),
    front: mixV(prev.front, key.front, t),
    back: mixV(prev.back, key.back, t),
    still: u < 1 ? 0 : 1 - Math.exp(-since * 5),
  };
}

export function danceWeight(b, start) {
  const ramp = (t) => {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  };
  return ramp((b - start) / 0.5) * (1 - ramp((b - (KIPRAH_BEATS - 0.7)) / 0.7));
}
