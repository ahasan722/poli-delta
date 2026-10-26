#!/usr/bin/env python3
"""
make_districts.py  --  one profile per district, so a click on the relief can answer with numbers.

Reads the 64 BBS Census 2022 district polygons (with the census count) and the layers the earlier scripts already wrote (height.png,
mask.png, pop.png, cover.png, rivers.json, storms.json), and writes:
  data/district_id.png   the district id (1..64) of every texel in the R channel, 0 outside
  data/districts.geojson the simplified outlines the page draws when a district is selected
  data/districts.json    the profile: area, people, elevation shares, land cover, forest loss,
                         cyclones that passed within 50 km, named rivers that cross it
"""
import json
from pathlib import Path
import numpy as np, geopandas as gpd, pandas as pd
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from shapely.geometry import LineString, Point
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "raw", ROOT / "data"
grid = json.load(open(OUT / "grid.json")); W, E, S, N, NX, NY = (grid[k] for k in ("W", "E", "S", "N", "NX", "NY"))
T = from_bounds(W, S, E, N, NX, NY)

# BBS Population and Housing Census 2022 GIS layer: official 2022 spellings and the census count per district
RENAME = {"Chapainababganj": "Chapainawabganj", "Netrakona": "Netrokona"}
d = gpd.read_file(RAW / "adm2_districts/bbs2022_districts_simplified.geojson")
d["name"] = d.district_name.replace(RENAME); d["division"] = d.division_name; d["pcode"] = d.district_code.astype(str); d["pop2022"] = d.total_pop.astype(int); d["area_bbs"] = d.area_km2
d = d.sort_values("name").reset_index(drop=True); d["id"] = np.arange(1, len(d) + 1)
print(len(d), "districts")

# ---- 1. id raster on the scene grid, and the outlines the page draws ---------------------------------
ids = rasterize(((g, i) for g, i in zip(d.geometry, d.id)), out_shape=(NY, NX), transform=T, fill=0, dtype="uint8", all_touched=False)
Image.fromarray(np.dstack([ids, np.zeros_like(ids), np.zeros_like(ids)]), "RGB").save(OUT / "district_id.png", optimize=True)
web = d[["id", "name", "division", "geometry"]].copy(); web["geometry"] = web.geometry.simplify(0.004, preserve_topology=True)
web.to_file(OUT / "districts.geojson", driver="GeoJSON")

# ---- 2. the layers already on the grid -------------------------------------------------------------
h = np.asarray(Image.open(OUT / "height.png")).astype(np.int64); H = -10000 + (h[..., 0] * 65536 + h[..., 1] * 256 + h[..., 2]) * 0.1
m = np.asarray(Image.open(OUT / "mask.png")); inside = m[..., 0] > 127; water = m[..., 1] > 127
p = np.asarray(Image.open(OUT / "pop.png")).astype(np.int64); POP = (p[..., 0] << 8) | p[..., 1]
c = np.asarray(Image.open(OUT / "cover.png")); CLS = c[..., 0]; LOSS = c[..., 1] / 255.0; CW = c[..., 2] > 127   # at 2x the grid
ids2 = np.repeat(np.repeat(ids, 2, axis=0), 2, axis=1)
lat_rows = N - (np.arange(NY) + 0.5) * (N - S) / NY
texel_km2 = ((E - W) / NX * 111.32 * np.cos(np.radians(lat_rows))) * ((N - S) / NY * 111.32)        # per row
A = np.repeat(texel_km2[:, None], NX, axis=1); A2 = np.repeat(np.repeat(A, 2, axis=0), 2, axis=1) / 4

# ---- 3. storms and rivers -------------------------------------------------------------------------------
storms = json.load(open(OUT / "storms.json"))
tracks = [(s, LineString([(x, y) for x, y, w in s["pts"]])) for s in storms if len(s["pts"]) > 1]
rivers = json.load(open(OUT / "rivers.json"))
named = [(l["name"], LineString(l["c"]), l["dis"]) for l in rivers["major"] if l.get("name") and len(l["c"]) > 1]

def cat(kt):
    return "super cyclonic storm" if kt >= 120 else "extremely severe" if kt >= 90 else "very severe" if kt >= 64 else "severe" if kt >= 48 else "cyclonic storm" if kt >= 34 else "depression"

profiles = []
for r in d.itertuples():
    sel = ids == r.id; land = sel & ~water; sel2 = ids2 == r.id
    area = float(A[sel].sum()); land_area = float(A[land].sum())
    hh = H[land]; aa = A[land]
    share5 = float(aa[hh <= 5].sum() / land_area) if land_area else 0; share10 = float(aa[hh <= 10].sum() / land_area) if land_area else 0
    pop = int(POP[sel].sum()); pop10 = int(POP[sel & (H <= 10)].sum())
    cls = CLS[sel2]; a2 = A2[sel2]; tot2 = a2.sum() or 1; wm = (cls == 80) | CW[sel2]
    cover = {k: round(float(a2[np.isin(cls, v) & ~wm].sum() / tot2 * 100), 1) for k, v in
             {"cropland": [40], "tree cover": [10], "mangroves": [95], "wetland": [90], "built-up": [50]}.items()}
    cover["water"] = round(float(a2[wm].sum() / tot2 * 100), 1)
    cover["other"] = round(max(0.0, 100 - sum(cover.values())), 1)
    loss_km2 = float((LOSS[sel2] * A2[sel2]).sum())
    geom = r.geometry; buf = geom.buffer(0.45)     # about 50 km
    hits = []
    for s, ln in tracks:
        if ln.intersects(buf):
            # the strongest fix within 50 km of the district
            kts = [w for x, y, w in s["pts"] if buf.contains(Point(x, y))]
            hits.append({"year": s["season"], "kt": int(max(kts) if kts else s["peak_kt"]), "name": s.get("note", {}).get("label") or (s["name"] if s["name"] not in ("NOT_NAMED", "UNNAMED", "") else None), "sid": s["sid"]})
    hits.sort(key=lambda x: x["year"])
    strongest = max(hits, key=lambda x: x["kt"]) if hits else None
    riv = {}
    for n, ln, dis in named:
        if ln.intersects(geom): riv[n] = max(riv.get(n, 0), dis)
    rivers_in = [n for n, _ in sorted(riv.items(), key=lambda x: -x[1])]
    cen = geom.representative_point(); b = geom.bounds
    profiles.append({"id": int(r.id), "name": r.name, "division": r.division, "pcode": r.pcode, "area_km2": round(area), "land_km2": round(land_area),
                     "pop_gpw2015": pop, "pop_census2022": int(r.pop2022), "pop_le10": pop10, "share_le5": round(share5 * 100, 1), "share_le10": round(share10 * 100, 1),
                     "h_max": int(hh.max()) if hh.size else 0, "h_mean": round(float(hh.mean()), 1) if hh.size else 0,
                     "cover": cover, "loss_km2": round(loss_km2, 1) if (loss_km2 > 1 and r.name in ("Bandarban", "Rangamati", "Khagrachhari")) else 0,   # the Hansen clip covers the three hill districts only
                     "storms": {"n": len(hits), "strongest": strongest, "hits": [[x["year"], x["kt"], x["name"], x["sid"]] for x in hits]},
                     "rivers": rivers_in[:8], "centroid": [round(cen.x, 3), round(cen.y, 3)], "bbox": [round(v, 3) for v in b],
                     "coastal": bool(geom.distance(Point(cen.x, 21.0)) < 0 or b[1] < 22.6)})

json.dump({"source": "BBS Census 2022 GIS district boundaries and counts; stats computed on the 0.7 km scene grid from SRTM 90 m, GPW v4 2015, ESA WorldCover 2021, Hansen GFC, IBTrACS v04r01 (tracks within 50 km), HydroRIVERS named reaches",
           "districts": profiles}, open(OUT / "districts.json", "w"), separators=(",", ":"))
print("districts.json:", len(profiles), "profiles;", sum(pr["storms"]["n"] for pr in profiles), "storm hits;", sum(bool(pr["rivers"]) for pr in profiles), "with named rivers")
print("check: total people", sum(pr["pop_gpw2015"] for pr in profiles) / 1e6, "M; total area", sum(pr["area_km2"] for pr in profiles), "km2")
