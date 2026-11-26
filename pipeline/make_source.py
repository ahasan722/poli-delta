# make_source.py  --  v16: the main rivers, each followed from its source to the sea, and the twelve city corporations.
#
# Rivers. HydroRIVERS v1.0 (Lehner & Grill 2013) is a one-way network: every reach knows the reach below it.
#   1. build_basin(): keep every reach that drains to the sea through Bangladesh's coast (walk up from the mouths).
#   2. For each river, find the reach nearest a point on it (within a range of upstream area, so the right stream is
#      picked), walk up always taking the branch with the longest path above it, then walk down to the sea.
#   3. Length is the sum of reach lengths; the country at every vertex comes from Natural Earth 1:50m.
# Distributaries (Gorai, Arial Khan, Old Brahmaputra, Dhaleshwari) are left out: a one-way network follows one channel
# downstream, so it cannot say where they leave the main river.
#
# Needs (not kept in the repository, they are large):
#   raw/rivers_hydrorivers_v10_as/HydroRIVERS_v10_as_shp.zip    https://www.hydrosheds.org/products/hydrorivers
#   raw/naturalearth/ne_50m_admin_0_countries.geojson           https://www.naturalearthdata.com
# Cities: BBS Population and Housing Census 2022, city corporations within their 2022 limits, typed in below.
import json, os, numpy as np, pandas as pd, geopandas as gpd
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union
from shapely import prepared

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
HYD = os.environ.get("HYDRO_DIR", os.path.join(ROOT, "raw", "rivers_hydrorivers_v10_as"))
NE = os.environ.get("NE_FILE", os.path.join(ROOT, "raw", "naturalearth", "ne_50m_admin_0_countries.geojson"))
W = json.load(open(NE, encoding="utf-8"))
NEAR = ("India", "China", "Nepal", "Bhutan", "Bangladesh", "Myanmar")


def build_basin():
    """Every reach that reaches the sea across Bangladesh's coast, with the share of water that comes from outside."""
    import pyogrio
    z = os.path.join(HYD, "HydroRIVERS_v10_as_shp.zip")
    R = pyogrio.read_dataframe(f"/vsizip/{z}/HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as.shp", bbox=(72.0, 20.0, 99.0, 32.5)).set_index("HYRIV_ID", drop=False)
    ends = np.array([g.coords[-1] for g in R.geometry]); R["ex"], R["ey"] = ends[:, 0], ends[:, 1]
    bd = next(shape(f["geometry"]) for f in W["features"] if f["properties"]["ADMIN"] == "Bangladesh"); bdz = bd.buffer(0.12)
    outl = R[(R.NEXT_DOWN == 0) & R.ex.between(88, 92.8) & (R.ey < 23.6)]
    outl = outl[[bdz.contains(Point(x, y)) for x, y in zip(outl.ex, outl.ey)]]
    kids = R.groupby("NEXT_DOWN").HYRIV_ID.apply(list).to_dict(); keep, st = set(), list(outl.HYRIV_ID)
    while st:
        i = st.pop()
        if i in keep: continue
        keep.add(i); st += kids.get(i, [])
    B = R.loc[sorted(keep)].copy(); nd = B.NEXT_DOWN.to_dict()
    bp = prepared.prep(bd.buffer(0.02)); nb = prepared.prep(unary_union([shape(f["geometry"]) for f in W["features"] if f["properties"]["ADMIN"] in ("India", "Myanmar")]).buffer(0.01))
    inside = np.array([bp.contains(Point(x, y)) for x, y in zip(B.ex, B.ey)]); starts = np.array([bp.contains(Point(g.coords[0])) for g in B.geometry])
    from_nb = np.array([nb.contains(Point(g.coords[0])) for g in B.geometry])
    cross = B[(~starts) & inside & from_nb]; cset = set(cross.HYRIV_ID); drop = set()
    for i in cset:                                       # a river that crosses in, out and in again counts once, at its last crossing
        j = nd.get(i)
        while j:
            if j in cset: drop.add(i); break
            j = nd.get(j)
    cross = cross[~cross.HYRIV_ID.isin(drop)]
    facts = {"basin_km2": float(B.CATCH_SKM.sum()), "bd_km2_in_basin": float(B[inside].CATCH_SKM.sum()), "in_cms": float(cross.DIS_AV_CMS.sum()), "out_cms": float(outl.DIS_AV_CMS.sum()), "reaches": int(len(B))}
    B.drop(columns="geometry").to_csv(os.path.join(HYD, "basin_attrs.csv"), index=False)
    gpd.GeoDataFrame(B[["HYRIV_ID", "NEXT_DOWN", "DIS_AV_CMS", "UPLAND_SKM"]].reset_index(drop=True), geometry=B.geometry.values, crs=4326).to_file(os.path.join(HYD, "basin.gpkg"))
    json.dump(facts, open(os.path.join(HYD, "facts.json"), "w", encoding="utf-8"), indent=1)


if not os.path.exists(os.path.join(HYD, "basin.gpkg")): build_basin()
B = gpd.read_file(os.path.join(HYD, "basin.gpkg")).set_index("HYRIV_ID", drop=False)
A = pd.read_csv(os.path.join(HYD, "basin_attrs.csv")).set_index("HYRIV_ID")
FACTS = json.load(open(os.path.join(HYD, "facts.json"), encoding="utf-8"))
B["LEN"] = A.LENGTH_KM; B["DUP"] = A.DIST_UP_KM; B["Q"] = A.DIS_AV_CMS
ends = np.array([g.coords[-1] for g in B.geometry]); B["ex"], B["ey"] = ends[:, 0], ends[:, 1]
kids = B.groupby("NEXT_DOWN").HYRIV_ID.apply(list).to_dict()
CT = {f["properties"]["ADMIN"]: shape(f["geometry"]) for f in W["features"] if f["properties"]["ADMIN"] in NEAR}
# Bangladesh from the district map (finer than Natural Earth along the border rivers); its neighbours give way to it
BDP = unary_union([shape(f["geometry"]).buffer(0) for f in json.load(open(os.path.join(ROOT, "data", "districts.geojson"), encoding="utf-8"))["features"]]).buffer(0.003)
CT = {n: (BDP if n == "Bangladesh" else g.difference(BDP)) for n, g in CT.items()}
CTP = {n: prepared.prep(g) for n, g in CT.items()}


def country(x, y):
    p = Point(x, y)
    for n, g in CTP.items():
        if g.contains(p): return n
    return min(CT, key=lambda n: CT[n].distance(p))           # a vertex in a river mouth or on a simplified border


def near(lon, lat, mn, mx):
    c = B[(B.UPLAND_SKM >= mn) & (B.UPLAND_SKM <= mx)]; return int(((c.ex - lon) ** 2 + (c.ey - lat) ** 2).idxmin())


def trace(seed):
    up = [seed]; j = seed
    while kids.get(j):
        j = max(kids[j], key=lambda k: B.loc[k].DUP + B.loc[k].LEN); up.append(j)
    down = []; j = B.loc[seed].NEXT_DOWN
    while j and j in B.index: down.append(j); j = B.loc[j].NEXT_DOWN
    return up[::-1] + down


# name in Bangladesh, name upstream, the system it reaches the sea through, a point on it, smallest and largest upstream area there (km²), where it rises
RIV = [
    ("Jamuna", "Brahmaputra", "Brahmaputra", 89.70, 25.15, 450000, 1e9, "Tibet"),
    ("Padma", "Ganges", "Ganges", 78.60, 30.15, 15000, 40000, "the Himalaya, Uttarakhand"),     # seeded at Devprayag, where the Ganges becomes one river
    ("Meghna", "Barak", "Meghna", 91.10, 24.20, 30000, 120000, "the Manipur hills"),
    ("Teesta", "Teesta", "Brahmaputra", 89.45, 25.75, 8000, 30000, "Sikkim"),
    ("Surma", "Surma", "Meghna", 91.87, 24.89, 3000, 60000, "the Jaintia Hills, Meghalaya"),
    ("Dharla", "Torsa", "Brahmaputra", 89.62, 25.90, 3000, 15000, "the Bhutan Himalaya"),
    ("Dudhkumar", "Sankosh", "Brahmaputra", 89.80, 26.00, 3000, 15000, "Bhutan"),
    ("Mahananda", "Mahananda", "Ganges", 88.42, 26.70, 300, 3000, "the Darjeeling hills"),            # seeded at Siliguri, below the hills
    ("Punarbhaba", "Punarbhaba", "Ganges", 88.62, 25.62, 300, 4000, "the plains of Thakurgaon"),
    ("Atrai", "Karatoya", "Brahmaputra", 88.77, 25.22, 800, 10000, "the Jalpaiguri plains"),         # seeded at Balurghat, between its two stretches in Bangladesh
    ("Someshwari", "Simsang", "Meghna", 90.68, 25.12, 1500, 4500, "the Garo Hills, Meghalaya"),
    ("Jadukata", "Kynshi", "Meghna", 91.20, 25.15, 800, 5000, "the Khasi Hills, Meghalaya"),
    ("Manu", "Manu", "Meghna", 91.77, 24.49, 800, 4000, "the Tripura hills"),
    ("Khowai", "Khowai", "Meghna", 91.42, 24.38, 600, 3000, "the Tripura hills"),
    ("Gumti", "Gumti", "Meghna", 91.10, 23.47, 800, 5000, "the Tripura hills"),
    ("Feni", "Feni", "coast", 91.47, 22.95, 500, 3000, "the hills on the Tripura border"),
    ("Muhuri", "Muhuri", "coast", 91.42, 23.05, 300, 2500, "the Tripura hills"),
    ("Halda", "Halda", "coast", 91.87, 22.50, 500, 2500, "Khagrachhari"),
    ("Karnaphuli", "Karnaphuli", "coast", 91.95, 22.45, 5000, 20000, "the Mizoram hills"),
    ("Sangu", "Sangu", "coast", 92.05, 22.10, 1000, 6000, "the Arakan hills, Bandarban"),
    ("Matamuhuri", "Matamuhuri", "coast", 92.03, 21.80, 800, 4000, "the hills of Bandarban"),
    ("Bakkhali", "Bakkhali", "coast", 92.02, 21.45, 200, 1500, "Naikhongchhari, Bandarban")]
EST = [[90.63, 23.22], [90.58, 23.0], [90.62, 22.8], [90.72, 22.6], [90.85, 22.4], [90.95, 22.2], [91.0, 21.95]]   # the Meghna estuary below Chandpur, by hand
out = []
for name, up_name, grp, lon, lat, mn, mx, rises in RIV:
    seed = near(lon, lat, mn, mx); path = trace(seed); pts, s = [], 0.0
    for r in path:
        c = np.asarray(B.loc[r].geometry.coords); L = B.loc[r].LEN
        seg = np.r_[0, np.cumsum(np.hypot(np.diff(c[:, 0]) * 0.9, np.diff(c[:, 1])))]; seg = seg / seg[-1] if seg[-1] else seg
        for k in range(1 if pts else 0, len(c)): pts.append((float(c[k, 0]), float(c[k, 1]), s + L * seg[k], float(B.loc[r].Q)))
        s += L
    pts = np.array(pts); pts = pts[np.r_[True, np.any(np.diff(pts[:, :2], axis=0) != 0, axis=1)]]
    seq = [country(x, y) for x, y in pts[:, :2]]
    # runs of one country along the river; runs shorter than 8 km (a meandering border) join the run before them
    runs = []
    for n, k in zip(seq, pts[:, 2]):
        if runs and runs[-1][0] == n: runs[-1][2] = k
        else: runs.append([n, runs[-1][2] if runs else 0.0, k])
    merged = []
    for r in runs:
        if merged and (r[2] - r[1] < 8 or merged[-1][0] == r[0]): merged[-1][2] = r[2]
        else: merged.append(r)
    if len(merged) > 1 and merged[0][2] - merged[0][1] < 8: merged[1][1] = 0.0; merged = merged[1:]
    merged[-1][2] = s
    km_bd = sum(b - a for n, a, b in merged if n == "Bangladesh")
    # where it comes into Bangladesh: the start of the first stretch of 20 km or more inside the country that is not the source
    first_in = next((a for n, a, b in merged if n == "Bangladesh" and a > 0 and b - a >= 20), None)
    entry = None if first_in is None else int(np.searchsorted(pts[:, 2], first_in))
    if name == "Mahananda": entry = None      # in this network its main arm meets the Ganges in Bihar, so it has no flow of its own at the border
    line = LineString(pts[:, :2]).simplify(0.004); kmof = {(round(x, 6), round(y, 6)): k for x, y, k, _ in pts}
    keep = [[round(x, 4), round(y, 4), round(kmof[(round(x, 6), round(y, 6))], 1)] for x, y in line.coords]
    countries = []
    for n, a, b in merged:
        if n not in countries: countries.append(n)
    rec = {"name": name, "up": up_name, "grp": grp, "rises": rises, "km": round(s), "km_bd": round(km_bd), "src": [round(float(pts[0, 0]), 3), round(float(pts[0, 1]), 3)],
           "mouth": [round(float(pts[-1, 0]), 3), round(float(pts[-1, 1]), 3)], "countries": countries, "segs": [[n, round(a), round(b)] for n, a, b in merged],
           "q_entry": None if entry is None else round(float(pts[min(entry + 1, len(pts) - 1), 3])), "q_mouth": round(float(pts[-1, 3])), "pts": keep}
    if abs(rec["mouth"][0] - 90.63) < 0.02 and abs(rec["mouth"][1] - 23.22) < 0.02: rec["ext"] = EST
    out.append(rec); print(f"{name:11s} {rec['km']:5d} km, {rec['km_bd']:4d} in Bangladesh, {' > '.join(countries):32s} entry {rec['q_entry']} m3/s, {len(keep)} pts")

# borders around the basin, as lines, for the wide map
lines = []
for f in W["features"]:
    n = f["properties"]["ADMIN"]; gm = f["geometry"]; polys = gm["coordinates"] if gm["type"] == "MultiPolygon" else [gm["coordinates"]]
    for p in polys:
        r = np.array(p[0])
        if r[:, 0].max() < 71 or r[:, 0].min() > 101 or r[:, 1].max() < 17 or r[:, 1].min() > 36: continue
        r = r[(r[:, 0] > 66) & (r[:, 0] < 106) & (r[:, 1] > 12) & (r[:, 1] < 40)] if len(r) > 2000 else r
        if len(r) > 1: lines.append({"n": n, "r": np.round(r[::2] if len(r) > 400 else r, 3).tolist()})

CITIES = [  # name, district, lon, lat, city corporation since, people within the 2022 limits at the censuses of 1991, 2001, 2011, 2022
    ("Dhaka North", "Dhaka", 90.412, 23.810, 2011, [1952898, 3305351, 4919763, 5990723]),
    ("Dhaka South", "Dhaka", 90.408, 23.722, 2011, [2220728, 3177526, 3986276, 4305063]),
    ("Chattogram", "Chattogram", 91.815, 22.341, 1990, [1392958, 2023489, 2592439, 3230507]),
    ("Gazipur", "Gazipur", 90.412, 23.999, 2013, [499463, 759361, 1592053, 2677715]),
    ("Narayanganj", "Narayanganj", 90.500, 23.620, 2011, [401673, 548268, 709381, 967951]),
    ("Khulna", "Khulna", 89.556, 22.820, 1990, [578919, 770498, 663342, 719557]),
    ("Rangpur", "Rangpur", 89.251, 25.746, 2012, [379168, 471189, 568185, 708570]),
    ("Mymensingh", "Mymensingh", 90.407, 24.754, 2018, [298737, 367466, 430214, 577000]),
    ("Rajshahi", "Rajshahi", 88.600, 24.372, 1991, [294056, 388811, 449756, 553288]),
    ("Sylhet", "Sylhet", 91.872, 24.899, 2002, [217412, 263197, 479837, 532839]),
    ("Cumilla", "Cumilla", 91.185, 23.461, 2011, [183199, 224782, 326386, 440233]),
    ("Barishal", "Barishal", 90.354, 22.701, 2002, [239951, 276921, 328278, 419484])]
cities = [{"name": n, "district": d, "lon": x, "lat": y, "since": s, "pop": p} for n, d, x, y, s, p in CITIES]

json.dump({"rivers": out, "borders": lines, "facts": {k: FACTS[k] for k in ("basin_km2", "bd_km2_in_basin", "in_cms", "out_cms", "reaches")}, "cities": cities, "city_years": [1991, 2001, 2011, 2022],
           "src": {"rivers": "HydroRIVERS v1.0 (Lehner & Grill 2013), traced from each source to the sea; flows are its modelled long-term means, 1971 to 2000. Countries: Natural Earth 1:50m. The Meghna estuary below Chandpur is drawn by hand.",
                   "cities": "BBS, Population and Housing Census 2022 and earlier censuses, as tabulated by citypopulation.de for each city corporation within its 2022 limits; counts as enumerated, not adjusted."}},
          open(os.path.join(ROOT, "data", "source.json"), "w", encoding="utf-8"), separators=(",", ":"))
print("source.json", os.path.getsize(os.path.join(ROOT, "data", "source.json")) // 1024, "KB;", len(out), "rivers,", len(cities), "cities")
