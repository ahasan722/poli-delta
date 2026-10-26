"""Extract GSHHG coastline polygons / WDBII river lines from matplotlib-basemap .dat files for a bbox."""
import sys, json, numpy as np
datadir, outdir = sys.argv[1], sys.argv[2]
W,S,E,N = 86.0, 18.0, 95.0, 28.0
def read(name):
    meta=open(f'{datadir}/{name}meta_f.dat').read().splitlines()
    raw=open(f'{datadir}/{name}_f.dat','rb').read()
    feats=[]
    for line in meta:
        p=line.split()
        level,area,npts,south,north,offset,nbytes,fid=int(p[0]),float(p[1]),int(p[2]),float(p[3]),float(p[4]),int(p[5]),int(p[6]),p[7]
        if north<S or south>N: continue
        xy=np.frombuffer(raw[offset:offset+nbytes],dtype='<f4').reshape(-1,2)
        if xy.shape[0]!=npts: continue
        lon=xy[:,0]; lon=np.where(lon>180,lon-360,lon)
        if lon.max()<W or lon.min()>E: continue
        coords=np.column_stack([lon,xy[:,1]]).round(5).tolist()
        feats.append((level,area,fid,coords))
    return feats
# rivers: WDBII; basemap stores level=-1; riversmeta has no class, so keep all
riv=read('rivers')
fc={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'id':fid,'source':'WDBII rivers (full res) via basemap-data-hires'},'geometry':{'type':'LineString','coordinates':c}} for lvl,a,fid,c in riv if len(c)>1]}
json.dump(fc,open(f'{outdir}/wdbii_rivers_f_bengal.geojson','w'))
print('rivers',len(fc['features']))
# coast: GSHHS levels 1 land,2 lake,3 island-in-lake,4 pond-in-island
cst=read('gshhs')
fc={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'id':fid,'level':lvl,'area_km2':a,'source':'GSHHS full res via basemap-data-hires'},'geometry':{'type':'Polygon','coordinates':[c if c[0]==c[-1] else c+[c[0]]]}} for lvl,a,fid,c in cst if len(c)>3]}
json.dump(fc,open(f'{outdir}/gshhs_coast_f_bengal.geojson','w'))
print('coast polys',len(fc['features']), 'levels', sorted(set(f['properties']['level'] for f in fc['features'])))
