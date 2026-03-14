class BlackjackGame {
    constructor() {
        this.deck = [];
        this.playerCards = [];
        this.opponentCards = [];
        this.playerPoints = 0;
        this.opponentPoints = 0;
        this.hitCount = 0;
        this.maxHits = 2;
        this.credits = sharedCredits.getCredits();
        this.bet = 10;
        this.betPaid = false;
        this.init();
    }

    init() {
        // Einsatz und Credits initialisieren
        const betInput = document.getElementById('blackjack-bet');
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
        this.updateCreditsDisplay();
        this.createDeck();
        this.shuffleDeck();
        this.playerCards = [this.drawCard(), this.drawCard()];
        this.opponentCards = [this.drawCard(), this.drawCard()];
        this.hitCount = 0;
        this.betPaid = false;
        this.updateUI();
        this.setButtonStates();
        this.addEventListeners();
    }

    updateCreditsDisplay() {
        const creditsDisplay = document.querySelector('.blackjack-credits-display');
        if (creditsDisplay) {
            creditsDisplay.textContent = `Credits: ${this.credits}`;
        }
    }

    disableGame() {
        document.querySelector('.hit-button').disabled = true;
        document.querySelector('.stand-button').disabled = true;
    }

    createDeck() {
        const suits = ['karo', 'kreuz']; // nur diese Farben laut deiner Karten
        const values = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
        this.deck = [];
        for (const suit of suits) {
            for (const value of values) {
                this.deck.push({ suit, value });
            }
        }
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    drawCard() {
        return this.deck.pop();
    }

    cardToFilename(card) {
        return `Bilder/karten/${card.suit}${card.value}.png`;
    }

    cardValue(card) {
        return parseInt(card.value);
    }

    calcPoints(cards) {
        return cards.reduce((sum, card) => sum + this.cardValue(card), 0);
    }

    updateUI() {
        // Spieler-Karten
        const playerImgs = document.querySelectorAll('.player-card');
        this.playerCards.forEach((card, i) => {
            if (playerImgs[i]) {
                playerImgs[i].src = this.cardToFilename(card);
                playerImgs[i].style.display = '';
            }
        });
        for (let i = this.playerCards.length; i < playerImgs.length; i++) {
            playerImgs[i].style.display = 'none';
        }
        // Gegner-Karten
        const oppImgs = document.querySelectorAll('.opponent-card');
        if (oppImgs[0]) {
            oppImgs[0].src = this.cardToFilename(this.opponentCards[0]);
            oppImgs[0].style.display = '';
        }
        if (oppImgs[1]) {
            oppImgs[1].src = 'Bilder/karten/rueckseite.png';
            oppImgs[1].style.display = '';
        }
        for (let i = 2; i < oppImgs.length; i++) {
            oppImgs[i].style.display = 'none';
        }
        // Punkte
        this.playerPoints = this.calcPoints(this.playerCards);
        document.querySelector('.player-points').textContent = this.playerPoints;
        // Message leeren
        document.querySelector('.blackjack-message').textContent = '';
    }

    setButtonStates() {
        const hitBtn = document.querySelector('.hit-button');
        hitBtn.disabled = this.hitCount >= this.maxHits;
    }

    addEventListeners() {
        document.querySelector('.hit-button').onclick = () => this.hit();
        document.querySelector('.stand-button').onclick = async () => await this.stand();
    }

    payBetIfNeeded() {
        if (!this.betPaid) {
            if (!sharedCredits.removeCredits(this.bet)) {
                this.showMessage('Nicht genug Credits für den Einsatz!', false);
                this.disableGame();
                return false;
            }
            this.credits = sharedCredits.getCredits();
            this.updateCreditsDisplay();
            this.betPaid = true;
        }
        return true;
    }

    hit() {
        if (!this.payBetIfNeeded()) return;
        if (this.hitCount < this.maxHits) {
            this.playerCards.push(this.drawCard());
            this.hitCount++;
            this.updateUI();
            this.setButtonStates();
            if (this.playerCards.length >= 4) {
                document.querySelector('.hit-button').disabled = true;
            }
        }
    }

    async stand() {
        if (!this.payBetIfNeeded()) return;
        // Gegner zieht nur, solange er weniger Punkte als der Spieler hat und max. 4 Karten
        let maxCards = Math.min(this.playerCards.length + 1, 4);
        this.updateOpponentUI(); // Zeige erste beiden Karten
        while (
            this.opponentCards.length < maxCards &&
            this.calcPoints(this.opponentCards) < this.calcPoints(this.playerCards)
        ) {
            this.opponentCards.push(this.drawCard());
            this.updateOpponentUI();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // Punkte berechnen
        this.opponentPoints = this.calcPoints(this.opponentCards);
        // Gewinner ermitteln
        this.showResult();
        // Buttons deaktivieren
        document.querySelector('.hit-button').disabled = true;
        document.querySelector('.stand-button').disabled = true;
    }

    updateOpponentUI() {
        // Zeige alle Gegnerkarten (keine Rückseite mehr beim Stand)
        const oppImgs = document.querySelectorAll('.opponent-card');
        this.opponentCards.forEach((card, i) => {
            if (oppImgs[i]) {
                oppImgs[i].src = this.cardToFilename(card);
                oppImgs[i].style.display = '';
            }
        });
        for (let i = this.opponentCards.length; i < oppImgs.length; i++) {
            oppImgs[i].style.display = 'none';
        }
    }

    showResult() {
        this.playerPoints = this.calcPoints(this.playerCards);
        this.opponentPoints = this.calcPoints(this.opponentCards);
        let msg = '';
        if (this.playerPoints > 21) {
            msg = 'Du hast über 21. Gegner gewinnt!';
            // Einsatz bleibt verloren
        } else if (this.opponentPoints > 21) {
            msg = 'Gegner hat über 21. Du gewinnst!';
            this.credits = sharedCredits.addCredits(this.bet * 2);
        } else if (this.playerPoints > this.opponentPoints) {
            msg = 'Du gewinnst!';
            this.credits = sharedCredits.addCredits(this.bet * 2);
        } else if (this.playerPoints < this.opponentPoints) {
            msg = 'Gegner gewinnt!';
            // Einsatz bleibt verloren
        } else {
            msg = 'Unentschieden! Einsatz zurück.';
            this.credits = sharedCredits.addCredits(this.bet);
        }
        this.updateCreditsDisplay();
        document.querySelector('.blackjack-message').textContent = msg;
    }
}

// Initialisierung, wenn Blackjack angezeigt wird
function startBlackjack() {
    // Wenn schon ein Spiel läuft, Credits übernehmen
    const existingCredits = window.blackjackGame ? window.blackjackGame.credits : undefined;
    window.blackjackGame = new BlackjackGame(existingCredits);
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.game-option[data-game="blackjack"]').addEventListener('click', startBlackjack);
    document.querySelectorAll('.back-button').forEach(btn => {
        btn.addEventListener('click', () => {
            if (document.querySelector('.blackjack-game').style.display === 'block') {
                document.querySelector('.blackjack-game').style.display = 'none';
            }
        });
    });
    // Erneut spielen Button
    document.querySelector('.restart-button').addEventListener('click', () => {
        if (document.querySelector('.blackjack-game').style.display === 'block') {
            // Buttons wieder aktivieren
            document.querySelector('.hit-button').disabled = false;
            document.querySelector('.stand-button').disabled = false;
            // Credits übernehmen
            const existingCredits = window.blackjackGame ? window.blackjackGame.credits : undefined;
            window.blackjackGame = new BlackjackGame(existingCredits);
        }
    });
}); 