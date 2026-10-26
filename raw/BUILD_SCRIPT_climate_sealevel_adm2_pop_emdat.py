"""Build small raw/ datasets for the delta repo from the cloned GitHub sources."""
import os, re, json, glob
import numpy as np
import pandas as pd
import geopandas as gpd

SC = "/tmp/claude-0/-home-claude/971b3f00-83af-58bc-94ac-cbb3dfb6b162/scratchpad/climate"
RAW = "/home/claude/work/delta/repo/raw"


def out(d):
    p = os.path.join(RAW, d)
    os.makedirs(p, exist_ok=True)
    return p


# ---------------------------------------------------------------- 1a national 1901-2023
d = out("climate_bgd_national_1901_2023")
c = pd.read_csv(f"{SC}/Climate-Data-Analysis/sorted_temp_and_rain_dataset.csv")
c = c.drop(columns=["name"])
c = c.rename(columns={"tem": "temp_c", "Month": "month", "Year": "year", "rain": "rain_mm"})
# the re-hosted file is a "cleaning exercise" copy with a few planted errors; repair them, logging each
log = []
# row with missing year (index 37) sits between 1904-01 and 1904-03 -> 1904-02
for i in c.index[c.year.isna()]:
    prev_y, prev_m = c.loc[i - 1, ["year", "month"]]
    y = prev_y if prev_m < 12 else prev_y + 1
    log.append(f"row {i}: year missing, inferred {int(y)} from neighbours")
    c.loc[i, "year"] = y
for i in c.index[c.month.isna()]:
    prev_m = c.loc[i - 1, "month"]
    m = prev_m + 1 if prev_m < 12 else 1
    log.append(f"row {i}: month missing, inferred {int(m)} from neighbours")
    c.loc[i, "month"] = m
c["year"] = c.year.astype(int)
c["month"] = c.month.astype(int)
bad_t = (c.temp_c < 10) | (c.temp_c > 32)
bad_r = c.rain_mm > 2000
for i in c.index[bad_t]:
    log.append(f"{c.loc[i,'year']}-{c.loc[i,'month']:02d}: temp_c={c.loc[i,'temp_c']} implausible, set to NaN")
for i in c.index[bad_r]:
    log.append(f"{c.loc[i,'year']}-{c.loc[i,'month']:02d}: rain_mm={c.loc[i,'rain_mm']} implausible, set to NaN")
c.loc[bad_t, "temp_c"] = np.nan
c.loc[bad_r, "rain_mm"] = np.nan
c = c.sort_values(["year", "month"]).reset_index(drop=True)
assert not c.duplicated(["year", "month"]).any()
c[["year", "month", "temp_c", "rain_mm"]].to_csv(f"{d}/bgd_monthly_temp_rain_1901_2023.csv", index=False)
a = c.groupby("year").agg(temp_mean_c=("temp_c", "mean"), rain_total_mm=("rain_mm", "sum"),
                          n_months=("month", "size"), n_temp=("temp_c", "count"), n_rain=("rain_mm", "count")).reset_index()
a.loc[a.n_rain < 12, "rain_total_mm"] = np.nan  # incomplete years: no annual total
a.to_csv(f"{d}/bgd_annual_temp_rain_1901_2023.csv", index=False)
open(f"{d}/REPAIR_LOG.txt", "w").write("\n".join(log) + "\n")
print("national", c.shape, a.shape, log)

# ---------------------------------------------------------------- 1b BMD 35 stations 1948-2013
d = out("climate_bmd_stations_1948_2013")
f = pd.read_csv(f"{SC}/Flood-prediction/FloodPrediction.csv")
f = f.rename(columns={"Station_Names": "station", "Year": "year", "Month": "month", "Max_Temp": "tmax_c",
                      "Min_Temp": "tmin_c", "Rainfall": "rain_mm", "Relative_Humidity": "rh_pct",
                      "Wind_Speed": "wind_ms", "Cloud_Coverage": "cloud_okta", "Bright_Sunshine": "sunshine_h",
                      "Station_Number": "wmo_id", "LATITUDE": "lat", "LONGITUDE": "lon", "ALT": "alt_m",
                      "Flood?": "flood_flag"})
st = f.groupby("station").agg(wmo_id=("wmo_id", "first"), lat=("lat", "first"), lon=("lon", "first"),
                              alt_m=("alt_m", "first"), year_min=("year", "min"), year_max=("year", "max"),
                              n_months=("year", "size")).reset_index()
st.to_csv(f"{d}/bmd_stations.csv", index=False)
m = f[["station", "wmo_id", "year", "month", "tmax_c", "tmin_c", "rain_mm", "rh_pct", "wind_ms", "cloud_okta",
       "sunshine_h", "flood_flag"]].sort_values(["station", "year", "month"])
m.to_csv(f"{d}/bmd_station_monthly_1948_2013.csv", index=False)
g = m.groupby(["station", "year"])
an = g.agg(tmax_mean_c=("tmax_c", "mean"), tmin_mean_c=("tmin_c", "mean"), rain_total_mm=("rain_mm", "sum"),
           n_months=("month", "size"), flood_months=("flood_flag", lambda s: int((s == 1).sum()))).reset_index()
an["tmean_c"] = (an.tmax_mean_c + an.tmin_mean_c) / 2
an.loc[an.n_months < 12, "rain_total_mm"] = np.nan
an.to_csv(f"{d}/bmd_station_annual_1948_2013.csv", index=False)
# national average of station annual values (only complete station-years)
full = an[an.n_months == 12]
nat = full.groupby("year").agg(tmean_c=("tmean_c", "mean"), tmax_mean_c=("tmax_mean_c", "mean"),
                               tmin_mean_c=("tmin_mean_c", "mean"), rain_total_mm=("rain_total_mm", "mean"),
                               n_stations=("station", "size")).reset_index()
nat.to_csv(f"{d}/bmd_national_mean_of_stations_annual.csv", index=False)
print("stations", m.shape, an.shape, nat.shape, st.shape)

# ---------------------------------------------------------------- 1c BMD QC national annual 1982-2022
d = out("climate_bmd_national_annual_1982_2022")
n = pd.read_csv(f"{SC}/bd-monthly-weather-forecast-ml-paper/results/trends/national_annual_series.csv")
n = n.rename(columns={"Year": "year", "Temperature": "temp_mean_c", "Humidity": "rh_pct", "Rainfall": "rain_total_mm"})
n.to_csv(f"{d}/bmd24_national_annual_1982_2022.csv", index=False)
mk = pd.read_csv(f"{SC}/bd-monthly-weather-forecast-ml-paper/results/trends/mann_kendall.csv")
mk.to_csv(f"{d}/mann_kendall_trends.csv", index=False)
print("bmd24", n.shape, n.year.min(), n.year.max())

# ---------------------------------------------------------------- 2 sea level PSMSL
d = out("sea_level_psmsl_bay_of_bengal")
ids = {1451: "Hiron Point", 1454: "Khepupara", 1476: "Cox's Bazar", 1496: "Charchanga", 2196: "Chittagong A",
       417: "Sagar (Saugor), India", 543: "Diamond Harbour, India", 1270: "Haldia, India"}
fl = pd.read_csv(f"{SC}/tide_gauge_data_PSMSL/rlr_annual/filelist.txt", sep=";", header=None,
                 names=["id", "lat", "lon", "name", "coastline", "stationcode", "flag"])
fl["name"] = fl.name.str.strip()
fl = fl[fl.id.isin(ids)].copy()
fl["label"] = fl.id.map(ids)
fl["country"] = np.where(fl.id.isin([417, 543, 1270]), "India", "Bangladesh")
rows = []
for i in ids:
    for line in open(f"{SC}/tide_gauge_data_PSMSL/rlr_annual/data/{i}.rlrdata"):
        p = [x.strip() for x in line.split(";")]
        if len(p) < 3:
            continue
        v = float(p[1])
        rows.append(dict(psmsl_id=i, station=ids[i], year=int(p[0]), rlr_mm=(np.nan if v == -99999 else v),
                         flag_attention=p[2], missing_flag=p[3] if len(p) > 3 else ""))
ann = pd.DataFrame(rows)
ann["rlr_minus_7000_mm"] = ann.rlr_mm - 7000
ann.to_csv(f"{d}/psmsl_rlr_annual.csv", index=False)
mo = pd.read_csv(f"{SC}/tide_gauge_data_PSMSL/output_dataframes/annual_monthly_SL_tide_df.csv")
mo = mo[mo.id.isin(ids)].copy()
mo["station"] = mo.id.map(ids)
mo = mo.rename(columns={"id": "psmsl_id", "Age": "decimal_year", "RSL": "rsl_mm"})
mo = mo[["psmsl_id", "station", "decimal_year", "rsl_mm", "flag_attention_1", "flag_attention_2", "latitude", "longitude"]]
mo.to_csv(f"{d}/psmsl_rlr_monthly.csv", index=False)
mo["year"] = np.floor(mo.decimal_year).astype(int)
ma = mo[mo.rsl_mm.notna()].groupby(["psmsl_id", "station", "year"]).agg(rsl_mean_mm=("rsl_mm", "mean"), n_months=("rsl_mm", "size")).reset_index()
ma.to_csv(f"{d}/psmsl_annual_from_monthly.csv", index=False)
fl.to_csv(f"{d}/psmsl_stations.csv", index=False)
print("psmsl", ann.shape, mo.shape, ma.shape)
print(ann.groupby("station").year.agg(["min", "max", "count"]))

d = out("sea_level_gmsl_csiro")
for fn in ["CSIRO_Recons_gmsl_yr_2019.csv", "CSIRO_Recons_gmsl_mo_2015.csv", "CSIRO_Alt_yearly.csv", "CSIRO_Alt_seas_inc.csv", "epa-sea-level.csv"]:
    x = pd.read_csv(f"{SC}/sea-level-rise/data/{fn}")
    x.to_csv(f"{d}/{fn}", index=False)
    print(fn, x.shape, x.iloc[0, 0], x.iloc[-1, 0])

# ---------------------------------------------------------------- 3 + 4 districts
d = out("adm2_districts")
g = gpd.read_file(f"{SC}/bbs2022_district/district.gpkg")
keep = ["GEO_CODE", "DIVISION_CODE", "DIVISION_NAME", "DISTRICT_CODE", "DISTRICT_NAME", "TOTAL_POP", "TOTAL_MALE",
        "TOTAL_FEMALE", "SEX_RATIO", "HH_SIZE", "ENUMERATED_HH", "TOTAL_NRB", "geometry"]
g = g[keep].copy()
g["area_km2"] = g.to_crs("EPSG:6933").area / 1e6
g = g.rename(columns=str.lower)
g["pop_density_km2"] = g.total_pop / g.area_km2
gs = g.copy()
gs["geometry"] = gs.geometry.simplify(0.0005, preserve_topology=True)
gs = gs.to_crs("EPSG:4326")
gs.to_file(f"{d}/bbs2022_districts_simplified.geojson", driver="GeoJSON", coordinate_precision=5)
print("bbs geojson bytes", os.path.getsize(f"{d}/bbs2022_districts_simplified.geojson"))
gb = gpd.read_file(f"{SC}/geob/adm2_simplified.geojson")
gb.to_file(f"{d}/geoboundaries_BGD_ADM2_simplified.geojson", driver="GeoJSON", coordinate_precision=5)
print("geob", gb.shape, os.path.getsize(f"{d}/geoboundaries_BGD_ADM2_simplified.geojson"))

d = out("pop_bbs_census_districts")
pop = g.drop(columns="geometry").copy()
# merge the 2011 counts and Wikipedia area from the earlier work file
wa = pd.read_csv("/home/claude/work/data/raw/population_admin.csv")
wa = wa[wa.level == "district"].copy()
alias = {"Chittagong": "Chattogram", "Comilla": "Cumilla", "Barisal": "Barishal", "Jessore": "Jashore",
         "Bogra": "Bogura", "Maulvibazar": "Moulvibazar", "Netrakona": "Netrokona", "Chapai Nawabganj": "Chapainawabganj",
         "Nawabganj": "Chapainawabganj", "Jhalokati": "Jhalokathi", "Brahmanbaria": "Brahmanbaria",
         "Chapainababganj": "Chapainawabganj", "Netrakona": "Netrokona"}
norm = lambda s: re.sub(r"[^a-z]", "", str(s).lower())
wa["key"] = wa.name.replace(alias).map(norm)
pop["key"] = pop.district_name.replace(alias).map(norm)
mg = pop.merge(wa[["key", "name", "pop_2011", "pop_2022", "area_km2"]].rename(
    columns={"name": "wiki_name", "pop_2022": "pop_2022_wikipedia", "area_km2": "area_km2_wikipedia"}), on="key", how="left")
print("unmatched 2011:", mg[mg.pop_2011.isna()].district_name.tolist(), "| wiki unmatched:", sorted(set(wa.key) - set(pop.key)))
mg = mg.drop(columns="key").rename(columns={"total_pop": "pop_2022_bbs_gis", "area_km2": "area_km2_geom"})
mg["growth_2011_2022_pct"] = (mg.pop_2022_bbs_gis / mg.pop_2011 - 1) * 100
mg.to_csv(f"{d}/bbs_districts_population_2011_2022.csv", index=False)
ind = pd.read_csv(f"{SC}/bangladesh-census2022-district-indicators/data/census2022_district_indicators.csv")
ind.to_csv(f"{d}/census2022_district_indicators_literacy_sexratio_electricity.csv", index=False)
print("pop", mg.shape, mg.pop_2022_bbs_gis.sum(), mg.pop_2011.sum())

# ---------------------------------------------------------------- 5 EM-DAT
d = out("disasters_emdat_bgd")
em = pd.read_excel(f"{SC}/flood-data/emdat_all_disasters_2026-05-18.xlsx", sheet_name="EM-DAT Data")
b = em[(em.ISO == "BGD") & (em["Disaster Group"] == "Natural")].copy()
cols = ["DisNo.", "Disaster Type", "Disaster Subtype", "Event Name", "Location", "Origin", "Associated Types", "Magnitude",
        "Magnitude Scale", "Latitude", "Longitude", "River Basin", "Start Year", "Start Month", "Start Day", "End Year", "End Month",
        "End Day", "Total Deaths", "No. Injured", "No. Affected", "No. Homeless", "Total Affected", "Total Damage ('000 US$)",
        "Total Damage, Adjusted ('000 US$)", "CPI", "Admin Units", "Entry Date", "Last Update"]
b = b[cols]
b.columns = [re.sub(r"[^a-z0-9]+", "_", x.lower()).strip("_") for x in cols]
b = b.sort_values("disno")
b.to_csv(f"{d}/emdat_bgd_natural_disasters_1900_2026.csv", index=False)
print("emdat", b.shape, b.disaster_type.value_counts().to_dict())
yr = b[b.disaster_type.isin(["Storm", "Flood"])].groupby(["start_year", "disaster_type"]).agg(
    events=("disno", "size"), deaths=("total_deaths", "sum"), affected=("total_affected", "sum"),
    damage_000usd=("total_damage_000_us", "sum")).reset_index()
yr.to_csv(f"{d}/emdat_bgd_storm_flood_by_year.csv", index=False)

# curated named-cyclone table: EM-DAT numbers by DisNo + hand-entered landfall / surge (secondary sources, see SOURCE.md)
named = [
    # name, disno, landfall_date, landfall_district, surge_m, surge/landfall source
    ("Bhola cyclone", "1970-0063-BGD", "1970-11-12", "Bhola (Meghna estuary: Bhola, Hatiya, Noakhali coast)", "6-10",
     "Wikipedia '1970 Bhola cyclone' (JTWC/IMD); surge commonly cited 6-10 m"),
    ("Urir Char cyclone", "1985-0063-BGD", "1985-05-25", "Noakhali (Urir Char / Sandwip / Hatiya)", "3-4.6",
     "Wikipedia '1985 Bangladesh cyclone'"),
    ("Cyclone 04B", "1988-0518-BGD", "1988-11-29", "Khulna (Sundarbans / Mongla)", "2-4.4",
     "Wikipedia '1988 Bangladesh cyclone'"),
    ("Gorky (02B)", "1991-0120-BGD", "1991-04-29", "Chattogram (Patenga / Anowara, incl. Cox's Bazar, Noakhali)", "4.5-6",
     "Wikipedia '1991 Bangladesh cyclone' (BMD/JTWC); surge about 6 m"),
    ("Cyclone 01B (One Bravo)", "1997-0114-BGD", "1997-05-19", "Chattogram (Sitakunda / Banshkhali, Cox's Bazar)", "3-4.6",
     "Wikipedia '1997 Bangladesh cyclone'"),
    ("Sidr", "2007-0556-BGD", "2007-11-15", "Barguna / Patuakhali (Baleshwar river mouth; Bagerhat Sarankhola)", "5-6",
     "Wikipedia 'Cyclone Sidr' (BMD/IMD); GoB JDLNA 2008"),
    ("Aila", "2009-0204-BGD", "2009-05-25", "Satkhira / Khulna (landfall near Sagar Island, India)", "2-3",
     "Wikipedia 'Cyclone Aila'"),
    ("Mahasen (Viyaru)", "2013-0138-BGD", "2013-05-16", "Patuakhali / Barguna (Khepupara)", "1-1.5",
     "Wikipedia 'Cyclone Viyaru'"),
    ("Roanu", "2016-0175-BGD", "2016-05-21", "Chattogram (Barishal-Chattogram coast)", "1.5-2",
     "Wikipedia 'Cyclone Roanu'"),
    ("Mora", "2017-0152-BGD", "2017-05-30", "Cox's Bazar (Kutubdia / Chakaria)", "1.2-1.5",
     "Wikipedia 'Cyclone Mora'"),
    ("Fani", "2019-0164-BGD", "2019-05-04", "Satkhira / Khulna (entered as depression after Odisha landfall)", "1-1.5",
     "Wikipedia 'Cyclone Fani'"),
    ("Bulbul", "2019-0550-BGD", "2019-11-10", "Satkhira / Khulna (Sundarbans, after Sagar Island)", "1.5-2",
     "Wikipedia 'Cyclone Bulbul'"),
    ("Amphan", "2020-0211-BGD", "2020-05-20", "Satkhira / Khulna (landfall Bakkhali-Sagar Island, India)", "3-4.5",
     "Wikipedia 'Cyclone Amphan' (BMD surge forecast 3-4.5 m)"),
    ("Yaas", "2021-0295-BGD", "2021-05-26", "Satkhira / Khulna / Bhola (landfall Balasore, India)", "1-2",
     "Wikipedia 'Cyclone Yaas'"),
    ("Sitrang", "2022-0695-BGD", "2022-10-24", "Bhola / Barishal (Tinkona-Sandwip)", "1.5-2.5",
     "Wikipedia 'Cyclone Sitrang'"),
    ("Mocha", "2023-0294-BGD", "2023-05-14", "Cox's Bazar (Teknaf / St Martin's; landfall Sittwe, Myanmar)", "2-2.5",
     "Wikipedia 'Cyclone Mocha'"),
    ("Hamoon", "2023-0686-BGD", "2023-10-24", "Cox's Bazar (Kutubdia-Chattogram coast)", "1-1.5",
     "Wikipedia 'Cyclone Hamoon'"),
    ("Remal", "2024-0320-BGD", "2024-05-26", "Patuakhali / Khulna (Khepupara-Mongla; Sagar Island)", "2-3.6",
     "Wikipedia 'Cyclone Remal' (BMD)"),
]
idx = b.set_index("disno")
rows = []
for name, disno, date, district, surge, src in named:
    r = idx.loc[disno]
    rows.append(dict(cyclone=name, emdat_disno=disno, landfall_date=date, landfall_district=district,
                     surge_height_m=surge, emdat_event_name=r.event_name, emdat_locations=r.location,
                     emdat_magnitude_kmh=r.magnitude, deaths=r.total_deaths, total_affected=r.total_affected,
                     damage_000usd=r.total_damage_000_us, damage_adj_000usd=r.total_damage_adjusted_000_us,
                     impact_source=f"EM-DAT {disno} (CRED/UCLouvain, public table 2026-05-15)",
                     landfall_surge_source=src))
cy = pd.DataFrame(rows)
cy.to_csv(f"{d}/named_cyclones_bgd_1970_2024.csv", index=False)
print(cy[["cyclone", "landfall_date", "deaths", "total_affected", "damage_000usd"]])

# ---------------------------------------------------------------- 6 wind: ERA-Interim 850 hPa Jan/Jul (xarray sample)
d = out("wind_erainterim_850hpa_jan_jul")
import xarray as xr
ds = xr.open_dataset(f"{SC}/xarray-data/eraint_uvz.nc")
sub = ds.sel(level=850, latitude=slice(35, -5), longitude=slice(60, 110))
df = sub[["u", "v"]].to_dataframe().reset_index()
df = df.rename(columns={"latitude": "lat", "longitude": "lon", "u": "u850_ms", "v": "v850_ms"})
df["speed_ms"] = np.hypot(df.u850_ms, df.v850_ms)
df = df[["month", "lat", "lon", "u850_ms", "v850_ms", "speed_ms"]].round(3)
df.to_csv(f"{d}/erainterim_850hpa_uv_jan_jul_60-110E_5S-35N.csv", index=False)
print("wind", df.shape, df.month.unique())
