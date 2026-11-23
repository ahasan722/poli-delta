"""make_v13.py  --  v13: maize, onion, garlic and jute (2023-24), bagda and galda farms by district, and what connects
each district (highways, rail, junctions, bridges).  -> data/v13.json
Run after make_transport.py.
"""
import json, pathlib
from shapely.geometry import shape, Point, LineString
ROOT = pathlib.Path(__file__).resolve().parents[1]; RAW = ROOT / "raw"
src = (ROOT / "pipeline/make_agri.py").read_text(); ns = {"__file__": str(ROOT / "pipeline/make_agri.py")}; exec(src[:src.index("# ---- crops")], ns); match = ns["match"]
EXTRA = {"tahkurgaon": "Thakurgaon", "habigonj": "Habiganj", "panchagar": "Panchagarh", "jhallokati": "Jhalokati", "cnawabganj": "Chapainawabganj", "khagrachhari": "Khagrachhari", "munsiganj": "Munshiganj", "netrakona": "Netrokona"}
def m(n):
    k = "".join(ch for ch in n.lower() if ch.isalpha())
    return EXTRA.get(k) or match(n.replace("’", "'"))

Y = json.load(open(RAW / "bbs_yearbook_agri_2024/district_2023_24.json"))
crops = {}
for c in ("maize", "onion", "garlic", "jute"):
    out = {}
    for n, v in Y["district"][c].items():
        k = m(n); assert k, (c, n); out[k] = round(v * (0.1814 if c == "jute" else 1))
    assert len(out) == 64, (c, len(out)); crops[c] = out
shrimp = {"bagda": {}, "galda": {}}
for kind in ("bagda", "galda"):
    for n, v in Y["shrimp_farms"][kind + "_t"].items():
        k = m(n); assert k, n; shrimp[kind][k] = round(v, 1)

# what connects each district
T = json.load(open(ROOT / "data/transport.json")); G = json.load(open(ROOT / "data/districts.geojson"))
conn = {}
for f in G["features"]:
    poly = shape(f["geometry"]).buffer(0); name = f["properties"]["name"]
    refs = sorted({r["r"] for r in T["roads"] if r["r"].startswith("N") and poly.intersects(LineString(r["p"]))}, key=lambda r: (len(r), r))
    rail = any(poly.intersects(LineString(l)) for l in T["rails"] if len(l) > 1)
    jn = [j["upazila"] for j in T["junctions"] if poly.contains(Point(j["lon"], j["lat"]))]
    br = [b["name"] for b in T["bridges"] if poly.buffer(0.01).intersects(LineString(b["p"]))]
    conn[name] = {"roads": refs, "rail": rail, "junctions": jn, "bridges": br}

out = {"year": Y["year"], "crops": crops, "nat": {c: sum(v.values()) for c, v in crops.items()}, "shrimp": shrimp, "shrimp_nat": Y["shrimp_farms"]["national"],
       "src": "BBS, Yearbook of Agricultural Statistics 2024: district production 2023-24 (maize, onion and garlic in tonnes; jute in bales, converted at 181.4 kg). Maize for Meherpur corrected to match Khulna Division's printed total.",
       "shrimp_src": "BBS, Yearbook of Agricultural Statistics 2024, Table 9.4.46, Annual Production of Shrimp/Prawn Farms 2023-24 (from the Deputy Director, Shrimp, and district fisheries offices).",
       "conn": conn}
p = ROOT / "data/v13.json"; p.write_text(json.dumps(out, separators=(",", ":"))); print({c: round(v) for c, v in out["nat"].items()}, round(p.stat().st_size / 1024), "KB")
print(conn["Dhaka"], conn["Rajbari"], conn["Brahmanbaria"])
