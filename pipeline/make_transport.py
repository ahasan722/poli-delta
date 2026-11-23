"""make_transport.py  --  v13: highways, railways, rail junctions and the big bridges.  -> data/transport.json

Highways: OpenStreetMap (ODbL), national and regional highways as extracted by bangladesh-geojson (bd-major-routes.geojson).
Railways: OpenStreetMap (ODbL) railway=rail ways, main and branch lines (no sidings or yards), from 1-degree tiles built from a
Geofabrik extract (github.com/enwo02/train-tracker, data/tiles), clipped to Bangladesh.
Junctions: points where three or more main or branch line ends meet, merged within 2.5 km; named by the upazila they fall in
(geoBoundaries ADM3), so a junction is labelled by its upazila, not its station name.
Bridges: OSM ways named as bridges, longest first, measured from the OSM geometry.
"""
import json, glob, math, pathlib, collections
from shapely.geometry import shape, LineString, Point
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = pathlib.Path(__file__).resolve().parents[1]; RAW = ROOT / "raw"
def L(c): return sum(math.hypot((c[i + 1][0] - c[i][0]) * 102.5, (c[i + 1][1] - c[i][1]) * 110.8) for i in range(len(c) - 1))
def rnd(c): return [[round(x, 3), round(y, 3)] for x, y in c]
bd0 = unary_union([shape(f["geometry"]).buffer(0) for f in json.load(open(ROOT / "data/districts.geojson"))["features"]]); bd0p = prep(bd0)
bd = unary_union([shape(f["geometry"]).buffer(0) for f in json.load(open(ROOT / "data/districts.geojson"))["features"]]).buffer(0.02); bdp = prep(bd)

# ---------------------------------------------------------------- highways
R = json.load(open(RAW / "transport_osm/bd-major-routes.geojson"))
groups = collections.defaultdict(list)
for f in R["features"]:
    p = f["properties"]; ref = (p.get("ref") or "").strip()
    if not ref.startswith("N") and p.get("highway") not in ("motorway", "trunk"): continue
    cls = "N" if ref.startswith("N") and len(ref) <= 2 else "n"   # N1..N8 are the main national highways
    groups[(cls, ref or p.get("highway"))].append(LineString(f["geometry"]["coordinates"]))
roads = []
for (cls, ref), lines in groups.items():
    m = unary_union(lines).simplify(0.004)
    parts = m.geoms if hasattr(m, "geoms") else [m]
    for g in parts:
        c = list(g.coords)
        if len(c) > 1 and L(c) > 1.5: roads.append({"r": ref, "c": cls, "p": rnd(c)})
print(len(roads), "highway lines;", sum(1 for r in roads if r["c"] == "N"), "on N1-N8")

# ---------------------------------------------------------------- railways
rails, ends = [], collections.defaultdict(list)
for f in glob.glob(str(RAW / "transport_osm/rail_tiles/*.geojson")):
    for x in json.load(open(f))["features"]:
        p = x["properties"]
        if p.get("railway") != "rail" or p.get("service") or p.get("usage") not in ("main", "branch"): continue
        c = x["geometry"]["coordinates"]
        if not (bdp.contains(Point(c[0])) or bdp.contains(Point(c[-1]))): continue
        rails.append(LineString(c))
        # each end remembers which way the line leaves it, about a kilometre along
        for e, seq in ((c[0], c), (c[-1], c[::-1])):
            acc, far = 0, seq[-1]
            for i in range(len(seq) - 1):
                acc += math.hypot((seq[i + 1][0] - seq[i][0]) * 102.5, (seq[i + 1][1] - seq[i][1]) * 110.8)
                if acc > 1.0: far = seq[i + 1]; break
            brg = math.degrees(math.atan2((far[0] - e[0]) * 102.5, (far[1] - e[1]) * 110.8)) % 360
            ends[(round(e[0], 4), round(e[1], 4))].append((p.get("name:en") or p.get("name") or "", brg))
m = unary_union(rails).simplify(0.003); rl = [rnd(list(g.coords)) for g in (m.geoms if hasattr(m, "geoms") else [m]) if L(list(g.coords)) > 0.8]
print(len(rails), "rail ways ->", len(rl), "lines")
# junctions: line ends merged within 2.5 km; a junction is where the lines leave in three or more directions
# (a double track or a station split leaves in only two)
merged = []
for (x, y), v in ends.items():
    for g in merged:
        if math.hypot((g["x"] - x) * 102.5, (g["y"] - y) * 110.8) < 2.5: g["v"] += v; break
    else: merged.append({"x": x, "y": y, "v": list(v)})
def dirs(v):
    out = []
    for _, b in v:
        if all(min(abs(b - o), 360 - abs(b - o)) > 40 for o in out): out.append(b)
    return out
for g in merged: g["n"] = len(dirs(g["v"])); g["names"] = {n for n, _ in g["v"]}
merged = [g for g in merged if g["n"] >= 3 and bd0p.contains(Point(g["x"], g["y"]))]
U = json.load(open(RAW / "admin_upazilas_geoboundaries/upazilas.geojson"))
ups = [(shape(f["geometry"]).buffer(0), f["properties"]["name"].replace(" Upazilla", "").replace(" Upazila", ""), f["properties"]["district_name"]) for f in U["features"]]
junctions = []
for g in merged:
    pt = Point(g["x"], g["y"]); up = min(((s.distance(pt), n, d) for s, n, d in ups), key=lambda t: t[0])[1:]
    names = sorted(n for n in g["names"] if n)
    junctions.append({"lon": g["x"], "lat": g["y"], "upazila": up[0], "district": up[1], "lines": names[:4], "ends": g["n"]})
junctions.sort(key=lambda j: (-j["ends"], j["upazila"] or ""))
seen = {}; 
for j in junctions:
    if j["upazila"] not in seen: seen[j["upazila"]] = j
junctions = list(seen.values())
print(len(junctions), "junctions:", [(j["upazila"], j["ends"]) for j in junctions[:20]])

# ---------------------------------------------------------------- bridges
EN = {"যমুনা বহুমুখী সেতু": "Jamuna Multipurpose Bridge", "লালন শাহ সেতু": "Lalon Shah Bridge", "দাউদকান্দি সেতু": "Meghna-Gumti (Daudkandi) Bridge",
      "পায়রা সেতু": "Payra Bridge", "শাহ আমানত সেতু": "Shah Amanat Bridge (Karnaphuli)", "হাজী শরীয়তউল্লাহ সেতু": "Haji Shariatullah Bridge (Arial Khan)",
      "বেকুটিয়া সেতু": "Bekutia Bridge (Kocha)", "শহীদ আবদুর রব সেরনিয়াবাত সেতু": "Dapdapia Bridge (Kirtankhola)", "মেঘনা সেতু": "Meghna Bridge",
      "সৈয়দ নজরুল ইসলাম সেতু": "Syed Nazrul Islam Bridge (Bhairab)", "তিস্তা সেতু": "Teesta Bridge", "মুক্তারপুর সেতু": "Muktarpur Bridge (Dhaleshwari)",
      "বাবু বাজার সেতু (বুড়িগঙ্গা ২য় সেতু)": "Buriganga Second Bridge (Babubazar)", "প্রথম বাংলাদেশ-চীন মৈত্রী সেতু": "First Bangladesh-China Friendship Bridge",
      "কাঞ্চন সেতু": "Kanchan Bridge (Shitalakshya)", "Khan Jahan Ali Bridge (Rupsha Setu)": "Khan Jahan Ali Bridge (Rupsha)", "গাবখান সেতু": "Gabkhan Bridge",
      "কর্ণফুলী সুড়ঙ্গ": "Karnaphuli Tunnel", "Padma Bridge": "Padma Bridge", "Jamuna Railway Bridge": "Jamuna Railway Bridge", "Rupsha Rail Bridge": "Rupsha Rail Bridge"}
seg = collections.defaultdict(list)
for f in R["features"]:
    n = (f["properties"].get("name") or "").strip()
    if n in EN: seg[n].append(f["geometry"]["coordinates"])
for f in glob.glob(str(RAW / "transport_osm/rail_tiles/*.geojson")):
    for x in json.load(open(f))["features"]:
        p = x["properties"]; n = (p.get("name:en") or p.get("name") or "").strip()
        if p.get("bridge") and n in ("Padma Bridge", "Jamuna Railway Bridge", "Rupsha Rail Bridge") and bdp.contains(Point(x["geometry"]["coordinates"][0])): seg[n].append(x["geometry"]["coordinates"])
bridges = []
for n, cs in seg.items():
    longest = max(cs, key=L); ln = L(longest)   # a two-way road is drawn twice; the longest single way is the bridge length
    mid = longest[len(longest) // 2]
    bridges.append({"name": EN[n], "lon": round(mid[0], 4), "lat": round(mid[1], 4), "km": round(ln, 2), "rail": "Rail" in EN[n] or n == "Padma Bridge", "tunnel": "Tunnel" in EN[n], "p": rnd(longest)})
bridges.sort(key=lambda b: -b["km"])
print([(b["name"], b["km"]) for b in bridges])
out = {"roads": roads, "rails": rl, "junctions": junctions[:24], "bridges": bridges,
       "src": "OpenStreetMap contributors (ODbL): national highways via bangladesh-geojson, railways from a Geofabrik extract; junctions and bridge lengths measured from the OSM lines."}
p = ROOT / "data/transport.json"; p.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False)); print(round(p.stat().st_size / 1024), "KB")
