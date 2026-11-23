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
export const DEPTH = { shelf: "#deebf7", mid: "#9ecae1", deep: "#2171b5" };   // ColorBrewer Blues, the Bay by depth
export const RIVER = { quiet: "#9ebcd4", strong: "#2171b5" };

// crop production (Explore, the district sheet): ColorBrewer YlGn, five of its nine steps, spaced for colour-blind readers
export const CROP = ["#d9f0a3", "#78c679", "#41ab5d", "#238443", "#005a32"];   // YlGn 9-class steps 3, 5, 6, 7, 8
export const CROP_NAME = { aman: "Aman rice", boro: "Boro rice", aus: "Aus rice", wheat: "Wheat", potato: "Potato", jute: "Jute", maize: "Maize", onion: "Onion", garlic: "Garlic", fish_total: "Inland fish", fish_culture: "Farmed fish", fish_capture: "Fish caught inland", fish_shrimp: "Shrimp and prawn farms", fish_bagda: "Bagda (tiger shrimp) farms", fish_galda: "Galda (giant prawn) farms" };

// landscapes (the 30 agro-ecological zones in five groups): Tableau 10, chosen for meaning (water blue for the coast,
// grain yellow for the floodplains, violet for the haor basins, earth brown for the terraces, forest green for the hills)
export const REGION = { coast: "#4e79a7", floodplains: "#edc948", basins: "#b07aa1", terraces: "#9c755f", hills: "#59a14f" };
export const REGION_ORDER = ["coast", "floodplains", "basins", "terraces", "hills"];

// the atlas sections
export const FISH = { sanct: "#CC79A7", halda: "#E69F00", ground: "#0072B2", run: "#1f2937" };   // Okabe-Ito reddish purple, orange, blue
export const GAUGE = ["#c6dbef", "#6baed6", "#2171b5", "#08306b"];                                 // ColorBrewer Blues: record peak above danger level
export const ERODE = { Jamuna: "#a63603", Padma: "#e6550d", Ganges: "#fd8d3c", coast: "#a63603" };  // ColorBrewer Oranges by land lost
export const JUNCTION = "#111827";
export const SEASON = { pre: "#E69F00", post: "#0072B2", other: "#8b93a0" };                         // Okabe-Ito: before and after the monsoon

// v11: wetlands, waterbirds, fish by district
export const WET = { fill: "#9ecae1", haor: "#02818a", edge: "#016450", text: "#014636", beel: "#D55E00" };   // ColorBrewer Blues / PuBuGn; Okabe-Ito vermillion for beels
export const BIRD = { site: "#E69F00", edge: "#a66f00", text: "#6b4700", flow: "#374151" };                    // Okabe-Ito orange
export const FISHR = ["#d0d1e6", "#74a9cf", "#3690c0", "#0570b0", "#034e7b"];                                  // ColorBrewer PuBu 9-class steps 3, 5, 6, 7, 8

// v12: the Sundarbans, tea, and the crops of the year (ColorBrewer PRGn / PiYG greens; Dark2 for the six crops)
export const MANGROVE = { fill: "#1b7837", edge: "#00441b", text: "#00441b" };
export const TEA = { fill: "#4d9221", edge: "#276419", text: "#276419" };
export const SEASONCOL = { aman: "#1b9e77", boro: "#d95f02", aus: "#7570b3", jute: "#e7298a", wheat: "#e6ab02", potato: "#a6761d" };

// v13: roads (ColorBrewer YlOrBr), rail in ink-grey, bridges in ink
export const ROAD = { major: "#cc4c02", minor: "#fe9929", bridge: "#111827" };
export const RAIL = { line: "#374151", train: "#fbbf24" };

// v14: rainfall, ColorBrewer Blues by month (mm)
export const RAIN = ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"];

// one categorical accent: the place where silt was let back in (Okabe-Ito bluish green)
export const ACCENT = "#009E73";
// selection is drawn in ink, not a hue, so it never reads as data
export const SELECT = BASE.ink;

export const hex = s => parseInt(s.slice(1), 16);
export const rgb01 = s => { const n = hex(s); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
