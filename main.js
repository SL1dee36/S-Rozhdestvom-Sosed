import * as THREE from 'three';
import { Engine, GameObject, BoxCollider, RigidBody } from './lumina/index.js?v=2';
import { KhrushchevkaBuilder } from './src/world/KhrushchevkaBuilder.js?v=2';
import { PlayerController } from './src/game/PlayerController.js?v=2';
import { MonsterAI } from './src/game/MonsterAI.js?v=2';
import { UIManager } from './src/game/UIManager.js?v=2';
import { StoryDirector } from './src/game/StoryDirector.js?v=2';

const engine = new Engine('gameCanvas');

const world = new KhrushchevkaBuilder(engine).build();
world.crtTV.update(0.1);

const playerGO = new GameObject('Player');
playerGO.transform.position.copy(world.playerSpawn.position);
playerGO.addComponent(BoxCollider, new THREE.Vector3(0.46, 1.70, 0.46), new THREE.Vector3(0, 0.85, 0));
playerGO.addComponent(RigidBody, { bodyType: 'dynamic', useGravity: true, friction: 0.0 });
const playerCtrl = playerGO.addComponent(PlayerController, world);
engine.addGameObject(playerGO);
engine.setPlayer(playerGO);

const monsterGO = new GameObject('Monster');
const monsterAI = monsterGO.addComponent(MonsterAI, world, playerCtrl);
engine.addGameObject(monsterGO);

const ui = new UIManager(engine);
const director = new StoryDirector(engine, world, playerCtrl, monsterAI, ui);

ui.callbacks.onNewGame = () => {
    director.startNewGame();
};
ui.callbacks.onLoadCheckpoint = () => {
    director.loadCheckpoint2345();
};
ui.callbacks.onResume = () => {
    ui.showGameplayHUD();
};
ui.callbacks.onQuitToMenu = () => {
    director.stopAllAudioLoops();
};

ui.callbacks.onEnterMainMenu = () => {
    director.setupMainMenuScene();
};
ui.callbacks.onSensitivityChange = (mult) => {
    playerCtrl.setSensitivityMultiplier(mult);
};
playerCtrl.setSensitivityMultiplier(ui.getSensitivityMultiplier());

engine.inputManager.onPauseToggle = (paused) => {
    if (paused && director.phase !== 'menu' && director.phase !== 'ended') {
        ui.showPauseMenu();
    }
};

engine.addUpdateCallback((deltaTime) => {
    director.update(deltaTime);
});

ui.applyVHSIntensity(0.2);
ui.showMainMenu();
engine.start();
