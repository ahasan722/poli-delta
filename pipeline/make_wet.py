"""make_wet.py  --  v11: wetlands (haors and beels), migratory waterbirds, fish production by district.

Inputs
  raw/haors_dbhwd2016/haors_by_upazila.csv   373 haors by upazila with area (DBHWD, Classification of Wetlands of
                                             Bangladesh, Vol 3 Annexure 2, 2016, after the BHWDB Haor Master Plan 2012).
                                             Upazila sums were checked against the printed upazila totals.
  raw/admin_upazilas_geoboundaries/upazilas.geojson   geoBoundaries gbOpen ADM3 (CC BY 4.0), for placing haors.
  raw/wetlands_haor_aburaihan21/*            ESA WorldCover 2021 water + herbaceous wetland (270 m), Hakaluki and Tanguar outlines.
  raw/fish_dof_yearbooks/district_waterbody.csv, sector_production.csv, species_national.csv
                                             Rabbi (2026), harmonised from 23 DoF yearbooks, CC BY 4.0.
Output
  data/wet.json
"""
import json, math, pathlib, re
import pandas as pd
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"

# ---------------------------------------------------------------- upazilas
U = json.load(open(RAW / "admin_upazilas_geoboundaries/upazilas.geojson"))
upa = {}
for f in U["features"]:
    p = f["properties"]; key = (p["district_name"].lower(), p["name"].lower().replace(" upazilla", "").replace(" upazila", ""))
    upa[key] = shape(f["geometry"]).buffer(0)
DIST_ALIAS = {"moulvibazar": "maulvibazar", "netrakona": "netrokona", "sirajganj": "sirajgonj"}
UPA_ALIAS = {  # DBHWD spelling -> geoBoundaries spelling (2020 units: Dakshin Sunamganj and Juri were carved out later)
    "dakshin sunamganj": ["south sunamganj", "dakshin sunamganj", "sunamganj sadar"], "juri": ["juri", "kulaura"],
    "dowarabazar": ["dowarabazar", "dowarabazar", "doarabazar"], "dharampasha": ["dharampasha", "dharmapasha"],
    "beani bazar": ["beanibazar", "beani bazar"], "companiganj": ["companiganj"], "dakshin surma": ["dakshin surma", "south surma"],
    "baniachong": ["baniachong", "baniachang"], "sreemangal": ["sreemangal", "srimangal"], "maulvibazar sadar": ["maulvi bazar sadar", "moulvibazar sadar"], "raiganj": ["raiganj", "royganj", "rayganj"], "golapganj": ["golapganj", "golabganj"], "kuliarchar": ["kuliarchar", "kuliar char"], "sirajdikhan": ["serajdikhan", "sirajdikhan"],
    "atpara": ["atpara"], "mithamain": ["mithamain", "mithamoin"], "austagram": ["austagram", "astagram"], "tarail": ["tarail"],
    "kishoreganj sadar": ["kishoreganj sadar"], "brahmanbaria sadar": ["brahmanbaria sadar"], "habiganj sadar": ["habiganj sadar"],
    "sunamganj sadar": ["sunamganj sadar"], "sylhet sadar": ["sylhet sadar"], "balaganj": ["balaganj"], "khaliajuri": ["khaliajuri"],
    "madan": ["madan"], "zakiganj": ["zakiganj"], "jaintiapur": ["jaintiapur"], "gowainghat": ["gowainghat", "gowainghat"],
}
def find_upa(district, upazila):
    d = DIST_ALIAS.get(district.lower(), district.lower())
    for name in UPA_ALIAS.get(upazila.lower(), [upazila.lower()]):
        for (dd, uu), g in upa.items():
            if dd == d and (uu == name or uu.replace(" ", "") == name.replace(" ", "")): return g
    for name in UPA_ALIAS.get(upazila.lower(), [upazila.lower()]):   # some units carry no district name
        for (dd, uu), g in upa.items():
            if uu.replace(" ", "") == name.replace(" ", ""): return g
    # last resort: fuzzy within the district
    for (dd, uu), g in upa.items():
        if dd == d and (uu[:5] == upazila.lower()[:5]): return g
    raise KeyError((district, upazila))

# ---------------------------------------------------------------- wet ground
def load_polys(p):
    g = json.load(open(p)); return [shape(f["geometry"]).buffer(0) for f in g["features"]]
wet_basin = load_polys(RAW / "wetlands_haor_aburaihan21/haor_basin_water_wetland_worldcover2021_270m.geojson")
wet_nat = load_polys(RAW / "wetlands_haor_aburaihan21/herbaceous_wetland_class90_national_worldcover2021_270m.geojson")
wet = unary_union(wet_basin + wet_nat)
outl = {f["properties"]["name"]: shape(f["geometry"]) for f in json.load(open(RAW / "wetlands_haor_aburaihan21/haor_hakaluki_tanguar.geojson"))["features"]}

KM_LAT = 110.57
def km_lon(lat): return 111.32 * math.cos(math.radians(lat))
def dist_km(a, b): return math.hypot((a[0] - b[0]) * km_lon((a[1] + b[1]) / 2), (a[1] - b[1]) * KM_LAT)

# ---------------------------------------------------------------- haors
H = pd.read_csv(RAW / "haors_dbhwd2016/haors_by_upazila.csv")
H["area_ha"] = pd.to_numeric(H["area_ha"], errors="coerce").fillna(0)
H["name"] = H["haor_name"].str.replace(r"\s+", " ", regex=True).str.strip()
# placing: inside each upazila, the haors (largest first) go on wet ground, spread apart
pos_part = {}
for (dist, up), grp in H.groupby(["district", "upazila"]):
    poly = find_upa(dist, up); pp = prep(poly)
    w = poly.intersection(wet)
    minx, miny, maxx, maxy = poly.bounds; step = 0.012
    cand = []
    y = miny
    while y <= maxy:
        x = minx
        while x <= maxx:
            pt = Point(x, y)
            if pp.contains(pt): cand.append((x, y, 1 if w.contains(pt) else 0))
            x += step
        y += step
    wetc = [c for c in cand if c[2]] or cand
    rp = (w if not w.is_empty and w.area > 0 else poly).representative_point(); anchor = (rp.x, rp.y)
    placed = []
    for _, r in grp.sort_values("area_ha", ascending=False).iterrows():
        if not placed: best = min(wetc, key=lambda c: dist_km(c, anchor))
        else: best = max(wetc, key=lambda c: min(dist_km(c, q) for q in placed) - 0.15 * dist_km(c, anchor))
        placed.append(best[:2]); pos_part[r.name] = best[:2]
H["lon"] = [pos_part[i][0] for i in H.index]; H["lat"] = [pos_part[i][1] for i in H.index]

# one haor = parts with the same name in neighbouring upazilas (within 45 km); the same name far apart is another haor
haors = []
for name, grp in H.groupby("name"):
    clusters = []
    for _, r in grp.iterrows():
        for c in clusters:
            if any(dist_km((r.lon, r.lat), (q.lon, q.lat)) < 45 for q in c): c.append(r); break
        else: clusters.append([r])
    for c in clusters:
        ha = sum(q.area_ha for q in c); wsum = ha or len(c)
        lon = sum(q.lon * (q.area_ha or 1) for q in c) / (wsum if ha else len(c)); lat = sum(q.lat * (q.area_ha or 1) for q in c) / (wsum if ha else len(c))
        clean = re.sub(r"\((Netrokona|Sylhet|Kishoreganj|Austagram)\)", "", name).strip()
        key = clean.lower()
        for o, g in outl.items():
            if key.startswith(o.split()[0].lower()): lon, lat = g.centroid.x, g.centroid.y
        if key.startswith("tangur haor"): pass
        haors.append({"name": clean, "ha": round(ha), "lon": round(lon, 4), "lat": round(lat, 4),
                      "district": sorted({q.district.replace("Maulvibazar", "Moulvibazar").replace("Netrakona", "Netrokona") for q in c}),
                      "upazila": sorted({q.upazila for q in c})})
haors.sort(key=lambda h: -h["ha"])

# the official table (BHWDB 2012, as printed in the DBHWD annexure, Table 2.1)
by_district = [
    {"district": "Sunamganj", "district_ha": 367000, "haor_ha": 268531, "n": 95},
    {"district": "Sylhet", "district_ha": 349000, "haor_ha": 189909, "n": 105},
    {"district": "Kishoreganj", "district_ha": 273100, "haor_ha": 133943, "n": 97},
    {"district": "Habiganj", "district_ha": 263700, "haor_ha": 109514, "n": 14},
    {"district": "Netrokona", "district_ha": 274400, "haor_ha": 79345, "n": 52},
    {"district": "Moulvibazar", "district_ha": 279900, "haor_ha": 47602, "n": 3},
    {"district": "Brahmanbaria", "district_ha": 192700, "haor_ha": 29616, "n": 7},
]

# ---------------------------------------------------------------- beels (Banglapedia, the floodplain beels outside the haor basin)
def upa_mean(pairs):
    pts = [find_upa(d, u).representative_point() for d, u in pairs]
    return round(sum(p.x for p in pts) / len(pts), 4), round(sum(p.y for p in pts) / len(pts), 4)
cb = upa_mean([("Sirajganj", "Raiganj"), ("Pabna", "Chatmohar"), ("Natore", "Singra"), ("Sirajganj", "Tarash")])
ab = upa_mean([("Munshiganj", "Sreenagar"), ("Munshiganj", "Sirajdikhan")])
beels = [
    {"id": "chalan", "name": "Chalan Beel", "lon": cb[0], "lat": cb[1], "where": "Sirajganj, Pabna and Natore (Raiganj, Chatmohar, Tarash, Singra)",
     "facts": [["at formation", "about 1,088 km²"], ["1909 survey, rainy season", "about 368 km²"], ["under water all year, 1909", "86 km²"], ["after reclamation, 1950s", "about 26 km²"]],
     "note": "The largest beel in the country. The Atrai is its main feeder; the Baral and Gumani drain it towards the Jamuna.", "r_km": 10.8},
    {"id": "arial", "name": "Arial Beel", "lon": ab[0], "lat": ab[1], "where": "Dhaka and Munshiganj, between the Padma and the Dhaleshwari",
     "facts": [["depression", "about 723 km²"]], "note": "Heavy clay. It floods deep each monsoon from rain that cannot drain while the rivers are high, and much of it stays wet through the dry season.", "r_km": 0},
    {"id": "dakatia", "name": "Beel Dakatia", "lon": 89.455, "lat": 22.875, "where": "Dumuria and Phultala, Khulna (Polder 25)",
     "facts": [["polder", "19,430 ha"], ["usually under 0.5 to 2 m of water", "about 9,000 ha"], ["still waterlogged after the 1995 dredging", "about 4,000 ha"]],
     "note": "Waterlogged since the polder cut it off from the tides: the channels silted up while the land inside sank.", "r_km": 0},
    {"id": "baikka", "name": "Baikka Beel", "lon": 91.635, "lat": 24.36, "where": "Hail Haor, Sreemangal, Moulvibazar",
     "facts": [], "note": "A permanent sanctuary inside Hail Haor, protected since 2003; one of the best places to count wintering ducks.", "r_km": 0},
]
other_beels = [["Gugurajala", "Chandpur"], ["Mathura", "Satkhira"], ["Kendua", "Bagerhat"], ["Baghia", "Gopalganj"], ["Chatar", "Pirojpur"],
               ["Veoa", "Chapai Nawabganj"], ["Lautarar Pathar", "Sirajganj"], ["Ghugudaha and Gandahasti", "Pabna"], ["Bara Beel", "Thakurgaon"],
               ["Tagrai", "Kurigram"], ["Bara Mirzapur", "Narail"], ["Keshpathar", "Bogura"]]

# ---------------------------------------------------------------- the wet ground, for the map
fill = []
for g in (wet.geoms if hasattr(wet, "geoms") else [wet]):
    s = g.simplify(0.004, preserve_topology=True)
    if s.area * 111 * 105 < 1.2: continue
    polys = s.geoms if hasattr(s, "geoms") else [s]
    for q in polys:
        if q.is_empty or q.area * 111 * 105 < 1.2: continue
        fill.append([[round(x, 3), round(y, 3)] for x, y in q.exterior.coords])

# ---------------------------------------------------------------- birds
tg = outl["Tanguar Haor"].centroid; hk = outl["Hakaluki Haor"].centroid
birds = {
    "sites": [
        {"id": "tanguar", "name": "Tanguar Haor", "lon": round(tg.x, 3), "lat": round(tg.y, 3), "kind": "haor", "ramsar": True,
         "counts": [[2010, 28925], [2013, 166788], [2015, 52299], [2016, 42558], [2017, 91236], [2018, 59542], [2019, 150000], [2022, 27000], [2024, 43516]],
         "species": "69 waterbird species in the 2008 to 2021 censuses, 41 of them migrants; 23 of the 41 migrants declined, Baer's pochard among them.",
         "src": "2010 and 2013: lowest and highest of the IUCN Bangladesh censuses, Alam et al. 2023, Avian Conservation and Ecology 18(1):18. 2015 to 2019: IUCN, Bangladesh Bird Club and Forest Department January counts (The Daily Star, 25 Jan 2019; 2019 rounded). 2022 and 2024: Bangladesh Bird Club with IUCN (bdnews24, 27 Mar 2026; 2022 rounded)."},
        {"id": "hakaluki", "name": "Hakaluki Haor", "lon": round(hk.x, 3), "lat": round(hk.y, 3), "kind": "haor", "ramsar": False,
         "counts": [[2017, 58281], [2020, 18660], [2023, 37778]],
         "species": "52 species in January 2023, including 12,732 ducks.", "src": "Bangladesh Bird Club; 2023 with IUCN Bangladesh (The Daily Star). No census in 2021 or 2022."},
        {"id": "baikka", "name": "Baikka Beel, Hail Haor", "lon": 91.635, "lat": 24.36, "kind": "beel", "ramsar": False,
         "counts": [[2023, 6141], [2024, 4615], [2025, 7870]], "species": "38 species in 2025, 33 in 2024, 40 in 2023.", "src": "Bangladesh Bird Club annual census (The Daily Star, 2025)."},
        {"id": "esund", "name": "Eastern Sundarbans", "lon": 89.75, "lat": 21.95, "kind": "coast", "counts": [],
         "species": "Ruddy shelduck, masked finfoot (critically endangered), lesser sand plover.", "src": "Regional Flyway Initiative site selection, Bangladesh, 2024 (ranked first)."},
        {"id": "emeghna", "name": "Eastern Meghna delta", "lon": 91.2, "lat": 22.45, "kind": "coast", "counts": [],
         "species": "Indian skimmer (endangered), spoon-billed sandpiper (critically endangered), lesser sand plover, broad-billed sandpiper.", "src": "Regional Flyway Initiative, 2024 (ranked second)."},
        {"id": "nijhum", "name": "Hatiya and Nijhum Dwip", "lon": 91.02, "lat": 22.05, "kind": "coast", "counts": [],
         "species": "Indian skimmer, lesser sand plover, black-headed ibis.", "src": "Regional Flyway Initiative, 2024 (ranked third)."},
        {"id": "cmeghna", "name": "Central Meghna delta", "lon": 90.75, "lat": 22.15, "kind": "coast", "counts": [],
         "species": "Black-headed ibis, lesser sand plover, common shelduck.", "src": "Regional Flyway Initiative, 2024."},
        {"id": "sonadia", "name": "Sonadia Island", "lon": 91.89, "lat": 21.49, "kind": "coast", "counts": [],
         "species": "Lesser sand plover and the critically endangered spoon-billed sandpiper.", "src": "Regional Flyway Initiative, 2024."},
    ],
    "national": "Tanguar Haor held about 43% of the 1.2 million waterbirds counted in Bangladesh from 2008 to 2015 (Thompson et al. 2018, cited by Alam et al. 2023).",
    "season": "Most arrive in November and leave by March. Bangladesh sits on the Central Asian and the East Asian-Australasian flyways.",
}

# ---------------------------------------------------------------- fish by district
F = RAW / "fish_dof_yearbooks"
dw = pd.read_csv(F / "district_waterbody.csv")
yr = "2024-25"; y = dw[dw.fiscal_year == yr]
CULT = ["Pond", "Seasonal culture waterbody", "Baor", "Shrimp/prawn farm (incl. crab from 2015-16)", "Pen culture", "Cage culture"]
CAPT = ["River and estuary", "Sundarbans", "Beel", "Kaptai Lake", "Floodplain"]
NAME_FIX = {"Chapai Nawabganj": "Chapainawabganj", "Jhalokathi": "Jhalokati", "Netrakona": "Netrokona"}
fish = {}
for d, g in y.groupby("district"):
    v = dict(zip(g.waterbody, g.production_t))
    fish[NAME_FIX.get(d, d)] = {
        "total": round(v.get("All inland (printed district total)", 0)),
        "culture": round(sum(v.get(k, 0) for k in CULT)), "capture": round(sum(v.get(k, 0) for k in CAPT)),
        "shrimp": round(v.get("Shrimp/prawn farm (incl. crab from 2015-16)", 0)), "pond": round(v.get("Pond", 0)),
        "beel": round(v.get("Beel", 0)), "flood": round(v.get("Floodplain", 0)), "river": round(v.get("River and estuary", 0))}
tot = dw[dw.waterbody == "All inland (printed district total)"].pivot_table(index="district", columns="fiscal_year", values="production_t")
for d in fish: pass
first = "2002-03"
for d in tot.index:
    k = NAME_FIX.get(d, d)
    if k in fish and first in tot.columns and tot.loc[d, first] > 0: fish[k]["t0"] = round(tot.loc[d, first])
sp = pd.read_csv(F / "sector_production.csv")
series = sp.groupby(["fiscal_year", "system"]).production_t.sum().unstack().fillna(0).reset_index()
national = [{"y": r.fiscal_year, "capture": int(r.get("capture", 0)), "culture": int(r.get("culture", 0)), "marine": int(r.get("marine", 0))} for _, r in series.iterrows()]
spn = pd.read_csv(F / "species_national.csv"); s25 = spn[spn.fiscal_year == yr].sort_values("total_t", ascending=False)
species = [{"g": r.group, "t": int(r.total_t), "inland": int(r.inland_t), "marine": int(r.marine_t)} for _, r in s25.iterrows()]
shrimp_area = int(sp[(sp.fiscal_year == yr) & (sp.sector == "Shrimp/prawn farm")].water_area_ha.iloc[0])

out = {
    "haors": haors, "haor_by_district": by_district, "haor_total": {"n": 373, "ha": 858460},
    "haor_src": "Department of Bangladesh Haor and Wetlands Development, Classification of Wetlands of Bangladesh, Vol. 3, Annexure 2: Haors of Bangladesh (2016), after the Master Plan of Haor Area (BHWDB 2012). Area by upazila; a haor that spans upazilas is summed.",
    "haor_place": "Each haor is drawn as a circle of its own area, placed on wet ground (ESA WorldCover 2021) inside the upazila or upazilas it lies in. The position is approximate; Tanguar and Hakaluki use their mapped outlines.",
    "beels": beels, "other_beels": other_beels, "beel_src": "Banglapedia: Chalan Beel, Arial Beel, Beel Dakatia, Beel, Haors and Wetlands.",
    "wet_fill": fill, "wet_src": "ESA WorldCover 2021, permanent water and herbaceous wetland, 270 m (dry season: the monsoon spread is far larger).",
    "birds": birds,
    "fish_year": yr, "fish": fish, "fish_national": national, "fish_species": species, "shrimp_area_ha": shrimp_area,
    "fish_src": "Department of Fisheries, Yearbook of Fisheries Statistics of Bangladesh 2024-25, inland production by district and waterbody, as harmonised by Rabbi (2026), doi:10.5281/zenodo.23466909 (CC BY 4.0).",
}
p = ROOT / "data/wet.json"; p.write_text(json.dumps(out, separators=(",", ":")))
print(len(haors), "haors;", sum(h["ha"] for h in haors), "ha;", len(fill), "wet polygons;", len(fish), "districts;", round(p.stat().st_size / 1024), "KB")
print([ (h["name"], h["ha"], h["upazila"]) for h in haors[:12]])
