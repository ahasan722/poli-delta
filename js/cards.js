// cards.js  --  v8: the sheet that docks on the right when you pick a district or a cyclone.
// A district sheet has four tabs: Overview (the verdict, the headline number, where it ranks among the 64),
// Rivers (channels, water, the named rivers and their flow), Land and crops (agro-ecological zones, land cover,
// the five major crops and the district's share of each) and Cyclones (every pass within 50 km since 1960).
// Every chart draws itself in when its tab opens.
import { BASE, windHex, sevHex, WIND, CROP, CROP_NAME, RIVER, REGION } from "./palette.js?v=9";
import { icon } from "./icons.js?v=9";
const fmt = d3.format(","), f1 = d3.format(".1f");
const C = { ink: BASE.ink, dim: BASE.dim, faint: BASE.faint, line: BASE.line, soft: "#f3f4f6" };
// land cover in the sheet: muted ESA WorldCover hues, a categorical chart separate from the map
const COVER_COL = { cropland: "#c9b56b", "tree cover": "#4d7f57", mangroves: "#2f6b5a", wetland: "#6aa39b", "built-up": "#b98a6a", water: "#6f9cc2", other: "#d5d9de" };
const AEZ_COL = ["#374151", "#6b7280", "#9ca3af", "#c7ccd3", "#e2e5e9", "#eef0f3"];
const cat = kt => kt >= 120 ? "super cyclonic storm" : kt >= 90 ? "extremely severe cyclonic storm" : kt >= 64 ? "very severe cyclonic storm" : kt >= 48 ? "severe cyclonic storm" : kt >= 34 ? "cyclonic storm" : "depression";
const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th");
const T = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
const tons = v => v >= 1e6 ? f1(v / 1e6) + " M t" : v >= 1e4 ? fmt(Math.round(v / 1000)) + "k t" : fmt(Math.round(v)) + " t";
let el, api, D, marker = null, tickOut = null;

function svg(parent, h) { const w = Math.max(280, parent.clientWidth || 400); return { s: d3.select(parent).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
// a number that counts up to its value
function countUp(node, to, f) { const t = T(); if (!t) { node.textContent = f(to); return; } d3.select(node).transition().duration(900).ease(d3.easeCubicOut).tween("n", () => { const i = d3.interpolateNumber(0, to); return k => { node.textContent = f(i(k)); }; }); }

// ---- Overview: where the district sits among the 64 on five measures ----------------------------------------
function rankStrip(parent, d) {
  const all = D.districts; const rows = [["People under 5 m", "pop_le5", v => f1(v / 1e6) + " M"], ["Land under 5 m", "share_le5", v => v + "%"], ["Hurricane-force passes", "severe", v => v],
    ["People under 2 m", "pop_le2", v => f1(v / 1e6) + " M"], ["Population, 2022", "pop_census2022", v => f1(v / 1e6) + " M"]];
  const { s, w } = svg(parent, rows.length * 46 + 22); const x = d3.scaleLinear().domain([63, 0]).range([8, w - 8]);
  s.append("text").attr("x", 8).attr("y", 12).attr("fill", C.dim).attr("font-size", 11.5).text("lowest of 64");
  s.append("text").attr("x", w - 8).attr("y", 12).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 11.5).text("highest");
  rows.forEach(([label, k, f], i) => {
    const y = 22 + i * 46; const sorted = all.map(o => o[k]).sort((a, b) => b - a); const rank = sorted.findIndex(v => v <= d[k]);
    s.append("text").attr("x", 8).attr("y", y + 14).attr("fill", C.ink).attr("font-size", 13.5).attr("font-weight", 500).text(label);
    s.append("text").attr("x", w - 8).attr("y", y + 14).attr("text-anchor", "end").attr("fill", C.ink).attr("font-size", 13).attr("font-family", "IBM Plex Mono").text(`${f(d[k])} · ${ord(rank + 1)}`);
    s.append("line").attr("x1", 8).attr("x2", w - 8).attr("y1", y + 30).attr("y2", y + 30).attr("stroke", C.line).attr("stroke-width", 6).attr("stroke-linecap", "round");
    d3.range(64).forEach(j => s.append("line").attr("x1", x(j)).attr("x2", x(j)).attr("y1", y + 27).attr("y2", y + 33).attr("stroke", "#fff").attr("stroke-width", 1));
    s.append("circle").attr("cx", x(63)).attr("cy", y + 30).attr("r", 7).attr("fill", C.ink).attr("stroke", "#fff").attr("stroke-width", 2)
      .transition().delay(150 + i * 90).duration(900 * T()).ease(d3.easeCubicOut).attr("cx", x(rank));
  });
}
// ---- Rivers: the named rivers by flow ------------------------------------------------------------------------
function riverBars(parent, named) {
  const { s, w } = svg(parent, named.length * 40 + 8); const x = d3.scaleLog().domain([100, 50000]).range([0, w - 150]).clamp(true);
  named.forEach(([n, km, dis], i) => {
    const y = i * 40;
    s.append("text").attr("x", 0).attr("y", y + 14).attr("fill", C.ink).attr("font-size", 14).attr("font-weight", 500).text(n);
    s.append("text").attr("x", 0).attr("y", y + 30).attr("fill", C.dim).attr("font-size", 12).text(`${km} km in the district`);
    s.append("rect").attr("x", 140).attr("y", y + 8).attr("height", 14).attr("rx", 2).attr("fill", RIVER.strong).attr("width", 0)
      .transition().delay(100 + i * 80).duration(800 * T()).ease(d3.easeCubicOut).attr("width", x(dis));
    s.append("text").attr("x", 140 + x(dis) + 6).attr("y", y + 19).attr("fill", C.ink).attr("font-size", 12.5).attr("font-family", "IBM Plex Mono").attr("opacity", 0).text(fmt(dis) + " m³/s")
      .transition().delay(500 + i * 80).duration(300 * T()).attr("opacity", 1);
  });
}
// ---- Land and crops ----------------------------------------------------------------------------------------
function aezBar(parent, aez) {
  const zones = D.agri.zones; const tot = d3.sum(aez, a => a[1]); const { s, w } = svg(parent, 30 + aez.length * 26);
  const x = d3.scaleLinear().domain([0, tot]).range([0, w]); let acc = 0;
  const col = z => REGION[D.agri.region_of_zone[z]] || AEZ_COL[1];
  aez.forEach(([z, ha], i) => { s.append("rect").attr("x", x(acc)).attr("y", 0).attr("height", 18).attr("fill", col(z)).attr("width", 0)
      .transition().delay(i * 120).duration(600 * T()).attr("width", Math.max(0, x(ha) - 1.5)); acc += ha; });
  aez.forEach(([z, ha], i) => { const y = 30 + i * 26;
    s.append("rect").attr("x", 0).attr("y", y + 3).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", col(z));
    s.append("text").attr("x", 20).attr("y", y + 13).attr("fill", C.ink).attr("font-size", 13.5).text(`${z}. ${zones[z].name}`).append("tspan").attr("fill", C.dim).attr("font-size", 12).text("  " + D.agri.regions[D.agri.region_of_zone[z]].toLowerCase());
    s.append("text").attr("x", w).attr("y", y + 13).attr("text-anchor", "end").attr("fill", C.ink).attr("font-size", 12.5).attr("font-family", "IBM Plex Mono").text(Math.round(ha / tot * 100) + "%"); });
}
function coverBar(parent, cover) {
  const { s, w } = svg(parent, 42); const order = ["cropland", "tree cover", "water", "mangroves", "wetland", "built-up", "other"]; const x = d3.scaleLinear().domain([0, 100]).range([0, w]); let acc = 0;
  order.forEach((k, i) => { const v = cover[k] || 0; if (v < 0.05) return;
    s.append("rect").attr("x", x(acc)).attr("y", 0).attr("height", 20).attr("fill", COVER_COL[k]).attr("width", 0).transition().delay(i * 70).duration(500 * T()).attr("width", Math.max(0, x(acc + v) - x(acc) - 1));
    if (v > 9) s.append("text").attr("x", x(acc + v / 2)).attr("y", 14).attr("text-anchor", "middle").attr("fill", k === "other" ? C.ink : "#fff").attr("font-size", 12).attr("font-weight", 600).text(Math.round(v) + "%");
    if (v > 13) s.append("text").attr("x", x(acc + v / 2)).attr("y", 36).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 12).text(k);
    acc += v; });
}
function cropBars(parent, a) {
  const crops = Object.keys(CROP_NAME); const nat = D.agri.national; const share = c => (a.crops[c] || 0) / nat[c] * 100;
  const max = Math.max(4, d3.max(crops, share)); const { s, w } = svg(parent, crops.length * 44 + 4); const x = d3.scaleLinear().domain([0, max]).range([0, w - 225]);
  const lead = crops.reduce((b, c) => share(c) > share(b) ? c : b, crops[0]);
  crops.forEach((c, i) => { const y = i * 44; const rk = a.crop_rank[c];
    s.append("text").attr("x", 0).attr("y", y + 14).attr("fill", C.ink).attr("font-size", 14).attr("font-weight", c === lead ? 600 : 500).text(CROP_NAME[c]);
    s.append("text").attr("x", 0).attr("y", y + 31).attr("fill", C.dim).attr("font-size", 12).text(`${tons(a.crops[c] || 0)} · ${D.agri.crop_years[c]}`);
    s.append("rect").attr("x", 130).attr("y", y + 9).attr("height", 16).attr("rx", 2).attr("fill", CROP[Math.min(4, Math.floor((64 - rk) / 12.8))]).attr("width", 0)
      .transition().delay(120 + i * 90).duration(800 * T()).ease(d3.easeCubicOut).attr("width", x(share(c)));
    s.append("text").attr("x", 130 + x(share(c)) + 6).attr("y", y + 21).attr("fill", C.ink).attr("font-size", 12.5).attr("font-family", "IBM Plex Mono").attr("opacity", 0)
      .text(`${f1(share(c))}% · ${ord(rk)}`).transition().delay(600 + i * 90).duration(300 * T()).attr("opacity", 1); });
  return lead;
}
// ---- Cyclones: every pass within 50 km, by year and wind ---------------------------------------------------------
function stormStrip(parent, hits) {
  const { s, w } = svg(parent, 96); const x = d3.scaleLinear().domain([1960, 2026]).range([8, w - 8]); const y = d3.scaleLinear().domain([20, 140]).range([66, 10]); const r = d3.scaleSqrt().domain([20, 140]).range([2.5, 10]);
  s.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(64)).attr("y2", y(64)).attr("stroke", C.line).attr("stroke-dasharray", "3 3");
  s.append("text").attr("x", w).attr("y", y(64) - 5).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 11.5).text("hurricane force, 64 kt");
  [1960, 1980, 2000, 2020].forEach(v => s.append("text").attr("x", x(v)).attr("y", 90).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").text(v));
  hits.forEach(([yr, kt, name], i) => s.append("circle").attr("cx", x(yr)).attr("cy", y(Math.min(140, kt))).attr("r", 0).attr("fill", windHex(kt)).attr("fill-opacity", .9)
    .transition().delay(i * 40 * T()).duration(400 * T()).attr("r", r(kt)).selection().append("title").text(`${name || "unnamed"} ${yr}, ${kt} kt`));
}
function windChart(parent, storm) {
  const pts = storm.pts; const n = pts.length; const { s, w } = svg(parent, 130);
  const x = d3.scaleLinear().domain([0, n - 1]).range([30, w - 6]); const y = d3.scaleLinear().domain([0, Math.max(100, d3.max(pts, p => p[2]) + 10)]).range([100, 8]);
  [34, 64, 96].forEach(v => { s.append("line").attr("x1", 30).attr("x2", w - 6).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.line).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 26).attr("y", y(v) + 4).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").text(v); });
  s.append("path").attr("d", d3.area().x((p, i) => x(i)).y0(100).y1(p => y(p[2])).curve(d3.curveMonotoneX)(pts)).attr("fill", WIND.gale).attr("opacity", 0).transition().duration(700 * T()).attr("opacity", .18);
  const line = s.append("path").attr("d", d3.line().x((p, i) => x(i)).y(p => y(p[2])).curve(d3.curveMonotoneX)(pts)).attr("fill", "none").attr("stroke", WIND.hurricane).attr("stroke-width", 2);
  const L = line.node().getTotalLength(); line.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L).transition().duration(1100 * T()).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);
  const days = Math.floor((n - 1) / 4); d3.range(0, days + 1, Math.max(1, Math.ceil(days / 6))).forEach(dd => s.append("text").attr("x", x(dd * 4)).attr("y", 118).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 11.5).attr("font-family", "IBM Plex Mono").text("day " + dd));
  marker = { dot: s.append("circle").attr("r", 5.5).attr("fill", C.ink).attr("stroke", "#fff").attr("stroke-width", 2).attr("cx", x(0)).attr("cy", y(pts[0][2])), x, y, pts };
}
function head(eyebrow, dot, title, sub) {
  return `<div class="fhead"><div><div class="eyebrow"><i style="background:${dot}"></i>${eyebrow}</div><h3>${title}<small>${sub}</small></h3></div><button class="back" type="button" aria-label="Close" title="Close  [Esc]">${icon("close", 20)}</button></div>`;
}
function bindTabs(draw) {
  const tabs = [...el.querySelectorAll(".ftabs button")]; const done = new Set();
  const open = id => { tabs.forEach(b => { const on = b.dataset.p === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    el.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.dataset.p === id));
    if (!done.has(id)) { done.add(id); draw[id]?.(); } };
  tabs.forEach(b => b.addEventListener("click", () => open(b.dataset.p)));
  el.style.setProperty("--fh", el.querySelector(".fhead").offsetHeight + "px");
  open(tabs[0].dataset.p);
}

export const cards = {
  init(data, hooks) { D = data; api = hooks; el = document.getElementById("focus"); },
  hide() { if (!el) return; el.classList.remove("on"); el.innerHTML = ""; marker = null; tickOut = null; },
  showDistrict(d) {
    const all = D.districts; const rank = k => 1 + all.filter(o => o[k] > d[k]).length; const a = D.agri.districts[d.id];
    const i10 = D.ten.findIndex(t => t.id === d.id);
    const verdict = i10 >= 0
      ? `<div class="verdict in"><b>${ord(i10 + 1)} of the first ten.</b> ${d.severe} hurricane-force passes since 1960 and ${f1(d.pop_le5 / 1e6)} M people under 5 m.</div>`
      : d.severe < 3
        ? `<div class="verdict"><b>Not in the first ten:</b> ${d.severe === 0 ? "no hurricane-force cyclone" : d.severe === 1 ? "one hurricane-force pass" : "two hurricane-force passes"} within 50 km since 1960 (the rule asks for 3).</div>`
        : `<div class="verdict"><b>Not in the first ten:</b> on the cyclone coast, but fewer people under 5 m than the ten.</div>`;
    const tab = (p, ic, t) => `<button type="button" role="tab" data-p="${p}">${icon(ic, 16)}${t}</button>`;
    const named = a.rivers.named; const water = d.cover.water || 0;
    const hurr = d.storms.hits.filter(h => h[1] >= 64).sort((x, y) => y[0] - x[0]);
    el.innerHTML = head(`District · ${d.division} division`, sevHex(d.severe), d.name, `${fmt(d.area_km2)} km² · ${f1(d.pop_census2022 / 1e6)} M people (census 2022)`) + `
      <div class="ftabs" role="tablist">${tab("ov", "overview", "Overview")}${tab("rv", "river", "Rivers")}${tab("lc", "sprout", "Farming")}${tab("cy", "cyclone", "Cyclones")}</div>
      <div class="fbody">
        <div class="pane" data-p="ov">
          ${verdict}
          <div class="hero"><b class="cu" data-v="${d.pop_le5}">0</b><span>people living under 5 m · ${ord(rank("pop_le5"))} of 64</span></div>
          <div class="sub">Where ${d.name} ranks among the 64 districts</div><div class="fig" id="fRank"></div>
          <table>
            <tr><td>Land under 5 m</td><td>${d.share_le5}%</td></tr>
            <tr><td>Highest ground</td><td>${fmt(d.h_max)} m</td></tr>
            <tr><td>Area</td><td>${fmt(d.area_km2)} km²</td></tr>
          </table>
        </div>
        <div class="pane" data-p="rv">
          <div class="stats"><div><b class="cu" data-v="${a.rivers.major_km + a.rivers.minor_km}" data-f="int">0</b><span>km of mapped river channel</span></div><div><b>${a.rivers.density}</b><span>km of channel per 100 km²</span></div><div><b>${f1(water)}%</b><span>of the land is water (WorldCover)</span></div></div>
          ${named.length ? `<div class="sub">Named rivers, by mean flow</div><div class="fig" id="fRiv"></div>` : `<p class="note">No reach of 150 m³/s or more crosses ${d.name}; its water runs in the smaller channels drawn in pale blue on the map.</p>`}
          <p class="src">HydroRIVERS v1.0 reaches and long-term mean discharge, cut at the district line on a 0.7 km grid. Water share: ESA WorldCover 2021.</p>
        </div>
        <div class="pane" data-p="lc">
          <p class="land">${Object.entries(a.regions || {}).map(([k, v]) => `<span><i style="background:${REGION[k]}"></i>${Math.round(v * 100)}% ${D.agri.regions[k].toLowerCase()}</span>`).join("")}</p>
          ${a.aez.length ? `<div class="sub">Agro-ecological zones</div><div class="fig" id="fAez"></div>` : `<p class="note">${d.name} is not listed among the main districts of any zone in the BARC table.</p>`}
          <div class="sub">What covers the land</div><div class="fig" id="fCover"></div>
          <div class="sub">Major crops: share of national output</div><p class="note" id="fLead"></p><div class="fig" id="fCrop"></div>
          <p class="src">Zones: BARC, Fertilizer Recommendation Guide 2018 (each zone's main districts and their area in it). Crops: BBS, 45 Years Agriculture Statistics of Major Crops; bar colour = the district's rank class for that crop. Land cover: ESA WorldCover 2021.</p>
        </div>
        <div class="pane" data-p="cy">
          <div class="stats"><div><b>${d.severe}</b><span>hurricane-force passes since 1960</span></div><div><b>${d.storms.n}</b><span>cyclones of any strength within 50 km</span></div><div><b>${d.storms.hits.length ? d3.max(d.storms.hits, h => h[1]) : 0} kt</b><span>strongest wind recorded nearby</span></div></div>
          <div class="sub">Every cyclone within 50 km, by year and wind</div><div class="fig" id="fStorms"></div>
          ${hurr.length ? `<div class="sub">Hurricane force</div><ul class="hits">${hurr.map(h => `<li><i style="background:${windHex(h[1])}"></i><span>${h[2] || "Unnamed"} <small>${h[0]}</small></span><b>${h[1]} kt</b>${h[3] ? `<button type="button" data-sid="${h[3]}">${icon("play", 14)}Play</button>` : ""}</li>`).join("")}</ul>` : ""}
          <p class="src">IBTrACS v04r01, positions every 6 hours, within 50 km of the district.</p>
        </div>
      </div>`;
    el.querySelector(".back").addEventListener("click", () => api.clear());
    el.querySelectorAll(".hits button").forEach(b => b.addEventListener("click", () => api.play(b.dataset.sid)));
    el.classList.add("on"); el.scrollTop = 0;
    const counters = root => root.querySelectorAll(".cu").forEach(n => countUp(n, +n.dataset.v, n.dataset.f === "int" ? v => fmt(Math.round(v)) : v => f1(v / 1e6) + " M"));
    bindTabs({
      ov: () => { counters(el.querySelector('.pane[data-p="ov"]')); rankStrip(el.querySelector("#fRank"), d); },
      rv: () => { counters(el.querySelector('.pane[data-p="rv"]')); if (named.length) riverBars(el.querySelector("#fRiv"), named); },
      lc: () => { if (a.aez.length) aezBar(el.querySelector("#fAez"), a.aez); coverBar(el.querySelector("#fCover"), d.cover);
        const lead = cropBars(el.querySelector("#fCrop"), a); const sh = a.crops[lead] / D.agri.national[lead] * 100;
        el.querySelector("#fLead").textContent = `${d.name}'s largest share of national output is ${CROP_NAME[lead].toLowerCase()}: ${f1(sh)}%, ${ord(a.crop_rank[lead])} of 64.`; },
      cy: () => stormStrip(el.querySelector("#fStorms"), d.storms.hits)
    });
  },
  showStorm(s) {
    const n = s.note || {}; const peak = s.peak_kt; const name = n.label || (s.name && s.name !== "NOT_NAMED" ? s.name : "Unnamed storm");
    const key = name.toLowerCase().split(" ")[0]; const im = D.impact.find(r => r.year === s.season && r.name.toLowerCase().includes(key)) || {};
    const near = D.districts.filter(d => d.storms.hits.some(h => h[3] === s.sid && h[1] >= 64)).map(d => d.name);
    const affected = im.affected != null ? (im.affected >= 1e6 ? f1(im.affected / 1e6) + " M" : fmt(im.affected)) : "–";
    const dmg = im.damage_adj_musd != null ? (im.damage_adj_musd >= 1000 ? "$" + f1(im.damage_adj_musd / 1000) + " bn" : "$" + fmt(im.damage_adj_musd) + " M") : "–";
    const surge = im.surge_m ?? n.surge_m; const landfall = im.landfall || n.landfall;
    const deathsN = im.deaths != null ? im.deaths : null; const deathsTxt = n.deaths ? String(n.deaths).split(" ")[0] : "–";
    const row = (l, v) => `<tr><td>${l}</td><td>${v}</td></tr>`;
    el.innerHTML = head(`Cyclone · ${s.season}`, windHex(peak), name, `${cat(peak)} · peak ${peak} kt (${Math.round(peak * 1.852)} km/h)`) + `
      <div class="fbody">
        <div class="hero"><b class="cu">${deathsN != null ? "0" : deathsTxt}</b><span>${im.deaths != null ? "deaths, EM-DAT" : "deaths, official toll"}</span></div>
        <div class="stats"><div><b>${affected}</b><span>people affected</span></div><div><b>${dmg}</b><span>damage, 2024 US$</span></div><div><b>${surge ? surge + " m" : "–"}</b><span>storm surge</span></div></div>
        <div class="sub">Wind along the track <span id="fTick" style="color:#111827;margin-left:6px;text-transform:none;letter-spacing:0;font-family:var(--mono)"></span></div><div class="fig" id="fWind"></div>
        <table>${n.shelters ? row("Cyclone shelters at the time", fmt(n.shelters)) : ""}${landfall ? row("Landfall", `<span style="font-family:var(--sans)">${landfall}</span>`) : ""}</table>
        ${near.length ? `<div class="sub">Hurricane force within 50 km of</div><p>${near.join(", ")}</p>` : ""}
        <p class="src">IBTrACS v04r01, a fix every 6 h. Impact: EM-DAT (CRED/UCLouvain)${im.disno ? ", " + im.disno : ""}. The animation spins a textbook vortex on each fix's position and wind; real storms are wider and lopsided.</p>
      </div>`;
    if (deathsN != null) countUp(el.querySelector(".hero .cu"), deathsN, v => fmt(Math.round(v)));
    windChart(el.querySelector("#fWind"), s); tickOut = el.querySelector("#fTick");
    el.querySelector(".back").addEventListener("click", () => api.clear()); el.classList.add("on"); el.scrollTop = 0;
  },
  stormTick(t) {
    if (!marker) return; const i = Math.min(marker.pts.length - 1, t.t); marker.dot.attr("cx", marker.x(i)).attr("cy", marker.y(t.kt));
    if (tickOut) tickOut.textContent = `day ${(t.t * 6 / 24).toFixed(1)} · ${Math.round(t.kt)} kt`;
  }
};
