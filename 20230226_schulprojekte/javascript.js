let einheit = "m"
let qwert = "m"
let zwert = "m"

document.getElementById("calc").addEventListener("click", function() {
  console.log(parseInt(field1.value)+parseInt(field2.value));
  let nen1 = field1.value * field2.value  * field3.value
  document.getElementById("ergebnis").innerHTML = "Ergebnis:  " + nen1 + " " + einheit + "<sup>3</sup>";
});

document.getElementById("b1").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b1").style.color = "#fff";
  einheit = "nm"
});

document.getElementById("b2").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b2").style.color = "#fff";
  einheit = "μm"
});

document.getElementById("b3").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b3").style.color = "#fff";
  einheit = "mm"
});

document.getElementById("b4").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b4").style.color = "#fff";
  einheit = "cm"
});

document.getElementById("b5").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b5").style.color = "#fff";
  einheit = "dm"
});

document.getElementById("b6").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b6").style.color = "#fff";
  einheit = "m"
});

document.getElementById("b7").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b7").style.color = "#fff";
  einheit = "dam"
});

document.getElementById("b8").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b8").style.color = "#fff";
  einheit = "hm"
});

document.getElementById("b9").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("b" + i).style.color = "black";
  }
  document.getElementById("b9").style.color = "#fff";
  einheit = "km"
});

document.getElementById("q1").addEventListener("click", function() {
  for (var i = 1; i <= 9; i++) {
    document.getElementById("q" + i).style.color = "black";
  }
  document.getElementById("q1").style.color = "#fff";
  qwert = "-9"
});