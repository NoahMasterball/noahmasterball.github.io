/**
 * UIRenderer - Zeichnet HUD, Crosshair, Tag/Nacht-Overlay und Sterne.
 */

export class UIRenderer {

    /**
     * @param {import('./Renderer.js').Renderer} renderer
     * @param {{playerPosEl?: HTMLElement|null, fpsEl?: HTMLElement|null}} domElements
     */
    constructor(renderer, domElements = {}) {
        this.renderer = renderer;
        this.ctx = renderer.ctx;
        this.playerPosEl = domElements.playerPosEl ?? null;
        this.fpsEl = domElements.fpsEl ?? null;
    }

    // ── Formatierungs-Hilfsfunktionen ───────────────────────────────────

    /**
     * Formatiert einen Geldbetrag als "G$ 1.234".
     * @param {number} amount
     * @returns {string}
     */
    static formatMoney(amount) {
        const numeric = Number(amount);
        const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return "G$ " + safeValue.toLocaleString("de-DE");
    }

    /**
     * Formatiert Credits als "1.234".
     * @param {number} amount
     * @returns {string}
     */
    static formatCredits(amount) {
        const numeric = Number(amount);
        const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return safeValue.toLocaleString("de-DE");
    }

    // ── HUD ─────────────────────────────────────────────────────────────

    /**
     * Zeichnet das Heads-Up-Display.
     * @param {object} player - Spielerobjekt mit x, y
     * @param {number} fps
     * @param {object} weaponCatalog - Waffenkatalog-Map (id -> Definition)
     * @param {Set} weaponInventory - Besessene Waffen-IDs
     * @param {Array<string>} weaponLoadout - Schnellzugriff-Slots
     * @param {Array<string>} weaponOrder - Reihenfolge aller Waffen
     * @param {number} playerMoney
     * @param {number} casinoCredits
     * @param {number} casinoCreditRate
     */
    drawHUD(player, fps, weaponCatalog, weaponInventory, weaponLoadout, weaponOrder, playerMoney, casinoCredits, casinoCreditRate) {
        if (this.playerPosEl) {
            this.playerPosEl.textContent = Math.round(player.x) + ", " + Math.round(player.y);
        }

        const weapon = this._getCurrentWeaponFromCatalog(player, weaponCatalog);
        const hudWidth = 420;
        const hudHeight = 200;
        const baseX = 10;
        const baseY = 60;
        let textY = baseY + 30;

        this.ctx.fillStyle = "rgba(12, 16, 24, 0.78)";
        this.ctx.fillRect(baseX, baseY, hudWidth, hudHeight);

        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "16px Arial";
        this.ctx.fillText("Kontostand: " + UIRenderer.formatMoney(playerMoney), baseX + 10, textY);
        textY += 24;
        this.ctx.fillText("Casino Credits: " + UIRenderer.formatCredits(casinoCredits) + " Credits", baseX + 10, textY);
        textY += 24;
        this.ctx.fillText("Aktive Waffe: " + (weapon ? weapon.name : "Keine"), baseX + 10, textY);
        textY += 24;

        if (weapon) {
            const fireSeconds = (Number(weapon.fireRate ?? 0) / 1000).toFixed(1);
            this.ctx.fillText("Schaden: " + weapon.damage + " | Feuerrate: " + fireSeconds + " s", baseX + 10, textY);
        } else {
            this.ctx.fillText("Schaden: - | Feuerrate: -", baseX + 10, textY);
        }

        textY += 26;

        this.ctx.fillStyle = "#8ce0ff";
        this.ctx.font = "14px Arial";

        const quickSlots = Array.isArray(weaponLoadout) ? weaponLoadout : [];
        const slotLabels = [];

        for (let i = 0; i < quickSlots.length; i++) {
            const slotId = quickSlots[i];
            const def = weaponCatalog?.get?.(slotId) ?? weaponCatalog?.[slotId] ?? null;
            const label = def?.shortLabel ?? def?.name ?? slotId;
            slotLabels.push((i + 1) + ": " + label);
        }

        const quickText = slotLabels.length
            ? "Schnellzugriff " + slotLabels.join(" | ") + " | Shift: Sprint"
            : "Shift: Sprint";

        this.ctx.fillText(quickText, baseX + 10, textY);
        textY += 20;

        const ownedCount = weaponOrder.filter((id) => weaponInventory.has(id)).length;
        if (ownedCount > quickSlots.length) {
            const rangeStart = quickSlots.length + 1;
            const rangeEnd = ownedCount;
            const moreText = "Weitere Waffen: Tasten " + rangeStart + (rangeStart === rangeEnd ? "" : "-" + rangeEnd);
            this.ctx.fillText(moreText, baseX + 10, textY);
            textY += 20;
        }

        this.ctx.fillText("E: Interagieren | Casino: 1$ = " + (casinoCreditRate ?? 10) + " Credits", baseX + 10, textY);
    }

    // ── Crosshair ───────────────────────────────────────────────────────

    /**
     * Zeichnet das Fadenkreuz an der Mausposition.
     * @param {{x:number, y:number}} mouse
     */
    drawCrosshair(mouse) {
        const x = Number(mouse?.x ?? 0);
        const y = Number(mouse?.y ?? 0);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        this.ctx.lineWidth = 1.5;

        this.ctx.beginPath();
        this.ctx.moveTo(x - 14, y);
        this.ctx.lineTo(x - 4, y);
        this.ctx.moveTo(x + 4, y);
        this.ctx.lineTo(x + 14, y);
        this.ctx.moveTo(x, y - 14);
        this.ctx.lineTo(x, y - 4);
        this.ctx.moveTo(x, y + 4);
        this.ctx.lineTo(x, y + 14);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.restore();
    }

    // ── Tag/Nacht-Overlay ───────────────────────────────────────────────

    /**
     * Zeichnet das Tag/Nacht-Beleuchtungsoverlay.
     * @param {{overlayAlpha:number, overlayTop:string, overlayBottom:string, horizon:object|null, starAlpha:number}} lighting
     * @param {number} cameraX
     * @param {number} cameraY
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     * @param {Array} stars - Sternen-Array aus DayNightSystem
     * @param {number} starPhase - Aktuelle Sternenphase
     */
    drawDayNightOverlay(lighting, cameraX, cameraY, canvasWidth, canvasHeight, stars, starPhase) {
        if (!lighting) {
            return;
        }

        const { overlayAlpha, overlayTop, overlayBottom, horizon, starAlpha } = lighting;

        if (overlayAlpha > 0.001) {
            const gradient = this.ctx.createLinearGradient(
                cameraX,
                cameraY,
                cameraX,
                cameraY + canvasHeight
            );

            gradient.addColorStop(0, overlayTop ?? 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, overlayBottom ?? 'rgba(0, 0, 0, 0)');

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, Math.min(1, Number(overlayAlpha) || 0));
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(cameraX, cameraY, canvasWidth, canvasHeight);
            this.ctx.restore();
        }

        if (horizon && horizon.alpha > 0.001) {
            const offset = Math.max(0, Math.min(0.9, Number(horizon.offsetTop) || 0.2));
            const startY = cameraY + canvasHeight * offset;

            const gradient = this.ctx.createLinearGradient(
                cameraX,
                startY,
                cameraX,
                cameraY + canvasHeight
            );

            gradient.addColorStop(0, horizon.top ?? 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, horizon.bottom ?? 'rgba(0, 0, 0, 0)');

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, Math.min(1, Number(horizon.alpha) || 0));
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(cameraX, cameraY, canvasWidth, canvasHeight);
            this.ctx.restore();
        }

        if (starAlpha > 0.001) {
            this.drawNightSkyStars(stars, starAlpha, starPhase, cameraX, cameraY, canvasWidth, canvasHeight);
        }
    }

    // ── Sterne ──────────────────────────────────────────────────────────

    /**
     * Zeichnet die Sterne am Nachthimmel.
     * @param {Array} stars
     * @param {number} alpha
     * @param {number} starPhase
     * @param {number} cameraX
     * @param {number} cameraY
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     */
    drawNightSkyStars(stars, alpha, starPhase, cameraX, cameraY, canvasWidth, canvasHeight) {
        if (!Array.isArray(stars) || stars.length === 0) {
            return;
        }

        const baseAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));

        if (baseAlpha <= 0) {
            return;
        }

        const phase = starPhase ?? 0;

        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';

        for (const star of stars) {
            const twinkleSpeed = Math.max(0.2, Number(star?.twinkleSpeed) || 1);
            const offset = Number(star?.twinkleOffset) || 0;
            const baseIntensity = Math.max(0, Math.min(1, Number(star?.baseIntensity) || 0.7));

            const twinkle = Math.sin(phase * twinkleSpeed + offset) * 0.5 + 0.5;
            const intensity = baseIntensity * (0.6 + 0.4 * twinkle);
            const starAlpha = baseAlpha * Math.max(0, Math.min(1, intensity));

            if (starAlpha <= 0.02) {
                continue;
            }

            const x = cameraX + (Number(star?.x) || 0) * canvasWidth;
            const y = cameraY + (Number(star?.y) || 0) * canvasHeight;
            const size = Math.max(0.4, Number(star?.size) || 1);

            this.ctx.globalAlpha = starAlpha;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    // ── FPS ─────────────────────────────────────────────────────────────

    /**
     * Aktualisiert die FPS-Anzeige im DOM.
     * @param {number} fps
     */
    updateFPSDisplay(fps) {
        if (this.fpsEl) {
            this.fpsEl.textContent = fps;
        }
    }

    // ── Intern ──────────────────────────────────────────────────────────

    /**
     * Ermittelt die aktive Waffe aus dem Katalog anhand der Spielerdaten.
     * @param {object} player
     * @param {object} weaponCatalog
     * @returns {object|null}
     */
    _getCurrentWeaponFromCatalog(player, weaponCatalog) {
        const weaponId = player?.currentWeaponId ?? player?.equippedWeapon ?? null;
        if (!weaponId || !weaponCatalog) {
            return null;
        }
        return weaponCatalog?.get?.(weaponId) ?? weaponCatalog?.[weaponId] ?? null;
    }
}
