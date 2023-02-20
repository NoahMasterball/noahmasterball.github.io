vocabluaryfile = "wolke12.txt";
myLanguage = "deutsch";
intervalauswahl = 1000;
zaehler = 0;
pause = "nein";
currentWord = 0;
style = "flow";

// prettier-ignore
function hoveronbus() {
  document.getElementById("ebenebus").className = "ebenebus animation pause";
   // console.log(event.target);
   pause = "ja";
}
function hoveroutbus() {
  document.getElementById("ebenebus").className = "ebenebus animation";
  // console.log(event.target);
  pause = "nein";
  fragewort();
}

// prettier-ignore
function flowortype() {
  document.getElementById("flow").className = "aktiviert mw3flow mwtext text";
  document.getElementById("type").className = "deaktiviert mw3type mwtext text";
  // console.log(event.target);
  style = "flow";
  pause = "nein";
  document.getElementById("seehidetext").innerHTML =
            "See/hide solution here";
}
// prettier-ignore
function flowortype2() {
  document.getElementById("flow").className = "deaktiviert mw3flow mwtext text";
  document.getElementById("type").className = "aktiviert mw3type mwtext text";
  style = "type";
}

// prettier-ignore
function changewolke11() {
  document.getElementById("wolke11").className = "aktiviert mw11text mwtext text";
  document.getElementById("wolke12").className = "deaktiviert mw12text mwtext text";
  document.getElementById("wolke13").className = "deaktiviert mw13text mwtext text";
  document.getElementById("wolke14").className = "deaktiviert mw14text mwtext text";
  console.log();
}
// prettier-ignore
function changewolke12() {
  document.getElementById("wolke11").className = "deaktiviert mw11text mwtext text";
  document.getElementById("wolke12").className = "aktiviert mw12text mwtext text";
  document.getElementById("wolke13").className = "deaktiviert mw13text mwtext text";
  document.getElementById("wolke14").className = "deaktiviert mw14text mwtext text";
  vocabluaryfile = "wolke12.txt";
  currentWord = 0;
  fragewort();
}
// prettier-ignore
function changewolke13() {
  document.getElementById("wolke11").className = "deaktiviert mw11text mwtext text";
  document.getElementById("wolke12").className = "deaktiviert mw12text mwtext text";
  document.getElementById("wolke13").className = "aktiviert mw13text mwtext text";
  document.getElementById("wolke14").className = "deaktiviert mw14text mwtext text";
  vocabluaryfile = "wolke13.txt";
  currentWord = 0;
  fragewort();
}
// prettier-ignore
function changewolke14() {
  document.getElementById("wolke11").className = "deaktiviert mw11text mwtext text";
  document.getElementById("wolke12").className = "deaktiviert mw12text mwtext text";
  document.getElementById("wolke13").className = "deaktiviert mw13text mwtext text";
  document.getElementById("wolke14").className = "aktiviert mw14text mwtext text";
  vocabluaryfile = "wolke14.txt";
  currentWord = 0;
  fragewort();
}

// prettier-ignore
function onmouseover3() {
  document.getElementById("speed3").className = "aktiviert2 mws3text mwtext text";
  document.getElementById("speed5").className = "deaktiviert mws5text mwtext text";
  document.getElementById("speed10").className = "deaktiviert mws10text mwtext text";
  document.getElementById("speed15").className = "deaktiviert mws15text mwtext text";
  intervalauswahl = 3000;
  fragewort();
}
// prettier-ignore
function onmouseover5() {
  document.getElementById("speed3").className = "deaktiviert mws3text mwtext text";
  document.getElementById("speed5").className = "aktiviert2 mws5text mwtext text";
  document.getElementById("speed10").className = "deaktiviert mws10text mwtext text";
  document.getElementById("speed15").className = "deaktiviert mws15text mwtext text";
  intervalauswahl = 5000;
  fragewort();
}
// prettier-ignore
function onmouseover10() {
  document.getElementById("speed3").className = "deaktiviert mws3text mwtext text";
  document.getElementById("speed5").className = "deaktiviert mws5text mwtext text";
  document.getElementById("speed10").className = "aktiviert2 mws10text mwtext text";
  document.getElementById("speed15").className = "deaktiviert mws15text mwtext text";
  intervalauswahl = 10000;
  fragewort();
}
// prettier-ignore
function onmouseover15() {
  document.getElementById("speed3").className = "deaktiviert mws3text mwtext text";
  document.getElementById("speed5").className = "deaktiviert mws5text mwtext text";
  document.getElementById("speed10").className = "deaktiviert mws10text mwtext text";
  document.getElementById("speed15").className = "aktiviert2 mws15text mwtext text";
  intervalauswahl = 15000;
  fragewort();
}

function onmouseoverdeutsch() {
  myLanguage = "deutsch";
  document.getElementById("deutsch").src = "flagge_de2.gif";
  document.getElementById("english").src = "flagge_eng.gif";
  // document.getElementById("seitenausgabe").innerHTML = myLanguage;
  fragewort();
}
function onmouseoverenglish() {
  myLanguage = "english";
  document.getElementById("deutsch").src = "flagge_de.gif";
  document.getElementById("english").src = "flagge_eng2.gif";
  // document.getElementById("seitenausgabe").innerHTML = myLanguage;
  fragewort();
}

function addvisibility() {
  if (zaehler % 2 == 0) {
    document.getElementById("wortausgabeeng").className =
      "wortausgabeengsichtbar text";
    zaehler++;
  } else {
    document.getElementById("wortausgabeeng").className =
      "wortausgabeengsichtbar wortausgabeengunsichtbar text";
    zaehler++;
  }
}

let interval;
function haltFunction() {
  clearInterval(interval);
  interval = null;
}

function fragewort() {
  haltFunction();
  fetch(vocabluaryfile)
    .then((response) => response.text())
    .then((text) => {
      const inhalt = text.split("\n");

      const vocabularyarray = [];
      for (const zeilen of inhalt) {
        if (zeilen.length === 0) {
          continue;
        }
        const [english, german] = zeilen.split(":");
        vocabularyarray.push({ english, german });
      }

      interval = setInterval(showWord, intervalauswahl);
      const word = vocabularyarray[currentWord];

      function showWord() {
        if (style == "type") {
          document.getElementById("ebenebus").className =
            "ebenebus animation pause";
          document.getElementById("seehidetext").innerHTML =
            "Please type the correct translation <br> (a word) into the bus:";
        } else {
          if (pause == "ja") {
            clearInterval(interval);
            return;
          } else {
            if (currentWord >= vocabularyarray.length) {
              console.log("You have finished all the words!");
              document.getElementById("wortausgabede").innerHTML =
                "Alles Fertig!";
              document.getElementById("wortausgabeeng").innerHTML =
                "All done - finished";
              clearInterval(interval);
              return;
            }
            const word = vocabularyarray[currentWord];
            document.getElementById("ebenebus").className =
              "ebenebus animation";
            if (myLanguage == "deutsch") {
              document.getElementById("wortausgabede").innerHTML = word.german;
              document.getElementById("wortausgabeeng").innerHTML =
                word.english;
              currentWord++;
            } else {
              document.getElementById("wortausgabede").innerHTML = word.english;
              document.getElementById("wortausgabeeng").innerHTML = word.german;
              currentWord++;
            }
          }
        }
      }
    })
    .catch((error) => {
      console.error(error);
    });
}
