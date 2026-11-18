import * as THREE from 'three';
import { Component, RigidBody, BoxCollider } from '../../lumina/index.js';

const TWO_HANDED_ITEMS = new Set(['table', 'stool', 'decorBox']);

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

        this._bobTime = 0;
        this._stepTimer = 0;
        this._cameraRig = new THREE.Object3D();
        this._handAnchor = new THREE.Object3D();
        this._handMeshes = {};
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
        const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x2f3d4c, roughness: 0.88 });
        const cuffMat = new THREE.MeshStandardMaterial({ color: 0x222c38, roughness: 0.9 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4aa8c, roughness: 0.78 });

        const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.28), sleeveMat);
        forearm.position.set(0, 0, 0.14);
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.04), cuffMat);
        cuff.position.set(0, 0, 0.01);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.082, 0.085), skinMat);
        hand.position.set(0, 0.005, -0.04);
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.028, 0.045), skinMat);
        thumb.position.set(isLeft ? 0.036 : -0.036, 0.028, -0.035);
        armGroup.add(forearm, cuff, hand, thumb);
        return armGroup;
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

        // 1. Crystal glasses (one-handed)
        const crystalGroup = new THREE.Group();
        const crystalBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.042, 0.03, 0.13, 8),
            mats.crystal || new THREE.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.78 })
        );
        const crystalBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.032, 0.035, 0.018, 8),
            mats.crystal || new THREE.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.85 })
        );
        crystalBase.position.y = -0.065;
        crystalGroup.add(crystalBody, crystalBase);
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

        // 6. Champagne bottle
        const champGroup = new THREE.Group();
        const champBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.044, 0.048, 0.19, 10),
            mats.champagne || new THREE.MeshStandardMaterial({ color: 0x1d4d27 })
        );
        champBody.position.y = -0.03;
        const champNeck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.017, 0.042, 0.10, 10),
            mats.champagne || new THREE.MeshStandardMaterial({ color: 0x1d4d27 })
        );
        champNeck.position.y = 0.11;
        const champFoil = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.021, 0.055, 10),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.55 })
        );
        champFoil.position.y = 0.155;
        champGroup.add(champBody, champNeck, champFoil);
        this._attachOneHand(champGroup, 0.03, -0.04, 0.05);
        champGroup.position.set(0.25, -0.25, -0.45);
        make('champagne', champGroup);

        // 7. Two-handed Folding Table (heavy)
        const tableCarryGroup = new THREE.Group();
        const woodMat = mats.woodDark || new THREE.MeshStandardMaterial({ color: 0x4a2614 });
        const tCenter = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.52, 0.58), woodMat);
        const tFlapL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.56), woodMat);
        tFlapL.position.set(-0.155, -0.01, 0);
        const tFlapR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.56), woodMat);
        tFlapR.position.set(0.155, -0.01, 0);
        tableCarryGroup.add(tCenter, tFlapL, tFlapR);
        tableCarryGroup.rotation.y = Math.PI / 2;
        const tableWrapper = new THREE.Group();
        tableWrapper.add(tableCarryGroup);
        this._attachTwoHands(tableWrapper, 0.28, 0.02, 0.14);
        tableWrapper.position.set(0.0, -0.36, -0.56);
        make('table', tableWrapper);

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

        // 9. Two-handed Decor Box with tinsel
        const boxCarryGroup = new THREE.Group();
        const boxMat = mats.woodFrame || new THREE.MeshStandardMaterial({ color: 0x8f6b47 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xf7d046, emissive: 0x805a10, emissiveIntensity: 0.4 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xc92222, emissive: 0x550808, emissiveIntensity: 0.4 });
        const cBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.28), boxMat);
        const cTinsel = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.025, 6, 10), goldMat);
        cTinsel.rotation.x = Math.PI / 2;
        cTinsel.position.set(-0.03, 0.11, 0.02);
        const cBall = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), redMat);
        cBall.position.set(0.07, 0.11, -0.04);
        boxCarryGroup.add(cBox, cTinsel, cBall);
        this._attachTwoHands(boxCarryGroup, 0.19, -0.03, 0.10);
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
    }

    setHeldItem(itemKey) {
        this.heldItem = itemKey;
        for (const [k, m] of Object.entries(this._handMeshes)) {
            m.visible = (k === itemKey) || (k === 'cigarette' && this.cigaretteActive);
        }
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
        if (this.isHidden) return;
        this.isPeephole = true;
        this._handAnchor.visible = false;
        this._exitSafePos.copy(this.transform.position);
        this.peepholePos = new THREE.Vector3(3.075, 0.0, 4.45);
        this.yaw = Math.PI;
        this.pitch = -0.08;
        if (this.rb) {
            this.rb.useGravity = false;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = false;
        this.transform.position.copy(this.peepholePos);
        this._cameraRig.position.set(0, 1.50, 0);
        this.engine.renderer.setPostProcessParams({ peephole: 1.0 });
        this.engine.renderer.setFOV(95);
    }

    exitPeephole() {
        if (!this.isPeephole) return;
        this.isPeephole = false;
        this._handAnchor.visible = true;
        this.transform.position.copy(this._exitSafePos);
        if (this.rb) {
            this.rb.position.copy(this._exitSafePos);
            this.rb.useGravity = true;
            this.rb.velocity.set(0, 0, 0);
        }
        this.yaw = 0;
        this.pitch = 0;
        if (this.collider) this.collider.enabled = true;
        this._cameraRig.position.set(0, this.eyeHeight, 0);
        this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
        this.engine.renderer.setFOV(75);
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

    _getSurfaceFootstep() {
        const p = this.transform.position;
        if (p.z < -3.5) return 'footstep_snow';
        if (p.x < 2.0 && p.z <= 1.5) return 'footstep_parquet';
        return 'footstep_linoleum';
    }

    update(deltaTime) {
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

        const swayRoll = (this.cigaretteActive ? Math.sin(performance.now() * 0.0022) * 0.025 : 0) + (this.cinematicRollOffset || 0);
        const swayPitch = this.cigaretteActive ? Math.cos(performance.now() * 0.0017) * 0.014 : 0;
        this.camera.rotation.set(this.pitch + swayPitch, this.yaw, swayRoll, 'YXZ');

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

        const goalFov = this.isPeephole ? 95 : (this.isPeeking ? 62 : (this.forcedFov ?? 75));
        const curFov = this.engine.renderer.camera.fov;
        this.engine.renderer.setFOV(THREE.MathUtils.lerp(curFov, goalFov, Math.min(1, deltaTime * 4.5)));

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
            this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, this.targetEyeHeight, Math.min(1, deltaTime * 4.5));
            this._cameraRig.position.y = THREE.MathUtils.lerp(
                this._cameraRig.position.y,
                this.eyeHeight + (this.cinematicBobOffset || 0),
                Math.min(1, deltaTime * 8.0)
            );
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
