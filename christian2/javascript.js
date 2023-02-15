vocabluaryfile = "wolke1.txt";
myLanguage = "deutsch";
intervalauswahl = 5000;
zaehler = 0;

function changewolke1() {
  document.getElementById("wolke1").className = "aktiviert mw1text mwtext text";
  document.getElementById("wolke2").className =
    "deaktiviert mw2text mwtext text";
  document.getElementById("wolke3").className =
    "deaktiviert mw3text mwtext text";
  vocabluaryfile = "wolke1.txt";
  fragewort();
}

function changewolke2() {
  document.getElementById("wolke1").className =
    "deaktiviert mw1text mwtext text";
  document.getElementById("wolke2").className = "aktiviert mw2text mwtext text";
  document.getElementById("wolke3").className =
    "deaktiviert mw3text mwtext text";
  vocabluaryfile = "wolke2.txt";
  fragewort();
}

function changewolke3() {
  document.getElementById("wolke1").className =
    "deaktiviert mw1text mwtext text";
  document.getElementById("wolke2").className =
    "deaktiviert mw2text mwtext text";
  document.getElementById("wolke3").className = "aktiviert mw3text mwtext text";
  vocabluaryfile = "wolke3.txt";
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

      let currentWord = 0;
      interval = setInterval(showWord, intervalauswahl);
      const word = vocabularyarray[currentWord];

      if (myLanguage == "deutsch") {
        document.getElementById("wortausgabede").innerHTML = word.german;
        document.getElementById("wortausgabeeng").innerHTML = word.english;
        currentWord++;
      } else {
        document.getElementById("wortausgabede").innerHTML = word.english;
        document.getElementById("wortausgabeeng").innerHTML = word.german;
        currentWord++;
      }

      function showWord() {
        if (currentWord >= vocabularyarray.length) {
          console.log("You have finished all the words!");
          clearInterval(interval);
          return;
        }
        const word = vocabularyarray[currentWord];
        if (myLanguage == "deutsch") {
          document.getElementById("wortausgabede").innerHTML = word.german;
          document.getElementById("wortausgabeeng").innerHTML = word.english;
          currentWord++;
        } else {
          document.getElementById("wortausgabede").innerHTML = word.english;
          document.getElementById("wortausgabeeng").innerHTML = word.german;
          currentWord++;
        }
      }
    })
    .catch((error) => {
      console.error(error);
    });
}
