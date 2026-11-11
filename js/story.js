// story.js  --  the chapters, keyed by the data-id of their section in index.html.
// Each chapter frames a box of the ground (lon/lat) from a direction; main.js fits that box to the
// screen that is actually there, so nothing is ever cut off on a narrow laptop or a wide monitor.
//   view: { box: [W, S, E, N], tilt: degrees above the horizon, az: compass bearing of the camera
//           seen from the box centre (180 = camera to the south, looking north), top: km of relief to keep in frame }
// Uniforms: uExag relief, uSeaLevel drown, uRiverGlow, uFar far field, uLowBand tint below (m),
// uCoverMix land cover vs silt, uForest / uWet / uBuilt highlights, uLoss Hansen forest loss, uCutOn slice.
const U = (o = {}) => ({ uExag: 14, uSeaLevel: 0, uRiverGlow: 0.4, uFar: 0.6, uLowBand: 0, uSink: 0, uCoverMix: 1, uForest: 0, uWet: 0, uBuilt: 0, uLoss: 0, uCutOn: 0, ...o });
const L = (o = {}) => ({ storms: 0, wind: 0, pop: 0, labels: 0.9, farRivers: 0.6, rivers: 0, riverLabels: 0, outlines: 0, rain: 0, warm: 0, tide: 0, wall: 0, ...o });
const V = (box, tilt = 50, az = 190, top = 10) => ({ box, tilt, az, top });

const WHOLE = [88.05, 20.75, 92.65, 26.6];           // Bangladesh
const SOUTH = [88.0, 21.0, 92.3, 24.2];           // the delta proper
const BAY = [87.2, 17.8, 93.0, 25.8];             // the Bay of Bengal approach, for storms

export const CHAPTERS = {
  cover:      { nav: "Poli", group: "The ground", legend: "cover", view: V(WHOLE, 58, 200, 12), orbit: 0.012, u: U(), layers: L({ rivers: 0.5 }) },
  ground:     { nav: "What grows on the mud", group: "The ground", legend: "cover", view: V(WHOLE, 68, 182, 8), orbit: 0, u: U({ uExag: 10 }), layers: L({ rivers: 0.6 }) },
  low:        { nav: "How low it lies", group: "The ground", legend: "low", view: V(SOUTH, 44, 205, 10), orbit: 0, u: U({ uExag: 22, uLowBand: 10, uCoverMix: 0.35 }), layers: L({ rivers: 0.3 }) },
  rim:        { nav: "The rim of hills", group: "The ground", legend: "cover", view: V([91.0, 20.8, 92.8, 25.3], 30, 150, 16), orbit: 0, u: U({ uExag: 22, uForest: 0.6 }), layers: L({ rivers: 0.3 }) },
  slice:      { nav: "A cut through the delta", group: "The ground", legend: "slice", view: V([88.0, 21.0, 92.7, 26.5], 24, 180, 14), orbit: 0, u: U({ uExag: 28, uCoverMix: 0.6, uFar: 0.2, uCutOn: 1 }), layers: L({ wall: 1, labels: 0.5, farRivers: 0 }), slice: true },
  rivers:     { nav: "Every river", group: "Water", legend: "rivers", view: V(WHOLE, 62, 185, 8), orbit: 0, u: U({ uRiverGlow: 1, uFar: 0.8, uCoverMix: 0.55 }), layers: L({ rivers: 1, riverLabels: 0.9, farRivers: 1 }) },
  silt:       { nav: "The silt runs out", group: "Water", legend: "rivers", view: V([89.4, 21.4, 91.6, 23.6], 42, 188, 6), orbit: 0, u: U({ uExag: 18, uRiverGlow: 0.9, uCoverMix: 0.6 }), layers: L({ rivers: 0.8 }) },
  sundarbans: { nav: "Sundarbans", group: "Forest and wetland", legend: "forest", view: V([88.9, 21.55, 90.1, 22.75], 44, 195, 4), orbit: 0.004, u: U({ uExag: 10, uForest: 1, uRiverGlow: 0.7 }), layers: L({ rivers: 0.7, labels: 0.7 }) },
  haor:       { nav: "The haors", group: "Forest and wetland", legend: "wet", view: V([90.6, 24.1, 92.4, 25.3], 44, 192, 6), orbit: 0, u: U({ uExag: 12, uWet: 1, uForest: 0.4, uRiverGlow: 0.8 }), layers: L({ rivers: 0.9, riverLabels: 0.8, labels: 0.7, outlines: 1 }) },
  cht:        { nav: "Hill forest, going", group: "Forest and wetland", legend: "loss", view: V([91.6, 21.2, 92.7, 23.8], 34, 145, 16), orbit: 0.004, u: U({ uExag: 14, uForest: 0.6, uLoss: 1 }), layers: L({ rivers: 0.4, labels: 0.7 }) },
  sinking:    { nav: "The ground goes down", group: "Sea", legend: "cover", view: V([89.0, 22.1, 90.3, 23.3], 40, 195, 6), orbit: 0, u: U({ uExag: 18, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.6 }) },
  rise:       { nav: "Raise the sea", group: "Sea", legend: "rise", seaSlider: true, view: V([88.4, 21.2, 91.6, 23.7], 44, 196, 6), orbit: 0, u: U({ uExag: 16, uSeaLevel: 2.0, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.5 }) },
  sealevel:   { nav: "Every gauge points up", group: "Sea", legend: "tide", view: V([88.6, 21.2, 92.3, 23.4], 44, 190, 8), orbit: 0, u: U({ uExag: 16, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.5, tide: 1 }) },
  warming:    { nav: "Warmer every decade", group: "Climate", legend: "stations", view: V(WHOLE, 60, 190, 20), orbit: 0.006, u: U({ uCoverMix: 0.45, uFar: 0.35 }), layers: L({ rivers: 0.3, warm: 1 }) },
  monsoon:    { nav: "Four months of rain", group: "Climate", legend: "rain", view: V(WHOLE, 60, 200, 40), orbit: 0.006, u: U({ uCoverMix: 0.45, uFar: 0.35 }), layers: L({ rivers: 0.3, rain: 1 }) },
  storms:     { nav: "Cyclones since 1960", group: "Storms", legend: "storms", stormYears: [1960, 2025], view: V(BAY, 58, 185, 10), orbit: 0, u: U({ uCoverMix: 0.55, uFar: 0.5 }), layers: L({ storms: 1, wind: 1, rivers: 0.3 }) },
  shelters:   { nav: "The dying stopped", group: "Storms", legend: "storms", stormYears: [1960, 2025], namedOnly: true, view: V(BAY, 56, 188, 10), orbit: 0, u: U({ uCoverMix: 0.6, uFar: 0.5 }), layers: L({ storms: 0.45, rivers: 0.3 }) },
  floods:     { nav: "A fifth floods every year", group: "Water", legend: "low", view: V(WHOLE, 70, 182, 8), orbit: 0, u: U({ uLowBand: 8, uRiverGlow: 0.8, uCoverMix: 0.4 }), layers: L({ rivers: 0.9 }) },
  people:     { nav: "People on the low land", group: "People", legend: "people", view: V(WHOLE, 58, 196, 8), orbit: 0.006, u: U({ uRiverGlow: 0.25, uFar: 0.25, uCoverMix: 0.6, uBuilt: 0.6 }), layers: L({ pop: 1, labels: 0.6, rivers: 0.3 }) },
  moving:     { nav: "Displaced", group: "People", legend: "people", view: V([89.2, 22.0, 91.4, 24.9], 44, 186, 6), orbit: 0, u: U({ uRiverGlow: 0.6, uFar: 0.25, uCoverMix: 0.6 }), layers: L({ pop: 1, labels: 0.8, rivers: 0.6, riverLabels: 0.6 }) },
  plan:       { nav: "The river can raise it", group: "People", legend: "cover", view: V(WHOLE, 58, 200, 12), orbit: 0.01, u: U({ uRiverGlow: 0.9 }), layers: L({ pop: 0.4, rivers: 0.7 }) },
};
