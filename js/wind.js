// wind.js  --  the storm wind as moving streaks, the way Windy draws it.
// A few thousand particles ride a wind field made of one Rankine vortex per active storm
// (tangential speed rising linearly to the radius of maximum wind, then decaying outward), spun
// counter-clockwise as in the northern hemisphere with a small inflow so the streaks spiral.
// The vortex follows the IBTrACS track and takes the recorded maximum wind. Away from any storm the
// field is a faint drift so the Bay does not look frozen. This is a reading aid built on two numbers
// per fix (position, wind), not a reanalysis, and the page says so.
import * as THREE from "three";
import { toScene, GRID } from "./terrain.js";

const BOX = { W: 84.5, E: 95.5, S: 15.5, N: 27.3 };
const KMLAT = 111.32, KMLON = 111.32 * Math.cos(22 * Math.PI / 180);
const rnd = () => Math.random();

export class WindField {
  constructor(count, sampleH, exag) {
    this.n = count; this.sampleH = sampleH; this.exag = exag; this.K = 6;
    this.lon = new Float32Array(count); this.lat = new Float32Array(count); this.age = new Float32Array(count); this.life = new Float32Array(count);
    this.hist = new Float32Array(count * this.K * 2); this.head = 0;   // ring buffer of the last K positions, for the streak
    for (let i = 0; i < count; i++) this.spawn(i, true);
    const pos = new Float32Array(count * (this.K - 1) * 6), col = new Float32Array(count * (this.K - 1) * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); this.geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.LineSegments(this.geo, this.mat); this.mesh.name = "wind"; this.mesh.frustumCulled = false;
    this.vortices = [];          // { lon, lat, kt }
    this.drift = [0.011, 0.007];   // deg per frame, a faint south-westerly so the field is never still
  }
  spawn(i, anywhere = false) {
    // new particles appear everywhere, but more of them near an active storm so the eye lands there
    let lon, lat;
    if (!anywhere && this.vortices.length && rnd() < 0.55) {
      const v = this.vortices[Math.floor(rnd() * this.vortices.length)]; const r = 0.3 + rnd() * rnd() * 4.5, a = rnd() * Math.PI * 2;
      lon = v.lon + Math.cos(a) * r; lat = v.lat + Math.sin(a) * r * 0.8;
    } else { lon = BOX.W + rnd() * (BOX.E - BOX.W); lat = BOX.S + rnd() * (BOX.N - BOX.S); }
    this.lon[i] = lon; this.lat[i] = lat; this.age[i] = 0; this.life[i] = 30 + rnd() * 60;
    if (this.hist) for (let k = 0; k < this.K; k++) { this.hist[(i * this.K + k) * 2] = lon; this.hist[(i * this.K + k) * 2 + 1] = lat; }
  }
  // wind at a point, in degrees per frame; returns speed in kt too for the colour
  windAt(lon, lat, out) {
    let u = this.drift[0], v = this.drift[1], kt = 0;
    for (const s of this.vortices) {
      const dx = (lon - s.lon) * KMLON, dy = (lat - s.lat) * KMLAT; const r = Math.hypot(dx, dy) + 0.5;
      const R = 35 + (120 - Math.min(120, s.kt)) * 0.3;          // radius of maximum wind, km: tighter for stronger storms
      const V = r < R ? s.kt * (r / R) : s.kt * Math.pow(R / r, 0.62);
      if (V < 1) continue;
      const tx = -dy / r, ty = dx / r;                               // counter-clockwise
      const ix = -dx / r, iy = -dy / r;                              // inflow toward the eye
      const k = V * 0.0019;                                          // kt -> deg per frame (100 kt moves a particle ~20 km a frame: a reading aid, not a speed)
      u += (tx * 0.9 + ix * 0.25) * k / Math.cos(lat * Math.PI / 180) * 0.92; v += (ty * 0.9 + iy * 0.25) * k;
      kt = Math.max(kt, V);
    }
    out[0] = u; out[1] = v; out[2] = kt; return out;
  }
  colour(kt, out) {
    // same ladder as the track ribbons: calm blue-grey, gale amber, hurricane orange, major red
    if (kt < 20) { const t = kt / 20; out[0] = 0.30 + 0.15 * t; out[1] = 0.42 + 0.2 * t; out[2] = 0.60 + 0.2 * t; }
    else if (kt < 34) { out[0] = 0.55; out[1] = 0.70; out[2] = 0.85; }
    else if (kt < 64) { out[0] = 0.95; out[1] = 0.77; out[2] = 0.36; }
    else if (kt < 96) { out[0] = 1.0; out[1] = 0.58; out[2] = 0.25; }
    else { out[0] = 1.0; out[1] = 0.30; out[2] = 0.30; }
    return out;
  }
  step() {
    if (this.mat.opacity <= 0.001) return;
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array; const w = [0, 0, 0], c = [0, 0, 0]; const K = this.K;
    this.head = (this.head + 1) % K;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += 1;
      if (this.age[i] > this.life[i] || this.lon[i] < BOX.W || this.lon[i] > BOX.E || this.lat[i] < BOX.S || this.lat[i] > BOX.N) this.spawn(i);
      this.windAt(this.lon[i], this.lat[i], w);
      this.lon[i] += w[0]; this.lat[i] += w[1];
      const hb = i * K * 2; this.hist[hb + this.head * 2] = this.lon[i]; this.hist[hb + this.head * 2 + 1] = this.lat[i];
      const f = Math.min(1, this.age[i] / 8, (this.life[i] - this.age[i]) / 8);
      const h = Math.max(this.sampleH(this.lon[i], this.lat[i]), 0) * 0.001 * this.exag + 7;
      this.colour(w[2], c);
      // K-1 segments from the oldest stored position to the newest, brightening toward the head
      for (let k = 0; k < K - 1; k++) {
        const ia = (this.head + 1 + k) % K, ib = (this.head + 2 + k) % K;
        const a = toScene(this.hist[hb + ia * 2], this.hist[hb + ia * 2 + 1]), b = toScene(this.hist[hb + ib * 2], this.hist[hb + ib * 2 + 1]);
        const o = (i * (K - 1) + k) * 6; pos[o] = a.x; pos[o + 1] = h; pos[o + 2] = a.z; pos[o + 3] = b.x; pos[o + 4] = h; pos[o + 5] = b.z;
        const ta = f * (k + 0.3) / K, tb = f * (k + 1.3) / K;
        col[o] = c[0] * ta; col[o + 1] = c[1] * ta; col[o + 2] = c[2] * ta; col[o + 3] = c[0] * tb; col[o + 4] = c[1] * tb; col[o + 5] = c[2] * tb;
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

// ---- a storm, played back along its track -------------------------------------------------------
// t runs over the fix index (one fix = 6 hours); the vortex sits at the interpolated position.
export class StormPlayer {
  constructor(wind) { this.wind = wind; this.storm = null; this.t = 0; this.speed = 0.22; this.onTick = null; this.loop = true; }
  play(storm, ribbon) { this.storm = storm; this.ribbon = ribbon; this.t0 = Math.max(0, storm.pts.findIndex(p => p[1] >= 16) - 1); if (this.t0 < 0) this.t0 = 0; this.t = this.t0; this.pause = 0; if (ribbon) ribbon.geometry.setDrawRange(0, 0); }
  stop() { this.storm = null; this.wind.vortices = []; if (this.ribbon) { this.ribbon.geometry.setDrawRange(0, Infinity); this.ribbon = null; } }
  step() {
    if (!this.storm) return;
    const pts = this.storm.pts; const n = pts.length;
    if (this.t >= n - 1) { this.pause += 1; if (this.pause > 70 && this.loop) { this.t = this.t0; this.pause = 0; if (this.ribbon) this.ribbon.geometry.setDrawRange(0, 0); } }
    else this.t += this.speed;
    const i = Math.min(n - 2, Math.floor(this.t)), f = Math.min(1, this.t - i);
    const a = pts[i], b = pts[i + 1];
    const lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f, kt = Math.max(15, a[2] + (b[2] - a[2]) * f);
    this.wind.vortices = [{ lon, lat, kt }];
    if (this.ribbon) {
      // reveal the ribbon up to the vortex; the ribbon was built from the fixes inside the scene window
      const k = this.ribbon.userData.fixIndex; const seg = k ? k.findIndex(j => j > this.t) : -1;
      const upto = seg < 0 ? Infinity : Math.max(0, seg - 1) * 6; this.ribbon.geometry.setDrawRange(0, upto);
    }
    if (this.onTick) this.onTick({ lon, lat, kt, i, f, t: this.t, n });
  }
}
