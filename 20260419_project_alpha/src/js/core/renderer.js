import * as THREE from 'three';
import { WORLD, CLOCK } from '../config/constants.js';

// Three.js-Wrapper. Besitzt Scene, Camera, Renderer, Sun (DirectionalLight), Ambient.
// Sky-Farben und Licht-Intensität werden von Clock über `applySky(phaseColors)` gesetzt.
// Ground, Buildings und Biomes liegen in World (Batch 2) — nicht mehr hier.

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    this.three = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CLOCK.SKY.day.top);
    this.scene.fog = new THREE.Fog(CLOCK.SKY.day.horizon, 60, 300);

    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, WORLD.SPAWN_HEIGHT, 0);

    this.ambient = new THREE.AmbientLight(CLOCK.SKY.day.ambient, 0.6);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(CLOCK.SKY.day.sun, 1.0);
    this.sun.position.set(80, 120, 40);
    this.scene.add(this.sun);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.three.setSize(w, h, false);
  }

  applySky({ top, horizon, ambient, sun, intensity }) {
    this.scene.background.setHex(top);
    this.scene.fog.color.setHex(horizon);
    this.ambient.color.setHex(ambient);
    this.ambient.intensity = 0.3 + 0.5 * intensity;
    this.sun.color.setHex(sun);
    this.sun.intensity = intensity;
  }

  setSunPosition(angle01) {
    // angle01 = 0..1 entspricht Sonnenbogen von Osten (0) über Süden (0.5) nach Westen (1).
    const a = angle01 * Math.PI;
    const radius = 200;
    this.sun.position.set(Math.cos(a) * radius, Math.sin(a) * radius * 0.9 + 10, -40);
  }

  render() {
    this.three.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.three.dispose();
  }
}
