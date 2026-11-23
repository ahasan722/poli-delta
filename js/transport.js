// transport.js  --  v13: the national highways, the railways, rail junctions and the big bridges, from OpenStreetMap.
// Each class is one merged ribbon mesh (a flat band a little above the ground), so thousands of segments draw in a few calls.
import * as THREE from "three";
import { toScene } from "./terrain.js?v=13";
import { makeLabel } from "./layers.js?v=13";
import { ROAD, RAIL, BASE } from "./palette.js?v=13";

const kmh = (m, exag) => Math.max(m, 0) * 0.001 * exag;
// many polylines -> one ribbon mesh of a given half-width (km)
function ribbons(lines, half, color, sampleH, exag, lift) {
  const pos = [], idx = []; let base = 0;
  for (const line of lines) {
    const pts = line.map(([lon, lat]) => { const p = toScene(lon, lat); p.y = kmh(sampleH(lon, lat), exag) + lift; return p; });
    if (pts.length < 2) continue;
    pts.forEach((P, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; const nx = -dz / L, nz = dx / L;
      pos.push(P.x + nx * half, P.y, P.z + nz * half, P.x - nx * half, P.y, P.z - nz * half);
      if (i) { const k = base + i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
    base += pts.length * 2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
}
const lab = (text, lon, lat, y, o) => { const s = makeLabel(text, o); const p = toScene(lon, lat); p.y = y; s.position.copy(p); s.userData.op = 1; return s; };

export function buildTransport(TR, sampleH, exag) {
  const G = new THREE.Group(); G.name = "transport";
  const minor = TR.roads.filter(r => r.c !== "N").map(r => r.p), major = TR.roads.filter(r => r.c === "N").map(r => r.p);
  const m1 = ribbons(minor, 0.32, ROAD.minor, sampleH, exag, 1.0); m1.userData.op = 0.8; G.add(m1);
  const casing = ribbons(major, 0.85, "#ffffff", sampleH, exag, 1.1); casing.userData.op = 0.9; G.add(casing);
  const m2 = ribbons(major, 0.55, ROAD.major, sampleH, exag, 1.2); m2.userData.op = 0.95; G.add(m2);
  const rc = ribbons(TR.rails, 0.6, "#ffffff", sampleH, exag, 1.3); rc.userData.op = 0.85; G.add(rc);
  const rl = ribbons(TR.rails, 0.36, RAIL.line, sampleH, exag, 1.4); rl.userData.op = 1; G.add(rl);
  // highway numbers, one per main route, on its longest piece
  const best = {}; TR.roads.filter(r => r.c === "N").forEach(r => { if (!best[r.r] || r.p.length > best[r.r].p.length) best[r.r] = r; });
  Object.values(best).forEach(r => { const m = r.p[Math.floor(r.p.length / 2)]; G.add(lab(r.r, m[0], m[1], kmh(sampleH(m[0], m[1]), exag) + 4, { size: 13, weight: 700, color: "#ffffff", halo: ROAD.major })); });
  // rail junctions
  TR.junctions.forEach(j => { const p = toScene(j.lon, j.lat); const y = kmh(sampleH(j.lon, j.lat), exag) + 1.6;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.1, 32), new THREE.MeshBasicMaterial({ color: RAIL.line, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, y, p.z); ring.userData.op = 1; G.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); dot.rotation.x = -Math.PI / 2; dot.position.set(p.x, y - 0.05, p.z); dot.userData.op = 1; G.add(dot);
    if (j.ends >= 4) G.add(lab(j.upazila, j.lon + 0.05, j.lat + 0.03, y + 3, { size: 12, weight: 600, color: RAIL.line })); });
  // bridges: the span in ink over a white casing, a marker and its name
  const bc = ribbons(TR.bridges.map(b => b.p), 1.5, "#ffffff", sampleH, exag, 2.0); bc.userData.op = 1; G.add(bc);
  const bl = ribbons(TR.bridges.map(b => b.p), 1.0, ROAD.bridge, sampleH, exag, 2.1); bl.userData.op = 1; G.add(bl);
  TR.bridges.slice(0, 12).forEach((b, i) => G.add(lab(`${b.name.replace(/ \(.*\)/, "")} · ${b.km.toFixed(1)} km`, b.lon, b.lat - 0.035, 6 + (i % 2) * 2, { size: i < 3 ? 15 : 13, weight: 600, color: BASE.ink })));
  return G;
}
export function updateTransport(G, o, lf) {
  G.visible = o > 0.01; if (!G.visible) return;
  G.children.forEach(c => { c.material.opacity = o * (c.userData.op ?? 1) * (c.isSprite ? lf : 1); });
}
