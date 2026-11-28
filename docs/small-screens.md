# Small screens: a 7 inch Raspberry Pi wall display (and a phone)

Doshy has a layout made for small touch screens (800x480, 1024x600, 1280x800 and phones). This page shows how to turn a Raspberry Pi with a 7 inch touch display into an always-on wall dashboard, and what to set in the app.

> **What was and was not tested.** The app side (layouts, Display settings, screensaver, wake lock code, manifest) was tried in a desktop Chromium with a screen size and touch emulated. **No Raspberry Pi hardware was available**, so everything about the Pi itself (the commands, file names and flags below, GPU speed, the real touch screen, the on-screen keyboard) comes from documentation and common practice and is **unverified here**. Flags and paths are marked "verify" where they change between Raspberry Pi OS and Chromium versions. Run `chromium --help`-style checks and `chrome://version`, `chrome://gpu` on your Pi before trusting any of it.

## 1. The best set-up: the server on another machine

Doshy has two parts: the **server** (`npm start`; talks to Home Assistant, keeps your plan in `data/housey.db`) and the **browser** that draws the 3D home. The server is light. The browser is the heavy part, and it is the only part that has to run on the Pi.

- **Recommended:** run the server on a machine that is always on (a NAS, mini PC, a second Pi, the machine that runs Home Assistant) and open it from the Pi: `http://<server>:3000/?kiosk=1`.
- **Pin the wall display to one plan** (if you keep several plans): add `&plan=<id>` to the address, e.g. `http://<server>:3000/?kiosk=1&plan=2`. The easiest way to get it is **Plans** in the menu, **More** on the plan's card, **Copy a link that opens this plan**. See [plans.md](plans.md).
- **Possible:** run both on the Pi. A Pi 5 (4 GB or more) copes; on a Pi 4 expect the build to take a long time and the 3D view to be slow. Build once, then `npm start`.

### Run the server

You need a recent Node.js: Doshy uses Node's built-in `node:sqlite`, so Node **22.13 or newer** (24 is fine).

```bash
git clone https://github.com/voicub/Doshy.git doshy && cd doshy
cp .env.example .env.local        # set HA_URL and HA_TOKEN; they stay on the server
npm install
npm run build
npm start                         # http://<server>:3000   (npm start -- -p 8080 changes the port)
```

As a service that starts at boot (systemd, example, change the paths and user):

```ini
# /etc/systemd/system/doshy.service
[Unit]
Description=Doshy dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=doshy
WorkingDirectory=/home/doshy/doshy
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now doshy
journalctl -u doshy -f            # logs
```

Back up `data/` (see "Your data" in the README).

## 2. Set up the Pi

Start from **Raspberry Pi OS (Bookworm, 64-bit) with desktop**. Bookworm runs a Wayland desktop: **labwc** on current images, **Wayfire** on the first Bookworm images (verify which one you have: `echo $XDG_CURRENT_DESKTOP`, or look in `~/.config` for a `labwc` or `wayfire.ini`). Pi OS before Bookworm, and Pi 3 and older, use X11 and different autostart files; this page does not cover them.

1. Log in with auto-login to the desktop (`sudo raspi-config` > System Options > Boot / Auto Login > Desktop Autologin).
2. Update: `sudo apt update && sudo apt full-upgrade` (Chromium and the Mesa graphics driver improve a lot between versions; keep them current).
3. Give the 3D view a chance: use the 64-bit OS, an official power supply, and cooling (a Pi 5 with a heat sink or fan; a throttled Pi is a slow Pi, check with `vcgencmd get_throttled`, `0x0` is good).

### Screen size and rotation

- The official **Raspberry Pi 7" Touch Display** is 800x480 (landscape). The newer **Touch Display 2** is a 720x1280 panel that is normally turned to landscape (1280x720). Other 7 inch HDMI panels are commonly 1024x600 or 1280x800.
- Rotate from the desktop's own *Screen Configuration* tool (Preferences), or from a terminal on Wayland with `wlr-randr` (run `wlr-randr` alone to list the output names, for example `DSI-1` or `HDMI-A-1`):

  ```bash
  wlr-randr --output DSI-1 --transform 90      # 0, 90, 180, 270 (verify the output name)
  ```

  To keep it after a reboot, put the same line in the autostart file below, before Chromium starts.
- **Touch must turn with the picture.** On labwc, map the touch device to the output in `~/.config/labwc/rc.xml` (verify the element and your device name with `libinput list-devices`):

  ```xml
  <touch deviceName="your touch device name" mapToOutput="DSI-1"/>
  ```

  If taps land in the wrong place after rotating, this is the cause. On Wayfire the equivalent is in `~/.config/wayfire.ini`.

### Start Chromium full screen at boot

Doshy is a web page; Chromium in kiosk mode is the "app". Make a start script, for example `~/doshy-kiosk.sh`:

```bash
#!/bin/bash
# Waits for the server, then keeps Chromium running: if it ever crashes or is closed it starts again.
URL="http://doshy.local:3000/?kiosk=1"        # your server; ?kiosk=1 switches the kiosk behaviours on
until curl -fsS -o /dev/null "$URL"; do sleep 3; done
while true; do
  chromium \
    --kiosk "$URL" \
    --noerrdialogs --disable-infobars --no-first-run \
    --disable-session-crashed-bubble \
    --password-store=basic \
    --disable-features=OverscrollHistoryNavigation --disable-pinch \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000
  sleep 5
done
```

`chromium` is the command on current images; older Bookworm images call it `chromium-browser` (verify with `which chromium chromium-browser`). `chmod +x ~/doshy-kiosk.sh`.

Run it at login:

- **labwc:** add a line to `~/.config/labwc/autostart` (create the file if it is missing): `~/doshy-kiosk.sh &`
- **Wayfire:** in `~/.config/wayfire.ini`, section `[autostart]`: `doshy = /home/<you>/doshy-kiosk.sh`

What the flags do (all are standard Chromium switches; their effect still depends on your Chromium version, verify with `chrome://version` and the command line shown there):

| Flag | Why |
| --- | --- |
| `--kiosk` | Full screen, no address bar, no tabs. |
| `--noerrdialogs`, `--disable-infobars`, `--disable-session-crashed-bubble`, `--no-first-run` | No pop-ups after a power cut or crash. |
| `--password-store=basic` | Stops the "unlock keyring" prompt on a desktop without a keyring. |
| `--disable-features=OverscrollHistoryNavigation` | A swipe in from the screen edge does not go "back" (the older `--overscroll-history-navigation=0` is not in the current Chromium switch list). |
| `--disable-pinch` | Chromium's compositor does not pinch-zoom the page on a touch screen (Doshy's 3D view still handles its own pinch). |
| `--autoplay-policy=no-user-gesture-required` | Camera and media cards may start by themselves. |
| `--check-for-update-interval=31536000` | Do not nag about browser updates. |

**Pull to refresh:** Doshy sets `overscroll-behavior: none` on the page, which stops it; `--disable-pull-to-refresh-effect` removes the effect in Chromium itself. **If taps do nothing** try adding `--touch-events=enabled` (the default `auto` turns touch events on when a touch screen is attached). **If you want a bigger interface** without touching the app: `--force-device-scale-factor=1.25` (or use Display > Interface size inside Doshy, section 3). **Smooth scrolling:** `--disable-smooth-scrolling` (listed by Chromium as a testing switch) makes panel scrolling follow the finger exactly with less work per frame, but flick scrolling loses its easing; try it only if scrolling feels laggy on your Pi. **Cursor:** hide it with labwc's `HideCursor` action (see the TOLDOTECHNIK kiosk script for a working `rc.xml` + autostart recipe) or `unclutter` on X11.

### Graphics: what to expect, what to try

The 3D view uses WebGL. A Pi's graphics chip is small, so the **Graphics** setting matters more here than anywhere else. The single most likely reason for "awful" speed is that the browser is drawing the 3D view **in software** (on the processor) instead of on the graphics chip.

1. **Check the GPU.** Open **Menu > Settings > Graphics**: it names the graphics chip (a Pi shows `V3D ...`) and shows a red **Software rendering: turn on GPU acceleration** line when the chip is `llvmpipe` or `SwiftShader`. In Chromium, `chrome://gpu` should say **WebGL: Hardware accelerated** and `GL_RENDERER: ANGLE (Broadcom, V3D ...)`. Doshy then also draws Eco lighter on its own when it sees software rendering (no multisampling, no sun shadows, 75 % render size: about 3x the frame rate in a software-GL test).
2. **Raspberry Pi OS Chromium needs no GL flags.** A Pi 5 report on Bookworm (labwc, Chromium 138) shows the package already starts with `--use-angle=gles --ignore-gpu-blocklist --enable-gpu-rasterization --ozone-platform=wayland` and `WebGL: Hardware accelerated` ([raspberrypi/bookworm-feedback #414](https://github.com/raspberrypi/bookworm-feedback/issues/414)). Do not add them again; check `chrome://version` for the command line.
3. **Software GL anyway?** Update (`sudo apt full-upgrade`, reboot); make sure the kiosk user is in the `video` and `render` groups (`groups`; without them the Pi's GPU driver is invisible and only `llvmpipe` appears); on a Pi 4 use the KMS driver (`dtoverlay=vc4-kms-v3d` in `/boot/firmware/config.txt`, the Bookworm default). The old `gpu_mem` split does not matter with KMS. On a Chromium that does not set them (Debian/Ubuntu/DietPi builds) the flags above are what Raspberry Pi OS uses; add them one at a time: `--ignore-gpu-blocklist` first (a Raspberry Pi engineer needed it for WebGL), then `--use-angle=gles`, `--enable-gpu-rasterization`. `--enable-zero-copy` and `--use-gl=angle` are real switches but **unverified on a Pi here**. `--disable-software-rasterizer` makes a missing GPU an error instead of a slow picture, handy for testing.
4. **Graphics tier.** Choose **Eco** if it is not already chosen. Automatic starts from the device's tier and lowers the detail when the picture stutters, but never raises it; a tier you picked yourself is never changed. Eco on a Pi also drops the HUD's blur, glows, endless pulses, the rain overlay and the scanline layer, and draws things that move by themselves (a spinning fan, rain) at 10 pictures a second, and nothing at all while a finger scrolls a panel.
5. Doshy stops drawing the 3D view while the screensaver is showing (below), which is the biggest saving for a screen that is on all day.

**What was measured** (desktop Chromium, 800x480, CPU throttled 6x, the maintainer's 109-item plan, a dehumidifier fan running; relative numbers only, **not Pi fps**): the scene drew 18.6 pictures a second at 97 % main-thread load when nothing was touched, 10 at 43 % after these changes; CSS style recalculations in that state went from 148 to 0, long tasks from 46 (3.4 s) to 5 (0.6 s). **Not verified on real hardware:** all of it on a Pi's own GPU and Chromium.

### On-screen keyboard

The app has no hardware keyboard on the wall. Bookworm's Wayland desktop ships an on-screen keyboard (*squeekboard*). For it to appear when a text box is tapped, Chromium has to talk to it: current Chromium needs `--enable-wayland-ime` for that (**unverified here: check it on your image**; if it does not pop up, install and start another one such as `wvkbd` and show it from a launcher). While the keyboard is up, Doshy hides the dock so the text box stays visible. Most day-to-day use needs no typing.

## What the compact screen looks like

Small and tiny screens (800x480, 1024x600, phones) get their own layout instead of a shrunk desktop one:

- **One top strip**: status dot, time, outside and inside temperature, power, lights on, an open-window alert, calendar, notifications and the Menu button. Tapping the numbers opens "House now". On a narrow strip the less important items drop out by themselves.
- **A bottom bar** with the four modes and **More**, and a **room strip** (a column on the left in landscape, a swipe row in portrait).
- **Menu** (top-right icon, or More) holds everything else: the mode's actions, Statistics, Energy, Climate, Media, Calendar, Notifications, the scene and sky choices (layer, levels, surroundings, cut-away, tidy labels, cinema, time, weather, wind, season, holidays) and Settings (Data, Graphics, Search, Display, shortcuts).
- **One panel at a time.** Esc, Close, a tap outside, or a swipe down (portrait) or right (landscape) closes it.
- **Cinema mode** shows an Exit button after any touch, so no keyboard is needed.
- In **kiosk mode** (`?kiosk=1`) the developer-style rows (Entities, Search, Shortcuts) are hidden and the cursor is off.

## 3. Settings in the app (Display)

Open **Menu > Settings > Display**. Everything is saved **on that screen's browser**, so set it up once on the Pi.

| Setting | What it does |
| --- | --- |
| **Layout** | Auto picks the compact layout on small screens and the full one on large screens. Compact and Regular force one. |
| **Interface size** | Small, Normal, Large, Extra large: bigger buttons and text for a small or very sharp screen (1280x800 on 7 inches is tiny at Normal). The 3D view itself is not scaled. |
| **Full screen** | Hides the browser's bars. Not shown in a kiosk window (already full screen). On an iPhone use Add to Home Screen instead. |
| **Turn to face the room** | On by default. Entering a room (Room mode) swings the camera to the corner that shows the room best before it centres and zooms; Off keeps your angle and only centres and zooms. |
| **Keep screen on** | Asks the browser not to let the display sleep (the Screen Wake Lock). On by default in a kiosk. **It only works on `https://` or `localhost`.** On a plain `http://server:3000` address the browser does not offer it and the panel says so; use the system setting below instead. |
| **Screensaver** | After 2, 5, 15 or 30 minutes without a touch the screen goes dark and shows the time, the room temperature and your next event; the 3D view stops drawing. Any touch wakes it. In a kiosk it defaults to 15 minutes. "Dark only" skips the clock. |

A page counts as a **kiosk** when it is opened with `?kiosk=1`, or runs full screen / as an installed app. That turns on the wall-display defaults (Keep screen on, 15 minute screensaver) and hides browser-only things.

**Keeping the screen on at the system level** (needed on plain http, and a good belt and braces anyway). In `sudo raspi-config` go to Display Options > Screen Blanking and switch it off (the non-interactive form is `sudo raspi-config nonint do_blanking 1`; **verify** it took effect by waiting past your old blanking time). If the screen still goes black, your desktop has its own idle setting: look for `swayidle` in the autostart files (`/etc/xdg/labwc/autostart`, `~/.config/labwc/autostart`) and remove or lengthen it.

Dimming at night: the official DSI display has a backlight you can set from a script or a cron job (the name differs per display; run `ls /sys/class/backlight/`):

```bash
echo 30 | sudo tee /sys/class/backlight/<name>/brightness     # 0..255 on the official display
```

Switching an output completely off with `wlr-randr --output DSI-1 --off` also works, but a screen that is off may not wake on touch; test it before you rely on it. The in-app screensaver is the safer way to "turn it down" and needs no scripts.

## 4. Phone (occasional use)

- Open `http://<server>:3000` in the phone browser. The compact layout (portrait and landscape) is picked automatically; pinch and drag work in the 3D view.
- **Add to Home screen** (share menu on iPhone, the browser menu on Android) gives a full-screen app with its own icon. The manifest (`app/manifest.ts`) and the icons in `public/` are what the phone reads. On Android, Chromium offers a real "Install" only on `https://`; on plain http you get a shortcut that opens in the normal browser. On iPhone, Add to Home Screen works on http. **Not tested on real phones here.**

## 5. Security for an unattended display

The dashboard can switch lights, locks and anything else you linked in Home Assistant, and **it has no sign-in** (see the README). A wall display is a screen anyone in the room can touch, so:

- **Keep it on your home network.** Do not forward a port from the internet to it. For remote access use a VPN (WireGuard or Tailscale) or a reverse proxy that signs people in.
- The Home Assistant token lives only in `.env.local` on the server; the Pi's browser never has it. Give the token its own HA user with only the devices you want to expose, if you can.
- Kiosk mode hides the address bar, but a USB keyboard still has shortcuts. Treat the Pi as touchable by anyone who can reach its USB ports and SD card. Do not leave a spare keyboard plugged in; put the Pi inside the frame.
- Pi hardening: change the default password, use SSH keys and turn password logins off, enable automatic security updates (`sudo apt install unattended-upgrades`), and keep the Pi and the server on the same trusted VLAN or at least behind the router's firewall.
- Anything you save in the 3D editor from the wall display is saved to the server like any other change (Undo works). If children can reach it, consider that the Plan, Furniture and Home Assistant modes are editors.

## 6. Keeping it up for months

- Chromium can slowly grow in memory. The start script above restarts it if it quits; add a nightly restart from cron if you see slowdowns: `0 4 * * * pkill -o chromium` (the loop starts a fresh one 5 seconds later; verify the process name with `pgrep -a chrom`).
- Use a good power supply and a decent SD card (or boot from SSD on a Pi 5). Hard power cuts are the main cause of a broken SD card.
- After a power cut the Pi may be up before the network or the server: the script waits for the server before opening the page.
- The page keeps working if the server is briefly down: edits wait in the browser and are sent when it is back (see the README, "Server down").
- **Offline shell:** over https (or with the Chromium flag in the troubleshooting table below) the Pi keeps a copy of the app and the last known states, and shows them with an "Offline" chip when Wi-Fi or the server is down. Over plain `http://` no service worker registers. See [offline.md](offline.md); **unverified on a Pi here**.

## 7. Troubleshooting

| What you see | Try |
| --- | --- |
| The 3D picture is **black** or disappears after a while | WebGL lost its context (the GPU ran out of memory or reset). Reload (F5 on a keyboard, or restart Chromium). Then pick **Eco** in Graphics, make sure `chrome://gpu` shows hardware WebGL, update the OS, and remove any experimental GL flags. |
| It is **slow or stutters** | Graphics > **Eco**. Run the server on another machine. Turn off the Declutter switch if the room has very many devices. Check cooling (`vcgencmd get_throttled`). |
| Everything is **too small** | Display > Interface size > Large / Extra large. |
| **Taps land in the wrong place** | After rotating the screen the touch matrix must rotate too (section 2). |
| The **screen goes black** after some time | System blanking (section 3), or on plain http the wake lock is not available. |
| The text boxes **disappear behind the keyboard** or the keyboard never shows | Section 2, on-screen keyboard. |
| **Keep screen on** says it is not available | The page is on plain `http://`. Use the system setting, or serve the page over `https://`. (For a test only, Chromium has `--unsafely-treat-insecure-origin-as-secure=http://<server>:3000` together with `--user-data-dir=<a folder>`; that weakens the browser's security checks, so do not use it on a general-purpose profile.) |
| A list will not **scroll with a finger** | Swipe on the list itself, not on a slider or on the ring of the thermostat dial: those take sideways drags (the middle of the dial scrolls the panel). On a panel that still will not scroll, note which one and the screen size, and see "Scrolling and touch" below. |
| "Home Assistant unreachable" banner | The server cannot reach Home Assistant: check `HA_URL` and `HA_TOKEN` in `.env.local` on the server and its logs (`journalctl -u doshy`). |

## For developers

- Layout classes: `<html data-vp="tiny|small|regular" data-orient data-coarse data-kiosk>` (`lib/viewport.ts`, `components/ViewportClass.tsx`); CSS reads them (`html[data-vp="tiny"] .x { ... }`), JS reads `useVp()`.
- `data-ui-size` and `--ui-scale` on `<html>`: the HUD (`.chrome`) is zoomed by `--ui-scale` (`app/kiosk.css`). Inside the zoomed HUD raw `vw`/`vh` count the zoom twice: use `calc(100 * var(--vh))`, and for popovers placed in pixels use `hudViewport()` and `x / hudScale()` from `lib/displayStore.ts`. The layout class is chosen from the screen as the zoomed HUD sees it (1024x600 at Large behaves like 819x480).
- `data-kbd-open="1"` while the on-screen keyboard is up (hide docks with it); `data-saver` while the screensaver shows; the `housey:idle` window event (`detail: { idle: boolean }`) fires when it starts and stops. The 3D view listens to it to pause drawing.
- Text fields get `autocomplete=off`, `spellcheck=false`, a sensible `enterkeyhint` and no auto-capital on search and number boxes from one global handler (`fieldHints` in `lib/keyboard.ts`, applied by `components/KioskTouch.tsx`); a field that sets its own attribute keeps it.
- Pure logic with tests: `lib/display.ts` (sizes, defaults, validation), `lib/idle.ts` (idle timer), `lib/wakeLock.ts` (wake lock with an injected API), `lib/keyboard.ts` (keyboard detection, field hints), `lib/tapSlop.ts` (tap or drag, by pointer type), `lib/scrollParent.ts` (the element a finger scrolls).

### Scrolling and touch

- **The page never scrolls.** `html, body` are `overflow: hidden` with `overscroll-behavior: none` (`app/kiosk.css`), the 3D canvas has `touch-action: none` and owns its gestures, the HUD (`.chrome`) has `touch-action: pan-x pan-y` (no pinch-zoom). A panel's own scroller scrolls natively (JavaScript only moves one with `scrollIntoView` when a selection moves) and no `touchstart` / `touchmove` listener calls `preventDefault`.
- **A panel body that scrolls** is `flex: 1; min-height: 0; overflow-y: auto` inside a flex column that has a definite height, and its class goes in the one list in `app/kiosk.css` ("Finger scroll surfaces"), which gives it `position: relative` and `overscroll-behavior: contain`. `position: relative` matters: a `.sr-only` control or file input inside the body would otherwise be positioned against the panel and make the panel scroll as well as its body.
- **Never put `overscroll-behavior` on `*` or on a wrapper with `overflow: hidden`.** Chromium treats an `overflow: hidden` box as a scroll container: with `contain` a swipe that starts on anything inside it stops there and the real scroller above never moves (the catalog went dead that way).
- **`touch-action: none` only on the handle**: the thermostat ring (the dial's centre scrolls the panel), the plan/3D canvas, the piece previews. A seek bar is `pan-y`: sideways scrubs, vertical swipes scroll. A sheet header that swipes to close is `pan-y` in landscape (the swipe is sideways) and `none` in portrait (the swipe is down): the browser cancels a pointer as soon as it starts panning in a direction `touch-action` allows.
- **Do not act on `pointerdown` in a scroll list.** Act on release (`click`, or `pointerup` after a movement check), so a finger that starts scrolling over a button does nothing. A press that wanders counts as a tap within `lib/tapSlop.ts`: 15 px for a finger (what Chromium itself allows for a click), 10 for a pen, the old 6 for a mouse.
- **A "load more" `IntersectionObserver` takes the real scroller as `root`**, found with `lib/scrollParent.ts`: on a compact screen the sheet scrolls and the card grid is as tall as its cards, so a grid root made every sentinel "visible" and all 1,100 catalog cards mounted at once.
- **Do not scroll an item into view from an effect that depends on a list that is rebuilt** (it pulls the list back under the finger); scroll when the selection or the query changes.
- **Class names are global**: the Display modal used `.dp`, `.dp-body` and `.dp-sec`, which the Data panel also owns; its two-column rule turned the Data body into a sideways scroller on a short landscape screen. The Display modal is `.disp*` now.
