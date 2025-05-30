/**
 * Tutorial Level Class
 * 
 * First level that teaches the player basic controls and mechanics.
 * Features a forest environment with tree log obstacles.
 */
class LevelTutorial {
    constructor(dependencies) {
        this.eventManager = dependencies.eventManager;
        this.renderer = dependencies.renderer;
        
        // Level properties
        this.name = 'Tutorial';
        this.isCompleted = false;
        this.obstacles = [];
        this.environment = null;
        this.controlsOverlay = null;
        
        this.init();
    }

    init() {
        this.createEnvironment();
        this.createObstacles();
        this.createControlsOverlay();
        console.log('Tutorial level initialized');
    }

    createEnvironment() {
        // Create forest background
        this.environment = document.createElement('div');
        this.environment.className = 'tutorial-environment';
        this.environment.style.position = 'fixed';
        this.environment.style.top = '0';
        this.environment.style.left = '0';
        this.environment.style.width = '100%';
        this.environment.style.height = '100%';
        this.environment.style.background = 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 50%, #8b4513 100%)';
        this.environment.style.zIndex = '1';
        
        // Add trees
        this.createTrees();
        
        // Add moon
        this.createMoon();
        
        // Add ground
        this.createGround();
        
        // Add to game container
        const gameContainer = document.getElementById('gameContainer');
        gameContainer.appendChild(this.environment);
    }

    createTrees() {
        const treeCount = 8;
        for (let i = 0; i < treeCount; i++) {
            const tree = document.createElement('div');
            tree.className = 'tree';
            tree.style.position = 'absolute';
            tree.style.bottom = '150px';
            tree.style.left = (i * 150 + Math.random() * 50) + 'px';
            tree.style.width = '0';
            tree.style.height = '0';
            tree.style.borderLeft = '25px solid transparent';
            tree.style.borderRight = '25px solid transparent';
            tree.style.borderBottom = '80px solid #2d5016';
            tree.style.zIndex = '2';
            
            // Tree trunk
            const trunk = document.createElement('div');
            trunk.style.position = 'absolute';
            trunk.style.bottom = '-20px';
            trunk.style.left = '15px';
            trunk.style.width = '20px';
            trunk.style.height = '25px';
            trunk.style.backgroundColor = '#8b4513';
            trunk.style.borderRadius = '0 0 5px 5px';
            
            tree.appendChild(trunk);
            this.environment.appendChild(tree);
        }
    }

    createMoon() {
        const moon = document.createElement('div');
        moon.className = 'moon';
        moon.style.position = 'absolute';
        moon.style.top = '80px';
        moon.style.right = '150px';
        moon.style.width = '60px';
        moon.style.height = '60px';
        moon.style.backgroundColor = '#ffff99';
        moon.style.borderRadius = '50%';
        moon.style.boxShadow = '0 0 20px rgba(255, 255, 153, 0.5)';
        moon.style.zIndex = '2';
        
        this.environment.appendChild(moon);
    }

    createGround() {
        const ground = document.createElement('div');
        ground.className = 'ground';
        ground.style.position = 'absolute';
        ground.style.bottom = '0';
        ground.style.left = '0';
        ground.style.width = '100%';
        ground.style.height = '150px';
        ground.style.backgroundColor = '#8b4513';
        ground.style.background = 'repeating-linear-gradient(90deg, #8b4513 0px, #a0522d 20px, #8b4513 40px)';
        ground.style.zIndex = '2';
        
        this.environment.appendChild(ground);
    }

    createObstacles() {
        // Create tree log obstacle
        const treeLog = {
            x: 400,
            y: 290,
            width: 120,
            height: 60,
            type: 'log'
        };
        
        const logElement = document.createElement('div');
        logElement.className = 'tree-log obstacle';
        logElement.style.position = 'absolute';
        logElement.style.left = treeLog.x + 'px';
        logElement.style.top = treeLog.y + 'px';
        logElement.style.width = treeLog.width + 'px';
        logElement.style.height = treeLog.height + 'px';
        logElement.style.background = 'repeating-linear-gradient(0deg, #8b4513 0px, #a0522d 8px, #654321 16px)';
        logElement.style.borderRadius = '30px';
        logElement.style.border = '3px solid #654321';
        logElement.style.zIndex = '5';
        logElement.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.3)';
        
        // Add log rings effect
        const ring1 = document.createElement('div');
        ring1.style.position = 'absolute';
        ring1.style.right = '10px';
        ring1.style.top = '50%';
        ring1.style.transform = 'translateY(-50%)';
        ring1.style.width = '40px';
        ring1.style.height = '40px';
        ring1.style.border = '3px solid #654321';
        ring1.style.borderRadius = '50%';
        ring1.style.backgroundColor = '#a0522d';
        
        const ring2 = document.createElement('div');
        ring2.style.position = 'absolute';
        ring2.style.left = '10px';
        ring2.style.top = '50%';
        ring2.style.transform = 'translateY(-50%)';
        ring2.style.width = '35px';
        ring2.style.height = '35px';
        ring2.style.border = '2px solid #654321';
        ring2.style.borderRadius = '50%';
        ring2.style.backgroundColor = '#8b4513';
        
        logElement.appendChild(ring1);
        logElement.appendChild(ring2);
        
        this.obstacles.push({
            ...treeLog,
            element: logElement
        });
        
        // Add to environment
        this.environment.appendChild(logElement);
    }

    createControlsOverlay() {
        this.controlsOverlay = document.createElement('div');
        this.controlsOverlay.className = 'tutorial-controls';
        this.controlsOverlay.style.position = 'fixed';
        this.controlsOverlay.style.top = '20px';
        this.controlsOverlay.style.left = '20px';
        this.controlsOverlay.style.background = 'rgba(0, 0, 0, 0.8)';
        this.controlsOverlay.style.color = '#fff';
        this.controlsOverlay.style.padding = '20px';
        this.controlsOverlay.style.borderRadius = '10px';
        this.controlsOverlay.style.fontSize = '18px';
        this.controlsOverlay.style.lineHeight = '1.5';
        this.controlsOverlay.style.zIndex = '100';
        this.controlsOverlay.style.fontFamily = 'Arial, sans-serif';
        this.controlsOverlay.style.maxWidth = '300px';
        
        this.controlsOverlay.innerHTML = `
            <div style="font-size: 22px; font-weight: bold; margin-bottom: 15px; color: #ffff99;">
                🎮 Tutorial - Controls
            </div>
            <div style="margin-bottom: 10px;">
                <strong>W</strong> or <strong>↑</strong> - Jump
            </div>
            <div style="margin-bottom: 10px;">
                <strong>S</strong> or <strong>↓</strong> - Duck
            </div>
            <div style="margin-bottom: 10px;">
                <strong>A</strong> or <strong>←</strong> - Move Left
            </div>
            <div style="margin-bottom: 15px;">
                <strong>D</strong> or <strong>→</strong> - Move Right
            </div>
            <div style="font-size: 16px; color: #ffff99;">
                💡 Jump over the tree log!
            </div>
        `;
        
        // Add to game container
        const gameContainer = document.getElementById('gameContainer');
        gameContainer.appendChild(this.controlsOverlay);
    }

    update(deltaTime, player) {
        // Check collisions with obstacles
        if (player) {
            this.obstacles.forEach(obstacle => {
                if (player.checkCollision(obstacle)) {
                    // Push player back if colliding with obstacle
                    if (player.x < obstacle.x) {
                        player.x = obstacle.x - player.width - 1;
                    } else {
                        player.x = obstacle.x + obstacle.width + 1;
                    }
                    player.updatePosition();
                    console.log('Player hit obstacle!');
                }
            });
            
            // Check if player reached end of level
            if (player.x > window.innerWidth - 100) {
                this.completeLevel();
            }
        }
    }

    completeLevel() {
        if (!this.isCompleted) {
            this.isCompleted = true;
            console.log('Tutorial completed!');
            this.eventManager.emit('levelComplete');
        }
    }

    show() {
        if (this.environment) {
            this.environment.style.display = 'block';
        }
        if (this.controlsOverlay) {
            this.controlsOverlay.style.display = 'block';
        }
    }

    hide() {
        if (this.environment) {
            this.environment.style.display = 'none';
        }
        if (this.controlsOverlay) {
            this.controlsOverlay.style.display = 'none';
        }
    }

    destroy() {
        if (this.environment && this.environment.parentNode) {
            this.environment.parentNode.removeChild(this.environment);
        }
        if (this.controlsOverlay && this.controlsOverlay.parentNode) {
            this.controlsOverlay.parentNode.removeChild(this.controlsOverlay);
        }
        console.log('Tutorial level destroyed');
    }
}

window.LevelTutorial = LevelTutorial; 