class RouletteGame {
    constructor() {
        this.credits = sharedCredits.getCredits();
        this.bet = 10;
        this.selectedNumbers = new Set();
        // Europäisches Roulette Layout (0 oben, dann im Uhrzeigersinn)
        this.rouletteNumbers = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];
        this.rouletteColors = {
            0: 'green',
            32: 'red', 15: 'black', 19: 'red', 4: 'black', 21: 'red', 2: 'black', 25: 'red', 17: 'black', 34: 'red', 6: 'black',
            27: 'red', 13: 'black', 36: 'red', 11: 'black', 30: 'red', 8: 'black', 23: 'red', 10: 'black', 5: 'red', 24: 'black',
            16: 'red', 33: 'black', 1: 'red', 20: 'black', 14: 'red', 31: 'black', 9: 'red', 22: 'black', 18: 'red', 29: 'black',
            7: 'red', 28: 'black', 12: 'red', 35: 'black', 3: 'red', 26: 'black'
        };
        this.init();
    }

    init() {
        this.createBettingBoard();
        this.setupEventListeners();
        this.updateCreditsDisplay();
    }

    createBettingBoard() {
        const numbersContainer = document.querySelector('.roulette-numbers');
        if (!numbersContainer) return;
        numbersContainer.innerHTML = '';
        // Layout als Kreis (z.B. 6 Spalten, 7 Reihen)
        numbersContainer.style.display = 'grid';
        numbersContainer.style.gridTemplateColumns = 'repeat(6, 1fr)';
        numbersContainer.style.gap = '5px';
        // Zahlen in echter Reihenfolge
        this.rouletteNumbers.forEach(num => {
            const numberButton = document.createElement('button');
            numberButton.className = 'roulette-number';
            numberButton.textContent = num;
            numberButton.dataset.number = num;
            numberButton.classList.add(this.rouletteColors[num]);
            numbersContainer.appendChild(numberButton);
        });
    }

    setupEventListeners() {
        // Number selection
        const numberButtons = document.querySelectorAll('.roulette-number');
        numberButtons.forEach(button => {
            button.addEventListener('click', () => this.toggleNumberSelection(button));
        });

        // Bet input
        const betInput = document.getElementById('roulette-bet');
        if (betInput) {
            this.bet = parseInt(betInput.value) || 10;
            betInput.value = this.bet;
            betInput.onchange = () => {
                this.bet = parseInt(betInput.value) || 1;
                if (this.bet > this.credits) {
                    this.bet = this.credits;
                    betInput.value = this.bet;
                }
            };
        }

        // Spin button
        const spinButton = document.querySelector('.roulette-game .spin-button');
        if (spinButton) {
            spinButton.addEventListener('click', () => this.spin());
        }
    }

    toggleNumberSelection(button) {
        const number = parseInt(button.dataset.number);
        if (this.selectedNumbers.has(number)) {
            this.selectedNumbers.delete(number);
            button.classList.remove('selected');
        } else {
            if (this.selectedNumbers.size >= 3) {
                this.showMessage('Maximal 3 Zahlen auswählbar!', false);
                return;
            }
            this.selectedNumbers.add(number);
            button.classList.add('selected');
        }
    }

    updateCreditsDisplay() {
        const creditsDisplay = document.getElementById('roulette-credits');
        if (creditsDisplay) {
            creditsDisplay.textContent = this.credits;
        }
    }

    async spin() {
        if (this.selectedNumbers.size === 0) {
            this.showMessage('Bitte wählen Sie mindestens eine Zahl aus!', false);
            return;
        }
        const totalBet = this.bet * this.selectedNumbers.size;
        if (totalBet > this.credits) {
            this.showMessage('Nicht genug Credits für den Einsatz!', false);
            return;
        }
        // Remove credits
        this.credits = sharedCredits.removeCredits(totalBet) ? sharedCredits.getCredits() : this.credits;
        this.updateCreditsDisplay();
        // Generate winning number (0-36, echte Reihenfolge)
        const winningIndex = Math.floor(Math.random() * this.rouletteNumbers.length);
        const winningNumber = this.rouletteNumbers[winningIndex];
        // Animation: Rad dreht sich so, dass die gezogene Zahl oben landet
        await this.animateWheelToNumber(winningIndex);
        // Gewinnlogik
        if (winningNumber === 0) {
            const winAmount = this.bet * 1000;
            this.credits = sharedCredits.addCredits(winAmount);
            this.showMessage(`0 wurde gezogen! +${winAmount} Credits!`, true);
        } else if (this.selectedNumbers.has(winningNumber)) {
            const winAmount = this.bet * 100;
            this.credits = sharedCredits.addCredits(winAmount);
            this.showMessage(`Gewonnen! Die Zahl ${winningNumber} ist gefallen! +${winAmount} Credits!`, true);
        } else {
            this.showMessage(`Verloren! Die Zahl ${winningNumber} ist gefallen.`, false);
        }
        // Reset selection
        this.selectedNumbers.clear();
        document.querySelectorAll('.roulette-number').forEach(button => {
            button.classList.remove('selected');
        });
        this.updateCreditsDisplay();
    }

    async animateWheelToNumber(winningIndex) {
        const wheel = document.querySelector('.roulette-wheel');
        if (!wheel) return;
        const totalNumbers = this.rouletteNumbers.length;
        const anglePerNumber = 360 / totalNumbers;
        // Zielwinkel: Die gezogene Zahl soll oben stehen (0 Grad)
        // Wir drehen das Rad also so, dass die gezogene Zahl von ihrer aktuellen Position nach oben kommt
        // Wir machen mehrere volle Umdrehungen (z.B. 5) plus den nötigen Winkel
        const spins = 5;
        const targetAngle = 360 * spins - winningIndex * anglePerNumber;
        // Setze das aktuelle Transform zurück
        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(0deg)';
        // Erzwinge Reflow
        void wheel.offsetWidth;
        // Jetzt animieren
        wheel.style.transition = 'transform 3s cubic-bezier(.17,.67,.83,.67)';
        wheel.style.transform = `rotate(${targetAngle}deg)`;
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Nach der Animation: Fixiere das Rad auf die Endposition (damit weitere Spins korrekt starten)
        wheel.style.transition = 'none';
        wheel.style.transform = `rotate(${(-winningIndex * anglePerNumber) % 360}deg)`;
    }

    showMessage(msg, win) {
        const messageBox = document.querySelector('.roulette-message');
        if (messageBox) {
            messageBox.textContent = msg;
            messageBox.classList.remove('win', 'lose');
            if (win === true) messageBox.classList.add('win');
            if (win === false) messageBox.classList.add('lose');
        }
    }
}

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RouletteGame();
}); 