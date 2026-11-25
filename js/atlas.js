// atlas.js  --  v10: the map layers and the panel charts of the atlas sections (Rivers, Fish, Crops, Hazards).
// Map: river junctions, hilsa sanctuaries, the Halda, the sea fishing grounds, a run of hilsa moving upriver,
// FFWC flood gauges as columns (height = how far the record flood rose above the danger level), the land the
// Jamuna, Padma and Ganges have eaten, and coastal erosion points. Panels: small d3 charts that draw themselves in.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=15";
import { makeLabel } from "./layers.js?v=15";
import { FISH, GAUGE, ERODE, JUNCTION, SEASON, windHex, BASE, RIVER } from "./palette.js?v=15";

const fmt = d3.format(","), f1 = d3.format(".1f");
const kmh = (m, exag) => Math.max(m, 0) * 0.001 * exag;
const T = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
const C = { ink: BASE.ink, dim: BASE.dim, line: BASE.line };

// a path densified every ~2 km so it can follow the ground
function dense(path) { const out = []; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * 102, (b[1] - a[1]) * 111) / 2)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } out.push(path[path.length - 1]); return out; }
function ribbon(path, width, color, sampleH, exag, lift = 1.2) {
  const pts = dense(path).map(([lon, lat]) => { const p = toScene(lon, lat); p.y = kmh(sampleH(lon, lat), exag) + lift; return p; });
  const pos = [], idx = [];
  pts.forEach((P, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const d = new THREE.Vector3().subVectors(b, a); d.y = 0; d.normalize(); const n = new THREE.Vector3(-d.z, 0, d.x);
    pos.push(P.x + n.x * width / 2, P.y, P.z + n.z * width / 2, P.x - n.x * width / 2, P.y, P.z - n.z * width / 2); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); m.userData.op = 0.92; return m;
}
function label(text, lon, lat, y, opts) { const s = makeLabel(text, opts); const p = toScene(lon, lat); p.y = y; s.position.copy(p); return s; }
const mid = path => path[Math.floor(path.length / 2)];

export function buildAtlas(A, rivers, sampleH, exag) {
  const G = {}; const mk = n => (G[n] = new THREE.Group(), G[n].name = "atlas-" + n, G[n]);
  // ---- junctions
  const J = mk("junctions");
  A.junctions.forEach(j => { const p = toScene(j.lon, j.lat); const h = kmh(sampleH(j.lon, j.lat), exag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 48), new THREE.MeshBasicMaterial({ color: JUNCTION, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, h + 1.5, p.z); ring.userData = { op: 0.9, pulse: true, id: j.id }; J.add(ring);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 8), new THREE.MeshBasicMaterial({ color: JUNCTION, transparent: true, opacity: 0 })); pin.position.set(p.x, h + 6, p.z); pin.userData.op = 1; J.add(pin);
    const sub = j.joins.length ? `${j.joins.join(" + ")} → ${j.becomes}` : "river mouth";
    const s1 = label(j.name, j.lon, j.lat, h + 17, { size: 18, weight: 600, color: BASE.ink }); s1.userData.op = 1; J.add(s1);
    const s2 = label(sub, j.lon, j.lat, h + 13.2, { size: 13, weight: 500, color: "#374151" }); s2.userData.op = 1; J.add(s2);
  });
  // ---- hilsa sanctuaries, the Halda, the fishing grounds
  const S = mk("sanct");
  A.fish.sanctuaries.forEach(s => { S.add(ribbon(s.path, 2.6, FISH.sanct, sampleH, exag, 1.4)); const m = mid(s.path); const l = label(s.name, m[0] + 0.05, m[1], 8, { size: 13, weight: 600, color: "#7a2d5c" }); l.userData.op = 1; S.add(l); });
  const H = mk("halda"); H.add(ribbon(A.fish.halda.path, 1.6, FISH.halda, sampleH, exag, 2)); { const m = mid(A.fish.halda.path); const l = label("Halda", m[0] + 0.06, m[1], 10, { size: 15, weight: 600, color: "#8a5a00" }); l.userData.op = 1; H.add(l); }
  const GR = mk("grounds");
  A.fish.grounds.forEach(g => { const [w, s, e, n] = g.box; const a = toScene(w, n), b = toScene(e, s);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(b.x - a.x, b.z - a.z), new THREE.MeshBasicMaterial({ color: FISH.ground, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.set((a.x + b.x) / 2, 0.6, (a.z + b.z) / 2); plane.userData.op = 0.16; GR.add(plane);
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, 0.8, a.z), new THREE.Vector3(b.x, 0.8, a.z), new THREE.Vector3(b.x, 0.8, b.z), new THREE.Vector3(a.x, 0.8, b.z)]), new THREE.LineDashedMaterial({ color: FISH.ground, dashSize: 3, gapSize: 2, transparent: true, opacity: 0 }));
    edge.computeLineDistances(); edge.userData.op = 0.9; GR.add(edge);
    const l = label(g.name, (w + e) / 2, (s + n) / 2, 3, { size: 14, weight: 600, color: "#004b78" }); l.userData.op = 1; GR.add(l); });
  // ---- a run of hilsa: from the Bay up the Lower Meghna and the Padma, and up the Tentulia
  const R = mk("fishrun"); const runs = [[[90.75, 21.35], [90.80, 21.9], [90.86, 22.5], [90.70, 22.9], [90.63, 23.22], [90.40, 23.33], [90.20, 23.48], [89.95, 23.65], [89.75, 23.80]], [[90.30, 21.5], [90.40, 22.0], [90.47, 22.25], [90.56, 22.6], [90.62, 22.95], [90.64, 23.20]]].map(p => dense(p).map(([lon, lat]) => toScene(lon, lat)));
  const NF = 140, fp = new Float32Array(NF * 3); const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
  const fish = new THREE.Points(fg, new THREE.PointsMaterial({ color: FISH.run, size: 4.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); fish.userData.op = 0.85; fish.frustumCulled = false; R.add(fish);
  const seeds = Array.from({ length: NF }, (_, i) => ({ r: i % 5 === 0 ? 1 : 0, ph: Math.random(), sp: 0.018 + Math.random() * 0.02, off: (Math.random() - 0.5) * 1.6 }));
  R.userData.step = t => { seeds.forEach((s, i) => { const path = runs[s.r]; const u = (s.ph + t * s.sp) % 1; const f = u * (path.length - 1); const k = Math.floor(f), w = f - k; const a = path[k], b = path[Math.min(path.length - 1, k + 1)];
      fp[i * 3] = a.x + (b.x - a.x) * w + s.off; fp[i * 3 + 1] = 2.2; fp[i * 3 + 2] = a.z + (b.z - a.z) * w + s.off * 0.6; }); fg.attributes.position.needsUpdate = true; };
  // ---- flood gauges: a column for each, as tall as the record flood rose above the danger level
  const GA = mk("gauges"); const gcol = o => GAUGE[o < 0.5 ? 0 : o < 1 ? 1 : o < 2 ? 2 : 3];
  A.gauges.forEach(g => { const p = toScene(g.lon, g.lat); const h = Math.max(0.6, g.over * 7); const base = kmh(sampleH(g.lon, g.lat), exag);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 14), [new THREE.MeshBasicMaterial({ color: gcol(g.over), transparent: true, opacity: 0 }), new THREE.MeshBasicMaterial({ color: gcol(g.over), transparent: true, opacity: 0 }), new THREE.MeshBasicMaterial({ color: gcol(g.over), transparent: true, opacity: 0 })]);
    c.position.set(p.x, base, p.z); c.userData = { op: 1, h, y0: base, gauge: g }; c.name = "g-" + g.name; GA.add(c); });
  A.gauges.slice().sort((a, b) => b.over - a.over).slice(0, 8).forEach(g => { const l = label(`${g.name} +${f1(g.over)} m`, g.lon, g.lat, kmh(sampleH(g.lon, g.lat), exag) + g.over * 7 + 5, { size: 13, weight: 600, color: "#08306b" }); l.userData.op = 1; l.userData.gaugeLabel = g; GA.add(l); });
  // ---- erosion: the three big rivers, as wide bands, and the coast
  const E = mk("erosion"); const tot = {}; A.erosion.rivers.forEach(r => tot[r.river] = r.eroded_ha);
  for (const name of ["Jamuna", "Padma", "Ganges"]) { const reaches = rivers.major.filter(l => l.name === name);
    reaches.forEach(l => { if (l.c.length > 1) E.add(ribbon(l.c, 4.2, ERODE[name], sampleH, exag, 1.6)); });
    const all = reaches.flatMap(l => l.c).filter(c => c[0] > 88.2 && c[0] < 92.6 && c[1] > 21 && c[1] < 26.5); if (!all.length) continue; const m = all[Math.floor(all.length / 2)];
    const l = label(`${name}: ${fmt(Math.round(tot[name] / 100))} km² lost since 1973`, m[0] + 0.25, m[1], 12, { size: 15, weight: 600, color: "#7f2704" }); l.userData.op = 1; E.add(l); }
  const CP = mk("coastpts");
  A.erosion.coast.forEach(c => { const p = toScene(c.lon, c.lat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.4, 40), new THREE.MeshBasicMaterial({ color: ERODE.coast, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 1.5, p.z); ring.userData = { op: 0.9, pulse: true }; CP.add(ring);
    const l = label(c.name, c.lon + 0.12, c.lat, 6, { size: 14, weight: 600, color: "#7f2704" }); l.userData.op = 1; CP.add(l); });
  return G;
}

// opacity, pulsing rings, growing gauge columns, the fish run
export function updateAtlas(G, v, time, lf, scaleY) {
  const set = (g, o) => { g.visible = o > 0.01; if (!g.visible) return; g.children.forEach(c => { const mats = Array.isArray(c.material) ? c.material : [c.material]; const pul = c.userData.pulse ? 0.55 + 0.45 * Math.sin(time * 2.2) : 1;
    mats.forEach(m => m.opacity = o * (c.userData.op ?? 1) * pul * (c.isSprite ? lf : 1)); if (c.userData.pulse) c.scale.setScalar(1 + 0.12 * Math.sin(time * 2.2)); }); };
  ["junctions", "sanct", "grounds", "halda", "fishrun", "erosion", "coastpts"].forEach(k => set(G[k], v[k] || 0));
  set(G.gauges, v.gauges || 0);
  if (G.gauges.visible) { const grow = Math.min(1, v.gauges); G.gauges.children.forEach(c => { if (c.isMesh) { c.scale.y = Math.max(0.01, c.userData.h * grow); c.position.y = c.userData.y0 * scaleY + c.scale.y / 2; } }); }
  if (G.fishrun.visible) G.fishrun.userData.step(time);
  return ["junctions", "fishrun", "coastpts"].some(k => (v[k] || 0) > 0.05);
}

// ---------------------------------------------------------------------------------------------------------
// panel charts
function svgIn(el, h) { el.innerHTML = ""; const w = Math.max(280, el.clientWidth || 340); return { s: d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
const grow = (sel, delay = 0, dur = 800) => sel.transition().delay(delay * T()).duration(dur * T()).ease(d3.easeCubicOut);

// where two rivers become one: two bars slide together into the river they make
export function drawMerge(el, A) {
  const rows = A.junctions.filter(j => j.joins.length === 2 && j.joins.every(r => j.flows[r]) && j.flows[j.becomes]);
  const { s, w } = svgIn(el, rows.length * 92); const max = d3.max(rows, j => j.flows[j.becomes]); const x = d3.scaleLinear().domain([0, max]).range([0, w - 8]);
  rows.forEach((j, i) => { const y = i * 92; const [a, b] = j.joins; const fa = j.flows[a], fb = j.flows[b], fo = j.flows[j.becomes];
    s.append("text").attr("x", 0).attr("y", y + 13).attr("font-size", 13.5).attr("font-weight", 600).attr("fill", C.ink).text(`At ${j.name}`);
    const r1 = s.append("rect").attr("x", 0).attr("y", y + 22).attr("height", 14).attr("width", x(fa)).attr("fill", "#6baed6").attr("opacity", 0);
    const r2 = s.append("rect").attr("x", x(fa) + 40).attr("y", y + 22).attr("height", 14).attr("width", x(fb)).attr("fill", "#9ecae1").attr("opacity", 0);
    s.append("text").attr("x", 2).attr("y", y + 50).attr("font-size", 12).attr("fill", C.dim).text(`${a} ${fmt(fa)}`);
    s.append("text").attr("x", Math.min(w - 4, x(fa) + x(fb) + 40)).attr("y", y + 50).attr("text-anchor", "end").attr("font-size", 12).attr("fill", C.dim).text(`${b} ${fmt(fb)}`);
    const out = s.append("rect").attr("x", 0).attr("y", y + 58).attr("height", 16).attr("width", 0).attr("fill", RIVER.strong);
    const t = s.append("text").attr("x", 6).attr("y", y + 70).attr("font-size", 12).attr("font-weight", 600).attr("fill", "#fff").attr("opacity", 0).text(`${j.becomes} ${fmt(fo)} m³/s`);
    grow(r1, i * 500, 400).attr("opacity", 1); grow(r2, i * 500, 400).attr("opacity", 1);
    grow(r2, i * 500 + 450, 700).attr("x", x(fa));
    grow(out, i * 500 + 900, 800).attr("width", x(fo)); grow(t, i * 500 + 1300, 300).attr("opacity", 1); });
}
// hilsa landings by year: bars that rise in turn
export function drawHilsa(el, A) {
  const d = A.fish.hilsa; const { s, w } = svgIn(el, 150); const x = d3.scaleBand().domain(d.map(r => r.year)).range([0, w]).padding(0.25); const y = d3.scaleLinear().domain([0, 650000]).range([120, 10]);
  d.forEach((r, i) => { s.append("rect").attr("x", x(r.year)).attr("width", x.bandwidth()).attr("y", 120).attr("height", 0).attr("fill", r.approx ? "#d9a8c8" : FISH.sanct).call(g => grow(g, i * 90).attr("y", y(r.t)).attr("height", 120 - y(r.t)));
    s.append("text").attr("x", x(r.year) + x.bandwidth() / 2).attr("y", y(r.t) - 5).attr("text-anchor", "middle").attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(Math.round(r.t / 1000) + "k" + (r.approx ? "~" : ""));
    s.append("text").attr("x", x(r.year) + x.bandwidth() / 2).attr("y", 138).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", C.dim).text(r.year); });
}
export function drawHalda(el, A) {
  const d = A.fish.halda.eggs; const { s, w } = svgIn(el, 132); const x = d3.scaleBand().domain(d.map(r => r.year)).range([0, w]).padding(0.3); const y = d3.scaleLinear().domain([0, 27000]).range([104, 10]);
  d.forEach((r, i) => { s.append("rect").attr("x", x(r.year)).attr("width", x.bandwidth()).attr("y", 104).attr("height", 0).attr("fill", FISH.halda).call(g => grow(g, i * 90).attr("y", y(r.kg)).attr("height", 104 - y(r.kg)));
    s.append("text").attr("x", x(r.year) + x.bandwidth() / 2).attr("y", y(r.kg) - 5).attr("text-anchor", "middle").attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(fmt(r.kg));
    s.append("text").attr("x", x(r.year) + x.bandwidth() / 2).attr("y", 122).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", C.dim).text(r.year); });
}
// cyclones by month: a clock of the year, one dot per storm (outer = stronger), the two seasons coloured
export const monthOf = s => { const m = /^(\d{4})(\d{3})/.exec(s.sid); if (!m) return 0; const d = new Date(Date.UTC(+m[1], 0, +m[2])); return d.getUTCMonth(); };
export const seasonOf = mo => mo >= 3 && mo <= 5 ? "pre" : mo >= 9 && mo <= 11 ? "post" : "other";
export function drawClock(el, storms, onPick) {
  const { s, w } = svgIn(el, 300); const cx = w / 2, cy = 150, R0 = 34, R1 = 132; const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const r = d3.scaleLinear().domain([20, 150]).range([R0 + 6, R1]);
  MON.forEach((m, i) => { const a0 = (i / 12) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / 12) * 2 * Math.PI - Math.PI / 2; const se = seasonOf(i);
    s.append("path").attr("d", d3.arc()({ innerRadius: R0, outerRadius: R1 + 4, startAngle: a0 + Math.PI / 2, endAngle: a1 + Math.PI / 2 })).attr("transform", `translate(${cx},${cy})`).attr("fill", se === "other" ? "#f8f9fa" : se === "pre" ? "#fdf3e0" : "#e6f0f8").attr("stroke", "#fff");
    const am = (a0 + a1) / 2; s.append("text").attr("x", cx + Math.cos(am) * (R1 + 16)).attr("y", cy + Math.sin(am) * (R1 + 16) + 4).attr("text-anchor", "middle").attr("font-size", 11.5).attr("fill", C.dim).text(m); });
  [64, 96].forEach(k => s.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r(k)).attr("fill", "none").attr("stroke", "#c7ccd3").attr("stroke-dasharray", "2 3"));
  s.append("text").attr("x", cx).attr("y", cy - r(64) + 12).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", C.dim).text("64 kt");
  s.append("text").attr("x", cx).attr("y", cy - r(96) + 12).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", C.dim).text("96 kt");
  storms.forEach((st, i) => { const mo = monthOf(st); const m = /^(\d{4})(\d{3})/.exec(st.sid); const day = m ? +m[2] : 0; const a = (day / 366) * 2 * Math.PI - Math.PI / 2; const rr = r(Math.min(150, st.peak_kt));
    const c = s.append("circle").attr("cx", cx).attr("cy", cy).attr("r", st.note ? 5.5 : 3.6).attr("fill", windHex(st.peak_kt)).attr("stroke", st.note ? C.ink : "#fff").attr("stroke-width", st.note ? 1.4 : 0.8).style("cursor", "pointer");
    c.append("title").text(`${st.note ? st.note.label : (st.name && st.name !== "NOT_NAMED" ? st.name : "Unnamed")} ${st.season}, ${st.peak_kt} kt`);
    grow(c, 200 + i * 12, 700).attr("cx", cx + Math.cos(a) * rr).attr("cy", cy + Math.sin(a) * rr);
    c.on("click", () => onPick && onPick(st.sid)); });
  s.append("text").attr("x", cx).attr("y", cy + 4).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("fill", C.ink).text(storms.length);
}
export function drawDecades(el, storms) {
  const dec = d3.rollups(storms, v => ({ n: v.length, h: v.filter(s => s.peak_kt >= 64).length }), s => Math.floor(s.season / 10) * 10).sort((a, b) => a[0] - b[0]);
  const { s, w } = svgIn(el, 120); const x = d3.scaleBand().domain(dec.map(d => d[0])).range([0, w]).padding(0.3); const y = d3.scaleLinear().domain([0, d3.max(dec, d => d[1].n)]).range([92, 8]);
  dec.forEach(([k, v], i) => { s.append("rect").attr("x", x(k)).attr("width", x.bandwidth()).attr("y", 92).attr("height", 0).attr("fill", "#c7ccd3").call(g => grow(g, i * 70).attr("y", y(v.n)).attr("height", 92 - y(v.n)));
    s.append("rect").attr("x", x(k)).attr("width", x.bandwidth()).attr("y", 92).attr("height", 0).attr("fill", "#e31a1c").call(g => grow(g, 300 + i * 70).attr("y", y(v.h)).attr("height", 92 - y(v.h)));
    s.append("text").attr("x", x(k) + x.bandwidth() / 2).attr("y", y(v.n) - 4).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(v.n);
    s.append("text").attr("x", x(k) + x.bandwidth() / 2).attr("y", 108).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", C.dim).text(k + "s"); });
}
// flood-affected share of the country, every year in the FFWC record
export function drawFloodYears(el, A) {
  const d = A.flood_extent; const { s, w } = svgIn(el, 160); const x = d3.scaleLinear().domain([1953, 2022]).range([34, w - 6]); const y = d3.scaleLinear().domain([0, 75]).range([130, 12]); const bw = Math.max(2, (w - 40) / 70 - 1.2);
  [20, 40, 60].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 0).attr("y", y(v) + 4).attr("font-size", 10.5).attr("fill", C.dim).text(v + "%"); });
  d.forEach((r, i) => s.append("rect").attr("x", x(r.year) - bw / 2).attr("width", bw).attr("y", 130).attr("height", 0).attr("fill", r.flood_affected_pct >= 40 ? "#08519c" : "#6baed6").call(g => grow(g, i * 18, 500).attr("y", y(r.flood_affected_pct)).attr("height", 130 - y(r.flood_affected_pct))).append("title").text(`${r.year}: ${r.flood_affected_pct}% (${fmt(r.flood_affected_km2)} km²)`));
  d.filter(r => [1988, 1998, 2007, 2020].includes(r.year)).forEach(r => s.append("text").attr("x", x(r.year)).attr("y", y(r.flood_affected_pct) - 4).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).attr("opacity", 0).text(r.year === 1998 ? "1998: 68%" : r.year).call(g => grow(g, 1300, 300).attr("opacity", 1)));
  [1960, 1980, 2000, 2020].forEach(v => s.append("text").attr("x", x(v)).attr("y", 150).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(v));
}
export function drawErosion(el, A) {
  const d = A.erosion.rivers; const { s, w } = svgIn(el, d.length * 50 + 6); const x = d3.scaleLinear().domain([0, d3.max(d, r => r.eroded_ha)]).range([0, w - 150]);
  d.forEach((r, i) => { const y = i * 50;
    s.append("text").attr("x", 0).attr("y", y + 15).attr("font-size", 14).attr("font-weight", 600).attr("fill", C.ink).text(r.river);
    s.append("rect").attr("x", 70).attr("y", y + 4).attr("height", 15).attr("width", 0).attr("fill", ERODE[r.river]).call(g => grow(g, i * 120).attr("width", x(r.eroded_ha)));
    s.append("text").attr("x", 70 + x(r.eroded_ha) + 6).attr("y", y + 16).attr("font-size", 12.5).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(fmt(r.eroded_ha) + " ha");
    if (r.regained_ha) { s.append("rect").attr("x", 70).attr("y", y + 23).attr("height", 9).attr("width", 0).attr("fill", "#74c476").call(g => grow(g, 500 + i * 120).attr("width", x(r.regained_ha)));
      s.append("text").attr("x", 70 + x(r.regained_ha) + 6).attr("y", y + 31).attr("font-size", 11.5).attr("fill", C.dim).text(fmt(r.regained_ha) + " ha regained as char"); } });
}
