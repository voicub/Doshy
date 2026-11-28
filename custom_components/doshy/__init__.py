"""Doshy: a sidebar panel that shows the Doshy dashboard inside Home Assistant, and a Lovelace card (doshy-card) that shows it on a dashboard."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import (
    add_extra_js_url,
    async_register_built_in_panel,
    async_remove_panel,
    remove_extra_js_url,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import (
    CARD_MODULE,
    CARD_URL_BASE,
    CONF_ICON,
    CONF_REQUIRE_ADMIN,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    DEFAULT_ICON,
    DEFAULT_TITLE,
    DOMAIN,
    PANEL_URL_PATH,
    WS_CONFIG,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Once per Home Assistant run: serve the card's files and answer the card's question for the Doshy address.

    This is not done per config entry: a static path can be registered once only (and never removed), and the
    options flow reloads the entry, which would register it again.
    """
    await hass.http.async_register_static_paths(
        # No long cache: the browser asks again and gets the new card after an update (the module's own address carries the version as well)
        [StaticPathConfig(CARD_URL_BASE, str(Path(__file__).parent / "www"), cache_headers=False)]
    )
    websocket_api.async_register_command(hass, _ws_config)
    return True


@callback
@websocket_api.websocket_command({vol.Required("type"): WS_CONFIG})
def _ws_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The address Doshy was set up with: what the card shows when it has no url of its own. The sidebar panel's config holds the same address."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Doshy is not set up")
        return
    connection.send_result(msg["id"], {"url": entries[0].data[CONF_URL]})


def _card_module_url(version: object) -> str:
    """The card's address with the integration version on it, so a new version is fetched at once."""
    return f"{CARD_URL_BASE}/{CARD_MODULE}?v={version or 0}"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Register the sidebar panel and the card. Changing the options reloads the entry (OptionsFlowWithReload), which registers them again."""
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
    integration = await async_get_integration(hass, DOMAIN)
    add_extra_js_url(hass, _card_module_url(integration.version))  # a set: adding the same address again changes nothing
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the sidebar panel and the card module (the served files stay until Home Assistant restarts)."""
    async_remove_panel(hass, PANEL_URL_PATH)
    integration = await async_get_integration(hass, DOMAIN)
    remove_extra_js_url(hass, _card_module_url(integration.version))
    return True
