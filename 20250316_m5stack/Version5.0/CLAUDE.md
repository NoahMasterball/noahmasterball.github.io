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
- PIR_WINDOW = 60 seconds (1 minute sliding window for PIR events)
- MANUAL_OVERRIDE_TIME = 60 seconds
- AUTO_ON_NICHT_NACH = 1500 (25:00 - always "dark enough")

**Production Mode (TESTMODE = False)**:
- INAKT_TIMEOUT = 300 seconds (5 minutes inactivity timeout)
- EVENT_THRESHOLD = 12 (PIR events needed)
- PIR_WINDOW = 300 seconds (5 minutes sliding window for PIR events)
- MANUAL_OVERRIDE_TIME = 900 seconds (15 minutes)
- AUTO_ON_NICHT_NACH = 22 * 60 (22:00 - 10 PM cutoff)

#### Hardware Watchdog Timer

The system includes hardware watchdog timer support for improved reliability:
- **Timeout**: 30 seconds (configurable via `WATCHDOG_TIMEOUT`)
- **Implementation**: Uses ESP32-S3's built-in hardware WDT via `machine.WDT`
- **Behavior**: System automatically resets if main loop freezes for >30 seconds
- **Fed During**:
  - Every main loop iteration
  - NTP sync retry intervals (feeds every second during 30s waits)
  - WiFi reconnection attempts
  - Boot sequence LED blinking
- **Can be disabled**: Set `WATCHDOG_ENABLED = False` in Config

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

**Stability Enhancements**:
- All API wrappers now use `CircuitBreaker` for fault tolerance
- DNS lookups cached via `DNSCache` 
- Socket timeouts configured (10s for Nanoleaf/Shelly, 5s for WLED)
- Proper socket cleanup in all error paths

### 4. Core Service Classes

#### `NTPSync`
- Time synchronization with NTP server
- Tracks sync status and last sync time
- Auto-resync after 12 hours
- Feeds watchdog during long sync operations

#### `WiFiMonitor`
- Monitors WiFi connection status
- Automatically reconnects if connection is lost
- Feeds watchdog during reconnection attempts
- Prevents system hang if WiFi drops
- Methods: `is_connected()`, `check_connection()`, `reconnect()`

#### `CircuitBreaker`
- Prevents cascading failures from repeated API errors
- Three states: CLOSED (normal), OPEN (broken), HALF_OPEN (testing)
- Opens circuit after 3 consecutive failures (configurable)
- Auto-recovery after 60 seconds timeout
- Wraps all API calls to prevent system overload
- Usage: `circuit_breaker.call(api_function, *args)`

#### `DNSCache`
- Caches DNS lookups to prevent blocking on resolution
- Cache duration: 1 hour per entry
- Falls back to expired cache if DNS fails
- Reduces network delays and DNS server load
- Automatically used by all API classes

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
- Tracks PIR motion events with timestamps
- Implements sliding window algorithm:
  - Window size = PIR_WINDOW (60s test / 300s production)
  - Old events automatically expire and are removed
  - Only events within the window count toward threshold
  - Independent from INAKT_TIMEOUT for flexibility
- Counts events toward threshold (5 test / 12 production)
- Clear events on demand (manual toggle, lights on, etc.)

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

##### PIR Debouncing
- **Debounce Time**: 100ms between events
- **Purpose**: Prevents false triggers from sensor noise
- **Implementation**: Ignores events within 100ms of last motion
- **Effect**: More reliable motion detection, reduced false positives

### 7. Main Orchestrator

#### `KitchenLightOrchestrator`
- Creates and wires all components
- Runs setup sequence
- Executes main loop
- Handles errors and restarts

### Boot Sequence

1. **Hardware Initialization**
   - M5Stack hardware setup
   - Hardware watchdog activation (if enabled)
   - Component references passed

2. **Network Setup**
   - NTP time synchronization
   - WiFi connection verification
   - DNS cache initialization

3. **Memory Status**
   - Initial garbage collection
   - Logs startup memory: "Startup Memory: X KB frei, Y KB belegt"
   - Establishes baseline for memory monitoring

4. **Visual Confirmation**
   - 3x green LED blinks
   - Watchdog fed during blink sequence
   - System ready for operation

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
5. Adds event to `PIREventManager`:
   - First removes any events older than sliding window
   - Then adds new event with current timestamp
   - Returns updated count (only events within window)
6. Shows color on `LEDController`
7. If threshold reached:
   - Calls `MainLightController.turn_on()`
   - Sets timer via `TimerManager.set_last_event()`
   - Clears events in `PIREventManager`

### PIR Sliding Window Example (Production Mode)
- 10:00:00 - PIR event 1 (count: 1)
- 10:01:00 - PIR event 2 (count: 2)
- 10:02:00 - PIR event 3 (count: 3)
- 10:05:01 - PIR event 4 (count: 3) ← Event 1 expired (>5 min old)
- 10:06:01 - PIR event 5 (count: 3) ← Event 2 expired
Events only count if they happened within the last 5 minutes!

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

6. **Timer Independence**: PIR_WINDOW and INAKT_TIMEOUT are separate configuration values:
   - **PIR_WINDOW**: Controls how long PIR events stay valid in the sliding window
     - Events must accumulate within this time to trigger lights
     - Old events expire and don't count toward threshold
   - **INAKT_TIMEOUT**: Controls how long lights stay on after the LAST motion
     - Resets with EVERY PIR event (keep-alive)
     - Lights turn off only after NO motion for this duration
   - Both happen to be 5 minutes in production, but serve different purposes

## Light Behavior Scenarios (from Discussion)

### Automatic Light Control

#### PIR Motion Detection
- **Events Required**: 5 (test) or 12 (production) within sliding window
- **Sliding Window**: PIR_WINDOW (60s test / 300s production)
- **Event Expiration**: Events older than PIR_WINDOW are automatically removed
- **Window Independence**: PIR_WINDOW is separate from INAKT_TIMEOUT for easy adjustment
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

#### INAKT_TIMEOUT Behavior (Auto-Off Timer)
- **What it is**: Time since the LAST PIR event (not absence of events)
- **Timer resets on**: EVERY single PIR event, manual ON, auto ON
- **Timer clears on**: Manual OFF, auto-off trigger
- **Keep-alive system**: Any motion resets the 5-minute countdown
- **Example**: Motion at 10:00, 10:04, 10:08 → Timer resets each time
- **Lights turn off**: Only when NO motion for full 5 minutes

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

### Timer Comparison Example

**PIR_WINDOW (Sliding Window for Triggering)**:
```
10:00 - Motion (1/12)
10:04 - Motion (2/12)
10:05:01 - Motion (2/12) ← First event expired, still only 2
10:06 - 10 quick motions (12/12) → Lights ON!
```

**INAKT_TIMEOUT (Keep-Alive After Lights On)**:
```
10:00 - Lights turned ON (timer starts: 5 min)
10:04 - Motion detected (timer resets: 5 min)
10:08 - Motion detected (timer resets: 5 min)
10:12 - Motion detected (timer resets: 5 min)
10:17 - No motion for 5 minutes → Lights OFF
```

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

## Stability Improvements (Version 5.0)

### Overview
The system has been hardened against crashes and hangs through multiple stability improvements. These changes address common failure modes on embedded systems like the M5Stack.

### Key Stability Features

#### 1. Network Timeouts
- **All socket operations now have timeouts**:
  - Nanoleaf/Shelly: 10 seconds
  - WLED: 5 seconds
- **Prevents**: Infinite blocking on network issues
- **Recovery**: Automatic retry with logging

#### 2. Memory Management
- **Receive buffers limited**:
  - Maximum 8KB for HTTP responses
  - Prevents memory overflow from large responses
- **Garbage collection**:
  - Runs every 30 seconds
  - Warns when free memory <10KB
- **PIR event cleanup**:
  - Periodic cleanup even without new events
  - Prevents unbounded list growth
- **Dynamic GC Threshold**: Adjusts based on free memory (`gc.threshold(gc.mem_free() // 4 + gc.mem_alloc())`)
- **Early Warning System**:
  - Critical: <10KB free - logs warning
  - Caution: <20KB free - logs memory status
- **Startup Reporting**: Logs initial memory state after boot

#### 3. Socket Cleanup
- **Proper socket closing** in all error paths
- **try/except** blocks around socket.close()
- **Prevents**: Socket resource exhaustion

#### 4. Button Handler Improvements
- **Edge detection**: Prevents multiple press/release events
- **Race condition fix**: Checks for negative press duration
- **State tracking**: `button_was_pressed` flag

#### 5. Watchdog Timer
- **Monitors main loop execution time**
- **Warning**: If loop takes >5 seconds
- **Auto-restart**: After 3 consecutive slow loops
- **Purpose**: Detect and recover from hangs

#### 6. Enhanced Error Recovery
- **All API calls** wrapped in proper exception handling
- **Socket errors** don't crash the system
- **Main loop** continues after errors

#### 7. WiFi Connection Monitoring
- **Continuous monitoring** in main loop
- **Automatic reconnection** on connection loss
- **Watchdog feeding** during reconnection
- **Prevents**: System hang from network issues

#### 8. Hardware Watchdog Timer
- **ESP32-S3 hardware watchdog** with 30-second timeout
- **Automatic system reset** if main loop freezes
- **Fed in main loop** and during long operations
- **Configurable**: Can be disabled in Config class
- **Protection against**: Software hangs, infinite loops, memory corruption

### Crash Scenarios Addressed

1. **Network Timeouts**
   - Device offline → timeout after 10s → retry
   - No more infinite hangs

2. **Memory Exhaustion**
   - Large API responses → limited to 8KB
   - Regular garbage collection
   - Memory warnings in logs

3. **Button Bounce**
   - Rapid press/release → edge detection
   - Negative duration → ignored

4. **PIR Event Overflow**
   - Old events → periodic cleanup
   - List size → bounded by sliding window

5. **API Call Failures**
   - Socket errors → logged and recovered
   - Blinking LED → stops even on error

### Monitoring and Diagnostics

#### Memory Monitoring
```python
# Runs every 30 seconds
gc.collect()
free_mem = gc.mem_free()
if free_mem < 10000:  # Less than 10KB
    logger.log("WARNUNG: Wenig Speicher frei: {} bytes")
```

#### Watchdog Monitoring
```python
# Checks loop execution time
if loop_duration > 5.0:
    logger.log("WARNUNG: Loop dauerte {} Sek.")
    # Auto-restart after 3 slow loops
```

#### Network Health
- Timeout logs show which device is unreachable
- Retry attempts logged
- Socket cleanup confirmed

### Best Practices for Stability

1. **Monitor the logs** for warnings:
   - Memory warnings
   - Slow loop warnings
   - Network timeouts

2. **Regular restarts** recommended:
   - Weekly power cycle
   - Clears any accumulated state

3. **Network stability**:
   - Ensure devices have static IPs
   - Check WiFi signal strength
   - Monitor for packet loss

4. **Debug persistent crashes**:
   - Check for memory warnings before crash
   - Look for specific API timeout patterns
   - Monitor loop duration warnings

### Recovery Behavior

When a crash is detected:
1. Exception logged with timestamp
2. 2-second delay
3. Full system restart
4. NTP resync
5. Normal operation resumes

The system is designed to be self-healing and will automatically recover from most failure conditions.