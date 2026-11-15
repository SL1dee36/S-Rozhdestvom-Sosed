export class Component {
    constructor(gameObject) {
        this.gameObject = gameObject;
        this.transform = gameObject.transform;
        this.engine = null;
    }

    start() {
    }

    update(deltaTime) {
    }
}

export default Component;