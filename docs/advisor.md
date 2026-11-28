# Cost and comfort advisor

The Advisor reads electricity prices, the sun forecast and the weather forecast and writes a few plain ideas: "Best time to run the dishwasher", "Solar surplus expected ...", "Open the windows ... to cool down", a curtain-closing idea for sunny rooms, a "Heating" hint when it is warmer outside than inside, and a barometer note when pressure falls fast. Each idea has a **Why?** that shows the numbers behind it. It is advice only: the panel says "Advice only: nothing here runs a device".

## Using it

1. Open **Advisor** from the Live dock, or the command palette (`Advisor`).
2. If no source is set yet, the **Sources and preferences** section opens by itself. Pick where prices, solar and weather come from, then **Save**. The panel refreshes after saving.
3. Read the cards. **Refresh** recalculates; "Updated HH:MM" shows when.
4. Optional: tick **Show a Today card on the Live screen** (two best ideas, a button that opens the panel). The wall display has an "advisor" slide (up to four ideas) that asks for its own update once.

Under "What it could not use" the panel lists sources that failed (for example "Electricity price source unavailable; other sources remain usable."). One failing source does not stop the others.

## Data sources

Set in the panel (labels as shown):

- **Electricity prices**: "No prices", "A Home Assistant price sensor" (plus a unit choice), "aWATTar Germany (no key)", "aWATTar Austria (no key)", "ENTSO-E day-ahead (free token)" (plus a bidding zone), "My own tariff (peak / off-peak)". Feeds accept VAT % and an amount added per kWh.
- **Solar forecast**: "Automatic", "A Home Assistant forecast sensor", "Open-Meteo, from my panels" (kWp, tilt, facing, "House always draws W"), "No solar".
- **Weather forecast**: "Automatic", "A Home Assistant weather entity", "Open-Meteo", "No forecast".
- Also: currency, metric/imperial, optional indoor and outdoor temperature sensors, comfort band, and which appliances to advise on (dishwasher, washing machine, dryer; dryer is off by default).

Home Assistant data comes through the dashboard's server (`config`, `states`, and the weather forecast service in production builds). Open-Meteo needs a place: the plan's Surroundings location, else the `zone.home` coordinates, else a stored place. Without one the panel says "Set a home location to use Open-Meteo forecasts."

External downloads (aWATTar, ENTSO-E, Open-Meteo) are made by the server, not the browser, and stop when `DOSHY_EXTERNAL_DATA=0`. Answers are cached for 30 minutes and each external request times out after 10 s.

## ENTSO-E token

The token is pasted in the **ENTSO-E security token** field (password input) and sent once to `PUT /api/advisor/settings`. The server checks its shape (8 to 128 letters, digits or dashes), encrypts it with the server's key file and stores it in the database `meta` table. The settings row `housey-advisor` never contains it. The API returns only `tokenSaved: true/false`; the field shows "Saved; type to replace". Tick **Remove the saved token** to delete it. The server adds the token to the ENTSO-E request itself; error text from ENTSO-E is not passed on to the browser, because it can echo the request URL.

## Reminders

A card whose start time is more than about 6 minutes away shows **Remind me**. It saves a reminder for 5 minutes before the start. While the dashboard is open, the reminder arrives in the inbox with "Advisory only: nothing has been run." Reminders are per home, kept in the database settings (`housey-advisor-reminders`), at most 40, and dropped once the advice window has passed. Nothing is sent when the dashboard is closed; the card says so: "The inbox will remind you while this dashboard is open. Nothing runs automatically."

## Make it a routine

Only some cards offer **Make it a routine**: the appliance idea when the plan links that appliance to a controllable switch, and the curtain idea when the room has a cover. It opens the normal automation builder (`device-at` recipe) pre-filled with the device, action and time. You can change the time and **Only when someone is home** (on when Home Assistant has `zone.home`). The preview shows the sentence and the Home Assistant automation, then you confirm; it starts working immediately. The advisor never creates it on its own. The routine repeats daily, so the builder warns that prices and weather change and that a smart plug may only power an appliance, not start its cycle. Afterwards: "Routine created in Home Assistant. Manage it in Automations."

## Eco tier

On Eco the advisor never refreshes in the background: the Today card's 30-minute refresh does not run, and the panel shows "Eco: updates only when you press Refresh." Opening the panel still refreshes once, and the wall slide asks once if it has no result.

On other tiers, with the Today card on, it refreshes on load and every 30 minutes while the tab is visible.

## For contributors

- Pure logic: `lib/advisor.ts` (`advise`, card ids, `remindAt`, `RoutineSeed`), `advisorPrices.ts`, `advisorFeeds.ts` (aWATTar, ENTSO-E parsing), `advisorForecast.ts`, `advisorSun.ts`, `advisorTime.ts`, `advisorFormat.ts`, `advisorSettings.ts` (`parseSettings` repairs any stored value), `advisorPlan.ts` (appliances, indoor temperature, pressure note), `advisorReminders.ts`. Tests: `lib/advisor.test.ts`, `lib/server/advisorData.test.ts`.
- Client store: `lib/advisorStore.ts` (refresh, abort on home change via an `epoch` counter, plan-change check).
- Server: `lib/server/advisorData.ts` (`createAdvisorDataService`), `lib/server/advisorSettings.ts` (token seal/open, transactional save); routes `app/api/advisor/data` (GET) and `app/api/advisor/settings` (GET, PUT with write access).
- UI: `components/ui/AdvisorPanel.tsx`, `AdvisorCard.tsx`, `AdvisorToday.tsx`, `AdvisorDriver.tsx`, `advisorReminderStore.ts`.
- Invariants: the token never leaves the server after saving; no advisor code calls a Home Assistant service; routines go only through `SeededAutomationBuilder`; upstream error text is never returned; Eco never auto-refreshes.

## Not verified

- Nothing was run: no server, tests, or real aWATTar, ENTSO-E, Open-Meteo or Home Assistant calls. This page comes from reading the code.
- Where the encrypted key file lives and its permissions (`secretBox`) were not read.
- Whether Home Assistant versions without the weather forecast service work in development builds (the service is only used when `NODE_ENV=production`).
- The exact savings figures and thresholds in each card were not checked.
- Layout and wording of the Today card and wall slide were not seen on screen.
