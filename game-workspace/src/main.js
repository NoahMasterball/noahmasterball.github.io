/**
 * Main Game Entry Point
 * 
 * This file initializes the game and coordinates all the game systems.
 * It serves as the startup point and handles the overall game lifecycle.
 */

// Game instance holder
let gameInstance = null;

/**
 * Initialize the game when the DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialize the game
        initializeGame();
    } catch (error) {
        console.error('Failed to initialize game:', error);
        showErrorMessage('Failed to load the game. Please refresh the page.');
    }
});

/**
 * Main game initialization function
 */
function initializeGame() {
    console.log('Initializing Class-Based Game...');
    
    // Verify all required classes are loaded
    if (!verifyDependencies()) {
        throw new Error('Required game classes are not loaded');
    }
    
    // Initialize utility managers first
    const eventManager = new EventManager();
    const audioManager = new AudioManager();
    
    // Initialize core game systems
    const renderer = new Renderer();
    const collision = new Collision();
    
    // Initialize UI systems
    const menu = new Menu();
    const gameUI = new GameUI();
    const gameOver = new GameOver();
    const settings = new Settings();
    
    // Initialize level system
    const levelManager = new LevelManager();
    
    // Create main game instance
    gameInstance = new Game({
        eventManager,
        audioManager,
        renderer,
        collision,
        menu,
        gameUI,
        gameOver,
        settings,
        levelManager
    });
    
    console.log('Game initialized successfully!');
}

/**
 * Verify that all required classes are available
 */
function verifyDependencies() {
    const requiredClasses = [
        'EventManager',
        'AudioManager', 
        'Utils',
        'Renderer',
        'Collision',
        'Player',
        'Enemy',
        'Game',
        'Level',
        'Level1',
        'Level2',
        'LevelManager',
        'Menu',
        'GameUI',
        'GameOver',
        'Settings'
    ];
    
    for (const className of requiredClasses) {
        if (typeof window[className] === 'undefined') {
            console.error(`Required class ${className} is not loaded`);
            return false;
        }
    }
    
    return true;
}

/**
 * Show error message to user
 */
function showErrorMessage(message) {
    const container = document.getElementById('gameContainer');
    container.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            font-family: Arial, sans-serif;
            z-index: 9999;
        ">
            <h2>Game Error</h2>
            <p>${message}</p>
            <button onclick="location.reload()" style="
                background: white;
                color: red;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 10px;
            ">
                Reload Game
            </button>
        </div>
    `;
}

/**
 * Handle page unload - cleanup game resources
 */
window.addEventListener('beforeunload', () => {
    if (gameInstance) {
        gameInstance.destroy();
    }
});

/**
 * Handle window resize - adjust game display
 */
window.addEventListener('resize', () => {
    if (gameInstance && gameInstance.renderer) {
        gameInstance.renderer.handleResize();
    }
});

/**
 * Global error handler for unhandled errors
 */
window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error);
    if (gameInstance) {
        gameInstance.handleError(event.error);
    }
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initializeGame, gameInstance };
} 