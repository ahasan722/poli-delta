// layers.js  --  everything that sits on top of the relief: storm tracks, population lights, labels, rivers beyond the border.
import * as THREE from "three";
import { toScene, GRID } from "./terrain.js";

const km = (m, exag) => m * 0.001 * exag;

// ---- storm tracks ----------------------------------------------------------------------------
// each track is a ribbon of line segments lifted a little above the ground; colour by wind
export function buildStorms(storms, sampleH, exag) {
  // each track becomes a flat ribbon lying a little above the ground; width and height follow the wind,
  // so a depression is a thread and a super-cyclone is a road. Additive blending makes crossings glow.
  const group = new THREE.Group(); group.name = "storms";
  const windCol = kt => kt >= 96 ? [1.0, 0.36, 0.22] : kt >= 64 ? [1.0, 0.6, 0.25] : kt >= 34 ? [0.95, 0.77, 0.36] : [0.6, 0.64, 0.68];
  for (const s of storms) {
    const pts = [];
    for (const [lon, lat, w] of s.pts) {
      if (lon < GRID.W - 1.6 || lon > GRID.E + 1.6 || lat < GRID.S - 2.2 || lat > GRID.N + 0.3) continue;
      const p = toScene(lon, lat); const h = Math.max(sampleH(lon, lat), -60);
      p.y = km(h, exag) + 5 + (w / 150) * 25; pts.push({ p, w });
    }
    if (pts.length < 2) continue;
    const pos = [], col = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(pts.length - 1, i + 1)].p;
      const dir = new THREE.Vector3().subVectors(b, a); dir.y = 0; dir.normalize();
      const nrm = new THREE.Vector3(-dir.z, 0, dir.x);
      const half = 0.9 + (pts[i].w / 150) * 3.2;        // km
      const c = windCol(pts[i].w); const P = pts[i].p;
      pos.push(P.x + nrm.x * half, P.y, P.z + nrm.z * half, P.x - nrm.x * half, P.y, P.z - nrm.z * half);
      col.push(...c, ...c);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const ribbon = new THREE.Mesh(geo, mat); ribbon.userData = s; ribbon.name = s.sid; group.add(ribbon);
    if (s.note) {
      // a ring where the track first crosses 21.5 N heading for the coast
      const lf = pts.find(q => q.p.z < toScene(0, 21.5).z) || pts[pts.length - 1];
      const ringGeo = new THREE.RingGeometry(9, 12, 40); ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.copy(lf.p); ring.position.y = 3; ring.name = "ring-" + s.sid; ring.userData = s; group.add(ring);
      const lab = makeLabel(`${s.note.label} ${s.note.year}`, { size: 14, color: "#ffd27a", weight: 700 }); lab.position.copy(ring.position); lab.position.y += 14; lab.name = "lab-" + s.sid; lab.userData = { ...s, base: lab.userData.base, isStormLabel: true }; group.add(lab);
    }
  }
  return group;
}

// ---- population as night lights -------------------------------------------------------------
// one point per texel with people; size and brightness by log(people). This is GPW 2015, 1 km, not real lights.
export function buildPopulation(img, sampleH, exag) {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  const pos = [], size = [], col = [];
  const W = img.width, H = img.height;
  // a cheap deterministic jitter so the lights do not line up like graph paper
  const jit = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const people = d[i] * 256 + d[i + 1];
    if (people < 700) continue;                      // ~1,400 per km2: villages and up
    const lon = GRID.W + (x + 0.15 + 0.7 * jit(x, y)) / W * (GRID.E - GRID.W), lat = GRID.N - (y + 0.15 + 0.7 * jit(y, x)) / H * (GRID.N - GRID.S);
    const p = toScene(lon, lat); p.y = km(Math.max(sampleH(lon, lat), 0), exag) + 0.8;
    pos.push(p.x, p.y, p.z);
    const l = Math.log10(people);          // 2.85 .. 4.8
    const t = Math.min(1, (l - 2.85) / 1.9);
    size.push(0.55 + t * t * 3.4);
    col.push(0.55 + 0.45 * t, 0.42 + 0.4 * t, 0.22 + 0.25 * t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uScale: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; uniform float uScale; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize * uScale * 300.0 / -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=smoothstep(0.5,0.05,r); gl_FragColor=vec4(vC, a*uOpacity); }`
  });
  const pts = new THREE.Points(geo, mat); pts.name = "population"; pts.userData.count = pos.length / 3;
  return pts;
}

// ---- rivers beyond Bangladesh (WDBII) -------------------------------------------------------
export function buildFarRivers(geojson, sampleH, exag) {
  const group = new THREE.Group(); group.name = "farRivers";
  for (const f of geojson.features) {
    const lines = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const ln of lines) {
      const pts = ln.map(([lon, lat]) => { const p = toScene(lon, lat); p.y = km(Math.max(sampleH(lon, lat), -60), exag) + 0.5; return p; });
      if (pts.length < 2) continue;
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2c5a70, transparent: true, opacity: 0.55 })));
    }
  }
  return group;
}

// ---- place labels as sprites -----------------------------------------------------------------
export function makeLabel(text, { size = 22, color = "#efe9dc", weight = 600 } = {}) {
  const pad = 8, c = document.createElement("canvas"), ctx = c.getContext("2d");
  ctx.font = `${weight} ${size}px "Open Sans", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2, h = size + pad * 2;
  c.width = w * 2; c.height = h * 2; ctx.scale(2, 2);
  ctx.font = `${weight} ${size}px "Open Sans", sans-serif`; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 6; ctx.fillStyle = color; ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 }));
  sp.scale.set(w * 0.42, h * 0.42, 1); sp.userData.base = { w: w * 0.42, h: h * 0.42 };
  return sp;
}

export const PLACES = [
  ["Dhaka", 90.41, 23.81], ["Chattogram", 91.83, 22.35], ["Khulna", 89.56, 22.82], ["Sylhet", 91.87, 24.9], ["Rajshahi", 88.6, 24.37],
  ["Barishal", 90.37, 22.7], ["Rangpur", 89.25, 25.75], ["Cox's Bazar", 91.98, 21.43], ["Mongla", 89.6, 22.47], ["Bhola", 90.65, 22.68],
  ["Sundarbans", 89.3, 22.0], ["Sirajganj", 89.7, 24.45], ["Kolkata", 88.36, 22.57], ["Bay of Bengal", 89.8, 20.6]
];
export const RIVERS = [["Jamuna", 89.65, 24.6], ["Padma", 89.9, 23.5], ["Meghna", 90.75, 23.15], ["Ganges", 88.6, 24.2], ["Meghna estuary", 90.9, 22.35], ["Teesta", 89.5, 25.85], ["Karnaphuli", 92.05, 22.4]];

// ---- every river: HydroRIVERS (discharge-tinted) plus the unnamed minor network --------------
const inside = (lon, lat) => lon > 88.0 && lon < 92.7 && lat > 20.7 && lat < 26.65;
export function buildRivers(rivers, sampleH, exag) {
  const group = new THREE.Group(); group.name = "rivers";
  const lift = (lon, lat) => km(Math.max(sampleH(lon, lat), -60), exag) + 0.6;
  const seg = (lines, colorFn, opacity, name) => {
    const pos = [], col = [];
    for (const l of lines) {
      const c = colorFn(l);
      for (let i = 1; i < l.c.length; i++) {
        const a = l.c[i - 1], b = l.c[i];
        if (a[0] < GRID.W || a[0] > GRID.E || a[1] < GRID.S || a[1] > GRID.N) continue;
        const pa = toScene(a[0], a[1]), pb = toScene(b[0], b[1]); pa.y = lift(a[0], a[1]); pb.y = lift(b[0], b[1]);
        pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z); col.push(...c, ...c);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); m.name = name; return m;
  };
  // discharge: 150 m3/s is a thread, 40,000 is the Padma; log scale into brightness
  const disCol = l => { const t = Math.min(1, Math.max(0, (Math.log10(l.dis) - 2.1) / 2.5)); return [0.20 + 0.35 * t, 0.45 + 0.35 * t, 0.55 + 0.35 * t]; };
  group.add(seg(rivers.major, disCol, 0.0, "major"));
  group.add(seg(rivers.minor, () => [0.18, 0.32, 0.40], 0.0, "minor"));
  // one label per named river, on the reach nearest the middle of all its reaches (inside Bangladesh), so
  // the Meghna is not labelled on top of the Lower Meghna and the Brahmaputra not in Assam
  const byName = {};
  for (const l of rivers.major) if (l.name) { const m = l.c[Math.floor(l.c.length / 2)]; if (inside(m[0], m[1])) (byName[l.name] ??= []).push([m, l]); }
  for (const [n, reaches] of Object.entries(byName)) {
    const cx = reaches.reduce((a, r) => a + r[0][0], 0) / reaches.length, cy = reaches.reduce((a, r) => a + r[0][1], 0) / reaches.length;
    const mid = reaches.reduce((b, r) => (Math.hypot(r[0][0] - cx, r[0][1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? r[0] : b), reaches[0][0]);
    const sp = makeLabel(n, { size: 19, color: "#b9e2f2", weight: 600 }); const p = toScene(mid[0], mid[1]); p.y = lift(mid[0], mid[1]) + 3; sp.position.copy(p); sp.userData.kind = "river"; sp.name = "rl-" + n; group.add(sp);
  }
  return group;
}

// ---- outlines with a name: the haors (and anything else drawn as a polygon) -------------------
export function buildOutlines(geojson, sampleH, exag, { color = "#9fe3dc", size = 24 } = {}) {
  const group = new THREE.Group(); group.name = "outlines";
  const lift = (lon, lat) => km(Math.max(sampleH(lon, lat), -60), exag) + 1.2;
  for (const f of geojson.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const pos = []; let cx = 0, cy = 0, n = 0;
    for (const poly of polys) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1]; const pa = toScene(a[0], a[1]), pb = toScene(b[0], b[1]); pa.y = lift(a[0], a[1]); pb.y = lift(b[0], b[1]);
      pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z); cx += a[0]; cy += a[1]; n++;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.name = "outline"; group.add(line);
    const lab = makeLabel(f.properties.name, { size, color, weight: 600 }); const p = toScene(cx / n, cy / n); p.y = lift(cx / n, cy / n) + 5; lab.position.copy(p); lab.name = "outline-label"; lab.material.opacity = 0; group.add(lab);
  }
  return group;
}
