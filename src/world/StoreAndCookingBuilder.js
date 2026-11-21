import * as THREE from 'three';
import { GameObject, BoxCollider, RigidBody } from '../../lumina/index.js';
import { buildArticulatedHuman } from './CharacterMeshBuilder.js';

export const STORE_ORIGIN = new THREE.Vector3(60, 0, 0);

function createHighlightRing(radius = 0.24) {
    const group = new THREE.Group();
    const borderMat = new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 16), borderMat);
    ring.rotation.x = -Math.PI / 2;
    const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.055, 0),
        new THREE.MeshBasicMaterial({ color: 0xffdf80 })
    );
    diamond.position.y = 0.28;
    group.add(ring, diamond);
    group.userData = { borderMat, diamond };
    group.visible = false;
    return group;
}

// =========================================================================
// Detailed 3D Prop Model Builders (PS1 style, matching KhrushchevkaBuilder)
// =========================================================================

export function createGroceryBagModel(materials, scale = 1.0) {
    const group = new THREE.Group();
    const bagMat = materials.groceryBag || new THREE.MeshStandardMaterial({ color: 0xd9cbb8, roughness: 0.9 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xb8ad98, roughness: 0.9 });
    const crustMat = new THREE.MeshStandardMaterial({ color: 0xc2833c, roughness: 0.88 });
    const bottleMat = new THREE.MeshStandardMaterial({ color: 0x225c2e, roughness: 0.35 });
    const peasMat = materials.peasLabel || new THREE.MeshStandardMaterial({ color: 0x3b7a3e });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.55, roughness: 0.35 });

    const bagBody = new THREE.Mesh(new THREE.CylinderGeometry(0.115 * scale, 0.095 * scale, 0.25 * scale, 4), bagMat);
    bagBody.rotation.y = Math.PI / 4;
    bagBody.scale.set(1.25, 1.0, 0.72);
    bagBody.position.y = 0.125 * scale;

    for (const side of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.052 * scale, 0.008 * scale, 5, 10, Math.PI), handleMat);
        handle.position.set(0, 0.245 * scale, side * 0.045 * scale);
        group.add(handle);
    }

    const loaf = new THREE.Mesh(new THREE.CylinderGeometry(0.032 * scale, 0.028 * scale, 0.16 * scale, 7), crustMat);
    loaf.position.set(-0.048 * scale, 0.26 * scale, 0.008 * scale);
    loaf.rotation.z = 0.22;

    const peasCan = new THREE.Mesh(new THREE.CylinderGeometry(0.034 * scale, 0.034 * scale, 0.095 * scale, 8), peasMat);
    peasCan.position.set(0.042 * scale, 0.245 * scale, -0.012 * scale);
    const peasLid = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.035 * scale, 0.008 * scale, 8), lidMat);
    peasLid.position.set(0.042 * scale, 0.294 * scale, -0.012 * scale);

    const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * scale, 0.022 * scale, 0.09 * scale, 7), bottleMat);
    bottleNeck.position.set(0.002 * scale, 0.275 * scale, 0.022 * scale);
    bottleNeck.rotation.z = -0.10;

    group.add(bagBody, loaf, peasCan, peasLid, bottleNeck);
    return group;
}

export function createRawChickenTrayModel(materials, scale = 1.0) {
    const group = new THREE.Group();
    const trayMat = materials.metal || new THREE.MeshStandardMaterial({ color: 0x5c6066, metalness: 0.4, roughness: 0.5 });
    const rawMat = new THREE.MeshStandardMaterial({ color: 0xe6b599, roughness: 0.65 });
    const spiceMat = new THREE.MeshStandardMaterial({ color: 0x9c4620, roughness: 0.85 });
    const herbMat = new THREE.MeshStandardMaterial({ color: 0x3b6e2f, roughness: 0.88 });
    const potatoMat = new THREE.MeshStandardMaterial({ color: 0xd4b678, roughness: 0.85 });

    const trayBase = new THREE.Mesh(new THREE.BoxGeometry(0.30 * scale, 0.014 * scale, 0.22 * scale), trayMat);
    trayBase.position.y = 0.007 * scale;
    const rimN = new THREE.Mesh(new THREE.BoxGeometry(0.30 * scale, 0.028 * scale, 0.014 * scale), trayMat);
    rimN.position.set(0, 0.016 * scale, -0.105 * scale);
    const rimS = rimN.clone();
    rimS.position.z = 0.105 * scale;
    const rimW = new THREE.Mesh(new THREE.BoxGeometry(0.014 * scale, 0.028 * scale, 0.20 * scale), trayMat);
    rimW.position.set(-0.145 * scale, 0.016 * scale, 0);
    const rimE = rimW.clone();
    rimE.position.x = 0.145 * scale;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.088 * scale, 8, 6), rawMat);
    body.scale.set(1.32, 0.74, 0.92);
    body.position.set(-0.01 * scale, 0.062 * scale, 0);

    for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.SphereGeometry(0.038 * scale, 7, 5), rawMat);
        leg.scale.set(1.4, 0.82, 0.82);
        leg.position.set(0.062 * scale, 0.068 * scale, side * 0.058 * scale);
        leg.rotation.y = side * -0.25;
        leg.rotation.z = 0.24;

        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.030 * scale, 6, 5), rawMat);
        wing.scale.set(1.35, 0.62, 0.62);
        wing.position.set(-0.032 * scale, 0.058 * scale, side * 0.078 * scale);
        group.add(leg, wing);
    }

    const herb1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.022 * scale, 0), herbMat);
    herb1.scale.set(1.5, 0.35, 1.2);
    herb1.position.set(0.0, 0.125 * scale, 0);
    const spice = new THREE.Mesh(new THREE.SphereGeometry(0.018 * scale, 6, 4), spiceMat);
    spice.scale.set(1.6, 0.25, 1.3);
    spice.position.set(-0.035 * scale, 0.120 * scale, 0.02 * scale);

    for (const [px, pz] of [[-0.10, -0.06], [-0.10, 0.06], [0.10, -0.06], [0.10, 0.06]]) {
        const wedge = new THREE.Mesh(new THREE.DodecahedronGeometry(0.022 * scale, 0), potatoMat);
        wedge.scale.set(1.2, 0.75, 0.9);
        wedge.position.set(px * scale, 0.028 * scale, pz * scale);
        group.add(wedge);
    }

    group.add(trayBase, rimN, rimS, rimW, rimE, body, herb1, spice);
    return group;
}

function createOlivierPackModel(materials) {
    const group = new THREE.Group();
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.55, roughness: 0.35 });
    const mayoLidMat = new THREE.MeshStandardMaterial({ color: 0xd9b842, roughness: 0.45 });

    // Green peas tin can resting flat at y=0
    const peasCan = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.13, 10), materials.peasLabel);
    peasCan.position.set(0, 0.065, -0.065);
    const peasTop = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.008, 10), lidMat);
    peasTop.position.set(0, 0.131, -0.065);
    const peasBot = peasTop.clone();
    peasBot.position.y = 0.004;

    // Provansal mayonnaise jar resting flat at y=0
    const mayoJar = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.048, 0.115, 10), materials.mayoLabel);
    mayoJar.position.set(0, 0.058, 0.068);
    const mayoNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0xf4f0d8, roughness: 0.4 }));
    mayoNeck.position.set(0, 0.122, 0.068);
    const mayoLid = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.016, 10), mayoLidMat);
    mayoLid.position.set(0, 0.138, 0.068);

    group.add(peasCan, peasTop, peasBot, mayoJar, mayoNeck, mayoLid);
    return group;
}

function createMeatChickenPackModel(materials) {
    const group = new THREE.Group();
    const sausageMat = materials.meat || new THREE.MeshStandardMaterial({ color: 0x8f342c, roughness: 0.68 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xd6ccb4, roughness: 0.9 });
    const cheeseMat = new THREE.MeshStandardMaterial({ color: 0xe3b846, roughness: 0.72 });
    const trayWhite = new THREE.MeshStandardMaterial({ color: 0xebebe6, roughness: 0.7 });
    const rawBirdMat = new THREE.MeshStandardMaterial({ color: 0xe6b599, roughness: 0.65 });

    // Sausage stick resting at y=0
    const sausage = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.24, 8), sausageMat);
    sausage.rotation.x = Math.PI / 2;
    sausage.position.set(-0.04, 0.034, -0.09);
    for (const tz of [-0.19, -0.09, 0.01]) {
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 5, 8), tieMat);
        tie.position.set(-0.04, 0.034, tz);
        group.add(tie);
    }

    // Cheese wedge resting at y=0
    const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.048, 3), cheeseMat);
    cheese.position.set(0.055, 0.024, -0.08);
    cheese.rotation.y = 0.4;

    // Chilled chicken on white foam store tray resting at y=0
    const foamTray = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.016, 0.22), trayWhite);
    foamTray.position.set(0, 0.008, 0.12);
    const bird = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 6), rawBirdMat);
    bird.scale.set(0.95, 0.68, 1.32);
    bird.position.set(0, 0.052, 0.12);
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.184, 0.082, 0.224), materials.glass);
    wrap.position.set(0, 0.049, 0.12);

    group.add(sausage, cheese, foamTray, bird, wrap);
    return group;
}

function createCashRegisterModel(materials) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b4856, roughness: 0.65, metalness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.8 });
    const keyWhite = new THREE.MeshStandardMaterial({ color: 0xe6e2d4, roughness: 0.7 });
    const keyRed = new THREE.MeshStandardMaterial({ color: 0xb83228, roughness: 0.7 });
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf4f2e8, roughness: 0.92 });

    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.40), darkMat);
    drawer.position.y = 0.06;
    const drawerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.025), materials.metal);
    drawerHandle.position.set(0, 0.06, -0.21);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.20, 0.32), bodyMat);
    upper.position.set(0, 0.22, 0.02);

    const keypadBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.18), darkMat);
    keypadBase.position.set(0, 0.20, -0.13);
    keypadBase.rotation.x = 0.55;
    group.add(keypadBase);

    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
            const key = new THREE.Mesh(
                new THREE.BoxGeometry(0.048, 0.022, 0.036),
                (r === 2 && c === 3) ? keyRed : keyWhite
            );
            key.position.set(-0.105 + c * 0.07, 0.175 + r * 0.024, -0.18 + r * 0.045);
            key.rotation.x = 0.55;
            group.add(key);
        }
    }

    const displayBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.09), darkMat);
    displayBox.position.set(-0.04, 0.36, 0.11);
    const displayScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.07), materials.registerDisplay);
    displayScreen.position.set(-0.04, 0.36, 0.158);

    const paperRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.065, 8), paperMat);
    paperRoll.rotation.z = Math.PI / 2;
    paperRoll.position.set(0.13, 0.34, 0.06);

    group.add(drawer, drawerHandle, upper, displayBox, displayScreen, paperRoll);
    return group;
}

function createSovietScalesModel(materials) {
    const group = new THREE.Group();
    const enamelMat = materials.storeEnamel || new THREE.MeshStandardMaterial({ color: 0xcfd8da, roughness: 0.45 });
    const metalMat = materials.metal;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.75, metalness: 0.45 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.24), enamelMat);
    base.position.y = 0.05;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.08), enamelMat);
    tower.position.set(0, 0.21, 0.06);
    const dialFront = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.20), materials.scalesDial);
    dialFront.position.set(0, 0.22, 0.102);
    const dialBack = dialFront.clone();
    dialBack.rotation.y = Math.PI;
    dialBack.position.z = 0.018;

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.10, 7), metalMat);
    stem.position.set(0, 0.12, -0.06);
    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.016, 0.20), metalMat);
    pan.position.set(0, 0.175, -0.06);

    const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.055, 7), ironMat);
    w1.position.set(0.22, 0.028, -0.04);
    const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.020, 0.038, 7), ironMat);
    w2.position.set(0.26, 0.019, 0.02);

    group.add(base, tower, dialFront, dialBack, stem, pan, w1, w2);
    return group;
}

// =========================================================================
// Kitchen Cooking Station
// =========================================================================

export function buildKitchenCookingStation(builder) {
    const { engine, scene, world, materials } = builder;
    const tableY = 0.768;

    // 1. Grocery drop-off zone & visual grocery bag on kitchen table
    const dropGO = new GameObject('KitchenGroceryDropZone');
    dropGO.transform.position.set(2.38, tableY + 0.14, -2.55);
    const dropHitMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.28, 0.76),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
    );
    dropGO.transform.add(dropHitMesh);
    engine.addGameObject(dropGO);

    const dropHighlight = createHighlightRing(0.24);
    dropHighlight.position.set(2.38, tableY + 0.01, -2.55);
    scene.add(dropHighlight);

    const bagGroup = createGroceryBagModel(materials, 0.92);
    bagGroup.position.set(2.26, tableY, -2.84);
    bagGroup.rotation.y = 0.35;
    bagGroup.visible = false;
    scene.add(bagGroup);

    // 2. Textured Wooden Cutting Board + Detailed Kitchen Knife
    const boardGO = new GameObject('KitchenCookingBoard');
    boardGO.transform.position.set(2.40, tableY, -2.44);
    const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.022, 0.24), materials.cuttingBoard);
    boardMesh.position.y = 0.011;
    const boardHandle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.020, 0.075), materials.cuttingBoard);
    boardHandle.position.set(-0.20, 0.011, 0);

    const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.032), materials.metal);
    knifeBlade.position.set(0.05, 0.026, 0.078);
    knifeBlade.rotation.y = 0.24;
    const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.018, 0.022), materials.woodDark);
    knifeHandle.position.set(-0.07, 0.028, 0.106);
    knifeHandle.rotation.y = 0.24;
    const boardHitMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.20, 0.36),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
    );
    boardHitMesh.position.set(0, 0.06, 0);
    boardGO.transform.add(boardMesh, boardHandle, knifeBlade, knifeHandle, boardHitMesh);

    // Raw Olivier prep ingredients
    const olivierPrep = new THREE.Group();
    const peasCan = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.098, 8), materials.peasLabel);
    peasCan.position.set(-0.11, 0.070, -0.055);
    const mayoJar = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.092, 8), materials.mayoLabel);
    mayoJar.position.set(-0.025, 0.068, -0.065);
    const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.115, 6), builder._ps1Mat({ color: 0xd96b27, roughness: 0.8 }));
    carrot.rotation.z = Math.PI / 2;
    carrot.position.set(0.05, 0.035, -0.015);
    const potato = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), builder._ps1Mat({ color: 0xb59563, roughness: 0.9 }));
    potato.scale.set(1.25, 0.85, 0.95);
    potato.position.set(-0.04, 0.040, 0.01);
    const pickle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.085, 7), builder._ps1Mat({ color: 0x456e28, roughness: 0.78 }));
    pickle.rotation.z = Math.PI / 2;
    pickle.rotation.y = -0.3;
    pickle.position.set(0.03, 0.035, 0.032);
    olivierPrep.add(peasCan, mayoJar, carrot, potato, pickle);
    olivierPrep.visible = false;
    boardGO.transform.add(olivierPrep);

    // Raw meat & cheese prep ingredients
    const meatPrep = new THREE.Group();
    const sausageStick = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 8), materials.meat);
    sausageStick.rotation.z = Math.PI / 2;
    sausageStick.rotation.y = 0.25;
    sausageStick.position.set(0.02, 0.046, -0.025);
    const cheeseWedge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.042, 3), builder._ps1Mat({ color: 0xe3ba54, roughness: 0.7 }));
    cheeseWedge.position.set(-0.075, 0.042, 0.015);
    for (let s = 0; s < 3; s++) {
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.007, 8), materials.meat);
        sl.position.set(0.095 + s * 0.014, 0.028, 0.015 + s * 0.012);
        meatPrep.add(sl);
    }
    meatPrep.add(sausageStick, cheeseWedge);
    meatPrep.visible = false;
    boardGO.transform.add(meatPrep);

    boardGO.transform.visible = false;
    engine.addGameObject(boardGO);

    const cookHighlight = createHighlightRing(0.20);
    cookHighlight.position.set(2.40, tableY + 0.028, -2.44);
    scene.add(cookHighlight);

    // 3. Freshly cooked Olivier & Meat platter on the kitchen table (to be put into fridge)
    const cookedOlivierGO = new GameObject('CookedOlivier');
    cookedOlivierGO.transform.position.set(2.48, tableY + 0.045, -2.76);
    cookedOlivierGO.transform.add(builder.createOlivierBowlModel(0.95));
    cookedOlivierGO.transform.visible = false;
    engine.addGameObject(cookedOlivierGO);

    const cookedMeatGO = new GameObject('CookedMeat');
    cookedMeatGO.transform.position.set(2.26, tableY + 0.012, -2.22);
    cookedMeatGO.transform.add(builder.createMeatPlatterModel(0.92));
    cookedMeatGO.transform.visible = false;
    engine.addGameObject(cookedMeatGO);

    // 4. Fridge interior drop-off zone (for putting cooked Olivier & Meat into fridge during prologue)
    const fridgeDropGO = new GameObject('FridgeStoreZone');
    fridgeDropGO.transform.position.set(3.64, 0.96, -2.85);
    const fridgeHit = new THREE.Mesh(
        new THREE.BoxGeometry(0.50, 0.65, 0.56),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
    );
    fridgeDropGO.transform.add(fridgeHit);
    engine.addGameObject(fridgeDropGO);

    // 5. Detailed Raw Seasoned Chicken Tray on kitchen table
    const rawChickenGO = new GameObject('RawChickenTray');
    rawChickenGO.transform.position.set(2.46, tableY, -2.20);
    rawChickenGO.transform.add(createRawChickenTrayModel(materials, 0.92));
    rawChickenGO.transform.visible = false;
    engine.addGameObject(rawChickenGO);

    // 6. Oven baking zone & raw chicken inside oven (at stoveZ = -2.10)
    const stoveZ = -2.10;
    const ovenBakeZoneGO = new GameObject('OvenBakeZone');
    ovenBakeZoneGO.transform.position.set(3.62, 0.34, stoveZ);
    const ovenHitMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.32, 0.48),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
    );
    ovenBakeZoneGO.transform.add(ovenHitMesh);
    engine.addGameObject(ovenBakeZoneGO);

    const ovenRawChicken = createRawChickenTrayModel(materials, 0.92);
    ovenRawChicken.position.set(3.62, 0.28, stoveZ);
    ovenRawChicken.visible = false;
    scene.add(ovenRawChicken);

    const sinkHighlight = createHighlightRing(0.24);
    sinkHighlight.position.set(3.74, 0.89, -1.25);
    scene.add(sinkHighlight);

    const sofaHighlight = createHighlightRing(0.36);
    sofaHighlight.position.set(-2.78, 0.60, -1.0);
    scene.add(sofaHighlight);

    world.cooking = {
        dropZone: dropGO,
        dropHighlight,
        bagMesh: bagGroup,
        boardGO,
        cookHighlight,
        olivierPrep,
        meatPrep,
        cookedOlivierGO,
        cookedMeatGO,
        fridgeDropGO,
        rawChickenGO,
        ovenBakeZoneGO,
        ovenRawChicken,
        sinkHighlight,
        sofaHighlight
    };
}

// =========================================================================
// Spacious Post-Soviet Universam / Gastronom («ПРОДУКТЫ 24»)
// =========================================================================

export function buildGroceryStore(builder) {
    const { engine, scene, world, materials, tex } = builder;
    const OX = STORE_ORIGIN.x;
    const OY = STORE_ORIGIN.y;
    const OZ = STORE_ORIGIN.z;

    const prevCategory = builder._currentCategory;
    builder._currentCategory = 'store';

    const trimMat = builder._ps1Mat({ color: 0x3b4856, roughness: 0.7 });
    const metalFrameMat = builder._ps1Mat({ color: 0x6c737a, roughness: 0.55, metalness: 0.35 });
    const rubberMat = builder._ps1Mat({ color: 0x1c1e22, roughness: 0.95 });
    const crateWoodMat = builder._ps1Mat({ color: 0x9c7b4c, roughness: 0.9 });
    const orangeMat = builder._ps1Mat({ color: 0xe67e22, roughness: 0.65 });
    const breadDarkMat = builder._ps1Mat({ color: 0x5c361a, roughness: 0.92 });
    const breadLightMat = builder._ps1Mat({ color: 0xc28a42, roughness: 0.88 });
    const nightOutsideMat = new THREE.MeshBasicMaterial({ color: 0x09101e });
    const priceTagMat = new THREE.MeshBasicMaterial({ color: 0xf7f2da });

    // Spacious Universam hall: 15.6m wide (OX-7.8..OX+7.8), 12.6m deep (OZ-6.3..OZ+6.3), 3.7m tall
    const W = 15.6;
    const D = 12.6;
    const H = 3.7;
    const halfW = W * 0.5;
    const halfD = D * 0.5;

    builder._addStaticBox('StoreFloor', OX, OY - 0.1, OZ, W + 0.4, 0.2, D + 0.4, materials.storeFloor, { castShadow: false });
    builder._addStaticBox('StoreCeiling', OX, OY + H + 0.09, OZ, W + 0.4, 0.18, D + 0.4, materials.storeCeiling, { castShadow: false });

    // North wall (-Z): Gastronomy backsplash tiles behind counter + upper cream wall
    builder._addStaticBox('StoreWallNorthTiles', OX, OY + 1.05, OZ - halfD - 0.05, W + 0.4, 2.1, 0.18, materials.storeTileBacksplash);
    builder._addStaticBox('StoreWallNorthHigh', OX, OY + 2.90, OZ - halfD - 0.05, W + 0.4, 1.6, 0.18, materials.storeWallHigh);

    // West wall (-X): Bakery & groceries
    builder._addStaticBox('StoreWallWestLow', OX - halfW - 0.05, OY + 0.85, OZ, 0.18, 1.7, D + 0.4, materials.storeWallLow);
    builder._addStaticBox('StoreWallWestHigh', OX - halfW - 0.05, OY + 2.70, OZ, 0.18, 2.0, D + 0.4, materials.storeWallHigh);

    // East wall (+X): Dairy & meat coolers
    builder._addStaticBox('StoreWallEastLow', OX + halfW + 0.05, OY + 0.85, OZ, 0.18, 1.7, D + 0.4, materials.storeWallLow);
    builder._addStaticBox('StoreWallEastHigh', OX + halfW + 0.05, OY + 2.70, OZ, 0.18, 2.0, D + 0.4, materials.storeWallHigh);

    // South wall (+Z) with wide Soviet shopfront windows & central entrance vestibule (тамбур)
    builder._addStaticBox('StoreWallSouthBaseL', OX - 4.45, OY + 0.45, OZ + halfD + 0.05, 6.9, 0.9, 0.18, materials.storeWallLow);
    builder._addStaticBox('StoreWallSouthBaseR', OX + 4.45, OY + 0.45, OZ + halfD + 0.05, 6.9, 0.9, 0.18, materials.storeWallLow);
    builder._addStaticBox('StoreWallSouthTop', OX, OY + 3.10, OZ + halfD + 0.05, W + 0.4, 1.2, 0.18, materials.storeWallHigh);
    builder._addStaticBox('StoreWinSillL', OX - 4.45, OY + 0.92, OZ + halfD, 6.8, 0.08, 0.24, materials.storeWood, { collide: false });
    builder._addStaticBox('StoreWinSillR', OX + 4.45, OY + 0.92, OZ + halfD, 6.8, 0.08, 0.24, materials.storeWood, { collide: false });
    builder._addStaticBox('StoreWinGlassL', OX - 4.45, OY + 1.72, OZ + halfD + 0.05, 6.7, 1.6, 0.08, materials.glass, { blocker: false, castShadow: false });
    builder._addStaticBox('StoreWinGlassR', OX + 4.45, OY + 1.72, OZ + halfD + 0.05, 6.7, 1.6, 0.08, materials.glass, { blocker: false, castShadow: false });

    // Vestibule side glass partitions (тамбур) + rubber doormat + radiator
    builder._addStaticBox('StoreVestibuleL', OX - 1.15, OY + 1.35, OZ + halfD - 0.85, 0.10, 2.7, 1.7, materials.glass, { blocker: false });
    builder._addStaticBox('StoreVestibuleR', OX + 1.15, OY + 1.35, OZ + halfD - 0.85, 0.10, 2.7, 1.7, materials.glass, { blocker: false });
    const doormat = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.02, 1.25), rubberMat);
    doormat.position.set(OX, OY + 0.01, OZ + halfD - 0.82);
    scene.add(doormat);

    // Night street & snowbank outside front shop windows
    const outsideBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), nightOutsideMat);
    outsideBackdrop.position.set(OX, OY + 2.0, OZ + halfD + 2.2);
    outsideBackdrop.rotation.y = Math.PI;
    scene.add(outsideBackdrop);
    const outsideSnow = new THREE.Mesh(new THREE.BoxGeometry(24, 0.6, 2.2), materials.snow);
    outsideSnow.position.set(OX, OY + 0.18, OZ + halfD + 1.1);
    scene.add(outsideSnow);

    // Store Exit Door with textured door material
    const exitDoorGO = new GameObject('StoreExitDoor');
    exitDoorGO.transform.position.set(OX, OY + 1.22, OZ + halfD - 0.02);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.95, 2.42, 0.10), materials.storeDoor || trimMat);
    const doorWinL = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.25, 0.12), materials.glass);
    doorWinL.position.set(-0.46, 0.34, 0);
    const doorWinR = doorWinL.clone();
    doorWinR.position.x = 0.46;
    const doorHandleL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.09), materials.metal);
    doorHandleL.position.set(-0.10, -0.05, -0.07);
    const doorHandleR = doorHandleL.clone();
    doorHandleR.position.x = 0.10;
    exitDoorGO.transform.add(doorMesh, doorWinL, doorWinR, doorHandleL, doorHandleR);
    exitDoorGO.addComponent(BoxCollider, new THREE.Vector3(2.0, 2.45, 0.18));
    exitDoorGO.addComponent(RigidBody, { bodyType: 'static' });
    engine.addGameObject(exitDoorGO);

    // 4 Classic Post-Soviet Concrete Support Columns with New Year tinsel
    const goldTinsel = builder._ps1Mat({ color: 0xf7d046, emissive: 0x805a10, emissiveIntensity: 0.45 });
    const redTinsel = builder._ps1Mat({ color: 0xc92222, emissive: 0x550808, emissiveIntensity: 0.4 });
    const colCoords = [
        [OX - 3.9, OZ - 2.2],
        [OX + 3.9, OZ - 2.2],
        [OX - 3.9, OZ + 2.4],
        [OX + 3.9, OZ + 2.4]
    ];
    for (let idx = 0; idx < colCoords.length; idx++) {
        const [cx, cz] = colCoords[idx];
        builder._addStaticBox(`StoreColLow_${idx}`, cx, OY + 0.85, cz, 0.46, 1.7, 0.46, materials.storeWallLow);
        builder._addStaticBox(`StoreColHigh_${idx}`, cx, OY + 2.70, cz, 0.46, 2.0, 0.46, materials.storeWallHigh, { collide: false });
        // Festive ring around column
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 12), idx % 2 === 0 ? goldTinsel : redTinsel);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(cx, OY + 2.55, cz);
        scene.add(ring);
    }

    // Fluorescent ceiling lighting grid across the spacious hall
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xfff8e6 });
    const lightPositions = [
        [OX - 4.2, OZ - 3.6], [OX, OZ - 3.6], [OX + 4.2, OZ - 3.6],
        [OX - 4.2, OZ + 0.4], [OX, OZ + 0.4], [OX + 4.2, OZ + 0.4],
        [OX - 4.2, OZ + 4.0], [OX + 4.2, OZ + 4.0]
    ];
    for (const [lx, lz] of lightPositions) {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.06, 0.24), materials.storeEnamel);
        housing.position.set(lx, OY + H - 0.04, lz);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.52, 6), tubeMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(lx, OY + H - 0.10, lz);
        scene.add(housing, tube);
    }
    const storeLights = [];
    for (const [lx, lz, inten] of [[OX - 3.5, OZ - 2.5, 2.1], [OX + 3.5, OZ - 2.5, 2.1], [OX, OZ + 2.6, 2.0]]) {
        const pl = new THREE.PointLight(0xfff1d6, inten, 16, 1.25);
        pl.position.set(lx, OY + H - 0.35, lz);
        scene.add(pl);
        storeLights.push(pl);
    }

    // --- Department Signs & Retro Posters ---
    const addDeptSign = (text, bg, fg, x, y, z, rotY = 0, w = 2.0, h = 0.48) => {
        const signMat = new THREE.MeshBasicMaterial({ map: tex.createStoreDeptSignTexture(text, bg, fg) });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), trimMat);
        frame.position.set(x, y, z);
        frame.rotation.y = rotY;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat);
        plane.position.set(0, 0, 0.028);
        frame.add(plane);
        scene.add(frame);
    };

    // Main Sign "ПРОДУКТЫ 24" + "ГАСТРОНОМ" + "ХЛЕБ" + "БАКАЛЕЯ" + "МОЛОКО" + "С НОВЫМ ГОДОМ!"
    const mainSignFrame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.86, 0.07), trimMat);
    mainSignFrame.position.set(OX, OY + 3.05, OZ - halfD + 0.05);
    const mainSignFace = new THREE.Mesh(new THREE.PlaneGeometry(3.46, 0.76), materials.storeSign);
    mainSignFace.position.z = 0.038;
    mainSignFrame.add(mainSignFace);
    scene.add(mainSignFrame);

    addDeptSign('ГАСТРОНОМ', '#244b66', '#f7ebd0', OX - 4.4, OY + 2.85, OZ - halfD + 0.06, 0);
    addDeptSign('С НОВЫМ ГОДОМ!', '#8c1d1d', '#ffe89c', OX + 4.4, OY + 2.85, OZ - halfD + 0.06, 0, 2.5, 0.54);
    addDeptSign('ХЛЕБ И ВЫПЕЧКА', '#6b4222', '#fff0cf', OX - halfW + 0.06, OY + 2.65, OZ + 0.2, Math.PI / 2, 2.4, 0.48);
    addDeptSign('МОЛОКО · МЯСО', '#1f4e70', '#eef6ff', OX + halfW - 0.06, OY + 2.65, OZ - 0.4, -Math.PI / 2, 2.4, 0.48);
    addDeptSign('БАКАЛЕЯ', '#2b593c', '#f5ebd0', OX - 1.4, OY + 2.38, OZ + 0.4, 0, 1.5, 0.36);

    // --- Working Wall Clock in the Store (real moving hour, minute & red second hands!) ---
    const storeClock = new THREE.Group();
    storeClock.position.set(OX + 2.55, OY + 2.88, OZ - halfD + 0.07);
    const scRim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 18), materials.woodDark);
    scRim.rotation.x = Math.PI / 2;
    const scDial = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.056, 18), materials.clockDial);
    scDial.rotation.x = Math.PI / 2;
    const scMinPivot = new THREE.Object3D();
    scMinPivot.position.set(0, 0, 0.032);
    const scMinHand = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.205, 0.008), materials.darkSilhouette);
    scMinHand.position.y = 0.088;
    scMinPivot.add(scMinHand);
    const scHrPivot = new THREE.Object3D();
    scHrPivot.position.set(0, 0, 0.036);
    const scHrHand = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.135, 0.008), materials.darkSilhouette);
    scHrHand.position.y = 0.055;
    scHrPivot.add(scHrHand);
    const scSecPivot = new THREE.Object3D();
    scSecPivot.position.set(0, 0, 0.040);
    const scSecHand = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.235, 0.006), new THREE.MeshBasicMaterial({ color: 0xcc2222 }));
    scSecHand.position.y = 0.082;
    scSecPivot.add(scSecHand);
    const scPin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), materials.metal);
    scPin.rotation.x = Math.PI / 2;
    scPin.position.z = 0.038;
    storeClock.add(scRim, scDial, scMinPivot, scHrPivot, scSecPivot, scPin);
    scene.add(storeClock);
    if (Array.isArray(world.clocks)) {
        world.clocks.push({ hourPivot: scHrPivot, minutePivot: scMinPivot, secondPivot: scSecPivot, axis: 'z', sign: -1 });
    }

    // --- Long Gastronomy & Checkout Counter along North Wall (z = OZ - 4.25) ---
    builder._addStaticBox('StoreCounterMain', OX - 0.6, OY + 0.48, OZ - 4.25, 9.6, 0.96, 0.82, materials.storeWood);
    builder._addStaticBox('StoreCounterTop', OX - 0.6, OY + 0.99, OZ - 4.25, 9.68, 0.06, 0.88, materials.storeEnamel, { collide: false });
    // Glass display showcase on left half of counter (salads, cheeses, sausages, pastry)
    builder._addStaticBox('StoreCounterGlass', OX - 3.2, OY + 1.24, OZ - 4.18, 4.1, 0.46, 0.56, materials.glass, { collide: false, blocker: false });
    const showcaseBar = new THREE.Mesh(new THREE.BoxGeometry(4.14, 0.03, 0.58), materials.metal);
    showcaseBar.position.set(OX - 3.2, OY + 1.47, OZ - 4.18);
    scene.add(showcaseBar);
    const trayColors = [0xb85234, 0xd9a844, 0x733a24, 0xc97b42, 0x99352d, 0xd4c272, 0x5c803b, 0xc76b48];
    for (let i = 0; i < 8; i++) {
        const tx = OX - 4.95 + i * 0.49;
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.34), materials.storeEnamel);
        tray.position.set(tx, OY + 1.04, OZ - 4.18);
        const food = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.075, 0.24), builder._ps1Mat({ color: trayColors[i] }));
        food.position.set(tx, OY + 1.095, OZ - 4.18);
        scene.add(tray, food);
    }

    // Cash Register, Soviet Scales & Mini New Year Tree on Checkout side of counter
    const cashRegister = createCashRegisterModel(materials);
    cashRegister.position.set(OX + 1.35, OY + 1.02, OZ - 4.26);
    cashRegister.rotation.y = -0.14;
    scene.add(cashRegister);

    const sovietScales = createSovietScalesModel(materials);
    sovietScales.position.set(OX + 0.15, OY + 1.02, OZ - 4.22);
    scene.add(sovietScales);

    const miniTreeGroup = new THREE.Group();
    miniTreeGroup.position.set(OX + 2.45, OY + 1.02, OZ - 4.22);
    const mtPot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.09, 7), builder._ps1Mat({ color: 0x8f3a2b }));
    mtPot.position.y = 0.045;
    const mtCone1 = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.30, 7), builder._ps1Mat({ color: 0x1e5c2c }));
    mtCone1.position.y = 0.22;
    const mtCone2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 7), builder._ps1Mat({ color: 0x246b34 }));
    mtCone2.position.y = 0.39;
    const mtStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), redTinsel);
    mtStar.position.y = 0.54;
    miniTreeGroup.add(mtPot, mtCone1, mtCone2, mtStar);
    scene.add(miniTreeGroup);

    // --- Wooden Bakery Rack along West Wall (ХЛЕБ И ВЫПЕЧКА) ---
    const bakeryX = OX - halfW + 0.48;
    builder._addStaticBox('StoreBakeryRack', bakeryX, OY + 0.95, OZ + 0.2, 0.72, 1.9, 5.2, materials.storeWood);
    for (let lvl = 0; lvl < 3; lvl++) {
        const by = OY + 0.48 + lvl * 0.48;
        const bin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 4.9), materials.storeWood);
        bin.position.set(bakeryX + 0.12, by, OZ + 0.2);
        bin.rotation.z = -0.14;
        scene.add(bin);
        for (let b = 0; b < 9; b++) {
            const bz = OZ - 2.0 + b * 0.54;
            const isDark = (b + lvl) % 2 === 0;
            const loaf = new THREE.Mesh(
                isDark ? new THREE.BoxGeometry(0.24, 0.13, 0.20) : new THREE.CylinderGeometry(0.068, 0.068, 0.28, 7),
                isDark ? breadDarkMat : breadLightMat
            );
            if (!isDark) loaf.rotation.z = Math.PI / 2;
            loaf.position.set(bakeryX + 0.18, by + 0.08, bz);
            scene.add(loaf);
        }
    }

    // --- Two Distinct Double-Sided Metal Grocery Gondolas in Center Hall (БАКАЛЕЯ) ---
    const buildGroceryGondola = (name, gx, gz, lenZ, skipSpot = null) => {
        const g = new THREE.Group();
        g.position.set(gx, OY, gz);
        // Central steel spine & base plinth
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, lenZ), trimMat);
        plinth.position.y = 0.08;
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.65, lenZ), metalFrameMat);
        spine.position.y = 0.92;
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, lenZ + 0.04), trimMat);
        topRail.position.y = 1.76;
        g.add(plinth, spine, topRail);

        const shelfYs = [0.28, 0.70, 1.14, 1.54];
        const shelfMats = [materials.peasLabel, materials.condensedMilk, materials.teaBox, materials.mayoLabel];
        const lidMat = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.5, roughness: 0.4 });
        const glassGreen = new THREE.MeshStandardMaterial({ color: 0x265932, roughness: 0.28 });

        for (let lvl = 0; lvl < shelfYs.length; lvl++) {
            const sy = shelfYs[lvl];
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.036, lenZ), materials.storeEnamel);
            plank.position.y = sy;
            g.add(plank);
            const topSurfaceY = sy + 0.018;

            // Price strips on both sides
            for (const side of [-1, 1]) {
                for (let t = 0; t < 4; t++) {
                    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.034), priceTagMat);
                    tag.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
                    tag.position.set(side * 0.443, sy, -lenZ * 0.36 + t * (lenZ * 0.24));
                    g.add(tag);
                }

                // Populate shelf with varied 3D goods resting directly on topSurfaceY
                const cols = 8;
                for (let j = 0; j < cols; j++) {
                    const pz = -lenZ * 0.42 + (j / (cols - 1)) * (lenZ * 0.84);
                    // Leave a clean gap where the collectible Olivier pack sits on the shelf
                    if (skipSpot && side === skipSpot.side && lvl === skipSpot.lvl && Math.abs(pz - skipSpot.localZ) < 0.34) {
                        continue;
                    }
                    const px = side * 0.24;
                    if (lvl === 0) {
                        // Tall bottles of oil / lemonade
                        const bH = 0.23;
                        const bMat = j % 2 === 0 ? glassGreen : builder._ps1Mat({ color: 0xd9a036, roughness: 0.32 });
                        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.044, bH, 8), bMat);
                        bottle.position.set(px, topSurfaceY + bH * 0.5, pz);
                        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.026, 0.07, 7), bMat);
                        neck.position.set(px, topSurfaceY + bH + 0.035, pz);
                        g.add(bottle, neck);
                    } else if (lvl === 1 || lvl === 2) {
                        // Labelled tins (condensed milk, peas, mayo)
                        const cH = 0.13;
                        const canMat = shelfMats[(lvl + j) % shelfMats.length];
                        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, cH, 8), canMat);
                        can.position.set(px, topSurfaceY + cH * 0.5, pz);
                        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.050, 0.01, 8), lidMat);
                        lid.position.set(px, topSurfaceY + cH + 0.005, pz);
                        g.add(can, lid);
                    } else {
                        // Tea boxes, cereal cartons & cardboard boxes
                        const bxH = 0.17;
                        const bxMat = j % 3 === 0 ? materials.teaBox : (j % 3 === 1 ? materials.cardboardBox : builder._ps1Mat({ color: [0x9e382e, 0x3b628c, 0xc79238][j % 3] }));
                        const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, bxH, 0.18), bxMat);
                        box.position.set(px, topSurfaceY + bxH * 0.5, pz);
                        g.add(box);
                    }
                }
            }
        }
        scene.add(g);

        const colGO = new GameObject(name);
        colGO.transform.position.set(gx, OY + 0.9, gz);
        colGO.addComponent(BoxCollider, new THREE.Vector3(0.94, 1.8, lenZ + 0.04));
        colGO.addComponent(RigidBody, { bodyType: 'static' });
        engine.addGameObject(colGO);
    };

    // Gondola 1 (left-center) & Gondola 2 (right-center)
    const gondola1X = OX - 2.15;
    const gondola1Z = OZ + 0.65;
    buildGroceryGondola('StoreGondola_1', gondola1X, gondola1Z, 4.4, { side: 1, lvl: 2, localZ: -0.20 });
    buildGroceryGondola('StoreGondola_2', OX + 1.85, OZ + 0.65, 4.4, null);

    // --- Collectible Pack 1: Olivier ingredients resting EXACTLY on Gondola 1 shelf (lvl 2: y = 1.14 + 0.018 = 1.158) ---
    const olivierPackX = gondola1X + 0.24;
    const olivierPackY = OY + 1.158;
    const olivierPackZ = gondola1Z - 0.20;
    const olivierPackGO = new GameObject('StoreOlivierPack');
    olivierPackGO.transform.position.set(olivierPackX, olivierPackY, olivierPackZ);
    const opModel = createOlivierPackModel(materials);
    const opHit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.56), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false }));
    opHit.position.set(0.06, 0.09, 0);
    olivierPackGO.transform.add(opModel, opHit);
    engine.addGameObject(olivierPackGO);

    const olivierPackHighlight = createHighlightRing(0.18);
    olivierPackHighlight.position.set(olivierPackX, olivierPackY + 0.004, olivierPackZ);
    scene.add(olivierPackHighlight);

    // --- Open Multi-Deck Dairy & Meat Refrigerated Wall Display along East Wall (МОЛОКО · МЯСО) ---
    const coolerX = OX + halfW - 0.56;
    const coolerZ = OZ - 0.4;
    const coolerLen = 6.2;
    builder._addStaticBox('StoreCoolerBack', coolerX + 0.38, OY + 1.08, coolerZ, 0.16, 2.16, coolerLen, materials.storeEnamel);
    builder._addStaticBox('StoreCoolerTop', coolerX, OY + 2.10, coolerZ, 0.92, 0.14, coolerLen, materials.storeEnamel, { collide: false });
    builder._addStaticBox('StoreCoolerBase', coolerX, OY + 0.24, coolerZ, 0.92, 0.48, coolerLen, trimMat);
    builder._addStaticBox('StoreCoolerSideN', coolerX, OY + 1.08, coolerZ - coolerLen * 0.5, 0.92, 2.16, 0.10, materials.storeEnamel, { collide: false });
    builder._addStaticBox('StoreCoolerSideS', coolerX, OY + 1.08, coolerZ + coolerLen * 0.5, 0.92, 2.16, 0.10, materials.storeEnamel, { collide: false });

    const coolerShelfYs = [0.56, 1.00, 1.46];
    for (let lvl = 0; lvl < coolerShelfYs.length; lvl++) {
        const cy = OY + coolerShelfYs[lvl];
        const grate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.024, coolerLen - 0.16), materials.metal);
        grate.position.set(coolerX - 0.04, cy, coolerZ);
        scene.add(grate);
        const shelfTop = cy + 0.012;

        for (let k = 0; k < 10; k++) {
            const kz = coolerZ - 2.65 + k * 0.59;
            // Leave clean space on middle shelf (lvl 1) for collectible meat & chicken pack
            if (lvl === 1 && Math.abs(kz - (coolerZ + 0.15)) < 0.45) continue;

            if (lvl === 2) {
                const milk = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 0.11), materials.milkCarton);
                milk.position.set(coolerX - 0.08, shelfTop + 0.11, kz);
                scene.add(milk);
            } else if (lvl === 1) {
                const cheeseW = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), builder._ps1Mat({ color: 0xe3b846 }));
                cheeseW.position.set(coolerX - 0.08, shelfTop + 0.04, kz);
                scene.add(cheeseW);
            } else {
                const sausage = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 8), materials.meat);
                sausage.rotation.z = Math.PI / 2;
                sausage.position.set(coolerX - 0.06, shelfTop + 0.04, kz);
                scene.add(sausage);
            }
        }
    }

    // --- Collectible Pack 2: Meat, Cheese & Chilled Chicken resting EXACTLY on Cooler middle shelf (y = 1.00 + 0.012 = 1.012) ---
    const meatPackX = coolerX - 0.12;
    const meatPackY = OY + 1.012;
    const meatPackZ = coolerZ + 0.15;
    const meatPackGO = new GameObject('StoreMeatPack');
    meatPackGO.transform.position.set(meatPackX, meatPackY, meatPackZ);
    const mpModel = createMeatChickenPackModel(materials);
    const mpHit = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.72), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false }));
    mpHit.position.set(-0.14, 0.10, 0);
    meatPackGO.transform.add(mpModel, mpHit);
    engine.addGameObject(meatPackGO);

    const meatPackHighlight = createHighlightRing(0.20);
    meatPackHighlight.position.set(meatPackX, meatPackY + 0.004, meatPackZ);
    scene.add(meatPackHighlight);

    // --- Wooden Crates with New Year Tangerines near entrance ---
    for (let c = 0; c < 2; c++) {
        const cx = OX + 4.4 + c * 0.72;
        const cz = OZ + 4.45;
        builder._addStaticBox(`TangerineCrate_${c}`, cx, OY + 0.24, cz, 0.62, 0.48, 0.52, crateWoodMat);
        for (let m = 0; m < 8; m++) {
            const tang = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 5), orangeMat);
            tang.position.set(cx - 0.18 + (m % 4) * 0.12, OY + 0.50, cz - 0.09 + Math.floor(m / 4) * 0.16);
            scene.add(tang);
        }
    }

    // --- 4 Store NPCs naturally spaced around the large Universam ---
    const npcConfigs = [
        {
            id: 'galya',
            pos: new THREE.Vector3(OX + 0.65, OY, OZ - 5.15),
            yaw: 0,
            heightScale: 0.96,
            buildWidth: 1.04,
            sweaterColor: 0x7d3a4b,
            collarColor: 0x592633,
            pantsColor: 0x262933,
            apronColor: 0xd9e0e5,
            skinColor: 0xdcb498,
            hairColor: 0x5c3e2b,
            hatStyle: 'bun',
            phaseOffset: 0.2
        },
        {
            id: 'nina',
            pos: new THREE.Vector3(OX - 5.45, OY, OZ + 0.35),
            yaw: Math.PI * 0.45,
            heightScale: 0.90,
            buildWidth: 0.98,
            coatColor: 0x4b3f52,
            collarColor: 0x352c3b,
            pantsColor: 0x232229,
            scarfColor: 0x9c3d3d,
            skinColor: 0xd6b29a,
            hairColor: 0x9c9993,
            hatStyle: 'kerchief',
            hatColor: 0x8f3338,
            phaseOffset: 1.7
        },
        {
            id: 'viktor',
            pos: new THREE.Vector3(OX + 5.25, OY, OZ - 1.25),
            yaw: -Math.PI * 0.52,
            heightScale: 1.05,
            buildWidth: 1.08,
            coatColor: 0x2c3640,
            collarColor: 0x1e242b,
            pantsColor: 0x1c2026,
            scarfColor: 0x59626b,
            skinColor: 0xcfa487,
            hairColor: 0x3a322c,
            hatStyle: 'ushanka',
            hatColor: 0x3d332c,
            phaseOffset: 3.1
        },
        {
            id: 'lyokha',
            pos: new THREE.Vector3(OX + 3.25, OY, OZ + 4.15),
            yaw: -Math.PI * 0.72,
            heightScale: 1.0,
            buildWidth: 0.96,
            coatColor: 0x344d3c,
            collarColor: 0x233629,
            pantsColor: 0x222c3d,
            skinColor: 0xdcb79c,
            hairColor: 0x2b2018,
            hatStyle: 'beanie',
            hatColor: 0x1f242e,
            phaseOffset: 4.5
        }
    ];

    const storeNPCs = [];
    for (const cfg of npcConfigs) {
        const npcGO = new GameObject(`StoreNPC_${cfg.id}`);
        npcGO.transform.position.copy(cfg.pos);

        const rig = buildArticulatedHuman({
            sweaterColor: cfg.sweaterColor,
            collarColor: cfg.collarColor,
            pantsColor: cfg.pantsColor,
            coatColor: cfg.coatColor ?? null,
            scarfColor: cfg.scarfColor ?? null,
            apronColor: cfg.apronColor ?? null,
            skinColor: cfg.skinColor,
            hairColor: cfg.hairColor,
            hatStyle: cfg.hatStyle,
            hatColor: cfg.hatColor ?? 0x3a2e28,
            heightScale: cfg.heightScale,
            buildWidth: cfg.buildWidth,
            matFactory: (o) => builder._ps1Mat(o)
        });
        rig.root.rotation.y = Math.PI + cfg.yaw;
        npcGO.transform.add(rig.root);
        // Keep npcGO.transform.rotation.y at 0 so the physics BoxCollider AABB never expands when the NPC turns!
        npcGO.transform.rotation.y = 0;

        // Generous invisible raycast hitbox (for Galya, extends slightly forward over the counter so the counter never blocks interaction)
        const npcHitBox = new THREE.Mesh(
            new THREE.BoxGeometry(cfg.id === 'galya' ? 0.95 : 0.58, 1.82, cfg.id === 'galya' ? 1.15 : 0.58),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
        );
        npcHitBox.position.set(0, 0.92, cfg.id === 'galya' ? 0.35 : 0);
        npcGO.transform.add(npcHitBox);

        npcGO.addComponent(BoxCollider, new THREE.Vector3(0.34, 1.72, 0.34), new THREE.Vector3(0, 0.86, 0));
        npcGO.addComponent(RigidBody, { bodyType: 'static' });
        engine.addGameObject(npcGO);

        storeNPCs.push({
            id: cfg.id,
            go: npcGO,
            rig,
            baseYaw: cfg.yaw,
            currentYaw: cfg.yaw,
            phase: cfg.phaseOffset,
            blinkTimer: 1.8 + Math.random() * 3.0,
            isTalking: false
        });
    }

    world.store = {
        origin: STORE_ORIGIN.clone(),
        spawnPos: new THREE.Vector3(OX, OY + 0.05, OZ + halfD - 1.35),
        spawnYaw: 0,
        exitDoor: exitDoorGO,
        olivierPackGO,
        olivierPackHighlight,
        meatPackGO,
        meatPackHighlight,
        npcs: storeNPCs,
        lights: storeLights,
        updateNPCs: (dt, playerPos, activeNpcId = null) => {
            const now = performance.now() * 0.001;
            const k = Math.min(1, dt * 5.0);
            for (const npc of storeNPCs) {
                const p = npc.go.transform.position;
                const dist = playerPos ? Math.hypot(playerPos.x - p.x, playerPos.z - p.z) : 99;
                const talking = npc.id === activeNpcId;
                npc.isTalking = talking;

                let goalYaw = npc.baseYaw;
                if (playerPos && (talking || dist < 4.0)) {
                    goalYaw = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
                }
                let diff = goalYaw - npc.currentYaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                npc.currentYaw += diff * k;
                // Rotate only the visual rig root so the static BoxCollider never changes dimensions
                npc.rig.root.rotation.y = Math.PI + npc.currentYaw;

                // Smooth radial depenetration so the player can never get stuck inside an NPC
                if (playerPos && dist < 0.54 && dist > 0.0001) {
                    const pushDirX = (playerPos.x - p.x) / dist;
                    const pushDirZ = (playerPos.z - p.z) / dist;
                    playerPos.x = p.x + pushDirX * 0.55;
                    playerPos.z = p.z + pushDirZ * 0.55;
                    const playerRB = engine?.player?.getComponent?.(RigidBody);
                    if (playerRB?.position) {
                        playerRB.position.x = playerPos.x;
                        playerRB.position.z = playerPos.z;
                    }
                }

                const breath = Math.sin(now * 1.9 + npc.phase);
                const sway = Math.sin(now * 0.85 + npc.phase);
                const r = npc.rig;
                r.pelvis.position.y = 0.78 + breath * 0.008;
                r.torsoPivot.rotation.x = -0.02 + breath * 0.015;
                r.torsoPivot.rotation.z = sway * 0.018;
                r.headPivot.rotation.x = talking ? -0.04 + Math.sin(now * 4.2 + npc.phase) * 0.045 : breath * 0.03;
                r.headPivot.rotation.y = talking ? Math.sin(now * 2.1 + npc.phase) * 0.08 : sway * 0.12;

                r.legL.rotation.x = 0.03 + Math.max(0, sway) * 0.04;
                r.kneeL.rotation.x = -0.06 - Math.max(0, sway) * 0.08;
                r.legR.rotation.x = 0.03 + Math.max(0, -sway) * 0.04;
                r.kneeR.rotation.x = -0.06 - Math.max(0, -sway) * 0.08;

                if (talking) {
                    const g = Math.sin(now * 4.6 + npc.phase);
                    r.shoulderL.rotation.x = THREE.MathUtils.lerp(r.shoulderL.rotation.x, 0.38 + g * 0.12, k);
                    r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, 0.95 + g * 0.22, k);
                    r.shoulderR.rotation.x = THREE.MathUtils.lerp(r.shoulderR.rotation.x, 0.44 - g * 0.16, k);
                    r.elbowR.rotation.x = THREE.MathUtils.lerp(r.elbowR.rotation.x, 1.05 - g * 0.24, k);
                } else {
                    r.shoulderL.rotation.x = THREE.MathUtils.lerp(r.shoulderL.rotation.x, 0.08 + breath * 0.03, k);
                    r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, 0.28 + breath * 0.04, k);
                    r.shoulderR.rotation.x = THREE.MathUtils.lerp(r.shoulderR.rotation.x, 0.08 - breath * 0.03, k);
                    r.elbowR.rotation.x = THREE.MathUtils.lerp(r.elbowR.rotation.x, 0.28 - breath * 0.04, k);
                }
                r.shoulderL.rotation.z = -0.07;
                r.shoulderR.rotation.z = 0.07;

                npc.blinkTimer -= dt;
                let lid = 0.08;
                if (npc.blinkTimer < 0) {
                    const b = -npc.blinkTimer;
                    lid = THREE.MathUtils.lerp(0.08, 1.0, Math.sin(Math.min(1, b / 0.15) * Math.PI));
                    if (b > 0.15) npc.blinkTimer = 2.4 + Math.random() * 3.5;
                }
                r.eyelidL.scale.y = lid;
                r.eyelidR.scale.y = lid;
            }
        }
    };

    builder._currentCategory = prevCategory;
}
