vocabluaryfile = "wolke12.txt";
myLanguage = "deutsch";
intervalauswahl = 1000;
zaehler = 0;
pause = "nein";
currentWord = 0;
wort = "";
style = "type";

// prettier-ignore
function hoveronbus() {
  if (style == "flow") {
    document.getElementById("ebenebus").className = "ebenebus animation pause";
     // console.log(event.target);
     pause = "ja";
    }
}
function hoveroutbus() {
  if (style == "flow") {
    document.getElementById("ebenebus").className = "ebenebus animation";
    // console.log(event.target);
    pause = "nein";
    fragewort();
  }
}

// prettier-ignore
function flowortype() {
  document.getElementById("flow").className = "aktiviert mw3flow mwtext text";
  document.getElementById("type").className = "deaktiviert mw3type mwtext text";
  // console.log(event.target);
  style = "flow";
  pause = "nein";
  document.getElementById("ebenebus").className = "ebenebus animation";
  document.getElementById("seehidetext").innerHTML = "See/hide solution here";
  //document.getElementById("wortausgabede").innerHTML = "";
  document.getElementById("wortausgabeeng").className = "wortausgabeengunsichtbar text";
  document.getElementById("ebeneinput").className = "ebeneinput ebeneinputunsichtbar";
  document.getElementById("wortausgabeeng").innerHTML = word.german;
  //interval = setInterval(showWord, intervalauswahl);
  document.getElementById("richtigfalsch").innerHTML = "";
  currentWord = 0;
  fragewort()
}

// prettier-ignore
function flowortype2() {
  document.getElementById("flow").className = "deaktiviert mw3flow mwtext text";
  document.getElementById("type").className = "aktiviert mw3type mwtext text";
  style = "type";
  pause = "nein";
  console.log(word.english);
  console.log(word.german);
  currentWord = 0;
  word = vocabularyarray[currentWord];
  document.getElementById("richtigfalsch").innerHTML = "";
  haltFunction()
  typeWord()
}

// prettier-ignore
function changewolke11() {
  document.getElementById("wolke11").className = "aktiviert mw11text mwtext text";
  document.getElementById("wolke12").className = "deaktiviert mw12text mwtext text";
  document.getElementById("wolke13").className = "deaktiviert mw13text mwtext text";
  document.getElementById("wolke14").className = "deaktiviert mw14text mwtext text";
  document.getElementById("worteingetippt").placeholder = "Please type here";
  document.getElementById("richtigfalsch").innerHTML = "";
  console.log();
}
// prettier-ignore
function changewolke12() {
  document.getElementById("wolke11").className = "deaktiviert mw11text mwtext text";
  document.getElementById("wolke12").className = "aktiviert mw12text mwtext text";
  document.getElementById("wolke13").className = "deaktiviert mw13text mwtext text";
  document.getElementById("wolke14").className = "deaktiviert mw14text mwtext text";
  document.getElementById("worteingetippt").placeholder = "Please type here";
  document.getElementById("richtigfalsch").innerHTML = "";
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
  document.getElementById("richtigfalsch").innerHTML = "";
  document.getElementById("worteingetippt").placeholder = "Please type here";
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
  document.getElementById("worteingetippt").placeholder = "Please type here";
  document.getElementById("richtigfalsch").innerHTML = "";
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
  document.getElementById("worteingetippt").placeholder = "Please type here";
  document.getElementById("richtigfalsch").innerHTML = "";
  currentWord = 0;
  fragewort();
}
function onmouseoverenglish() {
  myLanguage = "english";
  document.getElementById("deutsch").src = "flagge_de.gif";
  document.getElementById("english").src = "flagge_eng2.gif";
  document.getElementById("worteingetippt").placeholder = "Please type here";
  document.getElementById("richtigfalsch").innerHTML = "";
  currentWord = 0;
  fragewort();
}
// prettier-ignore
function addvisibility() {
  if (style == "flow") {
    if (zaehler % 2 == 0) {
      document.getElementById("wortausgabeeng").className ="wortausgabeengsichtbar text";
      zaehler++;
    } else {
      document.getElementById("wortausgabeeng").className ="wortausgabeengsichtbar wortausgabeengunsichtbar text";
      zaehler++;
    }
  }
}

let interval;
function haltFunction() {
  clearInterval(interval);
  interval = null;
}

// prettier-ignore
function fragewort() {
  haltFunction();
  fetch(vocabluaryfile)
    .then((response) => response.text())
    .then((text) => {
      inhalt = text.split("\n");
      vocabularyarray = [];
      for (const zeilen of inhalt) {
        if (zeilen.length === 0) {
          continue;
        }
        [english, german] = zeilen.split(":");
        vocabularyarray.push({ english, german });
      }
      word = vocabularyarray[currentWord];
      if (style == "flow") {
        interval = setInterval(showWord, intervalauswahl);
        // word = vocabularyarray[currentWord];
        // prettier-ignore
        console.log("Intervall started function showWord");
        console.log(word.english);
        console.log(word.german);
      } else {
        console.log(word.english);
        console.log(word.german);
        //console.log("start function typeWord");
        word = vocabularyarray[currentWord];
        typeWord()
      }
    })
    .catch((error) => {
      console.error(error);
    });
}

// prettier-ignore
function showWord() {
  console.log("started function showWord");
  if (pause == "ja") {
    console.log("start function showWord - cleared intervall");
    clearInterval(interval);
    return;
  } else {
    console.log("start function showWord - pause = nein - else");
    //document.getElementById("ebenebus").className = "ebenebus animation";
    if (currentWord >= vocabularyarray.length) {
      console.log("You have finished all the words!");
      document.getElementById("wortausgabede").innerHTML = "Alles Fertig!";
      document.getElementById("wortausgabeeng").innerHTML = "All done - finished";
      document.getElementById("ebenebus").className = "ebenebus animationmiddle pause";
      console.log("start function showWord - last word reached cleared intervall");
      clearInterval(interval);
      return;
    }
    console.log("before wortausgae style = flow");
    if (style == "flow") {
      word = vocabularyarray[currentWord];
      if (myLanguage == "deutsch") {
        document.getElementById("wortausgabede").innerHTML = word.german;
        document.getElementById("wortausgabeeng").innerHTML = word.english;
        //console.log("nach wortausgabe lang = deutsch");
        //console.log(word.german);
        //console.log(word.english);
        currentWord++;
      } else {
        document.getElementById("wortausgabede").innerHTML = word.english;
        document.getElementById("wortausgabeeng").innerHTML = word.german;
        //console.log("nach wortausgabe lang = english");
        //console.log(word.english);
        //console.log(word.german);
        currentWord++;
      }
    }
  }
}

// prettier-ignore
function typeWord() {
  if ((myLanguage=="deutsch")) {
  console.log("started function typeWord deutsch");
  //console.log(word.english);
  //console.log(word.german);
  document.getElementById("ebenebus").className = "ebenebus animationmiddle";
  document.getElementById("seehidetext").innerHTML = "Type the correct translation (a word) <br> into the bus and press Return/Enter.";
  document.getElementById("wortausgabede").innerHTML = "";
  document.getElementById("wortausgabeeng").className = "wortausgabeengsichtbar text";
  document.getElementById("ebeneinput").className = "ebeneinput";
  document.getElementById("wortausgabeeng").innerHTML = word.german;
  } else {
    console.log("started function typeWord english");
    //console.log(word.english);
    //console.log(word.german);
    document.getElementById("ebenebus").className = "ebenebus animationmiddle";
    document.getElementById("seehidetext").innerHTML = "Type the correct translation (a word) <br> into the bus and press Return/Enter.";
    document.getElementById("wortausgabede").innerHTML = "";
    document.getElementById("wortausgabeeng").className = "wortausgabeengsichtbar text";
    document.getElementById("ebeneinput").className = "ebeneinput";
    document.getElementById("wortausgabeeng").innerHTML = word.english;
  }
}

// prettier-ignore
function worteingetippt() {
  wort = document.getElementById("worteingetippt").value;
  document.getElementById("worteingetippt").value = "";
  // console.log(wort);
  if (currentWord >= vocabularyarray.length) {
    console.log("You have finished all the words!");
    document.getElementById("wortausgabede").innerHTML = "Alles Fertig!";
    document.getElementById("wortausgabeeng").innerHTML = "All done - finished";
    document.getElementById("ebenebus").className = "ebenebus animationmiddle pause";
    clearInterval(interval);
    return;
  }
  // prettier-ignore
  word = vocabularyarray[currentWord];
  //console.log(word);
  document.getElementById("ebenebus").className = "ebenebus animation";
  if (myLanguage == "deutsch") {
    comparewortdeutsch ()
  } else {
    comparewortenglish ()
  }
}

// prettier-ignore
function comparewortdeutsch () {
  console.log("started function comparewortdeutsch");
  document.getElementById("wortausgabeeng").innerHTML = word.english;
  wordenglower = word.english.toLowerCase()
  wordtypelower = wort.toLowerCase()
  if (currentWord >= vocabularyarray.length-(1)) {
    console.log("You have finished all the words!");
    document.getElementById("worteingetippt").placeholder = "Gute Arbeit!";
    document.getElementById("wortausgabeeng").innerHTML = "Great Job, All done!";
    document.getElementById("ebenebus").className = "ebenebus animationmiddle pause";
    console.log("start function showWord - last word reached cleared intervall");
    clearInterval(interval);
    return;
  }
  if (wordenglower.includes(wordtypelower)) {
    console.log(word.english);
    console.log(word.german);
    console.log("If " + wort + "==" + word.english);
    console.log("Richtig!");
    currentWord++;
    word = vocabularyarray[currentWord];
    document.getElementById("wortausgabeeng").innerHTML = word.german;
    document.getElementById("richtigfalsch").innerHTML = "Correct";
    

  } else {
    console.log(word.english);
    console.log(word.german);
    console.log("If" + wort + "==" + word.english);
    console.log("Falsch!");
    currentWord++;
    word = vocabularyarray[currentWord];
    document.getElementById("wortausgabeeng").innerHTML = word.german;
    document.getElementById("richtigfalsch").innerHTML = "Wrong";
  }

}

// prettier-ignore
function comparewortenglish() {
  console.log("started function comparewortenglish");
  document.getElementById("wortausgabeeng").innerHTML = word.english;
  wordenglower = word.german.toLowerCase();
  wordtypelower = wort.toLowerCase();
  if (currentWord >= vocabularyarray.length - 1) {
    console.log("You have finished all the words!");
    document.getElementById("worteingetippt").placeholder = " Great Job, All done!";
    document.getElementById("wortausgabeeng").innerHTML = "Gute Arbeit!";
    document.getElementById("ebenebus").className = "ebenebus animationmiddle pause";
    console.log("start function showWord - last word reached cleared intervall");
    clearInterval(interval);
    return;
  }
  if (wordenglower.includes(wordtypelower)) {
    console.log(word.english);
    console.log(word.german);
    console.log("If " + wort + "==" + word.english);
    console.log("Richtig!");
    currentWord++;
    word = vocabularyarray[currentWord];
    document.getElementById("wortausgabeeng").innerHTML = word.english;
    document.getElementById("richtigfalsch").innerHTML = "";
  } else {
    console.log(word.english);
    console.log(word.german);
    console.log("If" + wort + "==" + word.english);
    console.log("Falsch!");
    currentWord++;
    word = vocabularyarray[currentWord];
    document.getElementById("wortausgabeeng").innerHTML = word.english;
    document.getElementById("richtigfalsch").innerHTML = "Wrong";
  }
}
