"""make_agri.py: raw -> data/agri.json. Per district: agro-ecological zones (BARC 2018), major crop production
(BBS, 2014-15) and the rivers that cross it (HydroRIVERS reaches as drawn on the map).
Run from the repository root: python pipeline/make_agri.py"""
import json, re, math, difflib, pathlib
import numpy as np, pandas as pd
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, DATA = ROOT / "raw", ROOT / "data"
dist = json.load(open(DATA / "districts.json"))["districts"]
NAMES = {d["name"]: d["id"] for d in dist}

ALIAS = {"bogra": "Bogura", "jessore": "Jashore", "barisal": "Barishal", "comilla": "Cumilla", "chittagong": "Chattogram",
         "chapainawabganj": "Chapainawabganj", "nawabganj": "Chapainawabganj", "noagaon": "Naogaon", "mymenshing": "Mymensingh",
         "panchagar": "Panchagarh", "khagrachari": "Khagrachhari", "jhalokathi": "Jhalokati", "jhalakati": "Jhalokati",
         "narshingdi": "Narsingdi", "maulvibazar": "Moulvibazar", "laxmipur": "Lakshmipur", "borguna": "Barguna",
         "netrakona": "Netrokona", "coxsbazar": "Cox's Bazar", "brahmanbaria": "Brahmanbaria", "bbaria": "Brahmanbaria"}
def norm(s): return re.sub(r"[^a-z]", "", str(s).lower()).replace("gonj", "ganj")
KEYS = {norm(n): n for n in NAMES}
def match(raw):
    k = norm(raw)
    if not k or any(w in str(raw).lower() for w in ("division", "region", "bangladesh")): return None
    if k in ALIAS: return ALIAS[k]
    if k in KEYS: return KEYS[k]
    m = difflib.get_close_matches(k, KEYS.keys(), n=1, cutoff=0.8)
    return KEYS[m[0]] if m else None

# ---- crops ----------------------------------------------------------------------------------------------
# The BBS extract has one table per crop and year. Some recent tables carry shifted or mistyped rows, so for each
# crop the script takes the latest year whose 64 district values add up to the table's own national total (0.1%).
# Jute is left out: its recent tables give no national total to check against.
YR = re.compile(r"^(20\d\d)-(\d\d|20\d\d)$")
def num(v):
    try: f = float(str(v).replace(",", ""))
    except ValueError: return None
    return None if math.isnan(f) else f
CROPS = {"aman": "amon.xlsx", "boro": "boro.xlsx", "aus": "aus.xlsx", "wheat": "wheat.xlsx", "potato": "potato.xlsx"}
PCOL = {"wheat": 6}                     # wheat's last column is yield, production sits in column 6
crops, years = {}, {}
for crop, f in CROPS.items():
    rows = pd.read_excel(RAW / "agri_bbs_major_crops" / f, header=None).values.tolist(); res = {}
    for i, r in enumerate(rows):
        for j in (0, 1):
            m = YR.match(str(r[j]).strip())
            if not (m and int(m.group(1)) >= 2005): continue
            y = f"{m.group(1)}-{str(int(m.group(1)) + 1)[2:]}"; out = res.setdefault(y, [{}, None])
            for rr in rows[i + 1: i + 75]:
                c0 = str(rr[0]).strip()
                if "Table" in c0 or YR.match(c0) or YR.match(str(rr[1]).strip()): break
                if crop in PCOL: p = num(rr[PCOL[crop]])
                else: vals = [num(v) for v in rr[2:] if num(v) is not None]; p = vals[-1] if vals else None
                if "BANGLADESH" in str(rr[1]).upper(): out[1] = p; continue
                n = match(rr[1])
                if n and p is not None and n not in out[0]: out[0][n] = p
    good = [y for y, (o, nat) in res.items() if len(o) == 64 and nat and abs(sum(o.values()) / nat - 1) < 0.001]
    y = max(good); crops[crop] = res[y][0]; years[crop] = y
    print(f"{crop:7s} {y}: 64 districts, {sum(crops[crop].values()):,.0f} t = national total in the table")

# ---- agro-ecological zones -------------------------------------------------------------------------------
aez = pd.read_csv(RAW / "aez_barc_frg2018" / "aez_districts.csv")
assert set(aez.district) <= set(NAMES), set(aez.district) - set(NAMES)
zones = {int(z): {"name": g.aez_name.iloc[0], "area_ha": (None if pd.isna(g.aez_area_ha.iloc[0]) else int(g.aez_area_ha.iloc[0]))} for z, g in aez.groupby("aez")}

# ---- rivers per district: each mapped reach is cut at district lines through the id raster ----------------------
GRID = dict(W=86.5, E=93.5, S=19.8, N=27.0)
idimg = np.array(Image.open(DATA / "district_id.png"))[..., 0]; H, W = idimg.shape
def did(lon, lat):
    if not (GRID["W"] <= lon < GRID["E"] and GRID["S"] < lat <= GRID["N"]): return 0
    return int(idimg[min(H - 1, int((GRID["N"] - lat) / (GRID["N"] - GRID["S"]) * H)), min(W - 1, int((lon - GRID["W"]) / (GRID["E"] - GRID["W"]) * W))])
def km(a, b):
    la = math.radians((a[1] + b[1]) / 2); return math.hypot((b[0] - a[0]) * 111.32 * math.cos(la), (b[1] - a[1]) * 111.32)
riv = json.load(open(DATA / "rivers.json")); per = {d["id"]: {"major_km": 0.0, "minor_km": 0.0, "named": {}} for d in dist}
for kind in ("major", "minor"):
    for l in riv[kind]:
        for a, b in zip(l["c"], l["c"][1:]):
            i = did((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if not i: continue
            L = km(a, b); per[i][kind + "_km"] += L
            if kind == "major" and l.get("name"):
                n = per[i]["named"].setdefault(l["name"], [0.0, 0.0]); n[0] += L; n[1] = max(n[1], l["dis"])

# ---- assemble ------------------------------------------------------------------------------------------------
out = {"crop_years": years,
       "national": {c: round(sum(v.values())) for c, v in crops.items()}, "zones": zones, "districts": {}}
for d in dist:
    n, i = d["name"], d["id"]
    z = aez[aez.district == n].sort_values("area_00ha", ascending=False)
    r = per[i]; land = d.get("land_km2") or d["area_km2"]
    named = sorted(([k, round(v[0], 1), round(v[1])] for k, v in r["named"].items() if v[0] >= 2), key=lambda x: -x[2])
    out["districts"][i] = {
        "aez": [[int(a), int(h * 100)] for a, h in zip(z.aez, z.area_00ha)],
        "crops": {c: (round(v[n]) if n in v else None) for c, v in crops.items()},
        "rivers": {"major_km": round(r["major_km"]), "minor_km": round(r["minor_km"]), "density": round((r["major_km"] + r["minor_km"]) / d["area_km2"] * 100, 1), "named": named[:8]}}
# ranks among the 64 for each crop
for c in crops:
    vals = sorted(((v["crops"][c] or 0), k) for k, v in out["districts"].items()); vals.reverse()
    for rank, (_, k) in enumerate(vals, 1): out["districts"][k].setdefault("crop_rank", {})[c] = rank
missing_aez = [d["name"] for d in dist if not out["districts"][d["id"]]["aez"]]
missing_crop = {c: [d["name"] for d in dist if out["districts"][d["id"]]["crops"][c] is None] for c in crops}
print("districts without an AEZ row:", missing_aez)
print("districts missing a crop value:", {k: v for k, v in missing_crop.items() if v})
json.dump(out, open(DATA / "agri.json", "w"), separators=(",", ":"))
print("wrote data/agri.json", (DATA / "agri.json").stat().st_size, "bytes")
