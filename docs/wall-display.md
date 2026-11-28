# Wall display: a slideshow for a screen on the wall

When nobody has touched the screen for a while, Doshy can show a calm slideshow of your home instead of the dark screensaver. It is meant for a Raspberry Pi with a touch display (see [small-screens.md](small-screens.md)), but works on any screen.

## Turn it on

**Display** (in the menu) > **Wall display** > **On**. Everything is saved on this device only.

| Setting | What it does |
| --- | --- |
| Start after | Minutes with no touch before the slideshow starts. **Always** starts at once and comes back a minute after each touch. |
| Show | Which slides: the whole home turning slowly, a tour of the rooms, clock and weather, house now. At least one stays on. |
| Seconds per slide | How long each slide stays (8 to 60). A room is always shown for 8 to 12 seconds. |
| Dim at night | Darkens the slideshow while the sun is down. |
| Protect the screen | Moves the picture by a few pixels every minute, so a fixed clock never burns into the panel. |
| Try it now | Starts the slideshow at once, to see it. |

While the wall display is on it replaces the dark screensaver.

## The slides

- **Whole home**: the 3D home, turning slowly, one quarter turn per slide (from each of the four corners).
- **Room tour**: each room on its own, with a one-line summary of what is on in it. Open-plan spaces count as one.
- **Clock and weather**: a big clock, the date and the weather.
- **House now**: energy, open windows and doors, who is home and the next calendar event.

Slides change with a short fade through black. With **reduced motion** (system setting) they switch at once and the home does not turn.

## Alerts and touch

- An active alert (see [alerts.md](alerts.md)) takes the screen at once, whatever slide is up, and stays until it is answered. With several alerts they take turns. When they are gone the slideshow carries on from where it was.
- **Any touch, key or mouse move** leaves the slideshow immediately and restarts the idle time.

## Cost on a small computer

- On **Eco** the turning home is drawn at the ambient rate (about 10 frames a second) and the room tour uses plain jump cuts. The clock, weather and house slides draw no 3D at all.
- The 3D view stops drawing behind a slide that covers it.

## Switching the screen off at night (Raspberry Pi)

A browser cannot switch a display off. Do it from the system:

```bash
# X11 (older Raspberry Pi OS): blank / wake the display
xset dpms force off
xset dpms force on

# Wayland (Bookworm, labwc/wayfire): turn an output off / on (find the name with `wlr-randr`)
wlr-randr --output HDMI-A-1 --off
wlr-randr --output HDMI-A-1 --on
```

Run them from `cron` at your bedtime and wake time. Touching the screen of a display that is off does not reach the page, so schedule the wake time.

## What is verified

Pure rules (slide order, timing, alert pre-emption and resume, night dimming, pixel shift) have unit tests (`lib/rotation.test.ts`, `lib/wall.test.ts`, `lib/wallFacts.test.ts`). The look and feel was checked in a desktop browser; it was not run on a Raspberry Pi.
