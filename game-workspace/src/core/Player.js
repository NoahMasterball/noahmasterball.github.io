/**
 * Player Class
 * 
 * Manages the player entity, including movement, controls, and state.
 */
class Player {
    constructor(dependencies) {
        this.eventManager = dependencies.eventManager;
        this.renderer = dependencies.renderer;
        
        // Player properties
        this.x = 1;
        this.y = 1;
        this.size = 20;
        this.speed = 200; // pixels per second
        
        // State
        this.isMoving = false;
        this.health = 100;
        this.lives = 3;
        
        this.init();
    }

    init() {
        this.setupControls();
        console.log('Player initialized');
    }

    setupControls() {
        // TODO: Implement input handling
        console.log('Player controls set up');
    }

    update(deltaTime) {
        // TODO: Implement player update logic
    }

    render(renderer) {
        // TODO: Implement player rendering
        console.log('Rendering player');
    }

    move(dx, dy) {
        // TODO: Implement movement logic
        console.log(`Player moving: ${dx}, ${dy}`);
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.eventManager.emit('playerDied');
        }
    }

    destroy() {
        console.log('Player destroyed');
    }
}

window.Player = Player; 