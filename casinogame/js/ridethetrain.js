class RideTheTrain {
    constructor() {
        this.deck = [];
        this.currentLevel = 1;
        this.previousCards = [];
        this.score = 0;
        this.gameOver = false;
        this.credits = 100;
        this.multiplier = 1;
        this.betActive = false;
        this.initializeDeck();
    }

    initializeDeck() {
        const suits = ['karo', 'kreuz'];
        const values = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
        
        for (let suit of suits) {
            for (let value of values) {
                this.deck.push({ suit, value });
            }
        }
        this.shuffleDeck();
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    drawCard() {
        if (this.deck.length === 0) {
            this.gameOver = true;
            return null;
        }
        return this.deck.pop();
    }

    isRed(card) {
        return card.suit === 'karo';
    }

    isDiamondsOrClubs(card) {
        return card.suit === 'karo' || card.suit === 'kreuz';
    }

    getCardValue(card) {
        return parseInt(card.value, 10);
    }

    getCurrentMultiplier() {
        if (this.currentLevel === 1) return 1;
        if (this.currentLevel === 2) return 10;
        if (this.currentLevel === 3) return 100;
        if (this.currentLevel > 3) return 1000;
        return 1;
    }

    startGame() {
        if (this.credits < 1) return false;
        this.credits -= 1;
        this.currentLevel = 1;
        this.previousCards = [];
        this.score = 0;
        this.gameOver = false;
        this.multiplier = 1;
        this.betActive = true;
        this.deck = [];
        this.initializeDeck();
        return true;
    }

    checkGuess(guess, card) {
        if (!card) return false;

        switch (this.currentLevel) {
            case 1:
                return (guess === 'red' && this.isRed(card)) || 
                       (guess === 'black' && !this.isRed(card));
            
            case 2:
                return (guess === card.suit);
            
            case 3:
                if (this.previousCards.length < 2) return false;
                const cardValue = this.getCardValue(card);
                const minValue = Math.min(
                    this.getCardValue(this.previousCards[0]),
                    this.getCardValue(this.previousCards[1])
                );
                const maxValue = Math.max(
                    this.getCardValue(this.previousCards[0]),
                    this.getCardValue(this.previousCards[1])
                );
                return (guess === 'between' && cardValue > minValue && cardValue < maxValue) ||
                       (guess === 'outside' && (cardValue < minValue || cardValue > maxValue));
            
            default:
                return false;
        }
    }

    playRound(guess) {
        if (!this.betActive) return { success: false, message: "Bitte starte ein neues Spiel!" };
        const card = this.drawCard();
        if (!card) return { success: false, message: "Game Over - Keine Karten mehr!" };

        const isCorrect = this.checkGuess(guess, card);
        
        if (isCorrect) {
            this.score++;
            this.previousCards.push(card);
            
            if (this.currentLevel === 1) {
                this.currentLevel = 2;
                this.multiplier = 10;
            } else if (this.currentLevel === 2) {
                this.currentLevel = 3;
                this.multiplier = 100;
            } else if (this.currentLevel === 3) {
                this.currentLevel = 4;
                this.multiplier = 1000;
                this.credits += 1000; // Gewinn auszahlen
                this.betActive = false;
                this.gameOver = true;
                return {
                    success: true,
                    card,
                    message: `Gewonnen! Du erhältst ${this.multiplier} Credits!`,
                    multiplier: this.multiplier,
                    credits: this.credits,
                    score: this.score
                };
            }
            
            return {
                success: true,
                card,
                message: "Richtig! Nächstes Level.",
                multiplier: this.multiplier,
                credits: this.credits,
                score: this.score
            };
        } else {
            this.gameOver = true;
            this.betActive = false;
            return {
                success: false,
                card,
                message: "Game Over! Falsch geraten.",
                multiplier: this.multiplier,
                credits: this.credits,
                score: this.score
            };
        }
    }

    reset() {
        this.currentLevel = 1;
        this.previousCards = [];
        this.score = 0;
        this.gameOver = false;
        this.multiplier = 1;
        this.betActive = false;
        this.deck = [];
        this.initializeDeck();
    }
}

// Export the game class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RideTheTrain;
} 