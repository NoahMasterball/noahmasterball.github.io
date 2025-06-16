class RouletteGame {
    constructor() {
        this.wheel = document.querySelector('.roulette-wheel');
        this.numbersContainer = document.querySelector('.roulette-numbers');
        this.spinButton = document.querySelector('.roulette-game .spin-button');
        this.betInput = document.getElementById('roulette-bet');
        this.messageBox = document.querySelector('.roulette-message');
        this.creditsDisplay = document.getElementById('roulette-credits');
        this.isSpinning = false;
        this.selectedNumber = null;
        this.credits = sharedCredits.getCredits();
        this.currentAngle = 0; // Startwinkel für gleichmäßige Drehung
        
        // Roulette Zahlen und ihre Farben (ohne 0)
        this.numbers = [
            { number: 32, color: 'red' }, { number: 15, color: 'black' }, { number: 19, color: 'red' },
            { number: 4, color: 'black' }, { number: 21, color: 'red' }, { number: 2, color: 'black' },
            { number: 25, color: 'red' }, { number: 17, color: 'black' }, { number: 34, color: 'red' },
            { number: 6, color: 'black' }, { number: 27, color: 'red' }, { number: 13, color: 'black' },
            { number: 36, color: 'red' }, { number: 11, color: 'black' }, { number: 30, color: 'red' },
            { number: 8, color: 'black' }, { number: 23, color: 'red' }, { number: 10, color: 'black' },
            { number: 5, color: 'red' }, { number: 24, color: 'black' }, { number: 16, color: 'red' },
            { number: 33, color: 'black' }, { number: 1, color: 'red' }, { number: 20, color: 'black' },
            { number: 14, color: 'red' }, { number: 31, color: 'black' }, { number: 9, color: 'red' },
            { number: 22, color: 'black' }, { number: 18, color: 'red' }, { number: 29, color: 'black' },
            { number: 7, color: 'red' }, { number: 28, color: 'black' }, { number: 12, color: 'red' },
            { number: 35, color: 'black' }, { number: 3, color: 'red' }, { number: 26, color: 'black' }
        ];

        this.initializeGame();
    }

    initializeGame() {
        // Erstelle das Zahlenbrett
        this.createBettingBoard();
        
        // Event Listener für den Spin-Button
        this.spinButton.addEventListener('click', () => this.spin());
        
        // Aktualisiere Credits-Anzeige
        this.updateCredits();
    }

    createBettingBoard() {
        this.numbersContainer.innerHTML = '';
        this.numbers.forEach(num => {
            const numberElement = document.createElement('div');
            numberElement.className = `roulette-number ${num.color}`;
            numberElement.textContent = num.number;
            numberElement.addEventListener('click', () => this.selectNumber(num, numberElement));
            this.numbersContainer.appendChild(numberElement);
        });
    }

    selectNumber(number, element) {
        if (this.isSpinning) return;
        // Entferne vorherige Auswahl
        const previousSelected = document.querySelector('.roulette-number.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
            previousSelected.style.backgroundColor = '';
        }
        // Markiere neue Auswahl und mache sie grün
        element.classList.add('selected');
        element.style.backgroundColor = '#00cc00';
        this.selectedNumber = number;
    }

    async spin() {
        if (this.isSpinning) return;
        const bet = parseInt(this.betInput.value);
        if (isNaN(bet) || bet < 1 || bet > this.credits) {
            this.showMessage('Ungültiger Einsatz!', false);
            return;
        }
        if (!this.selectedNumber) {
            this.showMessage('Bitte wählen Sie eine Zahl!', false);
            return;
        }
        this.isSpinning = true;
        this.spinButton.disabled = true;
        // Ziehe den Einsatz ab
        if (!sharedCredits.removeCredits(bet)) {
            this.showMessage('Nicht genug Credits!', false);
            this.isSpinning = false;
            this.spinButton.disabled = false;
            return;
        }
        this.credits = sharedCredits.getCredits();
        this.updateCredits();
        // Zufällige Anzahl von Umdrehungen (5-10)
        const rotations = 5 + Math.floor(Math.random() * 5);
        // Zufälliger Winkel für die letzte Position
        const finalAngle = Math.floor(Math.random() * 360);
        // Gesamtwinkel = bisheriger Winkel + neue Umdrehungen + finaler Winkel
        const spinAngle = rotations * 360 + finalAngle;
        this.currentAngle += spinAngle;
        // Setze die Transition auf sanftes Auslaufen
        this.wheel.style.transition = 'transform 5s cubic-bezier(0.25, 0.1, 0.25, 1)';
        // Drehe das Rad
        this.wheel.style.transform = `rotate(${this.currentAngle}deg)`;
        // Warte auf die Animation
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Berechne die gewinnende Zahl
        const winningNumber = this.calculateWinningNumber((this.currentAngle % 360));
        this.showResult(winningNumber, bet);
        this.isSpinning = false;
        this.spinButton.disabled = false;
    }

    calculateWinningNumber(finalAngle) {
        // Berechne die Position auf dem Rad (0-35, da 0 entfernt wurde)
        const position = Math.floor((finalAngle % 360) / (360 / 36));
        // 1:1 Zuordnung zu this.numbers
        return this.numbers[position];
    }

    showResult(winningNumber, bet) {
        if (winningNumber.number === this.selectedNumber.number) {
            const win = bet * 100;
            this.credits = sharedCredits.addCredits(win);
            this.showMessage(`Gewonnen! +${win} Credits!`, true);
        } else if (winningNumber.number === 0) {
            const win = bet * 1000;
            this.credits = sharedCredits.addCredits(win);
            this.showMessage(`JACKPOT! Die Kugel landete auf 0! +${win} Credits!`, true);
        } else {
            this.showMessage(`Verloren! Die Kugel landete auf ${winningNumber.number}`, false);
        }
        this.updateCredits();
    }

    updateCredits() {
        this.creditsDisplay.textContent = this.credits;
    }

    showMessage(msg, win) {
        this.messageBox.textContent = msg;
        this.messageBox.className = 'roulette-message ' + (win ? 'win' : 'lose');
    }
}

// Initialisiere das Roulette-Spiel, wenn die Seite geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new RouletteGame();
}); 