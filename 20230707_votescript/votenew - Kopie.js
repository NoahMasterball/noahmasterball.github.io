
        var output ="";
        
        var elementExists0 = document.getElementById("voteIntendButton");
        if (elementExists0 !== null) {
            if (elementExists0.classList.contains("disabled")) {
                output = output + "\nNein: Erneut Abstimmen Button gefunden aber abgeschalten"
            } else { 
                output = output + "\nJA: Erneut Abstimmen Button gefunden und gedrückt!"
                /*elementExists0.click();*/
            }
        } else {
            output = output + "\nNein: Erneut Abstimmen Button nicht gefunden"
        }
        

        var elementExists1 = document.querySelectorAll('div.frc-content button.frc-button'[0]);
        if (elementExists1 !== null) {
            if (elementExists1.classList.contains("disabled")) {
                output = output + "\nNein: Anti Robotor Button gefunden aber abgeschalten"
            } else { 
                output = output + "\nJA: Anti Robotor Button gefunden und gedrückt!"
                /*elementExists1[0].click();*/
            }
        } else {
            output = output + "\nNein: Anti Robotor Button nicht gefunden"
        }
        
        
        var elementExists2 = document.getElementById("votingButton")
        if (elementExists2 !== null) {
            if (elementExists2.classList.contains("disabled")) {
                output = output + "\nNein: Abstimmungs-Button gefunden aber abgeschalten"
            } else { 
                output = output + "\nJA: Abstimmungs-Button gefunden und gedrückt!"
                /*elementExists2.click();*/
            }
        } else {
            output = output + "\nNein: Abstimmungs-Button nicht gefunden"
        }

        
        
        var elementExists3 = document.getElementById("voteAgainButton")
        if (elementExists3 !== null) {
            if (elementExists3.classList.contains("disabled")) {
                output = output + "\nNein: Button voteAgainButton gefunden aber abgeschalten"
            } else {
                output = output + "\nJA: Button voteAgainButton gefunden und gedrückt!"
                /*elementExists3.click();*/
            }
        } else {
            output = output + "\nNein: Button voteAgainButton nicht gefunden"
        }
        
        
        
        var elementExists4 = document.querySelector('label.c-embed__optinbutton.c-button.has-clickhandler[style="--button-width:auto"][data-a11y-dialog-hide=""]');
        if (elementExists4 !== null) {
            if (elementExists4.classList.contains("disabled")) {
                output = output + "\nNein: Button Akzeptieren & Sicherheitspruefung gefunden aber abgeschalten"
            } else {
                output = output + "\nJA: Button Akzeptieren & Sicherheitspruefung gefunden und gedrückt!"
                /* elementExists4.click(); */
            }
        } else {
            output = output + "\nNein: Button Akzeptieren & Sicherheitspruefung nicht gefunden"
        }


        var elementExists5 = $0.querySelector('button[data-testid="uc-deny-all-button"]');
        if (elementExists5 !== null) {
            if (elementExists5.classList.contains("disabled")) {
                output = output + "\nNein: Button Cookies Ablehnen gefunden aber abgeschalten"
            } else {
                output = output + "\nJA: Button Cookies Ablehnen gefunden und gedrückt!"
                /*$0.querySelector('button[data-testid="uc-deny-all-button"]').click();*/
            }
        } else {
            output = output + "\nNein: Button Cookies Ablehnen nicht gefunden"
        }


        console.log(output + "\n\n\n\n\n")

        



        /* 
        <button type="submit" id="voteIntendButton" class="c-button c-button--large c-button--centered u-extra-small-margin--top ">Jetzt abstimmen</button>
        <button type="submit" id="voteIntendButton" class="c-button c-button--large c-button--centered u-extra-small-margin--top ">Jetzt abstimmen</button>


        */