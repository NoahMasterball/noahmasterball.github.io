//Defining defaults and build page on it
let vocabularyarray = [];
let pause;
var interval;
let zaehler = 0;
let zaehler2 = 0;
window.addEventListener("load", function () {
  changelang([1, "ger", "eng"]);
  changespeed([2, 3000]);
  flowortype([1, "flow"]);
  buspause(["remove", "ohne"]);
  changevoc("12");
  pickvoc();
  setTimeout(showwords, 1000);
  typeword(2, "eng", "ger");
});

function changelang(lang) {
  document.getElementById("lang1").src = "flagge_ger1.gif";
  document.getElementById("lang2").src = "flagge_eng1.gif";
  document.getElementById("lang" + lang[0]).src = "flagge_" + lang[1] + "2.gif";
  myLanguage = [lang[1], lang[2]];
  //document.getElementById("worteingetippt").placeholder = "Please type here"; //document.getElementById("richtigfalsch").innerHTML = ""; //currentWord = 0; //fragewort();
}

function flowortype(flowortype) {
  for (let i = 1; i <= 2; i++) {
    document.getElementById("flow" + i).classList.remove("aktiviert2");
  }
  document.getElementById("flow" + flowortype[0]).classList.add("aktiviert2");
  style = flowortype[1];
  // style = "type"; // pause = "nein"; // currentWord = 0; // word = vocabularyarray[currentWord]; // document.getElementById("richtigfalsch").innerHTML = ""; // haltFunction() // typeWord()
}

// prettier-ignore
function changespeed(welcherspeed) {
  for (let i = 1; i <= 5; i++) {
    document.getElementById("speed" + i).classList.remove("aktiviert2");
  }
  document.getElementById("speed" + welcherspeed[0]).classList.add("aktiviert2");
  intervalauswahl = welcherspeed[1];
}

function changevoc(welchewolke) {
  for (let i = 11; i <= 14; i++) {
    document.getElementById("wolke" + i).classList.remove("aktiviert");
  }
  document.getElementById("wolke" + welchewolke).classList.add("aktiviert");
  vocabluaryfile = "wolke" + welchewolke + ".txt";
}

// prettier-ignore
function buspause(wert) {
  document.getElementById("ebenebus").classList[wert[0]]("pause");
  pause = wert[1];
  eval(wert[2]);
}

function seeword() {
  zaehler++;
  // if (style == "flow") {
  zaehler % 2 == 0
    ? document.getElementById("word1").classList.remove("invisible")
    : document.getElementById("word1").classList.add("invisible");
}

function pickvoc() {
  fetch(vocabluaryfile)
    .then((response) => response.text())
    .then((text) => {
      inhalt = text.split("\n");
      for (const zeilen of inhalt) {
        if (zeilen.length === 0) {
          continue;
        }
        [eng, ger] = zeilen.split(":");
        vocabularyarray.push({ eng, ger });
      }
    });
}

// prettier-ignore
function showwords() {
    // myFunction();
    if (zaehler2 < vocabularyarray.length) {
      document.getElementById("word1").innerHTML = vocabularyarray[zaehler2][myLanguage[0]];
      document.getElementById("word2").innerHTML = vocabularyarray[zaehler2][myLanguage[1]];
      zaehler2++;
      interval = setTimeout(showwords, intervalauswahl);
    }
  }

let lastCallTime = null;
// prettier-ignore
function myFunction() {
  const currentTime = new Date().getTime();
  if (lastCallTime) { const timeDiff = currentTime - lastCallTime;
    console.log(`Die Funktion wurde zuletzt vor ${timeDiff} Millisekunden aufgerufen.`);
  } lastCallTime = currentTime;
}

// prettier-ignore
function typeword(lang2) {
  //myLanguage = [lang2[1], lang2[2]];
  console.log([myLanguage[0]]);
  console.log(vocabularyarray[zaehler2]);
  //document.getElementById("word1").innerHTML = vocabularyarray[zaehler2][myLanguage[0]];
  document.getElementById("ebenebus").classList.add("animationmiddle");
  document.getElementById("seehidetext").innerHTML = "Type the correct translation (a word) <br> into the bus and press Return/Enter.";
  document.getElementById("word2").classList.add("word2unsichtbar");
  document.getElementById("ebeneinput").className = "ebeneinput";
  document.getElementById("word1").classList.remove("invisible");
}
