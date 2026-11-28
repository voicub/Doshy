# Design tools

Three helpers for planning a home: **measure and annotate** the plan, see the **sunlight in a room**, and **trace a floor plan from a picture**. Everything is metric (metres, cm, m²): there is no units setting in the app. All of it is undoable, saved with the plan, and costs nothing in the 3D view while it is not in use.

Plans saved before these tools load unchanged: the two new plan fields (`annotations`, `trace`) are optional and are made valid on every load (`lib/designFields.ts` `withDesign`: bad entries are dropped, numbers are clamped). The database stores the plan JSON whole, so no schema change was needed.

## Measure and annotate (Plan mode)

**Measure** (dock, edit strip, `Measure on the plan` in the palette) has four modes in its bar:

- **Distance**: click two points (a finger places each point when it lifts). Points snap to wall corners and ends, room corners and the 5 cm grid (Shift 25 cm, Alt = no snapping). The length, dx and dy show live. The newest 8 distances stay as dimension lines while the tool is open, each with **Keep in plan** (saves it as a `dimension` annotation) and an x; **Clear all** removes them.
- **Room size**: tap a room to read its area, the way round (perimeter) and its width x depth. A room with extensions (an L shape) is counted together with them.
- **Draw an area**: click the corners of any polygon, close it by clicking the first corner, double-click, Enter or **Done**: area and perimeter show live.
- **Does it fit?**: pick a catalogue piece (search by name) or a **Custom size**, then move over the plan. The piece is a ghost: **green** when it fits, **amber** when a gap is narrower than the walkway you chose (60, 70, 80 or 90 cm; default 80), **red** when it overlaps a wall or other furniture or blocks the swing of a door. The nearest gap is drawn with its length and one plain sentence says what is wrong ("Too tight: 35 cm to the sofa"). Pieces that open their own doors (wardrobes, cabinets, cupboards by default; **Doors open outward** toggles it) also need their swing area clear. A gap under 20 cm counts as a dead slot, not a path, so it is not flagged amber. The ghost pulls flush to a wall within 5 cm; a mouse click holds it still, a finger taps to place it and drags to slide it. Furniture is not drawn in plan mode, so the level's floor furniture shows as faint outlines while this mode is on, named when the ghost is close.

Two toggles next to **Fit** and **Dimensions** (and in the Measure bar), remembered on every plan: **Lengths** (the outer and inner face length of every wall, from the real joints and thickness: a 4 m wall of 12 cm shows 4.12 outside and 3.88 inside) and **Areas** (each room label gains its way round).

**Notes** (dock, edit strip, `Notes on the plan`): pick a note, arrow, dimension line or zone and a colour, then click the plan (a zone is dragged out; arrows and dimensions take two clicks). Zones come with presets such as "Radiator here" and "Pipe in the wall". Click one to edit its words (up to 200 characters, saved on Enter or when you leave the field), colour or pin, drag it to move it, or delete it (button or Delete). **Show as a 3D pin** puts a small marker for a note or zone in the Live, Furniture and Home Assistant views (one instanced mesh, no per-frame work; hover or tap it to read the text). Each level shows its own annotations; at most 400 per plan. They are part of the plan, so they export, import and duplicate with it.

Code: `lib/measure.ts`, `lib/measureWalls.ts`, `lib/measureSnap.ts`, `lib/fit.ts`, `lib/fitGeom.ts`, `lib/fitCatalog.ts`, `lib/annotations.ts`, `lib/annotationTools.ts`; `components/plan/Measure*`, `Annotate*`; `components/scene/AnnotationPins.tsx`. The layers are self-contained SVG components with their own pointer handling, so the existing tools are untouched.

## Sunlight in this room (Live and Plan)

Open **Sunlight** (dock, edit strip, `Sunlight in this room...` in the palette). Pick a room (the selected or focused one first) and a date and time:

- **Where the sun is**: from the plan's Surroundings coordinates, else Home Assistant's `zone.home`, else two lat/lon fields in the panel (default 44.43, 26.1, what the live sky assumes). The plan's orientation is `plan.bearing`. Times use this device's clock time zone, so a home far from the device's zone sees times that do not match its wall clock.
- **Sliders and presets**: a date slider across the year, **Winter solstice / Equinox / Summer solstice** (hemisphere from the latitude), a time slider in 5 minute steps with sunrise and sunset, **Now**, and **Play the day** (about 12 seconds per day, never starts by itself). A small diagram shows the sun's path.
- **The 3D scene follows**: sun direction, shadows, light and god rays use the previewed sun while the panel is open. Closing the panel brings the real sky back at once; the telemetry bar always shows the real sky. Weather stays real.
- **Analysis**: the room's floor is sampled on a grid and tested against walls and their openings (windows let light in over their whole opening; solid doors do not, glazed ones such as sliding glass and French doors do; glass walls and see-through fences let it through), the storey above and the house roof's overhang, and neighbouring buildings from Surroundings when they are loaded. The panel says it in words, for example "Living room gets direct sun 11:30-15:00 in June (peak 62% of the floor at 13:10)" ("only a little" under 10% of the floor, "no direct sun on 21 Dec" when none).
- **On the floor**: **Show sun hours on the floor** paints the room in the 3D scene (one textured quad) and in Plan view (one image) as **Hours of sun today** (legend "Sun hours: 0 to N h", a dark-blue to yellow scale that works for colour-blind people) or **Lit right now** (the patches at the previewed time).

Cost: the grid has at most 24 / 32 / 48 / 64 / 80 cells along the room's long side on Eco / Light / Balanced / Detailed / Ultra (`knobs().sunGrid`), sun positions every 10 minutes. It is computed in short time slices (about 8 ms each) and cancels when anything changes, so the screen never freezes. The result is kept per room, date, place, grid and surroundings until the plan changes; moving the time slider does not recompute. Nothing keeps the frame loop alive beyond the normal sky easing.

Limits (the model is deliberately simple): only direct sun (no weather, clouds or sky light); walls are thin lines (thickness and window reveals ignored); trees, hills, furniture and curtains are ignored; the roof is its overhang at the eave height, not the pitched part; a neighbouring building is a block up to its eaves plus half its roof height on flat ground; city-model buildings (Surroundings > city model) are meshes without footprints, so only OpenStreetMap buildings count.

Code: `lib/daylight.ts` (sun helpers around `sunPosition`), `lib/daylightRay.ts` (the ray test), `lib/daylightRun.ts` (grid, time-sliced runner, summary, colours), `lib/daylightPreview.ts` (the preview sun), `components/ui/DaylightPanel.tsx`, `components/scene/SunHeat.tsx`, `components/plan/DaylightOverlay.tsx`.

## Floor plan from a picture (Plan mode)

Open **Trace image** (dock, edit strip, `Floor plan image to trace over...` in the palette). Choose a PNG, JPG, WebP, GIF or SVG, or drop one on the panel (on a phone the picker offers the camera). **PDF files cannot be opened here** (no dependency-free way to draw one in the browser): export the page as a PNG or JPG from any PDF viewer and choose that.

- The picture is shrunk to at most 2048 px on its long side, stored on the server as an `image` resource named `trace-<24 hex>` (a fingerprint of its content, so the same picture is stored once and a plan copy or file import finds it again), and shown under the plan in Plan mode only: one picture, no 3D cost, and not in plan thumbnails.
- **Strength** (opacity), **Show/Hide**, **Lock it in place**, **Fill the screen**, **Centre it**, **Turn 90 degrees** and, folded, exact numbers (centre, image width in metres, metres per pixel, turn in 0.1 degree steps). Drag the picture to move it, a corner to scale it, the round knob to turn it (Shift: 15 degree steps). **Remove the picture** takes it off the plan; the stored file stays (another plan may use it).
- **Set the scale**: click two ends of something you know the length of, then type the real distance (`4.2`, `4,2`, `4.2 m`, `420 cm`). The first point stays where it is. **Straighten along these two points** turns the picture so the line between them runs level or upright.
- **Trace walls** switches to the Wall tool; wall ends snap to the suggestions below. Lock the picture first so it cannot move while you draw.
- **Look for walls** (Few / Normal / Many lines) suggests straight horizontal and vertical walls from the dark strokes of a light page. They are dashed and labelled "Suggestions: check them"; **Accept all** adds them in the Wall tool's style as ONE undo step, or tap one to add or discard it. Nothing is added without your say. It finds no diagonal or curved walls and nothing on inverted (white on dark) pages; one global threshold means uneven shadows on photos hurt it; a page frame or a long dimension line can be suggested too.
- **Files**: an exported plan file carries the picture (`traceImage`); importing restores it, and if it cannot be restored the plan still opens, without the picture, and says so. **Export everything** already includes it (it is a copy of the whole database).

Code: `lib/trace.ts`, `lib/traceGeom.ts`, `lib/traceDistance.ts`, `lib/traceUpload.ts`, `lib/traceDetect.ts`, `lib/traceSuggest.ts`, `lib/planTraceFile.ts`, `lib/sha256.ts`; `components/plan/Trace*`.
