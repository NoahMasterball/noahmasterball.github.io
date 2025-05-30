/**
 * EventManager Class
 * 
 * Handles custom events and communication between game components.
 * Provides a centralized event system for decoupled component interaction.
 */
class EventManager {
    constructor() {
        this.events = new Map();
        this.onceEvents = new Map();
        this.debugMode = false;
    }

    /**
     * Register an event listener
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Function to call when event is triggered
     * @param {Object} context - Context to bind to the callback (optional)
     */
    on(eventName, callback, context = null) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        
        this.events.get(eventName).push({
            callback,
            context
        });

        if (this.debugMode) {
            console.log(`Event listener registered for: ${eventName}`);
        }
    }

    /**
     * Register a one-time event listener
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Function to call when event is triggered
     * @param {Object} context - Context to bind to the callback (optional)
     */
    once(eventName, callback, context = null) {
        if (!this.onceEvents.has(eventName)) {
            this.onceEvents.set(eventName, []);
        }
        
        this.onceEvents.get(eventName).push({
            callback,
            context
        });

        if (this.debugMode) {
            console.log(`One-time event listener registered for: ${eventName}`);
        }
    }

    /**
     * Remove an event listener
     * @param {string} eventName - Name of the event
     * @param {Function} callback - The callback function to remove
     */
    off(eventName, callback) {
        if (this.events.has(eventName)) {
            const listeners = this.events.get(eventName);
            const index = listeners.findIndex(listener => listener.callback === callback);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (this.debugMode) {
                    console.log(`Event listener removed for: ${eventName}`);
                }
            }
        }
    }

    /**
     * Trigger an event
     * @param {string} eventName - Name of the event to trigger
     * @param {*} data - Data to pass to event listeners
     */
    emit(eventName, data = null) {
        if (this.debugMode) {
            console.log(`Emitting event: ${eventName}`, data);
        }

        // Handle regular events
        if (this.events.has(eventName)) {
            const listeners = this.events.get(eventName);
            listeners.forEach(({ callback, context }) => {
                try {
                    if (context) {
                        callback.call(context, data);
                    } else {
                        callback(data);
                    }
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
        }

        // Handle one-time events
        if (this.onceEvents.has(eventName)) {
            const listeners = this.onceEvents.get(eventName);
            listeners.forEach(({ callback, context }) => {
                try {
                    if (context) {
                        callback.call(context, data);
                    } else {
                        callback(data);
                    }
                } catch (error) {
                    console.error(`Error in one-time event listener for ${eventName}:`, error);
                }
            });
            // Clear one-time events after triggering
            this.onceEvents.delete(eventName);
        }
    }

    /**
     * Remove all listeners for a specific event
     * @param {string} eventName - Name of the event
     */
    removeAllListeners(eventName) {
        if (eventName) {
            this.events.delete(eventName);
            this.onceEvents.delete(eventName);
        } else {
            // Remove all listeners if no event name specified
            this.events.clear();
            this.onceEvents.clear();
        }

        if (this.debugMode) {
            console.log(`All listeners removed for: ${eventName || 'all events'}`);
        }
    }

    /**
     * Get the number of listeners for an event
     * @param {string} eventName - Name of the event
     * @returns {number} Number of listeners
     */
    listenerCount(eventName) {
        const regularCount = this.events.has(eventName) ? this.events.get(eventName).length : 0;
        const onceCount = this.onceEvents.has(eventName) ? this.onceEvents.get(eventName).length : 0;
        return regularCount + onceCount;
    }

    /**
     * Get all event names that have listeners
     * @returns {Array<string>} Array of event names
     */
    getEventNames() {
        const regularEvents = Array.from(this.events.keys());
        const onceEvents = Array.from(this.onceEvents.keys());
        return [...new Set([...regularEvents, ...onceEvents])];
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        console.log(`EventManager debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Clean up all event listeners
     */
    destroy() {
        this.removeAllListeners();
        console.log('EventManager destroyed');
    }
}

// Make EventManager globally available
window.EventManager = EventManager; 