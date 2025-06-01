import M5 
from M5 import BtnA
import usocket as socket
import ujson, time, ntptime
from hardware import RGB
from unit import PIRUnit

# ==============================================================================
# CONFIGURATION
# ==============================================================================
class Config:
    """All configuration values in one place"""
    def __init__(self, test_mode=True, debug=True):
        self.DEBUG = debug
        self.TESTMODE = test_mode
        
        if test_mode:
            self.INAKT_TIMEOUT = 60          # Test: 60 sec inactivity
            self.EVENT_THRESHOLD = 5         # Test: 5 PIR events needed
            self.MANUAL_OVERRIDE_TIME = 60   # Test: 60 sec override
            self.AUTO_ON_NICHT_NACH = 1500   # Test: Always "dark enough"
        else:
            self.INAKT_TIMEOUT = 300         # Prod: 300 sec (5 min)
            self.EVENT_THRESHOLD = 12        # Prod: 12 PIR events
            self.MANUAL_OVERRIDE_TIME = 900  # Prod: 900 sec (15 min)
            self.AUTO_ON_NICHT_NACH = 22 * 60  # Prod: 22:00 (10 PM)
        
        # Network addresses
        self.SHELLY_IP = "10.80.23.51"
        self.SHELLY_PORT = 80
        self.NANOLEAF_IP = "10.80.23.56"
        self.NANOLEAF_PORT = 16021
        self.WLED_IP = "10.80.23.22"
        
        # NTP
        self.NTP_HOST = "ntp1.lrz.de"
        self.NTP_SYNC_INTERVAL = 43200  # 12 hours
        
        # Button
        self.LONG_PRESS_THRESHOLD = 1.5  # seconds
        self.DOUBLE_CLICK_TIME = 0.5  # Max time between clicks for double click
        
        # WLED configs (DO NOT MODIFY - exact API format required)
        self.WLED_JSON_EIN = {
            "on": True,
            #"on": False,    #at the moment the acutal turn on is intentionally disabled - still api call made etc.
            "bri": 151,
            "transition": 7,
            "mainseg": 0,
            "seg": [{
                "id": 0, "start": 0, "stop": 16, "startY": 0, "stopY": 8, "grp": 1,
                "spc": 0, "of": 0, "on": True, "frz": False, "bri": 255, "cct": 127,
                "set": 0, "n": "Essen kommen JETZT!!!!",
                "col": [[255, 0, 0], [0, 0, 0], [0, 0, 0]],
                "fx": 122, "sx": 128, "ix": 128, "pal": 8
            }]
        }
        self.WLED_JSON_AUS = {"on": False}
        
        # Sunset times by month
        self.sun_times = { 
            1: {"sunset_schaltzeit": "15:00"},
            2: {"sunset_schaltzeit": "16:20"},
            3: {"sunset_schaltzeit": "16:30"},
            4: {"sunset_schaltzeit": "17:10"},
            5: {"sunset_schaltzeit": "17:50"},
            6: {"sunset_schaltzeit": "18:30"},
            7: {"sunset_schaltzeit": "18:30"},
            8: {"sunset_schaltzeit": "18:00"},
            9: {"sunset_schaltzeit": "17:00"},
            10: {"sunset_schaltzeit": "16:30"},
            11: {"sunset_schaltzeit": "15:30"},
            12: {"sunset_schaltzeit": "15:00"}
        }
        
        # LED colors
        self.LED_COLORS = {
            "GRUEN": 0x00FF00,
            "GRUEN_PIR": 0x00FF00,
            "ROT": 0xFF0000,
            "AUS": 0x000000,
            "BLAU": 0x0000FF,
            "WEISS": 0xFFFFFF,
        }
        
        # Cache settings
        self.CACHE_REFRESH_INTERVAL = 1800  # 30 minutes

# ==============================================================================
# TIME UTILITIES
# ==============================================================================
class TimeUtils:
    """All time-related utilities"""
    
    @staticmethod
    def format_debug_time(tm):
        """Format time for debug output"""
        day = tm[2]
        month = tm[1]
        hour = tm[3]
        minute = tm[4]
        second = tm[5]
        month_names = {1:"Jan", 2:"Feb", 3:"Mar", 4:"Apr", 5:"May", 6:"Jun", 
                      7:"Jul", 8:"Aug", 9:"Sep", 10:"Oct", 11:"Nov", 12:"Dec"}
        return "{:02d} {} {:02d}:{:02d}:{:02d}  ".format(
            day, month_names.get(month, "??"), hour, minute, second)
    
    @staticmethod
    def day_of_week(year, month, day):
        """Calculate day of week"""
        if month < 3:
            month += 12
            year -= 1
        K = year % 100
        J = year // 100
        return (day + (13*(month+1))//5 + K + K//4 + J//4 + 5*J) % 7
    
    @staticmethod
    def last_sunday(year, month):
        """Find last Sunday of month"""
        last_day = 31
        h = TimeUtils.day_of_week(year, month, last_day)
        offset = (h - 1) % 7
        return last_day - offset
    
    @staticmethod
    def is_dst_germany(tm):
        """Check if German DST is active"""
        year, month, day, hour, minute, second, weekday, yearday = tm
        if month < 3 or month > 10:
            return False
        if 4 <= month <= 9:
            return True
        ls = TimeUtils.last_sunday(year, month)
        if month == 3:
            return (day > ls) or (day == ls and hour >= 2)
        else:
            return (day < ls) or (day == ls and hour < 3)
    
    @staticmethod
    def get_germany_offset():
        """Get timezone offset for Germany"""
        winter_offset = 7200
        summer_offset = 10800
        tentative = time.localtime(time.time() + winter_offset)
        return summer_offset if TimeUtils.is_dst_germany(tentative) else winter_offset
    
    @staticmethod
    def local_time():
        """Get local German time"""
        offset = TimeUtils.get_germany_offset()
        return time.localtime(time.time() + offset)

# ==============================================================================
# COLOR UTILITIES
# ==============================================================================
class ColorUtils:
    """Color conversion utilities for LED feedback"""
    
    @staticmethod
    def hsv_to_rgb(h, s, v):
        """Convert HSV to RGB"""
        h, s, v = float(h), float(s), float(v)
        hi = int(h / 60) % 6
        f = (h / 60) - hi
        p = v * (1 - s)
        q = v * (1 - f * s)
        t = v * (1 - (1 - f) * s)
        if hi == 0:
            return (int(v * 255), int(t * 255), int(p * 255))
        elif hi == 1:
            return (int(q * 255), int(v * 255), int(p * 255))
        elif hi == 2:
            return (int(p * 255), int(v * 255), int(t * 255))
        elif hi == 3:
            return (int(p * 255), int(q * 255), int(v * 255))
        elif hi == 4:
            return (int(t * 255), int(p * 255), int(v * 255))
        else:
            return (int(v * 255), int(p * 255), int(q * 255))
    
    @staticmethod
    def rgb_tuple_to_int(rgb_tuple):
        """Convert RGB tuple to integer"""
        r, g, b = rgb_tuple
        return (r << 16) | (g << 8) | b
    
    @staticmethod
    def step_to_hue(step, max_steps):
        """Convert step to hue value (red to green)"""
        return 0 if step <= 1 else ((step - 1) / (max_steps - 1)) * 120
    
    @staticmethod
    def step_to_rgb(step, max_steps):
        """Convert step to RGB color"""
        hue = ColorUtils.step_to_hue(step, max_steps)
        return ColorUtils.rgb_tuple_to_int(ColorUtils.hsv_to_rgb(hue, 1, 1))

# ==============================================================================
# SECRET MANAGEMENT
# ==============================================================================
class SecretManager:
    """Manages secrets from .env file"""
    
    @staticmethod
    def load_env(filename=".env"):
        """Load secrets from .env file"""
        secrets = {}
        try:
            with open(filename) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    secrets[key] = value
        except OSError:
            print("Fehler: .env-Datei konnte nicht geladen werden.")
        return secrets
    
    @staticmethod
    def get_nanoleaf_url():
        """Get Nanoleaf API URL with key"""
        secrets = SecretManager.load_env()
        nanoleaf_key = secrets.get("NANOLEAF_API_KEY")
        if nanoleaf_key:
            print("API Key geladen: ******************" + nanoleaf_key[-5:])
            return f"/api/v1/{nanoleaf_key}/state"
        else:
            print("API Key nicht gefunden.")
            raise ValueError("NANOLEAF_API_KEY fehlt in der .env-Datei!")

# ==============================================================================
# API WRAPPERS (DO NOT MODIFY API CALLS!)
# ==============================================================================
class NanoleafAPI:
    """Wrapper for Nanoleaf API calls - DO NOT MODIFY THE API CALLS"""
    
    def __init__(self, config, debug_logger, led_controller=None):
        self.config = config
        self.logger = debug_logger
        self.url = SecretManager.get_nanoleaf_url()
        self.led_controller = led_controller
    
    def _empfange_daten(self, sock, laenge):
        """EXACT COPY - DO NOT MODIFY"""
        daten = b""
        while len(daten) < laenge:
            teil = sock.recv(1024)
            if not teil:
                break
            daten += teil
        return daten.decode()
    
    def _extrahiere_json(self, antwort):
        """EXACT COPY - DO NOT MODIFY"""
        start = antwort.find("{")
        ende = antwort.rfind("}") + 1
        return antwort[start:ende] if start != -1 and ende > start else ""
    
    def lese_status(self):
        """EXACT COPY - DO NOT MODIFY"""
        # Start blinking if LED not active
        if self.led_controller and not self.led_controller.display_active:
            self.led_controller.start_blinking("WEISS", 0.5)
        
        try:
            s = socket.socket()
            s.connect((self.config.NANOLEAF_IP, self.config.NANOLEAF_PORT))
            anfrage = "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(
                self.url, self.config.NANOLEAF_IP)
            s.send(anfrage.encode())
            antwort = s.recv(1024).decode()
            laenge = 0
            for zeile in antwort.split("\r\n"):
                if zeile.lower().startswith("content-length:"):
                    laenge = int(zeile.split(":")[1].strip())
            json_str = self._empfange_daten(s, laenge) if laenge else ""
            s.close()
            json_str = self._extrahiere_json(json_str)
            if json_str:
                result = ujson.loads(json_str).get("on", {}).get("value", False)
                # Stop blinking on success
                if self.led_controller:
                    self.led_controller.stop_blinking()
                return result
        except Exception as e:
            self.logger.log("NL-Fehler: {} - retry in 30 Sek.".format(e))
        finally:
            # Always stop blinking
            if self.led_controller:
                self.led_controller.stop_blinking()
        return None
    
    def setze(self, ein):
        """EXACT COPY - DO NOT MODIFY"""
        # Start blinking if LED not active
        if self.led_controller and not self.led_controller.display_active:
            self.led_controller.start_blinking("WEISS", 0.5)
        
        try:
            s = socket.socket()
            s.connect((self.config.NANOLEAF_IP, self.config.NANOLEAF_PORT))
            payload = '{"on":{"value":' + ('true' if ein else 'false') + '}}'
            anfrage = "PUT {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}".format(
                self.url, self.config.NANOLEAF_IP, len(payload), payload)
            s.send(anfrage.encode())
            s.recv(1024)
            s.close()
            self.logger.log("NL => {} - Zustand aktualisiert.".format("EIN" if ein else "AUS"))
        except Exception as e:
            self.logger.log("NL-SetFehler: {} - retry in 30 Sek.".format(e))
        finally:
            # Always stop blinking
            if self.led_controller:
                self.led_controller.stop_blinking()

class ShellyAPI:
    """Wrapper for Shelly API calls - DO NOT MODIFY THE API CALLS"""
    
    def __init__(self, config, debug_logger, led_controller=None):
        self.config = config
        self.logger = debug_logger
        self.led_controller = led_controller
    
    def setze(self, zustand):
        """EXACT COPY - DO NOT MODIFY"""
        # Start blinking if LED not active
        if self.led_controller and not self.led_controller.display_active:
            self.led_controller.start_blinking("WEISS", 0.5)
        
        body = '{"id":0,"on":' + ('true' if zustand == "ein" else 'false') + '}'
        anfrage = "POST /rpc/Switch.Set HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}".format(
            self.config.SHELLY_IP, len(body), body)
        try:
            addr = socket.getaddrinfo(self.config.SHELLY_IP, self.config.SHELLY_PORT)[0][-1]
            s = socket.socket()
            s.connect(addr)
            s.send(anfrage.encode())
            s.recv(2048)
            s.close()
            self.logger.log("Shelly => {} - Zustand aktualisiert.".format(zustand.upper()))
        except Exception as e:
            self.logger.log("Shelly-Fehler: {} - retry in 30 Sek.".format(e))
        finally:
            # Always stop blinking
            if self.led_controller:
                self.led_controller.stop_blinking()
    
    def lese_status(self):
        """EXACT COPY - DO NOT MODIFY"""
        # Start blinking if LED not active
        if self.led_controller and not self.led_controller.display_active:
            self.led_controller.start_blinking("WEISS", 0.5)
        
        anfrage = "GET /rpc/Switch.GetStatus?id=0 HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(
            self.config.SHELLY_IP)
        try:
            addr = socket.getaddrinfo(self.config.SHELLY_IP, self.config.SHELLY_PORT)[0][-1]
            s = socket.socket()
            s.connect(addr)
            s.send(anfrage.encode())
            antwort = b""
            while True:
                teil = s.recv(2048)
                if not teil:
                    break
                antwort += teil
            s.close()
            start = antwort.find(b"{")
            if start != -1:
                result = ujson.loads(antwort[start:].decode("utf-8")).get("output", False)
                # Stop blinking on success
                if self.led_controller:
                    self.led_controller.stop_blinking()
                return result
        except Exception as e:
            self.logger.log("Shelly-Status Fehler: {} - retry in 30 Sek.".format(e))
        finally:
            # Always stop blinking
            if self.led_controller:
                self.led_controller.stop_blinking()
        return None

class WLEDAPI:
    """Wrapper for WLED API calls - DO NOT MODIFY THE API CALLS"""
    
    def __init__(self, config, debug_logger, led_controller=None):
        self.config = config
        self.logger = debug_logger
        self.led_controller = led_controller
    
    def anfrage(self, methode="GET", daten=None, versuche=5):
        """EXACT COPY - DO NOT MODIFY"""
        # Start blinking if LED not active
        if self.led_controller and not self.led_controller.display_active:
            self.led_controller.start_blinking("WEISS", 0.5)
        
        for _ in range(versuche):
            try:
                addr = socket.getaddrinfo(self.config.WLED_IP, 80)[0][-1]
                s = socket.socket()
                s.connect(addr)
                if methode == "GET" and daten is None:
                    req = "GET /json/state HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(
                        self.config.WLED_IP)
                    s.send(req.encode())
                elif methode == "POST" and daten is not None:
                    body = ujson.dumps(daten)
                    header = "POST /json/state HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n".format(
                        self.config.WLED_IP, len(body))
                    s.send(header.encode())
                    s.send(body.encode())
                else:
                    raise ValueError("Param.-Fehler.")
                antwort = s.recv(2048)
                s.close()
                if antwort:
                    # Stop blinking on success
                    if self.led_controller:
                        self.led_controller.stop_blinking()
                    return antwort
            except Exception as e:
                self.logger.log("WLED Fehler: {} - retry in 1 Sek.".format(e))
                time.sleep(1)
        # Stop blinking after all retries
        if self.led_controller:
            self.led_controller.stop_blinking()
        return b""
    
    def aktualisiere_status(self):
        """Get current WLED status"""
        antwort = self.anfrage("GET")
        if not antwort:
            return None
        teile = antwort.decode("utf-8").split("\r\n\r\n", 1)
        try:
            return ujson.loads(teile[1]).get("on", False) if len(teile) > 1 else None
        except Exception as e:
            self.logger.log("WLED Aktu-Fehler: {} - retry in 30 Sek.".format(e))
            return None
    
    def setze(self, daten):
        """Set WLED state"""
        antwort = self.anfrage("POST", daten)
        if antwort:
            new_status = bool(daten.get("on", False))
            self.logger.log("WLED => {} - Zustand aktualisiert.".format(
                "EIN" if new_status else "AUS"))
            return new_status
        return None

# ==============================================================================
# NTP TIME SYNCHRONIZATION
# ==============================================================================
class NTPSync:
    """NTP time synchronization"""
    
    def __init__(self, config, debug_logger):
        self.config = config
        self.logger = debug_logger
        self.zeit_sync = False
        self.last_sync = 0
    
    def sync_zeit(self, versuche=10, intervall=30):
        """Synchronize time with NTP server"""
        ntptime.host = self.config.NTP_HOST
        self.logger.log("NTP-Sync: Host={}".format(self.config.NTP_HOST))
        
        for versuch in range(1, versuche + 1):
            try:
                self.logger.log("NTP {}/{}: retry in {} Sek.".format(
                    versuch, versuche, intervall))
                ntptime.settime()
                self.zeit_sync = True
                self.last_sync = time.time()
                self.logger.log("Sync OK -> {} (next in 43200 Sek.)".format(
                    TimeUtils.local_time()))
                return True
            except Exception as e:
                self.logger.log("NTP {}/{} fehl: {} - retry in {} Sek.".format(
                    versuch, versuche, e, intervall))
                time.sleep(intervall)
        
        self.zeit_sync = False
        self.logger.log("NTP fehlgeschl.: Sync=False")
        return False
    
    def should_resync(self):
        """Check if resync is needed"""
        return time.time() - self.last_sync >= self.config.NTP_SYNC_INTERVAL

# ==============================================================================
# DEBUG LOGGER
# ==============================================================================
class DebugLogger:
    """Centralized debug logging"""
    
    def __init__(self, config):
        self.config = config
    
    def log(self, message):
        """Log message with timestamp if debug enabled"""
        if self.config.DEBUG:
            print("{} {}".format(TimeUtils.format_debug_time(TimeUtils.local_time()), message))

# ==============================================================================
# LED CONTROLLER
# ==============================================================================
class LEDController:
    """Controls the status LED with duration and override logic"""
    
    def __init__(self, config, debug_logger, led_rgb):
        self.config = config
        self.logger = debug_logger
        self.led_rgb = led_rgb
        self.display_active = False
        self.display_expiry = 0
        self.display_color = None
        self.display_start = 0
        # Blinking state
        self.is_blinking = False
        self.blink_color = None
        self.blink_interval = 0.5
        self.blink_last_toggle = 0
        self.blink_state = False  # False=off, True=on
    
    def display(self, color, duration=2, force_override=False):
        """Display color for specified duration"""
        now = time.time()
        
        # Stop any blinking when displaying
        if self.is_blinking:
            self.stop_blinking()
        
        if color == "AUS":
            self.display_active = False
            self.led_rgb.fill_color(self.config.LED_COLORS["AUS"])
            self.logger.log("LED aus. (0 Sek.)")
            return
        
        # Check if display is already active and not expired
        if not force_override and self.display_active and now < self.display_expiry:
            remaining = int(self.display_expiry - now)
            self.logger.log("LED aktiv bis {} ({} Sek. zb.), ignoriert.".format(
                int(self.display_expiry), remaining))
            return
        
        # Set new display
        self.display_active = True
        self.display_expiry = now + duration
        self.display_color = color
        self.display_start = now
        
        # Set color
        if color == "WEISS_BLINKEN":
            self.led_rgb.fill_color(0xFFFFFF)
        elif color in self.config.LED_COLORS:
            self.led_rgb.fill_color(self.config.LED_COLORS[color])
        else:
            try:
                col = int(color, 0) if isinstance(color, str) else color
            except Exception:
                col = self.config.LED_COLORS["AUS"]
            self.led_rgb.fill_color(col)
        
        self.logger.log("LED {} für {} Sek. an.".format(color, duration))
    
    def start_blinking(self, color="WEISS", blink_interval=0.5):
        """Start blinking the LED"""
        if self.display_active:
            # Don't interrupt active display
            return
        
        self.is_blinking = True
        self.blink_color = color
        self.blink_interval = blink_interval
        self.blink_last_toggle = time.time()
        self.blink_state = True  # Start with LED on
        
        # Turn LED on immediately
        if color in self.config.LED_COLORS:
            self.led_rgb.fill_color(self.config.LED_COLORS[color])
        else:
            self.led_rgb.fill_color(0xFFFFFF)  # Default white
        
        self.logger.log("LED-Blinken gestartet: {} (Intervall: {}s)".format(color, blink_interval))
    
    def stop_blinking(self):
        """Stop blinking the LED"""
        if self.is_blinking:
            self.is_blinking = False
            self.blink_color = None
            self.blink_state = False
            self.led_rgb.fill_color(self.config.LED_COLORS["AUS"])
            self.logger.log("LED-Blinken gestoppt.")
    
    def update(self):
        """Update LED display, turn off if expired, handle blinking"""
        now = time.time()
        
        # Handle blinking
        if self.is_blinking and not self.display_active:
            if now - self.blink_last_toggle >= self.blink_interval:
                self.blink_state = not self.blink_state
                self.blink_last_toggle = now
                if self.blink_state:
                    # Turn on
                    if self.blink_color in self.config.LED_COLORS:
                        self.led_rgb.fill_color(self.config.LED_COLORS[self.blink_color])
                    else:
                        self.led_rgb.fill_color(0xFFFFFF)  # Default white
                else:
                    # Turn off
                    self.led_rgb.fill_color(self.config.LED_COLORS["AUS"])
        
        # Handle regular display expiry
        elif self.display_active and now >= self.display_expiry:
            self.led_rgb.fill_color(self.config.LED_COLORS["AUS"])
            self.display_active = False
            self.display_expiry = 0
            self.display_color = None
            self.logger.log("LED-Dauer abgelaufen, LED aus.")

# ==============================================================================
# DARKNESS CHECKER
# ==============================================================================
class DarknessChecker:
    """Checks if it's dark enough for automatic light activation"""
    
    def __init__(self, config, ntp_sync, debug_logger):
        self.config = config
        self.ntp_sync = ntp_sync
        self.logger = debug_logger
        self.test_mode_override = False  # Test mode override
    
    def ermittle_sunset_schaltzeit_minuten(self):
        """Get sunset switching time in minutes for current month"""
        current_month = TimeUtils.local_time()[1]
        time_str = self.config.sun_times.get(current_month, {"sunset_schaltzeit": "16:30"})["sunset_schaltzeit"]
        hours, minutes = map(int, time_str.split(':'))
        return hours * 60 + minutes
    
    def ist_dunkel_genug(self):
        """Check if it's dark enough for automatic light activation"""
        # Test mode override - always dark
        if self.test_mode_override:
            self.logger.log("Test-Modus aktiv => immer dunkel")
            return True
            
        # No time sync = assume dark (fail-safe)
        if not self.ntp_sync.zeit_sync:
            self.logger.log("Kein Sync => dunkel (schnell Prüfen)")
            return True
        
        lt = TimeUtils.local_time()
        aktuelle_min = lt[3] * 60 + lt[4]
        
        # After 22:00 (or configured time) - no auto-on
        if aktuelle_min >= self.config.AUTO_ON_NICHT_NACH:
            secs = (24*60 - aktuelle_min) * 60
            self.logger.log("Nach 22:00: Auto-Off ({} Sek. bis Tagesw.)".format(secs))
            return False
        
        # Check against sunset time
        schaltzeit = self.ermittle_sunset_schaltzeit_minuten()
        if aktuelle_min >= schaltzeit:
            self.logger.log("Dunkel: Auto-On (prüf in 60 Sek.)")
            return True
        else:
            remaining = (schaltzeit - aktuelle_min) * 60
            self.logger.log("Zu hell - prüf in {} Sek.".format(remaining))
            return False

# ==============================================================================
# LIGHT STATE CACHE
# ==============================================================================
class LightStateCache:
    """Caches light state to reduce API calls"""
    
    def __init__(self, config, shelly_api, nanoleaf_api, debug_logger):
        self.config = config
        self.shelly_api = shelly_api
        self.nanoleaf_api = nanoleaf_api
        self.logger = debug_logger
        self.last_state_update_time = 0
        self.cached_light_state = False
    
    def update_cache(self, new_state):
        """Update cached state"""
        self.cached_light_state = new_state
        self.last_state_update_time = time.time()
    
    def get_light_state(self, force_refresh=False):
        """Get current light state (cached or fresh)"""
        now = time.time()
        
        # Use cache if still valid
        if not force_refresh and now - self.last_state_update_time < self.config.CACHE_REFRESH_INTERVAL:
            return self.cached_light_state
        
        # Refresh from APIs
        shelly_state = self.shelly_api.lese_status() or False
        nanoleaf_state = self.nanoleaf_api.lese_status() or False
        updated_state = shelly_state or nanoleaf_state
        
        self.cached_light_state = updated_state
        self.last_state_update_time = now
        
        self.logger.log("Zust.-akt. OK: Shelly={}, NL={}, Resultat={} - gültig für {} Sek.".format(
            shelly_state, nanoleaf_state, updated_state, self.config.CACHE_REFRESH_INTERVAL))
        
        return updated_state

# ==============================================================================
# PIR EVENT MANAGER
# ==============================================================================
class PIREventManager:
    """Manages PIR events and motion detection logic"""
    
    def __init__(self, config, debug_logger):
        self.config = config
        self.logger = debug_logger
        self.events = []
        self.last_reset = 0
        self.active = False
    
    def add_event(self, timestamp):
        """Add a PIR event"""
        self.events.append(timestamp)
        self.last_reset = timestamp
        return len(self.events)
    
    def clear_events(self):
        """Clear all events"""
        self.events.clear()
    
    def get_event_count(self):
        """Get current event count"""
        return len(self.events)
    
    def threshold_reached(self):
        """Check if event threshold is reached"""
        return len(self.events) >= self.config.EVENT_THRESHOLD

# ==============================================================================
# TIMER MANAGER
# ==============================================================================
class TimerManager:
    """Manages all timers in the system"""
    
    def __init__(self, config, debug_logger):
        self.config = config
        self.logger = debug_logger
        self.last_event = None
        self.manual_override_until = 0
        self.wled_auto_off_timer = None
    
    def set_last_event(self, timestamp=None):
        """Set last event timestamp"""
        self.last_event = timestamp if timestamp else time.time()
    
    def clear_last_event(self):
        """Clear last event timestamp"""
        self.last_event = None
    
    def is_inactive_timeout_reached(self):
        """Check if inactivity timeout is reached"""
        if self.last_event is None:
            return False
        return (time.time() - self.last_event) >= self.config.INAKT_TIMEOUT
    
    def get_remaining_inactive_time(self):
        """Get remaining time until auto-off"""
        if self.last_event is None:
            return None
        remaining = self.config.INAKT_TIMEOUT - (time.time() - self.last_event)
        return max(0, remaining)
    
    def set_manual_override(self, duration=None):
        """Set manual override timer"""
        if duration is None:
            duration = self.config.MANUAL_OVERRIDE_TIME
        self.manual_override_until = time.time() + duration
    
    def is_manual_override_active(self):
        """Check if manual override is active"""
        return time.time() < self.manual_override_until
    
    def get_manual_override_remaining(self):
        """Get remaining manual override time"""
        if not self.is_manual_override_active():
            return 0
        return int(self.manual_override_until - time.time())
    
    def set_wled_auto_off(self, duration=60):
        """Set WLED auto-off timer"""
        self.wled_auto_off_timer = time.time() + duration
    
    def clear_wled_auto_off(self):
        """Clear WLED auto-off timer"""
        self.wled_auto_off_timer = None
    
    def is_wled_auto_off_due(self):
        """Check if WLED should auto-off"""
        if self.wled_auto_off_timer is None:
            return False
        return time.time() >= self.wled_auto_off_timer

# ==============================================================================
# MAIN LIGHT CONTROLLER
# ==============================================================================
class MainLightController:
    """Controls Shelly and Nanoleaf lights"""
    
    def __init__(self, shelly_api, nanoleaf_api, light_cache, debug_logger):
        self.shelly_api = shelly_api
        self.nanoleaf_api = nanoleaf_api
        self.light_cache = light_cache
        self.logger = debug_logger
    
    def turn_on(self):
        """Turn on main lights"""
        self.logger.log("Raum belegt (auto): Shelly/NL werden eingeschaltet.")
        self.shelly_api.setze("ein")
        self.nanoleaf_api.setze(True)
        self.light_cache.update_cache(True)
    
    def turn_off(self):
        """Turn off main lights"""
        # Skip if already off (cached)
        if not self.light_cache.cached_light_state:
            self.logger.log("Licht ist bereits aus, Abschaltung wird übersprungen.")
            return
        
        self.logger.log("Raum unbelegt: Shelly/Nanoleaf werden ausgeschaltet.")
        self.shelly_api.setze("aus")
        self.nanoleaf_api.setze(False)
        self.light_cache.update_cache(False)
    
    def toggle(self):
        """Toggle lights, returns new state"""
        shelly_status = self.shelly_api.lese_status() or False
        nano_status = self.nanoleaf_api.lese_status() or False
        
        # If out of sync, turn both off
        if shelly_status != nano_status:
            self.shelly_api.setze("aus")
            self.nanoleaf_api.setze(False)
            self.logger.log("Toggle: out-of-sync -> AUS/AUS - manueller Toggle.")
            self.light_cache.update_cache(False)
            return False
        
        # If both on, turn off
        if shelly_status:
            self.shelly_api.setze("aus")
            self.nanoleaf_api.setze(False)
            self.logger.log("Toggle: beide AN -> AUS/AUS - manueller Toggle.")
            self.light_cache.update_cache(False)
            return False
        
        # If both off, turn on
        self.shelly_api.setze("ein")
        self.nanoleaf_api.setze(True)
        self.logger.log("Toggle: beide AUS -> EIN/EIN - manueller Toggle.")
        self.light_cache.update_cache(True)
        return True

# ==============================================================================
# WLED CONTROLLER
# ==============================================================================
class WLEDController:
    """Controls WLED strip"""
    
    def __init__(self, config, wled_api, led_controller, timer_manager, debug_logger):
        self.config = config
        self.wled_api = wled_api
        self.led_controller = led_controller
        self.timer_manager = timer_manager
        self.logger = debug_logger
        self.status = None
    
    def update_status(self):
        """Update WLED status from API"""
        self.status = self.wled_api.aktualisiere_status()
    
    def turn_on(self):
        """Turn on WLED with dinner notification"""
        new_status = self.wled_api.setze(self.config.WLED_JSON_EIN)
        if new_status is not None:
            self.status = True
            self.timer_manager.set_wled_auto_off(60)
            self.led_controller.display("GRUEN", 60, force_override=True)
    
    def turn_off(self):
        """Turn off WLED"""
        new_status = self.wled_api.setze(self.config.WLED_JSON_AUS)
        if new_status is not None:
            self.status = False
            self.timer_manager.clear_wled_auto_off()
            self.led_controller.display("ROT", 30, force_override=True)
    
    def toggle(self):
        """Toggle WLED state, returns new state"""
        if self.status is None or not self.status:
            self.turn_on()
            return True
        else:
            self.turn_off()
            return False
    
    def check_auto_off(self):
        """Check and execute auto-off if due"""
        if self.status and self.timer_manager.is_wled_auto_off_due():
            self.turn_off()

# ==============================================================================
# BUTTON HANDLER
# ==============================================================================
class ButtonHandler:
    """Handles button press logic"""
    
    def __init__(self, config, main_light_ctrl, wled_ctrl, timer_mgr, pir_mgr, debug_logger, darkness_checker=None, led_ctrl=None):
        self.config = config
        self.main_light_ctrl = main_light_ctrl
        self.wled_ctrl = wled_ctrl
        self.timer_mgr = timer_mgr
        self.pir_mgr = pir_mgr
        self.logger = debug_logger
        self.darkness_checker = darkness_checker
        self.led_ctrl = led_ctrl
        self.press_start = None
        self.last_release_time = 0
        self.click_pending = False
    
    def on_press(self):
        """Called when button is pressed"""
        if self.press_start is None:
            self.press_start = time.time()
    
    def on_release(self):
        """Called when button is released"""
        if self.press_start is None:
            return
        
        now = time.time()
        press_duration = now - self.press_start
        self.press_start = None
        
        if press_duration >= self.config.LONG_PRESS_THRESHOLD:
            # Long press - no double click possible
            self.click_pending = False
            self.handle_long_press()
        else:
            # Short press - check for double click
            if self.click_pending and (now - self.last_release_time) < self.config.DOUBLE_CLICK_TIME:
                # Double click detected!
                self.click_pending = False
                self.handle_double_click()
            else:
                # First click - wait for possible second
                self.click_pending = True
                self.last_release_time = now
    
    def handle_long_press(self):
        """Handle long press - toggle main lights"""
        self.logger.log("Button (Langdruck): Toggle Shelly/NL – manueller Override für {} Sek.".format(
            self.config.MANUAL_OVERRIDE_TIME))
        
        new_state = self.main_light_ctrl.toggle()
        self.timer_mgr.set_manual_override()
        self.pir_mgr.clear_events()
        
        # Set or clear inactivity timer based on new state
        if new_state:
            self.timer_mgr.set_last_event()
        else:
            self.timer_mgr.clear_last_event()
    
    def handle_short_press(self):
        """Handle short press - toggle WLED"""
        self.logger.log("Button (Kurzdruck): Toggle WLED.")
        
        new_state = self.wled_ctrl.toggle()
        
        # If WLED turned off, set manual override
        if not new_state:
            self.timer_mgr.set_manual_override()
            self.pir_mgr.clear_events()
            self.timer_mgr.clear_last_event()
    
    def handle_double_click(self):
        """Handle double click - toggle test mode"""
        if self.darkness_checker:
            self.darkness_checker.test_mode_override = not self.darkness_checker.test_mode_override
            
            if self.darkness_checker.test_mode_override:
                self.logger.log("TEST-MODUS AKTIVIERT - Button immer aktiv!")
                # 3x blue blink for confirmation
                if self.led_ctrl:
                    for _ in range(3):
                        self.led_ctrl.display("BLAU", 0.3, force_override=True)
                        time.sleep(0.3)
                        self.led_ctrl.display("AUS", 0.2, force_override=True)
                        time.sleep(0.2)
            else:
                self.logger.log("Test-Modus deaktiviert - normale Funktion")
                if self.led_ctrl:
                    self.led_ctrl.display("AUS", 0, force_override=True)

# ==============================================================================
# PIR HANDLER
# ==============================================================================
class PIRHandler:
    """Handles PIR sensor events"""
    
    def __init__(self, config, darkness_checker, timer_mgr, pir_mgr, main_light_ctrl, 
                 light_cache, led_ctrl, debug_logger):
        self.config = config
        self.darkness_checker = darkness_checker
        self.timer_mgr = timer_mgr
        self.pir_mgr = pir_mgr
        self.main_light_ctrl = main_light_ctrl
        self.light_cache = light_cache
        self.led_ctrl = led_ctrl
        self.logger = debug_logger
    
    def on_motion_detected(self, pir):
        """Called when motion is detected"""
        now = time.time()
        
        # Check if dark enough
        if not self.darkness_checker.ist_dunkel_genug():
            self.logger.log("PIR ignoriert: Es ist zu hell.")
            return
        
        # Check manual override
        if self.timer_mgr.is_manual_override_active():
            remaining = self.timer_mgr.get_manual_override_remaining()
            self.logger.log("Manueller Override aktiv ({} Sek. verbleibend), PIR-Ereignis wird ignoriert.".format(remaining))
            return
        
        # If lights already on, just reset timer
        if self.light_cache.get_light_state():
            remaining = int(1800 - (now - self.light_cache.last_state_update_time)) if now - self.light_cache.last_state_update_time < 1800 else 0
            self.logger.log("Licht bereits an – aktualisiere Inaktivitäts-Timer (nächste Prüfung in {} Sek.).".format(remaining))
            self.timer_mgr.set_last_event(now)
            self.pir_mgr.active = True
            return
        
        # Add event and check threshold
        self.logger.log("Bewegung erkannt (PIR) um {}.".format(int(now)))
        count = self.pir_mgr.add_event(now)
        self.timer_mgr.set_last_event(now)
        
        if count < self.config.EVENT_THRESHOLD:
            # Show progress LED
            color = ColorUtils.step_to_rgb(count, self.config.EVENT_THRESHOLD)
            self.logger.log("PIR {} von {}: LED-Farbe #{:06X}".format(
                count, self.config.EVENT_THRESHOLD, color))
            self.led_ctrl.display(color, 2)
        else:
            # Threshold reached - turn on lights
            self.logger.log("PIR-Schwellenwert erreicht: Starte automatisches Licht-Einschalten.")
            self.main_light_ctrl.turn_on()
            self.timer_mgr.set_last_event(now)
            self.pir_mgr.clear_events()
        
        self.pir_mgr.active = True
    
    def on_motion_stopped(self, pir):
        """Called when motion stops"""
        if self.timer_mgr.last_event is None:
            self.logger.log("PIR meldet keine Aktivität. Kein Bewegungstimer aktiv.")
        else:
            remaining = self.timer_mgr.get_remaining_inactive_time()
            self.logger.log("PIR meldet keine Aktivität.")
            if remaining is not None:
                self.logger.log("Schalte Licht ab in {:.0f} Sekunden.".format(remaining))
        
        self.pir_mgr.active = False

# ==============================================================================
# MAIN ORCHESTRATOR
# ==============================================================================
class KitchenLightOrchestrator:
    """Main orchestrator that coordinates all components"""
    
    def __init__(self):
        # Configuration
        self.config = Config(test_mode=False, debug=True)
        
        # Debug logger
        self.logger = DebugLogger(self.config)
        
        # Hardware components
        self.led_rgb = None
        self.pir_sensor = None
        
        # API wrappers
        self.nanoleaf_api = NanoleafAPI(self.config, self.logger)
        self.shelly_api = ShellyAPI(self.config, self.logger)
        self.wled_api = WLEDAPI(self.config, self.logger)
        
        # Core components
        self.ntp_sync = NTPSync(self.config, self.logger)
        self.led_controller = None
        self.darkness_checker = DarknessChecker(self.config, self.ntp_sync, self.logger)
        self.light_cache = LightStateCache(self.config, self.shelly_api, self.nanoleaf_api, self.logger)
        self.pir_manager = PIREventManager(self.config, self.logger)
        self.timer_manager = TimerManager(self.config, self.logger)
        
        # Controllers (initialized without LED controller first)
        self.main_light_controller = MainLightController(
            self.shelly_api, self.nanoleaf_api, self.light_cache, self.logger)
        self.wled_controller = None
        self.button_handler = None
        self.pir_handler = None
        
        # State
        self.raum_belegt = False
    
    def setup(self):
        """Initialize all components"""
        # Initialize M5Stack
        M5.begin()
        
        # Sync time
        self.ntp_sync.sync_zeit(versuche=10, intervall=30)
        
        # Initialize hardware
        self.led_rgb = RGB(io=35, n=1, type="SK6812")
        self.led_controller = LEDController(self.config, self.logger, self.led_rgb)
        
        # Set LED controller reference in API wrappers
        self.nanoleaf_api.led_controller = self.led_controller
        self.shelly_api.led_controller = self.led_controller
        self.wled_api.led_controller = self.led_controller
        
        self.pir_sensor = PIRUnit((1, 2))
        
        # Initialize controllers that need hardware
        self.wled_controller = WLEDController(
            self.config, self.wled_api, self.led_controller, self.timer_manager, self.logger)
        
        self.button_handler = ButtonHandler(
            self.config, self.main_light_controller, self.wled_controller,
            self.timer_manager, self.pir_manager, self.logger,
            self.darkness_checker, self.led_controller)
        
        self.pir_handler = PIRHandler(
            self.config, self.darkness_checker, self.timer_manager, self.pir_manager,
            self.main_light_controller, self.light_cache, self.led_controller, self.logger)
        
        # Setup PIR callbacks
        self.pir_sensor.set_callback(self.pir_handler.on_motion_detected, self.pir_sensor.IRQ_ACTIVE)
        self.pir_sensor.set_callback(self.pir_handler.on_motion_stopped, self.pir_sensor.IRQ_NEGATIVE)
        self.pir_sensor.enable_irq()
        
        # Boot confirmation: 3x green blink
        for i in range(3):
            self.led_rgb.fill_color(self.config.LED_COLORS["GRUEN"])
            time.sleep(0.2)
            self.led_rgb.fill_color(self.config.LED_COLORS["AUS"])
            time.sleep(0.2)
        
        # Turn off LED
        self.led_controller.display("AUS")
    
    def loop(self):
        """Main loop - called repeatedly"""
        M5.update()
        
        # Check for inactivity timeout (auto-off)
        if self.timer_manager.is_inactive_timeout_reached():
            self.logger.log("Inaktivität erkannt ({} Sek.) – schalte Licht aus.".format(
                int(time.time() - self.timer_manager.last_event)))
            self.main_light_controller.turn_off()
            self.timer_manager.clear_last_event()
            self.pir_manager.clear_events()
            self.raum_belegt = False
        
        # Update LED display
        self.led_controller.update()
        
        # Check NTP resync
        if self.ntp_sync.should_resync():
            self.logger.log("12h vorbei: erneute NTP-Synchronisation.")
            self.ntp_sync.sync_zeit(versuche=10, intervall=30)
        
        # Check WLED auto-off
        self.wled_controller.check_auto_off()
        
        # Check for pending click timeout (for double click detection)
        if self.button_handler.click_pending and (time.time() - self.button_handler.last_release_time) > self.config.DOUBLE_CLICK_TIME:
            # Single click timeout - execute short press
            self.button_handler.click_pending = False
            self.button_handler.handle_short_press()
        
        # Handle button
        if BtnA.isPressed():
            self.button_handler.on_press()
        else:
            self.button_handler.on_release()
        
        time.sleep(0.1)

# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    orchestrator = KitchenLightOrchestrator()
    
    while True:
        try:
            orchestrator.setup()
            while True:
                orchestrator.loop()
        except KeyboardInterrupt:
            print("{} Benutzer-Interrupt.".format(
                TimeUtils.format_debug_time(TimeUtils.local_time())))
            break
        except Exception as e:
            print("{} Fehler: {} – Neustart in 2 Sek.".format(
                TimeUtils.format_debug_time(TimeUtils.local_time()), e))
            time.sleep(2)
            print("{} Starte System neu...".format(
                TimeUtils.format_debug_time(TimeUtils.local_time())))