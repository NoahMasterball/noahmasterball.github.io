
var myLanguage = 'deutsch';

function onmouseoverdeutsch() {
  myLanguage = 'deutsch';
  document.getElementById("deutsch").src="flagge_de2.gif";
  document.getElementById("english").src="flagge_eng.gif";
  // document.getElementById("seitenausgabe").innerHTML = myLanguage;
}
function onmouseoverenglish() {
  myLanguage = 'english';
  document.getElementById("deutsch").src="flagge_de.gif";
  document.getElementById("english").src="flagge_eng2.gif";
  // document.getElementById("seitenausgabe").innerHTML = myLanguage;
}

function changeClass1() {
  document.getElementById("button1").className="open";
  document.getElementById("button2").className="";
  document.getElementById("button3").className="";
  myvocabluary = 'button1';
}

function changeClass2() {
  document.getElementById("button2").className="open";
  document.getElementById("button1").className="";
  document.getElementById("button3").className="";
  myvocabluary = 'button2';
}

function changeClass3() {
  document.getElementById("button3").className="open";
  document.getElementById("button1").className="";
  document.getElementById("button2").className="";
  myvocabluary = 'button3';
}






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



