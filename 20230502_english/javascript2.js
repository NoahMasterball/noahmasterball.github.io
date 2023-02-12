var myLanguage = "deutsch";
var myvocabluary = "button1";

function onmouseoverdeutsch() {
  myLanguage = "deutsch";
  document.getElementById("deutsch").src = "flagge_de2.gif";
  document.getElementById("english").src = "flagge_eng.gif";
  // document.getElementById("seitenausgabe").innerHTML = myLanguage;
}
function onmouseoverenglish() {
  myLanguage = "english";
  document.getElementById("deutsch").src = "flagge_de.gif";
  document.getElementById("english").src = "flagge_eng2.gif";
  // document.getElementById("seitenausgabe").innerHTML = myLanguage;
}

function changeClass1() {
  document.getElementById("button1").className = "open";
  document.getElementById("button2").className = "close";
  document.getElementById("button3").className = "close";
  myvocabluary = "button1";
}

function changeClass2() {
  document.getElementById("button2").className = "open";
  document.getElementById("button1").className = "close";
  document.getElementById("button3").className = "close";
  myvocabluary = "button2";
}

function changeClass3() {
  document.getElementById("button3").className = "open";
  document.getElementById("button1").className = "close";
  document.getElementById("button2").className = "close";
  myvocabluary = "button3";
}

function fragewort() {
  fetch("button1.txt")
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
      interval = setInterval(showWord, 1000);

      function showWord() {
        if (currentWord >= vocabularyarray.length) {
          console.log("You have finished all the words!");
          clearInterval(interval);
          return;
        }
        const word = vocabularyarray[currentWord];
        document.getElementById("wortausgabede").innerHTML = word.german;
        document.getElementById("wortausgabeeng").innerHTML = word.english;
        currentWord++;
      }
    })
    .catch((error) => {
      console.error(error);
    });
}

/*


  const importfilesystem = require("fs");
  const importreadline = require("readline");
  

  // Read the vocabulary file, then split it, then create array
  const vocabFile = fs.readFileSync("button1.txt", "utf-8");
  const vocabLines = vocabFile.split("\n");
  // const vocabularyarray = [];

  // Parse the vocabulary lines and add each word to the vocabulary array
  for (const line of vocabLines) {
    if (line.length === 0) {
      continue;
    }
    const [english, german] = line.split(":");
    vocabularyarray.push({ english, german });
  }

  const wort = vocabularyarray[aktuelleswort];

  test = "lalala";
  document.getElementById("wortausgabe").innerHTML = test + "walum";
}



const person = {firstName:"John", lastName:"Doe", age:46};
document.getElementById("demo").innerHTML = person.firstName;

const fs = require("fs");
const readline = require("readline");

// Read the vocabulary file, then split it, then create array
const vocabFile = fs.readFileSync("button1.txt", "utf-8");
const vocabLines = vocabFile.split("\n");
const vocabularyarray = [];

// Parse the vocabulary lines and add each word to the vocabulary array
for (const line of vocabLines) {
  if (line.length === 0) {
    continue;
  }
  
  const [english, german] = line.split(":");
  vocabularyarray.push({english, german});
}



/*
// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function changeClass3() {

function fragewort() {
  {
  if (currentWord >= vocabulary.length) {
    console.log("You have finished all the words!");
    rl.close();
    return;
  }


// Start the vocabulary trainer
console.log("Welcome to the German-English Vocabulary Trainer!");
console.log("Translate the following word from German to English:");

let currentWord = 0;

const askNextWord = () => {
  if (currentWord >= vocabulary.length) {
    console.log("You have finished all the words!");
    rl.close();
    return;
  }
  
  const word = vocabulary[currentWord];
  console.log(word.german);
  
  rl.question("> ", answer => {
    if (answer.toLowerCase() === word.english.toLowerCase()) {
      console.log("Correct!");
    } else {
      console.log(`Incorrect. The correct answer is "${word.english}"`);
    }
    
    currentWord++;
    askNextWord();
  });
};

askNextWord();






/*


//Standartmässig nehmen wir english als sprache
var myLanguage = 'deutsch';
var zaehler = 0;

  // Wenn nun der knopf, die wolke gedrückt wird führe die funktion aus, sonst nicht
function knopfhastdruckst() {
  // Prüfen ob der inhalt von der schublade auch variable genannt, names "zaehler" gerade (oder ungerade via else) ist) 
  //   Dabei greift man auf einen kleinen Trick zurück: Teilt man eine gerade Zahl durch zwei, ist der Rest immer null. Teilt man eine ungerade Zahl durch zwei ist der Rest nie null.
  //   Modulo-Operator (%)
  //   Ein Rechenbeispiel:
  //  50 / 25 = 2; Rest = 0 (denn 50 – 2 * 25 = 0)
  //  50 / 20 = 2.5; Rest = 10 (denn 50 – 2 * 20 = 10)
  //  In JS sieht das z.B. so aus:
  //  (50 % 25); Ergebnis = 0 da kein rest bleibt ist die zahl gerade
  //  (50 % 20); Ergebnis = 0 da ein rest bleibt ist die zahl ungerade

  if (zaehler % 2 == 0) {
    // Da zahl gerade ist, fülle Schublade "myLanguage" mit "Deutsch", und dann rechne beim zaehler +1 damit er beim nächsten mal ungerade ist)
    myLanguage = 'english';
    document.getElementById("seitenausgabe").innerHTML = myLanguage + "&nbsp" + zaehler;
    zaehler++;
    document.getElementById("deutsch").src="flagge_de2.gif";
    document.getElementById("english").src="flagge_eng.gif";
  } else {
    // Da zahl nicht gerade (ungerade) ist, fülle Schublade "myLanguage" mit "Englisch", und dann rechne beim zaehler +1 damit er beim nächsten mal wieder gerade ist)
    myLanguage = 'deutsch';
    document.getElementById("seitenausgabe").innerHTML = myLanguage + "&nbsp" + zaehler;
    zaehler++;
    document.getElementById("deutsch").src="flagge_de2.gif";
    document.getElementById("english").src="flagge_eng.gif";
  } 
     //  Ausgabe auf Webseite nur zum testen auch mit zaehlerstand
}

function knopfhastdruckstdeutsch() {
  document.getElementById("deutsch").src="flagge_de2.gif";
  document.getElementById("english").src="flagge_eng.gif";
}
function knopfhastdruckstenglish() {
  document.getElementById("deutsch").src="flagge_de.gif";
  document.getElementById("english").src="flagge_eng2.gif";
}
*/
