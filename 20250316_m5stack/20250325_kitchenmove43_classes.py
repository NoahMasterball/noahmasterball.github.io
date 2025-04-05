import M5
from M5 import BtnA
import usocket as socket
import ujson, time
from hardware import RGB
# Falls ein PIR-Sensor verwendet werden soll, importiere diesen hier:
# from unit import PIRUnit

DEBUG = True

# --- Konfiguration für WLED ---
WLED_JSON_ON = {
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
WLED_JSON_OFF = {"on": False}


# ------------------------------------------------------------------------------
# Shelly-Steuerungsklasse
# ------------------------------------------------------------------------------
class ShellyController:
    def __init__(self, ip, port=80):
        self.ip = ip
        self.port = port

    def get_state(self):
        # Beispielimplementierung; hier sollte der tatsächliche API-Aufruf erfolgen.
        if DEBUG:
            print("DEBUG: Shelly get_state stub")
        return False

    def set_state(self, state: bool):
        if DEBUG:
            print("DEBUG: Shelly set_state auf", "ON" if state else "OFF")
        # Hier wird die API-Ansteuerung implementiert
        body = '{"id":0,"on":' + ('true' if state else 'false') + '}'
        request = (
            "POST /rpc/Switch.Set HTTP/1.1\r\n"
            "Host: {}\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: {}\r\n"
            "Connection: close\r\n\r\n"
            "{}"
        ).format(self.ip, len(body), body)
        try:
            addr = socket.getaddrinfo(self.ip, self.port)[0][-1]
            s = socket.socket()
            s.connect(addr)
            s.send(request.encode())
            s.recv(2048)
            s.close()
        except Exception as e:
            if DEBUG:
                print("DEBUG: Shelly set_state error:", e)


# ------------------------------------------------------------------------------
# Nanoleaf-Steuerungsklasse (mit verbessertem HTTP-Parsing)
# ------------------------------------------------------------------------------
class NanoleafController:
    def __init__(self, ip, port=16021, api_key=""):
        self.ip = ip
        self.port = port
        self.api_key = api_key
        self.url = f"/api/v1/{self.api_key}/state"

    def get_state(self):
        # Setze die globalen Variablen, die von den API-Funktionen verwendet werden
        global nanoleaf_ip, nanoleaf_port, base_url
        nanoleaf_ip = self.ip
        nanoleaf_port = self.port
        base_url = self.url
        return get_nanoleaf_power_status()

    def set_state(self, state):
        # Setze die globalen Variablen, die von den API-Funktionen verwendet werden
        global nanoleaf_ip, nanoleaf_port, base_url
        nanoleaf_ip = self.ip
        nanoleaf_port = self.port
        base_url = self.url
        set_nanoleaf_power_status(state)


def recv_all(sock, content_length):
    data = b""
    while len(data) < content_length:
        chunk = sock.recv(1024)
        if not chunk:
            break
        data += chunk
    return data.decode()

def extract_json(response):
    json_start = response.find("{")
    json_end = response.rfind("}") + 1
    if json_start != -1 and json_end > json_start:
        return response[json_start:json_end]
    return ""

def get_nanoleaf_power_status():
    s = socket.socket()
    try:
        s.connect((nanoleaf_ip, nanoleaf_port))
        request = (
            f"GET {base_url} HTTP/1.1\r\n"
            f"Host: {nanoleaf_ip}\r\n"
            "Connection: close\r\n\r\n"
        )
        s.send(request.encode())
        response = s.recv(1024).decode()
        content_length = 0
        for line in response.split("\r\n"):
            if line.lower().startswith("content-length:"):
                content_length = int(line.split(":")[1].strip())
        if content_length > 0:
            json_data = recv_all(s, content_length)
        else:
            json_data = ""
        s.close()
        json_data = extract_json(json_data)
        if json_data:
            parsed = ujson.loads(json_data)
            return parsed.get("on", {}).get("value", False)
        return None
    except:
        return None

def set_nanoleaf_power_status(state):
    s = socket.socket()
    try:
        s.connect((nanoleaf_ip, nanoleaf_port))
        payload = '{"on":{"value":' + ('true' if state else 'false') + '}}'
        request = (
            f"PUT {base_url} HTTP/1.1\r\n"
            f"Host: {nanoleaf_ip}\r\n"
            "Content-Type: application/json\r\n"
            f"Content-Length: {len(payload)}\r\n"
            "Connection: close\r\n\r\n"
            f"{payload}"
        )
        s.send(request.encode())
        _ = s.recv(1024)
        s.close()
        print(f"DEBUG: Nanoleaf => {'ON' if state else 'OFF'}")
    except:
        pass


# ------------------------------------------------------------------------------
# WLED-Steuerungsklasse
# ------------------------------------------------------------------------------
class WLEDController:
    def __init__(self, ip, port=80):
        self.ip = ip
        self.port = port

    def get_state(self):
        # Beispielimplementierung; hier sollte der tatsächliche API-Aufruf erfolgen.
        if DEBUG:
            print("DEBUG: WLED get_state stub")
        return False

    def set_state(self, state_data):
        if DEBUG:
            print("DEBUG: WLED set_state auf", state_data.get("on", False))
        # Hier wird die API-Ansteuerung implementiert
        try:
            addr = socket.getaddrinfo(self.ip, self.port)[0][-1]
            s = socket.socket()
            s.connect(addr)
            if state_data is not None:
                body = ujson.dumps(state_data)
                request = (
                    "POST /json/state HTTP/1.1\r\n"
                    "Host: {}\r\n"
                    "Content-Type: application/json\r\n"
                    "Content-Length: {}\r\n"
                    "Connection: close\r\n\r\n"
                    "{}"
                ).format(self.ip, len(body), body)
                s.send(request.encode())
            s.recv(2048)
            s.close()
        except Exception as e:
            if DEBUG:
                print("DEBUG: WLED set_state error:", e)


# ------------------------------------------------------------------------------
# RGB-LED-Steuerungsklasse
# ------------------------------------------------------------------------------
class RGBController:
    def __init__(self, io_pin=35, num_leds=1, led_type="SK6812"):
        self.led = RGB(io=io_pin, n=num_leds, type=led_type)

    def set_color(self, color: int):
        """Setzt die LED auf eine feste Farbe (0xRRGGBB)."""
        self.led.fill_color(color)
        if DEBUG:
            print("DEBUG: LED setze_farbe: #{:06X}".format(color))

    def blink_white(self, duration=5, interval=0.5):
        """Blinkt die LED weiß für die angegebene Dauer."""
        end_time = time.time() + duration
        while time.time() < end_time:
            self.set_color(0xFFFFFF)
            time.sleep(interval)
            self.set_color(0x000000)
            time.sleep(interval)

    def show_green(self):
        """Zeigt die LED in grün an."""
        self.set_color(0x00FF00)

    def show_red(self):
        """Zeigt die LED in rot an."""
        self.set_color(0xFF0000)

    def gradient_red_to_green(self, duration=5, steps=50):
        """Läuft einen Farbverlauf von rot nach grün ab."""
        step_delay = duration / steps
        for i in range(steps + 1):
            t = i / steps
            r = int(255 * (1 - t))
            g = int(255 * t)
            b = 0
            color = (r << 16) | (g << 8) | b
            self.set_color(color)
            time.sleep(step_delay)


# ------------------------------------------------------------------------------
# Lichtsteuerungsklasse (Knopfaktionen)
# ------------------------------------------------------------------------------
class Lichtsteuerung:
    """
    Führt Aktionen basierend auf dem Knopfdruck aus:
      - Einfacher Druck: WLED-Zustand abrufen und toggeln.
      - Doppelklick oder langer Druck (≥1,5 s):
          • Währenddessen blinkt die LED weiß (max. 5 s).
          • Shelly- und Nanoleaf-Status abfragen.
          • Falls beide an sind → ausschalten.
          • Falls beide aus sind → anschalten.
          • Bei gemischtem Zustand → ausschalten (zur Synchronisation).
    """
    def __init__(self, wled_ctrl: WLEDController, shelly_ctrl: ShellyController,
                 nanoleaf_ctrl: NanoleafController, rgb_ctrl: RGBController):
        self.wled = wled_ctrl
        self.shelly = shelly_ctrl
        self.nanoleaf = nanoleaf_ctrl
        self.rgb = rgb_ctrl

        self.press_start = None
        self.last_release = 0
        self.pending_single = False
        self.double_press_threshold = 0.5  # Sekunden für Doppelklick

    def update(self):
        """Wird regelmäßig in der Hauptschleife aufgerufen, um den Knopfdruck zu verarbeiten."""
        M5.update()
        now = time.time()
        if BtnA.isPressed():
            if self.press_start is None:
                self.press_start = now
        else:
            if self.press_start is not None:
                press_duration = now - self.press_start
                self.press_start = None
                if press_duration >= 1.5:
                    if DEBUG:
                        print("DEBUG: Langer Tastendruck erkannt ({} s)".format(press_duration))
                    self.handle_double_press()
                else:
                    if self.pending_single:
                        if now - self.last_release <= self.double_press_threshold:
                            if DEBUG:
                                print("DEBUG: Doppeltastendruck erkannt")
                            self.handle_double_press()
                            self.pending_single = False
                    else:
                        self.pending_single = True
                        self.last_release = now
            if self.pending_single and (now - self.last_release) > self.double_press_threshold:
                if DEBUG:
                    print("DEBUG: Einfacher Tastendruck erkannt")
                self.handle_single_press()
                self.pending_single = False

    def handle_single_press(self):
        """Bei einfachem Tastendruck: WLED-Zustand toggeln."""
        current_state = self.wled.get_state()
        if DEBUG:
            print("DEBUG: WLED aktueller Zustand:", current_state)
        if current_state:
            self.wled.set_state(WLED_JSON_OFF)
        else:
            self.wled.set_state(WLED_JSON_ON)

    def handle_double_press(self):
        """
        Bei Doppeltastendruck oder langem Druck:
          - LED blinkt weiß (max. 5 s).
          - Shelly- und Nanoleaf-Status werden abgefragt.
          - Falls beide an sind → ausschalten.
          - Falls beide aus sind → anschalten.
          - Bei gemischtem Zustand → ausschalten.
        """
        if DEBUG:
            print("DEBUG: Doppeltastendruck / langer Druck Aktion gestartet")
        self.rgb.blink_white(duration=5, interval=0.3)
        shelly_state = self.shelly.get_state()
        nanoleaf_state = self.nanoleaf.get_state()
        if DEBUG:
            print("DEBUG: Shelly-Status:", shelly_state, "Nanoleaf-Status:", nanoleaf_state)
        if shelly_state and nanoleaf_state:
            new_state = False
        elif (not shelly_state) and (not nanoleaf_state):
            new_state = True
        else:
            new_state = False
        self.shelly.set_state(new_state)
        self.nanoleaf.set_state(new_state)
        if DEBUG:
            print("DEBUG: Shelly und Nanoleaf auf", "ON" if new_state else "OFF", "gesetzt")


# ------------------------------------------------------------------------------
# Hauptprogramm
# ------------------------------------------------------------------------------
def main():
    M5.begin()
    # Instanziiere die Controller (bitte IP-Adressen und API-Key anpassen)
    wled_ctrl = WLEDController("10.80.23.22", 80)
    shelly_ctrl = ShellyController("10.80.23.51", 80)
    nanoleaf_ctrl = NanoleafController("10.80.23.56", 16021, "")
    rgb_ctrl = RGBController(io_pin=35, num_leds=1, led_type="SK6812")

    lichtsteuerung = Lichtsteuerung(wled_ctrl, shelly_ctrl, nanoleaf_ctrl, rgb_ctrl)

    while True:
        lichtsteuerung.update()
        time.sleep(0.05)  # Kleine Pause zur Entlastung

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e)
