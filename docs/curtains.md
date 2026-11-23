# Curtains

A window curtain has two layers, and each one opens and closes by its own Home Assistant entity:

- **Curtain (sheer)**: the light, see-through net (voile). Linked entity: the piece's normal link (`item.entity`).
- **Sun-blocking curtain**: the heavy velvet or blackout cloth. Linked entity: `params.blackoutEntity`.

Pieces with one layer (a plain curtain, the sheer or blackout curtains in Decor) show one group. `lv_sheer_curtain_door`, `of_curtain_grey_sheer`, `of_curtain_dark` and `kt_patio_door_sheer` have both.

## Link both layers

1. In Home Assistant mode select the curtain. The inspector shows **Curtain (sheer)** and **Sun-blocking curtain**, each with its own **Cover or sensor** picker.
2. Pick a `cover.*` for each (or any sensor, switch or the sun: the layer then follows it). Each layer has its own **Reverse** and **Open at or above** setting and a live "Now: open / closed / 60% open".
3. A layer with no reading, or no link, keeps the look the piece was modelled with. Nothing changes for curtains you do not link.

In the 3D view each layer moves by itself: the heavy panels draw across in front, the net gathers toward the side it is nearest to. The rod, rings and tie-backs never move.

## Control it from Home Assistant mode and Live mode

- **Room device list**: a linked curtain lists one row per layer, "<name> (sheer)" and "<name> (sun-blocking)", each with its open/closed switch and its state ("Open", "Closed", "60% open").
- **Tap the curtain** in Live mode (a cover must be linked to either layer): a small Curtain card opens with **Open / Stop / Close** per layer and, when the cover reports a position, a position slider. Only your taps send commands. If Home Assistant refuses one, the card goes back to what it was and says so in plain words. Without a linked cover a tap does what it did before (nothing, or a toggle for a switch).
- The card also has **Close at dawn** for the sun-blocking layer and the last automatic action ("Closed automatically at 05:12"). See the next section.

Saved plans keep loading: all the settings are optional entries in the piece's `params` (`curtainInvert`, `curtainAbove`, `blackoutEntity`, `blackoutInvert`, `blackoutAbove`, `blackoutDawn`, `blackoutOpenAt`).

## Automatic dawn rule

A window curtain has a **sheer** layer (the light net) and a **sun-blocking** layer (the heavy velvet). The sun-blocking layer can close by itself at dawn, even when no browser is open: the dashboard *server* does it (`lib/server/curtainAutomation.ts`, started from `instrumentation.ts`). Pure decisions live in `lib/curtainAuto.ts`; the tests (`lib/curtainAuto.test.ts`, `lib/server/curtainAutomation.test.ts`) use a fake Home Assistant and a fake clock, never the real one.

### How it works

- **Set it up**: select the curtain, link its sun-blocking layer to a Home Assistant `cover.*` entity. **Close it at dawn** is then on; **Open it again at** is optional (`HH:MM`, the server's local time).
- **Dawn** = civil dawn: the sun is rising and its elevation crosses -6 degrees (about 30 minutes before sunrise), read from `sun.sun`. If `sun.sun` has no elevation, the change from `below_horizon` to `above_horizon` (sunrise) is used.
- **Once a day**: each curtain is closed at most once per local calendar day (daylight-saving days included). It only acts when it *sees* the crossing, or when it looks for the first time in a while (a restart, an outage) and the sun is rising between -6 and +2 degrees and nothing has happened that day. A restart in mid-morning never re-closes a curtain you opened on purpose, and the rule never fights a manual open afterwards.
- **Open it again at**: only when the rule itself closed the curtain that day and that time is later than the closing. A curtain you closed by hand, or that was already closed at dawn, is never opened by the rule.
- It looks every minute (one read of `/api/states`). When Home Assistant is unreachable it backs off (1, 2, 4, 8, 15 minutes). A cover that is `unavailable` or `unknown` is left alone and tried again for 45 minutes after dawn; a call Home Assistant refuses is tried 3 times that day, then left.
- **What it remembers** (settings table, key `curtain-automation`, a few hundred bytes): per curtain, the day dawn was settled, when it closed it, and the last action shown in the inspector ("Closed automatically today at 05:12"). It writes this before it calls Home Assistant, so a database problem can never make an action repeat.

### What it never does

- Touch any entity other than the sun-blocking layer's own cover. It never touches the sheer layer or anything else.
- Call any service except `cover.close_cover` and `cover.open_cover`. Both go through the same validated allowlist as the buttons (`lib/haService.ts`, `lib/server/haCall.ts`).
- Use the *Reverse* switch of the layer: it only changes how the 3D curtain is drawn. "Close" means what Home Assistant calls closed.
- Act without `HA_URL` / `HA_TOKEN`, with the rule switched off, or on a plan with no such curtains (then it does not even ask Home Assistant).

### Turning it off

- One curtain: switch **Close it at dawn** off in the inspector (undoable like any change).
- Everything: set `HOUSEY_AUTOMATION=off` in `.env.local` and restart the server.

### After installing or changing the setup

`instrumentation.ts` is read once when the server starts: **restart `npm run dev` / `npm start`** after updating, and after changing `.env.local`. Until then the inspector says "The automatic part starts when the dashboard server is restarted." Changes to curtains in the plan are picked up within a minute, no restart needed. In development the server log shows `curtain automation: running ...` once at start and one line per action or problem (no tokens in it).

### Privacy

The server only talks to your own Home Assistant (`HA_URL`). Nothing is sent anywhere else, and the token never reaches the browser.

### Your server's clock

"Local time" and "today" are the dashboard server's own clock and time zone (`TZ`). Set `TZ` if the server runs in a container with another zone.

### API

`GET /api/automation/curtains` (same-origin) returns `{ items: { [itemId]: { at, action: "close" | "open" | "skip", why } }, running, off, haConfigured }`. `running` is false until the server has been started with the rule installed.
