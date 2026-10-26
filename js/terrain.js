// terrain.js  --  the delta as a lit relief.
// One big plane, displaced in the vertex shader from the terrain-RGB texture that make_terrain.py wrote.
// Everything that changes per chapter (exaggeration, sea level, layer mixes) is a uniform, so the
// story can tween it without touching geometry.
import * as THREE from "three";

export const GRID = { W: 86.5, E: 93.5, S: 19.8, N: 27.0 };     // must match pipeline/make_terrain.py
const LAT0 = 23.4;
export const KM_PER_DEG_LAT = 111.32;
export const KM_PER_DEG_LON = 111.32 * Math.cos(LAT0 * Math.PI / 180);

// scene units are kilometres on the ground; the mesh is centred on the window
export const SIZE = { w: (GRID.E - GRID.W) * KM_PER_DEG_LON, h: (GRID.N - GRID.S) * KM_PER_DEG_LAT };
export function toScene(lon, lat) {
  return new THREE.Vector3((lon - (GRID.W + GRID.E) / 2) * KM_PER_DEG_LON, 0, -(lat - (GRID.S + GRID.N) / 2) * KM_PER_DEG_LAT);
}

const vert = /* glsl */`
  uniform sampler2D uHeight;
  uniform sampler2D uMask;
  uniform vec2 uTexel;
  uniform float uExag;        // vertical exaggeration (km of height per km of... no: metres -> scene km * exag)
  uniform float uSink;        // extra metres subtracted inside Bangladesh (the subsidence chapter)
  varying vec2 vUv;
  varying float vH;           // metres, after sink
  varying vec3 vN;
  varying vec3 vMask;
  varying float vFade;
  float decode(vec2 uv){ vec3 c = texture2D(uHeight, uv).rgb * 255.0; return -10000.0 + (c.r*65536.0 + c.g*256.0 + c.b) * 0.1; }
  void main(){
    vUv = uv;
    vMask = texture2D(uMask, uv).rgb;
    float h = decode(uv);
    float inside = vMask.r;
    // I hold the sea floor flat so the Bay reads as a surface and not ETOPO5's 9 km staircase
    float sea = step(0.5, vMask.b);
    h = mix(h, -60.0, sea);
    // the far field (India, Myanmar) is only a frame: cap it and let it sink into the dark at the grid edge
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float fade = smoothstep(0.0, 0.10, edge);
    h = mix(min(h, 260.0) * fade - (1.0 - fade) * 60.0, h, inside);
    h -= uSink * inside;
    vFade = fade;
    vH = h;
    // normal from neighbours (metres over km, so scaled the same way the displacement is)
    float hx1 = decode(uv + vec2(uTexel.x, 0.0)), hx0 = decode(uv - vec2(uTexel.x, 0.0));
    float hy1 = decode(uv + vec2(0.0, uTexel.y)), hy0 = decode(uv - vec2(0.0, uTexel.y));
    float dx = (hx1 - hx0) * 0.001 * uExag, dy = (hy1 - hy0) * 0.001 * uExag;
    float stepKm = 0.70 * 2.0;
    vN = normalize(vec3(-dx / stepKm, 1.0, dy / stepKm));
    vec3 p = position;
    p.z = max(h, -60.0) * 0.001 * uExag;          // metres -> km, exaggerated
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const frag = /* glsl */`
  precision highp float;
  uniform float uSeaLevel;    // metres above present datum; land at or below is drowned
  uniform float uRiverGlow;   // 0..1 brightness of the river surfaces
  uniform float uFar;         // 0..1 how much of the far field (outside Bangladesh) to show
  uniform float uLowBand;     // metres: tint land below this height (0 = off)
  uniform float uCoverMix;    // 0 = bare silt relief, 1 = ESA WorldCover colours
  uniform float uForest;      // 0..1 lift the tree cover and mangroves
  uniform float uWet;         // 0..1 lift the wetlands and haors
  uniform float uBuilt;       // 0..1 lift built-up land
  uniform float uLoss;        // 0..1 paint Hansen forest loss (CHT) red
  uniform vec3 uSun;
  uniform float uTime;
  varying vec2 vUv;
  varying float vH;
  varying vec3 vN;
  varying vec3 vMask;
  uniform sampler2D uMask;      // R inside, G water, B sea; sampled again here so coasts do not follow the mesh
  uniform sampler2D uDistrict;  // R district id 1..64, 0 outside
  uniform float uPick;          // selected district id (0 none): it stays lit, the rest dims
  uniform float uHover;         // hovered district id
  uniform sampler2D uCover;     // R class, G loss share, B water; sampled per fragment so low-LOD meshes stay sharp
  uniform sampler2D uCoverRGB;
  varying float vFade;
  // palette: night delta. silt, not grass.
  vec3 ramp(float h){
    vec3 c0 = vec3(0.16, 0.14, 0.12);   // 0 m   wet silt
    vec3 c1 = vec3(0.30, 0.25, 0.19);   // 8 m   dry silt
    vec3 c2 = vec3(0.42, 0.36, 0.26);   // 30 m  terrace
    vec3 c3 = vec3(0.36, 0.33, 0.30);   // 150 m hills
    vec3 c4 = vec3(0.46, 0.43, 0.40);   // 600 m+
    if (h < 8.0)   return mix(c0, c1, clamp(h / 8.0, 0.0, 1.0));
    if (h < 30.0)  return mix(c1, c2, (h - 8.0) / 22.0);
    if (h < 150.0) return mix(c2, c3, (h - 30.0) / 120.0);
    return mix(c3, c4, clamp((h - 150.0) / 450.0, 0.0, 1.0));
  }
  // ESA WorldCover classes, as they look from above at dusk
  vec3 coverCol(float c){
    if (c > 94.0) return vec3(0.10, 0.30, 0.24);   // 95 mangroves
    if (c > 89.0) return vec3(0.30, 0.52, 0.46);   // 90 herbaceous wetland
    if (c > 79.0) return vec3(0.09, 0.20, 0.30);   // 80 water
    if (c > 59.0) return vec3(0.80, 0.74, 0.60);   // 60 bare, sand
    if (c > 49.0) return vec3(0.78, 0.58, 0.40);   // 50 built-up
    if (c > 39.0) return vec3(0.66, 0.62, 0.36);   // 40 cropland
    if (c > 29.0) return vec3(0.58, 0.60, 0.34);   // 30 grassland
    if (c > 19.0) return vec3(0.46, 0.50, 0.28);   // 20 shrubland
    if (c > 9.0)  return vec3(0.17, 0.36, 0.20);   // 10 tree cover
    return vec3(0.30, 0.25, 0.19);                 // 0 no data: silt
  }
  void main(){
    vec3 mk = texture2D(uMask, vUv).rgb;
    float inside = mk.r, sea = mk.b;
    vec3 vCover = texture2D(uCover, vUv).rgb;
    vec3 vCoverRGB = texture2D(uCoverRGB, vUv).rgb;
    float cls = vCover.r * 255.0;
    float water = max(mk.g, vCover.b);            // WFP + WorldCover + OSM water
    float light = max(dot(normalize(vN), normalize(uSun)), 0.0);
    light = 0.22 + 0.95 * light;
    float hasCover = step(5.0, cls);                 // WorldCover nodata (new chars, tidal flats) falls back to the silt ramp
    vec3 base = mix(ramp(vH), vCoverRGB, uCoverMix * inside * hasCover);
    vec3 col = base * light;
    // highlights the chapters ask for
    float isTree = step(9.5, cls) * step(cls, 10.5), isMang = step(94.5, cls), isWet = step(89.5, cls) * step(cls, 90.5), isBuilt = step(49.5, cls) * step(cls, 50.5);
    col += uForest * (isTree * vec3(0.04, 0.16, 0.06) + isMang * vec3(0.0, 0.18, 0.12));
    col += uWet * isWet * vec3(0.04, 0.17, 0.19);
    col += uBuilt * isBuilt * vec3(0.45, 0.22, 0.02);
    float lossFrac = vCover.g;                        // share of the texel that lost canopy 2001-2023
    if (uLoss > 0.0 && lossFrac > 0.02) col = mix(col, vec3(0.95, 0.30, 0.16), uLoss * min(1.0, lossFrac * 2.2));
    // the far field: a dim hint of India and Myanmar so the delta has a frame
    col = mix(col * 0.28, col, inside);
    col = mix(vec3(0.03, 0.035, 0.045), col, max(inside, uFar * vFade));
    // low plain tint (the "mud" chapter)
    if (uLowBand > 0.0 && inside > 0.5 && vH <= uLowBand) {
      float t = 1.0 - clamp(vH / uLowBand, 0.0, 1.0);
      col = mix(col, vec3(0.78, 0.52, 0.22), 0.25 + 0.45 * t);
    }
    // rivers: dark water with a faint glow, the glow is a chapter uniform
    vec3 riverCol = mix(vec3(0.05, 0.08, 0.11), vec3(0.27, 0.58, 0.70), uRiverGlow);
    col = mix(col, riverCol, water * (1.0 - sea) * inside);
    // sea and the estuary: deep, with a slow shimmer
    float shimmer = 0.5 + 0.5 * sin(uTime * 0.6 + vUv.x * 90.0 + vUv.y * 60.0);
    vec3 seaCol = vec3(0.025, 0.045, 0.065) + 0.012 * shimmer;
    col = mix(col, seaCol * mix(0.4, 1.0, vFade), sea);
    col = mix(col, seaCol * 1.3, water * (1.0 - inside) * (1.0 - sea));
    // sea-level rise: drown land at or below the level, with a thin bright shoreline
    if (uSeaLevel > 0.0 && inside > 0.5 && vH <= uSeaLevel && water < 0.5) {
      float depth = clamp((uSeaLevel - vH) / 2.0, 0.0, 1.0);
      vec3 flood = mix(vec3(0.75, 0.30, 0.16), vec3(0.18, 0.09, 0.08), depth);
      col = mix(col, flood, 0.85);
    }
    // district picking: the chosen one keeps its light, everything else steps back
    float did = texture2D(uDistrict, vUv).r * 255.0;
    if (uPick > 0.5) { float me = step(abs(did - uPick), 0.5); col = mix(col * 0.42, col * 1.18 + vec3(0.05, 0.04, 0.02), me); }
    if (uHover > 0.5 && abs(did - uHover) < 0.5) col += vec3(0.07, 0.06, 0.04);
    gl_FragColor = vec4(col, 1.0);
  }`;

// The shader displaces p.z (plane normal before rotation). Rotating the mesh object instead of the
// geometry keeps "z = height" true inside the shader. So: flat plane, mesh.rotation.x = -90deg.
export function buildTerrain(textures, segX = 639) {
  const segY = Math.round(segX * SIZE.h / SIZE.w);
  const geo = new THREE.PlaneGeometry(SIZE.w, SIZE.h, segX, segY);
  const uniforms = {
    uHeight: { value: textures.height }, uMask: { value: textures.mask },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1148) },
    uCover: { value: textures.cover }, uCoverRGB: { value: textures.coverRGB }, uDistrict: { value: textures.district }, uPick: { value: 0 }, uHover: { value: 0 },
    uExag: { value: 12.0 }, uSink: { value: 0.0 }, uSeaLevel: { value: 0.0 }, uRiverGlow: { value: 0.35 },
    uFar: { value: 0.6 }, uLowBand: { value: 0.0 }, uCoverMix: { value: 1.0 }, uForest: { value: 0.0 }, uWet: { value: 0.0 }, uBuilt: { value: 0.0 }, uLoss: { value: 0.0 },
    uSun: { value: new THREE.Vector3(-0.6, 0.8, 0.5) }, uTime: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, uniforms };
}

// sample the decoded height at a lon/lat from the CPU copy (for placing labels and track lines on the surface)
export function heightSampler(img) {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  return (lon, lat) => {
    const u = (lon - GRID.W) / (GRID.E - GRID.W), v = (GRID.N - lat) / (GRID.N - GRID.S);
    if (u < 0 || u > 1 || v < 0 || v > 1) return -60;
    const x = Math.min(img.width - 1, Math.floor(u * img.width)), y = Math.min(img.height - 1, Math.floor(v * img.height));
    const i = (y * img.width + x) * 4;
    return -10000 + (d[i] * 65536 + d[i + 1] * 256 + d[i + 2]) * 0.1;
  };
}
