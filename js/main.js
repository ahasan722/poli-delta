// main.js  --  wires the relief to the reading panel: chapters on scroll, a district under the pointer,
// a storm to play. Nothing here knows about data files beyond loading them; the shapes live in
// terrain.js and layers.js, the chapters in story.js, the figures in charts.js and cards.js.
import * as THREE from "three";
import { OrbitControls } from "../lib/OrbitControls.js";
import { buildTerrain, heightSampler, toScene, GRID, KM_PER_DEG_LAT, KM_PER_DEG_LON } from "./terrain.js";
import { buildStorms, buildPopulation, buildFarRivers, buildRivers, buildOutlines, buildDistricts, buildGauges, makeLabel, PLACES } from "./layers.js";
import { CHAPTERS } from "./story.js";
import { charts } from "./charts.js";
import { cards } from "./cards.js";
import { WindField, StormPlayer } from "./wind.js";

const $ = id => document.getElementById(id);
const stage = $("stage"), panel = $("panel");
const lod = new URLSearchParams(location.search).get("lod");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(lod === "low" ? 1 : Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(0x06090d, 1);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x06090d, 700, 1500);
const camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);
const controls = new OrbitControls(camera, renderer.domElement); controls.enabled = false; controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 25; controls.maxDistance = 1400;

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const loadJson = src => fetch(src).then(r => r.ok ? r.json() : null).catch(() => null);
const tex = (img, nearest = false) => { const t = new THREE.Texture(img); t.needsUpdate = true; t.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; return t; };
const pixels = img => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };

const state = { chapter: null, free: false, orbit: 0, t0: performance.now(), frames: 0, pick: 0, hover: 0, storm: null, mode: "all", clockYear: 0 };
window.__poli = { get state() { return state; }, get terrain() { return terrain; }, goTo: id => goTo(id), select: id => selectDistrict(id), play: sid => selectStorm(sid), get data() { return D; } };
let terrain, storms, pop, farRivers, rivers, outlines, districts, gauges, labels, wind, player, sampleH;
const D = {};                 // the loaded data
let steps = [], order = [];   // sections in the panel, chapter ids in order

async function boot() {
  const [hImg, mImg, pImg, cImg, cRGB, dImg, far, stormsJson, expo, riversJson, coverStats, haorsJson, distJson, distGeo, climate, sea, impact] = await Promise.all([
    loadImg("data/height.png"), loadImg("data/mask.png"), loadImg("data/pop.png"), loadImg("data/cover.png"), loadImg("data/cover_rgb.png"), loadImg("data/district_id.png"),
    loadJson("data/rivers_far.geojson"), loadJson("data/storms.json"), loadJson("data/exposure.json"), loadJson("data/rivers.json"), loadJson("data/cover_stats.json"),
    loadJson("data/haors.geojson"), loadJson("data/districts.json"), loadJson("data/districts.geojson"), loadJson("data/climate.json"), loadJson("data/sealevel.json"), loadJson("data/cyclones_impact.json")
  ]);
  Object.assign(D, { storms: stormsJson, expo, coverStats, districts: distJson.districts, byId: Object.fromEntries(distJson.districts.map(d => [d.id, d])), climate, sea, impact: impact || [], idPix: pixels(dImg), idW: dImg.width, idH: dImg.height });
  sampleH = heightSampler(hImg);
  terrain = buildTerrain({ height: tex(hImg), mask: tex(mImg), cover: tex(cImg, true), coverRGB: tex(cRGB), district: tex(dImg, true) }, lod === "hi" ? 1023 : lod === "low" ? 255 : 511); scene.add(terrain.mesh);
  rivers = buildRivers(riversJson, sampleH, 14); scene.add(rivers);
  farRivers = buildFarRivers(far, sampleH, 14); scene.add(farRivers);
  outlines = buildOutlines(haorsJson, sampleH, 14); scene.add(outlines);
  districts = buildDistricts(distGeo, sampleH, 14); scene.add(districts);
  storms = buildStorms(stormsJson, sampleH, 14); scene.add(storms);
  pop = buildPopulation(pImg, sampleH, 14); scene.add(pop);
  gauges = buildGauges(climate, sea, sampleH, 14); scene.add(gauges);
  wind = new WindField(lod === "low" ? 1800 : 5000, sampleH, 14); scene.add(wind.mesh);
  player = new StormPlayer(wind); player.onTick = t => cards.stormTick(t);
  labels = new THREE.Group();
  for (const [n, lon, lat] of PLACES) { const s = makeLabel(n, { size: n === "Bay of Bengal" ? 20 : 17, weight: n === "Dhaka" ? 700 : 500 }); const p = toScene(lon, lat); p.y = Math.max(sampleH(lon, lat), 0) * 0.001 * 14 + 6; s.position.copy(p); s.userData.kind = "place"; labels.add(s); }
  scene.add(labels);
  // sections that need data we did not find are removed, so the story never shows an empty figure
  document.querySelectorAll(".step[data-needs]").forEach(el => { const need = el.dataset.needs; if ((need === "climate" && !climate) || (need === "sea" && !sea)) el.remove(); });
  steps = [...document.querySelectorAll(".step")].filter(s => !s.classList.contains("tail")); order = steps.map(s => s.dataset.id);
  steps.forEach((s, i) => { const n = s.querySelector(".n"); if (n) n.textContent = String(i).padStart(2, "0") + " / " + String(steps.length - 1).padStart(2, "0"); });
  charts.init(D); cards.init(D, { selectStorm, selectDistrict, clear: clearFocus });
  buildRail(); buildStormChips();
  document.body.classList.add("ready");
  resize(); goTo("cover", true); requestAnimationFrame(frame);
  const io = new IntersectionObserver(es => { es.forEach(e => { if (!e.isIntersecting) return; const id = e.target.dataset.id; if (state.lockUntil && performance.now() < state.lockUntil && id !== state.lockId) return; goTo(id); }); }, { root: innerWidth > 900 ? panel : null, rootMargin: "-42% 0px -42% 0px", threshold: 0 });
  document.querySelectorAll(".step").forEach(s => io.observe(s));
}

// ---- tweening ---------------------------------------------------------------------------------
const tweens = [];
const easeInOut = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
function tween(obj, key, to, ms, ease = easeInOut) { untween(obj, key); tweens.push({ obj, key, from: obj[key], to, t0: performance.now(), ms, ease }); }
function untween(obj, key) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj && tweens[i].key === key) tweens.splice(i, 1); }
function tweenVec(v, to, ms) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].vec === v) tweens.splice(i, 1); tweens.push({ vec: v, from: v.clone(), to: to.clone(), t0: performance.now(), ms, ease: easeInOut }); }
function runTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; const t = Math.min(1, (now - w.t0) / w.ms), e = w.ease(t);
    if (w.vec) w.vec.copy(w.from).lerp(w.to, e); else w.obj[w.key] = w.from + (w.to - w.from) * e;
    if (t >= 1) tweens.splice(i, 1); }
}
const camTarget = new THREE.Vector3();
function flyTo(pos, look, ms) { tweenVec(camera.position, pos, ms); tweenVec(camTarget, look, ms); }
// frame a lon/lat box: look at its centre from the south-west, far enough to hold it
function flyToBox(b, ms, k = 1.6, min = 70, steep = false) {
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; const look = toScene(cx, cy); look.y = 0;
  const diag = Math.hypot((b[2] - b[0]) * KM_PER_DEG_LON, (b[3] - b[1]) * KM_PER_DEG_LAT); const d = Math.max(min, diag * k);
  const pos = look.clone().add(steep ? new THREE.Vector3(-0.12 * d, 0.95 * d, 0.5 * d) : new THREE.Vector3(-0.22 * d, 0.78 * d, 0.72 * d)); flyTo(pos, look, ms); state.orbit = 0;
}

// ---- chapters ---------------------------------------------------------------------------------
function goTo(id, instant = false) {
  if (!terrain || !CHAPTERS[id] || id === state.chapter) return;
  const prev = state.chapter; state.chapter = id; const ch = CHAPTERS[id]; const ms = instant ? 1 : 1800;
  if (prev !== null) clearFocus(false);
  state.free = false; controls.enabled = false; $("freeBtn").classList.remove("on");
  flyTo(ch.cam.pos, ch.cam.look, ms); tween(state, "orbit", ch.orbit || 0, ms);
  for (const [k, v] of Object.entries(ch.u)) tween(terrain.uniforms[k], "value", v, ms);
  const L = ch.layers;
  tween(pop.material.uniforms.uOpacity, "value", L.pop, ms);
  farRivers.children.forEach(l => tween(l.material, "opacity", 0.55 * L.farRivers, ms));
  outlines.children.forEach(o => tween(o.material, "opacity", (o.name === "outline" ? 0.9 : 1) * L.outlines, ms));
  gauges.children.forEach(o => tween(o.material, "opacity", (L[o.userData.kind] ?? 0) * (o.isSprite ? 1 : 0.9), ms));
  rivers.children.forEach(o => tween(o.material, "opacity", o.name === "major" ? 0.85 * L.rivers : o.name === "minor" ? 0.35 * L.rivers : L.riverLabels, ms));
  labels.children.forEach(s => tween(s.material, "opacity", L.labels * (s.userData.kind === "place" ? 1 : 0.5), ms));
  tween(wind.mat, "opacity", L.wind ? 0.85 : 0, ms);
  // storms: which ribbons show
  const stormChapter = L.storms > 0;
  storms.children.forEach(o => {
    const s = o.userData; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-");
    let on = stormChapter; if (on && ch.namedOnly) on = !!s.note; if (on && ch.stormYears) on = s.season >= ch.stormYears[0] && s.season <= ch.stormYears[1];
    if (id === "storms" && state.mode === "all") { o.material.opacity = 0; return; }   // the clock reveals them
    tween(o.material, "opacity", on ? (marker ? 0.9 : (s.note ? 0.75 : 0.35) * L.storms) : 0, ms);
  });
  if (id === "storms") { if (state.mode === "all") startClock(); else if (state.storm) playStorm(state.storm); }
  else { stopClock(); player.stop(); wind.vortices = []; }
  if (!stormChapter && state.storm) { state.storm = null; markChips(); }
  steps.forEach(el => el.classList.toggle("on", el.dataset.id === id));
  document.querySelectorAll("#rail a").forEach(a => a.classList.toggle("on", a.dataset.id === id));
  showLegend(ch.legend);
  $("clickHint").style.opacity = id === "cover" || id === "ground" ? 0.85 : 0;
  if (ch.seaSlider) charts.bindSea(terrain.uniforms.uSeaLevel, D.expo, ch.u.uSeaLevel, v => { untween(terrain.uniforms.uSeaLevel, "value"); terrain.uniforms.uSeaLevel.value = v; });
}
function buildRail() {
  const rail = $("rail"); rail.innerHTML = "";
  steps.forEach((s, i) => { const id = s.dataset.id, ch = CHAPTERS[id]; if (!ch) return;
    const a = document.createElement("a"); a.href = "#"; a.dataset.id = id; a.innerHTML = `<i></i><span data-n="${String(i).padStart(2, "0")}">${ch.nav}</span>`;
    if (["cover", "rivers", "storms", "people"].includes(id)) a.classList.add("mark");
    a.addEventListener("click", e => { e.preventDefault(); scrollToStep(id); }); rail.appendChild(a); });
}
function scrollToStep(id, instant = false) { const el = steps.find(s => s.dataset.id === id); if (!el) return; const desk = innerWidth > 900; const top = desk ? el.offsetTop - panel.clientHeight * 0.2 : el.getBoundingClientRect().top + scrollY - innerHeight * 0.55; state.lockUntil = performance.now() + (instant ? 400 : 1500); state.lockId = id; (innerWidth > 900 ? panel : window).scrollTo({ top, behavior: instant ? "auto" : "smooth" }); }

// ---- the storm clock: all storms, year by year ------------------------------------------------
let clockTimer = null;
function startClock() {
  stopClock(); let yr = 1960; const el = $("stormYear"); el.classList.add("on"); el.textContent = yr; wind.vortices = [];
  clockTimer = setInterval(() => { yr += 1; if (yr > 2025) { clearInterval(clockTimer); clockTimer = null; el.textContent = "1960–2025"; return; }
    el.textContent = yr; state.clockYear = yr;
    storms.children.forEach(o => { const s = o.userData; if (s.season > yr) return; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-"); o.material.opacity = marker ? 0.95 : (s.note ? 0.75 : 0.35); });
    // the year's strongest storm gets a short vortex so the field moves with the clock
    const yrs = D.storms.filter(s => s.season === yr); if (yrs.length) { const s = yrs.reduce((a, b) => a.peak_kt > b.peak_kt ? a : b); const p = s.pts[Math.floor(s.pts.length * 0.6)]; wind.vortices = [{ lon: p[0], lat: p[1], kt: s.peak_kt }]; }
  }, 150);
}
function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } $("stormYear").classList.remove("on"); }

// ---- storms: pick one and play it --------------------------------------------------------------
function buildStormChips() {
  const box = $("stormChips"); box.innerHTML = "";
  D.storms.filter(s => s.note).forEach(s => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.dataset.sid = s.sid; b.innerHTML = `${s.note.label}<small>${s.season}</small>`; b.addEventListener("click", () => selectStorm(s.sid)); box.appendChild(b); });
  $("stormAll").addEventListener("click", () => { state.mode = "all"; state.storm = null; player.stop(); markChips(); clearFocus(false); if (state.chapter === "storms") { storms.children.forEach(o => o.material.opacity = 0); flyTo(CHAPTERS.storms.cam.pos, CHAPTERS.storms.cam.look, 1400); startClock(); } });
}
function markChips() { document.querySelectorAll("#stormChips .chip").forEach(b => b.classList.toggle("on", b.dataset.sid === state.storm)); $("stormAll").classList.toggle("on", state.mode === "all"); }
function selectStorm(sid) {
  const s = D.storms.find(x => x.sid === sid); if (!s) return;
  state.mode = "one"; state.storm = sid; markChips(); stopClock();
  if (state.chapter !== "storms") { scrollToStep("storms", true); goTo("storms"); }
  playStorm(sid); cards.showStorm(s, D);
}
function playStorm(sid) {
  const s = D.storms.find(x => x.sid === sid); const ribbon = storms.children.find(o => o.name === sid);
  storms.children.forEach(o => { const mine = o.userData.sid === sid; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-"); tween(o.material, "opacity", mine ? 0.95 : 0, 700); });
  const inWin = s.pts.filter(p => p[0] > GRID.W - 1 && p[0] < GRID.E + 1 && p[1] > GRID.S - 2 && p[1] < GRID.N); const pts = inWin.length > 1 ? inWin : s.pts;
  const b = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  flyToBox([b[0], b[1] - 0.6, b[2], b[3]], 1600, 1.2, 340, true); tween(wind.mat, "opacity", 0.95, 800);
  player.play(s, ribbon);
}

// ---- districts: hover and click on the relief ----------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function lonLatAt(ev) {
  const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(ground, hit)) return null;
  let lon = hit.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2, lat = -hit.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2;
  // two passes against the real height so hills do not shift the pick
  for (let k = 0; k < 2; k++) { const h = Math.max(sampleH(lon, lat), 0) * 0.001 * terrain.uniforms.uExag.value; ground.constant = -h; if (!ray.ray.intersectPlane(ground, hit)) break; lon = hit.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2; lat = -hit.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2; }
  ground.constant = 0; return [lon, lat];
}
function districtAt(lon, lat) {
  if (lon < GRID.W || lon > GRID.E || lat < GRID.S || lat > GRID.N) return 0;
  const x = Math.min(D.idW - 1, Math.floor((lon - GRID.W) / (GRID.E - GRID.W) * D.idW)), y = Math.min(D.idH - 1, Math.floor((GRID.N - lat) / (GRID.N - GRID.S) * D.idH));
  return D.idPix[(y * D.idW + x) * 4];
}
function ribbonAt(ev) {
  if (!(CHAPTERS[state.chapter]?.layers.storms > 0)) return null;
  const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const vis = storms.children.filter(o => o.userData.isRibbon && o.material.opacity > 0.05); const h = ray.intersectObjects(vis, false); return h.length ? h[0].object.userData : null;
}
let down = null, moved = false;
const tip = $("tip");
renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; moved = false; });
renderer.domElement.addEventListener("pointermove", e => {
  if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) moved = true;
  if (!terrain) return; const r = stage.getBoundingClientRect();
  const sr = ribbonAt(e);
  if (sr) { tip.style.display = "block"; tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top) + "px"; tip.innerHTML = `${sr.note ? sr.note.label : (sr.name && sr.name !== "NOT_NAMED" ? sr.name : "unnamed storm")} <small>${sr.season} · ${sr.peak_kt} kt</small>`; setHover(0); renderer.domElement.style.cursor = "pointer"; return; }
  const ll = lonLatAt(e); const id = ll ? districtAt(ll[0], ll[1]) : 0; setHover(id);
  if (id) { const d = D.byId[id]; tip.style.display = "block"; tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top) + "px"; tip.innerHTML = `${d.name} <small>${d.division}</small>`; renderer.domElement.style.cursor = "pointer"; }
  else { tip.style.display = "none"; renderer.domElement.style.cursor = state.free ? "grab" : "default"; }
});
renderer.domElement.addEventListener("pointerleave", () => { tip.style.display = "none"; setHover(0); });
renderer.domElement.addEventListener("pointerup", e => {
  if (!down || moved) { down = null; return; } down = null;
  const sr = ribbonAt(e); if (sr) { selectStorm(sr.sid); return; }
  const ll = lonLatAt(e); const id = ll ? districtAt(ll[0], ll[1]) : 0;
  if (id) selectDistrict(id); else if (state.pick) clearFocus(true);
});
function setHover(id) { if (id === state.hover) return; state.hover = id; terrain.uniforms.uHover.value = id; }
function selectDistrict(id) {
  const d = D.byId[id]; if (!d) return;
  state.pick = id; terrain.uniforms.uPick.value = id;
  districts.children.forEach(l => tween(l.material, "opacity", l.userData.id === id ? 0.95 : 0, 500));
  flyToBox(d.bbox, 1500, 1.7, 90);
  cards.showDistrict(d, D);
}
function clearFocus(restoreCam) {
  if (state.pick) { state.pick = 0; terrain.uniforms.uPick.value = 0; districts.children.forEach(l => tween(l.material, "opacity", 0, 400)); if (restoreCam && CHAPTERS[state.chapter]) { const ch = CHAPTERS[state.chapter]; flyTo(ch.cam.pos, ch.cam.look, 1400); state.orbit = ch.orbit || 0; } }
  cards.hide();
}

// ---- frame loop -------------------------------------------------------------------------------
function frame(now) {
  state.frames += 1; runTweens(now);
  terrain.uniforms.uTime.value = (now - state.t0) / 1000;
  if (state.free) controls.update();
  else { if (state.orbit) { const p = camera.position.clone().sub(camTarget); p.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.orbit * 0.016); camera.position.copy(camTarget).add(p); } camera.lookAt(camTarget); }
  const d = camera.position.distanceTo(camTarget), k = d / 900;
  const fit = s => { if (s.isSprite && s.userData.base) s.scale.set(s.userData.base.w * k, s.userData.base.h * k, 1); };
  labels.children.forEach(fit); rivers.children.forEach(fit); outlines.children.forEach(fit); gauges.children.forEach(fit); storms.children.forEach(s => { if (s.userData.isStormLabel) fit(s); });
  pop.material.uniforms.uScale.value = Math.min(2.2, 420 / d);
  player.step(); wind.step();
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize);

// ---- controls ---------------------------------------------------------------------------------
$("freeBtn").addEventListener("click", e => {
  state.free = !state.free; e.currentTarget.classList.toggle("on", state.free);
  if (state.free) { controls.target.copy(camTarget); controls.enabled = true; tweens.length = 0; state.orbit = 0; }
  else { const id = state.chapter; state.chapter = null; goTo(id); }
});
$("exagRange").addEventListener("input", e => { untween(terrain.uniforms.uExag, "value"); terrain.uniforms.uExag.value = +e.target.value; });

// ---- legend -----------------------------------------------------------------------------------
const LEGENDS = {
  cover: ["Land cover, ESA WorldCover 2021", ["#a99e5c", "cropland"], ["#2b5c33", "tree cover, groves"], ["#1a4d3d", "mangrove"], ["#4d857a", "wetland"], ["#c7946a", "built-up"], ["#17334d", "water"]],
  low: ["Height above sea", ["#c8843a", "land under the tint height"], ["#a99e5c", "higher ground"]],
  rivers: ["Rivers", ["line:#8ccfe8", "big river (discharge)"], ["line:#3f6a80", "small channel"], ["#17334d", "water surface"]],
  forest: ["Forest", ["#1f7a60", "mangrove, lifted"], ["#2b5c33", "other tree cover"], ["#17334d", "creeks and the Bay"]],
  wet: ["Wetlands", ["#5fb3b0", "herbaceous wetland, lifted"], ["line:#9fe3dc", "haor outline"], ["#17334d", "open water"]],
  loss: ["Forest change", ["#f2482a", "tree cover lost 2001–2023 (Hansen)"], ["#2b5c33", "tree cover standing"]],
  rise: ["Sea-level slider", ["#c04d2a", "land at or below the chosen level"], ["#a99e5c", "dry land"]],
  storms: ["Cyclones, IBTrACS", ["streak:#fff", "wind, modelled from the track"], ["line:#ff5a3c", "96 kt and more"], ["line:#ff9a3c", "64–95 kt"], ["line:#f2c35a", "34–63 kt"], ["dot:#ffd27a", "named storm near landfall"]],
  people: ["People, GPW 2015", ["dot:#f6e2a8", "square km with people, brighter = more"], ["#c7946a", "built-up land"]],
  stations: ["Weather stations, BMD 1948–2013", ["dot:#f2c35a", "column = temperature trend over 50 years"], ["dot:#5fa8c2", "cooling trend"]],
  rain: ["Rain, BMD 1948–2013", ["dot:#5fa8c2", "column = mean annual rainfall"]],
  tide: ["Tide gauges, PSMSL", ["dot:#7fd8d2", "column = relative sea-level trend"]]
};
function showLegend(key) {
  const L = LEGENDS[key] || LEGENDS.cover; const el = $("legend");
  el.innerHTML = `<h4>${L[0]}</h4>` + L.slice(1).map(([c, t]) => { const [kind, col] = c.includes(":") ? c.split(":") : ["fill", c]; return `<div class="row"><span class="sw ${kind === "fill" ? "" : kind}" style="background:${col}"></span><span>${t}</span></div>`; }).join("");
}

boot().catch(err => { console.error(err); stage.insertAdjacentHTML("beforeend", `<div class="err">Could not start the 3D scene: ${err.message}. This page needs WebGL.</div>`); });
