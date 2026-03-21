// ============================================================
// BABYLON.JS PLAYGROUND DEMO — City Builder Scene
// Paste this into https://playground.babylonjs.com/
// ============================================================

export const createScene = function () {
    var scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.53, 0.81, 0.92); // Sky blue

    // --- KAMERA: Top-Down wie euer Spiel ---
    var camera = new BABYLON.ArcRotateCamera(
        "cam",
        -Math.PI / 2,   // alpha (horizontal rotation)
        Math.PI / 4,     // beta (angle from top — 45° isometric)
        50,              // radius (zoom distance)
        new BABYLON.Vector3(0, 0, 0),
        scene
    );
    camera.attachControl(canvas, true);
    camera.lowerBetaLimit = 0.2;   // Don't go underground
    camera.upperBetaLimit = Math.PI / 2.5;
    camera.lowerRadiusLimit = 15;
    camera.upperRadiusLimit = 120;

    // --- LICHT: Sonne + Ambient ---
    var sun = new BABYLON.DirectionalLight(
        "sun",
        new BABYLON.Vector3(-1, -3, -1),
        scene
    );
    sun.intensity = 1.5;
    sun.position = new BABYLON.Vector3(20, 40, 20);

    // Shadows
    var shadowGen = new BABYLON.ShadowGenerator(2048, sun);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 32;

    var ambient = new BABYLON.HemisphericLight(
        "ambient",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    ambient.intensity = 0.4;

    // --- BODEN: Gras-Terrain ---
    var ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 80, height: 80 },
        scene
    );
    var groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.28, 0.55, 0.20);
    groundMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    ground.material = groundMat;
    ground.receiveShadows = true;

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    function createBuilding(name, x, z, width, depth, floors, wallColor, roofColor) {
        var height = floors * 3;

        // Main body
        var body = BABYLON.MeshBuilder.CreateBox(
            name,
            { width: width, height: height, depth: depth },
            scene
        );
        body.position = new BABYLON.Vector3(x, height / 2, z);

        var bodyMat = new BABYLON.StandardMaterial(name + "Mat", scene);
        bodyMat.diffuseColor = wallColor;
        body.material = bodyMat;
        shadowGen.addShadowCaster(body);
        body.receiveShadows = true;

        // Roof
        var roof = BABYLON.MeshBuilder.CreateBox(
            name + "Roof",
            { width: width + 0.4, height: 0.4, depth: depth + 0.4 },
            scene
        );
        roof.position = new BABYLON.Vector3(x, height + 0.2, z);
        var roofMat = new BABYLON.StandardMaterial(name + "RoofMat", scene);
        roofMat.diffuseColor = roofColor;
        roof.material = roofMat;
        shadowGen.addShadowCaster(roof);

        // Windows
        for (var floor = 0; floor < floors; floor++) {
            var windowY = floor * 3 + 1.8;
            var windowCount = Math.floor(width / 2.5);
            var startX = -(windowCount - 1) * 1.2;

            for (var w = 0; w < windowCount; w++) {
                // Front windows
                var win = BABYLON.MeshBuilder.CreatePlane(
                    name + "Win_" + floor + "_" + w,
                    { width: 1.0, height: 1.4 },
                    scene
                );
                win.position = new BABYLON.Vector3(
                    x + startX + w * 2.4,
                    windowY,
                    z - depth / 2 - 0.01
                );
                var winMat = new BABYLON.StandardMaterial(name + "WinMat" + floor + w, scene);
                winMat.diffuseColor = new BABYLON.Color3(0.6, 0.85, 1.0);
                winMat.emissiveColor = new BABYLON.Color3(0.15, 0.2, 0.3);
                winMat.alpha = 0.7;
                win.material = winMat;

                // Back windows
                var winBack = win.clone(name + "WinBack_" + floor + "_" + w);
                winBack.position.z = z + depth / 2 + 0.01;
                winBack.rotation.y = Math.PI;
            }
        }

        // Door
        var door = BABYLON.MeshBuilder.CreatePlane(
            name + "Door",
            { width: 1.6, height: 2.4 },
            scene
        );
        door.position = new BABYLON.Vector3(x, 1.2, z - depth / 2 - 0.01);
        var doorMat = new BABYLON.StandardMaterial(name + "DoorMat", scene);
        doorMat.diffuseColor = new BABYLON.Color3(0.35, 0.2, 0.1);
        door.material = doorMat;

        return body;
    }

    function createTree(x, z) {
        // Trunk
        var trunk = BABYLON.MeshBuilder.CreateCylinder(
            "trunk_" + x + "_" + z,
            { height: 2, diameterTop: 0.3, diameterBottom: 0.5 },
            scene
        );
        trunk.position = new BABYLON.Vector3(x, 1, z);
        var trunkMat = new BABYLON.StandardMaterial("trunkMat_" + x, scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);
        trunk.material = trunkMat;
        shadowGen.addShadowCaster(trunk);

        // Leaves (layered spheres for fullness)
        var leaves = BABYLON.MeshBuilder.CreateSphere(
            "leaves_" + x + "_" + z,
            { diameter: 3.5, segments: 8 },
            scene
        );
        leaves.position = new BABYLON.Vector3(x, 3.2, z);
        var leavesMat = new BABYLON.StandardMaterial("leavesMat_" + x, scene);
        leavesMat.diffuseColor = new BABYLON.Color3(0.15, 0.5, 0.15);
        leaves.material = leavesMat;
        shadowGen.addShadowCaster(leaves);

        var leaves2 = BABYLON.MeshBuilder.CreateSphere(
            "leaves2_" + x + "_" + z,
            { diameter: 2.8, segments: 8 },
            scene
        );
        leaves2.position = new BABYLON.Vector3(x + 0.5, 3.8, z + 0.3);
        leaves2.material = leavesMat;
        shadowGen.addShadowCaster(leaves2);
    }

    function createStreetLamp(x, z) {
        // Pole
        var pole = BABYLON.MeshBuilder.CreateCylinder(
            "pole_" + x + "_" + z,
            { height: 5, diameter: 0.15 },
            scene
        );
        pole.position = new BABYLON.Vector3(x, 2.5, z);
        var poleMat = new BABYLON.StandardMaterial("poleMat_" + x, scene);
        poleMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        pole.material = poleMat;
        shadowGen.addShadowCaster(pole);

        // Lamp head
        var lamp = BABYLON.MeshBuilder.CreateSphere(
            "lamp_" + x + "_" + z,
            { diameter: 0.6 },
            scene
        );
        lamp.position = new BABYLON.Vector3(x, 5.2, z);
        var lampMat = new BABYLON.StandardMaterial("lampMat_" + x, scene);
        lampMat.diffuseColor = new BABYLON.Color3(1, 0.95, 0.7);
        lampMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.5);
        lamp.material = lampMat;

        // Point light from lamp
        var light = new BABYLON.PointLight(
            "lampLight_" + x + "_" + z,
            new BABYLON.Vector3(x, 5, z),
            scene
        );
        light.intensity = 0.3;
        light.diffuse = new BABYLON.Color3(1, 0.9, 0.6);
        light.range = 15;
    }

    // ============================================================
    // STRASSE
    // ============================================================

    // Main road
    var road = BABYLON.MeshBuilder.CreateGround(
        "road",
        { width: 80, height: 10 },
        scene
    );
    road.position = new BABYLON.Vector3(0, 0.02, 0);
    var roadMat = new BABYLON.StandardMaterial("roadMat", scene);
    roadMat.diffuseColor = new BABYLON.Color3(0.25, 0.25, 0.28);
    roadMat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    road.material = roadMat;

    // Road markings (center line)
    for (var i = -35; i < 35; i += 5) {
        var marking = BABYLON.MeshBuilder.CreateGround(
            "marking_" + i,
            { width: 2.5, height: 0.2 },
            scene
        );
        marking.position = new BABYLON.Vector3(i, 0.03, 0);
        var markMat = new BABYLON.StandardMaterial("markMat_" + i, scene);
        markMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.2);
        markMat.emissiveColor = new BABYLON.Color3(0.15, 0.15, 0.03);
        marking.material = markMat;
    }

    // Sidewalks
    var sidewalkLeft = BABYLON.MeshBuilder.CreateBox(
        "sidewalkL",
        { width: 80, height: 0.15, depth: 3 },
        scene
    );
    sidewalkLeft.position = new BABYLON.Vector3(0, 0.075, -6.5);
    var sidewalkMat = new BABYLON.StandardMaterial("sidewalkMat", scene);
    sidewalkMat.diffuseColor = new BABYLON.Color3(0.65, 0.63, 0.6);
    sidewalkLeft.material = sidewalkMat;
    sidewalkLeft.receiveShadows = true;

    var sidewalkRight = sidewalkLeft.clone("sidewalkR");
    sidewalkRight.position.z = 6.5;

    // ============================================================
    // GEBÄUDE — LINKE STRASSENSEITE
    // ============================================================

    // Wohnhaus (2 Stockwerke, warm)
    createBuilding(
        "house1", -20, -14, 8, 7, 2,
        new BABYLON.Color3(0.85, 0.75, 0.6),  // Sandfarben
        new BABYLON.Color3(0.6, 0.25, 0.2)    // Rotes Dach
    );

    // Apartment Block (4 Stockwerke, grau)
    createBuilding(
        "apartment1", -5, -16, 12, 10, 4,
        new BABYLON.Color3(0.7, 0.7, 0.72),   // Beton-grau
        new BABYLON.Color3(0.4, 0.4, 0.42)    // Dunkles Dach
    );

    // Kleiner Laden
    createBuilding(
        "shop1", 10, -13, 6, 5, 1,
        new BABYLON.Color3(0.9, 0.85, 0.7),   // Creme
        new BABYLON.Color3(0.3, 0.5, 0.3)     // Grünes Dach
    );

    // Bürogebäude (3 Stockwerke, modern)
    createBuilding(
        "office1", 22, -16, 10, 9, 3,
        new BABYLON.Color3(0.55, 0.6, 0.7),   // Blaugrau
        new BABYLON.Color3(0.3, 0.35, 0.4)    // Dunkles Dach
    );

    // ============================================================
    // GEBÄUDE — RECHTE STRASSENSEITE
    // ============================================================

    // Casino (auffällig!)
    var casino = createBuilding(
        "casino", -18, 15, 14, 10, 2,
        new BABYLON.Color3(0.8, 0.2, 0.25),   // Rot
        new BABYLON.Color3(0.9, 0.8, 0.2)     // Gold-Dach
    );

    // Motel
    createBuilding(
        "motel", 0, 14, 16, 7, 2,
        new BABYLON.Color3(0.75, 0.65, 0.5),
        new BABYLON.Color3(0.5, 0.3, 0.2)
    );

    // Police Station
    createBuilding(
        "police", 18, 15, 10, 8, 2,
        new BABYLON.Color3(0.6, 0.62, 0.68),  // Offizielles Grau
        new BABYLON.Color3(0.2, 0.25, 0.4)    // Dunkelblaues Dach
    );

    // ============================================================
    // BÄUME & LATERNEN
    // ============================================================

    // Trees along sidewalks
    createTree(-30, -9);
    createTree(-15, -9);
    createTree(5, -9);
    createTree(15, -9);
    createTree(28, -9);

    createTree(-25, 9);
    createTree(-8, 9);
    createTree(8, 9);
    createTree(22, 9);
    createTree(32, 9);

    // Street lamps
    createStreetLamp(-25, -6);
    createStreetLamp(-10, -6);
    createStreetLamp(5, -6);
    createStreetLamp(20, -6);

    createStreetLamp(-17, 6);
    createStreetLamp(0, 6);
    createStreetLamp(15, 6);
    createStreetLamp(30, 6);

    // ============================================================
    // WASSER (kleiner Teich/Ozean-Ecke)
    // ============================================================

    var water = BABYLON.MeshBuilder.CreateGround(
        "water",
        { width: 25, height: 25 },
        scene
    );
    water.position = new BABYLON.Vector3(-28, 0.05, 28);
    var waterMat = new BABYLON.StandardMaterial("waterMat", scene);
    waterMat.diffuseColor = new BABYLON.Color3(0.1, 0.35, 0.6);
    waterMat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.5);
    waterMat.alpha = 0.8;
    water.material = waterMat;

    // ============================================================
    // SIMPLE NPC (Stickfigure-Style Character)
    // ============================================================

    function createCharacter(x, z, shirtColor) {
        // Body
        var body = BABYLON.MeshBuilder.CreateCylinder(
            "body_" + x,
            { height: 1.2, diameterTop: 0.5, diameterBottom: 0.4 },
            scene
        );
        body.position = new BABYLON.Vector3(x, 1.1, z);
        var bodyMat = new BABYLON.StandardMaterial("bodyMat_" + x, scene);
        bodyMat.diffuseColor = shirtColor;
        body.material = bodyMat;
        shadowGen.addShadowCaster(body);

        // Head
        var head = BABYLON.MeshBuilder.CreateSphere(
            "head_" + x,
            { diameter: 0.5 },
            scene
        );
        head.position = new BABYLON.Vector3(x, 2.0, z);
        var headMat = new BABYLON.StandardMaterial("headMat_" + x, scene);
        headMat.diffuseColor = new BABYLON.Color3(0.85, 0.7, 0.55);
        head.material = headMat;
        shadowGen.addShadowCaster(head);

        // Legs
        for (var side = -1; side <= 1; side += 2) {
            var leg = BABYLON.MeshBuilder.CreateCylinder(
                "leg_" + x + "_" + side,
                { height: 0.8, diameter: 0.2 },
                scene
            );
            leg.position = new BABYLON.Vector3(x + side * 0.12, 0.4, z);
            var legMat = new BABYLON.StandardMaterial("legMat_" + x + side, scene);
            legMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.5);
            leg.material = legMat;
            shadowGen.addShadowCaster(leg);
        }

        return body;
    }

    // A few NPCs on sidewalks
    createCharacter(-12, -6.5, new BABYLON.Color3(0.8, 0.2, 0.2));   // Red shirt
    createCharacter(3, 6.5, new BABYLON.Color3(0.2, 0.2, 0.8));      // Blue shirt
    createCharacter(14, -6.5, new BABYLON.Color3(0.2, 0.7, 0.2));    // Green shirt
    createCharacter(-5, 6.5, new BABYLON.Color3(0.9, 0.9, 0.2));     // Yellow shirt

    // Player character (slightly bigger, on the road)
    var player = createCharacter(0, -2, new BABYLON.Color3(0.1, 0.1, 0.1));

    // ============================================================
    // POST-PROCESSING: Bloom + Color Grading
    // ============================================================

    var pipeline = new BABYLON.DefaultRenderingPipeline(
        "pipeline", true, scene, [camera]
    );
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.6;
    pipeline.bloomWeight = 0.3;
    pipeline.bloomKernel = 64;

    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.3;

    // Vignette
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.5;

    // Tone mapping
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;

    // ============================================================
    // ANIMATION: Rotate camera slowly for showcase
    // ============================================================

    var alpha = -Math.PI / 2;
    scene.registerBeforeRender(function () {
        alpha += 0.001;
        camera.alpha = alpha;
    });

    return scene;
};
