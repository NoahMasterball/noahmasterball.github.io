/**
 * Level Class (Base)
 * 
 * Abstract base class for all game levels.
 * Provides common functionality and interface for level implementations.
 */
class Level {
    constructor(options = {}) {
        this.id = options.id || 1;
        this.name = options.name || 'Level';
        this.width = options.width || 20;
        this.height = options.height || 15;
        this.enemies = [];
        this.collectibles = [];
        this.isLoaded = false;
    }

    /**
     * Initialize the level
     */
    init() {
        this.generateLevel();
        this.spawnEnemies();
        this.spawnCollectibles();
        this.isLoaded = true;
        console.log(`Level ${this.id} initialized`);
    }

    /**
     * Generate level layout - to be implemented by subclasses
     */
    generateLevel() {
        console.log('Generating base level layout');
    }

    /**
     * Spawn enemies - to be implemented by subclasses
     */
    spawnEnemies() {
        console.log('Spawning enemies');
    }

    /**
     * Spawn collectibles - to be implemented by subclasses
     */
    spawnCollectibles() {
        console.log('Spawning collectibles');
    }

    /**
     * Update level logic
     */
    update(deltaTime) {
        // Update enemies
        this.enemies.forEach(enemy => {
            if (enemy.isActive) {
                enemy.update(deltaTime);
            }
        });

        // Remove inactive enemies
        this.enemies = this.enemies.filter(enemy => enemy.isActive);
    }

    /**
     * Render the level
     */
    render(renderer) {
        this.renderBackground(renderer);
        this.renderTerrain(renderer);
        this.renderEnemies(renderer);
        this.renderCollectibles(renderer);
    }

    /**
     * Render background - to be implemented by subclasses
     */
    renderBackground(renderer) {
        console.log('Rendering background');
    }

    /**
     * Render terrain - to be implemented by subclasses
     */
    renderTerrain(renderer) {
        console.log('Rendering terrain');
    }

    /**
     * Render enemies
     */
    renderEnemies(renderer) {
        this.enemies.forEach(enemy => {
            if (enemy.isActive) {
                enemy.render(renderer);
            }
        });
    }

    /**
     * Render collectibles
     */
    renderCollectibles(renderer) {
        this.collectibles.forEach(collectible => {
            if (collectible.isActive) {
                collectible.render(renderer);
            }
        });
    }

    /**
     * Check if level is complete
     */
    isComplete() {
        // Override in subclasses
        return false;
    }

    /**
     * Get spawn position for player
     */
    getPlayerSpawnPosition() {
        return { x: 1, y: 1 };
    }

    /**
     * Clean up level resources
     */
    destroy() {
        this.enemies.forEach(enemy => enemy.destroy());
        this.collectibles.forEach(collectible => collectible.destroy());
        this.enemies = [];
        this.collectibles = [];
        this.isLoaded = false;
        console.log(`Level ${this.id} destroyed`);
    }
}

window.Level = Level; 