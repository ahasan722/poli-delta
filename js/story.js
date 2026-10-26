// story.js  --  the chapters, keyed by the data-id of their section in index.html.
// Each one says where the camera goes, which uniforms the relief takes, and which layers show.
// Camera positions are in scene kilometres (x east, z south, y up), see terrain.js.
// Uniforms: uExag relief, uSeaLevel drown, uRiverGlow, uFar far field, uLowBand tint below (m),
// uCoverMix land cover vs silt, uForest / uWet / uBuilt highlights, uLoss Hansen forest loss.
import { toScene } from "./terrain.js";

const at = (lon, lat, y) => { const p = toScene(lon, lat); p.y = y; return p; };
const U = (o = {}) => ({ uExag: 14, uSeaLevel: 0, uRiverGlow: 0.4, uFar: 0.6, uLowBand: 0, uSink: 0, uCoverMix: 1, uForest: 0, uWet: 0, uBuilt: 0, uLoss: 0, ...o });
const L = (o = {}) => ({ storms: 0, wind: 0, pop: 0, labels: 0.9, farRivers: 0.6, rivers: 0, riverLabels: 0, outlines: 0, rain: 0, warm: 0, tide: 0, ...o });

// the whole-country view, used by several chapters; the look point sits a little west so the
// country clears the chapter rail on the left
const WHOLE = { pos: at(87.2, 18.2, 560), look: at(89.9, 23.6, 0) };

export const CHAPTERS = {
  cover:      { nav: "Poli", legend: "cover", cam: { pos: at(86.9, 18.2, 560), look: at(89.6, 23.5, 0) }, orbit: 0.012, u: U(), layers: L({ rivers: 0.5 }) },
  ground:     { nav: "The ground", legend: "cover", cam: { pos: at(90.0, 19.0, 660), look: at(90.0, 23.9, 0) }, orbit: 0, u: U({ uExag: 10 }), layers: L({ rivers: 0.6 }) },
  low:        { nav: "How low", legend: "low", cam: { pos: at(87.2, 19.5, 340), look: at(90.1, 24.0, 0) }, orbit: 0, u: U({ uExag: 22, uLowBand: 10, uCoverMix: 0.35 }), layers: L({ rivers: 0.3 }) },
  rim:        { nav: "The rim", legend: "cover", cam: { pos: at(93.9, 20.8, 150), look: at(92.0, 23.0, 8) }, orbit: 0, u: U({ uExag: 22, uForest: 0.6 }), layers: L({ rivers: 0.3 }) },
  rivers:     { nav: "Rivers", legend: "rivers", cam: { pos: at(89.4, 20.9, 480), look: at(89.8, 24.4, 0) }, orbit: 0, u: U({ uRiverGlow: 1, uFar: 0.8, uCoverMix: 0.55 }), layers: L({ rivers: 1, riverLabels: 0.9, farRivers: 1 }) },
  silt:       { nav: "Silt", legend: "rivers", cam: { pos: at(90.4, 21.0, 160), look: at(90.5, 22.6, 0) }, orbit: 0, u: U({ uExag: 18, uRiverGlow: 0.9, uCoverMix: 0.6 }), layers: L({ rivers: 0.8 }) },
  sundarbans: { nav: "Sundarbans", legend: "forest", cam: { pos: at(88.7, 21.0, 140), look: at(89.4, 22.15, 0) }, orbit: 0.004, u: U({ uExag: 10, uForest: 1, uRiverGlow: 0.7 }), layers: L({ rivers: 0.7, labels: 0.7 }) },
  haor:       { nav: "Haors", legend: "wet", cam: { pos: at(90.4, 23.8, 150), look: at(91.1, 24.8, 0) }, orbit: 0, u: U({ uExag: 12, uWet: 1, uForest: 0.4, uRiverGlow: 0.8 }), layers: L({ rivers: 0.9, riverLabels: 0.8, labels: 0.7, outlines: 1 }) },
  cht:        { nav: "Hill forests", legend: "loss", cam: { pos: at(93.4, 21.0, 150), look: at(92.2, 22.6, 6) }, orbit: 0.004, u: U({ uExag: 14, uForest: 0.6, uLoss: 1 }), layers: L({ rivers: 0.4, labels: 0.7 }) },
  sinking:    { nav: "Sinking", legend: "cover", cam: { pos: at(88.8, 21.3, 170), look: at(89.5, 22.9, 0) }, orbit: 0, u: U({ uExag: 18, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.6 }) },
  rise:       { nav: "Rising sea", legend: "rise", seaSlider: true, cam: { pos: at(88.3, 20.3, 300), look: at(90.0, 23.0, 0) }, orbit: 0, u: U({ uExag: 16, uSeaLevel: 2.0, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.5 }) },
  warming:    { nav: "Warming", legend: "stations", cam: WHOLE, orbit: 0.006, u: U({ uCoverMix: 0.45, uFar: 0.35 }), layers: L({ rivers: 0.3, warm: 1 }) },
  monsoon:    { nav: "Monsoon", legend: "rain", cam: { pos: at(87.0, 18.6, 520), look: at(89.9, 23.6, 0) }, orbit: 0.006, u: U({ uCoverMix: 0.45, uFar: 0.35 }), layers: L({ rivers: 0.3, rain: 1 }) },
  sealevel:   { nav: "Sea level", legend: "tide", cam: { pos: at(88.6, 18.6, 330), look: at(90.2, 22.4, 0) }, orbit: 0, u: U({ uExag: 16, uCoverMix: 0.5, uFar: 0.3 }), layers: L({ rivers: 0.5, tide: 1 }) },
  storms:     { nav: "Cyclones", legend: "storms", stormYears: [1960, 2025], cam: { pos: at(89.2, 16.6, 470), look: at(90.4, 22.0, 0) }, orbit: 0, u: U({ uCoverMix: 0.55, uFar: 0.5 }), layers: L({ storms: 1, wind: 1, rivers: 0.3 }) },
  shelters:   { nav: "Shelters", legend: "storms", stormYears: [1960, 2025], namedOnly: true, cam: { pos: at(89.3, 17.6, 440), look: at(90.3, 22.3, 0) }, orbit: 0, u: U({ uCoverMix: 0.6, uFar: 0.5 }), layers: L({ storms: 0.45, rivers: 0.3 }) },
  floods:     { nav: "Floods", legend: "low", cam: { pos: at(89.7, 20.5, 580), look: at(89.8, 24.3, 0) }, orbit: 0, u: U({ uLowBand: 8, uRiverGlow: 0.8, uCoverMix: 0.4 }), layers: L({ rivers: 0.9 }) },
  people:     { nav: "People", legend: "people", cam: { pos: at(88.1, 19.7, 390), look: at(90.0, 23.7, 0) }, orbit: 0.006, u: U({ uRiverGlow: 0.25, uFar: 0.25, uCoverMix: 0.6, uBuilt: 0.6 }), layers: L({ pop: 1, labels: 0.6, rivers: 0.3 }) },
  moving:     { nav: "Displaced", legend: "people", cam: { pos: at(90.5, 21.0, 220), look: at(89.8, 23.4, 0) }, orbit: 0, u: U({ uRiverGlow: 0.6, uFar: 0.25, uCoverMix: 0.6 }), layers: L({ pop: 1, labels: 0.8, rivers: 0.6, riverLabels: 0.6 }) },
  plan:       { nav: "The plan", legend: "cover", cam: { pos: at(86.9, 18.4, 560), look: at(89.6, 23.5, 0) }, orbit: 0.01, u: U({ uRiverGlow: 0.9 }), layers: L({ pop: 0.4, rivers: 0.7 }) },
};
export const at_ = at;
