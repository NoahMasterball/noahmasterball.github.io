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

// Shared credits system
const sharedCredits = {
    getCredits: () => {
        const credits = localStorage.getItem('casinoCredits');
        return credits ? parseInt(credits) : 100; // Default to 100 if no credits exist
    },
    setCredits: (amount) => {
        localStorage.setItem('casinoCredits', amount.toString());
    },
    addCredits: (amount) => {
        const currentCredits = sharedCredits.getCredits();
        sharedCredits.setCredits(currentCredits + amount);
        return currentCredits + amount;
    },
    removeCredits: (amount) => {
        const currentCredits = sharedCredits.getCredits();
        if (currentCredits >= amount) {
            sharedCredits.setCredits(currentCredits - amount);
            return true;
        }
        return false;
    }
};

class SlotMachine {
    constructor() {
        // Increased frequency of high-value symbols
        this.symbols = ['🍒', '🍇', '🍌', '🍊', '🍋', '💎', '7️⃣', '💎', '7️⃣', '💎'];
        this.fruits = ['🍒', '🍇', '🍌', '🍊', '🍋'];
        this.reels = document.querySelectorAll('.slot-reel');
        this.spinButton = document.querySelector('.spin-button');
        this.creditsDisplay = document.querySelector('.credits-display');
        this.betInput = document.getElementById('bet-amount');
        this.messageBox = document.getElementById('slot-message');
        this.credits = sharedCredits.getCredits();
        this.isSpinning = false;
        
        // Initialize sound effects
        this.sounds = {
            spin: new Audio('sounds/spin.mp3'),
            winSmall: new Audio('sounds/win-small.mp3'),
            winMedium: new Audio('sounds/win-medium.mp3'),
            winBig: new Audio('sounds/win-big.mp3'),
            jackpot: new Audio('sounds/jackpot.mp3')
        };
        
        this.initializeGame();
    }

    initializeGame() {
        this.reels.forEach(reel => {
            reel.textContent = this.getRandomSymbol();
        });
        this.spinButton.addEventListener('click', () => this.spin());
        this.updateCredits();
        this.showMessage('');
    }

    getRandomSymbol() {
        return this.symbols[Math.floor(Math.random() * this.symbols.length)];
    }

    async spin() {
        const bet = parseInt(this.betInput.value);
        if (this.isSpinning || isNaN(bet) || bet < 1 || bet > this.credits) return;
        this.isSpinning = true;
        
        if (!sharedCredits.removeCredits(bet)) {
            this.showMessage('Nicht genug Credits!', false);
            this.isSpinning = false;
            return;
        }
        
        this.credits = sharedCredits.getCredits();
        this.updateCredits();
        this.spinButton.disabled = true;
        this.showMessage('');
        
        // Play spin sound
        this.sounds.spin.play();
        
        for (let i = 0; i < this.reels.length; i++) {
            this.reels[i].classList.add('spinning');
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.reels[i].classList.remove('spinning');
            this.reels[i].textContent = this.getRandomSymbol();
        }
        this.checkWin(bet);
        this.isSpinning = false;
        this.spinButton.disabled = false;
    }

    checkWin(bet) {
        const symbols = Array.from(this.reels).map(reel => reel.textContent);
        
        // Drei gleiche
        if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
            if (symbols[0] === '7️⃣') {
                const win = bet * 50;
                this.credits = sharedCredits.addCredits(win);
                this.updateCredits();
                this.showWinAnimation();
                this.showMessage(`777! +${win} Credits!`, true);
                this.sounds.jackpot.play();
            } else if (symbols[0] === '💎') {
                const win = bet * 15;
                this.credits = sharedCredits.addCredits(win);
                this.updateCredits();
                this.showWinAnimation();
                this.showMessage(`JACKPOT! 💎💎💎 +${win} Credits!`, true);
                this.sounds.winBig.play();
            } else if (this.fruits.includes(symbols[0])) {
                const win = bet * 5;
                this.credits = sharedCredits.addCredits(win);
                this.updateCredits();
                this.showWinAnimation();
                this.showMessage(`Drei gleiche Früchte! +${win} Credits!`, true);
                this.sounds.winMedium.play();
            } else {
                const win = bet * 8;
                this.credits = sharedCredits.addCredits(win);
                this.updateCredits();
                this.showWinAnimation();
                this.showMessage(`Drei gleiche Symbole! +${win} Credits!`, true);
                this.sounds.winMedium.play();
            }
            return;
        }

        // Drei verschiedene Früchte
        if (this.fruits.includes(symbols[0]) && this.fruits.includes(symbols[1]) && this.fruits.includes(symbols[2])) {
            const unique = new Set(symbols);
            if (unique.size === 3) {
                const win = bet * 4;
                this.credits = sharedCredits.addCredits(win);
                this.updateCredits();
                this.showWinAnimation();
                this.showMessage(`Drei verschiedene Früchte! +${win} Credits!`, true);
                this.sounds.winMedium.play();
                return;
            }
        }

        // Kein Gewinn
        this.showMessage('Leider kein Gewinn!', false);
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

    showMessage(msg, win) {
        if (!this.messageBox) return;
        this.messageBox.textContent = msg;
        this.messageBox.classList.remove('win', 'lose');
        if (win === true) this.messageBox.classList.add('win');
        if (win === false) this.messageBox.classList.add('lose');
    }
}

// Initialisiere das Spiel, wenn die Seite geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new SlotMachine();
}); 