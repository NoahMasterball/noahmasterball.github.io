# Overworld Engine API Reference

## 📚 Core Engine API

### OverworldEngine

The main engine class that coordinates all systems and manages the game loop.

```typescript
class OverworldEngine {
  constructor(config: EngineConfig);
  
  // Lifecycle methods
  start(world: World): void;
  stop(): void;
  pause(): void;
  resume(): void;
  
  // World management
  loadWorld(worldData: WorldData): Promise<World>;
  unloadWorld(): void;
  getCurrentWorld(): World | null;
  
  // System management
  addSystem(system: System): void;
  removeSystem(systemName: string): void;
  getSystem<T extends System>(systemName: string): T | null;
  
  // Performance
  getFPS(): number;
  getMemoryUsage(): MemoryUsage;
  getPerformanceMetrics(): PerformanceMetrics;
}
```

#### EngineConfig
```typescript
interface EngineConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  targetFPS?: number;
  enableDebug?: boolean;
  enableProfiling?: boolean;
  systems?: System[];
}
```

### World

Represents the game world with all entities, systems, and environmental data.

```typescript
class World {
  constructor(config: WorldConfig);
  
  // Entity management
  addEntity(entity: Entity): void;
  removeEntity(entityId: string): void;
  getEntity(entityId: string): Entity | null;
  getEntitiesByComponent<T>(componentType: ComponentType<T>): Entity[];
  getEntitiesByTag(tag: string): Entity[];
  
  // System management
  addSystem(system: System): void;
  removeSystem(systemName: string): void;
  updateSystems(deltaTime: number): void;
  
  // World data
  getTerrain(): Terrain;
  getEnvironment(): Environment;
  getBiomeAt(position: Vector2): Biome;
  
  // Serialization
  serialize(): WorldData;
  deserialize(data: WorldData): void;
}
```

## 🧩 Entity Component System

### Entity

Game objects that can have multiple components attached.

```typescript
class Entity {
  constructor(name: string);
  
  // Component management
  addComponent<T extends Component>(component: T): void;
  removeComponent<T extends Component>(componentType: ComponentType<T>): void;
  getComponent<T extends Component>(componentType: ComponentType<T>): T | null;
  hasComponent<T extends Component>(componentType: ComponentType<T>): boolean;
  
  // Tag management
  addTag(tag: string): void;
  removeTag(tag: string): void;
  hasTag(tag: string): boolean;
  
  // Properties
  readonly id: string;
  name: string;
  active: boolean;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}
```

### Component

Data containers that define entity properties and behaviors.

```typescript
abstract class Component {
  constructor(entityId: string);
  
  // Lifecycle
  onAttach(entity: Entity): void;
  onDetach(entity: Entity): void;
  update(deltaTime: number): void;
  
  // Properties
  readonly entityId: string;
  readonly type: ComponentType;
}
```

#### Built-in Components

##### TransformComponent
```typescript
class TransformComponent extends Component {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  
  setPosition(x: number, y: number, z: number): void;
  setRotation(x: number, y: number, z: number, w: number): void;
  setScale(x: number, y: number, z: number): void;
  
  translate(translation: Vector3): void;
  rotate(rotation: Quaternion): void;
  lookAt(target: Vector3): void;
}
```

##### RenderComponent
```typescript
class RenderComponent extends Component {
  model: Model;
  material: Material;
  visible: boolean;
  castShadows: boolean;
  receiveShadows: boolean;
  
  setModel(model: Model): void;
  setMaterial(material: Material): void;
  setVisible(visible: boolean): void;
}
```

##### PhysicsComponent
```typescript
class PhysicsComponent extends Component {
  body: RigidBody;
  collider: Collider;
  mass: number;
  friction: number;
  restitution: number;
  
  applyForce(force: Vector3): void;
  applyImpulse(impulse: Vector3): void;
  setVelocity(velocity: Vector3): void;
  getVelocity(): Vector3;
}
```

### System

Processors that operate on entities with specific components.

```typescript
abstract class System {
  constructor(name: string, priority: number);
  
  // Lifecycle
  initialize(world: World): void;
  update(entities: Entity[], deltaTime: number): void;
  cleanup(): void;
  
  // Entity filtering
  getRelevantEntities(world: World): Entity[];
  
  // Properties
  readonly name: string;
  readonly priority: number;
  readonly requiredComponents: ComponentType[];
}
```

#### Built-in Systems

##### RenderingSystem
```typescript
class RenderingSystem extends System {
  constructor(renderer: Renderer);
  
  setCamera(camera: Camera): void;
  setLighting(lighting: Lighting): void;
  addPostProcessor(processor: PostProcessor): void;
  
  // Rendering pipeline
  render(world: World): void;
}
```

##### PhysicsSystem
```typescript
class PhysicsSystem extends System {
  constructor(physicsWorld: PhysicsWorld);
  
  setGravity(gravity: Vector3): void;
  addConstraint(constraint: Constraint): void;
  removeConstraint(constraint: Constraint): void;
  
  // Physics simulation
  step(deltaTime: number): void;
  raycast(origin: Vector3, direction: Vector3): RaycastResult;
}
```

## 🧠 AI System

### NPC

Non-player characters with AI behavior.

```typescript
class NPC extends Entity {
  constructor(config: NPCConfig);
  
  // AI behavior
  setBehaviorTree(tree: BehaviorTree): void;
  setMemory(memory: MemorySystem): void;
  setEmotion(emotion: Emotion): void;
  
  // Actions
  moveTo(target: Vector3): Promise<void>;
  interactWith(target: Entity): void;
  speak(message: string): void;
  
  // Properties
  readonly behaviorTree: BehaviorTree;
  readonly memory: MemorySystem;
  readonly emotion: Emotion;
}
```

### BehaviorTree

Decision-making system for AI entities.

```typescript
class BehaviorTree {
  constructor(root: BehaviorNode);
  
  update(npc: NPC, deltaTime: number): BehaviorStatus;
  reset(): void;
  
  // Tree manipulation
  addNode(parent: string, node: BehaviorNode): void;
  removeNode(nodeId: string): void;
  getNode(nodeId: string): BehaviorNode | null;
}
```

#### BehaviorNode Types

##### ActionNode
```typescript
class ActionNode extends BehaviorNode {
  constructor(action: (npc: NPC) => BehaviorStatus);
  
  execute(npc: NPC): BehaviorStatus;
}
```

##### ConditionNode
```typescript
class ConditionNode extends BehaviorNode {
  constructor(condition: (npc: NPC) => boolean);
  
  evaluate(npc: NPC): BehaviorStatus;
}
```

##### SequenceNode
```typescript
class SequenceNode extends BehaviorNode {
  constructor(children: BehaviorNode[]);
  
  execute(npc: NPC): BehaviorStatus;
}
```

##### SelectorNode
```typescript
class SelectorNode extends BehaviorNode {
  constructor(children: BehaviorNode[]);
  
  execute(npc: NPC): BehaviorStatus;
}
```

### Pathfinding

A* pathfinding with dynamic obstacle avoidance.

```typescript
class Pathfinder {
  constructor(navMesh: NavMesh);
  
  findPath(start: Vector3, end: Vector3): Path | null;
  findPathAsync(start: Vector3, end: Vector3): Promise<Path | null>;
  
  // Path optimization
  smoothPath(path: Path): Path;
  optimizePath(path: Path): Path;
}
```

## 🌍 World Generation

### WorldGenerator

Procedural world generation system.

```typescript
class WorldGenerator {
  constructor(config: GeneratorConfig);
  
  // Generation methods
  generate(config: GenerationConfig): World;
  generateAsync(config: GenerationConfig): Promise<World>;
  
  // Terrain generation
  generateTerrain(size: Vector2, seed: string): Terrain;
  generateBiomes(terrain: Terrain): BiomeMap;
  generateStructures(world: World): void;
  
  // Configuration
  setBiomeConfig(biomes: BiomeConfig[]): void;
  setStructureConfig(structures: StructureConfig[]): void;
}
```

### TerrainGenerator

Specialized terrain generation using various algorithms.

```typescript
class TerrainGenerator {
  constructor();
  
  // Height map generation
  generateHeightMap(size: Vector2, seed: string): Float32Array;
  generateHeightMapAsync(size: Vector2, seed: string): Promise<Float32Array>;
  
  // Noise algorithms
  perlinNoise(size: Vector2, scale: number, octaves: number): Float32Array;
  simplexNoise(size: Vector2, scale: number): Float32Array;
  cellularNoise(size: Vector2, scale: number): Float32Array;
  
  // Terrain modification
  erode(terrain: Terrain, iterations: number): void;
  smooth(terrain: Terrain, iterations: number): void;
}
```

## 🎨 Rendering System

### Renderer

WebGL 2.0 rendering system with modern graphics pipeline.

```typescript
class Renderer {
  constructor(canvas: HTMLCanvasElement);
  
  // Rendering pipeline
  render(scene: Scene, camera: Camera): void;
  renderDeferred(scene: Scene, camera: Camera): void;
  
  // Resource management
  createShader(vertexSource: string, fragmentSource: string): Shader;
  createTexture(data: ImageData | HTMLImageElement): Texture;
  createModel(geometry: Geometry): Model;
  
  // Settings
  setResolution(width: number, height: number): void;
  setQuality(quality: RenderQuality): void;
  enableFeature(feature: RenderFeature): void;
  disableFeature(feature: RenderFeature): void;
}
```

### Camera

View and projection management.

```typescript
class Camera {
  constructor();
  
  // Transform
  setPosition(position: Vector3): void;
  setRotation(rotation: Quaternion): void;
  lookAt(target: Vector3, up?: Vector3): void;
  
  // Projection
  setPerspective(fov: number, aspect: number, near: number, far: number): void;
  setOrthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): void;
  
  // Movement
  moveForward(distance: number): void;
  moveRight(distance: number): void;
  moveUp(distance: number): void;
  
  // Properties
  readonly viewMatrix: Matrix4;
  readonly projectionMatrix: Matrix4;
  readonly viewProjectionMatrix: Matrix4;
}
```

### Material

PBR material system with various rendering properties.

```typescript
class Material {
  constructor(name: string);
  
  // Textures
  setAlbedoTexture(texture: Texture): void;
  setNormalTexture(texture: Texture): void;
  setRoughnessTexture(texture: Texture): void;
  setMetallicTexture(texture: Texture): void;
  
  // Properties
  setAlbedo(color: Color): void;
  setRoughness(roughness: number): void;
  setMetallic(metallic: number): void;
  setEmissive(color: Color): void;
  
  // Shader
  setShader(shader: Shader): void;
  setUniform(name: string, value: UniformValue): void;
}
```

## ⚡ Physics System

### PhysicsWorld

Physics simulation world.

```typescript
class PhysicsWorld {
  constructor();
  
  // Simulation
  step(deltaTime: number): void;
  stepAsync(deltaTime: number): Promise<void>;
  
  // Body management
  addBody(body: RigidBody): void;
  removeBody(body: RigidBody): void;
  
  // Constraints
  addConstraint(constraint: Constraint): void;
  removeConstraint(constraint: Constraint): void;
  
  // Queries
  raycast(origin: Vector3, direction: Vector3): RaycastResult[];
  sphereCast(origin: Vector3, radius: number, direction: Vector3): RaycastResult[];
  overlapSphere(center: Vector3, radius: number): RigidBody[];
}
```

### RigidBody

Physics body with mass and collision properties.

```typescript
class RigidBody {
  constructor(mass: number);
  
  // Transform
  setPosition(position: Vector3): void;
  setRotation(rotation: Quaternion): void;
  setLinearVelocity(velocity: Vector3): void;
  setAngularVelocity(velocity: Vector3): void;
  
  // Forces
  applyForce(force: Vector3, point?: Vector3): void;
  applyImpulse(impulse: Vector3, point?: Vector3): void;
  applyTorque(torque: Vector3): void;
  
  // Properties
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  
  // Collision
  addCollider(collider: Collider): void;
  removeCollider(collider: Collider): void;
}
```

## 🔊 Audio System

### AudioManager

3D spatial audio system.

```typescript
class AudioManager {
  constructor();
  
  // Sound management
  loadSound(path: string): Promise<Sound>;
  playSound(sound: Sound, position?: Vector3): AudioSource;
  stopSound(source: AudioSource): void;
  
  // Music
  playMusic(path: string, loop?: boolean): void;
  stopMusic(): void;
  setMusicVolume(volume: number): void;
  
  // 3D audio
  setListenerPosition(position: Vector3): void;
  setListenerOrientation(forward: Vector3, up: Vector3): void;
  
  // Effects
  addReverb(room: number, dampening: number): void;
  addEcho(delay: number, decay: number): void;
}
```

## 🎮 Input System

### InputManager

Unified input handling for keyboard, mouse, and gamepad.

```typescript
class InputManager {
  constructor();
  
  // Keyboard
  isKeyPressed(key: KeyCode): boolean;
  isKeyJustPressed(key: KeyCode): boolean;
  isKeyJustReleased(key: KeyCode): boolean;
  
  // Mouse
  getMousePosition(): Vector2;
  getMouseDelta(): Vector2;
  isMouseButtonPressed(button: MouseButton): boolean;
  isMouseButtonJustPressed(button: MouseButton): boolean;
  
  // Gamepad
  getGamepadState(index: number): GamepadState | null;
  isGamepadButtonPressed(index: number, button: GamepadButton): boolean;
  getGamepadAxis(index: number, axis: GamepadAxis): number;
  
  // Events
  onKeyDown(callback: (key: KeyCode) => void): void;
  onKeyUp(callback: (key: KeyCode) => void): void;
  onMouseMove(callback: (position: Vector2) => void): void;
}
```

## 🔄 Event System

### EventBus

Decoupled event communication system.

```typescript
class EventBus {
  constructor();
  
  // Event handling
  subscribe<T>(eventType: string, listener: EventListener<T>): void;
  unsubscribe(eventType: string, listener: EventListener<T>): void;
  publish<T>(event: Event<T>): void;
  
  // Event queuing
  queueEvent<T>(event: Event<T>): void;
  processEventQueue(): void;
  
  // Event filtering
  subscribeOnce<T>(eventType: string, listener: EventListener<T>): void;
  subscribeWithFilter<T>(eventType: string, filter: EventFilter<T>, listener: EventListener<T>): void;
}
```

## 💾 Asset Management

### AssetManager

Resource loading and caching system.

```typescript
class AssetManager {
  constructor();
  
  // Loading
  loadTexture(path: string): Promise<Texture>;
  loadModel(path: string): Promise<Model>;
  loadSound(path: string): Promise<Sound>;
  loadData(path: string): Promise<any>;
  
  // Caching
  getCachedAsset<T>(path: string): T | null;
  cacheAsset<T>(path: string, asset: T): void;
  uncacheAsset(path: string): void;
  
  // Preloading
  preloadAssets(paths: string[]): Promise<void>;
  getLoadingProgress(): number;
  
  // Memory management
  getMemoryUsage(): MemoryUsage;
  cleanupUnusedAssets(): void;
}
```

## 🔧 Debug System

### DebugManager

Development and debugging tools.

```typescript
class DebugManager {
  constructor();
  
  // Metrics
  addMetric(name: string, metric: Metric): void;
  removeMetric(name: string): void;
  getMetric(name: string): Metric | null;
  
  // Visualizers
  addVisualizer(name: string, visualizer: Visualizer): void;
  removeVisualizer(name: string): void;
  showVisualizer(name: string): void;
  hideVisualizer(name: string): void;
  
  // Console
  log(message: string, level?: LogLevel): void;
  warn(message: string): void;
  error(message: string): void;
  
  // Profiling
  startTimer(name: string): void;
  endTimer(name: string): number;
  getProfilerReport(): ProfilerReport;
}
```

---

*This API reference provides comprehensive documentation for all major classes and methods in the Overworld Engine. Each section includes detailed type definitions, method signatures, and usage examples to help developers and AI systems understand and utilize the engine effectively.* 