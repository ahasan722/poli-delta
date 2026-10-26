#!/usr/bin/env python3
"""
make_cover.py  --  land cover, rivers and wetlands for version 2 of the scene.

ESA WorldCover 2021 (10 m, CC BY 4.0) gives the ground its real colour: cropland, tree cover, mangrove,
wetland, built-up, water. I put the majority class of each 0.7 km texel in the R channel of cover.png,
the Hansen tree-cover loss year (CHT only) in G, and a water flag merged from WorldCover + WFP + OSM 2017 in B.
Rivers come from HydroRIVERS (discharge-weighted lines) plus the unnamed minor network; names are attached
by hand from the FFWC gauge list and Natural Earth, because no named river layer exists on any open host.
"""
import json, math
from pathlib import Path
import numpy as np, rasterio, geopandas as gpd, pandas as pd
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from PIL import Image
from shapely.geometry import Point, LineString, MultiLineString

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "raw", ROOT / "data"
grid = json.load(open(OUT / "grid.json")); W, E, S, N, NX, NY = (grid[k] for k in ("W", "E", "S", "N", "NX", "NY"))
NX, NY = NX * 2, NY * 2                      # the cover textures are drawn at twice the relief grid (0.35 km) for close-ups
T = from_bounds(W, S, E, N, NX, NY)

def warp(path, resampling, dtype="float32", fill=np.nan):
    with rasterio.open(path) as src:
        dst = np.full((NY, NX), fill, dtype=dtype)
        reproject(rasterio.band(src, 1), dst, dst_transform=T, dst_crs="EPSG:4326", src_nodata=src.nodata, dst_nodata=fill, resampling=resampling)
    return dst

# ---- 1. land cover, majority class per texel -------------------------------------------------
cover = warp(RAW / "landcover_esa_worldcover2021_bgd/worldcover2021_bgd_90m_mode.tif", Resampling.mode, "uint8", 0)
CLASSES = {10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up", 60: "bare", 80: "water", 90: "herbaceous wetland", 95: "mangroves"}
# area per class (from the 90 m mode raster, inside Bangladesh), for the land-cover chapter
with rasterio.open(RAW / "landcover_esa_worldcover2021_bgd/worldcover2021_bgd_90m_mode.tif") as src:
    a = src.read(1); lat = src.transform.f + src.transform.e * (np.arange(src.height) + 0.5)
    km2 = (abs(src.transform.a) * 111.32 * np.cos(np.radians(lat))) * (abs(src.transform.e) * 111.32)
    areas = {CLASSES[c]: float((((a == c) * km2[:, None])).sum()) for c in CLASSES}
tot = sum(areas.values()); shares = {k: round(v / tot * 100, 2) for k, v in areas.items()}
print("land cover shares %:", shares)

# ---- 2. water: WorldCover water + WFP major rivers + OSM 2017 river polygons ---------------------
wfp = gpd.read_file(RAW / "rivers_wfp_major_rivers_py/bgd_hyd_major_rivers_py.geojson")
osm = gpd.read_file(RAW / "water_osm_geomaps_2017/osm2017_river_polygons_bengal.geojson")
wb = gpd.read_file(RAW / "water_osm_geomaps_2017/osm2017_waterbodies_bengal_inland.geojson")
m_wfp = rasterize(((g, 1) for g in wfp.geometry if g is not None), out_shape=(NY, NX), transform=T, fill=0, dtype="uint8")
m_osm = rasterize(((g, 1) for g in pd.concat([osm.geometry, wb.geometry]) if g is not None), out_shape=(NY, NX), transform=T, fill=0, dtype="uint8")
water = (cover == 80) | (m_wfp == 1) | (m_osm == 1)
print(f"water texels: worldcover {(cover==80).sum()}, wfp {m_wfp.sum()}, osm {m_osm.sum()}, merged {water.sum()}")

# ---- 3. Hansen tree-cover loss year in the Chattogram Hill Tracts (2001-2023) -------------------
# share of each texel's 30 m pixels that lost tree cover 2001-2023 (any year), 0..255
with rasterio.open(RAW / "forest_loss_hansen_cht_2001_2023/cht_loss_year.tif") as src:
    ly = src.read(1); binary = ((ly > 0) & (ly != src.nodata)).astype("float32")
    frac = np.zeros((NY, NX), "float32")
    reproject(binary, frac, src_transform=src.transform, src_crs=src.crs, dst_transform=T, dst_crs="EPSG:4326", dst_nodata=0, resampling=Resampling.average)
loss = np.clip(np.round(frac * 255), 0, 255).astype("uint8")
print("texels with any forest loss in CHT:", int((loss > 0).sum()), "mean loss share where >0:", round(float(frac[frac > 0].mean()), 3))

Image.fromarray(np.dstack([cover, loss, water.astype("uint8") * 255]).astype("uint8"), "RGB").save(OUT / "cover.png", optimize=True)

# the same classes as a colour texture, linearly filtered in the shader so the ground reads smooth
c2 = cover; NX2, NY2 = NX, NY
PAL = {0: (77, 64, 48), 10: (43, 92, 51), 20: (117, 128, 72), 30: (148, 153, 87), 40: (168, 158, 92), 50: (199, 148, 106), 60: (204, 189, 153), 80: (23, 51, 77), 90: (77, 133, 118), 95: (26, 77, 61)}
rgb2 = np.zeros((NY2, NX2, 3), "uint8")
for k, c in PAL.items(): rgb2[c2 == k] = c
Image.fromarray(rgb2, "RGB").save(OUT / "cover_rgb.png", optimize=True)
print("cover_rgb.png", rgb2.shape)

# ---- 4. rivers: HydroRIVERS (discharge) + minor lines, simplified, with names where I can anchor them ---
hr = gpd.read_file(RAW / "rivers_hydrorivers_v10_bgd_dis150/hydrorivers_v10_as_bgd_dis_ge150.geojson").cx[W:E, S:N]
hr["geometry"] = hr.geometry.simplify(0.003)
minor = gpd.read_file(RAW / "rivers_riverl_bgd_bdmaps/riverl_bgd_lines.geojson").cx[W:E, S:N]
minor["geometry"] = minor.geometry.simplify(0.003)
gauges = gpd.read_file(RAW / "gauges_ffwc_kalopathor/ffwc_gauges.geojson")
# name anchors: FFWC gauges (river name at a point) plus a few well-known places
anchors = [(r.river, r.geometry.x, r.geometry.y) for r in gauges.itertuples() if r.geometry is not None and r.has_coords]
anchors += [("Teesta", 89.3, 25.9), ("Surma", 91.6, 24.9), ("Kushiyara", 91.8, 24.6), ("Karnaphuli", 92.0, 22.4), ("Gorai", 89.3, 23.7), ("Madhumati", 89.7, 23.0),
            ("Arial Khan", 90.2, 23.1), ("Dhaleshwari", 90.15, 23.65), ("Buriganga", 90.4, 23.7), ("Sangu", 92.15, 22.0), ("Matamuhuri", 92.1, 21.75), ("Naf", 92.25, 20.95),
            ("Atrai", 88.95, 24.7), ("Mahananda", 88.3, 24.7), ("Old Brahmaputra", 90.4, 24.75), ("Halda", 91.8, 22.55), ("Pasur", 89.6, 22.35), ("Baleshwar", 89.85, 22.3),
            ("Bishkhali", 90.1, 22.3), ("Tetulia", 90.55, 22.4), ("Rupsa", 89.57, 22.75), ("Kirtonkhola", 90.37, 22.68), ("Dharla", 89.65, 25.85), ("Titas", 91.1, 23.95),
            ("Feni", 91.4, 22.95), ("Hooghly", 88.3, 22.4), ("Kaptai Lake", 92.2, 22.55)]
# the trunk rivers are named by discharge class and position, because HydroRIVERS carries no names and the
# gauge anchors sit on the banks of rivers that are 5 to 10 km wide. Discharges are HydroRIVERS long-term means.
TRUNK = [  # (name, dis_min, dis_max, lon_min, lon_max, lat_min, lat_max)
    ("Lower Meghna",  36000, 1e9, 90.3, 91.0, 22.0, 23.30),
    ("Padma",         30000, 36000, 89.7, 90.7, 23.2, 23.95),
    ("Ganges",        12000, 14500, 86.5, 89.8, 23.7, 25.3),
    ("Jamuna",        19000, 22000, 89.3, 90.0, 23.7, 25.75),
    ("Brahmaputra",   14000, 22000, 89.6, 90.1, 25.75, 26.3),
    ("Meghna",         5000, 6000,  90.4, 90.8, 23.2, 23.7),
]
def trunk_name(geom, dis):
    x, y = geom.centroid.x, geom.centroid.y
    for n, d0, d1, x0, x1, y0, y1 in TRUNK:
        if d0 <= dis < d1 and x0 <= x <= x1 and y0 <= y <= y1: return n
    return None
def name_for(geom, dis):
    t = trunk_name(geom, dis)
    if t: return t
    best = (None, 1e9)
    for n, x, y in anchors:
        d = geom.distance(Point(x, y))
        if d < best[1]: best = (n, d)
    return best[0] if best[1] < 0.06 else None   # ~6 km
hr["name"] = [name_for(g, d) for g, d in zip(hr.geometry, hr.dis)]
named = hr.name.notna().sum(); print(f"HydroRIVERS reaches {len(hr)}, named by anchor {named}")

def lines_to_json(gdf, with_attrs):
    out = []
    for r in gdf.itertuples():
        geoms = r.geometry.geoms if isinstance(r.geometry, MultiLineString) else [r.geometry]
        for g in geoms:
            if g is None or g.is_empty or len(g.coords) < 2: continue
            rec = {"c": [[round(x, 4), round(y, 4)] for x, y in g.coords]}
            if with_attrs: rec["dis"] = round(float(r.dis)); rec["ord"] = int(r.ord); rec["name"] = r.name if isinstance(r.name, str) else None
            out.append(rec)
    return out
json.dump({"major": lines_to_json(hr, True), "minor": lines_to_json(minor, False)}, open(OUT / "rivers.json", "w"), separators=(",", ":"))
print("rivers.json:", len(hr), "major,", len(minor), "minor")

# ---- 5. named places for the labels: forests, haors, hills ------------------------------------
haor = gpd.read_file(RAW / "wetlands_haor_aburaihan21/haor_hakaluki_tanguar.geojson")
sund = gpd.read_file(RAW / "mangroves_worldcover2021_derived/sundarbans_mangrove_extent_closed400m.geojson")
features = {
  "sundarbans_km2": round(float(sund.to_crs(32646).area.sum() / 1e6)),
  "hakaluki_km2": round(float(haor[haor.iloc[:, 0].astype(str).str.contains("Hakaluki", case=False)].to_crs(32646).area.sum() / 1e6)) if len(haor) else None,
  "tanguar_km2": round(float(haor[haor.iloc[:, 0].astype(str).str.contains("Tanguar", case=False)].to_crs(32646).area.sum() / 1e6)) if len(haor) else None,
  "cover_shares_pct": shares, "cover_area_km2": {k: round(v) for k, v in areas.items()},
  "cht_loss_texels": int((loss > 0).sum())
}
loss_csv = RAW / "forest_loss_hansen_cht_2001_2023/cht_annual_loss_by_district.csv"
if loss_csv.exists():
    df = pd.read_csv(loss_csv); features["cht_loss_by_year"] = df.to_dict("records")
json.dump(features, open(OUT / "cover_stats.json", "w"), indent=0)
# the two haor outlines the page draws (simplified to the grid)
haor_out = haor[["name", "geometry"]].copy(); haor_out["geometry"] = haor_out.geometry.simplify(0.004)
haor_out.to_file(OUT / "haors.geojson", driver="GeoJSON")
print("cover_stats:", {k: v for k, v in features.items() if k != "cht_loss_by_year"})
