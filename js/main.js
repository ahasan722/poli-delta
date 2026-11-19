// main.js  --  v8: one scene, one camera, two views of it.
// 2D is the same scene seen straight down with the relief flattened and the columns laid flat; 3D tilts the
// camera, raises the ground and grows the columns, in that order. A single number (dimP, 0 = 2D, 1 = 3D)
// runs the choreography, so the switch can be reversed or interrupted half way and never snaps.
// Navigation is a stepper (buttons, keys, the wheel over the story panel); the wheel over the map zooms it.
// Every step and selection lives in the URL, so the Back button and shared links work.
import * as THREE from "three";
import { buildTerrain, heightSampler, toScene, GRID, KM_PER_DEG_LAT, KM_PER_DEG_LON } from "./terrain.js?v=8";
import { buildStorms, buildFarRivers, buildRivers, buildDistricts, buildPrisms, makeLabel, PLACES } from "./layers.js?v=8";
import { CHAPTERS, SITE } from "./story.js?v=8";
import { charts } from "./charts.js?v=8";
import { cards } from "./cards.js?v=8";
import { WindField, StormPlayer } from "./wind.js?v=8";
import { BASE, SEV, sevHex, windHex, WIND, FLOOD, LOW, RIVER, ACCENT, DEPTH, CROP, CROP_NAME, hex } from "./palette.js?v=8";
import { icon, hydrate, STEP_ICON } from "./icons.js?v=8";

const $ = id => document.getElementById(id);
const stage = $("stage");
const Q = new URLSearchParams(location.search);
const lod = Q.get("lod");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;           // easeInOutCubic
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const smoothstep = (a, b, x) => { const t = seg(x, a, b); return t * t * (3 - 2 * t); };
const lerpAngle = (a, b, t) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return a + d * t; };
const fmt = d3.format(","), f1 = d3.format(".1f");
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const mq = matchMedia("(prefers-reduced-motion: reduce)");
let reduced = mq.matches || Q.get("motion") === "reduce";
mq.addEventListener?.("change", e => { reduced = e.matches; });
const phone = () => innerWidth <= 820;

const N = CHAPTERS.length, EXPLORE = N - 1;
const DEFAULT_RULE = { metric: "pop_le5", sevMin: 3 };
const FOV = 26, DUR_DIM = 1.4;
const state = {
  step: 0, lastStory: 0, dimTarget: 1, dimP: 0, pick: 0, hover: 0, storm: null, rule: { ...DEFAULT_RULE },
  tl: { t: 0, playing: false, speed: 1, def: null }, ov: {}, about: false, renders: 0, frames: 0, frameTimes: [], ready: false, gl: true, sheetH: 0
};
const D = {};
let renderer, scene, camera, terrain, rivers, farRivers, labels, districts, prisms, ranks, storms, wind, player, site, sampleH;
const cur = {};                       // the values on screen, eased toward the step's targets

// ---- loading, with real progress ------------------------------------------------------------------
let loaded = 0; const TOTAL = 14;
const tick = x => { loaded += 1; $("loadFill").style.width = Math.round(loaded / TOTAL * 100) + "%"; $("loadPct").textContent = Math.round(loaded / TOTAL * 100) + "%"; return x; };
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(tick(i)); i.onerror = () => rej(new Error("could not load " + src)); i.src = src; });
const loadJson = src => fetch(src).then(r => r.ok ? r.json() : null).catch(() => null).then(tick);
const hasGL = () => { if (Q.get("nogl")) return false; try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } };

// ---- the camera: a target pose, a rendered pose that follows it, and flights between poses ----------
// pose = { look: Vector3 on the ground, d: distance, pitch: degrees from straight down (3D intent), az: degrees }
const cam = { look: new THREE.Vector3(), d: 900, pitch: 40, az: 190 };
const camT = { look: new THREE.Vector3(), d: 900, pitch: 40, az: 190 };
let flight = null;
const copyPose = (a, b) => { a.look.copy(b.look); a.d = b.d; a.pitch = b.pitch; a.az = b.az; return a; };
const clonePose = p => ({ look: p.look.clone(), d: p.d, pitch: p.pitch, az: p.az });
function flyTo(to, ms) {
  if (reduced) { copyPose(camT, to); copyPose(cam, to); flight = null; kick(); return; }
  const from = clonePose(camT); const far = from.look.distanceTo(to.look) + Math.abs(Math.log(to.d / from.d)) * 300;
  flight = { from, to: clonePose(to), t0: performance.now(), dur: ms || clamp(1200 + far * 0.6, 1200, 1800) }; kick();
}
function stepFlight(now) {
  if (!flight) return 0;
  const raw = clamp((now - flight.t0) / flight.dur, 0, 1), e = ease(raw); const a = flight.from, b = flight.to;
  const far = a.look.distanceTo(b.look); const lift = 1 + Math.sin(Math.PI * e) * Math.min(0.35, far / 800);   // arc over long moves
  camT.look.copy(a.look).lerp(b.look, e); camT.d = Math.exp(lerp(Math.log(a.d), Math.log(b.d), e)) * lift;
  camT.pitch = lerp(a.pitch, b.pitch, e); camT.az = lerpAngle(a.az, b.az, e);
  if (raw >= 1) flight = null; return Math.sin(Math.PI * e) * Math.min(1, far / 300);
}
const cancelFlight = () => { flight = null; };
// the rendered orientation: in 2D the camera looks straight down with north up; dimP blends to the 3D intent
function view(p) { const t = ease(seg(state.dimP, 0, 0.5)); return { pitch: p.pitch * t, az: lerpAngle(180, p.az, t), tilt: t }; }
function pose(c, p) {
  const v = view(p); const pr = v.pitch * Math.PI / 180, az = v.az * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.sin(pr), Math.cos(pr), -Math.cos(az) * Math.sin(pr));
  c.up.set(-Math.sin(az), 0, Math.cos(az));                      // screen-up = the horizontal direction the camera faces
  c.position.copy(p.look).addScaledVector(dir, p.d); c.lookAt(p.look); c.updateMatrixWorld();
}
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitV = new THREE.Vector3();
function groundAt(c, x, y) {
  const r = renderer.domElement.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, c); return ray.ray.intersectPlane(ground, hitV) ? hitV.clone() : null;
}

// ---- the free part of the stage: what the panel, the sheet and the phone sheet leave uncovered ------------
const off = { r: 0, b: 0 };
function freeTarget() {
  const sheetOpen = $("focus").classList.contains("on");
  if (phone()) return { r: 0, b: Math.max(state.sheetH, sheetOpen ? $("focus").offsetHeight : 0) };
  return { r: sheetOpen ? 380 + 32 : 0, b: 0 };
}
function applyOffset(c, o) {
  const w = stage.clientWidth || 1000, h = stage.clientHeight || 700; const rw = Math.max(50, w - o.r), rh = Math.max(50, h - o.b);
  c.aspect = rw / rh; c.setViewOffset(rw, rh, 0, 0, w, h); c.updateProjectionMatrix();
}
const probe = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
// distance that fits a box of ground in the free region, at a given pitch and bearing
function fitView(v, pitch, az) {
  const b = v.box; const look = toScene((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); look.y = 0; const top = pitch < 1 ? 0 : (v.top || 8);
  const corners = []; for (const lon of [b[0], b[2]]) for (const lat of [b[1], b[3]]) for (const y of [0, top]) { const p = toScene(lon, lat); p.y = y; corners.push(p); }
  const pr = pitch * Math.PI / 180, a = az * Math.PI / 180; const dir = new THREE.Vector3(Math.sin(a) * Math.sin(pr), Math.cos(pr), -Math.cos(a) * Math.sin(pr));
  const t = freeTarget(); const w = stage.clientWidth || 1000, h = stage.clientHeight || 700;
  probe.aspect = (w - t.r) / (h - t.b - (state.tl.def ? 70 : 0)); probe.updateProjectionMatrix(); probe.up.set(-Math.sin(a), 0, Math.cos(a));
  let d = Math.hypot((b[2] - b[0]) * KM_PER_DEG_LON, (b[3] - b[1]) * KM_PER_DEG_LAT) * 1.6;
  for (let k = 0; k < 10; k++) {
    probe.position.copy(look).addScaledVector(dir, d); probe.lookAt(look); probe.updateMatrixWorld();
    let m = 0; for (const c of corners) { const q = c.clone().project(probe); m = Math.max(m, Math.abs(q.x) / 0.92, Math.abs(q.y) / 0.86); }
    d *= m; if (Math.abs(m - 1) < 0.004) break;
  }
  return { look, d, pitch: v.pitch, az: v.az };
}
// a step's pose: in 2D fitted straight down, in 3D at its own pitch and bearing; both keep the 3D intent
const stepPose = i => { const v = CHAPTERS[i].view; return state.dimTarget ? fitView(v, v.pitch, v.az) : { ...fitView(v, 0, 180), pitch: v.pitch, az: v.az }; };

// ---- boot ------------------------------------------------------------------------------------------
async function boot() {
  state.gl = hasGL();
  const [hImg, mImg, cImg, cRGB, dImg, far, stormsJson, expo, riversJson, distJson, distGeo, impact, agri] = await Promise.all([
    loadImg("data/height.png"), loadImg("data/mask.png"), loadImg("data/cover.png"), loadImg("data/cover_rgb.png"), loadImg("data/district_id.png"),
    loadJson("data/rivers_far.geojson"), loadJson("data/storms.json"), loadJson("data/exposure.json"), loadJson("data/rivers.json"),
    loadJson("data/districts.json"), loadJson("data/districts.geojson"), loadJson("data/cyclones_impact.json"), loadJson("data/agri.json")
  ]);
  try { await Promise.all(['500 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"', '500 20px "Newsreader"'].map(f => document.fonts.load(f))); } catch (e) {}
  tick();
  const ds = distJson.districts;
  Object.assign(D, { storms: stormsJson, expo, districts: ds, byId: Object.fromEntries(ds.map(d => [d.id, d])), impact: impact || [],
    le5Total: ds.reduce((s, d) => s + d.pop_le5, 0), agri, geo: distGeo, slug: n => n.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") });
  D.ten = rankBy(DEFAULT_RULE).slice(0, 10);
  if (state.gl) buildScene({ hImg, mImg, cImg, cRGB, dImg, far, riversJson, distGeo }); else buildFallback();
  hydrate(); charts.init(D); cards.init(D, { clear: () => clearFocus(true), play: sid => playStorm(sid) });
  buildSteps(); buildExplore(); buildSearch(); bindUI(); bindToc(); resize();
  Object.assign(cur, valuesAt(0, 0));
  const h = readHash(); state.dimTarget = h.dim; setDimUI();
  goStep(h.step, { push: false, instant: true });
  if (h.district) selectDistrict(h.district, { push: false });
  if (h.storm) playStorm(h.storm, { push: false });
  if (h.about) showAbout(true, false);
  copyPose(cam, camT);
  if (reduced || !state.gl) state.dimP = state.dimTarget;
  else if (!h.district && !h.storm) {
    // the opening: start high over the Bay and come in while the map lifts from flat to relief
    const to = clonePose(camT); const from = clonePose(camT); from.d *= 2.3; from.az = to.az + 28; from.pitch = 12; from.look.z += 120;
    copyPose(cam, from); copyPose(camT, from); flyTo(to, 2600);
  }
  history.replaceState(null, "", hashFor());
  document.body.classList.add("ready"); state.ready = true;
  if (!store.get("poli-hint")) $("hint").hidden = false;
  if (!state.gl) toast("3D is not available in this browser, so this is the flat map.", 5000);
  requestAnimationFrame(frame);
}

function buildScene({ hImg, mImg, cImg, cRGB, dImg, far, riversJson, distGeo }) {
  const tex = (img, nearest = false) => { const t = new THREE.Texture(img); t.needsUpdate = true; t.minFilter = t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; return t; };
  const pixels = img => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
  D.idPix = pixels(dImg); D.idW = dImg.width; D.idH = dImg.height;
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(lod === "low" ? 1 : Math.min(devicePixelRatio, 2)); renderer.setClearColor(new THREE.Color(BASE.map), 1);
  stage.insertBefore(renderer.domElement, stage.firstChild);
  scene = new THREE.Scene(); scene.fog = new THREE.Fog(new THREE.Color(BASE.map), 1000, 3000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-300, 520, 260); scene.add(sun);
  camera = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
  sampleH = heightSampler(hImg);
  terrain = buildTerrain({ height: tex(hImg), mask: tex(mImg), cover: tex(cImg, true), coverRGB: tex(cRGB), district: tex(dImg, true) }, lod === "hi" ? 1023 : lod === "low" ? 255 : 511); scene.add(terrain.mesh);
  rivers = buildRivers(riversJson, sampleH, 14); scene.add(rivers);
  farRivers = buildFarRivers(far, sampleH, 14); scene.add(farRivers);
  districts = buildDistricts(distGeo, sampleH, 14); scene.add(districts);
  storms = buildStorms(D.storms, sampleH, 14); scene.add(storms);
  wind = new WindField(lod === "low" ? 1800 : 4500, sampleH, 14); scene.add(wind.mesh);
  player = new StormPlayer(wind); player.loop = false; player.speed = 0; player.onTick = t => { cards.stormTick(t); state.stormTick = t; };
  prisms = buildPrisms(distGeo); scene.add(prisms);
  ranks = new THREE.Group(); scene.add(ranks);
  labels = new THREE.Group();
  for (const [n, lon, lat] of PLACES) { const s = makeLabel(n, { size: n === "Bay of Bengal" ? 21 : 17, weight: n === "Dhaka" ? 600 : 500, color: n === "Bay of Bengal" ? "#4b6478" : BASE.ink }); const p = toScene(lon, lat); p.y = Math.max(sampleH(lon, lat), 0) * 0.001 * 14 + 6; s.position.copy(p); labels.add(s); }
  scene.add(labels);
  site = new THREE.Group(); const sp = toScene(SITE.lon, SITE.lat);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 12, 12), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 })); col.position.set(sp.x, 6, sp.z); site.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.8, 48), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.6, sp.z); ring.name = "ring"; site.add(ring);
  const lab = makeLabel("Beel Bhaina: ground up 0.8–1.2 m in 4 years", { size: 20, color: "#006b4f", weight: 600 }); lab.position.set(sp.x, 15, sp.z); site.add(lab);
  scene.add(site);
  applyRule();
  bindMap();
  new ResizeObserver(resize).observe(stage);
}

// ---- the rule: who is in the first ten, and how tall each column stands -----------------------------
const cropOf = (d, c) => (D.agri && D.agri.districts[d.id] && D.agri.districts[d.id].crops[c]) || 0;
function rankBy(rule) {
  if (rule.crop) return D.districts.slice().sort((a, b) => cropOf(b, rule.crop) - cropOf(a, rule.crop));
  return D.districts.filter(d => d.severe >= rule.sevMin).sort((a, b) => b[rule.metric] - a[rule.metric] || b.pop_le5 - a.pop_le5);
}
// crop classes: quintiles of the 64 district values, so every class holds about 13 districts
function cropBreaks(c) { const v = D.districts.map(d => cropOf(d, c)).sort(d3.ascending); return [0.2, 0.4, 0.6, 0.8].map(q => d3.quantileSorted(v, q)); }
const cropHex = (v, br) => CROP[d3.bisectRight(br, v)];
const OUTC = new THREE.Color(BASE.out);
const HEIGHT = { pop_le5: v => v / 1e6 * 32, pop_le2: v => v / 1e6 * 48, severe: v => v * 7 };
function applyRule() {
  const r = state.rule; const list = rankBy(r); D.list = list; const order = new Map(list.map((d, i) => [d.id, i]));
  if (prisms) {
    const br = r.crop ? cropBreaks(r.crop) : null; const cmax = r.crop ? d3.max(D.districts, d => cropOf(d, r.crop)) : 1;
    prisms.children.forEach(m => { const d = D.byId[m.userData.id]; if (!d) return; const q = r.crop ? true : d.severe >= r.sevMin;
      m.userData.q = q; m.userData.rank = order.has(d.id) ? order.get(d.id) : 99;
      m.userData.h = Math.max(0.3, r.crop ? cropOf(d, r.crop) / cmax * 45 : HEIGHT[r.metric](d[r.metric]));
      m.userData.col = new THREE.Color(r.crop ? cropHex(cropOf(d, r.crop), br) : q ? sevHex(d.severe) : BASE.out); });
    ranks.children.forEach(s => { s.material.map.dispose(); s.material.dispose(); }); ranks.clear();
    list.slice(0, r.crop ? 5 : 10).forEach((d, i) => { const s = makeLabel(`${i + 1} ${d.name}`, { size: 18, color: BASE.ink, weight: 600 }); s.userData.d = d; s.userData.rank = i; ranks.add(s); });
  }
  if (D.svg) paintFallback();
  renderList(); if (CHAPTERS[state.step]?.explore) showKey("explore"); kick();
}

// ---- the values on screen ---------------------------------------------------------------------------
function valuesAt(i, t) {
  const ch = CHAPTERS[i]; const v = { ...ch.u, ...ch.layers };
  if (ch.time) v[ch.time.key] = lerp(ch.time.from, ch.time.to, t);
  return v;
}

// ---- steps ------------------------------------------------------------------------------------------
function goStep(i, { push = true, instant = false } = {}) {
  i = clamp(i, 0, N - 1); const prev = state.step; state.step = i; const ch = CHAPTERS[i];
  if (!ch.explore) state.lastStory = i;
  if (state.storm && !ch.explore) stopStorm();
  if (state.pick && !pickable()) clearFocus(false);
  if (!ch.explore && (state.rule.metric !== DEFAULT_RULE.metric || state.rule.sevMin !== DEFAULT_RULE.sevMin || state.rule.crop)) { state.rule = { ...DEFAULT_RULE }; resetSegs(); applyRule(); }
  // the step's own timeline starts from zero and plays once (in full at once when motion is reduced)
  setTimeline(ch.time || null, { autoplay: !reduced, at: reduced ? 1 : 0 });
  if (ch.time && instant) cur[ch.time.key] = lerp(ch.time.from, ch.time.to, state.tl.t);
  state.ov = {}; stepUI(i); syncLayers(); charts.play?.(ch.id);
  if (state.gl) { const p = stepPose(i); if (instant) { copyPose(camT, p); copyPose(cam, p); flight = null; } else if (!state.pick) flyTo(p); }
  if (push && i !== prev) history.pushState(null, "", hashFor()); else history.replaceState(null, "", hashFor());
  $("live").textContent = `Step ${i + 1} of ${N}: ${ch.nav}`;
  kick();
}
const pickable = () => ["priority", "explore"].includes(CHAPTERS[state.step].id);
function stepUI(i) {
  const ch = CHAPTERS[i], ex = !!ch.explore;
  document.querySelectorAll("#steps li").forEach((li, n) => { li.classList.toggle("on", n === i); li.classList.toggle("done", n < i); li.querySelector("button").setAttribute("aria-current", n === i ? "step" : "false"); });
  document.querySelectorAll(".cap").forEach(c => c.classList.toggle("vis", c.dataset.ch === ch.id));
  $("storyText").hidden = ex; $("explorePanel").hidden = !ex; document.body.classList.toggle("exploring", ex);
  $("modeStory").classList.toggle("on", !ex); $("modeExplore").classList.toggle("on", ex);
  $("modeStory").setAttribute("aria-selected", !ex); $("modeExplore").setAttribute("aria-selected", ex);
  $("stepLabel").textContent = `Step ${i + 1} of ${N}${ex ? " · Explore" : ""}`;
  $("prevBtn").disabled = i === 0;
  $("nextTxt").textContent = i === 0 ? "Start" : i === EXPLORE ? "Back to the start" : i === EXPLORE - 1 ? "Explore the 64 districts" : "Next: " + CHAPTERS[i + 1].nav;
  $("progFill").style.width = (i / (N - 1) * 100) + "%";
  showKey(ch.id);
  if (state.gl) renderer.domElement.style.cursor = "grab";
}
function buildSteps() {
  const ol = $("steps");
  CHAPTERS.forEach((ch, i) => { const li = document.createElement("li"); li.innerHTML = `<button type="button"><span class="tile">${icon(STEP_ICON[ch.id] || "question", 18)}</span><span class="t">${ch.nav}</span><span class="n">${String(i + 1).padStart(2, "0")}</span></button>`;
    li.querySelector("button").addEventListener("click", () => goStep(i)); ol.appendChild(li); });
}
const next = () => goStep(state.step === EXPLORE ? 0 : state.step + 1), prevStep = () => goStep(state.step - 1);

// ---- the timeline: a step's own animation, or a cyclone being played ------------------------------------
function setTimeline(def, { autoplay = true, at = 0 } = {}) {
  const tl = state.tl; tl.def = def; tl.t = at; tl.playing = !!def && autoplay && at < 1;
  const el = $("timeline"); el.hidden = !def; document.body.classList.toggle("has-timeline", !!def);
  if (!def) return syncTimeline();
  $("tlLabel").textContent = def.label;
  $("ticks").innerHTML = def.ticks.map(v => `<span style="left:${((v - def.from) / (def.to - def.from) * 100).toFixed(2)}%">${def.tick(v)}</span>`).join("");
  syncTimeline();
}
function syncTimeline() {
  const tl = state.tl, def = tl.def; $("timeline").classList.toggle("playing", tl.playing);
  $("playBtn").setAttribute("aria-label", tl.playing ? "Pause" : "Play");
  if (!def) return;
  const s = $("scrub"); s.value = Math.round(tl.t * 1000); s.style.setProperty("--fill", (tl.t * 100).toFixed(2) + "%");
  s.setAttribute("aria-valuetext", def.fmt(lerp(def.from, def.to, tl.t)));
  $("tlValue").textContent = def.value ? def.value() : def.fmt(lerp(def.from, def.to, tl.t));
}
function togglePlay() { const tl = state.tl; if (!tl.def) return; if (!tl.playing && tl.t >= 1) tl.t = 0; tl.playing = !tl.playing; syncTimeline(); kick(); }

// ---- 2D / 3D ------------------------------------------------------------------------------------------
function setDim(three, { user = true } = {}) {
  if (!state.gl) return; const t = three ? 1 : 0; if (t === state.dimTarget) return;
  state.dimTarget = t; setDimUI();
  if (t && camT.pitch < 12) { camT.pitch = CHAPTERS[state.step].view.pitch; if (!flight) cam.pitch = camT.pitch; }
  if (reduced) state.dimP = t;
  if (user) history.replaceState(null, "", hashFor());
  kick();
}
function setDimUI() { document.querySelectorAll("#dimSeg button").forEach(b => { const on = +b.dataset.dim === (state.dimTarget ? 3 : 2); b.classList.toggle("on", on); b.setAttribute("aria-checked", on); }); }

// ---- the frame loop: renders only while something moves ---------------------------------------------
let last = performance.now(), need = 2, interacting = false, lastFrame = 0;
function kick() { need = Math.max(need, 2); }
const camPrev = { x: 0, y: 0, z: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.25, (now - last) / 1000)); last = now; state.frames += 1;   // real time, so slow machines finish animations on time
  if (!state.gl) return;
  let moving = false;
  // timeline
  const tl = state.tl;
  if (tl.playing && tl.def) { tl.t = Math.min(1, tl.t + dt * tl.speed / tl.def.dur); if (tl.t >= 1) tl.playing = false; syncTimeline(); moving = true; }
  // 2D <-> 3D
  if (state.dimP !== state.dimTarget) { const s = dt / DUR_DIM; state.dimP = state.dimTarget > state.dimP ? Math.min(state.dimTarget, state.dimP + s) : Math.max(state.dimTarget, state.dimP - s); moving = true; }
  const P = state.dimP; const eExag = ease(seg(P, 0.21, 0.79));
  // values: everything eases toward the step's targets; the timeline's own value follows quickly
  const ch = CHAPTERS[state.step]; const tgt = valuesAt(state.step, tl.def && !state.storm ? tl.t : 1); applyOverrides(tgt);
  const k = reduced ? 1 : 1 - Math.exp(-dt * 6), kf = reduced ? 1 : 1 - Math.exp(-dt * 22);
  for (const key in tgt) { const a = cur[key] ?? tgt[key], b = tgt[key]; const kk = ch.time && key === ch.time.key ? kf : k; const v = Math.abs(b - a) < 1e-4 ? b : a + (b - a) * kk; if (v !== a) moving = true; cur[key] = v; }
  const v = cur;
  // camera
  const fl = stepFlight(now); if (flight) moving = true;
  const kc = reduced ? 1 : 1 - Math.exp(-dt * 12);
  cam.look.lerp(camT.look, kc); cam.d = Math.exp(lerp(Math.log(cam.d), Math.log(camT.d), kc)); cam.pitch = lerp(cam.pitch, camT.pitch, kc); cam.az = lerpAngle(cam.az, camT.az, kc);
  if (cam.look.distanceTo(camT.look) > 0.01 || Math.abs(cam.d / camT.d - 1) > 1e-4 || Math.abs(cam.pitch - camT.pitch) > 0.01 || Math.abs(lerpAngle(cam.az, camT.az, 1) - cam.az) > 0.01) moving = true;
  off.r += (freeTarget().r - off.r) * kc; off.b += (freeTarget().b - off.b) * kc; if (Math.abs(freeTarget().r - off.r) > 0.5 || Math.abs(freeTarget().b - off.b) > 0.5) moving = true;
  applyOffset(camera, off); pose(camera, cam);
  const vw = view(cam); $("needle").style.transform = `rotate(${(180 - vw.az).toFixed(1)}deg)`;
  // continuous animations that need frames
  const live = (v.wind > 0.01) || (v.site > 0.01) || state.storm || (v.flow > 0.5 && v.rivers > 0.3) || (v.uSeaLevel > 0.01 || v.uBathy > 0.01);
  if (!(moving || live || interacting || need > 0)) { lastFrame = now; return; }
  need = Math.max(0, need - 1);
  scene.fog.near = cam.d * 1.2; scene.fog.far = cam.d * 3.2;
  // relief
  const U = terrain.uniforms; const time = now / 1000;
  for (const key of ["uSeaLevel", "uRiverGlow", "uFar", "uLowBand", "uSink", "uCoverMix", "uForest", "uWet", "uBuilt", "uLoss", "uBathy"]) U[key].value = v[key];
  U.uExag.value = v.uExag * eExag; U.uCutOn.value = 0; U.uTime.value = time;
  // the overlays were built at 14x; they follow the relief as it rises and lies down
  const ys = Math.max(0.03, eExag * v.uExag / 14); [rivers, farRivers, districts, storms, wind.mesh, labels, site].forEach(g => g.scale.y = ys);
  // labels step back while the camera flies or the view changes dimension
  const lf = (1 - smoothstep(0, 0.12, P) * smoothstep(1, 0.88, P)) * (1 - 0.85 * fl);
  rivers.children.forEach(o => { if (o.material.uniforms) { o.material.uniforms.uOpacity.value = (o.name === "major" ? 0.9 : 0.45) * v.rivers; o.material.uniforms.uTime.value = time; o.material.uniforms.uFlow.value = v.flow; } else o.material.opacity = v.riverLabels * lf; });
  farRivers.children.forEach(o => { const u = o.material.uniforms; u.uOpacity.value = 0.6 * v.farRivers; u.uTime.value = time; u.uFlow.value = v.flow; });
  labels.children.forEach(s => s.material.opacity = v.labels * lf);
  districts.children.forEach(l => { const sel = l.userData.id === state.pick; l.material.color.setHex(sel ? hex(BASE.ink) : hex(BASE.outline)); l.material.opacity = sel ? 0.95 : 0.55 * v.borders; });
  stormLayer(v, lf); prismLayer(v, P, lf);
  site.children.forEach(o => { o.material.opacity = v.site * (o.name === "ring" ? 0.45 + 0.45 * Math.sin(time * 2.4) : o.isSprite ? lf : 1); });
  site.children[1].scale.setScalar(1 + 0.25 * Math.sin(time * 2.4));
  readouts(v);
  // labels keep one size on screen
  const sc = camera.position.distanceTo(cam.look) / 1020;
  const fit = s => { if (s.isSprite && s.userData.base) s.scale.set(s.userData.base.w * sc, s.userData.base.h * sc, 1); };
  labels.children.forEach(fit); rivers.children.forEach(fit); ranks.children.forEach(fit); site.children.forEach(fit); storms.children.forEach(s => { if (s.userData.isStormLabel) fit(s); });
  if (state.storm && state.tl.def) { const s = player.storm; const n = s.pts.length; player.t = player.t0 + state.tl.t * (n - 1 - player.t0); syncTimeline(); }
  player.step(); wind.step();
  renderer.render(scene, camera); state.renders += 1;
  if (state.frameTimes.length > 400) state.frameTimes.shift(); state.frameTimes.push(now - lastFrame); lastFrame = now;
}

// cyclones: the storm step is a clock run by the timeline; Explore plays the storm the reader picks
function stormLayer(v, lf) {
  const yr = v.year, playing = !!state.storm;
  storms.children.forEach(o => {
    const s = o.userData; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-");
    if (playing) { o.material.opacity = s.sid === state.storm ? (o.isSprite ? lf : 0.95) : 0; return; }
    o.material.opacity = s.season <= yr ? v.storms * (marker ? 0.9 : s.note ? 0.85 : 0.45) * (o.isSprite ? lf : 1) : 0;
  });
  if (playing) { wind.mat.opacity = 0.95; return; }
  wind.mat.opacity = v.wind;
  if (v.wind > 0.01) {
    const y = Math.floor(yr), frac = yr - y; const yrs = D.storms.filter(s => s.season === y);
    if (yrs.length) { const s = yrs.reduce((a, b) => (a.peak_kt > b.peak_kt ? a : b)); const kk = Math.min(s.pts.length - 1, Math.floor(frac * (s.pts.length - 1))); const p = s.pts[kk]; wind.vortices = [{ lon: p[0], lat: p[1], kt: Math.max(30, p[2]) }]; }
    else wind.vortices = [];
  } else wind.vortices = [];
}
// the ten: in 2D a choropleth, in 3D columns that rise tallest-first after the ground has risen
function prismLayer(v, P, lf) {
  const on = v.prisms > 0.01; const g = clamp(v.grow, 0, 1);
  prisms.children.forEach(m => { m.visible = on; if (!on) return; const q = m.userData.q; const sel = state.pick && state.pick === m.userData.id;
    const st = 0.43 + Math.min(m.userData.rank, 10) * 0.025; const ex = ease(seg(P, st, st + 0.32));
    // a picked district keeps its colour; the others stay solid but fade toward the neutral grey, so the columns never turn to glass
    const o = v.prisms * (q ? 1 : 0.75); const fade = state.pick && !sel ? 0.7 : 0;
    m.material.forEach(mm => { mm.opacity = o; mm.transparent = o < 0.999; mm.depthWrite = o > 0.6; mm.color.copy(m.userData.col).lerp(OUTC, fade); });
    m.scale.y = Math.max(0.001, (q ? m.userData.h : 0.25) * g * ex); });
  ranks.children.forEach(s => { const d = s.userData.d; const m = prisms.getObjectByName("p-" + d.id); const p = toScene(d.centroid[0], d.centroid[1]);
    p.y = (m ? m.scale.y : 0) + 2 + (s.userData.rank % 3) * 3 * P; s.position.copy(p); s.material.opacity = v.ranks * g * lf; });
}
function readouts(v) {
  const id = CHAPTERS[state.step].id;
  if (id === "sea") { const lvl = Math.max(0, v.uSeaLevel); const i = clamp(Math.round(lvl / 0.25), 0, D.expo.steps_m.length - 1);
    $("seaM").textContent = lvl.toFixed(2) + " m"; $("seaP").textContent = f1(D.expo.people[i] / 1e6) + " M"; }
  if (id === "storms") { const y = Math.min(2025, Math.floor(v.year)); $("stormY").textContent = y; $("stormN").textContent = D.storms.filter(s => s.season <= y).length; }
}

// ---- the key: one compact block, the same in 2D and 3D -----------------------------------------------
const ramp = (a, b) => `<i class="ramp" style="background:linear-gradient(to right,${a},${b})"></i>`;
const sevKey = below => [["", "Hurricane-force passes since 1960"], ...[6, 5, 4, 3].map(n => [SEV[n], n === 6 ? "6" : String(n)]), [BASE.out, below]];
const KEYS = {
  bay: [["", "Depth of the Bay"], ["r:" + DEPTH.shelf + "," + DEPTH.deep, "shelf → 1,600 m"], ["l:" + RIVER.strong, "rivers, moving with their flow"]],
  low: [["", "Land under the cutoff"], ["r:" + LOW.low + "," + LOW.high, "lower → higher"]],
  silt: [["l:" + RIVER.strong, "rivers, darker = more water"]],
  sink: [["", "Land below the sea"], ["r:" + FLOOD.shallow + "," + FLOOD.deep, "shallow → deep"]],
  sea: [["", "Land below the sea"], ["r:" + FLOOD.shallow + "," + FLOOD.deep, "shallow → deep"]],
  storms: [["", "Cyclone wind"], ["l:" + WIND.major, "96 kt and more"], ["l:" + WIND.hurricane, "64–95 kt"], ["l:" + WIND.gale, "34–63 kt"]],
  priority: sevKey("fewer than 3"),
  raise: [[ACCENT, "tidal river management site"]],
  explore: sevKey("below the rule")
};
function cropKey(c) { const br = cropBreaks(c); const f = v => v >= 1e6 ? f1(v / 1e6) + " M" : d3.format(",")(Math.round(v / 1000)) + "k";
  return [["", CROP_NAME[c] + ", tonnes (" + D.agri.crop_years[c] + ")"], ...CROP.map((col, i) => [col, i === 0 ? "under " + f(br[0]) : i === 4 ? f(br[3]) + " and more" : f(br[i - 1]) + "–" + f(br[i])]).reverse()]; }
function showKey(id) {
  const k = id === "explore" && state.rule.crop ? cropKey(state.rule.crop) : (KEYS[id] || []);
  $("key").innerHTML = k.map(([c, t]) => !c ? `<div class="kt">${t}</div>` : c.startsWith("r:") ? `<div>${ramp(...c.slice(2).split(","))}${t}</div>` : `<div><i class="${c.startsWith("l:") ? "l" : ""}" style="background:${c.replace("l:", "")}"></i>${t}</div>`).join("");
}

// ---- explore: the rule becomes a tool ---------------------------------------------------------------
function buildExplore() {
  const segs = (id, key, attr, parse) => $(id).querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    $(id).querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); state.rule[key] = parse(b.dataset[attr]); applyRule(); }));
  segs("metricSeg", "metric", "m", v => v); segs("sevSeg", "sevMin", "s", v => +v);
  ["metricSeg", "sevSeg"].forEach(id => $(id).addEventListener("click", () => { if (state.rule.crop) { state.rule.crop = null; markCrops(); applyRule(); } }, true));
  $("cropSeg").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { state.rule.crop = state.rule.crop === b.dataset.c ? null : b.dataset.c; markCrops(); applyRule(); }));
  const box = $("stormChips");
  D.storms.filter(s => s.note).forEach(s => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.dataset.sid = s.sid; b.innerHTML = `${s.note.label}<small>${s.season}</small>`; b.addEventListener("click", () => playStorm(s.sid)); box.appendChild(b); });
}
function markCrops() { document.querySelectorAll("#cropSeg button").forEach(b => { const on = b.dataset.c === state.rule.crop; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
  document.querySelectorAll("#metricSeg button, #sevSeg button").forEach(b => b.style.opacity = state.rule.crop ? 0.55 : 1); }
function resetSegs() { markCrops?.();
  document.querySelectorAll("#metricSeg button").forEach(b => { const on = b.dataset.m === DEFAULT_RULE.metric; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
  document.querySelectorAll("#sevSeg button").forEach(b => { const on = +b.dataset.s === DEFAULT_RULE.sevMin; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
}
function renderList() {
  const ol = $("rankList"); if (!ol || !D.list) return; const r = state.rule; const list = D.list.slice(0, 15);
  const val = d => r.crop ? cropOf(d, r.crop) : d[r.metric]; const max = d3.max(list, val) || 1; const br = r.crop ? cropBreaks(r.crop) : null;
  ol.innerHTML = list.map((d, i) => { const v = r.crop ? (val(d) >= 1e6 ? f1(val(d) / 1e6) + " M t" : d3.format(",")(Math.round(val(d) / 1000)) + "k t") : r.metric === "severe" ? d.severe + " hits" : f1(d[r.metric] / 1e6) + " M";
    const col = r.crop ? cropHex(val(d), br) : i < 10 ? sevHex(d.severe) : BASE.out;
    return `<li data-id="${d.id}" tabindex="0" class="${i === 10 && !r.crop ? "cut" : ""}${state.pick === d.id ? " on" : ""}"><span class="r">${i + 1}</span><span class="nm">${d.name}</span><span class="v">${v}</span><span class="b"><i style="width:${(val(d) / max * 100).toFixed(1)}%;background:${col}"></i></span></li>`; }).join("")
    + (D.list.length > 15 ? `<li class="more"><span></span><span class="nm" style="font-weight:400;color:#6b7280">${D.list.length - 15} more ${r.crop ? "districts" : "meet the rule"}</span></li>` : "")
    + (D.list.length === 0 ? `<li class="more"><span></span><span class="nm">No district meets this rule</span></li>` : "");
  ol.querySelectorAll("li[data-id]").forEach(li => { const go = () => selectDistrict(+li.dataset.id); li.addEventListener("click", go); li.addEventListener("keydown", e => { if (e.key === "Enter") go(); }); });
}

// ---- selection --------------------------------------------------------------------------------------
function selectDistrict(id, { push = true, fly = true } = {}) {
  const d = D.byId[id]; if (!d) return;
  if (!pickable()) goStep(EXPLORE, { push: false });
  if (state.storm) stopStorm();
  state.pick = id; if (terrain) terrain.uniforms.uPick.value = id;
  cards.showDistrict(d); document.body.classList.add("sheet-open");
  if (state.gl && fly) { const pad = 0.4; const p = fitView({ box: [d.bbox[0] - pad, d.bbox[1] - pad, d.bbox[2] + pad, d.bbox[3] + pad], top: Math.min(60, 8 + (prisms?.getObjectByName('p-' + id)?.userData.h || 0)), pitch: 40, az: 196 }, state.dimTarget ? 40 : 0, state.dimTarget ? 196 : 180); p.pitch = 40; p.az = 196; flyTo(p); }
  if (D.svg) paintFallback();
  renderList(); if (push) history.pushState(null, "", hashFor()); else history.replaceState(null, "", hashFor()); kick();
}
function clearFocus(fly = true) {
  const had = state.pick || state.storm;
  if (state.pick) { state.pick = 0; if (terrain) terrain.uniforms.uPick.value = 0; }
  if (state.storm) stopStorm();
  cards.hide(); document.body.classList.remove("sheet-open"); renderList(); if (D.svg) paintFallback();
  if (had && fly && state.gl) flyTo(stepPose(state.step));
  if (had) history.pushState(null, "", hashFor()); kick();
}

// ---- cyclones in Explore ------------------------------------------------------------------------------
function markChips() { document.querySelectorAll("#stormChips .chip, #stormList button").forEach(b => b.classList.toggle("on", b.dataset.sid === state.storm)); }
function stopStorm() { state.storm = null; if (player) player.stop(); markChips(); if (CHAPTERS[state.step].time) setTimeline(CHAPTERS[state.step].time, { autoplay: false, at: 1 }); else setTimeline(null); }
function playStorm(sid, { push = true } = {}) {
  const s = D.storms.find(x => x.sid === sid); if (!s) return;
  if (state.step !== EXPLORE) goStep(EXPLORE, { push: false, instant: !state.ready });
  if (state.pick) { state.pick = 0; if (terrain) terrain.uniforms.uPick.value = 0; }
  state.storm = sid; markChips(); cards.showStorm(s); document.body.classList.add("sheet-open");
  const name = s.note ? s.note.label : s.name;
  if (state.gl) {
    player.play(s, storms.children.find(o => o.name === sid));
    const n = s.pts.length; const span = n - 1 - player.t0;
    setTimeline({ key: "_storm", label: `Cyclone ${name}, ${s.season}`, from: 0, to: span * 0.25, dur: clamp(span * 0.16, 6, 14), ticks: d3.range(0, Math.floor(span * 0.25) + 1, Math.max(1, Math.ceil(span * 0.25 / 6))), fmt: x => "day " + x.toFixed(1), tick: x => "day " + x,
      value: () => state.stormTick ? `day ${((state.stormTick.t - player.t0) * 0.25).toFixed(1)} · ${Math.round(state.stormTick.kt)} kt` : "" }, { autoplay: !reduced, at: reduced ? 1 : 0 });
    const pts = s.pts.filter(p => p[0] > GRID.W - 1 && p[0] < GRID.E + 1 && p[1] > 15 && p[1] < GRID.N);
    const b = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
    const v = { box: [b[0] - 0.3, Math.max(15, b[1]), b[2] + 0.3, b[3]], top: 10, pitch: 30, az: 185 };
    const p = fitView(v, state.dimTarget ? 30 : 0, state.dimTarget ? 185 : 180); p.pitch = 30; p.az = 185; flyTo(p);
  }
  renderList(); if (push) history.pushState(null, "", hashFor()); kick();
}

// ---- the map: drag, wheel, pinch, hover, click -----------------------------------------------------------
function districtAt(x, y) {
  const r = renderer.domElement.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const cols = prisms.children.filter(m => m.visible && m.material[0].opacity > 0.05 && m.scale.y > 0.5); if (cols.length) { const h = ray.intersectObjects(cols, false); if (h.length) return h[0].object.userData.id; }
  const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const hit = new THREE.Vector3(); if (!ray.ray.intersectPlane(pl, hit)) return 0;
  let lon = hit.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2, lat = -hit.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2;
  for (let n = 0; n < 2; n++) { pl.constant = -Math.max(sampleH(lon, lat), 0) * 0.001 * terrain.uniforms.uExag.value; if (!ray.ray.intersectPlane(pl, hit)) break; lon = hit.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2; lat = -hit.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2; }
  if (lon < GRID.W || lon > GRID.E || lat < GRID.S || lat > GRID.N) return 0;
  const px = Math.min(D.idW - 1, Math.floor((lon - GRID.W) / (GRID.E - GRID.W) * D.idW)), py = Math.min(D.idH - 1, Math.floor((GRID.N - lat) / (GRID.N - GRID.S) * D.idH));
  return D.idPix[(py * D.idW + px) * 4];
}
const D_MIN = 60, D_MAX = 4200;
function zoomAt(factor, x, y) {
  cancelFlight(); const probeC = camera.clone(); pose(probeC, camT);
  const before = x != null ? groundAt(probeC, x, y) : null;
  camT.d = clamp(camT.d * factor, D_MIN, D_MAX); pose(probeC, camT);
  if (before) { const after = groundAt(probeC, x, y); if (after) camT.look.add(before.sub(after)); }
  dismissHint(); kick();
}
function bindMap() {
  const el = renderer.domElement; const pts = new Map(); let mode = null, start = null, downAt = null, moved = 0, pinch = null;
  el.addEventListener("contextmenu", e => e.preventDefault());
  el.addEventListener("pointerdown", e => {
    el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); cancelFlight(); copyPose(camT, cam); interacting = true; hideTip();
    if (pts.size === 1) { const rot = state.dimTarget && (e.button === 2 || e.ctrlKey || e.metaKey || e.shiftKey); mode = rot ? "rotate" : "pan"; start = { x: e.clientX, y: e.clientY, g: groundAt(camera, e.clientX, e.clientY) }; downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; el.style.cursor = rot ? "move" : "grabbing"; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; mode = "pinch"; }
  });
  el.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) { hover(e); return; }
    const pr = pts.get(e.pointerId); const dx = e.clientX - pr.x, dy = e.clientY - pr.y; pr.x = e.clientX; pr.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (mode === "pan" && start.g) { pose(camera, cam); const g = groundAt(camera, e.clientX, e.clientY); if (g) { const dv = start.g.clone().sub(g); dv.y = 0; cam.look.add(dv); camT.look.copy(cam.look); } }
    else if (mode === "rotate") { cam.az = camT.az = (cam.az - dx * 0.3 + 360) % 360; cam.pitch = camT.pitch = clamp(cam.pitch - dy * 0.25, 0, 70); }
    else if (mode === "pinch" && pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.d = camT.d = clamp(cam.d * pinch.d / d, D_MIN, D_MAX);
      if (state.dimTarget) { cam.az = camT.az = (cam.az + (ang - pinch.ang) * 180 / Math.PI + 360) % 360; cam.pitch = camT.pitch = clamp(cam.pitch - (my - pinch.my) * 0.3, 0, 70); }
      else { pose(camera, cam); const g0 = groundAt(camera, pinch.mx, pinch.my), g1 = groundAt(camera, mx, my); if (g0 && g1) { cam.look.add(g0.sub(g1)); camT.look.copy(cam.look); } }
      pinch = { d, ang, mx, my };
    }
    if (moved > 4) dismissHint(); kick();
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size === 0) {
      interacting = false; el.style.cursor = "grab";
      if (downAt && moved < 6 && performance.now() - downAt.t < 500 && mode !== "pinch") click(e);
      mode = null; downAt = null;
    } else if (pts.size === 1) { const [p] = [...pts.values()]; mode = "pan"; pose(camera, cam); start = { x: p.x, y: p.y, g: groundAt(camera, p.x, p.y) }; }
    kick();
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", () => { hideTip(); if (terrain) terrain.uniforms.uHover.value = state.hover = 0; kick(); });
  stage.addEventListener("wheel", e => { if (!e.target.closest("canvas")) return; e.preventDefault(); const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; zoomAt(Math.exp(clamp(dy, -200, 200) * 0.0016), e.clientX, e.clientY); }, { passive: false });
}
function click(e) {
  if (!pickable()) return; const id = districtAt(e.clientX, e.clientY);
  if (id) selectDistrict(id); else if (state.pick) clearFocus();
}
// hover: outline lift at once, a tooltip after 120 ms that stays inside the window
let tipTimer = null;
const tip = $("tip");
function hideTip() { clearTimeout(tipTimer); tip.classList.remove("on"); }
function hover(e) {
  if (!terrain || !pickable() || interacting) { hideTip(); return; }
  const id = districtAt(e.clientX, e.clientY);
  if (id !== state.hover) { state.hover = id; terrain.uniforms.uHover.value = id; kick(); hideTip(); if (id) tipTimer = setTimeout(() => showTip(id), 120); }
  if (id) { placeTip(e.clientX, e.clientY); renderer.domElement.style.cursor = "pointer"; } else renderer.domElement.style.cursor = "grab";
}
let tipXY = [0, 0];
function showTip(id) {
  const d = D.byId[id]; const r = D.list.findIndex(x => x.id === id); const inTen = r >= 0 && r < 10 && !state.rule.crop;
  if (state.rule.crop) { const c = state.rule.crop, v = cropOf(d, c), br = cropBreaks(c);
    tip.innerHTML = `<div class="t"><i style="background:${cropHex(v, br)}"></i>${d.name}</div><div class="row">${CROP_NAME[c]} <b>${d3.format(",")(Math.round(v))} t</b></div><div class="row">rank among 64 <b>${r + 1}</b></div><div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  tip.innerHTML = `<div class="t"><i style="background:${d.severe >= state.rule.sevMin ? sevHex(d.severe) : BASE.out}"></i>${d.name}${inTen ? `<span style="color:#6b7280;font-weight:500">· ${r + 1} of the ten</span>` : ""}</div>
    <div class="row">people under 5 m <b>${f1(d.pop_le5 / 1e6)} M</b></div><div class="row">hurricane-force passes <b>${d.severe}</b></div><div class="hintline">Click for details</div>`;
  tip.classList.add("on"); placeTip(...tipXY);
}
function placeTip(x, y) {
  tipXY = [x, y]; const w = tip.offsetWidth || 200, h = tip.offsetHeight || 90; let tx = x + 16, ty = y - h / 2;
  if (tx + w > innerWidth - 8) tx = x - w - 16; ty = clamp(ty, 8, innerHeight - h - 8);
  tip.style.transform = `translate(${tx}px,${ty}px)`;
}

// ---- search -------------------------------------------------------------------------------------------
function buildSearch() {
  const inp = $("search"), list = $("searchList"), box = $("searchBox"); let items = [], idx = -1;
  const all = [...D.districts.map(d => ({ kind: "d", id: d.id, name: d.name, sub: d.division + " division" })),
               ...D.storms.filter(s => s.note).map(s => ({ kind: "s", id: s.sid, name: "Cyclone " + s.note.label, sub: String(s.season), key: s.note.label }))];
  const render = () => {
    const q = inp.value.trim().toLowerCase();
    items = !q ? [] : all.filter(o => o.name.toLowerCase().includes(q)).sort((a, b) => (a.name.toLowerCase().replace("cyclone ", "").startsWith(q) ? 0 : 1) - (b.name.toLowerCase().replace("cyclone ", "").startsWith(q) ? 0 : 1)).slice(0, 8);
    idx = items.length ? 0 : -1;
    list.innerHTML = items.length ? items.map((o, i) => `<li role="option" id="opt${i}" aria-selected="${i === idx}" data-i="${i}">${o.name}<small>${o.sub}</small></li>`).join("") : (q ? `<li class="empty" role="option" aria-disabled="true">No district or cyclone called “${inp.value.trim()}”</li>` : "");
    list.hidden = !q; box.setAttribute("aria-expanded", !!q); inp.setAttribute("aria-activedescendant", idx >= 0 ? "opt" + idx : "");
    list.querySelectorAll("li[data-i]").forEach(li => li.addEventListener("mousedown", ev => { ev.preventDefault(); choose(+li.dataset.i); }));
  };
  const mark = () => list.querySelectorAll("li[data-i]").forEach((li, i) => li.setAttribute("aria-selected", i === idx));
  const choose = i => { const o = items[i]; if (!o) return; inp.value = ""; render(); inp.blur(); document.body.classList.remove("searching");
    if (o.kind === "d") selectDistrict(o.id); else playStorm(o.id); };
  inp.addEventListener("input", render);
  inp.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, idx - 1); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(Math.max(0, idx)); }
    else if (e.key === "Escape") { inp.value = ""; render(); inp.blur(); document.body.classList.remove("searching"); }
  });
  inp.addEventListener("blur", () => setTimeout(() => { list.hidden = true; box.setAttribute("aria-expanded", false); }, 120));
  $("searchToggle").addEventListener("click", () => { document.body.classList.toggle("searching"); if (document.body.classList.contains("searching")) inp.focus(); });
}

// ---- URL: step, view, selection ------------------------------------------------------------------------
function hashFor() {
  const p = new URLSearchParams(); p.set("step", state.step + 1); p.set("mode", state.dimTarget ? "3d" : "2d");
  if (state.pick) p.set("id", D.slug(D.byId[state.pick].name));
  if (state.storm) { const s = D.storms.find(x => x.sid === state.storm); p.set("storm", s.note ? D.slug(s.note.label) + "-" + s.season : s.sid); }
  if (state.about) p.set("page", "about");
  return "#" + p.toString();
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)); const out = { step: 0, dim: 1, district: 0, storm: null, about: p.get("page") === "about" };
  const st = p.get("step"); if (st) { const n = parseInt(st, 10); out.step = Number.isFinite(n) ? clamp(n - 1, 0, N - 1) : Math.max(0, CHAPTERS.findIndex(c => c.id === st)); }
  if (p.get("mode") === "2d" || !hasGL()) out.dim = 0;
  const id = p.get("id"); if (id) { const d = D.districts.find(x => D.slug(x.name) === id || String(x.id) === id); if (d) out.district = d.id; }
  const s = p.get("storm"); if (s) { const m = D.storms.find(x => x.sid === s || (x.note && D.slug(x.note.label) + "-" + x.season === s) || (x.note && D.slug(x.note.label) === s)); if (m) out.storm = m.sid; }
  return out;
}
addEventListener("popstate", () => {
  const h = readHash(); if (h.about !== state.about) showAbout(h.about, false); if (h.dim !== state.dimTarget) setDim(!!h.dim, { user: false });
  if (h.step !== state.step) goStep(h.step, { push: false });
  if (h.district && h.district !== state.pick) selectDistrict(h.district, { push: false });
  else if (h.storm && h.storm !== state.storm) playStorm(h.storm, { push: false });
  else if (!h.district && !h.storm && (state.pick || state.storm)) { const had = state.pick || state.storm; state.pick = 0; if (terrain) terrain.uniforms.uPick.value = 0; if (state.storm) stopStorm(); cards.hide(); document.body.classList.remove("sheet-open"); renderList(); if (had && state.gl) flyTo(stepPose(state.step)); }
  kick();
});

// ---- the rest of the interface ---------------------------------------------------------------------------
function toast(msg, ms = 2200) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), ms); }
function dismissHint() { if (!$("hint").hidden) { $("hint").hidden = true; store.set("poli-hint", "1"); } }
let helpReturn = null;
function openHelp() { helpReturn = document.activeElement; $("help").hidden = false; $("helpClose").focus(); }
function closeHelp() { $("help").hidden = true; helpReturn?.focus?.(); }
function setCollapsed(c) { document.body.classList.toggle("collapsed", c); $("expandBtn").hidden = !c; $("collapseBtn").setAttribute("aria-expanded", !c); setTimeout(() => { resize(); if (state.gl && !state.pick && !state.storm) flyTo(stepPose(state.step), 600); }, 300); }
function toggleFs() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
function resetNorth() { if (!state.gl) return; const p = clonePose(camT); p.az = 180; p.pitch = state.dimTarget ? 45 : p.pitch; flyTo(p, 800); }
function bindUI() {
  $("prevBtn").addEventListener("click", prevStep); $("nextBtn").addEventListener("click", next);
  $("modeStory").addEventListener("click", () => { if (state.step === EXPLORE) goStep(state.lastStory); });
  $("modeExplore").addEventListener("click", () => { showAbout(false); goStep(EXPLORE); });
  $("modeStory").addEventListener("click", () => showAbout(false));
  $("modeAbout").addEventListener("click", () => showAbout(true));
  $("aboutClose").addEventListener("click", () => showAbout(false));
  buildLayers();
  $("brand").addEventListener("click", e => { e.preventDefault(); goStep(0); });
  document.querySelectorAll("#dimSeg button").forEach(b => b.addEventListener("click", () => setDim(b.dataset.dim === "3")));
  $("zoomIn").addEventListener("click", () => zoomAt(1 / 1.6)); $("zoomOut").addEventListener("click", () => zoomAt(1.6));
  $("compass").addEventListener("click", resetNorth);
  $("resetBtn").addEventListener("click", () => { if (state.gl) flyTo(stepPose(state.step)); });
  $("fsBtn").addEventListener("click", toggleFs);
  $("playBtn").addEventListener("click", togglePlay);
  $("speedBtn").addEventListener("click", () => { state.tl.speed = state.tl.speed === 1 ? 2 : 1; $("speedBtn").textContent = state.tl.speed + "×"; });
  $("scrub").addEventListener("input", e => { state.tl.t = +e.target.value / 1000; state.tl.playing = false; syncTimeline(); kick(); });
  $("hintClose").addEventListener("click", dismissHint);
  $("helpBtn").addEventListener("click", openHelp); $("helpClose").addEventListener("click", closeHelp);
  $("help").addEventListener("click", e => { if (e.target.id === "help") closeHelp(); });
  $("collapseBtn").addEventListener("click", () => setCollapsed(true)); $("expandBtn").addEventListener("click", () => setCollapsed(false));
  $("shareBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch (e) { toast("Copy the link from the address bar"); } });
  // the wheel over the story panel moves between steps; over the explore list it scrolls the list
  let acc = 0, lock = 0;
  $("panel").addEventListener("wheel", e => {
    if (phone() || state.step === EXPLORE) return;
    e.preventDefault(); const now = performance.now(); if (now < lock) return;
    acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; if (Math.abs(acc) < 40) return;
    if (acc > 0 && state.step < EXPLORE) next(); else if (acc < 0 && state.step > 0) prevStep();
    acc = 0; lock = now + 700;
  }, { passive: false });
  addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("layersPop").hidden) { toggleLayers(false); $("layersBtn").focus(); return; }
    if (e.key === "Escape" && !$("stormPop").hidden) { toggleStorms(false); $("stormBtn").focus(); return; }
    if (e.target.closest && e.target.closest("input:not([type=checkbox]),textarea,[contenteditable]")) return;
    if (!$("help").hidden) { if (e.key === "Escape" || e.key === "?") closeHelp(); return; }
    if (state.about) { if (e.key === "Escape") showAbout(false); return; }
    if (!$("layersPop").hidden && e.key === "Escape") { toggleLayers(false); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") { e.preventDefault(); if (state.step < EXPLORE) next(); }
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") { e.preventDefault(); prevStep(); }
    else if (k === "Home") goStep(0); else if (k === "End") goStep(EXPLORE);
    else if (k === "2") setDim(false); else if (k === "3") setDim(true);
    else if (k === " ") { if (state.tl.def) { e.preventDefault(); togglePlay(); } }
    else if (k === "/") { e.preventDefault(); if (phone()) document.body.classList.add("searching"); $("search").focus(); }
    else if (k === "?") openHelp();
    else if (k === "Escape") { if (state.pick || state.storm) clearFocus(); }
    else if (k === "+" || k === "=") zoomAt(1 / 1.6); else if (k === "-" || k === "_") zoomAt(1.6);
    else if (k === "n" || k === "N") resetNorth(); else if (k === "r" || k === "R") { if (state.gl) flyTo(stepPose(state.step)); }
    else if (k === "f" || k === "F") toggleFs(); else if (k === "l" || k === "L") toggleLayers(); else if (k === "c" || k === "C") toggleStorms(); else if (k === "[") setCollapsed(!document.body.classList.contains("collapsed"));
  });
  bindSheet();
}
// phones: the panel is a sheet with three stops (peek, half, full), dragged by its grip
const STOPS = () => [132, Math.round(innerHeight * 0.42), Math.round(innerHeight * 0.82)];
function setSheet(h, animate = true) {
  state.sheetH = h; const p = $("panel"); p.classList.toggle("dragging", !animate);
  document.documentElement.style.setProperty("--sheet", phone() ? h + "px" : "0px"); kick();
}
function bindSheet() {
  const grip = $("grip"); let y0 = null, h0 = 0;
  const startDrag = e => { if (!phone()) return; y0 = e.clientY; h0 = state.sheetH; grip.setPointerCapture?.(e.pointerId); };
  grip.addEventListener("pointerdown", startDrag);
  grip.addEventListener("pointermove", e => { if (y0 == null) return; setSheet(clamp(h0 + (y0 - e.clientY), 96, innerHeight * 0.9), false); });
  const end = e => { if (y0 == null) return; const moved = Math.abs(e.clientY - y0); y0 = null; const st = STOPS();
    let h = st.reduce((a, b) => Math.abs(b - state.sheetH) < Math.abs(a - state.sheetH) ? b : a);
    if (moved < 4) h = st[(st.indexOf(st.reduce((a, b) => Math.abs(b - h0) < Math.abs(a - h0) ? b : a)) + 1) % 3];   // a tap cycles the stops
    setSheet(h, true); if (state.gl && !state.pick && !state.storm) setTimeout(() => flyTo(stepPose(state.step), 700), 300); };
  grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
}

// ---- no WebGL: the same data as a flat SVG map --------------------------------------------------------------
function buildFallback() {
  $("dimSeg").querySelectorAll("button").forEach(b => b.disabled = true); ["compass", "zoomIn", "zoomOut", "resetBtn"].forEach(id => $(id).disabled = true);
  const svg = d3.select(stage).insert("svg", ":first-child").attr("class", "fallback").attr("role", "img").attr("aria-label", "Flat map of Bangladesh's 64 districts");
  D.svg = svg; D.paths = svg.append("g").selectAll("path").data(D.geo.features).join("path").attr("stroke", BASE.page).attr("stroke-width", 0.8).style("cursor", "pointer")
    .on("click", (e, f) => selectDistrict(f.properties.id))
    .on("mousemove", (e, f) => { tip.innerHTML = `<div class="t">${f.properties.name}</div><div class="hintline">Click for details</div>`; tip.classList.add("on"); placeTip(e.clientX, e.clientY); })
    .on("mouseleave", hideTip);
  layoutFallback(); paintFallback();
}
function layoutFallback() { if (!D.svg) return; const w = stage.clientWidth, h = stage.clientHeight; const proj = d3.geoMercator().fitExtent([[24, 24], [w - 24 - freeTarget().r, h - 24 - freeTarget().b]], D.geo); D.paths.attr("d", d3.geoPath(proj)); }
function paintFallback() { if (!D.paths) return; const r = state.rule; D.paths.attr("fill", f => { const d = D.byId[f.properties.id]; return d && d.severe >= r.sevMin ? sevHex(d.severe) : BASE.out; }).attr("opacity", f => state.pick && state.pick !== f.properties.id ? 0.45 : 1); }

// ---- the layers menu: per-step overrides --------------------------------------------------------------
const ON = { rivers: 0.9, riverLabels: 0.9, labels: 0.9, borders: 0.8, storms: 0.9, uBathy: 1 };
function applyOverrides(t) { for (const k in state.ov) { t[k] = state.ov[k] ? Math.max(t[k] || 0, ON[k]) : 0; if (k === "rivers") t.farRivers = state.ov[k] ? Math.max(t.farRivers, 0.8) : 0; if (k === "storms" && state.ov[k] && CHAPTERS[state.step].id !== "storms") t.year = 2025; } }
function syncLayers() { const t = valuesAt(state.step, 1); applyOverrides(t); document.querySelectorAll("#layersPop input").forEach(i => { i.checked = (t[i.dataset.layer] || 0) > 0.05; }); }
function togglePop(pop, btn, open) { const o = open ?? pop.hidden; document.querySelectorAll(".pop").forEach(p => { if (p !== pop) p.hidden = true; }); document.querySelectorAll("#layersBtn,#stormBtn").forEach(b => b.setAttribute("aria-expanded", b === btn && o)); pop.hidden = !o; }
function toggleLayers(open) { togglePop($("layersPop"), $("layersBtn"), open); if (!$("layersPop").hidden) syncLayers(); }
function toggleStorms(open) { togglePop($("stormPop"), $("stormBtn"), open); }
function buildStormPicker() {
  const named = D.storms.filter(s => s.note).sort((a, b) => a.season - b.season);
  $("stormList").innerHTML = named.map(s => { const im = D.impact.find(r => r.year === s.season && r.name.toLowerCase().includes(s.note.label.toLowerCase().split(" ")[0])) || {};
    const deaths = im.deaths != null ? d3.format(",")(im.deaths) + " deaths" : "";
    return `<li><button type="button" data-sid="${s.sid}"><i class="sw" style="background:${windHex(s.peak_kt)}"></i><span>${s.note.label}</span><span class="yr">${s.season}</span><small>peak ${s.peak_kt} kt${deaths ? " · " + deaths : ""}</small></button></li>`; }).join("");
  $("stormList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { toggleStorms(false); playStorm(b.dataset.sid); }));
  $("stormBtn").addEventListener("click", e => { e.stopPropagation(); toggleStorms(); });
}
function buildLayers() {
  $("layersBtn").addEventListener("click", e => { e.stopPropagation(); toggleLayers(); });
  document.querySelectorAll("#layersPop input").forEach(i => i.addEventListener("change", () => { state.ov[i.dataset.layer] = i.checked; syncLayers(); kick(); }));
  $("layersReset").addEventListener("click", () => { state.ov = {}; syncLayers(); kick(); });
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".pop,#layersBtn,#stormBtn")) document.querySelectorAll(".pop").forEach(p => { if (!p.hidden) togglePop(p, null, false); }); });
  buildStormPicker();
}
// ---- the About page ------------------------------------------------------------------------------------
let aboutReturn = null;
function showAbout(open, push = true) {
  if (open === state.about) return; state.about = open; $("about").hidden = !open;
  ["modeStory", "modeExplore", "modeAbout"].forEach(id => $(id).classList.remove("on"));
  if (open) { aboutReturn = document.activeElement; $("modeAbout").classList.add("on"); $("about").scrollTop = 0; $("aboutClose").focus(); }
  else { stepUI(state.step); aboutReturn?.focus?.(); }
  $("modeAbout").setAttribute("aria-selected", open);
  if (push) history.pushState(null, "", hashFor()); kick();
}
function bindToc() {
  const links = [...document.querySelectorAll(".toc a")]; const page = $("about");
  links.forEach(a => a.addEventListener("click", e => { e.preventDefault(); const t = document.getElementById(a.getAttribute("href").slice(1)); page.scrollTo({ top: t.offsetTop - 80, behavior: reduced ? "auto" : "smooth" }); }));
  page.addEventListener("scroll", () => { let cur = links[0]; for (const a of links) { const t = document.getElementById(a.getAttribute("href").slice(1)); if (t.getBoundingClientRect().top < 160) cur = a; } links.forEach(a => a.classList.toggle("on", a === cur)); }, { passive: true });
}

function resize() {
  if (phone() && !state.sheetH) setSheet(STOPS()[1], false); else if (!phone()) setSheet(0, false);
  if (renderer) { renderer.setSize(stage.clientWidth, stage.clientHeight, false); off.r = freeTarget().r; off.b = freeTarget().b; }
  layoutFallback(); kick();
}
addEventListener("resize", resize);

window.__poli = {
  get state() { return state; }, get cam() { return cam; }, get camT() { return camT; }, get flight() { return flight; }, get uniforms() { return terrain && terrain.uniforms; },
  get camera() { return camera; }, get data() { return D; }, get cur() { return cur; }, get prisms() { return prisms; },
  go: i => goStep(typeof i === "string" ? CHAPTERS.findIndex(c => c.id === i) : i), idx: id => CHAPTERS.findIndex(c => c.id === id), about: o => showAbout(o), select: id => selectDistrict(id), play: sid => playStorm(sid), setDim: t => setDim(t), clear: () => clearFocus(),
  stepPose: i => stepPose(i), project: (lon, lat, y = 0) => { const p = toScene(lon, lat); p.y = y; p.project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }
};

boot().catch(err => { console.error(err); const l = $("loader"); l.classList.add("err"); l.querySelector(".lt").textContent = "Could not load the map: " + err.message; });
