#!/usr/bin/env python3
"""
make_storms.py  --  cyclone tracks for the storms chapter.

Takes the IBTrACS North Indian basin file (v04r01, 6-hourly, interpolated by the repo I got it from)
and keeps every storm since 1960 that came within the study window and reached at least 34 kt.
The hand-curated table at the bottom (landfall, surge, deaths) comes from notes/facts.csv; the
IBTrACS file only knows position and wind.
"""
import json, math
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "raw", ROOT / "data"
t = pd.read_csv(RAW / "cyclones_ibtracs_ni/ibtracs_NI_v04r01_tracks_6h_interp.csv", parse_dates=["ISO_TIME"])
t = t[t.SEASON >= 1960]
W, E, S, N = 86.5, 93.5, 19.8, 27.0
near = t[(t.LON.between(W - 1.5, E + 1.5)) & (t.LAT.between(S - 2.0, N))]
keep = near.groupby("SID").WIND.max()
keep = set(keep[keep >= 34].index) | {"1970312N12086"}
t = t[t.SID.isin(keep)].sort_values(["SID", "ISO_TIME"])
print(f"{len(keep)} storms since 1960 near the window with >= 34 kt")

# the ones the story names, with what the record says about them (sources in notes/facts.csv)
NOTES = {
    "1970312N12086": dict(label="Bhola", year=1970, landfall="Bhola, Tazumuddin coast", surge_m=10, deaths="300,000 to 500,000", shelters=44, wind_kmh=185),
    "1991113N10091": dict(label="Gorky", year=1991, landfall="55 km south of Chattogram", surge_m=6.1, deaths="138,866", shelters=512, wind_kmh=235),
    "2007314N10093": dict(label="Sidr", year=2007, landfall="Barguna, Patuakhali", surge_m=5, deaths="3,447", shelters=None, wind_kmh=215),
    "2009143N18090": dict(label="Aila", year=2009, landfall="Sagar Island, then Khulna", surge_m=3, deaths="190 in Bangladesh", shelters=None, wind_kmh=110),
    "2013130N04093": dict(label="Mahasen", year=2013, landfall="Patuakhali", surge_m=None, deaths="17", shelters=None, wind_kmh=85),
    "2016138N14086": dict(label="Roanu", year=2016, landfall="Sitakunda, Chattogram", surge_m=None, deaths="27", shelters=None, wind_kmh=100),
    "2017148N14087": dict(label="Mora", year=2017, landfall="Chattogram to Cox's Bazar", surge_m=None, deaths="9", shelters=None, wind_kmh=110),
    "2019119N05087": dict(label="Fani", year=2019, landfall="Odisha, then Bangladesh", surge_m=None, deaths="17", shelters=None, wind_kmh=None),
    "2019302N11118": dict(label="Bulbul", year=2019, landfall="Sagar Island, then Khulna coast", surge_m=None, deaths="9", shelters=None, wind_kmh=120),
    "2020136N10088": dict(label="Amphan", year=2020, landfall="Sagar Island, West Bengal", surge_m=3.5, deaths="26 in Bangladesh", shelters=14000, wind_kmh=160),
    "2021143N14087": dict(label="Yaas", year=2021, landfall="Odisha coast", surge_m=None, deaths="tens of thousands homeless, no toll found", shelters=None, wind_kmh=None),
    "2022296N13088": dict(label="Sitrang", year=2022, landfall="Tinkona, Sandwip, near Barishal", surge_m=None, deaths="35", shelters=None, wind_kmh=85),
    "2023129N08091": dict(label="Mocha", year=2023, landfall="north of Sittwe, Myanmar", surge_m=None, deaths="3 in Bangladesh", shelters=None, wind_kmh=185),
    "2024145N14087": dict(label="Remal", year=2024, landfall="Khepupara to Mongla", surge_m=None, deaths="10 or more", shelters=None, wind_kmh=110),
}
# IBTrACS ids drift between versions; match on name + season where the id above is not present
present = set(t.SID)
by_name = {(n.upper(), s): sid for sid, n, s in t[["SID", "NAME", "SEASON"]].drop_duplicates().itertuples(index=False)}
fixed = {}
for sid, meta in NOTES.items():
    if sid in present: fixed[sid] = meta; continue
    alt = by_name.get((meta["label"].upper(), meta["year"])) or next((v for (n, y), v in by_name.items() if y == meta["year"] and n.startswith(meta["label"].upper())), None)
    if alt: fixed[alt] = meta; print("  remapped", meta["label"], "->", alt)
    elif meta["label"] == "Bhola":
        cand = t[(t.SEASON == 1970) & (t.ISO_TIME.dt.month == 11)].SID.unique();
        if len(cand): fixed[cand[0]] = meta; print("  Bhola ->", cand[0])
    else: print("  NOT FOUND", meta["label"], meta["year"])
NOTES = fixed

# IBTrACS carries no wind for the 1970 Bhola storm (the repo filled 25 kt). IMD's record says 185 km/h (100 kt)
# at landfall, so I ramp the last third of its track to that and say so in the note.
bhola = t.SID == "1970312N12086"
if bhola.any():
    n = bhola.sum(); ramp = np.clip((np.arange(n) - n * 0.4) / (n * 0.6), 0, 1)
    t.loc[bhola, "WIND"] = (25 + ramp * 75).round()
    NOTES["1970312N12086"]["wind_note"] = "IBTrACS has no wind for this storm; ribbon uses IMD's 185 km/h at landfall"
storms = []
for sid, g in t.groupby("SID", sort=False):
    pts = [[round(float(r.LON), 2), round(float(r.LAT), 2), int(r.WIND)] for r in g.itertuples()]
    name = g.NAME.iloc[0]; name = None if name in ("UNNAMED", "NOT_NAMED") else name.title()
    storms.append({"sid": sid, "name": name, "season": int(g.SEASON.iloc[0]), "peak_kt": int(g.WIND.max()),
                   "start": g.ISO_TIME.iloc[0].strftime("%Y-%m-%d"), "pts": pts, **({"note": NOTES[sid]} if sid in NOTES else {})})
storms.sort(key=lambda s: s["start"])
json.dump(storms, open(OUT / "storms.json", "w"), separators=(",", ":"))
print(f"wrote {len(storms)} storms, {sum(len(s['pts']) for s in storms)} points; named notes: {[s['note']['label'] for s in storms if 'note' in s]}")
