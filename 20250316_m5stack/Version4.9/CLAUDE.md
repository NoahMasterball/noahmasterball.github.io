# Kitchen Light System - Refactoring Guide

## Overview

The code has been completely refactored into a clear, class-based architecture. Each class has a single responsibility, and all dependencies are explicitly passed through constructors. This makes the code much easier for AI to understand and prevents unwanted modifications.

## System Overview

This M5Stack-based automation system controls kitchen lighting through motion detection and manual controls. It manages three separate lighting systems:
1. **Shelly Switch** - Main overhead kitchen light
2. **Nanoleaf** - Decorative ambient lighting  
3. **WLED Strip** - Notification/alert lighting (independent system)
4. **RGB Status LED** - Visual feedback on M5Stack device

## Class Architecture

### 1. Configuration (`Config`)
- **Purpose**: Centralized configuration management
- **Key Features**:
  - All magic numbers and settings in one place
  - Test mode vs production mode switch
  - Network addresses, timeouts, thresholds
  - LED colors and API payloads

#### Operating Modes

**Test Mode (TESTMODE = True)**:
- INAKT_TIMEOUT = 60 seconds (1 minute inactivity timeout)
- EVENT_THRESHOLD = 5 (PIR events needed)
- MANUAL_OVERRIDE_TIME = 60 seconds
- AUTO_ON_NICHT_NACH = 1500 (25:00 - always "dark enough")

**Production Mode (TESTMODE = False)**:
- INAKT_TIMEOUT = 300 seconds (5 minutes inactivity timeout)
- EVENT_THRESHOLD = 12 (PIR events needed)
- MANUAL_OVERRIDE_TIME = 900 seconds (15 minutes)
- AUTO_ON_NICHT_NACH = 22 * 60 (22:00 - 10 PM cutoff)

### 2. Utility Classes

#### `TimeUtils`
- Static methods for time operations
- DST calculation for Germany
- Local time conversion
- Debug time formatting

#### `ColorUtils`
- HSV to RGB conversion
- Progressive color calculation for PIR feedback
- Red (0°) to Green (120°) gradient

#### `SecretManager`
- Loads API keys from .env file
- Constructs Nanoleaf API URL

#### `DebugLogger`
- Centralized logging with timestamps
- Respects DEBUG flag from config

### 3. API Wrapper Classes (DO NOT MODIFY!)

#### `NanoleafAPI`
- **CRITICAL**: Contains exact API calls - DO NOT CHANGE
- Methods: `lese_status()`, `setze(ein)`
- Handles HTTP communication with Nanoleaf

#### `ShellyAPI`
- **CRITICAL**: Contains exact API calls - DO NOT CHANGE
- Methods: `lese_status()`, `setze(zustand)`
- Handles HTTP/RPC communication with Shelly

#### `WLEDAPI`
- **CRITICAL**: Contains exact API calls - DO NOT CHANGE
- Methods: `anfrage()`, `aktualisiere_status()`, `setze()`
- Handles JSON API communication with WLED

### 4. Core Service Classes

#### `NTPSync`
- Time synchronization with NTP server
- Tracks sync status and last sync time
- Auto-resync after 12 hours

#### `LEDController`
- Controls status LED on M5Stack
- Duration-based display with override logic
- Automatic turn-off when duration expires
- Blinking support for continuous feedback
- Shows white blinking during API calls (when not already active)

##### New Methods:
- `start_blinking(color, interval)`: Start blinking the LED
- `stop_blinking()`: Stop blinking and turn LED off
- Blinking automatically stops when `display()` is called

##### LED Color Meanings:
1. **Progressive PIR Feedback** (2 seconds each):
   - Red → Orange → Yellow → Green gradient
   - Shows motion event accumulation progress

2. **WLED Status**:
   - **GREEN** (60s): WLED turned ON
   - **RED** (30s): WLED turned OFF
   - Both use `force_override=True`

3. **Special States**:
   - **BLUE** (3x blink): Test mode activation
   - **WHITE** (blinking): API call in progress - 0.5s on/off cycle
   - **OFF** (0x000000): No active status

#### `DarknessChecker`
- Determines if it's dark enough for auto-on
- Uses sunset times by month
- Respects 22:00 cutoff (production mode)
- Test mode override available via double-click

##### Monthly Sunset Times (24h format):
- January: 15:00
- February: 16:20
- March: 16:30
- April: 17:10
- May: 17:50
- June/July: 18:30
- August: 18:00
- September: 17:00
- October: 16:30
- November: 15:30
- December: 15:00

#### `LightStateCache`
- Caches main light state for 30 minutes
- Reduces API calls during frequent PIR events
- Force refresh available

### 5. State Management Classes

#### `PIREventManager`
- Tracks PIR motion events
- Counts events toward threshold
- Clear events on demand

#### `TimerManager`
- Manages ALL timers in the system:
  - Last event timestamp (for auto-off)
  - Manual override expiry
  - WLED auto-off timer
- Provides remaining time calculations

### 6. Controller Classes

#### `MainLightController`
- Controls Shelly + Nanoleaf as a unit
- Methods: `turn_on()`, `turn_off()`, `toggle()`
- Updates cache after operations

#### `WLEDController`
- Controls WLED strip independently
- 60-second auto-off timer
- LED feedback (green on, red off)

#### `ButtonHandler`
- Processes button presses
- Short press (<1.5s): Toggle WLED
- Long press (≥1.5s): Toggle main lights
- Double click (2x within 0.5s): Toggle test mode override
- Sets appropriate timers and overrides

##### Double-Click Test Mode (NEW)
- Activates darkness override - all functions work regardless of actual brightness
- 3x blue LED blink confirms activation
- Deactivation returns to normal brightness checking

#### `PIRHandler`
- Processes PIR sensor events
- Checks darkness and override conditions
- Shows progressive LED feedback
- Triggers main lights at threshold

### 7. Main Orchestrator

#### `KitchenLightOrchestrator`
- Creates and wires all components
- Runs setup sequence
- Executes main loop
- Handles errors and restarts

## Key Design Principles

### 1. Explicit Dependencies
Every class receives its dependencies through the constructor. This makes it clear what each class needs to function.

```python
class PIRHandler:
    def __init__(self, config, darkness_checker, timer_mgr, pir_mgr, 
                 main_light_ctrl, light_cache, led_ctrl, debug_logger):
```

### 2. Single Responsibility
Each class does ONE thing:
- `DarknessChecker` only checks darkness
- `TimerManager` only manages timers
- `LEDController` only controls the LED

### 3. Clear Method Names
Methods clearly state what they do:
- `is_inactive_timeout_reached()`
- `get_remaining_inactive_time()`
- `set_manual_override()`

### 4. Preserved Behavior
ALL original behaviors are preserved:
- PIR events clear on manual toggle
- WLED OFF sets manual override
- Auto-off works regardless of darkness
- 30-minute cache for light state
- Different test/production timeouts

## Flow Examples

### PIR Motion → Light On
1. PIR sensor detects motion
2. `PIRHandler.on_motion_detected()` called
3. Checks `DarknessChecker.ist_dunkel_genug()`
4. Checks `TimerManager.is_manual_override_active()`
5. Adds event to `PIREventManager`
6. Shows color on `LEDController`
7. If threshold reached:
   - Calls `MainLightController.turn_on()`
   - Sets timer via `TimerManager.set_last_event()`
   - Clears events in `PIREventManager`

### Button Long Press
1. User presses button ≥1.5 seconds
2. `ButtonHandler.handle_long_press()` called
3. Calls `MainLightController.toggle()`
4. Sets override via `TimerManager.set_manual_override()`
5. Clears `PIREventManager.events`
6. If lights ON: sets last_event timer
7. If lights OFF: clears last_event timer

### Auto-Off Check
1. Main loop calls `TimerManager.is_inactive_timeout_reached()`
2. If true and lights are on:
   - Calls `MainLightController.turn_off()`
   - Clears timers and events
   - Sets room as unoccupied

## Testing Considerations

The refactored code maintains identical behavior but is now:
1. **Testable**: Each class can be tested independently
2. **Debuggable**: Clear flow through method calls
3. **Maintainable**: Changes isolated to specific classes
4. **AI-Friendly**: Clear structure prevents misunderstandings

## Important Notes

1. **API Wrappers are Sacred**: The API wrapper classes contain the EXACT HTTP/socket calls from the original code. These must NEVER be modified.

2. **Timer Logic**: All timer logic is centralized in `TimerManager`. This prevents timing bugs and makes the flow clear.

3. **State Updates**: State changes always flow through the appropriate controller, which updates caches and timers.

4. **Error Handling**: The main loop catches all exceptions and restarts after 2 seconds, maintaining system stability.

5. **Boot Confirmation**: System shows 3x green LED blinks on successful startup.

## Light Behavior Scenarios (from Discussion)

### Automatic Light Control

#### PIR Motion Detection
- **Events Required**: 5 (test) or 12 (production) 
- **Fastest Light-On Time**: ~0.5-1 second with continuous motion
- **Progressive LED Feedback**: Shows accumulation progress

#### Darkness Conditions
- **Before Sunset**: No auto-on
- **After Sunset, Before 22:00**: Auto-on enabled
- **After 22:00**: No new auto-on (but existing lights stay controllable)
- **No NTP Sync**: Assumes dark (fail-safe)

### Manual Light Control

#### Manual On/Off Behavior
- **Timer Set on Manual ON**: Starts inactivity countdown
- **Without Motion**: Lights off after 60s (test) or 300s (production)
- **With Motion**: Each PIR event resets timer, lights stay on indefinitely

#### Daytime Manual Control
- **Manual ON During Day**: Works normally
- **Motion Detection**: Still resets timer even during day
- **Result**: Lights stay on with presence, off after timeout without

#### Late Night Scenario (Past 22:00)
- **If ON Before 22:00**: Continues working normally
- **Motion After 22:00**: Still resets timer, prevents auto-off
- **Leaves at 22:30**: Lights off 5 minutes later
- **Key Point**: 22:00 limit only prevents NEW auto-on

### Sync Behavior

#### Out-of-Sync Handling
- **Detection**: Checked on every toggle
- **Resolution**: Both lights forced OFF
- **Example**: Only Nanoleaf on → Both turn OFF on toggle

#### API Call Feedback (UPDATED)
- **White LED Blinking**: Blinks continuously during API calls
- **Blink Pattern**: 0.5 seconds on, 0.5 seconds off
- **Duration**: Continues until API call completes (success or failure)
- **Smart Activation**: Only starts if no other LED display is active
- **Auto-Stop**: Stops immediately when API call finishes
- **Override Behavior**: If another LED display is requested (e.g., PIR color), blinking stops

### WLED Independent System

#### Configuration
```python
WLED_JSON_EIN = {
    "on": True,  # Currently False for testing
    "bri": 151,
    "transition": 7,
    "seg": [{
        "fx": 122,
        "col": [[255, 0, 0], [0, 0, 0], [0, 0, 0]],
        "n": "Essen kommen JETZT!!!!"
    }]
}
```

#### WLED Behavior
- **Control**: Manual only (button short press)
- **Auto-Off**: Always 60 seconds
- **Not Affected By**: PIR, darkness, time, main lights
- **Side Effect**: WLED OFF sets manual override for main lights

## Complete State Matrix

### Triggers and Conditions

| Event | Condition | Result |
|-------|-----------|--------|
| PIR Motion | Dark + No Override + <22:00 + Threshold | Lights ON |
| PIR Motion | Light already ON | Reset timer only |
| PIR Motion | Manual override active | Ignored |
| PIR Motion | Too bright (no test mode) | Ignored |
| PIR Motion | After 22:00 | Ignored for auto-on |
| Manual Toggle | Any time | Toggle + Override |
| Inactivity | Timer expired | Lights OFF |
| Double Click | Any time | Toggle test mode |
| WLED OFF | Any time | Override main lights |

## Security and Network

### Device Addresses
- Shelly: 10.80.23.51:80
- Nanoleaf: 10.80.23.56:16021  
- WLED: 10.80.23.22:80
- NTP: ntp1.lrz.de

### API Security
- Keys stored in .env file
- Local network only
- No internet dependencies except NTP

## Debug Output Format

All debug messages use consistent timestamp format:
```
DD MMM HH:MM:SS  [Message]
```
Example: `09 Apr 15:23:45  PIR 3 von 5: LED-Farbe #FFAA00`