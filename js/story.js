// story.js  --  v13: the steps of the story.
// Each step frames a box of ground (view), sets the relief's uniforms (u) and layer opacities (layers),
// and may own a timeline (time): a value that plays from `from` to `to` and can be scrubbed.
//   view: { box: [W, S, E, N], pitch: degrees from straight down (0 = flat map), az: bearing of the camera
//           from the box centre (180 = from the south, north up), top: km of relief to keep in frame }
// In 2D every view is seen straight down with north up; pitch and az only apply in 3D.
const U = (o = {}) => ({ uExag: 14, uSeaLevel: 0, uRiverGlow: 0.35, uFar: 0.55, uLowBand: 0, uSink: 0, uCoverMix: 0, uForest: 0, uWet: 0, uBuilt: 0, uLoss: 0, uCutOn: 0, uBathy: 0, ...o });
const L = (o = {}) => ({ rivers: 0.35, riverLabels: 0, farRivers: 0.5, labels: 0.9, storms: 0, wind: 0, prisms: 0, ranks: 0, site: 0, borders: 0, grow: 0, year: 2025, flow: 0.25, junctions: 0, sanct: 0, grounds: 0, halda: 0, fishrun: 0, gauges: 0, erosion: 0, coastpts: 0, wetfill: 0, haors: 0, beels: 0, birds: 0, birdflow: 0, mangrove: 0, tea: 0, month: 0, transport: 0, ...o });
const V = (box, pitch, az, top = 10) => ({ box, pitch, az, top });

const WHOLE = [88.05, 20.75, 92.65, 26.6];
const COAST = [88.6, 21.5, 92.4, 23.4];

export const SITE = { name: "Beel Bhaina", lon: 89.23, lat: 22.95 };      // tidal river management, Keshabpur, Jashore

export const CHAPTERS = [
  { id: "cover", nav: "The question", view: V(WHOLE, 38, 196, 12), u: U(), layers: L({ borders: 0.5 }) },
  { id: "bay", nav: "The Bay", view: V([86.6, 19.9, 93.4, 26.95], 30, 184, 8), u: U({ uBathy: 1, uFar: 1, uRiverGlow: 0.6 }), layers: L({ rivers: 1, farRivers: 1, riverLabels: 1, labels: 0.6, flow: 1 }) },
  { id: "low", nav: "Low ground", view: V([88.4, 20.9, 92.4, 25.2], 44, 192, 8), u: U({ uExag: 18 }), layers: L({ rivers: 0.2 }),
    time: { key: "uLowBand", label: "Ground under", from: 0.5, to: 5, dur: 5, ticks: [1, 2, 3, 4, 5], fmt: v => v.toFixed(1) + " m", tick: v => v + " m" } },
  { id: "silt", nav: "Less silt", view: V(WHOLE, 28, 186, 8), u: U({ uRiverGlow: 1, uFar: 0.75 }), layers: L({ rivers: 1, riverLabels: 0.9, farRivers: 1, flow: 0.8 }) },
  { id: "sink", nav: "Sinking", view: V([88.7, 21.6, 90.4, 23.1], 56, 200, 6), u: U({ uExag: 22, uSeaLevel: 0.001, uRiverGlow: 0 }), layers: L({ rivers: 0.2 }),
    time: { key: "uSink", label: "Ground lost", from: 0, to: 1.5, dur: 5, ticks: [0, 0.5, 1, 1.5], fmt: v => "−" + v.toFixed(2) + " m", tick: v => v + " m" } },
  { id: "sea", nav: "Rising sea", view: V(COAST, 46, 194, 6), u: U({ uExag: 18, uRiverGlow: 0 }), layers: L({ rivers: 0.2 }),
    time: { key: "uSeaLevel", label: "Sea level rise", from: 0.001, to: 1.4, dur: 6, ticks: [0, 0.5, 1, 1.4], fmt: v => "+" + v.toFixed(2) + " m", tick: v => v + " m" } },
  { id: "storms", nav: "Cyclones", view: V([87.4, 17.6, 93.0, 25.4], 34, 186, 10), u: U({ uFar: 0.5 }), layers: L({ storms: 1, wind: 0.9, rivers: 0.25, labels: 0.55, year: 1960 }),
    time: { key: "year", label: "Year", from: 1960, to: 2025, dur: 12, ticks: [1960, 1980, 2000, 2020], fmt: v => String(Math.floor(v)), tick: v => v } },
  { id: "priority", nav: "The ten", view: V([88.6, 20.9, 92.4, 23.9], 34, 192, 50), u: U({ uFar: 0.3, uRiverGlow: 0.2 }), layers: L({ prisms: 1, ranks: 1, rivers: 0.15, labels: 0, borders: 1, grow: 1 }) },
  { id: "grow", nav: "What it grows", theme: "landscape", view: V([88.0, 20.6, 92.7, 26.7], 36, 192, 40), u: U({ uFar: 0.3, uRiverGlow: 0.2 }), layers: L({ prisms: 1, ranks: 0, rivers: 0.15, labels: 0, borders: 1, grow: 1 }) },
  { id: "raise", nav: "What works", view: V([88.55, 22.25, 90.0, 23.5], 40, 200, 16), u: U({ uExag: 20, uRiverGlow: 0.15 }), layers: L({ rivers: 0.3, site: 1, labels: 0.6 }) },
  { id: "explore", nav: "Your turn", view: V([88.3, 20.7, 92.6, 25.6], 38, 194, 50), u: U({ uFar: 0.3, uRiverGlow: 0.3 }), layers: L({ prisms: 1, ranks: 1, rivers: 0.25, labels: 0, borders: 1, grow: 1 }), explore: true },
  // ---- the atlas: sections outside the story, reached from the top bar -------------------------------------
  { id: "rivers", section: "rivers", nav: "Rivers", view: V([88.2, 21.4, 92.6, 26.5], 30, 186, 8), u: U({ uRiverGlow: 1, uFar: 0.9, uBathy: 0.5 }), layers: L({ rivers: 1, farRivers: 1, riverLabels: 1, labels: 0.35, flow: 1, junctions: 1 }) },
  { id: "transport", section: "rivers", nav: "Roads, rail and bridges", view: V([88.1, 21.3, 92.6, 26.5], 32, 188, 10), u: U({ uRiverGlow: 0.5, uFar: 0.5 }), layers: L({ rivers: 0.6, farRivers: 0.4, riverLabels: 0.3, labels: 0.5, flow: 0.4, transport: 1, borders: 0.4 }) },
  { id: "haors", section: "wetlands", nav: "Haors", view: V([90.35, 23.75, 92.45, 25.3], 36, 190, 8), u: U({ uRiverGlow: 0.5, uFar: 0.5 }), layers: L({ rivers: 0.45, riverLabels: 0.4, labels: 0.4, flow: 0.4, wetfill: 1, haors: 1 }) },
  { id: "beels", section: "wetlands", nav: "Beels", view: V([88.4, 21.9, 92.2, 25.0], 34, 190, 8), u: U({ uRiverGlow: 0.5, uFar: 0.5 }), layers: L({ rivers: 0.45, riverLabels: 0.4, labels: 0.45, flow: 0.4, wetfill: 1, haors: 0.5, beels: 1 }) },
  { id: "birds", section: "wetlands", nav: "Waterbirds", view: V([86.9, 20.9, 94.4, 28.4], 34, 186, 40), u: U({ uFar: 0.8, uBathy: 0.6, uRiverGlow: 0.4 }), layers: L({ rivers: 0.35, farRivers: 0.6, labels: 0.3, flow: 0.3, wetfill: 0.8, haors: 0.3, birds: 1, birdflow: 1 }) },
  { id: "fish", section: "fish", nav: "Fish", view: V([88.9, 20.7, 92.1, 23.5], 32, 188, 8), u: U({ uBathy: 1, uRiverGlow: 0.5, uFar: 0.7 }), layers: L({ rivers: 0.6, riverLabels: 0.5, labels: 0.4, flow: 0.8, sanct: 1, grounds: 1, halda: 1, fishrun: 1 }) },
  { id: "fishmap", section: "fish", nav: "Fish by district", theme: "crop", crop: "fish_total", view: V([88.0, 20.6, 92.7, 26.7], 36, 192, 40), u: U({ uFar: 0.3, uRiverGlow: 0.2 }), layers: L({ prisms: 1, ranks: 1, rivers: 0.15, labels: 0, borders: 1, grow: 1 }) },
  { id: "crops", section: "crops", nav: "Crops", theme: "landscape", view: V([88.0, 20.6, 92.7, 26.7], 36, 192, 40), u: U({ uFar: 0.3, uRiverGlow: 0.2 }), layers: L({ prisms: 1, ranks: 1, rivers: 0.15, labels: 0, borders: 1, grow: 1 }) },
  { id: "seasons", section: "crops", nav: "Crop seasons", theme: "season", view: V([88.0, 20.6, 92.7, 26.7], 36, 192, 40), u: U({ uFar: 0.3, uRiverGlow: 0.2 }), layers: L({ prisms: 1, ranks: 1, rivers: 0.15, labels: 0, borders: 1, grow: 1 }),
    time: { key: "month", label: "Month", from: 0, to: 11.999, dur: 14, ticks: [0, 2, 4, 6, 8, 10], fmt: v => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Math.min(11, Math.floor(v))], tick: v => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][v] } },
  { id: "tea", section: "crops", nav: "Tea", view: V([88.2, 21.6, 92.6, 26.6], 38, 192, 12), u: U({ uExag: 18, uFar: 0.4, uRiverGlow: 0.2 }), layers: L({ rivers: 0.25, labels: 0.45, borders: 0.6, tea: 1 }) },
  { id: "sundarbans", section: "sundarbans", nav: "Sundarbans", view: V([88.45, 21.2, 90.4, 22.95], 40, 192, 8), u: U({ uExag: 18, uRiverGlow: 0.6, uFar: 0.6, uBathy: 0.6 }), layers: L({ rivers: 0.7, riverLabels: 0.5, labels: 0.4, flow: 0.7, mangrove: 1, storms: 1, year: 2025 }) },
  { id: "cyclones", section: "cyclones", nav: "Cyclone tracker", view: V([86.6, 15.8, 94.0, 26.2], 30, 184, 10), u: U({ uFar: 0.5, uBathy: 0.7 }), layers: L({ storms: 1, wind: 0.6, rivers: 0.2, labels: 0.5 }) },
  { id: "floods", section: "hazards", nav: "Floods", view: V([88.1, 21.4, 92.7, 26.6], 40, 190, 30), u: U({ uRiverGlow: 0.7, uFar: 0.5 }), layers: L({ rivers: 0.8, flow: 0.6, riverLabels: 0.4, labels: 0.3, gauges: 1 }) },
  { id: "erosion", section: "hazards", nav: "Erosion", view: V([88.4, 21.3, 92.0, 25.9], 34, 190, 8), u: U({ uRiverGlow: 0.4, uFar: 0.5 }), layers: L({ rivers: 0.5, riverLabels: 0.6, labels: 0.4, erosion: 1, coastpts: 1 }) },
];
