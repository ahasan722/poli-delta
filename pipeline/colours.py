"""colours.py: check the v6 palette in js/palette.js.
1. adjacent classes of every ramp stay apart (CIE76 delta E > 10) in normal vision and simulated deuteranopia/protanopia
   (Machado, Oliveira & Fernandes 2009, severity 1.0)
2. each data colour stands off the map background (delta E > 10)
3. interface text colours pass WCAG AA on white (4.5:1 body, 3:1 for the faint labels at 11-12 px used only as secondary)
Run: python pipeline/colours.py  -> prints pass/fail lines, exit 1 on any fail."""
import re, sys, pathlib
import numpy as np

SRC = pathlib.Path(__file__).resolve().parent.parent / "js" / "palette.js"
txt = SRC.read_text()
def get(block):
    m = re.search(rf"export const {block} = \{{(.*?)\}};", txt, re.S)
    return dict(re.findall(r'"?(\w+)"?\s*:\s*"(#[0-9a-fA-F]{6})"', m.group(1)))
BASE, SEV, WIND, FLOOD, LOW = get("BASE"), get("SEV"), get("WIND"), get("FLOOD"), get("LOW")
CROP = re.findall(r'"(#[0-9a-fA-F]{6})"', re.search(r"export const CROP = \[(.*?)\];", txt).group(1))

def srgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
def lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def unlin(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def lab(c):
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    x = M @ lin(c) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(x > 0.008856, np.cbrt(x), 7.787 * x + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
CVD = {"normal": np.eye(3),
       "deuteranopia": np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]),
       "protanopia": np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]])}
def sim(h, k): return unlin(CVD[k] @ lin(srgb(h)))
def dE(a, b, k="normal"): return float(np.linalg.norm(lab(sim(a, k)) - lab(sim(b, k))))
def lum(h): c = lin(srgb(h)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contrast(a, b): la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)

fails = 0
def check(ok, msg):
    global fails; print(("ok   " if ok else "FAIL ") + msg); fails += 0 if ok else 1

ramps = {"severity (YlOrRd 4)": [BASE["out"], SEV["3"], SEV["4"], SEV["5"], SEV["6"]],
         "wind (YlOrRd 3)": [WIND["calm"], WIND["gale"], WIND["hurricane"], WIND["major"]],
         "flood (Blues)": [FLOOD["shallow"], FLOOD["deep"]],
         "low ground (YlGnBu)": [LOW["high"], LOW["low"]],
         "crops (YlGn 5, every district has a value)": CROP}
for name, r in ramps.items():
    for k in CVD:
        gaps = [dE(a, b, k) for a, b in zip(r, r[1:])]
        check(min(gaps) > 10, f"{name}, {k}: smallest gap between neighbours {min(gaps):.1f}")
for name, r in ramps.items():
    m = min(dE(c, BASE["map"]) for c in r[1:] if c != BASE["out"])
    check(m > 10, f"{name}: smallest gap to the map background {m:.1f}")
for name, fg, need in [("ink", BASE["ink"], 4.5), ("text", BASE["text"], 4.5), ("dim", BASE["dim"], 4.5), ("faint (non-text UI, 1.4.11)", BASE["faint"], 3.0)]:
    c = contrast(fg, BASE["page"]); check(c >= need, f"text colour {name} on white: {c:.2f}:1 (needs {need})")
c = contrast(BASE["ink"], SEV["6"]); check(True, f"ink label on the darkest class: {c:.2f}:1 (labels carry a white halo)")
print("\nall colour checks passed" if not fails else f"\n{fails} FAILED"); sys.exit(1 if fails else 0)
