import time
import machine
import uasyncio
import ntptime
import ujson
import sys
import socket

# -------------------------------
# Globale Debug-Flags und Parameter
# -------------------------------
DEBUG = True
DEBUG_VERBOSE = True

TIME_SERVER = "ntp1.lrz.de"

SHELLY_IP = "10.80.23.51"
SHELLY_PORT = 80

NANOLEAF_IP = "10.80.23.56"
NANOLEAF_PORT = 16021
NANOLEAF_API_KEY = "kK2AbyyhXXNncr0Pw77RTy61pk3OrZnC"

WLED_IP = "10.80.23.22"

NTP_SYNC_INTERVAL = 12 * 3600      # alle 12 Stunden
NTP_MAX_ATTEMPTS = 10
NTP_RETRY_INTERVAL = 30

PIR_WINDOW = 300                   # 300 Sekunden
PIR_THRESHOLD = 15                 # mindestens 15 Events im Fenster
MIN_LIGHT_ON_DURATION = 15 * 60    # 15 Minuten Mindestbetriebsdauer nach Aktivierung
WLED_AUTO_OFF = 120                # 120 Sekunden Auto-Off für WLED
MANUAL_OVERRIDE_DURATION = 30 * 60 # 30 Minuten manueller Override
BUTTON_DEBOUNCE_TIME = 1500        # in ms

# Monatsabhängige Schaltzeiten (Beispielwerte)
MONTHLY_SWITCH_TIMES = {
    1: {"start": "17:00", "end": "23:00"},
    2: {"start": "17:00", "end": "23:00"},
    3: {"start": "17:00", "end": "23:00"},
    4: {"start": "17:00", "end": "23:00"},
    5: {"start": "17:00", "end": "23:00"},
    6: {"start": "17:00", "end": "23:00"},
    7: {"start": "17:00", "end": "23:00"},
    8: {"start": "17:00", "end": "23:00"},
    9: {"start": "17:00", "end": "23:00"},
    10: {"start": "17:00", "end": "23:00"},
    11: {"start": "17:00", "end": "23:00"},
    12: {"start": "17:00", "end": "23:00"}
}

# RGB-LED-Konfiguration (bekannte hardware.RGB-Bibliothek)
RGB_LED_PIN = 5
NUM_LEDS = 1

# WLED Payloads
wled_json_on = {
    "on": True,
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
wled_json_off = {"on": False}

# -------------------------------
# Socket-Funktionen für Shelly, Nanoleaf und WLED
# -------------------------------
def lese_shelly_status():
    anfrage = "GET /rpc/Switch.GetStatus?id=0 HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(SHELLY_IP)
    try:
        addr = socket.getaddrinfo(SHELLY_IP, SHELLY_PORT)[0][-1]
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
            return ujson.loads(antwort[start:].decode("utf-8")).get("output", False)
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler beim Lesen des Shelly-Status:", e)
    return None

def setze_shelly(zustand):
    body = '{"id":0,"on":' + ('true' if zustand == "ein" else 'false') + '}'
    anfrage = ("POST /rpc/Switch.Set HTTP/1.1\r\n"
               "Host: {}\r\n"
               "Content-Type: application/json\r\n"
               "Content-Length: {}\r\n"
               "Connection: close\r\n\r\n{}").format(SHELLY_IP, len(body), body)
    try:
        addr = socket.getaddrinfo(SHELLY_IP, SHELLY_PORT)[0][-1]
        s = socket.socket()
        s.connect(addr)
        s.send(anfrage.encode())
        s.recv(2048)
        s.close()
        if DEBUG:
            print("DEBUG: Shelly =>", zustand.upper())
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler bei Shelly:", e)

def lese_nanoleaf_status():
    anfrage = "GET /api/v1/{}/state HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(NANOLEAF_API_KEY, NANOLEAF_IP)
    try:
        addr = socket.getaddrinfo(NANOLEAF_IP, NANOLEAF_PORT)[0][-1]
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
            return ujson.loads(antwort[start:].decode("utf-8")).get("on", {}).get("value", False)
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler beim Lesen des Nanoleaf-Status:", e)
    return None

def setze_nanoleaf(zustand):
    body = ujson.dumps({"on": {"value": zustand}})
    anfrage = ("PUT /api/v1/{}/state HTTP/1.1\r\n"
               "Host: {}\r\n"
               "Content-Type: application/json\r\n"
               "Content-Length: {}\r\n"
               "Connection: close\r\n\r\n{}").format(NANOLEAF_API_KEY, NANOLEAF_IP, len(body), body)
    try:
        addr = socket.getaddrinfo(NANOLEAF_IP, NANOLEAF_PORT)[0][-1]
        s = socket.socket()
        s.connect(addr)
        s.send(anfrage.encode())
        s.recv(2048)
        s.close()
        if DEBUG:
            print("DEBUG: Nanoleaf =>", "AN" if zustand else "AUS")
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler bei Nanoleaf:", e)

def wled_anfrage(methode="GET", daten=None, versuche=5):
    for _ in range(versuche):
        try:
            addr = socket.getaddrinfo(WLED_IP, 80)[0][-1]
            s = socket.socket()
            s.connect(addr)
            if methode == "GET" and daten is None:
                req = "GET /json/state HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(WLED_IP)
                s.send(req.encode())
            elif methode == "POST" and daten is not None:
                body = ujson.dumps(daten)
                header = ("POST /json/state HTTP/1.1\r\n"
                          "Host: {}\r\n"
                          "Content-Type: application/json\r\n"
                          "Content-Length: {}\r\n"
                          "Connection: close\r\n\r\n").format(WLED_IP, len(body))
                s.send(header.encode())
                s.send(body.encode())
            else:
                raise ValueError("Parameterfehler.")
            antwort = s.recv(2048)
            s.close()
            if antwort:
                return antwort
        except Exception as e:
            if DEBUG:
                print("DEBUG: WLED-Anfrage Fehler:", e)
            time.sleep(1)
    return b""

def setze_wled(daten):
    # Hier wird nur der Status geändert – keine LED-Farbe gesetzt.
    antwort = wled_anfrage("POST", daten)
    if antwort:
        if DEBUG:
            print("DEBUG: WLED =>", "EIN" if daten.get("on", False) else "AUS")
            print("DEBUG: WLED Status geändert, LED bleibt aus")

# -------------------------------
# Klassen: Zeit, RGB-LED, Sensoren, Taster und Geräte-Controller
# -------------------------------
class TimeManager:
    def __init__(self):
        self.last_sync = 0

    async def sync_time(self):
        attempts = 0
        while attempts < NTP_MAX_ATTEMPTS:
            try:
                ntptime.host = TIME_SERVER
                ntptime.settime()
                self.last_sync = time.time()
                print("Zeit synchronisiert:", time.localtime())
                return True
            except Exception as e:
                print("NTP Sync Fehler:", e)
                attempts += 1
                await uasyncio.sleep(NTP_RETRY_INTERVAL)
        print("NTP Sync fehlgeschlagen!")
        return False

    def is_dark(self):
        t = time.localtime()
        month = t[1]
        hour = t[3]
        minute = t[4]
        config = MONTHLY_SWITCH_TIMES.get(month, {"start": "17:00", "end": "23:00"})
        start_hour, start_minute = map(int, config["start"].split(":"))
        end_hour, end_minute = map(int, config["end"].split(":"))
        current_minutes = hour * 60 + minute
        start_minutes = start_hour * 60 + start_minute
        end_minutes = end_hour * 60 + end_minute
        if DEBUG_VERBOSE:
            print(f"DEBUG: current_minutes={current_minutes}, start_minutes={start_minutes}, end_minutes={end_minutes}")
        return start_minutes <= current_minutes < end_minutes

# RGB-LED Statusanzeige
from hardware import RGB

class RGBLEDIndicator:
    def __init__(self):
        self.rgb = RGB(io=RGB_LED_PIN, n=NUM_LEDS, type="SK6812")
        self.blinking = False

    def set_color(self, color):
        self.rgb.fill_color(color)
        if DEBUG_VERBOSE:
            print(f"DEBUG: RGB set_color: {hex(color)}")

    async def blink(self, color, interval=0.5, duration=5):
        if self.blinking:
            return
        self.blinking = True
        end_time = time.time() + duration
        while time.time() < end_time:
            self.set_color(color)
            await uasyncio.sleep(interval)
            self.set_color(0x000000)
            await uasyncio.sleep(interval)
        self.blinking = False

# PIR-Sensor
class PIRSensor:
    def __init__(self, pin_no):
        self.pin = machine.Pin(pin_no, machine.Pin.IN)
        self.events = []

    def check_motion(self):
        if self.pin.value():
            self.events.append(time.time())
            print("PIR Event hinzugefügt")
            return True
        return False

    def get_event_count(self):
        current = time.time()
        self.events = [t for t in self.events if current - t <= PIR_WINDOW]
        return len(self.events)

    def reset_events(self):
        self.events = []
        print("PIR Ereignisse zurückgesetzt")

# Taster für manuelle Steuerung
class ButtonController:
    def __init__(self, pin_no):
        self.pin = machine.Pin(pin_no, machine.Pin.IN, machine.Pin.PULL_UP)
        self.last_state = self.pin.value()
        self.press_start = None

    def read(self):
        current_state = self.pin.value()
        if self.last_state == 1 and current_state == 0:
            self.press_start = time.ticks_ms()
        elif self.last_state == 0 and current_state == 1:
            if self.press_start is not None:
                press_duration = time.ticks_diff(time.ticks_ms(), self.press_start)
                self.press_start = None
                return press_duration
        self.last_state = current_state
        return None

# Geräte-Controller mittels Sockets (mit eingebautem weiß blinkenden LED-Status beim Statusabruf)
class ShellyController:
    def __init__(self, rgb_led):
        self.rgb_led = rgb_led

    async def get_state(self):
        blink_task = uasyncio.create_task(self.rgb_led.blink(0xFFFFFF, interval=0.2, duration=0.5))
        state = lese_shelly_status()
        try:
            await blink_task
        except uasyncio.CancelledError:
            pass
        if DEBUG_VERBOSE:
            print("Shelly state:", "AN" if state else "AUS")
        return state

    async def set_state(self, state: bool):
        if state:
            setze_shelly("ein")
        else:
            setze_shelly("aus")
        if DEBUG_VERBOSE:
            print("Shelly set_state =>", "AN" if state else "AUS")
        return state

class NanoleafController:
    def __init__(self, rgb_led):
        self.rgb_led = rgb_led

    async def get_state(self, force_refresh=False):
        blink_task = uasyncio.create_task(self.rgb_led.blink(0xFFFFFF, interval=0.2, duration=0.5))
        state = lese_nanoleaf_status()
        try:
            await blink_task
        except uasyncio.CancelledError:
            pass
        if DEBUG_VERBOSE:
            print("Nanoleaf state:", "AN" if state else "AUS")
        return state

    async def set_state(self, state: bool):
        setze_nanoleaf(state)
        if DEBUG_VERBOSE:
            print("Nanoleaf set_state =>", "AN" if state else "AUS")
        return state

class WLEDController:
    def __init__(self, rgb_led):
        self.rgb_led = rgb_led

    async def get_state(self):
        blink_task = uasyncio.create_task(self.rgb_led.blink(0xFFFFFF, interval=0.2, duration=0.5))
        antwort = wled_anfrage("GET")
        try:
            await blink_task
        except uasyncio.CancelledError:
            pass
        if antwort:
            teile = antwort.decode("utf-8").split("\r\n\r\n", 1)
            try:
                state = ujson.loads(teile[1]).get("on", False) if len(teile) > 1 else False
            except Exception as e:
                if DEBUG_VERBOSE:
                    print("DEBUG: Fehler beim Verarbeiten von WLED GET:", e)
                state = False
        else:
            state = None
        if DEBUG_VERBOSE:
            print("WLED state:", "AN" if state else "AUS")
        return state

    async def set_state(self, state: bool):
        payload = wled_json_on if state else wled_json_off
        setze_wled(payload)
        if DEBUG_VERBOSE:
            print("WLED set_state =>", "AN" if state else "AUS")
        return state

    async def start_auto_off(self):
        await uasyncio.sleep(WLED_AUTO_OFF)
        await self.set_state(False)
        if DEBUG_VERBOSE:
            print("WLED Auto-Off aktiviert")

# -------------------------------
# Hauptsteuerung
# -------------------------------
class MainController:
    def __init__(self):
        self.time_manager = TimeManager()
        self.rgb_led = RGBLEDIndicator()
        self.shelly = ShellyController(self.rgb_led)
        self.nanoleaf = NanoleafController(self.rgb_led)
        self.wled = WLEDController(self.rgb_led)
        self.pir_sensor = PIRSensor(pin_no=12)      # Beispiel-Pin für PIR
        self.button = ButtonController(pin_no=0)      # Beispiel-Pin für Taster
        self.manual_override = False
        self.manual_override_expiry = 0
        self.last_light_activation = 0

    async def initial_status_query(self):
        # Direkt beim Booten: LED blinkt weiß, dann wird der aktuelle Geräte-Status abgefragt.
        await self.rgb_led.blink(0xFFFFFF, interval=0.2, duration=1)
        s_state = await self.shelly.get_state()
        n_state = await self.nanoleaf.get_state()
        w_state = await self.wled.get_state()
        print("DEBUG: Initialer Geräte-Status: Shelly:", "AN" if s_state else "AUS",
              ", Nanoleaf:", "AN" if n_state else "AUS",
              ", WLED:", "AN" if w_state else "AUS")

    async def sensor_task(self):
        while True:
            self.pir_sensor.check_motion()
            press_duration = self.button.read()
            if press_duration is not None:
                print("Taster gedrückt, Dauer:", press_duration, "ms")
                if press_duration < BUTTON_DEBOUNCE_TIME:
                    # Kurzdruck: WLED umschalten
                    w_state = await self.wled.get_state()
                    new_state = not w_state
                    await self.wled.set_state(new_state)
                    if new_state:
                        uasyncio.create_task(self.wled.start_auto_off())
                else:
                    # Langdruck: Shelly & Nanoleaf umschalten
                    s_state = await self.shelly.get_state()
                    new_state = not s_state
                    await self.shelly.set_state(new_state)
                    await self.nanoleaf.set_state(new_state)
                    self.manual_override = True
                    self.manual_override_expiry = time.time() + MANUAL_OVERRIDE_DURATION
                    self.pir_sensor.reset_events()
            await uasyncio.sleep(0.1)

    async def light_control_task(self):
        while True:
            if self.manual_override and time.time() > self.manual_override_expiry:
                self.manual_override = False
                print("Manueller Override beendet")
            event_count = self.pir_sensor.get_event_count()
            if event_count >= PIR_THRESHOLD and not self.manual_override:
                if time.time() - self.last_light_activation > MIN_LIGHT_ON_DURATION:
                    if self.time_manager.is_dark():
                        s_state = await self.shelly.get_state()
                        n_state = await self.nanoleaf.get_state()
                        if s_state != n_state:
                            await self.shelly.set_state(False)
                            await self.nanoleaf.set_state(False)
                            print("DEBUG: Zustandsabweichung: Beide Systeme ausgeschaltet")
                        else:
                            await self.shelly.set_state(True)
                            await self.nanoleaf.set_state(True)
                            self.last_light_activation = time.time()
                            print("DEBUG: Deckenbeleuchtung aktiviert")
            if self.pir_sensor.get_event_count() == 0:
                s_state = await self.shelly.get_state()
                n_state = await self.nanoleaf.get_state()
                if s_state or n_state:
                    await self.shelly.set_state(False)
                    await self.nanoleaf.set_state(False)
                    print("DEBUG: Keine Bewegung: Beleuchtung ausgeschaltet")
            await uasyncio.sleep(1)

    async def rgb_led_task(self):
        while True:
            # Anzeige des aktuellen Status:
            event_count = self.pir_sensor.get_event_count()
            s_state = await self.shelly.get_state()
            n_state = await self.nanoleaf.get_state()
            if event_count >= PIR_THRESHOLD and s_state:
                self.rgb_led.set_color(0x00FF00)  # Grün
            elif not s_state and not n_state:
                self.rgb_led.set_color(0xFF0000)  # Rot
            else:
                await self.rgb_led.blink(0xFFFFFF, interval=0.5, duration=1)  # Weiß blinkend
            await uasyncio.sleep(1)

    async def ntp_sync_task(self):
        while True:
            await self.time_manager.sync_time()
            await uasyncio.sleep(NTP_SYNC_INTERVAL)

    async def main_loop(self):
        uasyncio.create_task(self.ntp_sync_task())
        uasyncio.create_task(self.sensor_task())
        uasyncio.create_task(self.light_control_task())
        uasyncio.create_task(self.rgb_led_task())
        while True:
            await uasyncio.sleep(1)

    async def query_device_states(self):
        # Wird bei Bedarf aufgerufen – Statusabfrage mit weiß blinkender LED
        await self.rgb_led.blink(0xFFFFFF, interval=0.2, duration=1)
        s_state = await self.shelly.get_state()
        n_state = await self.nanoleaf.get_state()
        w_state = await self.wled.get_state()
        print("DEBUG: Geräte-Status: Shelly:", "AN" if s_state else "AUS",
              ", Nanoleaf:", "AN" if n_state else "AUS",
              ", WLED:", "AN" if w_state else "AUS")
        return s_state, n_state, w_state

# -------------------------------
# Programmstart
# -------------------------------
def main():
    controller = MainController()
    async def main_wrapper():
        await controller.initial_status_query()
        await controller.main_loop()
    try:
        uasyncio.run(main_wrapper())
    except Exception as e:
        print("Hauptprogramm Fehler:", e)
        sys.exit()

if __name__ == "__main__":
    main()
