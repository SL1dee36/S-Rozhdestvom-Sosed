import * as THREE from 'three';
import { Component } from '../../lumina/index.js';

const APARTMENT_NAVMESH = [
    { id: 'trap_corner', x: 3.85, z: 4.18, neighbors: ['hallway_front'] },
    { id: 'hallway_front', x: 3.10, z: 3.55, neighbors: ['trap_corner', 'hallway_mid'] },
    { id: 'hallway_mid', x: 3.10, z: 2.45, neighbors: ['hallway_front', 'bath_door', 'corridor_north'] },
    { id: 'bath_door', x: 4.05, z: 2.50, neighbors: ['hallway_mid', 'bath_center'] },
    { id: 'bath_center', x: 4.65, z: 2.55, neighbors: ['bath_door'] },
    { id: 'corridor_north', x: 2.95, z: 0.68, neighbors: ['hallway_mid', 'kitchen_door', 'hall_door'] },
    { id: 'kitchen_door', x: 3.00, z: -0.60, neighbors: ['corridor_north', 'kitchen_center'] },
    { id: 'kitchen_center', x: 3.00, z: -1.65, neighbors: ['kitchen_door'] },
    { id: 'hall_door', x: 2.00, z: 0.70, neighbors: ['corridor_north', 'hall_east'] },
    { id: 'hall_east', x: 1.25, z: 0.50, neighbors: ['hall_door', 'hall_south', 'hall_ne'] },
    { id: 'hall_south', x: -0.45, z: 0.55, neighbors: ['hall_east', 'hall_west'] },
    { id: 'hall_west', x: -1.60, z: 0.50, neighbors: ['hall_south', 'hall_nw'] },
    { id: 'hall_nw', x: -1.60, z: -1.40, neighbors: ['hall_west', 'hall_north', 'hall_ne'] },
    { id: 'hall_north', x: -0.35, z: -1.55, neighbors: ['hall_nw', 'hall_ne'] },
    { id: 'hall_ne', x: 0.85, z: -1.45, neighbors: ['hall_east', 'hall_north', 'hall_balc_lane'] },
    { id: 'hall_balc_lane', x: 0.72, z: -2.45, neighbors: ['hall_ne', 'balc_door'] },
    { id: 'balc_door', x: 0.62, z: -3.50, neighbors: ['hall_balc_lane', 'balcony'] },
    { id: 'balcony', x: 0.62, z: -4.05, neighbors: ['balc_door'] }
];

export class MonsterAI extends Component {
    constructor(gameObject, world, player) {
        super(gameObject);
        this.world = world;
        this.player = player;

        this.state = 'neighbor_idle';
        this.stateTimer = 0;
        this.trapElapsed = 0;
        this.trapDuration = 40.0;

        const fallbackWaypoints = [
            new THREE.Vector3(3.10, 0, 3.20),
            new THREE.Vector3(2.95, 0, 0.68),
            new THREE.Vector3(1.25, 0, 0.50),
            new THREE.Vector3(0.85, 0, -1.45),
            new THREE.Vector3(-1.60, 0, -1.40),
            new THREE.Vector3(-1.60, 0, 0.50),
            new THREE.Vector3(1.25, 0, 0.50),
            new THREE.Vector3(2.98, 0, -1.55),
            new THREE.Vector3(3.10, 0, 2.50),
            new THREE.Vector3(4.60, 0, 2.55),
            new THREE.Vector3(3.10, 0, 3.55)
        ];
        this._patrolWaypoints = (world.patrolWaypoints && world.patrolWaypoints.length > 0)
            ? world.patrolWaypoints.map(p => p.clone())
            : fallbackWaypoints;
        this._wpIndex = 0;
        this._stepAccum = 0;
        this._knifeDragAccum = 0;
        this._gaitPhase = 0;
        this._sprintPhase = 'fall';
        this._chaseReason = 'caught';
        this._chaseTimer = 0;
        this._trapTarget = new THREE.Vector3(3.85, 0, 4.18);
        this._stuckTimer = 0;
        this._lastProgressPos = new THREE.Vector3();
        this._sidestepTimer = 0;
        this._sidestepSign = 1;
        this._onJumpscare = null;
        this._onTrapLeft = null;
        this._wreckDone = { mistletoe: false, garland: false, table: false };
        this._wreckAction = null;
        this._balconyState = null;
        this._balconyTimer = 0;
        this._balconyHits = 0;
        this._balconyMaxHits = 0;
        this.balconyAssaultDone = false;

        this._buildMesh();
    }

    _buildMesh() {
        const root = this.gameObject.transform;
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.95 });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0x161414, roughness: 0.9 });
        const redHatMat = new THREE.MeshStandardMaterial({ color: 0x6e1010, roughness: 0.9 });
        const furMat = new THREE.MeshStandardMaterial({ color: 0x8f887d, roughness: 0.95 });
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x7b8288, metalness: 0.6, roughness: 0.35 });
        const bloodMat = new THREE.MeshBasicMaterial({ color: 0x6b0808 });

        this.bodyGroup = new THREE.Group();

        const buildLeg = (hipX) => {
            const legPivot = new THREE.Group();
            legPivot.position.set(hipX, 0.92, 0);
            const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.50, 0.20), darkMat);
            thigh.position.y = -0.25;
            const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.17), darkMat);
            shin.position.y = -0.66;
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.27), bootMat);
            boot.position.set(0, -0.85, 0.04);
            legPivot.add(thigh, shin, boot);
            return legPivot;
        };

        this.leftLeg = buildLeg(-0.14);
        this.rightLeg = buildLeg(0.14);

        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), darkMat);
        this.torso.position.set(0, 1.32, 0.06);
        this.torso.rotation.x = 0.24;

        this.leftArm = new THREE.Group();
        this.leftArm.position.set(-0.38, 1.56, 0.12);
        const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.14), darkMat);
        leftArmMesh.position.y = -0.36;
        this.leftArm.add(leftArmMesh);

        this.rightArm = new THREE.Group();
        this.rightArm.position.set(0.38, 1.56, 0.12);
        const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.80, 0.14), darkMat);
        armMesh.position.y = -0.35;
        const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.018), bladeMat);
        knifeBlade.position.set(0, -0.78, 0.18);
        knifeBlade.rotation.x = Math.PI / 2.2;
        const bloodTip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.2, 0.02), bloodMat);
        bloodTip.position.set(0, -0.82, 0.3);
        bloodTip.rotation.x = Math.PI / 2.2;
        this.rightArm.add(armMesh, knifeBlade, bloodTip);

        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 1.82, 0.22);
        const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.32), darkMat);
        const hatTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 8), furMat);
        hatTrim.position.y = 0.17;
        const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 7), redHatMat);
        hatCone.position.set(-0.04, 0.36, -0.05);
        hatCone.rotation.z = 0.28;
        hatCone.rotation.x = -0.2;

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.025, 0.02), eyeMat);
        this.eyeL.position.set(-0.065, 0.03, 0.165);
        this.eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.025, 0.02), eyeMat);
        this.eyeR.position.set(0.065, 0.03, 0.165);
        this.eyeL.visible = false;
        this.eyeR.visible = false;

        this.headGroup.add(skull, hatTrim, hatCone, this.eyeL, this.eyeR);
        this.bodyGroup.add(this.leftLeg, this.rightLeg, this.torso, this.leftArm, this.rightArm, this.headGroup);
        root.add(this.bodyGroup);
        root.traverse((c) => {
            if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
            }
        });

        root.position.set(0, -50, 0);
    }

    setCallbacks({ onJumpscare, onTrapLeft }) {
        this._onJumpscare = onJumpscare;
        this._onTrapLeft = onTrapLeft;
    }

    setEyesVisible(v) {
        this.eyeL.visible = v;
        this.eyeR.visible = v;
    }

    _resetPose() {
        this.bodyGroup.position.set(0, 0, 0);
        this.bodyGroup.rotation.set(0, 0, 0);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
        this.leftArm.rotation.set(0, 0, 0);
        this.rightArm.rotation.set(0, 0, 0);
        this.torso.rotation.set(0.24, 0, 0);
        this.headGroup.rotation.set(0, 0, 0);
    }

    _animateLimbs(deltaTime, moveSpeed, mode = 'walk') {
        if (mode === 'wreck_stomp') {
            const p = Math.min(1, (this._wreckAction?.timer || 0) / Math.max(0.01, this._wreckAction?.duration || 1.0));
            if (p < 0.45) {
                const u = p / 0.45;
                this.rightArm.rotation.x = -2.35 * Math.sin(u * Math.PI);
                this.leftArm.rotation.x = -1.65 * Math.sin(u * Math.PI);
                this.torso.rotation.x = 0.05;
            } else {
                const u = (p - 0.45) / 0.55;
                this.rightArm.rotation.x = -0.35;
                this.leftArm.rotation.x = -0.25;
                this.rightLeg.rotation.x = u < 0.5 ? -0.95 * (u * 2) : -0.95 * (1 - (u - 0.5) * 2);
                this.torso.rotation.x = 0.32;
                this.bodyGroup.position.y = u < 0.5 ? 0.08 * (u * 2) : 0;
            }
            return;
        }
        if (mode === 'wreck_rip') {
            const t = (this._wreckAction?.timer || 0) * 10;
            this.leftArm.rotation.x = -1.75 + Math.sin(t) * 0.65;
            this.rightArm.rotation.x = -1.85 - Math.sin(t) * 0.65;
            this.torso.rotation.x = 0.25 + Math.sin(t * 0.5) * 0.14;
            this.bodyGroup.rotation.z = Math.sin(t) * 0.12;
            return;
        }
        if (mode === 'wreck_smash') {
            const p = Math.min(1, (this._wreckAction?.timer || 0) / Math.max(0.01, this._wreckAction?.duration || 1.0));
            const swing = p < 0.45 ? (-2.5 * (p / 0.45)) : THREE.MathUtils.lerp(-2.5, 0.45, (p - 0.45) / 0.55);
            this.rightArm.rotation.x = swing;
            this.leftArm.rotation.x = swing * 0.65;
            this.torso.rotation.x = p < 0.45 ? 0.08 : 0.48;
            return;
        }

        if (moveSpeed > 0.08) {
            const strideAmp = mode === 'sprint' || mode === 'chase' ? 0.88 : 0.48;
            const rate = Math.max(4.0, moveSpeed * (mode === 'walk' ? 4.2 : 2.9));
            this._gaitPhase += deltaTime * rate;
            const s = Math.sin(this._gaitPhase);

            this.leftLeg.rotation.x = s * strideAmp;
            this.rightLeg.rotation.x = -s * strideAmp;
            this.leftArm.rotation.x = -s * (strideAmp * 0.72);
            this.leftArm.rotation.z = -0.08;

            if (mode === 'chase') {
                this.rightArm.rotation.x = -2.08 + Math.sin(this._gaitPhase * 2) * 0.22;
                this.torso.rotation.x = 0.16;
                this.headGroup.rotation.x = -0.15;
                this.headGroup.rotation.z = Math.sin(this._gaitPhase * 0.5) * 0.12;
            } else if (mode === 'sprint') {
                this.rightArm.rotation.x = -0.75 + s * 0.62;
                this.torso.rotation.x = 0.32;
                this.headGroup.rotation.z = Math.sin(this._gaitPhase * 0.5) * 0.14;
            } else {
                this.rightArm.rotation.x = s * 0.35 - 0.15;
                this.torso.rotation.x = 0.24;
                this.headGroup.rotation.z = Math.sin(this.stateTimer * 3.5) * 0.06;
            }

            this.bodyGroup.position.y = Math.abs(s) * (mode === 'walk' ? 0.04 : 0.09);
            this.bodyGroup.rotation.z = Math.cos(this._gaitPhase) * (mode === 'walk' ? 0.04 : 0.09);
        } else {
            const k = Math.min(1, deltaTime * 10);
            this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, k);
            this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, k);
            this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, k);
            this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, k);
            this.bodyGroup.position.y = THREE.MathUtils.lerp(this.bodyGroup.position.y, 0, k);
            this.bodyGroup.rotation.z = THREE.MathUtils.lerp(this.bodyGroup.rotation.z, 0, k);
        }
    }

    setIdleInNeighborRoom() {
        this.state = 'neighbor_idle';
        this.stateTimer = 0;
        this.trapElapsed = 0;
        this.setEyesVisible(false);
        this._resetPose();
        this.transform.position.set(0, -50, 0);
        this.transform.rotation.set(0, 0, 0);
        this.engine.audioSystem.stopLoop('monster_breath');
    }

    startWindowMurder() {
        this.state = 'window_kill';
        this.stateTimer = 0;
        this.setEyesVisible(false);
        this.transform.position.set(0, -50, 0);
        if (this.world.neighborWindowCanvas) {
            this.world.neighborWindowCanvas.setMode('murder');
        }
    }

    triggerWindowStare() {
        this.state = 'window_stare';
        this.stateTimer = 0;
        this.setEyesVisible(true);
        if (this.world.neighborWindowCanvas) {
            this.world.neighborWindowCanvas.setMode('stare');
        }
    }

    startCourtyardSprint() {
        this.state = 'courtyard_sprint';
        this.stateTimer = 0;
        this._sprintPhase = 'fall';
        this.setEyesVisible(true);
        this._resetPose();

        if (this.world.neighborWindowCanvas) {
            this.world.neighborWindowCanvas.setMode('shattered');
        }
        const winPos = this.world.neighborScene?.windowPos || new THREE.Vector3(-1.0, 1.1, -24.45);
        this.transform.position.set(winPos.x, 0.85, winPos.z + 0.3);
        this.transform.rotation.set(0, 0, 0);

        this.engine.audioSystem.playSpatialOneShot('glass_break', winPos, {
            bufferKey: 'glass_break',
            volume: 0.95,
            maxDistance: 55
        });
        this.engine.audioSystem.playSpatialOneShot('monster_roar', this.transform.position, {
            volume: 0.9,
            maxDistance: 55
        });
    }

    enterApartmentPatrol() {
        this.state = 'patrol';
        this.stateTimer = 0;
        this._wpIndex = 0;
        this._stuckTimer = 0;
        this._sidestepTimer = 0;
        this._wreckDone = { mistletoe: false, garland: false, table: false };
        this._wreckAction = null;
        this._balconyState = null;
        this._balconyTimer = 0;
        this._balconyHits = 0;
        this._balconyMaxHits = 0;
        this.balconyAssaultDone = false;
        this._resetPose();
        this.transform.position.set(3.08, 0, 4.35);
        this._lastProgressPos.copy(this.transform.position);
        this.setEyesVisible(true);
        this.engine.audioSystem.startSpatialLoop('monster_breath', 'monster_breath', this.transform.position, {
            volume: 0.95,
            refDistance: 2.8,
            maxDistance: 22
        });
    }

    triggerTrapWait() {
        if (this.state === 'trap') return;
        if (this.transform.position.y > -2.0) {
            this.state = 'moving_to_trap';
            this.stateTimer = 0;
            return;
        }
        this._enterTrapState();
    }

    _enterTrapState() {
        this.state = 'trap';
        this.trapElapsed = 0;
        this._resetPose();
        this.transform.position.copy(this._trapTarget);
        this.transform.rotation.set(0, -Math.PI * 0.75, 0);
        this.setEyesVisible(false);
        this.engine.audioSystem.stopLoop('monster_breath');
    }

    showMidnightEyesInHallway() {
        this.state = 'midnight_standoff';
        this.stateTimer = 0;
        this._resetPose();
        this.transform.position.set(3.0, 0, 1.55);
        this.transform.lookAt(this.player.transform.position.x, 0, this.player.transform.position.z);
        this.setEyesVisible(true);
    }

    startMidnightRetreat() {
        this.state = 'midnight_retreat';
        this.stateTimer = 0;
        this._retreatStartPos = this.transform.position.clone();
        this._retreatStartYaw = this.transform.rotation.y;
        this._retreatInCourtyard = false;
        this._stepAccum = 0;
    }

    startChasePlayer(reason = 'caught') {
        if (this.state === 'chase' || this.state === 'jumpscare') return;

        if (this.transform.position.y < -2.0) {
            this.transform.position.set(3.08, 0, 4.35);
        }

        if (this.player.isPeephole) {
            this.player.exitPeephole();
        }

        this.state = 'chase';
        this.stateTimer = 0;
        this._chaseTimer = 0;
        this._chaseReason = reason;
        this.setEyesVisible(true);
        this.engine.audioSystem.stopLoop('monster_breath');
        this.engine.audioSystem.playSpatialOneShot('monster_roar', this.transform.position, {
            volume: 0.92,
            maxDistance: 25
        });

        const pPos = this.player.transform.position;
        const dx = pPos.x - this.transform.position.x;
        const dz = pPos.z - this.transform.position.z;
        if (Math.hypot(dx, dz) < 0.95) {
            this._executeFinalStrike(reason);
        }
    }

    triggerJumpscare(reason = 'caught') {
        const pPos = this.player.transform.position;
        const dist = Math.hypot(pPos.x - this.transform.position.x, pPos.z - this.transform.position.z);
        if (this.state !== 'chase' && (this.transform.position.y < -2.0 || dist >= 1.15)) {
            this.startChasePlayer(reason);
            return;
        }
        this._executeFinalStrike(reason);
    }

    _executeFinalStrike(reason = 'caught') {
        if (this.state === 'jumpscare') return;
        this.state = 'jumpscare';
        this.stateTimer = 0;
        this.engine.audioSystem.stopLoop('monster_breath');
        this.setEyesVisible(true);

        if (this.player.isHidden) {
            this.player.exitHidingSpot();
        }

        const pPos = this.player.transform.position;
        this.player.forcedLookTarget = new THREE.Vector3(this.transform.position.x, 1.58, this.transform.position.z);
        this.transform.lookAt(pPos.x, 0, pPos.z);
        this.leftLeg.rotation.x = 0;
        this.rightLeg.rotation.x = 0;
        this.rightArm.rotation.x = -2.25;
        this.engine.renderer.triggerGlitch(1.2);
        this.engine.audioSystem.playSpatialOneShot('jumpscare', this.transform.position, { volume: 1.0, checkOcclusion: false });

        if (this._onJumpscare) this._onJumpscare(reason);
    }

    _openNearbyDoors() {
        const pos = this.transform.position;
        if (this.world.interiorDoors) {
            for (const door of this.world.interiorDoors) {
                if (!door.isOpen() && pos.distanceTo(door.pivot.transform.position) < 2.0) {
                    door.setOpen(true);
                }
            }
        }
        const playerOnBalcony = this.player?.transform?.position?.z < -3.55;
        if (!playerOnBalcony && this.world.doors?.balcony && !this.world.doors.balcony.isOpen()) {
            const bPos = this.world.doors.balcony.pivot.transform.position;
            if (Math.hypot(pos.x - bPos.x, pos.z - bPos.z) < 1.8) {
                this.world.doors.balcony.setOpen(true);
            }
        }
    }

    _getStaticObstacleAABBs(yLevel = 0) {
        const boxes = [];
        const bodies = this.engine?.physicsEngine?.rigidBodies;
        if (!bodies) return boxes;

        for (const rb of bodies) {
            if (rb.bodyType !== 'static' || !rb.collider || !rb.collider.enabled) continue;
            const go = rb.gameObject;
            if (!go) continue;
            const name = go.name || '';
            if (name === 'Player' || name.includes('Door')) continue;

            if (typeof rb.collider.getBox !== 'function') continue;
            const box = rb.collider.getBox(rb.position);
            const minY = box.min.y;
            const maxY = box.max.y;
            if (maxY < yLevel + 0.18 || minY > yLevel + 1.75) continue;
            if ((box.max.x - box.min.x) > 13.0 && (box.max.z - box.min.z) > 13.0) continue;

            boxes.push({
                minX: box.min.x,
                maxX: box.max.x,
                minZ: box.min.z,
                maxZ: box.max.z
            });
        }
        return boxes;
    }

    _pointBlocked2D(x, z, boxes, radius = 0.28) {
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) {
                return true;
            }
        }
        return false;
    }

    _isSegmentBlocked2D(x1, z1, x2, z2, boxes, radius = 0.25) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.05) return false;
        const steps = Math.max(2, Math.ceil(dist / 0.25));
        for (let s = 1; s < steps; s++) {
            const t = s / steps;
            if (this._pointBlocked2D(x1 + dx * t, z1 + dz * t, boxes, radius)) {
                return true;
            }
        }
        return false;
    }

    _pushOutOfObstacles(pos, boxes, radius = 0.28) {
        for (let iter = 0; iter < 2; iter++) {
            for (let i = 0; i < boxes.length; i++) {
                const b = boxes[i];
                const closestX = Math.max(b.minX, Math.min(pos.x, b.maxX));
                const closestZ = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
                const dx = pos.x - closestX;
                const dz = pos.z - closestZ;
                const distSq = dx * dx + dz * dz;
                if (distSq < radius * radius) {
                    if (distSq > 0.00001) {
                        const d = Math.sqrt(distSq);
                        const push = radius - d;
                        pos.x += (dx / d) * push;
                        pos.z += (dz / d) * push;
                    } else {
                        const dl = Math.abs(pos.x - b.minX);
                        const dr = Math.abs(b.maxX - pos.x);
                        const dt = Math.abs(pos.z - b.minZ);
                        const db = Math.abs(b.maxZ - pos.z);
                        const m = Math.min(dl, dr, dt, db);
                        if (m === dl) pos.x = b.minX - radius;
                        else if (m === dr) pos.x = b.maxX + radius;
                        else if (m === dt) pos.z = b.minZ - radius;
                        else pos.z = b.maxZ + radius;
                    }
                }
            }
        }
    }

    _findApartmentNextWaypoint(fromX, fromZ, toX, toZ, boxes) {
        if (!this._isSegmentBlocked2D(fromX, fromZ, toX, toZ, boxes, 0.22)) {
            return { x: toX, z: toZ };
        }

        const N = APARTMENT_NAVMESH.length;
        const START = N;
        const GOAL = N + 1;
        const V = N + 2;
        const idToIdx = new Map();
        for (let i = 0; i < N; i++) idToIdx.set(APARTMENT_NAVMESH[i].id, i);

        const coords = (i) => {
            if (i === START) return { x: fromX, z: fromZ };
            if (i === GOAL) return { x: toX, z: toZ };
            return APARTMENT_NAVMESH[i];
        };

        const adj = Array.from({ length: V }, () => []);
        for (let i = 0; i < N; i++) {
            const nu = APARTMENT_NAVMESH[i];
            for (const nid of nu.neighbors) {
                const v = idToIdx.get(nid);
                if (v === undefined) continue;
                const nv = APARTMENT_NAVMESH[v];
                const d = Math.hypot(nv.x - nu.x, nv.z - nu.z);
                adj[i].push([v, d]);
            }
            const ds = Math.hypot(nu.x - fromX, nu.z - fromZ);
            const blockedStart = this._isSegmentBlocked2D(fromX, fromZ, nu.x, nu.z, boxes, 0.20);
            if (!blockedStart || ds < 2.2) {
                adj[START].push([i, ds + (blockedStart ? 18 : 0)]);
            }
            const dg = Math.hypot(toX - nu.x, toZ - nu.z);
            const blockedGoal = this._isSegmentBlocked2D(nu.x, nu.z, toX, toZ, boxes, 0.20);
            if (!blockedGoal || dg < 2.2) {
                adj[i].push([GOAL, dg + (blockedGoal ? 18 : 0)]);
            }
        }

        const dist = new Array(V).fill(Infinity);
        const prev = new Array(V).fill(-1);
        const used = new Array(V).fill(false);
        dist[START] = 0;

        for (let iter = 0; iter < V; iter++) {
            let u = -1;
            for (let i = 0; i < V; i++) {
                if (!used[i] && (u === -1 || dist[i] < dist[u])) u = i;
            }
            if (u === -1 || dist[u] === Infinity || u === GOAL) break;
            used[u] = true;
            for (const [v, w] of adj[u]) {
                if (dist[u] + w < dist[v]) {
                    dist[v] = dist[u] + w;
                    prev[v] = u;
                }
            }
        }

        if (prev[GOAL] === -1) {
            return { x: toX, z: toZ };
        }

        const chain = [];
        let cur = GOAL;
        while (cur !== -1) {
            chain.push(cur);
            cur = prev[cur];
        }
        chain.reverse();

        if (chain.length <= 2) {
            return { x: toX, z: toZ };
        }

        let targetNodeIdx = chain[1];
        const firstPos = coords(targetNodeIdx);
        if (chain.length > 2 && Math.hypot(firstPos.x - fromX, firstPos.z - fromZ) < 0.42) {
            targetNodeIdx = chain[2];
        }
        const chosen = coords(targetNodeIdx);
        return { x: chosen.x, z: chosen.z };
    }

    _moveTowardWithAvoidance(targetPos, speed, deltaTime) {
        const pos = this.transform.position;
        this._openNearbyDoors();

        const boxes = this._getStaticObstacleAABBs(pos.y);
        let steerX = targetPos.x;
        let steerZ = targetPos.z;

        if (pos.y > -2.0 && targetPos.y > -2.0) {
            const wp = this._findApartmentNextWaypoint(pos.x, pos.z, targetPos.x, targetPos.z, boxes);
            steerX = wp.x;
            steerZ = wp.z;
        }

        const dx = steerX - pos.x;
        const dz = steerZ - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return 0;

        let baseAngle = Math.atan2(dx, dz);

        if (this._sidestepTimer > 0) {
            this._sidestepTimer -= deltaTime;
            baseAngle += this._sidestepSign * 1.15;
        }

        const radius = this._sidestepTimer > 0 ? 0.19 : 0.24;
        const angles = [0, 0.38, -0.38, 0.78, -0.78, 1.22, -1.22, 1.65, -1.65];
        const lookAhead = Math.min(0.75, Math.max(0.32, dist));
        let chosenAngle = baseAngle;
        let foundClear = false;

        for (let i = 0; i < angles.length; i++) {
            const ang = baseAngle + angles[i];
            const probeX = pos.x + Math.sin(ang) * lookAhead;
            const probeZ = pos.z + Math.cos(ang) * lookAhead;
            if (!this._isSegmentBlocked2D(pos.x, pos.z, probeX, probeZ, boxes, radius)) {
                chosenAngle = ang;
                foundClear = true;
                break;
            }
        }

        if (!foundClear) {
            chosenAngle = baseAngle + this._sidestepSign * 1.45;
        }

        const prevX = pos.x;
        const prevZ = pos.z;
        const step = Math.min(dist, speed * deltaTime);
        pos.x += Math.sin(chosenAngle) * step;
        pos.z += Math.cos(chosenAngle) * step;

        this._pushOutOfObstacles(pos, boxes, radius);

        const actualStep = Math.hypot(pos.x - prevX, pos.z - prevZ);
        const movedSinceCheck = Math.hypot(pos.x - this._lastProgressPos.x, pos.z - this._lastProgressPos.z);
        if (movedSinceCheck > 0.14) {
            this._lastProgressPos.copy(pos);
            this._stuckTimer = 0;
        } else {
            this._stuckTimer += deltaTime;
            if (this._stuckTimer > 0.42) {
                this._stuckTimer = 0;
                this._sidestepTimer = 0.40;
                this._sidestepSign *= -1;
                if (this.state === 'patrol' && this._wpIndex < this._patrolWaypoints.length - 1) {
                    this._wpIndex++;
                }
            }
        }

        let rotDiff = chosenAngle - this.transform.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        this.transform.rotation.y += rotDiff * Math.min(1, deltaTime * 12);

        return actualStep / Math.max(deltaTime, 0.0001);
    }

    update(deltaTime) {
        const pos = this.transform.position;
        this.stateTimer += deltaTime;

        if (this.state === 'courtyard_sprint') {
            if (this._sprintPhase === 'fall') {
                const duration = 0.82;
                const t = Math.min(1, this.stateTimer / duration);
                const yArc = THREE.MathUtils.lerp(0.85, -6.5, t * t) + Math.sin(t * Math.PI) * 0.45;
                pos.set(-1.0, yArc, THREE.MathUtils.lerp(-24.15, -21.2, t));
                this.transform.rotation.set(0, 0, 0);
                this._animateLimbs(deltaTime, 6.0, 'sprint');

                if (t >= 1) {
                    this._sprintPhase = 'run';
                    this.stateTimer = 0;
                    pos.set(-1.0, -6.5, -21.2);
                    this.engine.audioSystem.playSpatialOneShot('footstep_snow', pos, { heavy: true, volume: 0.95, maxDistance: 45 });
                }
            } else if (this._sprintPhase === 'run') {
                const target = new THREE.Vector3(3.1, -6.5, -4.5);
                const dist = Math.hypot(target.x - pos.x, target.z - pos.z);
                if (dist > 0.65) {
                    const actualSpeed = this._moveTowardWithAvoidance(target, 7.6, deltaTime);
                    this._animateLimbs(deltaTime, actualSpeed, 'sprint');
                    this._stepAccum += deltaTime;
                    if (this._stepAccum > 0.22) {
                        this._stepAccum = 0;
                        this.engine.audioSystem.playSpatialOneShot('footstep_snow', pos, { heavy: true, volume: 0.78, maxDistance: 45 });
                    }
                } else {
                    pos.set(3.2, -4.0, 6.2);
                    this.state = 'assault';
                }
            }
        } else if (this.state === 'patrol') {
            if (this._wreckAction) {
                const act = this._wreckAction;
                act.timer += deltaTime;
                const p = act.timer / act.duration;

                if (act.targetPos) {
                    const ang = Math.atan2(act.targetPos.x - pos.x, act.targetPos.z - pos.z);
                    this.transform.rotation.y = ang;
                }

                if (act.type === 'mistletoe') {
                    this._animateLimbs(deltaTime, 0, 'wreck_stomp');
                    if (!act.swiped && p >= 0.35) {
                        act.swiped = true;
                        if (this.world.mistletoe?.hanging) this.world.mistletoe.hanging.visible = false;
                        this.engine.audioSystem.playSpatialOneShot('knife_drag', pos, { volume: 1.0, refDistance: 2.8, maxDistance: 24 });
                    }
                    if (!act.stomped && p >= 0.72) {
                        act.stomped = true;
                        if (this.world.mistletoe?.trampled) this.world.mistletoe.trampled.visible = true;
                        this.engine.audioSystem.playSpatialOneShot('footstep_parquet', pos, { heavy: true, volume: 1.35, refDistance: 3.0, maxDistance: 26 });
                    }
                } else if (act.type === 'garland') {
                    this._animateLimbs(deltaTime, 0, 'wreck_rip');
                    if (!act.ripped && p >= 0.4) {
                        act.ripped = true;
                        this.world.garlandOn = false;
                        this.world.garlandLights?.forEach(l => { l.intensity = 0; });
                        if (this.world.treeGarlandGroup) this.world.treeGarlandGroup.visible = false;
                        if (this.world.tornGarland) this.world.tornGarland.visible = true;
                        this.engine.audioSystem.playSpatialOneShot('knife_drag', pos, { volume: 1.15, refDistance: 3.0, maxDistance: 26 });
                    }
                    if (p >= 0.55 && this.world.treeGO) {
                        const fallT = Math.min(1, (p - 0.55) / 0.45);
                        const tp = this.world.destroyedPoses?.tree;
                        const tx = tp ? tp.position.x : -2.15;
                        const ty = tp ? tp.position.y : 0.35;
                        const tz = tp ? tp.position.z : 0.45;
                        const rx = tp ? tp.rotation.x : 0.25;
                        const ry = tp ? tp.rotation.y : 0.6;
                        const rz = tp ? tp.rotation.z : -1.42;
                        const initPos = this.world.treeInitialPos || new THREE.Vector3(-2.75, 0, 0.85);
                        this.world.treeGO.transform.position.set(
                            THREE.MathUtils.lerp(initPos.x, tx, fallT),
                            THREE.MathUtils.lerp(initPos.y, ty, fallT),
                            THREE.MathUtils.lerp(initPos.z, tz, fallT)
                        );
                        this.world.treeGO.transform.rotation.set(rx * fallT, ry * fallT, rz * fallT);
                    }
                    if (!act.crashed && p >= 0.92) {
                        act.crashed = true;
                        if (this.world.fallenSantaHat) this.world.fallenSantaHat.visible = true;
                        if (this.world.fallenMirror) this.world.fallenMirror.visible = true;
                        this.engine.audioSystem.playSpatialOneShot('door_crash', pos, { volume: 1.15, refDistance: 3.0, maxDistance: 28 });
                        this.engine.renderer.triggerGlitch(0.65);
                    }
                } else if (act.type === 'table') {
                    this._animateLimbs(deltaTime, 0, 'wreck_smash');
                    if (!act.smashed && p >= 0.62) {
                        act.smashed = true;
                        if (this.world.table) {
                            this.world.table.go.transform.visible = false;
                            this.world.table.wreckedGO.transform.visible = true;
                        }
                        this.engine.audioSystem.playSpatialOneShot('door_crash', pos, { volume: 1.2, refDistance: 3.0, maxDistance: 28 });
                        this.engine.renderer.triggerGlitch(0.75);
                    }
                }

                if (act.timer >= act.duration) {
                    this._wreckAction = null;
                    this._resetPose();
                }
                this.engine.audioSystem.updateLoopPosition('monster_breath', pos);
                return;
            }

            if (!this._wreckDone.mistletoe && Math.hypot(pos.x - 1.98, pos.z - 0.68) < 1.35) {
                this._wreckDone.mistletoe = true;
                this._wreckAction = { type: 'mistletoe', timer: 0, duration: 1.15, targetPos: new THREE.Vector3(1.98, 0, 0.68) };
                return;
            }
            if (!this._wreckDone.garland && this.world.treeGO) {
                const tp = this.world.treeGO.transform.position;
                if (Math.hypot(pos.x - tp.x, pos.z - tp.z) < 2.05) {
                    this._wreckDone.garland = true;
                    this._wreckAction = { type: 'garland', timer: 0, duration: 1.35, targetPos: tp.clone() };
                    return;
                }
            }
            if (!this._wreckDone.table && this.world.table?.go?.transform.visible) {
                const tb = this.world.table.go.transform.position;
                if (Math.hypot(pos.x - tb.x, pos.z - tb.z) < 2.05) {
                    this._wreckDone.table = true;
                    this._wreckAction = { type: 'table', timer: 0, duration: 0.95, targetPos: tb.clone() };
                    return;
                }
            }

            const pPos = this.player.transform.position;
            const playerLockedOnBalcony = !this.player.isHidden
                && pPos.z < -3.55
                && this.world.doors?.balcony
                && !this.world.doors.balcony.isOpen();
            const allWrecked = this._wreckDone.mistletoe && this._wreckDone.garland && this._wreckDone.table;

            if (playerLockedOnBalcony && allWrecked && !this._wreckAction) {
                const balcDoorTarget = new THREE.Vector3(0.85, 0, -2.85);
                if (!this._balconyState) this._balconyState = 'approaching';

                if (this._balconyState === 'approaching') {
                    const bDist = Math.hypot(balcDoorTarget.x - pos.x, balcDoorTarget.z - pos.z);
                    if (bDist > 0.35) {
                        const actualSpeed = this._moveTowardWithAvoidance(balcDoorTarget, 2.05, deltaTime);
                        this._animateLimbs(deltaTime, actualSpeed, 'walk');
                    } else {
                        this._balconyState = 'sniffing';
                        this._balconyTimer = 0;
                        this.transform.rotation.y = Math.PI;
                        this.engine.audioSystem.playSpatialOneShot('sniff', new THREE.Vector3(0.85, 1.3, -3.3), {
                            volume: 1.15,
                            refDistance: 3.0
                        });
                    }
                } else if (this._balconyState === 'sniffing') {
                    this._balconyTimer += deltaTime;
                    this.transform.rotation.y = Math.PI;
                    this._animateLimbs(deltaTime, 0, 'idle');
                    if (this._balconyTimer >= 1.8) {
                        this._balconyState = 'pounding';
                        this._balconyTimer = 1.05;
                        this._balconyHits = 0;
                        this._balconyMaxHits = 4 + Math.floor(Math.random() * 4);
                    }
                } else if (this._balconyState === 'pounding') {
                    this._balconyTimer += deltaTime;
                    this.transform.rotation.y = Math.PI;
                    this._animateLimbs(deltaTime, 0, 'wreck_smash');
                    if (this._balconyTimer >= 1.35) {
                        this._balconyTimer = 0;
                        this._balconyHits++;
                        const dPos = new THREE.Vector3(0.85, 1.2, -3.45);
                        this.engine.audioSystem.playSpatialOneShot('door_pound', dPos, {
                            bufferKey: 'door_bang',
                            volume: 1.25,
                            playbackRate: 0.78 + Math.random() * 0.14
                        });
                        if (this._balconyHits % 2 === 1 || this._balconyHits === this._balconyMaxHits) {
                            this.engine.audioSystem.playSpatialOneShot('monster_roar', dPos, { volume: 0.45, maxDistance: 24 });
                        }
                        this.engine.renderer.triggerGlitch(0.45);
                        if (this._balconyHits >= this._balconyMaxHits) {
                            this._balconyState = 'done';
                            this.balconyAssaultDone = true;
                        }
                    }
                } else {
                    this._animateLimbs(deltaTime, 0, 'idle');
                }
            } else {
                const target = this._patrolWaypoints[this._wpIndex];
                const dist = Math.hypot(target.x - pos.x, target.z - pos.z);

                if (dist < 0.36) {
                    this._wpIndex++;
                    if (this._wpIndex >= this._patrolWaypoints.length) {
                        this.triggerTrapWait();
                        return;
                    }
                } else {
                    const actualSpeed = this._moveTowardWithAvoidance(target, 1.75, deltaTime);
                    this._animateLimbs(deltaTime, actualSpeed, 'walk');
                }
            }

            this.engine.audioSystem.updateLoopPosition('monster_breath', pos);

            this._stepAccum += deltaTime;
            if (this._stepAccum > 0.46) {
                this._stepAccum = 0;
                const sfx = pos.x < 2.0 && pos.z < 1.5 ? 'footstep_parquet' : 'footstep_linoleum';
                this.engine.audioSystem.playSpatialOneShot(sfx, pos, {
                    heavy: true,
                    volume: 1.2,
                    refDistance: 2.8,
                    maxDistance: 24
                });
            }

            this._knifeDragAccum += deltaTime;
            if (this._knifeDragAccum > 1.25) {
                this._knifeDragAccum = 0;
                this.engine.audioSystem.playSpatialOneShot('knife_drag', pos, {
                    volume: 0.95,
                    refDistance: 2.6,
                    maxDistance: 22
                });
            }

            const playerDist = pos.distanceTo(pPos);
            this.engine.renderer.setPostProcessParams({
                panic: playerDist < 5.5 ? Math.min(1, (5.5 - playerDist) / 4.5) : 0.15,
                aberration: playerDist < 5.0 ? 0.0065 : 0.003
            });

            if (!this.player.isHidden && !playerLockedOnBalcony && playerDist < 4.4) {
                this.startChasePlayer('seen_open');
                return;
            }

            if (this.player.isHidden && this.player.currentHidingSpot) {
                const spot = this.player.currentHidingSpot;
                if (!spot.isDoorClosed() && playerDist < 3.6) {
                    this.startChasePlayer('door_open');
                    return;
                }
            }
        } else if (this.state === 'moving_to_trap') {
            const dist = Math.hypot(this._trapTarget.x - pos.x, this._trapTarget.z - pos.z);
            if (dist < 0.24) {
                this._enterTrapState();
                return;
            }
            const actualSpeed = this._moveTowardWithAvoidance(this._trapTarget, 1.85, deltaTime);
            this._animateLimbs(deltaTime, actualSpeed, 'walk');
            this.engine.audioSystem.updateLoopPosition('monster_breath', pos);

            this._stepAccum += deltaTime;
            if (this._stepAccum > 0.46) {
                this._stepAccum = 0;
                const sfx = pos.x < 2.0 && pos.z < 1.5 ? 'footstep_parquet' : 'footstep_linoleum';
                this.engine.audioSystem.playSpatialOneShot(sfx, pos, {
                    heavy: true,
                    volume: 1.15,
                    refDistance: 2.8,
                    maxDistance: 24
                });
            }
        } else if (this.state === 'trap') {
            this.trapElapsed += deltaTime;
            this._animateLimbs(deltaTime, 0, 'idle');
            if (!this.player.isHidden && this.trapElapsed < this.trapDuration) {
                this.startChasePlayer('trap_ambush');
                return;
            }
            if (this.trapElapsed >= this.trapDuration) {
                this.state = 'leaving';
                this.stateTimer = 0;
                this.engine.audioSystem.playSpatialOneShot('creak', new THREE.Vector3(3.6, 0, 4.1), {
                    volume: 1.05,
                    refDistance: 2.5
                });
                if (this._onTrapLeft) this._onTrapLeft();
            }
        } else if (this.state === 'chase') {
            this._chaseTimer += deltaTime;
            const pPos = this.player.transform.position;
            let goalPos = pPos;
            if (this.player.isHidden && this.player.currentHidingSpot) {
                goalPos = this.player.currentHidingSpot.peekPos || this.player.currentHidingSpot.hidePos;
            }

            const dist = Math.hypot(goalPos.x - pos.x, goalPos.z - pos.z);

            if (dist < 3.4) {
                this.player.forcedLookTarget = new THREE.Vector3(pos.x, 1.56, pos.z);
            }

            if (this.player.isHidden && dist < 1.35 && this.player.currentHidingSpot) {
                this.player.currentHidingSpot.setDoorClosed(false);
                this.player.exitHidingSpot();
            }

            if (dist < 0.95 || this._chaseTimer > 6.5) {
                this._executeFinalStrike(this._chaseReason);
                return;
            }

            const chaseSpeed = 4.95;
            const actualSpeed = this._moveTowardWithAvoidance(goalPos, chaseSpeed, deltaTime);
            this._animateLimbs(deltaTime, Math.max(actualSpeed, chaseSpeed * 0.8), 'chase');

            this._stepAccum += deltaTime;
            if (this._stepAccum > 0.21) {
                this._stepAccum = 0;
                const sfx = pos.x < 2.0 && pos.z < 1.5 ? 'footstep_parquet' : 'footstep_linoleum';
                this.engine.audioSystem.playSpatialOneShot(sfx, pos, {
                    heavy: true,
                    volume: 1.3,
                    refDistance: 3.0,
                    maxDistance: 26
                });
            }
        } else if (this.state === 'leaving') {
            if (this.stateTimer < 4.5) {
                const exitTarget = new THREE.Vector3(3.2, -this.stateTimer * 0.9, 5.2 + this.stateTimer * 0.45);
                const prevX = pos.x;
                const prevZ = pos.z;
                pos.y = THREE.MathUtils.lerp(pos.y, exitTarget.y, Math.min(1, deltaTime * 4));
                pos.x = THREE.MathUtils.lerp(pos.x, exitTarget.x, Math.min(1, deltaTime * 3));
                pos.z = THREE.MathUtils.lerp(pos.z, exitTarget.z, Math.min(1, deltaTime * 3));
                const speed = Math.hypot(pos.x - prevX, pos.z - prevZ) / Math.max(deltaTime, 0.001);
                this._animateLimbs(deltaTime, Math.max(speed, 1.2), 'walk');

                this._stepAccum += deltaTime;
                if (this._stepAccum > 0.72) {
                    this._stepAccum = 0;
                    this.engine.audioSystem.playSpatialOneShot('footstep_concrete', pos, { heavy: true, volume: Math.max(0.15, 0.7 - this.stateTimer * 0.1) });
                }
            } else {
                this.engine.audioSystem.playSpatialOneShot('door_pound', new THREE.Vector3(3.2, -6, 6.5), { volume: 0.85, maxDistance: 35 });
                this.state = 'gone';
                pos.set(0, -50, 0);
            }
        } else if (this.state === 'midnight_standoff') {
            this.transform.lookAt(this.player.transform.position.x, 0, this.player.transform.position.z);
            const liftT = Math.min(1, this.stateTimer / 5.2);
            const smoothLift = liftT * liftT * (3 - 2 * liftT);
            this.rightArm.rotation.x = -2.15 * smoothLift;
            this.leftArm.rotation.x = -0.18 * smoothLift;
            this.headGroup.rotation.z = Math.sin(this.stateTimer * 2.2) * 0.05;
        } else if (this.state === 'midnight_retreat') {
            if (this.stateTimer < 0.55) {
                const turnT = Math.min(1, this.stateTimer / 0.55);
                const ease = turnT * turnT * (3 - 2 * turnT);
                this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, Math.min(1, deltaTime * 8));
                let dy = 0 - this._retreatStartYaw;
                while (dy > Math.PI) dy -= Math.PI * 2;
                while (dy < -Math.PI) dy += Math.PI * 2;
                this.transform.rotation.y = this._retreatStartYaw + dy * ease;
            } else if (this.stateTimer < 2.0) {
                const runT = Math.min(1, (this.stateTimer - 0.55) / 1.45);
                pos.x = THREE.MathUtils.lerp(this._retreatStartPos.x, 3.08, runT);
                pos.y = 0;
                pos.z = THREE.MathUtils.lerp(this._retreatStartPos.z, 5.1, runT);
                this.transform.lookAt(3.08, 0, 6.5);
                this._animateLimbs(deltaTime, 3.8, 'sprint');
                this._stepAccum += deltaTime;
                if (this._stepAccum > 0.34) {
                    this._stepAccum = 0;
                    this.engine.audioSystem.playSpatialOneShot('footstep_concrete', pos, { heavy: true, volume: 0.55 });
                }
            } else if (this.stateTimer < 11.8) {
                if (!this._retreatInCourtyard) {
                    this._retreatInCourtyard = true;
                    this._stepAccum = 0;
                    this.rightArm.rotation.x = 0;
                }
                const fleeT = Math.min(1, (this.stateTimer - 2.0) / 9.8);
                pos.x = THREE.MathUtils.lerp(2.8, -2.5, fleeT);
                pos.y = -6.12;
                pos.z = THREE.MathUtils.lerp(-5.2, -39.0, fleeT);
                this.transform.lookAt(-2.5, -6.12, -45.0);
                this._animateLimbs(deltaTime, 4.1, 'sprint');
                this._stepAccum += deltaTime;
                if (this._stepAccum > 0.42) {
                    this._stepAccum = 0;
                    this.engine.audioSystem.playSpatialOneShot('footstep_snow', pos, { volume: Math.max(0.08, 0.35 * (1 - fleeT)) });
                }
            } else {
                this.state = 'gone';
                pos.set(0, -50, 0);
            }
        } else if (this.state === 'jumpscare') {
            this.bodyGroup.position.x = (Math.random() - 0.5) * 0.08;
            this.bodyGroup.position.y = (Math.random() - 0.5) * 0.08;
            this.rightArm.rotation.x = -0.6 - Math.abs(Math.sin(this.stateTimer * 18)) * 1.7;
        }
    }
}

export default MonsterAI;
