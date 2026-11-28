# People in the home

Every person Home Assistant knows (`person.*`) who is **home** shows up in the Live view as a small figure standing in the room they are in. When they move to another room they walk there through the doors. People who are **away** are not drawn, and the House now bar marks them `away`.

## Quick start

Nothing to set up: everybody is on, with a colour and a letter chosen for you. They appear in the room named by a room sensor if you have one (see below). Without one, a person who is home waits in the living room (else the first indoor room of the lowest floor).

To change it: **Menu > Settings > Display > People in the home > Choose who shows up**, the pencil next to **People** in the House now bar, or the command palette (**People: choose who shows up in the home**).

## The People sheet

For each person:

| Setting | What it does |
| --- | --- |
| **Show in the home** | On or off for this person. |
| **Colour** | One of eight. The default is picked from the person's id and stays the same. The chip in the House now bar takes the same colour. |
| **Letter** | One or two characters on the figure (default: the initials). |
| **Where are they?** | **Auto** follows a room sensor. **Fixed room** always shows them in the room you pick (saved by the room's *name*, so it survives a different plan). **Hidden** never draws them. |
| **Advanced: use a specific sensor** (Auto) | Pick the sensor yourself instead of letting Doshy look for one. |

The sheet says in plain words what Doshy sees right now, for example *"Anna is in Kitchen (from sensor.anna_room)."* **Back to defaults** resets everything and can be undone. **Add a tracker** lists `device_tracker.*` entities (a phone, say) that are not part of a person. The **People in the home** switch (Display, or the top of the sheet) turns the whole feature off; nothing runs while it is off.

## How Doshy finds the room

1. **Home or away.** The person (or tracker) must be `home`. Any other zone, `not_home`, `unknown` or `unavailable` counts as away.
2. **Fixed room**, if you chose one.
3. **Auto**, in this order:
   1. The sensor you picked in Advanced, else the first `sensor.<name>_room`, `_area`, `..._room`, `..._area` or `_location` of that person that names one of your rooms. `<name>` is the person's id (`person.anna_popescu` looks at `sensor.anna_popescu_...`), their friendly name, or the first word when no one else shares it. This fits room-presence sensors such as Bermuda, ESPresense or `mqtt_room`.
   2. A sensor's text is matched to a plan room ignoring case, accents and punctuation: `living_room`, `Living Room` and `Living` all find *Living Room*; a Home Assistant area (by id or name) finds the room that owns it. An exact name wins over an area, an area over a partial name.
   3. A motion or occupancy sensor (`binary_sensor`, state `on`) puts the person in the room that lists it under its presence sensors, or in the room of its Home Assistant area. Off says nothing.
4. **No usable reading** (the sensor is `unknown`, `unavailable`, empty, or names no room): the person stays in the last room they were seen in for sure. After a page reload that memory is gone, and they wait in the default room.

## What it costs, by graphics tier

| Tier | Look | Cost |
| --- | --- | --- |
| **Balanced, Detailed, Ultra** | A ~1.1 m figure (capsule and head, one draw call each) with a soft spot under it and the letter above. They walk between rooms at about 1.1 m/s (faster over long distances, a trip never takes more than 6 s), grow in when they appear in a room without a way through, and bob and sway a little. | The scene draws continuously **only while somebody walks** (a second or two). A still house costs nothing extra. No shadow pass is needed. |
| **Light, Eco** | A flat disc in their colour with the letter above, standing still. They simply appear in the new room. | No animation, no extra drawing: a still scene stays idle. |

With **reduced motion** on, nobody walks, grows in, bobs or sways at any tier. Somebody on another floor simply appears. Walking and the floor grid use the same floor map as the robot vacuum: nobody stands in furniture or a wall, and a path only crosses a wall through a door.

## Limits

- People are drawn in the Live view only. In Room mode only the people inside the room are shown.
- The room comes from sensors Home Assistant provides; Doshy does not guess from the phone's GPS. Without a room sensor everybody who is home waits in one room.
- Two people in one room stand apart on separate spots. A very crowded room can leave a few close together.
- Settings are saved on this device with the other display settings (`housey-presence`).
- Not yet seen on a real Raspberry Pi; the walk and grow-in were reasoned through, not timed.

## For developers

- Pure logic with tests: `lib/presence.ts` (settings validation, name and area matching, sensor discovery, the home/away and room answer, last known room), `lib/presenceWalk.ts` (standing spots and walks on the vacuum floor grid, `lib/vacuumPath.ts`). Tests: `lib/presence.test.ts`, `lib/presenceWalk.test.ts`.
- `lib/presenceStore.ts` (persisted zustand store), `lib/presenceHooks.ts` (`usePresenceView`: the answer for everybody, a new array only when something changed).
- 3D: `components/scene/PresenceAvatars.tsx` (placement, one floor grid per storey), `PresenceAvatar.tsx` (one person; moves its group from `useFrame` and calls `keepAlive` only during a walk or grow-in), `presenceFigure.ts` (shared geometry). The letter is a declutter marker (`kind="badge"`).
- UI: `components/ui/PeopleSheet.tsx` (lazy, opened through `peopleUi.ts`), `PeopleSwitch.tsx` (the Display row), the chips in `LiveBarParts.tsx`; styles in `people.css` and `components/scene/presence.css`.
