"""Config flow and options flow for Doshy."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.config_entries import (
    SOURCE_RECONFIGURE,
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    IconSelector,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import (
    CONF_ICON,
    CONF_REQUIRE_ADMIN,
    CONF_SHOW_IN_SIDEBAR,
    CONF_TITLE,
    DEFAULT_ICON,
    DEFAULT_TITLE,
    DEFAULT_URL,
    DOMAIN,
)
from .urls import normalize_url

_LOGGER = logging.getLogger(__name__)

CHECK_TIMEOUT = aiohttp.ClientTimeout(total=10)

ADDRESS_SCHEMA = vol.Schema(
    {vol.Required(CONF_URL): TextSelector(TextSelectorConfig(type=TextSelectorType.URL))}
)

OPTIONS_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_TITLE, default=DEFAULT_TITLE): vol.All(str, vol.Length(min=1)),
        vol.Required(CONF_ICON, default=DEFAULT_ICON): IconSelector(),
        vol.Required(CONF_SHOW_IN_SIDEBAR, default=True): bool,
        vol.Required(CONF_REQUIRE_ADMIN, default=False): bool,
    }
)


async def _async_is_reachable(hass: HomeAssistant, url: str) -> bool:
    """Whether Doshy answers at this address (from Home Assistant's side; the browser has to reach it too)."""
    session = async_get_clientsession(hass)
    try:
        async with session.get(url, timeout=CHECK_TIMEOUT) as response:
            response.raise_for_status()
    except (aiohttp.ClientError, TimeoutError) as err:
        _LOGGER.debug("Doshy is not reachable at %s: %r", url, err)
        return False
    return True


class DoshyConfigFlow(ConfigFlow, domain=DOMAIN):
    """Ask for the Doshy address, check it answers, and create the entry."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """First setup."""
        return await self._async_address_step("user", user_input, {CONF_URL: DEFAULT_URL})

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Change the Doshy address of the existing entry."""
        return await self._async_address_step(
            "reconfigure", user_input, self._get_reconfigure_entry().data
        )

    async def _async_address_step(
        self,
        step_id: str,
        user_input: dict[str, Any] | None,
        suggested: Mapping[str, Any],
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            suggested = user_input
            try:
                url = normalize_url(user_input[CONF_URL])
            except ValueError:
                errors[CONF_URL] = "invalid_url"
            else:
                if not await _async_is_reachable(self.hass, url):
                    errors[CONF_URL] = "cannot_connect"
                elif self.source == SOURCE_RECONFIGURE:
                    return self.async_update_reload_and_abort(
                        self._get_reconfigure_entry(), data_updates={CONF_URL: url}
                    )
                else:
                    return self.async_create_entry(
                        title=DEFAULT_TITLE, data={CONF_URL: url}
                    )
        return self.async_show_form(
            step_id=step_id,
            data_schema=self.add_suggested_values_to_schema(ADDRESS_SCHEMA, suggested),
            errors=errors,
            description_placeholders={"example": "http://homeassistant.local:3000"},
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> DoshyOptionsFlow:
        """Create the options flow."""
        return DoshyOptionsFlow()


class DoshyOptionsFlow(OptionsFlowWithReload):
    """Sidebar title, icon, visibility and admin-only; the entry reloads to apply them."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the sidebar options."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(
                OPTIONS_SCHEMA, self.config_entry.options
            ),
        )
