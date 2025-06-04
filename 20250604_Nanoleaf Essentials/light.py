"""Light platform for Nanoleaf Essentials."""
import logging
from typing import Any

from homeassistant.components.light import (
    LightEntity,
    ATTR_BRIGHTNESS,
    ATTR_RGB_COLOR,
    ATTR_EFFECT,
    ColorMode,
)
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, CONF_HOST
from .coordinator import NanoleafEssentialsCoordinator

_LOGGER = logging.getLogger(__name__)

def rgb_to_hsv(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert RGB to HSV."""
    r, g, b = r/255.0, g/255.0, b/255.0
    mx = max(r, g, b)
    mn = min(r, g, b)
    df = mx-mn
    if mx == mn:
        h = 0
    elif mx == r:
        h = (60 * ((g-b)/df) + 360) % 360
    elif mx == g:
        h = (60 * ((b-r)/df) + 120) % 360
    elif mx == b:
        h = (60 * ((r-g)/df) + 240) % 360
    if mx == 0:
        s = 0
    else:
        s = (df/mx)*100
    v = mx*100
    return h, s, v

def hsv_to_rgb(h: float, s: float, v: float) -> tuple[int, int, int]:
    """Convert HSV to RGB."""
    s, v = s/100.0, v/100.0
    c = v * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = v - c
    if 0 <= h < 60:
        r, g, b = c, x, 0
    elif 60 <= h < 120:
        r, g, b = x, c, 0
    elif 120 <= h < 180:
        r, g, b = 0, c, x
    elif 180 <= h < 240:
        r, g, b = 0, x, c
    elif 240 <= h < 300:
        r, g, b = x, 0, c
    elif 300 <= h < 360:
        r, g, b = c, 0, x
    else:
        r, g, b = 0, 0, 0
    return int((r + m) * 255), int((g + m) * 255), int((b + m) * 255)

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Nanoleaf Essentials light."""
    coordinator = hass.data[DOMAIN][config_entry.entry_id]
    
    entities = [NanoleafEssentialsLight(coordinator, config_entry)]
    async_add_entities(entities)

class NanoleafEssentialsLight(CoordinatorEntity, LightEntity):
    """Representation of Nanoleaf Essentials Light."""
    
    def __init__(self, coordinator: NanoleafEssentialsCoordinator, config_entry: ConfigEntry):
        """Initialize the light."""
        super().__init__(coordinator)
        self._config_entry = config_entry
        self._attr_name = f"Nanoleaf Essentials {coordinator.host}"
        self._attr_unique_id = f"{coordinator.host}_{coordinator.token}"
        
        # Set supported color modes
        self._attr_supported_color_modes = {ColorMode.RGB}
        self._attr_color_mode = ColorMode.RGB
    
    @property
    def device_info(self):
        """Return device information."""
        return {
            "identifiers": {(DOMAIN, self.coordinator.host)},
            "name": f"Nanoleaf Essentials {self.coordinator.host}",
            "manufacturer": "Nanoleaf",
            "model": "Essentials",
            "sw_version": "1.0.0",
        }
    
    @property
    def available(self) -> bool:
        """Return if entity is available."""
        return self.coordinator.last_update_success and self.coordinator.data is not None
    
    @property
    def is_on(self) -> bool:
        """Return if light is on."""
        if self.coordinator.data:
            state = self.coordinator.data.get("on", {})
            return state.get("value", False)
        return False
    
    @property
    def brightness(self) -> int:
        """Return brightness (0-255)."""
        if self.coordinator.data:
            brightness = self.coordinator.data.get("brightness", {})
            brightness_pct = brightness.get("value", 100)
            return int(brightness_pct * 255 / 100)
        return 255
    
    @property
    def rgb_color(self) -> tuple:
        """Return RGB color."""
        if self.coordinator.data:
            hue_data = self.coordinator.data.get("hue", {})
            sat_data = self.coordinator.data.get("sat", {})
            
            hue = hue_data.get("value", 0)
            sat = sat_data.get("value", 0)
            
            # Convert HSV to RGB (brightness handled separately)
            rgb = hsv_to_rgb(hue, sat, 100)
            return rgb
        return (255, 255, 255)
    
    @property
    def effect(self) -> str:
        """Return current effect."""
        if self.coordinator.data:
            effects = self.coordinator.data.get("effects", {})
            return effects.get("select", "")
        return ""
    
    @property
    def effect_list(self) -> list:
        """Return list of available effects."""
        if self.coordinator.data:
            effects = self.coordinator.data.get("effects", {})
            effect_list = effects.get("effectsList", [])
            # Add "Solid Color" as default effect
            if "Solid Color" not in effect_list:
                effect_list.insert(0, "Solid Color")
            return effect_list
        return ["Solid Color"]
    
    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn on the light."""
        # Prepare basic on command
        payload = {"on": {"value": True}}
        
        # Handle brightness
        if ATTR_BRIGHTNESS in kwargs:
            brightness_pct = int(kwargs[ATTR_BRIGHTNESS] * 100 / 255)
            payload["brightness"] = {"value": brightness_pct}
        
        # Handle color
        if ATTR_RGB_COLOR in kwargs:
            rgb = kwargs[ATTR_RGB_COLOR]
            hsv = rgb_to_hsv(*rgb)
            payload["hue"] = {"value": int(hsv[0])}
            payload["sat"] = {"value": int(hsv[1])}
        
        # Send state command
        await self.coordinator.async_send_command("state", payload)
        
        # Handle effect separately
        if ATTR_EFFECT in kwargs and kwargs[ATTR_EFFECT] != "Solid Color":
            effect_payload = {"select": kwargs[ATTR_EFFECT]}
            await self.coordinator.async_send_command("effects", effect_payload)
    
    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn off the light."""
        payload = {"on": {"value": False}}
        await self.coordinator.async_send_command("state", payload)