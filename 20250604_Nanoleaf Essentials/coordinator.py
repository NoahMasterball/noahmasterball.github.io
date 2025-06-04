"""Data update coordinator for Nanoleaf Essentials."""
import asyncio
import aiohttp
import async_timeout
from datetime import timedelta
import logging

from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.core import HomeAssistant

from .const import DOMAIN, API_BASE_URL, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)

class NanoleafEssentialsCoordinator(DataUpdateCoordinator):
    """Coordinator to manage Nanoleaf Essentials data updates."""
    
    def __init__(self, hass: HomeAssistant, host: str, token: str):
        """Initialize coordinator."""
        self.host = host
        self.token = token
        self.base_url = API_BASE_URL.format(host=host, token=token)
        
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )
    
    async def _async_update_data(self):
        """Fetch data from Nanoleaf device."""
        try:
            async with async_timeout.timeout(10):
                async with aiohttp.ClientSession() as session:
                    # Use specific state endpoint like in your working script
                    state_url = f"http://{self.host}:16021/api/v1/{self.token}/state"
                    _LOGGER.debug(f"Fetching data from: {state_url}")
                    
                    async with session.get(state_url) as response:
                        _LOGGER.debug(f"Response status: {response.status}")
                        
                        if response.status == 200:
                            # Get response as text (this is the body only, like your recv_all)
                            json_data = await response.text()
                            _LOGGER.debug(f"Raw JSON data: {json_data}")
                            
                            # Apply your extract_json logic to the body
                            json_start = json_data.find("{")
                            json_end = json_data.rfind("}") + 1
                            
                            if json_start != -1 and json_end > json_start:
                                json_str = json_data[json_start:json_end]
                                _LOGGER.debug(f"Extracted JSON: {json_str}")
                                
                                try:
                                    import json
                                    parsed = json.loads(json_str)
                                    _LOGGER.debug(f"Parsed data: {parsed}")
                                    
                                    # Validate we have the expected structure like your script
                                    if "on" in parsed:
                                        power = parsed.get("on", {}).get("value", False)
                                        _LOGGER.debug(f"Power state: {'ON' if power else 'OFF'}")
                                        return parsed
                                    else:
                                        _LOGGER.warning(f"Unexpected JSON structure: {parsed}")
                                        return parsed
                                        
                                except json.JSONDecodeError as e:
                                    _LOGGER.error(f"Failed to parse JSON: {e}")
                                    _LOGGER.error(f"JSON string was: {json_str}")
                                    raise UpdateFailed(f"Invalid JSON response: {e}")
                            else:
                                _LOGGER.error(f"No JSON found in response: {json_data}")
                                raise UpdateFailed("No valid JSON in response")
                        elif response.status == 401:
                            raise UpdateFailed("Invalid API token")
                        elif response.status == 403:
                            raise UpdateFailed("API access forbidden - device might not be properly paired")
                        else:
                            text = await response.text()
                            _LOGGER.error(f"HTTP {response.status} error. Response: {text[:200]}")
                            raise UpdateFailed(f"HTTP {response.status}")
                            
        except asyncio.TimeoutError:
            raise UpdateFailed(f"Timeout connecting to Nanoleaf device at {self.host}")
        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Connection error to {self.host}: {err}")
        except Exception as err:
            raise UpdateFailed(f"Unexpected error communicating with {self.host}: {err}")
    
    async def async_send_command(self, endpoint: str, payload: dict) -> bool:
        """Send command to Nanoleaf device."""
        url = f"{self.base_url}/{endpoint}" if endpoint else self.base_url
        
        try:
            async with async_timeout.timeout(10):
                async with aiohttp.ClientSession() as session:
                    async with session.put(url, json=payload) as response:
                        if response.status in [200, 204]:
                            _LOGGER.debug(f"Command sent successfully to {url}: {payload}")
                            # Request immediate refresh after command
                            await self.async_request_refresh()
                            return True
                        else:
                            _LOGGER.error(f"Command failed to {url}: HTTP {response.status}")
                            return False
                            
        except asyncio.TimeoutError:
            _LOGGER.error(f"Timeout sending command to {self.host}")
            return False
        except Exception as err:
            _LOGGER.error(f"Error sending command to {self.host}: {err}")
            return False