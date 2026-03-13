/**
 * EntityRenderer — Zeichnet Spieler, NPCs und Fahrzeuge.
 * Portiert aus overworld.js Zeilen 7802-8085, 11068-11104, 1746-1852.
 */

export class EntityRenderer {
    /**
     * @param {import('./Renderer.js').Renderer} renderer
     */
    constructor(renderer) {
        this.renderer = renderer;
        this.ctx = renderer.getContext();
    }

    // --- Public API ---

    drawNPCs(npcs) {
        if (!npcs) return;
        for (const npc of npcs) {
            this.drawNPC(npc);
        }
    }

    drawVehicles(vehicles) {
        if (!vehicles) return;
        for (const vehicle of vehicles) {
            this.drawVehicleParts(vehicle);
        }
    }

    drawPlayer(player, weapon, mouse, nearBuilding) {
        const playerRenderable = {
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            parts: player.parts,
            animationPhase: player.animationPhase ?? 0,
            moving: player.moving
        };

        this.drawCharacterParts(playerRenderable);
        this.drawEquippedWeaponModel(playerRenderable, weapon, mouse);

        if (nearBuilding) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(player.x - 5, player.y - 36, 40, 26);
            this.ctx.fillStyle = '#FFF';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('E', player.x + 15, player.y - 18);
        }
    }

    // --- Character Parts ---

    drawCharacterParts(character) {
        if (!character || !character.parts) return;

        const phase = character.animationPhase ?? 0;
        const swing = Math.sin(phase);
        const bob = character.moving ? Math.abs(Math.cos(phase)) * 1.2 : 0;
        const centerX = character.x;
        const centerY = character.y;

        // Shadow pass
        for (const part of character.parts) {
            if (part.id !== 'shadow' || part.damaged) continue;
            this.ctx.save();
            this.ctx.fillStyle = part.color;
            if (part.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(centerX + part.offsetX, centerY + part.offsetY, part.radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (part.type === 'rect') {
                this.ctx.fillRect(centerX + part.offsetX, centerY + part.offsetY, part.width, part.height);
            }
            this.ctx.restore();
        }

        // Body pass with animation
        this.ctx.save();
        this.ctx.translate(centerX, centerY - bob);

        for (const part of character.parts) {
            if (part.damaged || part.id === 'shadow') continue;

            let offsetX = part.offsetX;
            let offsetY = part.offsetY;

            if (part.id === 'leftLeg') offsetY += swing * 2.4;
            else if (part.id === 'rightLeg') offsetY -= swing * 2.4;
            else if (part.id === 'leftArm') offsetY -= swing * 1.9;
            else if (part.id === 'rightArm') offsetY += swing * 1.9;

            this.ctx.fillStyle = part.color;
            if (part.type === 'rect') {
                this.ctx.fillRect(offsetX, offsetY, part.width, part.height);
            } else if (part.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(offsetX, offsetY, part.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        this.ctx.restore();
    }

    // --- NPC ---

    drawNPC(npc) {
        if (!npc || npc.hidden) return;
        this.drawCharacterParts(npc);
    }

    // --- Vehicle ---

    drawVehicleParts(vehicle) {
        if (!vehicle || !vehicle.parts) return;

        const rotation = vehicle.rotation ?? 0;
        this.ctx.save();
        this.ctx.translate(vehicle.x, vehicle.y);
        this.ctx.rotate(rotation);

        // Shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, vehicle.width / 2 + 6, vehicle.height / 2 + 4, 0, 0, Math.PI * 2);
        this.ctx.fill();

        for (const part of vehicle.parts) {
            if (part.damaged || part.visible === false) continue;
            this.ctx.fillStyle = part.color;
            if (part.type === 'rect') {
                this.ctx.fillRect(part.offsetX, part.offsetY, part.width, part.height);
            } else if (part.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(part.offsetX, part.offsetY, part.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        this.ctx.restore();
    }

    // --- Equipped Weapon on Character ---

    drawEquippedWeaponModel(renderable, weapon, mouse) {
        if (!weapon) return;

        const animationPhase = renderable?.animationPhase ?? 0;
        const moving = Boolean(renderable?.moving);
        const bob = moving ? Math.abs(Math.cos(animationPhase)) * 1.2 : 0;

        const originX = renderable?.x ?? 0;
        const originY = (renderable?.y ?? 0) - bob - 4;

        let aimX = (mouse?.worldX ?? originX) - (renderable?.x ?? 0);
        let aimY = (mouse?.worldY ?? originY) - (renderable?.y ?? 0);
        if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) { aimX = 1; aimY = 0; }

        let angle = Math.atan2(aimY, aimX);
        if (!Number.isFinite(angle)) angle = 0;

        const baseColor = '#1d1f24';
        const accentColor = weapon.displayColor ?? '#ffd166';

        this.ctx.save();
        this.ctx.translate(originX, originY);
        this.ctx.rotate(angle);

        if (weapon.id === 'assaultRifle') {
            const thickness = 8, bodyLength = 48, barrelLength = 14;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-18, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 18, -thickness * 0.35, barrelLength, thickness * 0.7);
            this.ctx.fillRect(-30, -thickness * 0.45, 12, thickness * 0.9);
            this.ctx.fillRect(-30, -thickness * 0.2, 12, thickness * 0.6);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(6, thickness * 0.2, 6, thickness);
        } else if (weapon.id === 'shotgun') {
            const thickness = 9, bodyLength = 44, barrelLength = 18;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-22, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 22, -thickness * 0.3, barrelLength, thickness * 0.6);
            this.ctx.fillRect(-32, -thickness * 0.2, 12, thickness * 0.4);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(-8, -thickness * 0.4, 14, thickness * 0.8);
        } else {
            const thickness = 6, bodyLength = 26, barrelLength = 10;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-8, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 8, -thickness * 0.3, barrelLength, thickness * 0.6);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(-6, -thickness / 2, 4, thickness);
        }

        this.ctx.restore();
    }

    // --- Weapon Silhouette (for weapon shop interior) ---

    drawWeaponSilhouette(cx, cy, weapon, options = {}) {
        if (!weapon) return;

        const scale = typeof options.scale === 'number' ? options.scale : 1;
        const alpha = typeof options.alpha === 'number' ? options.alpha : 1;
        const color = weapon.displayColor ?? '#ffd166';
        const outline = 'rgba(0, 0, 0, 0.34)';
        const dark = 'rgba(12, 18, 26, 0.75)';
        const accent = 'rgba(255, 255, 255, 0.28)';

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.scale(scale, scale);
        this.ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha));

        const fillRect = (x, y, w, h, style = color, stroke = true) => {
            this.ctx.fillStyle = style;
            this.ctx.fillRect(x, y, w, h);
            if (stroke) {
                this.ctx.strokeStyle = outline;
                this.ctx.lineWidth = 1.6;
                this.ctx.strokeRect(x, y, w, h);
            }
        };

        const drawCircle = (x, y, r, style = color, stroke = true) => {
            this.ctx.beginPath();
            this.ctx.arc(x, y, r, 0, Math.PI * 2);
            this.ctx.fillStyle = style;
            this.ctx.fill();
            if (stroke) {
                this.ctx.strokeStyle = outline;
                this.ctx.lineWidth = 1.4;
                this.ctx.stroke();
            }
        };

        const drawGrip = (x, y, w, h) => {
            fillRect(x, y, w, h, dark);
            fillRect(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.6, accent, false);
        };

        switch (weapon.id) {
            case 'pistol':
                fillRect(-30, -6, 46, 12);
                fillRect(-16, -11, 22, 5, accent);
                drawGrip(-10, 6, 18, 26);
                fillRect(-26, -2, 8, 4, dark);
                break;
            case 'smg':
                fillRect(-48, -8, 64, 16);
                fillRect(14, -4, 28, 8, dark);
                fillRect(-14, 8, 12, 22, color);
                fillRect(0, 10, 10, 24, dark);
                fillRect(-42, -4, 12, 12, accent);
                drawGrip(-22, 8, 12, 20);
                break;
            case 'assaultRifle':
                fillRect(-62, -8, 102, 16);
                fillRect(38, -4, 36, 8, dark);
                fillRect(-64, -3, 12, 12, dark);
                fillRect(-34, 8, 18, 24, dark);
                fillRect(-8, 10, 12, 28, color);
                fillRect(10, -12, 24, 8, accent);
                break;
            case 'shotgun':
                fillRect(-78, -5, 116, 10);
                fillRect(-72, 2, 102, 6, dark);
                fillRect(-32, 4, 30, 14, accent);
                drawGrip(-14, 12, 18, 22);
                fillRect(-84, -2, 14, 12, dark);
                break;
            case 'sniperRifle':
                fillRect(-94, -6, 148, 12);
                fillRect(52, -4, 38, 8, dark);
                fillRect(-60, -2, 22, 6, dark);
                fillRect(-32, -16, 44, 8, accent);
                drawCircle(-8, -18, 6, dark);
                drawGrip(-20, 10, 16, 26);
                break;
            case 'lmg':
                fillRect(-82, -10, 132, 20);
                fillRect(42, -6, 38, 10, dark);
                fillRect(-52, 8, 28, 20, dark);
                fillRect(-18, 10, 22, 30, color);
                fillRect(-74, -12, 22, 8, accent);
                drawCircle(-48, -16, 6, accent, false);
                fillRect(-56, 0, 18, 6, dark);
                break;
            default:
                fillRect(-30, -5, 60, 10);
                drawGrip(-10, 6, 18, 24);
                break;
        }

        this.ctx.globalAlpha = 1;
        this.ctx.restore();
    }
}
