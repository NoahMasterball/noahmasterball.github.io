/**
 * Enemy Class
 * 
 * Manages enemy entities, AI behavior, and interactions.
 */
class Enemy {
    constructor(options = {}) {
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.type = options.type || 'basic';
        this.speed = options.speed || 100;
        this.health = options.health || 50;
        this.direction = { x: 1, y: 0 };
        this.isActive = true;
    }

    update(deltaTime) {
        // TODO: Implement enemy AI and movement
        console.log('Enemy update');
    }

    render(renderer) {
        // TODO: Implement enemy rendering
        console.log('Rendering enemy');
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.destroy();
        }
    }

    destroy() {
        this.isActive = false;
        console.log('Enemy destroyed');
    }
}

window.Enemy = Enemy; 