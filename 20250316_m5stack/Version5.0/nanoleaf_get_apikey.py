import requests

# IP-Adresse deines Nanoleaf-Geräts
#### In der APP auf API KEY bekommenschalten!
nanoleaf_ip = '10.80.23.56'

# URL für die API-Schlüsselanforderung
url = f'http://{nanoleaf_ip}:16021/api/v1/new'

try:
    # Senden der GET-Anfrage
    response = requests.get(url)
    response.raise_for_status()  # Überprüfen auf HTTP-Fehler

    # API-Schlüssel aus der Antwort extrahieren
    api_key = response.json().get('auth_token')
    if api_key:
        print(f'Dein API-Schlüssel lautet: {api_key}')
    else:
        print('Konnte keinen API-Schlüssel erhalten. Stelle sicher, dass dein Nanoleaf-Gerät im Kopplungsmodus ist.')

except requests.exceptions.RequestException as e:
    print(f'Fehler bei der Anfrage: {e}')
