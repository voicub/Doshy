# Maintenance board

A list of the upkeep your home needs. It has two kinds of items: **your own recurring tasks** ("Replace the HVAC filter, every 90 days") and **automatic checks** that Doshy finds in Home Assistant (a low battery, a filter running out, a device offline for a day). It only reads Home Assistant; no device is ever changed.

## Using it

- **Open**: the wrench button in the dock ("Maintenance", with "· N due" when something is due), or the command palette entry "Maintenance". A wrench dot on the 3D model opens the board on that item.
- **Sections**: "Due now", "Soon · next 14 days", "Later" and "Healthy". Your tasks come first inside a section, most overdue first; automatic items follow, lowest level first. A **Room** filter above the list narrows it ("All rooms", "No room / whole home", or one room).
- **Add task** opens the editor. "Start with a template" fills name, icon and interval in one tap. Fields: Task name (80 characters), Repeat every + Interval (days, weeks, months or years), Next due, Last done, Room, Item on the model, Icon, Notes (400 characters). Choosing an item also fills the room when it is empty.
- **Each card** shows what it is, the room ("Whole home" if none), "Yours" or "Automatic", and words like "Overdue 3 days", "Due tomorrow", "Due in 5 days", "Due in about 3 months". Buttons: **Done**, **Snooze 1 day**, **Snooze 1 week**, **Edit**, **Delete** (yours) or **Hide** (automatic), and **Show on the model** when the item has a furniture piece or room.
- **Done** on your task records today in its history and counts the next due date from that day, so doing it early or late moves the schedule. A snooze puts the task off without changing its schedule; Done clears it. The card shows the last 20 completions under "Completion history".
- **Undo / Redo** buttons in the panel step through plan edits. Deleting a task is undone this way.
- **Reminder**: when something new becomes due, one toast "Maintenance" says "N things need attention: ..." (first three names). At most once per calendar day, and a job that stays due is not repeated.

## Templates

Fourteen ready-made tasks (`lib/maintenanceTemplates.ts`): HVAC filter (90 days), smoke alarm test (6 months), smoke alarm batteries (1 year), descale kettle or coffee machine (3 months), dryer lint trap (1 month), water softener salt (1 month), boiler service (1 year), gutters (every autumn), fridge water filter (6 months), vacuum filter (1 month), cooker hood filter (3 months), windows (3 months), plants (6 months), dishwasher filter (1 month). The first due date is one interval from today. Gutters is seasonal: first due on the 1st of October (next one after today).

## Due dates

A day is a plain calendar date (`YYYY-MM-DD`, 2000 to 2100), never a time, so a clock change cannot shift a task. Adding a month to the 31st lands on the last day of a shorter month (31 Jan + 1 month = 28 or 29 Feb). A task is due on its own day, or on the end of its snooze when that is later. Due today or earlier is "Due now"; up to 14 days is "Soon"; the rest is "Later". Interval limits: 1 up to 3650 days, 520 weeks, 120 months or 10 years.

## Automatic checks

Derived each time from Home Assistant's states (`lib/maintenanceAuto.ts`); nothing is stored for them, so an item vanishes when the problem goes away.

- **Batteries**: sensors with device class `battery`. At or below the threshold is "due", within 10 points above is "soon", else healthy ("Battery 12%"). A binary battery sensor that is `on` is "Battery is low". Phones, tablets, watches, laptops, earbuds and companion-app battery levels are skipped. The threshold is set in "Automatic checks & battery threshold" (5% to 50%, default 20%).
- **Filters and consumables**: sensors with filter, brush, mop, dust bag, cartridge and similar in the name plus life/left/remaining, and the matching attributes of fans, humidifiers, vacuums, air purifiers and water heaters. Percent: due at 10% or less, soon at 20%. Hours: 20 and 50. Days: 3 and 14. Minutes and seconds are converted to hours.
- **Washers**: from the washer data (`lib/washdata.ts`): "Maintenance due, N cycles so far" when its `maintenance_due` sensor is on.
- **Offline**: a device linked on the plan (furniture, doors and windows, room sensors) that has been unavailable or unknown for 24 hours or more ("Offline for 3 days"), or a working one with no report for 24 hours ("No reading for N days").
- **Updates**: pending Home Assistant updates, status "soon" ("Update available: ...").
- **Where it sits**: on the linked furniture, else the room a plan sensor belongs to, else a room whose Home Assistant area matches the entity. Else "Whole home".
- **On the card**: **Done** only hides the check for one day (it returns if the reading still needs attention). **Snooze** hides it for 1 or 7 days. **Hide** switches it off until you use "Restore check" in "Hidden or snoozed automatic checks". **Edit** opens the battery threshold setting.
- At most 300 automatic items.

## What is stored

In the plan itself as `plan.maintenance`: `{ tasks, snoozed, ignored, batteryBelow }`. It is exported, imported and duplicated with the plan, and every change is one undo step. Limits: 100 tasks, 200 snoozed or hidden checks, 20 history days per task. Text is stripped of control characters and `<` `>`. A guest link never carries it (the guest plan is an allow-list, `lib/guestPlan.ts`). The "reminded" memory is in the browser's `localStorage` under `housey-maintenance-reminded.<plan id>`. There is no maintenance API route and no database table of its own.

## For contributors

- `lib/maintenanceDates.ts`: calendar-day arithmetic (UTC maths on year/month/day numbers). `lib/maintenance.ts`: types, `sanitizeMaintenance`/`withMaintenance` (run on every load, in `lib/designFields.ts`), and pure edits (`addTask`, `patchTask`, `markDone`, `snoozeTask`, `snoozeAuto`, `ignoreAuto`, `restoreAuto`, `setBatteryBelow`). Each returns a new plan, or the same one when nothing changes.
- `lib/maintenanceAuto.ts`: `deriveAutoItems`; ids are `auto:<kind>:<entity>` and must stay stable. `lib/maintenanceBoard.ts`: `buildBoard`, `dueWords`, `wrenchSpots`, `reminder`. `lib/maintenanceTemplates.ts`: `TEMPLATES`.
- UI: `components/ui/MaintenancePanel.tsx`, `MaintenanceEditor.tsx`, `MaintenanceButton.tsx`, `MaintenanceDriver.tsx` (one 60-second clock, hidden tabs skip it; builds the board into `maintenanceUi.ts`), `components/scene/MaintenanceMarkers.tsx` (dots only for "Due now" items, hidden on hidden floors, not in walk mode).
- Invariants: days are text, never timestamps; edits go through `editPlan`; the board never writes to Home Assistant; automatic items hold no stored state except snooze/ignore by id.
- Tests: `lib/maintenance.test.ts` (dates, edits, sanitising, templates, automatic items, board, dots, reminder).

## Not verified

- I did not run the app or the tests; everything above is read from the code.
- Whether the compact menu also lists the Maintenance button (only the dock's `SettingsActions` was read).
- How the panel looks and behaves in a browser, including the model dots and the toast timing.
- The `lib/db/careUtilityPlan.test.ts` file was not read; it is not part of this feature as far as I could tell.
