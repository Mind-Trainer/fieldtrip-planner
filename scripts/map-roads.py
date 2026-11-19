"""Derive an offline regional road backdrop from the documented OSM extract."""
import json,math,sys,osmium
from pathlib import Path
cells=set()
for name in ('short','long'):
 for route in json.loads(Path('data/'+name+'.json').read_text())['routes']:
  for x,y in route['geometry']['coordinates']:
   for dx in range(-2,3):
    for dy in range(-2,3):cells.add((math.floor(x*10)+dx,math.floor(y*10)+dy))
kinds=('motorway','trunk','primary','secondary','tertiary')
ways={}
for way in osmium.FileProcessor(sys.argv[1],osmium.osm.WAY).with_filter(osmium.filter.TagFilter(*[('highway',k) for k in kinds])):
 ways[way.id]=[way.tags['highway'],[n.ref for n in way.nodes]]
needed={n for kind,refs in ways.values() for n in refs}
points={}
for node in osmium.FileProcessor(sys.argv[1],osmium.osm.NODE):
 if node.id in needed and (math.floor(node.lon*10),math.floor(node.lat*10)) in cells:
  points[node.id]=[round(node.lon,5),round(node.lat,5)]
lines=[]
for kind,refs in ways.values():
 run=[]
 for ref in refs+[None]:
  if ref in points:run.append(points[ref])
  else:
   if len(run)>1:lines.append({'kind':kind,'line':run})
   run=[]
Path('data/roads.json').write_text(json.dumps(lines,separators=(',',':')))
print(len(lines),'road sections extracted',flush=True)
def simplify(points,tolerance=0.0005):
 if len(points)<3:return points
 ax,ay=points[0]; bx,by=points[-1]; dx,dy=bx-ax,by-ay
 greatest=0; index=0
 for i,(x,y) in enumerate(points[1:-1],1):
  t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy or 1)))
  error=(x-ax-t*dx)**2+(y-ay-t*dy)**2
  if error>greatest:greatest=error;index=i
 if greatest>tolerance*tolerance:return simplify(points[:index+1],tolerance)[:-1]+simplify(points[index:],tolerance)
 return [points[0],points[-1]]
for row in lines:row['line']=simplify(row['line'])
Path('data/roads.json').write_text(json.dumps(lines,separators=(',',':')))
