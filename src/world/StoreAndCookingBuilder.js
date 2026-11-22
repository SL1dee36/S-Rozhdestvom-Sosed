import * as THREE from 'three';
import { GameObject, BoxCollider, RigidBody } from '../../lumina/index.js';
import { buildArticulatedHuman } from './CharacterMeshBuilder.js';
import { buildCityStreetAndPodiezd } from './CityStreetBuilder.js';

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

export function createShoppingBasketModel(materials, scale = 1.0) {
    const group = new THREE.Group();
    const basketPlasticMat = new THREE.MeshStandardMaterial({ color: 0xc22b22, roughness: 0.65 });
    const wireMat = materials.metal || new THREE.MeshStandardMaterial({ color: 0x8a929a, metalness: 0.55, roughness: 0.35 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.85 });

    const bw = 0.32 * scale;
    const bh = 0.16 * scale;
    const bd = 0.23 * scale;
    const t = 0.012 * scale;

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.88, t, bd * 0.88), basketPlasticMat);
    bottom.position.y = t * 0.5;
    group.add(bottom);

    // Tapered front, back, left & right walls with classic Soviet shopping basket ribs
    const front = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), basketPlasticMat);
    front.position.set(0, bh * 0.5, -bd * 0.5);
    front.rotation.x = 0.08;
    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), basketPlasticMat);
    back.position.set(0, bh * 0.5, bd * 0.5);
    back.rotation.x = -0.08;
    const left = new THREE.Mesh(new THREE.BoxGeometry(t, bh, bd), basketPlasticMat);
    left.position.set(-bw * 0.5, bh * 0.5, 0);
    left.rotation.z = -0.08;
    const right = new THREE.Mesh(new THREE.BoxGeometry(t, bh, bd), basketPlasticMat);
    right.position.set(bw * 0.5, bh * 0.5, 0);
    right.rotation.z = 0.08;

    const rimN = new THREE.Mesh(new THREE.BoxGeometry(bw + t * 2, t * 1.4, t * 1.6), basketPlasticMat);
    rimN.position.set(0, bh, -bd * 0.52);
    const rimS = rimN.clone();
    rimS.position.z = bd * 0.52;
    const rimW = new THREE.Mesh(new THREE.BoxGeometry(t * 1.6, t * 1.4, bd + t * 2), basketPlasticMat);
    rimW.position.set(-bw * 0.52, bh, 0);
    const rimE = rimW.clone();
    rimE.position.x = bw * 0.52;

    // Twin wire handles folded slightly up with black plastic grips
    const handleGroup = new THREE.Group();
    for (const side of [-1, 1]) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(0.105 * scale, 0.0055 * scale, 5, 10, Math.PI), wireMat);
        arch.rotation.y = Math.PI / 2;
        arch.rotation.x = side * 0.16;
        arch.position.set(0, bh, side * 0.018 * scale);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * scale, 0.011 * scale, 0.095 * scale, 7), gripMat);
        grip.rotation.x = Math.PI / 2;
        grip.position.set(0, bh + 0.103 * scale, side * 0.034 * scale);
        handleGroup.add(arch, grip);
    }

    // Olivier pack sub-group sitting inside the left side of the basket
    const olivierSlot = new THREE.Group();
    const op = createOlivierPackModel(materials);
    op.scale.setScalar(0.84 * scale);
    op.position.set(-0.075 * scale, 0.012 * scale, 0.0);
    olivierSlot.add(op);
    olivierSlot.visible = false;

    // Meat & chicken pack sub-group sitting inside the right side of the basket
    const meatSlot = new THREE.Group();
    const mp = createMeatChickenPackModel(materials);
    mp.scale.setScalar(0.76 * scale);
    mp.position.set(0.055 * scale, 0.014 * scale, -0.02 * scale);
    meatSlot.add(mp);
    meatSlot.visible = false;

    group.add(front, back, left, right, rimN, rimS, rimW, rimE, handleGroup, olivierSlot, meatSlot);
    group.userData = { olivierSlot, meatSlot };
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

    builder._registerEditable(dropGO.transform, 'KitchenGroceryDropZone', { category: 'gameplay', extra: { gameObject: dropGO } });
    builder._registerEditable(bagGroup, 'KitchenGroceryBag', { category: 'activated', defaultHidden: true });
    builder._registerEditable(boardGO.transform, 'KitchenCookingBoard', { category: 'activated', defaultHidden: true, extra: { gameObject: boardGO } });
    builder._registerEditable(cookedOlivierGO.transform, 'CookedOlivier', { category: 'activated', defaultHidden: true, extra: { gameObject: cookedOlivierGO } });
    builder._registerEditable(cookedMeatGO.transform, 'CookedMeat', { category: 'activated', defaultHidden: true, extra: { gameObject: cookedMeatGO } });
    builder._registerEditable(fridgeDropGO.transform, 'FridgeStoreZone', { category: 'gameplay', extra: { gameObject: fridgeDropGO } });
    builder._registerEditable(rawChickenGO.transform, 'RawChickenTray', { category: 'activated', defaultHidden: true, extra: { gameObject: rawChickenGO } });
    builder._registerEditable(ovenBakeZoneGO.transform, 'OvenBakeZone', { category: 'gameplay', extra: { gameObject: ovenBakeZoneGO } });
    builder._registerEditable(ovenRawChicken, 'OvenRawChicken', { category: 'activated', defaultHidden: true });

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
    const reg = (obj, name, cat = 'store', extra = {}) => {
        builder._registerEditable(obj, name, { category: cat, extra });
        return obj;
    };

    const doormat = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.02, 1.25), rubberMat);
    doormat.position.set(OX, OY + 0.01, OZ + halfD - 0.82);
    scene.add(doormat);
    reg(doormat, 'StoreDoormat');

    // --- Exterior Storefront Sign, Canopy & Beveled Doorway Jambs (скосы) facing the snowy plaza (+Z) ---
    const extCanopy = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 1.45), trimMat);
    extCanopy.position.set(OX, OY + 2.74, OZ + halfD + 0.72);
    const extCanopySnow = new THREE.Mesh(new THREE.BoxGeometry(5.55, 0.14, 1.40), materials.snow);
    extCanopySnow.position.set(OX, OY + 2.88, OZ + halfD + 0.72);
    const extSignFrame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.98, 0.10), trimMat);
    extSignFrame.position.set(OX, OY + 3.44, OZ + halfD + 0.18);
    const extSignFace = new THREE.Mesh(new THREE.PlaneGeometry(4.46, 0.86), materials.storeSign);
    extSignFace.position.z = 0.055;
    extSignFrame.add(extSignFace);

    const extFacadeMat = builder._ps1Mat({ map: materials.concrete.map, color: 0x626872, roughness: 0.94 });
    const extParapet = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 1.2, 0.35), extFacadeMat);
    extParapet.position.set(OX, OY + H + 0.55, OZ + halfD + 0.08);
    const extRoofSnow = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.22, 0.45), materials.snow);
    extRoofSnow.position.set(OX, OY + H + 1.22, OZ + halfD + 0.08);
    const storeStepOut = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.2), materials.concrete);
    storeStepOut.position.set(OX, OY - 0.02, OZ + halfD + 0.60);
    scene.add(extCanopy, extCanopySnow, extSignFrame, extParapet, extRoofSnow, storeStepOut);
    reg(extCanopy, 'StoreExtCanopy');
    reg(extCanopySnow, 'StoreExtCanopySnow');
    reg(extSignFrame, 'StoreExtSignFrame');
    reg(extParapet, 'StoreExtParapet');
    reg(extRoofSnow, 'StoreExtRoofSnow');
    reg(storeStepOut, 'StoreStepOut');

    // Beveled doorway jambs & 45-degree chamfered casing (скосы / откосы) framing the double store doors
    const jambGroup = new THREE.Group();
    jambGroup.position.set(OX, OY, OZ + halfD);
    const jambMat = builder._ps1Mat({ color: 0x262e36, roughness: 0.72, metalness: 0.25 });
    const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.52, 0.32), jambMat);
    jambL.position.set(-1.04, 1.26, 0.02);
    const jambR = jambL.clone();
    jambR.position.x = 1.04;
    const jambTop = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.16, 0.34), jambMat);
    jambTop.position.set(0, 2.50, 0.02);
    // Angled 45-degree exterior & interior door bevels (скосы)
    for (const side of [-1, 1]) {
        const bevelOut = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.48, 0.14), extFacadeMat);
        bevelOut.position.set(side * 1.12, 1.24, 0.14);
        bevelOut.rotation.y = side * 0.48;
        const bevelIn = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.48, 0.12), jambMat);
        bevelIn.position.set(side * 1.09, 1.24, -0.10);
        bevelIn.rotation.y = -side * 0.42;
        jambGroup.add(bevelOut, bevelIn);
    }
    const bevelTop = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.16, 0.16), extFacadeMat);
    bevelTop.position.set(0, 2.58, 0.14);
    bevelTop.rotation.x = 0.48;
    jambGroup.add(jambL, jambR, jambTop, bevelTop);
    scene.add(jambGroup);
    reg(jambGroup, 'StoreDoorJambs');

    // TRUE DOUBLE STORE DOORS: two independent leaves swinging symmetrically outward in opposite directions!
    const exitDoorGO = new GameObject('StoreExitDoor');
    exitDoorGO.transform.position.set(OX, OY + 1.22, OZ + halfD - 0.02);

    const doorLeafMat = materials.storeDoor || trimMat;
    const leftDoorPivot = new THREE.Group();
    leftDoorPivot.position.set(-0.97, 0, 0);
    const leftLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.42, 0.09), doorLeafMat);
    leftLeaf.position.set(0.475, 0, 0);
    const leftWin = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.24, 0.11), materials.glass);
    leftWin.position.set(0.475, 0.34, 0);
    const leftHandle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.15), materials.metal);
    leftHandle.position.set(0.84, -0.04, 0);
    leftDoorPivot.add(leftLeaf, leftWin, leftHandle);

    const rightDoorPivot = new THREE.Group();
    rightDoorPivot.position.set(0.97, 0, 0);
    const rightLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.42, 0.09), doorLeafMat);
    rightLeaf.position.set(-0.475, 0, 0);
    const rightWin = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.24, 0.11), materials.glass);
    rightWin.position.set(-0.475, 0.34, 0);
    const rightHandle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.15), materials.metal);
    rightHandle.position.set(-0.84, -0.04, 0);
    rightDoorPivot.add(rightLeaf, rightWin, rightHandle);

    // Invisible center hit-box so raycasting either leaf triggers the double doors cleanly
    const doorHitBox = new THREE.Mesh(
        new THREE.BoxGeometry(2.05, 2.42, 0.32),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
    );
    exitDoorGO.transform.add(leftDoorPivot, rightDoorPivot, doorHitBox);
    const exitDoorCol = exitDoorGO.addComponent(BoxCollider, new THREE.Vector3(2.0, 2.45, 0.18));
    exitDoorGO.addComponent(RigidBody, { bodyType: 'static' });
    engine.addGameObject(exitDoorGO);
    reg(exitDoorGO.transform, 'StoreExitDoor', 'doors', { gameObject: exitDoorGO });

    // Build the full multi-district snowy Soviet neighborhood, wide ground-floor Podiezd, traffic, pedestrians, snow & stars!
    const city = buildCityStreetAndPodiezd(builder, OX, OY, OZ, halfD);
    const streetLights = city.streetLights;
    const ironDoorGO = city.ironDoor;
    const ironDoorCol = city.ironDoorCol;

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
        reg(ring, `StoreColTinsel_${idx}`);
    }

    // Fluorescent ceiling lighting grid across the spacious hall — very bright, crisp supermarket lighting!
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lightPositions = [
        [OX - 4.8, OZ - 3.8], [OX - 1.6, OZ - 3.8], [OX + 1.6, OZ - 3.8], [OX + 4.8, OZ - 3.8],
        [OX - 4.8, OZ + 0.2], [OX - 1.6, OZ + 0.2], [OX + 1.6, OZ + 0.2], [OX + 4.8, OZ + 0.2],
        [OX - 4.8, OZ + 4.1], [OX - 1.6, OZ + 4.1], [OX + 1.6, OZ + 4.1], [OX + 4.8, OZ + 4.1]
    ];
    lightPositions.forEach(([lx, lz], idx) => {
        const fg = new THREE.Group();
        fg.position.set(lx, OY + H - 0.04, lz);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.06, 0.26), materials.storeEnamel);
        const tube1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.54, 6), tubeMat);
        tube1.rotation.z = Math.PI / 2;
        tube1.position.set(0, -0.06, -0.05);
        const tube2 = tube1.clone();
        tube2.position.z = 0.05;
        fg.add(housing, tube1, tube2);
        scene.add(fg);
        reg(fg, `StoreCeilingFixture_${idx}`, 'fixtures');
    });
    const storeLights = [...streetLights];
    const storeLightCoords = [
        [OX - 4.6, OZ - 3.2, 5.2], [OX, OZ - 3.4, 5.4], [OX + 4.6, OZ - 3.2, 5.2],
        [OX - 4.6, OZ + 0.5, 5.0], [OX, OZ + 0.5, 5.4], [OX + 4.6, OZ + 0.5, 5.0],
        [OX - 4.2, OZ + 4.0, 4.6], [OX + 4.2, OZ + 4.0, 4.6]
    ];
    storeLightCoords.forEach(([lx, lz, inten], idx) => {
        const pl = new THREE.PointLight(0xfff8eb, inten, 24, 1.05);
        pl.position.set(lx, OY + H - 0.32, lz);
        scene.add(pl);
        builder._registerLight(pl, `storeCeilingLight_${idx}`, `Магазин лампа #${idx + 1}`, 'store');
        storeLights.push(pl);
    });

    // --- Department Signs & Retro Posters ---
    let deptSignIdx = 0;
    const addDeptSign = (text, bg, fg, x, y, z, rotY = 0, w = 2.0, h = 0.48, hanging = false) => {
        const signMat = new THREE.MeshBasicMaterial({ map: tex.createStoreDeptSignTexture(text, bg, fg) });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), trimMat);
        frame.position.set(x, y, z);
        frame.rotation.y = rotY;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat);
        plane.position.set(0, 0, 0.028);
        frame.add(plane);
        if (hanging) {
            // Double-sided face & twin metal suspension rods anchored directly into the ceiling so the sign never floats
            const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat);
            backPlane.position.set(0, 0, -0.028);
            backPlane.rotation.y = Math.PI;
            frame.add(backPlane);

            const signTopY = y + (h + 0.08) * 0.5;
            const rodH = Math.max(0.1, (OY + H) - signTopY);
            for (const rx of [-w * 0.36, w * 0.36]) {
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rodH, 6), metalFrameMat);
                rod.position.set(rx, (h + 0.08) * 0.5 + rodH * 0.5, 0);
                const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8), trimMat);
                mount.position.set(rx, (h + 0.08) * 0.5 + rodH - 0.015, 0);
                frame.add(rod, mount);
            }
        }
        scene.add(frame);
        reg(frame, `StoreDeptSign_${deptSignIdx++}`);
    };

    // Main Sign "ПРОДУКТЫ 24" + "ГАСТРОНОМ" + "ХЛЕБ" + "БАКАЛЕЯ" + "ОВОЩИ · ФРУКТЫ" + "МОЛОКО" + "С НОВЫМ ГОДОМ!"
    const mainSignFrame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.86, 0.07), trimMat);
    mainSignFrame.position.set(OX, OY + 3.05, OZ - halfD + 0.05);
    const mainSignFace = new THREE.Mesh(new THREE.PlaneGeometry(3.46, 0.76), materials.storeSign);
    mainSignFace.position.z = 0.038;
    mainSignFrame.add(mainSignFace);
    scene.add(mainSignFrame);
    reg(mainSignFrame, 'StoreMainSign');

    addDeptSign('ГАСТРОНОМ', '#244b66', '#f7ebd0', OX - 4.4, OY + 2.85, OZ - halfD + 0.06, 0);
    addDeptSign('С НОВЫМ ГОДОМ!', '#8c1d1d', '#ffe89c', OX + 4.6, OY + 2.85, OZ - halfD + 0.06, 0, 2.5, 0.54);
    addDeptSign('ХЛЕБ · КОНСЕРВЫ', '#6b4222', '#fff0cf', OX - halfW + 0.06, OY + 2.65, OZ - 0.6, Math.PI / 2, 2.5, 0.48);
    addDeptSign('ОВОЩИ · ФРУКТЫ', '#2d6336', '#f4f7d4', OX - halfW + 0.06, OY + 2.65, OZ + 3.6, Math.PI / 2, 2.4, 0.48);
    addDeptSign('МОЛОКО · МЯСО', '#1f4e70', '#eef6ff', OX + halfW - 0.06, OY + 2.65, OZ - 0.4, -Math.PI / 2, 2.4, 0.48);
    addDeptSign('БАКАЛЕЯ · НАПИТКИ', '#2b593c', '#f5ebd0', OX, OY + 2.50, OZ - 1.65, 0, 2.4, 0.44, true);

    // --- Working Wall Clock in the Store (aligned upright with 12 at top & real moving hands!) ---
    const storeClock = new THREE.Group();
    storeClock.position.set(OX + 2.55, OY + 2.88, OZ - halfD + 0.08);
    const scRim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 18), materials.woodDark);
    scRim.rotation.x = Math.PI / 2;
    const scDial = new THREE.Mesh(
        new THREE.CircleGeometry(0.295, 20),
        new THREE.MeshBasicMaterial({
            map: materials.clockDial.map,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        })
    );
    scDial.position.z = 0.028;
    const scMinPivot = new THREE.Object3D();
    scMinPivot.position.set(0, 0, 0.036);
    const scMinHand = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.205, 0.008), materials.darkSilhouette);
    scMinHand.position.y = 0.088;
    scMinPivot.add(scMinHand);
    const scHrPivot = new THREE.Object3D();
    scHrPivot.position.set(0, 0, 0.040);
    const scHrHand = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.135, 0.008), materials.darkSilhouette);
    scHrHand.position.y = 0.055;
    scHrPivot.add(scHrHand);
    const scSecPivot = new THREE.Object3D();
    scSecPivot.position.set(0, 0, 0.044);
    const scSecHand = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.235, 0.006), new THREE.MeshBasicMaterial({ color: 0xcc2222 }));
    scSecHand.position.y = 0.082;
    scSecPivot.add(scSecHand);
    const scPin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), materials.metal);
    scPin.rotation.x = Math.PI / 2;
    scPin.position.z = 0.046;
    storeClock.add(scRim, scDial, scMinPivot, scHrPivot, scSecPivot, scPin);
    scene.add(storeClock);
    reg(storeClock, 'StoreClock');
    if (Array.isArray(world.clocks)) {
        world.clocks.push({ hourPivot: scHrPivot, minutePivot: scMinPivot, secondPivot: scSecPivot, axis: 'z', sign: -1 });
        world.setClockTime?.(world._clockBaseMins ?? 0);
    }

    // --- Long Gastronomy & Checkout Counter along North Wall (z = OZ - 4.25) ---
    builder._addStaticBox('StoreCounterMain', OX - 0.6, OY + 0.48, OZ - 4.25, 9.6, 0.96, 0.82, materials.storeWood);
    builder._addStaticBox('StoreCounterTop', OX - 0.6, OY + 0.99, OZ - 4.25, 9.68, 0.06, 0.88, materials.storeEnamel, { collide: false });
    // Glass display showcase on left half of counter (salads, cheeses, sausages, pastry)
    builder._addStaticBox('StoreCounterGlass', OX - 3.2, OY + 1.24, OZ - 4.18, 4.1, 0.46, 0.56, materials.glass, { collide: false, blocker: false });
    const showcaseBar = new THREE.Mesh(new THREE.BoxGeometry(4.14, 0.03, 0.58), materials.metal);
    showcaseBar.position.set(OX - 3.2, OY + 1.47, OZ - 4.18);
    scene.add(showcaseBar);
    reg(showcaseBar, 'StoreShowcaseBar');
    const showcaseTrays = new THREE.Group();
    showcaseTrays.position.set(OX - 3.2, OY + 1.04, OZ - 4.18);
    const trayColors = [0xb85234, 0xd9a844, 0x733a24, 0xc97b42, 0x99352d, 0xd4c272, 0x5c803b, 0xc76b48];
    for (let i = 0; i < 8; i++) {
        const tx = -1.75 + i * 0.49;
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.34), materials.storeEnamel);
        tray.position.set(tx, 0, 0);
        const food = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.075, 0.24), builder._ps1Mat({ color: trayColors[i] }));
        food.position.set(tx, 0.055, 0);
        showcaseTrays.add(tray, food);
    }
    scene.add(showcaseTrays);
    reg(showcaseTrays, 'StoreShowcaseTrays');

    // Cash Register, Soviet Scales & Mini New Year Tree on Checkout side of counter
    const cashRegister = createCashRegisterModel(materials);
    cashRegister.position.set(OX + 1.35, OY + 1.02, OZ - 4.26);
    cashRegister.rotation.y = -0.14;
    scene.add(cashRegister);
    reg(cashRegister, 'StoreCashRegister');

    const sovietScales = createSovietScalesModel(materials);
    sovietScales.position.set(OX + 0.15, OY + 1.02, OZ - 4.22);
    scene.add(sovietScales);
    reg(sovietScales, 'StoreSovietScales');

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
    reg(miniTreeGroup, 'StoreMiniTree');

    // --- Open Wooden Bakery Rack along West Wall (ХЛЕБ И ВЫПЕЧКА) ---
    const bakeryX = OX - halfW + 0.48;
    const bakeryGO = new GameObject('StoreBakeryRack');
    bakeryGO.transform.position.set(bakeryX, OY + 0.95, OZ + 0.2);
    const bkBack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 5.2), materials.storeWood);
    bkBack.position.set(-0.33, 0, 0);
    const bkPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.34, 5.2), trimMat);
    bkPlinth.position.set(0, -0.78, 0);
    const bkTop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 5.2), materials.storeWood);
    bkTop.position.set(0, 0.91, 0);
    const bkSideN = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.9, 0.06), materials.storeWood);
    bkSideN.position.set(0, 0, -2.57);
    const bkSideS = bkSideN.clone();
    bkSideS.position.z = 2.57;
    bakeryGO.transform.add(bkBack, bkPlinth, bkTop, bkSideN, bkSideS);

    for (let lvl = 0; lvl < 3; lvl++) {
        const by = -0.42 + lvl * 0.46;
        const bin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 5.04), materials.storeWood);
        bin.position.set(0.02, by, 0);
        bin.rotation.z = -0.14;
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 5.04), trimMat);
        lip.position.set(0.32, by - 0.01, 0);
        bakeryGO.transform.add(bin, lip);
        for (let b = 0; b < 9; b++) {
            const bz = -2.18 + b * 0.54;
            const isDark = (b + lvl) % 2 === 0;
            const loaf = new THREE.Mesh(
                isDark ? new THREE.BoxGeometry(0.24, 0.13, 0.20) : new THREE.CylinderGeometry(0.068, 0.068, 0.28, 7),
                isDark ? breadDarkMat : breadLightMat
            );
            if (!isDark) loaf.rotation.z = Math.PI / 2;
            loaf.position.set(0.10, by + 0.08, bz);
            bakeryGO.transform.add(loaf);
        }
    }
    bakeryGO.addComponent(BoxCollider, new THREE.Vector3(0.72, 1.9, 5.2));
    bakeryGO.addComponent(RigidBody, { bodyType: 'static' });
    engine.addGameObject(bakeryGO);
    reg(bakeryGO.transform, 'StoreBakeryRack', 'store', { gameObject: bakeryGO });

    // --- Three Double-Sided Metal Grocery Gondolas forming Shop Aisles (КОРИДОРЫ ИЗ ПОЛОК) ---
    // Labels are rotated to face directly into the aisles (side > 0 faces +X with rotY = 0; side < 0 faces -X with rotY = Math.PI),
    // and products are stocked in dense multi-row clusters (2-3 deep, tightly packed along Z)!
    const buildGroceryGondola = (name, gx, gz, lenZ, skipSpot = null, theme = 0) => {
        const g = new THREE.Group();
        g.position.set(gx, OY, gz);
        // Central steel spine, end-cap panels & base plinth
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, lenZ), trimMat);
        plinth.position.y = 0.08;
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.68, lenZ), metalFrameMat);
        spine.position.y = 0.92;
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, lenZ + 0.04), trimMat);
        topRail.position.y = 1.78;
        const endCapN = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.76, 0.04), trimMat);
        endCapN.position.set(0, 0.88, -lenZ * 0.5);
        const endCapS = endCapN.clone();
        endCapS.position.z = lenZ * 0.5;
        g.add(plinth, spine, topRail, endCapN, endCapS);

        const shelfYs = [0.26, 0.66, 1.08, 1.48];
        const shelfMats = [materials.peasLabel, materials.condensedMilk, materials.teaBox, materials.mayoLabel];
        const lidMat = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.55, roughness: 0.35 });
        const mayoLidMat = new THREE.MeshStandardMaterial({ color: 0xd9b842, roughness: 0.42 });
        const glassGreen = new THREE.MeshStandardMaterial({ color: 0x265932, roughness: 0.28 });
        const glassAmber = builder._ps1Mat({ color: 0xd9a036, roughness: 0.32 });
        const glassCola = builder._ps1Mat({ color: 0x3b1b0e, roughness: 0.25 });
        const capRed = builder._ps1Mat({ color: 0xc92a2a, roughness: 0.4 });
        const pastaBagMat = builder._ps1Mat({ color: 0xe6c86e, roughness: 0.72 });
        const sugarBagMat = builder._ps1Mat({ color: 0xf0f4f8, roughness: 0.85 });
        const buckwheatMat = builder._ps1Mat({ color: 0x6e472b, roughness: 0.85 });
        const chocBoxMat = builder._ps1Mat({ color: 0x7a1c1c, roughness: 0.55 });

        for (let lvl = 0; lvl < shelfYs.length; lvl++) {
            const sy = shelfYs[lvl];
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.036, lenZ - 0.04), materials.storeEnamel);
            plank.position.y = sy;
            g.add(plank);
            const topSurfaceY = sy + 0.018;

            for (const side of [-1, 1]) {
                // In Three.js CylinderGeometry, u=0.5 (the front center of the text label) faces local +Z,
                // so rotating by +PI/2 turns the label toward +X (right aisle) and -PI/2 turns it toward -X (left aisle).
                // In BoxGeometry(0.14, bxH, 0.095), the wide front face (0.14m) also faces local +Z/-Z,
                // so rotating by +PI/2 or -PI/2 turns the wide front label directly toward the aisle!
                const aisleFaceRotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;
                const cylAisleRotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;

                for (let t = 0; t < 6; t++) {
                    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.032), priceTagMat);
                    tag.rotation.y = aisleFaceRotY;
                    tag.position.set(side * 0.443, sy, -lenZ * 0.40 + t * (lenZ * 0.16));
                    g.add(tag);
                }

                // Stock 14 dense columns along Z and 2 rows deep in X so shelves look full & realistic!
                const cols = 14;
                for (let j = 0; j < cols; j++) {
                    const pz = -lenZ * 0.44 + (j / (cols - 1)) * (lenZ * 0.88);
                    if (skipSpot && side === skipSpot.side && lvl === skipSpot.lvl && Math.abs(pz - skipSpot.localZ) < 0.36) {
                        continue;
                    }

                    const groupType = (lvl + theme + Math.floor(j / 3)) % 5;
                    for (let depthRow = 0; depthRow < 2; depthRow++) {
                        // Outer row right near the aisle edge (0.33), inner row behind it (0.17)
                        const px = side * (0.33 - depthRow * 0.15) + ((j % 2) - 0.5) * 0.008;
                        const zJitter = (depthRow === 1 ? 0.012 : -0.006);

                        if (lvl === 0) {
                            // Bottom shelf: clusters of glass bottles (lemonade, sunflower oil, mineral water, kvass) or heavy bags of sugar/buckwheat
                            if ((j + theme) % 3 === 0) {
                                const bagH = 0.16;
                                const bMat = (j % 2 === 0) ? sugarBagMat : buckwheatMat;
                                const bag = new THREE.Mesh(new THREE.BoxGeometry(0.11, bagH, 0.15), bMat);
                                bag.position.set(px, topSurfaceY + bagH * 0.5, pz + zJitter);
                                bag.rotation.y = aisleFaceRotY;
                                g.add(bag);
                            } else {
                                const bH = 0.22;
                                const bMat = (j % 3 === 0) ? glassGreen : ((j % 3 === 1) ? glassAmber : glassCola);
                                const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.040, bH, 8), bMat);
                                bottle.position.set(px, topSurfaceY + bH * 0.5, pz + zJitter);
                                const labelBand = new THREE.Mesh(new THREE.CylinderGeometry(0.0405, 0.0405, 0.075, 8), materials.wineLabel || materials.mayoLabel);
                                labelBand.position.set(px, topSurfaceY + bH * 0.48, pz + zJitter);
                                labelBand.rotation.y = cylAisleRotY;
                                const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.024, 0.065, 7), bMat);
                                neck.position.set(px, topSurfaceY + bH + 0.032, pz + zJitter);
                                const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.014, 7), capRed);
                                cap.position.set(px, topSurfaceY + bH + 0.068, pz + zJitter);
                                g.add(bottle, labelBand, neck, cap);
                            }
                        } else if (groupType === 0 || groupType === 1 || groupType === 2) {
                            // Canned goods (Green peas, Condensed milk, Mayonnaise jars, Pickles) — stacked 2 high on some slots!
                            const cH = 0.115;
                            const canMat = groupType === 0 ? materials.peasLabel : (groupType === 1 ? materials.condensedMilk : materials.mayoLabel);
                            const isMayo = canMat === materials.mayoLabel;
                            const can = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.046, cH, 10), canMat);
                            can.position.set(px, topSurfaceY + cH * 0.5, pz + zJitter);
                            can.rotation.y = cylAisleRotY;
                            const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.010, 10), isMayo ? mayoLidMat : lidMat);
                            lid.position.set(px, topSurfaceY + cH + 0.005, pz + zJitter);
                            g.add(can, lid);

                            // Second stacked tier of cans on inner row or alternate columns
                            if ((depthRow === 1 || j % 2 === 0) && lvl < 3) {
                                const can2 = can.clone();
                                can2.position.y = topSurfaceY + cH * 1.5 + 0.010;
                                const lid2 = lid.clone();
                                lid2.position.y = topSurfaceY + cH * 2.0 + 0.015;
                                g.add(can2, lid2);
                            }
                        } else {
                            // Boxed goods (Indian Tea, Macaroni boxes, Cookies, Chocolate gift boxes) with front face turned toward the aisle
                            const bxH = 0.16 + (j % 2) * 0.025;
                            const bxMat = (j % 3 === 0) ? materials.teaBox : ((j % 3 === 1) ? pastaBagMat : chocBoxMat);
                            // BoxGeometry(width, height, depth): when rotated by aisleFaceRotY (±PI/2), local +Z/-Z faces the aisle!
                            const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, bxH, 0.095), bxMat);
                            box.position.set(px, topSurfaceY + bxH * 0.5, pz + zJitter);
                            box.rotation.y = aisleFaceRotY;
                            g.add(box);
                        }
                    }
                }
            }
        }
        const colGO = new GameObject(name);
        colGO.transform.position.set(gx, OY + 0.9, gz);
        g.position.set(0, -0.9, 0);
        colGO.transform.add(g);
        colGO.addComponent(BoxCollider, new THREE.Vector3(0.94, 1.8, lenZ + 0.04));
        colGO.addComponent(RigidBody, { bodyType: 'static' });
        engine.addGameObject(colGO);
        reg(colGO.transform, name, 'store', { gameObject: colGO });
    };

    // Three parallel Gondolas creating 4 full shopping corridors across the center of the store!
    const gondola1X = OX - 2.75;
    const gondola2X = OX - 0.15;
    const gondola3X = OX + 2.45;
    const gondolaZ = OZ + 0.35;
    buildGroceryGondola('StoreGondola_1', gondola1X, gondolaZ, 4.8, { side: 1, lvl: 2, localZ: -0.25 }, 0);
    buildGroceryGondola('StoreGondola_2', gondola2X, gondolaZ, 4.8, null, 1);
    buildGroceryGondola('StoreGondola_3', gondola3X, gondolaZ, 4.8, null, 2);

    // --- Collectible Pack 1: Olivier ingredients resting on Gondola 1 shelf (lvl 2: y = 1.08 + 0.018 = 1.098) facing the aisle ---
    const olivierPackX = gondola1X + 0.30;
    const olivierPackY = OY + 1.098;
    const olivierPackZ = gondolaZ - 0.25;
    const olivierPackGO = new GameObject('StoreOlivierPack');
    olivierPackGO.transform.position.set(olivierPackX, olivierPackY, olivierPackZ);
    const opModel = createOlivierPackModel(materials);
    for (const child of opModel.children) {
        child.rotation.y = Math.PI / 2; // Turn cylinder label u=0.5 directly toward the aisle (+X)
    }
    const opHit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.58), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false }));
    opHit.position.set(0.06, 0.09, 0);
    olivierPackGO.transform.add(opModel, opHit);
    engine.addGameObject(olivierPackGO);
    reg(olivierPackGO.transform, 'StoreOlivierPack', 'gameplay', { gameObject: olivierPackGO });

    const olivierPackHighlight = createHighlightRing(0.18);
    olivierPackHighlight.position.set(olivierPackX, olivierPackY + 0.004, olivierPackZ);
    scene.add(olivierPackHighlight);

    // --- Fruit & Vegetable Department («ОВОЩИ · ФРУКТЫ») with Open Slanted Multi-Bin Produce Racks ---
    const buildProduceStand = (name, px, pz, rotY = 0) => {
        const stand = new THREE.Group();
        stand.position.set(px, OY, pz);
        stand.rotation.y = rotY;

        // Open wooden stand structure (backboard, low base plinth, end cheeks) so both crate tiers are fully visible!
        const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.38, 3.35), materials.storeWood);
        backPanel.position.set(-0.39, 0.69, 0);
        const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.34, 3.35), trimMat);
        basePlinth.position.set(0, 0.17, 0);
        const sideCheekN = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.38, 0.05), materials.storeWood);
        sideCheekN.position.set(0, 0.69, -1.65);
        const sideCheekS = sideCheekN.clone();
        sideCheekS.position.z = 1.65;
        stand.add(backPanel, basePlinth, sideCheekN, sideCheekS);

        const potatoMat = builder._ps1Mat({ color: 0xb89660, roughness: 0.92 });
        const carrotMat = builder._ps1Mat({ color: 0xd96821, roughness: 0.82 });
        const cabbageMat = builder._ps1Mat({ color: 0x6ea856, roughness: 0.78 });
        const onionMat = builder._ps1Mat({ color: 0xc78836, roughness: 0.72 });
        const beetMat = builder._ps1Mat({ color: 0x631b2b, roughness: 0.82 });
        const appleRedMat = builder._ps1Mat({ color: 0xc22b22, roughness: 0.45 });
        const appleGreenMat = builder._ps1Mat({ color: 0x7cb83e, roughness: 0.45 });
        const lemonMat = builder._ps1Mat({ color: 0xf2c938, roughness: 0.55 });
        const tomatoMat = builder._ps1Mat({ color: 0xd13026, roughness: 0.4 });
        const cucumberMat = builder._ps1Mat({ color: 0x3b6e28, roughness: 0.72 });

        // Two tiers of 5 wooden produce crates each (10 bins total)
        const tiers = [
            { y: 0.52, xOff: 0.14, tilt: -0.18 },
            { y: 1.06, xOff: 0.04, tilt: -0.22 }
        ];
        const binTypes = [
            ['potato', 'cabbage', 'carrot', 'onion', 'beet'],
            ['tangerine', 'appleRed', 'tomato', 'cucumber', 'lemon']
        ];

        for (let t = 0; t < tiers.length; t++) {
            const tr = tiers[t];
            for (let b = 0; b < 5; b++) {
                const bz = -1.28 + b * 0.64;
                const crate = new THREE.Group();
                crate.position.set(tr.xOff, tr.y, bz);
                crate.rotation.z = tr.tilt;

                const cBot = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.03, 0.58), crateWoodMat);
                const cFront = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.58), crateWoodMat);
                cFront.position.set(0.315, 0.09, 0);
                const cBack = cFront.clone();
                cBack.position.x = -0.315;
                const cSideL = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.03), crateWoodMat);
                cSideL.position.set(0, 0.09, -0.275);
                const cSideR = cSideL.clone();
                cSideR.position.z = 0.275;
                crate.add(cBot, cFront, cBack, cSideL, cSideR);

                const pType = binTypes[t][b];
                for (let idx = 0; idx < 18; idx++) {
                    const row = Math.floor(idx / 6);
                    const col = idx % 6;
                    const layer = idx >= 12 ? 1 : 0;
                    const vx = -0.20 + (row % 2) * 0.20 + (layer * 0.06) + ((idx % 3) - 1) * 0.03;
                    const vz = -0.20 + (col % 3) * 0.19 + ((idx % 2) - 0.5) * 0.04;
                    const vy = 0.06 + layer * 0.065;

                    let vegMesh;
                    if (pType === 'potato') {
                        vegMesh = new THREE.Mesh(new THREE.SphereGeometry(0.048, 6, 5), potatoMat);
                        vegMesh.scale.set(1.25, 0.82, 0.95);
                    } else if (pType === 'cabbage') {
                        if (idx >= 8) continue;
                        vegMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.088, 0), cabbageMat);
                        vegMesh.position.set(-0.14 + (idx % 2) * 0.26, 0.09, -0.18 + Math.floor(idx / 2) * 0.12);
                        crate.add(vegMesh);
                        continue;
                    } else if (pType === 'carrot') {
                        vegMesh = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.15, 6), carrotMat);
                        vegMesh.rotation.set(0.2 * (idx % 3), idx * 0.7, Math.PI / 2);
                    } else if (pType === 'onion') {
                        vegMesh = new THREE.Mesh(new THREE.SphereGeometry(0.044, 6, 5), onionMat);
                        vegMesh.scale.set(1.0, 1.15, 1.0);
                    } else if (pType === 'beet') {
                        vegMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.046, 0), beetMat);
                    } else if (pType === 'tangerine') {
                        vegMesh = new THREE.Mesh(new THREE.SphereGeometry(0.044, 6, 5), orangeMat);
                        vegMesh.scale.set(1.05, 0.85, 1.05);
                    } else if (pType === 'appleRed') {
                        vegMesh = new THREE.Mesh(new THREE.SphereGeometry(0.046, 6, 5), idx % 3 === 0 ? appleGreenMat : appleRedMat);
                    } else if (pType === 'tomato') {
                        vegMesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), tomatoMat);
                        vegMesh.scale.set(1.05, 0.88, 1.05);
                    } else if (pType === 'cucumber') {
                        vegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.14, 6), cucumberMat);
                        vegMesh.rotation.set(Math.PI / 2, 0, (idx % 4) * 0.4);
                    } else {
                        vegMesh = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), lemonMat);
                        vegMesh.scale.set(1.25, 0.88, 0.88);
                    }
                    vegMesh.position.set(vx, vy, vz);
                    crate.add(vegMesh);
                }
                stand.add(crate);
            }
        }
        const colGO = new GameObject(name);
        colGO.transform.position.set(px, OY + 0.7, pz);
        stand.position.set(0, -0.7, 0);
        colGO.transform.add(stand);
        colGO.addComponent(BoxCollider, new THREE.Vector3(0.95, 1.4, 3.4));
        colGO.addComponent(RigidBody, { bodyType: 'static' });
        engine.addGameObject(colGO);
        reg(colGO.transform, name, 'store', { gameObject: colGO });
    };

    // Place the Vegetable & Fruit Rack along the South-West wall & an island display near the South window
    buildProduceStand('StoreProduceRack_West', OX - halfW + 0.52, OZ + 4.1, 0);

    // --- Open Multi-Deck Dairy & Meat Refrigerated Wall Display along East Wall (МОЛОКО · МЯСО) ---
    const coolerX = OX + halfW - 0.56;
    const coolerZ = OZ - 0.4;
    const coolerLen = 6.2;
    builder._addStaticBox('StoreCoolerBack', coolerX + 0.38, OY + 1.08, coolerZ, 0.16, 2.16, coolerLen, materials.storeEnamel);
    builder._addStaticBox('StoreCoolerTop', coolerX, OY + 2.10, coolerZ, 0.92, 0.14, coolerLen, materials.storeEnamel, { collide: false });
    builder._addStaticBox('StoreCoolerBase', coolerX, OY + 0.24, coolerZ, 0.92, 0.48, coolerLen, trimMat);
    builder._addStaticBox('StoreCoolerSideN', coolerX, OY + 1.08, coolerZ - coolerLen * 0.5, 0.92, 2.16, 0.10, materials.storeEnamel, { collide: false });
    builder._addStaticBox('StoreCoolerSideS', coolerX, OY + 1.08, coolerZ + coolerLen * 0.5, 0.92, 2.16, 0.10, materials.storeEnamel, { collide: false });

    const sourCreamMat = builder._ps1Mat({ color: 0xf5f7fa, roughness: 0.45 });
    const butterFoilMat = builder._ps1Mat({ color: 0xf0d060, metalness: 0.35, roughness: 0.4 });
    const kefirCapMat = builder._ps1Mat({ color: 0x2e8540, metalness: 0.4, roughness: 0.35 });

    const coolerContents = new THREE.Group();
    coolerContents.position.set(coolerX, OY, coolerZ);
    const coolerShelfYs = [0.56, 1.00, 1.46];
    for (let lvl = 0; lvl < coolerShelfYs.length; lvl++) {
        const cy = coolerShelfYs[lvl];
        const grate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.024, coolerLen - 0.16), materials.metal);
        grate.position.set(-0.04, cy, 0);
        coolerContents.add(grate);
        const shelfTop = cy + 0.012;

        // Dense 16 columns x 2 rows deep in the dairy/meat cooler, with labels turned toward -X (the aisle!)
        for (let k = 0; k < 16; k++) {
            const kz = -2.75 + (k / 15) * 5.50;
            if (lvl === 1 && Math.abs(kz - 0.15) < 0.42) continue;

            for (let row = 0; row < 2; row++) {
                const kx = -0.22 + row * 0.18;
                if (lvl === 2) {
                    if (k % 3 === 0) {
                        // Glass kefir bottles with green foil caps & sour cream cups
                        const kefir = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.19, 8), sourCreamMat);
                        kefir.position.set(kx, shelfTop + 0.095, kz);
                        const kCap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.025, 8), kefirCapMat);
                        kCap.position.set(kx, shelfTop + 0.20, kz);
                        coolerContents.add(kefir, kCap);
                    } else {
                        // Milk cartons turned so front label faces the aisle (-X)
                        const milk = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.21, 0.10), materials.milkCarton);
                        milk.position.set(kx, shelfTop + 0.105, kz);
                        milk.rotation.y = -Math.PI / 2;
                        coolerContents.add(milk);
                    }
                } else if (lvl === 1) {
                    if (k % 2 === 0) {
                        const cheeseW = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.075, 10), builder._ps1Mat({ color: 0xe3b846 }));
                        cheeseW.position.set(kx, shelfTop + 0.038, kz);
                        coolerContents.add(cheeseW);
                    } else {
                        // Butter blocks & wrapped cheese bricks
                        const butter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.12), butterFoilMat);
                        butter.position.set(kx, shelfTop + 0.025, kz);
                        const butter2 = butter.clone();
                        butter2.position.y = shelfTop + 0.076;
                        coolerContents.add(butter, butter2);
                    }
                } else {
                    // Bottom cooler deck: sausages, ham rolls & chilled poultry trays
                    if (k % 3 === 0) {
                        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.20), sourCreamMat);
                        tray.position.set(kx, shelfTop + 0.008, kz);
                        const meatCut = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.15), materials.meat);
                        meatCut.position.set(kx, shelfTop + 0.035, kz);
                        coolerContents.add(tray, meatCut);
                    } else {
                        const sausage = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.24, 8), materials.meat);
                        sausage.rotation.z = Math.PI / 2;
                        sausage.rotation.y = (row % 2) * 0.25;
                        sausage.position.set(kx, shelfTop + 0.038, kz);
                        coolerContents.add(sausage);
                    }
                }
            }
        }
    }
    scene.add(coolerContents);
    reg(coolerContents, 'StoreCoolerContents');

    // --- Collectible Pack 2: Meat, Cheese & Chilled Chicken resting on Cooler middle shelf (y = 1.00 + 0.012 = 1.012) ---
    const meatPackX = coolerX - 0.16;
    const meatPackY = OY + 1.012;
    const meatPackZ = coolerZ + 0.15;
    const meatPackGO = new GameObject('StoreMeatPack');
    meatPackGO.transform.position.set(meatPackX, meatPackY, meatPackZ);
    const mpModel = createMeatChickenPackModel(materials);
    mpModel.rotation.y = -Math.PI / 2;
    const mpHit = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.72), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false }));
    mpHit.position.set(-0.14, 0.10, 0);
    meatPackGO.transform.add(mpModel, mpHit);
    engine.addGameObject(meatPackGO);
    reg(meatPackGO.transform, 'StoreMeatPack', 'gameplay', { gameObject: meatPackGO });

    const meatPackHighlight = createHighlightRing(0.20);
    meatPackHighlight.position.set(meatPackX, meatPackY + 0.004, meatPackZ);
    scene.add(meatPackHighlight);

    // --- Wooden Crates with New Year Tangerines, Potatoes & Cabbages near entrance ---
    const entranceCrateColors = [orangeMat, orangeMat, builder._ps1Mat({ color: 0xc22b22, roughness: 0.45 })];
    for (let c = 0; c < 3; c++) {
        const cx = OX + 4.1 + c * 0.70;
        const cz = OZ + 4.45;
        const crate = builder._addStaticBox(`TangerineCrate_${c}`, cx, OY + 0.24, cz, 0.62, 0.48, 0.52, crateWoodMat);
        for (let m = 0; m < 16; m++) {
            const tang = new THREE.Mesh(new THREE.SphereGeometry(0.050, 6, 5), entranceCrateColors[c]);
            const layer = m >= 8 ? 1 : 0;
            const idx = m % 8;
            tang.position.set(
                -0.18 + (idx % 4) * 0.12 + layer * 0.03,
                0.25 + layer * 0.06,
                -0.10 + Math.floor(idx / 4) * 0.18
            );
            crate.go.transform.add(tang);
        }
    }

    // --- 4 Store NPCs: Galya at the cash register, while Nina, Viktor & Lyokha actively walk through the aisles with shopping baskets and pick groceries from shelves! ---
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
            phaseOffset: 0.2,
            hasBasket: false,
            waypoints: null
        },
        {
            id: 'nina',
            pos: new THREE.Vector3(OX - 4.10, OY, OZ - 1.20),
            yaw: Math.PI * 0.5,
            walkSpeed: 0.95,
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
            phaseOffset: 1.7,
            hasBasket: true,
            waypoints: [
                { pos: new THREE.Vector3(OX - 6.15, OY, OZ - 0.85), lookYaw: -Math.PI / 2, browseTime: 4.2 }, // Bakery rack
                { pos: new THREE.Vector3(OX - 6.15, OY, OZ + 3.55), lookYaw: -Math.PI / 2, browseTime: 4.5 }, // Vegetables & fruits
                { pos: new THREE.Vector3(OX - 3.65, OY, OZ + 1.25), lookYaw: Math.PI / 2, browseTime: 3.8 },  // Gondola 1 west side
                { pos: new THREE.Vector3(OX - 3.65, OY, OZ - 1.35), lookYaw: Math.PI / 2, browseTime: 4.0 }   // Gondola 1 north-west
            ]
        },
        {
            id: 'viktor',
            pos: new THREE.Vector3(OX + 1.15, OY, OZ - 0.80),
            yaw: -Math.PI * 0.5,
            walkSpeed: 1.15,
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
            phaseOffset: 3.1,
            hasBasket: true,
            waypoints: [
                { pos: new THREE.Vector3(OX + 1.15, OY, OZ - 0.85), lookYaw: -Math.PI / 2, browseTime: 4.0 }, // Gondola 2 east side
                { pos: new THREE.Vector3(OX + 1.50, OY, OZ + 1.45), lookYaw: Math.PI / 2, browseTime: 4.4 },  // Gondola 3 west side
                { pos: new THREE.Vector3(OX - 1.40, OY, OZ + 1.10), lookYaw: Math.PI / 2, browseTime: 3.9 },  // Gondola 2 west side
                { pos: new THREE.Vector3(OX - 2.60, OY, OZ - 3.15), lookYaw: Math.PI, browseTime: 4.2 }       // Gastronomy showcase
            ]
        },
        {
            id: 'lyokha',
            pos: new THREE.Vector3(OX + 3.85, OY, OZ + 3.65),
            yaw: -Math.PI * 0.5,
            walkSpeed: 1.25,
            heightScale: 1.0,
            buildWidth: 0.96,
            coatColor: 0x344d3c,
            collarColor: 0x233629,
            pantsColor: 0x222c3d,
            skinColor: 0xdcb79c,
            hairColor: 0x2b2018,
            hatStyle: 'beanie',
            hatColor: 0x1f242e,
            phaseOffset: 4.5,
            hasBasket: true,
            waypoints: [
                { pos: new THREE.Vector3(OX + 3.85, OY, OZ + 4.35), lookYaw: Math.PI / 2, browseTime: 4.0 },  // Tangerine crates
                { pos: new THREE.Vector3(OX + 3.45, OY, OZ + 1.25), lookYaw: -Math.PI / 2, browseTime: 4.2 }, // Gondola 3 east side
                { pos: new THREE.Vector3(OX + 5.75, OY, OZ - 1.55), lookYaw: Math.PI / 2, browseTime: 4.5 },  // Dairy & meat cooler
                { pos: new THREE.Vector3(OX + 5.75, OY, OZ + 1.35), lookYaw: Math.PI / 2, browseTime: 3.8 }   // Dairy cooler south
            ]
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
        npcGO.transform.rotation.y = 0;

        // Attach a 3D shopping basket to the NPC's left hand and a small grocery item to their right hand for shelf-picking animation!
        let basketSlots = null;
        let pickItemMesh = null;
        if (cfg.hasBasket && rig.elbowL && rig.elbowR) {
            const npcBasket = createShoppingBasketModel(materials, 0.78);
            npcBasket.position.set(-0.04, -0.36, -0.06);
            npcBasket.rotation.set(0.15, Math.PI / 2, 0);
            basketSlots = npcBasket.userData;
            if (basketSlots?.olivierSlot) basketSlots.olivierSlot.visible = true;
            rig.elbowL.add(npcBasket);

            pickItemMesh = new THREE.Mesh(
                cfg.id === 'nina'
                    ? new THREE.CylinderGeometry(0.036, 0.036, 0.095, 8)
                    : (cfg.id === 'viktor'
                        ? new THREE.BoxGeometry(0.09, 0.12, 0.06)
                        : new THREE.SphereGeometry(0.044, 6, 5)),
                cfg.id === 'nina' ? materials.peasLabel : (cfg.id === 'viktor' ? materials.teaBox : orangeMat)
            );
            pickItemMesh.position.set(0, -0.29, -0.04);
            pickItemMesh.visible = false;
            rig.elbowR.add(pickItemMesh);
        }

        const npcHitBox = new THREE.Mesh(
            new THREE.BoxGeometry(cfg.id === 'galya' ? 0.95 : 0.64, 1.82, cfg.id === 'galya' ? 1.15 : 0.64),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
        );
        npcHitBox.position.set(0, 0.92, cfg.id === 'galya' ? 0.35 : 0);
        npcGO.transform.add(npcHitBox);

        const npcCollider = npcGO.addComponent(BoxCollider, new THREE.Vector3(0.34, 1.72, 0.34), new THREE.Vector3(0, 0.86, 0));
        const npcRB = npcGO.addComponent(RigidBody, { bodyType: 'static' });
        engine.addGameObject(npcGO);
        reg(npcGO.transform, `StoreNPC_${cfg.id}`, 'gameplay', { gameObject: npcGO });

        storeNPCs.push({
            id: cfg.id,
            go: npcGO,
            rb: npcRB,
            collider: npcCollider,
            rig,
            baseYaw: cfg.yaw,
            currentYaw: cfg.yaw,
            phase: cfg.phaseOffset,
            blinkTimer: 1.8 + Math.random() * 3.0,
            isTalking: false,
            hasBasket: !!cfg.hasBasket,
            basketSlots,
            pickItemMesh,
            walkSpeed: cfg.walkSpeed || 1.05,
            waypoints: cfg.waypoints || null,
            wpIndex: 0,
            state: cfg.waypoints ? 'browsing' : 'idle',
            stateTimer: 1.5 + (cfg.phaseOffset % 2.0),
            walkCycle: cfg.phaseOffset,
            itemsCollected: 1
        });
    }

    let ironDoorOpen = false;
    let ironDoorBaseYaw = ironDoorGO.transform.rotation.y || 0;
    let ironDoorTargetAngle = ironDoorBaseYaw;
    let storeDoorOpen = false;
    let storeDoorTargetAngle = 0;
    if (ironDoorGO.transform.userData) {
        ironDoorGO.transform.userData.setBaseYaw = (y) => {
            ironDoorBaseYaw = y;
            ironDoorTargetAngle = ironDoorBaseYaw + (ironDoorOpen ? -1.45 : 0);
        };
    }

    world.store = {
        origin: STORE_ORIGIN.clone(),
        spawnPos: new THREE.Vector3(OX, OY + 0.05, OZ + halfD - 1.35),
        spawnYaw: 0,
        get streetSpawnPos() { return city.streetSpawnPos.clone(); },
        get streetSpawnYaw() { return city.streetSpawnYaw; },
        exitDoor: exitDoorGO,
        ironDoor: ironDoorGO,
        isOnPodiezdReturnStairs: city.isOnPodiezdReturnStairs,
        isStoreDoorOpen: () => storeDoorOpen,
        setStoreDoorOpen: (open) => {
            storeDoorOpen = !!open;
            storeDoorTargetAngle = storeDoorOpen ? 1.48 : 0;
            exitDoorCol.enabled = !storeDoorOpen;
        },
        isIronDoorOpen: () => ironDoorOpen,
        setIronDoorOpen: (open, instant = false) => {
            ironDoorOpen = !!open;
            ironDoorTargetAngle = ironDoorBaseYaw + (ironDoorOpen ? -1.45 : 0);
            ironDoorCol.enabled = !ironDoorOpen;
            if (instant) ironDoorGO.transform.rotation.y = ironDoorTargetAngle;
        },
        resetStreetDoors: () => {
            storeDoorOpen = false;
            storeDoorTargetAngle = 0;
            leftDoorPivot.rotation.y = 0;
            rightDoorPivot.rotation.y = 0;
            exitDoorCol.enabled = true;
            ironDoorOpen = false;
            ironDoorTargetAngle = ironDoorBaseYaw;
            ironDoorGO.transform.rotation.y = ironDoorBaseYaw;
            ironDoorCol.enabled = true;
        },
        olivierPackGO,
        olivierPackHighlight,
        meatPackGO,
        meatPackHighlight,
        npcs: storeNPCs,
        lights: storeLights,
        updateNPCs: (dt, playerPos, activeNpcId = null) => {
            // Smoothly animate the heavy rusted iron entrance door & symmetric double store doors
            const dk = Math.min(1, dt * 3.4);
            ironDoorGO.transform.rotation.y = THREE.MathUtils.lerp(ironDoorGO.transform.rotation.y, ironDoorTargetAngle, dk);
            const sdk = Math.min(1, dt * 5.2);
            leftDoorPivot.rotation.y = THREE.MathUtils.lerp(leftDoorPivot.rotation.y, -storeDoorTargetAngle, sdk);
            rightDoorPivot.rotation.y = THREE.MathUtils.lerp(rightDoorPivot.rotation.y, storeDoorTargetAngle, sdk);

            // Update city traffic cars & walking pedestrians
            city.updateCityLife(dt, playerPos);

            const now = performance.now() * 0.001;
            const k = Math.min(1, dt * 6.0);
            for (const npc of storeNPCs) {
                const p = npc.go.transform.position;
                const dist = playerPos ? Math.hypot(playerPos.x - p.x, playerPos.z - p.z) : 99;
                const talking = npc.id === activeNpcId;
                npc.isTalking = talking;
                const playerClose = dist < 1.65;

                let isMoving = false;
                let goalYaw = npc.baseYaw;

                // Autonomous shopping AI for customers (walk between shelves, pause to inspect & pick items into their basket!)
                if (npc.waypoints && !talking && !playerClose) {
                    const wp = npc.waypoints[npc.wpIndex];
                    if (npc.state === 'walking') {
                        const dx = wp.pos.x - p.x;
                        const dz = wp.pos.z - p.z;
                        const dWp = Math.hypot(dx, dz);
                        if (dWp > 0.12) {
                            isMoving = true;
                            const step = Math.min(dWp, npc.walkSpeed * dt);
                            p.x += (dx / dWp) * step;
                            p.z += (dz / dWp) * step;
                            if (npc.rb?.position) npc.rb.position.copy(p);
                            goalYaw = Math.atan2(dx, dz);
                            npc.walkCycle += dt * (npc.walkSpeed * 5.2);
                        } else {
                            p.x = wp.pos.x;
                            p.z = wp.pos.z;
                            if (npc.rb?.position) npc.rb.position.copy(p);
                            npc.state = 'browsing';
                            npc.stateTimer = wp.browseTime || 4.0;
                            npc.baseYaw = wp.lookYaw;
                        }
                    } else {
                        // Browsing shelf & picking an item into their basket
                        goalYaw = wp.lookYaw;
                        npc.stateTimer -= dt;
                        if (npc.stateTimer <= 0) {
                            npc.wpIndex = (npc.wpIndex + 1) % npc.waypoints.length;
                            npc.state = 'walking';
                            npc.itemsCollected = Math.min(2, npc.itemsCollected + 1);
                            if (npc.basketSlots?.meatSlot && npc.itemsCollected >= 2) {
                                npc.basketSlots.meatSlot.visible = true;
                            }
                        }
                    }
                } else if (playerPos && (talking || dist < 3.2)) {
                    goalYaw = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
                }

                let diff = goalYaw - npc.currentYaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                npc.currentYaw += diff * k;
                npc.rig.root.rotation.y = Math.PI + npc.currentYaw;

                // Smooth radial depenetration so the player and walking NPCs never get stuck inside each other
                if (playerPos && dist < 0.58 && dist > 0.0001) {
                    const pushDirX = (playerPos.x - p.x) / dist;
                    const pushDirZ = (playerPos.z - p.z) / dist;
                    playerPos.x = p.x + pushDirX * 0.59;
                    playerPos.z = p.z + pushDirZ * 0.59;
                    const playerRB = engine?.player?.getComponent?.(RigidBody);
                    if (playerRB?.position) {
                        playerRB.position.x = playerPos.x;
                        playerRB.position.z = playerPos.z;
                    }
                }

                const breath = Math.sin(now * 1.9 + npc.phase);
                const sway = Math.sin(now * 0.85 + npc.phase);
                const r = npc.rig;

                if (isMoving) {
                    // Realistic walking gait with leg swing, knee bend, torso bob, and left arm holding basket
                    const wSin = Math.sin(npc.walkCycle);
                    const wCos = Math.cos(npc.walkCycle);
                    r.pelvis.position.y = 0.78 + Math.abs(wSin) * 0.024;
                    r.torsoPivot.rotation.x = -0.05 + Math.abs(wCos) * 0.02;
                    r.torsoPivot.rotation.z = wSin * 0.025;
                    r.headPivot.rotation.x = 0.02;
                    r.headPivot.rotation.y = wSin * 0.05;

                    r.legL.rotation.x = wSin * 0.52;
                    r.kneeL.rotation.x = -Math.max(0, -wSin) * 0.68 - 0.06;
                    r.legR.rotation.x = -wSin * 0.52;
                    r.kneeR.rotation.x = -Math.max(0, wSin) * 0.68 - 0.06;

                    // Left arm carries shopping basket steadily, right arm swings naturally
                    r.shoulderL.rotation.x = THREE.MathUtils.lerp(r.shoulderL.rotation.x, npc.hasBasket ? 0.34 - wSin * 0.08 : -wSin * 0.36, k);
                    r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, npc.hasBasket ? 0.68 : 0.25, k);
                    r.shoulderR.rotation.x = THREE.MathUtils.lerp(r.shoulderR.rotation.x, wSin * 0.38, k);
                    r.elbowR.rotation.x = THREE.MathUtils.lerp(r.elbowR.rotation.x, 0.26 + Math.max(0, wSin) * 0.22, k);
                    if (npc.pickItemMesh) npc.pickItemMesh.visible = false;
                } else {
                    r.pelvis.position.y = 0.78 + breath * 0.008;
                    r.torsoPivot.rotation.x = -0.02 + breath * 0.015;
                    r.torsoPivot.rotation.z = sway * 0.018;
                    r.headPivot.rotation.x = talking ? -0.04 + Math.sin(now * 4.2 + npc.phase) * 0.045 : breath * 0.03;
                    r.headPivot.rotation.y = talking ? Math.sin(now * 2.1 + npc.phase) * 0.08 : sway * 0.14;

                    r.legL.rotation.x = THREE.MathUtils.lerp(r.legL.rotation.x, 0.03 + Math.max(0, sway) * 0.04, k);
                    r.kneeL.rotation.x = THREE.MathUtils.lerp(r.kneeL.rotation.x, -0.06 - Math.max(0, sway) * 0.08, k);
                    r.legR.rotation.x = THREE.MathUtils.lerp(r.legR.rotation.x, 0.03 + Math.max(0, -sway) * 0.04, k);
                    r.kneeR.rotation.x = THREE.MathUtils.lerp(r.kneeR.rotation.x, -0.06 - Math.max(0, -sway) * 0.08, k);

                    if (talking) {
                        const g = Math.sin(now * 4.6 + npc.phase);
                        r.shoulderL.rotation.x = THREE.MathUtils.lerp(r.shoulderL.rotation.x, npc.hasBasket ? 0.36 : 0.38 + g * 0.12, k);
                        r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, npc.hasBasket ? 0.72 : 0.95 + g * 0.22, k);
                        r.shoulderR.rotation.x = THREE.MathUtils.lerp(r.shoulderR.rotation.x, 0.44 - g * 0.16, k);
                        r.elbowR.rotation.x = THREE.MathUtils.lerp(r.elbowR.rotation.x, 1.05 - g * 0.24, k);
                        if (npc.pickItemMesh) npc.pickItemMesh.visible = false;
                    } else if (npc.hasBasket && npc.waypoints && !playerClose) {
                        // Shelf-picking animation during the middle of browseTimer:
                        // Phase A (stateTimer 2.8..1.8): reach right hand forward toward shelf
                        // Phase B (stateTimer 1.8..0.9): bring picked product down into the left-hand shopping basket!
                        const bt = npc.stateTimer;
                        let targetShR = 0.12 - breath * 0.03;
                        let targetElR = 0.28 - breath * 0.04;
                        let targetShRY = 0;
                        let showPicked = false;

                        if (bt < 2.8 && bt > 1.7) {
                            // Reaching out to shelf
                            const reachU = Math.sin(((2.8 - bt) / 1.1) * Math.PI);
                            targetShR = THREE.MathUtils.lerp(0.15, 1.15, reachU);
                            targetElR = THREE.MathUtils.lerp(0.28, 0.45, reachU);
                            showPicked = bt < 2.25;
                        } else if (bt <= 1.7 && bt > 0.75) {
                            // Bringing item from shelf over to the left-hand basket
                            const dropU = Math.sin(((1.7 - bt) / 0.95) * Math.PI);
                            targetShR = THREE.MathUtils.lerp(0.45, 0.62, dropU);
                            targetElR = THREE.MathUtils.lerp(0.55, 1.12, dropU);
                            targetShRY = THREE.MathUtils.lerp(0, 0.42, dropU);
                            showPicked = bt > 1.05;
                        }

                        r.shoulderL.rotation.x = THREE.MathUtils.lerp(r.shoulderL.rotation.x, 0.36 + breath * 0.02, k);
                        r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, 0.74 + breath * 0.02, k);
                        r.shoulderR.rotation.x = THREE.MathUtils.lerp(r.shoulderR.rotation.x, targetShR, k);
                        r.shoulderR.rotation.y = THREE.MathUtils.lerp(r.shoulderR.rotation.y || 0, targetShRY, k);
                        r.elbowR.rotation.x = THREE.MathUtils.lerp(r.elbowR.rotation.x, targetElR, k);
                        if (npc.pickItemMesh) npc.pickItemMesh.visible = showPicked;
                    } else {
                        r.shoulderL.rotation.x = THREE.MathUtils.lerp(r.shoulderL.rotation.x, npc.hasBasket ? 0.34 : 0.08 + breath * 0.03, k);
                        r.elbowL.rotation.x = THREE.MathUtils.lerp(r.elbowL.rotation.x, npc.hasBasket ? 0.68 : 0.28 + breath * 0.04, k);
                        r.shoulderR.rotation.x = THREE.MathUtils.lerp(r.shoulderR.rotation.x, 0.08 - breath * 0.03, k);
                        r.elbowR.rotation.x = THREE.MathUtils.lerp(r.elbowR.rotation.x, 0.28 - breath * 0.04, k);
                        if (npc.pickItemMesh) npc.pickItemMesh.visible = false;
                    }
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
