# Alerts: when something in the house needs you

Doshy watches the sensors you have put on your plan. When one reports a real problem (a water leak, smoke, an alarm that went off, a door left open), a red or amber **banner** appears at the top, the **camera flies to that room**, and the floor of the room and the device **pulse red** until you answer. Nothing is sent to Home Assistant: alerts only read what Home Assistant already reports.

## What counts as an alert

Only things **linked on the plan** are watched: furniture linked to an entity in Home Assistant mode, doors and windows linked to a contact sensor, and a room's own presence sensors. A sensor nobody linked is ignored. A state of `unavailable` or `unknown` never alerts.

| What | When | Colour |
| --- | --- | --- |
| Water leak (`moisture` sensor) | it reads on | red |
| Smoke, gas, carbon monoxide | it reads on | red |
| An alarm panel that has gone off (`triggered`) | linked to the plan or not | red |
| Movement (motion, occupancy, presence, vibration sensors) | it reads on **while an alarm panel is armed away (or vacation) or has gone off**. "Armed home" and "armed night" ignore movement. | red |
| Door, window, garage door | open longer than the time you set (15 min to start with) | amber |
| A cover that is a garage door, door or gate | open longer than the same time (blinds and curtains never alert) | amber |
| Problem, safety or tamper sensors | it reads on | amber |

The room is found from where the device stands (an alcove counts as its room), from the wall a door or window is in, or from the room that lists the sensor. An alert with no room (a house alarm panel that is not on the plan) shows the banner but does not move the camera.

An alert goes away **by itself** the moment the sensor goes back to normal. If the same problem comes back later it is a new alert: banner, camera and note all happen again.

## What you can do with one

The banner has three buttons:

- **Acknowledge**: "I know". The banner, the pulse and the beep stop for this alert. It stays quiet until the problem clears and comes back.
- **Snooze 10 min**: hides it for ten minutes. If the problem is still there afterwards, it returns.
- **Details**: opens the room view and the device's card (the same card a tap on the device opens).

With several alerts waiting the banner says "1 of 3" and has arrows. The most serious comes first, newest first among equals. Acknowledged and snoozed alerts are remembered **on this screen only, until the page is reloaded**: a reload shows a problem that is still there again.

A short note also appears in the notification toast (the one the washing machine uses) when an alert starts and disappears when it clears. It is not stored in Home Assistant's notification list.

A serious alert also **wakes the screensaver** and leaves **cinema mode**, so it is never hidden behind them.

## Settings

**Menu > Settings > Display > Alerts** (saved with your other settings):

- **Focus the camera** (the default): banner + camera + red pulse.
- **Banner only**: only the banner. The camera and the 3D view are left alone.
- **Off**: nothing is shown.
- Under **Doors, windows and sound**: how long a door or window may stay open before it counts (5, 15, 30 or 60 minutes) and **Beep**.

The command palette (Ctrl/Cmd+K) has **Alerts: acknowledge all**, **Alerts: banner only**, **Alerts: focus the camera** and **Alerts: off**.

**Beep** (off by default): two short tones every 20 seconds while a serious alert waits. Browsers only allow sound after the page has been touched once, so on a wall display tap it once after it starts; until then the beep is skipped silently. Turning Beep on plays it once so you can hear it.

## When the camera moves, and when it does not

In Focus mode the camera flies to the room **once per alert**, with the normal Room view (it turns to face the room if "Turn to face the room" is on, and jumps without the swing for reduced motion). It never moves while you are:

- in Plan, Furniture or Home Assistant mode (you get the banner only),
- touching or dragging the 3D view, or with a dialog open,
- already in that room.

If you walk out of the room view yourself, it does not pull you back in.

## What it costs

| Graphics | Look | Cost |
| --- | --- | --- |
| Eco and Light | a **still** red outline round the room's floor, a ring and a thin beam at the device | nothing: no animation, the scene keeps idling |
| Balanced and up | the same plus a soft red fill that breathes about once a second | one small extra draw; the scene redraws only while an alert waits (glow only, no shadow pass) |
| Any tier with reduced motion on | the still outline | nothing |

The banner is plain solid colour with no blur and no animation at every tier. Acknowledging or snoozing removes the 3D part at once. The check itself runs at most once a second, only when the plan or a reading changed, and every 15 seconds for the clock-driven cases (a door crossing its time, a snooze ending).

On a small screen (800x480 and phones) the banner is one line with 44 px buttons under the top strip, never over the bottom bar; on a very narrow screen the buttons wrap to a second line. The room bar and the toast move down under it.

## Limits

- Only linked entities are watched; link a sensor to a piece of furniture (or a door/window, or a room's presence field) in Home Assistant mode.
- Movement is only counted while an alarm panel is armed away; Doshy does not guess whether anyone is home otherwise.
- Answers (acknowledge, snooze) are not shared between screens and do not survive a reload.
- Tested with plain node tests for the rules, not with a real Home Assistant, a Raspberry Pi or a phone.

## For developers

- `lib/alerts.ts`: pure `deriveAlerts(plan, states, now, cfg)`, settings validation. `lib/alertsQueue.ts`: pure lifecycle (`step`, `queueOf`, `acknowledge`, `snooze`) and the camera rule `focusTarget`. Tests: `lib/alerts.test.ts`, `lib/alertsQueue.test.ts`.
- `lib/alertsStore.ts`: the settings store (`housey-alerts`, via `dbStorage`), the queue and `startAlertEngine`.
- `components/ui/AlertBanner.tsx` (+ `alerts.css`), `AlertDriver.tsx` (camera, wake, toast, beep), `AlertSettings.tsx` (Display panel rows), `alertBeep.ts`; `components/scene/AlertFx.tsx` (the 3D pulse, mounted in Scene3D).
- While the banner shows, `html[data-alert]` is set and `--alert-h` holds its height; `alerts.css` uses them to move the room bar, the toast and the compact room strip.
