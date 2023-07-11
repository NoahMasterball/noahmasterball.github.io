//
// Dieses Sktipt is nur zur Verwendung für klicks die ohnehin selbst manuell abgesetzt würden gedacht!
// Bei längerem laufenlassen um seine Hand zu schonen - müssen evlt. die Energieeinstellung des
//
// PC's so eingestellt werden dass der PC nicht in Stromsparmodus geht (suche nach Energiesparplan / Energie) 
//
// Rufe die Seite zum Voten auf: https://www.antenne.de/programm/aktionen/pausenhofkonzerte/schulen/13379-korbinian-aigner-gymnasium-erding
// OHNE ABSTIMMEN:
// Klicke auf die Webseite mit der rechten Maustaste -> Klicke auf "Untersuchen"    (Oder drücke die Tasten Strg + Shift + I gleichzeitig)
// Klicke dann auf der rechten Seite oben auf "Konsole" falls nicht sichbar -> Menue erweitern mit >>
// Kopiere und füge dass Script in die Konsole des Browsers ein (unten in der letzten Zeile bei >) entweder mit Strg + V oder der rechten Maustaste "Einfügen"
// Drücke einmal Return/Enter
// Lass die Seite so stehen (mit Konsole) und tue nichts mehr - ab jetzt funtkioniert alles automatisch
// Nach ein paar Stunden das browserfenster schliessen und neu starten!
//
i=0
function start () {

        var output ="";
        var abstimmung = "";

        var elementExists0 = document.getElementById("voteIntendButton");
        if (elementExists0 !== null) {
            if (elementExists0.classList.contains("disabled")) {
                output = output + "\n   Nein: VoteIntend Abstimmen Button gefunden aber abgeschalten"
            } else { 
                output = output + "\nJa: VoteIntend Abstimmen Button gefunden und gedrückt!"
                elementExists0.click();
            }
        } else {
            output = output + "\n   Nein: VoteIntend Abstimmen Button nicht gefunden"
        }
        

        var elementExists1 = document.querySelectorAll('div.frc-content button.frc-button');
        if (elementExists1.length > 0) {
            var firstButtonElement = elementExists1[0];
            if (firstButtonElement.classList.contains("disabled")) {
                output = output + "\n   Nein: Anti-Roboter-Button gefunden, aber deaktiviert"
            } else { 
                output = output + "\nJa: Anti-Roboter-Button gefunden und aktiviert!"
                firstButtonElement.click();
            }
        } else {
            output = output + "\n   Nein: Anti-Roboter-Button nicht gefunden"
        }
        
        
        var elementExists2 = document.getElementById("votingButton")
        if (elementExists2 !== null) {
            if (elementExists2.classList.contains("disabled")) {
                output = output + "\n   Nein: Abstimmungs-Button gefunden aber abgeschalten"
            } else { 
                output = output + "\nJa: Abstimmungs-Button gefunden und gedrückt!"
                abstimmung = "ja";
                i++
                elementExists2.click();
            }
        } else {
            output = output + "\n   Nein: Abstimmungs-Button nicht gefunden"
        }

                
        var elementExists3 = document.getElementById("voteAgainButton")
        if (elementExists3 !== null) {
            if (elementExists3.classList.contains("disabled")) {
                output = output + "\n   Nein: Button voteAgainButton gefunden aber abgeschalten"
            } else {
                output = output + "\nJa: Button voteAgainButton gefunden und gedrückt!"
                elementExists3.click();
            }
        } else {
            output = output + "\n   Nein: Button voteAgainButton nicht gefunden"
        }
        
                
        var elementExists4 = document.querySelector('label.c-embed__optinbutton.c-button.has-clickhandler[style="--button-width:auto"][data-a11y-dialog-hide=""]');
        if (elementExists4 !== null) {
            if (elementExists4.classList.contains("disabled")) {
                output = output + "\n   Nein: Button Akzeptieren & Sicherheitspruefung gefunden aber abgeschalten"
            } else {
                output = output + "\nJa: Button Akzeptieren & Sicherheitspruefung gefunden und gedrückt!"
                elementExists4.click();
            }
        } else {
            output = output + "\n   Nein: Button Akzeptieren & Sicherheitspruefung nicht gefunden"
        }


        if (typeof $0 !== 'undefined') {
            var elementExists5 = $0.querySelector('button[data-testid="uc-deny-all-button"]');
            if (elementExists5 !== null) {
                if (elementExists5.classList.contains("disabled")) {
                    output = output + "\n   Nein: Button Cookies Ablehnen gefunden aber abgeschalten"
                } else {
                    output = output + "\nJa: Button Cookies Ablehnen gefunden und gedrückt!"
                    elementExists5.click();
                }
            } else {
                output = output + "\n   Nein: Button Cookies Ablehnen nicht gefunden"
            }
          } else {
            output = output + "\n   Nein: Button Cookies Ablehnen nicht gefunden"
          }
            // Den nächsten Aufruf von start() zufällig zwischen 1.5 und 5.2 sekunden
            var randomDelay = Math.random() * (3.8 - 1.5) + 2;
            // Den nächsten Aufruf von start() Zähler addieren
            if (abstimmung == "ja") {
                randomDelay += 60;
              abstimmung = "nein";
            }
    
            var roundedDelay = randomDelay.toFixed(3);
            output = output + "\nAnzahl stattgefundener Abstimmungen: " + i;
            output = output + "\nDer nächste Startzeitpunkt in Sekunden ist: " + roundedDelay;
            setTimeout(start, randomDelay * 1000);
        
            
        console.log("\n\n\n\n\n" + output + "\n\n\n\n\n")   
}
start();
//