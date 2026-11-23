// charts.js  --  v5: the two small charts that sit in the story panel. Direct labels, no legends.
import { BASE, sevHex, REGION, REGION_ORDER, CROP_NAME } from "./palette.js?v=12";
const fmt = d3.format(","), f1 = d3.format(".1f");
const C = { ink: BASE.ink, text: BASE.text, dim: BASE.dim, line: BASE.line };
function svgIn(id, h) { const el = document.getElementById(id); el.innerHTML = ""; const w = el.clientWidth || 310; return { s: d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }

// sediment delivered by the Ganges + Brahmaputra, as published (Rahman et al. 2018)
const SILT = [{ k: "assumed in plans", v: 1000 }, { k: "1960s–2000s", v: 750 }, { k: "about 2015", v: 500 }, { k: "2030, projected", v: 320 }];
function silt() {
  const { s, w } = svgIn("chSilt", 136); const x = d3.scaleLinear().domain([0, 1000]).range([0, w - 156]);
  SILT.forEach((d, i) => { const y = i * 32;
    s.append("text").attr("x", 0).attr("y", y + 15).attr("fill", C.dim).attr("font-size", 12.5).text(d.k);
    s.append("rect").attr("x", 112).attr("y", y + 3).attr("height", 16).attr("width", x(d.v)).attr("rx", 2).attr("fill", i === 0 ? "none" : i === 3 ? "#525252" : "#a3a3a3").attr("stroke", i === 0 ? "#a3a3a3" : "none").attr("stroke-dasharray", i === 0 ? "3 2" : null);   // neutral greys: silt is context, not the finding
    s.append("text").attr("x", 112 + x(d.v) + 6).attr("y", y + 15).attr("fill", C.ink).attr("font-size", 12.5).attr("font-family", "IBM Plex Mono").text(fmt(d.v)); });
}
// the ten: one row each, bar = people under 5 m, the rank in front
function ten(D) {
  const rows = D.ten; const { s, w } = svgIn("chTen", rows.length * 21 + 6); const max = d3.max(rows, d => d.pop_le5);
  const x = d3.scaleLinear().domain([0, max]).range([0, w - 168]);
  rows.forEach((d, i) => { const y = i * 21;
    s.append("text").attr("x", 0).attr("y", y + 13).attr("fill", C.dim).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").text(i + 1);
    s.append("text").attr("x", 18).attr("y", y + 13).attr("fill", C.ink).attr("font-size", 13).attr("font-weight", 500).text(d.name);
    s.append("rect").attr("x", 112).attr("y", y + 4).attr("height", 11).attr("rx", 2).attr("width", x(d.pop_le5)).attr("fill", sevHex(d.severe));   // the bar carries the map's colour for the same district
    s.append("text").attr("x", 112 + x(d.pop_le5) + 5).attr("y", y + 13).attr("fill", C.ink).attr("font-size", 12).attr("font-family", "IBM Plex Mono").text(f1(d.pop_le5 / 1e6) + " M");
  });
  const share = d3.sum(rows, d => d.pop_le5) / D.le5Total; const el = document.getElementById("tenShare"); if (el) el.textContent = Math.round(share * 100) + "%";
}
// what the land grows: one 100% bar for the land and one per crop, split by landscape, the coast first
function grow(D) {
  const A = D.agri; if (!A) return; const rows = [["Land", A.area_by_region_ha], ...Object.keys(CROP_NAME).filter(c => A.crop_by_region[c]).map(c => [CROP_NAME[c], A.crop_by_region[c]])];
  const { s, w } = svgIn("chGrow", 40 + rows.length * 34); const x = d3.scaleLinear().domain([0, 1]).range([92, w - 2]);
  // a direct key above the bars
  let kx = 0; REGION_ORDER.forEach(k => { const g = s.append("g").attr("transform", `translate(${kx},0)`); g.append("rect").attr("width", 10).attr("height", 10).attr("y", 2).attr("rx", 2).attr("fill", REGION[k]);
    const t = g.append("text").attr("x", 14).attr("y", 11).attr("font-size", 11.5).attr("fill", C.dim).text(A.regions[k].replace("Barind and Madhupur ", "").replace("Haor and bil ", "").replace("River ", "")); kx += 22 + t.node().getComputedTextLength(); });
  rows.forEach(([label, v], i) => { const y = 30 + i * 34; const tot = d3.sum(REGION_ORDER, k => v[k] || 0); let acc = 0;
    s.append("text").attr("x", 0).attr("y", y + 15).attr("fill", C.ink).attr("font-size", 13).attr("font-weight", i === 0 ? 600 : 500).text(label);
    REGION_ORDER.forEach((k, j) => { const sh = (v[k] || 0) / tot;
      s.append("rect").attr("class", "gb").attr("x", x(acc)).attr("y", y + 3).attr("height", 18).attr("width", Math.max(0, x(acc + sh) - x(acc) - 1)).attr("data-w", Math.max(0, x(acc + sh) - x(acc) - 1)).attr("fill", REGION[k]);
      if (j === 0) s.append("text").attr("x", x(acc) + 5).attr("y", y + 16).attr("fill", "#fff").attr("font-size", 11.5).attr("font-weight", 600).attr("font-family", "IBM Plex Mono").text(Math.round(sh * 100) + "%");
      acc += sh; }); });
  const L = A.area_by_region_ha, tl = d3.sum(Object.values(L)), aus = A.crop_by_region.aus, ta = d3.sum(Object.values(aus));
  const e1 = document.getElementById("growLand"), e2 = document.getElementById("growAus");
  if (e1) e1.textContent = Math.round(L.coast / tl * 100) + "%"; if (e2) e2.textContent = Math.round(aus.coast / ta * 100) + "%";
}
// when a step opens, its chart draws in: bars grow from zero in order, the values follow
function play(id) {
  const el = document.getElementById(id === "silt" ? "chSilt" : id === "priority" ? "chTen" : id === "grow" ? "chGrow" : ""); if (!el) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const svg = d3.select(el).select("svg");
  svg.selectAll("rect").each(function (_, i) { const r = d3.select(this); const w = +r.attr("data-w") || +r.attr("width"); r.attr("data-w", w).attr("width", 0).transition().delay(260 + i * 55).duration(700).ease(d3.easeCubicOut).attr("width", w); });
  svg.selectAll("text").filter(function () { return /\d/.test(this.textContent) && +d3.select(this).attr("x") > 100; })
    .attr("opacity", 0).transition().delay((_, i) => 600 + i * 55).duration(300).attr("opacity", 1);
}
export const charts = { init(D) { silt(); ten(D); grow(D); addEventListener("resize", () => { silt(); ten(D); grow(D); }); }, play };
