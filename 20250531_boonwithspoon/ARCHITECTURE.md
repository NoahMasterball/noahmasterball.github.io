# Game Architecture Documentation

This document explains the structure and purpose of each file in the class-based game workspace. The architecture is designed to be modular, maintainable, and AI-friendly.

## Project Structure

```
game-workspace/
├── index.html              # Main HTML entry point
├── README.md               # Game overview and instructions
├── ARCHITECTURE.md         # This file - technical documentation
├── assets/                 # Static resources
│   ├── css/               
│   │   ├── main.css       # Core styling and layout
│   │   ├── ui.css         # User interface components
│   │   └── levels.css     # Level-specific styling
│   └── audio/             # Audio files (future expansion)
└── src/                   # JavaScript source code
    ├── main.js            # Game initialization and startup
    ├── core/              # Core game mechanics
    │   ├── Game.js        # Main game controller class
    │   ├── Player.js      # Player entity and controls
    │   ├── Enemy.js       # Enemy entities and AI
    │   ├── Collision.js   # Collision detection system
    │   └── Renderer.js    # Rendering and display management
    ├── levels/            # Level-specific code
    │   ├── Level.js       # Base level class (abstract)
    │   ├── Level1.js      # First level implementation
    │   ├── Level2.js      # Second level implementation
    │   └── LevelManager.js # Level loading and transitions
    ├── ui/                # User interface components
    │   ├── Menu.js        # Main menu system
    │   ├── GameUI.js      # In-game UI elements
    │   ├── GameOver.js    # Game over screen
    │   └── Settings.js    # Settings and options
    └── utils/             # Utility functions and managers
        ├── EventManager.js # Event handling system
        ├── AudioManager.js # Sound and music management
        └── Utils.js       # General utility functions
```

## File Purposes and Responsibilities

### Root Files

#### `index.html`
- **Purpose**: Main entry point for the game
- **Responsibility**: 
  - Loads all CSS and JavaScript files in correct order
  - Provides basic HTML structure
  - Sets up the game container
- **AI Modification**: Rarely needs changes unless adding new script files

#### `README.md`
- **Purpose**: User-facing documentation
- **Responsibility**: Game overview, features, and usage instructions
- **AI Modification**: Update when adding new features or changing gameplay

#### `ARCHITECTURE.md`
- **Purpose**: Technical documentation for developers and AI
- **Responsibility**: Explains code structure and file purposes
- **AI Modification**: Update when architecture changes or new files are added

### Assets Directory

#### `assets/css/main.css`
- **Purpose**: Core styling and layout
- **Responsibility**:
  - Basic page layout and typography
  - Game grid and entity styling
  - Utility classes and animations
  - Responsive design basics
- **AI Modification**: Modify for visual changes to core game elements

#### `assets/css/ui.css`
- **Purpose**: User interface styling
- **Responsibility**:
  - Menu systems and buttons
  - Game UI overlays
  - Settings panels
  - Game over screens
- **AI Modification**: Change for UI appearance and menu styling

#### `assets/css/levels.css`
- **Purpose**: Level-specific styling
- **Responsibility**:
  - Theme-specific visual elements
  - Level backgrounds and effects
  - Special animations for different levels
- **AI Modification**: Add new level themes or modify existing level appearance

### Core Game Classes

#### `src/core/Game.js`
- **Purpose**: Main game controller
- **Responsibility**:
  - Game state management
  - Main game loop
  - Coordination between all game systems
  - Game initialization and cleanup
- **AI Modification**: Central point for game logic changes

#### `src/core/Player.js`
- **Purpose**: Player entity management
- **Responsibility**:
  - Player movement and controls
  - Player state (position, health, etc.)
  - Input handling
  - Player-specific behaviors
- **AI Modification**: Change player abilities or controls

#### `src/core/Enemy.js`
- **Purpose**: Enemy entity management
- **Responsibility**:
  - Enemy AI and behavior
  - Movement patterns
  - Enemy types and abilities
  - Enemy state management
- **AI Modification**: Add new enemy types or modify AI behavior

#### `src/core/Collision.js`
- **Purpose**: Collision detection system
- **Responsibility**:
  - Entity collision detection
  - Boundary checking
  - Collision response handling
  - Spatial optimization
- **AI Modification**: Add new collision types or improve detection accuracy

#### `src/core/Renderer.js`
- **Purpose**: Rendering and display
- **Responsibility**:
  - DOM manipulation for game elements
  - Visual updates and animations
  - Performance optimization
  - Visual effects management
- **AI Modification**: Change how game elements are displayed

### Level System

#### `src/levels/Level.js`
- **Purpose**: Base level class (abstract)
- **Responsibility**:
  - Common level functionality
  - Level interface definition
  - Shared level methods
  - Level lifecycle management
- **AI Modification**: Add new common level features

#### `src/levels/Level1.js`
- **Purpose**: First level implementation
- **Responsibility**:
  - Level 1 specific layout and logic
  - Maze generation and rules
  - Level 1 enemies and objectives
- **AI Modification**: Change Level 1 design or mechanics

#### `src/levels/Level2.js`
- **Purpose**: Second level implementation
- **Responsibility**:
  - Level 2 specific layout and logic
  - Forest theme implementation
  - Level 2 unique mechanics
- **AI Modification**: Change Level 2 design or add new features

#### `src/levels/LevelManager.js`
- **Purpose**: Level loading and transitions
- **Responsibility**:
  - Level progression logic
  - Level loading and unloading
  - Transition effects
  - Level state persistence
- **AI Modification**: Add new levels or change progression system

### User Interface

#### `src/ui/Menu.js`
- **Purpose**: Main menu system
- **Responsibility**:
  - Start screen management
  - Menu navigation
  - Options access
  - Game startup
- **AI Modification**: Add new menu options or change menu flow

#### `src/ui/GameUI.js`
- **Purpose**: In-game UI elements
- **Responsibility**:
  - Score display
  - Timer management
  - Progress indicators
  - In-game overlays
- **AI Modification**: Add new UI elements or modify existing displays

#### `src/ui/GameOver.js`
- **Purpose**: Game over screen
- **Responsibility**:
  - Game over state management
  - Score display and high scores
  - Restart options
  - Game over animations
- **AI Modification**: Change game over behavior or add new features

#### `src/ui/Settings.js`
- **Purpose**: Settings and options
- **Responsibility**:
  - Game configuration
  - User preferences
  - Settings persistence
  - Options UI management
- **AI Modification**: Add new settings options or change configuration

### Utility Classes

#### `src/utils/EventManager.js`
- **Purpose**: Event handling system
- **Responsibility**:
  - Custom event system
  - Event delegation
  - Component communication
  - Event cleanup
- **AI Modification**: Add new event types or improve event handling

#### `src/utils/AudioManager.js`
- **Purpose**: Sound and music management
- **Responsibility**:
  - Audio playback control
  - Sound effect management
  - Volume control
  - Audio resource loading
- **AI Modification**: Add new sounds or change audio behavior

#### `src/utils/Utils.js`
- **Purpose**: General utility functions
- **Responsibility**:
  - Common helper functions
  - Mathematical utilities
  - Data manipulation
  - Performance utilities
- **AI Modification**: Add new utility functions as needed

#### `src/main.js`
- **Purpose**: Game initialization
- **Responsibility**:
  - Startup sequence
  - Class instantiation
  - Initial setup
  - Error handling
- **AI Modification**: Change startup behavior or add initialization steps

## Design Principles

### 1. Separation of Concerns
- Each file has a single, well-defined responsibility
- Minimal dependencies between components
- Clear interfaces between systems

### 2. Modularity
- Easy to modify individual components
- Simple to add new features
- Components can be tested independently

### 3. AI-Friendly Structure
- Descriptive file names
- Clear file purposes
- Minimal cross-file dependencies
- Well-documented interfaces

### 4. Scalability
- Easy to add new levels
- Simple to introduce new game mechanics
- Extensible class hierarchy

## Modification Guidelines

### Adding New Levels
1. Create new level file in `src/levels/`
2. Extend the base `Level` class
3. Add level-specific CSS in `assets/css/levels.css`
4. Register level in `LevelManager.js`

### Adding New UI Components
1. Create new UI class in `src/ui/`
2. Add styling in `assets/css/ui.css`
3. Integrate with main game flow

### Modifying Game Mechanics
1. Identify the appropriate core class
2. Make changes within that class
3. Update related documentation
4. Test interactions with other components

This architecture ensures that AI assistants can quickly understand the codebase and make targeted modifications without affecting unrelated systems. 