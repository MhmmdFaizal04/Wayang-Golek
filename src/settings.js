/**
 * Settings: read the controls, persist to localStorage, notify on change.
 */

const KEY = "wayang.settings.v1";

export const DEFAULTS = {
  characters: "two",
  fingers: "thumb-index",
  bodyHand: "right",
  facing: "target",
  camera: true,
  tatahan: true,
  size: 0.54,
  lamp: 0.7,
  volume: 0.6,
  muted: false,
};

export class Settings {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.values = { ...DEFAULTS, ...this._load() };

    this.els = {
      characters: document.getElementById("opt-characters"),
      fingers: document.getElementById("opt-fingers"),
      bodyHand: document.getElementById("opt-bodyhand"),
      facing: document.getElementById("opt-facing"),
      camera: document.getElementById("opt-camera"),
      tatahan: document.getElementById("opt-tatahan"),
      size: document.getElementById("opt-size"),
      lamp: document.getElementById("opt-lamp"),
      volume: document.getElementById("opt-volume"),
    };
    this.outs = {
      size: document.getElementById("out-size"),
      lamp: document.getElementById("out-lamp"),
      volume: document.getElementById("out-volume"),
    };
    this.bodyHandRow = document.getElementById("bodyhand-row");

    this._paint();
    this._bind();
  }

  get(k) {
    return this.values[k];
  }

  set(k, v, silent = false) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    this._save();
    this._paint();
    if (!silent) this.onChange(k, v, this.values);
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) ?? {};
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* private browsing — settings simply won't persist */
    }
  }

  /** Push current values into the DOM. */
  _paint() {
    const v = this.values;
    const e = this.els;
    if (e.characters) e.characters.value = v.characters;
    if (e.fingers) e.fingers.value = v.fingers;
    if (e.bodyHand) e.bodyHand.value = v.bodyHand;
    if (e.facing) e.facing.value = v.facing;
    if (e.camera) e.camera.checked = v.camera;
    if (e.tatahan) e.tatahan.checked = v.tatahan;
    if (e.size) e.size.value = v.size;
    if (e.lamp) e.lamp.value = v.lamp;
    if (e.volume) e.volume.value = v.volume;

    const pct = (n) => `${Math.round(n * 100)}%`;
    if (this.outs.size) this.outs.size.textContent = pct(v.size);
    if (this.outs.lamp) this.outs.lamp.textContent = pct(v.lamp);
    if (this.outs.volume) this.outs.volume.textContent = pct(v.volume);

    // The "which hand holds the body rod" choice only matters with one figure.
    if (this.bodyHandRow) this.bodyHandRow.hidden = v.characters !== "one";
  }

  _bind() {
    const bindSelect = (key) =>
      this.els[key]?.addEventListener("change", (e) =>
        this.set(key, e.target.value),
      );
    bindSelect("characters");
    bindSelect("fingers");
    bindSelect("bodyHand");
    bindSelect("facing");

    const bindCheck = (key) =>
      this.els[key]?.addEventListener("change", (e) =>
        this.set(key, e.target.checked),
      );
    bindCheck("camera");
    bindCheck("tatahan");

    const bindRange = (key) =>
      this.els[key]?.addEventListener("input", (e) =>
        this.set(key, parseFloat(e.target.value)),
      );
    bindRange("size");
    bindRange("lamp");
    bindRange("volume");
  }

  reset() {
    this.values = { ...DEFAULTS };
    this._save();
    this._paint();
    for (const k of Object.keys(DEFAULTS)) {
      this.onChange(k, this.values[k], this.values);
    }
  }
}
