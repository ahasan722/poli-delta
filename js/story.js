// story.js  --  the chapters. Each one says where the camera goes and what the relief shows.
// Camera positions are in scene kilometres (x east, z south, y up), see terrain.js.
// Uniform names: uExag relief, uSeaLevel drown, uRiverGlow, uFar far field, uLowBand tint below (m),
// uCoverMix land cover vs silt, uForest / uWet / uBuilt highlights, uLoss Hansen forest loss.
import { toScene } from "./terrain.js";

const at = (lon, lat, y) => { const p = toScene(lon, lat); p.y = y; return p; };
const U = (o = {}) => ({ uExag: 14, uSeaLevel: 0, uRiverGlow: 0.4, uFar: 0.6, uLowBand: 0, uSink: 0, uCoverMix: 1, uForest: 0, uWet: 0, uBuilt: 0, uLoss: 0, ...o });
const L = (o = {}) => ({ storms: 0, pop: 0, labels: 0.9, farRivers: 0.6, rivers: 0, riverLabels: 0, outlines: 0, ...o });

export const CHAPTERS = [
  { id: "cover", nav: "", legend: "cover",
    cam: { pos: at(87.6, 18.4, 540), look: at(89.6, 23.5, 0) }, orbit: 0.012, u: U(), layers: L({ rivers: 0.5 }) },

  { id: "cover-map", nav: "The ground", legend: "cover",
    cam: { pos: at(90.3, 19.3, 640), look: at(90.3, 23.9, 0) }, orbit: 0, u: U({ uExag: 10 }), layers: L({ rivers: 0.6 }) },

  { id: "low", nav: "How low", legend: "low",
    cam: { pos: at(87.5, 19.6, 330), look: at(90.4, 24.0, 0) }, orbit: 0, u: U({ uExag: 22, uLowBand: 10, uCoverMix: 0.35 }), layers: L({ rivers: 0.3 }) },

  { id: "hills", nav: "The rim", legend: "cover",
    cam: { pos: at(93.8, 20.9, 150), look: at(92.0, 23.0, 8) }, orbit: 0, u: U({ uExag: 22, uForest: 0.6 }), layers: L({ rivers: 0.3 }) },

  { id: "rivers", nav: "Rivers", legend: "rivers",
    cam: { pos: at(89.6, 21.0, 470), look: at(89.9, 24.5, 0) }, orbit: 0, u: U({ uRiverGlow: 1, uFar: 0.8, uCoverMix: 0.55 }), layers: L({ rivers: 1, riverLabels: 0.9, farRivers: 1 }) },

  { id: "silt", nav: "Silt", legend: "rivers",
    cam: { pos: at(90.6, 21.0, 160), look: at(90.6, 22.6, 0) }, orbit: 0, u: U({ uExag: 18, uRiverGlow: 0.9, uCoverMix: 0.6 }), layers: L({ rivers: 0.8 }) },

  { id: "sundarbans", nav: "Sundarbans", legend: "forest",
    cam: { pos: at(88.9, 21.0, 140), look: at(89.5, 22.15, 0) }, orbit: 0.004, u: U({ uExag: 10, uForest: 1, uRiverGlow: 0.7 }), layers: L({ rivers: 0.7, labels: 0.7 }) },

  { id: "haor", nav: "Haors", legend: "wet",
    cam: { pos: at(90.55, 23.8, 150), look: at(91.15, 24.8, 0) }, orbit: 0, u: U({ uExag: 12, uWet: 1, uForest: 0.4, uRiverGlow: 0.8 }), layers: L({ rivers: 0.9, riverLabels: 0.8, labels: 0.7, outlines: 1 }) },

  { id: "cht", nav: "Hill forests", legend: "loss",
    cam: { pos: at(93.3, 21.0, 150), look: at(92.25, 22.6, 6) }, orbit: 0.004, u: U({ uExag: 14, uForest: 0.6, uLoss: 1 }), layers: L({ rivers: 0.4, labels: 0.7 }) },

  { id: "sinking", nav: "Sinking", legend: "cover",
    cam: { pos: at(89.0, 21.3, 170), look: at(89.6, 22.9, 0) }, orbit: 0, u: U({ uExag: 18, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.6 }) },

  { id: "rise", nav: "Rising sea", legend: "rise", seaSlider: true,
    cam: { pos: at(88.6, 20.3, 300), look: at(90.2, 23.0, 0) }, orbit: 0, u: U({ uExag: 16, uSeaLevel: 2.0, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.5 }) },

  { id: "storms", nav: "Cyclones", legend: "storms", stormYears: [1960, 2025],
    cam: { pos: at(89.5, 17.6, 430), look: at(90.6, 22.4, 0) }, orbit: 0, u: U({ uCoverMix: 0.6, uFar: 0.5 }), layers: L({ storms: 1, rivers: 0.3 }) },

  { id: "shelters", nav: "Shelters", legend: "storms", stormYears: [1960, 2025], namedOnly: true,
    cam: { pos: at(89.8, 18.9, 330), look: at(90.6, 22.6, 0) }, orbit: 0, u: U({ uCoverMix: 0.6, uFar: 0.5 }), layers: L({ storms: 0.6, rivers: 0.3 }) },

  { id: "floods", nav: "Floods", legend: "low",
    cam: { pos: at(90.0, 20.7, 560), look: at(90.0, 24.3, 0) }, orbit: 0, u: U({ uLowBand: 8, uRiverGlow: 0.8, uCoverMix: 0.4 }), layers: L({ rivers: 0.9 }) },

  { id: "people", nav: "People", legend: "people",
    cam: { pos: at(88.4, 19.8, 380), look: at(90.3, 23.7, 0) }, orbit: 0.006, u: U({ uRiverGlow: 0.25, uFar: 0.25, uCoverMix: 0.6, uBuilt: 0.6 }), layers: L({ pop: 1, labels: 0.6, rivers: 0.3 }) },

  { id: "moving", nav: "Displaced", legend: "people",
    cam: { pos: at(90.7, 21.0, 220), look: at(90.0, 23.4, 0) }, orbit: 0, u: U({ uRiverGlow: 0.6, uFar: 0.25, uCoverMix: 0.6 }), layers: L({ pop: 1, labels: 0.8, rivers: 0.6, riverLabels: 0.6 }) },

  { id: "plan", nav: "The plan", legend: "cover",
    cam: { pos: at(88.0, 18.6, 540), look: at(90.3, 23.6, 0) }, orbit: 0.01, u: U({ uRiverGlow: 0.9 }), layers: L({ pop: 0.4, rivers: 0.7 }) },
];
