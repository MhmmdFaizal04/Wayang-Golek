/**
 * Puppet geometry.
 *
 * Every figure here is generated from scratch: a parametric description in
 * puppet-local units, drawn with canvas paths. Nothing is traced from an
 * existing artwork. Traditional wayang proportions inform the parameters —
 * the long raised nose, the narrow waist, the very long arms hinged at
 * shoulder and elbow, the sweeping headdress and the trailing cloth.
 *
 * Local coordinate system, per figure:
 *   x → forward, the way the figure faces (+1 = facing right)
 *   y → down the body, 0 at the shoulder line, 1 ≈ one body length
 *   units are fractions of the figure's overall height
 */

import { TAU, mulberry, clamp, lerp } from "./util.js";

/* ── Character recipes ───────────────────────────────────────────────── */

/**
 * `halus` figures are refined: slim, downcast, small features.
 * `gagah` figures are robust: broad, upright, bold features.
 */
export const CHARACTERS = [
  {
    id: "arjuna",
    name: "The Refined One",
    build: "halus",
    seed: 1207,
    hue: 26,
    height: 0.62, // fraction of stage height at scale 1
    torso: { width: 0.115, waist: 0.052, hip: 0.1, length: 0.3 },
    head: { size: 0.088, tilt: -0.3, nose: 1.25, chin: 0.58 },
    crown: { kind: "gelung", height: 0.13, sweep: 0.7, spikes: 5 },
    arms: { upper: 0.2, fore: 0.235, taper: 0.62 },
    legs: { stance: 0.06, length: 0.36 },
    cloth: { drop: 0.42, sway: 0.09, tails: 3 },
    jewels: { collar: true, belt: true, armlets: 2 },
  },
  {
    id: "bima",
    name: "The Strong One",
    build: "gagah",
    seed: 4471,
    hue: 18,
    height: 0.7,
    torso: { width: 0.155, waist: 0.088, hip: 0.14, length: 0.33 },
    head: { size: 0.1, tilt: 0.12, nose: 0.95, chin: 0.8 },
    crown: { kind: "mahkota", height: 0.15, sweep: 0.42, spikes: 7 },
    arms: { upper: 0.215, fore: 0.25, taper: 0.74 },
    legs: { stance: 0.1, length: 0.35 },
    cloth: { drop: 0.36, sway: 0.07, tails: 4 },
    jewels: { collar: true, belt: true, armlets: 3 },
  },
];

/* ── Path building blocks ────────────────────────────────────────────── */

/**
 * A closed cubic spline through the given points, as a Path2D.
 * Uses Catmull-Rom converted to Béziers so the outlines stay soft, the way
 * a knife-cut hide edge is soft.
 */
function splinePath(pts, closed = true, tension = 1) {
  const p = new Path2D();
  const n = pts.length;
  if (n < 2) return p;

  p.moveTo(pts[0][0], pts[0][1]);

  const at = (i) => {
    if (closed) return pts[(i + n) % n];
    return pts[clamp(i, 0, n - 1) | 0];
  };

  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = tension / 6;
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k,
      p1[1] + (p2[1] - p0[1]) * k,
      p2[0] - (p3[0] - p1[0]) * k,
      p2[1] - (p3[1] - p1[1]) * k,
      p2[0],
      p2[1],
    );
  }
  if (closed) p.closePath();
  return p;
}

/** A leaf/teardrop hole — the commonest tatahan motif. */
function leafHole(path, x, y, w, h, rot = 0) {
  const pts = [];
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    // A teardrop: wide at one end, drawn to a point at the other.
    const r = Math.pow(Math.abs(Math.cos(t / 2)), 0.7);
    const lx = Math.cos(t) * w * r;
    const ly = Math.sin(t) * h * r;
    pts.push([
      x + lx * Math.cos(rot) - ly * Math.sin(rot),
      y + lx * Math.sin(rot) + ly * Math.cos(rot),
    ]);
  }
  path.addPath(splinePath(pts));
}

function circleHole(path, x, y, r) {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, TAU);
}

/* ── Body parts ──────────────────────────────────────────────────────── */

/**
 * The torso: shoulders, a deeply cut waist, hips, and the long cloth below.
 * Drawn as a single closed silhouette in the figure's local space.
 */
function buildTorso(c) {
  const { torso: t, legs, cloth } = c;
  const f = c.build === "gagah" ? 1 : 0.92; // forward lean of the chest
  const L = t.length;

  const pts = [
    // ── front edge, top to bottom
    [t.width * 0.52 * f, -0.012], // shoulder point, front
    [t.width * 0.98 * f, L * 0.16], // chest
    [t.width * 0.74 * f, L * 0.4], // under the ribs
    [t.waist * 0.86, L * 0.6], // the waist notch
    [t.hip * 1.06, L * 0.82], // hip
    [t.hip * 0.92, L], // top of the cloth
    // ── the cloth (dodot) falling forward
    [t.hip * 1.0 + cloth.sway, L + cloth.drop * 0.42],
    [t.hip * 0.72, L + cloth.drop * 0.8],
    [t.hip * 0.3, L + cloth.drop],
    // ── back of the cloth, rising again
    [-t.hip * 0.42, L + cloth.drop * 0.92],
    [-t.hip * 0.86, L + cloth.drop * 0.5],
    [-t.hip * 0.98, L * 0.96],
    // ── back edge, bottom to top
    [-t.hip * 0.82, L * 0.78],
    [-t.waist * 1.15, L * 0.56],
    [-t.width * 0.82, L * 0.3],
    [-t.width * 0.9, L * 0.08],
    [-t.width * 0.46, -0.014],
  ];

  return { path: splinePath(pts), bottom: L + cloth.drop };
}

/** The pierced ornament inside the torso. */
function buildTorsoHoles(c) {
  const holes = new Path2D();
  const { torso: t, jewels } = c;
  const L = t.length;
  const rand = mulberry(c.seed);

  if (jewels.collar) {
    // A necklace of small round piercings across the chest.
    const n = c.build === "gagah" ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      circleHole(
        holes,
        lerp(-t.width * 0.3, t.width * 0.64, u),
        L * 0.1 + Math.sin(u * Math.PI) * L * 0.045,
        0.0055 + rand() * 0.0022,
      );
    }
  }

  // Two rows of leaves down the chest — the sumping/praba motif.
  const rows = c.build === "gagah" ? 3 : 4;
  for (let i = 0; i < rows; i++) {
    const u = (i + 0.5) / rows;
    const y = lerp(L * 0.24, L * 0.52, u);
    const w = lerp(t.width * 0.34, t.waist * 0.4, u);
    leafHole(holes, lerp(t.width * 0.2, 0, u), y, w, 0.02, -0.5);
  }

  if (jewels.belt) {
    // The belt: a run of little teeth around the hips.
    const n = 7;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      circleHole(
        holes,
        lerp(-t.waist * 0.72, t.hip * 0.72, u),
        L * 0.7 + Math.sin(u * Math.PI) * 0.012,
        0.0048,
      );
    }
  }

  // Cloth piercings — a scatter that reads as batik at a distance.
  const cn = c.cloth.tails * 4;
  for (let i = 0; i < cn; i++) {
    const u = rand();
    const v = rand();
    const y = L + c.cloth.drop * (0.18 + v * 0.66);
    const spread = lerp(t.hip * 1.0, t.hip * 0.42, v);
    leafHole(
      holes,
      lerp(-spread, spread, u) * 0.86,
      y,
      0.008 + rand() * 0.006,
      0.014 + rand() * 0.01,
      rand() * TAU,
    );
  }

  return holes;
}

/**
 * Head and headdress, as one silhouette. The traditional profile: a single
 * unbroken line from the brow, down the long nose, to the chin.
 */
function buildHead(c) {
  const { head: h, crown } = c;
  const s = h.size;
  const refined = c.build === "halus";

  const pts = [
    // ── back of the skull up into the hair knot
    [-s * 0.86, -s * 0.1],
    [-s * 0.92, -s * 0.86],
    [-s * 0.5, -s * 1.22],
    // ── the crown, sweeping forward
    [s * 0.1, -s * 1.28 - crown.height * 0.5],
    [s * 0.66, -s * 1.02 - crown.height * 0.24],
    // ── brow
    [s * 0.82, -s * 0.5],
    // ── the nose: out, then the long slope down
    [s * (1.05 + h.nose * 0.5), -s * 0.24],
    [s * (0.98 + h.nose * 0.34), s * 0.04],
    // ── lips and chin
    [s * 0.78, s * 0.14],
    [s * (0.62 + h.chin * 0.3), s * 0.3],
    [s * 0.44, s * 0.44],
    // ── jaw back to the throat
    [s * 0.02, s * (refined ? 0.5 : 0.56)],
    [-s * 0.52, s * 0.4],
    [-s * 0.8, s * 0.16],
  ];

  return splinePath(pts);
}

/** Eye, ear-ornament and crown piercings. */
function buildHeadHoles(c) {
  const holes = new Path2D();
  const { head: h, crown } = c;
  const s = h.size;
  const refined = c.build === "halus";

  // The eye — a narrow leaf for refined figures, a round one for robust.
  if (refined) {
    leafHole(holes, s * 0.56, -s * 0.22, s * 0.2, s * 0.06, 0.18);
  } else {
    circleHole(holes, s * 0.52, -s * 0.24, s * 0.115);
  }

  // Nostril and the line of the mouth.
  circleHole(holes, s * 0.92, -s * 0.03, s * 0.032);
  leafHole(holes, s * 0.66, s * 0.2, s * 0.13, s * 0.028, -0.3);

  // The sumping — the ear flower.
  leafHole(holes, -s * 0.5, -s * 0.06, s * 0.16, s * 0.07, 0.9);
  circleHole(holes, -s * 0.3, s * 0.06, s * 0.03);

  // Teeth along the crown's edge.
  for (let i = 0; i < crown.spikes; i++) {
    const u = (i + 0.5) / crown.spikes;
    const a = lerp(-2.5, -0.7, u);
    const r = s * 0.92 + crown.height * 0.22;
    circleHole(
      holes,
      Math.cos(a) * r * 0.86,
      Math.sin(a) * r - s * 0.24,
      s * 0.035,
    );
  }

  return holes;
}

/**
 * A limb segment: a tapered blade, rounded at both ends. Long and thin,
 * the way wayang arms are — they reach well past the knee.
 */
function buildLimb(length, wTop, wBottom) {
  const pts = [];
  const steps = 9;
  // one side
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = lerp(wTop, wBottom, t);
    // a slight bow, so the arm is never a dead straight line
    const bow = Math.sin(t * Math.PI) * wTop * 0.3;
    pts.push([bow + w * 0.5, t * length]);
  }
  // and back up the other
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const w = lerp(wTop, wBottom, t);
    const bow = Math.sin(t * Math.PI) * wTop * 0.3;
    pts.push([bow - w * 0.5, t * length]);
  }
  return splinePath(pts);
}

/** A hand: a small fan of fingers at the end of the forearm. */
function buildHand(size, build) {
  const pts = [];
  const fingers = 4;
  const spread = build === "gagah" ? 0.9 : 1.15;

  pts.push([-size * 0.38, 0]);
  for (let i = 0; i < fingers; i++) {
    const u = i / (fingers - 1);
    const a = lerp(-0.5, 0.5, u) * spread;
    const len = size * lerp(1.5, 1.05, Math.abs(u - 0.45) * 2);
    pts.push([Math.sin(a) * len * 0.6, Math.cos(a) * len]);
    if (i < fingers - 1) {
      const am = lerp(-0.5, 0.5, u + 0.5 / (fingers - 1)) * spread;
      pts.push([Math.sin(am) * size * 0.5, Math.cos(am) * size * 0.62]);
    }
  }
  pts.push([size * 0.42, 0]);

  return splinePath(pts);
}

/** The tuding — the slim rod the dalang holds to work an arm. */
function buildRod(length) {
  const p = new Path2D();
  const w = 0.0075;
  p.moveTo(-w, 0);
  p.lineTo(w, 0);
  p.lineTo(w * 0.42, length);
  p.lineTo(-w * 0.42, length);
  p.closePath();
  return p;
}

/** The gapit — the twin horn rods clasping the body, run down and past it. */
function buildGapit(c) {
  const p = new Path2D();
  const top = -c.head.size * 0.6;
  const bottom = c.torso.length + c.cloth.drop + 0.2;
  const w = 0.009;

  // Two rods that pinch together below the figure into a single handle.
  for (const side of [-1, 1]) {
    p.moveTo(side * w * 1.7, top);
    p.bezierCurveTo(
      side * w * 2.4,
      lerp(top, bottom, 0.4),
      side * w * 1.1,
      lerp(top, bottom, 0.72),
      side * w * 0.5,
      bottom,
    );
    p.lineTo(side * -w * 0.1, bottom);
    p.bezierCurveTo(
      side * w * 0.5,
      lerp(top, bottom, 0.72),
      side * w * 1.5,
      lerp(top, bottom, 0.4),
      side * w * 0.5,
      top,
    );
    p.closePath();
  }
  return p;
}

/* ── Assembly ────────────────────────────────────────────────────────── */

/**
 * Bake one character into a set of Path2D objects plus the joint offsets the
 * rig needs. All of this is scale-independent, so it is built once and then
 * drawn under whatever transform the rig supplies.
 */
export function buildPuppet(recipe) {
  const c = recipe;
  const torso = buildTorso(c);
  const armW = c.torso.width * 0.3;

  const torsoHoles = buildTorsoHoles(c);
  const head = buildHead(c);
  const headHoles = buildHeadHoles(c);

  /**
   * A pierced part is the solid outline and its holes in one path, filled
   * with the even-odd rule. Doing it this way — rather than erasing the
   * holes with `destination-out` — means the piercings genuinely let the
   * lamplight (or an arm behind the body) show through, instead of punching
   * a hole clean through the lit cloth as well.
   */
  const pierce = (solid, holes) => {
    const p = new Path2D();
    p.addPath(solid);
    p.addPath(holes);
    return p;
  };

  return {
    recipe: c,
    id: c.id,
    name: c.name,

    torso: torso.path,
    torsoPierced: pierce(torso.path, torsoHoles),
    bottom: torso.bottom,

    head,
    headPierced: pierce(head, headHoles),

    upperArm: buildLimb(c.arms.upper, armW, armW * c.arms.taper),
    foreArm: buildLimb(c.arms.fore, armW * c.arms.taper, armW * 0.42),
    hand: buildHand(c.torso.width * 0.3, c.build),

    rod: buildRod(0.5),
    gapit: buildGapit(c),

    joints: {
      // Where the neck meets the body, in torso-local units.
      neck: { x: c.torso.width * 0.06, y: -c.head.size * 0.42 },
      // Shoulders: the near arm sits a touch forward of the far one.
      shoulderNear: { x: c.torso.width * 0.3, y: c.torso.length * 0.05 },
      shoulderFar: { x: -c.torso.width * 0.12, y: c.torso.length * 0.03 },
      // Where the body rod is gripped, below the cloth.
      grip: { x: 0, y: torso.bottom + 0.14 },
    },
  };
}

/** Build the whole cast once. */
export function buildCast() {
  return CHARACTERS.map(buildPuppet);
}
