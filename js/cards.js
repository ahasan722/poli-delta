// cards.js  --  the focus card at the top of the panel: a district you clicked, or a storm you are playing.
const fmt = d3.format(","), f1 = d3.format(".1f");
const C = { ink: "#ebe5d6", dim: "#8e887c", mute: "#5c574f", amber: "#f2c35a", silt: "#c88a3c", water: "#5fa8c2", red: "#ff5a3c", green: "#4fa36f", cyan: "#7fd8d2", grid: "#242a33" };
const COVER_COL = { cropland: "#a99e5c", "tree cover": "#2b5c33", mangroves: "#1a4d3d", wetland: "#4d857a", "built-up": "#c7946a", water: "#17334d", other: "#4a4740" };
const windCol = kt => kt >= 96 ? "#ff5a3c" : kt >= 64 ? "#ff9a3c" : kt >= 34 ? "#f2c35a" : "#8fa6bd";
const cat = kt => kt >= 120 ? "super cyclonic storm" : kt >= 90 ? "extremely severe cyclonic storm" : kt >= 64 ? "very severe cyclonic storm" : kt >= 48 ? "severe cyclonic storm" : kt >= 34 ? "cyclonic storm" : "depression";
let el, api, D, marker = null, tickOut = null;

function svg(parent, h) { const w = parent.clientWidth || 380; return { s: d3.select(parent).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }
const stat = (v, l, unit = "") => `<div class="stat"><div class="v">${v}<small>${unit}</small></div><div class="l">${l}</div></div>`;

function coverBar(parent, cover) {
  const { s, w } = svg(parent, 46); const order = ["cropland", "tree cover", "water", "mangroves", "wetland", "built-up", "other"]; const x = d3.scaleLinear().domain([0, 100]).range([0, w]); let acc = 0;
  order.forEach(k => { const v = cover[k] || 0; if (v < 0.05) return;
    s.append("rect").attr("x", x(acc)).attr("y", 0).attr("width", Math.max(0, x(acc + v) - x(acc) - 1)).attr("height", 18).attr("fill", COVER_COL[k]);
    if (v > 9) s.append("text").attr("x", x(acc + v / 2)).attr("y", 13).attr("text-anchor", "middle").attr("fill", "#fff").attr("font-size", 10.5).attr("font-weight", 600).text(Math.round(v) + "%");
    if (v > 12) s.append("text").attr("x", x(acc + v / 2)).attr("y", 34).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10.5).text(k === "other" ? "bare, no data" : k);
    acc += v; });
}
function stormStrip(parent, hits, strongest) {
  const { s, w } = svg(parent, 86); const x = d3.scaleLinear().domain([1960, 2026]).range([6, w - 6]); const r = d3.scaleSqrt().domain([20, 140]).range([2, 9]);
  [1960, 1980, 2000, 2020].forEach(y => { s.append("line").attr("x1", x(y)).attr("x2", x(y)).attr("y1", 8).attr("y2", 56).attr("stroke", C.grid); s.append("text").attr("x", x(y)).attr("y", 70).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).attr("font-family", "IBM Plex Mono").text(y); });
  const y = d3.scaleLinear().domain([20, 140]).range([52, 12]);
  hits.forEach(([yr, kt, name]) => s.append("circle").attr("cx", x(yr)).attr("cy", y(kt)).attr("r", r(kt)).attr("fill", windCol(kt)).attr("opacity", .85).append("title").text(`${name || "unnamed"} ${yr}, ${kt} kt`));
  if (strongest) s.append("text").attr("x", Math.min(w - 70, x(strongest.year) + 10)).attr("y", y(strongest.kt) + 4).attr("fill", C.ink).attr("font-size", 11).text(`${strongest.name || "unnamed"} ${strongest.year}, ${strongest.kt} kt`);
  s.append("text").attr("x", 6).attr("y", 84).attr("fill", C.dim).attr("font-size", 10.5).text("cyclones that passed within 50 km, higher = stronger wind at that pass");
}
function windChart(parent, storm) {
  const pts = storm.pts; const n = pts.length; const { s, w } = svg(parent, 128);
  const x = d3.scaleLinear().domain([0, n - 1]).range([30, w - 8]); const y = d3.scaleLinear().domain([0, Math.max(100, d3.max(pts, p => p[2]) + 10)]).range([92, 10]);
  [34, 64, 96].forEach(v => { if (v > y.domain()[1]) return; s.append("line").attr("x1", 30).attr("x2", w - 8).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.grid).attr("stroke-dasharray", "2 3"); s.append("text").attr("x", 27).attr("y", y(v) + 3).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 9.5).attr("font-family", "IBM Plex Mono").text(v); });
  s.append("path").attr("d", d3.area().x((p, i) => x(i)).y0(92).y1(p => y(p[2])).curve(d3.curveMonotoneX)(pts)).attr("fill", C.amber).attr("opacity", .12);
  s.append("path").attr("d", d3.line().x((p, i) => x(i)).y(p => y(p[2])).curve(d3.curveMonotoneX)(pts)).attr("fill", "none").attr("stroke", C.amber).attr("stroke-width", 1.6);
  const days = Math.floor((n - 1) / 4); d3.range(0, days + 1, Math.max(1, Math.ceil(days / 6))).forEach(dd => s.append("text").attr("x", x(dd * 4)).attr("y", 106).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).attr("font-family", "IBM Plex Mono").text("d" + dd));
  s.append("text").attr("x", 30).attr("y", 124).attr("fill", C.dim).attr("font-size", 10.5).text("maximum sustained wind along the track, kt; dashed: 34, 64, 96 kt");
  marker = { dot: s.append("circle").attr("r", 4).attr("fill", "#fff").attr("cx", x(0)).attr("cy", y(pts[0][2])), x, y, pts };
}

export const cards = {
  init(data, hooks) { D = data; api = hooks; el = document.getElementById("focus"); },
  hide() { if (!el) return; el.classList.remove("on"); el.innerHTML = ""; marker = null; tickOut = null; },
  showDistrict(d) {
    const all = D.districts; const rank = k => all.filter(o => o[k] > d[k]).length + 1; const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || "th");
    const pop = d.pop_census2022 || d.pop_gpw2015; const popLabel = d.pop_census2022 ? "people, census 2022" : "people, GPW 2015";
    const dens = Math.round(pop / d.area_km2);
    el.innerHTML = `<div class="fhead"><div><div class="eyebrow">District · ${d.division} division</div><h3>${d.name}<small>${fmt(d.area_km2)} km²${d.rivers.length ? " · on the " + d.rivers.slice(0, 3).join(", ") : ""}</small></h3></div><button class="x" type="button" aria-label="close">×</button></div>
      <div class="fbody">
        <div class="stats">${stat(fmt(Math.round(pop / 1e5) / 10), popLabel, " M")}${stat(fmt(dens), "people per km²")}${stat(d.share_le10, `of the land under 10 m · ${ord(rank("share_le10"))} lowest of 64`, "%")}
          ${stat(d.share_le5, "under 5 m", "%")}${stat(f1(d.pop_le10 / 1e6), "people on land under 10 m", " M")}${stat(fmt(d.h_max), "highest point (SRTM)", " m")}</div>
        <div class="sub">what covers it</div><div class="fig" id="fCover"></div>
        <div class="sub">cyclones since 1960: ${d.storms.n}${d.storms.strongest ? `, strongest ${d.storms.strongest.name || "unnamed"} ${d.storms.strongest.year}` : ""}</div><div class="fig" id="fStorms"></div>
        ${d.loss_km2 ? `<div class="sub">hill forest</div><p>${fmt(Math.round(d.loss_km2))} km² of tree cover lost 2001–2023 (Hansen), ${f1(d.loss_km2 / d.land_km2 * 100)}% of the district.</p>` : ""}
        <p class="src">Computed on the 0.7 km grid: SRTM 90 m (a surface model, so the low shares are floors), GPW v4 2015, ESA WorldCover 2021, IBTrACS v04r01. Boundaries and census count: BBS Population and Housing Census 2022 GIS layer.</p>
      </div>`;
    coverBar(el.querySelector("#fCover"), d.cover); stormStrip(el.querySelector("#fStorms"), d.storms.hits, d.storms.strongest);
    el.querySelector(".x").addEventListener("click", () => api.clear(true)); el.classList.add("on"); el.scrollTop = 0;
    el.querySelectorAll("#fStorms circle").forEach(c => c.style.cursor = "default");
  },
  showStorm(s) {
    const n = s.note || {}; const peak = s.peak_kt; const name = n.label || (s.name && s.name !== "NOT_NAMED" ? s.name : "Unnamed storm");
    const key = name.toLowerCase().split(" ")[0]; const im = D.impact.find(r => r.year === s.season && r.name.toLowerCase().includes(key)) || {};
    const near = D.districts.filter(d => d.storms.hits.some(h => h[3] === s.sid && h[1] >= 34)).map(d => d.name);
    const days = ((s.pts.length - 1) * 6 / 24).toFixed(1);
    const deaths = im.deaths != null ? fmt(im.deaths) : (n.deaths ? String(n.deaths).split(" ")[0] : "–");
    const affected = im.affected != null ? (im.affected >= 1e6 ? f1(im.affected / 1e6) + " M" : fmt(im.affected)) : "–";
    const dmg = im.damage_adj_musd != null ? (im.damage_adj_musd >= 1000 ? "$" + f1(im.damage_adj_musd / 1000) + " bn" : "$" + fmt(im.damage_adj_musd) + " M") : "–";
    const surge = im.surge_m ?? n.surge_m; const landfall = im.landfall || n.landfall;
    el.innerHTML = `<div class="fhead"><div><div class="eyebrow">Cyclone · ${s.season}</div><h3>${name}<small>${cat(peak)} · peak ${peak} kt (${Math.round(peak * 1.852)} km/h) · ${days} days of track</small></h3></div><button class="x" type="button" aria-label="close">×</button></div>
      <div class="fbody">
        <div class="stats">${stat(deaths, im.deaths != null ? "deaths, EM-DAT" : (n.deaths ? "deaths, official toll" : "no toll on record here"))}${stat(affected, "people affected, EM-DAT")}${stat(dmg, "damage, 2024 US$ (EM-DAT)")}
          ${stat(surge ?? "–", "storm surge", surge ? " m" : "")}${stat(n.shelters ? fmt(n.shelters) : "–", "cyclone shelters at the time")}${stat(im.wind_kmh ? fmt(im.wind_kmh) : Math.round(peak * 1.852), "km/h, " + (im.wind_kmh ? "EM-DAT magnitude" : "peak, IBTrACS"))}</div>
        ${landfall ? `<p><b>Landfall:</b> ${landfall}.</p>` : ""}${n.wind_note ? `<p class="src">${n.wind_note}.</p>` : ""}
        <div class="sub">the wind, hour by hour <span id="fTick" style="color:#fff;margin-left:8px"></span></div><div class="fig" id="fWind"></div>
        ${near.length ? `<div class="sub">within 50 km of the track at gale force or more</div><p class="rivers">${near.join(", ")}</p>` : ""}
        <p class="src">IBTrACS v04r01 fixes every 6 h. Impact: EM-DAT (CRED/UCLouvain) public table${im.disno ? ", event " + im.disno : ""}; landfall and surge from the article cited in raw/disasters_emdat_bgd. The animation spins a Rankine vortex on the recorded maximum wind at each fix; the real wind field was wider, wetter and lopsided.</p>
      </div>`;
    windChart(el.querySelector("#fWind"), s); tickOut = el.querySelector("#fTick");
    el.querySelector(".x").addEventListener("click", () => { api.clear(false); }); el.classList.add("on"); el.scrollTop = 0;
  },
  stormTick(t) {
    if (!marker) return; const i = Math.min(marker.pts.length - 1, t.t); marker.dot.attr("cx", marker.x(i)).attr("cy", marker.y(t.kt));
    if (tickOut) tickOut.textContent = `day ${(t.t * 6 / 24).toFixed(1)} · ${Math.round(t.kt)} kt`;
  }
};
