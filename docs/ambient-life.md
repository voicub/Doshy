# Ambient life: vacuum rooms, pets, smoke

Three small things that make the live view feel lived in. All of them are quiet: when nothing is happening they cost nothing, and on a small wall display (Eco) the moving parts are off.

## The robot vacuum knows its room

The robot in the 3D view already follows the position the vacuum reports (`x`/`y` or `position`), or drives a made-up lap. Now it also uses the **room** the vacuum reports.

**What you see while it cleans:** the room it is in gets a soft cyan tint on the floor and a small label, for example *Cleaning Kitchen · 23 m²*. The tint breathes gently on Balanced and above, and is still on Eco and with reduced motion. In Room mode only the room you entered shows it.

**What the made-up lap does:** when the vacuum says which room it is in but not where, the robot drives only the lanes inside that room instead of the whole flat. When the room changes, it carries on from where it stands. If the lap hardly touches that room, the whole lap is kept.

**What it reads.** Only what is really in the vacuum's attributes (nothing is guessed). Several spellings work:

| Meaning | Attribute names tried (first one that makes sense wins) |
| --- | --- |
| Room | `current_room`, `current_room_name`, `room_name`, `room`, `current_segment`, `current_segment_name`, `segment`, `segment_name` |
| Room list (to turn an id into a name) | `rooms` or `segments`: `{id: name}`, `{id: {name}}`, a list of `{id, name}`, or a map name with such a list (Dreame) |
| Cleaned area | `cleaned_area`, `cleaning_area`, `clean_area`, `area` |
| Progress | `cleaning_progress`, `progress` (0 to 100) |
| Time | `cleaning_time` (minutes) |

- A room **id** (a number such as `current_segment: 3`) is only used when the room list says what id 3 is. A room **name** is used as it is.
- Areas are square metres: a number, or text that is only a number optionally followed by `m2`, `m²` or `sqm`. Other units (`cm²`, `ft²`) are ignored, not converted. Time is minutes (a number, or text ending in `min`); a number above 24 hours is ignored because it is probably seconds.
- The reported name is matched to a room of your plan ignoring capitals, accents and punctuation (`Küche` matches `Kuche`, `living-room` matches `Living room`) and by whole words (`Living` matches `Living room`). If two rooms fit equally well (`Bedroom` with a `Master bedroom` and a `Kids bedroom`) nothing is highlighted. Name your rooms like the vacuum does to fix that.
- No usable room in the attributes: exactly the behaviour you had before.

The vacuum's card in the device list says which way it works: *Live position* or *Simulated path*, and *Knows its room* when it reports one (with the area and time cleaned so far).

**Limits.** The tint is a flat rectangle over the room, so a stairwell hole in that room is covered by it. The room lap follows the same lanes as the whole lap, cut at the room's edges; lanes that cross open-plan rooms are cut where they cross.

## Pets

Nothing new to set up: this already works and was checked end to end.

- Link a dog or cat to a `device_tracker.*` or `person.*` entity in the inspector (the picker offers them for animals).
- **Home:** the pet is in the scene and wanders, sits or sleeps as usual.
- **Away (`not_home`):** it becomes a ghost silhouette with a small *away* label, exactly like a car. It stays still (no breathing, no wandering), so it keeps the view asleep.
- **Back home:** it appears at its spot and walks off. It does not jump.
- **In a named zone** such as `Garden` (not `home`, not `not_home`): shown as normal.

## Smoke and flames from stoves and chimneys

A stove, fireplace or fire pit that is linked to an entity and is burning shows a thin plume of smoke and a flickering warm glow.

**Pieces that do it:** *Wood burner stove*, *Wood-burning stove*, *Fireplace with stone chimney breast* (smoke and glow), *Fireplace with mantel* (glow only: no chimney to smoke from), *Round fire pit* (smoke and glow), *Wall gas boiler* (a thin white vapour from its flue, no flame). Electric fireplaces do nothing.

**How to set it up:** place the piece, select it, and link it to a switch (or light, fan, input boolean, binary sensor, thermostat or water heater) in the inspector.

**What counts as burning:**

| Linked entity | Burning when |
| --- | --- |
| switch, light, fan, input_boolean, binary_sensor | it is `on` |
| climate (thermostat) | it reports `hvac_action: heating`; with no report, its state is `heat` |
| water_heater | any mode except `off` |
| anything else | never |

**The smoke:** soft grey puffs rise about 2.7 m from the top of the flue (the top of the piece), grow, thin out with height and lean downwind when the live sky has wind. They are grey by day and darker at night. A boiler's vapour is lighter, sparser (3 puffs) and only rises about 1 m. At most four burning pieces are drawn.

**Where it shows:** the live view only (not while editing), on storeys that are shown, and in Room mode only for the room you entered.

**What it costs:**

| Tier | Smoke and flames |
| --- | --- |
| Eco, Light | Off. Nothing is drawn, the view stays asleep |
| Balanced, Detailed, Ultra | On. About two draw calls in total, 24 puffs at most; the view only redraws while a burning piece is on screen |
| Reduced motion (system setting) | Off |

**Switch:** *Graphics, Smoke and flames from stoves and chimneys*: On or Off, saved on this device (default On; greyed out on Eco and Light).

**Limits.** The smoke leaves from the top of the piece, not through a roof. Wind comes from the sky settings (live weather or your manual choice).
