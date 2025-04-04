import requests

# IP-Adresse deines Nanoleaf-Geräts und dein API-Schlüssel
nanoleaf_ip = '10.80.23.56'
api_key = 'kK2AbyyhXXNncr0Pw77RTy61pk3OrZnC'
base_url = f'http://{nanoleaf_ip}:16021/api/v1/{api_key}'

def get_power_status():
    """Gibt den aktuellen Ein-/Aus-Status der Nanoleaf-Panels zurück."""
    status_url = f'{base_url}/state/on'
    try:
        response = requests.get(status_url)
        response.raise_for_status()
        current_state = response.json().get('value', False)
        return current_state
    except requests.exceptions.RequestException as e:
        print(f'Fehler bei der Anfrage: {e}')
        return None

def set_power_status(state):
    """Setzt den Ein-/Aus-Status der Nanoleaf-Panels."""
    power_url = f'{base_url}/state'
    payload = {'on': {'value': state}}
    try:
        response = requests.put(power_url, json=payload)
        response.raise_for_status()
        print(f'Nanoleaf-Panels {"eingeschaltet" if state else "ausgeschaltet"}.')
    except requests.exceptions.RequestException as e:
        print(f'Fehler bei der Anfrage: {e}')

def toggle_power():
    """Schaltet die Nanoleaf-Panels ein oder aus, basierend auf ihrem aktuellen Status."""
    current_state = get_power_status()
    if current_state is not None:
        set_power_status(not current_state)

# Beispielaufruf: Schaltet die Nanoleaf-Panels ein oder aus
if __name__ == '__main__':
    toggle_power()

