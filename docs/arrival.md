# Arrival and departure

Two small choreographies for your front door. **Welcome home** switches on the lights that light your way in, one after another, when someone arrives. **Goodbye** switches things off when everybody has left. Both are real Home Assistant automations once you create them, so they keep working with Doshy closed. Nothing is created without an explicit "Yes, create it".

## Using it

- **Open**: the **Arrival...** button in the Scenes panel, or the command palette (`Welcome home...` / `Goodbye...`). The sheet is titled "Arrival and departure" and has two tabs, **Welcome home** and **Goodbye**.
- **Welcome home**
  1. **Where do you come in?** picks a door of the plan (or a garden gate, or the start of a path or road). The first outside door is preselected.
  2. Optionally **Finish in the room you usually go to**, then press **Light my way**. Doshy orders the plan's linked lights as you would meet them walking in: outdoor lights, then hall and entry rooms, then the other rooms by walking distance (measured through the doors), the chosen room last. The first light comes on at once, the others 1.5 s apart, at 60 % outdoors, 80 % in the entry and 100 % elsewhere.
  3. Edit the list: **Wait before step N (seconds)** (0 to 60), **Brightness for step N (%)** (1 to 100), **Up** / **Down** / **Remove**, drag to reorder, or **Add a light** then **Add light**. At most 30 steps and 5 minutes in all.
  4. **When it should run**: **Only after dark** (on by default), **Only if nobody else is home**, **Start when** "Someone arrives home" (with **Stay home this many seconds before starting**, default 5, 0 to 60) or "Someone enters a zone" (with **Arrival zone**), and **Turn the lights off again after a while** (1 to 240 minutes, optional **Leave them on if this sensor shows movement**).
- **Goodbye**: tick the **Lights off**, **Curtains closed (never gates or garage doors)** and **Eco temperatures** you want (each thermostat gets its own temperature, inside the device's limits). Lights start ticked. **Minutes after the last person leaves (safeguard)** is 5 to 60 (default 5); **Extra wait before acting (minutes)** is 0 to 30. **Remind me if the front door is still open** adds a door or window contact and a notification service; the message is "<contact> is still open." and is only sent when the contact is open.
- **Who** (both tabs): pick people, or none for everyone Home Assistant has (up to 20). It needs at least one `person.*` entity.
- **What this will do** shows the plain sentence and, folded, **The Home Assistant automation**. If something is wrong the sentence is replaced by the reason, and the buttons stay disabled.
- **Preview on the model** (Welcome home only): see below. **Save** keeps the draft in the plan only ("Nothing has been sent to Home Assistant"). **Create in Home Assistant** asks "Yes, create it" / "Not yet". Created: "It works even with this browser closed". **Manage automations** opens the Automations sheet to switch off or delete it.
- Up to 12 saved choreographies per plan, with **Duplicate** and **Delete** (undoable; an automation already created in Home Assistant stays).

## What Home Assistant gets

The server builds the automation itself from the checked recipe (`lib/automations.ts`), with an id starting `doshy_` (`doshy_arrival_sequence_...`, `doshy_departure_scene_...`) and an alias starting `Doshy: `. Doshy only ever lists, switches or deletes automations whose id starts `doshy_`; yours are never touched.

- **Welcome trigger**: a state change of the chosen people to `home`, held for the "stay home" seconds so a GPS flicker at the door does not start it; or a zone `enter` event, with no wait. Conditions are added only if chosen: `sun.sun` below the horizon, and the `zone.home` count below 2 (arrival counted) or below 1 for another zone.
- **Welcome actions**: each step's wait, then its call. With a turn-off time the run is `restart` (the timer counts from the last arrival), a delay, the optional motion sensor must be `off`, then `turn_off` for what the sequence switched on. Without one, a second arrival during a run is skipped (`single`).
- **Goodbye trigger**: the `zone.home` count below 1 for the "minutes after the last person leaves" time. **The minimum is five minutes**: a lower value is refused by the check, so a phone that loses signal briefly is not a departure.
- **Goodbye conditions**: every chosen person must be neither `home`, `unknown` nor `unavailable`. A person Home Assistant cannot locate is therefore not counted as away, and goodbye does not run. The extra wait is followed by the same checks again, in case somebody came back.
- **Goodbye actions**: `light.turn_off`, `cover.close_cover`, `climate.set_temperature`, then the door reminder.

## Limits and safety

- **Locks, alarms, garage doors and gates are never touched.** Steps may only name lights, switches, fans, input booleans, covers, media players, climate, scenes and scripts (`lib/scenes.ts`), and a cover that is a garage door, gate or door is refused, as for scenes (`lib/sceneRun.ts`). Goodbye only turns lights off, closes curtains and sets temperatures.
- Everything is re-validated on the server against what Home Assistant has: entities exist, numbers inside device limits, `sun.sun` and `zone.home` exist when used, the notification service is one Home Assistant offers, the contact is a door, window or opening sensor, the motion sensor a motion, occupancy or presence sensor. Creating needs `confirm: true` like every recipe.
- "Only if nobody else is home" cannot mix your home with other zones. Needs `zone.home`.
- The motion check looks only at the moment the timer ends; earlier movement is not remembered, and an unknown reading leaves the lights on.
- Delete in Doshy does not remove the Home Assistant automation.

## Preview

**Preview on the model** plays the sequence on the 3D model: the sequence's lights go off, then each step lights up in order (waits shortened to at most 4 s; with reduced motion the finished state is shown at once). It sends nothing to Home Assistant: it reuses the history-replay state swap, and every write is refused while it runs (the banner says "model only, controls off"). **Stop preview / Back to editor** restores the live states. It also stops when you edit, open a replay, change plan or switch home. Only lights, switches, fans, input booleans and cover positions are drawn.

## For contributors

- `lib/arrival.ts`: types and untrusted-JSON readers (`choreographyOf`, `choreographiesOf`), limits (`MAX_*`, `MIN_AWAY_MINUTES`), plan edits. Choreographies live in `plan.choreographies`, so they export, import, duplicate and undo with the plan.
- `lib/arrivalOrder.ts`: entrances, `orderArrivalSteps`, grid walk from `lib/vacuumPath.ts`. `lib/arrivalPlay.ts`: pure preview states and times. `lib/arrivalPreview.ts`: the zustand overlay and timers.
- `lib/automationsArrival.ts`: `validateArrivalRecipe`, `describeArrivalRecipe`, `arrivalAutomationParts`, `choreographyRecipe`; wired through `lib/automations.ts`.
- `components/ui/ArrivalSheet.tsx`, `ArrivalFields.tsx`, `ArrivalHost.tsx`, `arrivalUi.ts`; entries in `ScenesPanel.tsx` and `sceneCommands.ts`.
- Invariants: the browser sends a recipe, never raw YAML; the departure check must keep treating `unknown` and `unavailable` as not away; no lock domain in `STEP_DOMAINS`; the preview must stay behind `setReplaying`.
- Tests: `lib/arrival.test.ts`, `arrivalOrder.test.ts`, `automationsArrival.test.ts` (`arrivalFixture.ts` builds plans).

## Not verified

- Nothing here was run in this pass: no tests, no live Home Assistant, no browser. Everything above is read from the code.
- How Home Assistant behaves with the generated triggers (zone `enter` with several people, `for` on a `numeric_state`, `restart` mode) is inferred from its documented behaviour, not observed.
- The server-side `doshy_` id and alias were confirmed in `lib/automations.ts` and `lib/server/haAutomation.ts`; the exact `describeRecipe` wording was not read.
- Light ordering quality on real plans (stairs are not measured; another storey simply counts later) was not tried.
