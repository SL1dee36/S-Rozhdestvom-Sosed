import * as THREE from 'three';

export class GameObject {
    constructor(name = 'GameObject') {
        this.name = name;
        this.transform = new THREE.Object3D();
        this.components = [];
        this.engine = null;
    }

    addComponent(ComponentClass, ...args) {
        const component = new ComponentClass(this, ...args);
        
        this.components.push(component);
        if (this.engine) {
            component.engine = this.engine;
            component.start();
        }
        return component;
    }
    
    getComponent(ComponentClass) {
        return this.components.find(c => c instanceof ComponentClass);
    }

    start() {
        this.components.forEach(c => {
            c.engine = this.engine;
            c.start();
        });
    }

    update(deltaTime) {
        this.components.forEach(c => c.update(deltaTime));
    }
}

export default GameObject;