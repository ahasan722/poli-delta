"""make_pop.py  --  v15: population 1971-2050, health access and burden.  -> data/pop.json

National
  Series: World Bank WDI population 1960-2025 (annual), BBS census counts 1974-2022 (enumerated and adjusted).
  Models, each fitted on 1960-2010 and scored on 2011-2025 (15 years never seen in fitting):
    logistic growth curve, Gompertz curve, quadratic trend in the growth rate (the growth rate falls on a curve,
    population is its running sum), gradient-boosted trees on the growth rate (features: year, last year's growth,
    fertility), and Gaussian-process regression on the growth rate.
  The two with the lowest error are refitted on 1960-2025 and averaged; the band is the backtest error, widened
  with the square root of the horizon. The World Bank / UN projection is shown beside it, not mixed into it.
District
  Series: BBS census 1991, 2001, 2011, 2022, adjusted for under-enumeration (Jhenaidah and Meherpur scaled by the
  residual factor so the 64 add up to the national adjusted totals).
  Models, fitted on 1991-2011 and scored on 2022: constant share, share trend (log-linear), own exponential
  growth, and gradient-boosted trees on decade growth (trained on the 1991-2001 -> 2001-2011 step, features:
  previous growth, density, size, Dhaka-ring flag). The best is refitted on 1991-2022 and its shares are scaled to
  the national projection, so districts always add up to the country.
Access
  Population: GPW v4 2015 density (about 1 km) rescaled inside each district to its 2022 census count.
  Facilities: upazila health complexes from OpenStreetMap (HOTOSM export, Nov 2026), plus the upazila's centroid
  where OSM has none (one complex per rural upazila is government policy); district hospitals at each district
  headquarters; tertiary: government medical college hospitals and national institutes (OSM point, or the host
  district headquarters). Straight-line distance from every 1 km cell to the nearest facility of each kind.
"""
import json, math, pathlib, warnings
import numpy as np, pandas as pd, rasterio
from rasterio import features
from shapely.geometry import shape, Point
from scipy.optimize import curve_fit
from scipy.spatial import cKDTree
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, WhiteKernel, ConstantKernel
warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parents[1]; RAW = ROOT / "raw"
NAT = json.loads((RAW / "pop_national_wb/wb.json").read_text())
wdi = np.array(NAT["wdi_pop"], float); yrs, pop = wdi[:, 0], wdi[:, 1]
tfr = dict((int(a), b) for a, b in NAT["tfr"]); tf = np.interp(yrs, list(tfr), list(tfr.values()))
H = 2050; FUT = np.arange(2026, H + 1)

# ---------- national models ----------
def logistic(t, K, r, t0): return K / (1 + np.exp(-r * (t - t0)))
def gompertz(t, K, b, c): return K * np.exp(-b * np.exp(-c * (t - 1960)))
def roll(p0, g):  # population from a start value and yearly growth rates
    out = [p0]
    for x in g: out.append(out[-1] * (1 + x))
    return np.array(out[1:])
gr = np.r_[np.nan, pop[1:] / pop[:-1] - 1]

def fit_predict(name, tr, te_years, tf_future):
    t, p = yrs[tr], pop[tr]
    if name == "Logistic curve":   # curve shape from the fit, anchored to the last observed year
        P, _ = curve_fit(logistic, t, p, p0=[2.2e8, 0.04, 1995], maxfev=20000); return logistic(te_years, *P) * p[-1] / logistic(t[-1], *P)
    if name == "Gompertz curve":
        P, _ = curve_fit(gompertz, t, p, p0=[2.5e8, 1.8, 0.03], maxfev=20000); return gompertz(te_years, *P) * p[-1] / gompertz(t[-1], *P)
    g = gr[tr][1:]; tg = t[1:]
    if name == "Growth-rate curve":
        c = np.polyfit(tg - 2000, g, 2); gf = np.polyval(c, te_years - 2000)
    elif name == "Boosted trees":
        X = np.c_[np.r_[g[0], g[:-1]], tf[tr][1:]]
        m = GradientBoostingRegressor(n_estimators=300, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=0).fit(X, g)
        gf, last = [], g[-1]
        for i, y in enumerate(te_years): v = m.predict([[last, tf_future[i]]])[0]; gf.append(v); last = v
        gf = np.array(gf)
    elif name == "Ridge on fertility":
        # growth follows fertility now and fertility a generation (25 years) earlier, which sets how many parents there are
        from sklearn.linear_model import Ridge
        tf25 = lambda ys: np.array([tf_path([y])[0] if y >= 1960 else 6.75 for y in np.asarray(ys) - 25])
        X = np.c_[tf_path(tg), tf25(tg)]; m = Ridge(alpha=0.1).fit(X, g)
        gf = m.predict(np.c_[tf_future, tf25(te_years)])
    elif name == "Gaussian process":
        k = ConstantKernel(1e-4) * RBF(15.0) + WhiteKernel(1e-7)
        m = GaussianProcessRegressor(k, normalize_y=True, random_state=0).fit((tg - 2000)[:, None], g)
        gf = m.predict((te_years - 2000)[:, None])
    gf = np.maximum(gf, -0.01); return roll(p[-1], gf)

# fertility path for the future: WDI to 2024, then a gentle glide to 1.9 by 2050 (only used by the trees)
def tf_path(ys): return np.array([tfr[2024] + (1.9 - tfr[2024]) * min(max((y - 2024) / 26, 0), 1) if y > 2024 else np.interp(y, list(tfr), list(tfr.values())) for y in ys])
MODELS = ["Logistic curve", "Gompertz curve", "Growth-rate curve", "Ridge on fertility", "Boosted trees", "Gaussian process"]
# two backtests: a short one (fit to 2010, test 2011-2025) and a long one close to the real horizon (fit to 1995, test 1996-2025)
score = {}
for m in MODELS:
    r = {}
    for cut in (2010, 1995):
        tr = yrs <= cut; te = yrs > cut
        pr = fit_predict(m, tr, yrs[te], tf_path(yrs[te])); e = (pr - pop[te]) / pop[te]
        r[cut] = (float(np.mean(np.abs(e)) * 100), float(e[-1] * 100))
    score[m] = {"mape": (r[2010][0] + r[1995][0]) / 2, "mape15": r[2010][0], "mape30": r[1995][0], "err2025": r[1995][1]}
rank = sorted(MODELS, key=lambda m: score[m]["mape"]); best = [m for m in rank if score[m]["mape"] < 10]   # drop any model off by 10% or more
full = yrs <= 2025
paths = {m: fit_predict(m, full, FUT, tf_path(FUT)) for m in MODELS}
wt = {m: 1 / score[m]["mape"] for m in best}; W = sum(wt.values())
ens = sum(paths[m] * wt[m] for m in best) / W                   # weighted by how well each did in the backtests
lo = np.min([paths[m] for m in best], axis=0); hi = np.max([paths[m] for m in best], axis=0)
band = [[float(a), float(b)] for a, b in zip(lo, hi)]
wbp = dict((int(a), b) for a, b in NAT["wb_proj"])
print("ensemble", best, "2030 %.1f  2040 %.1f  2050 %.1f M" % tuple(ens[FUT == y][0] / 1e6 for y in (2030, 2040, 2050)), " WB 2050 %.1f M" % (wbp[2050] / 1e6))
natproj = {int(y): float(v) for y, v in zip(FUT, ens)}
natall = {int(y): float(p) for y, p in zip(yrs, pop)}; natall.update(natproj)

# ---------- district census ----------
D = pd.read_csv(RAW / "census_districts_1991_2022/districts_adjusted.csv")
U = pd.read_csv(RAW / "census_districts_1991_2022/unadjusted_two.csv")
adj = {y: n for y, _, n in [(1991, 0, 111455000), (2001, 0, 130523000), (2011, 0, 149772364), (2022, 0, 169829000)]}
for y in (1991, 2001, 2011, 2022):
    f = (adj[y] - D[f"p{y}"].sum()) / U[f"p{y}"].sum(); U[f"p{y}"] = (U[f"p{y}"] * f).round().astype(int); print(y, "residual factor", round(f, 3))
D = pd.concat([D, U]).reset_index(drop=True)
FIX = {"Moulvibazar": "Moulvibazar", "Netrokona": "Netrokona"}
dist = json.loads((ROOT / "data/districts.json").read_text())["districts"]
names = [d["name"] for d in dist]; miss = set(names) - set(D.district); assert not miss, miss
D = D.set_index("district").loc[names]; CY = [1991, 2001, 2011, 2022]
P = D[[f"p{y}" for y in CY]].to_numpy(float)
area = np.array([d["land_km2"] or d["area_km2"] for d in dist], float)
RING = {"Dhaka", "Gazipur", "Narayanganj", "Narsingdi", "Munshiganj", "Manikganj"}
ring = np.array([n in RING for n in names], float)

def dmodel(name, Ptr, ytr, ytarget):
    """predict district populations in ytarget from census columns Ptr at years ytr"""
    S = Ptr / Ptr.sum(0)
    if name == "Constant share": return S[:, -1]
    if name == "Share trend":
        b = np.array([np.polyfit(ytr, np.log(s), 1)[0] for s in S]); s = S[:, -1] * np.exp(b * (ytarget - ytr[-1])); return s / s.sum()
    if name == "Own growth":
        b = np.array([np.polyfit(ytr, np.log(p), 1)[0] for p in Ptr]); p = Ptr[:, -1] * np.exp(b * (ytarget - ytr[-1])); return p / p.sum()
    if name == "Boosted trees":
        # learn decade growth from the step before; needs three censuses
        X, Y = [], []
        for i in range(len(ytr) - 2):
            g0 = np.log(Ptr[:, i + 1] / Ptr[:, i]) / (ytr[i + 1] - ytr[i]); g1 = np.log(Ptr[:, i + 2] / Ptr[:, i + 1]) / (ytr[i + 2] - ytr[i + 1])
            X.append(np.c_[g0, np.log(Ptr[:, i + 1] / area), np.log(Ptr[:, i + 1]), ring]); Y.append(g1)
        X, Y = np.vstack(X), np.concatenate(Y)
        m = GradientBoostingRegressor(n_estimators=250, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=0).fit(X, Y)
        g0 = np.log(Ptr[:, -1] / Ptr[:, -2]) / (ytr[-1] - ytr[-2])
        g = m.predict(np.c_[g0, np.log(Ptr[:, -1] / area), np.log(Ptr[:, -1]), ring])
        p = Ptr[:, -1] * np.exp(g * (ytarget - ytr[-1])); return p / p.sum()
DM = ["Constant share", "Share trend", "Own growth", "Boosted trees"]
dscore = {}
truth = P[:, 3] / P[:, 3].sum()
for m in DM:
    s = dmodel(m, P[:, :3], np.array(CY[:3], float), 2022) * adj[2022]
    e = (s - P[:, 3]) / P[:, 3]; dscore[m] = {"mape": float(np.mean(np.abs(e)) * 100), "worst": names[int(np.argmax(np.abs(e)))], "worst_err": float(np.max(np.abs(e)) * 100)}
drank = sorted(DM, key=lambda m: dscore[m]["mape"]); dbest = drank[0]
print("district backtest (fit 1991-2011, test 2022):", {m: round(dscore[m]["mape"], 2) for m in drank})

# shares forward: the trend of the last censuses, damped so that no district runs away. The damping (how fast a share's
# trend fades) is chosen the same way: fit 1991-2011, predict 2022, keep the half-life with the smallest error.
S = P / P.sum(0); ys = np.array(CY, float)
def damped(Sx, ysx, slope_years, target, hl):
    sl = np.array([np.polyfit(ysx[slope_years], np.log(s[slope_years]), 1)[0] for s in Sx]); t = target - ysx[-1]
    eff = t if hl is None else (1 - math.exp(-math.log(2) / hl * t)) / (math.log(2) / hl)
    v = Sx[:, -1] * np.exp(sl * eff); return v / v.sum()
hl_score = {}
for hl in (None, 40, 20, 10, 7, 5, 3, 2, 1):
    v = damped(S[:, :3], ys[:3], slice(0, 3), 2022, hl) * adj[2022]; hl_score[hl] = float(np.mean(np.abs(v - P[:, 3]) / P[:, 3]) * 100)
HL = min(hl_score, key=hl_score.get)
vb = damped(S[:, :3], ys[:3], slice(0, 3), 2022, HL) * adj[2022]; eb = (vb - P[:, 3]) / P[:, 3]
dscore[f"Share trend, damped"] = {"mape": float(np.mean(np.abs(eb)) * 100), "worst": names[int(np.argmax(np.abs(eb)))], "worst_err": float(np.max(np.abs(eb)) * 100)}
drank = sorted(dscore, key=lambda m: dscore[m]["mape"]); dbest = drank[0]
print("half-life backtest:", {str(k): round(v, 3) for k, v in hl_score.items()}, "->", HL)
if dbest == "Constant share": HL_USE = 0
def share_at(y):
    if dbest == "Constant share": return S[:, -1]
    if dbest != "Share trend, damped": raise SystemExit("district model changed: " + dbest)
    return damped(S, ys, slice(1, 4), y, HL)
YS = list(range(1991, H + 1))
dpop = {}
for y in YS:
    if y <= 2022:  # between censuses: interpolate each district's log population, then scale to the WDI-adjusted national
        v = np.exp([np.interp(y, ys, np.log(p)) for p in P])
    else: v = share_at(y) * natall[y]
    dpop[y] = v
# ---------- access ----------
src = rasterio.open(RAW / "pop_gpw4_2015/bangladesh_gpwv4_popdensity_2015_30arcsec.tif"); dens = src.read(1).astype(float); dens[dens < 0] = 0
tfm = src.transform; h, w = dens.shape
lat = tfm.f + (np.arange(h) + 0.5) * tfm.e; lon = tfm.c + (np.arange(w) + 0.5) * tfm.a
cell = (abs(tfm.e) * 110.57) * (abs(tfm.a) * 111.32 * np.cos(np.radians(lat)))[:, None]
pc = dens * cell
G = json.loads((ROOT / "data/districts.geojson").read_text())
idg = features.rasterize([(f["geometry"], f["properties"]["id"]) for f in G["features"]], out_shape=(h, w), transform=tfm, fill=0, dtype="int32")
id2i = {d["id"]: i for i, d in enumerate(dist)}
# GPW spreads each census unit evenly, so it puts people in the Sundarbans and on the rivers. Move them onto land people
# can live on: weight each cell by its share of ESA WorldCover 2021 that is not water (80), wetland (90) or mangrove (95).
from rasterio.warp import reproject, Resampling
wc = rasterio.open(RAW / "landcover_esa_worldcover2021_bgd/worldcover2021_bgd_270m_mode.tif"); wa = wc.read(1)
hab = np.zeros((h, w), dtype="float32")
reproject(np.isin(wa, [10, 20, 30, 40, 50, 60]).astype("float32"), hab, src_transform=wc.transform, src_crs=wc.crs, dst_transform=tfm, dst_crs=src.crs, resampling=Resampling.average)
pc = pc * np.where(hab >= 0.15, hab, 0)
cellpop = np.zeros_like(pc)
for d in dist:
    m = idg == d["id"]; s = pc[m].sum()
    if s > 0: cellpop[m] = pc[m] * dpop[2022][id2i[d["id"]]] / s
LO, LA = np.meshgrid(lon, lat); ok = cellpop > 0
km = lambda a: np.c_[a[:, 0] * 102.5, a[:, 1] * 110.8]   # local km at ~23.7N
XY = km(np.c_[LO[ok], LA[ok]]); CP = cellpop[ok]; CD = idg[ok]

UP = json.loads((RAW / "admin_upazilas_geoboundaries/upazilas.geojson").read_text())["features"]
ALIAS = {"Barisal": "Barishal", "Bogra": "Bogura", "Comilla": "Cumilla", "Chittagong": "Chattogram", "Jessore": "Jashore", "Maulvibazar": "Moulvibazar", "Nawabganj": "Chapainawabganj", "Netrakona": "Netrokona", "Chapai Nawabganj": "Chapainawabganj", "Khagrachari": "Khagrachhari", "Sirajgonj": "Sirajganj"}
DG = [(f["properties"]["name"], shape(f["geometry"])) for f in G["features"]]
up = []
for f in UP:
    p = f["properties"]; g = shape(f["geometry"]); c = g.representative_point()
    dn = next((n for n, dg in DG if dg.contains(c)), None) or ALIAS.get(p["district_name"], p["district_name"])
    if dn not in names: continue
    akm = g.area * 102.5 * 110.8
    up.append({"name": p["name"], "district": dn, "geom": g, "c": c, "sadar": "Sadar" in p["name"], "city": akm < 60 and dn in ("Dhaka", "Chattogram", "Khulna", "Rajshahi")})
print("upazilas", len(up), "city thanas", sum(u["city"] for u in up))
HQX = {"Dhaka": (90.40, 23.73), "Chattogram": (91.83, 22.36), "Jashore": (89.21, 23.17), "Cumilla": (91.18, 23.46), "Moulvibazar": (91.78, 24.48), "Rajshahi": (88.60, 24.37), "Khulna": (89.56, 22.82), "Gazipur": (90.42, 24.00), "Narayanganj": (90.50, 23.62),
       "Shariatpur": (90.34, 23.21), "Netrokona": (90.73, 24.88), "Cox's Bazar": (91.98, 21.45), "Khagrachhari": (91.98, 23.12), "Joypurhat": (89.02, 25.10),
       "Lalmonirhat": (89.45, 25.92), "Meherpur": (88.63, 23.76), "Narail": (89.50, 23.17), "Gaibandha": (89.54, 25.33), "Chuadanga": (88.85, 23.64)}
hq = {}
for n in names:
    s = [u for u in up if u["district"] == n and u["sadar"]] or [u for u in up if u["sadar"] and u["name"].split(" ")[0] in (n, *[k for k, v in ALIAS.items() if v == n])]
    hq[n] = HQX.get(n) or ((s[0]["c"].x, s[0]["c"].y) if s else None)
assert all(hq.values()), [n for n in names if not hq[n]]
uo = json.loads((RAW / "health_facilities_osm/uhc_osm.json").read_text())
uhc = []; filled = 0
for u in up:
    if u["sadar"] or u["city"]: continue
    inside = [q for q in uo if u["geom"].contains(Point(q))]
    if inside: uhc += [(q[0], q[1], u["district"], "osm") for q in inside[:1]]
    else: uhc.append((u["c"].x, u["c"].y, u["district"], "centroid")); filled += 1
print("upazila health complexes:", len(uhc), "of which OSM", len(uhc) - filled, "centroid", filled)
dh = [(hq[n][0], hq[n][1], n) for n in names]
TER = json.loads((RAW / "health_facilities_osm/tertiary.json").read_text())
ter = [(c[0], c[1], d, nm) if c else (hq[d][0], hq[d][1], d, nm) for nm, d, c in TER]
def near(pts):
    t = cKDTree(km(np.array([p[:2] for p in pts]))); dd, ii = t.query(XY); return dd, ii
dU, iU = near(uhc + [(x, y, n, 'dh') for x, y, n in dh])   # first-level care: a complex or the district hospital
dD, iD = near(dh); dT, iT = near(ter)
TH = {"uhc": 10, "dh": 25, "ter": 50}
acc = {}; tot = CP.sum()
for d in dist:
    m = CD == d["id"]; w_ = CP[m]; W = w_.sum()
    acc[d["name"]] = {"uhc_km": round(float((dU[m] * w_).sum() / W), 1), "dh_km": round(float((dD[m] * w_).sum() / W), 1), "ter_km": round(float((dT[m] * w_).sum() / W), 1),
                      "uhc_far": round(float(w_[dU[m] > TH["uhc"]].sum() / W * 100), 1), "dh_far": round(float(w_[dD[m] > TH["dh"]].sum() / W * 100), 1), "ter_far": round(float(w_[dT[m] > TH["ter"]].sum() / W * 100), 1)}
natacc = {k: round(float(CP[dd > TH[k2]].sum() / tot * 100), 1) for k, k2, dd in (("uhc_far", "uhc", dU), ("dh_far", "dh", dD), ("ter_far", "ter", dT))}
natacc.update({k: round(float((dd * CP).sum() / tot), 1) for k, dd in (("uhc_km", dU), ("dh_km", dD), ("ter_km", dT))})
print("national access", natacc); print({m: round(paths[m][-1] / 1e6, 1) for m in MODELS}, "band 2050", [round(v / 1e6, 1) for v in band[-1]])
# people served by each tertiary hospital (nearest-facility catchments), 2022 and 2050
g22 = np.bincount(iT, weights=CP, minlength=len(ter)); scale50 = {d["id"]: dpop[2050][id2i[d["id"]]] / dpop[2022][id2i[d["id"]]] for d in dist}
f50 = np.array([scale50[c] for c in CD]); g50 = np.bincount(iT, weights=CP * f50, minlength=len(ter))
# merge Dhaka's cluster into one line for the chart
catch = {}
for k, (x, y, d, nm) in enumerate(ter):
    key = "Dhaka hospitals and institutes" if d == "Dhaka" else nm
    c = catch.setdefault(key, {"name": key, "district": d, "p22": 0, "p50": 0}); c["p22"] += g22[k]; c["p50"] += g50[k]
catch = sorted(({"name": c["name"], "district": c["district"], "p22": round(c["p22"]), "p50": round(c["p50"])} for c in catch.values()), key=lambda c: -c["p22"])

# ---------- food ----------
agri = json.loads((ROOT / "data/agri.json").read_text()); v13 = json.loads((ROOT / "data/v13.json").read_text())
wet = json.loads((ROOT / "data/wet.json").read_text())
rows = []
uc = {}
for x in uhc: uc[x[2]] = uc.get(x[2], 0) + 1
tc = {}
for x in ter: tc[x[2]] = tc.get(x[2], 0) + 1
for i, d in enumerate(dist):
    n = d["name"]; cr = agri["districts"][str(d["id"])]["crops"]
    rice = sum(cr.get(k, 0) or 0 for k in ("aman", "boro", "aus")); wheat = cr.get("wheat", 0) or 0
    maize = v13["crops"]["maize"].get(n)
    fish = (wet["fish"].get(n) or {}).get("total")
    p22, p50 = dpop[2022][i], dpop[2050][i]
    rows.append({"name": n, "uhc": uc.get(n, 0), "ter": tc.get(n, 0), "rice_t": round(rice), "wheat_t": round(wheat), "maize_t": round(maize) if maize else None, "fish_t": round(fish) if fish else None,
                 "rice_kg22": round(rice / p22 * 1000), "rice_kg50": round(rice / p50 * 1000), "per_uhc22": round(p22 / max(uc.get(n, 0), 1)), "per_uhc50": round(p50 / max(uc.get(n, 0), 1)), **acc[n]})
# burden: mean of percentile ranks (higher = heavier). growth to 2050, people per health complex in 2050,
# distance to district hospital, distance to tertiary care, rice per person in 2050 (less rice = heavier)
R = pd.DataFrame(rows).set_index("name")
R["growth"] = [dpop[2050][i] / dpop[2022][i] - 1 for i in range(len(names))]
parts = {"growth": R.growth.rank(pct=True), "per_uhc": R.per_uhc50.rank(pct=True), "dh": R.dh_km.rank(pct=True), "ter": R.ter_km.rank(pct=True), "food": (-R.rice_kg50).rank(pct=True)}
R["burden"] = sum(parts.values()) / len(parts) * 100
for k, v in parts.items(): R["b_" + k] = (v * 100).round()
R["burden_rank"] = R.burden.rank(ascending=False).astype(int)
print(R.sort_values("burden", ascending=False)[["burden", "growth", "per_uhc50", "dh_km", "ter_km", "rice_kg50"]].head(8).round(2))

out = {
  "national": {"years": [int(y) for y in yrs], "wdi": [int(p) for p in pop], "census": NAT["census"], "tfr": NAT["tfr"],
               "proj": [[int(y), round(natproj[y])] for y in FUT], "band": [[int(y), round(a), round(b)] for y, (a, b) in zip(FUT, band)],
               "wb": [[y, v] for y, v in NAT["wb_proj"]], "models": [{"name": m, "mape": round(score[m]["mape"], 2), "mape15": round(score[m]["mape15"], 2), "mape30": round(score[m]["mape30"], 2), "err2025": round(score[m]["err2025"], 2), "used": m in best, "weight": round(wt.get(m, 0) / W, 3),
               "p2050": round(float(paths[m][-1]))} for m in rank]},
  "half_life": {"chosen": HL, "scores": [[("none" if k is None else k), round(v, 2)] for k, v in hl_score.items()]},
  "district_models": [{"name": m, "mape": round(dscore[m]["mape"], 2), "worst": dscore[m]["worst"], "worst_err": round(dscore[m]["worst_err"], 1), "used": m == dbest} for m in drank],
  "years": YS, "districts": {n: {"pop": [round(dpop[y][i]) for y in YS], "census": [int(v) for v in P[i]], "area": int(area[i]), **{k: (None if (isinstance(v, float) and math.isnan(v)) else (round(v, 3) if isinstance(v, float) else v)) for k, v in R.loc[n].to_dict().items()}} for i, n in enumerate(names)},
  "access": {"national": natacc, "thresholds": TH, "uhc_n": len(uhc), "uhc_osm": len(uhc) - filled, "dh_n": len(dh), "ter_n": len(ter),
             "uhc": [[round(x, 3), round(y, 3), s == "osm"] for x, y, _, s in uhc], "dh": [[round(x, 3), round(y, 3), n] for x, y, n in dh], "ter": [[round(x, 3), round(y, 3), d, nm] for x, y, d, nm in ter],
             "catch": catch, "cc_total": 14467, "cc_date": "Aug 2025", "cc_norm": 6000},
  "src": {"wdi": "World Bank WDI SP.POP.TOTL 1960-2025; World Bank population projection (source 40) 2025-2050.",
          "census": "BBS population censuses 1974-2022; district counts 1991-2022 adjusted for under-enumeration (BBS, via citypopulation.de).",
          "gpw": "CIESIN GPW v4 population density 2015, 30 arc-seconds, rescaled to 2022 district counts.",
          "osm": "OpenStreetMap contributors (ODbL), HOTOSM health facilities export on HDX, Nov 2026.",
          "cc": "14,467 community clinics (The Financial Express, 20 Aug 2025); design norm one per 6,000 people."}
}
p = ROOT / "data/pop.json"; p.write_text(json.dumps(out, separators=(",", ":"))); print(round(p.stat().st_size / 1024), "KB")
