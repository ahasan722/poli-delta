#!/usr/bin/env python3
"""
make_terrain.py  --  builds everything the 3D scene needs from the raw rasters/vectors.

I keep the whole study window fixed here so every layer lands on the same grid:
    lon 86.5 .. 93.5   lat 19.8 .. 27.0   (7 x 7.2 deg)
Outputs go to site/data/.  Run from the repo root:  python pipeline/make_terrain.py

Height is packed terrain-RGB style (same trick Mapbox uses) because browsers
flatten 16-bit PNGs to 8-bit on decode:  h = -10000 + (R*65536 + G*256 + B) * 0.1
"""
import json, math, sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
from rasterio.transform import from_bounds
import geopandas as gpd
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "raw", ROOT / "data"
OUT.mkdir(parents=True, exist_ok=True)

# ---- the grid --------------------------------------------------------------
W, E, S, N = 86.5, 93.5, 19.8, 27.0
NX = 1024                                   # texture width; height follows the aspect
# at 23.5N a degree of lon is ~0.917 of a degree of lat; I want square-ish texels on the ground
NY = int(round(NX * (N - S) / ((E - W) * math.cos(math.radians(23.4)))))
T = from_bounds(W, S, E, N, NX, NY)
print(f"grid {NX} x {NY}, texel ~{(E-W)/NX*111.32*math.cos(math.radians(23.4)):.2f} km")

def warp(src_path, resampling, nodata=None, band=1):
    with rasterio.open(src_path) as src:
        dst = np.full((NY, NX), np.nan, dtype="float32")
        reproject(rasterio.band(src, band), dst, dst_transform=T, dst_crs="EPSG:4326",
                  src_nodata=src.nodata if nodata is None else nodata, dst_nodata=np.nan, resampling=resampling)
    return dst

# ---- 1. elevation: SRTM inside Bangladesh, ETOPO5 everywhere else ----------
srtm = warp(RAW / "dem_srtm90_bgd/bangladesh_srtm90_v41_masked.tif", Resampling.average)
etopo = warp(RAW / "etopo5_geocat/etopo5_bay_of_bengal_80E-100E_10N-32N.tif", Resampling.bilinear)
inside = ~np.isnan(srtm)
h = np.where(inside, srtm, etopo).astype("float32")
# ETOPO5 land cells outside BD are 9 km blobs; soften them so the far field reads as a hint, not a cliff
print(f"srtm cells {inside.sum()} ({inside.mean()*100:.1f}% of grid); h range {np.nanmin(h):.0f}..{np.nanmax(h):.0f}")

# ---- 2. water and land masks -----------------------------------------------
water = gpd.read_file(RAW / "rivers_wfp_major_rivers_py/bgd_hyd_major_rivers_py.geojson")
coast = gpd.read_file(RAW / "gshhg_wdbii_basemap/gshhs_coast_f_bengal.geojson")
land = coast[coast.level == 1]            # GSHHS level 1 = land, 2 = lake, 3 = island in lake
lakes = coast[coast.level == 2]
land_m = rasterize(((g, 1) for g in land.geometry), out_shape=(NY, NX), transform=T, fill=0, dtype="uint8")
lake_m = rasterize(((g, 1) for g in lakes.geometry), out_shape=(NY, NX), transform=T, fill=0, dtype="uint8")
riv_m = rasterize(((g, 1) for g in water.geometry), out_shape=(NY, NX), transform=T, fill=0, dtype="uint8")
sea_m = (land_m == 0) | (lake_m == 1)
water_m = (riv_m == 1) | sea_m
# where SRTM says nodata inside the national bbox it is almost always water (the estuary); treat as such
print(f"water {water_m.mean()*100:.1f}%, of which river polygons {riv_m.mean()*100:.1f}%")
# bathymetry under the river polygons: SRTM gives the water surface; dip it a little so rivers read as channels
h = np.where(riv_m == 1, np.minimum(h, 0.0) - 2.0, h)
h = np.where(sea_m & (h > -2), -8.0, h)   # coastal cells ETOPO5 calls land but GSHHS calls sea
h = np.nan_to_num(h, nan=-50.0)

# ---- 3. pack terrain-RGB + masks -------------------------------------------
v = np.clip(np.round((h + 10000.0) * 10.0), 0, 2**24 - 1).astype("uint32")
rgb = np.dstack([(v >> 16) & 255, (v >> 8) & 255, v & 255]).astype("uint8")
Image.fromarray(rgb, "RGB").save(OUT / "height.png", optimize=True)
# mask texture: R = inside Bangladesh (SRTM), G = water, B = sea (not river)
mask = np.dstack([inside * 255, water_m * 255, sea_m * 255]).astype("uint8")
Image.fromarray(mask, "RGB").save(OUT / "mask.png", optimize=True)

# ---- 4. population (GPW v4 2015, 30 arc-sec density -> count per texel) -----
with rasterio.open(RAW / "pop_gpw4_2015/bangladesh_gpwv4_popdensity_2015_30arcsec.tif") as src:
    dens = src.read(1).astype("float64"); dens[dens == src.nodata] = np.nan
    gt = src.transform
    # cell area in km2 at each row (1 km-ish, varies with latitude)
    lat_rows = gt.f + gt.e * (np.arange(src.height) + 0.5)
    cell_km2 = (abs(gt.a) * 111.32 * np.cos(np.radians(lat_rows))) * (abs(gt.e) * 111.32)
    count = dens * cell_km2[:, None]
    count_nan = np.nan_to_num(count, nan=0.0)
    total = count_nan.sum()
    print(f"GPW 2015 population on grid: {total/1e6:.1f} M")
    # also sample SRTM mean elevation onto the GPW grid for the exposure table
    with rasterio.open(RAW / "dem_srtm90_bgd/bangladesh_srtm90_v41_masked.tif") as dem:
        elev_gpw = np.full(dens.shape, np.nan, "float32")
        reproject(rasterio.band(dem, 1), elev_gpw, dst_transform=gt, dst_crs="EPSG:4326", dst_nodata=np.nan, resampling=Resampling.average)
    # population texture on the scene grid (sum of counts into texels)
    pop_tex = np.zeros((NY, NX), "float64")
    rows, cols = np.where(count_nan > 0)
    lons = gt.c + gt.a * (cols + 0.5); lats = gt.f + gt.e * (rows + 0.5)
    px = ((lons - W) / (E - W) * NX).astype(int); py = ((N - lats) / (N - S) * NY).astype(int)
    ok = (px >= 0) & (px < NX) & (py >= 0) & (py < NY)
    np.add.at(pop_tex, (py[ok], px[ok]), count_nan[rows[ok], cols[ok]])
    # pack as 16-bit in RG (people per texel, capped), B = log scale for display
    pt = np.clip(pop_tex, 0, 65535).astype("uint32")
    plog = np.clip(np.log1p(pop_tex) / np.log1p(65535) * 255, 0, 255).astype("uint8")
    Image.fromarray(np.dstack([(pt >> 8) & 255, pt & 255, plog]).astype("uint8"), "RGB").save(OUT / "pop.png", optimize=True)

# ---- 5. exposure table: land area and people below each height step --------
# SRTM is a surface model and sits high over vegetation and buildings, so these are conservative
# compared with CoastalDEM (Kulp & Strauss 2019); I say so on the page.
steps = np.round(np.arange(0.0, 10.01, 0.25), 2)
with rasterio.open(RAW / "dem_srtm90_bgd/bangladesh_srtm90_v41_masked.tif") as dem:
    d = dem.read(1); valid = d != dem.nodata
    lat_rows = dem.transform.f + dem.transform.e * (np.arange(dem.height) + 0.5)
    km2 = (abs(dem.transform.a) * 111.32 * np.cos(np.radians(lat_rows))) * (abs(dem.transform.e) * 111.32)
    area_rows = []
    land_total = (valid * km2[:, None]).sum()
    for s in steps:
        area_rows.append(float((((d <= s) & valid) * km2[:, None]).sum()))
pop_rows = []
for s in steps:
    pop_rows.append(float(count_nan[np.nan_to_num(elev_gpw, nan=999) <= s].sum()))
exposure = {"steps_m": steps.tolist(), "area_km2": [round(a) for a in area_rows], "people": [round(p) for p in pop_rows],
            "land_total_km2": round(float(land_total)), "people_total": round(float(total)),
            "note": "SRTM 90 m v4.1 (CGIAR-CSI) land cells at or below each height, EGM96 datum; GPW v4 2015 population on 30 arc-sec cells whose mean SRTM height is at or below the step. SRTM is a surface model (canopy, roofs) so it understates exposure compared with CoastalDEM."}
json.dump(exposure, open(OUT / "exposure.json", "w"))
for s, a, p in zip(steps, area_rows, pop_rows):
    if s in (1, 2, 3, 5, 10): print(f"  <= {s:>4} m : {a:8.0f} km2 ({a/land_total*100:4.1f}%)  {p/1e6:5.1f} M people ({p/total*100:4.1f}%)")

# ---- 6. divisions and districts for labels (simplified) --------------------
adm1 = gpd.read_file(RAW / "adm1.geojson")
adm1["geometry"] = adm1.geometry.simplify(0.01)
adm1[["shapeName", "geometry"]].rename(columns={"shapeName": "name"}).to_file(OUT / "divisions.geojson", driver="GeoJSON")

# ---- 7. rivers outside Bangladesh (WDBII) for the far field ----------------
riv = gpd.read_file(RAW / "gshhg_wdbii_basemap/wdbii_rivers_f_bengal.geojson")
riv = riv.cx[W:E, S:N]; riv["geometry"] = riv.geometry.simplify(0.005)
riv[["geometry"]].to_file(OUT / "rivers_far.geojson", driver="GeoJSON")
json.dump({"W": W, "E": E, "S": S, "N": N, "NX": NX, "NY": NY}, open(OUT / "grid.json", "w"))
print("done")
