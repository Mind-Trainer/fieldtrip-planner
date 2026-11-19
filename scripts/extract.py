"""Run from project root: python scripts/extract.py region.osm.pbf output.json"""
import sys, json, math, osmium
from pathlib import Path
file, target = sys.argv[1:]
tags = json.loads(Path("data/tags.json").read_text())
grid = set()
for name in ("short", "long"):
    for route in json.loads(Path(f"data/{name}.json").read_text())["routes"]:
        for x,y in route["geometry"]["coordinates"]:
            for dx in range(-2,3):
                for dy in range(-2,3):
                    grid.add((math.floor(x*10)+dx, math.floor(y*10)+dy))
def nearby(x,y):
    return (math.floor(x*10),math.floor(y*10)) in grid
rows, ways, relations, points = [], {}, {}, {}
def row(o):
    return dict(id=f"{o.type_str()}/{o.id}", tags=dict(o.tags),timestamp=str(o.timestamp))
def add(record, coords):
    if coords and nearby(*coords):
        rows.append(dict(record,xy=coords))
def center(coords):
    if coords:
        xs,ys=zip(*coords)
        return [(max(xs)+min(xs))/2,(max(ys)+min(ys))/2]
for o in osmium.FileProcessor(file).with_filter(osmium.filter.TagFilter(*[(k,v) for k,vs in tags.items() for v in vs])):
    if o.is_node(): add(row(o),[o.lon,o.lat])
    elif o.is_way(): ways[o.id]=(row(o),[n.ref for n in o.nodes])
    else: relations[o.id]=(row(o),[(m.type,m.ref) for m in o.members])
needed={i for rec,members in relations.values() for t,i in members if t=="w" and i not in ways}
for w in osmium.FileProcessor(file,osmium.osm.WAY):
    if w.id in needed: ways[w.id]=(None,[n.ref for n in w.nodes])
needed={n for rec,refs in ways.values() for n in refs}
needed.update(i for rec,members in relations.values() for t,i in members if t=="n")
for n in osmium.FileProcessor(file,osmium.osm.NODE):
    if n.id in needed: points[n.id]=(n.lon,n.lat)
for rec,refs in ways.values():
    if rec: add(rec,center([points[n] for n in refs if n in points]))
for rec,members in relations.values():
    refs=[i for t,i in members if t=="n"]
    for t,i in members:
        if t=="w" and i in ways: refs.extend(ways[i][1])
    add(rec,center([points[n] for n in refs if n in points]))
for r in rows:
    t,i=r['id'].split('/')
    r['id']={'n':'node','w':'way','r':'relation'}.get(t,t)+'/'+i
Path(target).write_text(json.dumps(rows,separators=(',',':'),ensure_ascii=False))
print(len(rows),"candidate records")
