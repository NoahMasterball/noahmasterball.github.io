function calculateSize() {
  var age = document.getElementById("ageinput").value;
  var size;
  if (age != "") {
    if (age < 0) {
      size = "Your age is not possible, you must be at least 1 day old!";
    } else if (age < 1) {
      size = "The human average size of this age is 65cm!";
    } else if (age < 2) {
      size = "The human average size of this age is 75cm!";
    } else if (age < 3) {
      size = "The human average size of this age is 85cm!";
    } else if (age < 4) {
      size = "The human average size of this age is 95cm!";
    } else if (age < 5) {
      size = "The human average size of this age is 105cm!";
    } else if (age < 7) {
      size = "The human average size of this age is 111cm!";
    } else if (age < 10) {
      size = "The human average size of this age is 139cm!";
    } else if (age < 15) {
      size = "The human average size of this age is 162cm!";
    } else if (age < 20) {
      size = "The human average size of this age is 167cm!";
    } else if (age < 40) {
      size = "The human average size of this age is 174cm!";
    } else {
      size = "The human average size of this age is 177cm!";
    }
    document.getElementById("result").innerHTML = size + " ";
  } else {
  }
}
