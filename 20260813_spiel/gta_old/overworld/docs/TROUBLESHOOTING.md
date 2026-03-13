# Troubleshooting Guide

## 🚨 Common Issues and Solutions

This guide provides solutions to common problems encountered when working with the Overworld Engine.

## 📋 Table of Contents

1. [Installation Issues](#installation-issues)
2. [Build Problems](#build-problems)
3. [Runtime Errors](#runtime-errors)
4. [Performance Issues](#performance-issues)
5. [AI System Problems](#ai-system-problems)
6. [Rendering Issues](#rendering-issues)
7. [Physics Problems](#physics-problems)
8. [Debugging Tools](#debugging-tools)

## 🔧 Installation Issues

### Node.js Version Problems

**Problem**: `Error: Node.js version 18.0.0 or higher is required`

**Solution**:
```bash
# Check current Node.js version
node --version

# Update Node.js using nvm (recommended)
nvm install 18.0.0
nvm use 18.0.0

# Or download from nodejs.org
# https://nodejs.org/en/download/
```

### Dependency Installation Failures

**Problem**: `npm install` fails with various errors

**Solutions**:
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install

# If using yarn
yarn cache clean
rm -rf node_modules yarn.lock
yarn install
```

### TypeScript Compilation Issues

**Problem**: TypeScript compilation errors

**Solutions**:
```bash
# Check TypeScript version
npx tsc --version

# Update TypeScript
npm install -g typescript@latest

# Rebuild the project
npm run clean
npm run build
```

## 🔨 Build Problems

### Module Resolution Errors

**Problem**: `Cannot find module` errors

**Solutions**:
1. **Check import paths**:
   ```typescript
   // Use absolute imports with @ alias
   import { Entity } from '@/core/Entity';
   
   // Instead of relative imports
   import { Entity } from '../../../core/Entity';
   ```

2. **Verify tsconfig.json paths**:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["src/*"],
         "@core/*": ["src/core/*"],
         "@ai/*": ["src/ai/*"]
       }
     }
   }
   ```

3. **Check file extensions**:
   ```typescript
   // Use .js extension for compiled files
   import { Engine } from './Engine.js';
   ```

### WebGL Context Issues

**Problem**: `WebGL not supported` or canvas context errors

**Solutions**:
```typescript
// Check WebGL support
function checkWebGLSupport(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  return gl !== null;
}

// Fallback to WebGL 1 if WebGL 2 is not available
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
if (!gl) {
  throw new Error('WebGL is not supported in this browser');
}
```

## ⚡ Runtime Errors

### Engine Initialization Failures

**Problem**: Engine fails to start

**Debugging Steps**:
```typescript
try {
  const engine = new OverworldEngine({
    canvas: document.getElementById('game-canvas'),
    width: 1920,
    height: 1080,
    enableDebug: true
  });
} catch (error) {
  console.error('Engine initialization failed:', error);
  
  // Check canvas element
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('Canvas element not found');
  }
  
  // Check WebGL support
  if (!checkWebGLSupport()) {
    console.error('WebGL not supported');
  }
}
```

### Memory Leaks

**Problem**: Memory usage increases over time

**Solutions**:
```typescript
// Dispose of resources properly
class ResourceManager {
  private resources: Map<string, any> = new Map();
  
  dispose(): void {
    this.resources.forEach(resource => {
      if (resource.dispose) {
        resource.dispose();
      }
    });
    this.resources.clear();
  }
  
  addResource(id: string, resource: any): void {
    this.resources.set(id, resource);
  }
  
  removeResource(id: string): void {
    const resource = this.resources.get(id);
    if (resource && resource.dispose) {
      resource.dispose();
    }
    this.resources.delete(id);
  }
}

// Use in engine
const resourceManager = new ResourceManager();

// Clean up on engine stop
engine.onStop(() => {
  resourceManager.dispose();
});
```

### Event Listener Memory Leaks

**Problem**: Event listeners not being removed

**Solution**:
```typescript
class EventManager {
  private listeners: Map<string, Function[]> = new Map();
  
  addEventListener(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }
  
  removeEventListener(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
  
  dispose(): void {
    this.listeners.clear();
  }
}
```

## 🚀 Performance Issues

### Low FPS

**Problem**: Frame rate drops below target

**Debugging Steps**:
```typescript
// Monitor performance metrics
class PerformanceMonitor {
  private metrics = {
    fps: 0,
    frameTime: 0,
    renderTime: 0,
    updateTime: 0,
    memoryUsage: 0
  };
  
  update(deltaTime: number): void {
    this.metrics.fps = 1 / deltaTime;
    this.metrics.frameTime = deltaTime * 1000;
    
    // Log if performance is poor
    if (this.metrics.fps < 30) {
      console.warn('Low FPS detected:', this.metrics);
    }
  }
  
  getReport(): any {
    return { ...this.metrics };
  }
}
```

**Common Causes and Solutions**:

1. **Too many entities**:
   ```typescript
   // Implement entity culling
   class EntityCuller {
     cull(entities: Entity[], camera: Camera): Entity[] {
       return entities.filter(entity => {
         const distance = Vector3.distance(entity.position, camera.position);
         return distance < 100; // Only render entities within 100 units
       });
     }
   }
   ```

2. **Complex shaders**:
   ```typescript
   // Use LOD (Level of Detail) for shaders
   class ShaderLOD {
     getShader(distance: number): Shader {
       if (distance < 10) return this.highQualityShader;
       if (distance < 50) return this.mediumQualityShader;
       return this.lowQualityShader;
     }
   }
   ```

3. **Inefficient rendering**:
   ```typescript
   // Batch similar draw calls
   class RenderBatcher {
     private batches: Map<string, Entity[]> = new Map();
     
     addToBatch(entity: Entity, material: Material): void {
       const key = material.id;
       if (!this.batches.has(key)) {
         this.batches.set(key, []);
       }
       this.batches.get(key)!.push(entity);
     }
     
     renderBatches(): void {
       this.batches.forEach((entities, materialId) => {
         // Render all entities with same material in one batch
         this.renderBatch(entities, materialId);
       });
     }
   }
   ```

### High Memory Usage

**Problem**: Memory consumption is too high

**Solutions**:
```typescript
// Implement object pooling
class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  
  acquire(): T {
    return this.pool.pop() || this.factory();
  }
  
  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }
  
  // Limit pool size
  private maxSize: number = 100;
  
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }
}

// Use for frequently created objects
const particlePool = new ObjectPool<Particle>({
  factory: () => new Particle(),
  reset: (particle) => particle.reset()
});
```

## 🧠 AI System Problems

### Behavior Tree Issues

**Problem**: NPCs not behaving correctly

**Debugging**:
```typescript
// Add debug logging to behavior nodes
class DebugBehaviorNode extends BehaviorNode {
  constructor(private node: BehaviorNode, private name: string) {
    super();
  }
  
  execute(npc: NPC): BehaviorStatus {
    console.log(`[${this.name}] Starting execution`);
    const result = this.node.execute(npc);
    console.log(`[${this.name}] Result: ${result}`);
    return result;
  }
}

// Use in behavior trees
const debugNode = new DebugBehaviorNode(originalNode, 'FindFood');
```

### Pathfinding Failures

**Problem**: NPCs can't find paths

**Solutions**:
```typescript
// Check pathfinding grid
class PathfindingDebugger {
  visualizeGrid(navMesh: NavMesh): void {
    // Draw grid cells
    navMesh.cells.forEach(cell => {
      if (cell.walkable) {
        this.drawCell(cell, 'green');
      } else {
        this.drawCell(cell, 'red');
      }
    });
  }
  
  validatePath(path: Path): boolean {
    for (let i = 1; i < path.points.length; i++) {
      const prev = path.points[i - 1];
      const curr = path.points[i];
      
      // Check if path segment is walkable
      if (!this.isWalkable(prev, curr)) {
        console.error(`Invalid path segment: ${prev} -> ${curr}`);
        return false;
      }
    }
    return true;
  }
}
```

### Memory System Issues

**Problem**: NPCs forget important information

**Debugging**:
```typescript
// Monitor memory usage
class MemoryDebugger {
  logMemory(npc: NPC): void {
    console.log(`Memory for ${npc.name}:`);
    npc.memory.memories.forEach(memory => {
      console.log(`  - ${memory.type}: ${memory.strength} (${memory.age}s old)`);
    });
  }
  
  validateMemory(memory: Memory): boolean {
    if (memory.strength < 0 || memory.strength > 1) {
      console.error('Invalid memory strength:', memory);
      return false;
    }
    return true;
  }
}
```

## 🎨 Rendering Issues

### Black Screen

**Problem**: Nothing renders on screen

**Debugging Steps**:
```typescript
// Check rendering pipeline
class RenderingDebugger {
  debugRender(renderer: Renderer): void {
    // Check if WebGL context is valid
    const gl = renderer.gl;
    if (!gl) {
      console.error('No WebGL context');
      return;
    }
    
    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('WebGL error:', error);
    }
    
    // Check if camera is set
    if (!renderer.camera) {
      console.error('No camera set');
    }
    
    // Check if scene has entities
    if (renderer.scene.entities.length === 0) {
      console.warn('No entities to render');
    }
  }
}
```

### Texture Loading Issues

**Problem**: Textures not loading or displaying incorrectly

**Solutions**:
```typescript
// Texture loading with error handling
class TextureLoader {
  async loadTexture(path: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      
      image.onload = () => {
        try {
          const texture = this.createTexture(image);
          resolve(texture);
        } catch (error) {
          reject(error);
        }
      };
      
      image.onerror = () => {
        reject(new Error(`Failed to load texture: ${path}`));
      };
      
      image.src = path;
    });
  }
  
  private createTexture(image: HTMLImageElement): Texture {
    const gl = this.renderer.gl;
    const texture = gl.createTexture();
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    // Check for power-of-two dimensions
    if (this.isPowerOfTwo(image.width) && this.isPowerOfTwo(image.height)) {
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    
    return texture;
  }
}
```

### Shader Compilation Errors

**Problem**: Shaders fail to compile

**Debugging**:
```typescript
// Shader compilation with detailed error reporting
class ShaderCompiler {
  compileShader(source: string, type: number): WebGLShader {
    const gl = this.renderer.gl;
    const shader = gl.createShader(type);
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      console.error(`Shader compilation failed: ${error}`);
      console.error('Shader source:', source);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${error}`);
    }
    
    return shader;
  }
  
  validateShaderProgram(program: WebGLProgram): boolean {
    const gl = this.renderer.gl;
    
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      console.error(`Program validation failed: ${error}`);
      return false;
    }
    
    return true;
  }
}
```

## ⚡ Physics Problems

### Collision Detection Issues

**Problem**: Objects passing through each other

**Debugging**:
```typescript
// Visualize collision bounds
class CollisionDebugger {
  drawCollisionBounds(entity: Entity): void {
    const collider = entity.getComponent(ColliderComponent);
    if (collider) {
      this.drawBoundingBox(collider.bounds, 'red');
    }
  }
  
  validateCollision(body1: RigidBody, body2: RigidBody): boolean {
    const distance = Vector3.distance(body1.position, body2.position);
    const minDistance = body1.radius + body2.radius;
    
    if (distance < minDistance) {
      console.warn('Collision detected but not handled');
      return false;
    }
    
    return true;
  }
}
```

### Physics Performance Issues

**Problem**: Physics simulation is slow

**Solutions**:
```typescript
// Implement spatial partitioning
class SpatialPartition {
  private grid: Map<string, RigidBody[]> = new Map();
  private cellSize: number = 10;
  
  update(body: RigidBody): void {
    const cell = this.getCell(body.position);
    if (!this.grid.has(cell)) {
      this.grid.set(cell, []);
    }
    this.grid.get(cell)!.push(body);
  }
  
  getNearbyBodies(position: Vector3, radius: number): RigidBody[] {
    const nearby: RigidBody[] = [];
    const cells = this.getNearbyCells(position, radius);
    
    cells.forEach(cell => {
      const bodies = this.grid.get(cell) || [];
      nearby.push(...bodies);
    });
    
    return nearby;
  }
}
```

## 🔍 Debugging Tools

### Built-in Debug System

```typescript
// Enable debug mode
const engine = new OverworldEngine({
  enableDebug: true,
  enableProfiling: true
});

// Access debug information
const debugInfo = engine.getDebugInfo();
console.log('Debug info:', debugInfo);

// Performance metrics
const metrics = engine.getPerformanceMetrics();
console.log('Performance:', metrics);
```

### Custom Debug Tools

```typescript
// Entity inspector
class EntityInspector {
  inspect(entity: Entity): void {
    console.group(`Entity: ${entity.name} (${entity.id})`);
    console.log('Position:', entity.position);
    console.log('Components:', entity.components);
    console.log('Tags:', entity.tags);
    console.groupEnd();
  }
  
  findEntitiesByComponent<T>(componentType: ComponentType<T>): Entity[] {
    return this.world.entities.filter(entity => 
      entity.hasComponent(componentType)
    );
  }
}

// Event logger
class EventLogger {
  logEvent(event: Event): void {
    console.log(`[${event.timestamp}] ${event.type}:`, event.data);
  }
  
  subscribeToAll(eventBus: EventBus): void {
    eventBus.onAny((event) => this.logEvent(event));
  }
}
```

### Performance Profiling

```typescript
// Custom profiler
class Profiler {
  private timers: Map<string, number> = new Map();
  
  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }
  
  endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.timers.delete(name);
      return duration;
    }
    return 0;
  }
  
  measure<T>(name: string, fn: () => T): T {
    this.startTimer(name);
    const result = fn();
    const duration = this.endTimer(name);
    console.log(`${name} took ${duration.toFixed(2)}ms`);
    return result;
  }
}
```

## 📞 Getting Help

If you're still experiencing issues after trying these solutions:

1. **Check the documentation**: Review the [API Reference](API_REFERENCE.md) and [Architecture Guide](ARCHITECTURE.md)
2. **Search existing issues**: Look for similar problems in the issue tracker
3. **Create a minimal reproduction**: Create a simple example that demonstrates the problem
4. **Include debug information**: Provide console logs, error messages, and system information
5. **Report the issue**: Create a detailed bug report with:
   - Description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (OS, browser, Node.js version)
   - Console logs and error messages

---

*This troubleshooting guide covers the most common issues encountered when working with the Overworld Engine. For additional help, refer to the main documentation or create an issue in the project repository.* 