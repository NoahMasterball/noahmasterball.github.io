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

        // Offscreen-Canvas fuer Nacht-Overlay mit Taschenlampen-Ausschnitten
        this._darkCanvas = document.createElement('canvas');
        this._darkCtx = this._darkCanvas.getContext('2d');
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
    drawHUD(player, fps, weaponCatalog, weaponInventory, weaponLoadout, weaponOrder, playerMoney, casinoCredits, casinoCreditRate, ownedPropertyCount) {
        if (this.playerPosEl) {
            this.playerPosEl.textContent = Math.round(player.x) + ", " + Math.round(player.y);
        }

        const weapon = this._getCurrentWeaponFromCatalog(player, weaponCatalog);
        const hudWidth = 520;
        const hudHeight = 290;
        const baseX = 10;
        const baseY = 60;
        let textY = baseY + 36;

        this.ctx.fillStyle = "rgba(12, 16, 24, 0.78)";
        this.ctx.fillRect(baseX, baseY, hudWidth, hudHeight);

        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "20px Arial";
        this.ctx.textAlign = "left";
        this.ctx.fillText("Kontostand: " + UIRenderer.formatMoney(playerMoney), baseX + 14, textY);
        textY += 30;
        this.ctx.fillText("Casino Credits: " + UIRenderer.formatCredits(casinoCredits) + " Credits", baseX + 14, textY);
        textY += 30;

        // Immobilien-Anzeige
        const propCount = ownedPropertyCount ?? 0;
        this.ctx.fillStyle = propCount > 0 ? '#4CAF50' : '#888';
        this.ctx.fillText("Immobilien: " + propCount, baseX + 14, textY);
        this.ctx.fillStyle = "#ffffff";
        textY += 30;
        this.ctx.fillText("Aktive Waffe: " + (weapon ? weapon.name : "Keine"), baseX + 14, textY);
        textY += 30;

        if (weapon) {
            const fireSeconds = (Number(weapon.fireRate ?? 0) / 1000).toFixed(1);
            this.ctx.fillText("Schaden: " + weapon.damage + " | Feuerrate: " + fireSeconds + " s", baseX + 14, textY);
        } else {
            this.ctx.fillText("Schaden: - | Feuerrate: -", baseX + 14, textY);
        }

        textY += 32;

        this.ctx.fillStyle = "#8ce0ff";
        this.ctx.font = "18px Arial";

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

        this.ctx.fillText(quickText, baseX + 14, textY);
        textY += 26;

        const ownedCount = weaponOrder.filter((id) => weaponInventory.has(id)).length;
        if (ownedCount > quickSlots.length) {
            const rangeStart = quickSlots.length + 1;
            const rangeEnd = ownedCount;
            const moreText = "Weitere Waffen: Tasten " + rangeStart + (rangeStart === rangeEnd ? "" : "-" + rangeEnd);
            this.ctx.fillText(moreText, baseX + 14, textY);
            textY += 26;
        }

        this.ctx.fillText("E: Interagieren | Casino: 1$ = " + (casinoCreditRate ?? 10) + " Credits", baseX + 14, textY);
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
    // ── Taschenlampen + Nacht-Overlay ──────────────────────────────────

    /**
     * Zeichnet das Nacht-Overlay mit Taschenlampen-Ausschnitten.
     * Nutzt einen Offscreen-Canvas: Dunkelheit malen, Kegel ausstanzen,
     * dann auf den Haupt-Canvas compositen.
     *
     * @param {number} overlayAlpha - aktuelle Dunkelheit (0-1)
     * @param {number} cameraX
     * @param {number} cameraY
     * @param {number} viewWidth  - sichtbare Viewport-Breite (Welt-Einheiten)
     * @param {number} viewHeight - sichtbare Viewport-Hoehe (Welt-Einheiten)
     * @param {Array<{x:number, y:number, angle:number, spread?:number, range?:number}>} flashlights
     */
    drawNightWithFlashlights(overlayAlpha, cameraX, cameraY, viewWidth, viewHeight, flashlights) {
        if (overlayAlpha < 0.05) return;

        const dc = this._darkCanvas;
        const dctx = this._darkCtx;

        // Offscreen-Canvas auf sichtbare Groesse anpassen
        const w = Math.ceil(viewWidth);
        const h = Math.ceil(viewHeight);
        if (dc.width !== w || dc.height !== h) {
            dc.width = w;
            dc.height = h;
        }

        // Dunkelheit fuellen
        dctx.clearRect(0, 0, w, h);
        dctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, overlayAlpha)})`;
        dctx.fillRect(0, 0, w, h);

        // Taschenlampen-Kegel ausstanzen
        if (flashlights && flashlights.length > 0) {
            dctx.globalCompositeOperation = 'destination-out';

            for (const fl of flashlights) {
                const spread = fl.spread ?? 0.45;
                const range = fl.range ?? 220;
                const angle = fl.angle;
                // Lokale Koordinaten relativ zum Offscreen-Canvas
                const cx = fl.x - cameraX;
                const cy = fl.y - cameraY;

                const leftAngle = angle - spread;
                const rightAngle = angle + spread;
                const tipX1 = cx + Math.cos(leftAngle) * range;
                const tipY1 = cy + Math.sin(leftAngle) * range;
                const tipX2 = cx + Math.cos(rightAngle) * range;
                const tipY2 = cy + Math.sin(rightAngle) * range;
                const midX = cx + Math.cos(angle) * range;
                const midY = cy + Math.sin(angle) * range;

                // Radialer Gradient fuer sanften Rand
                const grad = dctx.createRadialGradient(cx, cy, 6, cx, cy, range);
                grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
                grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.8)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

                dctx.beginPath();
                dctx.moveTo(cx, cy);
                dctx.lineTo(tipX1, tipY1);
                dctx.quadraticCurveTo(midX, midY, tipX2, tipY2);
                dctx.closePath();
                dctx.fillStyle = grad;
                dctx.fill();
            }

            dctx.globalCompositeOperation = 'source-over';
        }

        // Offscreen-Dunkelheit auf Haupt-Canvas zeichnen
        this.ctx.drawImage(dc, cameraX, cameraY, w, h);

        // Warmer Lichtschein der Taschenlampen (auf Haupt-Canvas)
        if (flashlights && flashlights.length > 0) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
            for (const fl of flashlights) {
                const spread = fl.spread ?? 0.45;
                const range = fl.range ?? 220;
                const angle = fl.angle;
                const cx = fl.x;
                const cy = fl.y;

                const leftAngle = angle - spread;
                const rightAngle = angle + spread;
                const tipX1 = cx + Math.cos(leftAngle) * range;
                const tipY1 = cy + Math.sin(leftAngle) * range;
                const tipX2 = cx + Math.cos(rightAngle) * range;
                const tipY2 = cy + Math.sin(rightAngle) * range;
                const midX = cx + Math.cos(angle) * range;
                const midY = cy + Math.sin(angle) * range;

                const warmGrad = this.ctx.createRadialGradient(cx, cy, 4, cx, cy, range);
                warmGrad.addColorStop(0, 'rgba(255, 245, 200, 0.10)');
                warmGrad.addColorStop(0.5, 'rgba(255, 235, 180, 0.04)');
                warmGrad.addColorStop(1, 'rgba(255, 230, 160, 0)');

                this.ctx.beginPath();
                this.ctx.moveTo(cx, cy);
                this.ctx.lineTo(tipX1, tipY1);
                this.ctx.quadraticCurveTo(midX, midY, tipX2, tipY2);
                this.ctx.closePath();
                this.ctx.fillStyle = warmGrad;
                this.ctx.fill();
            }
            this.ctx.restore();
        }
    }

    // ── Polizei-UI ─────────────────────────────────────────────────────

    /**
     * Zeichnet den Wanted-Indikator (Polizei-Sirene).
     * @param {boolean} wanted
     * @param {boolean} shootBack - Ob Polizei zurueckschiesst
     * @param {number} now - performance.now() fuer Blink-Animation
     */
    drawWantedIndicator(wanted, shootBack, now) {
        if (!wanted) return;

        const x = this.renderer.width - 280;
        const y = 20;

        // Hintergrund
        this.ctx.fillStyle = 'rgba(12, 16, 24, 0.85)';
        this.ctx.fillRect(x, y, 260, 60);

        // Blinkendes Polizei-Icon
        const blink = Math.sin(now * 0.008) > 0;
        this.ctx.fillStyle = blink ? '#3b82f6' : '#ef4444';
        this.ctx.beginPath();
        this.ctx.arc(x + 30, y + 30, 14, 0, Math.PI * 2);
        this.ctx.fill();

        // Text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(shootBack ? 'GESUCHT!' : 'POLIZEI', x + 54, y + 38);
    }

    /**
     * Zeichnet die Verhaftungs-Fortschrittsanzeige.
     * @param {number} progress - 0 bis 1
     */
    drawArrestProgress(progress) {
        if (progress <= 0.01) return;

        const barW = 320;
        const barH = 20;
        const x = (this.renderer.width - barW) / 2;
        const y = this.renderer.height - 100;

        // Hintergrund
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - 6, y - 30, barW + 12, barH + 44);

        // Label
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('VERHAFTUNG', x + barW / 2, y - 6);

        // Bar Hintergrund
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(x, y, barW, barH);

        // Bar Fortschritt
        this.ctx.fillStyle = '#ff4444';
        this.ctx.fillRect(x, y, barW * Math.min(1, progress), barH);
    }

    /**
     * Zeichnet den Stun-Effekt (blaue Blitze um den Bildschirm).
     * @param {number} stunTimer - Verbleibende Stun-Zeit in ms
     * @param {number} now
     */
    drawStunEffect(stunTimer, now) {
        if (stunTimer <= 0) return;

        const alpha = Math.min(0.4, stunTimer / 2000 * 0.4);
        const flash = Math.sin(now * 0.02) * 0.15;

        this.ctx.save();
        this.ctx.fillStyle = `rgba(50, 130, 255, ${alpha + flash})`;
        this.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

        // BETAEUBT Text
        this.ctx.fillStyle = `rgba(255, 255, 100, ${0.6 + flash})`;
        this.ctx.font = 'bold 42px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('BETAEUBT', this.renderer.width / 2, this.renderer.height / 2 - 40);

        this.ctx.restore();
    }

    /**
     * Zeichnet den Slow-Effekt (dezenter blauer Rand).
     * @param {number} slowTimer
     */
    drawSlowEffect(slowTimer) {
        if (slowTimer <= 0) return;

        const alpha = Math.min(0.2, slowTimer / 2000 * 0.2);
        this.ctx.save();

        // Vignette-Effekt
        const grad = this.ctx.createRadialGradient(
            this.renderer.width / 2, this.renderer.height / 2, this.renderer.height * 0.3,
            this.renderer.width / 2, this.renderer.height / 2, this.renderer.height * 0.7
        );
        grad.addColorStop(0, 'rgba(50, 130, 255, 0)');
        grad.addColorStop(1, `rgba(50, 130, 255, ${alpha})`);
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

        this.ctx.restore();
    }

    /**
     * Zeichnet den WASTED-Bildschirm.
     * @param {string} reason - 'arrested' oder 'killed'
     * @returns {{ buttonRect: {x:number, y:number, w:number, h:number} }}
     */
    drawWastedScreen(reason) {
        const w = this.renderer.width;
        const h = this.renderer.height;

        // Dunkler Overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 0, w, h);

        // Roter Streifen
        const stripeH = 160;
        const stripeY = h / 2 - stripeH / 2 - 40;
        this.ctx.fillStyle = 'rgba(180, 20, 20, 0.6)';
        this.ctx.fillRect(0, stripeY, w, stripeH);

        // WASTED Text
        this.ctx.fillStyle = '#cc1111';
        this.ctx.font = 'bold 96px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('WASTED', w / 2, stripeY + stripeH / 2);

        // Untertitel
        this.ctx.fillStyle = '#cccccc';
        this.ctx.font = '24px Arial';
        const fine = reason === 'killed' ? 500 : 250;
        const subtitle = reason === 'arrested'
            ? 'Du wurdest verhaftet. Strafe: ' + fine + '$'
            : 'Du wurdest ausgeschaltet. Strafe: ' + fine + '$';
        this.ctx.fillText(subtitle, w / 2, stripeY + stripeH + 40);

        // Respawn-Button
        const btnW = 300;
        const btnH = 60;
        const btnX = w / 2 - btnW / 2;
        const btnY = stripeY + stripeH + 70;

        this.ctx.fillStyle = '#2563eb';
        this.ctx.fillRect(btnX, btnY, btnW, btnH);
        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(btnX, btnY, btnW, btnH);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 26px Arial';
        this.ctx.fillText('RESPAWN', w / 2, btnY + btnH / 2);

        this.ctx.textBaseline = 'alphabetic';

        return { buttonRect: { x: btnX, y: btnY, w: btnW, h: btnH } };
    }

    /**
     * Zeichnet die Spieler-Gesundheitsanzeige.
     * @param {number} health
     * @param {number} maxHealth
     */
    drawPlayerHealth(health, maxHealth) {
        if (health >= maxHealth) return;

        const barW = 200;
        const barH = 14;
        const x = (this.renderer.width - barW) / 2;
        const y = this.renderer.height - 55;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.fillRect(x, y, barW, barH);

        const ratio = Math.max(0, health / maxHealth);
        const color = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, barW * ratio, barH);
    }

    /**
     * Zeichnet die Stamina-Bar (Sprint-Ausdauer).
     * @param {number} stamina - 0 bis 1
     */
    drawStaminaBar(stamina) {
        if (stamina >= 1) return;

        const barW = 200;
        const barH = 8;
        const x = (this.renderer.width - barW) / 2;
        const y = this.renderer.height - 38;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.fillRect(x, y, barW, barH);

        const ratio = Math.max(0, Math.min(1, stamina));
        const color = ratio > 0.4 ? '#38bdf8' : ratio > 0.15 ? '#f59e0b' : '#ef4444';
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, barW * ratio, barH);
    }

    _getCurrentWeaponFromCatalog(player, weaponCatalog) {
        const weaponId = player?.currentWeaponId ?? player?.equippedWeapon ?? null;
        if (!weaponId || !weaponCatalog) {
            return null;
        }
        return weaponCatalog?.get?.(weaponId) ?? weaponCatalog?.[weaponId] ?? null;
    }
}
