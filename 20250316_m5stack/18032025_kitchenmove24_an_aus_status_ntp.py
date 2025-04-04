import M5
from M5 import BtnA
import usocket as socket
import ujson
import time
import ntptime
from hardware import RGB
from unit import PIRUnit

# ------------------------------------------------------------------------------
# KONFIGURATION
# ------------------------------------------------------------------------------
UNOCCUPIED_TIMEOUT = 300      # 5 Minuten Inaktivität => unbesetzt (war 15 Minuten)
MIN_SESSION_DURATION = 120    # 2 Minuten ununterbrochene Bewegung => Licht an
ALLOWED_GAP = 45              # 45 s zwischen Bewegungen => Sitzung reset
MAX_LED_TIME = 180
BLINK_INTERVAL = 0.5

SHELLY_HOST = "10.80.23.51"
SHELLY_PORT = 80

nanoleaf_ip = "10.80.23.56"
api_key = "kK2AbyyhXXNncr0Pw77RTy61pk3OrZnC"
base_url = f"/api/v1/{api_key}/state"
nanoleaf_port = 16021

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

# Sonnenauf- und Untergangszeiten + Schaltzeiten
sun_times = {
    1:  {"sunrise": "08:00", "sunset": "16:30",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "15:00"}, 
    2:  {"sunrise": "07:30", "sunset": "17:20",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "16:20"},
    3:  {"sunrise": "06:30", "sunset": "18:10",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "17:10"},
    4:  {"sunrise": "06:00", "sunset": "20:00",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "19:00"},
    5:  {"sunrise": "05:20", "sunset": "20:50",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "19:50"},
    6:  {"sunrise": "04:50", "sunset": "21:15",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "20:15"},
    7:  {"sunrise": "05:10", "sunset": "21:15",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "20:15"},
    8:  {"sunrise": "05:50", "sunset": "20:30",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "19:30"},
    9:  {"sunrise": "06:40", "sunset": "19:30",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "18:30"},
    10: {"sunrise": "07:25", "sunset": "18:20",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "17:20"},
    11: {"sunrise": "08:10", "sunset": "16:30",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "15:00"},
    12: {"sunrise": "08:20", "sunset": "16:15",
         "sunrise_schaltzeit": "05:45", "sunset_schaltzeit": "14:45"}
}

# ------------------------------------------------------------------------------
# GLOBALE VARIABLEN
# ------------------------------------------------------------------------------
btnA_press_start = None
wled_status = None
wled_auto_off_timer = None

led_state = "WHITE_BLINK"
led_state_start = 0.0
led_state_duration = 0.0

session_start = None
last_event_time = None
presence_active = False

rgb = None
pir_0 = None

TIME_SYNCED = False
last_sync_time = 0

pir_is_active = False
pir_active_start_time = None
pir_triggered_count = 0

# Wenn das Licht manuell ausgeschaltet wird, wird der PIR-Mechanismus für 30 Minuten (1800 s) deaktiviert.
manual_override_until = 0

# ------------------------------------------------------------------------------
# NTP-Sync-FUNKTION (Direkt per IP, ohne DNS)
# ------------------------------------------------------------------------------
def sync_time(ntp_ip="129.187.254.32", attempts=10, interval=30):
    """
    Versucht bis zu 'attempts'-mal alle 'interval' Sekunden eine NTP-Sync.
    Verwendet direkt die IP, kein DNS.
    """
    global TIME_SYNCED
    ntptime.host = ntp_ip

    print(f"DEBUG: Starting NTP sync routine (IP = {ntp_ip})...")
    for attempt in range(1, attempts+1):
        try:
            print(f"DEBUG: NTP-Sync Versuch {attempt}/{attempts}")
            ntptime.settime()
            TIME_SYNCED = True
            lt = time.localtime()
            print(f"DEBUG: Zeit-Sync OK -> Lokale Zeit: {lt}")
            return
        except Exception as e:
            print(f"DEBUG: NTP-Versuch {attempt}/{attempts} fehlgeschlagen. Exception: {e}")
            time.sleep(interval)
    TIME_SYNCED = False
    print("DEBUG: Alle NTP-Versuche fehlgeschlagen => TIME_SYNCED=False")

# ------------------------------------------------------------------------------
# HELFER: is_dark_enough
# ------------------------------------------------------------------------------
def is_dark_enough():
    """
    Prüft, ob die aktuelle Zeit in der Nacht-Periode liegt
    (nach sunset_schaltzeit oder vor sunrise_schaltzeit).
    Wenn TIME_SYNCED=False => True (immer dunkel).
    """
    if not TIME_SYNCED:
        print("DEBUG: Keine Zeit-Sync => is_dark_enough = True")
        return True

    lt = time.localtime()
    month = lt[1]
    hour = lt[3]
    minute = lt[4]

    info = sun_times.get(month, None)
    if not info:
        print(f"DEBUG: Kein Eintrag für Monat {month} => is_dark_enough=True")
        return True

    def parse_hhmm(hhmm):
        hh, mm = hhmm.split(":")
        return int(hh)*60 + int(mm)

    sunset_m = parse_hhmm(info["sunset_schaltzeit"])
    sunrise_m = parse_hhmm(info["sunrise_schaltzeit"])
    current_m = hour*60 + minute

    if current_m >= sunset_m or current_m < sunrise_m:
        print(f"DEBUG: Zeit={hour:02d}:{minute:02d}, abend={info['sunset_schaltzeit']}, morgen={info['sunrise_schaltzeit']} => DUNKEL")
        return True
    else:
        print(f"DEBUG: Zeit={hour:02d}:{minute:02d}, abend={info['sunset_schaltzeit']}, morgen={info['sunrise_schaltzeit']} => HELL")
        return False

# ------------------------------------------------------------------------------
# NANOLEAF
# ------------------------------------------------------------------------------
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
# SHELLY
# ------------------------------------------------------------------------------
def shelly_set_relay(turn):
    on_value = "true" if turn == "on" else "false"
    body = '{"id":0,"on":' + on_value + '}'
    length = len(body)
    request = (
        "POST /rpc/Switch.Set HTTP/1.1\r\n"
        f"Host: {SHELLY_HOST}\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {length}\r\n"
        "Connection: close\r\n\r\n"
        f"{body}"
    )
    try:
        addr = socket.getaddrinfo(SHELLY_HOST, SHELLY_PORT)[0][-1]
        s = socket.socket()
        s.connect(addr)
        s.send(bytes(request, "utf-8"))
        _ = s.recv(2048)
        s.close()
        print(f"DEBUG: Shelly => {turn.upper()}")
    except:
        pass

def get_shelly_status():
    request = (
        "GET /rpc/Switch.GetStatus?id=0 HTTP/1.1\r\n"
        f"Host: {SHELLY_HOST}\r\n"
        "Connection: close\r\n\r\n"
    )
    try:
        addr = socket.getaddrinfo(SHELLY_HOST, SHELLY_PORT)[0][-1]
        s = socket.socket()
        s.connect(addr)
        s.send(bytes(request, "utf-8"))
        response = b""
        while True:
            part = s.recv(2048)
            if not part:
                break
            response += part
        s.close()
        json_start = response.find(b"{")
        if json_start != -1:
            json_str = response[json_start:].decode("utf-8")
            data = ujson.loads(json_str)
            return data.get("output", False)
        else:
            return None
    except:
        return None

def toggle_shelly_light():
    shelly_state = get_shelly_status()
    nanoleaf_state = get_nanoleaf_power_status()
    if shelly_state is None:
        shelly_state = False
    if nanoleaf_state is None:
        nanoleaf_state = False

    if shelly_state != nanoleaf_state:
        shelly_set_relay("off")
        set_nanoleaf_power_status(False)
        print("DEBUG: Toggle => out-of-sync, now OFF/OFF")
    else:
        if shelly_state is True:
            shelly_set_relay("off")
            set_nanoleaf_power_status(False)
            print("DEBUG: Toggle => both were ON, now OFF/OFF")
        else:
            shelly_set_relay("on")
            set_nanoleaf_power_status(True)
            print("DEBUG: Toggle => both were OFF, now ON/ON")

# ------------------------------------------------------------------------------
# WLED
# ------------------------------------------------------------------------------
def wled_request(method="GET", payload=None, attempts=5):
    for _ in range(attempts):
        try:
            addr = socket.getaddrinfo(wled_ip, 80)[0][-1]
            s = socket.socket()
            s.connect(addr)
            if method == "GET" and payload is None:
                req = f"GET /json/state HTTP/1.1\r\nHost: {wled_ip}\r\nConnection: close\r\n\r\n"
                s.send(bytes(req, "utf-8"))
            elif method == "POST" and payload is not None:
                body = ujson.dumps(payload)
                length = len(body)
                headers = (
                    "POST /json/state HTTP/1.1\r\n"
                    f"Host: {wled_ip}\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {length}\r\n"
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
        except:
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
        print(f"DEBUG: WLED => {'ON' if wled_status else 'OFF'}")
        if wled_status:
            set_led_state("GREEN", MAX_LED_TIME)
        else:
            set_led_state("RED", MAX_LED_TIME)

# ------------------------------------------------------------------------------
# LED-Status
# ------------------------------------------------------------------------------
def set_led_state(state, duration=180):
    global led_state, led_state_start, led_state_duration
    led_state = state
    led_state_start = time.time()
    led_state_duration = duration

    if state == "GREEN":
        rgb.fill_color(0x00FF00)
    elif state == "GREEN_PIR":
        # Spezialmodus: Dauerhaft Grün, solange PIR aktiv (kein Timeout)
        rgb.fill_color(0x00FF00)
    elif state == "RED":
        rgb.fill_color(0xFF0000)
    elif state == "OFF":
        rgb.fill_color(0x000000)
    elif state == "WHITE_BLINK":
        rgb.fill_color(0xFFFFFF)
    else:
        rgb.fill_color(0xFFFFFF)  # default

def handle_led_state():
    """
    Wird kontinuierlich in loop() aufgerufen.
    Achtet auf led_state und eventuelles Timeout.
    """
    global led_state
    now = time.time()
    elapsed = now - led_state_start

    # "GREEN_PIR" => ohne Zeitbegrenzung
    if led_state == "GREEN_PIR":
        return

    # Sonst: Prüfen, ob Zeit abgelaufen
    if led_state not in ("OFF", "GREEN_PIR"):
        if elapsed >= led_state_duration:
            led_state = "OFF"
            rgb.fill_color(0x000000)
            return

    # Falls White Blink: toggeln
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
    elif led_state == "OFF":
        rgb.fill_color(0x000000)

# ------------------------------------------------------------------------------
# BLINK-HELFER
# ------------------------------------------------------------------------------
def compute_blink_count(elapsed):
    """
    10-Sekunden-Blöcke in einem 120-Sekunden-Zyklus -> 1..12 Blinks
    """
    if elapsed < 0:
        elapsed = 0
    local_t = elapsed % 120
    # Sonderfall: exakt multiples of 120 => 12 Blinks
    if (abs(local_t) < 0.0001) and (elapsed > 0):
        local_t = 120

    block_index = int(local_t // 10)
    blink_count = block_index + 1
    if blink_count > 12:
        blink_count = 12
    return blink_count

def blink_green(times, blink_delay=0.25):
    """
    Lässt die LED 'times' Mal kurz GRÜN aufblinken.
    Danach bleibt sie GRÜN an.
    """
    for i in range(times):
        rgb.fill_color(0x00FF00)
        time.sleep(blink_delay)
        rgb.fill_color(0x000000)
        time.sleep(blink_delay * 0.8)
    # Danach grün anlassen
    rgb.fill_color(0x00FF00)

# ------------------------------------------------------------------------------
# PRÄSENZ
# ------------------------------------------------------------------------------
def motion_event_common_active():
    print("DEBUG: Raum als besetzt => Shelly & Nanoleaf EIN")
    shelly_set_relay("on")
    set_nanoleaf_power_status(True)

def motion_event_common_neagtiv():
    print("DEBUG: Raum als unbesetzt => Shelly & Nanoleaf AUS")
    shelly_set_relay("off")
    set_nanoleaf_power_status(False)

def overhead_light_is_on():
    """Hilfsfunktion, um zu prüfen, ob Shelly & Nanoleaf an sind."""
    shelly_state = get_shelly_status() or False
    nano_state = get_nanoleaf_power_status() or False
    return shelly_state or nano_state

# ------------------------------------------------------------------------------
# PIR-CALLBACKS
# ------------------------------------------------------------------------------
def pir_0_active_event(pir):
    global session_start, last_event_time, presence_active
    global pir_is_active, pir_active_start_time, pir_triggered_count
    global led_state, manual_override_until

    now = time.time()
    # Wenn manuelle Abschaltung aktiv ist, PIR-Events ignorieren
    if now < manual_override_until:
        print("DEBUG: Manuelle Abschaltung aktiv, PIR-Event ignoriert")
        return

    print(f"DEBUG: Bewegung erkannt um {int(now)}")

    gap_too_long = (last_event_time is not None and (now - last_event_time) > ALLOWED_GAP)
    if session_start is None or gap_too_long:
        session_start = now
        pir_active_start_time = now
        pir_triggered_count = 0
        print("DEBUG: Neue Sitzung gestartet")

    last_event_time = now
    duration = now - session_start
    print(f"DEBUG: Kontinuierliche Präsenzdauer: {int(duration)}s")

    # Wenn die Mindestdauer erreicht ist, Licht einschalten
    if duration >= MIN_SESSION_DURATION:
        print("DEBUG: MIN_SESSION_DURATION erreicht => Licht einschalten")
        motion_event_common_active()
        presence_active = True
        session_start = now  # Sitzung resetten
        set_led_state("OFF", 0)
    else:
        if overhead_light_is_on():
            print("DEBUG: Overhead Light schon an => keine LED-Änderung")
            return
        else:
            if led_state == "OFF":
                blink_times = compute_blink_count(duration)
                print(f"DEBUG: Session-Timer={int(duration)}s => Blink={blink_times}x vor GREEN_PIR")
                blink_green(blink_times, 0.2)
                led_state = "GREEN_PIR"

    pir_is_active = True

def pir_0_negative_event(pir):
    global pir_is_active, pir_active_start_time, pir_triggered_count
    global led_state

    print("DEBUG: PIR NEGATIVE (keine Bewegung erkannt)")
    pir_is_active = False
    pir_active_start_time = None
    pir_triggered_count = 0

    if led_state == "GREEN_PIR":
        set_led_state("OFF", 0)

# ------------------------------------------------------------------------------
# SETUP
# ------------------------------------------------------------------------------
def setup():
    global rgb, pir_0, last_sync_time
    M5.begin()

    # WLAN-Verbindung (auskommentiert oder anpassen)
    # M5.WiFi.begin("DEIN_SSID", "PASSWORT")
    # while not M5.WiFi.isReady():
    #     time.sleep(0.2)
    # print("DEBUG: WLAN verbunden")

    # NTP
    sync_time(ntp_ip="129.187.254.32", attempts=10, interval=30)
    last_sync_time = time.time()

    rgb = RGB(io=35, n=1, type="SK6812")
    pir_0 = PIRUnit((1, 2))
    pir_0.set_callback(pir_0_active_event, pir_0.IRQ_ACTIVE)
    pir_0.set_callback(pir_0_negative_event, pir_0.IRQ_NEGATIVE)
    pir_0.enable_irq()

    # Direkt nach Boot => White-Blink
    set_led_state("WHITE_BLINK", MAX_LED_TIME)

    refresh_wled_status()
    if wled_status is not None:
        if wled_status:
            set_led_state("GREEN", MAX_LED_TIME)
        else:
            set_led_state("RED", MAX_LED_TIME)

# ------------------------------------------------------------------------------
# LOOP
# ------------------------------------------------------------------------------
def loop():
    global wled_auto_off_timer, wled_status
    global session_start, last_event_time, presence_active
    global btnA_press_start, last_sync_time
    global pir_is_active, pir_active_start_time, pir_triggered_count
    global manual_override_until

    M5.update()
    now = time.time()
    
    # Loop-Check: Falls eine Sitzung läuft und MIN_SESSION_DURATION erreicht wurde,
    # aber noch nicht als besetzt markiert ist – und falls keine manuelle Abschaltung aktiv ist.
    if session_start is not None and not presence_active and (now >= manual_override_until):
        if now - session_start >= MIN_SESSION_DURATION:
            print("DEBUG: Timer erreicht (>= MIN_SESSION_DURATION) => Licht einschalten (Loop-Check)")
            motion_event_common_active()
            presence_active = True
            session_start = now  # Sitzung resetten
            set_led_state("OFF", 0)

    handle_led_state()
    
    # Alle 12 Stunden => NTP-Sync
    if now - last_sync_time >= 43200:
        print("DEBUG: 12h vergangen => erneuter NTP-Sync")
        sync_time(ntp_ip="129.187.254.32", attempts=10, interval=30)
        last_sync_time = time.time()

    # Falls Licht an und 5 Minuten keine Bewegung => ausschalten
    if presence_active and last_event_time is not None:
        if now - last_event_time >= UNOCCUPIED_TIMEOUT:
            if is_dark_enough():
                motion_event_common_neagtiv()
            presence_active = False
            session_start = None
            last_event_time = None

    # WLED Auto-Off Timer
    if wled_auto_off_timer and wled_status and now >= wled_auto_off_timer:
        set_wled(wled_json_off)
        wled_auto_off_timer = None

    # Button-Abfrage
    if BtnA.isPressed():
        if btnA_press_start is None:
            btnA_press_start = now
    else:
        if btnA_press_start is not None:
            press_duration = now - btnA_press_start
            # Long press: Toggle Shelly & Nanoleaf
            if press_duration >= 1.5:
                print(f"DEBUG: Long press ({int(press_duration)}s) => Shelly & Nanoleaf toggeln")
                # Wenn das Licht aktuell an ist, wird es ausgeschaltet und der PIR-Mechanismus ruht 30 Minuten
                if overhead_light_is_on():
                    toggle_shelly_light()
                    manual_override_until = now + 1800  # 30 Minuten Ruhezeit
                else:
                    toggle_shelly_light()
            else:
                print(f"DEBUG: Short press ({int(press_duration)}s) => WLED toggeln")
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
                        manual_override_until = now + 1800  # 30 Minuten Ruhezeit bei manueller Abschaltung
            btnA_press_start = None

    time.sleep(0.1)

# ------------------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        setup()
        while True:
            loop()
    except (Exception, KeyboardInterrupt) as e:
        print("DEBUG: Fehler:", e)
