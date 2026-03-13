# Overworld Agents Briefing

This document merges the original README and project overview into a single reference for automation agents and human contributors.

## Project Purpose
- Build a modular TypeScript/WebGL 2.0 engine for large open worlds.
- Deliver advanced AI, procedural generation, and real-time rendering.
- Support rapid prototyping, research, and production-scale games.

## Architecture Snapshot
```
overworld/
├── src/
│   ├── core/          # Engine lifecycle, world, entity, component, system
│   ├── ai/            # NPC base classes, behavior trees, pathfinding, memory
│   ├── world/         # Generators for terrain, biomes, structures
│   ├── rendering/     # Renderer, materials, shaders, camera
│   ├── physics/       # Physics world, rigid bodies, colliders, constraints
│   ├── audio/         # Spatial audio manager and sound assets
│   ├── ui/            # UI manager and widgets
│   └── utils/         # Math helpers, asset manager, event bus
├── assets/            # Models, textures, audio, data
├── docs/              # Architecture, API, development, troubleshooting
├── tests/             # Unit, integration, performance suites
├── examples/          # Sample worlds, AI demos, rendering showcases
└── tools/             # Build scripts, profiler, debugger
```

## Getting Agents Started
### Prerequisites
- Node.js v18+
- TypeScript v5+
- WebGL-capable browser
- Git

### Install and Build
```bash
git clone <repository-url>
cd overworld
npm install
npm run build
npm run dev
```

### Quick Boot
```typescript
import { OverworldEngine } from './src/core/Engine';
import { WorldGenerator } from './src/world/WorldGenerator';

const engine = new OverworldEngine({
  canvas: document.getElementById('game-canvas'),
  width: 1920,
  height: 1080
});

const world = new WorldGenerator().generate({
  size: 1000,
  seed: 'my-world-seed'
});

engine.start(world);
```

## Core Subsystems
### AI
- Behavior trees drive complex decision logic.
- A* pathfinding with dynamic obstacle avoidance.
- Memory and emotion models persist NPC context.
- Extendable NPC types (villagers, merchants, guards, fauna).

### World Generation
- Perlin-noise terrain, deterministic seeds, biome definitions.
- Configurable structure placement and resource spawning.
- World configs define biome frequency, temperature, elevation, and structure rules.

### Rendering
- WebGL 2 pipeline with PBR materials, dynamic lighting, post-processing.
- Level-of-detail and culling for performance.
- Example vertex shader:
```glsl
#version 300 es
in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_modelViewProjection;
uniform mat4 u_normalMatrix;

out vec3 v_normal;
out vec2 v_texCoord;

void main() {
    gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
    v_normal = (u_normalMatrix * vec4(a_normal, 0.0)).xyz;
    v_texCoord = a_texCoord;
}
```

### Physics, Audio, UI
- Physics world handles rigid bodies, collisions, constraints, and spatial partitioning.
- Audio manager delivers 3D spatial audio, streaming, dynamic music transitions, and effects like reverb.
- UI manager orchestrates widgets, HUD components, and menu flows.

## Engine Patterns
### Entity Component System
```typescript
const player = new Entity('Player');
player.addComponent(new TransformComponent());
player.addComponent(new RenderComponent());
player.addComponent(new PhysicsComponent());
player.addComponent(new PlayerControllerComponent());
```

### System Pipeline
```typescript
class GameLoop {
  private systems = [
    new InputSystem(),
    new PhysicsSystem(),
    new AISystem(),
    new RenderingSystem(),
    new AudioSystem()
  ];

  update(deltaTime: number) {
    this.systems.forEach(system => system.update(deltaTime));
  }
}
```

### Event Bus
```typescript
eventBus.publish({
  type: 'player.death',
  data: { playerId: 'player1', cause: 'fall' },
  timestamp: Date.now()
});
```

## Tooling and Tests
- Entity inspector, performance monitor, world editor, and AI debugger support live debugging.
- Test suites cover unit, integration, and performance scenarios; CI automation recommended.
- Example world generation test:
```typescript
const world = new WorldGenerator().generate({ size: 100, seed: 'test' });
expect(world.terrain.width).toBe(100);
```

## Performance and Security
- Optimize with object pooling, quad-tree partitioning, LOD, frustum and occlusion culling, and asset streaming.
- Manage memory through resource caching, memory pools, low-GC patterns, and runtime telemetry.
- Monitor FPS, memory, entity counts, and render timing at runtime.
- Sanitize inputs, validate uploads, encrypt sensitive data, enforce authentication, and prefer HTTPS.

## Metrics and Targets
- Code: 100% TypeScript, ESLint rules, 80%+ coverage.
- Performance: 60 FPS on modern hardware, efficient memory, fast load times, scalable worlds.

## Use Cases
- Open-world, RPG, simulation, and educational titles.
- AI, procedural generation, rendering, and game design research.
- Rapid prototyping with modular systems and sample projects.

## Roadmap Highlights
- Multiplayer networking, VR/AR support, mobile optimization.
- Machine learning-driven AI extensions and modding APIs.
- Technology upgrades: WebGPU, WebAssembly, Web Workers, PWA capabilities.

## Contribution Workflow
1. Fork and create a feature branch.
2. Implement changes with strict TypeScript settings and comprehensive JSDoc.
3. Add tests and run the suite.
4. Optimize for performance and security.
5. Submit a pull request.

## Support Resources
- Primary docs live under `docs/` (architecture, API reference, development guide, troubleshooting).
- Examples in `examples/` demonstrate typical integrations (basic world, AI demo, rendering showcase).
- Use GitHub issues and discussions for questions, feature requests, and community help.
- Licensed under MIT; see `LICENSE`.

---
This unified brief is intended for automated agents and maintainers who need a concise but complete view of the Overworld engine.
