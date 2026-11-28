# Doshy add-on

## Install and start

1. Add the repository `https://github.com/voicub/Doshy` in **Settings > Add-ons > Add-on store > ⋮ > Repositories**.
2. Install **Doshy**, start it, and select **Open Web UI** (or browse to `http://<your Home Assistant host>:3000`).

With the default options nothing else is needed: the add-on reaches Home Assistant through the Supervisor with its own token.
Home Assistant's time zone is passed to the add-on by the Supervisor.

## Options

| Option | What it does |
|---|---|
| `ha_url` | Only for a Home Assistant somewhere else (e.g. `https://ha.example.com`). Leave empty on a normal installation. |
| `ha_token` | A long-lived access token (profile page, Security tab). Only together with `ha_url`. |
| `sketchfab_token` | Optional. Lets Doshy download real 3D car models. |
| `automation` | Dawn curtain automation (default on). Off: the sun-blocking curtains are never closed by themselves. |
| `site_tile_url`, `site_tile_max_zoom`, `site_tile_credit` | Optional. Your own satellite tile provider for the Surroundings photo (default: Esri World Imagery). |
| `nextzen_api_key` | Optional. A free key from developers.nextzen.org: lets Surroundings draw buildings and roads from the 3D city model (the Vectiler tool is already in the image). Tile positions around your home, rounded, are sent to Nextzen. |

Options are read when the add-on starts: restart it after changing them.

## Sidebar

This add-on does not use Home Assistant ingress: Doshy serves absolute paths (`/_next`, `/api`) and ingress moves an add-on to a different path per installation. It is reached on port 3000 instead.
To get a sidebar entry, install the Doshy integration with HACS (same repository, category *Integration*), which adds a panel that shows `http://<host>:3000`.
Home Assistant opened over `https` cannot show an `http` page in the sidebar: use the **Open Web UI** button, or put Doshy behind an https reverse proxy.

## Security

- Port 3000 has no login: anyone on your network can open Doshy and, through it, control what the add-on's Home Assistant access allows. Do not forward it to the internet; put it behind a reverse proxy with authentication if you must.
- `homeassistant_api` gives the add-on administrator access to Home Assistant through the Supervisor (needed to read states and call services).

## Backups

The add-on is stopped while Home Assistant backs it up (the database is copied as a whole). The map cache (`site-cache`) is left out and downloaded again when needed.

## Support

Issues: https://github.com/voicub/Doshy/issues
