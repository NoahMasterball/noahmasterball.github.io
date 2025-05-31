# M5Stack Kitchen Light Automation System - Complete Documentation

## System Overview

This M5Stack-based automation system controls kitchen lighting through motion detection and manual controls. It manages three separate lighting systems:
1. **Shelly Switch** - Main overhead kitchen light
2. **Nanoleaf** - Decorative ambient lighting  
3. **WLED Strip** - Notification/alert lighting (independent system)
4. **RGB Status LED** - Visual feedback on M5Stack device

## Operating Modes

### Test Mode vs Production Mode
```python
TESTMODE = True  # Current setting

Test Mode:
- INAKT_TIMEOUT = 60 seconds (1 minute inactivity timeout)
- EVENT_THRESHOLD = 5 (PIR events needed)
- MANUAL_OVERRIDE_TIME = 60 seconds
- AUTO_ON_NICHT_NACH = 1500 (25:00 - always "dark enough")

Production Mode:
- INAKT_TIMEOUT = 300 seconds (5 minutes inactivity timeout)
- EVENT_THRESHOLD = 12 (PIR events needed)
- MANUAL_OVERRIDE_TIME = 900 seconds (15 minutes)
- AUTO_ON_NICHT_NACH = 22 * 60 (22:00 - 10 PM cutoff)
```

## Automatic Light Control (Shelly + Nanoleaf)

### PIR Motion Detection System

#### Event Accumulation
- PIR sensor detects motion and accumulates events
- Each motion detection adds to `pir_events` list
- Status LED shows progressive color feedback:
  - **Red** (0 events) → **Yellow** → **Green** (threshold reached)
  - Color calculation: Hue transitions from 0° to 120° based on event count

#### Trigger Conditions for Auto-ON
1. **Motion Threshold**: 5 events (test) or 12 events (production)
2. **Darkness Check**: Must pass `ist_dunkel_genug()` test
3. **No Manual Override**: `manuell_override_bis` must be expired
4. **Time Window**: Before 22:00 (production) or always (test)

#### Darkness Determination (`ist_dunkel_genug()`)
- **No NTP sync**: Always returns True (fail-safe to "dark")
- **After 22:00**: Always returns False (no auto-on)
- **Before sunset time**: Returns False
- **After sunset time**: Returns True

Monthly sunset times (24h format):
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

### Auto-OFF Mechanism

The lights turn off automatically when:
- **Inactivity timeout** reached: 60s (test) or 300s (production)
- Timer starts from `last_event` (last motion or manual activation)
- Applies regardless of darkness or time of day
- Only executes if lights are currently on (`cached_light_state = True`)

## Manual Controls (Button A)

### Short Press (<1.5 seconds) - WLED Control
1. **WLED OFF → ON**:
   - Sends WLED_JSON_EIN configuration
   - Sets 60-second auto-off timer
   - Shows GREEN LED for 60 seconds
   
2. **WLED ON → OFF**:
   - Sends WLED_JSON_AUS
   - Shows RED LED for 30 seconds
   - Activates manual override for main lights
   - Clears PIR events and motion timers

### Long Press (≥1.5 seconds) - Main Light Toggle
1. **Checks sync status** of Shelly and Nanoleaf
2. **If out of sync**: Forces both OFF
3. **If both ON**: Turns both OFF
4. **If both OFF**: Turns both ON
5. **Effects**:
   - Sets manual override for 60s (test) or 900s (production)
   - Clears PIR event accumulator
   - If turned ON: Sets `last_event` for auto-off timer
   - If turned OFF: Clears `last_event`

## WLED System (Independent)

### Configuration
```python
WLED_JSON_EIN = {
    "on": True,
    "bri": 151,
    "transition": 7,
    "seg": [{
        "fx": 122,  # Effect type
        "col": [[255, 0, 0], [0, 0, 0], [0, 0, 0]],  # Red primary
        "n": "Essen kommen JETZT!!!!"  # Dinner notification
    }]
}
:q!
q!```

### WLED Behavior
- **Manual control only** via button short press
- **60-second auto-off timer** when activated
- **Not affected by**:
  - PIR motion detection
  - Darkness conditions
  - Time of day
  - Main light status

## Status LED Indicators

### LED Display System (`display_led()`)
- Centralized LED control with duration and override capabilities
- Prevents interruption of active displays unless `force_override=True`

### Color Meanings
1. **Progressive PIR Feedback** (2 seconds each):
   - Red → Orange → Yellow → Green gradient
   - Shows motion event accumulation progress

2. **WLED Status**:
   - **GREEN** (60s): WLED turned ON
   - **RED** (30s): WLED turned OFF
   - Both use `force_override=True`

3. **Special States**:
   - **OFF** (0x000000): No active status
   - **WHITE BLINK**: Defined but not actively used

## System States and Timers

### Global State Variables
- `raum_belegt`: Room occupancy flag
- `last_event`: Timestamp of last motion/manual activation
- `pir_events`: List of PIR event timestamps
- `manuell_override_bis`: Manual override expiry timestamp
- `cached_light_state`: Cached light status (30-minute refresh)
- `wled_status`: Current WLED state
- `wled_auto_aus_timer`: WLED auto-off timestamp

### Timer Interactions
1. **PIR Detection**:
   - Ignored during manual override period
   - Ignored when not dark enough
   - Ignored after 22:00 (production mode)
   - Resets inactivity timer if lights already on

2. **Manual Override**:
   - Prevents PIR from controlling main lights
   - Duration: 60s (test) or 900s (production)
   - Set by: Long press or WLED OFF action

3. **Inactivity Timer**:
   - Starts from `last_event`
   - Timeout: 60s (test) or 300s (production)
   - Triggers auto-off regardless of conditions

## Network Communication

### Device Addresses
- Shelly: 10.80.23.51:80
- Nanoleaf: 10.80.23.56:16021
- WLED: 10.80.23.22:80

### State Caching
- Light state cached for 30 minutes
- Reduces API calls during frequent PIR triggers
- Force refresh available via `ueberkopflicht_an()`

### NTP Synchronization
- Host: ntp1.lrz.de
- Sync interval: 12 hours (43200 seconds)
- Retry: 10 attempts, 30s intervals
- Handles German DST automatically

## Complete Trigger Matrix

### Automatic Light ON Triggers
| Condition | Requirement | Result |
|-----------|------------|---------|
| PIR Motion | ≥5 events (test) or ≥12 (production) | Check darkness |
| Darkness | After sunset, before 22:00 | Check override |
| No Override | `manuell_override_bis` expired | Turn lights ON |
| NTP Failure | No time sync | Assume dark (fail-safe) |

### Automatic Light OFF Triggers
| Condition | Timer | Result |
|-----------|-------|---------|
| No Motion | 60s (test) or 300s (production) | Lights OFF |
| Manual OFF | Immediate | Lights OFF + Override |
| Cache Check | Lights already OFF | Skip API call |

### Manual Control Results
| Action | Lights | WLED | Override | Timer |
|--------|--------|------|----------|-------|
| Short Press (WLED OFF) | - | ON | - | 60s auto-off |
| Short Press (WLED ON) | - | OFF | 60/900s | Clear timers |
| Long Press (Toggle) | Toggle | - | 60/900s | Set/Clear based on state |

## Debug Output Format

All debug messages use consistent timestamp format:
```
DD MMM HH:MM:SS  [Message]
```
Example: `09 Apr 15:23:45  PIR 3 von 5: LED-Farbe #FFAA00`

## Error Handling

### Network Failures
- Retry mechanism: 5 attempts for WLED, 1 for others
- 30-second retry interval for status checks
- Graceful degradation on failure

### System Recovery
- Main loop catches all exceptions
- 2-second delay before restart
- Preserves operation continuity

## Security Considerations

- API keys stored in `.env` file
- Network communication uses local IPs only
- No external internet dependencies except NTP

## CRITICAL: Code Maintenance Guidelines for AI/LLMs

### 🛑 STOP - READ THIS FIRST - THIS CODE IS IN PRODUCTION 🛑

**THIS CODE IS WORKING CORRECTLY IN A REAL KITCHEN**

**GOLDEN RULE: If you are asked to fix Bug A, you may ONLY touch code related to Bug A. You may NOT:**
- "Improve" other parts of the code
- "Fix" things that seem wrong but work correctly
- Refactor working functions
- Change timing values
- Modify state machine logic
- Add new features unless explicitly requested

### ⚠️ IMPORTANT: This Code is Production-Tested and Working

**DO NOT CHANGE BEHAVIORAL LOGIC** unless explicitly requested. The current implementation represents carefully tested behavior that may seem counterintuitive but is intentional.

### Intended Behaviors (DO NOT "FIX" THESE)

1. **PIR Events Clear on Manual Toggle**
   - This is INTENTIONAL - manual control resets automation state
   - Do NOT preserve PIR events across manual toggles

2. **WLED Turns OFF Manual Override**
   - Short press to turn WLED OFF sets manual override - INTENTIONAL
   - This prevents main lights from auto-activating while user is at WLED

3. **Darkness Check Only for Auto-ON**
   - Auto-OFF works regardless of darkness - INTENTIONAL
   - Lights should turn off when room is empty, even in darkness

4. **State Caching with 30-minute Refresh**
   - Reduces API calls but may show stale state - INTENTIONAL
   - Do NOT add more frequent checks without explicit request

5. **Manual Override Durations**
   - Different for test (60s) vs production (900s) - INTENTIONAL
   - Do NOT standardize these values

6. **WLED 60-second Auto-OFF**
   - Always 60 seconds regardless of mode - INTENTIONAL
   - This is a notification system, not primary lighting

7. **NTP Fallback to "Dark"**
   - When time sync fails, assume dark - INTENTIONAL safety feature
   - Do NOT change to assume daylight

### When Fixing Bugs

1. **Identify the specific bug** - What exactly is broken?
2. **Preserve all other behaviors** - Only fix the identified issue
3. **Don't refactor working code** - If it works, leave it alone
4. **Test the specific fix** - Ensure it only affects the bug
5. **Document the change** - Add comments about what was fixed and why

### Common AI Misunderstandings

- **"Improving" timer logic** - Current timers are calibrated for real use
- **"Fixing" state machines** - Transitions are intentional
- **"Optimizing" API calls** - Caching strategy is deliberate
- **"Correcting" edge cases** - Many edge cases have specific handling

### Bug Fix Template

When reporting a bug, provide:
```
BUG: [Specific behavior that is wrong]
EXPECTED: [What should happen]
ACTUAL: [What currently happens]
STEPS: [How to reproduce]
FIX ONLY: [Specific code section to change]
```

### Remember

This system controls physical devices in a real kitchen. Every behavior has been tested with actual usage patterns. What seems like a bug might be a feature. Always ask before changing behavioral logic.

## Example of What NOT To Do

**User Request**: "Fix the bug where WLED doesn't turn on sometimes"

**WRONG AI Response**: 
```python
# "I'll fix the WLED issue and also improve the PIR logic while I'm at it"
# "I noticed the darkness check could be optimized"  
# "The timer values seem inconsistent, let me standardize them"
```

**CORRECT AI Response**:
```python
# "I'll ONLY fix the specific WLED activation issue"
# "What exact scenario causes WLED not to turn on?"
# "I won't touch any other code"
```

## Strict Rules for Bug Fixes

1. **ASK FIRST**: "Is this the only issue you want me to fix?"
2. **CONFIRM SCOPE**: "Should I ONLY change the WLED activation code?"
3. **LEAVE EVERYTHING ELSE**: Even if you see "problems", DO NOT touch them
4. **NO DRIVE-BY FIXES**: One bug = one fix, nothing more

## Final Warning

**Every "improvement" you make could break someone's kitchen automation that has been working for months. Respect the existing code.**
