/**
 * Hand tracking.
 *
 * Wraps MediaPipe Tasks Vision so the rest of the app never sees a raw
 * landmark array. Each frame we emit, per hand, a small set of already
 * smoothed, already normalised signals:
 *
 *   pos      palm centre in 0..1 screen space (mirrored, so it feels like a
 *            mirror rather than a camera)
 *   roll     wrist tilt in radians
 *   depth    0 = at the calibrated resting distance, 1 = right at the lens
 *   rodA/B   the two arm-rod fingers, as angle + extension
 *   pinky    1 when only the little finger is up (the kiprahan cue)
 *   span     how open the whole hand is
 *
 * Nothing leaves the device; the video element is never rendered to the DOM
 * except in the optional preview.
 */

import {
  Damped,
  Median,
  TAU,
  clamp,
  dist,
  dist3,
  remap,
  smoothstep,
} from "./util.js";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/* Landmark indices, per the MediaPipe hand topology. */
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;

/** Which landmark plays which arm rod, for each setting. */
const ROD_SETS = {
  "thumb-index": [THUMB_TIP, INDEX_TIP],
  "thumb-pinky": [THUMB_TIP, PINKY_TIP],
  "index-pinky": [INDEX_TIP, PINKY_TIP],
};

/* ── One tracked hand ────────────────────────────────────────────────── */

class Hand {
  constructor(side) {
    this.side = side; // "left" | "right", as the user perceives it
    this.seen = false;
    this.confidence = 0;
    this.lostFor = 999;

    this.pos = { x: side === "left" ? 0.32 : 0.68, y: 0.55 };
    this.vel = { x: 0, y: 0 };

    this._x = new Damped(this.pos.x, 17, 0.0012);
    this._y = new Damped(this.pos.y, 17, 0.0012);
    this._roll = new Damped(0, 12);
    this._depth = new Damped(0, 8);
    this._span = new Damped(0.5, 11);
    this._pinky = new Damped(0, 6);

    this.roll = 0;
    this.depth = 0;
    this.span = 0.5;
    this.pinky = 0;

    this.rods = [
      { angle: -0.5, extend: 0.6, _a: new Damped(-0.5, 13), _e: new Damped(0.6, 13) },
      { angle: 0.5, extend: 0.6, _a: new Damped(0.5, 13), _e: new Damped(0.6, 13) },
    ];

    /* Depth needs a per-hand baseline: everyone sits a different distance
       from their webcam, and every webcam has a different field of view. */
    this._scaleMedian = new Median(9);
    this._restScale = null;
    this._calibrating = 0;
  }

  /** Forget the depth baseline and take a fresh reading. */
  recalibrate() {
    this._restScale = null;
    this._calibrating = 0;
    this._scaleMedian = new Median(9);
  }

  markLost(dt) {
    this.lostFor += dt;
    this.confidence = Math.max(0, this.confidence - dt * 2.4);
    if (this.lostFor > 0.35) this.seen = false;
    // Let the hand drift to a halt rather than freezing mid-gesture.
    this.vel.x *= Math.exp(-dt * 3);
    this.vel.y *= Math.exp(-dt * 3);
  }

  update(lm, dt, rodSet, mirrored) {
    this.seen = true;
    this.lostFor = 0;
    this.confidence = Math.min(1, this.confidence + dt * 5);

    const mx = (p) => (mirrored ? 1 - p.x : p.x);

    /* ── palm centre: the mean of wrist and the four knuckles, which is far
       steadier than the wrist on its own ── */
    const anchors = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
    let cx = 0;
    let cy = 0;
    for (const i of anchors) {
      cx += mx(lm[i]);
      cy += lm[i].y;
    }
    cx /= anchors.length;
    cy /= anchors.length;

    const px = this.pos.x;
    const py = this.pos.y;
    this.pos.x = this._x.step(cx, dt);
    this.pos.y = this._y.step(cy, dt);
    if (dt > 0) {
      // Velocity, itself smoothed — used for walk-facing and cloth drag.
      this.vel.x += ((this.pos.x - px) / dt - this.vel.x) * Math.min(1, dt * 9);
      this.vel.y += ((this.pos.y - py) / dt - this.vel.y) * Math.min(1, dt * 9);
    }

    /* ── roll: the axis from the wrist to the middle knuckle ── */
    const axX = mx(lm[MIDDLE_MCP]) - mx(lm[WRIST]);
    const axY = lm[MIDDLE_MCP].y - lm[WRIST].y;
    // atan2 measured off "straight up", so an upright hand reads zero.
    const rawRoll = Math.atan2(axX, -axY);
    this.roll = this._roll.step(clamp(rawRoll, -1.3, 1.3), dt);

    /* ── depth from apparent hand size ── */
    const palmSpan = dist3(lm[WRIST], lm[MIDDLE_MCP]) +
      dist3(lm[INDEX_MCP], lm[PINKY_MCP]);
    const scale = this._scaleMedian.push(palmSpan);

    if (this._restScale === null) {
      this._calibrating += dt;
      // Give the median a moment to settle before trusting it.
      if (this._calibrating > 0.45) this._restScale = scale;
    } else {
      // Drift the baseline very slowly, so a slouch doesn't break the range.
      this._restScale += (scale - this._restScale) * dt * 0.012;
    }

    const base = this._restScale ?? scale;
    const rawDepth = clamp(remap(scale / base, 1.0, 1.85, 0, 1));
    this.depth = this._depth.step(rawDepth, dt);

    /* ── finger extension, measured against palm size so it is
       distance-invariant ── */
    const palm = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-4;
    const ext = (tip, mcp) => clamp(dist(lm[tip], lm[mcp]) / palm / 0.95);

    const eIndex = ext(INDEX_TIP, INDEX_MCP);
    const eMiddle = ext(MIDDLE_TIP, MIDDLE_MCP);
    const eRing = ext(RING_TIP, RING_MCP);
    const ePinky = ext(PINKY_TIP, PINKY_MCP);
    const eThumb = clamp(dist(lm[THUMB_TIP], lm[INDEX_MCP]) / palm / 0.8);

    this.span = this._span.step(
      (eThumb + eIndex + eMiddle + eRing + ePinky) / 5,
      dt,
    );

    /* ── the pinky cue: little finger out, everything else folded ── */
    const others = Math.max(eIndex, eMiddle, eRing);
    const rawPinky =
      smoothstep(0.52, 0.8, ePinky) * (1 - smoothstep(0.3, 0.58, others));
    this.pinky = this._pinky.step(rawPinky, dt);

    /* ── the two arm rods ── */
    const [aIdx, bIdx] = ROD_SETS[rodSet] ?? ROD_SETS["thumb-index"];
    const rodInfo = [aIdx, bIdx];
    for (let i = 0; i < 2; i++) {
      const tip = lm[rodInfo[i]];
      const rod = this.rods[i];

      const dx = mx(tip) - cx;
      const dy = tip.y - cy;
      // Angle relative to the hand's own roll, so tilting the wrist doesn't
      // also swing the arms.
      const raw = Math.atan2(dx, -dy) - this.roll;
      const wrapped = Math.atan2(Math.sin(raw), Math.cos(raw));

      rod.angle = rod._a.step(clamp(wrapped, -2.2, 2.2), dt);
      const reach = clamp(Math.hypot(dx, dy) / (palm * 1.5));
      rod.extend = rod._e.step(reach, dt);
    }
  }
}

/* ── The tracker ─────────────────────────────────────────────────────── */

export class HandTracker {
  constructor() {
    this.mode = "idle"; // idle | camera | mouse
    this.mirrored = true;
    this.rodSet = "thumb-index";
    this.hands = { left: new Hand("left"), right: new Hand("right") };

    this.video = null;
    this.stream = null;
    this.landmarker = null;
    this._lastVideoTime = -1;
    this._raw = { left: null, right: null };
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;

    /* Mouse fallback state. */
    this._mouse = { x: 0.5, y: 0.5, down: false, spread: 0.55 };
  }

  get active() {
    return this.mode !== "idle";
  }

  /** Landmarks for the preview overlay; null when not tracking. */
  get rawLandmarks() {
    return this._raw;
  }

  /* ── camera ────────────────────────────────────────────────────────── */

  async startCamera(videoEl, onProgress = () => {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error("no-getusermedia"), { kind: "unsupported" });
    }
    if (!window.isSecureContext) {
      throw Object.assign(new Error("insecure"), { kind: "insecure" });
    }

    this.video = videoEl;

    onProgress("Asking for the camera…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: "user",
        },
        audio: false,
      });
    } catch (err) {
      const kind =
        err.name === "NotAllowedError" || err.name === "SecurityError"
          ? "denied"
          : err.name === "NotFoundError" || err.name === "OverconstrainedError"
            ? "nocam"
            : "camfail";
      throw Object.assign(new Error(err.name || "camfail"), { kind, cause: err });
    }

    this.stream = stream;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    // Wait for real dimensions before the first detect call.
    if (!videoEl.videoWidth) {
      await new Promise((res) => {
        videoEl.addEventListener("loadeddata", res, { once: true });
        setTimeout(res, 2500);
      });
    }

    onProgress("Loading the hand model…");
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
      this.landmarker = await vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err) {
      this.stop();
      throw Object.assign(new Error("model"), { kind: "model", cause: err });
    }

    this.mode = "camera";
    onProgress("");
    return true;
  }

  useMouse() {
    this.mode = "mouse";
    this._bindMouse();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.landmarker?.close?.();
    this.landmarker = null;
    this.mode = "idle";
  }

  recalibrate() {
    this.hands.left.recalibrate();
    this.hands.right.recalibrate();
  }

  /* ── per-frame ─────────────────────────────────────────────────────── */

  update(dt, nowMs) {
    if (this.mode === "camera") this._updateCamera(dt, nowMs);
    else if (this.mode === "mouse") this._updateMouse(dt);
    return this.hands;
  }

  _updateCamera(dt, nowMs) {
    const v = this.video;
    const ready = v && v.readyState >= 2 && v.videoWidth > 0;

    if (ready && this.landmarker && v.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = v.currentTime;
      let result = null;
      try {
        result = this.landmarker.detectForVideo(v, nowMs);
      } catch {
        /* A dropped frame is not worth breaking the loop over. */
      }

      this._raw = { left: null, right: null };

      if (result?.landmarks?.length) {
        /* MediaPipe labels handedness from the camera's point of view. Since
           we mirror the image, its "Left" is the user's right hand. */
        for (let i = 0; i < result.landmarks.length; i++) {
          const label = result.handednesses?.[i]?.[0]?.categoryName ?? "Right";
          const side = this.mirrored
            ? label === "Left"
              ? "right"
              : "left"
            : label === "Left"
              ? "left"
              : "right";
          const lm = result.landmarks[i];
          // If both detections land on the same side, keep the first.
          if (this._raw[side]) continue;
          this._raw[side] = lm;
        }
      }

      for (const side of ["left", "right"]) {
        const lm = this._raw[side];
        if (lm) this.hands[side].update(lm, dt, this.rodSet, this.mirrored);
      }

      this._fpsFrames++;
      this._fpsAcc += dt;
      if (this._fpsAcc > 0.5) {
        this.fps = Math.round(this._fpsFrames / this._fpsAcc);
        this._fpsFrames = 0;
        this._fpsAcc = 0;
      }
    }

    for (const side of ["left", "right"]) {
      if (!this._raw[side]) this.hands[side].markLost(dt);
    }
  }

  /* ── mouse fallback ────────────────────────────────────────────────── */

  _bindMouse() {
    if (this._mouseBound) return;
    this._mouseBound = true;

    const move = (e) => {
      const p = e.touches?.[0] ?? e;
      this._mouse.x = p.clientX / window.innerWidth;
      this._mouse.y = p.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("pointerdown", (e) => {
      this._mouse.down = true;
      move(e);
    });
    window.addEventListener("pointerup", () => {
      this._mouse.down = false;
    });
    window.addEventListener(
      "wheel",
      (e) => {
        this._mouse.spread = clamp(this._mouse.spread - e.deltaY * 0.0012, 0, 1);
      },
      { passive: true },
    );
  }

  _updateMouse(dt) {
    const t = performance.now() / 1000;

    /* The pointer drives the right-hand figure. The left-hand figure keeps
       its own gentle idle, so the stage never looks half-empty. */
    const R = this.hands.right;
    R.seen = true;
    R.lostFor = 0;
    R.confidence = Math.min(1, R.confidence + dt * 5);
    const px = R.pos.x;
    const py = R.pos.y;
    R.pos.x = R._x.step(this._mouse.x, dt, 10);
    R.pos.y = R._y.step(this._mouse.y, dt, 10);
    if (dt > 0) {
      R.vel.x += ((R.pos.x - px) / dt - R.vel.x) * Math.min(1, dt * 9);
      R.vel.y += ((R.pos.y - py) / dt - R.vel.y) * Math.min(1, dt * 9);
    }
    R.roll = R._roll.step(clamp(R.vel.x * 0.5, -0.7, 0.7), dt);
    R.depth = R._depth.step(this._mouse.down ? 0.72 : 0.06, dt);
    R.span = R._span.step(this._mouse.spread, dt);
    R.pinky = R._pinky.step(0, dt);
    const open = 0.25 + this._mouse.spread * 1.15;
    R.rods[0].angle = R.rods[0]._a.step(-open, dt);
    R.rods[1].angle = R.rods[1]._a.step(open * 0.85, dt);
    R.rods[0].extend = R.rods[0]._e.step(0.45 + this._mouse.spread * 0.5, dt);
    R.rods[1].extend = R.rods[1]._e.step(0.42 + this._mouse.spread * 0.5, dt);

    const L = this.hands.left;
    L.seen = true;
    L.lostFor = 0;
    L.confidence = Math.min(1, L.confidence + dt * 3);
    L.pos.x = L._x.step(0.3 + Math.sin(t * 0.37) * 0.045, dt, 4);
    L.pos.y = L._y.step(0.55 + Math.sin(t * 0.52 + 1.3) * 0.035, dt, 4);
    L.roll = L._roll.step(Math.sin(t * 0.44) * 0.16, dt);
    L.depth = L._depth.step(0.1 + Math.sin(t * 0.3) * 0.08, dt);
    L.span = L._span.step(0.5, dt);
    L.pinky = L._pinky.step(0, dt);
    L.rods[0].angle = L.rods[0]._a.step(-0.7 + Math.sin(t * 0.7) * 0.32, dt);
    L.rods[1].angle = L.rods[1]._a.step(0.62 + Math.sin(t * 0.9 + 2) * 0.3, dt);
    L.rods[0].extend = L.rods[0]._e.step(0.55 + Math.sin(t * 0.8) * 0.16, dt);
    L.rods[1].extend = L.rods[1]._e.step(0.55 + Math.sin(t * 1.1) * 0.16, dt);
  }
}

/** Human-readable text for each failure mode. */
export const TRACKER_ERRORS = {
  denied: {
    title: "The camera is blocked",
    body:
      "Your browser refused the camera for this page. Open the padlock in the address bar, allow camera access, then reload. You can also carry on with the mouse.",
  },
  nocam: {
    title: "No camera found",
    body: "Nothing is reporting itself as a webcam. Plug one in and reload, or use the mouse instead.",
  },
  insecure: {
    title: "Needs a secure connection",
    body: "Browsers only hand over the camera over HTTPS or on localhost.",
  },
  unsupported: {
    title: "This browser can't share a camera",
    body: "Try a current Chrome, Edge, Firefox or Safari — or use the mouse.",
  },
  model: {
    title: "The hand model didn't load",
    body: "The tracking model is fetched from a CDN on first run. Check your connection and reload, or use the mouse.",
  },
  camfail: {
    title: "The camera wouldn't open",
    body: "Something else may already be using it. Close other apps or tabs that use the webcam, then reload.",
  },
};
