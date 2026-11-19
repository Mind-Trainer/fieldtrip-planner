"""Build a lightweight offline place-label layer from the same regional extract."""
import osmium,json,sys,math
from pathlib import Path
grid=set()
for k in ['short','long']:
    for r in json.loads(Path('data/'+k+'.json').read_text())['routes']:
        for x,y in r['geometry']['coordinates']:
            for dx in range(-1,2):
                for dy in range(-1,2):
                    grid.add((math.floor(x*10)+dx,math.floor(y*10)+dy))
rows=[]
for n in osmium.FileProcessor(sys.argv[1],osmium.osm.NODE).with_filter(osmium.filter.TagFilter(('place','town'),('place','city'),('place','village'))):
    if (math.floor(n.lon*10),math.floor(n.lat*10)) in grid and n.tags.get('name'):
        rows.append([n.lon,n.lat,n.tags.get('name:en',n.tags['name']),n.tags['place']])
Path('data/places.json').write_text(json.dumps(rows,ensure_ascii=False))
