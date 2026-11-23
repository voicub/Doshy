# Surroundings (Site)

The real neighbourhood around your home, drawn from public data: nearby buildings, trees, roads, water, the shape of the ground and, if you choose, the satellite photo. It shows in **Live** mode (3D) and as a faint map under your plan in **Plan** mode. It is off until you switch it on. Older plans are untouched: a plan without a `site` shows no surroundings.

## Using it (the Surroundings panel)

Open it in **Plan** mode: the globe button in the dock, or `CMD K` / `CTRL K` and type "surroundings".

1. **Show the real surroundings of my home**: the big switch. The first time it uses the usual layers (buildings, trees, roads, water, ground height; the satellite photo stays off).
2. **Where**: the place used is Home Assistant's home location (the `zone.home` coordinates). If Home Assistant has none, or you want another place, turn on **Use other coordinates** and type latitude and longitude, or paste a pair such as `51.4779, -0.0015` from a map app into either box (`51.48N 0.12E` and `51,48 0,12` work too).
3. **How far**: Small 150 m, Medium 250 m, Large 400 m, Wide 600 m. Advanced has an exact distance (100 to 600 m). Wider means more data and a longer first load.
4. **What to show**: the layer chips. **Satellite photo** loads photos from a third-party map service (Esri by default), so it is off unless you turn it on. With it on, trees are also found in the photo (OpenStreetMap often has none mapped); without it you see only mapped trees.
5. **Line it up with the real building**: see below.
6. **Status** says what was loaded (for example "59 buildings, 120 trees ...") or why it failed in a sentence. **Refresh data** fetches it again, skipping the stored copies. The credits are always shown while the surroundings are on.

Every change in the panel is one undo step (the Undo button or `CMD Z`).

### Lining it up

The coordinates put the map in the right place to a few metres; the flat you drew rarely sits exactly on its real spot. Fix it in either of two ways:

- **Drag the map to line it up** (the easy way): the plan shows the satellite photo (strength slider, 45 % by default) and the outlines of the neighbours behind your walls. Press the button, then drag anywhere on the plan: the map moves, your walls do not. Done / `Esc` ends it. Pan with the middle mouse button or `Space` + drag, and pinch to zoom, as always.
- **The four arrows** nudge the map 1 m (hold Shift: 5 m). **Advanced** has exact numbers (`dx`, `dy`: how many metres your plan's origin lies east and south of the map's centre). **Reset alignment** puts it back to 0, 0.

The first time you switch the surroundings on for a plan that was never lined up (`dx` and `dy` both 0), the MIDDLE of your plan is put on the home location (in the same undo step as the switch; `enablePatch` in `lib/siteUi.ts`) and the panel says so. A plan you already nudged is left alone, and loading a plan with the surroundings on never moves anything.

**Turn the plan** sets the compass direction the top of your plan faces (the plan's `bearing`; 0 = north, 90 = east, 180 = south, 270 = west), with N / E / S / W buttons, 5 degree turns and an exact field. The same number drives the real sun direction and the compass, so turning the plan also turns the sun. Your starter flat is already set to the direction of its building.

## What is stored

`plan.site` (optional), saved with the plan everywhere the plan goes: browser storage, the server database, plan export / import and the local safety stash. When a plan is loaded the value is read through `siteOf` (`lib/siteTypes.ts`): missing fields get defaults, numbers are clamped and unknown keys are dropped. A plan with no `site` is never given one by loading it.

```ts
Site = { source: "home" | "manual"; lat?; lon?; dx; dy; enabled; radius; layers: { buildings; trees; roads; water; terrain; satellite } }
```

Code: `lib/siteUi.ts` (coordinate parsing, nudge and drag maths, the undoable `setSite` step, `withSite`), `components/ui/SitePanel.tsx` (+ `SitePlace`, `SiteAlignControls`, `sitePanel.css`), the Plan underlay `components/plan/SiteUnderlay.tsx` and `SiteAlignBar.tsx`. The underlay is one SVG group `rotate(-bearing) translate(-dx -dy)` around the photo and the outlines, drawn behind the blueprint paper; it takes no pointer events, so it cannot get in the way of editing. Tests: `lib/siteUi.test.ts`.

## Privacy: what leaves your machine

Only through this app's own server, never straight from the browser (except the photo, see below):

- **Map data** (buildings, trees, roads, water): the rounded coordinates and the distance go to OpenStreetMap's Overpass service.
- **Ground height**: rounded coordinates of a grid of points go to Open-Meteo (Copernicus DEM).
- **Satellite photo** (only when that layer is on): the photo tiles for the area are fetched from the tile provider by this app's server and kept on disk. Nothing else is sent.
- Home Assistant data, the plan, your furniture and your entity names never leave your machine through this feature.

Nothing is requested while the switch is off.

## The map data: OpenStreetMap and ground height

Code: `app/api/site/data/route.ts` (the route), `lib/siteServer.ts` (query checks, fetching, cache, rate limit), `lib/siteOsm.ts` (Overpass query and parser), `lib/siteElevation.ts` (ground height), `lib/geo.ts` + `lib/siteGeom.ts` (coordinates, tiles, polygons), `lib/siteStore.ts` + `lib/siteState.ts` (the browser store: when to fetch, merging). Tests: `lib/geo.test.ts`, `lib/siteGeom.test.ts`, `lib/siteOsm.test.ts` (with `lib/siteOsm.fixture.json`, a recorded Overpass answer for 22 elements, moved to a neutral place with its names and addresses removed), `lib/siteElevation.test.ts`, `lib/siteServer.test.ts`, `lib/siteState.test.ts`.

**Sources and licences.** Buildings, trees, roads, water and land use come from OpenStreetMap through the Overpass API (data (c) OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright); the credit must stay visible, the panel shows it). Ground height comes from the Copernicus DEM through Open-Meteo's free elevation API (no key; credit "Elevation: Copernicus DEM via Open-Meteo"; Open-Meteo asks for non-commercial use, a commercial deployment needs its own plan). Both are asked by this app's server, with the User-Agent `doshy/1.0 (+https://github.com/voicub/Doshy; personal home dashboard)`; the browser never contacts them.

**The route.** `GET /api/site/data?lat=&lon=&radius=` answers `SiteData` (`lib/siteTypes.ts`): coordinates in metres about the centre point, x east, y south. Same-origin only. `lat` and `lon` must be plain decimals in range, `radius` 100 to 600; nothing but those numbers reaches an upstream URL. Errors are plain sentences (400 bad query, 403 not from the dashboard, 429 too many requests, 502 neither service answered), never the upstream's text. `&fresh=1` skips the cache, honoured only for a browser on the same origin (the Refresh button).

**What is read from OpenStreetMap.** Buildings (ways and multipolygon relations; `building:part` is skipped), `natural=tree` and tree rows, woods, scrub, water, grass and other land cover, parks and gardens, parking, rivers, streams, canals, roads and paths (`highway`) and railways. Heights: `height`, else `building:levels` x 3 m, else a guess by kind (house 6 m, apartment block 15 m, shed 3 m, small unmarked building 7 m, larger 12 m); `height` counts to the ridge, so the wall height is that minus the roof. Roofs come from `roof:shape` (gabled, hipped, pyramidal, skillion, dome, flat), else flat for blocks and commercial buildings, gabled for houses. Colours pass only as CSS names or `#hex`. Barriers (hedges, fences, walls) are not drawn: the scene has no place for lines of them. At most 1500 buildings, 3000 trees, 1500 areas and 3000 roads are kept (the nearest ones, with a note).

**Ground height.** A grid of up to 21 x 21 points (spaced at most 60 m, the grid spans exactly the radius) is asked in batches of 100, then smoothed and made relative to the height at home. The Copernicus model has one value per about 90 m: hills and slopes are real, a retaining wall, a plinth or a terrace of your garden is not, so the panel says so. If the service fails the ground is flat, with a note.

**Completeness.** OpenStreetMap is edited by volunteers: new buildings can be missing, heights are often guessed, and trees are frequently not mapped at all (that is why the satellite layer also looks for trees in the photo). The result is a faithful neighbourhood sketch, not a survey.

**Caching and limits.** Answers are kept on disk in `data/site-cache/data/` (the `data/` folder is not committed; `HOUSEY_SITE_CACHE` moves the folder) for 30 days, one file per place (coordinates to 5 decimals) and radius rounded up to the next 50 m, newest 200 kept. An answer with a missing part (a service was down) is kept only 10 minutes. Several requests for the same place at once share one fetch. Requests that really reach OpenStreetMap or Open-Meteo are limited to 4 a minute for the whole server (a cached answer is free). Overpass is slow and sometimes busy: a first load takes 30 to 60 seconds. The server tries the main Overpass server (60 s), then the mirror `overpass.kumi.systems`, then the main one once more; the Open-Meteo call is retried once.

**The browser store.** `useSiteState` (`lib/siteStore.ts`): `status` is `off` (the switch is off: nothing is requested), `loading`, `ready` or `error` (with a sentence in `error`). It fetches when the site is on and Home Assistant's `zone.home` (or the manual coordinates) is known, again when the place or radius changes (radius changes wait half a second for the slider to settle), and never repeats a failed fetch by itself: the Refresh button does. The satellite photo loads only with the Satellite layer on; with the Trees layer also on, the trees found in the photo are merged with the mapped ones (a found tree on top of a mapped one, inside a building outline, or outside the radius is dropped).

## Settings (environment, `.env.local`)

| Variable | Meaning | Default |
|---|---|---|
| `SITE_TILE_URL` | Satellite tile template with `{z}` `{y}` `{x}` | Esri World Imagery (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`) |
| `SITE_TILE_MAX_ZOOM` | Deepest zoom level the provider has for your area | 17 |

Check the terms of whichever provider you point `SITE_TILE_URL` at: the default is fine for personal use; a public deployment needs its own agreement.

## Credits

(c) OpenStreetMap contributors (ODbL). Elevation: Copernicus DEM via Open-Meteo. Satellite photo: the tile provider (Esri World Imagery by default). The panel shows them while the surroundings are on.

## The satellite photo and the trees found in it

Code: `app/api/site/tile/[z]/[x]/[y]/route.ts` (the tile proxy), `lib/siteTiles.ts` (provider settings, tile validation, cache trimming), `lib/sitePhoto.ts` + `lib/sitePhotoMath.ts` (browser: choose tiles, stitch, texture), `lib/canopy.ts` (tree finding). Tests: `lib/siteTiles.test.ts`, `lib/sitePhotoMath.test.ts`, `lib/canopy.test.ts`.

**Provider.** Esri World Imagery by default. This is a third-party service with its own terms of use: this app only fetches the tiles for your own site, one by one, through your own server, and only when you switch the Satellite photo layer on (it is off by default). That is fine for a personal home dashboard; a public or commercial deployment needs its own agreement with the provider, or another provider in `SITE_TILE_URL`. Settings, all optional: `SITE_TILE_URL` (template with `{z}` `{y}` `{x}`, http or https), `SITE_TILE_MAX_ZOOM` (0 to 22, default 17: Esri has no pictures deeper than that in some areas and answers a grey "not yet available" tile above it), `SITE_TILE_CREDIT` (the credit line, plain ASCII; default "Imagery: Esri, Maxar, Earthstar Geographics"). The credit travels with each tile (`x-tile-credit`) and is `SitePhoto.credit`: show it while the photo is on.

**The route** `GET /api/site/tile/{z}/{x}/{y}`: only three integers from the path ever reach the provider's URL (checked: `z` up to the max zoom, `x` and `y` inside the world at that zoom). Same-origin only; at most 600 requests and 150 provider fetches a minute (a scene load is about 10 to 36). The answer must be a real JPEG, PNG or WebP picture (checked by its first bytes, never trusted from the provider's headers) of at most 2 MB, fetched with a 10 s timeout and no redirects; anything else is a plain-sentence error. Pictures are cached on disk in `data/site-tiles/<provider-hash>/<z>/<x>/<y>.jpg` (the `data/` folder is not committed), capped at about 300 MB with the oldest files deleted first, and served with `Cache-Control: public, max-age=604800`. Changing the provider uses a new cache folder. Delete `data/site-tiles` any time.

**Zoom.** `loadSitePhoto` takes the deepest zoom the provider has that keeps the photo to 6 x 6 tiles (1536 px) or fewer: zoom 17 (about 0.8 m per pixel at 48 degrees north) up to a radius of about 400 m, then zoom 16 for the widest sites. A tile that fails to load is painted plain grass and counted in `SitePhoto.failed`; if none loads it says so in a sentence. `groundTexture(photo)` is the same picture with power-of-two sides (at most 2048 px) for the 3D ground.

**Finding trees (a heuristic, not a model).** OpenStreetMap often has no trees mapped, so with the Satellite layer on the tool also looks for them in the photo, using only pixel colours (`lib/canopy.ts`, no libraries): green pixels (excess green) that are not a bright, smooth lawn (crowns are darker and speckled), cleaned up and closed, then the distance of each pixel from the edge of the green and the brightness of the lit crown tops give one crown top per 6.5 m or so. Crown width comes from the distance to the edge of the green and to the next crown top (limited to 2 to 16 m), height is `4 + 0.9 x crown` (3 to 22 m), every tree is broadleaf (conifers cannot be told apart from pixels), at most 2500, same answer every time. On a 768 px picture of Baia Mare (summer imagery, dense broadleaf trees between apartment blocks) it finds about 1300 trees in 0.6 square km in about 0.12 s, and by eye most of them sit on a real crown, but expect: trees merged or split in dense groves, hedges, bushes and green car-park surfaces taken for trees now and then, crowns a bit too wide next to lawns, dark shadows sometimes taken for crowns, nothing under heavy shade and little in winter pictures. It makes the surroundings look like the real place; it is not a tree survey.

## In Live mode (3D)

Neighbours are drawn around the plan. Every building that touches what the plan occupies (walls, every level's rooms, garden areas, plus 1.5 m; `planFootprint` in `lib/siteMesh.ts`) or holds the home point is left out, because your own flat is drawn from the plan. Plan mode still draws its outline, faint and unfilled, because it is what you line the plan up against. While the surroundings show, the lawn is replaced by the real ground (it looks the same within about 28 m of the plan), garden trees give way to real ones, and plants never grow inside a neighbour's walls.

### Cut-away: the neighbours near the flat sink

From the default isometric camera a block 8 to 40 m away can stand between the lens and the flat and hide its roof, living area and balcony. So the Cut-away setting (the toolbar button, `X`) lowers the neighbours the way it lowers the flat's own walls: a building whose nearest point is within `CUT_NEAR_M` (15 m) of the plan's footprint (`planFootprint`, so garden areas count) is cut down to the cut-wall height (`WALL_CUT_H`, 0.9 m), growing smoothly back to its real height at `CUT_FAR_M` (45 m) and beyond (`cutFactor`, a smoothstep of the distance; `cutKeep` turns it into the share of the height kept, never raising a building that is already low). With Cut-away off nothing is lowered. Tall blocks further than 45 m are drawn as before.

- One value per building (its nearest point), never per vertex, so a lowered block is a clean low volume and a roof stays a roof, only lower: every height above the ground is scaled by the same factor, gables and parapets included. The window rows shrink with the wall (the texture's v is scaled about the ground), and the normals follow so a lowered roof is lit like a low one.
- It is a vertex attribute (`aCut` = scale, ground height, window origin; `buildBuildings` fills it, `CUT_STRIDE` floats per vertex) and one shared uniform `uCut` (`SITE_U`, 0 = real, 1 = lowered) in the buildings' shader (`components/scene/site/siteShader.ts`): no extra draw calls, no geometry rebuild when Cut-away is toggled. `SiteBuildings` eases `uCut` at the rate the flat's roof lifts off (`Roof.tsx`).
- The sun's and the lamps' shadow maps use the same lowering (`patchCutDepth`, as `customDepthMaterial` / `customDistanceMaterial`), so a lowered block casts the shadow of what is drawn, not of the tall block.
- Trees from the map or the photo get the same curve (`SiteTrees`): a tree beside the flat is a low shrub while Cut-away is on, one that grows 45 m away is untouched. Trees change at once (they are static instances), buildings ease. The flat's own garden trees and plants are never touched.
- Tests: `cut-away neighbours` in `lib/siteMesh.test.ts` (the curve is 0 at the plan, monotonic, 1 from 45 m; distances to an outline; the attribute).
- Code: `lib/siteMesh.ts` is the one entry module (components import from it); the geometry lives beside it in `siteMeshGround.ts` (height, terrain grid), `siteMeshPlan.ts` (which neighbours are drawn, the plan footprint), `siteMeshRoof.ts`, `siteMeshCut.ts` (the cut-away curve), `siteMeshBuildings.ts`, `siteMeshWorld.ts` (roads, water, ribbons), `siteMeshTrees.ts`, with `siteMeshBuf.ts` (triangle buffers, triangulation) and `siteMeshBase.ts` (colours) underneath.

### Rendering notes

- **Camera depth range** (`Rig.tsx`: `near={-200}`, `far={300}`). The ortho camera stands 40 m from its target, so in a far-out view the ground and the blocks in the foreground (the lower part of the screen) lie *behind* the lens plane, and a positive `near` slices them off in a hard line: the negative value is needed with the surroundings on (ground to 250 m and more). It cannot let anything show through that should not: an orthographic depth buffer is linear, and 500 m over 24 bits is 0.00003 m per step, far below the 0.014 m between the site's ground (-0.002), the roads (+0.008) and the garden's paths (+0.012 and up), so nothing flickers. (Checked by calculation; a side-by-side with `near={1}` could not be captured, the dev build was broken by other work at the time.)
- **Sun shadow camera** (`Scene3D.tsx`): the sun stands `SUN_DISTANCE` (60 m) from the flat and its shadow camera reaches 70 m past the flat. It used to stand 22 m away with a near plane at 0.5 m: a caster more than about 21 m towards the sun (a neighbour at dusk, when shadows are long) is in front of that near plane, so it casts no shadow, and a block straddling the plane would cast a shadow cut off along a straight edge. This follows from how a directional light's shadow camera works; it was not seen on screen (the neighbour shadows that reach the flat only at a very low sun, and the dusk preset's sun was not lined up with any neighbour at the owner's place). Neighbours within `SHADOW_M` (46 m) of the flat cast shadows.
- **Ground near the flat**: within 12 m of the building the real ground is exactly the garden's own ground (height 0), so paths, patios and cars lie on it; the garden's hedges and fences 12 to 20 m out sit on ground that has risen by `terrainBlend` of the real height there (6 % of it at 18 m).
