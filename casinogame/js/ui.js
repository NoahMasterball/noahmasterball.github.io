document.addEventListener('DOMContentLoaded', () => {
    const menuButtons = document.querySelectorAll('.menu-btn');
    const mainMenu = document.getElementById('main-menu');
    const contentArea = document.getElementById('content-area');
    const slotMachine = document.querySelector('.slot-machine');
    const gameSelection = document.querySelector('.game-selection');
    const gameOptions = document.querySelectorAll('.game-option');
    const backButtons = document.querySelectorAll('.back-button');

    // Hauptmenü Navigation
    menuButtons.forEach(button => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            
            // Verstecke alle Inhalte
            slotMachine.classList.remove('active');
            gameSelection.classList.remove('active');
            
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
            
            switch(game) {
                case 'slots':
                    gameSelection.classList.remove('active');
                    slotMachine.classList.add('active');
                    break;
                case 'blackjack':
                    contentArea.innerHTML = '<div class="info-section"><h2>Blackjack</h2><p>Blackjack wird bald verfügbar sein!</p></div>';
                    break;
                case 'roulette':
                    contentArea.innerHTML = '<div class="info-section"><h2>Roulette</h2><p>Roulette wird bald verfügbar sein!</p></div>';
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
            }
        });
    });

    // Initial: Nur Hauptmenü anzeigen
    mainMenu.style.display = '';
    gameSelection.classList.remove('active');
    slotMachine.classList.remove('active');
}); 