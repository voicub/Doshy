# Garden lines

The **Garden lines** tool (Plan mode, dock; also the command palette and the "Roads, paths and fences" fold at the top of the Furniture catalog) draws roads, walkways, fences and lamp lines with one gesture: pick a kind, click points on the plan (a finger places a point when it lifts), double-click, Enter, Esc or the edit strip's **Done** finishes. The tool then returns to Select with the new thing selected, and the whole line is one undo step.

What a line becomes depends on its family. Nothing new is stored beyond optional fields, so plans saved earlier load unchanged.

| family | becomes | where it lives |
|---|---|---|
| Roads, Walkways | a ground path (`plan.paths`) with optional road fields | `lib/ground.ts`, `lib/lineGeometry.ts`, `lib/roadGeo.ts`, `components/scene/RoadDetails.tsx` |
| Fences | one garden wall per segment (`plan.walls`, a fence style) | `lib/fences.ts`, `lib/lineDraw.ts`, `components/scene/FenceMesh.tsx` |
| Lights | ordinary catalog lamps spaced evenly along the line (`plan.items`) | `lib/lineLights.ts`, `lib/garden/lights.street.ts` |

The menu of kinds (names, widths, spacing) is `lib/lineKinds.ts`; the tool's remembered choices are `components/plan/linesUi.ts`.

## Roads and walkways

A path gained optional fields (`lib/types.ts` `GroundPath`): `ends` (`round` or `flat`), `smooth` (the points are control points of a centripetal Catmull-Rom curve), `marks` (none, dashed, solid, edges, double yellow), `pavement` (`left`, `right`, `both`, seen walking from the first to the last point) with `pavementWidth`, and `stones` (stepping stones instead of a continuous surface). Widths go up to 12 m. A path without these fields draws exactly as before. The road surface is the usual ground surface (asphalt, gravel, cobble, soil ...), so the existing paint colours and the kerb/edge options apply.

3D cost per road: surface, soft fringe and rim as before, plus at most one merged mesh for markings (vertex colours), one for the pavement top and one for its kerb face; stepping stones are one merged geometry. Eco uses flat colours and no fringe; shadows from the pavements and stones start at Balanced. Nothing runs per frame. Surroundings roads from OpenStreetMap stay lower than drawn roads and are separate.

The inspector of a selected road has the width, markings and pavements first, then the surface, colour and edge, a folded "More options" (ends, smooth curve, stepping stones) and **Reverse direction**, **Add point**, **Duplicate**, **Delete**.

## Fences

Fences are garden walls, so they keep the wall tools: select, move, drag the ends, delete, gates. Fourteen styles (picket, privacy, slat, wire / chain-link, metal bar, wrought iron, glass panel, stone wall, low brick wall, concrete block wall, hedge, post and rail, electric, bamboo) are built from posts and panels with `fenceParts` (evenly spaced, the remainder shared, never a short last gap), merged into at most three instanced draw calls per wall. Eco uses a coarser infill. Select a fence and use **Add a gate** (a garden gate or a driveway gate) in its inspector.

A fence, wall or hedge entirely outside the building on the lowest level of a raised building stands on the ground (`lib/levels.ts` `groundedWall`), like a free-standing item, instead of floating at the raised floor height.

## Lights

A lamp line places catalog lamps: classic street light and modern street pole (new `gd_street_classic`, `gd_street_modern`), bollard, garden path light, solar stake, and festoon strings on posts. Each lamp is an ordinary item, so you link it to a Home Assistant light in HA mode, and it glows in Live through the existing lamp mechanism (the tier's `pointLights` budget applies). Linked street lights are not ranked as ceiling fixtures, so they never take real lights from indoor lamps. At most 200 lamps per line. The plan view marks lamps of a lamp line with small dots (`components/plan/LampMarks.tsx`).

## Not included

Curved fences, one-entity linking of a whole lamp line, kerb-only lines and water channels. A drawn lamp line can be edited only lamp by lamp afterwards.
