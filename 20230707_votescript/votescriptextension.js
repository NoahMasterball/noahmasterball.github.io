// Dieses Sktipt is nur zur Verwendung für klicks die ohnehin selbst manuell abgesetzt würden gedacht!
// Bei längerem laufenlassen um seine Hand zu schonen - müssen evlt. die Energieeinstellung des
// PC's so eingestellt werden dass der PC nicht in Stromsparmodus geht (suche nach Energiesparplan / Energie) 
// Rufe die Seite zum Voten auf: https://www.antenne.de/programm/aktionen/pausenhofkonzerte/schulen/13379-korbinian-aigner-gymnasium-erding
// Stimme einmal normal ab (mit der maus), solange bist du am erneut abstimmen fenster bist
// Dann Klicke auf die Webseite mit der rechten Maustaste -> Klicke auf "Untersuchen"    (Oder drücke die Tasten Strg + Shift + I gleichzeitig)
// Klicke dann auf der rechten Seite oben auf "Konsole"
// Kopiere und füge dass Script hier in die Konsole (unten bei letzte Zeile bei >) ein mit Strg + V oder der rechten Maustaste "Einfügen"
// Drücke einmal Return/Enter
// Lass die Seite so stehen (mit Konsole) und tue nichts mehr - sofort und danach alle 110 Sekunden stimmt dass Program automatisch ab.
function voteAgain() {
  console.clear(); console.log(""); console.log("1a. Versuche den Erneut Abstimmen Button zu drücken!"); console.log("");
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
  setTimeout(function() { zeitinfo(70); }, 40000); setTimeout(function() { zeitinfo(50); }, 60000);
  setTimeout(function() { zeitinfo(30); }, 80000); setTimeout(function() { zeitinfo(10); }, 100000);
  setTimeout(function() { zeitinfo(9); }, 101000); setTimeout(function() { zeitinfo(6); }, 104000);
  setTimeout(function() { zeitinfo(3); }, 107000); setTimeout(function() { zeitinfo(2); }, 108000);
  setTimeout(function() { zeitinfo(1); }, 109000); 
}
function startabstimmen() {
startzeitinfo();
setTimeout(voteAgain, 2000);
setTimeout(voteCaptcha, 5000);
setTimeout(vote, 39000);
setTimeout(counter, 100000);
}
setInterval(startabstimmen, 110000);
startzeitinfo();
voteAgain(); 
console.log(""); console.log("Automatisches Abstimmungsprogramm wurde gestartet...nächster Start in 110 Sekunden...nur die Wartzeit der ersten automatischen Abstimmung dauert etwas lang...danach geht es schneller..."); console.log("");
//












































