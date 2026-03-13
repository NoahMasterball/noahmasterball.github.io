/**
 * EventBus - Zentraler Event-Mechanismus fuer lose Kopplung zwischen Modulen.
 */
class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Registriert einen Callback fuer ein Event.
     * @param {string} event
     * @param {Function} callback
     * @returns {this}
     */
    on(event, callback) {
        if (typeof callback !== 'function') return this;
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        return this;
    }

    /**
     * Entfernt einen Callback fuer ein Event.
     * @param {string} event
     * @param {Function} callback
     * @returns {this}
     */
    off(event, callback) {
        const set = this._listeners.get(event);
        if (set) {
            set.delete(callback);
            if (set.size === 0) {
                this._listeners.delete(event);
            }
        }
        return this;
    }

    /**
     * Feuert ein Event und ruft alle registrierten Callbacks auf.
     * @param {string} event
     * @param {*} data
     * @returns {this}
     */
    emit(event, data) {
        const set = this._listeners.get(event);
        if (set) {
            for (const cb of set) {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`[EventBus] Error in listener for "${event}":`, err);
                }
            }
        }
        return this;
    }
}

/** Singleton-Instanz */
export const eventBus = new EventBus();
export { EventBus };