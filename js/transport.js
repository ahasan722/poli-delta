// transport.js  --  v14: highways, railways, rail junctions and the big bridges, each with its own look.
// Every class is one merged ribbon whose width is set on screen (it stays the same number of pixels as you zoom),
// drawn by a small shader that knows how far along its line each pixel is:
//   highways: a warm road with a darker edge and traffic pulses running both ways down the two halves;
//   railways: the classic map railway, a dark band with white dashes inside, and trains (light blocks) running along it;
//   bridges: a thick ink span with a slow glow.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=15";
import { makeLabel } from "./layers.js?v=15";
import { ROAD, RAIL, BASE } from "./palette.js?v=15";

const kmh = (m, exag) => Math.max(m, 0) * 0.001 * exag;
const VS = `
attribute vec2 aN; attribute float aS; attribute float aU;
uniform float uHalf; uniform float uScale;
varying float vS; varying float vU;
void main() { vS = aS; vU = aU; vec3 p = position + vec3(aN.x, 0.0, aN.y) * aS * uHalf * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const FS = `
uniform vec3 uCol; uniform vec3 uEdge; uniform vec3 uHi; uniform float uOp; uniform float uTime; uniform float uMode; uniform float uScale; uniform float uFlow;
varying float vS; varying float vU;
void main() {
  float s = abs(vS); vec3 c = uCol; float a = 1.0;
  float u = vU / max(uScale, 0.05);                                   // distance along the line in screen-ish units
  if (uMode < 0.5) {                                                   // plain
  } else if (uMode < 1.5) {                                            // highway: edge, centre line, traffic both ways
    c = mix(uCol, uEdge, smoothstep(0.78, 0.98, s) * 0.7);
    float dir = vS > 0.0 ? 1.0 : -1.0;
    float p = fract(u / 26.0 - dir * uTime * 0.55 + (vS > 0.0 ? 0.0 : 0.5));
    float car = smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.05, 0.22, p));
    c = mix(c, uHi, car * uFlow * (1.0 - smoothstep(0.55, 0.85, s)));
    a = 1.0 - smoothstep(0.92, 1.0, s);
  } else if (uMode < 2.5) {                                            // railway: dark band, white dashes, running trains
    float dash = step(0.5, fract(u / 9.0));
    c = s < 0.42 ? mix(uEdge, vec3(1.0), dash) : uCol;
    float p = fract(u / 140.0 - uTime * 0.12);
    float train = step(p, 0.06);
    c = mix(c, uHi, train * uFlow);
    a = 1.0 - smoothstep(0.92, 1.0, s);
  } else {                                                             // bridge: ink with a breathing glow at the rim
    float g = 0.5 + 0.5 * sin(uTime * 2.2);
    c = mix(uCol, uHi, smoothstep(0.55, 1.0, s) * (0.35 + 0.65 * g) * uFlow);
  }
  gl_FragColor = vec4(c, a * uOp);
}`;
function ribbons(lines, half, cols, mode, sampleH, exag, lift) {
  const pos = [], nrm = [], side = [], along = [], idx = []; let base = 0;
  for (const line of lines) {
    const pts = line.map(([lon, lat]) => { const p = toScene(lon, lat); p.y = kmh(sampleH(lon, lat), exag) + lift; return p; });
    if (pts.length < 2) continue; let acc = 0;
    pts.forEach((P, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1;
      if (i) acc += Math.hypot(P.x - pts[i - 1].x, P.z - pts[i - 1].z);
      for (const sgn of [1, -1]) { pos.push(P.x, P.y, P.z); nrm.push(-dz / L, dx / L); side.push(sgn); along.push(acc); }
      if (i) { const k = base + i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
    base += pts.length * 2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
  g.setAttribute("aS", new THREE.Float32BufferAttribute(side, 1)); g.setAttribute("aU", new THREE.Float32BufferAttribute(along, 1)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uHalf: { value: half }, uScale: { value: 1 }, uCol: { value: new THREE.Color(cols[0]) }, uEdge: { value: new THREE.Color(cols[1] || cols[0]) }, uHi: { value: new THREE.Color(cols[2] || "#ffffff") },
      uOp: { value: 0 }, uTime: { value: 0 }, uMode: { value: mode }, uFlow: { value: 1 } } });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
const lab = (text, lon, lat, y, o) => { const s = makeLabel(text, o); const p = toScene(lon, lat); p.y = y; s.position.copy(p); s.userData.op = 1; return s; };

export function buildTransport(TR, sampleH, exag) {
  const G = new THREE.Group(); G.name = "transport"; const add = (m, cls, op) => { m.userData = { cls, op }; G.add(m); return m; };
  const minor = TR.roads.filter(r => r.c !== "N").map(r => r.p), major = TR.roads.filter(r => r.c === "N").map(r => r.p);
  add(ribbons(minor, 0.6, [ROAD.minor, "#d97706", "#fff7ed"], 1, sampleH, exag, 1.0), "road", 0.85);
  add(ribbons(major, 1.75, ["#ffffff"], 0, sampleH, exag, 1.1), "road", 0.95);                          // white casing
  add(ribbons(major, 1.25, [ROAD.major, "#8c2d04", "#fff3c4"], 1, sampleH, exag, 1.2), "road", 1);
  add(ribbons(TR.rails, 1.0, ["#ffffff"], 0, sampleH, exag, 1.3), "rail", 0.95);
  add(ribbons(TR.rails, 1.0, [RAIL.line, RAIL.line, RAIL.train], 2, sampleH, exag, 1.4), "rail", 1);
  add(ribbons(TR.bridges.map(b => b.p), 2.8, ["#ffffff"], 0, sampleH, exag, 2.0), "bridge", 1);
  add(ribbons(TR.bridges.map(b => b.p), 2.1, [ROAD.bridge, ROAD.bridge, "#fbbf24"], 3, sampleH, exag, 2.1), "bridge", 1);
  // highway numbers on their longest piece
  const best = {}; TR.roads.filter(r => r.c === "N").forEach(r => { if (!best[r.r] || r.p.length > best[r.r].p.length) best[r.r] = r; });
  Object.values(best).forEach(r => { const m = r.p[Math.floor(r.p.length / 2)]; const s = lab(r.r, m[0], m[1], kmh(sampleH(m[0], m[1]), exag) + 4, { size: 14, weight: 700, color: "#ffffff", halo: ROAD.major }); s.userData.cls = "road"; G.add(s); });
  // rail junctions: a station roundel, ink ring around white
  TR.junctions.forEach(j => { const p = toScene(j.lon, j.lat); const y = kmh(sampleH(j.lon, j.lat), exag) + 1.8;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 1, 32), new THREE.MeshBasicMaterial({ color: RAIL.line, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, y, p.z); ring.userData = { cls: "rail", op: 1, roundel: 2.4 }; G.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); dot.rotation.x = -Math.PI / 2; dot.position.set(p.x, y - 0.05, p.z); dot.userData = { cls: "rail", op: 1, roundel: 2.4 }; G.add(dot);
    if (j.ends >= 4) { const s = lab(j.upazila, j.lon + 0.06, j.lat + 0.035, y + 3, { size: 13, weight: 600, color: RAIL.line }); s.userData.cls = "rail"; G.add(s); } });
  TR.bridges.slice(0, 12).forEach((b, i) => { const s = lab(`${b.name.replace(/ \(.*\)/, "").replace(" Multipurpose", "")} · ${b.km.toFixed(1)} km`, b.lon, b.lat - 0.035, 6 + (i % 2) * 2, { size: i < 3 ? 16 : 13, weight: 600, color: BASE.ink }); s.userData.cls = "bridge"; G.add(s); });
  return G;
}
// mode: "all", "roads", "rails", "bridges": the chosen class at full strength, the others stepped back
const W = { all: { road: 1, rail: 1, bridge: 1 }, roads: { road: 1, rail: 0.12, bridge: 0.5 }, rails: { road: 0.1, rail: 1, bridge: 0.5 }, bridges: { road: 0.3, rail: 0.3, bridge: 1 } };
export function updateTransport(G, o, lf, time, scale, mode = "all") {
  G.visible = o > 0.01; if (!G.visible) return false; const w = W[mode] || W.all;
  G.children.forEach(c => { const k = w[c.userData.cls] ?? 1; const op = o * (c.userData.op ?? 1) * k;
    if (c.material.uniforms) { const u = c.material.uniforms; u.uOp.value = op; u.uTime.value = time; u.uScale.value = scale; u.uFlow.value = mode === "all" ? 0.65 : k > 0.9 ? 1 : 0; }
    else { c.material.opacity = op * (c.isSprite ? lf : 1); if (c.userData.roundel) c.scale.setScalar(c.userData.roundel * scale); } });
  return true;
}
