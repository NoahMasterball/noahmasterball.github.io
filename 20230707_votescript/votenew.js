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

            // Den nächsten Aufruf von start() den evtl. vorhandenen Zähler addieren
            if (abstimmung == "ja") {
                randomDelay += 60;
              abstimmung = "nein";
            }
    
            var roundedDelay = randomDelay.toFixed(3);
            output = output + "\nDer nächste Startzeitpunkt ist in " + roundedDelay + " Sekunden.";
            setTimeout(start, randomDelay * 1000);
        
        console.log("\n\n\n\n\n" + output + "\n\n\n\n\n")   
}
start();


 /*
        <button type="submit" id="voteIntendButton" class="c-button c-button--large c-button--centered u-extra-small-margin--top ">Jetzt abstimmen</button>
        <button type="submit" id="voteIntendButton" class="c-button c-button--large c-button--centered u-extra-small-margin--top ">Jetzt abstimmen</button>

        Anti Robotor seite den Akzeptieren & Zustimmen button gefunden:
        Via: document.querySelector('label.c-embed__optinbutton.c-button.has-clickhandler[style="--button-width:auto"][data-a11y-dialog-hide=""]');

        <label class="c-embed__optinbutton c-button has-clickhandler" style="--button-width:auto" data-a11y-dialog-hide="">
            <div class="uc-embed" uc-layout="serviceDetails" uc-consent-name="Friendly Captcha" uc-data="optInCheckboxWithLabel"><div class="uc uc-checkbox uc-optInCheckboxWithLabel" style="display: inline-block"><input type="checkbox" id="Friendly Captcha" title="Friendly Captcha"><label class="uc uc-title uc-optInCheckboxWithLabel" style="display: inline-block" for="Friendly Captcha"><h3>Friendly Captcha</h3></label></div><div class="uc uc-furtherInformation uc-subservices service-specific" style="padding: 10px 20px 0"></div></div>
            Akzeptieren &amp; Akzeptieren &amp; Sicherheitsprüfung aktivieren
        </label>


        */