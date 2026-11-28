# Surroundings: detailed ground (AWS Terrain Tiles) and Overture Maps buildings

Two optional data sources for the [Surroundings](site.md), both free, both on by default, both with OpenStreetMap + Open-Meteo as the fallback. `DOSHY_EXTERNAL_DATA=0` (see [polyhaven.md](polyhaven.md), `lib/server/externalData.ts`) stops this server asking either of them; the panel then simply keeps OpenStreetMap and the standard ground, without a warning.

## In the panel (Plan mode > Surroundings)

- **Ground detail**: Auto (detailed ground, standard when it cannot be loaded), Standard (the 90 m Open-Meteo model only), High (detailed). A sentence says what is in use ("one point about every 8 m (AWS Terrain Tiles)"). **Hills look** 1x, 1.5x, 2x, 3x exaggerates the slopes; **Smooth the ground** None / Light / Strong takes small bumps off. Your own flat always stays level.
- **Buildings from**: OpenStreetMap / Overture Maps (more heights) / Both (best, the default). Hidden while the city model (Vectiler) is chosen. A sentence counts the buildings with a measured height ("16 of 35 buildings have a measured height (OpenStreetMap alone: 5 of 26)"). When Overture cannot be read the panel says "Overture data unavailable right now, showing OpenStreetMap."

Stored in `plan.site` (all optional, only non-default values): `terrainFrom` ("standard" | "high"), `terrainScale` (0.5 to 3), `terrainSmooth` (1 | 2), `buildingData` ("osm" | "overture"). Old plans load unchanged; `siteOf` drops anything invalid. Plan files, the database and guest links carry them (`lib/siteTypes.ts`).

## What is sent where

Through this app's server only, never from the browser. The coordinates are rounded and no plan data, device or entity name is sent.

| to | what | when |
|---|---|---|
| `s3.amazonaws.com/elevation-tiles-prod` (AWS Open Data) | the numbers of 1 to 9 map tiles (`terrarium/{z}/{x}/{y}.png`) around your home | detailed ground on |
| `stac.overturemaps.org` (once a day) | nothing but a request for the current release name and the link to its building tiles | Overture on |
| `tiles.overturemaps.org` | HTTP range requests (byte offsets) into the release's `buildings.pmtiles`, for 1 to 9 tiles around your home | Overture on |

User-Agent `doshy/1.0 (+https://github.com/voicub/Doshy; personal home dashboard)`. Everything is cached on disk under `HOUSEY_SITE_CACHE` (default `data/site-cache`): `terrain/` (PNG tiles, 90 days, 150 MB, oldest first, atomic writes) and `overture/` (one gzip file per release and tile, 30 days, 150 MB; the file `latest.json` remembers the release for a day). A second load makes no request.

## Ground: AWS Terrain Tiles

Code: `lib/pngTerrarium.ts` (PNG decoder), `lib/siteTerrainTiles.ts` (tile maths, resampling), `lib/siteTerrainServer.ts` + `app/api/site/terrain/route.ts` (fetch, cache, route), `lib/siteTerrainShape.ts` (tier budgets, smoothing, exaggeration), `lib/siteExternal.ts` (composition). The decoding is done on the **server** (not in a browser worker): a PNG is a zlib stream and Node has zlib built in, so there is no dependency and no work on a Raspberry Pi's browser; the browser only receives `n x n` numbers.

- **Data**: the Mapzen "Terrarium" tiles, 256 x 256 PNG, height in metres = R x 256 + G + B / 256 - 32768 (all zero = no data). URL `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, zoom 0 to 15 (checked: z16 answers 404); z15 is about 3 m a pixel at mid latitudes. Licence and credit: the dataset's [attribution page](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) (full required list in `CREDITS.md`; the panel shows a short line).
- **Zoom** is the one whose pixel is closest to the grid spacing `2 x radius / (n - 1)`, kept between 11 and 15 (`terrainZoom`). A site touches 1 to 9 tiles (at most 16).
- **Grid size by graphics tier** (`TERRAIN_GRID`): Eco 65, Light 97, Balanced 129, Detailed 161, Ultra 193 nodes per side, asked of the server (`GET /api/site/terrain?lat=&lon=&radius=&n=`, n odd 33 to 257, radius as the data route's 50 m steps). The ground mesh (`meshCell`) follows the grid down to 2.5 m, but **Eco keeps the usual 4 to 12 m cut**, so its vertex count is what it was before. A tier change by the frame governor asks for a smaller grid again (from cached tiles).
- **Resampling**: bilinear at pixel centres across tile seams; a no-data pixel is left out of the average; holes (coast cuts, up to 30 % of the nodes) are filled from neighbours; no data at the centre, or too many holes, fails the request (the standard ground stays, with a sentence).
- **The house does not float or sink**: the grid is metres relative to the ground at the home point (exactly 0 at the centre node), and `groundFn` keeps the plan's own footprint plus 12 m at exactly 0 and blends to the real height over the next 40 m, as with the Open-Meteo grid. Smoothing and exaggeration re-zero at the centre. Alignment (`dx`, `dy`, bearing) is unchanged: the grid is in site axes like before. Buildings, roads, trees, plants and water all take their height from `groundFn` (checked in the code: `demAt` has no other caller), so they sit on the new surface.
- **Errors**: 400 bad numbers, 403 downloads switched off, 429 too many (server-wide 90 tile downloads a minute, 60 requests a minute), 502 service down. Tiles are fetched with redirects refused, 10 s timeout, 600 KB cap, and only cached when they decode as a Terrarium picture.

## Buildings: Overture Maps

Code: `lib/pmtiles.ts` (PMTiles v3 reader), `lib/mvt.ts` (vector tile decoder), `lib/siteOverture.ts` (features to buildings), `lib/siteOvertureMerge.ts` (merge with OpenStreetMap), `lib/siteOvertureServer.ts` + `app/api/site/overture/route.ts`.

**What was researched.** Overture publishes GeoParquet (S3/Azure, read with DuckDB or the `overturemaps` Python tool), PMTiles vector tiles, and a STAC catalogue. A Parquet reader is far too heavy to hand-write, and the Python/DuckDB tools are programs, not an endpoint; there is no free query API. The PMTiles archive is the one thing readable with Node built-ins: a 127-byte header, varint directories and gzip, over HTTP range requests (verified: `tiles.overturemaps.org/<release>/buildings.pmtiles`, 181 GB, `206` answers; max zoom 14; the `building` layer carries `height`, `num_floors`, `min_height`, `min_floor`, `roof_shape`, `roof_height`, `roof_color`, `facade_color`, `class`, `subtype`, `has_parts`, `is_underground`, and a `building_part` layer). **Overture's own warning**: "Don't use these tiles in production: layers, properties and zoom levels may change in any release without notice." So everything is checked (release name, host, path, 206 and exact sizes, directory bounds, gzip caps, extents) and any surprise becomes "Overture data unavailable right now, showing OpenStreetMap". Releases are discovered each day through STAC (`catalog.json` `latest`, then the buildings catalogue's `pmtiles` link, accepted only on `tiles.overturemaps.org` or the same bucket's S3 name and only as `<release>/buildings.pmtiles`); old releases expire from S3 after 60 days, so the release is never hard-coded.

**Reading.** Header and root directory once per release (about 14 KB); the leaf directory holding the tile and the tile itself per z14 tile (about 100 to 400 KB for a city centre), 3 to 4 range requests for a cold tile, none for a cached one.

**Mapping** (`buildingsOfFeature`): `height` is to the ridge, so wall = height minus roof height (the OpenStreetMap rules, shared in `buildingShape` in `lib/siteOsm.ts`); else `num_floors` x 3 m; else a guess by kind; `real` marks the first two. Roof shapes map onto the scene's six (gambrel and saltbox gabled, half-hipped and mansard hipped, onion and round dome). Colours from `facade_color` / `roof_color` only if present and a valid CSS colour. Underground and under-6 m2 footprints are dropped. A building with parts is drawn by its parts when they cover 70 % of it; otherwise the parts stand on the building (tower on podium).

**Merge** (`mergeBuildings`, in the browser, so changing the choice needs no new request): "Both" keeps every OpenStreetMap footprint; where OpenStreetMap only guessed the height and one Overture building overlaps it (IoU 0.4, sampled on a grid) with a real height, it takes that height and roof; where several finer Overture buildings cover 60 % of it, they replace it; Overture-only buildings are added. A real OpenStreetMap height is never replaced. Trees, roads, water and land use stay OpenStreetMap's.

## Limits (honest)

- Overture's PMTiles are an inspection product; if their layout changes the feature falls back to OpenStreetMap (tested with synthetic archives, not with a changed real release).
- A building cut by a z14 tile edge arrives as one piece per tile (two prisms, a gabled roof is then drawn per piece).
- The terrain is a bare-earth model: walls, plinths and terraces are not in it (near the home the garden's own flat ground wins anyway); accuracy is a metre or more (3 m pixels; much better with national lidar, e.g. the UK, coarser from SRTM or GMTED2010).
- Overture heights are partly machine estimates (Microsoft ML Buildings); coverage differs by country. In the Greenwich (51.4779, -0.0015, 250 m) check of the pure code against the live services: OpenStreetMap 26 buildings, 5 with a measured height; Overture 36, 21; Both 35, 16.
- Unverified: the 3D result in a browser. The live-service numbers above were run through the real code from the command line; a browser session on a copy of a real plan showed the panel and its status lines (detailed ground at about 8 m on Eco, 185 buildings) but no neighbouring buildings or ground relief could be seen in the Live view in the headless software renderer, so no before/after screenshots, cut-away behaviour, long-task timings at 6x CPU or 800x480 captures are claimed.

## Tests

`lib/siteTerrainTiles.test.ts` (Terrarium decode with every PNG filter, zoom and tile maths, bilinear across seams, no-data, hole filling, 0 at the home point and the plan's ground), `lib/siteTerrainServer.test.ts` (validation, cache, TTL, stale fallback, damaged files, cap, synthetic PNGs built with zlib), `lib/siteTerrainShape.test.ts` (vertex budget by tier, smoothing, exaggeration), `lib/pmtiles.test.ts`, `lib/mvt.test.ts`, `lib/siteOverture.test.ts`, `lib/siteOvertureMerge.test.ts`, `lib/siteOvertureServer.test.ts` (fake STAC and archive: host and path checks, range strictness, release memory, cache, empty tiles, failures), `lib/siteExternal.test.ts` (composition, notes, credits, validators). None touches the network; fixtures are `lib/siteTerrainFixture.ts` and `lib/siteOvertureFixture.ts`.
