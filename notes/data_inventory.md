# Delta / water / climate 3D map: data inventory

Scouted 2026-10-25. Sandbox could only reach raw.githubusercontent.com, media.githubusercontent.com, GitHub release assets (github.com/<o>/<r>/releases/download/... redirecting to release-assets.githubusercontent.com), `git clone` of public GitHub repos, registry.npmjs.org and pypi.org/files.pythonhosted.org. NOAA, NASA, USGS, HDX, Zenodo, Copernicus, GEBCO, OSM/Overpass, Google Storage, jsDelivr/unpkg, GitHub Pages and the GitHub API were all blocked.

All files are under `/home/claude/work/delta/raw/<dataset>/`. Conversion scripts are in `/home/claude/work/delta/scripts/`.

---

## 1. ELEVATION

### 1a. SRTM 90 m v4.1 (CGIAR-CSI), cropped and masked to Bangladesh  (PRIMARY DEM)
- Path: `raw/dem_srtm90_bgd/bangladesh_srtm90_v41_masked.tif` (12 MB, deflate GeoTIFF)
- Source: R data package `adammwilson/DataScienceData` (file `data/bangladesh_dem.rda`), built with `raster::getData("SRTM")` from four CGIAR-CSI SRTM v4.1 tiles (srtm_54_07 etc.), merged, cropped and masked to the GADM level-0 Bangladesh boundary. URL: https://github.com/adammwilson/DataScienceData (git clone). Original data: http://srtm.csi.cgiar.org
- Licence: repo MIT; underlying SRTM v4.1 is free with attribution to CGIAR-CSI (Jarvis et al. 2008).
- Format/CRS: GeoTIFF float32, EPSG:4326, 5596 x 7072 px, cell 0.0008333 deg (3 arc-sec, ~90 m), nodata -9999.
- Extent: lon 88.0104–92.6738, lat 20.7413–26.6346 (Bangladesh only; everything outside the GADM boundary, including India, Myanmar, the Bay of Bengal and some large river/estuary water areas, is nodata). 17.8 M valid pixels of 39.6 M.
- Value range: -31 to 1021 m. Spot checks: Dhaka 15 m, Khulna 8 m, Barishal 11 m, Sylhet 26 m, Rangpur 37 m, Chattogram 32 m, Cox's Bazar 31 m, Keokradong area 873 m. 8.7% of valid pixels < 5 m, 34.6% < 10 m.
- Verified: parsed the R `RasterLayer` object with Python `rdata` (`scripts/rda_raster_to_tif.py`), wrote GeoTIFF with rasterio, checked orientation visually (rendered PNG) and by sampling known places.
- Caveats: masked to the national boundary, so for a regional 3D scene it must be combined with 1b/1c for surroundings and sea; SRTM is a surface model (tree canopy adds a few metres in the Sundarbans); SRTM v4.1 void-filled; vertical datum EGM96.

### 1b. ETOPO5 global relief (5 arc-min, ~9 km), land + bathymetry  (REGIONAL CONTEXT / SEA FLOOR)
- Paths: `raw/etopo5_geocat/etopo5_global_5arcmin.tif` (10 MB, int16, EPSG:4326, -180..180, 4320 x 2160) and the cut-out `raw/etopo5_geocat/etopo5_bay_of_bengal_80E-100E_10N-32N.tif`.
- Source: binary `binary_files/ETOPO5.DAT` in https://github.com/NCAR/geocat-datafiles (git clone, repo Apache-2.0). ETOPO5 itself is NOAA NGDC public domain (1988).
- Verified: raw big-endian int16, 2160 x 4320, row 0 = 90N, col 0 = 0E; re-rolled to -180..180. Spot checks: Dhaka 30 m, Bay (89E,20N) -1390 m, Everest cell 6096 m, Keokradong cell 305 m, global min -10376 / max 7833.
- Caveats: coarse (9 km); old product; use only for sea floor and far-field relief.

### 1c. ETOPO1-derived 10 arc-min global topography (~18 km)  (FALLBACK ONLY)
- Path: `raw/etopo_10arcmin_fatiando/earth-topography-10arcmin.nc` (2.7 MB netCDF, int16 `topography(latitude, longitude)`, 1081 x 2161).
- Source: GitHub release asset https://github.com/fatiando-data/earth-topography-10arcmin/releases/download/v1/earth-topography-10arcmin.nc (Fatiando a Terra `ensaio` registry, md5 c43b61322e03669c4313ba3d9a58028d; derived from ETOPO1). Licence CC-BY-4.0.
- Verified with netCDF4: Dhaka cell = 8 m.
- Caveats: too coarse for anything but a globe-scale backdrop.

### DEM candidates tried and failed (for the record)
1. `prioritizr/dem` (EarthEnv 90 m global): code only, data on Zenodo (blocked).
2. `rakibhhridoy/rimes-mapathon` (Bangladesh flood/landslide hazard, SRTM, JRC, WorldPop): data archive on Zenodo (blocked).
3. `giswqs/data` and `opengeos/datasets` release `raster/srtm90.tif`, `dem_90m.tif`, `dem.tif`: all California/US extents (checked with rasterio).
4. `opengeos/datasets` guesses `gebco_2023.tif`, `etopo1.tif`, `global_dem.tif`: 404.
5. `cran/geomapdata`: no ETOPO5 in current CRAN version.
6. `jaluebbe/HeightMap`: only a GEBCO point cache JSON.
7. `pyvista/vtk-data` topo files: only the same 10-arc-min ETOPO.
8. `Abdi-Ghasem/srtmDownloader`, `bopen/elevation`, `Zhenkun-Lei/SRTM_Download`, `lukey78/open-elevation-data`, `sebastian-meier/dem-playground`: downloaders / link lists, no tiles.
9. PyPI: `srtm`, `elevation`, `rockhound`, `ensaio`, `pysheds`, `bathy`, `global-land-mask` bundle no DEM; `etopo`, `pyetopo`, `gebco`, `etopo1`, `gtopo30`, `srtm30` etc. do not exist. PyPI web search is bot-blocked.
10. npm: no package bundles a global DEM (`srtm-elevation`, `node-hgt`, `@basemaps/bathymetry`, `@freetiler/*` are readers/fetchers).
11. `cran/bangladesh`, `yasserius/bangladesh_geojson_shapefile`, `fahim-muntasir-niloy/Bangladesh-geojson_project`, `nuhil/bangladesh-geocode`, `aburaihan21/Bangladesh-All-GIS-Shapefile-Data`: admin vectors only.
12. Searches for mirrored tiles (`N23E090.hgt`, `srtm_54_07`, `gt30e060n40`, `ETOPO_2022_v1_15s_N30E090`, `BGD_msk_alt`) found nothing on GitHub.
13. Mapterhorn / tilezen terrain tiles / AWS / source.coop: blocked hosts.
- Best alternative if a host opens up: ETOPO 2022 15 arc-sec tile N30E090 (NOAA), Copernicus GLO-90 (AWS), or NASADEM/SRTMGL3 via OpenTopography.

---

## 2. RIVERS AND WATER BODIES

### 2a. WFP GeoNode "bgd_hyd_major_rivers_py" (river + estuary + sea water polygons)  (PRIMARY WATER LAYER)
- Paths: `raw/rivers_wfp_major_rivers_py/bgd_hydrology.{shp,shx,dbf,prj,cst}` (original) and `bgd_hyd_major_rivers_py.geojson` (7.3 MB, geometries made valid with buffer(0)).
- Source: shapefile `data/shapefiles/bgd_hydrology/` in https://github.com/mkim2019/bangladesh_inland_water_transport (Vanderbilt University inland-water-transport project). Their README gives the origin as https://geonode.wfp.org/layers/geonode:bgd_hyd_major_rivers_py (WFS request saved in `wfsrequest.txt`). The WFP/LGED river layer is also what HDX publishes as "Bangladesh - Rivers" (bgd_hyd_rivers_lged, source Local Government Engineering Department / Global Map Initiative).
- Licence: WFP GeoNode layers are generally open (CC-BY-style) but the licence field on HDX says "Other"; the GitHub repo has no licence file. Treat as open with attribution to WFP / LGED; confirm before commercial use.
- Format: 6 polygons (one giant multipolygon with the Bay of Bengal, the Meghna estuary and the whole major river network as water surfaces, plus Kaptai Lake and small pieces), EPSG:4326, bounds lon 86.49–92.90, lat 20.11–26.75.
- Verified with geopandas; rendered PNG shows Jamuna, Padma, Meghna, Ganges, Teesta, Karnaphuli, the Sundarbans creeks and the estuary as polygons. Attribute table is empty (Fcode/NAM null), so rivers are not named.
- Caveats: no names; snapshot date unknown (~2010s); braided channel outlines reflect one epoch; minor rivers/khals missing.

### 2b. WDBII rivers (full resolution) and GSHHS coastline polygons (full resolution), clipped to 86–95E, 18–28N
- Paths: `raw/gshhg_wdbii_basemap/wdbii_rivers_f_bengal.geojson` (469 lines, 1.3 MB), `gshhs_coast_f_bengal.geojson` (516 polygons, level 1 land / 2 lake / 3 island-in-lake, 2.4 MB), `LICENSE-LGPL.txt`.
- Source: PyPI package `basemap-data-hires` 2.0.0 (files `rivers_f.dat`, `riversmeta_f.dat`, `gshhs_f.dat`, `gshhsmeta_f.dat`), which repackages GSHHG 2.3.x (Wessel & Smith). Licence LGPL-3 (GSHHG). Converted with `scripts/basemap_dat_to_geojson.py`.
- Verified by rendering: double-line Jamuna/Padma, Meghna, Teesta, Karnaphuli, Kaptai Lake; coastline includes the Sundarbans islands.
- Caveats: WDBII rivers are 1990s CIA data, generalised and unnamed; use 2a as primary, this for cross-border rivers (Ganges in West Bengal, Brahmaputra in Assam) and for land/sea masks.

### 2c. Natural Earth 10 m physical layers, clipped to 84–97E, 16–30N
- Path: `raw/naturalearth_10m_physical/*_bengal.geojson` (rivers_lake_centerlines_scale_rank 88 features, coastline, lakes, geography_marine_polys) + `LICENSE.md` (public domain).
- Source: raw.githubusercontent.com/nvkelso/natural-earth-vector/master/10m_physical/.
- Note: NE bathymetry polygons are NOT in this repo (only in the NE raster/bathymetry downloads, blocked).

### 2d. Inland water transport routes and river ports
- Path: `raw/iwt_routes_ports/bgd_iwt_routes.geojson` (222 lines, reprojected from EPSG:32645), `bgd_ports.geojson` (26 river ports with names, district, division).
- Source: same Vanderbilt repo (routes attributed to "Tess at UT-Austin", ports to "MacKenzie"); no licence file.

### 2e. Other
- `ifahimreza/bangladesh-geojson` full file list: `src/data/bangladesh.geojson` (upazila polygons, 544), `bd-major-routes.geojson`, `bd-bazars.geojson` (3,478 OSM bazar points, saved to `raw/poi_bazars_ifahimreza/`), `bd-postcodes.json`, `bd-divisions.json`, `bd-districts.json`, `bd-upazilas.json`, `dhaka-city.json`, `bangladesh.geojson.meta.json`. No river/water file. Licence MIT (code) + ODbL (data).
- OSM `waterway=river`/`natural=water` extracts: not found on any reachable host. Overpass, Geofabrik, HDX HOTOSM exports (hotosm_bgd_waterways) and osmdata.org are blocked. HydroRIVERS/HydroSHEDS: no GitHub mirror found (only processing scripts). GRWL: Zenodo only.

---

## 3. CYCLONE TRACKS

### 3a. IBTrACS v04r01 North Indian basin, 6-hourly interpolated, 1842–Nov 2025, with names  (PRIMARY)
- Paths: `raw/cyclones_ibtracs_ni/ibtracs_NI_v04r01_tracks_6h_interp.csv` (30,633 rows, columns ISO_TIME, LAT, LON, WIND (kt), PRES (hPa), SID, NAME, SEASON), `ibtracs_NI_v04r01_storms_summary.json` (1,716 storms: sid, name, season, start/end, peak_wind_kt, min_pressure_hpa, category, basin, genesis lat/lon), `prepare_ibtracs_SOURCE_SCRIPT.py` (the processing script).
- Source: `data/processed/` in https://github.com/d1panshuparmar/tropical-cyclone-patterns, generated from `ibtracs.NI.list.v04r01.csv` (NOAA NCEI, public domain). Repo has no licence file; IBTrACS itself is public domain.
- Verified: contains Sidr 2007 (115 kt), Nargis 2008, Aila 2009, Mahasen:Viyaru 2013, Komen 2015, Roanu 2016, Mora 2017, Fani 2019, Bulbul 2019, Amphan 2020 (130 kt), Yaas 2021, Sitrang 2022, Mocha 2023 (115 kt), Remal 2024, Dana 2024, Fengal 2024, Montha, Senyar, Ditwah, Shakhti 2025. Unnamed Bhola Nov 1970 = SID 1970312N12086 (track reaches 23.0N 92.0E); April 1991 cyclone = SID 1991113N10091 (127 kt). 545 storms have points inside 88–93E, 20–24N.
- Caveats (from the script): wind taken from NEWDELHI_WIND, then WMO_WIND, then USA_WIND; tracks interpolated to a regular 6-h grid; missing WIND filled with 25 kt and missing PRES with 1000 hPa (so pre-1970s storms show 25 kt / 1000 hPa placeholders, e.g. Bhola 1970). No basin/subbasin column in the CSV (storms.json has basin). Provisional 2025 tracks included as in IBTrACS.

### 3b. IBTrACS since-1980 global 6-hourly subsets (WMO and JTWC columns) bundled in PyPI `huracanpy` 1.5.0
- Paths: `raw/cyclones_ibtracs_huracanpy/ibtracs_since1980_wmo_6h_huracanpy1.5.0.csv` (149,703 rows; track_id, season, basin, time, lon, lat, wind, slp) and `..._jtwc_...csv` (adds status, sshs_cat).
- Source: https://pypi.org/project/huracanpy/ (MIT), files `huracanpy/_data/_ibtracs_files/{wmo,jtwc}.csv`; IBTrACS public domain; developer snapshot May 2024 (seasons 1980–2024, provisional seasons and spur tracks removed).
- Verified: NI basin 449 storms (wmo) / 258 (jtwc), 1980–2024.
- Caveats: no storm names (join on SID = track_id with 3a); WMO winds have agency-specific averaging.

### Also found
- `rkb81/Hurricane-Tracking-Exploration` has the full `ibtracs.NA.list.v04r00.csv` (North Atlantic only, 55 MB), `OCHA-DAP/ocha-lens` a small IBTrACS netCDF test fixture, npm `@worldwideview/wwv-plugin-hurricane-tracks` NA only. Not copied.

---

## 4. FLOOD / INUNDATION

Nothing usable was obtainable.
- `OCHA-DAP/pa-anticipatory-action` (Bangladesh GloFAS/FFWC trigger analysis) and `OCHA-DAP/pa-aa-bgd-storms`: code and notebooks only; FFWC, GloFAS, Sentinel-1 and JRC GSW inputs are fetched from blocked hosts.
- `Tarunno360/cumilla-flood-geospatial-analysis` (2024 Cumilla flood, Sentinel-1): only outputs (PDF maps, CSV summaries, an HTML map), extents are downloaded at run time.
- `rakibhhridoy/rimes-mapathon` (national flood hazard surfaces incl. JRC water, Sentinel-1 labels): data archive on Zenodo.
- `parth-sharma-10/IndiaFloodBench-GEE`: `data/tabular/indiafloodbench.csv` (30 MB) holds Sentinel-1/2 patch samples with flood labels for 10 Indian events, incl. Assam 2022/2024 and Amphan 2020 (Indian Sundarbans). Point samples, not extents; left in the scratch clone, not copied.
- JRC Global Surface Water, Global Flood Database (Tellman), UNOSAT/HDX flood extents, Dartmouth Flood Observatory, MODIS NRT flood, Sen1Floods11: all on blocked hosts (GCS, GEE, HDX, UNOSAT, CSDMS).
- Practical alternative for the 3D map: derive a "low-lying / inundation-prone" surface from the SRTM 90 m DEM (e.g. < 5 m, < 10 m) plus the WFP water polygons; add real event extents later from HDX (UNOSAT 2019/2020/2022/2024 products) when a host is reachable.

---

## 5. SEA LEVEL / SUBSIDENCE / SALINITY / EROSION

Nothing obtained.
- PSMSL (Hiron Point 1358, Khepupara 1359, Cox's Bazar 1360, Charchanga 1357): psmsl.org blocked; no GitHub mirror of `rlr_monthly` found; no PyPI/npm package bundles it. Alternative: PSMSL "complete dataset" zip, or the EMODnet ERDDAP `PSMSL_rlr_annual` table.
- Subsidence (Steckler/Higgins GNSS), SRDI soil salinity, CEGIS bank erosion, Ganges-Brahmaputra sediment load, Sundarbans/Global Mangrove Watch area change: not found on reachable hosts (GMW is on Zenodo; CEGIS/SRDI publish PDFs only).

---

## 6. POPULATION

### 6a. GPWv4 population density 2015, 30 arc-sec (~1 km), masked to Bangladesh
- Path: `raw/pop_gpw4_2015/bangladesh_gpwv4_popdensity_2015_30arcsec.tif` (560 x 707 px, float32 persons/km2, nodata -9999, EPSG:4326, extent 88.008–92.675E, 20.742–26.633N).
- Source: `data/bangladesh_population.rda` in `adammwilson/DataScienceData` (SEDAC GPWv4 Population Density 2015, cropped/masked to GADM BGD). Licence: CC BY 4.0 (CIESIN). Converted with `scripts/rda_raster_to_tif.py`.
- Verified: 177,387 valid cells, range 19.8–154,258 persons/km2, Dhaka cell 655 (grid cell containing coordinates 90.41, 23.81; neighbouring city cells are much higher).
- Caveats: 2015 vintage, masked to national boundary, density not count.

### 6b. BBS 2011 census population by division / district / upazila with 5-year age groups
- Path: `raw/pop_bbs2011_cran_bangladesh/pop_upazila_2011.csv` (544 rows, with admin3Pcode / ADM2_PCODE / ADM1_PCODE), `pop_district_2011.csv` (64), `pop_division_2011.csv` (8), `area_names.csv` (5,160 unions).
- Source: CRAN package `bangladesh` (GitHub mirror `cran/bangladesh`, MIT), data from BBS 2011 census via HDX. Converted with Python `rdata`.

### 6c. Already in hand
- `/home/claude/work/data/raw/population_admin.csv`: division and district populations 2011 and 2022 (BBS census via Wikipedia) with area_km2.
- `/home/claude/work/data/raw/roads/bd-upazilas.json`: 494 upazilas (id, district_id, name, bn_name), no population.
- WorldPop 100 m / GHSL: blocked (worldpop.org, JRC); no GitHub/npm mirror found (npm `worldpop` is a web tool, `@pipeworx/mcp-worldpop` an API client).

---

## 7. ADMIN (already present, not re-downloaded)
- `/home/claude/work/data/raw/roads/admin/bangladesh.geojson`: 544 upazila polygons (ifahimreza, properties upazila_id, district_id, division_id, names EN/BN), ODbL.
- `/home/claude/work/data/raw/roads/admin/upazilas.json`, `districts.json`, `unions.json` (nuhil/bangladesh-geocode style tables), `LICENSE-DATA` (ODbL).
- geoBoundaries ADM1/ADM2 and BBS upazilas as noted by the main session.
- Extra admin sources seen but not copied: `cran/bangladesh` (map_country/division/district/upazila/union .rda, sf objects), `mkim2019/bangladesh_inland_water_transport/data/shapefiles/bgd_{nation,divisions,districts,upazilas}` (HDX admin boundaries as of 2015).

---

## Scratch clones (not deliverables)
All cloned repos are under `/tmp/claude-0/-home-claude/971b3f00-83af-58bc-94ac-cbb3dfb6b162/scratchpad/` (DataScienceData, geocat-datafiles ~2 GB, bangladesh_inland_water_transport, tropical-cyclone-patterns, IndiaFloodBench-GEE, ocha/*, etc.). `pipdl/` holds the downloaded wheels (huracanpy, basemap-data, basemap-data-hires).

---
---

# SECOND PASS (geodata scout, 2026-10-25, later session): land cover, forests, rivers, wetlands, DEM

Reachability re-tested this session: everything in the first pass still holds. New: `conda.anaconda.org` (conda-forge, bioconda, r channels) answers, but holds nothing relevant beyond what PyPI already gave. api.github.com answers but is restricted to repository-scoped endpoints of configured repos (search/releases listing 403). Still blocked: every CRAN mirror (cran.r-project.org, cloud, posit package manager, 60+ university mirrors), HuggingFace + hf-mirror, geodata.ucdavis.edu, naciscdn, GADM, gitlab/codeberg/bitbucket/gitee, figshare/osf/dataverse/archive.org, all AWS/GCS/Azure open-data buckets, Planetary Computer, HydroSHEDS, WDPA cloudfront, geonames, every Overpass/OSM mirror (openstreetmap.fr, bbbike, protomaps, waterwaymap), ICIMOD, amerigeoss, wikimedia/wikidata, worldpop, stanford/btaa geo portals. WebSearch restricted to `github.com` is the discovery method that worked; `git clone --depth 1` and GitHub release downloads then fetch the data.

## 8. LAND COVER

### 8a. ESA WorldCover 2021 v200, 10 m, clipped to Bangladesh  (PRIMARY LAND COVER)
- Paths: `raw/landcover_esa_worldcover2021_bgd/LULC_ESA_WorldCover_Bangladesh-0000000000-0000000000.tif` (99 MB, 52004 x 65536 px, uint8, LZW, tiled, no overviews) and `..-0000065536-0000000000.tif` (the 239-row southern sliver, 92 KB). Derived here: `worldcover2021_bgd_90m_mode.tif` (5200 x 6553, 2.2 MB) and `worldcover2021_bgd_270m_mode.tif` (1733 x 2184, 0.3 MB), majority vote per block ignoring class 0, made with `scripts/worldcover_downsample.py`.
- Source: GitHub release https://github.com/strangec137/mark15-bangladesh-lulc-ec3/releases/download/v1.0/ (GEE export of `ESA/WorldCover/v200` clipped to a Bangladesh boundary; repo MIT, data CC BY 4.0, ESA WorldCover project 2021, Zanaga et al. 2022, doi:10.5281/zenodo.7254221).
- CRS/extent: EPSG:4326, pixel 0.0000898 deg (10 m), bounds lon 88.0086–92.6802, lat 20.7253–26.6340.
- Classes present (count at 90 m): 10 tree cover 5.95 M cells, 20 shrub 261, 30 grassland 145 k, 40 cropland 7.39 M, 50 built-up 163 k, 60 bare 61 k, 80 permanent water 903 k, 90 herbaceous wetland 187 k, 95 mangroves 402 k; 0 = outside the clip boundary (18.9 M). No class 70/100.
- Verified with rasterio; preview rendered: Sundarbans solid class 95, CHT and Madhupur/Sylhet hill forests class 10, haor basin classes 80/90, Dhaka/Chattogram class 50. Spot checks at 270 m: Dhaka 50, Keokradong 10, Madhupur 10, Hakaluki 80, Kaptai Lake 80, Barind 40.
- Caveats: (1) the clip boundary used by the exporter excludes the main river channels and the estuary (Padma, Jamuna, Lower Meghna show as class 0, not 80), so pair it with the WFP water polygons (2a) for water; (2) nothing outside Bangladesh; (3) WorldCover 2021 v200 is not directly comparable to the 2020 v100 map.

### 8b. MODIS MCD12C1 2019 (Collection 6) IGBP land cover, global 0.05 deg (~5.6 km)  (REGIONAL CONTEXT: India, Myanmar, Bay)
- Path: `raw/landcover_mcd12c1_2019_global/MCD12C1.A2019001.006.2020220162300.tif` (1.2 MB, 7200 x 3600, uint8, nodata 255, global -180..180 / -90..90, Clarke-1866 geographic CRS as written by the packager; treat as EPSG:4326 for this purpose).
- Source: https://github.com/JPL-Evapotranspiration-Algorithms/MCD12C1-2019-v006 (also PyPI `MCD12C1-2019-v006`), Apache-2.0 packaging; data NASA LP DAAC public domain (Friedl & Sulla-Menashe, doi:10.5067/MODIS/MCD12C1.006).
- IGBP classes 0 water, 1-5 forests, 6-7 shrub, 8-9 savanna, 10 grass, 11 wetland, 12 cropland, 13 urban, 14 crop/natural mosaic, 15 snow, 16 barren. Verified: Dhaka cell = 13, CHT cell = 8, all 17 classes present.
- Use: fills 86.5–93.5 E outside the WorldCover clip at 5 km; also the only reachable "MODIS land cover". MCD12Q1 500 m clipped to Bangladesh was not found on any reachable host.

### 8c. Land-cover candidates tried and failed (for the record)
- GitHub: `aazizbau/BDlulcModel` (coastal LULC, code only, rasters on Drive), `Shakawat098/KHULNA_LULC_CLASSIFICATION` (four 30 KB Khulna-city rasters), `ShohanRony/rangamati-landcover-change-1993-2023` (GEE scripts + validation points only), `takiuddintopu/northwest-bangladesh-climate-lulc-analysis` (PNG maps only), `fmad121581-hub/uhi-dhaka` (Dhaka boundary only), `mabrook-code/bangladesh-lst-random-forest`, `habibullah-2107046/bd-air-pollution-2025`, `ChinmoyGhoshShuvo/*` (tables/figures only), `sheikhsulaiman/ecovision` (patches, no national raster), `AbidHasanRafi/mlc-bd` (image chips), `stactools-packages/esa-cci-lc` (example STAC only), `opengeos/datasets` releases (probed 50 asset names; only `raster/dem.tif` exists, US), `giswqs/data` (US rasters only).
- Packages: `salem` sample data (no land cover; has a 30-arc-sec Himalaya DEM, see 12a), `geodatasets` (registry pointing at blocked hosts), `rasterdiv` (copNDVI only), `landscapemetrics` (Poland CCI sample), `geodata`/`MODIStsp`/`sdmpredictors` (downloaders), `cartopy_offlinedata`/`basemap-data` (Natural Earth/GSHHG only), npm (no land-cover packages at all; `clc-eu` is Europe), conda-forge (nothing beyond the above).
- Hosted-only (blocked): ESA WorldCover tiles N21E087/N21E090/N24E087/N24E090 (AWS), CGLS-LC100 (VITO), ESA CCI-LC (CEDA/Copernicus CDS), GLC_FCS30/GlobeLand30 (Zenodo/NGCC), Dynamic World (GEE), FAO/BFD Bangladesh Land Cover 2015 (bfis.bforest.gov.bd), ISCGM Global Map Bangladesh 1992 land cover (Columbia/MIT geo portals).

## 9. FORESTS, PROTECTED AREAS, MANGROVES, TEA

### 9a. Protected-area polygons: NOT FOUND on any reachable host
- Tried: `q3dresearch/wss-protected-areas` (WDPA mirror, but it stores only aggregate CSV observations; the raw zip is in off-GitHub object storage; confirms Bangladesh has 60 WDPA sites, 20,594 km2 listed, top site "Sundarbans Reserved Forest" WDPA 67808 = 29% of the national total), `FRBCesab/worldpa`, `ghislainv/pywdpa`, `prioritizr/wdpar` (API clients only), `rahulIITISMDhanabd/sunderban` (Indian Sundarbans sub-districts only), `noushadjaman/sundarban_sentinel_astroforge`, `SAFIUL-ALAM200/SUNDARBAN-SENTINEL`, `cloud-pantheon/ParkWise-Bangladesh`, `MachangDoniel/chengmi-cht-repository`, `Sajeed7804/CHT-Forest-Change` (no boundaries), `Mizanfwt04/Mangrove_forest_resilience_Sundarbans` (xlsx tables), `flora-carbon/mangrove-atlas`, `Vizzuality/mangrove-atlas`, `stactools-packages/global-mangrove-watch` (code), `datta07/INDIAN-SHAPEFILES` (3.6 GB, admin/roads/rail only, deleted), Natural Earth `ne_10m_parks_and_protected_lands` (US only). WDPA, Protected Planet, Ramsar RSIS, GMW (Zenodo), BFD/BFIS, OSM `boundary=protected_area` are all on blocked hosts. No GitHub mirror of a Bangladesh WDPA extract, OSM protected-area extract, or BFD reserved-forest layer exists as far as 30+ searches can tell.
- Best proxy from data in hand (done, see 9b/9c): forest extent from WorldCover class 10 (tree cover) and 95 (mangroves). Sundarbans Reserved Forest = the class-95 block west of 90.3 E; CHT reserved forests = class-10 mass east of 91.8 E; Madhupur/Bhawal sal tracts = class-10 patches around 90.0–90.3 E / 24.0–24.8 N; Lawachara/Rema-Kalenga/Satchari = class-10 patches in Moulvibazar/Habiganj hills (91.7–91.9 E, 24.1–24.4 N); Teknaf/Himchari = class-10 strip 92.0–92.3 E, 20.8–21.5 N; Kaptai = class-80 lake polygon around 92.2 E, 22.5–22.8 N. For label points a hand-curated table of PA centroids would have to be typed from published coordinates; not generated here.

### 9b. Natural Earth 10 m geography regions (named physical regions), Bengal clip
- Path: `raw/naturalearth_10m_physical/ne_10m_geography_regions_polys_bengal.geojson` (18 polygons, public domain). Contains "Sundarbans" (Wetlands), "Ganges Delta", "Khasi Hills", "Chin Hills", "Arakan Yoma", "Naga Hills", "Chota Nagpur Plateau", "Ganges Plain", "Himalayas", "Plateau of Tibet" etc. Generalised label polygons, not boundaries.

### 9c. Mangrove extent derived from WorldCover 2021 class 95 (real data, derived product)
- Paths: `raw/mangroves_worldcover2021_derived/mangrove_class95_polygons_90m.geojson` (57 polygons >= 0.5 km2, total 3,696 km2: Sundarbans + SW coast 38 polygons / 3,625 km2; Meghna estuary chars and Nijhum Dwip plantations 15 / 51 km2; Chattogram-Cox's Bazar coast 4 / 20 km2) and `sundarbans_mangrove_extent_closed400m.geojson` (one polygon, creeks closed with a 400 m buffer, 3,965 km2, bounds 89.05–90.26 E, 21.72–22.50 N).
- Comparison: Bangladesh Sundarbans Reserved Forest is 6,017 km2 of which about 4,100 km2 land; 3,625 km2 of 90 m mangrove cells is in the expected range (WorldCover drops narrow creek banks and mixed pixels).
- Global Mangrove Watch itself (v3/v4, Zenodo) was not reachable; no GitHub mirror found (`boettiger-lab/data-workflows`, `portolan-sdi/portolan-data` only have ingest issues).

### 9d. Hansen Global Forest Change loss year, Chattogram Hill Tracts, 30 m, 2001–2023
- Path: `raw/forest_loss_hansen_cht_2001_2023/cht_loss_year.tif` (int16, values 0 = no loss, 1–23 = loss year 2001–2023, EPSG:32646, 3288 x 9387 px, 30 m, extent 368–467 km E / 2,343–2,625 km N UTM 46N = roughly 91.7–92.7 E, 21.2–23.7 N), `cht_recovery_map_2018.tif` (uint8 0/1/255), `cht_annual_loss_by_district.csv`.
- Source: https://github.com/Sajeed7804/CHT-Forest-Change (no licence file; data = Hansen/UMD/Google/USGS/NASA GFC v1.11, CC BY 4.0, masked to >= 30% canopy in 2000). Verified with rasterio. Caveat: Hansen loss includes jhum rotation and plantation harvest, as the repo README stresses.

### 9e. Tea gardens, Sylhet: small hand-digitised set only
- Path: `raw/tea_gardens_sylhet_ecovision/sylhet_tea_estates.geojson` (12 polygons, 1–721 ha, hand-digitised on Google Earth 2026-08, around 91.85–92.02 E, 24.92–24.98 N, Sylhet Sadar / Khadimnagar area), `sylhet_tea_candidates*.geojson` (23 + 22 automatically detected candidate polygons with tree/built fractions, unreviewed), `sylhet_tea_estates_worklist.csv` (19 estate names with upazila, no coordinates).
- Source: https://github.com/sheikhsulaiman/ecovision (MIT). Caveat: covers Sylhet district only; the main tea belt (Sreemangal/Moulvibazar/Habiganj, ~160 estates) is not in it. No Bangladesh Tea Board or BBS tea-estate polygon layer was found anywhere reachable.

## 10. RIVERS (second pass)

### 10a. HydroRIVERS v1.0 (Asia) extract around Bangladesh, reaches with mean discharge >= 150 m3/s  (BEST CROSS-BORDER CHANNEL NETWORK)
- Path: `raw/rivers_hydrorivers_v10_bgd_dis150/hydrorivers_v10_as_bgd_dis_ge150.geojson` (2,489 LineStrings, 5,385 km, attributes `dis` = DIS_AV_CMS rounded (150–40,397 m3/s), `ord` = ORD_FLOW class 2–4; coordinates rounded to 3 decimals ~100 m). Bounds lon 87.785–93.023, lat 20.573–27.027. Extraction script kept as `EXTRACT_SCRIPT_hydrorivers_bd.py`.
- Source: `maps/dash/rivers_bd.geojson` in https://github.com/sadiulchyon/northern-fringe-extraction-atlas (PhD atlas, repo states "no licence is granted yet" for its own results, but this file is a mechanical subset of HydroRIVERS v1.0, Lehner & Grill 2013, HydroSHEDS licence: free for commercial and non-commercial use with attribution).
- Also: `hydrorivers_border_crossings_deluair.csv` (1,675 points where HydroRIVERS reaches cross the Bangladesh border: HYRIV_ID, direction into/out of BD, upstream area, mean discharge, Strahler order, JRC GSW max occurrence, division, lon/lat), from https://github.com/deluair/bangladesh-water-ml (MIT).
- Verified with geopandas. Caveats: no river names (HydroRIVERS has none); only reaches >= 150 m3/s, so Surma/Kushiyara/Gorai/Teesta are present but Buriganga, Halda, Naf, Muhuri, Feni are mostly below threshold; the full HydroRIVERS Asia shapefile (hydrosheds.org) is not reachable and no GitHub mirror of it exists (checked 15 HydroRIVERS repos: all code only).

### 10b. OpenStreetMap water polygons (Nov 2017 planet), Bengal clip, from npm `@geo-maps`
- Paths: `raw/water_osm_geomaps_2017/osm2017_river_polygons_bengal.geojson` (3,155 polygons from `@geo-maps/earth-rivers-10m` 0.6.0 = OSM `water=river`/riverbank areas, 12,948 km2 inside 86.5–93.5 E / 19.8–27 N) and `osm2017_waterbodies_bengal_inland.geojson` (4,193 polygons < 100,000 km2 from `@geo-maps/earth-waterbodies-10m` 0.6.0: rivers + lakes + Kaptai Lake + Sundarbans channels + estuary pieces, 14,715 km2; the global sea polygon was dropped because it is topologically invalid).
- Source: registry.npmjs.org (simonepri/geo-maps, code MIT, data ODbL, OpenStreetMap contributors, snapshot 2017-11-30). Verified by rendering: Ganges/Padma, Jamuna, Brahmaputra (Assam), Teesta, Meghna, Karnaphuli, Kaptai, Sundarbans creeks, West Bengal Hooghly all present; coverage is the sparse 2017 OSM state (many Bangladeshi rivers only partially drawn). No names, no attributes.

### 10c. Global Map / LGED-style minor river lines "riverl_bgd"
- Path: `raw/rivers_riverl_bgd_bdmaps/riverl_bgd_lines.geojson` (1,070 LineStrings, 17,627 km, `len_km` added here; bounds 88.05–92.59 E, 21.14–26.54 N; no attributes).
- Source: `data/riverl_bgd (1).json` in https://github.com/nh4522/BDmaps (MIT). File name matches the ISCGM Global Map Bangladesh "riverl" (river line) layer; names were stripped by the uploader. Rendered: dense single-line network of the smaller rivers and khals (complements the WFP major-river polygons 2a, which it does not duplicate).

### 10d. River-name anchors (the only named river data reachable)
- `raw/gauges_ffwc_kalopathor/ffwc_gauges.geojson`: 26 FFWC gauge points with `station` and `river` (Kushiyara at Amalshid, Jamuna at Aricha/Bahadurabad/Fulchari/Kazipur, Titas, Karatoa-Atrai, Kirtonkhola, Padma at Bhagyakul, Upper Meghna at Bhairab Bazar, Lower Meghna at Chandpur, Brahmaputra at Chilmari/Noonkhawa, Teesta at Dalia, Balu, Old Brahmaputra at Jamalpur/Mymensingh, Gorai at Kamarkhali, Rupsa at Khulna, Dharla at Kurigram, Lakhya at Narayanganj, Meghna at Narsingdi, Muhuri at Parshuram, Feni at Ramgarh, Surma at Sunamganj/Sylhet). Source https://github.com/realsamiul/Kalopathor-public (no licence file; FFWC station list is public government data). Same folder: `kalopathor_river_centerlines_rivers_bgd.geojson` (843 derived centerlines with `len_px`, provenance "river centerlines" from a MERIT-based pipeline, unnamed).
- Natural Earth 10 m rivers (2c) names in the clip: Ganges, Brahmaputra, Tista, Manas, Dihang, Luhit, Mahananda (spelt "Mahana Nadi" with diacritics in NE), Kaladan; nothing for Padma, Jamuna, Meghna, Surma, Kushiyara, Karnaphuli, Gorai, Madhumati, Arial Khan, Dhaleshwari, Buriganga, Sangu, Matamuhuri, Naf, Atrai, Old Brahmaputra, Feni, Muhuri, Halda, Pasur, Baleshwar, Bishkhali, Tetulia, Rupsa.
- `Kalopathor-public/data/erosion/erosion_layer.geojson` (not copied; 3,003 cells tagged river_name Jamuna/Padma/Meghna) could be used to tag those three.
- Conclusion: a named river-line layer for Bangladesh (OSM waterway=river with names, LGED/WFP `bgd_hyd_rivers` lines, BWDB network, DIVA-GIS `BGD_water_lines_dcw`, GeoNames hydrographic features) does not exist on any reachable host. Searched for `bgd_hyd_rivers_lged`, `bgd_watcrsl`, `water_lines_dcw`, `hotosm_bgd_waterways`, `bd_rivers.geojson`, `bangladesh_rivers.geojson`, `riverl_bgd`/`rivera_bgd`, Bangla-language queries, GeoNames mirrors (`Aareon/GeoNamesMirror` release `allCountries.zip` is only the postal-code dump), npm (`@geo-maps` is the only OSM water package), PyPI/conda (nothing). Proxy: hand-assign names to the WFP polygons (2a) / HydroRIVERS reaches (10a) using the 26 FFWC gauge anchors, the Natural Earth names and known geography; ~30 rivers is a one-hour manual job in QGIS or by a small lookup table of (name, lon, lat) way-points.

## 11. WETLANDS, HAORS, FLOODS (second pass)

### 11a. Hakaluki Haor and Tanguar Haor polygons
- Path: `raw/wetlands_haor_aburaihan21/haor_hakaluki_tanguar.geojson` (2 polygons; Hakaluki 404 km2, bounds 91.94–92.18 E, 24.54–24.80 N; Tanguar 159 km2, 90.98–91.17 E, 25.08–25.20 N), originals in `Hakaluki Haor/` and `Tanguar Haor/` (shapefiles, EPSG:4326 on a Clarke-1866 datum tag, ArcGIS 10.8, 2023-12).
- Source: https://github.com/aburaihan21/Bangladesh-All-GIS-Shapefile-Data (thesis digitisation; "feel free to use, give credit"; no formal licence). Caveat: haor outlines are seasonal; these are larger than the Ramsar core areas (Tanguar Ramsar site 95 km2, Hakaluki ECA 181 km2) and look like full-monsoon extents.

### 11b. Haor-basin water + wetland and national herbaceous-wetland polygons from WorldCover 2021 (derived)
- Paths: `raw/wetlands_haor_aburaihan21/haor_basin_water_wetland_worldcover2021_270m.geojson` (182 polygons >= 1 km2 of classes 80+90 inside 90.6–92.5 E / 24.0–25.3 N, 1,431 km2, largest 372 km2) and `herbaceous_wetland_class90_national_worldcover2021_270m.geojson` (332 polygons, 1,133 km2).
- Caveat: WorldCover is a dry-season-weighted annual composite; monsoon haor inundation (several thousand km2) is far larger. Char lands: no dedicated dataset found; derive as low-lying (SRTM < 5 m) land inside/adjacent to the WFP river polygons, or from the Kalopathor erosion-cell layer (`char_area_km2` per cell, Jamuna/Padma/Meghna only).

### 11c. Sentinel-1 flood extent series, Sunamganj haor region, May–July 2022 (bonus for section 4)
- Path: `raw/flood_s1_sunamganj2022_safewindow/flood_merged/2022MMDD.tif` (19 dates 16 May–12 Jul 2022, uint8 water 1 / dry 0 / 255 nodata, EPSG:32646, 20 m, 2473 x 2081, extent 324–373 km E / 2,744–2,786 km N = roughly 91.25–91.75 E, 24.80–25.18 N, i.e. a 49 x 42 km window around Sunamganj town), `benchmark/` (UNOSAT, RCM-1 and Chaohu-1 reference extents), `study_area.gpkg`, `science_methods.md`, `summary.csv`.
- Source: https://github.com/nadiasupti/safewindow (MIT; Sentinel-1 via GEE, regenerated 2026-10-11; IoU 0.81–0.90 vs UNOSAT). Caveat: tiny area; dates alternate between full-coverage (flooded fraction 0.32–0.41) and partial-coverage passes (0.01–0.12), so use the summary to pick full dates.

## 12. DEM (second pass)

### 12a. 30 arc-second DEM of the Himalaya / Meghalaya / north Bengal block
- Path: `raw/dem_himalaya_30s_salem/himalaya_30arcsec_78-94E_24-31.5N.tif` (int16, 1875 x 877, 0.00833 deg, EPSG:4326, bounds 78.32–93.94 E, 24.23–31.54 N, range -3..8685 m; converted here to a deflate GeoTIFF because the source file is an ENVI raw binary with a `.hdr` sidecar despite its `.tif` name).
- Source: `salem-test/grid/himalaya.tif` in https://github.com/fmaussion/salem-sample-data (test data of the `salem` Python package, author says the sample files are public domain / unencumbered; the DEM looks like GTOPO30/SRTM30). Verified: Everest cell 8408 m, Shillong 1504 m, Sylhet 27 m, Rangpur 37 m, Tanguar 3 m.
- Use: 1 km relief for the Meghalaya scarp, Assam valley and Himalaya backdrop north of 24.2 N, better than ETOPO5 (9 km). Nothing south of 24.2 N.

### 12b. MERIT-DEM-derived hillshade, Bangladesh rectangle
- Path: `raw/hillshade_merit_kalopathor/hillshade_bgd.tif` (uint8 hillshade, COG with overviews, 5938 x 7571 px, 0.000808 deg ~90 m, bounds 87.90–92.70 E, 20.60–26.72 N, EPSG:4326). Source https://github.com/realsamiul/Kalopathor-public (`docs/ASSETS_AND_URLS.md`: "~90 m MERIT grid"). Not elevation, but a ready shaded-relief texture covering the full rectangle including Indian/Myanmar margins (the SRTM 1a is masked to the border). Verified with rasterio.

### 12c. Better-than-SRTM elevation: still NOT FOUND
- FABDEM, Copernicus GLO-30/90 tiles (`Copernicus_DSM_COG_10_N23_00_E090_00_DEM` etc.), MERIT DEM/Hydro tiles (`n20e090_dem`), NASADEM: no GitHub mirror, no package. `jantomec/fabdem`, `bopen/elevation`, `mheberger/delineator` (ships only a 27-deg test flow-accumulation tile for another region), `engineeringvisuallab/bangladesh` (GLO-90 pipeline, data not bundled), `mdkhademali/bangladesh-topography` (PNG only). Kalopathor's `dem90m_bgd_full.tif` and `hand30m_bgd_full.tif` are referenced in its docs but hosted on a blocked GCS bucket. SRTM 90 (1a) stays the DEM.

## Scratch clones added this session (not deliverables)
Under `/tmp/claude-0/-home-claude/971b3f00-83af-58bc-94ac-cbb3dfb6b162/scratchpad/`: `lc/` (mark15-bangladesh-lulc-ec3, BDlulcModel, KHULNA_LULC, rangamati, northwest-bangladesh, bangladesh-topography, bangladesh-water-ml, poli-delta, Shaildhara, Mangrove_forest_resilience, MCD12C1-2019-v006, geo-vault 248 MB, safewindow, climatechain-bd, uhi-dhaka, mangrove-atlas, Awesome-Bangladesh, bangladesh-lst-random-forest, bd-air-pollution-2025 319 MB, suhi-chittagong-karachi, BD-Interactive_map, ecovision), `rv/` (BDmaps, Bangladesh-Map, Waterline-Jamuna, India-Shapefiles-Bundle, ooh-earth, bangladesh-sand-watch, GBM-Hydro-morpho, river_sentinel_prototype 352 MB, River-Bankline-Prediction, water_resources_india, delineator 254 MB, basinkit, india-flood-atlas-data, Kalopathor-public, Nasa_Hackathon, HydroSense-SWOT, northern-fringe-extraction-atlas, sentinel-agent, bangatour.com), `pa/` (wss-protected-areas, sunderban, sundarban_sentinel_astroforge 562 MB, engineeringvisuallab/bangladesh, flood_risk_in_buffer, CHT-Forest-Change, khagrachhari, chengmi, ParkWise, SUNDARBAN-SENTINEL, groundwater-potential, climate-risk-urban-flood), `own/` (ahasan722 forest-change, road-crashes, mics dashboard: nothing new beyond WDBII rivers), `npmdl/` (geo-maps tarballs + full global GeoJSONs), `geonames/` (postal-code dump, useless), `salem-sample-data`, `ne/`, `conda/` (conda-forge noarch repodata).

## What `raw/` in the published repository keeps
Only the files `pipeline/` reads: SRTM, ETOPO5, IBTrACS, GPW, GSHHS/WDBII, WFP rivers, adm1, WorldCover 90 m and 270 m majority rasters, the WorldCover-derived mangrove and haor-basin polygons, the two haor polygons, HydroRIVERS (dis ≥ 150) and the border-crossing points, the Global Map river lines, the OSM 2017 water polygons, the Hansen CHT loss-year raster and district table, and the FFWC gauge points. The 10 m WorldCover GeoTIFF (99 MB), the MODIS MCD12C1 global raster, the Natural Earth label polygons, the Sylhet tea-garden polygons, the Sunamganj Sentinel-1 flood extents, the Himalaya 30 arc-sec DEM, the MERIT hillshade and the Kalopathor river centrelines (6.7 MB, unnamed, duplicating HydroRIVERS and the Global Map lines) are documented above but not shipped, to keep the repository under GitHub's browser-upload limits. `pipeline/worldcover_downsample.py` is how the 90 m and 270 m rasters were made from the 10 m file.
