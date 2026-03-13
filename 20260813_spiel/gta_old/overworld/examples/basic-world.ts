/**
 * Basic World Example
 * 
 * This example demonstrates how to create a simple world with the Overworld Engine.
 * It shows the basic setup, world generation, and entity management.
 */

import { OverworldEngine } from '../src/core/Engine';
import { WorldGenerator } from '../src/world/WorldGenerator';
import { Entity } from '../src/core/Entity';
import { TransformComponent } from '../src/core/TransformComponent';
import { RenderComponent } from '../src/rendering/RenderComponent';
import { Camera } from '../src/rendering/Camera';
import { Vector3, Quaternion } from 'gl-matrix';

class BasicWorldExample {
  private engine: OverworldEngine;
  private world: any;
  private camera: Camera;

  constructor() {
    this.initializeEngine();
    this.setupCamera();
    this.generateWorld();
    this.createEntities();
    this.start();
  }

  private initializeEngine(): void {
    // Get the canvas element
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    // Initialize the engine
    this.engine = new OverworldEngine({
      canvas,
      width: 1920,
      height: 1080,
      targetFPS: 60,
      enableDebug: true,
      enableProfiling: true
    });

    console.log('Engine initialized successfully');
  }

  private setupCamera(): void {
    // Create and configure the camera
    this.camera = new Camera();
    this.camera.setPosition(new Vector3(0, 10, 20));
    this.camera.lookAt(new Vector3(0, 0, 0));
    this.camera.setPerspective(75, 16 / 9, 0.1, 1000);

    // Set the camera in the rendering system
    const renderingSystem = this.engine.getSystem('RenderingSystem');
    if (renderingSystem) {
      renderingSystem.setCamera(this.camera);
    }
  }

  private async generateWorld(): Promise<void> {
    // Create world generator
    const worldGenerator = new WorldGenerator({
      terrainSize: { width: 1000, height: 1000 },
      seed: 'basic-world-example',
      biomes: [
        {
          name: 'grassland',
          frequency: 0.6,
          temperature: [15, 25],
          moisture: [0.3, 0.7]
        },
        {
          name: 'forest',
          frequency: 0.3,
          temperature: [10, 20],
          moisture: [0.6, 1.0]
        },
        {
          name: 'mountain',
          frequency: 0.1,
          elevation: [0.7, 1.0]
        }
      ]
    });

    // Generate the world
    this.world = await worldGenerator.generateAsync({
      size: 1000,
      seed: 'basic-world-example',
      structures: {
        villages: { minDistance: 200, maxCount: 5 },
        dungeons: { minDistance: 500, maxCount: 2 }
      }
    });

    // Load the world into the engine
    await this.engine.loadWorld(this.world);
    console.log('World generated and loaded');
  }

  private createEntities(): void {
    // Create a player entity
    const player = new Entity('Player');
    player.addComponent(new TransformComponent(player.id));
    player.addComponent(new RenderComponent(player.id));
    player.addTag('player');
    player.addTag('controllable');

    // Set player position
    const transform = player.getComponent(TransformComponent);
    if (transform) {
      transform.setPosition(0, 5, 0);
    }

    // Create some NPCs
    for (let i = 0; i < 5; i++) {
      const npc = new Entity(`Villager_${i}`);
      npc.addComponent(new TransformComponent(npc.id));
      npc.addComponent(new RenderComponent(npc.id));
      npc.addTag('npc');
      npc.addTag('villager');

      // Random position
      const npcTransform = npc.getComponent(TransformComponent);
      if (npcTransform) {
        const x = (Math.random() - 0.5) * 100;
        const z = (Math.random() - 0.5) * 100;
        npcTransform.setPosition(x, 0, z);
      }

      this.world.addEntity(npc);
    }

    // Add player to world
    this.world.addEntity(player);
    console.log('Entities created');
  }

  private start(): void {
    // Start the engine
    this.engine.start(this.world);
    console.log('Engine started');

    // Set up input handling
    this.setupInput();
  }

  private setupInput(): void {
    const inputManager = this.engine.getSystem('InputSystem');
    if (!inputManager) return;

    // Camera controls
    inputManager.onKeyDown((key) => {
      const moveSpeed = 0.5;
      const currentPosition = this.camera.position;

      switch (key) {
        case 'KeyW':
          this.camera.moveForward(moveSpeed);
          break;
        case 'KeyS':
          this.camera.moveForward(-moveSpeed);
          break;
        case 'KeyA':
          this.camera.moveRight(-moveSpeed);
          break;
        case 'KeyD':
          this.camera.moveRight(moveSpeed);
          break;
        case 'Space':
          this.camera.moveUp(moveSpeed);
          break;
        case 'ShiftLeft':
          this.camera.moveUp(-moveSpeed);
          break;
      }
    });

    // Mouse look
    inputManager.onMouseMove((position) => {
      const sensitivity = 0.002;
      const deltaX = position.x * sensitivity;
      const deltaY = position.y * sensitivity;

      // Rotate camera based on mouse movement
      // This is a simplified implementation
      console.log(`Mouse moved: ${deltaX}, ${deltaY}`);
    });
  }

  // Public methods for external control
  public pause(): void {
    this.engine.pause();
  }

  public resume(): void {
    this.engine.resume();
  }

  public stop(): void {
    this.engine.stop();
  }

  public getPerformanceMetrics(): any {
    return {
      fps: this.engine.getFPS(),
      memoryUsage: this.engine.getMemoryUsage(),
      entityCount: this.world.entities.length
    };
  }
}

// Export for use in other modules
export { BasicWorldExample };

// Auto-start if this file is run directly
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const example = new BasicWorldExample();
      
      // Expose to global scope for debugging
      (window as any).basicWorldExample = example;
      
      console.log('Basic World Example started successfully');
    } catch (error) {
      console.error('Failed to start Basic World Example:', error);
    }
  });
} 