import { readFileSync as read, writeFileSync, readdirSync } from "node:fs";
import { split, distance } from "./core.mjs";
const json = (name) => JSON.parse(read("data/" + name + ".json", "utf8"));
const literal = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const routes = {},
  sections = {};
for (const [city, file] of [
  ["Tirunelveli", "short"],
  ["Bengaluru", "long"],
]) {
  routes[city] = json(file).routes.map((route, i) => {
    const id = city + i,
      line = route.geometry.coordinates,
      parts = split(line);
    let cumulative = 0;
    sections[id] = parts.map((part) => {
      const start = cumulative;
      for (let i = 1; i < part.length; i++)
        cumulative += distance(part[i - 1], part[i]);
      return { part, start };
    });
    return {
      id,
      line,
      segments: parts.length,
      distance: route.distance,
      duration: route.duration,
    };
  });
}
const assets = readdirSync("dist/assets");
const asset = (ext) =>
  read("dist/assets/" + assets.find((x) => x.endsWith(ext)), "utf8");
const core = read("core.mjs", "utf8")
  .replace(/^import.*\n/, "")
  .replaceAll("export ", "");
const script = `
(()=>{
 const tags=${literal(json("tags"))};
 ${core}
 const routes=${literal(routes)}, sections=${literal(sections)}, features=${literal(json("facilities"))};
 const request=window.fetch.bind(window), trips=new Map();
 window.fetch=async (url,init)=>{
 if(typeof url!=='string'||!url.startsWith('/api/'))return request(url,init);
 const {pathname,searchParams:p}=new URL(url,'https://fieldtrip.invalid');
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(p.get('mode')==='live'||pathname==='/api/drive')return reply({error:'Open the full server app for live routing and discovery.'},503);
 if(pathname==='/api/routes')return reply(routes[p.get('destination')]||[]);
 if(pathname==='/api/segment'){
 const parts=sections[p.get('id')], entry=parts?.[Number(p.get('index'))],km=Number(p.get('km'));
 if(!entry||!(km>0&&km<=10))return reply({error:'Invalid corridor parameters'},400);
 return reply({total:parts.length,time:${literal(json("source").date)},records:scan(entry.part,km,features).map(item=>({...item,along:item.along+entry.start}))});
 }
 if(pathname.startsWith('/api/trip/')){
 if(init?.method==='POST'){trips.set(pathname,JSON.parse(init.body));return reply({saved:true});}
 return reply(trips.get(pathname)||{});
 }
 if(init?.method==='POST')return reply({error:'Faculty verification requires the full server app.'},503);
 return reply([]);
 };
})();
`;
const css = asset(".css").replace(
  /url\((["']?)(\/assets\/[^)"']+)\1\)/g,
  (match, quote, url) => {
    const bytes = read("dist" + url);
    const mime = url.endsWith(".woff2")
      ? "font/woff2"
      : url.endsWith(".woff")
        ? "font/woff"
        : "image/png";
    return "url(data:" + mime + ";base64," + bytes.toString("base64") + ")";
  },
);
const safe = (code) => code.replace(/<\/script/gi, "<\\/script");
writeFileSync(
  process.argv[2] || "Fieldtrip-offline.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldtrip offline map</title><style>${css}</style><body><div style="padding:8px 5%;background:#eff6ed;color:#1c3d30;font:14px system-ui">Offline map · Bundled OpenStreetMap data · Trip edits last until this page closes</div><div id="root"></div><script>${safe(script)}</script><script type="module">${safe(asset(".js"))}</script></body></html>`,
);
