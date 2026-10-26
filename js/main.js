// main.js  --  wires the scene to the scroll.
import * as THREE from "three";
import { OrbitControls } from "../lib/OrbitControls.js";
import { buildTerrain, heightSampler, toScene, SIZE } from "./terrain.js";
import { buildStorms, buildPopulation, buildFarRivers, buildRivers, buildOutlines, makeLabel, PLACES } from "./layers.js";
import { CHAPTERS } from "./story.js";
import { charts } from "./charts.js";

const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(new URLSearchParams(location.search).get("lod") === "low" ? 1 : Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(0x05070a, 1);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x05070a, 700, 1500);
const camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);
const controls = new OrbitControls(camera, renderer.domElement); controls.enabled = false; controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 25; controls.maxDistance = 1400;

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const tex = (img, nearest = false) => { const t = new THREE.Texture(img); t.needsUpdate = true; t.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true; return t; };

window.__poli = { get state(){ return state; }, get terrain(){ return terrain; }, goTo: (i)=>goTo(i) };
const state = { chapter: -1, exag: 14, t0: performance.now(), orbit: 0, free: false, stormYear: 2025 };
let terrain, storms, pop, farRivers, rivers, outlines, labels, sampleH, exposure;

async function boot() {
  const [hImg, mImg, pImg, cImg, cRGB, far, stormsJson, expo, riversJson, coverStats, haorsJson] = await Promise.all([
    loadImg("data/height.png"), loadImg("data/mask.png"), loadImg("data/pop.png"), loadImg("data/cover.png"), loadImg("data/cover_rgb.png"),
    fetch("data/rivers_far.geojson").then(r => r.json()), fetch("data/storms.json").then(r => r.json()), fetch("data/exposure.json").then(r => r.json()),
    fetch("data/rivers.json").then(r => r.json()), fetch("data/cover_stats.json").then(r => r.json()), fetch("data/haors.geojson").then(r => r.json())
  ]);
  exposure = expo; sampleH = heightSampler(hImg);
  // mesh density: ?lod=hi for a strong GPU, ?lod=low for weak machines and screenshots
  const lod = new URLSearchParams(location.search).get("lod");
  terrain = buildTerrain({ height: tex(hImg), mask: tex(mImg), cover: tex(cImg, true), coverRGB: tex(cRGB) }, lod === "hi" ? 1023 : lod === "low" ? 255 : 511); scene.add(terrain.mesh);
  rivers = buildRivers(riversJson, sampleH, 14); scene.add(rivers);
  farRivers = buildFarRivers(far, sampleH, 14); scene.add(farRivers);
  outlines = buildOutlines(haorsJson, sampleH, 14); scene.add(outlines);
  storms = buildStorms(stormsJson, sampleH, 14); scene.add(storms);
  pop = buildPopulation(pImg, sampleH, 14); scene.add(pop);
  labels = new THREE.Group();
  for (const [n, lon, lat] of PLACES) { const s = makeLabel(n, { size: n === "Bay of Bengal" ? 20 : 17, weight: n === "Dhaka" ? 800 : 600 }); const p = toScene(lon, lat); p.y = Math.max(sampleH(lon, lat), 0) * 0.001 * 14 + 6; s.position.copy(p); s.userData.kind = "place"; labels.add(s); }
  scene.add(labels);
  charts.init(exposure, stormsJson, coverStats);
  buildNav(); document.body.classList.add("ready");
  resize(); goTo(0, true); requestAnimationFrame(frame);
  // storms: keep track geometry heights in sync with exaggeration by rebuilding when exag settles (cheap, 90 lines)
  state.stormsJson = stormsJson;
}

// ---- tweening ---------------------------------------------------------------------------------
const tweens = [];
function tween(obj, key, to, ms, ease = easeInOut) { const from = obj[key]; tweens.push({ obj, key, from, to, t0: performance.now(), ms, ease }); }
function untween(obj, key) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj && tweens[i].key === key) tweens.splice(i, 1); }
function tweenVec(v, to, ms) { const from = v.clone(); tweens.push({ vec: v, from, to: to.clone(), t0: performance.now(), ms, ease: easeInOut }); }
const easeInOut = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
function runTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; const t = Math.min(1, (now - w.t0) / w.ms), e = w.ease(t);
    if (w.vec) w.vec.copy(w.from).lerp(w.to, e); else w.obj[w.key] = w.from + (w.to - w.from) * e;
    if (t >= 1) tweens.splice(i, 1); }
}
const camTarget = new THREE.Vector3();

function goTo(i, instant = false) {
  if (!terrain || i === state.chapter) return; state.chapter = i;
  const ch = CHAPTERS[i]; const ms = instant ? 1 : 1800;
  state.free = false; controls.enabled = false; document.getElementById("freeBtn").classList.remove("on");
  tweenVec(camera.position, ch.cam.pos, ms); tweenVec(camTarget, ch.cam.look, ms);
  for (const [k, v] of Object.entries(ch.u)) tween(terrain.uniforms[k], "value", v, ms);
  tween(state, "orbit", ch.orbit || 0, ms);
  tween(pop.material.uniforms.uOpacity, "value", ch.layers.pop, ms);
  farRivers.children.forEach(l => tween(l.material, "opacity", 0.55 * ch.layers.farRivers, ms));
  outlines.children.forEach(o => tween(o.material, "opacity", (o.name === "outline" ? 0.9 : 1) * (ch.layers.outlines ?? 0), ms));
  rivers.children.forEach(o => { const v = ch.layers.rivers ?? 0; tween(o.material, "opacity", o.name === "major" ? 0.85 * v : o.name === "minor" ? 0.35 * v : (ch.layers.riverLabels ?? 0), ms); });
  labels.children.forEach(s => tween(s.material, "opacity", (s.userData.kind === "river" ? 0.8 : 1) * ch.layers.labels * (ch.id === "rivers" || ch.id === "silt" || s.userData.kind === "place" ? 1 : 0.5), ms));
  // storms: which ones show
  storms.children.forEach(o => {
    const s = o.userData; const isRing = o.name.startsWith("ring-") || o.name.startsWith("lab-");
    let on = ch.layers.storms > 0;
    if (on && ch.namedOnly) on = !!s.note;
    if (on && ch.stormYears) on = s.season >= ch.stormYears[0] && s.season <= ch.stormYears[1];
    if (ch.id === "storms") { o.material.opacity = 0; return; }   // the storm clock reveals these one year at a time
    tween(o.material, "opacity", on ? (isRing ? 0.9 : (s.note ? 0.75 : 0.35) * ch.layers.storms) : 0, ms);
  });
  if (ch.id === "storms") charts.playStorms(storms, state); else charts.stopStorms();
  document.querySelectorAll(".step").forEach((el, j) => el.classList.toggle("on", j === i));
  document.querySelectorAll("#chapterNav a").forEach(a => { const on = +a.dataset.i === i; a.classList.toggle("on", on); if (on) a.parentElement.scrollTo({ left: a.offsetLeft - a.parentElement.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" }); });
  showLegend(ch.legend);
  if (ch.seaSlider) charts.bindSea(terrain.uniforms.uSeaLevel, exposure, ch.u.uSeaLevel, v => { untween(terrain.uniforms.uSeaLevel, "value"); terrain.uniforms.uSeaLevel.value = v; });
}

// ---- frame loop -------------------------------------------------------------------------------
function frame(now) {
  state.frames = (state.frames || 0) + 1;
  runTweens(now);
  terrain.uniforms.uTime.value = (now - state.t0) / 1000;
  if (state.free) { controls.update(); }
  else {
    if (state.orbit) { const a = state.orbit * 0.016; const p = camera.position.clone().sub(camTarget); p.applyAxisAngle(new THREE.Vector3(0, 1, 0), a); camera.position.copy(camTarget).add(p); }
    camera.lookAt(camTarget);
  }
  // labels scale with distance so they stay readable
  const d = camera.position.distanceTo(camTarget);
  labels.children.forEach(s => { const k = d / 900; s.scale.set(s.userData.base.w * k, s.userData.base.h * k, 1); });
  rivers.children.forEach(s => { if (s.isSprite) { const k = d / 900; s.scale.set(s.userData.base.w * k, s.userData.base.h * k, 1); } });
  outlines.children.forEach(s => { if (s.isSprite) { const k = d / 900; s.scale.set(s.userData.base.w * k, s.userData.base.h * k, 1); } });
  storms.children.forEach(s => { if (s.userData.isStormLabel) { const k = d / 900; s.scale.set(s.userData.base.w * k, s.userData.base.h * k, 1); } });
  pop.material.uniforms.uScale.value = Math.min(2.2, 420 / d);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize);

// ---- scroll -> chapter ------------------------------------------------------------------------
const steps = [...document.querySelectorAll(".step")];
const io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) goTo(+e.target.dataset.i); }); }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
steps.forEach(s => io.observe(s));

// ---- free exploration ---------------------------------------------------------------------------
document.getElementById("freeBtn").addEventListener("click", e => {
  state.free = !state.free; e.currentTarget.classList.toggle("on", state.free);
  if (state.free) { controls.target.copy(camTarget); controls.enabled = true; tweens.length = 0; state.orbit = 0; }
  else { goTo(state.chapter, false); state.chapter = -1; goTo(+document.querySelector(".step.on")?.dataset.i || 0); }
});
document.getElementById("exagRange").addEventListener("input", e => { terrain.uniforms.uExag.value = +e.target.value; });

boot().catch(err => { console.error(err); document.getElementById("stage").insertAdjacentHTML("beforeend", `<div class="err">Could not start the 3D scene: ${err.message}. This page needs WebGL.</div>`); });

// ---- chapter nav + legend ----------------------------------------------------------------------
function buildNav() {
  const nav = document.getElementById("chapterNav"); const seen = new Set();
  CHAPTERS.forEach((ch, i) => { if (!ch.nav || seen.has(ch.nav)) return; seen.add(ch.nav);
    const a = document.createElement("a"); a.href = "#"; a.textContent = ch.nav; a.dataset.i = i;
    a.addEventListener("click", e => { e.preventDefault(); document.querySelectorAll(".step")[i].scrollIntoView({ behavior: "smooth", block: "center" }); }); nav.appendChild(a); });
}
const LEGENDS = {
  cover: ["Land cover, ESA WorldCover 2021", ["#a99e5c", "cropland"], ["#2b5c33", "tree cover, groves"], ["#1a4d3d", "mangrove"], ["#4d857a", "wetland"], ["#c7946a", "built-up"], ["#17334d", "water"]],
  low: ["Height above sea", ["#c8843a", "land under the tint height"], ["#a99e5c", "higher ground"]],
  rivers: ["Rivers", ["line:#8ccfe8", "big river (discharge)"], ["line:#3f6a80", "small channel"], ["#17334d", "water surface"]],
  forest: ["Forest", ["#1f7a60", "mangrove, lifted"], ["#2b5c33", "other tree cover"], ["#17334d", "creeks and the Bay"]],
  wet: ["Wetlands", ["#5fb3b0", "herbaceous wetland, lifted"], ["#17334d", "open water"], ["#2b5c33", "tree cover"]],
  loss: ["Forest change", ["#f2482a", "tree cover lost 2001–2023 (Hansen)"], ["#2b5c33", "tree cover standing"]],
  rise: ["Sea-level slider", ["#c04d2a", "land at or below the chosen level"], ["#a99e5c", "dry land"]],
  storms: ["Cyclone tracks, IBTrACS", ["line:#ff5a3c", "96 kt and more"], ["line:#ff9a3c", "64–95 kt"], ["line:#f2c35a", "34–63 kt"], ["dot:#ffd27a", "named storm near landfall"]],
  people: ["People, GPW 2015", ["dot:#f6e2a8", "square km with people, brighter = more"], ["#c7946a", "built-up land"]]
};
function showLegend(key) {
  const L = LEGENDS[key] || LEGENDS.cover; const el = document.getElementById("legend");
  el.innerHTML = `<h4>${L[0]}</h4>` + L.slice(1).map(([c, t]) => { const [kind, col] = c.includes(":") ? c.split(":") : ["fill", c]; return `<div class="row"><span class="sw ${kind === "fill" ? "" : kind}" style="background:${col}"></span><span>${t}</span></div>`; }).join("");
}
