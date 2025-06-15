// Hauptspiellogik

const game = {
    // Spieler-Daten
    player: {
        balance: 1000,
        currentBet: 0
    },

    // Initialisiert das Slots-Spiel
    initSlots: () => {
        const slotsHTML = `
            <div class="slots-game">
                <h2>Slots</h2>
                <div class="slots-reel">
                    <div class="slot" id="slot1">🍒</div>
                    <div class="slot" id="slot2">🍊</div>
                    <div class="slot" id="slot3">🍋</div>
                </div>
                <div class="bet-controls">
                    <input type="number" id="bet-amount" min="1" max="100" value="10">
                    <button id="spin-button">Drehen</button>
                </div>
            </div>
        `;
        ui.updateGameArea(slotsHTML);
        game.setupSlotsEvents();
    },

    // Initialisiert das Blackjack-Spiel
    initBlackjack: () => {
        const blackjackHTML = `
            <div class="blackjack-game">
                <h2>Blackjack</h2>
                <div class="dealer-hand"></div>
                <div class="player-hand"></div>
                <div class="blackjack-controls">
                    <button id="hit-button">Hit</button>
                    <button id="stand-button">Stand</button>
                    <button id="double-button">Double</button>
                </div>
            </div>
        `;
        ui.updateGameArea(blackjackHTML);
        game.setupBlackjackEvents();
    },

    // Initialisiert das Roulette-Spiel
    initRoulette: () => {
        const rouletteHTML = `
            <div class="roulette-game">
                <h2>Roulette</h2>
                <div class="roulette-wheel"></div>
                <div class="betting-table">
                    <div class="number-grid"></div>
                    <div class="bet-controls">
                        <input type="number" id="roulette-bet" min="1" max="100" value="10">
                        <button id="place-bet">Wette platzieren</button>
                    </div>
                </div>
            </div>
        `;
        ui.updateGameArea(rouletteHTML);
        game.setupRouletteEvents();
    },

    // Event-Handler für Slots
    setupSlotsEvents: () => {
        const spinButton = document.getElementById('spin-button');
        if (spinButton) {
            spinButton.addEventListener('click', game.spinSlots);
        }
    },

    // Event-Handler für Blackjack
    setupBlackjackEvents: () => {
        const hitButton = document.getElementById('hit-button');
        const standButton = document.getElementById('stand-button');
        const doubleButton = document.getElementById('double-button');

        if (hitButton) hitButton.addEventListener('click', game.hit);
        if (standButton) standButton.addEventListener('click', game.stand);
        if (doubleButton) doubleButton.addEventListener('click', game.double);
    },

    // Event-Handler für Roulette
    setupRouletteEvents: () => {
        const placeBetButton = document.getElementById('place-bet');
        if (placeBetButton) {
            placeBetButton.addEventListener('click', game.placeRouletteBet);
        }
    },

    // Slots-Spiellogik
    spinSlots: () => {
        const betAmount = parseInt(document.getElementById('bet-amount').value);
        if (!utils.hasEnoughMoney(betAmount, game.player.balance)) {
            ui.showMessage('Nicht genug Geld!', 'error');
            return;
        }

        game.player.balance -= betAmount;
        utils.updateBalance(game.player.balance);

        // Simuliere Slots-Drehung
        const symbols = ['🍒', '🍊', '🍋', '🍇', '💎', '7️⃣'];
        const slots = document.querySelectorAll('.slot');
        
        slots.forEach(slot => {
            const randomSymbol = symbols[utils.getRandomNumber(0, symbols.length - 1)];
            slot.textContent = randomSymbol;
        });

        // Überprüfe Gewinn
        if (slots[0].textContent === slots[1].textContent && 
            slots[1].textContent === slots[2].textContent) {
            const winAmount = betAmount * 3;
            game.player.balance += winAmount;
            utils.updateBalance(game.player.balance);
            ui.showMessage(`Gewonnen! +${utils.formatMoney(winAmount)}`, 'success');
        }
    },

    // Blackjack-Spiellogik
    hit: () => {
        // Implementierung folgt
        ui.showMessage('Hit-Funktion wird implementiert...', 'info');
    },

    stand: () => {
        // Implementierung folgt
        ui.showMessage('Stand-Funktion wird implementiert...', 'info');
    },

    double: () => {
        // Implementierung folgt
        ui.showMessage('Double-Funktion wird implementiert...', 'info');
    },

    // Roulette-Spiellogik
    placeRouletteBet: () => {
        // Implementierung folgt
        ui.showMessage('Roulette-Wette wird implementiert...', 'info');
    }
};

class SlotMachine {
    constructor() {
        this.symbols = ['🍒', '🍊', '🍋', '🍇', '💎', '7️⃣'];
        this.reels = document.querySelectorAll('.slot-reel');
        this.spinButton = document.querySelector('.spin-button');
        this.creditsDisplay = document.querySelector('.credits-display');
        this.credits = 100;
        this.isSpinning = false;
        
        this.initializeGame();
    }

    initializeGame() {
        // Initialisiere die Walzen mit zufälligen Symbolen
        this.reels.forEach(reel => {
            reel.textContent = this.getRandomSymbol();
        });

        // Event Listener für den Spin-Button
        this.spinButton.addEventListener('click', () => this.spin());
        
        // Aktualisiere Credits-Anzeige
        this.updateCredits();
    }

    getRandomSymbol() {
        return this.symbols[Math.floor(Math.random() * this.symbols.length)];
    }

    async spin() {
        if (this.isSpinning || this.credits < 10) return;
        
        this.isSpinning = true;
        this.credits -= 10;
        this.updateCredits();
        this.spinButton.disabled = true;

        // Drehe jede Walze nacheinander
        for (let i = 0; i < this.reels.length; i++) {
            this.reels[i].classList.add('spinning');
            // Warte 1 Sekunde pro Walze
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.reels[i].classList.remove('spinning');
            this.reels[i].textContent = this.getRandomSymbol();
        }

        // Prüfe auf Gewinn
        this.checkWin();

        this.isSpinning = false;
        this.spinButton.disabled = false;
    }

    checkWin() {
        const symbols = Array.from(this.reels).map(reel => reel.textContent);
        const firstSymbol = symbols[0];
        const isWin = symbols.every(symbol => symbol === firstSymbol);

        if (isWin) {
            this.credits += 50;
            this.updateCredits();
            this.showWinAnimation();
        }
    }

    showWinAnimation() {
        this.reels.forEach(reel => {
            reel.classList.add('win-animation');
            setTimeout(() => {
                reel.classList.remove('win-animation');
            }, 1000);
        });
    }

    updateCredits() {
        this.creditsDisplay.textContent = `Credits: ${this.credits}`;
    }
}

// Initialisiere das Spiel, wenn die Seite geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new SlotMachine();
}); 