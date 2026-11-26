// source.js  --  v16: the main rivers followed from source to sea, and the twelve city corporations.
// Rivers: one ribbon per river, the same number of pixels wide at any zoom. A small shader knows how far along its
// river each pixel is, so the river can be let out from its source (uHead) and then carry light downstream.
// Cities: a disc for each corporation whose area is its people at the year on the timeline, with a slow ring.
// The panel side: each river as a strip split by the countries it crosses, and the cities as bars that follow the year.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=16";
import { makeLabel } from "./layers.js?v=16";
import { BASE, RSYS, NATION, CITYC } from "./palette.js?v=16";

const fmt = d3.format(","), f1 = d3.format(".1f");
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const kmh = (m, exag) => Math.max(m, 0) * 0.001 * exag;
export const RGROUPS = [["Brahmaputra", "through the Jamuna"], ["Ganges", "through the Padma"], ["Meghna", "through the Meghna"], ["coast", "straight to the sea"]];

const VS = `
attribute vec2 aN; attribute float aS; attribute float aU; attribute float aT;
uniform float uHalf; uniform float uScale;
varying float vS; varying float vU; varying float vT;
void main() { vS = aS; vU = aU; vT = aT; vec3 p = position + vec3(aN.x, 0.0, aN.y) * aS * uHalf * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const FS = `
uniform vec3 uCol; uniform float uOp; uniform float uTime; uniform float uScale; uniform float uHead; uniform float uLen; uniform float uCase; uniform float uFlow;
varying float vS; varying float vU; varying float vT;
void main() {
  if (vT > uHead) discard;                                              // not let out this far yet
  float s = abs(vS); float a = 1.0 - smoothstep(0.86, 1.0, s);
  if (uCase > 0.5) { gl_FragColor = vec4(vec3(1.0), a * uOp); return; }  // the white casing under the colour
  vec3 c = uCol;
  float u = vU / max(uScale, 0.05);
  float p = fract(u / 34.0 - uTime * 0.5);                               // light carried downstream
  float run = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.08, 0.42, p));
  c = mix(c, vec3(1.0), run * 0.55 * uFlow * (1.0 - smoothstep(0.3, 0.9, s)));
  float head = 1.0 - smoothstep(0.0, 26.0, (uHead - vT) * uLen / max(uScale, 0.05));   // the front of the water, bright
  head *= 1.0 - smoothstep(0.0, 0.1, uHead - vT);
  c = mix(c, vec3(1.0), head * 0.85 * step(uHead, 0.999));
  gl_FragColor = vec4(c, a * uOp);
}`;

function ribbon(pts3, frac, half, col, casing) {
  const pos = [], nrm = [], side = [], along = [], tt = [], idx = []; let acc = 0;
  pts3.forEach((P, i) => { const a = pts3[Math.max(0, i - 1)], b = pts3[Math.min(pts3.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1;
    if (i) acc += Math.hypot(P.x - pts3[i - 1].x, P.z - pts3[i - 1].z);
    for (const sgn of [1, -1]) { pos.push(P.x, P.y, P.z); nrm.push(-dz / L, dx / L); side.push(sgn); along.push(acc); tt.push(frac[i]); }
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
  g.setAttribute("aS", new THREE.Float32BufferAttribute(side, 1)); g.setAttribute("aU", new THREE.Float32BufferAttribute(along, 1)); g.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uHalf: { value: half }, uScale: { value: 1 }, uCol: { value: new THREE.Color(col).convertLinearToSRGB() }, uOp: { value: 0 }, uTime: { value: 0 }, uHead: { value: 1 }, uLen: { value: acc }, uCase: { value: casing ? 1 : 0 }, uFlow: { value: 1 } } });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
const lab = (text, lon, lat, y, o) => { const s = makeLabel(text, o); s.material.map.colorSpace = THREE.SRGBColorSpace; const p = toScene(lon, lat); p.y = y; s.position.copy(p); return s; };
// where each river's name sits along its course (share of the way from the source), so names do not pile up
const NAME_AT = { Jamuna: 0.2, Padma: 0.3, Meghna: 0.22, Teesta: 0.16, Surma: 0.2, Dharla: 0.06, Dudhkumar: 0.12, Mahananda: 0.3, Punarbhaba: 0.14, Atrai: 0.36, Someshwari: 0.08, Jadukata: 0.07,
  Manu: 0.1, Khowai: 0.03, Gumti: 0.3, Feni: 0.3, Muhuri: 0.05, Halda: 0.3, Karnaphuli: 0.25, Sangu: 0.3, Matamuhuri: 0.3, Bakkhali: 0.4 };
const WIDE = ["Jamuna", "Padma", "Meghna", "Teesta"];                       // named on the wide map; the rest appear as you come closer

export function buildSource(S, sampleH, exag) {
  const G = new THREE.Group(); G.name = "source";
  // the neighbours' borders, a light line, and their names
  const bp = []; S.borders.forEach(b => { for (let i = 0; i < b.r.length - 1; i++) { const a = toScene(b.r[i][0], b.r[i][1]), c = toScene(b.r[i + 1][0], b.r[i + 1][1]); bp.push(a.x, 0.4, a.z, c.x, 0.4, c.z); } });
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  const bl = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: BASE.outline, transparent: true, opacity: 0, depthTest: false })); bl.userData = { kind: "border" }; bl.frustumCulled = false; G.add(bl);
  [["CHINA", 86.5, 31.3], ["TIBET", 90.5, 30.2], ["NEPAL", 84.2, 28.3], ["BHUTAN", 90.45, 27.45], ["INDIA", 80.5, 24.2], ["INDIA", 93.3, 26.6], ["MYANMAR", 95.3, 22.6]].forEach(([t, x, y], i) => {
    const s = lab(t, x, y, 1, { size: i === 1 ? 13 : 15, weight: 500, color: BASE.faint }); s.userData.kind = "nation"; G.add(s); });
  // longest first, so the shorter rivers that share a lower course are drawn under the long ones
  const order = [...S.rivers].sort((a, b) => a.km - b.km);
  order.forEach((r, k) => {
    const all = r.ext ? [...r.pts, ...r.ext.slice(1).map(e => [e[0], e[1], r.km])] : r.pts;
    const P3 = all.map(([lon, lat]) => { const p = toScene(lon, lat); p.y = kmh(sampleH(lon, lat), exag) + 1.6; return p; });
    const frac = all.map((p, i) => i < r.pts.length ? p[2] / r.km * 0.94 : 0.94 + 0.06 * (i - r.pts.length + 1) / Math.max(1, all.length - r.pts.length));
    if (!r.ext) for (let i = 0; i < frac.length; i++) frac[i] = all[i][2] / r.km;
    const big = r.q_mouth > 20000 && r.km > 900, half = big ? 2.3 : r.km > 400 ? 1.6 : 1.3;
    const cas = ribbon(P3, frac, half + 0.9, "#ffffff", true); cas.userData = { kind: "river", name: r.name, grp: r.grp, casing: true, ro: k * 0.01 }; G.add(cas);
    const rib = ribbon(P3, frac, half, RSYS[r.grp]); rib.userData = { kind: "river", name: r.name, grp: r.grp, ro: k * 0.01 + 0.005 }; G.add(rib);
    // the source: a ring that keeps its size
    const sp = toScene(r.src[0], r.src[1]); const sy = kmh(sampleH(r.src[0], r.src[1]), exag) + 1.8;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 28), new THREE.MeshBasicMaterial({ color: RSYS[r.grp], transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, sy, sp.z); ring.userData = { kind: "src", name: r.name, grp: r.grp, r: 3.4 }; ring.renderOrder = 7; G.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); dot.rotation.x = -Math.PI / 2; dot.position.set(sp.x, sy - 0.02, sp.z); dot.userData = { kind: "src", name: r.name, grp: r.grp, r: 3.4 }; dot.renderOrder = 6.99; G.add(dot);
    const at = r.pts[Math.min(r.pts.length - 1, Math.floor(r.pts.length * (NAME_AT[r.name] ?? 0.2)))];
    const nm = lab(r.up !== r.name ? `${r.name} · ${r.up}` : r.name, at[0], at[1], kmh(sampleH(at[0], at[1]), exag) + 5, { size: WIDE.includes(r.name) ? 16 : 13, weight: 600, color: RSYS[r.grp] });
    nm.center.set(0.5, -0.35); Object.assign(nm.userData, { kind: "name", name: r.name, grp: r.grp, wide: WIDE.includes(r.name) }); nm.renderOrder = 8; G.add(nm);
  });
  return G;
}
// o: layer strength; head: 0 at the sources, 1 at the sea; sel: a river's name, grp: a system, or neither
export function updateSource(G, o, lf, time, scale, head, sel, grp) {
  G.visible = o > 0.01; if (!G.visible) return false;
  const e = head < 1 ? head * head * (3 - 2 * head) : 1;
  G.children.forEach(c => { const u = c.userData; const on = sel ? u.name === sel : grp ? u.grp === grp : true;
    if (u.kind === "border") { c.material.opacity = 0.6 * o; return; }
    if (u.kind === "nation") { c.material.opacity = 0.9 * o * lf; return; }
    if (u.kind === "river") { const m = c.material.uniforms; m.uScale.value = scale; m.uTime.value = time; m.uHead.value = e; m.uFlow.value = on ? 1 : 0; m.uOp.value = o * (on ? 1 : u.casing ? 0 : 0.16); c.renderOrder = (on && (sel || grp) ? 6.5 : 6) + u.ro; return; }
    if (u.kind === "src") { c.scale.setScalar(u.r * scale * (on && sel ? 1.5 + 0.2 * Math.sin(time * 3) : 1)); c.material.opacity = o * (on ? 1 : 0.18); return; }
    if (u.kind === "name") { const near = 1 - THREE.MathUtils.smoothstep(scale, 1.3, 2.1); c.material.opacity = o * lf * (sel ? (on ? 1 : 0) : (on ? (u.wide ? 1 : near) : 0.12 * near)); } });
  return true;
}
export const riverBox = r => { let w = 180, e = -180, s = 90, n = -90; [...r.pts, ...(r.ext || [])].forEach(p => { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); });
  const px = Math.max(0.35, (e - w) * 0.12), py = Math.max(0.3, (n - s) * 0.14); return [w - px, s - py, e + px, n + py]; };

// ---- panel: every river as a strip, source on the left, the sea on the right, split by country ------------------
export function drawSourceStrips(el, S, state, onPick) {
  el.innerHTML = ""; const R = [...S.rivers].sort((a, b) => b.km - a.km); const w = Math.max(300, el.clientWidth || 356), row = 23, x0 = 92, xr = 54, top = 20;
  const x = d3.scaleLinear().domain([0, R[0].km]).range([0, w - x0 - xr]);
  const s = d3.select(el).append("svg").attr("width", w).attr("height", top + R.length * row + 6).attr("font-family", "IBM Plex Sans, sans-serif").attr("role", "img").attr("aria-label", "Length of each river from source to sea, split by country");
  [0, 1000, 2000, 3000].forEach(v => { s.append("line").attr("x1", x0 + x(v)).attr("x2", x0 + x(v)).attr("y1", top - 4).attr("y2", top + R.length * row).attr("stroke", BASE.line);
    s.append("text").attr("x", x0 + x(v)).attr("y", 10).attr("text-anchor", v ? "middle" : "start").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", BASE.dim).text(v === 3000 ? "3,000 km" : v ? fmt(v) : "source"); });
  const T = still() ? 0 : 1; const rows = [];
  R.forEach((r, i) => { const g = s.append("g").attr("transform", `translate(0,${top + i * row})`).style("cursor", "pointer").attr("tabindex", 0).attr("role", "button").attr("aria-label", `${r.name}, ${fmt(r.km)} km`)
      .on("click", () => onPick(r.name)).on("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onPick(r.name); } });
    g.append("rect").attr("class", "hit").attr("x", -4).attr("width", w + 4).attr("height", row - 2).attr("rx", 4).attr("fill", "transparent");
    g.append("circle").attr("cx", 5).attr("cy", row / 2 - 1).attr("r", 4).attr("fill", RSYS[r.grp]);
    g.append("text").attr("class", "nm").attr("x", 14).attr("y", row / 2 + 3).attr("font-size", 12.5).attr("font-weight", 500).attr("fill", BASE.ink).text(r.name);
    r.segs.forEach(([n, a, b]) => { g.append("rect").attr("x", x0 + x(a)).attr("y", 4).attr("height", row - 11).attr("fill", NATION[n] || BASE.faint).attr("width", 0)
      .transition().delay(T * (i * 28 + a / R[0].km * 1500)).duration(T * Math.max(120, (b - a) / R[0].km * 1500)).ease(d3.easeLinear).attr("width", Math.max(1.5, x(b) - x(a) - (b < r.km ? 1 : 0))); });
    g.append("text").attr("class", "km").attr("x", x0 + x(r.km) + 6).attr("y", row / 2 + 3).attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", BASE.text).attr("opacity", 0).text(fmt(r.km))
      .transition().delay(T * (i * 28 + r.km / R[0].km * 1500)).duration(T * 250).attr("opacity", 1);
    g.append("title").text(`${r.name}: ${r.segs.map(([n, a, b]) => `${n} ${fmt(b - a)} km`).join(", ")}`);
    rows.push({ r, g }); });
  const mark = (sel, grp) => rows.forEach(({ r, g }) => { const on = sel ? r.name === sel : grp ? r.grp === grp : true; g.attr("opacity", on ? 1 : 0.3); g.select(".hit").attr("fill", sel && on ? "#f3f4f6" : "transparent"); g.select(".nm").attr("font-weight", sel && on ? 700 : 500); });
  mark(state.srcSel, state.srcGrp); return { mark };
}
export function sourceCard(r) {
  const out = r.km - r.km_bd; const seq = r.segs.map(([n, a, b]) => `<span class="cseg"><i style="background:${NATION[n] || BASE.faint}"></i>${n} <b>${fmt(b - a)} km</b></span>`).join("");
  return `<div class="rcard" style="--c:${RSYS[r.grp]}"><div class="rc-h"><b>${r.name}</b>${r.up !== r.name ? `<span>the ${r.up} upstream</span>` : ""}</div>
    <p>Rises in ${r.rises} and reaches the sea ${r.grp === "coast" ? "on its own" : "through the " + (r.grp === "Brahmaputra" ? "Jamuna" : r.grp === "Ganges" ? "Padma" : "Meghna")}${r.ext ? ", past Chandpur and down the Meghna estuary" : ""}.</p>
    <div class="stats3"><div><b>${fmt(r.km)} km</b><span>source to sea, along the traced path</span></div><div><b>${Math.round(r.km_bd / r.km * 100)}%</b><span>of that inside Bangladesh${out ? "" : ": all of it"}</span></div>
    <div><b>${r.q_entry == null ? "–" : fmt(r.q_entry)}</b><span>${r.q_entry == null ? (r.name === "Mahananda" ? "its main arm meets the Ganges in India" : "it does not cross the border") : "m³/s where it comes in"}</span></div></div>
    <div class="csegs">${seq}</div></div>`;
}

// ---- cities --------------------------------------------------------------------------------------------------
const cityAt = (c, yrs, y) => { const i = Math.max(0, Math.min(yrs.length - 2, d3.bisectRight(yrs, y) - 1)); const t = Math.max(0, Math.min(1, (y - yrs[i]) / (yrs[i + 1] - yrs[i]))); return c.pop[i] + (c.pop[i + 1] - c.pop[i]) * t; };
export const cityPop = cityAt;
const R_KM = 30;                                                         // radius of a disc of 5 million people, km
const rOf = p => R_KM * Math.sqrt(p / 5e6);
export function buildCities(S, sampleH, exag) {
  const G = new THREE.Group(); G.name = "cities"; const big = [...S.cities].sort((a, b) => b.pop[3] - a.pop[3]);
  big.forEach((c, k) => { const p = toScene(c.lon, c.lat); const y = kmh(sampleH(c.lon, c.lat), exag) + 2.2 + k * 0.02;
    const mk = (geo, col, kind, ro) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, y, p.z); m.userData = { kind, name: c.name, city: c }; m.renderOrder = ro + k * 0.01; G.add(m); return m; };
    mk(new THREE.CircleGeometry(1, 48), CITYC.fill, "disc", 6); mk(new THREE.RingGeometry(0.93, 1, 64), CITYC.edge, "edge", 6.2); mk(new THREE.RingGeometry(0.9, 1, 64), CITYC.edge, "pulse", 6.1);
    mk(new THREE.RingGeometry(0.97, 1, 64), BASE.ink, "was", 6.3);                                             // its size in 1991, to grow away from
    const off = { "Dhaka North": [-0.52, 0.1], "Dhaka South": [-0.5, -0.16], Gazipur: [0.05, 0.3], Narayanganj: [0.5, -0.12], Chattogram: [0, 0.3] }[c.name] || [0, 0.2];
    const s = lab(c.name, c.lon + off[0], c.lat + off[1], y + 3, { size: k < 4 ? 18 : 15, weight: 600, color: CITYC.text }); Object.assign(s.userData, { kind: "label", name: c.name }); s.renderOrder = 8; G.add(s); });
  return G;
}
export function updateCities(G, o, lf, time, yrs, year, sel) {
  G.visible = o > 0.01; if (!G.visible) return false;
  G.children.forEach(c => { const u = c.userData; const on = !sel || u.name === sel;
    if (u.kind === "label") { c.material.opacity = o * lf * (on ? 1 : 0.35); return; }
    const r = rOf(cityAt(u.city, yrs, year));
    if (u.kind === "disc") { c.scale.setScalar(r); c.material.opacity = o * (on ? 0.5 : 0.16); }
    else if (u.kind === "edge") { c.scale.setScalar(r); c.material.opacity = o * (on ? 1 : 0.3); }
    else if (u.kind === "was") { c.scale.setScalar(rOf(u.city.pop[0])); c.material.opacity = o * (on ? 0.55 : 0.12); }
    else { const t = (time * 0.45 + u.city.lon) % 1; c.scale.setScalar(r * (1 + 0.55 * t)); c.material.opacity = o * (on ? 0.5 : 0.1) * (1 - t); } });
  return true;
}
// twelve bars that follow the year on the timeline; a tick marks 1991
export function drawCityBars(el, S, onPick) {
  el.innerHTML = ""; const yrs = S.city_years; const C = [...S.cities].sort((a, b) => b.pop[3] - a.pop[3]); const w = Math.max(300, el.clientWidth || 356), row = 30, x0 = 104, xr = 92;
  const x = d3.scaleLinear().domain([0, 6e6]).range([0, w - x0 - xr]);
  const s = d3.select(el).append("svg").attr("width", w).attr("height", 18 + C.length * row).attr("font-family", "IBM Plex Sans, sans-serif").attr("role", "img").attr("aria-label", "People in each city corporation");
  [0, 2e6, 4e6, 6e6].forEach(v => { s.append("line").attr("x1", x0 + x(v)).attr("x2", x0 + x(v)).attr("y1", 14).attr("y2", 18 + C.length * row).attr("stroke", BASE.line);
    s.append("text").attr("x", x0 + x(v)).attr("y", 10).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", BASE.dim).text(v ? v / 1e6 + " M" : "0"); });
  const rows = C.map((c, i) => { const g = s.append("g").attr("transform", `translate(0,${18 + i * row})`).style("cursor", "pointer").attr("tabindex", 0).attr("role", "button").attr("aria-label", c.name)
      .on("click", () => onPick(c)).on("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onPick(c); } });
    g.append("rect").attr("class", "hit").attr("x", -4).attr("width", w + 4).attr("height", row - 3).attr("rx", 4).attr("fill", "transparent");
    g.append("text").attr("x", 0).attr("y", 18).attr("font-size", 12.5).attr("font-weight", i < 4 ? 600 : 500).attr("fill", BASE.ink).text(c.name);
    const bar = g.append("rect").attr("x", x0).attr("y", 6).attr("height", row - 15).attr("rx", 2).attr("fill", CITYC.fill).attr("stroke", CITYC.edge).attr("stroke-width", 0.8);
    g.append("line").attr("x1", x0 + x(c.pop[0])).attr("x2", x0 + x(c.pop[0])).attr("y1", 3).attr("y2", row - 6).attr("stroke", BASE.ink).attr("stroke-width", 1.6);
    const val = g.append("text").attr("y", 18).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", BASE.ink);
    const mult = g.append("text").attr("x", w).attr("y", 18).attr("text-anchor", "end").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", BASE.dim);
    g.append("title").text(`${c.name}: ${yrs.map((y, k) => `${y} ${fmt(c.pop[k])}`).join(", ")}. City corporation since ${c.since}.`);
    return { c, g, bar, val, mult }; });
  const move = y => rows.forEach(({ c, bar, val, mult }) => { const p = cityAt(c, yrs, y); bar.attr("width", Math.max(1, x(p))); val.attr("x", x0 + Math.max(x(p), x(c.pop[0])) + 6).text(p >= 1e6 ? f1(p / 1e6) + " M" : fmt(Math.round(p / 1000)) + "k");
    const k = p / c.pop[0]; mult.text(Math.abs(k - 1) < 0.005 ? "" : "×" + k.toFixed(1)); });
  const mark = sel => rows.forEach(({ c, g }) => { g.attr("opacity", !sel || c.name === sel ? 1 : 0.35); g.select(".hit").attr("fill", sel === c.name ? "#f3f4f6" : "transparent"); });
  move(yrs[0]); return { move, mark };
}
