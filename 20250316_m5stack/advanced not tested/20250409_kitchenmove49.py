import M5 
from M5 import BtnA
import usocket as socket
import ujson, time, ntptime
from hardware import RGB
from unit import PIRUnit

# ------------------------------------------------------------------------------
# KONFIGURATION
# ------------------------------------------------------------------------------
DEBUG = True     # Debugmodus: True; Produktion: False
TESTMODE = True  # Testmodus:  True; Produktion: False

if TESTMODE:
    INAKT_TIMEOUT = 60          # Testmodus: 20 Sek. Inaktivität
    EVENT_THRESHOLD = 5           # Schwellenwert im Testmodus
    MANUAL_OVERRIDE_TIME = 60     # 60 Sek. manueller Override
    AUTO_ON_NICHT_NACH = 1500     # Immer "dunkel genug"
else:
    INAKT_TIMEOUT = 300         # 300 Sek. (5 Minuten)
    EVENT_THRESHOLD = 12          # 12 Events
    MANUAL_OVERRIDE_TIME = 900   # 1800 Sek. = 30 Min.
    AUTO_ON_NICHT_NACH = 22 * 60  # 22:00 Uhr

# Netzwerkadressen
SHELLY_IP = "10.80.23.51"
SHELLY_PORT = 80

NANOLEAF_IP = "10.80.23.56"
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

# Lokale Sonnenuntergangszeiten
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

# NTP-Host
NTP_HOST = "ntp1.lrz.de"

# Button-Konstante
LONG_PRESS_THRESHOLD = 1.5  # Sek.
DOUBLE_CLICK_TIME = 0.5  # Max Zeit zwischen Klicks für Doppelklick

# Socket timeout (wichtig!)
SOCKET_TIMEOUT = 5  # 5 Sekunden timeout für alle Socket-Operationen

# ------------------------------------------------------------------------------
# GLOBALE VARIABLEN
# ------------------------------------------------------------------------------
btnA_druck_start = None
btnA_last_release_time = 0  # Für manuelle Doppelklick-Erkennung
btnA_click_pending = False   # Flag für ausstehenden Klick
test_mode_active = False  # Test-Modus für Button-Tests
wled_status = None
wled_auto_aus_timer = None

pir_events = []   # PIR-Ereignisse
last_reset = 0

raum_belegt = False  # Raumbelegung (wird jetzt intern geführt, aber auto-off beruht _allein_ auf last_event)
last_event = None   # Zeitstempel der letzten Bewegung (wird auch bei manueller Einschaltung gesetzt)

pir_sensor = None
led_rgb = None

zeit_sync = False
last_sync = 0

pir_active = False
manuell_override_bis = 0

# Globaler Cache für Lichtzustand
last_state_update_time = 0
cached_light_state = False

# LED-Farben
LED_FARBEN = {
    "GRUEN": 0x00FF00,
    "GRUEN_PIR": 0x00FF00,
    "ROT": 0xFF0000,
    "AUS": 0x000000,
    "BLAU": 0x0000FF,  # Für Test-Modus
}

# LED-Steuerung
led_display_active = False
led_display_expiry = 0
led_display_color = None
led_display_start = 0

# Watchdog
last_watchdog_feed = 0
WATCHDOG_TIMEOUT = 30  # 30 Sekunden

# ------------------------------------------------------------------------------
# HELFER: Zeitstempel-Formatierung (ohne Komma, 2 Leerzeichen)
# ------------------------------------------------------------------------------
def format_debug_time(tm):
    day = tm[2]
    month = tm[1]
    hour = tm[3]
    minute = tm[4]
    second = tm[5]
    month_names = {1:"Jan", 2:"Feb", 3:"Mar", 4:"Apr", 5:"May", 6:"Jun", 7:"Jul", 8:"Aug", 9:"Sep", 10:"Oct", 11:"Nov", 12:"Dec"}
    return "{:02d} {} {:02d}:{:02d}:{:02d}  ".format(day, month_names.get(month, "??"), hour, minute, second)

# ------------------------------------------------------------------------------
# .env-Datei einlesen
# ------------------------------------------------------------------------------
def load_env(filename=".env"):
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

secrets = load_env(".env")
nanoleaf_key = secrets.get("NANOLEAF_API_KEY")
if nanoleaf_key:
    print("API Key geladen: ******************" + nanoleaf_key[-5:])
    NANOLEAF_URL = f"/api/v1/{nanoleaf_key}/state"
else:
    print("API Key nicht gefunden.")
    raise ValueError("NANOLEAF_API_KEY fehlt in der .env-Datei!")

# ------------------------------------------------------------------------------
# HELFER FÜR DST
# ------------------------------------------------------------------------------
def day_of_week(year, month, day):
    if month < 3:
        month += 12
        year -= 1
    K = year % 100
    J = year // 100
    return (day + (13*(month+1))//5 + K + K//4 + J//4 + 5*J) % 7

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
    return summer_offset if is_dst_germany(tentative) else winter_offset

def local_time():
    offset = get_germany_offset()
    return time.localtime(time.time() + offset)

# ------------------------------------------------------------------------------
# HSV zu RGB
# ------------------------------------------------------------------------------
def hsv_to_rgb(h, s, v):
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

def rgb_tuple_to_int(rgb_tuple):
    r, g, b = rgb_tuple
    return (r << 16) | (g << 8) | b

def step_to_hue(step, max_steps):
    return 0 if step <= 1 else ((step - 1) / (max_steps - 1)) * 120

def step_to_rgb(step, max_steps):
    hue = step_to_hue(step, max_steps)
    return rgb_tuple_to_int(hsv_to_rgb(hue, 1, 1))

# ------------------------------------------------------------------------------
# ZEITSYNCHRONISIERUNG (NTP)
# ------------------------------------------------------------------------------
def sync_zeit(ntp_ip=NTP_HOST, versuche=10, intervall=30):
    global zeit_sync
    ntptime.host = ntp_ip
    if DEBUG:
        print("{} NTP-Sync: Host={}".format(format_debug_time(local_time()), ntp_ip))
    for versuch in range(1, versuche + 1):
        try:
            if DEBUG:
                print("{} NTP {}/{}: retry in {} Sek.".format(format_debug_time(local_time()), versuch, versuche, intervall))
            ntptime.settime()
            zeit_sync = True
            if DEBUG:
                print("{} Sync OK -> {} (next in 43200 Sek.)".format(format_debug_time(local_time()), local_time()))
            return
        except Exception as e:
            if DEBUG:
                print("{} NTP {}/{} fehl: {} - retry in {} Sek.".format(format_debug_time(local_time()), versuch, versuche, e, intervall))
            time.sleep(intervall)
    zeit_sync = False
    if DEBUG:
        print("{} NTP fehlgeschl.: Sync=False".format(format_debug_time(local_time())))

# ------------------------------------------------------------------------------
# MONATSSPEZIFISCHE SCHALTZEIT
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
    # Diese Funktion wird weiterhin für das automatische Einschalten via PIR genutzt
    # Im Test-Modus ist es immer "dunkel genug"
    if test_mode_active:
        if DEBUG:
            print("{} Test-Modus aktiv => immer dunkel".format(format_debug_time(local_time())))
        return True
    if not zeit_sync:
        if DEBUG:
            print("{} Kein Sync => dunkel (schnell Prüfen)".format(format_debug_time(local_time())))
        return True
    lt = local_time()
    aktuelle_min = lt[3] * 60 + lt[4]
    if aktuelle_min >= AUTO_ON_NICHT_NACH:
        secs = (24*60 - aktuelle_min) * 60
        if DEBUG:
            print("{} Nach 22:00: Auto-Off ({} Sek. bis Tagesw.)".format(format_debug_time(lt), secs))
        return False
    schaltzeit = ermittle_sunset_schaltzeit_minuten()
    if aktuelle_min >= schaltzeit:
        if DEBUG:
            print("{} Dunkel: Auto-On (prüf in 60 Sek.)".format(format_debug_time(local_time())))
        return True
    else:
        remaining = (schaltzeit - aktuelle_min) * 60
        if DEBUG:
            print("{} Zu hell - prüf in {} Sek.".format(format_debug_time(local_time()), remaining))
        return False

# ------------------------------------------------------------------------------
# NANOLEAF-FUNKTIONEN (mit Timeout)
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
    s.settimeout(SOCKET_TIMEOUT)  # Wichtig: Socket Timeout setzen!
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
            print("{} NL-Fehler: {} - retry in 30 Sek.".format(format_debug_time(local_time()), e))
    finally:
        try:
            s.close()
        except:
            pass
    return None

def setze_nanoleaf(ein):
    s = socket.socket()
    s.settimeout(SOCKET_TIMEOUT)  # Wichtig: Socket Timeout setzen!
    try:
        s.connect((NANOLEAF_IP, NANOLEAF_PORT))
        payload = '{"on":{"value":' + ('true' if ein else 'false') + '}}'
        anfrage = "PUT {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}".format(NANOLEAF_URL, NANOLEAF_IP, len(payload), payload)
        s.send(anfrage.encode())
        s.recv(1024)
        s.close()
        if DEBUG:
            print("{} NL => {} - Zustand aktualisiert.".format(format_debug_time(local_time()), "EIN" if ein else "AUS"))
    except Exception as e:
        if DEBUG:
            print("{} NL-SetFehler: {} - retry in 30 Sek.".format(format_debug_time(local_time()), e))
    finally:
        try:
            s.close()
        except:
            pass

# ------------------------------------------------------------------------------
# SHELLY-FUNKTIONEN (mit Timeout)
# ------------------------------------------------------------------------------
def setze_shelly(zustand):
    body = '{"id":0,"on":' + ('true' if zustand == "ein" else 'false') + '}'
    anfrage = "POST /rpc/Switch.Set HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}".format(SHELLY_IP, len(body), body)
    s = socket.socket()
    s.settimeout(SOCKET_TIMEOUT)  # Wichtig: Socket Timeout setzen!
    try:
        addr = socket.getaddrinfo(SHELLY_IP, SHELLY_PORT)[0][-1]
        s.connect(addr)
        s.send(anfrage.encode())
        s.recv(2048)
        s.close()
        if DEBUG:
            print("{} Shelly => {} - Zustand aktualisiert.".format(format_debug_time(local_time()), zustand.upper()))
    except Exception as e:
        if DEBUG:
            print("{} Shelly-Fehler: {} - retry in 30 Sek.".format(format_debug_time(local_time()), e))
    finally:
        try:
            s.close()
        except:
            pass

def lese_shelly_status():
    anfrage = "GET /rpc/Switch.GetStatus?id=0 HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(SHELLY_IP)
    s = socket.socket()
    s.settimeout(SOCKET_TIMEOUT)  # Wichtig: Socket Timeout setzen!
    try:
        addr = socket.getaddrinfo(SHELLY_IP, SHELLY_PORT)[0][-1]
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
            print("{} Shelly-Status Fehler: {} - retry in 30 Sek.".format(format_debug_time(local_time()), e))
    finally:
        try:
            s.close()
        except:
            pass
    return None

def schalte_shelly_um():
    shelly_status = lese_shelly_status() or False
    nano_status = lese_nanoleaf_status() or False
    if shelly_status != nano_status:
        setze_shelly("aus")
        setze_nanoleaf(False)
        if DEBUG:
            print("{} Toggle: out-of-sync -> AUS/AUS - manueller Toggle.".format(format_debug_time(local_time())))
        return False
    else:
        if shelly_status:
            setze_shelly("aus")
            setze_nanoleaf(False)
            if DEBUG:
                print("{} Toggle: beide AN -> AUS/AUS - manueller Toggle.".format(format_debug_time(local_time())))
            return False
        else:
            setze_shelly("ein")
            setze_nanoleaf(True)
            if DEBUG:
                print("{} Toggle: beide AUS -> EIN/EIN - manueller Toggle.".format(format_debug_time(local_time())))
            return True

def update_light_cache(new_state):
    global cached_light_state, last_state_update_time
    cached_light_state = new_state
    last_state_update_time = time.time()

# ------------------------------------------------------------------------------
# WLED-FUNKTIONEN (mit Timeout)
# ------------------------------------------------------------------------------
def wled_anfrage(methode="GET", daten=None, versuche=5):
    for _ in range(versuche):
        s = socket.socket()
        s.settimeout(SOCKET_TIMEOUT)  # Wichtig: Socket Timeout setzen!
        try:
            addr = socket.getaddrinfo(WLED_IP, 80)[0][-1]
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
                raise ValueError("Param.-Fehler.")
            antwort = s.recv(2048)
            s.close()
            if antwort:
                return antwort
        except Exception as e:
            if DEBUG:
                print("{} WLED Fehler: {} - retry in 1 Sek.".format(format_debug_time(local_time()), e))
            time.sleep(1)
        finally:
            try:
                s.close()
            except:
                pass
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
            print("{} WLED Aktu-Fehler: {} - retry in 30 Sek.".format(format_debug_time(local_time()), e))
        wled_status = None

def setze_wled(daten):
    global wled_status
    antwort = wled_anfrage("POST", daten)
    if antwort:
        wled_status = bool(daten.get("on", False))
        if DEBUG:
            print("{} WLED => {} - Zustand aktualisiert.".format(format_debug_time(local_time()), "EIN" if wled_status else "AUS"))
        if wled_status:
            display_led("GRUEN", 60, force_override=True)
        else:
            display_led("ROT", 30, force_override=True)

# ------------------------------------------------------------------------------
# ZENTRALISIERTE LED-STEUERUNG
# ------------------------------------------------------------------------------
def display_led(color, duration=2, force_override=False):
    global led_display_active, led_display_expiry, led_display_color, led_display_start
    now = time.time()
    if color == "AUS":
        led_display_active = False
        led_rgb.fill_color(LED_FARBEN["AUS"])
        if DEBUG:
            print("{} LED aus. (0 Sek.)".format(format_debug_time(local_time())))
        return
    if not force_override and led_display_active and now < led_display_expiry:
        remaining = int(led_display_expiry - now)
        if DEBUG:
            print("{} LED aktiv bis {} ({} Sek. zb.), ignoriert.".format(format_debug_time(local_time()), int(led_display_expiry), remaining))
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
        print("{} LED {} für {} Sek. an.".format(format_debug_time(local_time()), color, duration))

def update_led_display():
    global led_display_active, led_display_expiry, led_display_color, led_display_start
    now = time.time()
    if led_display_active and now >= led_display_expiry:
        led_rgb.fill_color(LED_FARBEN["AUS"])
        led_display_active = False
        led_display_expiry = 0
        led_display_color = None
        if DEBUG:
            print("{} LED-Dauer abgelaufen, LED aus.".format(format_debug_time(local_time())))

# ------------------------------------------------------------------------------
# PRÄSENZ-/BELEGUNGSLOGIK (PIR mit Farbverlauf)
# ------------------------------------------------------------------------------
def reagiere_raum_belegt():
    # Automatisches Einschalten über PIR: Hier wird immer geprüft, ob es dunkel genug ist,
    # sodass sich das Licht bei entsprechender Bewegung automatisch einschaltet.
    if not ist_dunkel_genug():
        if DEBUG:
            print("{} Raum belegt (auto): Es ist zu hell, Licht bleibt aus.".format(format_debug_time(local_time())))
        return
    if DEBUG:
        print("{} Raum belegt (auto): Shelly/NL werden eingeschaltet.".format(format_debug_time(local_time())))
    setze_shelly("ein")
    setze_nanoleaf(True)
    update_light_cache(True)

def reagiere_raum_unbelegt():
    global cached_light_state
    # Wenn das Licht bereits aus ist, überspringen wir den API-Aufruf:
    if not cached_light_state:
        if DEBUG:
            print("{} Licht ist bereits aus, Abschaltung wird übersprungen.".format(format_debug_time(local_time())))
        return
    if DEBUG:
        print("{} Raum unbelegt: Shelly/Nanoleaf werden ausgeschaltet.".format(format_debug_time(local_time())))
    setze_shelly("aus")
    setze_nanoleaf(False)
    update_light_cache(False)

def ueberkopflicht_an():
    global last_state_update_time, cached_light_state
    refresh_interval = 300  # 5 Min. statt 30 Min für bessere Aktualität
    now = time.time()
    if now - last_state_update_time < refresh_interval:
        return cached_light_state
    else:
        shelly_state = lese_shelly_status() or False
        nanoleaf_state = lese_nanoleaf_status() or False
        updated_state = shelly_state or nanoleaf_state
        cached_light_state = updated_state
        last_state_update_time = now
        if DEBUG:
            print("{} Zust.-akt. OK: Shelly={}, NL={}, Resultat={} - gültig für {} Sek.".format(format_debug_time(local_time()), shelly_state, nanoleaf_state, updated_state, refresh_interval))
        return updated_state

def pir_aktiv(pir):
    global pir_events, last_reset, raum_belegt, last_event, pir_active, manuell_override_bis
    now = time.time()
    # Bei automatischem Einschalten wird geprüft, ob es dunkel genug ist.
    # Im Test-Modus ist diese Prüfung immer erfolgreich
    if not ist_dunkel_genug():
        if DEBUG:
            print("{} PIR ignoriert: Es ist zu hell.".format(format_debug_time(local_time())))
        return
    if now < manuell_override_bis:
        remaining = int(manuell_override_bis - now)
        # Wenn Licht manuell eingeschaltet wurde, aktualisiere trotzdem den Timer bei Bewegung
        if ueberkopflicht_an():
            last_event = now
            if DEBUG:
                print("{} Manueller Override aktiv ({} Sek. verbleibend), aber Timer wird bei Bewegung aktualisiert.".format(format_debug_time(local_time()), remaining))
            # PIR Events auch hier leeren
            if len(pir_events) > 0:
                pir_events.clear()
        else:
            if DEBUG:
                print("{} Manueller Override aktiv ({} Sek. verbleibend), PIR-Ereignis wird ignoriert.".format(format_debug_time(local_time()), remaining))
        return
    # Falls das Licht bereits an ist, wird hier lediglich der Inaktivitätstimer aktualisiert.
    if ueberkopflicht_an():
        if DEBUG:
            remaining = int(300 - (now - last_state_update_time)) if now - last_state_update_time < 300 else 0
            print("{} Licht bereits an – aktualisiere Inaktivitäts-Timer (nächste Prüfung in {} Sek.).".format(format_debug_time(local_time()), remaining))
        last_event = now
        pir_active = True
        # PIR Events leeren wenn Licht bereits an ist
        if len(pir_events) > 0:
            if DEBUG:
                print("{} Leere {} angesammelte PIR-Events".format(format_debug_time(local_time()), len(pir_events)))
            pir_events.clear()
        return
    if DEBUG:
        print("{} Bewegung erkannt (PIR) um {}.".format(format_debug_time(local_time()), int(now)))
    pir_events.append(now)
    last_reset = now
    last_event = now  # Jede Bewegung setzt den Timer zurück
    count = len(pir_events)
    if count < EVENT_THRESHOLD:
        color = step_to_rgb(count, EVENT_THRESHOLD)
        if DEBUG:
            print("{} PIR {} von {}: LED-Farbe #{:06X}".format(format_debug_time(local_time()), count, EVENT_THRESHOLD, color))
        display_led(color, 2)
    else:
        if DEBUG:
            print("{} PIR-Schwellenwert erreicht: Starte automatisches Licht-Einschalten.".format(format_debug_time(local_time())))
        reagiere_raum_belegt()
        raum_belegt = True
        last_event = now  # Timer für automatisches Ausschalten starten
        pir_events.clear()
    pir_active = True

def pir_inaktiv(pir):
    global pir_active, last_event
    now = time.time()
    if last_event is None:
        # Kein gültiger Bewegungs-Timer vorhanden → nicht weiter rechnen
        if DEBUG:
            print("{} PIR meldet keine Aktivität. Kein Bewegungstimer aktiv.".format(format_debug_time(local_time())))
    else:
        remaining = INAKT_TIMEOUT - (now - last_event)
        if DEBUG:
            print("{} PIR meldet keine Aktivität.".format(format_debug_time(local_time())))
            print("{} Schalte Licht ab in {:.0f} Sekunden.".format(format_debug_time(local_time()), remaining))
    pir_active = False

# ------------------------------------------------------------------------------
# ZENTRALISIERTE FUNKTION FÜR BUTTON-AKTIONEN
# ------------------------------------------------------------------------------
def central_toggle_shelly_nanoleaf(manuell_override_bis, pir_events, last_event, raum_belegt):
    t = time.time()
    if DEBUG:
        print("{} Button (Langdruck): Toggle Shelly/NL – manueller Override für {} Sek.".format(format_debug_time(local_time()), MANUAL_OVERRIDE_TIME))
    new_state = schalte_shelly_um()
    manuell_override_bis = t + MANUAL_OVERRIDE_TIME
    pir_events = []
    # Beim manuellen Einschalten (new_state==True) den Timer setzen, damit auto-off greift
    last_event = t if new_state else None
    raum_belegt = new_state
    update_light_cache(new_state)
    return manuell_override_bis, pir_events, last_event, raum_belegt

def central_toggle_wled(wled_status, wled_auto_aus_timer, manuell_override_bis, pir_events, last_event, raum_belegt):
    t = time.time()
    if DEBUG:
        print("{} Button (Kurzdruck): Toggle WLED.".format(format_debug_time(local_time())))
    if wled_status is None or not wled_status:
        setze_wled(WLED_JSON_EIN)
        wled_status = True
        wled_auto_aus_timer = t + 60    # WLED 60 Sek. an
    else:
        setze_wled(WLED_JSON_AUS)
        wled_status = False
        wled_auto_aus_timer = None
        manuell_override_bis = t + MANUAL_OVERRIDE_TIME
        pir_events = []
        last_event = None
        raum_belegt = False
    return wled_status, wled_auto_aus_timer, manuell_override_bis, pir_events, last_event, raum_belegt

# ------------------------------------------------------------------------------
# WATCHDOG FUNKTION
# ------------------------------------------------------------------------------
def feed_watchdog():
    global last_watchdog_feed
    last_watchdog_feed = time.time()

def check_watchdog():
    global last_watchdog_feed
    now = time.time()
    if now - last_watchdog_feed > WATCHDOG_TIMEOUT:
        if DEBUG:
            print("{} Watchdog timeout! System wird neu gestartet.".format(format_debug_time(local_time())))
        import machine
        machine.reset()

# ------------------------------------------------------------------------------
# SETUP UND HAUPTSCHLEIFE
# ------------------------------------------------------------------------------
def setup():
    global led_rgb, pir_sensor, last_sync, last_watchdog_feed
    M5.begin()
    sync_zeit(NTP_HOST, versuche=10, intervall=30)
    last_sync = time.time()
    last_watchdog_feed = time.time()
    led_rgb = RGB(io=35, n=1, type="SK6812")
    pir_sensor = PIRUnit((1, 2))
    pir_sensor.set_callback(pir_aktiv, pir_sensor.IRQ_ACTIVE)
    pir_sensor.set_callback(pir_inaktiv, pir_sensor.IRQ_NEGATIVE)
    pir_sensor.enable_irq()
    led_rgb.fill_color(LED_FARBEN["AUS"])
    global led_display_active
    led_display_active = False
    
    # Startup-Indikation: 3x grünes Blinken
    if DEBUG:
        print("{} System gestartet - 3x grünes Blinken".format(format_debug_time(local_time())))
    for _ in range(3):
        led_rgb.fill_color(LED_FARBEN["GRUEN"])
        time.sleep(0.2)
        led_rgb.fill_color(LED_FARBEN["AUS"])
        time.sleep(0.1)

def main_loop():
    global wled_auto_aus_timer, wled_status, raum_belegt, last_event, manuell_override_bis, pir_events
    global btnA_druck_start, btnA_last_release_time, btnA_click_pending, test_mode_active, last_sync
    
    try:
        M5.update()
        now = time.time()
        
        # Watchdog füttern
        feed_watchdog()

        # --------------------------------------------------------------------------
        # AUTO-OFF BEI INAKTIVITÄT – UNABHÄNGIG VON MODUS ODER DUNKELHEIT
        # (Wenn seit der letzten Bewegung mehr als INAKT_TIMEOUT Sekunden verstrichen sind, wird das Licht ausgeschaltet.)
        # --------------------------------------------------------------------------
        if last_event is not None and (now - last_event) >= INAKT_TIMEOUT:
            if DEBUG:
                print("{} Inaktivität erkannt ({} Sek.) – schalte Licht aus.".format(format_debug_time(local_time()), int(now - last_event)))
            reagiere_raum_unbelegt()
            last_event = None
            pir_events.clear()
            raum_belegt = False

        update_led_display()

        # ------------------------------------------------------------------------------
        # NTP-Synchronisierung alle 12 Stunden
        if now - last_sync >= 43200:
            if DEBUG:
                print("{} 12h vorbei: erneute NTP-Synchronisation.".format(format_debug_time(local_time())))
            sync_zeit(NTP_HOST, versuche=10, intervall=30)
            last_sync = time.time()

        # ------------------------------------------------------------------------------
        # WLED Auto-Off prüfen
        if wled_auto_aus_timer and wled_status and now >= wled_auto_aus_timer:
            setze_wled(WLED_JSON_AUS)
            wled_status = False
            wled_auto_aus_timer = None

        # ------------------------------------------------------------------------------
        # Button-Verarbeitung (mit manueller Doppelklick-Erkennung)
        
        # Prüfe ob ein ausstehender Klick zu alt ist
        if btnA_click_pending and (now - btnA_last_release_time) > DOUBLE_CLICK_TIME:
            # Einzelklick ausführen
            btnA_click_pending = False
            if ist_dunkel_genug() or test_mode_active:
                (wled_status, wled_auto_aus_timer, manuell_override_bis,
                 pir_events, last_event, raum_belegt) = central_toggle_wled(
                    wled_status, wled_auto_aus_timer, manuell_override_bis, pir_events, last_event, raum_belegt
                )
            else:
                if DEBUG:
                    print("{} Button ignoriert: Es ist zu hell (Test-Modus aus)".format(format_debug_time(local_time())))
                display_led("ROT", 0.5, force_override=True)
        
        # Button-Status prüfen
        if BtnA.isPressed():
            if btnA_druck_start is None:
                btnA_druck_start = now
        else:
            if btnA_druck_start is not None:
                try:
                    press_duration = now - btnA_druck_start
                    
                    if press_duration < LONG_PRESS_THRESHOLD:
                        # Kurzer Druck - prüfe auf Doppelklick
                        if btnA_click_pending and (now - btnA_last_release_time) < DOUBLE_CLICK_TIME:
                            # Doppelklick erkannt!
                            btnA_click_pending = False
                            test_mode_active = not test_mode_active
                            if test_mode_active:
                                if DEBUG:
                                    print("{} TEST-MODUS AKTIVIERT - Button immer aktiv!".format(format_debug_time(local_time())))
                                # Blaues Blinken zur Bestätigung
                                for _ in range(3):
                                    display_led("BLAU", 0.3, force_override=True)
                                    time.sleep(0.3)
                                    display_led("AUS", 0.2, force_override=True)
                                    time.sleep(0.2)
                            else:
                                if DEBUG:
                                    print("{} Test-Modus deaktiviert - normale Funktion".format(format_debug_time(local_time())))
                                display_led("AUS", 0, force_override=True)
                        else:
                            # Erster Klick - warte auf möglichen zweiten
                            btnA_click_pending = True
                            btnA_last_release_time = now
                    else:
                        # Langdruck - kein Doppelklick möglich
                        btnA_click_pending = False
                        if ist_dunkel_genug() or test_mode_active:
                            (manuell_override_bis, pir_events, last_event, raum_belegt) = central_toggle_shelly_nanoleaf(
                                manuell_override_bis, pir_events, last_event, raum_belegt
                            )
                        else:
                            if DEBUG:
                                print("{} Button ignoriert: Es ist zu hell (Test-Modus aus)".format(format_debug_time(local_time())))
                            display_led("ROT", 0.5, force_override=True)
                except Exception as e:
                    if DEBUG:
                        print("{} Fehler bei Button-Verarbeitung: {}".format(format_debug_time(local_time()), e))
                finally:
                    btnA_druck_start = None  # Immer zurücksetzen!
                    
    except Exception as e:
        if DEBUG:
            print("{} Fehler in main_loop: {}".format(format_debug_time(local_time()), e))
        # Button-Status zurücksetzen bei Fehler
        btnA_druck_start = None
        
    time.sleep(0.1)

if __name__ == "__main__":
    while True:
        try:
            setup()
            while True:
                main_loop()
                check_watchdog()  # Watchdog prüfen
        except KeyboardInterrupt:
            print("{} Benutzer-Interrupt.".format(format_debug_time(local_time())))
            break
        except Exception as e:
            print("{} Fehler: {} – Neustart in 2 Sek.".format(format_debug_time(local_time()), e))
            time.sleep(2)
            print("{} Starte System neu...".format(format_debug_time(local_time())))