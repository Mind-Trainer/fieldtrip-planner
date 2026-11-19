# Executed acceptance checks · 18 November 2026

OSRM full-resolution driving responses and the 17 November 2026 Geofabrik southern India OSM extract were downloaded successfully. Both example requests asked for alternative routes. Each returned one route. The extracted database has 17,539 candidate service records before route-specific filtering.

| At 3 km | Nagercoil → Tirunelveli | Nagercoil → Bengaluru |
|---|---:|---:|
| Driving distance | 77.94 km | 636.02 km |
| Sections scanned | 7 of 7 | 53 of 53 |
| Unique OSM records | 335 | 5,423 |
| Healthcare (includes clinics and pharmacies) | 204 | 1,678 |
| Police | 4 | 83 |
| Fuel | 51 | 430 |
| Mechanics | 3 | 91 |
| Food | 39 | 2,309 |
| Lodging | 24 | 498 |
| Supplies | 10 | 334 |

The short-route sections returned 142, 34, 52, 38, 11, 40 and 109 records before overlap deduplication. The OSM hospital-tagged Easwari Nursing Home (node/7844921942) projected to approximately 38.2 km along the route. The midpoint simulation returned it among unplanned services. Its emergency department and present operation were unverified.

The eight automated tests passed. They exercised geometry continuity, corridor exclusion and inclusion, both real datasets, missing tags, eligibility constraints, normalized recommendation scoring, simulation, the running HTTP application, failed-provider handling, access-controlled verification writes, history and SQLite persistence across a process restart. The built React app ran in a simulated DOM with the local API. It created Leaflet clusters, filtered the directory, opened facility details, saved a plan and simulated the midpoint emergency. The canvas and layout in that test were simulated.

A real request to OSRM succeeded during the original integration check. The public Overpass server returned HTTP 406 for a real section query and alternative endpoints timed out. End-to-end live Overpass discovery remains unverified. Offline discovery uses the downloaded PBF.

## UI upgrade checks

The TypeScript check and Vite production build passed. All eight automated data, persistence and DOM tests passed.

All five Chromium browser tests passed with the redesigned UI. They exercised desktop navigation, the 390-pixel mobile layout, category filters, facility drawer focus and Escape dismissal, itinerary generation and saving, route questions, emergency selection and tour completion. The moving vehicle updated as the tour ran. The Bengaluru browser flow retrieved all 5,423 corridor records and remained interactive. That test completed in approximately 18 seconds.

The standalone HTML was loaded through a browser test response and performed a real cached corridor search with 335 records. It requested no external assets. This verifies embedded fonts, code and offline data. The managed browser's policy blocks direct file URLs, so direct file opening remains unverified in this environment.

The offline road backdrop was derived from the same 17 November Geofabrik extract. It contains 37,172 simplified road sections around the two example routes. It is a context layer. Full driving geometry is retained for corridor search.

Screenshots in previews/ show the desktop overview, service directory, emergency response and mobile detail drawer. Windows commands are documented. Execution and browser tests used Linux.

The managed interactive preview relay previously timed out. The ZIP and bundled standalone HTML are the local delivery options.


## Server workflow repair

All eight automated tests and all six Chromium tests passed after the repair. Faculty setup, password sign-in, evidence editing, filtering a partially verified record, saving a plan, reopening after refresh, and sign-out were exercised through the UI. Tests used temporary databases. Account login and cookie invalidation were also checked across a server restart.

Actual live requests through the app returned HTTP 200 for the Nagercoil to Tirunelveli route (77,940.9 metres) and an emergency driving route (3,843 metres, 389.2 seconds). LIVE-CHECK.json records those responses. The browser emergency-button test used this recorded response to check the interaction independently of internet availability.

Three small public Overpass POST probes timed out. Live Overpass facility discovery remains unverified. The presentation dataset remains the downloaded real OSM extract. A free public API cannot guarantee service uptime.

START-WINDOWS.cmd and scripts/start.mjs are included to install dependencies and open the server app after its health check. Windows execution remains unverified in the Linux environment.
