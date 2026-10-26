"""Convert an R `raster::RasterLayer` saved in .rda (values in memory) to GeoTIFF."""
import sys, numpy as np, rdata, rasterio
from rasterio.transform import from_bounds

def tagname(o):
    try:
        v=o.tag.value
        if isinstance(v,bytes): return v.decode()
        if hasattr(v,'value') and isinstance(v.value,bytes): return v.value.decode()
    except Exception: return None

def collect(o, out, depth=0):
    if type(o).__name__=='RData': return collect(o.object,out)
    if type(o).__name__!='RObject': return
    tn=tagname(o); v=o.value
    if tn and isinstance(v,np.ndarray): out.setdefault(tn, v)
    if tn and isinstance(v,(list,tuple)) and len(v)>=1 and type(v[0]).__name__=='RObject' and isinstance(v[0].value,np.ndarray):
        out.setdefault(tn, v[0].value)
    if isinstance(v,(list,tuple)):
        for x in v: collect(x,out,depth+1)
    elif type(v).__name__=='RObject': collect(v,out,depth+1)
    if o.attributes is not None: collect(o.attributes,out,depth+1)

src, dst = sys.argv[1], sys.argv[2]
d={}
collect(rdata.parser.parse_file(src), d)
ncols=int(d['ncols'][0]); nrows=int(d['nrows'][0])
xmin,xmax,ymin,ymax=[float(d[k][0]) for k in ('xmin','xmax','ymin','ymax')]
vals=d['values'].astype('float32').reshape(nrows,ncols)  # raster pkg stores row-major, top row first
nodata=-9999.0
vals=np.where(np.isnan(vals), nodata, vals)
tr=from_bounds(xmin,ymin,xmax,ymax,ncols,nrows)
with rasterio.open(dst,'w',driver='GTiff',height=nrows,width=ncols,count=1,dtype='float32',crs='EPSG:4326',transform=tr,nodata=nodata,compress='deflate',predictor=3,tiled=True) as ds:
    ds.write(vals,1)
print('wrote',dst,nrows,ncols,(xmin,ymin,xmax,ymax),'res',(xmax-xmin)/ncols,'min/max',vals[vals!=nodata].min(),vals[vals!=nodata].max())
