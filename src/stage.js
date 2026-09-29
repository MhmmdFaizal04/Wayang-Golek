/**
 * The stage.
 *
 * Draws what an audience sitting on the shadow side of the screen sees: a
 * stretched cotton cloth (the kelir), lit from behind by a single hanging
 * oil lamp (the blencong), with the figures pressed against it.
 *
 * The compositing trick is the whole illusion:
 *   1  a warm radial pool of lamplight on the cloth
 *   2  the figures drawn in near-black, offset away from the lamp
 *   3  a blur that grows with how far the figure is held off the cloth
 *   4  a faint hot rim where light leaks round the edge of the hide
 *   5  a woven texture and a vignette over everything
 */

import { TAU, clamp, lerp, smoothstep, wobble } from "./util.js";

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;

    /* The lamp hangs high and a little off-centre, as it does on a real
       stage — the dalang sits below it. */
    this.lamp = { x: 0.5, y: 0.1, flicker: 0, glow: 0.7 };

    this.texture = null;
    this.showTatahan = true;

    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.texture = null; // rebuilt lazily at the new size
  }

  /* ── the woven cloth texture, baked once ───────────────────────────── */

  _buildTexture() {
    const tile = 220;
    const c = document.createElement("canvas");
    c.width = tile;
    c.height = tile;
    const g = c.getContext("2d");

    const img = g.createImageData(tile, tile);
    const d = img.data;
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        const i = (y * tile + x) * 4;
        // A plain weave: alternating warp and weft, plus grain.
        const warp = Math.sin(x * 1.9) * 3.2;
        const weft = Math.sin(y * 2.1) * 3.2;
        const slub = (Math.random() - 0.5) * 11;
        const v = 128 + warp + weft + slub;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 26;
      }
    }
    g.putImageData(img, 0, 0);
    this.texture = this.ctx.createPattern(c, "repeat");
  }

  /* ── the background: lit cloth ─────────────────────────────────────── */

  drawBackground(t) {
    const { ctx, w, h } = this;
    const L = this.lamp;

    /* A lamp flame is never steady. Two slow terms plus one fast one. */
    L.flicker =
      wobble(t * 1.7, 11) * 0.5 + Math.sin(t * 13.7) * 0.12 + Math.sin(t * 31) * 0.05;
    const flick = 1 + L.flicker * 0.055;
    const glow = this.lamp.glow;

    const lx = L.x * w;
    const ly = L.y * h;

    // Base: the cloth in near-darkness.
    ctx.fillStyle = "#0b0605";
    ctx.fillRect(0, 0, w, h);

    // The pool of lamplight. Its radius is generous so the falloff is gentle
    // across the middle of the screen where the figures play.
    const R = Math.hypot(w, h) * 0.98 * flick;
    const pool = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
    const a = glow * flick;
    pool.addColorStop(0.0, `rgba(255, 228, 168, ${0.92 * a})`);
    pool.addColorStop(0.06, `rgba(252, 208, 134, ${0.78 * a})`);
    pool.addColorStop(0.18, `rgba(228, 166, 90, ${0.5 * a})`);
    pool.addColorStop(0.38, `rgba(176, 112, 52, ${0.26 * a})`);
    pool.addColorStop(0.62, `rgba(112, 64, 30, ${0.11 * a})`);
    pool.addColorStop(1.0, "rgba(40, 20, 10, 0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);

    // A second, tighter core so the lamp itself reads as a bright point.
    const core = ctx.createRadialGradient(lx, ly, 0, lx, ly, h * 0.16 * flick);
    core.addColorStop(0, `rgba(255, 244, 214, ${0.5 * a})`);
    core.addColorStop(1, "rgba(255, 220, 160, 0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);

    // The weave.
    if (!this.texture) this._buildTexture();
    if (this.texture) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = this.texture;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  /* ── the foreground: vignette, and the frame of the screen ─────────── */

  drawForeground() {
    const { ctx, w, h } = this;

    // Vignette — the cloth is only lit in the middle.
    const vg = ctx.createRadialGradient(
      w * 0.5,
      h * 0.46,
      Math.min(w, h) * 0.26,
      w * 0.5,
      h * 0.5,
      Math.hypot(w, h) * 0.66,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.62, "rgba(0,0,0,0.3)");
    vg.addColorStop(1, "rgba(6,3,2,0.86)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    /* The gedebog — the banana-log trunk along the bottom that the rods are
       stuck into. It reads as a soft dark band. */
    const bandH = h * 0.1;
    const band = ctx.createLinearGradient(0, h - bandH, 0, h);
    band.addColorStop(0, "rgba(10,5,3,0)");
    band.addColorStop(0.45, "rgba(10,5,3,0.55)");
    band.addColorStop(1, "rgba(6,3,2,0.95)");
    ctx.fillStyle = band;
    ctx.fillRect(0, h - bandH, w, bandH);
  }

  /* ── one figure ────────────────────────────────────────────────────── */

  /**
   * Draw a solved rig as a shadow on the cloth.
   * @param s the object returned by Rig#solve
   */
  drawFigure(s, t) {
    if (s.presence < 0.01) return;

    const { ctx, w, h } = this;
    const p = s.puppet;
    const { unit, cx, cy, dir, squash, lean, lift, presence } = s;

    /* Light travels from the lamp, so the shadow is thrown along the vector
       from lamp to figure, and it grows with the gap between hide and cloth. */
    const lx = this.lamp.x * w;
    const ly = this.lamp.y * h;
    const vx = cx - lx;
    const vy = cy - ly;
    const vlen = Math.hypot(vx, vy) || 1;
    const throwDist = lift * unit * 0.2;
    const offX = (vx / vlen) * throwDist;
    const offY = (vy / vlen) * throwDist;

    /* Held against the cloth the edge is razor-sharp; lifted away it softens
       fast, and the whole figure grows. */
    const blur = lift * unit * 0.055;
    const spread = lerp(1, 1.14, lift);

    ctx.save();
    ctx.globalAlpha = presence;

    /* ── the cast shadow, soft and offset ── */
    ctx.save();
    ctx.translate(cx + offX, cy + offY);
    ctx.scale(dir * squash * spread, spread);
    ctx.rotate(lean);
    if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.globalAlpha = presence * lerp(0.9, 0.42, lift);
    this._paintBody(s, unit, "#070403", t, true);
    ctx.restore();

    /* ── the hide itself, crisp, sitting on the cloth ── */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(dir * squash, 1);
    ctx.rotate(lean);
    ctx.globalAlpha = presence * lerp(0.97, 0.78, lift);
    this._paintBody(s, unit, "#0a0605", t, false);
    ctx.restore();

    ctx.restore();
  }

  /**
   * Paint the figure's parts in the current transform.
   * Called twice per figure: once blurred for the cast shadow, once sharp.
   */
  _paintBody(s, unit, ink, t, isShadow) {
    const { ctx } = this;
    const p = s.puppet;
    const j = p.joints;

    ctx.save();
    ctx.scale(unit, unit);
    ctx.fillStyle = ink;

    /* ── the body rod, behind everything ── */
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.72;
    ctx.fill(p.gapit);
    ctx.restore();

    /* ── the far arm goes behind the torso ── */
    this._paintArm(p, s.arms[1], j.shoulderFar, unit, false);

    /* ── torso, with its piercings ── */
    this._paintPierced(p.torso, p.torsoPierced, unit, isShadow);

    /* ── head, hinged at the neck, nodding slightly with the lean ── */
    ctx.save();
    ctx.translate(j.neck.x, j.neck.y);
    const nod = p.recipe.head.tilt + s.lean * -0.18 + s.danceAmt * 0.1;
    ctx.rotate(nod * 0.35);
    this._paintPierced(p.head, p.headPierced, unit, isShadow);
    ctx.restore();

    /* ── the near arm, in front ── */
    this._paintArm(p, s.arms[0], j.shoulderNear, unit, true);

    ctx.restore();
  }

  /**
   * Fill a pierced silhouette.
   *
   * `pierced` holds the outline and its holes in one path, so the even-odd
   * rule leaves the piercings genuinely open — light passes through them
   * rather than the hole being cut out of the lit cloth behind.
   *
   * Below a certain on-screen size the piercings turn to mush, so we fall
   * back to the plain outline; same for the blurred shadow pass, where the
   * detail would never survive the blur anyway.
   */
  _paintPierced(solid, pierced, unit, isShadow) {
    const { ctx } = this;
    if (!this.showTatahan || isShadow || unit < 190) {
      ctx.fill(solid);
      return;
    }
    ctx.fill(pierced, "evenodd");
  }

  /** An arm: upper from the shoulder, forearm from the elbow, then the hand. */
  _paintArm(p, arm, shoulder, unit, isNear) {
    const { ctx } = this;
    const r = p.recipe;

    ctx.save();
    ctx.translate(shoulder.x, shoulder.y);
    // A wayang arm hangs from the shoulder; angle 0 is straight down.
    ctx.rotate(arm.shoulder);

    if (!isNear) ctx.globalAlpha = ctx.globalAlpha * 0.86;

    ctx.fill(p.upperArm);

    // The tuding rod runs to the hand from below, roughly vertical.
    ctx.save();
    ctx.translate(0, r.arms.upper);
    ctx.rotate(arm.elbow);
    ctx.fill(p.foreArm);

    ctx.save();
    ctx.translate(0, r.arms.fore);
    ctx.fill(p.hand);
    // The rod the dalang actually holds, trailing off below the figure.
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.5;
    ctx.rotate(-arm.shoulder - arm.elbow + 0.12);
    ctx.fill(p.rod);
    ctx.restore();
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  /* ── the lamp, drawn last so it sits over the figures ──────────────── */

  drawLamp(t) {
    const { ctx, w, h } = this;
    const L = this.lamp;
    const lx = L.x * w;
    const ly = L.y * h;
    const flick = 1 + L.flicker * 0.09;
    const a = this.lamp.glow;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const r = h * 0.055 * flick;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, `rgba(255,248,226,${0.6 * a})`);
    g.addColorStop(0.35, `rgba(255,214,132,${0.26 * a})`);
    g.addColorStop(1, "rgba(255,190,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Begin a frame. */
  begin() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
