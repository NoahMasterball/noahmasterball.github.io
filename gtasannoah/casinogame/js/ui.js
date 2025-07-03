document.addEventListener('DOMContentLoaded', () => {
    const menuButtons = document.querySelectorAll('.menu-btn');
    const mainMenu = document.getElementById('main-menu');
    const contentArea = document.getElementById('content-area');
    const slotMachine = document.querySelector('.slot-machine');
    const gameSelection = document.querySelector('.game-selection');
    const gameOptions = document.querySelectorAll('.game-option');
    const backButtons = document.querySelectorAll('.back-button');
    const rouletteGame = document.querySelector('.roulette-game');

    // Hauptmenü Navigation
    menuButtons.forEach(button => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            
            // Verstecke alle Inhalte
            slotMachine.classList.remove('active');
            gameSelection.classList.remove('active');
            rouletteGame.style.display = 'none';
            
            // Zeige den entsprechenden Inhalt
            switch(section) {
                case 'play':
                    mainMenu.style.display = 'none';
                    gameSelection.classList.add('active');
                    break;
                case 'credits':
                    mainMenu.style.display = '';
                    contentArea.innerHTML = '<div class="info-section"><h2>Credits</h2><p>Sie starten mit 100 Credits.</p><p>Jeder Spin kostet 10 Credits.</p><p>Drei gleiche Symbole gewinnen 50 Credits!</p></div>';
                    break;
                case 'options':
                    mainMenu.style.display = '';
                    contentArea.innerHTML = '<div class="info-section"><h2>Optionen</h2><p>Hier können Sie bald Ihre Spieleinstellungen anpassen.</p></div>';
                    break;
            }
        });
    });

    // Spielauswahl
    gameOptions.forEach(option => {
        option.addEventListener('click', () => {
            const game = option.getAttribute('data-game');
            // Alle Spiele ausblenden
            slotMachine.classList.remove('active');
            gameSelection.classList.remove('active');
            document.querySelector('.blackjack-game').style.display = 'none';
            rouletteGame.style.display = 'none';
            
            switch(game) {
                case 'slots':
                    slotMachine.classList.add('active');
                    break;
                case 'blackjack':
                    document.querySelector('.blackjack-game').style.display = 'block';
                    break;
                case 'roulette':
                    rouletteGame.style.display = 'block';
                    break;
            }
        });
    });

    // Zurück-Buttons
    backButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.parentElement.classList.contains('slot-machine')) {
                // Zurück zur Spielauswahl
                slotMachine.classList.remove('active');
                gameSelection.classList.add('active');
            } else if (button.parentElement.classList.contains('game-selection')) {
                // Zurück zum Hauptmenü
                gameSelection.classList.remove('active');
                mainMenu.style.display = '';
            } else if (button.closest('.blackjack-game')) {
                // Zurück zur Spielauswahl von Blackjack
                document.querySelector('.blackjack-game').style.display = 'none';
                gameSelection.classList.add('active');
            } else if (button.closest('.roulette-game')) {
                // Zurück zur Spielauswahl von Roulette
                rouletteGame.style.display = 'none';
                gameSelection.classList.add('active');
            }
        });
    });

    // Initial: Nur Hauptmenü anzeigen
    mainMenu.style.display = '';
    gameSelection.classList.remove('active');
    slotMachine.classList.remove('active');
    rouletteGame.style.display = 'none';

    // Ride the Train Game UI
    let rideTheTrainGame = null;

    function initializeRideTheTrain() {
        if (!rideTheTrainGame) rideTheTrainGame = new RideTheTrain();
        rideTheTrainGame.startGame();
        document.getElementById('rtt-restart-button').disabled = true;
        updateRideTheTrainUI();
    }

    function updateRideTheTrainUI() {
        if (!rideTheTrainGame) return;
        document.getElementById('ridethetrain-credits').textContent = rideTheTrainGame.credits;
        document.getElementById('ridethetrain-multiplier').textContent = 'x' + rideTheTrainGame.multiplier;
        document.getElementById('ridethetrain-score').textContent = rideTheTrainGame.score;

        // Kartenanzeige anpassen
        const cardsContainer = document.querySelector('.ridethetrain-cards');
        cardsContainer.innerHTML = '';

        // Level 1: nur Rückseite
        if (rideTheTrainGame.currentLevel === 1) {
            const backImg = document.createElement('img');
            backImg.src = 'Bilder/Karten/rueckseite.png';
            backImg.alt = 'Rückseite';
            cardsContainer.appendChild(backImg);
        }
        // Level 2: gezogene Karte + Rückseite
        else if (rideTheTrainGame.currentLevel === 2) {
            // Erste gezogene Karte
            if (rideTheTrainGame.previousCards.length > 0) {
                const card = rideTheTrainGame.previousCards[0];
                const cardImg = document.createElement('img');
                cardImg.src = `Bilder/Karten/${card.suit}${card.value}.png`;
                cardImg.alt = `${card.suit} ${card.value}`;
                cardsContainer.appendChild(cardImg);
            }
            // Rückseite für die zweite Karte
            const backImg = document.createElement('img');
            backImg.src = 'Bilder/Karten/rueckseite.png';
            backImg.alt = 'Rückseite';
            cardsContainer.appendChild(backImg);
        }
        // Level 3: zwei gezogene Karten + Rückseite
        else if (rideTheTrainGame.currentLevel === 3) {
            // Zwei gezogene Karten
            for (let i = 0; i < 2; i++) {
                if (rideTheTrainGame.previousCards[i]) {
                    const card = rideTheTrainGame.previousCards[i];
                    const cardImg = document.createElement('img');
                    cardImg.src = `Bilder/Karten/${card.suit}${card.value}.png`;
                    cardImg.alt = `${card.suit} ${card.value}`;
                    cardsContainer.appendChild(cardImg);
                }
            }
            // Rückseite für die dritte Karte
            const backImg = document.createElement('img');
            backImg.src = 'Bilder/Karten/rueckseite.png';
            backImg.alt = 'Rückseite';
            cardsContainer.appendChild(backImg);
        }

        // Buttons für die Levels korrekt anzeigen
        document.querySelector('.level-1-controls').style.display = 
            rideTheTrainGame.currentLevel === 1 ? 'block' : 'none';
        document.querySelector('.level-2-controls').style.display = 
            rideTheTrainGame.currentLevel === 2 ? 'block' : 'none';
        document.querySelector('.level-3-controls').style.display = 
            rideTheTrainGame.currentLevel === 3 ? 'block' : 'none';

        // Exit-Button nur anzeigen, wenn Gewinn möglich ist (ab Level 2)
        const exitBtn = document.querySelector('.exit-button');
        if (rideTheTrainGame.currentLevel >= 2 && !rideTheTrainGame.gameOver && rideTheTrainGame.betActive) {
            exitBtn.style.display = 'block';
        } else {
            exitBtn.style.display = 'none';
        }
    }

    function handleRideTheTrainGuess(guess) {
        if (!rideTheTrainGame || rideTheTrainGame.gameOver) return;
    
        const messageElement = document.querySelector('.ridethetrain-message');
        messageElement.textContent = '';
    
        // Karte ziehen und Resultat holen
        const result = rideTheTrainGame.playRound(guess);
    
        // Karte sofort aufdecken
        const cardsContainer = document.querySelector('.ridethetrain-cards');
        const backImg = cardsContainer.querySelector('img[src="Bilder/Karten/rueckseite.png"]');
        if (backImg && result.card) {
            backImg.src = `Bilder/Karten/${result.card.suit}${result.card.value}.png`;
            backImg.alt = `${result.card.suit} ${result.card.value}`;
        }
    
        // Resultat anzeigen
        if (result.success) {
            messageElement.textContent = result.message;
            messageElement.style.color = '#4CAF50';
    
            // Nach kurzer Pause zum nächsten Level übergehen
            setTimeout(() => {
                updateRideTheTrainUI();
            }, 1500);
    
        } else {
            messageElement.textContent = result.message;
            messageElement.style.color = '#ff4444';
        }
    
        // Game Over Handling
        if (rideTheTrainGame.gameOver) {
            const exitBtn = document.querySelector('.exit-button');
            exitBtn.style.display = 'none';
            document.getElementById('rtt-restart-button').disabled = false;
        }
    }

    // Ride the Train game buttons
    document.querySelector('.red-button')?.addEventListener('click', () => handleRideTheTrainGuess('red'));
    document.querySelector('.black-button')?.addEventListener('click', () => handleRideTheTrainGuess('black'));
    document.querySelector('.diamonds-clubs-button')?.addEventListener('click', () => handleRideTheTrainGuess('diamondsOrClubs'));
    document.querySelector('.hearts-spades-button')?.addEventListener('click', () => handleRideTheTrainGuess('heartsOrSpades'));
    document.querySelector('.between-button')?.addEventListener('click', () => handleRideTheTrainGuess('between'));
    document.querySelector('.outside-button')?.addEventListener('click', () => handleRideTheTrainGuess('outside'));
    document.querySelector('.karo-button')?.addEventListener('click', () => handleRideTheTrainGuess('karo'));
    document.querySelector('.kreuz-button')?.addEventListener('click', () => handleRideTheTrainGuess('kreuz'));

    document.getElementById('rtt-restart-button')?.addEventListener('click', () => {
        if (rideTheTrainGame) {
            rideTheTrainGame.startGame();
            updateRideTheTrainUI();
            document.querySelector('.ridethetrain-message').textContent = '';
            document.getElementById('rtt-restart-button').disabled = true;
        }
    });

    // Initialize Ride the Train game when selected
    document.querySelector('[data-game="ridethetrain"]')?.addEventListener('click', () => {
        document.querySelector('.game-selection').style.display = 'none';
        document.querySelector('.ridethetrain-game').style.display = 'block';
        initializeRideTheTrain();
    });

    document.querySelector('.exit-button')?.addEventListener('click', () => {
        if (!rideTheTrainGame || rideTheTrainGame.gameOver || !rideTheTrainGame.betActive) return;
        // Gewinn berechnen
        let gewinn = rideTheTrainGame.multiplier;
        rideTheTrainGame.credits += gewinn;
        rideTheTrainGame.betActive = false;
        rideTheTrainGame.gameOver = true;
        updateRideTheTrainUI();
        const messageElement = document.querySelector('.ridethetrain-message');
        messageElement.textContent = `Du bist ausgestiegen und erhältst ${gewinn} Credits!`;
        messageElement.style.color = '#4CAF50';
    });
}); 