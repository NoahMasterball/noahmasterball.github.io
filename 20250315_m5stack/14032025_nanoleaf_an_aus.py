import socket
import time
from machine import Pin

# 🏠 Nanoleaf API Einstellungen
NANOLEAF_IP = "10.80.23.56"
API_KEY = ""
BASE_URL = "/api/v1/{}/state".format(API_KEY)
PORT = 16021

# 🎛 Button-Einstellungen
BUTTON_PIN = 41  # M5Stack Atom S3 Lite
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

power_state = False  

def send_put_request(state):
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
        response = s.recv(1024).decode()  # Ohne benannte Argumente

        if "204 No Content" in response:
            print(f"✅ Nanoleaf ist jetzt {'AN' if state else 'AUS'}")

    finally:
        s.close()

print("🔴 Bereit! Drücke den Knopf zum Umschalten!")

letzter_status = button.value()

while True:
    aktueller_status = button.value()

    if letzter_status == 1 and aktueller_status == 0:  
        power_state = not power_state  
        send_put_request(power_state)
        time.sleep(0.5)  

    letzter_status = aktueller_status  
    time.sleep(0.05)