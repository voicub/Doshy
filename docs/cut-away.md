# Cut-away

The **Cut-away** button (top bar, `X`, the command palette and the Live menu on small screens) has two states, shown on the button:

| State | What you see |
|---|---|
| **All** (the old "on") | Every wall, column and riser of the storey being worked on is low (`WALL_CUT_H`, 0.9 m). Unchanged. |
| **Auto** (the old "off") | The walls that face the camera are cut, the walls behind them stand at full height, and pillars follow. Turn the view and the walls animate. |

There is no longer a state with every wall at full height (and so no roof over the Live view on the storey being looked into: see **Roof** below). The setting keeps its name and storage (`cutaway`, a boolean per plan, in the saved plan settings and in the guest reply), so saved plans and the guest page work unchanged.

## The rule (`lib/wallFacing.ts`, pure, tested in `lib/wallFacing.test.ts`)

For a camera at azimuth *a* (degrees round y from +z; the default isometric camera is 45) let *c* be how much of the camera's direction a wall face carries: its unit normal dotted with the horizontal vector toward the camera.

- **Outside wall** (a room on one side, none or open air such as a balcony on the other): cut when its **outward** face looks at the camera (*c* above 0.15). The far walls and walls seen edge-on stand: they are the backdrop.
- **Inside wall** (rooms on both sides): whichever face looks at the camera hides the room behind it, so it is cut when |*c*| is above 0.15. Edge-on inner walls hide nothing and stand, like the far walls of Room mode. From each isometric corner this cuts every inner wall and the two outer walls toward the camera, so the whole plan can be seen into over the two tall walls at the back.
- **Free-standing wall** (no room either side): treated like an inner wall. **Fences, hedges and garden walls** are not building walls and keep their own height.
- A wall that is partly outside and partly inside follows what most of its length asks for; a tie cuts.
- **Pillars** (`Def.pillar`: the square and round columns and the plumbing riser) behave like an outside wall at the place where they stand: *c* is their offset from the building's centre (as a share of the building's half diagonal) dotted with the camera vector. Pillars on the camera's side are cut, pillars in the back half stand, one at the very centre stands.
- **Hysteresis:** a cut wall (or pillar) stays cut until *c* falls below 0.10, and a standing one stays up until *c* passes 0.20, so one on the threshold does not flicker while the camera hovers.
- **Storeys:** only the storey being worked on is answered for; the other storeys stand at full height as with Cut-away on.
- **Wall pieces:** a piece hung on a wall (TV, picture, switch; `Def.wall`) goes while its wall is cut, as with Cut-away on (a sensor keeps its badge). The wall is the nearest building wall the piece touches (`wallOfItem`).

What lies along each wall (inside, outside, free) does not depend on the camera, so it is worked out once per plan and storey; per camera angle only dot products are left.

## Live behaviour (`components/scene/facingState.ts`)

- `FacingDriver` (mounted beside the Rig) reads the camera's horizontal direction every frame, whoever moves it (mouse, touch, keys, presets, Room mode's animated goals), and publishes it in steps of 2 degrees. The answers are memoised by plan, storey and azimuth, and the very same Map comes back while nothing changes.
- Each wall (`WallMesh`), pillar (`ItemMesh`) and wall piece subscribes to **its own** answer, so turning the camera re-renders only the walls that flip, not all of them. The label layer (`DeclutterLayer`) reads the whole Map, so a label is hidden behind a wall only while that wall stands.
- A wall that flips grows or shrinks from where it stood: the geometry is rebuilt once at the new height and its group is scaled from the old height back to 1 with the same damped tween Room mode uses (`useIsoSink`, about half a second). Openings, frames and the cap are children of that group, so they move with the wall. A pillar is the same mesh scaled from the floor (`useSquash`), with the dark cap at the cut height once it is low. Nothing is rebuilt per frame, no extra draw calls, and the frame pacer is kept alive only while something is still moving (a still scene idles).
- **Reduced motion:** the change is instant. **Eco** animates at its ambient frame rate, like Room mode.
- **Room mode** keeps its own roles (it overrides Cut-away per wall); **editing views** force Cut-away to All (`useForceCutaway`); the building corridor keeps following the switch only (low with All, full height with Auto).

## Neighbours (Surroundings)

With Auto only the neighbouring buildings and trees that stand between the camera and the plan are lowered; those behind or beside it keep their real height. Each building vertex carries its bearing from the plan's centre (`CUT_STRIDE` is 4 now), the shader compares it with the camera azimuth (`uAz`) through the same smoothstep as `facingShare` in `lib/siteMeshCut.ts`, and `uAuto` eases between All and Auto. Trees are static instances: they are re-placed once per 10 degrees of turn. See `docs/site.md`.

## Roof

A house's roof is lifted off whenever its storey is the active one (in either state): Cut-away exists to see into the rooms and a roof over them would hide that. It still sits on the building when another storey is the active one and the levels view shows the upper storeys. Apartments have no roof.

## Verifying

`window.__scene` (dev builds) exposes the scene; every wall group is named `wall:<id>`, so its `scale.y` (the animation) and its meshes' heights can be sampled while rotating.
