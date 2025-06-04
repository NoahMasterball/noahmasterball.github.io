"""Config flow for Nanoleaf Essentials integration."""
import asyncio
import aiohttp
import async_timeout
import logging
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_HOST,
    CONF_TOKEN,
    API_NEW_TOKEN_URL,
    DEFAULT_PORT,
    API_TIMEOUT,
    ERROR_CANNOT_CONNECT,
    ERROR_INVALID_AUTH,
    ERROR_TIMEOUT,
    ERROR_UNKNOWN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema({
    vol.Required(CONF_HOST): cv.string,
})

async def validate_input(hass: HomeAssistant, data: dict) -> dict:
    """Validate the user input allows us to connect."""
    host = data[CONF_HOST]
    
    # Test TCP connection on port 16021
    try:
        # Simple TCP connection test
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, DEFAULT_PORT),
            timeout=5
        )
        writer.close()
        await writer.wait_closed()
    except (OSError, asyncio.TimeoutError):
        raise InvalidHost
    
    return {"title": f"Nanoleaf Essentials ({host})"}

async def get_api_key(host: str) -> str:
    """Get API key from Nanoleaf device."""
    url = API_NEW_TOKEN_URL.format(host=host)
    
    try:
        async with async_timeout.timeout(API_TIMEOUT):
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    _LOGGER.debug(f"API key request to {url}, status: {response.status}")
                    
                    if response.status == 200:
                        # Get response as text first (like your MicroPython script)
                        text = await response.text()
                        _LOGGER.debug(f"Raw response: {text}")
                        
                        # Extract JSON from response (like extract_json in your script)
                        json_start = text.find('{"auth_token"')
                        json_end = text.find('}', json_start) + 1
                        
                        if json_start != -1 and json_end > json_start:
                            json_str = text[json_start:json_end]
                            _LOGGER.debug(f"Extracted JSON: {json_str}")
                            
                            try:
                                import json
                                data = json.loads(json_str)
                                api_key = data.get("auth_token")
                                if api_key:
                                    _LOGGER.info(f"Successfully got API key: {api_key}")
                                    return api_key
                                else:
                                    _LOGGER.error("No auth_token found in JSON")
                                    return ""
                            except json.JSONDecodeError as e:
                                _LOGGER.error(f"Failed to parse extracted JSON: {e}")
                                return ""
                        else:
                            _LOGGER.error("Could not find auth_token JSON in response")
                            _LOGGER.error(f"Full response: {text[:500]}")
                            return ""
                    else:
                        text = await response.text()
                        _LOGGER.error(f"HTTP {response.status} error. Response: {text[:200]}")
                        return ""
                        
    except asyncio.TimeoutError:
        _LOGGER.error(f"Timeout getting API key from {host}")
        return ""
    except Exception as e:
        _LOGGER.error(f"Unexpected error getting API key from {host}: {e}")
        return ""

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Nanoleaf Essentials."""

    VERSION = 1

    def __init__(self):
        """Initialize the config flow."""
        self.host = None
        self.token = None

    async def async_step_user(self, user_input=None) -> FlowResult:
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
                self.host = user_input[CONF_HOST]
                
                # Check for existing entry
                await self.async_set_unique_id(self.host)
                self._abort_if_unique_id_configured()
                
                return await self.async_step_link()
                
            except InvalidHost:
                errors["base"] = ERROR_CANNOT_CONNECT
            except Exception:
                _LOGGER.exception("Unexpected exception")
                errors["base"] = ERROR_UNKNOWN

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
            description_placeholders={
                "nanoleaf_ip": "10.80.23.56"
            }
        )

    async def async_step_link(self, user_input=None) -> FlowResult:
        """Handle the linking step."""
        errors = {}

        if user_input is not None:
            # Try to get API key
            self.token = await get_api_key(self.host)
            
            if self.token:
                # Success! Create the entry
                return self.async_create_entry(
                    title=f"Nanoleaf Essentials ({self.host})",
                    data={
                        CONF_HOST: self.host,
                        CONF_TOKEN: self.token,
                    }
                )
            else:
                errors["base"] = ERROR_TIMEOUT

        return self.async_show_form(
            step_id="link",
            errors=errors,
            description_placeholders={
                "timeout": str(API_TIMEOUT)
            }
        )

class InvalidHost(Exception):
    """Error to indicate we cannot connect to the host."""