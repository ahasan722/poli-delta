"""Downsample the ESA WorldCover 2021 Bangladesh clip (10 m, uint8 classes) to coarser
grids by majority (mode) vote, processing in row stripes so it fits in memory.

Usage: python3 -I worldcover_downsample.py <in.tif> <out.tif> <factor>
factor 10 -> ~90 m (0.0008983 deg), factor 30 -> ~270 m, factor 100 -> ~900 m.
Class 0 (outside Bangladesh / nodata) is ignored in the vote unless the whole block is 0.
"""
import sys
import numpy as np
import rasterio
from rasterio.transform import Affine

src_path, dst_path, factor = sys.argv[1], sys.argv[2], int(sys.argv[3])
CLASSES = np.array([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100], dtype=np.uint8)

with rasterio.open(src_path) as src:
    H, W = src.height, src.width
    oh, ow = H // factor, W // factor
    t = src.transform
    dst_transform = Affine(t.a * factor, t.b, t.c, t.d, t.e * factor, t.f)
    profile = dict(driver="GTiff", dtype="uint8", count=1, width=ow, height=oh,
                   crs=src.crs, transform=dst_transform, nodata=0, compress="deflate",
                   tiled=True, blockxsize=256, blockysize=256)
    out = np.zeros((oh, ow), dtype=np.uint8)
    rows_per_stripe = max(factor, (2048 // factor) * factor)
    for r0 in range(0, oh * factor, rows_per_stripe):
        nrows = min(rows_per_stripe, oh * factor - r0)
        block = src.read(1, window=rasterio.windows.Window(0, r0, ow * factor, nrows))
        nb = nrows // factor
        block = block[: nb * factor].reshape(nb, factor, ow, factor).transpose(0, 2, 1, 3).reshape(nb, ow, factor * factor)
        # count each class per block
        counts = np.zeros((nb, ow, len(CLASSES)), dtype=np.int32)
        for i, c in enumerate(CLASSES):
            counts[:, :, i] = (block == c).sum(axis=2)
        counts[:, :, 0] = 0  # ignore class 0 in the vote
        best = counts.argmax(axis=2)
        has_data = counts.sum(axis=2) > 0
        res = np.where(has_data, CLASSES[best], 0).astype(np.uint8)
        out[r0 // factor: r0 // factor + nb] = res
        print(f"rows {r0}-{r0 + nrows} done", flush=True)
    with rasterio.open(dst_path, "w", **profile) as dst:
        dst.write(out, 1)
        dst.update_tags(SOURCE="ESA WorldCover 2021 v200 (CC BY 4.0), Bangladesh clip from GitHub strangec137/mark15-bangladesh-lulc-ec3 release v1.0",
                        RESAMPLING=f"majority vote over {factor}x{factor} 10 m cells, class 0 ignored",
                        CLASSES="10 tree cover;20 shrubland;30 grassland;40 cropland;50 built-up;60 bare/sparse;70 snow/ice;80 permanent water;90 herbaceous wetland;95 mangroves;100 moss/lichen;0 nodata/outside Bangladesh")
u, c = np.unique(out, return_counts=True)
print(dict(zip(u.tolist(), c.tolist())))
