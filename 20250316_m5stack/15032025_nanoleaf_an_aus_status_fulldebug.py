import socket
import time
import ujson  # MicroPython JSON-Modul
from machine import Pin

# 🏠 Nanoleaf API Einstellungen
NANOLEAF_IP = "10.80.23.56"
API_KEY = "kK2AbyyhXXNncr0Pw77RTy61pk3OrZnC"
BASE_URL = "/api/v1/{}/state".format(API_KEY)
PORT = 16021

# 🎛 Button-Einstellungen
BUTTON_PIN = 41  # M5Stack Atom S3 Lite
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

def recv_all(sock, content_length):
    """Empfängt Daten, bis die erwartete Länge erreicht ist."""
    data = b""
    while len(data) < content_length:
        chunk = sock.recv(1024)
        if not chunk:
            break
        data += chunk
    return data.decode()

def extract_json(response):
    """Extrahiert den ersten validen JSON-Block aus einer HTTP-Antwort."""
    json_start = response.find("{")
    json_end = response.rfind("}") + 1  # Letzte schließende Klammer finden
    if json_start != -1 and json_end > json_start:
        return response[json_start:json_end]
    return ""

def get_power_state():
    """Fragt den aktuellen Power-Status der Nanoleafs ab."""
    s = socket.socket()
    try:
        s.connect((NANOLEAF_IP, PORT))
        request = "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n".format(BASE_URL, NANOLEAF_IP)
        s.send(request.encode())

        # Header empfangen
        response = s.recv(1024).decode()

        # `Content-Length` aus dem Header extrahieren
        content_length = 0
        for line in response.split("\r\n"):
            if line.lower().startswith("content-length:"):
                content_length = int(line.split(":")[1].strip())

        if content_length > 0:
            json_data = recv_all(s, content_length)  # Restliche Daten empfangen
        else:
            json_data = ""

        json_data = extract_json(json_data)  # Nur den validen JSON extrahieren

        if json_data:
            parsed = ujson.loads(json_data)
            power = parsed.get("on", {}).get("value", False)
            print(f"ℹ️ Status abgefragt: {'AN' if power else 'AUS'}")
            return power

    except Exception:
        pass  # Fehler ignorieren, Standardwert zurückgeben

    print("⚠️ Konnte Status nicht abrufen, gehe von AUS aus")
    return False  

def send_put_request(state):
    """Schaltet die Nanoleafs ein oder aus."""
    s = socket.socket()
    try:
        s.connect((NANOLEAF_IP, PORT))
        payload = '{"on":{"value":' + ('true' if state else 'false') + '}}'
        request = (
            "PUT {} HTTP/1.1\r\n"
            "Host: {}\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: {}\r\n"
            "Connection: close\r\n\r\n"
            "{}"
        ).format(BASE_URL, NANOLEAF_IP, len(payload), payload)

        s.send(request.encode())
        response = s.recv(1024).decode()

        if "204 No Content" in response:
            print(f"✅ Nanoleaf {'eingeschaltet' if state else 'ausgeschaltet'}")

    finally:
        s.close()

# 🏁 Power-Status initial abrufen
power_state = get_power_state()

print("🔴 Bereit! Drücke den Knopf zum Umschalten!")

letzter_status = button.value()

while True:
    aktueller_status = button.value()

    if letzter_status == 1 and aktueller_status == 0:  
        power_state = not power_state  
        send_put_request(power_state)
        _ = get_power_state()  # Status nach Umschalten erneut abrufen, aber nicht ausgeben
        time.sleep(0.5)  

    letzter_status = aktueller_status  
    time.sleep(0.05)
