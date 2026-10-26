// charts.js  --  the small D3 figures that live inside the step cards, plus the sea-level slider and the storm clock.
const fmt = d3.format(","), f1 = d3.format(".1f");
const C = { silt: "#c88a3c", ink: "#efe9dc", dim: "#8d877b", water: "#5fa8c2", red: "#ff5a3c", amber: "#f2c35a", grid: "#2b2f35" };

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

function svgIn(id, h) { const el = document.getElementById(id); el.innerHTML = ""; const w = el.clientWidth || 330; return { svg: d3.select(el).append("svg").attr("width", w).attr("height", h), w }; }

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
let seaBound = false, stormTimer = null;
export const charts = {
  init(expo, stormsJson, cs) {
    sediment(); subsidence(); floods(); deaths(); exposureChart(expo); coverChart(cs); lossChart(cs);
    document.getElementById("numSund").textContent = fmt(cs.sundarbans_km2);
    document.getElementById("numHak").textContent = fmt(cs.hakaluki_km2); document.getElementById("numTan").textContent = fmt(cs.tanguar_km2);
    document.getElementById("numLow10").textContent = f1(expo.area_km2[expo.steps_m.indexOf(10)] / expo.land_total_km2 * 100) + "%";
    document.getElementById("numLow5").textContent = f1(expo.area_km2[expo.steps_m.indexOf(5)] / expo.land_total_km2 * 100) + "%";
    document.getElementById("numPeople10").textContent = f1(expo.people[expo.steps_m.indexOf(10)] / 1e6) + " million";
    document.getElementById("numStorms").textContent = stormsJson.length;
    addEventListener("resize", () => { sediment(); subsidence(); floods(); deaths(); exposureChart(expo); coverChart(cs); lossChart(cs); });
  },
  bindSea(uniform, expo, target, set = v => { uniform.value = v; }) {
    const r = document.getElementById("seaRange"), out = document.getElementById("seaOut"), ppl = document.getElementById("seaPeople"), area = document.getElementById("seaArea");
    const lookup = v => { const i = Math.min(expo.steps_m.length - 1, Math.round(v / 0.25)); return { p: expo.people[i], a: expo.area_km2[i] }; };
    const show = v => { const k = lookup(v); out.textContent = v.toFixed(2) + " m"; ppl.textContent = f1(k.p / 1e6) + " M"; area.textContent = fmt(k.a) + " km²"; };
    if (!seaBound) { seaBound = true; r.addEventListener("input", e => { set(+e.target.value); show(+e.target.value); }); }
    r.value = target.toFixed(2); show(+r.value);
  },
  playStorms(group, state) {
    // the storm clock: reveal tracks year by year, 1960 to 2025
    this.stopStorms(); let yr = 1960; const el = document.getElementById("stormYear");
    stormTimer = setInterval(() => { yr += 1; if (yr > 2025) { clearInterval(stormTimer); stormTimer = null; return; }
      el.textContent = yr; group.children.forEach(o => { const s = o.userData; if (s.season > yr) return; const marker = o.name.startsWith("ring-") || o.name.startsWith("lab-"); o.material.opacity = marker ? 0.95 : (s.note ? 0.75 : 0.35); }); }, 110);
  },
  stopStorms() { if (stormTimer) { clearInterval(stormTimer); stormTimer = null; } document.getElementById("stormYear").textContent = "1960–2025"; }
};
