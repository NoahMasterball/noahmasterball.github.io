window.onload = function () {
  //prettier-ignore
  document.getElementById("button-up").addEventListener("mouseover", mouseOver1);
  //prettier-ignore
  document.getElementById("button-up").addEventListener("mouseout", mouseOut1);
};

function mouseOver1() {
  console.log("drüber");
  KEY_UP = true;
}
function mouseOut1() {
  console.log("raus");
  KEY_UP = false;
}
