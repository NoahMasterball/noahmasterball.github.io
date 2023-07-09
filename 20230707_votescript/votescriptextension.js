//
// Dieses Sktipt is nur zur Verwendung für klicks die ohnehin selbst manuell abgesetzt würden gedacht!
// Bei längerem laufenlassen um seine Hand zu schonen - müssen evlt. die Energieeinstellung des
//
// PC's so eingestellt werden dass der PC nicht in Stromsparmodus geht (suche nach Energiesparplan / Energie) 
//
// Rufe die Seite zum Voten auf: https://www.antenne.de/programm/aktionen/pausenhofkonzerte/schulen/13379-korbinian-aigner-gymnasium-erding
// OHNE ABSTIMMEN:
// Klicke auf die Webseite mit der rechten Maustaste -> Klicke auf "Untersuchen"    (Oder drücke die Tasten Strg + Shift + I gleichzeitig)
// Klicke dann auf der rechten Seite oben auf "Konsole"
// Kopiere und füge dass Script hier in die Konsole (unten bei letzte Zeile bei >) ein mit Strg + V oder der rechten Maustaste "Einfügen"
// Drücke einmal Return/Enter
// Lass die Seite so stehen (mit Konsole) und tue nichts mehr - sofort und danach alle 120 Sekunden stimmt dass Program automatisch ab.
// Nach ein paar stunden das browserfentster schliessen und neu starten!
//
function voteAgain() {
  console.log(""); console.log("1a. Versuche den Erneut Abstimmen Button zu drücken!"); console.log("");
  var elementExists = document.getElementById("voteIntendButton");
  if (elementExists !== null) {
    /* Do this if variable is not null */
    document.getElementById("voteIntendButton").click();
  } else {
    document.getElementById("voteAgainButton").click();
  }  
  console.log(""); console.log("1b. Geschafft, erneut Abstimmen Button wurde erfolgreich gedrückt!"); console.log("");
}
function voteCaptcha() {
  document.getElementsByClassName("frc-button")[0].click(); 
  console.clear(); console.log(""); console.log("2a. Versuche CaptchaButton zu drücken!");
  console.log("2b. CaptchaButton wurde erfolgreich gedrückt, Captchaüberprüfung abwarten...danach nochmal kurz warten"); console.log("");
}
function vote() {
  console.clear(); console.log(""); console.log("3a. Versuche den Abstimmungsbutton zu drücken!"); console.log("");
  document.getElementById("votingButton").click();
  console.log(""); console.log("3b. Geschafft, Abstimmungsbutton wurde erfolgreich gedrückt!!"); console.log("");
}
function zeitinfo(zeit) {
console.log(""); console.log("Noch " + zeit + " Sekunden bis zur nächsten automatischen Abstimmung."); console.log("");}
let i = 1;
function counter() {
console.clear(); console.log(""); console.log("Bisher wurde schon " + i + " mal automatisch abgestimmt!"); console.log("");
i++;}
function startzeitinfo() {
  setTimeout(function() { zeitinfo(80); }, 50000); setTimeout(function() { zeitinfo(60); }, 60000);
  setTimeout(function() { zeitinfo(40); }, 80000); setTimeout(function() { zeitinfo(20); }, 100000);
  setTimeout(function() { zeitinfo(9); }, 111000); setTimeout(function() { zeitinfo(6); }, 114000);
  setTimeout(function() { zeitinfo(3); }, 117000); setTimeout(function() { zeitinfo(2); }, 118000);
  setTimeout(function() { zeitinfo(1); }, 119000); 
}
function startabstimmen() {
startzeitinfo();
setTimeout(voteAgain, 2000);
setTimeout(voteCaptcha, 5000);
setTimeout(vote, 49000);
setTimeout(counter, 100000);
}
setInterval(startabstimmen, 120000);
startzeitinfo();
startabstimmen(); 
console.log(""); console.log("Automatisches Abstimmungsprogramm wurde gestartet...erster vote started gleich"); console.log("");
 //
















