#!/usr/bin/env python3
"""
make_climate.py  --  the climate and sea-level series the page draws, from the files in raw/ (see each SOURCE.md).

data/climate.json
  national.cru      annual mean temperature and rainfall 1901-2011 (CCKP / CRU TS country average, via Kaggle re-host;
                    the 2012-2023 extension is dropped because it steps 0.6 C below the BMD series, see SOURCE.md)
  national.bmd24    annual mean temperature and rainfall 1982-2022, mean of 24 quality-controlled BMD stations
  monthly           rainfall and temperature by calendar month, mean over 33 BMD stations 1948-2013
  stations          33 BMD stations with coordinates, mean annual rainfall, and the temperature trend (C per decade)
data/sealevel.json
  gauges            PSMSL annual relative sea level for the Bay of Bengal gauges (mm, RLR minus 7000) with an OLS trend
  gmsl              CSIRO global mean sea level reconstruction, annual, mm relative to 1990
data/cyclones_impact.json
  EM-DAT deaths / affected / damage for the named Bangladesh cyclones, with landfall and surge from the cited articles
"""
import json
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "raw", ROOT / "data"
r1 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 1)
r2 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 2)
def slope(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float); ok = ~np.isnan(y)
    if ok.sum() < 10: return None
    return float(np.polyfit(x[ok], y[ok], 1)[0])

# ---- 1. national series -------------------------------------------------------------------------
cru = pd.read_csv(RAW / "climate_bgd_national_1901_2023/bgd_annual_temp_rain_1901_2023.csv")
cru = cru[(cru.year <= 2011) & (cru.n_months == 12)]
bmd = pd.read_csv(RAW / "climate_bmd_national_annual_1982_2022/bmd24_national_annual_1982_2022.csv")
base = cru[(cru.year >= 1961) & (cru.year <= 1990)].temp_mean_c.mean()
# the two series are different station sets; align them on their common years so the chart shows one story
common = sorted(set(cru.year) & set(bmd.year)); off = bmd[bmd.year.isin(common)].temp_mean_c.mean() - cru[cru.year.isin(common)].temp_mean_c.mean()
national = {
    "baseline_1961_1990_c": round(float(base), 2), "bmd_offset_c": round(float(off), 2),
    "cru": [{"y": int(r.year), "t": r2(r.temp_mean_c), "a": r2(r.temp_mean_c - base), "p": None if pd.isna(r.rain_total_mm) else int(r.rain_total_mm)} for r in cru.itertuples()],
    "bmd24": [{"y": int(r.year), "t": r2(r.temp_mean_c), "a": r2(r.temp_mean_c - off - base), "p": None if pd.isna(r.rain_total_mm) else int(r.rain_total_mm)} for r in bmd.itertuples()],
    "trend_cru_c_per_decade": r2(slope(cru.year, cru.temp_mean_c) * 10), "trend_bmd_c_per_decade": r2(slope(bmd.year, bmd.temp_mean_c) * 10),
    "trend_cru_1981_2011_c_per_decade": r2(slope(cru[cru.year >= 1981].year, cru[cru.year >= 1981].temp_mean_c) * 10),
}
print("national: CRU 1901-2011 trend", national["trend_cru_c_per_decade"], "C/decade; since 1981", national["trend_cru_1981_2011_c_per_decade"], "; BMD24 1982-2022", national["trend_bmd_c_per_decade"], "; offset", national["bmd_offset_c"])

# ---- 2. monthly climatology and the stations ----------------------------------------------------
mo = pd.read_csv(RAW / "climate_bmd_stations_1948_2013/bmd_station_monthly_1948_2013.csv")
clim = mo.groupby("month").agg(rain=("rain_mm", "mean"), tmax=("tmax_c", "mean"), tmin=("tmin_c", "mean")).reset_index()
monthly = [{"m": int(r.month), "rain": int(round(r.rain)), "tmax": r1(r.tmax), "tmin": r1(r.tmin)} for r in clim.itertuples()]
ann_rain = float(clim.rain.sum()); jjas = float(clim[clim.month.isin([6, 7, 8, 9])].rain.sum()); print(f"monthly: {ann_rain:.0f} mm a year at a station, {jjas / ann_rain * 100:.0f}% in June-September")
st = pd.read_csv(RAW / "climate_bmd_stations_1948_2013/bmd_stations.csv")
sa = pd.read_csv(RAW / "climate_bmd_stations_1948_2013/bmd_station_annual_1948_2013.csv"); sa = sa[sa.n_months == 12]
stations = []
for r in st.itertuples():
    a = sa[sa.station == r.station]
    tr = slope(a.year, a.tmean_c) if len(a) >= 30 else None
    stations.append({"name": r.station, "lat": r.lat, "lon": r.lon, "years": [int(r.year_min), int(r.year_max)], "n_years": int(len(a)),
                     "rain_mm": int(round(a.rain_total_mm.mean())) if len(a) else None, "trend_c_per_decade": r2(tr * 10) if tr is not None else None,
                     "warming": r2(tr * 10 * 5) if tr is not None else None})    # the column on the map: trend over fifty years
print("stations:", len(stations), "with trend", sum(s["trend_c_per_decade"] is not None for s in stations), "median trend", np.nanmedian([s["trend_c_per_decade"] or np.nan for s in stations]))
# rainfall by year, station mean, for the monsoon chart's second line
ry = sa.groupby("year").rain_total_mm.mean().reset_index(); rain_years = [{"y": int(r.year), "p": int(round(r.rain_total_mm))} for r in ry.itertuples() if 1950 <= r.year <= 2013]
json.dump({"national": national, "monthly": monthly, "annual_station_rain_mm": int(round(ann_rain)), "monsoon_share_pct": round(jjas / ann_rain * 100), "rain_by_year": rain_years, "stations": stations,
           "sources": {"cru": "World Bank CCKP / CRU TS country average 1901-2011 (Kaggle re-host nomanabdullah26/Climate-Data-Analysis, repaired)", "bmd24": "BMD, 24 QC stations, 1982-2022 (abir-hosen-ashik/bd-monthly-weather-forecast-ml-paper)", "stations": "BMD 33 stations monthly 1948-2013 (n-gauhar/Flood-prediction, Gauhar et al. 2021)"}},
          open(OUT / "climate.json", "w"), separators=(",", ":"))

# ---- 3. sea level -----------------------------------------------------------------------------------
ps = pd.read_csv(RAW / "sea_level_psmsl_bay_of_bengal/psmsl_rlr_annual.csv"); ps = ps[(ps.missing_flag == 0) & ps.rlr_minus_7000_mm.notna()]
pst = pd.read_csv(RAW / "sea_level_psmsl_bay_of_bengal/psmsl_stations.csv")
KEEP = {"Hiron Point": "Hiron Point", "Khepupara": "Khepupara", "Cox's Bazar": "Cox's Bazar", "Charchanga": "Charchanga", "Chittagong A": "Chattogram", "Diamond Harbour": "Diamond Harbour (India)"}
gauges = []
for name, label in KEEP.items():
    a = ps[ps.station.str.lower() == name.lower()].sort_values("year")
    if a.empty: a = ps[ps.station.str.lower().str.startswith(name.lower()[:6])].sort_values("year")
    if a.empty: print("no gauge rows for", name); continue
    meta = pst[pst.name.str.lower().str.contains(name.lower()[:6])]
    y0 = a.rlr_minus_7000_mm.iloc[:3].mean()
    gauges.append({"name": label, "psmsl_id": int(a.psmsl_id.iloc[0]), "lat": float(meta.lat.iloc[0]) if len(meta) else None, "lon": float(meta.lon.iloc[0]) if len(meta) else None,
                   "years": [int(a.year.min()), int(a.year.max())], "n": int(len(a)), "trend_mm_yr": r1(slope(a.year, a.rlr_minus_7000_mm)),
                   "series": [[int(r.year), int(r.rlr_minus_7000_mm - y0)] for r in a.itertuples()]})
for g in gauges: print(f"gauge {g['name']}: {g['years']} n={g['n']} trend {g['trend_mm_yr']} mm/yr")
gm = pd.read_csv(RAW / "sea_level_gmsl_csiro/CSIRO_Recons_gmsl_yr_2019.csv"); gm.columns = [c.strip() for c in gm.columns]
ycol = next(c for c in gm.columns if "time" in c.lower() or "year" in c.lower()); vcol = next(c for c in gm.columns if "gmsl" in c.lower() and "unc" not in c.lower())
gm["year"] = gm[ycol].astype(float).astype(int); ref = gm[(gm.year >= 1986) & (gm.year <= 1995)][vcol].mean()
gmsl = [[int(r.year), int(round(r._asdict()[vcol] - ref))] for r in gm.itertuples()]
json.dump({"gauges": gauges, "gmsl": gmsl, "gmsl_trend_1993_2019_mm_yr": r1(slope(gm[gm.year >= 1993].year, gm[gm.year >= 1993][vcol])),
           "note": "PSMSL annual RLR, relative sea level (includes the sinking ground); Bangladesh gauges run 1977-2003 only, Chittagong 2007-2018. GMSL: CSIRO reconstruction (Church & White), relative to 1986-1995."},
          open(OUT / "sealevel.json", "w"), separators=(",", ":"))

# ---- 4. the named storms' impact table ---------------------------------------------------------------
em = pd.read_csv(RAW / "disasters_emdat_bgd/named_cyclones_bgd_1970_2024.csv")
rows = []
for r in em.itertuples():
    rows.append({"name": r.cyclone.replace(" cyclone", "").replace("Cyclone ", ""), "year": int(str(r.landfall_date)[:4]), "disno": r.emdat_disno, "landfall": r.landfall_district if isinstance(r.landfall_district, str) else None,
                 "surge_m": r.surge_height_m if isinstance(r.surge_height_m, str) else r1(r.surge_height_m), "deaths": None if pd.isna(r.deaths) else int(r.deaths),
                 "affected": None if pd.isna(r.total_affected) else int(r.total_affected), "damage_musd": None if pd.isna(r.damage_000usd) else round(r.damage_000usd / 1000),
                 "damage_adj_musd": None if pd.isna(r.damage_adj_000usd) else round(r.damage_adj_000usd / 1000), "wind_kmh": None if pd.isna(r.emdat_magnitude_kmh) else int(r.emdat_magnitude_kmh)})
json.dump(rows, open(OUT / "cyclones_impact.json", "w"), separators=(",", ":"))
print("impact rows:", len(rows), [x["name"] for x in rows])
