# Unwarp the tilted brawler coin.webp face into a flat 512px disc -> public/head.png
# blender -b --python face.py -- 128 120 104 82 $PWD/public/head.png -0.13 -0.13 0.85
import bpy, numpy as np, sys
args=sys.argv[sys.argv.index('--')+1:]; cx,cy,a,b,out=float(args[0]),float(args[1]),float(args[2]),float(args[3]),args[4]
import os
i=bpy.data.images.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../brawler/client/public/ui/coin.webp"))
w,h=i.size; p=np.array(i.pixels[:]).reshape(h,w,4)[::-1]
eM=np.array([-0.6822834336328489, 0.7310877623036579]); em=np.array([-0.7310877623036579, -0.6822834336328489])
N=512; y,x=np.mgrid[0:N,0:N]; u=(x+0.5)/N*2-1; v=(y+0.5)/N*2-1
# output: u along major, v along minor, rotated so result looks upright-ish: rotate disc by angle of eM
ang=np.arctan2(eM[1],eM[0]); ca,sa=np.cos(-ang),np.sin(-ang)
ou,ov,s=float(args[5]),float(args[6]),float(args[7]); uu=ou+s*u; vv=ov+s*v
U=uu*ca-vv*sa; V=uu*sa+vv*ca
sx=cx+a*U*eM[0]+b*V*em[0]; sy=cy+a*U*eM[1]+b*V*em[1]
# bilinear
x0=np.clip(np.floor(sx).astype(int),0,w-2); y0=np.clip(np.floor(sy).astype(int),0,h-2); fx=(sx-x0)[...,None]; fy=(sy-y0)[...,None]
o=(p[y0,x0]*(1-fx)*(1-fy)+p[y0,x0+1]*fx*(1-fy)+p[y0+1,x0]*(1-fx)*fy+p[y0+1,x0+1]*fx*fy)
r=np.sqrt(u*u+v*v); o[...,3]*=np.clip((1-r)*N/2,0,1)  # circular mask, 1px AA
img=bpy.data.images.new("o",N,N,alpha=True); img.pixels[:]=o[::-1].ravel(); img.filepath_raw=out; img.file_format='PNG'; img.save()
