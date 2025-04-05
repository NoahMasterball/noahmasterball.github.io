import M5
from M5 import BtnA
import usocket as socket
import ujson, time, ntptime
from hardware import RGB
from unit import PIRUnit

# ------------------------------------------------------------------------------
# DEBUG-OPTION (True = Debug-Ausgaben aktiv, False = minimal)
# ------------------------------------------------------------------------------
DEBUG = True

# ------------------------------------------------------------------------------
# KONFIGURATION
# ------------------------------------------------------------------------------
INAKTIV_TIMEOUT = 300          # 5 Minuten Inaktivität
MAX_LED_DAUER = 180            # Maximale LED-Anzeigedauer in Sekunden
EVENT_THRESHOLD = 10           # Bei 10 PIR-Ereignissen wird Licht eingeschaltet
AUTO_ON_NICHT_NACH = 22 * 60   # 22:00 Uhr (kein Auto-Ein nach 22:00)

# Netzwerkadressen
SHELLY_IP = "10.80.23.51"
SHELLY_PORT = 80

NANOLEAF_IP = "10.80.23.56"
NANOLEAF_API_KEY = ""
NANOLEAF_URL = f"/api/v1/{NANOLEAF_API_KEY}/state"
NANOLEAF_PORT = 16021

WLED_IP = "10.80.23.22"
WLED_JSON_EIN = {
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
WLED_JSON_AUS = {"on": False}

# Lokale Sonnenuntergangszeit (als Schaltzeit)
sun_times = { 
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

# ------------------------------------------------------------------------------
# GLOBALE VARIABLEN
# ------------------------------------------------------------------------------
btnA_druck_start = None
wled_status = None
wled_auto_aus_timer = None

# LED-Status: "AUS" = LED aus, "COUNTDOWN" = progressiver Farbverlauf
led_status = "AUS"
led_status_start = 0.0
led_status_dauer = 0.0

pir_events = []       # Liste der PIR-Ereignisse (als Basis des Fortschritts)
WINDOW_DAUER = 300    # 5 Minuten Sliding Window
SOFTWARE_RESET_INT = 20
last_reset = 0

raum_belegt = False  # Raum als besetzt erkannt
last_event = None
min_licht_an_bis = 0

pir_sensor = None
led_rgb = None

zeit_sync = False
last_sync = 0

pir_active = False
manuell_override_bis = 0

# Um Spam im Countdown zu vermeiden (Debug nur bei Änderung der Schrittzahl)
_last_debug_count = -1

# Feste LED-Farben (als Integer)
LED_FARBEN = {
    "GRUEN": 0x00FF00,
    "GRUEN_PIR": 0x00FF00,
    "ROT": 0xFF0000,
    "AUS": 0x000000,
}

# ------------------------------------------------------------------------------
# HELFER-FUNKTIONEN FÜR DST (Sommer-/Winterzeit in Deutschland)
# ------------------------------------------------------------------------------
def day_of_week(year, month, day):
    if month < 3:
        month += 12
        year -= 1
    K = year % 100
    J = year // 100
    h = (day + (13*(month+1))//5 + K + K//4 + J//4 + 5*J) % 7
    return h

def last_sunday(year, month):
    last_day = 31
    h = day_of_week(year, month, last_day)
    offset = (h - 1) % 7
    return last_day - offset

def is_dst_germany(tm):
    year, month, day, hour, minute, second, weekday, yearday = tm
    if month < 3 or month > 10:
        return False
    if 4 <= month <= 9:
        return True
    ls = last_sunday(year, month)
    if month == 3:
        return (day > ls) or (day == ls and hour >= 2)
    else:
        return (day < ls) or (day == ls and hour < 3)

def get_germany_offset():
    winter_offset = 3600
    summer_offset = 7200
    tentative = time.localtime(time.time() + winter_offset)
    if is_dst_germany(tentative):
        return summer_offset
    else:
        return winter_offset

def local_time():
    offset = get_germany_offset()
    return time.localtime(time.time() + offset)

# ------------------------------------------------------------------------------
# HSV zu RGB Umrechnung (für den Farbverlauf)
# ------------------------------------------------------------------------------
def hsv_to_rgb(h, s, v):
    h = float(h)
    s = float(s)
    v = float(v)
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

def rgb_tuple_to_int(rgb_tuple):
    r, g, b = rgb_tuple
    return (r << 16) | (g << 8) | b

def step_to_hue(step, max_steps):
    return (step / (max_steps - 1)) * 120

def step_to_rgb(step, max_steps):
    hue = step_to_hue(step, max_steps)
    rgb = hsv_to_rgb(hue, 1, 1)
    return rgb_tuple_to_int(rgb)

# ------------------------------------------------------------------------------
# ZEITSYNCHRONISIERUNG (NTP)
# ------------------------------------------------------------------------------
def sync_zeit(ntp_ip="129.187.254.32", versuche=10, intervall=30):
    global zeit_sync
    ntptime.host = ntp_ip
    if DEBUG:
        print("DEBUG: Starte NTP-Sync (IP={})...".format(ntp_ip))
    for versuch in range(1, versuche + 1):
        try:
            if DEBUG:
                print("DEBUG: NTP-Versuch {}/{}".format(versuch, versuche))
            ntptime.settime()
            zeit_sync = True
            if DEBUG:
                print("DEBUG: Zeit-Sync OK ->", local_time())
            return
        except Exception as e:
            if DEBUG:
                print("DEBUG: NTP-Versuch {} fehlgeschlagen: {}".format(versuch, e))
            time.sleep(intervall)
    zeit_sync = False
    if DEBUG:
        print("DEBUG: Alle NTP-Versuche fehlgeschlagen => zeit_sync=False")

# ------------------------------------------------------------------------------
# MONATSSPEZIFISCHE SCHALTZEIT-FUNKTION
# ------------------------------------------------------------------------------
def ermittle_sunset_schaltzeit_minuten():
    current_month = local_time()[1]
    time_str = sun_times.get(current_month, {"sunset_schaltzeit": "16:30"})["sunset_schaltzeit"]
    hours, minutes = map(int, time_str.split(':'))
    return hours * 60 + minutes

# ------------------------------------------------------------------------------
# HELL-DUNKEL-PRÜFUNG
# ------------------------------------------------------------------------------
def ist_dunkel_genug():
    if not zeit_sync:
        if DEBUG:
            print("DEBUG: Kein Zeit-Sync => dunkel genug")
        return True
    lt = local_time()
    aktuelle_min = lt[3] * 60 + lt[4]
    if aktuelle_min >= AUTO_ON_NICHT_NACH:
        if DEBUG:
            print("DEBUG: {}:{:02d} - Nach 22:00, kein Auto-Ein".format(lt[3], lt[4]))
        return False
    schaltzeit = ermittle_sunset_schaltzeit_minuten()
    if aktuelle_min >= schaltzeit:
        if DEBUG:
            print("DEBUG: Dunkel genug für Auto-Ein")
        return True
    if DEBUG:
        print("DEBUG: Noch zu hell für Auto-Ein")
    return False

# ------------------------------------------------------------------------------
# NANOLEAF-FUNKTIONEN
# ------------------------------------------------------------------------------
def empfange_daten(sock, laenge):
    daten = b""
    while len(daten) < laenge:
        teil = sock.recv(1024)
        if not teil:
            break
        daten += teil
    return daten.decode()

def extrahiere_json(antwort):
    start = antwort.find("{")
    ende = antwort.rfind("}") + 1
    return antwort[start:ende] if start != -1 and ende > start else ""

def lese_nanoleaf_status():
    s = socket.socket()
    try:
        s.connect((NANOLEAF_IP, NANOLEAF_PORT))
        anfrage = "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(NANOLEAF_URL, NANOLEAF_IP)
        s.send(anfrage.encode())
        antwort = s.recv(1024).decode()
        laenge = 0
        for zeile in antwort.split("\r\n"):
            if zeile.lower().startswith("content-length:"):
                laenge = int(zeile.split(":")[1].strip())
        json_str = empfange_daten(s, laenge) if laenge else ""
        s.close()
        json_str = extrahiere_json(json_str)
        if json_str:
            return ujson.loads(json_str).get("on", {}).get("value", False)
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler beim Lesen des Nanoleaf-Status:", e)
    return None

def setze_nanoleaf(ein):
    s = socket.socket()
    try:
        s.connect((NANOLEAF_IP, NANOLEAF_PORT))
        payload = '{"on":{"value":' + ('true' if ein else 'false') + '}}'
        anfrage = "PUT {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}".format(NANOLEAF_URL, NANOLEAF_IP, len(payload), payload)
        s.send(anfrage.encode())
        s.recv(1024)
        s.close()
        if DEBUG:
            print("DEBUG: Nanoleaf =>", "EIN" if ein else "AUS")
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler beim Setzen des Nanoleaf-Status:", e)

# ------------------------------------------------------------------------------
# SHELLY-FUNKTIONEN
# ------------------------------------------------------------------------------
def setze_shelly(zustand):
    body = '{"id":0,"on":' + ('true' if zustand == "ein" else 'false') + '}'
    anfrage = "POST /rpc/Switch.Set HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}".format(SHELLY_IP, len(body), body)
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

def schalte_shelly_um():
    shelly_status = lese_shelly_status() or False
    nano_status = lese_nanoleaf_status() or False
    if shelly_status != nano_status:
        setze_shelly("aus")
        setze_nanoleaf(False)
        if DEBUG:
            print("DEBUG: Toggle => out-of-sync, jetzt AUS/AUS")
    else:
        if shelly_status:
            setze_shelly("aus")
            setze_nanoleaf(False)
            if DEBUG:
                print("DEBUG: Toggle => beide EIN, jetzt AUS/AUS")
        else:
            setze_shelly("ein")
            setze_nanoleaf(True)
            if DEBUG:
                print("DEBUG: Toggle => beide AUS, jetzt EIN/EIN")

# ------------------------------------------------------------------------------
# WLED-FUNKTIONEN
# ------------------------------------------------------------------------------
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
                header = "POST /json/state HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n".format(WLED_IP, len(body))
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

def aktualisiere_wled_status():
    global wled_status
    antwort = wled_anfrage("GET")
    if not antwort:
        wled_status = None
        return
    teile = antwort.decode("utf-8").split("\r\n\r\n", 1)
    try:
        wled_status = ujson.loads(teile[1]).get("on", False) if len(teile) > 1 else None
    except Exception as e:
        if DEBUG:
            print("DEBUG: Fehler beim Aktualisieren von WLED:", e)
        wled_status = None

def setze_wled(daten):
    global wled_status
    antwort = wled_anfrage("POST", daten)
    if antwort:
        wled_status = bool(daten.get("on", False))
        if DEBUG:
            print("DEBUG: WLED =>", "EIN" if wled_status else "AUS")
        setze_led("GRUEN" if wled_status else "ROT", MAX_LED_DAUER)

# ------------------------------------------------------------------------------
# LED-FUNKTIONEN (PIR-basierter Countdown)
# ------------------------------------------------------------------------------
def setze_led(zustand, dauer=180):
    global led_status, led_status_start, led_status_dauer
    led_status = zustand
    led_status_start = time.time()
    led_status_dauer = dauer
    if zustand in LED_FARBEN and zustand != "COUNTDOWN":
        led_rgb.fill_color(LED_FARBEN[zustand])

def update_countdown_led():
    global led_status, pir_events, _last_debug_count
    if led_status == "COUNTDOWN":
        count = len(pir_events)
        if count < EVENT_THRESHOLD:
            color = step_to_rgb(count, EVENT_THRESHOLD)
            led_rgb.fill_color(color)
            if count != _last_debug_count:
                if DEBUG:
                    print("DEBUG: PIR count: {}, LED color: #{:06X}".format(count, color))
                _last_debug_count = count
        else:
            if DEBUG and _last_debug_count != EVENT_THRESHOLD:
                print("DEBUG: Schwellenwert erreicht => Licht EIN")
            reagiere_raum_belegt()
            led_status = "AUS"
            pir_events.clear()
            _last_debug_count = -1

def bearbeite_led():
    # Wenn das Licht bereits eingeschaltet ist, soll die LED aus bleiben.
    if raum_belegt or (wled_status is not None and wled_status):
        led_rgb.fill_color(LED_FARBEN["AUS"])
        return
    if led_status == "COUNTDOWN":
        update_countdown_led()
    else:
        led_rgb.fill_color(LED_FARBEN.get(led_status, LED_FARBEN["AUS"]))

# ------------------------------------------------------------------------------
# PRÄSENZ-/BELEGUNGSLOGIK (PIR-Ereignisse)
# ------------------------------------------------------------------------------
def reagiere_raum_belegt():
    if not ist_dunkel_genug():
        if DEBUG:
            print("DEBUG: Es ist hell – automatische Schaltung wird nicht durchgeführt")
        return
    if DEBUG:
        print("DEBUG: Raum belegt => Shelly & Nanoleaf EIN")
    setze_shelly("ein")
    setze_nanoleaf(True)

def reagiere_raum_unbelegt():
    if DEBUG:
        print("DEBUG: Raum unbelegt => Shelly & Nanoleaf AUS")
    setze_shelly("aus")
    setze_nanoleaf(False)

def ueberkopflicht_an():
    return (lese_shelly_status() or False) or (lese_nanoleaf_status() or False)

def pir_aktiv(pir):
    global pir_events, last_reset, raum_belegt, last_event, led_status, pir_active
    now = time.time()
    if not ist_dunkel_genug():
        if DEBUG:
            print("DEBUG: PIR ignoriert – es ist hell")
        return
    if now < manuell_override_bis:
        if DEBUG:
            print("DEBUG: Manuelle Abschaltung aktiv, PIR ignoriert")
        return
    if DEBUG:
        print("DEBUG: Bewegung erkannt um", int(now))
    pir_events.append(now)
    last_reset = now
    last_event = now
    # Starte COUNTDOWN nur, wenn noch kein Licht an ist.
    if not raum_belegt and led_status == "AUS":
        led_status = "COUNTDOWN"
        pir_events.clear()
    update_countdown_led()
    if len(pir_events) >= EVENT_THRESHOLD:
        if DEBUG:
            print("DEBUG: Schwellenwert erreicht => Licht EIN")
        reagiere_raum_belegt()
        raum_belegt = True
        led_status = "AUS"
        pir_events.clear()
    pir_active = True

def pir_inaktiv(pir):
    global pir_active
    if DEBUG:
        print("DEBUG: PIR NICHT-AKTIV")
    pir_active = False

# ------------------------------------------------------------------------------
# SETUP UND HAUPTSCHLEIFE
# ------------------------------------------------------------------------------
def setup():
    global led_rgb, pir_sensor, last_sync
    M5.begin()
    sync_zeit("129.187.254.32", versuche=10, intervall=30)
    last_sync = time.time()
    led_rgb = RGB(io=35, n=1, type="SK6812")
    pir_sensor = PIRUnit((1, 2))
    pir_sensor.set_callback(pir_aktiv, pir_sensor.IRQ_ACTIVE)
    pir_sensor.set_callback(pir_inaktiv, pir_sensor.IRQ_NEGATIVE)
    pir_sensor.enable_irq()
    setze_led("AUS", MAX_LED_DAUER)

def main_loop():
    global wled_auto_aus_timer, wled_status, raum_belegt, last_event
    global manuell_override_bis, pir_active, last_reset, pir_events, btnA_druck_start, last_sync
    M5.update()
    now = time.time()
    # Wenn LED im COUNTDOWN-Modus und seit dem letzten PIR-Event INAKTIV_TIMEOUT erreicht wurden, schalte LED aus.
    if led_status == "COUNTDOWN" and last_event is not None and (now - last_event) >= INAKTIV_TIMEOUT:
        if DEBUG:
            print("DEBUG: Inaktivität erreicht im COUNTDOWN -> LED AUS")
        setze_led("AUS", 0)
    if raum_belegt and last_event and (now - last_event) >= INAKTIV_TIMEOUT:
        if ist_dunkel_genug():
            reagiere_raum_unbelegt()
        raum_belegt = False
        pir_events.clear()
        last_event = None
    bearbeite_led()
    if now - last_sync >= 43200:
        if DEBUG:
            print("DEBUG: 12h vergangen => erneute NTP-Synchronisation")
        sync_zeit("129.187.254.32", versuche=10, intervall=30)
        last_sync = time.time()
    if wled_auto_aus_timer and wled_status and now >= wled_auto_aus_timer:
        setze_wled(WLED_JSON_AUS)
        wled_auto_aus_timer = None
    if BtnA.isPressed():
        if btnA_druck_start is None:
            btnA_druck_start = now
    else:
        if btnA_druck_start is not None:
            druck_dauer = now - btnA_druck_start
            if druck_dauer >= 1.5:
                if DEBUG:
                    print("DEBUG: Langer Tastendruck ({}s) => Shelly & Nanoleaf toggeln".format(int(druck_dauer)))
                if ueberkopflicht_an():
                    schalte_shelly_um()
                    manuell_override_bis = now + 1800
                    pir_events.clear()
                    last_event = None
                    raum_belegt = False
                else:
                    schalte_shelly_um()
            else:
                if DEBUG:
                    print("DEBUG: Kurzer Tastendruck ({}s) => WLED toggeln".format(int(druck_dauer)))
                if wled_status is None or not wled_status:
                    setze_wled(WLED_JSON_EIN)
                    wled_auto_aus_timer = now + 120
                else:
                    setze_wled(WLED_JSON_AUS)
                    wled_auto_aus_timer = None
                    manuell_override_bis = now + 1800
                    pir_events.clear()
                    last_event = None
                    raum_belegt = False
            btnA_druck_start = None
    time.sleep(0.1)

if __name__ == "__main__":
    _last_debug_count = -1
    try:
        setup()
        while True:
            main_loop()
    except (Exception, KeyboardInterrupt) as e:
        print("DEBUG: Fehler:", e)
        