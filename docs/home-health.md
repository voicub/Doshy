# Home health

Doshy compares the sensors you linked on the plan with their own last weeks of history and tells you, in plain words, what looks odd: a freezer creeping warmer, water running at night, a mould risk, a flat battery, a window open while the heating runs. It is deterministic and local: no model, no network beyond your own Home Assistant. It is advice only; it never operates a device.

## Using it

- **Open**: the Home health button in the Live dock, the chip in the Live view ("3 unusual", "All normal", "Checking", "Not checked"), or the command palette (`Home health`).
- **Each card** has a title, severity (`info`, `notice`, `warning`), room, a sentence ("Freezer is 4.5 °C warmer than normal since yesterday 14:00"), a 14-day chart with the shaded usual range when the rule has one, and **What to check** with a few suggestions.
- **Buttons**: **Snooze 7 days** hides that one card for a week. **This is normal** teaches Doshy (see below). **Show on the model** jumps to the room or device. Water-at-night cards also have **Find water shutoff**.
- **Check now** reads the history again, bypassing the 15-minute cache. **Reset snoozes and learned tolerances** appears once something has been snoozed, ignored or taught.
- **Anomaly alerts** (the select in the panel) has three modes:
  - `Banner for warnings` (default): only `warning` cards may raise the alert banner, and only in the Live view.
  - `Quiet: only here`: cards appear in the panel and chip, no banner.
  - `Off`: the background watch stops. **Check now** still works.

## What it watches

Only entities linked on the active plan (room temperature, humidity and power fields, linked devices, openings, water flow entries), found by Home Assistant device class and unit (`lib/anomalyPlan.ts`). The battery sensor of a linked device is found by name (`<device>_battery`, `_battery_level`, `_battery_state`). Up to 80 numeric sensors with history and 160 in all.

| Rule | Needs history | Says |
|---|---|---|
| level | yes | Freezer, fridge, room temperature, humidity or power held away from its usual level for hours |
| drift | yes | Freezer or fridge creeping warmer over 3 to 5 days; humidity climbing (mould risk) |
| humidity | yes | 75 % or more for the last 12 hours (mould risk; with a room thermometer the card gives the dew point) |
| standby | yes | Whole-home power at 01:00 to 05:00 higher for the last two nights |
| water_night | yes | Water running 3 hours or more between 00:00 and 05:59; skipped when it happens most nights (irrigation, softener) |
| stale | partly | A sensor that normally changes has not reported for 24 hours |
| unavailable | no | `unavailable` for 6 hours or more |
| battery | no | A battery at 15 % or less (5 % or less is a warning), or a low-battery flag |
| window_heating | no | Window open 30 minutes or more while the heating or cooling in that room runs |
| garage_night | no | Garage open 10 minutes or more between 22:00 and 04:59 |

Each sensor gets at most one card, the most serious.

## Baselines

What "normal" means is learned per sensor (`lib/anomalyStats.ts`):

- The server sends one number per hour for 21 days (the time-weighted mean). The last 4 days are judged; everything before them is the baseline (with a short history, the last 2 days are held out instead).
- At least 96 hours with a reading are needed. Less means "still learning": the learned rules stay silent.
- Each hour of the week gets its usual value from the most specific group with 3 or more readings: this hour of this weekday, then this hour on weekdays or at the weekend, then this hour of any day. Times use the home's time zone from Home Assistant, so a clock change moves nothing.
- Median and MAD (never mean and standard deviation), so one spike does not shift "normal". A deviation must reach 3 spreads and a minimum size (for example 3 degrees for a freezer, 4 for a room, 20 W and 35 % for power) and last the minimum hours, so a wobble never speaks. Readings outside a plausible range are treated as a broken sensor and ignored.
- **This is normal** on a card with a band widens that sensor's tolerance to cover what was seen (at least 1.5 times wider, capped at 20 times), so a much bigger change still speaks. On a card without a band (battery, silent, open window) it hides that card for good.

## Snooze, cooldown, retries

- **Snooze** lasts 7 days and expired snoozes are dropped.
- **Banner cooldown**: the same warning raises the banner at most once in 24 hours; one already on screen stays so it is not pulled away while read.
- **Scan cache**: a good scan is reused for 15 minutes for the same home, plan and sensor list. A failed scan is not retried by the background watch for 15 minutes either (it would ask the recorder for weeks of history on every poll). **Check now** always retries. After a failure the live rules still run from current states, and the panel says the last result may be out of date.
- The watch re-runs the live rules at most once a second after the plan or states change, and every 60 seconds.

## Eco

On the Eco tier the background watch never starts: no subscription to the sensors, no background history requests, so a Pi kiosk does nothing until someone opens the panel and presses **Check now**. The panel says "Eco: manual Check now only. No background scans."

## What is stored

The settings row `housey-anomaly`: `prefs` only (alert mode, snoozes, ignored ids, tolerances, banner stamps, last scan time and count), checked field by field on load. No history is stored in the browser.

## For contributors

- `lib/anomalyTypes.ts` (shapes), `anomalyPlan.ts` (what is watched), `anomalyWire.ts` (hour grid, 7 to 30 days, default 21, up to 100 entities), `anomalyStats.ts` (baseline, hysteresis, Theil-Sen), `anomalyRules.ts` (learned rules), `anomalyLive.ts` (live rules), `anomaly.ts` (`inspect`, `finish`, `LEARNED`), `anomalyScan.ts` (browser orchestration), `anomalyPrefs.ts` (snooze, ignore, tolerance, banner logic), `anomalyStore.ts` (zustand store and `startAnomalyWatch`), `anomalyText.ts`, `anomalyFixture.ts`, `anomaly.test.ts`.
- Server: `GET /api/ha/anomalies?entities=a,b&days=21[&fresh=1]` (`app/api/ha/anomalies/route.ts`, `lib/server/anomalyHistory.ts`, `anomalyLoad.ts`). Read-only, `sensor.*` only (anything else is 400), 7 to 30 days, history in chunks of 25 sensors, 16 MB cap per answer, 15-minute server cache per home and sensor list (4 entries).
- The browser analyses one sensor at a time and yields to the event loop every 10 ms, so a Pi's screen does not freeze.
- Invariants: anomaly ids are `<rule>:<entity>` so snoozes and "This is normal" stick; the engine works in °C, W, %, litres and converts back to the sensor's own unit; the pure files import with `.ts` extensions so the node test runner can load them; the banner is raised from `lib/alertsStore.ts` through `bannerWorthy`, only in the live view and only for a scan of the current plan.
- The panel's note says "21 days of their own history"; the code default is `DEFAULT_DAYS = 21`.

## Not verified

- Not run against a real Home Assistant, nor in a browser, for this document; everything above is read from the code.
- How the banner looks and behaves in practice, and whether the alert sound or other alert settings apply to anomaly banners, was not checked.
- Whether Eco also suppresses the alert-banner evaluation itself (only the watch and its scans were confirmed).
- The unit tests were not run.
