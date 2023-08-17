console.log(5 + 2);
console.log(5 - 2);
console.log(5 / 2);
console.log(5 * 2);

console.log(5 % 2);
console.log(5 ** 2);

let score = 99;

/*console.log(score);
console.log(score--);
console.log(score);*/

let balance = 2000;
balance *= 1000;
balance -= 300;
balance /= 300;
balance %= 2;
console.log(balance);


var userlang = navigator.language || navigator.userLanguage; 
var useragent = navigator.userAgent ; 
//alert ("The language is: " + userlang + useragent);
document.getElementById("lang").innerHTML = userlang;
document.getElementById("dev").innerHTML = useragent;