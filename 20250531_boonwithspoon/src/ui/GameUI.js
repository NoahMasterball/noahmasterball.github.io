/**
 * GameUI Class
 * 
 * Manages in-game UI elements like score, timer, and HUD.
 */
class GameUI {
    constructor() {
        this.element = null;
        this.scoreElement = null;
        this.timerElement = null;
        this.isVisible = false;
    }

    init() {
        this.createElement();
        console.log('GameUI initialized');
    }

    createElement() {
        // Create main UI container
        this.element = document.createElement('div');
        this.element.className = 'game-ui';
        this.element.style.position = 'fixed';
        this.element.style.top = '0';
        this.element.style.left = '0';
        this.element.style.width = '100%';
        this.element.style.height = '100%';
        this.element.style.pointerEvents = 'none';
        this.element.style.zIndex = '50';
        this.element.style.display = 'none';
        
        // Create score display
        this.scoreElement = document.createElement('div');
        this.scoreElement.className = 'score-display';
        this.scoreElement.style.position = 'absolute';
        this.scoreElement.style.top = '20px';
        this.scoreElement.style.right = '20px';
        this.scoreElement.style.background = 'rgba(0, 0, 0, 0.7)';
        this.scoreElement.style.color = '#fff';
        this.scoreElement.style.padding = '10px 20px';
        this.scoreElement.style.borderRadius = '5px';
        this.scoreElement.style.fontSize = '18px';
        this.scoreElement.style.fontWeight = 'bold';
        this.scoreElement.textContent = 'Score: 0';
        
        // Create timer display
        this.timerElement = document.createElement('div');
        this.timerElement.className = 'timer-display';
        this.timerElement.style.position = 'absolute';
        this.timerElement.style.top = '70px';
        this.timerElement.style.right = '20px';
        this.timerElement.style.background = 'rgba(0, 0, 0, 0.7)';
        this.timerElement.style.color = '#fff';
        this.timerElement.style.padding = '10px 20px';
        this.timerElement.style.borderRadius = '5px';
        this.timerElement.style.fontSize = '18px';
        this.timerElement.style.fontWeight = 'bold';
        this.timerElement.textContent = 'Time: 0:00';
        
        this.element.appendChild(this.scoreElement);
        this.element.appendChild(this.timerElement);
        
        // Add to game container
        const gameContainer = document.getElementById('gameContainer');
        gameContainer.appendChild(this.element);
        
        console.log('Game UI elements created');
    }

    update(gameData) {
        if (!this.isVisible || !gameData) return;
        
        // Update score
        if (this.scoreElement && typeof gameData.score !== 'undefined') {
            this.scoreElement.textContent = `Score: ${gameData.score}`;
        }
        
        // Update timer
        if (this.timerElement && typeof gameData.time !== 'undefined') {
            const minutes = Math.floor(gameData.time / 60000);
            const seconds = Math.floor((gameData.time % 60000) / 1000);
            this.timerElement.textContent = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    updateScore(score) {
        if (this.scoreElement) {
            this.scoreElement.textContent = `Score: ${score}`;
        }
    }

    updateTimer(time) {
        if (this.timerElement) {
            const minutes = Math.floor(time / 60000);
            const seconds = Math.floor((time % 60000) / 1000);
            this.timerElement.textContent = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    show() {
        this.isVisible = true;
        if (this.element) {
            this.element.style.display = 'block';
        }
        console.log('Showing game UI');
    }

    hide() {
        this.isVisible = false;
        if (this.element) {
            this.element.style.display = 'none';
        }
        console.log('Hiding game UI');
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        console.log('GameUI destroyed');
    }
}

window.GameUI = GameUI; 