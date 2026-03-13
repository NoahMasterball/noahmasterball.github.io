/**
 * Build script — concatenates all ES modules into bundle.js,
 * stripping import/export statements (including multi-line ones).
 */
const fs = require('fs');
const path = require('path');

const FILES = [
    'js/core/MathUtils.js',
    'js/core/EventBus.js',
    'js/data/ColorPalettes.js',
    'js/data/HouseStyles.js',
    'js/data/Persistence.js',
    'js/data/WeaponCatalog.js',
    'js/entities/Entity.js',
    'js/entities/buildHumanoidParts.js',
    'js/entities/Player.js',
    'js/entities/NPC.js',
    'js/entities/Vehicle.js',
    'js/world/RoadNetwork.js',
    'js/systems/CollisionSystem.js',
    'js/core/EntityMover.js',
    'js/systems/MovementSystem.js',
    'js/systems/InputSystem.js',
    'js/systems/CameraSystem.js',
    'js/systems/AISystem.js',
    'js/systems/VehicleSystem.js',
    'js/systems/CombatSystem.js',
    'js/systems/DayNightSystem.js',
    'js/world/BuildingFactory.js',
    'js/world/StreetDetails.js',
    'js/world/WorldGenerator.js',
    'js/interiors/InteriorManager.js',
    'js/interiors/WeaponShop.js',
    'js/interiors/Casino.js',
    'js/systems/InteractionSystem.js',
    'js/rendering/Renderer.js',
    'js/rendering/WorldRenderer.js',
    'js/rendering/BuildingRenderer.js',
    'js/rendering/EntityRenderer.js',
    'js/rendering/EffectsRenderer.js',
    'js/rendering/UIRenderer.js',
    'js/core/Game.js',
    'js/main.js',
];

function stripImportsExports(code) {
    // Remove multi-line imports:  import { ...\n...\n } from '...';
    code = code.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
    // Remove single-line imports:  import X from '...';  import { X } from '...';
    code = code.replace(/^import\s+.*from\s+['"][^'"]+['"];?\s*$/gm, '');
    // Remove bare imports:  import '...';
    code = code.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '');

    // Remove multi-line "import {" that span lines (the regex above handles most,
    // but for truly multi-line we need a stateful approach)
    const lines = code.split('\n');
    const result = [];
    let inImport = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (inImport) {
            // We're inside a multi-line import, skip until we find the closing line
            if (trimmed.includes('from ') && (trimmed.includes("'") || trimmed.includes('"'))) {
                inImport = false;
                continue; // skip the closing line
            }
            if (trimmed.endsWith(';')) {
                inImport = false;
            }
            continue; // skip this line
        }

        // Detect start of multi-line import
        if (/^import\s*\{/.test(trimmed) && !trimmed.includes('}')) {
            inImport = true;
            continue;
        }

        // Skip single-line import (shouldn't be needed after regex, but safety)
        if (/^import\s/.test(trimmed)) {
            continue;
        }

        // Convert export statements
        let out = line;
        out = out.replace(/^export\s+default\s+class\s/, 'class ');
        out = out.replace(/^export\s+default\s+function\s/, 'function ');
        out = out.replace(/^export\s+class\s/, 'class ');
        out = out.replace(/^export\s+function\s/, 'function ');
        out = out.replace(/^export\s+const\s/, 'const ');
        out = out.replace(/^export\s+let\s/, 'let ');
        out = out.replace(/^export\s+var\s/, 'var ');

        // Remove "export default X;" lines (just becomes "X;" which is harmless)
        out = out.replace(/^export\s+default\s+/, '');

        // Remove "export { ... };" lines
        if (/^export\s*\{/.test(out.trim())) {
            continue;
        }

        result.push(out);
    }

    return result.join('\n');
}

// Build
const parts = [];
parts.push(`// Auto-generated bundle — ${new Date().toISOString()}`);
parts.push('(function() {');
parts.push("'use strict';");
parts.push('');

for (const file of FILES) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.warn(`WARNING: ${file} not found, skipping`);
        continue;
    }
    const code = fs.readFileSync(filePath, 'utf-8');
    const stripped = stripImportsExports(code);

    parts.push('');
    parts.push('// ' + '═'.repeat(55));
    parts.push(`// ${file}`);
    parts.push('// ' + '═'.repeat(55));
    parts.push(stripped);
    parts.push('');
}

parts.push('');
parts.push('})();');

const output = parts.join('\n');
const outputPath = path.join(__dirname, 'bundle.js');
fs.writeFileSync(outputPath, output, 'utf-8');
console.log(`Done! Created bundle.js (${output.length} bytes, ${FILES.length} modules)`);
