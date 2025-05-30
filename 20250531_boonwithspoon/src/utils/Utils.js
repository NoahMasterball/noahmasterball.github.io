/**
 * Utils Class
 * 
 * Collection of utility functions and helper methods for the game.
 * Provides common functionality used across different game components.
 */
class Utils {
    /**
     * Mathematical utilities
     */
    static Math = {
        /**
         * Generate a random integer between min and max (inclusive)
         */
        randomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        /**
         * Generate a random float between min and max
         */
        randomFloat(min, max) {
            return Math.random() * (max - min) + min;
        },

        /**
         * Clamp a value between min and max
         */
        clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        },

        /**
         * Linear interpolation between two values
         */
        lerp(start, end, t) {
            return start + (end - start) * t;
        },

        /**
         * Calculate distance between two points
         */
        distance(x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            return Math.sqrt(dx * dx + dy * dy);
        },

        /**
         * Normalize an angle to 0-360 degrees
         */
        normalizeAngle(angle) {
            while (angle < 0) angle += 360;
            while (angle >= 360) angle -= 360;
            return angle;
        }
    };

    /**
     * Array utilities
     */
    static Array = {
        /**
         * Shuffle an array in place
         */
        shuffle(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        },

        /**
         * Get a random element from an array
         */
        randomElement(array) {
            return array[Math.floor(Math.random() * array.length)];
        },

        /**
         * Remove an element from an array
         */
        remove(array, element) {
            const index = array.indexOf(element);
            if (index > -1) {
                array.splice(index, 1);
            }
            return array;
        }
    };

    /**
     * DOM utilities
     */
    static DOM = {
        /**
         * Create an element with attributes and children
         */
        createElement(tag, attributes = {}, children = []) {
            const element = document.createElement(tag);
            
            // Set attributes
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'className') {
                    element.className = value;
                } else if (key === 'style' && typeof value === 'object') {
                    Object.assign(element.style, value);
                } else {
                    element.setAttribute(key, value);
                }
            });
            
            // Add children
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else {
                    element.appendChild(child);
                }
            });
            
            return element;
        },

        /**
         * Remove all children from an element
         */
        clearChildren(element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        },

        /**
         * Add CSS class with animation support
         */
        addClass(element, className, callback) {
            element.classList.add(className);
            if (callback) {
                element.addEventListener('animationend', callback, { once: true });
            }
        },

        /**
         * Remove CSS class with animation support
         */
        removeClass(element, className, callback) {
            element.classList.remove(className);
            if (callback) {
                setTimeout(callback, 0);
            }
        }
    };

    /**
     * Color utilities
     */
    static Color = {
        /**
         * Convert RGB to hex
         */
        rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        },

        /**
         * Convert hex to RGB
         */
        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        },

        /**
         * Interpolate between two colors
         */
        interpolate(color1, color2, t) {
            const rgb1 = this.hexToRgb(color1);
            const rgb2 = this.hexToRgb(color2);
            
            if (!rgb1 || !rgb2) return color1;
            
            const r = Math.round(Utils.Math.lerp(rgb1.r, rgb2.r, t));
            const g = Math.round(Utils.Math.lerp(rgb1.g, rgb2.g, t));
            const b = Math.round(Utils.Math.lerp(rgb1.b, rgb2.b, t));
            
            return this.rgbToHex(r, g, b);
        }
    };

    /**
     * Performance utilities
     */
    static Performance = {
        /**
         * Throttle function calls
         */
        throttle(func, limit) {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        /**
         * Debounce function calls
         */
        debounce(func, wait) {
            let timeout;
            return function() {
                const context = this;
                const args = arguments;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        },

        /**
         * Measure execution time of a function
         */
        measureTime(func, label = 'Function') {
            const start = performance.now();
            const result = func();
            const end = performance.now();
            console.log(`${label} took ${end - start} milliseconds`);
            return result;
        }
    };

    /**
     * Storage utilities
     */
    static Storage = {
        /**
         * Save data to localStorage with JSON serialization
         */
        save(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
                return true;
            } catch (error) {
                console.error('Failed to save to localStorage:', error);
                return false;
            }
        },

        /**
         * Load data from localStorage with JSON parsing
         */
        load(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : defaultValue;
            } catch (error) {
                console.error('Failed to load from localStorage:', error);
                return defaultValue;
            }
        },

        /**
         * Remove data from localStorage
         */
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('Failed to remove from localStorage:', error);
                return false;
            }
        },

        /**
         * Clear all localStorage data
         */
        clear() {
            try {
                localStorage.clear();
                return true;
            } catch (error) {
                console.error('Failed to clear localStorage:', error);
                return false;
            }
        }
    };

    /**
     * Validation utilities
     */
    static Validation = {
        /**
         * Check if value is a valid number
         */
        isNumber(value) {
            return typeof value === 'number' && !isNaN(value) && isFinite(value);
        },

        /**
         * Check if value is a valid string
         */
        isString(value) {
            return typeof value === 'string' && value.length > 0;
        },

        /**
         * Check if value is a valid object
         */
        isObject(value) {
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        },

        /**
         * Check if value is a valid array
         */
        isArray(value) {
            return Array.isArray(value);
        }
    };
}

// Make Utils globally available
window.Utils = Utils; 