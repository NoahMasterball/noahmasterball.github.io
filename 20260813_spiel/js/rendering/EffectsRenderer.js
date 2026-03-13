/**
 * EffectsRenderer — Zeichnet Projektile und Blut-Decals.
 * Portiert aus overworld.js Zeilen 3104-3244.
 */

export class EffectsRenderer {
    /**
     * @param {import('./Renderer.js').Renderer} renderer
     */
    constructor(renderer) {
        this.renderer = renderer;
        this.ctx = renderer.getContext();
    }

    /**
     * Zeichnet alle Projektile.
     * @param {Array} projectiles
     * @param {string} scene - Aktuelle Szene ('overworld' oder 'weaponShop')
     * @param {object} [activeInterior] - Interior-Daten (originX, originY) für weaponShop
     */
    drawProjectiles(projectiles, scene = 'overworld', activeInterior = null) {
        if (!projectiles || !projectiles.length) return;

        this.ctx.save();

        if (scene === 'weaponShop') {
            if (!activeInterior) {
                this.ctx.restore();
                return;
            }
            this.ctx.translate(activeInterior.originX, activeInterior.originY);
            for (const projectile of projectiles) {
                if (projectile.scene !== 'weaponShop') continue;
                this.drawProjectileSprite(projectile);
            }
        } else {
            for (const projectile of projectiles) {
                if (projectile.scene === 'weaponShop') continue;
                this.drawProjectileSprite(projectile);
            }
        }

        this.ctx.restore();
    }

    /**
     * Zeichnet ein einzelnes Projektil.
     */
    drawProjectileSprite(projectile) {
        this.ctx.save();
        this.ctx.fillStyle = projectile.color;
        this.ctx.globalAlpha = 0.9;

        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 3.5, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.globalAlpha = 0.35;
        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    /**
     * Zeichnet alle Blut-Decals.
     * @param {Array} bloodDecals
     */
    drawBloodDecals(bloodDecals) {
        if (!bloodDecals || !bloodDecals.length) return;

        this.ctx.save();

        for (const decal of bloodDecals) {
            const gradient = this.ctx.createRadialGradient(
                decal.x, decal.y, 4,
                decal.x, decal.y, decal.radius * 1.4
            );
            gradient.addColorStop(0, 'rgba(200, 24, 34, 0.55)');
            gradient.addColorStop(1, 'rgba(110, 0, 0, 0.05)');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.ellipse(decal.x, decal.y, decal.radius * 1.3, decal.radius, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }
}
