# Documentation index

| doc | what it covers |
|---|---|
| [database.md](database.md) | The SQLite database: connection, forward-only migrations, tables, `/api/db/*` routes, sync and backup rules. |
| [plans.md](plans.md) | Using several plans: create, switch, default plan, delete and undo, export and import, pinning a wall display with `?plan=`, what is global and what belongs to a plan. Design: [multi-plan-design.md](multi-plan-design.md). |
| [server.md](server.md) | How the server talks to Home Assistant: routes, caches, timeouts, background work, deployment notes; how the page stays responsive (deadlines, crash recovery). |
| [home-assistant.md](home-assistant.md) | Installing Doshy from Home Assistant: the add-on, the HACS sidebar panel, Docker/Portainer, mixed content, what is verified. |
| [lovelace-card.md](lovelace-card.md) | The `doshy-card` Lovelace card and the `?embed=1` mode: options, YAML, embed parameters, https limit, what is verified. |
| [site.md](site.md) | Surroundings: real buildings, trees, roads, ground height and satellite photo around the home; data sources and alignment. |
| [site-data.md](site-data.md) | Surroundings data sources: detailed ground from AWS Terrain Tiles (zoom, tier budgets, resampling, continuity at the home) and Overture Maps buildings (PMTiles reader, mapping, merge with OpenStreetMap); what is sent where, caches, limits. |
| [small-screens.md](small-screens.md) | Compact layout and running a Raspberry Pi 7 inch wall display or a phone. |
| [wall-display.md](wall-display.md) | The wall display slideshow: slides, alerts pre-empting, touch to leave, night dimming, burn-in shift, Eco cost, switching the screen off on a Pi. |
| [offline.md](offline.md) | The offline shell (service worker): what is cached and never cached, the offline chip, update toast, clearing the cache, https requirement, and how to verify it on a production build. |
| [curtains.md](curtains.md) | Two-layer window curtains, linking them to covers, and the automatic sun-blocking behaviour (`HOUSEY_AUTOMATION`). |
| [washdata.md](washdata.md) | Washers, dryers and dishwashers through the WashData integration. |
| [studio-garden.md](studio-garden.md) | The Studio floor, footprint shadow and the garden's procedural ground (lawn, paving, gravel, water ...) per quality tier. |
| [garden-lines.md](garden-lines.md) | The Garden lines tool: roads, walkways, fences and lamp lines, their plan fields, 3D cost and gates. |
| [design-tools.md](design-tools.md) | Measure and annotate the plan (ruler, wall lengths, room areas, notes, 3D pins, 'Does it fit here?'), the Sunlight in this room preview, and tracing a floor plan from a picture. |
| [seasons.md](seasons.md) | The garden through the year: real-date season and growth (canopy, blossom, leaf drop, lawn), the "Preview a date" slider, hemisphere, and the cost per tier. |
| [floor-photo.md](floor-photo.md) | Making a room floor from a photo of the real floor: crop, seamless tile, real-world scale, and how it is stored and exported. |
| [polyhaven.md](polyhaven.md) | Poly Haven integration: real-sky HDRI lighting, PBR materials for floors, walls and ground, 3D models; what is sent where, the disk cache, offline behaviour, limits and the `DOSHY_EXTERNAL_DATA` opt-out. |
| [cars-design.md](cars-design.md) | The per-model car design data in `lib/cars.design*.ts` and how to add a car. |
| [scenes.md](scenes.md) | Scenes on the model, automations created from a device (needs an admin token), the typed command box, the `/api/ha/scene` and `/api/ha/automation` routes. |
| [routines.md](routines.md) | The routine finder: habits found in the last weeks of history (same time every night, weekdays, sun-relative, a light left on), how they are detected, the read-only `/api/ha/routines` route, the stored choices and the two automation recipes they create. |
| [live-life.md](live-life.md) | Overview of the "live life" features and their costs per graphics tier: [presence.md](presence.md) (people as avatars), [alerts.md](alerts.md) (alarm focus), [live-sky.md](live-sky.md) (real sky and weather), [ambient-life.md](ambient-life.md) (vacuum map, pets, smoke). |
| [insights.md](insights.md) | Energy flow (sun, grid, battery and car charger drawn as moving lines to the rooms, cost now, daily totals), heat map layers (temperature, humidity, CO2, light, noise on the floors) and the history time scrubber (replay the last 24 hours or 7 days on the model, controls off). |
| [multi-home.md](multi-home.md) | Several Home Assistants, one per plan: the Homes manager, `X-Doshy-Home`, per-home caches, token encryption (`doshy.key`), SSRF rules, `DOSHY_ALLOW_CUSTOM_HA`, and what a plan file carries. |
| [sharing.md](sharing.md) | Share dialog: furniture packs (`.doshypack`), high-resolution pictures and turntable video, read-only guest links with a PIN, `DOSHY_GUEST_ONLY=1`, the proxy allow-list (Nginx, Caddy, Cloudflare Tunnel) and the threat model. |
| [themes.md](themes.md) | HUD themes: the six themes, Auto, status palettes for colour blindness, the accent picker, the token table, how to add a theme, what stays physical, the contrast test and the known limits. |
| [walkthrough.md](walkthrough.md) | The first-person walkthrough: how to start it, the controls table (mouse, keys, touch), what stops you, stairs and floors, devices, the cost per tier and the known limits. |
| [home-health.md](home-health.md) | Home health, the anomaly watch: what it flags (freezer, leaks, mould, batteries, open windows), per-sensor baselines from 21 days of history, alert modes, 7-day snooze and "This is normal", cached and throttled scans, Eco, the `/api/ha/anomalies` route and limits. |
| [assist.md](assist.md) | Asking Home Assistant Assist from the command box: the explicit button, consent, immediate execution, agents, conversation, what changed, replay and guest block, limits. |
| [mdi-icons.md](mdi-icons.md) | Material Design icons from Iconify for device markers: Device icons setting, icon picker, `plan.icons`, strict SVG check, caches, `DOSHY_EXTERNAL_DATA`, guest links, offline fallback. |
| [advisor.md](advisor.md) | The cost and comfort advisor: price, solar and weather sources, the server-side ENTSO-E token, advice only, reminders, "Make it a routine" through the automation builder, Eco manual refresh, routes and limits. |
| [maintenance.md](maintenance.md) | Maintenance board: your recurring tasks, 14 templates, calendar-day due dates, snooze and Done, automatic checks (batteries, filters, washers, offline, updates), wrench dots on the model, the daily reminder, storage in `plan.maintenance` and limits. |
| [utilities.md](utilities.md) | Pipes: drawing water and gas lines and valves, how the trace finds the valve that stops a leak or gas alarm, valve states, the shut-off dialog with explicit confirm, gas safety wording, replay and guest block, limits. |
| [arrival.md](arrival.md) | Welcome home and Goodbye choreographies: Light my way ordering, the `doshy_` Home Assistant automations, the five-minute away minimum, unknown or unavailable people not counted as away, no locks or garage doors, the preview that refuses writes, `plan.choreographies` and limits. |
| [pressure.md](pressure.md) | Air pressure from a Home Assistant barometer: chip and wall line, units (Auto, hPa, kPa, inHg, mmHg), 3-hour tendency, sea-level correction, Zambretti indication, the analog wall barometer, optional falling-pressure alert, limits. |
| [night-sky.md](night-sky.md) | The real night sky: stars, planets, Moon and the optional ISS in the 3D view, the Tonight's sky chart and wall slide, quality tiers, the `DOSHY_EXTERNAL_DATA` opt-out; data provenance in [night-sky-data.md](night-sky-data.md). |

Contributor guide: [../CONTRIBUTING.md](../CONTRIBUTING.md). Third-party data: [../CREDITS.md](../CREDITS.md).
