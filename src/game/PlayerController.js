import * as THREE from 'three';
import { Component, RigidBody, BoxCollider } from '../../lumina/index.js';
import { createGroceryBagModel, createRawChickenTrayModel, createShoppingBasketModel } from '../world/StoreAndCookingBuilder.js';

const TWO_HANDED_ITEMS = new Set(['table', 'stool', 'decorBox', 'tablecloth', 'rawChicken', 'dirtyBoard']);

export class PlayerController extends Component {
    constructor(gameObject, world) {
        super(gameObject);
        this.world = world;
        this.yaw = 0;
        this.pitch = 0;
        this.baseSensitivity = 0.0022;
        this.sensitivity = this.baseSensitivity;

        // Movement speeds reduced by 50%
        this.walkSpeed = 1.50;
        this.sprintSpeed = 2.25;
        this.crouchSpeed = 0.88;

        this.isCrouching = false;
        this.eyeHeight = 1.54;
        this.targetEyeHeight = 1.54;

        this.heldItem = null;
        this.isHidden = false;
        this.isPeeking = false;
        this.currentHidingSpot = null;
        this.isPeephole = false;
        this.controlsLocked = false;
        this.allowLookWhileLocked = false;
        this.lookYawCenter = null;
        this.lookYawLimit = 1.15;
        this.lookPitchMin = -0.65;
        this.lookPitchMax = 0.65;
        this.forcedLookTarget = null;
        this.forcedLookSpeed = 5.0;
        this.forcedFov = null;
        this.cigaretteActive = false;
        this.cigBurn = 0;
        this.cigPuffAnim = 0;
        this.cinematicBobOffset = 0;
        this.cinematicRollOffset = 0;
        this.cameraTiltEnabled = true;
        this._dynamicTiltRoll = 0;

        this._bobTime = 0;
        this._stepTimer = 0;
        this._cameraRig = new THREE.Object3D();
        this._handAnchor = new THREE.Object3D();
        this._handMeshes = {};
        this._fpOnlyArms = [];
        this._handYaw = 0;
        this._handPitch = 0;
        this._swayX = 0;
        this._swayY = 0;
        this._cigSmokePuffs = [];
        this._cigSmokeGroup = null;
        this._cigPaperMesh = null;
        this._cigAshMesh = null;
        this._cigEmberTip = null;
        this._cigWorldTip = new THREE.Vector3();
        this._exitSafePos = new THREE.Vector3();
        this._targetEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this._washAnim = null;
        this._washHandsGroup = null;
        this._washLeftHand = null;
        this._washRightHand = null;
        this._washDroplets = [];

        this._treeDecorAnim = null;
        this._treeDecorHandsGroup = null;
        this._treeDecorLeftHand = null;
        this._treeDecorRightHand = null;

        this._cookAnim = null;
        this._cookHandsGroup = null;
        this._cookLeftHand = null;
        this._cookRightHand = null;

        this._spongeWashAnim = null;
        this._spongeHandsGroup = null;
        this._spongeLeftHand = null;
        this._spongeRightHand = null;
        this._soapBubbles = [];

        this._smokeIntroAnim = null;
        this._smokeIntroGroup = null;
        this._smokeLeftHand = null;
        this._smokeRightHand = null;
        this._cigPackGroup = null;
        this._cigPackLid = null;
        this._cigPackStick = null;
        this._lighterGroup = null;
        this._lighterFlame = null;
        this._mouthCig = null;
    }

    start() {
        this.rb = this.gameObject.getComponent(RigidBody);
        this.collider = this.gameObject.getComponent(BoxCollider);
        this.camera = this.engine.renderer.camera;

        this.gameObject.transform.add(this._cameraRig);
        this._cameraRig.position.set(0, this.eyeHeight, 0);
        this._cameraRig.add(this.camera);
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.order = 'YXZ';

        // Attach hand anchor to _cameraRig instead of camera so pitch doesn't lift heavy items above head
        this._handAnchor.rotation.order = 'YXZ';
        this._cameraRig.add(this._handAnchor);
        this._buildHandProps();
    }

    _makeSleeveArm(isLeft = false) {
        const armGroup = new THREE.Group();
        const mats = this.world?.materials || {};
        const clothMap = mats.cloth?.map || null;
        const skinMap = mats.skin?.map || null;
        const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x3b4d5e, map: clothMap, roughness: 0.88 });
        const cuffMat = new THREE.MeshStandardMaterial({ color: 0x2c3a47, map: clothMap, roughness: 0.9 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8b094, map: skinMap, roughness: 0.78 });

        const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.28), sleeveMat);
        forearm.position.set(0, 0, 0.14);
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.04), cuffMat);
        cuff.position.set(0, 0, 0.01);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.082, 0.085), skinMat);
        hand.position.set(0, 0.005, -0.04);
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.028, 0.045), skinMat);
        thumb.position.set(isLeft ? 0.036 : -0.036, 0.028, -0.035);
        armGroup.add(forearm, cuff, hand, thumb);
        this._fpOnlyArms.push(armGroup);
        return armGroup;
    }

    setMirrorRenderMode(isMirrorPass) {
        if (this._mirrorBodyGroup) {
            this._mirrorBodyGroup.visible = !!isMirrorPass;
        }
        if (this._fpOnlyArms) {
            for (const arm of this._fpOnlyArms) {
                arm.visible = !isMirrorPass;
            }
        }
    }

    _attachOneHand(propGroup, offsetX = 0.04, offsetY = -0.05, offsetZ = 0.06) {
        const arm = this._makeSleeveArm(false);
        arm.position.set(offsetX, offsetY, offsetZ);
        arm.rotation.set(0.12, -0.15, 0);
        propGroup.add(arm);
    }

    _attachTwoHands(propGroup, spanX = 0.24, handY = -0.06, handZ = 0.08) {
        const leftArm = this._makeSleeveArm(true);
        leftArm.position.set(-spanX, handY, handZ);
        leftArm.rotation.set(0.08, 0.18, 0.08);
        const rightArm = this._makeSleeveArm(false);
        rightArm.position.set(spanX, handY, handZ);
        rightArm.rotation.set(0.08, -0.18, -0.08);
        propGroup.add(leftArm, rightArm);
    }

    _buildHandProps() {
        const make = (key, mesh) => {
            mesh.visible = false;
            this._handAnchor.add(mesh);
            this._handMeshes[key] = mesh;
        };
        const mats = this.world?.materials || {};
        const builder = this.world?.builder;

        // 1. Crystal glasses (stemmed crystal goblet)
        const crystalGroup = new THREE.Group();
        const crystalModel = builder?.createCrystalGobletModel
            ? builder.createCrystalGobletModel(1.1, true)
            : new THREE.Mesh(
                new THREE.CylinderGeometry(0.042, 0.03, 0.13, 8),
                mats.crystal || new THREE.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.78 })
            );
        crystalModel.position.y = -0.05;
        crystalGroup.add(crystalModel);
        this._attachOneHand(crystalGroup, 0.02, -0.04, 0.05);
        crystalGroup.position.set(0.24, -0.24, -0.44);
        make('crystal', crystalGroup);

        // 2. Pickles in 3D glass jar with cucumbers inside
        const picklesGroup = new THREE.Group();
        const picklesModel = builder?.createPicklesJarModel
            ? builder.createPicklesJarModel(0.95)
            : new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.18, 10), mats.pickles);
        picklesGroup.add(picklesModel);
        this._attachOneHand(picklesGroup, 0.04, -0.05, 0.06);
        picklesGroup.position.set(0.25, -0.25, -0.45);
        make('pickles', picklesGroup);

        // 3. Olivier salad bowl
        const olivierGroup = new THREE.Group();
        const olivierModel = builder?.createOlivierBowlModel
            ? builder.createOlivierBowlModel(0.9)
            : new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.095, 0.085, 10), mats.olivier);
        olivierGroup.add(olivierModel);
        this._attachOneHand(olivierGroup, 0.05, -0.05, 0.08);
        olivierGroup.position.set(0.24, -0.25, -0.46);
        make('olivier', olivierGroup);

        // 4. Meat & cheese platter
        const meatGroup = new THREE.Group();
        const meatModel = builder?.createMeatPlatterModel
            ? builder.createMeatPlatterModel(0.9)
            : new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.02, 10), mats.meat);
        meatGroup.add(meatModel);
        this._attachOneHand(meatGroup, 0.06, -0.04, 0.08);
        meatGroup.position.set(0.24, -0.25, -0.46);
        make('meat', meatGroup);

        // 5. Roasted 3D chicken on baking tray
        const chickenGroup = new THREE.Group();
        const chickenModel = builder?.createRoastedChickenModel
            ? builder.createRoastedChickenModel(0.85)
            : new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.095, 0.15), mats.chicken);
        chickenGroup.add(chickenModel);
        this._attachTwoHands(chickenGroup, 0.15, -0.05, 0.08);
        chickenGroup.position.set(0.0, -0.26, -0.48);
        make('chicken', chickenGroup);

        // 6. Wine / Champagne bottle (detailed translucent glass bottle with liquid & label)
        const champGroup = new THREE.Group();
        const champModel = builder?.createWineBottleModel
            ? builder.createWineBottleModel(0.95)
            : new THREE.Mesh(
                new THREE.CylinderGeometry(0.044, 0.048, 0.19, 10),
                mats.champagne || new THREE.MeshStandardMaterial({ color: 0x1d4d27 })
            );
        champGroup.add(champModel);
        this._attachOneHand(champGroup, 0.03, -0.04, 0.05);
        champGroup.position.set(0.25, -0.25, -0.45);
        make('champagne', champGroup);

        // 7. Two-handed Folding Table (clean 4-legged center frame + folded drop-leaf wings)
        const tableCarryGroup = new THREE.Group();
        const woodMat = mats.woodDark || new THREE.MeshStandardMaterial({ color: 0x4a2614 });
        const legFrameMat = mats.woodFrame || woodMat;
        const tTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.026, 0.56), woodMat);
        tTop.position.y = 0.24;
        const tFlapL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.42, 0.56), woodMat);
        tFlapL.position.set(-0.122, 0.03, 0);
        const tFlapR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.42, 0.56), woodMat);
        tFlapR.position.set(0.122, 0.03, 0);
        tableCarryGroup.add(tTop, tFlapL, tFlapR);
        for (const [lx, lz] of [[-0.085, -0.24], [0.085, -0.24], [-0.085, 0.24], [0.085, 0.24]]) {
            const cLeg = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.48, 0.028), legFrameMat);
            cLeg.position.set(lx, 0.0, lz);
            tableCarryGroup.add(cLeg);
        }
        tableCarryGroup.rotation.y = Math.PI / 2;
        const tableWrapper = new THREE.Group();
        tableWrapper.add(tableCarryGroup);
        this._attachTwoHands(tableWrapper, 0.28, 0.02, 0.14);
        tableWrapper.position.set(0.0, -0.36, -0.56);
        make('table', tableWrapper);

        // 7b. Two-handed Folded Festive Tablecloth from Wardrobe
        const clothCarryGroup = new THREE.Group();
        const clothModel = builder?.createFoldedTableclothModel
            ? builder.createFoldedTableclothModel(1.05)
            : new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.22), mats.tablecloth || woodMat);
        clothModel.position.y = -0.02;
        clothCarryGroup.add(clothModel);
        this._attachTwoHands(clothCarryGroup, 0.16, -0.03, 0.09);
        clothCarryGroup.position.set(0.0, -0.26, -0.46);
        make('tablecloth', clothCarryGroup);

        // 8. Two-handed Kitchen Stool
        const stoolCarryGroup = new THREE.Group();
        const stoolModel = builder?.createStoolModel
            ? builder.createStoolModel(0.78)
            : new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), woodMat);
        stoolModel.position.y = -0.18;
        stoolModel.rotation.x = 0.22;
        stoolCarryGroup.add(stoolModel);
        this._attachTwoHands(stoolCarryGroup, 0.18, -0.02, 0.12);
        stoolCarryGroup.position.set(0.0, -0.25, -0.50);
        make('stool', stoolCarryGroup);

        // 9. Two-handed Hollow Cardboard Decor Box with individual removable decorations
        const boxCarryGroup = new THREE.Group();
        const boxMat = mats.cardboardBox || mats.woodFrame || new THREE.MeshStandardMaterial({ color: 0x8f6b47 });
        const innerMat = new THREE.MeshStandardMaterial({ color: 0x5c422a, roughness: 0.95 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xf7d046, emissive: 0x805a10, emissiveIntensity: 0.4 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xc92222, emissive: 0x550808, emissiveIntensity: 0.4 });
        const blueMat = new THREE.MeshStandardMaterial({ color: 0x4aa8ff, emissive: 0x164478, emissiveIntensity: 0.35 });
        const greenMat = new THREE.MeshStandardMaterial({ color: 0x1e5c2c, roughness: 0.85 });
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xf0f6ff, emissive: 0x7a90a8, emissiveIntensity: 0.3 });

        const bw = 0.36, bh = 0.22, bd = 0.30, bt = 0.014;
        const bBottom = new THREE.Mesh(new THREE.BoxGeometry(bw, bt, bd), innerMat);
        bBottom.position.y = -bh * 0.5 + bt * 0.5;
        const bFront = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bt), boxMat);
        bFront.position.set(0, 0, -bd * 0.5 + bt * 0.5);
        const bBack = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bt), boxMat);
        bBack.position.set(0, 0, bd * 0.5 - bt * 0.5);
        const bLeft = new THREE.Mesh(new THREE.BoxGeometry(bt, bh, bd - bt * 2), boxMat);
        bLeft.position.set(-bw * 0.5 + bt * 0.5, 0, 0);
        const bRight = new THREE.Mesh(new THREE.BoxGeometry(bt, bh, bd - bt * 2), boxMat);
        bRight.position.set(bw * 0.5 - bt * 0.5, 0, 0);
        // Slightly opened cardboard flaps
        const flapL = new THREE.Mesh(new THREE.BoxGeometry(0.10, bt * 0.8, bd - 0.01), boxMat);
        flapL.position.set(-bw * 0.5 - 0.032, bh * 0.5 + 0.018, 0);
        flapL.rotation.z = -0.45;
        const flapR = new THREE.Mesh(new THREE.BoxGeometry(0.10, bt * 0.8, bd - 0.01), boxMat);
        flapR.position.set(bw * 0.5 + 0.032, bh * 0.5 + 0.018, 0);
        flapR.rotation.z = 0.45;
        boxCarryGroup.add(bBottom, bFront, bBack, bLeft, bRight, flapL, flapR);

        // 4 removable decoration groups inside the hollow box (empties as player decorates!)
        const partTree = new THREE.Group();
        const tBall1 = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 5), redMat);
        tBall1.position.set(-0.08, -0.02, -0.06);
        const tBall2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), blueMat);
        tBall2.position.set(-0.01, -0.01, -0.07);
        const tStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), goldMat);
        tStar.position.set(-0.05, 0.04, -0.04);
        partTree.add(tBall1, tBall2, tStar);

        const partHall = new THREE.Group();
        const hTinsel = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 12), goldMat);
        hTinsel.rotation.x = Math.PI / 2;
        hTinsel.position.set(0.05, 0.02, -0.03);
        const hFlake = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.07), snowMat);
        hFlake.position.set(0.07, 0.055, -0.02);
        partHall.add(hTinsel, hFlake);

        const partKitchen = new THREE.Group();
        const kTinsel = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.020, 6, 12), redMat);
        kTinsel.rotation.x = Math.PI / 2;
        kTinsel.position.set(-0.06, 0.015, 0.05);
        const kFlake = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.008, 0.065), snowMat);
        kFlake.position.set(-0.07, 0.048, 0.06);
        partKitchen.add(kTinsel, kFlake);

        const partHallway = new THREE.Group();
        const wWreath = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.022, 6, 10), greenMat);
        wWreath.rotation.x = Math.PI / 2 - 0.25;
        wWreath.position.set(0.06, 0.01, 0.05);
        const wBow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.03), redMat);
        wBow.position.set(0.06, 0.04, 0.08);
        partHallway.add(wWreath, wBow);

        boxCarryGroup.add(partTree, partHall, partKitchen, partHallway);
        this._decorBoxParts = { tree: partTree, hall: partHall, kitchen: partKitchen, hallway: partHallway };

        this._attachTwoHands(boxCarryGroup, 0.20, -0.03, 0.10);
        boxCarryGroup.position.set(0.0, -0.27, -0.48);
        make('decorBox', boxCarryGroup);

        // 10. Cigarette (no dynamic PointLight inside to avoid shader recompilation freeze)
        const cigGroup = new THREE.Group();
        const filterMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0085, 0.0085, 0.028, 10),
            new THREE.MeshStandardMaterial({ color: 0xd49b54, roughness: 0.85 })
        );
        filterMesh.position.y = -0.014;

        const paperMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.062, 10),
            new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.9 })
        );
        paperMesh.position.y = 0.031;
        this._cigPaperMesh = paperMesh;

        const ashMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0076, 0.0081, 0.009, 10),
            new THREE.MeshStandardMaterial({ color: 0x5c5c63, roughness: 0.98 })
        );
        ashMesh.position.y = 0.0665;
        this._cigAshMesh = ashMesh;

        const emberMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.0076, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xff4400,
                emissive: 0xff3300,
                emissiveIntensity: 1.8,
                roughness: 0.3
            })
        );
        emberMesh.position.y = 0.072;
        this._cigEmberTip = emberMesh;

        cigGroup.add(filterMesh, paperMesh, ashMesh, emberMesh);
        cigGroup.rotation.set(-1.18, 0.14, 0.22);
        cigGroup.position.set(0.17, -0.17, -0.41);
        make('cigarette', cigGroup);

        cigGroup.updateMatrix();
        const tipAnchor = new THREE.Vector3(0, 0.074, 0).applyMatrix4(cigGroup.matrix);
        const smokeGroup = new THREE.Group();
        smokeGroup.position.copy(tipAnchor);
        smokeGroup.visible = false;
        this._handAnchor.add(smokeGroup);
        this._cigSmokeGroup = smokeGroup;

        const puffGeo = new THREE.SphereGeometry(0.0085, 6, 6);
        for (let i = 0; i < 10; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0xd6dce4,
                transparent: true,
                opacity: 0.34,
                depthWrite: false
            });
            const puff = new THREE.Mesh(puffGeo, mat);
            const phase = i / 10;
            puff.userData = {
                phase,
                driftX: (Math.random() - 0.5) * 0.035,
                driftZ: (Math.random() - 0.5) * 0.03,
                wobble: Math.random() * Math.PI * 2
            };
            smokeGroup.add(puff);
            this._cigSmokePuffs.push(puff);
        }

        // 11. First-person face-washing hands & water droplets rig (attached to camera)
        const washGroup = new THREE.Group();
        washGroup.visible = false;
        const wLeft = this._makeSleeveArm(true);
        const wRight = this._makeSleeveArm(false);
        washGroup.add(wLeft, wRight);
        const dropGeo = new THREE.SphereGeometry(0.009, 6, 5);
        const dropMat = new THREE.MeshBasicMaterial({
            color: 0xa8dcff,
            transparent: true,
            opacity: 0.82,
            depthWrite: false
        });
        this._washDroplets = [];
        for (let i = 0; i < 12; i++) {
            const drop = new THREE.Mesh(dropGeo, dropMat.clone());
            drop.visible = false;
            drop.userData = {
                side: i < 6 ? -1 : 1,
                vx: (i < 6 ? -1 : 1) * (0.18 + (i % 3) * 0.09) + (Math.random() - 0.5) * 0.08,
                vy: 0.08 + (i % 4) * 0.05,
                vz: -0.35 - (i % 3) * 0.12
            };
            washGroup.add(drop);
            this._washDroplets.push(drop);
        }
        this.camera.add(washGroup);
        this._washHandsGroup = washGroup;
        this._washLeftHand = wLeft;
        this._washRightHand = wRight;

        // 12. First-person Christmas tree decorating hands rig (attached to camera)
        const treeHandsGroup = new THREE.Group();
        treeHandsGroup.visible = false;
        const tLeft = this._makeSleeveArm(true);
        const tBaubleL = new THREE.Mesh(
            new THREE.SphereGeometry(0.036, 7, 6),
            new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.25, metalness: 0.45 })
        );
        tBaubleL.position.set(0.0, 0.02, -0.09);
        tLeft.add(tBaubleL);

        const tRight = this._makeSleeveArm(false);
        const tBaubleR = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.04, 0),
            new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.25, metalness: 0.55 })
        );
        tBaubleR.position.set(0.0, 0.02, -0.09);
        tRight.add(tBaubleR);

        treeHandsGroup.add(tLeft, tRight);
        this.camera.add(treeHandsGroup);
        this._treeDecorHandsGroup = treeHandsGroup;
        this._treeDecorLeftHand = tLeft;
        this._treeDecorRightHand = tRight;

        // 12b. First-person right hand rig for opening/closing the front door peephole shutter
        const peepHand = this._makeSleeveArm(false);
        peepHand.visible = false;
        this.camera.add(peepHand);
        this._peepholeHand = peepHand;
        this._peepholeAnim = null;

        // 12c. Grocery Bag held prop (from the store, with detailed textured model)
        const bagGroup = new THREE.Group();
        const bagModel = createGroceryBagModel(mats, 0.92);
        bagModel.position.y = -0.18;
        bagGroup.add(bagModel);
        this._attachOneHand(bagGroup, 0.02, 0.04, 0.05);
        bagGroup.position.set(0.24, -0.27, -0.45);
        make('groceryBag', bagGroup);

        // 12d. Raw seasoned chicken on tray (two-handed before putting into oven)
        const rawChickenGroup = new THREE.Group();
        const rawChickenModel = createRawChickenTrayModel(mats, 0.85);
        rawChickenModel.position.y = -0.04;
        rawChickenGroup.add(rawChickenModel);
        this._attachTwoHands(rawChickenGroup, 0.15, -0.04, 0.08);
        rawChickenGroup.position.set(0.0, -0.26, -0.48);
        make('rawChicken', rawChickenGroup);

        // 12d2. Dirty cutting board & knife carried to the kitchen sink to wash
        const dirtyBoardGroup = new THREE.Group();
        const dBoard = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.018, 0.20),
            mats.cuttingBoard || new THREE.MeshStandardMaterial({ color: 0xc49b6c })
        );
        const dBlade = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.005, 0.026),
            mats.metal || new THREE.MeshStandardMaterial({ color: 0x8a9299 })
        );
        dBlade.position.set(0.04, 0.014, 0.02);
        dBlade.rotation.y = 0.25;
        const dHandle = new THREE.Mesh(
            new THREE.BoxGeometry(0.085, 0.016, 0.020),
            mats.woodDark || new THREE.MeshStandardMaterial({ color: 0x472514 })
        );
        dHandle.position.set(-0.065, 0.016, 0.045);
        dHandle.rotation.y = 0.25;
        dirtyBoardGroup.add(dBoard, dBlade, dHandle);
        this._attachTwoHands(dirtyBoardGroup, 0.15, -0.03, 0.08);
        dirtyBoardGroup.position.set(0.0, -0.25, -0.46);
        make('dirtyBoard', dirtyBoardGroup);

        // 12d3. Kitchen Sponge held in right hand (taken from wardrobe)
        const spongeGroup = new THREE.Group();
        const spYellow = new THREE.Mesh(
            new THREE.BoxGeometry(0.095, 0.028, 0.064),
            new THREE.MeshStandardMaterial({ color: 0xe8c43a, roughness: 0.92 })
        );
        const spGreen = new THREE.Mesh(
            new THREE.BoxGeometry(0.095, 0.009, 0.064),
            new THREE.MeshStandardMaterial({ color: 0x2a6b34, roughness: 0.95 })
        );
        spGreen.position.y = 0.0185;
        spongeGroup.add(spYellow, spGreen);
        this._attachOneHand(spongeGroup, 0.02, -0.02, 0.05);
        spongeGroup.position.set(0.22, -0.22, -0.42);
        make('sponge', spongeGroup);

        // 12d4. Store Shopping Basket held in right hand (populates with Olivier & Meat packs as picked up in store!)
        const shoppingBasketGroup = new THREE.Group();
        const basketModel = createShoppingBasketModel(mats, 0.94);
        basketModel.position.y = -0.11;
        shoppingBasketGroup.add(basketModel);
        this._attachOneHand(shoppingBasketGroup, 0.02, 0.03, 0.06);
        shoppingBasketGroup.position.set(0.24, -0.25, -0.45);
        this._shoppingBasketSlots = basketModel.userData;
        make('shoppingBasket', shoppingBasketGroup);

        // Keep legacy keys mapped to the basket for compatibility
        this._handMeshes.olivierPack = shoppingBasketGroup;
        this._handMeshes.meatPack = shoppingBasketGroup;

        // 12f. Interactive Sponge Washing Rig (attached to camera, player scrubs with mouse!)
        const spongeHandsGroup = new THREE.Group();
        spongeHandsGroup.visible = false;
        const sLeft = this._makeSleeveArm(true);
        const sBoard = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.016, 0.17),
            mats.cuttingBoard || new THREE.MeshStandardMaterial({ color: 0xc49b6c })
        );
        sBoard.position.set(0.08, 0.01, -0.10);
        sBoard.rotation.set(0.32, 0.15, 0);
        sLeft.add(sBoard);

        const sRight = this._makeSleeveArm(false);
        const sSpongeY = new THREE.Mesh(
            new THREE.BoxGeometry(0.085, 0.026, 0.056),
            new THREE.MeshStandardMaterial({ color: 0xe8c43a, roughness: 0.92 })
        );
        sSpongeY.position.set(0, -0.005, -0.085);
        const sSpongeG = new THREE.Mesh(
            new THREE.BoxGeometry(0.085, 0.008, 0.056),
            new THREE.MeshStandardMaterial({ color: 0x2a6b34, roughness: 0.95 })
        );
        sSpongeG.position.set(0, 0.012, -0.085);
        sRight.add(sSpongeY, sSpongeG);

        // Soap foam bubbles around the scrubbing area
        const bubGeo = new THREE.SphereGeometry(0.012, 6, 5);
        const bubMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        this._soapBubbles = [];
        for (let i = 0; i < 12; i++) {
            const b = new THREE.Mesh(bubGeo, bubMat.clone());
            b.visible = false;
            b.userData = {
                ox: (Math.random() - 0.5) * 0.18,
                oy: (Math.random() - 0.5) * 0.10,
                phase: Math.random() * Math.PI * 2
            };
            spongeHandsGroup.add(b);
            this._soapBubbles.push(b);
        }
        spongeHandsGroup.add(sLeft, sRight);
        this.camera.add(spongeHandsGroup);
        this._spongeHandsGroup = spongeHandsGroup;
        this._spongeLeftHand = sLeft;
        this._spongeRightHand = sRight;

        // 12g. Balcony Cigarette Lighting Rig (pack, lid, lighter with 3D flame, mouth cigarette)
        const smokeIntroGroup = new THREE.Group();
        smokeIntroGroup.visible = false;
        const smLeft = this._makeSleeveArm(true);
        const smRight = this._makeSleeveArm(false);

        // Classic red-and-white cigarette pack with flip-top lid
        const packGroup = new THREE.Group();
        const packRed = new THREE.MeshStandardMaterial({ color: 0xb82424, roughness: 0.72 });
        const packWhite = new THREE.MeshStandardMaterial({ color: 0xebe6d8, roughness: 0.78 });
        const packGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.45 });
        const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.068, 0.024), packWhite);
        const packStripe = new THREE.Mesh(new THREE.BoxGeometry(0.057, 0.022, 0.025), packRed);
        packStripe.position.y = -0.015;
        const packLidPivot = new THREE.Group();
        packLidPivot.position.set(0, 0.034, 0.012);
        const packLid = new THREE.Mesh(new THREE.BoxGeometry(0.057, 0.024, 0.025), packRed);
        packLid.position.set(0, 0.012, -0.012);
        packLidPivot.add(packLid);
        const packCigStick = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.065, 6), new THREE.MeshStandardMaterial({ color: 0xd49b54 }));
        packCigStick.position.set(0.012, 0.042, 0);
        packGroup.add(packBody, packStripe, packLidPivot, packCigStick);
        packGroup.position.set(0.02, 0.02, -0.085);
        smLeft.add(packGroup);

        // Pocket lighter with flip wheel & animated 3D flame attached to right hand
        const lighterGroup = new THREE.Group();
        lighterGroup.visible = false;
        const lBody = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.068, 0.014), new THREE.MeshStandardMaterial({ color: 0x24528a, roughness: 0.4 }));
        const lCap = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 0.014), packGold);
        lCap.position.y = 0.042;
        const lFlame = new THREE.Mesh(
            new THREE.ConeGeometry(0.011, 0.036, 7),
            new THREE.MeshBasicMaterial({ color: 0xffa824, transparent: true, opacity: 0.92 })
        );
        lFlame.position.y = 0.068;
        lFlame.visible = false;
        lighterGroup.add(lBody, lCap, lFlame);
        lighterGroup.position.set(-0.01, 0.02, -0.085);
        smRight.add(lighterGroup);

        // Cigarette held in mouth while lighting
        const mouthCig = new THREE.Group();
        mouthCig.visible = false;
        const mcPaper = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.068, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4ee }));
        mcPaper.rotation.x = Math.PI / 2;
        mcPaper.position.z = -0.034;
        const mcTip = new THREE.Mesh(
            new THREE.SphereGeometry(0.0062, 7, 6),
            new THREE.MeshStandardMaterial({ color: 0x2b2b2e, emissive: 0xff3b00, emissiveIntensity: 0.0 })
        );
        mcTip.position.z = -0.069;
        mouthCig.add(mcPaper, mcTip);
        mouthCig.position.set(0.015, -0.055, -0.14);
        mouthCig.userData.tipMat = mcTip.material;

        smokeIntroGroup.add(smLeft, smRight, mouthCig);
        this.camera.add(smokeIntroGroup);
        this._smokeIntroGroup = smokeIntroGroup;
        this._smokeLeftHand = smLeft;
        this._smokeRightHand = smRight;
        this._cigPackGroup = packGroup;
        this._cigPackLid = packLidPivot;
        this._cigPackStick = packCigStick;
        this._lighterGroup = lighterGroup;
        this._lighterFlame = lFlame;
        this._mouthCig = mouthCig;

        // 12e. First-person cooking / chopping hands rig (attached to camera)
        const cookHandsGroup = new THREE.Group();
        cookHandsGroup.visible = false;
        const cLeft = this._makeSleeveArm(true);
        const cRight = this._makeSleeveArm(false);
        const knifeHandle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.014, 0.016, 0.105, 8),
            new THREE.MeshStandardMaterial({ color: 0x3d2415, roughness: 0.8 })
        );
        knifeHandle.rotation.x = Math.PI / 2;
        knifeHandle.position.set(0, 0.008, -0.055);
        const knifeBolster = new THREE.Mesh(
            new THREE.BoxGeometry(0.018, 0.036, 0.014),
            new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.7, roughness: 0.3 })
        );
        knifeBolster.position.set(0, 0.006, -0.112);
        const knifeBlade = new THREE.Mesh(
            new THREE.BoxGeometry(0.005, 0.042, 0.165),
            new THREE.MeshStandardMaterial({ color: 0xe6edf5, emissive: 0x1a2028, metalness: 0.72, roughness: 0.22 })
        );
        knifeBlade.position.set(0, 0.002, -0.198);
        cRight.add(knifeHandle, knifeBolster, knifeBlade);
        cookHandsGroup.add(cLeft, cRight);
        this.camera.add(cookHandsGroup);
        this._cookHandsGroup = cookHandsGroup;
        this._cookLeftHand = cLeft;
        this._cookRightHand = cRight;

        // 13. Full Articulated 3D Player Reflection Avatar (visible in real-time planar mirrors)
        const mirrorBody = new THREE.Group();
        mirrorBody.visible = false;
        const clothMap = mats.cloth?.map || null;
        const skinMap = mats.skin?.map || null;
        const hairMap = mats.hair?.map || null;
        const sweaterMat = new THREE.MeshStandardMaterial({ color: 0x3b4d5e, map: clothMap, roughness: 0.88 });
        const collarMat = new THREE.MeshStandardMaterial({ color: 0x2c3a47, map: clothMap, roughness: 0.9 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22262e, map: clothMap, roughness: 0.92 });
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1715, map: clothMap, roughness: 0.85 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8b094, map: skinMap, roughness: 0.76 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b1e16, map: hairMap, roughness: 0.9 });
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf0eee9 });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x181c22 });
        const lipMat = new THREE.MeshStandardMaterial({ color: 0xb07c6a, map: skinMap, roughness: 0.8 });

        const pelvisGroup = new THREE.Group();
        pelvisGroup.position.set(0, 0.78, 0);
        const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.21), pantsMat);
        pelvisGroup.add(hipMesh);

        const buildMirrorLeg = (sideX) => {
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
            pelvisGroup.add(legPivot);
            return { legPivot, kneePivot };
        };
        const mLegL = buildMirrorLeg(-1);
        const mLegR = buildMirrorLeg(1);

        const torsoPivot = new THREE.Group();
        torsoPivot.position.set(0, 0.04, 0);
        const torsoLower = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.26, 0.21), sweaterMat);
        torsoLower.position.set(0, 0.13, 0);
        const torsoChest = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.34, 0.23), sweaterMat);
        torsoChest.position.set(0, 0.42, 0);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.105, 0.065, 8), collarMat);
        collar.position.set(0, 0.60, 0);
        torsoPivot.add(torsoLower, torsoChest, collar);

        const buildMirrorArm = (sideX) => {
            const shoulderPivot = new THREE.Group();
            shoulderPivot.position.set(sideX * 0.235, 0.54, 0);
            const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.064, 7, 6), sweaterMat);
            const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.27, 0.115), sweaterMat);
            upperArm.position.set(0, -0.135, 0);
            const elbowPivot = new THREE.Group();
            elbowPivot.position.set(0, -0.26, 0);
            const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.23, 0.10), sweaterMat);
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
        const mArmL = buildMirrorArm(-1);
        const mArmR = buildMirrorArm(1);

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
        const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.216, 0.075, 0.226), hairMat);
        hairTop.position.set(0, 0.225, 0.004);
        const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.214, 0.17, 0.065), hairMat);
        hairBack.position.set(0, 0.145, 0.086);
        const hairSideL = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.11, 0.15), hairMat);
        hairSideL.position.set(-0.102, 0.17, 0.02);
        const hairSideR = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.11, 0.15), hairMat);
        hairSideR.position.set(0.102, 0.17, 0.02);
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
        // 3D eyelids anchored at the TOP edge of each eye so they close downward naturally
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
            hairTop, hairBack, hairSideL, hairSideR,
            browL, browR, eyeWhiteL, eyeWhiteR, pupilL, pupilR, eyelidL, eyelidR
        );
        torsoPivot.add(headPivot);
        pelvisGroup.add(torsoPivot);
        mirrorBody.add(pelvisGroup);
        this.transform.add(mirrorBody);

        this._mirrorBodyGroup = mirrorBody;
        this._mirrorPelvis = pelvisGroup;
        this._mirrorTorsoPivot = torsoPivot;
        this._mirrorHeadPivot = headPivot;
        this._mirrorLegL = mLegL.legPivot;
        this._mirrorKneeL = mLegL.kneePivot;
        this._mirrorLegR = mLegR.legPivot;
        this._mirrorKneeR = mLegR.kneePivot;
        this._mirrorShoulderL = mArmL.shoulderPivot;
        this._mirrorElbowL = mArmL.elbowPivot;
        this._mirrorShoulderR = mArmR.shoulderPivot;
        this._mirrorElbowR = mArmR.elbowPivot;
        this._mirrorEyelidL = eyelidL;
        this._mirrorEyelidR = eyelidR;
        this._mirrorBodyYaw = this.yaw;
        this._mirrorWalkPhase = 0;
        this._mirrorMoveBlend = 0;
        this._mirrorEyeClose = 0;
    }

    startWashFaceAnimation(onComplete, onEyesOpen = null) {
        if (this._washAnim) return;
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        this._handAnchor.visible = false;
        if (this._washHandsGroup) {
            this._washHandsGroup.visible = true;
            // Start hands from a low resting pose so they smoothly rise into Phase 1
            this._washLeftHand.position.set(-0.14, -0.44, -0.36);
            this._washRightHand.position.set(0.14, -0.44, -0.36);
            this._washLeftHand.rotation.set(-0.10, 0.15, 0.20);
            this._washRightHand.rotation.set(-0.10, -0.15, -0.20);
        }
        for (const d of this._washDroplets) d.visible = false;
        this._washAnim = {
            timer: 0,
            duration: 3.45,
            startPitch: this.pitch,
            splashSoundPlayed: false,
            eyesOpenedTriggered: false,
            flick1Played: false,
            flick2Played: false,
            mirrorPose: {
                torsoLean: 0,
                shRotX: 0,
                shRotY: 0,
                shRotZ: 0,
                elbRotX: 0,
                eyeClose: 0
            },
            onComplete,
            onEyesOpen
        };
    }

    _updateWashFaceAnimation(deltaTime) {
        if (!this._washAnim) return;
        const anim = this._washAnim;
        anim.timer += deltaTime;
        const t = anim.timer;
        const L = this._washLeftHand;
        const R = this._washRightHand;
        const damp = Math.min(1, 1 - Math.exp(-deltaTime * 15));

        let goalLX = -0.14, goalLY = -0.44, goalLZ = -0.36;
        let goalRX = 0.14, goalRY = -0.44, goalRZ = -0.36;
        let goalRotX = -0.10, goalRotY = 0.18, goalRotZ = 0.22;
        let goalPitch = anim.startPitch;
        let eyeClose = 0;
        // Mirror reflection arm/torso target pose during face washing
        let mTorsoLean = 0;
        let mShRotX = 0, mShRotY = 0, mShRotZ = 0, mElbRotX = 0;

        // Phase 1 (0.0 .. 0.90s): Lean down toward sink & scoop water with both hands
        if (t < 0.90) {
            const u = t / 0.90;
            const e = u * u * (3 - 2 * u);
            goalPitch = THREE.MathUtils.lerp(anim.startPitch, -0.44, e);
            const scoopCycle = Math.sin(u * Math.PI * 2) * 0.028 * e;
            goalLX = THREE.MathUtils.lerp(-0.14, -0.075, e);
            goalRX = THREE.MathUtils.lerp(0.14, 0.075, e);
            goalLY = THREE.MathUtils.lerp(-0.44, -0.25, e) + scoopCycle;
            goalRY = goalLY;
            goalLZ = THREE.MathUtils.lerp(-0.36, -0.42, e);
            goalRZ = goalLZ;
            goalRotX = THREE.MathUtils.lerp(-0.10, -0.22, e);
            goalRotY = THREE.MathUtils.lerp(0.15, 0.26, e);
            goalRotZ = THREE.MathUtils.lerp(0.20, 0.34, e);

            mTorsoLean = 0.32 * e;
            mShRotX = 0.85 * e;
            mShRotY = 0.28 * e;
            mShRotZ = 0.12 * e;
            mElbRotX = 0.95 * e + scoopCycle * 3.5;
        }
        // Phase 2 (0.90 .. 2.30s): Smoothly bring cupped hands from sink up to face & wash eyes -> eyelids close
        else if (t < 2.30) {
            const u = (t - 0.90) / 1.40;
            if (!anim.splashSoundPlayed && u > 0.14) {
                anim.splashSoundPlayed = true;
                this.engine.audioSystem.playSpatialOneShot('steam_hiss', this.transform.position, { volume: 0.45 });
            }
            // Smooth bell-shaped envelope (0 -> 1 -> 0) for hand approach and eye closing
            let approach = 0;
            if (u < 0.28) {
                const k = u / 0.28;
                approach = k * k * (3 - 2 * k);
            } else if (u < 0.76) {
                approach = 1.0;
            } else {
                const k = (u - 0.76) / 0.24;
                const s = k * k * (3 - 2 * k);
                approach = 1.0 - s;
            }
            eyeClose = approach;

            const liftProgress = Math.min(1, u / 0.32);
            const liftEase = liftProgress * liftProgress * (3 - 2 * liftProgress);
            goalPitch = THREE.MathUtils.lerp(-0.44, -0.18, liftEase);

            const rubY = Math.sin(u * Math.PI * 4.0) * 0.025 * approach;
            const rubX = Math.cos(u * Math.PI * 4.0) * 0.016 * approach;
            // Start from Phase 1 end pose (-0.075, -0.25, -0.42), glide to face (-0.065, -0.03, -0.17), then toward Phase 3 start (-0.12, -0.12, -0.34)
            const baseX = u < 0.5 ? -0.075 : THREE.MathUtils.lerp(-0.075, -0.12, (u - 0.5) / 0.5);
            const baseY = u < 0.5 ? -0.25 : THREE.MathUtils.lerp(-0.25, -0.12, (u - 0.5) / 0.5);
            const baseZ = u < 0.5 ? -0.42 : THREE.MathUtils.lerp(-0.42, -0.34, (u - 0.5) / 0.5);

            goalLX = THREE.MathUtils.lerp(baseX, -0.066, approach) + rubX;
            goalRX = THREE.MathUtils.lerp(-baseX, 0.066, approach) - rubX;
            goalLY = THREE.MathUtils.lerp(baseY, -0.032, approach) + rubY;
            goalRY = THREE.MathUtils.lerp(baseY, -0.032, approach) + rubY;
            goalLZ = THREE.MathUtils.lerp(baseZ, -0.168, approach);
            goalRZ = goalLZ;
            goalRotX = THREE.MathUtils.lerp(u < 0.5 ? -0.22 : 0.12, 0.54, approach);
            goalRotY = THREE.MathUtils.lerp(0.26, 0.32, approach);
            goalRotZ = THREE.MathUtils.lerp(u < 0.5 ? 0.34 : 0.16, 0.25, approach);

            mTorsoLean = THREE.MathUtils.lerp(0.32, 0.18, liftEase);
            mShRotX = THREE.MathUtils.lerp(0.85, 1.38, approach) + rubY * 2.5;
            mShRotY = THREE.MathUtils.lerp(0.28, 0.42, approach) - rubX * 2.0;
            mShRotZ = THREE.MathUtils.lerp(0.12, 0.08, approach);
            mElbRotX = THREE.MathUtils.lerp(0.95, 1.68, approach);
        }
        // Phase 3 (2.30 .. 3.45s): Eyes open & hands smoothly flick downward/outward twice to shake off water droplets
        else {
            const u = Math.min(1.0, (t - 2.30) / 1.15);
            const uEase = u * u * (3 - 2 * u);
            eyeClose = 0;
            goalPitch = THREE.MathUtils.lerp(-0.18, -0.05, uEase);
            if (!anim.eyesOpenedTriggered) {
                anim.eyesOpenedTriggered = true;
                if (anim.onEyesOpen) anim.onEyesOpen();
            }

            const flickPhase = (u * 2.0) % 1.0;
            const isSecondFlick = u >= 0.5;
            if (!anim.flick1Played && u > 0.06) {
                anim.flick1Played = true;
                this.engine.audioSystem.playSpatialOneShot('pickup', this.transform.position, { volume: 0.35 });
            }
            if (!anim.flick2Played && u > 0.54) {
                anim.flick2Played = true;
                this.engine.audioSystem.playSpatialOneShot('pickup', this.transform.position, { volume: 0.32 });
            }

            // Smooth sine-shaped flick pulse so velocity is continuous at 0 and 1
            const snap = Math.sin(flickPhase * Math.PI);
            const lowerOut = u > 0.78 ? Math.pow((u - 0.78) / 0.22, 2) * 0.28 : 0;

            goalLX = -0.12 - snap * 0.085;
            goalRX = 0.12 + snap * 0.085;
            goalLY = -0.12 - snap * 0.12 - lowerOut;
            goalRY = -0.12 - snap * 0.12 - lowerOut;
            goalLZ = -0.34 - snap * 0.05;
            goalRZ = -0.34 - snap * 0.05;
            goalRotX = 0.12 - snap * 0.78;
            goalRotY = 0.26 + snap * 0.32;
            goalRotZ = 0.16 - snap * 0.42;

            const returnFade = 1.0 - (u > 0.72 ? (u - 0.72) / 0.28 : 0);
            mTorsoLean = THREE.MathUtils.lerp(0.18, 0.0, uEase);
            mShRotX = (0.95 - snap * 0.42) * returnFade;
            mShRotY = (0.22 - snap * 0.28) * returnFade;
            mShRotZ = (0.14 + snap * 0.22) * returnFade;
            mElbRotX = (1.10 - snap * 0.65) * returnFade;

            const dropT = flickPhase;
            for (let i = 0; i < this._washDroplets.length; i++) {
                const d = this._washDroplets[i];
                const belongSecond = i >= 6;
                if (belongSecond !== isSecondFlick && dropT > 0.4) {
                    d.visible = false;
                    continue;
                }
                d.visible = dropT > 0.08 && dropT < 0.92;
                const originX = d.userData.side * 0.13;
                const originY = -0.12;
                const originZ = -0.33;
                d.position.set(
                    originX + d.userData.vx * dropT,
                    originY + d.userData.vy * dropT - 0.65 * dropT * dropT,
                    originZ + d.userData.vz * dropT
                );
                d.material.opacity = Math.max(0, 0.85 * (1.0 - dropT));
            }
        }

        // Smoothly interpolate first-person hands & camera pitch so there are never sudden jumps
        this.pitch = THREE.MathUtils.lerp(this.pitch, goalPitch, damp);
        L.position.x = THREE.MathUtils.lerp(L.position.x, goalLX, damp);
        L.position.y = THREE.MathUtils.lerp(L.position.y, goalLY, damp);
        L.position.z = THREE.MathUtils.lerp(L.position.z, goalLZ, damp);
        R.position.x = THREE.MathUtils.lerp(R.position.x, goalRX, damp);
        R.position.y = THREE.MathUtils.lerp(R.position.y, goalRY, damp);
        R.position.z = THREE.MathUtils.lerp(R.position.z, goalRZ, damp);

        L.rotation.x = THREE.MathUtils.lerp(L.rotation.x, goalRotX, damp);
        L.rotation.y = THREE.MathUtils.lerp(L.rotation.y, goalRotY, damp);
        L.rotation.z = THREE.MathUtils.lerp(L.rotation.z, goalRotZ, damp);
        R.rotation.x = THREE.MathUtils.lerp(R.rotation.x, goalRotX, damp);
        R.rotation.y = THREE.MathUtils.lerp(R.rotation.y, -goalRotY, damp);
        R.rotation.z = THREE.MathUtils.lerp(R.rotation.z, -goalRotZ, damp);

        this._mirrorEyeClose = THREE.MathUtils.lerp(this._mirrorEyeClose, eyeClose, damp);
        this.engine.renderer.setPostProcessParams({
            wakeVignette: this._mirrorEyeClose,
            fade: 1.0 - this._mirrorEyeClose * 0.92
        });

        anim.mirrorPose.torsoLean = THREE.MathUtils.lerp(anim.mirrorPose.torsoLean, mTorsoLean, damp);
        anim.mirrorPose.shRotX = THREE.MathUtils.lerp(anim.mirrorPose.shRotX, mShRotX, damp);
        anim.mirrorPose.shRotY = THREE.MathUtils.lerp(anim.mirrorPose.shRotY, mShRotY, damp);
        anim.mirrorPose.shRotZ = THREE.MathUtils.lerp(anim.mirrorPose.shRotZ, mShRotZ, damp);
        anim.mirrorPose.elbRotX = THREE.MathUtils.lerp(anim.mirrorPose.elbRotX, mElbRotX, damp);
        anim.mirrorPose.eyeClose = this._mirrorEyeClose;

        if (t >= anim.duration) {
            this._mirrorEyeClose = 0;
            this.engine.renderer.setPostProcessParams({ wakeVignette: 0.0, fade: 1.0 });
            if (this._washHandsGroup) this._washHandsGroup.visible = false;
            for (const d of this._washDroplets) d.visible = false;
            this._handAnchor.visible = true;
            this.controlsLocked = false;
            const cb = anim.onComplete;
            this._washAnim = null;
            if (cb) cb();
        }
    }

    // Drives the articulated reflection avatar: body yaw follows the camera with lag, head turns/tilts,
    // legs & arms swing while walking, crouch pose, held-item arm poses and the face-washing pose.
    // Every joint is damped toward its goal so all state changes blend smoothly.
    _updateMirrorBodyAvatar(deltaTime) {
        if (!this._mirrorBodyGroup || !this._mirrorPelvis) return;
        const dt = Math.min(0.1, Math.max(0, deltaTime || 0));
        const k = 1 - Math.exp(-dt * 12);
        const lerp = THREE.MathUtils.lerp;
        const wrap = (a) => {
            while (a > Math.PI) a -= Math.PI * 2;
            while (a < -Math.PI) a += Math.PI * 2;
            return a;
        };

        // Horizontal speed from the rigidbody
        const vel = this.rb?.velocity;
        const speed = vel ? Math.hypot(vel.x, vel.z) : 0;
        const moving = speed > 0.15;
        this._mirrorMoveBlend = lerp(this._mirrorMoveBlend, moving ? Math.min(1, speed / 2.0 + 0.35) : 0, k);
        if (moving) this._mirrorWalkPhase += dt * (3.2 + speed * 3.4);

        // Body yaw: follows camera yaw with lag; snaps faster while walking; head keeps the rest (max ±70°)
        const yawErr = wrap(this.yaw - this._mirrorBodyYaw);
        const bodyRate = moving ? 10 : 3.5;
        this._mirrorBodyYaw += yawErr * Math.min(1, dt * bodyRate);
        const maxHeadYaw = 1.2;
        let headYaw = wrap(this.yaw - this._mirrorBodyYaw);
        if (Math.abs(headYaw) > maxHeadYaw) {
            this._mirrorBodyYaw = wrap(this.yaw - Math.sign(headYaw) * maxHeadYaw);
            headYaw = Math.sign(headYaw) * maxHeadYaw;
        }
        this._mirrorBodyGroup.rotation.y = this._mirrorBodyYaw;

        // Crouch blend from camera eye height (1.54 standing → 0.96 crouched)
        const crouch = THREE.MathUtils.clamp((1.54 - (this.eyeHeight ?? 1.54)) / 0.58, 0, 1);

        const blend = this._mirrorMoveBlend;
        const ph = this._mirrorWalkPhase;
        const swing = Math.sin(ph) * 0.55 * blend;
        const bob = Math.abs(Math.sin(ph)) * 0.025 * blend;

        // --- Goals ---
        let pelvisY = 0.78 - crouch * 0.30 + bob;
        let torsoLean = crouch * 0.28 + blend * 0.05;
        let legLX = swing + crouch * 1.05;
        let legRX = -swing + crouch * 1.05;
        let kneeLX = -Math.max(0, -Math.sin(ph)) * 0.75 * blend - crouch * 1.75;
        let kneeRX = -Math.max(0, Math.sin(ph)) * 0.75 * blend - crouch * 1.75;
        let shLX = -swing * 0.8, shRX = swing * 0.8;
        let shLY = 0, shRY = 0;
        let shLZ = -0.06, shRZ = 0.06;       // slight outward hang
        let elLX = 0.18 + blend * 0.25, elRX = 0.18 + blend * 0.25;
        let eyeClose = 0;

        // Held items
        const item = this.heldItem;
        const twoHanded = TWO_HANDED_ITEMS.has(item);
        if (twoHanded) {
            shLX = shRX = item === 'table' ? 0.85 : 1.05;
            elLX = elRX = item === 'table' ? 0.35 : 0.65;
            shLZ = 0.22; shRZ = -0.22;
        } else if (item && item !== 'cigarette') {
            shRX = 0.75; elRX = 0.95; shRZ = -0.08;
        }
        // Cigarette: right hand rises to mouth on each puff
        if (this.cigaretteActive) {
            const puff = this.cigPuffAnim > 0 ? this.cigPuffAnim / 1.85 : 0;
            const raise = puff > 0.45 ? Math.min(1, (1 - puff) / 0.35) : puff / 0.45;
            shRX = lerp(0.55, 1.15, raise);
            elRX = lerp(1.2, 2.1, raise);
            shRZ = lerp(-0.05, -0.32, raise);
        }

        // Face washing pose (already smoothly damped inside _updateWashFaceAnimation)
        const mp = this._washAnim?.mirrorPose;
        if (mp) {
            torsoLean = Math.max(torsoLean, mp.torsoLean);
            shLX = shRX = mp.shRotX;
            shLY = -mp.shRotY; shRY = mp.shRotY;
            shLZ = mp.shRotZ; shRZ = -mp.shRotZ;
            elLX = elRX = mp.elbRotX;
            eyeClose = mp.eyeClose;
        } else {
            eyeClose = this._mirrorEyeClose || 0;
        }

        // Idle blinking every few seconds
        this._mirrorBlinkTimer = (this._mirrorBlinkTimer ?? 2.5) - dt;
        if (this._mirrorBlinkTimer < 0) {
            const b = -this._mirrorBlinkTimer;
            eyeClose = Math.max(eyeClose, Math.sin(Math.min(1, b / 0.16) * Math.PI));
            if (b > 0.16) this._mirrorBlinkTimer = 2.5 + Math.random() * 3.0;
        }

        // --- Apply with damping ---
        const P = this._mirrorPelvis;
        P.position.y = lerp(P.position.y, pelvisY, k);
        const T = this._mirrorTorsoPivot;
        T.rotation.x = lerp(T.rotation.x, -torsoLean, k);
        T.rotation.y = lerp(T.rotation.y, headYaw * 0.25, k);

        const H = this._mirrorHeadPivot;
        // Head pitch is relative to the leaning torso so the eyes keep matching the camera pitch
        H.rotation.order = 'YXZ';
        const creepyLag = (this.mirrorCreepyTimer && this.mirrorCreepyTimer > 0);
        if (creepyLag) {
            this.mirrorCreepyTimer = Math.max(0, this.mirrorCreepyTimer - dt);
        }
        const headRate = creepyLag ? Math.min(1, dt * 1.1) : k;
        const targetHeadYaw = creepyLag ? 0 : headYaw * 0.75;
        H.rotation.y = lerp(H.rotation.y, targetHeadYaw, headRate);
        H.rotation.x = lerp(H.rotation.x, THREE.MathUtils.clamp(this.pitch + torsoLean, -1.0, 0.9), headRate);

        this._mirrorLegL.rotation.x = lerp(this._mirrorLegL.rotation.x, legLX, k);
        this._mirrorLegR.rotation.x = lerp(this._mirrorLegR.rotation.x, legRX, k);
        this._mirrorKneeL.rotation.x = lerp(this._mirrorKneeL.rotation.x, kneeLX, k);
        this._mirrorKneeR.rotation.x = lerp(this._mirrorKneeR.rotation.x, kneeRX, k);

        const SL = this._mirrorShoulderL, SR = this._mirrorShoulderR;
        SL.rotation.order = SR.rotation.order = 'XYZ';
        SL.rotation.x = lerp(SL.rotation.x, shLX, k);
        SR.rotation.x = lerp(SR.rotation.x, shRX, k);
        SL.rotation.y = lerp(SL.rotation.y, shLY, k);
        SR.rotation.y = lerp(SR.rotation.y, shRY, k);
        SL.rotation.z = lerp(SL.rotation.z, shLZ, k);
        SR.rotation.z = lerp(SR.rotation.z, shRZ, k);
        this._mirrorElbowL.rotation.x = lerp(this._mirrorElbowL.rotation.x, elLX, k);
        this._mirrorElbowR.rotation.x = lerp(this._mirrorElbowR.rotation.x, elRX, k);

        const lid = lerp(0.08, 1.0, THREE.MathUtils.clamp(eyeClose, 0, 1));
        this._mirrorEyelidL.scale.y = lid;
        this._mirrorEyelidR.scale.y = lid;
    }

    startDecorateTreeAnimation(onProgress, onComplete) {
        if (this._treeDecorAnim) return;
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        this._handAnchor.visible = false;
        if (this._treeDecorHandsGroup) this._treeDecorHandsGroup.visible = true;
        this._treeDecorAnim = {
            timer: 0,
            duration: 3.2,
            lastChimeStep: -1,
            onProgress,
            onComplete
        };
    }

    _updateDecorateTreeAnimation(deltaTime) {
        if (!this._treeDecorAnim) return;
        const anim = this._treeDecorAnim;
        anim.timer += deltaTime;
        const u = Math.min(1.0, anim.timer / anim.duration);
        const L = this._treeDecorLeftHand;
        const R = this._treeDecorRightHand;

        // Alternating left/right hand reaching forward to hang ornaments & drape tinsel across the branches
        const waveL = Math.sin(u * Math.PI * 4.0);
        const waveR = Math.sin(u * Math.PI * 4.0 + Math.PI);
        const tierRise = -0.22 + u * 0.24;

        L.position.set(
            -0.16 + Math.cos(u * Math.PI * 3.0) * 0.05,
            tierRise + Math.max(0, waveL) * 0.08,
            -0.36 - Math.max(0, waveL) * 0.14
        );
        R.position.set(
            0.16 - Math.cos(u * Math.PI * 3.0) * 0.05,
            tierRise + Math.max(0, waveR) * 0.08,
            -0.36 - Math.max(0, waveR) * 0.14
        );
        L.rotation.set(0.25 + waveL * 0.25, 0.18, 0.12);
        R.rotation.set(0.25 + waveR * 0.25, -0.18, -0.12);

        const stepIdx = Math.floor(u * 4);
        if (stepIdx > anim.lastChimeStep && stepIdx < 4) {
            anim.lastChimeStep = stepIdx;
            this.engine.audioSystem.playSpatialOneShot('pickup', this.transform.position, { volume: 0.42 });
        }

        if (anim.onProgress) anim.onProgress(u);

        if (u >= 1.0) {
            if (this._treeDecorHandsGroup) this._treeDecorHandsGroup.visible = false;
            this._handAnchor.visible = true;
            this.controlsLocked = false;
            const cb = anim.onComplete;
            this._treeDecorAnim = null;
            if (cb) cb();
        }
    }

    startCookingAnimation(duration = 2.8, onProgress = null, onComplete = null, lookTarget = null, mode = 'olivier') {
        if (this._cookAnim) return;
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        this.forcedLookTarget = null;
        this._handAnchor.visible = false;

        const boardPos = lookTarget ? lookTarget.clone() : this.transform.position.clone().add(new THREE.Vector3(0, 0.8, -0.4));
        const scene = this.engine.renderer.scene;

        // Build a 3D multi-slice food item resting directly on top of the cutting board
        if (this._cookSliceGroup) {
            scene.remove(this._cookSliceGroup);
            this._cookSliceGroup = null;
        }
        const sliceGroup = new THREE.Group();
        sliceGroup.position.set(boardPos.x, boardPos.y - 0.016, boardPos.z);

        const sliceCount = 8;
        const sliceThick = 0.020;
        const radius = mode === 'meat' ? 0.028 : 0.032;
        const outerMat = new THREE.MeshStandardMaterial({
            color: mode === 'meat' ? 0x7d2922 : 0xd98a7c,
            roughness: 0.68
        });
        const innerMat = new THREE.MeshStandardMaterial({
            color: mode === 'meat' ? 0x9e3c34 : 0xebb0a4,
            roughness: 0.60
        });
        const slices = [];
        for (let i = 0; i < sliceCount; i++) {
            const sl = new THREE.Group();
            const disc = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, sliceThick, 10),
                [outerMat, innerMat, innerMat]
            );
            disc.rotation.z = Math.PI / 2;
            sl.add(disc);
            // Line slices up along X from left (-0.07) to right (+0.07)
            const baseX = -0.075 + i * (sliceThick + 0.001);
            sl.position.set(baseX, radius + 0.002, 0.01);
            sl.userData = { baseX, cut: false, cutAnim: 0, targetX: baseX + 0.055 + (sliceCount - 1 - i) * 0.008, targetZ: 0.02 + ((i % 3) - 1) * 0.028, tiltZ: (i % 2 === 0 ? 1 : -1) * 0.85 };
            sliceGroup.add(sl);
            slices.push(sl);
        }
        scene.add(sliceGroup);
        this._cookSliceGroup = sliceGroup;

        if (this._cookHandsGroup) {
            this._cookHandsGroup.visible = true;
            this._cookLeftHand.position.set(-0.15, -0.18, -0.32);
            this._cookRightHand.position.set(0.11, -0.15, -0.32);
        }

        // Compute top-down camera offset in player-local space right above the cutting board
        const targetCamWorld = new THREE.Vector3(boardPos.x, boardPos.y + 0.46, boardPos.z + 0.13);
        const targetRigLocal = targetCamWorld.clone().sub(this.transform.position);

        this._cookAnim = {
            progress: 0,
            knifeX: 0.08,
            knifeY: -0.15,
            cutCount: 0,
            slices,
            savedYaw: this.yaw,
            savedPitch: this.pitch,
            savedRigPos: this._cameraRig.position.clone(),
            targetRigLocal,
            targetYaw: 0,
            targetPitch: -1.26,
            onProgress,
            onComplete
        };
    }

    _updateCookingAnimation(deltaTime) {
        if (!this._cookAnim) return;
        const anim = this._cookAnim;
        const input = this.engine.inputManager;
        const delta = input.getMouseDelta();
        const L = this._cookLeftHand;
        const R = this._cookRightHand;

        // Smoothly move camera overhead looking down at the cutting board
        const camLerp = Math.min(1, deltaTime * 8.5);
        this._cameraRig.position.lerp(anim.targetRigLocal, camLerp);
        this.yaw = THREE.MathUtils.lerp(this.yaw, anim.targetYaw, camLerp);
        this.pitch = THREE.MathUtils.lerp(this.pitch, anim.targetPitch, camLerp);
        this._cameraRig.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;

        // Player directly guides the knife across the food on the cutting board with mouse movement!
        anim.knifeX = THREE.MathUtils.clamp(anim.knifeX + delta.x * 0.00055, -0.05, 0.20);
        anim.knifeY = THREE.MathUtils.clamp(anim.knifeY - delta.y * 0.00055, -0.25, -0.08);

        const moveAmt = Math.hypot(delta.x, delta.y);
        if (moveAmt > 1.2) {
            anim.progress = Math.min(1.0, anim.progress + moveAmt * 0.00068);
        }

        // Left hand holds the uncut product steady on the left; right hand slices with the knife
        L.position.set(-0.15, -0.18, -0.34);
        L.rotation.set(-0.35, 0.30, 0.18);

        const cutDepth = THREE.MathUtils.clamp((-0.11 - anim.knifeY) / 0.14, 0, 1);
        R.position.set(anim.knifeX, anim.knifeY, -0.30 - cutDepth * 0.07);
        R.rotation.set(-0.22 - cutDepth * 0.45, -0.18 + (0.08 - anim.knifeX) * 0.5, -0.10);

        // Slice off pieces from right to left as progress advances!
        const totalSlices = anim.slices.length;
        const desiredCuts = Math.min(totalSlices, Math.floor(anim.progress * totalSlices + 0.001));
        while (anim.cutCount < desiredCuts) {
            const idx = totalSlices - 1 - anim.cutCount;
            if (anim.slices[idx]) {
                anim.slices[idx].userData.cut = true;
            }
            anim.cutCount++;
            this.engine.audioSystem.playSpatialOneShot('footstep_parquet', this.transform.position, { volume: 0.36 });
        }

        // Animate detached slices sliding and tipping flat onto the right side of the board
        for (const sl of anim.slices) {
            if (!sl.userData.cut) continue;
            sl.userData.cutAnim = Math.min(1, sl.userData.cutAnim + deltaTime * 6.5);
            const t = sl.userData.cutAnim;
            const ease = 1 - (1 - t) * (1 - t);
            sl.position.x = THREE.MathUtils.lerp(sl.userData.baseX, sl.userData.targetX, ease);
            sl.position.z = THREE.MathUtils.lerp(0.01, sl.userData.targetZ, ease);
            sl.position.y = THREE.MathUtils.lerp(0.032, 0.014, ease);
            sl.rotation.z = THREE.MathUtils.lerp(0, sl.userData.tiltZ, ease);
            sl.rotation.y = THREE.MathUtils.lerp(0, sl.userData.tiltZ * 0.4, ease);
        }

        if (anim.onProgress) anim.onProgress(anim.progress);

        if (anim.progress >= 1.0) {
            if (this._cookHandsGroup) this._cookHandsGroup.visible = false;
            if (this._cookSliceGroup) {
                this.engine.renderer.scene.remove(this._cookSliceGroup);
                this._cookSliceGroup = null;
            }
            this._cameraRig.position.copy(anim.savedRigPos);
            this.yaw = anim.savedYaw;
            this.pitch = anim.savedPitch;
            this._cameraRig.rotation.y = this.yaw;
            this.camera.rotation.x = this.pitch;
            this._handAnchor.visible = true;
            this.forcedLookTarget = null;
            this.forcedLookSpeed = 5.0;
            this.controlsLocked = false;
            const cb = anim.onComplete;
            this._cookAnim = null;
            if (cb) cb();
        }
    }

    startInteractiveSpongeWash(lookTarget, onProgress = null, onComplete = null) {
        if (this._spongeWashAnim) return;
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        if (lookTarget) {
            this.forcedLookTarget = lookTarget.clone();
            this.forcedLookSpeed = 6.5;
        }
        this._handAnchor.visible = false;
        if (this._spongeHandsGroup) {
            this._spongeHandsGroup.visible = true;
            this._spongeLeftHand.position.set(-0.14, -0.24, -0.36);
            this._spongeRightHand.position.set(0.10, -0.20, -0.35);
        }
        this._spongeWashAnim = {
            progress: 0,
            sx: 0.08,
            sy: -0.20,
            lastSoundProgress: 0,
            onProgress,
            onComplete
        };
    }

    _updateSpongeWashAnimation(deltaTime) {
        if (!this._spongeWashAnim) return;
        const anim = this._spongeWashAnim;
        const delta = this.engine.inputManager.getMouseDelta();
        const L = this._spongeLeftHand;
        const R = this._spongeRightHand;

        // Player scrubs the cutting board & knife directly with the sponge using the mouse!
        anim.sx = THREE.MathUtils.clamp(anim.sx + delta.x * 0.00055, -0.06, 0.22);
        anim.sy = THREE.MathUtils.clamp(anim.sy - delta.y * 0.00055, -0.28, -0.11);

        const scrubAmt = Math.hypot(delta.x, delta.y);
        if (scrubAmt > 1.2) {
            anim.progress = Math.min(1.0, anim.progress + scrubAmt * 0.00055);
        }

        L.position.set(-0.13, -0.24, -0.37);
        L.rotation.set(-0.14, 0.24, 0.14);
        R.position.set(anim.sx, anim.sy, -0.34);
        R.rotation.set(-0.18, -0.18, -0.08 + Math.sin(anim.progress * 20) * 0.08);

        // Animate soap foam bubbles appearing as player scrubs
        const now = performance.now() * 0.004;
        for (let i = 0; i < this._soapBubbles.length; i++) {
            const b = this._soapBubbles[i];
            const show = anim.progress > (i / this._soapBubbles.length) * 0.7;
            b.visible = show;
            if (show) {
                b.position.set(
                    anim.sx * 0.5 + b.userData.ox,
                    anim.sy * 0.8 + b.userData.oy + Math.sin(now + b.userData.phase) * 0.012,
                    -0.37
                );
                const s = 0.7 + 0.5 * Math.sin(now * 1.4 + b.userData.phase);
                b.scale.set(s, s, s);
            }
        }

        if (anim.progress - anim.lastSoundProgress >= 0.18) {
            anim.lastSoundProgress = anim.progress;
            this.engine.audioSystem.playSpatialOneShot('steam_hiss', this.transform.position, { volume: 0.28 });
        }

        if (anim.onProgress) anim.onProgress(anim.progress);

        if (anim.progress >= 1.0) {
            if (this._spongeHandsGroup) this._spongeHandsGroup.visible = false;
            for (const b of this._soapBubbles) b.visible = false;
            this._handAnchor.visible = true;
            this.forcedLookTarget = null;
            this.forcedLookSpeed = 5.0;
            this.controlsLocked = false;
            const cb = anim.onComplete;
            this._spongeWashAnim = null;
            if (cb) cb();
        }
    }

    startBalconySmokeSequence(balconyWindow, onPromptChange = null, onComplete = null) {
        if (this._smokeIntroAnim) return;
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        this._handAnchor.visible = false;
        if (this._smokeIntroGroup) this._smokeIntroGroup.visible = true;
        if (this._cigPackGroup) this._cigPackGroup.visible = false;
        if (this._cigPackLid) this._cigPackLid.rotation.x = 0;
        if (this._cigPackStick) this._cigPackStick.visible = true;
        if (this._lighterGroup) this._lighterGroup.visible = false;
        if (this._lighterFlame) this._lighterFlame.visible = false;
        if (this._mouthCig) {
            this._mouthCig.visible = false;
            if (this._mouthCig.userData.tipMat) this._mouthCig.userData.tipMat.emissiveIntensity = 0;
        }
        const needOpenWindow = !!(balconyWindow && !balconyWindow.isOpen());
        const startPos = this.transform.position.clone();
        // Stand right in front of the open balcony window pane (x = 0.62..1.92, z = -4.72), centered at x = 1.24
        const leanPos = new THREE.Vector3(1.24, 0.05, -4.22);

        this._smokeIntroAnim = {
            stage: needOpenWindow ? 'open_window' : 'walk_lean',
            timer: 0,
            balconyWindow,
            startPos,
            leanPos,
            windowOpened: false,
            lighterSparked: false,
            lightHold: 0,
            onPromptChange,
            onComplete
        };
    }

    _updateBalconySmokeSequence(deltaTime) {
        if (!this._smokeIntroAnim) return;
        const a = this._smokeIntroAnim;
        a.timer += deltaTime;
        const L = this._smokeLeftHand;
        const R = this._smokeRightHand;
        const input = this.engine.inputManager;
        const lerp = THREE.MathUtils.lerp;
        const smooth = (u) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); };

        // Stage 1a: Walk toward the closed balcony window (on the right side of the balcony), reach for its handle and swing it open
        if (a.stage === 'open_window') {
            const u = Math.min(1, a.timer / 1.45);
            const e = smooth(u);
            // Smoothly step toward the window while looking at the window handle (x = 0.72, y = 1.55, z = -4.72)
            this.forcedLookTarget = new THREE.Vector3(
                lerp(0.75, 1.15, e),
                lerp(1.52, 1.45, e),
                lerp(-4.72, -12.0, Math.max(0, (u - 0.55) / 0.45))
            );
            this.forcedLookSpeed = 5.5;

            const approachPos = new THREE.Vector3(
                lerp(a.startPos.x, 1.05, e),
                a.startPos.y,
                lerp(a.startPos.z, -4.08, e)
            );
            this.transform.position.copy(approachPos);
            if (this.rb) this.rb.position.copy(approachPos);

            L.position.set(-0.30, -0.55, -0.25);
            L.rotation.set(0.10, 0.20, 0.12);

            // Right hand reaches forward from the right shoulder toward the window handle and pulls it open to the right
            const reach = Math.sin(e * Math.PI);
            const pullRight = u > 0.42 ? Math.sin(((u - 0.42) / 0.58) * Math.PI) * 0.14 : 0;
            R.position.set(
                lerp(0.26, 0.14, reach) + pullRight,
                lerp(-0.42, -0.05, reach),
                lerp(-0.24, -0.44, reach)
            );
            R.rotation.set(
                lerp(-0.10, 0.20, reach),
                lerp(-0.22, -0.18 - pullRight * 1.4, reach),
                lerp(-0.18, -0.10, reach)
            );

            if (!a.windowOpened && u >= 0.44) {
                a.windowOpened = true;
                a.balconyWindow?.setOpen(true);
            }
            if (u >= 1) {
                a.startPos.copy(this.transform.position);
                a.stage = 'walk_lean';
                a.timer = 0;
            }
            return;
        }

        // Look out through the open balcony window into the snowy courtyard
        this.forcedLookTarget = new THREE.Vector3(0.4, 0.4, -18.0);
        this.forcedLookSpeed = 4.2;

        // Stage 1b: Step right up to the open window and lean gently on the sill
        if (a.stage === 'walk_lean') {
            const u = Math.min(1, a.timer / 1.15);
            const e = smooth(u);
            this.transform.position.lerpVectors(a.startPos, a.leanPos, e);
            if (this.rb) this.rb.position.copy(this.transform.position);
            this.eyeHeight = lerp(1.54, 1.44, e);
            this.targetEyeHeight = this.eyeHeight;
            L.position.set(-0.30, -0.55, -0.25);
            L.rotation.set(0.10, 0.20, 0.12);
            R.position.set(0.30, -0.55, -0.25);
            R.rotation.set(0.10, -0.25, -0.22);
            if (u >= 1) {
                a.stage = 'pack_open';
                a.timer = 0;
                if (this._cigPackGroup) this._cigPackGroup.visible = true;
            }
            return;
        }

        // Stage 2: Left hand pulls pack from left side, right hand flips lid from right side & puts cigarette in mouth
        if (a.stage === 'pack_open') {
            const t = a.timer;
            if (t < 0.75) {
                const e = smooth(t / 0.75);
                L.position.set(lerp(-0.28, -0.13, e), lerp(-0.52, -0.22, e), lerp(-0.22, -0.36, e));
                L.rotation.set(0.12, 0.28, 0.16);
                R.position.set(lerp(0.30, 0.14, e), lerp(-0.52, -0.19, e), lerp(-0.22, -0.35, e));
                R.rotation.set(0.14, -0.38, -0.26);
            } else if (t < 1.55) {
                const e = smooth((t - 0.75) / 0.80);
                if (this._cigPackLid) this._cigPackLid.rotation.x = lerp(0, 1.65, Math.min(1, e * 1.6));
                R.position.set(lerp(0.14, 0.04, e), lerp(-0.19, -0.12, e), lerp(-0.35, -0.32, e));
                R.rotation.set(0.16, -0.44, -0.28);
            } else if (t < 2.45) {
                const e = smooth((t - 1.55) / 0.90);
                if (this._cigPackStick) this._cigPackStick.visible = false;
                if (e > 0.55 && this._mouthCig) this._mouthCig.visible = true;
                // Right hand brings cigarette to mouth from the right side; left hand puts pack back in pocket
                R.position.set(lerp(0.04, 0.11, e), lerp(-0.12, -0.08, Math.sin(e * Math.PI)), lerp(-0.32, -0.19, Math.sin(e * Math.PI)));
                R.rotation.set(0.20, -0.42, -0.28);
                L.position.set(lerp(-0.13, -0.28, e), lerp(-0.22, -0.55, e), lerp(-0.36, -0.22, e));
            } else {
                if (this._cigPackGroup) this._cigPackGroup.visible = false;
                if (this._lighterGroup) this._lighterGroup.visible = true;
                a.stage = 'lighter_ready';
                a.timer = 0;
                if (a.onPromptChange) a.onPromptChange('ignite');
            }
            return;
        }

        // Stage 3: Player pulls lighter in right hand (angled naturally from the right shoulder, not the stomach!)
        if (a.stage === 'lighter_ready') {
            L.position.set(-0.32, -0.56, -0.22);
            const sparkDown = input.isKeyDown('KeyF') || (input.isPointerLocked() && input.isMouseButtonDown(0));
            if (sparkDown) {
                if (!a.lighterSparked) {
                    a.lighterSparked = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', this.transform.position, { volume: 0.45 });
                    if (a.onPromptChange) a.onPromptChange('lighting');
                }
                a.lightHold = Math.min(1.0, a.lightHold + deltaTime / 1.15);
            } else if (a.lighterSparked) {
                a.lightHold = Math.max(0, a.lightHold - deltaTime * 0.5);
            }

            if (this._lighterFlame) {
                this._lighterFlame.visible = sparkDown;
                if (sparkDown) {
                    const flicker = 0.85 + Math.sin(performance.now() * 0.045) * 0.25;
                    this._lighterFlame.scale.set(1.0, flicker, 1.0);
                }
            }

            const bring = smooth(a.lightHold);
            // Keep right hand offset to the right (x: 0.22 -> 0.115) and rotated inward (rotY: -0.45 -> -0.56, rotZ: -0.32)
            // so the forearm clearly extends from the right shoulder while the lighter tip reaches the cigarette at x ~ 0.02
            R.position.set(
                lerp(0.22, 0.115, bring),
                lerp(-0.22, -0.115, bring),
                lerp(-0.33, -0.21, bring)
            );
            R.rotation.set(
                lerp(0.08, 0.22, bring),
                lerp(-0.44, -0.56, bring),
                lerp(-0.28, -0.34, bring)
            );
            if (this._lighterGroup) {
                // Counter-tilt the lighter slightly in the palm so the flame stays upright near the cigarette tip
                this._lighterGroup.position.set(-0.028, 0.024, -0.092);
                this._lighterGroup.rotation.set(-0.12, 0.32, 0.26);
            }

            if (this._mouthCig?.userData.tipMat) {
                this._mouthCig.userData.tipMat.emissiveIntensity = bring * 2.2;
            }

            if (a.lightHold >= 1.0) {
                this.engine.audioSystem.playSpatialOneShot('smoke_puff', null, { volume: 0.72 });
                if (this._lighterFlame) this._lighterFlame.visible = false;
                if (a.onPromptChange) a.onPromptChange('');
                a.stage = 'put_lighter_away';
                a.timer = 0;
            }
            return;
        }

        // Stage 4: Put lighter back in right pocket and hand off to Act II cigarette smoking
        if (a.stage === 'put_lighter_away') {
            const u = Math.min(1, a.timer / 0.75);
            const e = smooth(u);
            R.position.set(lerp(0.115, 0.30, e), lerp(-0.115, -0.55, e), lerp(-0.21, -0.22, e));
            R.rotation.set(lerp(0.22, 0.05, e), lerp(-0.56, -0.25, e), lerp(-0.34, -0.18, e));
            if (u >= 1) {
                if (this._smokeIntroGroup) this._smokeIntroGroup.visible = false;
                if (this._lighterGroup) this._lighterGroup.visible = false;
                if (this._mouthCig) this._mouthCig.visible = false;
                this._handAnchor.visible = true;
                this.forcedLookTarget = null;
                this.forcedLookSpeed = 5.0;
                this.eyeHeight = 1.54;
                this.targetEyeHeight = 1.54;
                this.controlsLocked = false;
                const cb = a.onComplete;
                this._smokeIntroAnim = null;
                if (cb) cb();
            }
        }
    }

    setHeldItem(itemKey) {
        this.heldItem = itemKey;
        const activeMesh = itemKey ? this._handMeshes[itemKey] : null;
        const seen = new Set();
        for (const [k, m] of Object.entries(this._handMeshes)) {
            if (!m || seen.has(m)) continue;
            seen.add(m);
            m.visible = (m === activeMesh) || (k === 'cigarette' && this.cigaretteActive);
        }
    }

    setShoppingBasketContents({ olivier = false, meat = false } = {}) {
        if (!this._shoppingBasketSlots) return;
        if (this._shoppingBasketSlots.olivierSlot) {
            this._shoppingBasketSlots.olivierSlot.visible = !!olivier;
        }
        if (this._shoppingBasketSlots.meatSlot) {
            this._shoppingBasketSlots.meatSlot.visible = !!meat;
        }
    }

    setDecorBoxContents({ tree = true, hall = true, kitchen = true, hallway = true } = {}) {
        if (!this._decorBoxParts) return;
        this._decorBoxParts.tree.visible = !!tree;
        this._decorBoxParts.hall.visible = !!hall;
        this._decorBoxParts.kitchen.visible = !!kitchen;
        this._decorBoxParts.hallway.visible = !!hallway;
    }

    setCigarette(active) {
        this.cigaretteActive = active;
        this.cigBurn = 0;
        this.cigPuffAnim = 0;
        if (this._cigPaperMesh) {
            this._cigPaperMesh.scale.y = 1.0;
            this._cigPaperMesh.position.y = 0.031;
        }
        if (this._cigAshMesh) this._cigAshMesh.position.y = 0.0665;
        if (this._cigEmberTip) this._cigEmberTip.position.y = 0.072;
        if (this._handMeshes.cigarette) {
            this._handMeshes.cigarette.position.set(0.17, -0.17, -0.41);
            this._handMeshes.cigarette.rotation.set(-1.18, 0.14, 0.22);
            this._handMeshes.cigarette.visible = active;
        }
        if (this._cigSmokeGroup) {
            this._cigSmokeGroup.visible = active;
        }
    }

    takeCigarettePuff() {
        if (!this.cigaretteActive || this.cigPuffAnim > 0.05 || this.cigBurn >= 0.95) return false;
        this.cigPuffAnim = 1.85;
        this.cigBurn = Math.min(0.95, this.cigBurn + 0.18);
        this.engine.audioSystem.playSpatialOneShot('smoke_puff', null, { volume: 0.72 });
        return true;
    }

    setPose(pos, yaw, pitch = 0) {
        this.transform.position.copy(pos);
        if (this.rb) {
            this.rb.position.copy(pos);
            this.rb.velocity.set(0, 0, 0);
        }
        this.yaw = yaw;
        this.pitch = pitch;
        this._handYaw = yaw;
        this._handPitch = 0;
        this._swayX = 0;
        this._swayY = 0;
    }

    setSensitivityMultiplier(multiplier) {
        const mult = Number.isFinite(multiplier) ? Math.max(0.05, Math.min(2.5, multiplier)) : 1.0;
        this.sensitivity = this.baseSensitivity * mult;
    }

    enterPeephole() {
        if (this.isHidden || this.isPeephole || this._peepholeAnim) return;
        this.isPeephole = true;
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        this._handAnchor.visible = false;
        this._exitSafePos.copy(this.transform.position);
        this._exitSafePos.z = Math.min(this._exitSafePos.z, 4.10);

        const approachPos = new THREE.Vector3(3.075, 0.0, 4.02);
        this.peepholePos = new THREE.Vector3(3.075, 0.0, 4.45);

        // Shortest-angle target yaw facing the front door (+Z => Math.PI)
        let targetYaw = Math.PI;
        let diff = targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        targetYaw = this.yaw + diff;

        if (this.rb) {
            this.rb.useGravity = false;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = false;

        if (this._peepholeHand) {
            this._peepholeHand.visible = true;
            this._peepholeHand.position.set(0.24, -0.38, -0.26);
            this._peepholeHand.rotation.set(-0.2, -0.25, -0.15);
        }

        this._peepholeAnim = {
            mode: 'enter',
            timer: 0,
            duration: 1.45,
            startPos: this.transform.position.clone(),
            approachPos,
            peepPos: this.peepholePos.clone(),
            startYaw: this.yaw,
            targetYaw,
            startPitch: this.pitch,
            startEyeHeight: this._cameraRig.position.y,
            clickPlayed: false,
            stepPlayed: false
        };
    }

    _setPeepholeLensVisible(visible) {
        const meshes = this.world?.frontDoor?.peepMeshes;
        if (!Array.isArray(meshes)) return;
        for (const m of meshes) {
            if (m) m.visible = !!visible;
        }
    }

    exitPeephole(instant = false) {
        if (!this.isPeephole && !this._peepholeAnim) return;
        const flap = this.world?.frontDoor?.peepFlapPivot;
        if (instant) {
            this._peepholeAnim = null;
            this.isPeephole = false;
            this.controlsLocked = false;
            this.allowLookWhileLocked = false;
            this._handAnchor.visible = true;
            if (this._peepholeHand) this._peepholeHand.visible = false;
            if (flap) flap.rotation.z = 0;
            this._setPeepholeLensVisible(true);
            this.transform.position.copy(this._exitSafePos);
            if (this.rb) {
                this.rb.position.copy(this._exitSafePos);
                this.rb.useGravity = true;
                this.rb.velocity.set(0, 0, 0);
            }
            if (this.collider) this.collider.enabled = true;
            this._cameraRig.position.set(0, this.eyeHeight, 0);
            this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
            this.engine.renderer.setFOV(75);
            return;
        }
        if (this._peepholeAnim) return;

        // Smooth animated return to the original standing pose WITHOUT rotating 180 degrees
        this.controlsLocked = true;
        this.allowLookWhileLocked = false;
        const approachPos = new THREE.Vector3(3.075, 0.0, 4.02);
        if (this._peepholeHand) {
            this._peepholeHand.visible = true;
            this._peepholeHand.position.set(0.24, -0.38, -0.26);
            this._peepholeHand.rotation.set(-0.2, -0.25, -0.15);
        }
        this._peepholeAnim = {
            mode: 'exit',
            timer: 0,
            duration: 0.95,
            startPos: this.transform.position.clone(),
            approachPos,
            endPos: this._exitSafePos.clone(),
            startYaw: this.yaw,
            targetYaw: this.yaw, // Stay facing the door (no 180-degree spin!)
            startPitch: this.pitch,
            targetPitch: -0.02,
            startEyeHeight: this._cameraRig.position.y,
            clickPlayed: false,
            stepPlayed: false
        };
    }

    _updatePeepholeAnimation(deltaTime) {
        const anim = this._peepholeAnim;
        if (!anim) return;
        anim.timer += deltaTime;
        const t = anim.timer;
        const smooth = (u) => {
            const c = Math.max(0, Math.min(1, u));
            return c * c * (3 - 2 * c);
        };
        const flap = this.world?.frontDoor?.peepFlapPivot;
        const hand = this._peepholeHand;

        if (anim.mode === 'enter') {
            // Phase 1 (0.00..0.45s): Approach the door & raise right hand toward the peephole shutter
            if (t < 0.45) {
                const e = smooth(t / 0.45);
                this.transform.position.lerpVectors(anim.startPos, anim.approachPos, e);
                this.yaw = THREE.MathUtils.lerp(anim.startYaw, anim.targetYaw, e);
                this.pitch = THREE.MathUtils.lerp(anim.startPitch, -0.02, e);
                this._cameraRig.position.y = THREE.MathUtils.lerp(anim.startEyeHeight, 1.495, e) + Math.sin(e * Math.PI) * 0.018;
                if (!anim.stepPlayed && e > 0.35) {
                    anim.stepPlayed = true;
                    this.engine.audioSystem.playSpatialOneShot('footstep_linoleum', this.transform.position, { volume: 0.32 });
                }
                if (hand) {
                    hand.position.set(
                        THREE.MathUtils.lerp(0.24, 0.045, e),
                        THREE.MathUtils.lerp(-0.38, -0.045, e),
                        THREE.MathUtils.lerp(-0.26, -0.37, e)
                    );
                    hand.rotation.set(
                        THREE.MathUtils.lerp(-0.2, 0.22, e),
                        THREE.MathUtils.lerp(-0.25, -0.12, e),
                        THREE.MathUtils.lerp(-0.15, 0.25, e)
                    );
                }
            }
            // Phase 2 (0.45..0.90s): Hand slides the brass peephole shutter open, then lowers out of view
            else if (t < 0.90) {
                const u = (t - 0.45) / 0.45;
                this.transform.position.copy(anim.approachPos);
                this.yaw = anim.targetYaw;
                this.pitch = -0.02;
                this._cameraRig.position.y = 1.495;

                const slideE = smooth(Math.min(1, u / 0.60));
                if (flap) flap.rotation.z = THREE.MathUtils.lerp(0, 1.65, slideE);
                if (!anim.clickPlayed && u > 0.12) {
                    anim.clickPlayed = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', anim.peepPos, { volume: 0.38 });
                }

                if (hand) {
                    if (u < 0.60) {
                        hand.position.set(
                            THREE.MathUtils.lerp(0.045, 0.16, slideE),
                            THREE.MathUtils.lerp(-0.045, 0.01, slideE),
                            -0.37
                        );
                        hand.rotation.set(0.22, THREE.MathUtils.lerp(-0.12, -0.38, slideE), THREE.MathUtils.lerp(0.25, -0.25, slideE));
                    } else {
                        const downE = smooth((u - 0.60) / 0.40);
                        hand.position.set(
                            THREE.MathUtils.lerp(0.16, 0.26, downE),
                            THREE.MathUtils.lerp(0.01, -0.42, downE),
                            THREE.MathUtils.lerp(-0.37, -0.24, downE)
                        );
                        hand.rotation.set(THREE.MathUtils.lerp(0.22, -0.25, downE), -0.38, -0.25);
                    }
                }
            }
            // Phase 3 (0.90..1.45s): Lean eye forward right into the peephole lens
            else {
                const e = smooth((t - 0.90) / 0.55);
                if (hand) hand.visible = false;
                if (flap) flap.rotation.z = 1.65;
                if (e > 0.15) this._setPeepholeLensVisible(false);
                this.transform.position.lerpVectors(anim.approachPos, anim.peepPos, e);
                this.yaw = anim.targetYaw;
                this.pitch = THREE.MathUtils.lerp(-0.02, -0.08, e);
                this._cameraRig.position.y = 1.495;
                this.engine.renderer.setPostProcessParams({ peephole: e });
                this.engine.renderer.setFOV(THREE.MathUtils.lerp(75, 95, e));
            }

            if (t >= anim.duration) {
                this.transform.position.copy(anim.peepPos);
                this.yaw = anim.targetYaw;
                this.pitch = -0.08;
                this._cameraRig.position.set(0, 1.495, 0);
                this.engine.renderer.setPostProcessParams({ peephole: 1.0 });
                this.engine.renderer.setFOV(95);
                if (hand) hand.visible = false;
                if (flap) flap.rotation.z = 1.65;
                this._setPeepholeLensVisible(false);
                this.controlsLocked = false;
                this._peepholeAnim = null;
            }
        } else if (anim.mode === 'exit') {
            // Phase 1 (0.00..0.45s): Pull eye back from the peephole & close shutter with hand
            if (t < 0.45) {
                const e = smooth(t / 0.45);
                if (e > 0.55) this._setPeepholeLensVisible(true);
                this.transform.position.lerpVectors(anim.startPos, anim.approachPos, e);
                this.yaw = anim.targetYaw;
                this.pitch = THREE.MathUtils.lerp(anim.startPitch, anim.targetPitch, e);
                this._cameraRig.position.y = THREE.MathUtils.lerp(anim.startEyeHeight, 1.50, e);
                this.engine.renderer.setPostProcessParams({ peephole: 1.0 - e });
                this.engine.renderer.setFOV(THREE.MathUtils.lerp(95, 75, e));
                if (hand) {
                    const riseE = smooth(Math.max(0, (e - 0.30) / 0.70));
                    hand.visible = e > 0.25;
                    hand.position.set(
                        THREE.MathUtils.lerp(0.24, 0.14, riseE),
                        THREE.MathUtils.lerp(-0.38, -0.02, riseE),
                        THREE.MathUtils.lerp(-0.26, -0.37, riseE)
                    );
                    hand.rotation.set(0.18, -0.32, -0.15);
                }
            }
            // Phase 2 (0.45..0.95s): Close the peephole shutter & step smoothly back to original pose (still facing the door)
            else {
                const u = (t - 0.45) / 0.50;
                const e = smooth(u);
                const closeE = smooth(Math.min(1, u / 0.45));
                if (flap) flap.rotation.z = THREE.MathUtils.lerp(1.65, 0, closeE);
                if (!anim.clickPlayed && u > 0.15) {
                    anim.clickPlayed = true;
                    this.engine.audioSystem.playSpatialOneShot('pickup', anim.startPos, { volume: 0.30 });
                }
                if (!anim.stepPlayed && u > 0.45) {
                    anim.stepPlayed = true;
                    this.engine.audioSystem.playSpatialOneShot('footstep_linoleum', anim.endPos, { volume: 0.30 });
                }
                this.transform.position.lerpVectors(anim.approachPos, anim.endPos, e);
                this.yaw = anim.targetYaw;
                this.pitch = anim.targetPitch;
                this._cameraRig.position.y = THREE.MathUtils.lerp(1.50, this.eyeHeight, e) + Math.sin(e * Math.PI) * 0.015;
                this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
                this.engine.renderer.setFOV(75);
                if (hand) {
                    if (u < 0.45) {
                        hand.position.set(
                            THREE.MathUtils.lerp(0.14, 0.04, closeE),
                            THREE.MathUtils.lerp(-0.02, -0.05, closeE),
                            -0.37
                        );
                        hand.rotation.set(0.18, THREE.MathUtils.lerp(-0.32, -0.10, closeE), THREE.MathUtils.lerp(-0.15, 0.20, closeE));
                    } else {
                        const downE = smooth((u - 0.45) / 0.55);
                        hand.position.set(
                            THREE.MathUtils.lerp(0.04, 0.24, downE),
                            THREE.MathUtils.lerp(-0.05, -0.42, downE),
                            THREE.MathUtils.lerp(-0.37, -0.24, downE)
                        );
                    }
                }
            }

            if (t >= anim.duration) {
                this.transform.position.copy(anim.endPos);
                if (this.rb) {
                    this.rb.position.copy(anim.endPos);
                    this.rb.useGravity = true;
                    this.rb.velocity.set(0, 0, 0);
                }
                this.yaw = anim.targetYaw;
                this._handYaw = this.yaw;
                this.pitch = anim.targetPitch;
                if (this.collider) this.collider.enabled = true;
                this._cameraRig.position.set(0, this.eyeHeight, 0);
                this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
                this.engine.renderer.setFOV(75);
                if (hand) hand.visible = false;
                if (flap) flap.rotation.z = 0;
                this._setPeepholeLensVisible(true);
                this._handAnchor.visible = true;
                this.isPeephole = false;
                this.controlsLocked = false;
                this._peepholeAnim = null;
            }
        }
    }

    enterHidingSpot(spot) {
        if (this.isHidden || this.isPeephole) return;
        this.isHidden = true;
        this._handAnchor.visible = false;
        this.currentHidingSpot = spot;
        this._exitSafePos.copy(this.transform.position);
        this.yaw = spot.lookYaw;
        this.pitch = 0;

        if (this.rb) {
            this.rb.useGravity = false;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = false;
        this.transform.position.set(spot.hidePos.x, 0, spot.hidePos.z);
        this._cameraRig.position.set(0, spot.hidePos.y, 0);
        this.engine.audioSystem.playSpatialOneShot('pickup', spot.hidePos, { volume: 0.35 });
    }

    exitHidingSpot() {
        if (!this.isHidden) return;
        const spot = this.currentHidingSpot;
        if (spot) {
            spot.setPeeking?.(false);
            if (spot.isDoorClosed()) spot.setDoorClosed(false);
        }
        this.isHidden = false;
        this.isPeeking = false;
        this._handAnchor.visible = true;
        this.currentHidingSpot = null;
        this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
        this.transform.position.copy(this._exitSafePos);
        if (this.rb) {
            this.rb.position.copy(this._exitSafePos);
            this.rb.useGravity = true;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = true;
        this._cameraRig.position.set(0, this.eyeHeight, 0);
    }

    setCameraTiltEnabled(enabled) {
        this.cameraTiltEnabled = !!enabled;
        if (!this.cameraTiltEnabled) this._dynamicTiltRoll = 0;
    }

    _getSurfaceFootstep() {
        const p = this.transform.position;
        if (p.x > 30) {
            if (p.x > 92.5 && p.x < 99.5 && p.z >= 49.8) return 'footstep_concrete';
            if (p.z > 6.35) return 'footstep_snow';
            return 'footstep_linoleum';
        }
        if (p.z < -3.5) return 'footstep_snow';
        if (p.x < 2.0 && p.z <= 1.5) return 'footstep_parquet';
        return 'footstep_linoleum';
    }

    update(deltaTime) {
        this._updateWashFaceAnimation(deltaTime);
        this._updateDecorateTreeAnimation(deltaTime);
        this._updateCookingAnimation(deltaTime);
        this._updateSpongeWashAnimation(deltaTime);
        this._updateBalconySmokeSequence(deltaTime);
        this._updatePeepholeAnimation(deltaTime);

        const input = this.engine.inputManager;
        const delta = input.getMouseDelta();

        if (this.forcedLookTarget) {
            const camWorld = new THREE.Vector3();
            this.camera.getWorldPosition(camWorld);
            const lookMat = new THREE.Matrix4().lookAt(camWorld, this.forcedLookTarget, new THREE.Vector3(0, 1, 0));
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
            this._targetEuler.setFromQuaternion(targetQuat, 'YXZ');

            let dy = this._targetEuler.y - this.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            const kLook = Math.min(1, deltaTime * (this.forcedLookSpeed || 5.0));
            this.yaw += dy * kLook;
            this.pitch = THREE.MathUtils.lerp(this.pitch, this._targetEuler.x, kLook);
        } else if ((!this.controlsLocked || this.allowLookWhileLocked) && !this.isPeephole) {
            this.yaw -= delta.x * this.sensitivity;
            this.pitch -= delta.y * this.sensitivity;
            if (this.isHidden && this.currentHidingSpot) {
                const center = this.currentHidingSpot.lookYaw;
                const yawRange = this.isPeeking ? 0.68 : 0.42;
                let diff = this.yaw - center;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                diff = Math.max(-yawRange, Math.min(yawRange, diff));
                this.yaw = center + diff;
                // Under the sofa restrict upward pitch so camera never clips into sofa base
                const maxUpPitch = this.currentHidingSpot.id === 'sofa' ? 0.06 : 0.35;
                this.pitch = Math.max(-0.28, Math.min(maxUpPitch, this.pitch));
            } else if (this.allowLookWhileLocked && this.lookYawCenter !== null) {
                let diff = this.yaw - this.lookYawCenter;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                diff = Math.max(-this.lookYawLimit, Math.min(this.lookYawLimit, diff));
                this.yaw = this.lookYawCenter + diff;
                this.pitch = Math.max(this.lookPitchMin, Math.min(this.lookPitchMax, this.pitch));
            } else {
                this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch));
            }
        }

        // Subtle dynamic camera roll/tilt when strafing, walking & turning the head (toggleable in Settings)
        let targetTiltRoll = 0;
        if (this.cameraTiltEnabled && !this.controlsLocked && !this.isHidden && !this.isPeephole) {
            let strafeDir = 0;
            if (input.isKeyDown('KeyD')) strafeDir += 1;
            if (input.isKeyDown('KeyA')) strafeDir -= 1;
            const sprintBoost = input.isKeyDown('ShiftLeft') && !this.isCrouching ? 1.45 : 1.0;
            const strafeRoll = -strafeDir * 0.022 * sprintBoost;
            const turnRoll = THREE.MathUtils.clamp(-delta.x * 0.00135, -0.026, 0.026);
            const walkSway = (input.isKeyDown('KeyW') || input.isKeyDown('KeyS'))
                ? Math.cos(this._bobTime) * 0.0075 * sprintBoost
                : 0;
            targetTiltRoll = strafeRoll + turnRoll + walkSway;
        }
        this._dynamicTiltRoll = THREE.MathUtils.lerp(this._dynamicTiltRoll, targetTiltRoll, Math.min(1, deltaTime * 8.5));

        const swayRoll = (this.cigaretteActive ? Math.sin(performance.now() * 0.0022) * 0.025 : 0)
            + (this.cinematicRollOffset || 0)
            + this._dynamicTiltRoll;
        const swayPitch = this.cigaretteActive ? Math.cos(performance.now() * 0.0017) * 0.014 : 0;
        this.camera.rotation.set(this.pitch + swayPitch, this.yaw, swayRoll, 'YXZ');
        this._updateMirrorBodyAvatar(deltaTime);

        // Smooth rotational inertia for held items & pitch horizon clamping (never lift table/items over head)
        const isTwoHanded = TWO_HANDED_ITEMS.has(this.heldItem);
        const inertiaRate = isTwoHanded ? 7.5 : 12.0;
        let yawDiff = this.yaw - this._handYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this._handYaw += yawDiff * Math.min(1, deltaTime * inertiaRate);

        this._swayX = THREE.MathUtils.lerp(this._swayX, -delta.x * 0.00045, Math.min(1, deltaTime * 10));
        this._swayY = THREE.MathUtils.lerp(this._swayY, delta.y * 0.00035, Math.min(1, deltaTime * 10));

        // When looking up (pitch > 0), keep objects down at waist/chest level; when looking down, tilt slightly
        let goalHandPitch = 0;
        if (this.cigaretteActive && this.cigPuffAnim > 0.01) {
            const puffProgress = this.cigPuffAnim / 1.85;
            const raiseAmt = puffProgress > 0.45
                ? Math.min(1, (1 - puffProgress) / 0.35)
                : (puffProgress / 0.45);
            goalHandPitch = THREE.MathUtils.lerp(Math.min(0.05, this.pitch * 0.25), this.pitch, raiseAmt);
        } else if (isTwoHanded) {
            goalHandPitch = this.pitch < 0 ? this.pitch * 0.16 : 0.0;
        } else {
            goalHandPitch = this.pitch < 0 ? this.pitch * 0.32 : Math.min(0.04, this.pitch * 0.05);
        }
        this._handPitch = THREE.MathUtils.lerp(this._handPitch, goalHandPitch, Math.min(1, deltaTime * inertiaRate));
        this._handAnchor.rotation.set(this._handPitch, this._handYaw, this._swayX * 0.8, 'YXZ');

        const bobY = Math.sin(this._bobTime * 2) * (isTwoHanded ? 0.014 : 0.009);
        const bobX = Math.cos(this._bobTime) * (isTwoHanded ? 0.008 : 0.004);
        this._handAnchor.position.set(bobX + this._swayX, bobY + this._swayY, 0);

        if (this.cigaretteActive && !this.controlsLocked && !this.isHidden && !this.isPeephole) {
            const puffPressed = input.wasKeyJustPressed('KeyF')
                || (input.isPointerLocked() && input.wasMouseButtonJustPressed(0));
            if (puffPressed) {
                this.takeCigarettePuff();
            }
        }

        if (this.cigaretteActive && this._cigSmokeGroup && this._handMeshes.cigarette) {
            if (this.cigPuffAnim > 0) {
                this.cigPuffAnim = Math.max(0, this.cigPuffAnim - deltaTime);
            }
            const puffProgress = this.cigPuffAnim > 0 ? this.cigPuffAnim / 1.85 : 0;
            // Smooth curve bringing cigarette close to face/mouth, holding for draw, then lowering
            let raiseAmt = 0;
            if (puffProgress > 0.72) {
                raiseAmt = (1.0 - puffProgress) / 0.28;
            } else if (puffProgress > 0.38) {
                raiseAmt = 1.0;
            } else if (puffProgress > 0) {
                raiseAmt = puffProgress / 0.38;
            }
            raiseAmt = raiseAmt * raiseAmt * (3 - 2 * raiseAmt);

            const cigMesh = this._handMeshes.cigarette;
            const targetCigX = THREE.MathUtils.lerp(0.17, 0.018, raiseAmt);
            const targetCigY = THREE.MathUtils.lerp(-0.17, -0.068, raiseAmt);
            const targetCigZ = THREE.MathUtils.lerp(-0.41, -0.155, raiseAmt);
            cigMesh.position.x = THREE.MathUtils.lerp(cigMesh.position.x, targetCigX, Math.min(1, deltaTime * 11));
            cigMesh.position.y = THREE.MathUtils.lerp(cigMesh.position.y, targetCigY, Math.min(1, deltaTime * 11));
            cigMesh.position.z = THREE.MathUtils.lerp(cigMesh.position.z, targetCigZ, Math.min(1, deltaTime * 11));
            cigMesh.rotation.x = THREE.MathUtils.lerp(-1.18, -1.48, raiseAmt);
            cigMesh.rotation.z = THREE.MathUtils.lerp(0.22, 0.05, raiseAmt);

            const paperRatio = Math.max(0.08, 1 - this.cigBurn);
            const paperLen = 0.062 * paperRatio;
            if (this._cigPaperMesh) {
                this._cigPaperMesh.scale.y = THREE.MathUtils.lerp(this._cigPaperMesh.scale.y, paperRatio, Math.min(1, deltaTime * 4));
                this._cigPaperMesh.position.y = (0.062 * this._cigPaperMesh.scale.y) * 0.5;
            }
            const curPaperTop = this._cigPaperMesh ? (0.062 * this._cigPaperMesh.scale.y) : paperLen;
            if (this._cigAshMesh) this._cigAshMesh.position.y = curPaperTop + 0.0045;
            if (this._cigEmberTip) this._cigEmberTip.position.y = curPaperTop + 0.009;

            if (this._cigEmberTip) {
                cigMesh.updateMatrix();
                this._cigSmokeGroup.position.copy(this._cigEmberTip.position).applyMatrix4(cigMesh.matrix);
            }

            const nowSec = performance.now() * 0.001;
            const puffGlow = (puffProgress > 0.35 && puffProgress < 0.85) ? 2.4 : 0;
            const pulse = 1.3 + Math.sin(nowSec * 3.1) * 0.45 + puffGlow;
            if (this._cigEmberTip && this._cigEmberTip.material) {
                this._cigEmberTip.material.emissiveIntensity = pulse;
            }
            const isExhaling = puffProgress > 0.02 && puffProgress < 0.40;
            const smokeSpeed = isExhaling ? 1.45 : 0.52;
            for (const puff of this._cigSmokePuffs) {
                const d = puff.userData;
                d.phase = (d.phase + deltaTime * smokeSpeed) % 1;
                const p = d.phase;
                puff.position.set(
                    d.driftX * p + Math.sin(nowSec * 2.6 + d.wobble + p * 5.0) * 0.014 * p,
                    p * (isExhaling ? 0.28 : 0.20),
                    d.driftZ * p + Math.cos(nowSec * 2.0 + d.wobble) * 0.01 * p - (isExhaling ? p * 0.14 : 0)
                );
                const s = (0.55 + p * 2.7) * (isExhaling ? 1.35 : 1.0);
                puff.scale.set(s, s * 0.9, s);
                puff.material.opacity = Math.sin(p * Math.PI) * (isExhaling ? 0.46 : 0.32);
            }
            const smokeTransform = this.world?.cigSmokeEmitter?.transform
                || this.world?.cigSmokeEmitter?.gameObject?.transform
                || this.world?.cigSmokeEmitter?.go?.transform;
            if (this._cigEmberTip && smokeTransform) {
                this._cigEmberTip.getWorldPosition(this._cigWorldTip);
                smokeTransform.position.copy(this._cigWorldTip);
            }
        }

        if (!this._peepholeAnim) {
            const goalFov = this.isPeephole ? 95 : (this.isPeeking ? 62 : (this.forcedFov ?? 75));
            const curFov = this.engine.renderer.camera.fov;
            this.engine.renderer.setFOV(THREE.MathUtils.lerp(curFov, goalFov, Math.min(1, deltaTime * 4.5)));
        }

        // Interactions strictly bound to KeyE (freeing LMB)
        const interactPressed = input.wasKeyJustPressed('KeyE');
        const interactHeld = !this.cigaretteActive && input.isKeyDown('KeyE');
        const exitPressed = input.wasKeyJustPressed('KeyQ');

        if (!this.controlsLocked) {
            if (this.isPeephole) {
                if (this.rb) this.rb.velocity.set(0, 0, 0);
                if (this.peepholePos) this.transform.position.copy(this.peepholePos);
                if (interactPressed || exitPressed) this.exitPeephole();
                return;
            }
            if (this.isHidden) {
                if (this.rb) this.rb.velocity.set(0, 0, 0);
                if (interactPressed && this.currentHidingSpot) {
                    this.currentHidingSpot.setDoorClosed(!this.currentHidingSpot.isDoorClosed());
                } else if (exitPressed) {
                    this.exitHidingSpot();
                    return;
                }
                const s = this.currentHidingSpot;
                if (!s) return;
                const peeking = input.isKeyDown('KeyW')
                    || input.isKeyDown('ShiftLeft')
                    || input.isKeyDown('ShiftRight')
                    || (input.isPointerLocked() && input.isMouseButtonDown(2));
                if (peeking !== this.isPeeking) {
                    this.isPeeking = peeking;
                    s.setPeeking?.(peeking);
                    this.engine.renderer.setPostProcessParams({ peephole: peeking ? 0.42 : 0.0 });
                }
                const goalPos = peeking ? s.peekPos : s.hidePos;
                this.transform.position.x = THREE.MathUtils.lerp(this.transform.position.x, goalPos.x, Math.min(1, deltaTime * 8));
                this.transform.position.z = THREE.MathUtils.lerp(this.transform.position.z, goalPos.z, Math.min(1, deltaTime * 8));
                this._cameraRig.position.y = THREE.MathUtils.lerp(this._cameraRig.position.y, goalPos.y, Math.min(1, deltaTime * 8));
                return;
            }

            if (interactPressed) {
                this.engine.interactionSystem.tryInteract(this);
                if (this.isPeephole || this.isHidden || this.controlsLocked) {
                    if (this.rb) this.rb.velocity.set(0, 0, 0);
                    return;
                }
            }
            if (this.engine.interactionSystem.updateHold(deltaTime, interactHeld)) {
                if (this.isPeephole || this.isHidden || this.controlsLocked) {
                    if (this.rb) this.rb.velocity.set(0, 0, 0);
                    return;
                }
            }
        }

        if (this.controlsLocked || !this.rb) {
            if (this.rb) {
                this.rb.velocity.x = 0;
                this.rb.velocity.z = 0;
            }
            if (!this._peepholeAnim) {
                this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, this.targetEyeHeight, Math.min(1, deltaTime * 4.5));
                this._cameraRig.position.y = THREE.MathUtils.lerp(
                    this._cameraRig.position.y,
                    this.eyeHeight + (this.cinematicBobOffset || 0),
                    Math.min(1, deltaTime * 8.0)
                );
            }
            return;
        }

        const wantCrouch = (input.isKeyDown('ControlLeft') || input.isKeyDown('KeyC')) && this.heldItem !== 'table';
        if (wantCrouch !== this.isCrouching) {
            this.isCrouching = wantCrouch;
            this.targetEyeHeight = this.isCrouching ? 0.96 : 1.54;
            if (this.collider) {
                const h = this.isCrouching ? 1.05 : 1.70;
                this.collider.setSize(new THREE.Vector3(0.46, h, 0.46));
                this.collider.offset.set(0, h * 0.5, 0);
            }
        }
        this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, this.targetEyeHeight, Math.min(1, deltaTime * 10));

        let moveForward = 0;
        let moveRight = 0;
        if (input.isKeyDown('KeyW')) moveForward += 1;
        if (input.isKeyDown('KeyS')) moveForward -= 1;
        if (input.isKeyDown('KeyD')) moveRight += 1;
        if (input.isKeyDown('KeyA')) moveRight -= 1;

        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const moveVec = new THREE.Vector3()
            .addScaledVector(forward, moveForward)
            .addScaledVector(right, moveRight);

        const isMoving = moveVec.lengthSq() > 0.001;
        const canSprint = input.isKeyDown('ShiftLeft') && !this.isCrouching && this.heldItem !== 'table';
        let speed = this.isCrouching
            ? this.crouchSpeed
            : (canSprint ? this.sprintSpeed : this.walkSpeed);

        // Heavy carry speed modifiers
        if (this.heldItem === 'table') {
            speed = this.walkSpeed * 0.58;
        } else if (this.heldItem === 'stool' || this.heldItem === 'decorBox') {
            speed *= 0.82;
        }

        if (isMoving) {
            moveVec.normalize().multiplyScalar(speed);
            this.rb.velocity.x = moveVec.x;
            this.rb.velocity.z = moveVec.z;

            const bobRate = speed * 4.2;
            this._bobTime += deltaTime * bobRate;
            const bobAmp = this.heldItem === 'table' ? 0.045 : 0.032;
            this._cameraRig.position.y = this.eyeHeight + Math.sin(this._bobTime) * bobAmp;

            this._stepTimer -= deltaTime * (speed / this.walkSpeed);
            if (this._stepTimer <= 0) {
                this._stepTimer = this.heldItem === 'table' ? 0.52 : 0.46;
                this.engine.audioSystem.playSpatialOneShot(this._getSurfaceFootstep(), this.transform.position, {
                    heavy: this.heldItem === 'table',
                    volume: this.isCrouching ? 0.14 : (this.heldItem === 'table' ? 0.42 : 0.3)
                });
            }
        } else {
            this.rb.velocity.x = 0;
            this.rb.velocity.z = 0;
            this._cameraRig.position.y = THREE.MathUtils.lerp(this._cameraRig.position.y, this.eyeHeight, deltaTime * 8);
        }
    }
}

export default PlayerController;
