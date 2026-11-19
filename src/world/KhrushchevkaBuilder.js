import * as THREE from 'three';
import {
    GameObject,
    BoxCollider,
    RigidBody,
    Interactable,
    GazeTrigger,
    ParticleEmitter,
    applyPS1Material,
    configurePS1Texture
} from '../../lumina/index.js';
import { TextureManager } from './TextureManager.js';
import { CRTTelevision, NeighborWindowCanvas } from './CRTTelevision.js';
import { getEffectiveMapOverrides } from './MapOverrides.js';
import { t } from '../i18n/Localization.js';

export class KhrushchevkaBuilder {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.renderer.scene;
        this.tex = new TextureManager();
        this.blockerMeshes = [];
        this.materials = {};
        this._currentCategory = 'structure';
        this._currentGroupId = null;
        this.editableObjects = [];
        this.editableLights = [];
        this._editableByName = new Map();
        this._lightByKey = new Map();
        this._doorConfigs = new Map();
        this.world = {
            lights: {},
            roomLights: {},
            lightSwitches: [],
            hidingSpots: [],
            itemsOnTable: {},
            inspectionTargets: {},
            garlandBulbs: [],
            garlandLights: [],
            garlandOn: false,
            powerOut: false,
            doors: {},
            interiorDoors: [],
            animatedDoors: [],
            updateDoors: (dt) => {
                const k = Math.min(1, dt * 7.5);
                for (const d of this.world.animatedDoors) {
                    const target = d.getTarget();
                    const cur = d.pivot.transform.rotation[d.axis];
                    if (Math.abs(target - cur) > 0.001) {
                        d.pivot.transform.rotation[d.axis] = THREE.MathUtils.lerp(cur, target, k);
                    } else {
                        d.pivot.transform.rotation[d.axis] = target;
                    }
                }
            },
            builder: this,
            playerSpawn: {
                position: new THREE.Vector3(-2.65, 0.05, -1.0),
                yaw: -Math.PI / 2,
                pitch: -0.05
            },
            patrolWaypoints: [
                new THREE.Vector3(3.10, 0, 3.20),
                new THREE.Vector3(2.95, 0, 0.68),
                new THREE.Vector3(1.10, 0, 0.45),
                new THREE.Vector3(0.45, 0, -1.55),
                new THREE.Vector3(-0.35, 0, -2.35),
                new THREE.Vector3(-0.35, 0, 0.45),
                new THREE.Vector3(1.10, 0, 0.45),
                new THREE.Vector3(2.90, 0, -1.45),
                new THREE.Vector3(3.10, 0, 2.50),
                new THREE.Vector3(4.60, 0, 2.55),
                new THREE.Vector3(3.10, 0, 3.55)
            ],
            destroyedPoses: {
                frontDoor: {
                    position: new THREE.Vector3(3.05, 0.08, 3.35),
                    rotation: new THREE.Euler(Math.PI / 2, 0, 0.12)
                },
                tree: {
                    position: new THREE.Vector3(-2.15, 0.35, 0.45),
                    rotation: new THREE.Euler(0.25, 0.6, -1.42)
                }
            }
        };
    }

    _ps1Mat(opts = {}) {
        const mat = new THREE.MeshStandardMaterial({
            color: opts.color !== undefined ? opts.color : 0xffffff,
            map: opts.map || null,
            roughness: opts.roughness ?? 0.9,
            metalness: opts.metalness ?? 0.05,
            emissive: opts.emissive ?? 0x000000,
            emissiveIntensity: opts.emissiveIntensity ?? 1.0,
            transparent: !!opts.transparent,
            opacity: opts.opacity ?? 1.0,
            depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : true,
            side: opts.side !== undefined ? opts.side : (opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide)
        });
        return applyPS1Material(mat, { snap: opts.snap !== false });
    }

    _registerEditable(target, name, options = {}) {
        if (!target) return target;
        target.name = name;
        const pos = target.position;
        const rot = target.rotation;
        const scl = target.scale;
        const existing = target.userData || {};
        const extra = options.extra || {};
        const prim = extra.primaryMesh || existing.primaryMesh || (target.isMesh ? target : null);

        let inferredShape = extra.shape ?? existing.shape ?? null;
        let inferredBoxSize = extra.boxSize ?? existing.boxSize ?? null;
        let radialSegs = extra.radialSegs ?? existing.radialSegs ?? null;
        if (prim?.geometry?.parameters && !inferredBoxSize) {
            const gType = prim.geometry.type;
            const p = prim.geometry.parameters;
            if (gType === 'BoxGeometry') {
                inferredShape = inferredShape || 'box';
                inferredBoxSize = [p.width ?? 1, p.height ?? 1, p.depth ?? 1];
            } else if (gType === 'CylinderGeometry') {
                inferredShape = inferredShape || 'cylinder';
                inferredBoxSize = [(p.radiusTop ?? 0.5) * 2, p.height ?? 1, (p.radiusBottom ?? 0.5) * 2];
                radialSegs = p.radialSegments ?? 8;
            } else if (gType === 'SphereGeometry') {
                inferredShape = inferredShape || 'sphere';
                const d = (p.radius ?? 0.5) * 2;
                inferredBoxSize = [d, d, d];
            } else if (gType === 'PlaneGeometry') {
                inferredShape = inferredShape || 'plane';
                inferredBoxSize = [p.width ?? 1, p.height ?? 1, 0.05];
            }
        }

        const isSinglePrimitive = !!(
            prim && inferredBoxSize &&
            (target === prim || (target.children.length === 1 && target.children[0] === prim &&
                prim.position.lengthSq() < 1e-6 && prim.rotation.x === 0 && prim.rotation.y === 0 && prim.rotation.z === 0))
        );

        target.userData = {
            ...existing,
            isEditable: true,
            objectName: name,
            category: options.category ?? this._currentCategory ?? 'props',
            groupId: options.groupId !== undefined ? options.groupId : this._currentGroupId,
            activatedGroup: options.activatedGroup ?? existing.activatedGroup ?? null,
            defaultHidden: options.defaultHidden ?? existing.defaultHidden ?? (target.visible === false),
            shape: inferredShape,
            boxSize: inferredBoxSize ? [...inferredBoxSize] : undefined,
            initialBoxSize: existing.initialBoxSize || extra.initialBoxSize || (inferredBoxSize ? [...inferredBoxSize] : undefined),
            radialSegs,
            isSinglePrimitive,
            initialTransform: existing.initialTransform || {
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z],
                scale: [scl.x, scl.y, scl.z],
                visible: target.visible !== false
            },
            ...extra
        };
        if (!this._editableByName.has(name)) {
            this._editableByName.set(name, target);
            this.editableObjects.push(target);
        }
        return target;
    }

    _registerLight(light, key, label, roomId = null, isAdded = false) {
        if (!light) return light;
        light.name = key;
        const p = light.position;
        light.userData = {
            ...(light.userData || {}),
            isEditableLight: true,
            isAddedLight: isAdded,
            lightKey: key,
            label: label || key,
            roomId,
            initialLight: {
                position: [p.x, p.y, p.z],
                color: light.color ? light.color.getHex() : 0xffffff,
                intensity: light.intensity,
                distance: light.distance ?? 0,
                decay: light.decay ?? 1,
                visible: light.visible !== false
            }
        };
        if (!this._lightByKey.has(key)) {
            this._lightByKey.set(key, light);
            this.editableLights.push(light);
        }
        return light;
    }

    _applyWorldSpaceBoxUVs(geo, w, h, d, ox = 0, oy = 0, oz = 0, mat = null) {
        const matKey = mat?.userData?.materialKey || '';
        if (matKey === 'carpet' || matKey === 'clockDial' || matKey === 'bloodClaw' || matKey === 'glass' || matKey === 'mirror' || matKey === 'wineLabel') {
            return;
        }
        const tileScaleMap = {
            tiles: 0.75,
            parquet: 1.15,
            linoleum: 1.15,
            wallpaperHall: 1.25,
            wallpaperKitchen: 1.25,
            stairwellWall: 2.68,
            concrete: 1.6,
            panel: 2.2,
            snow: 2.0,
            woodDark: 0.85,
            woodFrame: 0.85,
            sofaFabric: 0.55,
            tablecloth: 0.65,
            dermantine: 1.1,
            pine: 0.6
        };
        const tileSize = tileScaleMap[matKey] || 1.25;
        const pos = geo.attributes.position;
        const norm = geo.attributes.normal;
        const uv = geo.attributes.uv;
        if (!pos || !norm || !uv) return;

        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i) + ox;
            const vy = pos.getY(i) + oy;
            const vz = pos.getZ(i) + oz;
            const nx = Math.abs(norm.getX(i));
            const ny = Math.abs(norm.getY(i));
            const nz = Math.abs(norm.getZ(i));

            if (matKey === 'stairwellWall') {
                // Keep vertical two-tone wall split aligned from floor to ceiling, tile horizontally
                const uCoord = nx > 0.5 ? vz : vx;
                const vNorm = (pos.getY(i) / Math.max(0.01, h)) + 0.5;
                uv.setXY(i, uCoord / 1.8, vNorm);
            } else if (ny > nx && ny > nz) {
                uv.setXY(i, vx / tileSize, vz / tileSize);
            } else if (nx > nz) {
                uv.setXY(i, vz / tileSize, vy / tileSize);
            } else {
                uv.setXY(i, vx / tileSize, vy / tileSize);
            }
        }
        uv.needsUpdate = true;
    }

    _addStaticBox(name, x, y, z, w, h, d, mat, options = {}) {
        const go = new GameObject(name);
        const wSegs = options.wSegs ?? Math.min(8, Math.max(1, Math.round(w / 0.75)));
        const hSegs = options.hSegs ?? Math.min(6, Math.max(1, Math.round(h / 0.75)));
        const dSegs = options.dSegs ?? Math.min(8, Math.max(1, Math.round(d / 0.75)));
        const geo = new THREE.BoxGeometry(w, h, d, wSegs, hSegs, dSegs);
        if (options.worldUV !== false) {
            this._applyWorldSpaceBoxUVs(geo, w, h, d, x, y, z, mat);
        }
        const mesh = new THREE.Mesh(geo, mat);
        const castShadow = options.castShadow !== false;
        mesh.receiveShadow = options.receiveShadow !== false;
        mesh.castShadow = castShadow;
        go.transform.add(mesh);
        go.transform.position.set(x, y, z);

        const hasCollide = options.collide !== false;
        const hasBlocker = options.blocker !== false;

        if (hasCollide) {
            go.addComponent(BoxCollider, new THREE.Vector3(w, h, d));
            go.addComponent(RigidBody, { bodyType: 'static' });
        }
        if (hasBlocker) {
            this.blockerMeshes.push(mesh);
        }
        this.engine.addGameObject(go);

        const materialKey = options.materialKey || mat?.userData?.materialKey || 'custom';
        this._registerEditable(go.transform, name, {
            category: options.category,
            groupId: options.groupId,
            extra: {
                isStaticBox: true,
                shape: 'box',
                boxSize: [w, h, d],
                initialBoxSize: [w, h, d],
                wSegs,
                hSegs,
                dSegs,
                materialKey,
                initialMaterialKey: materialKey,
                collide: hasCollide,
                initialCollide: hasCollide,
                blocker: hasBlocker,
                initialBlocker: hasBlocker,
                castShadow,
                receiveShadow: options.receiveShadow !== false,
                gameObject: go,
                primaryMesh: mesh
            }
        });
        return { go, mesh };
    }

    _addWallSegment(name, x1, z1, x2, z2, yBottom, yTop, mat, thickness = 0.18) {
        const cx = (x1 + x2) * 0.5;
        const cz = (z1 + z2) * 0.5;
        const cy = (yBottom + yTop) * 0.5;
        const dx = Math.abs(x2 - x1);
        const dz = Math.abs(z2 - z1);
        const w = dx > dz ? dx : thickness;
        const d = dz > dx ? dz : thickness;
        const h = yTop - yBottom;
        return this._addStaticBox(name, cx, cy, cz, w, h, d, mat, { castShadow: true });
    }

    build() {
        this._initMaterials();
        this._buildLighting();
        this._buildApartmentStructure();
        this._buildHallFurniture();
        this._buildKitchenFurniture();
        this._buildHallwayPantryBathroom();
        this._buildLightSwitchesAndFixtures();
        this._buildBalcony();
        this._buildApartmentDecorations();
        this._buildCourtyardAndOppositeHouse();
        this._buildParticles();
        this._autoRegisterChildParts();

        this.applyMapOverrides(getEffectiveMapOverrides());
        this._enableAllObjectShadows();

        this.engine.interactionSystem.setBlockerMeshes(this.blockerMeshes);
        this.engine.audioSystem.setOcclusionMeshes(this.blockerMeshes);
        this.world.setApartmentDestroyedState = () => this.setApartmentDestroyedState();
        return this.world;
    }

    _autoRegisterChildParts() {
        const topObjects = [...this.editableObjects];
        for (const root of topObjects) {
            if (!root || root.isMesh || root.userData?.isSinglePrimitive) continue;
            const meshChildren = [];
            for (const ch of root.children) {
                if (ch.userData?.isEditable) continue;
                if (ch.isMesh || ch.children?.length > 0) {
                    meshChildren.push(ch);
                }
            }
            if (meshChildren.length <= 1) continue;
            meshChildren.forEach((ch, idx) => {
                const subName = `${root.name}__Part_${idx + 1}`;
                if (this._editableByName.has(subName)) return;
                let prim = ch.isMesh ? ch : null;
                if (!prim) ch.traverse(c => { if (!prim && c.isMesh) prim = c; });
                const matKey = prim?.material?.userData?.materialKey || root.userData?.materialKey || 'custom';
                this._registerEditable(ch, subName, {
                    category: root.userData?.category || 'props',
                    groupId: root.userData?.groupId || null,
                    activatedGroup: root.userData?.activatedGroup || null,
                    defaultHidden: root.userData?.defaultHidden || false,
                    extra: {
                        isSceneProp: true,
                        isSubPart: true,
                        parentEditableName: root.name,
                        parentActivatedObj: root,
                        primaryMesh: prim,
                        materialKey: matKey
                    }
                });
            });
        }
    }

    _enableAllObjectShadows() {
        const isOpaqueMesh = (mesh) => {
            if (!mesh.isMesh || mesh.userData?.isPlanarMirror) return false;
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            return !(mat && mat.transparent && (mat.opacity ?? 1) < 0.99);
        };
        this.scene.traverse((obj) => {
            if (isOpaqueMesh(obj)) {
                obj.castShadow = true;
            }
            if (obj.userData && 'castShadow' in obj.userData) {
                let hasOpaque = isOpaqueMesh(obj);
                if (!hasOpaque) {
                    obj.traverse((c) => { if (isOpaqueMesh(c)) hasOpaque = true; });
                }
                if (hasOpaque) obj.userData.castShadow = true;
            }
        });
    }

    _createPlanarReflector(width, height, options = {}) {
        const renderTarget = new THREE.WebGLRenderTarget(512, 512, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            type: THREE.UnsignedByteType
        });
        renderTarget.texture.generateMipmaps = false;
        const virtualCamera = new THREE.PerspectiveCamera();
        virtualCamera.userData.isMirrorCamera = true;
        const textureMatrix = new THREE.Matrix4();

        const mirrorMat = new THREE.ShaderMaterial({
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            uniforms: {
                tDiffuse: { value: renderTarget.texture },
                textureMatrix: { value: textureMatrix },
                tintColor: { value: new THREE.Color(options.tintColor ?? 0xe8f0f6) },
                reflectivity: { value: options.reflectivity ?? 0.94 }
            },
            vertexShader: `
                uniform mat4 textureMatrix;
                varying vec4 vUv;
                varying vec2 vLocalUv;
                void main() {
                    vLocalUv = uv;
                    vUv = textureMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec3 tintColor;
                uniform float reflectivity;
                varying vec4 vUv;
                varying vec2 vLocalUv;
                void main() {
                    vec4 refl = texture2DProj(tDiffuse, vUv);
                    vec3 col = mix(vec3(0.07, 0.09, 0.12), refl.rgb * tintColor, reflectivity);
                    float edge = min(min(vLocalUv.x, 1.0 - vLocalUv.x), min(vLocalUv.y, 1.0 - vLocalUv.y));
                    float bevel = smoothstep(0.0, 0.032, edge);
                    col = mix(col + vec3(0.14, 0.18, 0.22), col, bevel);
                    gl_FragColor = vec4(col, 1.0);
                }
            `
        });
        mirrorMat.userData = { materialKey: 'mirror' };

        const mirrorMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mirrorMat);
        mirrorMesh.castShadow = false;
        mirrorMesh.receiveShadow = false;
        mirrorMesh.userData.isPlanarMirror = true;

        const reflectorPlane = new THREE.Plane();
        const normal = new THREE.Vector3();
        const reflectorWorldPosition = new THREE.Vector3();
        const cameraWorldPosition = new THREE.Vector3();
        const rotationMatrix = new THREE.Matrix4();
        const lookAtPosition = new THREE.Vector3(0, 0, -1);
        const clipPlane = new THREE.Vector4();
        const view = new THREE.Vector3();
        const target = new THREE.Vector3();
        const q = new THREE.Vector4();

        mirrorMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!camera || camera.userData?.isMirrorCamera) return;
            if (this.engine?.renderer?.camera && camera !== this.engine.renderer.camera) return;

            reflectorWorldPosition.setFromMatrixPosition(mirrorMesh.matrixWorld);
            cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
            rotationMatrix.extractRotation(mirrorMesh.matrixWorld);
            normal.set(0, 0, 1).applyMatrix4(rotationMatrix);

            view.subVectors(reflectorWorldPosition, cameraWorldPosition);
            if (view.dot(normal) > 0) return; // Camera is behind the mirror plane
            if (view.lengthSq() > 95) return; // Skip when far away

            view.reflect(normal).negate();
            view.add(reflectorWorldPosition);

            rotationMatrix.extractRotation(camera.matrixWorld);
            lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
            target.subVectors(reflectorWorldPosition, lookAtPosition);
            target.reflect(normal).negate();
            target.add(reflectorWorldPosition);

            virtualCamera.position.copy(view);
            virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix);
            virtualCamera.up.reflect(normal);
            virtualCamera.lookAt(target);

            virtualCamera.far = camera.far;
            virtualCamera.near = camera.near;
            virtualCamera.updateMatrixWorld();
            virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

            textureMatrix.set(
                0.5, 0.0, 0.0, 0.5,
                0.0, 0.5, 0.0, 0.5,
                0.0, 0.0, 0.5, 0.5,
                0.0, 0.0, 0.0, 1.0
            );
            textureMatrix.multiply(virtualCamera.projectionMatrix);
            textureMatrix.multiply(virtualCamera.matrixWorldInverse);
            textureMatrix.multiply(mirrorMesh.matrixWorld);

            reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
            reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
            clipPlane.set(
                reflectorPlane.normal.x,
                reflectorPlane.normal.y,
                reflectorPlane.normal.z,
                reflectorPlane.constant
            );

            const projectionMatrix = virtualCamera.projectionMatrix;
            q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
            q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
            q.z = -1.0;
            q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
            clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
            projectionMatrix.elements[2] = clipPlane.x;
            projectionMatrix.elements[6] = clipPlane.y;
            projectionMatrix.elements[10] = clipPlane.z + 1.0 - 0.005;
            projectionMatrix.elements[14] = clipPlane.w;

            // engine.player is the player GameObject; the avatar & FP-arm toggle live on its PlayerController component
            const playerGO = this.engine?.player;
            const playerCtrl = playerGO?.setMirrorRenderMode
                ? playerGO
                : (playerGO?.components?.find(c => c && typeof c.setMirrorRenderMode === 'function') || null);
            if (playerCtrl) playerCtrl.setMirrorRenderMode(true);
            mirrorMesh.visible = false;

            const currentRenderTarget = renderer.getRenderTarget();
            const currentXrEnabled = renderer.xr.enabled;
            const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
            renderer.xr.enabled = false;
            renderer.shadowMap.autoUpdate = false;

            renderer.setRenderTarget(renderTarget);
            renderer.state.buffers.depth.setMask(true);
            if (renderer.autoClear === false) renderer.clear();
            renderer.render(scene, virtualCamera);

            renderer.xr.enabled = currentXrEnabled;
            renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
            renderer.setRenderTarget(currentRenderTarget);
            const viewport = camera.viewport;
            if (viewport !== undefined) {
                renderer.state.viewport(viewport);
            }

            mirrorMesh.visible = true;
            if (playerCtrl) playerCtrl.setMirrorRenderMode(false);
        };

        return mirrorMesh;
    }

    _initMaterials() {
        const tParquet = this.tex.loadPhoto('parquet', 'parquet.jpg', 1, 1);
        const tLinoleum = this.tex.loadPhoto('linoleum', 'linoleum.png', 1, 1);
        const tCarpet = this.tex.loadPhoto('carpet', 'carpet_soviet.jpg', 1, 1);
        const tTiles = this.tex.loadPhoto('tiles', 'tiles_bathroom.jpg', 1, 1);
        const tDermantine = this.tex.loadPhoto('dermantine', 'dermantine.jpg', 1, 2);
        const tPanel = this.tex.loadPhoto('panel', 'panel_wall.jpg', 1, 1);
        const tSnow = this.tex.loadPhoto('snow', 'snow.jpg', 1, 1);
        const tOlivier = this.tex.loadPhoto('olivier', 'food_olivier.jpg', 1, 1);
        const tChicken = this.tex.loadPhoto('chicken', 'food_chicken.jpg', 1, 1);
        const tPickles = this.tex.loadPhoto('pickles', 'pickles.jpg', 1, 1);
        const tChampagne = this.tex.loadPhoto('champagne', 'champagne.jpg', 1, 1);
        const tPine = this.tex.loadPhoto('pine', 'pine_needles.jpg', 2, 2);

        const tWallpaper = this.tex.createWallpaperTexture('#8d8462');
        const tWallpaperKitchen = this.tex.createWallpaperTexture('#6f857b');
        const tWoodDark = this.tex.createWoodDarkTexture();
        const tTablecloth = this.tex.createTableclothTexture();
        const tClock = this.tex.createClockDialTexture();
        const tBlood = this.tex.createBloodClawTexture();
        const tConcrete = this.tex.createConcreteTexture(1, 1);
        const tUpholstery = this.tex.createUpholsteryTexture();
        const tStairwell = this.tex.createStairwellWallTexture(1, 1);
        const tMeat = this.tex.createMeatPlatterTexture();
        const tCrystal = this.tex.createCrystalTexture();
        const tMirror = this.tex.createMirrorTexture();
        const tWineLabel = this.tex.createWineLabelTexture();

        this.materials = {
            parquet: this._ps1Mat({ map: tParquet, roughness: 0.85 }),
            linoleum: this._ps1Mat({ map: tLinoleum, roughness: 0.78 }),
            carpet: this._ps1Mat({ map: tCarpet, roughness: 0.95 }),
            tiles: this._ps1Mat({ map: tTiles, roughness: 0.65 }),
            dermantine: this._ps1Mat({ map: tDermantine, color: 0xb8957a, roughness: 0.8 }),
            panel: this._ps1Mat({ map: tPanel, color: 0x8f949b, roughness: 0.95 }),
            concrete: this._ps1Mat({ map: tConcrete, roughness: 0.94 }),
            stairwellWall: this._ps1Mat({ map: tStairwell, roughness: 0.92 }),
            snow: this._ps1Mat({ map: tSnow, color: 0xd6e1ee, roughness: 0.95 }),
            wallpaperHall: this._ps1Mat({ map: tWallpaper, roughness: 0.92 }),
            wallpaperKitchen: this._ps1Mat({ map: tWallpaperKitchen, roughness: 0.92 }),
            ceiling: this._ps1Mat({ color: 0x99958c, roughness: 0.95 }),
            woodDark: this._ps1Mat({ map: tWoodDark, roughness: 0.55 }),
            woodFrame: this._ps1Mat({ color: 0x725944, roughness: 0.85 }),
            tablecloth: this._ps1Mat({ map: tTablecloth, roughness: 0.9 }),
            sofaFabric: this._ps1Mat({ map: tUpholstery, roughness: 0.95 }),
            fridgeWhite: this._ps1Mat({ color: 0xcfd6cf, roughness: 0.58 }),
            stoveWhite: this._ps1Mat({ color: 0xbcc0bc, roughness: 0.62 }),
            metal: this._ps1Mat({ color: 0x5c6066, roughness: 0.5, metalness: 0.4 }),
            curtain: this._ps1Mat({ color: 0xb8c8c6, roughness: 0.9, doubleSided: true }),
            glass: this._ps1Mat({ color: 0x8fb0c7, transparent: true, opacity: 0.28, roughness: 0.15, depthWrite: false, snap: false }),
            mirror: this._ps1Mat({ map: tMirror, color: 0xf0f8ff, emissive: 0x3b4f63, emissiveIntensity: 0.52, roughness: 0.08, metalness: 0.82, snap: false }),
            wineLabel: this._ps1Mat({ map: tWineLabel, roughness: 0.5 }),
            crystal: this._ps1Mat({ map: tCrystal, color: 0xdff2ff, transparent: true, opacity: 0.78, roughness: 0.12, depthWrite: false }),
            water: this._ps1Mat({ color: 0x6ea8c9, transparent: true, opacity: 0.7, roughness: 0.12, depthWrite: false }),
            olivier: this._ps1Mat({ map: tOlivier }),
            chicken: this._ps1Mat({ map: tChicken }),
            pickles: this._ps1Mat({ map: tPickles }),
            champagne: this._ps1Mat({ map: tChampagne }),
            meat: this._ps1Mat({ map: tMeat, roughness: 0.72 }),
            clockDial: this._ps1Mat({ map: tClock }),
            bloodClaw: new THREE.MeshBasicMaterial({ map: tBlood, transparent: true, depthWrite: false }),
            santaHatRed: this._ps1Mat({ color: 0xb51c1c, emissive: 0x380505, roughness: 0.85 }),
            santaHatFur: this._ps1Mat({ color: 0xedeae2, emissive: 0x2a2824, roughness: 0.9 }),
            pine: this._ps1Mat({ map: tPine, color: 0x5c805c, roughness: 0.92 }),
            darkSilhouette: new THREE.MeshBasicMaterial({ color: 0x050507 })
        };

        for (const [key, mat] of Object.entries(this.materials)) {
            mat.userData = { ...(mat.userData || {}), materialKey: key };
        }
        this.world.materials = this.materials;
    }

    createPicklesJarModel(scale = 1.0) {
        const group = new THREE.Group();
        const glassMat = this._ps1Mat({
            color: 0xa8c8a2,
            transparent: true,
            opacity: 0.42,
            roughness: 0.18,
            depthWrite: false
        });
        const brineMat = this._ps1Mat({
            color: 0x6b8c42,
            transparent: true,
            opacity: 0.36,
            roughness: 0.3,
            depthWrite: false
        });
        const cucumberMat = this._ps1Mat({
            map: this.materials.pickles.map,
            color: 0x557a2e,
            roughness: 0.78
        });
        const lidMat = this._ps1Mat({ color: 0xc8a951, metalness: 0.55, roughness: 0.35 });

        const jarBody = new THREE.Mesh(new THREE.CylinderGeometry(0.074 * scale, 0.076 * scale, 0.17 * scale, 10), glassMat);
        const jarNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.062 * scale, 0.072 * scale, 0.025 * scale, 10), glassMat);
        jarNeck.position.y = 0.095 * scale;
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * scale, 0.065 * scale, 0.018 * scale, 10), lidMat);
        lid.position.y = 0.112 * scale;
        const brine = new THREE.Mesh(new THREE.CylinderGeometry(0.068 * scale, 0.070 * scale, 0.145 * scale, 8), brineMat);
        brine.position.y = -0.008 * scale;

        const cukeSpecs = [
            { x: -0.024, y: -0.015, z: 0.018, rx: 0.18, rz: -0.14, h: 0.095 },
            { x: 0.025, y: -0.012, z: -0.015, rx: -0.22, rz: 0.16, h: 0.092 },
            { x: -0.012, y: 0.005, z: -0.026, rx: 0.15, rz: 0.20, h: 0.088 },
            { x: 0.018, y: -0.008, z: 0.025, rx: -0.16, rz: -0.22, h: 0.090 },
            { x: 0.0, y: 0.025, z: 0.0, rx: 0.35, rz: 0.25, h: 0.082 }
        ];
        for (const c of cukeSpecs) {
            const cuke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018 * scale, 0.019 * scale, c.h * scale, 7),
                cucumberMat
            );
            cuke.position.set(c.x * scale, c.y * scale, c.z * scale);
            cuke.rotation.set(c.rx, 0, c.rz);
            group.add(cuke);
        }

        group.add(brine, jarBody, jarNeck, lid);
        return group;
    }

    createRoastedChickenModel(scale = 1.0) {
        const group = new THREE.Group();
        const trayMat = this.materials.metal;
        const roastMat = this._ps1Mat({
            map: this.materials.chicken.map,
            color: 0xc87d38,
            roughness: 0.62
        });
        const boneMat = this._ps1Mat({ color: 0xede6d6, roughness: 0.75 });

        const trayBase = new THREE.Mesh(new THREE.BoxGeometry(0.30 * scale, 0.016 * scale, 0.22 * scale), trayMat);
        trayBase.position.y = -0.045 * scale;
        const rimN = new THREE.Mesh(new THREE.BoxGeometry(0.30 * scale, 0.028 * scale, 0.014 * scale), trayMat);
        rimN.position.set(0, -0.036 * scale, -0.105 * scale);
        const rimS = new THREE.Mesh(new THREE.BoxGeometry(0.30 * scale, 0.028 * scale, 0.014 * scale), trayMat);
        rimS.position.set(0, -0.036 * scale, 0.105 * scale);
        const rimW = new THREE.Mesh(new THREE.BoxGeometry(0.014 * scale, 0.028 * scale, 0.20 * scale), trayMat);
        rimW.position.set(-0.145 * scale, -0.036 * scale, 0);
        const rimE = new THREE.Mesh(new THREE.BoxGeometry(0.014 * scale, 0.028 * scale, 0.20 * scale), trayMat);
        rimE.position.set(0.145 * scale, -0.036 * scale, 0);

        const body = new THREE.Mesh(new THREE.SphereGeometry(0.095 * scale, 8, 6), roastMat);
        body.scale.set(1.32, 0.76, 0.92);
        body.position.set(-0.01 * scale, 0.01 * scale, 0);

        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.SphereGeometry(0.042 * scale, 7, 5), roastMat);
            leg.scale.set(1.45, 0.85, 0.85);
            leg.position.set(0.065 * scale, 0.018 * scale, side * 0.062 * scale);
            leg.rotation.y = side * -0.25;
            leg.rotation.z = 0.28;

            const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.009 * scale, 0.011 * scale, 0.045 * scale, 6), boneMat);
            bone.rotation.z = Math.PI / 2.3;
            bone.position.set(0.118 * scale, 0.036 * scale, side * 0.065 * scale);

            const wing = new THREE.Mesh(new THREE.SphereGeometry(0.034 * scale, 6, 5), roastMat);
            wing.scale.set(1.4, 0.65, 0.65);
            wing.position.set(-0.035 * scale, 0.008 * scale, side * 0.082 * scale);
            group.add(leg, bone, wing);
        }

        group.add(trayBase, rimN, rimS, rimW, rimE, body);
        return group;
    }

    createOlivierBowlModel(scale = 1.0) {
        const group = new THREE.Group();
        const bowlMat = this._ps1Mat({ color: 0xd8e6f2, roughness: 0.35 });
        const saladMat = this.materials.olivier;

        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.145 * scale, 0.095 * scale, 0.085 * scale, 10), bowlMat);
        const mound = new THREE.Mesh(new THREE.SphereGeometry(0.132 * scale, 8, 6), saladMat);
        mound.scale.set(1.0, 0.36, 1.0);
        mound.position.y = 0.038 * scale;
        group.add(bowl, mound);
        return group;
    }

    createMeatPlatterModel(scale = 1.0) {
        const group = new THREE.Group();
        const plateMat = this._ps1Mat({ color: 0xe8e3d5, roughness: 0.45 });
        const rimMat = this._ps1Mat({ color: 0x4c6d92, roughness: 0.5 });
        const sausageMat = this.materials.meat;
        const cheeseMat = this._ps1Mat({ color: 0xe3ba54, roughness: 0.72 });
        const herbMat = this._ps1Mat({ color: 0x2f6b28, roughness: 0.85 });

        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.155 * scale, 0.125 * scale, 0.016 * scale, 12), plateMat);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.145 * scale, 0.008 * scale, 5, 12), rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.009 * scale;
        group.add(plate, rim);

        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.038 * scale, 0.038 * scale, 0.009 * scale, 8), sausageMat);
            slice.position.set(Math.cos(ang) * 0.068 * scale, 0.014 * scale + (i % 2) * 0.003 * scale, Math.sin(ang) * 0.068 * scale);
            slice.rotation.x = 0.08 * Math.sin(ang);
            slice.rotation.z = -0.08 * Math.cos(ang);
            group.add(slice);
        }
        for (let i = 0; i < 4; i++) {
            const ang = (i / 4) * Math.PI * 2 + 0.4;
            const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.048 * scale, 0.008 * scale, 0.038 * scale), cheeseMat);
            cheese.position.set(Math.cos(ang) * 0.032 * scale, 0.018 * scale, Math.sin(ang) * 0.032 * scale);
            cheese.rotation.y = ang;
            group.add(cheese);
        }
        const herb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.018 * scale, 0), herbMat);
        herb.scale.set(1.2, 0.5, 1.2);
        herb.position.set(0, 0.024 * scale, 0);
        group.add(herb);
        return group;
    }

    createStoolModel(scale = 1.0) {
        const group = new THREE.Group();
        const seatMat = this.materials.woodDark;
        const legMat = this.materials.woodFrame;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.036 * scale, 0.34 * scale), seatMat);
        seat.position.y = 0.46 * scale;
        group.add(seat);

        const legPositions = [
            [-0.125, -0.125],
            [0.125, -0.125],
            [-0.125, 0.125],
            [0.125, 0.125]
        ];
        for (const [lx, lz] of legPositions) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.036 * scale, 0.45 * scale, 0.036 * scale), legMat);
            leg.position.set(lx * scale, 0.225 * scale, lz * scale);
            group.add(leg);
        }
        const rung1 = new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.022 * scale, 0.022 * scale), legMat);
        rung1.position.set(0, 0.15 * scale, -0.125 * scale);
        const rung2 = new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.022 * scale, 0.022 * scale), legMat);
        rung2.position.set(0, 0.15 * scale, 0.125 * scale);
        const rung3 = new THREE.Mesh(new THREE.BoxGeometry(0.022 * scale, 0.022 * scale, 0.24 * scale), legMat);
        rung3.position.set(-0.125 * scale, 0.15 * scale, 0);
        const rung4 = new THREE.Mesh(new THREE.BoxGeometry(0.022 * scale, 0.022 * scale, 0.24 * scale), legMat);
        rung4.position.set(0.125 * scale, 0.15 * scale, 0);
        group.add(rung1, rung2, rung3, rung4);
        return group;
    }

    createWineBottleModel(scale = 1.0) {
        const group = new THREE.Group();
        const bottleGlassMat = this._ps1Mat({
            color: 0x1a4722,
            transparent: true,
            opacity: 0.62,
            roughness: 0.16,
            metalness: 0.15,
            depthWrite: false
        });
        const wineLiquidMat = this._ps1Mat({
            color: 0x5c1118,
            emissive: 0x1c0306,
            transparent: true,
            opacity: 0.85,
            roughness: 0.25,
            depthWrite: false
        });
        const labelMat = this.materials.wineLabel || this.materials.champagne;
        const foilMat = this._ps1Mat({
            color: 0xd8b243,
            emissive: 0x3b2c08,
            emissiveIntensity: 0.35,
            roughness: 0.28,
            metalness: 0.65
        });
        const crimsonBandMat = this._ps1Mat({ color: 0x7c181d, roughness: 0.4 });

        // Inner wine liquid visible through the translucent green bottle glass
        const liquidBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.036 * scale, 0.037 * scale, 0.145 * scale, 10),
            wineLiquidMat
        );
        liquidBody.position.y = -0.042 * scale;
        const liquidMeniscus = new THREE.Mesh(
            new THREE.CylinderGeometry(0.026 * scale, 0.035 * scale, 0.028 * scale, 10),
            wineLiquidMat
        );
        liquidMeniscus.position.y = 0.042 * scale;

        // Indented punt at bottom of bottle
        const punt = new THREE.Mesh(
            new THREE.ConeGeometry(0.030 * scale, 0.032 * scale, 8),
            bottleGlassMat
        );
        punt.position.y = -0.105 * scale;

        // Outer translucent emerald glass lower & upper body + vintage wrap label band in middle
        const bodyLower = new THREE.Mesh(
            new THREE.CylinderGeometry(0.042 * scale, 0.043 * scale, 0.042 * scale, 10),
            bottleGlassMat
        );
        bodyLower.position.y = -0.100 * scale;

        const labelBand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0428 * scale, 0.0428 * scale, 0.088 * scale, 12),
            labelMat
        );
        labelBand.position.y = -0.035 * scale;

        const bodyUpper = new THREE.Mesh(
            new THREE.CylinderGeometry(0.041 * scale, 0.0425 * scale, 0.032 * scale, 10),
            bottleGlassMat
        );
        bodyUpper.position.y = 0.025 * scale;

        // Curved shoulder tapering into the neck
        const shoulder1 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028 * scale, 0.041 * scale, 0.038 * scale, 10),
            bottleGlassMat
        );
        shoulder1.position.y = 0.060 * scale;

        const shoulder2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0165 * scale, 0.028 * scale, 0.032 * scale, 10),
            bottleGlassMat
        );
        shoulder2.position.y = 0.095 * scale;

        // Neck & decorative collar ribbon
        const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015 * scale, 0.0165 * scale, 0.046 * scale, 10),
            bottleGlassMat
        );
        neck.position.y = 0.134 * scale;

        const neckCollar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0178 * scale, 0.0195 * scale, 0.016 * scale, 10),
            crimsonBandMat
        );
        neckCollar.position.y = 0.108 * scale;

        // Gold foil capsule, lip ring, and cork top
        const foilCapsule = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0162 * scale, 0.0168 * scale, 0.036 * scale, 10),
            foilMat
        );
        foilCapsule.position.y = 0.156 * scale;

        const lipRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.0162 * scale, 0.0028 * scale, 5, 10),
            foilMat
        );
        lipRing.rotation.x = Math.PI / 2;
        lipRing.position.y = 0.165 * scale;

        const corkTop = new THREE.Mesh(
            new THREE.SphereGeometry(0.0172 * scale, 8, 6),
            foilMat
        );
        corkTop.scale.set(1.0, 0.45, 1.0);
        corkTop.position.y = 0.174 * scale;

        group.add(
            liquidBody, liquidMeniscus, punt,
            bodyLower, labelBand, bodyUpper,
            shoulder1, shoulder2, neck, neckCollar,
            foilCapsule, lipRing, corkTop
        );
        return group;
    }

    createCrystalGobletModel(scale = 1.0, withWine = false) {
        const group = new THREE.Group();
        const crystalMat = this.materials.crystal;
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * scale, 0.028 * scale, 0.008 * scale, 8), crystalMat);
        foot.position.y = 0.004 * scale;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0045 * scale, 0.0055 * scale, 0.056 * scale, 6), crystalMat);
        stem.position.y = 0.036 * scale;
        const knop = new THREE.Mesh(new THREE.OctahedronGeometry(0.009 * scale, 0), crystalMat);
        knop.position.y = 0.044 * scale;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.030 * scale, 0.016 * scale, 0.068 * scale, 8), crystalMat);
        bowl.position.y = 0.098 * scale;
        group.add(foot, stem, knop, bowl);
        if (withWine) {
            const wine = new THREE.Mesh(
                new THREE.CylinderGeometry(0.024 * scale, 0.015 * scale, 0.036 * scale, 8),
                this._ps1Mat({ color: 0xd4a438, transparent: true, opacity: 0.75, depthWrite: false })
            );
            wine.position.y = 0.088 * scale;
            group.add(wine);
        }
        return group;
    }

    createCrystalDecanterModel(scale = 1.0) {
        const group = new THREE.Group();
        const crystalMat = this.materials.crystal;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.046 * scale, 0.052 * scale, 0.022 * scale, 8), crystalMat);
        base.position.y = 0.011 * scale;
        const belly = new THREE.Mesh(new THREE.OctahedronGeometry(0.068 * scale, 0), crystalMat);
        belly.scale.set(1.0, 1.15, 1.0);
        belly.position.y = 0.082 * scale;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * scale, 0.024 * scale, 0.055 * scale, 8), crystalMat);
        neck.position.y = 0.165 * scale;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * scale, 0.016 * scale, 0.012 * scale, 8), crystalMat);
        rim.position.y = 0.196 * scale;
        const stopper = new THREE.Mesh(new THREE.OctahedronGeometry(0.024 * scale, 0), crystalMat);
        stopper.scale.set(0.9, 1.35, 0.9);
        stopper.position.y = 0.222 * scale;
        group.add(base, belly, neck, rim, stopper);
        return group;
    }

    createFoldedTableclothModel(scale = 1.0) {
        const group = new THREE.Group();
        const clothMat = this.materials.tablecloth;
        const laceMat = this._ps1Mat({ color: 0xf4efe4, roughness: 0.85 });
        const bottomFold = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.024 * scale, 0.22 * scale), clothMat);
        bottomFold.position.y = 0.012 * scale;
        const midFold = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.022 * scale, 0.20 * scale), laceMat);
        midFold.position.set(0.004 * scale, 0.034 * scale, 0.004 * scale);
        const topFold = new THREE.Mesh(new THREE.BoxGeometry(0.25 * scale, 0.022 * scale, 0.19 * scale), clothMat);
        topFold.position.set(-0.003 * scale, 0.055 * scale, -0.002 * scale);
        group.add(bottomFold, midFold, topFold);
        return group;
    }

    createDecorHighlightFrame(w, h, plane = 'xy') {
        const group = new THREE.Group();
        const fillMat = new THREE.MeshBasicMaterial({
            color: 0xffd166,
            transparent: true,
            opacity: 0.14,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const borderMat = new THREE.MeshBasicMaterial({
            color: 0xffe484,
            transparent: true,
            opacity: 0.82,
            depthWrite: false
        });
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fillMat);
        if (plane === 'yz') fill.rotation.y = Math.PI / 2;
        else if (plane === 'xz') fill.rotation.x = -Math.PI / 2;
        group.add(fill);

        const t = 0.028;
        const topBar = new THREE.Mesh(
            plane === 'yz' ? new THREE.BoxGeometry(t, t, w) : new THREE.BoxGeometry(w, t, t),
            borderMat
        );
        const botBar = topBar.clone();
        const leftBar = new THREE.Mesh(
            plane === 'yz' ? new THREE.BoxGeometry(t, h, t) : new THREE.BoxGeometry(t, h, t),
            borderMat
        );
        const rightBar = leftBar.clone();

        if (plane === 'yz') {
            topBar.position.set(0, h * 0.5, 0);
            botBar.position.set(0, -h * 0.5, 0);
            leftBar.position.set(0, 0, -w * 0.5);
            rightBar.position.set(0, 0, w * 0.5);
        } else {
            topBar.position.set(0, h * 0.5, 0);
            botBar.position.set(0, -h * 0.5, 0);
            leftBar.position.set(-w * 0.5, 0, 0);
            rightBar.position.set(w * 0.5, 0, 0);
        }
        const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), borderMat);
        group.add(topBar, botBar, leftBar, rightBar, diamond);
        group.userData = { fillMat, borderMat, diamond };
        return group;
    }

    createCustomMaterial(materialKey, customProps = {}) {
        const baseMat = materialKey && this.materials[materialKey] ? this.materials[materialKey] : null;
        const hasRepeat = customProps.repeatX !== undefined || customProps.repeatY !== undefined;
        let map = baseMat?.map || null;
        if (map && hasRepeat) {
            map = map.clone();
            const rx = customProps.repeatX ?? map.repeat.x ?? 1;
            const ry = customProps.repeatY ?? map.repeat.y ?? 1;
            configurePS1Texture(map, rx, ry);
        }
        const opacity = customProps.opacity !== undefined ? customProps.opacity : (baseMat?.opacity ?? 1.0);
        const transparent = customProps.transparent !== undefined
            ? customProps.transparent
            : (opacity < 0.999 || !!baseMat?.transparent);

        if (baseMat && baseMat.isMeshBasicMaterial && !customProps.forceStandard) {
            const basic = new THREE.MeshBasicMaterial({
                color: customProps.color !== undefined ? customProps.color : baseMat.color.getHex(),
                map,
                transparent,
                opacity,
                depthWrite: customProps.depthWrite !== undefined ? customProps.depthWrite : (opacity < 0.999 ? false : baseMat.depthWrite),
                side: customProps.doubleSided ? THREE.DoubleSide : baseMat.side
            });
            basic.userData = { materialKey: materialKey || 'custom', customProps: { ...customProps } };
            return basic;
        }

        const mat = this._ps1Mat({
            color: customProps.color !== undefined ? customProps.color : (baseMat?.color ? baseMat.color.getHex() : 0xffffff),
            map,
            roughness: customProps.roughness !== undefined ? customProps.roughness : (baseMat?.roughness ?? 0.9),
            metalness: customProps.metalness !== undefined ? customProps.metalness : (baseMat?.metalness ?? 0.05),
            emissive: customProps.emissive !== undefined ? customProps.emissive : (baseMat?.emissive ? baseMat.emissive.getHex() : 0x000000),
            emissiveIntensity: customProps.emissiveIntensity !== undefined ? customProps.emissiveIntensity : (baseMat?.emissiveIntensity ?? 1.0),
            transparent,
            opacity,
            depthWrite: customProps.depthWrite !== undefined ? customProps.depthWrite : (opacity < 0.999 ? false : (baseMat?.depthWrite ?? true)),
            doubleSided: customProps.doubleSided !== undefined ? customProps.doubleSided : (baseMat?.side === THREE.DoubleSide),
            snap: customProps.snap !== undefined ? customProps.snap : (materialKey !== 'glass')
        });
        mat.userData = { materialKey: materialKey || 'custom', customProps: { ...customProps } };
        return mat;
    }

    _buildLighting() {
        const ambient = new THREE.AmbientLight(0x485675, 1.05);
        this.scene.add(ambient);

        const moon = new THREE.DirectionalLight(0x6b85bd, 0.65);
        moon.position.set(-10, 14, -20);
        moon.castShadow = true;
        moon.shadow.mapSize.set(512, 512);
        moon.shadow.camera.near = 1;
        moon.shadow.camera.far = 45;
        moon.shadow.camera.left = -14;
        moon.shadow.camera.right = 14;
        moon.shadow.camera.top = 14;
        moon.shadow.camera.bottom = -14;
        this.scene.add(moon);

        const tvLight = new THREE.PointLight(0x6890ff, 1.6, 8.5, 1.5);
        tvLight.position.set(1.15, 1.15, -1.0);
        this.scene.add(tvLight);

        const hallLight = new THREE.PointLight(0xffe0a8, 0.0, 11.5, 1.35);
        hallLight.position.set(-0.75, 2.48, -1.0);
        this.scene.add(hallLight);

        const kitchenLight = new THREE.PointLight(0xffd796, 2.0, 8.5, 1.5);
        kitchenLight.position.set(3.1, 2.45, -2.0);
        this.scene.add(kitchenLight);

        const fridgeLight = new THREE.PointLight(0xffe184, 0.0, 2.8, 1.8);
        fridgeLight.position.set(3.45, 1.25, -2.85);
        this.scene.add(fridgeLight);

        const ovenLight = new THREE.PointLight(0xff7722, 0.0, 2.4, 1.8);
        ovenLight.position.set(3.45, 0.45, -2.10);
        this.scene.add(ovenLight);

        const hallwayLight = new THREE.PointLight(0xffcfa0, 1.8, 8.5, 1.5);
        hallwayLight.position.set(3.1, 2.42, 2.2);
        this.scene.add(hallwayLight);

        const bathroomLight = new THREE.PointLight(0xcbe8ff, 1.7, 5.5, 1.5);
        bathroomLight.position.set(5.1, 2.42, 2.55);
        this.scene.add(bathroomLight);

        const stairwellLight = new THREE.PointLight(0xd6df9c, 1.35, 9.0, 1.4);
        stairwellLight.position.set(3.25, 2.85, 5.5);
        this.scene.add(stairwellLight);

        const streetLight = new THREE.PointLight(0xffad48, 3.2, 32, 1.3);
        streetLight.position.set(-4.5, -0.8, -13.5);
        this.scene.add(streetLight);

        const neighborLight = new THREE.PointLight(0xffe07d, 0.0, 10, 1.3);
        neighborLight.position.set(-1.0, 1.5, -24.8);
        this.scene.add(neighborLight);

        this.world.lights = {
            ambient,
            moon,
            tvLight,
            hallLight,
            kitchenLight,
            fridgeLight,
            ovenLight,
            hallwayLight,
            bathroomLight,
            stairwellLight,
            streetLight,
            neighborLight
        };

        this._registerLight(ambient, 'ambient', t('light.ambient'), null);
        this._registerLight(moon, 'moon', t('light.moon'), null);
        this._registerLight(tvLight, 'tvLight', t('light.tv'), null);
        this._registerLight(hallLight, 'hallLight', t('light.hall'), 'hall');
        this._registerLight(kitchenLight, 'kitchenLight', t('light.kitchen'), 'kitchen');
        this._registerLight(fridgeLight, 'fridgeLight', t('light.fridge'), null);
        this._registerLight(ovenLight, 'ovenLight', t('light.oven'), null);
        this._registerLight(hallwayLight, 'hallwayLight', t('light.hallway'), 'hallway');
        this._registerLight(bathroomLight, 'bathroomLight', t('light.bathroom'), 'bathroom');
        this._registerLight(stairwellLight, 'stairwellLight', t('light.stairwell'), null);
        this._registerLight(streetLight, 'streetLight', t('light.street'), null);
        this._registerLight(neighborLight, 'neighborLight', t('light.neighbor'), null);
    }

    _buildApartmentStructure() {
        const H = 2.68;
        this._currentCategory = 'structure';
        this._currentGroupId = null;

        this._addStaticBox('HallFloor', -0.75, -0.5, -1.0, 5.5, 1.0, 5.0, this.materials.parquet);
        this._addStaticBox('KitchenFloor', 3.1, -0.5, -2.05, 2.2, 1.0, 2.9, this.materials.parquet);
        this._addStaticBox('HallwayFloor', 3.1, -0.5, 1.95, 2.2, 1.0, 5.1, this.materials.parquet);
        this._addStaticBox('PantryFloor', 1.4, -0.5, 2.4, 1.2, 1.0, 1.2, this.materials.parquet);
        this._addStaticBox('WardrobeFloor', 1.55, -0.5, 3.7, 0.9, 1.0, 1.0, this.materials.woodDark);
        this._addStaticBox('BathroomFloor', 5.15, -0.5, 2.55, 1.9, 1.0, 1.9, this.materials.tiles);
        this._addStaticBox('StairwellFloor', 3.25, -0.5, 5.35, 2.9, 1.0, 1.7, this.materials.concrete);

        this._addStaticBox('AptCeilingMain', 0.3, H + 0.2, -1.0, 8.2, 0.4, 5.2, this.materials.ceiling, { blocker: false });
        this._addStaticBox('AptCeilingSouth', 3.5, H + 0.2, 2.85, 5.6, 0.4, 3.3, this.materials.ceiling, { blocker: false });
        this._addStaticBox('StairwellCeiling', 3.25, 3.35, 6.6, 3.1, 0.25, 4.3, this.materials.concrete, { blocker: false });

        this._addWallSegment('HallWestWall', -3.5, -3.5, -3.5, 1.5, 0, H, this.materials.wallpaperHall);

        this._addWallSegment('HallSouthWall', -3.5, 1.5, 2.0, 1.5, 0, H, this.materials.wallpaperHall);

        this._addWallSegment('HallNorthWall_Left', -3.5, -3.5, -2.2, -3.5, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('HallNorthWall_WinBottom', -2.2, -3.5, -0.2, -3.5, 0, 0.85, this.materials.wallpaperHall);
        this._addWallSegment('HallNorthWall_WinTop', -2.2, -3.5, -0.2, -3.5, 2.2, H, this.materials.wallpaperHall);
        this._addStaticBox('HallWindowGlass', -1.2, 1.52, -3.5, 2.0, 1.35, 0.03, this.materials.glass, { blocker: false, category: 'doors' });
        this._addWallSegment('HallNorthWall_Mid', -0.2, -3.5, 0.4, -3.5, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('HallNorthWall_BalcTop', 0.4, -3.5, 1.4, -3.5, 2.15, H, this.materials.wallpaperHall);
        this._addWallSegment('HallNorthWall_Right', 1.4, -3.5, 2.0, -3.5, 0, H, this.materials.wallpaperHall);

        const balcDoorPivot = new GameObject('BalconyDoor');
        balcDoorPivot.transform.position.set(0.4, 0, -3.5);
        const bBot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.92, 0.06), this.materials.woodFrame);
        bBot.position.set(0.5, 0.46, 0);
        const bLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.23, 0.06), this.materials.woodFrame);
        bLeft.position.set(0.055, 1.535, 0);
        const bRight = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.23, 0.06), this.materials.woodFrame);
        bRight.position.set(0.945, 1.535, 0);
        const bTop = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.06), this.materials.woodFrame);
        bTop.position.set(0.5, 2.09, 0);
        const balcGlass = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.11, 0.02), this.materials.glass);
        balcGlass.position.set(0.5, 1.475, 0);
        balcDoorPivot.transform.add(bBot, bLeft, bRight, bTop, balcGlass);
        this._addDoorHandles(balcDoorPivot, new THREE.Vector3(1.0, 2.15, 0.06), new THREE.Vector3(0.5, 1.075, 0));
        this.blockerMeshes.push(bBot, bLeft, bRight, bTop);
        const balcColSize = new THREE.Vector3(1.0, 2.15, 0.14);
        const balcColOffset = new THREE.Vector3(0.5, 1.075, 0);
        const balcCol = balcDoorPivot.addComponent(BoxCollider, balcColSize, balcColOffset);
        balcDoorPivot.addComponent(RigidBody, { bodyType: 'static' });
        let balcOpen = false;
        let balcBaseYaw = 0;
        let balcOpenAngle = 1.45;
        this.world.animatedDoors.push({
            pivot: balcDoorPivot,
            axis: 'y',
            getTarget: () => balcBaseYaw + (balcOpen ? balcOpenAngle : 0)
        });
        const setBalconyOpen = (open, sound = true, instant = false) => {
            const next = !!open;
            if (!next && !instant && this._isPlayerBlockingDoor(balcDoorPivot, balcBaseYaw, balcColSize, balcColOffset)) {
                return false;
            }
            balcOpen = next;
            if (instant) {
                balcDoorPivot.transform.rotation.y = balcBaseYaw + (balcOpen ? balcOpenAngle : 0);
            }
            balcCol.enabled = !balcOpen;
            if (sound && this.engine?.audioSystem) {
                this.engine.audioSystem.playSpatialOneShot('door_open', balcDoorPivot.transform.position);
            }
            return true;
        };
        balcDoorPivot.addComponent(Interactable, {
            promptText: () => (balcOpen ? t('prompt.balcony_close') : t('prompt.balcony_open')),
            onInteract: () => setBalconyOpen(!balcOpen)
        });
        this.engine.addGameObject(balcDoorPivot);
        this._registerEditable(balcDoorPivot.transform, 'BalconyDoor', {
            category: 'doors',
            extra: {
                gameObject: balcDoorPivot,
                collide: true,
                blocker: true,
                initialOpenAngle: 1.45,
                getOpenAngle: () => balcOpenAngle,
                setOpenAngle: (a) => {
                    balcOpenAngle = a;
                    if (balcOpen) balcDoorPivot.transform.rotation.y = balcBaseYaw + balcOpenAngle;
                },
                isOpen: () => balcOpen,
                setOpenState: (v) => setBalconyOpen(v, false, true),
                setBaseYaw: (y) => { balcBaseYaw = y; }
            }
        });
        this.world.doors.balcony = {
            pivot: balcDoorPivot,
            glassMesh: balcGlass,
            isOpen: () => balcOpen,
            setOpen: setBalconyOpen
        };

        const curtainGroup = new THREE.Group();
        curtainGroup.position.set(-1.20, 1.38, -3.38);
        const rodMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.016, 0.016, 2.46, 8),
            this.materials.woodDark
        );
        rodMesh.rotation.z = Math.PI / 2;
        rodMesh.position.set(0, 0.98, 0.02);
        curtainGroup.add(rodMesh);
        for (const [bIdx, bx] of [[-1.14, -0.05], [1.14, -0.05]].entries()) {
            const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.14), this.materials.woodDark);
            bracket.position.set(bx, 0.98, -0.05);
            curtainGroup.add(bracket);
        }

        const makePleatedCurtainGeo = (w, h, segX, amp) => {
            const geo = new THREE.PlaneGeometry(w, h, segX, 4);
            const posAttr = geo.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const vx = posAttr.getX(i);
                const vy = posAttr.getY(i);
                const dropFactor = 0.55 + 0.45 * (0.5 - vy / h);
                posAttr.setZ(i, Math.sin((vx / w) * Math.PI * segX * 0.5) * amp * dropFactor);
            }
            geo.computeVertexNormals();
            return geo;
        };

        const fabricMat = this._ps1Mat({
            color: 0x8c6352,
            emissive: 0x1e1410,
            emissiveIntensity: 0.45,
            roughness: 0.92,
            doubleSided: true
        });
        const tulleMat = this._ps1Mat({
            color: 0xe8ece6,
            emissive: 0x262a2e,
            emissiveIntensity: 0.4,
            roughness: 0.88,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            doubleSided: true
        });

        const tulleGeo = makePleatedCurtainGeo(2.08, 1.96, 24, 0.024);
        const tulleMesh = new THREE.Mesh(tulleGeo, tulleMat);
        tulleMesh.position.set(0, 0, -0.02);
        tulleMesh.renderOrder = 2;
        curtainGroup.add(tulleMesh);

        const drapeGeo = makePleatedCurtainGeo(0.84, 2.12, 16, 0.045);
        const drapeL = new THREE.Mesh(drapeGeo, fabricMat);
        drapeL.position.set(-0.72, -0.08, 0.04);
        const drapeR = new THREE.Mesh(drapeGeo, fabricMat);
        drapeR.position.set(0.72, -0.08, 0.04);
        curtainGroup.add(drapeL, drapeR);
        this.scene.add(curtainGroup);
        this._registerEditable(curtainGroup, 'HallCurtains', {
            category: 'furniture',
            extra: { isSceneProp: true, primaryMesh: drapeL, materialKey: 'curtain' }
        });
        this._registerEditable(tulleMesh, 'HallCurtain_Tulle', {
            category: 'furniture',
            extra: { isSceneProp: true, primaryMesh: tulleMesh, materialKey: 'curtain' }
        });
        this._registerEditable(drapeL, 'HallCurtain_DrapeL', {
            category: 'furniture',
            extra: { isSceneProp: true, primaryMesh: drapeL, materialKey: 'curtain' }
        });
        this._registerEditable(drapeR, 'HallCurtain_DrapeR', {
            category: 'furniture',
            extra: { isSceneProp: true, primaryMesh: drapeR, materialKey: 'curtain' }
        });
        this._registerEditable(rodMesh, 'HallCurtain_Rod', {
            category: 'furniture',
            extra: { isSceneProp: true, primaryMesh: rodMesh, materialKey: 'woodDark' }
        });

        this._addWallSegment('MidWall_Kitchen', 2.0, -3.5, 2.0, 0.2, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('MidWall_DoorTop', 2.0, 0.2, 2.0, 1.3, 2.15, H, this.materials.wallpaperHall);
        this._addWallSegment('MidWall_South', 2.0, 1.3, 2.0, 1.8, 0, H, this.materials.wallpaperHall);
        this.world.doors.hall = this._addInteriorDoor({
            name: 'HallDoor',
            label: 'room.to_hall',
            pivotPos: new THREE.Vector3(2.0, 0, 1.3),
            size: new THREE.Vector3(0.06, 2.14, 1.08),
            leafOffset: new THREE.Vector3(0, 1.07, -0.54),
            openAngle: -1.48,
            defaultOpen: true,
            doorMat: this.materials.woodFrame,
            hasGlass: true
        });

        this._addWallSegment('KitchenNorth_L', 2.0, -3.5, 2.5, -3.5, 0, H, this.materials.wallpaperKitchen);
        this._addWallSegment('KitchenNorth_Bot', 2.5, -3.5, 3.7, -3.5, 0, 0.95, this.materials.wallpaperKitchen);
        this._addWallSegment('KitchenNorth_Top', 2.5, -3.5, 3.7, -3.5, 2.15, H, this.materials.wallpaperKitchen);
        this._addStaticBox('KitchenWindowGlass', 3.1, 1.55, -3.5, 1.2, 1.2, 0.03, this.materials.glass, { blocker: false, category: 'doors' });
        this._addStaticBox('KitchenWindowFrame_Bot', 3.1, 0.98, -3.5, 1.20, 0.06, 0.07, this.materials.woodFrame, { collide: false, category: 'doors' });
        this._addStaticBox('KitchenWindowFrame_Top', 3.1, 2.12, -3.5, 1.20, 0.06, 0.07, this.materials.woodFrame, { collide: false, category: 'doors' });
        this._addStaticBox('KitchenWindowFrame_L', 2.53, 1.55, -3.5, 0.06, 1.08, 0.07, this.materials.woodFrame, { collide: false, category: 'doors' });
        this._addStaticBox('KitchenWindowFrame_R', 3.67, 1.55, -3.5, 0.06, 1.08, 0.07, this.materials.woodFrame, { collide: false, category: 'doors' });
        this._addStaticBox('KitchenWindowMullionV', 3.1, 1.55, -3.5, 0.05, 1.08, 0.06, this.materials.woodFrame, { collide: false, category: 'doors' });
        this._addStaticBox('KitchenWindowTransom', 3.39, 1.85, -3.5, 0.53, 0.04, 0.06, this.materials.woodFrame, { collide: false, category: 'doors' });
        this._addStaticBox('KitchenWindowSill', 3.1, 0.95, -3.41, 1.28, 0.04, 0.20, this.materials.concrete, { collide: false, category: 'doors' });
        this._addWallSegment('KitchenNorth_R', 3.7, -3.5, 4.2, -3.5, 0, H, this.materials.wallpaperKitchen);

        this._addWallSegment('EastWall_KitchenHallway', 4.2, -3.5, 4.2, 1.6, 0, H, this.materials.wallpaperKitchen);

        this._addWallSegment('KitchenDiv_L', 2.0, -0.6, 2.4, -0.6, 0, H, this.materials.wallpaperKitchen);
        this._addWallSegment('KitchenDiv_Top', 2.4, -0.6, 3.4, -0.6, 2.15, H, this.materials.wallpaperKitchen);
        this._addWallSegment('KitchenDiv_R', 3.4, -0.6, 4.2, -0.6, 0, H, this.materials.wallpaperKitchen);
        this.world.doors.kitchen = this._addInteriorDoor({
            name: 'KitchenDoor',
            label: 'room.to_kitchen',
            pivotPos: new THREE.Vector3(2.42, 0, -0.6),
            size: new THREE.Vector3(0.98, 2.14, 0.06),
            leafOffset: new THREE.Vector3(0.49, 1.07, 0),
            openAngle: 1.48,
            defaultOpen: true,
            doorMat: this.materials.woodFrame,
            hasGlass: true
        });

        this._addWallSegment('HallwayEast_B1', 4.2, 1.6, 4.2, 2.1, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('HallwayEast_BTop', 4.2, 2.1, 4.2, 3.0, 2.12, H, this.materials.wallpaperHall);
        this._addWallSegment('HallwayEast_B2', 4.2, 3.0, 4.2, 4.5, 0, H, this.materials.wallpaperHall);

        this._addWallSegment('HallwayWest_P1', 2.0, 1.8, 2.0, 2.0, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('HallwayWest_PTop', 2.0, 2.0, 2.0, 2.8, 2.1, H, this.materials.wallpaperHall);
        this._addWallSegment('HallwayWest_Mid', 2.0, 2.8, 2.0, 3.3, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('HallwayWest_WTop', 2.0, 3.3, 2.0, 4.1, 2.1, H, this.materials.wallpaperHall);
        this._addWallSegment('HallwayWest_End', 2.0, 4.1, 2.0, 4.5, 0, H, this.materials.wallpaperHall);

        this._addWallSegment('PantryN', 0.8, 1.8, 2.0, 1.8, 0, H, this.materials.woodFrame);
        this._addWallSegment('PantryW', 0.8, 1.8, 0.8, 3.0, 0, H, this.materials.woodFrame);
        this._addWallSegment('PantryS', 0.8, 3.0, 2.0, 3.0, 0, H, this.materials.woodFrame);

        this._addWallSegment('WardrobeN', 1.1, 3.2, 2.0, 3.2, 0, H, this.materials.woodDark);
        this._addWallSegment('WardrobeW', 1.1, 3.2, 1.1, 4.2, 0, H, this.materials.woodDark);
        this._addWallSegment('WardrobeS', 1.1, 4.2, 2.0, 4.2, 0, H, this.materials.woodDark);

        this._addWallSegment('BathN', 4.2, 1.6, 6.1, 1.6, 0, H, this.materials.tiles);
        this._addWallSegment('BathE', 6.1, 1.6, 6.1, 3.5, 0, H, this.materials.tiles);
        this._addWallSegment('BathS', 4.2, 3.5, 6.1, 3.5, 0, H, this.materials.tiles);
        // Inner tiled lining on the west wall of the bathroom so all 4 walls inside match
        this._addStaticBox('BathW_TilesN', 4.296, H * 0.5, 1.85, 0.015, H, 0.50, this.materials.tiles, { collide: false, blocker: false });
        this._addStaticBox('BathW_TilesTop', 4.296, 2.12 + (H - 2.12) * 0.5, 2.55, 0.015, H - 2.12, 0.90, this.materials.tiles, { collide: false, blocker: false });
        this._addStaticBox('BathW_TilesS', 4.296, H * 0.5, 3.25, 0.015, H, 0.50, this.materials.tiles, { collide: false, blocker: false });

        this._addWallSegment('FrontWall_L', 2.0, 4.5, 2.6, 4.5, 0, H, this.materials.wallpaperHall);
        this._addWallSegment('FrontWall_Top', 2.6, 4.5, 3.55, 4.5, 2.15, H, this.materials.wallpaperHall);
        this._addWallSegment('FrontWall_R', 3.55, 4.5, 4.2, 4.5, 0, H, this.materials.wallpaperHall);

        const frontDoorGO = new GameObject('FrontDoor');
        frontDoorGO.transform.position.set(3.075, 1.075, 4.5);
        const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.15, 0.09), this.materials.dermantine);
        doorLeaf.castShadow = true;
        const peepRing = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 8), this.materials.metal);
        peepRing.rotation.x = Math.PI / 2;
        peepRing.position.set(0, 0.42, 0);
        const peepLens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.017, 0.017, 0.01, 8),
            this._ps1Mat({ color: 0x0b1018, roughness: 0.15, metalness: 0.8 })
        );
        peepLens.rotation.x = Math.PI / 2;
        peepLens.position.set(0, 0.42, -0.052);
        // Pivoting brass peephole cover flap on the inner side of the front door
        const peepFlapPivot = new THREE.Group();
        peepFlapPivot.position.set(0, 0.448, -0.059);
        const peepFlapMat = this._ps1Mat({ color: 0xb89648, roughness: 0.4, metalness: 0.7 });
        const peepPin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, 6), peepFlapMat);
        peepPin.rotation.x = Math.PI / 2;
        const peepShutter = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.056, 0.006), peepFlapMat);
        peepShutter.position.set(0, -0.026, 0);
        const peepTab = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.012), peepFlapMat);
        peepTab.position.set(0, -0.052, -0.005);
        peepFlapPivot.add(peepPin, peepShutter, peepTab);

        const chain = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.02), this.materials.metal);
        chain.position.set(-0.32, 0.15, -0.055);
        const clawDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.3), this.materials.bloodClaw);
        clawDecal.position.set(0, 0.1, -0.05);
        clawDecal.rotation.y = Math.PI;
        clawDecal.visible = false;

        frontDoorGO.transform.add(doorLeaf, peepRing, peepLens, peepFlapPivot, chain, clawDecal);
        const frontCol = frontDoorGO.addComponent(BoxCollider, new THREE.Vector3(0.95, 2.15, 0.14));
        frontDoorGO.addComponent(RigidBody, { bodyType: 'static' });
        this.blockerMeshes.push(doorLeaf);
        this.engine.addGameObject(frontDoorGO);
        this._registerEditable(frontDoorGO.transform, 'FrontDoor', {
            category: 'doors',
            extra: {
                gameObject: frontDoorGO,
                primaryMesh: doorLeaf,
                materialKey: 'dermantine',
                collide: true,
                blocker: true
            }
        });
        this._registerEditable(clawDecal, 'FrontDoor_ClawDecal', {
            category: 'activated',
            activatedGroup: 'act4',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: clawDecal, materialKey: 'bloodClaw' }
        });

        this.world.frontDoor = {
            go: frontDoorGO,
            mesh: doorLeaf,
            collider: frontCol,
            clawDecal,
            peepFlapPivot
        };

        const escapeGO = new GameObject('EntranceEscapeZone');
        escapeGO.transform.position.set(3.075, 1.05, 4.48);
        const escapeMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, 2.0, 0.28),
            this._ps1Mat({ color: 0xffffff, transparent: true, opacity: 0.01 })
        );
        escapeGO.transform.add(escapeMesh);
        this.engine.addGameObject(escapeGO);
        this._registerEditable(escapeGO.transform, 'EntranceEscapeZone', {
            category: 'gameplay',
            extra: { gameObject: escapeGO, primaryMesh: escapeMesh, collide: false, blocker: false }
        });
        this.world.entranceEscapeZone = escapeGO;

        this._buildDetailedStairwell(H);
    }

    _buildDetailedStairwell(aptH) {
        const H_STAIR = 3.25;
        const Y_BOT = -2.2;
        this._currentCategory = 'stairwell';
        this._currentGroupId = null;

        this._addWallSegment('StairNorth_CornerW', 1.8, 4.5, 2.0, 4.5, Y_BOT, H_STAIR, this.materials.stairwellWall);
        this._addWallSegment('StairNorth_CornerE', 4.2, 4.5, 4.7, 4.5, Y_BOT, H_STAIR, this.materials.stairwellWall);
        this._addWallSegment('StairNorth_Header', 2.0, 4.5, 4.2, 4.5, aptH, H_STAIR, this.materials.stairwellWall);

        this._addWallSegment('StairW', 1.8, 4.5, 1.8, 8.6, Y_BOT, H_STAIR, this.materials.stairwellWall);
        this._addWallSegment('StairE', 4.7, 4.5, 4.7, 8.6, Y_BOT, H_STAIR, this.materials.stairwellWall);

        this._addWallSegment('StairS_Bot', 1.8, 8.6, 4.7, 8.6, Y_BOT, 1.05, this.materials.stairwellWall);
        this._addWallSegment('StairS_Top', 1.8, 8.6, 4.7, 8.6, 2.35, H_STAIR, this.materials.stairwellWall);
        this._addWallSegment('StairS_WinL', 1.8, 8.6, 2.65, 8.6, 1.05, 2.35, this.materials.stairwellWall);
        this._addWallSegment('StairS_WinR', 3.85, 8.6, 4.7, 8.6, 1.05, 2.35, this.materials.stairwellWall);

        this._addStaticBox('StairWindowGlass', 3.25, 1.70, 8.58, 1.18, 1.26, 0.03,
            this._ps1Mat({ color: 0x9eb8cc, emissive: 0x1e2c3d, transparent: true, opacity: 0.55, depthWrite: false, snap: false }),
            { collide: false, blocker: false, materialKey: 'glass', category: 'doors' });
        this._addStaticBox('StairWindowMullionV', 3.25, 1.70, 8.55, 0.05, 1.28, 0.06, this.materials.woodFrame, { collide: false });
        this._addStaticBox('StairWindowMullionH', 3.25, 1.70, 8.55, 1.18, 0.05, 0.06, this.materials.woodFrame, { collide: false });
        this._addStaticBox('StairWindowSill', 3.25, 1.04, 8.48, 1.28, 0.05, 0.22, this.materials.concrete, { collide: false });
        const ashCan = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 7), this.materials.metal);
        ashCan.position.set(3.62, 1.12, 8.45);
        this.scene.add(ashCan);
        this._registerEditable(ashCan, 'StairwellAshCan', {
            category: 'stairwell',
            extra: { isSceneProp: true, primaryMesh: ashCan, materialKey: 'metal' }
        });
        for (let r = 0; r < 6; r++) {
            this._addStaticBox(`StairRadiator_${r}`, 2.95 + r * 0.12, 0.62, 8.46, 0.06, 0.54, 0.10, this.materials.metal, { collide: false });
        }

        this._addStaticBox('StairLowerLanding', 3.25, -2.0, 7.4, 2.9, 0.25, 2.6, this.materials.concrete, { collide: false });

        for (let s = 0; s < 9; s++) {
            this._addStaticBox(`StairDown_${s}`, 2.52, -0.12 - s * 0.20, 6.32 + s * 0.25, 1.22, 0.20, 0.27, this.materials.concrete, { collide: false });
        }

        for (let s = 0; s < 9; s++) {
            this._addStaticBox(`StairUp_${s}`, 3.98, 0.12 + s * 0.21, 6.32 + s * 0.25, 1.22, 0.22, 0.27, this.materials.concrete, { collide: false });
        }

        for (let p = 0; p < 5; p++) {
            this._addStaticBox(`StairPostMid_${p}`, 3.25, 0.45 + p * 0.36, 6.22 + p * 0.52, 0.04, 0.96, 0.04, this.materials.metal, { collide: false });
        }
        const railSlope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 2.55), this.materials.metal);
        railSlope.position.set(3.25, 1.65, 7.35);
        railSlope.rotation.x = -0.64;
        this.scene.add(railSlope);
        this._registerEditable(railSlope, 'StairRailSlope', {
            category: 'stairwell',
            extra: { isSceneProp: true, primaryMesh: railSlope, materialKey: 'metal' }
        });

        this._addStaticBox('StairDropPostL', 1.94, 0.48, 6.22, 0.04, 0.96, 0.04, this.materials.metal, { collide: false });
        this._addStaticBox('StairDropPostM', 2.58, 0.48, 6.22, 0.04, 0.96, 0.04, this.materials.metal, { collide: false });
        this._addStaticBox('StairDropRailTop', 2.58, 0.96, 6.22, 1.34, 0.04, 0.05, this.materials.metal, { collide: false });

        const stairGuard = new GameObject('StairwellGuardrail');
        stairGuard.transform.position.set(3.25, 1.1, 6.22);
        stairGuard.addComponent(BoxCollider, new THREE.Vector3(2.9, 2.2, 0.12));
        stairGuard.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(stairGuard);
        this._registerEditable(stairGuard.transform, 'StairwellGuardrail', {
            category: 'stairwell',
            extra: { gameObject: stairGuard, collide: true, blocker: false }
        });

        this._addStaticBox('NeighborDoor35', 4.60, 1.075, 5.35, 0.06, 2.12, 0.92, this.materials.dermantine, { category: 'doors' });
        this._addStaticBox('NeighborDoor35Handle', 4.55, 1.02, 4.98, 0.04, 0.04, 0.14, this.materials.metal, { collide: false, category: 'doors' });
        this._addStaticBox('NeighborDoor35Plate', 4.55, 1.58, 5.35, 0.02, 0.10, 0.14, this.materials.clockDial, { collide: false, category: 'doors' });

        const mailboxMat = this._ps1Mat({ color: 0x2c4b75, roughness: 0.65, metalness: 0.25 });
        this._addStaticBox('MailboxCluster', 1.88, 1.38, 5.08, 0.14, 0.62, 0.86, mailboxMat, { materialKey: 'metal' });
        for (let m = 0; m < 4; m++) {
            this._addStaticBox(`MailboxSlot_${m}`, 1.96, 1.56, 4.76 + m * 0.21, 0.02, 0.04, 0.14, this.materials.darkSilhouette, { collide: false });
        }
        this._addStaticBox('ElectroPanel', 1.87, 1.48, 5.82, 0.12, 0.56, 0.42, this.materials.metal);
        this._addStaticBox('ElectroWarning', 1.94, 1.54, 5.82, 0.02, 0.11, 0.11, this._ps1Mat({ color: 0xd4a422 }), { collide: false, materialKey: 'santaHatFur' });

        this._addStaticBox('StairLampBase', 3.25, 3.21, 5.48, 0.24, 0.06, 0.18, this.materials.metal, { collide: false });
        this._addStaticBox('StairLampGlow', 3.25, 3.16, 5.48, 0.18, 0.06, 0.13,
            this._ps1Mat({ color: 0xfff0c2, emissive: 0xffd27d, emissiveIntensity: 1.0 }), { collide: false, materialKey: 'ceiling' });
    }

    _addInteriorDoor(cfg) {
        const pivot = new GameObject(cfg.name);
        pivot.transform.position.copy(cfg.pivotPos);
        const { x: w, y: h, z: d } = cfg.size;
        const ox = cfg.leafOffset.x;
        const oy = cfg.leafOffset.y;
        const oz = cfg.leafOffset.z;
        const isXLeaf = w >= d;

        if (cfg.hasGlass) {
            const botH = h * 0.44;
            const topH = 0.12;
            const sideT = 0.11;
            const glassH = h - botH - topH;

            const botPanel = new THREE.Mesh(
                new THREE.BoxGeometry(w, botH, d),
                cfg.doorMat
            );
            botPanel.position.set(ox, botH * 0.5, oz);
            pivot.transform.add(botPanel);
            this.blockerMeshes.push(botPanel);

            if (isXLeaf) {
                const span = w - sideT * 2;
                const sideL = new THREE.Mesh(new THREE.BoxGeometry(sideT, h - botH, d), cfg.doorMat);
                sideL.position.set(ox - w * 0.5 + sideT * 0.5, botH + (h - botH) * 0.5, oz);
                const sideR = new THREE.Mesh(new THREE.BoxGeometry(sideT, h - botH, d), cfg.doorMat);
                sideR.position.set(ox + w * 0.5 - sideT * 0.5, botH + (h - botH) * 0.5, oz);
                const topRail = new THREE.Mesh(new THREE.BoxGeometry(span, topH, d), cfg.doorMat);
                topRail.position.set(ox, h - topH * 0.5, oz);
                const pane = new THREE.Mesh(new THREE.BoxGeometry(span, glassH, d * 0.35), this.materials.glass);
                pane.position.set(ox, botH + glassH * 0.5, oz);
                pivot.transform.add(sideL, sideR, topRail, pane);
                this.blockerMeshes.push(sideL, sideR, topRail);
            } else {
                const span = d - sideT * 2;
                const sideL = new THREE.Mesh(new THREE.BoxGeometry(w, h - botH, sideT), cfg.doorMat);
                sideL.position.set(ox, botH + (h - botH) * 0.5, oz - d * 0.5 + sideT * 0.5);
                const sideR = new THREE.Mesh(new THREE.BoxGeometry(w, h - botH, sideT), cfg.doorMat);
                sideR.position.set(ox, botH + (h - botH) * 0.5, oz + d * 0.5 - sideT * 0.5);
                const topRail = new THREE.Mesh(new THREE.BoxGeometry(w, topH, span), cfg.doorMat);
                topRail.position.set(ox, h - topH * 0.5, oz);
                const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, glassH, span), this.materials.glass);
                pane.position.set(ox, botH + glassH * 0.5, oz);
                pivot.transform.add(sideL, sideR, topRail, pane);
                this.blockerMeshes.push(sideL, sideR, topRail);
            }
        } else {
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cfg.doorMat);
            leaf.position.set(ox, oy, oz);
            leaf.castShadow = true;
            pivot.transform.add(leaf);
            this.blockerMeshes.push(leaf);
        }

        this._addDoorHandles(pivot, cfg.size, cfg.leafOffset);

        const colSize = new THREE.Vector3(Math.max(w, 0.14), h, Math.max(d, 0.14));
        const col = pivot.addComponent(BoxCollider, colSize, cfg.leafOffset.clone());
        pivot.addComponent(RigidBody, { bodyType: 'static' });

        let isOpen = !!cfg.defaultOpen;
        let baseYaw = 0;
        this.world.animatedDoors.push({
            pivot,
            axis: 'y',
            getTarget: () => baseYaw + (isOpen ? cfg.openAngle : 0)
        });
        const applyState = (playSound, instant = false) => {
            if (instant) {
                pivot.transform.rotation.y = baseYaw + (isOpen ? cfg.openAngle : 0);
            }
            col.enabled = !isOpen;
            if (playSound && this.engine?.audioSystem) {
                this.engine.audioSystem.playSpatialOneShot('door_open', cfg.pivotPos);
            }
        };
        applyState(false, true);

        const doorObj = {
            name: cfg.name,
            label: cfg.label,
            pivot,
            isOpen: () => isOpen,
            setOpen: (val, sound = true, instant = false) => {
                const next = !!val;
                if (isOpen === next) return false;
                if (!next && !instant && this._isPlayerBlockingDoor(pivot, baseYaw, colSize, cfg.leafOffset)) {
                    return false;
                }
                isOpen = next;
                applyState(sound, instant);
                return true;
            },
            toggle: () => doorObj.setOpen(!isOpen, true, false)
        };

        this.engine.addGameObject(pivot);
        this.world.interiorDoors.push(doorObj);
        this._doorConfigs.set(cfg.name, cfg);
        const initialOpenAngle = cfg.openAngle;
        this._registerEditable(pivot.transform, cfg.name, {
            category: 'doors',
            groupId: null,
            extra: {
                gameObject: pivot,
                collide: true,
                blocker: true,
                doorCfg: cfg,
                initialOpenAngle,
                doorOpenOffset: isOpen ? cfg.openAngle : 0,
                getOpenAngle: () => cfg.openAngle,
                setOpenAngle: (a) => {
                    cfg.openAngle = a;
                    pivot.transform.userData.doorOpenOffset = isOpen ? cfg.openAngle : 0;
                    if (isOpen) pivot.transform.rotation.y = baseYaw + cfg.openAngle;
                },
                isOpen: () => isOpen,
                setOpenState: (v) => doorObj.setOpen(v, false, true),
                setBaseYaw: (y) => { baseYaw = y; }
            }
        });
        return doorObj;
    }

    _isPlayerBlockingDoor(pivot, baseYaw, colSize, leafOffset) {
        const player = this.engine?.player;
        if (!player) return false;

        const pPos = player.transform.position;
        const pCol = player.getComponent?.(BoxCollider);
        const pCenterX = pPos.x + (pCol?.offset?.x || 0);
        const pCenterY = pPos.y + (pCol?.offset?.y ?? 0.85);
        const pCenterZ = pPos.z + (pCol?.offset?.z || 0);
        const pHalfX = (pCol?.size?.x ?? 0.46) * 0.5;
        const pHalfY = (pCol?.size?.y ?? 1.70) * 0.5;
        const pHalfZ = (pCol?.size?.z ?? 0.46) * 0.5;

        const dx = pCenterX - pivot.transform.position.x;
        const dy = pCenterY - pivot.transform.position.y;
        const dz = pCenterZ - pivot.transform.position.z;
        const cos = Math.cos(-baseYaw);
        const sin = Math.sin(-baseYaw);
        const localX = dx * cos + dz * sin;
        const localZ = -dx * sin + dz * cos;

        const projHalfX = Math.abs(cos) * pHalfX + Math.abs(sin) * pHalfZ;
        const projHalfZ = Math.abs(sin) * pHalfX + Math.abs(cos) * pHalfZ;
        const margin = 0.04;

        const overlapX = Math.abs(localX - leafOffset.x) < (colSize.x * 0.5 + projHalfX + margin);
        const overlapY = Math.abs(dy - leafOffset.y) < (colSize.y * 0.5 + pHalfY);
        const overlapZ = Math.abs(localZ - leafOffset.z) < (colSize.z * 0.5 + projHalfZ + margin);
        return overlapX && overlapY && overlapZ;
    }

    _addDoorHandles(pivot, size, leafOffset, handleY = 1.0) {
        const isXLeaf = size.x >= size.z;
        const span = isXLeaf ? size.x : size.z;
        const thickness = isXLeaf ? size.z : size.x;
        const offsetAlong = isXLeaf ? leafOffset.x : leafOffset.z;
        const offsetPerp = isXLeaf ? leafOffset.z : leafOffset.x;
        const dir = Math.sign(offsetAlong) || 1;
        const alongPos = offsetAlong + dir * (span * 0.5 - 0.055);
        const leverLen = 0.105;
        const leverAlong = alongPos - dir * (leverLen * 0.5 - 0.01);

        const makeBox = (alongSize, height, perpSize, along, y, perp) => {
            const geom = isXLeaf
                ? new THREE.BoxGeometry(alongSize, height, perpSize)
                : new THREE.BoxGeometry(perpSize, height, alongSize);
            const mesh = new THREE.Mesh(geom, this.materials.metal);
            mesh.position.set(isXLeaf ? along : perp, y, isXLeaf ? perp : along);
            return mesh;
        };

        for (const side of [-1, 1]) {
            const face = offsetPerp + side * (thickness * 0.5);
            const plate = makeBox(0.034, 0.145, 0.008, alongPos, handleY, face + side * 0.004);
            const neck = makeBox(0.018, 0.018, 0.032, alongPos, handleY + 0.015, face + side * 0.024);
            const lever = makeBox(leverLen, 0.016, 0.018, leverAlong, handleY + 0.015, face + side * 0.049);
            pivot.transform.add(plate, neck, lever);
        }
    }

    _buildHallFurniture() {
        this._currentCategory = 'furniture';
        this._currentGroupId = null;

        this._addStaticBox('WallCarpet', -3.41, 1.48, -1.0, 0.03, 1.45, 2.35, this.materials.carpet, { collide: false, blocker: false, worldUV: false });

        this._currentGroupId = 'group_sofa';
        this._addStaticBox('SofaBase', -2.92, 0.46, -1.0, 1.02, 0.24, 2.1, this.materials.sofaFabric, { castShadow: true });
        // Solid dark underside lining so looking up from under the sofa never shows backfaces or gaps
        const underLiningMat = this._ps1Mat({ color: 0x161210, roughness: 0.95, doubleSided: true });
        this._addStaticBox('SofaUnderLining', -2.92, 0.335, -1.0, 1.00, 0.02, 2.08, underLiningMat, { collide: false, blocker: true });
        this._addStaticBox('SofaBack', -3.32, 0.74, -1.0, 0.22, 0.68, 2.1, this.materials.sofaFabric, { castShadow: true });
        this._addStaticBox('SofaArmN', -2.92, 0.65, -2.01, 1.02, 0.22, 0.12, this.materials.sofaFabric, { castShadow: true });
        this._addStaticBox('SofaArmS', -2.92, 0.65, 0.01, 1.02, 0.22, 0.12, this.materials.sofaFabric, { castShadow: true });
        [
            [-3.36, -1.98],
            [-3.36, -0.02],
            [-2.48, -1.98],
            [-2.48, -0.02]
        ].forEach(([lx, lz], idx) => {
            this._addStaticBox(`SofaLeg_${idx}`, lx, 0.16, lz, 0.08, 0.32, 0.08, this.materials.woodDark, { collide: false });
        });

        // Draped sofa throw cover over seat & backrest + pleated front skirt flap
        const throwMat = this._ps1Mat({ map: this.materials.carpet.map, color: 0xc89b7b, roughness: 0.92, doubleSided: true });
        const sofaSeatThrow = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.025, 1.92), throwMat);
        sofaSeatThrow.position.set(-2.88, 0.585, -1.0);
        const sofaBackThrow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 1.92), throwMat);
        sofaBackThrow.position.set(-3.20, 0.78, -1.0);
        sofaBackThrow.rotation.z = -0.06;
        this.scene.add(sofaSeatThrow, sofaBackThrow);
        this._registerEditable(sofaSeatThrow, 'SofaSeatThrow', {
            groupId: 'group_sofa',
            extra: { isSceneProp: true, primaryMesh: sofaSeatThrow, materialKey: 'carpet' }
        });
        this._registerEditable(sofaBackThrow, 'SofaBackThrow', {
            groupId: 'group_sofa',
            extra: { isSceneProp: true, primaryMesh: sofaBackThrow, materialKey: 'carpet' }
        });

        const sofaCoverPivot = new GameObject('SofaCoverPivot');
        sofaCoverPivot.transform.position.set(-2.41, 0.35, -1.0);
        const skirtGroup = new THREE.Group();
        const mainSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.33, 1.94), throwMat);
        mainSkirt.position.set(0, -0.165, 0);
        skirtGroup.add(mainSkirt);
        for (let f = -4; f <= 4; f++) {
            const pleat = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.32, 0.07), throwMat);
            pleat.position.set(0.005, -0.165, f * 0.21);
            skirtGroup.add(pleat);
        }
        sofaCoverPivot.transform.add(skirtGroup);
        this.engine.addGameObject(sofaCoverPivot);
        this._registerEditable(sofaCoverPivot.transform, 'SofaCoverPivot', {
            extra: { gameObject: sofaCoverPivot, primaryMesh: mainSkirt, materialKey: 'carpet' }
        });

        this._registerHidingSpot({
            id: 'sofa',
            label: 'hide.sofa.label',
            hidePos: new THREE.Vector3(-2.78, 0.16, -1.0),
            peekPos: new THREE.Vector3(-2.35, 0.18, -1.0),
            lookYaw: -Math.PI / 2,
            doorPivot: sofaCoverPivot,
            doorClosedAngle: 0,
            doorOpenAngle: 1.05,
            axis: 'z',
            enterObject: this._addStaticBox('SofaHideTrigger', -2.42, 0.24, -1.0, 0.2, 0.42, 1.8, this.materials.sofaFabric, { collide: false, blocker: false }).go,
            enterPrompt: () => t('hide.sofa.enter'),
            doorPromptClose: () => t('hide.sofa.close'),
            doorPromptOpen: () => t('hide.sofa.open'),
            defaultClosed: true
        });
        this._currentGroupId = null;

        this._currentGroupId = 'group_armchair';
        this._addStaticBox('ArmchairSeat', -2.6, 0.36, -2.65, 0.85, 0.26, 0.85, this.materials.sofaFabric);
        this._addStaticBox('ArmchairBack', -2.95, 0.68, -2.65, 0.18, 0.62, 0.85, this.materials.sofaFabric);
        this._addStaticBox('ArmchairArmN', -2.6, 0.56, -3.02, 0.82, 0.18, 0.11, this.materials.sofaFabric);
        this._addStaticBox('ArmchairArmS', -2.6, 0.56, -2.28, 0.82, 0.18, 0.11, this.materials.sofaFabric);
        [
            [-2.96, -3.02],
            [-2.96, -2.28],
            [-2.24, -3.02],
            [-2.24, -2.28]
        ].forEach(([lx, lz], idx) => {
            this._addStaticBox(`ArmchairLeg_${idx}`, lx, 0.12, lz, 0.07, 0.24, 0.07, this.materials.woodDark, { collide: false });
        });
        this._currentGroupId = null;

        // Swapped: Detailed Soviet Sideboard ("Сервант") along the South wall of the Hall (facing North -Z)
        this._currentGroupId = 'group_sideboard';
        this._addStaticBox('SideboardLower', -0.35, 0.43, 1.18, 1.54, 0.78, 0.52, this.materials.woodDark, { castShadow: true });
        this._addStaticBox('SideboardCountertop', -0.35, 0.835, 1.16, 1.58, 0.035, 0.56, this.materials.woodFrame, { collide: false });
        this._addStaticBox('SideboardBackPanel', -0.35, 1.38, 1.41, 1.54, 1.08, 0.03, this.materials.woodDark, { collide: false });
        this._addStaticBox('SideboardTopCornice', -0.35, 1.92, 1.24, 1.56, 0.05, 0.40, this.materials.woodDark, { collide: false });

        // Hollow upper vitrine cabinets ("вырез в верхних шкафчиках серванта за стеклом") instead of solid wood blocks
        const buildHollowUpperVitrine = (name, cx, cy, cz) => {
            const vitGO = new GameObject(name);
            vitGO.transform.position.set(cx, cy, cz);
            const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.05, 0.36), this.materials.woodDark);
            wallL.position.set(-0.224, 0, 0);
            const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.05, 0.36), this.materials.woodDark);
            wallR.position.set(0.224, 0, 0);
            const wallTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.36), this.materials.woodDark);
            wallTop.position.set(0, 0.5075, 0);
            const wallBot = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.032, 0.36), this.materials.woodDark);
            wallBot.position.set(0, -0.509, 0);
            const wallBack = new THREE.Mesh(new THREE.BoxGeometry(0.416, 0.985, 0.022), this.materials.woodFrame);
            wallBack.position.set(0, 0, 0.168);
            const midShelf = new THREE.Mesh(new THREE.BoxGeometry(0.416, 0.022, 0.31), this.materials.woodFrame);
            midShelf.position.set(0, -0.02, 0.005);
            const glassFront = new THREE.Mesh(new THREE.BoxGeometry(0.416, 0.98, 0.014), this.materials.glass);
            glassFront.position.set(0, 0, -0.172);
            vitGO.transform.add(wallL, wallR, wallTop, wallBot, wallBack, midShelf, glassFront);
            vitGO.addComponent(BoxCollider, new THREE.Vector3(0.48, 1.05, 0.36));
            vitGO.addComponent(RigidBody, { bodyType: 'static' });
            this.blockerMeshes.push(wallL, wallR, wallTop, wallBot, wallBack);
            this.engine.addGameObject(vitGO);
            this._registerEditable(vitGO.transform, name, {
                category: 'furniture',
                groupId: 'group_sideboard',
                extra: { gameObject: vitGO, primaryMesh: wallL, materialKey: 'woodDark', collide: true, blocker: true }
            });
            return vitGO;
        };
        buildHollowUpperVitrine('SideboardUpperL', -0.87, 1.38, 1.25);
        buildHollowUpperVitrine('SideboardUpperR', 0.17, 1.38, 1.25);

        // Real-time planar reflective mirror in the central niche of the sideboard (faces North -Z, well in front of back panel)
        const sbMirrorGO = new GameObject('SideboardMirror');
        sbMirrorGO.transform.position.set(-0.35, 1.36, 1.365);
        sbMirrorGO.transform.rotation.y = Math.PI;
        const sbMirrorReflector = this._createPlanarReflector(0.50, 0.88, {
            tintColor: 0xe6eff5,
            reflectivity: 0.94
        });
        sbMirrorReflector.position.z = 0.0;
        sbMirrorGO.transform.add(sbMirrorReflector);
        this.engine.addGameObject(sbMirrorGO);
        this._registerEditable(sbMirrorGO.transform, 'SideboardMirror', {
            category: 'furniture',
            groupId: 'group_sideboard',
            extra: { gameObject: sbMirrorGO, primaryMesh: sbMirrorReflector, materialKey: 'mirror', collide: false }
        });
        this.world.sideboardMirror = sbMirrorGO.transform;

        // Detailed sideboard doors, shelves, porcelain dishes & Soviet decor sitting cleanly inside the hollow vitrine cavities
        const sbDetailsGroup = new THREE.Group();
        sbDetailsGroup.position.set(-0.35, 0, 1.18);
        const brassMat = this._ps1Mat({ color: 0xd4af37, roughness: 0.35, metalness: 0.65 });
        const porcelainWhite = this._ps1Mat({ color: 0xf4f0e6, roughness: 0.32 });
        const porcelainRed = this._ps1Mat({ color: 0xb82424, roughness: 0.35 });
        const porcelainCobalt = this._ps1Mat({ color: 0x24427a, roughness: 0.35 });

        // 4 short wooden feet under the sideboard
        for (const [fx, fz] of [[-0.70, -0.20], [0.70, -0.20], [-0.70, 0.20], [0.70, 0.20]]) {
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), this.materials.woodFrame);
            foot.position.set(fx, 0.03, fz);
            sbDetailsGroup.add(foot);
        }
        // 3 Lower cabinet door panels + brass handles
        [-0.49, 0, 0.49].forEach((dx, idx) => {
            const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.022), this.materials.woodFrame);
            doorPanel.position.set(dx, 0.44, -0.265);
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.025), brassMat);
            handle.position.set(dx + (idx === 0 ? 0.17 : -0.17), 0.48, -0.282);
            sbDetailsGroup.add(doorPanel, handle);
        });
        // Mirror frame moldings & middle glass shelf in the central niche
        const mFrameT = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.025, 0.03), this.materials.woodFrame);
        mFrameT.position.set(0, 1.82, 0.20);
        const mFrameB = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.025, 0.03), this.materials.woodFrame);
        mFrameB.position.set(0, 0.90, 0.20);
        const mirrorShelf = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.016, 0.22), this.materials.glass);
        mirrorShelf.position.set(0, 1.36, 0.08);
        sbDetailsGroup.add(mFrameT, mFrameB, mirrorShelf);

        // Porcelain Tea Service & Collector Plates placed INSIDE the left & right vitrine shelves (z = +0.06 in sbDetailsGroup -> world z = 1.24)
        // 1. Upright decorative collector plates inside Left & Right upper vitrine shelves
        for (const [px, pCol, rimCol] of [[-0.52, porcelainCobalt, brassMat], [0.52, porcelainWhite, porcelainRed]]) {
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 12), pCol);
            plate.rotation.x = Math.PI / 2 - 0.18;
            plate.position.set(px, 1.50, 0.12);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.008, 5, 12), rimCol);
            rim.rotation.y = 0;
            rim.position.set(px, 1.50, 0.112);
            sbDetailsGroup.add(plate, rim);
        }
        // 2. Soviet red porcelain teapot on the central mirror glass shelf
        const teapot = new THREE.Group();
        teapot.position.set(0.0, 1.37, 0.06);
        const tpBody = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), porcelainRed);
        tpBody.position.y = 0.055;
        const tpLid = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.016, 8), porcelainWhite);
        tpLid.position.y = 0.112;
        const tpKnob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), brassMat);
        tpKnob.position.y = 0.126;
        const tpSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.065, 6), porcelainRed);
        tpSpout.position.set(0.062, 0.068, 0);
        tpSpout.rotation.z = -0.65;
        const tpHandle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 5, 8), porcelainWhite);
        tpHandle.position.set(-0.055, 0.062, 0);
        teapot.add(tpBody, tpLid, tpKnob, tpSpout, tpHandle);
        sbDetailsGroup.add(teapot);

        // 3. 4 Porcelain teacups on saucers inside the central shelf & left vitrine bottom shelf
        const cupPositions = [
            [-0.17, 1.37, 0.05],
            [0.17, 1.37, 0.05],
            [-0.59, 0.892, 0.05],
            [-0.45, 0.892, 0.05]
        ];
        for (const [cx, cy, cz] of cupPositions) {
            const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.026, 0.008, 8), porcelainWhite);
            saucer.position.set(cx, cy + 0.004, cz);
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.036, 8), porcelainRed);
            cup.position.set(cx, cy + 0.024, cz);
            sbDetailsGroup.add(saucer, cup);
        }
        // 4. Stack of porcelain dinner plates & crystal candy vase inside the Right Vitrine bottom shelf (x = 0.44..0.60, z = +0.06)
        for (let p = 0; p < 5; p++) {
            const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.068, 0.012, 10), p % 2 === 0 ? porcelainWhite : porcelainCobalt);
            pl.position.set(0.45, 0.898 + p * 0.013, 0.06);
            sbDetailsGroup.add(pl);
        }
        const candyVase = new THREE.Group();
        candyVase.position.set(0.60, 0.892, 0.06);
        const cvFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.035, 8), this.materials.crystal);
        cvFoot.position.y = 0.018;
        const cvBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.028, 0.065, 8), this.materials.crystal);
        cvBowl.position.y = 0.068;
        candyVase.add(cvFoot, cvBowl);
        sbDetailsGroup.add(candyVase);

        // 5. Small vintage photo frame & wooden Matryoshka figurine inside the Left Vitrine shelves
        const photoFrame = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.015), brassMat);
        photoFrame.position.set(-0.62, 1.44, 0.03);
        photoFrame.rotation.y = 0.25;
        photoFrame.rotation.x = -0.12;
        const matryoshka = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.075, 8), porcelainRed);
        matryoshka.position.set(-0.52, 0.93, 0.13);
        const matHead = new THREE.Mesh(new THREE.SphereGeometry(0.019, 7, 6), porcelainWhite);
        matHead.position.set(-0.52, 0.978, 0.13);
        sbDetailsGroup.add(photoFrame, matryoshka, matHead);

        this.scene.add(sbDetailsGroup);
        this._registerEditable(sbDetailsGroup, 'SideboardDishes', {
            category: 'furniture',
            groupId: 'group_sideboard',
            extra: { isSceneProp: true, primaryMesh: tpBody, materialKey: 'woodFrame' }
        });

        // Interactive Crystal Set on a silver tray: Crystal Decanter + 6 Stemmed Crystal Goblets
        const crystalGO = new GameObject('SideboardCrystal');
        crystalGO.transform.position.set(-0.35, 0.855, 1.12);
        const crystalTray = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.22), this.materials.metal);
        crystalTray.position.y = 0.006;
        crystalGO.transform.add(crystalTray);
        const sbDecanter = this.createCrystalDecanterModel(0.95);
        sbDecanter.position.set(0, 0.012, -0.02);
        crystalGO.transform.add(sbDecanter);
        const sbGobletOffsets = [
            [-0.16, -0.04], [-0.09, 0.05], [-0.16, 0.05],
            [0.09, 0.05], [0.16, 0.05], [0.16, -0.04]
        ];
        for (const [gx, gz] of sbGobletOffsets) {
            const gob = this.createCrystalGobletModel(0.95, false);
            gob.position.set(gx, 0.012, gz);
            crystalGO.transform.add(gob);
        }
        this.engine.addGameObject(crystalGO);
        this._registerEditable(crystalGO.transform, 'SideboardCrystal', {
            groupId: 'group_sideboard',
            activatedGroup: 'pickup',
            extra: { gameObject: crystalGO, materialKey: 'crystal' }
        });
        this.world.sideboardCrystal = crystalGO;
        this._currentGroupId = null;

        const fallenMirror = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.85), this.materials.mirror);
        fallenMirror.position.set(-0.45, 0.03, 0.55);
        fallenMirror.rotation.y = 0.4;
        fallenMirror.visible = false;
        this.scene.add(fallenMirror);
        this._registerEditable(fallenMirror, 'FallenMirror', {
            category: 'activated',
            activatedGroup: 'act4',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: fallenMirror, materialKey: 'mirror' }
        });
        this.world.fallenMirror = fallenMirror;

        // WallClock moved to Kitchen wall above the doorway so 3D clock ticking comes from the kitchen
        const clockGO = new GameObject('WallClock');
        clockGO.transform.position.set(2.90, 2.25, -0.71);
        clockGO.transform.rotation.y = -Math.PI / 2;
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 12), this.materials.clockDial);
        dial.rotation.z = Math.PI / 2;
        const minutePivot = new THREE.Object3D();
        minutePivot.position.set(-0.026, 0, 0);
        const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.13, 0.015), this.materials.darkSilhouette);
        minHand.position.set(0, 0.06, 0);
        minutePivot.add(minHand);
        const hourPivot = new THREE.Object3D();
        hourPivot.position.set(-0.03, 0, 0);
        const hrHand = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.09, 0.02), this.materials.darkSilhouette);
        hrHand.position.set(0, 0.04, 0);
        hourPivot.add(hrHand);
        clockGO.transform.add(dial, minutePivot, hourPivot);
        this.engine.addGameObject(clockGO);
        this._registerEditable(clockGO.transform, 'WallClock', {
            extra: { gameObject: clockGO, primaryMesh: dial, materialKey: 'clockDial' }
        });
        this.world.setClockTime = (minsAfter2330) => {
            const totalMin = 30 + minsAfter2330;
            minutePivot.rotation.x = (totalMin / 60) * Math.PI * 2;
            hourPivot.rotation.x = ((11 + totalMin / 60) / 12) * Math.PI * 2;
        };
        this.world.setClockTime(0);

        // Swapped: TV & Detailed Soviet TV Cabinet ("Тумба под телевизор") along the East wall of the Hall
        this._currentGroupId = 'group_tv';
        this.world.crtTV = new CRTTelevision(this.world.lights.tvLight);
        this._addStaticBox('TVStand', 1.60, 0.38, -1.0, 0.54, 0.52, 0.90, this.materials.woodDark, { castShadow: true });

        // Detailed TV Cabinet elements: 4 angled mid-century legs, top overhang board, open shelf with TV guide, 2 cabinet doors with handles, and lace doily
        const tvStandDetails = new THREE.Group();
        tvStandDetails.position.set(1.60, 0, -1.0);
        const tvTopBoard = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.035, 0.96), this.materials.woodFrame);
        tvTopBoard.position.set(0, 0.66, 0);
        const tvDoily = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.006, 8), porcelainWhite);
        tvDoily.position.set(-0.02, 0.681, 0);
        // Open upper shelf trim & vintage TV guide magazine
        const tvShelfInsert = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.84), this.materials.darkSilhouette);
        tvShelfInsert.position.set(-0.265, 0.54, 0);
        const tvShelfBoard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.86), this.materials.woodFrame);
        tvShelfBoard.position.set(-0.25, 0.46, 0);
        const tvMagazine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.022, 0.26), this._ps1Mat({ color: 0xd8cdb8, roughness: 0.85 }));
        tvMagazine.position.set(-0.21, 0.485, -0.18);
        tvMagazine.rotation.y = 0.14;
        const tvCassetteBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.22), this._ps1Mat({ color: 0x263242, roughness: 0.7 }));
        tvCassetteBox.position.set(-0.21, 0.49, 0.20);
        // Two lower cabinet doors facing West (-X) with handles
        const tvDoorL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.30, 0.41), this.materials.woodFrame);
        tvDoorL.position.set(-0.275, 0.29, -0.215);
        const tvDoorR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.30, 0.41), this.materials.woodFrame);
        tvDoorR.position.set(-0.275, 0.29, 0.215);
        const tvHandleL = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.08, 0.018), brassMat);
        tvHandleL.position.set(-0.292, 0.31, -0.05);
        const tvHandleR = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.08, 0.018), brassMat);
        tvHandleR.position.set(-0.292, 0.31, 0.05);
        tvStandDetails.add(
            tvTopBoard, tvDoily, tvShelfInsert, tvShelfBoard,
            tvMagazine, tvCassetteBox, tvDoorL, tvDoorR, tvHandleL, tvHandleR
        );
        // 4 angled mid-century legs
        [
            [-0.21, -0.39, -0.12, -0.12],
            [0.21, -0.39, 0.12, -0.12],
            [-0.21, 0.39, -0.12, 0.12],
            [0.21, 0.39, 0.12, 0.12]
        ].forEach(([lx, lz, rx, rz]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.016, 0.16, 6), this.materials.woodFrame);
            leg.position.set(lx, 0.075, lz);
            leg.rotation.set(rx, 0, rz);
            const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.035, 6), brassMat);
            tip.position.set(lx, 0.018, lz);
            tvStandDetails.add(leg, tip);
        });
        this.scene.add(tvStandDetails);
        this._registerEditable(tvStandDetails, 'TVStandDetails', {
            category: 'furniture',
            groupId: 'group_tv',
            extra: { isSceneProp: true, primaryMesh: tvTopBoard, materialKey: 'woodFrame' }
        });

        const tvGO = new GameObject('CRT_TV');
        tvGO.transform.position.set(1.58, 0.94, -1.0);
        // Rotated +Math.PI / 2 so local -Z (tvScreen) faces West (-X) directly toward the table and sofa
        tvGO.transform.rotation.y = Math.PI / 2;
        const tvBody = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 0.44), this.materials.woodDark);
        // Hollow 4-bar bezel around the screen so no solid surface sits coplanar behind tvScreen
        const bezelMat = this._ps1Mat({ color: 0x22201e, roughness: 0.7 });
        const tvBezelT = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.045, 0.018), bezelMat);
        tvBezelT.position.set(0, 0.225, -0.222);
        const tvBezelB = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.055, 0.018), bezelMat);
        tvBezelB.position.set(0, -0.22, -0.222);
        const tvBezelL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.40, 0.018), bezelMat);
        tvBezelL.position.set(-0.30, 0.01, -0.222);
        const tvBezelR = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.40, 0.018), bezelMat);
        tvBezelR.position.set(0.26, 0.01, -0.222);
        const tvScreenMat = new THREE.MeshBasicMaterial({
            map: this.world.crtTV.texture,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });
        const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.49, 0.39), tvScreenMat);
        tvScreen.position.set(-0.035, 0.01, -0.232);
        tvScreen.rotation.y = Math.PI;
        const tvDial1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.024, 8), brassMat);
        tvDial1.rotation.x = Math.PI / 2;
        tvDial1.position.set(0.265, 0.11, -0.236);
        const tvDial2 = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.024, 8), brassMat);
        tvDial2.rotation.x = Math.PI / 2;
        tvDial2.position.set(0.265, 0.02, -0.236);
        const antenna1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), this.materials.metal);
        antenna1.position.set(-0.1, 0.38, 0);
        antenna1.rotation.z = 0.4;
        const antenna2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), this.materials.metal);
        antenna2.position.set(0.1, 0.38, 0);
        antenna2.rotation.z = -0.4;
        tvGO.transform.add(tvBody, tvBezelT, tvBezelB, tvBezelL, tvBezelR, tvScreen, tvDial1, tvDial2, antenna1, antenna2);
        this.engine.addGameObject(tvGO);
        this._registerEditable(tvGO.transform, 'CRT_TV', {
            extra: { gameObject: tvGO, primaryMesh: tvBody, materialKey: 'woodDark' }
        });
        this.world.tvGameObject = tvGO;
        this._currentGroupId = null;

        // Clean Folding Table ("Стол-книжка"): center tabletop + 2 drop-leaf wings + 4 swinging leg-doors under the middle tabletop
        const tableBalconyPos = new THREE.Vector3(-0.55, 0, -4.25);
        const tableBalconyRot = new THREE.Euler(0, 0, 0);
        const tableHallPos = new THREE.Vector3(-1.35, 0, -1.0);
        const tableHallRot = new THREE.Euler(0, Math.PI / 2, 0);
        const tableGO = new GameObject('FoldingTable');
        tableGO.transform.position.copy(tableBalconyPos);
        tableGO.transform.rotation.copy(tableBalconyRot);
        const tableCol = tableGO.addComponent(BoxCollider, new THREE.Vector3(0.42, 0.76, 0.88), new THREE.Vector3(0, 0.38, 0));
        const tableRB = tableGO.addComponent(RigidBody, { bodyType: 'static' });

        // Center tabletop board + 4 corner posts under the middle tabletop
        const tableCenter = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.036, 0.88), this.materials.woodDark);
        tableCenter.position.set(0, 0.73, 0);
        const centerApron = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.82), this.materials.woodFrame);
        centerApron.position.set(0, -0.04, 0);
        tableCenter.add(centerApron);
        for (const [lx, lz] of [[-0.145, -0.41], [0.145, -0.41], [-0.145, 0.41], [0.145, 0.41]]) {
            const cLeg = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.71, 0.042), this.materials.woodFrame);
            cLeg.position.set(lx, -0.37, lz);
            tableCenter.add(cLeg);
        }
        for (const sz of [-0.41, 0.41]) {
            const tieBar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.032, 0.032), this.materials.woodFrame);
            tieBar.position.set(0, -0.60, sz);
            tableCenter.add(tieBar);
        }

        // Swinging double-door leg frames ("ножки как дверцы под средней столешницей") on both sides:
        // When closed (folded), each pair is folded inward under the middle tabletop behind the closed left/right wings.
        // When opening a wing, the two leg-doors on that side swing outward from inside like double doors (one left, one right).
        const buildSwingingLegDoor = (dirX, sideZ) => {
            const doorPivot = new THREE.Group();
            doorPivot.position.set(dirX * 0.135, 0, sideZ * 0.38);
            const outerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.70, 0.042), this.materials.woodFrame);
            outerLeg.position.set(dirX * 0.35, 0.35, 0);
            const innerHingePost = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.56, 0.034), this.materials.woodFrame);
            innerHingePost.position.set(dirX * 0.02, 0.39, 0);
            const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.038, 0.032), this.materials.woodFrame);
            topBar.position.set(dirX * 0.185, 0.65, 0);
            const botBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.038, 0.032), this.materials.woodFrame);
            botBar.position.set(dirX * 0.185, 0.13, 0);
            doorPivot.add(outerLeg, innerHingePost, topBar, botBar);
            const closedYaw = dirX * sideZ * (Math.PI / 2);
            doorPivot.rotation.y = closedYaw;
            return { doorPivot, outerLeg, closedYaw };
        };

        const legLFront = buildSwingingLegDoor(-1, -1); // closedYaw = +PI/2, opens outward to 0 (right)
        const legLBack = buildSwingingLegDoor(-1, 1);   // closedYaw = -PI/2, opens outward to 0 (left)
        const legRFront = buildSwingingLegDoor(1, -1);  // closedYaw = -PI/2, opens outward to 0 (left)
        const legRBack = buildSwingingLegDoor(1, 1);    // closedYaw = +PI/2, opens outward to 0 (right)

        const legLPivot = new THREE.Group();
        legLPivot.add(legLFront.doorPivot, legLBack.doorPivot);
        const legLPost = legLFront.outerLeg;

        const legRPivot = new THREE.Group();
        legRPivot.add(legRFront.doorPivot, legRBack.doorPivot);
        const legRPost = legRFront.outerLeg;

        // Hinged pivots for the two folding wings (0.62m long so when folded down they cover the leg-doors inside)
        const wingLPivot = new THREE.Group();
        wingLPivot.position.set(-0.18, 0.73, 0);
        const tableWingL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.036, 0.88), this.materials.woodDark);
        tableWingL.position.set(-0.31, 0, 0);
        wingLPivot.add(tableWingL);
        wingLPivot.rotation.z = Math.PI / 2; // folded down initially, closing over the left leg-doors

        const wingRPivot = new THREE.Group();
        wingRPivot.position.set(0.18, 0.73, 0);
        const tableWingR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.036, 0.88), this.materials.woodDark);
        tableWingR.position.set(0.31, 0, 0);
        wingRPivot.add(tableWingR);
        wingRPivot.rotation.z = -Math.PI / 2; // folded down initially, closing over the right leg-doors

        // Stretched slightly longer along X (1.66m) so the tablecloth completely covers both unfolded wings with overhang
        const tableclothMesh = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.024, 0.94), this.materials.tablecloth);
        tableclothMesh.position.set(0, 0.755, 0);
        // Hanging tablecloth skirt flaps on all 4 sides
        const tcHangL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.20, 0.94), this.materials.tablecloth);
        tcHangL.position.set(-0.82, -0.10, 0);
        const tcHangR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.20, 0.94), this.materials.tablecloth);
        tcHangR.position.set(0.82, -0.10, 0);
        const tcHangN = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.20, 0.024), this.materials.tablecloth);
        tcHangN.position.set(0, -0.10, -0.46);
        const tcHangS = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.20, 0.024), this.materials.tablecloth);
        tcHangS.position.set(0, -0.10, 0.46);
        tableclothMesh.add(tcHangL, tcHangR, tcHangN, tcHangS);
        tableclothMesh.visible = false;

        tableGO.transform.add(tableCenter, wingLPivot, wingRPivot, legLPivot, legRPivot, tableclothMesh);
        this.engine.addGameObject(tableGO);
        this._registerEditable(tableGO.transform, 'FoldingTable', {
            groupId: 'group_table_set',
            extra: { gameObject: tableGO, primaryMesh: tableCenter, materialKey: 'woodDark', collide: true }
        });
        this._registerEditable(wingLPivot, 'TableWingL', {
            category: 'activated',
            groupId: 'group_table_set',
            activatedGroup: 'table',
            extra: { isSceneProp: true, primaryMesh: tableWingL, materialKey: 'woodDark' }
        });
        this._registerEditable(wingRPivot, 'TableWingR', {
            category: 'activated',
            groupId: 'group_table_set',
            activatedGroup: 'table',
            extra: { isSceneProp: true, primaryMesh: tableWingR, materialKey: 'woodDark' }
        });
        this._registerEditable(legLPivot, 'TableLegL', {
            category: 'activated',
            groupId: 'group_table_set',
            activatedGroup: 'table',
            extra: { isSceneProp: true, primaryMesh: legLPost, materialKey: 'woodFrame' }
        });
        this._registerEditable(legRPivot, 'TableLegR', {
            category: 'activated',
            groupId: 'group_table_set',
            activatedGroup: 'table',
            extra: { isSceneProp: true, primaryMesh: legRPost, materialKey: 'woodFrame' }
        });
        this._registerEditable(tableclothMesh, 'Tablecloth', {
            category: 'activated',
            groupId: 'group_table_set',
            activatedGroup: 'table',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: tableclothMesh, materialKey: 'tablecloth' }
        });

        // Glowing floor highlight square where the player must place the table in front of the sofa
        const zoneGroup = new GameObject('TablePlacementZone');
        zoneGroup.transform.position.copy(tableHallPos);
        const zoneFillMat = new THREE.MeshBasicMaterial({
            color: 0xffd166,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const zoneBorderMat = new THREE.MeshBasicMaterial({
            color: 0xffe484,
            transparent: true,
            opacity: 0.75,
            depthWrite: false
        });
        const zoneFill = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.56), zoneFillMat);
        zoneFill.rotation.x = -Math.PI / 2;
        zoneFill.position.y = 0.014;
        const bN = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.015, 0.04), zoneBorderMat);
        bN.position.set(0, 0.016, -0.78);
        const bS = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.015, 0.04), zoneBorderMat);
        bS.position.set(0, 0.016, 0.78);
        const bW = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 1.56), zoneBorderMat);
        bW.position.set(-0.48, 0.016, 0);
        const bE = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 1.56), zoneBorderMat);
        bE.position.set(0.48, 0.016, 0);
        const zoneHitBox = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.8, 1.6),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
        );
        zoneHitBox.position.y = 0.4;
        zoneGroup.transform.add(zoneFill, bN, bS, bW, bE, zoneHitBox);
        zoneGroup.transform.visible = false;
        this.engine.addGameObject(zoneGroup);
        this._registerEditable(zoneGroup.transform, 'TablePlacementZone', {
            category: 'gameplay',
            activatedGroup: 'table',
            defaultHidden: true,
            extra: { gameObject: zoneGroup, primaryMesh: zoneFill, collide: false, blocker: false }
        });
        this.world.tablePlacementZone = {
            go: zoneGroup,
            fillMat: zoneFillMat,
            borderMat: zoneBorderMat
        };

        // Glowing floor highlight square & placed mesh for the kitchen stool beside the table
        const stoolHallPos = new THREE.Vector3(-1.35, 0, -1.96);
        const stoolZoneGO = new GameObject('StoolPlacementZone');
        stoolZoneGO.transform.position.copy(stoolHallPos);
        const sZoneFill = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.48), zoneFillMat.clone());
        sZoneFill.rotation.x = -Math.PI / 2;
        sZoneFill.position.y = 0.014;
        const sZoneHit = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.7, 0.65),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
        );
        sZoneHit.position.y = 0.35;
        stoolZoneGO.transform.add(sZoneFill, sZoneHit);
        stoolZoneGO.transform.visible = false;
        this.engine.addGameObject(stoolZoneGO);
        this._registerEditable(stoolZoneGO.transform, 'StoolPlacementZone', {
            category: 'gameplay',
            activatedGroup: 'table',
            defaultHidden: true,
            extra: { gameObject: stoolZoneGO, primaryMesh: sZoneFill, collide: false, blocker: false }
        });

        const placedStoolGO = new GameObject('PlacedHallStool');
        placedStoolGO.transform.position.copy(stoolHallPos);
        placedStoolGO.transform.add(this.createStoolModel(1.0));
        placedStoolGO.transform.visible = false;
        this.engine.addGameObject(placedStoolGO);
        this._registerEditable(placedStoolGO.transform, 'PlacedHallStool', {
            category: 'activated',
            groupId: 'group_table_set',
            activatedGroup: 'table',
            defaultHidden: true,
            extra: { gameObject: placedStoolGO, materialKey: 'woodDark' }
        });
        this.world.stoolPlacementZone = stoolZoneGO;
        this.world.placedHallStool = placedStoolGO;

        const makeTableProp = (mesh) => {
            mesh.visible = false;
            tableGO.transform.add(mesh);
            return mesh;
        };
        const crystalGroup = new THREE.Group();
        const crystalGlasses = [];
        const tableGobletPositions = [
            [-0.42, -0.22],
            [-0.17, -0.24],
            [0.08, -0.22],
            [-0.36, -0.06],
            [-0.18, -0.08],
            [-0.02, -0.06]
        ];
        for (let i = 0; i < tableGobletPositions.length; i++) {
            const g = this.createCrystalGobletModel(1.0, true);
            g.position.set(tableGobletPositions[i][0], 0.765, tableGobletPositions[i][1]);
            crystalGroup.add(g);
            if (i < 3) crystalGlasses.push(g);
        }
        const tableDecanter = this.createCrystalDecanterModel(0.95);
        tableDecanter.position.set(-0.24, 0.765, 0.14);
        crystalGroup.add(tableDecanter);

        const picklesTable = this.createPicklesJarModel(1.0);
        picklesTable.position.set(-0.48, 0.85, 0.15);
        const olivierTable = this.createOlivierBowlModel(1.0);
        olivierTable.position.set(-0.08, 0.81, -0.05);
        const meatTable = this.createMeatPlatterModel(1.0);
        meatTable.position.set(0.24, 0.775, -0.18);
        const chickenTable = this.createRoastedChickenModel(1.0);
        chickenTable.position.set(0.26, 0.82, 0.14);
        const champTable = this.createWineBottleModel(1.0);
        champTable.position.set(0.55, 0.90, -0.02);

        this.world.itemsOnTable = {
            crystal: makeTableProp(crystalGroup),
            pickles: makeTableProp(picklesTable),
            olivier: makeTableProp(olivierTable),
            meat: makeTableProp(meatTable),
            chicken: makeTableProp(chickenTable),
            champagne: makeTableProp(champTable)
        };

        this._registerEditable(crystalGroup, 'TableItem_Crystal', {
            category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'crystal' }
        });
        crystalGlasses.forEach((g, idx) => {
            this._registerEditable(g, `TableItem_Crystal_${idx}`, {
                category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
                extra: { isSceneProp: true, materialKey: 'crystal', parentActivatedObj: crystalGroup }
            });
        });
        this._registerEditable(picklesTable, 'TableItem_Pickles', {
            category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'pickles' }
        });
        this._registerEditable(olivierTable, 'TableItem_Olivier', {
            category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'olivier' }
        });
        this._registerEditable(meatTable, 'TableItem_Meat', {
            category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'meat' }
        });
        this._registerEditable(chickenTable, 'TableItem_Chicken', {
            category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'chicken' }
        });
        this._registerEditable(champTable, 'TableItem_Champagne', {
            category: 'activated', groupId: 'group_table_set', activatedGroup: 'table', defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'champagne' }
        });

        const wreckedTable = new GameObject('WreckedTable');
        wreckedTable.transform.position.set(-1.0, 0, -0.65);
        const wBody = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.88), this.materials.woodDark);
        wBody.position.set(-0.55, 0.34, -0.35);
        wBody.rotation.set(0.28, 0.4, 2.38);
        const wPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.86), this.materials.woodDark);
        wPedestal.position.set(-0.35, 0.32, -0.38);
        wPedestal.rotation.set(0.35, 0.2, 1.25);
        const wWingTipped = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.86), this.materials.woodDark);
        wWingTipped.position.set(-0.82, 0.14, -0.22);
        wWingTipped.rotation.set(-0.18, 0.5, 0.25);
        const crumpledCloth = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.55), this.materials.tablecloth);
        crumpledCloth.position.set(-0.25, 0.03, -0.58);
        crumpledCloth.rotation.set(0.08, -0.45, -0.1);
        const spilledOlivier = new THREE.Mesh(new THREE.CircleGeometry(0.45, 7), this.materials.olivier);
        spilledOlivier.rotation.x = -Math.PI / 2;
        spilledOlivier.position.set(-0.22, 0.02, -0.15);
        const brokenPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.02, 5), this.materials.fridgeWhite);
        brokenPlate.position.set(-0.62, 0.02, -0.05);
        const spilledChicken = this.createRoastedChickenModel(0.95);
        spilledChicken.position.set(0.12, 0.07, -0.18);
        spilledChicken.rotation.set(0.1, 0.7, 2.9);
        const fallenChampagne = this.createWineBottleModel(0.95);
        fallenChampagne.position.set(0.28, 0.05, -0.42);
        fallenChampagne.rotation.set(0, 0.4, Math.PI / 2);
        const shardGroup = new THREE.Group();
        for (let s = 0; s < 5; s++) {
            const shard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.04), this.materials.crystal);
            shard.position.set(-0.45 + s * 0.18, 0.02, -0.02 + (s % 2) * 0.14);
            shard.rotation.y = s * 0.9;
            shardGroup.add(shard);
        }
        const tornTinsel = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.03, 0.06), this._ps1Mat({ color: 0xd4af37 }));
        tornTinsel.position.set(-0.15, 0.025, -0.45);
        tornTinsel.rotation.y = 0.6;
        wreckedTable.transform.add(
            wBody, wPedestal, wWingTipped, crumpledCloth,
            spilledOlivier, brokenPlate, spilledChicken, fallenChampagne, shardGroup, tornTinsel
        );
        wreckedTable.transform.visible = false;
        this.engine.addGameObject(wreckedTable);
        this._registerEditable(wreckedTable.transform, 'WreckedTable', {
            category: 'activated', activatedGroup: 'act4', defaultHidden: true,
            extra: { gameObject: wreckedTable, primaryMesh: wBody, materialKey: 'woodDark' }
        });
        [
            [wBody, 'WreckedTable_Body', 'woodDark'],
            [wPedestal, 'WreckedTable_Pedestal', 'woodDark'],
            [wWingTipped, 'WreckedTable_Wing', 'woodDark'],
            [crumpledCloth, 'WreckedTable_Cloth', 'tablecloth'],
            [spilledOlivier, 'WreckedTable_Olivier', 'olivier'],
            [brokenPlate, 'WreckedTable_Plate', 'fridgeWhite'],
            [spilledChicken, 'WreckedTable_Chicken', 'chicken'],
            [fallenChampagne, 'WreckedTable_Champagne', 'champagne'],
            [shardGroup, 'WreckedTable_Shards', 'crystal'],
            [tornTinsel, 'WreckedTable_Tinsel', 'custom']
        ].forEach(([part, pName, mKey]) => {
            this._registerEditable(part, pName, {
                category: 'activated', activatedGroup: 'act4', defaultHidden: true,
                extra: {
                    isSceneProp: true,
                    primaryMesh: part.isMesh ? part : undefined,
                    materialKey: mKey,
                    parentActivatedObj: wreckedTable.transform
                }
            });
        });

        const pushPlayerOutOfTable = () => {
            const player = this.engine?.player;
            if (!player || !tableCol.enabled) return;
            const pPos = player.transform.position;
            const pCol = player.getComponent?.(BoxCollider);
            const pRadiusX = ((pCol?.size?.x ?? 0.46) * 0.5) + 0.06;
            const pRadiusZ = ((pCol?.size?.z ?? 0.46) * 0.5) + 0.06;
            const tBox = tableCol.getBox(tableGO.transform.position);
            const minX = tBox.min.x - pRadiusX;
            const maxX = tBox.max.x + pRadiusX;
            const minZ = tBox.min.z - pRadiusZ;
            const maxZ = tBox.max.z + pRadiusZ;
            if (pPos.x > minX && pPos.x < maxX && pPos.z > minZ && pPos.z < maxZ) {
                const dLeft = Math.abs(pPos.x - minX);
                const dRight = Math.abs(maxX - pPos.x);
                const dNorth = Math.abs(pPos.z - minZ);
                const dSouth = Math.abs(maxZ - pPos.z);
                const m = Math.min(dLeft, dRight, dNorth, dSouth);
                if (m === dLeft) pPos.x = minX - 0.02;
                else if (m === dRight) pPos.x = maxX + 0.02;
                else if (m === dNorth) pPos.z = minZ - 0.02;
                else pPos.z = maxZ + 0.02;
                const rb = player.getComponent?.(RigidBody);
                if (rb) rb.position.copy(pPos);
            }
        };

        // Fixed table collider: wings unfold along local X (-X and +X) while depth along local Z is 0.88;
        // BoxCollider.getBox() automatically rotates the local box by tableGO.transform.rotation.y!
        const updateTableColliderForState = (w1, w2) => {
            const lenL = w1 > 0.5 ? 0.58 : 0;
            const lenR = w2 > 0.5 ? 0.58 : 0;
            const totalX = 0.38 + lenL + lenR;
            const shiftX = (lenR - lenL) * 0.5;
            tableCol.setSize(new THREE.Vector3(totalX, 0.76, 0.88));
            tableCol.offset.set(shiftX, 0.38, 0);
            if (tableRB) tableRB.position.copy(tableGO.transform.position);
            pushPlayerOutOfTable();
        };

        this.world.table = {
            go: tableGO,
            wreckedGO: wreckedTable,
            collider: tableCol,
            balconyPos: tableBalconyPos,
            balconyRot: tableBalconyRot,
            hallPos: tableHallPos,
            hallRot: tableHallRot,
            wingLPivot,
            wingRPivot,
            legLPivot,
            legRPivot,
            tableclothMesh,
            placeOnBalcony: () => {
                tableGO.transform.visible = true;
                tableGO.transform.position.copy(tableBalconyPos);
                tableGO.transform.rotation.copy(tableBalconyRot);
                if (tableRB) tableRB.position.copy(tableBalconyPos);
                tableCol.enabled = true;
                wingLPivot.rotation.z = Math.PI / 2;
                wingRPivot.rotation.z = -Math.PI / 2;
                legLFront.doorPivot.rotation.y = legLFront.closedYaw;
                legLBack.doorPivot.rotation.y = legLBack.closedYaw;
                legRFront.doorPivot.rotation.y = legRFront.closedYaw;
                legRBack.doorPivot.rotation.y = legRBack.closedYaw;
                tableclothMesh.visible = false;
                tableclothMesh.scale.set(1, 1, 1);
                updateTableColliderForState(0, 0);
            },
            placeInHallFolded: () => {
                tableGO.transform.visible = true;
                tableGO.transform.position.copy(tableHallPos);
                tableGO.transform.rotation.copy(tableHallRot);
                if (tableRB) tableRB.position.copy(tableHallPos);
                tableCol.enabled = true;
                wingLPivot.rotation.z = Math.PI / 2;
                wingRPivot.rotation.z = -Math.PI / 2;
                legLFront.doorPivot.rotation.y = legLFront.closedYaw;
                legLBack.doorPivot.rotation.y = legLBack.closedYaw;
                legRFront.doorPivot.rotation.y = legRFront.closedYaw;
                legRBack.doorPivot.rotation.y = legRBack.closedYaw;
                tableclothMesh.visible = false;
                tableclothMesh.scale.set(1, 1, 1);
                updateTableColliderForState(0, 0);
            },
            setWingProgress: (wingIndex, ratio) => {
                const r = Math.max(0, Math.min(1, ratio));
                // Phase 1 (r in 0..0.52): First completely lift the tabletop wing to horizontal (0 rad)
                // Phase 2 (r in 0.52..1.0): Then swing the two leg-doors outward from inside so they never clip through the wing
                const wingT = Math.min(1, r / 0.52);
                const wingEase = wingT * wingT * (3 - 2 * wingT);
                const legT = r <= 0.52 ? 0 : Math.min(1, (r - 0.52) / 0.48);
                const legEase = legT * legT * (3 - 2 * legT);
                if (wingIndex === 1) {
                    wingLPivot.rotation.z = THREE.MathUtils.lerp(Math.PI / 2, 0, wingEase);
                    legLFront.doorPivot.rotation.y = THREE.MathUtils.lerp(legLFront.closedYaw, 0, legEase);
                    legLBack.doorPivot.rotation.y = THREE.MathUtils.lerp(legLBack.closedYaw, 0, legEase);
                    if (r >= 0.99) updateTableColliderForState(1, wingRPivot.rotation.z > -0.1 ? 1 : 0);
                } else if (wingIndex === 2) {
                    wingRPivot.rotation.z = THREE.MathUtils.lerp(-Math.PI / 2, 0, wingEase);
                    legRFront.doorPivot.rotation.y = THREE.MathUtils.lerp(legRFront.closedYaw, 0, legEase);
                    legRBack.doorPivot.rotation.y = THREE.MathUtils.lerp(legRBack.closedYaw, 0, legEase);
                    if (r >= 0.99) {
                        updateTableColliderForState(1, 1);
                    }
                }
            },
            setTableclothProgress: (ratio) => {
                const r = Math.max(0, Math.min(1, ratio));
                if (r <= 0.01) {
                    tableclothMesh.visible = false;
                    return;
                }
                tableclothMesh.visible = true;
                const ease = r * r * (3 - 2 * r);
                tableclothMesh.scale.set(0.25 + 0.75 * ease, 1.0, 0.35 + 0.65 * ease);
                tableclothMesh.position.y = 0.755 + Math.sin(r * Math.PI) * 0.06;
                if (r >= 0.99) {
                    tableclothMesh.scale.set(1, 1, 1);
                    tableclothMesh.position.y = 0.755;
                }
            },
            unfoldWingsOnly: () => {
                tableGO.transform.visible = true;
                tableGO.transform.position.copy(tableHallPos);
                tableGO.transform.rotation.copy(tableHallRot);
                if (tableRB) tableRB.position.copy(tableHallPos);
                tableCol.enabled = true;
                wingLPivot.rotation.z = 0;
                wingRPivot.rotation.z = 0;
                legLFront.doorPivot.rotation.y = 0;
                legLBack.doorPivot.rotation.y = 0;
                legRFront.doorPivot.rotation.y = 0;
                legRBack.doorPivot.rotation.y = 0;
                tableclothMesh.visible = false;
                updateTableColliderForState(1, 1);
            },
            unfold: () => {
                tableGO.transform.visible = true;
                tableGO.transform.position.copy(tableHallPos);
                tableGO.transform.rotation.copy(tableHallRot);
                if (tableRB) tableRB.position.copy(tableHallPos);
                tableCol.enabled = true;
                wingLPivot.rotation.z = 0;
                wingRPivot.rotation.z = 0;
                legLFront.doorPivot.rotation.y = 0;
                legLBack.doorPivot.rotation.y = 0;
                legRFront.doorPivot.rotation.y = 0;
                legRBack.doorPivot.rotation.y = 0;
                tableclothMesh.visible = true;
                tableclothMesh.scale.set(1, 1, 1);
                tableclothMesh.position.y = 0.755;
                updateTableColliderForState(1, 1);
            },
            fold: () => {
                wingLPivot.rotation.z = Math.PI / 2;
                wingRPivot.rotation.z = -Math.PI / 2;
                legLFront.doorPivot.rotation.y = legLFront.closedYaw;
                legLBack.doorPivot.rotation.y = legLBack.closedYaw;
                legRFront.doorPivot.rotation.y = legRFront.closedYaw;
                legRBack.doorPivot.rotation.y = legRBack.closedYaw;
                tableclothMesh.visible = false;
                updateTableColliderForState(0, 0);
            }
        };

        // Redesigned Christmas Tree: 6 flattened, wide overlapping tiers + dressable ornaments & garland
        const treeGO = new GameObject('ChristmasTree');
        treeGO.transform.position.set(-2.75, 0, 0.85);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.42, 7), this.materials.woodDark);
        trunk.position.y = 0.21;
        treeGO.transform.add(trunk);
        const treeTiers = [
            { y: 0.46, rTop: 0.16, rBot: 0.74, h: 0.34 },
            { y: 0.74, rTop: 0.14, rBot: 0.64, h: 0.32 },
            { y: 1.00, rTop: 0.12, rBot: 0.54, h: 0.30 },
            { y: 1.25, rTop: 0.10, rBot: 0.43, h: 0.28 },
            { y: 1.48, rTop: 0.07, rBot: 0.32, h: 0.26 },
            { y: 1.70, rTop: 0.02, rBot: 0.21, h: 0.26 }
        ];
        for (const t of treeTiers) {
            const tierMesh = new THREE.Mesh(new THREE.CylinderGeometry(t.rTop, t.rBot, t.h, 9), this.materials.pine);
            tierMesh.position.y = t.y;
            tierMesh.castShadow = true;
            treeGO.transform.add(tierMesh);
        }

        // Ornaments, tinsel & top star group (hidden until the player dresses the Christmas tree!)
        const treeOrnamentsGroup = new THREE.Group();
        treeOrnamentsGroup.name = 'TreeOrnamentsGroup';
        const treeOrnamentItems = [];

        const star = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.11, 0),
            this._ps1Mat({ color: 0xff2222, emissive: 0x770000 })
        );
        star.position.y = 1.92;
        treeOrnamentsGroup.add(star);
        treeOrnamentItems.push({ mesh: star, threshold: 0.88 });

        const ornamentPalette = [
            this._ps1Mat({ color: 0xd92626, emissive: 0x380505, roughness: 0.25, metalness: 0.45 }),
            this._ps1Mat({ color: 0xf2c94c, emissive: 0x453208, roughness: 0.25, metalness: 0.55 }),
            this._ps1Mat({ color: 0x2d8cf0, emissive: 0x082245, roughness: 0.25, metalness: 0.45 }),
            this._ps1Mat({ color: 0x2ecc71, emissive: 0x083818, roughness: 0.28, metalness: 0.4 })
        ];
        const silverTinselMat = this._ps1Mat({ color: 0xe8eef5, emissive: 0x4a5568, emissiveIntensity: 0.35, roughness: 0.3 });
        for (let i = 0; i < 18; i++) {
            const u = i / 18;
            const ang = i * 1.68 + 0.4;
            const oy = 0.38 + u * 1.32;
            const orad = 0.64 - u * 0.45;
            const oMat = ornamentPalette[i % ornamentPalette.length];
            const bauble = new THREE.Mesh(
                i % 3 === 0 ? new THREE.OctahedronGeometry(0.052, 0) : new THREE.SphereGeometry(0.046, 7, 6),
                oMat
            );
            bauble.position.set(Math.cos(ang) * orad, oy, Math.sin(ang) * orad);
            treeOrnamentsGroup.add(bauble);
            treeOrnamentItems.push({ mesh: bauble, threshold: u * 0.85 });
        }
        for (let t = 0; t < 22; t++) {
            const u = t / 21;
            const ang = u * Math.PI * 5.5;
            const ty = 0.42 + u * 1.28;
            const trad = 0.63 - u * 0.44;
            const tinselBead = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), t % 2 === 0 ? brassMat : silverTinselMat);
            tinselBead.position.set(Math.cos(ang) * trad, ty, Math.sin(ang) * trad);
            treeOrnamentsGroup.add(tinselBead);
            treeOrnamentItems.push({ mesh: tinselBead, threshold: u * 0.85 });
        }
        treeGO.transform.add(treeOrnamentsGroup);
        this.world.treeOrnamentsGroup = treeOrnamentsGroup;

        const treeGarlandGroup = new THREE.Group();
        treeGarlandGroup.name = 'TreeGarlandGroup';
        const bulbColors = [0xff2e2e, 0x2ecc40, 0x3399ff, 0xffd700];
        for (let b = 0; b < 14; b++) {
            const ang = b * 1.45;
            const y = 0.45 + b * 0.11;
            const rad = 0.55 - (b / 14) * 0.42;
            const col = bulbColors[b % bulbColors.length];
            const bMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
            const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), bMat);
            bulb.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
            treeGarlandGroup.add(bulb);
            this.world.garlandBulbs.push({ mesh: bulb, mat: bMat, baseColor: col, freq: 1.5 + (b % 5) * 1.1, phase: b * 0.8 });
        }
        treeGO.transform.add(treeGarlandGroup);
        this.world.treeGarlandGroup = treeGarlandGroup;

        // Pulsing golden ring around the Christmas tree when the player needs to decorate it
        const treeHighlight = this.createDecorHighlightFrame(1.25, 1.25, 'xz');
        treeHighlight.position.set(0, 0.02, 0);
        treeHighlight.userData.diamond.position.set(0.45, 1.05, -0.35);
        treeHighlight.visible = false;
        treeGO.transform.add(treeHighlight);
        this.world.treeDecorHighlight = treeHighlight;

        this.world.setTreeDecorProgress = (ratio) => {
            const r = Math.max(0, Math.min(1, ratio));
            if (r <= 0.001) {
                treeOrnamentsGroup.visible = false;
                treeGarlandGroup.visible = false;
                this.world.garlandOn = false;
                return;
            }
            treeOrnamentsGroup.visible = true;
            for (const item of treeOrnamentItems) {
                item.mesh.visible = r >= item.threshold;
            }
            treeGarlandGroup.visible = r >= 0.55;
            if (r >= 0.99) {
                this.world.garlandOn = true;
            }
        };

        const tornGarland = new THREE.Group();
        const tornPts = [];
        for (let b = 0; b < 10; b++) {
            const tx = -2.2 + Math.cos(b * 0.9) * 0.48 + b * 0.04;
            const tz = 0.35 + Math.sin(b * 1.1) * 0.42;
            tornPts.push(new THREE.Vector3(tx, 0.025, tz));
            const tb = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.04, 0.04),
                new THREE.MeshBasicMaterial({ color: 0x1e1e1e })
            );
            tb.position.set(tx, 0.03, tz);
            tornGarland.add(tb);
        }
        tornGarland.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(tornPts),
            new THREE.LineBasicMaterial({ color: 0x16181d })
        ));
        tornGarland.visible = false;
        this.scene.add(tornGarland);
        this._registerEditable(tornGarland, 'TornGarland', {
            category: 'activated',
            activatedGroup: 'act4',
            defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'darkSilhouette' }
        });
        this.world.tornGarland = tornGarland;
        for (let g = 0; g < 2; g++) {
            const pl = new THREE.PointLight(g === 0 ? 0xff4433 : 0x44aaff, 0.0, 4.5, 1.7);
            pl.position.set(-2.5 + g * 0.25, 1.1 + g * 0.5, 0.65);
            this.scene.add(pl);
            this.world.garlandLights.push(pl);
        }
        this.engine.addGameObject(treeGO);
        this._registerEditable(treeGO.transform, 'ChristmasTree', {
            extra: { gameObject: treeGO, primaryMesh: trunk, materialKey: 'pine' }
        });
        this.world.treeGO = treeGO;

        const brokenBaubles = new THREE.Group();
        const baubleCols = [0xc92a2a, 0x2b7cb8, 0xd4af37, 0xc92a2a, 0x3b9c5c];
        for (let b = 0; b < baubleCols.length; b++) {
            const bauble = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.055, 0),
                this._ps1Mat({ color: baubleCols[b], emissive: 0x1a1008 })
            );
            bauble.position.set(-1.95 + b * 0.24, 0.04, 0.25 + (b % 3) * 0.28);
            bauble.rotation.set(b, b * 0.7, 0);
            brokenBaubles.add(bauble);
        }
        brokenBaubles.visible = false;
        this.scene.add(brokenBaubles);
        this._registerEditable(brokenBaubles, 'BrokenBaubles', {
            category: 'activated',
            activatedGroup: 'act4',
            defaultHidden: true,
            extra: { isSceneProp: true, materialKey: 'santaHatRed' }
        });
        this.world.brokenBaubles = brokenBaubles;

        const hatGroup = new THREE.Group();
        const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 7), this.materials.santaHatRed);
        hatCone.position.y = 0.15;
        hatCone.rotation.z = 0.3;
        const hatPom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), this.materials.santaHatFur);
        hatPom.position.set(0, 0.18, 0);
        hatCone.add(hatPom);
        const hatTrim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 5, 8), this.materials.santaHatFur);
        hatTrim.rotation.x = Math.PI / 2;
        hatGroup.add(hatCone, hatTrim);
        hatGroup.scale.setScalar(1.35);
        hatGroup.position.set(-1.18, 0.04, 0.62);
        hatGroup.rotation.set(0.35, 0.6, 0.85);
        hatGroup.visible = false;
        this.scene.add(hatGroup);
        this._registerEditable(hatGroup, 'FallenSantaHat', {
            category: 'activated',
            activatedGroup: 'act4',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: hatCone, materialKey: 'santaHatRed' }
        });
        this.world.fallenSantaHat = hatGroup;
    }

    _buildKitchenFurniture() {
        this._currentCategory = 'furniture';

        this._currentGroupId = 'group_fridge';
        const fridgeColGO = new GameObject('FridgeCollider');
        fridgeColGO.transform.position.set(3.75, 0.9, -2.85);
        fridgeColGO.addComponent(BoxCollider, new THREE.Vector3(0.68, 1.8, 0.68));
        fridgeColGO.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(fridgeColGO);
        this._registerEditable(fridgeColGO.transform, 'FridgeCollider', {
            extra: { gameObject: fridgeColGO, collide: true }
        });

        this._addStaticBox('FridgeBottom', 3.75, 0.04, -2.85, 0.68, 0.08, 0.68, this.materials.fridgeWhite, { collide: false, castShadow: true });
        this._addStaticBox('FridgeTop', 3.75, 1.76, -2.85, 0.68, 0.08, 0.68, this.materials.fridgeWhite, { collide: false, castShadow: true });
        this._addStaticBox('FridgeBack', 4.06, 0.90, -2.85, 0.06, 1.80, 0.68, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('FridgeSideN', 3.75, 0.90, -3.16, 0.68, 1.80, 0.06, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('FridgeSideS', 3.75, 0.90, -2.54, 0.68, 1.80, 0.06, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('FridgeFreezerDiv', 3.76, 1.40, -2.85, 0.56, 0.04, 0.56, this.materials.fridgeWhite, { collide: false, blocker: false });
        this._addStaticBox('FridgeShelfUpper', 3.76, 1.06, -2.85, 0.54, 0.025, 0.56, this.materials.metal, { collide: false, blocker: false });
        this._addStaticBox('FridgeShelfLower', 3.76, 0.74, -2.85, 0.54, 0.025, 0.56, this.materials.metal, { collide: false, blocker: false });

        const fridgeDoorPivot = new GameObject('FridgeDoor');
        fridgeDoorPivot.transform.position.set(3.41, 0.9, -3.19);
        const fDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.78, 0.68), this.materials.fridgeWhite);
        fDoorMesh.position.set(0, 0, 0.34);
        const fHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.04), this.materials.metal);
        fHandle.position.set(-0.04, 0.1, 0.61);
        fridgeDoorPivot.transform.add(fDoorMesh, fHandle);
        this.blockerMeshes.push(fDoorMesh);
        let fridgeOpen = false;
        let fridgeOpenAngle = -1.45;
        this.world.animatedDoors.push({
            pivot: fridgeDoorPivot,
            axis: 'y',
            getTarget: () => (fridgeOpen ? fridgeOpenAngle : 0)
        });
        const setFridgeOpen = (open, sound = true, instant = false) => {
            fridgeOpen = open;
            if (instant) fridgeDoorPivot.transform.rotation.y = open ? fridgeOpenAngle : 0;
            this.world.lights.fridgeLight.intensity = (open && !this.world.powerOut) ? 1.45 : 0.0;
            if (sound && this.engine?.audioSystem) {
                this.engine.audioSystem.playSpatialOneShot('door_open', fridgeDoorPivot.transform.position);
            }
        };
        fridgeDoorPivot.addComponent(Interactable, {
            promptText: () => (fridgeOpen ? t('prompt.fridge_close') : t('prompt.fridge_open')),
            onInteract: () => setFridgeOpen(!fridgeOpen)
        });
        this.engine.addGameObject(fridgeDoorPivot);
        this._registerEditable(fridgeDoorPivot.transform, 'FridgeDoor', {
            extra: {
                gameObject: fridgeDoorPivot,
                primaryMesh: fDoorMesh,
                materialKey: 'fridgeWhite',
                blocker: true,
                initialOpenAngle: -1.45,
                getOpenAngle: () => fridgeOpenAngle,
                setOpenAngle: (a) => {
                    fridgeOpenAngle = a;
                    if (fridgeOpen) fridgeDoorPivot.transform.rotation.y = fridgeOpenAngle;
                },
                isOpen: () => fridgeOpen,
                setOpenState: (v) => setFridgeOpen(v, false, true)
            }
        });

        const olivierFridge = new GameObject('FridgeOlivier');
        olivierFridge.transform.position.set(3.62, 1.12, -2.85);
        const bowlModel = this.createOlivierBowlModel(0.95);
        olivierFridge.transform.add(bowlModel);
        this.engine.addGameObject(olivierFridge);
        this._registerEditable(olivierFridge.transform, 'FridgeOlivier', {
            activatedGroup: 'pickup',
            extra: { gameObject: olivierFridge, materialKey: 'olivier' }
        });
        this.world.fridgeOlivier = olivierFridge;

        const meatFridge = new GameObject('FridgeMeat');
        meatFridge.transform.position.set(3.62, 0.77, -2.85);
        const platterModel = this.createMeatPlatterModel(0.95);
        meatFridge.transform.add(platterModel);
        this.engine.addGameObject(meatFridge);
        this._registerEditable(meatFridge.transform, 'FridgeMeat', {
            activatedGroup: 'pickup',
            extra: { gameObject: meatFridge, materialKey: 'meat' }
        });
        this.world.fridgeMeat = meatFridge;

        this.world.fridge = { pivot: fridgeDoorPivot, isOpen: () => fridgeOpen, setOpen: setFridgeOpen };
        this._currentGroupId = null;

        // Stove shifted to z = -2.10 so the kitchen door never blocks the oven; Range Hood added above it
        const stoveZ = -2.10;
        this._currentGroupId = 'group_stove';
        const stoveColGO = new GameObject('StoveCollider');
        stoveColGO.transform.position.set(3.75, 0.44, stoveZ);
        stoveColGO.addComponent(BoxCollider, new THREE.Vector3(0.65, 0.88, 0.68));
        stoveColGO.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(stoveColGO);
        this._registerEditable(stoveColGO.transform, 'StoveCollider', {
            extra: { gameObject: stoveColGO, collide: true }
        });

        this._addStaticBox('StoveBottom', 3.75, 0.08, stoveZ, 0.65, 0.16, 0.68, this.materials.stoveWhite, { collide: false });
        this._addStaticBox('StoveTop', 3.75, 0.80, stoveZ, 0.65, 0.16, 0.68, this.materials.stoveWhite, { collide: false, castShadow: true });
        this._addStaticBox('StoveBack', 4.04, 0.44, stoveZ, 0.07, 0.88, 0.68, this.materials.stoveWhite, { collide: false });
        this._addStaticBox('StoveSideN', 3.75, 0.44, stoveZ - 0.31, 0.65, 0.88, 0.06, this.materials.stoveWhite, { collide: false });
        this._addStaticBox('StoveSideS', 3.75, 0.44, stoveZ + 0.31, 0.65, 0.88, 0.06, this.materials.stoveWhite, { collide: false });
        this._addStaticBox('OvenRack', 3.74, 0.27, stoveZ, 0.54, 0.02, 0.54, this.materials.metal, { collide: false, blocker: false });
        [
            [-0.14, -0.15],
            [0.14, -0.15],
            [-0.14, 0.15],
            [0.14, 0.15]
        ].forEach(([bx, bz], idx) => {
            this._addStaticBox(`StoveBurner_${idx}`, 3.75 + bx, 0.895, stoveZ + bz, 0.14, 0.03, 0.14, this.materials.metal, { collide: false, blocker: false });
        });

        // Range Hood (Вытяжка над плитой)
        this._addStaticBox('RangeHoodCanopy', 3.75, 1.66, stoveZ, 0.66, 0.14, 0.68, this.materials.stoveWhite, { collide: false });
        this._addStaticBox('RangeHoodVisor', 3.41, 1.63, stoveZ, 0.06, 0.08, 0.68, this.materials.metal, { collide: false });
        this._addStaticBox('RangeHoodDuct', 3.88, 2.18, stoveZ, 0.28, 0.92, 0.32, this.materials.metal, { collide: false });

        const ovenDoorPivot = new GameObject('OvenDoor');
        ovenDoorPivot.transform.position.set(3.41, 0.15, stoveZ);
        const oDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.56), this.materials.metal);
        oDoorMesh.position.set(0, 0.225, 0);
        const oWindowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.24, 0.38), this.materials.glass);
        oWindowMesh.position.set(0, 0.24, 0);
        const oHandleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.42), this.materials.stoveWhite);
        oHandleMesh.position.set(-0.04, 0.40, 0);
        ovenDoorPivot.transform.add(oDoorMesh, oWindowMesh, oHandleMesh);
        this.blockerMeshes.push(oDoorMesh);
        let ovenOpen = false;
        let ovenOpenAngle = 1.25;
        this.world.animatedDoors.push({
            pivot: ovenDoorPivot,
            axis: 'z',
            getTarget: () => (ovenOpen ? ovenOpenAngle : 0)
        });
        const setOvenOpen = (open, sound = true, instant = false) => {
            ovenOpen = open;
            if (instant) ovenDoorPivot.transform.rotation.z = open ? ovenOpenAngle : 0;
            this.world.lights.ovenLight.intensity = (open && !this.world.powerOut) ? 1.4 : 0.0;
            if (this.world.steamEmitter) this.world.steamEmitter.setActive(open && !this.world.powerOut);
            if (sound && this.engine?.audioSystem) {
                this.engine.audioSystem.playSpatialOneShot((open && !this.world.powerOut) ? 'steam_hiss' : 'door_open', ovenDoorPivot.transform.position);
            }
        };
        ovenDoorPivot.addComponent(Interactable, {
            promptText: () => (ovenOpen ? t('prompt.oven_close') : t('prompt.oven_open')),
            onInteract: () => setOvenOpen(!ovenOpen)
        });
        this.engine.addGameObject(ovenDoorPivot);
        this._registerEditable(ovenDoorPivot.transform, 'OvenDoor', {
            extra: {
                gameObject: ovenDoorPivot,
                primaryMesh: oDoorMesh,
                materialKey: 'metal',
                blocker: true,
                initialOpenAngle: 1.25,
                getOpenAngle: () => ovenOpenAngle,
                setOpenAngle: (a) => {
                    ovenOpenAngle = a;
                    if (ovenOpen) ovenDoorPivot.transform.rotation.z = ovenOpenAngle;
                },
                isOpen: () => ovenOpen,
                setOpenState: (v) => setOvenOpen(v, false, true)
            }
        });

        const chickenOven = new GameObject('OvenChicken');
        chickenOven.transform.position.set(3.62, 0.34, stoveZ);
        const chickenModel = this.createRoastedChickenModel(0.95);
        chickenOven.transform.add(chickenModel);
        this.engine.addGameObject(chickenOven);
        this._registerEditable(chickenOven.transform, 'OvenChicken', {
            activatedGroup: 'pickup',
            extra: { gameObject: chickenOven, materialKey: 'chicken' }
        });
        this.world.ovenChicken = chickenOven;
        this.world.stove = { pivot: ovenDoorPivot, isOpen: () => ovenOpen, setOpen: setOvenOpen };
        this._currentGroupId = null;

        // Kitchen Sink (Раковина на кухне) next to the stove at z = -1.25
        const kSinkZ = -1.25;
        this._currentGroupId = 'group_kitchen_sink';
        this._addStaticBox('KitchenSinkCabinet', 3.76, 0.41, kSinkZ, 0.62, 0.82, 0.72, this.materials.stoveWhite, { castShadow: true });
        this._addStaticBox('KitchenSinkRimN', 3.76, 0.85, kSinkZ - 0.31, 0.62, 0.08, 0.10, this.materials.metal, { collide: false });
        this._addStaticBox('KitchenSinkRimS', 3.76, 0.85, kSinkZ + 0.31, 0.62, 0.08, 0.10, this.materials.metal, { collide: false });
        this._addStaticBox('KitchenSinkRimW', 3.50, 0.85, kSinkZ, 0.10, 0.08, 0.52, this.materials.metal, { collide: false });
        this._addStaticBox('KitchenSinkRimE', 4.02, 0.85, kSinkZ, 0.10, 0.08, 0.52, this.materials.metal, { collide: false });
        this._addStaticBox('KitchenSinkFaucetBase', 4.00, 0.96, kSinkZ, 0.06, 0.16, 0.06, this.materials.metal, { collide: false });
        this._addStaticBox('KitchenSinkFaucetSpout', 3.88, 1.03, kSinkZ, 0.22, 0.04, 0.04, this.materials.metal, { collide: false });
        this._currentGroupId = null;

        // Small kitchen table against west wall & pickupable Kitchen Stool
        this._addStaticBox('KitchenSmallTable', 2.38, 0.74, -2.55, 0.64, 0.05, 0.86, this.materials.woodDark);
        [
            [2.12, -2.92],
            [2.64, -2.92],
            [2.12, -2.18],
            [2.64, -2.18]
        ].forEach(([lx, lz], idx) => {
            this._addStaticBox(`KitchenSmallTableLeg_${idx}`, lx, 0.36, lz, 0.05, 0.72, 0.05, this.materials.woodFrame, { collide: false });
        });

        const stoolGO = new GameObject('KitchenStool');
        stoolGO.transform.position.set(2.45, 0, -1.68);
        stoolGO.transform.add(this.createStoolModel(1.0));
        this.engine.addGameObject(stoolGO);
        this._registerEditable(stoolGO.transform, 'KitchenStool', {
            activatedGroup: 'pickup',
            extra: { gameObject: stoolGO, materialKey: 'woodDark' }
        });
        this.world.kitchenStool = stoolGO;
    }

    _buildHallwayPantryBathroom() {
        this._currentCategory = 'furniture';
        this._currentGroupId = null;

        const wardPivot = new GameObject('WardrobeDoor');
        wardPivot.transform.position.set(2.0, 1.05, 4.1);
        const wardLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.08, 0.8), this.materials.woodDark);
        wardLeaf.position.set(0, 0, -0.4);
        wardPivot.transform.add(wardLeaf);
        this._addDoorHandles(wardPivot, new THREE.Vector3(0.06, 2.08, 0.8), new THREE.Vector3(0, 0, -0.4), -0.05);
        const wardColSize = new THREE.Vector3(0.14, 2.08, 0.8);
        const wardColOffset = new THREE.Vector3(0, 0, -0.4);
        const wardCol = wardPivot.addComponent(BoxCollider, wardColSize, wardColOffset);
        wardPivot.addComponent(RigidBody, { bodyType: 'static' });
        this.blockerMeshes.push(wardLeaf);
        this.engine.addGameObject(wardPivot);
        this._registerEditable(wardPivot.transform, 'WardrobeDoor', {
            category: 'doors',
            extra: { gameObject: wardPivot, primaryMesh: wardLeaf, materialKey: 'woodDark', blocker: true, collide: true }
        });

        const wardTrigger = this._addStaticBox('WardrobeEnter', 1.98, 1.1, 3.7, 0.12, 1.7, 0.65, this.materials.woodDark, { collide: false, blocker: false, category: 'gameplay' }).go;
        this._registerHidingSpot({
            id: 'wardrobe',
            label: 'hide.wardrobe.label',
            hidePos: new THREE.Vector3(1.52, 0.95, 3.68),
            peekPos: new THREE.Vector3(1.75, 0.95, 3.68),
            lookYaw: -Math.PI / 2,
            doorPivot: wardPivot,
            doorCollider: wardCol,
            doorColSize: wardColSize,
            doorColOffset: wardColOffset,
            doorClosedAngle: 0,
            doorOpenAngle: -1.25,
            axis: 'y',
            enterObject: wardTrigger,
            enterPrompt: () => t('hide.wardrobe.enter'),
            doorPromptClose: () => t('hide.wardrobe.close'),
            doorPromptOpen: () => t('hide.wardrobe.open'),
            defaultClosed: true
        });

        const wardContents = new THREE.Group();
        const railMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.014, 0.014, 0.56, 8),
            this.materials.metal
        );
        railMesh.rotation.x = Math.PI / 2;
        railMesh.position.set(1.36, 1.82, 3.88);
        wardContents.add(railMesh);

        const shelfMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, 0.035, 0.96),
            this.materials.woodDark
        );
        shelfMesh.position.set(1.34, 1.96, 3.70);
        wardContents.add(shelfMesh);

        // Vertical partition divider between North linen shelf compartment (z = 3.32..3.66) and South coat compartment (z = 3.68..4.08)
        const wardDivider = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, 1.94, 0.025),
            this.materials.woodDark
        );
        wardDivider.position.set(1.48, 0.97, 3.67);
        wardContents.add(wardDivider);

        const boxMat = this._ps1Mat({ color: 0x9b8262, roughness: 0.9 });
        const shelfBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.32), boxMat);
        shelfBox.position.set(1.34, 2.05, 3.44);
        shelfBox.rotation.y = 0.08;
        const shelfBox2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.28), boxMat);
        shelfBox2.position.set(1.34, 2.04, 3.90);
        shelfBox2.rotation.y = -0.06;
        wardContents.add(shelfBox, shelfBox2);

        // Hanging coats only in the South compartment (z = 3.75..4.03) so the North linen shelf is 100% unobstructed
        const garments = [
            { z: 3.75, len: 0.58, w: 0.08, col: 0x6b262e, rot: 0.02 },
            { z: 3.89, len: 0.68, w: 0.09, col: 0x3d4d3a, rot: -0.03 },
            { z: 4.03, len: 0.92, w: 0.10, col: 0x87765e, rot: 0.05 }
        ];
        for (const g of garments) {
            const gMat = this._ps1Mat({ color: g.col, roughness: 0.9 });
            const garment = new THREE.Group();
            garment.position.set(1.36, 1.80, g.z);
            garment.rotation.y = g.rot;

            const hook = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.015), this.materials.metal);
            hook.position.set(0, -0.02, 0);
            const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.025), this.materials.woodFrame);
            hanger.position.set(0, -0.06, 0);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, g.len, g.w), gMat);
            body.position.set(0, -0.08 - g.len * 0.5, 0);
            const sleeveL = new THREE.Mesh(new THREE.BoxGeometry(0.09, g.len * 0.78, g.w * 0.85), gMat);
            sleeveL.position.set(-0.20, -0.10 - g.len * 0.39, 0);
            sleeveL.rotation.z = -0.08;
            const sleeveR = new THREE.Mesh(new THREE.BoxGeometry(0.09, g.len * 0.78, g.w * 0.85), gMat);
            sleeveR.position.set(0.20, -0.10 - g.len * 0.39, 0);
            sleeveR.rotation.z = 0.08;

            garment.add(hook, hanger, body, sleeveL, sleeveR);
            wardContents.add(garment);
        }

        const addShoePair = (x, z, yaw, color, bootHeight = 0.08) => {
            const shoeMat = this._ps1Mat({ color, roughness: 0.78 });
            const soleMat = this._ps1Mat({ color: 0x151517, roughness: 0.9 });
            const pair = new THREE.Group();
            pair.position.set(x, 0, z);
            pair.rotation.y = yaw;
            for (const side of [-0.065, 0.065]) {
                const sole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.022, 0.095), soleMat);
                sole.position.set(0, 0.011, side);
                const upper = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.055, 0.085), shoeMat);
                upper.position.set(-0.005, 0.048, side);
                pair.add(sole, upper);
                if (bootHeight > 0.06) {
                    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, bootHeight, 0.082), shoeMat);
                    shaft.position.set(-0.06, 0.065 + bootHeight * 0.5, side);
                    pair.add(shaft);
                }
            }
            wardContents.add(pair);
        };
        addShoePair(1.32, 3.36, 0.15, 0x261d17, 0.16);
        addShoePair(1.36, 3.66, -0.08, 0x1b1c20, 0.05);
        addShoePair(1.33, 3.96, 0.22, 0x4b5766, 0.07);

        this.scene.add(wardContents);
        this._registerEditable(wardContents, 'WardrobeContents', {
            category: 'furniture',
            extra: { isSceneProp: true, primaryMesh: shelfMesh, materialKey: 'woodDark' }
        });

        // Open front linen shelf in the North half of the hallway wardrobe with the pickupable Festive Tablecloth ("Праздничная скатерть")
        this._addStaticBox('WardrobeLinenShelf', 1.54, 1.06, 3.48, 0.52, 0.03, 0.36, this.materials.woodDark, { collide: false, blocker: false });
        const wardTableclothGO = new GameObject('WardrobeTablecloth');
        wardTableclothGO.transform.position.set(1.66, 1.08, 3.48);
        const foldedClothModel = this.createFoldedTableclothModel(1.1);
        const clothHitBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.44, 0.28, 0.38),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
        );
        clothHitBox.position.set(0.04, 0.06, 0);
        const tableclothHighlight = this.createDecorHighlightFrame(0.36, 0.24, 'yz');
        tableclothHighlight.position.set(0.16, 0.06, 0);
        tableclothHighlight.visible = false;
        wardTableclothGO.transform.add(foldedClothModel, clothHitBox, tableclothHighlight);
        this.engine.addGameObject(wardTableclothGO);
        this._registerEditable(wardTableclothGO.transform, 'WardrobeTablecloth', {
            category: 'props',
            activatedGroup: 'pickup',
            extra: { gameObject: wardTableclothGO, materialKey: 'tablecloth' }
        });
        this.world.wardrobeTablecloth = wardTableclothGO;
        this.world.tableclothHighlight = tableclothHighlight;

        const pantryPivot = new GameObject('PantryDoor');
        pantryPivot.transform.position.set(2.0, 1.05, 2.0);
        const pantryLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.08, 0.8), this.materials.woodFrame);
        pantryLeaf.position.set(0, 0, 0.4);
        pantryPivot.transform.add(pantryLeaf);
        this._addDoorHandles(pantryPivot, new THREE.Vector3(0.06, 2.08, 0.8), new THREE.Vector3(0, 0, 0.4), -0.05);
        const pantryColSize = new THREE.Vector3(0.14, 2.08, 0.8);
        const pantryColOffset = new THREE.Vector3(0, 0, 0.4);
        const pantryCol = pantryPivot.addComponent(BoxCollider, pantryColSize, pantryColOffset);
        pantryPivot.addComponent(RigidBody, { bodyType: 'static' });
        this.blockerMeshes.push(pantryLeaf);
        this.engine.addGameObject(pantryPivot);
        this._registerEditable(pantryPivot.transform, 'PantryDoor', {
            category: 'doors',
            extra: { gameObject: pantryPivot, primaryMesh: pantryLeaf, materialKey: 'woodFrame', blocker: true, collide: true }
        });

        // Organized Pantry: pickle jars neatly grouped on shelves + extra household items
        this._addStaticBox('PantryShelf1', 1.14, 1.05, 2.4, 0.52, 0.05, 1.05, this.materials.woodDark);
        this._addStaticBox('PantryShelf2', 1.05, 1.55, 2.4, 0.38, 0.05, 1.05, this.materials.woodDark);
        const jarCoords = [
            [1.02, 1.68, 2.00],
            [1.04, 1.68, 2.18],
            [1.02, 1.68, 2.36],
            [1.14, 1.18, 2.02],
            [1.14, 1.18, 2.20]
        ];
        jarCoords.forEach(([jx, jy, jz], j) => {
            const jar = this.createPicklesJarModel(0.95);
            jar.position.set(jx, jy, jz);
            this.scene.add(jar);
            this._registerEditable(jar, `PantryJar_${j}`, {
                extra: { isSceneProp: true, materialKey: 'pickles' }
            });
        });
        const interactivePickles = new GameObject('PantryPicklesJar');
        interactivePickles.transform.position.set(1.26, 1.18, 2.34);
        const pJarModel = this.createPicklesJarModel(1.0);
        interactivePickles.transform.add(pJarModel);
        this.engine.addGameObject(interactivePickles);
        this._registerEditable(interactivePickles.transform, 'PantryPicklesJar', {
            activatedGroup: 'pickup',
            extra: { gameObject: interactivePickles, materialKey: 'pickles' }
        });
        this.world.pantryPickles = interactivePickles;

        // Additional pantry props: enamel stockpot, toolbox, cardboard storage box, wooden crate with potatoes, broom
        const potGroup = new THREE.Group();
        const potMat = this._ps1Mat({ color: 0x3b6e8c, roughness: 0.45 });
        const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.10, 0.16, 10), potMat);
        const potLid = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 10), this.materials.stoveWhite);
        potLid.position.y = 0.085;
        const potKnob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), this.materials.darkSilhouette);
        potKnob.position.y = 0.102;
        potGroup.add(potBody, potLid, potKnob);
        potGroup.position.set(1.16, 1.16, 2.72);
        this.scene.add(potGroup);
        this._registerEditable(potGroup, 'PantryPot', {
            category: 'props',
            extra: { isSceneProp: true, primaryMesh: potBody, materialKey: 'metal' }
        });

        this._addStaticBox('PantryToolbox', 1.04, 1.66, 2.72, 0.24, 0.16, 0.34, this.materials.metal, { collide: false });
        this._addStaticBox('PantryPotatoCrate', 1.12, 0.18, 2.08, 0.42, 0.34, 0.44, this.materials.woodFrame, { collide: false });
        this._addStaticBox('PantryStorageBox', 1.10, 0.50, 2.10, 0.34, 0.26, 0.36, this.materials.woodDark, { collide: false });
        const mopGroup = new THREE.Group();
        mopGroup.position.set(0.98, 0.0, 2.86);
        const mopHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 6), this.materials.woodFrame);
        mopHandle.position.set(-0.03, 0.68, 0);
        mopHandle.rotation.z = -0.12;
        const mopHead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.28), this.materials.woodDark);
        mopHead.position.set(0.05, 0.03, 0);
        mopGroup.add(mopHandle, mopHead);
        this.scene.add(mopGroup);
        this._registerEditable(mopGroup, 'PantryMop', {
            category: 'props',
            extra: { isSceneProp: true, primaryMesh: mopHead, materialKey: 'woodDark' }
        });

        this._registerHidingSpot({
            id: 'pantry',
            label: 'hide.pantry.label',
            hidePos: new THREE.Vector3(1.45, 0.92, 2.42),
            peekPos: new THREE.Vector3(1.68, 0.92, 2.42),
            lookYaw: -Math.PI / 2,
            doorPivot: pantryPivot,
            doorCollider: pantryCol,
            doorColSize: pantryColSize,
            doorColOffset: pantryColOffset,
            doorClosedAngle: 0,
            doorOpenAngle: 1.35,
            axis: 'y',
            enterObject: this._addStaticBox('PantryHideTrig', 1.48, 0.85, 2.65, 0.4, 1.2, 0.4, this.materials.woodDark, { collide: false, blocker: false, category: 'gameplay' }).go,
            enterPrompt: () => t('hide.pantry.enter'),
            doorPromptClose: () => t('hide.pantry.close'),
            doorPromptOpen: () => t('hide.pantry.open'),
            defaultClosed: true
        });

        this.world.doors.bathroom = this._addInteriorDoor({
            name: 'BathroomDoor',
            label: 'room.to_bathroom',
            pivotPos: new THREE.Vector3(4.2, 0, 2.1),
            size: new THREE.Vector3(0.06, 2.12, 0.88),
            leafOffset: new THREE.Vector3(0, 1.06, 0.44),
            openAngle: -1.45,
            defaultOpen: true,
            doorMat: this.materials.woodFrame,
            hasGlass: false
        });

        this._currentGroupId = 'group_sink';
        this._addStaticBox('SinkPedestal', 4.75, 0.35, 1.85, 0.12, 0.70, 0.12, this.materials.fridgeWhite);
        const sinkGO = new GameObject('BathroomSink');
        sinkGO.transform.position.set(4.75, 0.78, 1.92);
        const sBot = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.04, 0.40), this.materials.fridgeWhite);
        sBot.position.set(0, -0.07, 0);
        const sWallN = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.05), this.materials.fridgeWhite);
        sWallN.position.set(0, 0.02, -0.175);
        const sWallS = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.05), this.materials.fridgeWhite);
        sWallS.position.set(0, 0.02, 0.175);
        const sWallW = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.30), this.materials.fridgeWhite);
        sWallW.position.set(-0.225, 0.02, 0);
        const sWallE = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.30), this.materials.fridgeWhite);
        sWallE.position.set(0.225, 0.02, 0);
        const sWater = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), this.materials.water);
        sWater.rotation.x = -Math.PI / 2;
        sWater.position.set(0, -0.045, 0);
        const faucetBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), this.materials.metal);
        faucetBase.position.set(0, 0.13, -0.15);
        const faucetSpout = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.13), this.materials.metal);
        faucetSpout.position.set(0, 0.18, -0.10);
        sinkGO.transform.add(sBot, sWallN, sWallS, sWallW, sWallE, sWater, faucetBase, faucetSpout);
        sinkGO.addComponent(BoxCollider, new THREE.Vector3(0.50, 0.20, 0.40));
        sinkGO.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(sinkGO);
        this._registerEditable(sinkGO.transform, 'BathroomSink', {
            extra: { gameObject: sinkGO, primaryMesh: sBot, materialKey: 'fridgeWhite', collide: true }
        });
        this.world.bathroomSink = sinkGO;

        // Bathroom Mirror ("Зеркало в ванной") with 4-bar hollow perimeter frame + real-time 3D planar reflection
        const bathMirrorGroup = new THREE.Group();
        bathMirrorGroup.position.set(4.75, 1.48, 1.71);
        const bmFrameT = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.032, 0.026), this.materials.fridgeWhite);
        bmFrameT.position.set(0, 0.324, 0.012);
        const bmFrameB = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.032, 0.026), this.materials.fridgeWhite);
        bmFrameB.position.set(0, -0.324, 0.012);
        const bmFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.616, 0.026), this.materials.fridgeWhite);
        bmFrameL.position.set(-0.254, 0, 0.012);
        const bmFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.616, 0.026), this.materials.fridgeWhite);
        bmFrameR.position.set(0.254, 0, 0.012);
        const bmGlass = this._createPlanarReflector(0.48, 0.62, {
            tintColor: 0xe6f2fa,
            reflectivity: 0.95
        });
        bmGlass.position.z = 0.024;
        const bmShelf = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.022, 0.12), this.materials.fridgeWhite);
        bmShelf.position.set(0, -0.36, 0.055);
        const tbCup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.026, 0.022, 0.075, 8),
            this._ps1Mat({ color: 0x5b8bb8, roughness: 0.35 })
        );
        tbCup.position.set(-0.15, -0.312, 0.065);
        const tb1 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.008), this._ps1Mat({ color: 0xd93838 }));
        tb1.position.set(-0.158, -0.285, 0.065);
        tb1.rotation.z = 0.18;
        const tb2 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.008), this._ps1Mat({ color: 0x38a862 }));
        tb2.position.set(-0.142, -0.285, 0.065);
        tb2.rotation.z = -0.16;
        const soapDish = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.014, 0.058), this.materials.fridgeWhite);
        soapDish.position.set(0.14, -0.342, 0.065);
        const soapBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.065, 0.022, 0.042),
            this._ps1Mat({ color: 0xe6b89c, roughness: 0.55 })
        );
        soapBar.position.set(0.14, -0.328, 0.065);
        bathMirrorGroup.add(bmFrameT, bmFrameB, bmFrameL, bmFrameR, bmGlass, bmShelf, tbCup, tb1, tb2, soapDish, soapBar);
        this.scene.add(bathMirrorGroup);
        this._registerEditable(bathMirrorGroup, 'BathroomMirror', {
            category: 'fixtures',
            groupId: 'group_sink',
            extra: { isSceneProp: true, primaryMesh: bmGlass, materialKey: 'mirror' }
        });
        this.world.bathroomMirror = bathMirrorGroup;
        this._currentGroupId = null;

        const toiletGO = new GameObject('BathroomToilet');
        toiletGO.transform.position.set(4.72, 0, 3.18);
        const tPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.24, 8), this.materials.fridgeWhite);
        tPedestal.position.set(0, 0.12, -0.02);
        const tBowlBottom = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.40), this.materials.fridgeWhite);
        tBowlBottom.position.set(0, 0.24, -0.04);
        const tRimN = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.05), this.materials.fridgeWhite);
        tRimN.position.set(0, 0.33, -0.22);
        const tRimS = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.05), this.materials.fridgeWhite);
        tRimS.position.set(0, 0.33, 0.14);
        const tRimW = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.32), this.materials.fridgeWhite);
        tRimW.position.set(-0.155, 0.33, -0.04);
        const tRimE = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.32), this.materials.fridgeWhite);
        tRimE.position.set(0.155, 0.33, -0.04);
        const tWater = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.30), this.materials.water);
        tWater.rotation.x = -Math.PI / 2;
        tWater.position.set(0, 0.27, -0.04);
        const tPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), this.materials.metal);
        tPipe.position.set(0, 0.46, 0.20);
        const tTank = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.16), this.materials.fridgeWhite);
        tTank.position.set(0, 0.70, 0.20);
        const tFlushBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6), this.materials.metal);
        tFlushBtn.position.set(0, 0.89, 0.20);
        toiletGO.transform.add(tPedestal, tBowlBottom, tRimN, tRimS, tRimW, tRimE, tWater, tPipe, tTank, tFlushBtn);
        toiletGO.addComponent(BoxCollider, new THREE.Vector3(0.42, 0.88, 0.54), new THREE.Vector3(0, 0.44, 0));
        toiletGO.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(toiletGO);
        this._registerEditable(toiletGO.transform, 'BathroomToilet', {
            extra: { gameObject: toiletGO, primaryMesh: tTank, materialKey: 'fridgeWhite', collide: true }
        });
        this.world.toilet = toiletGO;

        this._currentGroupId = 'group_bathtub';
        const tubColGO = new GameObject('BathtubCollider');
        tubColGO.transform.position.set(5.65, 0.32, 2.6);
        tubColGO.addComponent(BoxCollider, new THREE.Vector3(0.78, 0.64, 1.65));
        tubColGO.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(tubColGO);
        this._registerEditable(tubColGO.transform, 'BathtubCollider', {
            extra: { gameObject: tubColGO, collide: true }
        });

        this._addStaticBox('BathtubBottom', 5.65, 0.08, 2.6, 0.78, 0.16, 1.65, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('BathtubRimW', 5.30, 0.40, 2.6, 0.08, 0.48, 1.65, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('BathtubRimE', 6.00, 0.40, 2.6, 0.08, 0.48, 1.65, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('BathtubRimN', 5.65, 0.40, 1.815, 0.78, 0.48, 0.08, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('BathtubRimS', 5.65, 0.40, 3.385, 0.78, 0.48, 0.08, this.materials.fridgeWhite, { collide: false });
        this._addStaticBox('TubFaucet', 5.95, 0.76, 1.95, 0.08, 0.08, 0.14, this.materials.metal, { collide: false, blocker: false });
        this._addStaticBox('ShowerRod', 5.2, 2.15, 2.6, 0.03, 0.03, 1.65, this.materials.metal, { collide: false, blocker: false });

        const curtainPivot = new GameObject('ShowerCurtain');
        curtainPivot.transform.position.set(5.2, 1.32, 2.6);
        const curtainMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.65, 1.55), this.materials.curtain);
        curtainPivot.transform.add(curtainMesh);
        this.engine.addGameObject(curtainPivot);
        this._registerEditable(curtainPivot.transform, 'ShowerCurtain', {
            extra: { gameObject: curtainPivot, primaryMesh: curtainMesh, materialKey: 'curtain' }
        });

        this._registerHidingSpot({
            id: 'bathroom',
            label: 'hide.bathroom.label',
            hidePos: new THREE.Vector3(5.65, 0.96, 2.6),
            peekPos: new THREE.Vector3(5.45, 0.96, 2.6),
            lookYaw: Math.PI / 2,
            doorPivot: curtainPivot,
            doorClosedAngle: 0,
            doorOpenAngle: 1.15,
            axis: 'y',
            enterObject: curtainPivot,
            enterPrompt: () => t('hide.bathroom.enter'),
            doorPromptClose: () => t('hide.bathroom.close'),
            doorPromptOpen: () => t('hide.bathroom.open'),
            isCurtain: true,
            defaultClosed: false
        });
        if (curtainPivot.transform.userData?.initialTransform) {
            const p = curtainPivot.transform.position;
            const s = curtainPivot.transform.scale;
            curtainPivot.transform.userData.initialTransform.position = [p.x, p.y, p.z];
            curtainPivot.transform.userData.initialTransform.scale = [s.x, s.y, s.z];
        }
        this._currentGroupId = null;
    }

    _registerHidingSpot(cfg) {
        let isClosed = !!cfg.defaultClosed;
        let isPeeking = false;
        let curtainClosedZ = cfg.doorPivot ? cfg.doorPivot.transform.position.z : 2.6;
        if (cfg.doorPivot && !cfg.isCurtain) {
            this.world.animatedDoors.push({
                pivot: cfg.doorPivot,
                axis: cfg.axis === 'z' ? 'z' : 'y',
                getTarget: () => {
                    if (!isClosed) return cfg.doorOpenAngle;
                    if (isPeeking) return cfg.doorClosedAngle + (cfg.doorOpenAngle - cfg.doorClosedAngle) * 0.36;
                    return cfg.doorClosedAngle;
                }
            });
        }
        const applyDoorPose = (instant = false) => {
            if (!cfg.doorPivot) return;
            if (cfg.isCurtain) {
                if (!isClosed) {
                    cfg.doorPivot.transform.scale.z = 0.25;
                    cfg.doorPivot.transform.position.z = curtainClosedZ - 0.58;
                } else if (isPeeking) {
                    cfg.doorPivot.transform.scale.z = 0.86;
                    cfg.doorPivot.transform.position.z = curtainClosedZ - 0.10;
                } else {
                    cfg.doorPivot.transform.scale.z = 1.0;
                    cfg.doorPivot.transform.position.z = curtainClosedZ;
                }
            } else if (instant) {
                if (cfg.axis === 'z') {
                    cfg.doorPivot.transform.rotation.z = isClosed ? cfg.doorClosedAngle : cfg.doorOpenAngle;
                } else {
                    cfg.doorPivot.transform.rotation.y = isClosed ? cfg.doorClosedAngle : cfg.doorOpenAngle;
                }
            }
            if (cfg.doorCollider) {
                cfg.doorCollider.enabled = !!isClosed;
            }
        };

        const spot = {
            id: cfg.id,
            label: cfg.label,
            hidePos: cfg.hidePos,
            peekPos: cfg.peekPos,
            lookYaw: cfg.lookYaw,
            isDoorClosed: () => isClosed,
            setPeeking: (val) => {
                if (isPeeking === !!val) return;
                isPeeking = !!val;
                if (cfg.isCurtain) applyDoorPose(false);
            },
            setDoorClosed: (val, instant = false) => {
                const next = !!val;
                if (next && !instant && cfg.doorCollider && cfg.doorPivot &&
                    this._isPlayerBlockingDoor(cfg.doorPivot, cfg.doorClosedAngle || 0, cfg.doorColSize, cfg.doorColOffset)) {
                    return false;
                }
                isClosed = next;
                if (!next) isPeeking = false;
                applyDoorPose(instant);
                if (!instant && this.engine?.audioSystem) {
                    this.engine.audioSystem.playSpatialOneShot('door_open', cfg.hidePos);
                }
                return true;
            },
            setCurtainClosedZ: (z) => {
                curtainClosedZ = z;
                applyDoorPose(true);
            },
            getDoorPrompt: () => {
                const p = isClosed ? cfg.doorPromptOpen : cfg.doorPromptClose;
                return typeof p === 'function' ? p() : p;
            },
            enterPrompt: cfg.enterPrompt,
            enterObject: cfg.enterObject,
            doorPivot: cfg.doorPivot,
            defaultClosed: !!cfg.defaultClosed
        };

        const initialDoorOpenAngle = cfg.doorOpenAngle;
        if (cfg.doorPivot?.transform?.userData) {
            const ud = cfg.doorPivot.transform.userData;
            ud.initialOpenAngle = initialDoorOpenAngle;
            ud.getOpenAngle = () => cfg.doorOpenAngle;
            ud.setOpenAngle = (a) => {
                cfg.doorOpenAngle = a;
                applyDoorPose(true);
            };
            ud.isOpen = () => !isClosed;
            ud.setOpenState = (open) => {
                isClosed = !open;
                applyDoorPose(true);
            };
        }

        applyDoorPose(true);

        if (cfg.id === 'pantry' || cfg.id === 'sofa' || cfg.id === 'wardrobe') {
            cfg.enterObject.transform.traverse(c => {
                if (c.isMesh) {
                    c.material = this._ps1Mat({ color: 0xffffff, transparent: true, opacity: 0.01 });
                }
            });
        }

        this.world.hidingSpots.push(spot);
    }

    _buildLightSwitchesAndFixtures() {
        this._currentCategory = 'fixtures';
        this._currentGroupId = null;

        const plateMat = this._ps1Mat({ color: 0xe6dec8, emissive: 0x1c1812, roughness: 0.45 });
        const rockerMat = this._ps1Mat({ color: 0xf4eedc, roughness: 0.4 });
        const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
        const rodMat = this.materials.woodDark;

        const configs = [
            {
                id: 'hall',
                label: 'room.in_hall',
                light: this.world.lights.hallLight,
                baseIntensity: 2.45,
                emissiveColor: 0xffe0a8,
                fixturePos: new THREE.Vector3(-0.75, 2.52, -1.0),
                isChandelier: true,
                switches: [
                    { name: 'HallSwitchArmchair', pos: new THREE.Vector3(-2.35, 1.25, -3.41), normal: new THREE.Vector3(0, 0, 1) },
                    { name: 'HallSwitchDoorway', pos: new THREE.Vector3(1.91, 1.25, -0.05), normal: new THREE.Vector3(-1, 0, 0) }
                ]
            },
            {
                id: 'kitchen',
                label: 'room.in_kitchen',
                light: this.world.lights.kitchenLight,
                baseIntensity: 2.0,
                emissiveColor: 0xffd796,
                fixturePos: new THREE.Vector3(3.1, 2.55, -2.0),
                switches: [
                    { name: 'KitchenSwitch', pos: new THREE.Vector3(2.2, 1.25, -0.69), normal: new THREE.Vector3(0, 0, -1) }
                ]
            },
            {
                id: 'hallway',
                label: 'room.in_hallway',
                light: this.world.lights.hallwayLight,
                baseIntensity: 1.8,
                emissiveColor: 0xffcfa0,
                fixturePos: new THREE.Vector3(3.1, 2.55, 2.2),
                switches: [
                    { name: 'HallwaySwitch', pos: new THREE.Vector3(2.09, 1.25, 1.55), normal: new THREE.Vector3(1, 0, 0) }
                ]
            },
            {
                id: 'bathroom',
                label: 'room.in_bathroom',
                light: this.world.lights.bathroomLight,
                baseIntensity: 1.7,
                emissiveColor: 0xcbe8ff,
                fixturePos: new THREE.Vector3(5.1, 2.55, 2.55),
                switches: [
                    { name: 'BathroomSwitch', pos: new THREE.Vector3(4.11, 1.25, 1.85), normal: new THREE.Vector3(-1, 0, 0) }
                ]
            }
        ];

        for (const cfg of configs) {
            const shadeMat = this._ps1Mat({ color: 0x5c5e66, emissive: 0x000000, roughness: 0.35 });
            const fixtureGO = new GameObject(`CeilingFixture_${cfg.id}`);
            fixtureGO.transform.position.copy(cfg.fixturePos);

            let primaryShade;
            if (cfg.isChandelier) {
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), rodMat);
                stem.position.y = 0.06;
                const shade = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), shadeMat);
                shade.position.y = -0.06;
                fixtureGO.transform.add(stem, shade);
                primaryShade = shade;
            } else {
                const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.11, 8), shadeMat);
                fixtureGO.transform.add(shade);
                primaryShade = shade;
            }
            this.engine.addGameObject(fixtureGO);
            this._registerEditable(fixtureGO.transform, `CeilingFixture_${cfg.id}`, {
                extra: { gameObject: fixtureGO, primaryMesh: primaryShade, materialKey: 'ceiling' }
            });

            let isOn = cfg.light ? cfg.light.intensity > 0.01 : false;
            const rockers = [];

            const setOn = (val) => {
                isOn = !!val;
                if (cfg.light) cfg.light.intensity = isOn ? roomEntry.baseIntensity : 0.0;
                shadeMat.color.setHex(isOn ? 0xfff8e6 : 0x5c5e66);
                shadeMat.emissive.setHex(isOn ? cfg.emissiveColor : 0x000000);
                shadeMat.emissiveIntensity = isOn ? 1.15 : 0.0;
                for (const r of rockers) {
                    r.rotation.x = isOn ? -0.26 : 0.26;
                }
            };

            const roomEntry = {
                id: cfg.id,
                label: cfg.label,
                light: cfg.light,
                baseIntensity: cfg.baseIntensity,
                isOn: () => isOn,
                setOn,
                toggle: () => setOn(!isOn)
            };
            this.world.roomLights[cfg.id] = roomEntry;

            for (const sw of cfg.switches) {
                const swGO = new GameObject(sw.name);
                swGO.transform.position.copy(sw.pos);
                swGO.transform.rotation.y = Math.atan2(sw.normal.x, sw.normal.z);

                const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.024), plateMat);
                plate.position.set(0, 0, 0.013);

                const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.072, 0.026), rockerMat);
                rocker.position.set(0, 0, 0.025);
                rockers.push(rocker);

                const hitZone = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.06), hitMat);
                hitZone.position.set(0, 0, 0.032);

                swGO.transform.add(plate, rocker, hitZone);
                this.engine.addGameObject(swGO);
                this._registerEditable(swGO.transform, sw.name, {
                    extra: { gameObject: swGO, primaryMesh: plate, materialKey: 'ceiling' }
                });

                this.world.lightSwitches.push({
                    go: swGO,
                    roomId: cfg.id,
                    room: roomEntry,
                    label: cfg.label,
                    rocker
                });
            }

            setOn(isOn);
        }
    }

    _buildBalcony() {
        this._currentCategory = 'balcony';
        this._currentGroupId = null;

        this._addStaticBox('BalconySlab', 0.6, -0.06, -4.15, 2.8, 0.12, 1.3, this.materials.concrete);
        this._addStaticBox('BalconyRailW', -0.76, 0.5, -4.15, 0.08, 1.0, 1.3, this.materials.concrete);
        this._addStaticBox('BalconyRailE', 1.96, 0.5, -4.15, 0.08, 1.0, 1.3, this.materials.concrete);
        this._addStaticBox('BalconyRailN', 0.6, 0.5, -4.76, 2.8, 1.0, 0.08, this.materials.concrete);
        this._addStaticBox('BalconyHandrailW', -0.76, 1.03, -4.15, 0.10, 0.05, 1.3, this.materials.metal, { collide: false });
        this._addStaticBox('BalconyHandrailE', 1.96, 1.03, -4.15, 0.10, 0.05, 1.3, this.materials.metal, { collide: false });
        this._addStaticBox('BalconyHandrailN', 0.6, 1.03, -4.76, 2.8, 0.05, 0.10, this.materials.metal, { collide: false });

        this._addStaticBox('BalcFrameL_Bot', -0.05, 1.04, -4.76, 1.34, 0.06, 0.07, this.materials.woodFrame);
        this._addStaticBox('BalcFrameL_Top', -0.05, 2.17, -4.76, 1.34, 0.06, 0.07, this.materials.woodFrame);
        this._addStaticBox('BalcFrameL_StileL', -0.69, 1.60, -4.76, 0.06, 1.14, 0.07, this.materials.woodFrame);
        this._addStaticBox('BalcFrameL_StileM', -0.05, 1.60, -4.76, 0.06, 1.14, 0.07, this.materials.woodFrame);
        this._addStaticBox('BalcFrameL_StileR', 0.59, 1.60, -4.76, 0.06, 1.14, 0.07, this.materials.woodFrame);
        this._addStaticBox('BalcFrameL_GlassL', -0.37, 1.60, -4.76, 0.58, 1.07, 0.02, this.materials.glass, { collide: false, blocker: false });
        this._addStaticBox('BalcFrameL_GlassR', 0.27, 1.60, -4.76, 0.58, 1.07, 0.02, this.materials.glass, { collide: false, blocker: false });

        const openFramePivot = new GameObject('BalcFrameOpen');
        openFramePivot.transform.position.set(1.92, 1.60, -4.72);
        const winW = 1.30;
        const ofTop = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.06, 0.06), this.materials.woodFrame);
        ofTop.position.set(-winW * 0.5, 0.55, 0);
        const ofBot = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.06, 0.06), this.materials.woodFrame);
        ofBot.position.set(-winW * 0.5, -0.55, 0);
        const ofSideR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.16, 0.06), this.materials.woodFrame);
        ofSideR.position.set(-0.03, 0, 0);
        const ofSideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.16, 0.06), this.materials.woodFrame);
        ofSideL.position.set(-(winW - 0.03), 0, 0);
        const ofGlass = new THREE.Mesh(new THREE.BoxGeometry(winW - 0.12, 1.04, 0.02), this.materials.glass);
        ofGlass.position.set(-winW * 0.5, 0, 0);

        const whiteHandleMat = this._ps1Mat({ color: 0xf0f2f0, roughness: 0.45, metalness: 0.08 });
        const handleX = -(winW - 0.03);
        const winHandlePlate = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.068, 0.008), whiteHandleMat);
        winHandlePlate.position.set(handleX, 0, 0.034);
        const winHandleNeck = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.022), whiteHandleMat);
        winHandleNeck.position.set(handleX, 0.012, 0.049);
        const winHandleLever = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.095, 0.016), whiteHandleMat);
        winHandleLever.position.set(handleX, -0.028, 0.064);

        openFramePivot.transform.add(
            ofTop, ofBot, ofSideR, ofSideL, ofGlass,
            winHandlePlate, winHandleNeck, winHandleLever
        );

        let balcWinOpen = false;
        let balcWinBaseYaw = 0;
        let balcWinOpenAngle = -1.28;
        this.world.animatedDoors.push({
            pivot: openFramePivot,
            axis: 'y',
            getTarget: () => balcWinBaseYaw + (balcWinOpen ? balcWinOpenAngle : 0)
        });
        const setBalcWinOpen = (open, sound = true, instant = false) => {
            balcWinOpen = !!open;
            if (instant) {
                openFramePivot.transform.rotation.y = balcWinBaseYaw + (balcWinOpen ? balcWinOpenAngle : 0);
            }
            if (sound && this.engine?.audioSystem) {
                this.engine.audioSystem.playSpatialOneShot('door_open', openFramePivot.transform.position);
            }
        };
        openFramePivot.addComponent(Interactable, {
            promptText: () => (balcWinOpen ? t('prompt.balcony_win_close') : t('prompt.balcony_win_open')),
            onInteract: () => setBalcWinOpen(!balcWinOpen)
        });
        this.engine.addGameObject(openFramePivot);
        this._registerEditable(openFramePivot.transform, 'BalcFrameOpen', {
            category: 'doors',
            extra: {
                gameObject: openFramePivot,
                primaryMesh: ofTop,
                materialKey: 'woodFrame',
                initialOpenAngle: -1.28,
                getOpenAngle: () => balcWinOpenAngle,
                setOpenAngle: (a) => {
                    balcWinOpenAngle = a;
                    if (balcWinOpen) openFramePivot.transform.rotation.y = balcWinBaseYaw + balcWinOpenAngle;
                },
                isOpen: () => balcWinOpen,
                setOpenState: (v) => setBalcWinOpen(v, false, true),
                setBaseYaw: (y) => { balcWinBaseYaw = y; }
            }
        });
        this.world.balconyWindow = {
            pivot: openFramePivot,
            isOpen: () => balcWinOpen,
            setOpen: setBalcWinOpen
        };

        const balconyGarlandGroup = new THREE.Group();
        balconyGarlandGroup.name = 'BalconyMenuGarland';
        const gPts = [];
        const gCount = 16;
        const bulbColors = [0xff2e2e, 0x2ecc71, 0x3b82f6, 0xfbbf24, 0xec4899];
        const bulbGeo = new THREE.SphereGeometry(0.022, 6, 6);
        for (let b = 0; b < gCount; b++) {
            const u = b / (gCount - 1);
            const gx = -0.62 + u * 1.72;
            const gy = 2.02 - 0.20 * Math.abs(Math.sin(u * Math.PI * 2));
            const gz = -4.69;
            gPts.push(new THREE.Vector3(gx, gy, gz));
            const col = bulbColors[b % bulbColors.length];
            const bMat = new THREE.MeshBasicMaterial({ color: col });
            const bulb = new THREE.Mesh(bulbGeo, bMat);
            bulb.position.set(gx, gy, gz);
            balconyGarlandGroup.add(bulb);
            this.world.garlandBulbs.push({ mesh: bulb, mat: bMat, baseColor: col, freq: 1.6 + (b % 5) * 0.9, phase: b * 0.7 });
        }
        const wireGeo = new THREE.BufferGeometry().setFromPoints(gPts);
        const wireLine = new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: 0x1e2228 }));
        balconyGarlandGroup.add(wireLine);
        const balcGarlandLight = new THREE.PointLight(0xffd288, 0.0, 2.8);
        balcGarlandLight.position.set(0.25, 1.90, -4.55);
        balconyGarlandGroup.add(balcGarlandLight);
        this.world.garlandLights.push(balcGarlandLight);
        this.scene.add(balconyGarlandGroup);
        this._registerEditable(balconyGarlandGroup, 'BalconyMenuGarland', {
            category: 'balcony',
            extra: { isSceneProp: true, materialKey: 'pine' }
        });

        this._addStaticBox('FrozenBox1', -0.35, 0.22, -4.35, 0.5, 0.44, 0.45, this.materials.woodFrame);
        this._addStaticBox('FrozenBox2', -0.32, 0.58, -4.38, 0.38, 0.28, 0.35, this.materials.woodFrame);
        this._addStaticBox('BalcSnowMound', 1.45, 0.08, -4.42, 0.65, 0.18, 0.55, this.materials.snow, { collide: false });

        const champGO = new GameObject('BalconyChampagne');
        champGO.transform.position.set(1.45, 0.24, -4.42);
        const bottle = this.createWineBottleModel(1.0);
        bottle.rotation.z = 0.35;
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), this._ps1Mat({ color: 0xd6e1ee, transparent: true, opacity: 0.55 }));
        bag.scale.set(1.15, 0.55, 1.15);
        bag.position.y = -0.08;
        champGO.transform.add(bottle, bag);
        this.engine.addGameObject(champGO);
        this._registerEditable(champGO.transform, 'BalconyChampagne', {
            category: 'furniture',
            activatedGroup: 'pickup',
            extra: { gameObject: champGO, materialKey: 'champagne' }
        });
        this.world.champagneBottle = champGO;
    }

    _buildCourtyardAndOppositeHouse() {
        const GY = -6.5;
        this._currentCategory = 'courtyard';
        this._currentGroupId = null;

        this._addStaticBox('CourtyardGround', 0, GY - 0.5, -16, 48, 1.0, 32, this.materials.snow, { collide: false, blocker: false });

        for (let i = 0; i < 6; i++) {
            this._addStaticBox(
                `Snowdrift_${i}`,
                -10 + i * 4.2,
                GY + 0.28,
                -8.5 - (i % 2) * 8.0,
                2.8,
                0.7,
                2.2,
                this.materials.snow,
                { collide: false, blocker: false }
            );
        }

        this._addStaticBox('OwnFacadeBelow', 0.6, -3.3, -3.55, 14, 6.4, 0.2, this.materials.concrete, { collide: false, blocker: false });
        this._addStaticBox('OwnPorchCanopy', 3.1, GY + 2.3, -4.3, 2.2, 0.18, 1.5, this.materials.concrete, { collide: false, blocker: false });

        this._buildLowPolyCar(-3.8, GY, -11.5, 0.18, 0x8f9c88, 'CourtyardCar_1');
        this._buildLowPolyCar(4.5, GY, -15.2, -0.35, 0x3b4859, 'CourtyardCar_2');

        this._addStaticBox('StreetLampPole', -5.2, GY + 3.0, -13.5, 0.16, 6.0, 0.16, this.materials.metal, { collide: false, blocker: false });
        const lampHead = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.18, 0.28),
            new THREE.MeshBasicMaterial({ color: 0xffc766 })
        );
        lampHead.position.set(-4.6, GY + 5.9, -13.5);
        this.scene.add(lampHead);
        this._registerEditable(lampHead, 'StreetLampHead', {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: lampHead, materialKey: 'ceiling' }
        });

        const H14_Z = -24.5;
        this._addStaticBox('House14_Body', 0, GY + 7.5, H14_Z - 2.0, 26, 15.0, 4.0, this.materials.concrete, { collide: false, blocker: false });

        const floorYs = [GY + 1.4, GY + 4.3, GY + 7.5, GY + 10.4, GY + 13.3];
        const colXs = [-9.5, -5.8, -1.0, 2.8, 6.6, 10.2];
        const litWarm = new Set(['0_1', '1_4', '3_0', '4_3']);
        const litTV = new Set(['1_1', '2_4', '3_5']);

        for (let f = 0; f < floorYs.length; f++) {
            for (let c = 0; c < colXs.length; c++) {
                if ((f === 2 && c === 2) || (f === 0 && c === 3)) continue;
                const key = `${f}_${c}`;
                let wColor = 0x090c14;
                if (litWarm.has(key)) wColor = 0xd9a84e;
                if (litTV.has(key)) wColor = 0x5c85c7;
                const winMat = new THREE.MeshBasicMaterial({
                    color: wColor,
                    polygonOffset: true,
                    polygonOffsetFactor: -3,
                    polygonOffsetUnits: -3
                });
                const winMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.45), winMat);
                winMesh.position.set(colXs[c], floorYs[f], H14_Z + 0.14);
                this.scene.add(winMesh);
                this._registerEditable(winMesh, `House14_Win_${f}_${c}`, {
                    category: 'courtyard',
                    extra: { isSceneProp: true, primaryMesh: winMesh, materialKey: 'glass' }
                });
            }
        }

        const roomX = -1.0;
        const roomY = 1.1;
        const roomZ = H14_Z;

        const neighborWinCanvas = new NeighborWindowCanvas();
        neighborWinCanvas.mesh.scale.set(1.75 / 1.42, 1.45 / 1.38, 1);
        neighborWinCanvas.mesh.position.set(roomX, roomY, roomZ + 0.15);
        this.scene.add(neighborWinCanvas.mesh);
        this._registerEditable(neighborWinCanvas.mesh, 'NeighborWindowCanvas', {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: neighborWinCanvas.mesh }
        });
        this.world.neighborWindowCanvas = neighborWinCanvas;

        const targetWinFrame = new THREE.Group();
        targetWinFrame.position.set(roomX, roomY, roomZ + 0.19);
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.09, 0.09), this.materials.woodFrame);
        topBar.position.y = 0.74;
        const botBar = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.09, 0.09), this.materials.woodFrame);
        botBar.position.y = -0.74;
        const leftBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.54, 0.09), this.materials.woodFrame);
        leftBar.position.x = -0.9;
        const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.54, 0.09), this.materials.woodFrame);
        rightBar.position.x = 0.9;
        const bloodGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), this.materials.bloodClaw);
        bloodGlass.visible = false;
        targetWinFrame.add(topBar, botBar, leftBar, rightBar, bloodGlass);
        this.scene.add(targetWinFrame);
        this._registerEditable(targetWinFrame, 'NeighborWindowFrame', {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: topBar, materialKey: 'woodFrame' }
        });

        const victimGroup = new THREE.Group();

        const gazeGO = new GameObject('NeighborWindowGaze');
        gazeGO.transform.position.set(roomX, roomY, roomZ + 0.08);
        const gazeMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 2.0),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
        );
        gazeGO.transform.add(gazeMesh);
        const gazeComp = gazeGO.addComponent(GazeTrigger, {
            maxDistance: 40,
            dwellTime: 0.35,
            enabled: false
        });
        this.engine.addGameObject(gazeGO);
        this._registerEditable(gazeGO.transform, 'NeighborWindowGaze', {
            category: 'gameplay',
            extra: { gameObject: gazeGO, primaryMesh: gazeMesh }
        });

        this.world.neighborScene = {
            roomCenter: new THREE.Vector3(roomX, roomY - 0.3, roomZ + 0.35),
            windowPos: new THREE.Vector3(roomX, roomY, roomZ + 0.06),
            victimGroup,
            targetWinFrame,
            bloodGlass,
            gazeTrigger: gazeComp
        };

        const ROAD_Y = -6.12;
        const asphaltMat = this._ps1Mat({ color: 0x262930, roughness: 0.95 });
        const walkwayMat = this._ps1Mat({ color: 0x3b3f47, roughness: 0.92 });
        const curbMat = this._ps1Mat({ color: 0x6f747d, roughness: 0.9 });
        this._addStaticBox('CourtyardRoad', 0, ROAD_Y, -15.2, 84.0, 0.06, 4.2, asphaltMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('RoadCurb_N', 0, ROAD_Y + 0.05, -17.36, 84.0, 0.14, 0.16, curbMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('RoadCurb_S', 0, ROAD_Y + 0.05, -13.04, 84.0, 0.14, 0.16, curbMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('CourtyardWalkway', 3.1, ROAD_Y, -8.7, 1.35, 0.06, 8.6, walkwayMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('House14_Walkway', 2.8, ROAD_Y, -20.2, 1.4, 0.06, 5.7, walkwayMat, {
            collide: false, blocker: false, category: 'courtyard'
        });

        const porchX = 2.8;
        const porchDoorMat = this._ps1Mat({ color: 0x2a352f, roughness: 0.85, metalness: 0.25 });
        const porchPillarMat = this._ps1Mat({ color: 0x767a80, roughness: 0.92 });
        this._addStaticBox('House14_PorchStep', porchX, GY + 0.12, -23.6, 2.6, 0.24, 1.8, this.materials.concrete, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('House14_EntranceDoor', porchX, GY + 1.25, H14_Z + 0.07, 1.35, 2.25, 0.14, porchDoorMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('House14_PorchCanopy', porchX, GY + 2.55, -23.55, 2.7, 0.22, 1.85, this.materials.concrete, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('House14_PorchSnow', porchX, GY + 2.71, -23.55, 2.65, 0.12, 1.8, this.materials.snow, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('House14_PorchColL', porchX - 1.15, GY + 1.35, -22.75, 0.18, 2.45, 0.18, porchPillarMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        this._addStaticBox('House14_PorchColR', porchX + 1.15, GY + 1.35, -22.75, 0.18, 2.45, 0.18, porchPillarMat, {
            collide: false, blocker: false, category: 'courtyard'
        });
        const porchLampMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.12, 0.16),
            new THREE.MeshBasicMaterial({ color: 0xffd288 })
        );
        porchLampMesh.position.set(porchX, GY + 2.38, -24.22);
        this.scene.add(porchLampMesh);
        this._registerEditable(porchLampMesh, 'House14_PorchLamp', {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: porchLampMesh, materialKey: 'ceiling' }
        });
        const porchLight = new THREE.PointLight(0xffbe6b, 1.1, 8.5, 1.6);
        porchLight.position.set(porchX, GY + 2.15, -23.7);
        this.scene.add(porchLight);
        this._registerLight(porchLight, 'house14PorchLight', t('light.house14_porch'), null);

        this._buildSnowBench('House14_SnowBench', 5.3, GY, -23.1);

        const treePlacements = [
            { x: -6.8, z: -9.2, type: 'spruce', scale: 1.15 },
            { x: -10.5, z: -11.4, type: 'birch', scale: 1.05 },
            { x: -14.8, z: -10.0, type: 'spruce', scale: 1.25 },
            { x: -5.6, z: -20.2, type: 'spruce', scale: 1.1 },
            { x: -11.6, z: -20.8, type: 'birch', scale: 1.15 },
            { x: -16.8, z: -18.8, type: 'spruce', scale: 1.3 },
            { x: 6.8, z: -9.5, type: 'birch', scale: 1.08 },
            { x: 11.2, z: -11.2, type: 'spruce', scale: 1.2 },
            { x: 7.4, z: -20.0, type: 'spruce', scale: 1.12 },
            { x: 13.6, z: -20.5, type: 'birch', scale: 1.18 }
        ];
        treePlacements.forEach((tp, idx) => {
            this._buildCourtyardTree(`CourtyardTree_${idx}`, tp.x, GY, tp.z, tp.type, tp.scale);
        });

        this._buildBackdropHouse('BackdropHouse_West', -29.5, GY, -25.8, 15.5, 17.5, 1.5, Math.PI / 2, 5, 5);
        this._buildBackdropHouse('BackdropHouse_East', 29.5, GY, -25.8, 15.5, 17.5, 1.5, -Math.PI / 2, 5, 5);
        this._buildBackdropHouse('BackdropHouse_SouthWest', -29.5, GY, -4.5, 14.0, 17.5, 1.5, Math.PI / 2, 5, 5);
        this._buildBackdropHouse('BackdropHouse_SouthEast', 29.5, GY, -4.5, 14.0, 17.5, 1.5, -Math.PI / 2, 5, 5);
        this._buildBackdropHouse('BackdropHouse_FarLeft', -22.5, GY, -38.5, 20.0, 22.0, 1.5, 0.08, 7, 6);
        this._buildBackdropHouse('BackdropHouse_FarCenter', 0.0, GY, -42.0, 24.0, 23.0, 1.5, 0.0, 7, 7);
        this._buildBackdropHouse('BackdropHouse_FarRight', 22.5, GY, -38.5, 20.0, 22.0, 1.5, -0.08, 7, 6);

        this._buildNightSky();
    }

    _buildSnowBench(name, x, gy, z) {
        const group = new THREE.Group();
        group.position.set(x, gy, z);
        const woodMat = this._ps1Mat({ color: 0x4f3622, roughness: 0.9 });
        const legMat = this._ps1Mat({ color: 0x1e2024, roughness: 0.75, metalness: 0.45 });
        const snowMat = this.materials.snow;

        [-0.68, 0.68].forEach(lx => {
            const legF = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.08), legMat);
            legF.position.set(lx, 0.22, 0.16);
            const legB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.84, 0.08), legMat);
            legB.position.set(lx, 0.42, -0.2);
            group.add(legF, legB);
        });

        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.06, 0.46), woodMat);
        seat.position.set(0, 0.45, -0.02);
        const seatSnow = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.44), snowMat);
        seatSnow.position.set(0, 0.51, -0.02);

        const back = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.34, 0.05), woodMat);
        back.position.set(0, 0.74, -0.2);
        back.rotation.x = -0.14;
        const backSnow = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, 0.09), snowMat);
        backSnow.position.set(0, 0.91, -0.22);

        group.add(seat, seatSnow, back, backSnow);
        this.scene.add(group);
        this._registerEditable(group, name, {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: seat, boxSize: [1.65, 0.95, 0.52], materialKey: 'wood' }
        });
    }

    _buildNightSky() {
        this.scene.fog = new THREE.Fog(0x0b101c, 11, 45);
        this.scene.background = new THREE.Color(0x060911);

        const starCount = 360;
        const R = 95;
        const centerX = 0;
        const centerY = -6.5;
        const centerZ = -18.0;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        let seed = 918273;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return (seed % 10000) / 10000;
        };

        for (let i = 0; i < starCount; i++) {
            const theta = rand() * Math.PI * 2;
            const sinPhi = 0.14 + rand() * 0.86;
            const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi));

            positions[i * 3] = centerX + Math.cos(theta) * cosPhi * R;
            positions[i * 3 + 1] = centerY + sinPhi * R;
            positions[i * 3 + 2] = centerZ + Math.sin(theta) * cosPhi * R;

            const horizonFade = sinPhi < 0.35 ? 0.25 + ((sinPhi - 0.14) / 0.21) * 0.75 : 1.0;
            const tint = rand();
            const bright = (0.45 + rand() * 0.55) * horizonFade;
            if (tint < 0.25) {
                colors[i * 3] = 0.78 * bright;
                colors[i * 3 + 1] = 0.88 * bright;
                colors[i * 3 + 2] = 1.0 * bright;
            } else if (tint < 0.45) {
                colors[i * 3] = 1.0 * bright;
                colors[i * 3 + 1] = 0.94 * bright;
                colors[i * 3 + 2] = 0.8 * bright;
            } else {
                colors[i * 3] = bright;
                colors[i * 3 + 1] = bright;
                colors[i * 3 + 2] = bright;
            }
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const starMat = new THREE.PointsMaterial({
            size: 1.0,
            vertexColors: true,
            transparent: true,
            opacity: 0.88,
            fog: false,
            sizeAttenuation: false
        });
        const stars = new THREE.Points(starGeo, starMat);
        stars.name = 'SkyStars';
        this.scene.add(stars);
        this.world.skyStars = stars;

        this.world.skyClouds = [];

        const fogCanvas = document.createElement('canvas');
        fogCanvas.width = 128;
        fogCanvas.height = 128;
        const fctx = fogCanvas.getContext('2d');
        const grad = fctx.createRadialGradient(64, 64, 6, 64, 64, 62);
        grad.addColorStop(0.0, 'rgba(18, 25, 42, 0.42)');
        grad.addColorStop(0.55, 'rgba(14, 20, 34, 0.22)');
        grad.addColorStop(1.0, 'rgba(11, 16, 28, 0.0)');
        fctx.fillStyle = grad;
        fctx.fillRect(0, 0, 128, 128);
        const fogTex = new THREE.CanvasTexture(fogCanvas);

        this.world.distantFogLayers = [];
        const fogSpecs = [
            { x: 0, y: -3.2, z: -20.5, w: 38, h: 7.5, op: 0.38 },
            { x: -10, y: -2.4, z: -27.5, w: 46, h: 9.0, op: 0.48 },
            { x: 10, y: -2.4, z: -31.5, w: 46, h: 9.5, op: 0.52 },
            { x: 0, y: -1.6, z: -36.5, w: 56, h: 11.0, op: 0.62 },
            { x: 0, y: -0.8, z: -40.5, w: 64, h: 12.5, op: 0.72 }
        ];
        fogSpecs.forEach((fs, idx) => {
            const mat = new THREE.MeshBasicMaterial({
                map: fogTex,
                transparent: true,
                opacity: fs.op,
                depthWrite: false,
                side: THREE.DoubleSide,
                fog: false
            });
            const mist = new THREE.Mesh(new THREE.PlaneGeometry(fs.w, fs.h), mat);
            mist.name = `DistantFog_${idx}`;
            mist.position.set(fs.x, fs.y, fs.z);
            this.scene.add(mist);
            this.world.distantFogLayers.push(mist);
        });
    }

    _buildCourtyardTree(name, x, gy, z, variant = 'spruce', scale = 1.0) {
        const treeGO = new GameObject(name);
        treeGO.transform.position.set(x, gy, z);
        const trunkMat = variant === 'birch'
            ? this._ps1Mat({ color: 0xcfd2cc, roughness: 0.92 })
            : this._ps1Mat({ color: 0x3b271c, roughness: 0.95 });
        const pineMat = this._ps1Mat({ color: 0x162b1c, roughness: 0.92 });
        const snowMat = this.materials.snow;

        if (variant === 'birch') {
            const h = 4.6 * scale;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * scale, 0.16 * scale, h, 6), trunkMat);
            trunk.position.y = h * 0.5;
            treeGO.transform.add(trunk);

            const branchSpecs = [
                { y: 2.3 * scale, rx: 0.65, rz: 0.72, len: 1.5 * scale },
                { y: 2.8 * scale, rx: -0.55, rz: -0.68, len: 1.4 * scale },
                { y: 3.3 * scale, rx: 0.48, rz: -0.62, len: 1.25 * scale },
                { y: 3.7 * scale, rx: -0.6, rz: 0.55, len: 1.15 * scale }
            ];
            for (const b of branchSpecs) {
                const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * scale, 0.055 * scale, b.len, 5), trunkMat);
                br.position.set(0, b.y, 0);
                br.rotation.set(b.rx, 0, b.rz);
                const sn = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.08 * scale, b.len * 0.65), snowMat);
                sn.position.set(0, b.len * 0.18, 0);
                br.add(sn);
                treeGO.transform.add(br);
            }
            const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95 * scale, 0), snowMat);
            crown.scale.set(1.2, 0.85, 1.2);
            crown.position.y = 4.2 * scale;
            treeGO.transform.add(crown);
            treeGO.addComponent(BoxCollider, new THREE.Vector3(0.45 * scale, h, 0.45 * scale));
            treeGO.addComponent(RigidBody, { bodyType: 'static' });
            this.engine.addGameObject(treeGO);
            this._registerEditable(treeGO.transform, name, {
                category: 'courtyard',
                extra: { gameObject: treeGO, primaryMesh: trunk, collide: true, materialKey: 'snow' }
            });
            return;
        }

        const trunkH = 1.4 * scale;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.22 * scale, trunkH, 6), trunkMat);
        trunk.position.y = trunkH * 0.5;
        treeGO.transform.add(trunk);

        const tiers = [
            { y: 1.95 * scale, r: 1.35 * scale, h: 1.9 * scale },
            { y: 3.10 * scale, r: 1.05 * scale, h: 1.65 * scale },
            { y: 4.15 * scale, r: 0.72 * scale, h: 1.4 * scale }
        ];
        for (const t of tiers) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), pineMat);
            cone.position.y = t.y;
            const snowCap = new THREE.Mesh(new THREE.ConeGeometry(t.r * 0.92, t.h * 0.58, 7), snowMat);
            snowCap.position.y = t.y + t.h * 0.24;
            treeGO.transform.add(cone, snowCap);
        }

        treeGO.addComponent(BoxCollider, new THREE.Vector3(0.65 * scale, 4.8 * scale, 0.65 * scale));
        treeGO.addComponent(RigidBody, { bodyType: 'static' });
        this.engine.addGameObject(treeGO);
        this._registerEditable(treeGO.transform, name, {
            category: 'courtyard',
            extra: { gameObject: treeGO, primaryMesh: trunk, collide: true, materialKey: 'pine' }
        });
    }

    _buildBackdropHouse(name, x, gy, z, width, height, depth, rotY = 0, floors = 5, cols = 6) {
        const group = new THREE.Group();
        group.position.set(x, gy + height * 0.5 - 0.1, z);
        group.rotation.y = rotY;

        const bodyMat = this._ps1Mat({ color: 0x3b4048, roughness: 0.95, snap: false });
        const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
        group.add(body);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.35, depth + 0.3), this.materials.snow);
        roof.position.y = height * 0.5 + 0.12;
        group.add(roof);

        const winGeo = new THREE.PlaneGeometry(1.45, 1.35);
        const darkMat = new THREE.MeshBasicMaterial({ color: 0x090d14, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        const warmMat = new THREE.MeshBasicMaterial({ color: 0xd19c45, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        const tvMat = new THREE.MeshBasicMaterial({ color: 0x557ab5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

        let seed = 17;
        for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0xffff;

        const xSpan = width * 0.78;
        const ySpan = height * 0.78;
        for (let f = 0; f < floors; f++) {
            for (let c = 0; c < cols; c++) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const r = (seed % 100) / 100;
                const mat = r < 0.18 ? warmMat : (r < 0.28 ? tvMat : darkMat);
                const win = new THREE.Mesh(winGeo, mat);
                const wx = cols > 1 ? -xSpan * 0.5 + (c / (cols - 1)) * xSpan : 0;
                const wy = floors > 1 ? -ySpan * 0.5 + (f / (floors - 1)) * ySpan : 0;
                win.position.set(wx, wy, depth * 0.5 + 0.18);
                group.add(win);
            }
        }

        this.scene.add(group);
        this._registerEditable(group, name, {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: body, materialKey: 'concrete' }
        });
    }

    _buildApartmentDecorations() {
        this._currentCategory = 'props';
        this._currentGroupId = null;

        const goldTinsel = this._ps1Mat({ color: 0xf7d046, emissive: 0x805a10, emissiveIntensity: 0.45, roughness: 0.35 });
        const redTinsel = this._ps1Mat({ color: 0xc92222, emissive: 0x550808, emissiveIntensity: 0.4, roughness: 0.38 });
        const greenPine = this._ps1Mat({ color: 0x1e5c2c, roughness: 0.85 });
        const snowflakeMat = this._ps1Mat({ color: 0xf0f6ff, emissive: 0x7a90a8, emissiveIntensity: 0.35, doubleSided: true });
        const bulbGold = new THREE.MeshBasicMaterial({ color: 0xffe478 });
        const bulbRed = new THREE.MeshBasicMaterial({ color: 0xff4242 });
        const bulbBlue = new THREE.MeshBasicMaterial({ color: 0x57b8ff });
        const boxMat = this._ps1Mat({ color: 0x8f6b47, roughness: 0.92 });

        const boxGO = new GameObject('DecorBox');
        boxGO.transform.position.set(3.82, 0.0, 3.65);
        const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.36), boxMat);
        boxMesh.position.y = 0.14;
        const rimTinsel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 6, 12), goldTinsel);
        rimTinsel.rotation.x = Math.PI / 2;
        rimTinsel.position.set(-0.04, 0.29, 0.02);
        const peekBall1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), redTinsel);
        peekBall1.position.set(0.09, 0.28, -0.05);
        const peekBall2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), bulbBlue);
        peekBall2.position.set(-0.08, 0.28, -0.06);
        boxGO.transform.add(boxMesh, rimTinsel, peekBall1, peekBall2);
        this.engine.addGameObject(boxGO);
        this._registerEditable(boxGO.transform, 'DecorBox', {
            category: 'props',
            extra: { gameObject: boxGO, primaryMesh: boxMesh, materialKey: 'woodFrame' }
        });

        const addSnowflake = (parent, x, y, z, size = 0.13) => {
            const flake = new THREE.Group();
            flake.position.set(x, y, z);
            for (let a = 0; a < 3; a++) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.16, 0.01), snowflakeMat);
                bar.rotation.z = (a * Math.PI) / 3;
                flake.add(bar);
            }
            parent.add(flake);
        };

        const addGarlandArc = (parent, x1, y1, z1, x2, y2, z2, sag = 0.22, count = 9, mat = goldTinsel) => {
            for (let i = 0; i <= count; i++) {
                const u = i / count;
                const px = THREE.MathUtils.lerp(x1, x2, u);
                const py = THREE.MathUtils.lerp(y1, y2, u) - Math.sin(u * Math.PI) * sag;
                const pz = THREE.MathUtils.lerp(z1, z2, u);
                const seg = new THREE.Mesh(new THREE.SphereGeometry(i % 2 === 0 ? 0.042 : 0.032, 6, 5), i % 3 === 0 ? redTinsel : mat);
                seg.position.set(px, py, pz);
                parent.add(seg);
            }
        };

        const decorHall = new THREE.Group();
        addGarlandArc(decorHall, -2.2, 2.28, -3.40, -0.2, 2.28, -3.40, 0.24, 11, goldTinsel);
        addGarlandArc(decorHall, -1.10, 1.93, 1.02, 0.40, 1.93, 1.02, 0.16, 10, redTinsel);
        addSnowflake(decorHall, -1.7, 1.62, -3.46, 0.16);
        addSnowflake(decorHall, -0.75, 1.72, -3.46, 0.14);
        addSnowflake(decorHall, -1.25, 1.25, -3.46, 0.13);
        const hBulbL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), bulbGold);
        hBulbL.position.set(-2.1, 2.15, -3.38);
        const hBulbR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), bulbBlue);
        hBulbR.position.set(-0.3, 2.15, -3.38);
        decorHall.add(hBulbL, hBulbR);
        decorHall.visible = false;
        this.scene.add(decorHall);
        this._registerEditable(decorHall, 'Decor_Hall', {
            category: 'activated',
            activatedGroup: 'decor',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: hBulbL, materialKey: 'gold' }
        });

        const decorKitchen = new THREE.Group();
        addGarlandArc(decorKitchen, 2.38, 2.26, -3.40, 3.82, 2.26, -3.40, 0.20, 9, redTinsel);
        addGarlandArc(decorKitchen, 2.30, 2.02, -0.82, 3.85, 2.02, -0.82, 0.16, 8, goldTinsel);
        addSnowflake(decorKitchen, 2.78, 1.68, -3.46, 0.14);
        addSnowflake(decorKitchen, 3.42, 1.48, -3.46, 0.13);
        const kBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), bulbRed);
        kBulb.position.set(3.1, 2.06, -3.38);
        decorKitchen.add(kBulb);
        decorKitchen.visible = false;
        this.scene.add(decorKitchen);
        this._registerEditable(decorKitchen, 'Decor_Kitchen', {
            category: 'activated',
            activatedGroup: 'decor',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: kBulb, materialKey: 'gold' }
        });

        const decorHallway = new THREE.Group();
        const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.065, 6, 12), greenPine);
        wreath.rotation.y = Math.PI / 2;
        wreath.position.set(4.09, 1.56, 3.55);
        const bow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.16), redTinsel);
        bow.position.set(4.04, 1.33, 3.55);
        decorHallway.add(wreath, bow);
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            const bauble = new THREE.Mesh(new THREE.SphereGeometry(0.036, 5, 4), i % 2 === 0 ? bulbGold : bulbRed);
            bauble.position.set(4.04, 1.56 + Math.sin(ang) * 0.22, 3.55 + Math.cos(ang) * 0.22);
            decorHallway.add(bauble);
        }
        addGarlandArc(decorHallway, 2.52, 2.24, 4.38, 3.62, 2.24, 4.38, 0.15, 7, goldTinsel);
        decorHallway.visible = false;
        this.scene.add(decorHallway);
        this._registerEditable(decorHallway, 'Decor_Hallway', {
            category: 'activated',
            activatedGroup: 'decor',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: wreath, materialKey: 'pine' }
        });

        const mistletoeHanging = new THREE.Group();
        mistletoeHanging.position.set(1.98, 2.08, 0.68);
        const mRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), redTinsel);
        mRibbon.position.y = 0.06;
        const mLeaf1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), greenPine);
        mLeaf1.rotation.z = 0.45;
        mLeaf1.position.set(-0.04, -0.04, 0);
        const mLeaf2 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), greenPine);
        mLeaf2.rotation.z = -0.45;
        mLeaf2.position.set(0.04, -0.04, 0);
        const berryMat = new THREE.MeshStandardMaterial({ color: 0xf0f4ee, roughness: 0.4 });
        const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), berryMat);
        b1.position.set(-0.02, -0.09, 0.02);
        const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), berryMat);
        b2.position.set(0.025, -0.085, -0.015);
        mistletoeHanging.add(mRibbon, mLeaf1, mLeaf2, b1, b2);
        this.scene.add(mistletoeHanging);
        this._registerEditable(mistletoeHanging, 'Mistletoe_Hanging', {
            category: 'props',
            extra: { isSceneProp: true, primaryMesh: mLeaf1, materialKey: 'pine' }
        });

        const mistletoeTrampled = new THREE.Group();
        mistletoeTrampled.position.set(1.98, 0.018, 0.68);
        for (let k = 0; k < 5; k++) {
            const crushed = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.05), greenPine);
            crushed.position.set((k - 2) * 0.045, 0, ((k % 2) - 0.5) * 0.06);
            crushed.rotation.y = k * 0.9;
            mistletoeTrampled.add(crushed);
        }
        const crushedRed = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.035), redTinsel);
        crushedRed.rotation.y = 0.5;
        const crushedBerry = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 5), berryMat);
        crushedBerry.position.set(0.04, 0.008, 0.03);
        mistletoeTrampled.add(crushedRed, crushedBerry);
        mistletoeTrampled.visible = false;
        this.scene.add(mistletoeTrampled);
        this._registerEditable(mistletoeTrampled, 'Mistletoe_Trampled', {
            category: 'activated',
            activatedGroup: 'act4',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: crushedRed, materialKey: 'pine' }
        });
        this.world.mistletoe = { hanging: mistletoeHanging, trampled: mistletoeTrampled };

        const strollerGroup = new THREE.Group();
        const stCoatMat = this._ps1Mat({ color: 0x28303d, roughness: 0.9 });
        const stPantsMat = this._ps1Mat({ color: 0x1a1e26, roughness: 0.92 });
        const stBootMat = this._ps1Mat({ color: 0x121214, roughness: 0.85 });
        const stSkinMat = this._ps1Mat({ color: 0xc8a287, roughness: 0.85 });
        const stFurMat = this._ps1Mat({ color: 0x45382e, roughness: 0.95 });

        const stLeftLeg = new THREE.Group();
        stLeftLeg.position.set(-0.10, 0.78, 0);
        const stLLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), stPantsMat);
        stLLegMesh.position.y = -0.31;
        const stLBoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.24), stBootMat);
        stLBoot.position.set(0.03, -0.70, 0);
        stLeftLeg.add(stLLegMesh, stLBoot);

        const stRightLeg = new THREE.Group();
        stRightLeg.position.set(0.10, 0.78, 0);
        const stRLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), stPantsMat);
        stRLegMesh.position.y = -0.31;
        const stRBoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.24), stBootMat);
        stRBoot.position.set(0.03, -0.70, 0);
        stRightLeg.add(stRLegMesh, stRBoot);

        const stTorso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.78, 0.44), stCoatMat);
        stTorso.position.y = 1.12;
        const stCollar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), stFurMat);
        stCollar.position.y = 1.48;

        const stLeftArm = new THREE.Group();
        stLeftArm.position.set(0, 1.42, -0.26);
        const stLArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.13), stCoatMat);
        stLArmMesh.position.y = -0.26;
        stLeftArm.add(stLArmMesh);

        const stRightArm = new THREE.Group();
        stRightArm.position.set(0, 1.42, 0.26);
        const stRArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.13), stCoatMat);
        stRArmMesh.position.y = -0.26;
        stRightArm.add(stRArmMesh);

        const stHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), stSkinMat);
        stHead.position.y = 1.64;
        const stHat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.25), stFurMat);
        stHat.position.y = 1.76;
        const stEarFlapL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.05), stFurMat);
        stEarFlapL.position.set(0.02, 1.66, -0.13);
        const stEarFlapR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.05), stFurMat);
        stEarFlapR.position.set(0.02, 1.66, 0.13);

        strollerGroup.add(stLeftLeg, stRightLeg, stTorso, stCollar, stLeftArm, stRightArm, stHead, stHat, stEarFlapL, stEarFlapR);
        strollerGroup.userData.limbs = { leftLeg: stLeftLeg, rightLeg: stRightLeg, leftArm: stLeftArm, rightArm: stRightArm };
        strollerGroup.position.set(-14.0, -6.5, -17.5);
        strollerGroup.visible = false;
        this.scene.add(strollerGroup);
        this._registerEditable(strollerGroup, 'CourtyardStroller', {
            category: 'activated',
            activatedGroup: 'act2',
            defaultHidden: true,
            extra: { isSceneProp: true, primaryMesh: stTorso, materialKey: 'sofaFabric' }
        });
        this.world.courtyardStroller = strollerGroup;

        const spotMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
        const spotHall = this._addStaticBox('DecorSpot_Hall', -1.2, 1.45, -3.28, 1.1, 0.9, 0.35, spotMat, {
            collide: false, blocker: false, category: 'gameplay'
        }).go;
        const spotKitchen = this._addStaticBox('DecorSpot_Kitchen', 3.1, 1.45, -3.28, 1.0, 0.9, 0.35, spotMat, {
            collide: false, blocker: false, category: 'gameplay'
        }).go;
        const spotHallway = this._addStaticBox('DecorSpot_Hallway', 4.08, 1.48, 3.55, 0.35, 0.9, 0.9, spotMat, {
            collide: false, blocker: false, category: 'gameplay'
        }).go;

        // Pulsing golden target highlights on the walls/windows where the player should aim to decorate the apartment
        const hlHall = this.createDecorHighlightFrame(1.25, 0.85, 'xy');
        hlHall.position.set(0, 0.15, -0.12);
        hlHall.visible = false;
        spotHall.transform.add(hlHall);

        const hlKitchen = this.createDecorHighlightFrame(1.10, 0.82, 'xy');
        hlKitchen.position.set(0, 0.15, -0.12);
        hlKitchen.visible = false;
        spotKitchen.transform.add(hlKitchen);

        const hlHallway = this.createDecorHighlightFrame(0.82, 0.82, 'yz');
        hlHallway.position.set(0.02, 0.06, 0);
        hlHallway.visible = false;
        spotHallway.transform.add(hlHallway);

        this.world.decorQuest = {
            box: boxGO,
            spots: {
                hall: spotHall,
                kitchen: spotKitchen,
                hallway: spotHallway
            },
            highlights: {
                hall: hlHall,
                kitchen: hlKitchen,
                hallway: hlHallway
            },
            meshes: {
                hall: decorHall,
                kitchen: decorKitchen,
                hallway: decorHallway
            }
        };
    }

    _buildLowPolyCar(x, gy, z, rotY, color, name = 'CourtyardCar') {
        const car = new THREE.Group();
        car.position.set(x, gy, z);
        car.rotation.y = rotY;
        const bodyMat = this._ps1Mat({ color });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.65, 3.8), bodyMat);
        body.position.y = 0.52;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.55, 1.9), bodyMat);
        cabin.position.set(0, 1.08, -0.1);
        const snowCap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.95), this.materials.snow);
        snowCap.position.set(0, 1.38, -0.1);
        const hoodSnow = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 1.25), this.materials.snow);
        hoodSnow.position.set(0, 0.88, 1.25);
        car.add(body, cabin, snowCap, hoodSnow);
        this.scene.add(car);
        this._registerEditable(car, name, {
            category: 'courtyard',
            extra: { isSceneProp: true, primaryMesh: body, materialKey: 'metal' }
        });
    }

    _buildParticles() {
        this._currentCategory = 'gameplay';
        this._currentGroupId = null;

        const snowGO = new GameObject('CourtyardSnow');
        snowGO.transform.position.set(0, -6.5, -15.0);
        snowGO.addComponent(ParticleEmitter, {
            mode: 'snow',
            count: 480,
            bounds: new THREE.Vector3(32, 16, 19.5),
            color: 0xe6f0ff,
            size: 0.042,
            speed: 1.0
        });
        this.engine.addGameObject(snowGO);
        this._registerEditable(snowGO.transform, 'CourtyardSnow', {
            extra: { gameObject: snowGO }
        });

        const steamGO = new GameObject('OvenSteam');
        steamGO.transform.position.set(3.55, 0.36, -2.10);
        this.world.steamEmitter = steamGO.addComponent(ParticleEmitter, {
            mode: 'steam',
            count: 55,
            color: 0xdbe3eb,
            size: 0.07,
            active: false,
            opacity: 0.55
        });
        this.engine.addGameObject(steamGO);
        this._registerEditable(steamGO.transform, 'OvenSteam', {
            extra: { gameObject: steamGO }
        });

        const smokeGO = new GameObject('CigaretteSmoke');
        smokeGO.transform.position.set(0.85, 1.35, -4.1);
        this.world.cigSmokeEmitter = smokeGO.addComponent(ParticleEmitter, {
            mode: 'smoke',
            count: 28,
            color: 0xc8d2dc,
            size: 0.018,
            active: false,
            opacity: 0.26
        });
        this.engine.addGameObject(smokeGO);
        this._registerEditable(smokeGO.transform, 'CigaretteSmoke', {
            extra: { gameObject: smokeGO }
        });

        const fwGO = new GameObject('MidnightFireworks');
        fwGO.transform.position.set(0, 0, 0);
        this.world.fireworksEmitter = fwGO.addComponent(ParticleEmitter, {
            mode: 'fireworks',
            count: 360,
            size: 0.16,
            active: true,
            opacity: 0.95
        });
        this.engine.addGameObject(fwGO);
        this._registerEditable(fwGO.transform, 'MidnightFireworks', {
            extra: { gameObject: fwGO }
        });
    }

    _buildPrimitiveGeometry(shape, w, h, d, radialSegs = 10) {
        const cw = Math.max(0.01, w);
        const ch = Math.max(0.01, h);
        const cd = Math.max(0.01, d);
        if (shape === 'cylinder') {
            return new THREE.CylinderGeometry(Math.max(0.005, cw * 0.5), Math.max(0.005, cd * 0.5), ch, radialSegs || 10);
        }
        if (shape === 'plane') {
            return new THREE.PlaneGeometry(cw, ch);
        }
        if (shape === 'sphere') {
            return new THREE.SphereGeometry(Math.max(0.005, cw * 0.5), 10, 8);
        }
        const wSegs = Math.min(8, Math.max(1, Math.round(cw / 0.75)));
        const hSegs = Math.min(6, Math.max(1, Math.round(ch / 0.75)));
        const dSegs = Math.min(8, Math.max(1, Math.round(cd / 0.75)));
        return new THREE.BoxGeometry(Math.max(0.02, cw), Math.max(0.02, ch), Math.max(0.02, cd), wSegs, hSegs, dSegs);
    }

    spawnCustomObject(cfg) {
        if (!cfg || !cfg.name) return null;
        if (this._editableByName.has(cfg.name)) {
            return this._editableByName.get(cfg.name);
        }

        const shape = cfg.shape || 'box';
        const boxSize = Array.isArray(cfg.boxSize) ? cfg.boxSize : [1, 1, 1];
        const [w, h, d] = boxSize;
        const matKey = cfg.materialKey || 'concrete';
        const hasCustomMatPatch = cfg.color !== undefined || cfg.emissive !== undefined ||
            cfg.roughness !== undefined || cfg.metalness !== undefined ||
            cfg.opacity !== undefined || cfg.repeatX !== undefined || cfg.repeatY !== undefined;

        const go = new GameObject(cfg.name);
        const hasCollide = cfg.collide !== false;
        const hasBlocker = cfg.blocker !== false;
        let primaryMesh = null;

        const templateObj = cfg.templateFrom ? this._editableByName.get(cfg.templateFrom) : null;
        if (templateObj && !cfg.forcePrimitive) {
            const cloneSubtree = (srcNode) => {
                let dst;
                if (srcNode.isMesh) {
                    const useOverrideMat = hasCustomMatPatch
                        ? this.createCustomMaterial(matKey, { ...cfg, doubleSided: srcNode.material?.side === THREE.DoubleSide })
                        : srcNode.material;
                    dst = new THREE.Mesh(srcNode.geometry, useOverrideMat);
                    dst.castShadow = cfg.castShadow !== undefined ? !!cfg.castShadow : srcNode.castShadow;
                    dst.receiveShadow = cfg.receiveShadow !== undefined ? cfg.receiveShadow !== false : srcNode.receiveShadow;
                    if (!primaryMesh) primaryMesh = dst;
                    if (hasBlocker && dst.visible) this.blockerMeshes.push(dst);
                } else {
                    dst = new THREE.Group();
                }
                dst.position.copy(srcNode.position);
                dst.rotation.copy(srcNode.rotation);
                dst.scale.copy(srcNode.scale);
                dst.visible = srcNode === templateObj ? true : srcNode.visible;
                for (const ch of srcNode.children) {
                    dst.add(cloneSubtree(ch));
                }
                return dst;
            };

            if (templateObj.isMesh) {
                const cloned = cloneSubtree(templateObj);
                cloned.position.set(0, 0, 0);
                cloned.rotation.set(0, 0, 0);
                cloned.scale.set(1, 1, 1);
                cloned.visible = true;
                go.transform.add(cloned);
                primaryMesh = cloned;
            } else {
                for (const ch of templateObj.children) {
                    go.transform.add(cloneSubtree(ch));
                }
            }
        } else {
            const geo = this._buildPrimitiveGeometry(shape, w, h, d, cfg.radialSegs || 10);
            const mat = this.createCustomMaterial(matKey, {
                ...cfg,
                doubleSided: shape === 'plane' ? true : cfg.doubleSided
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = !!cfg.castShadow;
            mesh.receiveShadow = cfg.receiveShadow !== false;
            go.transform.add(mesh);
            primaryMesh = mesh;
            if (hasBlocker) {
                this.blockerMeshes.push(mesh);
            }
        }

        const pos = Array.isArray(cfg.position) ? cfg.position : [0, 0.5, 0];
        const rot = Array.isArray(cfg.rotation) ? cfg.rotation : [0, 0, 0];
        const scl = Array.isArray(cfg.scale) ? cfg.scale : [1, 1, 1];
        go.transform.position.set(pos[0], pos[1], pos[2]);
        go.transform.rotation.set(rot[0], rot[1], rot[2]);
        go.transform.scale.set(scl[0], scl[1], scl[2]);
        go.transform.visible = cfg.visible !== false;

        if (hasCollide) {
            const cSize = Array.isArray(cfg.colliderSize) ? cfg.colliderSize : boxSize;
            const cOff = Array.isArray(cfg.colliderOffset) ? cfg.colliderOffset : [0, 0, 0];
            go.addComponent(BoxCollider, new THREE.Vector3(cSize[0], cSize[1], cSize[2]), new THREE.Vector3(cOff[0], cOff[1], cOff[2]));
            go.addComponent(RigidBody, { bodyType: 'static' });
        }

        this.engine.addGameObject(go);
        this._registerEditable(go.transform, cfg.name, {
            category: cfg.category || 'custom',
            groupId: null,
            extra: {
                isAdded: true,
                isStaticBox: !cfg.templateFrom && shape === 'box',
                isSinglePrimitive: !cfg.templateFrom && !!primaryMesh,
                shape: cfg.templateFrom ? null : shape,
                boxSize: [...boxSize],
                initialBoxSize: [...boxSize],
                templateFrom: cfg.templateFrom || null,
                radialSegs: cfg.radialSegs || 10,
                materialKey: matKey,
                collide: hasCollide,
                blocker: hasBlocker,
                castShadow: !!cfg.castShadow,
                receiveShadow: cfg.receiveShadow !== false,
                gameObject: go,
                primaryMesh,
                customConfig: JSON.parse(JSON.stringify(cfg))
            }
        });
        return go.transform;
    }

    spawnCustomLight(cfg) {
        if (!cfg || !cfg.name) return null;
        if (this._lightByKey.has(cfg.name)) {
            return this._lightByKey.get(cfg.name);
        }
        const color = cfg.color !== undefined ? cfg.color : 0xffe0a8;
        const intensity = cfg.intensity !== undefined ? cfg.intensity : 1.5;
        const distance = cfg.distance !== undefined ? cfg.distance : 8.0;
        const decay = cfg.decay !== undefined ? cfg.decay : 1.5;
        const light = new THREE.PointLight(color, intensity, distance, decay);
        const pos = Array.isArray(cfg.position) ? cfg.position : [0, 2.2, 0];
        light.position.set(pos[0], pos[1], pos[2]);
        light.visible = cfg.visible !== false;
        this.scene.add(light);
        this._registerLight(light, cfg.name, cfg.label || cfg.name, null, true);
        return light;
    }

    applyMapOverrides(overrides) {
        if (!overrides || typeof overrides !== 'object') return;

        if (Array.isArray(overrides.addedObjects)) {
            for (const cfg of overrides.addedObjects) {
                this.spawnCustomObject(cfg);
            }
        }

        if (Array.isArray(overrides.addedLights)) {
            for (const cfg of overrides.addedLights) {
                this.spawnCustomLight(cfg);
            }
        }

        const modObjs = overrides.modifiedObjects || {};
        for (const [name, patch] of Object.entries(modObjs)) {
            const obj = this._editableByName.get(name);
            if (!obj || !patch) continue;

            if (patch.deleted) {
                if (name === 'SofaCoverPivot') continue;
                obj.visible = false;
                obj.userData.deleted = true;
                const go = obj.userData.gameObject;
                if (go) {
                    const col = go.getComponent(BoxCollider);
                    if (col) col.enabled = false;
                    const inter = go.getComponent(Interactable);
                    if (inter) inter.enabled = false;
                    const gz = go.getComponent(GazeTrigger);
                    if (gz) gz.enabled = false;
                }
                const meshes = [];
                obj.traverse(c => { if (c.isMesh) meshes.push(c); });
                this.blockerMeshes = this.blockerMeshes.filter(m => !meshes.includes(m));
                continue;
            }

            if (patch.visible !== undefined) obj.visible = !!patch.visible;
            if (Array.isArray(patch.position)) {
                obj.position.set(patch.position[0], patch.position[1], patch.position[2]);
            }
            if (Array.isArray(patch.rotation)) {
                obj.rotation.set(patch.rotation[0], patch.rotation[1], patch.rotation[2]);
                if (obj.userData.setBaseYaw) {
                    const openOff = obj.userData.doorOpenOffset || 0;
                    obj.userData.setBaseYaw(patch.rotation[1] - openOff);
                }
            }
            if (Array.isArray(patch.scale)) {
                obj.scale.set(patch.scale[0], patch.scale[1], patch.scale[2]);
            }

            if (obj.userData.doorCfg && Array.isArray(patch.position)) {
                obj.userData.doorCfg.pivotPos.copy(obj.position);
            }
            if (name === 'ShowerCurtain' && Array.isArray(patch.position)) {
                const bathSpot = this.world.hidingSpots.find(s => s.id === 'bathroom');
                if (bathSpot && bathSpot.setCurtainClosedZ) {
                    bathSpot.setCurtainClosedZ(patch.position[2] + 0.58);
                }
            }

            if (Array.isArray(patch.boxSize) && (obj.userData.isStaticBox || obj.userData.isSinglePrimitive) && obj.userData.primaryMesh) {
                const [w, h, d] = patch.boxSize;
                const primShape = obj.userData.shape || 'box';
                obj.userData.primaryMesh.geometry.dispose();
                obj.userData.primaryMesh.geometry = this._buildPrimitiveGeometry(primShape, w, h, d, obj.userData.radialSegs || 10);
                obj.userData.boxSize = [w, h, d];
            }

            const hasMatOverride = patch.materialKey !== undefined || patch.color !== undefined ||
                patch.emissive !== undefined || patch.roughness !== undefined ||
                patch.metalness !== undefined || patch.opacity !== undefined ||
                patch.repeatX !== undefined || patch.repeatY !== undefined;
            if (hasMatOverride) {
                const mKey = patch.materialKey ?? obj.userData.materialKey ?? 'concrete';
                const mat = this.createCustomMaterial(mKey, patch);
                if (obj.userData.primaryMesh && !obj.userData.primaryMesh.userData?.isPlanarMirror) {
                    obj.userData.primaryMesh.material = mat;
                } else if (obj.isMesh && !obj.userData?.isPlanarMirror) {
                    obj.material = mat;
                } else {
                    obj.traverse(c => { if (c.isMesh && !c.userData?.isPlanarMirror) c.material = mat; });
                }
                obj.userData.materialKey = mKey;
                obj.userData.materialPatch = {
                    materialKey: mKey,
                    color: patch.color,
                    emissive: patch.emissive,
                    roughness: patch.roughness,
                    metalness: patch.metalness,
                    opacity: patch.opacity,
                    repeatX: patch.repeatX,
                    repeatY: patch.repeatY
                };
            }

            if (patch.castShadow !== undefined || patch.receiveShadow !== undefined) {
                obj.traverse(c => {
                    if (c.isMesh) {
                        if (patch.castShadow !== undefined) c.castShadow = !!patch.castShadow;
                        if (patch.receiveShadow !== undefined) c.receiveShadow = !!patch.receiveShadow;
                    }
                });
                if (patch.castShadow !== undefined) obj.userData.castShadow = !!patch.castShadow;
                if (patch.receiveShadow !== undefined) obj.userData.receiveShadow = !!patch.receiveShadow;
            }

            const go = obj.userData.gameObject;
            if (go) {
                let col = go.getComponent(BoxCollider);
                if (patch.collide === false) {
                    if (col) col.enabled = false;
                    obj.userData.collide = false;
                } else if (patch.collide === true || Array.isArray(patch.colliderSize) || Array.isArray(patch.colliderOffset) || Array.isArray(patch.boxSize)) {
                    const sz = Array.isArray(patch.colliderSize) ? patch.colliderSize : (obj.userData.boxSize || [1, 1, 1]);
                    const off = Array.isArray(patch.colliderOffset) ? patch.colliderOffset : null;
                    if (!col && patch.collide === true) {
                        col = go.addComponent(BoxCollider, new THREE.Vector3(sz[0], sz[1], sz[2]), off ? new THREE.Vector3(off[0], off[1], off[2]) : null);
                        if (!go.getComponent(RigidBody)) {
                            go.addComponent(RigidBody, { bodyType: 'static' });
                        }
                    }
                    if (col) {
                        if (patch.collide !== undefined) col.enabled = !!patch.collide;
                        if (Array.isArray(patch.colliderSize) || (Array.isArray(patch.boxSize) && !col.userDataCustomSize)) {
                            col.setSize(new THREE.Vector3(sz[0], sz[1], sz[2]));
                        }
                        if (Array.isArray(patch.colliderSize)) col.userDataCustomSize = true;
                        if (off) col.offset.set(off[0], off[1], off[2]);
                    }
                    if (patch.collide !== undefined) obj.userData.collide = !!patch.collide;
                }
            }

            if (patch.blocker !== undefined) {
                const meshes = [];
                obj.traverse(c => { if (c.isMesh) meshes.push(c); });
                if (patch.blocker) {
                    const targets = obj.userData.primaryMesh ? [obj.userData.primaryMesh] : meshes;
                    for (const m of targets) {
                        if (!this.blockerMeshes.includes(m)) this.blockerMeshes.push(m);
                    }
                } else {
                    this.blockerMeshes = this.blockerMeshes.filter(m => !meshes.includes(m));
                }
                obj.userData.blocker = !!patch.blocker;
            }
        }

        const modLights = overrides.modifiedLights || {};
        for (const [key, patch] of Object.entries(modLights)) {
            const light = this._lightByKey.get(key);
            if (!light || !patch) continue;
            if (patch.deleted) {
                light.visible = false;
                light.intensity = 0;
                light.userData.deleted = true;
                continue;
            }
            if (Array.isArray(patch.position)) light.position.set(patch.position[0], patch.position[1], patch.position[2]);
            if (patch.color !== undefined) light.color.setHex(patch.color);
            if (patch.intensity !== undefined) {
                light.intensity = patch.intensity;
                const rid = light.userData.roomId;
                if (rid && this.world.roomLights[rid] && patch.intensity > 0.01) {
                    this.world.roomLights[rid].baseIntensity = patch.intensity;
                }
            }
            if (patch.distance !== undefined && 'distance' in light) light.distance = patch.distance;
            if (patch.decay !== undefined && 'decay' in light) light.decay = patch.decay;
            if (patch.visible !== undefined) light.visible = !!patch.visible;
        }

        const gp = overrides.gameplay || {};
        if (gp.playerSpawn) {
            if (Array.isArray(gp.playerSpawn.position)) {
                this.world.playerSpawn.position.set(...gp.playerSpawn.position);
            }
            if (gp.playerSpawn.yaw !== undefined) this.world.playerSpawn.yaw = gp.playerSpawn.yaw;
            if (gp.playerSpawn.pitch !== undefined) this.world.playerSpawn.pitch = gp.playerSpawn.pitch;
        }
        if (Array.isArray(gp.patrolWaypoints) && gp.patrolWaypoints.length > 0) {
            this.world.patrolWaypoints = gp.patrolWaypoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        }
        if (gp.hidingSpots && typeof gp.hidingSpots === 'object') {
            for (const spot of this.world.hidingSpots) {
                const hp = gp.hidingSpots[spot.id];
                if (!hp) continue;
                if (Array.isArray(hp.hidePos)) spot.hidePos.set(...hp.hidePos);
                if (Array.isArray(hp.peekPos)) spot.peekPos.set(...hp.peekPos);
                if (hp.lookYaw !== undefined) spot.lookYaw = hp.lookYaw;
            }
        }
        if (gp.destroyedPoses && typeof gp.destroyedPoses === 'object') {
            if (gp.destroyedPoses.frontDoor) {
                const fdP = gp.destroyedPoses.frontDoor;
                if (Array.isArray(fdP.position)) this.world.destroyedPoses.frontDoor.position.set(...fdP.position);
                if (Array.isArray(fdP.rotation)) this.world.destroyedPoses.frontDoor.rotation.set(...fdP.rotation);
            }
            if (gp.destroyedPoses.tree) {
                const trP = gp.destroyedPoses.tree;
                if (Array.isArray(trP.position)) this.world.destroyedPoses.tree.position.set(...trP.position);
                if (Array.isArray(trP.rotation)) this.world.destroyedPoses.tree.rotation.set(...trP.rotation);
            }
        }
        if (gp.tablePoses && typeof gp.tablePoses === 'object' && this.world.table) {
            if (gp.tablePoses.balcony) {
                const bp = gp.tablePoses.balcony;
                if (Array.isArray(bp.position)) {
                    this.world.table.balconyPos.set(...bp.position);
                    this.world.table.go.transform.position.copy(this.world.table.balconyPos);
                }
                if (Array.isArray(bp.rotation)) {
                    this.world.table.balconyRot.set(...bp.rotation);
                    this.world.table.go.transform.rotation.copy(this.world.table.balconyRot);
                }
            }
            if (gp.tablePoses.hall) {
                const hp = gp.tablePoses.hall;
                if (Array.isArray(hp.position)) {
                    this.world.table.hallPos.set(...hp.position);
                    if (this.world.tablePlacementZone?.go) {
                        this.world.tablePlacementZone.go.transform.position.copy(this.world.table.hallPos);
                    }
                }
                if (Array.isArray(hp.rotation)) {
                    this.world.table.hallRot.set(...hp.rotation);
                    if (this.world.tablePlacementZone?.go) {
                        this.world.tablePlacementZone.go.transform.rotation.copy(this.world.table.hallRot);
                    }
                }
            }
        }

        if (gp.doorOpenAngles && typeof gp.doorOpenAngles === 'object') {
            for (const [doorName, angleVal] of Object.entries(gp.doorOpenAngles)) {
                const doorObj = this._editableByName.get(doorName);
                if (doorObj?.userData?.setOpenAngle && typeof angleVal === 'number') {
                    doorObj.userData.setOpenAngle(angleVal);
                }
            }
        }
        if (this.world.frontDoor) {
            this.world.frontDoor.initialPos = this.world.frontDoor.go.transform.position.clone();
            this.world.frontDoor.initialRot = this.world.frontDoor.go.transform.rotation.clone();
        }
        if (this.world.treeGO) {
            this.world.treeInitialPos = this.world.treeGO.transform.position.clone();
            this.world.treeInitialRot = this.world.treeGO.transform.rotation.clone();
        }
        if (this.world.neighborScene && this.world.neighborScene.victimGroup) {
            this.world.neighborScene.initialVictimPos = this.world.neighborScene.victimGroup.position.clone();
        }
    }

    setApartmentDestroyedState() {
        const fd = this.world.frontDoor;
        if (fd) {
            const dp = this.world.destroyedPoses?.frontDoor;
            if (dp) {
                fd.go.transform.position.copy(dp.position);
                fd.go.transform.rotation.copy(dp.rotation);
            } else {
                fd.go.transform.position.set(3.05, 0.08, 3.35);
                fd.go.transform.rotation.set(Math.PI / 2, 0, 0.12);
            }
            fd.clawDecal.visible = true;
            fd.collider.enabled = false;
        }

        if (this.world.table) {
            this.world.table.go.transform.visible = false;
            this.world.table.wreckedGO.transform.visible = true;
        }

        if (this.world.treeGO) {
            const tp = this.world.destroyedPoses?.tree;
            if (tp) {
                this.world.treeGO.transform.position.copy(tp.position);
                this.world.treeGO.transform.rotation.copy(tp.rotation);
            } else {
                this.world.treeGO.transform.position.set(-2.15, 0.35, 0.45);
                this.world.treeGO.transform.rotation.set(0.25, 0.6, -1.42);
            }
        }
        this.world.garlandOn = false;
        this.world.garlandLights.forEach(l => { l.intensity = 0; });
        if (this.world.treeGarlandGroup) this.world.treeGarlandGroup.visible = false;
        if (this.world.tornGarland) this.world.tornGarland.visible = true;
        if (this.world.mistletoe) {
            this.world.mistletoe.hanging.visible = false;
            this.world.mistletoe.trampled.visible = true;
        }
        if (this.world.fallenSantaHat) this.world.fallenSantaHat.visible = true;
        if (this.world.brokenBaubles) this.world.brokenBaubles.visible = true;
        if (this.world.fallenMirror) this.world.fallenMirror.visible = true;
        if (this.world.sideboardMirror) this.world.sideboardMirror.visible = false;

        if (this.world.crtTV) {
            this.world.crtTV.setMode('news', true);
        }

        if (this.world.roomLights.hall) this.world.roomLights.hall.setOn(false);
        if (this.world.roomLights.kitchen) this.world.roomLights.kitchen.setOn(false);
        if (this.world.roomLights.hallway) this.world.roomLights.hallway.setOn(false);
        if (this.world.roomLights.bathroom) this.world.roomLights.bathroom.setOn(false);
        if (this.world.lights.kitchenLight) this.world.lights.kitchenLight.intensity = 0.25;
        if (this.world.lights.hallwayLight) this.world.lights.hallwayLight.intensity = 0.22;
    }
}

export default KhrushchevkaBuilder;
