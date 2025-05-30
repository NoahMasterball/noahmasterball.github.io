/**
 * Game Class
 * 
 * Main game controller that manages the overall game state and coordinates
 * all game systems. This is the central hub for the entire game.
 */
class Game {
    constructor(dependencies) {
        // Store dependency references
        this.eventManager = dependencies.eventManager;
        this.audioManager = dependencies.audioManager;
        this.renderer = dependencies.renderer;
        this.collision = dependencies.collision;
        this.menu = dependencies.menu;
        this.gameUI = dependencies.gameUI;
        this.gameOver = dependencies.gameOver;
        this.settings = dependencies.settings;
        this.levelManager = dependencies.levelManager;
        
        // Game state
        this.state = 'MENU'; // MENU, PLAYING, PAUSED, GAME_OVER
        this.isRunning = false;
        this.score = 0;
        this.startTime = null;
        this.player = null;
        this.currentLevel = null;
        
        // Game loop
        this.lastTime = 0;
        this.animationFrameId = null;
        
        this.init();
    }

    /**
     * Initialize the game
     */
    init() {
        console.log('Initializing Game...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize systems
        this.renderer.init(document.getElementById('gameContainer'));
        this.menu.init();
        this.gameUI.init();
        this.gameOver.init();
        this.settings.init();
        
        // Show main menu
        this.showMenu();
        
        console.log('Game initialized successfully');
    }

    /**
     * Set up event listeners for game events
     */
    setupEventListeners() {
        // Menu events
        this.eventManager.on('startGame', this.startGame, this);
        this.eventManager.on('showSettings', this.showSettings, this);
        this.eventManager.on('showMenu', this.showMenu, this);
        
        // Game events
        this.eventManager.on('pauseGame', this.pauseGame, this);
        this.eventManager.on('resumeGame', this.resumeGame, this);
        this.eventManager.on('endGame', this.endGame, this);
        this.eventManager.on('restartGame', this.restartGame, this);
        
        // Level events
        this.eventManager.on('levelComplete', this.onLevelComplete, this);
        this.eventManager.on('playerDied', this.onPlayerDied, this);
        
        // Settings events
        this.eventManager.on('settingsChanged', this.onSettingsChanged, this);
    }

    /**
     * Start a new game
     */
    startGame() {
        console.log('Starting new game...');
        
        this.state = 'PLAYING';
        this.isRunning = true;
        this.score = 0;
        this.startTime = performance.now();
        
        // Hide menu, show game UI
        this.menu.hide();
        this.gameUI.show();
        
        // Create player
        this.player = new Player({
            eventManager: this.eventManager,
            renderer: this.renderer
        });
        
        // Load first level
        this.levelManager.loadLevel(1);
        this.currentLevel = this.levelManager.getCurrentLevel();
        
        // Start game loop
        this.startGameLoop();
        
        this.eventManager.emit('gameStarted');
    }

    /**
     * Show main menu
     */
    showMenu() {
        this.state = 'MENU';
        this.stopGameLoop();
        
        this.menu.show();
        this.gameUI.hide();
        this.gameOver.hide();
        this.settings.hide();
    }

    /**
     * Show settings screen
     */
    showSettings() {
        this.settings.show();
    }

    /**
     * Pause the game
     */
    pauseGame() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            this.isRunning = false;
            this.stopGameLoop();
            console.log('Game paused');
        }
    }

    /**
     * Resume the game
     */
    resumeGame() {
        if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            this.isRunning = true;
            this.startGameLoop();
            console.log('Game resumed');
        }
    }

    /**
     * End the game
     */
    endGame() {
        console.log('Game ended');
        
        this.state = 'GAME_OVER';
        this.isRunning = false;
        this.stopGameLoop();
        
        // Show game over screen
        this.gameUI.hide();
        this.gameOver.show({
            score: this.score,
            time: this.getGameTime()
        });
        
        this.eventManager.emit('gameEnded', {
            score: this.score,
            time: this.getGameTime()
        });
    }

    /**
     * Restart the current game
     */
    restartGame() {
        console.log('Restarting game...');
        this.gameOver.hide();
        this.startGame();
    }

    /**
     * Handle level completion
     */
    onLevelComplete() {
        console.log('Level completed!');
        
        // Add score bonus
        this.score += 1000;
        
        // Load next level
        if (this.levelManager.hasNextLevel()) {
            this.levelManager.loadNextLevel();
            this.currentLevel = this.levelManager.getCurrentLevel();
        } else {
            // Game completed
            this.endGame();
        }
    }

    /**
     * Handle player death
     */
    onPlayerDied() {
        console.log('Player died!');
        this.endGame();
    }

    /**
     * Handle settings changes
     */
    onSettingsChanged(settings) {
        console.log('Settings changed:', settings);
        // Apply settings to relevant systems
        if (settings.audio) {
            this.audioManager.setMasterVolume(settings.audio.masterVolume);
            this.audioManager.setSoundVolume(settings.audio.soundVolume);
            this.audioManager.setMusicVolume(settings.audio.musicVolume);
        }
    }

    /**
     * Start the game loop
     */
    startGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.lastTime = performance.now();
        this.gameLoop(this.lastTime);
    }

    /**
     * Stop the game loop
     */
    stopGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Main game loop
     */
    gameLoop(currentTime) {
        if (!this.isRunning) return;
        
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Update game systems
        this.update(deltaTime);
        
        // Render game
        this.render(deltaTime);
        
        // Continue loop
        this.animationFrameId = requestAnimationFrame((time) => this.gameLoop(time));
    }

    /**
     * Update game logic
     */
    update(deltaTime) {
        if (this.state !== 'PLAYING') return;
        
        // Update player
        if (this.player) {
            this.player.update(deltaTime);
        }
        
        // Update current level
        if (this.currentLevel) {
            this.currentLevel.update(deltaTime);
        }
        
        // Update UI
        this.gameUI.update(deltaTime, {
            score: this.score,
            time: this.getGameTime()
        });
        
        // Check collisions
        this.checkCollisions();
    }

    /**
     * Render the game
     */
    render(deltaTime) {
        if (this.state !== 'PLAYING') return;
        
        // Clear and prepare renderer
        this.renderer.clear();
        
        // Render current level
        if (this.currentLevel) {
            this.currentLevel.render(this.renderer);
        }
        
        // Render player
        if (this.player) {
            this.player.render(this.renderer);
        }
        
        // Apply any visual effects
        this.renderer.applyEffects();
    }

    /**
     * Check for collisions
     */
    checkCollisions() {
        if (!this.player || !this.currentLevel) return;
        
        // Check player collisions with level elements
        const collisions = this.collision.checkPlayerCollisions(
            this.player, 
            this.currentLevel
        );
        
        // Handle collisions
        collisions.forEach(collision => {
            this.handleCollision(collision);
        });
    }

    /**
     * Handle collision events
     */
    handleCollision(collision) {
        switch (collision.type) {
            case 'enemy':
                this.eventManager.emit('playerDied');
                break;
            case 'goal':
                this.eventManager.emit('levelComplete');
                break;
            case 'collectible':
                this.score += collision.value || 100;
                break;
        }
    }

    /**
     * Get current game time in seconds
     */
    getGameTime() {
        if (!this.startTime) return 0;
        return Math.floor((performance.now() - this.startTime) / 1000);
    }

    /**
     * Handle errors
     */
    handleError(error) {
        console.error('Game error:', error);
        this.pauseGame();
        // Could show error dialog here
    }

    /**
     * Clean up and destroy the game
     */
    destroy() {
        console.log('Destroying game...');
        
        this.stopGameLoop();
        
        // Clean up systems
        if (this.player) this.player.destroy();
        if (this.currentLevel) this.currentLevel.destroy();
        
        this.renderer.destroy();
        this.eventManager.destroy();
        this.audioManager.destroy();
        
        console.log('Game destroyed');
    }
}

// Make Game globally available
window.Game = Game; 