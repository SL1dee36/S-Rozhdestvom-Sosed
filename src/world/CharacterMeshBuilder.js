import * as THREE from 'three';
import { TextureManager } from './TextureManager.js';

let _sharedCharTextures = null;
export function getSharedCharacterTextures() {
    if (!_sharedCharTextures && typeof document !== 'undefined') {
        const tm = new TextureManager();
        _sharedCharTextures = {
            skin: tm.createSkinTexture(),
            hair: tm.createHairTexture(),
            cloth: tm.createClothTexture()
        };
    }
    return _sharedCharTextures;
}

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
        gender = null,
        matFactory = null
    } = options;

    const isFemale = gender === 'female' || hatStyle === 'bun' || hatStyle === 'kerchief';

    const tex = getSharedCharacterTextures();

    const makeMat = (color, roughness = 0.88, metalness = 0.04, map = null) => {
        const cfg = { color, roughness, metalness };
        if (map) cfg.map = map;
        if (typeof matFactory === 'function') {
            return matFactory(cfg);
        }
        return new THREE.MeshStandardMaterial(cfg);
    };

    const topMat = makeMat(coatColor ?? sweaterColor, 0.88, 0.04, tex?.cloth);
    const collarMat = makeMat(collarColor, 0.90, 0.04, tex?.cloth);
    const pantsMat = makeMat(pantsColor, 0.92, 0.04, tex?.cloth);
    const shoeMat = makeMat(shoeColor, 0.85, 0.06, tex?.cloth);
    const skinMat = makeMat(skinColor, 0.76, 0.03, tex?.skin);
    const hairMat = makeMat(hairColor, 0.90, 0.03, tex?.hair);
    const eyeWhiteMat = makeMat(0xe8e4dc, 0.55, 0.02);
    const pupilMat = makeMat(0x161920, 0.35, 0.05);
    const lipMat = makeMat(isFemale ? 0xc26368 : 0xb07c6a, 0.72, 0.04, tex?.skin);

    const root = new THREE.Group();
    root.scale.set(buildWidth, heightScale, buildWidth);

    const pelvis = new THREE.Group();
    pelvis.position.set(0, 0.78, 0);
    const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.37 : 0.35, 0.14, isFemale ? 0.22 : 0.21), pantsMat);
    pelvis.add(hipMesh);

    if (coatColor !== null) {
        const coatHem = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.41 : 0.38, isFemale ? 0.30 : 0.24, isFemale ? 0.26 : 0.24), topMat);
        coatHem.position.y = isFemale ? -0.08 : -0.05;
        pelvis.add(coatHem);
    } else if (isFemale) {
        // Subtle skirt flare for indoor female NPCs (e.g. Galya)
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.225, 0.34, 8), pantsMat);
        skirt.scale.set(1.05, 1.0, 0.72);
        skirt.position.set(0, -0.14, 0);
        pelvis.add(skirt);
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
    const torsoLower = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.29 : 0.35, 0.26, isFemale ? 0.19 : 0.21), topMat);
    torsoLower.position.set(0, 0.13, 0);
    const torsoChest = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.34 : 0.39, 0.34, isFemale ? 0.21 : 0.23), topMat);
    torsoChest.position.set(0, 0.42, 0);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.10, 0.065, 8), collarMat);
    collar.position.set(0, 0.60, 0);
    torsoPivot.add(torsoLower, torsoChest, collar);

    if (isFemale) {
        const bustMat = apronColor !== null ? makeMat(apronColor, 0.88, 0.04, tex?.cloth) : topMat;
        for (const side of [-1, 1]) {
            const bust = new THREE.Mesh(new THREE.SphereGeometry(0.082, 8, 6), bustMat);
            bust.scale.set(1.06, 0.92, 0.88);
            bust.position.set(side * 0.082, 0.43, -0.108);
            torsoPivot.add(bust);
        }
    }

    if (apronColor !== null) {
        const apronMat = makeMat(apronColor, 0.88, 0.04, tex?.cloth);
        const apronFront = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.33 : 0.36, 0.56, 0.03), apronMat);
        apronFront.position.set(0, 0.24, isFemale ? -0.115 : -0.125);
        torsoPivot.add(apronFront);
    }

    if (scarfColor !== null) {
        const scarfMat = makeMat(scarfColor, 0.94, 0.03, tex?.cloth);
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

    const browH = isFemale ? 0.008 : 0.012;
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.046, browH, 0.016), hairMat);
    browL.position.set(-0.048, isFemale ? 0.171 : 0.168, -0.105);
    if (isFemale) browL.rotation.z = 0.08;
    const browR = new THREE.Mesh(new THREE.BoxGeometry(0.046, browH, 0.016), hairMat);
    browR.position.set(0.048, isFemale ? 0.171 : 0.168, -0.105);
    if (isFemale) browR.rotation.z = -0.08;
    const eyeWhiteL = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.022, 0.014), eyeWhiteMat);
    eyeWhiteL.position.set(-0.048, 0.145, -0.104);
    const eyeWhiteR = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.022, 0.014), eyeWhiteMat);
    eyeWhiteR.position.set(0.048, 0.145, -0.104);
    if (isFemale) {
        const lashL = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.005, 0.017), pupilMat);
        lashL.position.set(-0.048, 0.157, -0.106);
        const lashR = lashL.clone();
        lashR.position.x = 0.048;
        headPivot.add(lashL, lashR);
    }
    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.016), pupilMat);
    pupilL.position.set(-0.048, 0.145, -0.106);
    const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.016), pupilMat);
    pupilR.position.set(0.048, 0.145, -0.106);
    const eyelidL = new THREE.Group();
    eyelidL.position.set(-0.048, 0.158, -0.109);
    const eyelidMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.028, 0.020), skinMat);
    eyelidMeshL.position.y = -0.014;
    eyelidL.add(eyelidMeshL);
    eyelidL.scale.y = 0.04;

    const eyelidR = new THREE.Group();
    eyelidR.position.set(0.048, 0.158, -0.109);
    const eyelidMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.028, 0.020), skinMat);
    eyelidMeshR.position.y = -0.014;
    eyelidR.add(eyelidMeshR);
    eyelidR.scale.y = 0.04;

    headPivot.add(
        neck, head, nose, earL, earR, mouth,
        browL, browR, eyeWhiteL, eyeWhiteR, pupilL, pupilR, eyelidL, eyelidR
    );

    const hatMat = makeMat(hatColor, 0.92, 0.04, tex?.cloth);
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
            const bun = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 6), hairMat);
            bun.position.set(0, 0.18, 0.138);
            const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.195, 0.042, 0.032), hairMat);
            bangs.position.set(0, 0.212, -0.098);
            const lockL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.18, 0.075), hairMat);
            lockL.position.set(-0.105, 0.12, -0.045);
            const lockR = lockL.clone();
            lockR.position.x = 0.105;
            headPivot.add(bun, bangs, lockL, lockR);
        } else if (isFemale) {
            // Shoulder-length feminine hair
            const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.195, 0.044, 0.032), hairMat);
            bangs.position.set(0, 0.212, -0.098);
            const longBack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.075), hairMat);
            longBack.position.set(0, 0.06, 0.088);
            const lockL = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.26, 0.085), hairMat);
            lockL.position.set(-0.106, 0.08, -0.035);
            const lockR = lockL.clone();
            lockR.position.x = 0.106;
            headPivot.add(bangs, longBack, lockL, lockR);
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
        // Visible hair bangs & side strands peeking out under the kerchief
        const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.036, 0.028), hairMat);
        bangs.position.set(0, 0.198, -0.102);
        const strandL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.12, 0.045), hairMat);
        strandL.position.set(-0.096, 0.135, -0.072);
        const strandR = strandL.clone();
        strandR.position.x = 0.096;
        headPivot.add(top, back, sideL, sideR, bangs, strandL, strandR);
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
        eyelidR,
        mouth
    };
}
