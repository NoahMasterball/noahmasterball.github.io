// Hilfsfunktionen für das Casino-Spiel

const utils = {
    // Generiert eine zufällige Zahl zwischen min und max (inklusive)
    getRandomNumber: (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // Formatiert einen Geldbetrag
    formatMoney: (amount) => {
        return amount.toFixed(2) + '€';
    },

    // Aktualisiert den Balance-Anzeige
    updateBalance: (amount) => {
        const balanceElement = document.getElementById('balance');
        if (balanceElement) {
            balanceElement.textContent = utils.formatMoney(amount);
        }
    },

    // Erstellt eine Animation
    animate: (element, animation, duration = 1000) => {
        element.style.animation = `${animation} ${duration}ms`;
        return new Promise(resolve => setTimeout(resolve, duration));
    },

    // Überprüft ob ein Spieler genug Geld hat
    hasEnoughMoney: (amount, balance) => {
        return balance >= amount;
    },

    // Speichert den aktuellen Spielstand
    saveGameState: (state) => {
        localStorage.setItem('casinoGameState', JSON.stringify(state));
    },

    // Lädt den gespeicherten Spielstand
    loadGameState: () => {
        const savedState = localStorage.getItem('casinoGameState');
        return savedState ? JSON.parse(savedState) : null;
    }
}; 