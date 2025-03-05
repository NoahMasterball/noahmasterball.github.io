import M5
from M5 import BtnA
import usocket as socket
import ujson
import time
from hardware import RGB

# WLED-Daten
wled_ip = "10.80.23.22"
wled_json_on = {"on": True, "bri": 151, "transition": 7, "mainseg": 0, "seg": [{"id": 0, "start": 0, "stop": 16, "startY": 0, "stopY": 8, "grp": 1, "spc": 0, "of": 0, "on": True, "frz": False, "bri": 255, "cct": 127, "set": 0, "n": "Essen kommen JETZT!!!!", "col": [[255, 0, 0], [0, 0, 0], [0, 0, 0]], "fx": 122, "sx": 128, "ix": 128, "pal": 8}]}
wled_json_off = {"on": False}

# WLED-/LED-Status
wled_status = None  # None => unbekannt, True => an, False => aus
wled_auto_off_timer = None

# LED-Zustand: "WHITE_BLINK", "GREEN", "RED", "OFF"
led_state = "WHITE_BLINK"
led_state_start = 0.0
led_state_duration = 0.0

# Basis-Konstanten
MAX_LED_TIME = 180
BLINK_INTERVAL = 0.5  # alle 0.5s wechselt WHITE_BLINK zwischen Weiß und Aus
rgb = None

def wled_request(method="GET", payload=None, attempts=5):
    """
    Führt GET/POST bis zu 'attempts'-mal aus. 
    Wenn wled_status bekannt und kein White-Blink aktiv ist, kurz 1s White-Blink.
    """
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
                    + "Host: {}\r\n".format(wled_ip)
                    + "Content-Type: application/json\r\n"
                    + "Content-Length: {}\r\n".format(length)
                    + "Connection: close\r\n\r\n"
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
    """
    WLED-Status per GET abfragen. 
    None => unbekannt, True => an, False => aus
    """
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
        # Sobald Status bekannt => LED-Status setzen
        if wled_status:
            set_led_state("GREEN", MAX_LED_TIME)
        else:
            set_led_state("RED", MAX_LED_TIME)

def set_led_state(state, duration=180):
    """
    Led-State => "WHITE_BLINK", "GREEN", "RED", "OFF"
    Dauer => nach Ablauf => OFF
    """
    global led_state, led_state_start, led_state_duration
    led_state = state
    led_state_start = time.time()
    led_state_duration = duration
    # Für nicht-blinkende Zustände setzen wir sofort die Farbe (verhindert initiale Verzögerung)
    if state == "GREEN":
        rgb.fill_color(0x00FF00)
    elif state == "RED":
        rgb.fill_color(0xFF0000)
    elif state == "OFF":
        rgb.fill_color(0x000000)
    else:
        rgb.fill_color(0xFFFFFF)  # Startet blinkend (weiß an)

def handle_led_state():
    """
    Prüft, ob die LED-Zeit abgelaufen ist (-> OFF),
    oder toggelt Weiß an/aus bei WHITE_BLINK (zeitbasiert).
    """
    global led_state
    now = time.time()
    elapsed = now - led_state_start
    if elapsed >= led_state_duration:
        led_state = "OFF"
        rgb.fill_color(0x000000)
        return

    if led_state == "WHITE_BLINK":
        # Nutzt Intervall zur Steuerung des Blinkens
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

def setup():
    global rgb
    M5.begin()
    rgb = RGB(io=35, n=1, type="SK6812")

    # Zu Beginn Status unbekannt => WHITE_BLINK
    set_led_state("WHITE_BLINK", MAX_LED_TIME)
    refresh_wled_status()
    if wled_status is not None:
        if wled_status:
            set_led_state("GREEN", MAX_LED_TIME)
        else:
            set_led_state("RED", MAX_LED_TIME)

def loop():
    global wled_auto_off_timer, wled_status
    M5.update()
    handle_led_state()
    now = time.time()

    # Autom. Abschalten nach 120s, wenn WLED an
    if wled_auto_off_timer and wled_status and now >= wled_auto_off_timer:
        set_wled(wled_json_off)
        wled_auto_off_timer = None

    # Taste
    if BtnA.wasClicked():
        # Status unbekannt => wir nehmen an: war aus => schalten ein
        # oder toggeln, wie du es brauchst. Hier Beispiel: wir schalten ein:
        if wled_status is None:
            set_led_state("WHITE_BLINK", MAX_LED_TIME)
            set_wled(wled_json_on)
            if wled_status:
                wled_auto_off_timer = now + 120
        else:
            # Status bekannt => toggeln
            if not wled_status:
                set_wled(wled_json_on)
                wled_auto_off_timer = now + 120
            else:
                set_wled(wled_json_off)
                wled_auto_off_timer = None

    time.sleep(0.1)

if __name__ == "__main__":
    try:
        setup()
        while True:
            loop()
    except (Exception, KeyboardInterrupt) as e:
        print("Fehler:", e)
