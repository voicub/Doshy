# Doshy card for Home Assistant dashboards

`doshy-card` shows your Doshy 3D home as a card on any Home Assistant dashboard: the whole house or one room, without menus. It is a custom card that ships with the Doshy integration (HACS), so there is nothing extra to download or register.

It is a frame around Doshy's own page, opened with `?embed=1` (see [Embed mode](#embed-mode-embed1)). Doshy itself has to be running and reachable from the browser that shows the dashboard.

## Add the card

1. Install the Doshy integration with HACS and set it up (steps B in [home-assistant.md](home-assistant.md)). **Restart Home Assistant after installing or updating**, then reload the browser page (a hard reload, or clear the app cache in the companion app).
2. Open a dashboard, **Edit dashboard > Add card**, search for **Doshy**. The visual editor has every option below.
3. Or in YAML (**Add card > Manual**):

```yaml
type: custom:doshy-card
```

That already works: it shows the plan your Doshy calls the home plan, at the address you gave the integration.

A fuller example:

```yaml
type: custom:doshy-card
title: Kitchen
view: room:Kitchen
plan: 2
height: 360
interactive: true
```

If the card does not appear in the picker, the integration is not loaded (Settings > Devices & services) or the page was not reloaded after a restart.

## Options

| Option | Default | What it does |
|---|---|---|
| `url` | the address the integration was set up with | Address of Doshy, `http://` or `https://`, no user name or password in it. Set it when the integration is not installed or the dashboard should use another address (for example an `https://` one, see below). |
| `plan` | the home plan | Which plan to show: the number in the plan's link (**Copy a link that opens this plan** in Doshy ends in `?plan=2`). Letters, digits, `-` and `_` only. See [plans.md](plans.md). |
| `view` | `3d` | `3d` or `overview`: the whole plan. `room:<name>`: only that room, found by name, upper or lower case does not matter (`room:Living Room`). A name that matches no room shows the whole plan. |
| `height` | `16/9` | Pixels (`400`, between 100 and 3000) or a width-to-height ratio (`16/9`, `4/3`). A ratio follows the card's width. |
| `kiosk` | `true` | `true`: only the 3D scene (embed mode). `false`: the whole Doshy app in the frame, with its menus. |
| `interactive` | `false` | `false`: view-only. Taps do nothing and touching the card scrolls the dashboard as usual. `true`: taps switch devices as in Doshy, and you can turn and zoom the house; on a touch screen the page no longer scrolls while your finger is on the card. |
| `theme` | `auto` | `auto` follows Home Assistant's dark or light theme and is checked again whenever it changes (the frame reloads then); `dark` or `light` forces one. Doshy's 3D scene is dark either way, so this changes nothing visible yet. |
| `title` | none | A heading above the scene. |

A wrong value (a plan with spaces, a view that is not `3d`, `overview` or `room:...`) shows a message in the card that says which setting to fix.

## What the card shows while it works

- A grey shimmer until Doshy has loaded.
- After 15 seconds without an answer: **Doshy did not answer at <address>**. Check that Doshy runs and that the device showing the dashboard can reach that address (a phone may not resolve `homeassistant.local`, use the IP address).
- **Mixed content** (see below) is explained in the card instead of showing a blank frame.

## https and http

A browser refuses to show an `http` page inside an `https` page. If you open Home Assistant over `https` (Nabu Casa, a reverse proxy) and Doshy is at `http://...:3000`, the card cannot show it and says so. Either:

- serve Doshy over `https` too (a reverse proxy in front of port 3000) and give the card that address in `url` (or change the integration's address with **Reconfigure**), or
- open the dashboard over `http`.

An `http` address on this very computer (`localhost`, `127.0.0.1`) is allowed by browsers and is not flagged.

Also, if a proxy in front of Doshy sends `X-Frame-Options: DENY` or a `frame-ancestors` policy, the frame stays empty: allow your Home Assistant address there.

## Embed mode (`?embed=1`)

Any page that can show a web page (an `iframe`, Home Assistant's Webpage card, a wall tablet) can use Doshy's embed mode by adding parameters to Doshy's address. Example: `http://doshy.local:3000/?embed=1&view=room:Kitchen&plan=2`.

| Parameter | Meaning |
|---|---|
| `embed=1` | Required, spelled exactly like this. Shows only the 3D scene: no panels, menu, dock, brand, toasts, alert banner or keyboard help. Being inside a frame is not enough. |
| `plan=<id>` | The plan to show. Without it, the home plan (not the plan this browser last used). |
| `view=overview` or `view=room:<name>` | The whole plan (default) or one room, matched by name without regard to case. |
| `interactive=1` | Taps switch devices. Without it the 3D view takes no pointer or touch input at all, so the page behind it keeps scrolling. |
| `theme=dark` or `light` | Accepted and ignored for now. |

What embed mode does and does not do:

- **Read-only.** It never saves anything: no plan or settings are written to the database, no plan picture is uploaded, no 3D models are sent, and no automation (such as the dawn curtain) runs from the frame. It does not change which plan your other devices show. Its own copy of the plan is kept in the frame's session storage, not in the browser storage the normal Doshy page uses. The only thing it can change is a device you switch with `interactive=1`.
- **Light.** It does not download the panels, the catalog or the editor, and works at every graphics quality, including Eco. The graphics quality is the one chosen in that browser.
- **Plan changes** made later in Doshy show after the frame reloads (the card reloads with the dashboard page). Device states keep updating.
- A small frame is treated like a small screen by Doshy's layout rules.
- The screensaver is hidden, but if you set a screensaver in Doshy's Display settings in the same browser it can still pause drawing after its idle time. Leave the screensaver off for a browser that shows cards.

## How it works

The integration serves `custom_components/doshy/www/` at `/doshy-card/` (no login is needed for those files, they hold no data) and adds `doshy-card.js?v=<version>` to every dashboard as a module, the same thing a Lovelace resource does, with no user step. The card asks the integration for its address with the websocket command `doshy/config`, which returns only the address that the sidebar panel already carries. The address-building rules live in `www/doshy-card-url.js`; the editor is `www/doshy-card-editor.js` and loads only when you edit the card.

Reloading the integration (changing its options) re-adds the module and does not register the file path twice; Home Assistant cannot unregister a path, so the files stay served until the next restart even if you remove the integration.

## What is verified

- The address rules (address checks, plan, view, height, theme, mixed content) and the embed address parsing have unit tests (`npm test`).
- The Python files compile (`python3 -m py_compile custom_components/doshy/*.py`).
- Registration follows the current Home Assistant source (`async_register_static_paths`, `add_extra_js_url`, a websocket command).

Not verified: the card has not been run in a real Home Assistant, and embed mode has not been driven in a browser by the author of this page. The editor's form, the picker entry, the card's behaviour in the masonry and sections layouts, the mixed-content message and the 15-second message are written from the frontend's documented behaviour. If something is off, please report it with your Home Assistant version and dashboard layout.
