// main.js  --  v5: the scroll drives one continuous film.
// The page scrolls an invisible track. Its position becomes a float "chapter" value that is smoothed every
// frame, and that one number sets the camera, the relief, the layers, the panel text and the chapter spine.
// Each chapter holds still for the first part of its span (its own animation runs there: the sea rising,
// the cyclone clock, the columns growing) and glides into the next over the rest. Scrolling back plays it
// backwards. The last chapter turns the story's rule into a tool: rank the 64 districts yourself.
import * as THREE from "three";
import { OrbitControls } from "../lib/OrbitControls.js";
import { buildTerrain, heightSampler, toScene, GRID, KM_PER_DEG_LAT, KM_PER_DEG_LON } from "./terrain.js";
import { buildStorms, buildFarRivers, buildRivers, buildDistricts, buildPrisms, makeLabel, PLACES } from "./layers.js";
import { CHAPTERS, SITE } from "./story.js";
import { charts } from "./charts.js";
import { cards } from "./cards.js";
import { WindField, StormPlayer } from "./wind.js";

const $ = id => document.getElementById(id);
const stage = $("stage");
const lod = new URLSearchParams(location.search).get("lod");
const BG = 0xf1f3f5;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(lod === "low" ? 1 : Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(BG, 1);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(BG, 1100, 2400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 1.5)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-300, 520, 260); scene.add(sun);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
const controls = new OrbitControls(camera, renderer.domElement); controls.enabled = false; controls.enableZoom = false; controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.46;

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const loadJson = src => fetch(src).then(r => r.ok ? r.json() : null).catch(() => null);
const tex = (img, nearest = false) => { const t = new THREE.Texture(img); t.needsUpdate = true; t.minFilter = t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; return t; };
const pixels = img => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = t => t * t * (3 - 2 * t);
const fmt = d3.format(","), f1 = d3.format(".1f");

const N = CHAPTERS.length, HOLD = 0.58, SPAN = 1.4;       // each chapter is 1.4 screens of scroll; the first 58% holds
const EXPLORE = N - 1;
const DEFAULT_RULE = { metric: "pop_le5", sevMin: 3 };
const state = { p: 0, ps: 0, dom: -1, pick: 0, hover: 0, storm: null, override: null, userCam: false, t0: performance.now(), frames: 0, rule: { ...DEFAULT_RULE }, first: true };
const D = {};
let terrain, rivers, farRivers, labels, districts, prisms, ranks, storms, wind, player, site, sampleH, views = [];
window.__poli = { get state() { return state; }, get terrain() { return terrain; }, get camera() { return camera; }, get data() { return D; }, go: i => goChapter(i, true), select: id => selectDistrict(id), play: sid => playStorm(sid), views: () => views };

async function boot() {
  const [hImg, mImg, cImg, cRGB, dImg, far, stormsJson, expo, riversJson, distJson, distGeo, impact] = await Promise.all([
    loadImg("data/height.png"), loadImg("data/mask.png"), loadImg("data/cover.png"), loadImg("data/cover_rgb.png"), loadImg("data/district_id.png"),
    loadJson("data/rivers_far.geojson"), loadJson("data/storms.json"), loadJson("data/exposure.json"), loadJson("data/rivers.json"),
    loadJson("data/districts.json"), loadJson("data/districts.geojson"), loadJson("data/cyclones_impact.json")
  ]);
  try { await document.fonts.load('500 20px "IBM Plex Sans"'); await document.fonts.load('600 20px "IBM Plex Sans"'); } catch (e) {}
  const ds = distJson.districts;
  Object.assign(D, { storms: stormsJson, expo, districts: ds, byId: Object.fromEntries(ds.map(d => [d.id, d])), impact: impact || [],
    le5Total: ds.reduce((s, d) => s + d.pop_le5, 0), idPix: pixels(dImg), idW: dImg.width, idH: dImg.height, geo: distGeo });
  D.ten = rankBy(DEFAULT_RULE).slice(0, 10);
  sampleH = heightSampler(hImg);
  terrain = buildTerrain({ height: tex(hImg), mask: tex(mImg), cover: tex(cImg, true), coverRGB: tex(cRGB), district: tex(dImg, true) }, lod === "hi" ? 1023 : lod === "low" ? 255 : 511); scene.add(terrain.mesh);
  rivers = buildRivers(riversJson, sampleH, 14); scene.add(rivers);
  farRivers = buildFarRivers(far, sampleH, 14); scene.add(farRivers);
  districts = buildDistricts(distGeo, sampleH, 14); scene.add(districts);
  storms = buildStorms(stormsJson, sampleH, 14); scene.add(storms);
  wind = new WindField(lod === "low" ? 1800 : 4500, sampleH, 14); scene.add(wind.mesh);
  player = new StormPlayer(wind); player.onTick = t => cards.stormTick(t);
  prisms = buildPrisms(distGeo, () => 0, () => 0xcccccc, 1); scene.add(prisms);
  ranks = new THREE.Group(); scene.add(ranks);
  applyRule();
  labels = new THREE.Group();
  for (const [n, lon, lat] of PLACES) { const s = makeLabel(n, { size: n === "Bay of Bengal" ? 22 : 18, weight: n === "Dhaka" ? 700 : 500, color: n === "Bay of Bengal" ? "#4f7a99" : "#1f2933" }); const p = toScene(lon, lat); p.y = Math.max(sampleH(lon, lat), 0) * 0.001 * 14 + 6; s.position.copy(p); labels.add(s); }
  scene.add(labels);
  // the place where silt was let back in: a column, a pulsing ring, a label
  site = new THREE.Group(); const sp = toScene(SITE.lon, SITE.lat);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0072b2, transparent: true, opacity: 0 })); col.position.set(sp.x, 6, sp.z); site.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.8, 48), new THREE.MeshBasicMaterial({ color: 0x0072b2, transparent: true, opacity: 0, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.6, sp.z); ring.name = "ring"; site.add(ring);
  const lab = makeLabel("Beel Bhaina: ground up 0.8–1.2 m in 4 years", { size: 24, color: "#005a8c", weight: 600 }); lab.position.set(sp.x, 15, sp.z); site.add(lab);
  scene.add(site);

  charts.init(D); cards.init(D, { clear: clearFocus });
  buildSpine(); buildExplore(); layoutTrack(); resize();
  document.body.classList.add("ready");
  addEventListener("scroll", onScroll, { passive: true }); onScroll(); state.ps = state.p;
  requestAnimationFrame(frame);
}

// ---- the rule: who is in the first ten, and how tall each column stands --------------------------------
function rankBy(rule) { return D.districts.filter(d => d.severe >= rule.sevMin).sort((a, b) => b[rule.metric] - a[rule.metric] || b.pop_le5 - a.pop_le5); }
const HEIGHT = { pop_le5: v => v / 1e6 * 32, pop_le2: v => v / 1e6 * 48, severe: v => v * 7 };
const sevCol = n => n >= 6 ? 0xa33c00 : n >= 5 ? 0xc04f00 : n >= 4 ? 0xd55e00 : n >= 3 ? 0xe69f00 : 0xc9ced4;
function applyRule() {
  const r = state.rule; const list = rankBy(r); const top = new Set(list.slice(0, 10).map(d => d.id)); D.list = list;
  prisms.children.forEach(m => { const d = D.byId[m.userData.id]; if (!d) return; const q = d.severe >= r.sevMin;
    m.userData.q = q; m.userData.top = top.has(d.id); m.userData.h = Math.max(0.3, HEIGHT[r.metric](d[r.metric]));
    m.material.color.setHex(q ? sevCol(d.severe) : 0xc9ced4); });
  ranks.children.forEach(s => { s.material.map.dispose(); s.material.dispose(); }); ranks.clear();
  list.slice(0, 10).forEach((d, i) => { const v = r.metric === "severe" ? `${d.severe} hits` : `${f1(d[r.metric] / 1e6)} M`;
    const s = makeLabel(`${i + 1} ${d.name}`, { size: 21, color: "#111827", weight: 600 }); s.userData.d = d; s.userData.rank = i; ranks.add(s); });
  renderList();
}

// ---- scroll -> chapter float ----------------------------------------------------------------------
function spanPx() { return innerHeight * SPAN; }
function layoutTrack() { $("track").style.height = ((N - 1) * spanPx() + innerHeight) + "px"; }
function onScroll() { state.p = clamp(scrollY / spanPx(), 0, N - 1); }
function goChapter(i, instant = false) { i = clamp(i, 0, N - 1); window.scrollTo({ top: i * spanPx() + 1, behavior: instant ? "auto" : "smooth" }); if (instant) { onScroll(); } }
addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); goChapter(Math.floor(state.p + 0.05) + 1); }
  if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); goChapter(Math.ceil(state.p - 0.05) - 1); }
  if (e.key === "Home") { e.preventDefault(); goChapter(0); } if (e.key === "End") { e.preventDefault(); goChapter(N - 1); }
  if (e.key === "Escape") clearFocus();
});

// ---- the chapter spine on the side, the mode switch, the next button --------------------------------
function buildSpine() {
  const sp = $("spine"); sp.innerHTML = '<div class="bar"></div><div class="fill" id="fill"></div>';
  CHAPTERS.forEach((ch, i) => { const a = document.createElement("a"); a.href = "#"; a.dataset.i = i; a.innerHTML = `<i></i><span class="n">${String(i).padStart(2, "0")}</span><span class="t">${ch.nav}</span>`;
    a.addEventListener("click", e => { e.preventDefault(); goChapter(i); }); sp.appendChild(a); });
  $("modeStory").addEventListener("click", () => { if (state.dom === EXPLORE) goChapter(0); });
  $("modeExplore").addEventListener("click", () => goChapter(EXPLORE));
  $("brand").addEventListener("click", e => { e.preventDefault(); goChapter(0); });
  $("nextBtn").addEventListener("click", () => goChapter(Math.floor(state.p + 0.05) + 1));
}
function spineFill(ps) {
  const items = [...document.querySelectorAll("#spine a")]; if (!items.length) return;
  const i = Math.floor(ps), f = ps - i; const a = items[i], b = items[Math.min(items.length - 1, i + 1)];
  const top = items[0].offsetTop + items[0].offsetHeight / 2; const y = lerp(a.offsetTop + a.offsetHeight / 2, b.offsetTop + b.offsetHeight / 2, f);
  const fill = $("fill"); fill.style.top = top + "px"; fill.style.height = Math.max(0, y - top) + "px";
}

// ---- explore: the rule becomes a tool ---------------------------------------------------------------
function buildExplore() {
  const seg = (id, key, parse) => $(id).querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    $(id).querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); state.rule[key] = parse(b.dataset[key === "metric" ? "m" : "s"]); applyRule(); }));
  seg("metricSeg", "metric", v => v); seg("sevSeg", "sevMin", v => +v);
  const dl = $("dlist"); D.districts.map(d => d.name).sort().forEach(n => { const o = document.createElement("option"); o.value = n; dl.appendChild(o); });
  $("search").addEventListener("change", e => { const d = D.districts.find(x => x.name.toLowerCase() === e.target.value.trim().toLowerCase()); if (d) { selectDistrict(d.id); e.target.value = ""; } });
  const box = $("stormChips");
  D.storms.filter(s => s.note).forEach(s => { const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.dataset.sid = s.sid; b.innerHTML = `${s.note.label}<small>${s.season}</small>`; b.addEventListener("click", () => playStorm(s.sid)); box.appendChild(b); });
}
function renderList() {
  const ol = $("rankList"); if (!ol) return; const r = state.rule; const list = D.list.slice(0, 15); const max = d3.max(list, d => d[r.metric]) || 1;
  ol.innerHTML = list.map((d, i) => { const v = r.metric === "severe" ? d.severe + " hits" : f1(d[r.metric] / 1e6) + " M";
    return `<li data-id="${d.id}" class="${i >= 10 ? "out" : ""}${state.pick === d.id ? " on" : ""}"><span class="r">${i + 1}</span><span class="nm">${d.name}</span><span class="v">${v}</span><span class="b"><i style="width:${(d[r.metric] / max * 100).toFixed(1)}%"></i></span></li>`; }).join("")
    + (D.list.length > 15 ? `<li class="out" style="cursor:default"><span></span><span class="nm" style="color:#9ca3af;font-weight:400">${D.list.length - 15} more meet the rule</span></li>` : "")
    + (D.list.length === 0 ? `<li class="out"><span></span><span class="nm">No district meets this rule</span></li>` : "");
  ol.querySelectorAll("li[data-id]").forEach(li => li.addEventListener("click", () => selectDistrict(+li.dataset.id)));
}

// ---- views: each chapter's box fitted to the part of the stage nothing covers ---------------------------
function freeRegion() {
  const w = stage.clientWidth || 1000, h = stage.clientHeight || 700; const sheet = $("focus").classList.contains("on") && innerWidth > 820 ? $("focus").offsetWidth + 24 : 0;
  return { x0: 8, x1: w - 8 - sheet, y0: 8, y1: h - 56 };
}
function applyOffset(cam) {
  const w = stage.clientWidth, h = stage.clientHeight, r = freeRegion(); const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
  cam.aspect = rw / rh; cam.setViewOffset(rw, rh, -r.x0, -r.y0, w, h); cam.updateProjectionMatrix();
}
const probe = new THREE.PerspectiveCamera(38, 1, 1, 4000);
function fitView(v) {
  const b = v.box; const look = toScene((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); look.y = 0;
  const corners = []; for (const lon of [b[0], b[2]]) for (const lat of [b[1], b[3]]) for (const y of [0, v.top || 8]) { const p = toScene(lon, lat); p.y = y; corners.push(p); }
  const tilt = v.tilt * Math.PI / 180, az = v.az * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(tilt), Math.sin(tilt), -Math.cos(az) * Math.cos(tilt));
  const r = freeRegion(); probe.aspect = (r.x1 - r.x0) / (r.y1 - r.y0); probe.updateProjectionMatrix();
  let d = Math.hypot((b[2] - b[0]) * KM_PER_DEG_LON, (b[3] - b[1]) * KM_PER_DEG_LAT) * 1.2;
  for (let k = 0; k < 8; k++) {
    probe.position.copy(look).addScaledVector(dir, d); probe.lookAt(look); probe.updateMatrixWorld();
    let m = 0; for (const c of corners) { const q = c.clone().project(probe); m = Math.max(m, Math.abs(q.x) / 0.94, Math.abs(q.y) / 0.9); }
    d *= m; if (Math.abs(m - 1) < 0.005) break;
  }
  return { look, d: d * 1.02, tilt, az };
}
function camFrom(v) { const dir = new THREE.Vector3(Math.sin(v.az) * Math.cos(v.tilt), Math.sin(v.tilt), -Math.cos(v.az) * Math.cos(v.tilt)); return { pos: v.look.clone().addScaledVector(dir, v.d), look: v.look.clone() }; }
function blendView(a, b, e) {
  let da = b.az - a.az; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  // rise a little in the middle of a long move, so the camera arcs over the country instead of skimming it
  const far = a.look.distanceTo(b.look); const lift = 1 + Math.sin(Math.PI * e) * Math.min(0.3, far / 900);
  return { look: a.look.clone().lerp(b.look, e), d: Math.exp(lerp(Math.log(a.d), Math.log(b.d), e)) * lift, tilt: lerp(a.tilt, b.tilt, e), az: a.az + da * e };
}

// ---- the blended state at the smoothed scroll position -------------------------------------------------
const BASE = { ...CHAPTERS[0].u, ...CHAPTERS[0].layers, year: 2025, grow: 0 };
function valuesAt(i, t) { const ch = CHAPTERS[i]; return { ...BASE, ...ch.u, ...ch.layers, ...(ch.inner ? ch.inner(t) : {}) }; }
function frameState(ps) {
  const i = Math.min(N - 1, Math.floor(ps)), f = ps - i;
  if (i === N - 1 || f <= HOLD) { const t = i === N - 1 ? 1 : f / HOLD; return { a: i, b: i, e: 0, v: valuesAt(i, t), view: views[i] }; }
  const e = smooth((f - HOLD) / (1 - HOLD)); const va = valuesAt(i, 1), vb = valuesAt(i + 1, 0); const v = {};
  for (const k of Object.keys(va)) v[k] = lerp(va[k], vb[k] ?? va[k], e);
  return { a: i, b: i + 1, e, v, view: blendView(views[i], views[i + 1], e) };
}

// ---- frame loop -------------------------------------------------------------------------------------
let last = performance.now();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now; state.frames += 1;
  state.ps += (state.p - state.ps) * (1 - Math.exp(-dt * 5)); if (Math.abs(state.p - state.ps) < 1e-4) state.ps = state.p;
  const F = frameState(state.ps), v = F.v; const dom = F.e < 0.5 ? F.a : F.b;
  if (dom !== state.dom) onChapter(dom);
  // camera: the chapter's view, or the district / storm the reader picked; damped so nothing ever jumps
  const intro = smooth(clamp((now - state.t0) / 2600, 0, 1));
  let target;
  if (state.override) target = state.override;
  else { target = camFrom(F.view); if (intro < 1) target.pos.copy(target.look).addScaledVector(target.pos.clone().sub(target.look), lerp(1.7, 1, intro)); }
  const k = state.first ? 1 : 1 - Math.exp(-dt * (state.override ? 3 : 9)); state.first = false;
  camPos.lerp(target.pos, k); camLook.lerp(target.look, k);
  if (!state.userCam) { camera.position.copy(camPos); camera.lookAt(camLook); controls.target.copy(camLook); } else controls.update();
  // the relief
  const U = terrain.uniforms;
  for (const key of ["uSeaLevel", "uRiverGlow", "uFar", "uLowBand", "uSink", "uCoverMix", "uForest", "uWet", "uBuilt", "uLoss"]) U[key].value = v[key];
  U.uExag.value = 1 + (v.uExag - 1) * intro; U.uCutOn.value = 0; U.uTime.value = (now - state.t0) / 1000;
  // layers
  rivers.children.forEach(o => { if (o.material.uniforms) { o.material.uniforms.uOpacity.value = (o.name === "major" ? 0.9 : 0.4) * v.rivers; o.material.uniforms.uTime.value = U.uTime.value; } else o.material.opacity = v.riverLabels; });
  farRivers.children.forEach(l => l.material.opacity = 0.5 * v.farRivers);
  labels.children.forEach(s => s.material.opacity = v.labels);
  stormLayer(v); prismLayer(v);
  site.children.forEach(o => { o.material.opacity = v.site * (o.name === "ring" ? 0.45 + 0.45 * Math.sin(U.uTime.value * 2.4) : 1); });
  site.children[1].scale.setScalar(1 + 0.25 * Math.sin(U.uTime.value * 2.4));
  panel(F); readouts(v, dom); spineFill(state.ps);
  const dist = camera.position.distanceTo(camLook), sc = dist / 680;   // labels keep one size on screen
  const fit = s => { if (s.isSprite && s.userData.base) s.scale.set(s.userData.base.w * sc, s.userData.base.h * sc, 1); };
  labels.children.forEach(fit); rivers.children.forEach(fit); ranks.children.forEach(fit); site.children.forEach(fit); storms.children.forEach(s => { if (s.userData.isStormLabel) fit(s); });
  player.step(); wind.step();
  renderer.render(scene, camera); requestAnimationFrame(frame);
}

// cyclones: the storm chapter is a clock run by the scroll; the last chapter plays the storm the reader picks
function stormLayer(v) {
  const yr = v.year, playing = state.storm && state.dom === EXPLORE;
  storms.children.forEach(o => {
    const s = o.userData; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-");
    if (playing) { o.material.opacity = s.sid === state.storm ? 0.95 : 0; return; }
    o.material.opacity = s.season <= yr ? v.storms * (marker ? 0.9 : s.note ? 0.8 : 0.4) : 0;
  });
  if (playing) { wind.mat.opacity = 0.95; return; }
  wind.mat.opacity = v.wind;
  if (v.wind > 0.01) {
    // the year's strongest storm, moving along its track as the year on the clock runs
    const y = Math.floor(yr), frac = yr - y; const yrs = D.storms.filter(s => s.season === y);
    if (yrs.length) { const s = yrs.reduce((a, b) => (a.peak_kt > b.peak_kt ? a : b)); const kk = Math.min(s.pts.length - 1, Math.floor(frac * (s.pts.length - 1))); const p = s.pts[kk]; wind.vortices = [{ lon: p[0], lat: p[1], kt: Math.max(30, p[2]) }]; }
    else wind.vortices = [];
  } else wind.vortices = [];
}
// the ten: columns grow with the scroll; the districts that meet the rule are coloured by how often
// hurricane-force wind reached them, the rest stay as low grey slabs
function prismLayer(v) {
  const g = smooth(clamp(v.grow, 0, 1)); const on = v.prisms > 0.01;
  prisms.children.forEach(m => { m.visible = on; if (!on) return; const q = m.userData.q;
    const sel = state.pick && state.pick === m.userData.id;
    m.material.opacity = v.prisms * (q ? (state.pick && !sel ? 0.55 : 1) : 0.16);
    m.scale.y = Math.max(0.001, q ? m.userData.h * g : 0.25 * g); });   // districts outside the rule stay a faint tint on the ground
  ranks.children.forEach(s => { const d = s.userData.d; const m = prisms.getObjectByName("p-" + d.id); const p = toScene(d.centroid[0], d.centroid[1]);
    p.y = (m ? m.scale.y : 0) + 3 + (s.userData.rank % 3) * 3.5; s.position.copy(p); s.material.opacity = v.ranks * smooth(clamp((g - 0.55) / 0.45, 0, 1)); });
}
// the panel: the outgoing chapter's words lift and fade in the first half of a move, the next ones rise in
const caps = [...document.querySelectorAll(".cap")];
function panel(F) {
  caps.forEach((el, i) => {
    let o = 0, y = 0;
    if (i === F.a) { o = F.e === 0 ? 1 : 1 - smooth(clamp(F.e * 2, 0, 1)); y = -18 * F.e; }
    if (i === F.b && F.b !== F.a) { o = smooth(clamp(F.e * 2 - 1, 0, 1)); y = 18 * (1 - F.e); }
    el.style.opacity = o; el.style.transform = `translateY(${y}px)`; el.classList.toggle("vis", o > 0.02);
  });
}
function readouts(v, dom) {
  const id = CHAPTERS[dom].id;
  if (id === "sea") { const lvl = Math.max(0, v.uSeaLevel); const i = clamp(Math.round(lvl / 0.25), 0, D.expo.steps_m.length - 1);
    $("seaM").textContent = lvl.toFixed(2) + " m"; $("seaP").textContent = f1(D.expo.people[i] / 1e6) + " M"; }
  if (id === "storms") { const y = Math.min(2025, Math.floor(v.year)); $("stormY").textContent = y; $("stormN").textContent = D.storms.filter(s => s.season <= y).length; }
}
// a direct key: one or two swatches for what the relief is showing right now, nothing more
const KEYS = {
  cover: [["#c9b56b", "cropland"], ["#3f7d4e", "trees and groves"], ["#1f6b56", "mangrove"]],
  low: [["#E69F00", "land under 5 m, darker = lower"]],
  silt: [["l:#0072B2", "rivers, darker = more water"]],
  sink: [["#56B4E9", "land that drops below the sea"]],
  sea: [["#56B4E9", "land below the chosen sea level"]],
  storms: [["l:#D55E00", "96 kt and more"], ["l:#E69F00", "64–95 kt"], ["l:#0072B2", "34–63 kt"]],
  priority: [["#a33c00", "6 hurricane-force passes"], ["#d55e00", "4"], ["#e69f00", "3"], ["#c9ced4", "fewer than 3"]],
  raise: [["#0072B2", "tidal river management site"]],
  explore: [["#a33c00", "6 hurricane-force passes"], ["#d55e00", "4"], ["#e69f00", "3"], ["#c9ced4", "below the rule"]]
};
function showKey(id) { const k = KEYS[id] || []; $("key").innerHTML = k.map(([c, t]) => { const l = c.startsWith("l:"); return `<div><i class="${l ? "l" : ""}" style="background:${l ? c.slice(2) : c}"></i>${t}</div>`; }).join(""); }
// a chapter became dominant: spine, mode, key, next button, and whatever the reader had open
function onChapter(i) {
  state.dom = i; const ch = CHAPTERS[i];
  document.querySelectorAll("#spine a").forEach(a => { const n = +a.dataset.i; a.classList.toggle("on", n === i); a.classList.toggle("done", n < i); });
  const ex = i === EXPLORE; $("storyText").hidden = ex; $("explorePanel").hidden = !ex;
  $("modeStory").classList.toggle("on", !ex); $("modeExplore").classList.toggle("on", ex);
  $("nextBtn").classList.toggle("hide", ex); $("nextTxt").textContent = i === 0 ? "Scroll to begin" : "Next: " + CHAPTERS[Math.min(N - 1, i + 1)].nav;
  $("clickHint")?.remove();
  showKey(ch.id);
  state.userCam = false; controls.enabled = ex;
  if (!ex) { if (state.storm) { state.storm = null; player.stop(); markChips(); } if (state.pick && ch.id !== "priority") clearFocus(); state.override = null;
    if (state.rule.metric !== DEFAULT_RULE.metric || state.rule.sevMin !== DEFAULT_RULE.sevMin) { state.rule = { ...DEFAULT_RULE }; resetSegs(); applyRule(); } }
  renderer.domElement.style.cursor = ex ? "grab" : "default";
}
function resetSegs() { document.querySelectorAll("#metricSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === DEFAULT_RULE.metric)); document.querySelectorAll("#sevSeg button").forEach(b => b.classList.toggle("on", +b.dataset.s === DEFAULT_RULE.sevMin)); }
controls.addEventListener("start", () => { if (state.dom === EXPLORE) { state.userCam = true; state.override = null; } });

// ---- districts: hover and click ----------------------------------------------------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function setNdc(ev) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
const pickable = () => ["priority", "explore"].includes(CHAPTERS[state.dom]?.id);
function districtAt(ev) {
  setNdc(ev);
  const cols = prisms.children.filter(m => m.visible && m.material.opacity > 0.05 && m.scale.y > 0.5); if (cols.length) { const h = ray.intersectObjects(cols, false); if (h.length) return h[0].object.userData.id; }
  if (!ray.ray.intersectPlane(plane, hit)) return 0;
  let lon = hit.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2, lat = -hit.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2;
  for (let n = 0; n < 2; n++) { const hh = Math.max(sampleH(lon, lat), 0) * 0.001 * terrain.uniforms.uExag.value; plane.constant = -hh; if (!ray.ray.intersectPlane(plane, hit)) break; lon = hit.x / KM_PER_DEG_LON + (GRID.W + GRID.E) / 2; lat = -hit.z / KM_PER_DEG_LAT + (GRID.S + GRID.N) / 2; }
  plane.constant = 0;
  if (lon < GRID.W || lon > GRID.E || lat < GRID.S || lat > GRID.N) return 0;
  const x = Math.min(D.idW - 1, Math.floor((lon - GRID.W) / (GRID.E - GRID.W) * D.idW)), y = Math.min(D.idH - 1, Math.floor((GRID.N - lat) / (GRID.N - GRID.S) * D.idH));
  return D.idPix[(y * D.idW + x) * 4];
}
let down = null;
const tip = $("tip");
renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointermove", e => {
  if (!terrain || !pickable()) { tip.style.display = "none"; return; }
  const id = districtAt(e); if (id !== state.hover) { state.hover = id; terrain.uniforms.uHover.value = id; }
  if (id) { const d = D.byId[id]; const r = D.list.findIndex(x => x.id === id);
    tip.style.display = "block"; tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px";
    tip.innerHTML = `<div class="t">${d.name}${r >= 0 && r < 10 ? ` <span style="color:#D55E00;font-weight:500">· ${r + 1} of the ten</span>` : ""}</div>
      <div class="row">people under 5 m <b>${f1(d.pop_le5 / 1e6)} M</b></div><div class="row">hurricane-force passes <b>${d.severe}</b></div><div class="hint">click for the district sheet</div>`;
    renderer.domElement.style.cursor = "pointer"; }
  else { tip.style.display = "none"; renderer.domElement.style.cursor = state.dom === EXPLORE ? "grab" : "default"; }
});
renderer.domElement.addEventListener("pointerleave", () => { tip.style.display = "none"; if (terrain) terrain.uniforms.uHover.value = state.hover = 0; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; } down = null;
  if (!pickable()) return; const id = districtAt(e); if (id) selectDistrict(id); else if (state.pick) clearFocus();
});
function selectDistrict(id) {
  const d = D.byId[id]; if (!d) return;
  if (state.storm) { state.storm = null; player.stop(); markChips(); }
  state.pick = id; terrain.uniforms.uPick.value = id;
  districts.children.forEach(l => l.material.opacity = l.userData.id === id ? 0.9 : 0);
  cards.showDistrict(d); refit();
  if (state.dom === EXPLORE) { const pad = 0.15; state.override = camFrom(fitView({ box: [d.bbox[0] - pad, d.bbox[1] - pad, d.bbox[2] + pad, d.bbox[3] + pad], tilt: 46, az: 198, top: 40 })); state.userCam = false; }
  renderList();
}
function clearFocus() {
  if (state.pick) { state.pick = 0; terrain.uniforms.uPick.value = 0; districts.children.forEach(l => l.material.opacity = 0); }
  if (state.storm) { state.storm = null; player.stop(); markChips(); }
  state.override = null; cards.hide(); refit(); renderList();
}

// ---- storms in the last chapter -------------------------------------------------------------------------
function markChips() { document.querySelectorAll("#stormChips .chip").forEach(b => b.classList.toggle("on", b.dataset.sid === state.storm)); }
function playStorm(sid) {
  const s = D.storms.find(x => x.sid === sid); if (!s) return;
  if (state.dom !== EXPLORE) { goChapter(EXPLORE, true); state.ps = state.p; onChapter(EXPLORE); }
  if (state.pick) { state.pick = 0; terrain.uniforms.uPick.value = 0; districts.children.forEach(l => l.material.opacity = 0); }
  state.storm = sid; markChips(); cards.showStorm(s); refit();
  const pts = s.pts.filter(p => p[0] > GRID.W - 1 && p[0] < GRID.E + 1 && p[1] > 15 && p[1] < GRID.N);
  const b = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  state.override = camFrom(fitView({ box: [b[0] - 0.3, Math.max(15, b[1]), b[2] + 0.3, b[3]], tilt: 62, az: 185, top: 10 })); state.userCam = false;
  player.play(s, storms.children.find(o => o.name === sid)); renderList();
}

// ---- resize: the free region changes when the sheet opens or the window resizes --------------------------
function refit() { applyOffset(camera); views = CHAPTERS.map(ch => fitView(ch.view)); }
function resize() { renderer.setSize(stage.clientWidth, stage.clientHeight, false); refit(); layoutTrack(); onScroll(); }
addEventListener("resize", resize);

boot().catch(err => { console.error(err); stage.insertAdjacentHTML("beforeend", `<div class="loading">Could not start the 3D scene: ${err.message}</div>`); });
