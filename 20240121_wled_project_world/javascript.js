// prettier-ignore
window.addEventListener("load", function () {
    if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
        document.getElementById("rocket1t").addEventListener("mousedown", function() {mouseOver1("rocket1.jpg")});
          document.getElementById("rocket2t").addEventListener("mousedown", function() {mouseOver1("rocket2.jpg")});
          document.getElementById("rocket3t").addEventListener("mousedown", function() {mouseOver1("rocket3.jpg")});
          document.getElementById("rocket4t").addEventListener("mousedown", function() {mouseOver1("rocket4.jpg")});
          document.getElementById("rocket5t").addEventListener("mousedown", function() {mouseOver1("rocket5.jpg")});
          document.getElementById("mobile1t").addEventListener("mousedown", function() {mouseOver1("mobile1.jpg")});
          document.getElementById("mobile2t").addEventListener("mousedown", function() {mouseOver1("mobile2.jpg")});
          document.getElementById("mobile3t").addEventListener("mousedown", function() {mouseOver1("mobile3.jpg")});
          document.getElementById("mobile4t").addEventListener("mousedown", function() {mouseOver1("mobile41.jpg")});
          document.getElementById("rocketseepictext").addEventListener("mouseover", function() {mouseOver2()});
          document.getElementById("linktextspace").addEventListener("mouseover", function() {mouseOver3()});
          document.getElementById("englishvoclink").addEventListener("mouseover", function() {mouseOver3()});
    }else{
          document.getElementById("rocket1").addEventListener("mousedown", function() {mouseOver1("rocket1.jpg")});
          document.getElementById("rocket2").addEventListener("mousedown", function() {mouseOver1("rocket2.jpg")});
          document.getElementById("rocket3").addEventListener("mousedown", function() {mouseOver1("rocket3.jpg")});
          document.getElementById("rocket4").addEventListener("mousedown", function() {mouseOver1("rocket4.jpg")});
          document.getElementById("rocket5").addEventListener("mousedown", function() {mouseOver1("rocket5.jpg")});
          document.getElementById("rocket1t").addEventListener("mousedown", function() {mouseOver1("rocket1.jpg")});
          document.getElementById("rocket2t").addEventListener("mousedown", function() {mouseOver1("rocket2.jpg")});
          document.getElementById("rocket3t").addEventListener("mousedown", function() {mouseOver1("rocket3.jpg")});
          document.getElementById("rocket4t").addEventListener("mousedown", function() {mouseOver1("rocket4.jpg")});
          document.getElementById("rocket5t").addEventListener("mousedown", function() {mouseOver1("rocket5.jpg")});
          document.getElementById("mobile1").addEventListener("mousedown", function() {mouseOver1("mobile1.jpg")});
          document.getElementById("mobile2").addEventListener("mousedown", function() {mouseOver1("mobile2.jpg")});
          document.getElementById("mobile3").addEventListener("mousedown", function() {mouseOver1("mobile3.jpg")});
          document.getElementById("mobile4").addEventListener("mousedown", function() {mouseOver1("mobile4.jpg")});
          document.getElementById("mobile1t").addEventListener("mousedown", function() {mouseOver1("mobile1.jpg")});
          document.getElementById("mobile2t").addEventListener("mousedown", function() {mouseOver1("mobile2.jpg")});
          document.getElementById("mobile3t").addEventListener("mousedown", function() {mouseOver1("mobile3.jpg")});
          document.getElementById("mobile4t").addEventListener("mousedown", function() {mouseOver1("mobile4.jpg")});
          document.getElementById("rocketseepictext").addEventListener("mouseover", function() {mouseOver2()});
          document.getElementById("linktextspace").addEventListener("mouseover", function() {mouseOver3()});
          document.getElementById("englishvoclink").addEventListener("mouseover", function() {mouseOver3()});
    }
          document.getElementById("mtext").addEventListener("mouseover", function() {mouseOver4()});
          document.getElementById("linktextenglish").addEventListener("mouseover", function() {mouseOver5()});
});

function mouseOver1(filename) {
  window.open("./index/" + encodeURI(filename));
}
function mouseOver2() {
  document.getElementById("rocketpicunsichtbar").classList.replace("hidden", "visible");
}
function mouseOver3() {
  document.getElementById("rocketpicunsichtbar").classList.replace("visible", "hidden");
}
function mouseOver4() {
  document.getElementById("hidden").classList.replace("hidden", "visible");
  console.log("ausgelöst");
}
function mouseOver5() {
  document.getElementById("hidden").classList.replace("visible", "hidden");
  console.log("ausgelösttext");
}
