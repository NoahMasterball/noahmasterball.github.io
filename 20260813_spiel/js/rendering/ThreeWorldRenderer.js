import * as THREE from 'three';
import { gameToThree } from './ThreeCoords.js';
import { WorldRenderer } from './WorldRenderer.js';

export class ThreeWorldRenderer {

    constructor(scene) {
        this.scene = scene;
        this.worldGroup = new THREE.Group();
        this.scene.add(this.worldGroup);
    }

    /** Einmalig aufrufen — erstellt alle statischen Welt-Meshes. */
    buildWorld(worldWidth, worldHeight, roadLayout, crosswalks, sidewalkWidth, roadWidth, roadHalfWidth, streetDetails) {
        this._buildGrass(worldWidth, worldHeight);
        this._buildOcean(worldHeight);
        this._buildRoads(roadLayout, roadWidth, roadHalfWidth);
        this._buildSidewalks(roadLayout, sidewalkWidth, roadHalfWidth);
        this._buildStreetDetails(streetDetails);
    }

    _buildGrass(w, h) {
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshLambertMaterial({ color: 0x4a7c3f });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(w / 2, 0, -h / 2);
        this.worldGroup.add(mesh);
    }

    _buildOcean(worldHeight) {
        const geo = new THREE.PlaneGeometry(WorldRenderer.OCEAN_WIDTH, worldHeight);
        const mat = new THREE.MeshLambertMaterial({ color: 0x1a6b8a });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-WorldRenderer.OCEAN_WIDTH / 2, -2, -worldHeight / 2);
        this.worldGroup.add(mesh);

        // Klippe
        const cliffGeo = new THREE.BoxGeometry(WorldRenderer.CLIFF_WIDTH, 4, worldHeight);
        const cliffMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
        const cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(-WorldRenderer.CLIFF_WIDTH / 2, -1, -worldHeight / 2);
        this.worldGroup.add(cliff);
    }

    _buildRoads(roadLayout, roadWidth, roadHalfWidth) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x2c3036 });

        for (const road of roadLayout) {
            let w, h, cx, cy;
            if (road.type === 'horizontal') {
                w = road.endX - road.startX;
                h = roadWidth;
                cx = road.startX + w / 2;
                cy = road.y;
            } else {
                w = roadWidth;
                h = road.endY - road.startY;
                cx = road.x;
                cy = road.startY + h / 2;
            }
            const geo = new THREE.PlaneGeometry(w, h);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cx, 0.1, -cy);
            this.worldGroup.add(mesh);
        }
    }

    _buildSidewalks(roadLayout, sidewalkWidth, roadHalfWidth) {
        const mat = new THREE.MeshLambertMaterial({ color: 0xd9d1c4 });

        for (const road of roadLayout) {
            if (road.type === 'horizontal') {
                const len = road.endX - road.startX;
                const cx = road.startX + len / 2;
                const ry = road.y;
                for (const side of [-1, 1]) {
                    const geo = new THREE.PlaneGeometry(len, sidewalkWidth);
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(cx, 0.2, -(ry + side * (roadHalfWidth + sidewalkWidth / 2)));
                    this.worldGroup.add(mesh);
                }
            } else {
                const len = road.endY - road.startY;
                const cy = road.startY + len / 2;
                const rx = road.x;
                for (const side of [-1, 1]) {
                    const geo = new THREE.PlaneGeometry(sidewalkWidth, len);
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(rx + side * (roadHalfWidth + sidewalkWidth / 2), 0.2, -cy);
                    this.worldGroup.add(mesh);
                }
            }
        }
    }

    _buildStreetDetails(details) {
        if (!details) return;
        for (const d of details) {
            switch (d.type) {
                case 'tree':     this._buildTree(d); break;
                case 'bench':    this._buildBench(d); break;
                case 'lamppost': this._buildLamppost(d); break;
            }
        }
    }

    _buildTree(d) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 3, 20, 8),
            new THREE.MeshLambertMaterial({ color: 0x5a3a1a })
        );
        trunk.position.y = 10;
        g.add(trunk);

        const crown = new THREE.Mesh(
            new THREE.SphereGeometry(10, 8, 8),
            new THREE.MeshLambertMaterial({ color: 0x2d5a1e })
        );
        crown.position.y = 24;
        g.add(crown);

        const pos = gameToThree(d.x, d.y);
        g.position.copy(pos);
        this.worldGroup.add(g);
    }

    _buildBench(d) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(12, 4, 5),
            new THREE.MeshLambertMaterial({ color: 0x8B4513 })
        );
        const pos = gameToThree(d.x, d.y);
        mesh.position.set(pos.x, 2, pos.z);
        if (d.rotation) mesh.rotation.y = d.rotation;
        this.worldGroup.add(mesh);
    }

    _buildLamppost(d) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 30, 6),
            new THREE.MeshLambertMaterial({ color: 0x666666 })
        );
        pole.position.y = 15;
        g.add(pole);

        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffaa })
        );
        lamp.position.y = 32;
        g.add(lamp);

        const pos = gameToThree(d.x, d.y);
        g.position.copy(pos);
        this.worldGroup.add(g);
    }
}
