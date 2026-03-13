/**
 * DayNightSystem - Verwaltet den Tag/Nacht-Zyklus mit Phasen, Beleuchtung und Sternen.
 */

export class DayNightSystem {

    constructor() {
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

        this.phases = [
            { id: "day", duration: 300000 },
            { id: "dusk", duration: 120000 },
            { id: "night", duration: 300000 },
            { id: "dawn", duration: 120000 }
        ];

        this.phaseIndex = 0;
        this.phaseStart = now;
        this.lastUpdate = now;
        this.progress = 0;
        this.currentPhase = this.phases[0];
        this.starPhase = 0;
        this.stars = DayNightSystem.generateNightSkyStars(160);

        this.lighting = {
            overlayAlpha: 0,
            overlayTop: "rgba(0, 0, 0, 0)",
            overlayBottom: "rgba(0, 0, 0, 0)",
            horizon: null,
            starAlpha: 0
        };
    }

    /**
     * Erzeugt zufaellige Sterne fuer den Nachthimmel.
     * @param {number} count
     * @returns {Array<{x:number,y:number,size:number,twinkleOffset:number,twinkleSpeed:number,baseIntensity:number}>}
     */
    static generateNightSkyStars(count = 160) {
        const total = Math.max(0, Math.floor(count));
        const stars = [];

        for (let i = 0; i < total; i++) {
            const randomness = Math.random();
            stars.push({
                x: Math.random(),
                y: Math.random() * 0.65,
                size: 0.6 + Math.random() * 1.4,
                twinkleOffset: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.6 + Math.random() * 1.4,
                baseIntensity: 0.4 + randomness * 0.6
            });
        }

        return stars;
    }

    /**
     * Aktualisiert den Zyklus anhand des aktuellen Zeitstempels.
     * @param {number} now - Zeitstempel in Millisekunden (performance.now)
     */
    update(now) {
        if (!Array.isArray(this.phases) || this.phases.length === 0) {
            return;
        }

        if (!Number.isFinite(this.phaseIndex)) {
            this.phaseIndex = 0;
        }

        if (!Number.isFinite(this.phaseStart)) {
            this.phaseStart = now;
        }

        let phase = this.phases[Math.max(0, Math.min(this.phaseIndex, this.phases.length - 1))];
        let elapsed = now - this.phaseStart;

        if (!Number.isFinite(elapsed) || elapsed < 0) {
            elapsed = 0;
            this.phaseStart = now;
            phase = this.phases[0];
            this.phaseIndex = 0;
        }

        let duration = Math.max(1, Number(phase.duration) || 0);

        while (elapsed >= duration) {
            elapsed -= duration;
            this.phaseIndex = (this.phaseIndex + 1) % this.phases.length;
            phase = this.phases[this.phaseIndex];
            duration = Math.max(1, Number(phase.duration) || 0);
            this.phaseStart = now - elapsed;
        }

        const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;

        const delta = now - (this.lastUpdate ?? now);
        this.lastUpdate = now;

        if (!Number.isFinite(this.starPhase)) {
            this.starPhase = 0;
        }

        if (Number.isFinite(delta) && delta > 0) {
            this.starPhase = (this.starPhase + delta * 0.0015) % (Math.PI * 2);
        }

        this.progress = progress;
        this.currentPhase = phase;
        this.lighting = this.computeLighting(String(phase.id ?? ''), progress);
    }

    /**
     * Gibt das aktuelle Lighting-Objekt zurueck.
     * @returns {{phaseId:string, overlayAlpha:number, overlayTop:string, overlayBottom:string, horizon:object|null, starAlpha:number}}
     */
    getCurrentLighting() {
        return this.lighting;
    }

    // ── Beleuchtungsberechnung ──────────────────────────────────────────

    /**
     * Berechnet die Beleuchtungswerte fuer eine Phase und deren Fortschritt.
     * @param {string} phaseId
     * @param {number} progress - 0..1
     * @returns {{phaseId:string, overlayAlpha:number, overlayTop:string, overlayBottom:string, horizon:object|null, starAlpha:number}}
     */
    computeLighting(phaseId, progress) {
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        const sampleStops = (stops, value) => DayNightSystem.sampleColorStops(stops, Math.max(0, Math.min(1, value)));

        const duskSkyStops = [
            { at: 0, color: [68, 106, 196, 0.86] },
            { at: 0.33, color: [255, 150, 90, 0.92] },
            { at: 0.66, color: [186, 58, 48, 0.96] },
            { at: 1, color: [8, 8, 20, 1] }
        ];

        const duskHorizonStops = [
            { at: 0, color: [255, 210, 140, 0.85] },
            { at: 0.4, color: [255, 142, 64, 0.9] },
            { at: 0.75, color: [196, 52, 44, 0.92] },
            { at: 1, color: [12, 10, 28, 0.96] }
        ];

        const nightSkyTop = [16, 24, 58, 0.92];
        const nightSkyBottom = [6, 10, 24, 0.96];

        const result = {
            phaseId: phaseId || 'day',
            overlayAlpha: 0,
            overlayTop: 'rgba(0, 0, 0, 0)',
            overlayBottom: 'rgba(0, 0, 0, 0)',
            horizon: null,
            starAlpha: 0
        };

        switch (phaseId) {

            case 'dusk': {
                const skyTop = sampleStops(duskSkyStops, t);
                const skyBottom = sampleStops(duskHorizonStops, Math.min(1, t + 0.15));
                const horizonTop = sampleStops(duskHorizonStops, Math.max(0, t - 0.15));
                const horizonBottom = sampleStops(duskHorizonStops, t);

                result.overlayAlpha = 0.35 + t * 0.35;
                result.overlayTop = DayNightSystem.colorArrayToRgba(skyTop);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(skyBottom);
                result.horizon = {
                    alpha: 0.35 + t * 0.45,
                    top: DayNightSystem.colorArrayToRgba(horizonTop),
                    bottom: DayNightSystem.colorArrayToRgba(horizonBottom),
                    offsetTop: 0.25
                };
                result.starAlpha = Math.max(0, t - 0.4) * 0.9;
                break;
            }

            case 'night': {
                result.overlayAlpha = 0.62;
                result.overlayTop = DayNightSystem.colorArrayToRgba(nightSkyTop);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(nightSkyBottom);
                result.horizon = {
                    alpha: 0.25,
                    top: DayNightSystem.colorArrayToRgba([32, 30, 60, 0.52]),
                    bottom: DayNightSystem.colorArrayToRgba([12, 10, 22, 0.68]),
                    offsetTop: 0.3
                };
                result.starAlpha = 0.75;
                break;
            }

            case 'dawn': {
                const reverse = 1 - t;
                const skyTop = sampleStops(duskSkyStops, reverse);
                const skyBottom = sampleStops(duskHorizonStops, Math.min(1, reverse + 0.1));
                const horizonTop = sampleStops(duskHorizonStops, reverse);
                const horizonBottom = sampleStops(duskHorizonStops, Math.max(0, reverse - 0.1));

                result.overlayAlpha = 0.52 * reverse;
                result.overlayTop = DayNightSystem.colorArrayToRgba(skyTop);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(skyBottom);
                result.horizon = {
                    alpha: 0.28 + reverse * 0.3,
                    top: DayNightSystem.colorArrayToRgba(horizonTop),
                    bottom: DayNightSystem.colorArrayToRgba(horizonBottom),
                    offsetTop: 0.28
                };
                result.starAlpha = Math.max(0, reverse - 0.25) * 0.7;
                break;
            }

            case 'day':
            default: {
                const warmFactor = Math.sin(t * Math.PI);
                const top = DayNightSystem.lerpColor([255, 250, 238, 0.08], [255, 236, 204, 0.18], warmFactor);
                const bottom = DayNightSystem.lerpColor([255, 236, 196, 0.1], [255, 220, 174, 0.18], warmFactor);

                result.overlayAlpha = 0.18 + warmFactor * 0.05;
                result.overlayTop = DayNightSystem.colorArrayToRgba(top);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(bottom);
                result.horizon = {
                    alpha: 0.2 + warmFactor * 0.12,
                    top: DayNightSystem.colorArrayToRgba([255, 232, 188, 0.32 + warmFactor * 0.1]),
                    bottom: DayNightSystem.colorArrayToRgba([255, 214, 162, 0.34 + warmFactor * 0.12]),
                    offsetTop: 0.35
                };
                result.starAlpha = 0;
                break;
            }

        }

        return result;
    }

    // ── Statische Farb-Hilfsfunktionen ──────────────────────────────────

    /**
     * Interpoliert zwischen Farbstops anhand eines Werts (0..1).
     * @param {Array<{at:number, color:number[]}>} stops
     * @param {number} value
     * @returns {number[]}
     */
    static sampleColorStops(stops, value) {
        if (!Array.isArray(stops) || stops.length === 0) {
            return [0, 0, 0, 0];
        }

        const t = Math.max(0, Math.min(1, Number(value) || 0));
        let previous = stops[0];

        for (let i = 1; i < stops.length; i++) {
            const current = stops[i];
            const prevAt = Number(previous?.at ?? 0);
            const currAt = Number(current?.at ?? 1);

            if (t <= currAt) {
                const range = Math.max(1e-6, currAt - prevAt);
                const localT = Math.max(0, Math.min(1, (t - prevAt) / range));
                return DayNightSystem.lerpColor(previous?.color, current?.color, localT);
            }

            previous = current;
        }

        const lastColor = stops[stops.length - 1]?.color;
        return Array.isArray(lastColor) ? lastColor.slice() : [0, 0, 0, 0];
    }

    /**
     * Lineare Interpolation zwischen zwei Farbarrays [r, g, b, a].
     * @param {number[]} colorA
     * @param {number[]} colorB
     * @param {number} t - 0..1
     * @returns {number[]}
     */
    static lerpColor(colorA, colorB, t) {
        const clampT = Math.max(0, Math.min(1, Number(t) || 0));

        const getComponent = (arr, index) => {
            if (!Array.isArray(arr) || arr.length === 0) {
                return index === 3 ? 1 : 0;
            }
            if (index < arr.length) {
                return Number(arr[index]);
            }
            if (index === 3) {
                return arr.length > 3 ? Number(arr[3]) : 1;
            }
            return Number(arr[Math.min(index, arr.length - 1)]);
        };

        const result = [];
        for (let i = 0; i < 4; i++) {
            const compA = getComponent(colorA, i);
            const compB = getComponent(colorB, i);
            result[i] = compA + (compB - compA) * clampT;
        }

        return result;
    }

    /**
     * Wandelt ein Farbarray [r, g, b, a] in einen rgba()-String um.
     * @param {number[]} color
     * @param {number} alphaMultiplier
     * @returns {string}
     */
    static colorArrayToRgba(color, alphaMultiplier = 1) {
        if (!Array.isArray(color) || color.length === 0) {
            return 'rgba(0, 0, 0, 0)';
        }

        const r = Math.round(Math.max(0, Math.min(255, Number(color[0]) || 0)));
        const g = Math.round(Math.max(0, Math.min(255, Number(color[1] ?? color[0]) || 0)));
        const b = Math.round(Math.max(0, Math.min(255, Number(color[2] ?? color[1] ?? color[0]) || 0)));
        const aBase = color.length > 3 ? Number(color[3]) : 1;
        const a = Math.max(0, Math.min(1, aBase * alphaMultiplier));

        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }
}
