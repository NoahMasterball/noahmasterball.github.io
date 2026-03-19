const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const JS = path.join(BASE, 'js');

const FILES = [
  'js/core/MathUtils.js',
  'js/core/EventBus.js',
  'js/core/EntityMover.js',
  'js/entities/Entity.js',
  'js/entities/buildHumanoidParts.js',
  'js/entities/Player.js',
  'js/entities/NPC.js',
  'js/entities/Vehicle.js',
  'js/data/WeaponCatalog.js',
  'js/data/ColorPalettes.js',
  'js/data/HouseStyles.js',
  'js/data/Persistence.js',
  'js/systems/RealEstateSystem.js',
  'js/world/BuildingFactory.js',
  'js/world/RoadNetwork.js',
  'js/world/StreetDetails.js',
  'js/world/WorldGenerator.js',
  'js/systems/InputSystem.js',
  'js/systems/MovementSystem.js',
  'js/systems/CollisionSystem.js',
  'js/systems/CombatSystem.js',
  'js/systems/PoliceSystem.js',
  'js/systems/AISystem.js',
  'js/systems/VehicleSystem.js',
  'js/systems/CameraSystem.js',
  'js/systems/DayNightSystem.js',
  'js/systems/InteractionSystem.js',
  'js/rendering/Renderer.js',
  'js/rendering/WorldRenderer.js',
  'js/rendering/BuildingRenderer.js',
  'js/rendering/EntityRenderer.js',
  'js/rendering/EffectsRenderer.js',
  'js/rendering/UIRenderer.js',
  'js/rendering/PhoneUI.js',
  'js/interiors/InteriorManager.js',
  'js/interiors/WeaponShop.js',
  'js/interiors/Casino.js',
  'js/core/Game.js',
  'js/main.js',
];

function stripImportsExports(code) {
  const lines = code.split('\n');
  const result = [];
  let inMultiLineImport = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip multi-line import continuation
    if (inMultiLineImport) {
      if (line.includes(';') || line.match(/from\s+['"]/)) {
        inMultiLineImport = false;
      }
      continue;
    }

    // Skip single-line imports
    if (/^\s*import\s+/.test(line) || /^\s*import\s*\{/.test(line)) {
      if (!line.includes(';') && !line.match(/from\s+['"].*['"]\s*;?\s*$/)) {
        inMultiLineImport = true;
      }
      continue;
    }

    // Skip "export default ClassName;" standalone lines
    if (/^\s*export\s+default\s+\w+\s*;?\s*$/.test(line)) {
      continue;
    }

    // Skip "export { ... };" lines
    if (/^\s*export\s*\{/.test(line)) {
      if (!line.includes(';')) inMultiLineImport = true;
      continue;
    }

    // Replace export keywords
    line = line.replace(/^(\s*)export\s+class\s/, '$1class ');
    line = line.replace(/^(\s*)export\s+function\s/, '$1function ');
    line = line.replace(/^(\s*)export\s+const\s/, '$1const ');
    line = line.replace(/^(\s*)export\s+let\s/, '$1let ');

    result.push(line);
  }

  return result.join('\n');
}

let output = `// Auto-generated bundle — ${new Date().toISOString()}\n(function() {\n'use strict';\n\n`;

for (const file of FILES) {
  const fullPath = path.join(BASE, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`MISSING: ${file}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const stripped = stripImportsExports(raw);

  output += `\n\n// ═══════════════════════════════════════════════════════\n`;
  output += `// ${file}\n`;
  output += `// ═══════════════════════════════════════════════════════\n`;
  output += stripped;
  output += '\n';
}

output += '\n})();\n';

fs.writeFileSync(path.join(BASE, 'bundle.js'), output, 'utf-8');
console.log(`Bundle written: ${output.split('\n').length} lines`);
