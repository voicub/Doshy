# Insights: energy flow, heat map and history replay

Three Live-view features that turn the sensors already linked in your plan into pictures. They are read-only: nothing here changes a device in Home Assistant.

## Energy flow

Shows where your home's power comes from and where it goes: the sun, the grid, a home battery and the car charger around the building, a hub in the middle, and a line to every room that has a power sensor. Dots run along the lines, faster the more watts. It also gives the Energy panel a live card (what the house uses, what it costs now, today's totals) and puts a battery ring on your car.

### How to use it

1. Press **N** (or the Energy button in the dock, or "Energy: open" in the command palette) and open **Set up energy sources**. It is unfolded the first time. "Energy sources..." in the palette opens it directly.
2. Tap **Find them for me**. Doshy reads the Energy dashboard setup of Home Assistant (if you made one) and looks at sensor names for the rest. It only fills empty rows: it never replaces a sensor you chose. Check what it found; use the sensor's remove button to clear a row, or **Clear all sources**.
3. Or pick the sensors yourself, all optional: **Solar power**, **Grid power**, **Battery power** and **Battery charge**, **Car charger power**, **Car battery**, **Price per kWh** (a price sensor, or type a fixed price and the currency). Tick **My sensor counts the other way** when a sensor says the opposite of the usual: grid positive = buying from the grid, negative = selling; battery positive = powering the house, negative = charging. Folded **Daily totals** takes three kWh counters (solar made, bought from the grid, sold to the grid) for the "today" figures.
4. In **Live**, choose the **Power** layer (bottom centre). The energy flow appears when at least one of solar, grid, battery or car charger is picked. Not in cinema mode.
5. In the panel: **Right now** (solar, house, grid buying or selling, battery with its charge, car charger, cost now, how much of the solar power you used yourself) and **Today** (from the counters; the cost uses your fixed price) and **Where it goes** (the rooms that use the most). The lines you connected in the plan (Connect energy) still show below, unchanged.
6. A car linked to a device tracker gets a small ring with its battery percent whenever the Power layer is on, and also while the charger works ("charging 7.4 kW"). The percent comes from **Car battery** if picked, else the tracker's `battery_level`, else a battery sensor with the same name as the tracker.

### What it reads

Only the sensors you pick, through the app's normal states (so the History replay shows the energy of the past too), and the live room figures of the rooms' power sensors. From Home Assistant it also asks, only when you tap **Find them for me**, for the Energy dashboard setup (`/api/ha/energy-prefs`, read-only, kept for a minute) and, only while the Energy panel is open, for today's history of the three kWh counters (every 5 minutes). Power in W, kW or MW all work. The house figure is what the panels, the grid and the battery add up to minus what leaves, **without the car**; it is left out if one of the picked sensors cannot be read, so it is never a wrong number.

### Per quality tier

| Tier | What is drawn |
| --- | --- |
| Eco and Light | Still, thicker lines with a watt label on each, and a word on every source tag (importing, exporting, charging, discharging) so the direction reads without motion. No frame callback, nothing keeps the 3D loop awake. |
| Balanced and up | The same plus dots (one shared mesh, at most 400) running along the lines. The loop is awake only while a dot moves or a reading is still easing in; idle lines (under 15 W) are dim and still. |
| Reduced motion (any tier) | Behaves like Eco. |

Lines are rebuilt only when the plan or a picked sensor changes, not on every reading.

### Limits

- Where things sit is fixed: solar on the north side of the building, grid south, battery east, car charger west (or at the linked car); the hub is in the middle of the building. It is a diagram, not the real wiring, and room lines show each room's own power sensors, not a measured path.
- At most 24 rooms get a line (the biggest users). Rooms without a power sensor get none; the hub tag shows what the whole house uses.
- The house figure and the cost depend on the grid sensor (or solar and battery together). With only a solar sensor you see solar and nothing else.
- Cost now is for buying only; selling is not credited. Cost today needs a fixed price (a price sensor changes during the day, so it is not multiplied by the day's total).
- One home battery, one car charger and one grid meter. The sign of a sensor that counts the other way has to be fixed with its checkbox; Doshy does not guess it.

## Heat map

A colour picture on the floor of every room that shows how warm, humid, stuffy, bright or loud it is, worked out from the sensors you have placed in the plan. Rooms you have not measured are striped, so you can tell a measurement from a guess.

### How to use it

1. In **Home Assistant mode**, link sensors to your furniture or lights (any piece with an entity field) and, optionally, set a room's own temperature / humidity sensor. Put the piece where the sensor really is: the colour is drawn around that spot.
2. Switch to **Live** and look at the bottom-centre control. Under **Layer** there is a second row, **Show**: Off, Temp, Humidity, CO2, Light (and Noise, only when the plan has a sound-level sensor). Or open the command palette and type "Heat map".
3. A map with no sensor in the plan stays in the row but greyed out. Pressing it tells you why. On a phone or the small kiosk screen the same row sits in the menu.
4. Above the buttons a small card shows the colour bar with the lowest and highest value, and **Where is it cold?** (the two coldest and the two hottest rooms; for the other maps "lowest" and "highest"). **Colours** (folded) switches between Colour-blind safe (the default), Rainbow and, for temperature only, Blue to red.
5. Choosing a map turns the older Layer tint "heat" / "humidity" off, and the other way round: only one of them paints the floors at a time. The map only shows in Live (not in cinema mode). Your choice (map and colours) is remembered in the global setting `housey-heatmap`; **Off** clears it.

### What it reads

Only sensors that are placed on a piece of furniture on that level (or set on a room): temperature (`device_class: temperature`, °C or °F, a thermostat's current temperature too), humidity (`humidity`, %, a thermostat's current humidity too), CO2 (`carbon_dioxide`, ppm), light (`illuminance`, lx) and noise (`sound_pressure`, dB). Unavailable, unknown and absurd readings, a device's own chip or CPU temperature, and sensors outside every indoor room (a garden sensor, a garden room) are ignored. Rooms with no placed sensor use their room sensor field, else the live room figure (which also finds sensors through Home Assistant areas), drawn at the room centre. During a history replay the map follows the replayed values.

### How the picture is made

Each reading spreads over its level with an inverse-distance blend (a value counts for more the closer you are), where every wall between a spot and a sensor counts as 3 m extra. Warmth therefore stays mostly in its own room, while an open-plan area blends smoothly. Doors and windows do not let warmth through in this model, and fences and hedges do not block it. Light is blended on a log scale because it spans decades. Colours are normalised over one shared range for the whole house: temperature follows the readings in whole degrees but never less than 4 degrees wide, humidity 20 to 80 %, CO2 400 to 1500 ppm, light 0 to 1000 lx, noise 30 to 80 dB (all widen when readings fall outside). A change smaller than 0.1 degrees, 1 %, 10 ppm, 1 dB or 5 % of light does not redraw anything.

### Per quality tier

| Tier | What is drawn |
| --- | --- |
| Eco | One flat colour per room (the mean of its sensors; a room without one copies the nearest measured room). No gradient. |
| Light and up | The smooth gradient across the rooms. |

Every level costs one draw call (one quad with a small 128-cell texture). The picture is recomputed only when a reading, a room or a wall changes, and it never moves: there is no per-frame work and nothing keeps the render loop awake, on any tier.

### Limits

- The optional translucent 3D volume (a heat cloud through the room's height) is not built: the map is a flat picture on the floor.
- It is an estimate between sensors, not a measurement: a room without a sensor is a guess from its neighbours (striped).
- Temperature is shown in Celsius unless every sensor reports Fahrenheit.
- Walls count wherever they are drawn, even where a door is: warmth passing through an open door is not modelled.
- A level with no sensor on it draws nothing.

## History replay

Drag a time bar back through the last 24 hours (or 7 days) and the whole house shows how it was: lights on or off, blinds up or down, doors and windows open, who was moving about, the temperature, the power. Nothing changes in Home Assistant: while you look at the past, every control is switched off.

### How to use it

1. In **Live**, press the **History** button in the dock (clock icon), press **Y**, or type "History replay" in the command palette. On a phone or the small kiosk screen it is in the menu (**More**), under **Scene**.
2. A bar opens above the dock. It says "Loading the last 24 hours..." for a moment (one request, kept for about two minutes). **7 days** loads only when you ask for it; if Home Assistant keeps no history that far back the bar says so.
3. Drag the scrubber to any moment. The far right end is **now**. Keys: arrow keys move one minute, **Shift + arrow** or **Page Up / Page Down** ten minutes, **Home** the start, **End** back to now, **Space** plays or pauses.
4. **Play** runs the past forward. **1x** is real time, **10x**, **60x** is an hour a minute (the start speed). It stops by itself when it reaches now. Nothing plays until you press Play.
5. Marks above the scrubber: a line where each day starts, orange ticks where a door or window of the plan opened, and a sun mark at sunrise and sunset.
6. While you look at the past a strip at the top says "Replay mode: controls are off. Showing Tue 14:32" with a **Live** button. **Live** (in the strip or in the bar), the end of the scrubber, **Esc** or the X all bring the present back. Leaving Live, starting cinema mode or switching plan ends the replay too.

### What it reads

The entities your plan links: furniture, doors and windows, room sensors (temperature, humidity, presence, power), energy flows, plus the sun. The ones Home Assistant knows now, lights first, then blinds, doors and other binary sensors, thermostats, other devices, then sensors; up to 120. From Home Assistant's own history (`/api/ha/history/replay`, read-only): lights keep brightness and colour, blinds their position, thermostats their temperature and mode, fans their speed; everything else is on / off or a reading. Numbers are thinned to one reading a minute (five minutes for 7 days); at most 1,500 changes per entity and 40,000 in all, the oldest dropped first.

### What it does to the app

While a past moment is shown the dashboard's states are the replayed ones, so lights, blinds, doors, motion, climate, power and the room figures come out of the normal scene code. The live states wait aside and come back (with whatever the polling brought meanwhile) the moment you go Live. During the replay: the states poll does not touch the screen or the 5-minute live charts; the switches in the room list, on furniture and in the palette do nothing; any call to Home Assistant is refused with "Replay mode: controls are off". Nothing is saved.

### Per quality tier

The same on every tier. Nothing here draws every frame and nothing keeps the 3D loop awake: while paused or live there is no timer at all, and while playing one 4-times-a-second timer moves the cursor, changing the states only when some entity actually changed (an unchanged entity keeps its object, so only what moved is redrawn; the frame pacer then settles by itself). The bar is loaded only when opened.

### Limits

- A device with no recorded change in the window shows as unknown until its first change; devices nothing links in the plan, the weather, people and the sun's position keep showing now: the sky and the lighting follow the real sun and weather, not the replayed time.
- Not covered by the "controls off" refusal: actions that do not go through the dashboard's toggle and service calls (running a scene, deleting a calendar event, the automation helpers). They stay reachable in the panels, so do not use them while replaying.
- Readings between samples are the last known value (a steady step, not a curve). Thinning to one reading a minute can hide a spike shorter than that.
- 7 days of 120 entities can be slow on a small server: the request has 30 seconds.
