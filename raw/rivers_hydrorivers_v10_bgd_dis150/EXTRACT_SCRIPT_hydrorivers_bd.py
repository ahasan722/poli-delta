"""Pure-python extract of major HydroRIVERS reaches around Bangladesh -> maps/dash/rivers_bd.geojson"""
import struct, json, numpy as np
base='../../chapter-2/data_derived/gis/HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as'
W,E,S,N=87.8,93.0,20.5,27.0
# dbf header
f=open(base+'.dbf','rb'); h=f.read(32)
nrec,hlen,rlen=struct.unpack('<IHH',h[4:12])
fields=[];off=1
while True:
    d=f.read(32)
    if d[0]==0x0D: break
    name=d[:11].split(b'\0')[0].decode(); ln=d[16]
    fields.append((name,off,ln)); off+=ln
fd={n:(o,l) for n,o,l in fields}
f.seek(hlen); raw=np.frombuffer(f.read(nrec*rlen),dtype=np.uint8).reshape(nrec,rlen)
def col(n):
    o,l=fd[n]; return np.array([float(bytes(r) or b'0') for r in raw[:,o:o+l]])
dis=col('DIS_AV_CMS'); ordf=col('ORD_FLOW')
sel=np.where(dis>=150)[0]
print(nrec,len(sel))
shx=open(base+'.shx','rb').read()
shp=open(base+'.shp','rb')
feats=[]
for i in sel:
    o,_=struct.unpack('>ii',shx[100+8*i:108+8*i]); shp.seek(o*2+8)
    st,=struct.unpack('<i',shp.read(4))
    bx=struct.unpack('<4d',shp.read(32))
    if bx[2]<W or bx[0]>E or bx[3]<S or bx[1]>N: continue
    npart,npt=struct.unpack('<ii',shp.read(8)); parts=struct.unpack('<%di'%npart,shp.read(4*npart))
    pts=np.frombuffer(shp.read(16*npt),dtype='<f8').reshape(npt,2)
    feats.append({'type':'Feature','properties':{'dis':round(float(dis[i])),'ord':int(ordf[i])},'geometry':{'type':'LineString','coordinates':[[round(x,3),round(y,3)] for x,y in pts]}})
json.dump({'type':'FeatureCollection','features':feats},open('maps/dash/rivers_bd.geojson','w'),separators=(',',':'))
print(len(feats))
