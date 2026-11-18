import * as THREE from 'three';
import { Engine, BoxCollider, RigidBody, Interactable, GazeTrigger } from '../../lumina/index.js';
import { KhrushchevkaBuilder } from '../world/KhrushchevkaBuilder.js';
import {
    MAP_OVERRIDES,
    normalizeMapOverrides,
    getEffectiveMapOverrides,
    saveOverridesToLocalStorage,
    clearLocalStorageOverrides,
    serializeMapOverridesToJS
} from '../world/MapOverrides.js';
import { TransformGizmo } from './TransformGizmo.js';

const CATEGORY_LABELS = {
    structure: 'Конструкции',
    doors: 'Двери/Штора',
    furniture: 'Мебель',
    fixtures: 'Приборы',
    stairwell: 'Подъезд',
    balcony: 'Балкон',
    courtyard: 'Двор',
    activated: 'Событийные (Акт)',
    gameplay: 'Геймплей',
    custom: 'Добавлено',
    props: 'Пропы'
};

const GROUP_LABELS = {
    group_sofa: 'Диван',
    group_armchair: 'Кресло',
    group_sideboard: 'Сервант',
    group_tv: 'Телевизор и тумба',
    group_fridge: 'Холодильник',
    group_stove: 'Газовая плита и вытяжка',
    group_kitchen_sink: 'Раковина (Кухня)',
    group_sink: 'Раковина (Ванная)',
    group_bathtub: 'Ванна',
    group_table_set: 'Стол + блюда'
};

const MATERIAL_LABELS = {
    parquet: 'Паркет (Зал)',
    linoleum: 'Линолеум (Кухня/Коридор)',
    carpet: 'Ковёр',
    tiles: 'Плитка (Ванная)',
    dermantine: 'Дерматин (Дверь)',
    panel: 'Панель (Фасад дома)',
    concrete: 'Бетон',
    stairwellWall: 'Стена подъезда',
    snow: 'Снег',
    wallpaperHall: 'Обои (Зал)',
    wallpaperKitchen: 'Обои (Кухня/Прихожая)',
    ceiling: 'Потолок / Штукатурка',
    woodDark: 'Тёмное дерево',
    woodFrame: 'Светлое дерево (Рамы)',
    tablecloth: 'Скатерть',
    sofaFabric: 'Ткань (Диван/Кресло)',
    fridgeWhite: 'Белая эмаль (Холод.)',
    stoveWhite: 'Эмаль плиты',
    metal: 'Металл',
    curtain: 'Штора / Ткань',
    glass: 'Стекло',
    mirror: 'Зеркало',
    wineLabel: 'Этикетка вина',
    crystal: 'Хрусталь',
    water: 'Вода',
    pine: 'Хвоя (Ёлка)',
    bloodClaw: 'Кровь / Царапины',
    santaHatRed: 'Красный бархат',
    santaHatFur: 'Белый мех',
    darkSilhouette: 'Тёмный силуэт',
    custom: 'Без текстуры (Цвет)'
};

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function round3(v) { return Math.round(v * 1000) / 1000; }
function vecArr(v) { return [round3(v.x), round3(v.y), round3(v.z)]; }
function eulerArr(e) { return [round3(e.x), round3(e.y), round3(e.z)]; }
function hexIntToCss(hex) { return '#' + ((hex >>> 0) & 0xffffff).toString(16).padStart(6, '0'); }
function cssToHexInt(str) { return parseInt((str || '#ffffff').replace('#', ''), 16) || 0; }
function arrApproxEq(a, b, eps = 0.001) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > eps) return false;
    }
    return true;
}

const FACTORY_GAMEPLAY = {
    playerSpawn: { position: [-2.65, 0.05, -1.0], yaw: round3(-Math.PI / 2), pitch: -0.05 },
    hidingSpots: {
        sofa: { hidePos: [-2.78, 0.16, -1.0], peekPos: [-2.35, 0.18, -1.0], lookYaw: -Math.PI / 2 },
        wardrobe: { hidePos: [1.52, 0.95, 3.68], peekPos: [1.75, 0.95, 3.68], lookYaw: -Math.PI / 2 },
        pantry: { hidePos: [1.45, 0.92, 2.42], peekPos: [1.68, 0.92, 2.42], lookYaw: -Math.PI / 2 },
        bathroom: { hidePos: [5.65, 0.96, 2.6], peekPos: [5.45, 0.96, 2.6], lookYaw: Math.PI / 2 }
    },
    destroyedPoses: {
        frontDoor: { position: [3.05, 0.08, 3.35], rotation: [Math.PI / 2, 0, 0.12] },
        tree: { position: [-2.15, 0.35, 0.45], rotation: [0.25, 0.6, -1.42] }
    },
    tablePoses: {
        balcony: { position: [-0.55, 0, -4.25], rotation: [0, 0, 0] },
        hall: { position: [-1.35, 0, -1.0], rotation: [0, round3(Math.PI / 2), 0] }
    },
    patrolWaypoints: [
        [3.10, 0, 3.20],
        [2.95, 0, 0.68],
        [1.10, 0, 0.45],
        [0.45, 0, -1.55],
        [-0.35, 0, -2.35],
        [-0.35, 0, 0.45],
        [1.10, 0, 0.45],
        [2.90, 0, -1.45],
        [3.10, 0, 2.50],
        [4.60, 0, 2.55],
        [3.10, 0, 3.55]
    ]
};

const CEILING_NAMES = new Set(['AptCeilingMain', 'AptCeilingSouth', 'StairwellCeiling']);

const ROOM_PRESETS = {
    hall: { pos: [-0.2, 2.1, -0.8], look: [-1.5, 0.8, 0.5] },
    kitchen: { pos: [3.2, 2.1, 0.3], look: [3.6, 0.9, -2.0] },
    hallway: { pos: [3.0, 2.0, 2.4], look: [3.0, 1.0, 4.2] },
    bath: { pos: [4.8, 2.2, -1.2], look: [4.8, 0.8, -2.5] },
    balcony: { pos: [-3.9, 1.9, -1.0], look: [-3.9, 1.0, 1.2] },
    stairwell: { pos: [3.3, 2.4, 7.6], look: [3.1, 1.1, 4.8] },
    courtyard: { pos: [-1.5, 4.5, -14.0], look: [-1.3, 1.2, -25.0] },
    overview: { pos: [0.5, 13.5, 9.0], look: [1.0, 0.0, 0.0] }
};

class MapEditor {
    constructor() {
        this.engine = new Engine('editorCanvas');
        this.engine.setSimulationPaused(true);
        this.engine.renderer.setBypassPostProcess(true);

        this.scene = this.engine.renderer.scene;
        this.perspectiveCam = this.engine.renderer.camera;
        this.perspectiveCam.fov = 65;
        this.perspectiveCam.near = 0.05;
        this.perspectiveCam.far = 220;
        this.perspectiveCam.updateProjectionMatrix();

        this.orthoCam = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 120);
        this.orthoCam.position.set(1.2, 22, 1.0);
        this.orthoCam.rotation.set(-Math.PI / 2, 0, 0);
        this.orthoZoom = 1.0;

        this.builder = new KhrushchevkaBuilder(this.engine);
        this.world = this.builder.build();

        this._initialMaterials = new Map();
        for (const obj of this.builder.editableObjects) {
            const targetMesh = obj.userData.primaryMesh || (obj.isMesh ? obj : null);
            const mKey = obj.userData.initialMaterialKey;
            if (mKey && this.builder.materials[mKey]) {
                this._initialMaterials.set(obj.name, this.builder.materials[mKey]);
            } else if (targetMesh?.material) {
                this._initialMaterials.set(obj.name, targetMesh.material);
            }
        }

        this.overrides = getEffectiveMapOverrides();
        for (const obj of this.builder.editableObjects) {
            obj.userData.logicalVisible = obj.visible;
        }

        this._editorHelpersGroup = new THREE.Group();
        this._editorHelpersGroup.name = '__EditorHelpersRoot';
        this.scene.add(this._editorHelpersGroup);

        this._workLights = this._createWorkLights();
        this._gridHelper = this._createGridAndAxes();
        this._colliderGroup = new THREE.Group();
        this._colliderGroup.name = '__EditorColliders';
        this._colliderGroup.visible = false;
        this._lightMarkerGroup = new THREE.Group();
        this._lightMarkerGroup.name = '__EditorLightMarkers';
        this._markerGroup = new THREE.Group();
        this._markerGroup.name = '__EditorGameplayMarkers';
        this._editorHelpersGroup.add(this._colliderGroup, this._lightMarkerGroup, this._markerGroup);

        this._selectionOutline = new THREE.Box3Helper(new THREE.Box3(), 0xfacc15);
        this._selectionOutline.visible = false;
        this._selectionOutline.renderOrder = 950;
        this.scene.add(this._selectionOutline);
        this._multiOutlines = [];

        this._groupPivot = new THREE.Group();
        this._groupPivot.name = '__EditorGroupPivot';
        this.scene.add(this._groupPivot);

        this.canvas = document.getElementById('editorCanvas');
        this.gizmo = new TransformGizmo(this.scene, this.perspectiveCam, this.canvas);

        this.camMode = 'fly';
        this.toolMode = 'translate';
        this.groupMode = false;
        this.worklightOn = true;
        this.vhsOn = false;
        this.noCeiling = false;
        this._savedNoCeilingBeforeTop = false;
        this.showColliders = false;
        this.showLightMarkers = true;
        this.showGameplayMarkers = true;
        this.tableSetPreview = false;
        this.openDoorsPreview = false;
        this.act4Preview = false;
        this._savedIntactPoses = null;
        this._previewRevealedObjs = new Set();

        this.selected = null;
        this.selectedObjects = [];
        this._lastListClickIdx = -1;
        this.hideSubTarget = 'hide';
        this._groupDragState = null;
        this._marquee = {
            active: false,
            additive: false,
            startX: 0,
            startY: 0,
            el: document.getElementById('marquee-box')
        };

        this.undoStack = [];
        this.redoStack = [];
        this._maxHistory = 60;
        this._beforeDragSnapshot = null;

        this._raycaster = new THREE.Raycaster();
        this._flyCamState = {
            yaw: -0.7,
            pitch: -0.45,
            isLooking: false,
            isPanning: false,
            pointerDownPos: new THREE.Vector2(),
            pointerMoved: false,
            keys: new Set(),
            speed: 6.5
        };
        this._walkState = {
            pos: this.world.playerSpawn.position.clone(),
            yaw: this.world.playerSpawn.yaw,
            pitch: this.world.playerSpawn.pitch,
            velY: 0,
            grounded: true,
            locked: false
        };

        this.serverAvailable = false;
        this._toastTimer = null;
        this._markerPickMeshes = [];
        this._lightPickMeshes = [];

        this._setupRendererCrisp();
        this._populateMaterialDropdown();
        this._rebuildHelperVisuals();
        this._bindUI();
        this._bindViewportEvents();
        this._bindKeyboard();
        this._setFlyPose(new THREE.Vector3(-4.5, 4.2, 6.2), -0.65, -0.42);
        this._refreshHierarchy();
        this._updateInspector();
        this._updateStatusCounts();
        this._checkServerStatus();

        this.engine.start();

        let prevTime = performance.now();
        const editorTick = (now) => {
            const dt = (now - prevTime) / 1000;
            prevTime = now;
            this._onUpdate(dt);
            requestAnimationFrame(editorTick);
        };
        requestAnimationFrame(editorTick);
    }

    _setupRendererCrisp() {
        const container = document.getElementById('canvas-container');
        const applySize = () => {
            const w = Math.max(320, container.clientWidth);
            const h = Math.max(240, container.clientHeight);
            this.perspectiveCam.aspect = w / h;
            this.perspectiveCam.updateProjectionMatrix();

            const halfH = 7.5 / this.orthoZoom;
            const halfW = halfH * (w / h);
            this.orthoCam.left = -halfW;
            this.orthoCam.right = halfW;
            this.orthoCam.top = halfH;
            this.orthoCam.bottom = -halfH;
            this.orthoCam.updateProjectionMatrix();

            if (!this.vhsOn) {
                this.engine.renderer.renderer.setSize(w, h, false);
            } else {
                this.engine.renderer.renderer.setSize(640, 480, false);
            }
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
        };
        this._applyViewportSize = applySize;
        const ro = new ResizeObserver(applySize);
        ro.observe(container);
        applySize();
    }

    _createWorkLights() {
        const g = new THREE.Group();
        g.name = '__EditorWorkLights';
        const hemi = new THREE.HemisphereLight(0xf1f5f9, 0x475569, 1.35);
        const dir = new THREE.DirectionalLight(0xffffff, 0.75);
        dir.position.set(8, 16, 10);
        g.add(hemi, dir);
        this.scene.add(g);
        return g;
    }

    _createGridAndAxes() {
        const g = new THREE.Group();
        g.name = '__EditorGridGroup';
        const grid = new THREE.GridHelper(40, 40, 0x3b485e, 0x1e2530);
        grid.position.y = -0.008;
        const axes = new THREE.AxesHelper(1.2);
        axes.position.set(0, 0.01, 0);
        g.add(grid, axes);
        this.scene.add(g);
        return g;
    }

    _populateMaterialDropdown() {
        const sel = document.getElementById('mat-key');
        sel.innerHTML = '';
        const allKeys = new Set([...Object.keys(this.builder.materials), ...Object.keys(MATERIAL_LABELS)]);
        for (const key of allKeys) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = MATERIAL_LABELS[key] || key;
            sel.appendChild(opt);
        }
    }

    _showToast(msg, type = 'ok') {
        const el = document.getElementById('editor-toast');
        el.textContent = msg;
        el.className = 'show' + (type === 'warn' ? ' warn' : type === 'error' ? ' error' : '');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.className = '';
        }, 2800);
    }

    async _checkServerStatus() {
        const el = document.getElementById('status-server');
        try {
            const res = await fetch('/api/ping', { cache: 'no-store' });
            if (res.ok) {
                this.serverAvailable = true;
                el.textContent = 'Сервер: подключён (сохранение в проект доступно)';
                el.className = 'status-ok';
                return;
            }
        } catch (_) {}
        this.serverAvailable = false;
        el.textContent = 'Локальный режим (localStorage + экспорт файла)';
        el.className = 'status-local';
    }

    _cloneOverrides() {
        return normalizeMapOverrides(this.overrides);
    }

    _pushUndo(snapshotBefore = null) {
        const snap = snapshotBefore || this._cloneOverrides();
        this.undoStack.push(snap);
        if (this.undoStack.length > this._maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack.length = 0;
        this._updateUndoRedoButtons();
    }

    _updateUndoRedoButtons() {
        document.getElementById('btn-undo').disabled = this.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = this.redoStack.length === 0;
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(this._cloneOverrides());
        const prev = this.undoStack.pop();
        this._restoreOverridesState(prev);
        this._updateUndoRedoButtons();
        this._showToast('Действие отменено');
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(this._cloneOverrides());
        const next = this.redoStack.pop();
        this._restoreOverridesState(next);
        this._updateUndoRedoButtons();
        this._showToast('Действие возвращено');
    }

    _removeAddedEntityFromRuntime(obj) {
        const go = obj.userData.gameObject;
        const meshes = [];
        obj.traverse(c => { if (c.isMesh) meshes.push(c); });
        this.builder.blockerMeshes = this.builder.blockerMeshes.filter(m => !meshes.includes(m));
        if (go) {
            const rb = go.getComponent(RigidBody);
            if (rb) this.engine.physicsEngine.removeRigidBody(rb);
            this.engine.removeGameObject(go);
        } else {
            this.scene.remove(obj);
        }
        this.builder._editableByName.delete(obj.name);
        const idx = this.builder.editableObjects.indexOf(obj);
        if (idx >= 0) this.builder.editableObjects.splice(idx, 1);
    }

    _removeAddedLightFromRuntime(light) {
        this.scene.remove(light);
        this.builder._lightByKey.delete(light.userData.lightKey);
        const idx = this.builder.editableLights.indexOf(light);
        if (idx >= 0) this.builder.editableLights.splice(idx, 1);
    }

    _isSinglePrimitiveEditable(obj) {
        return !!(obj?.userData && (obj.userData.isStaticBox || obj.userData.isSinglePrimitive) && obj.userData.primaryMesh);
    }

    _syncPreviewRevealForSelection() {
        this._previewRevealedObjs.clear();
        for (const obj of this.selectedObjects) {
            if (!obj || obj.userData.deleted) continue;
            const logicalVis = obj.userData.logicalVisible !== undefined ? obj.userData.logicalVisible : obj.visible;
            if (!logicalVis || obj.userData.defaultHidden || obj.userData.activatedGroup) {
                this._previewRevealedObjs.add(obj);
                if (obj.userData.parentActivatedObj && !obj.userData.parentActivatedObj.userData?.deleted) {
                    this._previewRevealedObjs.add(obj.userData.parentActivatedObj);
                }
                if (obj.userData.activatedGroup === 'act4') {
                    const wt = this.builder._editableByName.get('WreckedTable');
                    if (wt && !wt.userData.deleted) this._previewRevealedObjs.add(wt);
                } else if (obj.userData.activatedGroup === 'table') {
                    for (const tName of ['FoldingTable', 'TableWingL', 'TableWingR', 'Tablecloth']) {
                        const tObj = this.builder._editableByName.get(tName);
                        if (tObj && !tObj.userData.deleted) this._previewRevealedObjs.add(tObj);
                    }
                }
            }
        }
    }

    _captureIntactPosesForAct4() {
        const fdObj = this.world.frontDoor?.go?.transform || this.builder._editableByName.get('FrontDoor');
        const trObj = this.world.treeGO?.transform || this.builder._editableByName.get('ChristmasTree');
        this._savedIntactPoses = {
            frontDoor: fdObj ? { position: fdObj.position.clone(), rotation: fdObj.rotation.clone() } : null,
            tree: trObj ? { position: trObj.position.clone(), rotation: trObj.rotation.clone() } : null
        };
    }

    setTableSetPreview(on) {
        const next = !!on;
        if (next && this.act4Preview) {
            this.act4Preview = false;
            document.getElementById('toggle-act4')?.classList.remove('active');
        }
        this.tableSetPreview = next;
        document.getElementById('toggle-table-set')?.classList.toggle('active', next);
        this._applyPreviewStates();
        this._attachGizmoToSelection();
        this._updateSelectionOutline();
        this._updateInspector();
        this._showToast(next ? 'Превью: стол установлен в зале и накрыт (Act I)' : 'Превью: стол на балконе (Старт)');
    }

    setOpenDoorsPreview(on) {
        const next = !!on;
        this.openDoorsPreview = next;
        document.getElementById('toggle-open-doors')?.classList.toggle('active', next);
        this._applyPreviewStates();
        this._attachGizmoToSelection();
        this._updateSelectionOutline();
        this._updateInspector();
        this._showToast(next ? 'Дверцы (холодильник/плита/прятки) открыты' : 'Дверцы закрыты');
    }

    setAct4Preview(on) {
        const next = !!on;
        if (next && !this.act4Preview) {
            this._captureIntactPosesForAct4();
            if (this.tableSetPreview) {
                this.tableSetPreview = false;
                document.getElementById('toggle-table-set')?.classList.remove('active');
            }
        }
        this.act4Preview = next;
        document.getElementById('toggle-act4')?.classList.toggle('active', next);
        this._applyPreviewStates();
        this._attachGizmoToSelection();
        this._updateSelectionOutline();
        this._updateInspector();
        this._showToast(next ? 'Превью: Акт IV (погром, упавшая дверь и ёлка)' : 'Превью Акт IV выключено');
    }

    _applyPreviewStates() {
        this.world.fridge?.setOpen?.(this.openDoorsPreview, false, true);
        this.world.stove?.setOpen?.(this.openDoorsPreview, false, true);
        for (const spot of (this.world.hidingSpots || [])) {
            spot.setDoorClosed?.(!this.openDoorsPreview, true);
        }

        for (const obj of this.builder.editableObjects) {
            const logicalVis = obj.userData.logicalVisible !== undefined ? obj.userData.logicalVisible : true;
            obj.visible = obj.userData.deleted ? false : logicalVis;
        }

        if (!this.act4Preview) {
            if (this.tableSetPreview) {
                this.world.table?.unfold?.();
            } else {
                this.world.table?.placeOnBalcony?.();
            }
            for (const obj of this.builder.editableObjects) {
                if (obj.userData.deleted) {
                    obj.visible = false;
                } else if (this.tableSetPreview && (obj.userData.activatedGroup === 'decor' || obj.userData.activatedGroup === 'table')) {
                    if (obj.name !== 'TablePlacementZone' && obj.name !== 'StoolPlacementZone') {
                        obj.visible = true;
                    }
                } else if (!this.tableSetPreview && obj.userData.activatedGroup === 'table' && obj.userData.logicalVisible === true) {
                    obj.visible = true;
                }
            }
        }

        const fdObj = this.world.frontDoor?.go?.transform || this.builder._editableByName.get('FrontDoor');
        const trObj = this.world.treeGO?.transform || this.builder._editableByName.get('ChristmasTree');
        if (this.act4Preview) {
            const dp = this.world.destroyedPoses;
            if (fdObj && dp?.frontDoor) {
                fdObj.position.copy(dp.frontDoor.position);
                fdObj.rotation.copy(dp.frontDoor.rotation);
            }
            if (trObj && dp?.tree) {
                trObj.position.copy(dp.tree.position);
                trObj.rotation.copy(dp.tree.rotation);
            }
            const folding = this.builder._editableByName.get('FoldingTable');
            if (folding) folding.visible = false;
            for (const obj of this.builder.editableObjects) {
                if (obj.userData.deleted) {
                    obj.visible = false;
                } else if (obj.userData.activatedGroup === 'act4') {
                    obj.visible = true;
                }
            }
        } else if (this._savedIntactPoses) {
            if (fdObj && this._savedIntactPoses.frontDoor) {
                fdObj.position.copy(this._savedIntactPoses.frontDoor.position);
                fdObj.rotation.copy(this._savedIntactPoses.frontDoor.rotation);
            }
            if (trObj && this._savedIntactPoses.tree) {
                trObj.position.copy(this._savedIntactPoses.tree.position);
                trObj.rotation.copy(this._savedIntactPoses.tree.rotation);
            }
            this._savedIntactPoses = null;
        }

        for (const obj of this._previewRevealedObjs) {
            if (obj && !obj.userData?.deleted) {
                obj.visible = true;
            }
        }

        for (const obj of this.builder.editableObjects) {
            if (obj.userData.deleted) obj.visible = false;
        }
        this._applyNoCeilingVisibility();
    }

    _restoreBuiltInObjectToInitial(obj) {
        const init = obj.userData.initialTransform;
        if (init) {
            obj.position.set(init.position[0], init.position[1], init.position[2]);
            obj.rotation.set(init.rotation[0], init.rotation[1], init.rotation[2]);
            obj.scale.set(init.scale[0], init.scale[1], init.scale[2]);
            obj.visible = init.visible !== false;
            obj.userData.logicalVisible = init.visible !== false;
        } else {
            obj.userData.logicalVisible = true;
        }
        obj.userData.deleted = false;
        obj.userData.materialPatch = null;
        if (obj.userData.initialMaterialKey !== undefined) {
            obj.userData.materialKey = obj.userData.initialMaterialKey;
        }
        if (obj.userData.setOpenAngle && obj.userData.initialOpenAngle !== undefined) {
            obj.userData.setOpenAngle(obj.userData.initialOpenAngle);
        }
        if (obj.userData.setBaseYaw) {
            const openOff = obj.userData.doorOpenOffset || 0;
            obj.userData.setBaseYaw(obj.rotation.y - openOff);
        }
        if (obj.userData.doorCfg && init) {
            obj.userData.doorCfg.pivotPos.set(init.position[0], init.position[1], init.position[2]);
        }
        if (obj.name === 'ShowerCurtain' && init) {
            const bathSpot = this.world.hidingSpots.find(s => s.id === 'bathroom');
            if (bathSpot?.setCurtainClosedZ) bathSpot.setCurtainClosedZ(init.position[2] + 0.58);
        }
        if (this._isSinglePrimitiveEditable(obj) && obj.userData.initialBoxSize) {
            const [w, h, d] = obj.userData.initialBoxSize;
            const shape = obj.userData.shape || 'box';
            const rSegs = obj.userData.radialSegs || 10;
            obj.userData.primaryMesh.geometry.dispose();
            obj.userData.primaryMesh.geometry = this.builder._buildPrimitiveGeometry(shape, w, h, d, rSegs);
            obj.userData.boxSize = [w, h, d];
        }
        const origMat = this._initialMaterials.get(obj.name);
        if (origMat) {
            if (obj.userData.primaryMesh) obj.userData.primaryMesh.material = origMat;
            else if (obj.isMesh) obj.material = origMat;
            else obj.traverse(c => { if (c.isMesh) c.material = origMat; });
        }
        const go = obj.userData.gameObject;
        if (go) {
            const col = go.getComponent(BoxCollider);
            if (col) {
                col.enabled = obj.userData.initialCollide !== false;
                if (obj.userData.initialBoxSize && col.userDataCustomSize) {
                    const [w, h, d] = obj.userData.initialBoxSize;
                    col.setSize(new THREE.Vector3(w, h, d));
                    col.offset.set(0, 0, 0);
                    col.userDataCustomSize = false;
                }
            }
            const inter = go.getComponent(Interactable);
            if (inter) inter.enabled = true;
            const gz = go.getComponent(GazeTrigger);
            if (gz) gz.enabled = true;
        }
        if (obj.userData.initialBlocker !== undefined) {
            obj.userData.blocker = obj.userData.initialBlocker;
            const meshes = [];
            obj.traverse(c => { if (c.isMesh) meshes.push(c); });
            if (obj.userData.initialBlocker) {
                const targets = obj.userData.primaryMesh ? [obj.userData.primaryMesh] : meshes;
                for (const m of targets) {
                    if (!this.builder.blockerMeshes.includes(m)) this.builder.blockerMeshes.push(m);
                }
            } else {
                this.builder.blockerMeshes = this.builder.blockerMeshes.filter(m => !meshes.includes(m));
            }
        }
        if (obj.userData.initialCollide !== undefined) {
            obj.userData.collide = obj.userData.initialCollide;
        }
    }

    _restoreBuiltInLightToInitial(light) {
        const init = light.userData.initialLight;
        if (!init) return;
        light.position.set(init.position[0], init.position[1], init.position[2]);
        light.color.setHex(init.color);
        light.intensity = init.intensity;
        if ('distance' in light) light.distance = init.distance;
        if ('decay' in light) light.decay = init.decay;
        light.visible = init.visible !== false;
        light.userData.deleted = false;
    }

    _restoreOverridesState(targetOverrides) {
        const normalized = normalizeMapOverrides(targetOverrides);
        this.overrides = normalized;

        for (const obj of [...this.builder.editableObjects]) {
            if (obj.userData.isAdded) this._removeAddedEntityFromRuntime(obj);
            else this._restoreBuiltInObjectToInitial(obj);
        }
        for (const l of [...this.builder.editableLights]) {
            if (l.userData.isAddedLight) this._removeAddedLightFromRuntime(l);
            else this._restoreBuiltInLightToInitial(l);
        }

        const wasAct4 = this.act4Preview;
        if (wasAct4) {
            this.act4Preview = false;
            this._savedIntactPoses = null;
        }

        this.world.playerSpawn.position.set(...FACTORY_GAMEPLAY.playerSpawn.position);
        this.world.playerSpawn.yaw = FACTORY_GAMEPLAY.playerSpawn.yaw;
        this.world.playerSpawn.pitch = FACTORY_GAMEPLAY.playerSpawn.pitch;
        for (const spot of this.world.hidingSpots) {
            const def = FACTORY_GAMEPLAY.hidingSpots[spot.id];
            if (!def) continue;
            spot.hidePos.set(...def.hidePos);
            spot.peekPos.set(...def.peekPos);
            spot.lookYaw = def.lookYaw;
        }
        this.world.destroyedPoses = {
            frontDoor: {
                position: new THREE.Vector3(...FACTORY_GAMEPLAY.destroyedPoses.frontDoor.position),
                rotation: new THREE.Euler(...FACTORY_GAMEPLAY.destroyedPoses.frontDoor.rotation)
            },
            tree: {
                position: new THREE.Vector3(...FACTORY_GAMEPLAY.destroyedPoses.tree.position),
                rotation: new THREE.Euler(...FACTORY_GAMEPLAY.destroyedPoses.tree.rotation)
            }
        };
        if (this.world.table) {
            this.world.table.balconyPos.set(...FACTORY_GAMEPLAY.tablePoses.balcony.position);
            this.world.table.balconyRot.set(...FACTORY_GAMEPLAY.tablePoses.balcony.rotation);
            this.world.table.hallPos.set(...FACTORY_GAMEPLAY.tablePoses.hall.position);
            this.world.table.hallRot.set(...FACTORY_GAMEPLAY.tablePoses.hall.rotation);
        }
        this.world.patrolWaypoints = FACTORY_GAMEPLAY.patrolWaypoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));

        this.builder.applyMapOverrides(normalized);
        for (const obj of this.builder.editableObjects) {
            obj.userData.logicalVisible = obj.visible;
        }

        if (this.selectedObjects.length > 0) {
            const kept = [];
            for (const prev of this.selectedObjects) {
                const re = this.builder._editableByName.get(prev.name);
                if (re && !re.userData.deleted) kept.push(re);
            }
            this.selectedObjects = kept;
            if (kept.length === 1) this.selected = { kind: 'object', obj: kept[0] };
            else if (kept.length > 1) this.selected = { kind: 'multi', objs: kept };
            else this.selected = null;
        } else if (this.selected) {
            if (this.selected.kind === 'object') {
                const re = this.builder._editableByName.get(this.selected.obj.name);
                if (re && !re.userData.deleted) {
                    this.selected.obj = re;
                    this.selectedObjects = [re];
                } else {
                    this.selected = null;
                }
            } else if (this.selected.kind === 'light') {
                const rl = this.builder._lightByKey.get(this.selected.light.userData.lightKey);
                if (rl && !rl.userData.deleted) this.selected.light = rl;
                else this.selected = null;
            } else if (this.selected.kind === 'waypoint') {
                if (this.selected.index >= this.world.patrolWaypoints.length) {
                    this.selected = null;
                }
            }
        }

        if (wasAct4) {
            this._captureIntactPosesForAct4();
            this.act4Preview = true;
        }
        this._syncPreviewRevealForSelection();
        this._applyPreviewStates();

        this._attachGizmoToSelection();
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateInspector();
        this._updateStatusCounts();
        saveOverridesToLocalStorage(this.overrides);
    }

    _syncObjectToOverrides(obj) {
        if (!obj || !obj.userData) return;
        const name = obj.name;

        if (this.act4Preview && (name === 'FrontDoor' || name === 'ChristmasTree') && !obj.userData.deleted) {
            if (name === 'FrontDoor' && this.world.destroyedPoses?.frontDoor) {
                this.world.destroyedPoses.frontDoor.position.copy(obj.position);
                this.world.destroyedPoses.frontDoor.rotation.copy(obj.rotation);
            } else if (name === 'ChristmasTree' && this.world.destroyedPoses?.tree) {
                this.world.destroyedPoses.tree.position.copy(obj.position);
                this.world.destroyedPoses.tree.rotation.copy(obj.rotation);
            }
            this._syncGameplayToOverrides();
            return;
        }

        if (name === 'FoldingTable' && !obj.userData.deleted && this.world.table) {
            if (this.tableSetPreview) {
                this.world.table.hallPos.copy(obj.position);
                this.world.table.hallRot.copy(obj.rotation);
                this._syncGameplayToOverrides();
                return;
            } else {
                this.world.table.balconyPos.copy(obj.position);
                this.world.table.balconyRot.copy(obj.rotation);
                this._syncGameplayToOverrides();
            }
        }

        const logicalVis = obj.userData.logicalVisible !== undefined ? obj.userData.logicalVisible : obj.visible;

        if (obj.userData.isAdded && obj.userData.customConfig) {
            const cfg = obj.userData.customConfig;
            cfg.position = vecArr(obj.position);
            cfg.rotation = eulerArr(obj.rotation);
            cfg.scale = vecArr(obj.scale);
            cfg.visible = logicalVis;
            cfg.collide = obj.userData.collide !== false;
            cfg.blocker = obj.userData.blocker !== false;
            cfg.castShadow = !!obj.userData.castShadow;
            cfg.receiveShadow = obj.userData.receiveShadow !== false;
            if (obj.userData.boxSize) cfg.boxSize = obj.userData.boxSize.map(round3);
            if (obj.userData.materialKey) cfg.materialKey = obj.userData.materialKey;
            if (obj.userData.materialPatch) {
                const mp = obj.userData.materialPatch;
                for (const k of ['color', 'emissive', 'roughness', 'metalness', 'opacity', 'repeatX', 'repeatY']) {
                    if (mp[k] !== undefined) cfg[k] = mp[k];
                    else delete cfg[k];
                }
            }
            const go = obj.userData.gameObject;
            const col = go?.getComponent(BoxCollider);
            if (col && col.userDataCustomSize) {
                cfg.colliderSize = vecArr(col.size);
                cfg.colliderOffset = vecArr(col.offset);
            }
            const idx = this.overrides.addedObjects.findIndex(c => c.name === name);
            if (idx >= 0) this.overrides.addedObjects[idx] = JSON.parse(JSON.stringify(cfg));
            saveOverridesToLocalStorage(this.overrides);
            return;
        }

        if (obj.userData.deleted) {
            this.overrides.modifiedObjects[name] = { deleted: true };
            saveOverridesToLocalStorage(this.overrides);
            return;
        }

        const patch = {};
        const init = obj.userData.initialTransform;
        const p = vecArr(obj.position);
        const r = eulerArr(obj.rotation);
        const s = vecArr(obj.scale);

        if (!init || !arrApproxEq(p, init.position)) patch.position = p;
        if (!init || !arrApproxEq(r, init.rotation)) patch.rotation = r;
        if (!init || !arrApproxEq(s, init.scale)) patch.scale = s;
        if (init && logicalVis !== init.visible) patch.visible = logicalVis;

        if (this._isSinglePrimitiveEditable(obj) && obj.userData.boxSize && obj.userData.initialBoxSize) {
            const bs = obj.userData.boxSize.map(round3);
            if (!arrApproxEq(bs, obj.userData.initialBoxSize)) patch.boxSize = bs;
        }
        if (obj.userData.collide !== undefined && obj.userData.initialCollide !== undefined && obj.userData.collide !== obj.userData.initialCollide) {
            patch.collide = obj.userData.collide;
        }
        if (obj.userData.blocker !== undefined && obj.userData.initialBlocker !== undefined && obj.userData.blocker !== obj.userData.initialBlocker) {
            patch.blocker = obj.userData.blocker;
        }
        if (obj.userData.castShadow !== undefined && this.overrides.modifiedObjects[name]?.castShadow !== undefined) {
            patch.castShadow = obj.userData.castShadow;
        } else if (obj.userData.castShadow !== obj.userData.initialTransform?.castShadow && obj.userData.castShadow !== undefined) {
            const prev = this.overrides.modifiedObjects[name];
            if (prev && prev.castShadow !== undefined) patch.castShadow = obj.userData.castShadow;
        }
        if (obj.userData._castShadowEdited) patch.castShadow = !!obj.userData.castShadow;
        if (obj.userData._receiveShadowEdited) patch.receiveShadow = !!obj.userData.receiveShadow;

        const go = obj.userData.gameObject;
        const col = go?.getComponent(BoxCollider);
        if (col && col.userDataCustomSize) {
            patch.colliderSize = vecArr(col.size);
            patch.colliderOffset = vecArr(col.offset);
        }

        if (obj.userData.materialPatch) {
            const mp = obj.userData.materialPatch;
            if (mp.materialKey && mp.materialKey !== obj.userData.initialMaterialKey) {
                patch.materialKey = mp.materialKey;
            }
            for (const k of ['color', 'emissive', 'roughness', 'metalness', 'opacity', 'repeatX', 'repeatY']) {
                if (mp[k] !== undefined) patch[k] = mp[k];
            }
        }

        if (Object.keys(patch).length > 0) {
            this.overrides.modifiedObjects[name] = patch;
        } else {
            delete this.overrides.modifiedObjects[name];
        }
        saveOverridesToLocalStorage(this.overrides);
    }

    _syncLightToOverrides(light) {
        if (!light || !light.userData) return;
        const key = light.userData.lightKey;

        if (light.userData.isAddedLight) {
            const idx = this.overrides.addedLights.findIndex(c => c.name === key);
            if (idx >= 0) {
                const cfg = this.overrides.addedLights[idx];
                cfg.position = vecArr(light.position);
                cfg.color = light.color.getHex();
                cfg.intensity = round3(light.intensity);
                cfg.distance = round3(light.distance);
                cfg.decay = round3(light.decay);
                cfg.visible = light.visible;
            }
            saveOverridesToLocalStorage(this.overrides);
            return;
        }

        if (light.userData.deleted) {
            this.overrides.modifiedLights[key] = { deleted: true };
            saveOverridesToLocalStorage(this.overrides);
            return;
        }

        const init = light.userData.initialLight;
        const patch = {};
        const p = vecArr(light.position);
        if (!init || !arrApproxEq(p, init.position)) patch.position = p;
        if (!init || light.color.getHex() !== init.color) patch.color = light.color.getHex();
        if (!init || Math.abs(light.intensity - init.intensity) > 0.001) patch.intensity = round3(light.intensity);
        if (!init || ('distance' in light && Math.abs(light.distance - init.distance) > 0.001)) patch.distance = round3(light.distance);
        if (!init || ('decay' in light && Math.abs(light.decay - init.decay) > 0.001)) patch.decay = round3(light.decay);
        if (!init || light.visible !== init.visible) patch.visible = light.visible;

        if (Object.keys(patch).length > 0) this.overrides.modifiedLights[key] = patch;
        else delete this.overrides.modifiedLights[key];
        saveOverridesToLocalStorage(this.overrides);
    }

    _syncGameplayToOverrides() {
        const gp = {};
        const sp = vecArr(this.world.playerSpawn.position);
        if (!arrApproxEq(sp, FACTORY_GAMEPLAY.playerSpawn.position) ||
            Math.abs(this.world.playerSpawn.yaw - FACTORY_GAMEPLAY.playerSpawn.yaw) > 0.001 ||
            Math.abs(this.world.playerSpawn.pitch - FACTORY_GAMEPLAY.playerSpawn.pitch) > 0.001) {
            gp.playerSpawn = {
                position: sp,
                yaw: round3(this.world.playerSpawn.yaw),
                pitch: round3(this.world.playerSpawn.pitch)
            };
        }

        const hidingOut = {};
        for (const spot of this.world.hidingSpots) {
            const def = FACTORY_GAMEPLAY.hidingSpots[spot.id];
            const hArr = vecArr(spot.hidePos);
            const pArr = vecArr(spot.peekPos);
            if (!def || !arrApproxEq(hArr, def.hidePos) || !arrApproxEq(pArr, def.peekPos) || Math.abs(spot.lookYaw - def.lookYaw) > 0.001) {
                hidingOut[spot.id] = { hidePos: hArr, peekPos: pArr, lookYaw: round3(spot.lookYaw) };
            }
        }
        if (Object.keys(hidingOut).length > 0) gp.hidingSpots = hidingOut;

        const wps = this.world.patrolWaypoints.map(vecArr);
        let wpDiff = wps.length !== FACTORY_GAMEPLAY.patrolWaypoints.length;
        if (!wpDiff) {
            for (let i = 0; i < wps.length; i++) {
                if (!arrApproxEq(wps[i], FACTORY_GAMEPLAY.patrolWaypoints[i])) {
                    wpDiff = true;
                    break;
                }
            }
        }
        if (wpDiff) gp.patrolWaypoints = wps;

        if (this.world.destroyedPoses) {
            const dpOut = {};
            for (const key of ['frontDoor', 'tree']) {
                const cur = this.world.destroyedPoses[key];
                const def = FACTORY_GAMEPLAY.destroyedPoses[key];
                if (!cur || !def) continue;
                const p = vecArr(cur.position);
                const r = eulerArr(cur.rotation);
                if (!arrApproxEq(p, def.position) || !arrApproxEq(r, def.rotation)) {
                    dpOut[key] = { position: p, rotation: r };
                }
            }
            if (Object.keys(dpOut).length > 0) gp.destroyedPoses = dpOut;
        }

        if (this.world.table) {
            const tpOut = {};
            const bPos = vecArr(this.world.table.balconyPos);
            const bRot = eulerArr(this.world.table.balconyRot);
            const bDef = FACTORY_GAMEPLAY.tablePoses.balcony;
            if (!arrApproxEq(bPos, bDef.position) || !arrApproxEq(bRot, bDef.rotation)) {
                tpOut.balcony = { position: bPos, rotation: bRot };
            }
            const hPos = vecArr(this.world.table.hallPos);
            const hRot = eulerArr(this.world.table.hallRot);
            const hDef = FACTORY_GAMEPLAY.tablePoses.hall;
            if (!arrApproxEq(hPos, hDef.position) || !arrApproxEq(hRot, hDef.rotation)) {
                tpOut.hall = { position: hPos, rotation: hRot };
            }
            if (Object.keys(tpOut).length > 0) gp.tablePoses = tpOut;
        }

        const doorAnglesOut = {};
        for (const obj of this.builder.editableObjects) {
            if (obj.userData?.getOpenAngle && obj.userData?.initialOpenAngle !== undefined) {
                const curA = round3(obj.userData.getOpenAngle());
                const initA = round3(obj.userData.initialOpenAngle);
                if (Math.abs(curA - initA) > 0.001) {
                    doorAnglesOut[obj.name] = curA;
                }
            }
        }
        if (Object.keys(doorAnglesOut).length > 0) gp.doorOpenAngles = doorAnglesOut;

        this.overrides.gameplay = gp;
        saveOverridesToLocalStorage(this.overrides);
    }

    _rebuildHelperVisuals() {
        this._rebuildColliderHelpers();
        this._rebuildLightMarkers();
        this._rebuildGameplayMarkers();
        this._updateSelectionOutline();
    }

    _rebuildColliderHelpers() {
        while (this._colliderGroup.children.length > 0) {
            const c = this._colliderGroup.children[0];
            this._colliderGroup.remove(c);
            c.geometry?.dispose();
            c.material?.dispose();
        }
        if (!this.showColliders) return;

        for (const rb of this.engine.physicsEngine.rigidBodies) {
            const col = rb.collider;
            if (!col || !col.enabled) continue;
            const box = col.getBox(rb.transform.position);
            const helper = new THREE.Box3Helper(box, rb.bodyType === 'dynamic' ? 0x38bdf8 : 0x22c55e);
            this._colliderGroup.add(helper);
        }
    }

    _rebuildLightMarkers() {
        while (this._lightMarkerGroup.children.length > 0) {
            const c = this._lightMarkerGroup.children[0];
            this._lightMarkerGroup.remove(c);
        }
        this._lightPickMeshes = [];

        const bulbGeo = new THREE.SphereGeometry(0.14, 10, 8);
        const ringGeo = new THREE.RingGeometry(0.19, 0.23, 16);

        for (const light of this.builder.editableLights) {
            if (light.userData.deleted) continue;
            const colHex = light.color ? light.color.getHex() : 0xffffff;
            const mat = new THREE.MeshBasicMaterial({
                color: light.visible ? colHex : 0x555555,
                depthTest: true,
                fog: false
            });
            const sphere = new THREE.Mesh(bulbGeo, mat);
            sphere.position.copy(light.position);
            sphere.userData.editorSelection = { kind: 'light', light };

            const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                color: 0xfde047,
                side: THREE.DoubleSide,
                depthTest: false,
                transparent: true,
                opacity: 0.7,
                fog: false
            }));
            halo.rotation.x = Math.PI / 2;
            sphere.add(halo);

            this._lightMarkerGroup.add(sphere);
            this._lightPickMeshes.push(sphere);
        }
        this._lightMarkerGroup.visible = this.showLightMarkers;
    }

    _rebuildGameplayMarkers() {
        while (this._markerGroup.children.length > 0) {
            const c = this._markerGroup.children[0];
            this._markerGroup.remove(c);
        }
        this._markerPickMeshes = [];

        const sp = this.world.playerSpawn;
        const spawnGroup = new THREE.Group();
        spawnGroup.position.copy(sp.position);
        spawnGroup.rotation.y = sp.yaw;

        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.75, depthTest: false, fog: false });
        const spawnBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 12), bodyMat);
        spawnBody.position.y = 0.75;
        spawnBody.renderOrder = 800;
        spawnBody.userData.editorSelection = { kind: 'spawn' };

        const dirArrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 8), new THREE.MeshBasicMaterial({ color: 0x67e8f9, depthTest: false, fog: false }));
        dirArrow.rotation.x = -Math.PI / 2;
        dirArrow.position.set(0, 1.4, -0.35);
        dirArrow.renderOrder = 801;
        dirArrow.userData.editorSelection = { kind: 'spawn' };

        spawnGroup.add(spawnBody, dirArrow);
        this._spawnMarkerObj = spawnGroup;
        this._markerGroup.add(spawnGroup);
        this._markerPickMeshes.push(spawnBody, dirArrow);

        this._hidingMarkerPairs = new Map();
        const hsGeo = new THREE.SphereGeometry(0.16, 10, 8);
        for (const spot of this.world.hidingSpots) {
            const hideMesh = new THREE.Mesh(hsGeo, new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, fog: false }));
            hideMesh.position.copy(spot.hidePos).add(new THREE.Vector3(0, 0.35, 0));
            hideMesh.renderOrder = 800;
            hideMesh.userData.editorSelection = { kind: 'hiding', spot, subTarget: 'hide' };

            const peekMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfde047, depthTest: false, fog: false }));
            peekMesh.position.copy(spot.peekPos).add(new THREE.Vector3(0, 0.35, 0));
            peekMesh.renderOrder = 800;
            peekMesh.userData.editorSelection = { kind: 'hiding', spot, subTarget: 'peek' };

            const lineGeo = new THREE.BufferGeometry().setFromPoints([hideMesh.position, peekMesh.position]);
            const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false, fog: false }));
            line.renderOrder = 799;

            this._markerGroup.add(hideMesh, peekMesh, line);
            this._markerPickMeshes.push(hideMesh, peekMesh);
            this._hidingMarkerPairs.set(spot.id, { hideMesh, peekMesh, line });
        }

        this._waypointMeshes = [];
        const wpGeo = new THREE.SphereGeometry(0.17, 10, 8);
        const wpPoints = [];
        this.world.patrolWaypoints.forEach((wp, index) => {
            const mesh = new THREE.Mesh(wpGeo, new THREE.MeshBasicMaterial({ color: 0xe879f9, depthTest: false, fog: false }));
            mesh.position.copy(wp).add(new THREE.Vector3(0, 0.25, 0));
            mesh.renderOrder = 800;
            mesh.userData.editorSelection = { kind: 'waypoint', index };
            this._markerGroup.add(mesh);
            this._markerPickMeshes.push(mesh);
            this._waypointMeshes.push(mesh);
            wpPoints.push(mesh.position.clone());
        });

        if (wpPoints.length >= 2) {
            const pathGeo = new THREE.BufferGeometry().setFromPoints(wpPoints);
            this._waypointLine = new THREE.LineLoop(pathGeo, new THREE.LineBasicMaterial({ color: 0xc026d3, depthTest: false, fog: false }));
            this._waypointLine.renderOrder = 799;
            this._markerGroup.add(this._waypointLine);
        } else {
            this._waypointLine = null;
        }

        this._markerGroup.visible = this.showGameplayMarkers;
    }

    _getActiveTransformObjects() {
        if (!this.selected) return [];
        if (this.selected.kind === 'multi') {
            return (this.selected.objs || []).filter(o => o && !o.userData?.deleted);
        }
        if (this.selected.kind === 'object') {
            const obj = this.selected.obj;
            if (!obj || obj.userData?.deleted) return [];
            if (this.groupMode && obj.userData.groupId) {
                const members = this._getGroupMembers(obj.userData.groupId);
                if (members.length > 0) return members;
            }
            return [obj];
        }
        return [];
    }

    _dedupeHierarchyAncestors(objs) {
        const set = new Set(objs);
        return objs.filter(o => {
            let p = o.parent;
            while (p) {
                if (set.has(p)) return false;
                p = p.parent;
            }
            return true;
        });
    }

    _updateSelectionOutline() {
        for (const h of this._multiOutlines) {
            h.visible = false;
        }
        if (!this.selected) {
            this._selectionOutline.visible = false;
            return;
        }
        const box = new THREE.Box3();
        if (this.selected.kind === 'object' || this.selected.kind === 'multi') {
            const activeObjs = this._getActiveTransformObjects();
            for (let i = 0; i < activeObjs.length; i++) {
                const m = activeObjs[i];
                m.updateWorldMatrix(true, true);
                box.expandByObject(m);
                if (activeObjs.length > 1) {
                    let helper = this._multiOutlines[i];
                    if (!helper) {
                        helper = new THREE.Box3Helper(new THREE.Box3(), 0x38bdf8);
                        helper.renderOrder = 949;
                        this.scene.add(helper);
                        this._multiOutlines.push(helper);
                    }
                    helper.box.setFromObject(m);
                    helper.visible = !helper.box.isEmpty();
                }
            }
        } else if (this.selected.kind === 'light') {
            const p = this.selected.light.position;
            box.setFromCenterAndSize(p, new THREE.Vector3(0.4, 0.4, 0.4));
        } else if (this.selected.kind === 'spawn') {
            const p = this.world.playerSpawn.position.clone().add(new THREE.Vector3(0, 0.85, 0));
            box.setFromCenterAndSize(p, new THREE.Vector3(0.55, 1.75, 0.55));
        } else if (this.selected.kind === 'hiding') {
            const spot = this.selected.spot;
            const p = this.hideSubTarget === 'peek' ? spot.peekPos : spot.hidePos;
            box.setFromCenterAndSize(p.clone().add(new THREE.Vector3(0, 0.35, 0)), new THREE.Vector3(0.4, 0.4, 0.4));
        } else if (this.selected.kind === 'waypoint') {
            const p = this.world.patrolWaypoints[this.selected.index];
            if (p) box.setFromCenterAndSize(p.clone().add(new THREE.Vector3(0, 0.25, 0)), new THREE.Vector3(0.42, 0.42, 0.42));
        }

        if (box.isEmpty()) {
            this._selectionOutline.visible = false;
        } else {
            this._selectionOutline.box.copy(box);
            this._selectionOutline.visible = true;
        }
    }

    _getGroupMembers(groupId) {
        if (!groupId) return [];
        return this.builder.editableObjects.filter(o => o.userData.groupId === groupId && !o.userData.deleted);
    }

    setObjectSelection(objs) {
        const list = [];
        const seen = new Set();
        for (const o of (objs || [])) {
            if (!o || o.userData?.deleted || seen.has(o)) continue;
            seen.add(o);
            list.push(o);
        }
        if (list.length === 0) {
            this.selectEntity(null);
        } else if (list.length === 1) {
            this.selectEntity({ kind: 'object', obj: list[0] });
        } else {
            this.selectEntity({ kind: 'multi', objs: list });
        }
    }

    toggleObjectSelection(obj) {
        if (!obj || obj.userData?.deleted) return;
        const current = (this.selected?.kind === 'object' || this.selected?.kind === 'multi')
            ? [...this.selectedObjects]
            : [];
        const idx = current.indexOf(obj);
        if (idx >= 0) current.splice(idx, 1);
        else current.push(obj);
        this.setObjectSelection(current);
    }

    selectEntity(sel) {
        this.selected = sel || null;
        if (sel?.kind === 'object' && sel.obj) {
            this.selectedObjects = [sel.obj];
        } else if (sel?.kind === 'multi' && Array.isArray(sel.objs)) {
            this.selectedObjects = [...sel.objs];
        } else {
            this.selectedObjects = [];
        }
        if (sel && sel.kind === 'hiding' && sel.subTarget) {
            this.hideSubTarget = sel.subTarget;
        }
        this._syncPreviewRevealForSelection();
        this._applyPreviewStates();
        this._attachGizmoToSelection();
        this._updateSelectionOutline();
        this._refreshHierarchySelection();
        this._updateInspector();
        this._updateStatusSelection();
    }

    _attachGizmoToSelection() {
        if (!this.selected || this.toolMode === 'select' || this.camMode === 'walk') {
            this.gizmo.detach();
            return;
        }
        if (this.selected.kind === 'object' || this.selected.kind === 'multi') {
            const activeObjs = this._getActiveTransformObjects();
            if (activeObjs.length === 0) {
                this.gizmo.detach();
                return;
            }
            if (activeObjs.length > 1) {
                const center = new THREE.Vector3();
                const wp = new THREE.Vector3();
                for (const m of activeObjs) {
                    m.updateWorldMatrix(true, false);
                    m.getWorldPosition(wp);
                    center.add(wp);
                }
                center.divideScalar(activeObjs.length);
                this._groupPivot.position.copy(center);
                this._groupPivot.rotation.set(0, 0, 0);
                this._groupPivot.scale.set(1, 1, 1);
                this.gizmo.attach(this._groupPivot);
                return;
            }
            this.gizmo.attach(activeObjs[0]);
        } else if (this.selected.kind === 'light') {
            this.gizmo.attach(this.selected.light);
        } else if (this.selected.kind === 'spawn') {
            this._spawnMarkerObj.position.copy(this.world.playerSpawn.position);
            this._spawnMarkerObj.rotation.set(0, this.world.playerSpawn.yaw, 0);
            this._spawnMarkerObj.scale.set(1, 1, 1);
            this.gizmo.attach(this._spawnMarkerObj);
        } else if (this.selected.kind === 'hiding') {
            const pair = this._hidingMarkerPairs.get(this.selected.spot.id);
            if (pair) {
                const targetMesh = this.hideSubTarget === 'peek' ? pair.peekMesh : pair.hideMesh;
                this.gizmo.attach(targetMesh);
            }
        } else if (this.selected.kind === 'waypoint') {
            const mesh = this._waypointMeshes[this.selected.index];
            if (mesh) this.gizmo.attach(mesh);
        }
    }

    _onGizmoDragStart() {
        this._beforeDragSnapshot = this._cloneOverrides();
        if ((this.selected?.kind === 'object' || this.selected?.kind === 'multi') && this.gizmo.target === this._groupPivot) {
            const rawMembers = this._getActiveTransformObjects();
            const members = this._dedupeHierarchyAncestors(rawMembers);
            this._groupPivot.updateMatrixWorld(true);
            const pivotPos = this._groupPivot.position.clone();
            this._groupDragState = {
                pivotPos,
                pivotInv: this._groupPivot.matrixWorld.clone().invert(),
                allSelected: rawMembers,
                members: members.map(m => {
                    m.updateMatrixWorld(true);
                    return {
                        obj: m,
                        pivotPos,
                        startWorld: m.matrixWorld.clone(),
                        startWorldPos: new THREE.Vector3().setFromMatrixPosition(m.matrixWorld),
                        startScale: m.scale.clone()
                    };
                })
            };
        } else {
            this._groupDragState = null;
        }
    }

    _onGizmoChange() {
        if (!this.selected) return;

        if (this.selected.kind === 'object' || this.selected.kind === 'multi') {
            if (this._groupDragState) {
                this._groupPivot.updateMatrixWorld(true);
                if (this.gizmo.mode === 'scale') {
                    const pScale = this._groupPivot.scale;
                    for (const item of this._groupDragState.members) {
                        const pv = item.pivotPos;
                        const newWorldPos = new THREE.Vector3(
                            pv.x + (item.startWorldPos.x - pv.x) * pScale.x,
                            pv.y + (item.startWorldPos.y - pv.y) * pScale.y,
                            pv.z + (item.startWorldPos.z - pv.z) * pScale.z
                        );
                        if (item.obj.parent && item.obj.parent !== this.scene) {
                            item.obj.parent.updateMatrixWorld(true);
                            item.obj.position.copy(item.obj.parent.worldToLocal(newWorldPos));
                        } else {
                            item.obj.position.copy(newWorldPos);
                        }
                        item.obj.scale.set(
                            Math.max(0.01, item.startScale.x * pScale.x),
                            Math.max(0.01, item.startScale.y * pScale.y),
                            Math.max(0.01, item.startScale.z * pScale.z)
                        );
                        this._syncSingleObjectLiveEffects(item.obj);
                    }
                } else {
                    const delta = new THREE.Matrix4().multiplyMatrices(this._groupPivot.matrixWorld, this._groupDragState.pivotInv);
                    const pos = new THREE.Vector3();
                    const quat = new THREE.Quaternion();
                    const scl = new THREE.Vector3();
                    for (const item of this._groupDragState.members) {
                        const matW = new THREE.Matrix4().multiplyMatrices(delta, item.startWorld);
                        if (item.obj.parent && item.obj.parent !== this.scene) {
                            item.obj.parent.updateMatrixWorld(true);
                            const parentInv = item.obj.parent.matrixWorld.clone().invert();
                            const matL = new THREE.Matrix4().multiplyMatrices(parentInv, matW);
                            matL.decompose(pos, quat, scl);
                        } else {
                            matW.decompose(pos, quat, scl);
                        }
                        item.obj.position.copy(pos);
                        item.obj.quaternion.copy(quat);
                        item.obj.scale.copy(scl);
                        this._syncSingleObjectLiveEffects(item.obj);
                    }
                }
            } else if (this.selected.obj) {
                this._syncSingleObjectLiveEffects(this.selected.obj);
            }
            if (this.showColliders) this._rebuildColliderHelpers();
        } else if (this.selected.kind === 'light') {
            this._rebuildLightMarkers();
        } else if (this.selected.kind === 'spawn') {
            this.world.playerSpawn.position.copy(this._spawnMarkerObj.position);
            this.world.playerSpawn.yaw = this._spawnMarkerObj.rotation.y;
        } else if (this.selected.kind === 'hiding') {
            const pair = this._hidingMarkerPairs.get(this.selected.spot.id);
            if (pair) {
                if (this.hideSubTarget === 'peek') {
                    this.selected.spot.peekPos.copy(pair.peekMesh.position).sub(new THREE.Vector3(0, 0.35, 0));
                } else {
                    this.selected.spot.hidePos.copy(pair.hideMesh.position).sub(new THREE.Vector3(0, 0.35, 0));
                }
                pair.line.geometry.setFromPoints([pair.hideMesh.position, pair.peekMesh.position]);
            }
        } else if (this.selected.kind === 'waypoint') {
            const mesh = this._waypointMeshes[this.selected.index];
            if (mesh && this.world.patrolWaypoints[this.selected.index]) {
                this.world.patrolWaypoints[this.selected.index].copy(mesh.position).sub(new THREE.Vector3(0, 0.25, 0));
                if (this._waypointLine) {
                    this._waypointLine.geometry.setFromPoints(this._waypointMeshes.map(m => m.position.clone()));
                }
            }
        }

        this._updateSelectionOutline();
        this._updateInspectorValuesOnly();
    }

    _syncSingleObjectLiveEffects(obj) {
        if (this.act4Preview && obj.name === 'FrontDoor' && this.world.destroyedPoses?.frontDoor) {
            this.world.destroyedPoses.frontDoor.position.copy(obj.position);
            this.world.destroyedPoses.frontDoor.rotation.copy(obj.rotation);
            return;
        }
        if (this.act4Preview && obj.name === 'ChristmasTree' && this.world.destroyedPoses?.tree) {
            this.world.destroyedPoses.tree.position.copy(obj.position);
            this.world.destroyedPoses.tree.rotation.copy(obj.rotation);
            return;
        }
        if (obj.name === 'FoldingTable' && this.world.table) {
            if (this.tableSetPreview) {
                this.world.table.hallPos.copy(obj.position);
                this.world.table.hallRot.copy(obj.rotation);
            } else {
                this.world.table.balconyPos.copy(obj.position);
                this.world.table.balconyRot.copy(obj.rotation);
            }
        }
        if (obj.userData.doorCfg) {
            obj.userData.doorCfg.pivotPos.copy(obj.position);
        }
        if (obj.userData.setBaseYaw) {
            obj.userData.setBaseYaw(obj.rotation.y - (obj.userData.doorOpenOffset || 0));
        }
        if (obj.name === 'ShowerCurtain') {
            const bathSpot = this.world.hidingSpots.find(s => s.id === 'bathroom');
            if (bathSpot?.setCurtainClosedZ) bathSpot.setCurtainClosedZ(obj.position.z + 0.58);
        }
    }

    _bakeScaleIntoStaticBox(obj) {
        if (!this._isSinglePrimitiveEditable(obj)) return;
        if (arrApproxEq([obj.scale.x, obj.scale.y, obj.scale.z], [1, 1, 1], 0.0005)) return;
        const cur = obj.userData.boxSize || [1, 1, 1];
        const nextSize = [
            Math.max(0.01, round3(cur[0] * obj.scale.x)),
            Math.max(0.01, round3(cur[1] * obj.scale.y)),
            Math.max(0.01, round3(cur[2] * obj.scale.z))
        ];
        obj.scale.set(1, 1, 1);
        this._applyStaticBoxSize(obj, nextSize);
    }

    _applyStaticBoxSize(obj, sizeArr) {
        if (!obj?.userData?.primaryMesh) return;
        const [w, h, d] = sizeArr.map(v => Math.max(0.01, v));
        const shape = obj.userData.shape || 'box';
        const radialSegs = obj.userData.radialSegs || 10;
        obj.userData.primaryMesh.geometry.dispose();
        obj.userData.primaryMesh.geometry = this.builder._buildPrimitiveGeometry(shape, w, h, d, radialSegs);
        obj.userData.boxSize = [w, h, d];
        const col = obj.userData.gameObject?.getComponent(BoxCollider);
        if (col && !col.userDataCustomSize) {
            col.setSize(new THREE.Vector3(w, h, d));
        }
    }

    _onGizmoDragEnd() {
        if (this._beforeDragSnapshot) {
            this._pushUndo(this._beforeDragSnapshot);
            this._beforeDragSnapshot = null;
        }
        if (this.selected?.kind === 'object' || this.selected?.kind === 'multi') {
            if (this._groupDragState) {
                for (const item of this._groupDragState.members) {
                    if (this.gizmo.mode === 'scale') this._bakeScaleIntoStaticBox(item.obj);
                    this._syncObjectToOverrides(item.obj);
                }
                this._groupDragState = null;
                this._attachGizmoToSelection();
            } else if (this.selected.obj) {
                if (this.gizmo.mode === 'scale') this._bakeScaleIntoStaticBox(this.selected.obj);
                this._syncObjectToOverrides(this.selected.obj);
            }
        } else if (this.selected?.kind === 'light') {
            this._syncLightToOverrides(this.selected.light);
        } else if (this.selected) {
            this._syncGameplayToOverrides();
        }
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateInspector();
        this._updateStatusCounts();
    }

    _getSpawnPointInFrontOfCam() {
        const cam = this.camMode === 'top' ? this.orthoCam : this.perspectiveCam;
        if (this.camMode === 'top') {
            return new THREE.Vector3(cam.position.x, 0.5, cam.position.z);
        }
        this._raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
        const meshes = [];
        for (const obj of this.builder.editableObjects) {
            if (!obj.visible || obj.userData.deleted || CEILING_NAMES.has(obj.name)) continue;
            obj.traverse(c => { if (c.isMesh) meshes.push(c); });
        }
        const hits = this._raycaster.intersectObjects(meshes, false);
        if (hits.length > 0 && hits[0].distance < 10) {
            const p = hits[0].point.clone();
            p.y = Math.max(0.5, p.y + 0.5);
            return p;
        }
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        const p = cam.position.clone().addScaledVector(dir, 2.8);
        p.y = Math.max(0.5, Math.min(2.6, p.y));
        return p;
    }

    _uniqueName(prefix) {
        let i = 1;
        while (this.builder._editableByName.has(`${prefix}_${i}`) || this.builder._lightByKey.has(`${prefix}_${i}`)) {
            i++;
        }
        return `${prefix}_${i}`;
    }

    addCustomShape(shape) {
        const pos = this._getSpawnPointInFrontOfCam();
        const name = this._uniqueName(`Custom_${shape}`);
        const sizeMap = {
            box: [1.0, 1.0, 1.0],
            cylinder: [0.6, 1.0, 0.6],
            sphere: [0.8, 0.8, 0.8],
            plane: [1.5, 1.5, 0.05]
        };
        const cfg = {
            name,
            shape,
            category: 'custom',
            boxSize: sizeMap[shape] || [1, 1, 1],
            position: vecArr(pos),
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            materialKey: 'concrete',
            collide: shape !== 'plane',
            blocker: shape !== 'plane',
            castShadow: true,
            receiveShadow: true,
            visible: true
        };
        this._pushUndo();
        this.overrides.addedObjects.push(cfg);
        const obj = this.builder.spawnCustomObject(cfg);
        saveOverridesToLocalStorage(this.overrides);
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateStatusCounts();
        this.selectEntity({ kind: 'object', obj });
        this._showToast(`Добавлен объект: ${name}`);
    }

    addCustomLight() {
        const pos = this._getSpawnPointInFrontOfCam();
        pos.y = Math.max(pos.y, 2.1);
        const key = this._uniqueName('CustomLight');
        const cfg = {
            name: key,
            label: `Лампа (${key})`,
            position: vecArr(pos),
            color: 0xffe4b5,
            intensity: 1.4,
            distance: 8.5,
            decay: 1.5,
            visible: true
        };
        this._pushUndo();
        this.overrides.addedLights.push(cfg);
        const light = this.builder.spawnCustomLight(cfg);
        saveOverridesToLocalStorage(this.overrides);
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateStatusCounts();
        this.selectEntity({ kind: 'light', light });
        this._showToast(`Добавлен свет: ${key}`);
    }

    addPatrolWaypoint(afterIndex = null) {
        this._pushUndo();
        let pos;
        let insertIdx;
        if (afterIndex !== null && this.world.patrolWaypoints[afterIndex]) {
            const cur = this.world.patrolWaypoints[afterIndex];
            const next = this.world.patrolWaypoints[(afterIndex + 1) % this.world.patrolWaypoints.length];
            pos = cur.clone().lerp(next, 0.5);
            insertIdx = afterIndex + 1;
            this.world.patrolWaypoints.splice(insertIdx, 0, pos);
        } else {
            pos = this._getSpawnPointInFrontOfCam();
            pos.y = 0;
            this.world.patrolWaypoints.push(pos);
            insertIdx = this.world.patrolWaypoints.length - 1;
        }
        this._syncGameplayToOverrides();
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateStatusCounts();
        this.selectEntity({ kind: 'waypoint', index: insertIdx });
        this._showToast(`Точка пути #${insertIdx + 1} добавлена`);
    }

    duplicateSelected() {
        if (!this.selected) return;
        if (this.selected.kind === 'light') {
            const src = this.selected.light;
            const key = this._uniqueName('CustomLight');
            const cfg = {
                name: key,
                label: `Лампа (${key})`,
                position: [round3(src.position.x + 0.4), round3(src.position.y), round3(src.position.z + 0.4)],
                color: src.color.getHex(),
                intensity: round3(src.intensity),
                distance: round3(src.distance),
                decay: round3(src.decay),
                visible: src.visible
            };
            this._pushUndo();
            this.overrides.addedLights.push(cfg);
            const light = this.builder.spawnCustomLight(cfg);
            saveOverridesToLocalStorage(this.overrides);
            this._rebuildHelperVisuals();
            this._refreshHierarchy();
            this._updateStatusCounts();
            this.selectEntity({ kind: 'light', light });
            this._showToast(`Создана копия света: ${key}`);
            return;
        }
        if (this.selected.kind === 'waypoint') {
            this.addPatrolWaypoint(this.selected.index);
            return;
        }
        if (this.selected.kind !== 'object' && this.selected.kind !== 'multi') return;

        const rawSources = this._getActiveTransformObjects();
        if (rawSources.length === 0) return;
        const sources = this._dedupeHierarchyAncestors(rawSources);

        this._pushUndo();
        const offset = new THREE.Vector3(0.25, 0, 0.25);
        const wPos = new THREE.Vector3();
        const wQuat = new THREE.Quaternion();
        const wScale = new THREE.Vector3();
        const wEuler = new THREE.Euler();
        const duplicates = [];

        for (const src of sources) {
            src.updateMatrixWorld(true);
            src.matrixWorld.decompose(wPos, wQuat, wScale);
            wEuler.setFromQuaternion(wQuat, 'XYZ');

            const isPrim = this._isSinglePrimitiveEditable(src);
            const name = this._uniqueName(src.name.replace(/_\d+$/, '').replace(/_Copy$/, '') + '_Copy');
            const cfg = {
                name,
                shape: src.userData.shape || 'box',
                category: 'custom',
                position: [round3(wPos.x + offset.x), round3(wPos.y + offset.y), round3(wPos.z + offset.z)],
                rotation: eulerArr(wEuler),
                scale: vecArr(wScale),
                materialKey: src.userData.materialKey || 'concrete',
                collide: src.userData.collide !== false,
                blocker: src.userData.blocker !== false,
                castShadow: !!src.userData.castShadow,
                receiveShadow: src.userData.receiveShadow !== false,
                visible: true
            };

            if (isPrim && src.userData.boxSize) {
                cfg.forcePrimitive = true;
                cfg.boxSize = [...src.userData.boxSize];
                cfg.radialSegs = src.userData.radialSegs || 10;
            } else {
                cfg.templateFrom = src.userData.templateFrom || src.name;
                if (src.userData.boxSize) {
                    cfg.boxSize = [...src.userData.boxSize];
                } else {
                    const savedQ = src.quaternion.clone();
                    const savedP = src.position.clone();
                    src.position.set(0, 0, 0);
                    src.quaternion.identity();
                    src.updateMatrixWorld(true);
                    const lb = new THREE.Box3().setFromObject(src);
                    src.position.copy(savedP);
                    src.quaternion.copy(savedQ);
                    src.updateMatrixWorld(true);
                    const sz = new THREE.Vector3();
                    lb.getSize(sz);
                    cfg.boxSize = [Math.max(0.05, round3(sz.x)), Math.max(0.05, round3(sz.y)), Math.max(0.05, round3(sz.z))];
                }
            }

            if (src.userData.materialPatch) {
                Object.assign(cfg, src.userData.materialPatch);
            }
            const srcCol = src.userData.gameObject?.getComponent(BoxCollider);
            if (srcCol && srcCol.userDataCustomSize) {
                cfg.colliderSize = vecArr(srcCol.size);
                cfg.colliderOffset = vecArr(srcCol.offset);
            }

            this.overrides.addedObjects.push(cfg);
            const dup = this.builder.spawnCustomObject(cfg);
            if (dup) {
                dup.userData.logicalVisible = true;
                duplicates.push(dup);
            }
        }

        saveOverridesToLocalStorage(this.overrides);
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateStatusCounts();
        if (duplicates.length > 0) {
            this.setObjectSelection(duplicates);
            this._showToast(duplicates.length === 1
                ? `Дубликат: ${duplicates[0].name}`
                : `Скопировано объектов: ${duplicates.length}`);
        }
    }

    _deleteSingleObject(obj) {
        const name = obj.name;
        if (obj.userData.isAdded) {
            this.overrides.addedObjects = this.overrides.addedObjects.filter(c => c.name !== name);
            this._removeAddedEntityFromRuntime(obj);
            return;
        }
        obj.visible = false;
        obj.userData.logicalVisible = false;
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
        this.builder.blockerMeshes = this.builder.blockerMeshes.filter(m => !meshes.includes(m));
        this._syncObjectToOverrides(obj);
    }

    deleteSelected() {
        if (!this.selected) return;
        if (this.selected.kind === 'spawn' || this.selected.kind === 'hiding') {
            this._showToast('Спавн и точки пряток нельзя удалить (только переместить)', 'warn');
            return;
        }
        if (this.selected.kind === 'waypoint') {
            if (this.world.patrolWaypoints.length <= 2) {
                this._showToast('У монстра должно остаться минимум 2 точки пути', 'warn');
                return;
            }
            this._pushUndo();
            this.world.patrolWaypoints.splice(this.selected.index, 1);
            this._syncGameplayToOverrides();
            this.selectEntity(null);
            this._rebuildHelperVisuals();
            this._refreshHierarchy();
            this._updateStatusCounts();
            this._showToast('Точка пути удалена');
            return;
        }
        if (this.selected.kind === 'light') {
            const light = this.selected.light;
            const key = light.userData.lightKey;
            this._pushUndo();
            if (light.userData.isAddedLight) {
                this.overrides.addedLights = this.overrides.addedLights.filter(c => c.name !== key);
                this._removeAddedLightFromRuntime(light);
            } else {
                light.visible = false;
                light.intensity = 0;
                light.userData.deleted = true;
                this._syncLightToOverrides(light);
            }
            this.selectEntity(null);
            this._rebuildHelperVisuals();
            this._refreshHierarchy();
            this._updateStatusCounts();
            this._showToast(`Свет ${key} удалён`);
            return;
        }
        if (this.selected.kind === 'object' || this.selected.kind === 'multi') {
            const targets = [...this.selectedObjects];
            if (targets.length === 0) return;
            this._pushUndo();
            for (const obj of targets) {
                this._deleteSingleObject(obj);
            }
            this.selectEntity(null);
            this._rebuildHelperVisuals();
            this._refreshHierarchy();
            this._updateStatusCounts();
            this._showToast(targets.length === 1
                ? `Объект ${targets[0].name} удалён (можно отменить Ctrl+Z)`
                : `Удалено объектов: ${targets.length} (можно отменить Ctrl+Z)`);
        }
    }

    resetSelected() {
        if (!this.selected) return;
        this._pushUndo();
        if (this.selected.kind === 'object' || this.selected.kind === 'multi') {
            const targets = [...this.selectedObjects];
            let resetCount = 0;
            let skippedAdded = 0;
            for (const obj of targets) {
                if (this.act4Preview && obj.name === 'FrontDoor' && this.world.destroyedPoses?.frontDoor) {
                    const def = FACTORY_GAMEPLAY.destroyedPoses.frontDoor;
                    this.world.destroyedPoses.frontDoor.position.set(...def.position);
                    this.world.destroyedPoses.frontDoor.rotation.set(...def.rotation);
                    this._syncGameplayToOverrides();
                    resetCount++;
                    continue;
                }
                if (this.act4Preview && obj.name === 'ChristmasTree' && this.world.destroyedPoses?.tree) {
                    const def = FACTORY_GAMEPLAY.destroyedPoses.tree;
                    this.world.destroyedPoses.tree.position.set(...def.position);
                    this.world.destroyedPoses.tree.rotation.set(...def.rotation);
                    this._syncGameplayToOverrides();
                    resetCount++;
                    continue;
                }
                if (obj.name === 'FoldingTable' && this.world.table) {
                    if (this.tableSetPreview) {
                        const def = FACTORY_GAMEPLAY.tablePoses.hall;
                        this.world.table.hallPos.set(...def.position);
                        this.world.table.hallRot.set(...def.rotation);
                        this._syncGameplayToOverrides();
                        resetCount++;
                        continue;
                    } else {
                        const def = FACTORY_GAMEPLAY.tablePoses.balcony;
                        this.world.table.balconyPos.set(...def.position);
                        this.world.table.balconyRot.set(...def.rotation);
                        this._syncGameplayToOverrides();
                    }
                }
                if (obj.userData.isAdded) {
                    skippedAdded++;
                    continue;
                }
                this._restoreBuiltInObjectToInitial(obj);
                delete this.overrides.modifiedObjects[obj.name];
                this._syncGameplayToOverrides();
                resetCount++;
            }
            if (resetCount === 0 && skippedAdded > 0) {
                this.undoStack.pop();
                this._updateUndoRedoButtons();
                this._showToast('Добавленный объект не имеет исходного состояния — используйте Удалить', 'warn');
                return;
            }
            saveOverridesToLocalStorage(this.overrides);
            this._syncPreviewRevealForSelection();
            this._applyPreviewStates();
        } else if (this.selected.kind === 'light') {
            const light = this.selected.light;
            if (light.userData.isAddedLight) {
                this._showToast('Добавленная лампа не имеет исходного состояния', 'warn');
                this.undoStack.pop();
                this._updateUndoRedoButtons();
                return;
            }
            this._restoreBuiltInLightToInitial(light);
            delete this.overrides.modifiedLights[light.userData.lightKey];
            saveOverridesToLocalStorage(this.overrides);
        } else if (this.selected.kind === 'spawn') {
            this.world.playerSpawn.position.set(...FACTORY_GAMEPLAY.playerSpawn.position);
            this.world.playerSpawn.yaw = FACTORY_GAMEPLAY.playerSpawn.yaw;
            this.world.playerSpawn.pitch = FACTORY_GAMEPLAY.playerSpawn.pitch;
            this._syncGameplayToOverrides();
        } else if (this.selected.kind === 'hiding') {
            const spot = this.selected.spot;
            const def = FACTORY_GAMEPLAY.hidingSpots[spot.id];
            if (def) {
                spot.hidePos.set(...def.hidePos);
                spot.peekPos.set(...def.peekPos);
                spot.lookYaw = def.lookYaw;
                this._syncGameplayToOverrides();
            }
        } else if (this.selected.kind === 'waypoint') {
            this.world.patrolWaypoints = FACTORY_GAMEPLAY.patrolWaypoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
            this._syncGameplayToOverrides();
            if (this.selected.index >= this.world.patrolWaypoints.length) this.selected = null;
        }
        this._attachGizmoToSelection();
        this._rebuildHelperVisuals();
        this._refreshHierarchy();
        this._updateInspector();
        this._updateStatusCounts();
        this._showToast('Элемент сброшен к исходному');
    }

    resetAllMap() {
        if (!confirm('Сбросить ВСЕ изменения карты к исходной версии из кода?')) return;
        this._pushUndo();
        clearLocalStorageOverrides();
        const empty = { version: 1, updatedAt: null, modifiedObjects: {}, modifiedLights: {}, addedObjects: [], addedLights: [], gameplay: {} };
        this._restoreOverridesState(empty);
        this._showToast('Карта полностью сброшена к исходной', 'warn');
    }

    async saveToProject() {
        saveOverridesToLocalStorage(this.overrides);
        const jsContent = serializeMapOverridesToJS(this.overrides);

        if (this.serverAvailable) {
            try {
                const res = await fetch('/api/save-map', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.overrides)
                });
                const json = await res.json();
                if (res.ok && json.ok) {
                    this._showToast('Сохранено в src/world/MapOverrides.js и localStorage!');
                    return;
                }
                throw new Error(json.error || 'Save error');
            } catch (err) {
                console.warn('Server save failed:', err);
            }
        }

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'MapOverrides.js',
                    types: [{ description: 'JavaScript Module', accept: { 'application/javascript': ['.js'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsContent);
                await writable.close();
                this._showToast('Файл MapOverrides.js сохранён на диск!');
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        this.downloadOverridesFile();
        this._showToast('Сервер не запущен — скачан MapOverrides.js и обновлено превью (localStorage)', 'warn');
    }

    downloadOverridesFile() {
        const jsContent = serializeMapOverridesToJS(this.overrides);
        const blob = new Blob([jsContent], { type: 'application/javascript;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MapOverrides.js';
        a.click();
        URL.revokeObjectURL(url);
    }

    async importOverridesFile(file) {
        if (!file) return;
        try {
            const text = await file.text();
            let parsed;
            if (file.name.endsWith('.json')) {
                parsed = JSON.parse(text);
            } else {
                const match = text.match(/export\s+const\s+MAP_OVERRIDES\s*=\s*(\{[\s\S]*?\});/);
                if (!match) throw new Error('Не найден блок MAP_OVERRIDES в файле');
                parsed = JSON.parse(match[1]);
            }
            this._pushUndo();
            this._restoreOverridesState(parsed);
            this._showToast(`Импортировано из ${file.name}`);
        } catch (err) {
            this._showToast(`Ошибка импорта: ${err.message}`, 'error');
        }
    }

    setCameraMode(mode) {
        if (this.camMode === 'walk' && document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
        }
        if (this.camMode === 'top' && mode !== 'top') {
            this.noCeiling = this._savedNoCeilingBeforeTop;
            this._applyNoCeilingVisibility();
            document.getElementById('toggle-noceiling').classList.toggle('active', this.noCeiling);
        }
        if (mode === 'top' && this.camMode !== 'top') {
            this._savedNoCeilingBeforeTop = this.noCeiling;
            this.noCeiling = true;
            this._applyNoCeilingVisibility();
            document.getElementById('toggle-noceiling').classList.toggle('active', true);
        }

        this.camMode = mode;
        for (const btn of document.querySelectorAll('[data-cam]')) {
            btn.classList.toggle('active', btn.dataset.cam === mode);
        }

        const hint = document.getElementById('viewport-hint');
        if (mode === 'fly') {
            this.engine.renderer.camera = this.perspectiveCam;
            this.gizmo.setCamera(this.perspectiveCam);
            hint.textContent = 'ПКМ+WASD/QE — полёт • СКМ — панорама • ЛКМ — выбор/оси • F — фокус • W/E/R — режимы • Del — удалить';
        } else if (mode === 'top') {
            this.engine.renderer.camera = this.orthoCam;
            this.gizmo.setCamera(this.orthoCam);
            hint.textContent = 'План 2D: ПКМ/СКМ — панорама • Колесо — зум • ЛКМ — выбор и перемещение стен/мебели';
        } else if (mode === 'walk') {
            this.engine.renderer.camera = this.perspectiveCam;
            this.gizmo.detach();
            this._walkState.pos.copy(this.world.playerSpawn.position);
            this._walkState.yaw = this.world.playerSpawn.yaw;
            this._walkState.pitch = this.world.playerSpawn.pitch;
            this._walkState.velY = 0;
            this._syncWalkCamera();
            hint.textContent = 'Прогулка FPS: Кликните по сцене для захвата мыши • WASD — ходьба • Shift — бег • Esc — освободить курсор';
        }
        this._attachGizmoToSelection();
        this._applyViewportSize();
    }

    _setFlyPose(pos, yaw, pitch) {
        this.perspectiveCam.position.copy(pos);
        this._flyCamState.yaw = yaw;
        this._flyCamState.pitch = Math.max(-1.52, Math.min(1.52, pitch));
        this.perspectiveCam.rotation.set(this._flyCamState.pitch, this._flyCamState.yaw, 0, 'YXZ');
    }

    focusSelected() {
        if (!this.selected) return;
        const target = new THREE.Vector3();
        let dist = 3.5;
        if (this.selected.kind === 'object' || this.selected.kind === 'multi') {
            const box = new THREE.Box3();
            for (const o of this._getActiveTransformObjects()) {
                o.updateWorldMatrix(true, true);
                box.expandByObject(o);
            }
            if (!box.isEmpty()) {
                box.getCenter(target);
                const sz = new THREE.Vector3();
                box.getSize(sz);
                dist = Math.max(2.2, Math.min(16, sz.length() * 1.45));
            }
        } else if (this.selected.kind === 'light') {
            target.copy(this.selected.light.position);
        } else if (this.selected.kind === 'spawn') {
            target.copy(this.world.playerSpawn.position).add(new THREE.Vector3(0, 0.85, 0));
        } else if (this.selected.kind === 'hiding') {
            target.copy(this.selected.spot.hidePos).add(new THREE.Vector3(0, 0.4, 0));
        } else if (this.selected.kind === 'waypoint') {
            target.copy(this.world.patrolWaypoints[this.selected.index]);
        }

        if (this.camMode === 'top') {
            this.orthoCam.position.x = target.x;
            this.orthoCam.position.z = target.z;
            return;
        }
        if (this.camMode === 'walk') this.setCameraMode('fly');

        const dir = new THREE.Vector3(0.55, 0.48, 0.68).normalize();
        const camPos = target.clone().addScaledVector(dir, dist);
        this.perspectiveCam.position.copy(camPos);
        this.perspectiveCam.lookAt(target);
        const eul = new THREE.Euler().setFromQuaternion(this.perspectiveCam.quaternion, 'YXZ');
        this._flyCamState.yaw = eul.y;
        this._flyCamState.pitch = eul.x;
    }

    _flyToPreset(key) {
        const p = ROOM_PRESETS[key];
        if (!p) return;
        if (this.camMode === 'top') {
            this.orthoCam.position.set(p.look[0], 22, p.look[2]);
            this.orthoZoom = key === 'overview' ? 0.65 : key === 'courtyard' ? 0.45 : 1.5;
            this._applyViewportSize();
            return;
        }
        if (this.camMode === 'walk') this.setCameraMode('fly');
        const pos = new THREE.Vector3(...p.pos);
        const look = new THREE.Vector3(...p.look);
        this.perspectiveCam.position.copy(pos);
        this.perspectiveCam.lookAt(look);
        const eul = new THREE.Euler().setFromQuaternion(this.perspectiveCam.quaternion, 'YXZ');
        this._flyCamState.yaw = eul.y;
        this._flyCamState.pitch = eul.x;
    }

    _applyNoCeilingVisibility() {
        for (const name of CEILING_NAMES) {
            const obj = this.builder._editableByName.get(name);
            if (!obj || obj.userData.deleted) continue;
            const mod = this.overrides.modifiedObjects[name];
            const baseVis = mod && mod.visible !== undefined ? mod.visible : (obj.userData.initialTransform?.visible !== false);
            obj.visible = this.noCeiling ? false : baseVis;
        }
    }

    _syncWalkCamera() {
        const ws = this._walkState;
        this.perspectiveCam.position.set(ws.pos.x, ws.pos.y + 1.55, ws.pos.z);
        this.perspectiveCam.rotation.set(ws.pitch, ws.yaw, 0, 'YXZ');
    }

    _stepWalkMode(dt) {
        const ws = this._walkState;
        const keys = this._flyCamState.keys;
        const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 3.5 : 2.1;

        const fwd = new THREE.Vector3(-Math.sin(ws.yaw), 0, -Math.cos(ws.yaw));
        const right = new THREE.Vector3(Math.cos(ws.yaw), 0, -Math.sin(ws.yaw));
        const move = new THREE.Vector3();
        if (keys.has('KeyW')) move.add(fwd);
        if (keys.has('KeyS')) move.sub(fwd);
        if (keys.has('KeyD')) move.add(right);
        if (keys.has('KeyA')) move.sub(right);
        if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

        const half = new THREE.Vector3(0.23, 0.85, 0.23);
        const collidesAt = (p) => {
            const pBox = new THREE.Box3(
                new THREE.Vector3(p.x - half.x, p.y, p.z - half.z),
                new THREE.Vector3(p.x + half.x, p.y + 1.70, p.z + half.z)
            );
            for (const rb of this.engine.physicsEngine.rigidBodies) {
                const col = rb.collider;
                if (!col || !col.enabled) continue;
                const b = col.getBox(rb.transform.position);
                if (pBox.intersectsBox(b)) return b;
            }
            return null;
        };

        if (Math.abs(move.x) > 1e-6) {
            const tryX = ws.pos.clone();
            tryX.x += move.x;
            tryX.y += 0.25;
            if (!collidesAt(tryX)) {
                ws.pos.x = tryX.x;
            }
        }
        if (Math.abs(move.z) > 1e-6) {
            const tryZ = ws.pos.clone();
            tryZ.z += move.z;
            tryZ.y += 0.25;
            if (!collidesAt(tryZ)) {
                ws.pos.z = tryZ.z;
            }
        }

        ws.velY -= 12 * dt;
        const tryY = ws.pos.clone();
        tryY.y += ws.velY * dt;
        const hitBox = collidesAt(tryY);
        if (hitBox) {
            if (ws.velY <= 0) {
                ws.pos.y = hitBox.max.y;
                ws.velY = 0;
                ws.grounded = true;
            } else {
                ws.velY = 0;
            }
        } else {
            ws.pos.y = tryY.y;
            ws.grounded = false;
            if (ws.pos.y < -10) {
                ws.pos.copy(this.world.playerSpawn.position);
                ws.velY = 0;
            }
        }

        this._syncWalkCamera();
    }

    _onUpdate(dt) {
        const clampedDt = Math.min(0.05, dt || 0.016);

        if (this.camMode === 'fly') {
            const fcs = this._flyCamState;
            if (fcs.isLooking) {
                const mult = (fcs.keys.has('ShiftLeft') || fcs.keys.has('ShiftRight')) ? 2.2 : 1.0;
                const step = fcs.speed * mult * clampedDt;
                const fwd = new THREE.Vector3();
                this.perspectiveCam.getWorldDirection(fwd);
                const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
                if (fcs.keys.has('KeyW')) this.perspectiveCam.position.addScaledVector(fwd, step);
                if (fcs.keys.has('KeyS')) this.perspectiveCam.position.addScaledVector(fwd, -step);
                if (fcs.keys.has('KeyD')) this.perspectiveCam.position.addScaledVector(right, step);
                if (fcs.keys.has('KeyA')) this.perspectiveCam.position.addScaledVector(right, -step);
                if (fcs.keys.has('KeyE')) this.perspectiveCam.position.y += step;
                if (fcs.keys.has('KeyQ')) this.perspectiveCam.position.y -= step;
            }
        } else if (this.camMode === 'walk') {
            this._stepWalkMode(clampedDt);
        }

        this.gizmo.updateTransform();

        const activeCam = this.camMode === 'top' ? this.orthoCam : this.perspectiveCam;
        const p = activeCam.position;
        document.getElementById('status-camera').textContent = `Камера: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    }

    _pickSceneEntity(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        const cam = this.camMode === 'top' ? this.orthoCam : this.perspectiveCam;
        this._raycaster.setFromCamera(ndc, cam);

        const helperHits = [];
        if (this.showGameplayMarkers) {
            helperHits.push(...this._raycaster.intersectObjects(this._markerPickMeshes, false));
        }
        if (this.showLightMarkers) {
            helperHits.push(...this._raycaster.intersectObjects(this._lightPickMeshes, false));
        }
        helperHits.sort((a, b) => a.distance - b.distance);

        const sceneMeshes = [];
        for (const obj of this.builder.editableObjects) {
            if (!obj.visible || obj.userData.deleted) continue;
            obj.traverse(c => { if (c.isMesh) sceneMeshes.push(c); });
        }
        const meshHits = this._raycaster.intersectObjects(sceneMeshes, false);

        const findEditableRoot = (mesh) => {
            let cur = mesh;
            while (cur) {
                if (cur.userData && cur.userData.isEditable) return cur;
                cur = cur.parent;
            }
            return null;
        };

        const isInvisibleTriggerHit = (hit) => {
            const mat = hit.object?.material;
            return !!(mat && mat.transparent && (mat.opacity ?? 1) <= 0.03);
        };

        let chosenHit = null;
        for (const hit of meshHits) {
            if (isInvisibleTriggerHit(hit)) continue;
            if (findEditableRoot(hit.object)) {
                chosenHit = hit;
                break;
            }
        }
        if (!chosenHit) {
            for (const hit of meshHits) {
                if (findEditableRoot(hit.object)) {
                    chosenHit = hit;
                    break;
                }
            }
        }

        if (helperHits.length > 0) {
            const bestH = helperHits[0];
            if (!chosenHit || bestH.distance <= chosenHit.distance + 0.35) {
                return bestH.object.userData.editorSelection;
            }
        }

        if (chosenHit) {
            const root = findEditableRoot(chosenHit.object);
            if (root) return { kind: 'object', obj: root };
        }
        return null;
    }

    _selectObjectsInScreenRect(x1, y1, x2, y2, additive) {
        const rect = this.canvas.getBoundingClientRect();
        const cam = this.camMode === 'top' ? this.orthoCam : this.perspectiveCam;
        cam.updateMatrixWorld(true);

        const hits = [];
        const box = new THREE.Box3();
        const center = new THREE.Vector3();

        for (const obj of this.builder.editableObjects) {
            if (!obj.visible || obj.userData.deleted) continue;
            if (this.noCeiling && CEILING_NAMES.has(obj.name)) continue;

            let hasVisibleSolid = false;
            obj.traverse(c => {
                if (!c.isMesh) return;
                const mat = c.material;
                if (!mat || !mat.transparent || (mat.opacity ?? 1) > 0.03) {
                    hasVisibleSolid = true;
                }
            });
            if (!hasVisibleSolid) continue;

            obj.updateWorldMatrix(true, true);
            box.setFromObject(obj);
            if (box.isEmpty()) continue;
            box.getCenter(center);
            const p = center.clone().project(cam);
            if (p.z < -1 || p.z > 1) continue;

            const sx = rect.left + (p.x * 0.5 + 0.5) * rect.width;
            const sy = rect.top + (-p.y * 0.5 + 0.5) * rect.height;
            if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
                hits.push(obj);
            }
        }

        if (additive) {
            const base = (this.selected?.kind === 'object' || this.selected?.kind === 'multi')
                ? [...this.selectedObjects]
                : [];
            this.setObjectSelection([...base, ...hits]);
        } else {
            this.setObjectSelection(hits);
        }
        if (hits.length > 0) {
            this._showToast(`Выделено рамкой: ${this.selectedObjects.length}`);
        }
    }

    _bindViewportEvents() {
        const fcs = this._flyCamState;

        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.camMode === 'walk') {
                if (e.button === 0 && document.pointerLockElement !== this.canvas) {
                    this.canvas.requestPointerLock?.();
                }
                return;
            }

            fcs.pointerDownPos.set(e.clientX, e.clientY);
            fcs.pointerMoved = false;

            if (e.button === 2) {
                if (this.camMode === 'fly') fcs.isLooking = true;
                else if (this.camMode === 'top') fcs.isPanning = true;
                return;
            }
            if (e.button === 1) {
                fcs.isPanning = true;
                e.preventDefault();
                return;
            }
            if (e.button === 0) {
                this.gizmo.handlePointerDown(e.clientX, e.clientY);
                if (!this.gizmo.isDragging && (this.toolMode === 'select' || e.shiftKey)) {
                    this._marquee.canStart = true;
                    this._marquee.active = false;
                    this._marquee.additive = !!(e.shiftKey || e.ctrlKey || e.metaKey);
                    this._marquee.startX = e.clientX;
                    this._marquee.startY = e.clientY;
                } else {
                    this._marquee.canStart = false;
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.camMode === 'walk') {
                if (document.pointerLockElement === this.canvas) {
                    this._walkState.yaw -= e.movementX * 0.0022;
                    this._walkState.pitch = Math.max(-1.45, Math.min(1.45, this._walkState.pitch - e.movementY * 0.0022));
                }
                return;
            }

            const moved = Math.hypot(e.clientX - fcs.pointerDownPos.x, e.clientY - fcs.pointerDownPos.y);
            if (moved > 4) fcs.pointerMoved = true;

            if (this.gizmo.isDragging) {
                this.gizmo.handlePointerMove(e.clientX, e.clientY);
                return;
            }

            if (this._marquee.canStart && moved > 5 && !fcs.isLooking && !fcs.isPanning) {
                this._marquee.active = true;
                const boxEl = this._marquee.el;
                if (boxEl) {
                    const contRect = this.canvas.parentElement.getBoundingClientRect();
                    const left = Math.min(this._marquee.startX, e.clientX) - contRect.left;
                    const top = Math.min(this._marquee.startY, e.clientY) - contRect.top;
                    const width = Math.abs(e.clientX - this._marquee.startX);
                    const height = Math.abs(e.clientY - this._marquee.startY);
                    boxEl.classList.remove('hidden');
                    boxEl.style.left = `${left}px`;
                    boxEl.style.top = `${top}px`;
                    boxEl.style.width = `${width}px`;
                    boxEl.style.height = `${height}px`;
                }
                return;
            }

            if (fcs.isLooking && this.camMode === 'fly') {
                fcs.yaw -= e.movementX * 0.0032;
                fcs.pitch = Math.max(-1.52, Math.min(1.52, fcs.pitch - e.movementY * 0.0032));
                this.perspectiveCam.rotation.set(fcs.pitch, fcs.yaw, 0, 'YXZ');
                return;
            }

            if (fcs.isPanning) {
                if (this.camMode === 'top') {
                    const spanY = (this.orthoCam.top - this.orthoCam.bottom);
                    const scale = spanY / Math.max(100, this.canvas.clientHeight);
                    this.orthoCam.position.x -= e.movementX * scale;
                    this.orthoCam.position.z -= e.movementY * scale;
                } else if (this.camMode === 'fly') {
                    const right = new THREE.Vector3();
                    const up = new THREE.Vector3();
                    this.perspectiveCam.matrixWorld.extractBasis(right, up, new THREE.Vector3());
                    this.perspectiveCam.position.addScaledVector(right, -e.movementX * 0.015);
                    this.perspectiveCam.position.addScaledVector(up, e.movementY * 0.015);
                }
                return;
            }

            const hovered = this.gizmo.handlePointerMove(e.clientX, e.clientY);
            this.canvas.style.cursor = hovered ? 'pointer' : 'crosshair';
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                fcs.isLooking = false;
                fcs.isPanning = false;
            }
            if (e.button === 1) {
                fcs.isPanning = false;
            }
            if (e.button === 0) {
                if (this._marquee.active) {
                    const x1 = Math.min(this._marquee.startX, e.clientX);
                    const y1 = Math.min(this._marquee.startY, e.clientY);
                    const x2 = Math.max(this._marquee.startX, e.clientX);
                    const y2 = Math.max(this._marquee.startY, e.clientY);
                    this._marquee.active = false;
                    this._marquee.canStart = false;
                    this._marquee.el?.classList.add('hidden');
                    this._selectObjectsInScreenRect(x1, y1, x2, y2, this._marquee.additive);
                    return;
                }
                this._marquee.canStart = false;

                if (this.gizmo.isDragging) {
                    this.gizmo.handlePointerUp();
                    return;
                }
                if (!fcs.pointerMoved && this.camMode !== 'walk' && e.target === this.canvas) {
                    const picked = this._pickSceneEntity(e.clientX, e.clientY);
                    const additive = !!(e.shiftKey || e.ctrlKey || e.metaKey);
                    if (additive) {
                        if (picked?.kind === 'object') {
                            this.toggleObjectSelection(picked.obj);
                        }
                    } else {
                        this.selectEntity(picked);
                    }
                }
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.camMode === 'top') {
                const factor = e.deltaY > 0 ? 0.88 : 1.14;
                this.orthoZoom = Math.max(0.15, Math.min(8.0, this.orthoZoom * factor));
                this._applyViewportSize();
            } else if (this.camMode === 'fly') {
                if (fcs.isLooking) {
                    fcs.speed = Math.max(1.5, Math.min(24, fcs.speed * (e.deltaY > 0 ? 0.85 : 1.18)));
                } else {
                    const fwd = new THREE.Vector3();
                    this.perspectiveCam.getWorldDirection(fwd);
                    this.perspectiveCam.position.addScaledVector(fwd, (e.deltaY > 0 ? -1 : 1) * 0.85);
                }
            }
        }, { passive: false });

        document.addEventListener('pointerlockchange', () => {
            this._walkState.locked = document.pointerLockElement === this.canvas;
        });

        this.gizmo.onDragStart = () => this._onGizmoDragStart();
        this.gizmo.onChange = () => this._onGizmoChange();
        this.gizmo.onDragEnd = () => this._onGizmoDragEnd();
    }

    _bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            const tag = document.activeElement?.tagName;
            const isTyping = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
                e.preventDefault();
                this.saveToProject();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
                e.preventDefault();
                this.duplicateSelected();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !isTyping) {
                e.preventDefault();
                const allVis = this.builder.editableObjects.filter(o =>
                    o.visible && !o.userData.deleted && !(this.noCeiling && CEILING_NAMES.has(o.name))
                );
                this.setObjectSelection(allVis);
                this._showToast(`Выделены все видимые объекты (${allVis.length})`);
                return;
            }

            if (isTyping) {
                if (e.code === 'Escape') document.activeElement.blur();
                return;
            }

            this._flyCamState.keys.add(e.code);

            if (this.camMode === 'walk') {
                if (e.code === 'Digit1') this.setCameraMode('fly');
                else if (e.code === 'Digit2') this.setCameraMode('top');
                return;
            }

            if (!this._flyCamState.isLooking) {
                if (e.code === 'KeyQ') this.setToolMode('select');
                else if (e.code === 'KeyW') this.setToolMode('translate');
                else if (e.code === 'KeyE') this.setToolMode('rotate');
                else if (e.code === 'KeyR') this.setToolMode('scale');
                else if (e.code === 'KeyX') this.toggleSpace();
                else if (e.code === 'KeyG') this.toggleGroupMode();
                else if (e.code === 'KeyF') this.focusSelected();
                else if (e.code === 'Digit1') this.setCameraMode('fly');
                else if (e.code === 'Digit2') this.setCameraMode('top');
                else if (e.code === 'Digit3') this.setCameraMode('walk');
                else if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSelected();
                else if (e.code === 'Escape') this.selectEntity(null);
            }
        });

        window.addEventListener('keyup', (e) => {
            this._flyCamState.keys.delete(e.code);
        });
    }

    setToolMode(mode) {
        this.toolMode = mode;
        for (const btn of document.querySelectorAll('[data-tool]')) {
            btn.classList.toggle('active', btn.dataset.tool === mode);
        }
        if (mode !== 'select') this.gizmo.setMode(mode);
        this._attachGizmoToSelection();
    }

    toggleSpace() {
        const next = this.gizmo.space === 'world' ? 'local' : 'world';
        this.gizmo.setSpace(next);
        document.getElementById('btn-space').textContent = next === 'world' ? 'Оси: Мир' : 'Оси: Лок.';
        document.getElementById('btn-space').classList.toggle('active', next === 'local');
    }

    toggleGroupMode() {
        this.groupMode = !this.groupMode;
        document.getElementById('btn-group-mode').classList.toggle('active', this.groupMode);
        this._attachGizmoToSelection();
        this._updateSelectionOutline();
    }

    _isObjectModified(obj) {
        return obj.userData.isAdded || !!this.overrides.modifiedObjects[obj.name];
    }

    _isLightModified(light) {
        return light.userData.isAddedLight || !!this.overrides.modifiedLights[light.userData.lightKey];
    }

    _refreshHierarchy() {
        const listEl = document.getElementById('object-list');
        const q = document.getElementById('search-objects').value.trim().toLowerCase();
        const cat = document.getElementById('filter-category').value;
        listEl.innerHTML = '';

        const items = [];

        if (cat === 'all' || cat === 'markers' || cat === 'modified') {
            const gp = this.overrides.gameplay || {};
            if (cat !== 'modified' || gp.playerSpawn) {
                items.push({ label: 'Спавн игрока (Старт)', catLabel: 'Маркер', mod: !!gp.playerSpawn, sel: { kind: 'spawn' } });
            }
            for (const spot of this.world.hidingSpots) {
                const mod = !!(gp.hidingSpots && gp.hidingSpots[spot.id]);
                if (cat === 'modified' && !mod) continue;
                items.push({ label: `Прятка: ${spot.label}`, catLabel: 'Маркер', mod, sel: { kind: 'hiding', spot } });
            }
            const wpMod = !!gp.patrolWaypoints;
            if (cat !== 'modified' || wpMod) {
                this.world.patrolWaypoints.forEach((wp, idx) => {
                    items.push({
                        label: `Путь монстра #${idx + 1}`,
                        catLabel: 'Путь',
                        mod: wpMod,
                        sel: { kind: 'waypoint', index: idx }
                    });
                });
            }
        }

        if (cat === 'all' || cat === 'lights' || cat === 'modified') {
            for (const light of this.builder.editableLights) {
                const mod = this._isLightModified(light);
                if (cat === 'modified' && !mod) continue;
                items.push({
                    label: light.userData.label || light.userData.lightKey,
                    catLabel: 'Свет',
                    mod,
                    hiddenObj: !light.visible,
                    deletedObj: !!light.userData.deleted,
                    sel: { kind: 'light', light }
                });
            }
        }

        if (cat !== 'lights' && cat !== 'markers') {
            for (const obj of this.builder.editableObjects) {
                const oCat = obj.userData.category || 'props';
                const mod = this._isObjectModified(obj);
                if (cat === 'modified' && !mod) continue;
                if (cat === 'activated') {
                    if (oCat !== 'activated' && !obj.userData.activatedGroup) continue;
                } else if (cat !== 'all' && cat !== 'modified' && oCat !== cat) {
                    continue;
                }
                const actTag = obj.userData.activatedGroup === 'table' ? 'Стол'
                    : obj.userData.activatedGroup === 'act4' ? 'Акт IV'
                    : obj.userData.activatedGroup === 'decor' ? 'Декор'
                    : obj.userData.activatedGroup === 'pickup' ? 'Предмет'
                    : '';
                items.push({
                    label: obj.name,
                    catLabel: actTag || CATEGORY_LABELS[oCat] || oCat,
                    mod,
                    hiddenObj: !obj.visible,
                    deletedObj: !!obj.userData.deleted,
                    sel: { kind: 'object', obj }
                });
            }
        }

        const filtered = q ? items.filter(it => it.label.toLowerCase().includes(q) || it.catLabel.toLowerCase().includes(q)) : items;
        document.getElementById('hierarchy-count').textContent = `${filtered.length}`;
        this._lastFilteredHierarchy = filtered;

        const frag = document.createDocumentFragment();
        filtered.forEach((it, idx) => {
            const row = document.createElement('div');
            row.className = 'obj-item';
            if (it.hiddenObj) row.classList.add('hidden-obj');
            if (it.deletedObj) row.classList.add('deleted-obj');
            if (this._isRowSelected(it.sel)) row.classList.add('selected');
            row._selectionRef = it.sel;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'obj-name';
            nameSpan.textContent = it.label;

            const badges = document.createElement('span');
            badges.className = 'obj-badges';
            if (it.mod) {
                const star = document.createElement('span');
                star.className = 'badge-mod';
                star.textContent = '★';
                badges.appendChild(star);
            }
            const catSpan = document.createElement('span');
            catSpan.className = 'badge-cat';
            catSpan.textContent = it.catLabel;
            badges.appendChild(catSpan);

            row.append(nameSpan, badges);
            row.addEventListener('click', (e) => {
                if (it.sel.kind === 'object' && it.sel.obj.userData.deleted) {
                    if (confirm(`Объект ${it.label} скрыт/удалён. Восстановить его?`)) {
                        this.selected = it.sel;
                        this.selectedObjects = [it.sel.obj];
                        this.resetSelected();
                    }
                    return;
                }
                if (it.sel.kind === 'light' && it.sel.light.userData.deleted) {
                    if (confirm(`Источник света ${it.label} удалён. Восстановить его?`)) {
                        this.selected = it.sel;
                        this.resetSelected();
                    }
                    return;
                }
                if (it.sel.kind === 'object') {
                    if (e.ctrlKey || e.metaKey) {
                        this.toggleObjectSelection(it.sel.obj);
                        this._lastListClickIdx = idx;
                        return;
                    }
                    if (e.shiftKey && this._lastListClickIdx >= 0 && this._lastListClickIdx < filtered.length) {
                        const a = Math.min(this._lastListClickIdx, idx);
                        const b = Math.max(this._lastListClickIdx, idx);
                        const rangeObjs = [];
                        for (let i = a; i <= b; i++) {
                            const item = filtered[i];
                            if (item.sel.kind === 'object' && !item.sel.obj.userData.deleted) {
                                rangeObjs.push(item.sel.obj);
                            }
                        }
                        if (rangeObjs.length > 0) {
                            this.setObjectSelection(rangeObjs);
                            return;
                        }
                    }
                    this._lastListClickIdx = idx;
                } else {
                    this._lastListClickIdx = -1;
                }
                this.selectEntity(it.sel);
            });
            row.addEventListener('dblclick', () => this.focusSelected());
            frag.appendChild(row);
        });
        listEl.appendChild(frag);
    }

    _isRowSelected(rowSel) {
        if (!rowSel || !this.selected) return false;
        if (this.selected.kind === 'multi') {
            return rowSel.kind === 'object' && this.selectedObjects.includes(rowSel.obj);
        }
        return this._isSameSelection(rowSel, this.selected);
    }

    _refreshHierarchySelection() {
        const listEl = document.getElementById('object-list');
        for (const row of listEl.children) {
            row.classList.toggle('selected', this._isRowSelected(row._selectionRef));
        }
    }

    _isSameSelection(a, b) {
        if (!a || !b || a.kind !== b.kind) return false;
        if (a.kind === 'object') return a.obj === b.obj;
        if (a.kind === 'light') return a.light === b.light;
        if (a.kind === 'hiding') return a.spot.id === b.spot.id;
        if (a.kind === 'waypoint') return a.index === b.index;
        return a.kind === 'spawn';
    }

    _updateStatusSelection() {
        const el = document.getElementById('status-selection');
        if (!this.selected) {
            el.textContent = 'Ничего не выбрано';
            return;
        }
        if (this.selected.kind === 'multi') {
            el.textContent = `Выбрано объектов: ${this.selectedObjects.length}`;
        } else if (this.selected.kind === 'object') {
            const grp = this.selected.obj.userData.groupId;
            el.textContent = grp && GROUP_LABELS[grp]
                ? `Выбрано: ${this.selected.obj.name} (${GROUP_LABELS[grp]})`
                : `Выбрано: ${this.selected.obj.name}`;
        } else if (this.selected.kind === 'light') {
            el.textContent = `Свет: ${this.selected.light.userData.label}`;
        } else if (this.selected.kind === 'spawn') {
            el.textContent = 'Маркер: Спавн игрока';
        } else if (this.selected.kind === 'hiding') {
            el.textContent = `Прятка: ${this.selected.spot.label}`;
        } else if (this.selected.kind === 'waypoint') {
            el.textContent = `Путь монстра #${this.selected.index + 1}`;
        }
    }

    _updateStatusCounts() {
        const modObj = Object.keys(this.overrides.modifiedObjects || {}).length;
        const modLgt = Object.keys(this.overrides.modifiedLights || {}).length;
        const addObj = (this.overrides.addedObjects || []).length;
        const addLgt = (this.overrides.addedLights || []).length;
        const gpCount = Object.keys(this.overrides.gameplay || {}).length;
        document.getElementById('status-counts').textContent =
            `Правок: ${modObj + modLgt + gpCount} · Добавлено: ${addObj + addLgt}`;
    }

    _updateInspector() {
        const empty = document.getElementById('inspector-empty');
        const content = document.getElementById('inspector-content');
        const title = document.getElementById('inspector-title');
        const badge = document.getElementById('inspector-type');
        const multiBanner = document.getElementById('multi-selection-banner');

        if (!this.selected) {
            empty.classList.remove('hidden');
            content.classList.add('hidden');
            title.textContent = 'Инспектор';
            badge.classList.add('hidden');
            multiBanner?.classList.add('hidden');
            document.getElementById('sec-all-positions')?.classList.add('hidden');
            return;
        }

        empty.classList.add('hidden');
        content.classList.remove('hidden');
        badge.classList.remove('hidden');

        const isObjLike = this.selected.kind === 'object' || this.selected.kind === 'multi';
        document.getElementById('sec-object').classList.toggle('hidden', !isObjLike);
        document.getElementById('sec-light').classList.toggle('hidden', this.selected.kind !== 'light');
        document.getElementById('sec-marker').classList.toggle('hidden',
            this.selected.kind !== 'spawn' && this.selected.kind !== 'hiding' && this.selected.kind !== 'waypoint'
        );

        const canDup = isObjLike || this.selected.kind === 'light' || this.selected.kind === 'waypoint';
        const canDel = canDup;
        document.getElementById('btn-dup').disabled = !canDup;
        document.getElementById('btn-del-obj').disabled = !canDel;

        if (multiBanner) {
            if (this.selected.kind === 'multi') {
                multiBanner.classList.remove('hidden');
                multiBanner.textContent = `Выбрано объектов: ${this.selectedObjects.length} — общий перенос, пол, копирование и пакетные свойства`;
            } else {
                multiBanner.classList.add('hidden');
            }
        }

        const grpBtn = document.getElementById('btn-select-group');
        if (this.selected.kind === 'object' && this.selected.obj.userData.groupId) {
            grpBtn.classList.remove('hidden');
            grpBtn.textContent = `◫ Выделить группу: ${GROUP_LABELS[this.selected.obj.userData.groupId] || this.selected.obj.userData.groupId}`;
        } else {
            grpBtn.classList.add('hidden');
        }

        if (this.selected.kind === 'multi') {
            title.textContent = `Объектов: ${this.selectedObjects.length}`;
            badge.textContent = 'Мульти';
        } else if (this.selected.kind === 'object') {
            const obj = this.selected.obj;
            title.textContent = obj.name;
            badge.textContent = CATEGORY_LABELS[obj.userData.category] || 'Объект';
        } else if (this.selected.kind === 'light') {
            title.textContent = this.selected.light.userData.label;
            badge.textContent = 'PointLight';
        } else if (this.selected.kind === 'spawn') {
            title.textContent = 'Спавн игрока';
            badge.textContent = 'Старт';
        } else if (this.selected.kind === 'hiding') {
            title.textContent = this.selected.spot.label;
            badge.textContent = 'Прятка';
        } else if (this.selected.kind === 'waypoint') {
            title.textContent = `Точка пути #${this.selected.index + 1}`;
            badge.textContent = 'Маршрут';
        }

        this._renderAllPositionsPanel();
        this._updateInspectorValuesOnly();
    }

    _updateInspectorValuesOnly() {
        if (!this.selected) return;

        if (this.selected.kind === 'multi') {
            const objs = this._getActiveTransformObjects();
            if (objs.length === 0) return;

            const center = new THREE.Vector3();
            const wp = new THREE.Vector3();
            for (const o of objs) {
                o.updateWorldMatrix(true, false);
                o.getWorldPosition(wp);
                center.add(wp);
            }
            center.divideScalar(objs.length);

            document.getElementById('prop-name').value = `[Выбрано: ${objs.length}]`;
            const visEl = document.getElementById('prop-visible');
            const allVis = objs.every(o => (o.userData.logicalVisible !== undefined ? o.userData.logicalVisible : o.visible));
            const anyVis = objs.some(o => (o.userData.logicalVisible !== undefined ? o.userData.logicalVisible : o.visible));
            visEl.checked = allVis;
            visEl.indeterminate = anyVis && !allVis;

            document.getElementById('pos-x').value = round3(center.x);
            document.getElementById('pos-y').value = round3(center.y);
            document.getElementById('pos-z').value = round3(center.z);
            document.getElementById('rot-x').value = 0;
            document.getElementById('rot-y').value = 0;
            document.getElementById('rot-z').value = 0;
            document.getElementById('row-boxsize').classList.add('hidden');
            document.getElementById('scale-x').value = 1;
            document.getElementById('scale-y').value = 1;
            document.getElementById('scale-z').value = 1;

            const anyGO = objs.some(o => !!o.userData.gameObject);
            document.getElementById('wrap-collide').classList.toggle('hidden', !anyGO);
            document.getElementById('prop-collide').checked = objs.every(o => !!o.userData.collide);
            document.getElementById('prop-blocker').checked = objs.every(o => o.userData.blocker !== false);
            document.getElementById('prop-cast-shadow').checked = objs.every(o => !!o.userData.castShadow);
            document.getElementById('prop-receive-shadow').checked = objs.every(o => o.userData.receiveShadow !== false);
            document.getElementById('sec-custom-collider').classList.add('hidden');

            const firstObj = objs[0];
            let activeMesh = firstObj.userData.primaryMesh || (firstObj.isMesh ? firstObj : null);
            if (!activeMesh) firstObj.traverse(c => { if (!activeMesh && c.isMesh) activeMesh = c; });
            document.getElementById('sec-material').classList.toggle('hidden', !activeMesh);
            if (activeMesh && activeMesh.material) {
                const m = activeMesh.material;
                document.getElementById('mat-key').value = firstObj.userData.materialKey || 'custom';
                document.getElementById('mat-color').value = m.color ? hexIntToCss(m.color.getHex()) : '#ffffff';
                document.getElementById('mat-emissive').value = m.emissive ? hexIntToCss(m.emissive.getHex()) : '#000000';
                const rough = m.roughness !== undefined ? m.roughness : 0.9;
                const metal = m.metalness !== undefined ? m.metalness : 0.05;
                const opac = m.opacity !== undefined ? m.opacity : 1.0;
                document.getElementById('mat-roughness').value = rough;
                document.getElementById('val-roughness').textContent = rough.toFixed(2);
                document.getElementById('mat-metalness').value = metal;
                document.getElementById('val-metalness').textContent = metal.toFixed(2);
                document.getElementById('mat-opacity').value = opac;
                document.getElementById('val-opacity').textContent = opac.toFixed(2);
                document.getElementById('mat-repeat-x').value = round3(m.map?.repeat?.x ?? 1);
                document.getElementById('mat-repeat-y').value = round3(m.map?.repeat?.y ?? 1);
            }
            return;
        }

        if (this.selected.kind === 'object') {
            const obj = this.selected.obj;
            const visEl = document.getElementById('prop-visible');
            visEl.indeterminate = false;
            visEl.checked = obj.userData.logicalVisible !== undefined ? obj.userData.logicalVisible : obj.visible;
            document.getElementById('prop-name').value = obj.name;
            document.getElementById('pos-x').value = round3(obj.position.x);
            document.getElementById('pos-y').value = round3(obj.position.y);
            document.getElementById('pos-z').value = round3(obj.position.z);
            document.getElementById('rot-x').value = Math.round(radToDeg(obj.rotation.x) * 10) / 10;
            document.getElementById('rot-y').value = Math.round(radToDeg(obj.rotation.y) * 10) / 10;
            document.getElementById('rot-z').value = Math.round(radToDeg(obj.rotation.z) * 10) / 10;

            const isPrim = this._isSinglePrimitiveEditable(obj) && !!obj.userData.boxSize;
            document.getElementById('row-boxsize').classList.toggle('hidden', !isPrim);
            if (isPrim) {
                document.getElementById('box-w').value = round3(obj.userData.boxSize[0]);
                document.getElementById('box-h').value = round3(obj.userData.boxSize[1]);
                document.getElementById('box-d').value = round3(obj.userData.boxSize[2]);
            }
            document.getElementById('scale-x').value = round3(obj.scale.x);
            document.getElementById('scale-y').value = round3(obj.scale.y);
            document.getElementById('scale-z').value = round3(obj.scale.z);

            const hasGO = !!obj.userData.gameObject;
            document.getElementById('wrap-collide').classList.toggle('hidden', !hasGO);
            document.getElementById('prop-collide').checked = !!obj.userData.collide;
            document.getElementById('prop-blocker').checked = obj.userData.blocker !== false;
            document.getElementById('prop-cast-shadow').checked = !!obj.userData.castShadow;
            document.getElementById('prop-receive-shadow').checked = obj.userData.receiveShadow !== false;

            const col = obj.userData.gameObject?.getComponent(BoxCollider);
            const secCol = document.getElementById('sec-custom-collider');
            secCol.classList.toggle('hidden', !(col && col.enabled));
            if (col && col.enabled) {
                document.getElementById('col-w').value = round3(col.size.x);
                document.getElementById('col-h').value = round3(col.size.y);
                document.getElementById('col-d').value = round3(col.size.z);
                document.getElementById('col-ox').value = round3(col.offset.x);
                document.getElementById('col-oy').value = round3(col.offset.y);
                document.getElementById('col-oz').value = round3(col.offset.z);
            }

            const mesh = obj.userData.primaryMesh || (obj.isMesh ? obj : null);
            let activeMesh = mesh;
            if (!activeMesh) obj.traverse(c => { if (!activeMesh && c.isMesh) activeMesh = c; });
            const secMat = document.getElementById('sec-material');
            secMat.classList.toggle('hidden', !activeMesh);
            if (activeMesh && activeMesh.material) {
                const m = activeMesh.material;
                document.getElementById('mat-key').value = obj.userData.materialKey || 'custom';
                document.getElementById('mat-color').value = m.color ? hexIntToCss(m.color.getHex()) : '#ffffff';
                document.getElementById('mat-emissive').value = m.emissive ? hexIntToCss(m.emissive.getHex()) : '#000000';
                const rough = m.roughness !== undefined ? m.roughness : 0.9;
                const metal = m.metalness !== undefined ? m.metalness : 0.05;
                const opac = m.opacity !== undefined ? m.opacity : 1.0;
                document.getElementById('mat-roughness').value = rough;
                document.getElementById('val-roughness').textContent = rough.toFixed(2);
                document.getElementById('mat-metalness').value = metal;
                document.getElementById('val-metalness').textContent = metal.toFixed(2);
                document.getElementById('mat-opacity').value = opac;
                document.getElementById('val-opacity').textContent = opac.toFixed(2);
                document.getElementById('mat-repeat-x').value = round3(m.map?.repeat?.x ?? 1);
                document.getElementById('mat-repeat-y').value = round3(m.map?.repeat?.y ?? 1);
            }
        } else if (this.selected.kind === 'light') {
            const l = this.selected.light;
            document.getElementById('light-label').value = l.userData.label || l.userData.lightKey;
            document.getElementById('light-visible').checked = l.visible;
            document.getElementById('lpos-x').value = round3(l.position.x);
            document.getElementById('lpos-y').value = round3(l.position.y);
            document.getElementById('lpos-z').value = round3(l.position.z);
            document.getElementById('light-color').value = hexIntToCss(l.color.getHex());
            document.getElementById('light-intensity').value = round3(l.intensity);
            document.getElementById('light-distance').value = round3(l.distance ?? 0);
            document.getElementById('light-decay').value = round3(l.decay ?? 1);
        } else {
            document.getElementById('marker-spawn-fields').classList.toggle('hidden', this.selected.kind !== 'spawn');
            document.getElementById('marker-hiding-fields').classList.toggle('hidden', this.selected.kind !== 'hiding');
            document.getElementById('marker-waypoint-fields').classList.toggle('hidden', this.selected.kind !== 'waypoint');

            if (this.selected.kind === 'spawn') {
                const sp = this.world.playerSpawn;
                document.getElementById('mpos-x').value = round3(sp.position.x);
                document.getElementById('mpos-y').value = round3(sp.position.y);
                document.getElementById('mpos-z').value = round3(sp.position.z);
                document.getElementById('spawn-yaw').value = Math.round(radToDeg(sp.yaw) * 10) / 10;
                document.getElementById('spawn-pitch').value = Math.round(radToDeg(sp.pitch) * 10) / 10;
            } else if (this.selected.kind === 'hiding') {
                const spot = this.selected.spot;
                document.getElementById('hide-x').value = round3(spot.hidePos.x);
                document.getElementById('hide-y').value = round3(spot.hidePos.y);
                document.getElementById('hide-z').value = round3(spot.hidePos.z);
                document.getElementById('peek-x').value = round3(spot.peekPos.x);
                document.getElementById('peek-y').value = round3(spot.peekPos.y);
                document.getElementById('peek-z').value = round3(spot.peekPos.z);
                document.getElementById('hide-yaw').value = Math.round(radToDeg(spot.lookYaw) * 10) / 10;
                document.getElementById('btn-edit-hidepos').classList.toggle('active', this.hideSubTarget === 'hide');
                document.getElementById('btn-edit-peekpos').classList.toggle('active', this.hideSubTarget === 'peek');
            } else if (this.selected.kind === 'waypoint') {
                const wp = this.world.patrolWaypoints[this.selected.index];
                if (wp) {
                    document.getElementById('wpos-x').value = round3(wp.x);
                    document.getElementById('wpos-y').value = round3(wp.y);
                    document.getElementById('wpos-z').value = round3(wp.z);
                }
            }
        }
        this._updateAllPositionsValues();
    }

    _makeObjectPoseEntry(objName, label, badge, opts = {}) {
        const obj = this.builder._editableByName.get(objName);
        if (!obj || obj.userData?.deleted) return null;
        const extraActions = [];
        if (obj.userData?.setOpenState && obj.userData?.isOpen) {
            extraActions.push(
                {
                    label: '🔒 Закр.',
                    active: !obj.userData.isOpen(),
                    onClick: () => {
                        obj.userData.setOpenState(false);
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspector();
                    }
                },
                {
                    label: '🔓 Откр.',
                    active: !!obj.userData.isOpen(),
                    onClick: () => {
                        obj.userData.setOpenState(true);
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspector();
                    }
                }
            );
        }
        if (Array.isArray(opts.extraActions)) {
            extraActions.push(...opts.extraActions);
        }
        const hasOpenAngle = !!(obj.userData?.getOpenAngle && obj.userData?.setOpenAngle);
        return {
            id: `obj_${objName}`,
            label,
            badge: badge || objName,
            isActive: () => this.selected?.kind === 'object' && this.selected.obj === obj && (!opts.checkActive || opts.checkActive()),
            onSelect: () => {
                if (opts.beforeSelect) opts.beforeSelect();
                this.selectEntity({ kind: 'object', obj });
            },
            getPos: () => vecArr(obj.position),
            setPos: (x, y, z) => {
                this._pushUndo();
                obj.position.set(x, y, z);
                this._syncSingleObjectLiveEffects(obj);
                this._syncObjectToOverrides(obj);
                this._attachGizmoToSelection();
                this._rebuildHelperVisuals();
                this._refreshHierarchy();
                this._updateInspectorValuesOnly();
                this._updateStatusCounts();
            },
            getRotDeg: () => [
                Math.round(radToDeg(obj.rotation.x) * 10) / 10,
                Math.round(radToDeg(obj.rotation.y) * 10) / 10,
                Math.round(radToDeg(obj.rotation.z) * 10) / 10
            ],
            setRotDeg: (rx, ry, rz) => {
                this._pushUndo();
                obj.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                this._syncSingleObjectLiveEffects(obj);
                this._syncObjectToOverrides(obj);
                this._attachGizmoToSelection();
                this._rebuildHelperVisuals();
                this._refreshHierarchy();
                this._updateInspectorValuesOnly();
                this._updateStatusCounts();
            },
            angleLabel: hasOpenAngle ? 'Угол откр. (°)' : null,
            getAngleDeg: hasOpenAngle ? () => Math.round(radToDeg(obj.userData.getOpenAngle()) * 10) / 10 : null,
            setAngleDeg: hasOpenAngle ? (deg) => {
                this._pushUndo();
                obj.userData.setOpenAngle(degToRad(deg));
                this._syncGameplayToOverrides();
                this._updateSelectionOutline();
                this._updateInspectorValuesOnly();
                this._updateStatusCounts();
            } : null,
            extraActions
        };
    }

    _buildPoseEntriesForSelection() {
        if (!this.selected) return { title: 'Все позиции элемента', poses: [], subParts: [], groupMembers: [], rootObj: null };

        const poses = [];
        let title = 'Все позиции элемента';
        let rootObj = null;

        const addObjPose = (name, label, badge, opts = {}) => {
            const entry = this._makeObjectPoseEntry(name, label, badge, opts);
            if (entry) poses.push(entry);
        };

        const selObj = this.selected.kind === 'object' ? this.selected.obj : null;
        if (selObj) {
            const parentName = selObj.userData?.parentEditableName;
            rootObj = parentName ? (this.builder._editableByName.get(parentName) || selObj) : selObj;
        }
        const keyName = rootObj ? rootObj.name : null;

        // 1. Folding Table & Tablecloth family (Balcony -> Hall -> Highlight Zone -> Wardrobe Tablecloth -> Wrecked Act IV)
        const tableFamily = new Set([
            'FoldingTable', 'TablePlacementZone', 'WreckedTable',
            'TableWingL', 'TableWingR', 'TableLegL', 'TableLegR',
            'WardrobeTablecloth', 'Tablecloth',
            'WreckedTable_Body', 'WreckedTable_Pedestal', 'WreckedTable_Wing', 'WreckedTable_Cloth', 'WreckedTable_Tinsel'
        ]);
        if (keyName && tableFamily.has(keyName) && this.world.table) {
            title = 'Позиции стола-книжки';
            const foldingObj = this.builder._editableByName.get('FoldingTable');
            poses.push({
                id: 'table_balcony',
                label: '1. На балконе (Сложен, старт)',
                badge: 'Балкон',
                isActive: () => this.selected?.kind === 'object' && this.selected.obj === foldingObj && !this.tableSetPreview && !this.act4Preview,
                onSelect: () => {
                    if (this.act4Preview) this.setAct4Preview(false);
                    if (this.tableSetPreview) this.setTableSetPreview(false);
                    if (foldingObj) this.selectEntity({ kind: 'object', obj: foldingObj });
                },
                getPos: () => vecArr(this.world.table.balconyPos),
                setPos: (x, y, z) => {
                    this._pushUndo();
                    this.world.table.balconyPos.set(x, y, z);
                    if (foldingObj && !this.tableSetPreview && !this.act4Preview) {
                        foldingObj.position.set(x, y, z);
                        this._syncObjectToOverrides(foldingObj);
                    } else {
                        this._syncGameplayToOverrides();
                    }
                    this._attachGizmoToSelection();
                    this._updateSelectionOutline();
                    this._updateInspectorValuesOnly();
                    this._updateStatusCounts();
                },
                getRotDeg: () => [
                    Math.round(radToDeg(this.world.table.balconyRot.x) * 10) / 10,
                    Math.round(radToDeg(this.world.table.balconyRot.y) * 10) / 10,
                    Math.round(radToDeg(this.world.table.balconyRot.z) * 10) / 10
                ],
                setRotDeg: (rx, ry, rz) => {
                    this._pushUndo();
                    this.world.table.balconyRot.set(degToRad(rx), degToRad(ry), degToRad(rz));
                    if (foldingObj && !this.tableSetPreview && !this.act4Preview) {
                        foldingObj.rotation.copy(this.world.table.balconyRot);
                        this._syncObjectToOverrides(foldingObj);
                    } else {
                        this._syncGameplayToOverrides();
                    }
                    this._attachGizmoToSelection();
                    this._updateSelectionOutline();
                    this._updateInspectorValuesOnly();
                    this._updateStatusCounts();
                }
            });

            poses.push({
                id: 'table_hall',
                label: '2. В зале (Разложен перед ТВ)',
                badge: 'Зал (Акт I)',
                isActive: () => this.selected?.kind === 'object' && this.selected.obj === foldingObj && this.tableSetPreview && !this.act4Preview,
                onSelect: () => {
                    if (this.act4Preview) this.setAct4Preview(false);
                    if (!this.tableSetPreview) this.setTableSetPreview(true);
                    if (foldingObj) this.selectEntity({ kind: 'object', obj: foldingObj });
                },
                getPos: () => vecArr(this.world.table.hallPos),
                setPos: (x, y, z) => {
                    this._pushUndo();
                    this.world.table.hallPos.set(x, y, z);
                    if (foldingObj && this.tableSetPreview && !this.act4Preview) {
                        foldingObj.position.set(x, y, z);
                    }
                    this._syncGameplayToOverrides();
                    this._attachGizmoToSelection();
                    this._updateSelectionOutline();
                    this._updateInspectorValuesOnly();
                    this._updateStatusCounts();
                },
                getRotDeg: () => [
                    Math.round(radToDeg(this.world.table.hallRot.x) * 10) / 10,
                    Math.round(radToDeg(this.world.table.hallRot.y) * 10) / 10,
                    Math.round(radToDeg(this.world.table.hallRot.z) * 10) / 10
                ],
                setRotDeg: (rx, ry, rz) => {
                    this._pushUndo();
                    this.world.table.hallRot.set(degToRad(rx), degToRad(ry), degToRad(rz));
                    if (foldingObj && this.tableSetPreview && !this.act4Preview) {
                        foldingObj.rotation.copy(this.world.table.hallRot);
                    }
                    this._syncGameplayToOverrides();
                    this._attachGizmoToSelection();
                    this._updateSelectionOutline();
                    this._updateInspectorValuesOnly();
                    this._updateStatusCounts();
                },
                extraActions: [
                    {
                        label: '⇄ Зону сюда',
                        onClick: () => {
                            const zObj = this.builder._editableByName.get('TablePlacementZone');
                            if (!zObj) return;
                            this._pushUndo();
                            zObj.position.copy(this.world.table.hallPos);
                            zObj.rotation.copy(this.world.table.hallRot);
                            this._syncObjectToOverrides(zObj);
                            this._updateInspectorValuesOnly();
                            this._updateStatusCounts();
                            this._showToast('Зона подсветки стола выровнена по столу в зале');
                        }
                    }
                ]
            });

            addObjPose('TablePlacementZone', '3. Зона подсветки стола на полу', 'Подсветка');
            addObjPose('WreckedTable', '4. Разгромленный стол (Акт IV)', 'Акт IV', {
                beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); }
            });
            addObjPose('TableWingL', '5. Левая створка стола (Лок.)', 'Деталь');
            addObjPose('TableWingR', '6. Правая створка стола (Лок.)', 'Деталь');
            addObjPose('TableLegL', '7. Левая раскладная ножка (Лок.)', 'Ножка L');
            addObjPose('TableLegR', '8. Правая раскладная ножка (Лок.)', 'Ножка R');
            addObjPose('WardrobeTablecloth', '9. Скатерть в шкафу прихожей (Старт)', 'В шкафу', {
                beforeSelect: () => { if (!this.openDoorsPreview) this.setOpenDoorsPreview(true); }
            });
            addObjPose('Tablecloth', '10. Скатерть на столе (Лок.)', 'На столе');
        }

        // 2. Stool family (Kitchen -> Hall -> Highlight Zone)
        const stoolFamily = new Set(['KitchenStool', 'PlacedHallStool', 'StoolPlacementZone']);
        if (keyName && stoolFamily.has(keyName)) {
            title = 'Позиции табуретки';
            addObjPose('KitchenStool', '1. На кухне у столика (Старт)', 'Кухня');
            addObjPose('PlacedHallStool', '2. В зале у стола (Поставлена)', 'Зал', {
                beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); },
                extraActions: [
                    {
                        label: '⇄ Зону сюда',
                        onClick: () => {
                            const sObj = this.builder._editableByName.get('PlacedHallStool');
                            const zObj = this.builder._editableByName.get('StoolPlacementZone');
                            if (!sObj || !zObj) return;
                            this._pushUndo();
                            zObj.position.copy(sObj.position);
                            zObj.rotation.copy(sObj.rotation);
                            this._syncObjectToOverrides(zObj);
                            this._updateInspectorValuesOnly();
                            this._updateStatusCounts();
                            this._showToast('Зона подсветки табуретки выровнена');
                        }
                    }
                ]
            });
            addObjPose('StoolPlacementZone', '3. Зона подсветки табуретки', 'Подсветка');
        }

        // 3. Front Door family (Intact -> Destroyed Act IV -> Claw Decal -> Escape Zone)
        const frontDoorFamily = new Set(['FrontDoor', 'FrontDoor_ClawDecal', 'EntranceEscapeZone']);
        if (keyName && frontDoorFamily.has(keyName)) {
            title = 'Позиции входной двери';
            const fdObj = this.builder._editableByName.get('FrontDoor');
            if (fdObj) {
                const getIntactFD = () => {
                    if (this.act4Preview && this._savedIntactPoses?.frontDoor) {
                        return this._savedIntactPoses.frontDoor;
                    }
                    return { position: fdObj.position, rotation: fdObj.rotation };
                };
                poses.push({
                    id: 'frontdoor_intact',
                    label: '1. Целая дверь в проёме (Акт I–III)',
                    badge: 'Целая',
                    isActive: () => this.selected?.kind === 'object' && this.selected.obj === fdObj && !this.act4Preview,
                    onSelect: () => {
                        if (this.act4Preview) this.setAct4Preview(false);
                        this.selectEntity({ kind: 'object', obj: fdObj });
                    },
                    getPos: () => vecArr(getIntactFD().position),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        if (this.act4Preview) {
                            if (this._savedIntactPoses?.frontDoor) this._savedIntactPoses.frontDoor.position.set(x, y, z);
                            const patch = this.overrides.modifiedObjects.FrontDoor || {};
                            patch.position = [round3(x), round3(y), round3(z)];
                            this.overrides.modifiedObjects.FrontDoor = patch;
                            saveOverridesToLocalStorage(this.overrides);
                        } else {
                            fdObj.position.set(x, y, z);
                            this._syncObjectToOverrides(fdObj);
                        }
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    },
                    getRotDeg: () => {
                        const r = getIntactFD().rotation;
                        return [
                            Math.round(radToDeg(r.x) * 10) / 10,
                            Math.round(radToDeg(r.y) * 10) / 10,
                            Math.round(radToDeg(r.z) * 10) / 10
                        ];
                    },
                    setRotDeg: (rx, ry, rz) => {
                        this._pushUndo();
                        if (this.act4Preview) {
                            if (this._savedIntactPoses?.frontDoor) {
                                this._savedIntactPoses.frontDoor.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                            }
                            const patch = this.overrides.modifiedObjects.FrontDoor || {};
                            patch.rotation = [round3(degToRad(rx)), round3(degToRad(ry)), round3(degToRad(rz))];
                            this.overrides.modifiedObjects.FrontDoor = patch;
                            saveOverridesToLocalStorage(this.overrides);
                        } else {
                            fdObj.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                            this._syncObjectToOverrides(fdObj);
                        }
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });

                poses.push({
                    id: 'frontdoor_act4',
                    label: '2. Выбита маньяком на полу (Акт IV)',
                    badge: 'Акт IV',
                    isActive: () => this.selected?.kind === 'object' && this.selected.obj === fdObj && this.act4Preview,
                    onSelect: () => {
                        if (!this.act4Preview) this.setAct4Preview(true);
                        this.selectEntity({ kind: 'object', obj: fdObj });
                    },
                    getPos: () => vecArr(this.world.destroyedPoses.frontDoor.position),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        this.world.destroyedPoses.frontDoor.position.set(x, y, z);
                        if (this.act4Preview) fdObj.position.set(x, y, z);
                        this._syncGameplayToOverrides();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    },
                    getRotDeg: () => {
                        const r = this.world.destroyedPoses.frontDoor.rotation;
                        return [
                            Math.round(radToDeg(r.x) * 10) / 10,
                            Math.round(radToDeg(r.y) * 10) / 10,
                            Math.round(radToDeg(r.z) * 10) / 10
                        ];
                    },
                    setRotDeg: (rx, ry, rz) => {
                        this._pushUndo();
                        this.world.destroyedPoses.frontDoor.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                        if (this.act4Preview) fdObj.rotation.copy(this.world.destroyedPoses.frontDoor.rotation);
                        this._syncGameplayToOverrides();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });
            }
            addObjPose('FrontDoor_ClawDecal', '3. Следы когтей на двери (Лок.)', 'Деталь');
            addObjPose('EntranceEscapeZone', '4. Зона триггера побега в подъезд', 'Триггер');
        }

        // 4. Christmas Tree family (Standing -> Fallen Act IV -> TornGarland -> BrokenBaubles -> FallenSantaHat)
        const treeFamily = new Set(['ChristmasTree', 'TornGarland', 'BrokenBaubles', 'FallenSantaHat']);
        if (keyName && treeFamily.has(keyName)) {
            title = 'Позиции новогодней ёлки';
            const trObj = this.builder._editableByName.get('ChristmasTree');
            if (trObj) {
                const getIntactTree = () => {
                    if (this.act4Preview && this._savedIntactPoses?.tree) {
                        return this._savedIntactPoses.tree;
                    }
                    return { position: trObj.position, rotation: trObj.rotation };
                };
                poses.push({
                    id: 'tree_intact',
                    label: '1. Стоит в углу зала (Акт I–III)',
                    badge: 'Целая',
                    isActive: () => this.selected?.kind === 'object' && this.selected.obj === trObj && !this.act4Preview,
                    onSelect: () => {
                        if (this.act4Preview) this.setAct4Preview(false);
                        this.selectEntity({ kind: 'object', obj: trObj });
                    },
                    getPos: () => vecArr(getIntactTree().position),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        if (this.act4Preview) {
                            if (this._savedIntactPoses?.tree) this._savedIntactPoses.tree.position.set(x, y, z);
                            const patch = this.overrides.modifiedObjects.ChristmasTree || {};
                            patch.position = [round3(x), round3(y), round3(z)];
                            this.overrides.modifiedObjects.ChristmasTree = patch;
                            saveOverridesToLocalStorage(this.overrides);
                        } else {
                            trObj.position.set(x, y, z);
                            this._syncObjectToOverrides(trObj);
                        }
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    },
                    getRotDeg: () => {
                        const r = getIntactTree().rotation;
                        return [
                            Math.round(radToDeg(r.x) * 10) / 10,
                            Math.round(radToDeg(r.y) * 10) / 10,
                            Math.round(radToDeg(r.z) * 10) / 10
                        ];
                    },
                    setRotDeg: (rx, ry, rz) => {
                        this._pushUndo();
                        if (this.act4Preview) {
                            if (this._savedIntactPoses?.tree) {
                                this._savedIntactPoses.tree.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                            }
                            const patch = this.overrides.modifiedObjects.ChristmasTree || {};
                            patch.rotation = [round3(degToRad(rx)), round3(degToRad(ry)), round3(degToRad(rz))];
                            this.overrides.modifiedObjects.ChristmasTree = patch;
                            saveOverridesToLocalStorage(this.overrides);
                        } else {
                            trObj.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                            this._syncObjectToOverrides(trObj);
                        }
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });

                poses.push({
                    id: 'tree_act4',
                    label: '2. Повалена на пол (Акт IV)',
                    badge: 'Акт IV',
                    isActive: () => this.selected?.kind === 'object' && this.selected.obj === trObj && this.act4Preview,
                    onSelect: () => {
                        if (!this.act4Preview) this.setAct4Preview(true);
                        this.selectEntity({ kind: 'object', obj: trObj });
                    },
                    getPos: () => vecArr(this.world.destroyedPoses.tree.position),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        this.world.destroyedPoses.tree.position.set(x, y, z);
                        if (this.act4Preview) trObj.position.set(x, y, z);
                        this._syncGameplayToOverrides();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    },
                    getRotDeg: () => {
                        const r = this.world.destroyedPoses.tree.rotation;
                        return [
                            Math.round(radToDeg(r.x) * 10) / 10,
                            Math.round(radToDeg(r.y) * 10) / 10,
                            Math.round(radToDeg(r.z) * 10) / 10
                        ];
                    },
                    setRotDeg: (rx, ry, rz) => {
                        this._pushUndo();
                        this.world.destroyedPoses.tree.rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                        if (this.act4Preview) trObj.rotation.copy(this.world.destroyedPoses.tree.rotation);
                        this._syncGameplayToOverrides();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });
            }
            addObjPose('TornGarland', '3. Сорванная гирлянда (Акт IV)', 'Акт IV', {
                beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); }
            });
            addObjPose('BrokenBaubles', '4. Разбитые игрушки (Акт IV)', 'Акт IV', {
                beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); }
            });
            addObjPose('FallenSantaHat', '5. Упавший колпак Санты (Акт IV)', 'Акт IV', {
                beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); }
            });
        }

        // 5. Pickup & Table Food Items families
        const pickupFamilies = [
            {
                title: 'Позиции хрустальных бокалов',
                keys: new Set(['SideboardCrystal', 'TableItem_Crystal', 'TableItem_Crystal_0', 'TableItem_Crystal_1', 'TableItem_Crystal_2', 'WreckedTable_Shards']),
                items: [
                    ['SideboardCrystal', '1. В серванте (Старт)', 'Сервант', {}],
                    ['TableItem_Crystal', '2. На столе — группа (Лок.)', 'На столе', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['TableItem_Crystal_0', '3. На столе — Бокал #1 (Лок.)', 'Бокал 1', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['TableItem_Crystal_1', '4. На столе — Бокал #2 (Лок.)', 'Бокал 2', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['TableItem_Crystal_2', '5. На столе — Бокал #3 (Лок.)', 'Бокал 3', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['WreckedTable_Shards', '6. Осколки на полу (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            },
            {
                title: 'Позиции банок с соленьями',
                keys: new Set(['PantryPicklesJar', 'TableItem_Pickles', 'PantryJar_0', 'PantryJar_1', 'PantryJar_2', 'PantryJar_3', 'PantryJar_4']),
                items: [
                    ['PantryPicklesJar', '1. В кладовке — активная банка (Старт)', 'Кладовка', {}],
                    ['TableItem_Pickles', '2. На накрытом столе (Лок.)', 'На столе', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['PantryJar_0', '3. Кладовка: верхняя полка #1', 'Полка 2', {}],
                    ['PantryJar_1', '4. Кладовка: верхняя полка #2', 'Полка 2', {}],
                    ['PantryJar_2', '5. Кладовка: верхняя полка #3', 'Полка 2', {}],
                    ['PantryJar_3', '6. Кладовка: нижняя полка #1', 'Полка 1', {}],
                    ['PantryJar_4', '7. Кладовка: нижняя полка #2', 'Полка 1', {}]
                ]
            },
            {
                title: 'Позиции салата Оливье',
                keys: new Set(['FridgeOlivier', 'TableItem_Olivier', 'WreckedTable_Olivier']),
                items: [
                    ['FridgeOlivier', '1. В холодильнике (Старт)', 'Холодильник', { beforeSelect: () => { if (!this.openDoorsPreview) this.setOpenDoorsPreview(true); } }],
                    ['TableItem_Olivier', '2. На накрытом столе (Лок.)', 'На столе', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['WreckedTable_Olivier', '3. Разлит на полу (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            },
            {
                title: 'Позиции мясной нарезки',
                keys: new Set(['FridgeMeat', 'TableItem_Meat', 'WreckedTable_Plate']),
                items: [
                    ['FridgeMeat', '1. В холодильнике (Старт)', 'Холодильник', { beforeSelect: () => { if (!this.openDoorsPreview) this.setOpenDoorsPreview(true); } }],
                    ['TableItem_Meat', '2. На накрытом столе (Лок.)', 'На столе', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['WreckedTable_Plate', '3. Разбитая тарелка (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            },
            {
                title: 'Позиции запечённой курицы',
                keys: new Set(['OvenChicken', 'TableItem_Chicken', 'WreckedTable_Chicken']),
                items: [
                    ['OvenChicken', '1. В духовке плиты (Старт)', 'Духовка', { beforeSelect: () => { if (!this.openDoorsPreview) this.setOpenDoorsPreview(true); } }],
                    ['TableItem_Chicken', '2. На накрытом столе (Лок.)', 'На столе', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['WreckedTable_Chicken', '3. На полу после разгрома (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            },
            {
                title: 'Позиции шампанского',
                keys: new Set(['BalconyChampagne', 'TableItem_Champagne', 'WreckedTable_Champagne']),
                items: [
                    ['BalconyChampagne', '1. В снегу на балконе (Старт)', 'Балкон', {}],
                    ['TableItem_Champagne', '2. На накрытом столе (Лок.)', 'На столе', { beforeSelect: () => { if (!this.tableSetPreview) this.setTableSetPreview(true); } }],
                    ['WreckedTable_Champagne', '3. На полу после разгрома (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            },
            {
                title: 'Позиции новогодней мишуры и декора',
                keys: new Set(['DecorBox', 'DecorSpot_Hall', 'Decor_Hall', 'DecorSpot_Kitchen', 'Decor_Kitchen', 'DecorSpot_Hallway', 'Decor_Hallway']),
                items: [
                    ['DecorBox', '1. Коробка с мишурой в прихожей (Старт)', 'Коробка', {}],
                    ['DecorSpot_Hall', '2. Зал: Зона развешивания (Триггер)', 'Зал (Триггер)', {}],
                    ['Decor_Hall', '3. Зал: Развешанная мишура и снежинки', 'Зал (Декор)', {}],
                    ['DecorSpot_Kitchen', '4. Кухня: Зона развешивания (Триггер)', 'Кухня (Триггер)', {}],
                    ['Decor_Kitchen', '5. Кухня: Развешанная мишура', 'Кухня (Декор)', {}],
                    ['DecorSpot_Hallway', '6. Прихожая: Зона развешивания (Триггер)', 'Прих. (Триггер)', {}],
                    ['Decor_Hallway', '7. Прихожая: Венок и мишура', 'Прих. (Декор)', {}]
                ]
            },
            {
                title: 'Позиции рождественской омелы',
                keys: new Set(['Mistletoe_Hanging', 'Mistletoe_Trampled']),
                items: [
                    ['Mistletoe_Hanging', '1. Висит над дверным проёмом (Акт I–III)', 'Висит', {}],
                    ['Mistletoe_Trampled', '2. Растоптана на полу (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            },
            {
                title: 'Позиции зеркала серванта',
                keys: new Set(['SideboardMirror', 'FallenMirror']),
                items: [
                    ['SideboardMirror', '1. Зеркало на серванте (Акт I–III)', 'Сервант', {}],
                    ['FallenMirror', '2. Разбитое зеркало на полу (Акт IV)', 'Акт IV', { beforeSelect: () => { if (!this.act4Preview) this.setAct4Preview(true); } }]
                ]
            }
        ];

        for (const fam of pickupFamilies) {
            if (keyName && fam.keys.has(keyName)) {
                title = fam.title;
                for (const [oName, oLabel, oBadge, oOpts] of fam.items) {
                    addObjPose(oName, oLabel, oBadge, oOpts);
                }
                break;
            }
        }

        // 6. Hiding Spots family (Trigger + Door/Curtain + Hide Camera Pos + Peek Camera Pos)
        const hidingMap = {
            sofa: { spotId: 'sofa', trigger: 'SofaHideTrigger', door: 'SofaCoverPivot', title: 'Позиции укрытия: Диван' },
            wardrobe: { spotId: 'wardrobe', trigger: 'WardrobeEnter', door: 'WardrobeDoor', title: 'Позиции укрытия: Шкаф' },
            pantry: { spotId: 'pantry', trigger: 'PantryHideTrig', door: 'PantryDoor', title: 'Позиции укрытия: Кладовка' },
            bathroom: { spotId: 'bathroom', trigger: 'ShowerCurtain', door: 'ShowerCurtain', title: 'Позиции укрытия: Шторка в ванной' }
        };
        let activeHideMeta = null;
        if (this.selected.kind === 'hiding' && this.selected.spot) {
            activeHideMeta = hidingMap[this.selected.spot.id] || null;
        } else if (keyName) {
            for (const hm of Object.values(hidingMap)) {
                if (keyName === hm.trigger || keyName === hm.door) {
                    activeHideMeta = hm;
                    break;
                }
            }
        }
        if (activeHideMeta) {
            const spot = this.world.hidingSpots.find(s => s.id === activeHideMeta.spotId);
            if (spot) {
                title = activeHideMeta.title;
                poses.push({
                    id: `hide_in_${spot.id}`,
                    label: '1. Камера: Внутри укрытия (HidePos)',
                    badge: 'Камера',
                    isActive: () => this.selected?.kind === 'hiding' && this.selected.spot.id === spot.id && this.hideSubTarget === 'hide',
                    onSelect: () => {
                        this.hideSubTarget = 'hide';
                        this.selectEntity({ kind: 'hiding', spot, subTarget: 'hide' });
                    },
                    getPos: () => vecArr(spot.hidePos),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        spot.hidePos.set(x, y, z);
                        this._syncGameplayToOverrides();
                        this._rebuildGameplayMarkers();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });
                poses.push({
                    id: `hide_peek_${spot.id}`,
                    label: '2. Камера: Выглядывание (PeekPos)',
                    badge: 'Выгляд.',
                    isActive: () => this.selected?.kind === 'hiding' && this.selected.spot.id === spot.id && this.hideSubTarget === 'peek',
                    onSelect: () => {
                        this.hideSubTarget = 'peek';
                        this.selectEntity({ kind: 'hiding', spot, subTarget: 'peek' });
                    },
                    getPos: () => vecArr(spot.peekPos),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        spot.peekPos.set(x, y, z);
                        this._syncGameplayToOverrides();
                        this._rebuildGameplayMarkers();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    },
                    angleLabel: 'Взгляд Yaw (°)',
                    getAngleDeg: () => Math.round(radToDeg(spot.lookYaw) * 10) / 10,
                    setAngleDeg: (deg) => {
                        this._pushUndo();
                        spot.lookYaw = degToRad(deg);
                        this._syncGameplayToOverrides();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });
                if (activeHideMeta.trigger !== activeHideMeta.door) {
                    addObjPose(activeHideMeta.trigger, '3. Зона входа в укрытие (Триггер)', 'Триггер');
                    addObjPose(activeHideMeta.door, '4. Дверца / Покрывало укрытия', 'Дверца');
                } else {
                    addObjPose(activeHideMeta.door, '3. Шторка и триггер укрытия', 'Шторка');
                }
            }
        }

        // 7. Player Spawn (Sitting on sofa + Standing point preview)
        if (this.selected.kind === 'spawn') {
            title = 'Позиции старта игрока (Пробуждение)';
            const sp = this.world.playerSpawn;
            poses.push({
                id: 'spawn_sit',
                label: '1. Точка пробуждения сидя на диване',
                badge: 'Старт',
                isActive: () => true,
                onSelect: () => this.selectEntity({ kind: 'spawn' }),
                getPos: () => vecArr(sp.position),
                setPos: (x, y, z) => {
                    this._pushUndo();
                    sp.position.set(x, y, z);
                    this._syncGameplayToOverrides();
                    this._rebuildGameplayMarkers();
                    this._attachGizmoToSelection();
                    this._updateSelectionOutline();
                    this._updateInspectorValuesOnly();
                    this._updateStatusCounts();
                },
                angleLabel: 'Взгляд Yaw (°)',
                getAngleDeg: () => Math.round(radToDeg(sp.yaw) * 10) / 10,
                setAngleDeg: (deg) => {
                    this._pushUndo();
                    sp.yaw = degToRad(deg);
                    this._syncGameplayToOverrides();
                    this._rebuildGameplayMarkers();
                    this._attachGizmoToSelection();
                    this._updateInspectorValuesOnly();
                    this._updateStatusCounts();
                }
            });
        }

        // 8. Monster Patrol Waypoints (all waypoints editable in one list)
        if (this.selected.kind === 'waypoint') {
            title = 'Все точки маршрута монстра';
            this.world.patrolWaypoints.forEach((wp, idx) => {
                poses.push({
                    id: `wp_${idx}`,
                    label: `Точка маршрута #${idx + 1}`,
                    badge: `#${idx + 1}`,
                    isActive: () => this.selected?.kind === 'waypoint' && this.selected.index === idx,
                    onSelect: () => this.selectEntity({ kind: 'waypoint', index: idx }),
                    getPos: () => vecArr(wp),
                    setPos: (x, y, z) => {
                        this._pushUndo();
                        wp.set(x, y, z);
                        this._syncGameplayToOverrides();
                        this._rebuildGameplayMarkers();
                        this._attachGizmoToSelection();
                        this._updateSelectionOutline();
                        this._updateInspectorValuesOnly();
                        this._updateStatusCounts();
                    }
                });
            });
        }

        // 9. Any other single object (including doors with open angle, sub-parts, and composite objects)
        if (poses.length === 0 && selObj) {
            if (rootObj && rootObj !== selObj) {
                title = `Позиции: ${rootObj.name} и деталь`;
                addObjPose(rootObj.name, `1. Весь объект (${rootObj.name})`, 'Основа');
                addObjPose(selObj.name, `2. Выбранная деталь (${selObj.name})`, 'Лок. поза');
            } else {
                const hasDoorState = !!(selObj.userData?.getOpenAngle || selObj.userData?.setOpenState);
                title = hasDoorState ? 'Позиции и открытие двери / створки' : 'Позиции объекта и его деталей';
                addObjPose(selObj.name, hasDoorState ? 'Позиция петель и угол открытия' : `Основная позиция (${selObj.name})`, hasDoorState ? 'Дверь' : 'Объект');
            }
        }

        // Collect all registered child sub-parts for the root object
        const subParts = [];
        if (rootObj) {
            for (const o of this.builder.editableObjects) {
                if (o.userData?.deleted) continue;
                if (o.userData?.parentEditableName === rootObj.name || o.userData?.parentActivatedObj === rootObj) {
                    subParts.push(o);
                }
            }
        }

        // Collect all furniture group members if the object belongs to a groupId
        const groupMembers = [];
        const grpId = rootObj?.userData?.groupId || selObj?.userData?.groupId;
        if (grpId) {
            for (const o of this.builder.editableObjects) {
                if (o.userData?.deleted || o.userData?.isSubPart) continue;
                if (o.userData?.groupId === grpId) {
                    groupMembers.push(o);
                }
            }
        }

        return { title, poses, subParts, groupMembers, rootObj };
    }

    _renderAllPositionsPanel() {
        const sec = document.getElementById('sec-all-positions');
        const listEl = document.getElementById('all-positions-list');
        const titleEl = document.getElementById('all-positions-title');
        const countEl = document.getElementById('all-positions-count');
        if (!sec || !listEl) return;

        this._poseInputBindings = [];
        listEl.innerHTML = '';

        if (!this.selected || this.selected.kind === 'multi' || this.selected.kind === 'light') {
            sec.classList.add('hidden');
            return;
        }

        const { title, poses, subParts, groupMembers, rootObj } = this._buildPoseEntriesForSelection();
        if (poses.length === 0 && subParts.length === 0 && groupMembers.length === 0) {
            sec.classList.add('hidden');
            return;
        }

        sec.classList.remove('hidden');
        titleEl.textContent = title;
        countEl.textContent = `${poses.length}`;

        const frag = document.createDocumentFragment();

        for (const pose of poses) {
            const card = document.createElement('div');
            const active = !!pose.isActive?.();
            card.className = 'pose-card' + (active ? ' active' : '');

            const header = document.createElement('div');
            header.className = 'pose-header';

            const lblWrap = document.createElement('div');
            lblWrap.className = 'pose-label';
            const badgeSpan = document.createElement('span');
            badgeSpan.className = 'pose-badge';
            badgeSpan.textContent = pose.badge;
            const textSpan = document.createElement('span');
            textSpan.textContent = pose.label;
            textSpan.title = pose.label;
            lblWrap.append(badgeSpan, textSpan);

            const actions = document.createElement('div');
            actions.className = 'pose-actions';

            if (Array.isArray(pose.extraActions)) {
                for (const act of pose.extraActions) {
                    const aBtn = document.createElement('button');
                    aBtn.className = 'pose-btn' + (act.active ? ' active' : '');
                    aBtn.textContent = act.label;
                    aBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        act.onClick();
                    });
                    actions.appendChild(aBtn);
                }
            }

            const selBtn = document.createElement('button');
            selBtn.className = 'pose-btn' + (active ? ' active' : '');
            selBtn.textContent = active ? '🎯 Активно' : '🎯 Гизмо';
            selBtn.title = 'Переключиться на эту позицию и привязать 3D-гизмо';
            selBtn.addEventListener('click', () => pose.onSelect());
            actions.appendChild(selBtn);

            header.append(lblWrap, actions);
            card.appendChild(header);

            // Position X/Y/Z row
            if (pose.getPos && pose.setPos) {
                const posRow = document.createElement('div');
                posRow.className = 'pose-row';
                const pLbl = document.createElement('span');
                pLbl.className = 'pose-row-lbl';
                pLbl.textContent = 'Поз. (м)';
                const grid = document.createElement('div');
                grid.className = 'vec3-grid';

                const pVals = pose.getPos();
                const pInputs = ['X', 'Y', 'Z'].map((ax, i) => {
                    const cell = document.createElement('div');
                    cell.className = 'vec3-cell';
                    const sp = document.createElement('span');
                    sp.className = `ax-${ax.toLowerCase()}`;
                    sp.textContent = ax;
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.step = '0.05';
                    inp.value = round3(pVals[i]);
                    cell.append(sp, inp);
                    grid.appendChild(cell);
                    return inp;
                });

                const commitPos = () => {
                    pose.setPos(
                        parseFloat(pInputs[0].value) || 0,
                        parseFloat(pInputs[1].value) || 0,
                        parseFloat(pInputs[2].value) || 0
                    );
                };
                pInputs.forEach(inp => inp.addEventListener('change', commitPos));
                posRow.append(pLbl, grid);
                card.appendChild(posRow);

                this._poseInputBindings.push({
                    type: 'pos',
                    getPos: pose.getPos,
                    inputs: pInputs
                });
            }

            // Rotation X/Y/Z row
            if (pose.getRotDeg && pose.setRotDeg) {
                const rotRow = document.createElement('div');
                rotRow.className = 'pose-row';
                const rLbl = document.createElement('span');
                rLbl.className = 'pose-row-lbl';
                rLbl.textContent = 'Пов. (°)';
                const grid = document.createElement('div');
                grid.className = 'vec3-grid';

                const rVals = pose.getRotDeg();
                const rInputs = ['X', 'Y', 'Z'].map((ax, i) => {
                    const cell = document.createElement('div');
                    cell.className = 'vec3-cell';
                    const sp = document.createElement('span');
                    sp.className = `ax-${ax.toLowerCase()}`;
                    sp.textContent = ax;
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.step = '5';
                    inp.value = rVals[i];
                    cell.append(sp, inp);
                    grid.appendChild(cell);
                    return inp;
                });

                const commitRot = () => {
                    pose.setRotDeg(
                        parseFloat(rInputs[0].value) || 0,
                        parseFloat(rInputs[1].value) || 0,
                        parseFloat(rInputs[2].value) || 0
                    );
                };
                rInputs.forEach(inp => inp.addEventListener('change', commitRot));
                rotRow.append(rLbl, grid);
                card.appendChild(rotRow);

                this._poseInputBindings.push({
                    type: 'rot',
                    getRotDeg: pose.getRotDeg,
                    inputs: rInputs
                });
            }

            // Angle row (door open angle or lookYaw)
            if (pose.getAngleDeg && pose.setAngleDeg) {
                const angRow = document.createElement('div');
                angRow.className = 'pose-row';
                const aLbl = document.createElement('span');
                aLbl.className = 'pose-row-lbl';
                aLbl.style.width = '92px';
                aLbl.textContent = pose.angleLabel || 'Угол (°)';
                const aInp = document.createElement('input');
                aInp.type = 'number';
                aInp.step = '5';
                aInp.style.flex = '1';
                aInp.value = pose.getAngleDeg();
                aInp.addEventListener('change', () => {
                    pose.setAngleDeg(parseFloat(aInp.value) || 0);
                });
                angRow.append(aLbl, aInp);
                card.appendChild(angRow);

                this._poseInputBindings.push({
                    type: 'angle',
                    getAngleDeg: pose.getAngleDeg,
                    input: aInp
                });
            }

            frag.appendChild(card);
        }

        // Sub-parts selector card if composite object has child parts
        if (rootObj && subParts.length > 0) {
            const partsCard = document.createElement('div');
            partsCard.className = 'pose-card';
            const pHeader = document.createElement('div');
            pHeader.className = 'pose-header';
            const pTitle = document.createElement('div');
            pTitle.className = 'pose-label';
            pTitle.textContent = `Детали объекта ${rootObj.name} (${subParts.length + 1})`;
            pHeader.appendChild(pTitle);
            partsCard.appendChild(pHeader);

            const chips = document.createElement('div');
            chips.className = 'subparts-grid';

            const rootChip = document.createElement('button');
            rootChip.className = 'subpart-chip' + (this.selected?.obj === rootObj ? ' active' : '');
            rootChip.textContent = '★ Весь объект';
            rootChip.addEventListener('click', () => this.selectEntity({ kind: 'object', obj: rootObj }));
            chips.appendChild(rootChip);

            subParts.forEach((spObj, idx) => {
                const chip = document.createElement('button');
                chip.className = 'subpart-chip' + (this.selected?.obj === spObj ? ' active' : '');
                const shortLabel = spObj.name.startsWith(rootObj.name + '__Part_')
                    ? `Деталь #${idx + 1}`
                    : spObj.name.replace(rootObj.name + '_', '');
                chip.textContent = shortLabel;
                chip.title = `${spObj.name} (${vecArr(spObj.position).join(', ')})`;
                chip.addEventListener('click', () => this.selectEntity({ kind: 'object', obj: spObj }));
                chips.appendChild(chip);
            });

            partsCard.appendChild(chips);
            frag.appendChild(partsCard);
        }

        // Furniture group members selector card
        if (groupMembers.length > 1) {
            const grpId = rootObj?.userData?.groupId || this.selected?.obj?.userData?.groupId;
            const grpCard = document.createElement('div');
            grpCard.className = 'pose-card';
            const gHeader = document.createElement('div');
            gHeader.className = 'pose-header';
            const gTitle = document.createElement('div');
            gTitle.className = 'pose-label';
            gTitle.textContent = `Элементы гарнитура: ${GROUP_LABELS[grpId] || grpId} (${groupMembers.length})`;
            gHeader.appendChild(gTitle);
            grpCard.appendChild(gHeader);

            const chips = document.createElement('div');
            chips.className = 'subparts-grid';
            for (const gm of groupMembers) {
                const chip = document.createElement('button');
                chip.className = 'subpart-chip' + (this.selected?.obj === gm ? ' active' : '');
                chip.textContent = gm.name;
                chip.title = `${gm.name} (${vecArr(gm.position).join(', ')})`;
                chip.addEventListener('click', () => this.selectEntity({ kind: 'object', obj: gm }));
                chips.appendChild(chip);
            }
            grpCard.appendChild(chips);
            frag.appendChild(grpCard);
        }

        listEl.appendChild(frag);
    }

    _updateAllPositionsValues() {
        if (!this._poseInputBindings || this._poseInputBindings.length === 0) return;
        const activeEl = document.activeElement;
        for (const b of this._poseInputBindings) {
            if (b.type === 'pos' && b.getPos) {
                const vals = b.getPos();
                for (let i = 0; i < 3; i++) {
                    if (b.inputs[i] && b.inputs[i] !== activeEl) {
                        b.inputs[i].value = round3(vals[i]);
                    }
                }
            } else if (b.type === 'rot' && b.getRotDeg) {
                const vals = b.getRotDeg();
                for (let i = 0; i < 3; i++) {
                    if (b.inputs[i] && b.inputs[i] !== activeEl) {
                        b.inputs[i].value = vals[i];
                    }
                }
            } else if (b.type === 'angle' && b.getAngleDeg) {
                if (b.input && b.input !== activeEl) {
                    b.input.value = b.getAngleDeg();
                }
            }
        }
    }

    _applyMaterialPatchToSelected(patchUpdate) {
        if (this.selected?.kind !== 'object' && this.selected?.kind !== 'multi') return;
        const targets = this._getActiveTransformObjects();
        if (targets.length === 0) return;

        for (const obj of targets) {
            const curPatch = obj.userData.materialPatch || { materialKey: obj.userData.materialKey || 'concrete' };
            const merged = { ...curPatch, ...patchUpdate };
            const mKey = merged.materialKey || obj.userData.materialKey || 'concrete';
            const mat = this.builder.createCustomMaterial(mKey, merged);

            if (obj.userData.primaryMesh) {
                obj.userData.primaryMesh.material = mat;
            } else if (obj.isMesh) {
                obj.material = mat;
            } else {
                obj.traverse(c => { if (c.isMesh) c.material = mat; });
            }
            obj.userData.materialKey = mKey;
            obj.userData.materialPatch = merged;
            this._syncObjectToOverrides(obj);
        }
        this._refreshHierarchy();
        this._updateInspectorValuesOnly();
        this._updateStatusCounts();
    }

    _bindUI() {
        document.getElementById('btn-save').addEventListener('click', () => this.saveToProject());
        document.getElementById('btn-download').addEventListener('click', () => this.downloadOverridesFile());
        document.getElementById('btn-import').addEventListener('click', () => document.getElementById('input-import-file').click());
        document.getElementById('input-import-file').addEventListener('change', (e) => {
            this.importOverridesFile(e.target.files?.[0]);
            e.target.value = '';
        });
        document.getElementById('btn-reset-all').addEventListener('click', () => this.resetAllMap());
        document.getElementById('btn-test-game').addEventListener('click', () => {
            saveOverridesToLocalStorage(this.overrides);
            window.open('./index.html', '_blank');
        });

        for (const btn of document.querySelectorAll('[data-tool]')) {
            btn.addEventListener('click', () => this.setToolMode(btn.dataset.tool));
        }
        document.getElementById('btn-space').addEventListener('click', () => this.toggleSpace());
        document.getElementById('btn-group-mode').addEventListener('click', () => this.toggleGroupMode());

        document.getElementById('select-snap-move').addEventListener('change', (e) => {
            this.gizmo.translateSnap = parseFloat(e.target.value) || 0;
        });
        document.getElementById('select-snap-rot').addEventListener('change', (e) => {
            const deg = parseFloat(e.target.value) || 0;
            this.gizmo.rotateSnap = deg > 0 ? degToRad(deg) : 0;
        });
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());

        for (const btn of document.querySelectorAll('[data-cam]')) {
            btn.addEventListener('click', () => this.setCameraMode(btn.dataset.cam));
        }

        document.getElementById('toggle-worklight').addEventListener('click', (e) => {
            this.worklightOn = !this.worklightOn;
            this._workLights.visible = this.worklightOn;
            e.currentTarget.classList.toggle('active', this.worklightOn);
        });
        document.getElementById('toggle-vhs').addEventListener('click', (e) => {
            this.vhsOn = !this.vhsOn;
            this.engine.renderer.setBypassPostProcess(!this.vhsOn);
            this._applyViewportSize();
            e.currentTarget.classList.toggle('active', this.vhsOn);
        });
        document.getElementById('toggle-noceiling').addEventListener('click', (e) => {
            this.noCeiling = !this.noCeiling;
            this._applyNoCeilingVisibility();
            e.currentTarget.classList.toggle('active', this.noCeiling);
        });
        document.getElementById('toggle-colliders').addEventListener('click', (e) => {
            this.showColliders = !this.showColliders;
            this._colliderGroup.visible = this.showColliders;
            this._rebuildColliderHelpers();
            e.currentTarget.classList.toggle('active', this.showColliders);
        });
        document.getElementById('toggle-lights').addEventListener('click', (e) => {
            this.showLightMarkers = !this.showLightMarkers;
            this._lightMarkerGroup.visible = this.showLightMarkers;
            e.currentTarget.classList.toggle('active', this.showLightMarkers);
        });
        document.getElementById('toggle-markers').addEventListener('click', (e) => {
            this.showGameplayMarkers = !this.showGameplayMarkers;
            this._markerGroup.visible = this.showGameplayMarkers;
            e.currentTarget.classList.toggle('active', this.showGameplayMarkers);
        });
        document.getElementById('toggle-table-set')?.addEventListener('click', () => {
            this.setTableSetPreview(!this.tableSetPreview);
        });
        document.getElementById('toggle-open-doors')?.addEventListener('click', () => {
            this.setOpenDoorsPreview(!this.openDoorsPreview);
        });
        document.getElementById('toggle-act4')?.addEventListener('click', () => {
            this.setAct4Preview(!this.act4Preview);
        });

        document.getElementById('add-box').addEventListener('click', () => this.addCustomShape('box'));
        document.getElementById('add-cylinder').addEventListener('click', () => this.addCustomShape('cylinder'));
        document.getElementById('add-sphere').addEventListener('click', () => this.addCustomShape('sphere'));
        document.getElementById('add-plane').addEventListener('click', () => this.addCustomShape('plane'));
        document.getElementById('add-light').addEventListener('click', () => this.addCustomLight());
        document.getElementById('add-waypoint').addEventListener('click', () => this.addPatrolWaypoint(null));

        for (const btn of document.querySelectorAll('[data-preset]')) {
            btn.addEventListener('click', () => this._flyToPreset(btn.dataset.preset));
        }

        document.getElementById('search-objects').addEventListener('input', () => this._refreshHierarchy());
        document.getElementById('filter-category').addEventListener('change', () => this._refreshHierarchy());

        document.getElementById('btn-focus').addEventListener('click', () => this.focusSelected());
        document.getElementById('btn-dup').addEventListener('click', () => this.duplicateSelected());
        document.getElementById('btn-reset-obj').addEventListener('click', () => this.resetSelected());
        document.getElementById('btn-del-obj').addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-select-group').addEventListener('click', () => {
            if (this.selected?.kind === 'object' && this.selected.obj.userData.groupId) {
                const members = this._getGroupMembers(this.selected.obj.userData.groupId);
                if (members.length > 0) this.setObjectSelection(members);
            }
        });

        this._bindObjectInspectorInputs();
        this._bindLightInspectorInputs();
        this._bindMarkerInspectorInputs();
    }

    _bindObjectInspectorInputs() {
        const commitObjs = (fn) => {
            if (this.selected?.kind !== 'object' && this.selected?.kind !== 'multi') return;
            const targets = this._getActiveTransformObjects();
            if (targets.length === 0) return;
            this._pushUndo();
            fn(targets);
            for (const obj of targets) {
                this._syncSingleObjectLiveEffects(obj);
                this._syncObjectToOverrides(obj);
            }
            this._attachGizmoToSelection();
            this._rebuildColliderHelpers();
            this._updateSelectionOutline();
            this._refreshHierarchy();
            this._updateInspectorValuesOnly();
            this._updateStatusCounts();
        };

        const shiftWorldRoots = (targets, worldDelta) => {
            const roots = this._dedupeHierarchyAncestors(targets);
            const wp = new THREE.Vector3();
            for (const o of roots) {
                o.updateMatrixWorld(true);
                o.getWorldPosition(wp);
                wp.add(worldDelta);
                if (o.parent && o.parent !== this.scene) {
                    o.parent.updateMatrixWorld(true);
                    o.position.copy(o.parent.worldToLocal(wp));
                } else {
                    o.position.copy(wp);
                }
            }
        };

        document.getElementById('prop-visible').addEventListener('change', (e) => {
            commitObjs(targets => {
                for (const o of targets) {
                    o.userData.logicalVisible = e.target.checked;
                    o.visible = e.target.checked;
                }
            });
        });

        const readVec3 = (ids) => ids.map(id => parseFloat(document.getElementById(id).value) || 0);
        for (const id of ['pos-x', 'pos-y', 'pos-z']) {
            document.getElementById(id).addEventListener('change', () => {
                commitObjs(targets => {
                    const nextPos = readVec3(['pos-x', 'pos-y', 'pos-z']);
                    if (this.selected?.kind === 'object' && targets.length === 1) {
                        targets[0].position.set(...nextPos);
                        return;
                    }
                    const curCenter = new THREE.Vector3();
                    const wp = new THREE.Vector3();
                    for (const o of targets) {
                        o.updateWorldMatrix(true, false);
                        o.getWorldPosition(wp);
                        curCenter.add(wp);
                    }
                    curCenter.divideScalar(targets.length);
                    shiftWorldRoots(targets, new THREE.Vector3(
                        nextPos[0] - curCenter.x,
                        nextPos[1] - curCenter.y,
                        nextPos[2] - curCenter.z
                    ));
                });
            });
        }
        document.getElementById('btn-snap-floor').addEventListener('click', () => {
            commitObjs(targets => {
                const box = new THREE.Box3();
                for (const o of targets) {
                    o.updateWorldMatrix(true, true);
                    box.expandByObject(o);
                }
                if (!box.isEmpty()) {
                    shiftWorldRoots(targets, new THREE.Vector3(0, -box.min.y, 0));
                }
            });
        });
        for (const id of ['rot-x', 'rot-y', 'rot-z']) {
            document.getElementById(id).addEventListener('change', () => {
                commitObjs(targets => {
                    const [rx, ry, rz] = readVec3(['rot-x', 'rot-y', 'rot-z']);
                    if (this.selected?.kind === 'object' && targets.length === 1) {
                        targets[0].rotation.set(degToRad(rx), degToRad(ry), degToRad(rz));
                        return;
                    }
                    const euler = new THREE.Euler(degToRad(rx), degToRad(ry), degToRad(rz), 'XYZ');
                    const deltaQ = new THREE.Quaternion().setFromEuler(euler);
                    const deltaMat = new THREE.Matrix4().makeRotationFromQuaternion(deltaQ);
                    const center = new THREE.Vector3();
                    const wp = new THREE.Vector3();
                    for (const o of targets) {
                        o.updateWorldMatrix(true, false);
                        o.getWorldPosition(wp);
                        center.add(wp);
                    }
                    center.divideScalar(targets.length);
                    const pivotToOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
                    const originToPivot = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);
                    const worldRot = new THREE.Matrix4().multiplyMatrices(originToPivot, deltaMat).multiply(pivotToOrigin);
                    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
                    for (const o of this._dedupeHierarchyAncestors(targets)) {
                        o.updateMatrixWorld(true);
                        const matW = new THREE.Matrix4().multiplyMatrices(worldRot, o.matrixWorld);
                        if (o.parent && o.parent !== this.scene) {
                            o.parent.updateMatrixWorld(true);
                            new THREE.Matrix4().multiplyMatrices(o.parent.matrixWorld.clone().invert(), matW).decompose(pos, quat, scl);
                        } else {
                            matW.decompose(pos, quat, scl);
                        }
                        o.position.copy(pos);
                        o.quaternion.copy(quat);
                        o.scale.copy(scl);
                    }
                });
            });
        }
        for (const id of ['box-w', 'box-h', 'box-d']) {
            document.getElementById(id).addEventListener('change', () => {
                commitObjs(targets => {
                    if (targets.length === 1 && this._isSinglePrimitiveEditable(targets[0])) {
                        this._applyStaticBoxSize(targets[0], readVec3(['box-w', 'box-h', 'box-d']));
                    }
                });
            });
        }
        for (const id of ['scale-x', 'scale-y', 'scale-z']) {
            document.getElementById(id).addEventListener('change', () => {
                commitObjs(targets => {
                    const [sx, sy, sz] = readVec3(['scale-x', 'scale-y', 'scale-z']).map(v => Math.max(0.05, v));
                    if (this.selected?.kind === 'object' && targets.length === 1) {
                        targets[0].scale.set(sx, sy, sz);
                        return;
                    }
                    for (const o of this._dedupeHierarchyAncestors(targets)) {
                        o.scale.set(
                            Math.max(0.01, o.scale.x * sx),
                            Math.max(0.01, o.scale.y * sy),
                            Math.max(0.01, o.scale.z * sz)
                        );
                    }
                });
            });
        }

        document.getElementById('prop-collide').addEventListener('change', (e) => {
            commitObjs(targets => {
                const val = e.target.checked;
                for (const o of targets) {
                    o.userData.collide = val;
                    const go = o.userData.gameObject;
                    if (!go) continue;
                    let col = go.getComponent(BoxCollider);
                    if (val && !col) {
                        const sz = o.userData.boxSize || [1, 1, 1];
                        col = go.addComponent(BoxCollider, new THREE.Vector3(...sz));
                        if (!go.getComponent(RigidBody)) go.addComponent(RigidBody, { bodyType: 'static' });
                    }
                    if (col) col.enabled = val;
                }
            });
        });

        document.getElementById('prop-blocker').addEventListener('change', (e) => {
            commitObjs(targets => {
                const val = e.target.checked;
                for (const o of targets) {
                    o.userData.blocker = val;
                    const meshes = [];
                    o.traverse(c => { if (c.isMesh) meshes.push(c); });
                    if (val) {
                        const tMeshes = o.userData.primaryMesh ? [o.userData.primaryMesh] : meshes;
                        for (const m of tMeshes) {
                            if (!this.builder.blockerMeshes.includes(m)) this.builder.blockerMeshes.push(m);
                        }
                    } else {
                        this.builder.blockerMeshes = this.builder.blockerMeshes.filter(m => !meshes.includes(m));
                    }
                }
            });
        });

        document.getElementById('prop-cast-shadow').addEventListener('change', (e) => {
            commitObjs(targets => {
                for (const o of targets) {
                    o.userData.castShadow = e.target.checked;
                    o.userData._castShadowEdited = true;
                    o.traverse(c => { if (c.isMesh) c.castShadow = e.target.checked; });
                }
            });
        });
        document.getElementById('prop-receive-shadow').addEventListener('change', (e) => {
            commitObjs(targets => {
                for (const o of targets) {
                    o.userData.receiveShadow = e.target.checked;
                    o.userData._receiveShadowEdited = true;
                    o.traverse(c => { if (c.isMesh) c.receiveShadow = e.target.checked; });
                }
            });
        });

        for (const id of ['col-w', 'col-h', 'col-d', 'col-ox', 'col-oy', 'col-oz']) {
            document.getElementById(id).addEventListener('change', () => {
                commitObjs(targets => {
                    if (targets.length !== 1) return;
                    const col = targets[0].userData.gameObject?.getComponent(BoxCollider);
                    if (!col) return;
                    const [w, h, d] = readVec3(['col-w', 'col-h', 'col-d']).map(v => Math.max(0.02, v));
                    const [ox, oy, oz] = readVec3(['col-ox', 'col-oy', 'col-oz']);
                    col.setSize(new THREE.Vector3(w, h, d));
                    col.offset.set(ox, oy, oz);
                    col.userDataCustomSize = true;
                });
            });
        }

        document.getElementById('mat-key').addEventListener('change', (e) => {
            if (this.selected?.kind !== 'object' && this.selected?.kind !== 'multi') return;
            this._pushUndo();
            const key = e.target.value;
            for (const o of this._getActiveTransformObjects()) {
                o.userData.materialPatch = null;
            }
            this._applyMaterialPatchToSelected({ materialKey: key });
        });
        document.getElementById('mat-color').addEventListener('change', (e) => {
            this._pushUndo();
            this._applyMaterialPatchToSelected({ color: cssToHexInt(e.target.value) });
        });
        document.getElementById('mat-emissive').addEventListener('change', (e) => {
            this._pushUndo();
            this._applyMaterialPatchToSelected({ emissive: cssToHexInt(e.target.value) });
        });
        document.getElementById('mat-roughness').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById('val-roughness').textContent = v.toFixed(2);
            this._applyMaterialPatchToSelected({ roughness: v });
        });
        document.getElementById('mat-metalness').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById('val-metalness').textContent = v.toFixed(2);
            this._applyMaterialPatchToSelected({ metalness: v });
        });
        document.getElementById('mat-opacity').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById('val-opacity').textContent = v.toFixed(2);
            this._applyMaterialPatchToSelected({ opacity: v });
        });
        for (const id of ['mat-repeat-x', 'mat-repeat-y']) {
            document.getElementById(id).addEventListener('change', () => {
                this._pushUndo();
                this._applyMaterialPatchToSelected({
                    repeatX: Math.max(0.1, parseFloat(document.getElementById('mat-repeat-x').value) || 1),
                    repeatY: Math.max(0.1, parseFloat(document.getElementById('mat-repeat-y').value) || 1)
                });
            });
        }
        document.getElementById('btn-mat-reset').addEventListener('click', () => {
            if (this.selected?.kind !== 'object' && this.selected?.kind !== 'multi') return;
            const targets = this._getActiveTransformObjects();
            if (targets.length === 0) return;
            this._pushUndo();
            for (const obj of targets) {
                obj.userData.materialPatch = null;
                const mKey = obj.userData.initialMaterialKey || 'concrete';
                obj.userData.materialKey = mKey;
                const orig = this._initialMaterials.get(obj.name) || this.builder.createCustomMaterial(mKey);
                if (obj.userData.primaryMesh) obj.userData.primaryMesh.material = orig;
                else if (obj.isMesh) obj.material = orig;
                else obj.traverse(c => { if (c.isMesh) c.material = orig; });
                this._syncObjectToOverrides(obj);
            }
            this._updateInspectorValuesOnly();
            this._refreshHierarchy();
            this._updateStatusCounts();
        });
    }

    _bindLightInspectorInputs() {
        const commitLight = (fn) => {
            if (this.selected?.kind !== 'light') return;
            this._pushUndo();
            const l = this.selected.light;
            fn(l);
            this._syncLightToOverrides(l);
            this._attachGizmoToSelection();
            this._rebuildLightMarkers();
            this._updateSelectionOutline();
            this._refreshHierarchy();
            this._updateStatusCounts();
        };

        document.getElementById('light-visible').addEventListener('change', (e) => {
            commitLight(l => { l.visible = e.target.checked; });
        });
        for (const id of ['lpos-x', 'lpos-y', 'lpos-z']) {
            document.getElementById(id).addEventListener('change', () => {
                commitLight(l => {
                    l.position.set(
                        parseFloat(document.getElementById('lpos-x').value) || 0,
                        parseFloat(document.getElementById('lpos-y').value) || 0,
                        parseFloat(document.getElementById('lpos-z').value) || 0
                    );
                });
            });
        }
        document.getElementById('light-color').addEventListener('change', (e) => {
            commitLight(l => { l.color.setHex(cssToHexInt(e.target.value)); });
        });
        document.getElementById('light-intensity').addEventListener('change', (e) => {
            commitLight(l => { l.intensity = Math.max(0, parseFloat(e.target.value) || 0); });
        });
        document.getElementById('light-distance').addEventListener('change', (e) => {
            commitLight(l => { if ('distance' in l) l.distance = Math.max(0, parseFloat(e.target.value) || 0); });
        });
        document.getElementById('light-decay').addEventListener('change', (e) => {
            commitLight(l => { if ('decay' in l) l.decay = Math.max(0, parseFloat(e.target.value) || 0); });
        });
    }

    _bindMarkerInspectorInputs() {
        const commitMarker = (fn) => {
            this._pushUndo();
            fn();
            this._syncGameplayToOverrides();
            this._rebuildGameplayMarkers();
            this._attachGizmoToSelection();
            this._updateSelectionOutline();
            this._refreshHierarchy();
            this._updateInspectorValuesOnly();
            this._updateStatusCounts();
        };

        for (const id of ['mpos-x', 'mpos-y', 'mpos-z', 'spawn-yaw', 'spawn-pitch']) {
            document.getElementById(id).addEventListener('change', () => {
                if (this.selected?.kind !== 'spawn') return;
                commitMarker(() => {
                    this.world.playerSpawn.position.set(
                        parseFloat(document.getElementById('mpos-x').value) || 0,
                        parseFloat(document.getElementById('mpos-y').value) || 0,
                        parseFloat(document.getElementById('mpos-z').value) || 0
                    );
                    this.world.playerSpawn.yaw = degToRad(parseFloat(document.getElementById('spawn-yaw').value) || 0);
                    this.world.playerSpawn.pitch = degToRad(parseFloat(document.getElementById('spawn-pitch').value) || 0);
                });
            });
        }
        document.getElementById('btn-spawn-from-cam').addEventListener('click', () => {
            if (this.selected?.kind !== 'spawn') return;
            commitMarker(() => {
                if (this.camMode === 'walk') {
                    this.world.playerSpawn.position.copy(this._walkState.pos);
                    this.world.playerSpawn.yaw = this._walkState.yaw;
                    this.world.playerSpawn.pitch = this._walkState.pitch;
                } else {
                    const p = this.perspectiveCam.position;
                    this.world.playerSpawn.position.set(round3(p.x), round3(Math.max(0.05, p.y - 1.55)), round3(p.z));
                    this.world.playerSpawn.yaw = round3(this._flyCamState.yaw);
                    this.world.playerSpawn.pitch = round3(this._flyCamState.pitch);
                }
            });
            this._showToast('Спавн обновлён по текущей камере');
        });

        for (const id of ['hide-x', 'hide-y', 'hide-z', 'peek-x', 'peek-y', 'peek-z', 'hide-yaw']) {
            document.getElementById(id).addEventListener('change', () => {
                if (this.selected?.kind !== 'hiding') return;
                commitMarker(() => {
                    const s = this.selected.spot;
                    s.hidePos.set(
                        parseFloat(document.getElementById('hide-x').value) || 0,
                        parseFloat(document.getElementById('hide-y').value) || 0,
                        parseFloat(document.getElementById('hide-z').value) || 0
                    );
                    s.peekPos.set(
                        parseFloat(document.getElementById('peek-x').value) || 0,
                        parseFloat(document.getElementById('peek-y').value) || 0,
                        parseFloat(document.getElementById('peek-z').value) || 0
                    );
                    s.lookYaw = degToRad(parseFloat(document.getElementById('hide-yaw').value) || 0);
                });
            });
        }
        document.getElementById('btn-edit-hidepos').addEventListener('click', () => {
            this.hideSubTarget = 'hide';
            this._attachGizmoToSelection();
            this._updateSelectionOutline();
            this._updateInspectorValuesOnly();
        });
        document.getElementById('btn-edit-peekpos').addEventListener('click', () => {
            this.hideSubTarget = 'peek';
            this._attachGizmoToSelection();
            this._updateSelectionOutline();
            this._updateInspectorValuesOnly();
        });

        for (const id of ['wpos-x', 'wpos-y', 'wpos-z']) {
            document.getElementById(id).addEventListener('change', () => {
                if (this.selected?.kind !== 'waypoint') return;
                commitMarker(() => {
                    const wp = this.world.patrolWaypoints[this.selected.index];
                    if (wp) {
                        wp.set(
                            parseFloat(document.getElementById('wpos-x').value) || 0,
                            parseFloat(document.getElementById('wpos-y').value) || 0,
                            parseFloat(document.getElementById('wpos-z').value) || 0
                        );
                    }
                });
            });
        }
        document.getElementById('btn-wp-insert-after').addEventListener('click', () => {
            if (this.selected?.kind === 'waypoint') {
                this.addPatrolWaypoint(this.selected.index);
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.mapEditor = new MapEditor();
});

