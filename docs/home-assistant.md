# Home Assistant

One repository, `https://github.com/voicub/Doshy`, offers Doshy to Home Assistant in two ways. They work together:

| | What it is | Gives you |
|---|---|---|
| **Add-on** (`repository.yaml`, `doshy/`) | The Doshy server in a container that the Supervisor runs | Doshy itself, on port 3000, with no token to create |
| **Integration** (`hacs.json`, `custom_components/doshy/`) | Installed with HACS | A **Doshy entry in the sidebar** that shows Doshy inside Home Assistant, and a **Doshy card** for dashboards ([lovelace-card.md](lovelace-card.md)) |

HACS cannot install add-ons, so the add-on comes from the add-on store and the sidebar integration from HACS. Without Supervisor (Container or Core installs) run Doshy with Docker (C below) and still use the integration for the sidebar.

## A. Add-on (Home Assistant OS or Supervised)

1. **Settings > Add-ons > Add-on store**, menu **⋮ > Repositories**, paste `https://github.com/voicub/Doshy`, **Add**.
2. Open **Doshy** in the store, **Install**, **Start**, then **Open Web UI** (or `http://<home assistant host>:3000`).
3. Optional: **Configuration** tab (Sketchfab token, dawn curtain automation, your own satellite tiles). Restart the add-on after changing options.

The add-on reaches Home Assistant through the Supervisor (`http://supervisor/core`, with the add-on's own token); `ha_url` and `ha_token` are only for a Home Assistant somewhere else. Data (database, backups, imported models) lives in the add-on's `/data`, which Home Assistant backups include.

**No ingress.** Home Assistant's ingress serves an add-on under a path that is different per installation (`/api/hassio_ingress/<token>/`). Doshy is a Next.js app that uses absolute paths (`/_next/...`, `/api/...`) and fixes its base path when it is built, so it would need every URL rewritten on the way through. There is no cheap correct way, so ingress is off and the add-on uses a port with an **Open Web UI** button. The sidebar entry comes from the integration (B).

## B. Sidebar panel (HACS)

1. In HACS: **⋮ > Custom repositories**, URL `https://github.com/voicub/Doshy`, category **Integration**, **Add**.
2. Download **Doshy** and restart Home Assistant. Needs Home Assistant 2026.4 or newer.
3. **Settings > Devices & services > Add integration > Doshy.** Enter the address of Doshy (default `http://homeassistant.local:3000`). Home Assistant checks that it answers there.
4. **Configure** on the entry sets the sidebar title, icon, whether it shows in the sidebar, and whether only administrators see it. **Reconfigure** changes the address.

The integration registers a sidebar panel (Home Assistant's built-in `iframe` panel, at `/doshy`) and removes it on unload. It also serves the `doshy-card` Lovelace card and adds it to every dashboard (see [lovelace-card.md](lovelace-card.md): add a card, choose **Doshy**). It has no entities and no background work.

### Mixed content: https Home Assistant and http Doshy

A browser refuses to show an `http` page inside an `https` page. If you open Home Assistant over `https` (Nabu Casa, a reverse proxy), the panel shows an error instead of Doshy. Either:

- serve Doshy over `https` as well (a reverse proxy in front of port 3000, e.g. Nginx Proxy Manager or Caddy) and enter that `https://` address, or
- skip the sidebar and open Doshy directly (the add-on's **Open Web UI**, or `http://<host>:3000`).

The address you enter must work **in your browser** as well as from Home Assistant; `homeassistant.local` works only where your device resolves it, otherwise use the IP address.

## C. Docker or Portainer

Use `docker-compose.yml` from this repository (image `ghcr.io/voicub/doshy`; see the file for the stack variables). Set `HA_URL` (your Home Assistant address) and `HA_TOKEN` (a long-lived access token: your Home Assistant profile page, **Security** tab, bottom). Data is in the `housey-data` volume at `/data`.

The image is the same one the add-on uses. Its entrypoint starts as root only to fix the `/data` volume's ownership, then runs the server as the `node` user. When started by the Supervisor (add-on) it reads `/data/options.json` and defaults to the Supervisor's Home Assistant proxy.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Doshy opens but shows no live data ("HA_URL / HA_TOKEN not set") | Docker/Portainer: set both variables. Add-on: leave `ha_url` and `ha_token` empty, or fill in both. |
| Sidebar panel: "Unable to load iframes that load websites over http://..." | Mixed content, see above. |
| Sidebar panel is blank or refused | The address is not reachable from your browser (try the IP address), or a proxy in front of Doshy sends `X-Frame-Options: DENY` / a `frame-ancestors` policy: allow your Home Assistant origin. |
| Add-on page: Open Web UI does nothing | Port 3000 is taken by another add-on or service; change the host port under **Configuration > Network**. |
| "Doshy did not answer at this address" when adding the integration | Doshy is not running, the port is wrong, or Home Assistant cannot reach that host name (use the IP address). |
| Add-on update offered but cannot be downloaded | The version bump was published before its image finished building; wait for the **Build image** workflow. |

## What is verified

Checked on a development machine: the add-on and integration files parse (YAML, JSON, Python compile), the option-to-environment mapping and version sync have unit tests (`npm test`), the integration's address helper has a test (`python3 -m unittest discover -s tests`), the Docker image builds and starts with the entrypoint, in plain Docker mode and in simulated add-on mode (a mounted `options.json` and a dummy `SUPERVISOR_TOKEN`), and the page answers.

Read from the official documentation and source, but **not tested here**: installing from the add-on store with a real Supervisor (the proxy URLs `http://supervisor/core/api` and `ws://supervisor/core/api/websocket` were checked against the Supervisor's route table, not against a running one), installing and updating through HACS, the config flow and the panel in a running Home Assistant, and the GitHub workflows (nothing has run).

## More than one Home Assistant

`HA_URL` / `HA_TOKEN` (or the add-on's Supervisor proxy) stay the built-in Main home. Further homes are added in the app (Plans > Homes) and linked per plan: see [multi-home.md](multi-home.md). `DOSHY_ALLOW_CUSTOM_HA=0` switches adding them off.
