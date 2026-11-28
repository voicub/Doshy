# Live life: people, alarms, real sky and a home that moves

Four features make the 3D home react to what is really happening. All read Home Assistant states that the dashboard already polls (no new server routes, no Home Assistant writes), keep their settings in the browser/server settings store (no plan fields, no database change) and follow the graphics quality tier: a Raspberry Pi on Eco stays still and cheap.

| feature | what you see | setup | guide |
|---|---|---|---|
| People in the home | A small figure with the person's letter in the room they are in; it walks to the next room along the doors. Away people are not drawn (the People chip says "away"). | Nothing for `person.*`. Optional: **People** sheet (pencil on the People chip, Display > People, or the command palette) to pick colour, letter and where they are (room sensor, fixed room, hidden). | [presence.md](presence.md) |
| Alarm focus | A red banner (Acknowledge, Snooze 10 min, Details), the camera flies into the room, the room and the device pulse until acknowledged. For water leaks, smoke, gas, CO, doors and windows left open, motion while the alarm is armed away, and any "problem" sensor linked in the plan. | Display > **Alerts**: Focus the camera (default), Banner only, Off; optional beep. | [alerts.md](alerts.md) |
| Real sky and weather | Sun, moon phase, clouds, rain, snow, fog, wind and lightning follow `sun.sun`, `sensor.moon_phase` and your `weather.*` entity. | **Real sky** switch in the top bar (the AUTO chips mean real); pick the weather entity from the weather menu when you have several. | [live-sky.md](live-sky.md) |
| Ambient life | The vacuum shows the room it is cleaning and the area; pets show at home or ghosted "away"; stoves, wood burners, fireplaces and boilers send up smoke or a flame glow. | Link the device to its Home Assistant entity as usual. Graphics > smoke and flames switch. | [ambient-life.md](ambient-life.md) |

## What each tier does

| | Eco / Light | Balanced, Detailed, Ultra |
|---|---|---|
| People | A flat disc with the letter, static | 3D figure, walks between rooms, grows in; reduced motion = appears at once |
| Alerts | Banner and camera flight as usual; the room and device get a static red outline (no animation) | Red emissive pulse until acknowledged |
| Sky | Follows the real sun and weather; no lightning flashes | Rare, subtle lightning for storms |
| Ambient | Room tint on the cleaning vacuum without pulse; no smoke or flames | Smoke plumes and flame glow, thin and cheap (instanced) |

## Frame budget

Nothing here keeps the scene awake while it is still: a person standing in a room, an acknowledged alert, a calm sky and a docked vacuum cost no frames. `keepAlive()` is called only while a person is walking, an unacknowledged alert pulses, lightning flickers, smoke is visible on a tier that animates, or the cleaning vacuum moves.

## What is not covered

Presence cannot tell which room a person is in without a room sensor (Bermuda, ESPresense, a presence sensor linked to a room); it then keeps the last known room, or the living room. Alerts only cover sensors that are linked to a device or door/window in the active plan (a triggered alarm panel always alerts). The vacuum's room comes only from attributes the integration really exposes (`current_room`, `current_segment` with `rooms`, `cleaned_area` ...); without them the simulated lap stays.
