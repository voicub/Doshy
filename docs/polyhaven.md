# Poly Haven assets (HDRIs, textures, models)

[Poly Haven](https://polyhaven.com) publishes free assets under CC0 (public domain). Doshy can use three kinds of them, all picked from a browse dialog with a thumbnail grid, a search box and plain-English chips:

| what | where you find it | what it does |
|---|---|---|
| **Real sky lighting** (HDRI) | Graphics > Lighting > **Real sky...**; command palette "Lighting: real sky..." | The soft light and the reflections come from a real photographed sky or studio. Balanced and up. |
| **Materials** (PBR textures) | the room, wall and garden inspectors: **Material from Poly Haven...** next to "Use a photo of my floor..."; the Paint tool (floor mode) | A real wood, brick, tile or ground picture with roughness and relief, laid at its real size. |
| **3D models** | Furniture > My pieces > **Import from Poly Haven...** | A real furniture, plant or prop model saved as one of "My pieces". |

Every dialog says **Assets from Poly Haven (CC0)** with a link to polyhaven.com and to their Patreon: that credit is what the API terms ask for (see [Terms](#terms-and-credit)). Doshy is not made by or endorsed by Poly Haven.

## What leaves your machine

Only the Doshy **server** talks to Poly Haven, never the browser (and never a guest page: the guest view's allow-list blocks `/api/polyhaven/*`). What it asks for:

- the **listing** of each kind (`GET https://api.polyhaven.com/assets?t=hdris|textures|models`, no parameters about you; your search words and chips are applied on this server);
- the **download links** of one asset (`GET https://api.polyhaven.com/files/<asset id>`), then the files themselves from `https://dl.polyhaven.org/file/ph-assets/...`;
- the **preview pictures** (`https://cdn.polyhaven.com/asset_img/thumbs/<asset id>.png?width=256&height=256&format=webp&v=<picture version>`).

Poly Haven therefore sees an asset id, the address of the machine that runs Doshy and the User-Agent `Doshy/1.0 (+https://github.com/voicub/Doshy; Poly Haven browser)`. Nothing about the plan, the home, Home Assistant, your coordinates or your entities is sent. Nothing is requested until you open a browse dialog.

**Switch it all off:** `DOSHY_EXTERNAL_DATA=0` (also `off`, `false`, `no`) in the server's environment (`.env.local`, the Docker environment, the add-on option) and the routes answer 403 with "Downloads from the internet are switched off on this server". Things you already picked keep working: they are in your own database. The same switch covers the other optional downloads (Surroundings data), see `lib/server/externalData.ts`.

## Keeping it working without Poly Haven

Choosing an asset **copies it into your own database** as a resource; from then on nothing needs Poly Haven or the internet:

| kind | resource id | contents | size limit |
|---|---|---|---|
| `hdri` | `hdri-<24 hex of SHA-256>` | the Radiance `.hdr` picture (1k, about 1.5 MB; 2k, about 6 MB on Ultra) | 25 MB |
| `material` | `mat-<24 hex of SHA-256>` | ONE file (`lib/polyhavenMaterial.ts`): the 1k colour, roughness and normal pictures (JPEG, as they are) behind a small header with the asset name, authors and real size | 15 MB |
| `model` (existing) | `m_<id>` | one `.glb` with its pictures packed in (1k textures) | 25 MB |

The id is the content hash, so the same download is stored once. The author of every asset is kept with it (resource details; the piece's credit). The Data and backups panel lists them: a texture as "Poly Haven texture", a sky as "Poly Haven sky picture", with name, size and Delete.

- **Plan export / import**: textures travel in a `materials` block of the plan file next to the floor photos (`lib/planMaterialsFile.ts`): base64 of each `material` resource the plan uses, at most 15 MB each; importing puts them back (never overwriting) after checking the file opens and its SHA-256 matches the id the plan names. A texture that cannot be brought along makes those surfaces open with their plain look and a plain note. Model pieces travel with the plan's custom pieces as before. The lighting setting is a device setting, not part of a plan.
- **Guest links**: `GET /api/guest/<token>/resource/<id>` also serves a `material` resource, but only one the shared plan wears (floor, either wall face, ground area, path); anything else is a 404. The guest page never contacts Poly Haven.
- **Offline**: with the Poly Haven routes blocked (503), a reload still loads the stored sky and every texture from `/api/db/resources/<id>`, and the browse dialogs say "Poly Haven cannot be reached right now. Assets you already used still work; try again when the internet is back." with a Try again button.

## The server side

Code: `app/api/polyhaven/{assets,info,thumb,download}/route.ts` (thin), `lib/server/polyhavenService.ts` (the gate and the one shared client), `lib/server/polyhaven.ts` (the client: listing, downloads, packing), `lib/server/boundedDiskCache.ts` (the disk cache), `lib/polyhaven.ts` (pure: validation, parsing, search, which file to take), `lib/polyhavenClient.ts` and `components/ui/PolyHavenBrowser.tsx` (browser).

- `GET /api/polyhaven/assets?t=hdris|textures|models&q=&f=<chip id>&page=0&limit=48` answers `{ items, total, page, limit }` (page 0-based, limit at most 96). The full listing (about 1 MB a kind) is fetched at most every **6 hours** and searched here: every search word must appear in the name, a tag or a category, most downloaded first.
- `GET /api/polyhaven/info?t=&id=` one asset's details and credit line; `GET /api/polyhaven/thumb?id=&w=128|256&v=` a preview picture (kept for a year by the browser when `v` is given); `GET /api/polyhaven/download?kind=hdri|material|model&id=&res=1k|2k` the file (`hdri`: the `.hdr`; `material`: the one-file texture; `model`: the `.glb`). There is no public `files` route: the server reads Poly Haven's `/files/<id>` itself and never shows the browser a Poly Haven address.
- **Safety**: same-origin only; ids must match `^[A-Za-z0-9_-]{1,80}$` (Poly Haven ids contain capitals and dashes, e.g. `ArmChair_01`, `horn-koppe_snow`); every URL is built from validated parts or taken from the `/files` answer only when it is `https` on `dl.polyhaven.org` under `/file/ph-assets/` with no port or login; redirects are refused; timeouts (20 s for JSON and pictures, 60 s for files); every body has a byte cap, checked while reading, not just from the announced length. A `.hdr` must start with its Radiance signature, a texture picture must be a JPEG, a model must pass the same checks as a Sketchfab import. Error replies are plain sentences, never upstream text.
- **Size caps**: `.hdr` 25 MB; one texture picture 5 MB, the packed texture 15 MB; a model's source files 60 MB in at most 40 files, the packed `.glb` 25 MB (the database's limit for a model); a listing 8 MB.
- **Rate limits**: 900 requests a minute of any kind; at most 90 a minute that really reach Poly Haven's API or file host and 600 a minute for preview pictures (each picture is fetched once, then kept). A cached file costs nothing. Concurrent requests for the same file share one download.
- **Disk cache**: `<HOUSEY_SITE_CACHE or data/site-cache>/polyhaven/{files,thumbs}`, at most **500 MB**, least recently used first out, atomic writes (temp file then rename); it only holds things that can be fetched again, so deleting the folder is always safe. A damaged cached file is fetched again.
- Poly Haven's `dimensions` are millimetres; Doshy shows metres. A texture's repeat size is its smaller side (a 3000 mm brick wall: one picture covers 3 m).

## Real sky lighting

`lib/polyhavenEnv.ts` (pure: the setting, the resolution per tier, rotation, sun finding, the daylight scale; tests `lib/polyhavenEnv.test.ts`), `lib/lightingStore.ts` (the device setting), `components/scene/HdriEnv.tsx` + `hdriBuild.ts` + `hdriLive.ts` (the scene), `components/ui/HdriPicker.tsx` (the Graphics section).

- **Setting**: the settings row `housey-lighting` (global per device, not per plan): `{ state: { hdri: null | { resourceId, assetId, name, authors, credit, res: "1k"|"2k", intensity 0.2 to 2 (1), rotation -180 to 180, background, matchSun, alsoLive, sun? } } }`, scrubbed on load.
- **Tiers**: Eco and Light never fetch, decode or draw it and keep the painted environment (their knobs say `ibl: false`). Balanced and Detailed use the 1k picture, Ultra the 2k; a stored 1k picture keeps being used on Ultra. The stored resource is read first; Poly Haven is asked only when it is missing.
- **How**: three's HDR loader decodes the `.hdr`, a `PMREMGenerator` turns it into the environment (`scene.environment`: soft light and reflections); the picture and the render target are freed afterwards and when the choice changes or the scene goes. One frame is asked for after each change; idle frames stay at zero. The painted sky stays until the new one is ready, so the view is never unlit. In the Studio environment the strength is `intensity x 0.5`.
- **Options** (folded under the picker): intensity, rotation, **Show the sky behind the building** (blurred `scene.background`; in the top-down Studio view the floor covers most of it, so it mostly shows near the horizon), **Match the sun** (turns the sky so its sun faces the app's sun azimuth), **Also use in Live for reflections (static)** at `intensity x 0.25 x daylight`, so night stays dark. Poly Haven's listing has no sun data: the sun is found in the decoded picture as the brightest patch (about width/256 pixels) at least 12 times the area-weighted average and above 5 degrees elevation; cloudy skies and plain studios give "no clear sun" and the option does nothing. The result is saved in the setting.
- **Credit**: "Lighting by <name>, Poly Haven (CC0)", linked to `polyhaven.com/a/<id>`.

## Materials

`lib/materialRef.ts` (`MaterialRef = { resourceId, scaleM, rotation, avg }`, the same shape as a floor photo), `lib/planMaterials.ts` (scrub, `setFloorMaterial`, `setWallMaterial`, ground, `materialIds`, `withoutMaterials`), `lib/materialApply.ts` + `components/ui/MaterialBrowse.tsx` (the apply flow), `components/inspector/MaterialLook.tsx` (the controls), rendering `components/scene/materialTextures.ts`, `useMaterialLook.ts` and `lib/materialLook.ts`.

- **Plan fields** (all optional, scrubbed on load, kept by the database, the plan file, duplicates and the guest sanitiser): `room.floorMaterial`, `wall.material` (face A) and `wall.materialB` (face B), `GroundArea.material` and the same on garden paths. A floor wears a photo **or** a material (setting one takes the other off; plain floor paint removes both). Painting a wall face or ground with a style or colour takes that face's material off, so the paint is not hidden; applying a material never touches the style or colour, so **Remove material** restores the old look. Every apply, turn, size change and remove is one undo step.
- **Apply flow**: choose, the server packs the texture, the browser keeps it as a `material` resource, the average colour is computed once from the colour picture (in linear light, like floor photos) and stored in the plan (`avg`), and the size is the asset's real size when Poly Haven gives one (else 1 m; the field takes 5 cm to 30 m).
- **Cost per tier**:

| tier | what draws |
|---|---|
| Eco, Light | the stored average colour; the picture is never fetched |
| Balanced | colour and roughness, 512 px |
| Detailed, Ultra | colour, roughness and normal map, 1024 px |

  Size is `min(1024, textureSize x 2)`; sets load lazily in time slices, are shared per resource and size (reference counted) and are disposed 3 s after the last surface leaves; plans without materials load nothing. Walls: only the two faces wear it (end faces, underside and cap keep their look; fences and glass walls ignore materials). Ground: the material replaces the kind's procedural look and is untinted. Seamless tiling is Poly Haven's own, so no blending is done.

## 3D models

`lib/polyhavenPiece.ts` (pure: credit, source, name and heavy check; tests `lib/polyhavenPiece.test.ts`), `components/PolyHavenModelPick.tsx`, `components/ModelImport.tsx` (an optional `source`), `components/CarCredits.tsx`.

- Choosing a model downloads one `.glb` at 1k textures and feeds the **same import form** as "Import a 3D model": preview, name, size fields from the model's own bounding box (Poly Haven models are in metres), proportion lock, size and polygon budgets. A model above **150,000 polygons** gets a warning before and after the download. Eco draws model pieces the way it always did (nothing heavier).
- The piece gets `source: { type: "polyhaven", id, name, authors }`, a `pack` ("Poly Haven: <name>", the authors, licence "CC0 (Poly Haven)") so it appears under Share > My pieces > imported packs, and `tags` from the asset's categories and tags for catalogue search.
- **Credits**: "3D model credits" in the catalogue lists "Poly Haven models (CC0)" with the author and a link to the asset. A `.doshypack` export fills an empty author and licence box from the chosen pieces ("Poly Haven asset authors", "CC0 (Poly Haven)"; what you type is never replaced), and `source` travels in the file.

## Terms and credit

The API is free for any use; the assets are CC0 and need no credit. The live API's terms ([Public-API ToS](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md)) ask for a clear mention that the content comes from Poly Haven (done in every browse dialog and the credits list) and a unique User-Agent (done). They also say usage may change without notice and ask heavy users to get in touch; Doshy's volume is a listing every 6 hours plus the files you pick. See [CREDITS.md](../CREDITS.md).

## Limits and what is not verified

- The listing is fetched fresh after every server restart (it is kept in memory only); until it arrives the dialog shows "Loading...". With no internet the dialogs show the offline sentence, they do not show an older list.
- Search words are matched as parts of the name, a tag or a category (spaces in a name are ignored, so "armchair" finds "Arm Chair 01"); there is no spelling correction.
- Textures are always the 1k set (and models the 1k textures): sharper is a future option. Ambient occlusion maps are not used.
- Not seen on a real Raspberry Pi: Eco was checked in a desktop browser (no Poly Haven file requested, zero idle frames).
- The HDRI strength bases (0.5 in Studio, 0.25 in Live) were chosen against the painted sky by eye, not measured; the intensity slider is there for taste.
