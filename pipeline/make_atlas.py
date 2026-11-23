"""make_atlas.py: raw -> data/atlas.json, the figures behind the Rivers, Fish and Hazards sections.
- river junctions: where the big rivers meet, with each river's mean flow read from the HydroRIVERS reaches nearby
- flood gauges: FFWC danger levels and record peaks (Annual Flood Report 2021), placed with BWDB station coordinates
- flood extent by year (FFWC), riverbank and coastal erosion (CEGIS and cited studies, see notes/facts.csv)
- hilsa sanctuaries, hilsa production, the Halda's egg harvests and the sea fishing grounds (cited per item)
Hand-entered figures carry their source in the output. Run from the repository root: python pipeline/make_atlas.py"""
import json, math, re, difflib, pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, DATA = ROOT / "raw", ROOT / "data"
km = lambda a, b: math.hypot((a[0] - b[0]) * 102.0, (a[1] - b[1]) * 111.3)

# ---- junctions ------------------------------------------------------------------------------------------
riv = json.load(open(DATA / "rivers.json"))
def flows_near(lon, lat, r=18):
    near = {}
    for l in riv["major"]:
        if not l.get("name"): continue
        if any(km(c, (lon, lat)) < r for c in l["c"]): near[l["name"]] = max(near.get(l["name"], 0), l["dis"])
    return near
JUNCTIONS = [
    {"id": "goalundo", "name": "Goalundo", "lon": 89.75, "lat": 23.80, "joins": ["Ganges", "Jamuna"], "becomes": "Padma", "gauge": "Goalundo",
     "note": "The Ganges and the Jamuna (Brahmaputra) meet near Goalundo and Aricha and flow on as the Padma."},
    {"id": "chandpur", "name": "Chandpur", "lon": 90.63, "lat": 23.22, "joins": ["Padma", "Meghna"], "becomes": "Lower Meghna", "gauge": "Chandpur",
     "note": "The Padma meets the Meghna at Chandpur; the combined river, the Lower Meghna, carries the delta's water to the Bay."},
    {"id": "bhairab", "name": "Bhairab", "lon": 90.98, "lat": 24.05, "joins": ["Old Brahmaputra", "Upper Meghna"], "becomes": "Upper Meghna", "gauge": "Bhairab Bazar",
     "note": "The Old Brahmaputra, the river's course before it moved west to the Jamuna, joins the Meghna at Bhairab."},
    {"id": "chilmari", "name": "Chilmari", "lon": 89.70, "lat": 25.55, "joins": ["Teesta", "Brahmaputra"], "becomes": "Jamuna", "gauge": "Chilmari",
     "note": "The Teesta joins the Brahmaputra near Chilmari, below which the river is called the Jamuna."},
    {"id": "markuli", "name": "Markuli", "lon": 91.25, "lat": 24.55, "joins": ["Surma", "Kushiyara"], "becomes": "Meghna", "gauge": "Markuli",
     "note": "The Surma and the Kushiyara, the two rivers of the Sylhet basin, come together near Markuli and Ajmiriganj as the Meghna."},
    {"id": "agunmukha", "name": "Agunmukha", "lon": 90.42, "lat": 21.98, "joins": [], "becomes": "Bay of Bengal", "gauge": None,
     "note": "Agunmukha in Patuakhali is a wide river mouth where several tidal channels meet before the Bay."},
]
for j in JUNCTIONS:
    near = flows_near(j["lon"], j["lat"])
    if any(r not in near for r in j["joins"] + [j["becomes"]]): near = {**flows_near(j["lon"], j["lat"], 45), **near}   # small rivers: look a little further
    j["flows"] = {k: round(v) for k, v in sorted(near.items(), key=lambda kv: -kv[1]) if k in j["joins"] + [j["becomes"]]}

# ---- flood gauges ---------------------------------------------------------------------------------------
dl = pd.read_csv(RAW / "ffwc_annual2021" / "danger_levels.csv")
st = json.load(open(RAW / "bwdb_wl_stations" / "stations.geojson"))["features"]
norm = lambda s: re.sub(r"[^a-z]", "", s.lower()).replace("rlybridge", "railbridge").replace("rly", "rail")
ALIAS = {"bogra": "bogura", "serajgonj": "sirajganj", "sunamgonj": "sunamganj", "comilla": "comilla", "barisal": "barisal", "bbaria": "brahmanbaria", "sureswar": "sureshwar",
         "gursingra": "singra", "chapainawabganj": "chapainawabganj", "jhikorgacha": "jhikargacha", "manurailbridge": "manurelpur", "mohadebpur": "mohadavpur"}
names = {}
for f in st:
    p = f["properties"]; names.setdefault(norm(p["Station Na"]), []).append(p)
gauges, missing = [], []
for _, r in dl.iterrows():
    k = ALIAS.get(norm(r.station), norm(r.station)); cand = names.get(k)
    if not cand:
        m = difflib.get_close_matches(k, names.keys(), n=1, cutoff=0.82); cand = names.get(m[0]) if m else None
    if not cand: missing.append(r.station); continue
    # several stations can share a name (different rivers): prefer the one on the same river
    pick = next((c for c in cand if r.river.lower().split()[0][:4] in c["River Name"].lower()), cand[0])
    gauges.append({"name": r.station, "river": r.river, "lon": round(pick["Longitude"], 4), "lat": round(pick["Latitude"], 4), "id": pick["Station ID"],
                   "danger": r.danger_level_m, "record": r.highest_recorded_m, "peak2021": r.peak_2021_m, "over": round(r.highest_recorded_m - r.danger_level_m, 2)})
print(f"gauges placed: {len(gauges)} of {len(dl)}; not found: {missing}")
fx = pd.read_csv(RAW / "ffwc_annual2021" / "flood_extent.csv")

# ---- erosion, fish: cited figures ------------------------------------------------------------------------
EROSION = {
    "rivers": [{"river": "Jamuna", "eroded_ha": 94220, "regained_ha": 14955}, {"river": "Padma", "eroded_ha": 33843}, {"river": "Ganges", "eroded_ha": 30290}],
    "total_ha": 158353, "period": "1973-2025", "year2025": {"Ganges": 593, "Jamuna": 348, "Padma": 93}, "forecast2026_ha": 915,
    "src": "CEGIS, reported by OdishaBytes, 'Rivers swallow land five times the size of Dhaka in five decades' (2025)",
    "coast": [
        {"name": "Hatiya", "lon": 91.10, "lat": 22.30, "text": "86.0 km² eroded and 32.6 km² gained, 1989-2021: a net loss of 53.4 km²", "src": "Decadal-scale shore morphological changes of Hatiya Island"},
        {"name": "Bhola", "lon": 90.75, "lat": 22.45, "text": "Shoreline retreating by up to 120 m a year, 1989-2009", "src": "Sarwar & Woodroffe 2013"},
        {"name": "Sandwip", "lon": 91.45, "lat": 22.50, "text": "480 km² in 1780, 290 km² in 1979", "src": "IGI Global, Coastline change of Sandwip Island"},
        {"name": "Sundarbans edge", "lon": 89.45, "lat": 21.75, "text": "Seaward margin retreating by up to 20 m a year, 1989-2009", "src": "Sarwar & Woodroffe 2013"},
        {"name": "Noakhali-Feni coast", "lon": 91.30, "lat": 22.70, "text": "Gaining land by more than 600 m a year, 1989-2009", "src": "Sarwar & Woodroffe 2013"}],
    "people": "About one million people are directly affected by riverbank erosion each year (Banglapedia, Riverbank Erosion)."}
FISH = {
    "sanctuaries": [   # course drawn through the named end points; approximate
        {"name": "Shatnol to Char Alexander", "river": "Lower Meghna", "districts": "Chandpur, Lakshmipur", "km": 100, "ban": "March to April",
         "path": [[90.62, 23.37], [90.64, 23.22], [90.62, 23.05], [90.72, 22.86], [90.86, 22.68], [90.95, 22.56]]},
        {"name": "Madanpur and Char Ilisha to Char Pial", "river": "Shahbazpur", "districts": "Bhola", "km": 90, "ban": "March to April",
         "path": [[90.62, 22.78], [90.70, 22.58], [90.75, 22.40], [90.78, 22.12]]},
        {"name": "Bheduria to Char Rustam", "river": "Tentulia", "districts": "Bhola, Patuakhali", "km": 100, "ban": "March to April",
         "path": [[90.58, 22.62], [90.50, 22.42], [90.45, 22.22], [90.40, 22.04]]},
        {"name": "Andharmanik river", "river": "Andharmanik", "districts": "Patuakhali (Kalapara)", "km": 40, "ban": "November to January",
         "path": [[90.28, 22.02], [90.20, 21.93], [90.14, 21.86]]},
        {"name": "Lower Padma at Shariatpur", "river": "Padma", "districts": "Shariatpur", "km": 20, "ban": "March to April",
         "path": [[90.40, 23.34], [90.48, 23.30], [90.56, 23.25]]},
        {"name": "Hizla to Mehendiganj", "river": "Meghna", "districts": "Barishal", "km": 83, "ban": "March to April",
         "path": [[90.50, 23.05], [90.52, 22.90], [90.55, 22.75]]}],
    "sanct_src": "Department of Fisheries sanctuaries as listed in 'The Premium of Hilsa Sanctuary', Sustainability 14(13):7782 (2022), Table 1",
    "hilsa": [{"year": "2008-09", "t": 298000}, {"year": "2020-21", "t": 565000}, {"year": "2021-22", "t": 567000}, {"year": "2022-23", "t": 571000}, {"year": "2023-24", "t": 529000}, {"year": "2024-25", "t": 500000, "approx": True}],
    "hilsa_src": "Department of Fisheries, via TBS News (2023, 2025); 2024-25 approximate",
    "hilsa_note": "Hilsa makes up about 60% of the sea catch and 40% of the inland catch (Banglapedia, Fisheries).",
    "halda": {"path": [[91.71, 22.93], [91.76, 22.80], [91.78, 22.69], [91.82, 22.58], [91.84, 22.50], [91.87, 22.44], [91.89, 22.39]],
              "km": 98, "eggs": [{"year": 2020, "kg": 25536}, {"year": 2021, "kg": 8500}, {"year": 2022, "kg": 6500}, {"year": 2023, "kg": 14664}, {"year": 2024, "kg": 1680}],
              "spawn": "Brood carp spawn between Madunaghat and Sattarghat, in Raozan and Hathazari.",
              "src": "Department of Fisheries figures via The Daily Star (2025) and TBS News (2023); course drawn through towns on the river, approximate"},
    "grounds": [   # extents as Banglapedia gives them
        {"name": "Swatch of No Ground", "box": [89.4, 21.0, 90.0, 21.67], "km2": 3800},
        {"name": "Middle Ground", "box": [90.0, 20.83, 91.0, 21.33], "km2": 4600},
        {"name": "South Patches", "box": [91.0, 20.83, 91.7, 21.67], "km2": 6200}],
    "grounds_src": "Banglapedia, Fisheries: the three main fishing grounds of the Bay, with their extents and areas (extents approximate)"}
out = {"junctions": JUNCTIONS, "gauges": gauges, "flood_extent": fx.to_dict("records"),
       "flood_src": "FFWC Annual Flood Report 2021 (danger levels, record peaks, flood-affected area by year); station positions BWDB",
       "erosion": EROSION, "fish": FISH}
json.dump(out, open(DATA / "atlas.json", "w"), separators=(",", ":"))
print("junction flows:", {j["name"]: j["flows"] for j in JUNCTIONS})
print("wrote data/atlas.json", (DATA / "atlas.json").stat().st_size, "bytes")
