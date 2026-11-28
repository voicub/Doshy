# Walk through your home

A first-person view inside your plan, with the live lights, curtains, people and sun. Start it from the **Walk** button in the dock, the walking-person button beside a room in the room list, **Walk here** in a room's inspector, the command palette (`Walk through the home`, `Walk in <room>`), or the **Walk** button on a shared guest link.

The camera flies in from the isometric view (instantly with reduced motion) and flies back out when you leave. Leaving puts back everything the walk changed: the isometric camera, Room mode and its focus, the working floor and the manual cut-away. The automatic cut-away is paused while you walk (every wall stands at full height) and comes back on exit.

## Controls

| | Mouse and keyboard | Touch |
|---|---|---|
| Walk | W A S D or the up and down arrows | the stick at the bottom left |
| Look | just move the mouse over the picture, no click needed; pressing a walking key or clicking also captures the mouse so the cursor never reaches the screen edge (Esc lets go) · left and right arrows turn | drag anywhere on the picture |
| Run | hold Shift | push the stick past its ring |
| Use a device | point and click, or press E | tap it |
| Change floor | walk up a staircase · PageUp and PageDown · the floor buttons | the floor buttons |
| Mini-map | M | the map button |
| Leave | Esc (first Esc releases the mouse) or the Exit button | the Exit button |

"How to walk" shows the first time and from the **?** button. The gear holds **My height** (eyes at 120 to 190 cm, default 160) and the **head bob** (very small; off under reduced motion). These are remembered.

## What stops you

Wall thickness, windows, furniture footprints and holes in the floor stop you; you slide along them. Doors, arches and open passages let you through (a door raised above a step does not). Rugs, mats, things on the wall, things hanging from the ceiling and animals do not block; a tree blocks by its trunk. Pace is 1.4 m/s, double when running. On the ground floor you may walk round the house in the garden, 20 m past the building. An upper floor has floor only inside its rooms.

Stairs are ramps: walk into the foot of a staircase and the floor rises to the next storey (a basement stair goes down); the front steps of a raised house work the same way, and a flat entered from the building's hallway walks out onto its corridor. The floor buttons put you on another floor as near as possible to where you stand.

## Devices

The crosshair names the device it is on (any piece, linked or not). A click or E does what a tap does in the isometric view, through the same store action or card event: a light or switch toggles, a window curtain with a cover opens its curtain card, a camera, a washer, a sensor or anything else linked opens its device card. A guest page shows the name only and cannot write. The walkthrough handles every press itself, checked against the walls first: a device behind a wall cannot be reached, and nothing farther than 3.5 m from the crosshair (9 m for the mouse pointer or a finger).

## Cost per tier

First person always draws on demand (nothing is drawn while nothing moves, apart from what moves by itself: rain, people). Eco draws a little coarser (0.85 pixel ratio) with a shorter far plane (32 m instead of 60), no floating labels and no post stack. Balanced and up keep sun shadows; the depth-of-field blur is switched off in first person. God rays use the library's own perspective camera (`components/scene/godraysPatch.ts` patches only the volume).

## What was checked

In a headless Chromium (software graphics) against a copy of a real one-storey flat in a throwaway database, with every write to Home Assistant intercepted:

- Real key holds (W A S D, arrows) from the Hall: through the Office door and the Bathroom door, along the Hall wall into the Living room (sliding along the wall), stopped by the Office window wall and by the Hall wall. The room name and the map arrow follow.
- E on a light (a ceiling pendant): the toggle request for that one entity was sent and captured, nothing else. E on a sensor opens its device card; Esc closes the card and keeps walking.
- Touch at 800x480 (touch events through the browser's touchscreen, the touch layout forced on because headless Chromium reports a fine pointer): the stick walks through a door, a drag on the right looks around, a tap names a device; the buttons are 44 px; the stick, map and buttons do not overlap.
- A guest link (created in the throwaway database): the Walk button works, E and the drag show the name of a device and nothing else, no request is made to Home Assistant, no card opens.
- Leaving restores the isometric view, the HUD and the Auto cut-away.
- Idle: in rain the scene is never fully idle, in the isometric view or walking (about 6 frames a second at Balanced and Eco). Without weather it should be quiet; that was not measured.

Not checked: stairs between two storeys (only the node tests; no two-storey plan was tried in the browser), Room mode and the working floor being restored by a walk started from them, a walk started from the plan editor, the Detailed tier with god rays inside, a real pointer lock, a real phone, 390x844, a Raspberry Pi.

## Limits (honest list)

- Turning staircases (L, U, winder, spiral) are climbed in a straight line over their footprint, so the eye does not follow the treads exactly.
- Doors do not swing; you pass through. Floating device labels are hidden; there are no device dots.
- A home with no roof (an apartment) gets a flat ceiling slab per indoor room; a home with a roof uses its roof as the ceiling.
- Starting a walk from the plan editor switches to the live view and starts without the flight in (the isometric camera does not exist yet).
- The first fraction of a second of the flight in can draw a dark frame (seen in the headless browser at Balanced; cause not found). On a slow computer the flight is cut short rather than slowed: the walker's clock follows real time.
- Looking with the mouse alone (no click) was exercised in the headless browser only through synthetic moves; real mouse capture (pointer lock) was reviewed by reading only. A key press or click requests the lock; while a card or dialog is open the mouse is left alone (no turning, no capture); after Esc lets go of the mouse only a click captures it again; where the browser refuses the lock, moving the mouse still turns the head, but the cursor can reach the screen edge.
- Not tested on a Raspberry Pi.

Code: `lib/walkCollide.ts` (collision), `lib/walkMove.ts`, `lib/walkMap.ts`, `lib/walkStart.ts`, `lib/walkStore.ts`, `components/scene/walk/`, `components/ui/Walk*`.
