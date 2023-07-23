
setInterval(jedesekunde,100);
a = 100;



function zeitinfo(zeit) {
    console.log(""); console.log("Noch " + zeit + " Sekunden bis zur nächsten automatischen Abstimmung.");
}

function jedesekunde(){
  if (a >= 0) {
    zeitinfo(a)
    a--;
  } else {
    return
  }
}



var elementExists = document.getElementById("voteIntendButton");
if (elementExists !== null) {
  /* Do this if variable is not null */
  document.getElementById("voteIntendButton").click();
} else {
  document.getElementById("voteAgainButton").click();
}




