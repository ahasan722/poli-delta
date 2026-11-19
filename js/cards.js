// cards.js  --  v5: the sheet that docks on the right when you pick a district or a storm.
// A district sheet opens with its verdict under the story's rule (in the first ten or not, and why),
// then one big number and a short table where every value carries its rank among the 64 districts.
import { BASE, windHex, sevHex, WIND } from "./palette.js?v=7";
const fmt = d3.format(","), f1 = d3.format(".1f");
const C = { ink: BASE.ink, dim: BASE.dim, faint: BASE.faint, line: BASE.line };
// land cover in the sheet: muted ESA WorldCover hues, a categorical chart separate from the map
const COVER_COL = { cropland: "#c9b56b", "tree cover": "#4d7f57", mangroves: "#2f6b5a", wetland: "#6aa39b", "built-up": "#b98a6a", water: "#6f9cc2", other: "#d5d9de" };
const windCol = windHex;
const cat = kt => kt >= 120 ? "super cyclonic storm" : kt >= 90 ? "extremely severe cyclonic storm" : kt >= 64 ? "very severe cyclonic storm" : kt >= 48 ? "severe cyclonic storm" : kt >= 34 ? "cyclonic storm" : "depression";
const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th");
let el, api, D, marker = null, tickOut = null;

function svg(parent, h) { const w = parent.clientWidth || 340; return { s: d3.select(parent).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
function coverBar(parent, cover) {
  const { s, w } = svg(parent, 40); const order = ["cropland", "tree cover", "water", "mangroves", "wetland", "built-up", "other"]; const x = d3.scaleLinear().domain([0, 100]).range([0, w]); let acc = 0;
  order.forEach(k => { const v = cover[k] || 0; if (v < 0.05) return;
    s.append("rect").attr("x", x(acc)).attr("y", 0).attr("width", Math.max(0, x(acc + v) - x(acc) - 1)).attr("height", 18).attr("fill", COVER_COL[k]);
    if (v > 9) s.append("text").attr("x", x(acc + v / 2)).attr("y", 13).attr("text-anchor", "middle").attr("fill", k === "other" ? C.ink : "#fff").attr("font-size", 11.5).attr("font-weight", 600).text(Math.round(v) + "%");
    if (v > 13) s.append("text").attr("x", x(acc + v / 2)).attr("y", 34).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 11.5).text(k === "other" ? "other" : k);
    acc += v; });
}
function stormStrip(parent, hits) {
  const { s, w } = svg(parent, 74); const x = d3.scaleLinear().domain([1960, 2026]).range([6, w - 6]); const y = d3.scaleLinear().domain([20, 140]).range([50, 8]); const r = d3.scaleSqrt().domain([20, 140]).range([2, 8]);
  s.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(64)).attr("y2", y(64)).attr("stroke", C.line).attr("stroke-dasharray", "3 3");
  s.append("text").attr("x", w).attr("y", y(64) - 4).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 11).text("hurricane force, 64 kt");
  [1960, 1980, 2000, 2020].forEach(v => s.append("text").attr("x", x(v)).attr("y", 68).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 11).attr("font-family", "IBM Plex Mono").text(v));
  hits.forEach(([yr, kt, name]) => s.append("circle").attr("cx", x(yr)).attr("cy", y(Math.min(140, kt))).attr("r", r(kt)).attr("fill", windCol(kt)).attr("fill-opacity", .85).append("title").text(`${name || "unnamed"} ${yr}, ${kt} kt`));
}
function windChart(parent, storm) {
  const pts = storm.pts; const n = pts.length; const { s, w } = svg(parent, 116);
  const x = d3.scaleLinear().domain([0, n - 1]).range([28, w - 6]); const y = d3.scaleLinear().domain([0, Math.max(100, d3.max(pts, p => p[2]) + 10)]).range([90, 8]);
  [34, 64, 96].forEach(v => { s.append("line").attr("x1", 28).attr("x2", w - 6).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 24).attr("y", y(v) + 4).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 11).attr("font-family", "IBM Plex Mono").text(v); });
  s.append("path").attr("d", d3.area().x((p, i) => x(i)).y0(90).y1(p => y(p[2])).curve(d3.curveMonotoneX)(pts)).attr("fill", WIND.gale).attr("opacity", .18);
  s.append("path").attr("d", d3.line().x((p, i) => x(i)).y(p => y(p[2])).curve(d3.curveMonotoneX)(pts)).attr("fill", "none").attr("stroke", WIND.hurricane).attr("stroke-width", 1.8);
  const days = Math.floor((n - 1) / 4); d3.range(0, days + 1, Math.max(1, Math.ceil(days / 6))).forEach(dd => s.append("text").attr("x", x(dd * 4)).attr("y", 106).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 11).attr("font-family", "IBM Plex Mono").text("day " + dd));
  marker = { dot: s.append("circle").attr("r", 5).attr("fill", C.ink).attr("stroke", "#fff").attr("stroke-width", 2).attr("cx", x(0)).attr("cy", y(pts[0][2])), x, y, pts };
}
function head(eyebrow, dot, title, sub) {
  return `<div class="fhead"><button class="back" type="button" aria-label="Close" title="Close  [Esc]">×</button><div><div class="eyebrow"><i style="background:${dot}"></i>${eyebrow}</div><h3>${title}<small>${sub}</small></h3></div></div>`;
}

export const cards = {
  init(data, hooks) { D = data; api = hooks; el = document.getElementById("focus"); },
  hide() { if (!el) return; el.classList.remove("on"); el.innerHTML = ""; marker = null; tickOut = null; },
  showDistrict(d) {
    const all = D.districts; const rank = k => 1 + all.filter(o => o[k] > d[k]).length;
    const i10 = D.ten.findIndex(t => t.id === d.id);
    const verdict = i10 >= 0
      ? `<div class="verdict in"><b>${ord(i10 + 1)} of the first ten.</b> ${d.severe} hurricane-force passes since 1960 and ${f1(d.pop_le5 / 1e6)} M people under 5 m.</div>`
      : d.severe < 3
        ? `<div class="verdict"><b>Not in the first ten:</b> ${d.severe === 0 ? "no hurricane-force cyclone" : d.severe === 1 ? "one hurricane-force pass" : "two hurricane-force passes"} within 50 km since 1960 (the rule asks for 3).</div>`
        : `<div class="verdict"><b>Not in the first ten:</b> on the cyclone coast, but fewer people under 5 m than the ten.</div>`;
    const row = (l, v, r) => `<tr><td>${l}${r ? `<small>${ord(r)} of 64</small>` : ""}</td><td>${v}</td></tr>`;
    el.innerHTML = head(`District · ${d.division}`, sevHex(d.severe), d.name, `${fmt(d.area_km2)} km²${d.rivers.length ? " · on the " + d.rivers.slice(0, 2).join(" and ") : ""}`) + `
      <div class="fbody">
        ${verdict}
        <div class="hero"><b>${f1(d.pop_le5 / 1e6)} M</b><span>people living under 5 m · ${ord(rank("pop_le5"))} of 64</span></div>
        <table>
          ${row("Hurricane-force passes since 1960", d.severe, rank("severe"))}
          ${row("Cyclones of any strength", d.storms.n)}
          ${row("Land under 5 m", d.share_le5 + "%", rank("share_le5"))}
          ${row("People under 2 m", f1(d.pop_le2 / 1e6) + " M", rank("pop_le2"))}
          ${row("Population, census 2022", f1(d.pop_census2022 / 1e6) + " M")}
          ${row("Highest ground", fmt(d.h_max) + " m")}
        </table>
        <div class="sub">Cyclones within 50 km, by wind</div><div class="fig" id="fStorms"></div>
        <div class="sub">What covers it</div><div class="fig" id="fCover"></div>
        <p class="src">0.7 km grid: SRTM 90 m (a surface model, so the low shares are floors), GPW v4 2015, ESA WorldCover 2021, IBTrACS v04r01. Boundaries and census: BBS 2022.</p>
      </div>`;
    stormStrip(el.querySelector("#fStorms"), d.storms.hits); coverBar(el.querySelector("#fCover"), d.cover);
    el.querySelector(".back").addEventListener("click", () => api.clear()); el.classList.add("on"); el.scrollTop = 0;
  },
  showStorm(s) {
    const n = s.note || {}; const peak = s.peak_kt; const name = n.label || (s.name && s.name !== "NOT_NAMED" ? s.name : "Unnamed storm");
    const key = name.toLowerCase().split(" ")[0]; const im = D.impact.find(r => r.year === s.season && r.name.toLowerCase().includes(key)) || {};
    const near = D.districts.filter(d => d.storms.hits.some(h => h[3] === s.sid && h[1] >= 64)).map(d => d.name);
    const deaths = im.deaths != null ? fmt(im.deaths) : (n.deaths ? String(n.deaths).split(" ")[0] : "–");
    const affected = im.affected != null ? (im.affected >= 1e6 ? f1(im.affected / 1e6) + " M" : fmt(im.affected)) : "–";
    const dmg = im.damage_adj_musd != null ? (im.damage_adj_musd >= 1000 ? "$" + f1(im.damage_adj_musd / 1000) + " bn" : "$" + fmt(im.damage_adj_musd) + " M") : "–";
    const surge = im.surge_m ?? n.surge_m; const landfall = im.landfall || n.landfall;
    const row = (l, v) => `<tr><td>${l}</td><td>${v}</td></tr>`;
    el.innerHTML = head(`Cyclone · ${s.season}`, windHex(peak), name, `${cat(peak)} · peak ${peak} kt (${Math.round(peak * 1.852)} km/h)`) + `
      <div class="fbody">
        <div class="hero"><b>${deaths}</b><span>${im.deaths != null ? "deaths, EM-DAT" : "deaths, official toll"}</span></div>
        <table>${row("People affected", affected)}${row("Damage, 2024 US$", dmg)}${row("Storm surge", surge ? surge + " m" : "–")}${n.shelters ? row("Cyclone shelters at the time", fmt(n.shelters)) : ""}${landfall ? row("Landfall", `<span style="font-family:var(--sans)">${landfall}</span>`) : ""}</table>
        <div class="sub">Wind along the track <span id="fTick" style="color:#111827;font-family:var(--mono);margin-left:6px;text-transform:none;letter-spacing:0"></span></div><div class="fig" id="fWind"></div>
        ${near.length ? `<div class="sub">Hurricane force within 50 km of</div><p>${near.join(", ")}</p>` : ""}
        <p class="src">IBTrACS v04r01, a fix every 6 h. Impact: EM-DAT (CRED/UCLouvain)${im.disno ? ", " + im.disno : ""}. The animation spins a textbook vortex on each fix's position and wind; real storms are wider and lopsided.</p>
      </div>`;
    windChart(el.querySelector("#fWind"), s); tickOut = el.querySelector("#fTick");
    el.querySelector(".back").addEventListener("click", () => api.clear()); el.classList.add("on"); el.scrollTop = 0;
  },
  stormTick(t) {
    if (!marker) return; const i = Math.min(marker.pts.length - 1, t.t); marker.dot.attr("cx", marker.x(i)).attr("cy", marker.y(t.kt));
    if (tickOut) tickOut.textContent = `day ${(t.t * 6 / 24).toFixed(1)} · ${Math.round(t.kt)} kt`;
  }
};
