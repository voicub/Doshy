# The real night sky

At night the 3D view shows the sky as it really is above your home: about 2,900 real stars, the planets, the Moon and, optionally, the space station (ISS). A chart called **Tonight's sky** lists what is up and when.

Data sources, formulas and licences are in [night-sky-data.md](night-sky-data.md); they are not repeated here.

## Using it

- **In the 3D view**: nothing to do. The dome follows the sky clock (so "Preview a date" works too), your home's position and the plan's compass bearing, so a star rises where it really rises over your house. It draws nothing while the sun is up. Cloud from the live weather and a bright Moon hide the faint stars.
- **Tonight's sky chart**: the Night sky button in the dock, or the command palette (`Night sky...`). A round map with the point overhead in the middle and the horizon on the rim (south at the top for homes in the southern hemisphere). It also shows Moon phase, rise and set, which planets are visible and when, sunset, sunrise and the three dusks and dawns. The slider moves through the night in 5-minute steps; "Live time" returns. Switches: constellation lines and ISS.
- **Walkthrough**: the real perspective camera is used, so the sky is what you see through a window.
- **Wall display**: add the slide "Tonight's sky" in the wall settings (off by default). It shows the compact chart without the controls. See [wall-display.md](wall-display.md).

The place is the plan's Site (manual coordinates or the Home Assistant home zone); without either, the same default place as the Live sky is used. Chart north is true north, not the plan's bearing.

## Quality tiers

| Tier | 3D sky |
|---|---|
| Eco, Low | not mounted |
| Medium | stars, planets, Moon |
| High | plus constellation lines and the ISS marker with a short trail |
| Ultra | plus star twinkle (off with reduced motion) |

The chart (and wall slide) works in every tier. The dome has no animation loop of its own: it redraws when the scene already redraws, plus once after each 30-second sky update. Constellation lines can be turned off.

## The ISS and your privacy

The station's position is the only thing that needs the internet. The Doshy server asks `api.wheretheiss.at` for two positions with a fixed URL; nothing about you or the home is sent. One upstream request per 10 seconds at most, however many browsers are open (5 seconds after a failure). The browser only asks while the station could be above your horizon, the tab is visible and the sky is dark.

- Off for one device: untick **ISS** in the chart (stored on this device, key `housey-nightsky`).
- Off for the whole server: set `DOSHY_EXTERNAL_DATA=0`. The route answers `{ disabled: true }`, the chart says so, and stars and planets keep working. This switch also stops the other optional downloads (see [polyhaven.md](polyhaven.md)).
- If the service is down, the chart says the position is unavailable. Stars, planets and the Moon never need the network.

The ISS marker is its geometric position: it does not claim the station is sunlit or visible to the eye. Pass times (elevation of at least 10 degrees, next 12 hours, up to three listed) come from a simple circular-orbit model anchored on the latest position: good to a few minutes for a few hours, not for planning a photograph.

## Limits

- Stars to magnitude 5.5 only; no deep-sky objects, no atmospheric refraction, low-precision planets (see the data doc).
- The Moon is a marker, bigger and brighter when fuller, not a lit disc.
- Not a planetarium: the faintest-star limit is a model of twilight, Moon glare and cloud.

## For contributors

- Pure maths: `lib/nightsky.ts` (time, precession, alt/az, limiting magnitude), `lib/planets.ts`, `lib/nightskyTimes.ts` (rise, set, twilights, `tonight`), `lib/nightskyFrame.ts` (J2000 to scene matrix), `lib/stars.ts` (decodes generated `lib/starData.ts`), `lib/iss.ts`, `lib/issFeed.ts` (validates the server reply; rejects fixes older than 2 minutes), `lib/skyChart.ts` and `lib/skyChartDraw.ts` (chart geometry and paths). All have `*.test.ts` and no React.
- Wiring: `lib/nightskyUse.ts` (`useNightSky`, `useHomePlace`, `DAY_LIMIT`), `lib/issUse.ts` (shared polling), `lib/nightskySettings.ts` (device-local), `lib/server/iss.ts` and `app/api/sky/iss/route.ts` (single-flight cache, 5 s timeout, 16 KB cap, `redirect: "error"`).
- Scene: `components/scene/NightSky.tsx`, `NightSkyIss.tsx`, `nightSkyShader.ts`; mounted from `Scene3D.tsx` by `k.nightSky` (`lib/quality.ts`: 0, 0, 1, 2, 3).
- UI: `components/ui/SkyChart.tsx` (`SkyMap`, `SkyTonight`), `SkyChartHost.tsx` (lazy), `skyChartUi.ts`, slide in `components/WallDisplay.tsx`.
- Invariants: angles in degrees, azimuth clockwise from north; catalogue stars are J2000 and must be precessed before `raDecToAltAz`; the chart and the dome use the same catalogue and transform; no request is made when ISS is off.

## Not verified

- Not compared visually against a planetarium app or the real sky from a given home.
- The wall slide and the dome were not measured on a Raspberry Pi.
- The ISS service's availability and rate limits are as documented by its provider; not tested live here.
