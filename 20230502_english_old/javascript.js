//Defining defaults and build page on it
let vocabularyarray = [];
let pause;
let interval;
let zaehler = 0;
let zaehler2 = 0;
let flowtype = [];
let artshow = "on";
let isRunning = false;
let anaus = "aus";

window.addEventListener("load", function () {
  changelang([1, "ger", "eng"]);
  changespeed([4, 10000]);
  flowortype(["1", "flow", "2", "type"]);
  //flowortype(["2", "type", "1", "flow"]);
  //setTimeout(typeword, 1500);
  buspause(["remove", "ohne"]);
  changevoc("11");
  artonoff(["on", 1]);
  //pickvoc(); wird duch changevoc gestartet.
  interval = setTimeout(showwords, 3000);
  document
    .getElementById("art")
    .addEventListener("transitionend", function (event) {
      if (
        event.propertyName === "opacity" &&
        event.target.classList.contains("artfadein")
      ) {
        removeFadeinClass();
      }
    });
});

function removeFadeinClass() {
  if (!isRunning) {
    isRunning = true;
    setTimeout(function () {
      document.getElementById("art").classList.remove("artfadein");
      console.log("jetzt fadeout");
      isRunning = false;
    }, 10000);
  } else {
    console.log("Funktion wird bereits ausgeführt...");
  }
}

function artonoff(anauswert) {
  console.log(anauswert[0]);
  if (anauswert[1] == 2) {
    anaus = "an";
  }
  if (anauswert[1] == 1) {
    anaus = "aus";
  }
  if (anauswert[0] == "on") {
    document.getElementById("off").classList.remove("aktiviert2");
    document.getElementById("on").classList.add("aktiviert2");
    artshow = "on";
    clearInterval(intervalId);
    intervalId = setTimeout(changeart, 1000);
  }
  if (anauswert[0] == "off") {
    document.getElementById("on").classList.remove("aktiviert2");
    document.getElementById("off").classList.add("aktiviert2");
    artshow = "off";
    clearInterval(intervalId);
    document.getElementById("art").src = "";
    return;
  }
}

let intervalId;
function changeart() {
  console.log(anaus);
  if (anaus == "an") {
    document.getElementById("art").src = "art/art1.png";
    document.getElementById("art").classList.add("artfadein");
    let t = 2;
    intervalId = setInterval(function () {
      document.getElementById("art").src = "art/art" + t + ".png";
      document.getElementById("art").classList.add("artfadein");
      console.log(
        (document.getElementById("art").src = "art/art" + t + ".png")
      );
      t++;
      if (t > 58) {
        t = 1;
      }
    }, 25000);
  }
  if (anaus == "aus") {
    let t = 1;
    intervalId = setInterval(function () {
      document.getElementById("art").src = "art/art" + t + ".png";
      document.getElementById("art").classList.add("artfadein");
      console.log(
        (document.getElementById("art").src = "art/art" + t + ".png")
      );
      t++;
      if (t > 58) {
        t = 1;
      }
    }, 25000);
  }
}

function changelang(lang) {
  document.getElementById("lang1").src = "flagge_ger1.gif";
  document.getElementById("lang2").src = "flagge_eng1.gif";
  document.getElementById("lang" + lang[0]).src = "flagge_" + lang[1] + "2.gif";
  myLanguage = [lang[1], lang[2]];
}

function flowortype(fort) {
  for (let i = 1; i <= 2; i++) {
    document.getElementById("flow" + i).classList.remove("aktiviert2");
  }
  document.getElementById("flow" + fort[0]).classList.add("aktiviert2");
  flowtype = fort;
}

// prettier-ignore       [3,5000]
function changespeed(welcherspeed) {
  for (let i = 1; i <= 5; i++) {
    document.getElementById("speed" + i).classList.remove("aktiviert2");
  }
  document
    .getElementById("speed" + welcherspeed[0])
    .classList.add("aktiviert2");
  intervalauswahl = welcherspeed[1];
}

function changevoc(welchewolke) {
  for (let i = 11; i <= 14; i++) {
    document.getElementById("wolke" + i).classList.remove("aktiviert");
  }
  document.getElementById("wolke" + welchewolke).classList.add("aktiviert");
  vocabluaryfile = "wolke" + welchewolke + ".txt";
  setTimeout(pickvoc, 1000);
}

// prettier-ignore
function buspause(wert) {
  if (flowtype[1] == "flow") {
    document.getElementById("ebenebus").classList[wert[0]]("pause");
    pause = wert[1];
    eval(wert[2]);
  }
}

function seeword() {
  if (flowtype[1] == "flow") {
    if (zaehler % 2 == 0) {
      document.getElementById("word1").classList.remove("invisible");
      document.getElementById("word3").classList.remove("invisible");
    } else {
      document.getElementById("word1").classList.add("invisible");
      document.getElementById("word3").classList.add("invisible");
      //document.getElementById("word3").innerHTML = "";
    }
    zaehler++;
  }
}

function pickvoc() {
  vocabularyarray.splice(0, vocabularyarray.length);
  zaehler2 = 0;
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
  if (flowtype[1] == "type") {
    setTimeout(typeword, 1500);
  }
}

let deleteTimeout;
// prettier-ignore
function showwords() {
    myFunction();
    if (zaehler2 < vocabularyarray.length) {
        if (flowtype[1] == "flow") {
          if (zaehler2 >= 1) {
            document.getElementById("word1").innerHTML = vocabularyarray[zaehler2][myLanguage[1]];
            document.getElementById("word2").innerHTML = vocabularyarray[zaehler2][myLanguage[0]];
            document.getElementById("word3").innerHTML = "(Last word: " + vocabularyarray[zaehler2 - 1][myLanguage[1]] + ")" 
            clearTimeout(deleteTimeout);
            deleteTimeout = setTimeout(deletelastword, 5000);

          } else {
            document.getElementById("word1").innerHTML = vocabularyarray[zaehler2][myLanguage[1]];
            document.getElementById("word2").innerHTML = vocabularyarray[zaehler2][myLanguage[0]];
            document.getElementById("word3").innerHTML = "";
          }
          
          
          zaehler2++;
          interval = setTimeout(showwords, intervalauswahl);
        } else {
          document.getElementById("word1").innerHTML = vocabularyarray[zaehler2][myLanguage[0]];
          document.getElementById("word2").innerHTML = vocabularyarray[zaehler2][myLanguage[1]];
          clearTimeout(interval);
        }
    } else {
        console.log('All words are finished!')
        document.getElementById('word' + flowtype[2]).innerHTML = "Alles Fertig! -> Neustart!";
        document.getElementById('word' + flowtype[0]).innerHTML = "All finished! -> restart!";
        zaehler2 = 0;
        interval = setTimeout(showwords, 10000);
    }
}

let lastCallTime = null;
// prettier-ignore
function myFunction() {
  const currentTime = new Date().getTime();
  if (lastCallTime) { const timeDiff = currentTime - lastCallTime;
    console.log(`Die Funktion showwords wurde zuletzt vor ${timeDiff} Millisekunden aufgerufen.`);
  } lastCallTime = currentTime;
}

// prettier-ignore
function typeword() {
  console.log('typeword ran ' + flowtype[0] + flowtype[1] + flowtype[2] + flowtype[3]);
  document.getElementById('word' + flowtype[2]).innerHTML = vocabularyarray[zaehler2][myLanguage[0]];
  document.getElementById('word' + flowtype[0]).innerHTML = vocabularyarray[zaehler2][myLanguage[1]];
  document.getElementById('word' + flowtype[2]).classList.remove("invisible");
  document.getElementById('word' + flowtype[0]).classList.add("invisible");
  document.getElementById("ebenebus").classList.add('animation' + flowtype[0]);
  document.getElementById("ebenebus").classList.remove('animation' + flowtype[2]);
  document.getElementById('seetext' + flowtype[0]).classList.remove("invisible");
  document.getElementById('seetext' + flowtype[2]).classList.add("invisible");
  document.getElementById("ebeneinput").classList.remove('ebeneinput' + flowtype[0]);
  document.getElementById("ebeneinput").classList.add('ebeneinput' + flowtype[2]);
  document.getElementById("word3").innerHTML = "";
  if (flowtype[1] == "type") {
    console.log(vocabularyarray[zaehler2][myLanguage[1]]);
    if (vocabularyarray[zaehler2][myLanguage[1]].includes("Page")) {
      zaehler2++
      //console.log('cleared+restart Page')
      //console.log('cleared by page');
      clearTimeout(interval);
      interval = setTimeout(showwords, 3000)
    }
    if (vocabularyarray[zaehler2][myLanguage[1]].includes("Seite")) {
      zaehler2++
      //console.log('cleared+restart Page')
      //console.log('cleared by page');
      clearTimeout(interval);
      interval = setTimeout(showwords, 3000)
    }
  }
  if (flowtype[1] == "flow") {
    clearTimeout(interval);
    interval = setTimeout(showwords, 1500)
    // console.log('cleared+restart')
  } 
}

// prettier-ignore
function worteingetippt() {
  wort = document.getElementById("worteingetippt").value;
  document.getElementById("worteingetippt").value = "";
  if (zaehler2 >= vocabularyarray.length) {
    console.log("You have finished all the words!");
    document.getElementById("word" + flowtype[2]).innerHTML = "Alles Fertig! -> Neustart!";
    document.getElementById("word" + flowtype[0]).innerHTML = "All done - finished! -> restart!";
    clearInterval(interval);
    return;
  }
  compareword();
}

let zaehler3 = 0;
let zaehler4 = 1;
let zaehler5 = 1;
let deletingTimeout;
let score1 = 0;
let score2 = 0;
// prettier-ignore
function compareword () {
    console.log("started function comparewortdeutsch");
    wordlower = vocabularyarray[zaehler2][myLanguage[1]].toLowerCase();
    wordtypelower = wort.toLowerCase()
    if (zaehler2 >= vocabularyarray.length) {
      console.log("You have finished all the words!");
      document.getElementById("word" + flowtype[2]).innerHTML = "Alles Fertig! -> Neustart!";
      document.getElementById("word" + flowtype[0]).innerHTML = "All done - finished! -> restart!";
      clearInterval(interval);
      return;
    }
    console.log('vor if' + zaehler3);
    if (wordlower.includes(wordtypelower)) {
      console.log("Richtig! If " + wordlower + 'enthält' + wordtypelower + "==" + vocabularyarray[zaehler2][myLanguage[1]]);
      // word = vocabularyarray[zaehler2];
      document.getElementById("richtigfalsch").innerHTML = "Correct: " + vocabularyarray[zaehler2][myLanguage[1]];
      document.getElementById("richtigfalschicon").src = "icons/happy" + zaehler4 + ".gif";
      score1++;
      document.getElementById("score").innerHTML = "Your score: <br> Correct: " + score1 + " / Wrong: " + score2;
      document.getElementById("orangediv").classList.add("richtigfalschsichtbar");
      clearTimeout(deletingTimeout);
      deletingTimeout = setTimeout(deletesolution, 10000);
       if (zaehler4 == 11) {zaehler4 = 0};
      zaehler2++;
      zaehler4++;
    } else {
      document.getElementById("richtigfalsch").innerHTML = "Wrong: " + vocabularyarray[zaehler2][myLanguage[1]];
      document.getElementById("richtigfalschicon").src = "icons/unhappy" + zaehler5 + ".gif";
      document.getElementById("busfeuer").classList.remove("invisible");
      document.getElementById("busfeuer2").classList.remove("invisible");
      score2++;
      document.getElementById("score").innerHTML = "Your score: <br> Correct: " + score1 + " / Wrong: " + score2;
      document.getElementById("orangediv").classList.add("richtigfalschsichtbar");
      clearTimeout(deletingTimeout);
      deletingTimeout = setTimeout(deletesolution, 10000);
      if (zaehler5 == 10) {zaehler5 = 0};
      zaehler2++;
      zaehler5++;

      /*
      if (zaehler3 == 0) {
        console.log(zaehler3 == 0);
        console.log("Falsch! If " + wordlower + 'enthält' + wordtypelower + "==" + vocabularyarray[zaehler2][myLanguage[1]]);
        document.getElementById("richtigfalsch").innerHTML = "Wrong - please retry - 2 retries left";
        console.log('1 retry' + zaehler3);
        typeword()
        zaehler3++;
      }
      if (zaehler3 == 1) {
        console.log("Falsch! If " + wordlower + 'enthält' + wordtypelower + "==" + vocabularyarray[zaehler2][myLanguage[1]]);
        document.getElementById("richtigfalsch").innerHTML = "Wrong - please retry - 1 retries left";
        console.log('2 retry' + zaehler3);
        typeword()
      }
      if (zaehler3 == 2) {
        console.log("Falsch! If " + wordlower + 'enthält' + wordtypelower + "==" + vocabularyarray[zaehler2][myLanguage[1]]);
        document.getElementById("richtigfalsch").innerHTML = "Wrongxxx: " + vocabularyarray[zaehler2][myLanguage[1]];
        zaehler2++;
        console.log('no retry - end' + zaehler3);
        typeword()
    }
    */
    }
    clearTimeout(interval);
    interval = setTimeout(showwords, 1500)
    //console.log('cleared+restart by end')
}

function deletelastword() {
  document.getElementById("word3").innerHTML = "";
}
function deletesolution() {
  document.getElementById("richtigfalsch").innerHTML = "";
  document.getElementById("busfeuer").classList.add("invisible");
  document.getElementById("busfeuer2").classList.add("invisible");
  document.getElementById("richtigfalschicon").src = "";
  document.getElementById("score").innerHTML = "";
  document
    .getElementById("orangediv")
    .classList.remove("richtigfalschsichtbar");
}

function fastcontinue() {
  if (flowtype[1] == "flow") {
    clearTimeout(interval);
    showwords();
  }
}
