/**
 * Menu Class
 * 
 * Manages the main menu system and navigation.
 * Recreates the BWS start screen with modern, modular code.
 */
class Menu {
    constructor() {
        this.element = null;
        this.isVisible = false;
        this.currentScreen = 'main'; // 'main', 'options', 'credits'
        this.screens = {};
        this.backgroundSettings = {
            isGray: false,
            isYellowText: false
        };
    }

    init() {
        this.createElement();
        this.setupEventListeners();
        this.show();
        console.log('Menu initialized');
    }

    createElement() {
        // Create main menu container
        this.element = document.createElement('div');
        this.element.id = 'startScreen';
        this.element.className = 'start-screen';
        
        // Create main menu screen
        this.screens.main = this.createMainScreen();
        this.screens.options = this.createOptionsScreen();
        this.screens.credits = this.createCreditsScreen();
        
        // Add all screens to container
        Object.values(this.screens).forEach(screen => {
            this.element.appendChild(screen);
        });
        
        // Add to game container
        const gameContainer = document.getElementById('gameContainer');
        gameContainer.appendChild(this.element);
        
        // Show main screen initially
        this.showScreen('main');
    }

    createMainScreen() {
        const mainScreen = document.createElement('div');
        mainScreen.className = 'menu-screen main-menu';
        mainScreen.id = 'mainMenu';
        
        // Create title
        const title = document.createElement('div');
        title.className = 'start-title';
        title.textContent = 'BWS';
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        
        // Create buttons
        const buttons = [
            { id: 'startButton', text: 'Start Game', action: 'startGame' },
            { id: 'optionsButton', text: 'Options', action: 'showOptions' },
            { id: 'creditsButton', text: 'Credits', action: 'showCredits' }
        ];
        
        buttons.forEach(buttonData => {
            const button = document.createElement('button');
            button.id = buttonData.id;
            button.className = 'start-button';
            button.textContent = buttonData.text;
            button.dataset.action = buttonData.action;
            buttonContainer.appendChild(button);
        });
        
        mainScreen.appendChild(title);
        mainScreen.appendChild(buttonContainer);
        
        return mainScreen;
    }

    createOptionsScreen() {
        const optionsScreen = document.createElement('div');
        optionsScreen.className = 'menu-screen options-screen';
        optionsScreen.id = 'optionsScreen';
        optionsScreen.style.display = 'none';
        
        const optionsMenu = document.createElement('div');
        optionsMenu.className = 'options-menu';
        
        // Background color option
        const bgOption = document.createElement('div');
        bgOption.className = 'option-item';
        bgOption.innerHTML = `
            <span>Background Color:</span>
            <button class="option-button" data-action="toggleBackground">Toggle Gray</button>
        `;
        
        // Text color option
        const textOption = document.createElement('div');
        textOption.className = 'option-item';
        textOption.innerHTML = `
            <span>Text Color:</span>
            <button class="option-button" data-action="toggleTextColor">Toggle Yellow</button>
        `;
        
        // Back button
        const backButton = document.createElement('button');
        backButton.className = 'start-button back-button';
        backButton.textContent = 'Back';
        backButton.dataset.action = 'showMain';
        
        optionsMenu.appendChild(bgOption);
        optionsMenu.appendChild(textOption);
        optionsMenu.appendChild(backButton);
        
        optionsScreen.appendChild(optionsMenu);
        
        return optionsScreen;
    }

    createCreditsScreen() {
        const creditsScreen = document.createElement('div');
        creditsScreen.className = 'menu-screen credits-screen';
        creditsScreen.id = 'creditsScreen';
        creditsScreen.style.display = 'none';
        
        // Credits text container
        const creditsContainer = document.createElement('div');
        creditsContainer.className = 'credits-container';
        creditsContainer.id = 'creditsContainer';
        
        const creditsText = document.createElement('div');
        creditsText.className = 'credits-text';
        creditsText.style.position = 'absolute';
        creditsText.style.width = '100%';
        creditsText.style.textAlign = 'center';
        creditsText.style.color = '#fff';
        creditsText.style.fontSize = '24px';
        creditsText.style.top = '100vh';
        creditsText.innerHTML = `
            <div class="credits-line">Credits:</div>
            <br><br>
            <div class="credits-line">Game made by</div>
            <div class="credits-name">Noah</div>
            <br><br>
            <div class="credits-line">Inspired by</div>
            <div class="credits-name">Yuri</div>
            <br><br>
            <div class="credits-line">Many thanks to</div>
            <div class="credits-name">Christian</div>
            <div class="credits-name">Milo</div>
            <br><br>
            <div class="credits-line">Game made</div>
            <div class="credits-line">in 30 days</div>
            <div class="credits-line">in VSCode</div>
            <br><br><br><br>
        `;
        
        creditsContainer.appendChild(creditsText);
        
        // Back button
        const backButton = document.createElement('button');
        backButton.className = 'start-button back-button';
        backButton.textContent = 'Back';
        backButton.dataset.action = 'showMain';
        
        creditsScreen.appendChild(creditsContainer);
        creditsScreen.appendChild(backButton);
        
        return creditsScreen;
    }

    setupEventListeners() {
        // Event delegation for all menu buttons
        this.element.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action) {
                this.handleAction(action);
            }
        });
        
        // Click outside to go back from sub-screens
        this.screens.options.addEventListener('click', (e) => {
            if (e.target === this.screens.options) {
                this.showScreen('main');
            }
        });
        
        this.screens.credits.addEventListener('click', (e) => {
            if (e.target === this.screens.credits && !e.target.closest('.credits-container')) {
                this.showScreen('main');
            }
        });
    }

    handleAction(action) {
        switch (action) {
            case 'startGame':
                this.startGame();
                break;
            case 'showOptions':
                this.showScreen('options');
                break;
            case 'showCredits':
                this.showScreen('credits');
                this.startCredits();
                break;
            case 'showMain':
                this.showScreen('main');
                this.stopCredits();
                break;
            case 'toggleBackground':
                this.toggleBackground();
                break;
            case 'toggleTextColor':
                this.toggleTextColor();
                break;
        }
    }

    showScreen(screenName) {
        Object.keys(this.screens).forEach(name => {
            if (name === screenName) {
                this.screens[name].style.display = 'flex';
                this.screens[name].style.opacity = '0';
                setTimeout(() => {
                    this.screens[name].style.opacity = '1';
                }, 50);
            } else {
                this.screens[name].style.opacity = '0';
                setTimeout(() => {
                    this.screens[name].style.display = 'none';
                }, 500);
            }
        });
        this.currentScreen = screenName;
    }

    startGame() {
        console.log('Menu: Starting game...');
        
        // Fade out menu
        this.element.style.opacity = '0';
        this.element.style.transition = 'opacity 1s';
        
        setTimeout(() => {
            this.hide();
            // Trigger game start event using window event
            console.log('Menu: Dispatching startGame event');
            const event = new CustomEvent('startGame');
            window.dispatchEvent(event);
        }, 1000);
    }

    startCredits() {
        console.log('Starting credits...');
        const creditsContainer = document.getElementById('creditsContainer');
        const creditsText = creditsContainer.querySelector('.credits-text');
        
        console.log('Credits container:', creditsContainer);
        console.log('Credits text:', creditsText);
        
        // Show container immediately
        creditsContainer.style.opacity = '1';
        
        // Start animation after a brief delay
        setTimeout(() => {
            creditsText.style.animation = 'creditsScroll 30s linear infinite';
            console.log('Animation started');
        }, 500);
    }

    stopCredits() {
        console.log('Stopping credits...');
        const creditsContainer = document.getElementById('creditsContainer');
        
        if (creditsContainer) {
            const creditsText = creditsContainer.querySelector('.credits-text');
            
            // Stop animation and hide
            if (creditsText) {
                creditsText.style.animation = 'none';
            }
            creditsContainer.style.opacity = '0';
        }
    }

    toggleBackground() {
        this.backgroundSettings.isGray = !this.backgroundSettings.isGray;
        const color = this.backgroundSettings.isGray ? '#333' : '#000';
        document.body.style.backgroundColor = color;
        
        // Update all menu screens
        Object.values(this.screens).forEach(screen => {
            screen.style.backgroundColor = color;
        });
    }

    toggleTextColor() {
        this.backgroundSettings.isYellowText = !this.backgroundSettings.isYellowText;
        const color = this.backgroundSettings.isYellowText ? '#ffff00' : '#fff';
        
        const title = document.querySelector('.start-title');
        if (title) {
            title.style.color = color;
        }
    }

    show() {
        this.isVisible = true;
        if (this.element) {
            this.element.style.display = 'flex';
            this.element.style.opacity = '1';
        }
        console.log('Showing menu');
    }

    hide() {
        this.isVisible = false;
        if (this.element) {
            this.element.style.display = 'none';
        }
        console.log('Hiding menu');
    }

    destroy() {
        if (this.element) {
            this.element.remove();
        }
        console.log('Menu destroyed');
    }
}

window.Menu = Menu; 