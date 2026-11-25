// rain.js  --  v14: rainfall. On the map, rain falls as streaks over the land, thicker where the month is wetter
// (each streak takes the rainfall of its nearest BMD station); the districts rise with the month's rainfall.
// In the panel: the year of rain as bars with a playhead, and the wet and dry stations.
import * as THREE from "three";
import { toScene, GRID } from "./terrain.js?v=15";
import { RAIN, BASE } from "./palette.js?v=15";
const fmt = d3.format(",");
const T = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildRain(R, inLand) {
  const N = 4200, top = 90; const pos = new Float32Array(N * 6), alpha = new Float32Array(N * 2); const seeds = [];
  for (let i = 0; seeds.length < N && i < N * 20; i++) { const lon = GRID.W + Math.random() * (GRID.E - GRID.W), lat = GRID.S + Math.random() * (GRID.N - GRID.S); if (!inLand(lon, lat)) continue;
    const p = toScene(lon, lat); let best = null, bd = 1e9; for (const s of R.stations) { const d = Math.hypot((s.lon - lon) * 102.5, (s.lat - lat) * 110.8); if (d < bd) { bd = d; best = s; } }
    seeds.push({ x: p.x, z: p.z, ph: Math.random(), sp: 0.9 + Math.random() * 0.5, st: best }); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uOp: { value: 0 }, uCol: { value: new THREE.Color("#1e3a8a") } },
    vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float uOp; uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * uOp); }" });
  const lines = new THREE.LineSegments(g, m); lines.frustumCulled = false; lines.name = "rain";
  lines.userData.step = (t, month) => { const k = Math.floor(month) % 12, f = month - Math.floor(month);
    seeds.forEach((s, i) => { const mm = s.st.m[k] * (1 - f) + s.st.m[(k + 1) % 12] * f; const show = Math.min(1, mm / 520); const on = (i / N) < show ? 1 : 0;
      const u = (s.ph + t * 0.55 * s.sp) % 1; const y = top * (1 - u) + 1; const len = 5;
      pos[i * 6] = s.x; pos[i * 6 + 1] = y + len; pos[i * 6 + 2] = s.z; pos[i * 6 + 3] = s.x - 0.4; pos[i * 6 + 4] = y; pos[i * 6 + 5] = s.z;
      alpha[i * 2] = 0; alpha[i * 2 + 1] = on * 0.95 * (u < 0.92 ? 1 : (1 - u) / 0.08); });
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; };
  return lines;
}
function svgIn(el, h) { el.innerHTML = ""; const w = Math.max(280, el.clientWidth || 340); return { s: d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
export const rainHex = mm => RAIN[mm >= 500 ? 4 : mm >= 300 ? 3 : mm >= 150 ? 2 : mm >= 50 ? 1 : 0];
// the year: one bar a month (mean of the stations), coloured by the same classes as the map, with a playhead; click a month
export function drawRainYear(el, R, onMonth) {
  const d = R.national; const { s, w } = svgIn(el, 170); const x = d3.scaleBand().domain(d3.range(12)).range([34, w - 4]).padding(0.18); const y = d3.scaleLinear().domain([0, 600]).range([140, 10]);
  [200, 400, 600].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", BASE.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 0).attr("y", y(v) + 4).attr("font-size", 10.5).attr("fill", BASE.dim).text(v); });
  const bars = d.map((v, i) => s.append("rect").attr("x", x(i)).attr("width", x.bandwidth()).attr("y", 140).attr("height", 0).attr("rx", 2).attr("fill", rainHex(v)).style("cursor", "pointer").on("click", () => onMonth && onMonth(i + 0.5)));
  bars.forEach((b, i) => b.transition().delay(i * 60 * T()).duration(600 * T()).attr("y", y(d[i])).attr("height", 140 - y(d[i])));
  d.forEach((v, i) => { s.append("text").attr("x", x(i) + x.bandwidth() / 2).attr("y", 158).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", BASE.dim).text(MON[i][0]); });
  const lab = s.append("text").attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("font-family", "IBM Plex Mono").attr("fill", BASE.ink);
  return { move: m => { const k = Math.min(11, Math.floor(m)); bars.forEach((b, i) => b.attr("stroke", i === k ? BASE.ink : null).attr("stroke-width", i === k ? 1.5 : 0)); lab.attr("x", x(k) + x.bandwidth() / 2).attr("y", y(d[k]) - 6).text(d[k] + " mm"); } };
}
// rain by year: the station mean (1950-2013) and the BMD 24-station panel (1982-2022)
export function drawRainYears(el, R) {
  const { s, w } = svgIn(el, 150); const x = d3.scaleLinear().domain([1950, 2022]).range([34, w - 8]); const y = d3.scaleLinear().domain([1500, 3200]).range([120, 10]);
  [2000, 2500, 3000].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", BASE.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 0).attr("y", y(v) + 4).attr("font-size", 10.5).attr("fill", BASE.dim).text(fmt(v)); });
  const line = d3.line().x(p => x(p[0])).y(p => y(p[1])).curve(d3.curveMonotoneX);
  [[R.years, "#9ecae1", 1.4], [R.years24, "#08519c", 2]].forEach(([d, c, sw], k) => { const p = s.append("path").attr("d", line(d)).attr("fill", "none").attr("stroke", c).attr("stroke-width", sw); const L = p.node().getTotalLength();
    p.attr("stroke-dasharray", L).attr("stroke-dashoffset", L).transition().delay(k * 400 * T()).duration(1300 * T()).attr("stroke-dashoffset", 0); });
  s.append("text").attr("x", x(1951)).attr("y", 138).attr("font-size", 11).attr("fill", "#6baed6").text("33 stations, 1950-2013");
  s.append("text").attr("x", w - 8).attr("y", 138).attr("text-anchor", "end").attr("font-size", 11).attr("fill", "#08519c").text("24 stations, 1982-2022");
}
