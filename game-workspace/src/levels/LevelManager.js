/**
 * LevelManager Class
 * 
 * Manages level loading, transitions, and progression.
 */
class LevelManager {
    constructor() {
        this.levels = [Level1, Level2]; // Available level classes
        this.currentLevelIndex = 0;
        this.currentLevel = null;
    }

    /**
     * Load a specific level by number
     */
    loadLevel(levelNumber) {
        console.log(`Loading level ${levelNumber}`);
        
        if (levelNumber < 1 || levelNumber > this.levels.length) {
            console.error(`Level ${levelNumber} does not exist`);
            return false;
        }

        // Clean up current level
        if (this.currentLevel) {
            this.currentLevel.destroy();
        }

        // Create and initialize new level
        const LevelClass = this.levels[levelNumber - 1];
        this.currentLevel = new LevelClass();
        this.currentLevel.init();
        this.currentLevelIndex = levelNumber - 1;

        return true;
    }

    /**
     * Load the next level
     */
    loadNextLevel() {
        const nextLevel = this.currentLevelIndex + 2; // +2 because loadLevel expects 1-based index
        return this.loadLevel(nextLevel);
    }

    /**
     * Load the previous level
     */
    loadPreviousLevel() {
        const prevLevel = this.currentLevelIndex; // currentLevelIndex is 0-based, so this gives us the previous level in 1-based
        return this.loadLevel(prevLevel);
    }

    /**
     * Check if there's a next level available
     */
    hasNextLevel() {
        return this.currentLevelIndex < this.levels.length - 1;
    }

    /**
     * Check if there's a previous level available
     */
    hasPreviousLevel() {
        return this.currentLevelIndex > 0;
    }

    /**
     * Get the current level instance
     */
    getCurrentLevel() {
        return this.currentLevel;
    }

    /**
     * Get current level number (1-based)
     */
    getCurrentLevelNumber() {
        return this.currentLevelIndex + 1;
    }

    /**
     * Get total number of levels
     */
    getTotalLevels() {
        return this.levels.length;
    }

    /**
     * Restart the current level
     */
    restartCurrentLevel() {
        const currentLevelNumber = this.getCurrentLevelNumber();
        return this.loadLevel(currentLevelNumber);
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.currentLevel) {
            this.currentLevel.destroy();
            this.currentLevel = null;
        }
        console.log('LevelManager destroyed');
    }
}

window.LevelManager = LevelManager; 