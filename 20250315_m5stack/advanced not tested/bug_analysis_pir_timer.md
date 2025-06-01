# PIR Sensor Movement Detection and Timer Update Issues

## File: 20250409_kitchenmove49.py

### Issues Found:

#### 1. **Race Condition with Cached Light State (Lines 583-596)**
The `ueberkopflicht_an()` function uses a 30-minute cache (`refresh_interval = 1800`) which can lead to stale data:

```python
def ueberkopflicht_an():
    global last_state_update_time, cached_light_state
    refresh_interval = 1800  # 30 Min.
    now = time.time()
    if now - last_state_update_time < refresh_interval:
        return cached_light_state  # Returns potentially stale cached value
```

**Impact**: If the light is manually turned off at the switch, the system may still think it's on for up to 30 minutes, preventing proper PIR activation.

#### 2. **PIR Events Not Cleared When Light is Already On (Lines 619-626)**
When movement is detected and the light is already on, the code updates `last_event` but doesn't clear the `pir_events` list:

```python
if ueberkopflicht_an():
    if DEBUG:
        print("Licht bereits an – aktualisiere Inaktivitäts-Timer")
    last_event = now
    pir_active = True
    return  # pir_events list is NOT cleared here!
```

**Impact**: The `pir_events` list continues to accumulate, potentially causing unexpected behavior when the light turns off and back on.

#### 3. **Manual Override Exits Early (Lines 607-617)**
When manual override is active, the function returns early, potentially missing important PIR event processing:

```python
if now < manuell_override_bis:
    if ueberkopflicht_an():
        last_event = now
        # ... logging ...
    else:
        # ... logging ...
    return  # Early return prevents normal PIR processing
```

**Impact**: During manual override, PIR events aren't properly counted or processed, which could affect the automatic light activation after override expires.

#### 4. **Inconsistent State Updates**
The `update_light_cache()` function is called with the new state, but there's no verification that the actual hardware state matches:

```python
def update_light_cache(new_state):
    global cached_light_state, last_state_update_time
    cached_light_state = new_state  # Assumes the state change was successful
    last_state_update_time = time.time()
```

**Impact**: If a network error occurs during light switching, the cache may contain an incorrect state.

### Fixes Applied in 20250409_kitchenmove49_fixed.py:

1. **Reduced Cache Timeout**: Changed from 30 minutes to 5 minutes for more frequent state verification
   ```python
   CACHE_REFRESH_INTERVAL = 300  # 5 minutes instead of 30
   ```

2. **Enhanced `ueberkopflicht_an()` Function**: Added force_refresh parameter and better error handling
   ```python
   def ueberkopflicht_an(force_refresh=False):
       # Better handling of None responses from API calls
       # Force refresh option for critical operations
   ```

3. **Fixed PIR Event Handling**: Clear PIR events when light is already on
   ```python
   if ueberkopflicht_an():
       last_event = now
       if len(pir_events) > 0:
           pir_events.clear()  # Clear accumulated events
   ```

4. **Improved Debug Logging**: Added more detailed logging for PIR events to track timer updates

5. **Force Cache Updates**: Added `force_update=True` parameter to `update_light_cache()` for critical operations

### Testing Recommendations:

1. **Test Scenario 1**: Manually turn off light at physical switch while cache thinks it's on
   - Expected: PIR should detect the actual state within 5 minutes

2. **Test Scenario 2**: Trigger multiple PIR events while light is on
   - Expected: Timer should update and PIR events should be cleared

3. **Test Scenario 3**: Test manual override with continuous movement
   - Expected: Timer should update even during override period

4. **Test Scenario 4**: Simulate network failures during state changes
   - Expected: System should handle gracefully and update cache on next successful check