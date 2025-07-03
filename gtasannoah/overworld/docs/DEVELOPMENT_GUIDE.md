# Overworld Engine Development Guide

## 🚀 Getting Started

### Prerequisites

Before you begin developing with the Overworld Engine, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **TypeScript** (v5.0.0 or higher)
- **Git** (for version control)
- **VS Code** (recommended IDE with TypeScript support)
- **WebGL-compatible browser** (for testing)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd overworld
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

### Project Structure

```
overworld/
├── src/                    # Source code
│   ├── core/              # Core engine systems
│   │   ├── Engine.ts      # Main engine class
│   │   ├── World.ts       # World management
│   │   └── System.ts      # System base class
│   ├── ai/                # AI and NPC systems
│   │   ├── NPC.ts         # NPC base class
│   │   ├── BehaviorTree.ts # Behavior tree system
│   │   └── Pathfinding.ts # Pathfinding algorithms
│   ├── world/             # World generation
│   │   ├── WorldGenerator.ts
│   │   ├── TerrainGenerator.ts
│   │   └── BiomeSystem.ts
│   ├── rendering/         # Graphics and rendering
│   │   ├── Renderer.ts
│   │   ├── Camera.ts
│   │   └── Material.ts
│   ├── physics/           # Physics system
│   │   ├── PhysicsWorld.ts
│   │   ├── RigidBody.ts
│   │   └── Collider.ts
│   ├── audio/             # Audio system
│   │   ├── AudioManager.ts
│   │   └── Sound.ts
│   ├── ui/                # User interface
│   │   ├── UIManager.ts
│   │   └── Widget.ts
│   └── utils/             # Utility functions
│       ├── Math.ts
│       ├── EventBus.ts
│       └── AssetManager.ts
├── assets/                # Game assets
├── docs/                  # Documentation
├── tests/                 # Test suites
├── examples/              # Example implementations
└── tools/                 # Development tools
```

## 📝 Coding Standards

### TypeScript Guidelines

#### 1. Type Safety
- Always use strict TypeScript settings
- Avoid `any` type - use proper type definitions
- Use interfaces for object shapes
- Prefer `readonly` properties when possible

```typescript
// Good
interface PlayerConfig {
  readonly id: string;
  name: string;
  health: number;
  position: Vector3;
}

// Bad
interface PlayerConfig {
  id: any;
  name: any;
  health: any;
  position: any;
}
```

#### 2. Naming Conventions
- **Classes**: PascalCase (e.g., `PlayerController`)
- **Interfaces**: PascalCase with descriptive names (e.g., `PlayerConfig`)
- **Functions/Methods**: camelCase (e.g., `updatePlayerPosition`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_PLAYER_HEALTH`)
- **Private members**: prefix with underscore (e.g., `_privateMethod`)

#### 3. Documentation
- Use JSDoc comments for all public APIs
- Include parameter types and return types
- Provide usage examples for complex methods

```typescript
/**
 * Updates the player's position and handles collision detection.
 * @param deltaTime - Time elapsed since last frame in seconds
 * @param input - Current input state
 * @returns True if position was updated successfully
 * @example
 * ```typescript
 * const success = player.updatePosition(0.016, inputState);
 * if (!success) {
 *   console.warn('Player position update failed');
 * }
 * ```
 */
updatePosition(deltaTime: number, input: InputState): boolean {
  // Implementation
}
```

### Code Organization

#### 1. File Structure
- One class per file
- Group related functionality in directories
- Use index files for clean imports

```typescript
// src/ai/index.ts
export { NPC } from './NPC';
export { BehaviorTree } from './BehaviorTree';
export { Pathfinding } from './Pathfinding';
```

#### 2. Import Organization
```typescript
// External libraries
import { Vector3, Quaternion } from 'gl-matrix';

// Internal modules
import { Entity } from '@/core/Entity';
import { Component } from '@/core/Component';

// Relative imports
import { PlayerConfig } from './PlayerConfig';
```

#### 3. Class Structure
```typescript
class ExampleClass {
  // 1. Static properties
  private static readonly DEFAULT_CONFIG = { /* ... */ };
  
  // 2. Instance properties
  private _privateProperty: string;
  public readonly publicProperty: number;
  
  // 3. Constructor
  constructor(config: Config) {
    // Implementation
  }
  
  // 4. Public methods
  public publicMethod(): void {
    // Implementation
  }
  
  // 5. Private methods
  private _privateMethod(): void {
    // Implementation
  }
  
  // 6. Getters/Setters
  get property(): string {
    return this._privateProperty;
  }
  
  set property(value: string) {
    this._privateProperty = value;
  }
}
```

## 🧪 Testing Guidelines

### Test Structure

#### 1. Unit Tests
- Test individual components and methods
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
describe('PlayerController', () => {
  let player: PlayerController;
  let world: World;
  
  beforeEach(() => {
    world = new World();
    player = new PlayerController(world);
  });
  
  describe('updatePosition', () => {
    it('should move player forward when W key is pressed', () => {
      // Arrange
      const initialPosition = player.position;
      const input = { forward: true, backward: false };
      
      // Act
      player.updatePosition(0.016, input);
      
      // Assert
      expect(player.position.z).toBeGreaterThan(initialPosition.z);
    });
    
    it('should not move player when no input is provided', () => {
      // Arrange
      const initialPosition = player.position;
      const input = { forward: false, backward: false };
      
      // Act
      player.updatePosition(0.016, input);
      
      // Assert
      expect(player.position).toEqual(initialPosition);
    });
  });
});
```

#### 2. Integration Tests
- Test component interactions
- Test system integration
- Use realistic test data

```typescript
describe('PhysicsSystem Integration', () => {
  it('should handle collision between two rigid bodies', () => {
    // Arrange
    const world = new World();
    const physicsSystem = new PhysicsSystem();
    const body1 = new RigidBody(1.0);
    const body2 = new RigidBody(1.0);
    
    body1.setPosition(new Vector3(0, 0, 0));
    body2.setPosition(new Vector3(1, 0, 0));
    
    world.addEntity(new Entity().addComponent(body1));
    world.addEntity(new Entity().addComponent(body2));
    world.addSystem(physicsSystem);
    
    // Act
    physicsSystem.update(world.entities, 0.016);
    
    // Assert
    expect(body1.getVelocity().x).toBeLessThan(0);
    expect(body2.getVelocity().x).toBeGreaterThan(0);
  });
});
```

### Test Coverage
- Aim for 80%+ code coverage
- Test edge cases and error conditions
- Use mocking for external dependencies

## 🔧 Development Workflow

### 1. Feature Development

#### Branch Naming
```
feature/player-movement
feature/ai-behavior-trees
bugfix/collision-detection
hotfix/critical-performance-issue
```

#### Commit Messages
Use conventional commit format:
```
feat: add player movement system
fix: resolve collision detection bug
docs: update API documentation
test: add unit tests for physics system
refactor: improve rendering performance
```

### 2. Code Review Process

#### Before Submitting
- [ ] Code compiles without errors
- [ ] All tests pass
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] No console.log statements remain

#### Review Checklist
- [ ] Code is readable and well-documented
- [ ] Performance considerations are addressed
- [ ] Error handling is appropriate
- [ ] Security implications are considered
- [ ] Tests cover new functionality

### 3. Performance Guidelines

#### Memory Management
- Use object pooling for frequently created objects
- Dispose of resources properly
- Avoid memory leaks in event listeners

```typescript
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
}
```

#### Rendering Optimization
- Use frustum culling
- Implement LOD (Level of Detail)
- Batch similar draw calls
- Use efficient shaders

```typescript
class RenderOptimizer {
  private frustumCuller = new FrustumCuller();
  private lodSystem = new LODSystem();
  
  render(scene: Scene, camera: Camera): void {
    const visibleEntities = this.frustumCuller.cull(scene.entities, camera);
    const optimizedEntities = this.lodSystem.optimize(visibleEntities, camera);
    
    this.batchRenderer.render(optimizedEntities);
  }
}
```

## 🎮 Game Development Patterns

### 1. Entity Component System (ECS)

#### Component Design
```typescript
// Data-only components
class HealthComponent extends Component {
  currentHealth: number;
  maxHealth: number;
  regenerationRate: number;
}

// Behavior components
class PlayerControllerComponent extends Component {
  moveSpeed: number;
  jumpForce: number;
  canJump: boolean;
}
```

#### System Implementation
```typescript
class HealthSystem extends System {
  constructor() {
    super('HealthSystem', 100);
    this.requiredComponents = [HealthComponent];
  }
  
  update(entities: Entity[], deltaTime: number): void {
    entities.forEach(entity => {
      const health = entity.getComponent(HealthComponent);
      if (health && health.regenerationRate > 0) {
        health.currentHealth = Math.min(
          health.maxHealth,
          health.currentHealth + health.regenerationRate * deltaTime
        );
      }
    });
  }
}
```

### 2. Event-Driven Architecture

#### Event Definition
```typescript
interface PlayerDeathEvent {
  type: 'player.death';
  playerId: string;
  cause: string;
  position: Vector3;
  timestamp: number;
}
```

#### Event Handling
```typescript
class PlayerDeathHandler {
  constructor(eventBus: EventBus) {
    eventBus.subscribe<PlayerDeathEvent>('player.death', this.handleDeath.bind(this));
  }
  
  private handleDeath(event: PlayerDeathEvent): void {
    // Handle player death logic
    this.respawnPlayer(event.playerId);
    this.updateScoreboard(event.playerId);
    this.playDeathAnimation(event.position);
  }
}
```

### 3. State Management

#### Game State
```typescript
interface GameState {
  currentLevel: string;
  playerHealth: number;
  score: number;
  inventory: Item[];
  quests: Quest[];
}
```

#### State Management
```typescript
class GameStateManager {
  private state: GameState;
  private listeners: StateListener[] = [];
  
  updateState(updates: Partial<GameState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }
  
  subscribe(listener: StateListener): void {
    this.listeners.push(listener);
  }
}
```

## 🔒 Security Best Practices

### 1. Input Validation
```typescript
class InputValidator {
  static validatePlayerName(name: string): string {
    if (!name || name.length < 2 || name.length > 20) {
      throw new Error('Invalid player name');
    }
    
    // Sanitize input
    return name.replace(/[^a-zA-Z0-9_-]/g, '');
  }
  
  static validatePosition(position: Vector3): Vector3 {
    if (!this.isValidPosition(position)) {
      throw new Error('Invalid position');
    }
    return position;
  }
}
```

### 2. Data Protection
```typescript
class SecurityManager {
  private encryptionKey: CryptoKey;
  
  async encryptSaveData(data: any): Promise<string> {
    const jsonData = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonData);
    
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: this.generateIV() },
      this.encryptionKey,
      dataBuffer
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encryptedData)));
  }
}
```

## 📊 Performance Monitoring

### 1. Metrics Collection
```typescript
class PerformanceMonitor {
  private metrics: Map<string, Metric> = new Map();
  
  addMetric(name: string, metric: Metric): void {
    this.metrics.set(name, metric);
  }
  
  update(): void {
    this.metrics.forEach(metric => metric.update());
  }
  
  getReport(): PerformanceReport {
    return {
      fps: this.metrics.get('fps')?.value || 0,
      memoryUsage: this.metrics.get('memory')?.value || 0,
      renderTime: this.metrics.get('render')?.value || 0,
      updateTime: this.metrics.get('update')?.value || 0
    };
  }
}
```

### 2. Profiling Tools
```typescript
class Profiler {
  private timers: Map<string, Timer> = new Map();
  
  startTimer(name: string): void {
    this.timers.set(name, {
      startTime: performance.now(),
      endTime: 0
    });
  }
  
  endTimer(name: string): number {
    const timer = this.timers.get(name);
    if (timer) {
      timer.endTime = performance.now();
      return timer.endTime - timer.startTime;
    }
    return 0;
  }
}
```

## 🚀 Deployment

### 1. Build Process
```bash
# Production build
npm run build

# Development build with source maps
npm run build:dev

# Bundle for distribution
npm run bundle
```

### 2. Asset Optimization
- Compress textures and models
- Use appropriate file formats
- Implement asset streaming
- Optimize shader code

### 3. Testing in Production
- Use feature flags for gradual rollout
- Monitor performance metrics
- Collect error reports
- A/B test new features

---

*This development guide provides comprehensive guidelines for contributing to the Overworld Engine project. Follow these standards to ensure code quality, maintainability, and consistency across the codebase.* 