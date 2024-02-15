
// Ein Objekt mit den Daten, die gesendet werden sollen
const data = {"on":true,"bri":10,"transition":7,"mainseg":0,"seg":[{"id":0,"start":0,"stop":16,"startY":0,"stopY":8,"grp":1,"spc":0,"of":0,"on":true,"frz":false,"bri":255,"cct":127,"set":0,"n":"Gute Nacht","col":[[255,0,0],[0,0,0],[0,0,0]],"fx":183,"sx":128,"ix":128,"pal":11,"c1":128,"c2":128,"c3":16,"sel":true,"rev":false,"mi":false,"rY":false,"mY":false,"tp":false,"o1":false,"o2":false,"o3":false,"si":0,"m12":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0},{"stop":0}]};

// Ein Objekt mit den Optionen für die fetch-Anfrage
const options = {
  method: "POST", // Die Methode zum Senden der Daten
  headers: {
    "Content-Type": "application/json" // Der Content-Type der Daten
  },
  body: JSON.stringify(data) // Der JSON-String der Daten
};
// Die URL der API
const url2 = "http://192.168.179.29/json/state";
// Die fetch-Anfrage mit den Optionen ausführen
function fetchData2() {
    // Ein fetch-Aufruf, der die Antwort in ein Objekt umwandelt und in console.log ausgibt
    fetch(url2, options)
      .then(response => response.json()) // Die Antwort in ein Objekt umwandeln
      .then(data => console.log(data)) // Das Objekt in der Konsole ausgeben
      .catch(error => console.error(error)); // Den Fehler abfangen und ausgeben
    }
// Die Funktion als Callback an das Ereignis window.onload übergeben
window.onload = fetchData2;
    

// Eine Funktion, die den fetch-Aufruf ausführt
function fetchData() {
  // Ein fetch-Aufruf, der die Antwort in ein Objekt umwandelt und in console.log ausgibt
  fetch('http://192.168.179.29/json/effects')
    .then(response => response.json()) // Die Antwort in ein Objekt umwandeln
    .then(data => console.log(data)) // Das Objekt in console.log ausgeben
    .catch(error => console.error(error)); // Fehlerbehandlung
}
// Die Funktion als Callback an das Ereignis window.onload übergeben
// window.onload = fetchData;
setTimeout(fetchData, 2000);


