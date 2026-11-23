"""make_rain.py  --  v14: rainfall.  -> data/rain.json
Stations: BMD monthly rainfall at 33 stations, 1948-2013 (re-host by Gauhar et al. 2021; see raw/climate_bmd_stations_1948_2013).
For each station: mean rainfall of each calendar month over the years that month was recorded, 1981-2010 where the station
has at least 20 such years, otherwise over its whole record. Districts: inverse-distance (power 2) from the 6 nearest stations,
so a district's value is an estimate, not a measurement. Yearly series: mean of the stations (1950-2013) and the BMD 24-station
QC panel (1982-2022).
"""
import json, math, pathlib
import pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[1]; RAW = ROOT / "raw"
M = pd.read_csv(RAW / "climate_bmd_stations_1948_2013/bmd_station_monthly_1948_2013.csv")
S = pd.read_csv(RAW / "climate_bmd_stations_1948_2013/bmd_stations.csv")
M = M.dropna(subset=["rain_mm"])
stations = []
for _, s in S.iterrows():
    d = M[M.station == s.station]
    if d.empty: continue
    base = d[(d.year >= 1981) & (d.year <= 2010)]
    use = base if base.groupby("month").size().min() >= 20 and base.month.nunique() == 12 else d
    mon = use.groupby("month").rain_mm.mean().reindex(range(1, 13))
    if mon.isna().any() or len(d.year.unique()) < 10: continue
    stations.append({"name": s.station.replace("Chittagong (City-Ambagan)", "Chattogram (Ambagan)").replace("Chittagong", "Chattogram").replace("Barisal", "Barishal").replace("Comilla", "Cumilla").replace("Jessore", "Jashore").replace("Bogra", "Bogura"),
                     "lon": float(s.lon), "lat": float(s.lat), "m": [round(v) for v in mon], "y": round(mon.sum()), "span": [int(d.year.min()), int(d.year.max())],
                     "base": "1981-2010" if use is base else "whole record"})
# one Chattogram is enough
names = [s["name"] for s in stations]
if "Chattogram" in names and "Chattogram (Ambagan)" in names: stations = [s for s in stations if s["name"] != "Chattogram (Ambagan)"]
stations.sort(key=lambda s: -s["y"])
print(len(stations), "stations;", [(s["name"], s["y"]) for s in stations[:5]], "...", [(s["name"], s["y"]) for s in stations[-3:]])

dist = json.load(open(ROOT / "data/districts.json"))["districts"]
def idw(lon, lat, k):
    ds = sorted(((math.hypot((s["lon"] - lon) * 102.5, (s["lat"] - lat) * 110.8), s) for s in stations), key=lambda t: t[0])[:6]
    if ds[0][0] < 1: return ds[0][1]["m"][k]
    w = [1 / d ** 2 for d, _ in ds]; return sum(wi * s["m"][k] for wi, (_, s) in zip(w, ds)) / sum(w)
districts = {d["name"]: [round(idw(d["centroid"][0], d["centroid"][1], k)) for k in range(12)] for d in dist}
nat = [round(sum(s["m"][k] for s in stations) / len(stations)) for k in range(12)]
yrs = pd.read_csv(RAW / "climate_bmd_stations_1948_2013/bmd_national_mean_of_stations_annual.csv")
b24 = pd.read_csv(RAW / "climate_bmd_national_annual_1982_2022/bmd24_national_annual_1982_2022.csv")
print(yrs.columns.tolist())
ycol = [c for c in yrs.columns if "rain" in c][0]
years = [[int(r.year), round(getattr(r, ycol))] for r in yrs.itertuples() if not pd.isna(getattr(r, ycol)) and r.year >= 1950]
y24 = [[int(r.year), round(r.rain_total_mm)] for r in b24.itertuples() if not pd.isna(r.rain_total_mm)]
out = {"stations": stations, "districts": districts, "national": nat, "years": years, "years24": y24,
       "src": "Bangladesh Meteorological Department monthly station rainfall, 1948-2013 (33 stations; re-host by Gauhar, Das and Moury 2021). Monthly means 1981-2010 where a station has 20 or more years, otherwise its whole record. District values are inverse-distance estimates from the six nearest stations.",
       "src24": "BMD 24-station quality-controlled national annual rainfall, 1982-2022 (Hosen et al., bd-monthly-weather-forecast-ml-paper)."}
p = ROOT / "data/rain.json"; p.write_text(json.dumps(out, separators=(",", ":"))); print("national", nat, sum(nat), round(p.stat().st_size / 1024), "KB")
print(sorted(districts.items(), key=lambda x: -sum(x[1]))[:4], sorted(districts.items(), key=lambda x: sum(x[1]))[:3])
