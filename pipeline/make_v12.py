"""make_v12.py  --  v12: jute by district, the crop calendar, tea gardens and the Sundarbans.  -> data/v12.json

Jute: BBS, 45 Years Agriculture Statistics of Major Crops, Table 2.14, 2014-15, district production. The table heads the
column "Production M tons", but its national total (7,501,011) and the area (1,662,100 acres) match jute in bales:
7.5 million bales of 181.4 kg (400 lb) is 1.36 million tonnes, which is the order of the national jute crop. The script
checks that the 64 districts add up to the printed national total, and converts bales to tonnes at 181.4 kg.
Calendar: Banglapedia, Agricultural Produce (aus, aman, boro, jute months), Potato (planting and harvest), Crop (Rabi crops
do better sown after 1 November; seasons), Wheat (100 to 120 days from sowing to harvest).
Tea: gardens by district from the Bangladesh Tea Board as reported by The Daily Star (National Tea Day 2024); output by year
from the Tea Board via The Daily Star (2025 and 2026 reports); northern plains from Prothom Alo (7 Mar 2026).
Sundarbans: WorldCover 2021 mangrove extent (class 95, gaps under 400 m closed); facts from Mongabay (17 Oct 2024, tiger
survey); fish caught in the Sundarbans from the DoF yearbooks (Rabbi 2026).
"""
import json, pathlib, re
import pandas as pd
from shapely.geometry import shape

ROOT = pathlib.Path(__file__).resolve().parents[1]; RAW = ROOT / "raw"
import importlib.util
spec = importlib.util.spec_from_file_location("ag", ROOT / "pipeline/make_agri.py")
# reuse the district-name matcher from make_agri without running it
src = (ROOT / "pipeline/make_agri.py").read_text(); head = src[:src.index("# ---- crops")]
ns = {"__file__": str(ROOT / "pipeline/make_agri.py")}; exec(head, ns); match = ns["match"]

# ---------------------------------------------------------------- jute, 2014-15 (bales)
rows = pd.read_excel(RAW / "agri_bbs_major_crops/jute.xlsx", header=None).values.tolist()
start = next(i for i, r in enumerate(rows) if str(r[0]).strip() == "Table:2.14")
jute, nat = {}, None
for r in rows[start:]:
    code = r[0]
    if isinstance(code, (int, float)) and not pd.isna(code) and 1 <= code <= 64 and isinstance(r[1], str):
        n = match(r[1].replace(" Region", "")) if "Tangail" in r[1] else match(r[1])
        if n and not pd.isna(r[7]): jute[n] = float(r[7])
    if isinstance(r[7], (int, float)) and not pd.isna(r[7]) and r[7] > 7e6: nat = float(r[7])
assert len(jute) == 64, len(jute)
s = sum(jute.values()); assert abs(s / nat - 1) < 0.001, (s, nat)
print(f"jute 2014-15: 64 districts, {s:,.0f} bales = national {nat:,.0f}")
BALE_T = 0.1814
jute_t = {k: round(v * BALE_T) for k, v in jute.items()}

# ---------------------------------------------------------------- crop calendar (months 1..12; a span may wrap the year)
calendar = [
    {"crop": "boro", "name": "Boro rice", "field": [11, 4], "sow": "transplanted November to December", "harvest": "March to April", "season": "Rabi, irrigated"},
    {"crop": "wheat", "name": "Wheat", "field": [11, 3], "sow": "sown from November", "harvest": "100 to 120 days later", "season": "Rabi"},
    {"crop": "potato", "name": "Potato", "field": [11, 3], "sow": "planted in the first half of November", "harvest": "February to March", "season": "Rabi"},
    {"crop": "jute", "name": "Jute", "field": [3, 9], "sow": "sown March to May", "harvest": "July to September", "season": "Kharif"},
    {"crop": "aus", "name": "Aus rice", "field": [4, 8], "sow": "transplanted April to May", "harvest": "July to August", "season": "Kharif-1"},
    {"crop": "aman", "name": "Aman rice", "field": [7, 1], "sow": "transplanted July to August", "harvest": "November to January", "season": "Kharif-2"},
]
seasons = [{"name": "Rabi", "from": 11, "to": 4, "text": "dry winter, November to April"},
           {"name": "Kharif-1", "from": 3, "to": 6, "text": "hot pre-monsoon, March to June"},
           {"name": "Kharif-2", "from": 7, "to": 10, "text": "monsoon, July to October"}]

# ---------------------------------------------------------------- tea
tea = {
    "gardens": [["Moulvibazar", 91], ["Habiganj", 25], ["Chattogram", 22], ["Sylhet", 19], ["Panchagarh", 8], ["Rangamati", 2], ["Khagrachhari", 1], ["Thakurgaon", 1]],
    "gardens_src": "Bangladesh Tea Board, as reported by The Daily Star, Seven unique facts about tea culture in Bangladesh (National Tea Day, 2024).",
    "output": [[2023, 102.92], [2024, 93.04], [2025, 94.91]],
    "output_src": "Bangladesh Tea Board via The Daily Star: record 102.92 million kg in 2023; 94.91 million kg in 2025, up 2.01% on 2024.",
    "north": [[2021, 14.54], [2022, 17.76], [2023, 17.95], [2024, 14.39], [2025, 20.24]],
    "north_src": "Prothom Alo, 7 Mar 2026: the plains of Panchagarh, Thakurgaon, Dinajpur, Nilphamari and Lalmonirhat, 12 registered large estates and 2,225 registered small gardens, 11,527 acres in 2024.",
    "facts": [["Gardens", "169"], ["Land in the gardens", "over 280,000 acres"], ["Moulvibazar's share of output", "about 55%"], ["Habiganj's share", "about 22%"], ["Plucking begins", "mid-March"]],
    "first": "Commercial tea in Bangladesh began in 1857 at Malnicherra, Sylhet; the first known planting was in 1843 in Chattogram, beside the Karnaphuli.",
}
for n, _ in tea["gardens"]: assert match(n), n

# ---------------------------------------------------------------- Sundarbans
g = json.load(open(RAW / "mangroves_worldcover2021_derived/sundarbans_mangrove_extent_closed400m.geojson"))
geom = shape(g["features"][0]["geometry"]).simplify(0.006, preserve_topology=True)
polys = []
for q in (geom.geoms if hasattr(geom, "geoms") else [geom]):
    if q.area * 111 * 104 < 2: continue
    polys.append({"o": [[round(x, 3), round(y, 3)] for x, y in q.exterior.coords], "h": [[[round(x, 3), round(y, 3)] for x, y in i.coords] for i in q.interiors if i.area * 111 * 104 > 3]})
dw = pd.read_csv(RAW / "fish_dof_yearbooks/district_waterbody.csv")
sf = dw[dw.waterbody == "Sundarbans"].groupby("fiscal_year").production_t.sum().round().astype(int)
sund = {
    "poly": polys, "mangrove_km2": round(g["features"][0]["properties"]["area_km2"]),
    "facts": [["Sundarbans in Bangladesh", "6,017 km²"], ["the whole forest, with India", "10,277 km²"], ["mangrove land on the map (WorldCover 2021)", f"{round(g['features'][0]['properties']['area_km2']):,} km²"],
              ["plant species", "about 330"], ["fish species", "about 400"], ["bird species", "about 300"], ["mammal species", "42"], ["reptile species", "35"]],
    "tigers": [[2015, 106], [2018, 114], [2024, 125]],
    "tiger_note": "The 2024 survey: 1,210 cameras at 605 places over 2,240 km² (about half the forest), and pugmarks along 1,306 km of rivers and canals, January 2023 to March 2024. 84 adults were identified individually. Density 2.64 tigers per 100 km².",
    "src": "Forest Department tiger survey as reported by Mongabay, 17 Oct 2024; mangrove extent from ESA WorldCover 2021.",
    "fish": [[y, int(v)] for y, v in sf.items()], "fish_src": "Department of Fisheries yearbooks (Rabbi 2026): fish caught in the Sundarbans, tonnes.",
    "storms": ["Sidr", "Aila", "Bulbul", "Amphan", "Yaas", "Remal"],
}

out = {"jute": jute_t, "jute_bales": {k: round(v) for k, v in jute.items()}, "jute_year": "2014-15", "jute_nat_bales": round(nat),
       "jute_src": "BBS, 45 Years Agriculture Statistics of Major Crops, Table 2.14 (2014-15). Printed in bales (the column head says tonnes, but the totals are bales); converted at 181.4 kg a bale.",
       "calendar": calendar, "seasons": seasons,
       "cal_src": "Banglapedia: Agricultural Produce (aus, aman, boro and jute months), Potato, Crop and Wheat. Wheat's harvest is placed 100 to 120 days after a November sowing.",
       "tea": tea, "sund": sund}
p = ROOT / "data/v12.json"; p.write_text(json.dumps(out, separators=(",", ":")))
print(len(polys), "Sundarbans polygons;", round(p.stat().st_size / 1024), "KB")
