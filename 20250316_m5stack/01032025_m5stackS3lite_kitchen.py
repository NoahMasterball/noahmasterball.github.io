import M5
from M5 import BtnA
import usocket as socket
import ujson
import time
from hardware import RGB
from unit import PIRUnit  # Import für den PIR-Bewegungssensor

# ---------------------------
# WLED-Konfiguration
# ---------------------------
wled_ip = "10.80.23.22"
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
wled_status = None         # None = unbekannt, True = an, False = aus
wled_auto_off_timer = None

# LED-Zustand: "WHITE_BLINK", "GREEN", "RED", "OFF"
led_state = "WHITE_BLINK"
led_state_start = 0.0
led_state_duration = 0.0
MAX_LED_TIME = 180
BLINK_INTERVAL = 0.5  
rgb = None

# ---------------------------
# PIR-Sensor
# ---------------------------
pir_0 = None

# ---------------------------
# Präsenzalgorithmus (Sitzungsansatz)
# ---------------------------
MIN_SESSION_DURATION = 120   # Mindestens 2 Minuten kontinuierliche Bewegung
ALLOWED_GAP = 30             # Max. 30 Sekunden zwischen Events, sonst Sitzung neu starten
UNOCCUPIED_TIMEOUT = 900       # 15 Minuten Inaktivität => Raum als unbesetzt

session_start = None         # Zeitpunkt des ersten Bewegungsevents in der aktuellen Sitzung
last_event_time = None       # Zeitpunkt des letzten Bewegungsevents
presence_active = False      # True, wenn Raum als besetzt gilt

# ---------------------------
# Shelly-Konfiguration (Shelly Gen2)
# ---------------------------
SHELLY_HOST = "10.80.23.51"
SHELLY_PORT = 80

# ---------------------------
# Globale Variable für Tasterpressedauer
# ---------------------------
btnA_press_start = None

# ---------------------------
# Shelly-Funktionen
# ---------------------------
def shelly_set_relay(turn):
    """
    Sendet einen POST-Request an den Shelly Gen2, um das Relais zu schalten.
    Erwarteter JSON-Body:
      - Für "on":  {"id":0,"on":true}
      - Für "off": {"id":0,"on":false}
    """
    on_value = "true" if turn == "on" else "false"
    body = '{"id":0,"on":' + on_value + '}'
    length = len(body)
    request = (
        "POST /rpc/Switch.Set HTTP/1.1\r\n"
        "Host: {}\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: {}\r\n"
        "Connection: close\r\n\r\n{}"
    ).format(SHELLY_HOST, length, body)
    print("DEBUG: Sending Shelly command:")
    print(request)
    try:
        addr = socket.getaddrinfo(SHELLY_HOST, SHELLY_PORT)[0][-1]
        s = socket.socket()
        s.connect(addr)
        s.send(bytes(request, "utf-8"))
        response = s.recv(2048)
        print("DEBUG: Shelly response:", response)
        s.close()
    except Exception as e:
        print("DEBUG: Shelly request error:", e)

def get_shelly_status():
    """
    Fragt den aktuellen Shelly-Status über einen GET-Request ab.
    Verwendet den Shelly Gen2 Endpunkt /rpc/Switch.GetStatus?id=0.
    Der zurückgegebene JSON enthält den Schlüssel "output",
    der angibt, ob der Schalter aktuell an (true) oder aus (false) ist.
    """
    request = "GET /rpc/Switch.GetStatus?id=0 HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(SHELLY_HOST)
    try:
        addr = socket.getaddrinfo(SHELLY_HOST, SHELLY_PORT)[0][-1]
        s = socket.socket()
        s.connect(addr)
        s.send(bytes(request, "utf-8"))
        response = b""
        # Lese solange, bis keine Daten mehr kommen
        while True:
            part = s.recv(2048)
            if not part:
                break
            response += part
        s.close()
        response_str = response.decode("utf-8")
        print("DEBUG: Full Shelly GET response:", response_str)
        json_start = response_str.find("{")
        if json_start != -1:
            json_str = response_str[json_start:]
            data = ujson.loads(json_str)
            status = data.get("output", False)
            print("DEBUG: Shelly GET status response:", status)
            return status
        else:
            print("DEBUG: Kein JSON in Shelly GET response gefunden.")
            return False
    except Exception as e:
        print("DEBUG: Shelly GET error:", e)
        return False

def toggle_shelly_light():
    """
    Schaltet den Shelly um, basierend auf dem aktuellen Status.
    (Wird nur bei Knopfdruck verwendet.)
    """
    status = get_shelly_status()
    print("DEBUG: Shelly current status:", status)
    if status:
        shelly_set_relay("off")
    else:
        shelly_set_relay("on")

# ---------------------------
# WLED-Funktionen (ohne Shelly-Aufrufe)
# ---------------------------
def wled_request(method="GET", payload=None, attempts=5):
    if wled_status is not None and led_state != "WHITE_BLINK":
        set_led_state("WHITE_BLINK", 1)
    for _ in range(attempts):
        try:
            addr = socket.getaddrinfo(wled_ip, 80)[0][-1]
            s = socket.socket()
            s.connect(addr)
            if method == "GET" and payload is None:
                req = "GET /json/state HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(wled_ip)
                s.send(bytes(req, "utf-8"))
            elif method == "POST" and payload is not None:
                body = ujson.dumps(payload)
                length = len(body)
                headers = (
                    "POST /json/state HTTP/1.1\r\n"
                    "Host: {}\r\n".format(wled_ip) +
                    "Content-Type: application/json\r\n" +
                    "Content-Length: {}\r\n".format(length) +
                    "Connection: close\r\n\r\n"
                )
                s.send(bytes(headers, "utf-8"))
                s.send(bytes(body, "utf-8"))
            else:
                raise ValueError("Parameterfehler.")
            response = s.recv(2048)
            s.close()
            if response:
                return response
        except Exception as e:
            print("wled_request Fehler:", e)
            time.sleep(1)
    return b""

def refresh_wled_status():
    global wled_status
    resp = wled_request("GET")
    if not resp:
        wled_status = None
        return
    parts = resp.decode("utf-8").split("\r\n\r\n", 1)
    if len(parts) > 1:
        try:
            data = ujson.loads(parts[1])
            wled_status = data.get("on", False)
        except:
            wled_status = None
    else:
        wled_status = None

def set_wled(payload):
    global wled_status
    resp = wled_request("POST", payload)
    if resp:
        wled_status = bool(payload.get("on", False))
        if wled_status:
            set_led_state("GREEN", MAX_LED_TIME)
            print("DEBUG: WLED switched ON")
        else:
            set_led_state("RED", MAX_LED_TIME)
            print("DEBUG: WLED switched OFF")

def set_led_state(state, duration=180):
    global led_state, led_state_start, led_state_duration
    led_state = state
    led_state_start = time.time()
    led_state_duration = duration
    if state == "GREEN":
        rgb.fill_color(0x00FF00)
    elif state == "RED":
        rgb.fill_color(0xFF0000)
    elif state == "OFF":
        rgb.fill_color(0x000000)
    else:
        rgb.fill_color(0xFFFFFF)

def handle_led_state():
    global led_state
    now = time.time()
    elapsed = now - led_state_start
    if elapsed >= led_state_duration:
        led_state = "OFF"
        rgb.fill_color(0x000000)
        return
    if led_state == "WHITE_BLINK":
        half_periods = int(elapsed // BLINK_INTERVAL)
        if half_periods % 2 == 0:
            rgb.fill_color(0xFFFFFF)
        else:
            rgb.fill_color(0x000000)
    elif led_state == "GREEN":
        rgb.fill_color(0x00FF00)
    elif led_state == "RED":
        rgb.fill_color(0xFF0000)
    else:
        rgb.fill_color(0x000000)

# ---------------------------
# Präsenzalgorithmus (Sitzungsansatz)
# ---------------------------
def motion_event_common_active():
    print("CLI: Raum als besetzt erkannt.")
    # Bei Präsenz wird das Licht eingeschaltet (nicht getoggled)
    shelly_set_relay("on")

def motion_event_common_neagtiv():
    print("CLI: Raum als unbesetzt erkannt.")
    # Bei Inaktivität wird das Licht ausgeschaltet (nicht getoggled)
    shelly_set_relay("off")

def pir_0_active_event(pir):
    global session_start, last_event_time, presence_active
    now = time.time()
    print("CLI: Bewegung erkannt um", now)
    if session_start is None or (last_event_time is not None and now - last_event_time > ALLOWED_GAP):
        session_start = now
        print("CLI: Neue Sitzung gestartet")
    last_event_time = now
    duration = now - session_start
    print("CLI: Kontinuierliche Präsenzdauer:", int(duration), "Sekunden")
    if duration >= MIN_SESSION_DURATION and not presence_active:
        motion_event_common_active()
        presence_active = True
    if led_state == "OFF":
        rgb.fill_color(0x00FF00)

def pir_0_negative_event(pir):
    print("CLI: Keine Bewegung erkannt")
    if led_state == "OFF":
        rgb.fill_color(0x000000)

# ---------------------------
# Setup und Loop
# ---------------------------
def setup():
    global rgb, pir_0
    M5.begin()
    rgb = RGB(io=35, n=1, type="SK6812")
    pir_0 = PIRUnit((1, 2))
    pir_0.set_callback(pir_0_active_event, pir_0.IRQ_ACTIVE)
    pir_0.set_callback(pir_0_negative_event, pir_0.IRQ_NEGATIVE)
    pir_0.enable_irq()
    set_led_state("WHITE_BLINK", MAX_LED_TIME)
    refresh_wled_status()
    if wled_status is not None:
        if wled_status:
            set_led_state("GREEN", MAX_LED_TIME)
        else:
            set_led_state("RED", MAX_LED_TIME)

def loop():
    global wled_auto_off_timer, wled_status, session_start, last_event_time, presence_active, btnA_press_start
    M5.update()
    handle_led_state()
    now = time.time()
    
    # Präsenz-Inaktivität prüfen (15 Minuten ohne Bewegung)
    if presence_active and (now - last_event_time >= UNOCCUPIED_TIMEOUT):
        motion_event_common_neagtiv()
        presence_active = False
        session_start = None
        last_event_time = None

    # Automatische Abschaltung von WLED nach 120s, falls WLED an ist.
    if wled_auto_off_timer and wled_status and now >= wled_auto_off_timer:
        set_wled(wled_json_off)
        wled_auto_off_timer = None

    # Tastenabfrage (nicht blockierend)
    if BtnA.isPressed():
        if btnA_press_start is None:
            btnA_press_start = now
    else:
        if btnA_press_start is not None:
            press_duration = now - btnA_press_start
            # Bei Knopfdruck: Longpress toggelt den Shelly (2.0s Schwelle, hier hier auf 1.5s eingestellt)
            if press_duration >= 1.5:
                print("DEBUG: Long press detected (", press_duration, "sec) - toggling Shelly light")
                toggle_shelly_light()
            else:
                print("DEBUG: Short press detected (", press_duration, "sec) - toggling WLED")
                if wled_status is None:
                    set_led_state("WHITE_BLINK", MAX_LED_TIME)
                    set_wled(wled_json_on)
                    if wled_status:
                        wled_auto_off_timer = now + 120
                else:
                    if not wled_status:
                        set_wled(wled_json_on)
                        wled_auto_off_timer = now + 120
                    else:
                        set_wled(wled_json_off)
                        wled_auto_off_timer = None
            btnA_press_start = None

    time.sleep(0.1)

if __name__ == "__main__":
    try:
        setup()
        while True:
            loop()
    except (Exception, KeyboardInterrupt) as e:
        print("Fehler:", e)
