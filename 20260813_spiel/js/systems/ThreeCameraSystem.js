import * as THREE from 'three';
import { gameToThree } from '../rendering/ThreeCoords.js';

export class ThreeCameraSystem {

    constructor(viewportWidth, viewportHeight, zoom = 1) {
        this.width = viewportWidth;
        this.height = viewportHeight;
        this.zoom = zoom;

        // 2D-Position (Spielkoordinaten — identisch mit CameraSystem)
        this.x = 0;
        this.y = 0;
        this.oceanOverflow = 0;

        // Three.js OrthographicCamera
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
        this.camera.position.set(0, 1000, 0);
        this.camera.lookAt(0, 0, 0);

        this._syncThreeCamera();
    }

    /** Identische Logik wie CameraSystem.update() (Zeile 27-40). */
    update(targetEntity, worldBounds) {
        const vw = this.width / this.zoom;
        const vh = this.height / this.zoom;

        this.x = targetEntity.x - vw / 2;
        this.y = targetEntity.y - vh / 2;

        const westLimit = -(this.oceanOverflow ?? 0);
        this.x = Math.max(westLimit, Math.min(this.x, worldBounds.width - vw));
        this.y = Math.max(0, Math.min(this.y, worldBounds.height - vh));

        this._syncThreeCamera();
    }

    /** Identisch mit CameraSystem.worldToScreen() (Zeile 48-53). */
    worldToScreen(wx, wy) {
        return {
            sx: (wx - this.x) * this.zoom,
            sy: (wy - this.y) * this.zoom
        };
    }

    /** Identisch mit CameraSystem.screenToWorld() (Zeile 61-66). */
    screenToWorld(sx, sy) {
        return {
            wx: sx / this.zoom + this.x,
            wy: sy / this.zoom + this.y
        };
    }

    getThreeCamera() {
        return this.camera;
    }

    _syncThreeCamera() {
        const vw = this.width / this.zoom;
        const vh = this.height / this.zoom;

        // Frustum = sichtbarer Weltbereich
        // Game x → Three x, Game y → Three -z
        this.camera.left = this.x;
        this.camera.right = this.x + vw;
        this.camera.top = -this.y;
        this.camera.bottom = -(this.y + vh);

        this.camera.position.set(this.x + vw / 2, 1000, -(this.y + vh / 2));
        this.camera.lookAt(this.x + vw / 2, 0, -(this.y + vh / 2));
        this.camera.updateProjectionMatrix();
    }
}
