alert("hello");
alert("This is alert");
["This is forEach"].forEach(alert);
console.log("And this is console.log!");
console.warn("And this is console.warn!");
console.error("And this is console.error!");
if (confirm("Is this alert?")) {
  console.log("correct");
  alert("correct");
} else {
  console.log("false");
  alert("false");
}
let user = prompt("What is your name?", "this is prompt");

// let user = "noah";
console.log("%c hey there " + user, "color: lime; font-size: 20px; font-weight: bold", user);
