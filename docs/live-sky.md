# Live sky: the sky outside, in your 3D home

The 3D view shows the sun, the moon, the clouds, the rain, the fog and the wind that are really outside right now. Nothing to set up if Home Assistant has a weather entity: the sky follows reality on its own, and you can take over any part of it at any time.

## What follows what

| What you see | Where it comes from |
|---|---|
| Sun position and daylight | Home Assistant's `sun.sun`. Without it, worked out from your home's position (`zone.home`), else from Bucharest. |
| Moon phase | A moon sensor in Home Assistant (`sensor.moon_phase`, `sensor.moon` or a `moon.*` entity) when you have one, else worked out from the date. |
| Rain, snow, fog, storm, clouds | The weather entity's condition (`rainy`, `snowy`, `fog`, `lightning-rainy` ...), refined by its numbers (below). |
| Wind | The weather entity's wind, else a weather station's wind sensors. |

The numbers a weather entity can add (all optional, whatever it reports is used):

- **Cloud coverage** (`cloud_coverage`, 0 to 100 %) sets how cloudy it is, and wins over the condition's own guess.
- **Precipitation** (`precipitation` in mm or inches per hour) makes rain and snow lighter or heavier. A reading of 0 keeps the condition's own strength.
- **Visibility** (`visibility`) makes fog thicker the shorter it is.
- **Wind speed** is converted from the unit the entity uses (km/h, m/s, mph, knots, ft/s). With no unit it counts as km/h. **Gust speed** (`wind_gust_speed`) makes the gusts stronger when it is well above the average wind.
- **Temperature** (°C or °F) decides at the edges: rain below freezing falls as snow, and "snowy-rainy" in mild air falls as rain.

## The moon at night

Night light follows the moon: a full moon gives a clearly brighter, bluer night, a new moon a darker one. It never goes fully black. The Live sky bar shows the phase (for example "Growing crescent") next to the sun's height after dusk.

## The Real sky switch

The **Real sky** button in the top bar (on a phone or the 7" screen: the first row of the Sky menu) turns on everything at once: time of day AUTO, weather AUTO, wind AUTO. A small **Live** tag appears; hover or tap the button to read where each part comes from.

Switch it off and your own choices come back. If you had picked things by hand before (for example "night" and "snow"), those return. If you had not, the sky freezes as it is right now so nothing jumps. The AUTO chips still work on their own: for example, you can keep the real weather but pin the time to dusk.

## Picking the weather entity

Auto picks the entity named like your home (`weather.home`, `weather.forecast_home`), otherwise the first one in alphabetical order. With two or more weather entities, the weather menu lists them under **Weather from**: pick one to follow it. If it later disappears from Home Assistant, the sky goes back to automatic by itself.

## What it costs

| Tier | Clouds, rain, snow, fog, wind, moonlight | Lightning |
|---|---|---|
| Eco, Light | Yes (rain and snow use fewer drops, trees stand still) | No flashes, no extra drawing. A storm is still dark and grey. |
| Balanced, Detailed, Ultra | Yes | Rare, soft flashes (every 15 to 45 seconds in a fierce storm, softer with reduced motion) |

The sky only recalculates when something it reads changes (the sun, the weather entity, the wind, the moon, or a setting), not on every refresh from Home Assistant. Changes glide in over a second or two. Nothing redraws while the sky is calm.

## Limits

- The moon is placed opposite the sun at a fixed height; only its light changes with the phase.
- The computed moon is the average cycle, within about half a day of the real phase.
- The phase glyph shows the northern-hemisphere view.
- Rain and snow can only be as precise as your weather entity: most integrations report condition and cloud coverage but no rainfall rate.
