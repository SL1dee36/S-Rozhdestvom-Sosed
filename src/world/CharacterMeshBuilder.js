import * as THREE from 'three';

/**
 * Builds an articulated NPC human matching the original classic blocky PS1 style
 * of the player's mirror avatar (BoxGeometry limbs/torso/head with articulated
 * shoulders, elbows, hips, knees, and eyelids).
 */
export function buildArticulatedHuman(options = {}) {
    const {
        sweaterColor = 0x3b4d5e,
        collarColor = 0x2c3a47,
        pantsColor = 0x22262e,
        shoeColor = 0x1a1715,
        skinColor = 0xd8b094,
        hairColor = 0x2b1e16,
        coatColor = null,
        scarfColor = null,
        apronColor = null,
        hatStyle = 'none', // 'none' | 'beanie' | 'ushanka' | 'kerchief' | 'bun'
        hatColor = 0x3a2e28,
        heightScale = 1.0,
        buildWidth = 1.0,
        matFactory = null
    } = options;

    const makeMat = (color, roughness = 0.88, metalness = 0.04) => {
        if (typeof matFactory === 'function') {
            return matFactory({ color, roughness, metalness });
        }
        return new THREE.MeshStandardMaterial({ color, roughness, metalness });
    };

    const topMat = makeMat(coatColor ?? sweaterColor, 0.88);
    const collarMat = makeMat(collarColor, 0.90);
    const pantsMat = makeMat(pantsColor, 0.92);
    const shoeMat = makeMat(shoeColor, 0.85);
    const skinMat = makeMat(skinColor, 0.76);
    const hairMat = makeMat(hairColor, 0.90);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf0eee9 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x181c22 });
    const lipMat = makeMat(0xb07c6a, 0.80);

    const root = new THREE.Group();
    root.scale.set(buildWidth, heightScale, buildWidth);

    const pelvis = new THREE.Group();
    pelvis.position.set(0, 0.78, 0);
    const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.21), pantsMat);
    pelvis.add(hipMesh);

    if (coatColor !== null) {
        const coatHem = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.24), topMat);
        coatHem.position.y = -0.05;
        pelvis.add(coatHem);
    }

    const buildLeg = (sideX) => {
        const legPivot = new THREE.Group();
        legPivot.position.set(sideX * 0.10, -0.03, 0);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.38, 0.155), pantsMat);
        thigh.position.set(0, -0.19, 0);
        const kneePivot = new THREE.Group();
        kneePivot.position.set(0, -0.38, 0);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.35, 0.135), pantsMat);
        shin.position.set(0, -0.175, 0);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.068, 0.23), shoeMat);
        shoe.position.set(0, -0.345, -0.04);
        kneePivot.add(shin, shoe);
        legPivot.add(thigh, kneePivot);
        pelvis.add(legPivot);
        return { legPivot, kneePivot };
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);

    const torsoPivot = new THREE.Group();
    torsoPivot.position.set(0, 0.04, 0);
    const torsoLower = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.26, 0.21), topMat);
    torsoLower.position.set(0, 0.13, 0);
    const torsoChest = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.34, 0.23), topMat);
    torsoChest.position.set(0, 0.42, 0);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.105, 0.065, 8), collarMat);
    collar.position.set(0, 0.60, 0);
    torsoPivot.add(torsoLower, torsoChest, collar);

    if (apronColor !== null) {
        const apronMat = makeMat(apronColor, 0.88);
        const apronFront = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.03), apronMat);
        apronFront.position.set(0, 0.24, -0.125);
        torsoPivot.add(apronFront);
    }

    if (scarfColor !== null) {
        const scarfMat = makeMat(scarfColor, 0.94);
        const scarfWrap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), scarfMat);
        scarfWrap.position.set(0, 0.59, 0);
        const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.22, 0.035), scarfMat);
        scarfTail.position.set(0.06, 0.46, -0.125);
        torsoPivot.add(scarfWrap, scarfTail);
    }

    const buildArm = (sideX) => {
        const shoulderPivot = new THREE.Group();
        shoulderPivot.position.set(sideX * 0.235, 0.54, 0);
        const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.064, 7, 6), topMat);
        const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.27, 0.115), topMat);
        upperArm.position.set(0, -0.135, 0);
        const elbowPivot = new THREE.Group();
        elbowPivot.position.set(0, -0.26, 0);
        const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.23, 0.10), topMat);
        forearm.position.set(0, -0.115, 0);
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.036, 0.105), collarMat);
        cuff.position.set(0, -0.22, 0);
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.095, 0.042), skinMat);
        palm.position.set(0, -0.28, 0);
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.045, 0.026), skinMat);
        thumb.position.set(-sideX * 0.042, -0.265, -0.015);
        thumb.rotation.z = sideX * 0.35;
        elbowPivot.add(forearm, cuff, palm, thumb);
        shoulderPivot.add(shoulderCap, upperArm, elbowPivot);
        torsoPivot.add(shoulderPivot);
        return { shoulderPivot, elbowPivot };
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.63, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.064, 0.09, 8), skinMat);
    neck.position.y = 0.01;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.23, 0.21), skinMat);
    head.position.y = 0.13;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.052, 0.034), skinMat);
    nose.position.set(0, 0.125, -0.112);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.055, 0.038), skinMat);
    earL.position.set(-0.106, 0.13, -0.005);
    const earR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.055, 0.038), skinMat);
    earR.position.set(0.106, 0.13, -0.005);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.014, 0.014), lipMat);
    mouth.position.set(0, 0.068, -0.104);

    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.016), hairMat);
    browL.position.set(-0.048, 0.168, -0.105);
    const browR = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.016), hairMat);
    browR.position.set(0.048, 0.168, -0.105);
    const eyeWhiteL = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.022, 0.014), eyeWhiteMat);
    eyeWhiteL.position.set(-0.048, 0.145, -0.104);
    const eyeWhiteR = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.022, 0.014), eyeWhiteMat);
    eyeWhiteR.position.set(0.048, 0.145, -0.104);
    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.016), pupilMat);
    pupilL.position.set(-0.048, 0.145, -0.106);
    const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.016), pupilMat);
    pupilR.position.set(0.048, 0.145, -0.106);
    const eyelidL = new THREE.Group();
    eyelidL.position.set(-0.048, 0.158, -0.107);
    const eyelidMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.026, 0.018), skinMat);
    eyelidMeshL.position.y = -0.013;
    eyelidL.add(eyelidMeshL);
    eyelidL.scale.y = 0.04;

    const eyelidR = new THREE.Group();
    eyelidR.position.set(0.048, 0.158, -0.107);
    const eyelidMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.026, 0.018), skinMat);
    eyelidMeshR.position.y = -0.013;
    eyelidR.add(eyelidMeshR);
    eyelidR.scale.y = 0.04;

    headPivot.add(
        neck, head, nose, earL, earR, mouth,
        browL, browR, eyeWhiteL, eyeWhiteR, pupilL, pupilR, eyelidL, eyelidR
    );

    const hatMat = makeMat(hatColor, 0.92);
    if (hatStyle === 'none' || hatStyle === 'bun') {
        const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.216, 0.075, 0.226), hairMat);
        hairTop.position.set(0, 0.225, 0.004);
        const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.214, 0.17, 0.065), hairMat);
        hairBack.position.set(0, 0.145, 0.086);
        const hairSideL = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.11, 0.15), hairMat);
        hairSideL.position.set(-0.102, 0.17, 0.02);
        const hairSideR = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.11, 0.15), hairMat);
        hairSideR.position.set(0.102, 0.17, 0.02);
        headPivot.add(hairTop, hairBack, hairSideL, hairSideR);
        if (hatStyle === 'bun') {
            const bun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.085, 0.085), hairMat);
            bun.position.set(0, 0.17, 0.135);
            headPivot.add(bun);
        }
    } else if (hatStyle === 'beanie') {
        const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.222, 0.115, 0.232), hatMat);
        beanie.position.set(0, 0.235, 0.004);
        headPivot.add(beanie);
    } else if (hatStyle === 'ushanka') {
        const hat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.24), hatMat);
        hat.position.set(0, 0.24, 0.004);
        const flapL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.11), hatMat);
        flapL.position.set(-0.12, 0.14, 0.01);
        const flapR = flapL.clone();
        flapR.position.x = 0.12;
        headPivot.add(hat, flapL, flapR);
    } else if (hatStyle === 'kerchief') {
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.228, 0.095, 0.238), hatMat);
        top.position.set(0, 0.225, 0.006);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.228, 0.22, 0.09), hatMat);
        back.position.set(0, 0.12, 0.082);
        const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.19, 0.17), hatMat);
        sideL.position.set(-0.11, 0.13, 0.01);
        const sideR = sideL.clone();
        sideR.position.x = 0.11;
        headPivot.add(top, back, sideL, sideR);
    }

    torsoPivot.add(headPivot);
    pelvis.add(torsoPivot);
    root.add(pelvis);

    return {
        root,
        pelvis,
        torsoPivot,
        headPivot,
        legL: legL.legPivot,
        kneeL: legL.kneePivot,
        legR: legR.legPivot,
        kneeR: legR.kneePivot,
        shoulderL: armL.shoulderPivot,
        elbowL: armL.elbowPivot,
        shoulderR: armR.shoulderPivot,
        elbowR: armR.elbowPivot,
        eyelidL,
        eyelidR
    };
}
