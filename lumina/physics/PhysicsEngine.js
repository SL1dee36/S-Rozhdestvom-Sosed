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

            const nextPosX = body.position.clone();
            nextPosX.x += body.velocity.x * deltaTime;
            
            const colsX = this.getCollisions(body, nextPosX);
            if (colsX.length > 0) {
                if (body.restitution > 0) body.velocity.x *= -body.restitution;
                else body.velocity.x = 0;
                
                body.handleCollisions(colsX, 'X');
            } else {
                body.position.x = nextPosX.x;
            }

            const nextPosZ = body.position.clone();
            nextPosZ.z += body.velocity.z * deltaTime;

            const colsZ = this.getCollisions(body, nextPosZ);
            if (colsZ.length > 0) {
                if (body.restitution > 0) body.velocity.z *= -body.restitution;
                else body.velocity.z = 0;

                body.handleCollisions(colsZ, 'Z');
            } else {
                body.position.z = nextPosZ.z;
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
            
            const otherBox = otherBody.collider.getBox(otherBody.position);
            
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