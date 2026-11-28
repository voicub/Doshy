# Atmospheric pressure

Doshy shows the air pressure from a barometer in your Home Assistant, how fast it is rising or falling, and a one-line "what the weather is about to do" indication. If your home has no barometer, nothing about pressure is drawn anywhere.

## What it does

- A pressure chip in the telemetry bar and a row in the house card ("Pressure 1013 hPa, rising slowly"). The compact strip and the wall display's clock slide show it too. The tooltip adds the 3-hour change, the indication and where the number comes from.
- A history card (24 hours) when you open a pressure entity, with the unit switch.
- An analog wall barometer in the catalogue (**Analog wall barometer**, `sn_barometer`): a dial from 960 to 1060 hPa with the classic words Rain, Change, Fair. Link it to a pressure entity and the needle follows the reading. A missing or implausible reading never shows "fair": the needle is left alone.
- Optional alert "Falling pressure" and an Advisor tip ("bring the cushions in"), both only on a very rapid fall.
- The Live sky can lean toward rain on a fast fall (a fall of more than 3.5 hPa in 3 hours with no real weather entity).

## Using it

1. Nothing to set up if Home Assistant has a pressure sensor or a `weather.*` entity with a `pressure` value. Doshy picks one by itself.
2. Settings > Display > **Units > Pressure**: Auto (the unit the entity reports), hPa, kPa, inHg or mmHg. This is a per-device display choice.
3. **Barometer source**: choose a sensor by hand if the automatic pick is wrong. A hand-picked sensor skips the name guessing.
4. **Correct to sea level**: tick it if your sensor shows pressure at your own altitude (most home sensors do). Enter the altitude in metres, or leave it empty to use the ground height found for your Surroundings. Weather maps and the forecast indication expect sea-level pressure.
5. **Pressure alerts**: off by default.

Automatic pick order: a sensor that says it is at sea level, then a weather entity, then an atmospheric-pressure sensor of unknown level, then a name match, then a sensor that says "station"/"absolute".

## How the numbers are made

- **Tendency**: change over the last 3 hours, worded like the Met Office/WMO: steady below 0.1 hPa, slowly up to 1.5, plain up to 3.5, quickly up to 6.0, very rapidly beyond. It needs about 3 hours of history; until then the chip shows the value only. It is never guessed.
- **Sea-level correction**: the standard barometric formula, with the station's air temperature when known and the standard atmosphere otherwise. A sensor named sea-level/QNH/relative is never corrected again, and weather entities are never corrected.
- **Indication**: the classic Zambretti forecaster (26 outcomes, "Settled fine" to "Stormy, much rain") from sea-level pressure, the 3-hour change, the month, the hemisphere (from the home latitude) and the wind direction when known. It looks at the next few hours only. It is an indication from a barometer, not a forecast, and the tooltip says so.
- **Storm warning**: a fall of more than 6 hPa in 3 hours.

## Limits and safety

- Barometer indications are not weather forecasts or safety warnings.
- Only plausible values are used (870 to 1085 hPa at sea level, 300 to 1100 hPa for an entity Home Assistant itself calls atmospheric pressure). Pipes, tyres, boilers and similar sensors are skipped by name; bar and psi are never taken as atmospheric.
- The history is read from Home Assistant (5 hours, refreshed every 10 minutes, live readings added between). In the Eco tier the page does not reload it on a timer.
- While you replay history, only the analog needle moves; the live tendency is untouched.

## For contributors

- `lib/pressure.ts`: all rules, pure and tested (`pressure.test.ts`, `pressureIntegration.test.ts`, `barometer.test.ts`). Units, entity detection, correction, `trend3h`, `zambretti`, dial maths.
- `lib/pressureHistory.ts` (history series to samples; weather entities use the `entity|pressure` attribute series), `lib/pressurePrefs.ts` (validated prefs: entity, correct, altitude -450 to 6000 m, alerts), `lib/pressureStore.ts` (persisted per home through `dbStorage`), `lib/pressureText.ts` (all sentences, so chip, tooltip and wall agree).
- `lib/usePressure.ts`: one shared store for the page. It rescans entities at most every 2 s and keeps one history request per barometer. The unit is not here: `pressureUnit` lives in `lib/display.ts`.
- UI: `components/ui/PressureBits.tsx` (chip, strip item, row), `PressureCard.tsx`, `PressureSettings.tsx`, `PressureLinkGroup.tsx` (the "Pressure sensors" group in the link picker), `components/scene/Barometer.tsx` (dial painted once per texture size; snaps in Eco, with reduced motion and in edit mode).
- Invariants: values are hPa internally; one correction applied to every sample so the tendency is the sea-level change; no barometer means no UI and no requests.

## Not verified

- Not checked against real weather entities from every integration (the unit guess for a `weather.*` without `pressure_unit` is a heuristic).
- The Zambretti scale and wind steps follow published tables as coded; their skill for a given home is not measured.
- Not tried on a Raspberry Pi.
