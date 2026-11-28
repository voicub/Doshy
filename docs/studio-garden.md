# Studio floor and garden ground

How the Studio environment and the garden's ground are drawn, per Graphics tier (`lib/quality.ts`).

## Studio

- `components/scene/StudioFloor.tsx`: one shader plane, no canvas. A satin graphite floor with a pool of light under the building, a faint 1 m / 5 m grid (analytic, one pixel sharp at every zoom, fades out where lines would shimmer) and an edge that melts into the backdrop colour. Numbers in `lib/studioLook.ts` (`STUDIO_FLOOR`, `STUDIO_BACKDROP`). The old 2600 px canvas plate (27 MB of video memory) is gone; the only texture is a 128 px noise tile (64 KB). Eco: same floor without the satin grain.
- `components/scene/FootprintHalo.tsx`: a soft dark halo on the ground around the building (one instanced draw call, shader shared with the per-item contact shadows through `haloMaterial` in `ContactShadows.tsx`). Both environments, every tier (`contactShadows` knob).

## Garden ground

- Balanced and up draw procedural PBR surfaces (`lib/pbrTiles.ts`, `lib/pbrGround.ts`, noise in `lib/pbrNoise.ts`) for the lawn, soil, gravel, sand, bark mulch, asphalt, water, coursed stone slabs, paving, cobble, flagstone and weathered deck boards. Which kind gets which surface and how big a tile is: `FLOOR_SURFACE` in `lib/shellLook.ts`. Tiles are in metres, so a slab or a pebble keeps its real size on any area. Eco and Light keep the flat voxel textures (`lib/textures.ts`).
- Recipes may emit a warm/cool hue shift (`out[3]`, `HUE_GAIN`), so slabs, pebbles and lawn patches differ in colour as well as tone while the tint stays the albedo. Detailed and up add normal maps. Lawn, gravel, mulch and slabs stop at 512 px (`NOISE_ONLY`): 4.7 mm a pixel is finer than the screen resolves.
- Anti-tiling (`components/scene/groundMacro.ts`): light/dark and warm/cool patches from the world position at three scales that are not multiples of any tile (`MACRO_SCALES_M`, tested in `lib/groundLook.test.ts`). Strength per kind in `lib/groundLook.ts`. Two texture reads per pixel, one shared 64 KB noise texture. The surroundings' terrain shader (`site/siteShader.ts`) uses the same function near the plan.
- Brightness: the procedural map averages 0.93, the old voxel textures 0.3 to 0.8 in linear light. `groundGain`/`scaleColor` scale the tint so a chosen colour and the season palette keep the brightness they had; only the detail is new.
- Edges: a soft shade ring around patios and paths (`fringeTris` in `lib/groundGeo.ts`, Balanced and up; ponds keep a crisp bank).
- Seasons and weather act on the tint (`useWetSurface`), so autumn and winter palettes, rain darkening and snow work on the new materials unchanged. Ponds drift their water textures (shared per kind).

## Cost

Textures are generated in 6 ms time slices (`components/scene/pbr.ts`), so no frame waits; a surface shows its flat tint until its tile is ready. Measured on a laptop, per tile with normal map at 256 / 512 px: lawn 77 / 208 ms, gravel 54 / 178, soil 36 / 139, sand 18 / 65, mulch 37 / 143, asphalt 52 / 222, water 40 / 165, slabs 47 / 162.
