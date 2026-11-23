// v12.js  --  the Sundarbans, the crop calendar and the tea gardens.
// Map: the mangrove forest as a filled shape with its outline; tea gardens as discs on each district, sized by number.
// Panels: a year calendar of what is in the ground (with a playhead the map follows), tea output, tigers, fish caught.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=12";
import { makeLabel } from "./layers.js?v=12";
import { MANGROVE, TEA, SEASONCOL, BASE } from "./palette.js?v=12";

const fmt = d3.format(","), f1 = d3.format(".1f");
const T = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
const C = { ink: BASE.ink, dim: BASE.dim, line: BASE.line };
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// is month m (0..11) inside a field span [a, b] of 1-based months that may wrap the year?
export const inField = (span, m) => { const a = span[0] - 1, b = span[1] - 1; return a <= b ? m >= a && m <= b : m >= a || m <= b; };
const mat = (color, op) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }); return m; };
const lab = (text, lon, lat, y, o) => { const s = makeLabel(text, o); const p = toScene(lon, lat); p.y = y; s.position.copy(p); s.userData.op = 1; return s; };

export function buildV12(V, centroids) {
  const G = {}; const mk = n => (G[n] = new THREE.Group(), G[n].name = "v12-" + n, G[n]);
  // ---- the mangrove forest
  const M = mk("mangrove"); const v2 = ([lon, lat]) => { const p = toScene(lon, lat); return new THREE.Vector2(p.x, -p.z); };
  const shapes = V.sund.poly.map(p => { const s = new THREE.Shape(p.o.map(v2)); p.h.forEach(h => s.holes.push(new THREE.Path(h.map(v2)))); return s; });
  const geo = new THREE.ShapeGeometry(shapes, 2); geo.rotateX(-Math.PI / 2);
  const fill = new THREE.Mesh(geo, mat(MANGROVE.fill)); fill.position.y = 1.1; fill.userData.op = 0.62; M.add(fill);
  V.sund.poly.forEach(p => { const pts = p.o.map(([lon, lat]) => { const q = toScene(lon, lat); q.y = 1.3; return q; });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: MANGROVE.edge, transparent: true, opacity: 0 })); line.userData.op = 0.9; M.add(line); });
  M.add(lab("Sundarbans", 89.55, 21.95, 8, { size: 22, weight: 600, color: MANGROVE.text }));
  M.add(lab("6,017 km² in Bangladesh", 89.55, 21.85, 6, { size: 14, weight: 500, color: "#374151" }));
  // ---- tea gardens: one disc per district, its area proportional to the number of gardens
  const TG = mk("tea");
  V.tea.gardens.forEach(([name, n]) => { const c = centroids[name]; if (!c) return; const p = toScene(c[0], c[1]); const r = 2.2 + Math.sqrt(n) * 1.6;
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat(TEA.fill)); d.rotation.x = -Math.PI / 2; d.position.set(p.x, 3, p.z); d.userData.op = 0.78; TG.add(d);
    const e = new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r + 0.2, 48), mat(TEA.edge)); e.rotation.x = -Math.PI / 2; e.position.set(p.x, 3.1, p.z); e.userData.op = 1; TG.add(e);
    TG.add(lab(`${name} ${n}`, c[0], c[1] + r / 111 + 0.05, 7, { size: 14, weight: 600, color: TEA.text })); });
  return G;
}
export function updateV12(G, v, time, lf) {
  const set = (g, o) => { g.visible = o > 0.01; if (!g.visible) return; g.children.forEach(c => { c.material.opacity = o * (c.userData.op ?? 1) * (c.isSprite ? lf : 1); }); };
  set(G.mangrove, v.mangrove || 0); set(G.tea, v.tea || 0);
}

// ---------------------------------------------------------------------------------------------------------
function svgIn(el, h) { el.innerHTML = ""; const w = Math.max(280, el.clientWidth || 340); return { s: d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
const grow = (sel, delay = 0, dur = 800) => sel.transition().delay(delay * T()).duration(dur * T()).ease(d3.easeCubicOut);

// the year: three season bands on top, one row per crop with its time in the field, a playhead for the month on the map
export function drawCalendar(el, V, onMonth) {
  const rows = V.calendar; const top = 30, rowH = 30; const { s, w } = svgIn(el, top + rows.length * rowH + 26); const x0 = 76, x1 = w - 4;
  const x = d3.scaleLinear().domain([0, 12]).range([x0, x1]);
  V.seasons.forEach((se, k) => { const spans = se.from <= se.to ? [[se.from - 1, se.to]] : [[se.from - 1, 12], [0, se.to]];
    spans.forEach(([a, b]) => s.append("rect").attr("x", x(a)).attr("y", 4 + k * 0).attr("width", x(b) - x(a)).attr("height", 14).attr("fill", ["#eef2f7", "#fdf3e0", "#e6f0f8"][k]).attr("opacity", 0.9));
    const mid = se.from <= se.to ? (se.from - 1 + se.to) / 2 : (se.from - 1 + 12 + se.to) / 2 % 12; s.append("text").attr("x", x(mid)).attr("y", 15).attr("text-anchor", "middle").attr("font-size", 10.5).attr("font-weight", 600).attr("fill", "#4b5563").text(se.name); });
  MON.forEach((m, i) => { s.append("text").attr("x", x(i + 0.5)).attr("y", top + rows.length * rowH + 16).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", C.dim).text(m[0]);
    s.append("line").attr("x1", x(i)).attr("x2", x(i)).attr("y1", top - 4).attr("y2", top + rows.length * rowH).attr("stroke", C.line); });
  rows.forEach((r, k) => { const y = top + k * rowH; const a = r.field[0] - 1, b = r.field[1];
    s.append("text").attr("x", 0).attr("y", y + 19).attr("font-size", 12.5).attr("font-weight", 600).attr("fill", C.ink).text(r.name);
    const spans = a < b ? [[a, b]] : [[a, 12], [0, b]];
    spans.forEach(([p, q], j) => s.append("rect").attr("x", x(p)).attr("y", y + 7).attr("height", 16).attr("rx", 3).attr("width", 0).attr("fill", SEASONCOL[r.crop]).call(g => grow(g, k * 110 + j * 200, 700).attr("width", x(q) - x(p) - 1)).append("title").text(`${r.name}: ${r.sow}; harvest ${r.harvest}`)); });
  const head = s.append("g").attr("class", "playhead"); head.append("rect").attr("x", -1).attr("y", top - 6).attr("width", 2).attr("height", rows.length * rowH + 8).attr("fill", C.ink);
  head.append("circle").attr("cy", top - 6).attr("r", 4).attr("fill", C.ink);
  // click or drag anywhere to pick a month
  const pick = e => { const [px] = d3.pointer(e); onMonth && onMonth(Math.max(0, Math.min(11.99, x.invert(px)))); };
  s.append("rect").attr("x", x0).attr("y", 0).attr("width", x1 - x0).attr("height", top + rows.length * rowH + 20).attr("fill", "transparent").style("cursor", "ew-resize").on("pointerdown", pick).on("pointermove", e => { if (e.buttons) pick(e); });
  return { move: m => head.attr("transform", `translate(${x(m)},0)`) };
}
// tea gardens by district, and output by year
export function drawTea(el, V) {
  const d = V.tea.gardens; const rowH = 22; const { s, w } = svgIn(el, d.length * rowH + 4); const x0 = 96; const x = d3.scaleLinear().domain([0, d3.max(d, r => r[1])]).range([0, w - x0 - 40]);
  d.forEach(([n, v], i) => { const y = i * rowH; s.append("text").attr("x", 0).attr("y", y + 14).attr("font-size", 12.5).attr("fill", C.ink).text(n);
    s.append("rect").attr("x", x0).attr("y", y + 4).attr("height", 13).attr("width", 0).attr("fill", TEA.fill).call(g => grow(g, i * 70).attr("width", Math.max(2, x(v))));
    s.append("text").attr("x", x0 + Math.max(2, x(v)) + 6).attr("y", y + 15).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(v); });
}
export function drawTeaOut(el, V) {
  const all = V.tea.output, north = V.tea.north; const { s, w } = svgIn(el, 150); const years = d3.range(2021, 2026);
  const x = d3.scaleBand().domain(years).range([30, w - 6]).padding(0.28); const y = d3.scaleLinear().domain([0, 110]).range([120, 10]);
  [25, 50, 75, 100].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 0).attr("y", y(v) + 4).attr("font-size", 10.5).attr("fill", C.dim).text(v); });
  years.forEach((yr, i) => { const a = all.find(r => r[0] === yr), n = north.find(r => r[0] === yr);
    if (a) { s.append("rect").attr("x", x(yr)).attr("width", x.bandwidth()).attr("y", 120).attr("height", 0).attr("fill", "#c7e9c0").call(g => grow(g, i * 90).attr("y", y(a[1])).attr("height", 120 - y(a[1])));
      s.append("text").attr("x", x(yr) + x.bandwidth() / 2).attr("y", y(a[1]) - 5).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(f1(a[1])); }
    if (n) s.append("rect").attr("x", x(yr) + x.bandwidth() * 0.2).attr("width", x.bandwidth() * 0.6).attr("y", 120).attr("height", 0).attr("fill", TEA.fill).call(g => grow(g, 300 + i * 90).attr("y", y(n[1])).attr("height", 120 - y(n[1])));
    s.append("text").attr("x", x(yr) + x.bandwidth() / 2).attr("y", 138).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(yr); });
}
// tigers by survey, and fish caught in the forest
export function drawTigers(el, V) {
  const d = V.sund.tigers; const { s, w } = svgIn(el, 120); const x = d3.scaleBand().domain(d.map(r => r[0])).range([0, w]).padding(0.45); const y = d3.scaleLinear().domain([0, 140]).range([92, 10]);
  d.forEach(([yr, n], i) => { s.append("rect").attr("x", x(yr)).attr("width", x.bandwidth()).attr("y", 92).attr("height", 0).attr("fill", "#d95f02").call(g => grow(g, i * 160).attr("y", y(n)).attr("height", 92 - y(n)));
    s.append("text").attr("x", x(yr) + x.bandwidth() / 2).attr("y", y(n) - 6).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 600).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(n);
    s.append("text").attr("x", x(yr) + x.bandwidth() / 2).attr("y", 110).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(yr); });
}
export function drawSundFish(el, V) {
  const d = V.sund.fish; const { s, w } = svgIn(el, 130); const x = d3.scaleLinear().domain([0, d.length - 1]).range([34, w - 50]); const y = d3.scaleLinear().domain([0, 32000]).range([100, 10]);
  [10000, 20000, 30000].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w - 50).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 0).attr("y", y(v) + 4).attr("font-size", 10.5).attr("fill", C.dim).text(v / 1000 + "k"); });
  const a = d3.area().x((p, i) => x(i)).y0(100).y1(p => y(p[1])).curve(d3.curveMonotoneX), l = d3.line().x((p, i) => x(i)).y(p => y(p[1])).curve(d3.curveMonotoneX);
  const clip = s.append("clipPath").attr("id", "sfClip").append("rect").attr("height", 130).attr("width", 0); grow(clip, 0, 1200).attr("width", w);
  const g = s.append("g").attr("clip-path", "url(#sfClip)"); g.append("path").attr("d", a(d)).attr("fill", MANGROVE.fill).attr("opacity", 0.25); g.append("path").attr("d", l(d)).attr("fill", "none").attr("stroke", MANGROVE.edge).attr("stroke-width", 1.6);
  const last = d[d.length - 1]; s.append("text").attr("x", x(d.length - 1) + 4).attr("y", y(last[1]) + 4).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(fmt(last[1]) + " t");
  [0, d.length - 1].forEach(i => s.append("text").attr("x", x(i)).attr("y", 120).attr("text-anchor", i ? "end" : "start").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(d[i][0]));
}
