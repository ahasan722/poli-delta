// charts.js  --  v5: the two small charts that sit in the story panel. Direct labels, no legends.
import { BASE, sevHex } from "./palette.js?v=8";
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
// when a step opens, its chart draws in: bars grow from zero in order, the values follow
function play(id) {
  const el = document.getElementById(id === "silt" ? "chSilt" : id === "priority" ? "chTen" : ""); if (!el) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const svg = d3.select(el).select("svg");
  svg.selectAll("rect").each(function (_, i) { const r = d3.select(this); const w = +r.attr("data-w") || +r.attr("width"); r.attr("data-w", w).attr("width", 0).transition().delay(260 + i * 55).duration(700).ease(d3.easeCubicOut).attr("width", w); });
  svg.selectAll("text").filter(function () { return /\d/.test(this.textContent) && +d3.select(this).attr("x") > 100; })
    .attr("opacity", 0).transition().delay((_, i) => 600 + i * 55).duration(300).attr("opacity", 1);
}
export const charts = { init(D) { silt(); ten(D); addEventListener("resize", () => { silt(); ten(D); }); }, play };
