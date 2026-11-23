# WashData: washing machines, dryers and dishwashers

[WashData](https://github.com/3dg1luk43/ha_washdata) (the Home Assistant integration `ha_washdata`, installed with HACS) watches an appliance through its smart plug, notices each cycle, recognises the program and estimates the time left. The dashboard shows all of that on the appliance in the 3D home. It works for washing machines, dryers, washer-dryers, dishwashers and pumps.

## Link an appliance

1. Open Home Assistant mode and select the appliance (a washer, a dryer, a dishwasher, or any piece from Appliances or Kitchen & dining).
2. At the top of the **Link** panel, **WashData appliances** lists every WashData device found, with its state in words. Tap yours. That is the whole link: no search, no entity ids.
3. The panel now shows **WashData: <name>**, the state, small chips for what it provides, and a switch **Tell me when it finishes** (on by default). **Clear link** unlinks as for any entity.

Linking any entity of the device (for example `sensor.<name>_progress`) also works: any of its entities stands for the whole device. The picker links `sensor.<name>_state`. A WashData link wins over a "Make it smart with a plug" link on the same piece; both keep working and a plug setup you already made is left alone.

## What you see

- **On the appliance (Live mode)**: a marker with a progress ring, the state in words and the time left (`Washing 45% 32 min`). Green `Done`, amber `Paused`, red `Interrupted`, grey `Idle`. **Laundry inside** (WashData state `clean`) and problems are alerts: they are never hidden and the marker pulses (not with reduced motion). A plain `Finished` and idle shrink to a status dot in a busy view. A small wrench dot means maintenance is due. The drum turns only while the machine is working: it stops when paused, finished or idle. Your own item icon (Choose icon) replaces the appliance icon. Tap the marker or the appliance for its card.
- **The card** (also right-click, Shift+click or a long press): the state in big words, progress, program and phase, time left and `ready about 21:45`, power now, the last cycle (time, energy, cost with its currency), totals, a maintenance notice, and these controls, each shown only when WashData offers it right now:
  - **Pause** and **Resume**, **Mark unloaded**, **Force end** (asks first: "End the cycle now?")
  - **Program**: Auto detect or one of the programs you taught WashData.
  Every control is an explicit tap, shows the result at once, and goes back with a plain sentence if Home Assistant says no.
- **Room device list**: one row under Appliances, `Washing - 32 min left`, `Finished - laundry inside`.
- **Top strip and house card**: a chip `Washer 32 min` / `Dishwasher done` while something runs or waits to be emptied. Tap it for the card. On small screens the chip shrinks to its icon, and the house card lists every appliance.
- **A toast**: "Washing Machine is done" once, when a cycle that was running ends while the dashboard is open. A page reload never repeats it. Switch it off per appliance with **Tell me when it finishes**.

## Entities used

Everything is read from the states Home Assistant already reports; a device is recognised when at least three of `sensor.<name>_state`, `_time_remaining`, `_progress`, `_program`, `_current_phase`, `_cycle_count` and `binary_sensor.<name>_running` exist. Missing or `unavailable` entities simply leave things out.

| Entity | Used for |
| --- | --- |
| `sensor.<name>_state` | `off, idle, starting, running, paused, user_paused, ending, finished, anti_wrinkle, interrupted, force_stopped, clean, delay_wait` |
| `sensor.<name>_program`, `_current_phase` | program and phase |
| `sensor.<name>_time_remaining`, `_elapsed_time`, `_total_duration`, `_progress` | time left, expected finish, progress |
| `sensor.<name>_current_power` | power now |
| `sensor.<name>_last_cycle_duration`, `_last_cycle_energy`, `_last_cycle_cost` | last cycle (the cost unit is the currency) |
| `sensor.<name>_cycle_count`, `_energy_total` | totals |
| `sensor.<name>_suggested_settings_available` | "3 suggested settings waiting in WashData" |
| `binary_sensor.<name>_running`, `_maintenance_due` | running (when there is no state sensor), the wrench |
| `select.<name>_cycle_program` | the program list and choice |
| `button.<name>_pause_cycle`, `_resume_cycle`, `_force_end_cycle`, `_mark_unloaded` | the controls |

The appliance's own plug entities (`switch.<name>_switch`, its power sensor) are not part of the device. `finished` is not `clean`: only `clean` means the load is still inside.

## What it does not do

- **It never starts a cycle.** WashData has no start command, so there is no Start button.
- It sends only the five commands above, and only when you tap. The server allows `button.press` only for those four buttons and `select.select_option` only for a `..._cycle_program` select, and only for an option that select lists.
- `button.<name>_record_cycle_start` / `_record_cycle_stop` (teaching WashData a new program) are left to Home Assistant.

## For developers

Pure logic is in `lib/washdata.ts` (tests: `lib/washdata.test.ts`, plus `lib/roomDevices.test.ts`, `lib/entitySuggest.test.ts`, `lib/haService.test.ts`). The scene marker is `components/scene/WashFx.tsx`, the card `components/ui/WashCard.tsx`, commands `components/ui/washUi.ts`, the finish toast `components/ui/WashWatch.tsx`. `/api/ha/states` passes the `options` attribute for `select.*_cycle_program` only. Per-item setting: `params.washNotify` (`false` = no toast; absent = on).
