// charts.js  --  the small D3 figures that live inside the step cards, plus the sea-level slider and the storm clock.
const fmt = d3.format(","), f1 = d3.format(".1f");
const C = { silt: "#c88a3c", ink: "#ebe5d6", dim: "#8e887c", water: "#5fa8c2", red: "#ff5a3c", amber: "#f2c35a", green: "#4fa36f", cyan: "#7fd8d2", grid: "#242a33" };
const MONO = "IBM Plex Mono, monospace";

// facts that drive the little charts (sources listed on the page; notes/facts.csv has the full rows)
const SEDIMENT = [ // Rahman et al. 2018, Sci Total Environ; BWDB-based
  { label: "planning assumption", value: 1000, note: "the 1 Gt/yr still used in many plans" },
  { label: "1960s–2000s range, mid", value: 750, note: "Ganges 150–590 + Brahmaputra 135–615 Mt/yr" },
  { label: "about 2015", value: 500, note: "Rahman et al. 2018 abstract" },
  { label: "2030 estimate", value: 320, note: "160 + 160 Mt/yr" } ];
const SUBSIDENCE = [ // mm/yr; Steckler et al. 2022, Frontiers 2024 review, Brown & Nicholls 2015
  { label: "deep, tectonic", lo: 2, hi: 3 }, { label: "tube wells, historic", lo: 1, hi: 5 }, { label: "continuous GNSS", lo: 3, hi: 7 },
  { label: "GNSS + tide gauges", lo: 4, hi: 8 }, { label: "Sundarbans, shallow (RSET)", lo: 8, hi: 10 }, { label: "polder 32, shallow", lo: 4, hi: 6 }, { label: "campaign GNSS, coast", lo: 20, hi: 25 } ];
const FLOODS = [ // share of country inundated, BUET satellite series via Daily Star; normal year Dewan et al. 2003
  { y: "normal", v: 21 }, { y: "1988", v: 61 }, { y: "1998", v: 68 }, { y: "2004", v: 38 }, { y: "2007", v: 42 }, { y: "2017", v: 42 }, { y: "2020", v: 37 } ];
const DEATHS = [ // official tolls as reported (Wikipedia infoboxes citing IMD/government; GFDRR for Sidr)
  { y: 1970, n: "Bhola", d: 300000 }, { y: 1991, n: "Gorky", d: 138866 }, { y: 2007, n: "Sidr", d: 3447 }, { y: 2009, n: "Aila", d: 190 }, { y: 2013, n: "Mahasen", d: 17 },
  { y: 2016, n: "Roanu", d: 27 }, { y: 2017, n: "Mora", d: 9 }, { y: 2019, n: "Bulbul", d: 9 }, { y: 2020, n: "Amphan", d: 26 }, { y: 2022, n: "Sitrang", d: 35 }, { y: 2023, n: "Mocha", d: 3 }, { y: 2024, n: "Remal", d: 10 } ];
const SHELTERS = [ { y: 1970, n: 44 }, { y: 1991, n: 512 }, { y: 2015, n: 3268 }, { y: 2022, n: 14000 } ];

function svgIn(id, h) { const el = document.getElementById(id); if (!el) return { svg: d3.select(document.createElement("div")).append("svg"), w: 380, none: true }; el.innerHTML = ""; const w = el.clientWidth || 380; return { svg: d3.select(el).append("svg").attr("width", w).attr("height", h).attr("font-family", "IBM Plex Sans, sans-serif"), w }; }

function sediment() {
  const { svg, w } = svgIn("chSediment", 150); const x = d3.scaleLinear().domain([0, 1050]).range([0, w - 150]);
  const g = svg.append("g").attr("transform", "translate(140,10)");
  SEDIMENT.forEach((d, i) => { const y = i * 32;
    g.append("rect").attr("x", 0).attr("y", y).attr("width", x(d.value)).attr("height", 18).attr("fill", i === 0 ? C.dim : C.silt).attr("opacity", i === 0 ? .5 : 1);
    g.append("text").attr("x", -8).attr("y", y + 13).attr("text-anchor", "end").attr("fill", C.ink).attr("font-size", 11.5).text(d.label);
    g.append("text").attr("x", x(d.value) + 6).attr("y", y + 13).attr("fill", C.ink).attr("font-size", 11.5).attr("font-weight", 700).text(fmt(d.value)); });
  g.append("text").attr("x", 0).attr("y", 140).attr("fill", C.dim).attr("font-size", 10.5).text("million tonnes of sediment a year, Ganges + Brahmaputra");
}
function subsidence() {
  const { svg, w } = svgIn("chSubsidence", 212); const x = d3.scaleLinear().domain([0, 26]).range([0, w - 170]);
  const g = svg.append("g").attr("transform", "translate(160,8)");
  [5, 10, 15, 20, 25].forEach(v => { g.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", 0).attr("y2", SUBSIDENCE.length * 23).attr("stroke", C.grid); g.append("text").attr("x", x(v)).attr("y", SUBSIDENCE.length * 23 + 12).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).text(v); });
  SUBSIDENCE.forEach((d, i) => { const y = i * 23;
    g.append("line").attr("x1", x(d.lo)).attr("x2", x(d.hi)).attr("y1", y + 9).attr("y2", y + 9).attr("stroke", C.silt).attr("stroke-width", 8).attr("stroke-linecap", "round");
    g.append("text").attr("x", -8).attr("y", y + 13).attr("text-anchor", "end").attr("fill", C.ink).attr("font-size", 11).text(d.label); });
  g.append("text").attr("x", 0).attr("y", SUBSIDENCE.length * 23 + 30).attr("fill", C.dim).attr("font-size", 10.5).text("mm a year the ground goes down, by method");
}
function floods() {
  const { svg, w } = svgIn("chFloods", 150); const x = d3.scaleBand().domain(FLOODS.map(d => d.y)).range([0, w - 20]).padding(.2); const y = d3.scaleLinear().domain([0, 70]).range([110, 10]);
  const g = svg.append("g").attr("transform", "translate(10,0)");
  FLOODS.forEach(d => { g.append("rect").attr("x", x(d.y)).attr("y", y(d.v)).attr("width", x.bandwidth()).attr("height", 110 - y(d.v)).attr("fill", d.y === "normal" ? C.dim : C.water);
    g.append("text").attr("x", x(d.y) + x.bandwidth() / 2).attr("y", y(d.v) - 4).attr("text-anchor", "middle").attr("fill", C.ink).attr("font-size", 11).attr("font-weight", 700).text(d.v + "%");
    g.append("text").attr("x", x(d.y) + x.bandwidth() / 2).attr("y", 124).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10.5).text(d.y); });
  g.append("text").attr("x", 0).attr("y", 142).attr("fill", C.dim).attr("font-size", 10.5).text("share of the country under water, satellite series (BUET)");
}
function deaths() {
  const { svg, w } = svgIn("chDeaths", 200); const x = d3.scaleLinear().domain([1968, 2030]).range([40, w - 16]); const y = d3.scaleLog().domain([1, 500000]).range([150, 12]);
  const g = svg.append("g");
  [1, 10, 100, 1000, 10000, 100000].forEach(v => { g.append("line").attr("x1", 40).attr("x2", w - 16).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.grid); g.append("text").attr("x", 36).attr("y", y(v) + 3).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 9.5).text(d3.format("~s")(v)); });
  const sh = d3.scaleLinear().domain([0, 14000]).range([150, 12]);
  g.append("path").attr("d", d3.line().x(d => x(d.y)).y(d => sh(d.n)).curve(d3.curveMonotoneX)(SHELTERS)).attr("fill", "none").attr("stroke", C.amber).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 3");
  g.append("text").attr("x", x(2022) - 4).attr("y", sh(14000) - 4).attr("text-anchor", "end").attr("fill", C.amber).attr("font-size", 10).text("shelters: 44 → 512 → 14,000+");
  DEATHS.forEach(d => { g.append("circle").attr("cx", x(d.y)).attr("cy", y(d.d)).attr("r", 4).attr("fill", C.red);
    const lab = { Bhola: [6, 0], Gorky: [6, 0], Sidr: [6, 0], Amphan: [6, -8], Remal: [6, 8] }[d.n];
    if (lab) g.append("text").attr("x", x(d.y) + lab[0]).attr("y", y(d.d) + 4 + lab[1]).attr("fill", C.ink).attr("font-size", 10.5).text(`${d.n} ${fmt(d.d)}`); });
  [1970, 1990, 2010, 2025].forEach(v => g.append("text").attr("x", x(v)).attr("y", 166).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).text(v));
  g.append("text").attr("x", 40).attr("y", 190).attr("fill", C.dim).attr("font-size", 10.5).text("deaths per cyclone, log scale; dashed: cyclone shelters");
}
function exposureChart(expo) {
  const { svg, w } = svgIn("chExposure", 150); const x = d3.scaleLinear().domain([0, 10]).range([36, w - 16]); const y = d3.scaleLinear().domain([0, 70]).range([112, 10]);
  const g = svg.append("g"); const pts = expo.steps_m.map((s, i) => ({ s, p: expo.people[i] / 1e6 }));
  g.append("path").attr("d", d3.area().x(d => x(d.s)).y0(112).y1(d => y(d.p))(pts)).attr("fill", C.silt).attr("opacity", .25);
  g.append("path").attr("d", d3.line().x(d => x(d.s)).y(d => y(d.p))(pts)).attr("fill", "none").attr("stroke", C.silt).attr("stroke-width", 2);
  [0, 2, 4, 6, 8, 10].forEach(v => g.append("text").attr("x", x(v)).attr("y", 126).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).text(v + " m"));
  [20, 40, 60].forEach(v => { g.append("line").attr("x1", 36).attr("x2", w - 16).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.grid); g.append("text").attr("x", 32).attr("y", y(v) + 3).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 10).text(v + "M"); });
  g.append("text").attr("x", 36).attr("y", 144).attr("fill", C.dim).attr("font-size", 10.5).text("people living at or below each height (SRTM + GPW 2015)");
}

// land cover shares as one bar, in the same colours the relief uses
const COVER_COL = { "cropland": "#a99e5c", "tree cover": "#2b5c33", "mangroves": "#1a4d3d", "herbaceous wetland": "#4d857a", "built-up": "#c7946a", "water": "#17334d", "grassland": "#8c9a52", "bare": "#cfc19a", "shrubland": "#75804a" };
function coverChart(cs) {
  const { svg, w } = svgIn("chCover", 120); const order = ["cropland", "tree cover", "water", "mangroves", "herbaceous wetland", "built-up", "grassland", "bare"];
  const x = d3.scaleLinear().domain([0, 100]).range([0, w - 20]); let acc = 0; const g = svg.append("g").attr("transform", "translate(10,6)");
  order.forEach(k => { const v = cs.cover_shares_pct[k] || 0; if (!v) return;
    g.append("rect").attr("x", x(acc)).attr("y", 0).attr("width", Math.max(0, x(acc + v) - x(acc) - 1)).attr("height", 26).attr("fill", COVER_COL[k]);
    if (v > 6) g.append("text").attr("x", x(acc + v / 2)).attr("y", 17).attr("text-anchor", "middle").attr("fill", "#fff").attr("font-size", 11).attr("font-weight", 700).text(Math.round(v) + "%");
    acc += v; });
  let ly = 44; order.filter(k => (cs.cover_shares_pct[k] || 0) >= 0.9).forEach((k, i) => { const col = i % 2, row = Math.floor(i / 2);
    g.append("rect").attr("x", col * (w / 2 - 10)).attr("y", ly + row * 18).attr("width", 10).attr("height", 10).attr("fill", COVER_COL[k]);
    g.append("text").attr("x", col * (w / 2 - 10) + 15).attr("y", ly + row * 18 + 9).attr("fill", C.ink).attr("font-size", 11.5).text(`${k} ${f1(cs.cover_shares_pct[k])}%`); });
}
function lossChart(cs) {
  const rows = cs.cht_loss_by_year || []; if (!rows.length) return;
  const years = d3.range(2001, 2024); const tot = years.map(y => ({ y, v: d3.sum(rows, r => +r["loss_" + y] || 0) / 100 }));   // ha -> km2
  const { svg, w } = svgIn("chLoss", 130); const x = d3.scaleBand().domain(years).range([52, w - 10]).padding(.15); const y = d3.scaleLinear().domain([0, d3.max(tot, d => d.v) * 1.1]).range([96, 8]);
  const g = svg.append("g");
  tot.forEach(d => g.append("rect").attr("x", x(d.y)).attr("y", y(d.v)).attr("width", x.bandwidth()).attr("height", 96 - y(d.v)).attr("fill", C.red).attr("opacity", .85));
  [2001, 2010, 2023].forEach(v => g.append("text").attr("x", x(v) + x.bandwidth() / 2).attr("y", 110).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).text(v));
  const mx = d3.max(tot, d => d.v); g.append("text").attr("x", 48).attr("y", y(mx) + 4).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 10).text(Math.round(mx) + " km²");
  g.append("text").attr("x", 52).attr("y", 126).attr("fill", C.dim).attr("font-size", 10.5).text(`tree cover lost per year in the three hill districts, ${Math.round(d3.sum(tot, d => d.v))} km² in total`);
}
// ---- climate: temperature, rain, sea level (data/climate.json, data/sealevel.json; see make_climate.py) ----
function climateCharts(D) { if (D.climate) { tempChart(D.climate); rainChart(D.climate); } if (D.sea) seaChart(D.sea); }
function tempChart(cl) {
  const n = cl.national; const { svg, w, none } = svgIn("chTemp", 190); if (none) return;
  const x = d3.scaleLinear().domain([1900, 2023]).range([34, w - 10]); const y = d3.scaleLinear().domain([-1.0, 1.4]).range([140, 12]);
  const g = svg.append("g");
  [-0.5, 0, 0.5, 1].forEach(v => { g.append("line").attr("x1", 34).attr("x2", w - 10).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", v === 0 ? C.dim : C.grid); g.append("text").attr("x", 30).attr("y", y(v) + 3).attr("text-anchor", "end").attr("fill", C.dim).attr("font-size", 9.5).attr("font-family", MONO).text((v > 0 ? "+" : "") + v.toFixed(1)); });
  const bw = Math.max(1.5, (x(1902) - x(1901)) - 0.6);
  n.cru.forEach(d => { if (d.a == null) return; g.append("rect").attr("x", x(d.y) - bw / 2).attr("y", Math.min(y(0), y(d.a))).attr("width", bw).attr("height", Math.abs(y(d.a) - y(0))).attr("fill", d.a >= 0 ? C.red : C.water).attr("opacity", .75); });
  const line = n.bmd24.filter(d => d.a != null);
  g.append("path").attr("d", d3.line().x(d => x(d.y)).y(d => y(d.a)).curve(d3.curveMonotoneX)(line)).attr("fill", "none").attr("stroke", C.amber).attr("stroke-width", 2);
  const last = line[line.length - 1]; g.append("text").attr("x", w - 10).attr("y", y(last.a) - 10).attr("text-anchor", "end").attr("fill", C.amber).attr("font-size", 10.5).attr("font-weight", 600).text(`BMD 24 stations, +${n.trend_bmd_c_per_decade.toFixed(2)} °C a decade`);
  g.append("text").attr("x", 36).attr("y", y(1.3)).attr("fill", C.dim).attr("font-size", 10.5).text("CRU country mean 1901–2011, +" + n.trend_cru_1981_2011_c_per_decade.toFixed(2) + " °C a decade since 1981");
  [1900, 1925, 1950, 1975, 2000, 2022].forEach(v => g.append("text").attr("x", x(v)).attr("y", 156).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).attr("font-family", MONO).text(v));
  g.append("text").attr("x", 34).attr("y", 176).attr("fill", C.dim).attr("font-size", 10.5).text(`annual mean temperature against 1961–1990 (${n.baseline_1961_1990_c.toFixed(1)} °C), °C`);
  const src = document.getElementById("srcTemp"); if (src) src.textContent = "Bars: World Bank CCKP / CRU TS country series 1901–2011. Line: Bangladesh Meteorological Department, 24 quality-controlled stations 1982–2022, aligned on the common years. Two station sets, one direction.";
}
function rainChart(cl) {
  const { svg, w, none } = svgIn("chRain", 170); if (none) return; const M = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const x = d3.scaleBand().domain(d3.range(1, 13)).range([34, w - 10]).padding(.18); const y = d3.scaleLinear().domain([0, d3.max(cl.monthly, d => d.rain) * 1.15]).range([118, 12]);
  const g = svg.append("g");
  cl.monthly.forEach(d => { const mon = d.m >= 6 && d.m <= 9; g.append("rect").attr("x", x(d.m)).attr("y", y(d.rain)).attr("width", x.bandwidth()).attr("height", 118 - y(d.rain)).attr("fill", mon ? C.water : "#2d3a46");
    if (d.rain > 60) g.append("text").attr("x", x(d.m) + x.bandwidth() / 2).attr("y", y(d.rain) - 4).attr("text-anchor", "middle").attr("fill", mon ? C.ink : C.dim).attr("font-size", 10).attr("font-family", MONO).text(d.rain);
    g.append("text").attr("x", x(d.m) + x.bandwidth() / 2).attr("y", 132).attr("text-anchor", "middle").attr("fill", mon ? C.ink : C.dim).attr("font-size", 10.5).attr("font-family", MONO).text(M[d.m - 1]); });
  g.append("text").attr("x", 34).attr("y", 10).attr("fill", C.water).attr("font-size", 11).attr("font-weight", 600).text(`June to September: ${cl.monsoon_share_pct}% of the year's ${fmt(cl.annual_station_rain_mm)} mm`);
  g.append("text").attr("x", 34).attr("y", 156).attr("fill", C.dim).attr("font-size", 10.5).text("mean monthly rainfall at a BMD station, mm, 33 stations 1948–2013");
  const src = document.getElementById("srcRain"); if (src) src.textContent = "Bangladesh Meteorological Department monthly records, 33 stations 1948–2013 (Gauhar et al. 2021 compilation). Columns on the relief: mean annual rainfall at each station.";
}
function seaChart(sea) {
  const rows = sea.gauges.filter(g => g.series.length >= 8); const rh = 34, { svg, w, none } = svgIn("chSea", rows.length * rh + 58); if (none) return;
  const x = d3.scaleLinear().domain([1975, 2020]).range([108, w - 72]);
  const g = svg.append("g");
  [1980, 1990, 2000, 2010].forEach(v => { g.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", 4).attr("y2", rows.length * rh).attr("stroke", C.grid); g.append("text").attr("x", x(v)).attr("y", rows.length * rh + 14).attr("text-anchor", "middle").attr("fill", C.dim).attr("font-size", 10).attr("font-family", MONO).text(v); });
  rows.forEach((r, i) => { const y0 = i * rh + rh / 2; const ext = d3.extent(r.series, d => d[1]); const span = Math.max(200, ext[1] - ext[0]); const y = d3.scaleLinear().domain([ext[0], ext[0] + span]).range([y0 + 12, y0 - 12]);
    g.append("text").attr("x", 100).attr("y", y0 + 4).attr("text-anchor", "end").attr("fill", C.ink).attr("font-size", 11).text(r.name.replace(" (India)", ", IN"));
    g.append("path").attr("d", d3.line().x(d => x(d[0])).y(d => y(d[1]))(r.series)).attr("fill", "none").attr("stroke", C.cyan).attr("stroke-width", 1.6);
    if (r.trend_mm_yr != null) { const xs = r.series.map(d => d[0]), ys = r.series.map(d => d[1]); const m = r.trend_mm_yr, b = d3.mean(ys) - m * d3.mean(xs);
      g.append("line").attr("x1", x(r.years[0])).attr("x2", x(r.years[1])).attr("y1", y(m * r.years[0] + b)).attr("y2", y(m * r.years[1] + b)).attr("stroke", C.amber).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");
      g.append("text").attr("x", w - 66).attr("y", y0 + 4).attr("fill", C.amber).attr("font-size", 11).attr("font-family", MONO).text((m > 0 ? "+" : "") + m.toFixed(1) + " mm/yr"); }
    else g.append("text").attr("x", w - 66).attr("y", y0 + 4).attr("fill", C.dim).attr("font-size", 10.5).text("too short");
  });
  g.append("text").attr("x", 0).attr("y", rows.length * rh + 34).attr("fill", C.dim).attr("font-size", 10.5).text(`relative sea level at each tide gauge (PSMSL); global mean +${sea.gmsl_trend_1993_2019_mm_yr.toFixed(1)} mm/yr since 1993`);
  g.append("text").attr("x", 0).attr("y", rows.length * rh + 50).attr("fill", C.dim).attr("font-size", 10.5).text("relative = the water rising plus the ground sinking under the gauge");
  const src = document.getElementById("srcSea"); if (src) src.textContent = "PSMSL annual RLR, Bay of Bengal gauges (Holgate et al. 2013). The Bangladesh gauges stop in 2000–2003 and Khepupara carries a datum problem, so its number is the noisiest. CSIRO reconstruction for the global mean.";
}
let seaBound = false;
export const charts = {
  init(D) {
    const expo = D.expo, stormsJson = D.storms, cs = D.coverStats;
    const all = () => { sediment(); subsidence(); floods(); deaths(); exposureChart(expo); coverChart(cs); lossChart(cs); climateCharts(D); };
    all();
    document.getElementById("numSund").textContent = fmt(cs.sundarbans_km2);
    document.getElementById("numHak").textContent = fmt(cs.hakaluki_km2); document.getElementById("numTan").textContent = fmt(cs.tanguar_km2);
    document.getElementById("numLow10").textContent = f1(expo.area_km2[expo.steps_m.indexOf(10)] / expo.land_total_km2 * 100) + "%";
    document.getElementById("numLow5").textContent = f1(expo.area_km2[expo.steps_m.indexOf(5)] / expo.land_total_km2 * 100) + "%";
    document.getElementById("numPeople10").textContent = f1(expo.people[expo.steps_m.indexOf(10)] / 1e6) + " million";
    document.getElementById("numStorms").textContent = stormsJson.length;
    addEventListener("resize", all);
  },
  bindSea(uniform, expo, target, set = v => { uniform.value = v; }) {
    const r = document.getElementById("seaRange"), out = document.getElementById("seaOut"), ppl = document.getElementById("seaPeople"), area = document.getElementById("seaArea");
    const lookup = v => { const i = Math.min(expo.steps_m.length - 1, Math.round(v / 0.25)); return { p: expo.people[i], a: expo.area_km2[i] }; };
    const show = v => { const k = lookup(v); out.textContent = v.toFixed(2) + " m"; ppl.textContent = f1(k.p / 1e6) + " M"; area.textContent = fmt(k.a) + " km²"; };
    if (!seaBound) { seaBound = true; r.addEventListener("input", e => { set(+e.target.value); show(+e.target.value); }); }
    r.value = target.toFixed(2); show(+r.value);
  },
};
