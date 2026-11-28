# Photo-textured floors

Make a room's floor from a photo of the real floor.

## What you can do

- **Room inspector > Floor photo > "Use a photo of my floor..."** and the **Paint** tool (Floors) open the same three-step dialog: choose or take a photo (`capture` opens the camera on a phone), drag a square over a clean patch of floor (drag, pinch or the Zoom slider; arrow keys and + / - on a keyboard), then say how wide that square is in real life (presets 20 / 40 / 60 cm / 1 m, or type a width from 5 cm to 6 m).
- The dialog shows the patch repeated nine times, with **Even out the lighting** (removes vignette and large light gradients) and **Make it repeat without seams** (on by default).
- **Use this floor** lays it on the room (or loads the Paint brush: then click rooms). **Match the colour only** just paints the photo's average colour as an ordinary floor colour.
- A room wearing a photo shows its width in cm (editable), **Turn a quarter**, and **Remove photo**. Each is one undo step, so Remove photo is undoable. Painting any other floor over the room also takes the photo off.

## How it is stored

- Pure maths: `lib/floorPhoto.ts` (the `room.floorPhoto = { resourceId, scaleM, rotation, avg }` field, validation, scale maths, crop box) and `lib/floorPhotoPixels.ts` (crop, lighting flatten, mirror-blend seamless edges, resize 256/512/1024, average colour, roughness and luma-based normal map). Tests: `lib/floorPhoto.test.ts`, `lib/floorPhotoPixels.test.ts` (tileability on synthetic wood grain and tile patterns), `lib/planFloorPhotoFile.test.ts`, `lib/db/floorPhoto.test.ts`.
- The built texture (PNG or WebP, at most 6 MB, 1024 px at most) is a **resource** of kind `floor-photo`, id `floor-` + the first 24 hex digits of its SHA-256, so the same texture is stored once and shared by rooms and duplicated plans. Only the cropped square is kept, never the original photo. The server validates kind, type and size (`lib/db/resources.ts`).
- `lib/designFields.ts` scrubs `room.floorPhoto` whenever a plan is loaded; an unusable one is dropped.
- **Plan files** (`components/ui/planIO.ts`, `floorPhotoFileIO.ts`, `lib/planFloorPhotoFile.ts`) carry the textures in a `floorPhotos` block next to `traceImage`; importing puts them back on this server (never overwriting) and a plan with an unrecoverable photo loads without it, with a plain note.

## Cost per graphics tier

| tier | floor |
|---|---|
| Eco, Light | the photo's average colour only; the picture is never fetched |
| Balanced | the texture as the floor map, at the tier's texture size |
| Detailed, Ultra | plus a normal map and a roughness estimate |

Textures load lazily, in small time slices, are shared by rooms (`components/scene/floorPhotoTextures.ts`, keyed by resource and tier size) and freed when the last room that uses them goes (`components/scene/useFloorPhoto.ts`). Works in Live, Furniture and Studio (`RoomFloor.tsx`, `StudioFloor.tsx`).
