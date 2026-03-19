/**
 * InputSystem — Keyboard- und Maus-Eingaben
 * Portiert aus gta_old/overworld/js/overworld.js setupInput() (Z.456-687)
 * und updateMouseWorldPosition() (Z.2517-2532)
 */
export class InputSystem {

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;

        // Keyboard-State
        this.keys = {};           // aktuelle Taste gedrückt
        this._justPressed = {};   // einmalig pro Frame true
        this._justPressedConsumed = {}; // schon abgefragt in diesem Frame

        // Maus-State
        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };
        this._fireJustPressed = false;
        this._fireJustPressedConsumed = false;

        this._bindEvents();
    }

    // ───────────────────── Event-Bindings ─────────────────────

    _bindEvents() {
        document.addEventListener("keydown", (e) => {
            const key = e.key.toLowerCase();
            if (!this.keys[key]) {
                // Taste war vorher nicht gedrückt → justPressed setzen
                this._justPressed[key] = true;
                this._justPressedConsumed[key] = false;
            }
            this.keys[key] = true;
        });

        document.addEventListener("keyup", (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            this._justPressed[key] = false;
        });

        this.canvas.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        this.canvas.addEventListener("mousedown", (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
                this._fireJustPressed = true;
                this._fireJustPressedConsumed = false;
            }
        });

        document.addEventListener("mouseup", (e) => {
            if (e.button === 0) {
                this.mouse.down = false;
                this._fireJustPressed = false;
            }
        });
    }

    // ───────────────────── Abfragen ─────────────────────

    /** Taste momentan gehalten? */
    isKeyDown(key) {
        return !!this.keys[key.toLowerCase()];
    }

    /** Taste in diesem Frame erstmals gedrückt? (nur einmal true pro Tastendruck) */
    isKeyPressed(key) {
        const k = key.toLowerCase();
        if (this._justPressed[k] && !this._justPressedConsumed[k]) {
            this._justPressedConsumed[k] = true;
            return true;
        }
        return false;
    }

    /**
     * Bewegungsvektor aus WASD / Pfeiltasten, normalisiert.
     * @returns {{dx: number, dy: number}}
     */
    getMovementVector() {
        let dx = 0;
        let dy = 0;

        if (this.keys["w"] || this.keys["arrowup"])    dy -= 1;
        if (this.keys["s"] || this.keys["arrowdown"])  dy += 1;
        if (this.keys["a"] || this.keys["arrowleft"])  dx -= 1;
        if (this.keys["d"] || this.keys["arrowright"]) dx += 1;

        // Normalisieren bei Diagonalbewegung
        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }

        return { dx, dy };
    }

    /** Shift gedrückt → Sprint */
    isSprinting() {
        return !!this.keys["shift"];
    }

    /**
     * Maus-Weltposition (erfordert vorheriges updateMouseWorldPosition).
     * @returns {{x: number, y: number}}
     */
    getMouseWorldPosition() {
        return { x: this.mouse.worldX, y: this.mouse.worldY };
    }

    /** Linke Maustaste in diesem Frame erstmals gedrückt? */
    isFirePressed() {
        if (this._fireJustPressed && !this._fireJustPressedConsumed) {
            this._fireJustPressedConsumed = true;
            return true;
        }
        return false;
    }

    /** Linke Maustaste gehalten? */
    isFireDown() {
        return this.mouse.down;
    }

    // ───────────────────── Frame-Update ─────────────────────

    /**
     * Maus-Weltkoordinaten aktualisieren.
     * Portiert aus updateMouseWorldPosition() (Z.2517-2532).
     *
     * @param {object} camera  - CameraSystem-Instanz (braucht x, y)
     * @param {object} [interiorOffset] - optional {originX, originY} für Interior-Szenen
     */
    updateMouseWorldPosition(camera, interiorOffset) {
        if (interiorOffset) {
            this.mouse.worldX = this.mouse.x - interiorOffset.originX;
            this.mouse.worldY = this.mouse.y - interiorOffset.originY;
            return;
        }
        const zoom = camera.zoom || 1;
        this.mouse.worldX = this.mouse.x / zoom + camera.x;
        this.mouse.worldY = this.mouse.y / zoom + camera.y;
    }

    /**
     * Am Ende jedes Frames aufrufen — setzt justPressed-Flags zurück.
     */
    update() {
        // Alle justPressed-Flags löschen
        for (const key in this._justPressed) {
            this._justPressed[key] = false;
            this._justPressedConsumed[key] = false;
        }
        this._fireJustPressed = false;
        this._fireJustPressedConsumed = false;
    }
}
