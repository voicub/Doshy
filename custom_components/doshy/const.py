"""Constants for the Doshy integration."""

from __future__ import annotations

DOMAIN = "doshy"

# The sidebar panel lives at /doshy. One config entry only (manifest: single_config_entry), so the path never collides with itself.
PANEL_URL_PATH = "doshy"

# The Lovelace card (www/doshy-card.js): its files are served under CARD_URL_BASE, and the integration adds the module to every dashboard.
CARD_URL_BASE = "/doshy-card"
CARD_MODULE = "doshy-card.js"
WS_CONFIG = "doshy/config"

CONF_TITLE = "title"
CONF_ICON = "icon"
CONF_SHOW_IN_SIDEBAR = "show_in_sidebar"
CONF_REQUIRE_ADMIN = "require_admin"

# Doshy's own default port (docker-compose.yml, the add-on). The Home Assistant host name is the usual place it runs.
DEFAULT_URL = "http://homeassistant.local:3000"
DEFAULT_TITLE = "Doshy"
DEFAULT_ICON = "mdi:floor-plan"
