import * as THREE from 'three';

const AXIS_COLORS = {
    X: 0xff4d5a,
    Y: 0x3ddc77,
    Z: 0x4b8bff,
    XY: 0x6ba4ff,
    XZ: 0xffb347,
    YZ: 0x4fd1c5,
    XYZ: 0xf1f5f9
};

const AXIS_HIGHLIGHT = {
    X: 0xffa6ad,
    Y: 0xa6ffca,
    Z: 0xa8c8ff,
    XY: 0xb8d4ff,
    XZ: 0xffdca8,
    YZ: 0xa6f2ea,
    XYZ: 0xffffff
};

export class TransformGizmo {
    constructor(scene, camera, domElement) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;

        this.target = null;
        this.mode = 'translate';
        this.space = 'world';
        this.enabled = true;

        this.translateSnap = 0;
        this.rotateSnap = 0;
        this.scaleSnap = 0;

        this.hoveredAxis = null;
        this.draggingAxis = null;
        this.isDragging = false;

        this.onDragStart = null;
        this.onChange = null;
        this.onDragEnd = null;

        this.group = new THREE.Group();
        this.group.name = '__TransformGizmo';
        this.group.visible = false;
        this.group.renderOrder = 999;
        this.scene.add(this.group);

        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._hitMeshes = { translate: [], rotate: [], scale: [] };
        this._visualsByAxis = { translate: new Map(), rotate: new Map(), scale: new Map() };

        this._dragState = {
            plane: new THREE.Plane(),
            startPos: new THREE.Vector3(),
            startQuat: new THREE.Quaternion(),
            startWorldQuat: new THREE.Quaternion(),
            startScale: new THREE.Vector3(),
            startHit: new THREE.Vector3(),
            startNdc: new THREE.Vector2(),
            axisDirs: [],
            rotAxisWorld: new THREE.Vector3(),
            gizmoScale: 1
        };

        this._buildVisuals();
        this._updateModeVisibility();
    }

    setCamera(camera) {
        this.camera = camera;
    }

    attach(object3D) {
        this.target = object3D || null;
        if (this.target) {
            this.group.visible = true;
            this.updateTransform();
        } else {
            this.group.visible = false;
            this.cancelDrag();
        }
    }

    detach() {
        this.attach(null);
    }

    setMode(mode) {
        if (!['translate', 'rotate', 'scale'].includes(mode)) return;
        this.mode = mode;
        this.hoveredAxis = null;
        this._updateModeVisibility();
        this._refreshHoverColors();
        this.updateTransform();
    }

    setSpace(space) {
        if (space !== 'world' && space !== 'local') return;
        this.space = space;
        this.updateTransform();
    }

    _makeMat(color, opacity = 0.95) {
        return new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthTest: false,
            depthWrite: false,
            fog: false,
            toneMapped: false
        });
    }

    _makeHitMat() {
        return new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide
        });
    }

    _registerVisual(mode, axis, mesh) {
        mesh.renderOrder = 999;
        mesh.userData.gizmoBaseColor = AXIS_COLORS[axis];
        mesh.userData.gizmoHighlightColor = AXIS_HIGHLIGHT[axis];
        mesh.userData.gizmoBaseOpacity = mesh.material.opacity;
        if (!this._visualsByAxis[mode].has(axis)) {
            this._visualsByAxis[mode].set(axis, []);
        }
        this._visualsByAxis[mode].get(axis).push(mesh);
    }

    _registerHit(mode, axis, mesh) {
        mesh.renderOrder = 999;
        mesh.userData.gizmoAxis = axis;
        mesh.userData.gizmoMode = mode;
        this._hitMeshes[mode].push(mesh);
    }

    _buildVisuals() {
        this._translateGroup = new THREE.Group();
        this._rotateGroup = new THREE.Group();
        this._scaleGroup = new THREE.Group();
        this.group.add(this._translateGroup, this._rotateGroup, this._scaleGroup);

        const axes = [
            { name: 'X', dir: new THREE.Vector3(1, 0, 0), rotZ: -Math.PI / 2, rotX: 0 },
            { name: 'Y', dir: new THREE.Vector3(0, 1, 0), rotZ: 0, rotX: 0 },
            { name: 'Z', dir: new THREE.Vector3(0, 0, 1), rotZ: 0, rotX: Math.PI / 2 }
        ];

        const shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.82, 8);
        const coneGeo = new THREE.ConeGeometry(0.055, 0.2, 10);
        const hitCylGeo = new THREE.CylinderGeometry(0.085, 0.085, 1.08, 8);

        for (const a of axes) {
            const holder = new THREE.Group();
            holder.rotation.set(a.rotX, 0, a.rotZ);

            const shaft = new THREE.Mesh(shaftGeo, this._makeMat(AXIS_COLORS[a.name]));
            shaft.position.y = 0.41;
            holder.add(shaft);
            this._registerVisual('translate', a.name, shaft);

            const cone = new THREE.Mesh(coneGeo, this._makeMat(AXIS_COLORS[a.name]));
            cone.position.y = 0.92;
            holder.add(cone);
            this._registerVisual('translate', a.name, cone);

            const hit = new THREE.Mesh(hitCylGeo, this._makeHitMat());
            hit.position.y = 0.52;
            holder.add(hit);
            this._registerHit('translate', a.name, hit);

            this._translateGroup.add(holder);
        }

        const planeGeo = new THREE.PlaneGeometry(0.24, 0.24);
        const planeDefs = [
            { name: 'XY', pos: [0.28, 0.28, 0], rot: [0, 0, 0] },
            { name: 'XZ', pos: [0.28, 0, 0.28], rot: [Math.PI / 2, 0, 0] },
            { name: 'YZ', pos: [0, 0.28, 0.28], rot: [0, Math.PI / 2, 0] }
        ];
        for (const p of planeDefs) {
            const mat = this._makeMat(AXIS_COLORS[p.name], 0.32);
            mat.side = THREE.DoubleSide;
            const mesh = new THREE.Mesh(planeGeo, mat);
            mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
            mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
            this._translateGroup.add(mesh);
            this._registerVisual('translate', p.name, mesh);
            this._registerHit('translate', p.name, mesh);
        }

        const ringGeo = new THREE.TorusGeometry(0.86, 0.018, 8, 48);
        const ringHitGeo = new THREE.TorusGeometry(0.86, 0.09, 8, 28);
        const rotDefs = [
            { name: 'X', rot: [0, Math.PI / 2, 0] },
            { name: 'Y', rot: [Math.PI / 2, 0, 0] },
            { name: 'Z', rot: [0, 0, 0] }
        ];
        for (const r of rotDefs) {
            const vis = new THREE.Mesh(ringGeo, this._makeMat(AXIS_COLORS[r.name]));
            vis.rotation.set(r.rot[0], r.rot[1], r.rot[2]);
            this._rotateGroup.add(vis);
            this._registerVisual('rotate', r.name, vis);

            const hit = new THREE.Mesh(ringHitGeo, this._makeHitMat());
            hit.rotation.set(r.rot[0], r.rot[1], r.rot[2]);
            this._rotateGroup.add(hit);
            this._registerHit('rotate', r.name, hit);
        }

        const cubeGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
        for (const a of axes) {
            const holder = new THREE.Group();
            holder.rotation.set(a.rotX, 0, a.rotZ);

            const shaft = new THREE.Mesh(shaftGeo, this._makeMat(AXIS_COLORS[a.name]));
            shaft.position.y = 0.41;
            holder.add(shaft);
            this._registerVisual('scale', a.name, shaft);

            const box = new THREE.Mesh(cubeGeo, this._makeMat(AXIS_COLORS[a.name]));
            box.position.y = 0.88;
            holder.add(box);
            this._registerVisual('scale', a.name, box);

            const hit = new THREE.Mesh(hitCylGeo, this._makeHitMat());
            hit.position.y = 0.52;
            holder.add(hit);
            this._registerHit('scale', a.name, hit);

            this._scaleGroup.add(holder);
        }

        const centerGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
        const centerMesh = new THREE.Mesh(centerGeo, this._makeMat(AXIS_COLORS.XYZ, 0.85));
        this._scaleGroup.add(centerMesh);
        this._registerVisual('scale', 'XYZ', centerMesh);
        this._registerHit('scale', 'XYZ', centerMesh);
    }

    _updateModeVisibility() {
        this._translateGroup.visible = this.mode === 'translate';
        this._rotateGroup.visible = this.mode === 'rotate';
        this._scaleGroup.visible = this.mode === 'scale';
    }

    _refreshHoverColors() {
        const activeAxis = this.draggingAxis || this.hoveredAxis;
        for (const modeKey of ['translate', 'rotate', 'scale']) {
            for (const [axis, meshes] of this._visualsByAxis[modeKey].entries()) {
                const isActive = modeKey === this.mode && activeAxis === axis;
                for (const m of meshes) {
                    m.material.color.setHex(isActive ? m.userData.gizmoHighlightColor : m.userData.gizmoBaseColor);
                    m.material.opacity = isActive ? Math.min(1, m.userData.gizmoBaseOpacity + 0.35) : m.userData.gizmoBaseOpacity;
                }
            }
        }
    }

    updateTransform() {
        if (!this.target || !this.group.visible) return;
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        this.target.updateWorldMatrix(true, false);
        this.target.getWorldPosition(worldPos);
        this.target.getWorldQuaternion(worldQuat);

        this.group.position.copy(worldPos);
        if (this.mode === 'scale' || this.space === 'local') {
            this.group.quaternion.copy(worldQuat);
        } else {
            this.group.quaternion.identity();
        }

        let s = 1;
        if (this.camera) {
            if (this.camera.isOrthographicCamera) {
                const orthoH = Math.abs(this.camera.top - this.camera.bottom) / Math.max(0.05, this.camera.zoom);
                s = Math.max(0.25, orthoH * 0.13);
            } else {
                const dist = this.camera.position.distanceTo(worldPos);
                s = Math.max(0.25, Math.min(8.0, dist * 0.17));
            }
        }
        this.group.scale.setScalar(s);
    }

    _getPointerNdc(clientX, clientY) {
        const rect = this.domElement.getBoundingClientRect();
        this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        return this._pointer;
    }

    _pickAxis(clientX, clientY) {
        if (!this.enabled || !this.target || !this.group.visible) return null;
        this.updateTransform();
        this.group.updateMatrixWorld(true);
        const ndc = this._getPointerNdc(clientX, clientY);
        this._raycaster.setFromCamera(ndc, this.camera);
        const hitList = this._hitMeshes[this.mode] || [];
        const hits = this._raycaster.intersectObjects(hitList, false);
        if (hits.length === 0) return null;
        return hits[0].object.userData.gizmoAxis || null;
    }

    handlePointerMove(clientX, clientY) {
        if (!this.enabled || !this.target) return false;
        if (this.isDragging) {
            this._updateDrag(clientX, clientY);
            return true;
        }
        const axis = this._pickAxis(clientX, clientY);
        if (axis !== this.hoveredAxis) {
            this.hoveredAxis = axis;
            this._refreshHoverColors();
        }
        return !!axis;
    }

    handlePointerDown(clientX, clientY) {
        if (!this.enabled || !this.target) return false;
        const axis = this._pickAxis(clientX, clientY);
        if (!axis) return false;

        this.draggingAxis = axis;
        this.isDragging = true;
        this._refreshHoverColors();
        this._beginDrag(axis, clientX, clientY);
        if (this.onDragStart) this.onDragStart(this.mode, axis, this.target);
        return true;
    }

    handlePointerUp() {
        if (!this.isDragging) return false;
        const axis = this.draggingAxis;
        this.isDragging = false;
        this.draggingAxis = null;
        this._refreshHoverColors();
        if (this.onDragEnd) this.onDragEnd(this.mode, axis, this.target);
        return true;
    }

    cancelDrag() {
        if (this.isDragging) {
            this.isDragging = false;
            this.draggingAxis = null;
            this._refreshHoverColors();
        }
    }

    _getAxisWorldDir(axisChar) {
        const v = new THREE.Vector3(
            axisChar === 'X' ? 1 : 0,
            axisChar === 'Y' ? 1 : 0,
            axisChar === 'Z' ? 1 : 0
        );
        if (this.mode === 'scale' || this.space === 'local') {
            v.applyQuaternion(this._dragState.startWorldQuat).normalize();
        }
        return v;
    }

    _beginDrag(axis, clientX, clientY) {
        const ds = this._dragState;
        this.target.updateWorldMatrix(true, false);
        this.target.getWorldPosition(ds.startPos);
        this.target.getWorldQuaternion(ds.startWorldQuat);
        ds.startQuat.copy(this.target.quaternion);
        ds.startScale.copy(this.target.scale);
        ds.gizmoScale = this.group.scale.x;

        const ndc = this._getPointerNdc(clientX, clientY);
        ds.startNdc.copy(ndc);
        this._raycaster.setFromCamera(ndc, this.camera);

        const viewDir = new THREE.Vector3();
        this.camera.getWorldDirection(viewDir);

        if (this.mode === 'translate' || this.mode === 'scale') {
            if (axis === 'X' || axis === 'Y' || axis === 'Z') {
                const axisDir = this._getAxisWorldDir(axis);
                ds.axisDirs = [axisDir];
                let tangent = new THREE.Vector3().crossVectors(axisDir, viewDir);
                if (tangent.lengthSq() < 1e-4) {
                    const fallback = Math.abs(axisDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
                    tangent.crossVectors(axisDir, fallback);
                }
                const normal = new THREE.Vector3().crossVectors(tangent, axisDir).normalize();
                ds.plane.setFromNormalAndCoplanarPoint(normal, ds.startPos);
            } else if (axis === 'XY' || axis === 'XZ' || axis === 'YZ') {
                const a1 = this._getAxisWorldDir(axis[0]);
                const a2 = this._getAxisWorldDir(axis[1]);
                ds.axisDirs = [a1, a2];
                const normal = new THREE.Vector3().crossVectors(a1, a2).normalize();
                ds.plane.setFromNormalAndCoplanarPoint(normal, ds.startPos);
            } else {
                ds.plane.setFromNormalAndCoplanarPoint(viewDir.clone().negate(), ds.startPos);
            }
        } else if (this.mode === 'rotate') {
            const rotDir = this._getAxisWorldDir(axis);
            ds.rotAxisWorld.copy(rotDir);
            const normal = Math.abs(viewDir.dot(rotDir)) > 0.12 ? rotDir : viewDir.clone().negate();
            ds.plane.setFromNormalAndCoplanarPoint(normal, ds.startPos);
        }

        if (!this._raycaster.ray.intersectPlane(ds.plane, ds.startHit)) {
            ds.startHit.copy(ds.startPos);
        }
    }

    _applySnap(value, snap) {
        if (!snap || snap <= 0) return value;
        return Math.round(value / snap) * snap;
    }

    _setTargetWorldPosition(worldPos) {
        if (this.target.parent && this.target.parent !== this.scene) {
            const localPos = worldPos.clone();
            this.target.parent.worldToLocal(localPos);
            this.target.position.copy(localPos);
        } else {
            this.target.position.copy(worldPos);
        }
    }

    _updateDrag(clientX, clientY) {
        const ds = this._dragState;
        const axis = this.draggingAxis;
        const ndc = this._getPointerNdc(clientX, clientY);
        this._raycaster.setFromCamera(ndc, this.camera);

        if (this.mode === 'scale' && axis === 'XYZ') {
            const deltaScreen = (ndc.x - ds.startNdc.x) + (ndc.y - ds.startNdc.y);
            let factor = Math.max(0.05, 1 + deltaScreen * 1.8);
            if (this.scaleSnap > 0) {
                factor = Math.max(this.scaleSnap, this._applySnap(factor, this.scaleSnap));
            }
            this.target.scale.set(
                ds.startScale.x * factor,
                ds.startScale.y * factor,
                ds.startScale.z * factor
            );
            this.updateTransform();
            if (this.onChange) this.onChange(this.mode, axis, this.target);
            return;
        }

        const hit = new THREE.Vector3();
        if (!this._raycaster.ray.intersectPlane(ds.plane, hit)) {
            return;
        }

        const disp = hit.clone().sub(ds.startHit);
        if (disp.length() > 150) return;

        if (this.mode === 'translate') {
            const worldOffset = new THREE.Vector3();
            for (const dir of ds.axisDirs) {
                const proj = this._applySnap(disp.dot(dir), this.translateSnap);
                worldOffset.addScaledVector(dir, proj);
            }
            this._setTargetWorldPosition(ds.startPos.clone().add(worldOffset));
        } else if (this.mode === 'rotate') {
            const v0 = ds.startHit.clone().sub(ds.startPos);
            const v1 = hit.clone().sub(ds.startPos);
            v0.addScaledVector(ds.rotAxisWorld, -v0.dot(ds.rotAxisWorld));
            v1.addScaledVector(ds.rotAxisWorld, -v1.dot(ds.rotAxisWorld));
            if (v0.lengthSq() < 1e-6 || v1.lengthSq() < 1e-6) return;
            v0.normalize();
            v1.normalize();
            const cross = new THREE.Vector3().crossVectors(v0, v1);
            let angle = Math.atan2(ds.rotAxisWorld.dot(cross), v0.dot(v1));
            angle = this._applySnap(angle, this.rotateSnap);

            const qDelta = new THREE.Quaternion().setFromAxisAngle(ds.rotAxisWorld, angle);
            const newWorldQuat = qDelta.multiply(ds.startWorldQuat);
            if (this.target.parent && this.target.parent !== this.scene) {
                const parentWorldQuat = new THREE.Quaternion();
                this.target.parent.getWorldQuaternion(parentWorldQuat);
                this.target.quaternion.copy(parentWorldQuat.invert().multiply(newWorldQuat));
            } else {
                this.target.quaternion.copy(newWorldQuat);
            }
        } else if (this.mode === 'scale') {
            const dir = ds.axisDirs[0];
            const deltaDist = disp.dot(dir);
            let factor = Math.max(0.05, 1 + deltaDist / Math.max(0.2, ds.gizmoScale * 0.85));
            if (this.scaleSnap > 0) {
                factor = Math.max(this.scaleSnap, this._applySnap(factor, this.scaleSnap));
            }
            this.target.scale.copy(ds.startScale);
            if (axis === 'X') this.target.scale.x = ds.startScale.x * factor;
            else if (axis === 'Y') this.target.scale.y = ds.startScale.y * factor;
            else if (axis === 'Z') this.target.scale.z = ds.startScale.z * factor;
        }

        this.updateTransform();
        if (this.onChange) this.onChange(this.mode, axis, this.target);
    }

    dispose() {
        this.scene.remove(this.group);
    }
}

export default TransformGizmo;

