# Pipes: water and gas tracing and shut-off review

You can draw water and gas pipes on the plan, put valves and meters on them, and link the valves to Home Assistant. When a leak, smoke, gas or carbon monoxide alert fires (or the home-health card reports water use at night), Doshy follows the drawn pipe from the sensor back to the supply, highlights the path, and names the valve that would stop it. It never closes anything on its own: only a tap on **Confirm close** (or **Confirm reopen**) sends a command.

This is a drawn model, not an engineered plan. It is good enough to say where a leak is likely fed from, not to prove it.

## Draw the pipes

1. Open the **Pipes** tool in the Plan dock (or the palette: "Pipes: water and gas").
2. Pick a **Kind**: Cold water, Hot water, Gas, Drain, Heating pipe. Colours are the conventional ones (blue, red, yellow, grey, orange) and do not change with the theme.
3. Tap points on the plan, then **Finish pipe**, Enter, or double-tap the last point. Esc cancels. A pipe has 2 to 40 points; a plan holds up to 100 pipes.
4. Corners snap to valves, other pipe corners, wall ends, room corners and points along those lines, on the active level only. Hold Alt to turn snapping off.
5. Choose **Valve or meter** ("Choose to place...") and tap the pipe. Options: main water valve, water valve, smart water valve, zone valve, water meter, gas valve, gas meter.
6. Link each valve to its Home Assistant entity in the Home Assistant view (the Pipes hint says so). A valve links to a `valve` or `switch` entity; a meter links to a `sensor`.

Only cold water, hot water and gas are traced. Drain and heating pipes are drawn and nothing more.

### Editing a pipe

Tap a pipe to select it ("Edit pipe"). You can drag it or one corner, change kind, **Height (m)** (0 to 8), **Diameter (m)** (0.01 to 0.2), **Name**, **Level**, nudge it with the arrow buttons (10 cm), **Add corner**, **Duplicate**, or **Delete pipe** (also the Delete key). Edits are normal plan edits and can be undone. Pipes belong to a level; the "Select" tool can pick a pipe on the plan and jumps into the Pipes tool.

## How the trace works

- Cold and hot water are one network; gas is another. They never connect to each other, even where they cross.
- Pipes join where an end touches another pipe, where same-kind pipes cross, or where ends meet within 15 cm. Ends at the same spot on two levels join too: that is how a riser is drawn.
- A valve or meter counts as on a pipe if it is within 40 cm of it on the same level. A main valve (`main water valve`, `gas valve`) is where the supply enters: the trace ends there.
- A sensor is traced to the nearest pipe within 3 m. A sensor not on the plan, or too far from every pipe, falls back to the pipes inside its room. If neither works, there is nothing to offer.
- Mapping from alert to network: leak is water; gas, carbon monoxide and smoke are gas.
- The suggestion is the valve closest to the sensor that alone cuts the supply (a zone or water valve before the main). Other valves that also work are kept as alternatives. If the pipe is a loop fed from several main valves, all of them are listed. A valve with a linked Home Assistant entity is preferred over one you operate by hand.
- A water valve closed in Home Assistant is treated as blocking: the dialog then offers to reopen it instead of closing.
- The path from sensor to supply is highlighted in the 3D Live view while an alert is active or the dialog is open. In Live view, the **pipes** layer shows every drawn pipe. Eco/light quality draws flat lines; reduced motion or no ambient animation stops the pulse.

## Valve states

| Home Assistant says | Doshy shows |
|---|---|
| `valve`: `open` / `closed` | Open / Closed |
| `switch`: `on` / `off` | Open / Closed (a switch is a shut-off device whose "on" is flow) |
| `closing` / `opening` | "closing · not confirmed" / "opening · not confirmed" |
| anything else, unavailable, missing, not linked | "State unknown" |

Doshy never guesses a valve is closed. A valve with no entity shows "Not linked · operate by hand".

## The shut-off dialog

It opens from the alert banner (button text such as "Close the main water valve?", or "Review pipe path"; when the supply already reads closed: "Valve closed · Reopen..."), or from the home-health card ("Find water shutoff").

- Title: "Water supply shut-off" or "Gas supply shut-off", then where the problem is, what will stop working, and the valve list ("Valve states").
- **Close supply...** starts a close confirmation; **Reopen...** starts a reopen confirmation. Only **Confirm close** / **Confirm reopen** sends the command. Cancel or Esc closes without sending.
- The confirm button is disabled until every valve in the question has a linked `valve` or `switch` entity that Home Assistant currently reports in a real state (not unavailable, unknown, closing or opening).
- The dialog is off (read-only) in History replay and on guest links. It will not open for a guest or while the plan is not loaded.
- If the drawn plan, plan id or home changes while the dialog is open, the confirm is refused ("The plan or home changed. Review the pipe path again before operating a valve.") and the dialog asks you to close it and review again.
- After sending, it says "Close command sent. Check the Home Assistant state below; a command is not confirmation that the valve moved." and refreshes states. If one of several valves fails, the ones already sent stay listed, with a warning that some valves may already have moved.
- If a required valve cannot be controlled, it says to close it by hand and that the dashboard cannot confirm a complete shut-off.

### Gas wording

For gas, the dialog always shows: "If you suspect gas, smoke or carbon monoxide, leave the area and follow local emergency advice. Do not reopen gas until a qualified professional says it is safe." The headline differs by alert: smoke ("If gas could be feeding a fire, you can shut it off"), carbon monoxide ("A gas appliance may be faulty"), or gas ("Gas may be coming from a pipe"). The effect line warns that the boiler, hob and fire stop and some may need restarting. Reopening says: "Only reopen after the cause has been made safe."

## Limits and safety

- Nothing closes or reopens automatically; the dialog says so.
- The call goes through the same validated service route as everything else (`valve.close_valve`, `valve.open_valve`, `switch.turn_off`, `switch.turn_on`). The entity must exist in Home Assistant or the call is refused.
- A command is not proof the valve moved; the state is re-read and shown.
- A wrong drawing gives a wrong suggestion. Check it against the real pipes, and do not use the dashboard as your only way to stop gas.

## For contributors

- `lib/utilities.ts`: kinds, limits (`MAX_LINES` 100, `MAX_POINTS` 40, 1500 points total), `sanitizeUtilities`/`withUtilities` for untrusted plans, pure edits (`addLine`, `patchLine`, `splitSegment`...), `VALVE_KINDS`, `VALVE_LABEL`, `utilityDomains`. Invalid edits return the plan unchanged.
- `lib/utilitiesGraph.ts`: `buildGraph` (join tolerance `JOIN_TOL`, `VALVE_TOL`, `REACH`) and `traceFrom` (cutters, closeAll, blockedBy, pieces).
- `lib/utilitiesShutoff.ts`: `valveState`, `valveCall`, `closedValves`, `shutoffTarget`, `suggestShutoff`, all pure and the single place for wording and calls. Unknown stays unknown.
- `lib/utilitiesEditor.ts`: snapping and hit-testing for the plan editor; `components/plan/UtilityLayer.tsx`, `UtilityBar.tsx`, `UtilityUi.ts` are the tool.
- `components/ui/UtilityShutoffDialog.tsx`, `utilitySafetyUi.ts` (request store, `housey:shutoff` event: it only opens a review), `UtilityAlertStep.tsx`; `components/scene/PipesLayer.tsx` draws the highlight.
- Invariants: no valve call without the confirm click; recheck plan, home and link right before each call; `assertLive()` blocks replay; external requests resolve only to a placed sensor or room, never an arbitrary valve.
- Tests: `lib/utilities.test.ts`, `utilitiesSafety.test.ts`, `utilitiesEditor.test.ts`.

## Not verified

- Not run in a browser or against a real Home Assistant; everything above is from reading the code and its tests.
- Real valve behaviour (Zigbee, Z-Wave, motorised gas valves) and how long they take to report a state.
- The look of the highlight and the dialog on small screens and with each theme.
- Whether `closing`/`opening` transitions are reported by every valve integration.
- The link step in the Home Assistant view (only the hint text was read).
