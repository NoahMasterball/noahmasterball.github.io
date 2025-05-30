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
        this.x = 100; // Start position X
        this.y = 300; // Start position Y (ground level)
        this.width = 30;
        this.height = 50;
        this.groundY = 300; // Ground level
        
        // Movement properties
        this.speed = 150; // pixels per second
        this.jumpPower = 250;
        this.gravity = 500;
        this.velocityX = 0;
        this.velocityY = 0;
        
        // State
        this.isOnGround = true;
        this.isDucking = false;
        this.isMoving = false;
        this.health = 100;
        this.lives = 3;
        
        // Key states
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false
        };
        
        this.init();
    }

    init() {
        this.setupControls();
        this.createElement();
        console.log('Player initialized');
    }

    createElement() {
        // Create player visual element
        this.element = document.createElement('div');
        this.element.className = 'player';
        this.element.style.position = 'absolute';
        this.element.style.width = this.width + 'px';
        this.element.style.height = this.height + 'px';
        this.element.style.backgroundColor = '#4a90e2';
        this.element.style.border = '2px solid #2c5aa0';
        this.element.style.borderRadius = '50% 50% 50% 50% / 60% 60% 40% 40%';
        this.element.style.zIndex = '10';
        this.element.style.transition = 'height 0.1s ease';
        
        // Add to game container
        const gameContainer = document.getElementById('gameContainer');
        gameContainer.appendChild(this.element);
        
        this.updatePosition();
    }

    setupControls() {
        // Key down events
        document.addEventListener('keydown', (e) => {
            switch(e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    if (this.isOnGround) {
                        this.jump();
                    }
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.duck(true);
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    break;
            }
        });
        
        // Key up events
        document.addEventListener('keyup', (e) => {
            switch(e.code) {
                case 'KeyS':
                case 'ArrowDown':
                    this.duck(false);
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
            }
        });
        
        console.log('Player controls set up: WASD/Arrow keys');
    }

    update(deltaTime) {
        // Horizontal movement
        this.velocityX = 0;
        if (this.keys.left) {
            this.velocityX = -this.speed;
        }
        if (this.keys.right) {
            this.velocityX = this.speed;
        }
        
        // Apply gravity
        if (!this.isOnGround) {
            this.velocityY += this.gravity * deltaTime;
        }
        
        // Update position
        this.x += this.velocityX * deltaTime;
        this.y += this.velocityY * deltaTime;
        
        // Ground collision
        if (this.y >= this.groundY) {
            this.y = this.groundY;
            this.velocityY = 0;
            this.isOnGround = true;
        }
        
        // Keep player in bounds
        const maxX = window.innerWidth - this.width;
        this.x = Math.max(0, Math.min(maxX, this.x));
        
        this.updatePosition();
        this.updateMovingState();
    }

    jump() {
        if (this.isOnGround && !this.isDucking) {
            this.velocityY = -this.jumpPower;
            this.isOnGround = false;
            console.log('Player jumped!');
        }
    }

    duck(isDucking) {
        this.isDucking = isDucking;
        if (isDucking) {
            this.height = 25;
            this.element.style.height = this.height + 'px';
            this.element.style.borderRadius = '50%';
            console.log('Player ducking');
        } else {
            this.height = 50;
            this.element.style.height = this.height + 'px';
            this.element.style.borderRadius = '50% 50% 50% 50% / 60% 60% 40% 40%';
            console.log('Player standing up');
        }
    }

    updatePosition() {
        if (this.element) {
            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
        }
    }

    updateMovingState() {
        const wasMoving = this.isMoving;
        this.isMoving = this.velocityX !== 0 || this.velocityY !== 0;
        
        if (this.isMoving !== wasMoving) {
            if (this.isMoving) {
                this.element.style.boxShadow = '0 0 15px rgba(74, 144, 226, 0.5)';
            } else {
                this.element.style.boxShadow = 'none';
            }
        }
    }

    // Get player bounds for collision detection
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            centerX: this.x + this.width / 2,
            centerY: this.y + this.height / 2
        };
    }

    // Check collision with obstacle
    checkCollision(obstacle) {
        const playerBounds = this.getBounds();
        return (
            playerBounds.x < obstacle.x + obstacle.width &&
            playerBounds.x + playerBounds.width > obstacle.x &&
            playerBounds.y < obstacle.y + obstacle.height &&
            playerBounds.y + playerBounds.height > obstacle.y
        );
    }

    render(renderer) {
        // Rendering is handled by the DOM element
        // This method is kept for compatibility
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.updatePosition();
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.eventManager.emit('playerDied');
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        console.log('Player destroyed');
    }
}

window.Player = Player; 