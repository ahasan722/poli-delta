// story.js  --  v5: eight chapters toward one decision: where to defend first.
// Each chapter frames a box of ground (view), sets the relief's uniforms (u) and layer opacities (layers),
// and may animate something across its own scroll span with inner(t), t going 0 -> 1 while the reader
// scrolls through the chapter. main.js blends everything continuously between chapters, so scrolling back
// plays the story backwards.
//   view: { box: [W, S, E, N], tilt: degrees above the horizon, az: bearing of the camera from the box centre
//           (180 = from the south), top: km of relief to keep in frame }
const U = (o = {}) => ({ uExag: 14, uSeaLevel: 0, uRiverGlow: 0.35, uFar: 0.55, uLowBand: 0, uSink: 0, uCoverMix: 1, uForest: 0, uWet: 0, uBuilt: 0, uLoss: 0, uCutOn: 0, ...o });
const L = (o = {}) => ({ rivers: 0.35, riverLabels: 0, farRivers: 0.5, labels: 0.85, storms: 0, wind: 0, prisms: 0, ranks: 0, site: 0, ...o });
const V = (box, tilt, az, top = 10) => ({ box, tilt, az, top });

const WHOLE = [88.05, 20.75, 92.65, 26.6];
const COAST = [88.6, 21.5, 92.4, 23.4];

export const SITE = { name: "Beel Bhaina", lon: 89.23, lat: 22.95 };      // tidal river management, Keshabpur, Jashore

export const CHAPTERS = [
  { id: "cover", nav: "The question", view: V(WHOLE, 52, 196, 12), u: U(), layers: L() },
  { id: "low", nav: "Low ground", view: V([88.4, 20.9, 92.4, 25.2], 46, 192, 8), u: U({ uExag: 18, uCoverMix: 0.4 }), layers: L({ rivers: 0.2 }),
    inner: t => ({ uLowBand: 0.5 + 4.5 * t }) },
  { id: "silt", nav: "Less silt", view: V(WHOLE, 62, 186, 8), u: U({ uRiverGlow: 1, uCoverMix: 0.5, uFar: 0.75 }), layers: L({ rivers: 1, riverLabels: 0.9, farRivers: 1 }) },
  { id: "sink", nav: "Sinking", view: V([88.7, 21.6, 90.4, 23.1], 34, 200, 6), u: U({ uExag: 22, uCoverMix: 0.55, uSeaLevel: 0.001 }), layers: L({ rivers: 0.5 }),
    inner: t => ({ uSink: 1.5 * t }) },
  { id: "sea", nav: "Rising sea", view: V(COAST, 44, 194, 6), u: U({ uExag: 18, uCoverMix: 0.5, uSink: 0 }), layers: L({ rivers: 0.4 }),
    inner: t => ({ uSeaLevel: 0.001 + 1.4 * t }) },
  { id: "storms", nav: "Cyclones", view: V([87.4, 17.6, 93.0, 25.4], 56, 186, 10), u: U({ uCoverMix: 0.55, uFar: 0.5 }), layers: L({ storms: 1, wind: 0.9, rivers: 0.25, labels: 0.5 }),
    inner: t => ({ year: 1960 + 65 * t }) },
  { id: "priority", nav: "The ten", view: V([88.6, 20.9, 92.4, 23.9], 56, 192, 50), u: U({ uCoverMix: 0.25, uFar: 0.3, uRiverGlow: 0.2 }), layers: L({ prisms: 0.95, ranks: 1, rivers: 0.15, labels: 0 }),
    inner: t => ({ grow: Math.min(1, t / 0.6) }) },
  { id: "raise", nav: "What works", view: V([88.55, 22.25, 90.0, 23.5], 50, 200, 16), u: U({ uExag: 20, uCoverMix: 0.8, uRiverGlow: 0.7 }), layers: L({ rivers: 0.7, site: 1, labels: 0.6 }) },
  { id: "explore", nav: "Your turn", view: V([88.3, 20.7, 92.6, 25.6], 52, 194, 50), u: U({ uCoverMix: 0.35, uFar: 0.3, uRiverGlow: 0.3 }), layers: L({ prisms: 0.92, ranks: 1, rivers: 0.25, labels: 0 }), explore: true,
    inner: t => ({ grow: 1 }) },
];
