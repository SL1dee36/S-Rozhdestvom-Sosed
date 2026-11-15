import { Component } from '../core/Component.js';
import { BoxCollider } from './Colliders.js';
import * as THREE from 'three';

export class RigidBody extends Component {
    constructor(gameObject, options = {}) {
        super(gameObject);
        this.bodyType = options.bodyType || 'dynamic'; 
        this.velocity = new THREE.Vector3();
        this.isGrounded = false;
        
        this.useGravity = options.useGravity !== undefined ? options.useGravity : true;
        this.friction = options.friction || 0;
        this.restitution = options.restitution || 0;

        this.position = this.transform.position; 
    }

    start() {
        this.collider = this.gameObject.getComponent(BoxCollider);
        this.engine.physicsEngine.addRigidBody(this);
    }

    handleCollisions(others, axis) {
        this.gameObject.components.forEach(comp => {
            if (comp.onCollision) {
                others.forEach(other => comp.onCollision(other, axis));
            }
        });
    }
}

export default RigidBody;