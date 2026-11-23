"""Doshy: a sidebar panel that shows the Doshy dashboard inside Home Assistant."""

from __future__ import annotations

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant

from .const import (
    CONF_ICON,
    CONF_REQUIRE_ADMIN,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    DEFAULT_ICON,
    DEFAULT_TITLE,
    PANEL_URL_PATH,
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Register the sidebar panel. Changing the options reloads the entry (OptionsFlowWithReload), which registers it again."""
    options = entry.options
    async_register_built_in_panel(
        hass,
        "iframe",  # the frontend's built-in panel that shows a web page: the same one panel_iframe used
        sidebar_title=options.get(CONF_TITLE, DEFAULT_TITLE),
        sidebar_icon=options.get(CONF_ICON, DEFAULT_ICON),
        frontend_url_path=PANEL_URL_PATH,
        config={"url": entry.data[CONF_URL]},
        require_admin=options.get(CONF_REQUIRE_ADMIN, False),
        show_in_sidebar=options.get(CONF_SHOW_IN_SIDEBAR, True),
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the sidebar panel."""
    async_remove_panel(hass, PANEL_URL_PATH)
    return True
