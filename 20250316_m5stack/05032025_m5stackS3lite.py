import gc
import os, sys, io
import M5
from M5 import *
import usocket as socket
import ujson
import time  # Für Wartezeit zwischen Wiederholungsversuchen

try:
    from hardware import RGB  # RGB-LED Unterstützung hinzufügen
    rgb_available = True
except ImportError:
    print("RGB-Modul nicht verfügbar.")
    rgb_available = False

# WLED Konfiguration
wled_ip = "10.80.23.22"
wled_url = "http://" + wled_ip + "/json/state"

wled_json = {
    "on": True,
    "bri": 151,
    "transition": 7,
    "mainseg": 0,
    "seg": [
        {
            "id": 0,
            "start": 0,
            "stop": 16,
            "startY": 0,
            "stopY": 8,
            "grp": 1,
            "spc": 0,
            "of": 0,
            "on": True,
            "frz": False,
            "bri": 255,
            "cct": 127,
            "set": 0,
            "n": "Essen kommen JETZT!!!!",
            "col": [[255, 0, 0], [0, 0, 0], [0, 0, 0]],
            "fx": 122,
            "sx": 128,
            "ix": 128,
            "pal": 8,
            "c1": 0,
            "c2": 128,
            "c3": 16,
            "sel": False,
            "rev": False,
            "mi": False,
            "rY": False,
            "mY": False,
            "tp": False,
            "o1": False,
            "o2": False,
            "o3": False,
            "si": 0,
            "m12": 0
        }
    ]
}

wled_json_off = {"on": False}

# Globale Variablen für RGB, Zustand und Timer
rgb = None                  # Steuerung der RGB-LED
wled_status = False         # Standard: WLED aus
led_off_timer = None        # Timer für das automatische Ausschalten der LED

# Neue globale Variablen
wled_auto_off_timer = None      # Timer für das automatische Abschalten von WLED (120 s)
wled_button_triggered = False   # Kennzeichnet, ob WLED via Knopf eingeschaltet wurde

def update_led():
    global rgb, rgb_available, wled_status
    if not (rgb_available and rgb):
        return
    if wled_status:
        rgb.fill_color(0x00ff00)  # grün
        print("WLED ist an. LED auf grün gesetzt.")
    else:
        rgb.fill_color(0xff0000)  # rot
        print("WLED ist aus. LED auf rot gesetzt.")

def get_wled_status():
    global wled_status
    attempts = 0
    success = False
    while attempts < 3 and not success:
        try:
            addr = socket.getaddrinfo(wled_ip, 80)[0][-1]
            s = socket.socket()
            s.connect(addr)
            request = "GET /json/state HTTP/1.1\r\nHost: " + wled_ip + "\r\nConnection: close\r\n\r\n"
            s.send(bytes(request, "utf-8"))
            response = s.recv(2048)
            s.close()
            response_data = response.decode("utf-8").split("\r\n\r\n", 1)
            if len(response_data) > 1:
                data = ujson.loads(response_data[1])
                wled_status = data.get("on", False)
                success = True
            else:
                print("Kein gültiger HTTP-Response, versuche es erneut (Versuch {})...".format(attempts+1))
                attempts += 1
                time.sleep(3)
        except Exception as e:
            print("Fehler beim Abrufen des WLED-Status (Versuch {}):".format(attempts+1), e)
            attempts += 1
            time.sleep(3)
    if not success:
        print("WLED-Status konnte nach 3 Versuchen nicht geholt werden, nehme an: WLED aus")
        wled_status = False

def setup_led():
    global rgb, rgb_available
    try:
        if rgb_available:
            try:
                rgb = RGB(io=35, n=1, type="SK6812")
                if rgb is None:
                    print("Fehler: RGB-Objekt ist None. Prüfe die Bibliothek und das Gerät.")
                    rgb_available = False
                else:
                    print("RGB-LED erfolgreich initialisiert.")
            except Exception as e:
                print("Fehler bei der Initialisierung der RGB-LED:", e)
                rgb_available = False
    except Exception as e:
        print("Fehler bei LED-Initialisierung:", e)

def send_wled_request(json_data):
    global led_off_timer, wled_status
    json_str = ujson.dumps(json_data)
    content_length = len(json_str)
    for attempt in range(1, 4):  # bis zu 3 Versuche
        try:
            print("Sende WLED-API-Call (Versuch {}...)".format(attempt))
            addr = socket.getaddrinfo(wled_ip, 80)[0][-1]
            s = socket.socket()
            s.connect(addr)
            s.send(bytes("POST /json/state HTTP/1.1\r\n", "utf-8"))
            s.send(bytes("Host: " + wled_ip + "\r\n", "utf-8"))
            s.send(bytes("Content-Type: application/json\r\n", "utf-8"))
            s.send(bytes("Content-Length: " + str(content_length) + "\r\n", "utf-8"))
            s.send(bytes("Connection: close\r\n\r\n", "utf-8"))
            s.send(bytes(json_str, "utf-8"))
            response = s.recv(1024)
            print("Antwort von WLED:", response)
            s.close()
            # Status anhand des Requests setzen (ohne erneute Abfrage)
            if json_data.get("on", False):
                wled_status = True
            else:
                wled_status = False
            update_led()
            # Timersteuerung erfolgt ausschließlich in loop()
            return True
        except Exception as e:
            print("Fehler beim Senden des WLED-API-Calls (Versuch {}):".format(attempt), e)
            time.sleep(2)
    return False

def setup():
    global wled_status
    M5.begin()
    setup_led()
    # Status nur einmal abfragen
    get_wled_status()
    update_led()

def loop():
    global led_off_timer, wled_status, wled_auto_off_timer, wled_button_triggered
    M5.update()
    current_time = time.time()
    
    # Prüfe den automatischen WLED-Ausschalt-Timer:
    if wled_auto_off_timer and current_time >= wled_auto_off_timer and wled_button_triggered and wled_status:
        print("Automatisches Abschalten von WLED nach 120 Sekunden")
        send_wled_request(wled_json_off)  # WLED ausschalten
        wled_auto_off_timer = None
        wled_button_triggered = False
        # LED sofort auf rot schalten und Timer auf 60 s (rote Phase) setzen:
        if rgb_available and rgb:
            rgb.fill_color(0xff0000)
        led_off_timer = current_time + 60

    # Prüfe den LED-Timer: LED ausschalten, wenn der Timer abgelaufen ist
    if led_off_timer and current_time >= led_off_timer:
        if rgb_available and rgb:
            rgb.fill_color(0x000000)  # LED aus
        led_off_timer = None

    # Button-Ereignis: WLED ein-/ausschalten
    if BtnA.wasClicked():
        if not wled_status:
            print("WLED wird eingeschaltet...")
            send_wled_request(wled_json)
            wled_button_triggered = True
            wled_auto_off_timer = current_time + 120  # WLED-Auto-Off in 120 s
            # LED leuchtet grün für 120 s (WLED an) und danach rot für 60 s (insgesamt 180 s)
            if rgb_available and rgb:
                rgb.fill_color(0x00ff00)
            led_off_timer = current_time + 180
        else:
            print("WLED wird ausgeschaltet...")
            send_wled_request(wled_json_off)
            wled_button_triggered = False
            wled_auto_off_timer = None
            # Bei manuellem Ausschalten leuchtet die LED 60 s rot
            if rgb_available and rgb:
                rgb.fill_color(0xff0000)
            led_off_timer = current_time + 60

if __name__ == '__main__':
    try:
        setup()
        while True:
            loop()
    except (Exception, KeyboardInterrupt) as e:
        try:
            from utility import print_error_msg
            print_error_msg(e)
        except ImportError:
            print("Bitte auf die neueste Firmware aktualisieren.")
