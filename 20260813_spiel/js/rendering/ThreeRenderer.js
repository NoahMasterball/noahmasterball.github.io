import * as THREE from 'three';

export class ThreeRenderer {

    constructor(webglCanvas, hudCanvas) {
        // WebGL-Renderer
        this.webglRenderer = new THREE.WebGLRenderer({
            canvas: webglCanvas,
            antialias: true,
        });
        this.webglRenderer.setPixelRatio(window.devicePixelRatio);
        this.webglRenderer.setClearColor(0x87CEEB); // Himmelblau

        // 3D-Szene
        this.scene = new THREE.Scene();

        // Basis-Beleuchtung
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(500, 1000, -500);
        this.scene.add(this.directionalLight);

        // Kamera (wird extern gesetzt)
        this.camera = null;

        // HUD-Canvas Referenz
        this.hudCanvas = hudCanvas;
        this.hudCtx = hudCanvas ? hudCanvas.getContext('2d') : null;

        // Dimensionen
        this.canvas = webglCanvas;
        this.width = 0;
        this.height = 0;

        this.resizeCanvas();
    }

    getScene() { return this.scene; }
    getCamera() { return this.camera; }

    setCamera(camera) { this.camera = camera; }

    /** Löscht den HUD-Canvas (WebGL wird automatisch bei render() gelöscht). */
    clear() {
        if (this.hudCtx) {
            this.hudCtx.clearRect(0, 0, this.width, this.height);
        }
    }

    /** Rendert die 3D-Szene. */
    render() {
        if (this.camera) {
            this.webglRenderer.render(this.scene, this.camera);
        }
    }

    resizeCanvas() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.webglRenderer.setSize(this.width, this.height);
        if (this.hudCanvas) {
            this.hudCanvas.width = this.width;
            this.hudCanvas.height = this.height;
        }
    }
}
