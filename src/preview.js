/**
 * Camera preview.
 *
 * Draws the mirrored video feed small, with the tracked skeleton over it, so
 * you can see what the model is actually latching onto. Optionally the same
 * view is mirrored into a popped-out window, which is handy on a second
 * screen while performing.
 */

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],            // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],            // index
  [5, 9], [9, 10], [10, 11], [11, 12],       // middle
  [9, 13], [13, 14], [14, 15], [15, 16],     // ring
  [13, 17], [17, 18], [18, 19], [19, 20],    // pinky
  [0, 17],                                    // the palm's closing edge
];

const SIDE_COLOR = { left: "#e8b43c", right: "#7fc4d8" };

export class Preview {
  constructor(box, canvas, video) {
    this.box = box;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.video = video;
    this.visible = false;
    this.popout = null;
    this.popCtx = null;
  }

  setVisible(v) {
    this.visible = v;
    this.box.hidden = !v;
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /* ── the pop-out window ────────────────────────────────────────────── */

  openPopout() {
    if (this.popout && !this.popout.closed) {
      this.popout.focus();
      return true;
    }
    const win = window.open(
      "",
      "wayang-camera",
      "width=440,height=270,menubar=no,toolbar=no,location=no,status=no",
    );
    if (!win) return false;

    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8">` +
        `<title>Camera — Wayang Kulit</title><style>` +
        `html,body{margin:0;height:100%;background:#070503;overflow:hidden;` +
        `display:grid;place-items:center;font:12px system-ui;color:#8a7860}` +
        `canvas{width:100%;height:auto;display:block}` +
        `</style></head><body><canvas id="c" width="480" height="270"></canvas></body></html>`,
    );
    win.document.close();

    this.popout = win;
    const c = win.document.getElementById("c");
    this.popCtx = c.getContext("2d");
    win.addEventListener("beforeunload", () => {
      this.popout = null;
      this.popCtx = null;
    });
    return true;
  }

  closePopout() {
    this.popout?.close();
    this.popout = null;
    this.popCtx = null;
  }

  get popoutOpen() {
    return !!(this.popout && !this.popout.closed);
  }

  /* ── drawing ───────────────────────────────────────────────────────── */

  draw(landmarks, tracker) {
    const targets = [];
    if (this.visible) targets.push(this.ctx);
    if (this.popoutOpen && this.popCtx) targets.push(this.popCtx);
    if (!targets.length) return;

    const v = this.video;
    const hasVideo =
      tracker.mode === "camera" && v && v.readyState >= 2 && v.videoWidth > 0;

    for (const ctx of targets) {
      const { width: W, height: H } = ctx.canvas;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#070503";
      ctx.fillRect(0, 0, W, H);

      if (hasVideo) {
        // Cover-fit the feed, mirrored so it reads like a mirror.
        const vr = v.videoWidth / v.videoHeight;
        const cr = W / H;
        let dw = W;
        let dh = H;
        if (vr > cr) dw = H * vr;
        else dh = W / vr;

        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = "#4a3e30";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          tracker.mode === "mouse" ? "Mouse mode" : "No camera",
          W / 2,
          H / 2,
        );
        ctx.textAlign = "left";
      }

      // The skeleton, drawn in the same mirrored space as the video.
      for (const side of ["left", "right"]) {
        const lm = landmarks?.[side];
        if (!lm) continue;
        const color = SIDE_COLOR[side];
        const px = (p) => (1 - p.x) * W;
        const py = (p) => p.y * H;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (const [a, b] of BONES) {
          ctx.moveTo(px(lm[a]), py(lm[a]));
          ctx.lineTo(px(lm[b]), py(lm[b]));
        }
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        for (let i = 0; i < lm.length; i++) {
          const r = i === 0 || i === 4 || i === 8 || i === 20 ? 2.6 : 1.5;
          ctx.beginPath();
          ctx.arc(px(lm[i]), py(lm[i]), r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Label which hand this is.
        ctx.globalAlpha = 0.75;
        ctx.font = "600 9px system-ui, sans-serif";
        ctx.fillText(side === "left" ? "L" : "R", px(lm[0]) + 6, py(lm[0]) + 12);
      }

      // A small readout of the tracker's own frame rate.
      if (tracker.mode === "camera" && tracker.fps) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#8a7860";
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillText(`${tracker.fps} fps`, 6, H - 6);
      }
      ctx.globalAlpha = 1;
    }
  }
}
