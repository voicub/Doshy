# Scenes, automations and the command box

Three features that turn the model into something you can talk to. Everything that changes Home Assistant goes through the server, is checked first, and never runs without an explicit tap.

## Scenes

A scene is a named set of device targets over the devices linked in the **active plan**: "Movie night" dims the living room, closes the curtains, turns the TV on.

- **Open**: the Scenes button in the Live dock (and the compact menu), or the palette (`Scenes...`, `Run scene: <name>`).
- **Make one**: pick a template (Movie night, Good morning, Away, Bedtime, Dinner, Cleaning, Party, Guests) or a blank scene. The editor lists the plan's lights, curtains, TVs and speakers, thermostats, fans and plugs by room. Each gets big buttons (Leave / Off / On, Close / Part / Open, Set) and sliders (brightness, warm to cool, colour swatches, opening, volume, temperature). **Try it** runs the draft now, **Save** keeps it.
- **Running** shows a toast ("Movie night is on", or which devices did not answer). **Restore previous** puts every touched device back as it was just before (lights, covers, thermostat setpoint, plugs; a TV goes back to off or on, not to the programme it was playing). Scenes or scripts started by a scene cannot be undone.
- **On room cards**: under "Show this scene on room cards" a scene can be pinned to rooms; the room's device sheet then has a button for it.
- **Storage**: `plan.scenes` (`lib/scenes.ts`). It lives in the plan, so it survives export, import and duplicating a plan, is saved to the database with the plan and is undoable like any plan edit. Loaded plans are scrubbed (`withScenes`: unknown devices types, bad numbers and duplicate ids are dropped; at most 40 scenes of 60 devices). Plans without scenes are unchanged.
- **What a scene may touch**: light, switch, fan, input_boolean, cover, media_player, climate, and `scene.*` / `script.*` entities that exist. Locks, alarms, buttons and garage doors, gates and doors (covers with those device classes) are never offered and are refused by the server.

### `POST /api/ha/scene`

Body `{ actions: [{ domain, service, entity_id, data? }] }`, at most 40 (longer scenes are sent in several batches). Every action passes the same strict validation as `/api/ha/service` (`lib/haService.ts`, bounded by the entity's own limits). `scene.turn_on` and `script.turn_on` are only accepted here, without arguments. One invalid action refuses the whole batch (400, nothing sent). Otherwise the reply is `{ ok, results: [{ ok, error? }] }`, one entry per action, so a lamp that is offline is reported without stopping the curtains; an entity Home Assistant does not know is reported and not called. Same-origin check, 30 runs a minute. Code: `lib/sceneRun.ts` (validation), `lib/server/haBatch.ts` (run).

## Automation from the model ("Make it do something...")

Open it from a device card or the Home Assistant mode inspector (a window or door sensor, a motion sensor, a light, a curtain), or from the palette / Scenes panel (`Automations...`).

Recipes (`lib/automations.ts`): tell me if a window or door is open after a time; tell me when it opens; turn lights off after N minutes without motion; close curtains when the sun is higher than N degrees; run a scene at a time (every day, weekdays, weekend). The sheet shows the plain sentence and, folded, the Home Assistant automation (YAML). **Create in Home Assistant** asks once more before anything is sent. Two more recipes, "at a time on some days, do X to a device" and "at sunrise or sunset plus or minus some minutes, do X", are made from the Routines panel ([routines.md](routines.md)); they go through the same route and the same checks.

- The browser sends a recipe, never automation code. The server re-validates every field against what Home Assistant really has (entities exist and are the right kind, notification targets are `notify.*` services that exist, garage doors and gates are refused) and builds the automation itself with the same code that made the preview.
- It is created with `POST /api/config/automation/config/<id>` (Home Assistant's config API), then `automation.reload`. The id starts `doshy_` and the alias `Doshy: ...`. Listing, switching on or off (`automation.turn_on/off`) and deleting only ever touch ids starting `doshy_` (`app/api/ha/automation/route.ts`, `lib/server/haAutomation.ts`).
- **Needs a token with administrator rights.** The config API is admin-only. When Home Assistant says no, the sheet says so in words ("the token in .env.local has to belong to an administrator").
- Written in the classic keys (`trigger`, `condition`, `action`, `service`), which every Home Assistant version reads.

## Command box ("Ask Doshy...")

In the command palette, pick **Ask Doshy...** and type plain words: "turn off the lights in the bedroom", "close all curtains", "set living room to 22", "dim the office lights to 30%", "run movie night", "is the bathroom window open?". A deterministic parser (`lib/commandParse.ts`, with `commandWords.ts`, `commandRooms.ts`, `commandAnswer.ts`) uses the plan's rooms, device names and scenes: synonyms (lounge, loo, blinds...), small spelling slips in longer words, numbers and percents. No model, no network.

- It says what it understood ("Turn off 3 lights in Bedroom") and waits for **Confirm** (Enter). Questions are answered at once from the states.
- Unclear room: it asks ("Which room?"), a name that fits two rooms is never guessed. A room you are looking at is used when none is named.
- Everything it produces passes the same validation as the server; locks, alarms, garage doors, restarts, deleting and other system settings are refused with a plain reason. "Everything" means lights, TVs and fans only (never plugs or curtains).
- **Voice**: a microphone button appears only when the browser can recognise speech on the device (`processLocally`); otherwise it is hidden, because some browsers send speech to their maker's servers. Doshy itself never sends audio anywhere.
- Limits: English only; floors ("upstairs") are not understood; a command runs on named rooms, not on arbitrary groups.

## Tests

`lib/scenes.test.ts`, `lib/commandParse.test.ts`, `lib/automations.test.ts`, `lib/server/haBatch.test.ts`, `lib/server/haAutomation.test.ts` (fake Home Assistant, no real calls). The shared made-up home is `lib/sceneFixture.ts`.
