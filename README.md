# Poli (পলি): the country the rivers built

A 3D relief story about the Ganges-Brahmaputra-Meghna delta, built as a website rather than a scroll of text. The relief fills the left of the screen; a reading panel on the right carries nineteen short chapters, one claim and one figure each. Nothing is ever drawn over the country except a column of chapter dots and a legend in the corners.

Live page: https://ahasan722.github.io/poli-delta/

![Poli](notes/cover.jpg)

**Click any district** and its profile opens above the story: census population and density, how much of it lies under 5 and 10 m, how many people live on that land, what covers it, every cyclone that passed within 50 km since 1960, hill-forest loss where there is any, the named rivers that cross it. The district stays lit and the rest of the country steps back.

**Pick any storm** (a chip in the cyclone chapter, or a track on the relief) and it plays: a wind field of a few thousand streaks spins around the storm as it moves along its IBTrACS track, the ribbon draws behind it, and the card shows EM-DAT deaths, people affected and damage, the surge, the landfall, and the wind hour by hour with a marker that follows the animation.

## Chapters

The ground (WorldCover), how low it lies, the rim, every river, the silt running out, Sundarbans, the haors, hill forest going, the ground going down, raise the sea (a slider), warmer every decade, four months of rain, every tide gauge points up, cyclones since 1960 (the wind animation), the storms did not weaken but the dying stopped, floods, people, displaced, the plan.

## What is in it

| Layer | Source | How it is used |
|---|---|---|
| Relief inside Bangladesh | SRTM 90 m v4.1, CGIAR-CSI (Jarvis et al. 2008), EGM96 | warped to a 1024 × 1148 grid (about 0.7 km a texel), packed as terrain-RGB, displaced in a vertex shader |
| Relief and sea floor around it | ETOPO5 (NOAA NGDC) | far field only, capped at 260 m and faded to black at the grid edge; the Bay is held flat |
| Ground colour | ESA WorldCover 2021, 10 m (ESA / VITO, CC BY 4.0) | majority class per 0.35 km texel, sampled per pixel; the forest, haor and built-up chapters lift one class at a time |
| Water surfaces | WorldCover water; WFP / LGED river polygons; OpenStreetMap 2017 water polygons (ODbL); GSHHS coast; WDBII rivers | merged into one water flag, drawn as dark channels; far rivers as lines |
| River network | HydroRIVERS v1.0 (Lehner & Grill 2013), reaches with discharge ≥ 150 m³/s; Global Map river lines (via BDmaps, MIT) | 2,489 discharge-tinted reaches and 1,070 minor channels; 21 names by discharge class and FFWC gauge anchors |
| Forest loss | Hansen Global Forest Change v1.11, loss 2001–2023 (CC BY 4.0), Chattogram Hill Tracts | share of each texel that lost canopy, painted red; annual km² chart; per-district total |
| Haors | Hakaluki and Tanguar polygons (thesis digitisation) | outlines and areas |
| Districts | Bangladesh Bureau of Statistics, Population and Housing Census 2022 GIS layer (64 zila polygons with the census count), via justinelliotmeyers/bangladesh_2022_census_gis | id raster for picking, outlines, and one profile per district computed on the scene grid |
| Storm tracks | IBTrACS v04r01, North Indian basin (NOAA NCEI) | 90 storms since 1960 that reached 34 kt near the delta: ribbons whose width and height follow wind; the playback vortex takes each fix's position and maximum wind |
| Storm impacts | EM-DAT public table (CRED / UCLouvain), Bangladesh extract; landfall and surge from the article cited per row in `raw/disasters_emdat_bgd/SOURCE.md` | the storm card |
| Climate | World Bank CCKP / CRU TS country series 1901–2011 (Kaggle re-host, repaired, see `REPAIR_LOG.txt`); BMD 24 quality-controlled stations 1982–2022; BMD 33 stations monthly 1948–2013 (Gauhar et al. 2021 compilation) | temperature anomaly chart, monthly rainfall chart, station columns on the relief |
| Sea level | PSMSL annual RLR for the Bay of Bengal gauges (Holgate et al. 2013); CSIRO GMSL reconstruction (Church & White) | one row per gauge with an OLS trend; the global mean for context |
| People | GPW v4 2015 population count (CIESIN), 30 arc-second | one light per texel with 700 or more people; people under 10 m per district |
| Exposure table | SRTM + GPW | land area and people at or below each 0.25 m step to 10 m |
| The numbers in the text | 196 cited facts in `notes/facts.csv` | sediment, subsidence, sea level, exposure, floods, cyclone tolls and shelters, displacement, TRM and the Delta Plan |

Numbers computed from the files in `raw/`, not quoted: 39.6 % of land at or below 10 m and 13.3 % at or below 5 m (SRTM); 64.4 M people on that land (GPW); 48 % cropland, 39 % tree cover, 2.7 % mangrove (WorldCover); 3,965 km² of Sundarbans mangrove; +0.23 °C a decade at the BMD stations since 1982; 72 % of a station's rain in June–September; every tide gauge with a usable record trending up. The notebook asserts each of them.

## Repository

```
index.html, css/, js/, lib/, assets/   the page: vanilla JS, three.js 0.170, d3 7, Newsreader + IBM Plex (OFL); no build step
  js/terrain.js                        the relief shader (height, cover, water, highlights, district pick)
  js/layers.js                         storms, rivers, population, outlines, district lines, station columns, labels
  js/wind.js                           the particle wind field and the storm player
  js/story.js                          the chapters: camera, uniforms, layer opacities
  js/main.js                           scroll, rail, legend, picking, storm selection, frame loop
  js/charts.js, js/cards.js            the chapter figures; the district and storm cards
data/                                  what the page reads (height, mask, cover, pop, district_id PNGs; rivers, storms,
                                       districts, climate, sealevel, cyclones_impact, exposure JSON; outlines GeoJSON)
raw/                                   the source rasters and tables, each directory with a SOURCE.md
pipeline/make_terrain.py               raw -> data: relief, masks, population, exposure
pipeline/make_storms.py                raw -> data: storm tracks and notes
pipeline/make_cover.py                 raw -> data: land cover, water, forest loss, rivers with names, haors
pipeline/make_districts.py             raw -> data: district id raster, outlines, 64 profiles
pipeline/make_climate.py               raw -> data: climate series, tide gauges, EM-DAT impact rows
pipeline/pipeline.ipynb                runs all five and asserts the quoted numbers
pipeline/verify.py                     functional walk in headless Chromium: chapters, sliders, charts, a district click, a storm playback, phone width
pipeline/shots.py                      chapter screenshots, optionally after a district click or a storm playback
pipeline/rda_raster_to_tif.py, basemap_dat_to_geojson.py, worldcover_downsample.py   how the SRTM, GSHHG and WorldCover files were extracted
notes/facts.csv, sources.md            every number with its URL
notes/data_inventory.md                where each dataset came from and what was tried and failed
notes/story_candidates.md              the five theses the evidence could carry, graded
```

## Run it

```bash
git clone https://github.com/ahasan722/poli-delta.git && cd poli-delta
python -m http.server 8000        # open http://localhost:8000
```

`?lod=hi` draws the full 1024-column mesh (a real GPU), `?lod=low` a quarter of it with fewer wind particles (old laptops, screenshots). Default is 512 columns and 5,000 particles.

Rebuild the data: `pip install rasterio geopandas shapely pillow pandas numpy nbclient ipykernel`, then `jupyter nbconvert --execute --inplace pipeline/pipeline.ipynb`. Check the page: `pip install playwright && python pipeline/verify.py http://localhost:8000/index.html`.

Publish: push to `main`, Settings → Pages → branch `main`, folder `/ (root)`.

## How it is drawn

The relief is one `PlaneGeometry`. A custom `ShaderMaterial` decodes height from the terrain-RGB texture in the vertex shader, displaces the vertex, and builds a normal from the four neighbouring texels, so changing the exaggeration is a uniform, not a geometry rebuild. The fragment shader samples the cover, water, and district-id textures per pixel (so coasts and creeks stay sharp at any mesh density) and does the rest: the WorldCover palette or a silt ramp, per-class highlights, the Hansen loss share in red, a sea-level uniform that drowns everything at or below it, the low-plain tint, the picked district kept lit while the rest dims.

Picking is a ray against the ground plane, refined twice against the sampled height, then a lookup in the district-id raster; no raycast against the mesh. Rivers are additive `LineSegments` coloured by log discharge. Storm tracks are ribbon meshes; the selected one is revealed with `drawRange` as the vortex advances. The wind is a few thousand particles, each drawn as a six-point streak from a ring buffer of its last positions, advected by a Rankine vortex (linear to the radius of maximum wind, decaying as r^-0.62 beyond, with a small inflow) placed at the interpolated IBTrACS fix, plus a faint drift so the Bay is never still. Labels are canvas sprites rescaled every frame to a constant screen size. Chapters are plain objects in `js/story.js`; an `IntersectionObserver` on the panel tweens between them, and the rail and legend follow.

## Limits

SRTM is a surface model and the Sundarbans canopy makes the mangroves look like 10 m land; the low-lying shares are floors. WorldCover is a 2021 composite, so the haors show their dry-season face. Protected-area boundaries were not available on any reachable open host, so forests are shown as the satellite sees them. HydroRIVERS carries no names; 21 come from discharge class and FFWC gauge positions and the rest of the network is unnamed on purpose. The wind field is a textbook vortex on two numbers per fix, not a reanalysis; real storms are wider, wetter and lopsided. The CRU country series steps 0.6 °C low after 2011 in its Kaggle re-host and is cut there; the BMD series carries the recent decades. PSMSL has no Bangladesh gauge after 2003 except Chittagong, and Khepupara carries a datum problem. EM-DAT tolls differ from government tolls (Sidr 4,234 against 3,406); the card says which it shows. District statistics are computed on a 0.7 km grid, so small districts carry grid error. Vertical exaggeration is a reading aid.

## Licence

Code, text and the derived files in `data/`: CC BY 4.0, Abid Hasan, Dhaka, 2026. SRTM v4.1: CGIAR-CSI, free with attribution. ETOPO5 and IBTrACS: NOAA, public domain. ESA WorldCover 2021: CC BY 4.0. HydroRIVERS: HydroSHEDS licence. Hansen GFC: CC BY 4.0. OpenStreetMap 2017 water: ODbL, © OpenStreetMap contributors. GPW v4: CIESIN, CC BY 4.0. GSHHG/WDBII: LGPL-3. BBS Census 2022 GIS layer: Bangladesh Bureau of Statistics, as published. BMD station records: Bangladesh Meteorological Department, via the cited compilations. PSMSL: free with acknowledgement. CSIRO GMSL: ODC-PDDL via datasets/sea-level-rise. EM-DAT: CRED / UCLouvain, non-commercial use with citation (only the Bangladesh extract is kept). three.js: MIT. d3: ISC. Newsreader, IBM Plex Sans and Mono: SIL OFL 1.1.

Independent project; not affiliated with any agency named above.
