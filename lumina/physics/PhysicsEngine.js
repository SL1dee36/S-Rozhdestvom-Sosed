import * as THREE from 'three';

export class PhysicsEngine {
    constructor() {
        this.rigidBodies = [];
        this.gravity = -20.0;
    }

    addRigidBody(body) {
        this.rigidBodies.push(body);
    }

    removeRigidBody(body) {
        const index = this.rigidBodies.indexOf(body);
        if (index > -1) this.rigidBodies.splice(index, 1);
    }

    update(deltaTime) {
        if (deltaTime > 0.1) deltaTime = 0.1;

        this.rigidBodies.forEach(body => {
            if (body.bodyType === 'static') return; 

            if (body.bodyType === 'dynamic' && body.useGravity) {
                body.velocity.y += this.gravity * deltaTime;
            }

            const nextPosY = body.position.clone();
            nextPosY.y += body.velocity.y * deltaTime;
            
            const colsY = this.getCollisions(body, nextPosY);
            if (colsY.length > 0) {
                if (body.velocity.y < 0) body.isGrounded = true;
                
                if (body.restitution > 0) body.velocity.y *= -body.restitution;
                else body.velocity.y = 0;
                
                body.handleCollisions(colsY, 'Y');
            } else {
                body.position.y = nextPosY.y;
                if (body.velocity.y !== 0) body.isGrounded = false;
            }

            const tryStepUp = (nextPos, cols) => {
                if ((!body.isGrounded && Math.abs(body.velocity.y) > 0.5) || !body.collider) return false;
                const playerBox = body.collider.getBox(body.position);
                const feetY = playerBox.min.y;
                const feetOffset = feetY - body.position.y;
                let maxTopY = -Infinity;
                for (let i = 0; i < cols.length; i++) {
                    const b = cols[i].collider.getBox(cols[i].position);
                    const delta = b.max.y - feetY;
                    if (delta > 0.32) return false; // Blocked by a tall wall/obstacle, cannot step over
                    if (b.max.y > maxTopY) maxTopY = b.max.y;
                }
                const stepDelta = maxTopY - feetY;
                if (stepDelta <= 0.001 || stepDelta > 0.32) return false;
                const steppedPos = nextPos.clone();
                steppedPos.y = maxTopY - feetOffset + 0.022;
                const afterCols = this.getCollisions(body, steppedPos);
                for (let i = 0; i < afterCols.length; i++) {
                    const b = afterCols[i].collider.getBox(afterCols[i].position);
                    if (b.max.y > maxTopY + 0.32) return false; // Would hit a wall/ceiling after stepping up
                }
                body.position.copy(steppedPos);
                body.isGrounded = true;
                return true;
            };

            const nextPosX = body.position.clone();
            nextPosX.x += body.velocity.x * deltaTime;
            
            const colsX = this.getCollisions(body, nextPosX);
            if (colsX.length > 0) {
                if (!tryStepUp(nextPosX, colsX)) {
                    if (body.restitution > 0) body.velocity.x *= -body.restitution;
                    else body.velocity.x = 0;
                    
                    body.handleCollisions(colsX, 'X');
                }
            } else {
                body.position.x = nextPosX.x;
            }

            const nextPosZ = body.position.clone();
            nextPosZ.z += body.velocity.z * deltaTime;

            const colsZ = this.getCollisions(body, nextPosZ);
            if (colsZ.length > 0) {
                if (!tryStepUp(nextPosZ, colsZ)) {
                    if (body.restitution > 0) body.velocity.z *= -body.restitution;
                    else body.velocity.z = 0;

                    body.handleCollisions(colsZ, 'Z');
                }
            } else {
                body.position.z = nextPosZ.z;
            }

            // Smoothly follow sculpted landscape heightfields (hills & valleys)
            if (body.collider && body.collider.enabled && body.velocity.y <= 0.1) {
                const landY = this._sampleHighestLandscapeY(body, body.position.x, body.position.z);
                if (landY !== null) {
                    const pBox = body.collider.getBox(body.position);
                    const feetOffset = pBox.min.y - body.position.y;
                    const feetY = pBox.min.y;
                    if (feetY < landY + 0.02 && landY - feetY <= 0.45) {
                        body.position.y = landY - feetOffset + 0.002;
                        body.velocity.y = 0;
                        body.isGrounded = true;
                    }
                }
            }

            if (body.isGrounded && body.friction > 0) {
                const frictionFactor = Math.pow(1 - body.friction, deltaTime * 60);
                body.velocity.x *= frictionFactor;
                body.velocity.z *= frictionFactor;
                if (Math.abs(body.velocity.x) < 0.05) body.velocity.x = 0;
                if (Math.abs(body.velocity.z) < 0.05) body.velocity.z = 0;
            }
        });
    }

    _sampleLandscapeY(otherBody, worldX, worldZ) {
        const ud = otherBody.transform?.userData;
        const ld = ud?.landscapeData;
        if (!ld || !ld.heights) return null;
        const boxSize = ud.boxSize;
        if (!Array.isArray(boxSize)) return null;
        const [w, h, d] = boxSize;
        const sx = Math.abs(otherBody.transform?.scale?.x ?? 1);
        const sy = Math.abs(otherBody.transform?.scale?.y ?? 1);
        const sz = Math.abs(otherBody.transform?.scale?.z ?? 1);
        const lx = (worldX - otherBody.position.x) / sx;
        const lz = (worldZ - otherBody.position.z) / sz;
        const halfW = w * 0.5;
        const halfD = d * 0.5;
        if (lx < -halfW || lx > halfW || lz < -halfD || lz > halfD) return null;

        const { segX, segZ, heights } = ld;
        const gx = ((lx + halfW) / w) * segX;
        const gz = ((lz + halfD) / d) * segZ;
        const x0 = Math.max(0, Math.min(segX, Math.floor(gx)));
        const z0 = Math.max(0, Math.min(segZ, Math.floor(gz)));
        const x1 = Math.min(segX, x0 + 1);
        const z1 = Math.min(segZ, z0 + 1);
        const fx = gx - x0;
        const fz = gz - z0;
        const cols = segX + 1;
        const h00 = heights[z0 * cols + x0] || 0;
        const h10 = heights[z0 * cols + x1] || 0;
        const h01 = heights[z1 * cols + x0] || 0;
        const h11 = heights[z1 * cols + x1] || 0;
        const hx0 = h00 + (h10 - h00) * fx;
        const hx1 = h01 + (h11 - h01) * fx;
        const hOff = hx0 + (hx1 - hx0) * fz;
        return otherBody.position.y + (h * 0.5 + hOff) * sy;
    }

    _sampleHighestLandscapeY(excludeBody, worldX, worldZ) {
        let best = null;
        for (let i = 0; i < this.rigidBodies.length; i++) {
            const b = this.rigidBodies[i];
            if (b === excludeBody || !b.collider || !b.collider.enabled) continue;
            if (!b.transform?.userData?.landscapeData) continue;
            const y = this._sampleLandscapeY(b, worldX, worldZ);
            if (y !== null && (best === null || y > best)) best = y;
        }
        return best;
    }

    getCollisions(playerBody, nextPos) {
        const collisions = [];
        if (!playerBody.collider || !playerBody.collider.enabled) return collisions;

        const playerBox = playerBody.collider.getBox(nextPos);
        playerBox.expandByScalar(-0.02);

        const curBox = playerBody.collider.getBox(playerBody.position);
        curBox.expandByScalar(-0.02);
        const otherCenter = new THREE.Vector3();

        this.rigidBodies.forEach(otherBody => {
            if (otherBody === playerBody || !otherBody.collider || !otherBody.collider.enabled) return;
            // Broadphase AABB filter accounting for collider extents (so large ground slabs are never skipped)
            const col = otherBody.collider;
            if (col.halfSize) {
                const sx = Math.abs(otherBody.transform?.scale?.x ?? 1);
                const sz = Math.abs(otherBody.transform?.scale?.z ?? 1);
                const reach = col.halfSize.x * sx + col.halfSize.z * sz
                    + Math.abs(col.offset?.x || 0) + Math.abs(col.offset?.z || 0) + 2.0;
                if (Math.abs(otherBody.position.x - nextPos.x) > reach ||
                    Math.abs(otherBody.position.z - nextPos.z) > reach) return;
            }

            const otherBox = otherBody.collider.getBox(otherBody.position);
            if (otherBody.transform?.userData?.landscapeData) {
                const landY = this._sampleLandscapeY(otherBody, nextPos.x, nextPos.z);
                if (landY !== null) {
                    otherBox.max.y = landY;
                    otherBox.min.y = Math.min(otherBox.min.y, landY - 1.0);
                }
            }
            
            if (playerBox.intersectsBox(otherBox)) {
                // If already overlapping this collider at current position, allow movement that increases distance from its center
                if (curBox.intersectsBox(otherBox)) {
                    otherBox.getCenter(otherCenter);
                    const curDistSq = (playerBody.position.x - otherCenter.x) ** 2 + (playerBody.position.z - otherCenter.z) ** 2;
                    const nextDistSq = (nextPos.x - otherCenter.x) ** 2 + (nextPos.z - otherCenter.z) ** 2;
                    if (nextDistSq > curDistSq + 1e-6) {
                        return;
                    }
                }
                collisions.push(otherBody);
            }
        });
        
        return collisions;
    }
}

export default PhysicsEngine;