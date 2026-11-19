// palette.js  --  v6: every colour on the map comes from here, so 2D, 3D, the key, the charts and the sheet agree.
// Base map: neutral greys, so the data layer is the only saturated thing on screen.
// Data: ColorBrewer sequential ramps (Brewer & Harrower, colorbrewer2.org); one categorical accent from Okabe & Ito.
// pipeline/colours.py reads the hex values below, simulates colour-blind vision and checks the gaps.
export const BASE = {
  page: "#ffffff",
  map: "#f1f3f5",      // canvas behind the relief
  land: "#e9ecef",
  water: "#dbe4ea",
  outline: "#9aa5b1",
  ink: "#111827",
  text: "#374151",
  dim: "#6b7280",
  faint: "#8b93a0",     // non-text only (rules, inactive dots): WCAG 1.4.11 asks 3:1
  line: "#e5e7eb",
  out: "#d5d9de"       // districts outside the rule
};

// hurricane-force passes since 1960 (the rule's colour): ColorBrewer YlOrRd, 4 classes
export const SEV = { 3: "#fecc5c", 4: "#fd8d3c", 5: "#f03b20", 6: "#bd0026" };
export const sevHex = n => n >= 6 ? SEV[6] : n >= 5 ? SEV[5] : n >= 4 ? SEV[4] : n >= 3 ? SEV[3] : BASE.out;

// cyclone wind along a track, and the wind streaks: ColorBrewer YlOrRd, 3 darker classes so they hold on a light map
export const WIND = { gale: "#fd8d3c", hurricane: "#e31a1c", major: "#800026", calm: "#8a96a3" };
export const windHex = kt => kt >= 96 ? WIND.major : kt >= 64 ? WIND.hurricane : kt >= 34 ? WIND.gale : WIND.calm;

// water and height: ColorBrewer Blues for the sea taking the land, YlGnBu for ground under the cutoff
export const FLOOD = { shallow: "#6baed6", deep: "#08519c" };
export const LOW = { high: "#c7e9b4", low: "#225ea8" };            // 5 m -> 0 m
export const RIVER = { quiet: "#9ebcd4", strong: "#2171b5" };

// one categorical accent: the place where silt was let back in (Okabe-Ito bluish green)
export const ACCENT = "#009E73";
// selection is drawn in ink, not a hue, so it never reads as data
export const SELECT = BASE.ink;

export const hex = s => parseInt(s.slice(1), 16);
export const rgb01 = s => { const n = hex(s); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
