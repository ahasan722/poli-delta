// wet.js  --  v11: the wetlands (373 haors, the big beels, wet ground), the migratory waterbirds and fish by district.
// Map: wet ground as a pale fill; every haor as a circle of its own area placed on wet ground inside its upazila(s);
// beels as rings; waterbird sites as discs sized by the latest count, with birds streaming in down the two flyways.
// Panels: small d3 charts that draw themselves in.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=14";
import { makeLabel } from "./layers.js?v=14";
import { WET, BIRD, FISHR, BASE } from "./palette.js?v=14";

const fmt = d3.format(","), f1 = d3.format(".1f");
const T = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
const C = { ink: BASE.ink, dim: BASE.dim, line: BASE.line };
export const haorR = ha => Math.max(0.7, Math.sqrt(Math.max(ha, 1) / 100 / Math.PI));     // km: a circle with the haor's area
export const birdR = s => s.counts.length ? 2.2 + Math.sqrt(s.counts[s.counts.length - 1][1]) / 34 : 3.4;
const lab = (text, lon, lat, y, o) => { const s = makeLabel(text, o); const p = toScene(lon, lat); p.y = y; s.position.copy(p); s.userData.op = 1; return s; };
const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };
const mat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, ...extra });

export function buildWet(W) {
  const G = {}; const mk = n => (G[n] = new THREE.Group(), G[n].name = "wet-" + n, G[n]);
  // ---- wet ground
  const F = mk("wetfill"); const shapes = W.wet_fill.map(ring => new THREE.Shape(ring.map(([lon, lat]) => { const p = toScene(lon, lat); return new THREE.Vector2(p.x, -p.z); })));
  const fg = new THREE.ShapeGeometry(shapes, 2); fg.rotateX(-Math.PI / 2);
  const fill = new THREE.Mesh(fg, mat(WET.fill)); fill.position.y = 0.9; fill.userData.op = 0.55; F.add(fill);
  // ---- haors: one instanced disc and one instanced ring
  const H = mk("haors"); const n = W.haors.length; const m4 = new THREE.Matrix4();
  const disc = new THREE.InstancedMesh(flat(new THREE.CircleGeometry(1, 40)), mat(WET.haor), n);
  const edge = new THREE.InstancedMesh(flat(new THREE.RingGeometry(0.93, 1, 40)), mat(WET.edge), n);
  W.haors.forEach((h, i) => { const p = toScene(h.lon, h.lat); const r = haorR(h.ha); m4.makeScale(r, 1, r).setPosition(p.x, 1.4 + (i % 7) * 0.01, p.z); disc.setMatrixAt(i, m4); edge.setMatrixAt(i, m4); h._p = p; h._r = r; });
  disc.userData.op = 0.38; edge.userData.op = 0.85; disc.frustumCulled = edge.frustumCulled = false; H.add(disc, edge);
  const hi = new THREE.Mesh(flat(new THREE.RingGeometry(0.86, 1.04, 48)), mat(BASE.ink)); hi.userData.op = 0; hi.name = "hi"; H.add(hi);
  H.userData.highlight = i => { if (i == null) { hi.userData.op = 0; return; } const h = W.haors[i]; hi.position.set(h._p.x, 1.7, h._p.z); hi.scale.set(h._r + 0.6, 1, h._r + 0.6); hi.userData.op = 1; };
  // the names: the largest haors, spaced so they do not collide
  const named = []; for (const h of W.haors) { if (named.length >= 16) break; if (named.some(q => Math.hypot((q.lon - h.lon) * 102, (q.lat - h.lat) * 111) < 16)) continue; named.push(h); }
  ["Tanguar Haor", "Hakaluki Haor", "Hail Haor"].forEach(nm => { const h = W.haors.find(x => x.name === nm); if (h && !named.includes(h)) named.push(h); });
  named.forEach(h => H.add(lab(h.name.replace(" Haor", ""), h.lon, h.lat + haorR(h.ha) / 111 + 0.03, 5, { size: 13, weight: 600, color: WET.text })));
  // ---- beels
  const B = mk("beels");
  W.beels.forEach(b => { const p = toScene(b.lon, b.lat);
    const ring = new THREE.Mesh(flat(new THREE.RingGeometry(3.6, 4.6, 48)), mat(WET.beel)); ring.position.set(p.x, 1.6, p.z); ring.userData = { op: 0.95, pulse: true }; B.add(ring);
    const dot = new THREE.Mesh(flat(new THREE.CircleGeometry(1.4, 24)), mat(WET.beel)); dot.position.set(p.x, 1.7, p.z); dot.userData.op = 1; B.add(dot);
    B.add(lab(b.name, b.lon, b.lat + 0.07, 6, { size: 15, weight: 600, color: "#8a3b00" })); });
  // ---- waterbird sites
  const S = mk("birds");
  W.birds.sites.forEach(s => { const p = toScene(s.lon, s.lat); const r = birdR(s);
    const d = new THREE.Mesh(flat(new THREE.CircleGeometry(r, 48)), mat(BIRD.site)); d.position.set(p.x, 2, p.z); d.userData.op = s.counts.length ? 0.55 : 0.25; S.add(d);
    const e = new THREE.Mesh(flat(new THREE.RingGeometry(r - 0.25, r + 0.2, 48)), mat(BIRD.edge)); e.position.set(p.x, 2.1, p.z); e.userData = { op: 0.95, pulse: !s.counts.length }; S.add(e);
    S.add(lab(s.name, s.lon, s.lat + r / 111 + 0.05, 6, { size: 14, weight: 600, color: BIRD.text }));
  });
  // ---- birds coming in: down the Central Asian flyway from the north-west and the East Asian-Australasian from the north-east
  const FL = mk("birdflow"); const NB = 320; const bp = new Float32Array(NB * 3); const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  const dotTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.beginPath(); x.arc(16, 16, 13, 0, Math.PI * 2); x.fill(); const t = new THREE.CanvasTexture(c); return t; })();
  const pts = new THREE.Points(bg, new THREE.PointsMaterial({ color: BIRD.flow, size: 4.5, map: dotTex, alphaTest: 0.3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); pts.userData.op = 0.9; pts.frustumCulled = false; FL.add(pts);
  const entries = [toScene(86.4, 28.8), toScene(94.6, 28.6), toScene(89.8, 29.2)];
  const w = W.birds.sites.map(s => s.counts.length ? Math.sqrt(s.counts[s.counts.length - 1][1]) : 60); const tw = d3.sum(w);
  const pick = r => { let a = 0; for (let i = 0; i < w.length; i++) { a += w[i] / tw; if (r < a) return i; } return w.length - 1; };
  const seeds = Array.from({ length: NB }, (_, i) => { const si = pick(((i * 0.61803) % 1)); const s = W.birds.sites[si]; const end = toScene(s.lon + (Math.random() - 0.5) * 0.12, s.lat + (Math.random() - 0.5) * 0.1);
    const st = entries[s.lon < 90.3 ? (i % 3 === 0 ? 2 : 0) : (i % 3 === 0 ? 2 : 1)].clone(); st.x += (Math.random() - 0.5) * 60; st.z += (Math.random() - 0.5) * 30;
    const c = st.clone().lerp(end, 0.5); c.y = 0; return { st, end, c, h: 55 + Math.random() * 45, ph: Math.random(), sp: 0.035 + Math.random() * 0.03 }; });
  FL.userData.step = t => { seeds.forEach((s, i) => { const u = (s.ph + t * s.sp) % 1; const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    bp[i * 3] = a * s.st.x + b * s.c.x + c * s.end.x; bp[i * 3 + 2] = a * s.st.z + b * s.c.z + c * s.end.z; bp[i * 3 + 1] = 2 + s.h * 4 * u * (1 - u) * 0.9 + (1 - u) * s.h * 0.25; }); bg.attributes.position.needsUpdate = true; };
  return G;
}

export function updateWet(G, v, time, lf) {
  const set = (g, o) => { g.visible = o > 0.01; if (!g.visible) return; g.children.forEach(c => { const pul = c.userData.pulse ? 0.55 + 0.45 * Math.sin(time * 2.2) : 1;
    c.material.opacity = o * (c.userData.op ?? 1) * pul * (c.isSprite ? lf : 1); if (c.userData.pulse) c.scale.setScalar(1 + 0.1 * Math.sin(time * 2.2)); }); };
  ["wetfill", "haors", "beels", "birds", "birdflow"].forEach(k => set(G[k], v[k] || 0));
  if (G.birdflow.visible) G.birdflow.userData.step(time);
  return (v.birdflow || 0) > 0.05 || (v.beels || 0) > 0.05 || (v.birds || 0) > 0.05;
}

// the haor or bird site under a point on the ground (lon, lat)
export function wetAt(W, v, lon, lat) {
  const d = (a, b) => Math.hypot((a.lon - lon) * 102, (a.lat - lat) * 111);
  if ((v.birds || 0) > 0.3) { const s = W.birds.sites.find(s => d(s) < birdR(s) + 2); if (s) return { kind: "bird", item: s }; }
  if ((v.beels || 0) > 0.3) { const b = W.beels.find(b => d(b) < 6); if (b) return { kind: "beel", item: b }; }
  if ((v.haors || 0) > 0.3) { let best = null, bi = -1; W.haors.forEach((h, i) => { const dd = d(h); if (dd < haorR(h.ha) + 0.6 && (!best || haorR(h.ha) < haorR(best.ha))) { best = h; bi = i; } }); if (best) return { kind: "haor", item: best, i: bi }; }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// panel charts
function svgIn(el, h) { el.innerHTML = ""; const w = Math.max(280, el.clientWidth || 340); return { s: d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
const grow = (sel, delay = 0, dur = 800) => sel.transition().delay(delay * T()).duration(dur * T()).ease(d3.easeCubicOut);

// haor area by district: a bar of the district's land with the haor share filled in
export function drawHaorDistricts(el, W) {
  const d = W.haor_by_district; const rowH = 34; const { s, w } = svgIn(el, d.length * rowH + 4); const x0 = 96, xw = w - x0 - 64;
  const x = d3.scaleLinear().domain([0, d3.max(d, r => r.district_ha)]).range([0, xw]);
  d.forEach((r, i) => { const y = i * rowH;
    s.append("text").attr("x", 0).attr("y", y + 15).attr("font-size", 13).attr("font-weight", 600).attr("fill", C.ink).text(r.district);
    s.append("text").attr("x", 0).attr("y", y + 28).attr("font-size", 11).attr("fill", C.dim).text(r.n + " haors");
    s.append("rect").attr("x", x0).attr("y", y + 6).attr("height", 16).attr("width", x(r.district_ha)).attr("fill", "#eef1f4");
    s.append("rect").attr("x", x0).attr("y", y + 6).attr("height", 16).attr("width", 0).attr("fill", WET.haor).attr("opacity", 0.85).call(g => grow(g, i * 90).attr("width", x(r.haor_ha)));
    s.append("text").attr("x", x0 + x(r.district_ha) + 6).attr("y", y + 18).attr("font-size", 12).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(Math.round(r.haor_ha / r.district_ha * 100) + "%"); });
}
// waterbird counts: one small row per counted site, dots joined by a thin line, the same scale for all
export function drawBirds(el, W, onPick) {
  const sites = W.birds.sites.filter(s => s.counts.length); const rowH = 100; const { s, w } = svgIn(el, sites.length * rowH + 22);
  const x = d3.scaleLinear().domain([2009, 2026]).range([34, w - 54]); const y = d3.scaleSqrt().domain([0, 170000]).range([rowH - 22, 20]);
  sites.forEach((st, k) => { const g = s.append("g").attr("transform", `translate(0,${k * rowH})`).style("cursor", "pointer").on("click", () => onPick && onPick(st));
    g.append("text").attr("x", 0).attr("y", 12).attr("font-size", 13).attr("font-weight", 600).attr("fill", C.ink).text(st.name);
    [10000, 50000, 150000].forEach(t => { g.append("line").attr("x1", 34).attr("x2", w - 54).attr("y1", y(t) + 10).attr("y2", y(t) + 10).attr("stroke", C.line).attr("stroke-dasharray", "2 3");
      g.append("text").attr("x", 0).attr("y", y(t) + 13).attr("font-size", 10).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(t / 1000 + "k"); });
    const line = d3.line().x(d => x(d[0])).y(d => y(d[1]) + 10);
    const p = g.append("path").attr("d", line(st.counts)).attr("fill", "none").attr("stroke", BIRD.edge).attr("stroke-width", 1.4); const L = p.node().getTotalLength();
    p.attr("stroke-dasharray", L).attr("stroke-dashoffset", L).call(q => grow(q, k * 200, 1100).attr("stroke-dashoffset", 0));
    st.counts.forEach((c, i) => { g.append("circle").attr("cx", x(c[0])).attr("cy", y(c[1]) + 10).attr("r", 0).attr("fill", BIRD.site).attr("stroke", "#fff").call(q => grow(q, k * 200 + i * 90, 400).attr("r", 3.6)).append("title").text(`${c[0]}: ${fmt(c[1])}`); });
    const mx = st.counts.reduce((a, b) => b[1] > a[1] ? b : a), last = st.counts[st.counts.length - 1];
    g.append("text").attr("x", x(mx[0])).attr("y", y(mx[1]) + 2).attr("text-anchor", x(mx[0]) > w - 90 ? "end" : "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(fmt(Math.round(mx[1] / 100) * 100));
    if (last !== mx) g.append("text").attr("x", x(last[0]) + 6).attr("y", y(last[1]) + 14).attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(fmt(last[1])); });
  [2010, 2015, 2020, 2025].forEach(t => s.append("text").attr("x", x(t)).attr("y", sites.length * rowH + 14).attr("text-anchor", "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(t));
}
// fish production, 1983-84 to now: three stacked bands that draw in left to right
export function drawFishNational(el, W) {
  const d = W.fish_national; const { s, w } = svgIn(el, 190); const keys = ["culture", "capture", "marine"]; const col = { culture: FISHR[3], capture: FISHR[1], marine: "#9ca3af" };
  const x = d3.scaleLinear().domain([0, d.length - 1]).range([34, w - 72]); const y = d3.scaleLinear().domain([0, 5.4e6]).range([160, 10]);
  const st = d3.stack().keys(keys)(d); const area = d3.area().x((p, i) => x(i)).y0(p => y(p[0])).y1(p => y(p[1])).curve(d3.curveMonotoneX);
  const clip = s.append("clipPath").attr("id", "fnClip").append("rect").attr("x", 0).attr("y", 0).attr("height", 190).attr("width", 0); grow(clip, 0, 1400).attr("width", w);
  const g = s.append("g").attr("clip-path", "url(#fnClip)"); st.forEach(L => g.append("path").attr("d", area(L)).attr("fill", col[L.key]));
  [1, 2, 3, 4, 5].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w - 72).attr("y1", y(v * 1e6)).attr("y2", y(v * 1e6)).attr("stroke", "#fff").attr("stroke-opacity", 0.6); s.append("text").attr("x", 0).attr("y", y(v * 1e6) + 4).attr("font-size", 10.5).attr("fill", C.dim).text(v + " M t"); });
  const lastI = d.length - 1; const L = st.map(l => l[lastI]);
  keys.forEach((k, i) => s.append("text").attr("x", w - 66).attr("y", y((L[i][0] + L[i][1]) / 2) + 4).attr("font-size", 12).attr("font-weight", 600).attr("fill", k === "marine" ? "#4b5563" : col[k] === FISHR[1] ? "#2b6a8f" : col[k]).text({ culture: "Farmed", capture: "Caught inland", marine: "Sea" }[k]));
  [0, Math.round(lastI / 2), lastI].forEach(i => s.append("text").attr("x", x(i)).attr("y", 180).attr("text-anchor", i === 0 ? "start" : i === lastI ? "end" : "middle").attr("font-size", 11).attr("font-family", "IBM Plex Mono").attr("fill", C.dim).text(d[i].y));
}
// species groups in the latest year, inland and sea
export function drawFishSpecies(el, W) {
  const d = W.fish_species.slice(0, 10); const rowH = 22; const { s, w } = svgIn(el, d.length * rowH + 4); const x0 = 112;
  const x = d3.scaleLinear().domain([0, d3.max(d, r => r.t)]).range([0, w - x0 - 64]);
  d.forEach((r, i) => { const y = i * rowH;
    s.append("text").attr("x", 0).attr("y", y + 14).attr("font-size", 12.5).attr("fill", C.ink).text(r.g);
    s.append("rect").attr("x", x0).attr("y", y + 4).attr("height", 13).attr("width", 0).attr("fill", FISHR[3]).call(g => grow(g, i * 60).attr("width", x(r.inland)));
    s.append("rect").attr("x", x0 + x(r.inland)).attr("y", y + 4).attr("height", 13).attr("width", 0).attr("fill", "#9ca3af").call(g => grow(g, 400 + i * 60).attr("width", x(r.marine)));
    s.append("text").attr("x", x0 + x(r.t) + 6).attr("y", y + 15).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").attr("fill", C.ink).text(r.t >= 1e6 ? f1(r.t / 1e6) + " M" : Math.round(r.t / 1000) + "k"); });
}
// a storm's wind as a tiny line, for the tracker list
export function sparkKt(st, w = 78, h = 22) {
  const k = st.pts.map(p => p[2]); const x = i => (i / Math.max(1, k.length - 1)) * (w - 2) + 1, y = v => h - 2 - Math.min(150, v) / 150 * (h - 4);
  const d = k.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join("");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(64)}" y2="${y(64)}" stroke="#e5e7eb" stroke-dasharray="2 2"/><path d="${d}" fill="none" stroke="#6b7280" stroke-width="1.2"/><circle cx="${x(k.indexOf(Math.max(...k)))}" cy="${y(Math.max(...k))}" r="2.4" fill="currentColor"/></svg>`;
}
