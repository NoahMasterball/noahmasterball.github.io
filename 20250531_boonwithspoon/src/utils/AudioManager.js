/**
 * AudioManager Class
 * 
 * Manages audio playback, sound effects, and music for the game.
 * Provides centralized audio control with volume management and loading.
 */
class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.musicTracks = new Map();
        this.currentMusic = null;
        this.masterVolume = 1.0;
        this.soundVolume = 1.0;
        this.musicVolume = 1.0;
        this.muted = false;
        this.initialized = false;
        
        this.init();
    }

    /**
     * Initialize the audio manager
     */
    init() {
        try {
            // Check for Web Audio API support
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
            console.log('AudioManager initialized successfully');
        } catch (error) {
            console.warn('Web Audio API not supported, falling back to HTML5 audio');
            this.initialized = false;
        }
    }

    /**
     * Load a sound effect
     * @param {string} name - Name identifier for the sound
     * @param {string} url - URL to the audio file
     * @param {Object} options - Loading options
     */
    async loadSound(name, url, options = {}) {
        try {
            const audio = new Audio(url);
            audio.preload = 'auto';
            audio.volume = this.soundVolume * this.masterVolume;
            
            // Set audio properties
            if (options.loop) audio.loop = true;
            if (options.volume) audio.volume = options.volume * this.soundVolume * this.masterVolume;
            
            // Wait for audio to be ready
            await new Promise((resolve, reject) => {
                audio.addEventListener('canplaythrough', resolve);
                audio.addEventListener('error', reject);
            });

            this.sounds.set(name, {
                audio,
                options: options || {}
            });

            console.log(`Sound loaded: ${name}`);
        } catch (error) {
            console.error(`Failed to load sound: ${name}`, error);
        }
    }

    /**
     * Load a music track
     * @param {string} name - Name identifier for the music
     * @param {string} url - URL to the audio file
     * @param {Object} options - Loading options
     */
    async loadMusic(name, url, options = {}) {
        try {
            const audio = new Audio(url);
            audio.preload = 'auto';
            audio.volume = this.musicVolume * this.masterVolume;
            audio.loop = options.loop !== false; // Default to looping
            
            // Wait for audio to be ready
            await new Promise((resolve, reject) => {
                audio.addEventListener('canplaythrough', resolve);
                audio.addEventListener('error', reject);
            });

            this.musicTracks.set(name, {
                audio,
                options: options || {}
            });

            console.log(`Music loaded: ${name}`);
        } catch (error) {
            console.error(`Failed to load music: ${name}`, error);
        }
    }

    /**
     * Play a sound effect
     * @param {string} name - Name of the sound to play
     * @param {Object} options - Playback options
     */
    playSound(name, options = {}) {
        if (this.muted) return;

        const soundData = this.sounds.get(name);
        if (!soundData) {
            console.warn(`Sound not found: ${name}`);
            return;
        }

        try {
            const { audio } = soundData;
            
            // Clone audio for overlapping sounds
            const audioClone = audio.cloneNode();
            audioClone.volume = (options.volume || 1) * this.soundVolume * this.masterVolume;
            
            if (options.loop) audioClone.loop = true;
            if (options.rate) audioClone.playbackRate = options.rate;
            
            audioClone.play().catch(error => {
                console.warn(`Failed to play sound: ${name}`, error);
            });

            return audioClone;
        } catch (error) {
            console.error(`Error playing sound: ${name}`, error);
        }
    }

    /**
     * Play a music track
     * @param {string} name - Name of the music to play
     * @param {Object} options - Playback options
     */
    playMusic(name, options = {}) {
        if (this.muted) return;

        // Stop current music if playing
        this.stopMusic();

        const musicData = this.musicTracks.get(name);
        if (!musicData) {
            console.warn(`Music not found: ${name}`);
            return;
        }

        try {
            const { audio } = musicData;
            audio.volume = (options.volume || 1) * this.musicVolume * this.masterVolume;
            audio.currentTime = options.startTime || 0;
            
            audio.play().catch(error => {
                console.warn(`Failed to play music: ${name}`, error);
            });

            this.currentMusic = { name, audio };
            console.log(`Playing music: ${name}`);
        } catch (error) {
            console.error(`Error playing music: ${name}`, error);
        }
    }

    /**
     * Stop the currently playing music
     */
    stopMusic() {
        if (this.currentMusic) {
            this.currentMusic.audio.pause();
            this.currentMusic.audio.currentTime = 0;
            this.currentMusic = null;
        }
    }

    /**
     * Pause the currently playing music
     */
    pauseMusic() {
        if (this.currentMusic) {
            this.currentMusic.audio.pause();
        }
    }

    /**
     * Resume the currently paused music
     */
    resumeMusic() {
        if (this.currentMusic && this.currentMusic.audio.paused) {
            this.currentMusic.audio.play().catch(error => {
                console.warn('Failed to resume music', error);
            });
        }
    }

    /**
     * Set the master volume
     * @param {number} volume - Volume level (0.0 to 1.0)
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    /**
     * Set the sound effects volume
     * @param {number} volume - Volume level (0.0 to 1.0)
     */
    setSoundVolume(volume) {
        this.soundVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    /**
     * Set the music volume
     * @param {number} volume - Volume level (0.0 to 1.0)
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    /**
     * Update volumes for all loaded audio
     */
    updateAllVolumes() {
        // Update music volume
        if (this.currentMusic) {
            this.currentMusic.audio.volume = this.musicVolume * this.masterVolume;
        }

        // Note: Sound effect volumes are updated when played
    }

    /**
     * Mute or unmute all audio
     * @param {boolean} mute - Whether to mute audio
     */
    setMuted(mute) {
        this.muted = mute;
        
        if (mute) {
            this.pauseMusic();
        } else {
            this.resumeMusic();
        }
        
        console.log(`Audio ${mute ? 'muted' : 'unmuted'}`);
    }

    /**
     * Get current audio settings
     * @returns {Object} Current audio settings
     */
    getSettings() {
        return {
            masterVolume: this.masterVolume,
            soundVolume: this.soundVolume,
            musicVolume: this.musicVolume,
            muted: this.muted,
            currentMusic: this.currentMusic ? this.currentMusic.name : null
        };
    }

    /**
     * Check if a sound is loaded
     * @param {string} name - Name of the sound
     * @returns {boolean} Whether the sound is loaded
     */
    hasSound(name) {
        return this.sounds.has(name);
    }

    /**
     * Check if a music track is loaded
     * @param {string} name - Name of the music
     * @returns {boolean} Whether the music is loaded
     */
    hasMusic(name) {
        return this.musicTracks.has(name);
    }

    /**
     * Clean up audio resources
     */
    destroy() {
        this.stopMusic();
        
        // Clean up sounds
        this.sounds.forEach(({ audio }) => {
            audio.pause();
            audio.src = '';
        });
        
        // Clean up music
        this.musicTracks.forEach(({ audio }) => {
            audio.pause();
            audio.src = '';
        });
        
        this.sounds.clear();
        this.musicTracks.clear();
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        console.log('AudioManager destroyed');
    }
}

// Make AudioManager globally available
window.AudioManager = AudioManager; 