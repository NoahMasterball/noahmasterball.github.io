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
EVENT_THRESHOLD = 10           # Bei 10 PIR-Ereignissen wird Licht eingeschaltet
AUTO_ON_NICHT_NACH = 22 * 60   # 22:00 Uhr

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

# Lokale Sonnenuntergangszeiten (als Schaltzeit)
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

# NTP-Host zentralisieren
NTP_HOST = "ntp1.lrz.de"

# Button-Konstanten
LONG_PRESS_THRESHOLD = 1.5     # Sekunden
DOUBLE_PRESS_INTERVAL = 0.5    # Sekunden

# ------------------------------------------------------------------------------
# GLOBALE VARIABLEN
# ------------------------------------------------------------------------------
btnA_druck_start = None
last_short_press_release = None
wled_status = None
wled_auto_aus_timer = None

pir_events = []       # Liste der PIR-Ereignisse
last_reset = 0

raum_belegt = False  # Raum als belegt erkannt
last_event = None

pir_sensor = None
led_rgb = None

zeit_sync = False
last_sync = 0

pir_active = False
manuell_override_bis = 0

# Feste LED-Farben (als Integer)
LED_FARBEN = {
    "GRUEN": 0x00FF00,
    "GRUEN_PIR": 0x00FF00,
    "ROT": 0xFF0000,
    "AUS": 0x000000,
}

# Globale Variablen für die zentrale LED-Steuerung
led_display_active = False
led_display_expiry = 0
led_display_color = None
led_display_start = 0

# ------------------------------------------------------------------------------
# HELFER-FUNKTION: Formatierung des Zeitstempels für Debug-Ausgaben
# ------------------------------------------------------------------------------
def format_debug_time(tm):
    # tm: tuple returned by time.localtime, Format: (year, month, day, hour, minute, second, weekday, yearday)
    day = tm[2]
    month = tm[1]
    hour = tm[3]
    minute = tm[4]
    month_names = {1:"Jan", 2:"Feb", 3:"Mar", 4:"Apr", 5:"May", 6:"Jun", 7:"Jul", 8:"Aug", 9:"Sep", 10:"Oct", 11:"Nov", 12:"Dec"}
    return "{:02d} {}, {:02d}:{:02d}:".format(day, month_names.get(month, "??"), hour, minute)

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
    winter_offset = 7200
    summer_offset = 10800
    tentative = time.localtime(time.time() + winter_offset)
    if is_dst_germany(tentative):
        return summer_offset
    else:
        return winter_offset

def local_time():
    offset = get_germany_offset()
    return time.localtime(time.time() + offset)

# ------------------------------------------------------------------------------
# HSV zu RGB Umrechnung (für Farbübergänge)
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

# Angepasst: Bei count=1 startet der Verlauf mit Rot (Hue=0)
def step_to_hue(step, max_steps):
    if step <= 1:
        return 0
    return ((step - 1) / (max_steps - 1)) * 120

def step_to_rgb(step, max_steps):
    hue = step_to_hue(step, max_steps)
    rgb = hsv_to_rgb(hue, 1, 1)
    return rgb_tuple_to_int(rgb)

# ------------------------------------------------------------------------------
# ZEITSYNCHRONISIERUNG (NTP)
# ------------------------------------------------------------------------------
def sync_zeit(ntp_ip=NTP_HOST, versuche=10, intervall=30):
    global zeit_sync
    ntptime.host = ntp_ip
    if DEBUG:
        print("{} Starte NTP-Sync (Host={})...".format(format_debug_time(local_time()), ntp_ip))
    for versuch in range(1, versuche + 1):
        try:
            if DEBUG:
                print("{} NTP-Versuch {}/{}".format(format_debug_time(local_time()), versuch, versuche))
            ntptime.settime()
            zeit_sync = True
            if DEBUG:
                print("{} Zeit-Sync OK -> {}".format(format_debug_time(local_time()), local_time()))
            return
        except Exception as e:
            if DEBUG:
                print("{} NTP-Versuch {} fehlgeschlagen: {}".format(format_debug_time(local_time()), versuch, e))
            time.sleep(intervall)
    zeit_sync = False
    if DEBUG:
        print("{} Alle NTP-Versuche fehlgeschlagen => zeit_sync=False".format(format_debug_time(local_time())))

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
            print("{} Kein Zeit-Sync => dunkel genug".format(format_debug_time(local_time())))
        return True
    lt = local_time()
    aktuelle_min = lt[3] * 60 + lt[4]
    if aktuelle_min >= AUTO_ON_NICHT_NACH:
        if DEBUG:
            print("{} Nach 22:00, kein Auto-Ein".format(format_debug_time(lt)))
        return False
    schaltzeit = ermittle_sunset_schaltzeit_minuten()
    if aktuelle_min >= schaltzeit:
        if DEBUG:
            print("{} Dunkel genug für Auto-Ein".format(format_debug_time(local_time())))
        return True
    if DEBUG:
        print("{} Noch zu hell für Auto-Ein".format(format_debug_time(local_time())))
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
            print("{} Fehler beim Lesen des Nanoleaf-Status: {}".format(format_debug_time(local_time()), e))
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
            print("{} Nanoleaf => {}".format(format_debug_time(local_time()), "EIN" if ein else "AUS"))
    except Exception as e:
        if DEBUG:
            print("{} Fehler beim Setzen des Nanoleaf-Status: {}".format(format_debug_time(local_time()), e))

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
            print("{} Shelly => {}".format(format_debug_time(local_time()), zustand.upper()))
    except Exception as e:
        if DEBUG:
            print("{} Fehler bei Shelly: {}".format(format_debug_time(local_time()), e))

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
            print("{} Fehler beim Lesen des Shelly-Status: {}".format(format_debug_time(local_time()), e))
    return None

def schalte_shelly_um():
    shelly_status = lese_shelly_status() or False
    nano_status = lese_nanoleaf_status() or False
    if shelly_status != nano_status:
        setze_shelly("aus")
        setze_nanoleaf(False)
        if DEBUG:
            print("{} Toggle => out-of-sync, jetzt AUS/AUS".format(format_debug_time(local_time())))
    else:
        if shelly_status:
            setze_shelly("aus")
            setze_nanoleaf(False)
            if DEBUG:
                print("{} Toggle => beide EIN, jetzt AUS/AUS".format(format_debug_time(local_time())))
        else:
            setze_shelly("ein")
            setze_nanoleaf(True)
            if DEBUG:
                print("{} Toggle => beide AUS, jetzt EIN/EIN".format(format_debug_time(local_time())))

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
                print("{} WLED-Anfrage Fehler: {}".format(format_debug_time(local_time()), e))
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
            print("{} Fehler beim Aktualisieren von WLED: {}".format(format_debug_time(local_time()), e))
        wled_status = None

def setze_wled(daten):
    global wled_status
    antwort = wled_anfrage("POST", daten)
    if antwort:
        wled_status = bool(daten.get("on", False))
        if DEBUG:
            print("{} WLED => {}".format(format_debug_time(local_time()), "EIN" if wled_status else "AUS"))
        # WLED-Feedback überschreibt immer (force_override=True)
        if wled_status:
            display_led("GRUEN", 60, force_override=True)
        else:
            display_led("ROT", 30, force_override=True)

# ------------------------------------------------------------------------------
# ZENTRALISIERTE LED-STEUERUNG
# ------------------------------------------------------------------------------
def display_led(color, duration=2, force_override=False):
    """
    Schaltet die LED auf den gewünschten Farbmodus für die angegebene Dauer.
    Bei force_override=True wird der aktuelle Feedback-Zustand überschrieben.
    Ohne force_override werden neue Aufrufe ignoriert, solange eine Anzeige aktiv ist.
    """
    global led_display_active, led_display_expiry, led_display_color, led_display_start
    now = time.time()
    if color == "AUS":
        led_display_active = False
        led_rgb.fill_color(LED_FARBEN["AUS"])
        if DEBUG:
            print("{} LED ausgeschaltet.".format(format_debug_time(local_time())))
        return
    if not force_override:
        if led_display_active and now < led_display_expiry:
            if DEBUG:
                print("{} LED-Anzeige bereits aktiv bis {:.2f}, neuer Aufruf wird ignoriert.".format(format_debug_time(local_time()), led_display_expiry))
            return
    led_display_active = True
    led_display_expiry = now + duration
    led_display_color = color
    led_display_start = now
    if color == "WEISS_BLINKEN":
        led_rgb.fill_color(0xFFFFFF)
    elif color in LED_FARBEN:
        led_rgb.fill_color(LED_FARBEN[color])
    else:
        try:
            col = int(color, 0) if isinstance(color, str) else color
        except Exception:
            col = LED_FARBEN["AUS"]
        led_rgb.fill_color(col)
    if DEBUG:
        print("{} LED auf {} für {} Sekunden gesetzt.".format(format_debug_time(local_time()), color, duration))

def update_led_display():
    """
    Wird in jedem Loop aufgerufen, um zu prüfen, ob die Feedback-LED abgelaufen ist.
    Wenn die Anzeigedauer erreicht wurde, wird die LED ausgeschaltet.
    """
    global led_display_active, led_display_expiry, led_display_color, led_display_start
    now = time.time()
    if led_display_active and now >= led_display_expiry:
        led_rgb.fill_color(LED_FARBEN["AUS"])
        led_display_active = False
        led_display_expiry = 0
        led_display_color = None
        if DEBUG:
            print("{} LED-Anzeige-Dauer abgelaufen, LED ausgeschaltet.".format(format_debug_time(local_time())))

# ------------------------------------------------------------------------------
# PRÄSENZ-/BELEGUNGSLOGIK (PIR-Ereignisse mit progressivem Farbverlauf)
# ------------------------------------------------------------------------------
def reagiere_raum_belegt():
    if not ist_dunkel_genug():
        if DEBUG:
            print("{} Es ist hell – automatische Schaltung wird nicht durchgeführt".format(format_debug_time(local_time())))
        return
    if DEBUG:
        print("{} Raum belegt => Shelly & Nanoleaf EIN".format(format_debug_time(local_time())))
    setze_shelly("ein")
    setze_nanoleaf(True)

def reagiere_raum_unbelegt():
    if DEBUG:
        print("{} Raum unbelegt => Shelly & Nanoleaf AUS".format(format_debug_time(local_time())))
    setze_shelly("aus")
    setze_nanoleaf(False)

def ueberkopflicht_an():
    return (lese_shelly_status() or False) or (lese_nanoleaf_status() or False)

def pir_aktiv(pir):
    global pir_events, last_reset, raum_belegt, last_event, pir_active
    now = time.time()
    if not ist_dunkel_genug():
        if DEBUG:
            print("{} PIR ignoriert – es ist hell".format(format_debug_time(local_time())))
        return
    if now < manuell_override_bis:
        if DEBUG:
            print("{} Manuelle Abschaltung aktiv, PIR ignoriert".format(format_debug_time(local_time())))
        return
    # PIR-Farbverlauf nur anzeigen, wenn weder Nanoleaf noch Shelly aktiv sind:
    if ueberkopflicht_an():
        if DEBUG:
            print("{} Nanoleaf/Shelly sind aktiv, PIR-Farbverlauf wird nicht angezeigt.".format(format_debug_time(local_time())))
        return
    if raum_belegt:
        if DEBUG:
            print("{} Licht bereits an, PIR-Event ignoriert".format(format_debug_time(local_time())))
        return
    if DEBUG:
        print("{} Bewegung erkannt um {}".format(format_debug_time(local_time()), int(now)))
    pir_events.append(now)
    last_reset = now
    last_event = now
    count = len(pir_events)
    if count < EVENT_THRESHOLD:
        # Bei count=1 startet der Verlauf mit Rot (Hue=0)
        color = step_to_rgb(count, EVENT_THRESHOLD)
        if DEBUG:
            print("{} PIR count: {} von {}, computed color: #{:06X}".format(format_debug_time(local_time()), count, EVENT_THRESHOLD, color))
        # Anzeige für 2 Sekunden (Feedback wird nicht überschrieben)
        display_led(color, 2)
    else:
        if DEBUG:
            print("{} Schwellenwert erreicht => Licht EIN".format(format_debug_time(local_time())))
        reagiere_raum_belegt()
        raum_belegt = True
        pir_events.clear()
    pir_active = True

def pir_inaktiv(pir):
    global pir_active
    if DEBUG:
        print("{} PIR NICHT-AKTIV".format(format_debug_time(local_time())))
    pir_active = False

# ------------------------------------------------------------------------------
# BUTTON-PRESS ACTIONS (Long Press und Double Press)
# ------------------------------------------------------------------------------
def process_long_press():
    global manuell_override_bis, pir_events, last_event, raum_belegt
    t = time.time()
    if DEBUG:
        print("{} Langer oder Doppel-Tastendruck => Shelly & Nanoleaf toggeln".format(format_debug_time(local_time())))
    schalte_shelly_um()
    manuell_override_bis = t + 1800
    pir_events.clear()
    last_event = None
    raum_belegt = False

def process_short_press():
    global wled_status, wled_auto_aus_timer, manuell_override_bis, pir_events, last_event, raum_belegt
    t = time.time()
    if DEBUG:
        print("{} Kurzer Tastendruck => WLED toggeln".format(format_debug_time(local_time())))
    if wled_status is None or not wled_status:
        setze_wled(WLED_JSON_EIN)
        wled_auto_aus_timer = t + 60    # WLED bleibt 60 Sekunden an
    else:
        setze_wled(WLED_JSON_AUS)
        wled_auto_aus_timer = None
        manuell_override_bis = t + 1800
        pir_events.clear()
        last_event = None
        raum_belegt = False

# ------------------------------------------------------------------------------
# SETUP UND HAUPTSCHLEIFE
# ------------------------------------------------------------------------------
def setup():
    global led_rgb, pir_sensor, last_sync
    M5.begin()
    sync_zeit(NTP_HOST, versuche=10, intervall=30)
    last_sync = time.time()
    led_rgb = RGB(io=35, n=1, type="SK6812")
    pir_sensor = PIRUnit((1, 2))
    pir_sensor.set_callback(pir_aktiv, pir_sensor.IRQ_ACTIVE)
    pir_sensor.set_callback(pir_inaktiv, pir_sensor.IRQ_NEGATIVE)
    pir_sensor.enable_irq()
    led_rgb.fill_color(LED_FARBEN["AUS"])
    global led_display_active
    led_display_active = False

def main_loop():
    global wled_auto_aus_timer, wled_status, raum_belegt, last_event
    global manuell_override_bis, pir_active, last_reset, pir_events, btnA_druck_start, last_sync, last_short_press_release
    M5.update()
    now = time.time()
    if raum_belegt and last_event and (now - last_event) >= INAKTIV_TIMEOUT:
        if ist_dunkel_genug():
            reagiere_raum_unbelegt()
        raum_belegt = False
        pir_events.clear()
        last_event = None
    update_led_display()
    if now - last_sync >= 43200:
        if DEBUG:
            print("{} 12h vergangen => erneute NTP-Synchronisation".format(format_debug_time(local_time())))
        sync_zeit(NTP_HOST, versuche=10, intervall=30)
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
            if druck_dauer >= LONG_PRESS_THRESHOLD:
                if DEBUG:
                    print("{} Langer Tastendruck ({}s) => Shelly & Nanoleaf toggeln".format(format_debug_time(local_time()), int(druck_dauer)))
                process_long_press()
                last_short_press_release = None
            else:
                if last_short_press_release is not None and (now - last_short_press_release) < DOUBLE_PRESS_INTERVAL:
                    if DEBUG:
                        print("{} Doppel-Tastendruck erkannt => Shelly & Nanoleaf toggeln".format(format_debug_time(local_time())))
                    process_long_press()
                    last_short_press_release = None
                else:
                    last_short_press_release = now
            btnA_druck_start = None
    if last_short_press_release is not None and (now - last_short_press_release >= DOUBLE_PRESS_INTERVAL) and not BtnA.isPressed():
        process_short_press()
        last_short_press_release = None
    time.sleep(0.1)

if __name__ == "__main__":
    try:
        setup()
        while True:
            main_loop()
    except (Exception, KeyboardInterrupt) as e:
        print("{} Fehler: {}".format(format_debug_time(local_time()), e))
