/**
 * Level2 Class
 * 
 * Second level implementation - Forest Adventure theme.
 */
class Level2 extends Level {
    constructor() {
        super({
            id: 2,
            name: 'Forest Adventure',
            width: 25,
            height: 18
        });
        this.theme = 'forest';
    }

    generateLevel() {
        console.log('Generating Level 2 - Forest Adventure');
        // TODO: Implement forest generation
    }

    spawnEnemies() {
        console.log('Spawning Level 2 enemies');
        // TODO: Spawn forest-specific enemies
    }

    renderBackground(renderer) {
        console.log('Rendering Level 2 background');
        // TODO: Render forest background
    }

    renderTerrain(renderer) {
        console.log('Rendering Level 2 terrain');
        // TODO: Render trees, paths, and obstacles
    }

    isComplete() {
        // TODO: Check if player reached the forest exit
        return false;
    }
}

window.Level2 = Level2; 