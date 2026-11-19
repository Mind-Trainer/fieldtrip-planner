# Fieldtrip · educational route planner

## Start on Windows

Install Node.js 24 LTS, extract the project, and double-click START-WINDOWS.cmd. The launcher installs dependencies when needed, starts the server, waits for its health check, and opens the local app. Keep its terminal open. The full demonstration uses this server app.



Install Node.js 24 LTS with PowerShell, then open a new PowerShell window.

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Extract the ZIP, open PowerShell inside the route-planner folder and run

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open http://127.0.0.1:5173 in a browser. Leave PowerShell running. Press Ctrl+C to stop. The ZIP includes a prebuilt frontend. After the initial dependency installation, cached mode runs without internet. There are no API keys or billing accounts.

## Demonstration

Choose Nagercoil to Tirunelveli, keep **Cached real OSM extract**, select the returned car route, choose 3 km and press **Search entire corridor**. Click a map cluster to expand it. Select a marker or directory card to inspect its source record. The directory groups records by service category. Expand a category and scroll its cards to inspect every matching record. All filtered records are also available on the map. Show all restores category filters. Clear the search box to remove its text filter. Repeat with Bengaluru for the longer road. The optional online street layer uses standard OSM tiles on demand.

## Data and algorithm

The two stored OSRM responses preserve full driving geometries, distances and estimated driving durations. Each returned one route when alternatives were requested. The input coordinates are in server.mjs. Sources and dates are recorded in data/source.json. The map uses local OSM place labels and a simplified road backdrop while offline. The route itself retains its full geometry.

The backend splits the chosen geometry approximately every 12 km with a shared boundary vertex. Each section has an expanded search bounding box, overlapping its neighbours. A local tangent-plane point-to-segment calculation measures distance to every relevant road edge. Objects are included by representative point within the specified radius. Nodes use mapped coordinates. Ways and relations use bounding-box centres. This can exclude buildings whose outline touches the corridor but whose centre lies outside. The nearest projection gives approximate progress along the route. The client merges duplicate OSM type/ID pairs across segments, retaining the closest projection. Spatial proximity does not establish a drivable access path.

The extract covers the two bundled routes with padding for all supported radii (up to 10 km). The offline builder filters matching OSM tags from a regional PBF and retains facilities in nearby grid cells. data/tags.json defines the taxonomy for both live and offline searches. Location resolution for relations uses member ways and nodes. Nested relation members are unsupported. The directory distinguishes hospitals, clinics and pharmacies. No synthetic facilities are included.

To rebuild the extract, download the dated Geofabrik file listed in data/source.json. From the project root, with Python installed, run

```powershell
py -m pip install osmium
py scripts/extract.py southern-zone-261117.osm.pbf data/facilities.json
py scripts/context.py southern-zone-261117.osm.pbf
npm.cmd run build
```

For a newer extract update data/source.json with its actual date and URL. Restart the server after replacing data files. Attribution and ODbL terms apply to the bundled OSM databases. https://www.openstreetmap.org/copyright and https://opendatacommons.org/licenses/odbl/1-0/

## External services

Live mode fetches OSRM road options and issues serialized Overpass bounding-box requests. Use preset cities or click map points in live mode. The server caches successful responses in SQLite for 24 hours. Public endpoints can reject, throttle or time out. The diagnostics list failed sections. Select cached mode explicitly to use the bundled routes. Online raster tiles require internet. OSRM estimates omit live traffic.

## Faculty, planning and emergency simulation

Create your local faculty account in Faculty review. Sign in, select a record, open its verification form, describe your evidence and save. Passwords are stored as salted hashes. Sessions use an HttpOnly cookie and expire after 12 hours. The account and history persist in SQLite. The legacy key in runtime/faculty-key.txt also persists across restarts. Verification history survives restarts. The database distinguishes reported emergency-department status from general facility verification. The server binds to loopback for single-computer academic use. Anyone using that local app can edit the trip plan. Protect the local runtime folder.

Complete the editable questionnaire, choose a service category, and generate a plan. Save Journey stores the questionnaire and planned IDs in SQLite for that route geometry. Reopening the same route loads the saved trip. Regenerating replaces the suggested stop list. Add or remove individual planned stops through their cards and save again. All discovered services remain searchable. Fuel cost requires user-supplied efficiency and price. This prototype uses approximate position along the route for break placement, and straight-line offset for eligibility. Suggested stops do not include a verified driving detour. Map stars designate planned stops.

Use the emergency panel to click a simulated location or use the road midpoint. The medical option returns OSM-tagged hospitals. Results include unplanned records, faculty status and straight-line distance. Each alternative has an optional online OSRM road-distance check. Hours, phone and emergency-department availability can be unknown. The tool does not contact responders.

## Tests

```powershell
npm.cmd run build
npm.cmd test
```

For the optional real-browser suite and screenshot, run

```powershell
npx.cmd playwright install chromium
npm.cmd run test:browser
```

To re-run both journey API checks with the normal server running, open a second PowerShell window in this directory and run `node scripts/acceptance.mjs`.

## Implementation scope

React and TypeScript use Leaflet and MarkerCluster directly. Express uses Node's built-in SQLite support. The corridor calculation is implemented locally. The tests use Node's test runner and a DOM integration test. The optional Playwright spec exercises Chromium. No external CSS framework, geocoder, account registration or paid provider is required.

The questionnaire is an editable form on the journey dashboard. Route comparison supports time and distance when alternatives exist. The snapshot engine returned one option for each example. Formal safety ratings, priced tolls, guaranteed road detours, bus routing and future student/parent/tracking modules are outside this prototype. Data weights, service-tag definitions and extract processing code are included.

## Guided tour update

Answer the route questions above the map, apply your answers, then search the corridor. Service groups expand independently. Verified and partially verified records appear first, with an optional filter for these two statuses. New OSM records require faculty evidence before receiving those statuses.

The tour panel animates a simulated vehicle along the road. Start or pause travel, adjust progress, trigger an emergency and select an assistance facility. Simulate assistance completion, resume travel and reach 100% to complete the tour. Simulation movement and assistance are illustrative. Real emergency actions remain the user's responsibility.

The update passed both Chromium workflow tests, including questions, grouped services, verification filtering, emergency handling and tour completion.

## Redesigned interface

The sidebar links to the route planner, services, itinerary, tour and faculty review. Open Journey preferences above the map to answer the route questions. The overview reports route distance, estimated driving time, discovered services and recorded verifications.

Services have category icons, separate expandable groups and verification badges. The facility drawer supports keyboard focus and Escape to close. On narrow screens the navigation becomes a horizontal menu.

The tour includes a second map with a moving vehicle, progress control, an emergency response sequence and destination completion. The main map's Fit route button restores the complete corridor view. This prototype displays simulated vehicle movement.

Offline fonts and the OSM road backdrop are bundled. The backdrop is simplified for display. Rebuild it with Python and osmium from the same dated extract using the command below.

```powershell
py scripts/map-roads.py southern-zone-261117.osm.pbf
```

The project includes Fieldtrip-offline.html for a server-free demonstration. Open that file in a browser after extracting the ZIP. This file uses real cached data, stores saved trip edits in this browser, and requires the full server app for live requests and faculty verification. Regenerate it after building with `npm.cmd run build:offline`.

UI previews are in previews/. Browser checks include desktop and 390-pixel mobile layouts, keyboard dismissal of the facility drawer, category filters, an emergency simulation, the Bengaluru corridor and the standalone file.

## Reliability update

The local faculty account, cookie sessions, verification editing and sign-out work through the app interface. The selected destination, mode, radius and map-picked endpoints are restored in the same browser. Save Journey persists trip preferences and stops in SQLite.

The guided emergency panel can request an actual OSRM driving distance and duration, then open driving directions. Driving results remain dependent on OSRM availability. Its movement and assistance-completed actions are explicitly simulated.

The server accepts optional OSRM_URL and OVERPASS_URL settings from a .env file. Copy .env.example to .env to configure a permitted provider or your own server. Public endpoints require no paid account. Requests are cached and serialized per provider, with bounded retries. Live Overpass failed during this environment's checks. Use Cached real OSM extract for a predictable presentation of both included journeys.

For a presentation, start with the short route and search the entire corridor. Open a service category and its source details. Create a faculty account and demonstrate the verification form using actual evidence you have gathered. Save an itinerary, refresh to reopen it, then run the tour and trigger a midpoint emergency. The emergency list includes unplanned hospitals.

This is a tested local academic prototype. Multi-user hosted access, email-based password recovery, comprehensive vehicle restrictions, and guarantees of real-time facility availability remain outside the delivered implementation. Back up runtime/trips.sqlite to retain your local work.

## GitHub Pages

The published site serves the bundled interactive corridor demo from docs/index.html. The narrated film is at docs/story.mp4. Live queries, authenticated faculty reviews and server persistence require running the Node app.

## Streamlit Community Cloud

Choose repository `Mind-Trainer/fieldtrip-planner`, branch `main`, and entry point `streamlit_app.py` in Community Cloud. Dependencies are pinned in `requirements.txt`. The Trip planner tab loads the bundled corridor map and the Watch the story tab plays the narrated film. Live API lookups and shared faculty accounts run in the Node edition.

For local use, run `python -m pip install -r requirements.txt` followed by `python -m streamlit run streamlit_app.py`.
