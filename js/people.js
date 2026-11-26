// people.js  --  v15, v16 (fill under the district line): population 1971-2050, health care within reach, and where 2050 presses hardest.
// The map side: health facilities as points that keep their size on screen (complexes, district hospitals, tertiary
// hospitals with a slow pulse). The panel side: the national line with its projection band, the model scores,
// the catchments of the tertiary hospitals, and the burden list.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=16";
import { BASE, CARE, POPC, ACC, BURD } from "./palette.js?v=16";
const fmt = d3.format(","), f1 = d3.format(".1f");
const T = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
export const M = v => v >= 1e6 ? f1(v / 1e6) + " M" : fmt(Math.round(v / 1000)) + "k";

function sprite(kind) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
  if (kind === "dot") { x.fillStyle = "#fff"; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = "#000"; x.beginPath(); x.arc(32, 32, 22, 0, 7); x.fill(); }
  if (kind === "sq") { x.fillStyle = "#fff"; x.fillRect(4, 4, 56, 56); x.fillStyle = "#000"; x.fillRect(12, 12, 40, 40); }
  if (kind === "ring") { x.fillStyle = "#fff"; x.beginPath(); x.arc(32, 32, 31, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 9; x.beginPath(); x.arc(32, 32, 21, 0, 7); x.stroke(); x.fillStyle = "#000"; x.beginPath(); x.arc(32, 32, 8, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
// the texture is black on white: black takes the colour, white stays a halo
const FS = `uniform sampler2D map; uniform vec3 col; uniform float op; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.05) discard; gl_FragColor = vec4(mix(col, vec3(1.0), t.r), t.a * op); }`;
const VS = `uniform float size; uniform float pr; void main(){ gl_PointSize = size * pr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
function points(pts, kind, col, size, sampleH) {
  const pos = []; pts.forEach(p => { const v = toScene(p[0], p[1]); v.y = Math.max(sampleH(p[0], p[1]), 0) * 0.001 * 14 + 2.5; pos.push(v.x, v.y, v.z); });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false,
    uniforms: { map: { value: sprite(kind) }, col: { value: new THREE.Color(col) }, op: { value: 0 }, size: { value: size }, pr: { value: Math.min(devicePixelRatio, 2) } } });
  const o = new THREE.Points(g, m); o.frustumCulled = false; o.renderOrder = 5; o.userData.size = size; return o;
}
export function buildHealth(P, sampleH) {
  const G = new THREE.Group(); G.name = "health"; const A = P.access;
  G.add(Object.assign(points(A.uhc, "dot", CARE.uhc, 7, sampleH), { name: "uhc" }));
  G.add(Object.assign(points(A.dh.map(d => [d[0], d[1]]), "sq", CARE.dh, 12, sampleH), { name: "dh" }));
  // Dhaka's institutes sit on top of each other: draw tertiary care once per district town
  const seen = new Set(), ter = A.ter.filter(t => { const k = t[2]; if (t[2] === "Dhaka") { if (seen.has(k)) return false; seen.add(k); } return true; });
  G.add(Object.assign(points(ter.map(t => [t[0], t[1]]), "ring", CARE.ter, 17, sampleH), { name: "ter" }));
  return G;
}
// o: layer strength; kind: which facility the reader is looking at (the others step back)
export function updateHealth(G, o, time, kind) {
  G.visible = o > 0.01; if (!G.visible) return false;
  G.children.forEach(p => { const u = p.material.uniforms; const focus = !kind || kind === "all" || kind === p.name || (kind === "uhc" && p.name === "dh");
    u.op.value = o * (focus ? 1 : 0.28); u.size.value = p.userData.size * (p.name === "ter" && focus ? 1 + 0.12 * Math.sin(time * 2.6) : 1); });
  return true;
}

// ---- the national line: 1971 to 2025 counted, 2026 to 2050 projected ---------------------------------------
export function drawPopNat(el, P, onPick) {
  el.innerHTML = ""; const N = P.national; const w = Math.max(300, el.clientWidth || 360), h = 230, m = { l: 40, r: 12, t: 14, b: 26 };
  const s = d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif").style("cursor", "crosshair");
  const x = d3.scaleLinear().domain([1971, 2050]).range([m.l, w - m.r]); const y = d3.scaleLinear().domain([60e6, 245e6]).range([h - m.b, m.t]);
  [100e6, 150e6, 200e6].forEach(v => { s.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", BASE.line);
    s.append("text").attr("x", m.l - 6).attr("y", y(v) + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("fill", BASE.dim).attr("font-family", "IBM Plex Mono").text(v / 1e6 + " M"); });
  [1971, 1991, 2011, 2025, 2050].forEach(v => s.append("text").attr("x", x(v)).attr("y", h - 8).attr("text-anchor", "middle").attr("font-size", 11.5).attr("fill", BASE.dim).attr("font-family", "IBM Plex Mono").text(v));
  s.append("rect").attr("x", x(2025)).attr("y", m.t).attr("width", x(2050) - x(2025)).attr("height", h - m.b - m.t).attr("fill", "#f6f4fa");
  s.append("text").attr("x", x(2026) + 4).attr("y", h - m.b - 6).attr("font-size", 11.5).attr("fill", CARE.proj).text("projected");
  const band = [[2025, N.wdi[N.years.indexOf(2025)], N.wdi[N.years.indexOf(2025)]], ...N.band];
  s.append("path").attr("d", d3.area().x(d => x(d[0])).y0(d => y(d[1])).y1(d => y(d[2]))(band)).attr("fill", CARE.proj).attr("opacity", 0.16);
  const obs = N.years.map((yv, i) => [yv, N.wdi[i]]).filter(d => d[0] >= 1971);
  const draw = (pts, col, wd, dash) => { const p = s.append("path").attr("d", d3.line().x(d => x(d[0])).y(d => y(d[1]))(pts)).attr("fill", "none").attr("stroke", col).attr("stroke-width", wd); if (dash) p.attr("stroke-dasharray", dash);
    else if (T()) { const L = p.node().getTotalLength(); p.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L).transition().duration(1400).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0); } return p; };
  draw(N.wb, CARE.wb, 1.5, "4 3");
  draw(obs, BASE.ink, 2.2);
  draw([[2025, obs[obs.length - 1][1]], ...N.proj], CARE.proj, 2.4);
  N.census.forEach(c => s.append("circle").attr("cx", x(c[0])).attr("cy", y(c[2])).attr("r", 3.6).attr("fill", "#fff").attr("stroke", BASE.ink).attr("stroke-width", 1.6).append("title").text(`Census ${c[0]}: ${M(c[1])} counted, ${M(c[2])} after adjustment`));
  const last = N.proj[N.proj.length - 1], wbl = N.wb[N.wb.length - 1];
  const lab = (yy, t, c) => s.append("text").attr("x", w - m.r).attr("y", yy).attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 600).attr("fill", c).text(t);
  // labels sit left of the projection, above and below the lines
  const lab2 = (yy, t, c) => s.append("text").attr("x", x(2024)).attr("y", yy).attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 600).attr("fill", c).text(t);
  lab2(y(wbl[1]) + 2, "World Bank " + M(wbl[1]), CARE.wb); lab2(y(wbl[1]) + 17, "this model " + M(last[1]), CARE.proj);
  const mk = s.append("g"); mk.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", BASE.ink).attr("stroke-width", 1).attr("stroke-dasharray", "2 2");
  mk.append("circle").attr("r", 5).attr("fill", BASE.ink).attr("stroke", "#fff").attr("stroke-width", 2);
  const at = yr => { if (yr <= 2025) return N.wdi[N.years.indexOf(Math.round(yr))]; const k = N.proj.find(p => p[0] === Math.round(yr)); return k ? k[1] : last[1]; };
  const move = yr => { mk.attr("transform", `translate(${x(yr)},0)`); mk.select("circle").attr("cy", y(at(yr))); };
  s.on("click", e => { const yr = Math.round(x.invert(d3.pointer(e)[0])); onPick?.(Math.max(1991, Math.min(2050, yr))); });
  move(2022); return { move, at };
}
// the model scores as a small table
export function modelTable(P) {
  const rows = P.national.models.map(m => `<tr class="${m.used ? "" : "off"}"><td>${m.name}</td><td>${f1(m.mape15)}%</td><td>${f1(m.mape30)}%</td><td>${m.used ? Math.round(m.weight * 100) + "%" : "dropped"}</td><td>${M(m.p2050)}</td></tr>`).join("");
  return `<table class="mtab"><thead><tr><th>Model</th><th>Error, 15 yr</th><th>Error, 30 yr</th><th>Weight</th><th>2050</th></tr></thead><tbody>${rows}</tbody></table>`;
}
export function districtModelTable(P) {
  return `<table class="mtab"><thead><tr><th>District model</th><th>Error in 2022</th><th>Worst miss</th></tr></thead><tbody>${P.district_models.map(m => `<tr class="${m.used ? "use" : ""}"><td>${m.name}${m.used ? " ✓" : ""}</td><td>${f1(m.mape)}%</td><td>${m.worst} ${f1(m.worst_err)}%</td></tr>`).join("")}</tbody></table>`;
}
// people whose nearest tertiary hospital is this one, now and in 2050
export function drawCatch(el, P, onPick) {
  el.innerHTML = ""; const C = P.access.catch.slice(0, 12); const w = Math.max(300, el.clientWidth || 360), rowH = 30, x0 = 150;
  const x = d3.scaleLinear().domain([0, d3.max(C, c => Math.max(c.p22, c.p50))]).range([0, w - x0 - 64]);
  const s = d3.select(el).append("svg").attr("width", w).attr("height", C.length * rowH + 18).attr("font-family", "IBM Plex Sans, sans-serif");
  const short = n => n.replace(" Medical College Hospital", "").replace("Shaheed ", "").replace(", ", " · ").replace(" and institutes", "");
  C.forEach((c, i) => { const g = s.append("g").attr("transform", `translate(0,${i * rowH})`).style("cursor", "pointer").on("click", () => onPick?.(c));
    g.append("rect").attr("width", w).attr("height", rowH - 2).attr("fill", "transparent");
    g.append("text").attr("x", 0).attr("y", 18).attr("font-size", 12.5).attr("font-weight", i < 3 ? 600 : 500).attr("fill", BASE.ink).text(short(c.name).slice(0, 22)).append("title").text(c.name);
    g.append("line").attr("x1", x0 + x(c.p22)).attr("x2", x0 + x(c.p22)).attr("y1", 14).attr("y2", 14).attr("stroke", CARE.proj).attr("stroke-width", 2).transition().delay(i * 50 * T()).duration(700 * T()).attr("x2", x0 + x(c.p50));
    g.append("circle").attr("cx", x0 + x(c.p22)).attr("cy", 14).attr("r", 4.5).attr("fill", BASE.ink);
    g.append("circle").attr("cx", x0 + x(c.p22)).attr("cy", 14).attr("r", 4.5).attr("fill", CARE.proj).transition().delay(i * 50 * T()).duration(700 * T()).attr("cx", x0 + x(c.p50));
    g.append("text").attr("x", x0 + x(c.p50) + 9).attr("y", 18).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", BASE.ink).text(M(c.p50)); });
  s.append("g").attr("transform", `translate(0,${C.length * rowH + 12})`).call(g => { g.append("circle").attr("cx", 4).attr("cy", -4).attr("r", 4).attr("fill", BASE.ink); g.append("text").attr("x", 12).attr("y", 0).attr("font-size", 11.5).attr("fill", BASE.dim).text("2022");
    g.append("circle").attr("cx", 54).attr("cy", -4).attr("r", 4).attr("fill", CARE.proj); g.append("text").attr("x", 62).attr("y", 0).attr("font-size", 11.5).attr("fill", BASE.dim).text("2050, projected"); });
}
// a district's line in the sheet
export function drawDistrictPop(el, P, name) {
  el.innerHTML = ""; const D = P.districts[name]; const ys = P.years; const w = Math.max(280, el.clientWidth || 340), h = 150, m = { l: 44, r: 10, t: 10, b: 22 };
  const s = d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif");
  const x = d3.scaleLinear().domain([1991, 2050]).range([m.l, w - m.r]); const y = d3.scaleLinear().domain([0, d3.max(D.pop) * 1.08]).nice().range([h - m.b, m.t]);
  y.ticks(3).forEach(v => { s.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", BASE.line); s.append("text").attr("x", m.l - 6).attr("y", y(v) + 4).attr("text-anchor", "end").attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", BASE.dim).text(M(v)); });
  [1991, 2022, 2050].forEach(v => s.append("text").attr("x", x(v)).attr("y", h - 6).attr("text-anchor", "middle").attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", BASE.dim).text(v));
  const pts = ys.map((yy, i) => [yy, D.pop[i]]);
  const ln = (a, c) => { const p = s.append("path").attr("d", d3.line().x(d => x(d[0])).y(d => y(d[1]))(a)).attr("fill", "none").attr("stroke", c).attr("stroke-width", 2.2); if (T()) { const L = p.node().getTotalLength(); p.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L).transition().duration(900).attr("stroke-dashoffset", 0); } };
  const fill = (a, c, o) => { const f = s.append("path").attr("d", d3.area().x(d => x(d[0])).y0(y(0)).y1(d => y(d[1]))(a)).attr("fill", c).attr("opacity", 0); f.transition().delay(500 * T()).duration(600 * T()).attr("opacity", o); };
  fill(pts.filter(p => p[0] <= 2022), BASE.ink, 0.07); fill(pts.filter(p => p[0] >= 2022), CARE.proj, 0.16);
  ln(pts.filter(p => p[0] <= 2022), BASE.ink); ln(pts.filter(p => p[0] >= 2022), CARE.proj);
  [1991, 2001, 2011, 2022].forEach((yy, i) => s.append("circle").attr("cx", x(yy)).attr("cy", y(D.census[i])).attr("r", 3.4).attr("fill", "#fff").attr("stroke", BASE.ink).attr("stroke-width", 1.6).append("title").text(`Census ${yy}: ${fmt(D.census[i])} (adjusted)`));
}
export const popHex = dens => POPC[d3.bisectRight([800, 1100, 1500, 2500], dens)];
export const ACC_BR = { uhc: [4, 6, 8, 10], dh: [10, 15, 22, 30], ter: [15, 25, 40, 60] };
export const accHex = (km, k) => ACC[d3.bisectRight(ACC_BR[k], km)];
export const burdHex = b => BURD[d3.bisectRight([40, 50, 60, 70], b)];
