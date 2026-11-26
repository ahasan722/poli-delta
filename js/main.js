// main.js  --  v16: one scene, one camera, two views of it.
// 2D is the same scene seen straight down with the relief flattened and the columns laid flat; 3D tilts the
// camera, raises the ground and grows the columns, in that order. A single number (dimP, 0 = 2D, 1 = 3D)
// runs the choreography, so the switch can be reversed or interrupted half way and never snaps.
// Navigation is a stepper (buttons, keys, the wheel over the story panel); the wheel over the map zooms it.
// Every step and selection lives in the URL, so the Back button and shared links work.
import * as THREE from "three";
import { buildTerrain, heightSampler, toScene, GRID, KM_PER_DEG_LAT, KM_PER_DEG_LON } from "./terrain.js?v=16";
import { buildStorms, buildFarRivers, buildRivers, buildDistricts, buildPrisms, makeLabel, PLACES } from "./layers.js?v=16";
import { CHAPTERS, SITE } from "./story.js?v=16";
import { charts } from "./charts.js?v=16";
import { cards } from "./cards.js?v=16";
import { WindField, StormPlayer } from "./wind.js?v=16";
import { BASE, SEV, sevHex, windHex, WIND, FLOOD, LOW, RIVER, ACCENT, DEPTH, CROP, CROP_NAME, REGION, REGION_ORDER, hex, WET, BIRD, FISHR, MANGROVE, TEA, SEASONCOL, ROAD, RAIL, RAIN, POPC, ACC, BURD, CARE, RSYS, NATION, CITYC } from "./palette.js?v=16";
import { buildSource, updateSource, riverBox, drawSourceStrips, sourceCard, RGROUPS, buildCities, updateCities, drawCityBars, cityPop } from "./source.js?v=16";
import { buildTransport, updateTransport } from "./transport.js?v=16";
import { buildRain, drawRainYear, drawRainYears, rainHex } from "./rain.js?v=16";
import { buildV12, updateV12, drawCalendar, drawTea, drawTeaOut, drawTigers, drawSundFish, inField, MONTH } from "./v12.js?v=16";
import { buildWet, updateWet, wetAt, haorR, drawHaorDistricts, drawBirds, drawFishNational, drawFishSpecies, sparkKt } from "./wet.js?v=16";
import { icon, hydrate, STEP_ICON } from "./icons.js?v=16";
import { buildHealth, updateHealth, drawPopNat, modelTable, districtModelTable, drawCatch, popHex, accHex, burdHex, ACC_BR, M as Mfmt } from "./people.js?v=16";
import { buildAtlas, updateAtlas, drawMerge, drawHilsa, drawHalda, drawClock, drawDecades, drawFloodYears, drawErosion, seasonOf, monthOf } from "./atlas.js?v=16";

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

const N = CHAPTERS.filter(c => !c.section).length, EXPLORE = N - 1, ALL = CHAPTERS.length;   // the story, then the atlas sections
const isSec = i => !!CHAPTERS[i]?.section;
const DEFAULT_RULE = { theme: "rule", metric: "pop_le5", sevMin: 3, crop: "aman" };
const FOV = 26, DUR_DIM = 1.4;
const state = {
  step: 0, lastStory: 0, dimTarget: 1, dimP: 0, pick: 0, hover: 0, storm: null, rule: { ...DEFAULT_RULE },
  tl: { t: 0, playing: false, speed: 1, def: null }, ov: {}, season: "all", haz: "rain", srcSel: null, srcGrp: null, citySel: null, cityYr: 0, trMode: "all", fishTab: "hilsa", hk: "uhc", wetTab: "haors", trk: { q: "", k: 0, sort: -1, view: "list" }, hoverStorm: null, wetHover: null, about: false, renders: 0, frames: 0, frameTimes: [], ready: false, gl: true, sheetH: 0
};
const D = {};
let srcG = null, cityG = null, srcCh = null, cityCh = null, healthG = null, popCh = null, atlasG = null, wetG = null, v12G = null, trG = null, rainL = null, rainCh = null, cal = null, eye = null, renderer, scene, camera, terrain, rivers, farRivers, labels, districts, prisms, ranks, storms, wind, player, site, sampleH;
const cur = {};                       // the values on screen, eased toward the step's targets

// ---- loading, with real progress ------------------------------------------------------------------
let loaded = 0; const TOTAL = 17;
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
  const [hImg, mImg, cImg, cRGB, dImg, far, stormsJson, expo, riversJson, distJson, distGeo, impact, agri, atlas, wet, v12, v13, transport, rain, pop, source] = await Promise.all([
    loadImg("data/height.png"), loadImg("data/mask.png"), loadImg("data/cover.png"), loadImg("data/cover_rgb.png"), loadImg("data/district_id.png"),
    loadJson("data/rivers_far.geojson"), loadJson("data/storms.json"), loadJson("data/exposure.json"), loadJson("data/rivers.json"),
    loadJson("data/districts.json"), loadJson("data/districts.geojson"), loadJson("data/cyclones_impact.json"), loadJson("data/agri.json"), loadJson("data/atlas.json"), loadJson("data/wet.json"), loadJson("data/v12.json"), loadJson("data/v13.json"), loadJson("data/transport.json"), loadJson("data/rain.json"), loadJson("data/pop.json"), loadJson("data/source.json")
  ]);
  try { await Promise.all(['500 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"', '500 20px "Newsreader"'].map(f => document.fonts.load(f))); } catch (e) {}
  tick();
  const ds = distJson.districts;
  Object.assign(D, { storms: stormsJson, expo, districts: ds, byId: Object.fromEntries(ds.map(d => [d.id, d])), impact: impact || [],
    le5Total: ds.reduce((s, d) => s + d.pop_le5, 0), agri, atlas, riversJson, geo: distGeo, slug: n => n.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") });
  D.wet = wet;
  // fish by district rides on the crop machinery: four more "crops", coloured in blue
  const FK = { fish_total: "total", fish_culture: "culture", fish_capture: "capture", fish_shrimp: "shrimp" };
  ds.forEach(d => { const a = agri.districts[d.id]; const f = wet.fish[d.name]; if (a && f) for (const k in FK) a.crops[k] = f[FK[k]]; });
  for (const k in FK) agri.crop_years[k] = wet.fish_year;
  // v13: jute, maize, onion and garlic from the 2024 yearbook (2023-24); bagda and galda farms; ranks among the 64 for every crop
  D.v12 = v12; D.v13 = v13; D.tr = transport; D.rain = rain; D.pop = pop; D.src = source;
  for (const c of ["jute", "maize", "onion", "garlic"]) { ds.forEach(d => { const a = agri.districts[d.id]; if (a) a.crops[c] = v13.crops[c][d.name] || 0; }); agri.crop_years[c] = v13.year; agri.national[c] = v13.nat[c]; }
  ds.forEach(d => { const a = agri.districts[d.id]; if (a) { a.crops.fish_bagda = v13.shrimp.bagda[d.name] || 0; a.crops.fish_galda = v13.shrimp.galda[d.name] || 0; } }); agri.crop_years.fish_bagda = agri.crop_years.fish_galda = v13.year;
  for (const c of Object.keys(agri.national)) { const order = ds.filter(d => agri.districts[d.id]).sort((x, y) => (agri.districts[y.id].crops[c] || 0) - (agri.districts[x.id].crops[c] || 0)); order.forEach((d, i) => { const a = agri.districts[d.id]; a.crop_rank = a.crop_rank || {}; a.crop_rank[c] = i + 1; }); }
  D.ten = rankBy(DEFAULT_RULE).slice(0, 10);
  if (state.gl) buildScene({ hImg, mImg, cImg, cRGB, dImg, far, riversJson, distGeo }); else buildFallback();
  hydrate(); charts.init(D); cards.init(D, { clear: () => clearFocus(true), play: sid => playStorm(sid) });
  buildSteps(); buildExplore(); syncTree(); renderLegends(); buildSearch(); bindUI(); bindToc(); resize();
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
  document.body.classList.add("ready"); state.ready = true; document.fonts?.ready.then(moveTabInk); setTimeout(moveTabInk, 400);
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
  atlasG = buildAtlas(D.atlas, D.riversJson, sampleH, 14); Object.values(atlasG).forEach(g => scene.add(g));
  wetG = buildWet(D.wet); Object.values(wetG).forEach(g => scene.add(g));
  trG = buildTransport(D.tr, sampleH, 14); scene.add(trG);
  healthG = buildHealth(D.pop, sampleH); scene.add(healthG);
  srcG = buildSource(D.src, sampleH, 14); scene.add(srcG); cityG = buildCities(D.src, sampleH, 14); scene.add(cityG);
  rainL = buildRain(D.rain, (lon, lat) => { const px = Math.min(D.idW - 1, Math.floor((lon - GRID.W) / (GRID.E - GRID.W) * D.idW)), py = Math.min(D.idH - 1, Math.floor((GRID.N - lat) / (GRID.N - GRID.S) * D.idH)); return D.idPix[(py * D.idW + px) * 4] > 0; }); scene.add(rainL);
  v12G = buildV12(D.v12, Object.fromEntries(D.districts.map(d => [d.name, d.centroid]))); Object.values(v12G).forEach(g => scene.add(g));
  // the eye of a storm being played: a ring as wide as its wind and a dot that follows the track
  eye = new THREE.Group(); const er = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); er.rotation.x = -Math.PI / 2; er.name = "ring";
  const ed = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); ed.rotation.x = -Math.PI / 2; ed.name = "dot";
  eye.add(er, ed); scene.add(eye);
  applyRule();
  bindMap();
  new ResizeObserver(resize).observe(stage);
}

// ---- themes: what colours and raises the districts ------------------------------------------------------
// rule: the story's cyclone rule (colour = hurricane-force passes, height = people under 5 m);
// landscape: the district's main landscape (colour), rice grown (height); crop: one crop's production (both).
const A = id => (D.agri && D.agri.districts[id]) || null;
const cropOf = (d, c) => (A(d.id) && A(d.id).crops[c]) || 0;
const riceOf = d => cropOf(d, "aman") + cropOf(d, "boro") + cropOf(d, "aus");
const regionOf = d => (A(d.id) && A(d.id).region) || "floodplains";
const isCrop = r => r.theme === "crop";
// the season theme: what is in the ground in a month = the crops whose time in the field covers it (tonnes, jute converted)
const fieldCrops = m => D.v12.calendar.filter(c => inField(c.field, m));
const seasonOf2 = (d, m) => fieldCrops(m).reduce((a, c) => a + cropOf(d, c.crop), 0);
const seasonTop = (d, m) => { let best = null, bv = 0; for (const c of fieldCrops(m)) { const v = cropOf(d, c.crop); if (v > bv) { bv = v; best = c.crop; } } return best; };
let seasonMax = 0;
const rainOf = (d, m) => (D.rain.districts[d.name] || [])[m] || 0;
// v15: people. pop = the district's population in a year (census, between censuses, projected); access = distance to care; burden in 2050
const PD = d => D.pop.districts[d.name];
const popAt = (d, y) => PD(d).pop[clamp(Math.round(y), 1991, 2050) - 1991];
const densAt = (d, y) => popAt(d, y) / PD(d).area;
const accOf = (d, k) => PD(d)[k + "_km"];
const farOf = (d, k) => PD(d)[k + "_far"];
const burdOf = d => PD(d).burden;
let popMax = 0;
function rankBy(rule) {
  if (isCrop(rule)) return D.districts.slice().sort((a, b) => cropOf(b, rule.crop) - cropOf(a, rule.crop));
  if (rule.theme === "landscape") return D.districts.slice().sort((a, b) => riceOf(b) - riceOf(a));
  if (rule.theme === "pop") return D.districts.slice().sort((a, b) => popAt(b, rule.year) - popAt(a, rule.year));
  if (rule.theme === "access") return D.districts.slice().sort((a, b) => accOf(b, state.hk) - accOf(a, state.hk));
  if (rule.theme === "burden") return D.districts.slice().sort((a, b) => burdOf(b) - burdOf(a));
  if (rule.theme === "rain") return D.districts.slice().sort((a, b) => rainOf(b, rule.month || 0) - rainOf(a, rule.month || 0));
  if (rule.theme === "season") return D.districts.slice().sort((a, b) => seasonOf2(b, rule.month || 0) - seasonOf2(a, rule.month || 0));
  return D.districts.filter(d => d.severe >= rule.sevMin).sort((a, b) => b[rule.metric] - a[rule.metric] || b.pop_le5 - a.pop_le5);
}
// crop classes: quintiles of the 64 district values, so every class holds about 13 districts
// shrimp farms sit in a dozen districts and are near zero elsewhere, so quintiles would collapse: fixed classes instead
function cropBreaks(c) { if (c === "fish_shrimp") return [100, 1000, 5000, 30000]; if (c === "fish_bagda" || c === "fish_galda") return [10, 100, 1000, 10000]; const v = D.districts.map(d => cropOf(d, c)).sort(d3.ascending); return [0.2, 0.4, 0.6, 0.8].map(q => d3.quantileSorted(v, q)); }
const rampOf = c => c && c.startsWith("fish") ? FISHR : CROP;
const cropHex = (v, br, c) => rampOf(c)[d3.bisectRight(br, v)];
const OUTC = new THREE.Color(BASE.out);
const HEIGHT = { pop_le5: v => v / 1e6 * 32, pop_le2: v => v / 1e6 * 48, severe: v => v * 7 };
function colourOf(d, r, br) { if (r.theme === "pop") return popHex(densAt(d, r.year)); if (r.theme === "access") return accHex(accOf(d, state.hk), state.hk); if (r.theme === "burden") return burdHex(burdOf(d)); if (r.theme === "rain") return rainHex(rainOf(d, r.month || 0)); if (r.theme === "season") { const t = seasonTop(d, r.month || 0); return t ? SEASONCOL[t] : BASE.out; } return isCrop(r) ? cropHex(cropOf(d, r.crop), br, r.crop) : r.theme === "landscape" ? REGION[regionOf(d)] : d.severe >= r.sevMin ? sevHex(d.severe) : BASE.out; }
function applyRule() {
  const r = state.rule; const list = rankBy(r); D.list = list; const order = new Map(list.map((d, i) => [d.id, i]));
  const br = isCrop(r) ? cropBreaks(r.crop) : null; const cmax = isCrop(r) ? d3.max(D.districts, d => cropOf(d, r.crop)) : d3.max(D.districts, riceOf);
  if (prisms) {
    prisms.children.forEach(m => { const d = D.byId[m.userData.id]; if (!d) return; const q = r.theme !== "rule" || d.severe >= r.sevMin;
      m.userData.q = q; m.userData.rank = order.has(d.id) ? order.get(d.id) : 99;
      if (r.theme === "season" && !seasonMax) for (let k = 0; k < 12; k++) seasonMax = Math.max(seasonMax, d3.max(D.districts, x => seasonOf2(x, k)));
      if (!popMax) popMax = d3.max(D.districts, x => popAt(x, 2050));
      m.userData.h = Math.max(0.3, r.theme === "pop" ? popAt(d, r.year) / popMax * 55 : r.theme === "access" ? farOf(d, state.hk) / 100 * 45 : r.theme === "burden" ? burdOf(d) / 100 * 45 : r.theme === "rain" ? rainOf(d, r.month || 0) / 960 * 50 : r.theme === "season" ? seasonOf2(d, r.month || 0) / seasonMax * 45 : isCrop(r) ? cropOf(d, r.crop) / cmax * 45 : r.theme === "landscape" ? riceOf(d) / cmax * 40 : HEIGHT[r.metric](d[r.metric]));
      m.userData.col = new THREE.Color(colourOf(d, r, br)); });
    ranks.children.forEach(s => { s.material.map.dispose(); s.material.dispose(); }); ranks.clear();
    list.slice(0, r.theme === "rule" ? 10 : 5).forEach((d, i) => { const s = makeLabel(`${i + 1} ${d.name}`, { size: 18, color: BASE.ink, weight: 600 }); s.userData.d = d; s.userData.rank = i; ranks.add(s); });
  }
  if (D.svg) paintFallback();
  renderList(); renderLegends(); showKey(CHAPTERS[state.step]?.id); if (CHAPTERS[state.step]?.id === "crops" && $("secRank")) renderSecRank(); if (CHAPTERS[state.step]?.id === "fishmap") renderFishRank(); if (CHAPTERS[state.step]?.id === "seasons") renderCalNow(); if (CHAPTERS[state.step]?.section === "people") renderPeopleLists(); kick();
}
function setRule(next) { state.rule = { ...state.rule, ...next }; syncTree(); applyRule(); }

// ---- the values on screen ---------------------------------------------------------------------------
function valuesAt(i, t) {
  const ch = CHAPTERS[i]; const v = { ...ch.u, ...ch.layers };
  if (ch.time) v[ch.time.key] = lerp(ch.time.from, ch.time.to, t);
  return v;
}

// ---- steps ------------------------------------------------------------------------------------------
function goStep(i, { push = true, instant = false } = {}) {
  i = clamp(i, 0, ALL - 1); const prev = state.step; state.step = i; const ch = CHAPTERS[i];
  if (!ch.explore && !ch.section) state.lastStory = i;
  if (state.storm && !ch.explore && ch.id !== "cyclones" && ch.id !== "sundarbans") stopStorm();
  if (state.pick && !pickable()) clearFocus(false);
  if (!ch.explore) { const want = { ...DEFAULT_RULE, theme: ch.theme || "rule", ...(ch.crop ? { crop: ch.crop } : {}), ...(ch.theme === "season" || ch.theme === "rain" ? { month: 0 } : {}), ...(ch.theme === "pop" ? { year: 1991 } : {}) };
    if (["theme", "metric", "sevMin", "crop", "month", "year"].some(k => state.rule[k] !== want[k])) { state.rule = want; syncTree(); applyRule(); } }
  // the step's own timeline starts from zero and plays once (in full at once when motion is reduced)
  setTimeline(ch.time || null, { autoplay: !reduced, at: reduced ? 1 : 0 });
  if (ch.time && instant) cur[ch.time.key] = lerp(ch.time.from, ch.time.to, state.tl.t);
  state.ov = {}; stepUI(i); syncLayers(); charts.play?.(ch.id); if (ch.section) openSection(ch);
  if (state.gl) { const p = stepPose(i); if (instant) { copyPose(camT, p); copyPose(cam, p); flight = null; } else if (!state.pick) flyTo(p); }
  if (push && i !== prev) history.pushState(null, "", hashFor()); else history.replaceState(null, "", hashFor());
  $("live").textContent = ch.section ? ch.nav : `Step ${i + 1} of ${N}: ${ch.nav}`;
  kick();
}
const pickable = () => !state.about;   // v13: any district can be picked from any step or section
function stepUI(i) {
  const ch = CHAPTERS[i], ex = !!ch.explore, sec = ch.section || null;
  document.body.classList.toggle("in-section", !!sec); document.body.dataset.sec = sec || "";
  document.querySelectorAll(".sec").forEach(el => { const show = el.dataset.sec === sec; if (show && el.hidden) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } el.hidden = !show; });
  document.querySelectorAll(".tabs button[data-group]").forEach(b => { const on = b.dataset.group === sec; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  moveTabInk();
  document.querySelectorAll("#steps li").forEach((li, n) => { li.classList.toggle("on", n === i); li.classList.toggle("done", n < i); li.querySelector("button").setAttribute("aria-current", n === i ? "step" : "false"); });
  document.querySelectorAll(".cap").forEach(c => c.classList.toggle("vis", c.dataset.ch === ch.id));
  $("storyText").hidden = ex || !!sec; $("explorePanel").hidden = !ex; document.body.classList.toggle("exploring", ex);
  $("modeStory").classList.toggle("on", !ex && !sec); $("modeExplore").classList.toggle("on", ex);
  $("modeStory").setAttribute("aria-selected", !ex && !sec); $("modeExplore").setAttribute("aria-selected", ex);
  $("stepLabel").textContent = sec ? `Atlas · ${SECNAME[sec]}${SECNAME[sec] !== ch.nav ? " · " + ch.nav : ""}` : `Step ${i + 1} of ${N}${ex ? " · Explore" : ""}`;
  $("prevBtn").disabled = i === 0;
  $("nextTxt").textContent = i === 0 ? "Start" : i === EXPLORE ? "Back to the start" : i === EXPLORE - 1 ? "Explore the 64 districts" : (CHAPTERS[i + 1] ? "Next: " + CHAPTERS[i + 1].nav : "");
  $("progFill").style.width = (Math.min(i, N - 1) / (N - 1) * 100) + "%";
  showKey(ch.id);
  if (state.gl) renderer.domElement.style.cursor = "grab";
}
const SECNAME = { sundarbans: "Sundarbans", rivers: "Rivers", wetlands: "Wetlands", fish: "Fish", crops: "Crops", cyclones: "Cyclone tracker", hazards: "Floods and erosion", people: "People" };
// a sliding underline under the active top tab
function moveTabInk() { const ink = $("tabInk"); if (!ink) return; const on = document.querySelector(".tabs button.on"); if (!on || !on.offsetParent) { ink.style.opacity = 0; return; }
  ink.style.opacity = 1; ink.style.transform = `translateX(${on.offsetLeft}px)`; ink.style.width = on.offsetWidth + "px"; }
function buildSteps() {
  const ol = $("steps");
  CHAPTERS.slice(0, N).forEach((ch, i) => { const li = document.createElement("li"); li.innerHTML = `<button type="button"><span class="tile">${icon(STEP_ICON[ch.id] || "question", 18)}</span><span class="t">${ch.nav}</span><span class="n">${String(i + 1).padStart(2, "0")}</span></button>`;
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
  const live = (v.wind > 0.01) || (v.site > 0.01) || state.storm || v.junctions > 0.05 || v.fishrun > 0.05 || v.coastpts > 0.05 || v.birdflow > 0.05 || v.beels > 0.05 || v.birds > 0.05 || v.transport > 0.05 || v.rain > 0.05 || v.health > 0.05 || v.source > 0.05 || v.cities > 0.05 || (v.flow > 0.5 && v.rivers > 0.3) || (v.uSeaLevel > 0.01 || v.uBathy > 0.01);
  if (!(moving || live || interacting || need > 0)) { lastFrame = now; return; }
  need = Math.max(0, need - 1);
  scene.fog.near = cam.d * 1.2; scene.fog.far = cam.d * 3.2;
  // relief
  const U = terrain.uniforms; const time = now / 1000;
  for (const key of ["uSeaLevel", "uRiverGlow", "uFar", "uLowBand", "uSink", "uCoverMix", "uForest", "uWet", "uBuilt", "uLoss", "uBathy"]) U[key].value = v[key];
  U.uExag.value = v.uExag * eExag; U.uCutOn.value = 0; U.uTime.value = time;
  // the overlays were built at 14x; they follow the relief as it rises and lies down
  const ys = Math.max(0.03, eExag * v.uExag / 14); [rivers, farRivers, districts, storms, wind.mesh, labels, site, ...Object.values(atlasG), ...Object.values(wetG), ...Object.values(v12G), trG, healthG, srcG, cityG].forEach(g => g.scale.y = ys);
  // labels step back while the camera flies or the view changes dimension
  const lf = (1 - smoothstep(0, 0.12, P) * smoothstep(1, 0.88, P)) * (1 - 0.85 * fl);
  rivers.children.forEach(o => { if (o.material.uniforms) { o.material.uniforms.uOpacity.value = (o.name === "major" ? 0.9 : 0.45) * v.rivers; o.material.uniforms.uTime.value = time; o.material.uniforms.uFlow.value = v.flow; } else o.material.opacity = v.riverLabels * lf; });
  farRivers.children.forEach(o => { const u = o.material.uniforms; u.uOpacity.value = 0.6 * v.farRivers; u.uTime.value = time; u.uFlow.value = v.flow; });
  labels.children.forEach(s => s.material.opacity = v.labels * lf);
  districts.children.forEach(l => { const sel = l.userData.id === state.pick; l.material.color.setHex(sel ? hex(BASE.ink) : hex(BASE.outline)); l.material.opacity = sel ? 0.95 : 0.55 * v.borders; });
  stormLayer(v, lf); prismLayer(v, P, lf); updateAtlas(atlasG, v, time, lf, 1); updateWet(wetG, v, time, lf); updateV12(v12G, v, time, lf); eyeLayer(time);
  rainL.visible = (v.rain || 0) > 0.01; rainL.material.uniforms.uOp.value = v.rain || 0; if (rainL.visible) rainL.userData.step(time, clamp(v.month || 0, 0, 11.999)); seasonTick(v); popTick(v);
  site.children.forEach(o => { o.material.opacity = v.site * (o.name === "ring" ? 0.45 + 0.45 * Math.sin(time * 2.4) : o.isSprite ? lf : 1); });
  site.children[1].scale.setScalar(1 + 0.25 * Math.sin(time * 2.4));
  readouts(v);
  // labels keep one size on screen
  const sc = camera.position.distanceTo(cam.look) / 1020;
  updateTransport(trG, v.transport || 0, lf, time, sc, CHAPTERS[state.step].id === "transport" ? state.trMode : "all");
  updateHealth(healthG, v.health || 0, time, CHAPTERS[state.step].id === "health" ? state.hk : "all");
  updateSource(srcG, v.source || 0, lf, time, sc, v.srcprog ?? 1, state.srcSel, state.srcGrp); updateCities(cityG, v.cities || 0, lf, time, D.src.city_years, v.cityyear || 2022, state.citySel); cityTick(v);
  const fit = s => { if (s.isSprite && s.userData.base) s.scale.set(s.userData.base.w * sc, s.userData.base.h * sc, 1); };
  Object.values(atlasG).forEach(g => g.visible && g.children.forEach(fit)); Object.values(wetG).forEach(g => g.visible && g.children.forEach(fit)); Object.values(v12G).forEach(g => g.visible && g.children.forEach(fit)); if (trG.visible) trG.children.forEach(fit); if (srcG.visible) srcG.children.forEach(fit); if (cityG.visible) cityG.children.forEach(fit); labels.children.forEach(fit); rivers.children.forEach(fit); ranks.children.forEach(fit); site.children.forEach(fit); storms.children.forEach(s => { if (s.userData.isStormLabel) fit(s); });
  if (state.storm && state.tl.def) { const s = player.storm; const n = s.pts.length; player.t = player.t0 + state.tl.t * (n - 1 - player.t0); syncTimeline(); }
  player.step(); wind.step();
  renderer.render(scene, camera); state.renders += 1; status(vw);
  if (state.frameTimes.length > 400) state.frameTimes.shift(); state.frameTimes.push(now - lastFrame); lastFrame = now;
}

// cyclones: the storm step is a clock run by the timeline; Explore plays the storm the reader picks
// ---- the status bar: scale, where the pointer is, how to move, which way the map faces ------------------------------
let sbLast = "";
function status(vw) {
  const h = stage.clientHeight || 700; const dist = camera.position.distanceTo(cam.look); const kmpx = 2 * dist * Math.tan(FOV / 2 * Math.PI / 180) / h;
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]; const km = nice.filter(n => n / kmpx <= 110).pop() || 1;
  const bear = Math.round(((180 - vw.az) % 360 + 360) % 360), tilt = Math.round(vw.pitch);
  const hint = ["Drag to move", "scroll to zoom", state.dimTarget ? "right-drag to turn and tilt" : "", pickable() ? "click a district for its details" : "", !CHAPTERS[state.step].explore && !isSec(state.step) ? "→ for the next step" : ""].filter(Boolean).join(" · ");
  const key = km + "|" + Math.round(km / kmpx) + "|" + bear + "|" + tilt + "|" + hint + "|" + state.dimTarget;
  if (key === sbLast) return; sbLast = key;
  $("sbBar").style.width = Math.round(km / kmpx) + "px"; $("sbKm").textContent = km + " km";
  $("sbView").textContent = `${state.dimTarget ? "3D" : "2D"} · bearing ${bear}° · tilt ${tilt}°`; $("sbHint").textContent = hint[0].toUpperCase() + hint.slice(1);
}
function statusPointer(x, y, id) {
  const g = groundAt(camera, x, y); if (!g) return;
  const lon = g.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2, lat = -g.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2;
  $("sbPos").textContent = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${lon.toFixed(2)}° E`;
  $("sbDist").textContent = id && D.byId[id] ? D.byId[id].name : "";
}
function stormLayer(v, lf) {
  const yr = v.year, playing = !!state.storm;
  storms.children.forEach(o => {
    const s = o.userData; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-");
    const trk = CHAPTERS[state.step].id === "cyclones"; const sund = CHAPTERS[state.step].id === "sundarbans";
    if (sund && !playing) { const on = s.note && D.v12.sund.storms.includes(s.note.label) && !o.name.startsWith("ring-"); o.material.opacity = on ? v.storms * (o.isSprite ? lf : 0.42) : 0; return; }
    if (playing) { o.material.opacity = s.sid === state.storm ? (o.isSprite ? lf : 0.95) : (trk && !marker && trkPass(s) ? 0.06 : 0); return; }
    const keep = !trk || trkPass(s); const hov = state.hoverStorm;
    // fewer lines that shout: named storms strong, hurricane force medium, the rest a faint thread
    let op = s.season <= yr && keep ? v.storms * (marker ? 0.9 : s.note ? 0.85 : s.peak_kt >= 64 ? 0.5 : 0.09) * (o.isSprite ? lf : 1) : 0;
    if (trk && hov) op = s.sid === hov ? (o.isSprite ? lf : 1) : marker ? 0 : op * 0.12;
    o.material.opacity = op;
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
  rivers: [["", "Rivers"], ["l:" + RIVER.strong, "moving with their flow"], ["#111827", "junction"]],
  source: [["", "How each river reaches the sea"], ["l:" + RSYS.Brahmaputra, "through the Jamuna"], ["l:" + RSYS.Ganges, "through the Padma"], ["l:" + RSYS.Meghna, "through the Meghna"], ["l:" + RSYS.coast, "on its own"], ["o:" + BASE.text, "source"]],
  cities: [["", "City corporations"], [CITYC.fill, "disc: people at the year shown"], ["o:" + BASE.ink, "ring: people in 1991"]],
  fish: [["", "Fish"], ["l:#CC79A7", "hilsa sanctuary"], ["l:#E69F00", "Halda river"], ["#0072B2", "fishing ground"], ["#1f2937", "hilsa moving upriver"]],
  cyclones: [["", "Peak wind on the track"], ["l:" + WIND.major, "96 kt and more"], ["l:" + WIND.hurricane, "64–95 kt"], ["l:" + WIND.gale, "34–63 kt"]],
  floods: [["", "Record flood above danger level"], ["#08306b", "2 m and more"], ["#2171b5", "1–2 m"], ["#6baed6", "0.5–1 m"], ["#c6dbef", "under 0.5 m"]],
  transport: [["", "Getting across"], ["l:" + ROAD.major, "national highway, N1 to N8"], ["l:" + ROAD.minor, "other national highway"], ["l:" + RAIL.line, "railway"], ["l:" + ROAD.bridge, "long bridge"], ["o:" + RAIL.line, "rail junction"]],
  tea: [["", "Tea gardens"], [TEA.fill, "district, disc sized by gardens"]],
  sundarbans: [["", "Sundarbans"], [MANGROVE.fill, "mangrove forest (WorldCover 2021)"], ["l:" + WIND.hurricane, "cyclones that crossed it"]],
  haors: [["", "Wetlands"], [WET.fill, "wet ground, dry season"], [WET.haor, "haor: a circle of its own area"]],
  beels: [["", "Wetlands"], [WET.fill, "wet ground, dry season"], [WET.beel, "beel"], [WET.haor, "haor"]],
  birds: [["", "Winter waterbirds"], [BIRD.site, "site, sized by birds counted"], [BIRD.flow, "birds arriving down the flyways"]],
  erosion: [["", "Land lost since 1973"], ["l:#a63603", "Jamuna"], ["l:#e6550d", "Padma"], ["l:#fd8d3c", "Ganges"], ["#a63603", "coast losing ground"]],
  grow: [["", "Main landscape of the district"], ...REGION_ORDER.map(k => [REGION[k], ""])],
  raise: [[ACCENT, "tidal river management site"]],
  explore: sevKey("below the rule")
};
function cropKey(c) { const br = cropBreaks(c); const f = v => v >= 1e6 ? f1(v / 1e6) + " M" : v < 1000 ? d3.format(",")(Math.round(v)) : d3.format(",")(Math.round(v / 1000)) + "k";
  return [["", CROP_NAME[c] + ", tonnes (" + D.agri.crop_years[c] + ")"], ...rampOf(c).map((col, i) => [col, i === 0 ? "under " + f(br[0]) : i === 4 ? f(br[3]) + " and more" : f(br[i - 1]) + "–" + f(br[i])]).reverse()]; }
const landKey = () => [["", "Main landscape of the district"], ...REGION_ORDER.map(k => [REGION[k], D.agri ? D.agri.regions[k] : k])];
const KP = () => { const hk = state.hk, br = ACC_BR[hk], nm = { uhc: "a health complex or district hospital", dh: "a district hospital", ter: "a tertiary hospital" }[hk];
  return { people: [["", "People per km², colour"], ...POPC.map((c, i) => [c, i === 0 ? "under 800" : i === 4 ? "2,500 and more" : ["800 to 1,100", "1,100 to 1,500", "1,500 to 2,500"][i - 1]]).reverse(), ["", "Height: people"]],
    health: [["", "Average distance to " + nm], ...ACC.map((c, i) => [c, i === 0 ? "under " + br[0] + " km" : i === 4 ? br[3] + " km and more" : br[i - 1] + " to " + br[i] + " km"]).reverse(), ["", "Height: share beyond " + D.pop.access.thresholds[hk] + " km"], [CARE.uhc, "upazila health complex"], ["sq:" + CARE.dh, "district hospital"], ["o:" + CARE.ter, "tertiary hospital"]],
    burden: [["", "Burden in 2050, of 100"], ...BURD.map((c, i) => [c, i === 0 ? "under 40" : i === 4 ? "70 and more" : ["40 to 50", "50 to 60", "60 to 70"][i - 1]]).reverse(), ["", "Height: the same score"]] }; };
function showKey(id) {
  const r = state.rule; const k = id === "people" || id === "health" || id === "burden" ? KP()[id] : id === "rain" ? [["", "Rain this month, mm"], [RAIN[4], "500 and more"], [RAIN[3], "300 to 500"], [RAIN[2], "150 to 300"], [RAIN[1], "50 to 150"], [RAIN[0], "under 50"], ["l:#1e3a8a", "falling rain"]] : id === "seasons" ? [["", "Largest crop in the ground"], ...D.v12.calendar.map(c => [SEASONCOL[c.crop], c.name]), ["", "Height: tonnes in the ground"]] : id === "explore" || id === "crops" || id === "fishmap" ? (isCrop(r) ? cropKey(r.crop) : r.theme === "landscape" ? landKey() : KEYS.explore) : id === "grow" ? landKey() : (KEYS[id] || []);
  $("key").innerHTML = k.map(([c, t]) => !c ? `<div class="kt">${t}</div>` : c.startsWith("r:") ? `<div>${ramp(...c.slice(2).split(","))}${t}</div>` : c.startsWith("o:") ? `<div><i class="o" style="border-color:${c.slice(2)}"></i>${t}</div>` : c.startsWith("sq:") ? `<div><i class="sq" style="background:${c.slice(3)}"></i>${t}</div>` : `<div><i class="${c.startsWith("l:") ? "l" : ""}" style="background:${c.replace("l:", "")}"></i>${t}</div>`).join("");
}
// the same keys, drawn inside the layer tree under the active theme
function renderLegends() {
  if (!D.agri) return; const area = D.agri.area_by_region_ha, tot = d3.sum(Object.values(area));
  const item = (c, t, v = "") => `<div class="li"><i style="background:${c}"></i><span>${t}</span><b>${v}</b></div>`;
  $("lgRule").innerHTML = `<div class="lh">Colour: hurricane-force passes. Height in 3D: ${state.rule.metric === "severe" ? "passes" : "people"}.</div>` + [6, 5, 4, 3].map(n => item(SEV[n], n === 6 ? "6 passes" : n + " passes")).join("") + item(BASE.out, "below the rule");
  $("lgLand").innerHTML = `<div class="lh">Colour: the district's main landscape. Height in 3D: rice grown.</div>` + REGION_ORDER.map(k => item(REGION[k], D.agri.regions[k], Math.round(area[k] / tot * 100) + "% of land")).join("");
  const c = state.rule.crop, br = cropBreaks(c), f = v => v >= 1e6 ? f1(v / 1e6) + " M t" : v < 1000 ? d3.format(",")(Math.round(v)) + " t" : d3.format(",")(Math.round(v / 1000)) + "k t";
  $("lgCrop").innerHTML = `<div class="lh">${CROP_NAME[c]}, ${D.agri.crop_years[c]}, tonnes. ${["fish_shrimp", "fish_bagda", "fish_galda"].includes(c) ? "Five classes." : "Five classes of about 13 districts."}</div>` + rampOf(c).map((col, i) => item(col, i === 0 ? "under " + f(br[0]) : i === 4 ? f(br[3]) + " and more" : f(br[i - 1]) + " to " + f(br[i]))).reverse().join("");
}

// ---- explore: the rule becomes a tool ---------------------------------------------------------------
function buildExplore() {
  const segs = (id, key, attr, parse) => $(id).querySelectorAll("button").forEach(b => b.addEventListener("click", () => setRule({ theme: "rule", [key]: parse(b.dataset[attr]) })));
  segs("metricSeg", "metric", "m", v => v); segs("sevSeg", "sevMin", "s", v => +v);
  $("cropSeg").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setRule({ theme: "crop", crop: b.dataset.c })));
  document.querySelectorAll('input[name="theme"]').forEach(i => i.addEventListener("change", () => setRule({ theme: i.value })));
  const box = $("stormChips");
  D.storms.filter(s => s.note).forEach(s => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.dataset.sid = s.sid; b.innerHTML = `${s.note.label}<small>${s.season}</small>`; b.addEventListener("click", () => playStorm(s.sid)); box.appendChild(b); });
}
// the tree shows the rule in force: the checked theme opens to show its controls and its key
function syncTree() {
  const r = state.rule;
  document.querySelectorAll('input[name="theme"]').forEach(i => { i.checked = i.value === r.theme; i.closest(".theme").classList.toggle("open", i.checked); });
  document.querySelectorAll("#metricSeg button").forEach(b => { const on = b.dataset.m === r.metric; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
  document.querySelectorAll("#sevSeg button").forEach(b => { const on = +b.dataset.s === r.sevMin; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
  document.querySelectorAll("#cropSeg button").forEach(b => { const on = b.dataset.c === r.crop; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
  $("rankHead").textContent = isCrop(r) ? `Top districts for ${CROP_NAME[r.crop].toLowerCase()}` : r.theme === "landscape" ? "Top districts for rice (Aman, Boro, Aus)" : "Districts under the rule";
}
const resetSegs = () => syncTree();
function renderList() {
  const ol = $("rankList"); if (!ol || !D.list) return; const r = state.rule; const list = D.list.slice(0, 15);
  const val = d => isCrop(r) ? cropOf(d, r.crop) : r.theme === "landscape" ? riceOf(d) : d[r.metric]; const max = d3.max(list, val) || 1; const br = isCrop(r) ? cropBreaks(r.crop) : null;
  const t = v => v >= 1e6 ? f1(v / 1e6) + " M t" : v < 1000 ? d3.format(",")(Math.round(v)) + " t" : d3.format(",")(Math.round(v / 1000)) + "k t";
  ol.innerHTML = list.map((d, i) => { const v = r.theme !== "rule" ? t(val(d)) : r.metric === "severe" ? d.severe + " hits" : f1(d[r.metric] / 1e6) + " M";
    const col = r.theme === "rule" ? (i < 10 ? sevHex(d.severe) : BASE.out) : colourOf(d, r, br);
    return `<li data-id="${d.id}" tabindex="0" class="${i === 10 && r.theme === "rule" ? "cut" : ""}${state.pick === d.id ? " on" : ""}"><span class="r">${i + 1}</span><span class="nm">${d.name}</span><span class="v">${v}</span><span class="b"><i style="width:${(val(d) / max * 100).toFixed(1)}%;background:${col}"></i></span></li>`; }).join("")
    + (D.list.length > 15 ? `<li class="more"><span></span><span class="nm" style="font-weight:400;color:#6b7280">${D.list.length - 15} more ${r.theme === "rule" ? "meet the rule" : "districts"}</span></li>` : "")
    + (D.list.length === 0 ? `<li class="more"><span></span><span class="nm">No district meets this rule</span></li>` : "");
  ol.querySelectorAll("li[data-id]").forEach(li => { const go = () => selectDistrict(+li.dataset.id); li.addEventListener("click", go); li.addEventListener("keydown", e => { if (e.key === "Enter") go(); }); });
}

// ---- selection --------------------------------------------------------------------------------------
function selectDistrict(id, { push = true, fly = true } = {}) {
  const d = D.byId[id]; if (!d) return;
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
function markChips() { document.querySelectorAll("#stormChips .chip, #stormList button, #trkList button").forEach(b => b.classList.toggle("on", b.dataset.sid === state.storm)); }
function stopStorm() { state.storm = null; if (player) player.stop(); markChips(); if (CHAPTERS[state.step].time) setTimeline(CHAPTERS[state.step].time, { autoplay: false, at: 1 }); else setTimeline(null); }
function playStorm(sid, { push = true } = {}) {
  const s = D.storms.find(x => x.sid === sid); if (!s) return;
  if (state.step !== EXPLORE && !["cyclones", "sundarbans"].includes(CHAPTERS[state.step].id)) goStep(EXPLORE, { push: false, instant: !state.ready });
  if (state.pick) { state.pick = 0; if (terrain) terrain.uniforms.uPick.value = 0; }
  state.storm = sid; markChips(); cards.showStorm(s); document.body.classList.add("sheet-open");
  const name = s.note ? s.note.label : s.name;
  if (state.gl) {
    player.play(s, storms.children.find(o => o.name === sid));
    const n = s.pts.length; const span = n - 1 - player.t0;
    const d0 = player.t0 * 0.25, d1 = (n - 1) * 0.25;   // days since the first fix, the same count as the wind chart in the sheet
    setTimeline({ key: "_storm", label: `Cyclone ${name}, ${s.season}`, from: d0, to: d1, dur: clamp(span * 0.16, 6, 14), ticks: d3.range(Math.ceil(d0), Math.floor(d1) + 1, Math.max(1, Math.ceil((d1 - d0) / 6))), fmt: x => "day " + x.toFixed(1), tick: x => "day " + x,
      value: () => state.stormTick ? `day ${(state.stormTick.t * 0.25).toFixed(1)} · ${Math.round(state.stormTick.kt)} kt` : "" }, { autoplay: !reduced, at: reduced ? 1 : 0 });
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
// a cyclone track under the pointer, when tracks are on the map (within 22 km of the line between two fixes)
function stormAt(x, y) {
  if ((cur.storms || 0) < 0.3 || !camera) return null; const g = groundAt(camera, x, y); if (!g) return null;
  const lon = g.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2, lat = -g.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2; const id = CHAPTERS[state.step].id;
  const shown = s => id === "cyclones" ? trkPass(s) : id === "sundarbans" ? !!(s.note && D.v12.sund.storms.includes(s.note.label)) : s.season <= (cur.year || 2025);
  let best = null, bd = 22;
  for (const s of D.storms) { if (!shown(s)) continue; const P = s.pts;
    for (let i = 0; i < P.length - 1; i++) { const ax = (P[i][0] - lon) * 102.5, ay = (P[i][1] - lat) * 110.8, bx = (P[i + 1][0] - lon) * 102.5, by = (P[i + 1][1] - lat) * 110.8;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1; const t = clamp(-(ax * dx + ay * dy) / L2, 0, 1); const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < bd) { bd = d; best = s.sid; } } }
  return best;
}
// wetlands: the haor, beel or bird site under the pointer
function wetPick(x, y) { const g = groundAt(camera, x, y); if (!g) return null; const lon = g.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2, lat = -g.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2; return wetAt(D.wet, cur, lon, lat); }
function wetHover(e) {
  if (CHAPTERS[state.step].section !== "wetlands" || !wetG) return false;
  hideTip(); statusPointer(e.clientX, e.clientY, 0); if (interacting) return true;
  const h = wetPick(e.clientX, e.clientY); state.wetHover = h; wetG.haors.userData.highlight(h && h.kind === "haor" ? h.i : null);
  if (h) { const it = h.item;
    tip.innerHTML = h.kind === "haor" ? `<div class="t"><i style="background:${WET.haor}"></i>${it.name}</div><div class="row">area <b>${fmt(it.ha)} ha</b></div><div class="row">${it.upazila.join(", ")}</div><div class="hintline">Click for details</div>`
      : h.kind === "beel" ? `<div class="t"><i style="background:${WET.beel}"></i>${it.name}</div><div class="row">${it.where}</div><div class="hintline">Click for details</div>`
      : `<div class="t"><i style="background:${BIRD.site}"></i>${it.name}</div>${it.counts.length ? `<div class="row">${it.counts[it.counts.length - 1][0]} count <b>${fmt(it.counts[it.counts.length - 1][1])}</b></div>` : `<div class="row">priority site for migrants</div>`}<div class="hintline">Click for details</div>`;
    tip.classList.add("on"); tipXY = [e.clientX, e.clientY]; placeTip(e.clientX, e.clientY); renderer.domElement.style.cursor = "pointer"; }
  else renderer.domElement.style.cursor = "grab";
  kick(); return true;
}
function click(e) {
  if (CHAPTERS[state.step].section === "wetlands") { const h = wetPick(e.clientX, e.clientY); if (!h) return; flyToPlace(h.item.lon, h.item.lat, 0.3, 44);
    if (h.kind === "haor") placeHaor(h.item); else if (h.kind === "beel") placeBeel(h.item); else placeBird(h.item); return; }
  if (!pickable()) return;
  { const st = stormAt(e.clientX, e.clientY); if (st) { playStorm(st); return; } } const id = districtAt(e.clientX, e.clientY);
  if (id) selectDistrict(id); else if (state.pick) clearFocus();
}
// hover: outline lift at once, a tooltip after 120 ms that stays inside the window
let tipTimer = null;
const tip = $("tip");
function hideTip() { clearTimeout(tipTimer); tip.classList.remove("on"); }
function hover(e) {
  if (!terrain) return;
  if (wetHover(e)) return;
  if (!pickable() || interacting) { hideTip(); if (!interacting) statusPointer(e.clientX, e.clientY, districtAt(e.clientX, e.clientY)); return; }
  const id = districtAt(e.clientX, e.clientY); statusPointer(e.clientX, e.clientY, id);
  if (id !== state.hover) { state.hover = id; terrain.uniforms.uHover.value = id; kick(); hideTip(); if (id) tipTimer = setTimeout(() => showTip(id), 120); }
  if (id) { placeTip(e.clientX, e.clientY); renderer.domElement.style.cursor = "pointer"; } else renderer.domElement.style.cursor = "grab";
}
let tipXY = [0, 0];
function showTip(id) {
  const d = D.byId[id]; const r = D.list.findIndex(x => x.id === id); const inTen = r >= 0 && r < 10 && state.rule.theme === "rule";
  if (state.rule.theme === "landscape") { const sh = A(d.id) ? A(d.id).regions : {};
    tip.innerHTML = `<div class="t"><i style="background:${REGION[regionOf(d)]}"></i>${d.name}</div>` + Object.entries(sh).slice(0, 3).map(([k, v]) => `<div class="row">${D.agri.regions[k]} <b>${Math.round(v * 100)}%</b></div>`).join("") + `<div class="row">rice grown <b>${d3.format(",")(Math.round(riceOf(d) / 1000))}k t</b></div><div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  if (state.rule.theme === "pop") { const y = state.rule.year, p = PD(d);
    tip.innerHTML = `<div class="t"><i style="background:${popHex(densAt(d, y))}"></i>${d.name}</div><div class="row">${y}${y > 2025 ? ", projected" : ""} <b>${Mfmt(popAt(d, y))}</b></div><div class="row">people per km² <b>${fmt(Math.round(densAt(d, y)))}</b></div><div class="row">2022 to 2050 <b>${p.growth >= 0 ? "+" : ""}${Math.round(p.growth * 100)}%</b></div><div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  if (state.rule.theme === "access") { const p = PD(d), k = state.hk;
    tip.innerHTML = `<div class="t"><i style="background:${accHex(accOf(d, k), k)}"></i>${d.name}</div><div class="row">first-level care <b>${f1(p.uhc_km)} km</b></div><div class="row">district hospital <b>${f1(p.dh_km)} km</b></div><div class="row">tertiary hospital <b>${f1(p.ter_km)} km</b></div><div class="row" style="color:#6b7280">average for its people, straight line</div><div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  if (state.rule.theme === "burden") { const p = PD(d);
    tip.innerHTML = `<div class="t"><i style="background:${burdHex(p.burden)}"></i>${d.name}</div><div class="row">burden in 2050 <b>${Math.round(p.burden)} · ${p.burden_rank} of 64</b></div><div class="row">people 2050 <b>${Mfmt(popAt(d, 2050))}</b></div><div class="row">per health complex <b>${Mfmt(p.per_uhc50)}</b></div><div class="row">rice per person <b>${p.rice_kg50} kg</b></div><div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  if (state.rule.theme === "rain") { const m = state.rule.month || 0; const v = rainOf(d, m), yr = d3.sum(D.rain.districts[d.name] || []);
    tip.innerHTML = `<div class="t"><i style="background:${rainHex(v)}"></i>${d.name}</div><div class="row">${MONTH[m]} <b>${fmt(v)} mm</b></div><div class="row">a year <b>${fmt(yr)} mm</b></div><div class="row" style="color:#6b7280">estimated from the nearest stations</div><div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  if (state.rule.theme === "season") { const m = state.rule.month || 0; const fc = fieldCrops(m).map(c => [c, cropOf(d, c.crop)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    tip.innerHTML = `<div class="t"><i style="background:${colourOf(d, state.rule)}"></i>${d.name}</div><div class="row">in the ground, ${MONTH[m]}</div>` + fc.slice(0, 4).map(([c, v]) => `<div class="row"><span style="color:${SEASONCOL[c.crop]}">●</span> ${c.name} <b>${fmt(Math.round(v / 1000))}k t</b></div>`).join("") + `<div class="hintline">Click for details</div>`;
    tip.classList.add("on"); placeTip(...tipXY); return; }
  if (isCrop(state.rule)) { const c = state.rule.crop, v = cropOf(d, c), br = cropBreaks(c);
    tip.innerHTML = `<div class="t"><i style="background:${cropHex(v, br, c)}"></i>${d.name}</div><div class="row">${CROP_NAME[c]} <b>${d3.format(",")(Math.round(v))} t</b></div><div class="row">rank among 64 <b>${r + 1}</b></div><div class="hintline">Click for details</div>`;
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
  const p = new URLSearchParams(); if (isSec(state.step)) p.set("sec", CHAPTERS[state.step].id); else p.set("step", state.step + 1); p.set("mode", state.dimTarget ? "3d" : "2d");
  if (state.pick) p.set("id", D.slug(D.byId[state.pick].name));
  if (state.storm) { const s = D.storms.find(x => x.sid === state.storm); p.set("storm", s.note ? D.slug(s.note.label) + "-" + s.season : s.sid); }
  if (state.about) p.set("page", "about");
  return "#" + p.toString();
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)); const out = { step: 0, dim: 1, district: 0, storm: null, about: p.get("page") === "about" };
  const st = p.get("step"); if (st) { const n = parseInt(st, 10); out.step = Number.isFinite(n) ? clamp(n - 1, 0, N - 1) : Math.max(0, CHAPTERS.findIndex(c => c.id === st)); }
  const sc = p.get("sec"); if (sc) { const k = CHAPTERS.findIndex(c => c.id === sc && c.section); if (k >= 0) out.step = k; }
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
function dismissHint() {}
let helpReturn = null;
function openHelp() { helpReturn = document.activeElement; $("help").hidden = false; $("helpClose").focus(); }
function closeHelp() { $("help").hidden = true; helpReturn?.focus?.(); }
function setCollapsed(c) { document.body.classList.toggle("collapsed", c); $("expandBtn").hidden = !c; $("collapseBtn").setAttribute("aria-expanded", !c); setTimeout(() => { resize(); if (state.gl && !state.pick && !state.storm) flyTo(stepPose(state.step), 600); }, 300); }
function toggleFs() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
function resetNorth() { if (!state.gl) return; const p = clonePose(camT); p.az = 180; p.pitch = state.dimTarget ? 45 : p.pitch; flyTo(p, 800); }
function bindUI() {
  $("prevBtn").addEventListener("click", prevStep); $("nextBtn").addEventListener("click", next);
  $("modeStory").addEventListener("click", () => { if (state.step === EXPLORE || isSec(state.step)) goStep(state.lastStory); });
  document.querySelectorAll(".tabs button[data-sec]").forEach(b => b.addEventListener("click", () => { showAbout(false); goStep(CHAPTERS.findIndex(c => c.id === b.dataset.sec)); }));
  bindSections();
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
  $("helpBtn").addEventListener("click", openHelp); $("helpClose").addEventListener("click", closeHelp);
  $("help").addEventListener("click", e => { if (e.target.id === "help") closeHelp(); });
  $("collapseBtn").addEventListener("click", () => setCollapsed(true)); $("expandBtn").addEventListener("click", () => setCollapsed(false));
  $("shareBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch (e) { toast("Copy the link from the address bar"); } });
  // the wheel over the story panel moves between steps; over the explore list it scrolls the list
  let acc = 0, lock = 0;
  $("panel").addEventListener("wheel", e => {
    if (phone() || state.step === EXPLORE || isSec(state.step)) return;
    e.preventDefault(); const now = performance.now(); if (now < lock) return;
    acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; if (Math.abs(acc) < 40) return;
    if (acc > 0 && state.step < EXPLORE) next(); else if (acc < 0 && state.step > 0) prevStep();
    acc = 0; lock = now + 700;
  }, { passive: false });
  addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("layersPop").hidden) { toggleLayers(false); $("layersBtn").focus(); return; }
    if (e.key === "Escape" && !$("stormPop").hidden) { toggleStorms(false); $("stormBtn").focus(); return; }
    if (e.target.closest && e.target.closest("input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable]")) return;
    if (!$("help").hidden) { if (e.key === "Escape" || e.key === "?") closeHelp(); return; }
    if (state.about) { if (e.key === "Escape") showAbout(false); return; }
    if (!$("layersPop").hidden && e.key === "Escape") { toggleLayers(false); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (isSec(state.step) && /Arrow|Page/.test(k)) return;
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

// ---- the atlas sections: panels, lists that fly the map, charts that draw in ---------------------------------
function flyToPlace(lon, lat, span = 0.6, pitch = 42) { if (!state.gl) return; const p = fitView({ box: [lon - span, lat - span * 0.8, lon + span, lat + span * 0.8], top: 20, pitch, az: 190 }, state.dimTarget ? pitch : 0, state.dimTarget ? 190 : 180); p.pitch = pitch; p.az = 190; flyTo(p); }
const place = (o) => { cards.showPlace(o); document.body.classList.add("sheet-open"); kick(); };
function openSection(ch) {
  const A = D.atlas; if (!A) return;
  if (ch.section === "rivers") { document.querySelectorAll("#rivSeg button").forEach(b => b.classList.toggle("on", b.dataset.r === ch.id)); document.querySelectorAll(".rpane").forEach(p => p.hidden = p.dataset.r !== ch.id); }
  if (ch.id === "rivers") drawMerge($("chMerge"), A);
  if (ch.id === "source") { srcCh = drawSourceStrips($("chSource"), D.src, state, pickRiver); syncSrc(); }
  if (ch.id === "transport") { drawBridges($("chBridges")); showTrMode(state.trMode); }
  if (ch.id === "fish") showFish(state.fishTab === "district" ? "hilsa" : state.fishTab);
  if (ch.id === "fishmap") { showFish("district"); syncFishMetric(); renderFishRank(); drawFishNational($("chFishNat"), D.wet); drawFishSpecies($("chFishSp"), D.wet); }
  if (ch.section === "crops") { document.querySelectorAll("#cropSegTop button").forEach(b => b.classList.toggle("on", b.dataset.k === ch.id)); document.querySelectorAll(".kpane").forEach(p => p.hidden = p.dataset.k !== ch.id); }
  if (ch.id === "crops") { drawGrow2(); renderSecRank(); }
  if (ch.id === "seasons") { cal = drawCalendar($("chCal"), D.v12, m => { state.tl.t = m / 11.999; state.tl.playing = false; syncTimeline(); kick(); }); cal.move(0); renderCalNow(); }
  if (ch.id === "tea") { drawTea($("chTea"), D.v12); drawTeaOut($("chTeaOut"), D.v12); }
  if (ch.id === "sundarbans") { drawTigers($("chTiger"), D.v12); drawSundFish($("chSundFish"), D.v12); }
  if (ch.section === "wetlands") { state.wetTab = ch.id; document.querySelectorAll("#wetSeg button").forEach(b => b.classList.toggle("on", b.dataset.w === ch.id)); document.querySelectorAll(".wpane").forEach(p => p.hidden = p.dataset.w !== ch.id);
    if (ch.id === "haors") drawHaorDistricts($("chHaorD"), D.wet);
    if (ch.id === "birds") drawBirds($("chBirds"), D.wet, s => { flyToPlace(s.lon, s.lat, 0.35, 44); placeBird(s); }); }
  if (ch.id === "cyclones") showTrk(state.trk.view);
  if (ch.section === "people") { document.querySelectorAll("#popSeg button").forEach(b => b.classList.toggle("on", b.dataset.p === ch.id)); document.querySelectorAll(".ppane").forEach(p => p.hidden = p.dataset.p !== ch.id);
    if (ch.id === "people") { popCh = drawPopNat($("chPopNat"), D.pop, y => { state.tl.t = (y - 1991) / 59; state.tl.playing = false; syncTimeline(); kick(); }); popText(1991); }
    if (ch.id === "cities") { cityCh = drawCityBars($("chCities"), D.src, pickCity); cityCh.mark(state.citySel); state.cityYr = 0; }
    if (ch.id === "health") { showHk(state.hk); drawCatch($("chCatch"), D.pop, c => { const t = D.pop.access.ter.find(x => x[3] === c.name || (c.district === "Dhaka" && x[2] === "Dhaka")); if (t) flyToPlace(t[0], t[1], 0.5, 42); }); }
    renderPeopleLists(); }
  if (ch.section === "hazards") { state.haz = ch.id; document.querySelectorAll("#hazSeg button").forEach(b => b.classList.toggle("on", b.dataset.h === ch.id)); document.querySelectorAll(".hpane").forEach(p => p.hidden = p.dataset.h !== ch.id);
    if (ch.id === "floods") drawFloodYears($("chFlood"), A);
    if (ch.id === "rain") { rainCh = drawRainYear($("chRainYear"), D.rain, m => { state.tl.t = m / 11.999; state.tl.playing = false; syncTimeline(); kick(); }); rainCh.move(0); rainText(0); drawRainYears($("chRainYears"), D.rain); }
    if (ch.id === "erosion") drawErosion($("chEro"), A); }
}
// ---- cyclone tracker: a list you can filter, a clock of the seasons ------------------------------------------
const stormName = s => s.note ? s.note.label : (s.name && s.name !== "NOT_NAMED" ? s.name[0] + s.name.slice(1).toLowerCase() : "Unnamed");
const impactOf = s => s.note ? (D.impact.find(r => r.year === s.season && r.name.toLowerCase().includes(s.note.label.toLowerCase().split(" ")[0])) || {}) : {};
const trkPass = s => { const t = state.trk; if (t.k && s.peak_kt < t.k) return false; if (state.season !== "all" && seasonOf(monthOf(s)) !== state.season) return false;
  if (t.q) { const q = t.q.toLowerCase().trim(); if (!(stormName(s).toLowerCase().includes(q) || String(s.season).includes(q))) return false; } return true; };
function showTrk(v) { state.trk.view = v; document.querySelectorAll("#trkView button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); document.querySelectorAll(".tpane").forEach(p => p.hidden = p.dataset.v !== v);
  if (v === "list") renderTrk(); else { drawClock($("chClock"), D.storms.filter(trkPass), sid => playStorm(sid)); drawDecades($("chDecade"), D.storms.filter(trkPass)); } kick(); }
function renderTrk() {
  const list = D.storms.filter(trkPass).sort((a, b) => state.trk.sort * (a.season - b.season || a.sid.localeCompare(b.sid)));
  $("trkCount").textContent = `${list.length} of ${D.storms.length} storms`; $("trkSort").textContent = state.trk.sort < 0 ? "Newest first" : "Oldest first";
  const mon = s => { const d = new Date(s.start + "T00:00:00Z"); return isNaN(d) ? "" : d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }); };
  $("trkList").innerHTML = list.map(s => { const im = impactOf(s); const deaths = im.deaths != null ? fmt(im.deaths) + " deaths" : "";
    return `<li><button type="button" data-sid="${s.sid}" class="${state.storm === s.sid ? "on" : ""}" style="color:${windHex(s.peak_kt)}"><i class="sw" style="background:${windHex(s.peak_kt)}"></i><span class="nm"><b>${stormName(s)}</b><small>${mon(s)} ${s.season} · ${s.peak_kt} kt${deaths ? " · " + deaths : ""}</small></span>${sparkKt(s)}</button></li>`; }).join("") || `<li class="empty">No storm matches.</li>`;
  $("trkList").querySelectorAll("button").forEach(b => { b.addEventListener("click", () => playStorm(b.dataset.sid));
    b.addEventListener("pointerenter", () => { state.hoverStorm = b.dataset.sid; kick(); }); b.addEventListener("pointerleave", () => { state.hoverStorm = null; kick(); });
    b.addEventListener("focus", () => { state.hoverStorm = b.dataset.sid; kick(); }); b.addEventListener("blur", () => { state.hoverStorm = null; kick(); }); });
}
function eyeLayer(time) {
  const t = state.storm && state.stormTick; eye.visible = !!t; if (!t) return; const p = toScene(t.lon, t.lat); const r = 6 + t.kt / 6;
  eye.position.set(p.x, 2.2, p.z); const ring = eye.getObjectByName("ring"), dot = eye.getObjectByName("dot"); const c = new THREE.Color(windHex(t.kt));
  ring.material.color.copy(c); dot.material.color.copy(c); ring.scale.setScalar(r * (1 + 0.06 * Math.sin(time * 5))); dot.scale.setScalar(2.2);
  ring.material.opacity = 0.9; dot.material.opacity = 1;
}
// ---- bridges: one bar per bridge, longest first; click to fly there ---------------------------------------------
function drawBridges(el) {
  const B = D.tr.bridges; el.innerHTML = ""; const w = Math.max(280, el.clientWidth || 340), rowH = 26, x0 = 170; const x = d3.scaleLinear().domain([0, d3.max(B, b => b.km)]).range([0, w - x0 - 56]);
  const short = n => { n = n.replace(/ \(.*\)/, "").replace(" Multipurpose", "").replace("First Bangladesh-China Friendship", "China Friendship"); return n.length > 24 ? n.slice(0, 23) + "…" : n; };
  const s = d3.select(el).append("svg").attr("width", w).attr("height", B.length * rowH + 4).attr("font-family", "IBM Plex Sans, sans-serif");
  B.forEach((b, i) => { const g = s.append("g").attr("transform", `translate(0,${i * rowH})`).style("cursor", "pointer").on("click", () => { flyToPlace(b.lon, b.lat, 0.12, 50); place({ eyebrow: b.tunnel ? "Tunnel" : b.rail ? "Rail bridge" : "Road bridge", dot: ROAD.bridge, title: b.name, sub: `about ${b.km.toFixed(2)} km as mapped`, body: `<p class="src">${D.tr.src} The length is that of the bridge's way in OpenStreetMap, which can include part of the approach.</p>` }); });
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", w).attr("height", rowH - 2).attr("fill", "transparent");
    g.append("text").attr("x", 0).attr("y", 16).attr("font-size", 12.5).attr("font-weight", i < 3 ? 600 : 500).attr("fill", BASE.ink).text(short(b.name)).append("title").text(b.name);
    g.append("rect").attr("x", x0).attr("y", 6).attr("height", 12).attr("rx", 2).attr("width", 0).attr("fill", b.rail ? RAIL.line : ROAD.major).transition().delay(i * 50 * (reduced ? 0 : 1)).duration(reduced ? 0 : 700).attr("width", x(b.km));
    g.append("text").attr("x", x0 + 6 + x(b.km)).attr("y", 16).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", BASE.ink).text(b.km.toFixed(1) + " km"); });
}
// ---- rain ------------------------------------------------------------------------------------------------
function rainText(m) { $("rainMonth").textContent = MONTH[m]; $("rainMm").textContent = D.rain.national[m] + " mm"; }
function showTrMode(mode) { state.trMode = mode; document.querySelectorAll("#trMode button").forEach(b => b.classList.toggle("on", b.dataset.m === mode)); document.querySelectorAll(".tm").forEach(p => p.hidden = p.dataset.m !== mode);
  $("chBridges").style.display = mode === "all" || mode === "bridges" ? "" : "none";
  const jv = mode === "all" || mode === "rails" ? "" : "none"; $("jctChips").style.display = jv; $("jctChips").previousElementSibling.style.display = jv;
  if (mode === "roads") drawRoadLengths($("chRoads")); kick(); }
function drawRoadLengths(el) {
  const km = {}; D.tr.roads.filter(r => r.c === "N").forEach(r => { let L = 0; for (let i = 0; i < r.p.length - 1; i++) L += Math.hypot((r.p[i + 1][0] - r.p[i][0]) * 102.5, (r.p[i + 1][1] - r.p[i][1]) * 110.8); km[r.r] = (km[r.r] || 0) + L; });
  const rows = Object.entries(km).sort((a, b) => a[0].localeCompare(b[0])); el.innerHTML = ""; const w = Math.max(280, el.clientWidth || 340); const x = d3.scaleLinear().domain([0, d3.max(rows, r => r[1])]).range([0, w - 110]);
  const s = d3.select(el).append("svg").attr("width", w).attr("height", rows.length * 24 + 4).attr("font-family", "IBM Plex Sans, sans-serif");
  rows.forEach(([r, v], i) => { const y = i * 24; s.append("text").attr("x", 0).attr("y", y + 15).attr("font-size", 13).attr("font-weight", 700).attr("fill", ROAD.major).text(r);
    s.append("rect").attr("x", 40).attr("y", y + 5).attr("height", 12).attr("rx", 2).attr("fill", ROAD.major).attr("width", 0).transition().delay(i * 60 * (reduced ? 0 : 1)).duration(reduced ? 0 : 700).attr("width", x(v));
    s.append("text").attr("x", 46 + x(v)).attr("y", y + 15).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", BASE.ink).text(Math.round(v) + " km"); });
}
// ---- the year in the fields --------------------------------------------------------------------------------
function seasonTick(v) {
  const id = CHAPTERS[state.step].id; if (!((id === "seasons" && state.rule.theme === "season") || (id === "rain" && state.rule.theme === "rain"))) return;
  const mv = clamp(v.month || 0, 0, 11.999); (id === "rain" ? rainCh : cal)?.move(mv);
  const m = Math.floor(mv); if (state.rule.month !== m) { state.rule.month = m; applyRule(); if (id === "rain") rainText(m); }
}
// ---- source to sea, and the city corporations ------------------------------------------------------------------
function flyBox(box, pitch = 22, az = 180) { if (!state.gl) return; const p = fitView({ box, top: 8, pitch, az }, state.dimTarget ? pitch : 0, state.dimTarget ? az : 180); p.pitch = pitch; p.az = az; flyTo(p); }
function syncSrc() {
  document.querySelectorAll("#srcGrp button").forEach(b => b.classList.toggle("on", (b.dataset.g || null) === (state.srcSel ? "-" : state.srcGrp)));
  srcCh?.mark(state.srcSel, state.srcGrp); const r = D.src.rivers.find(x => x.name === state.srcSel);
  $("srcCard").innerHTML = r ? sourceCard(r) : ""; if (r) $("live").textContent = `${r.name}, ${fmt(r.km)} kilometres from source to sea`;
}
function replaySrc() { const ch = CHAPTERS[state.step]; if (ch.id === "source") setTimeline(ch.time, { autoplay: !reduced, at: reduced ? 1 : 0 }); kick(); }
function pickRiver(name) {
  state.srcSel = state.srcSel === name ? null : name; state.srcGrp = null; syncSrc(); const r = D.src.rivers.find(x => x.name === state.srcSel); const v = CHAPTERS[state.step].view;
  if (r) { flyBox(riverBox(r), 20); $("srcCard").scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); } else flyBox(v.box, v.pitch, v.az); replaySrc();
}
function pickGroup(g) { state.srcGrp = state.srcGrp === g ? null : g; state.srcSel = null; syncSrc(); const v = CHAPTERS[state.step].view; flyBox(v.box, v.pitch, v.az); replaySrc(); }
function cityTick(v) {
  if (CHAPTERS[state.step].id !== "cities") return; const y = clamp(v.cityyear || 2022, 1991, 2022); cityCh?.move(y);
  const yr = Math.round(y); if (state.cityYr !== yr) { state.cityYr = yr; const S = D.src, tot = d3.sum(S.cities, c => cityPop(c, S.city_years, yr)), cen = D.pop.national.census.find(c => c[0] === yr);
    $("cityYear").textContent = yr; $("cityN").textContent = f1(tot / 1e6) + " million";
    $("cityWhat").textContent = cen ? `in the twelve city corporations: ${Math.round(tot / cen[1] * 100)}% of the ${f1(cen[1] / 1e6)} M people the census counted` : "in the twelve city corporations, between censuses"; }
}
function pickCity(c) {
  state.citySel = state.citySel === c.name ? null : c.name; cityCh?.mark(state.citySel); kick();
  if (!state.citySel) { const v = CHAPTERS[state.step].view; flyBox(v.box, v.pitch, v.az); return; }
  flyToPlace(c.lon, c.lat, 0.42, 30); const yrs = D.src.city_years, mx = Math.max(...c.pop);
  const bars = yrs.map((y, i) => { const h = Math.round(c.pop[i] / mx * 96); return `<g transform="translate(${i * 78},0)"><rect class="cb" x="8" y="${112 - h}" width="46" height="${h}" rx="2" fill="${CITYC.fill}" stroke="${CITYC.edge}" stroke-width="0.8" style="animation-delay:${i * 90}ms"/><text x="31" y="${106 - h}" text-anchor="middle" font-size="11.5" font-family="IBM Plex Mono" fill="${BASE.ink}">${c.pop[i] >= 1e6 ? f1(c.pop[i] / 1e6) + " M" : fmt(Math.round(c.pop[i] / 1000)) + "k"}</text><text x="31" y="128" text-anchor="middle" font-size="11.5" font-family="IBM Plex Mono" fill="${BASE.dim}">${y}</text></g>`; }).join("");
  const k = c.pop[3] / c.pop[0], last = (c.pop[3] / c.pop[2] - 1) * 100;
  place({ eyebrow: "City corporation", dot: CITYC.fill, title: c.name, sub: `${c.district} district · city corporation since ${c.since}`,
    body: `<div class="stats3"><div><b>${fmt(c.pop[3])}</b><span>people, census 2022</span></div><div><b>×${k.toFixed(1)}</b><span>since 1991, same limits</span></div><div><b>${last >= 0 ? "+" : "−"}${Math.abs(last).toFixed(0)}%</b><span>2011 to 2022</span></div></div>
      <div class="tsec">People at each census</div><svg class="citybars" viewBox="0 0 312 132" width="100%" role="img" aria-label="People at each census">${bars}</svg><p class="src">${D.src.src.cities}</p>` });
}
// ---- people ------------------------------------------------------------------------------------------------
function popTick(v) {
  if (CHAPTERS[state.step].id !== "people" || state.rule.theme !== "pop") return;
  const y = clamp(Math.round(v.popyear || 2022), 1991, 2050); popCh?.move(v.popyear || 2022);
  if (state.rule.year !== y) { state.rule.year = y; applyRule(); popText(y); }
}
function popText(y) {
  const P = D.pop.national; const n = popCh ? popCh.at(y) : 0; const cen = P.census.find(c => c[0] === y);
  $("popYear").textContent = y; $("popN").textContent = f1(n / 1e6) + " million";
  $("popWhat").textContent = y > 2025 ? "projected by this model" : cen ? `World Bank estimate; the census counted ${f1(cen[1] / 1e6)} M` : "World Bank estimate";
  const tot = d3.sum(D.districts, d => popAt(d, y)); const top = D.list.slice(0, 3).map(d => d.name).join(", ");
  $("popTop").textContent = `Most people: ${top}. The 64 districts add up to ${f1(tot / 1e6)} M.`;
}
function showHk(k) { state.hk = k; document.querySelectorAll("#hkSeg button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
  const A = D.pop.access.national, th = D.pop.access.thresholds; const far = { uhc: A.uhc_far, dh: A.dh_far, ter: A.ter_far }[k], km = { uhc: A.uhc_km, dh: A.dh_km, ter: A.ter_km }[k];
  const nm = { uhc: "an upazila health complex or district hospital", dh: "a district hospital", ter: "a tertiary hospital" }[k];
  $("hkFar").textContent = Math.round(far) + "%"; $("hkTxt").textContent = `of people live more than ${th[k]} km from ${nm}, in a straight line. On average the nearest is ${f1(km)} km away.`;
  if (state.rule.theme === "access") applyRule(); kick(); }
function renderPeopleLists() {
  const id = CHAPTERS[state.step].id; const P = D.pop; const li = (d, v, w, col) => `<li data-id="${d.id}" tabindex="0"><span class="r"></span><span class="nm">${d.name}</span><span class="v">${v}</span><span class="b"><i style="width:${(w * 100).toFixed(1)}%;background:${col}"></i></span></li>`;
  const bind = el => el.querySelectorAll("li[data-id]").forEach(x => x.addEventListener("click", () => selectDistrict(+x.dataset.id)));
  if (id === "people") { const g = D.districts.slice().sort((a, b) => PD(b).growth - PD(a).growth); const mx = PD(g[0]).growth;
    $("popGrow").innerHTML = g.slice(0, 8).map(d => li(d, "+" + Math.round(PD(d).growth * 100) + "%", PD(d).growth / mx, CARE.proj)).join("");
    $("popSlow").innerHTML = g.slice(-6).reverse().map(d => li(d, (PD(d).growth >= 0 ? "+" : "") + Math.round(PD(d).growth * 100) + "%", Math.max(0.02, PD(d).growth / mx), "#bfd3e6")).join("");
    bind($("popGrow")); bind($("popSlow")); }
  if (id === "health") { const k = state.hk; const l = D.list.slice(0, 10); const mx = accOf(l[0], k);
    $("hkHead").textContent = "Farthest from " + { uhc: "first-level care", dh: "a district hospital", ter: "tertiary care" }[k] + ", average km";
    $("hkList").innerHTML = l.map(d => li(d, f1(accOf(d, k)) + " km", accOf(d, k) / mx, accHex(accOf(d, k), k))).join(""); bind($("hkList")); }
  if (id === "burden") { const l = D.list.slice(0, 12);
    const parts = [["b_growth", "growth to 2050"], ["b_per_uhc", "people per health complex"], ["b_dh", "distance to district hospital"], ["b_ter", "distance to tertiary care"], ["b_food", "rice per person"]];
    $("burdList").innerHTML = l.map((d, i) => { const p = PD(d); return `<li data-id="${d.id}" tabindex="0"><span class="r">${i + 1}</span><span class="nm">${d.name}</span><span class="v">${Math.round(p.burden)}</span><span class="parts">${parts.map(([k, t]) => `<i title="${t}: ${p[k]} of 100" style="width:${p[k] / 5}%;background:${burdHex(p[k])}"></i>`).join("")}</span></li>`; }).join("");
    bind($("burdList"));
    const food = D.districts.slice().sort((a, b) => PD(a).rice_kg50 - PD(b).rice_kg50).slice(0, 8); const fm = d3.max(food, d => PD(d).rice_kg22);
    $("foodList").innerHTML = food.map(d => `<li data-id="${d.id}" tabindex="0"><span class="r"></span><span class="nm">${d.name}</span><span class="v">${PD(d).rice_kg22} → ${PD(d).rice_kg50} kg</span><span class="b"><i style="width:${PD(d).rice_kg50 / fm * 100}%;background:${BURD[3]}"></i></span></li>`).join(""); bind($("foodList")); }
}
function renderCalNow() {
  const m = state.rule.month || 0; $("calMonth").textContent = MONTH[m]; $("calHead").textContent = `In the ground in ${MONTH[m]}`;
  const rows = fieldCrops(m).map(c => [c, d3.sum(D.districts, d => cropOf(d, c.crop))]).sort((a, b) => b[1] - a[1]); const max = d3.max(D.v12.calendar, c => d3.sum(D.districts, d => cropOf(d, c.crop)));
  $("calNow").innerHTML = rows.map(([c, t]) => `<li><i style="background:${SEASONCOL[c.crop]}"></i><span><b>${c.name}</b><small>${c.sow}; harvest ${c.harvest}</small></span><span class="v">${t >= 1e6 ? f1(t / 1e6) + " M t" : fmt(Math.round(t / 1000)) + "k t"}</span><em style="width:${(t / max * 100).toFixed(1)}%;background:${SEASONCOL[c.crop]}"></em></li>`).join("") || `<li class="empty">Few of the six crops are in the ground this month.</li>`;
}
// ---- fish by district ----------------------------------------------------------------------------------
function syncFishMetric() { document.querySelectorAll("#fishMetric button").forEach(b => b.classList.toggle("on", b.dataset.c === state.rule.crop)); }
function renderFishRank() {
  const r = state.rule; if (!isCrop(r) || !r.crop.startsWith("fish")) return; const c = r.crop; const list = D.list.slice(0, 10); const br = cropBreaks(c); const max = cropOf(list[0], c) || 1;
  const t = v => v >= 1e6 ? f1(v / 1e6) + " M t" : v < 1000 ? fmt(Math.round(v)) + " t" : fmt(Math.round(v / 1000)) + "k t";
  $("fishRankHead").textContent = `Top districts: ${CROP_NAME[c].toLowerCase()}`;
  $("fishRank").innerHTML = list.map((d, i) => `<li data-id="${d.id}" tabindex="0"><span class="r">${i + 1}</span><span class="nm">${d.name}</span><span class="v">${t(cropOf(d, c))}</span><span class="b"><i style="width:${(cropOf(d, c) / max * 100).toFixed(1)}%;background:${cropHex(cropOf(d, c), br, c)}"></i></span></li>`).join("");
  $("fishRank").querySelectorAll("li").forEach(li => li.addEventListener("click", () => selectDistrict(+li.dataset.id)));
  $("lgFish").innerHTML = $("lgCrop").innerHTML;
}
// ---- wetlands: cards for a haor, a beel, a bird site -----------------------------------------------------
function placeHaor(h) {
  place({ eyebrow: "Haor · " + h.district.join(", "), dot: WET.haor, title: h.name, sub: h.upazila.join(", ") + " upazila" + (h.upazila.length > 1 ? "s" : ""),
    body: `<div class="stats"><div><b>${fmt(h.ha)} ha</b><span>area</span></div><div><b>${f1(h.ha / 100)} km²</b><span>the circle on the map</span></div><div><b>${1 + D.wet.haors.indexOf(h)}</b><span>by size, of ${D.wet.haors.length}</span></div></div><p class="src">${D.wet.haor_src} ${D.wet.haor_place}</p>` });
}
function placeBeel(b) {
  place({ eyebrow: "Beel", dot: WET.beel, title: b.name, sub: b.where, body: `<p>${b.note}</p>` + (b.facts.length ? `<table>${b.facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>` : "") + `<p class="src">${D.wet.beel_src} The marker is placed in the middle of the named upazilas and is approximate.</p>` });
}
function placeBird(s) {
  const last = s.counts.length ? s.counts[s.counts.length - 1] : null;
  place({ eyebrow: s.kind === "coast" ? "Coastal site for migrants" : "Waterbird count", dot: BIRD.site, title: s.name, sub: last ? `${fmt(last[1])} waterbirds counted in ${last[0]}` : "Priority site, Regional Flyway Initiative",
    body: (s.counts.length ? `<table>${s.counts.map(([y, n]) => `<tr><td>${y}</td><td>${fmt(n)}</td></tr>`).join("")}</table>` : "") + `<p>${s.species}</p><p class="src">${s.src}</p>` });
}
function showFish(t) { state.fishTab = t; $("fishH").textContent = t === "district" ? "Fish by district" : "Hilsa, the Halda and the sea"; document.querySelectorAll("#fishSeg button").forEach(b => b.classList.toggle("on", b.dataset.f === t)); document.querySelectorAll(".fpane").forEach(p => p.hidden = p.dataset.f !== t);
  const A = D.atlas; if (t === "hilsa") drawHilsa($("chHilsa"), A); if (t === "halda") drawHalda($("chHalda"), A); }
function drawGrow2() { const el = $("chGrow2"); if (!el) return; const src = $("chGrow"); el.innerHTML = src ? src.innerHTML : ""; }
function renderSecRank() {
  const r = state.rule, list = D.list.slice(0, 10), t = v => v >= 1e6 ? f1(v / 1e6) + " M t" : v < 1000 ? d3.format(",")(Math.round(v)) + " t" : d3.format(",")(Math.round(v / 1000)) + "k t";
  const val = d => isCrop(r) ? cropOf(d, r.crop) : riceOf(d); const max = d3.max(list, val) || 1; const br = isCrop(r) ? cropBreaks(r.crop) : null;
  $("secRankHead").textContent = isCrop(r) ? `Top districts for ${CROP_NAME[r.crop].toLowerCase()}` : "Top districts for rice (Aman, Boro, Aus)";
  $("secRank").innerHTML = list.map((d, i) => `<li data-id="${d.id}" tabindex="0"><span class="r">${i + 1}</span><span class="nm">${d.name}</span><span class="v">${t(val(d))}</span><span class="b"><i style="width:${(val(d) / max * 100).toFixed(1)}%;background:${colourOf(d, r, br)}"></i></span></li>`).join("");
  $("secRank").querySelectorAll("li").forEach(li => li.addEventListener("click", () => selectDistrict(+li.dataset.id)));
  const leg = $(isCrop(r) ? "lgCrop" : "lgLand"); $("lgSec").innerHTML = leg ? leg.innerHTML : "";
}
function bindSections() {
  const A = D.atlas; if (!A) return; const fmt = d3.format(",");
  // wetlands
  const W = D.wet; $("haorN").textContent = W.haor_total.n; $("haorKm").textContent = fmt(Math.round(W.haor_total.ha / 100)) + " km²";
  document.querySelectorAll("#wetSeg button").forEach(b => b.addEventListener("click", () => goStep(CHAPTERS.findIndex(c => c.id === b.dataset.w))));
  const top = W.haors.slice(0, 12); const hmax = top[0].ha;
  $("haorList").innerHTML = top.map((h, i) => `<li><button type="button" data-i="${i}"><span class="pi sw round" style="background:${WET.haor}"></span><span><b>${h.name}</b><small>${h.upazila.join(", ")} · ${h.district.join(", ")}</small></span><span class="pv">${fmt(h.ha)} ha</span></button><i class="bar teal" style="width:${h.ha / hmax * 100}%"></i></li>`).join("");
  $("haorList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const h = top[+b.dataset.i]; flyToPlace(h.lon, h.lat, 0.3, 46); placeHaor(h); wetG.haors.userData.highlight(W.haors.indexOf(h)); }));
  $("srcHaor").textContent = W.haor_src + " " + W.haor_place;
  $("beelList").innerHTML = W.beels.map((b, i) => `<li><button type="button" data-i="${i}"><span class="pi sw round" style="background:${WET.beel}"></span><span><b>${b.name}</b><small>${b.where}</small></span><span class="pv">${b.facts.length ? b.facts[b.facts.length > 1 ? 1 : 0][1].replace("about ", "") : ""}</span></button></li>`).join("");
  $("beelList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const x = W.beels[+b.dataset.i]; flyToPlace(x.lon, x.lat, 0.35, 44); placeBeel(x); }));
  $("beelOther").textContent = W.other_beels.map(([n, d]) => `${n} (${d})`).join(", ") + ".";
  $("srcBeel").textContent = W.beel_src + " Wet ground on the map: " + W.wet_src;
  $("birdLede").textContent = W.birds.season + " " + W.birds.national;
  const coast = W.birds.sites.filter(x => !x.counts.length);
  $("coastBirds").innerHTML = coast.map((x, i) => `<li><button type="button" data-i="${i}"><span class="pi sw round" style="background:${BIRD.site}"></span><span><b>${x.name}</b><small>${x.species}</small></span></button></li>`).join("");
  $("coastBirds").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const x = coast[+b.dataset.i]; flyToPlace(x.lon, x.lat, 0.4, 40); placeBird(x); }));
  $("srcBirds").textContent = "Counts as cited for each site; coastal sites: Regional Flyway Initiative, Identifying priority sites for migratory waterbirds in Bangladesh (ADB, May 2024). Map positions of the coastal sites are approximate.";
  // fish by district
  document.querySelectorAll(".fyr").forEach(e => e.textContent = W.fish_year);
  { const last = W.fish_national[W.fish_national.length - 1]; const all = last.capture + last.culture + last.marine; const pond = d3.sum(Object.values(W.fish), f => f.pond);
    $("fishLede").textContent = `Inland fish by district, ${W.fish_year}. Ponds gave ${Math.round(pond / all * 100)}% of all the country's fish that year. Shrimp and prawn farms cluster in the south-west.`; }
  $("fishMetric").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { setRule({ theme: "crop", crop: b.dataset.c }); syncFishMetric(); renderFishRank(); }));
  $("srcFishD").textContent = D.v13.shrimp_src + " " + W.fish_src + ` Shrimp and prawn farms cover ${fmt(W.shrimp_area_ha)} ha. "Farmed" is ponds, seasonal waterbodies, baors, shrimp farms, pens and cages; "caught" is rivers, the Sundarbans, beels, Kaptai Lake and floodplains.`;
  // rain
  const RR = D.rain; const wet = RR.stations[0], dry = RR.stations[RR.stations.length - 1];
  $("rainLede").textContent = `Play the year: districts rise with the month's rain and rain falls over the land. ${Math.round(d3.sum(RR.national.slice(5, 9)) / d3.sum(RR.national) * 100)}% of the year's rain comes from June to September. ${wet.name} gets about ${fmt(wet.y)} mm a year, ${dry.name} about ${fmt(dry.y)}.`;
  const rl = [...RR.stations.slice(0, 5), ...RR.stations.slice(-3)]; const rmax = wet.y;
  $("rainList").innerHTML = rl.map((s, i) => `<li data-i="${i}" tabindex="0"${i === 5 ? ' class="cut"' : ""}><span class="r">${i < 5 ? i + 1 : RR.stations.length - (rl.length - 1 - i)}</span><span class="nm">${s.name}</span><span class="v">${fmt(s.y)} mm</span><span class="b"><i style="width:${(s.y / rmax * 100).toFixed(1)}%;background:${rainHex(d3.max(s.m))}"></i></span></li>`).join("");
  $("rainList").querySelectorAll("li").forEach(li => li.addEventListener("click", () => { const s = rl[+li.dataset.i]; flyToPlace(s.lon, s.lat, 0.5, 44); place({ eyebrow: "BMD rain station", dot: "#3182bd", title: s.name, sub: `about ${fmt(s.y)} mm a year (${s.base}, record ${s.span[0]} to ${s.span[1]})`, body: `<table>${s.m.map((v, k) => `<tr><td>${MONTH[k]}</td><td>${fmt(v)} mm</td></tr>`).join("")}</table><p class="src">${RR.src}</p>` }); }));
  $("srcRain").textContent = RR.src + " " + RR.src24;
  // rivers and transport
  document.querySelectorAll("#trMode button").forEach(b => b.addEventListener("click", () => showTrMode(b.dataset.m)));
  { let km = 0; D.tr.rails.forEach(l => { for (let i = 0; i < l.length - 1; i++) km += Math.hypot((l[i + 1][0] - l[i][0]) * 102.5, (l[i + 1][1] - l[i][1]) * 110.8); });
    $("railLede").textContent = `About ${fmt(Math.round(km / 10) * 10)} km of main and branch line as drawn in OpenStreetMap (a double track drawn as two lines counts twice). The white dashes are the classic map sign for a railway; the yellow blocks are not real trains, they show the line is running. Junctions are where lines leave in three or more directions.`; }
  document.querySelectorAll("#rivSeg button").forEach(b => b.addEventListener("click", () => goStep(CHAPTERS.findIndex(c => c.id === b.dataset.r))));
  { const S = D.src, F = S.facts; $("srcN").textContent = S.rivers.length;
    $("srcLede").innerHTML = `Of the water Bangladesh's rivers carry to the sea, <b>${Math.round(F.in_cms / F.out_cms * 100)}%</b> comes in from beyond the border, and the country is <b>${Math.round(F.bd_km2_in_basin / F.basin_km2 * 100)}%</b> of the ${(F.basin_km2 / 1e6).toFixed(2)} million km² that drain through it. Press play to let every river down from its source, or pick one to follow.`;
    $("srcGrp").innerHTML = `<button type="button" class="chip on">All ${S.rivers.length}</button>` + RGROUPS.map(([g, t]) => `<button type="button" class="chip" data-g="${g}"><i class="dot" style="background:${RSYS[g]}"></i>${t[0].toUpperCase() + t.slice(1)} <small>${S.rivers.filter(r => r.grp === g).length}</small></button>`).join("");
    $("srcGrp").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { if (b.dataset.g) pickGroup(b.dataset.g); else { state.srcGrp = null; if (state.srcSel) pickRiver(state.srcSel); else { syncSrc(); replaySrc(); } } }));
    const seen = []; S.rivers.forEach(r => r.segs.forEach(([n]) => { if (!seen.includes(n)) seen.push(n); })); const ord = ["China", "Bhutan", "India", "Bangladesh"].filter(n => seen.includes(n));
    $("lgNation").innerHTML = ord.map(n => `<span><i style="background:${NATION[n]}"></i>${n}</span>`).join("");
    $("srcSource").textContent = S.src.rivers; $("srcCities").textContent = S.src.cities; }
  $("jctChips").innerHTML = D.tr.junctions.map((j, i) => `<button type="button" class="chip" data-i="${i}">${j.upazila}<small>${j.ends}</small></button>`).join("");
  $("jctChips").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const j = D.tr.junctions[+b.dataset.i]; flyToPlace(j.lon, j.lat, 0.18, 48);
    place({ eyebrow: "Rail junction", dot: RAIL.line, title: j.upazila, sub: `${j.district || ""} · lines leave in ${j.ends} directions`, body: (j.lines.length ? `<p>${j.lines.join("; ")}</p>` : "") + `<p class="src">${D.tr.src} The junction is named by the upazila it lies in.</p>` }); }));
  $("srcTransport").textContent = D.tr.src;
  // crops: three panes, jute, the calendar, tea
  const V = D.v12;
  document.querySelectorAll("#cropSegTop button").forEach(b => b.addEventListener("click", () => goStep(CHAPTERS.findIndex(c => c.id === b.dataset.k))));
  $("srcJute").textContent = "Jute, maize, onion, garlic: " + D.v13.src;
  $("srcCal").textContent = V.cal_src + " Production: BBS district tables (aman 2011-12, boro 2012-13, wheat, potato and aus 2014-15, jute 2023-24); jute converted from bales. A district's whole crop is counted for every month it is in the field.";
  $("teaLede").textContent = `Moulvibazar alone has ${V.tea.gardens[0][1]} of the gardens and makes about 55% of the tea. Small growers on the northern plains, in Panchagarh and four nearby districts, made ${f1(V.tea.north[V.tea.north.length - 1][1])} million kg in ${V.tea.north[V.tea.north.length - 1][0]}.`;
  $("teaFacts").innerHTML = V.tea.facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
  $("srcTea").textContent = `${V.tea.first} ${V.tea.gardens_src} ${V.tea.output_src} ${V.tea.north_src}`;
  // the Sundarbans
  $("sundFacts").innerHTML = V.sund.facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
  $("tigerNote").textContent = V.sund.tiger_note;
  const sst = D.storms.filter(x => x.note && V.sund.storms.includes(x.note.label)).sort((a, b) => a.season - b.season);
  $("sundStorms").innerHTML = sst.map(x => { const im = impactOf(x); return `<li><button type="button" data-sid="${x.sid}"><span class="pi sw round" style="background:${windHex(x.peak_kt)}"></span><span><b>${x.note.label} ${x.season}</b><small>peak ${x.peak_kt} kt${im.deaths != null ? " · " + fmt(im.deaths) + " deaths" : ""}</small></span><span class="pi">${icon("play", 16)}</span></button></li>`; }).join("");
  $("sundStorms").querySelectorAll("button").forEach(b => b.addEventListener("click", () => playStorm(b.dataset.sid)));
  $("srcSund").textContent = `${V.sund.src} ${V.sund.fish_src}`;
  // cyclone tracker
  document.querySelectorAll("#trkView button").forEach(b => b.addEventListener("click", () => showTrk(b.dataset.v)));
  $("trkQ").addEventListener("input", e => { state.trk.q = e.target.value; renderTrk(); kick(); });
  $("trkK").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { state.trk.k = +b.dataset.k; $("trkK").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); showTrk(state.trk.view); }));
  $("trkSort").addEventListener("click", () => { state.trk.sort *= -1; renderTrk(); });
  // rivers: one card per junction
  $("jList").innerHTML = A.junctions.map(j => { const g = A.gauges.find(x => x.name === j.gauge || (j.gauge && x.name.startsWith(j.gauge.split(" ")[0])));
    return `<li><button type="button" data-id="${j.id}"><span class="pi">${icon("pin", 18)}</span><span><b>${j.name}</b><small>${j.joins.length ? j.joins.join(" + ") + " → " + j.becomes : "river mouth"}</small></span><span class="pv">${j.flows[j.becomes] ? fmt(j.flows[j.becomes]) + " m³/s" : ""}</span></button></li>`; }).join("");
  $("jList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const j = A.junctions.find(x => x.id === b.dataset.id); const g = A.gauges.find(x => j.gauge && x.name.toLowerCase().startsWith(j.gauge.toLowerCase().split(" ")[0]));
    flyToPlace(j.lon, j.lat, 0.45);
    place({ eyebrow: "River junction", dot: "#111827", title: j.name, sub: j.joins.length ? `${j.joins.join(" + ")} → ${j.becomes}` : "River mouth on the Bay",
      body: `<p>${j.note}</p>` + (Object.keys(j.flows).length ? `<div class="sub">Mean flow, m³/s</div><table>${Object.entries(j.flows).map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join("")}</table>` : "<p class='note'>No reach of 150 m³/s or more is mapped here; the channels are part of the smaller network.</p>")
        + (g ? `<div class="sub">FFWC gauge: ${g.name}</div><table><tr><td>Danger level</td><td>${g.danger} m</td></tr><tr><td>Record peak</td><td>${g.record} m</td></tr><tr><td>Record above danger</td><td>+${g.over} m</td></tr></table>` : "")
        + `<p class="src">HydroRIVERS v1.0 long-term mean discharge. Gauge: FFWC Annual Flood Report 2021, metres above PWD datum.</p>` }); }));
  // fish
  document.querySelectorAll("#fishSeg button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.f === "district") { goStep(CHAPTERS.findIndex(c => c.id === "fishmap")); return; }
    if (CHAPTERS[state.step].id !== "fish") { state.fishTab = b.dataset.f; goStep(CHAPTERS.findIndex(c => c.id === "fish")); }
    showFish(b.dataset.f);
    if (b.dataset.f === "halda") flyToPlace(91.80, 22.65, 0.35, 48); else if (b.dataset.f === "sea") flyToPlace(90.5, 21.25, 1.3, 36); else if (state.gl) flyTo(stepPose(state.step)); }));
  const F = A.fish; const maxkm = d3.max(F.sanctuaries, s => s.km);
  $("sList").innerHTML = F.sanctuaries.map((s, i) => `<li><button type="button" data-i="${i}"><span class="pi sw" style="background:#CC79A7"></span><span><b>${s.name}</b><small>${s.river} · ${s.districts} · closed ${s.ban}</small></span><span class="pv">${s.km} km</span></button><i class="bar" style="width:${s.km / maxkm * 100}%"></i></li>`).join("");
  $("sList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const s = F.sanctuaries[+b.dataset.i]; const lon = d3.mean(s.path, p => p[0]), lat = d3.mean(s.path, p => p[1]);
    flyToPlace(lon, lat, 0.4, 44); place({ eyebrow: "Hilsa sanctuary", dot: "#CC79A7", title: s.name, sub: `${s.river} · ${s.districts}`, body: `<div class="stats"><div><b>${s.km} km</b><span>of river</span></div><div><b>${s.ban}</b><span>fishing closed</span></div></div><p class="src">${F.sanct_src}. The course on the map is drawn through the named end points and is approximate.</p>` }); }));
  $("srcHilsa").textContent = `${F.hilsa_src}. ${F.hilsa_note} Sanctuaries: ${F.sanct_src}.`;
  $("haldaSpawn").textContent = F.halda.spawn; $("srcHalda").textContent = F.halda.src + ".";
  $("gList").innerHTML = F.grounds.map((g, i) => `<li><button type="button" data-i="${i}"><span class="pi sw" style="background:#0072B2"></span><span><b>${g.name}</b><small>${g.box[1].toFixed(2)}–${g.box[3].toFixed(2)}° N, ${g.box[0]}–${g.box[2]}° E</small></span><span class="pv">${fmt(g.km2)} km²</span></button></li>`).join("");
  $("gList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const g = F.grounds[+b.dataset.i]; flyToPlace((g.box[0] + g.box[2]) / 2, (g.box[1] + g.box[3]) / 2, 0.7, 36); }));
  $("srcGround").textContent = F.grounds_src + ".";
  // crops
  $("secCropSeg").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { $("secCropSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    setRule(b.dataset.t ? { theme: "landscape" } : { theme: "crop", crop: b.dataset.c }); renderSecRank(); }));
  // hazards
  document.querySelectorAll("#hazSeg button").forEach(b => b.addEventListener("click", () => goStep(CHAPTERS.findIndex(c => c.id === b.dataset.h))));
  // people
  document.querySelectorAll("#popSeg button").forEach(b => b.addEventListener("click", () => goStep(CHAPTERS.findIndex(c => c.id === b.dataset.p))));
  document.querySelectorAll("#hkSeg button").forEach(b => b.addEventListener("click", () => showHk(b.dataset.k)));
  { const P = D.pop, A = P.access, N = P.national; const p22 = N.wdi[N.years.indexOf(2022)];
    $("popModels").innerHTML = modelTable(P); $("popDModels").innerHTML = districtModelTable(P); $("popDNote").textContent += ` the one used follows the share's recent trend, with the trend halving every ${P.half_life.chosen} years (the half-life that scored best).`;
    $("hkN").innerHTML = `<div><b>${A.uhc_n}</b><span>upazila health complexes (${A.uhc_osm} placed from OpenStreetMap, the rest at the upazila's centre)</span></div><div><b>${A.dh_n}</b><span>district hospitals, one per district town</span></div><div><b>${A.ter.length}</b><span>tertiary: medical college hospitals and national institutes</span></div>`;
    $("ccTxt").innerHTML = `<b>${fmt(A.cc_total)}</b> community clinics (${A.cc_date}): one for every <b>${fmt(Math.round(p22 / A.cc_total / 100) * 100)}</b> people in 2022, and <b>${fmt(Math.round(N.proj[N.proj.length - 1][1] / A.cc_total / 100) * 100)}</b> in 2050 if none are added. The plan was one per ${fmt(A.cc_norm)}. OpenStreetMap shows too few of them to map, so they count here only as a national total.`;
    $("srcPop").textContent = `${P.src.wdi} ${P.src.census}`; $("srcHealth").textContent = `${P.src.osm} ${P.src.gpw} ${P.src.cc}`;
    $("srcBurden").textContent = "Rice: BBS district production (Aman 2011-12, Boro 2012-13, Aus 2014-15), held at that harvest. Population: this projection. Facilities and distances: as on the Health care tab."; }
  $("seasonSeg").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { state.season = b.dataset.s; $("seasonSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); showTrk(state.trk.view); }));
  const gs = A.gauges.slice().sort((a, b) => b.over - a.over).slice(0, 12); const gmax = gs[0].over;
  $("gaugeList").innerHTML = gs.map((g, i) => `<li><button type="button" data-i="${i}"><span class="pi sw" style="background:${g.over >= 2 ? "#08306b" : g.over >= 1 ? "#2171b5" : "#6baed6"}"></span><span><b>${g.name}</b><small>${g.river} · danger ${g.danger} m · record ${g.record} m</small></span><span class="pv">+${g.over} m</span></button><i class="bar blue" style="width:${g.over / gmax * 100}%"></i></li>`).join("");
  $("gaugeList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const g = gs[+b.dataset.i]; flyToPlace(g.lon, g.lat, 0.35, 48);
    place({ eyebrow: `FFWC gauge · ${g.river}`, dot: "#2171b5", title: g.name, sub: `station ${g.id}`, body: `<div class="stats"><div><b>${g.danger} m</b><span>danger level</span></div><div><b>${g.record} m</b><span>record peak</span></div><div><b>+${g.over} m</b><span>record above danger</span></div></div><table><tr><td>Peak in 2021</td><td>${g.peak2021} m (${g.peak2021 >= g.danger ? "+" : ""}${f1(g.peak2021 - g.danger)} m)</td></tr></table><p class="src">${A.flood_src}. Metres above PWD datum.</p>` }); }));
  $("srcFlood").textContent = A.flood_src + `. ${A.gauges.length} of the report's 81 gauges could be placed on the map.`;
  const E = A.erosion; $("eroTotal").textContent = fmt(Math.round(E.total_ha / 100)) + " km²";
  $("ero2025").innerHTML = `In 2025 alone: <b>${fmt(E.year2025.Ganges + E.year2025.Jamuna + E.year2025.Padma)} ha</b> (Ganges ${E.year2025.Ganges}, Jamuna ${E.year2025.Jamuna}, Padma ${E.year2025.Padma}). Forecast for 2026: ${E.forecast2026_ha} ha. ${E.people}`;
  $("cList").innerHTML = E.coast.map((c, i) => `<li><button type="button" data-i="${i}"><span class="pi sw" style="background:#a63603"></span><span><b>${c.name}</b><small>${c.text}</small></span></button></li>`).join("");
  $("cList").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const c = E.coast[+b.dataset.i]; flyToPlace(c.lon, c.lat, 0.4, 44);
    place({ eyebrow: "Coastal erosion", dot: "#a63603", title: c.name, sub: "", body: `<p>${c.text}.</p><p class="src">${c.src}.</p>` }); }));
  $("srcEro").textContent = E.src + "; coastal figures as cited for each place.";
}

// ---- the layers menu: per-step overrides --------------------------------------------------------------
const ON = { transport: 0.95, wetfill: 1, rivers: 0.9, riverLabels: 0.9, labels: 0.9, borders: 0.8, storms: 0.9, uBathy: 1 };
function applyOverrides(t) { for (const k in state.ov) { t[k] = state.ov[k] ? Math.max(t[k] || 0, ON[k]) : 0; if (k === "rivers") t.farRivers = state.ov[k] ? Math.max(t.farRivers, 0.8) : 0; if (k === "wetfill") t.haors = state.ov[k] ? Math.max(t.haors || 0, 0.8) : 0; if (k === "storms" && state.ov[k] && CHAPTERS[state.step].id !== "storms") t.year = 2025; } }
function syncLayers() { const t = valuesAt(state.step, 1); applyOverrides(t); document.querySelectorAll("input[data-layer]").forEach(i => { i.checked = (t[i.dataset.layer] || 0) > 0.05; }); }
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
  document.querySelectorAll("input[data-layer]").forEach(i => i.addEventListener("change", () => { state.ov[i.dataset.layer] = i.checked; syncLayers(); kick(); }));
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
addEventListener("resize", () => { resize(); moveTabInk(); });

window.__poli = {
  get state() { return state; }, get cam() { return cam; }, get camT() { return camT; }, get flight() { return flight; }, get uniforms() { return terrain && terrain.uniforms; },
  get camera() { return camera; }, get data() { return D; }, get cur() { return cur; }, get prisms() { return prisms; },
  go: i => goStep(typeof i === "string" ? CHAPTERS.findIndex(c => c.id === i) : i), idx: id => CHAPTERS.findIndex(c => c.id === id), about: o => showAbout(o), select: id => selectDistrict(id), play: sid => playStorm(sid), setDim: t => setDim(t), clear: () => clearFocus(),
  stepPose: i => stepPose(i), project: (lon, lat, y = 0) => { const p = toScene(lon, lat); p.y = y; p.project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }
};

boot().catch(err => { console.error(err); const l = $("loader"); l.classList.add("err"); l.querySelector(".lt").textContent = "Could not load the map: " + err.message; });
