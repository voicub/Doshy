# Seasons and growth by the real date

The garden follows the year, not four steps: trees leaf out in spring, flower, turn in autumn and drop their leaves, the lawn goes green, then golden, then thin, and snow lies when the weather says so. It follows today's date by default, and the date can be previewed.

## What you can do

Season chip in the Live bar (the "Season" group of the compact menu on a phone or the 7 inch screen):

- **follow the real date** (the default): the garden shows today. The northern or southern half of the world comes from Home Assistant's home position (`zone.home` latitude): south of the equator the seasons are swapped. No position known: Bucharest.
- **spring / summer / autumn / winter**: shows that season whatever the date (as it always did; winter is snowy).
- **Preview a date**: a slider over the year. The trees, the lawn, the leaves in the air and on the ground, and the **sun** (its height and the length of the day, worked out for that date at today's time of day) all follow it, and so do holiday decorations. A line under the slider says what the garden is doing ("Blossom out", "Leaves falling", "Under snow"). It never saves: "Back to today" or a reload returns to the real date, and a wall display never wakes up stuck in March.

## The year (`lib/seasonYear.ts`, tested in `lib/seasonYear.test.ts`)

`yearPhase(date, lat)` is a number from 0 to 1 for the day of the year, shifted by half a year south of the equator, so every curve is written once, for the north. Typical dates (north):

| thing | when |
|---|---|
| canopy (`canopyFullness`) | bare until mid April, buds opening to the third week of May, full to early October, bare by late November |
| leaf colour | green until the third week of September, then yellow, orange, brown by December |
| blossom | mid April to the first week of May |
| leaves in the air | late September to the end of November, most in late October |
| leaves on the ground | piling up from mid October, kept through the winter, gone by April |
| lawn colour | greens through March and April, summer green, golden in late summer, autumn colours by the end of October |
| lawn thickness | thin after the winter, full from late spring, thinning as the cold comes |
| evergreens, hedges | stay as they are |

**Snow** (`lyingSnow`): with a linked weather entity it is cold weather inside the cold season (-1 C or colder keeps snow, +4 C or warmer melts it; a mild winter day shows a dull, damp lawn instead of a white one, `WINTER_DRY` in `lib/season.ts`). Without a temperature it follows the calendar's winter (December to February), thinning toward the tropics (none under 28 degrees of latitude). Falling snow from the weather adds to this as before.

## Cost per graphics tier

Nothing here runs per frame. The garden's look is worked out once per day (and when the temperature moves snow by 5 %), pushed into the shared foliage shader's uniforms (`components/scene/FoliageDriver.tsx`, `foliageLookAt` in `lib/vegetation.ts`), and nothing needs `keepAlive`.

| tier | what the date changes |
|---|---|
| Eco, Light | tints only: leaf, lawn and shrub colours move through the year; the canopy is in leaf or bare; blossom and leaf litter as the four-step garden had them |
| Balanced | the canopy fills and thins leaf by leaf; the lawn's thickness |
| Detailed, Ultra | blossom for exactly its weeks (and drifting petals), leaves piling up on the ground and drifting down |

## Where it is wired

`lib/sky.ts` returns `year` in `SkyState` next to the older `season` (a season name and a cross-fade, still used for the label, the fireflies and the winter mist). `lib/useSky.ts` replaces "now" by the previewed date while `lib/seasonPreview.ts` holds one. The lawn plane, the real ground of the surroundings, the petals and the falling leaves read the year; `seasonPalette(season, mix, snow)` takes how much of winter is snow. Manual seasons use `forcedYear`, which keeps the four-step garden's look exactly.
